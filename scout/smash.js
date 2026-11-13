/* Smash Ultimate playbook: our competition stages, drawn, with their numbers.
   Stage list: PlayVS high school SSBU rulebook (Sept 30, 2026) - 5 starters, 3 counterpicks.
   Numbers: Kurogane Hammer, kuroganehammer.com/Ultimate/Stages (blast zones, ledges; game units).
   Small Battlefield and Hollow Bastion: SmashWiki says both use Final Destination's blast zones; their ledge
   positions aren't published there, so width shows as unknown. Platform positions aren't published either:
   the drawings show each stage's layout, not exact platform heights.
   "Best for" defaults come from the coach's 2025-26 stage sheet; coaches and captains can change them and add
   notes (saved privately in plays/smash-stage-<key>, like the Rocket League playbook). */

export const TYPES = [["rushdown", "Rushdown", "🔥"], ["zoner", "Zoner", "🎯"], ["heavy", "Heavy", "💪"], ["aerial", "Aerial", "🌪️"]];
export const STAGES = [
  {key:"battlefield", name:"Battlefield", tier:"Starter", bz:[-240, 240, 192, -140], ledge:[-79.99, 79.99], best:["aerial"],
    plats:[[-58, -22, 27], [22, 58, 27], [-18, 18, 54]], platText:"3 platforms: two low, one high", walls:false},
  {key:"ps2", name:"Pokémon Stadium 2", tier:"Starter", bz:[-250, 250, 180, -125], ledge:[-93.78, 93.78], best:["zoner"],
    plats:[[-66, -30, 30], [30, 66, 30]], platText:"2 platforms; the stage changes between four transformations", walls:false, stem:true},
  {key:"smallbf", name:"Small Battlefield", tier:"Starter", bz:[-240, 240, 180, -140], bzNote:"Same as Final Destination (SmashWiki)", ledge:null, approxLedge:[-76, 76], best:["rushdown"],
    plats:[[-52, -18, 27], [18, 52, 27]], platText:"2 platforms, slightly closer together than Battlefield's", walls:false},
  {key:"smashville", name:"Smashville", tier:"Starter", bz:[-229, 230, 190, -115], ledge:[-69.05, 70.25], best:["rushdown"],
    plats:[[-20, 20, 35]], platText:"1 platform that slides side to side", walls:false, moving:true},
  {key:"townandcity", name:"Town and City", tier:"Starter", bz:[-230, 230, 195, -118], ledge:[-81.78, 83.22], best:["heavy"],
    plats:[[-24, 24, 24, "center"], [-84, -48, 44, "some"], [48, 84, 44, "some"]], platText:"Center platform plus two side platforms that come and go", walls:false},
  {key:"fd", name:"Final Destination", tier:"Counterpick", bz:[-240, 240, 180, -140], ledge:[-80, 79.99], best:["zoner"],
    plats:[], platText:"No platforms", walls:false},
  {key:"hollowbastion", name:"Hollow Bastion", tier:"Counterpick", bz:[-240, 240, 180, -140], bzNote:"Same as Final Destination (SmashWiki)", ledge:null, approxLedge:[-76, 76], best:["rushdown", "aerial"],
    plats:[[-20, 20, 35]], platText:"1 platform; main stage slightly larger than Smashville's", walls:false},
  {key:"kalos", name:"Kalos Pokémon League", tier:"Counterpick", bz:[-245, 245, 192, -118], ledge:[-80, 80], best:["zoner", "aerial"],
    plats:[[-66, -32, 34], [32, 66, 34]], platText:"2 platforms; walls under both ledges", walls:true}
];
export const SOURCES = [["Kurogane Hammer: Ultimate stage data", "https://kuroganehammer.com/Ultimate/Stages"], ["SmashWiki: Small Battlefield", "https://www.ssbwiki.com/Small_Battlefield"],
  ["SmashWiki: Hollow Bastion", "https://www.ssbwiki.com/Hollow_Bastion"], ["PlayVS SSBU rulebook (high school)", "https://help.playvs.com/en/articles/4919168-super-smash-bros-ultimate-rulebook-high-school"]];

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const width = st => st.ledge ? Math.round((st.ledge[1] - st.ledge[0]) * 10) / 10 : null;
const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(1);

/* A stage drawn like the paper stage sheets: the stage and its platforms, with the blast zones as a dashed box
   when big (detail view). Game units, y up. */
export function stageSVG(st, {big = false} = {}){
  const [l, r, t, b] = st.bz, L = st.ledge || st.approxLedge;
  const vb = big ? [l - 14, -(t + 14), r - l + 28, t - b + 28] : [-120, -80, 240, 150];
  const Y = y => -y;
  const under = st.walls
    ? `<path d="M${L[0]},0 L${L[0]},60 M${L[1]},0 L${L[1]},60" class="ss-stage"/><line x1="${L[0] - 6}" y1="60" x2="${L[1] + 6}" y2="60" class="ss-dot"/>`
    : st.stem
      ? `<path d="M${L[0]},0 L${L[0] + 8},14 L${-14},14 L${-12},30 L${12},30 L${14},14 L${L[1] - 8},14 L${L[1]},0" class="ss-stage"/><line x1="${L[0] - 6}" y1="30" x2="${L[1] + 6}" y2="30" class="ss-dot"/><path d="M-8,30 L-8,44 M8,30 L8,44" class="ss-stage"/>`
      : `<path d="M${L[0]},0 L${L[0] + 14},${st.key === "fd" || st.key === "kalos" ? 18 : 20} L${L[1] - 14},${st.key === "fd" || st.key === "kalos" ? 18 : 20} L${L[1]},0" class="ss-stage"/>`;
  const plats = st.plats.map(([a, c, h, kind]) => `<line x1="${a}" y1="${Y(h)}" x2="${c}" y2="${Y(h)}" class="ss-plat${kind === "some" ? " some" : ""}"/>${st.moving ? `<path d="M${a - 10},${Y(h)} l-6,0 m0,0 l3,-3 m-3,3 l3,3 M${c + 10},${Y(h)} l6,0 m0,0 l-3,-3 m3,3 l-3,3" class="ss-move"/>` : ""}`).join("");
  const box = big ? `<rect x="${l}" y="${-t}" width="${r - l}" height="${t - b}" class="ss-bz"/>
      <text x="0" y="${-t + 9}" class="ss-lbl">top ${fmt(t)}</text><text x="0" y="${-b - 4}" class="ss-lbl">bottom ${fmt(Math.abs(b))}</text>
      <text x="${l + 4}" y="${-60}" class="ss-lbl" text-anchor="start">${fmt(Math.abs(l))}</text><text x="${r - 4}" y="${-60}" class="ss-lbl" text-anchor="end">${fmt(r)}</text>
      ${st.ledge ? `<line x1="${L[0]}" y1="-8" x2="${L[1]}" y2="-8" class="ss-meas"/><text x="0" y="-11" class="ss-lbl">${fmt(width(st))} ledge to ledge</text>` : ""}` : "";
  return `<svg viewBox="${vb.join(" ")}" class="ss-svg${big ? " big" : ""}" role="img" aria-label="${esc(st.name)} layout">${box}<line x1="${L[0]}" y1="0" x2="${L[1]}" y2="0" class="ss-stage"/>${under}${plats}</svg>`;
}

export function smashCSS(){ return `
.ss-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.ss-card{border:1px solid var(--line);border-radius:10px;background:#fff;padding:12px;display:flex;flex-direction:column;gap:8px;text-align:left;color:var(--ink)}
.ss-card:hover{border-color:var(--gold)}
.ss-pic{border:2px solid var(--ink);border-radius:6px;background:#fff;aspect-ratio:16/10;display:grid;place-items:center;overflow:hidden}
.ss-svg{width:100%;height:100%}.ss-svg.big{height:auto;max-height:420px}
.ss-stage{fill:none;stroke:#0B1F33;stroke-width:2.2;stroke-linejoin:round}
.ss-plat{stroke:#0B1F33;stroke-width:2.2}.ss-plat.some{stroke-dasharray:4 3;opacity:.7}
.ss-dot{stroke:#0B1F33;stroke-width:1;stroke-dasharray:2 2}
.ss-move{fill:none;stroke:#B3261E;stroke-width:1.2}
.ss-bz{fill:none;stroke:#B3261E;stroke-width:1.4;stroke-dasharray:6 4}
.ss-meas{stroke:#1F6FEB;stroke-width:1}
.ss-lbl{fill:#5A6B7F;font:600 11px var(--body);text-anchor:middle}
.ss-name{font:700 22px/1 var(--display);text-transform:uppercase;letter-spacing:.02em}
.ss-nums{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:13px;color:var(--muted)}.ss-nums b{color:var(--ink)}
.ss-types{display:flex;flex-wrap:wrap;gap:6px}
.ss-type{border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:13px;font-weight:600;background:#fff}
.ss-type[aria-pressed="true"]{background:var(--gold);border-color:var(--gold);color:var(--navy)}
.ss-tbl{width:100%;border-collapse:collapse;font-size:14px}.ss-tbl th,.ss-tbl td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left}
.ss-tbl th{font:700 11px var(--body);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.ss-tbl td.n{text-align:right;font-variant-numeric:tabular-nums}
.ss-tbl tr:hover td{background:#F5F8FB;cursor:pointer}
.ss-low{color:#B3261E;font-weight:700}.ss-high{color:#1E7A45;font-weight:700}
.ss-wrap{overflow-x:auto}
`; }

const notesFor = (docs, key) => docs.find(d => d.stage === key) || null;
export const bestOf = (docs, st) => notesFor(docs, st.key)?.best || st.best;
const typeChips = (keys, cls = "") => keys.map(k => { const t = TYPES.find(x => x[0] === k); return t ? `<span class="ss-type ${cls}">${t[2]} ${t[1]}</span>` : ""; }).join("");

/* ctx: {db, user, canEdit(game), toast, game:"smash"}; docs = this game's stage notes from plays/ */
export function smashPlaybook(M, ctx, docs, open){
  const can = ctx.canEdit("smash");
  const sides = st => Math.min(Math.abs(st.bz[0]), st.bz[1]);
  /* which numbers stand out: closest blast zones make KOs come earlier */
  const ext = (f, list) => { const v = list.map(f).filter(x => x != null); return [Math.min(...v), Math.max(...v)]; };
  const [tLo, tHi] = ext(s => s.bz[2], STAGES), [sLo, sHi] = ext(sides, STAGES), [bLo, bHi] = ext(s => Math.abs(s.bz[3]), STAGES), [wLo, wHi] = ext(width, STAGES);
  const mark = (v, lo, hi) => v === lo ? "ss-low" : v === hi ? "ss-high" : "";
  const card = st => `<button type="button" class="ss-card" data-stage="${st.key}"><div class="ss-pic">${stageSVG(st)}</div>
      <div class="ss-name">${esc(st.name)}</div><div class="ss-nums"><span>Top <b>${fmt(st.bz[2])}</b></span><span>Sides <b>${fmt(sides(st))}</b></span><span>Width <b>${width(st) ? fmt(width(st)) : "?"}</b></span></div>
      <div class="ss-types">${typeChips(bestOf(docs, st))}</div></button>`;
  M.innerHTML = `${ctx.tabs || ""}<div class="card"><div class="card-h"><h2>Smash playbook</h2><span class="tag">2026–27 stage list</span></div>
      <p class="intro">Our competition stages with their sizes. Smaller numbers mean that blast zone is closer, so KOs happen sooner in that direction. Tap a stage for the full diagram${can ? ", to set who it's best for, and to add notes" : " and the coaches' notes"}.</p>
      <p class="muted" style="margin:0"><b>Striking:</b> game 1, the home team strikes 1 starter, the away team strikes 2, then the home team strikes 1 more. After that, the winner of the last game strikes 2 and the loser picks from what's left, counterpicks included.</p></div>
    <div class="card"><h4>Starters</h4><div class="ss-grid">${STAGES.filter(s => s.tier === "Starter").map(card).join("")}</div></div>
    <div class="card"><h4>Counterpicks</h4><div class="ss-grid">${STAGES.filter(s => s.tier === "Counterpick").map(card).join("")}</div></div>
    <div class="card"><h4>Compare the stages</h4><div class="ss-wrap"><table class="ss-tbl"><thead><tr><th>Stage</th><th></th><th class="n" title="Top blast zone">Top</th><th class="n" title="Distance to the side blast zones">Sides</th><th class="n" title="Bottom blast zone">Bottom</th><th class="n" title="Ledge to ledge">Width</th><th>Platforms</th><th>Best for</th></tr></thead><tbody>
      ${STAGES.map(st => `<tr data-stage="${st.key}"><td><b>${esc(st.name)}</b></td><td><span class="tag${st.tier === "Starter" ? " gold" : ""}">${st.tier}</span></td>
        <td class="n ${mark(st.bz[2], tLo, tHi)}">${fmt(st.bz[2])}</td><td class="n ${mark(sides(st), sLo, sHi)}">${fmt(sides(st))}</td><td class="n ${mark(Math.abs(st.bz[3]), bLo, bHi)}">${fmt(Math.abs(st.bz[3]))}</td>
        <td class="n ${width(st) ? mark(width(st), wLo, wHi) : ""}">${width(st) ? fmt(width(st)) : "?"}</td><td>${st.plats.length || "None"}</td><td>${typeChips(bestOf(docs, st))}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted" style="margin:0"><span class="ss-low">Red</span> = closest (KOs earliest that way, or the smallest stage); <span class="ss-high">green</span> = farthest. "?" = not published. Units are the game's own.</p></div>
    <div class="card"><p class="muted" style="margin:0">Sources: ${SOURCES.map(([t, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(t)}</a>`).join(" · ")}. Platforms in the drawings show each layout, not exact heights.</p></div>`;
  M.querySelectorAll("[data-stage]").forEach(b => b.onclick = () => open(b.dataset.stage));
}

export function smashStage(M, ctx, docs, key, back){
  const st = STAGES.find(s => s.key === key), can = ctx.canEdit("smash"), saved = notesFor(docs, key);
  let best = [...(saved?.best || st.best)], notes = saved?.notes || "", dirty = false;
  const sides = Math.min(Math.abs(st.bz[0]), st.bz[1]);
  M.innerHTML = `<div class="card"><div class="card-h"><button class="btn btn-line btn-sm" id="ssBack">← Smash playbook</button><span class="tag${st.tier === "Starter" ? " gold" : ""}">${st.tier}</span></div>
      <h2>${esc(st.name)}</h2>
      <div class="ss-pic" style="aspect-ratio:auto;padding:8px">${stageSVG(st, {big:true})}</div>
      <p class="muted" style="margin:0">Dashed red box = blast zones (cross it and you lose a stock). Platforms show the layout${st.plats.some(p => p[3] === "some") ? "; dashed platforms only appear some of the time" : ""}${st.moving ? "; arrows = the platform moves" : ""}.</p>
      <div class="ss-wrap"><table class="ss-tbl"><tbody>
        <tr><th>Top blast zone</th><td class="n">${fmt(st.bz[2])}</td></tr>
        <tr><th>Side blast zones</th><td class="n">${fmt(Math.abs(st.bz[0]))} left · ${fmt(st.bz[1])} right</td></tr>
        <tr><th>Bottom blast zone</th><td class="n">${fmt(Math.abs(st.bz[3]))}</td></tr>
        ${st.bzNote ? `<tr><th></th><td class="n muted">${esc(st.bzNote)}</td></tr>` : ""}
        <tr><th>Stage width (ledge to ledge)</th><td class="n">${width(st) ? fmt(width(st)) : "Not published"}</td></tr>
        <tr><th>Platforms</th><td class="n">${esc(st.platText)}</td></tr>
        <tr><th>Walls under the ledges</th><td class="n">${st.walls ? "Yes (walls to tech and wall-jump off)" : "No"}</td></tr>
      </tbody></table></div></div>
    <div class="card"><h4>Best for</h4><div class="ss-types" id="ssTypes">${TYPES.map(([k, t, e]) => can ? `<button type="button" class="ss-type" data-type="${k}" aria-pressed="${best.includes(k)}">${e} ${t}</button>` : (best.includes(k) ? `<span class="ss-type" aria-pressed="true">${e} ${t}</span>` : "")).join("")}</div>
      <h4 style="margin-top:6px">Notes</h4>${can ? `<textarea id="ssNotes" rows="5" placeholder="Who on our team likes this stage, what to watch for, ledge and platform tricks…">${esc(notes)}</textarea><div><button class="btn btn-gold" id="ssSave">Save</button></div>` : `<p style="margin:0;white-space:pre-wrap">${esc(notes) || '<span class="muted">No notes yet.</span>'}</p>`}
      ${saved?.updatedBy ? `<p class="muted" style="margin:0">Last updated by ${esc(String(saved.updatedBy).split("@")[0])}</p>` : ""}</div>`;
  M.querySelector("#ssBack").onclick = () => { if (dirty && !confirm("Leave without saving?")) return; back(); };
  if (!can) return;
  M.querySelectorAll("[data-type]").forEach(b => b.onclick = () => { const k = b.dataset.type; best = best.includes(k) ? best.filter(x => x !== k) : [...best, k]; b.setAttribute("aria-pressed", String(best.includes(k))); dirty = true; });
  M.querySelector("#ssNotes").oninput = e => { notes = e.target.value; dirty = true; };
  M.querySelector("#ssSave").onclick = async () => {
    const now = new Date().toISOString();
    try { await ctx.db.savePlay("smash-stage-" + key, {game:"smash", kind:"stage", stage:key, title:st.name, best, notes:notes.slice(0, 4000), updatedAt:now, updatedBy:ctx.user.email, createdAt:saved?.createdAt || now, createdBy:saved?.createdBy || ctx.user.email});
      dirty = false; ctx.toast("Saved."); }
    catch(e){ console.error(e); ctx.toast(/permission/i.test(e.code || e.message || "") ? "Not saved: publish the updated Firebase rules first." : "Couldn't save. Check the connection."); }
  };
}
