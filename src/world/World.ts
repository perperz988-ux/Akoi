import * as THREE from 'three';
import { Geo } from './Geo';
import { Box, StaticCollision } from './Collision';
import * as L from './CityLayout';
import { District } from './CityLayout';
import { Rng, hash2 } from '../core/MathUtil';
import { QualityCfg } from '../settings/Quality';
import { TextureStreamer } from './Textures';

interface Cell {
  ci: number; cj: number; lod: 0 | 1;
  group: THREE.Group; colliders: Box[]; maxH: number; occluded: boolean;
}

const PAL = {
  asphalt: 0x2c2e33, highway: 0x25272b, sidewalk: 0xa7a49c, curb: 0xc2beb4, grass: 0x5f8c47, grassDry: 0x8a9a55, sand: 0xd9c690,
  dirt: 0x7a6247, concrete: 0x8f8f8a, industrial: 0x74726c, water: 0x2d5a6e, lineWhite: 0xe8e8e8, lineYellow: 0xe6b422,
};
const GLASS = [0x7ea4be, 0x6d8da6, 0x9fb7c9, 0x5f7a8f, 0xa9bcc7];
const WALLS = [0xd8cfc0, 0xc9b8a0, 0xe3ded2, 0xb9b2a5, 0xcdbfae, 0xa9a29a, 0xe8d9c2];
const PASTEL = [0xf4a6a0, 0xf8d49a, 0xa8d8d0, 0xb7c4f0, 0xf2e3a0, 0xe7b5d8, 0xcfe6a8];
const ROOFS = [0x8e4b3a, 0x5e5e66, 0x6d4c3d, 0x7b3f3f, 0x4a5662];

export class World {
  group = new THREE.Group();
  collision = new StaticCollision();
  cells = new Map<number, Cell>();
  wallMat!: THREE.MeshStandardMaterial;
  flatMat!: THREE.MeshStandardMaterial;
  glowMat!: THREE.MeshBasicMaterial;
  poolMat!: THREE.MeshBasicMaterial;
  private queue: { ci: number; cj: number; lod: 0 | 1; d: number }[] = [];
  private occIdx = 0;
  stats = { cells: 0, tris: 0, built: 0, occluded: 0, colliders: 0 };
  onCellLoaded?: (ci: number, cj: number) => void;
  onCellUnloaded?: (ci: number, cj: number) => void;
  /** Called to let AI/props systems know which cells are near-detailed. */
  nearSet = new Set<number>();
  private lastCell = -1;
  pxLast = 0; pzLast = 0;

  constructor(public q: QualityCfg, public tex: TextureStreamer) {
    this.makeMaterials();
    for (const p of L.POIS) {
      const lot = L.cellLot(p.ci, p.cj);
      p.x = (lot.x0 + lot.x1) / 2; p.z = lot.z1 + 1.6;
    }
  }

  private makeMaterials() {
    this.wallMat = new THREE.MeshStandardMaterial({ map: this.tex.windows(), emissiveMap: this.tex.windowMask(), emissive: new THREE.Color(0xffcf8a), emissiveIntensity: 0, vertexColors: true, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide });
    this.wallMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSeed;\nvarying float vSeed;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSeed = aSeed;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vSeed;')
        .replace('#include <emissivemap_fragment>', `
        #ifdef USE_EMISSIVEMAP
          vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
          vec2 wc = floor(vEmissiveMapUv);
          float hh = fract(sin(dot(wc + vSeed * 13.7, vec2(12.9898,78.233))) * 43758.5453);
          emissiveColor.rgb *= step(0.62, hh) * (0.55 + 0.45 * fract(hh * 9.0));
          totalEmissiveRadiance *= emissiveColor.rgb;
        #endif`);
    };
    this.flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x222222 });
    this.poolMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  /** 0..1 how lit emissive things are (night). */
  setNight(n: number) {
    this.wallMat.emissiveIntensity = n * 1.4;
    const c = 0.25 + n * 0.75;
    this.glowMat.color.setRGB(c, c, c);
    this.poolMat.opacity = n * 0.9; this.poolMat.visible = n > 0.04;
  }

  cellKey(ci: number, cj: number) { return ci * 64 + cj; }

  // ---------------------------------------------------------------- streaming
  update(px: number, pz: number, camX: number, camY: number, camZ: number, budgetMs: number) {
    const pci = L.cellOf(px), pcj = L.cellOf(pz);
    const key = this.cellKey(pci, pcj);
    this.pxLast = px; this.pzLast = pz;
    if (key !== this.lastCell) {
      this.lastCell = key;
      this.plan(pci, pcj);
    }
    // build within budget
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const j = this.queue.shift()!;
      const ex = this.cells.get(this.cellKey(j.ci, j.cj));
      if (ex && ex.lod === j.lod) continue;
      this.build(j.ci, j.cj, j.lod);
    }
    this.updateOcclusion(camX, camY, camZ, pci, pcj);
  }

  private plan(pci: number, pcj: number) {
    const near = this.q.nearCells, far = this.q.farCells;
    this.queue.length = 0;
    this.nearSet.clear();
    for (let di = -far; di <= far; di++) for (let dj = -far; dj <= far; dj++) {
      const ci = pci + di, cj = pcj + dj;
      if (!L.inBounds(ci) || !L.inBounds(cj)) continue;
      const d = Math.max(Math.abs(di), Math.abs(dj));
      const lod: 0 | 1 = d <= near ? 0 : 1;
      if (lod === 0) this.nearSet.add(this.cellKey(ci, cj));
      const ex = this.cells.get(this.cellKey(ci, cj));
      if (!ex || ex.lod !== lod) this.queue.push({ ci, cj, lod, d: d + (lod === 1 ? 0.5 : 0) });
    }
    this.queue.sort((a, b) => a.d - b.d);
    for (const [k, c] of this.cells) {
      const d = Math.max(Math.abs(c.ci - pci), Math.abs(c.cj - pcj));
      if (d > far + 1) this.unload(k);
    }
  }

  /** Force immediate synchronous loading around a point (initial spawn / teleport). */
  preload(px: number, pz: number, radius = 1) {
    const pci = L.cellOf(px), pcj = L.cellOf(pz);
    this.plan(pci, pcj);
    for (let di = -radius; di <= radius; di++) for (let dj = -radius; dj <= radius; dj++) {
      const ci = pci + di, cj = pcj + dj;
      if (L.inBounds(ci) && L.inBounds(cj)) { const e = this.cells.get(this.cellKey(ci, cj)); if (!e || e.lod !== 0) this.build(ci, cj, 0); }
    }
  }

  private unload(k: number) {
    const c = this.cells.get(k)!;
    this.disposeCell(c);
    this.cells.delete(k);
    this.onCellUnloaded?.(c.ci, c.cj);
  }
  private disposeCell(c: Cell) {
    this.group.remove(c.group);
    c.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    for (const b of c.colliders) this.collision.remove(b);
    c.colliders.length = 0;
  }

  private updateOcclusion(cx: number, cy: number, cz: number, pci: number, pcj: number) {
    const arr = [...this.cells.values()].filter((c) => c.lod === 1 && Math.max(Math.abs(c.ci - pci), Math.abs(c.cj - pcj)) >= this.q.nearCells + 1);
    if (!arr.length) return;
    let occ = 0;
    for (let n = 0; n < 6; n++) {
      const c = arr[(this.occIdx++) % arr.length];
      const tx = L.cellCenter(c.ci), tz = L.cellCenter(c.cj);
      const ty = Math.max(4, c.maxH * 0.85);
      c.occluded = this.lineBlocked(cx, cy, cz, tx, ty, tz, c);
    }
    for (const c of arr) { c.group.visible = !c.occluded; if (c.occluded) occ++; }
    this.stats.occluded = occ;
  }

  /** Software occlusion probe: marches along the view line sampling building tops. */
  private lineBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number, target: Cell) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 200) return false;
    const steps = Math.min(40, Math.floor(len / 14));
    const tmp: Box[] = [];
    const tx0 = L.lineCoord(target.ci), tz0 = L.lineCoord(target.cj);
    for (let i = 3; i < steps - 2; i++) {
      const t = i / steps;
      const x = ax + dx * t, z = az + dz * t, y = ay + (by - ay) * t;
      if (x > tx0 - 100 && x < tx0 + 200 && z > tz0 - 100 && z < tz0 + 200) continue;
      this.collision.query(x - 1, z - 1, x + 1, z + 1, tmp);
      for (const b of tmp) if (b.kind === 'building' && b.y1 > y + 3 && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return true;
    }
    return false;
  }

  setShadows(on: boolean) {
    for (const c of this.cells.values()) c.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = on && c.lod === 0 && m.material !== this.glowMat; });
  }

  // ---------------------------------------------------------------- building a cell
  private build(ci: number, cj: number, lod: 0 | 1) {
    const key = this.cellKey(ci, cj);
    const old = this.cells.get(key);
    if (old) { this.disposeCell(old); this.cells.delete(key); }
    const geo = new Geo();
    const colliders: Box[] = [];
    const ctx = { geo, ci, cj, lod, colliders, rng: new Rng((ci * 7919 + cj * 104729 + 17) >>> 0), maxH: 6 };
    const d = L.cellDistrict(ci, cj);
    this.buildTerrain(ctx, d);
    this.buildRoads(ctx, d);
    this.buildLots(ctx, d);
    const group = new THREE.Group();
    const mk = (g: THREE.BufferGeometry | null, mat: THREE.Material, shadow: boolean) => {
      if (!g) return;
      const m = new THREE.Mesh(g, mat);
      m.castShadow = shadow && this.q.shadows && lod === 0;
      m.receiveShadow = this.q.shadows && lod === 0;
      m.matrixAutoUpdate = false; m.updateMatrix();
      group.add(m);
      this.stats.tris += (g.index?.count ?? 0) / 3;
    };
    mk(geo.w.build(), this.wallMat, true);
    mk(geo.f.build(), this.flatMat, true);
    mk(geo.g.build(), this.glowMat, false);
    if (lod === 0) mk(geo.p.build(), this.poolMat, false);
    this.group.add(group);
    for (const b of colliders) this.collision.add(b);
    const cell: Cell = { ci, cj, lod, group, colliders, maxH: ctx.maxH, occluded: false };
    this.cells.set(key, cell);
    this.stats.built++;
    this.stats.cells = this.cells.size;
    this.stats.colliders = this.collision.count;
    if (lod === 0) this.onCellLoaded?.(ci, cj);
  }

  private addBuilding(ctx: Ctx, x0: number, z0: number, x1: number, z1: number, h: number, color: number | string, windowed = true, collide = true) {
    ctx.geo.box(x0, 0, z0, x1, h, z1, color, windowed);
    if (collide) ctx.colliders.push({ x0, z0, x1, z1, y0: -1, y1: h, kind: 'building' });
    if (h > ctx.maxH) ctx.maxH = h;
  }
  private addSolid(ctx: Ctx, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number | string, kind: Box['kind'] = 'prop') {
    ctx.geo.box(x0, y0, z0, x1, y1, z1, color, false);
    ctx.colliders.push({ x0, z0, x1, z1, y0, y1, kind });
  }
  private tree(ctx: Ctx, x: number, z: number, palm = false, s = 1) {
    if (ctx.lod === 1) return;
    const g = ctx.geo, y = Math.max(0, L.groundY(x, z));
    if (palm) {
      const h = 7 * s;
      g.cyl(x, y, z, 0.28, 0.18, h, 0x7a5a3a, 5);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.box(x + Math.cos(a) * 1.5 - 1.5, y + h - 0.2 - (i % 2) * 0.4, z + Math.sin(a) * 1.5 - 0.2, x + Math.cos(a) * 1.5 + 1.5, y + h - 0.05, z + Math.sin(a) * 1.5 + 0.2, 0x3f8a3c);
      }
      g.blob(x, y + h, z, 1.1, 0x2f7a35);
    } else {
      const h = (3 + ctx.rng.range(0, 2)) * s;
      g.cyl(x, y, z, 0.3 * s, 0.22 * s, h, 0x5a4331, 5);
      g.blob(x, y + h + 1.2 * s, z, 2.4 * s, ctx.rng.pick([0x4c7d3a, 0x3f7a3e, 0x5b8a3f, 0x4a7a4a]));
    }
    ctx.colliders.push({ x0: x - 0.35, z0: z - 0.35, x1: x + 0.35, z1: z + 0.35, y0: 0, y1: 6, kind: 'tree' });
  }

  // ------------------------------------------------ terrain
  private groundColor(x: number, z: number, d: District, y: number, rng?: Rng): [number, number, number] {
    const c = new THREE.Color();
    if (y < -1.4) c.set(0x3f6b73);
    else if (y < -0.2) c.set(0xcdbb86);
    else if (d === District.Beach || d === District.Marina || d === District.Resort && x > 1100) c.set(PAL.sand);
    else if (d === District.Rural) c.set(((Math.floor(x / 60) + Math.floor(z / 60)) & 1) ? 0x9aa65c : 0x7c9a4a);
    else if (d === District.Suburb || d === District.Park || d === District.Luxury || d === District.Island) c.set(PAL.grass);
    else if (d === District.Industrial) c.set(PAL.industrial);
    else if (d === District.Airport) c.set(0x6f9a52);
    else if (d === District.River) c.set(0xcdbb86);
    else c.set(PAL.concrete);
    const n = (hash2(Math.floor(x / 7), Math.floor(z / 7), 5) - 0.5) * 0.08;
    return [c.r + n, c.g + n, c.b + n];
  }

  private buildTerrain(ctx: Ctx, d: District) {
    const { ci, cj, geo, lod } = ctx;
    const x0 = L.lineCoord(ci), z0 = L.lineCoord(cj), x1 = x0 + L.CELL, z1 = z0 + L.CELL;
    const wet = x1 > 1130 || (z1 > L.RIVER_Z0 - 20 && z0 < L.RIVER_Z1 + 20) || L.isIsland(x0 + 50, z0 + 50) || ci === 0 || cj === 0 || ci === L.N - 1 || cj === L.N - 1;
    const step = wet ? (lod === 0 ? 10 : 20) : L.CELL;
    for (let x = x0; x < x1; x += step) for (let z = z0; z < z1; z += step) {
      const xa = x + step, za = z + step;
      const gy = (px: number, pz: number) => L.groundY(px, pz);
      const col = (px: number, pz: number): number[] => this.groundColor(px, pz, d, gy(px, pz));
      const cs = [col(x, z), col(x, za), col(xa, za), col(xa, z)];
      geo.terrainQuad(x, z, xa, za, gy(x, z), gy(x, za), gy(xa, za), gy(xa, z), cs);
    }
    // world-edge barrier: invisible walls drawn as nothing but collision keeps player in
    if (lod === 0) {
      const pad = 3;
      if (ci === 0) ctx.colliders.push({ x0: x0 - 20, z0, x1: x0 + pad, z1, y0: -50, y1: 200, kind: 'wall' });
      if (cj === 0) ctx.colliders.push({ x0, z0: z0 - 20, x1, z1: z0 + pad, y0: -50, y1: 200, kind: 'wall' });
      if (ci === L.N - 1) ctx.colliders.push({ x0: x1 - pad, z0, x1: x1 + 20, z1, y0: -50, y1: 200, kind: 'wall' });
      if (cj === L.N - 1) ctx.colliders.push({ x0, z0: z1 - pad, x1, z1: z1 + 20, y0: -50, y1: 200, kind: 'wall' });
    }
  }

  // ------------------------------------------------ roads
  private buildRoads(ctx: Ctx, d: District) {
    const { ci, cj, geo, lod } = ctx;
    const dirt = L.isDirtRoad(L.lineCoord(ci));
    const asphalt = dirt ? PAL.dirt : PAL.asphalt;
    const X = L.lineCoord(ci), Z = L.lineCoord(cj);
    const hwx = L.lineHalfWidth('x', ci), hwz = L.lineHalfWidth('z', cj);
    const urban = L.isUrban(d);
    const RY = 0.03;
    // node (intersection square) owned by this cell
    if (L.nodeExists(ci, cj)) {
      const hx = hwx, hz = hwz;
      geo.rect(X - hx, Z - hz, X + hx, Z + hz, RY, asphalt);
      if (lod === 0 && urban && L.hasTrafficLights(ci, cj)) this.trafficLights(ctx, X, Z, hx, hz);
      if (lod === 0 && urban && !dirt) this.crosswalks(ctx, ci, cj, X, Z, hx, hz);
    }
    // vertical segment (x = X) from Z+hz to Z+CELL-hz'
    if (L.vSegment(ci, cj)) {
      const zEnd = Z + L.CELL;
      const hz2 = L.lineHalfWidth('z', cj + 1);
      const za = Z + hwz, zb = zEnd - hz2;
      const bridge = L.isBridgeV(ci, cj);
      if (bridge) {
        geo.box(X - hwx - 1, -1.2, Z, X + hwx + 1, 0.0, zEnd, 0x9a968c);
        geo.rect(X - hwx, za - hwz, X + hwx, zb + hz2, RY, asphalt);
        for (const sx of [-1, 1]) {
          const bx = X + sx * (hwx + 0.5);
          if (lod === 0) {
            ctx.geo.box(bx - 0.4, 0, Z, bx + 0.4, 1.1, zEnd, 0xb8b4aa);
            ctx.colliders.push({ x0: bx - 0.4, z0: Z, x1: bx + 0.4, z1: zEnd, y0: -1, y1: 1.1, kind: 'wall' });
          }
        }
        if (lod === 0) for (let zz = Z + 10; zz < zEnd; zz += 20) for (const sx of [-1, 1]) this.lamp(ctx, X + sx * (hwx - 0.5), zz, sx < 0 ? 1 : -1, 0);
      } else {
        geo.rect(X - hwx, za, X + hwx, zb, RY, asphalt);
      }
      if (lod === 0) {
        this.markingsV(ctx, X, za, zb, hwx, dirt);
        if (urban && !bridge) this.sidewalkV(ctx, d, X, Z, zEnd, hwx);
      }
    }
    if (L.hSegment(ci, cj)) {
      const xEnd = X + L.CELL;
      const hx2 = L.lineHalfWidth('x', ci + 1);
      const xa = X + hwx, xb = xEnd - hx2;
      const bridge = L.isBridgeH(ci, cj);
      if (bridge) {
        geo.box(X, -1.2, Z - hwz - 1, xEnd, 0.0, Z + hwz + 1, 0x9a968c);
        geo.rect(xa - hwx, Z - hwz, xb + hx2, Z + hwz, RY, asphalt);
        if (lod === 0) for (const sz of [-1, 1]) {
          const bz = Z + sz * (hwz + 0.5);
          ctx.geo.box(X, 0, bz - 0.4, xEnd, 1.1, bz + 0.4, 0xb8b4aa);
          ctx.colliders.push({ x0: X, z0: bz - 0.4, x1: xEnd, z1: bz + 0.4, y0: -1, y1: 1.1, kind: 'wall' });
        }
      } else geo.rect(xa, Z - hwz, xb, Z + hwz, RY, asphalt);
      if (lod === 0) {
        this.markingsH(ctx, Z, xa, xb, hwz, dirt);
        if (urban && !bridge) this.sidewalkH(ctx, d, Z, X, xEnd, hwz);
      }
    }
  }

  private markingsV(ctx: Ctx, X: number, za: number, zb: number, hw: number, dirt: boolean) {
    if (dirt) return;
    const g = ctx.geo, y = 0.045;
    const hwy = hw > 7;
    if (hwy) {
      g.rect(X - 0.12, za, X + 0.12, zb, y, PAL.lineYellow); g.rect(X - 0.12 - 0.5, za, X + 0.12 - 0.5, zb, y, PAL.lineYellow);
      for (const o of [-hw / 2, hw / 2]) for (let z = za; z < zb; z += 10) g.rect(X + o - 0.1, z, X + o + 0.1, z + 4, y, PAL.lineWhite);
    } else {
      for (let z = za + 2; z < zb - 2; z += 8) g.rect(X - 0.12, z, X + 0.12, z + 4, y, PAL.lineYellow);
    }
    g.rect(X - hw + 0.4, za, X - hw + 0.55, zb, y, PAL.lineWhite); g.rect(X + hw - 0.55, za, X + hw - 0.4, zb, y, PAL.lineWhite);
  }
  private markingsH(ctx: Ctx, Z: number, xa: number, xb: number, hw: number, dirt: boolean) {
    if (dirt) return;
    const g = ctx.geo, y = 0.045;
    if (hw > 7) {
      g.rect(xa, Z - 0.12, xb, Z + 0.12, y, PAL.lineYellow); g.rect(xa, Z - 0.62, xb, Z - 0.38, y, PAL.lineYellow);
      for (const o of [-hw / 2, hw / 2]) for (let x = xa; x < xb; x += 10) g.rect(x, Z + o - 0.1, x + 4, Z + o + 0.1, y, PAL.lineWhite);
    } else for (let x = xa + 2; x < xb - 2; x += 8) g.rect(x, Z - 0.12, x + 4, Z + 0.12, y, PAL.lineYellow);
    g.rect(xa, Z - hw + 0.4, xb, Z - hw + 0.55, y, PAL.lineWhite); g.rect(xa, Z + hw - 0.55, xb, Z + hw - 0.4, y, PAL.lineWhite);
  }
  private crosswalks(ctx: Ctx, ci: number, cj: number, X: number, Z: number, hx: number, hz: number) {
    const g = ctx.geo, y = 0.05;
    const stripes = (x0: number, z0: number, alongX: boolean, len: number) => {
      for (let o = -len / 2 + 0.6; o < len / 2 - 0.3; o += 1.4) {
        if (alongX) g.rect(x0 + o, z0, x0 + o + 0.7, z0 + 3, y, PAL.lineWhite);
        else g.rect(x0, z0 + o, x0 + 3, z0 + o + 0.7, y, PAL.lineWhite);
      }
    };
    if (L.vSegment(ci, cj)) stripes(X, Z + hz + 0.3, true, hx * 2);
    if (L.vSegment(ci, cj - 1)) stripes(X, Z - hz - 3.3, true, hx * 2);
    if (L.hSegment(ci, cj)) stripes(X + hx + 0.3, Z, false, hz * 2);
    if (L.hSegment(ci - 1, cj)) stripes(X - hx - 3.3, Z, false, hz * 2);
  }
  private sidewalkV(ctx: Ctx, d: District, X: number, Z0: number, Z1: number, hw: number) {
    const g = ctx.geo;
    const hz0 = L.lineHalfWidth('z', ctx.cj), hz1 = L.lineHalfWidth('z', ctx.cj + 1);
    const a = Z0 + (L.hSegment(ctx.ci, ctx.cj) || L.hSegment(ctx.ci - 1, ctx.cj) ? hz0 : 0);
    const b = Z1 - (L.hSegment(ctx.ci, ctx.cj + 1) || L.hSegment(ctx.ci - 1, ctx.cj + 1) ? hz1 : 0);
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? X - hw - L.SIDEWALK : X + hw, x1 = s < 0 ? X - hw : X + hw + L.SIDEWALK;
      g.box(x0, 0, a, x1, 0.12, b, PAL.sidewalk);
      for (let z = a + 12; z < b - 6; z += 28) {
        this.lamp(ctx, s < 0 ? x1 - 0.6 : x0 + 0.6, z, s < 0 ? -1 : 1, 0);
        if (ctx.rng.chance(0.5) && (d === District.Suburb || d === District.Luxury || d === District.Resort || d === District.Park)) this.tree(ctx, s < 0 ? x0 + 1 : x1 - 1, z + 12, d === District.Resort || d === District.Luxury);
      }
    }
  }
  private sidewalkH(ctx: Ctx, d: District, Z: number, X0: number, X1: number, hw: number) {
    const g = ctx.geo;
    const hx0 = L.lineHalfWidth('x', ctx.ci), hx1 = L.lineHalfWidth('x', ctx.ci + 1);
    const a = X0 + (L.vSegment(ctx.ci, ctx.cj) || L.vSegment(ctx.ci, ctx.cj - 1) ? hx0 : 0);
    const b = X1 - (L.vSegment(ctx.ci + 1, ctx.cj) || L.vSegment(ctx.ci + 1, ctx.cj - 1) ? hx1 : 0);
    for (const s of [-1, 1]) {
      const z0 = s < 0 ? Z - hw - L.SIDEWALK : Z + hw, z1 = s < 0 ? Z - hw : Z + hw + L.SIDEWALK;
      g.box(a, 0, z0, b, 0.12, z1, PAL.sidewalk);
      for (let x = a + 12; x < b - 6; x += 28) {
        this.lamp(ctx, x, s < 0 ? z1 - 0.6 : z0 + 0.6, 0, s < 0 ? -1 : 1);
        if (ctx.rng.chance(0.5) && (d === District.Suburb || d === District.Luxury || d === District.Resort || d === District.Park)) this.tree(ctx, x + 12, s < 0 ? z0 + 1 : z1 - 1, d === District.Resort || d === District.Luxury);
      }
    }
  }
  private lamp(ctx: Ctx, x: number, z: number, dx: number, dz: number) {
    const g = ctx.geo;
    g.cyl(x, 0, z, 0.14, 0.1, 7.5, 0x45484d, 5);
    g.pool(x + dx * 1.0 - 4.2, z + dz * 1.0 - 4.2, x + dx * 1.0 + 4.2, z + dz * 1.0 + 4.2, 0.17, 0x6a5428); // soft light pool (additive, night only)
    g.glow(x + dx * 0.5 - 0.4, 7.4, z + dz * 0.5 - 0.4, x + dx * 1.5 + 0.4, 7.6, z + dz * 1.5 + 0.4, 0xffe3a0);
    g.box(x - 0.1 + Math.min(0, dx * 1.5), 7.3, z - 0.1 + Math.min(0, dz * 1.5), x + 0.1 + Math.max(0, dx * 1.5), 7.4, z + 0.1 + Math.max(0, dz * 1.5), 0x45484d);
    ctx.colliders.push({ x0: x - 0.2, z0: z - 0.2, x1: x + 0.2, z1: z + 0.2, y0: 0, y1: 7.5, kind: 'prop' });
  }
  private trafficLights(ctx: Ctx, X: number, Z: number, hx: number, hz: number) {
    const g = ctx.geo;
    for (const [sx, sz] of [[-1, -1], [1, 1]]) {
      const x = X + sx * (hx + 0.8), z = Z + sz * (hz + 0.8);
      g.cyl(x, 0, z, 0.12, 0.1, 5.5, 0x2b2e33, 5);
      g.glow(x - 0.25, 4.3, z - 0.25, x + 0.25, 5.4, z + 0.25, 0x3a3f46);
      ctx.colliders.push({ x0: x - 0.2, z0: z - 0.2, x1: x + 0.2, z1: z + 0.2, y0: 0, y1: 5.5, kind: 'prop' });
    }
  }

  // ------------------------------------------------ lots / buildings
  private buildLots(ctx: Ctx, d: District) {
    const { ci, cj } = ctx;
    const lot = L.cellLot(ci, cj);
    const w = lot.x1 - lot.x0, h = lot.z1 - lot.z0;
    if (w < 6 || h < 6) return;
    const poi = L.poiAtCell(ci, cj);
    ctx.geo.setSeed(hash2(ci, cj, 9) * 50);
    if (poi) return this.buildPoiLot(ctx, d, lot, poi);
    if (L.isConstructionCell(ci, cj)) return this.buildConstruction(ctx, lot);
    switch (d) {
      case District.Downtown: return this.buildDowntown(ctx, lot);
      case District.Midtown: return this.buildMidtown(ctx, lot, false);
      case District.Poor: return this.buildMidtown(ctx, lot, true);
      case District.Luxury: return this.buildLuxury(ctx, lot);
      case District.Island: return this.buildLuxury(ctx, lot, true);
      case District.Resort: return this.buildResort(ctx, lot);
      case District.Suburb: return this.buildSuburb(ctx, lot);
      case District.Shopping: return this.buildShopping(ctx, lot);
      case District.Industrial: return this.buildIndustrial(ctx, lot);
      case District.Airport: return this.buildAirport(ctx, lot);
      case District.Rural: return this.buildRural(ctx, lot);
      case District.Park: return this.buildPark(ctx, lot);
      case District.Beach: return this.buildBeach(ctx, lot);
      case District.Marina: return this.buildMarina(ctx, lot);
      default: return;
    }
  }

  private buildDowntown(ctx: Ctx, lot: Lot) {
    const { rng } = ctx;
    const split = rng.chance(0.3);
    const lots: Lot[] = split ? [{ x0: lot.x0, x1: (lot.x0 + lot.x1) / 2 - 2, z0: lot.z0, z1: lot.z1 }, { x0: (lot.x0 + lot.x1) / 2 + 2, x1: lot.x1, z0: lot.z0, z1: lot.z1 }] : [lot];
    for (const l of lots) {
      const glass = rng.pick(GLASS), ph = rng.range(6, 12);
      this.addBuilding(ctx, l.x0 + 1, l.z0 + 1, l.x1 - 1, l.z1 - 1, ph, rng.pick(WALLS));
      const inset = rng.range(4, 9);
      const h = (rng.chance(0.25) ? rng.range(110, 190) : rng.range(45, 110)) * (split ? 0.75 : 1);
      this.addBuilding(ctx, l.x0 + inset, l.z0 + inset, l.x1 - inset, l.z1 - inset, h, glass);
      if (ctx.lod === 0) {
        const i2 = inset + 5;
        if (l.x1 - l.x0 > 2 * i2 + 6 && h > 90) { ctx.geo.box(l.x0 + i2, h, l.z0 + i2, l.x1 - i2, h + 9, l.z1 - i2, glass, true); ctx.colliders.push({ x0: l.x0 + i2, z0: l.z0 + i2, x1: l.x1 - i2, z1: l.z1 - i2, y0: h, y1: h + 9, kind: 'building' }); ctx.maxH = Math.max(ctx.maxH, h + 9); }
        ctx.geo.box((l.x0 + l.x1) / 2 - 0.2, h, (l.z0 + l.z1) / 2 - 0.2, (l.x0 + l.x1) / 2 + 0.2, h + 8 + rng.range(0, 8), (l.z0 + l.z1) / 2 + 0.2, 0xc2c6cc);
        ctx.geo.glow((l.x0 + l.x1) / 2 - 0.4, h + 14, (l.z0 + l.z1) / 2 - 0.4, (l.x0 + l.x1) / 2 + 0.4, h + 15, (l.z0 + l.z1) / 2 + 0.4, 0xff3030);
        // ground-floor awning
        ctx.geo.glow(l.x0 + 1, 3.6, l.z1 - 1.2, l.x1 - 1, 4.0, l.z1 - 1, rng.pick([0xffd9a0, 0x9fe0ff, 0xffa0d0]));
      }
    }
  }

  private buildMidtown(ctx: Ctx, lot: Lot, poor: boolean) {
    const { rng } = ctx;
    const nx = poor ? 3 : 2, nz = 2, gap = poor ? 5 : 7;
    const bw = (lot.x1 - lot.x0 - gap * (nx - 1)) / nx, bd = (lot.z1 - lot.z0 - gap * (nz - 1)) / nz;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      if (rng.chance(0.08)) { // empty lot / parking / basketball
        const x0 = lot.x0 + i * (bw + gap), z0 = lot.z0 + j * (bd + gap);
        ctx.geo.rect(x0, z0, x0 + bw, z0 + bd, 0.06, poor ? 0x6a6a6a : 0x3a3b40);
        if (ctx.lod === 0) this.scatterProps(ctx, x0 + 2, z0 + 2, x0 + bw - 2, z0 + bd - 2, poor ? 4 : 2);
        continue;
      }
      const x0 = lot.x0 + i * (bw + gap), z0 = lot.z0 + j * (bd + gap);
      const h = poor ? rng.range(8, 22) : rng.range(14, 48);
      const col = poor ? rng.pick([0xb07a5c, 0x9a8f80, 0x8c6f5e, 0xb9a47c, 0x7b8c8f]) : rng.pick(WALLS);
      this.addBuilding(ctx, x0, z0, x0 + bw, z0 + bd, h, col);
      if (ctx.lod === 0) {
        ctx.geo.box(x0 + bw * 0.3, h, z0 + bd * 0.3, x0 + bw * 0.55, h + 3, z0 + bd * 0.55, 0x77797d);
        if (poor) {
          // fire escape + graffiti panels
          ctx.geo.box(x0 + bw, 3, z0 + 3, x0 + bw + 1.4, 3.15, z0 + bd - 3, 0x333);
          ctx.geo.box(x0 + 2, 1, z0 + bd - 0.05, x0 + 2 + 6, 3.5, z0 + bd + 0.05, rng.pick([0xd04080, 0x40a0d0, 0xe0c030, 0x60c060]));
        } else ctx.geo.glow(x0 + 2, 3.6, z0 + bd - 0.1, x0 + bw - 2, 3.9, z0 + bd + 0.1, rng.pick([0xffd9a0, 0xa0e0ff, 0xffb0e0, 0xb0ffc0]));
        // alley dumpsters
        if (i < nx - 1) this.scatterProps(ctx, x0 + bw + 0.6, z0 + 2, x0 + bw + gap - 0.6, z0 + bd - 2, 2);
      }
    }
  }

  /** Deterministic breakable-prop spawn points are published for the Props system. */
  propSpots: { x: number; z: number; kind: string }[] = [];
  private scatterProps(ctx: Ctx, x0: number, z0: number, x1: number, z1: number, n: number) {
    for (let i = 0; i < n; i++) {
      const kind = ctx.rng.pick(['bin', 'cone', 'barrel', 'crate', 'bin']);
      this.propSpots.push({ x: ctx.rng.range(x0, x1), z: ctx.rng.range(z0, z1), kind });
    }
    // a static dumpster
    if (ctx.rng.chance(0.5)) { const x = ctx.rng.range(x0, x1 - 2), z = ctx.rng.range(z0, z1 - 1); this.addSolid(ctx, x, 0, z, x + 2, 1.3, z + 1, 0x2f6b4a); }
  }

  private buildLuxury(ctx: Ctx, lot: Lot, island = false) {
    const { rng, geo } = ctx;
    const halves = island ? 1 : 2;
    const w = (lot.x1 - lot.x0) / halves;
    for (let k = 0; k < halves; k++) {
      const x0 = lot.x0 + k * w + 2, x1 = lot.x0 + (k + 1) * w - 2, z0 = lot.z0 + 2, z1 = lot.z1 - 2;
      geo.rect(x0, z0, x1, z1, 0.05, island ? 0xcfd6c0 : 0x6aa14c);
      // perimeter wall
      if (ctx.lod === 0) for (const [ax, az, bx, bz] of [[x0, z0, x1, z0 + 0.5], [x0, z1 - 0.5, x1, z1], [x0, z0, x0 + 0.5, z1], [x1 - 0.5, z0, x1, z1]]) {
        if (bz - az > 1 && bx - ax > 1 && !(ax === x0 && az === z1 - 0.5 && Math.abs(ax - bx) < 6)) this.addSolid(ctx, ax, 0, az, bx, 2.2, bz, 0xe9e4da, 'wall');
      }
      const hx0 = x0 + 10, hx1 = x1 - 10, hz0 = z0 + 14, hz1 = z1 - 12;
      const h1 = rng.range(7, 11);
      this.addBuilding(ctx, hx0, hz0, hx1, hz1, h1, rng.pick([0xf2efe6, 0xe5dcc9, 0xdad7d0]));
      if (ctx.lod === 0) {
        geo.box(hx0 - 1, h1, hz0 - 1, hx1 + 1, h1 + 0.5, hz1 + 1, 0x3c3c40);
        this.addBuilding(ctx, hx0 + 6, hz0 + 4, hx1 - 10, hz1 - 4, h1 + 4, 0xf4f1ea);
        // pool
        geo.rect(hx0, z0 + 3, hx0 + 12, hz0 - 3, 0.09, 0x35a8c8);
        geo.glow(hx0, 0.02, z0 + 3, hx0 + 0.01, 0.03, z0 + 3.01, 0x000000);
        for (let i = 0; i < 5; i++) this.tree(ctx, rng.range(x0 + 3, x1 - 3), rng.range(hz1 + 2, z1 - 2), true, 1.1);
        // gate pillars + driveway
        geo.rect((x0 + x1) / 2 - 2.5, hz1, (x0 + x1) / 2 + 2.5, z1 + 3, 0.07, 0x9c9a94);
      }
    }
  }

  private buildResort(ctx: Ctx, lot: Lot) {
    const { rng, geo } = ctx;
    const h = rng.range(35, 90);
    const col = rng.pick(PASTEL);
    this.addBuilding(ctx, lot.x0 + 4, lot.z0 + 8, lot.x1 - 14, lot.z1 - 8, h, col);
    if (ctx.lod === 0) {
      this.addBuilding(ctx, lot.x0 + 4, lot.z0 + 8, lot.x1 - 4, lot.z0 + 22, 6, 0xfaf6ee);
      geo.rect(lot.x1 - 24, lot.z0 + 28, lot.x1 - 6, lot.z1 - 20, 0.09, 0x35a8c8);
      for (let i = 0; i < 6; i++) this.tree(ctx, lot.x1 - 4, lot.z0 + 14 + i * 11, true);
      geo.glow(lot.x0 + 8, h - 3, lot.z1 - 8.2, lot.x1 - 18, h - 1, lot.z1 - 8.0, rng.pick([0xff6ad5, 0x6af0ff, 0xffe46a]));
    }
  }

  private buildSuburb(ctx: Ctx, lot: Lot) {
    const { rng, geo } = ctx;
    const n = 3, cw = (lot.x1 - lot.x0) / n, cd = (lot.z1 - lot.z0) / 2;
    for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
      const x0 = lot.x0 + i * cw, z0 = lot.z0 + j * cd;
      geo.rect(x0, z0, x0 + cw, z0 + cd, 0.04, 0x69a050);
      if (rng.chance(0.1)) { this.tree(ctx, x0 + cw / 2, z0 + cd / 2, false, 1.3); continue; }
      const hx0 = x0 + 5, hx1 = x1m(x0, cw) - 5, hz0 = z0 + (j === 0 ? 6 : 10), hz1 = z0 + cd - (j === 0 ? 10 : 6);
      const hh = rng.range(4.5, 7);
      this.addBuilding(ctx, hx0, hz0, hx1, hz1, hh, rng.pick(PASTEL.concat(WALLS)));
      if (ctx.lod === 0) {
        geo.roof(hx0 - 0.5, hz0 - 0.5, hx1 + 0.5, hz1 + 0.5, hh, 2.6, rng.pick(ROOFS), true);
        geo.rect(hx0 + 2, j === 0 ? hz1 : z0, hx0 + 6, j === 0 ? z0 + cd : hz0, 0.06, 0x8a8780);
        geo.glow(hx0 + 2, 1.2, j === 0 ? hz1 : hz0 - 0.1, hx0 + 4, 2.4, j === 0 ? hz1 + 0.1 : hz0, 0xffe0a0);
        this.tree(ctx, hx1 + 2, z0 + cd * 0.5, false);
        if (rng.chance(0.4)) this.tree(ctx, x0 + 3, z0 + cd * 0.5, rng.chance(0.4));
      }
    }
  }

  private buildShopping(ctx: Ctx, lot: Lot) {
    const { rng, geo } = ctx;
    const mall = rng.chance(0.5);
    geo.rect(lot.x0, lot.z0, lot.x1, lot.z1, 0.05, 0x3a3b40);
    if (mall) {
      this.addBuilding(ctx, lot.x0 + 8, lot.z0 + 8, lot.x1 - 8, lot.z0 + 52, 14, rng.pick(WALLS));
      if (ctx.lod === 0) { geo.glow(lot.x0 + 12, 9, lot.z0 + 52.1, lot.x1 - 12, 11.5, lot.z0 + 52.3, rng.pick([0xff5a8a, 0x5ad0ff, 0xffd45a])); this.parkingLines(ctx, lot.x0 + 8, lot.z0 + 58, lot.x1 - 8, lot.z1 - 4); }
    } else {
      const n = 4, w = (lot.x1 - lot.x0 - 8) / n;
      for (let i = 0; i < n; i++) {
        const x0 = lot.x0 + 4 + i * w;
        this.addBuilding(ctx, x0 + 0.5, lot.z0 + 6, x0 + w - 0.5, lot.z0 + 28, rng.range(7, 11), rng.pick(PASTEL));
        if (ctx.lod === 0) geo.glow(x0 + 2, 5.2, lot.z0 + 28.1, x0 + w - 2, 6.4, lot.z0 + 28.3, rng.pick([0xff5a8a, 0x5ad0ff, 0xffd45a, 0x8aff7a]));
      }
      if (ctx.lod === 0) this.parkingLines(ctx, lot.x0 + 8, lot.z0 + 34, lot.x1 - 8, lot.z1 - 4);
    }
  }
  private parkingLines(ctx: Ctx, x0: number, z0: number, x1: number, z1: number) {
    for (let x = x0; x < x1; x += 3) ctx.geo.rect(x, z0, x + 0.12, z1, 0.07, 0xdddddd);
    for (let x = x0 + 10; x < x1 - 4; x += 30) this.lamp(ctx, x, (z0 + z1) / 2, 1, 0);
  }

  private buildIndustrial(ctx: Ctx, lot: Lot) {
    const { rng, geo } = ctx;
    const port = lot.x0 > 700 && lot.z0 > 900;
    geo.rect(lot.x0, lot.z0, lot.x1, lot.z1, 0.05, 0x5f5e5a);
    if (port) {
      // container yard + gantry crane
      for (let i = 0; i < 7; i++) for (let j = 0; j < 4; j++) {
        if (rng.chance(0.2)) continue;
        const x = lot.x0 + 4 + i * 11, z = lot.z0 + 4 + j * 6, stack = rng.int(1, 3);
        for (let s = 0; s < stack; s++) geo.box(x, s * 2.6, z, x + 9, (s + 1) * 2.6, z + 2.6, rng.pick([0xb03a2e, 0x2e6db0, 0xd9a21b, 0x3f8f5a, 0x7a7a7a, 0xe0e0e0]));
        ctx.colliders.push({ x0: x, z0: z, x1: x + 9, z1: z + 2.6, y0: 0, y1: stack * 2.6, kind: 'building' });
      }
      if (ctx.lod === 0 && lot.x1 > 1000) {
        const cx = lot.x1 - 8, cz = lot.z0 + 15;
        for (const dz of [0, 18]) for (const dx of [0, 14]) this.addSolid(ctx, cx + dx - 0.6, 0, cz + dz - 0.6, cx + dx + 0.6, 30, cz + dz + 0.6, 0xd24b2a);
        geo.box(cx - 20, 30, cz - 1, cx + 16, 32, cz + 19, 0xd24b2a);
        ctx.maxH = Math.max(ctx.maxH, 32);
      }
    } else {
      const n = rng.int(1, 2);
      for (let i = 0; i < n; i++) {
        const w = (lot.x1 - lot.x0) / n;
        const x0 = lot.x0 + i * w + 6, x1 = lot.x0 + (i + 1) * w - 6;
        const hh = rng.range(9, 16);
        this.addBuilding(ctx, x0, lot.z0 + 6, x1, lot.z0 + 44, hh, rng.pick([0x9aa0a6, 0x8d948a, 0xa49a8a]), true);
        if (ctx.lod === 0) geo.rect(x0 + 8, lot.z0 + 44, x0 + 18, lot.z1, 0.06, 0x4a4a4a);
      }
      if (ctx.lod === 0) {
        for (let i = 0; i < 3; i++) { const x = lot.x0 + 14 + i * 12, z = lot.z1 - 20; geo.cyl(x, 0, z, 4.5, 4.5, 10, 0xd9d7d0, 10); ctx.colliders.push({ x0: x - 4.5, z0: z - 4.5, x1: x + 4.5, z1: z + 4.5, y0: 0, y1: 10, kind: 'building' }); }
        geo.cyl(lot.x1 - 12, 0, lot.z1 - 14, 1.8, 1.2, 38, 0x8a5a48, 8);
        ctx.colliders.push({ x0: lot.x1 - 14, z0: lot.z1 - 16, x1: lot.x1 - 10, z1: lot.z1 - 12, y0: 0, y1: 38, kind: 'building' });
        ctx.maxH = Math.max(ctx.maxH, 38);
        this.propSpots.push({ x: lot.x0 + 6, z: lot.z1 - 4, kind: 'barrel' }, { x: lot.x0 + 8, z: lot.z1 - 4, kind: 'barrel' }, { x: lot.x0 + 10, z: lot.z1 - 5, kind: 'crate' });
      }
    }
  }

  private plane(ctx: Ctx, x: number, z: number, color: number) {
    const g = ctx.geo;
    g.box(x - 14, 0.8, z - 1.6, x + 14, 4.4, z + 1.6, 0xf2f4f6); g.box(x + 14, 1.6, z - 1.2, x + 17, 3.8, z + 1.2, 0xf2f4f6);
    g.box(x - 3, 1.6, z - 15, x + 4, 2.1, z + 15, 0xd9dde2); g.box(x - 13, 2.0, z - 5, x - 10, 2.4, z + 5, 0xd9dde2); g.box(x - 13, 2.4, z - 0.3, x - 10.5, 7.2, z + 0.3, color);
    g.box(x - 2, 0, z - 8, x + 2, 0.8, z - 6, 0x333333); g.box(x - 2, 0, z + 6, x + 2, 0.8, z + 8, 0x333333); g.box(x + 11, 0, z - 0.4, x + 13, 0.8, z + 0.4, 0x333333);
    ctx.colliders.push({ x0: x - 14, z0: z - 15, x1: x + 17, z1: z + 15, y0: 0, y1: 4.4, kind: 'building' });
  }

  private buildAirport(ctx: Ctx, lot: Lot) {
    const { geo, ci, cj, rng } = ctx;
    const x0 = L.lineCoord(ci), z0 = L.lineCoord(cj);
    geo.rect(x0, z0, x0 + L.CELL, z0 + L.CELL, 0.03, 0x6f9a52);
    // runway (east-west, z -1500..-1460) and taxiway / apron
    const runwayZ0 = -1500, runwayZ1 = -1460;
    if (z0 + L.CELL > runwayZ0 && z0 < runwayZ1) {
      const a = Math.max(z0, runwayZ0), b = Math.min(z0 + L.CELL, runwayZ1);
      geo.rect(x0, a, x0 + L.CELL, b, 0.05, 0x3b3d42);
      if (ctx.lod === 0) for (let x = x0 + 5; x < x0 + L.CELL - 6; x += 18) geo.rect(x, (runwayZ0 + runwayZ1) / 2 - 0.4, x + 8, (runwayZ0 + runwayZ1) / 2 + 0.4, 0.06, 0xf0f0f0);
    }
    if (z0 + L.CELL > -1440 && z0 < -1340) geo.rect(x0, Math.max(z0, -1440), x0 + L.CELL, Math.min(z0 + L.CELL, -1340), 0.05, 0x4a4c52);
    if (ctx.lod === 1) { if (ci === 3 && cj === 2) { this.addBuilding(ctx, x0 + 30, z0 + 30, x0 + 70, z0 + 70, 12, 0x9aa0a6); } return; }
    // hangars on the western cells, control tower, parked aircraft along the apron
    if (cj === 2 && ci >= 1 && ci <= 3) { this.addBuilding(ctx, x0 + 10, z0 + 10, x0 + 90, z0 + 58, 13, 0x9aa0a6, true); }
    if (cj === 2 && ci === 4) {
      this.addBuilding(ctx, x0 + 40, z0 + 20, x0 + 48, z0 + 28, 34, 0xcfd3d8);
      geo.glow(x0 + 38, 34, z0 + 18, x0 + 50, 38, z0 + 30, 0x9fe0ff); ctx.maxH = 38;
    }
    if (cj === 1 && ci >= 1 && ci <= 5 && (ci + cj) % 2 === 0) this.plane(ctx, x0 + 50, z0 + 80, rng.pick([0x2e6db0, 0xc0392b, 0x3f8f5a, 0x111111]));
    if (cj === 1 && ci === 6) { geo.rect(x0 + 30, z0 + 30, x0 + 70, z0 + 70, 0.07, 0x333640); geo.rect(x0 + 44, z0 + 44, x0 + 46, z0 + 56, 0.08, 0xffd400); geo.rect(x0 + 54, z0 + 44, x0 + 56, z0 + 56, 0.08, 0xffd400); geo.rect(x0 + 46, z0 + 49, x0 + 54, z0 + 51, 0.08, 0xffd400); }
    if (ci === 7 && cj >= 0 && cj <= 5) this.addSolid(ctx, x0 + L.CELL - 0.3, 0, z0, x0 + L.CELL, 2.2, z0 + L.CELL, 0x777b80, 'wall');
    void lot;
  }

  private buildRural(ctx: Ctx, lot: Lot) {
    const { rng, geo } = ctx;
    const k = rng.int(0, 3);
    for (let i = 0; i < 4; i++) geo.rect(lot.x0 + (i % 2) * 45 + 2, lot.z0 + Math.floor(i / 2) * 45 + 2, lot.x0 + (i % 2) * 45 + 42, lot.z0 + Math.floor(i / 2) * 45 + 42, 0.04, rng.pick([0xb7a55a, 0x7aa14a, 0x9bb55a, 0x6b8f3f, 0xc2b36a]));
    if (k === 0 || k === 1) { // farm
      this.addBuilding(ctx, lot.x0 + 8, lot.z0 + 8, lot.x0 + 28, lot.z0 + 26, 7, 0x9c3f35, false);
      if (ctx.lod === 0) geo.roof(lot.x0 + 7, lot.z0 + 7, lot.x0 + 29, lot.z0 + 27, 7, 4, 0x4a4a4e, true);
      this.addBuilding(ctx, lot.x0 + 36, lot.z0 + 10, lot.x0 + 44, lot.z0 + 18, 5, 0xe8e0d0);
      geo.cyl(lot.x0 + 56, 0, lot.z0 + 16, 3, 3, 14, 0xc9ccd0, 9); ctx.maxH = 14;
      ctx.colliders.push({ x0: lot.x0 + 53, z0: lot.z0 + 13, x1: lot.x0 + 59, z1: lot.z0 + 19, y0: 0, y1: 14, kind: 'building' });
    } else if (k === 2 && ctx.lod === 0) { // windmill
      this.addSolid(ctx, lot.x0 + 40, 0, lot.z0 + 40, lot.x0 + 44, 24, lot.z0 + 44, 0xeaeaea, 'building');
      geo.box(lot.x0 + 30, 22, lot.z0 + 44.2, lot.x0 + 54, 23.2, lot.z0 + 44.8, 0xf2f2f2);
      geo.box(lot.x0 + 41.5, 10, lot.z0 + 44.2, lot.x0 + 42.5, 36, lot.z0 + 44.8, 0xf2f2f2); ctx.maxH = 36;
    }
    if (ctx.lod === 0) {
      for (let i = 0; i < 9; i++) this.tree(ctx, rng.range(lot.x0, lot.x1), rng.range(lot.z0, lot.z1), false, rng.range(0.8, 1.4));
      // wooden fence
      for (let x = lot.x0; x < lot.x1; x += 4) geo.box(x, 0, lot.z1 - 0.1, x + 0.15, 1.1, lot.z1 + 0.05, 0x8a6a45);
      geo.box(lot.x0, 0.9, lot.z1 - 0.1, lot.x1, 1.0, lot.z1, 0x8a6a45);
      if (rng.chance(0.4)) this.propSpots.push({ x: lot.x0 + 10, z: lot.z1 - 8, kind: 'barrel' });
    }
  }

  private buildPark(ctx: Ctx, lot: Lot) {
    const { rng, geo } = ctx;
    const { ci, cj } = ctx;
    const x0 = L.lineCoord(ci), z0 = L.lineCoord(cj);
    geo.rect(x0, z0, x0 + L.CELL, z0 + L.CELL, 0.03, 0x5aa04a);
    geo.rect(x0 + 48, z0, x0 + 52, z0 + L.CELL, 0.05, 0xc9b98f); geo.rect(x0, z0 + 48, x0 + L.CELL, z0 + 52, 0.05, 0xc9b98f);
    if (ctx.lod === 1) return;
    if (rng.chance(0.5)) { geo.rect(x0 + 60, z0 + 60, x0 + 90, z0 + 90, 0.07, 0x3e87a0); }
    for (let i = 0; i < 14; i++) { const x = x0 + rng.range(4, 96), z = z0 + rng.range(4, 96); if (Math.abs(x - x0 - 50) < 4 || Math.abs(z - z0 - 50) < 4) continue; this.tree(ctx, x, z, false, rng.range(0.9, 1.5)); }
    this.addSolid(ctx, x0 + 46, 0, z0 + 40, x0 + 48.5, 0.6, z0 + 43, 0x7a5a3a);
    this.addSolid(ctx, x0 + 51.5, 0, z0 + 57, x0 + 54, 0.6, z0 + 60, 0x7a5a3a);
    this.propSpots.push({ x: x0 + 44, z: z0 + 56, kind: 'bin' });
    // fountain
    geo.cyl(x0 + 50, 0, z0 + 50, 4, 4, 0.5, 0xb8b8b0, 10); geo.cyl(x0 + 50, 0, z0 + 50, 3.4, 3.4, 0.55, 0x4aa0c0, 10); geo.cyl(x0 + 50, 0.5, z0 + 50, 0.4, 0.3, 2, 0xb8b8b0, 6);
    ctx.colliders.push({ x0: x0 + 46, z0: z0 + 46, x1: x0 + 54, z1: z0 + 54, y0: 0, y1: 0.55, kind: 'prop' });
    // mirador park big hill ring around central park: skip
    if (lot.x1 - lot.x0 > 90) { /* noop */ }
  }

  private buildBeach(ctx: Ctx, lot: Lot) {
    const { rng, geo, ci, cj } = ctx;
    const x0 = L.lineCoord(ci), z0 = L.lineCoord(cj);
    if (ctx.lod === 1) return;
    // boardwalk along x ~ 1120
    if (x0 <= 1100 && x0 + L.CELL > 1100) geo.rect(1100, z0, 1112, z0 + L.CELL, 0.08, 0x9c7a55);
    for (let i = 0; i < 6; i++) {
      const x = rng.range(1130, 1175), z = z0 + rng.range(5, 95);
      if (x < x0 || x > x0 + L.CELL) continue;
      geo.cyl(x, 0, z, 0.05, 0.05, 2.6, 0xeeeeee, 4);
      geo.cyl(x, 2.2, z, 0.1, 1.6, 0.5, rng.pick([0xff5a5a, 0x5ab4ff, 0xffd45a, 0xffffff]), 8);
    }
    if (rng.chance(0.4) && x0 + 50 > 1100) { // lifeguard tower
      const x = 1150, z = z0 + 50;
      this.addSolid(ctx, x - 1.5, 0, z - 1.5, x + 1.5, 3.2, z + 1.5, 0xf4f0e8);
      geo.box(x - 2, 3.2, z - 2, x + 2, 3.6, z + 2, 0xd43a3a);
    }
    if (cj % 3 === 0) { // pier
      const zc = z0 + 50;
      geo.box(1165, -0.4, zc - 2.5, 1260, 0.35, zc + 2.5, 0x8a6a45);
      ctx.colliders.push({ x0: 1165, z0: zc - 2.5, x1: 1260, z1: zc + 2.5, y0: -2, y1: 0.35, kind: 'prop' });
      for (let x = 1170; x < 1260; x += 15) geo.glow(x, 0.35, zc - 2.4, x + 0.3, 3.2, zc - 2.1, 0xfff0c0);
    }
    for (let i = 0; i < 4; i++) this.tree(ctx, 1096 + rng.range(0, 8), z0 + 10 + i * 24, true);
  }

  private buildMarina(ctx: Ctx, lot: Lot) {
    const { rng, geo, ci, cj } = ctx;
    const x0 = L.lineCoord(ci), z0 = L.lineCoord(cj);
    geo.rect(x0, z0, x0 + L.CELL, z0 + L.CELL, 0.03, 0xb8b3a6);
    if (ctx.lod === 1 || x0 + L.CELL < 1100) return;
    // finger piers into the water
    for (let k = 0; k < 3; k++) {
      const z = z0 + 15 + k * 32;
      geo.box(1170, -0.4, z - 1.5, 1235, 0.35, z + 1.5, 0x8a6a45);
      ctx.colliders.push({ x0: 1170, z0: z - 1.5, x1: 1235, z1: z + 1.5, y0: -2, y1: 0.35, kind: 'prop' });
      for (const s of [-1, 1]) if (rng.chance(0.7)) {
        const bx = 1180 + rng.range(0, 40), bz = z + s * 5.5, len = rng.range(7, 14);
        geo.box(bx, -0.9, bz - 1.6, bx + len, 0.7, bz + 1.6, rng.pick([0xf2f2f2, 0xe8e0c8, 0x2a3f5a, 0xb03030]));
        geo.box(bx + len * 0.25, 0.7, bz - 1.1, bx + len * 0.65, 2.2, bz + 1.1, 0xf8f8f8);
        geo.glow(bx + len * 0.25, 1.4, bz - 1.12, bx + len * 0.65, 1.9, bz + 1.12, 0x203040);
      }
    }
    this.addBuilding(ctx, x0 + 10, z0 + 10, x0 + 40, z0 + 30, 8, 0xf2eee4);
    for (let i = 0; i < 3; i++) this.tree(ctx, x0 + 52, z0 + 20 + i * 25, true);
  }

  private buildConstruction(ctx: Ctx, lot: Lot) {
    const { rng, geo } = ctx;
    geo.rect(lot.x0, lot.z0, lot.x1, lot.z1, 0.05, 0x8a7458);
    // fence
    for (const [a, b, c, d] of [[lot.x0, lot.z0, lot.x1, lot.z0 + 0.3], [lot.x0, lot.z1 - 0.3, lot.x1, lot.z1], [lot.x0, lot.z0, lot.x0 + 0.3, lot.z1], [lot.x1 - 0.3, lot.z0, lot.x1, lot.z1]]) {
      if (d - b > 5 && c - a > 5 && a === lot.x0 && b === lot.z1 - 0.3) { // gap for entrance: two pieces
        this.addSolid(ctx, a, 0, b, a + 30, 2.2, d, 0xe0a030, 'wall'); this.addSolid(ctx, c - 30, 0, b, c, 2.2, d, 0xe0a030, 'wall');
      } else this.addSolid(ctx, a, 0, b, c, 2.2, d, 0xe0a030, 'wall');
    }
    // concrete frame of a building under construction (climbable floors)
    const fx0 = lot.x0 + 12, fx1 = lot.x1 - 12, fz0 = lot.z0 + 12, fz1 = lot.z1 - 24;
    const floors = rng.int(3, 7);
    for (let f = 0; f <= floors; f++) {
      const y = f * 4;
      geo.box(fx0, y, fz0, fx1, y + 0.4, fz1, 0x9a9a98);
      ctx.colliders.push({ x0: fx0, z0: fz0, x1: fx1, z1: fz1, y0: y, y1: y + 0.4, kind: 'interior' });
    }
    for (let x = fx0; x <= fx1; x += (fx1 - fx0) / 3) for (let z = fz0; z <= fz1; z += (fz1 - fz0) / 2) { geo.box(x - 0.4, 0, z - 0.4, x + 0.4, floors * 4, z + 0.4, 0xaaa9a4); }
    ctx.maxH = floors * 4 + 40;
    // tower crane
    const cx = lot.x1 - 8, cz = lot.z1 - 12, ch = floors * 4 + 22;
    this.addSolid(ctx, cx - 0.8, 0, cz - 0.8, cx + 0.8, ch, cz + 0.8, 0xe8b830, 'building');
    geo.box(cx - 26, ch, cz - 0.6, cx + 8, ch + 1.2, cz + 0.6, 0xe8b830);
    geo.glow(cx - 25, ch - 0.1, cz - 0.3, cx - 24, ch + 0.4, cz + 0.3, 0xff3030);
    ctx.maxH = Math.max(ctx.maxH, ch + 2);
    this.propSpots.push({ x: lot.x0 + 6, z: lot.z1 - 4, kind: 'cone' }, { x: lot.x0 + 9, z: lot.z1 - 4, kind: 'cone' }, { x: lot.x1 - 20, z: lot.z1 - 4, kind: 'barrel' });
  }

  private buildPoiLot(ctx: Ctx, d: District, lot: Lot, poi: L.Poi) {
    const { geo, rng } = ctx;
    const w = lot.x1 - lot.x0, h = lot.z1 - lot.z0;
    const cx = (lot.x0 + lot.x1) / 2;
    const col = new THREE.Color(poi.color).getHex();
    let bh = 9;
    switch (poi.kind) {
      case 'hospital': bh = 22; break;
      case 'hotel': bh = 42; break;
      case 'police': bh = 14; break;
      case 'airport': bh = 14; break;
      case 'helipad': bh = 3; break;
      case 'club': bh = 10; break;
      case 'garage': case 'dealer': case 'gas': case 'carwash': bh = 7; break;
      default: bh = 11;
    }
    geo.rect(lot.x0, lot.z0, lot.x1, lot.z1, 0.05, 0x3a3b40);
    const wallCol = poi.kind === 'hospital' ? 0xf1f4f6 : poi.kind === 'police' ? 0x6f86a8 : rng.pick(WALLS);
    if (poi.kind === 'gas') {
      this.addBuilding(ctx, lot.x0 + 6, lot.z0 + 6, lot.x0 + 28, lot.z0 + 20, 5, 0xf2f0e8);
      if (ctx.lod === 0) {
        geo.box(lot.x0 + 8, 5.4, lot.z0 + 28, lot.x1 - 12, 6.2, lot.z0 + 52, 0xe8e8e8);
        for (const x of [lot.x0 + 12, lot.x1 - 16]) for (const z of [lot.z0 + 32, lot.z0 + 46]) this.addSolid(ctx, x, 0, z, x + 0.8, 5.4, z + 0.8, 0xbbbbbb);
        for (let i = 0; i < 3; i++) this.addSolid(ctx, lot.x0 + 18 + i * 14, 0, lot.z0 + 38, lot.x0 + 19.2 + i * 14, 1.5, lot.z0 + 39, col);
        geo.glow(lot.x0 + 8, 5.4, lot.z0 + 52, lot.x1 - 12, 5.9, lot.z0 + 52.3, col);
      }
    } else if (poi.kind === 'helipad' || poi.kind === 'airport') {
      this.addBuilding(ctx, lot.x0 + 8, lot.z0 + 8, lot.x1 - 8, lot.z0 + 40, bh, 0xdfe6ea);
    } else if (poi.kind === 'marina') {
      this.addBuilding(ctx, lot.x0 + 8, lot.z0 + 8, lot.x1 - 8, lot.z0 + 38, 9, 0xf2eee4);
    } else {
      const depth = Math.min(h - 18, poi.kind === 'hotel' ? 54 : 44);
      this.addBuilding(ctx, lot.x0 + 8, lot.z1 - 12 - depth, lot.x1 - 8, lot.z1 - 12, bh, wallCol);
      if (poi.kind === 'hotel') ctx.geo.box(lot.x0 + 12, bh, lot.z1 - 12 - depth + 4, lot.x1 - 12, bh + 4, lot.z1 - 16, rng.pick(PASTEL), true);
    }
    // entrance, sign, beacon
    if (ctx.lod === 0) {
      const dz = lot.z1 - 12;
      geo.glow(cx - 6, 3.2, dz, cx + 6, 4.4, dz + 0.4, col);
      geo.box(cx - 2, 0, dz - 0.05, cx + 2, 2.8, dz + 0.1, 0x222a33);
      geo.glow(cx - 1.8, 0.1, dz + 0.1, cx + 1.8, 2.6, dz + 0.2, 0xcaa56a);
      this.tree(ctx, lot.x0 + 3, lot.z1 - 3, d === District.Resort || d === District.Luxury);
      this.tree(ctx, lot.x1 - 3, lot.z1 - 3, d === District.Resort || d === District.Luxury);
    }
  }
}

interface Lot { x0: number; x1: number; z0: number; z1: number }
interface Ctx { geo: Geo; ci: number; cj: number; lod: 0 | 1; colliders: Box[]; rng: Rng; maxH: number }
const x1m = (x0: number, w: number) => x0 + w;
