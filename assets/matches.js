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
export const STATUSES = ["upcoming", "live", "final", "postponed", "canceled"];
export const LEAGUES = ["MHSEL", "MiHSEF", "USAEL Open", "Exhibition", "Scrimmage"];
export const STAGES = [["regular", "Regular season"], ["playoffs", "Playoffs"], ["finals", "Finals"], ["exhibition", "Exhibition"], ["scrim", "Scrimmage"]];
const TZ = "America/Detroit";
const VENDOR = new URL("./vendor/", import.meta.url).href;

/* ---------- small helpers ---------- */
export const isMock = () => /[?&]mock=1\b/.test(location.search);
export function seasonOf(d){ d = new Date(d || Date.now()); const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; }
export const seasonLabel = s => String(s || "").replace("-", "/");
export function termOf(d){ const m = new Date(d || Date.now()).getMonth(); return m >= 6 ? "fall" : "spring"; }
export function slug(s){ return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
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
  return String(s || "").split(",").map(x => x.trim()).filter(Boolean).map(label => ({key:slug(label).replace(/-/g, "_"), label}));
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
  m.result = m.status === "final" ? (m.score.us > m.score.them ? "W" : m.score.us < m.score.them ? "L" : "T") : null;
  return m;
}

export function blankMatch(site, team, when){
  const g = gameFor(site, team?.gameKey);
  const startsAt = when || nextDefaultTime();
  return {
    season:seasonOf(startsAt), term:termOf(startsAt), stage:"regular", week:"",
    game:g.key || "", gameName:g.name || team?.game || "", teamId:team?.id || "", teamName:teamLabel(site, team), level:team?.level || "Varsity",
    league:String(team?.leagues || "MHSEL").split(",")[0].trim() || "MHSEL", event:"",
    opponent:{school:"", team:"", abbr:"", logo:""},
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
    opponent:{school:m.opponent?.school || "", team:m.opponent?.team || "", abbr:m.opponent?.abbr || abbrFor(m.opponent?.school)},
    startsAt:m.startsAt, status:m.status, bestOf:m.bestOf, score:m.score, result:m.result, forfeit:m.forfeit || null,
    current:(m.games || []).find(g => g.n === m.current && !g.winner) || null, stream:m.stream || {}});
  const live = matches.filter(m => m.status === "live");
  const up = matches.filter(m => m.status === "upcoming" || m.status === "postponed").sort((a, b) => a.startsAt < b.startsAt ? -1 : 1).slice(0, 10);
  const done = matches.filter(m => m.status === "final").sort((a, b) => a.startsAt > b.startsAt ? -1 : 1).slice(0, 12);
  return {updated:new Date().toISOString(), matches:[...live, ...up, ...done].map(pick)};
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
        cb(snap.docs.map(d => ({id:d.id, ...d.data()})));
        onState && onState({pending:snap.metadata.hasPendingWrites, fromCache:snap.metadata.fromCache});
      }, err => onState && onState({error:err}));
    },
    newId(){ return fb.doc(fb.collection(db, "matches")).id; },
    async save(m, scoreboard, by){
      const b = fb.writeBatch(db), {id, ...data} = m;
      b.set(fb.doc(db, "matches", id), strip({...data, updatedAt:new Date().toISOString(), updatedBy:by || ""}));
      if (scoreboard) b.set(fb.doc(db, "public", "scoreboard"), strip(scoreboard));
      await b.commit();
    },
    async remove(id, scoreboard){
      const b = fb.writeBatch(db);
      b.delete(fb.doc(db, "matches", id));
      if (scoreboard) b.set(fb.doc(db, "public", "scoreboard"), strip(scoreboard));
      await b.commit();
    }
  };
}

/* Pretend database in localStorage. Other tabs on this computer see changes live, like the real thing. */
function mockBackend(){
  const K = "eagles-mock-matches", SB = "eagles-mock-scoreboard";
  const read = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch(e){ return {}; } };
  const subs = new Set();
  const emit = () => subs.forEach(f => f());
  window.addEventListener("storage", e => { if (e.key === K) emit(); });
  let user = null; const userSubs = new Set();
  try { user = JSON.parse(sessionStorage.getItem("eagles-mock-user")); } catch(e){}
  return {
    mode:"mock",
    onUser(cb){ userSubs.add(cb); setTimeout(() => cb(user), 0); return () => userSubs.delete(cb); },
    async signIn(){ user = {email:EDITORS[0], name:"Test Coach", photo:""}; sessionStorage.setItem("eagles-mock-user", JSON.stringify(user)); userSubs.forEach(f => f(user)); },
    async signOut(){ user = null; sessionStorage.removeItem("eagles-mock-user"); userSubs.forEach(f => f(null)); },
    watchSeason(season, cb, onState){
      const f = () => { cb(Object.entries(read()).map(([id, m]) => ({id, ...m})).filter(m => m.season === season)); onState && onState({pending:false}); };
      subs.add(f); setTimeout(f, 0); return () => subs.delete(f);
    },
    newId(){ return "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
    async save(m, scoreboard, by){ const all = read(), {id, ...data} = m; all[id] = JSON.parse(JSON.stringify({...data, updatedAt:new Date().toISOString(), updatedBy:by || ""})); localStorage.setItem(K, JSON.stringify(all)); if (scoreboard) localStorage.setItem(SB, JSON.stringify(scoreboard)); emit(); },
    async remove(id, scoreboard){ const all = read(); delete all[id]; localStorage.setItem(K, JSON.stringify(all)); if (scoreboard) localStorage.setItem(SB, JSON.stringify(scoreboard)); emit(); }
  };
}
