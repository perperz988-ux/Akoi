// Chunk lighting + meshing. Runs inside workers.
// Input is the chunk plus its 8 neighbours so lighting and ambient occlusion are seamless across borders.
import {
  ATLAS_CELL, ATLAS_COLS, ATLAS_SIZE, ATLAS_TILE, B, CHUNK, HEIGHT, L_CULLSAME, L_EMIT, L_FILTER, L_OPAQUE,
  L_RENDER, L_SHAPE, RENDER_CUTOUT, RENDER_NONE, RENDER_OPAQUE, RENDER_WATER, SECTIONS, SHAPE_BOX, SHAPE_CROSS,
  SHAPE_CUBE, SHAPE_LIQUID, blockBoxes, faceTile, FAST_LEAF, isLeaf,
} from './Blocks';
import { hash3 } from './Noise';

export interface GeomData {
  pos: Float32Array; nor: Int8Array; uv: Float32Array; col: Uint8Array; lig: Uint8Array; idx: Uint16Array | Uint32Array;
}
export interface SectionGeom { o: GeomData | null; c: GeomData | null; w: GeomData | null }
export interface MeshOutput { sections: SectionGeom[]; conn: Uint8Array; light: Uint8Array | null }

const RW = 48, RA = RW * RW, RSIZE = RA * HEIGHT;
const rb = new Uint8Array(RSIZE), rm = new Uint8Array(RSIZE);
const sky = new Uint8Array(RSIZE), blk = new Uint8Array(RSIZE);
const QN = 1 << 20, QM = QN - 1;
const queue = new Int32Array(QN);
const cullOpaque = new Uint8Array(256);
const hm = new Int16Array(RA);


class Buf {
  pos = new Float32Array(4096); nor = new Int8Array(4096); uv = new Float32Array(4096);
  col = new Uint8Array(4096); lig = new Uint8Array(4096); idx = new Uint32Array(4096);
  nv = 0; ni = 0;
  reset() { this.nv = 0; this.ni = 0; }
  private grow() {
    const g = <T extends Float32Array | Int8Array | Uint8Array | Uint32Array>(a: T, n: number): T => {
      if (a.length >= n) return a;
      const b = new (a.constructor as any)(Math.max(n, a.length * 2)); b.set(a); return b;
    };
    const v = this.nv + 4;
    this.pos = g(this.pos, v * 3); this.nor = g(this.nor, v * 3); this.uv = g(this.uv, v * 2);
    this.col = g(this.col, v * 3); this.lig = g(this.lig, v * 2); this.idx = g(this.idx, this.ni + 6);
  }
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: number, sl: number, bl: number) {
    const nv1 = this.nv + 1;
    if (nv1 * 3 > this.pos.length || nv1 * 3 > this.nor.length || nv1 * 3 > this.col.length || nv1 * 2 > this.uv.length || nv1 * 2 > this.lig.length || this.ni + 6 > this.idx.length) this.grow();
    const n = this.nv;
    this.pos[n * 3] = x; this.pos[n * 3 + 1] = y; this.pos[n * 3 + 2] = z;
    this.nor[n * 3] = nx * 127; this.nor[n * 3 + 1] = ny * 127; this.nor[n * 3 + 2] = nz * 127;
    this.uv[n * 2] = u; this.uv[n * 2 + 1] = v;
    const cc = Math.max(0, Math.min(255, Math.round(c * 255)));
    this.col[n * 3] = cc; this.col[n * 3 + 1] = cc; this.col[n * 3 + 2] = cc;
    this.lig[n * 2] = Math.round(sl * 17); this.lig[n * 2 + 1] = Math.round(bl * 17);
    this.nv++;
  }
  quad(flip: boolean) {
    if (this.ni + 6 > this.idx.length) this.grow();
    const b = this.nv - 4, I = this.idx;
    if (!flip) { I[this.ni++] = b; I[this.ni++] = b + 1; I[this.ni++] = b + 2; I[this.ni++] = b; I[this.ni++] = b + 2; I[this.ni++] = b + 3; }
    else { I[this.ni++] = b + 1; I[this.ni++] = b + 2; I[this.ni++] = b + 3; I[this.ni++] = b + 1; I[this.ni++] = b + 3; I[this.ni++] = b; }
  }
  out(): GeomData | null {
    if (this.nv === 0) return null;
    const nv = this.nv;
    const idx = nv < 65536 ? Uint16Array.from(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni);
    return {
      pos: this.pos.slice(0, nv * 3), nor: this.nor.slice(0, nv * 3), uv: this.uv.slice(0, nv * 2),
      col: this.col.slice(0, nv * 3), lig: this.lig.slice(0, nv * 2), idx,
    };
  }
}
const bufs = [new Buf(), new Buf(), new Buf()];

// face tables: normal, corners (CCW from outside)
const FN = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FC = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const SHADE = [0.78, 0.78, 1.0, 0.55, 0.9, 0.9];
const AOC = [0.42, 0.62, 0.8, 1.0];
const NAXIS = [0, 0, 1, 1, 2, 2];

function faceUV(f: number, x: number, y: number, z: number): [number, number] {
  switch (f) {
    case 0: return [1 - z, 1 - y];
    case 1: return [z, 1 - y];
    case 2: return [x, z];
    case 3: return [x, z];
    case 4: return [x, 1 - y];
    default: return [1 - x, 1 - y];
  }
}

const TS = ATLAS_TILE / ATLAS_SIZE, PAD = (ATLAS_CELL - ATLAS_TILE) / 2 / ATLAS_SIZE, CS = ATLAS_CELL / ATLAS_SIZE;
function tileU(t: number) { return (t % ATLAS_COLS) * CS + PAD; }
function tileV(t: number) { return Math.floor(t / ATLAS_COLS) * CS + PAD; }

let topY = HEIGHT;

const ri = (x: number, y: number, z: number) => (x + 16) + (z + 16) * RW + y * RA;
function bAt(x: number, y: number, z: number) {
  if (y >= HEIGHT) return 0;
  if (y < 0) return B.DEEPSTONE;
  return rb[ri(x, y, z)];
}
function skyAt(x: number, y: number, z: number) {
  if (y >= topY) return 15;
  if (y < 0) return 0;
  return sky[ri(x, y, z)];
}
function blkAt(x: number, y: number, z: number) {
  if (y >= topY || y < 0) return 0;
  return blk[ri(x, y, z)];
}

function fillRegion(blocks: Uint8Array[], metas: Uint8Array[]) {
  let maxY = 0;
  for (let c = 0; c < 9; c++) {
    const dx = (c % 3), dz = Math.floor(c / 3);
    const src = blocks[c], sm = metas[c];
    for (let y = HEIGHT - 1; y > maxY; y--) {
      const o = y * 256; let any = false;
      for (let k = 0; k < 256; k++) if (src[o + k] !== 0) { any = true; break; }
      if (any) { maxY = y; break; }
    }
    for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < 16; z++) {
      const so = z * 16 + y * 256, d = dx * 16 + (dz * 16 + z) * RW + y * RA;
      rb.set(src.subarray(so, so + 16), d);
      rm.set(sm.subarray(so, so + 16), d);
    }
  }
  topY = Math.min(HEIGHT, maxY + 8);
}

function computeLight() {
  sky.fill(0, 0, topY * RA); blk.fill(0, 0, topY * RA);
  const lo = new Int16Array(RA);
  for (let c = 0; c < RA; c++) {
    let l = 15, h = topY;
    let y = topY - 1;
    for (; y >= 0; y--) {
      const i = c + y * RA, id = rb[i];
      if (L_OPAQUE[id]) { l = 0; break; }
      const f = L_FILTER[id];
      if (f) { l = Math.max(0, l - f); }
      sky[i] = l;
      if (l === 15) h = y;
      if (l === 0) break;
    }
    hm[c] = h; lo[c] = y + 1;
  }
  let qh = 0, qt = 0;
  for (let z = 0; z < RW; z++) for (let x = 0; x < RW; x++) {
    const c = x + z * RW;
    let nb = hm[c];
    if (x > 0) nb = Math.max(nb, hm[c - 1]);
    if (x < RW - 1) nb = Math.max(nb, hm[c + 1]);
    if (z > 0) nb = Math.max(nb, hm[c - RW]);
    if (z < RW - 1) nb = Math.max(nb, hm[c + RW]);
    const y1 = Math.min(topY, Math.max(nb, hm[c]));
    for (let y = lo[c]; y < y1; y++) { const i = c + y * RA; if (sky[i] > 1) { queue[qt & QM] = i; qt++; } }
  }
  qh = bfs(sky, qh, qt);
  qt = 0; qh = 0;
  const n = topY * RA;
  for (let i = 0; i < n; i++) { const e = L_EMIT[rb[i]]; if (e) { blk[i] = e; queue[qt & QM] = i; qt++; } }
  bfs(blk, 0, qt);
}

function bfs(arr: Uint8Array, qh: number, qt: number) {
  const ty = topY;
  while (qh < qt) {
    const i = queue[qh & QM]; qh++;
    const l = arr[i];
    if (l <= 1) continue;
    const y = (i / RA) | 0, r = i - y * RA, z = (r / RW) | 0, x = r - z * RW;
    for (let d = 0; d < 6; d++) {
      let n: number;
      switch (d) {
        case 0: if (x >= RW - 1) continue; n = i + 1; break;
        case 1: if (x <= 0) continue; n = i - 1; break;
        case 2: if (y >= ty - 1) continue; n = i + RA; break;
        case 3: if (y <= 0) continue; n = i - RA; break;
        case 4: if (z >= RW - 1) continue; n = i + RW; break;
        default: if (z <= 0) continue; n = i - RW; break;
      }
      const id = rb[n];
      if (L_OPAQUE[id]) continue;
      const nl = l - 1 - L_FILTER[id];
      if (nl > arr[n]) { arr[n] = nl; queue[qt & QM] = n; qt++; }
    }
  }
  return qh;
}

function emitCube(buf: Buf, x: number, y: number, z: number, f: number, t: number) {
  const n = FN[f], cs = FC[f];
  const bx = x + n[0], by = y + n[1], bz = z + n[2];
  const ax = NAXIS[f];
  const u0 = tileU(t), v0 = tileV(t);
  const aos = [0, 0, 0, 0];
  for (let k = 0; k < 4; k++) {
    const c = cs[k];
    // tangent offsets
    let s1x = 0, s1y = 0, s1z = 0, s2x = 0, s2y = 0, s2z = 0;
    if (ax === 0) { s1y = c[1] ? 1 : -1; s2z = c[2] ? 1 : -1; }
    else if (ax === 1) { s1x = c[0] ? 1 : -1; s2z = c[2] ? 1 : -1; }
    else { s1x = c[0] ? 1 : -1; s2y = c[1] ? 1 : -1; }
    const o1 = cullOpaque[bAt(bx + s1x, by + s1y, bz + s1z)];
    const o2 = cullOpaque[bAt(bx + s2x, by + s2y, bz + s2z)];
    const oc = (o1 && o2) ? 1 : cullOpaque[bAt(bx + s1x + s2x, by + s1y + s2y, bz + s1z + s2z)];
    const ao = (o1 && o2) ? 0 : 3 - (o1 + o2 + oc);
    aos[k] = ao;
    let sl = skyAt(bx, by, bz), bl = blkAt(bx, by, bz), cnt = 1;
    if (!o1) { sl += skyAt(bx + s1x, by + s1y, bz + s1z); bl += blkAt(bx + s1x, by + s1y, bz + s1z); cnt++; }
    if (!o2) { sl += skyAt(bx + s2x, by + s2y, bz + s2z); bl += blkAt(bx + s2x, by + s2y, bz + s2z); cnt++; }
    if (!oc && !(o1 && o2)) { sl += skyAt(bx + s1x + s2x, by + s1y + s2y, bz + s1z + s2z); bl += blkAt(bx + s1x + s2x, by + s1y + s2y, bz + s1z + s2z); cnt++; }
    const [u, v] = faceUV(f, c[0], c[1], c[2]);
    buf.vert(x + c[0], y + c[1], z + c[2], n[0], n[1], n[2], u0 + u * TS, v0 + v * TS, AOC[ao] * SHADE[f], sl / cnt, bl / cnt);
  }
  buf.quad(aos[0] + aos[2] < aos[1] + aos[3]);
}

function emitBox(buf: Buf, x: number, y: number, z: number, id: number, meta: number, bx: number[], tileFn: (f: number) => number) {
  const mn = [bx[0] / 16, bx[1] / 16, bx[2] / 16], mx = [bx[3] / 16, bx[4] / 16, bx[5] / 16];
  const ownS = skyAt(x, y, z), ownB = blkAt(x, y, z);
  for (let f = 0; f < 6; f++) {
    const n = FN[f], ax = NAXIS[f];
    const pos = n[ax] > 0;
    const boundary = pos ? mx[ax] >= 1 : mn[ax] <= 0;
    let sl = ownS, bl = ownB;
    if (boundary) {
      const nb = bAt(x + n[0], y + n[1], z + n[2]);
      if (cullOpaque[nb]) continue;
      sl = skyAt(x + n[0], y + n[1], z + n[2]); bl = blkAt(x + n[0], y + n[1], z + n[2]);
    }
    const t = tileFn(f), u0 = tileU(t), v0 = tileV(t);
    for (let k = 0; k < 4; k++) {
      const c = FC[f][k];
      const px = c[0] ? mx[0] : mn[0], py = c[1] ? mx[1] : mn[1], pz = c[2] ? mx[2] : mn[2];
      const [u, v] = faceUV(f, px, py, pz);
      buf.vert(x + px, y + py, z + pz, n[0], n[1], n[2], u0 + u * TS, v0 + v * TS, SHADE[f], Math.max(sl, ownS), Math.max(bl, ownB));
    }
    buf.quad(false);
  }
}

function emitCross(buf: Buf, x: number, y: number, z: number, t: number, wx: number, wz: number, jitter: boolean) {
  const sl = skyAt(x, y, z), bl = blkAt(x, y, z);
  let ox = 0, oz = 0;
  if (jitter) { ox = (hash3(wx, y, wz, 77) - 0.5) * 0.3; oz = (hash3(wx, y, wz, 78) - 0.5) * 0.3; }
  const u0 = tileU(t), v0 = tileV(t);
  const a = 0.15, b = 0.85;
  const planes = [[a, a, b, b], [a, b, b, a]];
  for (const p of planes) {
    for (let side = 0; side < 2; side++) {
      const xs = side ? [p[2], p[0]] : [p[0], p[2]], zs = side ? [p[3], p[1]] : [p[1], p[3]];
      const cx = [xs[0], xs[1], xs[1], xs[0]], cy = [0, 0, 1, 1], cz = [zs[0], zs[1], zs[1], zs[0]], cu = [0, 1, 1, 0];
      for (let k = 0; k < 4; k++) {
        buf.vert(x + cx[k] + ox, y + cy[k], z + cz[k] + oz, 0, 1, 0, u0 + cu[k] * TS, v0 + (1 - cy[k]) * TS, cy[k] ? 1 : 0.75, sl, bl);
      }
      buf.quad(false);
    }
  }
}

function liquidHeight(id: number, meta: number, above: number) {
  if (above === id) return 1;
  if (meta === 0 || meta & 8) return 0.875;
  return Math.max(0.1, (8 - (meta & 7)) / 9);
}

function emitLiquid(buf: Buf, x: number, y: number, z: number, id: number, meta: number) {
  const above = bAt(x, y + 1, z);
  const h = liquidHeight(id, meta, above);
  const t = faceTile(id, 2, 0), u0 = tileU(t), v0 = tileV(t);
  const glow = id === B.MAGMA;
  for (let f = 0; f < 6; f++) {
    const n = FN[f];
    const nb = bAt(x + n[0], y + n[1], z + n[2]);
    if (nb === id) continue;
    if (f === 2) { if (L_OPAQUE[nb] && h >= 1) continue; }
    else if (cullOpaque[nb]) continue;
    const sl = Math.max(skyAt(x, y, z), f === 2 ? skyAt(x, y + 1, z) : 0);
    const bl = glow ? 15 : blkAt(x, y, z);
    for (let k = 0; k < 4; k++) {
      const c = FC[f][k];
      const py = c[1] ? h : 0;
      const [u, v] = faceUV(f, c[0], py, c[2]);
      buf.vert(x + c[0], y + py, z + c[2], n[0], n[1], n[2], u0 + u * TS, v0 + v * TS, glow ? 1 : SHADE[f], sl, bl);
    }
    buf.quad(false);
  }
}

function connectivity(sec: number, out: Uint8Array) {
  const y0 = sec * 16;
  const visited = new Uint8Array(4096);
  const stack = new Int32Array(4096);
  let anyOpen = false, allOpen = true;
  for (let i = 0; i < 4096; i++) {
    const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
    const o = cullOpaque[rb[ri(x, y0 + y, z)]];
    if (o) { visited[i] = 1; allOpen = false; } else anyOpen = true;
  }
  const base = sec * 6;
  if (allOpen) { for (let f = 0; f < 6; f++) out[base + f] = 0x3f; return; }
  if (!anyOpen) return;
  for (let s = 0; s < 4096; s++) {
    if (visited[s]) continue;
    let sp = 0, mask = 0;
    stack[sp++] = s; visited[s] = 1;
    while (sp > 0) {
      const i = stack[--sp];
      const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
      if (x === 15) mask |= 1; if (x === 0) mask |= 2; if (y === 15) mask |= 4; if (y === 0) mask |= 8; if (z === 15) mask |= 16; if (z === 0) mask |= 32;
      if (x < 15 && !visited[i + 1]) { visited[i + 1] = 1; stack[sp++] = i + 1; }
      if (x > 0 && !visited[i - 1]) { visited[i - 1] = 1; stack[sp++] = i - 1; }
      if (z < 15 && !visited[i + 16]) { visited[i + 16] = 1; stack[sp++] = i + 16; }
      if (z > 0 && !visited[i - 16]) { visited[i - 16] = 1; stack[sp++] = i - 16; }
      if (y < 15 && !visited[i + 256]) { visited[i + 256] = 1; stack[sp++] = i + 256; }
      if (y > 0 && !visited[i - 256]) { visited[i - 256] = 1; stack[sp++] = i - 256; }
    }
    for (let f = 0; f < 6; f++) if (mask & (1 << f)) out[base + f] |= mask;
  }
}

export function meshChunk(cx: number, cz: number, blocks: Uint8Array[], metas: Uint8Array[], lod: number, fancy: boolean): MeshOutput {
  for (let i = 0; i < 256; i++) cullOpaque[i] = L_OPAQUE[i];
  if (!fancy) for (let i = 0; i < 256; i++) if (isLeaf(i)) cullOpaque[i] = 1;
  fillRegion(blocks, metas);
  if (lod > 0) return meshLod(cx, cz);
  computeLight();
  const sections: SectionGeom[] = [];
  const conn = new Uint8Array(SECTIONS * 6);
  const wx0 = cx * 16, wz0 = cz * 16;
  for (let s = 0; s < SECTIONS; s++) {
    for (const b of bufs) b.reset();
    const y0 = s * 16;
    if (y0 < topY) {
      for (let y = y0; y < y0 + 16; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const id = rb[ri(x, y, z)];
        if (id === 0) continue;
        const shape = L_SHAPE[id];
        let render = L_RENDER[id];
        if (render === RENDER_NONE) continue;
        const meta = rm[ri(x, y, z)];
        if (shape === SHAPE_CUBE) {
          const leaf = isLeaf(id);
          if (leaf && !fancy) render = RENDER_OPAQUE;
          const buf = bufs[render === RENDER_CUTOUT ? 1 : 0];
          for (let f = 0; f < 6; f++) {
            const n = FN[f];
            const nb = bAt(x + n[0], y + n[1], z + n[2]);
            if (cullOpaque[nb]) continue;
            if (nb === id && L_CULLSAME[id]) continue;
            let t = faceTile(id, f, meta);
            if (leaf && !fancy) t = FAST_LEAF[id];
            emitCube(buf, x, y, z, f, t);
          }
        } else if (shape === SHAPE_CROSS) {
          emitCross(bufs[1], x, y, z, faceTile(id, 0, meta), wx0 + x, wz0 + z, id !== B.GRAIN);
        } else if (shape === SHAPE_LIQUID) {
          emitLiquid(bufs[render === RENDER_WATER ? 2 : 0], x, y, z, id, meta);
        } else if (shape === SHAPE_BOX) {
          const buf = bufs[render === RENDER_CUTOUT ? 1 : 0];
          for (const bx of blockBoxes(id, meta)) emitBox(buf, x, y, z, id, meta, bx, (f) => faceTile(id, f, meta));
        }
      }
      connectivity(s, conn);
    } else {
      for (let f = 0; f < 6; f++) conn[s * 6 + f] = 0x3f;
    }
    sections.push({ o: bufs[0].out(), c: bufs[1].out(), w: bufs[2].out() });
  }
  // export central light (sky<<4 | block)
  const light = new Uint8Array(CHUNK * CHUNK * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    light[x + z * 16 + y * 256] = (skyAt(x, y, z) << 4) | blkAt(x, y, z);
  }
  return { sections, conn, light };
}

// ---- low detail mesh: 2x2x2 cells, no AO, approximate light ----
function lodCell(x: number, y: number, z: number): number {
  // x,z in cell coords relative to chunk (-1..8), y cell index (0..63)
  const bx = x * 2, by = y * 2, bz = z * 2;
  let water = false;
  for (let dy = 1; dy >= 0; dy--) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
    const id = bAt(bx + dx, by + dy, bz + dz);
    if (cullOpaque[id] || isLeaf(id)) return id;
    if (id === B.WATER) water = true;
  }
  return water ? B.WATER : 0;
}

function meshLod(cx: number, cz: number): MeshOutput {
  for (let c = 0; c < RA; c++) {
    let y = topY - 1;
    for (; y >= 0; y--) { const id = rb[c + y * RA]; if (cullOpaque[id] || isLeaf(id)) break; }
    hm[c] = y;
  }
  const NCY = HEIGHT / 2;
  const cells = new Uint8Array(10 * 10 * NCY);
  const ci = (x: number, y: number, z: number) => (x + 1) + (z + 1) * 10 + y * 100;
  const maxCY = Math.min(NCY, Math.ceil(topY / 2));
  for (let y = 0; y < maxCY; y++) for (let z = -1; z <= 8; z++) for (let x = -1; x <= 8; x++) cells[ci(x, y, z)] = lodCell(x, y, z);
  const solid = (id: number) => id !== 0 && id !== B.WATER;
  const sections: SectionGeom[] = [];
  const conn = new Uint8Array(SECTIONS * 6).fill(0x3f);
  for (let s = 0; s < SECTIONS; s++) {
    for (const b of bufs) b.reset();
    const cy0 = s * 8;
    for (let y = cy0; y < Math.min(cy0 + 8, maxCY); y++) for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
      const id = cells[ci(x, y, z)];
      if (id === 0) continue;
      if (id === B.WATER) {
        const up = y + 1 < NCY ? cells[ci(x, y + 1, z)] : 0;
        if (up !== 0) continue;
        const t = faceTile(B.WATER, 2, 0), u0 = tileU(t), v0 = tileV(t);
        const b = bufs[2];
        const yy = y * 2 + (bAt(x * 2, y * 2 + 1, z * 2) === B.WATER || bAt(x * 2 + 1, y * 2 + 1, z * 2 + 1) === B.WATER ? 1.81 : 0.81);
        const P = [[0, 1], [1, 1], [1, 0], [0, 0]];
        for (const [px, pz] of P) b.vert(x * 2 + px * 2, yy, z * 2 + pz * 2, 0, 1, 0, u0 + px * TS, v0 + pz * TS, 1, 15, 0);
        b.quad(false);
        continue;
      }
      for (let f = 0; f < 6; f++) {
        const n = FN[f];
        const ny = y + n[1];
        const nb = ny < 0 ? 1 : ny >= NCY ? 0 : cells[ci(x + n[0], ny, z + n[2])];
        if (solid(nb)) continue;
        const t = isLeaf(id) ? FAST_LEAF[id] : faceTile(id, f, 0), u0 = tileU(t), v0 = tileV(t);
        const colx = x * 2 + 16 + n[0] * 2, colz = z * 2 + 16 + n[2] * 2;
        const h = hm[Math.max(0, Math.min(RW - 1, colx)) + Math.max(0, Math.min(RW - 1, colz)) * RW];
        const sl = (ny * 2 + 1 >= h) ? 15 : 9;
        for (let k = 0; k < 4; k++) {
          const c = FC[f][k];
          const [u, v] = faceUV(f, c[0], c[1], c[2]);
          bufs[0].vert(x * 2 + c[0] * 2, y * 2 + c[1] * 2, z * 2 + c[2] * 2, n[0], n[1], n[2], u0 + u * TS, v0 + v * TS, SHADE[f], sl, 0);
        }
        bufs[0].quad(false);
      }
    }
    sections.push({ o: bufs[0].out(), c: null, w: bufs[2].out() });
  }
  return { sections, conn, light: null };
}
