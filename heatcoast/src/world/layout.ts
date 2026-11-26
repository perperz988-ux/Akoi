import { clamp, fbm, hash2, lerp, smoothstep } from '../core/math';

/**
 * BAHÍA VERDE — the procedural (but deterministic) layout of the whole map.
 * 4 km x 4 km: ocean to the east, a beach strip, resort mile, downtown towers,
 * midtown, suburbs, the industrial port, an airport, highways, the small town of
 * Palmetto Springs, rural flats and the Gator Bend swamp.
 */
export const HALF = 2048;
export const SIZE = HALF * 2;
export const WATER_Y = -0.4;
export const LANE_W = 3.5;
export const SIDEWALK_W = 3;

export enum Zone { Ocean, Beach, Downtown, Midtown, Resort, Suburb, Industrial, Airport, Town, Rural, Swamp, Park }
export const ZONE_NAMES: Record<Zone, string> = {
  [Zone.Ocean]: 'Atlantic Waters', [Zone.Beach]: 'Sunline Beach', [Zone.Downtown]: 'Downtown Bahía', [Zone.Midtown]: 'Calle Verde',
  [Zone.Resort]: 'Coral Mile', [Zone.Suburb]: 'Palm Grove', [Zone.Industrial]: 'Port Lázaro', [Zone.Airport]: 'Bahía Verde Intl.',
  [Zone.Town]: 'Palmetto Springs', [Zone.Rural]: 'Sawgrass Flats', [Zone.Swamp]: 'Gator Bend Bayou', [Zone.Park]: 'Bayfront Park',
};

export const coastX = (z: number) => 1565 + 35 * Math.sin(z / 260) + 18 * Math.sin(z / 97 + 1.3);
export const AIRPORT = { x0: -1960, x1: -1000, z0: -1960, z1: -1180 };
export const TOWN = { x0: -1720, x1: -1380, z0: -560, z1: -90 };
export const DOWNTOWN_C = { x: 448, z: -64 };

export function zoneAt(x: number, z: number): Zone {
  const cx = coastX(z);
  if (x > cx || Math.abs(z) > 1990 || x < -1990) return Zone.Ocean;
  if (x > cx - 85) return Zone.Beach;
  if (x > AIRPORT.x0 && x < AIRPORT.x1 && z > AIRPORT.z0 && z < AIRPORT.z1) return Zone.Airport;
  if (x > TOWN.x0 && x < TOWN.x1 && z > TOWN.z0 && z < TOWN.z1) return Zone.Town;
  if (x < -660) return z > 560 ? Zone.Swamp : Zone.Rural;
  if (isParkBlockAt(x, z)) return Zone.Park;
  if (Math.hypot(x - DOWNTOWN_C.x, z - DOWNTOWN_C.z) < 400) return Zone.Downtown;
  if (x > 1150 && z < 820) return Zone.Resort;
  if (z < -700) return Zone.Suburb;
  if (z > 830 && x > 190) return Zone.Industrial;
  if (z > 640) return Zone.Suburb;
  return Zone.Midtown;
}

// ------------------------------------------------------------------------------------------- roads
export type RoadKind = 'city' | 'highway' | 'rural' | 'dirt';
export interface Seg { axis: 'x' | 'z'; c: number; a: number; b: number; lanes: number; kind: RoadKind; sidewalk: boolean; name: string }
export const GRID_X: number[] = []; for (let x = -640; x <= 1408; x += 128) GRID_X.push(x);
export const GRID_Z: number[] = []; for (let z = -1408; z <= 1408; z += 128) GRID_Z.push(z);
export const TOWN_X = [-1664, -1536, -1408];
export const TOWN_Z = [-512, -384, -256, -128];

const AVE = ['Mangrove', 'Pelican', 'Cortez', 'Sabal', 'Biscayne', 'Ibis', 'Flamingo', 'Coquina', 'Magnolia', 'Tarpon', 'Solé', 'Manatee', 'Seagrape', 'Hibiscus', 'Bougainvillea', 'Atlantic', 'Ocean'];
export const SEGS: Seg[] = [];
{
  const S = (s: Seg) => SEGS.push(s);
  GRID_X.forEach((x, i) => {
    const big = i % 4 === 0 || x === 1408;
    S({ axis: 'x', c: x, a: -1408, b: 1408, lanes: big ? 2 : 1, kind: 'city', sidewalk: true, name: x === 1408 ? 'Ocean Drive' : `${AVE[i]} Ave` });
    if (big) { S({ axis: 'x', c: x, a: -1536, b: -1408, lanes: 2, kind: 'city', sidewalk: false, name: `${AVE[i]} Ave` }); S({ axis: 'x', c: x, a: 1408, b: 1536, lanes: 2, kind: 'city', sidewalk: false, name: `${AVE[i]} Ave` }); }
  });
  GRID_Z.forEach((z, j) => {
    const big = j % 4 === 3;
    S({ axis: 'z', c: z, a: -640, b: 1408, lanes: big ? 2 : 1, kind: 'city', sidewalk: true, name: `${ordinal(Math.abs(j - 11) + 1)} St` });
  });
  // highways
  S({ axis: 'x', c: -896, a: -1856, b: 1856, lanes: 3, kind: 'highway', sidewalk: false, name: 'Interstate 7' });
  S({ axis: 'z', c: -1536, a: -896, b: 1408, lanes: 3, kind: 'highway', sidewalk: false, name: 'Causeway Expwy' });
  S({ axis: 'z', c: 1536, a: -896, b: 1408, lanes: 3, kind: 'highway', sidewalk: false, name: 'Port Expwy' });
  // rural links
  S({ axis: 'z', c: -256, a: -1664, b: -640, lanes: 1, kind: 'rural', sidewalk: false, name: 'Old Palmetto Rd' });
  S({ axis: 'z', c: 512, a: -896, b: -640, lanes: 1, kind: 'rural', sidewalk: false, name: 'Canal Rd' });
  S({ axis: 'z', c: -1152, a: -1040, b: -640, lanes: 2, kind: 'city', sidewalk: false, name: 'Airport Blvd' });
  S({ axis: 'x', c: -1536, a: -1150, b: -512, lanes: 1, kind: 'rural', sidewalk: false, name: 'Terminal Rd' });
  S({ axis: 'z', c: -1152, a: -1536, b: -1040, lanes: 2, kind: 'city', sidewalk: false, name: 'Airport Blvd' });
  S({ axis: 'x', c: -1280, a: -256, b: 1024, lanes: 1, kind: 'rural', sidewalk: false, name: 'Cypress Ln' });
  S({ axis: 'z', c: 1024, a: -1792, b: -640, lanes: 1, kind: 'dirt', sidewalk: false, name: 'Bayou Trail' });
  S({ axis: 'x', c: -1792, a: 1024, b: 1600, lanes: 1, kind: 'dirt', sidewalk: false, name: 'Gator Bend Rd' });
  S({ axis: 'x', c: -1280, a: 1024, b: 1480, lanes: 1, kind: 'dirt', sidewalk: false, name: 'Heron Loop' });
  // town grid
  for (const x of TOWN_X) S({ axis: 'x', c: x, a: -512, b: -128, lanes: 1, kind: 'city', sidewalk: true, name: x === -1536 ? 'Main St' : 'Palm St' });
  for (const z of TOWN_Z) if (z !== -256) S({ axis: 'z', c: z, a: -1664, b: -1408, lanes: 1, kind: 'city', sidewalk: true, name: 'Orange Ave' });
}
function ordinal(n: number) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
export const segHalfWidth = (s: Seg) => s.lanes * LANE_W + 0.6;

// ------------------------------------------------------------------------------------------- road graph
export interface RNode { id: number; x: number; z: number; edges: number[]; light: boolean; phase: number; hw: number }
export interface REdge { id: number; a: number; b: number; len: number; lanes: number; hw: number; axis: 'x' | 'z'; kind: RoadKind; sidewalk: boolean; speed: number; name: string }
export const NODES: RNode[] = [];
export const EDGES: REdge[] = [];
{
  const key = (x: number, z: number) => `${Math.round(x)},${Math.round(z)}`;
  const map = new Map<string, number>();
  const node = (x: number, z: number) => { const k = key(x, z); let id = map.get(k); if (id === undefined) { id = NODES.length; NODES.push({ id, x, z, edges: [], light: false, phase: 0, hw: 0 }); map.set(k, id); } return id; };
  for (const s of SEGS) {
    const cuts = new Set<number>([s.a, s.b]);
    for (const o of SEGS) {
      if (o.axis === s.axis) { if (o.c === s.c) { if (o.a > s.a && o.a < s.b) cuts.add(o.a); if (o.b > s.a && o.b < s.b) cuts.add(o.b); } continue; }
      if (o.c >= s.a && o.c <= s.b && s.c >= o.a && s.c <= o.b) cuts.add(o.c);
    }
    const arr = [...cuts].sort((p, q) => p - q);
    for (let k = 0; k < arr.length - 1; k++) {
      const p = arr[k], q = arr[k + 1]; if (q - p < 1) continue;
      const a = s.axis === 'x' ? node(s.c, p) : node(p, s.c), b = s.axis === 'x' ? node(s.c, q) : node(q, s.c);
      const hw = segHalfWidth(s);
      const e: REdge = { id: EDGES.length, a, b, len: q - p, lanes: s.lanes, hw, axis: s.axis, kind: s.kind, sidewalk: s.sidewalk, speed: s.kind === 'highway' ? 30 : s.kind === 'dirt' ? 11 : s.kind === 'rural' ? 19 : s.lanes > 1 ? 16 : 13, name: s.name };
      EDGES.push(e); NODES[a].edges.push(e.id); NODES[b].edges.push(e.id);
      NODES[a].hw = Math.max(NODES[a].hw, hw); NODES[b].hw = Math.max(NODES[b].hw, hw);
    }
  }
  for (const n of NODES) { n.light = n.edges.length >= 3 && EDGES[n.edges[0]].kind !== 'highway' && (EDGES[n.edges[0]].kind === 'city' || n.edges.some((e) => EDGES[e].kind === 'city')) && n.edges.length >= 4; n.phase = hash2(n.x, n.z, 3) * 30; }
}
export const otherEnd = (e: REdge, n: number) => (e.a === n ? e.b : e.a);
/** Traffic-light state for an approach along `axis`: 'g' | 'y' | 'r'. */
export function lightState(n: RNode, axis: 'x' | 'z', t: number): 'g' | 'y' | 'r' {
  if (!n.light) return 'g';
  const c = (t + n.phase) % 30; // 0-12 green for x-axis roads, 12-15 yellow, 15-27 green z, 27-30 yellow
  if (axis === 'x') return c < 12 ? 'g' : c < 15 ? 'y' : 'r';
  return c >= 15 && c < 27 ? 'g' : c >= 27 ? 'y' : 'r';
}

const NODE_GRID = new Map<string, number[]>();
for (const n of NODES) { const k = `${Math.floor(n.x / 200)},${Math.floor(n.z / 200)}`; (NODE_GRID.get(k) ?? NODE_GRID.set(k, []).get(k)!).push(n.id); }
export function nearestNode(x: number, z: number): RNode {
  let best = NODES[0], bd = 1e18;
  const cx = Math.floor(x / 200), cz = Math.floor(z / 200);
  for (let r = 0; r < 6; r++) {
    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      for (const id of NODE_GRID.get(`${cx + i},${cz + j}`) ?? []) { const n = NODES[id]; const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n; } }
    }
    if (bd < ((r) * 200) ** 2) break;
  }
  return best;
}
/** Closest point on the road network (edge centre line). */
export function nearestRoad(x: number, z: number): { e: REdge; t: number; d: number; px: number; pz: number } {
  let best = { e: EDGES[0], t: 0, d: 1e9, px: 0, pz: 0 };
  for (const e of EDGES) {
    const A = NODES[e.a], B = NODES[e.b];
    if (e.axis === 'x') { if (z < A.z - 60 || z > B.z + 60) continue; const t = clamp(z, A.z, B.z); const d = Math.hypot(x - A.x, z - t); if (d < best.d) best = { e, t: (t - A.z) / e.len, d, px: A.x, pz: t }; }
    else { if (x < A.x - 60 || x > B.x + 60) continue; const t = clamp(x, A.x, B.x); const d = Math.hypot(x - t, z - A.z); if (d < best.d) best = { e, t: (t - A.x) / e.len, d, px: t, pz: A.z }; }
  }
  return best;
}
export function roadDist(x: number, z: number) {
  let d = 1e9;
  for (const s of SEGS) {
    if (s.axis === 'x') d = Math.min(d, Math.hypot(x - s.c, z - clamp(z, s.a, s.b)) - segHalfWidth(s));
    else d = Math.min(d, Math.hypot(z - s.c, x - clamp(x, s.a, s.b)) - segHalfWidth(s));
  }
  return d;
}
export function onRoadInfo(x: number, z: number): Seg | null {
  for (const s of SEGS) {
    const hw = segHalfWidth(s);
    if (s.axis === 'x') { if (Math.abs(x - s.c) <= hw && z >= s.a - hw && z <= s.b + hw) return s; }
    else if (Math.abs(z - s.c) <= hw && x >= s.a - hw && x <= s.b + hw) return s;
  }
  return null;
}
export function streetName(x: number, z: number) { const r = nearestRoad(x, z); return r.d < 40 ? r.e.name : ''; }

/** A* route over the road graph (for GPS & AI). */
export function route(fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] {
  const s = nearestNode(fx, fz), t = nearestNode(tx, tz);
  const open = new Map<number, number>([[s.id, 0]]); const g = new Map<number, number>([[s.id, 0]]); const from = new Map<number, number>();
  const hh = (n: RNode) => Math.hypot(n.x - t.x, n.z - t.z);
  let guard = 0;
  while (open.size && guard++ < 6000) {
    let cur = -1, cf = 1e18; for (const [id, f] of open) if (f < cf) { cf = f; cur = id; }
    open.delete(cur);
    if (cur === t.id) break;
    const cn = NODES[cur];
    for (const eid of cn.edges) {
      const e = EDGES[eid], nb = otherEnd(e, cur); const cost = (g.get(cur) ?? 0) + e.len * (e.kind === 'highway' ? 0.6 : e.kind === 'dirt' ? 1.4 : 1);
      if (cost < (g.get(nb) ?? 1e18)) { g.set(nb, cost); from.set(nb, cur); open.set(nb, cost + hh(NODES[nb])); }
    }
  }
  const out: { x: number; z: number }[] = [{ x: tx, z: tz }];
  let c: number | undefined = t.id; let k = 0;
  while (c !== undefined && k++ < 2000) { out.push({ x: NODES[c].x, z: NODES[c].z }); if (c === s.id) break; c = from.get(c); }
  out.push({ x: fx, z: fz });
  return out.reverse();
}

// ------------------------------------------------------------------------------------------- terrain
export const HRES = 16;
export const HN = SIZE / HRES + 1; // 257 samples per side
export const HEIGHTS = new Float32Array(HN * HN);
let parkBlocks: { x0: number; x1: number; z0: number; z1: number }[] = [];
export function isParkBlockAt(x: number, z: number) { for (const p of parkBlocks) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return true; return false; }
{
  // pick park blocks
  for (let i = 0; i < GRID_X.length - 1; i++) for (let j = 0; j < GRID_Z.length - 1; j++) {
    const x0 = GRID_X[i], x1 = GRID_X[i + 1], z0 = GRID_Z[j], z1 = GRID_Z[j + 1], cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const special = (i === 5 && j === 13) || (i === 13 && j === 2) || (i === 9 && j === 16);
    if (special || (hash2(i, j, 41) < 0.045 && Math.hypot(cx - DOWNTOWN_C.x, cz - DOWNTOWN_C.z) > 380 && cx < 1150)) parkBlocks.push({ x0: x0 + 8, x1: x1 - 8, z0: z0 + 8, z1: z1 - 8 });
  }
}
function rawHeight(x: number, z: number, rd: number) {
  const cx = coastX(z), d = cx - x;
  if (d < 85) { // beach & ocean
    if (d < 0) return clamp(-0.9 + d * 0.07, -12, -0.9);
    return lerp(-0.9, 0.05, smoothstep(0, 85, d));
  }
  if (Math.abs(z) > 1940 || x < -1940) { const e = Math.max(Math.abs(z) - 1940, -1940 - x); return -0.9 - e * 0.08; }
  const zone = zoneAt(x, z);
  if (zone === Zone.Swamp) {
    const p = fbm(x / 95, z / 95, 3, 9) + (fbm(x / 30, z / 30, 2, 4) - 0.5) * 0.08;
    const keep = smoothstep(6, 34, rd);
    const base = 0.12 + (fbm(x / 50, z / 50, 2, 3) - 0.5) * 0.4;
    return p > 0.53 ? lerp(base, WATER_Y - 0.25 - (p - 0.53) * 9, keep) : base * keep;
  }
  if (zone === Zone.Rural) { const hills = (fbm(x / 420, z / 420, 4, 2) - 0.45) * 22; return Math.max(0, hills) * smoothstep(18, 110, rd) + 0.0; }
  return 0;
}
{
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const x = -HALF + i * HRES, z = -HALF + j * HRES;
    const rd = x < -600 ? roadDist(x, z) : 100;
    HEIGHTS[j * HN + i] = rawHeight(x, z, rd);
  }
}
export function heightAt(x: number, z: number) {
  const fx = clamp((x + HALF) / HRES, 0, HN - 1.001), fz = clamp((z + HALF) / HRES, 0, HN - 1.001);
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
  const a = HEIGHTS[j * HN + i], b = HEIGHTS[j * HN + i + 1], c = HEIGHTS[(j + 1) * HN + i], d = HEIGHTS[(j + 1) * HN + i + 1];
  // match the triangle split used by PlaneGeometry (a-c-b, c-d-b)
  if (u + v < 1) return a + (b - a) * u + (c - a) * v;
  return d + (c - d) * (1 - u) + (b - d) * (1 - v);
}
export const isWater = (x: number, z: number) => heightAt(x, z) < WATER_Y - 0.25;
export const waterDepth = (x: number, z: number) => Math.max(0, WATER_Y - heightAt(x, z));

// ------------------------------------------------------------------------------------------- POIs
export type PoiKind = 'safehouse' | 'gas' | 'store' | 'diner' | 'gunshop' | 'clothes' | 'garage' | 'hotel' | 'club' | 'police' | 'hospital' | 'bank' | 'restaurant' | 'airport' | 'bar';
export interface Poi { id: string; name: string; kind: PoiKind; x: number; z: number; w: number; d: number; h: number; door: { x: number; z: number }; face: number; color: number; open: [number, number]; interior?: 'store' | 'diner' | 'apartment' }
export const POIS: Poi[] = [];
function blockInner(i: number, j: number) {
  const x0 = GRID_X[i], x1 = GRID_X[i + 1], z0 = GRID_Z[j], z1 = GRID_Z[j + 1];
  const m = 13; return { x0: x0 + m, x1: x1 - m, z0: z0 + m, z1: z1 - m };
}
/** Put a POI building against one side of a block. side: 'n' = -z road, 's' = +z, 'w' = -x, 'e' = +x */
function placePoi(p: Omit<Poi, 'x' | 'z' | 'door' | 'face'>, rect: { x0: number; x1: number; z0: number; z1: number }, side: 'n' | 's' | 'e' | 'w', along = 0.5) {
  let x = 0, z = 0, face = 0, door = { x: 0, z: 0 };
  if (side === 'n' || side === 's') { x = lerp(rect.x0 + p.w / 2, rect.x1 - p.w / 2, along); z = side === 'n' ? rect.z0 + p.d / 2 : rect.z1 - p.d / 2; face = side === 'n' ? Math.PI : 0; door = { x, z: z + (side === 'n' ? -p.d / 2 - 1.2 : p.d / 2 + 1.2) }; }
  else { z = lerp(rect.z0 + p.d / 2, rect.z1 - p.d / 2, along); x = side === 'w' ? rect.x0 + p.w / 2 : rect.x1 - p.w / 2; face = side === 'w' ? -Math.PI / 2 : Math.PI / 2; door = { x: x + (side === 'w' ? -p.w / 2 - 1.2 : p.w / 2 + 1.2), z }; }
  POIS.push({ ...p, x, z, door, face });
}
const G = (n: number) => GRID_X.indexOf(n), GZ = (n: number) => GRID_Z.indexOf(n);
{
  const all: [number, number] = [0, 24];
  // Palmetto Springs (town) — the duo's motel hideout
  const tb = (x0: number, z0: number) => ({ x0: x0 + 9, x1: x0 + 128 - 9, z0: z0 + 9, z1: z0 + 128 - 9 });
  placePoi({ id: 'motel', name: 'Sunset Palms Motel', kind: 'safehouse', w: 34, d: 14, h: 7, color: 0xf2b8a0, open: all, interior: 'apartment' }, tb(-1664, -384), 'e', 0.5);
  placePoi({ id: 'diner_town', name: 'Flamingo Diner', kind: 'diner', w: 20, d: 14, h: 6, color: 0xf6f0e6, open: [6, 23], interior: 'diner' }, tb(-1536, -384), 'w', 0.35);
  placePoi({ id: 'store_town', name: 'Quik Mart', kind: 'store', w: 16, d: 14, h: 5.5, color: 0xe8e2d0, open: all, interior: 'store' }, tb(-1536, -512), 'w', 0.5);
  placePoi({ id: 'gas_town', name: 'Gulfstar Fuel', kind: 'gas', w: 12, d: 10, h: 4.5, color: 0xf2f2f2, open: all, interior: 'store' }, tb(-1664, -256), 'e', 0.5);
  placePoi({ id: 'bar_town', name: 'Rusty Spur Saloon', kind: 'bar', w: 16, d: 14, h: 6, color: 0x8a5a3a, open: [16, 4] }, tb(-1536, -256), 'w', 0.6);
  // City
  const B = (x: number, z: number) => blockInner(G(x), GZ(z));
  placePoi({ id: 'apt', name: 'Vista Towers Apartments', kind: 'safehouse', w: 30, d: 26, h: 48, color: 0xdfe8ee, open: all, interior: 'apartment' }, B(256, 128), 'w', 0.5);
  placePoi({ id: 'gas_city', name: 'Gulfstar Fuel', kind: 'gas', w: 12, d: 10, h: 4.5, color: 0xf2f2f2, open: all, interior: 'store' }, B(0, -768), 'w', 0.5);
  placePoi({ id: 'gas_port', name: 'Gulfstar Fuel', kind: 'gas', w: 12, d: 10, h: 4.5, color: 0xf2f2f2, open: all, interior: 'store' }, B(640, 1024), 'n', 0.3);
  placePoi({ id: 'store_mid', name: 'Quik Mart', kind: 'store', w: 16, d: 14, h: 5.5, color: 0xe8e2d0, open: all, interior: 'store' }, B(-128, 0), 'n', 0.5);
  placePoi({ id: 'guns', name: 'Liberty Arms', kind: 'gunshop', w: 18, d: 14, h: 6, color: 0x5d6b78, open: [8, 22], interior: 'store' }, B(-256, 256), 'e', 0.5);
  placePoi({ id: 'clothes', name: 'Threadline', kind: 'clothes', w: 22, d: 16, h: 9, color: 0xf4efe6, open: [9, 22], interior: 'store' }, B(640, -256), 'n', 0.5);
  placePoi({ id: 'garage', name: 'Pit Stop Customs', kind: 'garage', w: 26, d: 18, h: 8, color: 0x3c4a5a, open: all }, B(128, 512), 'n', 0.5);
  placePoi({ id: 'hotel', name: 'Hotel Coralina', kind: 'hotel', w: 40, d: 30, h: 64, color: 0xf7f1e4, open: all }, B(1280, -384), 'e', 0.5);
  placePoi({ id: 'club', name: 'Velvet Room', kind: 'club', w: 30, d: 22, h: 12, color: 0x2a1838, open: [20, 5] }, B(1152, 0), 'e', 0.5);
  placePoi({ id: 'police', name: 'BVPD Central Station', kind: 'police', w: 40, d: 24, h: 16, color: 0xcfd6dc, open: all }, B(0, 128), 'n', 0.5);
  placePoi({ id: 'hospital', name: 'Mercy Shores Hospital', kind: 'hospital', w: 46, d: 30, h: 30, color: 0xf0f3f5, open: all }, B(-384, -256), 'e', 0.5);
  placePoi({ id: 'bank', name: 'Gulf Coast Savings', kind: 'bank', w: 30, d: 24, h: 22, color: 0xd8cfc0, open: [8, 18] }, B(512, 0), 'n', 0.5);
  placePoi({ id: 'casa', name: 'Casa Lupe', kind: 'restaurant', w: 18, d: 14, h: 6, color: 0xf2c26b, open: [10, 24], interior: 'diner' }, B(896, 256), 'n', 0.5);
  placePoi({ id: 'gas_hwy', name: 'Gulfstar Fuel', kind: 'gas', w: 12, d: 10, h: 4.5, color: 0xf2f2f2, open: all, interior: 'store' }, { x0: -1000, x1: -930, z0: 560, z1: 620 }, 'e', 0.5);
  placePoi({ id: 'gator', name: "Gator's Rest", kind: 'bar', w: 14, d: 12, h: 5, color: 0x6b4a2e, open: [12, 3] }, { x0: -1500, x1: -1420, z0: 1040, z1: 1100 }, 'n', 0.5);
  placePoi({ id: 'terminal', name: 'BVI Terminal', kind: 'airport', w: 160, d: 40, h: 18, color: 0xdfe6ea, open: all }, { x0: -1620, x1: -1440, z0: -1240, z1: -1192 }, 's', 0.5);
}
export const poiById = (id: string) => POIS.find((p) => p.id === id)!;

// ------------------------------------------------------------------------------------------- buildings
export interface Bldg { x0: number; x1: number; z0: number; z1: number; h: number; color: number; style: number; zone: Zone; roof: number; stilts?: boolean; poi?: string }
export const BUILDINGS: Bldg[] = [];
export interface Spot { x: number; z: number; kind: 'palm' | 'tree' | 'cypress' | 'bush' | 'container' | 'bench' | 'parked' | 'pine'; r: number; yaw?: number; c?: number }
export const SPOTS: Spot[] = [];

const PASTEL = [0xf6d6c8, 0xf3e3b5, 0xc9e7e0, 0xf7f3ea, 0xe8c8d8, 0xd8e6f2, 0xf4cfa4, 0xe7ecd9, 0xfaf0e0];
const DT = [0x9fb3c2, 0x6e8594, 0xc9d3db, 0x40566a, 0x8aa0a8, 0xb7c2ca, 0x2f3d4a, 0xd5dbe0];
const IND = [0x8d9399, 0x6f7f8c, 0xa59f8f, 0x5d6d72, 0x9b8b70];
function overlapsPoi(x0: number, x1: number, z0: number, z1: number) {
  for (const p of POIS) if (x1 > p.x - p.w / 2 - 3 && x0 < p.x + p.w / 2 + 3 && z1 > p.z - p.d / 2 - 3 && z0 < p.z + p.d / 2 + 3) return true;
  return false;
}
function addB(b: Bldg) { if (!overlapsPoi(b.x0, b.x1, b.z0, b.z1)) BUILDINGS.push(b); }
{
  for (const p of POIS) {
    BUILDINGS.push({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, z0: p.z - p.d / 2, z1: p.z + p.d / 2, h: p.h, color: p.color, style: p.kind === 'gas' ? 4 : 2, zone: zoneAt(p.x, p.z), roof: 0x8a8f94, poi: p.id });
  }
  // city blocks
  for (let i = 0; i < GRID_X.length - 1; i++) for (let j = 0; j < GRID_Z.length - 1; j++) {
    const r = blockInner(i, j), cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const zone = zoneAt(cx, cz), hs = (k: number) => hash2(i, j, k);
    if (zone === Zone.Park) {
      for (let k = 0; k < 26; k++) SPOTS.push({ x: lerp(r.x0, r.x1, hash2(i, j, 100 + k)), z: lerp(r.z0, r.z1, hash2(i, j, 200 + k)), kind: hs(300 + k) < 0.55 ? 'palm' : 'tree', r: 0.5 });
      for (let k = 0; k < 5; k++) SPOTS.push({ x: lerp(r.x0, r.x1, hash2(i, j, 400 + k)), z: lerp(r.z0, r.z1, hash2(i, j, 500 + k)), kind: 'bench', r: 0.6, yaw: hash2(i, j, 600 + k) * 6 });
      continue;
    }
    if (zone === Zone.Beach || zone === Zone.Ocean) continue;
    if (zone === Zone.Downtown) {
      const cen = 1 - Math.hypot(cx - DOWNTOWN_C.x, cz - DOWNTOWN_C.z) / 420;
      const nx = 2, nz = 2, gx = (r.x1 - r.x0) / nx, gz = (r.z1 - r.z0) / nz;
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const k = a * 2 + b; if (hs(k + 9) < 0.12) { SPOTS.push({ x: r.x0 + gx * (a + 0.5), z: r.z0 + gz * (b + 0.5), kind: 'palm', r: 0.5 }); continue; }
        const inset = 3 + hs(k + 20) * 5;
        addB({ x0: r.x0 + gx * a + inset, x1: r.x0 + gx * (a + 1) - inset, z0: r.z0 + gz * b + inset, z1: r.z0 + gz * (b + 1) - inset, h: 30 + Math.pow(hs(k + 30), 1.6) * 150 * (0.4 + cen), color: DT[Math.floor(hs(k + 40) * DT.length)], style: hs(k + 50) < 0.6 ? 1 : 0, zone, roof: 0x6b7075 });
      }
      continue;
    }
    if (zone === Zone.Resort) {
      for (let b = 0; b < 2; b++) {
        const gz = (r.z1 - r.z0) / 2;
        addB({ x0: r.x0 + 6, x1: r.x1 - 6, z0: r.z0 + gz * b + 6, z1: r.z0 + gz * (b + 1) - 6, h: 18 + hs(b + 3) * 55, color: PASTEL[Math.floor(hs(b + 5) * PASTEL.length)], style: 3, zone, roof: 0xd8d0c0 });
        SPOTS.push({ x: r.x1 - 2, z: r.z0 + gz * (b + 0.5), kind: 'palm', r: 0.5 }, { x: r.x0 + 2, z: r.z0 + gz * (b + 0.5), kind: 'palm', r: 0.5 });
      }
      continue;
    }
    if (zone === Zone.Industrial) {
      const two = hs(1) < 0.6;
      if (two) { const mx = (r.x0 + r.x1) / 2; addB({ x0: r.x0 + 4, x1: mx - 5, z0: r.z0 + 8, z1: r.z1 - 8, h: 9 + hs(2) * 8, color: IND[Math.floor(hs(3) * IND.length)], style: 5, zone, roof: 0x7a7f84 }); addB({ x0: mx + 5, x1: r.x1 - 4, z0: r.z0 + 8, z1: r.z1 - 30, h: 8 + hs(4) * 8, color: IND[Math.floor(hs(5) * IND.length)], style: 5, zone, roof: 0x7a7f84 }); for (let k = 0; k < 6; k++) SPOTS.push({ x: mx + 10 + (k % 3) * 13, z: r.z1 - 20 + Math.floor(k / 3) * 6, kind: 'container', r: 2, c: [0xb0402c, 0x2c6cb0, 0x3a9a5a, 0xd89a2a][k % 4] }); }
      else { addB({ x0: r.x0 + 6, x1: r.x1 - 6, z0: r.z0 + 6, z1: r.z1 - 6, h: 12 + hs(2) * 6, color: IND[Math.floor(hs(3) * IND.length)], style: 5, zone, roof: 0x7a7f84 }); }
      continue;
    }
    if (zone === Zone.Suburb) {
      // houses around the perimeter facing the roads
      const lot = 22, depth = 26;
      const place = (x: number, z: number, face: number, k: number) => {
        const w = 11 + hash2(Math.round(x), Math.round(z), 1) * 4, d = 10 + hash2(Math.round(x), Math.round(z), 2) * 4;
        addB({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: 4.2 + hash2(Math.round(x), Math.round(z), 3) * 3.2, color: PASTEL[Math.floor(hash2(Math.round(x), Math.round(z), 4) * PASTEL.length)], style: 6, zone, roof: [0xa2533a, 0x6a6e73, 0xc8b8a0, 0x4a5a6a][k % 4] });
        if (hash2(Math.round(x), Math.round(z), 5) < 0.7) SPOTS.push({ x: x + Math.sin(face) * 9 + 5, z: z + Math.cos(face) * 9, kind: hash2(Math.round(x), Math.round(z), 6) < 0.6 ? 'palm' : 'bush', r: 0.5 });
      };
      const n = Math.floor((r.x1 - r.x0) / lot);
      for (let k = 0; k < n; k++) { const x = r.x0 + lot * (k + 0.5); place(x, r.z0 + depth / 2 - 4, Math.PI, k); place(x, r.z1 - depth / 2 + 4, 0, k + 1); }
      const m = Math.floor((r.z1 - r.z0 - depth * 2) / lot);
      for (let k = 0; k < m; k++) { const z = r.z0 + depth + lot * (k + 0.5); place(r.x0 + 9, z, -Math.PI / 2, k + 2); place(r.x1 - 9, z, Math.PI / 2, k + 3); }
      continue;
    }
    // Midtown — mixed low/mid rise, pastel Miami style
    const nx = 3, nz = 2, gx = (r.x1 - r.x0) / nx, gz = (r.z1 - r.z0) / nz;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
      const k = a * nz + b; const inset = 1.5 + hs(k + 7) * 3;
      if (hs(k + 60) < 0.12) { SPOTS.push({ x: r.x0 + gx * (a + 0.5), z: r.z0 + gz * (b + 0.5), kind: 'parked', r: 2, yaw: hs(k + 61) < 0.5 ? 0 : Math.PI / 2 }); continue; }
      addB({ x0: r.x0 + gx * a + inset, x1: r.x0 + gx * (a + 1) - inset, z0: r.z0 + gz * b + inset, z1: r.z0 + gz * (b + 1) - inset, h: 7 + Math.pow(hs(k + 70), 2) * 30, color: PASTEL[Math.floor(hs(k + 80) * PASTEL.length)], style: hs(k + 90) < 0.5 ? 2 : 3, zone, roof: 0xb8b0a0 });
    }
  }
  // street palms along big avenues and Ocean Drive
  for (const s of SEGS) {
    if (!s.sidewalk) continue;
    const hw = segHalfWidth(s) + SIDEWALK_W - 0.8;
    for (let t = s.a + 20; t < s.b - 10; t += 32) {
      if (hash2(s.c, t, 11) < (s.c === 1408 ? 0.9 : 0.35)) {
        const side = hash2(s.c, t, 12) < 0.5 ? -1 : 1;
        const x = s.axis === 'x' ? s.c + side * hw : t, z = s.axis === 'x' ? t : s.c + side * hw;
        if (zoneAt(x, z) !== Zone.Downtown || hash2(t, s.c, 3) < 0.4) SPOTS.push({ x, z, kind: 'palm', r: 0.4 });
      }
    }
  }
  // town blocks
  for (let a = 0; a < TOWN_X.length - 1; a++) for (let b = 0; b < TOWN_Z.length - 1; b++) {
    const x0 = TOWN_X[a] + 9, x1 = TOWN_X[a + 1] - 9, z0 = TOWN_Z[b] + 9, z1 = TOWN_Z[b + 1] - 9;
    for (let k = 0; k < 4; k++) {
      const w = (x1 - x0) / 4; const bx0 = x0 + w * k + 1.5, bx1 = x0 + w * (k + 1) - 1.5;
      addB({ x0: bx0, x1: bx1, z0: z0, z1: z0 + 16, h: 4.5 + hash2(a, b * 9 + k, 1) * 4, color: PASTEL[Math.floor(hash2(a, b, k) * PASTEL.length)], style: 7, zone: Zone.Town, roof: 0x9a8a7a });
      addB({ x0: bx0, x1: bx1, z0: z1 - 16, z1: z1, h: 4.5 + hash2(a, b * 9 + k, 2) * 4, color: PASTEL[Math.floor(hash2(b, a, k) * PASTEL.length)], style: 7, zone: Zone.Town, roof: 0x9a8a7a });
    }
    for (let k = 0; k < 5; k++) SPOTS.push({ x: lerp(x0 + 10, x1 - 10, hash2(a, b, 50 + k)), z: lerp(z0 + 24, z1 - 24, hash2(a, b, 60 + k)), kind: 'tree', r: 0.5 });
  }
  // rural farmsteads & swamp shacks along rural roads
  for (const s of SEGS) {
    if (s.kind !== 'rural' && s.kind !== 'dirt' && !(s.kind === 'highway' && s.c === -896)) continue;
    for (let t = s.a + 60; t < s.b - 40; t += 90) {
      const h = hash2(s.c, t, 21); if (h > 0.45) continue;
      const side = hash2(s.c, t, 22) < 0.5 ? -1 : 1, off = segHalfWidth(s) + 18 + hash2(s.c, t, 23) * 10;
      const x = s.axis === 'x' ? s.c + side * off : t, z = s.axis === 'x' ? t : s.c + side * off;
      const zone = zoneAt(x, z); if (zone !== Zone.Rural && zone !== Zone.Swamp) continue;
      if (isWater(x, z)) continue;
      const swamp = zone === Zone.Swamp;
      const w = swamp ? 7 : 10, d = swamp ? 6 : 12;
      addB({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h: swamp ? 3.6 : 5, color: swamp ? 0x7a6650 : [0xe8e0d0, 0xb03a2e, 0xd8c8a0][Math.floor(h * 6.6) % 3], style: 8, zone, roof: swamp ? 0x5a5650 : 0x6a4a3a, stilts: swamp });
      if (!swamp && hash2(s.c, t, 24) < 0.6) addB({ x0: x - w / 2 + side * 0 + 14, x1: x + w / 2 + 18, z0: z - 8, z1: z + 8, h: 7, color: 0x9b3b2e, style: 8, zone, roof: 0x5a5a5a });
    }
  }
  // vegetation in the wilds
  for (let k = 0; k < 2600; k++) {
    const x = -1980 + hash2(k, 1, 77) * 1340, z = -1980 + hash2(k, 2, 77) * 3960;
    const zone = zoneAt(x, z); if (zone !== Zone.Rural && zone !== Zone.Swamp) continue;
    const wet = isWater(x, z);
    if (roadDist(x, z) < 5) continue;
    if (zone === Zone.Swamp) SPOTS.push({ x, z, kind: wet && hash2(k, 3, 7) < 0.6 ? 'cypress' : hash2(k, 4, 7) < 0.5 ? 'cypress' : 'bush', r: 0.6 });
    else if (!wet) SPOTS.push({ x, z, kind: hash2(k, 5, 7) < 0.35 ? 'pine' : hash2(k, 6, 7) < 0.5 ? 'tree' : 'palm', r: 0.6 });
  }
  // beach palms
  for (let z = -1900; z < 1900; z += 26) { const x = coastX(z) - 75 + hash2(z, 0, 5) * 20; if (hash2(z, 1, 5) < 0.6) SPOTS.push({ x, z, kind: 'palm', r: 0.4 }); }
}
// airport hangars
BUILDINGS.push({ x0: -1900, x1: -1820, z0: -1300, z1: -1230, h: 16, color: 0xb8c2c8, style: 5, zone: Zone.Airport, roof: 0x8a9298 });
BUILDINGS.push({ x0: -1800, x1: -1720, z0: -1300, z1: -1230, h: 16, color: 0xb8c2c8, style: 5, zone: Zone.Airport, roof: 0x8a9298 });
BUILDINGS.push({ x0: -1180, x1: -1160, z0: -1320, z1: -1300, h: 32, color: 0xdfe6ea, style: 1, zone: Zone.Airport, roof: 0x8a9298 }); // tower

// spatial hash for building collisions
const BGRID = new Map<number, number[]>();
const BG = 64; const bkey = (i: number, j: number) => (i + 64) * 1000 + (j + 64);
BUILDINGS.forEach((b, idx) => {
  for (let i = Math.floor(b.x0 / BG); i <= Math.floor(b.x1 / BG); i++) for (let j = Math.floor(b.z0 / BG); j <= Math.floor(b.z1 / BG); j++) { const k = bkey(i, j); (BGRID.get(k) ?? BGRID.set(k, []).get(k)!).push(idx); }
});
const qOut: Bldg[] = []; const qSeen = new Set<number>();
export function buildingsNear(x: number, z: number, r: number): Bldg[] {
  qOut.length = 0; qSeen.clear();
  for (let i = Math.floor((x - r) / BG); i <= Math.floor((x + r) / BG); i++) for (let j = Math.floor((z - r) / BG); j <= Math.floor((z + r) / BG); j++) {
    const l = BGRID.get(bkey(i, j)); if (!l) continue;
    for (const idx of l) if (!qSeen.has(idx)) { qSeen.add(idx); const b = BUILDINGS[idx]; if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) qOut.push(b); }
  }
  return qOut;
}
/** Push a circle out of buildings. Returns collision normal if hit. */
export function collideCircle(p: { x: number; z: number }, r: number, y = 0): { nx: number; nz: number } | null {
  let hit: { nx: number; nz: number } | null = null;
  for (const b of buildingsNear(p.x, p.z, r)) {
    if (y > b.h + 0.2) continue;
    if (b.stilts && y > 1.6) continue;
    const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
    let dx = p.x - cx, dz = p.z - cz; let d = Math.hypot(dx, dz);
    if (d < r) {
      if (d < 1e-4) { // centre inside: push out along smallest axis
        const l = p.x - b.x0, rr = b.x1 - p.x, t = p.z - b.z0, bb = b.z1 - p.z, m = Math.min(l, rr, t, bb);
        if (m === l) { dx = -1; dz = 0; p.x = b.x0 - r; } else if (m === rr) { dx = 1; dz = 0; p.x = b.x1 + r; } else if (m === t) { dx = 0; dz = -1; p.z = b.z0 - r; } else { dx = 0; dz = 1; p.z = b.z1 + r; }
        hit = { nx: dx, nz: dz }; continue;
      }
      dx /= d; dz /= d; p.x = cx + dx * r; p.z = cz + dz * r; hit = { nx: dx, nz: dz };
    }
  }
  return hit;
}
/** Ray vs buildings (2.5D) — returns distance or Infinity. */
export function raycastBuildings(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number): number {
  let best = Infinity;
  const steps = Math.ceil(maxD / 48);
  const seen = new Set<Bldg>();
  for (let s = 0; s <= steps; s++) {
    const t = Math.min(maxD, s * 48);
    for (const b of buildingsNear(ox + dx * t, oz + dz * t, 40)) {
      if (seen.has(b)) continue; seen.add(b);
      // slab test in 3D (y from 0..h)
      let t0 = 0, t1 = maxD;
      const ax: [number, number, number, number][] = [[ox, dx, b.x0, b.x1], [oy, dy, -5, b.h], [oz, dz, b.z0, b.z1]];
      let ok = true;
      for (const [o, d, mn, mx] of ax) {
        if (Math.abs(d) < 1e-8) { if (o < mn || o > mx) { ok = false; break; } continue; }
        let a = (mn - o) / d, c = (mx - o) / d; if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best) best = t0;
    }
    if (best < t) break;
  }
  return best;
}
export function districtName(x: number, z: number) { return ZONE_NAMES[zoneAt(x, z)]; }
