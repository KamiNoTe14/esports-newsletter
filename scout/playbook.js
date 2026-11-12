/* Rocket League playbook: a top-down whiteboard in the scouting tool.
   Two kinds of play, both saved in the score database (plays/{id}), private to the team like scouting reports:
     drawn  coaches and captains drag the cars and the ball into place step by step (like a basketball whiteboard),
            draw arrows on top, add a note per step, then press Play to watch it run.
     film   real positions taken from a replay file (a goal against, a missed rotation) with timed captions and
            "should be here" markers. Imported from a .json file made from the replays.
   Field coordinates are Rocket League's own (x across the field +-4096, y along it +-5120; Hartland's goal at y=-5120),
   drawn sideways with our goal on the left. */

const BIG = [[3584, 0], [-3584, 0], [3072, 4096], [-3072, 4096], [3072, -4096], [-3072, -4096]];
const SMALL = [[0, -4240], [-1792, -4184], [1792, -4184], [-940, -3308], [940, -3308], [0, -2816], [-3584, -2484], [3584, -2484], [-1788, -2300], [1788, -2300],
  [-2048, -1036], [0, -1024], [2048, -1036], [-1024, 0], [1024, 0], [-2048, 1036], [0, 1024], [2048, 1036], [-1788, 2300], [1788, 2300], [-3584, 2484], [3584, 2484],
  [0, 2816], [-940, 3310], [940, 3308], [-1792, 4184], [1792, 4184], [0, 4240]];
export const PIECES = ["b1", "b2", "b3", "o1", "o2", "o3", "ball"];
export const KICKOFF = {b1:[-2048, -2560], b2:[2048, -2560], b3:[0, -4608], o1:[2048, 2560], o2:[-2048, 2560], o3:[0, 4608], ball:[0, 0]};
const BLUE = "#1F6FEB", ORANGE = "#F47B20";
const DURS = [0.5, 1, 1.5, 2, 3, 4];
const PEN = ["#FFFFFF", "#FFBC05", "#FF4D4D"];

/* RL (x, y) -> drawing (sx, sy): along the field left to right, our goal on the left */
const S = ([x, y]) => [y, -x];
const R = (sx, sy) => [-sy, sx];
const clamp = p => [Math.max(-4000, Math.min(4000, p[0])), Math.max(-5900, Math.min(5900, p[1]))];
const ease = f => f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];

function fieldSVG(){
  const oct = [[-4096, -3968], [-2944, -5120], [2944, -5120], [4096, -3968], [4096, 3968], [2944, 5120], [-2944, 5120], [-4096, 3968]].map(p => S(p).join(",")).join(" ");
  const pad = (p, r, cls) => { const [sx, sy] = S(p); return `<circle class="${cls}" cx="${sx}" cy="${sy}" r="${r}"/>`; };
  return `<defs>
      <marker id="pbArrW" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#FFFFFF"/></marker>
      <marker id="pbArrY" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#FFBC05"/></marker>
      <marker id="pbArrR" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#FF4D4D"/></marker>
      <marker id="pbArrB" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${BLUE}"/></marker>
      <marker id="pbArrO" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${ORANGE}"/></marker>
      <marker id="pbArrK" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#E8EEF5"/></marker>
    </defs>
    <rect class="pb-goal b" x="-6000" y="-893" width="880" height="1786"/><rect class="pb-goal o" x="5120" y="-893" width="880" height="1786"/>
    <polygon class="pb-turf" points="${oct}"/>
    <line class="pb-ln" x1="0" y1="-4096" x2="0" y2="4096"/><circle class="pb-ln" cx="0" cy="0" r="1000"/>
    <line class="pb-ln goal b" x1="-5120" y1="-893" x2="-5120" y2="893"/><line class="pb-ln goal o" x1="5120" y1="-893" x2="5120" y2="893"/>
    ${SMALL.map(p => pad(p, 95, "pb-pad")).join("")}${BIG.map(p => pad(p, 210, "pb-pad big")).join("")}`;
}
/* a car: a rounded box pointing where it's heading, with its number and name */
function pieceSVG(k, label){
  if (k === "ball") return `<g class="pb-pc ball" data-k="ball"><circle class="pb-shadow" r="190"/><circle class="pb-ball" r="190"/></g>`;
  const team = k[0] === "b" ? "b" : "o";
  return `<g class="pb-pc ${team}" data-k="${k}"><g class="pb-body"><rect x="-260" y="-165" width="520" height="330" rx="90"/><path d="M150,-95 L260,0 L150,95 z" class="pb-nose"/></g>
    <text class="pb-num" y="100">${k[1]}</text><text class="pb-lbl" y="590">${esc(label || "")}</text><rect class="pb-boost" x="-260" y="215" width="520" height="70" rx="28"/><rect class="pb-boostfill" x="-260" y="215" width="0" height="70" rx="28"/></g>`;
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- a board: draws one play, plays it back, and (when editable) lets you move things ---------- */
export function board(host, play, {editable = false, onChange = () => {}} = {}){
  const film = play.kind === "film";
  host.innerHTML = `<div class="pb-wrap"><svg class="pb-svg" viewBox="-6100 -4300 12200 8600" role="img" aria-label="Rocket League field">${fieldSVG()}
      <g class="pb-ghosts"></g><g class="pb-paths"></g><g class="pb-marks"></g><g class="pb-trails"></g><g class="pb-ink"></g>
      <g class="pb-pcs">${PIECES.map(k => pieceSVG(k, film ? "" : play.labels?.[k])).join("")}</g></svg>
    <div class="pb-cap" aria-live="polite"></div></div>`;
  const svg = host.querySelector("svg"), cap = host.querySelector(".pb-cap");
  const els = Object.fromEntries(PIECES.map(k => [k, svg.querySelector(`[data-k="${k}"]`)]));
  const heading = {};
  let step = 0, playing = false, raf = 0, t = 0, speed = 1, pen = null, drawing = null, onTick = () => {};

  function place(pos, extra = {}){
    PIECES.forEach(k => {
      const el = els[k], p = pos[k];
      if (!p){ el.style.display = "none"; return; } el.style.display = "";
      const [sx, sy] = S(p), h = extra.head?.[k] ?? heading[k] ?? (k[0] === "o" ? 180 : 0);
      el.setAttribute("transform", `translate(${sx.toFixed(0)} ${sy.toFixed(0)})`);
      if (k === "ball"){ const z = extra.z || 0, r = 190 + Math.min(z, 2000) * .12;
        el.querySelector(".pb-ball").setAttribute("r", r.toFixed(0)); el.querySelector(".pb-ball").setAttribute("cy", (-Math.min(z, 2000) * .35).toFixed(0));
        el.querySelector(".pb-shadow").setAttribute("opacity", z > 150 ? .45 : 0); return; }
      el.querySelector(".pb-body").setAttribute("transform", `rotate(${h.toFixed(0)})`);
      const b = extra.boost?.[k], bar = el.querySelector(".pb-boostfill"), bg = el.querySelector(".pb-boost");
      if (b == null){ bar.style.display = bg.style.display = "none"; } else { bar.style.display = bg.style.display = ""; bar.setAttribute("width", (5.2 * Math.max(0, Math.min(100, b))).toFixed(0)); bar.classList.toggle("low", b < 25); }
    });
  }
  /* which way each car points: toward where it's going next */
  function headings(from, to){ PIECES.forEach(k => { if (k === "ball" || !from?.[k] || !to?.[k]) return; const a = S(from[k]), b = S(to[k]), dx = b[0] - a[0], dy = b[1] - a[1]; if (Math.hypot(dx, dy) > 60) heading[k] = Math.atan2(dy, dx) * 180 / Math.PI; }); }

  /* ---------- drawn plays ---------- */
  const steps = () => play.steps || (play.steps = [{dur:1, note:"", pos:structuredClone(KICKOFF), ink:[]}]);
  function inkSVG(list, faded){ return (list || []).map(s => { const pts = []; for (let i = 0; i < s.p.length; i += 2) pts.push(S([s.p[i], s.p[i + 1]]).join(","));
    const m = s.c === "#FFBC05" ? "Y" : s.c === "#FF4D4D" ? "R" : "W";
    return `<polyline points="${pts.join(" ")}" stroke="${s.c}" class="pb-stroke${faded ? " faded" : ""}" marker-end="url(#pbArr${m})"/>`; }).join(""); }
  function showStep(i){
    const st = steps(), cur = st[i], prev = st[i - 1];
    step = i; headings(prev?.pos, cur.pos); if (!prev && st[1]) headings(cur.pos, st[1].pos);
    place(cur.pos);
    svg.querySelector(".pb-ghosts").innerHTML = prev ? PIECES.map(k => prev.pos[k] ? `<circle class="pb-ghost ${k[0] === "b" ? "b" : k === "ball" ? "k" : "o"}" cx="${S(prev.pos[k])[0]}" cy="${S(prev.pos[k])[1]}" r="${k === "ball" ? 190 : 240}"/>` : "").join("") : "";
    svg.querySelector(".pb-paths").innerHTML = prev ? PIECES.map(k => { const a = prev.pos[k], b = cur.pos[k]; if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) < 120) return "";
      const [x1, y1] = S(a), [x2, y2] = S(b), m = k === "ball" ? "K" : k[0] === "b" ? "B" : "O";
      return `<line class="pb-path ${m}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#pbArr${m})"/>`; }).join("") : "";
    svg.querySelector(".pb-ink").innerHTML = inkSVG(cur.ink);
    cap.textContent = cur.note || ""; cap.hidden = !cur.note;
    onTick();
  }
  function drawnFrame(time){
    const st = steps(); let acc = 0;
    for (let i = 1; i < st.length; i++){
      const d = st[i].dur || 1;
      if (time <= acc + d){ const f = ease((time - acc) / d), pos = {};
        PIECES.forEach(k => { const a = st[i - 1].pos[k], b = st[i].pos[k]; pos[k] = a && b ? lerp(a, b, f) : b || a; });
        headings(st[i - 1].pos, st[i].pos); place(pos);
        svg.querySelector(".pb-ghosts").innerHTML = svg.querySelector(".pb-paths").innerHTML = "";
        svg.querySelector(".pb-ink").innerHTML = inkSVG(st[i].ink, true);
        const note = st[i].note || ""; cap.textContent = note; cap.hidden = !note; step = i; return false; }
      acc += d;
    }
    return true;
  }
  const drawnLength = () => steps().slice(1).reduce((a, s) => a + (s.dur || 1), 0);

  /* ---------- film: real positions ---------- */
  const F = play.frames || [], L = play.labels || {};
  const order = PIECES;   // each frame: p = [b1x,b1y, b2x,b2y, b3x,b3y, o1x,o1y, o2x,o2y, o3x,o3y, ballx,bally,ballz], b = boosts [6], null = not on the field
  const fpos = fr => { const pos = {}; order.forEach((k, i) => { const x = fr.p[i * 2], y = fr.p[i * 2 + 1]; if (x != null && y != null) pos[k] = [x, y]; }); return pos; };
  function filmFrame(time){
    if (!F.length) return true;
    const t0 = F[0].t, tt = t0 + time; let i = 1; while (i < F.length - 1 && F[i].t < tt) i++;
    const a = F[i - 1], b = F[i], f = Math.max(0, Math.min(1, (tt - a.t) / ((b.t - a.t) || 1)));
    const pa = fpos(a), pb = fpos(b), pos = {}, boost = {}, head = {};
    PIECES.forEach((k, j) => { if (pa[k] && pb[k]) pos[k] = lerp(pa[k], pb[k], f); else pos[k] = pb[k] || pa[k];
      if (k !== "ball"){ const ba = a.b?.[j], bb = b.b?.[j]; boost[k] = ba == null ? bb : bb == null ? ba : ba + (bb - ba) * f; } });
    const z = (a.p[14] || 0) + ((b.p[14] || 0) - (a.p[14] || 0)) * f;
    /* heading from where the car is going over the next ~0.3s */
    const ahead = F[Math.min(F.length - 1, i + 2)], pn = fpos(ahead);
    PIECES.forEach(k => { if (k === "ball" || !pos[k] || !pn[k]) return; const s1 = S(pos[k]), s2 = S(pn[k]); if (Math.hypot(s2[0] - s1[0], s2[1] - s1[1]) > 80) heading[k] = Math.atan2(s2[1] - s1[1], s2[0] - s1[0]) * 180 / Math.PI; });
    place(pos, {boost, z});
    /* the last 1.5 seconds as a fading trail */
    const tr = F.filter(x => x.t <= tt && x.t >= tt - 1.5);
    svg.querySelector(".pb-trails").innerHTML = PIECES.map((k, j) => { const pts = tr.map(x => x.p[j * 2] == null ? null : S([x.p[j * 2], x.p[j * 2 + 1]]).join(",")).filter(Boolean);
      return pts.length > 1 ? `<polyline class="pb-trail ${k === "ball" ? "k" : k[0]}" points="${pts.join(" ")}"/>` : ""; }).join("");
    const rel = tt - (play.goalAt ?? F[F.length - 1].t);
    const c = (play.captions || []).filter(x => rel >= x.t0 && rel <= x.t1).pop();
    cap.innerHTML = c ? esc(c.text) : ""; cap.hidden = !c;
    svg.querySelector(".pb-marks").innerHTML = (play.marks || []).filter(m => rel >= m.t0 && rel <= m.t1).map(m => { const [sx, sy] = S([m.x, m.y]);
      return `<g class="pb-mark" transform="translate(${sx} ${sy})"><circle r="330"/><text y="-420">${esc(m.label)}</text></g>`; }).join("");
    onTick(rel);
    return time >= filmLength();
  }
  const filmLength = () => F.length ? F[F.length - 1].t - F[0].t : 0;

  /* ---------- playback ---------- */
  const length = () => film ? filmLength() : drawnLength();
  function frame(time){ return film ? filmFrame(time) : drawnFrame(time); }
  let last = 0;
  function loop(now){
    if (!playing) return;
    t += (now - last) / 1000 * speed; last = now;
    if (frame(t)){ t = length(); playing = false; if (!film) showStep(steps().length - 1); onTick(); return; }
    raf = requestAnimationFrame(loop);
  }
  function play_(){ if (playing) return; if (t >= length() - .01) t = 0; playing = true; last = performance.now(); raf = requestAnimationFrame(loop); onTick(); }
  function pause(){ playing = false; cancelAnimationFrame(raf); onTick(); }

  /* ---------- editing: drag pieces, draw arrows ---------- */
  const pt = e => { const m = svg.getScreenCTM().inverse(), q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m); return R(q.x, q.y); };
  if (editable && !film){
    let drag = null;
    svg.addEventListener("pointerdown", e => {
      if (playing) return;
      const pc = e.target.closest(".pb-pc");
      if (pen){ e.preventDefault(); svg.setPointerCapture(e.pointerId); const p = clamp(pt(e)); drawing = {c:pen, p:[Math.round(p[0]), Math.round(p[1])]}; return; }
      if (!pc) return;
      e.preventDefault(); svg.setPointerCapture(e.pointerId); drag = pc.dataset.k; pc.classList.add("drag");
    });
    svg.addEventListener("pointermove", e => {
      if (drawing){ const p = clamp(pt(e)), n = drawing.p.length;
        if (Math.hypot(p[0] - drawing.p[n - 2], p[1] - drawing.p[n - 1]) > 90){ drawing.p.push(Math.round(p[0]), Math.round(p[1]));
          svg.querySelector(".pb-ink").innerHTML = inkSVG([...(steps()[step].ink || []), drawing]); } return; }
      if (!drag) return;
      const p = clamp(pt(e)); steps()[step].pos[drag] = [Math.round(p[0]), Math.round(p[1])]; showStep(step);
    });
    const up = () => {
      if (drawing){ if (drawing.p.length >= 4){ const s = steps()[step]; (s.ink = s.ink || []).push(drawing); onChange(); } drawing = null; showStep(step); return; }
      if (drag){ els[drag].classList.remove("drag"); drag = null; onChange(); }
    };
    svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  }

  if (film) filmFrame(0); else showStep(0);
  return {
    get step(){ return step; }, get playing(){ return playing; }, get time(){ return t; }, get length(){ return length(); },
    showStep(i){ pause(); t = steps().slice(1, i + 1).reduce((a, s) => a + (s.dur || 1), 0); showStep(i); },
    seek(time){ pause(); t = Math.max(0, Math.min(length(), time)); frame(t); },
    play: play_, pause, set speed(v){ speed = v; }, set pen(c){ pen = c; svg.classList.toggle("pen", !!c); },
    set onTick(f){ onTick = f; },
    relabel(){ PIECES.forEach(k => { if (k !== "ball") els[k].querySelector(".pb-lbl").textContent = play.labels?.[k] || ""; }); }
  };
}

/* ---------- the Playbook page (list + one play) ---------- */
export function playbookCSS(){ return `
.pb-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.pb-item{border:1px solid var(--line);border-radius:10px;background:#fff;padding:12px 14px;text-align:left;display:flex;flex-direction:column;gap:4px;color:var(--ink)}
.pb-item:hover{border-color:var(--gold)}.pb-item b{font-weight:700}.pb-item small{color:var(--muted)}
.pb-wrap{position:relative;border-radius:12px;overflow:hidden;background:#0B1F33}
.pb-svg{display:block;width:100%;height:auto;touch-action:none;user-select:none}
.pb-svg.pen{cursor:crosshair}
.pb-turf{fill:#1D4A35;stroke:#E8EEF5;stroke-width:40}
.pb-goal.b{fill:rgba(31,111,235,.55)}.pb-goal.o{fill:rgba(244,123,32,.55)}
.pb-ln{fill:none;stroke:rgba(232,238,245,.45);stroke-width:30}.pb-ln.goal{stroke-width:70}.pb-ln.goal.b{stroke:${BLUE}}.pb-ln.goal.o{stroke:${ORANGE}}
.pb-pad{fill:rgba(255,188,5,.45)}.pb-pad.big{fill:rgba(255,188,5,.75)}
.pb-pc{cursor:grab}.pb-pc.drag{cursor:grabbing}
.pb-pc .pb-body rect{stroke:#fff;stroke-width:34}.pb-pc.b .pb-body rect{fill:${BLUE}}.pb-pc.o .pb-body rect{fill:${ORANGE}}
.pb-nose{fill:rgba(255,255,255,.85)}
.pb-num{fill:#fff;font:700 290px var(--display);text-anchor:middle;pointer-events:none}
.pb-lbl{fill:#fff;font:600 300px var(--body);text-anchor:middle;paint-order:stroke;stroke:#0B1F33;stroke-width:60;pointer-events:none}
.pb-boost{fill:rgba(0,0,0,.55)}.pb-boostfill{fill:#FFBC05}.pb-boostfill.low{fill:#FF4D4D}
.pb-ball{fill:#F2F2F2;stroke:#222;stroke-width:30}.pb-shadow{fill:rgba(0,0,0,.5)}
.pb-ghost{fill:none;stroke-width:30;stroke-dasharray:60 50;opacity:.7}.pb-ghost.b{stroke:${BLUE}}.pb-ghost.o{stroke:${ORANGE}}.pb-ghost.k{stroke:#E8EEF5}
.pb-path{stroke-width:45;stroke-dasharray:110 70;opacity:.9}.pb-path.B{stroke:${BLUE}}.pb-path.O{stroke:${ORANGE}}.pb-path.K{stroke:#E8EEF5}
.pb-stroke{fill:none;stroke-width:60;stroke-linecap:round;stroke-linejoin:round}.pb-stroke.faded{opacity:.45}
.pb-trail{fill:none;stroke-width:40;opacity:.55;stroke-linecap:round}.pb-trail.b{stroke:#8FB8FF}.pb-trail.o{stroke:#FFC08F}.pb-trail.k{stroke:#fff}
.pb-mark circle{fill:rgba(255,188,5,.18);stroke:#FFBC05;stroke-width:45;stroke-dasharray:90 60;animation:pbPulse 1s ease-in-out infinite alternate}
.pb-mark text{fill:#FFBC05;font:700 260px var(--display);text-anchor:middle;paint-order:stroke;stroke:#0B1F33;stroke-width:70;letter-spacing:.02em}
@keyframes pbPulse{from{opacity:.65}to{opacity:1}}
.pb-cap{position:absolute;left:12px;right:12px;bottom:12px;background:rgba(11,31,51,.92);color:#fff;border-left:4px solid var(--gold);border-radius:8px;padding:8px 12px;font-size:15px;line-height:1.35}
@media (max-width:600px){.pb-cap{position:static;border-radius:0}}
.pb-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pb-steps{display:flex;flex-wrap:wrap;gap:6px}
.pb-steps button{min-width:40px;height:36px;border-radius:8px;border:1px solid var(--line);background:#fff;font-weight:700}
.pb-steps button[aria-current="true"]{background:var(--navy);border-color:var(--navy);color:#fff}
.pb-tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pb-swatch{width:30px;height:30px;border-radius:50%;border:2px solid var(--line)}.pb-swatch[aria-pressed="true"]{outline:3px solid var(--navy);outline-offset:2px}
.pb-scrub{flex:1;min-width:160px}
.pb-labels{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.pb-labels label{display:flex;align-items:center;gap:6px;font-size:13px}.pb-labels i{width:14px;height:14px;border-radius:4px;flex:none}
.pb-labels input{min-width:0;flex:1}
#pbSpeed,#pbDur{width:auto;flex:none}
.pb-key{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13.5px;font-weight:600}
.pb-key span{display:inline-flex;align-items:center;gap:6px}
.pb-key i{font-style:normal;width:22px;height:22px;border-radius:6px;display:grid;place-items:center;color:#fff;font:700 14px var(--display)}
.pb-key i.b{background:${BLUE}}.pb-key i.o{background:${ORANGE}}
.pb-time{font:700 15px var(--display);letter-spacing:.04em;min-width:64px;text-align:right}
`; }

/* ctx: {db, user, canEdit(game), esc, toast, game, back()} */
export function playbookList(M, ctx, plays, open){
  const film = plays.filter(p => p.kind === "film"), drawn = plays.filter(p => p.kind !== "film");
  const item = p => `<button type="button" class="pb-item" data-play="${esc(p.id)}"><b>${esc(p.title || "Untitled play")}</b><small>${p.kind === "film" ? `Film · ${esc(p.from || "")}` : `${(p.steps || []).length} step${(p.steps || []).length === 1 ? "" : "s"}`}${p.updatedBy ? ` · ${esc(String(p.updatedBy).split("@")[0])}` : ""}</small></button>`;
  const can = ctx.canEdit(ctx.game);
  M.innerHTML = `<div class="card"><div class="card-h"><h2>Rocket League playbook</h2>${can ? `<div class="pb-bar"><button class="btn btn-gold" id="pbNew">+ New play</button><label class="btn btn-line btn-sm" style="cursor:pointer">Import<input type="file" id="pbImport" accept=".json,application/json" hidden></label></div>` : ""}</div>
      <p class="intro">Draw up plays on a top-down field and press Play to watch them run, or watch real moments from our replays. ${can ? "Drag the cars and the ball into place, add steps, and draw arrows; everyone on the team can watch." : "Your coaches and captains make the plays; you can watch them here."}</p></div>
    <div class="card"><h4>From our film</h4>${film.length ? `<div class="pb-list">${film.map(item).join("")}</div>` : `<p class="muted">No film clips yet.${can ? " Import a clip file made from your replays." : ""}</p>`}</div>
    <div class="card"><h4>Plays</h4>${drawn.length ? `<div class="pb-list">${drawn.map(item).join("")}</div>` : `<p class="muted">No plays drawn yet.</p>`}</div>`;
  M.querySelectorAll("[data-play]").forEach(b => b.onclick = () => open(b.dataset.play));
  M.querySelector("#pbNew") && (M.querySelector("#pbNew").onclick = () => open(null));
  const imp = M.querySelector("#pbImport");
  if (imp) imp.onchange = async () => {
    try { const d = JSON.parse(await imp.files[0].text()), list = (d.plays || [d]).filter(p => p && (p.frames || p.steps));
      if (!list.length) throw new Error("no plays");
      for (const p of list){ await ctx.db.savePlay(ctx.db.newPlayId(), {...p, game:ctx.game, title:String(p.title || "Imported play").slice(0, 120), createdAt:new Date().toISOString(), createdBy:ctx.user.email, updatedAt:new Date().toISOString(), updatedBy:ctx.user.email}); }
      ctx.toast(`Imported ${list.length} play${list.length === 1 ? "" : "s"}.`);
    } catch(e){ console.error(e); ctx.toast("That file isn't a playbook file."); }
    imp.value = "";
  };
}

export function playbookView(M, ctx, saved, close){
  const can = ctx.canEdit(ctx.game), isNew = !saved;
  const play = saved ? structuredClone(saved) : {kind:"drawn", game:ctx.game, title:"", labels:{b1:"", b2:"", b3:"", o1:"", o2:"", o3:""}, steps:[{dur:1, note:"Kickoff", pos:structuredClone(KICKOFF), ink:[]}]};
  delete play.id;
  const film = play.kind === "film", edit = can && !film;
  let dirty = isNew, b;
  const timeTxt = s => `${s < 0 ? "−" : ""}${Math.abs(s).toFixed(1)}s`;
  M.innerHTML = `<div class="card"><div class="card-h"><div class="pb-bar"><button class="btn btn-line btn-sm" id="pbBack">← Playbook</button>${film ? `<span class="tag gold">Film</span>` : ""}</div>
        <div class="pb-bar">${edit ? `<button class="btn btn-gold btn-sm" id="pbSave">Save</button>` : ""}${can && !isNew ? `<button class="btn btn-line btn-sm danger" id="pbDel">Delete</button>` : ""}</div></div>
      ${edit ? `<label class="f"><span>Play name</span><input id="pbTitle" value="${esc(play.title)}" placeholder="Back-post rotation off a lost 50/50" maxlength="120"></label>` : `<h2>${esc(play.title || "Untitled play")}</h2>${play.from ? `<p class="muted" style="margin:0">${esc(play.from)}</p>` : ""}`}
      ${play.summary ? `<p class="intro">${esc(play.summary)}</p>` : ""}
      <div id="pbBoard"></div>
      <div class="pb-bar"><button class="btn btn-gold" id="pbPlay">▶ Play</button>
        <select id="pbSpeed" aria-label="Speed"><option value="0.25">¼ speed</option><option value="0.5"${film ? " selected" : ""}>½ speed</option><option value="1"${film ? "" : " selected"}>Normal</option></select>
        ${film ? `<input type="range" class="pb-scrub" id="pbScrub" min="0" max="1000" value="0" aria-label="Scrub"><span class="pb-time" id="pbTime"></span>` : `<div class="pb-steps" id="pbSteps"></div>`}</div>
      ${film ? `<div class="pb-key">${["b1", "b2", "b3", "o1", "o2", "o3"].map(k => `<span><i class="${k[0]}">${k[1]}</i>${esc(play.labels?.[k] || "")}</span>`).join("")}</div>` : ""}
      ${film ? `<p class="muted" style="margin:0">Blue = Hartland (our goal is on the left). The bar under each car is its boost (red = under 25). Dashed gold circles show where a player should have been.</p>` : ""}
      ${edit ? `<div class="grid" style="gap:10px">
          <div class="pb-tools"><b style="font-size:13px">This step:</b><input id="pbNote" placeholder="What happens in this step" style="flex:1;min-width:200px">
            <select id="pbDur" aria-label="How long this step takes">${DURS.map(d => `<option value="${d}">${d}s</option>`).join("")}</select></div>
          <div class="pb-tools"><button class="btn btn-line btn-sm" id="pbAdd">+ Add step</button><button class="btn btn-line btn-sm" id="pbRm">Remove step</button>
            <span class="muted" style="margin-left:6px">Draw:</span>${PEN.map(c => `<button type="button" class="pb-swatch" data-pen="${c}" style="background:${c}" aria-label="Pen" aria-pressed="false"></button>`).join("")}
            <button class="btn btn-line btn-sm" id="pbMove" aria-pressed="true">Move pieces</button><button class="btn btn-line btn-sm" id="pbClear">Clear drawing</button></div>
          <details><summary class="muted" style="cursor:pointer">Name the cars</summary><div class="pb-labels" style="margin-top:8px">${["b1", "b2", "b3", "o1", "o2", "o3"].map(k => `<label><i style="background:${k[0] === "b" ? BLUE : ORANGE}"></i>${k[0] === "b" ? "Blue" : "Orange"} ${k[1]}<input data-lbl="${k}" value="${esc(play.labels?.[k] || "")}" placeholder="${k[0] === "b" ? "Our player" : "Them"}"></label>`).join("")}</div></details>
          <p class="muted" style="margin:0">Drag the cars and the ball to where they are in this step. Add a step, move them again, and Play runs it. Faded outlines and arrows show where everything came from.</p></div>` : ""}
    </div>`;
  b = board(M.querySelector("#pbBoard"), play, {editable:edit, onChange:() => { dirty = true; }});
  const playBtn = M.querySelector("#pbPlay");
  const drawSteps = () => { const box = M.querySelector("#pbSteps"); if (!box) return;
    box.innerHTML = play.steps.map((s, i) => `<button type="button" data-st="${i}" aria-current="${i === b.step && !b.playing}">${i + 1}</button>`).join("");
    box.querySelectorAll("[data-st]").forEach(x => x.onclick = () => { b.showStep(+x.dataset.st); fillStep(); });
  };
  const fillStep = () => { if (!edit) { drawSteps(); return; } const s = play.steps[b.step]; M.querySelector("#pbNote").value = s.note || ""; M.querySelector("#pbDur").value = String(s.dur || 1); M.querySelector("#pbDur").disabled = b.step === 0; drawSteps(); };
  b.onTick = rel => {
    playBtn.textContent = b.playing ? "❚❚ Pause" : "▶ Play";
    if (film){ const s = M.querySelector("#pbScrub"); if (s && b.length) s.value = String(Math.round(b.time / b.length * 1000)); const tx = M.querySelector("#pbTime"); if (tx && rel != null) tx.textContent = rel <= 0 ? `${timeTxt(rel)} to goal` : "Goal"; }
    else if (!b.playing) drawSteps(); else { const box = M.querySelector("#pbSteps"); box && box.querySelectorAll("[data-st]").forEach(x => x.setAttribute("aria-current", String(+x.dataset.st === b.step))); }
  };
  playBtn.onclick = () => b.playing ? b.pause() : b.play();
  M.querySelector("#pbSpeed").onchange = e => { b.speed = +e.target.value; };
  b.speed = +M.querySelector("#pbSpeed").value;
  if (film){ const s = M.querySelector("#pbScrub"); s.oninput = () => b.seek(+s.value / 1000 * b.length); b.seek(0); }
  else fillStep();
  M.querySelector("#pbBack").onclick = () => { if (dirty && edit && !confirm("Leave without saving this play?")) return; b.pause(); close(); };
  if (edit){
    M.querySelector("#pbTitle").oninput = e => { play.title = e.target.value; dirty = true; };
    M.querySelector("#pbNote").oninput = e => { play.steps[b.step].note = e.target.value; dirty = true; b.showStep(b.step); };
    M.querySelector("#pbDur").onchange = e => { play.steps[b.step].dur = +e.target.value; dirty = true; };
    M.querySelector("#pbAdd").onclick = () => { const cur = play.steps[b.step]; play.steps.splice(b.step + 1, 0, {dur:1, note:"", pos:structuredClone(cur.pos), ink:[]}); dirty = true; b.showStep(b.step + 1); fillStep(); };
    M.querySelector("#pbRm").onclick = () => { if (play.steps.length < 2) return; play.steps.splice(b.step, 1); dirty = true; b.showStep(Math.max(0, b.step - 1)); fillStep(); };
    const setPen = c => { b.pen = c; M.querySelectorAll("[data-pen]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.pen === c))); M.querySelector("#pbMove").setAttribute("aria-pressed", String(!c)); };
    M.querySelectorAll("[data-pen]").forEach(x => x.onclick = () => setPen(x.dataset.pen));
    M.querySelector("#pbMove").onclick = () => setPen(null);
    M.querySelector("#pbClear").onclick = () => { play.steps[b.step].ink = []; dirty = true; b.showStep(b.step); };
    M.querySelectorAll("[data-lbl]").forEach(x => x.oninput = () => { play.labels = play.labels || {}; play.labels[x.dataset.lbl] = x.value.slice(0, 24); dirty = true; b.relabel(); });
    M.querySelector("#pbSave").onclick = async () => {
      if (!String(play.title || "").trim()){ M.querySelector("#pbTitle").focus(); ctx.toast("Give the play a name first."); return; }
      const now = new Date().toISOString(), id = saved?.id || ctx.db.newPlayId();
      const doc = {...play, game:ctx.game, kind:"drawn", title:play.title.trim().slice(0, 120), updatedAt:now, updatedBy:ctx.user.email, createdAt:saved?.createdAt || now, createdBy:saved?.createdBy || ctx.user.email};
      try { await ctx.db.savePlay(id, doc); dirty = false; saved = {...doc, id}; ctx.toast("Play saved."); }
      catch(e){ console.error(e); ctx.toast(/permission/i.test(e.code || e.message || "") ? "Not saved: the database isn't allowing plays yet. Publish the updated Firebase rules." : "Couldn't save. Check the connection."); }
    };
  }
  const del = M.querySelector("#pbDel");
  if (del) del.onclick = async () => { if (!confirm(`Delete "${saved.title || "this play"}"?`)) return; try { await ctx.db.removePlay(saved.id); b.pause(); close(); } catch(e){ ctx.toast("Couldn't delete it."); } };
  return () => b.pause();
}
