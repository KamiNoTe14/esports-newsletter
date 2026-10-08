/* Hartland Esports: PlayVS history export.
   Paste into the DevTools Console on https://app.playvs.com while logged in as a coach.
   It reads your school's match history through the same requests the PlayVS site makes, keeps only
   what the website needs, and downloads one file: playvs-export.json. Nothing is sent anywhere else.
   Opponent players' names and everyone's linked game accounts are removed before the file is made. */
(async () => {
  const SCHOOL = "fd4087e0-2451-42fe-9edb-ed8c76cc1518";          // Hartland High School on PlayVS
  const API = "https://api.playvs.com/graphql";
  const Q = {
    getManagedTeams: "d486b18a047d5fda3cb53c2d25cf5b36a48b245f0a7f132ab1efe4d8b3b1c99d",
    findTeams: "79bfa1336008bc95b8ad61a4cdab601e8f1c8cb446d031737bfdd78cc42e501c",
    getSchoolEligibleMetaseasons: "9d2d02c84f22fc43ba745f2a8a53b850bd2bb681b275d6b073873b86a5aae283",
    teamLeaguesFilters: "666b60e385b5324cf75f5fee602490a49cbefe0cf8a02fffd6bb5d6e77abe89b",
    getMatchesForSeasonByTeamIds: "6a636c680cc74d56a271ee34aededda479cdf3e018f7935a4f166b9a807db170",
    getTopLevelMatchData: "1c7aecce635c0184822e0f5b49fe75938d22fdbecd6187aa60fd0c7ddbf5dd77",
    getMatchPhaseTypeAndScheduleStartsAt: "acb371aa558f080b09be54bb7f8e048d623060c79ab767a74e945d2c6bdec7d7",
    getMatchAndGameStats: "6835ca209b32b180076b057d694e876a1a1cdaaf1080ac81670651a9c990c830",
    getMatchForMatchAssistant: "57b7fbab74ce2b32145f94d6dc0242101bc4ec4d302a6d5a245b6dfb7387f6e3"
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const log = (...a) => console.log("%c[export]", "color:#FFBC05;font-weight:bold", ...a);
  async function gql(op, variables){
    for (let tryNo = 0; tryNo < 3; tryNo++){
      try {
        const r = await fetch(API, {method:"POST", credentials:"include",
          headers:{"content-type":"application/json", "accept":"*/*", "apollo-require-preflight":"true", "apollographql-client-name":"rally"},
          body:JSON.stringify({operationName:op, variables, extensions:{persistedQuery:{version:1, sha256Hash:Q[op]}}})});
        const j = await r.json();
        if (j.errors && !j.data) throw new Error(j.errors.map(e => e.message).join("; "));
        return j.data;
      } catch(e){ if (tryNo === 2){ log(op, "failed:", e.message); return null; } await sleep(800 * (tryNo + 1)); }
    }
  }

  const managed = (await gql("getManagedTeams", {schoolId:SCHOOL}))?.me?.managedTeams || [];
  if (!managed.length){ log("No teams found. Are you logged in to PlayVS as a coach?"); return; }
  const ours = new Set(managed.map(t => t.id));
  const teamInfo = (await gql("findTeams", {ids:[...ours], schoolId:SCHOOL}))?.teamsByIdsSchoolId || [];
  const teams = teamInfo.map(t => ({id:t.id, name:t.name, esport:t.esport?.slug}));
  log(`${teams.length} teams found.`);

  /* Seasons each team was in, with league names and phase ids (preseason / regular season / playoffs). */
  const eligible = ((await gql("getSchoolEligibleMetaseasons", {schoolId:SCHOOL}))?.eligibleMetaseasons || []).map(m => m.id);
  const seasons = [], phases = {}, metas = new Set(eligible);
  for (const t of teams){
    const d = await gql("teamLeaguesFilters", {teamId:t.id, hasMetaseason:false, metaseasonId:null});
    for (const s of d?.team?.enrolledSeasons || []){
      metas.add(s.metaseason?.id);
      seasons.push({teamId:t.id, seasonId:s.id, season:s.name, metaseasonId:s.metaseason?.id, league:s.league?.displayName || s.league?.name});
      for (const p of s.phases || []) phases[p.id] = {name:p.name, type:p.type, season:s.name, league:s.league?.displayName || s.league?.name};
    }
  }
  metas.delete(undefined);
  log(`${metas.size} PlayVS seasons to check.`);

  /* Every match for every team in every season. */
  const list = new Map();
  for (const t of teams) for (const m of metas){
    const d = await gql("getMatchesForSeasonByTeamIds", {limit:200, teamIds:[t.id], metaseasonId:m});
    for (const x of d?.matchesForSeasonByTeamIds || []) if (!list.has(x.id)) list.set(x.id, {id:x.id, teamId:t.id, esport:t.esport, status:x.status, scrimmage:!!x.isScrimmage, startsAt:x.scheduledStartsAt, metaseasonId:m});
  }
  log(`${list.size} matches found. Downloading details (this can take a few minutes)…`);

  /* Strip anything personal that the website doesn't need. */
  const scrub = (o, keepNames) => {
    if (Array.isArray(o)) return o.map(x => scrub(x, keepNames));
    if (!o || typeof o !== "object") return o;
    const out = {};
    const team = o.teamId || o.team?.id;
    const mine = team ? ours.has(team) : keepNames;
    for (const [k, v] of Object.entries(o)){
      if (k === "__typename" || /avatar|logo|Url$/i.test(k)) continue;
      if (k === "userProviderAccounts"){ if (mine) out.gamertags = [...new Set((v || []).map(a => a.providerName + ":" + (a.providerDisplayName || "")).filter(s => !/:$/.test(s) && !/^(Spin|Discord|Twitch|Youtube):/.test(s)))]; continue; }
      if (k === "player" && v && typeof v === "object" && team && !ours.has(team)){ out.player = {id:"opponent"}; continue; }
      out[k] = scrub(v, mine && k !== "teams" && k !== "otherTeams");
    }
    return out;
  };

  const matches = []; let n = 0;
  const ids = [...list.keys()];
  const worker = async () => {
    while (ids.length){
      const id = ids.shift(), base = list.get(id);
      const [top, phase, stats] = await Promise.all([
        gql("getTopLevelMatchData", {matchId:id}),
        gql("getMatchPhaseTypeAndScheduleStartsAt", {matchId:id}),
        gql("getMatchAndGameStats", {matchId:id})]);
      let series = null;
      if (base.esport && base.esport !== "rocket-league") series = await gql("getMatchForMatchAssistant", {matchId:id, includeSeries:true, esportSlug:base.esport});
      matches.push(scrub({...base, top:top?.match, phase:phase?.match, stats:stats?.match, series:series?.match}));
      if (++n % 10 === 0) log(`${n} of ${list.size}`);
      await sleep(150);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  const file = {exportedAt:new Date().toISOString(), school:"Hartland High School", teams, seasons, phases, matches};
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], {type:"application/json"}));
  a.download = "playvs-export.json"; document.body.appendChild(a); a.click(); a.remove();
  log(`Done: ${matches.length} matches saved to playvs-export.json. Send that file to Claude.`);
})();
