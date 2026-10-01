/* Live match data for the public site: scores strip (home), Results page, player profiles.
   Live scores come from the Firestore "public/scoreboard" summary (pushed instantly, about 1 read per update).
   Finished matches with full detail come from the repo backup, data/matches/<season>.json
   (refreshed automatically every hour by a GitHub Action). The two are merged by match id. */
import {seasonOf, seasonLabel, gameFor, abbrFor, fmtDay, fmtTime, isMock, FIREBASE_CONFIG} from "./matches.js";

const BASE = new URL("../", import.meta.url).href;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safe = u => /^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "";
const $ = s => document.querySelector(s);

/* ---------- data ---------- */
async function getJSON(p){ const r = await fetch(BASE + p + "?v=" + Date.now(), {cache:"no-store"}); if (!r.ok) throw new Error(p); return r.json(); }
export async function archive(season){ try { return (await getJSON(`data/matches/${season}.json`)).matches || []; } catch(e){ return []; } }
async function archiveSeasons(){ try { return (await getJSON("data/matches/index.json")).seasons || []; } catch(e){ return [seasonOf()]; } }

/* Calls cb(scoreboard) now and on every change. Falls back to re-checking every 30 s if the live connection can't start. */
export async function watchBoard(cb){
  if (isMock()){
    const read = () => { try { return JSON.parse(localStorage.getItem("eagles-mock-scoreboard")) || {matches:[]}; } catch(e){ return {matches:[]}; } };
    cb(read()); window.addEventListener("storage", e => { if (e.key === "eagles-mock-scoreboard") cb(read()); }); return;
  }
  try {
    const fb = await import(BASE + "assets/vendor/firebase-read.js");
    const app = fb.initializeApp(FIREBASE_CONFIG, "site");
    const db = fb.initializeFirestore(app, {localCache:fb.memoryLocalCache()});
    fb.onSnapshot(fb.doc(db, "public", "scoreboard"), s => cb(s.exists() ? s.data() : {matches:[]}), () => poll(cb));
  } catch(e){ poll(cb); }
}
function poll(cb){
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/public/scoreboard?key=${FIREBASE_CONFIG.apiKey}`;
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
  (board?.matches || []).forEach(b => { const a = by.get(b.id); by.set(b.id, a ? {...a, ...b, games:b.games || a.games, players:a.players, stream:{...(a.stream || {}), ...(b.stream || {})}} : b); });
  return [...by.values()];
}

/* ---------- shared bits ---------- */
const opp = m => m.opponent?.abbr || abbrFor(m.opponent?.school || m.opponent?.team);
const oppFull = m => m.opponent?.team || m.opponent?.school || "TBD";
function badge(site, m, cls = "gbadge"){
  const g = gameFor(site, m.game);
  return `<span class="${cls}" title="${esc(g.name || m.gameName || "")}">${g.icon ? `<img src="${esc(/^https?:/.test(g.icon) ? g.icon : BASE + g.icon)}" alt="">` : esc(g.abbr || (g.short || "?").slice(0, 3))}</span>`;
}
function watchLink(m){ return safe(m.status === "final" ? (m.stream?.vod || m.stream?.live) : m.stream?.live); }
function playerName(p){ return p.private || !p.name ? (p.tag || "Player") : p.name; }

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
  const st = live ? `<span class="pill-live">Live</span>` : fin ? `<b>Final</b>${m.forfeit ? " · FF" : ""}` : m.status === "postponed" ? "Postponed" : esc(shortDay(m.startsAt));
  const g = gameFor(site, m.game), cg = m.current;
  const sub = live && cg && g.points ? `${esc((g.unit || "Game")[0])}${cg.n} · ${cg.us}–${cg.them}` : up ? `${esc(fmtTime(m.startsAt))} · ${esc(m.teamName || "")}` : esc(m.teamName || "");
  return `<a class="sc${live ? " live" : ""}${fin ? " fin" : ""}" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener"' : ""} aria-label="${esc(`${m.teamName} vs ${oppFull(m)}: ${live ? "live" : fin ? "final" : "upcoming"}${up ? "" : `, ${m.score?.us}–${m.score?.them}`}`)}">
    <span class="sc-top">${badge(site, m, "sc-game")}<span class="sc-st">${st}</span></span>
    <span class="sc-row us${usWin ? " win" : ""}${themWin ? " lose" : ""}"><span class="sc-nm">Hartland</span>${up ? "" : `<span class="sc-sc">${m.score?.us ?? 0}</span>`}</span>
    <span class="sc-row${themWin ? " win" : ""}${usWin ? " lose" : ""}"><span class="sc-nm">${esc(opp(m))}</span>${up ? "" : `<span class="sc-sc">${m.score?.them ?? 0}</span>`}</span>
    <span class="sc-sub">${sub}${ext ? ` <span class="sc-watch">${live ? "▶ Watch" : fin ? "▶ Replay" : ""}</span>` : ""}</span>
  </a>`;
}

/* ---------- results page ---------- */
export async function startResults(site){
  const host = $("#results"); if (!host) return;
  const season = seasonOf();
  let arch = await archive(season), board = null, team = (location.hash.match(/^#team-(.+)$/) || [])[1] || "";
  const draw = () => {
    const all = merge(arch, board).filter(m => m.season === season || !m.season);
    const live = all.filter(m => m.status === "live");
    const fin = all.filter(m => m.status === "final").sort((a, b) => a.startsAt > b.startsAt ? -1 : 1);
    const shown = fin.filter(m => !team || m.teamId === team);
    const rec = list => { const w = list.filter(m => m.result === "W").length, l = list.filter(m => m.result === "L").length; return `${w}–${l}`; };
    const teams = (site.teams || []).filter(t => fin.some(m => m.teamId === t.id));
    const open = new Set([...host.querySelectorAll("details[open]")].map(d => d.id));
    host.innerHTML = `
      ${live.length ? `<div class="res-live"><h2 class="res-h"><span class="pill-live">Live</span> Now playing</h2><div class="grid g3">${live.map(m => liveCard(site, m)).join("")}</div></div>` : ""}
      <div class="res-sum"><div class="res-rec"><small>${esc(seasonLabel(season))} record</small><b>${rec(fin)}</b></div>
        <div class="res-teams" role="group" aria-label="Filter by team"><button type="button" class="chip${team ? "" : " gold"}" data-team="">All teams</button>${teams.map(t => `<button type="button" class="chip${team === t.id ? " gold" : ""}" data-team="${esc(t.id)}">${esc(teamName(site, t))} <span class="rec-mini">${rec(fin.filter(m => m.teamId === t.id))}</span></button>`).join("")}</div></div>
      ${shown.length ? `<div class="res-list">${shown.map(m => resultRow(site, m)).join("")}</div>` : `<div class="empty">${fin.length ? "No results for this team yet." : "Results show up here as soon as a match is final."}</div>`}`;
    host.querySelectorAll("details").forEach(d => { if (open.has(d.id)) d.open = true; });
    host.querySelectorAll("[data-team]").forEach(b => b.onclick = () => { team = b.dataset.team; history.replaceState(null, "", team ? "#team-" + team : location.pathname); draw(); });
    const target = location.hash.match(/^#m-(.+)$/); if (target){ const d = document.getElementById("m-" + decodeURIComponent(target[1])); if (d && !d.dataset.seen){ d.dataset.seen = 1; d.open = true; d.scrollIntoView({block:"center"}); } }
  };
  draw();
  watchBoard(b => { board = b; draw(); });
  setInterval(async () => { arch = await archive(season); draw(); }, 10 * 60 * 1000);
}
function teamName(site, t){ const g = gameFor(site, t.gameKey); return `${g.short || t.game} ${t.name}`; }
function liveCard(site, m){
  const g = gameFor(site, m.game), cg = m.current, w = watchLink(m);
  return `<div class="card res-livecard">${badge(site, m)}<div><b>${esc(m.teamName)}</b><span class="muted">vs ${esc(oppFull(m))}</span></div>
    <div class="res-score">${m.score?.us ?? 0}<span>–</span>${m.score?.them ?? 0}${cg && g.points ? `<small>${esc(g.unit || "Game")} ${cg.n}: ${cg.us}–${cg.them}</small>` : ""}</div>
    ${w ? `<a class="btn btn-gold" href="${esc(w)}" target="_blank" rel="noopener">▶ Watch live</a>` : ""}</div>`;
}
function resultRow(site, m){
  const g = gameFor(site, m.game), games = (m.games || []).filter(x => x.winner || x.us || x.them);
  const lineup = (m.players || []).map(p => `<a href="${BASE}player.html?id=${encodeURIComponent(p.id)}">${esc(playerName(p))}</a>`).join(", ");
  const w = watchLink(m);
  return `<details class="res" id="m-${esc(m.id)}"><summary>
      <span class="res-date"><small>${esc(fmtDay(m.startsAt).split(",")[0])}</small><b>${esc(fmtDay(m.startsAt).split(", ")[1] || "")}</b></span>
      ${badge(site, m)}
      <span class="res-who"><b>${esc(m.teamName)}</b><span>vs ${esc(oppFull(m))}${m.opponent?.school && m.opponent?.team ? ` · ${esc(m.opponent.school)}` : ""}</span></span>
      <span class="res-out ${m.result || ""}"><i>${esc(m.result || "–")}</i>${m.score?.us ?? 0}–${m.score?.them ?? 0}</span>
    </summary><div class="res-body">
      <p class="muted" style="margin:0 0 10px">${esc(m.league || "")}${m.week ? ` · Week ${esc(m.week)}` : ""}${m.event ? ` · ${esc(m.event)}` : ""} · Best of ${esc(m.bestOf)}${m.forfeit ? ` · ${m.forfeit === "them" ? "Won by forfeit" : "Forfeit"}` : ""}</p>
      ${games.length ? `<div class="res-games">${games.map(x => `<span class="${x.winner === "us" ? "W" : x.winner === "them" ? "L" : ""}"><small>${esc(g.unit || "Game")} ${x.n}</small>${g.points ? `${x.us}–${x.them}` : x.winner === "us" ? "Won" : x.winner === "them" ? "Lost" : "–"}</span>`).join("")}</div>` : ""}
      ${lineup ? `<p style="margin:12px 0 0"><span class="muted">Lineup:</span> ${lineup}</p>` : ""}
      ${w ? `<p style="margin:12px 0 0"><a class="btn btn-line" href="${esc(w)}" target="_blank" rel="noopener">▶ Watch the replay</a></p>` : ""}
    </div></details>`;
}

/* ---------- player profile ---------- */
export async function startPlayer(site){
  const host = $("#player"); if (!host) return;
  const id = new URLSearchParams(location.search).get("id") || "";
  const entries = (site.teams || []).flatMap(t => (t.roster || []).filter(p => p.id === id).map(p => ({...p, team:t})));
  const seasons = await archiveSeasons();
  const all = (await Promise.all(seasons.map(archive))).flat();
  const played = all.filter(m => m.status === "final" && (m.players || []).some(p => p.id === id)).sort((a, b) => a.startsAt > b.startsAt ? -1 : 1);
  const me = entries[0] || (() => { const p = played[0]?.players.find(x => x.id === id); return p ? {...p, team:null} : null; })();
  if (!me){ host.innerHTML = `<section class="section"><div class="wrap"><div class="empty">We couldn't find that player. <a href="${BASE}teams.html">See the rosters</a>.</div></div></section>`; return; }
  const priv = entries.some(e => e.private) || !!me.private;
  const prof = (!priv && site.profiles?.[id]) || {};
  const display = priv || !me.name ? (me.tag || "Player") : me.name;
  document.title = `${display} · Hartland Esports`;
  const teams = entries.map(e => e.team);
  const byGame = {};
  played.forEach(m => { const k = m.game || "other", s = byGame[k] = byGame[k] || {game:gameFor(site, m.game), n:0, w:0, l:0, tot:{}};
    s.n++; if (m.result === "W") s.w++; else if (m.result === "L") s.l++;
    const st = (m.players.find(p => p.id === id) || {}).stats || {}; Object.entries(st).forEach(([k2, v]) => s.tot[k2] = (s.tot[k2] || 0) + (+v || 0)); });
  const W = played.filter(m => m.result === "W").length, L = played.filter(m => m.result === "L").length;
  host.innerHTML = `<section class="page-h player-h"><div class="wrap player-top">
      ${prof.photo ? `<img class="player-photo" src="${esc(/^https?:/.test(prof.photo) ? prof.photo : BASE + prof.photo)}" alt="">` : `<div class="player-photo ph">${esc((display || "?")[0])}</div>`}
      <div><p class="eyebrow">${teams.map(t => esc(teamName(site, t))).join(" · ") || "Hartland Esports"}</p>
        <h1 style="font-size:clamp(40px,7vw,76px)">${esc(display)}</h1>
        ${!priv && me.name && me.tag ? `<p class="player-tag">${esc(me.tag)}</p>` : ""}
        <div class="chips">${entries.some(e => e.captain) ? `<span class="chip gold">★ Captain</span>` : ""}${prof.gradYear ? `<span class="chip gold">Class of ${esc(prof.gradYear)}</span>` : ""}${entries.map(e => e.role).filter(Boolean).map(r => `<span class="chip">${esc(r)}</span>`).join("")}${prof.mains ? `<span class="chip">${esc(prof.mains)}</span>` : ""}</div>
      </div>
      <div class="player-rec"><small>Career record</small><b>${W}–${L}</b><span>${played.length} match${played.length === 1 ? "" : "es"}</span></div>
    </div></section>
    ${prof.bio || safe(prof.highlights) ? `<section class="section"><div class="wrap grid g2" style="align-items:start">
      ${prof.bio ? `<div><h2 class="res-h">About</h2><p class="lead" style="margin:0">${esc(prof.bio)}</p></div>` : ""}
      ${safe(prof.highlights) ? `<div><h2 class="res-h">Highlights</h2><a class="btn btn-gold" href="${esc(safe(prof.highlights))}" target="_blank" rel="noopener">▶ Watch highlight reel</a>${prof.recruit ? `<p class="muted" style="margin:14px 0 0">College coaches: reach out to ${(site.coaches || []).filter(c => c.email).map(c => `<a href="mailto:${esc(c.email)}">Coach ${esc(c.name.split(" ").pop())}</a>`).join(" or ") || "our coaches through the About page"}.</p>` : ""}</div>` : ""}
    </div></section>` : ""}
    <section class="section ${prof.bio || prof.highlights ? "alt" : ""}"><div class="wrap">
      <h2 class="res-h">Stats</h2>
      ${Object.keys(byGame).length ? `<div class="grid g2">${Object.values(byGame).map(s => `<div class="card stat-card"><p class="eyebrow">${esc(s.game.name)}</p>
        <div class="stat-row"><div><b>${s.n}</b><small>Matches</small></div><div><b>${s.w}–${s.l}</b><small>Record</small></div>${(s.game.statList || []).filter(x => x.key in s.tot).map(x => `<div><b>${s.tot[x.key]}</b><small>${esc(x.label)}<br>${(s.tot[x.key] / s.n).toFixed(1)}/match</small></div>`).join("")}</div></div>`).join("")}</div>`
        : `<div class="empty">Stats show up here after ${esc(display)} plays a match.</div>`}
      ${played.length ? `<h2 class="res-h" style="margin-top:34px">Match log</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Team</th><th>Opponent</th><th class="n">Result</th><th>Stats</th></tr></thead><tbody>${played.map(m => { const st = (m.players.find(p => p.id === id) || {}).stats || {}, g = gameFor(site, m.game);
        return `<tr><td>${esc(fmtDay(m.startsAt))}</td><td>${esc(m.teamName)}</td><td><a href="${BASE}results.html#m-${encodeURIComponent(m.id)}">${esc(oppFull(m))}</a></td><td class="n"><b class="${m.result}">${esc(m.result || "")}</b> ${m.score?.us}–${m.score?.them}</td><td class="muted">${(g.statList || []).filter(x => x.key in st).map(x => `${st[x.key]} ${esc(x.label)}`).join(" · ")}</td></tr>`; }).join("")}</tbody></table></div>` : ""}
    </div></section>`;
}
