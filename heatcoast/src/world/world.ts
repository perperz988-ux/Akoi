import * as THREE from 'three';
import * as L from './layout';
import { BUILDINGS, Bldg, EDGES, NODES, POIS, SPOTS, Zone, HALF, HN, HRES, HEIGHTS, segHalfWidth, SIDEWALK_W, zoneAt, lightState } from './layout';
import { facadeMaterial, groundMaterial, roadMaterial, getRoadTex, TEX, SHARED, mat } from '../render/materials';
import * as GEO from '../render/geo';
import { NORMALS } from '../render/assets';
import { hash2, fbm } from '../core/math';
import type { Quality } from '../game/settings';

const CH = 256, NC = (HALF * 2) / CH;
interface Chunk { i: number; j: number; group: THREE.Group; near: boolean; lights: { mesh: THREE.InstancedMesh; nodes: { n: number; axis: 'x' | 'z'; idx: number }[] } | null }

/** World renderer: global terrain + road network, streamed 256 m chunks of buildings & props. */
export class World {
  group = new THREE.Group();
  facade = facadeMaterial();
  chunks = new Map<number, Chunk>();
  private chunkB = new Map<number, Bldg[]>(); private chunkS = new Map<number, typeof SPOTS>();
  private lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: new THREE.Color(1, 0.82, 0.55), emissiveIntensity: 0 });
  private poolMat = new THREE.MeshBasicMaterial({ map: TEX.pool, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 });
  private signalMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  private vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  private propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  private geo: Record<string, THREE.BufferGeometry> = {};
  private queue: number[] = [];
  private neonMats: THREE.MeshStandardMaterial[] = [];

  constructor(public q: Quality) {
    // wind sway for vegetation
    this.vegMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = SHARED.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec4 ip = instanceMatrix[3]; float k = max(0.0, position.y - 2.0) * 0.012; transformed.x += sin(uTime * 1.3 + ip.x * 0.1) * k * position.y * 0.25; transformed.z += cos(uTime * 1.1 + ip.z * 0.1) * k * position.y * 0.18; }`);
    };
    this.vegMat.customProgramCacheKey = () => 'veg1';
    this.geo = { palm: GEO.palmGeo(), tree: GEO.treeGeo(), cypress: GEO.cypressGeo(), pine: GEO.pineGeo(), bush: GEO.bushGeo(), bench: GEO.benchGeo(), container: GEO.containerGeo(), light: GEO.streetlightGeo(), tpole: GEO.trafficPoleGeo(), plane: GEO.airplaneGeo(), canopy: GEO.gasCanopyGeo() };
    for (const b of BUILDINGS) { const k = this.key(Math.floor(((b.x0 + b.x1) / 2 + HALF) / CH), Math.floor(((b.z0 + b.z1) / 2 + HALF) / CH)); (this.chunkB.get(k) ?? this.chunkB.set(k, []).get(k)!).push(b); }
    for (const s of SPOTS) { if (s.kind === 'parked') continue; const k = this.key(Math.floor((s.x + HALF) / CH), Math.floor((s.z + HALF) / CH)); (this.chunkS.get(k) ?? this.chunkS.set(k, []).get(k)!).push(s); }
    this.buildTerrain(); this.buildRoads(); this.buildAirport();
  }
  private key(i: number, j: number) { return i * 100 + j; }

  // ---------------------------------------------------------------------------- terrain
  private buildTerrain() {
    const n = HN, pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
    const c = new THREE.Color();
    const sand = new THREE.Color(0xcdb88e), wetSand = new THREE.Color(0x9a8664), grass = new THREE.Color(0x4f7434), dry = new THREE.Color(0x7d8248), concrete = new THREE.Color(0x77746e), mud = new THREE.Color(0x4a4a32), swampG = new THREE.Color(0x4b6234), lawn = new THREE.Color(0x6b9a45), tarmac = new THREE.Color(0x55575a), dirt = new THREE.Color(0x8a7556);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -HALF + i * HRES, z = -HALF + j * HRES, h = HEIGHTS[j * n + i], k = j * n + i;
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const zone = zoneAt(x, z);
      const nz = fbm(x / 60, z / 60, 2, 5);
      switch (zone) {
        case Zone.Ocean: case Zone.Beach: c.copy(h < -0.5 ? wetSand : sand).lerp(wetSand, h < 0 ? 0.6 : nz * 0.3); break;
        case Zone.Park: c.copy(lawn).multiplyScalar(0.9 + nz * 0.2); break;
        case Zone.Suburb: c.copy(lawn).lerp(concrete, 0.25 + nz * 0.2); break;
        case Zone.Swamp: c.copy(h < -0.3 ? mud : swampG).lerp(mud, nz * 0.5); break;
        case Zone.Rural: c.copy(grass).lerp(dry, nz); break;
        case Zone.Airport: c.copy(grass).lerp(dry, 0.4); if (z > -1400 && z < -1190 && x > -1950 && x < -1050) c.copy(tarmac); break;
        case Zone.Town: c.copy(concrete).lerp(dirt, 0.25 + nz * 0.2); break;
        case Zone.Industrial: c.copy(concrete).multiplyScalar(0.8 + nz * 0.15); break;
        default: c.copy(concrete).multiplyScalar(0.92 + nz * 0.12);
      }
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    const idx: number[] = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const a = j * n + i, b = a + 1, cc = a + n, d = cc + 1; idx.push(a, cc, b, cc, d, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, groundMaterial()); m.receiveShadow = true; m.frustumCulled = false; this.group.add(m);
  }

  // ---------------------------------------------------------------------------- roads & sidewalks
  private buildRoads() {
    const byMat = new Map<string, number[][]>(); // key -> [pos, uv, idx]
    const push = (key: string, quad: number[][], uv: number[][]) => {
      let a = byMat.get(key); if (!a) { a = [[], [], []]; byMat.set(key, a); }
      const base = a[0].length / 3;
      for (const p of quad) a[0].push(...p); for (const u of uv) a[1].push(...u);
      a[2].push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const Y = 0.03;
    const sideParts: THREE.BufferGeometry[] = [];
    for (const e of EDGES) {
      const A = NODES[e.a], B = NODES[e.b], hw = e.hw;
      const ta = A.hw, tb = B.hw; const len = e.len - ta - tb; if (len <= 0) continue;
      const key = e.kind === 'dirt' ? 'dirt' : `r${e.lanes}`;
      const v0 = 0, v1 = len / 16;
      if (e.axis === 'x') { const x = A.x, z0 = A.z + ta, z1 = B.z - tb; push(key, [[x - hw, Y, z0], [x + hw, Y, z0], [x + hw, Y, z1], [x - hw, Y, z1]], [[0, v0], [1, v0], [1, v1], [0, v1]]); }
      else { const z = A.z, x0 = A.x + ta, x1 = B.x - tb; push(key, [[x0, Y, z + hw], [x0, Y, z - hw], [x1, Y, z - hw], [x1, Y, z + hw]], [[0, v0], [1, v0], [1, v1], [0, v1]]); }
      if (e.sidewalk) for (const s of [-1, 1]) {
        const off = hw + SIDEWALK_W / 2;
        const bg = new THREE.BoxGeometry(e.axis === 'x' ? SIDEWALK_W : e.len - ta - tb, 0.14, e.axis === 'x' ? e.len - ta - tb : SIDEWALK_W);
        const cx = e.axis === 'x' ? A.x + s * off : (A.x + ta + B.x - tb) / 2, cz = e.axis === 'x' ? (A.z + ta + B.z - tb) / 2 : A.z + s * off;
        bg.translate(cx, 0.07, cz); worldUV(bg); sideParts.push(bg);
      }
      // crosswalks at signalised nodes
      for (const [N, end] of [[A, 0], [B, 1]] as const) {
        if (!N.light) continue;
        const d = N.hw + 2.2;
        if (e.axis === 'x') { const z = end === 0 ? A.z + d : B.z - d; push('cross', [[A.x - hw, Y + 0.01, z - 1.6], [A.x + hw, Y + 0.01, z - 1.6], [A.x + hw, Y + 0.01, z + 1.6], [A.x - hw, Y + 0.01, z + 1.6]], [[0, 0], [hw / 2, 0], [hw / 2, 1], [0, 1]]); }
        else { const x = end === 0 ? A.x + d : B.x - d; push('cross', [[x - 1.6, Y + 0.01, A.z + hw], [x - 1.6, Y + 0.01, A.z - hw], [x + 1.6, Y + 0.01, A.z - hw], [x + 1.6, Y + 0.01, A.z + hw]], [[0, 0], [hw / 2, 0], [hw / 2, 1], [0, 1]]); }
      }
    }
    for (const n of NODES) {
      const hw = n.hw; push('plain', [[n.x - hw, Y, n.z + hw], [n.x + hw, Y, n.z + hw], [n.x + hw, Y, n.z - hw], [n.x - hw, Y, n.z - hw]], [[0, 0], [hw / 8, 0], [hw / 8, hw / 8], [0, hw / 8]]);
      if (n.edges.some((e) => EDGES[e].sidewalk)) for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const bg = new THREE.BoxGeometry(SIDEWALK_W, 0.14, SIDEWALK_W); bg.translate(n.x + sx * (hw + SIDEWALK_W / 2), 0.07, n.z + sz * (hw + SIDEWALK_W / 2)); worldUV(bg); sideParts.push(bg); }
    }
    const mats: Record<string, THREE.Material> = {
      r1: roadMaterial(getRoadTex(1, 'city')), r2: roadMaterial(getRoadTex(2, 'city')), r3: roadMaterial(getRoadTex(3, 'highway')), dirt: roadMaterial(getRoadTex(1, 'dirt')),
      plain: roadMaterial(TEX.asphalt), cross: new THREE.MeshStandardMaterial({ map: TEX.crosswalk, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false }),
    };
    for (const [k, [p, u, ix]] of byMat) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(ix); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mats[k]); m.receiveShadow = true; m.frustumCulled = false; m.renderOrder = k === 'cross' ? 2 : 0; this.group.add(m);
    }
    const { mergeGeometries } = THREE_UTILS;
    const sw = new THREE.Mesh(mergeGeometries(sideParts.map((g) => g.toNonIndexed()))!, new THREE.MeshStandardMaterial({ map: TEX.sidewalk, roughness: 0.9, normalMap: NORMALS.concrete, normalScale: new THREE.Vector2(0.5, 0.5) }));
    (sw.material as THREE.MeshStandardMaterial).map!.repeat.set(1, 1);
    sw.receiveShadow = true; sw.frustumCulled = false; this.group.add(sw);
  }
  private buildAirport() {
    const run = new THREE.Mesh(new THREE.PlaneGeometry(860, 46).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: getRoadTex(3, 'highway').clone(), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
    const t = (run.material as THREE.MeshStandardMaterial).map!; t.repeat.set(54, 1); t.rotation = Math.PI / 2; t.needsUpdate = true;
    run.position.set(-1500, 0.04, -1620); run.receiveShadow = true; this.group.add(run);
    const taxi = new THREE.Mesh(new THREE.PlaneGeometry(24, 420).rotateX(-Math.PI / 2), roadMaterial(TEX.asphalt)); taxi.position.set(-1300, 0.035, -1410); this.group.add(taxi);
    const planeM = new THREE.InstancedMesh(this.geo.plane, this.propMat, 3);
    const m4 = new THREE.Matrix4();
    [[-1640, -1300, 0.3], [-1460, -1300, -0.4], [-1860, -1440, 1.57]].forEach(([x, z, r], i) => { m4.makeRotationY(r); m4.setPosition(x, 0, z); planeM.setMatrixAt(i, m4); });
    planeM.castShadow = true; planeM.receiveShadow = true; this.group.add(planeM);
  }

  // ---------------------------------------------------------------------------- chunk streaming
  update(px: number, pz: number, budget = 1) {
    const ci = Math.floor((px + HALF) / CH), cj = Math.floor((pz + HALF) / CH), R = this.q.viewChunks;
    const want = new Set<number>();
    for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
      if (i < 0 || j < 0 || i >= NC || j >= NC) continue;
      const k = this.key(i, j); want.add(k);
      const near = Math.max(Math.abs(i - ci), Math.abs(j - cj)) <= 1;
      const ch = this.chunks.get(k);
      if (!ch) { if (!this.queue.includes(k)) this.queue.push(k); }
      else if (ch.near !== near) { this.disposeChunk(k); if (!this.queue.includes(k)) this.queue.unshift(k); }
    }
    for (const [k] of this.chunks) if (!want.has(k)) this.disposeChunk(k);
    this.queue = this.queue.filter((k) => want.has(k));
    this.queue.sort((a, b) => this.cdist(a, ci, cj) - this.cdist(b, ci, cj));
    let n = 0;
    while (this.queue.length && n < budget) { const k = this.queue.shift()!; const i = Math.floor(k / 100), j = k % 100; this.buildChunk(i, j, Math.max(Math.abs(i - ci), Math.abs(j - cj)) <= 1); n++; }
  }
  get pending() { return this.queue.length; }
  private cdist(k: number, ci: number, cj: number) { return Math.max(Math.abs(Math.floor(k / 100) - ci), Math.abs((k % 100) - cj)); }
  private disposeChunk(k: number) {
    const ch = this.chunks.get(k); if (!ch) return;
    ch.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry && !(m as any).sharedGeo) m.geometry.dispose(); if ((o as any).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); });
    for (const m of (ch.group.userData.mats ?? []) as THREE.Material[]) { (m as any).map?.dispose(); m.dispose(); }
    this.group.remove(ch.group); this.chunks.delete(k);
  }

  private buildChunk(i: number, j: number, near: boolean) {
    const k = this.key(i, j); const g = new THREE.Group(); g.userData.mats = [];
    const ch: Chunk = { i, j, group: g, near, lights: null };
    const x0 = -HALF + i * CH, z0 = -HALF + j * CH;
    // buildings
    const bl = this.chunkB.get(k) ?? [];
    if (bl.length) {
      const bg = buildingGeometry(bl, near);
      const m = new THREE.Mesh(bg, this.facade); m.castShadow = near && this.q.shadows; m.receiveShadow = true; g.add(m);
    }
    // vegetation & props
    const sp = this.chunkS.get(k) ?? [];
    const groups = new Map<string, typeof SPOTS>();
    for (const s of sp) { if (!near && (s.kind === 'bench' || s.kind === 'bush')) continue; (groups.get(s.kind) ?? groups.set(s.kind, []).get(s.kind)!).push(s); }
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
    for (const [kind, list] of groups) {
      const veg = kind === 'palm' || kind === 'tree' || kind === 'cypress' || kind === 'pine' || kind === 'bush';
      const im = new THREE.InstancedMesh(this.geo[kind], veg ? this.vegMat : this.propMat, list.length);
      (im as any).sharedGeo = true;
      list.forEach((s, n) => {
        const sc = veg ? 0.75 + hash2(Math.round(s.x * 3), Math.round(s.z * 3), 1) * 0.6 : 1;
        q4.setFromAxisAngle(v3.set(0, 1, 0), s.yaw ?? hash2(Math.round(s.x), Math.round(s.z), 2) * 6.28);
        const y = kind === 'cypress' ? Math.max(L.heightAt(s.x, s.z), L.WATER_Y - 0.6) : L.heightAt(s.x, s.z);
        m4.compose(v3.set(s.x, y, s.z), q4, s3.set(sc, sc, sc)); im.setMatrixAt(n, m4);
        if (kind === 'container') im.setColorAt(n, new THREE.Color(s.c ?? 0xaa3333));
      });
      if (kind === 'container' && im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = near && this.q.shadows && kind !== 'bush'; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im);
    }
    if (near) this.buildStreetFurniture(ch, x0, z0);
    this.buildPoiDetails(ch, x0, z0, near);
    this.group.add(g); this.chunks.set(k, ch);
  }

  private buildStreetFurniture(ch: Chunk, x0: number, z0: number) {
    const lights: THREE.Matrix4[] = [], pools: THREE.Matrix4[] = [];
    const inC = (x: number, z: number) => x >= x0 && x < x0 + CH && z >= z0 && z < z0 + CH;
    for (const e of EDGES) {
      if (e.kind === 'dirt') continue;
      const A = NODES[e.a], B = NODES[e.b];
      const step = e.kind === 'highway' ? 60 : 42;
      for (let t = A.hw + 12; t < e.len - B.hw - 6; t += step) {
        const side = (Math.floor(t / step) % 2 === 0 ? 1 : -1) * (e.kind === 'highway' ? 1 : 1);
        const off = e.hw + (e.sidewalk ? SIDEWALK_W - 0.6 : 1.4);
        const x = e.axis === 'x' ? A.x + side * off : A.x + t, z = e.axis === 'x' ? A.z + t : A.z + side * off;
        if (!inC(x, z)) continue;
        const yaw = e.axis === 'x' ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : (side > 0 ? Math.PI : 0);
        lights.push(new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z));
        const lx = x + Math.sin(yaw) * 2, lz = z + Math.cos(yaw) * 2;
        pools.push(new THREE.Matrix4().makeScale(16, 1, 16).setPosition(lx, 0.06, lz));
      }
    }
    if (lights.length) {
      const im = new THREE.InstancedMesh(this.geo.light, this.propMat, lights.length); (im as any).sharedGeo = true; lights.forEach((m, n) => im.setMatrixAt(n, m)); im.castShadow = this.q.shadows; im.computeBoundingSphere(); ch.group.add(im);
      const bulbG = new THREE.BoxGeometry(0.3, 0.06, 0.6); bulbG.translate(0, 7.2, 2.0);
      const bulbs = new THREE.InstancedMesh(bulbG, this.lampMat, lights.length); lights.forEach((m, n) => bulbs.setMatrixAt(n, m)); bulbs.computeBoundingSphere(); ch.group.add(bulbs);
      const pg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
      const pm = new THREE.InstancedMesh(pg, this.poolMat, pools.length); pools.forEach((m, n) => pm.setMatrixAt(n, m)); pm.renderOrder = 3; pm.computeBoundingSphere(); ch.group.add(pm);
    }
    // traffic signals
    const poles: THREE.Matrix4[] = []; const lampMs: THREE.Matrix4[] = []; const nodes: { n: number; axis: 'x' | 'z'; idx: number }[] = [];
    for (const n of NODES) {
      if (!n.light || !inC(n.x, n.z)) continue;
      const d = n.hw + 1.2;
      // four corners, each pole's arm reaches over the approach lane that faces it
      const corners: [number, number, number, 'x' | 'z'][] = [[n.x + d, n.z + d, Math.PI, 'x'], [n.x - d, n.z - d, 0, 'x'], [n.x - d, n.z + d, -Math.PI / 2, 'z'], [n.x + d, n.z - d, Math.PI / 2, 'z']];
      for (const [x, z, yaw, axis] of corners) {
        const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z); poles.push(m);
        for (let s = 0; s < 3; s++) { const lm = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeTranslation(0, 4.9 - s * 0.3, 3.76)).premultiply(new THREE.Matrix4().makeTranslation(x, 0, z)); lampMs.push(lm); nodes.push({ n: n.id, axis, idx: s }); }
      }
    }
    if (poles.length) {
      const im = new THREE.InstancedMesh(this.geo.tpole, this.propMat, poles.length); (im as any).sharedGeo = true; poles.forEach((m, k) => im.setMatrixAt(k, m)); im.castShadow = this.q.shadows; im.computeBoundingSphere(); ch.group.add(im);
      const lg = new THREE.SphereGeometry(0.11, 8, 6);
      const lm = new THREE.InstancedMesh(lg, this.signalMat, lampMs.length); lampMs.forEach((m, k) => { lm.setMatrixAt(k, m); lm.setColorAt(k, new THREE.Color(0x111111)); }); lm.computeBoundingSphere(); ch.group.add(lm);
      ch.lights = { mesh: lm, nodes };
    }
  }

  private buildPoiDetails(ch: Chunk, x0: number, z0: number, near: boolean) {
    for (const p of POIS) {
      if (p.x < x0 || p.x >= x0 + CH || p.z < z0 || p.z >= z0 + CH) continue;
      // sign above the door
      const sign = makeSign(p.name, p.kind);
      const sw = Math.min(p.w * 0.7, 1.5 + p.name.length * 0.42);
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw / 4.6), sign); ch.group.userData.mats.push(sign);
      const fx = Math.sin(p.face), fz = Math.cos(p.face);
      const sy = Math.min(p.h - 0.6, p.kind === 'gas' ? 3.6 : 4.6);
      sm.position.set(p.door.x - fx * 1.05, sy, p.door.z - fz * 1.05); sm.rotation.y = p.face; ch.group.add(sm);
      // awning
      if (near && p.kind !== 'airport') { const aw = new THREE.Mesh(new THREE.BoxGeometry(Math.min(p.w * 0.6, 10), 0.15, 2.2), mat(awningColor(p.kind), 0.7)); aw.position.set(p.door.x + fx * 0.0, 3.2, p.door.z + fz * 0.0); aw.rotation.y = p.face; aw.castShadow = true; ch.group.add(aw); }
      // door
      const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 0.12), mat(0x1c2a33, 0.1, 0.8)); door.position.set(p.door.x - fx * 1.15, 1.3, p.door.z - fz * 1.15); door.rotation.y = p.face; ch.group.add(door);
      if (p.kind === 'gas') { const c = new THREE.Mesh(this.geo.canopy, this.propMat); (c as any).sharedGeo = true; c.position.set(p.door.x + fx * 12, 0, p.door.z + fz * 12); c.rotation.y = p.face; c.castShadow = this.q.shadows; ch.group.add(c); }
      if (p.kind === 'club' || p.kind === 'bar' || p.kind === 'restaurant' || p.kind === 'diner' || p.kind === 'hotel') {
        const neon = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color(p.kind === 'club' ? 0xff2bd6 : p.kind === 'hotel' ? 0x37e0ff : 0xff6a2b), emissiveIntensity: 2 }); this.neonMats.push(neon); ch.group.userData.mats.push(neon);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(p.w * 0.95, 0.18, 0.18), neon); strip.position.set(p.door.x - fx * 1.25, Math.min(p.h - 0.4, 5.6), p.door.z - fz * 1.25); strip.rotation.y = p.face; ch.group.add(strip);
        if (p.kind === 'club') { const v = new THREE.Mesh(new THREE.BoxGeometry(0.18, p.h - 1, 0.18), neon); for (const s of [-1, 1]) { const vv = v.clone(); vv.position.set(p.door.x - fx * 1.25 + Math.cos(p.face) * s * p.w * 0.46, (p.h - 1) / 2, p.door.z - fz * 1.25 - Math.sin(p.face) * s * p.w * 0.46); vv.rotation.y = p.face; ch.group.add(vv); } }
      }
      if (p.kind === 'hospital') { const cr = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0xff2020), emissiveIntensity: 1.5 }); ch.group.userData.mats.push(cr); for (const [w, h] of [[4, 1.2], [1.2, 4]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), cr); m.position.set(p.door.x - fx * 1.2, p.h - 4, p.door.z - fz * 1.2); m.rotation.y = p.face; ch.group.add(m); } }
    }
  }

  /** Night lights, traffic-signal states. */
  tick(time: number, night: number) {
    SHARED.uNight.value = night; SHARED.uTime.value = time;
    this.lampMat.emissiveIntensity = night * 3.2; this.poolMat.opacity = night * 0.9;
    for (const m of this.neonMats) m.emissiveIntensity = 0.6 + night * 2.6;
    const c = new THREE.Color();
    for (const ch of this.chunks.values()) {
      const L2 = ch.lights; if (!L2) continue;
      L2.nodes.forEach((s, k) => {
        const st = lightState(NODES[s.n], s.axis, time);
        const on = (s.idx === 0 && st === 'r') || (s.idx === 1 && st === 'y') || (s.idx === 2 && st === 'g');
        c.setHex(on ? (s.idx === 0 ? 0xff2a1a : s.idx === 1 ? 0xffb020 : 0x30ff6a) : 0x161616); if (on) c.multiplyScalar(2.2);
        L2.mesh.setColorAt(k, c);
      });
      if (L2.mesh.instanceColor) L2.mesh.instanceColor.needsUpdate = true;
    }
  }
  setQuality(q: Quality) { this.q = q; for (const k of [...this.chunks.keys()]) this.disposeChunk(k); }
}

import { mergeGeometries as _mg } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const THREE_UTILS = { mergeGeometries: _mg };
function worldUV(g: THREE.BufferGeometry) { const p = g.getAttribute('position'), uv = g.getAttribute('uv'); for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4); }
function awningColor(k: string) { return ({ gas: 0xd9302c, store: 0x2a7d4f, diner: 0xe84a7a, gunshop: 0x34495e, clothes: 0x111111, garage: 0xe8a020, restaurant: 0xc0392b, bar: 0x7a4a2a, police: 0x1f3a6e, hospital: 0x2a8ac0, bank: 0x2a4a3a, club: 0x5a1a6a, hotel: 0x1a8a8a, safehouse: 0x1a6a8a } as Record<string, number>)[k] ?? 0x555555; }

function makeSign(text: string, kind: string) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112; const c = cv.getContext('2d')!;
  const bg = ({ gas: '#d9302c', store: '#1f6e45', diner: '#f6f0e6', gunshop: '#1c2733', clothes: '#111', garage: '#1d2630', restaurant: '#2a1a12', bar: '#3a2414', police: '#1f3a6e', hospital: '#ffffff', bank: '#1d3a2c', club: '#14051f', hotel: '#0b2a33', safehouse: '#20303a', airport: '#e9eef2' } as Record<string, string>)[kind] ?? '#222';
  const fg = ({ diner: '#e84a7a', hospital: '#d0202a', club: '#ff4fe0', hotel: '#5ff3ff', airport: '#1d4f7a', gas: '#fff' } as Record<string, string>)[kind] ?? '#f4e9d0';
  c.fillStyle = bg; c.fillRect(0, 0, 512, 112); c.strokeStyle = fg; c.lineWidth = 6; c.strokeRect(6, 6, 500, 100);
  c.fillStyle = fg; c.font = `bold ${text.length > 16 ? 44 : 56}px Georgia, serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text.toUpperCase(), 256, 58);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: t, emissive: new THREE.Color(0xffffff), emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.5 });
}

/** Merged building geometry with facade UVs (metres) and style attribute. */
export function buildingGeometry(list: Bldg[], near: boolean): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], sty: number[] = [], idx: number[] = [];
  const cc = new THREE.Color();
  const quad = (p: number[][], n: number[], u: number[][], color: number, style: number, seed: number) => {
    const b = pos.length / 3; cc.setHex(color);
    for (let k = 0; k < 4; k++) { pos.push(...p[k]); nor.push(...n); uv.push(...u[k]); col.push(cc.r, cc.g, cc.b); sty.push(style, seed); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const tri = (p: number[][], n: number[], color: number, seed: number) => { const b = pos.length / 3; cc.setHex(color); for (let k = 0; k < 3; k++) { pos.push(...p[k]); nor.push(...n); uv.push(p[k][0], p[k][2]); col.push(cc.r, cc.g, cc.b); sty.push(-1, seed); } idx.push(b, b + 1, b + 2); };
  const box = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, color: number, style: number, seed: number, roofC: number, roof = true, uOff = 0) => {
    const w = x1 - x0, d = z1 - z0, h0 = y0, h1 = y1;
    // +z face
    quad([[x0, h0, z1], [x1, h0, z1], [x1, h1, z1], [x0, h1, z1]], [0, 0, 1], [[uOff, h0], [uOff + w, h0], [uOff + w, h1], [uOff, h1]], color, style, seed);
    quad([[x1, h0, z1], [x1, h0, z0], [x1, h1, z0], [x1, h1, z1]], [1, 0, 0], [[uOff + w, h0], [uOff + w + d, h0], [uOff + w + d, h1], [uOff + w, h1]], color, style, seed);
    quad([[x1, h0, z0], [x0, h0, z0], [x0, h1, z0], [x1, h1, z0]], [0, 0, -1], [[uOff + w + d, h0], [uOff + 2 * w + d, h0], [uOff + 2 * w + d, h1], [uOff + w + d, h1]], color, style, seed);
    quad([[x0, h0, z0], [x0, h0, z1], [x0, h1, z1], [x0, h1, z0]], [-1, 0, 0], [[uOff + 2 * w + d, h0], [uOff + 2 * w + 2 * d, h0], [uOff + 2 * w + 2 * d, h1], [uOff + 2 * w + d, h1]], color, style, seed);
    if (roof) quad([[x0, h1, z1], [x1, h1, z1], [x1, h1, z0], [x0, h1, z0]], [0, 1, 0], [[x0, z1], [x1, z1], [x1, z0], [x0, z0]], roofC, -1, seed);
  };
  for (const b of list) {
    const seed = hash2(Math.round(b.x0), Math.round(b.z0), 9) * 50;
    const base = b.stilts ? 1.5 : 0;
    if (b.stilts) for (const [px, pz] of [[b.x0 + 0.3, b.z0 + 0.3], [b.x1 - 0.3, b.z0 + 0.3], [b.x0 + 0.3, b.z1 - 0.3], [b.x1 - 0.3, b.z1 - 0.3]]) box(px - 0.15, px + 0.15, pz - 0.15, pz + 0.15, -1, 1.5, 0x5a4a38, -1, seed, 0x5a4a38, false);
    const pitched = b.style === 6 || b.style === 8;
    box(b.x0, b.x1, b.z0, b.z1, base, base + b.h, b.color, b.style, seed, b.roof, !pitched);
    if (pitched) {
      // gable roof along the long side
      const rh = Math.min(3, (b.x1 - b.x0) * 0.3), y = base + b.h, alongX = (b.x1 - b.x0) >= (b.z1 - b.z0), o = 0.5;
      if (alongX) {
        const zm = (b.z0 + b.z1) / 2, X0 = b.x0 - o, X1 = b.x1 + o, Z0 = b.z0 - o, Z1 = b.z1 + o;
        const s1 = new THREE.Vector3(0, Z1 - zm, rh).normalize();
        quad([[X0, y, Z1], [X1, y, Z1], [X1, y + rh, zm], [X0, y + rh, zm]], [0, s1.z, s1.y], [[X0, 0], [X1, 0], [X1, 4], [X0, 4]], b.roof, -1, seed);
        quad([[X1, y, Z0], [X0, y, Z0], [X0, y + rh, zm], [X1, y + rh, zm]], [0, s1.z, -s1.y], [[X1, 0], [X0, 0], [X0, 4], [X1, 4]], b.roof, -1, seed);
        tri([[b.x1, y, b.z1], [b.x1, y, b.z0], [b.x1, y + rh, zm]], [1, 0, 0], b.color, seed); tri([[b.x0, y, b.z0], [b.x0, y, b.z1], [b.x0, y + rh, zm]], [-1, 0, 0], b.color, seed);
      } else {
        const xm = (b.x0 + b.x1) / 2, X0 = b.x0 - o, X1 = b.x1 + o, Z0 = b.z0 - o, Z1 = b.z1 + o;
        const s1 = new THREE.Vector3(X1 - xm, rh, 0).normalize();
        quad([[X1, y, Z1], [X1, y, Z0], [xm, y + rh, Z0], [xm, y + rh, Z1]], [s1.y, s1.x, 0], [[Z1, 0], [Z0, 0], [Z0, 4], [Z1, 4]], b.roof, -1, seed);
        quad([[X0, y, Z0], [X0, y, Z1], [xm, y + rh, Z1], [xm, y + rh, Z0]], [-s1.y, s1.x, 0], [[Z0, 0], [Z1, 0], [Z1, 4], [Z0, 4]], b.roof, -1, seed);
        tri([[b.x0, y, b.z1], [b.x1, y, b.z1], [xm, y + rh, b.z1]], [0, 0, 1], b.color, seed); tri([[b.x1, y, b.z0], [b.x0, y, b.z0], [xm, y + rh, b.z0]], [0, 0, -1], b.color, seed);
      }
    } else if (near || b.h > 30) {
      // roof details: parapet, AC units, setback crown on towers
      const y = base + b.h;
      if (b.h > 55 && (b.x1 - b.x0) > 14) { const ix = (b.x1 - b.x0) * 0.18, iz = (b.z1 - b.z0) * 0.18; box(b.x0 + ix, b.x1 - ix, b.z0 + iz, b.z1 - iz, y, y + 6 + seed % 8, b.color, b.style, seed + 1, b.roof); }
      else if (near && b.style !== 4) { for (let k = 0; k < 2; k++) { const ax = b.x0 + 2 + (seed * (k + 1) * 7.1) % Math.max(1, b.x1 - b.x0 - 5), az = b.z0 + 2 + (seed * (k + 3) * 3.7) % Math.max(1, b.z1 - b.z0 - 5); box(ax, ax + 2.2, az, az + 1.6, y, y + 1.3, 0x9aa0a6, -1, seed, 0x8a9096); } }
      if (near && b.h < 60) { box(b.x0, b.x1, b.z0, b.z0 + 0.3, y, y + 0.9, b.color, -1, seed, b.color, false); box(b.x0, b.x1, b.z1 - 0.3, b.z1, y, y + 0.9, b.color, -1, seed, b.color, false); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('aStyle', new THREE.Float32BufferAttribute(sty, 2));
  g.setIndex(idx); g.computeBoundingSphere();
  return g;
}
