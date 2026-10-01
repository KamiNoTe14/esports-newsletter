// Copies finished matches from Firestore into data/matches/<season>.json (plus data/matches/index.json).
// Uses the public read access the website uses, so no secrets are needed.
// Never deletes anything: if Firestore can't be reached or returns nothing, files are left alone.
import fs from "node:fs";
import path from "node:path";

const PROJECT = "hartland-esports";
const KEY = "AIzaSyAcJVvVCfWZ0d_ykE2QtI4PbP3WHFpCblA";
const DIR = "data/matches";
const BASE = process.env.FIRESTORE_BASE || `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/matches`;

const val = x => x == null ? null : "stringValue" in x ? x.stringValue : "integerValue" in x ? Number(x.integerValue)
  : "doubleValue" in x ? x.doubleValue : "booleanValue" in x ? x.booleanValue : "nullValue" in x ? null
  : "timestampValue" in x ? x.timestampValue : "arrayValue" in x ? (x.arrayValue.values || []).map(val)
  : "mapValue" in x ? Object.fromEntries(Object.entries(x.mapValue.fields || {}).map(([k, v]) => [k, val(v)])) : null;

async function all(){
  const out = []; let token = "";
  do {
    const r = await fetch(`${BASE}?pageSize=300&key=${KEY}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
    if (!r.ok) throw new Error(`Firestore ${r.status}: ${await r.text()}`);
    const j = await r.json();
    (j.documents || []).forEach(d => out.push({id:d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, val(v)]))}));
    token = j.nextPageToken || "";
  } while (token);
  return out;
}

const docs = await all();
console.log(`Read ${docs.length} matches from Firestore`);
const finals = docs.filter(m => m.status === "final" && m.season).map(({updatedBy, ...m}) => m);
fs.mkdirSync(DIR, {recursive:true});
const bySeason = {};
finals.forEach(m => (bySeason[m.season] = bySeason[m.season] || []).push(m));
let changed = 0;
for (const [season, list] of Object.entries(bySeason)){
  if (!/^\d{4}-\d{2}$/.test(season)) continue;
  list.sort((a, b) => a.startsAt < b.startsAt ? -1 : 1);
  const file = path.join(DIR, `${season}.json`);
  let old = null; try { old = JSON.parse(fs.readFileSync(file, "utf8")); } catch(e){}
  if (old && JSON.stringify(old.matches) === JSON.stringify(list)) continue;
  fs.writeFileSync(file, JSON.stringify({season, updated:new Date().toISOString(), matches:list}, null, 2) + "\n");
  changed++; console.log(`Wrote ${file} (${list.length} finals)`);
}
const seasons = fs.readdirSync(DIR).map(f => (f.match(/^(\d{4}-\d{2})\.json$/) || [])[1]).filter(Boolean).sort().reverse();
const idx = path.join(DIR, "index.json"), want = JSON.stringify({seasons}, null, 2) + "\n";
let have = ""; try { have = fs.readFileSync(idx, "utf8"); } catch(e){}
if (have !== want){ fs.writeFileSync(idx, want); changed++; }
console.log(changed ? `${changed} file(s) updated` : "No changes");
