/* LevelUP overlays. Each overlay page is an OBS Browser Source (1920 x 1080) that follows one streaming station:
   ?station=1 (default). The scorekeeper decides which match is on each station; every overlay updates itself live.
   Layers: scorebug, vs, lineups, team-compare, player-compare, and for Rocket League rl-team, rl-players, rl-box
   (live stats from the game; ?scope=series adds up every game of the match). Add ?bg=1 to see an overlay on a grey test background. */
import {schoolInfo, gameFor, oppShort, roundLabel, postseason, seasonOf, shortSchool, slug, fmtStat, fmtTime, listOf, sendRLBox} from "../assets/matches.js?v=23";
import {watchBroadcast, watchMatch, watchFinals} from "../assets/live.js?v=48";
import {connectSOS, localAccessState, askLocalAccess} from "./sos.js?v=5";

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
  if (first){ app.firstElementChild?.classList.add("enter"); app.querySelectorAll(".duo > .bug, .duo .full").forEach(el => el.classList.add("enter")); enterUntil = Date.now() + ENTRANCE_MS; countUp(); }
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
  const cur = (m.games || []).find(x => x.n === m.current && x.p && Object.keys(x.p).length) || (setMode(g) ? {} : withP[0]) || {};
  const ourNow = cur.p ? Object.keys(cur.p) : [];
  const ourPlayer = g.teamSize === 1 || /solo/i.test(m.teamName) || (ourNow.length === 1 && ((m.players || []).length > 1 || +g.teamSize > 1)) ? (m.players || []).find(p => p.id === ourNow[0]) : null;
  /* the character on now: the latest game of the set that has one (Smash sets are best of 3, a pick per game) */
  const charOf = id => { const r = cur.p?.[id] || {}; return [r.hero5, r.hero4, r.hero3, r.hero2, r.hero].find(Boolean); };
  const us = {name:US.short, team:m.teamName, logo:US.logo, score:m.score?.us ?? 0, won:(m.games || []).filter(x => x.winner === "us").length,
    now:ourPlayer ? {name:tagOf(ourPlayer) || nameOf(ourPlayer), char:charOf(ourPlayer.id)} : null, us:true, ...OUR_COLORS};
  const lib = schoolInfo(site, m.opponent?.school);
  const them = {name:(!String(m.opponent?.short || "").trim() && lib?.short) || oppShort(m), team:m.opponent?.team || "", school:m.opponent?.school || "", logo:station.oppLogo || m.opponent?.logo || lib?.logo || "", score:m.score?.them ?? 0,
    won:(m.games || []).filter(x => x.winner === "them").length, now:oppNowOf(m), ...teamColors(lib)};
  if (m.show){ Object.assign(us, {name:m.showSides[0], team:"", logo:US.logo, now:null}); Object.assign(them, {name:m.showSides[1], team:"", school:"", logo:US.logo, now:null, ...OUR_COLORS}); }
  return station.swap ? [them, us] : [us, them];
}
const oppList = m => m.show ? [m.showSides[1]] : listOf(station.oppLineup);
/* Their player on now: the scorekeeper's Set desk keeps each set's gamertag and per-game characters on the station
   (oppSets); older setups typed one player and character (oppNow / oppChar). */
function oppNowOf(m){
  const o = station.oppSets?.[m.current || 1];
  if (o?.tag) return {name:o.tag, char:[...(o.chars || [])].reverse().find(Boolean) || "", chars:o.chars || []};
  if (station.oppSets && Object.keys(station.oppSets).length) return null;
  return station.oppNow ? {name:station.oppNow, char:station.oppChar} : null;
}
/* Sets of games (Smash: each set is a best of 3): games won in the current set, in order. */
const setMode = g => +g.charSlots > 1 && !!g.points && !!(g.charLabel || "").trim();
const setLen = g => Math.max(1, Math.min(5, +g.charSlots || 3)), setNeed = g => Math.floor(setLen(g) / 2) + 1;
const gwOf = gm => Array.isArray(gm?.gw) ? gm.gw : [...Array(+gm?.us || 0).fill("us"), ...Array(+gm?.them || 0).fill("them")];
function charRender(g, name){ const dir = String(g.charArt || "").replace(/\/$/, ""); return dir && name ? BASE + dir + "/" + slug(name) + "-render.webp" : ""; }
function charImg(g, name){
  const dir = String(g.charArt || g.charIcons || "").replace(/\/$/, ""); if (!dir || !name) return "";
  return BASE + dir + "/" + slug(name) + (g.key === "marvel-rivals" ? "-face.webp" : "-logo.webp");
}
/* Gold claw slashes, like the ones on the program's thumbnails. */
const CLAW_D = ["M560,10 L538,21 L515,30 L491,39 L470,50 L455,70 L433,81 L412,92 L391,105 L372,120 L354,136 L334,149 L309,155 L291,172 L272,186 L262,213 L243,228 L229,248 L208,261 L192,280 L176,298 L159,315 L140,330 L140,330 L159,315 L180,303 L203,293 L223,281 L244,268 L264,254 L285,243 L306,231 L325,216 L344,202 L361,184 L382,173 L400,156 L418,141 L441,132 L457,112 L476,98 L495,83 L509,62 L528,47 L545,30 L560,10Z", "M600,60 L578,69 L560,81 L539,91 L523,107 L505,120 L482,127 L466,143 L446,154 L433,173 L411,181 L400,203 L384,218 L367,232 L348,245 L333,261 L317,277 L299,290 L284,306 L273,328 L261,348 L247,365 L230,380 L230,380 L247,365 L265,353 L285,342 L304,329 L324,319 L345,310 L358,291 L380,281 L398,268 L411,249 L432,239 L446,222 L469,214 L480,193 L501,183 L511,161 L527,146 L542,129 L559,115 L573,97 L589,81 L600,60Z", "M590,170 L575,177 L558,182 L546,192 L528,195 L513,202 L508,220 L493,227 L479,236 L470,248 L460,262 L444,267 L427,271 L419,286 L412,302 L402,314 L390,325 L378,336 L372,352 L360,363 L351,376 L342,390 L330,400 L330,400 L342,390 L356,381 L370,374 L382,364 L396,355 L412,350 L425,341 L434,327 L447,318 L462,311 L475,302 L483,287 L496,278 L507,266 L521,259 L527,242 L541,233 L550,220 L561,209 L572,197 L582,185 L590,170Z"];
const claw = cls => `<svg class="claw ${cls || ""}" viewBox="0 0 640 430" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="sh" transform="translate(-10 12)">${CLAW_D.map(d => `<path d="${d}"/>`).join("")}</g><g>${CLAW_D.map(d => `<path d="${d}"/>`).join("")}</g></svg>`;
/* Hand-brushed underline drawn under titles. */
/* (kept for other layouts) */ const BRUSH = `<svg viewBox="0 0 600 26" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M8 17 C 120 6, 260 4, 380 9 S 560 14, 592 8"/></svg>`;
/* Shrink long team names so "Byron Center" fits instead of being cut off (Anton is about half an em per letter). */
const fitName = (name, max, room) => Math.max(24, Math.min(max, Math.floor(room / (String(name || "").length * .5 || 1))));
const gameLogo = g => g.icon ? src(g.icon) : "";
/* Team colors for paper panels: ours from site.json, theirs from the School library (steel blue when unknown).
   --on is the readable text color on that paper; --hi is the lighter of the two school colors, for accents. */
const lum = h => { const m = String(h || "").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return .3; let x = m[1]; if (x.length === 3) x = x.replace(/./g, c => c + c);
  const c = i => { const v = parseInt(x.slice(i, i + 2), 16) / 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * c(0) + .7152 * c(2) + .0722 * c(4); };
const hexOk = h => /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(h || "").trim()) ? (String(h).trim()[0] === "#" ? String(h).trim() : "#" + String(h).trim()) : "";
const OUR_COLORS = {c1:hexOk(P.primary) || "#00274C", c2:hexOk(P.secondary) || "#FFBC05"};
function teamColors(lib){ const c1 = hexOk(lib?.primary) || "#35557C", c2 = hexOk(lib?.secondary) || "#DCE8F5"; return {c1, c2}; }
const skin = s => { const c1 = s.c1 || "#35557C", c2 = s.c2 || "#DCE8F5", l1 = lum(c1), l2 = lum(c2);
  return `--c1:${esc(c1)};--c2:${esc(c2)};--on:${l1 > .42 ? "#0B1420" : "#FFFFFF"};--on2:${l2 > .42 ? "#0B1420" : "#FFFFFF"};--hi:${esc(Math.max(l1, l2) >= .2 ? (l1 >= l2 ? c1 : c2) : "#FFFFFF")}`; };
/* Background artwork for full-screen graphics: this team's photo/art first, then the game's. */
const artFor = (m, g) => src((site.teams || []).find(t => t.id === m.teamId)?.art || g.art || "");
/* Full-screen frame: background art, hazard corners, claw slashes, game logo, then a title built like the program's
   graphics: big distressed block letters with a brush-script word slashed across the bottom corner, with a gold brush stroke underneath. */
/* The paper package: a wavy fabric backdrop (split into both schools' colors when the layer has two sides), the game
   art faintly behind it, torn paper scraps in the corners, the claw as a die-cut sticker, the title on a torn,
   crumpled paper banner with a script word stuck over it, and notes on strips of tape. */
function frame(cls, m, g, {script = "", title = "", sub = "", body = "", foot = "", split = null} = {}){
  const art = artFor(m, g), gl = gameLogo(g);
  const halves = split ? `<div class="half l" style="${skin(split[0])}"></div><div class="seam"><div class="half r" style="${skin(split[1])}"></div></div>` : `<div class="half solo" style="${skin(OUR_COLORS)}"></div>`;
  return `<div class="full ${cls}">${halves}<div class="fab"></div>${art ? `<div class="art" style="background-image:url('${esc(art)}')"></div>` : ""}<div class="vig"></div>
    <div class="scrap tl"><i></i></div><div class="scrap br"><i></i></div>${claw("stk")}
    <header class="top">${gl ? `<img class="glogo" src="${esc(gl)}" alt="${esc(g.name)}">` : ""}
      ${title ? `<div class="ttl${script ? " has-script" : ""}"><div class="ban-w"><div class="ban"><b>${esc(title)}</b></div></div>${script ? `<i${script.length > 6 ? ' class="long"' : ""}>${esc(script)}</i>` : ""}</div>` : ""}${sub ? `<div class="tape-w"><small class="tape">${esc(sub)}</small></div>` : ""}</header>
    ${body}${foot ? `<div class="foot"><span class="tape">${foot}</span></div>` : ""}<div class="flash"></div></div>`;
}
const empty = msg => { clearTimeout(held); held = null; enterUntil = 0; lastHTML = ""; rlStatic = ""; app.innerHTML = q.get("bg") ? `<div class="empty">${esc(msg)}</div>` : ""; };

/* ---------- score bug (every game without a live game feed) ----------
   Same build as the Rocket League bug: big names with a team-color stripe (gold for us, steel for them), the game's
   logo in the middle with what's happening under it, "Set 2 | Best of 5" and pips underneath, a white result banner
   when a game is won, and player cards along the bottom for one-on-one games like Smash. */
let lastScores = null, banner = null, bannerTimer = null;
function scorebug(m, wrap = h => h){
  const g = gameFor(site, m.game), [L, R] = sides(m), need = Math.floor((+m.bestOf || 1) / 2) + 1, cur = (m.games || []).find(x => x.n === m.current);
  const unit = g.unit || "Game", live = m.status === "live", fin = m.status === "final", gl = gameLogo(g);
  const decided = (m.games || []).filter(x => x.winner).length, n = fin ? Math.max(1, decided) : Math.min(+m.bestOf || 1, m.current || decided + 1);
  const pts = g.points && cur && (cur.us || cur.them) ? `${g.points} ${station.swap ? `${cur.them}–${cur.us}` : `${cur.us}–${cur.them}`}` : "";
  const state = fin ? `<b class="fin">Final</b>` : live ? `<small class="state">${esc(pts || "Live")}</small>` : `<small class="state up">${esc(m.status === "upcoming" ? fmtTime(m.startsAt) : m.status)}</small>`;
  const wing = (s, r) => { const lg = `<div class="lg">${logoHTML(s.logo, s.name)}</div>`, nm = `<div class="nm"><b style="font-size:${fitName(s.name, 62, 300)}px">${esc(s.name)}</b></div>`, sc = `<div class="sc" data-side="${r ? "r" : "l"}"><span>${s.score}</span></div>`;
    return `<div class="wing ${r ? "r" : "l"} ${s.us ? "us" : "them"}" style="${skin(s)}">${r ? sc + nm + lg : lg + nm + sc}${claw()}</div>`; };
  const pips = (s, rev) => `<span class="pips">${Array.from({length:need}, (_, i) => { const k = rev ? need - 1 - i : i; return `<i class="${k < s.won ? "on" : ""}" data-k="${k}"></i>`; }).join("")}</span>`;
  /* a game just won: banner for 8 seconds */
  if (lastScores && !fin) [L, R].forEach((s, i) => { if (s.won > lastScores[i].won){
    const other = i ? L : R, lead = s.won > other.won ? `Leads ${s.won}–${other.won}` : s.won === other.won ? `Series tied ${s.won}–${other.won}` : `Trails ${s.won}–${other.won}`;
    banner = {us:!!s.us, title:`${unit} ${decided}!`, name:s.name, note:lead}; clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { banner = null; draw(); }, 8000); } });
  if (fin) banner = null;
  const card = (s, r) => { if (!s.now || !live || q.get("card") === "0") return ""; const pic = charImg(g, s.now.char);
    return `<div class="pcard char${r ? " r" : ""}${s.us ? " us" : " them"}" style="${skin(s)}"><div class="ring">${pic ? `<img src="${esc(pic)}" alt="" onerror="this.remove()">` : `<b>${monogram(s.now.name)}</b>`}</div>
      <div class="pinfo"><b>${esc(s.now.name)}</b><div class="pst"><span><em>${esc(s.now.char || "—")}</em>${esc(g.charLabel || "Character")}</span><span><em>${s.won}</em>${esc(unit)}s won</span></div></div></div>`; };
  /* Smash and other best-of-3 sets: player plates hang under the bar (the bottom of the screen is the game's damage
     display), with the character's stock icon and a pip for each game won in this set. ?card=bottom keeps the cards. */
  const sm = setMode(g) && q.get("card") !== "bottom", cs = (m.games || []).find(x => x.n === m.current) || {}, sneed = setNeed(g), sw = gwOf(cs);
  const plate = (s, r) => { if (!sm || !s.now || !live || q.get("card") === "0") return ""; const pic = charImg(g, s.now.char), w = sw.filter(x => x === (s.us ? "us" : "them")).length;
    const dots = `<span class="gp">${Array.from({length:sneed}, (_, i) => `<i class="${i < w ? "on" : ""}"></i>`).join("")}</span>`;
    return `<div class="splate ${r ? "r" : "l"} ${s.us ? "us" : "them"}" style="${skin(s)}"><div class="sic">${pic ? `<img src="${esc(pic)}" alt="" onerror="this.remove()">` : ""}</div>
      <div class="sinf"><b style="font-size:${fitName(s.now.name, 34, 250)}px">${esc(s.now.name)}</b><small>${esc(s.now.char || "")}</small></div>${dots}</div>`; };
  out.html = wrap(`<div class="bug gen${sm ? " sets" : ""}">
      <div class="ev">${live ? `<span class="dot"></span>` : ""}${esc(eventLine(m) || g.name)}</div>
      <div class="bar">${wing(L)}<div class="mid">${gl ? `<img src="${esc(gl)}" alt="${esc(g.name)}">` : `<span class="gname">${esc(g.short || g.name)}</span>`}${state}</div>${wing(R, true)}</div>
      <div class="sub">${pips(L)}<span>${fin ? "" : `${esc(unit)} <em>${n}</em> &nbsp;|&nbsp; `}Best of <em>${esc(m.bestOf)}</em></span>${pips(R, true)}</div>
      ${plate(L)}${plate(R, true)}
      ${banner ? `<div class="goal"><i class="${banner.us ? "us" : "them"}"></i><b>${esc(banner.title)}</b><span>${esc(banner.name)}</span><small>${esc(banner.note)}</small></div>` : ""}
    </div>${sm ? "" : card(L) + card(R, true)}`);
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
      else if (ev === "game:match_ended"){ if (!rl.ended && match) noteGame(match, +(d?.winner_team_num ?? -1)); rl.ended = true; }
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
  if (m.show){   // showmatch: whichever team the left player is on (or the right player isn't)
    const k = x => String(x || "").toLowerCase().replace(/[^a-z0-9]/g, ""), find = p => [p?.tag, p?.name, m.showSides?.[p === m.showR ? 1 : 0]].map(k).filter(Boolean);
    const L = find(m.players?.[0]), R = find(m.showR);
    for (const p of Object.values(rl.players)){ const n = k(p.name); if (L.includes(n)) return p.team === 1 ? 1 : 0; if (R.includes(n)) return p.team === 1 ? 0 : 1; }
    return 0;
  }
  if (station.rlSide === "blue") return 0;
  if (station.rlSide === "orange") return 1;
  const ours = new Set((m.players || []).flatMap(p => [tagOf(p), nameOf(p), p.tag, p.name]).filter(Boolean).map(x => String(x).toLowerCase()));
  const hits = [0, 0]; Object.values(rl.players).forEach(p => { if (ours.has(String(p.name || "").toLowerCase())) hits[p.team === 1 ? 1 : 0]++; });
  return hits[1] > hits[0] ? 1 : 0;
}
/* Games the overlay saw end, so the series moves on even when nobody has entered the result in the scorekeeper yet.
   Kept in this browser source's storage per match. The scorekeeper always wins once it has as many results. */
const seenKey = m => `levelup-rl-games-${m.id || m.matchId || station.matchId || ""}`;
/* Every graphic in OBS shares this storage, so whichever one sees the game end first records it; repeats of the same
   game (same match GUID, or within 90 seconds) are dropped. Each entry keeps the final box score for both teams. */
function seenGames(m){
  let list = []; try { list = JSON.parse(localStorage.getItem(seenKey(m)) || "[]"); } catch {}
  return list.filter((x, i) => !list.slice(0, i).some(y => sameGame(x, y)));
}
const sameGame = (x, y) => x.guid && y.guid ? x.guid === y.guid : Math.abs(x.t - y.t) < 90000;
const snapshot = () => Object.values(rl.players).filter(p => p.name).map(p => ({name:String(p.name).slice(0, 40), team:p.team === 1 ? 1 : 0, score:+p.score || 0, goals:+p.goals || 0,
  assists:+p.assists || 0, saves:+p.saves || 0, shots:+p.shots || 0, demos:+p.demos || 0, touches:+p.touches || 0})).slice(0, 10);
function noteGame(m, winTeam){
  if (winTeam !== 0 && winTeam !== 1) return;
  const list = seenGames(m), last = list[list.length - 1], guid = String(rl.game?.guid || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 60);
  if (last && sameGame(last, {guid, t:Date.now()})) return;   // the same match end reported twice
  const us = ourTeamNum(m), t = Date.now();
  const box = {t, guid, winner:winTeam === us ? "us" : "them", us, goals:[+(rl.game?.teams?.[0]?.score ?? 0), +(rl.game?.teams?.[1]?.score ?? 0)], players:snapshot()};
  list.push(box);
  try { localStorage.setItem(seenKey(m), JSON.stringify(list)); } catch {}
  /* hand the box score to the scorekeeper: Hartland's stats go on the match, the opponent's into scouting */
  if (m.id && !m.show && box.players.length) sendRLBox(`${m.id}_${guid || t}`, {matchId:m.id, at:new Date(t).toISOString(), guid, us, winner:winTeam, goals:box.goals, players:box.players}).catch(() => {});
}
function seriesGames(m){
  const entered = (m.games || []).filter(x => x.winner), seen = seenGames(m);
  return seen.length > entered.length ? [...entered, ...seen.slice(entered.length)] : entered;
}
let rlStatic = "", rlLive = null;
function rlbug(m, wrap = h => h){
  const g = gameFor(site, m.game), need = Math.floor((+m.bestOf || 1) / 2) + 1, us = ourTeamNum(m);
  const played = m.status === "final" ? (m.games || []).filter(x => x.winner) : seriesGames(m);
  const usSide = {name:US.short, logo:US.logo, won:played.filter(x => x.winner === "us").length, ...OUR_COLORS};
  const lib = schoolInfo(site, m.opponent?.school);
  const themSide = {name:(!String(m.opponent?.short || "").trim() && lib?.short) || oppShort(m), logo:station.oppLogo || m.opponent?.logo || lib?.logo || "", won:played.filter(x => x.winner === "them").length, ...teamColors(lib)};
  if (m.show){ usSide.name = m.showSides[0]; Object.assign(themSide, {name:m.showSides[1], logo:US.logo, ...OUR_COLORS}); }
  const sides = us === 0 ? [usSide, themSide] : [themSide, usSide];   // [blue, orange]
  const decided = played.length;
  const gameNo = m.status === "final" ? decided : Math.min(+m.bestOf || 1, rl.ended ? Math.max(1, decided) : decided + 1);
  const wing = (s, r) => { const lg = `<div class="lg">${logoHTML(s.logo, s.name)}</div>`, nm = `<div class="nm"><b style="font-size:${fitName(s.name, 62, 300)}px">${esc(s.name)}</b></div>`, sc = `<div class="sc" data-side="${r ? 1 : 0}"><span>0</span></div>`;
    return `<div class="wing ${r ? "r orange" : "l blue"}${(r ? 1 : 0) === us ? " us" : " them"}" style="${skin(s)}">${r ? sc + nm + lg : lg + nm + sc}${claw()}</div>`; };
  const pips = (s, rev) => `<span class="pips">${Array.from({length:need}, (_, i) => { const k = rev ? need - 1 - i : i; return `<i class="${k < s.won ? "on" : ""}" data-k="${k}"></i>`; }).join("")}</span>`;
  const html = `<div class="bug rl">
      <div class="ev">${rl.on && rl.game && !rl.ended ? `<span class="dot"></span>` : ""}${esc(eventLine(m) || g.name)}</div>
      <div class="bar">${wing(sides[0])}<div class="mid"><b class="clock">5:00</b><small class="state"></small></div>${wing(sides[1], true)}</div>
      <div class="sub">${pips(sides[0])}<span>${m.status === "final" ? "" : `Game <em>${gameNo}</em> &nbsp;|&nbsp; `}Best of <em>${esc(m.bestOf)}</em></span>${pips(sides[1], true)}</div>
      <div class="goal" hidden></div>
    </div>${q.get("card") === "0" ? "" : `<div class="pcard" hidden></div>`}`;
  const full = wrap(html);
  if (full !== rlStatic){ rlStatic = full; out.html = full; rlLive = null; }
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
/* Team name on the VS screen: one line when it fits at a good size; otherwise split into two balanced lines
   ("Walled Lake / Western"), sized so the longer line fits the 660px column. */
function vsName(name){
  const n = String(name || "").trim(), one = Math.min(120, Math.floor(660 / ((n.length || 1) * .5)));
  if (one >= 88 || !n.includes(" ")) return `<b style="font-size:${Math.max(56, one)}px">${esc(n)}</b>`;
  const w = n.split(/\s+/); let best = null;
  for (let i = 1; i < w.length; i++){ const a = w.slice(0, i).join(" "), b = w.slice(i).join(" "), m = Math.max(a.length, b.length); if (!best || m < best.m) best = {a, b, m}; }
  const size = Math.max(56, Math.min(104, Math.floor(660 / (best.m * .5))));
  return `<b class="two" style="font-size:${size}px">${esc(best.a)}<br>${esc(best.b)}</b>`;
}
function vs(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), mine = teamSeason(m), h2h = finals.filter(x => x.game === m.game && sameOpp(x, m)), st = standingFor(m);
  const ourLine = mine.length ? `${record(mine).text} this season` : "", theirLine = st ? `${st.w}–${st.l}, #${st.rank} in the league` : "";
  const lineup = s => m.show ? [] : s.us ? (m.players || []).map(p => tagOf(p) || nameOf(p)) : oppList(m);
  const side = (s, c) => `<div class="side ${c}" style="${skin(s)}"><div class="crest">${logoHTML(s.logo, s.name)}</div>
    ${vsName(s.name)}${(s.team || s.school) ? `<span class="team">${esc(s.us ? s.team : s.team || s.school)}</span>` : ""}
    ${(s.us ? ourLine : theirLine) ? `<span class="rec">${esc(s.us ? ourLine : theirLine)}</span>` : ""}
    ${lineup(s).length ? `<div class="names">${lineup(s).map((n, i) => `<span style="--i:${i}">${esc(n)}</span>`).join("")}</div>` : ""}</div>`;
  const hh = record(h2h);
  const foot = [`Best of <em>${esc(m.bestOf)}</em>`, m.status === "upcoming" ? esc(fmtTime(m.startsAt)) : "",
    m.show ? "" : h2h.length ? (hh.w === hh.l ? `All-time series tied ${hh.w}–${hh.l}` : `All-time: ${esc(hh.w > hh.l ? US.short : oppShort(m))} leads ${Math.max(hh.w, hh.l)}–${Math.min(hh.w, hh.l)}`) : "First meeting"].filter(Boolean).join(" &nbsp;/&nbsp; ");
  out.html = frame("vs", m, g, {sub:eventLine(m), split:[L, R], body:`${side(L, "l")}<div class="vsx"><span><b class="gold-text">VS</b></span></div>${side(R, "r")}`, foot});
}

/* ---------- Smash VS screen: between games of a set ----------
   Both players with their characters as big die-cut stickers, the set and game, a pip per game won, and every set
   played so far. Characters and players come from the scorekeeper's Set desk; it updates the moment a game is won
   or a character is changed. */
/* characters whose art has writing on it, so the right-hand one isn't mirrored */
const NO_FLIP = /game & watch|steve|mega man|pac-man|duck hunt/i;
function smashVs(m){
  const g = gameFor(site, m.game); if (!setMode(g)){ empty("This graphic is for games played in sets, like Smash."); return; }
  const [L, R] = sides(m), n = m.current || 1, cs = (m.games || []).find(x => x.n === n) || {}, gw = gwOf(cs), need = setNeed(g), len = setLen(g);
  const gameNo = cs.winner ? 0 : Math.min(len, gw.length + 1);
  /* the next game's characters: ours from the set's player record, theirs from the station */
  const ourId = Object.keys(cs.p || {})[0], row = cs.p?.[ourId] || {}, CK = ["hero", "hero2", "hero3", "hero4", "hero5"];
  const k = Math.max(0, (gameNo || gw.length) - 1);
  const T = L.us ? R : L, o = station.oppSets?.[n];
  const ourChar = row[CK[k]] || [...CK].reverse().map(c => row[c]).find(Boolean) || "", theirChar = o?.chars?.[k] || T.now?.char || "";
  const who = s => ({name:s.now?.name || "", char:s.us ? ourChar : theirChar});
  const won = s => gw.filter(x => x === (s.us ? "us" : "them")).length;
  const fighter = (s, side) => { const w = who(s), img = charRender(g, w.char), icon = charImg(g, w.char);
    return `<div class="ftr ${side} ${s.us ? "us" : "them"}" style="${skin(s)}">
      ${img ? `<img class="rnd${NO_FLIP.test(w.char) ? " keep" : ""}" src="${esc(img)}" alt="" onerror="this.src='${esc(icon.replace(/-logo\.webp$/, "-art.webp"))}';this.onerror=null">` : `<div class="rnd none">${monogram(w.name || s.name)}</div>`}
      <div class="plt"><div class="who"><div class="lg">${logoHTML(s.logo, s.name)}</div><span>${esc(s.name)}${s.team && s.us ? ` · ${esc(s.team)}` : ""}</span></div>
        <b style="font-size:${fitName(w.name || "TBD", 104, 620)}px">${esc(w.name || "TBD")}</b>
        <div class="chr">${icon ? `<img src="${esc(icon)}" alt="" onerror="this.remove()">` : ""}<i>${esc(w.char || "Character TBD")}</i></div>
        <span class="gp">${Array.from({length:need}, (_, i) => `<i class="${i < won(s) ? "on" : ""}"></i>`).join("")}<small>${won(s)} ${won(s) === 1 ? "game" : "games"}</small></span></div></div>`; };
  /* every set so far: S1 Lypuff 2–1, winner marked */
  const done = (m.games || []).filter(x => x.winner).sort((a, b) => a.n - b.n);
  const setRow = x => { const pid = Object.keys(x.p || {})[0], p = (m.players || []).find(y => y.id === pid), them = station.oppSets?.[x.n]?.tag || "";
    const a = {us:p ? (tagOf(p) || nameOf(p)) : US.short, them:them || oppShort(m), su:x.us || 0, st:x.them || 0}, [l, r] = station.swap ? ["them", "us"] : ["us", "them"];
    return `<span class="${x.winner === "us" ? "w" : "l"}"><em>${esc((g.unit || "Set")[0])}${x.n}</em>${esc(a[l])} <b>${station.swap ? a.st : a.su}–${station.swap ? a.su : a.st}</b> ${esc(a[r])}</span>`; };
  const mid = `<div class="smid"><div class="vsx"><span><b class="gold-text">VS</b></span></div>
    <div class="tape-w"><span class="tape">${esc(g.unit || "Set")} <em>${n}</em>${gameNo ? ` &nbsp;·&nbsp; Game <em>${gameNo}</em>` : " &nbsp;·&nbsp; <em>Final</em>"}</span></div>
    <div class="sset"><b>${won(L)}</b><i>–</i><b>${won(R)}</b></div><small class="ssl">${esc(g.points || "Games")} this ${esc((g.unit || "set").toLowerCase())} · first to ${need}</small></div>`;
  const lead = L.score === R.score ? `Tied ${L.score}–${R.score}` : `${esc(L.score > R.score ? L.name : R.name)} leads ${Math.max(L.score, R.score)}–${Math.min(L.score, R.score)}`;
  const foot = `${done.length ? `<span class="sets">${done.map(setRow).join("")}</span>` : ""}${lead} &nbsp;/&nbsp; Best of <em>${esc(m.bestOf)}</em>`;
  out.html = frame("vs svs", m, g, {sub:eventLine(m), split:[L, R], body:fighter(L, "l") + mid + fighter(R, "r"), foot});
}

/* ---------- starting lineups ---------- */
function mainChar(m, id){
  const picks = r => r ? [r.hero, r.hero2, r.hero3, r.hero4, r.hero5].filter(Boolean) : [];
  const c = {}; (m.games || []).forEach(x => picks(x.p?.[id]).forEach(h => c[h] = (c[h] || 0) + 1));
  let best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!best){ finals.filter(x => x.game === m.game).forEach(x => (x.games || []).forEach(gm => picks(gm.p?.[id]).forEach(h => c[h] = (c[h] || 0) + 1))); best = Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0]; }
  return best || (site.profiles?.[id]?.chars || "").split(",")[0].trim() || "";
}
function mainRole(m, id){ const c = {}; (m.games || []).forEach(x => { const r = x.p?.[id]?.role; if (r) c[r] = (c[r] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || ""; }
function lineups(m){
  const g = gameFor(site, m.game), [L, R] = sides(m);
  const ours = (m.players || []).map((p, i) => { const ch = mainChar(m, p.id), role = mainRole(m, p.id), yr = site.profiles?.[p.id]?.gradYear;
    const strip = [role && g.roleIcons?.[role] ? `<img src="${esc(src(g.roleIcons[role]))}" alt="">` : "", esc([role, ch].filter(Boolean).join(" · ") || g.short || g.name)].join("");
    return `<div class="p" style="--i:${i}"><div class="pic">${charImg(g, ch) ? `<img src="${esc(charImg(g, ch))}" alt="" onerror="this.remove()">` : `<span>${monogram(nameOf(p))}</span>`}</div>
      <div class="body"><div class="strip">${strip}</div><div class="main"><b>${esc(tagOf(p) || nameOf(p))}</b><small>${esc([tagOf(p) ? nameOf(p) : "", yr ? `Class of ${yr}` : ""].filter(Boolean).join(", "))}</small></div></div></div>`; }).join("");
  const theirs = oppList(m).map((n, i) => `<div class="p" style="--i:${i}"><div class="body"><div class="strip"></div><div class="main"><b>${esc(n)}</b></div></div></div>`).join("");
  const col = (s, html, c) => `<div class="col ${c}" style="${skin(s)}"><h2 style="font-size:${fitName(s.name, 66, 640)}px">${logoHTML(s.logo, s.name)}<span>${esc(s.name)}</span></h2>${html ? `<div class="plates">${html}</div>` : `<div class="empty-note">Lineup to come!</div>`}</div>`;
  const n = Math.max(1, (m.players || []).length, oppList(m).length), h = Math.min(100, Math.floor(620 / n) - 14);
  out.html = frame("lu", m, g, {title:"Starting", script:"Lineups", sub:eventLine(m), split:[L, R],
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
  const head = (s, c) => `<div class="h ${c}" style="${skin(s)}"><div class="pic crest">${logoHTML(s.logo, s.name)}</div><div><b style="font-size:${fitName(s.name, 76, 470)}px">${esc(s.name)}</b><small>${esc(s.team || s.school)}</small></div></div>`;
  out.html = frame("cmp", m, g, {title:"Tale of the", script:"Tape", sub:eventLine(m), split:[L, R], foot:h2h.length ? "" : "First meeting!",
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
/* One of our players against one of theirs (scorekeeper: On stream > Player comparison). Ours: this season, per
   game. Theirs: what the scouting report saved for that gamertag (copied onto the station), else a dash. */
function crossCompare(m, c){
  const g = gameFor(site, m.game), [L, R] = sides(m), us = L.us ? L : R, them = L.us ? R : L;
  const roster = ((site.teams || []).find(t => t.id === m.teamId)?.roster || []).filter(p => p.id);
  const list = [...(m.players || []), ...roster.filter(r => !(m.players || []).some(p => p.id === r.id))];
  const a = list.find(p => p.id === c.a) || list[0];
  if (!a){ empty("Add our lineup in the scorekeeper to compare players"); return; }
  const se = m.season || seasonOf(m.startsAt), defs = (g.statList || []).filter(d => !d.avg);
  const mine = finals.filter(x => x.game === m.game && (x.season || seasonOf(x.startsAt)) === se && (x.players || []).some(p => p.id === a.id));
  const rows = []; mine.forEach(x => { const per = (x.games || []).filter(gm => gm.p?.[a.id]); if (per.length) per.forEach(gm => rows.push(gm.p[a.id])); else rows.push((x.players.find(p => p.id === a.id) || {}).stats || {}); });
  const avg = k => { const v = rows.filter(r => r[k] != null && r[k] !== "").map(r => +r[k]); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  const f1 = v => v == null ? "–" : (Math.round(v * 10) / 10).toLocaleString("en-US");
  const T = c.themStats || {}, ours = teamSeason(m).concat(m.status === "final" ? [m] : []), ourRec = record(ours), st = standingFor(m);
  const out1 = [{k:"Team record", a:ourRec.w, b:st ? +st.w : 0, fa:ourRec.text, fb:st ? `${st.w}–${st.l}` : "–"},
    ...defs.filter(d => avg(d.key) != null || T[d.key] != null).map(d => ({k:`${d.label} / ${(g.unit || "game").toLowerCase()}`, a:avg(d.key) || 0, b:+T[d.key] || 0, fa:f1(avg(d.key)), fb:T[d.key] != null ? f1(+T[d.key]) : "–", lower:/death|lost/i.test(d.label)}))].slice(0, 6);
  const ch = mainChar(m, a.id), themCh = c.themChar || c.themMain || "";
  const headUs = `<div class="h ${L.us ? "l" : "r"}" style="${skin(us)}"><div class="pic">${charImg(g, ch) ? `<img src="${esc(charImg(g, ch))}" alt="">` : `<div class="mono">${monogram(nameOf(a))}</div>`}</div><div><b style="font-size:${fitName(tagOf(a) || nameOf(a), 76, 470)}px">${esc(tagOf(a) || nameOf(a))}</b><small>${esc([US.short, ch].filter(Boolean).join(", "))}</small></div></div>`;
  const headThem = `<div class="h ${L.us ? "r" : "l"}" style="${skin(them)}"><div class="pic${charImg(g, themCh) ? "" : " crest"}">${charImg(g, themCh) ? `<img src="${esc(charImg(g, themCh))}" alt="">` : logoHTML(them.logo, them.name)}</div><div><b style="font-size:${fitName(c.them, 76, 470)}px">${esc(c.them)}</b><small>${esc([them.name, themCh || c.themRole].filter(Boolean).join(", "))}</small></div></div>`;
  const rowsLR = L.us ? out1 : out1.map(r => ({...r, a:r.b, b:r.a, fa:r.fb, fb:r.fa}));
  out.html = frame("cmp", m, g, {title:"Player", script:"Matchup", sub:eventLine(m), split:[L, R], foot:c.themGp ? `Per ${esc((g.unit || "game").toLowerCase())} · theirs from ${c.themGp} ${esc((g.unit || "game").toLowerCase())}${c.themGp === 1 ? "" : "s"} vs Hartland` : `Per ${esc((g.unit || "game").toLowerCase())}, this season`,
    body:`<div class="heads">${L.us ? headUs : headThem}<div class="vsx"><span><b class="gold-text">VS</b></span></div>${L.us ? headThem : headUs}</div><div class="rows">${rowsHTML(rowsLR)}</div>`});
}
function playerCompare(m){
  if (station.compare?.them) return crossCompare(m, station.compare);
  const g = gameFor(site, m.game), ids = [station.compare?.a, station.compare?.b].filter(Boolean);
  const roster = ((site.teams || []).find(t => t.id === m.teamId)?.roster || []).filter(p => p.id);
  const list = [...(m.players || []), ...roster.filter(r => !(m.players || []).some(p => p.id === r.id))];
  const a = list.find(p => p.id === ids[0]) || list[0], b = list.find(p => p.id === ids[1]) || list.find(p => p !== a);
  if (!a || !b){ empty("This team needs two players on its roster to compare"); return; }
  const A = playerStats(m, a.id), B = playerStats(m, b.id);
  const fmt = (d, v) => v === null || v === undefined ? "–" : d.avg ? `${Math.round(v)}%` : (Math.round(v * 10) / 10).toLocaleString("en-US");
  const rows = [{k:"Matches", a:A.n, b:B.n}, {k:"Record", a:A.rec.w, b:B.rec.w, fa:A.rec.text, fb:B.rec.text},
    ...(g.statList || []).filter(d => A.per[d.key] !== null || B.per[d.key] !== null).map(d => ({k:d.label.replace(/\s*%\s*$/, ""), a:A.per[d.key] || 0, b:B.per[d.key] || 0, fa:fmt(d, A.per[d.key]), fb:fmt(d, B.per[d.key]), lower:/death/i.test(d.label)}))].slice(0, 6);
  const head = (p, r) => { const ch = mainChar(m, p.id); return `<div class="h ${r ? "r" : "l"}"><div class="pic">${charImg(g, ch) ? `<img src="${esc(charImg(g, ch))}" alt="">` : `<div class="mono">${monogram(nameOf(p))}</div>`}</div><div><b style="font-size:${fitName(tagOf(p) || nameOf(p), 76, 470)}px">${esc(tagOf(p) || nameOf(p))}</b><small>${esc([tagOf(p) ? nameOf(p) : "", ch].filter(Boolean).join(", "))}</small></div></div>`; };
  out.html = frame("cmp", m, g, {title:"Player", script:"Matchup", sub:`${m.teamName}, this season`, foot:"Averages per match",
    body:`<div class="heads">${head(a)}<div class="vsx"><span><b class="gold-text">VS</b></span></div>${head(b, true)}</div><div class="rows">${rowsHTML(rows)}</div>`});
}

/* ---------- Rocket League stats graphics (live from the game) ----------
   rl-team: team totals, rl-players: one player against another, rl-box: everyone's line. They show the game being
   played (live) or, between games, the one that just ended. ?scope=series adds up every game of the match so far.
   ?a=Name&b=Name picks the two players to compare; otherwise each side's top scorer. */
const SCOPE = q.get("scope") === "series" ? "series" : "game";
function rlData(m){
  const done = seenGames(m).filter(b => b.players?.length);
  const live = rl.on && rl.game && !rl.ended && !rl.game.hasWinner && Object.keys(rl.players).length
    ? {live:true, us:ourTeamNum(m), goals:[rl.game.teams?.[0]?.score ?? 0, rl.game.teams?.[1]?.score ?? 0], players:snapshot()} : null;
  const played = seriesGames(m).length;
  if (SCOPE === "series"){ const boxes = [...done, ...(live ? [live] : [])]; return boxes.length ? {boxes, live:!!live, count:boxes.length} : null; }
  const b = live || done[done.length - 1];
  return b ? {boxes:[b], live:!!live, n:live ? Math.min(+m.bestOf || 9, played + 1) : Math.max(1, played), box:b} : null;
}
const STAT_KEYS = ["score", "goals", "assists", "saves", "shots", "demos", "touches"];
function rlAgg(boxes){
  const players = new Map(), team = {us:{}, them:{}};
  STAT_KEYS.forEach(k => { team.us[k] = 0; team.them[k] = 0; });
  boxes.forEach(b => b.players.forEach(p => {
    const side = p.team === b.us ? "us" : "them", key = side + "|" + p.name.toLowerCase();
    const r = players.get(key) || {name:p.name, side, gp:0, ...Object.fromEntries(STAT_KEYS.map(k => [k, 0]))};
    r.gp++; STAT_KEYS.forEach(k => { r[k] += +p[k] || 0; team[side][k] += +p[k] || 0; }); players.set(key, r);
  }));
  return {players:[...players.values()], team};
}
const pct = (g, s) => s ? Math.round(g / s * 100) : 0;
function rlTitle(d){ return SCOPE === "series" ? {title:"Series", script:"Stats"} : {title:`Game ${d.n}`, script:"Stats"}; }
function rlFoot(m, d){
  const fin = d.count - (d.live ? 1 : 0);
  if (SCOPE === "series") return d.live ? (fin ? `${fin} game${fin === 1 ? "" : "s"} done, game <em>${fin + 1}</em> live` : `Game <em>1</em>, live`) : `All <em>${fin}</em> game${fin === 1 ? "" : "s"} added up`;
  if (d.live) return `<em>Live</em> stats, game in progress`;
  const b = d.box, us = b.goals[b.us], them = b.goals[1 - b.us];
  return `Final: ${esc(us > them ? US.short : oppShort(m))} wins <em>${Math.max(us, them)}–${Math.min(us, them)}</em>`;
}
const rlWait = () => empty(SCOPE === "series" ? "Series stats show up once the first game starts." : "Stats show up once a game starts (the LevelUP Relay has to be running).");
function rlTeam(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), d = rlData(m); if (!d){ rlWait(); return; }
  const {team} = rlAgg(d.boxes), A = team[L.us ? "us" : "them"], B = team[L.us ? "them" : "us"];
  const rows = [{k:"Goals", a:A.goals, b:B.goals}, {k:"Shots", a:A.shots, b:B.shots},
    {k:"Shooting %", a:pct(A.goals, A.shots), b:pct(B.goals, B.shots), fa:pct(A.goals, A.shots) + "%", fb:pct(B.goals, B.shots) + "%"},
    {k:"Saves", a:A.saves, b:B.saves}, {k:"Assists", a:A.assists, b:B.assists}, {k:"Demos", a:A.demos, b:B.demos}];
  const head = (s, c) => `<div class="h ${c}" style="${skin(s)}"><div class="pic crest">${logoHTML(s.logo, s.name)}</div><div><b style="font-size:${fitName(s.name, 76, 470)}px">${esc(s.name)}</b><small>${esc(s.team || s.school)}</small></div></div>`;
  out.html = frame("cmp", m, g, {...rlTitle(d), sub:eventLine(m), split:[L, R], foot:rlFoot(m, d),
    body:`<div class="heads">${head(L, "l")}<div class="vsx"><span><b class="gold-text">VS</b></span></div>${head(R, "r")}</div><div class="rows">${rowsHTML(rows)}</div>`});
}
function rlPlayers(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), d = rlData(m); if (!d){ rlWait(); return; }
  const {players} = rlAgg(d.boxes), top = side => players.filter(p => p.side === side).sort((a, b) => b.score - a.score)[0];
  /* the scorekeeper's live picker (On stream > Player matchup) names one player per side; a blank or a name that isn't
     in the lobby falls back to that side's top scorer. Names match loosely (case, spaces and symbols ignored). */
  const k = n => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const find = (n, side) => { const t = k(n); if (!t) return null; const pool = players.filter(p => p.side === side);
    return pool.find(p => k(p.name) === t) || pool.find(p => k(p.name).startsWith(t) || t.startsWith(k(p.name))) || null; };
  const pick = station.rlCompare || {};
  const ours = find(q.get("a") || pick.us, "us") || top("us"), theirs = find(q.get("b") || pick.them, "them") || top("them");
  let a = L.us ? ours : theirs, b = L.us ? theirs : ours;
  if (!a || !b){ rlWait(); return; }
  const sideOf = p => p.side === "us" ? sides(m).find(s => s.us) : sides(m).find(s => !s.us);
  const per = SCOPE === "series";
  const rows = [["Score", "score"], ["Goals", "goals"], ["Assists", "assists"], ["Saves", "saves"], ["Shots", "shots"], ["Demos", "demos"]].map(([k, f]) => ({k, a:a[f], b:b[f]}));
  const head = (p, r) => { const s = sideOf(p); return `<div class="h ${r ? "r" : "l"}" style="${skin(s)}"><div class="pic crest">${logoHTML(s.logo, s.name)}</div><div><b style="font-size:${fitName(p.name, 76, 470)}px">${esc(p.name)}</b><small>${esc(s.name)}${per ? `, ${p.gp} game${p.gp === 1 ? "" : "s"}` : ""}</small></div></div>`; };
  out.html = frame("cmp", m, g, {title:"Player", script:"Matchup", sub:SCOPE === "series" ? "This match, every game" : `Game ${d.n}`, split:[sideOf(a), sideOf(b)], foot:rlFoot(m, d),
    body:`<div class="heads">${head(a)}<div class="vsx"><span><b class="gold-text">VS</b></span></div>${head(b, true)}</div><div class="rows">${rowsHTML(rows)}</div>`});
}
function rlBox(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), d = rlData(m); if (!d){ rlWait(); return; }
  const {players, team} = rlAgg(d.boxes);
  /* MVP: top score on the winning team of a finished game */
  let mvp = "";
  if (SCOPE === "game" && !d.live){ const w = d.box.winner; mvp = players.filter(p => p.side === w).sort((a, b) => b.score - a.score)[0]?.name || ""; }
  const cols = [["Score", "score"], ["Goals", "goals"], ["Assists", "assists"], ["Saves", "saves"], ["Shots", "shots"], ["Demos", "demos"]];
  const block = (s, i) => { const side = s.us ? "us" : "them", list = players.filter(p => p.side === side).sort((a, b) => b.score - a.score), T = team[side];
    return `<div class="tm" style="${skin(s)};--i:${i}"><div class="th"><div class="who">${logoHTML(s.logo, s.name)}<b>${esc(s.name)}</b></div>${cols.map(([k]) => `<small>${k}</small>`).join("")}</div>
      ${list.map((p, j) => `<div class="pr" style="--j:${j}"><div class="who"><b>${esc(p.name)}</b>${p.name === mvp ? `<i class="mvp">MVP</i>` : ""}${SCOPE === "series" ? `<small>${p.gp} gp</small>` : ""}</div>${cols.map(([, f]) => `<span>${p[f]}</span>`).join("")}</div>`).join("")}
      <div class="pr tot"><div class="who"><b>Team</b></div>${cols.map(([, f]) => `<span>${T[f]}</span>`).join("")}</div></div>`; };
  out.html = frame("box", m, g, {...rlTitle(d), title:SCOPE === "series" ? "Series" : "Box", script:SCOPE === "series" ? "Box Score" : "Score", sub:SCOPE === "series" ? eventLine(m) : `${eventLine(m)}${eventLine(m) ? " · " : ""}Game ${d.n}`, split:[L, R], foot:rlFoot(m, d),
    body:`<div class="bx">${block(L, 0)}${block(R, 1)}</div>`});
}

/* ---------- highlights: the clips the LevelUP Relay saved (through OBS's replay buffer), played back between games ----------
   Plays the most recent game's clips one after another, with what happened on a strip of tape, and loops the reel
   while the scene is up. ?scope=series plays every clip from this session. The relay serves the clips on this PC. */
const HL_BASE = "http://" + String(SOS_ADDR).replace(/^wss?:\/\//, "").split("/")[0];
const hl = {list:[], i:0, v:null, wait:null};
async function hlFetch(){
  try { const d = await (await fetch(HL_BASE + "/clips", {cache:"no-store"})).json(), all = d.clips || [];
    if (!all.length || SCOPE === "series") return all;
    const last = Math.max(...all.map(c => +c.game || 0)); return all.filter(c => (+c.game || 0) === last);
  } catch(e){ return null; }
}
function hlNote(msg){ const n = app.querySelector(".hlno"), cap = app.querySelector(".hlcap"); if (n){ n.hidden = !msg; n.textContent = msg || ""; } if (cap) cap.hidden = !!msg; }
async function hlNext(){
  const v = hl.v; if (!v || !document.body.contains(v)) return;
  clearTimeout(hl.wait);
  if (hl.i >= hl.list.length){
    const list = await hlFetch(); if (hl.v !== v) return;
    if (list === null){ hlNote("Highlights play from the LevelUP Relay on this PC. Start it, then show this scene again."); hl.wait = setTimeout(hlNext, 4000); return; }
    if (!list.length){ hlNote("No highlights saved yet."); hl.wait = setTimeout(hlNext, 4000); return; }
    hl.list = list; hl.i = 0;
  }
  const c = hl.list[hl.i++]; hlNote("");
  app.querySelector("#hlcap").textContent = c.label; app.querySelector("#hlcount").textContent = hl.list.length > 1 ? `${hl.i} of ${hl.list.length}` : "";
  v.src = HL_BASE + c.url; v.play().catch(() => {});
}
function hlStart(){
  const v = app.querySelector("#hlv"); if (!v || v === hl.v) return;
  hl.v = v; hl.list = []; hl.i = 0;
  v.onended = hlNext;
  v.onerror = () => { hlNote(/\.mkv/i.test(v.src) ? "These clips are MKV files, which can't play here. In OBS: Settings > Output > Recording Format > MP4." : "That clip couldn't play. Skipping it."); clearTimeout(hl.wait); hl.wait = setTimeout(hlNext, 3000); };
  hlNext();
}
function highlights(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), played = seriesGames(m).length;
  out.html = frame("hl", m, g, {title:SCOPE === "series" ? "Match" : played ? `Game ${played}` : "Game", script:"Highlights", sub:eventLine(m), split:[L, R],
    body:`<div class="hlv"><div class="scr"><video id="hlv" playsinline></video><div class="hlno" hidden></div></div><div class="hlcap"><span class="tape"><span id="hlcap"></span><em id="hlcount"></em></span></div></div>`});
  hlStart();
}

/* ---------- corner score bug (Fortnite Zone Wars and other round-scored games) ----------
   Sits flush in the top-right corner, over the island's own round tracker. Each team on a strip of paper in its colors:
   games won as pips, the current game's rounds in a big box. Rounds are tapped in the scorekeeper. */
let lastCorner = null;
function corner(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), need = Math.floor((+m.bestOf || 1) / 2) + 1;
  const n = m.status === "final" ? Math.max(1, (m.games || []).filter(x => x.winner).length) : (m.current || 1);
  const cur = (m.games || []).find(x => x.n === n) || {}, pts = s => s.us ? +cur.us || 0 : +cur.them || 0;
  const firstTo = +g.firstTo || 0, unit = g.unit || "Game";
  const row = (s, i) => `<div class="crow ${s.us ? "us" : "them"}" style="${skin(s)}"><div class="clg">${logoHTML(s.logo, s.name)}</div><b class="cnm" style="font-size:${fitName(s.name, 34, 190)}px">${esc(s.name)}</b>
      <span class="cpips">${Array.from({length:need}, (_, k) => `<i class="${k < s.won ? "on" : ""}"></i>`).join("")}</span><span class="csc" data-i="${i}">${m.status === "final" ? s.won : pts(s)}</span></div>`;
  out.html = `<div class="cbug">
      <div class="ctape">${m.status === "live" ? `<span class="dot"></span>` : ""}${esc(eventLine(m) || g.name)}</div>
      ${row(L, 0)}${row(R, 1)}
      <div class="cfoot">${m.status === "final" ? `<b>Final</b>` : `${esc(unit)} <em>${n}</em>${firstTo ? ` · First to <em>${firstTo}</em>` : ""}`} · Best of <em>${esc(m.bestOf)}</em></div></div>`;
  /* a round that just went up gets a pop */
  const now = [L, R].map(s => m.status === "final" ? s.won : pts(s));
  if (lastCorner) now.forEach((v, i) => { if (v > lastCorner[i]){ const el = app.querySelector(`.csc[data-i="${i}"]`); el?.classList.add("pop"); } });
  lastCorner = now;
}

/* ---------- box score popup (any scorekeeper-scored game, made for Fortnite) ----------
   A paper card centered on a transparent background, to drop over gameplay: both teams and the series score, each
   game's score, and Hartland's players with the stats typed into the scorekeeper (plus K/D when there are elims and
   deaths). ?scope=game shows only the game being played (or the last one finished). */
function boxScore(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), unit = g.unit || "Game", firstTo = +g.firstTo || 0;
  const games = (m.games || []).filter(x => x.winner || x.us || x.them).sort((a, b) => a.n - b.n);
  const thisGame = (m.games || []).find(x => x.n === m.current && (x.us || x.them || x.p)) || games[games.length - 1];
  const one = q.get("scope") === "game";
  const defs = (g.statList || []).filter(d => !d.avg);
  const has = k => defs.some(d => d.key === k), kd = has("elims") && has("deaths");
  const rows = (m.players || []).map(p => {
    const st = one ? (thisGame?.p?.[p.id] || null) : (p.stats && Object.keys(p.stats).length ? p.stats : null);
    return {p, st};
  }).filter(r => r.st || !one);
  const val = (st, k) => st && st[k] != null && st[k] !== "" ? +st[k] : null;
  const fmtKD = st => { const e = val(st, "elims"), d = val(st, "deaths"); return e == null ? "–" : d ? (Math.round(e / d * 100) / 100).toFixed(2) : e ? e.toFixed(2) : "0.00"; };
  const cols = [...defs.map(d => d.label), ...(kd ? ["K/D"] : [])];
  const team = s => `<div class="bxt ${s.us ? "us" : "them"}" style="${skin(s)}"><div class="bxl">${logoHTML(s.logo, s.name)}</div><b style="font-size:${fitName(s.name, 46, 280)}px">${esc(s.name)}</b><span class="bxw">${s.won}</span></div>`;
  const chip = x => `<span class="bxg${x.winner ? " " + (x.winner === "us" ? "w" : "l") : " live"}"><small>${esc(unit[0])}${x.n}</small>${L.us ? `${x.us || 0}–${x.them || 0}` : `${x.them || 0}–${x.us || 0}`}</span>`;
  out.html = `<div class="bxs">
    <div class="bxh"><span class="tape">${esc(eventLine(m) || g.name)}</span><i>${one && thisGame ? `${esc(unit)} ${thisGame.n} ` : ""}Box Score</i></div>
    <div class="bxteams">${team(L)}<span class="bxvs">${m.status === "final" ? "Final" : "Series"}</span>${team(R)}</div>
    ${games.length ? `<div class="bxgames">${(one && thisGame ? [thisGame] : games).map(chip).join("")}${firstTo ? `<em>First to ${firstTo} · Best of ${esc(m.bestOf)}</em>` : `<em>Best of ${esc(m.bestOf)}</em>`}</div>` : ""}
    ${rows.length && cols.length ? `<div class="bxtab" style="--n:${cols.length}"><div class="bxr hd"><span>${esc(US.short)}</span>${cols.map(c => `<span>${esc(c)}</span>`).join("")}</div>
      ${rows.map((r, i) => `<div class="bxr" style="--i:${i}"><b>${esc(tagOf(r.p) || nameOf(r.p))}${tagOf(r.p) && nameOf(r.p) !== tagOf(r.p) ? `<small>${esc(nameOf(r.p))}</small>` : ""}</b>${defs.map(d => `<span>${val(r.st, d.key) ?? "–"}</span>`).join("")}${kd ? `<span>${fmtKD(r.st)}</span>` : ""}</div>`).join("")}</div>`
      : `<p class="bxnone">Player stats show up here once they're typed into the scorekeeper.</p>`}
  </div>`;
}

/* ---------- post-game stats (full screen) ----------
   The match result, every game's score, then a card for each Hartland player with the stats typed into the
   scorekeeper (plus K/D when there are elims and deaths). The leader in the first stat gets the MVP sticker. */
function postGame(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), unit = g.unit || "Game";
  const games = (m.games || []).filter(x => x.winner || x.us || x.them).sort((a, b) => a.n - b.n);
  const defs = (g.statList || []).filter(d => !d.avg), has = k => defs.some(d => d.key === k), kd = has("elims") && has("deaths");
  const val = (st, k) => st && st[k] != null && st[k] !== "" ? +st[k] : null;
  const players = (m.players || []).map(p => ({p, st:p.stats || {}})).filter(r => Object.keys(r.st).length || !defs.length);
  const lead = defs[0] && players.length > 1 ? players.slice().sort((a, b) => (val(b.st, defs[0].key) ?? -1) - (val(a.st, defs[0].key) ?? -1))[0] : null;
  const mvp = lead && (val(lead.st, defs[0].key) ?? 0) > 0 ? lead.p.id : "";
  const fin = m.status === "final", us = L.us ? L : R, them = L.us ? R : L, won = us.won > them.won;
  const head = s => `<div class="pgt ${s.us ? "us" : "them"}" style="${skin(s)}"><div class="pgl">${logoHTML(s.logo, s.name)}</div><b style="font-size:${fitName(s.name, 64, 380)}px">${esc(s.name)}</b></div>`;
  const chip = x => `<span class="pgg${x.winner ? " " + (x.winner === "us" ? "w" : "l") : " live"}"><small>${esc(unit)} ${x.n}</small>${L.us ? `${x.us || 0}–${x.them || 0}` : `${x.them || 0}–${x.us || 0}`}</span>`;
  const kdOf = st => { const e = val(st, "elims"), d = val(st, "deaths"); return e == null ? "–" : d ? (Math.round(e / d * 100) / 100).toFixed(2) : e.toFixed(2); };
  const card = (r, i) => `<div class="pgc" style="${skin(us)};--i:${i}">${r.p.id === mvp ? `<span class="pgmvp">MVP</span>` : ""}
      <div class="pgn"><b style="font-size:${fitName(tagOf(r.p) || nameOf(r.p), 52, 360)}px">${esc(tagOf(r.p) || nameOf(r.p))}</b>${tagOf(r.p) && nameOf(r.p) !== tagOf(r.p) ? `<small>${esc(nameOf(r.p))}</small>` : ""}</div>
      <div class="pgs">${defs.map(d => `<span><em data-count="${i}">${val(r.st, d.key) ?? "–"}</em>${esc(d.label)}</span>`).join("")}${kd ? `<span><em>${kdOf(r.st)}</em>K/D</span>` : ""}</div></div>`;
  const score = `${L.won}–${R.won}`;
  out.html = frame("pg", m, g, {title:fin ? "Post Game" : `${unit} ${games.filter(x => x.winner).length || 1}`, script:"Stats", sub:eventLine(m), split:[L, R],
    body:`<div class="pgline">${head(L)}<div class="pgmid"><b>${score}</b><small>${fin ? (won ? "Eagles win!" : "Final") : "Series"}</small></div>${head(R)}</div>
      ${games.length ? `<div class="pggames">${games.map(chip).join("")}</div>` : ""}
      ${players.length && defs.length ? `<div class="pgcards" style="--n:${Math.min(players.length, 5)}">${players.slice(0, 5).map(card).join("")}</div>`
        : `<div class="pgcards"><p class="pgnone">Player stats show up here once they're typed into the scorekeeper.</p></div>`}`});
}

/* ---------- POV name plate: whose screen the stream is showing ----------
   One browser source per player's scene: ?slot=1 / ?slot=2 is that position in the match lineup (scorekeeper order),
   or ?player=TRE4TY. picks by gamertag or name. ?name=TAVIN753 shows a different in-game name. ?pos=bottom moves it
   from the top-left corner to the bottom middle. */
function pov(m){
  const ppl = m.players || [], want = String(q.get("player") || "").toLowerCase();
  const p = want ? ppl.find(x => [x.tag, x.name, x.id, tagOf(x), nameOf(x)].some(v => String(v || "").toLowerCase() === want))
    : ppl[Math.max(0, (+q.get("slot") || 1) - 1)];
  if (!p && !q.get("name")){ empty(`No player ${want ? `"${q.get("player")}"` : `in slot ${q.get("slot") || 1}`} in this match's lineup. Add the lineup in the scorekeeper (Players & stats).`); return; }
  const tag = q.get("name") || (p ? tagOf(p) || nameOf(p) : ""), real = p && tagOf(p) && nameOf(p) !== tag ? nameOf(p) : "";
  const us = sides(m).find(s => s.us);
  out.html = `<div class="pov ${q.get("pos") === "bottom" ? "bottom" : "tl"}" style="${skin(us)}"><div class="plg">${logoHTML(US.logo, US.short)}</div>
    <div class="pbody"><small>Now watching</small><b style="font-size:${fitName(tag, 52, 330)}px">${esc(tag)}</b>${real || m.teamName ? `<span>${esc([real, m.teamName].filter(Boolean).join(" · "))}</span>` : ""}</div></div>`;
}

/* ---------- two POVs at once (Fortnite duos) ----------
   A full-screen frame with two see-through 16:9 windows. In OBS, put each player's NDI source under this overlay and
   size it to its window: left window X 43, Y 214, 896 x 504; right window X 981, Y 214, 896 x 504 (?bg=1 shows the
   numbers). Each window is labeled with that player and their stats for this game; the score bug sits on top.
   Who's in each window: the first two players in the scorekeeper's lineup, or ?left=TRE4TY&right=Gavin (gamertag or
   name), or ?swap=1 to switch them. ?leftName= / ?rightName= show a different in-game name. */
const DUO_WIN = [{x:43, y:214}, {x:981, y:214}], DUO_W = 896, DUO_H = 504;
function findPlayer(m, want, slot){
  const ppl = m.players || [], k = String(want || "").toLowerCase();
  return k ? ppl.find(x => [x.tag, x.name, x.id, tagOf(x), nameOf(x)].some(v => String(v || "").toLowerCase() === k)) : ppl[slot];
}
function duoPov(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), us = L.us ? L : R, unit = g.unit || "Game";
  let picks = [findPlayer(m, q.get("left"), 0), findPlayer(m, q.get("right"), 1)];
  if (q.get("swap")) picks = picks.reverse();
  const names = [q.get(q.get("swap") ? "rightName" : "leftName"), q.get(q.get("swap") ? "leftName" : "rightName")];
  const n = m.status === "final" ? Math.max(1, (m.games || []).filter(x => x.winner).length) : (m.current || 1);
  const cur = (m.games || []).find(x => x.n === n) || {}, defs = (g.statList || []).filter(d => !d.avg);
  const val = (st, k) => st && st[k] != null && st[k] !== "" ? +st[k] : null;
  const plate = (p, i) => { const tag = names[i] || (p ? tagOf(p) || nameOf(p) : `Player ${i + 1}`), real = p && tagOf(p) && nameOf(p) !== tag ? nameOf(p) : "";
    const gs = p ? cur.p?.[p.id] : null, ms = p?.stats || {};
    const stats = defs.slice(0, 3).map(d => `<span><em>${val(gs, d.key) ?? 0}</em>${esc(d.label)}<small>${val(ms, d.key) ?? 0} in match</small></span>`).join("");
    return `<div class="dpl d${i}" style="left:${DUO_WIN[i].x}px;top:${DUO_WIN[i].y + DUO_H + 18}px;width:${DUO_W}px">
      <div class="dplate" style="${skin(us)}"><div class="dlg">${logoHTML(US.logo, US.short)}</div><div class="dnm"><b style="font-size:${fitName(tag, 56, 420)}px">${esc(tag)}</b>${real ? `<small>${esc(real)}</small>` : ""}</div>
      ${stats ? `<div class="dst"><i>${esc(unit)} ${n}</i>${stats}</div>` : ""}</div></div>`; };
  splitShell(m, [plate(picks[0], 0), plate(picks[1], 1)], ["Left POV", "Right POV"]);
}
/* The split-screen frame: background cut out where the two windows are, the plates under them, the game chips, and
   the score bug on top (Rocket League's live one when the game feeds it). */
function splitShell(m, plates, guides, cls = ""){
  const g = gameFor(site, m.game), [L] = sides(m), unit = g.unit || "Game";
  const win = i => `<div class="dwin d${i}" style="left:${DUO_WIN[i].x}px;top:${DUO_WIN[i].y}px;width:${DUO_W}px;height:${DUO_H}px">${q.get("bg") ? `<span class="dguide">${esc(guides[i])} · X ${DUO_WIN[i].x}, Y ${DUO_WIN[i].y} · ${DUO_W} × ${DUO_H}</span>` : ""}</div>`;
  const games = (m.games || []).filter(x => x.winner || x.us || x.them).sort((a, b) => a.n - b.n);
  const chip = x => `<span class="dgc${x.winner ? " " + (x.winner === "us" ? "w" : "l") : " live"}"><small>${esc(unit[0])}${x.n}</small>${g.points ? (L.us ? `${x.us || 0}–${x.them || 0}` : `${x.them || 0}–${x.us || 0}`) : x.winner === "us" ? "W" : x.winner ? "L" : "Live"}</span>`;
  const firstTo = +g.firstTo || 0;
  const foot = `<div class="dfoot"><span class="tape">${games.map(chip).join("")}${firstTo ? `First to <em>${firstTo}</em> · ` : ""}Best of <em>${esc(m.bestOf)}</em></span></div>`;
  /* the frame is cut out where the two windows are, so what's underneath shows through */
  const holes = DUO_WIN.map(w => `linear-gradient(#000,#000) ${w.x}px ${w.y}px/${DUO_W}px ${DUO_H}px no-repeat`).join(",");
  const art = artFor(m, g);
  const wrap = bug => `<div class="duo ${cls}">
    <div class="dbg" style="-webkit-mask:linear-gradient(#000,#000),${holes};-webkit-mask-composite:xor;mask-composite:exclude">
      <div class="full"><div class="half solo" style="${skin(OUR_COLORS)}"></div><div class="fab"></div>${art ? `<div class="art" style="background-image:url('${esc(art)}')"></div>` : ""}<div class="vig"></div>
      <div class="scrap br"><i></i></div>${claw("stk")}</div></div>
    ${win(0)}${win(1)}${plates.join("")}${foot}${bug}</div>`;
  if (g.liveFeed === "sos"){ startSOS(); rlbug(m, wrap); } else scorebug(m, wrap);
}

/* ---------- instant replay + live (every game) ----------
   Same frame: the left window plays the newest clip and loops it, the right window is see-through for the live game.
   Clips come from OBS's replay buffer through the LevelUP Relay: press OBS's "Save Replay" hotkey, or tap Instant
   replay in the scorekeeper (it asks the relay on the streaming PC to save one). Save the clip while the full-screen
   gameplay scene is on, then cut to this scene. ?slow=0.5 plays it at half speed, ?last=8 plays only the last 8 seconds,
   ?sound=1 keeps the clip's audio (muted by default so it doesn't fight the live game). */
const RP = {cur:null, label:"", at:"", poll:null, slow:Math.min(1, Math.max(.1, +q.get("slow") || 1)), last:+q.get("last") || 0, note:""};
function rpVideo(){
  let box = document.getElementById("rpbox");
  if (!box){ box = document.createElement("div"); box.id = "rpbox"; box.innerHTML = `<video id="rpv" playsinline loop${q.get("sound") ? "" : " muted"}></video>`;
    Object.assign(box.style, {left:DUO_WIN[0].x + "px", top:DUO_WIN[0].y + "px", width:DUO_W + "px", height:DUO_H + "px"}); document.body.insertBefore(box, app);
    const v = box.firstChild;
    v.onloadedmetadata = () => { v.playbackRate = RP.slow; if (RP.last && v.duration > RP.last) v.currentTime = v.duration - RP.last; v.play().catch(() => {}); };
    v.ontimeupdate = () => { if (RP.last && v.duration > RP.last && v.currentTime < v.duration - RP.last - .5) v.currentTime = v.duration - RP.last; };
    v.onended = () => { v.currentTime = RP.last && v.duration > RP.last ? v.duration - RP.last : 0; v.play().catch(() => {}); };
    v.onerror = () => { RP.note = /\.mkv/i.test(v.src) ? "Clips are MKV, which can't play here. OBS: Settings > Output > Recording Format > MP4." : "That replay couldn't play."; draw(); };
  }
  return box.firstChild;
}
async function rpPoll(){
  clearTimeout(RP.poll); RP.poll = setTimeout(rpPoll, 1500);
  if (offAir || LAYER !== "replay-live") return;
  let list = null; try { list = (await (await fetch(HL_BASE + "/clips", {cache:"no-store"})).json()).clips || []; } catch(e){}
  const note = list === null ? "Replays come from the LevelUP Relay on this PC. Start it, then show this scene again." : !list.length ? "No replay yet. Save one with OBS's Save Replay hotkey or Instant replay in the scorekeeper." : "";
  const c = (list || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at))).pop();
  if (c && c.id !== RP.cur){ RP.cur = c.id; RP.label = c.label || "Replay"; RP.at = c.at; RP.note = ""; const v = rpVideo(); v.src = HL_BASE + c.url; draw(); }
  else if (note !== RP.note && !(RP.cur && note)){ RP.note = note; draw(); }
}
function replayLive(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), unit = g.unit || "Game";
  rpVideo(); if (!RP.poll) rpPoll();
  const n = m.status === "final" ? Math.max(1, (m.games || []).filter(x => x.winner).length) : (m.current || 1), cur = (m.games || []).find(x => x.n === n) || {};
  const pts = g.points && (cur.us || cur.them) ? ` · ${esc(g.points)} ${L.us ? `${cur.us || 0}–${cur.them || 0}` : `${cur.them || 0}–${cur.us || 0}`}` : "";
  const left = `<div class="dpl d0" style="left:${DUO_WIN[0].x}px;top:${DUO_WIN[0].y + DUO_H + 18}px;width:${DUO_W}px"><div class="dplate rp" style="${skin(OUR_COLORS)}"><i class="rptag">Replay</i>
      <div class="dnm"><b style="font-size:${fitName(RP.label || "Instant replay", 50, 520)}px">${esc(RP.note ? "Instant replay" : RP.label || "Instant replay")}</b><small>${RP.note ? esc(RP.note) : RP.slow < 1 ? `Slow motion · ${RP.slow}x` : "Instant replay"}</small></div></div></div>`;
  const right = `<div class="dpl d1" style="left:${DUO_WIN[1].x}px;top:${DUO_WIN[1].y + DUO_H + 18}px;width:${DUO_W}px"><div class="dplate lv" style="${skin(OUR_COLORS)}"><i class="lvtag"><span class="dot"></span>Live</i>
      <div class="dnm"><b style="font-size:${fitName(m.teamName || g.name, 50, 520)}px">${esc(m.status === "final" ? "Final" : `${unit} ${n}`)}</b><small>${esc(m.teamName || g.name)}${pts}</small></div></div></div>`;
  splitShell(m, [left, right], ["Replay plays here (no source needed)", "Live game source"], "rplive");
}

/* ---------- wiring ---------- */
const LAYERS = {scorebug, vs, lineups, "team-compare":teamCompare, "player-compare":playerCompare, "rl-team":rlTeam, "rl-players":rlPlayers, "rl-box":rlBox, highlights, corner, pov, "box-score":boxScore, "post-game":postGame, "smash-vs":smashVs, "duo-pov":duoPov, "replay-live":replayLive};
const RL_LAYER = /^rl-/.test(LAYER || "");
let rlDrawAt = 0, rlDrawTimer = null;
/* Full-screen graphics wait (up to 2.5 s) for season results so the entrance plays with the real numbers. */
let finalsReady = ["scorebug", "replay-live", "duo-pov"].includes(LAYER);   // these don't use season results, so they draw right away
setTimeout(() => { if (!finalsReady){ finalsReady = true; draw(); } }, 2500);
function draw(){
  if (!finalsReady || offAir) return;
  if (!station.matchId && !station.show?.on){ empty(`Station ${STATION} has no match on it. Pick one in the scorekeeper.`); return; }
  if (!match){ empty("Loading the match…"); return; }
  const g = gameFor(site, match.game);
  if ((LAYER || "scorebug") === "scorebug" && g.liveFeed === "sos"){ startSOS(); rlbug(match); return; }
  if (RL_LAYER){
    if (g.liveFeed !== "sos"){ empty("This graphic is for Rocket League matches."); return; }
    startSOS();
    /* the game sends 30 updates a second; full-screen graphics only need a couple */
    const wait = 500 - (Date.now() - rlDrawAt);
    if (wait > 0){ if (!rlDrawTimer) rlDrawTimer = setTimeout(() => { rlDrawTimer = null; draw(); }, wait); return; }
    rlDrawAt = Date.now(); diag();
  }
  (LAYERS[LAYER] || scorebug)(match);
}
/* Replay the entrance: OBS tells a Browser Source when its scene goes live, so every cut to this graphic animates in. */
function replay(){ clearTimeout(held); held = null; enterUntil = 0; lastHTML = ""; lastScores = null; lastCorner = null; rlStatic = ""; draw(); }
/* OBS keeps showing a Browser Source's last frame for a moment when it comes back on screen. So the moment a graphic is
   hidden (eye icon off, or its scene switched away) it clears itself and stops drawing; nothing old can flash when it
   returns, and it starts straight into its entrance. */
let obsVisible = true, obsActive = true, offAir = false;
function obsState(){
  const off = !obsVisible || !obsActive;
  if (off === offAir) return; offAir = off;
  if (off){ const rv = document.getElementById("rpv"); if (rv){ rv.pause(); } clearTimeout(held); held = null; clearTimeout(rlDrawTimer); rlDrawTimer = null; enterUntil = 0; lastHTML = ""; lastScores = null; rlStatic = ""; app.innerHTML = ""; document.querySelectorAll(".splash").forEach(el => el.remove()); }
  else { const rv = document.getElementById("rpv"); if (rv && rv.src) rv.play().catch(() => {}); replay(); }
}
window.addEventListener("obsSourceActiveChanged", e => { obsActive = !!e.detail?.active; obsState(); });
window.addEventListener("obsSourceVisibleChanged", e => { obsVisible = !!e.detail?.visible; obsState(); });
if (q.get("bg")) document.addEventListener("keydown", e => { if (e.key === "r") replay(); });   // preview: press R to replay
/* ---------- record broken: big splash on the stream where it happened ----------
   The scorekeeper's "Fire it" puts {id, holder, title, game, display, prev, at} on this station. Only the score bug
   shows it (so a scene with several overlays doesn't show it twice), only once, and only if it's fresh. */
const seenSplash = new Set();
function splash(sp){
  if (!sp?.id || seenSplash.has(sp.id)) return; seenSplash.add(sp.id);
  if ((LAYER || "scorebug") !== "scorebug" || Date.now() - new Date(sp.at).getTime() > 90000) return;
  const el = document.createElement("div"); el.className = "splash";
  el.innerHTML = `${claw("sp-claw")}<div class="sp-wrap"><div class="sp-band"><div class="sp-in">
      <p class="sp-kicker">New Hartland record</p>
      <b class="sp-name grunge">${esc(sp.holder)}</b>
      <p class="sp-what"><span>${esc(sp.game ? sp.game + " · " : "")}${esc(sp.title)}</span><em>${esc(sp.display)}</em></p>
      ${sp.prev?.name ? `<p class="sp-prev">Previous: ${esc(sp.prev.name)}, ${esc(sp.prev.display)}</p>` : ""}
    </div></div></div><i class="sp-script">Record broken!</i><div class="flash"></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("out"), 9000);
  setTimeout(() => el.remove(), 10200);
}
/* ---------- showmatch: a 1v1 or scrim between our own players, run from the scorekeeper's Stream overlays panel ----------
   station.show = {on, game, bestOf, title, nameStyle:"tag"|"first"|"both", left:{id,name,tag}, right:{...}, won:[l, r]}.
   It replaces the station's match: both sides get the Hartland logo and colors, named after the players. Nothing is
   stored anywhere but the station (no match, no stats, never on the website). In Rocket League the left player is
   found in the lobby to work out who's blue; finished games count themselves as usual. */
function showLabel(p, style){
  const first = String(p?.name || "").trim().split(/\s+/)[0] || "", tag = String(p?.tag || "").trim();
  if (style === "first") return first || tag || "Player";
  if (style === "both") return first && tag ? `${first} "${tag}"` : first || tag || "Player";
  return tag || first || "Player";
}
function showMatch(st){
  const sh = st.show || {}, won = [+(sh.won?.[0]) || 0, +(sh.won?.[1]) || 0], g = gameFor(site, sh.game || "rocket-league");
  const games = [...Array(won[0]).fill("us"), ...Array(won[1]).fill("them")].map((w, i) => ({n:i + 1, winner:w, us:0, them:0}));
  const L = {id:sh.left?.id || "show-l", name:sh.left?.name || "", tag:sh.left?.tag || ""}, R = {id:sh.right?.id || "show-r", name:sh.right?.name || "", tag:sh.right?.tag || ""};
  return {id:`show-${STATION}-${sh.started || 0}`, show:true, game:g.key, gameName:g.name, status:"live", bestOf:+sh.bestOf || 5, score:{us:won[0], them:won[1]}, games, current:games.length + 1,
    teamName:sh.title || "Showmatch", event:sh.title || "Showmatch", league:"", stage:"regular",
    opponent:{school:"", team:showLabel(R, sh.nameStyle), short:showLabel(R, sh.nameStyle)}, players:[L], showSides:[showLabel(L, sh.nameStyle), showLabel(R, sh.nameStyle)], showR:R};
}
/* Instant replay tapped in the scorekeeper: every overlay on the streaming PC asks the relay to save one (it ignores repeats). */
let replayAsked = "";
function askReplay(r){
  if (!r?.id || r.id === replayAsked || Date.now() - new Date(r.at).getTime() > 20000) return; replayAsked = r.id;
  fetch(`${HL_BASE}/save?id=${encodeURIComponent(r.id)}&label=${encodeURIComponent(r.label || "Replay")}${r.scene ? `&scene=${encodeURIComponent(r.scene)}&back=${+r.back || 0}` : ""}`, {cache:"no-store"}).catch(() => {});
}
watchBroadcast(b => {
  const next = (b.stations || {})[STATION] || {};
  if (next.splash) splash(next.splash);
  askReplay(next.replay);
  if (next.show?.on){
    if (stopMatch){ Promise.resolve(stopMatch).then(f => f && f()); stopMatch = null; }
    const was = station.show?.on; station = next; match = showMatch(next);
    if (!was){ lastScores = null; lastHTML = ""; rlStatic = ""; }
    draw(); return;
  }
  if (station.show?.on){ station = {}; match = null; lastHTML = ""; rlStatic = ""; }
  if (next.matchId !== station.matchId){ lastScores = null; lastHTML = ""; rlStatic = ""; match = null; if (stopMatch) Promise.resolve(stopMatch).then(f => f && f()); stopMatch = watchMatch(next.matchId, mm => { match = mm; draw(); }); }
  station = next; draw();
});
if (LAYER !== "scorebug") watchFinals(site, list => { finals = list; finalsReady = true; draw(); });
