// Chunk streaming, editing, fluids, growth, persistence and visibility culling (main thread).
import * as THREE from 'three';
import {
  B, BLOCKS, CHUNK, HEIGHT, L_EMIT, L_OPAQUE, L_SOLID, SECTIONS, SHAPE_CROSS, UNLOADED, blockDef, isLiquid,
} from './Blocks';
import { FEATURE, Generator, placeFeature } from './Generator';
import * as Store from '../save/Storage';
import type { GeomData, MeshOutput } from './Mesher';
import WorldWorker from './worker?worker&inline';

export interface Stack { id: number; count: number; dur?: number }

export class Chunk {
  key: number;
  skey: string;
  light: Uint8Array | null = null;
  crates = new Map<number, (Stack | null)[]>();
  modified = false;
  unsaved = false;
  editVersion = 1;
  meshedVersion = 0;
  meshLod = -1;
  meshing = false;
  urgent = false;
  meshes: (THREE.Mesh | null)[] = new Array(SECTIONS * 3).fill(null);
  conn: Uint8Array | null = null;
  growables = new Set<number>();
  torches = new Set<number>();
  constructor(public cx: number, public cz: number, public blocks: Uint8Array, public meta: Uint8Array) {
    this.key = ckey(cx, cz);
    this.skey = cx + ',' + cz;
  }
}

export const ckey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);
export const pkey = (x: number, y: number, z: number) => (x + 1048576) * 268435456 + (z + 1048576) * 128 + y;
function unpk(k: number): [number, number, number] {
  const y = k % 128; const r = (k - y) / 128; const z = (r % 2097152) - 1048576; const x = Math.floor(r / 2097152) - 1048576;
  return [x, y, z];
}
const lidx = (x: number, y: number, z: number) => (x & 15) + (z & 15) * 16 + y * 256;

export interface WorldMaterials { opaque: THREE.Material; cutout: THREE.Material; water: THREE.Material }

export interface WorldOptions {
  scene: THREE.Scene;
  seed: number;
  worldId: string | null;   // null = not persisted (menu backdrop)
  materials: WorldMaterials;
  radius: number;
  lodStart: number;
  fancyLeaves: boolean;
  shadows: boolean;
}

let sharedWorkers: Worker[] | null = null;
function workers(): Worker[] {
  if (sharedWorkers) return sharedWorkers;
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
  sharedWorkers = [];
  for (let i = 0; i < n; i++) sharedWorkers.push(new WorldWorker());
  return sharedWorkers;
}

let worldCounter = 0;

export class World {
  readonly gen: Generator;
  readonly seed: number;
  readonly group = new THREE.Group();
  chunks = new Map<number, Chunk>();
  private pending = new Set<number>();
  private savedKeys = new Set<string>();
  private ready = false;
  private jobs = 0;
  private jobLoad: number[] = [];
  private uid = ++worldCounter;
  private radius: number;
  private lodStart: number;
  private fancy: boolean;
  private shadows: boolean;
  private offsets: [number, number, number][] = [];
  private center = { cx: 0, cz: 0 };
  private fluidTicks = new Map<number, number>();
  private fluidTimer = 0;
  private growTimer = 0;
  private time = 0;
  private visGrid = new Uint8Array(0);
  private visQueue = new Int32Array(0);
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private tmpBox = new THREE.Box3();
  disposed = false;

  /** Called when a block is destroyed by world rules (support lost, washed away); game spawns drops. */
  onDrop: (x: number, y: number, z: number, id: number, meta: number) => void = () => {};
  onCrateSpill: (x: number, y: number, z: number, items: Stack[]) => void = () => {};

  constructor(private opts: WorldOptions) {
    this.seed = opts.seed;
    this.gen = new Generator(opts.seed);
    this.radius = opts.radius;
    this.lodStart = opts.lodStart;
    this.fancy = opts.fancyLeaves;
    this.shadows = opts.shadows;
    opts.scene.add(this.group);
    this.group.matrixAutoUpdate = false;
    this.buildOffsets();
    const ws = workers();
    this.jobLoad = ws.map(() => 0);
    for (const w of ws) w.addEventListener('message', this.onMessage);
  }

  async init() {
    if (this.opts.worldId) this.savedKeys = await Store.listChunkKeys(this.opts.worldId);
    this.ready = true;
  }

  setQuality(radius: number, lodStart: number, fancy: boolean, shadows: boolean) {
    const remesh = fancy !== this.fancy || lodStart !== this.lodStart;
    this.radius = radius; this.lodStart = lodStart; this.fancy = fancy; this.shadows = shadows;
    this.buildOffsets();
    for (const c of this.chunks.values()) {
      if (remesh) c.meshedVersion = 0;
      for (const m of c.meshes) if (m && m.material !== this.opts.materials.water) { m.castShadow = shadows; m.receiveShadow = shadows; }
    }
  }

  get renderRadius() { return this.radius; }

  private buildOffsets() {
    const R = this.radius + 1;
    this.offsets = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) this.offsets.push([dx, dz, Math.max(Math.abs(dx), Math.abs(dz)) + (dx * dx + dz * dz) * 0.001]);
    this.offsets.sort((a, b) => a[2] - b[2]);
    const G = 2 * (this.radius + 3) + 1;
    this.visGrid = new Uint8Array(G * G * SECTIONS);
    this.visQueue = new Int32Array(G * G * SECTIONS * 2 + 16);
  }

  // ---------- block access ----------
  getChunk(cx: number, cz: number) { return this.chunks.get(ckey(cx, cz)); }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.DEEPSTONE;
    if (y >= HEIGHT) return B.AIR;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return UNLOADED;
    return c.blocks[lidx(x, y, z)];
  }
  getMeta(x: number, y: number, z: number): number {
    if (y < 0 || y >= HEIGHT) return 0;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    return c ? c.meta[lidx(x, y, z)] : 0;
  }
  /** Returns packed light (sky<<4 | block). */
  getLight(x: number, y: number, z: number): number {
    if (y >= HEIGHT) return 0xf0;
    if (y < 0) return 0;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || !c.light) return 0xf0;
    return c.light[lidx(x, y, z)];
  }
  isLoaded(x: number, z: number) { return this.chunks.has(ckey(x >> 4, z >> 4)); }

  /** Top-most non-air block y in a column (-1 if none). */
  surfaceY(x: number, z: number): number {
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return -1;
    for (let y = HEIGHT - 1; y >= 0; y--) { const id = c.blocks[lidx(x, y, z)]; if (id !== 0 && L_SOLID[id]) return y; if (isLiquid(id)) return y; }
    return -1;
  }

  setBlock(x: number, y: number, z: number, id: number, meta = 0, opts: { noUpdate?: boolean } = {}): number {
    if (y < 0 || y >= HEIGHT) return -1;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c) return -1;
    const i = lidx(x, y, z);
    const old = c.blocks[i], oldMeta = c.meta[i];
    if (old === id && oldMeta === meta) return old;
    c.blocks[i] = id; c.meta[i] = meta;
    c.modified = true; c.unsaved = true; c.editVersion++; c.urgent = true;
    if (old === B.CRATE && id !== B.CRATE) {
      const items = c.crates.get(i);
      c.crates.delete(i);
      if (items) this.onCrateSpill(x, y, z, items.filter((s): s is Stack => !!s));
    }
    // bookkeeping
    const gk = pkey(x, y, z);
    if (isGrowable(id, meta)) c.growables.add(gk); else c.growables.delete(gk);
    if (id === B.TORCH) c.torches.add(i); else c.torches.delete(i);
    // neighbours to remesh
    const lightChange = L_OPAQUE[old] !== L_OPAQUE[id] || L_EMIT[old] !== L_EMIT[id] || BLOCKS[old]?.filter !== BLOCKS[id]?.filter;
    const lx = x & 15, lz = z & 15;
    const reach = lightChange ? 8 : 1;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nearX = dx === 0 || (dx < 0 ? lx < reach : lx > 15 - reach);
      const nearZ = dz === 0 || (dz < 0 ? lz < reach : lz > 15 - reach);
      if (nearX && nearZ) { const n = this.getChunk(c.cx + dx, c.cz + dz); if (n) { n.editVersion++; n.urgent = true; } }
    }
    if (!opts.noUpdate) {
      this.scheduleFluidAround(x, y, z);
      if (!L_SOLID[id] || id === B.AIR) {
        this.checkSupport(x, y + 1, z);
        this.checkSupport(x + 1, y, z); this.checkSupport(x - 1, y, z);
        this.checkSupport(x, y, z + 1); this.checkSupport(x, y, z - 1);
      }
      if (old === B.DOOR_LOWER && id !== B.DOOR_LOWER && this.getBlock(x, y + 1, z) === B.DOOR_UPPER) this.setBlock(x, y + 1, z, B.AIR);
      if (old === B.DOOR_UPPER && id !== B.DOOR_UPPER && this.getBlock(x, y - 1, z) === B.DOOR_LOWER) this.setBlock(x, y - 1, z, B.AIR);
    }
    return old;
  }

  setMeta(x: number, y: number, z: number, meta: number) {
    return this.setBlock(x, y, z, this.getBlock(x, y, z), meta, { noUpdate: true });
  }

  /** Whether a block with this id/meta can stay at this position. */
  isSupported(id: number, meta: number, x: number, y: number, z: number): boolean {
    const d = blockDef(id);
    const below = this.getBlock(x, y - 1, z);
    if (below === UNLOADED) return true;
    if (id === B.TORCH) {
      const t = meta === 1 ? [x + 1, y, z] : meta === 2 ? [x - 1, y, z] : meta === 3 ? [x, y, z + 1] : meta === 4 ? [x, y, z - 1] : [x, y - 1, z];
      const s = this.getBlock(t[0], t[1], t[2]);
      return s === UNLOADED || (L_SOLID[s] === 1 && L_OPAQUE[s] === 1);
    }
    if (id === B.DOOR_LOWER) return L_SOLID[below] === 1;
    if (id === B.DOOR_UPPER) return below === B.DOOR_LOWER;
    if (id === B.CACTUS) return below === B.SAND || below === B.CACTUS;
    switch (d.support) {
      case 'soil': return below === B.GRASS || below === B.DIRT || below === B.FROST_GRASS || below === B.FARMLAND;
      case 'sand': return below === B.SAND || below === B.DIRT || below === B.GRASS;
      case 'farmland': return below === B.FARMLAND;
      case 'solid': return L_SOLID[below] === 1;
    }
    return true;
  }

  private checkSupport(x: number, y: number, z: number) {
    const id = this.getBlock(x, y, z);
    if (id === 0 || id === UNLOADED) return;
    const d = BLOCKS[id];
    if (!d) return;
    if (!d.support && id !== B.TORCH && id !== B.DOOR_LOWER && id !== B.DOOR_UPPER && id !== B.CACTUS) return;
    const meta = this.getMeta(x, y, z);
    if (!this.isSupported(id, meta, x, y, z)) {
      this.setBlock(x, y, z, B.AIR);
      if (id !== B.DOOR_UPPER) this.onDrop(x, y, z, id, meta);
    }
  }

  // ---------- containers ----------
  getCrate(x: number, y: number, z: number): (Stack | null)[] | null {
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || c.blocks[lidx(x, y, z)] !== B.CRATE) return null;
    const i = lidx(x, y, z);
    let inv = c.crates.get(i);
    if (!inv) { inv = new Array(27).fill(null); c.crates.set(i, inv); }
    return inv;
  }
  markCrateDirty(x: number, z: number) {
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (c) { c.modified = true; c.unsaved = true; }
  }

  // ---------- fluids ----------
  scheduleFluid(x: number, y: number, z: number, delay: number) {
    const k = pkey(x, y, z);
    const t = this.time + delay;
    const cur = this.fluidTicks.get(k);
    if (cur === undefined || cur > t) this.fluidTicks.set(k, t);
  }
  private scheduleFluidAround(x: number, y: number, z: number) {
    const ns = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [dx, dy, dz] of ns) {
      const id = this.getBlock(x + dx, y + dy, z + dz);
      if (isLiquid(id)) this.scheduleFluid(x + dx, y + dy, z + dz, id === B.MAGMA ? 1.0 : 0.25);
    }
  }
  private canFlowInto(id: number) {
    if (id === B.AIR) return true;
    const d = BLOCKS[id];
    return !!d && (d.shape === SHAPE_CROSS || id === B.TORCH);
  }
  private fluidUpdate(x: number, y: number, z: number) {
    const id = this.getBlock(x, y, z);
    if (!isLiquid(id)) return;
    const maxL = id === B.WATER ? 7 : 3;
    const delay = id === B.WATER ? 0.25 : 1.0;
    let m = this.getMeta(x, y, z);
    const H4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    // water + magma interaction
    if (id === B.WATER) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
        if (this.getBlock(x + dx, y + dy, z + dz) === B.MAGMA) {
          const mm = this.getMeta(x + dx, y + dy, z + dz);
          this.setBlock(x + dx, y + dy, z + dz, mm === 0 ? B.SLATE : B.RUBBLE);
        }
      }
    }
    if (m !== 0) {
      let nm = -1;
      if (this.getBlock(x, y + 1, z) === id) nm = 9;
      else {
        let best = 99;
        const cur = (m & 8) ? 99 : (m & 7);
        for (const [dx, dz] of H4) {
          if (this.getBlock(x + dx, y, z + dz) !== id) continue;
          const om = this.getMeta(x + dx, y, z + dz);
          const l = (om === 0 || (om & 8)) ? 0 : om & 7;
          if (l < cur && l < best) best = l; // only strictly closer-to-source neighbours can feed this cell
        }
        if (best < maxL) nm = best + 1;
      }
      if (nm < 0) { this.setBlock(x, y, z, B.AIR); return; }
      if (nm !== m) { this.setBlock(x, y, z, id, nm, { noUpdate: true }); this.scheduleFluidAround(x, y, z); m = nm; }
    }
    const below = this.getBlock(x, y - 1, z);
    if (below === UNLOADED) return;
    if (this.canFlowInto(below)) {
      if (below !== B.AIR) this.onDrop(x, y - 1, z, below, this.getMeta(x, y - 1, z));
      this.setBlock(x, y - 1, z, id, 9, { noUpdate: true });
      this.scheduleFluid(x, y - 1, z, delay);
      return;
    }
    if (below === id || (id === B.WATER && below === B.MAGMA)) return;
    const lvl = (m === 0 || (m & 8)) ? 0 : m & 7;
    if (lvl >= maxL) return;
    for (const [dx, dz] of H4) {
      const nb = this.getBlock(x + dx, y, z + dz);
      if (nb === UNLOADED) continue;
      if (this.canFlowInto(nb)) {
        if (nb !== B.AIR) this.onDrop(x + dx, y, z + dz, nb, this.getMeta(x + dx, y, z + dz));
        this.setBlock(x + dx, y, z + dz, id, lvl + 1, { noUpdate: true });
        this.scheduleFluid(x + dx, y, z + dz, delay);
      } else if (nb === id) {
        const om = this.getMeta(x + dx, y, z + dz);
        if (om !== 0 && !(om & 8) && (om & 7) > lvl + 1) { this.setBlock(x + dx, y, z + dz, id, lvl + 1, { noUpdate: true }); this.scheduleFluid(x + dx, y, z + dz, delay); }
      }
    }
  }

  // ---------- growth ----------
  private growTick() {
    for (const c of this.chunks.values()) {
      for (const k of c.growables) {
        const [x, y, z] = unpk(k);
        const id = this.getBlock(x, y, z);
        const m = this.getMeta(x, y, z);
        if (!isGrowable(id, m)) { c.growables.delete(k); continue; }
        const lt = this.getLight(x, y, z);
        const lit = (lt >> 4) >= 9 || (lt & 15) >= 10;
        if (!lit) continue;
        const r = Math.random();
        if (id === B.GRAIN && r < 0.09) this.setBlock(x, y, z, B.GRAIN, m + 1, { noUpdate: true });
        else if (id === B.BERRY_BUSH && r < 0.05) this.setBlock(x, y, z, B.BERRY_BUSH, 1, { noUpdate: true });
        else if ((id === B.ASH_SAPLING || id === B.PINE_SAPLING) && r < 0.04) this.growTree(x, y, z, id);
      }
    }
  }

  growTree(x: number, y: number, z: number, id: number) {
    for (let dy = 1; dy < 6; dy++) if (this.getBlock(x, y + dy, z) !== B.AIR) return false;
    this.setBlock(x, y, z, B.AIR, 0, { noUpdate: true });
    placeFeature(id === B.PINE_SAPLING ? FEATURE.PINE : FEATURE.ASH, x, y, z, Math.random(), (bx, by, bz, bid, force) => {
      const cur = this.getBlock(bx, by, bz);
      if (cur === UNLOADED) return;
      const d = BLOCKS[cur];
      if (cur === B.AIR || (d && d.shape === SHAPE_CROSS) || (force && (cur === B.ASH_LEAVES || cur === B.PINE_LEAVES))) this.setBlock(bx, by, bz, bid, 0, { noUpdate: true });
    });
    return true;
  }

  // ---------- streaming ----------
  private onMessage = (e: MessageEvent) => {
    const m = e.data;
    if (m.uid !== undefined && m.uid !== this.uid) return;
    if (this.disposed) return;
    const wi = this.workerIndexOf(e.target as Worker);
    if (wi >= 0 && this.jobLoad[wi] > 0) this.jobLoad[wi]--;
    this.jobs = Math.max(0, this.jobs - 1);
    if (m.type === 'gen') {
      const k = ckey(m.cx, m.cz);
      if (!this.pending.has(k)) return;
      this.pending.delete(k);
      this.insertChunk(new Chunk(m.cx, m.cz, m.blocks, m.meta));
    } else if (m.type === 'mesh') {
      const c = this.chunks.get(ckey(m.cx, m.cz));
      if (!c) return;
      c.meshing = false;
      this.applyMesh(c, m as MeshOutput & { lod: number; version: number });
    }
  };

  private workerIndexOf(w: Worker) { return workers().indexOf(w); }

  private post(msg: any, transfer: Transferable[] = []) {
    const ws = workers();
    let best = 0;
    for (let i = 1; i < ws.length; i++) if (this.jobLoad[i] < this.jobLoad[best]) best = i;
    this.jobLoad[best]++;
    this.jobs++;
    msg.uid = this.uid;
    ws[best].postMessage(msg, transfer);
  }

  private insertChunk(c: Chunk) {
    if (this.chunks.has(c.key)) return;
    this.chunks.set(c.key, c);
    for (let i = 0; i < c.blocks.length; i++) {
      const id = c.blocks[i];
      if (id === B.TORCH) c.torches.add(i);
      else if (id === B.GRAIN || id === B.BERRY_BUSH || id === B.ASH_SAPLING || id === B.PINE_SAPLING) {
        if (isGrowable(id, c.meta[i])) {
          const x = c.cx * 16 + (i & 15), z = c.cz * 16 + ((i >> 4) & 15), y = i >> 8;
          c.growables.add(pkey(x, y, z));
        }
      }
    }
  }

  private requestChunk(cx: number, cz: number) {
    const k = ckey(cx, cz);
    this.pending.add(k);
    const skey = cx + ',' + cz;
    if (this.opts.worldId && this.savedKeys.has(skey)) {
      Store.loadChunk(this.opts.worldId, skey).then((d) => {
        if (this.disposed || !this.pending.has(k)) return;
        if (!d) { this.post({ type: 'gen', seed: this.seed, cx, cz }); return; }
        this.pending.delete(k);
        const n = CHUNK * CHUNK * HEIGHT;
        const c = new Chunk(cx, cz, Store.rleDecode(d.b, n), Store.rleDecode(d.m, n));
        c.modified = true;
        if (d.c) for (const [i, items] of d.c as [number, (Stack | null)[]][]) c.crates.set(i, items);
        this.insertChunk(c);
      }).catch(() => { this.post({ type: 'gen', seed: this.seed, cx, cz }); });
    } else {
      this.post({ type: 'gen', seed: this.seed, cx, cz });
    }
  }

  private requestMesh(c: Chunk, lod: number) {
    const blocks: Uint8Array[] = [], metas: Uint8Array[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.getChunk(c.cx + dx, c.cz + dz)!;
      blocks.push(n.blocks.slice()); metas.push(n.meta.slice());
    }
    c.meshing = true;
    c.urgent = false;
    const version = c.editVersion;
    this.post({ type: 'mesh', cx: c.cx, cz: c.cz, blocks, metas, lod, fancy: this.fancy, version }, [...blocks.map((b) => b.buffer), ...metas.map((b) => b.buffer)]);
    (c as any)._sentVersion = version;
    (c as any)._sentLod = lod;
  }

  private neighborsLoaded(c: Chunk) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!this.chunks.has(ckey(c.cx + dx, c.cz + dz))) return false;
    return true;
  }

  private applyMesh(c: Chunk, m: { sections: any[]; conn: Uint8Array; light: Uint8Array | null; lod: number; version: number }) {
    const mats = this.opts.materials;
    c.meshedVersion = m.version;
    c.meshLod = m.lod;
    c.conn = m.lod === 0 ? m.conn : null;
    if (m.light) c.light = m.light;
    for (let s = 0; s < SECTIONS; s++) {
      const sec = m.sections[s];
      const parts: (GeomData | null)[] = [sec.o, sec.c, sec.w];
      for (let g = 0; g < 3; g++) {
        const slot = s * 3 + g;
        const old = c.meshes[slot];
        const data = parts[g];
        if (!data) {
          if (old) { old.geometry.dispose(); this.group.remove(old); c.meshes[slot] = null; }
          continue;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(data.pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(data.nor, 3, true));
        geo.setAttribute('uv', new THREE.BufferAttribute(data.uv, 2));
        geo.setAttribute('color', new THREE.BufferAttribute(data.col, 3, true));
        geo.setAttribute('aLight', new THREE.BufferAttribute(data.lig, 2, true));
        geo.setIndex(new THREE.BufferAttribute(data.idx, 1));
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, s * 16 + 8, 8), 14);
        geo.boundingBox = new THREE.Box3(new THREE.Vector3(0, s * 16, 0), new THREE.Vector3(16, s * 16 + 16, 16));
        if (old) { old.geometry.dispose(); old.geometry = geo; }
        else {
          const mesh = new THREE.Mesh(geo, g === 0 ? mats.opaque : g === 1 ? mats.cutout : mats.water);
          mesh.position.set(c.cx * 16, 0, c.cz * 16);
          mesh.matrixAutoUpdate = false;
          mesh.updateMatrix();
          mesh.updateMatrixWorld();
          if (g < 2) { mesh.castShadow = this.shadows; mesh.receiveShadow = this.shadows; }
          else mesh.renderOrder = 2;
          this.group.add(mesh);
          c.meshes[slot] = mesh;
        }
      }
    }
  }

  private unloadChunk(c: Chunk) {
    for (const m of c.meshes) if (m) { m.geometry.dispose(); this.group.remove(m); }
    c.meshes.fill(null);
    this.chunks.delete(c.key);
  }

  /** Main per-frame update. */
  update(dt: number, px: number, pz: number) {
    if (!this.ready || this.disposed) return;
    this.time += dt;
    const pcx = Math.floor(px / 16), pcz = Math.floor(pz / 16);
    this.center.cx = pcx; this.center.cz = pcz;
    const R = this.radius;
    const nW = workers().length;
    const maxJobs = nW * 3;

    // urgent remeshes (edits) first
    for (const c of this.chunks.values()) {
      if (this.jobs >= maxJobs + 2) break;
      if (c.urgent && !c.meshing && c.meshLod >= 0 && this.neighborsLoaded(c)) {
        const d = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz));
        if (d <= R) this.requestMesh(c, d > this.lodStart ? 1 : 0);
      }
    }
    // generation + meshing in distance order
    for (const [dx, dz, dd] of this.offsets) {
      if (this.jobs >= maxJobs) break;
      const cx = pcx + dx, cz = pcz + dz;
      const k = ckey(cx, cz);
      const c = this.chunks.get(k);
      const dist = Math.floor(dd);
      if (!c) { if (!this.pending.has(k)) this.requestChunk(cx, cz); continue; }
      if (dist > R || c.meshing) continue;
      const lod = dist > this.lodStart ? 1 : 0;
      if ((c.meshedVersion !== c.editVersion || c.meshLod !== lod) && this.neighborsLoaded(c)) this.requestMesh(c, lod);
    }
    // unload far chunks
    const U = R + 3;
    for (const c of this.chunks.values()) {
      if (Math.abs(c.cx - pcx) > U || Math.abs(c.cz - pcz) > U) {
        if (c.unsaved && this.opts.worldId) this.saveChunkNow(c);
        this.unloadChunk(c);
      }
    }
    for (const k of [...this.pending]) {
      const cz = (k % 65536) - 32768, cx = Math.floor(k / 65536) - 32768;
      if (Math.abs(cx - pcx) > U || Math.abs(cz - pcz) > U) this.pending.delete(k);
    }

    // fluids
    this.fluidTimer += dt;
    if (this.fluidTimer >= 0.125) {
      this.fluidTimer = 0;
      let n = 0;
      const due: number[] = [];
      for (const [k, t] of this.fluidTicks) { if (t <= this.time) { due.push(k); if (++n > 400) break; } }
      for (const k of due) { this.fluidTicks.delete(k); const [x, y, z] = unpk(k); if (this.isLoaded(x, z)) this.fluidUpdate(x, y, z); }
    }
    this.growTimer += dt;
    if (this.growTimer > 2) { this.growTimer = 0; this.growTick(); }
  }

  /** Portal-style occlusion culling through section connectivity graphs. */
  updateVisibility(camera: THREE.Camera) {
    const cam = camera.position;
    const pcx = Math.floor(cam.x / 16), pcz = Math.floor(cam.z / 16), psy = Math.floor(cam.y / 16);
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const startChunk = this.getChunk(pcx, pcz);
    const inside = psy >= 0 && psy < SECTIONS && startChunk && startChunk.conn;
    const camBlock = this.getBlock(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z));
    if (!inside || L_OPAQUE[camBlock]) {
      for (const c of this.chunks.values()) for (const m of c.meshes) if (m) m.visible = true;
      return;
    }
    const RR = this.radius + 3, G = 2 * RR + 1, GG = G * G;
    const vis = this.visGrid; vis.fill(0);
    const q = this.visQueue;
    let qh = 0, qt = 0;
    const gi = (cx: number, sy: number, cz: number) => (cx - pcx + RR) + (cz - pcz + RR) * G + sy * GG;
    const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];
    const OPP = [1, 0, 3, 2, 5, 4];
    vis[gi(pcx, psy, pcz)] = 1;
    // queue entries: grid index, entry face, direction mask (packed)
    const pushN = (cx: number, sy: number, cz: number, from: number, dirs: number) => {
      if (sy < 0 || sy >= SECTIONS || Math.abs(cx - pcx) > RR - 1 || Math.abs(cz - pcz) > RR - 1) return;
      const g = gi(cx, sy, cz);
      if (vis[g]) return;
      this.tmpBox.min.set(cx * 16, sy * 16, cz * 16);
      this.tmpBox.max.set(cx * 16 + 16, sy * 16 + 16, cz * 16 + 16);
      if (!this.frustum.intersectsBox(this.tmpBox)) return;
      vis[g] = 1;
      q[qt++] = g; q[qt++] = from | (dirs << 3);
    };
    for (let f = 0; f < 6; f++) pushN(pcx + DX[f], psy + DY[f], pcz + DZ[f], OPP[f], 1 << f);
    while (qh < qt) {
      const g = q[qh++], pk = q[qh++];
      const from = pk & 7, dirs = pk >> 3;
      const sy = Math.floor(g / GG), r = g - sy * GG, gz = Math.floor(r / G), gx = r - gz * G;
      const cx = gx - RR + pcx, cz = gz - RR + pcz;
      const c = this.getChunk(cx, cz);
      if (!c) continue;
      const conn = c.conn;
      for (let f = 0; f < 6; f++) {
        if (dirs & (1 << OPP[f])) continue;
        if (conn && !(conn[sy * 6 + from] & (1 << f))) continue;
        pushN(cx + DX[f], sy + DY[f], cz + DZ[f], OPP[f], dirs | (1 << f));
      }
    }
    for (const c of this.chunks.values()) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      const inGrid = Math.abs(dx) < RR && Math.abs(dz) < RR;
      for (let s = 0; s < SECTIONS; s++) {
        const v = inGrid ? vis[gi(c.cx, s, c.cz)] === 1 : false;
        for (let g = 0; g < 3; g++) { const m = c.meshes[s * 3 + g]; if (m) m.visible = v; }
      }
    }
  }

  // ---------- persistence ----------
  private chunkData(c: Chunk) {
    return {
      b: Store.rleEncode(c.blocks), m: Store.rleEncode(c.meta),
      c: [...c.crates.entries()].map(([i, items]) => [i, items.map((s) => (s ? { ...s } : null))]),
    };
  }
  private saveChunkNow(c: Chunk) {
    if (!this.opts.worldId) return;
    c.unsaved = false;
    this.savedKeys.add(c.skey);
    Store.saveChunks(this.opts.worldId, [{ key: c.skey, data: this.chunkData(c) }]).catch((e) => console.warn('chunk save failed', e));
  }
  async saveAll() {
    if (!this.opts.worldId) return;
    const items: { key: string; data: any }[] = [];
    for (const c of this.chunks.values()) if (c.unsaved) { c.unsaved = false; this.savedKeys.add(c.skey); items.push({ key: c.skey, data: this.chunkData(c) }); }
    await Store.saveChunks(this.opts.worldId, items);
  }

  stats() {
    let meshes = 0, tris = 0, visible = 0;
    for (const c of this.chunks.values()) for (const m of c.meshes) if (m) {
      meshes++; const idx = m.geometry.index; if (idx) tris += idx.count / 3; if (m.visible) visible++;
    }
    return { chunks: this.chunks.size, pending: this.pending.size, jobs: this.jobs, meshes, visible, tris };
  }

  /** True when the chunks around a point are generated and meshed (used by the loading screen). */
  isAreaReady(x: number, z: number, r = 1) {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const c = this.getChunk(cx + dx, cz + dz);
      if (!c || c.meshLod < 0) return false;
    }
    return true;
  }

  dispose() {
    this.disposed = true;
    for (const w of workers()) w.removeEventListener('message', this.onMessage);
    for (const c of [...this.chunks.values()]) this.unloadChunk(c);
    this.group.parent?.remove(this.group);
  }
}

function isGrowable(id: number, meta: number) {
  return (id === B.GRAIN && meta < 7) || (id === B.BERRY_BUSH && meta === 0) || id === B.ASH_SAPLING || id === B.PINE_SAPLING;
}
