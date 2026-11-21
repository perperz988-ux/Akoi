import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Outfit { skin: number; shirt: number; pants: number; hair: number; shoes?: number; hat?: number; vest?: number }
export const SKINS = [0xf1c9a5, 0xd9a577, 0xb97c50, 0x8a5a3a, 0x5e3b27, 0xe8b894];
export const SHIRTS = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xecf0f1, 0x2c3e50, 0xe67e22, 0x16a085, 0xd35400, 0x7f8c8d];
export const PANTS = [0x2c3e50, 0x34495e, 0x1b1b1f, 0x7b6a4f, 0x4a6fa5, 0x555a60];
export const HAIRS = [0x1a1410, 0x3b2a1a, 0x6b4a2a, 0xc9a24a, 0x9a9a9a, 0x2a1a12];

const geoCache: Record<string, THREE.BufferGeometry> = {};
const limbGeo = (w: number, h: number, d: number) => {
  const k = `${w}_${h}_${d}`;
  if (!geoCache[k]) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, -h / 2, 0); geoCache[k] = g; }
  return geoCache[k];
};
const boxCache = new Map<string, THREE.BufferGeometry>();
const sharedBox = (w: number, h: number, d: number) => { const k = `${w}_${h}_${d}`; let g = boxCache.get(k); if (!g) { g = new THREE.BoxGeometry(w, h, d); boxCache.set(k, g); } return g; };
const lowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const lowCache = new Map<string, THREE.BufferGeometry>();
function lowGeo(o: Outfit) {
  const key = `${o.skin}_${o.shirt}_${o.pants}_${o.hair}`; let g = lowCache.get(key); if (g) return g;
  const parts: THREE.BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) => { const b = new THREE.BoxGeometry(w, h, d).toNonIndexed(); b.translate(x, y, z); b.deleteAttribute('uv'); const col = new THREE.Color(c), n = b.getAttribute('position').count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } b.setAttribute('color', new THREE.BufferAttribute(a, 3)); parts.push(b); };
  add(0.5, 0.58, 0.28, 0, 1.25, 0, o.shirt); add(0.22, 0.25, 0.23, 0, 1.69, 0, o.skin); add(0.24, 0.1, 0.25, 0, 1.8, 0, o.hat ?? o.hair); add(0.17, 0.9, 0.17, -0.12, 0.45, 0, o.pants); add(0.17, 0.9, 0.17, 0.12, 0.45, 0, o.pants); add(0.12, 0.55, 0.12, -0.31, 1.2, 0, o.shirt); add(0.12, 0.55, 0.12, 0.31, 1.2, 0, o.shirt);
  g = mergeGeometries(parts)!; lowCache.set(key, g); return g;
}
const matCache = new Map<number, THREE.MeshStandardMaterial>();
export function cMat(c: number, rough = 0.8) {
  const key = c * 10 + Math.round(rough * 9);
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0.02 }); matCache.set(key, m); }
  return m;
}

export type Pose = 'idle' | 'walk' | 'sit' | 'swim' | 'climb' | 'cover' | 'fallen' | 'aim' | 'drive' | 'handsup' | 'punch' | 'dodge' | 'phone';

/**
 * Procedurally animated low-poly human. Joints are pivots so we can blend walk cycles,
 * punches, aiming and ragdoll-ish collapse without skeletal assets.
 */
export class Humanoid {
  root = new THREE.Group();
  body = new THREE.Group();
  hips = new THREE.Group();
  torso: THREE.Mesh; head: THREE.Mesh;
  armL = new THREE.Group(); armR = new THREE.Group(); legL = new THREE.Group(); legR = new THREE.Group();
  foreL = new THREE.Group(); foreR = new THREE.Group(); shinL = new THREE.Group(); shinR = new THREE.Group();
  weaponSlot = new THREE.Group();
  phase = Math.random() * 6; blend = { walk: 0, aim: 0, sit: 0, fall: 0, swim: 0, climb: 0, hands: 0, punch: 0, phone: 0, cover: 0 };
  punchT = 0; punchHand = 0;
  scale = 1;
  lowMesh: THREE.Mesh; far = false;

  constructor(public outfit: Outfit, scale = 1) {
    this.scale = scale;
    const o = outfit;
    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = 0.95;
    this.torso = new THREE.Mesh(sharedBox(0.46, 0.58, 0.26), cMat(o.shirt));
    this.torso.position.y = 0.3; this.torso.castShadow = true;
    this.hips.add(this.torso);
    if (o.vest) { const v = new THREE.Mesh(sharedBox(0.48, 0.4, 0.28), cMat(o.vest)); v.position.y = 0.34; this.hips.add(v); }
    this.head = new THREE.Mesh(sharedBox(0.22, 0.25, 0.23), cMat(o.skin));
    this.head.position.y = 0.74; this.head.castShadow = true;
    const hair = new THREE.Mesh(sharedBox(0.24, 0.1, 0.25), cMat(o.hat ?? o.hair));
    hair.position.y = 0.1; this.head.add(hair);
    if (o.hat) { const brim = new THREE.Mesh(sharedBox(0.28, 0.02, 0.3), cMat(o.hat)); brim.position.y = 0.05; this.head.add(brim); }
    this.hips.add(this.head);
    const mkArm = (g: THREE.Group, fore: THREE.Group, x: number) => {
      g.position.set(x, 0.55, 0);
      const up = new THREE.Mesh(limbGeo(0.12, 0.3, 0.12), cMat(o.shirt)); up.castShadow = true;
      g.add(up);
      fore.position.y = -0.3; g.add(fore);
      const lo = new THREE.Mesh(limbGeo(0.1, 0.28, 0.1), cMat(o.skin)); fore.add(lo);
      this.hips.add(g);
    };
    mkArm(this.armL, this.foreL, -0.3); mkArm(this.armR, this.foreR, 0.3);
    this.foreR.add(this.weaponSlot); this.weaponSlot.position.set(0, -0.26, 0.04);
    const mkLeg = (g: THREE.Group, shin: THREE.Group, x: number) => {
      g.position.set(x, 0, 0);
      const up = new THREE.Mesh(limbGeo(0.17, 0.46, 0.17), cMat(o.pants)); up.castShadow = true;
      g.add(up);
      shin.position.y = -0.46; g.add(shin);
      const lo = new THREE.Mesh(limbGeo(0.15, 0.46, 0.15), cMat(o.pants)); shin.add(lo);
      const shoe = new THREE.Mesh(sharedBox(0.16, 0.08, 0.26), cMat(o.shoes ?? 0x222222)); shoe.position.set(0, -0.46, 0.04); shin.add(shoe);
      this.hips.add(g);
    };
    mkLeg(this.legL, this.shinL, -0.12); mkLeg(this.legR, this.shinR, 0.12);
    this.lowMesh = new THREE.Mesh(lowGeo(o), lowMat); this.lowMesh.visible = false; this.root.add(this.lowMesh);
    this.root.scale.setScalar(scale);
  }

  /** Switch between the animated rig and a single-draw-call silhouette for distant NPCs. */
  setFar(far: boolean) {
    if (far === this.far) return; this.far = far;
    this.body.visible = !far; this.lowMesh.visible = far;
  }

  setOutfit(o: Outfit) {
    this.outfit = o;
    this.torso.material = cMat(o.shirt);
  }

  /** Drive the animation.  speed = m/s horizontal, flags drive the pose blend targets. */
  animate(dt: number, speed: number, pose: Pose, extra: { crouch?: boolean; aimPitch?: number; sprint?: boolean } = {}) {
    if (this.far) { this.lowMesh.rotation.x = pose === 'fallen' ? -Math.PI / 2 : 0; this.lowMesh.position.y = pose === 'fallen' ? 0.2 : 0; return; }
    const b = this.blend;
    const k = (v: number, t: number, r = 10) => v + (t - v) * (1 - Math.exp(-r * dt));
    const walking = pose === 'walk' || pose === 'idle' || pose === 'aim' || pose === 'punch' || pose === 'dodge';
    b.walk = k(b.walk, walking ? Math.min(1, speed / 3) : 0);
    b.aim = k(b.aim, pose === 'aim' ? 1 : 0, 14);
    b.sit = k(b.sit, pose === 'sit' || pose === 'drive' ? 1 : 0, 12);
    b.fall = k(b.fall, pose === 'fallen' ? 1 : 0, 9);
    b.swim = k(b.swim, pose === 'swim' ? 1 : 0, 7);
    b.climb = k(b.climb, pose === 'climb' ? 1 : 0, 12);
    b.hands = k(b.hands, pose === 'handsup' ? 1 : 0, 10);
    b.phone = k(b.phone, pose === 'phone' ? 1 : 0, 10);
    b.cover = k(b.cover, pose === 'cover' ? 1 : 0, 12);
    if (pose === 'punch' && this.punchT <= 0) { this.punchT = 0.32; this.punchHand ^= 1; }
    this.punchT = Math.max(0, this.punchT - dt);
    const sp = Math.min(speed, 9);
    this.phase += dt * (3 + sp * 1.5) * (b.walk > 0.05 ? 1 : 0);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const amp = b.walk * Math.min(1, 0.35 + sp / 5) * (1 - b.sit) * (1 - b.fall) * (1 - b.swim);
    const run = Math.min(1, Math.max(0, (sp - 2.5) / 4));
    const crouch = extra.crouch || b.cover > 0.3 ? 1 : 0;
    // legs
    const swing = 0.75 * amp * (0.7 + run * 0.6);
    this.legL.rotation.x = s * swing; this.legR.rotation.x = -s * swing;
    this.shinL.rotation.x = Math.max(0, -s) * 1.0 * amp * (0.5 + run); this.shinR.rotation.x = Math.max(0, s) * 1.0 * amp * (0.5 + run);
    // arms
    const aSw = 0.8 * amp * (0.6 + run * 0.7);
    this.armL.rotation.x = -s * aSw; this.armR.rotation.x = s * aSw;
    this.foreL.rotation.x = -0.2 - run * 0.9 * amp; this.foreR.rotation.x = -0.2 - run * 0.9 * amp;
    this.armL.rotation.z = -0.08; this.armR.rotation.z = 0.08;
    this.hips.rotation.set(run * 0.18 * amp, 0, 0);
    this.hips.position.y = 0.95 + Math.abs(c) * 0.035 * amp - crouch * 0.28 - b.sit * 0.45;
    this.body.rotation.set(0, 0, 0); this.body.position.set(0, 0, 0);
    this.legL.position.y = this.legR.position.y = 0;
    // crouch bends legs
    if (crouch) { this.legL.rotation.x -= 0.9; this.legR.rotation.x -= 0.9; this.shinL.rotation.x += 1.5; this.shinR.rotation.x += 1.5; this.hips.rotation.x += 0.25; }
    // sit: thighs forward
    if (b.sit > 0.01) {
      this.legL.rotation.x = lerp(this.legL.rotation.x, -1.45, b.sit); this.legR.rotation.x = lerp(this.legR.rotation.x, -1.45, b.sit);
      this.shinL.rotation.x = lerp(this.shinL.rotation.x, 1.4, b.sit); this.shinR.rotation.x = lerp(this.shinR.rotation.x, 1.4, b.sit);
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.2, b.sit); this.armR.rotation.x = lerp(this.armR.rotation.x, -1.2, b.sit);
      this.foreL.rotation.x = lerp(this.foreL.rotation.x, -0.4, b.sit); this.foreR.rotation.x = lerp(this.foreR.rotation.x, -0.4, b.sit);
    }
    // aim: right arm raised, left supporting
    if (b.aim > 0.01) {
      const pitch = -(extra.aimPitch ?? 0);
      this.armR.rotation.x = lerp(this.armR.rotation.x, -1.5 + pitch, b.aim); this.foreR.rotation.x = lerp(this.foreR.rotation.x, -0.05, b.aim);
      this.armL.rotation.x = lerp(this.armL.rotation.x, -1.3 + pitch, b.aim); this.armL.rotation.z = lerp(this.armL.rotation.z, 0.5, b.aim); this.foreL.rotation.x = lerp(this.foreL.rotation.x, -0.6, b.aim);
    }
    if (b.phone > 0.01) { this.armR.rotation.x = lerp(this.armR.rotation.x, -1.9, b.phone); this.foreR.rotation.x = lerp(this.foreR.rotation.x, -1.0, b.phone); }
    if (b.hands > 0.01) { this.armL.rotation.x = lerp(this.armL.rotation.x, -3.0, b.hands); this.armR.rotation.x = lerp(this.armR.rotation.x, -3.0, b.hands); this.armL.rotation.z = lerp(this.armL.rotation.z, -0.3, b.hands); this.armR.rotation.z = lerp(this.armR.rotation.z, 0.3, b.hands); }
    // punch
    if (this.punchT > 0) {
      const t = 1 - this.punchT / 0.32, ext = Math.sin(Math.min(1, t * 1.4) * Math.PI);
      const arm = this.punchHand ? this.armR : this.armL, fore = this.punchHand ? this.foreR : this.foreL;
      arm.rotation.x = -1.6 * ext; fore.rotation.x = -0.1 * ext; this.hips.rotation.y = (this.punchHand ? -1 : 1) * 0.5 * ext;
    }
    // swim
    if (b.swim > 0.01) {
      this.body.rotation.x = lerp(0, 1.2, b.swim); this.hips.position.y = lerp(this.hips.position.y, 0.5, b.swim);
      this.armL.rotation.x = lerp(this.armL.rotation.x, -2.4 + Math.sin(this.phase * 0.9) * 1.2, b.swim); this.armR.rotation.x = lerp(this.armR.rotation.x, -2.4 - Math.sin(this.phase * 0.9) * 1.2, b.swim);
      this.legL.rotation.x = lerp(this.legL.rotation.x, Math.sin(this.phase * 2) * 0.5, b.swim); this.legR.rotation.x = lerp(this.legR.rotation.x, -Math.sin(this.phase * 2) * 0.5, b.swim);
      this.phase += dt * 3 * b.swim;
    }
    if (b.climb > 0.01) {
      const cs = Math.sin(this.phase * 0.9);
      this.armL.rotation.x = lerp(this.armL.rotation.x, -2.6 + cs * 0.4, b.climb); this.armR.rotation.x = lerp(this.armR.rotation.x, -2.6 - cs * 0.4, b.climb);
      this.legL.rotation.x = lerp(this.legL.rotation.x, -0.9 - cs * 0.4, b.climb); this.legR.rotation.x = lerp(this.legR.rotation.x, -0.9 + cs * 0.4, b.climb);
      this.phase += dt * 6 * b.climb;
    }
    // fallen: rotate whole body to lie down
    if (b.fall > 0.01) { this.body.rotation.x = lerp(0, -Math.PI / 2, b.fall); this.body.position.y = lerp(0, 0.18, b.fall); this.armL.rotation.z = lerp(this.armL.rotation.z, -0.8, b.fall); this.armR.rotation.z = lerp(this.armR.rotation.z, 0.8, b.fall); }
    this.head.rotation.x = 0;
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Simple fictional weapon visuals. */
export function weaponMesh(kind: string): THREE.Object3D {
  const g = new THREE.Group();
  const dark = cMat(0x1e2126, 0.5), accent = cMat(0x6b7280, 0.4);
  const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  switch (kind) {
    case 'pistol': box(0.04, 0.07, 0.22, dark, 0, 0, 0.1); box(0.045, 0.1, 0.05, dark, 0, -0.06, 0.03); break;
    case 'smg': box(0.05, 0.09, 0.34, dark, 0, 0, 0.16); box(0.04, 0.16, 0.05, accent, 0, -0.1, 0.12); break;
    case 'shotgun': box(0.05, 0.07, 0.62, dark, 0, 0, 0.3); box(0.06, 0.08, 0.2, cMat(0x5a3a22), 0, -0.01, -0.08); break;
    case 'rifle': box(0.05, 0.09, 0.62, dark, 0, 0, 0.3); box(0.04, 0.14, 0.05, accent, 0, -0.1, 0.2); box(0.06, 0.07, 0.18, accent, 0, 0.02, -0.12); break;
    case 'bat': box(0.06, 0.06, 0.7, cMat(0xa87a4a), 0, 0, 0.3); break;
    case 'taser': box(0.05, 0.08, 0.2, cMat(0xe8c020), 0, 0, 0.1); box(0.02, 0.02, 0.08, cMat(0x3aa0ff), 0, 0.03, 0.22); break;
    case 'grenade': box(0.08, 0.1, 0.08, cMat(0x3a4a2a), 0, 0, 0.05); break;
    default: break;
  }
  return g;
}
