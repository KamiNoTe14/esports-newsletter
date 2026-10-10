/* LevelUP record book: every record is computed from logged match data, never typed in.
   - buildRecords(site, finals, who) re-sorts every leaderboard from the final matches it is given, so whoever leads
     shows up on their own. Exhibitions and scrimmages don't count.
   - recordBreaks(site, finals, live, who) compares the boards with and without a match that is being scored, so the
     scorekeeper can offer "Record broken: fire it?" the moment an entry takes a record from someone else.
   - bioDraft(site, finals, id, who) writes a short playbill-style career summary to start a player's bio from.
   - Hand-entered records from before the scorekeeper (site.legacyRecords) are kept apart: see legacyRecords().
   "who" answers questions about a person: {name(id), current(id)}. Nothing here touches the page. */
import {gameFor, seasonOf, postseason, rivalFor, shortSchool} from "./matches.js?v=16";

const OFFICIAL = m => m && m.stage !== "exhibition" && m.stage !== "scrim";
const NEGATIVE = /death|lost|against|conceded/i;     // stats where more is worse never get a "most" record
const MIN_WINPCT = 10, MIN_SEASON = 5;               // matches needed before a win % counts
const seasonOfM = m => m.season || seasonOf(m.startsAt);
const byDate = (a, b) => String(a.startsAt).localeCompare(String(b.startsAt));
/* "2026-27" + "2026-08-24" -> "Fall 2026" */
export function termLabel(d){ const t = new Date(d); return isNaN(t) ? "" : `${t.getMonth() >= 6 ? "Fall" : "Spring"} ${t.getFullYear()}`; }
const num = v => { const n = +v; return isNaN(n) ? 0 : n; };
const fmt = v => (Math.round(v * 10) / 10).toLocaleString("en-US");
const pct = v => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;
const opp = m => m.opponent?.school ? shortSchool(m.opponent.school) : (m.opponent?.team || "TBD");
const day = d => { const t = new Date(d); return isNaN(t) ? "" : t.toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"}); };

/* Points a team scored in a match ("goals" in Rocket League): per-game scores if typed, otherwise the players' stat. */
function teamPoints(m, statKey){
  const g = (m.games || []).filter(x => x.winner || x.us || x.them);
  const fromGames = g.reduce((a, x) => a + num(x.us), 0);
  if (fromGames) return fromGames;
  return (m.players || []).reduce((a, p) => a + num(p.stats?.[statKey]), 0);
}
function streak(list, isWin){ let best = 0, run = 0, bestEnd = null, start = null, bestStart = null;
  list.forEach(m => { if (isWin(m)){ if (!run) start = m; run++; if (run > best){ best = run; bestEnd = m; bestStart = start; } } else run = 0; });
  return {best, from:bestStart, to:bestEnd}; }

/* ---------- the boards ---------- */
export function buildRecords(site, finals, who){
  const fin = (finals || []).filter(m => m.status === "final" && OFFICIAL(m)).sort(byDate);
  const groups = [];
  const P = id => ({kind:"player", id, name:who.name(id), current:who.current(id)});
  const T = name => ({kind:"team", id:"team:" + name, name, current:(site.teams || []).some(t => `${t.game} ${t.name}` === name || t.name === name || name.endsWith(t.name))});
  const board = (key, title, rows, extra = {}) => { rows.sort((a, b) => b.value - a.value || String(a.at || "").localeCompare(String(b.at || ""))); return {key, title, rows:rows.filter(r => r.value > 0), ...extra}; };

  /* 1. Per game, per tracked stat: career totals and best single match. */
  const gameKeys = [...new Set(fin.map(m => m.game).filter(Boolean))];
  const order = k => { const i = (site.games || []).findIndex(g => g.key === k); return i < 0 ? 99 : i; };
  gameKeys.sort((a, b) => order(a) - order(b)).forEach(k => {
    const g = gameFor(site, k), stats = (g.statList || []).filter(d => !d.avg && !NEGATIVE.test(d.label));
    if (!stats.length) return;
    const list = fin.filter(m => m.game === k), recs = [];
    stats.forEach(d => {
      const career = {}, first = {}, single = [];
      list.forEach(m => (m.players || []).forEach(p => { if (!p.id || !(d.key in (p.stats || {}))) return; const v = num(p.stats[d.key]);
        career[p.id] = (career[p.id] || 0) + v; first[p.id] = first[p.id] || m.startsAt;
        single.push({who:P(p.id), value:v, display:fmt(v), at:m.startsAt, matchId:m.id, detail:`vs ${opp(m)}, ${day(m.startsAt)}`}); }));
      const firstAt = list.filter(m => (m.players || []).some(p => d.key in (p.stats || {}))).map(m => m.startsAt).sort()[0];
      const since = firstAt ? termLabel(firstAt) : "";
      recs.push(board(`${k}:career:${d.key}`, `Career ${d.label.toLowerCase()}`, Object.entries(career).map(([id, v]) => ({who:P(id), value:v, display:fmt(v), at:first[id]})), {stat:d.key, since}));
      recs.push(board(`${k}:single:${d.key}`, `${d.label} in a match`, single, {stat:d.key, since}));
    });
    /* team: most goals (or points) in one match, for games scored that way inside each game (Rocket League) */
    if (g.points && /goal|point|kill|elim/i.test(g.points)){
      const pts = list.map(m => ({who:T(m.teamName), value:teamPoints(m, slugStat(g.points)), at:m.startsAt, matchId:m.id, detail:`vs ${opp(m)}, ${day(m.startsAt)}`}));
      recs.push(board(`${k}:team:points`, `Most ${g.points.toLowerCase()} in a match (team)`, pts.map(r => ({...r, display:fmt(r.value)}))));
    }
    groups.push({id:k, title:g.name || k, game:k, icon:g.icon || "", records:recs});
  });

  /* 2. All games: wins, win %, win streaks (players) */
  const mine = {};
  fin.forEach(m => (m.players || []).forEach(p => { if (p.id) (mine[p.id] = mine[p.id] || []).push(m); }));
  const players = Object.entries(mine);
  const wins = players.map(([id, l]) => ({who:P(id), value:l.filter(m => m.result === "W").length, at:l[0].startsAt}));
  const winPct = players.filter(([, l]) => l.length >= MIN_WINPCT).map(([id, l]) => { const w = l.filter(m => m.result === "W").length; return {who:P(id), value:w / l.length, display:pct(w / l.length), detail:`${w}–${l.length - w} in ${l.length} matches`, at:l[0].startsAt}; });
  const pStreak = players.map(([id, l]) => { const s = streak(l, m => m.result === "W"); return s.best ? {who:P(id), value:s.best, display:String(s.best), detail:`in a row, ${day(s.from.startsAt)} to ${day(s.to.startsAt)}`, at:s.to.startsAt} : null; }).filter(Boolean);
  groups.push({id:"all", title:"All games", records:[
    board("all:wins", "Career wins", wins.map(r => ({...r, display:String(r.value)}))),
    board("all:winpct", `Best win % (${MIN_WINPCT}+ matches)`, winPct),
    board("all:streak", "Longest win streak", pStreak)]});

  /* 3. Teams: best season, longest streak */
  const teamSeason = {};
  fin.forEach(m => { if (!m.teamName) return; const k = m.teamName + "|" + seasonOfM(m); (teamSeason[k] = teamSeason[k] || []).push(m); });
  const seasonRows = Object.entries(teamSeason).filter(([, l]) => l.length >= MIN_SEASON).map(([k, l]) => { const [name, se] = k.split("|"), w = l.filter(m => m.result === "W").length;
    return {who:T(name), value:w / l.length + w / 1000, display:`${w}–${l.length - w}`, detail:se.replace("-", "–"), at:l[0].startsAt}; });
  const byTeam = {}; fin.forEach(m => { if (m.teamName) (byTeam[m.teamName] = byTeam[m.teamName] || []).push(m); });
  const tStreak = Object.entries(byTeam).map(([name, l]) => { const s = streak(l, m => m.result === "W"); return s.best ? {who:T(name), value:s.best, display:String(s.best), detail:`in a row, ${day(s.from.startsAt)} to ${day(s.to.startsAt)}`, at:s.to.startsAt} : null; }).filter(Boolean);
  groups.push({id:"team", title:"Teams", records:[
    board("team:season", `Best season record (${MIN_SEASON}+ matches)`, seasonRows),
    board("team:streak", "Longest team win streak", tStreak)]});
  return {groups, count:fin.length};
}
const slugStat = label => String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/* ---------- program-wide honors (from the banners and rivalries already in the Site Manager) ---------- */
export function programRecords(site, finals){
  const recs = (site.records || []).filter(r => r.title);
  const titles = recs.filter(r => r.type === "championship" && /state/i.test(r.title + " " + (r.org || "")));
  const other = recs.filter(r => r.type === "championship" && !titles.includes(r));
  const places = recs.filter(r => r.type === "tournament" || r.type === "finish");
  const fin = (finals || []).filter(m => m.status === "final");
  const rivals = (site.rivals || []).filter(r => r.school).map(r => { const vs = fin.filter(m => rivalFor({rivals:[r]}, m)); const w = vs.filter(m => m.result === "W").length, l = vs.filter(m => m.result === "L").length; return {school:r.school, title:r.title || "", w, l, n:vs.length}; });
  return {titles, other, places, rivals};
}

/* ---------- hand-entered legends from before the scorekeeper ---------- */
export function legacyRecords(site){
  return (site.legacyRecords || []).filter(r => r.title && r.holder).map(r => ({...r, shown:`${r.value ?? ""}${r.floor ? "+" : ""}`}));
}

/* ---------- record changing hands while a match is scored ----------
   live: the match being scored (its stats count right away). Win-based records only move once the series is decided.
   Returns [{key, title, game, holder:{id,name}, value, display, prev:{name, display}}] for records whose leader changes
   to someone in this match AND whose new mark is strictly better than the old one. */
export function recordBreaks(site, finals, live, who){
  if (!live || !OFFICIAL(live)) return [];
  const others = (finals || []).filter(m => m.id !== live.id);
  const decided = live.status === "final" || !!live.clinched;
  const asFinal = {...live, status:"final", result:decided ? (live.result || (live.clinched === "us" ? "W" : live.clinched === "them" ? "L" : null)) : null};
  const before = flat(buildRecords(site, others, who)), after = flat(buildRecords(site, [...others, asFinal], who));
  const inMatch = new Set((live.players || []).map(p => p.id)), team = "team:" + live.teamName;
  const out = [];
  Object.entries(after).forEach(([key, rec]) => {
    const a = rec.rows[0], b = before[key]?.rows[0];
    if (!a || !b) return;                                   // nothing to break yet
    if (a.who.id === b.who.id || !(a.value > b.value)) return;
    if (!(inMatch.has(a.who.id) || a.who.id === team)) return;
    if (!decided && /^all:|^team:(season|streak)/.test(key)) return;
    if (a.matchId && a.matchId !== live.id && !/career|wins|winpct|streak|season/.test(key)) return;
    out.push({key, title:rec.title, game:rec.game, holder:{id:a.who.id, name:a.who.name}, value:a.value, display:a.display || String(a.value), prev:{name:b.who.name, display:b.display || String(b.value)}});
  });
  return out;
}
function flat(r){ const o = {}; r.groups.forEach(g => g.records.forEach(rec => o[rec.key] = {...rec, game:g.game || "", group:g.title})); return o; }

/* ---------- playbill bio draft ---------- */
export function bioDraft(site, finals, id, who, prof = {}){
  const fin = (finals || []).filter(m => m.status === "final" && (m.players || []).some(p => p.id === id)).sort(byDate);
  const name = who.name(id), first = String(name).split(" ")[0];
  const games = [...new Set(fin.map(m => m.game))].map(k => gameFor(site, k)).filter(g => g && g.name);
  const seasons = [...new Set(fin.map(seasonOfM))];
  const w = fin.filter(m => m.result === "W").length, l = fin.filter(m => m.result === "L").length;
  const parts = [];
  const yrs = seasons.length, gameList = games.map(g => g.short || g.name);
  const joined = gameList.length > 1 ? gameList.slice(0, -1).join(", ") + " and " + gameList.slice(-1) : gameList[0];
  if (fin.length) parts.push(`${name}${prof.gradYear ? ` (Class of ${prof.gradYear})` : ""} ${who.current(id) ? "is" : "was"} a ${yrs > 1 ? `${yrs}-season` : "first-year"} member of Hartland Esports${joined ? `, competing in ${joined}` : ""}, with a ${w}–${l} career record across ${fin.length} match${fin.length === 1 ? "" : "es"}.`);
  else parts.push(`${name}${prof.gradYear ? ` (Class of ${prof.gradYear})` : ""} is on the Hartland Esports roster.`);
  /* records held */
  const recs = buildRecords(site, finals, who), held = [];
  recs.groups.forEach(gr => gr.records.forEach(r => { if (r.rows[0]?.who.id === id) held.push(`${gr.game ? (gameFor(site, gr.game).short || gr.title) + " " : ""}${r.title.toLowerCase()} (${r.rows[0].display || r.rows[0].value})`); }));
  if (held.length) parts.push(`${first} holds the program record${held.length > 1 ? "s" : ""} for ${andList(held.slice(0, 3))}.`);
  /* standout single matches */
  const best = [];
  games.forEach(g => (g.statList || []).filter(d => !d.avg && !NEGATIVE.test(d.label)).forEach(d => { fin.filter(m => m.game === g.key).forEach(m => { const p = (m.players || []).find(x => x.id === id); const v = num(p?.stats?.[d.key]); if (v) best.push({v, d, m, g}); }); }));
  const top = best.sort((a, b) => b.v - a.v)[0];
  if (top && !held.length) parts.push(`A standout night: ${fmt(top.v)} ${top.d.label.toLowerCase()} against ${opp(top.m)} on ${day(top.m.startsAt)}.`);
  /* championships and postseason */
  const titles = (site.records || []).filter(r => r.type === "championship" && r.year).filter(r => fin.some(m => (!r.game || m.game === r.game) && termLabel(m.startsAt) === normTerm(r.year) && postseason(m)));
  if (titles.length) parts.push(`Member of the ${andList(titles.map(r => `${r.year} ${r.org ? r.org + " " : ""}${r.title}`))} roster${titles.length > 1 ? "s" : ""}.`);
  else { const post = fin.filter(m => postseason(m)); if (post.length) parts.push(`${first} has played ${post.length} postseason match${post.length === 1 ? "" : "es"}${post.some(m => postseason(m).finals) ? ", including a finals appearance" : ""}.`); }
  /* honors and accolades */
  const hon = (site.records || []).filter(r => r.type === "honor" && name && String(r.detail || "").toLowerCase().includes(String(name).toLowerCase())).map(r => `${r.title}${r.year ? ` (${r.year})` : ""}`);
  const acc = String(prof.accolades || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const honors = [...new Set([...hon, ...acc])];
  if (honors.length) parts.push(`Honors: ${honors.join(", ")}.`);
  return parts.join(" ");
}
const andList = a => a.length < 2 ? (a[0] || "") : a.slice(0, -1).join(", ") + (a.length > 2 ? "," : "") + " and " + a[a.length - 1];
const normTerm = y => { const t = String(y || ""), yr = (t.match(/20\d\d/) || [])[0]; if (!yr) return ""; return `${/spring|winter|jan|feb|mar|apr|may|jun/i.test(t) ? "Spring" : "Fall"} ${yr}`; };

/* ---------- people helpers shared by pages ---------- */
/* Senior = graduates at the end of the current school year (2026-27 season -> Class of 2027). */
export function isSenior(gradYear, when){ const se = seasonOf(when); return !!gradYear && +gradYear === +se.slice(0, 4) + 1; }
