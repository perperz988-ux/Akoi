// Streaming quadtree terrain built from real elevation data (Mapzen/AWS "Terrarium" tiles:
// SRTM, GMTED2010, ETOPO1 and others — open data). Each tile also receives a landcover
// texture painted from Natural Earth vectors (lakes, rivers, urban areas, highways).
import * as THREE from 'three';
import { origin, lon2tx, lat2ty, tx2lon, ty2lat, DEG, R_EARTH, clamp, fbm, smooth } from '../core/geo';
import { lcIndex, aridityAt, landAt, airportsNear, Airport, Feature } from '../data/world';
import { layoutOf, footprintShapes } from './AirportLayout';

const SEG = 32;
const RES = 129;
const TILE_URL = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

// Land below sea level that must not be flooded (polders, depressions).
const BELOW_SEA_LAND: [number, number, number, number][] = [
  [51.2, 3.3, 53.6, 7.3], [31.0, 35.2, 32.0, 35.7], [36.0, -117.6, 37.0, -116.4], [29.0, 26.0, 30.5, 29.5], [42.3, 88.5, 43.2, 90.0],
  [13.5, 40.0, 14.8, 41.0], [32.9, -116.3, 33.6, -115.4], [36.0, 46.0, 47.5, 55.5], [40.5, 46.5, 47.5, 54.0], [31.5, 35.4, 33.0, 35.7],
];
const belowSeaLand = (lat: number, lon: number) => BELOW_SEA_LAND.some(b => lat >= b[0] && lat <= b[2] && lon >= b[1] && lon <= b[3]);

/** Airport flattening footprint in metres around the airport reference point (from the generated layout). */
interface Footprint { ap: Airport; cos: number; segs: [number, number, number, number, number][]; discs: [number, number, number][] }
const footprints = new Map<string, Footprint>();
export function footprintOf(ap: Airport): Footprint {
  let f = footprints.get(ap.icao); if (f) return f;
  const sh = footprintShapes(layoutOf(ap));
  f = { ap, cos: Math.cos(ap.lat * DEG), segs: sh.segs, discs: sh.discs };
  footprints.set(ap.icao, f); return f;
}
function segDist(px: number, pz: number, s: [number, number, number, number, number]) {
  const dx = s[2] - s[0], dz = s[3] - s[1], L2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - s[0]) * dx + (pz - s[1]) * dz) / L2, 0, 1);
  return Math.hypot(px - s[0] - t * dx, pz - s[1] - t * dz) - s[4];
}
/** 0..1 weight of airport flattening at lat/lon */
export function flattenWeight(f: Footprint, lat: number, lon: number) {
  const px = (lon - f.ap.lon) * DEG * R_EARTH * f.cos, pz = -(lat - f.ap.lat) * DEG * R_EARTH;
  if (Math.abs(px) > 9000 || Math.abs(pz) > 9000) return 0;
  let d = 1e9;
  for (const s of f.segs) d = Math.min(d, segDist(px, pz, s));
  for (const a of f.discs) d = Math.min(d, Math.hypot(px - a[0], pz - a[1]) - a[2]);
  return 1 - smooth(0, 450, d);
}

export class Tile {
  key: string; z: number; x: number; y: number;
  n: number; s: number; w: number; e: number;   // bounds deg
  cLat: number; cLon: number; sizeM: number;
  heights: Float32Array | null = null; synthetic = false;
  state: 'empty' | 'loading' | 'ready' | 'failed' = 'empty';
  mesh: THREE.Mesh | null = null; lcTex: THREE.CanvasTexture | null = null; lcData: Uint8ClampedArray | null = null; lcSize = 0;
  minH = 0; maxH = 0; lastUsed = 0; fps: Footprint[] = [];
  constructor(z: number, x: number, y: number) {
    this.key = `${z}/${x}/${y}`; this.z = z; this.x = x; this.y = y;
    this.n = ty2lat(y, z); this.s = ty2lat(y + 1, z); this.w = tx2lon(x, z); this.e = tx2lon(x + 1, z);
    this.cLat = ty2lat(y + 0.5, z); this.cLon = (this.w + this.e) / 2;
    this.sizeM = (this.e - this.w) * DEG * R_EARTH * Math.cos(this.cLat * DEG);
  }
  /** Raw (DEM) height sample by fractional tile coords (fx along lon, fy along mercator y). */
  sampleRaw(fx: number, fy: number) {
    const h = this.heights!; const gx = clamp(fx, 0, 1) * (RES - 1), gy = clamp(fy, 0, 1) * (RES - 1);
    const x0 = Math.min(RES - 2, Math.floor(gx)), y0 = Math.min(RES - 2, Math.floor(gy)), tx = gx - x0, ty = gy - y0;
    const i = y0 * RES + x0;
    return (h[i] * (1 - tx) + h[i + 1] * tx) * (1 - ty) + (h[i + RES] * (1 - tx) + h[i + RES + 1] * tx) * ty;
  }
  lcAt(fx: number, fy: number) {
    if (!this.lcData) return [0, 0, 0];
    const s = this.lcSize; const px = clamp(Math.floor(fx * s), 0, s - 1), py = clamp(Math.floor(fy * s), 0, s - 1);
    const i = (py * s + px) * 4; return [this.lcData[i], this.lcData[i + 1], this.lcData[i + 2]];
  }
}

export interface TerrainUniforms {
  uNight: { value: number }; uSunDir: { value: THREE.Vector3 }; uSkyCol: { value: THREE.Color }; uHorizon: { value: THREE.Color };
  uNoiseOff: { value: THREE.Vector2 }; uTime: { value: number }; uSnow: { value: number }; uWet: { value: number };
}

export class Terrain {
  group = new THREE.Group();
  tiles = new Map<string, Tile>();
  maxZ = 14; splitK = 1.7; viewRadius = 300000;
  private queue: Tile[] = []; private active = 0; private maxActive = 6;
  private frame = 0; displayed: Tile[] = [];
  private noiseOff = new THREE.Vector2();
  online = true; failures = 0;
  uniforms: TerrainUniforms = {
    uNight: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSkyCol: { value: new THREE.Color('#7fb0e8') }, uHorizon: { value: new THREE.Color('#cfe0f0') },
    uNoiseOff: { value: this.noiseOff }, uTime: { value: 0 }, uSnow: { value: 0 }, uWet: { value: 0 },
  };
  private baseMat: THREE.MeshStandardMaterial;

  constructor() {
    this.group.name = 'terrain';
    this.baseMat = makeTerrainMaterial(this.uniforms);
    origin.onShift((dx, dz) => {
      this.noiseOff.x = (this.noiseOff.x + dx) % 65536; this.noiseOff.y = (this.noiseOff.y + dz) % 65536;
      for (const t of this.tiles.values()) if (t.mesh) this.placeMesh(t);
    });
  }

  private placeMesh(t: Tile) { t.mesh!.position.set(origin.x(t.cLon), 0, origin.z(t.cLat)); }

  getTile(z: number, x: number, y: number) {
    const k = `${z}/${x}/${y}`; let t = this.tiles.get(k);
    if (!t) { t = new Tile(z, x, y); this.tiles.set(k, t); }
    return t;
  }

  private request(t: Tile, prio: number) {
    if (t.state !== 'empty') return;
    t.state = 'loading'; (t as any).prio = prio; this.queue.push(t);
  }

  private pump() {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => (a as any).prio - (b as any).prio);
    while (this.active < this.maxActive && this.queue.length) {
      const t = this.queue.shift()!; this.active++;
      this.load(t).finally(() => this.active--);
    }
  }

  private async load(t: Tile) {
    let heights: Float32Array | null = null;
    if (this.online) {
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 12000);
        const res = await fetch(TILE_URL(t.z, t.x, t.y), { signal: ctl.signal, mode: 'cors' }); clearTimeout(to);
        if (!res.ok) throw new Error('http ' + res.status);
        const bmp = await createImageBitmap(await res.blob());
        heights = decodeTerrarium(bmp); bmp.close?.();
        this.failures = 0;
      } catch {
        this.failures++; if (this.failures > 12) this.online = false;
      }
    }
    if (!heights) { heights = syntheticHeights(t); t.synthetic = true; }
    t.heights = heights;
    this.buildMesh(t);
    t.state = 'ready';
  }

  /** Height used for both rendering and physics. Returns metres MSL and whether the point is water. */
  heightAt(lat: number, lon: number): { h: number; water: boolean; tile: Tile | null } {
    for (let z = this.maxZ; z >= 0; z--) {
      const fx = lon2tx(lon, z), fy = lat2ty(lat, z);
      const t = this.tiles.get(`${z}/${Math.floor(fx)}/${Math.floor(fy)}`);
      if (t && t.heights) return this.finalHeight(t, lat, lon, fx - t.x, fy - t.y);
    }
    return { h: 0, water: false, tile: null };
  }

  private finalHeight(t: Tile, lat: number, lon: number, fx: number, fy: number) {
    let h = t.sampleRaw(fx, fy);
    let water = false;
    let fw = 0, fe = 0;
    for (const f of t.fps) { const w = flattenWeight(f, lat, lon); if (w > fw) { fw = w; fe = f.ap.elevM; } }
    if (fw > 0) h = h * (1 - fw) + fe * fw;
    if (fw < 0.5) {
      if (h < 0.5 && !belowSeaLand(lat, lon)) { water = true; h = 0; }
      else { const lc = t.lcAt(fx, fy); if (lc[0] > 140) water = true; }
    }
    return { h, water, tile: t };
  }

  private buildMesh(t: Tile) {
    t.fps = t.z >= 9 ? airportsNear(t.cLat, t.cLon, t.sizeM * 0.75 + 3000).map(footprintOf) : [];
    paintLandcover(t);
    const N = SEG + 1; const vCount = N * N + 4 * N;
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), info = new Float32Array(vCount * 4), uv = new Float32Array(vCount * 2), apw = new Float32Array(vCount);
    const hs = new Float32Array(N * N);
    const cosC = Math.cos(t.cLat * DEG);
    let minH = 1e9, maxH = -1e9;
    const lats: number[] = [], lons: number[] = [];
    for (let j = 0; j < N; j++) lats.push(ty2lat(t.y + j / SEG, t.z));
    for (let i = 0; i < N; i++) lons.push(t.w + (t.e - t.w) * (i / SEG));
    const pxM = (lon: number, lat: number) => (lon - t.cLon) * DEG * R_EARTH * Math.cos(lat * DEG);
    const pzM = (lat: number) => -(lat - t.cLat) * DEG * R_EARTH;
    let k = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++, k++) {
      const lat = lats[j], lon = lons[i];
      const raw = t.sampleRaw(i / SEG, j / SEG);
      const r = this.finalHeight(t, lat, lon, i / SEG, j / SEG);
      hs[k] = r.h;
      pos[k * 3] = pxM(lon, lat); pos[k * 3 + 1] = r.h; pos[k * 3 + 2] = pzM(lat);
      if (r.h < minH) minH = r.h; if (r.h > maxH) maxH = r.h;
      const ar = aridityAt(lat, lon);
      info[k * 4] = ar; info[k * 4 + 1] = lat; info[k * 4 + 2] = r.water ? 1 : 0; info[k * 4 + 3] = r.water ? Math.max(0, -raw) : 0;
      uv[k * 2] = i / SEG; uv[k * 2 + 1] = j / SEG;
      let fw = 0; for (const f of t.fps) fw = Math.max(fw, flattenWeight(f, lat, lon)); apw[k] = fw;
    }
    // normals from height grid
    const dxM = t.sizeM / SEG, dzM = (t.n - t.s) * DEG * R_EARTH / SEG;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const hL = hs[j * N + Math.max(0, i - 1)], hR = hs[j * N + Math.min(SEG, i + 1)];
      const hU = hs[Math.max(0, j - 1) * N + i], hD = hs[Math.min(SEG, j + 1) * N + i];
      const sx = (hR - hL) / (dxM * ((i > 0 && i < SEG) ? 2 : 1)), sz = (hD - hU) / (dzM * ((j > 0 && j < SEG) ? 2 : 1));
      const nx = -sx, ny = 1, nz = -sz; const l = Math.hypot(nx, ny, nz);
      const q = (j * N + i) * 3; nor[q] = nx / l; nor[q + 1] = ny / l; nor[q + 2] = nz / l;
    }
    // skirts
    const skirt = Math.max(15, t.sizeM * 0.015);
    const edge: number[] = [];
    for (let i = 0; i < N; i++) edge.push(i);
    for (let j = 0; j < N; j++) edge.push(j * N + SEG);
    for (let i = SEG; i >= 0; i--) edge.push(SEG * N + i);
    for (let j = SEG; j >= 0; j--) edge.push(j * N);
    const edgeIdx: number[] = [];
    for (let e = 0; e < 4 * N; e++) {
      const src = edge[e]; const d = N * N + e;
      pos[d * 3] = pos[src * 3]; pos[d * 3 + 1] = pos[src * 3 + 1] - skirt; pos[d * 3 + 2] = pos[src * 3 + 2];
      nor[d * 3] = nor[src * 3]; nor[d * 3 + 1] = nor[src * 3 + 1]; nor[d * 3 + 2] = nor[src * 3 + 2];
      for (let c = 0; c < 4; c++) info[d * 4 + c] = info[src * 4 + c];
      uv[d * 2] = uv[src * 2]; uv[d * 2 + 1] = uv[src * 2 + 1]; apw[d] = apw[src];
      edgeIdx.push(src, d);
    }
    const idx: number[] = [];
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      if ((i + j) % 2) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    for (let side = 0; side < 4; side++) for (let q = 0; q < SEG; q++) {
      const e = side * N + q; const a = edgeIdx[e * 2], ad = edgeIdx[e * 2 + 1], b = edgeIdx[(e + 1) * 2], bd = edgeIdx[(e + 1) * 2 + 1];
      idx.push(a, ad, b, b, ad, bd, a, b, ad, b, bd, ad);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aAp', new THREE.BufferAttribute(apw, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mat = this.baseMat.clone();
    (mat as any).userData.lc = { value: t.lcTex };
    mat.onBeforeCompile = this.baseMat.onBeforeCompile;
    mat.customProgramCacheKey = this.baseMat.customProgramCacheKey;
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true; m.matrixAutoUpdate = true; m.frustumCulled = true;
    m.visible = false; (m as any).tile = t;
    t.mesh = m; t.minH = minH; t.maxH = maxH;
    this.placeMesh(t);
    this.group.add(m);
    void cosC;
  }

  private dispose(t: Tile) {
    if (t.mesh) { this.group.remove(t.mesh); t.mesh.geometry.dispose(); (t.mesh.material as THREE.Material).dispose(); t.mesh = null; }
    t.lcTex?.dispose(); t.lcTex = null; t.lcData = null; t.heights = null; t.state = 'empty';
    this.tiles.delete(t.key);
  }

  /** Re-flatten tiles near an airport (called when airport scenery appears). */
  isReadyAround(lat: number, lon: number, z = 12) {
    const t = this.tiles.get(`${z}/${Math.floor(lon2tx(lon, z))}/${Math.floor(lat2ty(lat, z))}`);
    return !!t && t.state === 'ready';
  }
  /** Ensure the tiles under a point are requested at high priority. */
  prefetch(lat: number, lon: number) {
    for (let z = 4; z <= this.maxZ; z++) this.request(this.getTile(z, Math.floor(lon2tx(lon, z)), Math.floor(lat2ty(lat, z))), -100 + z);
    this.pump();
  }
  pendingCount() { return this.queue.length + this.active; }

  update(cam: THREE.Vector3, camLat: number, camLon: number, dt: number) {
    this.frame++;
    this.uniforms.uTime.value += dt;
    const alt = Math.max(1, cam.y - this.heightAt(camLat, camLon).h);
    const horizon = Math.sqrt(2 * R_EARTH * alt + alt * alt);
    const radius = clamp(horizon * 1.3 + 30000, 60000, this.viewRadius);
    const disp: Tile[] = [];
    const now = performance.now();
    const visit = (t: Tile) => {
      t.lastUsed = now;
      // distance from camera to tile bounding box (metres)
      const x0 = origin.x(t.w), x1 = origin.x(t.e), z0 = origin.z(t.n), z1 = origin.z(t.s);
      const dx = Math.max(x0 - cam.x, 0, cam.x - x1), dz = Math.max(z0 - cam.z, 0, cam.z - z1);
      const hRef = t.state === 'ready' ? clamp(cam.y, t.minH, t.maxH) : 0;
      const d = Math.hypot(dx, dz, cam.y - hRef);
      if (Math.hypot(dx, dz) > radius) return;
      const wantSplit = t.z < this.maxZ && d < t.sizeM * this.splitK;
      if (t.state === 'empty') this.request(t, t.z * 2 + d / 50000);
      if (wantSplit && t.state === 'ready') {
        const kids = [this.getTile(t.z + 1, t.x * 2, t.y * 2), this.getTile(t.z + 1, t.x * 2 + 1, t.y * 2), this.getTile(t.z + 1, t.x * 2, t.y * 2 + 1), this.getTile(t.z + 1, t.x * 2 + 1, t.y * 2 + 1)];
        for (const c of kids) if (c.state === 'empty') this.request(c, c.z * 2 + d / 50000);
        if (kids.every(c => c.state === 'ready')) { for (const c of kids) visit(c); return; }
      }
      if (t.state === 'ready') disp.push(t);
    };
    // roots: z=4 tiles around the camera
    const Z0 = 4; const n0 = 1 << Z0;
    const degR = radius / (DEG * R_EARTH);
    const ty0 = Math.floor(lat2ty(Math.min(85, camLat + degR), Z0)), ty1 = Math.floor(lat2ty(Math.max(-85, camLat - degR), Z0));
    const cosl = Math.max(0.1, Math.cos(camLat * DEG));
    const tx0 = Math.floor(lon2tx(camLon - degR / cosl, Z0)), tx1 = Math.floor(lon2tx(camLon + degR / cosl, Z0));
    for (let y = Math.max(0, ty0); y <= Math.min(n0 - 1, ty1); y++)
      for (let x = tx0; x <= tx1; x++) visit(this.getTile(Z0, ((x % n0) + n0) % n0, y));
    for (const t of this.displayed) if (t.mesh) t.mesh.visible = false;
    for (const t of disp) if (t.mesh) t.mesh.visible = true;
    this.displayed = disp;
    this.pump();
    // eviction
    if (this.frame % 60 === 0 && this.tiles.size > 420) {
      const cand = [...this.tiles.values()].filter(t => t.state === 'ready' && now - t.lastUsed > 4000 && t.z > Z0).sort((a, b) => a.lastUsed - b.lastUsed);
      for (const t of cand.slice(0, this.tiles.size - 360)) this.dispose(t);
    }
  }
}

function decodeTerrarium(bmp: ImageBitmap): Float32Array {
  const cv = (decodeTerrarium as any).cv ||= (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 }));
  const g = (decodeTerrarium as any).g ||= cv.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, 256, 256); g.drawImage(bmp, 0, 0, 256, 256);
  const d = g.getImageData(0, 0, 256, 256).data as Uint8ClampedArray;
  const out = new Float32Array(RES * RES);
  for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
    const px = Math.min(255, Math.round(i * 255 / (RES - 1))), py = Math.min(255, Math.round(j * 255 / (RES - 1)));
    const q = (py * 256 + px) * 4;
    out[j * RES + i] = d[q] * 256 + d[q + 1] + d[q + 2] / 256 - 32768;
  }
  return out;
}

/** Offline fallback: plausible terrain from the global land mask + fractal noise. */
function syntheticHeights(t: Tile): Float32Array {
  const out = new Float32Array(RES * RES);
  for (let j = 0; j < RES; j++) {
    const lat = ty2lat(t.y + j / (RES - 1), t.z);
    for (let i = 0; i < RES; i++) {
      const lon = t.w + (t.e - t.w) * i / (RES - 1);
      const land = landAt(lat, lon);
      const n = fbm(lon * 3.1, lat * 3.1, 6), m = fbm(lon * 0.35 + 7, lat * 0.35 + 3, 4);
      const mount = Math.pow(Math.max(0, m - 0.45) * 2.2, 2) * 3500;
      out[j * RES + i] = land > 0.5 ? 2 + (land - 0.5) * 80 + n * 300 + mount * n : -30 - (0.5 - land) * 2000;
    }
  }
  return out;
}

const lcCanvas = document.createElement('canvas');
function paintLandcover(t: Tile) {
  const size = t.z >= 10 ? 256 : t.z >= 7 ? 128 : 64;
  lcCanvas.width = size; lcCanvas.height = size;
  const g = lcCanvas.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  const mPerPx = t.sizeM / size;
  const pad = (t.e - t.w) * 0.05;
  const W = t.w - pad, E = t.e + pad, S = t.s - pad, N = t.n + pad;
  const px = (lon: number) => (lon - t.w) / (t.e - t.w) * size;
  const py = (lat: number) => (lat2ty(lat, t.z) - t.y) * size;
  const path = (f: Feature, close: boolean) => {
    const p = f.pts; g.beginPath();
    for (let i = 0; i < p.length; i += 2) { const x = px(p[i]), y = py(p[i + 1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    if (close) g.closePath();
  };
  g.fillStyle = 'rgb(0,255,0)';
  for (const f of lcIndex.urban.query(W, S, E, N)) { path(f, true); g.fill(); }
  if (t.z >= 7) {
    g.strokeStyle = 'rgb(0,0,255)'; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const f of lcIndex.roads.query(W, S, E, N)) { g.lineWidth = Math.max(0.7, (f.rank ? 28 : 18) / mPerPx); path(f, false); g.stroke(); }
  }
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgb(255,0,0)'; g.strokeStyle = 'rgb(255,0,0)'; g.lineCap = 'round';
  for (const f of lcIndex.lakes.query(W, S, E, N)) { path(f, true); g.fill(); }
  for (const f of lcIndex.rivers.query(W, S, E, N)) { g.lineWidth = Math.max(0.8, (f.rank <= 3 ? 350 : f.rank <= 6 ? 180 : 90) / mPerPx); path(f, false); g.stroke(); }
  const img = g.getImageData(0, 0, size, size);
  t.lcData = img.data; t.lcSize = size;
  const tex = new THREE.DataTexture(new Uint8Array(img.data.buffer.slice(0)), size, size, THREE.RGBAFormat);
  tex.flipY = false; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.needsUpdate = true;
  t.lcTex = tex as unknown as THREE.CanvasTexture;
}

// ---------------- Terrain shader ----------------
export const CURVATURE_GLSL = /* glsl */`
  vec4 cwp = modelMatrix * vec4(transformed, 1.0);
  vec2 cdd = cwp.xz - cameraPosition.xz;
  cwp.y -= dot(cdd, cdd) * ${(1 / (2 * R_EARTH)).toExponential(6)};
  vec4 mvPosition = viewMatrix * cwp;
  gl_Position = projectionMatrix * mvPosition;
`;

export const NOISE_GLSL = /* glsl */`
  float hsh(vec2 c, float per){ c = mod(c, per); return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p, float per){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hsh(i,per), hsh(i+vec2(1,0),per), u.x), mix(hsh(i+vec2(0,1),per), hsh(i+vec2(1,1),per), u.x), u.y); }
`;

function makeTerrainMaterial(U: TerrainUniforms) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0, envMapIntensity: 0.35 });
  m.onBeforeCompile = function (this: THREE.MeshStandardMaterial, sh) {
    Object.assign(sh.uniforms, U, { uLC: (this as any).userData.lc });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec4 aInfo; attribute float aAp; varying vec4 vInfo; varying vec3 vWPos; varying vec2 vUv2; varying float vAp;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n vInfo = aInfo; vUv2 = uv; vAp = aAp;`)
      .replace('#include <project_vertex>', CURVATURE_GLSL)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed,1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vInfo; varying vec3 vWPos; varying vec2 vUv2; varying float vAp;
        uniform sampler2D uLC; uniform float uNight, uTime, uSnow, uWet; uniform vec3 uSunDir, uSkyCol, uHorizon; uniform vec2 uNoiseOff;
        ${NOISE_GLSL}
        float wnoise(vec2 p){ return vn(p/4.0,16384.0)*0.08 + vn(p/16.0,4096.0)*0.12 + vn(p/64.0,1024.0)*0.2 + vn(p/256.0,256.0)*0.25 + vn(p/1024.0,64.0)*0.2 + vn(p/4096.0,16.0)*0.15; }
        vec3 gWaterN; float gWater; float gUrban; float gRoad;
      `)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 gp = vWPos.xz + uNoiseOff;
        float n = wnoise(gp);
        float nL = vn(gp/4096.0, 16.0);
        vec4 lc = texture2D(uLC, vUv2);
        float arid = vInfo.x; float lat = abs(vInfo.y); float h = vWPos.y;
        vec3 wn = normalize(cross(dFdx(vWPos), dFdy(vWPos))); if (wn.y < 0.0) wn = -wn;
        float slope = 1.0 - wn.y;
        float temp = 1.0 - smoothstep(25.0, 68.0, lat);           // 1 tropical .. 0 polar
        // base vegetation palette
        vec3 tropical = vec3(0.12, 0.22, 0.08), temperate = vec3(0.24, 0.33, 0.14), boreal = vec3(0.15, 0.22, 0.13), tundra = vec3(0.42, 0.40, 0.32);
        vec3 veg = lat < 25.0 ? mix(tropical, temperate, smoothstep(12.0, 25.0, lat)) : (lat < 50.0 ? mix(temperate, boreal, smoothstep(40.0, 55.0, lat)) : mix(boreal, tundra, smoothstep(58.0, 68.0, lat)));
        // farmland patchwork in temperate flat lands
        vec2 fc = floor(gp / vec2(420.0, 310.0) + vec2(vn(gp/900.0, 64.0)*0.4));
        float fh = hsh(fc, 65536.0/420.0);
        vec3 field = mix(vec3(0.33,0.36,0.17), vec3(0.50,0.44,0.24), fh); field = mix(field, vec3(0.2,0.3,0.12), step(0.7, fh));
        float farm = smoothstep(0.55, 0.35, arid) * (1.0 - smoothstep(0.08, 0.2, slope)) * smoothstep(0.35, 0.6, nL) * (1.0 - smoothstep(48.0, 60.0, lat)) * (1.0 - smoothstep(900.0, 1600.0, h));
        float forest = smoothstep(0.45, 0.62, n + (1.0 - arid) * 0.1) * (1.0 - arid);
        vec3 forestC = veg * 0.7;
        vec3 land = mix(veg, forestC, forest);
        land = mix(land, field, farm * 0.85);
        // desert
        vec3 sand = mix(vec3(0.76, 0.62, 0.42), vec3(0.62, 0.46, 0.30), vn(gp/2000.0, 32.0));
        land = mix(land, sand, smoothstep(0.25, 0.7, arid + (n - 0.5) * 0.3));
        // rock on slopes & high
        vec3 rock = mix(vec3(0.36,0.34,0.31), vec3(0.5,0.47,0.43), n);
        float treeline = mix(1200.0, 3600.0, temp);
        land = mix(land, rock, clamp(smoothstep(0.25, 0.5, slope) + smoothstep(treeline, treeline + 900.0, h), 0.0, 1.0));
        // snow
        float snowline = mix(300.0, 4900.0, temp) - uSnow * 2500.0;
        float snow = smoothstep(snowline, snowline + 400.0, h + (n - 0.5) * 500.0) * (1.0 - smoothstep(0.55, 0.8, slope));
        snow = max(snow, smoothstep(66.0, 72.0, lat) * smoothstep(0.0, 300.0, h) * 0.9);
        snow = max(snow, uSnow * (1.0 - smoothstep(0.45, 0.7, slope)) * step(1.0, h));
        land = mix(land, vec3(0.92, 0.94, 0.98), snow);
        // beaches
        land = mix(vec3(0.78, 0.72, 0.56), land, smoothstep(1.5, 5.0, h));
        // urban
        gUrban = lc.g * (1.0 - smoothstep(0.2, 0.6, vAp));
        vec2 bc = floor(gp / 110.0); float bh = hsh(bc, 65536.0/110.0);
        vec2 rc = floor(gp / 18.0); float rh = hsh(rc, 65536.0/18.0);
        vec3 roof = rh < 0.3 ? vec3(0.36,0.35,0.34) : rh < 0.55 ? vec3(0.46,0.42,0.38) : rh < 0.7 ? vec3(0.5,0.34,0.27) : rh < 0.85 ? vec3(0.27,0.28,0.30) : vec3(0.30,0.36,0.22);
        vec3 urb = roof * (0.85 + 0.25 * bh);
        vec2 sf = fract(gp / 110.0);
        float street = max(step(0.9, sf.x), step(0.9, sf.y));
        urb = mix(urb, vec3(0.2,0.2,0.21), street * 0.85);
        urb = mix(urb, vec3(0.22,0.3,0.15), step(0.93, bh) * (1.0 - street));
        land = mix(land, urb, gUrban * 0.9);
        gRoad = lc.b * (1.0 - smoothstep(0.1, 0.4, vAp));
        vec3 apGrass = mix(vec3(0.33, 0.40, 0.20), vec3(0.40, 0.44, 0.26), vn(gp/40.0, 2048.0)) * mix(1.0, 0.85, step(0.5, fract(gp.x/60.0)));
        land = mix(land, apGrass, smoothstep(0.3, 0.8, vAp) * (1.0 - snow));
        land = mix(land, vec3(0.2,0.2,0.21), gRoad * 0.85);
        land *= 0.88 + n * 0.25;
        land = mix(land, land * 0.6, uWet * 0.35);
        // water
        gWater = max(vInfo.z, step(0.55, lc.r));
        float depth = vInfo.w;
        vec3 waterC = mix(vec3(0.05, 0.32, 0.36), vec3(0.01, 0.07, 0.14), smoothstep(2.0, 60.0, depth));
        if (lc.r > 0.55 && vInfo.z < 0.5) waterC = vec3(0.03, 0.12, 0.16);
        diffuseColor.rgb = pow(mix(land, waterC, gWater), vec3(1.7));
      `)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (gWater > 0.5) {
          vec2 wp = gp; float t = uTime;
          float e = 1.5;
          float w0 = vn(wp/7.0 + vec2(t*0.35, t*0.2), 8192.0)*0.6 + vn(wp/23.0 - vec2(t*0.15, t*0.25), 4096.0)*0.4;
          float wx = vn((wp+vec2(e,0.0))/7.0 + vec2(t*0.35, t*0.2), 8192.0)*0.6 + vn((wp+vec2(e,0.0))/23.0 - vec2(t*0.15, t*0.25), 4096.0)*0.4;
          float wz = vn((wp+vec2(0.0,e))/7.0 + vec2(t*0.35, t*0.2), 8192.0)*0.6 + vn((wp+vec2(0.0,e))/23.0 - vec2(t*0.15, t*0.25), 4096.0)*0.4;
          vec3 wN = normalize(vec3(-(wx-w0)*1.2, 1.0, -(wz-w0)*1.2));
          normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
        }
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor * (1.0 - uWet*0.5), 0.06, gWater);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec2 lc2 = floor(gp/30.0);
        float sparkle = step(0.82, hsh(lc2, 65536.0/30.0)) * (0.4 + 0.6*hsh(lc2+3.0, 65536.0/30.0));
        float lfw = length(fwidth(gp/30.0)); sparkle = mix(sparkle, 0.11, smoothstep(0.4, 1.5, lfw));
        vec3 cityGlow = vec3(1.0, 0.68, 0.34) * (gUrban * (0.02 + sparkle * 0.7) + gRoad * 0.35);
        totalEmissiveRadiance += cityGlow * uNight * 1.2;
      `)
      .replace('#include <opaque_fragment>', `
        if (gWater > 0.5) {
          vec3 V = normalize(vViewPosition);
          vec3 Nn = normalize(normal);
          float fres = pow(1.0 - max(dot(-V, Nn), 0.0), 5.0) * 0.55 + 0.03;
          vec3 R = reflect(V, Nn);
          vec3 sky = mix(uHorizon, uSkyCol, clamp((inverseTransformDirection(R, viewMatrix)).y * 2.0, 0.0, 1.0));
          vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
          float spec = pow(max(dot(R, sunV), 0.0), 220.0) * 6.0 * (1.0 - uNight) * step(0.0, uSunDir.y);
          outgoingLight = mix(outgoingLight, sky * 0.7 * (1.0 - uNight * 0.92), fres) + vec3(1.0, 0.92, 0.8) * spec;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'terrain-v2';
  return m;
}
