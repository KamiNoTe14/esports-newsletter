/* Digit matcher for game scoreboards. Tesseract reads names well but misreads lone digits in condensed game fonts
   (7 as 1, 6 as nothing), so numbers are read here instead: each digit is cut out and compared with how that game
   draws 0–9 (templates learned from real scoreboard screenshots, stored in LAYOUTS as TEMPLATES).
   Works on plain RGBA pixel data ({data, width, height}), so the same code runs in OBS and in the test scripts. */
export const GW = 8, GH = 12;   // each digit is shrunk to an 8 x 12 grid of "how much ink"

/* The box's text as a 0..1 ink map: brighter than the box's border (the background) = ink. Enlarged 3x so touching
   digits separate. */
function inkMap(img, S = 3){
  const {data, width:w, height:h} = img, lum = i => data[i * 4] * .3 + data[i * 4 + 1] * .59 + data[i * 4 + 2] * .11;
  const edge = []; for (let x = 0; x < w; x++){ edge.push(lum(x), lum((h - 1) * w + x)); } for (let y = 0; y < h; y++){ edge.push(lum(y * w), lum(y * w + w - 1)); }
  edge.sort((a, b) => a - b); const bg = edge[edge.length >> 1];
  const d = new Float32Array(w * h); let max = 0;
  for (let i = 0; i < w * h; i++){ const v = Math.max(0, lum(i) - bg); d[i] = v; if (v > max) max = v; }
  if (max < 30) return null;   // nothing brighter than the background: an empty box
  const W = w * S, H = h * S, out = new Uint8Array(W * H), thr = max * .45;
  for (let Y = 0; Y < H; Y++){ const fy = Math.min(h - 1, Math.max(0, (Y + .5) / S - .5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let X = 0; X < W; X++){ const fx = Math.min(w - 1, Math.max(0, (X + .5) / S - .5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      const v = (d[y0 * w + x0] * (1 - tx) + d[y0 * w + x1] * tx) * (1 - ty) + (d[y1 * w + x0] * (1 - tx) + d[y1 * w + x1] * tx) * ty;
      out[Y * W + X] = v > thr ? 1 : 0; } }
  return {m:out, W, H};
}
/* Cut the ink into characters (columns with no ink between them), drop small marks (commas, dots). */
export function glyphs(img){
  const im = inkMap(img); if (!im) return [];
  const {m, W, H} = im, col = x => { let n = 0; for (let y = 0; y < H; y++) n += m[y * W + x]; return n; };
  const spans = []; let st = -1;
  for (let x = 0; x <= W; x++){ const on = x < W && col(x) > 0; if (on && st < 0) st = x; if (!on && st >= 0){ spans.push([st, x - 1]); st = -1; } }
  const gs = spans.map(([a, b]) => { let t = H, btm = -1; for (let y = 0; y < H; y++) for (let x = a; x <= b; x++) if (m[y * W + x]){ if (y < t) t = y; if (y > btm) btm = y; }
    return {a, b, t, btm, h:btm - t + 1, w:b - a + 1}; }).filter(g => g.btm >= 0);
  if (!gs.length) return [];
  const tall = Math.max(...gs.map(g => g.h));
  return gs.filter(g => g.h >= tall * .6).map(g => {
    const v = new Float32Array(GW * GH + 1);
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++){
      const y0 = g.t + gy * g.h / GH, y1 = g.t + (gy + 1) * g.h / GH, x0 = g.a + gx * g.w / GW, x1 = g.a + (gx + 1) * g.w / GW;
      let s = 0, n = 0; for (let y = Math.floor(y0); y < Math.ceil(y1); y++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++){ s += m[y * W + x]; n++; }
      v[gy * GW + gx] = n ? s / n : 0; }
    v[GW * GH] = Math.min(1.5, g.w / g.h) * 2;   // how wide it is (a 1 is narrow), counted as a couple of cells
    return v; });
}
/* Nearest template for each character. templates: {"0":[…], …}. A character that isn't close to any digit (like %)
   comes back as "?". */
export function readDigits(img, templates, {dropLast = false} = {}){
  let gs = glyphs(img); if (dropLast && gs.length > 1) gs = gs.slice(0, -1);
  if (!gs.length) return null;
  let s = "";
  for (const v of gs){ let best = "?", bd = Infinity;
    for (const [d, t] of Object.entries(templates)){ let e = 0; for (let i = 0; i < v.length; i++){ const k = v[i] - t[i]; e += k * k; } if (e < bd){ bd = e; best = d; } }
    s += bd < 14 ? best : "?"; }
  return s;
}
/* Average many examples of each digit into a template (used by the calibration script). */
export function learn(samples){   // [[img, "14154"], …]
  const acc = {}, n = {};
  for (const [img, truth] of samples){ const gs = glyphs(img), digits = String(truth).replace(/[^0-9]/g, "");
    if (gs.length !== digits.length) continue;
    gs.forEach((v, i) => { const d = digits[i]; acc[d] = acc[d] || new Float32Array(v.length); n[d] = (n[d] || 0) + 1; for (let k = 0; k < v.length; k++) acc[d][k] += v[k]; }); }
  const out = {}; for (const d of Object.keys(acc)) out[d] = Array.from(acc[d], x => Math.round(x / n[d] * 100) / 100);
  return out;
}
