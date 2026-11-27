// Construye roblox/PortSolano.rbxl:
//  1. Ejecuta el generador original de la ciudad (src/world) y captura sus primitivas.
//  2. Convierte cada primitiva en Parts de Roblox (escala: 1 metro = SC studs).
//  3. Genera el modulo LayoutData (distritos, puntos de interes, objetos ocultos, coches).
//  4. Anade los scripts de roblox/src y escribe el archivo binario.
// Uso: npm run roblox:build  (o node roblox/build.mjs)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { prims, captureCity } from './capture';
import { Inst, writeRbxl, S, B, F, V3, CF, E, C3 } from './rbxl';
import { VEHICLES, TRAFFIC_MIX } from '../../src/vehicles/VehicleDefs';

const ROOT = process.env.ROBLOX_DIR!;
const SC = 2; // studs por metro

const MAT = {
  SmoothPlastic: 272, Neon: 288, Wood: 512, WoodPlanks: 528, Concrete: 816, Brick: 848,
  CorrodedMetal: 1040, Metal: 1088, Grass: 1280, Sand: 1296, Fabric: 1312, Ground: 1360, Asphalt: 1376, Glass: 1568,
};
const SHAPE = { Ball: 0, Block: 1, Cylinder: 2 };

const city = captureCity();

// ---------------------------------------------------------------- colores
const tmp = new THREE.Color();
function toRGB(c: number[]): [number, number, number] {
  tmp.setRGB(Math.min(1, Math.max(0, c[0])), Math.min(1, Math.max(0, c[1])), Math.min(1, Math.max(0, c[2])));
  const h = tmp.getHex();
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}
const near = (rgb: number[], hex: number, tol = 6) =>
  Math.abs(rgb[0] - ((hex >> 16) & 255)) <= tol && Math.abs(rgb[1] - ((hex >> 8) & 255)) <= tol && Math.abs(rgb[2] - (hex & 255)) <= tol;
const nearAny = (rgb: number[], list: number[], tol = 6) => list.some((h) => near(rgb, h, tol));
const mix = (a: number[], b: number[], t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const GLASS = [0x7ea4be, 0x6d8da6, 0x9fb7c9, 0x5f7a8f, 0xa9bcc7];
const ASPHALT = [0x2c2e33, 0x25272b, 0x3a3b40, 0x3b3d42, 0x4a4c52, 0x333640, 0x5f5e5a, 0x4a4a4a];
const LINES = [0xe8e8e8, 0xe6b422, 0xdddddd, 0xf0f0f0, 0xffd400];
const WOOD = [0x8a6a45, 0x9c7a55, 0x7a5a3a, 0x7a5a3a];
const TRUNK = [0x7a5a3a, 0x5a4331, 0x8a6a45];
const LEAF = [0x3f8a3c, 0x2f7a35, 0x4c7d3a, 0x3f7a3e, 0x5b8a3f, 0x4a7a4a];
const CONTAINER = [0xb03a2e, 0x2e6db0, 0xd9a21b, 0x3f8f5a, 0x7a7a7a, 0xe0e0e0];
const WATERISH = [0x35a8c8, 0x3e87a0, 0x4aa0c0];
const DARK_GLASS: [number, number, number] = [47, 66, 82];

// ---------------------------------------------------------------- instancias
const insts: Inst[] = [];
const svc = (cls: string, extra: Inst['props'] = {}) => { const i: Inst = { cls, props: { Name: S(cls), ...extra }, parent: null, service: true }; insts.push(i); return i; };
const folder = (name: string, parent: Inst) => { const i: Inst = { cls: 'Folder', props: { Name: S(name) }, parent }; insts.push(i); return i; };

const workspace = svc('Workspace', { StreamingEnabled: B(true) });
svc('Lighting');
const rf = svc('ReplicatedFirst');
const rs = svc('ReplicatedStorage');
const sss = svc('ServerScriptService');
const sp = svc('StarterPlayer', { LoadCharacterAppearance: B(false) }); // cuerpo de bloques: el protagonista del original
const sps: Inst = { cls: 'StarterPlayerScripts', props: { Name: S('StarterPlayerScripts') }, parent: sp };
insts.push(sps);

const mapF = folder('PortSolano', workspace);
const fGround = folder('Suelo', mapF);
const fRoads = folder('Calles', mapF);
const fBuild = folder('Edificios', mapF);
const fDetail = folder('Detalles', mapF);
const fLights = folder('Luces', mapF);

const RZ90 = [0, -1, 0, 1, 0, 0, 0, 0, 1];
const RY = (deg: number) => { const r = (deg * Math.PI) / 180, c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r)); return [c, 0, s, 0, 1, 0, -s, 0, c]; };

let partCount = 0;
const dump: any[] | null = process.env.DUMP_PARTS ? [] : null;
interface PartOpts {
  cls?: 'Part' | 'WedgePart'; shape?: number; rot?: number[]; mat?: number; collide?: boolean; query?: boolean;
  transparency?: number; reflectance?: number; shadow?: boolean; name?: string;
}
function part(parent: Inst, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rgb: number[], o: PartOpts = {}) {
  const cls = o.cls ?? 'Part';
  const props: Inst['props'] = {
    Name: S(o.name ?? 'P'),
    Anchored: B(true),
    CanCollide: B(o.collide ?? true),
    CanQuery: B(o.query ?? true),
    CanTouch: B(false),
    CastShadow: B(o.shadow ?? true),
    CFrame: CF(cx, cy, cz, o.rot),
    size: V3(Math.max(0.05, sx), Math.max(0.05, sy), Math.max(0.05, sz)),
    Color3uint8: C3(rgb[0], rgb[1], rgb[2]),
    Material: E(o.mat ?? MAT.SmoothPlastic),
    Transparency: F(o.transparency ?? 0),
    Reflectance: F(o.reflectance ?? 0),
    TopSurface: E(0),
    BottomSurface: E(0),
  };
  if (cls === 'Part') props.shape = E(o.shape ?? SHAPE.Block);
  insts.push({ cls, props, parent });
  partCount++;
  if (dump) dump.push([cls === 'WedgePart' ? 3 : (o.shape ?? SHAPE.Block), cx, cy, cz, sx, sy, sz, rgb[0], rgb[1], rgb[2], o.rot ?? 0, o.mat === MAT.Glass ? 1 : o.mat === MAT.Neon ? 2 : 0]);
}
// caja por esquinas (en metros)
function boxM(parent: Inst, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, rgb: number[], o: PartOpts = {}) {
  part(parent, ((x0 + x1) / 2) * SC, ((y0 + y1) / 2) * SC, ((z0 + z1) / 2) * SC, (x1 - x0) * SC, (y1 - y0) * SC, (z1 - z0) * SC, rgb, o);
}

// ---------------------------------------------------------------- suelo seco (se fusiona por filas)
const dry: { x0: number; z0: number; x1: number; z1: number; rgb: [number, number, number] }[] = [];
for (const p of prims) {
  if (p.k !== 'quad') continue;
  if (Math.min(...p.ys) < -0.05) continue; // agua / playa mojada: lo hace Terrain en el servidor
  dry.push({ x0: p.a[0], z0: p.a[1], x1: p.a[2], z1: p.a[3], rgb: toRGB(p.c) });
}
dry.sort((a, b) => a.z0 - b.z0 || a.z1 - b.z1 || a.x0 - b.x0);
for (let i = 0; i < dry.length; ) {
  const a = dry[i];
  let x1 = a.x1, j = i + 1;
  while (j < dry.length && dry[j].z0 === a.z0 && dry[j].z1 === a.z1 && Math.abs(dry[j].x0 - x1) < 1e-6 &&
    Math.max(...[0, 1, 2].map((k) => Math.abs(dry[j].rgb[k] - a.rgb[k]))) < 18) { x1 = dry[j].x1; j++; }
  const grassy = a.rgb[1] > a.rgb[0] + 10 && a.rgb[1] > a.rgb[2] + 10;
  const sandy = a.rgb[0] > 180 && a.rgb[1] > 160 && a.rgb[2] < 160;
  part(fGround, ((a.x0 + x1) / 2) * SC, -3, ((a.z0 + a.z1) / 2) * SC, (x1 - a.x0) * SC, 6, (a.z1 - a.z0) * SC, a.rgb,
    { mat: grassy ? MAT.Grass : sandy ? MAT.Sand : MAT.Concrete, shadow: false });
  i = j;
}

// ---------------------------------------------------------------- resto de primitivas
for (const p of prims) {
  if (p.k === 'quad') continue;
  const rgb = toRGB(p.c);
  if (p.k === 'rect') {
    const [x0, z0, x1, z1, y] = p.a;
    const line = nearAny(rgb, LINES, 10) && (x1 - x0 < 1.5 || z1 - z0 < 1.5);
    const water = nearAny(rgb, WATERISH);
    const mat = line ? MAT.SmoothPlastic : water ? MAT.Glass : nearAny(rgb, ASPHALT) ? MAT.Asphalt : nearAny(rgb, WOOD) ? MAT.WoodPlanks
      : rgb[1] > rgb[0] + 10 && rgb[1] > rgb[2] ? MAT.Grass : MAT.Concrete;
    const th = 0.2;
    part(line ? fRoads : (mat === MAT.Asphalt ? fRoads : fGround), ((x0 + x1) / 2) * SC, y * SC - th / 2, ((z0 + z1) / 2) * SC, (x1 - x0) * SC, th, (z1 - z0) * SC, rgb,
      { mat, collide: !line, query: !line, shadow: false, transparency: water ? 0.15 : 0 });
    continue;
  }
  if (p.k === 'box') {
    const [x0, y0, z0, x1, y1, z1] = p.a;
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    if (p.glow) {
      boxM(fLights, x0, y0, z0, x1, y1, z1, rgb, { mat: MAT.Neon, collide: false, shadow: false });
      continue;
    }
    if (w < 0.35 && d < 0.35 && h < 1.5) continue; // postes de valla y piezas diminutas
    const isLeaf = nearAny(rgb, LEAF) && h < 0.6;
    if (p.win && nearAny(rgb, GLASS)) {
      boxM(fBuild, x0, y0, z0, x1, y1, z1, rgb, { mat: MAT.Glass, reflectance: 0.2 });
      for (let y = y0 + 7.2; y < y1 - 2; y += 7.2) boxM(fBuild, x0 - 0.15, y, z0 - 0.15, x1 + 0.15, y + 0.5, z1 + 0.15, mix(rgb, [40, 45, 55], 0.5), { mat: MAT.Concrete, shadow: false });
      continue;
    }
    if (p.win && h > 12) {
      // fachada con ventanas: nucleo de cristal oscuro + forjados del color de la pared
      boxM(fBuild, x0 + 0.1, y0, z0 + 0.1, x1 - 0.1, y1, z1 - 0.1, mix(rgb, DARK_GLASS, 0.6), { mat: MAT.Glass, reflectance: 0.15 });
      for (let y = y0; y < y1 - 1; y += 3.6) {
        const top = Math.min(y + 1.4, y1);
        boxM(fBuild, x0, y, z0, x1, top, z1, rgb, { mat: MAT.Concrete, shadow: y === y0 });
      }
      boxM(fBuild, x0, y1 - 0.4, z0, x1, y1, z1, rgb, { mat: MAT.Concrete });
      continue;
    }
    if (p.win) {
      // edificio bajo / casa: paredes + franja de ventanas
      boxM(fBuild, x0, y0, z0, x1, y1, z1, rgb, { mat: MAT.Concrete });
      if (h > 3.2) {
        for (let y = y0 + 1.2; y < y1 - 1.6; y += 3.6) boxM(fBuild, x0 - 0.06, y, z0 - 0.06, x1 + 0.06, y + 1.4, z1 + 0.06, mix(rgb, DARK_GLASS, 0.7), { mat: MAT.Glass, shadow: false, collide: false, query: false });
      }
      continue;
    }
    const mat = isLeaf ? MAT.Grass : nearAny(rgb, WOOD) ? MAT.WoodPlanks : nearAny(rgb, CONTAINER) && h >= 2.5 ? MAT.Metal
      : h < 0.5 ? MAT.Concrete : MAT.SmoothPlastic;
    boxM(h > 3 ? fBuild : fDetail, x0, y0, z0, x1, y1, z1, rgb, { mat, collide: !isLeaf, shadow: h > 0.5 });
    continue;
  }
  if (p.k === 'roof') {
    const [x0, z0, x1, z1, y, h] = p.a;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const o = (rot: number[] | undefined): PartOpts => ({ cls: 'WedgePart', rot, mat: MAT.Brick });
    if (p.alongX) {
      // la parte alta del WedgePart esta en +Z local
      part(fBuild, mx * SC, (y + h / 2) * SC, ((z0 + mz) / 2) * SC, (x1 - x0) * SC, h * SC, (mz - z0) * SC, rgb, o(undefined));
      part(fBuild, mx * SC, (y + h / 2) * SC, ((mz + z1) / 2) * SC, (x1 - x0) * SC, h * SC, (z1 - mz) * SC, mix(rgb, [0, 0, 0], 0.15), o(RY(180)));
    } else {
      part(fBuild, ((x0 + mx) / 2) * SC, (y + h / 2) * SC, mz * SC, (z1 - z0) * SC, h * SC, (mx - x0) * SC, rgb, o(RY(90)));
      part(fBuild, ((mx + x1) / 2) * SC, (y + h / 2) * SC, mz * SC, (z1 - z0) * SC, h * SC, (x1 - mx) * SC, mix(rgb, [0, 0, 0], 0.15), o(RY(-90)));
    }
    continue;
  }
  if (p.k === 'cyl') {
    const [cx, y0, cz, rb, rt, h] = p.a;
    const dia = Math.max(0.3, (rb + rt) * SC);
    const mat = nearAny(rgb, TRUNK) ? MAT.Wood : near(rgb, 0x45484d) || near(rgb, 0x2b2e33) ? MAT.Metal : MAT.SmoothPlastic;
    part(dia > 6 ? fBuild : fDetail, cx * SC, (y0 + h / 2) * SC, cz * SC, h * SC, dia, dia, rgb, { shape: SHAPE.Cylinder, rot: RZ90, mat, shadow: dia > 0.6 });
    continue;
  }
  if (p.k === 'blob') {
    const [cx, cy, cz, r] = p.a;
    const dia = 2 * r * SC * 0.95;
    part(fDetail, cx * SC, (cy + 0.1 * r) * SC, cz * SC, dia, dia, dia, rgb, { shape: SHAPE.Ball, mat: MAT.Grass, collide: false });
  }
}

// ---------------------------------------------------------------- datos para los scripts
const lua = (v: any): string => {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (Array.isArray(v)) return '{' + v.map(lua).join(',') + '}';
  return '{' + Object.entries(v).map(([k, x]) => `${/^[A-Za-z_]\w*$/.test(k) ? k : `[${JSON.stringify(k)}]`}=${lua(x)}`).join(',') + '}';
};
const names: Record<number, string> = city.names as any;
const data = {
  SCALE: SC, HALF: 1600, CELL: 100, N: 32, WATER_Y: -0.8, RIVER_Z0: 410, RIVER_Z1: 490,
  ISLAND: { x0: 1290, x1: 1510, z0: -710, z1: -290 },
  SPAWN: { x: 209 * SC, z: -150 * SC }, // acera junto al punto de inicio del original (250,-150), que cae dentro de una torre
  POIS: city.pois.map((p) => ({ id: p.id, name: p.name, kind: p.kind, x: Math.round(p.x * SC), z: Math.round(p.z * SC) })),
  PICKUPS: city.pickups.map((p) => ({ x: Math.round(p.x * SC), z: Math.round(p.z * SC), hint: p.hint })),
  CARS: city.cars.map((c) => ({ x: Math.round(c.x * SC), z: Math.round(c.z * SC), yaw: c.yaw })),
  ROADS: city.roads,
};
const namesLua = '{' + Object.entries(names).map(([k, v]) => `[${k}]=${JSON.stringify(v)}`).join(',') + '}';
const layoutData = `-- GENERADO por roblox/tools/build-place.ts desde src/world/CityLayout.ts. No editar a mano.
local D = ${lua(data)}
D.DISTRICT_NAMES = ${namesLua}
D.GRID = ${JSON.stringify(city.districtGrid.map((d) => d.toString(36)).join(''))}
return D
`;

// ---------------------------------------------------------------- scripts
function addScripts(sub: string, parent: Inst) {
  const dir = join(ROOT, 'src', sub);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.luau')).sort()) {
    const source = readFileSync(join(dir, f), 'utf8');
    let cls = 'ModuleScript', name = f.replace(/\.luau$/, '');
    if (name.endsWith('.server')) { cls = 'Script'; name = name.slice(0, -7); }
    else if (name.endsWith('.client')) { cls = 'LocalScript'; name = name.slice(0, -7); }
    insts.push({ cls, props: { Name: S(name), Source: S(source) }, parent });
  }
}
insts.push({ cls: 'ModuleScript', props: { Name: S('LayoutData'), Source: S(layoutData) }, parent: rs });
const vehData = `-- GENERADO desde src/vehicles/VehicleDefs.ts. No editar a mano.
return {
  DEFS = ${lua(VEHICLES.map((v) => ({ id: v.id, name: v.name, maker: v.maker, cls: v.cls, price: v.price, len: v.len, wid: v.wid, hei: v.hei, wheelbase: v.wheelbase, track: v.track, wheelR: v.wheelR, cabin: v.cabin, roofY: v.roofY, beltY: v.beltY, noseY: v.noseY, topSpeed: v.topSpeed, seats: v.seats, hp: v.hp, colors: v.colors.map((c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255]) })))},
  TRAFFIC_MIX = ${lua(TRAFFIC_MIX.map(([id, w]) => [id, w]))},
}
`;
insts.push({ cls: 'ModuleScript', props: { Name: S('VehicleDefs'), Source: S(vehData) }, parent: rs });
addScripts('ReplicatedStorage', rs);
addScripts('ReplicatedFirst', rf);
addScripts('ServerScriptService', sss);
addScripts('StarterPlayerScripts', sps);

const buf = writeRbxl(insts);
writeFileSync(join(ROOT, 'PortSolano.rbxl'), buf);
writeFileSync(join(ROOT, 'src-generated-LayoutData.luau'), layoutData);
writeFileSync(join(ROOT, 'src-generated-VehicleDefs.luau'), vehData);
if (dump) writeFileSync(process.env.DUMP_PARTS!, JSON.stringify(dump));
console.log(`OK -> PortSolano.rbxl  ${(buf.length / 1048576).toFixed(1)} MB, ${partCount} piezas, ${insts.length} instancias`);
