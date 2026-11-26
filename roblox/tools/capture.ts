// Ejecuta el generador ORIGINAL de Port Solano (src/world/World.ts) y captura
// todas las primitivas (cajas, techos, cilindros, luces) en vez de crear mallas.
import { Geo, hex } from '../../src/world/Geo';
import { World } from '../../src/world/World';
import * as L from '../../src/world/CityLayout';
import { District } from '../../src/world/CityLayout';
import { Rng, hash2 } from '../../src/core/MathUtil';
import { PRESETS } from '../../src/settings/Quality';

export type Prim =
  | { k: 'box'; a: number[]; c: number[]; win: boolean; glow: boolean }
  | { k: 'rect'; a: number[]; c: number[] }
  | { k: 'quad'; a: number[]; ys: number[]; c: number[] }
  | { k: 'roof'; a: number[]; c: number[]; alongX: boolean }
  | { k: 'cyl'; a: number[]; c: number[] }
  | { k: 'blob'; a: number[]; c: number[] };

export const prims: Prim[] = [];
let glowing = false;
const G = Geo.prototype as any;
G.rect = function (x0: number, z0: number, x1: number, z1: number, y: number, color: any, shade = 1) {
  prims.push({ k: 'rect', a: [x0, z0, x1, z1, y], c: hex(color, shade) });
};
G.terrainQuad = function (x0: number, z0: number, x1: number, z1: number, y00: number, y01: number, y11: number, y10: number, cs: number[][]) {
  const c = [0, 1, 2].map((i) => (cs[0][i] + cs[1][i] + cs[2][i] + cs[3][i]) / 4);
  prims.push({ k: 'quad', a: [x0, z0, x1, z1], ys: [y00, y01, y11, y10], c });
};
G.box = function (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: any, windowed = false, shade = 1) {
  prims.push({ k: 'box', a: [x0, y0, z0, x1, y1, z1], c: hex(color, shade), win: windowed, glow: glowing });
};
G.glow = function (...args: any[]) { glowing = true; this.box(...args.slice(0, 7), false); glowing = false; };
G.pool = function () {};
G.roof = function (x0: number, z0: number, x1: number, z1: number, y: number, h: number, color: any, alongX = true) {
  prims.push({ k: 'roof', a: [x0, z0, x1, z1, y, h], c: hex(color), alongX });
};
G.cyl = function (cx: number, y0: number, cz: number, rb: number, rt: number, h: number, color: any, _s = 8, shade = 1) {
  prims.push({ k: 'cyl', a: [cx, y0, cz, rb, rt, h], c: hex(color, shade) });
};
G.blob = function (cx: number, cy: number, cz: number, r: number, color: any, shade = 1) {
  prims.push({ k: 'blob', a: [cx, cy, cz, r], c: hex(color, shade) });
};

// Simplificaciones para Roblox (menos piezas, mismo aspecto general)
const W = World.prototype as any;
const LINE_W = 0xe8e8e8, LINE_Y = 0xe6b422;
W.markingsV = function (ctx: any, X: number, za: number, zb: number, hw: number, dirt: boolean) {
  if (dirt) return;
  const g = ctx.geo, y = 0.045;
  if (hw > 7) { g.rect(X - 0.62, za, X + 0.12, zb, y, LINE_Y); }
  else g.rect(X - 0.12, za + 2, X + 0.12, zb - 2, y, LINE_Y);
  g.rect(X - hw + 0.4, za, X - hw + 0.55, zb, y, LINE_W); g.rect(X + hw - 0.55, za, X + hw - 0.4, zb, y, LINE_W);
};
W.markingsH = function (ctx: any, Z: number, xa: number, xb: number, hw: number, dirt: boolean) {
  if (dirt) return;
  const g = ctx.geo, y = 0.045;
  if (hw > 7) g.rect(xa, Z - 0.62, xb, Z + 0.12, y, LINE_Y);
  else g.rect(xa + 2, Z - 0.12, xb - 2, Z + 0.12, y, LINE_Y);
  g.rect(xa, Z - hw + 0.4, xb, Z - hw + 0.55, y, LINE_W); g.rect(xa, Z + hw - 0.55, xb, Z + hw - 0.4, y, LINE_W);
};
W.crosswalks = function () {};
let lampN = 0;
W.lamp = function (ctx: any, x: number, z: number, dx: number, dz: number) {
  if (lampN++ % 2 === 1) return; // una de cada dos farolas
  const g = ctx.geo;
  g.cyl(x, 0, z, 0.14, 0.1, 7.5, 0x45484d, 5);
  glowing = true; g.box(x + dx * 0.5 - 0.4, 7.2, z + dz * 0.5 - 0.4, x + dx * 1.5 + 0.4, 7.6, z + dz * 1.5 + 0.4, 0xffe3a0, false); glowing = false;
};
W.parkingLines = function (ctx: any, x0: number, z0: number, x1: number, z1: number) {
  for (let x = x0; x < x1; x += 6) ctx.geo.rect(x, z0, x + 0.12, z1, 0.07, 0xdddddd);
};

export function captureCity() {
  const tex = { windows: () => null, windowMask: () => null } as any;
  const world = new World(PRESETS.LOW, tex) as any;
  for (let ci = 0; ci < L.N; ci++) for (let cj = 0; cj < L.N; cj++) world.build(ci, cj, 0);

  // Puntos de interes (puertas), igual que el juego original
  const pois = L.POIS.map((p) => ({ id: p.id, name: p.name, kind: p.kind, x: p.x, z: p.z, color: p.color }));

  // Objetos escondidos: misma generacion que src/world/Pickups.ts
  const pickups: { x: number; z: number; hint: string }[] = [];
  const rng = new Rng(1999);
  const weapons = ['slugger', 'zap', 'rattler', 'brawler', 'longarm', 'cinder'];
  const add = (x: number, z: number, hint: string) => {
    if (L.isWater(x, z)) return;
    rng.next(); rng.pick(weapons); rng.next(); // mantiene la secuencia del original
    pickups.push({ x, z, hint });
  };
  for (let i = 0; i < L.N; i++) for (let j = 0; j < L.N; j++) {
    const d = L.cellDistrict(i, j);
    if (L.poiAtCell(i, j) || L.isConstructionCell(i, j)) continue;
    const lot = L.cellLot(i, j);
    if (lot.x1 - lot.x0 < 20) continue;
    const h = hash2(i, j, 4242);
    if ((d === District.Midtown || d === District.Poor) && h < 0.14) add(d === District.Poor ? lot.x0 + (lot.x1 - lot.x0 - 10) / 3 + 2.5 : (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, 'Callejon');
    else if (d === District.Park) add(L.lineCoord(i) + 22, L.lineCoord(j) + 22, 'Parque');
    else if (d === District.Rural && h < 0.12) add(lot.x0 + 8, lot.z0 + 8, 'Campo');
    else if (d === District.Suburb && h < 0.06) add(lot.x0 + 12, lot.z0 + 12, 'Patio trasero');
    else if (d === District.Beach && j % 3 === 0) add(1252, L.lineCoord(j) + 50, 'Final de un muelle');
    else if (d === District.Airport && h < 0.15) add(L.lineCoord(i) + 30, L.lineCoord(j) + 30, 'Aerodromo');
    else if (d === District.Industrial && h < 0.1) add(lot.x0 + 3, lot.z1 - 3, 'Patio industrial');
  }
  add(1300, -420, 'Orilla de Coral Key');
  add(1232, 747, 'Muelle de la marina');

  // Coches aparcados: junto a la acera de calles urbanas (cada pocas manzanas)
  const cars: { x: number; z: number; yaw: number }[] = [];
  for (let i = 1; i < L.N; i++) for (let j = 0; j < L.N; j++) {
    if (!L.vSegment(i, j) || hash2(i, j, 31) > 0.12) continue;
    const d = L.districtAt(L.lineCoord(i) + 1, L.lineCoord(j) + 50);
    if (!L.isUrban(d) || L.isBridgeV(i, j)) continue;
    const hw = L.lineHalfWidth('x', i);
    cars.push({ x: L.lineCoord(i) + hw - 2, z: L.lineCoord(j) + 50, yaw: 180 });
  }

  // Distritos por celda (para el HUD)
  const districts: number[] = [];
  for (let j = 0; j < L.N; j++) for (let i = 0; i < L.N; i++) districts.push(L.cellDistrict(i, j));
  return { pois, pickups, cars, names: L.DISTRICT_NAMES, districtGrid: districts };
}
