/* LevelUP overlays. Each overlay page is an OBS Browser Source (1920 x 1080) that follows one streaming station:
   ?station=1 (default). The scorekeeper decides which match is on each station; every overlay updates itself live.
   Layers: scorebug, vs, lineups, team-compare, player-compare. Add ?bg=1 to see an overlay on a grey test background. */
import {gameFor, oppShort, roundLabel, postseason, seasonOf, shortSchool, slug, fmtStat, fmtTime, listOf} from "../assets/matches.js?v=16";
import {watchBroadcast, watchMatch, watchFinals} from "../assets/live.js?v=24";
import {connectSOS, localAccessState, askLocalAccess} from "./sos.js?v=3";

const q = new URLSearchParams(location.search);
const STATION = q.get("station") || "1", LAYER = document.body.dataset.layer;
if (q.get("bg")) document.body.classList.add("bg");
/* Player cards sit above the stream ticker by default; ?cardY=36 puts them at the very bottom when there's no ticker. */
if (q.get("cardY")) document.documentElement.style.setProperty("--card-y", (+q.get("cardY") || 0) + "px");
const BASE = new URL("../", import.meta.url).href;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const src = p => !p ? "" : /^https?:/.test(p) ? p : BASE + String(p).replace(/^\/+/, "");
const app = document.getElementById("app");
/* Only touch the page when something changed. The first draw (or a replay) gets class "enter", which plays the
   entrance animation; later updates redraw quietly and only the part that changed animates. */
let lastHTML = "", enterUntil = 0, held = null;
const ENTRANCE_MS = 2600;   // longest entrance; updates that land during it wait so they don't cut it short
const out = {set html(h){
  if (h === lastHTML) return;
  const first = !lastHTML;
  if (!first && Date.now() < enterUntil){ clearTimeout(held); held = setTimeout(() => { held = null; app.innerHTML = h; }, enterUntil - Date.now()); lastHTML = h; return; }
  lastHTML = h; app.innerHTML = h;
  if (first){ app.firstElementChild?.classList.add("enter"); enterUntil = Date.now() + ENTRANCE_MS; countUp(); }
}};
/* Numbers on comparison rows count up from zero during the entrance. */
function countUp(){
  app.querySelectorAll("[data-count]").forEach((el, i) => {
    const txt = el.textContent, m = /^([#]?)([\d,]*\.?\d+)(%?)$/.exec(txt.trim()); if (!m) return;
    const end = parseFloat(m[2].replace(/,/g, "")), dec = (m[2].split(".")[1] || "").length, delay = 1150 + (+el.dataset.count || 0) * 90, dur = 900;
    const show = v => el.textContent = m[1] + v.toLocaleString("en-US", {minimumFractionDigits:dec, maximumFractionDigits:dec}) + m[3];
    show(0); const t0 = performance.now() + delay;
    const step = now => { const k = Math.min(1, Math.max(0, (now - t0) / dur)); show(end * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); else el.textContent = txt; };
    requestAnimationFrame(step);
  });
}

let site = {};
try { site = await (await fetch(BASE + "data/site.json?v=" + Date.now(), {cache:"no-store"})).json(); } catch(e){}
const P = site.program || {};
const US = {short:shortSchool(P.school || P.name || "Home"), logo:P.logo || "assets/logo-team.png"};

let station = {}, match = null, finals = [], stopMatch = null, people = new Map();
(site.teams || []).forEach(t => (t.roster || []).forEach(p => p.id && people.set(p.id, p)));

/* ---------- helpers ---------- */
const nameOf = p => { const r = people.get(p.id) || p; return r.private || !r.name ? (r.tag || p.tag || "Player") : r.name; };
const tagOf = p => (people.get(p.id) || p).private ? "" : ((people.get(p.id) || p).tag || p.tag || "");
const monogram = t => esc(String(t || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 3).toUpperCase());
const logoHTML = (img, name) => `<div class="logo">${img ? `<img src="${esc(src(img))}" alt="" onerror="this.parentElement.innerHTML='<div class=&quot;mono${monogram(name).length > 2 ? " m3" : ""}&quot;>${monogram(name)}</div>'">` : `<div class="mono${monogram(name).length > 2 ? " m3" : ""}">${monogram(name)}</div>`}</div>`;
function eventLine(m){
  const ev = String(m.event || m.league || "").replace(/\b(Fall|Spring|Winter|Summer)\s+20(\d\d)\b/i, (_, s, y) => `${s} '${y}`);
  const r = postseason(m)?.label || roundLabel(m, false) || "";
  return [ev, r].filter(Boolean).join(" · ");
}
/* Both sides, already in screen order (left, right). Station "swap" puts us on the right. */
function sides(m){
  /* Who's playing right now: the current game's lineup, or the latest game that has one (1v1 sets carry over). */
  const g = gameFor(site, m.game), withP = (m.games || []).filter(x => x.p && Object.keys(x.p).length && x.n <= (m.current || 1)).sort((a, b) => b.n - a.n);
  const cur = (m.games || []).find(x => x.n === m.current && x.p && Object.keys(x.p).length) || withP[0] || {};
  const ourNow = cur.p ? Object.keys(cur.p) : [];
  const ourPlayer = g.teamSize === 1 || /solo/i.test(m.teamName) || (ourNow.length === 1 && ((m.players || []).length > 1 || +g.teamSize > 1)) ? (m.players || []).find(p => p.id === ourNow[0]) : null;
  const charOf = id => cur.p?.[id]?.hero;
  const us = {name:US.short, team:m.teamName, logo:US.logo, score:m.score?.us ?? 0, won:(m.games || []).filter(x => x.winner === "us").length,
    now:ourPlayer ? {name:tagOf(ourPlayer) || nameOf(ourPlayer), char:charOf(ourPlayer.id)} : null, us:true};
  const them = {name:oppShort(m), team:m.opponent?.team || "", school:m.opponent?.school || "", logo:station.oppLogo || m.opponent?.logo || "", score:m.score?.them ?? 0,
    won:(m.games || []).filter(x => x.winner === "them").length, now:station.oppNow ? {name:station.oppNow, char:station.oppChar} : null};
  return station.swap ? [them, us] : [us, them];
}
function charImg(g, name){
  const dir = String(g.charArt || g.charIcons || "").replace(/\/$/, ""); if (!dir || !name) return "";
  return BASE + dir + "/" + slug(name) + (g.key === "marvel-rivals" ? "-face.webp" : "-logo.webp");
}
/* Gold claw slashes, like the ones on the program's thumbnails. */
const CLAW_D = ["M560,10 L538,21 L515,30 L491,39 L470,50 L455,70 L433,81 L412,92 L391,105 L372,120 L354,136 L334,149 L309,155 L291,172 L272,186 L262,213 L243,228 L229,248 L208,261 L192,280 L176,298 L159,315 L140,330 L140,330 L159,315 L180,303 L203,293 L223,281 L244,268 L264,254 L285,243 L306,231 L325,216 L344,202 L361,184 L382,173 L400,156 L418,141 L441,132 L457,112 L476,98 L495,83 L509,62 L528,47 L545,30 L560,10Z", "M600,60 L578,69 L560,81 L539,91 L523,107 L505,120 L482,127 L466,143 L446,154 L433,173 L411,181 L400,203 L384,218 L367,232 L348,245 L333,261 L317,277 L299,290 L284,306 L273,328 L261,348 L247,365 L230,380 L230,380 L247,365 L265,353 L285,342 L304,329 L324,319 L345,310 L358,291 L380,281 L398,268 L411,249 L432,239 L446,222 L469,214 L480,193 L501,183 L511,161 L527,146 L542,129 L559,115 L573,97 L589,81 L600,60Z", "M590,170 L575,177 L558,182 L546,192 L528,195 L513,202 L508,220 L493,227 L479,236 L470,248 L460,262 L444,267 L427,271 L419,286 L412,302 L402,314 L390,325 L378,336 L372,352 L360,363 L351,376 L342,390 L330,400 L330,400 L342,390 L356,381 L370,374 L382,364 L396,355 L412,350 L425,341 L434,327 L447,318 L462,311 L475,302 L483,287 L496,278 L507,266 L521,259 L527,242 L541,233 L550,220 L561,209 L572,197 L582,185 L590,170Z"];
const claw = cls => `<svg class="claw ${cls || ""}" viewBox="0 0 640 430" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="sh" transform="translate(-10 12)">${CLAW_D.map(d => `<path d="${d}"/>`).join("")}</g><g>${CLAW_D.map(d => `<path d="${d}"/>`).join("")}</g></svg>`;
/* Hand-brushed underline drawn under titles. */
const BRUSH = `<svg viewBox="0 0 600 26" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M8 17 C 120 6, 260 4, 380 9 S 560 14, 592 8"/></svg>`;
/* Shrink long team names so "Byron Center" fits instead of being cut off (Anton is about half an em per letter). */
const fitName = (name, max, room) => Math.max(24, Math.min(max, Math.floor(room / (String(name || "").length * .5 || 1))));
const gameLogo = g => g.icon ? src(g.icon) : "";
/* Background artwork for full-screen graphics: this team's photo/art first, then the game's. */
const artFor = (m, g) => src((site.teams || []).find(t => t.id === m.teamId)?.art || g.art || "");
/* Full-screen frame: background art, hazard corners, claw slashes, game logo, then a title built like the program's
   graphics: big distressed block letters with a brush-script word slashed across the bottom corner, with a gold brush stroke underneath. */
function frame(cls, m, g, {script = "", title = "", sub = "", body = "", foot = ""} = {}){
  const art = artFor(m, g), gl = gameLogo(g);
  return `<div class="full ${cls}">${art ? `<div class="art" style="background-image:url('${esc(art)}')"></div>` : ""}<div class="streaks"></div><div class="vig"></div><div class="texture"></div>
    <div class="haz tl"></div><div class="haz br"></div>${claw()}
    <header class="top">${gl ? `<img class="glogo" src="${esc(gl)}" alt="${esc(g.name)}">` : ""}
      ${title ? `<div class="ttl${script ? " has-script" : ""}"><span class="bk"><b class="grunge">${esc(title)}</b></span>${script ? `<i>${esc(script)}</i>` : ""}${BRUSH}</div>` : ""}${sub ? `<small>${esc(sub)}</small>` : ""}</header>
    ${body}${foot ? `<div class="foot">${foot}</div>` : ""}<div class="flash"></div></div>`;
}
const empty = msg => { clearTimeout(held); held = null; enterUntil = 0; lastHTML = ""; rlStatic = ""; app.innerHTML = q.get("bg") ? `<div class="empty">${esc(msg)}</div>` : ""; };

/* ---------- score bug (every game without a live game feed) ----------
   Same build as the Rocket League bug: big names with a team-color stripe (gold for us, steel for them), the game's
   logo in the middle with what's happening under it, "Set 2 | Best of 5" and pips underneath, a white result banner
   when a game is won, and player cards along the bottom for one-on-one games like Smash. */
let lastScores = null, banner = null, bannerTimer = null;
function scorebug(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), need = Math.floor((+m.bestOf || 1) / 2) + 1, cur = (m.games || []).find(x => x.n === m.current);
  const unit = g.unit || "Game", live = m.status === "live", fin = m.status === "final", gl = gameLogo(g);
  const decided = (m.games || []).filter(x => x.winner).length, n = fin ? Math.max(1, decided) : Math.min(+m.bestOf || 1, m.current || decided + 1);
  const pts = g.points && cur && (cur.us || cur.them) ? `${g.points} ${station.swap ? `${cur.them}–${cur.us}` : `${cur.us}–${cur.them}`}` : "";
  const state = fin ? `<b class="fin">Final</b>` : live ? `<small class="state">${esc(pts || "Live")}</small>` : `<small class="state up">${esc(m.status === "upcoming" ? fmtTime(m.startsAt) : m.status)}</small>`;
  const wing = (s, r) => { const lg = `<div class="lg">${logoHTML(s.logo, s.name)}</div>`, nm = `<div class="nm"><b style="font-size:${fitName(s.name, 62, 300)}px">${esc(s.name)}</b></div>`, sc = `<div class="sc" data-side="${r ? "r" : "l"}"><span>${s.score}</span></div>`;
    return `<div class="wing ${r ? "r" : "l"} ${s.us ? "us" : "them"}">${r ? sc + nm + lg : lg + nm + sc}${claw()}</div>`; };
  const pips = (s, rev) => `<span class="pips">${Array.from({length:need}, (_, i) => { const k = rev ? need - 1 - i : i; return `<i class="${k < s.won ? "on" : ""}" data-k="${k}"></i>`; }).join("")}</span>`;
  /* a game just won: banner for 8 seconds */
  if (lastScores && !fin) [L, R].forEach((s, i) => { if (s.won > lastScores[i].won){
    const other = i ? L : R, lead = s.won > other.won ? `Leads ${s.won}–${other.won}` : s.won === other.won ? `Series tied ${s.won}–${other.won}` : `Trails ${s.won}–${other.won}`;
    banner = {us:!!s.us, title:`${unit} ${decided}!`, name:s.name, note:lead}; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { banner = null; draw(); }, 8000); } });
  if (fin) banner = null;
  const card = (s, r) => { if (!s.now || !live || q.get("card") === "0") return ""; const pic = charImg(g, s.now.char);
    return `<div class="pcard char${r ? " r" : ""}${s.us ? " us" : " them"}"><div class="ring">${pic ? `<img src="${esc(pic)}" alt="" onerror="this.remove()">` : `<b>${monogram(s.now.name)}</b>`}</div>
      <div class="pinfo"><b>${esc(s.now.name)}</b><div class="pst"><span><em>${esc(s.now.char || "—")}</em>${esc(g.charLabel || "Character")}</span><span><em>${s.won}</em>${esc(unit)}s won</span></div></div></div>`; };
  out.html = `<div class="bug gen">
      <div class="ev">${live ? `<span class="dot"></span>` : ""}${esc(eventLine(m) || g.name)}</div>
      <div class="bar">${wing(L)}<div class="mid">${gl ? `<img src="${esc(gl)}" alt="${esc(g.name)}">` : `<span class="gname">${esc(g.short || g.name)}</span>`}${state}</div>${wing(R, true)}</div>
      <div class="sub">${pips(L)}<span>${fin ? "" : `${esc(unit)} <em>${n}</em> &nbsp;|&nbsp; `}Best of <em>${esc(m.bestOf)}</em></span>${pips(R, true)}</div>
      ${banner ? `<div class="goal"><i class="${banner.us ? "us" : "them"}"></i><b>${esc(banner.title)}</b><span>${esc(banner.name)}</span><small>${esc(banner.note)}</small></div>` : ""}
    </div>${card(L)}${card(R, true)}`;
  /* a score that just changed rolls in with a gold flash and claw; a newly won game lights its pip */
  if (lastScores){
    [["l", L, 0], ["r", R, 1]].forEach(([side, s, idx]) => {
      if (s.score !== lastScores[idx].score){ const el = app.querySelector(`.sc[data-side="${side}"]`); el?.classList.add("hit"); el?.parentElement.classList.add("hit"); }
      if (s.won > lastScores[idx].won){ const box = app.querySelectorAll(".sub .pips")[idx]; box?.querySelector(`i[data-k="${s.won - 1}"]`)?.classList.add("new"); }
    });
  }
  lastScores = [{score:L.score, won:L.won}, {score:R.score, won:R.won}];
}

/* ---------- Rocket League: live score bug fed by the game itself ----------
   Games marked liveFeed:"sos" in site.json get this bug instead: the game clock in the middle and the live goal score,
   read from Rocket League's official Stats API on the PC running the game (?feed=host:port, default localhost:49124;
   the older SOS BakkesMod plugin still works with ?feed=localhost:49122).
   The series (game 2, best of 5, pips) still comes from the scorekeeper. Blue is always on the left, like the game.
   Which color Hartland is: the station setting in the scorekeeper, or worked out from player names in the lobby. */
const SOS_ADDR = q.get("feed") || q.get("sos") || "localhost:49124";   // the game's own Stats API WebSocket
const rl = {on:false, game:null, players:{}, goal:null, replay:false, ended:false, feed:null, tries:0, code:0, perm:"", msgs:0};
const kph = v => Math.round(+v || 0);
const clock = gm => { if (!gm) return "5:00"; const t = Math.max(0, Math.round(gm.time_seconds ?? 300)); return (gm.isOT ? "+" : "") + Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); };
function startSOS(){
  if (rl.feed) return;
  let goalTimer = null;
  rl.feed = connectSOS(SOS_ADDR, {
    status(ok, code){ rl.on = ok; if (!ok){ rl.game = null; rl.code = code || 0; } draw(); },
    attempt(n){ rl.tries = n; localAccessState().then(st => { rl.perm = st; diag(); }); },
    event(ev, d){
      rl.msgs++;
      if (ev === "game:update_state"){
        rl.game = d?.hasGame ? d.game : null; rl.players = d?.players || {};
        const wasReplay = rl.replay; rl.replay = !!rl.game?.isReplay;
        if (wasReplay && !rl.replay){ rl.goal = null; }
        if (rl.game && !rl.game.hasWinner && rl.game.time_seconds > 0) rl.ended = false;
      } else if (ev === "game:clock"){
        if (rl.game){ rl.game = {...rl.game, time_seconds:d.time_seconds, isOT:d.isOT}; }
      } else if (ev === "game:goal_scored"){
        rl.goal = {name:d?.scorer?.name || "", team:+(d?.scorer?.teamnum ?? -1), assist:d?.assister?.name || "", speed:kph(d?.goalspeed)};
        clearTimeout(goalTimer); goalTimer = setTimeout(() => { rl.goal = null; draw(); }, 9000);
      } else if (ev === "game:replay_end"){ rl.goal = null; rl.replay = false; }
      else if (ev === "game:match_ended"){ rl.ended = true; }
      else if (ev === "game:match_destroyed" || ev === "game:initialized"){ rl.ended = false; rl.goal = null; }
      draw();
    }
  });
}
/* Connection status, shown only in preview (?bg=1 or ?debug=1) so problems can be seen without developer tools. */
function diag(){
  if (!(q.get("bg") || q.get("debug"))) return;
  let el = document.getElementById("sosdiag");
  if (!el){ el = document.createElement("button"); el.id = "sosdiag"; el.type = "button"; document.body.appendChild(el);
    el.onclick = () => { askLocalAccess(SOS_ADDR); setTimeout(() => localAccessState().then(st => { rl.perm = st; diag(); }), 1500); }; }
  const permTxt = {granted:"allowed", denied:"BLOCKED (lock icon > Site settings > Local network access / Apps on device > Allow)", prompt:"not asked yet (click here)"}[rl.perm] || "no permission needed by this browser";
  el.innerHTML = `<b>Game connection:</b> ${rl.on ? `connected to ws://${esc(SOS_ADDR)} ✓ (${rl.msgs} updates${rl.game ? "" : ", no match running"})` : `not connected to ws://${esc(SOS_ADDR)}, try ${rl.tries}${rl.code ? ` (closed, code ${rl.code})` : ""}`}<br><b>This site's access to apps on this PC:</b> ${permTxt}`;
}
/* Hartland's color in the lobby: 0 = blue, 1 = orange. */
function ourTeamNum(m){
  if (station.rlSide === "blue") return 0;
  if (station.rlSide === "orange") return 1;
  const ours = new Set((m.players || []).flatMap(p => [tagOf(p), nameOf(p), p.tag, p.name]).filter(Boolean).map(x => String(x).toLowerCase()));
  const hits = [0, 0]; Object.values(rl.players).forEach(p => { if (ours.has(String(p.name || "").toLowerCase())) hits[p.team === 1 ? 1 : 0]++; });
  return hits[1] > hits[0] ? 1 : 0;
}
let rlStatic = "", rlLive = null;
function rlbug(m){
  const g = gameFor(site, m.game), need = Math.floor((+m.bestOf || 1) / 2) + 1, us = ourTeamNum(m);
  const usSide = {name:US.short, logo:US.logo, won:(m.games || []).filter(x => x.winner === "us").length};
  const themSide = {name:oppShort(m), logo:station.oppLogo || m.opponent?.logo || "", won:(m.games || []).filter(x => x.winner === "them").length};
  const sides = us === 0 ? [usSide, themSide] : [themSide, usSide];   // [blue, orange]
  const decided = (m.games || []).filter(x => x.winner).length;
  const gameNo = m.status === "final" ? decided : Math.min(+m.bestOf || 1, rl.ended ? Math.max(1, decided) : decided + 1);
  const wing = (s, r) => { const lg = `<div class="lg">${logoHTML(s.logo, s.name)}</div>`, nm = `<div class="nm"><b style="font-size:${fitName(s.name, 62, 300)}px">${esc(s.name)}</b></div>`, sc = `<div class="sc" data-side="${r ? 1 : 0}"><span>0</span></div>`;
    return `<div class="wing ${r ? "r orange" : "l blue"}${(r ? 1 : 0) === us ? " us" : " them"}">${r ? sc + nm + lg : lg + nm + sc}${claw()}</div>`; };
  const pips = (s, rev) => `<span class="pips">${Array.from({length:need}, (_, i) => { const k = rev ? need - 1 - i : i; return `<i class="${k < s.won ? "on" : ""}" data-k="${k}"></i>`; }).join("")}</span>`;
  const html = `<div class="bug rl">
      <div class="ev">${rl.on && rl.game && !rl.ended ? `<span class="dot"></span>` : ""}${esc(eventLine(m) || g.name)}</div>
      <div class="bar">${wing(sides[0])}<div class="mid"><b class="clock">5:00</b><small class="state"></small></div>${wing(sides[1], true)}</div>
      <div class="sub">${pips(sides[0])}<span>${m.status === "final" ? "" : `Game <em>${gameNo}</em> &nbsp;|&nbsp; `}Best of <em>${esc(m.bestOf)}</em></span>${pips(sides[1], true)}</div>
      <div class="goal" hidden></div>
    </div>${q.get("card") === "0" ? "" : `<div class="pcard" hidden></div>`}`;
  if (html !== rlStatic){ rlStatic = html; out.html = html; rlLive = null; }
  rlUpdate(us); diag();
}
/* Clock, live score, replay and goal banner change many times a second, so they're patched in place
   (redrawing the whole bug would restart its animations). */
function rlUpdate(us){
  const gm = rl.game, root = app.querySelector(".bug.rl"); if (!root) return;
  const score = [gm?.teams?.[0]?.score ?? 0, gm?.teams?.[1]?.score ?? 0];
  const state = !rl.on ? "Waiting for game" : !gm ? "Waiting for kickoff" : rl.ended || gm.hasWinner ? "Final" : rl.replay ? "Replay" : gm.isOT ? "Overtime" : "";
  root.classList.toggle("ot", !!gm?.isOT); root.classList.toggle("replay", rl.replay); root.classList.toggle("idle", !rl.on || !gm);
  const ck = root.querySelector(".clock"); const t = rl.ended || gm?.hasWinner ? "Final" : clock(gm);
  if (ck.textContent !== t){ ck.textContent = t; ck.classList.toggle("fin", t === "Final"); }
  const st = root.querySelector(".state"); if (st.textContent !== state) st.textContent = state;
  [0, 1].forEach(i => { const el = root.querySelector(`.sc[data-side="${i}"]`), span = el.firstElementChild;
    if (span.textContent !== String(score[i])){
      const changed = rlLive && score[i] > rlLive[i]; span.textContent = score[i];
      if (changed){ el.classList.remove("hit"); el.parentElement.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); el.parentElement.classList.add("hit"); }
    } });
  rlLive = score;
  /* goal banner: scorer, assist, shot speed */
  const gl = root.querySelector(".goal"), gk = rl.goal ? JSON.stringify(rl.goal) : "";
  if (gl.dataset.k !== gk){ gl.dataset.k = gk; gl.hidden = !rl.goal;
    if (rl.goal) gl.innerHTML = `<i class="${rl.goal.team === 1 ? "orange" : "blue"}"></i><b>Goal!</b><span>${esc(rl.goal.name)}</span><small>${[rl.goal.assist ? `Assist ${esc(rl.goal.assist)}` : "", rl.goal.speed ? `${rl.goal.speed} km/h` : ""].filter(Boolean).join(" &nbsp;/&nbsp; ")}</small>`; }
  /* spectated player card */
  const pc = app.querySelector(".pcard"); if (!pc) return;
  const p = gm?.hasTarget ? rl.players[gm.target] : null, show = !!p && !rl.replay && !rl.ended;
  pc.hidden = !show; if (!show) return;
  const boost = Math.max(0, Math.min(100, Math.round(p.boost || 0))), C = 2 * Math.PI * 52;
  const key = [p.id, p.name, p.team, p.goals, p.assists, p.saves, p.shots, p.score].join("|");
  if (pc.dataset.k !== key){ pc.dataset.k = key; pc.className = `pcard ${p.team === 1 ? "orange" : "blue"}${(p.team === 1 ? 1 : 0) === us ? " us" : ""}`;
    pc.innerHTML = `<div class="ring"><svg viewBox="0 0 120 120"><circle class="bgc" cx="60" cy="60" r="52"/><circle class="fg" cx="60" cy="60" r="52" stroke-dasharray="${C.toFixed(1)}"/></svg><b>0</b><small>Boost</small></div>
      <div class="pinfo"><b>${esc(p.name)}</b><div class="pst">${[["Goals", p.goals], ["Assists", p.assists], ["Saves", p.saves], ["Shots", p.shots]].map(([k, v]) => `<span><em>${+v || 0}</em>${k}</span>`).join("")}</div></div>`; }
  const fg = pc.querySelector(".fg"); fg.style.strokeDashoffset = (C * (1 - boost / 100)).toFixed(1);
  pc.querySelector(".ring b").textContent = boost; pc.classList.toggle("maxed", boost >= 100); pc.classList.toggle("noboost", boost === 0);
}

/* ---------- season numbers ---------- */
const sameOpp = (a, m) => shortSchool(a.opponent?.school || a.opponent?.team).toLowerCase() === shortSchool(m.opponent?.school || m.opponent?.team).toLowerCase();
function record(list){ const w = list.filter(x => x.result === "W").length, l = list.filter(x => x.result === "L").length; return {w, l, text:`${w}–${l}`}; }
function teamSeason(m){ return finals.filter(x => x.teamName === m.teamName && (x.season || seasonOf(x.startsAt)) === (m.season || seasonOf(m.startsAt)) && x.id !== m.id); }
function standingFor(m){
  const g = gameFor(site, m.game), word = String(g.short || g.name || "").split(/\s+/)[0].toLowerCase();
  const key = s => String(s || "").toLowerCase().replace(/\s+high school$/, "").trim();
  for (const t of site.standings || []){
    if (word && !String(t.title || "").toLowerCase().includes(word)) continue;
    const row = (t.rows || []).find(r => !r.us && ((r.school && key(r.school) === key(m.opponent?.school)) || (r.team && key(r.team) === key(m.opponent?.team))));
    if (row) return {...row, of:(t.rows || []).length};
  }
  return null;
}

/* ---------- VS screen ---------- */
function vs(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), mine = teamSeason(m), h2h = finals.filter(x => x.game === m.game && sameOpp(x, m)), st = standingFor(m);
  const ourLine = mine.length ? `${record(mine).text} this season` : "", theirLine = st ? `${st.w}–${st.l}, #${st.rank} in the league` : "";
  const lineup = s => s.us ? (m.players || []).map(p => tagOf(p) || nameOf(p)) : listOf(station.oppLineup);
  const side = (s, c) => `<div class="side ${c}"><div class="crest"><div class="glow"></div><div class="halo"></div>${logoHTML(s.logo, s.name)}</div>
    <b>${esc(s.name)}</b><span class="team">${esc(s.us ? s.team : s.team || s.school)}</span>
    ${(s.us ? ourLine : theirLine) ? `<span class="rec">${esc(s.us ? ourLine : theirLine)}</span>` : ""}
    ${lineup(s).length ? `<div class="names">${lineup(s).map((n, i) => `<span style="--i:${i}">${esc(n)}</span>`).join("")}</div>` : ""}</div>`;
  const hh = record(h2h);
  const foot = [`Best of <em>${esc(m.bestOf)}</em>`, m.status === "upcoming" ? esc(fmtTime(m.startsAt)) : "",
    h2h.length ? (hh.w === hh.l ? `All-time series tied ${hh.w}–${hh.l}` : `All-time: ${esc(hh.w > hh.l ? US.short : oppShort(m))} leads ${Math.max(hh.w, hh.l)}–${Math.min(hh.w, hh.l)}`) : "First meeting"].filter(Boolean).join(" &nbsp;/&nbsp; ");
  out.html = frame("vs", m, g, {sub:eventLine(m), body:`${side(L, "l")}<div class="vsx"><span><b class="gold-text grunge">VS</b></span></div>${side(R, "r")}`, foot});
}

/* ---------- starting lineups ---------- */
function mainChar(m, id){
  const c = {}; (m.games || []).forEach(x => { const h = x.p?.[id]?.hero; if (h) c[h] = (c[h] || 0) + 1; });
  let best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!best){ finals.filter(x => x.game === m.game).forEach(x => (x.games || []).forEach(gm => { const h = gm.p?.[id]?.hero; if (h) c[h] = (c[h] || 0) + 1; })); best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; }
  return best || (site.profiles?.[id]?.chars || "").split(",")[0].trim() || "";
}
function mainRole(m, id){ const c = {}; (m.games || []).forEach(x => { const r = x.p?.[id]?.role; if (r) c[r] = (c[r] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || ""; }
function lineups(m){
  const g = gameFor(site, m.game), [L, R] = sides(m);
  const ours = (m.players || []).map((p, i) => { const ch = mainChar(m, p.id), role = mainRole(m, p.id), yr = site.profiles?.[p.id]?.gradYear;
    const strip = [role && g.roleIcons?.[role] ? `<img src="${esc(src(g.roleIcons[role]))}" alt="">` : "", esc([role, ch].filter(Boolean).join(" · ") || g.short || g.name)].join("");
    return `<div class="p" style="--i:${i}"><div class="pic">${charImg(g, ch) ? `<img src="${esc(charImg(g, ch))}" alt="" onerror="this.remove()">` : `<span>${monogram(nameOf(p))}</span>`}</div>
      <div class="body"><div class="strip">${strip}</div><div class="main"><b>${esc(tagOf(p) || nameOf(p))}</b><small>${esc([tagOf(p) ? nameOf(p) : "", yr ? `Class of ${yr}` : ""].filter(Boolean).join(", "))}</small></div></div></div>`; }).join("");
  const theirs = listOf(station.oppLineup).map((n, i) => `<div class="p" style="--i:${i}"><div class="body"><div class="strip"></div><div class="main"><b>${esc(n)}</b></div></div></div>`).join("");
  const col = (s, html, c) => `<div class="col ${c}"><h2>${logoHTML(s.logo, s.name)}${esc(s.name)}</h2>${html || `<div class="empty-note">Lineup to come!</div>`}</div>`;
  const n = Math.max(1, (m.players || []).length, listOf(station.oppLineup).length), h = Math.min(100, Math.floor(620 / n) - 14);
  out.html = frame("lu", m, g, {title:"Starting", script:"Lineups", sub:eventLine(m),
    body:`<div class="cols" style="--h:${h}px">${L.us ? col(L, ours, "l") + col(R, theirs, "r") : col(L, theirs, "l") + col(R, ours, "r")}</div>`});
}

/* ---------- comparisons ---------- */
function rowsHTML(rows){
  /* Longer bar = better. For "lower is better" rows (deaths, league rank) the bar is flipped. Rows missing a side get no bars. */
  return rows.map((r, i) => { const gap = r.fa === "–" || r.fb === "–", a = gap ? 0 : +r.a || 0, b = gap ? 0 : +r.b || 0;
    const better = gap ? "" : r.lower ? (a < b ? "a" : b < a ? "b" : "") : (a > b ? "a" : b > a ? "b" : "");
    const w = v => { if (gap) return 0; if (r.lower){ const lo = Math.min(a, b); return v > 0 ? Math.round(lo / v * 100) : 100; } const hi = Math.max(a, b); return hi > 0 ? Math.round(v / hi * 100) : 0; };
    return `<div class="row" style="--i:${i}"><div class="v l${better === "a" ? " best" : ""}"><span data-count="${i}">${esc(r.fa ?? r.a)}</span><i style="--w:${w(a)}%"></i></div><div class="k">${esc(r.k)}</div><div class="v r${better === "b" ? " best" : ""}"><i style="--w:${w(b)}%"></i><span data-count="${i}">${esc(r.fb ?? r.b)}</span></div></div>`; }).join("");
}
function teamCompare(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), mine = teamSeason(m), st = standingFor(m), h2h = finals.filter(x => x.game === m.game && sameOpp(x, m)), hh = record(h2h);
  const our = record(mine), form = mine.slice(-5).map(x => x.result).join(" ");
  const usRows = {rec:our.text, w:our.w, rank:"", rating:""};
  const thRows = {rec:st ? `${st.w}–${st.l}` : "–", w:st ? +st.w : 0, rank:st ? `#${st.rank}` : "–", rating:st?.rating || "–"};
  const ourSt = (site.standings || []).flatMap(t => (t.rows || []).filter(r => r.us && String(t.title || "").toLowerCase().includes(String(g.short || "").split(/\s+/)[0].toLowerCase())))[0];
  if (ourSt){ usRows.rank = `#${ourSt.rank}`; usRows.rating = ourSt.rating; }
  const rows = [
    {k:"Season record", a:usRows.w, b:thRows.w, fa:usRows.rec, fb:thRows.rec},
    ...(usRows.rank || st ? [{k:"League rank", a:parseInt(String(usRows.rank).slice(1)) || 0, b:parseInt(String(thRows.rank).slice(1)) || 0, fa:usRows.rank || "–", fb:thRows.rank, lower:true}] : []),
    ...(usRows.rating || st ? [{k:"Rating", a:+usRows.rating || 0, b:+thRows.rating || 0, fa:usRows.rating || "–", fb:thRows.rating}] : []),
    ...(h2h.length ? [{k:"Head to head", a:hh.w, b:hh.l}] : []),
    ...(form ? [{k:"Last 5", a:mine.slice(-5).filter(x => x.result === "W").length, b:0, fa:form, fb:"–"}] : [])
  ];
  const ordered = L.us ? rows : rows.map(r => ({...r, a:r.b, b:r.a, fa:r.fb, fb:r.fa}));
  const head = (s, c) => `<div class="h ${c}"><div class="pic crest">${logoHTML(s.logo, s.name)}</div><div><b>${esc(s.name)}</b><small>${esc(s.team || s.school)}</small></div></div>`;
  out.html = frame("cmp", m, g, {title:"Tale of the", script:"Tape", sub:eventLine(m), foot:h2h.length ? "" : "First meeting!",
    body:`<div class="heads">${head(L, "l")}<div class="vsx"><span><b class="gold-text">VS</b></span></div>${head(R, "r")}</div><div class="rows">${rowsHTML(ordered)}</div>`});
}
function playerStats(m, id){
  const g = gameFor(site, m.game), se = m.season || seasonOf(m.startsAt);
  const played = finals.filter(x => x.game === m.game && (x.season || seasonOf(x.startsAt)) === se && (x.players || []).some(p => p.id === id));
  const tot = {}, cnt = {}, avg = {};
  played.forEach(x => { const st = (x.players.find(p => p.id === id) || {}).stats || {};
    (g.statList || []).forEach(d => { if (!(d.key in st)) return; if (d.avg){ (avg[d.key] = avg[d.key] || []).push(+st[d.key]); } else { tot[d.key] = (tot[d.key] || 0) + (+st[d.key] || 0); cnt[d.key] = (cnt[d.key] || 0) + 1; } }); });
  const rec = record(played);
  const per = {}; (g.statList || []).forEach(d => { per[d.key] = d.avg ? (avg[d.key]?.length ? avg[d.key].reduce((a, b) => a + b, 0) / avg[d.key].length : null) : (cnt[d.key] ? tot[d.key] / cnt[d.key] : null); });
  return {n:played.length, rec, per};
}
function playerCompare(m){
  const g = gameFor(site, m.game), ids = [station.compare?.a, station.compare?.b].filter(Boolean);
  const list = (m.players || []); const a = list.find(p => p.id === ids[0]) || list[0], b = list.find(p => p.id === ids[1]) || list.find(p => p !== a);
  if (!a || !b){ empty("Pick two players to compare in the scorekeeper"); return; }
  const A = playerStats(m, a.id), B = playerStats(m, b.id);
  const fmt = (d, v) => v === null || v === undefined ? "–" : d.avg ? `${Math.round(v)}%` : (Math.round(v * 10) / 10).toLocaleString("en-US");
  const rows = [{k:"Matches", a:A.n, b:B.n}, {k:"Record", a:A.rec.w, b:B.rec.w, fa:A.rec.text, fb:B.rec.text},
    ...(g.statList || []).filter(d => A.per[d.key] !== null || B.per[d.key] !== null).map(d => ({k:d.label.replace(/\s*%\s*$/, ""), a:A.per[d.key] || 0, b:B.per[d.key] || 0, fa:fmt(d, A.per[d.key]), fb:fmt(d, B.per[d.key]), lower:/death/i.test(d.label)}))].slice(0, 6);
  const head = (p, r) => { const ch = mainChar(m, p.id); return `<div class="h ${r ? "r" : "l"}"><div class="pic">${charImg(g, ch) ? `<img src="${esc(charImg(g, ch))}" alt="">` : `<div class="mono">${monogram(nameOf(p))}</div>`}</div><div><b>${esc(tagOf(p) || nameOf(p))}</b><small>${esc([tagOf(p) ? nameOf(p) : "", ch].filter(Boolean).join(", "))}</small></div></div>`; };
  out.html = frame("cmp", m, g, {title:"Player", script:"Matchup", sub:`${m.teamName}, this season`, foot:"Averages per match",
    body:`<div class="heads">${head(a)}<div class="vsx"><span><b class="gold-text">VS</b></span></div>${head(b, true)}</div><div class="rows">${rowsHTML(rows)}</div>`});
}

/* ---------- wiring ---------- */
const LAYERS = {scorebug, vs, lineups, "team-compare":teamCompare, "player-compare":playerCompare};
/* Full-screen graphics wait (up to 2.5 s) for season results so the entrance plays with the real numbers. */
let finalsReady = LAYER === "scorebug";
setTimeout(() => { if (!finalsReady){ finalsReady = true; draw(); } }, 2500);
function draw(){
  if (!finalsReady) return;
  if (!station.matchId){ empty(`Station ${STATION} has no match on it. Pick one in the scorekeeper.`); return; }
  if (!match){ empty("Loading the match…"); return; }
  const g = gameFor(site, match.game);
  if ((LAYER || "scorebug") === "scorebug" && g.liveFeed === "sos"){ startSOS(); rlbug(match); return; }
  (LAYERS[LAYER] || scorebug)(match);
}
/* Replay the entrance: OBS tells a Browser Source when its scene goes live, so every cut to this graphic animates in. */
function replay(){ clearTimeout(held); held = null; enterUntil = 0; lastHTML = ""; lastScores = null; rlStatic = ""; draw(); }
window.addEventListener("obsSourceActiveChanged", e => { if (e.detail?.active) replay(); });
window.addEventListener("obsSourceVisibleChanged", e => { if (e.detail?.visible) replay(); });
if (q.get("bg")) document.addEventListener("keydown", e => { if (e.key === "r") replay(); });   // preview: press R to replay
watchBroadcast(b => {
  const next = (b.stations || {})[STATION] || {};
  if (next.matchId !== station.matchId){ lastScores = null; lastHTML = ""; rlStatic = ""; match = null; if (stopMatch) Promise.resolve(stopMatch).then(f => f && f()); stopMatch = watchMatch(next.matchId, mm => { match = mm; draw(); }); }
  station = next; draw();
});
if (LAYER !== "scorebug") watchFinals(site, list => { finals = list; finalsReady = true; draw(); });
