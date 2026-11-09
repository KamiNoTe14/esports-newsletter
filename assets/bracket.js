/* Playoff brackets: one model for the Site Manager builder, the website and the stream overlay.
   A bracket in site.json (site.brackets[i]) can carry a built bracket:
     size   4 / 8 / 16 / 32 (single elimination, standard seeding: 1 v 16, 8 v 9, …)
     seeds  [{school, label}] in seed order (seed 1 first). An empty seed is a bye.
     res    {"r-m": {w:"a"|"b", s:"3-1"}}: who won match m of round r (0 = first round), and the score
     game / teamId   which of our teams this bracket is for, so our matches fill in from the scorekeeper
   Hartland's own results fill in by themselves from final playoff matches, unless a result was typed. */

export const SIZES = [4, 8, 16, 32];
/* Standard bracket order of seeds for n teams: 8 -> [1,8,4,5,2,7,3,6] */
export function seedOrder(n){
  let o = [1];
  while (o.length < n){ const m = o.length * 2 + 1; o = o.flatMap(s => [s, m - s]); }
  return o;
}
export function roundName(r, rounds){
  const left = rounds - r;
  return left === 1 ? "Final" : left === 2 ? "Semifinals" : left === 3 ? "Quarterfinals" : `Round of ${2 ** left}`;
}
const key = s => String(s || "").toLowerCase().replace(/\b(high|school|hs|senior|academy|the)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
export const isHartland = s => /\bhartland\b/i.test(String(s || ""));

/* The whole bracket worked out: rounds of matches, who's in each, who won.
   finals: our final matches (to fill in our own results), teamId/game narrow them to this bracket. */
export function buildBracket(b, finals = []){
  const n = SIZES.includes(+b.size) ? +b.size : 8, R = Math.log2(n), seeds = Array.from({length:n}, (_, i) => b.seeds?.[i] || {});
  const team = sd => { const t = seeds[sd - 1]; return t && String(t.school || "").trim() ? {seed:sd, school:String(t.school).trim(), label:String(t.label || "").trim(), us:isHartland(t.school)} : null; };
  const order = seedOrder(n), rounds = [];
  /* our playoff results from the scorekeeper: final playoff/finals matches of this team against that school */
  const ours = finals.filter(m => (m.stage === "playoffs" || m.stage === "finals") && m.status === "final" && (m.result === "W" || m.result === "L") && (!b.teamId || m.teamId === b.teamId) && (!b.game || m.game === b.game))
    .sort((x, y) => String(x.startsAt).localeCompare(String(y.startsAt)));
  const used = new Set();
  const auto = (a, c) => { const opp = a?.us ? c : c?.us ? a : null; if (!opp) return null;
    const m = ours.find(x => !used.has(x.id) && key(x.opponent?.school) && (key(x.opponent.school) === key(opp.school) || key(x.opponent.school).includes(key(opp.school)) || key(opp.school).includes(key(x.opponent.school))));
    if (!m) return null; used.add(m.id);
    const usWon = m.result === "W", sc = m.score ? `${m.score.us}-${m.score.them}` : "";
    return {w:(usWon ? a?.us : !a?.us) ? "a" : "b", s:a?.us ? sc : sc.split("-").reverse().join("-"), auto:true, matchId:m.id}; };
  for (let r = 0; r < R; r++){
    const cnt = n / 2 ** (r + 1), list = [];
    for (let i = 0; i < cnt; i++){
      let A, B;
      if (r === 0){ A = team(order[i * 2]); B = team(order[i * 2 + 1]); }
      else { const p1 = rounds[r - 1][i * 2], p2 = rounds[r - 1][i * 2 + 1]; A = p1.winner; B = p2.winner; }
      const k = `${r}-${i}`, typed = b.res?.[k];
      let res = typed?.w ? typed : null;
      if (!res && A && B) res = auto(A, B);
      /* a bye: one team and an empty seed (first round only) */
      const bye = r === 0 && !!A !== !!B;
      const w = bye ? (A ? "a" : "b") : res?.w;
      const winner = w === "a" ? A : w === "b" ? B : null;
      list.push({r, i, key:k, a:A, b:B, w:w || null, s:res?.s || "", auto:!!res?.auto, bye, winner, us:!!(A?.us || B?.us)});
    }
    rounds.push(list);
  }
  const champ = rounds[R - 1][0]?.winner || null;
  /* how far we got: our last match */
  const ourMatches = rounds.flat().filter(m => m.us && !m.bye);
  return {n, R, rounds, champ, names:rounds.map((_, r) => roundName(r, R)), ourLast:ourMatches[ourMatches.length - 1] || null};
}

/* HTML for a bracket (website + overlay style it). from = first round to show; logo(school) -> image url or "". */
export function bracketHTML(model, {from = 0, logo = () => "", short = s => s, esc = s => String(s ?? ""), edit = false} = {}){
  const rounds = model.rounds.slice(from);
  const side = (m, t, which) => {
    if (!t) return `<div class="bk-t none"><i></i><em></em><span>${m.r === 0 ? (m.bye ? "Bye" : "TBD") : "TBD"}</span><b></b></div>`;
    const sc = m.s ? m.s.split(/[-–]/)[which === "a" ? 0 : 1] : "", lg = logo(t.school);
    return `<div class="bk-t${m.w === which ? " win" : m.w ? " out" : ""}${t.us ? " us" : ""}"><i>${t.seed}</i>${lg ? `<img src="${esc(lg)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<em>${esc((short(t.school) || "?")[0])}</em>`}<span>${esc(t.label || short(t.school))}</span><b>${esc(sc)}</b></div>`; };
  return `<div class="bk" style="--rounds:${rounds.length}">${rounds.map((list, ri) => `<div class="bk-r"><h4>${esc(model.names[ri + from])}</h4><div class="bk-ms">${list.map(m =>
    `<div class="bk-m${m.us ? " us" : ""}${m.bye ? " bye" : ""}${m.auto ? " auto" : ""}" data-k="${m.key}">${side(m, m.a, "a")}${side(m, m.b, "b")}${edit && m.a && m.b ? `<button type="button" class="bk-edit" aria-label="Score">✎</button>` : ""}</div>`).join("")}</div></div>`).join("")}
    <div class="bk-r bk-champ"><h4>Champion</h4><div class="bk-ms"><div class="bk-m">${model.champ ? side({r:99, w:"a", s:""}, model.champ, "a") : `<div class="bk-t none"><i></i><em></em><span>TBD</span><b></b></div>`}</div></div></div></div>`;
}
