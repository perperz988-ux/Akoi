// Deterministic procedural terrain: continents, oceans, islands, rivers, hills, mountains,
// biomes, caves (interpolated 3D noise), ore veins, trees and vegetation.
import { B, CHUNK, HEIGHT } from './Blocks';
import { Simplex, hash3, hashString, lerp, mulberry32, smoothstep } from './Noise';

export const SEA = 46;
export const BIOME = { OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4, MOUNTAINS: 5, TUNDRA: 6, RIVER: 7, ISLAND: 8 } as const;
export const BIOME_NAMES = ['Ocean', 'Shoreline', 'Meadows', 'Ashwood Forest', 'Dunes', 'Highlands', 'Frostlands', 'River', 'Isles'];

export interface Column { h: number; biome: number; mount: number }

export function seedFromString(s: string): number {
  const t = s.trim();
  if (/^-?\d+$/.test(t)) return (parseInt(t, 10) >>> 0);
  return hashString(t || 'akoi');
}

const idx = (x: number, y: number, z: number) => x + z * CHUNK + y * CHUNK * CHUNK;

interface Feature { x: number; z: number; y: number; kind: number; r: number }
const F_ASH = 0, F_PINE = 1, F_PALM = 2, F_CACTUS = 3, F_BIGASH = 4;

export class Generator {
  readonly seed: number;
  private nC: Simplex; private nH: Simplex; private nE: Simplex; private nR: Simplex; private nI: Simplex;
  private nRiv: Simplex; private nT: Simplex; private nW: Simplex; private nCave1: Simplex; private nCave2: Simplex;
  private nCave3: Simplex; private nD: Simplex;
  private nZone: Simplex; private nSky: Simplex; private nSky2: Simplex; private nAsh: Simplex; private nAsh2: Simplex;
  private colCache = new Map<number, Column>();

  constructor(seed: number) {
    this.seed = seed >>> 0;
    const r = mulberry32(this.seed);
    const s = () => Math.floor(r() * 4294967296);
    this.nC = new Simplex(s()); this.nH = new Simplex(s()); this.nE = new Simplex(s()); this.nR = new Simplex(s());
    this.nI = new Simplex(s()); this.nRiv = new Simplex(s()); this.nT = new Simplex(s()); this.nW = new Simplex(s());
    this.nCave1 = new Simplex(s()); this.nCave2 = new Simplex(s()); this.nCave3 = new Simplex(s()); this.nD = new Simplex(s());
    this.nZone = new Simplex(s()); this.nSky = new Simplex(s()); this.nSky2 = new Simplex(s()); this.nAsh = new Simplex(s()); this.nAsh2 = new Simplex(s());
  }

  column(x: number, z: number): Column {
    const key = (x + 1048576) * 4194304 + (z + 1048576);
    const c = this.colCache.get(key);
    if (c) return c;
    const col = this.computeColumn(x, z);
    if (this.colCache.size > 20000) this.colCache.clear();
    this.colCache.set(key, col);
    return col;
  }

  private computeColumn(x: number, z: number): Column {
    const cont = this.nC.fbm2(x / 1000, z / 1000, 4) + 0.12;
    const land = smoothstep(-0.16, 0.04, cont);
    const hills = this.nH.fbm2(x / 130, z / 130, 4);
    const ero = this.nE.fbm2(x / 520, z / 520, 3);
    const ridge = 1 - Math.abs(this.nR.fbm2(x / 360, z / 360, 4));
    const mount = Math.pow(ridge, 3) * smoothstep(0.02, 0.4, ero) * smoothstep(0.0, 0.25, cont);
    const landH = SEA + 4 + cont * 12 + hills * 8 + mount * 64;
    const seaH = SEA - 16 + hills * 6 + cont * 12;
    let h = lerp(seaH, landH, land);
    let island = false;
    if (land < 0.5) {
      const isl = this.nI.fbm2(x / 170, z / 170, 3) - 0.3;
      if (isl > 0) {
        const ih = SEA - 8 + isl * 95 * (1 - land);
        if (ih > h) { h = ih; island = ih > SEA; }
      }
    }
    let river = false;
    if (land > 0.45 && !island) {
      const rv = Math.abs(this.nRiv.fbm2(x / 720, z / 720, 3));
      if (rv < 0.05) {
        const k = smoothstep(0.05, 0.015, rv) * (1 - Math.min(0.85, mount * 1.4));
        const target = SEA - 4;
        if (h > target) h = lerp(h, target, k);
        if (rv < 0.024 && h < SEA + 1) river = true;
      }
    }
    const hi = Math.max(4, Math.min(HEIGHT - 6, Math.floor(h)));
    const temp = this.nT.fbm2(x / 1200, z / 1200, 2) * 1.6 - Math.max(0, hi - SEA - 20) / 70;
    const humid = this.nW.fbm2(x / 900, z / 900, 2) * 1.6;
    let biome: number;
    if (river) biome = BIOME.RIVER;
    else if (hi < SEA - 1) biome = island ? BIOME.ISLAND : BIOME.OCEAN;
    else if (island) biome = BIOME.ISLAND;
    else if (hi <= SEA + 1 && land < 0.98) biome = BIOME.BEACH;
    else if (mount > 0.3 && hi > SEA + 26) biome = BIOME.MOUNTAINS;
    else if (temp < -0.3) biome = BIOME.TUNDRA;
    else if (temp > 0.28 && humid < 0.1) biome = BIOME.DESERT;
    else if (humid > 0.05) biome = BIOME.FOREST;
    else biome = BIOME.PLAINS;
    return { h: hi, biome, mount };
  }

  // ---- caves: 3D noise sampled on a 4-block lattice and trilinearly interpolated ----
  private caveLattice(gx: number, gy: number, gz: number): number {
    const x = gx * 4, y = gy * 4, z = gz * 4;
    const a = this.nCave1.n3(x / 46, y / 30, z / 46);
    const b = this.nCave2.n3(x / 46, y / 30, z / 46);
    let v = Math.abs(a) + Math.abs(b) - 0.13; // spaghetti tunnels
    if (y < 42) {
      const c = this.nCave3.n3(x / 75, y / 42, z / 75);
      v = Math.min(v, 0.6 - c); // big caverns
    }
    return v;
  }

  isCave(x: number, y: number, z: number): boolean {
    if (y <= 3) return false;
    const gx = Math.floor(x / 4), gy = Math.floor(y / 4), gz = Math.floor(z / 4);
    const fx = (x - gx * 4) / 4, fy = (y - gy * 4) / 4, fz = (z - gz * 4) / 4;
    const c000 = this.caveLattice(gx, gy, gz), c100 = this.caveLattice(gx + 1, gy, gz);
    const c010 = this.caveLattice(gx, gy + 1, gz), c110 = this.caveLattice(gx + 1, gy + 1, gz);
    const c001 = this.caveLattice(gx, gy, gz + 1), c101 = this.caveLattice(gx + 1, gy, gz + 1);
    const c011 = this.caveLattice(gx, gy + 1, gz + 1), c111 = this.caveLattice(gx + 1, gy + 1, gz + 1);
    const v = lerp(lerp(lerp(c000, c100, fx), lerp(c010, c110, fx), fy), lerp(lerp(c001, c101, fx), lerp(c011, c111, fx), fy), fz);
    return v < 0;
  }

  generateChunk(cx: number, cz: number, dim = 0): { blocks: Uint8Array; meta: Uint8Array } {
    if (dim === 1) return this.genSky(cx, cz);
    if (dim === 2) return this.genAsh(cx, cz);
    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const meta = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const cols: Column[] = [];
    let maxH = 0;
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const c = this.column(x0 + x, z0 + z); cols.push(c); if (c.h > maxH) maxH = c.h;
    }
    // cave lattice for this chunk: 5 x (gyMax+2) x 5
    const gyN = Math.ceil((maxH + 2) / 4) + 2;
    const lat = new Float32Array(5 * 5 * gyN);
    const gx0 = Math.floor(x0 / 4), gz0 = Math.floor(z0 / 4);
    for (let gy = 0; gy < gyN; gy++) for (let gz = 0; gz < 5; gz++) for (let gx = 0; gx < 5; gx++)
      lat[gx + gz * 5 + gy * 25] = this.caveLattice(gx0 + gx, gy, gz0 + gz);
    const rnd = mulberry32(hash3(cx, 7, cz, this.seed) * 4294967296);
    const dn = this.nD;

    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const col = cols[x + z * CHUNK];
      const h = col.h, bio = col.biome;
      const wx = x0 + x, wz = z0 + z;
      const underwater = h < SEA;
      const dnoise = dn.n2(wx / 9, wz / 9);
      const slateTop = 18 + Math.floor(dnoise * 4);
      for (let y = 0; y <= h; y++) {
        let id: number = B.STONE;
        if (y === 0 || (y <= 2 && rnd() < 0.5)) id = B.DEEPSTONE;
        else if (y < slateTop) id = B.SLATE;
        const depth = h - y;
        if (id === B.STONE) id = this.surfaceBlock(bio, depth, h, dnoise, underwater, col.mount, id);
        // caves
        if (id !== B.DEEPSTONE && y > 3 && !(underwater && y > h - 6) && !(bio === BIOME.RIVER && y > h - 5) && !(bio === BIOME.BEACH && y > h - 4)) {
          const gy = y >> 2, fy = (y & 3) / 4;
          const lx = x + (x0 - gx0 * 4), lz = z + (z0 - gz0 * 4);
          const gxl = lx >> 2, gzl = lz >> 2, fx = (lx & 3) / 4, fz = (lz & 3) / 4;
          const o = gxl + gzl * 5 + gy * 25;
          if (gy + 1 < gyN) {
            const v = lerp(
              lerp(lerp(lat[o], lat[o + 1], fx), lerp(lat[o + 25], lat[o + 26], fx), fy),
              lerp(lerp(lat[o + 5], lat[o + 6], fx), lerp(lat[o + 30], lat[o + 31], fx), fy), fz);
            if (v < 0) id = y <= 9 ? B.MAGMA : B.AIR;
          }
        }
        blocks[idx(x, y, z)] = id;
      }
      // water / ice
      for (let y = h + 1; y <= SEA; y++) {
        blocks[idx(x, y, z)] = (y === SEA && bio !== BIOME.RIVER && this.isFrozen(bio, wx, wz)) ? B.ICE : B.WATER;
      }
    }

    // fix grass under cave openings: dirt below air is fine; turf with no air above remains turf
    this.ores(blocks, cx, cz);
    this.caveZones(blocks, meta, cols, cx, cz);
    this.decorate(blocks, meta, cols, cx, cz);
    this.features(blocks, cx, cz);
    // glowcaps on cave floors
    const r2 = mulberry32(hash3(cx, 99, cz, this.seed) * 4294967296);
    for (let n = 0; n < 40; n++) {
      const x = Math.floor(r2() * 16), z = Math.floor(r2() * 16), y = 6 + Math.floor(r2() * 50);
      const h = cols[x + z * 16].h;
      if (y >= h - 6) continue;
      const i = idx(x, y, z);
      if (blocks[i] === B.AIR && (blocks[i - 256] === B.STONE || blocks[i - 256] === B.SLATE)) blocks[i] = B.GLOWCAP;
    }
    return { blocks, meta };
  }

  private isFrozen(bio: number, x: number, z: number) {
    if (bio === BIOME.TUNDRA) return true;
    if (bio === BIOME.OCEAN || bio === BIOME.BEACH) {
      const temp = this.nT.fbm2(x / 1200, z / 1200, 2) * 1.6;
      return temp < -0.4;
    }
    return false;
  }

  private surfaceBlock(bio: number, depth: number, h: number, n: number, underwater: boolean, mount: number, id: number): number {
    if (underwater || bio === BIOME.RIVER) {
      if (depth < 3) {
        if (bio === BIOME.RIVER) return n > 0.3 ? B.GRAVEL : (n < -0.4 ? B.CLAY : B.SAND);
        return h < SEA - 9 ? (n > 0 ? B.GRAVEL : (n < -0.35 ? B.CLAY : B.SAND)) : B.SAND;
      }
      return id;
    }
    switch (bio) {
      case BIOME.DESERT:
        if (depth < 4) return B.SAND;
        if (depth < 8) return B.SANDSTONE;
        return id;
      case BIOME.BEACH:
        if (depth < 4) return B.SAND;
        if (depth < 6) return B.SANDSTONE;
        return id;
      case BIOME.ISLAND:
        if (h > SEA + 3) { if (depth === 0) return B.GRASS; if (depth < 3) return B.DIRT; return id; }
        if (depth < 4) return B.SAND;
        return id;
      case BIOME.TUNDRA:
        if (depth === 0) return B.FROST_GRASS;
        if (depth < 3) return B.DIRT;
        return id;
      case BIOME.MOUNTAINS:
        if (h > SEA + 54 + n * 6) return depth < 2 ? B.SNOW : id;
        if (h > SEA + 38 + n * 8 || mount > 0.65) return depth === 0 && n > 0.45 ? B.GRAVEL : id;
        if (depth === 0) return B.GRASS;
        if (depth < 3) return B.DIRT;
        return id;
      default:
        if (depth === 0) return B.GRASS;
        if (depth < 4) return B.DIRT;
        return id;
    }
  }

  private ores(blocks: Uint8Array, cx: number, cz: number) {
    const r = mulberry32(hash3(cx, 31, cz, this.seed) * 4294967296);
    const vein = (ore: number, count: number, size: number, ymin: number, ymax: number) => {
      for (let v = 0; v < count; v++) {
        let x = r() * 16, y = ymin + r() * (ymax - ymin), z = r() * 16;
        for (let s = 0; s < size; s++) {
          const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
          if (ix >= 0 && ix < 16 && iz >= 0 && iz < 16 && iy > 0 && iy < HEIGHT) {
            const i = idx(ix, iy, iz);
            const b = blocks[i];
            if (b === B.STONE || b === B.SLATE) blocks[i] = ore;
          }
          x += r() * 2 - 1; y += r() * 2 - 1; z += r() * 2 - 1;
        }
      }
    };
    vein(B.COAL_ORE, 16, 9, 6, 100);
    vein(B.COPPER_ORE, 10, 7, 6, 64);
    vein(B.IRON_ORE, 8, 6, 4, 50);
    vein(B.GLOWSHARD_ORE, 3, 4, 4, 36);
    vein(B.SUNSTONE_ORE, 2, 6, 4, 28);
    vein(B.AZURITE_ORE, 2, 4, 3, 18);
    vein(B.FROSTQUARTZ_ORE, 4, 6, 62, 120);
    vein(B.RUBELLITE_ORE, 2, 4, 3, 14);
  }

  private decorate(blocks: Uint8Array, meta: Uint8Array, cols: Column[], cx: number, cz: number) {
    const r = mulberry32(hash3(cx, 53, cz, this.seed) * 4294967296);
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) {
      const col = cols[x + z * 16];
      const y = col.h + 1;
      if (y >= HEIGHT - 1) continue;
      const below = blocks[idx(x, col.h, z)];
      const i = idx(x, y, z);
      if (blocks[i] !== B.AIR) continue;
      const p = r();
      if (below === B.GRASS) {
        const bio = col.biome;
        const grassChance = bio === BIOME.PLAINS ? 0.22 : bio === BIOME.FOREST ? 0.12 : 0.06;
        if (p < grassChance) blocks[i] = B.TALL_GRASS;
        else if (p < grassChance + 0.018) blocks[i] = r() < 0.5 ? B.SUNPETAL : B.BLUEBELL;
        else if (p < grassChance + 0.024 && bio !== BIOME.MOUNTAINS) { blocks[i] = B.BERRY_BUSH; meta[i] = r() < 0.6 ? 1 : 0; }
      } else if (below === B.FROST_GRASS) {
        if (p < 0.04) blocks[i] = B.TALL_GRASS;
        else if (p < 0.05) blocks[i] = B.BLUEBELL;
      } else if (below === B.SAND && col.biome === BIOME.DESERT) {
        if (p < 0.012) blocks[i] = B.DRY_SHRUB;
      }
    }
  }

  private featuresFor(cx: number, cz: number): Feature[] {
    const r = mulberry32(hash3(cx, 17, cz, this.seed) * 4294967296);
    const out: Feature[] = [];
    const center = this.column(cx * 16 + 8, cz * 16 + 8);
    let tries = 0;
    switch (center.biome) {
      case BIOME.FOREST: tries = 9; break;
      case BIOME.PLAINS: tries = r() < 0.5 ? 1 : 0; break;
      case BIOME.TUNDRA: tries = 3; break;
      case BIOME.MOUNTAINS: tries = 2; break;
      case BIOME.DESERT: tries = 3; break;
      case BIOME.ISLAND: case BIOME.BEACH: tries = 2; break;
      default: tries = 0;
    }
    for (let t = 0; t < tries; t++) {
      const lx = 2 + Math.floor(r() * 12), lz = 2 + Math.floor(r() * 12);
      const wx = cx * 16 + lx, wz = cz * 16 + lz;
      const col = this.column(wx, wz);
      if (col.h <= SEA) continue;
      if (this.isCave(wx, col.h, wz) || this.isCave(wx, col.h - 1, wz)) continue;
      const rr = r();
      let kind = -1;
      switch (col.biome) {
        case BIOME.FOREST: kind = rr < 0.08 ? F_BIGASH : (rr < 0.8 ? F_ASH : F_PINE); break;
        case BIOME.PLAINS: kind = F_ASH; break;
        case BIOME.TUNDRA: kind = F_PINE; break;
        case BIOME.MOUNTAINS: if (col.h < SEA + 38) kind = F_PINE; break;
        case BIOME.DESERT: kind = F_CACTUS; break;
        case BIOME.ISLAND: case BIOME.BEACH: if (rr < 0.7) kind = F_PALM; break;
      }
      if (kind < 0) continue;
      out.push({ x: wx, z: wz, y: col.h + 1, kind, r: r() });
    }
    return out;
  }

  private features(blocks: Uint8Array, cx: number, cz: number) {
    const x0 = cx * 16, z0 = cz * 16;
    const set = (wx: number, y: number, wz: number, id: number, force: boolean) => {
      const x = wx - x0, z = wz - z0;
      if (x < 0 || x > 15 || z < 0 || z > 15 || y < 1 || y >= HEIGHT) return;
      const i = idx(x, y, z);
      const cur = blocks[i];
      if (force ? (cur === B.AIR || cur === B.TALL_GRASS || cur === B.SUNPETAL || cur === B.BLUEBELL || cur === B.DRY_SHRUB || cur === B.BERRY_BUSH || cur === B.ASH_LEAVES || cur === B.PINE_LEAVES || cur === B.PALM_LEAVES || cur === B.DIRT || cur === B.GRASS)
        : (cur === B.AIR || cur === B.TALL_GRASS)) blocks[i] = id;
    };
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const f of this.featuresFor(cx + dx, cz + dz)) {
        if (f.x < x0 - 4 || f.x > x0 + 19 || f.z < z0 - 4 || f.z > z0 + 19) continue;
        placeFeature(f.kind, f.x, f.y, f.z, f.r, set);
      }
    }
  }

  /** Finds a dry land spawn point near the origin. */
  /** Decorates cave air pockets into themed zones: glowing moss grottos, prism crystal caverns, frost caves, deep basalt. */
  private caveZones(blocks: Uint8Array, meta: Uint8Array, cols: Column[], cx: number, cz: number) {
    const r = mulberry32(hash3(cx, 211, cz, this.seed) * 4294967296);
    const solidStone = (b: number) => b === B.STONE || b === B.SLATE || b === B.DIRT || b === B.GRAVEL;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const col = cols[x + z * 16];
      const wx = cx * 16 + x, wz = cz * 16 + z;
      const frosty = col.biome === BIOME.TUNDRA;
      for (let y = 5; y < col.h - 5; y++) {
        const i = idx(x, y, z);
        if (blocks[i] !== B.AIR) continue;
        const below = blocks[i - 256], above = blocks[i + 256];
        const floor = solidStone(below), ceil = solidStone(above);
        if (!floor && !ceil) continue;
        const zone = this.nZone.n3(wx / 80, y / 36, wz / 80);
        if (frosty && y > 30) {
          if (floor && r() < 0.6) blocks[i - 256] = B.ICE;
          else if (ceil && r() < 0.3) blocks[i + 256] = B.SNOW;
        } else if (zone > 0.3) { // glowing moss grotto
          if (floor) { blocks[i - 256] = r() < 0.15 ? B.MUD : B.MOSS; if (r() < 0.12) blocks[i] = B.GLOWCAP; }
          if (ceil && r() < 0.22) {
            const len = 1 + Math.floor(r() * 4);
            for (let k = 0; k < len; k++) { const j = i - k * 256; if (blocks[j] !== B.AIR) break; blocks[j] = B.GLOW_VINE; }
          }
        } else if (zone < -0.38) { // prism crystal cavern
          if (floor && r() < 0.1) blocks[i] = B.CRYSTAL_SHARD;
          if (floor && r() < 0.18) blocks[i - 256] = B.CRYSTAL_BLOCK;
          if (ceil && r() < 0.18) blocks[i + 256] = B.CRYSTAL_BLOCK;
        } else if (y < 20) { // deep basalt
          if (floor && r() < 0.35) blocks[i - 256] = B.BASALT;
          if (ceil && r() < 0.35) blocks[i + 256] = B.BASALT;
        }
      }
    }
    void meta;
  }

  // ---------------------------------------------------------------- Celestia (sky islands)
  private genSky(cx: number, cz: number) {
    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT), meta = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const r = mulberry32(hash3(cx, 401, cz, this.seed) * 4294967296);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x, wz = cz * 16 + z;
      const mask = this.nSky2.fbm2(wx / 260, wz / 260, 3) * 0.6;
      for (let y = 24; y < 112; y++) {
        const fall = ((y - 66) / 36) ** 2;
        const d = this.nSky.n3(wx / 64, y / 30, wz / 64) + this.nSky2.n3(wx / 22, y / 16, wz / 22) * 0.3 + mask - fall * 0.9;
        if (d > 0.28) blocks[idx(x, y, z)] = B.SKYSTONE;
      }
      // cloud banks
      const c = this.nSky2.fbm2(wx / 50 + 100, wz / 50, 2);
      if (c > 0.32) for (let y = 30; y < 30 + Math.floor((c - 0.32) * 12) + 1; y++) blocks[idx(x, y, z)] = B.CLOUD;
      // surface pass
      for (let y = 111; y > 24; y--) {
        const i = idx(x, y, z);
        if (blocks[i] !== B.SKYSTONE || blocks[i + 256] !== B.AIR) continue;
        blocks[i] = B.SKY_GRASS;
        const p = r();
        if (p < 0.1) blocks[i + 256] = B.TALL_GRASS;
        else if (p < 0.13) blocks[i + 256] = r() < 0.5 ? B.SUNPETAL : B.BLUEBELL;
        else if (p < 0.135 && x > 2 && x < 13 && z > 2 && z < 13 && y < 100) this.silverTree(blocks, x, y + 1, z, r);
      }
    }
    // starstone & glowshard veins
    for (let v = 0; v < 6; v++) {
      let x = r() * 16, y = 30 + r() * 70, z = r() * 16;
      const ore = v < 4 ? B.STARSTONE_ORE : B.GLOWSHARD_ORE;
      for (let k = 0; k < 6; k++) {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        if (ix >= 0 && ix < 16 && iz >= 0 && iz < 16) { const i = idx(ix, iy, iz); if (blocks[i] === B.SKYSTONE) blocks[i] = ore; }
        x += r() * 2 - 1; y += r() * 2 - 1; z += r() * 2 - 1;
      }
    }
    return { blocks, meta };
  }

  private silverTree(blocks: Uint8Array, x: number, y: number, z: number, r: () => number) {
    const h = 4 + Math.floor(r() * 3);
    for (let ly = h - 2; ly <= h + 1; ly++) {
      const rad = ly > h ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
        const i = idx(x + dx, y + ly, z + dz);
        if (blocks[i] === B.AIR) blocks[i] = B.SILVER_LEAVES;
      }
    }
    for (let ly = 0; ly < h; ly++) blocks[idx(x, y + ly, z)] = B.SILVER_LOG;
  }

  // ---------------------------------------------------------------- Ashen Wastes (volcanic)
  private genAsh(cx: number, cz: number) {
    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT), meta = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    const r = mulberry32(hash3(cx, 503, cz, this.seed) * 4294967296);
    const LAVA = 40;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const wx = cx * 16 + x, wz = cz * 16 + z;
      let h = Math.floor(50 + this.nAsh.fbm2(wx / 140, wz / 140, 4) * 22 + Math.abs(this.nAsh2.n2(wx / 40, wz / 40)) * 8);
      const pillar = this.nAsh2.n2(wx / 9, wz / 9);
      if (pillar > 0.72) h += Math.floor((pillar - 0.72) * 60);
      h = Math.max(6, Math.min(118, h));
      for (let y = 0; y <= h; y++) {
        let id: number = y === 0 ? B.DEEPSTONE : h - y < 3 && pillar <= 0.72 ? B.ASH_SOIL : B.BASALT;
        if (y > 4 && y < h - 4 && this.nAsh.n3(wx / 30, y / 20, wz / 30) > 0.55) id = y < 14 ? B.MAGMA : B.AIR;
        blocks[idx(x, y, z)] = id;
      }
      for (let y = h + 1; y <= LAVA; y++) blocks[idx(x, y, z)] = B.MAGMA;
      if (h > LAVA + 1 && pillar <= 0.72) {
        const p = r();
        if (p < 0.012 && x > 2 && x < 13 && z > 2 && z < 13) {
          const th = 3 + Math.floor(r() * 3);
          for (let ly = 1; ly <= th; ly++) blocks[idx(x, h + ly, z)] = B.CHARRED_LOG;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (let ly = th; ly <= th + 1; ly++) {
            const i = idx(x + dx, h + ly, z + dz);
            if (blocks[i] === B.AIR && (ly === th || (!dx || !dz))) blocks[i] = B.EMBER_LEAVES;
          }
        } else if (p < 0.03) blocks[idx(x, h + 1, z)] = B.DRY_SHRUB;
        else if (p < 0.036) blocks[idx(x, h + 1, z)] = B.GLOWCAP;
      }
    }
    for (let v = 0; v < 10; v++) {
      let x = r() * 16, y = 8 + r() * 60, z = r() * 16;
      const ore = v < 6 ? B.EMBERITE_ORE : v < 8 ? B.COAL_ORE : B.SUNSTONE_ORE;
      for (let k = 0; k < 6; k++) {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        if (ix >= 0 && ix < 16 && iz >= 0 && iz < 16 && iy > 0 && iy < HEIGHT) { const i = idx(ix, iy, iz); if (blocks[i] === B.BASALT) blocks[i] = ore; }
        x += r() * 2 - 1; y += r() * 2 - 1; z += r() * 2 - 1;
      }
    }
    return { blocks, meta };
  }

  findSpawn(): { x: number; y: number; z: number } {
    for (let r = 0; r < 4000; r += 8) {
      const steps = Math.max(1, Math.floor(r / 6));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        const c = this.column(x, z);
        if (c.h > SEA + 1 && c.biome !== BIOME.MOUNTAINS && c.biome !== BIOME.RIVER && !this.isCave(x, c.h, z)) return { x: x + 0.5, y: c.h + 1, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: HEIGHT - 10, z: 0.5 };
  }
}

export type SetFn = (x: number, y: number, z: number, id: number, force: boolean) => void;

/** Tree/feature shapes. Also used by saplings growing in the live world. */
export function placeFeature(kind: number, x: number, y: number, z: number, r: number, set: SetFn) {
  const rr = mulberry32(Math.floor(r * 4294967296));
  if (kind === F_ASH || kind === F_BIGASH) {
    const big = kind === F_BIGASH;
    const th = big ? 7 + Math.floor(rr() * 3) : 4 + Math.floor(rr() * 3);
    const top = y + th;
    const rad = big ? 3 : 2;
    for (let ly = top - (big ? 3 : 2); ly <= top + 1; ly++) {
      const rad2 = ly >= top ? rad - 1 : rad;
      for (let lz = -rad2; lz <= rad2; lz++) for (let lx = -rad2; lx <= rad2; lx++) {
        const d = lx * lx + lz * lz;
        if (d > rad2 * rad2 + 1) continue;
        if (Math.abs(lx) === rad2 && Math.abs(lz) === rad2 && rr() < 0.6) continue;
        set(x + lx, ly, z + lz, B.ASH_LEAVES, false);
      }
    }
    for (let ly = 0; ly < th; ly++) set(x, y + ly, z, B.ASH_LOG, true);
    if (big) for (let b = 0; b < 3; b++) {
      const ax = Math.round(Math.cos(b * 2.1 + r * 6) * 2), az = Math.round(Math.sin(b * 2.1 + r * 6) * 2);
      set(x + Math.sign(ax), y + th - 3, z + Math.sign(az), B.ASH_LOG, true);
      set(x + ax, y + th - 2, z + az, B.ASH_LOG, true);
    }
  } else if (kind === F_PINE) {
    const th = 7 + Math.floor(rr() * 4);
    const top = y + th;
    let rad = 0;
    for (let ly = top + 1; ly >= y + 3; ly--) {
      for (let lz = -rad; lz <= rad; lz++) for (let lx = -rad; lx <= rad; lx++) {
        if (Math.abs(lx) + Math.abs(lz) > rad + (rad > 1 ? 1 : 0)) continue;
        set(x + lx, ly, z + lz, B.PINE_LEAVES, false);
      }
      rad = rad >= 3 ? 1 : rad + 1;
      if (ly > top - 2) rad = Math.min(rad, 1);
    }
    for (let ly = 0; ly < th; ly++) set(x, y + ly, z, B.PINE_LOG, true);
  } else if (kind === F_PALM) {
    const th = 5 + Math.floor(rr() * 3);
    const dx = rr() < 0.5 ? (rr() < 0.5 ? -1 : 1) : 0, dz = dx === 0 ? (rr() < 0.5 ? -1 : 1) : 0;
    let px = x, pz = z;
    for (let ly = 0; ly < th; ly++) {
      if (ly === Math.floor(th / 2)) { px += dx; pz += dz; }
      set(px, y + ly, pz, B.PALM_LOG, true);
    }
    const ty = y + th;
    set(px, ty, pz, B.PALM_LEAVES, false);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (const [ax, az] of dirs) {
      const len = ax !== 0 && az !== 0 ? 2 : 3;
      for (let l = 1; l <= len; l++) set(px + ax * l, ty - (l === len ? 1 : 0), pz + az * l, B.PALM_LEAVES, false);
    }
  } else if (kind === F_CACTUS) {
    const th = 1 + Math.floor(rr() * 3);
    for (let ly = 0; ly < th; ly++) set(x, y + ly, z, B.CACTUS, false);
  }
}
export const FEATURE = { ASH: F_ASH, PINE: F_PINE, PALM: F_PALM, CACTUS: F_CACTUS, BIGASH: F_BIGASH };
