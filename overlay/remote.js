/* LevelUP Remote: lets the scorekeeper (on a phone, anywhere in the lab) run OBS on a streaming PC.
   Add overlay/remote.html as a Browser Source in OBS (any scene, any size; it draws nothing on stream) and set:
     - Page permissions: "Advanced access to OBS" (switch scenes, save and start the replay buffer)
     - "Shutdown source when not visible": OFF, so it keeps listening when its scene isn't on air.
   It reports the scene list and the scene on air to obsState/{station}, and carries out commands the scorekeeper puts
   on the station (public/broadcast): {cmd:{id, at, type:"scene"|"replay"|"pov"|"read", …}}. It also runs the scoreboard
   reader (sbread.js) when the scorekeeper turns it on.
   ?station=2 for the second streaming PC. ?debug=1 shows its status on screen. */
import {backend, sendLiveStats} from "../assets/matches.js?v=24";

const q = new URLSearchParams(location.search), STATION = q.get("station") || "1", OBS = window.obsstudio;
const log = document.getElementById("log"), say = msg => { if (log && q.get("debug")) log.textContent = msg; console.log("[LevelUP Remote] " + msg); };
const call = (fn, ...a) => new Promise(res => { try { if (!OBS?.[fn]) return res(null); OBS[fn](...a, v => res(v)); } catch(e){ res(null); } });

const state = {level:0, scenes:[], current:"", replayBuffer:false, streaming:false, recording:false, reader:""};
let be = null, lastSent = "", seen = new Set(), backTimer = null;

async function refresh(){
  if (!OBS) return;
  state.level = +(await call("getControlLevel")) || 0;
  const scenes = await call("getScenes"); if (Array.isArray(scenes)) state.scenes = scenes.map(String).slice(0, 40);
  const cur = await call("getCurrentScene"); if (cur?.name) state.current = String(cur.name);
  const st = await call("getStatus"); if (st){ state.replayBuffer = !!st.replaybuffer; state.streaming = !!st.streaming; state.recording = !!st.recording; }
  /* instant replay needs the replay buffer running; start it if OBS allows */
  if (!state.replayBuffer && state.level >= 4 && OBS.startReplayBuffer && !refresh.triedRB){ refresh.triedRB = true; try { OBS.startReplayBuffer(); } catch(e){} }
  publish();
}
/* Tell the scorekeeper what OBS looks like: on any change, and every 20 seconds so it knows the remote is alive. */
let beatAt = 0;
function publish(force){
  if (!be) return;
  const doc = {scenes:state.scenes.join("\n").slice(0, 4000), current:state.current.slice(0, 120), replayBuffer:state.replayBuffer, streaming:state.streaming, recording:state.recording, level:state.level, reader:state.reader.slice(0, 120)};
  const key = JSON.stringify(doc);
  if (!force && key === lastSent && Date.now() - beatAt < 20000) return;
  lastSent = key; beatAt = Date.now();
  be.setObs(STATION, {...doc, at:new Date().toISOString()}).catch(e => say("Couldn't report to the scorekeeper: " + (e.message || e)));
  say(`Station ${STATION} · OBS access level ${state.level}${state.level < 4 ? " (needs Advanced: Browser Source > Page permissions)" : ""} · on air: ${state.current} · replay buffer ${state.replayBuffer ? "on" : "off"}`);
}

function setScene(name){
  if (!name) return;
  if (state.level < 4){ say("Can't switch scenes: set this Browser Source's Page permissions to Advanced access to OBS."); return; }
  if (!state.scenes.includes(name)) say(`No scene called "${name}" in OBS.`);
  OBS.setCurrentScene(name);
}
/* Instant replay: save the replay buffer, cut to the replay scene once the clip is written, then back after `back` seconds
   (only if nobody has switched scenes in the meantime). The LevelUP Relay picks up the saved clip for the replay screen. */
function instantReplay(c){
  const from = state.current;
  if (!OBS?.saveReplayBuffer){ say("This OBS can't save replays from a browser source."); return; }
  if (!state.replayBuffer && state.level >= 4) try { OBS.startReplayBuffer(); } catch(e){}
  let done = false;
  const go = () => { if (done) return; done = true; window.removeEventListener("obsReplaybufferSaved", go);
    if (!c.scene) return;
    setScene(c.scene); clearTimeout(backTimer);
    if (+c.back > 0 && from && from !== c.scene) backTimer = setTimeout(() => { if (state.current === c.scene) setScene(from); }, +c.back * 1000); };
  window.addEventListener("obsReplaybufferSaved", go);
  setTimeout(go, 2500);   // older OBS doesn't send the saved event
  OBS.saveReplayBuffer();
}
/* POV picker: hiding and showing sources needs OBS's WebSocket, which the LevelUP Relay on this PC has. */
const RELAY = "http://localhost:" + (q.get("relay") || "49124");
function pov(c){
  const qs = new URLSearchParams({id:c.id, seats:(c.seats || []).join(",")}); ["main", "left", "right"].forEach(k => { if (c[k]) qs.set(k, c[k]); });
  fetch(`${RELAY}/pov?${qs}`, {cache:"no-store"}).then(r => r.json()).then(j => { if (!j.ok) say("POV: " + (j.why || "the relay couldn't switch it")); }).catch(() => say("POV: start the LevelUP Relay on this PC to switch cameras."));
}
/* ---------- scoreboard reader ----------
   When the scorekeeper turns it on for this station (station.reader = {on, live, game}), it looks at each player's
   camera source in turn (the POV seats, or station.readSrc) every couple of seconds. When a scoreboard is up it reads
   it: the mid-map scoreboard (only if live is on) and the end-of-map results screen. What it read goes to the
   scorekeeper (liveStats/{matchId}_tab or _final). A "read" command reads right away. */
let station = {}, rd = null, readBusy = false, rdNext = 0, rdI = 0, lastTab = 0, lastFinal = "";
const sources = () => { const n = Math.max(0, Math.min(6, +station.seatsN || 0)); const seats = Array.from({length:n}, (_, i) => String(station.seatSrc?.[i] || `POV ${i + 1}`));
  return seats.length ? seats : [station.readSrc || "Game"]; };
const ago = () => new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit", second:"2-digit"});
async function readOnce(force){
  const R = station.reader || {}; if (readBusy || !station.matchId || !(R.on || force)) return;
  readBusy = true;
  try {
    rd = rd || await import("./sbread.js?v=2");
    if (!rd.LAYOUTS[R.game]){ state.reader = `No scoreboard layout for ${R.game || "this game"} yet`; return; }
    const list = sources(), tries = force ? list.length : 1;
    for (let k = 0; k < tries; k++){
      const src = list[rdI++ % list.length];
      let ctx; try { ctx = await rd.grab(RELAY, src); } catch(e){ state.reader = `Can't see ${src}: ${e.message}`; continue; }
      const kind = await rd.detect(ctx, R.game);
      if (!kind || (kind === "tab" && !R.live && !force) || (kind === "tab" && !force && Date.now() - lastTab < 6000)) continue;
      const got = await rd.read(ctx, R.game, kind); if (!got || (!got.us.length && !got.them.length)) continue;
      const key = JSON.stringify(got); if (kind === "final" && key === lastFinal && !force) continue;
      if (kind === "tab") lastTab = Date.now(); else lastFinal = key;
      await sendLiveStats({matchId:station.matchId, kind, at:new Date().toISOString(), src, us:got.us, them:got.them});
      state.reader = `${kind === "final" ? "Results screen" : "Scoreboard"} read from ${src} at ${ago()}`; say(state.reader);
      break;
    }
    if (force && !/read from/.test(state.reader)) state.reader = `No scoreboard on screen (${ago()})`;
  } catch(e){ state.reader = "Reader: " + (e.message || e); say(state.reader); }
  finally { readBusy = false; publish(); }
}
setInterval(() => { if (station.reader?.on && Date.now() >= rdNext){ rdNext = Date.now() + 2500; readOnce(false); } }, 500);

function run(c){
  if (!c?.id || seen.has(c.id) || Date.now() - new Date(c.at).getTime() > 15000) return;
  seen.add(c.id);
  if (c.type === "scene") setScene(c.scene);
  else if (c.type === "replay") instantReplay(c);
  else if (c.type === "pov") pov(c);
  else if (c.type === "read") readOnce(true);
}

(async () => {
  if (!OBS){ say("Open this page as a Browser Source inside OBS. It can't control OBS from a normal browser."); }
  be = await backend();
  ["obsSceneChanged", "obsReplaybufferStarted", "obsReplaybufferStopped", "obsStreamingStarted", "obsStreamingStopped", "obsRecordingStarted", "obsRecordingStopped"].forEach(ev =>
    window.addEventListener(ev, e => { if (ev === "obsSceneChanged" && e.detail?.name) state.current = String(e.detail.name); refresh(); }));
  be.watchBroadcast(b => { station = b?.stations?.[STATION] || {}; run(station.cmd); });
  await refresh();
  setInterval(refresh, 5000);   // picks up scenes added or renamed in OBS
  setInterval(() => publish(), 20000);
})();
