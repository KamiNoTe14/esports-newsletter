// Collects outside items for the stream ticker into data/ticker/:
//   athletics.json  Hartland Athletics scores from the score strip on hartlandeagles.com (Eventlink)
//   news.json       esports headlines from an RSS feed, filtered to stay school-appropriate
// The ticker page can't read those sites directly (browsers block it), so this runs on GitHub every hour.
// Pro and college scores are NOT here: the ticker reads those live from ESPN itself.
// If a source can't be reached, its old file is kept.
import fs from "node:fs";

const OUT = "data/ticker";
const UA = "Mozilla/5.0 (compatible; HartlandEsportsTicker/1.0; +https://hartlandesports.com)";
const ATHLETICS = "https://hartlandeagles.com/";
const NEWS = ["https://esports-news.co.uk/feed/"];
/* Headlines that trip this word filter are left out, so the stream stays school-appropriate. */
const BLOCK = /\b(sex|sexual|nsfw|porn|nude|drugs?|cocaine|weed|kill(ed|ing)?|murder|suicide|shoot(ing)?|gun|gambl\w*|bet(ting)?|casino|skins? betting|lawsuit|arrest\w*|abuse\w*|harass\w*|racis\w*|slur|fuck|shit|damn|hell|ass)\b/i;

fs.mkdirSync(OUT, {recursive:true});
const get = async url => { const r = await fetch(url, {headers:{"user-agent":UA, accept:"text/html,application/rss+xml,*/*"}}); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); };
const text = s => String(s || "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&#8217;|&rsquo;/g, "’").replace(/&quot;|&#8220;|&#8221;/g, "\"").replace(/&#8211;|&#8212;/g, "–").replace(/&nbsp;/g, " ").replace(/&[a-z]+;|&#\d+;/g, "").replace(/\s+/g, " ").trim();
function write(name, data){
  const file = `${OUT}/${name}`, body = JSON.stringify(data, null, 2) + "\n";
  let old = ""; try { old = fs.readFileSync(file, "utf8"); } catch(e){}
  const strip = s => s.replace(/"updated": "[^"]*",?\n/, "");
  if (strip(old) === strip(body)) return console.log(`${name}: unchanged`);
  fs.writeFileSync(file, body); console.log(`${name}: ${data.items.length} items`);
}

/* ---- Hartland Athletics (Eventlink score strip) ----
   Each game is an <a class="score-ticker-card" href="/Event/…"> with two headers ("October 8 04:00 PM", "B V Soccer"),
   then two teams, each with a name and a score (blank before the game). */
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const LEVELS = {V:"Varsity", JV:"JV", F:"Freshman"};
function when(s){
  const m = /^(\w+)\s+(\d{1,2})\s+(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(s || ""); if (!m) return null;
  const mo = MONTHS.indexOf(m[1].toLowerCase()); if (mo < 0) return null;
  const now = new Date(); let y = now.getFullYear();
  if (mo - now.getMonth() > 6) y--; else if (now.getMonth() - mo > 6) y++;
  let h = +m[3] % 12; if (/pm/i.test(m[5])) h += 12;
  const p = n => String(n).padStart(2, "0");
  return `${y}-${p(mo + 1)}-${p(+m[2])}T${p(h)}:${m[4]}`;   // Michigan local time
}
async function athletics(){
  const html = await get(ATHLETICS);
  const cards = html.split(/<a\s+class="score-ticker-card/).slice(1);
  const items = [];
  for (const c of cards){
    const href = (/href="([^"]+)"/.exec(c) || [])[1] || "";
    const heads = [...c.matchAll(/score-ticker-card-header[^>]*>([^<]*)</g)].map(x => text(x[1]));
    const names = [...c.matchAll(/score-ticker-card-participant-text[^>]*>([^<]*)</g)].map(x => text(x[1]));
    const scores = [...c.matchAll(/score-ticker-card-score-container[^>]*>([^<]*)</g)].map(x => text(x[1]));
    const at = when(heads[0]); if (!at || names.length < 2) continue;
    const [, g, lv, sport] = /^([BGC])?\s*(V|JV|F|\d+(?:st|nd|rd|th))?\s*(.*)$/i.exec(heads[1] || "") || [];
    if (lv && /^\d/.test(lv)) continue;   // middle school games stay off the ticker
    const teams = names.slice(0, 2).map((n, i) => ({name:n.replace(/\s+High School$/i, "").replace(/\s+Middle School$/i, " MS"), score:scores[i] === "" || scores[i] == null ? null : +scores[i]}));
    items.push({at, sport:[g === "B" ? "Boys" : g === "G" ? "Girls" : "", LEVELS[(lv || "").toUpperCase()] || "", sport].filter(Boolean).join(" "),
      home:teams[0], away:teams[1], final:teams.every(t => t.score !== null), link:href ? new URL(href, ATHLETICS).href : ""});
  }
  if (!items.length) throw new Error("No games found on hartlandeagles.com (page layout may have changed)");
  write("athletics.json", {updated:new Date().toISOString(), source:ATHLETICS, items:items.slice(0, 30)});
}

/* ---- Esports news (RSS) ---- */
async function news(){
  const items = [];
  for (const url of NEWS){
    const xml = await get(url);
    for (const it of xml.split(/<item[\s>]/).slice(1)){
      const title = text((/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(it) || [])[1]);
      const link = text((/<link>([\s\S]*?)<\/link>/.exec(it) || [])[1]);
      const date = new Date(text((/<pubDate>([\s\S]*?)<\/pubDate>/.exec(it) || [])[1]));
      if (!title || isNaN(date) || Date.now() - date > 4 * 864e5) continue;
      if (BLOCK.test(title)) continue;
      items.push({title, link, date:date.toISOString(), source:new URL(url).hostname.replace(/^www\./, "")});
    }
  }
  items.sort((a, b) => a.date < b.date ? 1 : -1);  // newest first
  write("news.json", {updated:new Date().toISOString(), items:items.slice(0, 10)});
}

for (const [name, fn] of [["athletics", athletics], ["news", news]]){
  try { await fn(); } catch(e){ console.log(`${name}: skipped (${e.message})`); }
}
