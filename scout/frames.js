/* Smash Ultimate character sheets from frame data.
   Data: Ultimate Frame Data (ultimateframedata.com), copied once by the coaches and imported here; it lives only in
   the private score database (framedata/{slug}), never in the public website files. Every sheet links back to UFD.
   What the sheet works out:
     fastest moves        their quickest hits (startup)
     out of shield        how fast they can hit back after blocking (their best OOS option, from UFD)
     punish these         their moves that are worst on shield (block it, then hit back)
     respect these        their moves that are safest on shield (pressure that's hard to punish)
     matchup (pick ours)  which of OUR moves they can't punish out of shield, and which of THEIR moves our own
                          out-of-shield options can punish
   Frame data is a guide: spacing, shield pushback and platforms change what's really punishable. */

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const CATS = {jabattacks:"Jabs", groundattacks:"Ground", tiltattacks:"Tilts", dashattacks:"Dash", crouchingattacks:"Crouching", inputattacks:"Inputs", smashattacks:"Smash attacks", aerialattacks:"Aerials", specialattacks:"Specials", grabs:"Grabs and throws", dodges:"Dodges and rolls"};
const ATTACK = m => m.cat !== "dodges" && m.cat !== "grabs" && !/pummel|throw/i.test(m.name);
/* a move's own first hit (UFD lists later hits too, e.g. "16 (1/6/11/16)"), and moves that start an attack:
   not follow-up jabs or hits, counters, reflectors, landing hits or self-hits */
const first = s => { const m = String(s || "").match(/(\d+)\s*(?:\(\+(\d+)\))?/); return m ? +m[1] + (+m[2] || 0) : null; };   // "2(+18)": 18 frames to charge, then 2
const opener = m => !/jab\s*[2-9]|finisher|hit\s*[2-9]|counter|reflect|absorb|guard|tetrakarn|makarakarn|self-hit|reel in|explosion|landing|\brest\b|spinout/i.test(m.name)
  && !/start of (counter|block)|counter window/i.test(m.startup + " " + m.notes);
const frames = s => { const m = String(s || "").match(/\d+/); return m ? +m[0] : null; };
export const ufdURL = slug => `https://ultimateframedata.com/${slug}`;
const statOf = (c, re) => (c.stats || []).find(s => re.test(s.k))?.v || "";

/* fastest way to hit back after blocking: their listed OOS options and shield grab */
export function oosOf(c){
  /* counters, reflectors and absorbs aren't punishes; skip rows that are only those */
  const notHit = m => m.split(/\s+or\s+/i).every(x => /counter|reflect|absorb|vortex/i.test(x));
  /* Jigglypuff's fastest listed option is Rest out of shield: a hard read, not a reliable punish */
  const list = (c.oos || []).filter(o => !notHit(o.move) && !(c.slug === "jigglypuff" && /^down b/i.test(o.move))).map(o => ({move:o.move, f:frames(o.frames)})).filter(o => o.f != null);
  const sg = frames(statOf(c, /^Shield Grab/i)); if (sg) list.push({move:"Shield grab", f:sg});
  return list.sort((a, b) => a.f - b.f);
}
const advTxt = m => { const a = String(m.advantage || "").replace(/\*\*\/?/g, "").trim(); return a ? a.replace(/-/g, "−") : "–"; };
const fmtAdv = n => n == null ? "–" : n > 0 ? `+${n}` : `−${Math.abs(n)}`;

export function framesCSS(){ return `
.fd-tabs{display:flex;gap:6px;flex-wrap:wrap}
.fd-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.fd-ch{border:1px solid var(--line);border-radius:10px;background:#fff;padding:8px 6px;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12.5px;font-weight:600;text-align:center;color:var(--ink);line-height:1.2}
.fd-ch:hover{border-color:var(--gold)}.fd-ch img{width:44px;height:44px;object-fit:contain}
.fd-ch.opp{border-color:#B3261E;box-shadow:inset 0 0 0 1px #B3261E}
.fd-head{display:flex;gap:14px;align-items:center}.fd-head img{width:64px;height:64px;object-fit:contain}
.fd-stats{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13.5px;color:var(--muted)}.fd-stats b{color:var(--ink)}
.fd-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.fd-list{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.fd-list li{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--line);padding:5px 2px;font-size:14px}
.fd-list li span{min-width:0}.fd-list li b{white-space:nowrap;font-variant-numeric:tabular-nums}
.fd-list small{display:block;color:var(--muted);font-size:12px}
.fd-bad{color:#B3261E}.fd-ok{color:#1E7A45}
.fd-call{border-radius:8px;padding:10px 14px;background:#FFF4D1;border:1px solid #F0D98A;font-size:14px}
.fd-tbl{width:100%;border-collapse:collapse;font-size:13px}.fd-tbl th,.fd-tbl td{padding:6px 7px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.fd-tbl th{font:700 11px var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);position:sticky;top:0;background:#fff}
.fd-tbl td.n{font-variant-numeric:tabular-nums;white-space:nowrap}
.fd-wrap{overflow-x:auto;max-height:70vh}
.fd-search{min-height:42px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--field);font:inherit;width:100%;max-width:360px}
`; }

/* ---------- character list ---------- */
export function charList(M, ctx, index, {opp = [], icon, onOpen, onImport}){
  const can = ctx.isCoach();
  if (!index){ M.innerHTML = `<div class="card"><p class="muted">Loading characters…</p></div>`; return; }
  const chars = index.chars || [];
  M.innerHTML = `${ctx.tabs}
    <div class="card"><div class="card-h"><h2>Characters</h2>${can ? `<label class="btn btn-line btn-sm" style="cursor:pointer">${chars.length ? "Re-import" : "Import"} frame data<input type="file" id="fdImport" accept=".json,application/json" hidden></label>` : ""}</div>
      ${chars.length ? `<p class="intro">Pick a character for their fastest moves, how they hit back out of shield, what to punish and what to respect. Pick one of ours on their sheet to see the matchup.</p>
        <input class="fd-search" id="fdQ" placeholder="Find a character" autocomplete="off">` : `<p class="intro">No frame data yet.${can ? " Import the frame data file (made from Ultimate Frame Data) with the button above." : " A coach needs to import it."}</p>`}
      ${opp.length ? `<div><h4 style="margin-bottom:6px">Up next: their characters</h4><div class="fd-grid">${opp.map(s => { const c = chars.find(x => x.slug === s); return c ? `<button type="button" class="fd-ch opp" data-ch="${c.slug}">${icon(c) ? `<img src="${esc(icon(c))}" alt="" loading="lazy">` : ""}${esc(c.name)}</button>` : ""; }).join("")}</div></div>` : ""}
      <div class="fd-grid" id="fdAll">${chars.map(c => `<button type="button" class="fd-ch" data-ch="${c.slug}" data-n="${esc(c.name.toLowerCase())}">${icon(c) ? `<img src="${esc(icon(c))}" alt="" loading="lazy" onerror="this.remove()">` : ""}${esc(c.name)}</button>`).join("")}</div>
      ${chars.length ? `<p class="muted" style="margin:0">Frame data: <a href="https://ultimateframedata.com/" target="_blank" rel="noopener">Ultimate Frame Data</a>${index.copied ? `, copied ${esc(index.copied)}` : ""}. Private to the team.</p>` : ""}</div>`;
  M.querySelectorAll("[data-ch]").forEach(b => b.onclick = () => onOpen(b.dataset.ch));
  const q = M.querySelector("#fdQ"); if (q) q.oninput = () => { const v = q.value.trim().toLowerCase(); M.querySelectorAll("#fdAll [data-ch]").forEach(b => b.hidden = !!v && !b.dataset.n.includes(v)); };
  const f = M.querySelector("#fdImport"); if (f) f.onchange = async () => { const file = f.files[0]; f.value = ""; if (file) onImport(file); };
}

/* ---------- one character's sheet (+ matchup against one of ours) ---------- */
export function charSheet(M, ctx, c, {ours = null, ourChoices = [], icon, onVs, back, style = null, types = [], onStyle = null}){
  const atk = (c.moves || []).filter(ATTACK);
  const oos = oosOf(c), oosFast = oos[0]?.f ?? null;
  const fastest = atk.filter(opener).map(m => ({...m, s:first(m.startup)})).filter(m => m.s > 0).sort((a, b) => a.s - b.s).slice(0, 8);
  const unsafe = atk.filter(m => m.advWorst != null).sort((a, b) => a.advWorst - b.advWorst).slice(0, 8);
  const safe = atk.filter(m => m.advBest != null).sort((a, b) => b.advBest - a.advBest).slice(0, 8);
  const grab = (c.moves || []).find(m => /^grab$/i.test(m.name));
  const item = (m, right, sub) => `<li><span>${esc(m.name)}${sub ? `<small>${esc(sub)}</small>` : ""}</span><b>${right}</b></li>`;
  /* matchup */
  let vs = "";
  if (ours){
    const oursAtk = (ours.moves || []).filter(ATTACK), ourOos = oosOf(ours), ourFast = ourOos[0];
    const safeForUs = oosFast == null ? [] : oursAtk.filter(m => m.advBest != null && -m.advBest < oosFast).sort((a, b) => b.advBest - a.advBest).slice(0, 8);
    const weCanPunish = !ourFast ? [] : atk.filter(m => m.advWorst != null && -m.advWorst >= ourFast.f).sort((a, b) => a.advWorst - b.advWorst).slice(0, 8);
    vs = `<div class="card"><div class="card-h"><h2>${esc(ours.name)} vs ${esc(c.name)}</h2></div>
      <div class="fd-call">${oosFast != null ? `${esc(c.name)} hits back out of shield on <b>frame ${oosFast}</b> (${esc(oos[0].move)}). Our moves that leave us <b>${oosFast} or more frames</b> behind on shield can be punished.` : "No out-of-shield data for them."}
        ${ourFast ? ` Our fastest out-of-shield option is <b>${esc(ourFast.move)}, frame ${ourFast.f}</b>.` : ""}</div>
      <div class="fd-cols">
        <div><h4>Our pressure they can't punish</h4><ul class="fd-list">${safeForUs.length ? safeForUs.map(m => item(m, `<span class="fd-ok">${fmtAdv(m.advBest)}</span>`, `starts frame ${first(m.startup) ?? "?"}`)).join("") : `<li><span class="muted">Nothing is fully safe; space your attacks.</span></li>`}</ul></div>
        <div><h4>Their moves we can punish out of shield</h4><ul class="fd-list">${weCanPunish.length ? weCanPunish.map(m => item(m, `<span class="fd-bad">${fmtAdv(m.advWorst)}</span>`, `block it, then ${ourFast.move}`)).join("") : `<li><span class="muted">None of their moves are slow enough for our fastest out-of-shield option.</span></li>`}</ul></div>
      </div>
      <p class="muted" style="margin:0">On-shield numbers assume the attack hits shield up close. Spacing, shield pushback and platforms change what really works.</p></div>`;
  }
  const byCat = {}; (c.moves || []).forEach(m => (byCat[m.cat] = byCat[m.cat] || []).push(m));
  M.innerHTML = `${ctx.tabs}
    <div class="card"><div class="card-h"><button class="btn btn-line btn-sm" id="fdBack">← Characters</button><a class="btn btn-line btn-sm" href="${ufdURL(c.slug)}" target="_blank" rel="noopener">Hitboxes on Ultimate Frame Data ↗</a></div>
      <div class="fd-head">${icon(c) ? `<img src="${esc(icon(c))}" alt="">` : ""}<div><h2>${esc(c.name)}</h2>
        <div class="fd-stats"><span>Weight <b>${esc(statOf(c, /^Weight/))}</b></span><span>Run <b>${esc(statOf(c, /^Run Speed/))}</b></span><span>Air <b>${esc(statOf(c, /^Air Speed/))}</b></span><span>Fall / fast fall <b>${esc(statOf(c, /^Fall Speed/))}</b></span>${grab ? `<span>Grab <b>frame ${esc(grab.startup)}</b></span>` : ""}</div>
        ${style ? `<div class="fd-stats" style="margin-top:6px;align-items:center"><span>Plays like</span>${types.map(([k, n, e]) => onStyle ? `<button type="button" class="ss-type" data-sty="${k}" aria-pressed="${style.includes(k)}">${e} ${n}</button>` : style.includes(k) ? `<span class="ss-type">${e} ${n}</span>` : "").join("")}</div>` : ""}</div></div>
      ${ourChoices.length ? `<label class="f" style="max-width:360px"><span>Matchup: pick our character</span><select id="fdVs"><option value="">Just show ${esc(c.name)}</option>${ourChoices.map(o => `<option value="${esc(o.slug)}"${ours?.slug === o.slug ? " selected" : ""}>${esc(o.label)}</option>`).join("")}</select></label>` : ""}</div>
    ${vs}
    <div class="card"><div class="fd-cols">
      <div><h4>Fastest moves</h4><ul class="fd-list">${fastest.map(m => item(m, `frame ${m.s}`, m.advantage ? `${advTxt(m)} on shield` : "")).join("")}</ul></div>
      <div><h4>Out of shield</h4><ul class="fd-list">${oos.map(o => `<li><span>${esc(o.move)}</span><b>frame ${o.f}</b></li>`).join("") || `<li><span class="muted">No data</span></li>`}</ul>
        <p class="muted" style="margin:6px 0 0">Anything that leaves you ${oosFast ?? "?"}+ frames behind on their shield can be punished.</p></div>
      <div><h4>Punish these</h4><ul class="fd-list">${unsafe.map(m => item(m, `<span class="fd-bad">${fmtAdv(m.advWorst)}</span>`, "shield it, then punish")).join("")}</ul></div>
      <div><h4>Respect these</h4><ul class="fd-list">${safe.map(m => item(m, `<span class="${m.advBest > -5 ? "fd-ok" : ""}">${fmtAdv(m.advBest)}</span>`, "safest on shield")).join("")}</ul></div>
    </div></div>
    <div class="card"><h4>All frame data</h4><div class="fd-wrap"><table class="fd-tbl"><thead><tr><th>Move</th><th>Startup</th><th>Total</th><th>Landing lag</th><th>On shield</th><th>Active</th><th>Damage</th><th>Notes</th></tr></thead><tbody>
      ${Object.entries(byCat).map(([cat, list]) => `<tr><th colspan="8" style="position:static;background:#F5F8FB">${esc(CATS[cat] || cat)}</th></tr>${list.map(m => `<tr><td><b>${esc(m.name)}</b>${m.whichhitbox ? `<small class="muted" style="display:block">${esc(m.whichhitbox)}</small>` : ""}</td><td class="n">${esc(m.startup || "–")}</td><td class="n">${esc(m.totalframes || "–")}</td><td class="n">${esc(m.landinglag || "–")}</td><td class="n">${esc(advTxt(m))}</td><td class="n">${esc(m.activeframes || "–")}</td><td class="n">${esc(m.basedamage || "–")}</td><td>${esc(m.notes || "")}</td></tr>`).join("")}`).join("")}
    </tbody></table></div>
    <p class="muted" style="margin:0">Frame data: <a href="${ufdURL(c.slug)}" target="_blank" rel="noopener">Ultimate Frame Data, ${esc(c.name)}</a>.</p></div>`;
  M.querySelector("#fdBack").onclick = back;
  M.querySelectorAll("[data-sty]").forEach(b => b.onclick = () => { const k = b.dataset.sty; onStyle(style.includes(k) ? style.filter(x => x !== k) : [...style, k]); });
  const v = M.querySelector("#fdVs"); if (v) v.onchange = () => onVs(v.value);
}

/* shared with the scouting report suggestions (suggest.js) */
export {ATTACK, opener, first, fmtAdv, statOf};
/* one character, boiled down: fastest openers, out-of-shield speed, worst and safest on shield */
export function sumUp(c){
  const atk = (c.moves || []).filter(ATTACK), oos = oosOf(c);
  return {atk, oos, oosFast:oos[0]?.f ?? null,
    fastest:atk.filter(opener).map(m => ({...m, s:first(m.startup)})).filter(m => m.s > 0).sort((a, b) => a.s - b.s),
    unsafe:atk.filter(m => m.advWorst != null).sort((a, b) => a.advWorst - b.advWorst),
    safe:atk.filter(m => m.advBest != null).sort((a, b) => b.advBest - a.advBest)};
}
/* how one of ours lines up against one of theirs, on frame data alone:
   punish = share of their moves (with shield data) our fastest out-of-shield option can punish
   safe   = share of our moves (with shield data) they can't punish out of shield */
export function frameEdge(ours, theirs){
  const O = sumUp(ours), T = sumUp(theirs);
  const theirAdv = T.atk.filter(m => m.advWorst != null), ourAdv = O.atk.filter(m => m.advBest != null);
  const punish = O.oosFast == null ? [] : theirAdv.filter(m => -m.advWorst >= O.oosFast);
  const safe = T.oosFast == null ? [] : ourAdv.filter(m => -m.advBest < T.oosFast);
  const pp = theirAdv.length ? punish.length / theirAdv.length : 0, sp = ourAdv.length ? safe.length / ourAdv.length : 0;
  return {score:(pp + sp) / 2, punish, safe, punishN:theirAdv.length, safeN:ourAdv.length, ourOos:O.oos[0], theirOos:T.oos[0]};
}
