// Builds compact game data from public-domain sources:
//  - OurAirports (airports.csv, runways.csv, countries.csv)  — public domain
//  - Natural Earth 1:50m / 1:10m vector data                  — public domain
// Usage: node flight/tools/build-data.mjs <dir-with-downloaded-files>
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) { console.error('usage: build-data.mjs <srcdir>'); process.exit(1); }
const out = path.resolve('flight/src/data/gen');
fs.mkdirSync(out, { recursive: true });

// ---------- CSV ----------
function parseCSV(text) {
  const rows = []; let row = []; let f = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift();
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const rd = f => fs.readFileSync(path.join(src, f), 'utf8');
const r5 = v => Math.round(v * 1e5) / 1e5;
const r3 = v => Math.round(v * 1e3) / 1e3;
const r2 = v => Math.round(v * 1e2) / 1e2;

// ---------- Airports ----------
const countries = Object.fromEntries(parseCSV(rd('countries.csv')).map(c => [c.code, { name: c.name, cont: c.continent }]));
const allAp = parseCSV(rd('airports.csv'));
const rw = parseCSV(rd('runways.csv'));
const rwBy = {};
for (const r of rw) {
  if (r.closed === '1') continue;
  if (!r.le_latitude_deg || !r.he_latitude_deg) continue;
  (rwBy[r.airport_ident] ||= []).push(r);
}
const hard = s => /ASP|CON|PEM|BIT|ASF|CONC|PAV/i.test(s);
// hand-picked scenic / GA airports included regardless of type
const extra = new Set(['LOWI', 'NZQN', 'LPMA', 'LSGS', 'KSMO', 'KVNY', 'KPAO', 'EGLC', 'LFMN', 'TNCM', 'LXGB', 'VNKT', 'PHNL', 'PHOG', 'KASE', 'KEGE', 'KTEB', 'KHPN', 'EGKB', 'LSZS', 'LFLB', 'KMRY', 'KSBA', 'KPSP', 'KSNA', 'KBUR', 'KOAK', 'KSJC', 'KHAF', 'KCCR', 'KLVK', 'KRHV', 'KAPC', 'KNUQ']);
const airports = [];
for (const a of allAp) {
  const rws = rwBy[a.ident];
  if (!rws) continue;
  const isLarge = a.type === 'large_airport';
  const isMed = a.type === 'medium_airport' && a.scheduled_service === 'yes';
  if (!isLarge && !extra.has(a.ident)) {
    if (!isMed) continue;
    const longHard = rws.some(r => hard(r.surface) && +r.length_ft >= 7000);
    if (!longHard) continue;
  }
  const runways = rws.filter(r => +r.length_ft >= 1500 && (hard(r.surface) || +r.length_ft > 4000)).map(r => [
    r.le_ident, r.he_ident, r5(+r.le_latitude_deg), r5(+r.le_longitude_deg), r5(+r.he_latitude_deg), r5(+r.he_longitude_deg),
    +r.length_ft || 0, +r.width_ft || 150, hard(r.surface) ? 1 : 0, r.lighted === '1' ? 1 : 0,
    +r.le_displaced_threshold_ft || 0, +r.he_displaced_threshold_ft || 0,
  ]);
  if (!runways.length) continue;
  airports.push([a.ident, a.iata_code || '', a.name, a.municipality || '', a.iso_country, r5(+a.latitude_deg), r5(+a.longitude_deg), +a.elevation_ft || 0, isLarge ? 2 : extra.has(a.ident) && !isMed ? 0 : 1, runways]);
}
fs.writeFileSync(path.join(out, 'airports.json'), JSON.stringify(airports));
const usedC = new Set(airports.map(a => a[4]));
const cOut = {}; for (const c of usedC) if (countries[c]) cOut[c] = [countries[c].name, countries[c].cont];
fs.writeFileSync(path.join(out, 'countries.json'), JSON.stringify(cOut));
console.log('airports', airports.length, 'countries', Object.keys(cOut).length);

// ---------- Geometry helpers ----------
function dp(pts, eps) { // Douglas–Peucker
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay; const L = dx * dx + dy * dy || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L));
      const ex = ax + t * dx - pts[i][0], ey = ay + t * dy - pts[i][1]; const d = ex * ex + ey * ey;
      if (d > md) { md = d; mi = i; }
    }
    if (md > eps * eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const flat = (pts, q) => pts.flatMap(p => [q(p[0]), q(p[1])]);
function lines(geom) {
  if (!geom) return [];
  if (geom.type === 'LineString') return [geom.coordinates];
  if (geom.type === 'MultiLineString') return geom.coordinates;
  return [];
}
function polys(geom) {
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}
const gj = f => JSON.parse(rd(f)).features;

// Countries (for world map + land mask fallback): [iso2, name, [[ring flat]...]]
const ctry = [];
for (const f of gj('ne_50m_admin_0_countries.geojson')) {
  const p = f.properties; let iso = p.ISO_A2_EH || p.ISO_A2; if (!iso || iso === '-99') iso = p.ADM0_A3;
  const rings = [];
  for (const poly of polys(f.geometry)) { const r = dp(poly[0], 0.03); if (r.length >= 4) rings.push(flat(r, r2)); }
  ctry.push([iso, p.NAME, rings, [r2(p.LABEL_X ?? 0), r2(p.LABEL_Y ?? 0)]]);
}
fs.writeFileSync(path.join(out, 'world.json'), JSON.stringify(ctry));

// Cities
const cities = gj('ne_50m_populated_places_simple.geojson').map(f => {
  const p = f.properties; return [p.name, p.iso_a2, r3(p.latitude), r3(p.longitude), p.pop_max | 0, p.adm0cap ? 1 : 0];
}).filter(c => c[4] > 0).sort((a, b) => b[4] - a[4]);
fs.writeFileSync(path.join(out, 'cities.json'), JSON.stringify(cities));

// Vector landcover: rivers (lines), lakes (polys), urban (polys), roads (lines)
const vec = { rivers: [], lakes: [], urban: [], roads: [] };
for (const f of gj('ne_50m_rivers_lake_centerlines.geojson')) for (const l of lines(f.geometry)) { const s = dp(l, 0.005); if (s.length > 1) vec.rivers.push([f.properties.scalerank ?? 5, flat(s, r3)]); }
for (const f of gj('ne_50m_lakes.geojson')) for (const p of polys(f.geometry)) { const s = dp(p[0], 0.005); if (s.length > 3) vec.lakes.push(flat(s, r3)); }
for (const f of gj('ne_50m_urban_areas.geojson')) for (const p of polys(f.geometry)) { const s = dp(p[0], 0.004); if (s.length > 3) vec.urban.push(flat(s, r3)); }
for (const f of gj('ne_10m_roads.geojson')) {
  const p = f.properties; if (p.type !== 'Major Highway' && !(p.type === 'Secondary Highway' && p.scalerank <= 5)) continue;
  for (const l of lines(f.geometry)) { const s = dp(l, 0.006); if (s.length > 1) vec.roads.push([p.type === 'Major Highway' ? 1 : 0, flat(s, r3)]); }
}
fs.writeFileSync(path.join(out, 'landcover.json'), JSON.stringify(vec));
for (const f of fs.readdirSync(out)) console.log(f, (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' KB');
