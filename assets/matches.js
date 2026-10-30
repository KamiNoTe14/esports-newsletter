/* Hartland Esports: match data.
   One source of truth for matches. The scorekeeper writes here; the website, scores strip,
   record book, player pages and stream overlay read from here.

   Storage: Firebase Firestore (project hartland-esports)
     matches/{id}        one document per match (see blankMatch for the shape)
     public/scoreboard   small summary of live, upcoming and recent matches for the scores strip
   Finished matches are also archived to the GitHub repo as data/matches/<season>.json.

   Add ?mock=1 to a page URL to use a pretend database in this browser (for testing). */

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAcJVvVCfWZ0d_ykE2QtI4PbP3WHFpCblA",
  authDomain: "hartland-esports.firebaseapp.com",
  projectId: "hartland-esports",
  storageBucket: "hartland-esports.firebasestorage.app",
  messagingSenderId: "393018597424",
  appId: "1:393018597424:web:8dea6d5292a9db26734df5"
};
/* Who can change scores. The real lock is the Firestore security rules (firestore.rules); this list only shapes the screens. */
export const EDITORS = ["cameronmontney@hartlandschools.us", "jasonwatkins@hartlandschools.us"];
export const STATUSES = ["upcoming", "live", "review", "final", "postponed", "canceled"];   // review: a student scorekeeper marked it final, waiting for a coach
export const LEAGUES = ["MHSEL", "MiHSEF", "USAEL Open", "PlayVS Cup", "Exhibition", "Scrimmage"];
export const STAGES = [["regular", "Regular season"], ["playoffs", "Playoffs"], ["finals", "Finals"], ["exhibition", "Exhibition"], ["scrim", "Scrimmage"]];
const TZ = "America/Detroit";
const VENDOR = new URL("./vendor/", import.meta.url).href;

/* ---------- small helpers ---------- */
export const isMock = () => /[?&]mock=1\b/.test(location.search);
export function seasonOf(d){ d = new Date(d || Date.now()); const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; }
/* Every season from this one back to 2015/16, newest first (for season pickers). */
export function seasonList(extra = []){
  const out = new Set(extra.filter(s => /^\d{4}-\d{2}$/.test(s)));
  for (let y = +seasonOf().slice(0, 4); y >= 2015; y--) out.add(`${y}-${String((y + 1) % 100).padStart(2, "0")}`);
  return [...out].sort().reverse();
}
export const seasonLabel = s => String(s || "").replace("-", "/");
export function termOf(d){ const m = new Date(d || Date.now()).getMonth(); return m >= 6 ? "fall" : "spring"; }
export function slug(s){ return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
/* "Novi High School" -> "Novi", "Detroit Catholic Central" stays. Used wherever space is tight (scores strip, scorekeeper). */
/* An opponent's entry in the School library (site.highSchools), matched loosely: "Novi" finds "Novi High School". */
export function schoolInfo(site, name){
  const key = n => shortSchool(n).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(), k = key(name);
  if (!k) return null;
  return (site?.highSchools || []).find(x => [x.name, x.short].some(n => n && key(n) === k)) || null;
}
export function shortSchool(name){
  const s = String(name || "").trim();
  const cut = s.replace(/\s+(jr\.?\s*\/\s*sr\.?\s+|junior\s+|senior\s+|community\s+)?(high\s+sc?h?c?ool|high|hs|h\.s\.|school)\s*$/i, "").replace(/\s+senior$/i, "").trim();
  return cut || s;
}
/* The opponent's name for tight spaces: a short name the coach typed, else the school without "High School". */
export function oppShort(m){ const o = m?.opponent || {}; return String(o.short || "").trim() || shortSchool(o.school) || o.team || "Opponent"; }
/* Is this match against a rival? Rivals are listed in the Site Manager; "Howell" matches "Howell High School". */
export function rivalFor(site, m){
  const key = n => shortSchool(n).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const k = key(m?.opponent?.school || ""); if (!k) return null;
  return (site?.rivals || []).find(r => r.school && key(r.school) === k) || null;
}
/* Playoff and finals matches get a tag: "Playoffs", or the round if one was typed ("Round of 32", "State Final"). */
export function postseason(m){
  if (m?.stage !== "playoffs" && m?.stage !== "finals") return null;
  const w = String(m.week ?? "").trim(), round = w && !/^\d+$/.test(w) ? w : "";
  return {finals:m.stage === "finals", label:round || (m.stage === "finals" ? "Finals" : "Playoffs")};
}
/* "3" -> "Week 3"; "Round of 32" or "Quarterfinal" stay as typed. Playoff and finals matches also say so. */
export function roundLabel(m, short){
  const w = String(m?.week ?? "").trim(), stage = {playoffs:"Playoffs", finals:"Finals", exhibition:"Exhibition", scrim:"Scrimmage"}[m?.stage] || "";
  const wk = !w ? "" : /^\d+$/.test(w) ? (short ? `Wk ${w}` : `Week ${w}`) : w;
  const dup = stage && wk && wk.toLowerCase().includes(stage.toLowerCase().replace(/s$/, ""));
  return [dup ? "" : stage, wk].filter(Boolean).join(" · ");
}
export function abbrFor(school){
  const words = String(school || "").replace(/\b(high|senior|junior|school|academy|hs|jr\/sr|community|the|of)\b/gi, " ").split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (!words.length) return "OPP";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(w => w[0]).join("").slice(0, 4).toUpperCase();
}
export function gameFor(site, key){
  const g = (site?.games || []).find(x => x.key === key);
  return g ? {...g, bestOf:+g.bestOf || 1, teamSize:+g.teamSize || 0, statList:statList(g.stats)} : {key, name:key || "Game", short:key || "Game", unit:"Game", points:"", bestOf:3, statList:[]};
}
export function statList(s){
  if (Array.isArray(s)) return s;
  /* A label ending in % ("Accuracy %") is averaged across games instead of added up. */
  return String(s || "").split(",").map(x => x.trim()).filter(Boolean).map(label => ({key:slug(label).replace(/-/g, "_"), label, avg:/%\s*$/.test(label)}));
}
export const listOf = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
export const fmtStat = (d, v) => v === undefined || v === null || v === "" ? "–" : d.avg ? `${Math.round(+v * 10) / 10}%` : (isNaN(+v) ? String(v) : (+v).toLocaleString("en-US"));
/* Stats are entered per game (m.games[n].p[playerId] = {elims, role, hero, …}). This rolls them up into each player's match
   totals so everything that reads player.stats keeps working. Matches with only typed-in totals are left alone. */
export function rollup(m, g){
  const defs = g?.statList || [], games = (m.games || []).filter(x => x.p && Object.keys(x.p).length);
  m.perGame = games.length > 0;
  if (!m.perGame) return m;
  (m.players || []).forEach(pl => {
    const rows = games.filter(x => x.p[pl.id]).map(x => x.p[pl.id]);
    pl.games = games.filter(x => x.p[pl.id]).map(x => x.n);
    const st = {};
    defs.forEach(d => { const vals = rows.map(r => r[d.key]).filter(v => v !== undefined && v !== null && v !== "").map(Number); if (!vals.length) return;
      const sum = vals.reduce((a, b) => a + b, 0); st[d.key] = d.avg ? Math.round(sum / vals.length * 10) / 10 : sum; });
    pl.stats = st;
    const roles = [...new Set(rows.map(r => r.role).filter(Boolean))]; if (roles.length) pl.roles = roles; else delete pl.roles;
  });
  return m;
}
export function teamLabel(site, team){
  const g = gameFor(site, team?.gameKey);
  return `${g.short || team?.game || ""} ${team?.name || ""}`.trim();
}

/* Recompute the series score, winner and result from the per-game list. Call before every save. */
export function settle(m){
  const games = m.games || [];
  const us = games.filter(g => g.winner === "us").length, them = games.filter(g => g.winner === "them").length;
  m.score = {us, them};
  const need = Math.floor((+m.bestOf || 1) / 2) + 1;
  m.clinched = us >= need ? "us" : them >= need ? "them" : null;
  if (m.forfeit){ m.score = m.forfeit === "them" ? {us:need, them:0} : {us:0, them:need}; m.clinched = m.forfeit === "them" ? "us" : "them"; }
  /* Bye week (odd number of teams in the queue, so no opponent): an automatic win with no games played. */
  if (m.bye){ m.games = []; m.score = {us:0, them:0}; m.clinched = "us"; m.forfeit = null; }
  m.result = m.status === "final" ? (m.bye ? "W" : m.score.us > m.score.them ? "W" : m.score.us < m.score.them ? "L" : "T") : null;
  return m;
}

export function blankMatch(site, team, when){
  const g = gameFor(site, team?.gameKey);
  const startsAt = when || nextDefaultTime();
  return {
    season:seasonOf(startsAt), term:termOf(startsAt), stage:"regular", week:"",
    game:g.key || "", gameName:g.name || team?.game || "", teamId:team?.id || "", teamName:teamLabel(site, team), level:team?.level || "Varsity",
    league:String(team?.leagues || "MHSEL").split(",")[0].trim() || "MHSEL", event:"",
    opponent:{school:"", team:"", short:"", abbr:"", logo:""},
    startsAt, status:"upcoming", bestOf:g.bestOf || 3, current:1,
    score:{us:0, them:0}, games:[], result:null, forfeit:null, clinched:null,
    stream:{live:"", vod:""}, players:[], notes:"", source:{}
  };
}
function nextDefaultTime(){ const d = new Date(); d.setHours(15, 30, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d.toISOString(); }

/* Michigan-time formatting */
export function fmtDay(iso){ return iso ? new Date(iso).toLocaleDateString("en-US", {timeZone:TZ, weekday:"short", month:"short", day:"numeric"}) : ""; }
export function fmtTime(iso){ return iso ? new Date(iso).toLocaleTimeString("en-US", {timeZone:TZ, hour:"numeric", minute:"2-digit"}) : ""; }
export function localInput(iso){ /* "YYYY-MM-DDTHH:MM" in the browser's zone, for <input type=datetime-local> */
  if (!iso) return ""; const d = new Date(iso); const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* The small summary the scores strip reads: everything live, the next 10 upcoming, the last 12 finals. */
export function scoreboardFrom(matches, site){
  const pick = m => ({id:m.id, game:m.game, gameName:m.gameName, teamName:m.teamName, level:m.level, league:m.league,
    opponent:{school:m.opponent?.school || "", team:m.opponent?.team || "", short:m.opponent?.short || "", abbr:m.opponent?.abbr || abbrFor(m.opponent?.school)},
    startsAt:m.startsAt, status:m.status, bestOf:m.bestOf, score:m.score, result:m.result, forfeit:m.forfeit || null, bye:!!m.bye,
    current:(m.games || []).find(g => g.n === m.current && !g.winner) || null, games:(m.games || []).filter(g => g.winner || g.us || g.them).map(({p, ...g}) => g), stream:m.stream || {}, teamId:m.teamId || "", season:m.season, week:m.week || "", event:m.event || "", stage:m.stage || "regular"});
  const live = matches.filter(m => m.status === "live");
  const up = matches.filter(m => m.status === "upcoming" || m.status === "postponed").sort((a, b) => a.startsAt < b.startsAt ? -1 : 1).slice(0, 10);
  const done = matches.filter(m => m.status === "final").sort((a, b) => a.startsAt > b.startsAt ? -1 : 1).slice(0, 12);
  return {updated:new Date().toISOString(), matches:[...live, ...up, ...done].map(pick)};
}

/* Every finished match of one season, in full (lineups and stats). The Results and player pages read this one
   document, so details show up the moment a match goes final. Written only when a final match changes. */
export function seasonDocFrom(matches, season){
  const list = matches.filter(m => m.status === "final" && m.season === season).map(({updatedBy, updatedAt, clinched, ...m}) => m).sort((a, b) => a.startsAt < b.startsAt ? -1 : 1);
  return {season, updated:new Date().toISOString(), matches:list};
}

/* ---------- storage backends ---------- */
let _be = null;
export async function backend(){
  if (_be) return _be;
  _be = isMock() ? mockBackend() : await firebaseBackend();
  return _be;
}

async function firebaseBackend(){
  const fb = await import(VENDOR + "firebase-full.js");
  const app = fb.initializeApp(FIREBASE_CONFIG);
  let db;
  try { db = fb.initializeFirestore(app, {localCache:fb.persistentLocalCache({tabManager:fb.persistentMultipleTabManager()})}); }
  catch(e){ db = fb.getFirestore(app); }
  const auth = fb.getAuth(app);
  const strip = o => JSON.parse(JSON.stringify(o, (k, v) => v === undefined ? null : v));
  return {
    mode:"firebase",
    onUser(cb){ fb.getRedirectResult(auth).catch(() => {}); return fb.onAuthStateChanged(auth, u => cb(u ? {email:(u.email || "").toLowerCase(), name:u.displayName || u.email, photo:u.photoURL || ""} : null)); },
    async signIn(){
      const p = new fb.GoogleAuthProvider(); p.setCustomParameters({prompt:"select_account", hd:"hartlandschools.us"});
      try { await fb.signInWithPopup(auth, p); }
      catch(e){ if (/popup-blocked|operation-not-supported/.test(e.code || "")) await fb.signInWithRedirect(auth, p); else throw e; }
    },
    signOut(){ return fb.signOut(auth); },
    watchSeason(season, cb, onState){
      const q = fb.query(fb.collection(db, "matches"), fb.where("season", "==", season));
      return fb.onSnapshot(q, {includeMetadataChanges:true}, snap => {
        cb(snap.docs.map(d => ({id:d.id, ...d.data()})), {fromCache:snap.metadata.fromCache});
        onState && onState({pending:snap.metadata.hasPendingWrites, fromCache:snap.metadata.fromCache});
      }, err => onState && onState({error:err}));
    },
    newId(){ return fb.doc(fb.collection(db, "matches")).id; },
    /* a student scorekeeper's access: scoutMembers/{email} with scorekeeper:true and the teams they can score */
    async getMember(email){ try { const d = await fb.getDoc(fb.doc(db, "scoutMembers", email)); return d.exists() ? d.data() : null; } catch(e){ return null; } },
    /* every match of one season, once (not live) */
    async getSeason(season){ const s = await fb.getDocs(fb.query(fb.collection(db, "matches"), fb.where("season", "==", season))); return s.docs.map(d => ({id:d.id, ...d.data()})); },
    async save(m, scoreboard, by, seasonDoc){
      const b = fb.writeBatch(db), {id, ...data} = m;
      b.set(fb.doc(db, "matches", id), strip({...data, updatedAt:new Date().toISOString(), updatedBy:by || ""}));
      if (scoreboard) b.set(fb.doc(db, "public", "scoreboard"), strip(scoreboard));
      if (seasonDoc) b.set(fb.doc(db, "public", "season-" + seasonDoc.season), strip(seasonDoc));
      await b.commit();
    },
    async remove(id, scoreboard, seasonDoc){
      const b = fb.writeBatch(db);
      b.delete(fb.doc(db, "matches", id));
      if (scoreboard) b.set(fb.doc(db, "public", "scoreboard"), strip(scoreboard));
      if (seasonDoc) b.set(fb.doc(db, "public", "season-" + seasonDoc.season), strip(seasonDoc));
      await b.commit();
    },
    /* Many matches at once (history imports). Firestore takes up to 500 writes per batch. */
    async saveMany(list, by){
      for (let i = 0; i < list.length; i += 400){
        const b = fb.writeBatch(db), at = new Date().toISOString();
        list.slice(i, i + 400).forEach(m => { const {id, ...data} = m; b.set(fb.doc(db, "matches", id), strip({...data, updatedAt:at, updatedBy:by || ""})); });
        await b.commit();
      }
    },
    async syncSummaries(scoreboard, seasonDoc){
      const b = fb.writeBatch(db);
      if (scoreboard) b.set(fb.doc(db, "public", "scoreboard"), strip(scoreboard));
      if (seasonDoc) b.set(fb.doc(db, "public", "season-" + seasonDoc.season), strip(seasonDoc));
      if (scoreboard || seasonDoc) await b.commit();
    },
    /* public/directory: past players (alumni) and the list of seasons that have results */
    watchDirectory(cb){ return fb.onSnapshot(fb.doc(db, "public", "directory"), s => cb(s.exists() ? s.data() : {}), () => cb({})); },
    async saveDirectory(dir){ await fb.setDoc(fb.doc(db, "public", "directory"), strip(dir)); },
    /* public/broadcast: LevelUP stations (which match each streaming PC shows, plus overlay options) */
    watchBroadcast(cb){ return fb.onSnapshot(fb.doc(db, "public", "broadcast"), s => cb(s.exists() ? s.data() : {}), () => cb({})); },
    async setStation(n, data){ await fb.setDoc(fb.doc(db, "public", "broadcast"), {stations:{[n]:strip(data)}, updated:new Date().toISOString()}, {merge:true}); },
    /* obsState/{station}: what OBS on that streaming PC reports (its scenes, which one is on, replay buffer), written
       by the LevelUP Remote browser source inside OBS. The scorekeeper's remote reads it to show scene buttons. */
    watchObs(n, cb){ return fb.onSnapshot(fb.doc(db, "obsState", String(n)), s => cb(s.exists() ? s.data() : null), () => cb(null)); },
    async setObs(n, data){ await fb.setDoc(fb.doc(db, "obsState", String(n)), data); },
    /* public/ticker: announcements for the stream ticker */
    watchTicker(cb){ return fb.onSnapshot(fb.doc(db, "public", "ticker"), s => cb(s.exists() ? s.data() : {}), () => cb({})); },
    async saveTicker(t){ await fb.setDoc(fb.doc(db, "public", "ticker"), strip(t)); },
    /* rlInbox: Rocket League box scores the stream dropped off, waiting for a coach to apply them */
    watchRLInbox(matchId, cb){ return fb.onSnapshot(fb.query(fb.collection(db, "rlInbox"), fb.where("matchId", "==", matchId)), s => cb(s.docs.map(d => ({id:d.id, ...d.data()}))), () => cb([])); },
    async removeRLBox(id){ await fb.deleteDoc(fb.doc(db, "rlInbox", id)); },
    /* scouting report for one opponent and game (coaches can read and write every report) */
    async scoutFor(game, school){
      const s = await fb.getDocs(fb.query(fb.collection(db, "scoutReports"), fb.where("game", "==", game)));
      const d = s.docs.find(x => x.data().schoolKey === scoutKey(school) || scoutKey(x.data().school) === scoutKey(school));
      return d ? {id:d.id, ...d.data()} : null;
    },
    newScoutId(){ return fb.doc(fb.collection(db, "scoutReports")).id; },
    async saveScout(id, r){ await fb.setDoc(fb.doc(db, "scoutReports", id), strip(r)); }
  };
}

/* Pretend database in localStorage. Other tabs on this computer see changes live, like the real thing. */
function mockBackend(){
  const K = "eagles-mock-matches", SB = "eagles-mock-scoreboard";
  const read = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch(e){ return {}; } };
  const subs = new Set(), dirSubs = new Set(), tickSubs = new Set();
  const emit = () => subs.forEach(f => f());
  window.addEventListener("storage", e => { if (e.key === K) emit(); });
  let user = null; const userSubs = new Set();
  try { user = JSON.parse(sessionStorage.getItem("eagles-mock-user")); } catch(e){}
  return {
    mode:"mock",
    onUser(cb){ userSubs.add(cb); setTimeout(() => cb(user), 0); return () => userSubs.delete(cb); },
    async signIn(){ const as = new URLSearchParams(location.search).get("as"); user = {email:as || EDITORS[0], name:as ? as.split("@")[0] : "Test Coach", photo:""}; sessionStorage.setItem("eagles-mock-user", JSON.stringify(user)); userSubs.forEach(f => f(user)); },
    async signOut(){ user = null; sessionStorage.removeItem("eagles-mock-user"); userSubs.forEach(f => f(null)); },
    watchSeason(season, cb, onState){
      const f = () => { cb(Object.entries(read()).map(([id, m]) => ({id, ...m})).filter(m => m.season === season), {fromCache:false}); onState && onState({pending:false}); };
      subs.add(f); setTimeout(f, 0); return () => subs.delete(f);
    },
    newId(){ return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    async getMember(email){ return mockScout().members?.[email] || null; },
    async getSeason(season){ return Object.entries(read()).map(([id, m]) => ({id, ...m})).filter(m => m.season === season); },
    async save(m, scoreboard, by, seasonDoc){ const all = read(), {id, ...data} = m; all[id] = JSON.parse(JSON.stringify({...data, updatedAt:new Date().toISOString(), updatedBy:by || ""})); localStorage.setItem(K, JSON.stringify(all)); this.syncSummaries(scoreboard, seasonDoc); emit(); },
    async remove(id, scoreboard, seasonDoc){ const all = read(); delete all[id]; localStorage.setItem(K, JSON.stringify(all)); this.syncSummaries(scoreboard, seasonDoc); emit(); },
    async saveMany(list, by){ const all = read(); list.forEach(m => { const {id, ...data} = m; all[id] = JSON.parse(JSON.stringify({...data, updatedAt:new Date().toISOString(), updatedBy:by || ""})); }); localStorage.setItem(K, JSON.stringify(all)); emit(); },
    async syncSummaries(scoreboard, seasonDoc){ if (scoreboard) localStorage.setItem(SB, JSON.stringify(scoreboard)); if (seasonDoc) localStorage.setItem("eagles-mock-season-" + seasonDoc.season, JSON.stringify(seasonDoc)); },
    watchDirectory(cb){ const f = () => { try { cb(JSON.parse(localStorage.getItem("eagles-mock-directory")) || {}); } catch(e){ cb({}); } }; dirSubs.add(f); setTimeout(f, 0); return () => dirSubs.delete(f); },
    async saveDirectory(dir){ localStorage.setItem("eagles-mock-directory", JSON.stringify(dir)); dirSubs.forEach(f => f()); },
    watchBroadcast(cb){ const f = () => { try { cb(JSON.parse(localStorage.getItem("eagles-mock-broadcast")) || {}); } catch(e){ cb({}); } }; f(); window.addEventListener("storage", e => { if (e.key === "eagles-mock-broadcast") f(); }); tickSubs.add(f); return () => tickSubs.delete(f); },
    async setStation(n, data){ let b = {}; try { b = JSON.parse(localStorage.getItem("eagles-mock-broadcast")) || {}; } catch(e){}
      b.stations = b.stations || {}; b.stations[n] = {...(b.stations[n] || {}), ...JSON.parse(JSON.stringify(data))}; b.updated = new Date().toISOString();
      localStorage.setItem("eagles-mock-broadcast", JSON.stringify(b)); tickSubs.forEach(f => f()); },
    watchObs(n, cb){ const k = "eagles-mock-obs-" + n, f = () => { try { cb(JSON.parse(localStorage.getItem(k))); } catch(e){ cb(null); } }; f();
      const h = e => { if (e.key === k) f(); }; window.addEventListener("storage", h); const t = setInterval(f, 1500); return () => { window.removeEventListener("storage", h); clearInterval(t); }; },
    async setObs(n, data){ localStorage.setItem("eagles-mock-obs-" + n, JSON.stringify(data)); },
    watchTicker(cb){ const f = () => { try { cb(JSON.parse(localStorage.getItem("eagles-mock-ticker")) || {}); } catch(e){ cb({}); } }; f(); window.addEventListener("storage", e => { if (e.key === "eagles-mock-ticker") f(); }); tickSubs.add(f); return () => tickSubs.delete(f); },
    async saveTicker(t){ localStorage.setItem("eagles-mock-ticker", JSON.stringify(t)); tickSubs.forEach(f => f()); },
    watchRLInbox(matchId, cb){ const f = () => { let all = {}; try { all = JSON.parse(localStorage.getItem(RLK)) || {}; } catch(e){} cb(Object.entries(all).map(([id, b]) => ({id, ...b})).filter(b => b.matchId === matchId)); };
      f(); const h = e => { if (e.key === RLK) f(); }; window.addEventListener("storage", h); const t = setInterval(f, 2000); return () => { window.removeEventListener("storage", h); clearInterval(t); }; },
    async removeRLBox(id){ let all = {}; try { all = JSON.parse(localStorage.getItem(RLK)) || {}; } catch(e){} delete all[id]; localStorage.setItem(RLK, JSON.stringify(all)); },
    async scoutFor(game, school){ const d = mockScout(); const e = Object.entries(d.reports).find(([, r]) => r.game === game && (r.schoolKey === scoutKey(school) || scoutKey(r.school) === scoutKey(school))); return e ? {id:e[0], ...e[1]} : null; },
    newScoutId(){ return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    async saveScout(id, r){ const d = mockScout(); d.reports[id] = JSON.parse(JSON.stringify(r)); localStorage.setItem("eagles-mock-scout", JSON.stringify(d)); }
  };
}
const RLK = "eagles-mock-rlinbox";
/* how scouting reports are keyed (same as scout/): "Imlay City High School" -> "imlay city" */
export const scoutKey = n => shortSchool(n).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function mockScout(){ try { return JSON.parse(localStorage.getItem("eagles-mock-scout")) || {members:{}, reports:{}, notes:{}}; } catch(e){ return {members:{}, reports:{}, notes:{}}; } }

/* The stream's Rocket League score bug drops each finished game's box score here (it isn't signed in, so it can only
   add to rlInbox, and only for a match that's live or final). A coach applies it in the scorekeeper. */
let _inbox = null;
export async function sendRLBox(id, box){
  if (isMock()){ let all = {}; try { all = JSON.parse(localStorage.getItem(RLK)) || {}; } catch(e){} if (!all[id]){ all[id] = box; localStorage.setItem(RLK, JSON.stringify(all)); } return; }
  _inbox = _inbox || (async () => { const fb = await import(VENDOR + "firebase-full.js"); const app = fb.initializeApp(FIREBASE_CONFIG, "rl-inbox"); return {fb, db:fb.initializeFirestore(app, {localCache:fb.memoryLocalCache()})}; })();
  const {fb, db} = await _inbox;
  await fb.setDoc(fb.doc(db, "rlInbox", id), JSON.parse(JSON.stringify(box)));
}
