/* Turns a playvs-export.json file (made by tools/playvs-export.js) into scorekeeper matches.
   Pure functions only: nothing here reads or writes the database, so it can be tested on its own. */
import {settle, seasonOf, termOf, shortSchool, slug, gameFor, teamLabel} from "./matches.js?v=15";

/* PlayVS game -> our game key and name. Games the site doesn't track still import (scores only). */
const ESPORTS = {
  "rocket-league": ["rocket-league", "Rocket League"],
  "super-smash-bros-ultimate": ["smash", "Super Smash Bros. Ultimate"],
  "fortnite-2": ["fortnite-zw", "Fortnite Zone Wars"],
  "marvel-rivals": ["marvel-rivals", "Marvel Rivals"],
  "splatoon-2": ["splatoon", "Splatoon 3"],
  "overwatch": ["overwatch", "Overwatch 2"],
  "madden-21-solos-ps4": ["madden", "Madden NFL"],
  "street-fighter": ["street-fighter", "Street Fighter 6"],
  "brawlhalla": ["brawlhalla", "Brawlhalla"],
  "rocket-league-duos": ["rocket-league-duos", "Rocket League Duos"],
  "super-smash-bros-ultimate-solos": ["smash-solos", "Smash Ultimate Solos"],
  "valorant": ["valorant", "VALORANT"],
  "hearthstone": ["hearthstone", "Hearthstone"]
};
function dist(a, b){ const d = Array.from({length:b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++){ let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++){ const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return d[b.length]; }
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const localDay = iso => new Date(iso).toLocaleDateString("en-CA", {timeZone:"America/Detroit"});

export function gameOf(site, esport){
  const [key, name] = ESPORTS[esport] || [slug(esport), esport];
  const g = (site.games || []).find(x => x.key === key);
  return {key, name:g?.name || name, short:g?.short || name, known:!!g};
}

/* Default website team for a PlayVS team: the site's own team when there is exactly one match, otherwise a name built
   from the PlayVS one ("Hartland Varsity Blue" -> "Fortnite Varsity Blue"). The coach can rename these before importing. */
export function defaultTeams(site, exp){
  const out = {};
  for (const t of exp.teams || []){
    const g = gameOf(site, t.esport), level = /\bJV\b|junior varsity/i.test(t.name) ? "JV" : "Varsity";
    const same = (site.teams || []).filter(x => x.gameKey === g.key && (x.level || "Varsity") === level);
    const clean = String(t.name).replace(/\bHartland\b|\bEagles\b/gi, "").replace(/\s+/g, " ").trim() || level;
    out[t.id] = same.length === 1 ? {teamId:same[0].id, teamName:teamLabel(site, same[0]), level, game:g.key, gameName:g.name}
      : {teamId:"", teamName:`${g.short} ${clean}`.replace(/\s+/g, " ").trim(), level, game:g.key, gameName:g.name};
  }
  return out;
}

/* people: Map id -> {id, name, tag, private, alum}. Finds a site player by name, then by gamertag. */
function finder(people){
  const byName = new Map(), byTag = new Map();
  for (const p of people.values()){ if (p.name) byName.set(norm(p.name), p); if (p.tag) byTag.set(norm(p.tag), p); }
  return pv => {
    const tags = (pv.gamertags || []).map(t => t.split(":").slice(1).join(":")).filter(Boolean);
    const n = norm(pv.name);
    return byName.get(n) || tags.map(t => byTag.get(norm(t))).find(Boolean)
      /* close spellings ("Jaxon Raymond" / "Jaxon Raymon"): same first name, last name off by a letter or two */
      || [...byName.entries()].find(([k]) => k.split(" ")[0] === n.split(" ")[0] && k.length > 6 && dist(k, n) <= 2)?.[1] || null;
  };
}

/* Opponents whose PlayVS team has no school: use the team -> school list saved from RallyCry imports, if it knows them. */
function schoolFor(site, team){ const k = norm(team); if (!k) return ""; const hit = Object.entries(site.teamSchools || {}).find(([t]) => norm(t) === k); return hit ? hit[1] : ""; }
const LEAGUE = d => /MHSEL/i.test(d || "") ? "MHSEL" : /PlayVS Cup/i.test(d || "") ? "PlayVS Cup" : "PlayVS";

/* Convert everything. Returns {matches, newPlayers, skipped}. Each match carries _pv (info for the preview). */
export function convert(site, exp, people, teamMap){
  const find = finder(people), fresh = new Map(); // PlayVS player id -> new past player
  const seasonInfo = new Map((exp.seasons || []).map(s => [s.teamId + "|" + s.metaseasonId, s]));
  const person = pv => {
    if (!pv?.name) return null;
    const hit = find(pv); if (hit) return hit;
    if (!fresh.has(pv.id)){
      const tag = (pv.gamertags || []).map(t => t.split(":").slice(1).join(":")).find(Boolean) || "";
      const name = String(pv.name).trim().replace(/\b\w/g, c => c.toUpperCase());
      fresh.set(pv.id, {id:"p-" + pv.id.replace(/-/g, "").slice(0, 8), name, tag, gradYear:"", private:false, now:"", alum:true, _new:true});
    }
    return fresh.get(pv.id);
  };
  const out = [], skipped = [];
  for (const x of exp.matches || []){
    const top = x.top || {}, ph = x.phase || {}, ser = x.series || {};
    const why = {bye:"Bye", cancelled:"Cancelled", rescheduled:"Rescheduled (replaced by another match)"}[x.status];
    if (why){ skipped.push({id:x.id, why}); continue; }
    const tm = teamMap[x.teamId]; if (!tm){ skipped.push({id:x.id, why:"Team not found"}); continue; }
    const ctx = top.teamContext || {};
    const us = (ctx.myTeams || [])[0]?.id || x.teamId, opp = (ctx.otherTeams || [])[0] || {};
    const oppId = opp.id;
    const phase = ph.slot?.phase || {}, si = seasonInfo.get(x.teamId + "|" + x.metaseasonId) || {};
    const leagueName = si.league || exp.phases?.[phase.id]?.league || "";
    const seasonName = phase.season?.name || si.season || "";
    const type = phase.type || exp.phases?.[phase.id]?.type || "";
    const startsAt = top.scheduledStartsAt || x.startsAt;
    const crew = (ser.series || []).length > 1;
    const m = {
      season:seasonOf(startsAt), term:termOf(startsAt), startsAt, status:"final",
      stage:x.scrimmage ? "scrim" : type === "playoff" ? "playoffs" : type === "regularSeason" ? "regular" : "exhibition",
      week:type === "playoff" ? (exp.phases?.[phase.id]?.name && !/^playoffs$/i.test(exp.phases[phase.id].name) ? exp.phases[phase.id].name : "") : type === "preseason" || type === "qualifier" ? "Preseason" : "",
      game:tm.game, gameName:tm.gameName, teamId:tm.teamId, teamName:tm.teamName, level:tm.level,
      league:LEAGUE(leagueName), event:[LEAGUE(leagueName), seasonName].filter(Boolean).join(" "),
      opponent:{school:opp.school?.name || schoolFor(site, opp.name), team:String(opp.name || "").trim() || "Unknown opponent", short:"", abbr:"", logo:""},
      bestOf:crew ? (top.seriesBestOf || (ser.series || []).length) : (top.bestOf || 3), current:1,
      games:[], players:[], forfeit:null, stream:{live:"", vod:""}, notes:leagueName && LEAGUE(leagueName) === "PlayVS" ? leagueName : "",
      source:{playvs:x.id}
    };
    const players = new Map();
    const addPlayer = pv => { const p = person(pv); if (!p) return null; if (!players.has(p.id)) players.set(p.id, p); return p.id; };
    const won = r => r?.placing === 1;

    if (crew){
      /* Smash crew battles etc.: each "game" on the site is one set between two players. */
      const sGames = ser.games || [];
      (ser.series || []).forEach((s, i) => {
        const teams = s.teamContext?.teams || [], mine = teams.find(t => t.id === us), theirs = teams.find(t => t.id !== us);
        const gs = sGames.filter(g => g.seriesId === s.id);
        const gw = side => gs.filter(g => (g.gameResults || []).some(r => r.teamId === side && r.placing === 1)).length;
        const winner = won(mine?.result) ? "us" : won(theirs?.result) ? "them" : null;
        const row = {n:i + 1, us:gw(us), them:gw(theirs?.id), winner};
        const pid = mine?.roster?.[0] ? addPlayer(mine.roster[0]) : null;
        if (pid) row.p = {[pid]:{}};
        if (winner) m.games.push(row);
      });
    } else {
      /* One game per row. Scores come from game results (Fortnite rounds) or Rocket League goals. */
      const list = (ser.games || []).length ? [...ser.games].sort((a, b) => (a.ordinalNumber || 0) - (b.ordinalNumber || 0)) : (ph.games || []);
      const statGames = new Map(((x.stats || {}).games || []).map(g => [g.id, g]));
      list.forEach((g, i) => {
        const rs = g.gameResults || [], mine = rs.find(r => r.teamId === us), theirs = rs.find(r => r.teamId !== us);
        const winner = won(mine) ? "us" : won(theirs) ? "them" : null;
        if (!winner) return;
        const row = {n:i + 1, us:+mine?.score || 0, them:+theirs?.score || 0, winner};
        const sg = statGames.get(g.id);
        if (sg && (sg.playerGameStats || []).length){
          const goals = side => sg.playerGameStats.filter(p => side ? p.teamId === us : p.teamId !== us).reduce((a, p) => a + (+p.rocketLeagueStats?.goals || 0), 0);
          if (sg.playerGameStats.some(p => p.rocketLeagueStats)){ row.us = goals(true); row.them = goals(false); }
          const p = {};
          sg.playerGameStats.filter(s => s.teamId === us && s.player?.name).forEach(s => {
            const id = addPlayer(s.player); if (!id) return;
            const st = s.rocketLeagueStats; p[id] = st ? {goals:+st.goals || 0, assists:+st.assists || 0, saves:+st.saves || 0, shots:+st.shots || 0} : {};
          });
          if (Object.keys(p).length) row.p = p;
        }
        m.games.push(row);
      });
    }
    m.games.forEach((g, i) => g.n = i + 1);
    m.players = [...players.values()].map(p => ({id:p.id, name:p.private ? "" : (p.name || ""), tag:p.tag || "", private:!!p.private, ...(p.alum ? {alum:true} : {}), stats:{}}));

    const winId = top.winningTeamId;
    if (x.status === "forfeited" || !m.games.length){
      if (winId === us) m.forfeit = "them"; else if (winId && winId !== us) m.forfeit = "us";
      else if (!m.games.length){ skipped.push({id:x.id, why:x.status === "forfeited" ? "Forfeit with no winner recorded" : "No game results on PlayVS", date:startsAt, team:tm.teamName, opp:m.opponent.team}); continue; }
      if (m.forfeit) m.games = [];
    }
    settle(m); m.current = m.games.length || 1;
    const check = winId && !m.forfeit && ((winId === us) !== (m.result === "W"));
    m._pv = {pvTeam:x.teamId, date:startsAt, day:localDay(startsAt), scrim:!!x.scrimmage, preseason:type === "preseason" || type === "qualifier", seasonName, leagueName, check, oppKey:norm(shortSchool(m.opponent.school) || m.opponent.team), crew};
    out.push(m);
  }
  return {matches:out, newPlayers:[...fresh.values()], skipped};
}

/* Is this PlayVS match already in the scorekeeper? Same PlayVS id, or same day + game + opponent. */
export function findExisting(m, existing){
  return existing.find(e => e.source?.playvs === m.source.playvs)
    || existing.find(e => e.game === m.game && localDay(e.startsAt) === m._pv.day
      && (norm(shortSchool(e.opponent?.school) || e.opponent?.team) === m._pv.oppKey || norm(e.opponent?.team) === norm(m.opponent.team))) || null;
}
