// Loads and indexes real-world data (OurAirports + Natural Earth, both public domain).
import airportsRaw from './gen/airports.json?raw';
import countriesRaw from './gen/countries.json?raw';
import citiesRaw from './gen/cities.json?raw';
import worldRaw from './gen/world.json?raw';
import landcoverRaw from './gen/landcover.json?raw';
import { haversine, bearing, FT, DEG, R_EARTH } from '../core/geo';

export interface Runway {
  id: string;             // "04L/22R"
  ends: [RunwayEnd, RunwayEnd];
  lengthM: number; widthM: number; hard: boolean; lighted: boolean;
}
export interface RunwayEnd {
  ident: string; lat: number; lon: number; hdg: number; // true heading of takeoff direction from this end
  dispM: number; other: RunwayEnd | null; rwy: Runway | null;
}
export interface Airport {
  icao: string; iata: string; name: string; city: string; country: string;
  lat: number; lon: number; elevFt: number; elevM: number; size: 0 | 1 | 2;
  runways: Runway[];
}
export interface City { name: string; country: string; lat: number; lon: number; pop: number; capital: boolean }
export interface Country { iso: string; name: string; continent: string; rings: Float32Array[]; label: [number, number]; bbox: [number, number, number, number] }

export interface Feature { bbox: [number, number, number, number]; pts: Float32Array; rank: number }

export const airports: Airport[] = [];
export const airportByIcao = new Map<string, Airport>();
export const cities: City[] = [];
export const countries: Country[] = [];
export const countryNames: Record<string, [string, string]> = {};
export const landcover = { rivers: [] as Feature[], lakes: [] as Feature[], urban: [] as Feature[], roads: [] as Feature[] };

function bboxOf(pts: ArrayLike<number>): [number, number, number, number] {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (let i = 0; i < pts.length; i += 2) { const x = pts[i], y = pts[i + 1]; if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  return [a, b, c, d];
}

/** Coarse 5° grid spatial index for vector features. */
class GridIndex<T extends { bbox: [number, number, number, number] }> {
  cells = new Map<number, T[]>();
  add(f: T) {
    const [a, b, c, d] = f.bbox;
    for (let x = Math.floor(a / 5); x <= Math.floor(c / 5); x++)
      for (let y = Math.floor(b / 5); y <= Math.floor(d / 5); y++) {
        const k = (x + 100) * 1000 + (y + 100); let l = this.cells.get(k); if (!l) this.cells.set(k, (l = [])); l.push(f);
      }
  }
  query(w: number, s: number, e: number, n: number): T[] {
    const out = new Set<T>();
    for (let x = Math.floor(w / 5); x <= Math.floor(e / 5); x++)
      for (let y = Math.floor(s / 5); y <= Math.floor(n / 5); y++) {
        const l = this.cells.get((x + 100) * 1000 + (y + 100)); if (!l) continue;
        for (const f of l) if (f.bbox[0] <= e && f.bbox[2] >= w && f.bbox[1] <= n && f.bbox[3] >= s) out.add(f);
      }
    return [...out];
  }
}
export const lcIndex = { rivers: new GridIndex<Feature>(), lakes: new GridIndex<Feature>(), urban: new GridIndex<Feature>(), roads: new GridIndex<Feature>() };

export async function loadWorld(progress: (f: number, msg: string) => void) {
  const tick = () => new Promise(r => setTimeout(r, 0));
  progress(0.05, 'Loading airports (OurAirports)…'); await tick();
  Object.assign(countryNames, JSON.parse(countriesRaw));
  for (const a of JSON.parse(airportsRaw) as any[]) {
    const ap: Airport = { icao: a[0], iata: a[1], name: a[2], city: a[3], country: a[4], lat: a[5], lon: a[6], elevFt: a[7], elevM: a[7] * FT, size: a[8], runways: [] };
    for (const r of a[9]) {
      const e1: RunwayEnd = { ident: r[0], lat: r[2], lon: r[3], hdg: 0, dispM: r[10] * FT, other: null, rwy: null };
      const e2: RunwayEnd = { ident: r[1], lat: r[4], lon: r[5], hdg: 0, dispM: r[11] * FT, other: null, rwy: null };
      e1.hdg = bearing(e1.lat, e1.lon, e2.lat, e2.lon); e2.hdg = bearing(e2.lat, e2.lon, e1.lat, e1.lon);
      e1.other = e2; e2.other = e1;
      const len = haversine(e1.lat, e1.lon, e2.lat, e2.lon);
      if (len < 300) continue;
      const rw: Runway = { id: `${r[0]}/${r[1]}`, ends: [e1, e2], lengthM: len, widthM: Math.max(18, Math.min(75, r[7] * FT)), hard: !!r[8], lighted: !!r[9] };
      e1.rwy = rw; e2.rwy = rw;
      ap.runways.push(rw);
    }
    if (!ap.runways.length) continue;
    airports.push(ap); airportByIcao.set(ap.icao, ap);
  }
  progress(0.25, 'Loading cities (Natural Earth)…'); await tick();
  for (const c of JSON.parse(citiesRaw) as any[]) cities.push({ name: c[0], country: c[1], lat: c[2], lon: c[3], pop: c[4], capital: !!c[5] });
  progress(0.4, 'Loading coastlines & borders…'); await tick();
  for (const c of JSON.parse(worldRaw) as any[]) {
    const rings = (c[2] as number[][]).map(r => new Float32Array(r));
    let bb: [number, number, number, number] = [1e9, 1e9, -1e9, -1e9];
    for (const r of rings) { const b = bboxOf(r); bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])]; }
    countries.push({ iso: c[0], name: c[1], continent: countryNames[c[0]]?.[1] ?? '', rings, label: c[3], bbox: bb });
  }
  progress(0.6, 'Loading rivers, lakes, highways, urban areas…'); await tick();
  const lc = JSON.parse(landcoverRaw);
  const mk = (pts: number[], rank = 0): Feature => { const f32 = new Float32Array(pts); return { bbox: bboxOf(f32), pts: f32, rank }; };
  for (const [rank, p] of lc.rivers) { const f = mk(p, rank); landcover.rivers.push(f); lcIndex.rivers.add(f); }
  for (const p of lc.lakes) { const f = mk(p); landcover.lakes.push(f); lcIndex.lakes.add(f); }
  for (const p of lc.urban) { const f = mk(p); landcover.urban.push(f); lcIndex.urban.add(f); }
  for (const [rank, p] of lc.roads) { const f = mk(p, rank); landcover.roads.push(f); lcIndex.roads.add(f); }
  progress(0.8, 'Indexing…'); await tick();
}

export function countryName(iso: string) { return countryNames[iso]?.[0] ?? countries.find(c => c.iso === iso)?.name ?? iso; }

export function nearestAirports(lat: number, lon: number, n = 10, maxM = 1e9) {
  const cosl = Math.cos(lat * DEG);
  return airports
    .map(a => ({ a, d2: ((a.lat - lat) ** 2 + ((a.lon - lon) * cosl) ** 2) }))
    .sort((x, y) => x.d2 - y.d2).slice(0, n * 3)
    .map(o => ({ a: o.a, d: haversine(lat, lon, o.a.lat, o.a.lon) }))
    .filter(o => o.d <= maxM).sort((x, y) => x.d - y.d).slice(0, n);
}
export function airportsNear(lat: number, lon: number, radiusM: number) {
  const dl = radiusM / (R_EARTH * DEG); const cosl = Math.max(0.05, Math.cos(lat * DEG));
  return airports.filter(a => Math.abs(a.lat - lat) < dl && Math.abs(a.lon - lon) * cosl < dl);
}
export function citiesNear(lat: number, lon: number, radiusM: number, minPop = 0) {
  const dl = radiusM / (R_EARTH * DEG); const cosl = Math.max(0.05, Math.cos(lat * DEG));
  return cities.filter(c => c.pop >= minPop && Math.abs(c.lat - lat) < dl && Math.abs(c.lon - lon) * cosl < dl);
}

export function pointInRing(x: number, y: number, r: ArrayLike<number>) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function countryAt(lat: number, lon: number): Country | null {
  for (const c of countries) {
    const b = c.bbox; if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
    for (const r of c.rings) if (pointInRing(lon, lat, r)) return c;
  }
  return null;
}

/** Global land mask, rasterized once from country polygons (fallback terrain + biome hints). */
export const landMask = { w: 2048, h: 1024, data: null as Uint8ClampedArray | null };
export function buildLandMask() {
  const cv = document.createElement('canvas'); cv.width = landMask.w; cv.height = landMask.h;
  const g = cv.getContext('2d')!; g.fillStyle = '#000'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#fff';
  for (const c of countries) for (const r of c.rings) {
    g.beginPath();
    for (let i = 0; i < r.length; i += 2) { const x = (r[i] + 180) / 360 * cv.width, y = (90 - r[i + 1]) / 180 * cv.height; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath(); g.fill();
  }
  landMask.data = g.getImageData(0, 0, cv.width, cv.height).data;
}
export function landAt(lat: number, lon: number) {
  if (!landMask.data) return 1;
  const fx = (lon + 180) / 360 * landMask.w - 0.5, fy = (90 - lat) / 180 * landMask.h - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const s = (x: number, y: number) => landMask.data![(((Math.max(0, Math.min(landMask.h - 1, y))) * landMask.w + ((x + landMask.w) % landMask.w)) * 4)] / 255;
  return (s(x0, y0) * (1 - tx) + s(x0 + 1, y0) * tx) * (1 - ty) + (s(x0, y0 + 1) * (1 - tx) + s(x0 + 1, y0 + 1) * tx) * ty;
}

/** Aridity 0..1 from known desert regions (lat, lon, radiusLat, radiusLon, strength). */
const DESERTS: [number, number, number, number, number][] = [
  [23, 8, 9, 22, 1], [27, 20, 7, 12, 1], [22, 47, 8, 10, 1], [27, 71, 3, 4, 0.8], [31, 58, 4, 8, 0.85], [40, 85, 4, 10, 0.9],
  [42, 105, 4, 10, 0.8], [-25, 130, 9, 14, 0.9], [-24, 18, 5, 5, 0.8], [-23, -69.5, 6, 1.8, 1], [34.5, -114, 4, 5, 0.75],
  [-44, -68, 6, 3, 0.6], [44, 62, 5, 10, 0.75], [8, 46, 4, 5, 0.7], [15, 32, 5, 8, 0.6], [39, -117, 3, 3, 0.6], [29, -104, 3, 3, 0.55],
  [-31, 137, 4, 6, 0.6], [24, 55, 3, 3, 0.9], [36, 40, 3, 4, 0.6], [17, 3, 4, 14, 0.7],
];
export function aridityAt(lat: number, lon: number) {
  let a = 0;
  for (const [la, lo, rl, ro, s] of DESERTS) {
    const d = ((lat - la) / rl) ** 2 + ((((lon - lo + 540) % 360) - 180) / ro) ** 2;
    if (d < 1.6) a = Math.max(a, s * Math.min(1, (1.6 - d) / 0.8));
  }
  return a;
}
