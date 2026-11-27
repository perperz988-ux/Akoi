// Streamed 3D buildings (from Natural Earth urban areas + city populations) and trees around the camera.
import * as THREE from 'three';
import { origin, hash2, mulberry, haversine, clamp, DEG, fbm } from '../core/geo';
import { citiesNear, aridityAt, airportsNear } from '../data/world';
import { Terrain, flattenWeight, footprintOf } from './Terrain';
import { NOISE_GLSL } from './Terrain';

const CELL = 500;

function buildingMaterial(night: { value: number }) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.1 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uNight = night;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wpp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        wpp = instanceMatrix * wpp;
        #endif
        vWP = (modelMatrix * wpp).xyz;
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWP; varying vec3 vWN; uniform float uNight;\n${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float facade = 1.0 - step(0.6, abs(vWN.y));
        float along = abs(vWN.x) > abs(vWN.z) ? vWP.z : vWP.x;
        vec2 wc = vec2(along / 3.2, vWP.y / 3.4);
        vec2 wf = fract(wc);
        float win = step(0.18, wf.x) * step(wf.x, 0.82) * step(0.25, wf.y) * step(wf.y, 0.8) * facade;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.1, 0.13), win * 0.75);
        float lit = step(0.75, hsh(floor(wc) + floor(vWP.xz / 40.0), 65536.0));
        float wfw = length(fwidth(wc)); win = mix(win, 0.3 * facade, smoothstep(0.35, 1.0, wfw)); lit = mix(lit, 0.25, smoothstep(0.35, 1.0, wfw));
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.15, win);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.8, 0.5) * win * lit * uNight * 0.8;`);
  };
  m.customProgramCacheKey = () => 'bldg-v1';
  return m;
}

export class Scenery {
  group = new THREE.Group();
  night = { value: 0 };
  private bld: THREE.InstancedMesh; private roofs: THREE.InstancedMesh; private trees: THREE.InstancedMesh;
  private maxB = 12000; private maxT = 6000; private key = ''; private tkey = '';
  density = 1; treesOn = true;
  private dummy = new THREE.Object3D();
  constructor(private terrain: Terrain) {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.bld = new THREE.InstancedMesh(box, buildingMaterial(this.night), this.maxB); this.bld.count = 0; this.bld.castShadow = false; this.bld.receiveShadow = true;
    this.bld.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxB * 3), 3);
    this.bld.frustumCulled = false;
    const roofG = new THREE.BoxGeometry(0.4, 0.12, 0.4).translate(0, 1.06, 0);
    this.roofs = new THREE.InstancedMesh(roofG, new THREE.MeshStandardMaterial({ color: 0x777b80, roughness: 0.9 }), this.maxB); this.roofs.count = 0; this.roofs.frustumCulled = false;
    const cone = new THREE.ConeGeometry(1, 2.2, 6).translate(0, 2.0, 0); const trunk = new THREE.CylinderGeometry(0.15, 0.2, 1, 5).translate(0, 0.5, 0);
    const tg = mergeTree(cone, trunk);
    this.trees = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), this.maxT); this.trees.count = 0; this.trees.frustumCulled = false;
    this.trees.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxT * 3), 3);
    this.group.add(this.bld, this.roofs, this.trees);
    origin.onShift(() => { this.key = ''; this.tkey = ''; });
  }

  update(cam: THREE.Vector3, agl: number) {
    const camLat = origin.latOf(cam.z), camLon = origin.lonOf(cam.x);
    const show = agl < 9000;
    this.bld.visible = this.roofs.visible = show;
    if (show) {
      const k = `${Math.floor(cam.x / CELL)},${Math.floor(cam.z / CELL)},${agl > 3000 ? 1 : 0}`;
      if (k !== this.key) { this.key = k; this.rebuildBuildings(cam, camLat, camLon, agl > 3000 ? 9000 : 6000); }
    }
    const tshow = this.treesOn && agl < 1500;
    this.trees.visible = tshow;
    if (tshow) {
      const k = `${Math.floor(cam.x / 200)},${Math.floor(cam.z / 200)}`;
      if (k !== this.tkey) { this.tkey = k; this.rebuildTrees(cam, camLat, camLon); }
    }
  }

  private rebuildBuildings(cam: THREE.Vector3, lat: number, lon: number, radius: number) {
    const cities = citiesNear(lat, lon, radius + 40000, 20000);
    const aps = airportsNear(lat, lon, radius + 6000).map(footprintOf);
    let n = 0; const col = new THREE.Color();
    const R = Math.ceil(radius / CELL); const cx = Math.floor(cam.x / CELL), cz = Math.floor(cam.z / CELL);
    const cells: [number, number, number][] = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) { const d = Math.hypot(i, j) * CELL; if (d <= radius) cells.push([cx + i, cz + j, d]); }
    cells.sort((a, b) => a[2] - b[2]);
    for (const [gx, gz, dist] of cells) {
      if (n >= this.maxB - 60) break;
      const wx = (gx + 0.5) * CELL, wz = (gz + 0.5) * CELL;
      const clat = origin.latOf(wz), clon = origin.lonOf(wx);
      const hi = this.terrain.heightAt(clat, clon); const t = hi.tile; if (!t || hi.water) continue;
      const fx = (clon - t.w) / (t.e - t.w), fy = (latToTy(clat, t.z) - t.y);
      const urb = t.lcAt(fx, fy)[1] / 255;
      if (urb < 0.3) continue;
      // city core proximity drives height
      let core = 0, pop = 0;
      for (const c of cities) { const d = haversine(clat, clon, c.lat, c.lon); const rc = 1500 + Math.sqrt(c.pop) * 6; const f = clamp(1 - d / rc, 0, 1); if (f > core) { core = f; pop = c.pop; } }
      const seed = hash2(Math.round(clon * 2000), Math.round(clat * 2000));
      const rnd = mulberry(seed * 4294967295);
      const count = Math.round((45 + core * 90) * urb * this.density * (dist > 2500 ? 0.3 : 1));
      for (let b = 0; b < count && n < this.maxB; b++) {
        const px = wx + (rnd() - 0.5) * CELL * 0.92, pz = wz + (rnd() - 0.5) * CELL * 0.92;
        const plat = origin.latOf(pz), plon = origin.lonOf(px);
        if (aps.some(f => flattenWeight(f, plat, plon) > 0.02)) continue;
        const h = this.terrain.heightAt(plat, plon); if (h.water) continue;
        const pf = Math.min(1, Math.log10(Math.max(1e4, pop)) - 4) / 2.5;
        const tall = core > 0.65 && rnd() < core * pf * 0.9;
        const height = tall ? 60 + rnd() * rnd() * (120 + pop / 30000) : 6 + rnd() * (10 + core * 25);
        const w = tall ? 22 + rnd() * 25 : 10 + rnd() * 22, d = tall ? 22 + rnd() * 25 : 10 + rnd() * 22;
        this.dummy.position.set(px, h.h - 1, pz); this.dummy.rotation.set(0, Math.floor(rnd() * 4) * Math.PI / 2 + (rnd() < 0.2 ? rnd() : 0), 0); this.dummy.scale.set(w, Math.min(450, height), d);
        this.dummy.updateMatrix(); this.bld.setMatrixAt(n, this.dummy.matrix); this.roofs.setMatrixAt(n, this.dummy.matrix);
        const tone = 0.55 + rnd() * 0.4; col.setRGB(tone, tone * (0.95 + rnd() * 0.06), tone * (0.9 + rnd() * 0.12)); if (tall && rnd() < 0.5) col.setRGB(0.45, 0.55, 0.65);
        this.bld.setColorAt(n, col);
        n++;
      }
    }
    this.bld.count = n; this.roofs.count = n;
    this.bld.instanceMatrix.needsUpdate = true; this.roofs.instanceMatrix.needsUpdate = true; if (this.bld.instanceColor) this.bld.instanceColor.needsUpdate = true;
  }

  private rebuildTrees(cam: THREE.Vector3, lat: number, lon: number) {
    const aps = airportsNear(lat, lon, 6000).map(footprintOf);
    const arid = aridityAt(lat, lon); const alat = Math.abs(lat);
    let n = 0; const col = new THREE.Color();
    const C = 100, R = 16; const cx = Math.floor(cam.x / C), cz = Math.floor(cam.z / C);
    for (let i = -R; i <= R && n < this.maxT; i++) for (let j = -R; j <= R && n < this.maxT; j++) {
      if (i * i + j * j > R * R) continue;
      const wx = (cx + i + 0.5) * C, wz = (cz + j + 0.5) * C;
      const clat = origin.latOf(wz), clon = origin.lonOf(wx);
      const f = fbm(clon * 900, clat * 900, 3);
      if (f < 0.5 + arid * 0.4 || alat > 68) continue;
      const hi = this.terrain.heightAt(clat, clon); const t = hi.tile; if (!t || hi.water || hi.h < 2) continue;
      const lc = t.lcAt((clon - t.w) / (t.e - t.w), latToTy(clat, t.z) - t.y); if (lc[1] > 120 || lc[2] > 60 || lc[0] > 100) continue;
      if (hi.h > (alat < 30 ? 3500 : 3500 - (alat - 30) * 60)) continue;
      if (aps.some(fp => flattenWeight(fp, clat, clon) > 0.01)) continue;
      const rnd = mulberry(hash2(Math.round(clon * 20000), Math.round(clat * 20000)) * 4294967295);
      const k = Math.floor((f - 0.5) * 30) + 2;
      for (let q = 0; q < k && n < this.maxT; q++) {
        const px = wx + (rnd() - 0.5) * C, pz = wz + (rnd() - 0.5) * C;
        const h = this.terrain.heightAt(origin.latOf(pz), origin.lonOf(px));
        const s = 4 + rnd() * 6;
        this.dummy.position.set(px, h.h - 0.3, pz); this.dummy.rotation.set(0, rnd() * 6, 0); this.dummy.scale.set(s * 0.45, s, s * 0.45); this.dummy.updateMatrix();
        this.trees.setMatrixAt(n, this.dummy.matrix);
        const g = 0.5 + rnd() * 0.5; col.setRGB(0.55 * g + arid * 0.3, 0.75 * g, 0.45 * g); this.trees.setColorAt(n, col);
        n++;
      }
    }
    this.trees.count = n; this.trees.instanceMatrix.needsUpdate = true; if (this.trees.instanceColor) this.trees.instanceColor.needsUpdate = true;
  }
}
function latToTy(lat: number, z: number) { const r = lat * DEG; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z); }
function mergeTree(cone: THREE.BufferGeometry, trunk: THREE.BufferGeometry) {
  const color = (g: THREE.BufferGeometry, c: [number, number, number]) => { const n = g.getAttribute('position').count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.index ? g.toNonIndexed() : g; };
  const a = color(cone, [0.16, 0.3, 0.12]), b = color(trunk, [0.3, 0.22, 0.14]);
  const pos = new Float32Array([...a.getAttribute('position').array, ...b.getAttribute('position').array]);
  const nor = new Float32Array([...a.getAttribute('normal').array, ...b.getAttribute('normal').array]);
  const colr = new Float32Array([...a.getAttribute('color').array, ...b.getAttribute('color').array]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(colr, 3));
  return g;
}
