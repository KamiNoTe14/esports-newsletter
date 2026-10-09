/* Hartland Esports: renders every public page from data/site.json and data/issues.json */
(function(){
const BASE = document.currentScript.src.replace(/assets\/site\.js.*$/, "");
const PAGE = document.body.dataset.page || "home";
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const url = p => { p = String(p || "").trim(); if (!p) return ""; return /^(https?:)?\/\//i.test(p) ? p : BASE + p.replace(/^\/+/, ""); };
const safe = u => /^https?:\/\//i.test(String(u || "").trim()) ? String(u).trim() : "";
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_L = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function pd(v){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function longDate(v){ const d = pd(v); return d ? `${MONTHS_L[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : ""; }
function shortDate(v){ const d = pd(v); return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : ""; }
function fmtTime(v){ const m = /^(\d{1,2}):(\d{2})/.exec(v || ""); if (!m) return v || ""; let h = +m[1]; const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${m[2]} ${ap}`; }
function today(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
async function getJSON(p){ const r = await fetch(BASE + p + "?v=" + Date.now(), {cache:"no-store"}); if (!r.ok) throw new Error(p); return r.json(); }
const on = (site, key) => site.sections?.[key] !== false;

const NAV = [
  ["home", "", "Home"],
  ["teams", "teams.html", "Teams"],
  ["schedule", "schedule.html", "Schedule"],
  ["results", "results.html", "Results"],
  ["legacy", "legacy.html", "Legacy"],
  ["newsletters", "newsletters.html", "Newsletters"],
  ["media", "media.html", "Media"],
  ["about", "about.html", "About & Join"]
];
function hasMedia(site){ return (on(site, "gallery") && (site.gallery || []).length) || (on(site, "news") && (site.news || []).length); }

function header(site){
  const items = NAV.filter(([k]) => k !== "media" || hasMedia(site));
  return `<a class="skip" href="#main">Skip to content</a>
  <header class="site-h"><div class="wrap">
    <a class="brand" href="${BASE}"><img src="${BASE}assets/eagle.png" alt="" width="62" height="28"><b>Hartland <span>Esports</span></b></a>
    <button class="nav-btn" type="button" aria-expanded="false" aria-controls="nav">Menu</button>
    <nav class="nav" id="nav" aria-label="Main">${items.map(([k, h, t]) => `<a href="${BASE}${h}"${k === PAGE ? ' aria-current="page"' : ""}>${t}</a>`).join("")}</nav>
  </div></header>`;
}
function socials(site, cls){
  const L = site.links || {};
  const list = [["youtube","YouTube"],["twitch","Twitch"],["x","X / Twitter"],["instagram","Instagram"],["tiktok","TikTok"]].filter(([k]) => safe(L[k]));
  return list.length ? `<div class="${cls || "socials"}">${list.map(([k, t]) => `<a href="${esc(safe(L[k]))}" target="_blank" rel="noopener">${t}</a>`).join("")}</div>` : "";
}
function footer(site){
  const L = site.links || {}, P = site.program || {};
  const support = [["merch","Merch (Big Frog of Brighton)"],["jerseys","Jerseys (Guardian Proline)"],["fundraiser", L.fundraiserLabel ? `Fundraiser: ${L.fundraiserLabel}` : "Fundraiser"]].filter(([k]) => safe(L[k]));
  const more = [["league","MHSEL on RallyCry"],["athletics","Hartland Athletics"]].filter(([k]) => safe(L[k]));
  return `<footer class="site-f"><div class="wrap">
    <div class="f-grid">
      <div><h4>${esc(P.name || "Hartland Esports")}</h4><p class="muted" style="margin:0">${esc(P.school || "")}${P.lab ? `<br>${esc(P.lab)}` : ""}</p>${socials(site)}</div>
      <div><h4>Support the team</h4><ul>${support.map(([k, t]) => `<li><a href="${esc(safe(L[k]))}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join("") || "<li class='muted'>Coming soon</li>"}</ul></div>
      <div><h4>More</h4><ul>${more.map(([k, t]) => `<li><a href="${esc(safe(L[k]))}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join("")}<li><a href="${BASE}legacy.html">Record book, rivalries & alumni</a></li><li><a href="${BASE}future.html">Future Eagles (grades 6–8)</a></li><li><a href="${BASE}newsletters.html">Newsletter archive</a></li><li><a href="${BASE}feed.xml">RSS feed</a></li><li><a href="${BASE}schedule.html#subscribe">Add our calendar</a></li></ul></div>
    </div>
    <div class="f-base"><span>© ${new Date().getFullYear()} ${esc(P.name || "Hartland Esports")} · Go Eagles!</span><span><a href="${BASE}portal/">Coach portal</a> · <a href="${BASE}admin/">Site manager</a></span></div>
  </div></footer>`;
}
function secH(title, more){ return `<div class="sec-h"><h2>${title}</h2>${more || ""}</div>`; }
function pageH(eyebrow, title, lead, art){ return `<section class="page-h${art ? " has-art" : ""}"><div class="wrap">${art ? `<img class="page-art" src="${esc(url(art))}" alt="">` : ""}<p class="eyebrow">${eyebrow}</p><h1 style="font-size:clamp(40px,6vw,68px)">${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ""}</div></section>`; }

function latestIssue(issues){ return [...issues].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (+b.week) - (+a.week))[0]; }
function upcoming(issues){
  const t = today(), seen = new Set(), out = [];
  [...issues].sort((a, b) => (b.date || "").localeCompare(a.date || "")).forEach(is => (is.upcoming || []).forEach(m => {
    const d = pd(m.date); const k = `${m.date}|${m.team}|${m.opp}`;
    if (d && d >= t && !over(m) && !seen.has(k)){ seen.add(k); out.push(m); }
  }));
  return out.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
}
/* A match from a newsletter's "Coming up" list counts as over 2 hours after its start time (or at the end of its day if no time). */
function over(m){
  const d = pd(m.date); if (!d) return false;
  const tm = /^(\d{1,2}):(\d{2})/.exec(m.time || "");
  if (tm) d.setHours(+tm[1] + 2, +tm[2], 0, 0); else d.setHours(23, 59, 0, 0);
  return Date.now() > d.getTime();
}
function matchesList(list){
  return `<ul class="matches">${list.map(m => { const d = pd(m.date); return `<li>
    <div class="m-date"><small>${d ? DAYS[d.getDay()] : "TBD"}</small><b>${d ? `${d.getMonth() + 1}/${d.getDate()}` : "–"}</b></div>
    <div><div class="m-team">${esc(m.team)}</div><div class="m-sub">${[m.opp ? "vs. " + esc(m.opp) : "", esc(fmtTime(m.time)), esc(m.where)].filter(Boolean).join(" · ")}</div></div>
    ${m.league ? `<span class="chip">${esc(m.league)}</span>` : "<span></span>"}
  </li>`; }).join("")}</ul>`;
}
function issueCard(is){
  return `<a class="card issue" href="${esc(url(is.path))}">
    <div class="wk"><small>Week</small><b>${esc(is.week)}</b></div>
    <div><p class="eyebrow" style="letter-spacing:.14em;color:var(--muted)">${esc(longDate(is.date))}</p><h3 style="font-size:22px;margin-top:4px">${esc(is.headline || is.title || "The Esports Report")}</h3>${is.excerpt ? `<p class="muted" style="margin:6px 0 0;font-size:15px">${esc(is.excerpt)}</p>` : ""}</div>
    ${is.record && (is.record.w + is.record.l) ? `<div class="rec">${is.record.w}–${is.record.l}</div>` : "<span></span>"}
  </a>`;
}
function gameArt(site, t){ return t.art || ((site.games || []).find(g => g.key === t.gameKey) || {}).art || ""; }
function gameIcon(site, t){ return ((site.games || []).find(g => g.key === t.gameKey) || {}).icon || ""; }
function teamCards(site){
  const showRoster = on(site, "rosters");
  return `<div class="grid g3">${(site.teams || []).map(t => {
    const lg = String(t.leagues || "").split(",").map(s => s.trim()).filter(Boolean);
    const roster = (t.roster || []).filter(p => p.name || p.tag);
    return `<article class="card team${gameArt(site, t) ? " has-art" : ""}">
      ${gameArt(site, t) ? `<img class="team-art" src="${esc(url(gameArt(site, t)))}" alt="" loading="lazy">` : ""}
      ${gameIcon(site, t) ? `<img class="game-logo" src="${esc(url(gameIcon(site, t)))}" alt="${esc(t.game)}">` : `<p class="game">${esc(t.game)}</p>`}
      <h3>${esc(t.name)}</h3>
      ${t.note ? `<p class="muted" style="margin:0;font-size:15px">${esc(t.note)}</p>` : ""}
      <div class="chips">${lg.map((l, i) => `<span class="chip${i ? " gold" : ""}">${esc(l)}</span>`).join("")}</div>
      ${showRoster && roster.length ? `<ul class="roster">${roster.map(p => `<li><span>${p.id ? `<a class="pl" href="${BASE}player.html?id=${encodeURIComponent(p.id)}">` : ""}${p.private || !p.name ? `<span class="tag">${esc(p.tag)}</span>` : esc(p.name)}${p.id ? "</a>" : ""}${p.captain ? ` <span class="cap" title="Team captain" aria-label="Team captain">C</span>` : ""}${p.role ? ` <span class="muted">· ${esc(p.role)}</span>` : ""}</span>${!p.private && p.name && p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ""}</li>`).join("")}</ul>` : ""}
    </article>`; }).join("")}</div>`;
}
function standingsHTML(site){
  const list = (site.standings || []).filter(s => s.on !== false);
  if (!on(site, "standings") || !list.length) return "";
  return `<section class="section alt"><div class="wrap">${secH("League standings")}
    <div class="grid" style="gap:28px">${list.map(s => `<div>
      <div class="sec-h" style="margin-bottom:12px"><h3>${esc(s.title)}</h3>${s.updated ? `<span class="muted" style="font-size:14px">Updated ${esc(shortDate(s.updated) || s.updated)}</span>` : ""}</div>
      ${(s.rows || []).length ? (() => { const rows = s.rows || [], hasR = rows.some(r => String(r.rating || "").trim()); const cut = rows.length > 15; return `<div class="tbl-wrap"><table class="tbl${cut ? " cut" : ""}"><thead><tr><th>#</th><th>Team</th><th class="n">W</th><th class="n">L</th>${hasR ? '<th class="n">Rating</th>' : ""}</tr></thead><tbody>${rows.map((r, i) => `<tr${r.us ? ' class="us"' : cut && i >= 10 ? ' class="extra"' : ""}><td>${esc(r.rank || i + 1)}</td><td>${esc(r.team)}${r.school ? `<span class="sub">${esc(r.school)}</span>` : ""}</td><td class="n">${esc(r.w)}</td><td class="n">${esc(r.l)}</td>${hasR ? `<td class="n">${esc(r.rating || "")}</td>` : ""}</tr>`).join("")}</tbody></table></div>${cut ? `<button type="button" class="tbl-more" onclick="const t=this.previousElementSibling.querySelector('table');t.classList.toggle('cut');this.textContent=t.classList.contains('cut')?'Show all ${rows.length} teams':'Show fewer'">Show all ${rows.length} teams</button>` : ""}`; })() : ""}
      ${safe(s.link) ? `<p style="margin:10px 0 0"><a href="${esc(safe(s.link))}" target="_blank" rel="noopener">Full standings →</a></p>` : ""}
    </div>`).join("")}</div></div></section>`;
}
function bracketsHTML(site){
  const list = (site.brackets || []).filter(s => s.on !== false);
  if (!on(site, "brackets") || !list.length) return "";
  return `<section class="section"><div class="wrap">${secH("Playoff brackets")}
    <div class="grid g2">${list.map(b => `<article class="card" style="display:flex;flex-direction:column;gap:12px">
      <div class="chips">${b.status ? `<span class="chip gold">${esc(b.status)}</span>` : ""}${b.league ? `<span class="chip">${esc(b.league)}</span>` : ""}</div>
      <h3>${esc(b.title)}</h3>
      ${b.image ? `<a href="${esc(url(b.image))}" target="_blank" rel="noopener"><img src="${esc(url(b.image))}" alt="${esc(b.title)} bracket" loading="lazy" style="border-radius:6px;background:#fff"></a>` : ""}
      ${b.text ? `<p class="muted" style="margin:0">${esc(b.text)}</p>` : ""}
      ${safe(b.link) ? `<a class="btn btn-line" style="align-self:flex-start" href="${esc(safe(b.link))}" target="_blank" rel="noopener">View bracket</a>` : ""}
    </article>`).join("")}</div></div></section>`;
}
/* ---------- Record book. Each entry in site.records has a type that decides where it shows:
   championship / finish -> banners · record -> records table · honor -> lists grouped by title · everything -> timeline ---------- */
function recs(site){ return on(site, "records") ? (site.records || []).filter(r => r.title) : []; }
const recType = r => r.type || "milestone";
const recGame = (site, r) => (site.games || []).find(g => g.key === r.game);
/* "Fall 2024" -> 2024-25, "Spring 2026" / "March 2026" -> 2025-26. School years start in July. */
function recSeason(r){
  const t = String(r.year || ""), y = +(t.match(/\b(20\d\d)\b/) || [])[1]; if (!y) return "";
  const m = t.toLowerCase().match(/spring|winter|jan|feb|mar|apr|may|jun/) ? y - 1 : y;
  return `${m}-${String((m + 1) % 100).padStart(2, "0")}`;
}
const BANNER = {championship:[0, ""], tournament:[1, " white"], finish:[2, " silver"]};
function bannersHTML(site, limit, link){
  const list = recs(site).filter(r => recType(r) in BANNER).sort((a, b) => BANNER[recType(a)][0] - BANNER[recType(b)][0]).slice(0, limit || 99);
  if (!list.length) return "";
  return `<div class="banners">${list.map((r, i) => { const g = recGame(site, r), inner = `${g?.icon ? `<img src="${esc(url(g.icon))}" alt="${esc(g.name)}">` : ""}${r.org ? `<small>${esc(r.org)}</small>` : ""}<b>${esc(r.title)}</b>${r.year ? `<i>${esc(r.year)}</i>` : ""}`;
    return link ? `<a class="banner${BANNER[recType(r)][1]}" href="${BASE}legacy.html">${inner}</a>` : `<button type="button" class="banner${BANNER[recType(r)][1]}" data-story="${i}" aria-expanded="false">${inner}</button>`; }).join("")}</div>
    ${link ? "" : `<div class="story" id="story" hidden></div><script type="application/json" id="stories">${JSON.stringify(list.map(r => ({h:[r.org, r.title, r.year].filter(Boolean).join(" · "), t:r.detail || ""}))).replace(/</g, "\\u003c")}<\/script>`}`;
}
function timelineHTML(site){
  const by = {}; recs(site).forEach(r => { const se = recSeason(r); if (se && recType(r) !== "record") (by[se] = by[se] || []).push(r); });
  const seasons = Object.keys(by).sort().reverse(); if (!seasons.length) return "";
  const order = {championship:0, tournament:1, finish:2, milestone:3};
  return `<div class="tl">${seasons.map(se => { const list = by[se], main = list.filter(r => recType(r) !== "honor").sort((a, b) => order[recType(a)] - order[recType(b)]), hon = {};
    list.filter(r => recType(r) === "honor").forEach(r => (hon[r.title] = hon[r.title] || []).push(r));
    return `<div><h3>${se.replace("-", "–")} <span data-season-rec="${se}"></span></h3><ul>${main.map(r => `<li>${recType(r) === "milestone" ? esc(r.title) : `<b>${esc([r.org, r.title].filter(Boolean).join(" "))}</b>${recGame(site, r) ? ` · ${esc(recGame(site, r).short || recGame(site, r).name)}` : ""}`}</li>`).join("")}${Object.entries(hon).map(([t, l]) => `<li>${esc(t)}: ${l.map(r => esc(r.detail || "")).filter(Boolean).join(", ")}</li>`).join("")}</ul></div>`; }).join("")}</div>`;
}
function recordTableHTML(site){
  const list = recs(site).filter(r => recType(r) === "record"); if (!list.length) return "";
  return `<div class="tbl-wrap"><table class="tbl rec"><tbody>${list.map(r => `<tr><td>${esc(r.title)}<small>${esc([recGame(site, r)?.short || recGame(site, r)?.name, r.detail, r.year].filter(Boolean).join(" · "))}</small></td><td class="n"><b>${esc(r.value || "")}</b></td></tr>`).join("")}</tbody></table></div>`;
}
function honorsHTML(site){
  const groups = {}; recs(site).filter(r => recType(r) === "honor").forEach(r => (groups[r.title] = groups[r.title] || []).push(r));
  return Object.entries(groups).map(([t, l]) => `<p class="sub">${esc(t)}</p><div class="tbl-wrap" style="margin-bottom:26px"><table class="tbl"><tbody>${l.sort((a, b) => recSeason(b).localeCompare(recSeason(a))).map(r => `<tr>${l.some(x => x.year) ? `<td style="white-space:nowrap">${esc(r.year || "")}</td>` : ""}<td>${esc(r.detail || "")}</td><td class="muted">${esc(recGame(site, r)?.name || "")}</td></tr>`).join("")}</tbody></table></div>`).join("");
}
function recordBookHTML(site){
  const left = timelineHTML(site), right = (recordTableHTML(site) ? `<p class="sub">Records</p>${recordTableHTML(site)}<div style="height:26px"></div>` : "") + honorsHTML(site);
  return `${bannersHTML(site) ? `<p class="sub" style="margin-top:38px">Banners</p>${bannersHTML(site)}` : ""}
    ${left || right ? `<div class="grid g2 rb-cols">${left ? `<div><p class="sub">Program timeline</p>${left}</div>` : ""}${right ? `<div>${right}</div>` : ""}</div>` : ""}`;
}
function sponsorsHTML(site){
  const list = site.sponsors || [];
  if (!on(site, "sponsors") || !list.length) return "";
  return `<div class="sponsors">${list.map(s => { const inner = s.logo ? `<img src="${esc(url(s.logo))}" alt="${esc(s.name)}" loading="lazy">` : `<span>${esc(s.name)}</span>`; return safe(s.link) ? `<a class="sponsor" href="${esc(safe(s.link))}" target="_blank" rel="noopener" title="${esc(s.name)}">${inner}</a>` : `<div class="sponsor" title="${esc(s.name)}">${inner}</div>`; }).join("")}</div>`;
}
function newsHTML(site, limit){
  const list = [...(site.news || [])].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, limit || 99);
  if (!on(site, "news") || !list.length) return "";
  return `<div class="grid g3">${list.map(n => `<a class="card news-item" href="${esc(safe(n.link) || "#")}" target="_blank" rel="noopener">
    ${n.image ? `<img src="${esc(url(n.image))}" alt="" loading="lazy">` : ""}
    <span class="news-meta">${[esc(n.source), esc(shortDate(n.date))].filter(Boolean).join(" · ")}</span>
    <h3 style="font-size:21px">${esc(n.title)}</h3>
    ${n.summary ? `<p class="muted" style="margin:0;font-size:15px">${esc(n.summary)}</p>` : ""}
  </a>`).join("")}</div>`;
}
function calLinks(site){
  const id = site.calendar?.id; if (!id) return null;
  const e = encodeURIComponent(id);
  return {
    embed: `https://calendar.google.com/calendar/embed?src=${e}&ctz=America%2FDetroit&showTitle=0&showPrint=0&showCalendars=0&showTz=0`,
    google: `https://calendar.google.com/calendar/u/0/r?cid=${e}`,
    ics: `https://calendar.google.com/calendar/ical/${e}/public/basic.ics`,
    webcal: `webcal://calendar.google.com/calendar/ical/${e}/public/basic.ics`
  };
}

/* ---------- pages ---------- */
function home(site, issues){
  const P = site.program || {}, L = site.links || {};
  const last = latestIssue(issues), up = upcoming(issues).slice(0, 5);
  return `<section class="scores" id="scores" aria-label="Scores" hidden></section>
  <section class="hero${P.heroVideo !== false ? " has-video" : ""}">
    ${P.heroVideo !== false ? `<video class="hero-video" id="heroVideo" muted loop playsinline preload="none" poster="${BASE}assets/hero/hero.jpg" aria-hidden="true" tabindex="-1"></video>
    <div class="hero-tint" aria-hidden="true"></div>
    <button class="hero-pause" id="heroPause" type="button" aria-label="Pause background video" hidden>❚❚</button>` : ""}
    <div class="wrap">
    <div class="hero-copy">
      <p class="eyebrow">${esc(P.school || "Hartland High School")}</p>
      <h1>${esc(P.heroTitle || "Hartland Eagles Esports").replace(/Esports$/i, "<span>Esports</span>")}</h1>
      <p class="lead">${esc(P.heroText || "")}</p>
      <div class="btns">${safe(L.youtube) ? `<a class="btn btn-gold" href="${esc(safe(L.youtube))}" target="_blank" rel="noopener">Watch on YouTube</a>` : ""}${P.promo !== false ? `<button class="btn btn-line" type="button" id="promoBtn">▶ Watch our promo</button>` : ""}<a class="btn btn-line" href="${BASE}about.html#join">Join the team</a></div>
    </div>
    <img class="hero-logo" src="${BASE}assets/logo-team.png?v=2" alt="Hartland Eagles Esports logo" width="1100" height="770">
  </div></section>

  ${last ? `<section class="section"><div class="wrap">${secH("Latest report", `<a class="more" href="${BASE}newsletters.html">All newsletters →</a>`)}
    <a class="score" href="${esc(url(last.path))}" style="text-decoration:none;color:inherit">
      <div class="score-rec"><b>${last.record ? `${last.record.w}–${last.record.l}` : "—"}</b><small>Week ${esc(last.week)}</small></div>
      <div class="score-body"><p class="eyebrow">${esc(last.title || "The Esports Report")} · ${esc(longDate(last.date))}</p><h3>${esc(last.headline || "")}</h3>${last.excerpt ? `<p class="muted" style="margin:0">${esc(last.excerpt)}</p>` : ""}<span class="btn btn-line" style="align-self:flex-start;margin-top:6px">Read the full report</span></div>
    </a></div></section>` : ""}

  <section class="section ${last ? "alt" : ""}"><div class="wrap">${secH("Coming up", `<a class="more" href="${BASE}schedule.html">Full schedule →</a>`)}
    <div id="upNext" data-limit="5">${up.length ? matchesList(up) : `<div class="empty">Match times are posted in the weekly report and on our calendar. <a href="${BASE}schedule.html#subscribe">Add the calendar to your phone</a>.</div>`}</div>
  </div></section>

  <section class="section"><div class="wrap">${secH("Our teams", `<a class="more" href="${BASE}teams.html">Teams & leagues →</a>`)}${teamCards({...site, sections:{...site.sections, rosters:false}})}</div></section>

  ${newsHTML(site, 3) ? `<section class="section alt"><div class="wrap">${secH("In the news", `<a class="more" href="${BASE}media.html">All news →</a>`)}${newsHTML(site, 3)}</div></section>` : ""}
  ${bannersHTML(site, 5, true) ? `<section class="section"><div class="wrap">${secH("Banners", `<a class="more" href="${BASE}legacy.html">Record book →</a>`)}${bannersHTML(site, 5, true)}</div></section>` : ""}
  <section class="section alt"><div class="wrap"><div class="grid g2">
    <a class="card news-item" href="${BASE}legacy.html"><p class="eyebrow">Legacy</p><h3>Record book, rivalries & alumni</h3><p class="muted" style="margin:0;font-size:15px">Our all-time record, the schools we love to beat, and the Eagles now playing in college.</p><span class="more">Explore →</span></a>
    <a class="card news-item" href="${BASE}future.html"><p class="eyebrow">Grades 6–8</p><h3>Future Eagles</h3><p class="muted" style="margin:0;font-size:15px">In middle school? Here's how to get ready for high school esports, and how parents can tell us you're interested.</p><span class="more">Get ready →</span></a>
  </div></div></section>
  ${sponsorsHTML(site) ? `<section class="section"><div class="wrap">${secH("Thank you to our sponsors")}${sponsorsHTML(site)}</div></section>` : ""}`;
}
function teams(site){
  const d = new Date(), y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return pageH(`${y}–${String((y + 1) % 100).padStart(2, "0")} season`, "Teams & leagues", esc(site.program?.teamsIntro || ""), site.art?.teams)
  + `<section class="section"><div class="wrap">${teamCards(site)}${safe(site.links?.league) ? `<p style="margin:20px 0 0"><a href="${esc(safe(site.links.league))}" target="_blank" rel="noopener">MHSEL on RallyCry →</a></p>` : ""}</div></section>`
  + standingsHTML(site) + bracketsHTML(site);
}
function schedule(site, issues){
  const c = site.calendar?.on !== false ? calLinks(site) : null, up = upcoming(issues);
  return pageH("Match days & events", "Schedule", "Matches, tryouts and events. Add our calendar to your phone and new dates show up automatically.")
  + `<section class="section" id="upSection"${up.length ? "" : " hidden"}><div class="wrap">${secH("Next matches")}<div id="upNext" data-limit="10">${up.length ? matchesList(up.slice(0, 10)) : ""}</div></div></section>`
  + (c ? `<section class="section ${up.length ? "alt" : ""}" id="subscribe"><div class="wrap">${secH("Add our calendar")}
    <div class="grid g3">
      <div class="card sub-card"><h3>Google Calendar</h3><p class="muted" style="margin:0;font-size:15px">Android phones and Gmail accounts.</p><a class="btn btn-gold" href="${c.google}" target="_blank" rel="noopener">Add to Google</a></div>
      <div class="card sub-card"><h3>iPhone, iPad & Mac</h3><p class="muted" style="margin:0;font-size:15px">Opens Apple Calendar and subscribes.</p><a class="btn btn-gold" href="${c.webcal}">Add to Apple Calendar</a></div>
      <div class="card sub-card"><h3>Samsung, Outlook & others</h3><p class="muted" style="margin:0;font-size:15px">Copy this link, then choose "subscribe" or "add calendar from URL".</p><div class="copyrow"><input id="icsUrl" type="text" readonly value="${c.ics}" aria-label="Calendar subscription link"><button class="btn btn-line" type="button" id="copyIcs" style="padding:9px 14px;font-size:15px">Copy</button></div></div>
    </div>
    <div class="cal" style="margin-top:22px"><iframe src="${c.embed}" title="Hartland Esports calendar" loading="lazy"></iframe></div>
  </div></section>` : "")
  + `<section class="section"><div class="wrap">${secH("How our year works")}${timeline(site)}</div></section>`;
}
function results(site){
  return pageH(`${seasonText()} season`, "Results", "Every finished match, season by season. Scores update live, and you can tap any match for game-by-game scores, the lineup and the replay.")
  + `<section class="section"><div class="wrap" id="results"><div class="loading">Loading results…</div></div></section>`;
}
function player(){ return `<div id="player"><div class="loading" style="padding:80px 0">Loading player…</div></div>`; }
function seasonText(){ const d = new Date(), y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return `${y}–${String((y + 1) % 100).padStart(2, "0")}`; }
function timeline(site){
  return `<ol class="timeline">${(site.seasons || []).map((s, i) => `<li class="${i === 0 || i === 3 ? "big" : ""}"><h3>${esc(s.name)}</h3><p class="when">${esc(s.when)}</p><p>${esc(s.text)}</p></li>`).join("")}</ol>`;
}
function newsletters(site, issues){
  const groups = {};
  issues.forEach(i => { (groups[i.season || "Other"] = groups[i.season || "Other"] || []).push(i); });
  const seasons = Object.keys(groups).sort().reverse();
  return pageH("The Esports Report", "Newsletters", "Every weekly report: results, upcoming matches and team news.")
  + `<section class="section"><div class="wrap">${seasons.length ? seasons.map(se => `<div style="margin-bottom:40px">${secH(`${esc(se)} school year`, `<span class="muted">${groups[se].length} issue${groups[se].length === 1 ? "" : "s"}</span>`)}<div class="grid" style="gap:10px">${groups[se].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map(issueCard).join("")}</div></div>`).join("") : `<div class="empty">The first issue of The Esports Report is on its way.</div>`}</div></section>`;
}
function media(site){
  const gal = on(site, "gallery") ? (site.gallery || []) : [];
  const albums = [...new Set(gal.map(g => g.album).filter(Boolean))];
  return pageH("Photos & press", "Media", "")
  + (newsHTML(site) ? `<section class="section"><div class="wrap">${secH("In the news")}${newsHTML(site)}</div></section>` : "")
  + (gal.length ? `<section class="section alt"><div class="wrap">${secH("Photo gallery")}
    ${albums.length > 1 ? `<div class="chips" id="albums" style="margin-bottom:16px"><button class="chip gold" data-album="" type="button">All</button>${albums.map(a => `<button class="chip" data-album="${esc(a)}" type="button">${esc(a)}</button>`).join("")}</div>` : ""}
    <div class="gallery" id="gallery">${gal.map((g, i) => `<button type="button" data-i="${i}" data-album="${esc(g.album || "")}" aria-label="${esc(g.caption || "Open photo")}"><img src="${esc(url(g.image))}" alt="${esc(g.caption || "")}" loading="lazy"></button>`).join("")}</div>
  </div></section>` : "")
  + (!newsHTML(site) && !gal.length ? `<section class="section"><div class="wrap"><div class="empty">Photos and news are coming soon.</div></div></section>` : "");
}
function about(site){
  const P = site.program || {}, T = site.tryouts || {}, L = site.links || {};
  const joinArt = site.art?.join ? `<img class="join-art" src="${esc(url(site.art.join))}" alt="">` : "";
  const support = [["merch","Team merch","Shirts, hoodies and more from Big Frog of Brighton."],["jerseys","Official jerseys","Custom Hartland Esports jerseys from Guardian Proline."],["fundraiser", L.fundraiserLabel || "Fundraiser","Proceeds cover league fees and new equipment."]].filter(([k]) => safe(L[k]));
  return pageH(esc(P.school || "Hartland High School"), "About & join", esc(P.aboutText || ""))
  + `<section class="section" id="join"><div class="wrap">${secH("Join the team")}
    <div class="grid g2">
      ${T.on !== false ? `<div class="card join-card${joinArt ? " has-art" : ""}">${joinArt}<p class="eyebrow">${esc(T.title || "Tryouts")}</p><h3 style="font-size:30px;margin:8px 0">${esc(longDate(T.date))}</h3><p style="margin:0 0 6px"><b>${esc(T.time || "")}</b></p><p class="muted" style="margin:0 0 12px">${esc(T.location || "")}</p><p style="margin:0">${esc(T.text || "")}</p>${safe(L.register) ? `<p style="margin:16px 0 0"><a class="btn btn-gold" href="${esc(safe(L.register))}" target="_blank" rel="noopener">Register for esports</a></p>` : ""}</div>` : (safe(L.register) ? `<div class="card join-card${joinArt ? " has-art" : ""}">${joinArt}<p class="eyebrow">Sign up</p><h3 style="font-size:30px;margin:8px 0">Register for esports</h3><p class="muted" style="margin:0 0 14px">Fill out the registration form to join the program.</p><a class="btn btn-gold" href="${esc(safe(L.register))}" target="_blank" rel="noopener">Open the registration form</a></div>` : "")}
      <div class="card"><p class="eyebrow">Questions?</p><h3 style="font-size:30px;margin:8px 0">Talk to the coaches</h3>
        <ul class="roster" style="border:0;padding:0">${(site.coaches || []).map(c => `<li><span><b>Coach ${esc(c.name)}</b>${c.role && c.role !== "Coach" ? ` · ${esc(c.role)}` : ""}</span>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ""}</li>`).join("")}</ul>
        ${P.lab ? `<p class="muted" style="margin:12px 0 0;font-size:15px">We practice in the ${esc(P.lab)}.</p>` : ""}
      </div>
    </div>
  </div></section>
  <section class="section alt"><div class="wrap">${secH("How our year works")}${timeline(site)}</div></section>
  <section class="section"><div class="wrap"><div class="grid g2">
    <a class="card news-item" href="${BASE}future.html"><p class="eyebrow">Grades 6–8</p><h3>Future Eagles</h3><p class="muted" style="margin:0;font-size:15px">Not in high school yet? See what to practice now, and how parents can tell us you're interested.</p><span class="more">Get ready →</span></a>
    <a class="card news-item" href="${BASE}legacy.html"><p class="eyebrow">Legacy</p><h3>Record book, rivalries & alumni</h3><p class="muted" style="margin:0;font-size:15px">What this program has done so far, and where its players go next.</p><span class="more">Explore →</span></a>
  </div></div></section>
  ${support.length ? `<section class="section alt"><div class="wrap">${secH("Support the team")}<div class="grid g3">${support.map(([k, t, d]) => `<a class="card news-item" href="${esc(safe(L[k]))}" target="_blank" rel="noopener"><h3>${esc(t)}</h3><p class="muted" style="margin:0;font-size:15px">${esc(d)}</p><span class="more" style="font-family:var(--display);font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--gold)">Visit →</span></a>`).join("")}</div></div></section>` : ""}
  ${sponsorsHTML(site) ? `<section class="section"><div class="wrap">${secH("Our sponsors")}${sponsorsHTML(site)}</div></section>` : ""}
  <section class="section alt"><div class="wrap">${secH("Follow along")}<p class="lead" style="margin-bottom:6px">Matches stream on YouTube, with highlights across our socials.</p>${socials(site)}</div></section>`;
}

/* ---------- Legacy: record book, rivalries, alumni (numbers are filled in live from final results) ---------- */
function rivalList(site){ return (site.rivals || []).filter(r => r.school && r.title); }
function rivalHref(r){ return `${BASE}rival.html?school=${encodeURIComponent(r.school)}`; }
function legacy(site){
  const rv = rivalList(site);
  return pageH("Record book · Rivalries · Alumni", "Legacy", "Every final result since the program began, the schools we measure ourselves against, and where Eagles go after graduation.")
  + `<section class="section" id="recordBook"><div class="wrap">${secH("Record book")}
      <div id="allTime"><div class="loading">Adding up every final…</div></div>
      ${recordBookHTML(site)}
    </div></section>`
  + (rv.length ? `<section class="section alt" id="rivalries"><div class="wrap">${secH("Rivalries")}
      <div class="grid g2">${rv.map(r => `<a class="card rival-card" href="${rivalHref(r)}" data-rival="${esc(r.school)}">
        <p class="eyebrow">⚔ ${esc(r.title)}</p><h3>Hartland vs. ${esc(r.school)}</h3>
        ${r.note ? `<p class="muted" style="margin:0">${esc(r.note)}</p>` : ""}
        <div class="rival-rec"><b data-rec>–</b><small>all-time</small></div><span class="more">The full story →</span></a>`).join("")}</div>
    </div></section>` : "")
  + `<section class="section" id="nextLevel" data-title="Where Eagles go next" data-lead="The road doesn't end at graduation. These Eagles took it to the college level, and it's the same road today's roster is on." hidden></section>`;
}
function rival(){ return `<div id="rival"><div class="loading" style="padding:80px 0">Loading the rivalry…</div></div>`; }

/* ---------- Future Eagles (grades 6-8). Wording lives in site.json under "future"; these are the defaults. ---------- */
const FUTURE = {
  intro:"There's no middle school team yet, but the best time to start getting ready is now. Here's what our coaches would have a 6th, 7th or 8th grader work on before they ever walk into tryouts.",
  clinic:"A past winter clinic put our upperclassmen in the coach's chair for a group of middle schoolers. Two of the players who showed up that week are standouts on our roster today.",
  games:[
    {key:"rocket-league", name:"Rocket League", good:"You hit the ball where you meant to, you know whose turn it is to go, and you're back in position before the other team shoots.",
      routine:["10 minutes of free play: hit the ball hard, on purpose, every touch","10 minutes of training packs: shots first, then saves","Play 2v2 or 3v3 and practice rotating back post instead of chasing"]},
    {key:"smash", name:"Super Smash Bros. Ultimate", good:"You have one main you really know, you can recover from anywhere, and you don't panic when you're behind.",
      routine:["Pick one main and stick with it for a full month","10 minutes in training mode: movement, short hops and your two best combos","Play sets, not single games, and adjust between games like a tournament"]},
    {key:"fortnite-zw", name:"Fortnite Zone Wars", good:"You build without thinking about it, you take fights with a height or cover advantage, and you and your duo talk the whole time.",
      routine:["10 minutes of free building and edit courses","10 minutes of aim training or box fights","Zone Wars with a duo: call out every opponent you see and every rotation"]},
    {key:"marvel-rivals", name:"Marvel Rivals", good:"You can play at least two roles, you group up before a fight instead of trickling in, and you track the other team's ultimates.",
      routine:["Learn two heroes in two different roles","Warm up in the practice range before you queue","After each match, name one fight your team lost and why"]}
  ],
  habits:[
    {title:"Watch your own replays", text:"One loss a week. Find the first mistake, not the last one."},
    {title:"Warm up every time", text:"Ten minutes before the first real match, the same way every day."},
    {title:"Talk like a teammate", text:"Short, calm callouts about what's happening now. No blaming."},
    {title:"Be a good sport", text:"Say good game, win or lose. Coaches notice, and so do opponents."},
    {title:"School comes first", text:"High school players have to stay eligible. Build the habit of finishing homework before you queue."}
  ]
};
function future(site){
  const F = {...FUTURE, ...(site.future || {})}, form = safe(F.formUrl);
  const icon = k => ((site.games || []).find(g => g.key === k) || {}).icon;
  return pageH("Grades 6–8", "Future Eagles", esc(F.intro))
  + `<section class="section"><div class="wrap">${secH("Get ready for high school")}
      <div class="grid g2">${F.games.map(g => `<article class="card prep">
        ${icon(g.key) ? `<img class="game-logo" src="${esc(url(icon(g.key)))}" alt="${esc(g.name)}">` : `<p class="eyebrow">${esc(g.name)}</p>`}
        <p class="prep-good"><span>What good looks like</span>${esc(g.good)}</p>
        <p class="prep-h">A 30-minute practice</p><ol>${(g.routine || []).map(x => `<li>${esc(x)}</li>`).join("")}</ol>
      </article>`).join("")}</div></div></section>
    <section class="section alt"><div class="wrap">${secH("Habits of a competitor")}
      <div class="grid g3">${F.habits.map((h, i) => `<div class="card habit"><b>${i + 1}</b><h3>${esc(h.title)}</h3><p class="muted" style="margin:0">${esc(h.text)}</p></div>`).join("")}</div></div></section>
    ${F.clinic ? `<section class="section"><div class="wrap">${secH("It already works")}<p class="lead">${esc(F.clinic)}</p></div></section>` : ""}
    <section class="section ${F.clinic ? "alt" : ""}" id="interest"><div class="wrap">${secH("Parents: tell us you're interested")}
      <div class="card" style="max-width:760px"><p style="margin:0 0 14px">${form ? "A short form for parents and guardians. We ask for your name and email, your student's first name and grade, and the games they play. Nothing else, and no student contact information." : "A short interest form for parents and guardians is on the way, including a question about a possible summer camp. Until it's up, the coaches are happy to answer questions."}</p>
      ${form ? `<a class="btn btn-gold" href="${esc(form)}" target="_blank" rel="noopener">Open the interest form</a>` : `<a class="btn btn-gold" href="${BASE}about.html#join">Talk to the coaches</a>`}</div>
    </div></section>`;
}

/* Home hero: muted looping highlight reel behind the headline. Phones get a smaller file. If the video can't or
   shouldn't play (reduced motion, data saver, blocked autoplay), the poster image stays and nothing breaks. */
function heroSetup(){
  const v = $("#heroVideo"), pause = $("#heroPause");
  if (v){
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.connection?.saveData;
    if (!calm){
      v.muted = true; v.defaultMuted = true; v.setAttribute("muted", "");
      v.src = BASE + "assets/hero/" + (matchMedia("(max-width: 700px)").matches ? "hero-mobile.mp4" : "hero.mp4") + "?v=2";
      v.addEventListener("playing", () => { v.classList.add("on"); pause.hidden = false; }, {once:true});
      const p = v.play(); if (p && p.catch) p.catch(() => {});
      pause.addEventListener("click", () => {
        if (v.paused){ v.play(); pause.textContent = "❚❚"; pause.setAttribute("aria-label", "Pause background video"); }
        else { v.pause(); pause.textContent = "▶"; pause.setAttribute("aria-label", "Play background video"); }
      });
      document.addEventListener("visibilitychange", () => { if (document.hidden) v.pause(); else if (pause.textContent !== "▶") v.play().catch(() => {}); });
    }
  }
  $("#promoBtn")?.addEventListener("click", e => {
    const b = e.currentTarget, wasPlaying = v && !v.paused; if (wasPlaying) v.pause();
    const lb = document.createElement("div"); lb.className = "lightbox"; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true"); lb.setAttribute("aria-label", "Hartland Esports promo video");
    lb.innerHTML = `<button class="btn btn-line" type="button">Close</button><video src="${BASE}assets/hero/promo.mp4" poster="${BASE}assets/hero/promo.jpg" controls autoplay playsinline style="max-width:min(1100px,94vw);max-height:78vh;border-radius:8px;background:#000"></video>`;
    const close = () => { lb.remove(); b.focus(); document.removeEventListener("keydown", k); if (wasPlaying) v.play().catch(() => {}); };
    const k = ev => { if (ev.key === "Escape") close(); };
    lb.addEventListener("click", ev => { if (ev.target === lb || ev.target.tagName === "BUTTON") close(); });
    document.addEventListener("keydown", k); document.body.appendChild(lb); lb.querySelector("button").focus();
  });
}

/* ---------- boot ---------- */
async function boot(){
  const app = $("#main");
  let site, issues = [];
  try { site = await getJSON("data/site.json"); } catch(e){ app.innerHTML = `<div class="loading">Couldn't load the site. Please refresh.</div>`; return; }
  try { issues = (await getJSON("data/issues.json")).issues || []; } catch(e){}
  document.body.insertAdjacentHTML("afterbegin", header(site));
  const render = {home, teams, schedule, results, player, newsletters, media, about, legacy, rival, future}[PAGE] || home;
  app.innerHTML = render(site, issues);
  if (["home", "schedule", "results", "player", "legacy", "rival"].includes(PAGE)) import(BASE + "assets/live.js?v=24").then(L => {
    if (PAGE === "legacy") L.startLegacy(site); if (PAGE === "rival") L.startRival(site);
    if (PAGE === "home" || PAGE === "schedule") L.startUpcoming(site, upcoming(issues));
    if (PAGE === "home") L.startStrip(site); if (PAGE === "results") L.startResults(site); if (PAGE === "player") L.startPlayer(site);
  }).catch(e => { console.error(e); const r = $("#results") || $("#player") || $("#rival") || $("#allTime"); if (r) r.innerHTML = `<div class="empty">Couldn't load scores right now. Please refresh in a minute.</div>`; });
  document.body.insertAdjacentHTML("beforeend", footer(site));
  heroSetup();
  const stories = $("#stories") ? JSON.parse($("#stories").textContent) : [];
  document.querySelectorAll(".banner[data-story]").forEach(b => b.onclick = () => { const st = stories[+b.dataset.story], box = $("#story"), was = b.getAttribute("aria-expanded") === "true";
    document.querySelectorAll(".banner[data-story]").forEach(x => x.setAttribute("aria-expanded", "false"));
    if (was || !st){ box.hidden = true; return; } b.setAttribute("aria-expanded", "true"); box.hidden = false;
    box.innerHTML = `<small>${esc(st.h)}</small>${st.t ? `<p style="margin:6px 0 0">${esc(st.t)}</p>` : ""}`; });
  const btn = $(".nav-btn"), nav = $("#nav");
  btn?.addEventListener("click", () => { const o = nav.classList.toggle("open"); btn.setAttribute("aria-expanded", o); });
  $("#copyIcs")?.addEventListener("click", async e => { const i = $("#icsUrl"); try { await navigator.clipboard.writeText(i.value); e.target.textContent = "Copied"; } catch(err){ i.select(); } });
  const gal = site.gallery || [];
  $("#gallery")?.addEventListener("click", e => {
    const b = e.target.closest("button[data-i]"); if (!b) return;
    const g = gal[+b.dataset.i];
    const lb = document.createElement("div"); lb.className = "lightbox"; lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true");
    lb.innerHTML = `<button class="btn btn-line" type="button">Close</button><img src="${esc(url(g.image))}" alt="${esc(g.caption || "")}">${g.caption ? `<p>${esc(g.caption)}</p>` : ""}`;
    const close = () => { lb.remove(); b.focus(); document.removeEventListener("keydown", k); };
    const k = ev => { if (ev.key === "Escape") close(); };
    lb.addEventListener("click", ev => { if (ev.target === lb || ev.target.tagName === "BUTTON") close(); });
    document.addEventListener("keydown", k); document.body.appendChild(lb); lb.querySelector("button").focus();
  });
  $("#albums")?.addEventListener("click", e => {
    const b = e.target.closest("[data-album]"); if (!b) return;
    document.querySelectorAll("#albums .chip").forEach(c => c.classList.toggle("gold", c === b));
    document.querySelectorAll("#gallery button").forEach(g => { g.hidden = b.dataset.album && g.dataset.album !== b.dataset.album; });
  });
}
boot();
})();
