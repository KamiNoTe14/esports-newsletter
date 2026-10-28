/* Live match data for the public site: scores strip (home), Results page, player profiles.
   Live scores come from the Firestore "public/scoreboard" summary (pushed instantly, about 1 read per update).
   Finished matches with full detail come from the repo backup, data/matches/<season>.json
   (refreshed automatically every hour by a GitHub Action). The two are merged by match id. */
import {slug, seasonOf, seasonList, seasonLabel, gameFor, oppShort, rivalFor, roundLabel, postseason, fmtStat, fmtDay, fmtTime, isMock, FIREBASE_CONFIG, schoolInfo, shortSchool} from "./matches.js?v=20";
import {bioDraft, isSenior, buildRecords, programRecords, legacyRecords, termLabel} from "./records.js?v=3";

const BASE = new URL("../", import.meta.url).href;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safe = u => /^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "";
const $ = s => document.querySelector(s);

/* ---------- data ---------- */
async function getJSON(p){ const r = await fetch(BASE + p + "?v=" + Date.now(), {cache:"no-store"}); if (!r.ok) throw new Error(p); return r.json(); }
export async function archive(season){ try { return (await getJSON(`data/matches/${season}.json`)).matches || []; } catch(e){ return []; } }
async function archiveSeasons(){ try { return (await getJSON("data/matches/index.json")).seasons || []; } catch(e){ return [seasonOf()]; } }

/* Live documents from Firestore. Each calls cb(data) now and again on every change.
   If the live connection can't start, it re-checks every 30 seconds instead. */
let _db = null;
function db(){
  return _db = _db || (async () => {
    const fb = await import(BASE + "assets/vendor/firebase-read.js");
    const app = fb.initializeApp(FIREBASE_CONFIG, "site");
    return {fb, db:fb.initializeFirestore(app, {localCache:fb.memoryLocalCache()})};
  })();
}
async function watchDoc(id, mockKey, cb){
  const empty = {matches:[]};
  if (isMock()){
    const read = () => { try { return JSON.parse(localStorage.getItem(mockKey)) || empty; } catch(e){ return empty; } };
    cb(read()); window.addEventListener("storage", e => { if (e.key === mockKey) cb(read()); }); return;
  }
  try { const {fb, db:d} = await db(); fb.onSnapshot(fb.doc(d, "public", id), s => cb(s.exists() ? s.data() : empty), () => poll(id, cb)); }
  catch(e){ poll(id, cb); }
}
export function watchBoard(cb){ return watchDoc("scoreboard", "eagles-mock-scoreboard", cb); }
/* Every finished match of a season in full detail (lineups, stats), updated the moment a match goes final. */
export function watchSeason(season, cb){ return watchDoc("season-" + season, "eagles-mock-season-" + season, cb); }
/* LevelUP: which match each streaming station shows, and one match in full detail (match documents are public to read). */
export function watchBroadcast(cb){ return watchDoc("broadcast", "eagles-mock-broadcast", cb); }
export async function watchMatch(id, cb){
  if (!id){ cb(null); return () => {}; }
  if (isMock()){
    const read = () => { try { const all = JSON.parse(localStorage.getItem("eagles-mock-matches")) || {}; return all[id] ? {id, ...all[id]} : null; } catch(e){ return null; } };
    cb(read()); const h = e => { if (e.key === "eagles-mock-matches") cb(read()); }; window.addEventListener("storage", h); const t = setInterval(() => cb(read()), 1500);
    return () => { window.removeEventListener("storage", h); clearInterval(t); };
  }
  const {fb, db:d} = await db();
  return fb.onSnapshot(fb.doc(d, "matches", id), s => cb(s.exists() ? {id:s.id, ...s.data()} : null), () => {});
}
/* Stream ticker announcements, written from the scorekeeper. */
export function watchTicker(cb){ return watchDoc("ticker", "eagles-mock-ticker", cb); }
/* Past players and the list of seasons that have results. */
export function watchDirectory(cb){ return watchDoc("directory", "eagles-mock-directory", d => cb({alumni:Array.isArray(d.alumni) ? d.alumni : [], seasons:Array.isArray(d.seasons) ? d.seasons : []})); }
/* Everyone we know by id (current rosters, then past players), so names stay right even if a match stored an old spelling. */
const PEOPLE = new Map();
function learnPeople(site, dir){
  learnSchools(site);
  (site?.teams || []).forEach(t => (t.roster || []).forEach(p => { if (p.id) PEOPLE.set(p.id, {name:p.name || "", tag:p.tag || "", private:!!p.private}); }));
  [...(site?.alumni || []), ...(dir?.alumni || [])].forEach(p => { if (p.id && !PEOPLE.has(p.id)) PEOPLE.set(p.id, {name:p.name || "", tag:p.tag || "", private:!!p.private, alum:true, gradYear:p.gradYear || ""}); });
}
/* Alumni: the Site Manager's Alumni list (graduates) first, then the scorekeeper's Past players; one entry per person */
function alumniOf(site, dir){
  const k = x => String(x || "").trim().toLowerCase(), same = (a, p) => a.id === p.id || (p.name && k(a.name) === k(p.name)) || (!p.name && !a.name && p.tag && k(a.tag) === k(p.tag));
  const gone = new Set(site?.removedPlayers || []);
  const out = (site?.alumni || []).filter(a => a.id && (a.name || a.tag)).map(a => ({...a}));
  (dir?.alumni || []).forEach(a => { if (!a.id || !(a.name || a.tag) || gone.has(a.id)) return; const have = out.find(x => same(x, a));
    if (have){ if (!have.now && a.now) have.now = a.now; if (!have.gradYear && a.gradYear) have.gradYear = a.gradYear; } else out.push({...a}); });
  return out;
}
function poll(id, cb){
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/public/${id}?key=${FIREBASE_CONFIG.apiKey}`;
  const tick = async () => { try { const r = await fetch(url, {cache:"no-store"}); if (r.ok) cb(fromRest((await r.json()).fields || {})); } catch(e){} };
  tick(); setInterval(tick, 30000);
}
function fromRest(fields){ /* Firestore REST value format -> plain JSON */
  const v = x => x == null ? null : "stringValue" in x ? x.stringValue : "integerValue" in x ? +x.integerValue : "doubleValue" in x ? x.doubleValue
    : "booleanValue" in x ? x.booleanValue : "nullValue" in x ? null : "arrayValue" in x ? (x.arrayValue.values || []).map(v)
    : "mapValue" in x ? Object.fromEntries(Object.entries(x.mapValue.fields || {}).map(([k, y]) => [k, v(y)])) : x.timestampValue || null;
  return Object.fromEntries(Object.entries(fields).map(([k, y]) => [k, v(y)]));
}
/* archive (full detail) + scoreboard (freshest status/score), newest data wins */
export function merge(archived, board){
  const by = new Map(archived.map(m => [m.id, m]));
  (board?.matches || []).forEach(b => { const a = by.get(b.id); by.set(b.id, a ? {...a, ...b, games:(b.games || []).length ? b.games : a.games, players:a.players, stream:{...(a.stream || {}), ...(b.stream || {})}} : b); });
  const list = [...by.values()];
  list.forEach(m => knowSchool(m.opponent?.school, m.opponent?.team));
  return list.map(fillSchool);
}
/* Older matches (from before the school field, or imported) often have only a team name like "Niles Vikings Varsity".
   Work out the school from: the Team → school list, a team name seen with a school on another match, or a known
   school whose name the team name starts with ("Niles" → Niles High School). Every school seen anywhere is remembered,
   so the more seasons load, the more of these match up. */
const KNOWN = new Map(), TEAM_SCHOOL = new Map();
const sKey = n => shortSchool(n).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function knowSchool(school, team){
  const n = String(school || "").trim(); if (!n || /hartland/i.test(n)) return;
  const k = sKey(n); if (k.length >= 3 && (!KNOWN.has(k) || n.length > KNOWN.get(k).length)) KNOWN.set(k, n);
  if (team) TEAM_SCHOOL.set(String(team).trim().toLowerCase(), n);
}
function learnSchools(site){
  (site?.highSchools || []).forEach(x => { knowSchool(x.name); if (x.short && sKey(x.short).length >= 4) KNOWN.set(sKey(x.short), x.name); });
  Object.entries(site?.teamSchools || {}).forEach(([t, sc]) => knowSchool(sc, t));
}
function fillSchool(m){
  const o = m.opponent; if (!o || m.bye || String(o.school || "").trim() || !String(o.team || "").trim()) return m;
  const team = String(o.team).trim(), exact = TEAM_SCHOOL.get(team.toLowerCase());
  let school = exact;
  if (!school){ const t = " " + team.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " "; let best = "";
    KNOWN.forEach((n, k) => { if (k.length >= 4 && t.startsWith(" " + k + " ") && k.length > best.length) best = k; });
    school = best ? KNOWN.get(best) : ""; }
  return school ? {...m, opponent:{...o, school, schoolGuessed:true}} : m;
}

/* ---------- shared bits ---------- */
const opp = m => oppShort(m);
const oppFull = m => m.opponent?.team || m.opponent?.school || "TBD";
/* Opponent logo: the match's own, else the School library's. A logo that fails to load just disappears. */
let SITE_REF = null;
const oppLib = m => schoolInfo(SITE_REF, m.opponent?.school);
const oppLogoSrc = m => { const u = String(m.opponent?.logo || oppLib(m)?.logo || "").trim(); return !u ? "" : /^(https?:|data:)/.test(u) ? u : BASE + u.replace(/^\//, ""); };
const oppLogo = (m, cls) => { const u = oppLogoSrc(m); return u ? `<img class="${cls || "opp-logo"}" src="${esc(u)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ""; };
function badge(site, m, cls = "gbadge"){
  const g = gameFor(site, m.game);
  return `<span class="${cls}${g.icon ? " has-img" : ""}" title="${esc(g.name || m.gameName || "")}">${g.icon ? `<img src="${esc(/^https?:/.test(g.icon) ? g.icon : BASE + g.icon)}" alt="${esc(g.short || g.name || "")}">` : esc(g.abbr || (g.short || "?").slice(0, 3))}</span>`;
}
function watchLink(m){ return safe(m.status === "final" ? (m.stream?.vod || m.stream?.live) : m.stream?.live); }
function playerName(p){ const r = PEOPLE.get(p.id); if (r) return r.private || !r.name ? (r.tag || p.tag || "Player") : r.name; return p.private || !p.name ? (p.tag || "Player") : p.name; }

/* ---------- scores strip ---------- */
export function startStrip(site){
  const host = $("#scores"); if (!host) return;
  watchBoard(board => {
    const all = board.matches || [], now = Date.now(), recent = 3 * 864e5;
    const live = all.filter(m => m.status === "live");
    const fin = all.filter(m => m.status === "final").sort((a, b) => a.startsAt > b.startsAt ? -1 : 1);
    const up = all.filter(m => m.status === "upcoming" || m.status === "postponed").sort((a, b) => a.startsAt < b.startsAt ? -1 : 1);
    const list = [...live, ...fin.filter(m => now - new Date(m.startsAt) < recent), ...up, ...fin.filter(m => now - new Date(m.startsAt) >= recent)].slice(0, 16);
    if (!list.length){ host.hidden = true; return; }
    const scroll = $("#scoreTrack")?.scrollLeft || 0;
    host.hidden = false;
    host.innerHTML = `<div class="wrap scores-in">
      <a class="scores-label" href="${BASE}results.html"><b>Scores</b>${live.length ? `<span class="pill-live">Live</span>` : ""}</a>
      <button class="scores-arrow prev" type="button" aria-label="Scroll scores left">‹</button>
      <div class="scores-track" id="scoreTrack">${list.map(m => card(site, m)).join("")}</div>
      <button class="scores-arrow next" type="button" aria-label="Scroll scores right">›</button>
    </div>`;
    const tr = $("#scoreTrack"); tr.scrollLeft = scroll;
    host.querySelector(".prev").onclick = () => tr.scrollBy({left:-tr.clientWidth * .8, behavior:"smooth"});
    host.querySelector(".next").onclick = () => tr.scrollBy({left:tr.clientWidth * .8, behavior:"smooth"});
  });
}
function shortDay(iso){ const d = new Date(iso), t = new Date(); const same = (a, b) => a.toDateString() === b.toDateString(); const tm = new Date(t); tm.setDate(t.getDate() + 1);
  return same(d, t) ? "Today" : same(d, tm) ? "Tomorrow" : d.toLocaleDateString("en-US", {timeZone:"America/Detroit", weekday:"short", month:"numeric", day:"numeric"}); }
function card(site, m){
  const live = m.status === "live", fin = m.status === "final", up = !live && !fin;
  const href = watchLink(m) || `${BASE}results.html#m-${encodeURIComponent(m.id)}`;
  const ext = !!watchLink(m);
  const usWin = fin && m.result === "W", themWin = fin && m.result === "L";
  const st = live ? `<span class="pill-live">Live</span>` : fin ? `<b>${m.bye ? "Bye week" : "Final"}</b>${m.forfeit ? " · FF" : ""}` : m.status === "postponed" ? "Postponed" : esc(shortDay(m.startsAt));
  const g = gameFor(site, m.game), cg = m.current, rv = rivalFor(site, m);
  const sub = live && cg && g.points ? `${esc((g.unit || "Game")[0])}${cg.n} · ${cg.us}–${cg.them}` : up ? `${esc(fmtTime(m.startsAt))} · ${esc(m.teamName || "")}` : esc(m.teamName || "");
  return `<a class="sc${live ? " live" : ""}${fin ? " fin" : ""}${rv ? " rival" : ""}${postseason(m) ? " post" : ""}" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""} aria-label="${esc(`${m.teamName} vs ${oppFull(m)}: ${live ? "live" : fin ? "final" : "upcoming"}${up ? "" : `, ${m.score?.us}–${m.score?.them}`}`)}">
    <span class="sc-top">${badge(site, m, "sc-game")}<span class="sc-st">${st}</span></span>
    <span class="sc-row us${usWin ? " win" : ""}${themWin ? " lose" : ""}"><span class="sc-nm">Hartland</span>${up ? "" : `<span class="sc-sc">${m.bye ? "W" : m.score?.us ?? 0}</span>`}</span>
    <span class="sc-row${themWin ? " win" : ""}${usWin ? " lose" : ""}"><span class="sc-nm" title="${esc(m.opponent?.school || oppFull(m))}">${esc(opp(m))}</span>${up || m.bye ? "" : `<span class="sc-sc">${m.score?.them ?? 0}</span>`}</span>
    <span class="sc-sub">${postseason(m) ? `<span class="sc-post">🏆 ${esc(postseason(m).label)}</span> · ` : ""}${rv ? `<span class="sc-rival">⚔ ${esc(rv.title || "Rivalry")}</span> · ` : ""}${sub}${ext ? ` <span class="sc-watch">${live ? "▶ Watch" : fin ? "▶ Replay" : ""}</span>` : ""}</span>
  </a>`;
}

/* ---------- "Coming up" / "Next matches" lists (home, schedule) ----------
   Matches from the scorekeeper come first and drop off the moment they go final. Newsletter "Coming up" rows fill in
   anything the scorekeeper doesn't have, unless the scorekeeper already knows that team's match on that day. */
export function startUpcoming(site, fromIssues){
  const host = $("#upNext"); if (!host) return;
  const emptyHTML = host.querySelector(".empty")?.outerHTML || "";
  const key = n => String(n || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const ymd = iso => { const d = new Date(iso), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  watchBoard(board => {
    const all = board.matches || [];
    const known = new Set(all.map(m => ymd(m.startsAt) + "|" + key(m.teamName)));
    const live = all.filter(m => m.status === "live" || m.status === "upcoming" || m.status === "postponed").map(m => ({
      t:new Date(m.startsAt).getTime(), day:new Date(m.startsAt), team:m.teamName, opp:oppShort(m) === "Opponent" ? "" : oppShort(m), time:fmtTime(m.startsAt), where:"", league:m.league,
      live:m.status === "live", postponed:m.status === "postponed", rival:rivalFor(site, m), link:m.status === "live" ? safe(m.stream?.live) : ""}));
    const rest = (fromIssues || []).filter(x => !known.has(x.date + "|" + key(x.team))).map(x => { const d = new Date(x.date + "T" + (/^\d{1,2}:\d{2}/.test(x.time || "") ? x.time.padStart(5, "0") : "23:59"));
      const tm = /^(\d{1,2}):(\d{2})/.exec(x.time || ""); let time = ""; if (tm){ let h = +tm[1]; const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; time = `${h}:${tm[2]} ${ap}`; }
      return {t:d.getTime(), day:d, team:x.team, opp:x.opp, time, where:x.where, league:x.league}; });
    const list = [...live, ...rest].sort((a, b) => (b.live ? 1 : 0) - (a.live ? 1 : 0) || a.t - b.t).slice(0, +host.dataset.limit || 5);
    const sec = $("#upSection"); if (sec) sec.hidden = !list.length;
    host.innerHTML = list.length ? `<ul class="matches">${list.map(m => `<li${m.live ? ' class="is-live"' : ""}>
      <div class="m-date"><small>${DAYS[m.day.getDay()]}</small><b>${m.day.getMonth() + 1}/${m.day.getDate()}</b></div>
      <div><div class="m-team">${esc(m.team)}${m.live ? ` <span class="pill-live">Live</span>` : ""}${m.rival ? ` <span class="chip gold rv">⚔ ${esc(m.rival.title || "Rivalry")}</span>` : ""}</div><div class="m-sub">${[m.opp ? "vs. " + esc(m.opp) : "", m.postponed ? "Postponed" : esc(m.time), esc(m.where || "")].filter(Boolean).join(" · ")}${m.link ? ` · <a href="${esc(m.link)}" target="_blank" rel="noopener">▶ Watch live</a>` : ""}</div></div>
      ${m.league ? `<span class="chip">${esc(m.league)}</span>` : "<span></span>"}
    </li>`).join("")}</ul>` : emptyHTML;
  });
}

/* ---------- results page ---------- */
export async function startResults(site){
  const host = $("#results"); if (!host) return;
  const NOW = seasonOf();
  const qs = new URLSearchParams(location.search);
  let season = (/^\d{4}-\d{2}$/.test(qs.get("season") || "") && qs.get("season")) || (location.hash.match(/season-(\d{4}-\d{2})/) || [])[1] || NOW;
  let wanted = qs.get("m") || (location.hash.match(/^#m-(.+)$/) || [])[1] || "";
  let board = null, team = "", phase = "", dirSeasons = [], idxSeasons = [];
  const arch = {}, full = {}, watching = new Set();
  learnPeople(site, null);
  const load = async se => { if (!(se in arch)){ arch[se] = []; arch[se] = await archive(se); draw(); } if (!watching.has(se)){ watching.add(se); watchSeason(se, d => { full[se] = d.matches || []; draw(); }); } };
  const draw = () => {
    const all = merge([...(arch[season] || []), ...(full[season] || [])], season === NOW ? board : null).filter(m => m.season === season || !m.season);
    const live = all.filter(m => m.status === "live");
    const fin = all.filter(m => m.status === "final").sort((a, b) => a.startsAt > b.startsAt ? -1 : 1);
    const isPost = m => !!postseason(m), anyPost = fin.some(isPost);
    if (!anyPost) phase = "";
    const shown = fin.filter(m => (!team || m.teamName === team) && (!phase || (phase === "post") === isPost(m)));
    const rec = list => { const w = list.filter(m => m.result === "W").length, l = list.filter(m => m.result === "L").length; return `${w}–${l}`; };
    const order = (site.teams || []).map(t => teamName(site, t));
    const teams = [...new Set(fin.map(m => m.teamName).filter(Boolean))].sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)) || a.localeCompare(b));
    const seasons = [...new Set([NOW, season, ...dirSeasons, ...idxSeasons])].sort().reverse();
    const open = new Set([...host.querySelectorAll("details[open]")].map(d => d.id));
    host.innerHTML = `
      ${live.length ? `<div class="res-live"><h2 class="res-h"><span class="pill-live">Live</span> Now playing</h2><div class="grid g3">${live.map(m => liveCard(site, m)).join("")}</div></div>` : ""}
      <div class="res-sum"><div class="res-rec"><small>${esc(seasonLabel(season))} record</small><b>${rec(fin)}</b>${anyPost ? `<span class="res-split">Regular season ${rec(fin.filter(m => !isPost(m)))}<br>🏆 Playoffs ${rec(fin.filter(isPost))}</span>` : ""}</div>
        <div style="flex:1;display:grid;gap:10px">
          ${seasons.length > 1 ? `<label class="res-season"><span>Season</span><select id="resSeason">${seasons.map(se => `<option value="${se}"${se === season ? " selected" : ""}>${esc(seasonLabel(se))}</option>`).join("")}</select></label>` : ""}
          ${anyPost ? `<div class="res-teams" role="group" aria-label="Regular season or playoffs">${[["", "All matches"], ["reg", "Regular season"], ["post", "🏆 Playoffs"]].map(([k, l]) => `<button type="button" class="chip${phase === k ? " gold" : ""}" data-phase="${k}">${l}</button>`).join("")}</div>` : ""}
          <div class="res-teams" role="group" aria-label="Filter by team"><button type="button" class="chip${team ? "" : " gold"}" data-team="">All teams</button>${teams.map(t => `<button type="button" class="chip${team === t ? " gold" : ""}" data-team="${esc(t)}">${esc(t)} <span class="rec-mini">${rec(fin.filter(m => m.teamName === t))}</span></button>`).join("")}</div>
        </div></div>
      ${shown.length ? `<div class="res-list">${shown.map(m => resultRow(site, m)).join("")}</div>` : `<div class="empty">${fin.length ? "No results for this team yet." : season === NOW ? "Results show up here as soon as a match is final." : "No results recorded for this season."}</div>`}`;
    host.querySelectorAll("details").forEach(d => { if (open.has(d.id)) d.open = true; });
    host.querySelectorAll("[data-team]").forEach(b => b.onclick = () => { team = b.dataset.team; draw(); });
    host.querySelectorAll("[data-phase]").forEach(b => b.onclick = () => { phase = b.dataset.phase; draw(); });
    const sel = $("#resSeason"); if (sel) sel.onchange = () => { season = sel.value; team = ""; phase = ""; history.replaceState(null, "", location.pathname + (qs.get("mock") ? "?mock=1" : "") + (season === NOW ? "" : "#season-" + season)); load(season); draw(); };
    const eb = document.querySelector(".page-h .eyebrow"); if (eb) eb.textContent = `${seasonLabel(season)} season`;
    if (wanted){ const d = document.getElementById("m-" + decodeURIComponent(wanted)); if (d){ wanted = ""; d.open = true; d.scrollIntoView({block:"center"}); } }
  };
  draw(); load(season);
  archiveSeasons().then(x => { idxSeasons = x; draw(); });
  watchBoard(b => { board = b; draw(); });
  watchDirectory(d => { dirSeasons = d.seasons; learnPeople(site, d); draw(); });
}
function teamName(site, t){ const g = gameFor(site, t.gameKey); return `${g.short || t.game} ${t.name}`; }
function liveCard(site, m){
  SITE_REF = site;
  const g = gameFor(site, m.game), cg = m.current, w = watchLink(m);
  const rv = rivalFor(site, m);
  return `<div class="card res-livecard">${badge(site, m)}<div>${rv ? `<span class="chip gold rv" style="margin:0 0 4px">⚔ ${esc(rv.title || "Rivalry")}</span>` : ""}<b>${esc(m.teamName)}</b><span class="muted res-vs">vs ${oppLogo(m)}${esc(oppFull(m))}</span></div>
    <div class="res-score">${m.score?.us ?? 0}<span>–</span>${m.score?.them ?? 0}${cg && g.points ? `<small>${esc(g.unit || "Game")} ${cg.n}: ${cg.us}–${cg.them}</small>` : ""}</div>
    ${w ? `<a class="btn btn-gold" href="${esc(w)}" target="_blank" rel="noopener">▶ Watch live</a>` : ""}</div>`;
}
let OPP_PAGE = false;
const placeOf = x => { const c = String(x?.city || "").trim(), st = String(x?.state || "").trim(); return c && st && !new RegExp(`,\\s*${st}$`, "i").test(c) ? `${c}, ${st}` : c || st; };
function oppCard(m){
  if (OPP_PAGE) return "";
  const lib = oppLib(m), logo = oppLogo(m, "opp-card-logo"), school = m.opponent?.school || lib?.name || ""; if (!school) return "";
  const sub = [lib?.mascot, placeOf(lib)].filter(Boolean).join(" · ");
  return `<a class="opp-card" href="${BASE}opponent.html?school=${encodeURIComponent(school)}">${logo}<div><small>Opponent</small><b>${esc(school)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div><span class="more">Head to head →</span></a>`;
}
function resultRow(site, m){
  SITE_REF = site;
  const g = gameFor(site, m.game), games = m.seriesOnly ? [] : (m.games || []).filter(x => x.winner || x.us || x.them);
  const lineup = (m.players || []).map(p => `<a href="${BASE}player.html?id=${encodeURIComponent(p.id)}">${esc(playerName(p))}</a>`).join(", ");
  const w = watchLink(m), rv = rivalFor(site, m);
  const ps = postseason(m);
  return `<details class="res${rv ? " rival" : ""}${ps ? " post" : ""}" id="m-${esc(m.id)}"><summary>
      <span class="res-date"><small>${esc(fmtDay(m.startsAt).split(",")[0])}</small><b>${esc(fmtDay(m.startsAt).split(", ")[1] || "")}</b></span>
      ${badge(site, m)}
      <span class="res-who"><b>${esc(m.teamName)}${ps ? ` <span class="chip post${ps.finals ? " finals" : ""}">🏆 ${esc(ps.label)}</span>` : ""}${rv ? ` <span class="chip gold rv">⚔ ${esc(rv.title || "Rivalry")}</span>` : ""}</b><span class="res-vs">${m.bye ? "Bye week: no opponent, automatic win" : `vs ${oppLogo(m)}${esc(oppFull(m))}`}${m.opponent?.school && m.opponent?.team ? ` · ${esc(m.opponent.school)}` : ""}</span></span>
      <span class="res-out ${m.result || ""}"><i>${esc(m.result || "–")}</i>${m.bye ? "Bye" : `${m.score?.us ?? 0}–${m.score?.them ?? 0}`}</span>
    </summary><div class="res-body">
      ${oppCard(m)}
      <p class="muted" style="margin:0 0 10px">${esc(m.league || "")}${roundLabel(m) ? ` · ${esc(roundLabel(m))}` : ""}${m.event ? ` · ${esc(m.event)}` : ""} · Best of ${esc(m.bestOf)}${m.forfeit ? ` · ${m.forfeit === "them" ? "Won by forfeit" : "Forfeit"}` : ""}</p>
      ${games.length ? `<div class="res-games">${games.map(x => `<span class="${x.winner === "us" ? "W" : x.winner === "them" ? "L" : ""}"><small>${esc(g.unit || "Game")} ${x.n}</small>${g.points ? `${x.us}–${x.them}` : x.winner === "us" ? "Won" : x.winner === "them" ? "Lost" : "–"}</span>`).join("")}</div>` : ""}
      ${boxScore(g, m) || (lineup ? `<p style="margin:12px 0 0"><span class="muted">Lineup:</span> ${lineup}</p>` : "")}
      ${w ? `<p style="margin:12px 0 0"><a class="btn btn-line" href="${esc(w)}" target="_blank" rel="noopener">▶ Watch the replay</a></p>` : ""}
    </div></details>`;
}

/* Role names, with the game's role icon in front when Site Manager has one (Marvel Rivals). */
function roleTags(g, list){ return list.map(r => `<span class="role">${g?.roleIcons?.[r] ? `<img src="${esc(BASE + g.roleIcons[r])}" alt="">` : ""}${esc(r)}</span>`).join(" "); }
function boxScore(g, m){
  /* Games with roles (Marvel Rivals) list players by role, in the game's order (Vanguard, Duelist, Strategist), then by name. */
  const order = String(g.roles || "").split(",").map(x => x.trim()).filter(Boolean);
  /* a player's role here is the one they played most this match */
  const main = p => { const c = {}; (m.games || []).forEach(x => { const r = x.p?.[p.id]?.role; if (r) c[r] = (c[r] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || (p.roles || [])[0]; };
  const rank = p => { const i = order.indexOf(main(p)); return i < 0 ? order.length : i; };
  const ps = order.length ? [...(m.players || [])].sort((a, b) => rank(a) - rank(b) || playerName(a).localeCompare(playerName(b))) : (m.players || []), cols = (g.statList || []).filter(c => ps.some(p => p.stats && c.key in p.stats)), roles = ps.some(p => (p.roles || []).length);
  if (!ps.length || (!cols.length && !roles)) return "";
  return `<div class="tbl-wrap box${cols.length > 4 ? " wide" : ""}"><table class="tbl"><thead><tr><th>Player</th>${roles ? "<th>Role</th>" : ""}${cols.map(c => `<th class="n">${esc(c.label)}</th>`).join("")}</tr></thead><tbody>${ps.map(p => `<tr><td><a href="${BASE}player.html?id=${encodeURIComponent(p.id)}">${esc(playerName(p))}</a>${p.sub ? ` <span class="muted">(sub)</span>` : ""}</td>${roles ? `<td class="muted">${roleTags(g, p.roles || [])}</td>` : ""}${cols.map(c => `<td class="n">${p.stats && c.key in p.stats ? esc(fmtStat(c, p.stats[c.key])) : "–"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

/* School colors as CSS variables, plus readable text colors: --c-on for text on the primary color, --c-hi for an
   accent that shows up on the dark site (the lighter of the two school colors, or white if both are dark). */
function hexLum(h){ const m = String(h || "").trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i); if (!m) return null; let x = m[1]; if (x.length === 3) x = x.split("").map(c => c + c).join("");
  const ch = i => { const v = parseInt(x.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(0) + 0.7152 * ch(2) + 0.0722 * ch(4); }
export function schoolSkin(c){
  const c1 = c?.primary || "#FFBC05", c2 = c?.secondary || "#FFFFFF", l1 = hexLum(c1) ?? 0.5, l2 = hexLum(c2) ?? 0.5;
  const on = l1 > 0.4 ? "#0B0F17" : "#FFFFFF", hi = Math.max(l1, l2) >= 0.2 ? (l1 >= l2 ? c1 : c2) : "#FFFFFF";
  return `--c1:${esc(c1)};--c2:${esc(c2)};--c-on:${on};--c-hi:${esc(hi)}`;
}
/* ---------- the college an alum plays for: picked on their profile, or matched from "Playing now at…" ----------
   Exact names win, then the longest name found in the text. A word that's in several college names ("Michigan",
   "Ohio") only counts when it's the whole text, so "Michigan Tech" never turns into the University of Michigan. */
const collegeNorm = n => " " + String(n || "").toLowerCase().replace(/&/g, " and ").replace(/\bst\./g, "st ").replace(/[^a-z0-9]+/g, " ")
  .replace(/\b(technological|technology)\b/g, "tech").replace(/\bsaint\b/g, "st").replace(/\buniv\b/g, "university").replace(/\bcommunity college\b/g, "cc").replace(/\s+/g, " ").trim() + " ";
const collegeStrip = k => k.replace(/ (the|university|college|of) /g, " ").replace(/ (the|university|college|of) /g, " ").replace(/\s+/g, " ");
export function collegeFor(site, id, now){
  const list = (site.colleges || site.schools || []).filter(c => c && c.name), pick = site.profiles?.[id]?.committed;
  if (pick) return list.find(c => c.id === pick) || null;
  const t = collegeNorm(now); if (!t.trim()) return null;
  const freq = {}; list.forEach(c => new Set(collegeStrip(collegeNorm(c.name)).trim().split(" ")).forEach(w => freq[w] = (freq[w] || 0) + 1));
  let best = null, score = 0;
  list.forEach(c => { const full = collegeNorm(c.name);
    [full, collegeNorm(c.name.replace(/^the\s+/i, "")), collegeStrip(full), collegeNorm(c.short)].forEach(k => { const core = k.trim(); if (!core) return;
      const one = !core.includes(" "), shared = one && (freq[core] || 0) > 1;
      let sc = 0;
      if (t === k || collegeStrip(t) === k) sc = 1000 + core.length;
      else if (!shared && core.length > 2 && (t.includes(k) || collegeStrip(t).includes(k))) sc = core.length;
      if (sc > score){ score = sc; best = c; } }); });
  return best;
}
const collegeKey = n => collegeStrip(collegeNorm(n)).trim();
/* ---------- "Eagles at the next level" (About page): alumni who are playing somewhere now ---------- */
export function startNextLevel(site){
  const host = $("#nextLevel"); if (!host) return;
  watchDirectory(d => {
    const list = alumniOf(site, d).filter(p => p.status !== "inactive").filter(p => !(site.teams || []).some(t => (t.roster || []).some(r => r.id === p.id))).filter(p => (p.name || p.tag) && ((p.now || "").trim() || (!p.private && site.profiles?.[p.id]?.committed))).sort((a, b) => String(b.gradYear || "").localeCompare(String(a.gradYear || "")) || (a.name || a.tag).localeCompare(b.name || b.tag));
    host.hidden = !list.length; if (!list.length) return;
    host.innerHTML = `<div class="wrap"><div class="sec-h"><h2>${esc(host.dataset.title || "Eagles at the next level")}</h2></div>
      <p class="lead" style="margin:0 0 18px">${esc(host.dataset.lead || "Hartland Esports alumni who kept playing after graduation.")}</p>
      <div class="grid g3">${list.map(p => { const nm = p.private || !p.name ? p.tag : p.name, c = p.private ? null : collegeFor(site, p.id, p.now);
        const src = x => /^(https?:|data:)/.test(x) ? x : BASE + x;
        return `<a class="card next-card${c ? " has-college" : ""}" href="${BASE}player.html?id=${encodeURIComponent(p.id)}"${c ? ` style="${schoolSkin(c)}"` : ""}>
        ${c?.logo ? `<img class="next-logo" src="${esc(src(c.logo))}" alt="" loading="lazy">` : ""}
        <p class="eyebrow">${p.gradYear ? `Class of ${esc(p.gradYear)}` : "Alumni"}</p><h3>${esc(nm)}</h3>${!p.private && p.name && p.tag ? `<p class="tag">${esc(p.tag)}</p>` : ""}
        ${c ? `<p class="next-school"><small>${esc(site.profiles?.[p.id]?.commitLabel || "Now playing at")}</small><b>${esc(c.name)}</b></p>` : ""}${p.now && (!c || collegeKey(p.now) !== collegeKey(c.name)) ? `<p class="now">${esc(p.now)}</p>` : ""}</a>`; }).join("")}</div></div>`;
  });
}

/* ---------- player profile ---------- */
export async function startPlayer(site){
  const host = $("#player"); if (!host) return;
  const NOW = seasonOf(), full = {}, watching = new Set();
  let arch = [], dir = {alumni:[], seasons:[]}, ready = false;
  learnPeople(site, null);
  const draw = () => { if (ready) drawPlayer(site, host, merge([...arch, ...Object.values(full).flat()], null), dir); };
  const watch = se => { if (watching.has(se)) return; watching.add(se); watchSeason(se, d => { full[se] = d.matches || []; ready = true; draw(); }); };
  watch(NOW);
  watchDirectory(d => { dir = d; learnPeople(site, d); d.seasons.forEach(watch); draw(); });
  archiveSeasons().then(async seasons => { arch = (await Promise.all(seasons.map(archive))).flat(); draw(); });
  setTimeout(() => { ready = true; draw(); }, 5000);
}
function drawPlayer(site, host, all, dir){
  SITE_REF = site;
  const id = new URLSearchParams(location.search).get("id") || "";
  const sameName = (a, b) => { const k = x => String(x || "").trim().toLowerCase(); return (a.name && k(a.name) === k(b.name)) || (!a.name && !b.name && a.tag && k(a.tag) === k(b.tag)); };
  const histMe = all.flatMap(m => m.players || []).find(p => p.id === id);
  const alums = alumniOf(site, dir);
  const alum = alums.find(p => p.id === id) || (histMe ? alums.find(p => sameName(p, histMe)) : null);
  const entries = (site.teams || []).flatMap(t => (t.roster || []).filter(p => p.id === id).map(p => ({...p, team:t})));
  const played = all.filter(m => m.status === "final" && (m.players || []).some(p => p.id === id)).sort((a, b) => a.startsAt > b.startsAt ? -1 : 1);
  const me = entries[0] || (alum ? {...alum, team:null} : null) || (() => { const p = played[0]?.players.find(x => x.id === id); return p ? {...p, team:null} : null; })();
  if (!me){ host.innerHTML = `<section class="section"><div class="wrap"><div class="empty">We couldn't find that player. <a href="${BASE}teams.html">See the rosters</a>.</div></div></section>`; return; }
  const priv = entries.some(e => e.private) || !!me.private;
  const prof = (!priv && (site.profiles?.[id] || (alum && site.profiles?.[alum.id]))) || {};
  const display = priv || !me.name ? (me.tag || "Player") : me.name;
  document.title = `${display} · Hartland Esports`;
  const teams = entries.map(e => e.team);
  const byGame = {};
  played.forEach(m => { const k = m.game || "other", s = byGame[k] = byGame[k] || {game:gameFor(site, m.game), n:0, w:0, l:0, tot:{}, cnt:{}, avg:{}, roles:{}, chars:{}};
    s.n++; if (m.result === "W") s.w++; else if (m.result === "L") s.l++;
    const mine = m.players.find(p => p.id === id) || {}, st = mine.stats || {};
    const rows = (m.games || []).map(x => x.p?.[id]).filter(Boolean);
    (s.game.statList || []).forEach(d => {
      if (d.avg){ const vals = rows.length ? rows.map(r => r[d.key]).filter(v => v !== undefined && v !== "") : (d.key in st ? [st[d.key]] : []); vals.forEach(v => (s.avg[d.key] = s.avg[d.key] || []).push(+v)); }
      else if (d.key in st){ s.tot[d.key] = (s.tot[d.key] || 0) + (+st[d.key] || 0); s.cnt[d.key] = (s.cnt[d.key] || 0) + 1; }
    });
    (rows.length ? rows.map(r => r.role) : (mine.roles || [])).filter(Boolean).forEach(r => s.roles[r] = (s.roles[r] || 0) + 1);
    rows.map(r => r.hero).filter(Boolean).forEach(c => s.chars[c] = (s.chars[c] || 0) + 1); });
  /* Top characters: the main first, then two more. The coach can type them on the player's profile ("chars"); otherwise they are
     ranked from the characters picked in final matches. How often each was played is never shown. */
  const ranked = o => Object.entries(o).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(x => x[0]);
  const manual = String(prof.chars || "").split(",").map(x => x.trim()).filter(Boolean).slice(0, 3);
  const charGames = (site.games || []).map(g0 => { if (!String(g0.charLabel || "").trim()) return null;
    const known = String(g0.chars || "").split(/[,\n]/).map(c => c.trim().toLowerCase()).filter(Boolean);
    const list = manual.length && known.includes(manual[0].toLowerCase()) ? manual : ranked(byGame[g0.key]?.chars || {});
    return list.length ? {g:g0, list, dir:String(g0.charArt || g0.charIcons || "").replace(/\/$/, "")} : null; }).filter(Boolean);
  const src = p => /^https?:/.test(p) ? p : BASE + p;
  const clip = (String(prof.heroClipId || "").match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/) || [])[1] || (/^[\w-]{11}$/.test(String(prof.heroClipId || "").trim()) ? prof.heroClipId.trim() : "");
  const playlist = safe(prof.playlistUrl) || safe(prof.highlights);
  const playing = host.querySelector(".clip.on");
  const mainRoles = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  const W = played.filter(m => m.result === "W").length, L = played.filter(m => m.result === "L").length;
  /* Recruiting: commitment re-skins the page in that school's colors; otherwise seniors (still on a roster) get gold. */
  const schools = site.colleges || site.schools || [], schoolOf = sid => schools.find(x => x.id === sid);
  const socials = x => [["link","Esports"],["website","Website"],["youtube","YouTube"],["twitch","Twitch"],["x","X"],["instagram","Instagram"],["tiktok","TikTok"]].filter(([k]) => safe(x?.[k])).map(([k, l]) => `<a href="${esc(safe(x[k]))}" target="_blank" rel="noopener">${l}</a>`).join("");
  const sch = priv ? null : prof.committed ? schoolOf(prof.committed) : (!entries.length && alum?.now ? collegeFor(site, alum.id, alum.now) : null);
  const commitLabel = prof.commitLabel || (entries.length ? "Committed to" : "Now playing at");
  const nowExtra = alum?.now && (!sch || collegeKey(alum.now) !== collegeKey(sch.name)) ? alum.now : "";
  const senior = !priv && !sch && entries.length && isSenior(prof.gradYear);
  const skin = sch ? ` style="${schoolSkin(sch)}"` : "";
  const logo = x => x?.logo ? `<img src="${esc(src(x.logo))}" alt="" loading="lazy">` : "";
  const nameKey = String(me.name || "").toLowerCase();
  const honors = priv || !nameKey ? [] : (site.records || []).filter(r => r.type === "honor" && String(r.detail || "").toLowerCase().includes(nameKey)).filter(r => !/signing/i.test(r.title)).map(r => `${r.title}${r.year ? ` ${r.year}` : ""}`);
  const accolades = [...new Set([...(entries.some(e => e.captain) ? ["Team captain"] : []), ...honors, ...String(prof.accolades || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean)])];
  const ranks = Object.entries(prof.ranks || {}).filter(([, v]) => String(v || "").trim()).map(([k, v]) => ({g:gameFor(site, k), v:String(v).trim()}));
  const links = String(prof.links || "").split(/\r?\n/).map(line => { const i = line.lastIndexOf("|"), u = safe((i < 0 ? line : line.slice(i + 1)).trim()); if (!u) return null; const label = (i < 0 ? "" : line.slice(0, i).trim()) || new URL(u).hostname.replace(/^www\./, ""); return {label, u}; }).filter(Boolean);
  const interest = Object.entries(prof.interest || {}).filter(([k, v]) => v && k !== prof.committed).map(([k]) => schoolOf(k)).filter(Boolean);
  const bio = priv ? "" : (String(prof.bio || "").trim() || bioDraft(site, all, id, {name:x => x === id ? display : (PEOPLE.get(x)?.name || "Player"), current:x => (site.teams || []).some(t => (t.roster || []).some(r => r.id === x))}, prof));
  host.innerHTML = `<section class="page-h player-h${sch ? " committed" : senior ? " senior" : ""}"${skin}><div class="wrap player-top">
      ${prof.photo ? `<img class="player-photo" src="${esc(/^https?:/.test(prof.photo) ? prof.photo : BASE + prof.photo)}" alt="">` : `<div class="player-photo ph">${esc((display || "?")[0])}</div>`}
      <div><p class="eyebrow">${teams.map(t => esc(teamName(site, t))).join(" · ") || [...new Set(played.map(m => m.teamName).filter(Boolean))].slice(0, 3).map(esc).join(" · ") || "Hartland Esports"}</p>
        <h1 style="font-size:clamp(40px,7vw,76px)">${esc(display)}</h1>
        ${!priv && me.name && me.tag ? `<p class="player-tag">${esc(me.tag)}</p>` : ""}
        ${!sch && alum?.now ? `<p class="player-now"><span>Now playing</span> ${esc(alum.now)}</p>` : ""}
        ${sch ? `<p class="player-commit">${logo(sch)}<span><small>${esc(commitLabel)}</small><b>${esc(sch.name)}</b>${nowExtra ? `<em class="commit-now">${esc(nowExtra)}</em>` : ""}${socials(sch) ? `<span class="commit-links">${socials(sch)}</span>` : ""}</span></p>` : ""}
        <div class="chips">${entries.some(e => e.captain) ? `<span class="chip gold">★ Captain</span>` : ""}${!entries.length ? (alum?.status === "inactive" ? `<span class="chip">Former player</span>` : `<span class="chip gold">Alumni${alum?.gradYear ? ` · Class of ${esc(alum.gradYear)}` : ""}</span>`) : ""}${prof.gradYear ? `<span class="chip gold">${senior ? "Senior · " : ""}Class of ${esc(prof.gradYear)}</span>` : ""}${entries.map(e => e.role).filter(Boolean).map(r => `<span class="chip">${esc(r)}</span>`).join("")}${prof.mains ? `<span class="chip">${esc(prof.mains)}</span>` : ""}</div>
      </div>
      <div class="player-rec"><small>Career record</small><b>${W}–${L}</b><span>${played.length} match${played.length === 1 ? "" : "es"}</span></div>
    </div></section>
    ${accolades.length ? `<section class="acc-bar"><div class="wrap"><ul class="acc">${accolades.map(a => `<li><span aria-hidden="true">★</span>${esc(a)}</li>`).join("")}</ul></div></section>` : ""}
    ${ranks.length || links.length || interest.length ? `<section class="section recruit-s"><div class="wrap"><div class="recruit">
      ${ranks.length ? `<div><h2 class="res-h">Rank</h2><ul class="ranks">${ranks.map(r => `<li>${r.g.icon ? `<img src="${esc(src(r.g.icon))}" alt="${esc(r.g.name)}">` : `<small>${esc(r.g.short || r.g.name)}</small>`}<b>${esc(r.v)}</b></li>`).join("")}</ul></div>` : ""}
      ${links.length ? `<div><h2 class="res-h">Verify the stats</h2><p class="muted" style="margin:0 0 10px;font-size:15px">Outside trackers, for checking our numbers independently.</p><div class="vlinks">${links.map(l => `<a class="btn btn-line" href="${esc(l.u)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("")}</div></div>` : ""}
      ${interest.length ? `<div><h2 class="res-h">Schools of interest</h2><ul class="schools">${interest.map(x => `<li>${safe(x.link || x.website) ? `<a href="${esc(safe(x.link || x.website))}" target="_blank" rel="noopener">` : ""}${logo(x) || `<span class="ph">${esc((x.short || x.name)[0])}</span>`}<span>${esc(x.short || x.name)}</span>${safe(x.link || x.website) ? "</a>" : ""}</li>`).join("")}</ul></div>` : ""}
    </div></div></section>` : ""}
    ${bio || clip || playlist ? `<section class="section"><div class="wrap grid g2" style="align-items:start">
      ${bio ? `<div><h2 class="res-h">Career</h2><p class="lead playbill" style="margin:0">${esc(bio)}</p></div>` : ""}
      ${clip || playlist ? `<div><h2 class="res-h">Highlights</h2>
        ${clip ? `<button class="clip" type="button" data-yt="${esc(clip)}" aria-label="Play ${esc(display)}'s highlight"><img src="https://i.ytimg.com/vi/${esc(clip)}/hqdefault.jpg" alt="" loading="lazy"><span aria-hidden="true">▶</span></button>` : ""}
        ${playlist ? `<p style="margin:14px 0 0"><a ${clip ? "" : 'class="btn btn-gold" '}href="${esc(playlist)}" target="_blank" rel="noopener">${clip ? "See all highlights →" : "▶ Watch highlights"}</a></p>` : ""}
        ${prof.recruit ? `<p class="muted" style="margin:14px 0 0">College coaches: detailed stats and full match film are available on request. Reach out to ${(site.coaches || []).filter(c => c.email).map(c => `<a href="mailto:${esc(c.email)}">Coach ${esc(c.name.split(" ").pop())}</a>`).join(" or ") || `<a href="${BASE}about.html#join">our coaches</a>`}.</p>` : ""}</div>` : ""}
    </div></section>` : ""}
    ${charGames.length ? `<section class="section ${bio || clip || playlist ? "alt" : ""}"><div class="wrap"><h2 class="res-h">Characters</h2><div class="grid g2">${charGames.map(c => `<div class="card mains2">
      <div class="main">${c.dir ? `<img class="main-art" src="${esc(src(c.dir + "/" + slug(c.list[0])))}-art.webp" alt="" loading="lazy" onerror="this.remove()">` : ""}<div class="main-cap">${c.g.charArt ? `<img class="main-sig" src="${esc(src(c.dir + "/" + slug(c.list[0])))}-sig.webp" alt="" onerror="this.remove()">` : ""}<small>Main</small><b>${esc(c.list[0])}</b></div></div>
      <div class="alts">${c.g.icon ? `<img class="game-logo" src="${esc(src(c.g.icon))}" alt="${esc(c.g.name)}">` : `<p class="eyebrow">${esc(c.g.name)}</p>`}
        ${c.list.length > 1 ? `<p class="mains-h">Also plays</p>${c.list.slice(1).map(n => `<span class="alt">${c.dir ? `<img src="${esc(src(c.dir + "/" + slug(n)))}-logo.webp" alt="" onerror="this.remove()">` : ""}${esc(n)}</span>`).join("")}` : ""}</div>
    </div>`).join("")}</div></div></section>` : ""}
    <section class="section ${!!(bio || clip || playlist) !== !!charGames.length ? "alt" : ""}"><div class="wrap">
      <h2 class="res-h">Stats</h2>
      ${Object.keys(byGame).length ? `<div class="grid g2">${Object.values(byGame).map(s => `<div class="card stat-card">${s.game.statArt || s.game.art ? `<img class="team-art" src="${esc(BASE + (s.game.statArt || s.game.art))}" alt="">` : ""}${s.game.icon ? `<img class="game-logo" src="${esc(/^https?:/.test(s.game.icon) ? s.game.icon : BASE + s.game.icon)}" alt="${esc(s.game.name)}">` : `<p class="eyebrow">${esc(s.game.name)}</p>`}
        <div class="stat-row"><div><b>${s.n}</b><small>Matches</small></div><div><b>${s.w}–${s.l}</b><small>Record</small></div>${(s.game.statList || []).filter(x => x.avg ? (s.avg[x.key] || []).length : x.key in s.tot).map(x => x.avg ? `<div><b>${(s.avg[x.key].reduce((a, b) => a + b, 0) / s.avg[x.key].length).toFixed(1)}%</b><small>${esc(x.label.replace(/\s*%\s*$/, ""))}<br>average</small></div>` : `<div><b>${s.tot[x.key].toLocaleString("en-US")}</b><small>${esc(x.label)}<br>${(s.tot[x.key] / (s.cnt[x.key] || s.n)).toLocaleString("en-US", {maximumFractionDigits:1})}/match</small></div>`).join("")}</div>
        ${mainRoles(s.roles).length ? `<div class="stat-tags"><p><span>Role</span>${roleTags(s.game, mainRoles(s.roles))}</p></div>` : ""}</div>`).join("")}</div>`
        : `<div class="empty">Stats show up here after ${esc(display)} plays a match.</div>`}
      ${played.length ? `<h2 class="res-h" style="margin-top:34px">Games played</h2>${played.some(m => watchLink(m)) ? `<p class="muted" style="margin:-6px 0 12px;font-size:15px">Matches with a ▶ were streamed; click through to watch on YouTube.</p>` : ""}<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Team</th><th>Opponent</th><th class="n">Result</th><th>Stats</th><th>Stream</th></tr></thead><tbody>${played.map(m => { const st = (m.players.find(p => p.id === id) || {}).stats || {}, g = gameFor(site, m.game);
        const yr = new Date(m.startsAt).getFullYear();
        return `<tr><td>${esc(fmtDay(m.startsAt))}${yr !== new Date().getFullYear() ? `, ${yr}` : ""}</td><td>${esc(m.teamName)}${postseason(m) ? ` <span class="chip post${postseason(m).finals ? " finals" : ""}">🏆 ${esc(postseason(m).label)}</span>` : ""}</td><td class="res-vs"><a href="${BASE}results.html?season=${encodeURIComponent(m.season || seasonOf(m.startsAt))}&m=${encodeURIComponent(m.id)}">${oppLogo(m)}${esc(oppFull(m))}</a></td><td class="n"><b class="${m.result}">${esc(m.result || "")}</b> ${m.score?.us}–${m.score?.them}</td><td class="muted">${(g.statList || []).filter(x => x.key in st).map(x => x.avg ? `${fmtStat(x, st[x.key])} ${esc(x.label.replace(/\s*%\s*$/, ""))}` : `${st[x.key]} ${esc(x.label)}`).join(" · ")}</td><td>${watchLink(m) ? `<a href="${esc(watchLink(m))}" target="_blank" rel="noopener" aria-label="Watch the stream of this match">▶ Watch</a>` : ""}</td></tr>`; }).join("")}</tbody></table></div>` : ""}
    </div></section>`;
  const btn = host.querySelector(".clip");
  if (btn && playing && playing.dataset.yt === btn.dataset.yt) btn.replaceWith(playing);
  else if (btn) btn.onclick = () => { const f = document.createElement("div"); f.className = "clip on"; f.dataset.yt = btn.dataset.yt;
    f.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(btn.dataset.yt)}?autoplay=1&rel=0" title="Highlight video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`; btn.replaceWith(f); };
}

/* ---------- every FINAL match, all seasons. The record book, rivalry pages and player pages are built from this and
   nothing else: a match that is still live or upcoming never counts toward permanent history. ---------- */
export function watchFinals(site, cb){
  const NOW = seasonOf(), full = {}, watching = new Set();
  let arch = [], dir = {alumni:[], seasons:[]}, ready = false;
  learnPeople(site, null);
  const draw = () => { if (ready) cb(merge([...arch, ...Object.values(full).flat()], null).filter(m => m.status === "final"), dir); };
  const watch = se => { if (watching.has(se)) return; watching.add(se); watchSeason(se, d => { full[se] = d.matches || []; ready = true; draw(); }); };
  watch(NOW);
  watchDirectory(d => { dir = d; learnPeople(site, d); d.seasons.forEach(watch); draw(); });
  archiveSeasons().then(async seasons => { arch = (await Promise.all(seasons.map(archive))).flat(); ready = true; draw(); });
  setTimeout(() => { ready = true; draw(); }, 5000);
}
const wl = list => { const w = list.filter(m => m.result === "W").length, l = list.filter(m => m.result === "L").length; return {w, l, text:`${w}–${l}`}; };
const rivalKey = n => String(n || "").toLowerCase().replace(/\s+(high\s+school|hs|school)\s*$/i, "").replace(/[^a-z0-9]+/g, " ").trim();
const byNewest = (a, b) => a.startsAt > b.startsAt ? -1 : 1;

/* Teams page: each team's record this season, under its leagues. Exhibitions and scrimmages don't count; byes count as wins. */
export function startTeamRecords(site){
  const official = m => m.stage !== "exhibition" && m.stage !== "scrim" && (m.result === "W" || m.result === "L");
  const NOW = seasonOf();
  watchFinals(site, fin => {
    const list = fin.filter(m => official(m) && (m.season || seasonOf(m.startsAt)) === NOW);
    document.querySelectorAll(".trec[data-rec]").forEach(el => {
      const cur = list.filter(m => m.teamId === el.dataset.rec);
      el.innerHTML = `<small>Record</small><b>${wl(cur).text}</b><span>this season</span>`; el.hidden = false;
    });
  });
}
/* who: names and current/alum status for the record book (gamertag only for private players) */
function whoFrom(site, fin){
  const seen = {}; fin.forEach(m => (m.players || []).forEach(p => { if (p.id && !seen[p.id]) seen[p.id] = p; }));
  const cur = new Set((site.teams || []).flatMap(t => (t.roster || []).map(r => r.id)).filter(Boolean));
  return {name:id => playerName(seen[id] || {id}), current:id => cur.has(id)};
}
/* ---------- auto-computed leaderboards, program honors, and pre-tracking legends ---------- */
function drawBoards(site, host, fin){
  const who = whoFrom(site, fin), R = buildRecords(site, fin, who), prog = programRecords(site, fin), leg = legacyRecords(site);
  const flag = w => w.kind === "player" || w.kind === "duo" ? (w.current ? `<span class="rflag cur">Current</span>` : w.kind === "player" ? `<span class="rflag alum">Alum</span>` : "") : "";
  const link = id => `<a href="${BASE}player.html?id=${encodeURIComponent(id)}">${esc(who.name(id))}</a>`;
  const nm = w => w.kind === "player" ? `<a href="${BASE}player.html?id=${encodeURIComponent(w.id)}">${esc(w.name)}</a>` : w.kind === "duo" ? `<span class="rduo">${w.id.slice(4).split("+").map(link).join(" &amp; ")}</span>` : esc(w.name);
  const card = r => { const [a, ...rest] = r.rows; return `<div class="rcard"><p class="rt">${esc(r.title)}${r.since ? `<span class="since">since ${esc(r.since)}</span>` : ""}</p>
      ${a ? `<div class="rlead"><b class="rv${String(a.display || a.value).length > 4 ? " long" : ""}">${esc(a.display || a.value)}</b><span class="rwho">${nm(a.who)} ${flag(a.who)}${a.detail ? `<small>${esc(a.detail)}</small>` : ""}</span></div>
      ${rest.length ? `<ol class="rnext" start="2">${rest.slice(0, 2).map(x => `<li>${nm(x.who)} <b>${esc(x.display || x.value)}</b></li>`).join("")}</ol>` : ""}` : `<p class="muted" style="margin:0;font-size:14px">Open. The first entry sets it.</p>`}</div>`; };
  const groups = R.groups.filter(g => g.records.some(r => r.rows.length));
  host.innerHTML = `${groups.map(g => `<div class="rgroup"><h3 class="rgh">${g.icon ? `<img src="${esc(/^https?:/.test(g.icon) ? g.icon : BASE + g.icon)}" alt="${esc(g.title)}">` : esc(g.title)}</h3><div class="rgrid">${g.records.map(card).join("")}</div></div>`).join("")}
    <div class="rgroup"><h3 class="rgh">Program</h3><div class="rgrid">
      <div class="rcard"><p class="rt">State titles</p><div class="rlead"><b class="rv">${prog.titles.length}</b><span class="rwho">${prog.titles.map(r => esc([r.year, r.game ? gameFor(site, r.game).short : ""].filter(Boolean).join(" "))).join("<br>") || "Still chasing the first"}</span></div></div>
      <div class="rcard"><p class="rt">Tournament titles and top finishes</p><ul class="rlist">${[...prog.other, ...prog.places].map(r => `<li><b>${esc(r.title)}</b> ${esc(r.year || "")}</li>`).join("") || "<li>None yet</li>"}</ul></div>
      <div class="rcard"><p class="rt">Rivalries, head to head</p><ul class="rlist">${prog.rivals.filter(x => x.n).map(x => `<li><a href="${BASE}rival.html?school=${encodeURIComponent(x.school)}">${esc(x.school)}</a> <b>${x.w}–${x.l}</b></li>`).join("") || "<li>No meetings yet</li>"}</ul></div>
    </div></div>
    <p class="muted" style="margin:6px 0 0;font-size:14px">Worked out from every match marked final, re-sorted every time this page loads. Exhibitions and scrimmages don't count. "Current" means the record holder is still on a roster, so the record is still live. Stats show the season we started logging them.</p>
    ${leg.length ? `<div class="rgroup legacy-era"><h3 class="rgh">Before the scorekeeper</h3><p class="muted" style="margin:-6px 0 12px;font-size:15px">Pre-tracking era, entered by hand and kept out of the leaderboards above. A + means "at least": the lowest number the results can prove.</p>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Record</th><th>Holder</th><th class="n">Mark</th><th>Notes</th></tr></thead><tbody>${leg.map(r => `<tr><td>${esc(r.title)}${r.game ? `<small>${esc(gameFor(site, r.game).short || gameFor(site, r.game).name)}</small>` : ""}</td><td>${esc(r.holder)}${r.years ? `<small>${esc(r.years)}</small>` : ""}</td><td class="n"><b>${esc(r.shown)}</b></td><td class="muted">${esc(r.note || "")}</td></tr>`).join("")}</tbody></table></div></div>` : ""}`;
}

export function startLegacy(site){
  startNextLevel(site);
  const host = $("#allTime"), boards = $("#leaders");
  watchFinals(site, fin => {
    if (boards) drawBoards(site, boards, fin);
    document.querySelectorAll("[data-rival]").forEach(c => { const r = {school:c.dataset.rival}; const vs = fin.filter(m => rivalFor({rivals:[r]}, m)); c.querySelector("[data-rec]").textContent = vs.length ? wl(vs).text : "0–0"; });
    document.querySelectorAll("[data-season-rec]").forEach(el => { const l = fin.filter(m => (m.season || seasonOf(m.startsAt)) === el.dataset.seasonRec); el.textContent = l.length ? wl(l).text : ""; });
    if (!host) return;
    if (!fin.length){ host.innerHTML = `<div class="empty">The record book fills in as soon as the first match is final.</div>`; return; }
    const seasons = [...new Set(fin.map(m => m.season || seasonOf(m.startsAt)))].sort().reverse();
    const games = [...new Set(fin.map(m => m.game))].map(k => ({g:gameFor(site, k), list:fin.filter(m => m.game === k)})).sort((a, b) => b.list.length - a.list.length);
    const post = fin.filter(m => postseason(m));
    host.innerHTML = `<div class="rb-top">
        <div class="rb-big"><small>All-time record</small><b>${wl(fin).text}</b><span>${fin.length} matches · ${seasons.length} season${seasons.length === 1 ? "" : "s"}</span></div>
        ${post.length ? `<div class="rb-big"><small>🏆 Playoffs</small><b>${wl(post).text}</b><span>${post.length} playoff match${post.length === 1 ? "" : "es"}</span></div>` : ""}
      </div>
      <div class="grid g2" style="margin-top:18px;align-items:start">
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>By game</th><th class="n">W</th><th class="n">L</th></tr></thead><tbody>${games.map(x => `<tr><td>${esc((x.g.name !== x.g.key ? x.g.name : "") || x.list[0].gameName || "Other")}</td><td class="n">${wl(x.list).w}</td><td class="n">${wl(x.list).l}</td></tr>`).join("")}</tbody></table></div>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>By season</th><th class="n">W</th><th class="n">L</th></tr></thead><tbody>${seasons.map(se => { const l = fin.filter(m => (m.season || seasonOf(m.startsAt)) === se); return `<tr><td><a href="${BASE}results.html#season-${se}">${esc(seasonLabel(se))}</a></td><td class="n">${wl(l).w}</td><td class="n">${wl(l).l}</td></tr>`; }).join("")}</tbody></table></div>
      </div>
      <p class="muted" style="margin:14px 0 0;font-size:14px">Counts every match marked final. Matches in progress are never included.</p>`;
  });
}

/* ---------- one rivalry: head-to-head, next meeting, every meeting ---------- */
export function startRival(site){
  const host = $("#rival"); if (!host) return;
  const want = rivalKey(new URLSearchParams(location.search).get("school"));
  const r = (site.rivals || []).find(x => rivalKey(x.school) === want);
  if (!r){ host.innerHTML = `<section class="section"><div class="wrap"><div class="empty">We couldn't find that rivalry. <a href="${BASE}legacy.html#rivalries">See all rivalries</a>.</div></div></section>`; return; }
  document.title = `Hartland vs. ${r.school} · Hartland Esports`;
  let fin = [], board = null, loaded = false;
  const mine = m => !!rivalFor({rivals:[r]}, m);
  const draw = () => {
    const vs = fin.filter(mine).sort(byNewest), rec = wl(vs);
    const next = (board?.matches || []).filter(m => (m.status === "upcoming" || m.status === "live") && mine(m)).sort((a, b) => a.startsAt < b.startsAt ? -1 : 1)[0];
    let streak = ""; if (vs.length){ const first = vs[0].result; let n = 0; for (const m of vs){ if (m.result === first) n++; else break; } if (first === "W" || first === "L") streak = `${first === "W" ? "Hartland has" : `${r.school} has`} won the last ${n === 1 ? "meeting" : n + " meetings"}`; }
    const lead = !vs.length ? "" : rec.w > rec.l ? `Hartland leads the series ${rec.text}.` : rec.w < rec.l ? `${r.school} leads the series ${rec.l}–${rec.w}.` : `The series is tied ${rec.text}.`;
    const games = [...new Set(vs.map(m => m.game))].map(k => ({g:gameFor(site, k), list:vs.filter(m => m.game === k)}));
    const notable = vs.filter(m => postseason(m) || Math.abs((m.score?.us || 0) - (m.score?.them || 0)) === 1).slice(0, 4);
    const open = new Set([...host.querySelectorAll("details[open]")].map(d => d.id));
    host.innerHTML = `<section class="page-h"><div class="wrap">
        <p class="eyebrow">⚔ ${esc(r.title || "Rivalry")}</p><h1 style="font-size:clamp(38px,6vw,68px)">Hartland vs. ${esc(r.school)}</h1>
        <p class="lead">${esc(r.story || r.note || "")}</p></div></section>
      <section class="section"><div class="wrap">
        <div class="rb-top"><div class="rb-big"><small>All-time head to head</small><b>${loaded ? rec.text : "–"}</b><span>${vs.length ? `${esc(lead)}${streak ? ` ${esc(streak)}.` : ""}` : loaded ? "No meetings on record yet. The first chapter is still to be written." : ""}</span></div>
          <div class="rb-big next"><small>Next meeting</small>${next ? `<b>${esc(fmtDay(next.startsAt))}</b><span>${next.status === "live" ? `<span class="pill-live">Live</span> ` : ""}${esc(next.teamName)} · ${esc(fmtTime(next.startsAt))}${postseason(next) ? ` · 🏆 ${esc(postseason(next).label)}` : ""}</span>` : `<b class="tbd">TBD</b><span>Not on the schedule yet. It will show up here as soon as it is.</span>`}</div></div>
        ${games.length > 1 ? `<div class="chips" style="margin-top:16px">${games.map(x => `<span class="chip">${esc((x.g.short !== x.g.key ? x.g.short : "") || x.list[0].gameName || "Other")} <b style="margin-left:6px">${wl(x.list).text}</b></span>`).join("")}</div>` : ""}
      </div></section>
      ${notable.length ? `<section class="section alt"><div class="wrap"><h2 class="res-h">Matches to remember</h2><div class="grid g2">${notable.map(m => `<a class="card news-item" href="#m-${esc(m.id)}" data-open="m-${esc(m.id)}"><p class="eyebrow">${esc(fmtDay(m.startsAt))}, ${new Date(m.startsAt).getFullYear()}${postseason(m) ? ` · 🏆 ${esc(postseason(m).label)}` : ""}</p><h3>${m.result === "W" ? "Hartland" : esc(r.school)} ${Math.max(m.score?.us || 0, m.score?.them || 0)}–${Math.min(m.score?.us || 0, m.score?.them || 0)}</h3><p class="muted" style="margin:0;font-size:15px">${esc(m.teamName)}${postseason(m) ? ", with the season on the line" : ", decided by a single game"}.</p></a>`).join("")}</div></div></section>` : ""}
      ${vs.length ? `<section class="section"><div class="wrap"><h2 class="res-h">Every meeting</h2><div class="res-list">${vs.map(m => resultRow(site, m)).join("")}</div></div></section>` : ""}
      <section class="section alt"><div class="wrap"><a class="btn btn-line" href="${BASE}legacy.html#rivalries">← All rivalries</a></div></section>`;
    host.querySelectorAll("details").forEach(d => { if (open.has(d.id)) d.open = true; });
    host.querySelectorAll("[data-open]").forEach(a => a.onclick = e => { e.preventDefault(); const d = document.getElementById(a.dataset.open); if (d){ d.open = true; d.scrollIntoView({block:"center", behavior:"smooth"}); } });
  };
  draw();
  watchFinals(site, f => { fin = f; loaded = true; draw(); });
  watchBoard(b => { board = b; draw(); });
}

/* ---------- any opponent: our record against them, overall and by game ---------- */
const oppKey = n => shortSchool(n).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function startOpponent(site){
  const host = $("#opponent"); if (!host) return;
  SITE_REF = site; OPP_PAGE = true;
  const asked = new URLSearchParams(location.search).get("school") || "", want = oppKey(asked);
  if (!want){ host.innerHTML = `<section class="section"><div class="wrap"><div class="empty">Pick an opponent from a result. <a href="${BASE}results.html">See results</a>.</div></div></section>`; return; }
  const lib = schoolInfo(site, asked), rv = (site.rivals || []).find(r => oppKey(r.school) === want);
  let fin = [], board = null, loaded = false, gameF = "";
  const mine = m => oppKey(m.opponent?.school) === want;
  const pct = (w, l) => w + l ? Math.round(100 * w / (w + l)) + "%" : "–";
  const gamesWL = list => list.reduce((a, m) => { (m.games || []).forEach(x => { if (x.winner === "us") a.w++; else if (x.winner === "them") a.l++; }); return a; }, {w:0, l:0});
  const streakOf = list => { if (!list.length) return null; const r = list[0].result; let n = 0; for (const m of list){ if (m.result === r) n++; else break; } return r === "W" || r === "L" ? {r, n} : null; };
  const draw = () => {
    const all = fin.filter(mine).sort(byNewest), vs = gameF ? all.filter(m => m.game === gameF) : all;
    const name = lib?.name || all[0]?.opponent?.school || asked, short = lib?.short || shortSchool(name);
    document.title = `Hartland vs. ${name} · Hartland Esports`;
    const rec = wl(all), gw = gamesWL(all), st = streakOf(all), last = all[0];
    const post = all.filter(m => postseason(m)), postRec = wl(post);
    const next = (board?.matches || []).filter(m => (m.status === "upcoming" || m.status === "live") && mine(m)).sort((a, b) => a.startsAt < b.startsAt ? -1 : 1)[0];
    const byGame = [...new Set(all.map(m => m.game))].map(k => { const list = all.filter(m => m.game === k), r = wl(list), g2 = gamesWL(list), s2 = streakOf(list);
      return {k, g:gameFor(site, k), list, r, g2, s2, last:list[0]}; }).sort((a, b) => a.last.startsAt < b.last.startsAt ? 1 : -1);
    const bySeason = [...new Set(all.map(m => m.season || seasonOf(m.startsAt)))].sort().reverse().map(se => ({se, r:wl(all.filter(m => (m.season || seasonOf(m.startsAt)) === se))}));
    /* Eagles with the most wins against them */
    const tally = {}; all.forEach(m => (m.players || []).forEach(p => { if (!p.id) return; const t = tally[p.id] = tally[p.id] || {p, w:0, n:0}; t.n++; if (m.result === "W") t.w++; }));
    const top = Object.values(tally).filter(t => t.w).sort((a, b) => b.w - a.w || a.n - b.n).slice(0, 5);
    const lead = !all.length ? "" : rec.w > rec.l ? `Hartland leads the series ${rec.text}.` : rec.w < rec.l ? `${short} leads the series ${rec.l}–${rec.w}.` : `The series is tied ${rec.text}.`;
    const logo = lib?.logo ? `<img class="opp-hero-logo" src="${esc(/^(https?:|data:)/.test(lib.logo) ? lib.logo : BASE + lib.logo)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : (last ? oppLogo(last, "opp-hero-logo") : "");
    const links = [["website","Website"],["youtube","YouTube"],["twitch","Twitch"],["x","X"],["instagram","Instagram"],["tiktok","TikTok"]].filter(([k]) => safe(lib?.[k])).map(([k, l]) => `<a href="${esc(safe(lib[k]))}" target="_blank" rel="noopener">${l} ↗</a>`).join("");
    const skin = lib?.primary ? ` style="${schoolSkin(lib)}"` : "";
    const open = new Set([...host.querySelectorAll("details[open]")].map(d => d.id));
    const res = m => `<span class="${m.result}">${esc(m.result || "–")} ${m.score?.us ?? 0}–${m.score?.them ?? 0}</span>`;
    host.innerHTML = `<section class="page-h opp-h${skin ? " skinned" : ""}"${skin}><div class="wrap opp-top">${logo}
        <div><p class="eyebrow">Head to head${(() => { const lg = [...new Set(all.map(m => String(m.league || "").trim()).filter(l => l && !/^(exhibition|scrimmage)$/i.test(l)))]; return lg.length ? ` · ${esc(lg.join(" · "))}` : lib?.league ? ` · ${esc(lib.league)}` : ""; })()}</p><h1 style="font-size:clamp(36px,6vw,64px)">Hartland vs. ${esc(name)}</h1>
        ${[lib?.mascot, placeOf(lib)].filter(Boolean).length ? `<p class="lead" style="margin:4px 0 0">${esc([lib?.mascot, placeOf(lib)].filter(Boolean).join(" · "))}</p>` : ""}
        <div class="opp-links">${rv ? `<a class="chip gold" href="${BASE}rival.html?school=${encodeURIComponent(rv.school)}">⚔ ${esc(rv.title || "Rivalry")}</a>` : ""}${links}</div></div></div></section>
      <section class="section"><div class="wrap">
        <div class="rb-top"><div class="rb-big"><small>All-time record</small><b>${loaded ? rec.text : "–"}</b><span>${all.length ? `${esc(lead)}${st ? ` ${st.r === "W" ? "Hartland has" : esc(short) + " has"} won the last ${st.n === 1 ? "meeting" : st.n + " meetings"}.` : ""}` : loaded ? "No final results against them yet." : ""}</span></div>
          <div class="rb-big"><small>Games &amp; sets won</small><b>${loaded ? `${gw.w}–${gw.l}` : "–"}</b><span>${gw.w + gw.l ? `${pct(gw.w, gw.l)} of individual games and sets.` : ""}</span></div>
          <div class="rb-big next"><small>${next ? "Next meeting" : "Last meeting"}</small>${next ? `<b>${esc(fmtDay(next.startsAt))}</b><span>${next.status === "live" ? `<span class="pill-live">Live</span> ` : ""}${esc(next.teamName)} · ${esc(fmtTime(next.startsAt))}</span>`
            : last ? `<b>${esc(fmtDay(last.startsAt))}</b><span>${esc(last.teamName)} · ${last.result === "W" ? "Won" : last.result === "L" ? "Lost" : "Played"} ${last.score?.us ?? 0}–${last.score?.them ?? 0}, ${new Date(last.startsAt).getFullYear()}</span>` : `<b class="tbd">TBD</b><span></span>`}</div></div>
        ${all.length ? `<h2 class="res-h" style="margin-top:30px">By game</h2><div class="tbl-wrap"><table class="tbl opp-tbl"><thead><tr><th>Game</th><th class="n">Record</th><th class="n sm-hide">Win %</th><th class="n">Games</th><th class="sm-hide">Streak</th><th class="sm-hide">Last meeting</th></tr></thead><tbody>
          ${byGame.map(x => `<tr><td><span class="opp-game">${x.g.icon ? `<img src="${esc(/^https?:/.test(x.g.icon) ? x.g.icon : BASE + x.g.icon)}" alt="">` : ""}${esc((x.g.name && x.g.name !== x.k ? x.g.name : "") || x.list[0].gameName || x.k.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "Other")}</span></td><td class="n"><b>${x.r.text}</b></td><td class="n sm-hide">${pct(x.r.w, x.r.l)}</td><td class="n">${x.g2.w + x.g2.l ? `${x.g2.w}–${x.g2.l}` : "–"}</td><td class="sm-hide">${x.s2 ? `${x.s2.r}${x.s2.n}` : "–"}</td><td class="sm-hide">${esc(fmtDay(x.last.startsAt))}, ${new Date(x.last.startsAt).getFullYear()} · ${res(x.last)}</td></tr>`).join("")}
          </tbody></table></div>` : ""}
        ${all.length ? `<div class="grid g2 opp-grid" style="margin-top:22px">
          <div><h2 class="res-h">By season</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Season</th><th class="n">W</th><th class="n">L</th></tr></thead><tbody>${bySeason.map(x => `<tr><td>${esc(seasonLabel(x.se))}</td><td class="n">${x.r.w}</td><td class="n">${x.r.l}</td></tr>`).join("")}${post.length ? `<tr><td>🏆 Playoffs (all seasons)</td><td class="n">${postRec.w}</td><td class="n">${postRec.l}</td></tr>` : ""}</tbody></table></div></div>
          ${top.length ? `<div><h2 class="res-h">Most wins against ${esc(short)}</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Eagle</th><th class="n">Wins</th><th class="n">Played</th></tr></thead><tbody>${top.map(t => `<tr><td><a href="${BASE}player.html?id=${encodeURIComponent(t.p.id)}">${esc(playerName(t.p))}</a></td><td class="n">${t.w}</td><td class="n">${t.n}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
        </div>` : ""}
      </div></section>
      ${all.length ? `<section class="section alt"><div class="wrap"><h2 class="res-h">Every meeting</h2>
        ${byGame.length > 1 ? `<div class="res-teams" role="group" aria-label="Filter by game" style="margin-bottom:12px"><button type="button" class="chip${gameF ? "" : " gold"}" data-g="">All games <span class="rec-mini">${rec.text}</span></button>${byGame.map(x => `<button type="button" class="chip${gameF === x.k ? " gold" : ""}" data-g="${esc(x.k)}">${esc(x.g.short || x.g.name)} <span class="rec-mini">${x.r.text}</span></button>`).join("")}</div>` : ""}
        <div class="res-list">${vs.map(m => resultRow(site, m)).join("")}</div></div></section>` : ""}
      <section class="section"><div class="wrap"><a class="btn btn-line" href="${BASE}results.html">← All results</a></div></section>`;
    host.querySelectorAll("details").forEach(d => { if (open.has(d.id)) d.open = true; });
    host.querySelectorAll("[data-g]").forEach(b => b.onclick = () => { gameF = b.dataset.g; draw(); });
  };
  draw();
  watchFinals(site, f => { fin = f; loaded = true; draw(); });
  watchBoard(b => { board = b; draw(); });
}
