// Geographic math: WGS84-sphere approximations, local tangent projection with floating origin,
// Web-Mercator tile math, ISA atmosphere and unit helpers.
export const R_EARTH = 6371008.8;
export const DEG = Math.PI / 180;
export const FT = 0.3048;
export const KT = 0.514444;
export const NM = 1852;
export const G0 = 9.80665;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, v: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const wrap360 = (a: number) => ((a % 360) + 360) % 360;
export const wrap180 = (a: number) => { a = wrap360(a); return a > 180 ? a - 360 : a; };
/** Exponential approach factor for frame-rate independent smoothing. */
export const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export interface LatLon { lat: number; lon: number }

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = (lat2 - lat1) * DEG, dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(a)));
}
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return wrap360(Math.atan2(y, x) / DEG);
}
/** Point along great circle at fraction f. */
export function gcInterp(lat1: number, lon1: number, lat2: number, lon2: number, f: number): LatLon {
  const p1 = lat1 * DEG, l1 = lon1 * DEG, p2 = lat2 * DEG, l2 = lon2 * DEG;
  const d = haversine(lat1, lon1, lat2, lon2) / R_EARTH;
  if (d < 1e-9) return { lat: lat1, lon: lon1 };
  const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
  const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
  const z = A * Math.sin(p1) + B * Math.sin(p2);
  return { lat: Math.atan2(z, Math.hypot(x, y)) / DEG, lon: Math.atan2(y, x) / DEG };
}
export function destination(lat: number, lon: number, brgDeg: number, dist: number): LatLon {
  const d = dist / R_EARTH, b = brgDeg * DEG, p1 = lat * DEG, l1 = lon * DEG;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / DEG, lon: wrap180(l2 / DEG) };
}
/** Cross-track distance (m, + right of course) of point P from great circle A->B, and along-track distance. */
export function crossTrack(aLat: number, aLon: number, bLat: number, bLon: number, pLat: number, pLon: number) {
  const d13 = haversine(aLat, aLon, pLat, pLon) / R_EARTH;
  const t13 = bearing(aLat, aLon, pLat, pLon) * DEG, t12 = bearing(aLat, aLon, bLat, bLon) * DEG;
  const xt = Math.asin(Math.sin(d13) * Math.sin(t13 - t12));
  const at = Math.acos(clamp(Math.cos(d13) / Math.cos(xt), -1, 1));
  return { xt: xt * R_EARTH, at: at * R_EARTH * Math.sign(Math.cos(t13 - t12) || 1) };
}

/**
 * Floating origin. World units are metres, x = east, y = up (MSL), z = south.
 * Positions near the origin are accurate; the origin is shifted as the aircraft travels.
 */
export class Origin {
  lat = 0; lon = 0; cosLat = 1;
  private listeners: ((dx: number, dz: number) => void)[] = [];
  set(lat: number, lon: number) { this.lat = lat; this.lon = lon; this.cosLat = Math.cos(lat * DEG); }
  onShift(f: (dx: number, dz: number) => void) { this.listeners.push(f); }
  offShift(f: (dx: number, dz: number) => void) { this.listeners = this.listeners.filter(l => l !== f); }
  x(lon: number) { return wrap180(lon - this.lon) * DEG * R_EARTH * this.cosLat; }
  z(lat: number) { return -(lat - this.lat) * DEG * R_EARTH; }
  lonOf(x: number) { return wrap180(this.lon + x / (DEG * R_EARTH * this.cosLat)); }
  latOf(z: number) { return this.lat - z / (DEG * R_EARTH); }
  /** Move origin to lat/lon. Returns the world-space shift that was applied to existing objects. */
  shiftTo(lat: number, lon: number) {
    const dx = this.x(lon), dz = this.z(lat);
    this.set(lat, lon);
    for (const l of this.listeners) l(dx, dz);
    return { dx, dz };
  }
}
export const origin = new Origin();

// ---------- Web Mercator tiles ----------
export function lon2tx(lon: number, z: number) { return ((lon + 180) / 360) * (1 << z); }
export function lat2ty(lat: number, z: number) {
  const r = clamp(lat, -85.0511, 85.0511) * DEG;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z);
}
export function tx2lon(x: number, z: number) { return (x / (1 << z)) * 360 - 180; }
export function ty2lat(y: number, z: number) { const n = Math.PI - (2 * Math.PI * y) / (1 << z); return (Math.atan(Math.sinh(n)) / DEG); }

// ---------- ISA atmosphere ----------
export interface Atmo { rho: number; p: number; T: number; a: number; sigma: number }
export function isa(altM: number, dT = 0): Atmo {
  const h = Math.max(-500, altM);
  let T: number, p: number;
  if (h < 11000) { T = 288.15 - 0.0065 * h; p = 101325 * Math.pow(T / 288.15, 5.25588); }
  else { T = 216.65; p = 22632.1 * Math.exp(-G0 * (h - 11000) / (287.053 * 216.65)); }
  T += dT;
  const rho = p / (287.053 * T);
  return { rho, p, T, a: Math.sqrt(1.4 * 287.053 * T), sigma: rho / 1.225 };
}

// ---------- Deterministic noise ----------
export function hash2(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
export function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
}
