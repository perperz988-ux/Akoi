// Static geometry batching: procedural primitives (vertex coloured) and placed glTF models,
// merged per material and per 64 m chunk so the whole world renders in a few hundred draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MODELS } from './assets.js';

const CH = 128;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

function toFloat(geo) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = geo.getAttribute(name); if (!a) continue;
    const n = a.count, size = a.itemSize, arr = new Float32Array(n * size);
    for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = a.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  if (geo.index) g.setIndex(Array.from(geo.index.array)); else { const idx = []; for (let i = 0; i < geo.getAttribute('position').count; i++) idx.push(i); g.setIndex(idx); }
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

export class StaticBatch {
  constructor(scene) {
    this.scene = scene; this.buckets = new Map(); this.matCache = new Map(); this.floatCache = new Map();
    this.vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true }); // night-lit windows etc.
    this.meshes = [];
  }
  _bucket(mat, x, z, shadow = true) {
    const k = `${mat.uuid}|${Math.floor(x / CH)}|${Math.floor(z / CH)}|${shadow}`;
    let b = this.buckets.get(k); if (!b) { b = { mat, geos: [], shadow }; this.buckets.set(k, b); } return b;
  }
  // primitive with a flat colour. geo is consumed.
  prim(geo, color, x, y, z, ry = 0, rx = 0, rz = 0, opts = {}) {
    if (geo.index) geo = geo.toNonIndexed();
    geo.deleteAttribute('uv');
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _m.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1)); geo.applyMatrix4(_m);
    const n = geo.getAttribute('position').count, col = new Float32Array(n * 3); _c.set(color);
    const j = opts.jitter ?? 0.06;
    // per-face slight variation for a hand-made look
    for (let i = 0; i < n; i += 3) { const f = 1 + (Math.random() - 0.5) * j; for (let v = 0; v < 3 && i + v < n; v++) { col[(i + v) * 3] = _c.r * f; col[(i + v) * 3 + 1] = _c.g * f; col[(i + v) * 3 + 2] = _c.b * f; } }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this._bucket(opts.glow ? this.glowMat : this.vcMat, x, z, opts.shadow !== false && !opts.glow).geos.push(geo);
  }
  box(w, h, d, color, x, y, z, ry = 0, opts = {}) { this.prim(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, ry, opts.rx || 0, opts.rz || 0, opts); }
  cyl(rt, rb, h, color, x, y, z, seg = 10, opts = {}) { this.prim(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z, opts.ry || 0, opts.rx || 0, opts.rz || 0, opts); }
  // place a glTF model (static). Returns {w,d,h} footprint after scaling.
  model(name, x, y, z, ry = 0, o = {}) {
    const M = MODELS[name]; if (!M) return null;
    let s = o.scale || 1;
    if (o.height) s = o.height / M.size.y; if (o.length) s = o.length / Math.max(M.size.x, M.size.z); if (o.width) s = o.width / M.size.x;
    const root = new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(o.rx || 0, ry, o.rz || 0)), _s.set(s, s, s));
    const off = new THREE.Matrix4().makeTranslation(o.center ? -(M.box.min.x + M.box.max.x) / 2 : 0, o.ground === false ? 0 : -M.box.min.y, o.center ? -(M.box.min.z + M.box.max.z) / 2 : 0);
    root.multiply(off);
    M.scene.updateMatrixWorld(true);
    M.scene.traverse((ob) => {
      if (!ob.isMesh || ob.isSkinnedMesh) return;
      let f = this.floatCache.get(ob.geometry.uuid); if (!f) { f = toFloat(ob.geometry); this.floatCache.set(ob.geometry.uuid, f); }
      const g = f.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(root, ob.matrixWorld));
      const mats = Array.isArray(ob.material) ? ob.material : [ob.material];
      const mat = this._mat(mats[0], o.tint, o.emissive);
      this._bucket(mat, x, z, o.shadow !== false).geos.push(g);
    });
    return { w: M.size.x * s, d: M.size.z * s, h: M.size.y * s, s };
  }
  _mat(m, tint, emissive) {
    if (!tint && !emissive) return m;
    const k = m.uuid + '|' + tint + '|' + emissive; let c = this.matCache.get(k);
    if (!c) { c = m.clone(); if (tint) c.color.multiply(new THREE.Color(tint)); if (emissive) { c.emissive = new THREE.Color(emissive); c.emissiveIntensity = 0.5; } this.matCache.set(k, c); }
    return c;
  }
  finish() {
    for (const b of this.buckets.values()) {
      if (!b.geos.length) continue;
      const vc = b.mat === this.vcMat || b.mat === this.glowMat;
      let geo;
      try { geo = mergeGeometries(b.geos, false); } catch (e) { geo = null; }
      if (!geo) { // attribute mismatch: fall back to separate meshes
        for (const g of b.geos) { const m = new THREE.Mesh(g, b.mat); m.castShadow = b.shadow; m.receiveShadow = true; this.scene.add(m); this.meshes.push(m); }
        continue;
      }
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, b.mat); mesh.castShadow = b.shadow; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      if (vc && b.mat === this.glowMat) mesh.castShadow = false;
      this.scene.add(mesh); this.meshes.push(mesh);
      for (const g of b.geos) g.dispose();
    }
    this.buckets.clear();
  }
}

// Instanced scatter of a glTF model (for junk on garbage piles). Each sub-mesh becomes one InstancedMesh.
export class Scatter {
  constructor(scene) { this.scene = scene; this.items = new Map(); }
  add(name, x, y, z, rx, ry, rz, scale, color) {
    let a = this.items.get(name); if (!a) { a = []; this.items.set(name, a); }
    a.push({ x, y, z, rx, ry, rz, scale, color }); return a.length - 1;
  }
  finish() {
    this.groups = {};
    for (const [name, list] of this.items) {
      const M = MODELS[name]; if (!M || !list.length) continue; M.scene.updateMatrixWorld(true);
      const subs = [];
      M.scene.traverse((ob) => { if (ob.isMesh) subs.push(ob); });
      const ims = []; const c = M.box.getCenter(new THREE.Vector3()); const centre = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
      for (const ob of subs) {
        const mat = (Array.isArray(ob.material) ? ob.material[0] : ob.material).clone();
        const im = new THREE.InstancedMesh(ob.geometry, mat, list.length); im.castShadow = true; im.receiveShadow = true;
        list.forEach((it, i) => {
          const root = new THREE.Matrix4().compose(_p.set(it.x, it.y, it.z), _q.setFromEuler(_e.set(it.rx, it.ry, it.rz)), _s.set(it.scale, it.scale, it.scale));
          root.multiply(centre).multiply(ob.matrixWorld); im.setMatrixAt(i, root);
          im.setColorAt(i, _c.set(it.color || 0xffffff));
        });
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere(); this.scene.add(im); ims.push(im);
      }
      this.groups[name] = { ims, list };
    }
  }
  // darken instances (e.g. pile searched)
  dim(name, idx, f = 0.55) {
    const g = this.groups && this.groups[name]; if (!g) return;
    for (const im of g.ims) { im.setColorAt(idx, _c.setScalar(f)); im.instanceColor.needsUpdate = true; }
  }
}
