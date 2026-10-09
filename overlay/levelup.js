/* LevelUP overlays. Each overlay page is an OBS Browser Source (1920 x 1080) that follows one streaming station:
   ?station=1 (default). The scorekeeper decides which match is on each station; every overlay updates itself live.
   Layers: scorebug, vs, lineups, team-compare, player-compare. Add ?bg=1 to see an overlay on a grey test background. */
import {gameFor, oppShort, roundLabel, postseason, seasonOf, shortSchool, slug, fmtStat, fmtTime, listOf} from "../assets/matches.js?v=16";
import {watchBroadcast, watchMatch, watchFinals} from "../assets/live.js?v=24";

const q = new URLSearchParams(location.search);
const STATION = q.get("station") || "1", LAYER = document.body.dataset.layer;
if (q.get("bg")) document.body.classList.add("bg");
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
const logoHTML = (img, name) => `<div class="logo">${img ? `<img src="${esc(src(img))}" alt="" onerror="this.parentElement.innerHTML='<div class=&quot;mono&quot;>${monogram(name)}</div>'">` : `<div class="mono">${monogram(name)}</div>`}</div>`;
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
const gameLogo = g => g.icon ? src(g.icon) : "";
/* Background artwork for full-screen graphics: this team's photo/art first, then the game's. */
const artFor = (m, g) => src((site.teams || []).find(t => t.id === m.teamId)?.art || g.art || "");
function frame(cls, m, g, {title = "", sub = "", body = "", foot = ""} = {}){
  const art = artFor(m, g), gl = gameLogo(g);
  return `<div class="full ${cls}">${art ? `<div class="art" style="background-image:url('${esc(art)}')"></div>` : ""}<div class="streaks"></div><div class="vig"></div>
    <div class="blade t"></div><div class="blade t2"></div><div class="blade b"></div><div class="blade b2"></div>
    <header class="top">${gl ? `<img class="glogo" src="${esc(gl)}" alt="${esc(g.name)}">` : ""}${title ? `<b>${esc(title)}</b>` : ""}${sub ? `<small>${esc(sub)}</small>` : ""}</header>
    ${body}${foot ? `<div class="foot">${foot}</div>` : ""}<div class="flash"></div></div>`;
}
const empty = msg => { clearTimeout(held); held = null; enterUntil = 0; lastHTML = ""; app.innerHTML = q.get("bg") ? `<div class="empty">${esc(msg)}</div>` : ""; };

/* ---------- score bug ---------- */
let lastScores = null;
function scorebug(m){
  const g = gameFor(site, m.game), [L, R] = sides(m), need = Math.floor((+m.bestOf || 1) / 2) + 1, cur = (m.games || []).find(x => x.n === m.current);
  const unit = g.unit || "Game", live = m.status === "live", fin = m.status === "final", gl = gameLogo(g);
  const state = fin ? `<b class="fin">Final</b>` : live ? `<b>${esc(unit)} ${m.current || 1}${g.points && cur && (cur.us || cur.them) ? ` · ${station.swap ? `${cur.them}-${cur.us}` : `${cur.us}-${cur.them}`}` : ""}</b>` : `<b>${esc(fmtTime(m.startsAt))}</b>`;
  const who = (s, r) => { const pic = s.now ? charImg(g, s.now.char) : "", img = pic ? `<img src="${esc(pic)}" alt="" onerror="this.remove()">` : "";
    return s.now ? `<small>${r ? "" : img}${esc(s.now.name)}${s.now.char ? ` · ${esc(s.now.char)}` : ""}${r ? img : ""}</small>` : `<small>${esc(s.us ? s.team : s.team || s.school)}</small>`; };
  const wing = (s, r) => { const lg = `<div class="lg">${logoHTML(s.logo, s.name)}</div>`, nm = `<div class="nm"><b>${esc(s.name)}</b>${who(s, r)}</div>`, sc = `<div class="sc" data-side="${r ? "r" : "l"}"><span>${s.score}</span></div>`;
    return `<div class="wing ${r ? "r" : "l"} ${s.us ? "us" : "them"}">${r ? sc + nm + lg : lg + nm + sc}</div>`; };
  const pips = (s, rev) => `<span class="pips">${Array.from({length:need}, (_, i) => { const k = rev ? need - 1 - i : i; return `<i class="${k < s.won ? "on" : ""}" data-k="${k}"></i>`; }).join("")}</span>`;
  out.html = `<div class="bug">
      <div class="ev">${live ? `<span class="dot"></span>` : ""}${esc(eventLine(m) || g.name)}</div>
      <div class="bar">${wing(L)}<div class="mid">${gl ? `<img src="${esc(gl)}" alt="${esc(g.name)}">` : `<span class="gname">${esc(g.short || g.name)}</span>`}${state}</div>${wing(R, true)}</div>
      <div class="sub">${pips(L)}<span>Best of <em>${esc(m.bestOf)}</em></span>${pips(R, true)}</div>
    </div>`;
  /* a score that just changed rolls in with a gold flash; a newly won game lights its pip */
  if (lastScores){
    [["l", L, 0], ["r", R, 1]].forEach(([side, s, idx]) => {
      if (s.score !== lastScores[idx].score){ const el = app.querySelector(`.sc[data-side="${side}"]`); el?.classList.add("hit"); }
      if (s.won > lastScores[idx].won){ const box = app.querySelectorAll(".sub .pips")[idx]; box?.querySelector(`i[data-k="${s.won - 1}"]`)?.classList.add("new"); }
    });
  }
  lastScores = [{score:L.score, won:L.won}, {score:R.score, won:R.won}];
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
  out.html = frame("vs", m, g, {sub:eventLine(m), body:`${side(L, "l")}<div class="vsx gold-text">VS</div>${side(R, "r")}`, foot});
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
    return `<div class="p" style="--i:${i}"><div class="pic">${charImg(g, ch) ? `<img src="${esc(charImg(g, ch))}" alt="" onerror="this.remove()">` : `<span>${monogram(nameOf(p))}</span>`}</div>
      <div><b>${esc(tagOf(p) || nameOf(p))}</b><small>${esc([tagOf(p) ? nameOf(p) : "", yr ? `Class of ${yr}` : ""].filter(Boolean).join(", "))}</small></div>
      <div class="tag">${role && g.roleIcons?.[role] ? `<img src="${esc(src(g.roleIcons[role]))}" alt="${esc(role)}">` : ""}${esc(ch)}</div></div>`; }).join("");
  const theirs = listOf(station.oppLineup).map((n, i) => `<div class="p" style="--i:${i}"><div><b>${esc(n)}</b></div></div>`).join("");
  const col = (s, html, c) => `<div class="col ${c}"><h2>${logoHTML(s.logo, s.name)}${esc(s.name)}</h2>${html || `<div class="p"><div><small>Lineup to come</small></div></div>`}</div>`;
  const n = Math.max(1, (m.players || []).length, listOf(station.oppLineup).length), h = Math.min(104, Math.floor(640 / n) - 12);
  out.html = frame("lu", m, g, {title:"Starting lineups", sub:eventLine(m),
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
  out.html = frame("cmp", m, g, {title:"Tale of the tape", sub:eventLine(m), foot:h2h.length ? "" : "First meeting",
    body:`<div class="heads">${head(L, "l")}<div class="vsx gold-text">VS</div>${head(R, "r")}</div><div class="rows">${rowsHTML(ordered)}</div>`});
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
  out.html = frame("cmp", m, g, {title:"Player comparison", sub:`${m.teamName}, this season`, foot:"Averages per match",
    body:`<div class="heads">${head(a)}<div class="vsx gold-text">VS</div>${head(b, true)}</div><div class="rows">${rowsHTML(rows)}</div>`});
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
  (LAYERS[LAYER] || scorebug)(match);
}
/* Replay the entrance: OBS tells a Browser Source when its scene goes live, so every cut to this graphic animates in. */
function replay(){ clearTimeout(held); held = null; enterUntil = 0; lastHTML = ""; lastScores = null; draw(); }
window.addEventListener("obsSourceActiveChanged", e => { if (e.detail?.active) replay(); });
window.addEventListener("obsSourceVisibleChanged", e => { if (e.detail?.visible) replay(); });
if (q.get("bg")) document.addEventListener("keydown", e => { if (e.key === "r") replay(); });   // preview: press R to replay
watchBroadcast(b => {
  const next = (b.stations || {})[STATION] || {};
  if (next.matchId !== station.matchId){ lastScores = null; lastHTML = ""; match = null; if (stopMatch) Promise.resolve(stopMatch).then(f => f && f()); stopMatch = watchMatch(next.matchId, mm => { match = mm; draw(); }); }
  station = next; draw();
});
if (LAYER !== "scorebug") watchFinals(site, list => { finals = list; finalsReady = true; draw(); });
