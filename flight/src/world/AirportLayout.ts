// Deterministic airport layout from real runway geometry (OurAirports): parallel taxiways,
// connectors, apron, terminal, gates, tower, hangars and taxi routes.
import { Airport, Runway, RunwayEnd } from '../data/world';
import { DEG, R_EARTH, clamp } from '../core/geo';

export type V2 = [number, number]; // local metres (x east, z south) relative to ARP
const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: V2, k: number): V2 => [a[0] * k, a[1] * k];
const dot = (a: V2, b: V2) => a[0] * b[0] + a[1] * b[1];
const len = (a: V2) => Math.hypot(a[0], a[1]);
const norm = (a: V2): V2 => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
export const hdgOf = (v: V2) => ((Math.atan2(v[0], -v[1]) / DEG) + 360) % 360;
export const vecOf = (hdg: number): V2 => [Math.sin(hdg * DEG), -Math.cos(hdg * DEG)];

export interface RwyLayout { rw: Runway; a: V2; b: V2; dir: V2; nrm: V2; len: number; width: number; side: number; toff: number; twyA: V2; twyB: V2; exits: number[] }
export interface Gate { pos: V2; hdg: number; occupied: boolean; id: string; maxSpan: number }
export interface Layout {
  ap: Airport; cos: number; rwys: RwyLayout[]; primary: RwyLayout;
  apron: { c: V2; dir: V2; nrm: V2; len: number; depth: number };
  terminal: { c: V2; len: number; depth: number; h: number };
  gates: Gate[]; links: { from: V2; to: V2; rwy: RwyLayout }[];
  tower: V2; hangars: V2[]; paved: { segs: [V2, V2, number][]; rects: { c: V2; dir: V2; hl: number; hw: number }[] };
}

const cache = new Map<string, Layout>();

export function toLocal(ap: Airport, lat: number, lon: number): V2 {
  const cos = Math.cos(ap.lat * DEG);
  return [(lon - ap.lon) * DEG * R_EARTH * cos, -(lat - ap.lat) * DEG * R_EARTH];
}
export function toLatLon(ap: Airport, p: V2) {
  const cos = Math.cos(ap.lat * DEG);
  return { lat: ap.lat - p[1] / (DEG * R_EARTH), lon: ap.lon + p[0] / (DEG * R_EARTH * cos) };
}
function segPointDist(p: V2, a: V2, b: V2) {
  const ab = sub(b, a); const t = clamp(dot(sub(p, a), ab) / (dot(ab, ab) || 1), 0, 1);
  return len(sub(p, add(a, mul(ab, t))));
}

export function layoutOf(ap: Airport): Layout {
  const c0 = cache.get(ap.icao); if (c0) return c0;
  const cos = Math.cos(ap.lat * DEG);
  const big = ap.size === 2;
  const rwys: RwyLayout[] = ap.runways.map(rw => {
    const a = toLocal(ap, rw.ends[0].lat, rw.ends[0].lon), b = toLocal(ap, rw.ends[1].lat, rw.ends[1].lon);
    const d = norm(sub(b, a)); const n: V2 = [-d[1], d[0]];
    const mid = mul(add(a, b), 0.5);
    let side = Math.sign(dot(sub([0, 0], mid), n)) || 1;
    if (Math.abs(dot(sub([0, 0], mid), n)) < 120) side = 1;
    const toff = rw.widthM > 40 ? 182 : rw.widthM > 28 ? 120 : 75;
    const L = len(sub(b, a));
    return { rw, a, b, dir: d, nrm: n, len: L, width: rw.widthM, side, toff, twyA: add(a, mul(n, side * toff)), twyB: add(b, mul(n, side * toff)), exits: L > 2400 ? [0.35, 0.55, 0.72] : L > 1500 ? [0.5] : [] };
  });
  const primary = rwys.slice().sort((x, y) => y.len - x.len)[0];
  const clearOf = (p: V2, margin: number) => rwys.every(r => segPointDist(p, r.a, r.b) > r.width / 2 + margin);
  // apron
  const apLen = clamp(primary.len * 0.5, big ? 700 : ap.size === 1 ? 380 : 160, big ? 1200 : ap.size === 1 ? 600 : 260);
  const apDepth = big ? 300 : ap.size === 1 ? 200 : 110;
  const mid = mul(add(primary.a, primary.b), 0.5);
  const arpAlong = clamp(dot(sub([0, 0], primary.a), primary.dir), primary.len * 0.25, primary.len * 0.75);
  let best: V2 | null = null;
  for (const sgn of [primary.side, -primary.side]) {
    for (let extra = 0; extra < 1200 && !best; extra += 150) {
      const base = add(primary.a, mul(primary.dir, arpAlong));
      const c = add(base, mul(primary.nrm, sgn * (primary.toff + 70 + apDepth / 2 + extra)));
      const corners = [-1, 1].flatMap(i => [-1, 1].map(j => add(c, add(mul(primary.dir, i * apLen / 2), mul(primary.nrm, j * (apDepth / 2 + 80))))));
      if (clearOf(c, apDepth / 2 + 60) && corners.every(k => clearOf(k, 40))) { best = c; if (sgn !== primary.side) { primary.side = sgn; primary.twyA = add(primary.a, mul(primary.nrm, sgn * primary.toff)); primary.twyB = add(primary.b, mul(primary.nrm, sgn * primary.toff)); } }
    }
    if (best) break;
  }
  const apC = best ?? add(mid, mul(primary.nrm, primary.side * (primary.toff + 70 + apDepth / 2)));
  const nrmTerm = mul(primary.nrm, Math.sign(dot(sub(apC, mid), primary.nrm)) || 1);
  const apron = { c: apC, dir: primary.dir, nrm: nrmTerm, len: apLen, depth: apDepth };
  const terminal = { c: add(apC, mul(nrmTerm, apDepth / 2 + 35)), len: apLen * 0.82, depth: big ? 70 : 40, h: big ? 22 : 13 };
  // gates
  const gates: Gate[] = [];
  const spacing = big ? 78 : ap.size === 1 ? 52 : 28;
  const n = Math.max(2, Math.floor((apLen * 0.8) / spacing));
  for (let i = 0; i < n; i++) {
    const along = (i - (n - 1) / 2) * spacing;
    const maxSpan = big ? (i % 3 === 0 ? 70 : 38) : ap.size === 1 ? 38 : 16;
    const depthOff = apDepth / 2 - (big ? 40 : ap.size === 1 ? 26 : 12);
    gates.push({ pos: add(add(apC, mul(apron.dir, along)), mul(nrmTerm, depthOff)), hdg: hdgOf(nrmTerm), occupied: false, id: (big ? 'B' : 'A') + (i + 1), maxSpan });
  }
  // links from apron to each runway's parallel taxiway
  const links: Layout['links'] = [];
  const apFront = add(apC, mul(nrmTerm, -apDepth / 2));
  for (const r of rwys) {
    const p = r === primary ? apFront : nearestOnRect(apron, r);
    const t = clamp(dot(sub(p, r.twyA), r.dir), 0, r.len);
    links.push({ from: p, to: add(r.twyA, mul(r.dir, t)), rwy: r });
  }
  const tower = add(add(apC, mul(apron.dir, apLen / 2 + 70)), mul(nrmTerm, apDepth / 2 + 10));
  const hangars = [0, 1, 2].map(i => add(add(apC, mul(apron.dir, -apLen / 2 - 80 - i * 95)), mul(nrmTerm, apDepth / 2 - 30)));
  const paved: Layout['paved'] = { segs: [], rects: [] };
  for (const r of rwys) {
    paved.rects.push({ c: mul(add(r.a, r.b), 0.5), dir: r.dir, hl: r.len / 2 + 60, hw: r.width / 2 + 7 });
    paved.segs.push([r.twyA, r.twyB, 14]);
    paved.segs.push([r.a, r.twyA, 14]); paved.segs.push([r.b, r.twyB, 14]);
    for (const e of r.exits) paved.segs.push([add(r.a, mul(r.dir, r.len * e)), add(r.twyA, mul(r.dir, r.len * e)), 14]);
  }
  for (const l of links) paved.segs.push([l.from, l.to, 14]);
  paved.rects.push({ c: apC, dir: apron.dir, hl: apLen / 2 + 10, hw: apDepth / 2 + 10 });
  const L: Layout = { ap, cos, rwys, primary, apron, terminal, gates, links, tower, hangars, paved };
  cache.set(ap.icao, L);
  return L;
}

function nearestOnRect(apron: Layout['apron'], r: RwyLayout): V2 {
  let best: V2 = apron.c, bd = 1e12;
  for (let i = -1; i <= 1; i += 0.25) for (const j of [-1, 1]) {
    const p = add(add(apron.c, mul(apron.dir, i * apron.len / 2)), mul(apron.nrm, j * apron.depth / 2));
    const t = clamp(dot(sub(p, r.twyA), r.dir), 0, r.len); const q = add(r.twyA, mul(r.dir, t));
    const d = len(sub(p, q)); if (d < bd) { bd = d; best = p; }
  }
  return best;
}

export function isPaved(L: Layout, p: V2) {
  for (const r of L.paved.rects) { const d = sub(p, r.c); if (Math.abs(dot(d, r.dir)) < r.hl && Math.abs(d[0] * -r.dir[1] + d[1] * r.dir[0]) < r.hw) return true; }
  for (const [a, b, w] of L.paved.segs) if (segPointDist(p, a, b) < w) return true;
  return false;
}

/** Flattening footprint segments [ax, az, bx, bz, halfWidth] and discs [x, z, r] in metres. */
export function footprintShapes(L: Layout) {
  const segs: [number, number, number, number, number][] = [];
  for (const r of L.rwys) { const ext = mul(r.dir, 380); segs.push([r.a[0] - ext[0], r.a[1] - ext[1], r.b[0] + ext[0], r.b[1] + ext[1], r.toff + 90]); }
  for (const l of L.links) segs.push([l.from[0], l.from[1], l.to[0], l.to[1], 60]);
  const discs: [number, number, number][] = [[L.apron.c[0], L.apron.c[1], Math.hypot(L.apron.len, L.apron.depth) / 2 + 120]];
  return { segs, discs };
}

export interface RunwayEndInfo { end: RunwayEnd; rl: RwyLayout; thr: V2; dir: V2 }
export function endInfo(L: Layout, end: RunwayEnd): RunwayEndInfo {
  const rl = L.rwys.find(r => r.rw === end.rwy)!;
  const isA = rl.rw.ends[0] === end;
  const dir: V2 = isA ? rl.dir : mul(rl.dir, -1);
  const start = isA ? rl.a : rl.b;
  return { end, rl, thr: add(start, mul(dir, end.dispM)), dir };
}

/** Taxi route (local metres) from a gate to the hold-short point and lineup of a runway end. */
export function taxiRoute(L: Layout, gate: Gate, end: RunwayEnd, acLen: number): V2[] {
  const ei = endInfo(L, end); const r = ei.rl;
  const isA = r.rw.ends[0] === end;
  const route: V2[] = [];
  const g = gate.pos; const pushPt = add(g, mul(L.apron.nrm, -(acLen * 0.9 + 25)));
  route.push(pushPt);
  const link = L.links.find(l => l.rwy === r)!;
  const laneAlong = dot(sub(pushPt, L.apron.c), L.apron.dir);
  const lane = add(add(L.apron.c, mul(L.apron.nrm, -L.apron.depth / 2 + 35)), mul(L.apron.dir, laneAlong));
  route.push(lane);
  const linkLane = add(link.from, mul(L.apron.nrm, 35));
  route.push(add(linkLane, [0, 0]));
  route.push(link.from); route.push(link.to);
  const twyEnd = isA ? r.twyA : r.twyB;
  route.push(twyEnd);
  const startRw = isA ? r.a : r.b;
  const hold = add(startRw, mul(r.nrm, r.side * (r.width / 2 + 55)));
  route.push(hold);
  route.push(add(ei.thr, mul(ei.dir, 15)));
  route.push(add(ei.thr, mul(ei.dir, 120)));
  // remove degenerate points
  return route.filter((p, i) => i === 0 || len(sub(p, route[i - 1])) > 3);
}

export function bestRunwayEnd(ap: Airport, windFromDeg: number, windKt: number, minLenM = 0): RunwayEnd {
  let best: RunwayEnd | null = null, bs = -1e9;
  for (const rw of ap.runways) for (const e of rw.ends) {
    if (rw.lengthM < minLenM && ap.runways.some(r => r.lengthM >= minLenM)) continue;
    const head = Math.cos((windFromDeg - e.hdg) * DEG) * windKt;
    const score = head * 3 + rw.lengthM / 300 + (rw.hard ? 10 : 0);
    if (score > bs) { bs = score; best = e; }
  }
  return best ?? ap.runways[0].ends[0];
}
