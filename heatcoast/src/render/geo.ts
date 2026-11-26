import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Builds vertex-coloured merged geometry from primitives (one draw call per prop type). */
export class GeoBuilder {
  parts: THREE.BufferGeometry[] = [];
  private col(g: THREE.BufferGeometry, c: number, jitter = 0) {
    const n = g.getAttribute('position').count, a = new Float32Array(n * 3), cc = new THREE.Color(c);
    for (let i = 0; i < n; i++) { const j = 1 + (Math.random() - 0.5) * jitter; a[i * 3] = cc.r * j; a[i * 3 + 1] = cc.g * j; a[i * 3 + 2] = cc.b * j; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  add(g: THREE.BufferGeometry, c: number, m?: THREE.Matrix4, jitter = 0) {
    let gg = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') gg.deleteAttribute(k);
    if (!gg.getAttribute('uv')) gg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(gg.getAttribute('position').count * 2), 2));
    if (m) gg.applyMatrix4(m);
    this.col(gg, c, jitter); this.parts.push(gg); return this;
  }
  box(w: number, h: number, d: number, x: number, y: number, z: number, c: number, ry = 0, rx = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    return this.add(new THREE.BoxGeometry(w, h, d), c, m);
  }
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, c: number, seg = 8, rx = 0, rz = 0, ry = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), c, m);
  }
  sphere(r: number, x: number, y: number, z: number, c: number, sx = 1, sy = 1, sz = 1, detail = 1, jitter = 0.12) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    return this.add(new THREE.IcosahedronGeometry(r, detail), c, m, jitter);
  }
  build(): THREE.BufferGeometry { const g = mergeGeometries(this.parts)!; g.computeBoundingSphere(); return g; }
}

// --------------------------------------------------------------------------------- vegetation
export function palmGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder(); const H = 9;
  // curved trunk from stacked tapered segments
  let x = 0, y = 0, lean = 0;
  for (let i = 0; i < 7; i++) { const h = H / 7; lean += 0.035; const r = 0.24 - i * 0.018; b.cyl(r - 0.015, r, h * 1.05, x, y + h / 2, 0, i % 2 ? 0x8a7458 : 0x7a644a, 7, 0, -lean); x += Math.sin(lean) * h; y += Math.cos(lean) * h; }
  b.sphere(0.45, x, y, 0, 0x5a4a2a, 1, 0.7, 1, 0, 0.1);
  // fronds: drooping blades
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.2;
    for (let s = 0; s < 4; s++) {
      const t = s / 4, len = 1.2; const dx = Math.cos(a) * (0.5 + t * 3.2), dz = Math.sin(a) * (0.5 + t * 3.2), dy = 0.35 - t * t * 2.0;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x + dx, y + dy, dz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, -0.2 - t * 0.7, 'YXZ')), new THREE.Vector3(1, 1, 1));
      b.add(new THREE.BoxGeometry(len, 0.05, 0.75 - t * 0.35), k % 2 ? 0x4f7a2e : 0x3f6b28, m, 0.15);
    }
  }
  return b.build();
}
export function treeGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0.22, 0.34, 3.2, 0, 1.6, 0, 0x5d4a38, 7);
  b.cyl(0.08, 0.14, 2, 0.6, 3.2, 0, 0x5d4a38, 5, 0, -0.7);
  for (let k = 0; k < 7; k++) { const a = k * 2.1; b.sphere(1.5 + (k % 3) * 0.35, Math.cos(a) * 1.3, 4.3 + (k % 2) * 1.1, Math.sin(a) * 1.3, k % 2 ? 0x3d6b2e : 0x4a7a34, 1, 0.85, 1, 1, 0.2); }
  b.sphere(1.6, 0, 5.6, 0, 0x447530, 1, 0.9, 1, 1, 0.2);
  return b.build();
}
export function cypressGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0.6, 1.1, 1.6, 0, 0.3, 0, 0x5a4f40, 8); // flared base (in water)
  b.cyl(0.28, 0.55, 10, 0, 5.5, 0, 0x6a5c4a, 7);
  for (let k = 0; k < 6; k++) { const a = k * 1.7; const y = 7 + k * 0.9; b.sphere(1.6 - k * 0.12, Math.cos(a) * 1.4, y, Math.sin(a) * 1.4, 0x3b5a2c, 1.4, 0.45, 1.4, 1, 0.2); }
  // spanish moss
  for (let k = 0; k < 10; k++) { const a = k * 0.63; b.box(0.12, 1.6 + (k % 3) * 0.5, 0.12, Math.cos(a) * 2.1, 6.4, Math.sin(a) * 2.1, 0x7d8a6a); }
  return b.build();
}
export function pineGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0.18, 0.3, 9, 0, 4.5, 0, 0x6a5038, 6);
  for (let k = 0; k < 4; k++) b.add(new THREE.ConeGeometry(2.4 - k * 0.45, 2.6, 8), 0x2f5228, new THREE.Matrix4().makeTranslation(0, 6 + k * 1.4, 0), 0.18);
  return b.build();
}
export function bushGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  for (let k = 0; k < 4; k++) b.sphere(0.8 + (k % 2) * 0.3, Math.cos(k * 1.6) * 0.6, 0.6, Math.sin(k * 1.6) * 0.6, k % 2 ? 0x3e6a2c : 0x4f7c36, 1, 0.8, 1, 1, 0.2);
  return b.build();
}
export function benchGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(1.8, 0.06, 0.5, 0, 0.45, 0, 0x8a6a48); b.box(1.8, 0.4, 0.06, 0, 0.7, -0.22, 0x8a6a48);
  b.box(0.06, 0.45, 0.5, -0.8, 0.22, 0, 0x333333); b.box(0.06, 0.45, 0.5, 0.8, 0.22, 0, 0x333333);
  return b.build();
}
export function containerGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(12, 2.6, 2.45, 0, 1.3, 0, 0xffffff);
  for (let i = -5.6; i <= 5.6; i += 0.7) b.box(0.08, 2.5, 2.5, i, 1.3, 0, 0xdddddd);
  return b.build();
}
export function streetlightGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0.09, 0.14, 7.5, 0, 3.75, 0, 0x5b6066, 6);
  b.box(0.1, 0.1, 2.2, 0, 7.4, 1.0, 0x5b6066);
  b.box(0.35, 0.16, 0.7, 0, 7.3, 2.0, 0x4a4f55);
  return b.build();
}
export function trafficPoleGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(0.1, 0.13, 5.2, 0, 2.6, 0, 0x3d4247, 6);
  b.box(0.08, 0.08, 4.0, 0, 5.1, 2.0, 0x3d4247);
  b.box(0.35, 1.0, 0.3, 0, 4.6, 3.6, 0x22262a);
  return b.build();
}
export function airplaneGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.cyl(2, 2, 34, 0, 3.5, 0, 0xf2f4f6, 12, Math.PI / 2);
  b.sphere(2, 0, 3.5, 17, 0xf2f4f6, 1, 1, 1.6, 2, 0);
  b.add(new THREE.ConeGeometry(2, 7, 12), 0xf2f4f6, new THREE.Matrix4().makeRotationX(-Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, 3.7, -20.5)));
  b.box(34, 0.4, 5, 0, 2.6, 1, 0xdfe3e6); b.box(11, 0.3, 2.6, 0, 4.2, -20, 0xdfe3e6); b.box(0.4, 6, 3.6, 0, 7.5, -20, 0x1d6fa5);
  b.cyl(0.9, 0.9, 4, 7, 1.8, 2, 0xb8bec4, 10, Math.PI / 2); b.cyl(0.9, 0.9, 4, -7, 1.8, 2, 0xb8bec4, 10, Math.PI / 2);
  b.box(34.2, 0.5, 0.3, 0, 4.8, 9, 0x1d6fa5);
  for (let i = -12; i <= 12; i += 1.6) { b.box(0.05, 0.4, 0.5, 2.0, 4.4, i, 0x223344); b.box(0.05, 0.4, 0.5, -2.0, 4.4, i, 0x223344); }
  b.box(0.3, 1.8, 0.3, 0, 0.9, 13, 0x333333); b.box(0.3, 1.8, 0.3, 3, 0.9, 0, 0x333333); b.box(0.3, 1.8, 0.3, -3, 0.9, 0, 0x333333);
  return b.build();
}
export function gasCanopyGeo(): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.box(22, 1.0, 14, 0, 5.4, 0, 0xf4f4f4); b.box(22.2, 0.35, 14.2, 0, 5.0, 0, 0xd9302c);
  for (const [x, z] of [[-8, -4], [8, -4], [-8, 4], [8, 4]]) b.box(0.5, 5, 0.5, x, 2.5, z, 0xdddddd);
  for (const x of [-5, 0, 5]) { b.box(1.2, 0.25, 4, x, 0.12, 0, 0xbbbbbb); b.box(0.8, 1.7, 0.6, x, 1.0, -1, 0xe8e8e8); b.box(0.82, 0.4, 0.62, x, 1.6, -1, 0xd9302c); b.box(0.8, 1.7, 0.6, x, 1.0, 1, 0xe8e8e8); b.box(0.82, 0.4, 0.62, x, 1.6, 1, 0xd9302c); }
  return b.build();
}
