// Item registry: every block item (id < 256) plus tools, materials and food (id >= 256).
import { B, BLOCKS, SHAPE_CROSS, SHAPE_CUBE, faceTile } from '../world/Blocks';
import { hashString, mulberry32 } from '../world/Noise';

export type ToolType = 'pick' | 'axe' | 'spade' | 'blade' | 'tiller';
export interface ToolInfo { type: ToolType; tier: number; speed: number; damage: number; durability: number }

export interface ItemDef {
  id: number;
  key: string;
  name: string;
  maxStack: number;
  block?: number;        // places this block
  tool?: ToolInfo;
  food?: number;         // hunger restored
  desc?: string;
  fuel?: boolean;
}

export const ITEMS: ItemDef[] = [];
export const I: Record<string, number> = {};

function reg(id: number, key: string, name: string, o: Partial<ItemDef> = {}) {
  const d: ItemDef = { id, key, name, maxStack: 64, ...o };
  ITEMS[id] = d; I[key] = id;
  return d;
}

for (const b of BLOCKS) if (b && b.item) reg(b.id, b.key, b.name, { block: b.id });
ITEMS[B.WATER] = { id: B.WATER, key: 'water', name: 'Water', maxStack: 64, block: B.WATER };
ITEMS[B.MAGMA] = { id: B.MAGMA, key: 'magma', name: 'Magma', maxStack: 64, block: B.MAGMA };

let nid = 256;
const r = (key: string, name: string, o: Partial<ItemDef> = {}) => reg(nid++, key, name, o);
r('stick', 'Stick', { fuel: true });
r('fiber', 'Plant Fiber');
r('coal', 'Coal', { fuel: true });
r('copper_ingot', 'Copper Ingot');
r('iron_ingot', 'Iron Ingot');
r('sunstone_ingot', 'Sunstone Ingot');
r('azurite', 'Azurite Gem');
r('glowshard', 'Glowshard');
r('glow_dust', 'Glow Dust');
r('gloom_essence', 'Gloom Essence', { desc: 'Dropped by Gloomlings.' });
r('fur', 'Hopkin Fur');
r('berries', 'Emberberries', { food: 2 });
r('raw_meat', 'Raw Haunch', { food: 2 });
r('cooked_meat', 'Roast Haunch', { food: 7 });
r('seeds', 'Grain Seeds', { desc: 'Plant on tilled soil.' });
r('grain_item', 'Grain');
r('bread', 'Trail Bread', { food: 5 });
r('door', 'Door', { maxStack: 16 });
r('bucket', 'Clay Bucket', { maxStack: 16 });
r('water_bucket', 'Bucket of Water', { maxStack: 1 });
r('crag_shard', 'Crag Shard', { desc: 'Dropped by Crag Crawlers.' });
r('glowcap_stew', 'Glowcap Stew', { food: 6, maxStack: 1 });

export const TIERS = [
  { key: 'wood', name: 'Wooden', tier: 1, speed: 2, dmg: 0, dur: 60 },
  { key: 'stone', name: 'Stone', tier: 2, speed: 4, dmg: 1, dur: 130 },
  { key: 'copper', name: 'Copper', tier: 3, speed: 5, dmg: 2, dur: 200 },
  { key: 'iron', name: 'Iron', tier: 4, speed: 6.5, dmg: 3, dur: 320 },
  { key: 'azure', name: 'Azure', tier: 5, speed: 9, dmg: 5, dur: 1200 },
];
const KINDS: { type: ToolType; name: string; base: number }[] = [
  { type: 'pick', name: 'Pick', base: 2 },
  { type: 'axe', name: 'Hatchet', base: 3 },
  { type: 'spade', name: 'Spade', base: 1.5 },
  { type: 'blade', name: 'Blade', base: 4 },
];
for (const t of TIERS) for (const k of KINDS) {
  r(`${t.key}_${k.type}`, `${t.name} ${k.name}`, { maxStack: 1, tool: { type: k.type, tier: t.tier, speed: t.speed, damage: k.base + t.dmg + (k.type === 'blade' ? t.tier : 0), durability: t.dur } });
}
r('wood_tiller', 'Wooden Tiller', { maxStack: 1, tool: { type: 'tiller', tier: 1, speed: 1, damage: 1, durability: 60 } });
r('stone_tiller', 'Stone Tiller', { maxStack: 1, tool: { type: 'tiller', tier: 2, speed: 1, damage: 1, durability: 130 } });

export function item(id: number): ItemDef { return ITEMS[id] || ITEMS[B.STONE]; }
export function maxStack(id: number) { return item(id).maxStack; }
export function itemName(id: number) { return item(id)?.name ?? '?'; }

/** Mapping from tool kind to the block property it is effective on. */
export function toolMatches(tool: ToolType, blockTool: string) {
  if (tool === 'pick') return blockTool === 'pick';
  if (tool === 'axe') return blockTool === 'axe';
  if (tool === 'spade') return blockTool === 'spade';
  return false;
}

// ------------------------------------------------------------------------------------------
// Icons
// ------------------------------------------------------------------------------------------
type RGB = [number, number, number];
const TIER_COL: Record<number, RGB> = { 1: [170, 128, 76], 2: [140, 142, 150], 3: [214, 124, 72], 4: [216, 214, 218], 5: [70, 130, 236] };

function pix(draw: (set: (x: number, y: number, c: RGB, a?: number) => void, rnd: () => number) => void, seed: string): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(16, 16);
  const set = (x: number, y: number, col: RGB, a = 255) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const i = (Math.floor(y) * 16 + Math.floor(x)) * 4;
    img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = a;
  };
  draw(set, mulberry32(hashString(seed)));
  // outline
  const out = new Uint8ClampedArray(img.data);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const i = (y * 16 + x) * 4;
    if (img.data[i + 3] > 0) continue;
    let near = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < 16 && ny < 16 && img.data[(ny * 16 + nx) * 4 + 3] > 200) near = true;
    }
    if (near) { out[i] = 26; out[i + 1] = 22; out[i + 2] = 30; out[i + 3] = 200; }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
  return c;
}
const dk = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

function handle(set: any, len: number) { for (let i = 0; i < len; i++) { set(3 + i, 12 - i, [120, 84, 50]); set(4 + i, 12 - i, [92, 62, 38]); } }

function toolIcon(t: ToolInfo, key: string) {
  const c = TIER_COL[t.tier] || [200, 200, 200];
  return pix((set) => {
    if (t.type === 'blade') {
      for (let i = 0; i < 9; i++) { set(5 + i, 10 - i, c); set(6 + i, 10 - i, dk(c, 0.75)); set(5 + i, 9 - i, [Math.min(255, c[0] + 50), Math.min(255, c[1] + 50), Math.min(255, c[2] + 50)]); }
      for (let i = -2; i <= 2; i++) set(5 + i, 10 + i, [90, 70, 50]);
      set(3, 13, [120, 84, 50]); set(4, 12, [120, 84, 50]); set(2, 14, dk(c, 0.8));
    } else {
      handle(set, 10);
      if (t.type === 'pick') { for (let i = 0; i < 9; i++) { const x = 6 + i, y = 2 + Math.round(Math.abs(i - 4) * 0.6); set(x, y, c); set(x, y + 1, dk(c, 0.7)); } }
      else if (t.type === 'axe') { for (let y = 1; y < 8; y++) for (let x = 10; x < 15; x++) if ((x - 10) + Math.abs(y - 4) < 6) set(x, y, (x === 14 || y === 1) ? [Math.min(255, c[0] + 40), Math.min(255, c[1] + 40), Math.min(255, c[2] + 40)] : c); }
      else if (t.type === 'spade') { for (let y = 1; y < 6; y++) for (let x = 11; x < 15; x++) if (!(y === 1 && (x === 11 || x === 14))) set(x, y, y === 5 ? dk(c, 0.7) : c); }
      else if (t.type === 'tiller') { for (let x = 9; x < 15; x++) set(x, 2, c); for (let y = 2; y < 6; y++) set(9, y, dk(c, 0.8)); }
    }
  }, key);
}

const ITEM_ART: Record<string, (set: any, r: () => number) => void> = {
  stick: (s) => { for (let i = 0; i < 11; i++) { s(3 + i, 13 - i, [150, 108, 64]); s(4 + i, 13 - i, [104, 72, 42]); } },
  fiber: (s) => { for (let k = 0; k < 4; k++) for (let i = 0; i < 12; i++) s(4 + k * 2 + Math.round(Math.sin(i * 0.6 + k) * 1.2), 2 + i, k % 2 ? [120, 170, 80] : [150, 196, 100]); },
  coal: (s, r) => { for (let y = 4; y < 13; y++) for (let x = 3; x < 13; x++) if ((x - 8) ** 2 + (y - 8.5) ** 2 < 20 + r() * 6) s(x, y, r() < 0.2 ? [80, 80, 90] : [36, 34, 40]); },
  copper_ingot: (s) => ingot(s, [214, 124, 72]),
  iron_ingot: (s) => ingot(s, [214, 212, 216]),
  sunstone_ingot: (s) => ingot(s, [250, 204, 70]),
  azurite: (s) => gem(s, [50, 110, 230]),
  glowshard: (s) => gem(s, [90, 240, 220]),
  glow_dust: (s, r) => { for (let k = 0; k < 22; k++) { const x = 3 + r() * 10, y = 5 + r() * 9; s(x, y, r() < 0.5 ? [250, 240, 150] : [180, 250, 220]); } },
  gloom_essence: (s) => { for (let y = 2; y < 14; y++) for (let x = 3; x < 13; x++) { const d = (x - 8) ** 2 + (y - 9) ** 2 * 0.8; if (d < 22 && !(y < 6 && Math.abs(x - 8) > y - 2)) s(x, y, d < 6 ? [200, 120, 255] : [90, 40, 130]); } },
  fur: (s, r) => { for (let y = 4; y < 13; y++) for (let x = 2; x < 14; x++) if (Math.abs(x - 8) < 6 - Math.abs(y - 8) * 0.4) s(x, y, r() < 0.3 ? [210, 196, 170] : [236, 226, 206]); },
  berries: (s) => { for (const [cx, cy] of [[6, 9], [10, 9], [8, 6], [8, 11]]) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 4) s(cx + x, cy + y, x + y < -1 ? [255, 150, 120] : [220, 50, 44]); s(8, 3, [70, 140, 60]); s(9, 2, [70, 140, 60]); },
  raw_meat: (s) => meat(s, [222, 96, 96], [250, 220, 210]),
  cooked_meat: (s) => meat(s, [150, 84, 46], [236, 214, 190]),
  seeds: (s, r) => { for (let k = 0; k < 7; k++) { const x = 4 + r() * 8, y = 5 + r() * 7; s(x, y, [196, 176, 90]); s(x + 1, y, [150, 130, 60]); } },
  grain_item: (s) => { for (let i = 0; i < 12; i++) s(8, 3 + i, [190, 160, 70]); for (let i = 0; i < 5; i++) { s(6, 3 + i * 2, [236, 204, 110]); s(10, 4 + i * 2, [236, 204, 110]); } },
  bread: (s) => { for (let y = 5; y < 12; y++) for (let x = 2; x < 14; x++) { const e = ((x - 8) / 6) ** 2 + ((y - 8.5) / 3.5) ** 2; if (e < 1) s(x, y, y < 7 ? [222, 170, 96] : [190, 128, 64]); } for (const x of [5, 8, 11]) s(x, 6, [250, 220, 160]); },
  door: (s) => { for (let y = 1; y < 15; y++) for (let x = 4; x < 12; x++) s(x, y, (x === 4 || x === 11 || y === 1 || y === 14 || y === 7) ? [96, 66, 40] : [164, 118, 74]); s(10, 9, [230, 200, 90]); },
  bucket: (s) => bucket(s, null),
  water_bucket: (s) => bucket(s, [60, 130, 220]),
  crag_shard: (s) => gem(s, [130, 110, 96]),
  torch: (s) => { for (let i = 0; i < 9; i++) { s(7, 6 + i, [132, 96, 60]); s(8, 6 + i, [104, 74, 46]); } for (const [x, y, c] of [[7, 5, [255, 150, 40]], [8, 5, [255, 150, 40]], [7, 4, [255, 220, 120]], [8, 4, [255, 200, 90]], [7, 3, [255, 246, 190]], [8, 2, [255, 236, 150]], [6, 5, [240, 110, 30]], [9, 5, [240, 110, 30]]] as [number, number, number[]][]) s(x, y, c); },
  glowcap_stew: (s) => { for (let y = 8; y < 14; y++) for (let x = 2; x < 14; x++) if (Math.abs(x - 8) < 6 - (y - 8) * 0.5) s(x, y, [150, 100, 60]); for (let x = 3; x < 13; x++) s(x, 8, [90, 220, 210]); s(6, 7, [200, 255, 250]); s(9, 7, [200, 255, 250]); },
};
function ingot(s: any, c: RGB) { for (let y = 6; y < 12; y++) for (let x = 2 + (11 - y) * 0.5; x < 14 - (11 - y) * 0.5; x++) s(x, y, y === 6 ? [Math.min(255, c[0] + 40), Math.min(255, c[1] + 40), Math.min(255, c[2] + 40)] : y === 11 ? dk(c, 0.7) : c); }
function gem(s: any, c: RGB) { for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) { const d = Math.abs(x - 7.5) + Math.abs(y - 8) * 0.8; if (d < 6) s(x, y, d < 2 ? [Math.min(255, c[0] + 90), Math.min(255, c[1] + 90), Math.min(255, c[2] + 90)] : (x < 8 ? c : dk(c, 0.75))); } }
function meat(s: any, c: RGB, bone: RGB) { for (let y = 3; y < 12; y++) for (let x = 3; x < 12; x++) if ((x - 7) ** 2 + (y - 7) ** 2 < 17) s(x, y, (x + y) % 5 === 0 ? dk(c, 0.8) : c); for (let i = 0; i < 4; i++) s(11 + i * 0.7, 11 + i * 0.7, bone); s(14, 13, bone); s(13, 14, bone); }
function bucket(s: any, water: RGB | null) { for (let y = 5; y < 14; y++) for (let x = 3 + (y - 5) * 0.25; x < 13 - (y - 5) * 0.25; x++) s(x, y, y === 5 ? [140, 90, 60] : [182, 110, 72]); for (let x = 4; x < 12; x++) s(x, 3, [90, 80, 80]); s(3, 4, [90, 80, 80]); s(12, 4, [90, 80, 80]); if (water) for (let x = 4; x < 12; x++) { s(x, 5, water); s(x, 6, dk(water, 0.85)); } }

/** Item icon canvases (16x16 for items, 32x32 isometric for cube blocks). */
const iconCache = new Map<number, string>();
const iconCanvas = new Map<number, HTMLCanvasElement>();
let tileCanvasFn: ((t: number) => HTMLCanvasElement) | null = null;
export function setTileCanvasSource(f: (t: number) => HTMLCanvasElement) { tileCanvasFn = f; }

export function itemCanvas(id: number): HTMLCanvasElement {
  const c = iconCanvas.get(id);
  if (c) return c;
  const d = item(id);
  let out: HTMLCanvasElement;
  if (ITEM_ART[d.key]) out = pix(ITEM_ART[d.key], d.key);
  else if (d.block !== undefined && tileCanvasFn) {
    const bd = BLOCKS[d.block];
    if (bd.shape === SHAPE_CUBE || d.block === B.CACTUS || d.block === B.WATER || d.block === B.MAGMA) out = isoBlock(d.block);
    else {
      out = document.createElement('canvas'); out.width = 16; out.height = 16;
      out.getContext('2d')!.drawImage(tileCanvasFn(faceTile(d.block, 0, bd.shape === SHAPE_CROSS && d.block === B.BERRY_BUSH ? 1 : 0)), 0, 0);
    }
  } else if (d.tool) out = toolIcon(d.tool, d.key);
  else out = pix(ITEM_ART[d.key] || ((s: any) => { for (let i = 4; i < 12; i++) for (let j = 4; j < 12; j++) s(i, j, [255, 0, 255]); }), d.key);
  iconCanvas.set(id, out);
  return out;
}

export function itemIcon(id: number): string {
  let u = iconCache.get(id);
  if (!u) { u = itemCanvas(id).toDataURL(); iconCache.set(id, u); }
  return u;
}

function isoBlock(bid: number): HTMLCanvasElement {
  const S = 32;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const top = tileCanvasFn!(faceTile(bid, 2, 0)), left = tileCanvasFn!(faceTile(bid, 4, 0)), right = tileCanvasFn!(faceTile(bid, 0, 0));
  const w = S / 2;
  // top face
  ctx.setTransform(w / 16, w / 32, -w / 16, w / 32, S / 2, 1);
  ctx.drawImage(top, 0, 0);
  // left face
  ctx.setTransform(w / 16, w / 32, 0, w / 16, 0, S / 4 + 1);
  ctx.drawImage(left, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, 16, 16);
  // right face
  ctx.setTransform(w / 16, -w / 32, 0, w / 16, S / 2, S / 2 + 1);
  ctx.drawImage(right, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.36)'; ctx.fillRect(0, 0, 16, 16);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}
