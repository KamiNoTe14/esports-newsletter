/* Live game data from Rocket League. Two sources are understood:
   1. The official Rocket League Stats API (built into the game since the April 2026 update). Turned on in
      <Rocket League>/TAGame/Config/TAStatsAPI.ini (or DefaultStatsAPI.ini) with PacketSendRate > 0; it serves a
      WebSocket on ws://localhost:49124 ("WebPort"). Messages look like {"Event":"UpdateState","Data":{...}}.
   2. The older SOS BakkesMod plugin (ws://localhost:49122, or its relay on 49322). BakkesMod stopped working with
      Rocket League's Easy Anti-Cheat update (April 28, 2026), so this is only for old installs and offline setups.
   Both are turned into the same SOS-style events ("game:update_state", "game:goal_scored", ...) for the overlay.
   Nothing is sent back to the game. This only listens. */
const EVENTS = ["game:update_state", "game:goal_scored", "game:match_ended", "game:match_destroyed", "game:initialized",
  "game:replay_start", "game:replay_will_end", "game:replay_end", "game:round_started_go", "game:statfeed_event", "game:podium_start"];

/* Chrome 147+ makes a public website ask before it talks to a program on this PC ("Local network access").
   WebSockets don't always show that prompt by themselves, so a throwaway request to the same address is made
   first: that request shows the prompt, and once allowed the WebSocket goes through too. */
export async function localAccessState(){
  for (const name of ["local-network-access", "loopback-network", "local-network"]){
    try { const st = await navigator.permissions.query({name}); return st.state; } catch(e){}
  }
  return "";
}
export function askLocalAccess(address){
  const host = String(address).replace(/^wss?:\/\//, "").split("/")[0];
  const loop = /^(localhost|127\.|\[::1\])/.test(host);
  try { return fetch(`http://${host}/`, {mode:"no-cors", cache:"no-store", targetAddressSpace:loop ? "loopback" : "local"}).catch(() => {}); } catch(e){ return Promise.resolve(); }
}

/* ---- official Stats API -> SOS-style events ---- */
const kphFrom = v => { v = +v || 0; return v > 300 ? v * 0.036 : v; };   // the docs say Unreal units/s; samples look like km/h
const pkey = p => (p?.Name || "") + "_" + (p?.Shortcut ?? "");
let lastGame = null;
function fromStatsAPI(ev, d){
  if (typeof d === "string"){ try { d = JSON.parse(d); } catch(e){ d = {}; } }
  d = d || {};
  switch (ev){
    case "UpdateState": {
      const g = d.Game || {}, teams = g.Teams || [];
      const players = {}; (d.Players || []).forEach(p => { players[pkey(p)] = {id:pkey(p), name:p.Name, team:p.TeamNum, score:p.Score, goals:p.Goals, shots:p.Shots,
        assists:p.Assists, saves:p.Saves, touches:p.Touches, demos:p.Demos, boost:p.Boost ?? 0, speed:p.Speed, isDead:!!p.bDemolished}; });
      const tgt = g.bHasTarget && g.Target && g.Target.Name ? pkey(g.Target) : "";
      lastGame = {teams:[0, 1].map(i => ({score:(teams.find(t => t.TeamNum === i) || teams[i] || {}).Score ?? 0, name:(teams.find(t => t.TeamNum === i) || {}).Name || ""})),
        time_seconds:g.TimeSeconds ?? 300, isOT:!!g.bOvertime, isReplay:!!g.bReplay, hasWinner:!!g.bHasWinner, winner:g.Winner || "", hasTarget:!!tgt, target:tgt, arena:g.Arena};
      return ["game:update_state", {hasGame:teams.length > 0, game:lastGame, players}];
    }
    case "ClockUpdatedSeconds":
      if (!lastGame) return null;
      lastGame = {...lastGame, time_seconds:d.TimeSeconds ?? lastGame.time_seconds, isOT:d.bOvertime ?? lastGame.isOT};
      return ["game:clock", lastGame];
    case "GoalScored":
      return ["game:goal_scored", {scorer:{name:d.Scorer?.Name || "", teamnum:d.Scorer?.TeamNum}, assister:d.Assister ? {name:d.Assister.Name || ""} : null, goalspeed:kphFrom(d.GoalSpeed)}];
    case "GoalReplayStart": return ["game:replay_start", {}];
    case "GoalReplayEnd": return ["game:replay_end", {}];
    case "MatchEnded": return ["game:match_ended", {winner_team_num:d.WinnerTeamNum}];
    case "MatchDestroyed": lastGame = null; return ["game:match_destroyed", {}];
    case "MatchCreated": case "MatchInitialized": return ["game:initialized", {}];
    case "RoundStarted": return ["game:round_started_go", {}];
    case "PodiumStart": return ["game:podium_start", {}];
    case "StatfeedEvent": return ["game:statfeed_event", {event_name:d.EventName, type:d.Type, main_target:{name:d.MainTarget?.Name, team_num:d.MainTarget?.TeamNum}}];
    default: return null;
  }
}

export function connectSOS(address, on){
  const url = /^wss?:\/\//.test(address) ? address : "ws://" + address;
  let ws = null, alive = true, timer = null, tries = 0, asked = false;
  const retry = () => { if (!alive) return; clearTimeout(timer); timer = setTimeout(open, 3000); };
  function open(){
    tries++; on.attempt?.(tries);
    if (!asked){ asked = true; askLocalAccess(url); }
    try { ws = new WebSocket(url); } catch(e){ on.error?.(String(e.message || e)); retry(); return; }
    ws.onopen = () => {
      /* Only the SOS relay (49322) needs to be told which events to forward; nothing is sent to the game itself. */
      if (/:49322(\/|$)/.test(url)) EVENTS.forEach(ev => { try { ws.send(JSON.stringify({event:"wsRelay:register", data:ev})); } catch(e){} });
      on.status?.(true);
    };
    ws.onclose = ev => { on.status?.(false, ev.code); retry(); };
    ws.onerror = () => {};
    ws.onmessage = e => {
      let txt = typeof e.data === "string" ? e.data : "";
      if (!txt) return;
      if (txt[0] !== "{"){ try { txt = atob(txt); } catch(err){ return; } }   // some plugin builds send base64
      let msg; try { msg = JSON.parse(txt); } catch(err){ return; }
      if (msg && msg.Event){ const out = fromStatsAPI(msg.Event, msg.Data); if (out) on.event?.(out[0], out[1]); return; }
      if (msg && msg.event) on.event?.(msg.event, msg.data);
    };
  }
  open();
  return () => { alive = false; clearTimeout(timer); try { ws?.close(); } catch(e){} };
}
