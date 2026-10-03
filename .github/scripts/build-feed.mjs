// Builds feed.xml (RSS) from files already in the repo: final results in data/matches/, news in data/site.json
// and newsletters in data/issues.json. Only FINAL matches are listed. Titles are short, headline-style lines so a
// stream ticker can show them as they are.
import fs from "node:fs";

const read = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch(e){ return d; } };
const site = read("data/site.json", {}), issues = read("data/issues.json", {}).issues || [];
let host = "https://example.com"; try { host = "https://" + fs.readFileSync("CNAME", "utf8").trim(); } catch(e){}
const name = site.program?.name || "Esports", school = (site.program?.school || "").replace(/\s+High School$/i, "") || "Home";
const x = s => String(s ?? "").replace(/[<>&'"]/g, c => ({"<":"&lt;", ">":"&gt;", "&":"&amp;", "'":"&apos;", '"':"&quot;"}[c]));
const short = n => { const s = String(n || "").trim(); return s.replace(/\s+(jr\.?\s*\/\s*sr\.?\s+|junior\s+|senior\s+|community\s+)?(high\s+sc?h?c?ool|high|hs|h\.s\.|school)\s*$/i, "").replace(/\s+senior$/i, "").trim() || s; };
const noon = d => new Date(/^\d{4}-\d{2}-\d{2}$/.test(d || "") ? d + "T16:00:00Z" : d || 0);

const items = [];
const seasons = (read("data/matches/index.json", {}).seasons || []).slice(0, 2);
for (const se of seasons) for (const m of read(`data/matches/${se}.json`, {}).matches || []){
  if (m.status !== "final" || !m.result) continue;
  const opp = String(m.opponent?.short || "").trim() || short(m.opponent?.school) || m.opponent?.team || "Opponent";
  const us = m.score?.us ?? 0, them = m.score?.them ?? 0, round = m.stage === "playoffs" || m.stage === "finals" ? (/^\d*$/.test(String(m.week ?? "").trim()) ? "Playoffs" : String(m.week).trim()) : "";
  const title = m.forfeit ? `FINAL: ${school} ${m.teamName} ${m.result === "W" ? "wins by forfeit over" : "forfeits to"} ${opp}`
    : `FINAL: ${school} ${m.teamName} ${m.result === "W" ? "beats" : m.result === "L" ? "falls to" : "ties"} ${opp} ${Math.max(us, them)}–${Math.min(us, them)}`;
  items.push({title:title + (round ? ` (${round})` : ""), link:`${host}/results.html?season=${se}&m=${encodeURIComponent(m.id)}`, guid:`match-${m.id}`, date:new Date(m.startsAt || m.updatedAt), cat:"Result", desc:[m.league, m.gameName].filter(Boolean).join(" · ")});
}
for (const n of site.news || []) if (n.title) items.push({title:n.title, link:/^https?:/.test(n.link || "") ? n.link : `${host}/media.html`, guid:`news-${n.date}-${n.title}`, date:noon(n.date), cat:"News", desc:n.summary || n.source || ""});
for (const i of issues) if (i.headline || i.title) items.push({title:`Week ${i.week} report: ${i.headline || i.title}`, link:`${host}/${String(i.path || "newsletters.html").replace(/^\/+/, "")}`, guid:`issue-${i.path || i.date}`, date:noon(i.date), cat:"Newsletter", desc:i.excerpt || ""});

items.sort((a, b) => b.date - a.date);
const list = items.filter(i => !isNaN(i.date)).slice(0, 50);
const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${x(name)}</title>
<link>${host}/</link>
<atom:link href="${host}/feed.xml" rel="self" type="application/rss+xml"/>
<description>${x(`Final results and news from ${name}.`)}</description>
<language>en-us</language>
${list.map(i => `<item><title>${x(i.title)}</title><link>${x(i.link)}</link><guid isPermaLink="false">${x(i.guid)}</guid><pubDate>${i.date.toUTCString()}</pubDate><category>${i.cat}</category>${i.desc ? `<description>${x(i.desc)}</description>` : ""}</item>`).join("\n")}
</channel>
</rss>
`;
let have = ""; try { have = fs.readFileSync("feed.xml", "utf8"); } catch(e){}
if (have !== body){ fs.writeFileSync("feed.xml", body); console.log(`Wrote feed.xml (${list.length} items)`); } else console.log("feed.xml unchanged");
