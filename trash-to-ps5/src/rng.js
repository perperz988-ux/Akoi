export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export function angleLerp(a, b, t) { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
export function weighted(rng, entries) { let s = 0; for (const e of entries) s += e[1]; let r = rng() * s; for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; } return entries[entries.length - 1][0]; }
export function fmtTime(mins) { const h = Math.floor(mins / 60) % 24, m = Math.floor(mins % 60); const ap = h < 12 ? 'AM' : 'PM'; const hh = h % 12 === 0 ? 12 : h % 12; return `${hh}:${String(m).padStart(2, '0')} ${ap}`; }
