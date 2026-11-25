// Original voxel creature and avatar models built from shaded boxes.
import * as THREE from 'three';

export interface Model {
  root: THREE.Group;
  body: THREE.Object3D;
  head: THREE.Object3D | null;
  legs: THREE.Object3D[];
  arms: THREE.Object3D[];
  wings: THREE.Object3D[];
  mat: THREE.MeshLambertMaterial;
  glow: THREE.MeshBasicMaterial[];
}

type RGB = [number, number, number];
const boxCache = new Map<string, THREE.BufferGeometry>();

function shadedBox(w: number, h: number, d: number, col: RGB): THREE.BufferGeometry {
  const key = [w, h, d, ...col].join(',');
  const c = boxCache.get(key);
  if (c) return c;
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  const n = g.attributes.normal, cnt = n.count;
  const colors = new Float32Array(cnt * 3);
  const lin = new THREE.Color().setRGB(col[0], col[1], col[2], THREE.SRGBColorSpace);
  for (let i = 0; i < cnt; i++) {
    const ny = n.getY(i), nx = n.getX(i);
    const k = ny > 0.5 ? 1 : ny < -0.5 ? 0.55 : Math.abs(nx) > 0.5 ? 0.78 : 0.88;
    colors[i * 3] = lin.r * k; colors[i * 3 + 1] = lin.g * k; colors[i * 3 + 2] = lin.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  boxCache.set(key, g);
  return g;
}

class Builder {
  m: Model;
  constructor() {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.m = { root: new THREE.Group(), body: new THREE.Group(), head: null, legs: [], arms: [], wings: [], mat, glow: [] };
    this.m.root.add(this.m.body);
  }
  box(parent: THREE.Object3D, w: number, h: number, d: number, col: RGB, x: number, y: number, z: number, glow?: THREE.MeshBasicMaterial) {
    const mesh = new THREE.Mesh(glow ? new THREE.BoxGeometry(w, h, d) : shadedBox(w, h, d, col), glow || this.m.mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  pivot(parent: THREE.Object3D, x: number, y: number, z: number) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
  glowMat(hex: number, opacity = 1) {
    const m = new THREE.MeshBasicMaterial({ color: hex, transparent: opacity < 1, opacity, fog: true });
    this.m.glow.push(m);
    return m;
  }
}

export function buildMossback(): Model {
  const b = new Builder(), m = b.m;
  const shell: RGB = [0.46, 0.34, 0.22], moss: RGB = [0.36, 0.62, 0.3], skin: RGB = [0.56, 0.6, 0.38], belly: RGB = [0.82, 0.74, 0.54];
  b.box(m.body, 0.95, 0.42, 1.15, shell, 0, 0.5, 0);
  b.box(m.body, 0.85, 0.14, 1.0, moss, 0, 0.77, 0);
  b.box(m.body, 0.35, 0.12, 0.35, [0.45, 0.72, 0.36], 0.15, 0.88, -0.15);
  b.box(m.body, 0.25, 0.1, 0.25, [0.5, 0.75, 0.4], -0.2, 0.86, 0.25);
  b.box(m.body, 0.88, 0.12, 1.08, belly, 0, 0.26, 0);
  const head = b.pivot(m.body, 0, 0.45, 0.6);
  b.box(head, 0.36, 0.3, 0.36, skin, 0, 0, 0.16);
  b.box(head, 0.06, 0.06, 0.02, [0.08, 0.08, 0.08], 0.11, 0.05, 0.35);
  b.box(head, 0.06, 0.06, 0.02, [0.08, 0.08, 0.08], -0.11, 0.05, 0.35);
  b.box(head, 0.2, 0.06, 0.05, [0.4, 0.42, 0.26], 0, -0.08, 0.34);
  m.head = head;
  for (const [x, z] of [[0.33, 0.38], [-0.33, 0.38], [0.33, -0.38], [-0.33, -0.38]]) {
    const leg = b.pivot(m.body, x, 0.32, z);
    b.box(leg, 0.24, 0.32, 0.24, skin, 0, -0.16, 0);
    m.legs.push(leg);
  }
  b.box(m.body, 0.12, 0.1, 0.2, skin, 0, 0.35, -0.62);
  return m;
}

export function buildHopkin(): Model {
  const b = new Builder(), m = b.m;
  const fur: RGB = [0.93, 0.87, 0.74], patch: RGB = [0.62, 0.45, 0.3], pink: RGB = [0.95, 0.66, 0.66];
  b.box(m.body, 0.4, 0.34, 0.56, fur, 0, 0.32, 0);
  b.box(m.body, 0.3, 0.06, 0.36, patch, 0, 0.5, -0.04);
  b.box(m.body, 0.16, 0.16, 0.12, [1, 1, 1], 0, 0.38, -0.32);
  const head = b.pivot(m.body, 0, 0.5, 0.26);
  b.box(head, 0.3, 0.28, 0.28, fur, 0, 0, 0.08);
  b.box(head, 0.05, 0.06, 0.02, [0.1, 0.06, 0.06], 0.09, 0.04, 0.225);
  b.box(head, 0.05, 0.06, 0.02, [0.1, 0.06, 0.06], -0.09, 0.04, 0.225);
  b.box(head, 0.06, 0.04, 0.02, pink, 0, -0.04, 0.225);
  for (const x of [0.08, -0.08]) {
    const ear = b.pivot(head, x, 0.14, 0.0);
    b.box(ear, 0.08, 0.36, 0.1, fur, 0, 0.18, 0);
    b.box(ear, 0.04, 0.28, 0.02, pink, 0, 0.18, 0.05);
    m.arms.push(ear);
  }
  m.head = head;
  for (const [x, z, big] of [[0.14, -0.15, 1], [-0.14, -0.15, 1], [0.12, 0.2, 0], [-0.12, 0.2, 0]]) {
    const leg = b.pivot(m.body, x, 0.18, z);
    if (big) b.box(leg, 0.12, 0.18, 0.3, fur, 0, -0.09, 0.04);
    else b.box(leg, 0.08, 0.18, 0.08, fur, 0, -0.09, 0);
    m.legs.push(leg);
  }
  return m;
}

export function buildGlimmerwing(): Model {
  const b = new Builder(), m = b.m;
  b.box(m.body, 0.14, 0.14, 0.42, [0.2, 0.18, 0.28], 0, 0, 0);
  const g1 = b.glowMat(0x6ff0e0, 0.85), g2 = b.glowMat(0xc48bff, 0.85), eye = b.glowMat(0xfff6c0);
  b.box(m.body, 0.04, 0.04, 0.04, [1, 1, 1], 0.05, 0.03, 0.22, eye);
  b.box(m.body, 0.04, 0.04, 0.04, [1, 1, 1], -0.05, 0.03, 0.22, eye);
  b.box(m.body, 0.02, 0.2, 0.02, [0.3, 0.3, 0.3], 0.05, 0.12, 0.24);
  b.box(m.body, 0.02, 0.2, 0.02, [0.3, 0.3, 0.3], -0.05, 0.12, 0.24);
  for (const s of [1, -1]) {
    const w = b.pivot(m.body, s * 0.07, 0.02, 0.05);
    b.box(w, 0.42, 0.02, 0.3, [1, 1, 1], s * 0.21, 0, 0.06, g1);
    b.box(w, 0.3, 0.021, 0.22, [1, 1, 1], s * 0.17, 0, -0.2, g2);
    m.wings.push(w);
  }
  m.head = null;
  return m;
}

export function buildGloomling(): Model {
  const b = new Builder(), m = b.m;
  const dark: RGB = [0.2, 0.14, 0.28], mid: RGB = [0.32, 0.22, 0.42], bone: RGB = [0.62, 0.58, 0.66];
  const eye = b.glowMat(0xd6ff5a);
  for (const x of [0.15, -0.15]) {
    const leg = b.pivot(m.body, x, 0.62, 0);
    b.box(leg, 0.24, 0.62, 0.26, dark, 0, -0.31, 0);
    b.box(leg, 0.26, 0.08, 0.34, bone, 0, -0.58, 0.04);
    m.legs.push(leg);
  }
  const torso = b.pivot(m.body, 0, 0.62, 0);
  torso.rotation.x = 0.3;
  b.box(torso, 0.62, 0.72, 0.42, mid, 0, 0.36, 0);
  b.box(torso, 0.5, 0.2, 0.3, dark, 0, 0.62, -0.12);
  const head = b.pivot(torso, 0, 0.8, 0.08);
  b.box(head, 0.5, 0.46, 0.46, dark, 0, 0.18, 0);
  b.box(head, 0.2, 0.2, 0.04, [1, 1, 1], 0, 0.2, 0.24, eye);
  b.box(head, 0.1, 0.18, 0.1, bone, 0.2, 0.48, -0.05);
  b.box(head, 0.1, 0.18, 0.1, bone, -0.2, 0.48, -0.05);
  b.box(head, 0.36, 0.06, 0.04, [0.1, 0.05, 0.12], 0, 0.0, 0.24);
  m.head = head;
  for (const x of [0.4, -0.4]) {
    const arm = b.pivot(torso, x, 0.62, 0);
    b.box(arm, 0.16, 0.95, 0.16, mid, 0, -0.45, 0);
    b.box(arm, 0.2, 0.14, 0.2, bone, 0, -0.95, 0.02);
    m.arms.push(arm);
  }
  return m;
}

export function buildCrawler(): Model {
  const b = new Builder(), m = b.m;
  const rock: RGB = [0.42, 0.4, 0.4], rock2: RGB = [0.32, 0.3, 0.3], leg: RGB = [0.24, 0.22, 0.24];
  const eye = b.glowMat(0xff4a30), crystal = b.glowMat(0xffa13a);
  b.box(m.body, 1.1, 0.36, 0.95, rock, 0, 0.42, 0);
  b.box(m.body, 0.8, 0.18, 0.7, rock2, 0, 0.66, -0.05);
  b.box(m.body, 0.12, 0.3, 0.12, [1, 1, 1], 0.2, 0.85, 0.05, crystal);
  b.box(m.body, 0.1, 0.22, 0.1, [1, 1, 1], -0.25, 0.8, -0.15, crystal);
  b.box(m.body, 0.08, 0.18, 0.08, [1, 1, 1], 0.05, 0.8, -0.3, crystal);
  const head = b.pivot(m.body, 0, 0.42, 0.5);
  b.box(head, 0.6, 0.26, 0.24, rock2, 0, 0, 0.08);
  b.box(head, 0.08, 0.08, 0.04, [1, 1, 1], 0.16, 0.06, 0.21, eye);
  b.box(head, 0.08, 0.08, 0.04, [1, 1, 1], -0.16, 0.06, 0.21, eye);
  b.box(head, 0.06, 0.06, 0.2, leg, 0.24, -0.1, 0.25);
  b.box(head, 0.06, 0.06, 0.2, leg, -0.24, -0.1, 0.25);
  m.head = head;
  for (const z of [0.3, 0, -0.3]) for (const s of [1, -1]) {
    const lg = b.pivot(m.body, s * 0.5, 0.45, z);
    lg.rotation.z = s * 0.6;
    b.box(lg, 0.6, 0.1, 0.1, leg, s * 0.3, 0, 0);
    b.box(lg, 0.1, 0.4, 0.1, leg, s * 0.58, -0.2, 0);
    m.legs.push(lg);
  }
  return m;
}

export function buildStingwisp(): Model {
  const b = new Builder(), m = b.m;
  const yel: RGB = [0.95, 0.78, 0.2], blk: RGB = [0.12, 0.1, 0.1];
  const wing = b.glowMat(0xe8f4ff, 0.55), eye = b.glowMat(0xff3a3a);
  b.box(m.body, 0.3, 0.28, 0.22, yel, 0, 0, 0.18);
  b.box(m.body, 0.32, 0.3, 0.16, blk, 0, 0, 0.0);
  b.box(m.body, 0.3, 0.28, 0.18, yel, 0, -0.02, -0.17);
  b.box(m.body, 0.24, 0.22, 0.14, blk, 0, -0.04, -0.32);
  b.box(m.body, 0.06, 0.06, 0.22, [0.85, 0.85, 0.8], 0, -0.06, -0.48);
  const head = b.pivot(m.body, 0, 0.04, 0.32);
  b.box(head, 0.24, 0.22, 0.16, blk, 0, 0, 0.06);
  b.box(head, 0.06, 0.08, 0.04, [1, 1, 1], 0.08, 0.03, 0.14, eye);
  b.box(head, 0.06, 0.08, 0.04, [1, 1, 1], -0.08, 0.03, 0.14, eye);
  m.head = head;
  for (const s of [1, -1]) {
    const w = b.pivot(m.body, s * 0.12, 0.15, 0.08);
    b.box(w, 0.5, 0.02, 0.2, [1, 1, 1], s * 0.25, 0, 0, wing);
    m.wings.push(w);
  }
  return m;
}

export function buildCloudray(): Model {
  const b = new Builder(), m = b.m;
  const body: RGB = [0.78, 0.84, 0.98], belly: RGB = [0.96, 0.97, 1.0], tip: RGB = [0.62, 0.7, 0.95];
  const glow = b.glowMat(0xbfe8ff);
  b.box(m.body, 0.6, 0.18, 1.0, body, 0, 0, 0);
  b.box(m.body, 0.5, 0.06, 0.9, belly, 0, -0.1, 0);
  b.box(m.body, 0.08, 0.08, 0.04, [1, 1, 1], 0.16, 0.05, 0.5, glow);
  b.box(m.body, 0.08, 0.08, 0.04, [1, 1, 1], -0.16, 0.05, 0.5, glow);
  b.box(m.body, 0.06, 0.06, 0.8, tip, 0, 0, -0.85);
  for (const sx of [1, -1]) {
    const w = b.pivot(m.body, sx * 0.3, 0, 0);
    b.box(w, 0.9, 0.06, 0.7, body, sx * 0.45, 0, -0.05);
    b.box(w, 0.4, 0.05, 0.4, tip, sx * 0.95, 0, -0.15);
    m.wings.push(w);
  }
  m.head = null;
  return m;
}

export function buildCinderhound(): Model {
  const b = new Builder(), m = b.m;
  const hide: RGB = [0.22, 0.18, 0.18], crack: RGB = [0.35, 0.28, 0.26];
  const ember = b.glowMat(0xff6a20), eye = b.glowMat(0xffe070);
  b.box(m.body, 0.5, 0.45, 1.0, hide, 0, 0.65, 0);
  b.box(m.body, 0.52, 0.08, 0.6, [1, 1, 1], 0, 0.9, 0.05, ember);
  b.box(m.body, 0.1, 0.25, 0.1, [1, 1, 1], 0, 1.0, -0.25, ember);
  b.box(m.body, 0.1, 0.3, 0.1, [1, 1, 1], 0, 1.02, 0.15, ember);
  const head = b.pivot(m.body, 0, 0.8, 0.5);
  b.box(head, 0.42, 0.36, 0.4, crack, 0, 0.05, 0.15);
  b.box(head, 0.3, 0.18, 0.25, hide, 0, -0.05, 0.42);
  b.box(head, 0.08, 0.06, 0.04, [1, 1, 1], 0.12, 0.12, 0.36, eye);
  b.box(head, 0.08, 0.06, 0.04, [1, 1, 1], -0.12, 0.12, 0.36, eye);
  b.box(head, 0.08, 0.16, 0.08, hide, 0.14, 0.3, 0.05);
  b.box(head, 0.08, 0.16, 0.08, hide, -0.14, 0.3, 0.05);
  m.head = head;
  for (const [x, z] of [[0.18, 0.35], [-0.18, 0.35], [0.18, -0.35], [-0.18, -0.35]]) {
    const leg = b.pivot(m.body, x, 0.5, z);
    b.box(leg, 0.14, 0.5, 0.16, hide, 0, -0.25, 0);
    m.legs.push(leg);
  }
  const tail = b.pivot(m.body, 0, 0.75, -0.5);
  b.box(tail, 0.08, 0.08, 0.4, [1, 1, 1], 0, 0.1, -0.2, ember);
  return m;
}

/** The player's avatar (third-person view): a hooded wanderer. */
export function buildAvatar(): Model {
  const b = new Builder(), m = b.m;
  const cloak: RGB = [0.16, 0.42, 0.46], scarf: RGB = [0.92, 0.62, 0.22], skin: RGB = [0.86, 0.68, 0.52], pants: RGB = [0.26, 0.24, 0.3], boots: RGB = [0.36, 0.24, 0.16];
  for (const x of [0.12, -0.12]) {
    const leg = b.pivot(m.body, x, 0.75, 0);
    b.box(leg, 0.22, 0.62, 0.24, pants, 0, -0.31, 0);
    b.box(leg, 0.24, 0.16, 0.28, boots, 0, -0.68, 0.02);
    m.legs.push(leg);
  }
  b.box(m.body, 0.5, 0.66, 0.28, cloak, 0, 1.08, 0);
  b.box(m.body, 0.52, 0.12, 0.3, [0.4, 0.3, 0.2], 0, 0.8, 0);
  b.box(m.body, 0.54, 0.14, 0.32, scarf, 0, 1.36, 0);
  const head = b.pivot(m.body, 0, 1.42, 0);
  b.box(head, 0.4, 0.4, 0.4, skin, 0, 0.2, 0);
  b.box(head, 0.46, 0.2, 0.46, cloak, 0, 0.36, -0.02);
  b.box(head, 0.46, 0.3, 0.1, cloak, 0, 0.18, -0.2);
  b.box(head, 0.07, 0.07, 0.02, [0.1, 0.1, 0.14], 0.09, 0.2, 0.205);
  b.box(head, 0.07, 0.07, 0.02, [0.1, 0.1, 0.14], -0.09, 0.2, 0.205);
  m.head = head;
  for (const x of [0.33, -0.33]) {
    const arm = b.pivot(m.body, x, 1.36, 0);
    b.box(arm, 0.16, 0.6, 0.18, cloak, 0, -0.28, 0);
    b.box(arm, 0.14, 0.12, 0.16, skin, 0, -0.62, 0);
    m.arms.push(arm);
  }
  return m;
}

export function disposeModel(m: Model) {
  m.mat.dispose();
  for (const g of m.glow) g.dispose();
  m.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && m.glow.includes(mesh.material as THREE.MeshBasicMaterial)) mesh.geometry.dispose();
  });
}

export function buildGlowjelly(): Model {
  const b = new Builder(), m = b.m;
  const bell = b.glowMat(0x9ff5ea, 0.75), inner = b.glowMat(0xe2a6ff, 0.9), eye = b.glowMat(0xffffff);
  b.box(m.body, 0.62, 0.36, 0.62, [1, 1, 1], 0, 0.1, 0, bell);
  b.box(m.body, 0.46, 0.14, 0.46, [1, 1, 1], 0, 0.32, 0, bell);
  b.box(m.body, 0.3, 0.2, 0.3, [1, 1, 1], 0, 0.06, 0, inner);
  b.box(m.body, 0.06, 0.06, 0.04, [1, 1, 1], 0.12, 0.12, 0.32, eye);
  b.box(m.body, 0.06, 0.06, 0.04, [1, 1, 1], -0.12, 0.12, 0.32, eye);
  for (const [x, z] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]]) {
    const t = b.pivot(m.body, x, -0.08, z);
    b.box(t, 0.05, 0.5, 0.05, [1, 1, 1], 0, -0.25, 0, inner);
    m.legs.push(t);
  }
  m.head = null;
  return m;
}
