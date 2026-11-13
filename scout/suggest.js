/* Scouting report suggestions for Smash: when a report lists the characters a school plays (the roster's
   "Mains" box, or the characters in "Stats against us"), pull in our playbook:
     - for each of their characters: what to watch out for and what to punish (frame data)
     - which of OUR team's characters line up best on frame data
     - which stages to strike or ban (best for THEIR style) and which to pick (best for ours, not theirs),
       from the "Best for" tags on our stage sheets
   "Plays like" styles start from common community descriptions (DEFAULT_STYLE) and coaches can change them on
   each character's sheet (saved privately as plays/smash-char-<slug>). Nothing here is shown on the public site. */
import {sumUp, frameEdge, fmtAdv, ufdURL} from "./frames.js?v=2";
import {STAGES, TYPES, bestOf} from "./smash.js?v=3";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* starting point for "plays like" (rushdown / zoner / heavy / aerial); coaches can change any of these */
export const DEFAULT_STYLE = {
  banjo_and_kazooie:["zoner"], bayonetta:["aerial"], bowser:["heavy"], bowser_jr:["zoner"], byleth:["zoner", "heavy"],
  captain_falcon:["rushdown"], chrom:["rushdown"], cloud:["rushdown"], corrin:["zoner"], daisy:["aerial"], dark_pit:["zoner"],
  dark_samus:["zoner"], diddy_kong:["rushdown"], donkey_kong:["heavy"], dr_mario:["rushdown"], duck_hunt:["zoner"], falco:["rushdown", "aerial"],
  fox:["rushdown"], ganondorf:["heavy"], greninja:["rushdown"], hero:["zoner"], ice_climbers:["rushdown"], ike:["heavy"],
  incineroar:["heavy"], inkling:["rushdown"], isabelle:["zoner"], jigglypuff:["aerial"], joker:["rushdown"], kazuya:["heavy"],
  ken:["rushdown"], king_dedede:["heavy", "zoner"], king_k_rool:["heavy", "zoner"], kirby:["aerial"], link:["zoner"], little_mac:["rushdown"],
  lucario:["rushdown"], lucas:["zoner"], lucina:["rushdown"], luigi:["rushdown"], mario:["rushdown"], marth:["rushdown"],
  mega_man:["zoner"], meta_knight:["aerial", "rushdown"], mewtwo:["aerial"], mii_brawler:["rushdown"], mii_gunner:["zoner"], mii_swordfighter:["zoner"],
  minmin:["zoner"], mr_game_and_watch:["aerial"], mythra:["rushdown"], ness:["aerial"], olimar:["zoner"], pac_man:["zoner"],
  palutena:["aerial"], peach:["aerial"], pichu:["rushdown"], pikachu:["rushdown"], piranha_plant:["zoner"], pit:["zoner"],
  pt_squirtle:["rushdown"], pt_ivysaur:["zoner"], pt_charizard:["heavy"], pyra:["zoner", "heavy"], rob:["zoner"], richter:["zoner"],
  ridley:["heavy"], robin:["zoner"], rosalina_and_luma:["zoner"], roy:["rushdown"], ryu:["rushdown"], samus:["zoner"],
  sephiroth:["zoner"], sheik:["rushdown"], shulk:["rushdown"], simon:["zoner"], snake:["zoner", "heavy"], sonic:["rushdown"],
  sora:["aerial"], steve:["zoner"], terry:["rushdown"], toon_link:["zoner"], villager:["zoner"], wario:["aerial"],
  wii_fit_trainer:["zoner"], wolf:["zoner", "rushdown"], yoshi:["aerial"], young_link:["zoner"], zelda:["zoner"], zero_suit_samus:["rushdown"]
};
export const styleOf = (slug, plays) => plays.find(p => p.kind === "char" && p.slug === slug)?.style || DEFAULT_STYLE[slug] || [];

/* nicknames players actually type */
const ALIAS = {"pp":"Piranha Plant", "plant":"Piranha Plant", "g&w":"Mr. Game & Watch", "gnw":"Mr. Game & Watch", "game and watch":"Mr. Game & Watch", "game & watch":"Mr. Game & Watch",
  "dk":"Donkey Kong", "krool":"King K. Rool", "k rool":"King K. Rool", "k. rool":"King K. Rool", "dedede":"King Dedede", "d3":"King Dedede", "ddd":"King Dedede",
  "zss":"Zero Suit Samus", "rob":"R.O.B.", "pt":"Pokémon Trainer", "pokemon trainer":"Pokémon Trainer", "aegis":"Pyra & Mythra", "pyra/mythra":"Pyra & Mythra",
  "mac":"Little Mac", "falcon":"Captain Falcon", "cf":"Captain Falcon", "mk":"Meta Knight", "ics":"Ice Climbers", "icies":"Ice Climbers", "ylink":"Young Link", "yink":"Young Link",
  "tink":"Toon Link", "wft":"Wii Fit Trainer", "rosa":"Rosalina & Luma", "rosalina":"Rosalina & Luma", "banjo":"Banjo & Kazooie", "jr":"Bowser Jr.", "bowser jr":"Bowser Jr.",
  "doc":"Dr. Mario", "dr mario":"Dr. Mario", "brawler":"Mii Brawler", "gunner":"Mii Gunner", "swordfighter":"Mii Swordfighter", "sword fighter":"Mii Swordfighter",
  "pac":"Pac-Man", "pacman":"Pac-Man", "minmin":"Min Min", "kaz":"Kazuya", "alex":"Steve", "puff":"Jigglypuff", "jiggs":"Jigglypuff", "mr game and watch":"Mr. Game & Watch",
  "incin":"Incineroar", "roar":"Incineroar", "sephy":"Sephiroth", "seph":"Sephiroth", "pokemon":"Pokémon Trainer", "squirtle":"Squirtle", "ivysaur":"Ivysaur", "charizard":"Charizard"};
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/* every character named in a bit of free text ("Mains: PP, Joker / Steve"), longest names first so
   "Toon Link" isn't also read as "Link" */
export function findChars(text, index){
  let t = " " + norm(text).replace(/[,;/|+()]/g, " ") + " ";
  const names = [...(index.chars || []).map(c => [norm(c.name), c.name]), ...Object.keys(index.roster || {}).map(n => [norm(n), n]), ...Object.entries(ALIAS).map(([a, n]) => [a, n])]
    .sort((a, b) => b[0].length - a[0].length);
  const out = [];
  for (const [k, n] of names){ const re = new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[^a-z0-9]|$)`, "g");
    if (re.test(t)){ out.push(n); t = t.replace(re, "$1 "); } }
  return [...new Set(out)];
}
/* a typed or picked name → frame-data slugs ("Pyra & Mythra" → pyra, mythra; "Pokémon Trainer" → all three) */
export function slugsFor(name, index){
  const r = index.roster || {}; const k = Object.keys(r).find(x => norm(x) === norm(name));
  if (k) return r[k];
  const c = (index.chars || []).find(x => norm(x.name) === norm(name)); return c ? [c.slug] : [];
}

/* Their characters, from the report: roster mains (who plays them) and the characters in "Stats against us"
   (how often). → [{slug, name, who:[tags], games}] */
export function theirChars(report, index){
  const map = {};
  const add = (name, tag, n) => slugsFor(name, index).forEach(s => { const e = map[s] = map[s] || {slug:s, name:(index.chars.find(c => c.slug === s) || {}).name || name, who:new Set(), games:0};
    if (tag) e.who.add(tag); e.games += n; });
  (report.players || []).forEach(p => findChars(p.role || "", index).forEach(n => add(n, p.tag, 0)));
  (report.statGames || []).forEach(gm => (gm.players || []).forEach(p => (p.chars?.length ? p.chars : [p.char]).filter(Boolean).forEach(n => findChars(n, index).forEach(x => add(x, p.tag, 1)))));
  return Object.values(map).map(e => ({...e, who:[...e.who]})).sort((a, b) => b.games - a.games || b.who.length - a.who.length || a.name.localeCompare(b.name));
}
/* Our characters: every character our Smash players picked in finished matches, plus mains a coach typed on
   their profile. → [{slug, name, who:[tags], games}] */
export function ourChars(site, finals, index){
  const map = {}, tags = {};
  (site.teams || []).filter(t => t.gameKey === "smash").forEach(t => (t.roster || []).forEach(p => tags[p.id] = p.tag || (p.name || "").split(" ")[0]));
  const add = (name, pid, n) => slugsFor(name, index).forEach(s => { const e = map[s] = map[s] || {slug:s, name:(index.chars.find(c => c.slug === s) || {}).name || name, who:new Set(), games:0};
    if (tags[pid]) e.who.add(tags[pid]); e.games += n; });
  (finals || []).filter(m => m.game === "smash").forEach(m => (m.games || []).forEach(g => Object.entries(g.p || {}).forEach(([pid, r]) =>
    [r.hero, r.hero2, r.hero3, r.hero4, r.hero5].filter(Boolean).forEach(n => add(n, pid, 1)))));
  Object.entries(site.profiles || {}).forEach(([pid, pr]) => tags[pid] && String(pr.chars || "").split(",").map(x => x.trim()).filter(Boolean).forEach(n => add(n, pid, 0)));
  return Object.values(map).map(e => ({...e, who:[...e.who]})).sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}

export function suggestCSS(){ return `
.sg-ch{border:1px solid var(--line);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px;background:#fff}
.sg-top{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.sg-top img{width:44px;height:44px;object-fit:contain}
.sg-top h3{margin:0;font:700 20px/1 var(--display);text-transform:uppercase}
.sg-pills{display:flex;flex-wrap:wrap;gap:6px}
.sg-pill{border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:13px;font-weight:600;background:#fff;color:var(--ink)}
.sg-pill img{width:20px;height:20px;object-fit:contain;vertical-align:middle;margin-right:4px}
.sg-pill.ban{border-color:#E8B4B0;background:#FDF1F0}.sg-pill.pick{border-color:#A9D8BC;background:#EEF8F2}
.sg-pill small{color:var(--muted);font-weight:500}
.sg-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.sg-cols h5{margin:0 0 4px;font:700 11px var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.sg-cols ul{margin:0;padding:0;list-style:none;font-size:14px}.sg-cols li{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid var(--line)}
.sg-cols li b{white-space:nowrap;font-variant-numeric:tabular-nums}
.sg-ours{display:flex;flex-direction:column;gap:6px}
.sg-our{display:flex;gap:8px;align-items:center;font-size:14px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:#FAFCFD;text-align:left;color:var(--ink)}
.sg-our:hover{border-color:var(--gold)}.sg-our img{width:28px;height:28px;object-fit:contain}.sg-our small{display:block;color:var(--muted);font-size:12px}
`; }

/* The "From our playbook" section on a Smash scouting report.
   get(slug) → frame-data doc (cached); open(slug, vs) opens a character sheet; openStage(key) opens a stage. */
export async function suggestHTML({report, index, site, finals, plays, icon, get}){
  if (!index?.chars?.length) return `<p class="empty">Import frame data (Smash playbook → Characters) to get suggestions here.</p>`;
  const theirs = theirChars(report, index).slice(0, 6);
  if (!theirs.length) return `<p class="empty">Add their characters to see suggestions: type mains in the roster's "Mains" box (for example "Piranha Plant, Joker"), or add games under "Stats against us".</p>`;
  const ours = ourChars(site, finals, index);
  const stageDocs = plays.filter(p => p.game === "smash" && p.kind === "stage");
  const [T, O] = await Promise.all([Promise.all(theirs.map(t => get(t.slug))), Promise.all(ours.slice(0, 16).map(o => get(o.slug)))]);
  const pill = (txt, cls, sub) => `<span class="sg-pill ${cls || ""}">${txt}${sub ? ` <small>${sub}</small>` : ""}</span>`;
  const typeName = k => (TYPES.find(t => t[0] === k) || [k, k, ""]).slice(1).reverse().join(" ");
  /* stages: each stage's "Best for" tags against the styles of their characters (weighted by how much each is
     played) and ours. Biggest edge for us → pick; biggest edge for them → strike or ban. */
  const weigh = list => { const w = {}; const tot = list.reduce((a, x) => a + 1 + x.games, 0) || 1;
    list.forEach(x => styleOf(x.slug, plays).forEach(k => w[k] = (w[k] || 0) + (1 + x.games) / tot)); return w; };
  const tw = weigh(theirs), ow = weigh(ours.slice(0, 8));
  const stageRows = STAGES.map(st => { const b = bestOf(stageDocs, st), them = b.reduce((a, k) => a + (tw[k] || 0), 0), us = b.reduce((a, k) => a + (ow[k] || 0), 0);
    return {st, net:us - them, bad:b.filter(k => tw[k]).sort((a, c) => tw[c] - tw[a]), good:b.filter(k => ow[k]).sort((a, c) => ow[c] - ow[a])}; }).sort((a, b) => b.net - a.net);
  const pick = stageRows.filter(r => r.net > 0.05).slice(0, 3), strike = stageRows.filter(r => r.net < -0.05).slice(-3).reverse();
  const neutral = stageRows.filter(r => !pick.includes(r) && !strike.includes(r));
  const cards = theirs.map((t, i) => { const c = T[i]; if (!c) return "";
    const S = sumUp(c), style = styleOf(t.slug, plays);
    const watch = S.fastest.slice(0, 4), resp = S.safe.slice(0, 3), pun = S.unsafe.slice(0, 5);
    const ranked = ours.map((o, j) => O[j] ? {o, e:frameEdge(O[j], c)} : null).filter(Boolean).sort((a, b) => b.e.score - a.e.score)
      /* echo fighters (Samus / Dark Samus) played by the same people come out the same: show one */
      .filter((x, k, arr) => !arr.slice(0, k).some(y => y.e.score === x.e.score && y.o.who.join() === x.o.who.join())).slice(0, 3);
    return `<div class="sg-ch"><div class="sg-top">${icon(t) ? `<img src="${esc(icon(t))}" alt="" onerror="this.remove()">` : ""}<div><h3>${esc(t.name)}</h3>
        <span class="muted" style="font-size:13px">${t.who.length ? `Played by ${esc(t.who.join(", "))}` : ""}${t.games ? `${t.who.length ? " · " : ""}${t.games} game${t.games === 1 ? "" : "s"} against us` : ""}</span></div>
        <div class="sg-pills" style="margin-left:auto">${style.map(s => pill(esc(typeName(s)))).join("")}<button class="btn btn-line btn-sm" data-sgopen="${esc(t.slug)}">Full sheet</button></div></div>
      <div class="sg-cols">
        <div><h5>Watch out for</h5><ul>${watch.map(m => `<li><span>${esc(m.name)}</span><b>frame ${m.s}</b></li>`).join("")}${resp.map(m => `<li><span>${esc(m.name)} <small class="muted">safe on shield</small></span><b>${fmtAdv(m.advBest)}</b></li>`).join("")}</ul></div>
        <div><h5>Punish these (shield, then hit back)</h5><ul>${pun.map(m => `<li><span>${esc(m.name)}</span><b class="fd-bad">${fmtAdv(m.advWorst)}</b></li>`).join("")}</ul>
          <p class="muted" style="margin:6px 0 0;font-size:13px">They hit back out of shield on frame ${S.oosFast ?? "?"}${S.oos[0] ? ` (${esc(S.oos[0].move)})` : ""}. Don't leave ${S.oosFast ?? "that many"}+ frames open on their shield.</p></div>
        <div><h5>Our best picks (frame data)</h5>${ranked.length ? `<div class="sg-ours">${ranked.map(({o, e}) => `<button type="button" class="sg-our" data-sgopen="${esc(t.slug)}" data-sgvs="${esc(o.slug)}">${icon(o) ? `<img src="${esc(icon(o))}" alt="" onerror="this.remove()">` : ""}<span><b>${esc(o.name)}</b>${o.who.length ? ` <span class="muted">(${esc(o.who.slice(0, 2).join(", "))})</span>` : ""}
            <small>${e.ourOos ? `${esc(e.ourOos.move)} out of shield (frame ${e.ourOos.f}) punishes ${e.punish.length} of their ${e.punishN} moves` : "No out-of-shield data"} · ${e.safe.length} of our ${e.safeN} moves safe on their shield</small></span></button>`).join("")}</div>`
          : `<p class="muted" style="margin:0;font-size:13px">No characters for our players yet. They come from finished matches in the scorekeeper, or mains typed on a player's profile.</p>`}</div>
      </div></div>`; }).join("");
  return `<p class="intro" style="font-size:14px;margin:0">From the characters in this report${theirs.length > 1 ? ` (${theirs.length})` : ""}: what to watch for, what to punish, our best picks and stages. Picks use frame data only; matchup knowledge and how our players actually play come first.</p>
    <div><h5 style="margin:0 0 6px;font:700 11px var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Stages</h5>
      <div class="sg-pills">${strike.map(r => `<button type="button" class="sg-pill ban" data-sgstage="${r.st.key}">✕ ${esc(r.st.name)} <small>suits their ${esc(r.bad.map(k => typeName(k).replace(/^\S+ /, "").toLowerCase()).join(" / "))}</small></button>`).join("")}
        ${pick.map(r => `<button type="button" class="sg-pill pick" data-sgstage="${r.st.key}">✓ ${esc(r.st.name)} <small>suits our ${esc(r.good.map(k => typeName(k).replace(/^\S+ /, "").toLowerCase()).join(" / "))}</small></button>`).join("")}
        ${neutral.map(r => `<button type="button" class="sg-pill" data-sgstage="${r.st.key}">${esc(r.st.name)}</button>`).join("")}</div>
      <p class="muted" style="margin:6px 0 0;font-size:13px">✕ strike or ban: suits their characters most (their most-played count most). ✓ pick: suits our characters more than theirs. From the "Best for" tags on our stage sheets and each character's "Plays like" styles.</p></div>
    ${cards}
    <p class="muted" style="margin:0;font-size:12.5px">Frame data: <a href="https://ultimateframedata.com/" target="_blank" rel="noopener">Ultimate Frame Data</a>. On-shield numbers assume the hit lands on shield up close.</p>`;
}
