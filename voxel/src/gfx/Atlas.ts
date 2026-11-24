// Procedurally painted 16x16 block textures packed into a mip-safe atlas (each tile padded by wrapping).
import * as THREE from 'three';
import { ATLAS_CELL, ATLAS_COLS, ATLAS_SIZE, ATLAS_TILE, TILE_NAMES } from '../world/Blocks';
import { hashString, mulberry32 } from '../world/Noise';

type C = [number, number, number, number?];
const T = ATLAS_TILE;

class P {
  d = new Uint8ClampedArray(T * T * 4);
  r: () => number;
  constructor(seed: string) { this.r = mulberry32(hashString(seed)); }
  set(x: number, y: number, c: C) {
    x = ((x % T) + T) % T; y = ((y % T) + T) % T;
    const i = (y * T + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = c[3] ?? 255;
  }
  get(x: number, y: number): C { x = ((x % T) + T) % T; y = ((y % T) + T) % T; const i = (y * T + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  fill(c: C) { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) this.set(x, y, c); }
  clear() { this.d.fill(0); }
  noise(c: C, amt: number, chroma = 0) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const v = (this.r() - 0.5) * amt;
      const h = (this.r() - 0.5) * chroma;
      this.set(x, y, [c[0] + v + h, c[1] + v, c[2] + v - h, c[3]]);
    }
  }
  shade(x: number, y: number, k: number) { const c = this.get(x, y); this.set(x, y, [c[0] * k, c[1] * k, c[2] * k, c[3]]); }
  add(x: number, y: number, v: number) { const c = this.get(x, y); this.set(x, y, [c[0] + v, c[1] + v, c[2] + v, c[3]]); }
  rect(x: number, y: number, w: number, h: number, c: C) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  jitter(c: C, a: number): C { const v = (this.r() - 0.5) * a; return [c[0] + v, c[1] + v, c[2] + v, c[3]]; }
}

const mix = (a: C, b: C, t: number): C => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] ?? 255) + ((b[3] ?? 255) - (a[3] ?? 255)) * t];

// ---- reusable patterns ----
function stoneBase(p: P, base: C, strata: C) {
  p.noise(base, 22);
  for (let k = 0; k < 4; k++) {
    let y = Math.floor(p.r() * 16);
    for (let x = 0; x < 16; x++) {
      if (p.r() < 0.75) p.set(x, y, p.jitter(strata, 10));
      if (p.r() < 0.25) y += p.r() < 0.5 ? -1 : 1;
    }
  }
  for (let k = 0; k < 10; k++) p.add(Math.floor(p.r() * 16), Math.floor(p.r() * 16), 18);
}
function voronoi(p: P, n: number, base: C, mortar: C, varAmt: number) {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) pts.push([p.r() * 16, p.r() * 16, (p.r() - 0.5) * varAmt]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0;
    for (let i = 0; i < n; i++) for (let oy = -16; oy <= 16; oy += 16) for (let ox = -16; ox <= 16; ox += 16) {
      const dx = x + 0.5 - (pts[i][0] + ox), dy = y + 0.5 - (pts[i][1] + oy);
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; best = i; } else if (d < d2) d2 = d;
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    if (edge < 1.1) p.set(x, y, p.jitter(mortar, 12));
    else { const v = pts[best][2] + (p.r() - 0.5) * 14 + (edge < 2 ? -8 : 6); p.set(x, y, [base[0] + v, base[1] + v, base[2] + v]); }
  }
}
function ore(p: P, base: () => void, gem: C, hi: C, count: number) {
  base();
  for (let k = 0; k < count; k++) {
    const cx = 2 + Math.floor(p.r() * 12), cy = 2 + Math.floor(p.r() * 12);
    const s = p.r() < 0.5 ? 1 : 2;
    for (let dy = -s; dy <= s; dy++) for (let dx = -s; dx <= s; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > s) continue;
      p.set(cx + dx, cy + dy, mix(gem, [0, 0, 0], (dx + dy + 2) * 0.08));
    }
    p.set(cx - 1 + (s > 1 ? 0 : 1), cy - (s > 1 ? 1 : 0), hi);
    p.set(cx + s, cy + 1, mix(gem, [0, 0, 0], 0.45));
  }
}
function bark(p: P, base: C, dark: C, vertical: boolean) {
  p.noise(base, 16);
  for (let x = 0; x < 16; x++) {
    if (p.r() < 0.4) {
      const len = 3 + Math.floor(p.r() * 8), y0 = Math.floor(p.r() * 16);
      for (let j = 0; j < len; j++) vertical ? p.set(x, y0 + j, p.jitter(dark, 10)) : p.set(y0 + j, x, p.jitter(dark, 10));
    }
  }
}
function rings(p: P, bark: C, wood: C, ring: C) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.sqrt((x - 7.5) ** 2 + (y - 7.5) ** 2);
    if (d > 7) p.set(x, y, p.jitter(bark, 14));
    else p.set(x, y, Math.floor(d + p.r() * 0.6) % 2 === 0 ? p.jitter(ring, 8) : p.jitter(wood, 8));
  }
}
function boards(p: P, base: C, line: C, vertical: boolean) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const a = vertical ? x : y, b = vertical ? y : x;
    const board = Math.floor(a / 4);
    const off = (board * 7) % 16;
    let c = mix(base, [base[0] * 0.85, base[1] * 0.82, base[2] * 0.8], ((board * 37) % 5) / 5);
    c = p.jitter(c, 10);
    if (Math.sin((b + off) * 0.9 + board) > 0.85) c = mix(c, line, 0.35);
    if (a % 4 === 3) c = line;
    if ((b + off) % 16 === 0) c = line;
    vertical ? p.set(x, y, c) : p.set(x, y, c);
  }
  for (let board = 0; board < 4; board++) { const a = board * 4 + 1; const b = ((board * 7) + 2) % 16; vertical ? p.set(a, b, [60, 50, 40]) : p.set(b, a, [60, 50, 40]); }
}
function leaves(p: P, base: C, hi: C, holes: boolean) {
  p.clear();
  for (let k = 0; k < 26; k++) {
    const cx = p.r() * 16, cy = p.r() * 16, r = 1.4 + p.r() * 1.8;
    const col = mix(base, hi, p.r() * 0.6);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) p.set(x, y, mix(col, [0, 0, 0], ((y - cy + r) / (2 * r)) * 0.3));
    }
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const c = p.get(x, y);
    if (c[3] === 0) p.set(x, y, holes ? [0, 0, 0, 0] : mix(base, [0, 0, 0], 0.45));
  }
}
function needles(p: P, base: C, hi: C, holes: boolean) {
  p.clear();
  for (let k = 0; k < 40; k++) {
    let x = Math.floor(p.r() * 16), y = Math.floor(p.r() * 16);
    const dx = p.r() < 0.5 ? 1 : -1;
    const c = mix(base, hi, p.r() * 0.5);
    for (let j = 0; j < 4; j++) { p.set(x, y, c); x += dx; if (j % 2) y++; }
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (p.get(x, y)[3] === 0) p.set(x, y, holes ? [0, 0, 0, 0] : mix(base, [0, 0, 0], 0.5));
}
function fronds(p: P, base: C, hi: C, holes: boolean) {
  p.clear();
  for (let k = 0; k < 5; k++) {
    const y0 = 1 + k * 3;
    for (let x = 0; x < 16; x++) {
      const y = y0 + Math.round(Math.sin(x * 0.4 + k) * 1.2);
      p.set(x, y, mix(base, hi, 0.4)); p.set(x, y + 1, base);
      if (x % 3 === 0) p.set(x, y - 1, base);
    }
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (p.get(x, y)[3] === 0) p.set(x, y, holes ? [0, 0, 0, 0] : mix(base, [0, 0, 0], 0.5));
}
function cloth(p: P, c: C) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const w = ((x + y) % 4 < 2) !== ((x - y + 16) % 4 < 2);
    p.set(x, y, p.jitter(mix(c, [0, 0, 0], w ? 0.12 : 0), 8));
  }
  for (let x = 0; x < 16; x++) { p.shade(x, 0, 0.85); p.shade(x, 15, 0.85); }
}
function metal(p: P, c: C, rivet: C) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let k = 1 + (8 - y) * 0.012;
    if (x === 0 || y === 0) k = 1.2; if (x === 15 || y === 15) k = 0.7;
    if (x === 7 || x === 8) k *= 0.92;
    p.set(x, y, p.jitter([c[0] * k, c[1] * k, c[2] * k], 6));
  }
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) { p.set(x, y, rivet); p.set(x + 1, y + 1, [rivet[0] * 0.6, rivet[1] * 0.6, rivet[2] * 0.6]); }
}
function plantStem(p: P, x: number, y0: number, y1: number, c: C) { for (let y = y0; y <= y1; y++) p.set(x, y, c); }

// ---- painters per tile name ----
const STONE: C = [124, 128, 138];
const DIRT: C = [128, 88, 62];
const GRASS: C = [86, 164, 82];
const SAND: C = [224, 204, 160];
const painters: Record<string, (p: P) => void> = {
  stone: (p) => stoneBase(p, STONE, [104, 108, 120]),
  deepstone: (p) => { voronoi(p, 9, [52, 48, 60], [24, 22, 30], 20); },
  slate: (p) => { stoneBase(p, [82, 86, 100], [62, 66, 80]); for (let y = 3; y < 16; y += 5) for (let x = 0; x < 16; x++) p.shade(x, y, 0.82); },
  dirt: (p) => { p.noise(DIRT, 24, 6); for (let k = 0; k < 9; k++) { const x = Math.floor(p.r() * 15), y = Math.floor(p.r() * 15); p.set(x, y, [150, 118, 92]); p.set(x + 1, y, [96, 66, 48]); } },
  grass_top: (p) => { p.noise(GRASS, 20, 10); for (let k = 0; k < 30; k++) { const x = Math.floor(p.r() * 16), y = Math.floor(p.r() * 16); p.set(x, y, [120, 196, 100]); p.set(x, y + 1, [70, 138, 70]); } },
  grass_side: (p) => {
    painters.dirt(p);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(p.r() * 3) + (x % 5 === 0 ? 2 : 0);
      for (let y = 0; y < h; y++) p.set(x, y, p.jitter(y === h - 1 ? [64, 128, 62] : GRASS, 16));
    }
  },
  frost_top: (p) => { p.noise([226, 236, 244], 12); for (let k = 0; k < 12; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), [150, 190, 160]); },
  frost_side: (p) => { painters.dirt(p); for (let x = 0; x < 16; x++) { const h = 3 + Math.floor(p.r() * 3); for (let y = 0; y < h; y++) p.set(x, y, p.jitter([232, 240, 248], 10)); } },
  sand: (p) => { p.noise(SAND, 14, 6); for (let y = 2; y < 16; y += 5) for (let x = 0; x < 16; x++) if (Math.sin(x * 0.7 + y) > 0.2) p.shade(x, y + (x % 3 === 0 ? 1 : 0), 0.92); },
  gravel: (p) => voronoi(p, 14, [132, 124, 120], [88, 82, 80], 50),
  clay: (p) => { p.noise([158, 166, 182], 10); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) if (p.r() < 0.6) p.shade(x, y, 0.94); },
  sandstone: (p) => { p.noise([214, 186, 132], 10); for (const y of [0, 5, 11]) for (let x = 0; x < 16; x++) p.set(x, y, [182, 152, 104]); for (let x = 0; x < 16; x++) p.shade(x, 12, 1.08); },
  sandstone_top: (p) => { p.noise([222, 196, 142], 10); for (let i = 0; i < 16; i++) { p.set(i, 0, [184, 156, 108]); p.set(0, i, [184, 156, 108]); } },
  snow: (p) => { p.noise([238, 244, 252], 8); for (let k = 0; k < 8; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), [210, 222, 240]); },
  ice: (p) => { p.noise([150, 196, 236, 200], 14); for (let k = 0; k < 5; k++) { let x = Math.floor(p.r() * 16), y = Math.floor(p.r() * 16); for (let j = 0; j < 6; j++) { p.set(x, y, [220, 240, 255, 230]); x++; y += p.r() < 0.5 ? 1 : 0; } } },
  water: (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, mix([34, 92, 170], [64, 140, 210], (Math.sin(x * 0.8 + y * 0.4) + 1) / 2)); },
  magma: (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = Math.sin(x * 0.9 + Math.sin(y * 0.6) * 2) + Math.sin(y * 0.8 + x * 0.3);
      p.set(x, y, v > 0.6 ? [255, 220, 90] : v > -0.2 ? p.jitter([238, 110, 30], 20) : p.jitter([120, 32, 18], 16));
    }
  },
  ash_log: (p) => bark(p, [150, 136, 118], [104, 92, 80], true),
  ash_log_top: (p) => rings(p, [130, 118, 102], [214, 186, 140], [182, 152, 110]),
  pine_log: (p) => { p.noise([104, 66, 48], 14); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) if ((x + y) % 7 < 5) p.set(x, (y + (x % 8 < 4 ? 0 : 2)) % 16, [72, 44, 34]); },
  pine_log_top: (p) => rings(p, [92, 58, 42], [196, 150, 100], [164, 118, 76]),
  palm_log: (p) => { p.noise([170, 140, 96], 12); for (let y = 0; y < 16; y += 3) for (let x = 0; x < 16; x++) p.set(x, (y + Math.floor(x / 4)) % 16, [128, 100, 66]); },
  palm_log_top: (p) => rings(p, [150, 120, 80], [208, 182, 130], [176, 150, 104]),
  ash_leaves: (p) => leaves(p, [70, 140, 64], [140, 200, 96], true),
  ash_leaves_o: (p) => leaves(p, [70, 140, 64], [140, 200, 96], false),
  pine_leaves: (p) => needles(p, [44, 98, 74], [92, 150, 110], true),
  pine_leaves_o: (p) => needles(p, [44, 98, 74], [92, 150, 110], false),
  palm_leaves: (p) => fronds(p, [96, 170, 70], [170, 214, 110], true),
  palm_leaves_o: (p) => fronds(p, [96, 170, 70], [170, 214, 110], false),
  ash_planks: (p) => boards(p, [206, 170, 118], [134, 102, 66], false),
  pine_planks: (p) => boards(p, [158, 102, 66], [96, 58, 38], true),
  rubble: (p) => voronoi(p, 8, [128, 130, 136], [70, 70, 76], 40),
  mossy_rubble: (p) => { voronoi(p, 8, [124, 128, 130], [66, 70, 66], 40); for (let k = 0; k < 40; k++) { const x = Math.floor(p.r() * 16), y = Math.floor(p.r() * 16); if (p.r() < 0.7 || y > 8) p.set(x, y, p.jitter([82, 140, 70], 20)); } },
  stone_bricks: (p) => {
    p.noise([140, 142, 150], 12);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 8), ox = row ? 4 : 0;
      const bx = (x + ox) % 8, by = y % 8;
      if (by === 7 || bx === 7) p.set(x, y, [82, 84, 92]);
      else if (by === 0 || bx === 0) p.add(x, y, 22);
      else if (by === 6 || bx === 6) p.add(x, y, -18);
    }
  },
  clay_bricks: (p) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = Math.floor(y / 4), ox = row % 2 ? 3 : 0;
      const bx = (x + ox) % 6, by = y % 4;
      if (by === 3 || bx === 5) p.set(x, y, [196, 186, 170]);
      else p.set(x, y, p.jitter([176 - row * 4, 82, 58], 16));
    }
  },
  glass: (p) => {
    p.clear();
    for (let i = 0; i < 16; i++) { p.set(i, 0, [210, 232, 240]); p.set(i, 15, [160, 190, 204]); p.set(0, i, [210, 232, 240]); p.set(15, i, [160, 190, 204]); }
    for (let i = 3; i < 8; i++) p.set(i, 11 - i, [236, 248, 255]);
    for (let i = 8; i < 11; i++) p.set(i, 19 - i, [236, 248, 255]);
  },
  coal_ore: (p) => ore(p, () => painters.stone(p), [38, 36, 42], [90, 90, 100], 6),
  copper_ore: (p) => ore(p, () => painters.stone(p), [214, 120, 64], [96, 210, 180], 5),
  iron_ore: (p) => ore(p, () => painters.stone(p), [210, 172, 150], [246, 228, 214], 5),
  sunstone_ore: (p) => ore(p, () => painters.slate(p), [252, 196, 48], [255, 246, 170], 5),
  azurite_ore: (p) => ore(p, () => painters.slate(p), [40, 92, 220], [150, 210, 255], 4),
  glowshard_ore: (p) => ore(p, () => painters.stone(p), [80, 240, 220], [220, 255, 250], 6),
  tall_grass: (p) => { p.clear(); for (let k = 0; k < 9; k++) { let x = 1 + Math.floor(p.r() * 14); const h = 6 + Math.floor(p.r() * 9); for (let j = 0; j < h; j++) { p.set(x, 15 - j, mix([60, 124, 56], [140, 206, 110], j / h)); if (j % 4 === 3) x += p.r() < 0.5 ? 1 : -1; } } },
  sunpetal: (p) => { p.clear(); plantStem(p, 7, 7, 15, [64, 130, 60]); p.set(6, 11, [80, 150, 70]); p.set(8, 12, [80, 150, 70]); for (const [x, y] of [[7, 3], [5, 5], [9, 5], [7, 7], [6, 4], [8, 4], [6, 6], [8, 6], [5, 4], [9, 6]]) p.set(x, y, [255, 206, 60]); p.set(7, 5, [190, 90, 30]); },
  bluebell: (p) => { p.clear(); plantStem(p, 8, 4, 15, [56, 120, 70]); for (const [x, y] of [[6, 5], [6, 6], [7, 7], [10, 7], [10, 8], [9, 9], [6, 10], [7, 11]]) p.set(x, y, [110, 120, 236]); p.set(7, 4, [60, 130, 70]); p.set(9, 6, [60, 130, 70]); },
  berry_bush: (p) => leaves(p, [52, 112, 60], [96, 160, 80], true),
  berry_bush_ripe: (p) => { leaves(p, [52, 112, 60], [96, 160, 80], true); for (let k = 0; k < 9; k++) { const x = 1 + Math.floor(p.r() * 14), y = 1 + Math.floor(p.r() * 14); p.set(x, y, [236, 70, 50]); p.set(x + 1, y, [196, 40, 40]); p.set(x, y - 1, [255, 160, 120]); } },
  cactus: (p) => { p.clear(); for (let y = 0; y < 16; y++) for (let x = 1; x < 15; x++) p.set(x, y, p.jitter((x % 4 === 1) ? [52, 120, 64] : [74, 150, 80], 10)); for (let y = 2; y < 16; y += 4) { p.set(1, y, [236, 230, 190]); p.set(14, y + 2, [236, 230, 190]); p.set(7, y + 1, [236, 230, 190]); } },
  cactus_top: (p) => { p.clear(); for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) p.set(x, y, p.jitter([86, 164, 90], 12)); p.set(7, 7, [240, 200, 120]); p.set(8, 8, [240, 200, 120]); },
  dry_shrub: (p) => { p.clear(); const br = (x: number, y: number, dx: number, n: number) => { for (let j = 0; j < n; j++) { p.set(x, y, [130, 96, 56]); x += dx; y--; } }; br(8, 15, 0, 5); br(8, 11, 1, 5); br(8, 11, -1, 5); br(8, 13, 1, 3); br(8, 9, -1, 4); },
  glowcap: (p) => { p.clear(); plantStem(p, 7, 9, 15, [220, 220, 200]); plantStem(p, 8, 9, 15, [200, 200, 180]); for (let y = 4; y < 9; y++) for (let x = 3; x < 13; x++) if ((x - 7.5) ** 2 / 25 + (y - 8.5) ** 2 / 16 < 1) p.set(x, y, p.jitter([90, 230, 220], 18)); for (const [x, y] of [[5, 6], [9, 5], [10, 7]]) p.set(x, y, [230, 255, 250]); },
  torch: (p) => { p.clear(); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, y < 6 ? (y < 3 ? [255, 236, 140] : [255, 150, 40]) : p.jitter([132, 96, 60], 14)); },
  workbench_top: (p) => { boards(p, [196, 158, 104], [120, 90, 58], false); for (let i = 2; i < 14; i++) { p.set(i, 2, [90, 64, 40]); p.set(i, 13, [90, 64, 40]); p.set(2, i, [90, 64, 40]); p.set(13, i, [90, 64, 40]); } for (let i = 4; i < 12; i += 3) for (let j = 4; j < 12; j += 3) p.set(i, j, [150, 150, 160]); },
  workbench_side: (p) => { boards(p, [176, 136, 88], [110, 80, 50], true); for (let x = 3; x < 13; x++) { p.set(x, 5, [150, 154, 164]); p.set(x, 6, [110, 112, 120]); } for (let y = 7; y < 12; y++) p.set(8, y, [96, 70, 44]); },
  workbench_front: (p) => { boards(p, [176, 136, 88], [110, 80, 50], true); for (let y = 3; y < 13; y++) p.set(4, y, [100, 72, 46]); for (let x = 2; x < 7; x++) p.set(x, 3, [160, 162, 170]); p.rect(9, 4, 4, 2, [160, 162, 170]); p.rect(10, 6, 2, 7, [100, 72, 46]); },
  kiln_side: (p) => painters.clay_bricks(p),
  kiln_top: (p) => { painters.clay_bricks(p); p.rect(5, 5, 6, 6, [40, 30, 28]); p.rect(6, 6, 4, 4, [70, 40, 30]); },
  kiln_front: (p) => { painters.clay_bricks(p); p.rect(4, 7, 8, 7, [30, 22, 20]); for (let x = 5; x < 11; x++) { p.set(x, 12, [255, 140, 40]); p.set(x, 13, [220, 90, 30]); if (x % 2) p.set(x, 11, [255, 200, 90]); } p.rect(4, 6, 8, 1, [120, 120, 126]); },
  crate_side: (p) => { boards(p, [170, 128, 80], [104, 74, 44], false); for (let i = 0; i < 16; i++) { p.set(i, 0, [90, 62, 36]); p.set(i, 15, [90, 62, 36]); p.set(0, i, [90, 62, 36]); p.set(15, i, [90, 62, 36]); p.set(i, i, [118, 84, 50]); } p.rect(6, 6, 4, 3, [180, 160, 90]); p.set(7, 7, [60, 50, 30]); p.set(8, 7, [60, 50, 30]); },
  crate_top: (p) => { boards(p, [176, 134, 84], [104, 74, 44], true); for (let i = 0; i < 16; i++) { p.set(i, 0, [90, 62, 36]); p.set(i, 15, [90, 62, 36]); p.set(0, i, [90, 62, 36]); p.set(15, i, [90, 62, 36]); } },
  door_lower: (p) => { boards(p, [164, 118, 74], [100, 70, 42], true); for (let i = 0; i < 16; i++) { p.set(0, i, [96, 66, 40]); p.set(15, i, [96, 66, 40]); p.set(i, 15, [96, 66, 40]); } for (let x = 1; x < 15; x++) p.set(x, 6, [96, 66, 40]); p.set(12, 2, [220, 190, 90]); p.set(12, 3, [180, 150, 60]); },
  door_upper: (p) => { boards(p, [164, 118, 74], [100, 70, 42], true); for (let i = 0; i < 16; i++) { p.set(0, i, [96, 66, 40]); p.set(15, i, [96, 66, 40]); p.set(i, 0, [96, 66, 40]); } for (let y = 3; y < 11; y++) for (let x = 3; x < 13; x++) p.set(x, y, (x === 7 || x === 8 || y === 6 || y === 7) ? [96, 66, 40] : [0, 0, 0, 0]); },
  farmland: (p) => { p.noise([98, 64, 44], 16); for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) { p.set(x, y, [70, 44, 30]); p.set(x, y + 1, [120, 84, 58]); } },
  lumen_lamp: (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); p.set(x, y, d > 6.5 ? [120, 100, 70] : p.jitter(mix([255, 250, 210], [255, 196, 90], d / 7), 10)); } for (let i = 1; i < 15; i++) { p.set(i, 7, [200, 160, 90]); p.set(7, i, [200, 160, 90]); } },
  cloth_white: (p) => cloth(p, [234, 232, 226]),
  cloth_red: (p) => cloth(p, [196, 58, 52]),
  cloth_blue: (p) => cloth(p, [52, 94, 186]),
  cloth_green: (p) => cloth(p, [72, 146, 74]),
  cloth_yellow: (p) => cloth(p, [236, 196, 60]),
  cloth_black: (p) => cloth(p, [44, 42, 50]),
  tile_floor: (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const a = (Math.floor(x / 4) + Math.floor(y / 4)) % 2; let c: C = a ? [222, 214, 196] : [70, 132, 140]; if (x % 4 === 3 || y % 4 === 3) c = [140, 134, 124]; p.set(x, y, p.jitter(c, 8)); } },
  copper_block: (p) => metal(p, [212, 124, 72], [120, 220, 190]),
  iron_block: (p) => metal(p, [206, 204, 206], [120, 120, 130]),
  sunstone_block: (p) => metal(p, [250, 204, 70], [255, 250, 200]),
  azurite_block: (p) => metal(p, [56, 108, 220], [170, 220, 255]),
  pillar_side: (p) => { p.noise([200, 196, 186], 8); for (let y = 0; y < 16; y++) for (const x of [3, 7, 11]) p.shade(x, y, 0.85); for (let x = 0; x < 16; x++) { p.shade(x, 0, 0.8); p.shade(x, 15, 0.8); } },
  pillar_top: (p) => { p.noise([206, 202, 192], 8); for (let i = 0; i < 16; i++) { p.shade(i, 0, 0.8); p.shade(0, i, 0.8); p.shade(i, 15, 0.8); p.shade(15, i, 0.8); } p.rect(6, 6, 4, 4, [180, 176, 166]); },
  ash_sapling: (p) => { p.clear(); plantStem(p, 7, 8, 15, [110, 86, 60]); for (const [x, y] of [[5, 6], [6, 5], [7, 4], [8, 5], [9, 6], [6, 7], [8, 7], [10, 5], [4, 7], [7, 6]]) p.set(x, y, [90, 170, 76]); },
  pine_sapling: (p) => { p.clear(); plantStem(p, 7, 6, 15, [90, 60, 42]); for (let y = 3; y < 13; y += 3) for (let x = 7 - (y / 3); x <= 7 + (y / 3); x++) p.set(Math.round(x), y, [50, 110, 80]); },
  // ---- caves ----
  moss: (p) => { p.noise([86, 132, 64], 22, 8); for (let k = 0; k < 26; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), [130, 180, 92]); for (let k = 0; k < 6; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), [210, 120, 190]); },
  moss_side: (p) => { painters.dirt(p); for (let x = 0; x < 16; x++) { const h = 4 + Math.floor(p.r() * 5); for (let y = 0; y < h; y++) p.set(x, y, p.jitter([90, 138, 66], 18)); } },
  glow_vine: (p) => { p.clear(); for (const x0 of [4, 8, 12]) { let x = x0; for (let y = 0; y < 16; y++) { if (y > 10 + (x0 % 5)) break; p.set(x, y, [60, 120, 80]); if (y % 3 === 1) { p.set(x + 1, y, [80, 150, 90]); } if (y % 4 === 2) p.set(x - 1, y, [255, 214, 110]); if (p.r() < 0.3) x += p.r() < 0.5 ? 1 : -1; } } },
  crystal_block: (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = ((x * 3 + y * 5) % 11) / 11; p.set(x, y, mix([150, 90, 220], [220, 190, 255], d)); } for (let i = 0; i < 16; i++) { p.set(i, (i * 2) % 16, [250, 240, 255]); p.set((i * 3) % 16, i, [120, 70, 190]); } },
  crystal_shard: (p) => { p.clear(); for (const [cx, h, w] of [[4, 10, 1], [8, 14, 2], [12, 8, 1], [6, 6, 1]]) for (let y = 0; y < h; y++) for (let dx = -w; dx <= w; dx++) { if (Math.abs(dx) > w * (1 - y / h) + 0.3) continue; p.set(cx + dx, 15 - y, dx < 0 ? [170, 110, 235] : dx > 0 ? [120, 70, 190] : [235, 215, 255]); } },
  frostquartz_ore: (p) => ore(p, () => painters.stone(p), [170, 230, 250], [250, 255, 255], 5),
  rubellite_ore: (p) => ore(p, () => painters.slate(p), [220, 40, 80], [255, 160, 180], 4),
  mud: (p) => { p.noise([86, 68, 56], 14); for (let k = 0; k < 10; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), [110, 92, 76]); },
  basalt: (p) => { p.noise([58, 56, 62], 14); for (const x of [3, 8, 12]) for (let y = 0; y < 16; y++) p.shade(x, y, 0.75); },
  basalt_top: (p) => voronoi(p, 7, [66, 64, 70], [36, 34, 40], 16),
  // ---- Ashen Wastes ----
  ash_soil: (p) => { p.noise([92, 84, 82], 18); for (let k = 0; k < 7; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), [255, 120, 40]); },
  charred_log: (p) => { bark(p, [44, 38, 38], [20, 18, 18], true); for (let k = 0; k < 6; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), [240, 100, 30]); },
  charred_log_top: (p) => rings(p, [40, 34, 34], [120, 50, 30], [80, 30, 24]),
  ember_leaves: (p) => leaves(p, [180, 60, 30], [255, 170, 60], true),
  ember_leaves_o: (p) => leaves(p, [180, 60, 30], [255, 170, 60], false),
  emberite_ore: (p) => ore(p, () => painters.basalt(p), [255, 110, 30], [255, 230, 120], 5),
  // ---- Celestia ----
  sky_grass_top: (p) => { p.noise([120, 210, 196], 18, 10); for (let k = 0; k < 24; k++) p.set(Math.floor(p.r() * 16), Math.floor(p.r() * 16), [200, 250, 236]); },
  sky_grass_side: (p) => { painters.skystone(p); for (let x = 0; x < 16; x++) { const h = 3 + Math.floor(p.r() * 3); for (let y = 0; y < h; y++) p.set(x, y, p.jitter([120, 210, 196], 14)); } },
  skystone: (p) => stoneBase(p, [196, 186, 222], [172, 160, 204]),
  cloud: (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, p.jitter(mix([255, 255, 255], [214, 226, 246], (Math.sin(x * 0.7) + Math.cos(y * 0.6) + 2) / 5), 6)); },
  starstone_ore: (p) => ore(p, () => painters.skystone(p), [255, 230, 120], [255, 255, 240], 6),
  silver_leaves: (p) => leaves(p, [170, 196, 200], [236, 246, 250], true),
  silver_leaves_o: (p) => leaves(p, [170, 196, 200], [236, 246, 250], false),
  silver_log: (p) => bark(p, [226, 226, 232], [150, 150, 170], true),
  silver_log_top: (p) => rings(p, [200, 200, 210], [236, 230, 214], [210, 200, 180]),
  // ---- rifts ----
  sky_rift: (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const a = Math.atan2(y - 7.5, x - 7.5), d = Math.hypot(x - 7.5, y - 7.5); const v = Math.sin(a * 3 + d * 0.9); p.set(x, y, d > 7 ? [220, 220, 240] : mix([90, 170, 255], [240, 250, 255], (v + 1) / 2)); } },
  ash_rift: (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const a = Math.atan2(y - 7.5, x - 7.5), d = Math.hypot(x - 7.5, y - 7.5); const v = Math.sin(a * 3 - d * 0.9); p.set(x, y, d > 7 ? [50, 40, 40] : mix([200, 40, 20], [255, 200, 80], (v + 1) / 2)); } },
  // ---- furniture ----
  ladder: (p) => { p.clear(); for (let y = 0; y < 16; y++) { p.set(2, y, [140, 100, 60]); p.set(3, y, [110, 78, 46]); p.set(12, y, [140, 100, 60]); p.set(13, y, [110, 78, 46]); } for (const y of [2, 7, 12]) for (let x = 2; x < 14; x++) { p.set(x, y, [168, 124, 76]); p.set(x, y + 1, [118, 84, 50]); } },
  bed_top: (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, y < 5 ? p.jitter([236, 232, 222], 6) : p.jitter(((x + y) % 4 < 2) ? [60, 150, 150] : [48, 128, 130], 6)); for (let x = 0; x < 16; x++) p.set(x, 5, [40, 100, 100]); },
  bed_side: (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, y > 9 ? [120, 86, 52] : p.jitter([52, 136, 138], 8)); },
  lantern: (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const edge = x < 2 || x > 13 || y < 2 || y > 13; p.set(x, y, edge ? [60, 62, 70] : p.jitter(mix([255, 236, 160], [255, 170, 60], Math.hypot(x - 7.5, y - 7.5) / 8), 10)); } },
  bookshelf: (p) => { boards(p, [176, 136, 88], [110, 80, 50], false); const cols = [[160, 50, 50], [50, 90, 160], [60, 130, 70], [200, 160, 60], [120, 60, 140]]; for (const y0 of [1, 9]) { let x = 1; while (x < 15) { const w = 1 + Math.floor(p.r() * 2), c = cols[Math.floor(p.r() * cols.length)] as C; const h = 5 + Math.floor(p.r() * 2); for (let i = 0; i < w && x < 15; i++, x++) for (let y = 0; y < h; y++) p.set(x, y0 + 6 - y, y === 1 ? [230, 220, 180] : c); } } },
  keg_side: (p) => { boards(p, [150, 90, 50], [90, 52, 30], true); for (const y of [2, 13]) for (let x = 0; x < 16; x++) { p.set(x, y, [80, 82, 90]); p.set(x, y + 1, [60, 62, 70]); } p.rect(5, 6, 6, 4, [220, 40, 30]); p.rect(6, 7, 4, 2, [255, 220, 120]); },
  keg_top: (p) => { rings(p, [90, 52, 30], [150, 90, 50], [120, 70, 40]); p.rect(7, 3, 2, 4, [40, 40, 40]); p.set(7, 2, [255, 200, 80]); },
  frostquartz_block: (p) => metal(p, [176, 228, 246], [255, 255, 255]),
  rubellite_block: (p) => metal(p, [210, 40, 76], [255, 170, 190]),
  emberite_block: (p) => metal(p, [240, 110, 34], [255, 230, 140]),
  starstone_block: (p) => metal(p, [250, 226, 120], [255, 255, 240]),
};
for (let s = 0; s < 8; s++) painters['grain' + s] = (p) => {
  p.clear();
  const h = 3 + Math.floor(s * 1.6);
  const ripe = s === 7;
  for (const x of [2, 5, 8, 11, 14]) {
    for (let j = 0; j < h; j++) p.set(x, 15 - j, ripe ? [196, 170, 80] : mix([70, 150, 60], [150, 170, 70], s / 7));
    if (s >= 5) for (let j = 0; j < 3; j++) { p.set(x, 15 - h + j, ripe ? [236, 204, 110] : [170, 190, 90]); p.set(x + 1, 15 - h + j + 1, ripe ? [214, 180, 90] : [150, 170, 80]); }
  }
};
for (let s = 0; s < 8; s++) painters['crack' + s] = (p) => {
  p.clear();
  const r = mulberry32(1234);
  const n = 2 + s * 2;
  for (let k = 0; k < n; k++) {
    let x = 8 + Math.floor((r() - 0.5) * 6), y = 8 + Math.floor((r() - 0.5) * 6);
    const len = 3 + s;
    const dx = r() < 0.5 ? 1 : -1, dy = r() < 0.5 ? 1 : -1;
    for (let j = 0; j < len; j++) { p.set(x, y, [20, 20, 24, 220]); if (r() < 0.5) x += dx; else y += dy; }
  }
};

export interface AtlasInfo { texture: THREE.Texture; canvas: HTMLCanvasElement; tileCanvas: (t: number) => HTMLCanvasElement; avgColor: (t: number) => [number, number, number] }

let cached: AtlasInfo | null = null;

export function buildAtlas(): AtlasInfo {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE; canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  const tiles: HTMLCanvasElement[] = [];
  const avg: [number, number, number][] = [];
  TILE_NAMES.forEach((name, i) => {
    const p = new P(name);
    (painters[name] || ((q: P) => q.fill([255, 0, 255])))(p);
    const tc = document.createElement('canvas'); tc.width = T; tc.height = T;
    const tctx = tc.getContext('2d')!;
    tctx.putImageData(new ImageData(p.d, T, T), 0, 0);
    tiles[i] = tc;
    let r = 0, g = 0, b = 0, n = 0;
    for (let k = 0; k < p.d.length; k += 4) if (p.d[k + 3] > 100) { r += p.d[k]; g += p.d[k + 1]; b += p.d[k + 2]; n++; }
    avg[i] = n ? [r / n / 255, g / n / 255, b / n / 255] : [0.5, 0.5, 0.5];
    const cx = (i % ATLAS_COLS) * ATLAS_CELL, cy = Math.floor(i / ATLAS_COLS) * ATLAS_CELL;
    const pad = (ATLAS_CELL - T) / 2;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      ctx.save();
      ctx.beginPath(); ctx.rect(cx, cy, ATLAS_CELL, ATLAS_CELL); ctx.clip();
      ctx.drawImage(tc, cx + pad + ox * T, cy + pad + oy * T);
      ctx.restore();
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  cached = { texture, canvas, tileCanvas: (t) => tiles[t], avgColor: (t) => avg[t] || [0.5, 0.5, 0.5] };
  return cached;
}
