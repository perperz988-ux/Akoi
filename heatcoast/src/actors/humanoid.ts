import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, damp, lerp } from '../core/math';

/**
 * Procedurally built, rigidly-skinned human: ONE SkinnedMesh (one draw call) per character, rounded
 * capsule anatomy, clothing colours baked into vertex colours, and a procedural animation system that
 * blends idle / walk / run / sprint / jump / drive / aim / punch / cower / swim / talk / death poses.
 * Hero characters additionally get faces (eyes that blink and track targets, brows, lips that move with
 * speech) and spring-simulated hair.
 */
export interface Look {
  skin: number; top: number; bottom: number; shoes: number; hair: number; hairStyle: 'short' | 'buzz' | 'bun' | 'ponytail' | 'long' | 'curly' | 'bald' | 'cap';
  female?: boolean; build?: number; height?: number; jacket?: number; hat?: number; vest?: number; eyes?: number; beard?: boolean;
}
const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'armL', 'foreL', 'handL', 'shR', 'armR', 'foreR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] as const;
type BoneName = typeof BONES[number];
const PARENT: Record<BoneName, BoneName | null> = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', shL: 'chest', armL: 'shL', foreL: 'armL', handL: 'foreL', shR: 'chest', armR: 'shR', foreR: 'armR', handR: 'foreR', thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR' };

export type Pose = 'idle' | 'walk' | 'drive' | 'passenger' | 'aim' | 'cower' | 'swim' | 'dead' | 'sit' | 'phone' | 'fall' | 'dance';

const geoCache = new Map<string, THREE.BufferGeometry>();
function capsule(r: number, len: number, seg = 7): THREE.BufferGeometry { seg = Math.max(5, Math.round(seg * SEGQ)); const k = `c${r}_${len}_${seg}`; let g = geoCache.get(k); if (!g) { g = new THREE.CapsuleGeometry(r, len, 3, seg); geoCache.set(k, g); } return g; }
let SEGQ = 1;
function sphere(r: number, w = 10, h = 8) { w = Math.max(6, Math.round(w * SEGQ)); h = Math.max(4, Math.round(h * SEGQ)); const k = `s${r}_${w}_${h}`; let g = geoCache.get(k); if (!g) { g = new THREE.SphereGeometry(r, w, h); geoCache.set(k, g); } return g; }

const skinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });
const detailMats = new Map<number, THREE.MeshStandardMaterial>();
const dmat = (c: number, r = 0.5, m = 0) => { const k = c * 7 + Math.round(r * 5) + m; let x = detailMats.get(k); if (!x) { x = new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }); detailMats.set(k, x); } return x; };

export class Humanoid {
  root = new THREE.Group();
  mesh: THREE.SkinnedMesh;
  bones = {} as Record<BoneName, THREE.Bone>;
  rest = {} as Record<BoneName, THREE.Vector3>;
  handR!: THREE.Group; handL!: THREE.Group; headSlot!: THREE.Group;
  // animation state
  phase = Math.random() * 6; w = { walk: 0, run: 0, aim: 0, sit: 0, dead: 0, cower: 0, swim: 0, air: 0, phone: 0, dance: 0, crouch: 0 };
  punchT = 0; punchSide = 1; talk = 0; blinkT = 2; lookAt: THREE.Vector3 | null = null; deadSide = 1; recoil = 0; reloadT = 0;
  private eyes: THREE.Object3D[] = []; private lids: THREE.Mesh[] = []; private mouth: THREE.Mesh | null = null; private brows: THREE.Mesh[] = [];
  private hairChain: { obj: THREE.Object3D; vel: THREE.Vector2; ang: THREE.Vector2 }[] = [];
  private headWorldPrev = new THREE.Vector3();
  hero: boolean; look: Look; height: number;

  constructor(look: Look, hero = false) {
    this.look = look; this.hero = hero; SEGQ = hero ? 1.4 : 0.6;
    const H = (look.height ?? (look.female ? 1.68 : 1.8)), s = H / 1.8, b = look.build ?? 1, fem = !!look.female;
    this.height = H;
    // bind-pose joint positions (metres)
    const J: Record<BoneName, [number, number, number]> = {
      hips: [0, 0.98 * s, 0], spine: [0, 1.1 * s, 0], chest: [0, 1.3 * s, 0], neck: [0, 1.5 * s, 0], head: [0, 1.6 * s, 0],
      shL: [0.08 * s, 1.44 * s, 0], armL: [(fem ? 0.18 : 0.2) * s * b, 1.43 * s, 0], foreL: [(fem ? 0.18 : 0.2) * s * b, 1.15 * s, 0], handL: [(fem ? 0.18 : 0.2) * s * b, 0.9 * s, 0.01],
      shR: [-0.08 * s, 1.44 * s, 0], armR: [-(fem ? 0.18 : 0.2) * s * b, 1.43 * s, 0], foreR: [-(fem ? 0.18 : 0.2) * s * b, 1.15 * s, 0], handR: [-(fem ? 0.18 : 0.2) * s * b, 0.9 * s, 0.01],
      thighL: [0.095 * s, 0.94 * s, 0], shinL: [0.095 * s, 0.52 * s, 0.01], footL: [0.095 * s, 0.08 * s, 0], thighR: [-0.095 * s, 0.94 * s, 0], shinR: [-0.095 * s, 0.52 * s, 0.01], footR: [-0.095 * s, 0.08 * s, 0],
    };
    const bones: THREE.Bone[] = [];
    for (const n of BONES) {
      const bn = new THREE.Bone(); bn.name = n; const p = PARENT[n]; const wp = new THREE.Vector3(...J[n]);
      if (p) { const pp = new THREE.Vector3(...J[p]); bn.position.copy(wp.sub(pp)); this.bones[p].add(bn); } else bn.position.copy(wp);
      this.bones[n] = bn; this.rest[n] = bn.position.clone(); bones.push(bn);
    }
    // ---- body parts (bind pose, world space), each rigidly weighted to a bone
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, bone: BoneName, color: number, m: THREE.Matrix4) => {
      let gg = g.index ? g.toNonIndexed() : g.clone(); gg.deleteAttribute('uv'); gg.applyMatrix4(m);
      const n = gg.getAttribute('position').count, col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), c = new THREE.Color(color), bi = BONES.indexOf(bone);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; si[i * 4] = bi; sw[i * 4] = 1; }
      gg.setAttribute('color', new THREE.BufferAttribute(col, 3)); gg.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); gg.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      parts.push(gg);
    };
    const M = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz));
    const top = look.jacket ?? look.top, skin = look.skin;
    // torso: chest + waist + hips (smooth stacked ellipsoids)
    add(sphere(1, 14, 10), 'chest', top, M(0, 1.33 * s, 0, (fem ? 0.17 : 0.2) * s * b, 0.2 * s, (fem ? 0.115 : 0.125) * s * b));
    if (fem) add(sphere(1, 12, 8), 'chest', look.top, M(0, 1.3 * s, 0.06 * s, 0.14 * s, 0.08 * s, 0.08 * s));
    add(sphere(1, 14, 10), 'spine', look.top, M(0, 1.14 * s, 0, (fem ? 0.135 : 0.16) * s * b, 0.15 * s, 0.11 * s * b));
    add(sphere(1, 14, 10), 'hips', look.bottom, M(0, 0.97 * s, 0, (fem ? 0.165 : 0.155) * s * b, 0.12 * s, 0.115 * s * b));
    if (look.vest) add(sphere(1, 12, 8), 'chest', look.vest, M(0, 1.28 * s, 0, 0.215 * s * b, 0.21 * s, 0.14 * s * b));
    if (look.jacket) { add(capsule(0.03 * s, 0.32 * s), 'chest', look.jacket, M(0.07 * s, 1.3 * s, 0.11 * s, 1, 1, 1, 0, 0.1)); add(capsule(0.03 * s, 0.32 * s), 'chest', look.jacket, M(-0.07 * s, 1.3 * s, 0.11 * s, 1, 1, 1, 0, -0.1)); add(sphere(1, 10, 6), 'chest', look.top, M(0, 1.34 * s, 0.1 * s, 0.06 * s, 0.13 * s, 0.03 * s)); }
    // shoulders
    for (const sd of [1, -1]) add(sphere(1, 10, 8), sd > 0 ? 'shL' : 'shR', top, M(sd * 0.165 * s * b, 1.42 * s, 0, 0.075 * s * b, 0.065 * s, 0.075 * s * b));
    // neck & head
    add(capsule(0.05 * s, 0.07 * s), 'neck', skin, M(0, 1.53 * s, 0));
    add(sphere(1, 16, 12), 'head', skin, M(0, 1.7 * s, 0.005, (fem ? 0.085 : 0.09) * s, 0.115 * s, 0.1 * s));
    add(sphere(1, 10, 8), 'head', skin, M(0, 1.64 * s, 0.03 * s, 0.07 * s, 0.06 * s, 0.075 * s)); // jaw
    add(sphere(1, 6, 5), 'head', skin, M(0, 1.69 * s, 0.1 * s, 0.017 * s, 0.03 * s, 0.022 * s)); // nose
    for (const sd of [1, -1]) add(sphere(1, 6, 5), 'head', skin, M(sd * 0.088 * s, 1.69 * s, 0, 0.015 * s, 0.03 * s, 0.02 * s)); // ears
    if (look.beard) add(sphere(1, 10, 8), 'head', look.hair, M(0, 1.62 * s, 0.045 * s, 0.075 * s, 0.05 * s, 0.07 * s));
    // hair (base cap baked; dynamic strands added below for heroes)
    const hs = look.hairStyle;
    if (hs !== 'bald' && hs !== 'buzz') add(sphere(1, 14, 10), 'head', look.hair, M(0, 1.745 * s, -0.005 * s, 0.094 * s, (hs === 'curly' ? 0.1 : 0.085) * s, 0.106 * s));
    if (hs === 'buzz') add(sphere(1, 14, 10), 'head', look.hair, M(0, 1.735 * s, -0.004 * s, 0.092 * s, 0.08 * s, 0.103 * s));
    if (hs === 'long') add(sphere(1, 10, 8), 'head', look.hair, M(0, 1.62 * s, -0.06 * s, 0.1 * s, 0.17 * s, 0.06 * s));
    if (hs === 'cap' || look.hat) { const hc = look.hat ?? 0x222222; add(sphere(1, 14, 8), 'head', hc, M(0, 1.77 * s, 0, 0.098 * s, 0.065 * s, 0.108 * s)); add(new THREE.CylinderGeometry(0.075 * s, 0.075 * s, 0.012, 12), 'head', hc, M(0, 1.765 * s, 0.1 * s, 1, 1, 1.3)); }
    // arms (upper sleeve = top colour; forearm skin or sleeve)
    const longSleeve = !!look.jacket;
    for (const sd of [1, -1]) {
      const L = sd > 0 ? 'L' : 'R'; const x = sd * (fem ? 0.18 : 0.2) * s * b;
      add(capsule(0.052 * s * b, 0.2 * s), ('arm' + L) as BoneName, top, M(x, 1.29 * s, 0));
      add(capsule(0.042 * s * b, 0.19 * s), ('fore' + L) as BoneName, longSleeve ? top : skin, M(x, 1.03 * s, 0));
      add(sphere(1, 8, 6), ('hand' + L) as BoneName, skin, M(x, 0.86 * s, 0.01, 0.035 * s, 0.06 * s, 0.022 * s));
      add(capsule(0.012 * s, 0.03 * s), ('hand' + L) as BoneName, skin, M(x - sd * 0.0, 0.88 * s, 0.035 * s, 1, 1, 1, 0.6)); // thumb
      // legs
      const lx = sd * 0.095 * s;
      add(capsule(0.075 * s * b, 0.3 * s), ('thigh' + L) as BoneName, look.bottom, M(lx, 0.73 * s, 0));
      add(capsule(0.058 * s * b, 0.32 * s), ('shin' + L) as BoneName, look.bottom, M(lx, 0.31 * s, 0));
      add(sphere(1, 10, 8), ('foot' + L) as BoneName, look.shoes, M(lx, 0.05 * s, 0.05 * s, 0.055 * s, 0.045 * s, 0.13 * s));
    }
    const geo = mergeGeometries(parts)!; geo.computeVertexNormals();
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.3);
    this.mesh = new THREE.SkinnedMesh(geo, skinMat);
    this.mesh.add(this.bones.hips);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(bones));
    this.mesh.castShadow = true; this.mesh.frustumCulled = true;
    this.root.add(this.mesh);
    // weapon & attachment slots
    this.handR = new THREE.Group(); this.handR.position.set(0, -0.05, 0.03); this.bones.handR.add(this.handR);
    this.handL = new THREE.Group(); this.handL.position.set(0, -0.05, 0.03); this.bones.handL.add(this.handL);
    this.headSlot = new THREE.Group(); this.bones.head.add(this.headSlot);
    if (hero) this.buildFace(s);
    SEGQ = 1;
  }

  private buildFace(s: number) {
    const hb = this.bones.head; const hy = (1.7 - 1.6) * s; // head bone local y offset of the head centre
    const eyeWhite = dmat(0xf2eee8, 0.25), iris = dmat(this.look.eyes ?? 0x4a3020, 0.2), lid = dmat(this.look.skin, 0.6);
    for (const sd of [1, -1]) {
      const e = new THREE.Group(); e.position.set(sd * 0.032 * s, hy + 0.012 * s, 0.082 * s); hb.add(e);
      const ball = new THREE.Mesh(sphere(0.016 * s, 10, 8), eyeWhite); e.add(ball);
      const ir = new THREE.Mesh(sphere(0.0085 * s, 8, 6), iris); ir.position.z = 0.0105 * s; ir.scale.z = 0.5; e.add(ir);
      const pu = new THREE.Mesh(sphere(0.004 * s, 6, 4), dmat(0x050505, 0.1)); pu.position.z = 0.0145 * s; pu.scale.z = 0.4; e.add(pu);
      this.eyes.push(e);
      const l = new THREE.Mesh(sphere(0.0175 * s, 10, 6), lid); l.position.copy(e.position); l.scale.set(1.05, 0.05, 1.05); l.position.y += 0.002; hb.add(l); this.lids.push(l);
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.03 * s, 0.006 * s, 0.01 * s), dmat(this.look.hair, 0.8)); br.position.set(sd * 0.033 * s, hy + 0.036 * s, 0.093 * s); br.rotation.z = sd * -0.12; hb.add(br); this.brows.push(br);
    }
    this.mouth = new THREE.Mesh(sphere(0.02 * s, 10, 6), dmat(this.look.female ? 0xa8505a : 0x8a5048, 0.45)); this.mouth.position.set(0, hy - 0.045 * s, 0.088 * s); this.mouth.scale.set(1.1, 0.22, 0.4); hb.add(this.mouth);
    // spring hair
    const hs = this.look.hairStyle, hm = dmat(this.look.hair, 0.55);
    if (hs === 'ponytail' || hs === 'bun' || hs === 'long' || hs === 'curly') {
      let parent: THREE.Object3D = hb; const n = hs === 'ponytail' ? 4 : hs === 'long' ? 3 : 1;
      const base = new THREE.Group(); base.position.set(0, hy + (hs === 'bun' ? 0.11 : 0.06) * s, -0.09 * s); hb.add(base); parent = base;
      for (let i = 0; i < n; i++) {
        const seg = new THREE.Group(); if (i > 0) seg.position.y = -0.075 * s; parent.add(seg);
        const r = hs === 'bun' ? 0.05 : hs === 'curly' ? 0.075 : hs === 'long' ? 0.06 - i * 0.008 : 0.032 - i * 0.004;
        const m = new THREE.Mesh(sphere(r * s, 10, 8), hm); m.position.y = hs === 'bun' ? 0 : -0.035 * s; m.scale.set(hs === 'long' ? 1.6 : 1, hs === 'bun' || hs === 'curly' ? 0.9 : 1.5, 1); m.castShadow = true; seg.add(m);
        this.hairChain.push({ obj: seg, vel: new THREE.Vector2(), ang: new THREE.Vector2() }); parent = seg;
      }
    }
  }

  setLook(look: Look) { /* outfits are rebuilt by the owner (new Humanoid) */ void look; }

  /**
   * speed m/s, pose; extra: aimPitch (rad), turn (yaw rate), crouch, onGround.
   */
  animate(dt: number, speed: number, pose: Pose, ex: { aimPitch?: number; turn?: number; crouch?: boolean; air?: boolean; twoHand?: boolean; steer?: number } = {}) {
    const w = this.w, B = this.bones;
    const tgt = (p: Pose) => (pose === p ? 1 : 0);
    const moving = pose === 'walk' || pose === 'aim' || pose === 'idle' || pose === 'phone';
    w.walk = damp(w.walk, moving ? clamp(speed / 1.6, 0, 1) : 0, 10, dt);
    w.run = damp(w.run, moving ? clamp((speed - 2.2) / 3.5, 0, 1) : 0, 8, dt);
    w.aim = damp(w.aim, tgt('aim'), 14, dt); w.sit = damp(w.sit, pose === 'drive' || pose === 'passenger' || pose === 'sit' ? 1 : 0, 12, dt);
    w.dead = damp(w.dead, tgt('dead'), 7, dt); w.cower = damp(w.cower, tgt('cower'), 8, dt); w.swim = damp(w.swim, tgt('swim'), 6, dt);
    w.air = damp(w.air, ex.air ? 1 : 0, 10, dt); w.phone = damp(w.phone, tgt('phone'), 9, dt); w.dance = damp(w.dance, tgt('dance'), 4, dt); w.crouch = damp(w.crouch, ex.crouch ? 1 : 0, 10, dt);
    // reset to rest
    for (const n of BONES) { B[n].position.copy(this.rest[n]); B[n].rotation.set(0, 0, 0); }
    const cadence = lerp(1.7, 2.9, w.run) * (0.55 + clamp(speed / 6, 0, 1.0));
    this.phase += dt * cadence * Math.PI * (w.walk > 0.02 ? 1 : 0);
    const ph = this.phase, s = Math.sin(ph), c = Math.cos(ph);
    const g = w.walk * (1 - w.sit) * (1 - w.dead) * (1 - w.swim);
    const stride = lerp(0.45, 0.95, w.run) * g;
    // legs: thigh swing, knee bends in the swing phase, ankle
    B.thighL.rotation.x = -s * stride; B.thighR.rotation.x = s * stride;
    B.shinL.rotation.x = Math.max(0, c) * lerp(0.55, 1.5, w.run) * g + 0.05; B.shinR.rotation.x = Math.max(0, -c) * lerp(0.55, 1.5, w.run) * g + 0.05;
    B.footL.rotation.x = -B.shinL.rotation.x * 0.3 + s * 0.15 * g; B.footR.rotation.x = -B.shinR.rotation.x * 0.3 - s * 0.15 * g;
    // pelvis bob, sway, counter-rotation of chest
    B.hips.position.y += -Math.abs(c) * lerp(0.025, 0.06, w.run) * g + lerp(0, 0.025, w.run) * g;
    B.hips.rotation.y = s * 0.12 * g; B.chest.rotation.y = -s * 0.2 * g; B.hips.rotation.z = c * 0.04 * g * (1 - w.run);
    B.spine.rotation.x = w.run * 0.22 * g; B.neck.rotation.x = -w.run * 0.12 * g;
    // arms swing opposite to legs, elbows bend more when running
    const armSw = lerp(0.35, 1.0, w.run) * g;
    B.armL.rotation.x = s * armSw; B.armR.rotation.x = -s * armSw;
    B.foreL.rotation.x = -lerp(0.15, 1.35, w.run) * Math.max(g, 0.25) - 0.1; B.foreR.rotation.x = -lerp(0.15, 1.35, w.run) * Math.max(g, 0.25) - 0.1;
    B.armL.rotation.z = -0.08 - w.run * 0.1; B.armR.rotation.z = 0.08 + w.run * 0.1;
    // idle breathing & weight shift
    const br = Math.sin(performance.now() * 0.0019 + this.phase * 0.1) * (1 - g);
    B.chest.rotation.x += br * 0.02; B.shL.position.y += br * 0.004; B.shR.position.y += br * 0.004;
    B.hips.rotation.z += Math.sin(performance.now() * 0.0005) * 0.02 * (1 - g);
    // lean into turns
    B.hips.rotation.z += clamp((ex.turn ?? 0) * 0.04 * speed, -0.25, 0.25) * (1 - w.sit);
    // crouch
    if (w.crouch > 0.01) { const k = w.crouch; B.hips.position.y -= 0.35 * k; B.thighL.rotation.x -= 1.1 * k; B.thighR.rotation.x -= 1.1 * k; B.shinL.rotation.x += 1.8 * k; B.shinR.rotation.x += 1.8 * k; B.footL.rotation.x -= 0.7 * k; B.footR.rotation.x -= 0.7 * k; B.spine.rotation.x += 0.35 * k; }
    // airborne
    if (w.air > 0.01) { const k = w.air; B.thighL.rotation.x = lerp(B.thighL.rotation.x, -0.7, k); B.shinL.rotation.x = lerp(B.shinL.rotation.x, 1.1, k); B.thighR.rotation.x = lerp(B.thighR.rotation.x, 0.15, k); B.shinR.rotation.x = lerp(B.shinR.rotation.x, 0.5, k); B.armL.rotation.z = lerp(B.armL.rotation.z, -0.9, k); B.armR.rotation.z = lerp(B.armR.rotation.z, 0.9, k); }
    // seated (driving / passenger)
    if (w.sit > 0.01) {
      const k = w.sit; B.hips.position.y = lerp(B.hips.position.y, this.rest.hips.y - 0.45, k);
      for (const t of [B.thighL, B.thighR]) t.rotation.x = lerp(t.rotation.x, -1.5, k);
      for (const t of [B.shinL, B.shinR]) t.rotation.x = lerp(t.rotation.x, 1.35, k);
      B.spine.rotation.x = lerp(B.spine.rotation.x, -0.12, k);
      if (pose === 'drive') { const st = (ex.steer ?? 0) * 0.5; B.armL.rotation.x = lerp(B.armL.rotation.x, -1.05 + st, k); B.armR.rotation.x = lerp(B.armR.rotation.x, -1.05 - st, k); B.foreL.rotation.x = lerp(B.foreL.rotation.x, -0.5, k); B.foreR.rotation.x = lerp(B.foreR.rotation.x, -0.5, k); B.armL.rotation.z = -0.25; B.armR.rotation.z = 0.25; }
      else { B.armL.rotation.x = lerp(B.armL.rotation.x, -0.5, k); B.armR.rotation.x = lerp(B.armR.rotation.x, -0.5, k); B.foreL.rotation.x = -0.9 * k; B.foreR.rotation.x = -0.9 * k; }
    }
    // aiming: right arm extended along aim pitch, left arm supports for two-handed weapons
    if (w.aim > 0.01) {
      const k = w.aim, p = -(ex.aimPitch ?? 0), two = ex.twoHand ?? true;
      B.chest.rotation.y = lerp(B.chest.rotation.y, two ? 0.35 : 0.2, k); B.spine.rotation.x = lerp(B.spine.rotation.x, p * 0.3, k);
      B.armR.rotation.x = lerp(B.armR.rotation.x, -1.5 + p * 0.7 - this.recoil * 0.25, k); B.armR.rotation.z = lerp(B.armR.rotation.z, -0.25, k); B.foreR.rotation.x = lerp(B.foreR.rotation.x, -0.05 - this.recoil * 0.3, k);
      B.armL.rotation.x = lerp(B.armL.rotation.x, two ? -1.35 + p * 0.7 : 0, k); B.armL.rotation.z = lerp(B.armL.rotation.z, two ? 0.75 : -0.1, k); B.foreL.rotation.x = lerp(B.foreL.rotation.x, two ? -0.75 : -0.1, k);
      B.head.rotation.y = lerp(0, -0.3, k);
    }
    this.recoil = Math.max(0, this.recoil - dt * 9);
    if (this.reloadT > 0) { this.reloadT -= dt; const r = Math.sin(clamp(this.reloadT, 0, 1) * Math.PI); B.armL.rotation.x -= r * 0.8; B.foreL.rotation.x -= r * 0.9; B.armR.rotation.x = lerp(B.armR.rotation.x, -0.7, r); B.head.rotation.x += r * 0.35; }
    // phone held up
    if (w.phone > 0.01) { const k = w.phone; B.armR.rotation.x = lerp(B.armR.rotation.x, -1.0, k); B.foreR.rotation.x = lerp(B.foreR.rotation.x, -1.6, k); B.armR.rotation.z = lerp(B.armR.rotation.z, -0.35, k); B.head.rotation.x += 0.3 * k; }
    // punching
    if (this.punchT > 0) {
      this.punchT -= dt; const t = 1 - this.punchT / 0.38, e = Math.sin(clamp(t * 1.3, 0, 1) * Math.PI);
      const arm = this.punchSide > 0 ? B.armR : B.armL, fore = this.punchSide > 0 ? B.foreR : B.foreL;
      arm.rotation.x = lerp(arm.rotation.x, -1.55, e); fore.rotation.x = lerp(-1.9, -0.05, e); arm.rotation.z = this.punchSide * -0.1;
      B.chest.rotation.y += this.punchSide * -0.55 * e; B.hips.rotation.y += this.punchSide * -0.2 * e;
    }
    // cower / hands up
    if (w.cower > 0.01) { const k = w.cower; B.armL.rotation.x = lerp(B.armL.rotation.x, -2.7, k); B.armR.rotation.x = lerp(B.armR.rotation.x, -2.7, k); B.foreL.rotation.x = lerp(B.foreL.rotation.x, -0.6, k); B.foreR.rotation.x = lerp(B.foreR.rotation.x, -0.6, k); B.spine.rotation.x += 0.25 * k; B.hips.position.y -= 0.15 * k; }
    // dancing (club)
    if (w.dance > 0.01) { const k = w.dance, t = performance.now() * 0.006 + this.phase; B.hips.position.y += Math.abs(Math.sin(t)) * 0.06 * k; B.hips.rotation.y += Math.sin(t * 0.5) * 0.4 * k; B.armL.rotation.x = lerp(B.armL.rotation.x, -1.8 + Math.sin(t) * 0.8, k); B.armR.rotation.x = lerp(B.armR.rotation.x, -1.8 - Math.sin(t) * 0.8, k); B.foreL.rotation.x = -1.2 * k; B.foreR.rotation.x = -1.2 * k; B.head.rotation.x = Math.sin(t * 2) * 0.15 * k; }
    // swimming
    if (w.swim > 0.01) { const k = w.swim, t = performance.now() * 0.004; B.hips.rotation.x = lerp(0, 1.25, k); B.hips.position.y = lerp(B.hips.position.y, 0.25, k); B.armL.rotation.x = lerp(B.armL.rotation.x, -3 + Math.sin(t) * 1.4, k); B.armR.rotation.x = lerp(B.armR.rotation.x, -3 - Math.sin(t) * 1.4, k); B.thighL.rotation.x = Math.sin(t * 2) * 0.4 * k; B.thighR.rotation.x = -Math.sin(t * 2) * 0.4 * k; B.neck.rotation.x = -0.9 * k; }
    // death / ragdoll-lite collapse
    if (w.dead > 0.01) {
      const k = w.dead; B.hips.rotation.x = lerp(B.hips.rotation.x, -Math.PI / 2 * this.deadSide, k); B.hips.position.y = lerp(B.hips.position.y, 0.13, k);
      B.armL.rotation.z = lerp(B.armL.rotation.z, -1.3, k); B.armR.rotation.z = lerp(B.armR.rotation.z, 1.1, k); B.thighL.rotation.x = lerp(B.thighL.rotation.x, 0.1, k); B.thighR.rotation.x = lerp(B.thighR.rotation.x, -0.25, k); B.shinR.rotation.x = 0.4 * k; B.head.rotation.y = 0.6 * k;
    }
    this.animateFace(dt);
    this.animateHair(dt);
  }

  private animateFace(dt: number) {
    if (!this.hero) return;
    // blinking
    this.blinkT -= dt; let lid = 0.05;
    if (this.blinkT < 0.12) lid = 1 - Math.abs(this.blinkT - 0.06) / 0.06 * 0.95;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    if (this.w.dead > 0.5) lid = 0.9;
    for (const l of this.lids) l.scale.y = Math.max(0.05, lid);
    // eyes track a target (saccade-free smooth pursuit)
    if (this.lookAt) {
      const hb = this.bones.head; const lp = hb.worldToLocal(this.lookAt.clone());
      const yaw = clamp(Math.atan2(lp.x, lp.z), -0.5, 0.5), pitch = clamp(-Math.atan2(lp.y - 0.1, Math.hypot(lp.x, lp.z)), -0.35, 0.35);
      for (const e of this.eyes) { e.rotation.y = damp(e.rotation.y, yaw, 12, dt); e.rotation.x = damp(e.rotation.x, pitch, 12, dt); }
      // head follows partially
      hb.rotation.y += yaw * 0.6; hb.rotation.x += pitch * 0.4;
    }
    // lips & brows driven by speech
    if (this.mouth) { const open = this.talk > 0 ? (0.25 + Math.abs(Math.sin(performance.now() * 0.022)) * 0.75 * (0.6 + Math.random() * 0.4)) : 0.22; this.mouth.scale.y = damp(this.mouth.scale.y, this.talk > 0 ? open : 0.22, 18, dt); }
    for (const b of this.brows) b.position.y = (0.1 + 0.036) * (this.height / 1.8) + (this.talk > 0 ? Math.sin(performance.now() * 0.005) * 0.002 : 0);
    this.talk = Math.max(0, this.talk - dt);
  }

  private animateHair(dt: number) {
    if (!this.hairChain.length) return;
    // follow head acceleration with damped springs
    const hp = new THREE.Vector3(); this.bones.head.getWorldPosition(hp);
    const vel = hp.clone().sub(this.headWorldPrev).divideScalar(Math.max(dt, 1e-3)); this.headWorldPrev.copy(hp);
    const inv = this.root.getWorldQuaternion(new THREE.Quaternion()).invert(); vel.applyQuaternion(inv);
    const dtc = Math.min(dt, 0.033);
    this.hairChain.forEach((h, i) => {
      const tgtX = clamp(vel.z * 0.09, -0.9, 0.9) * (1 + i * 0.3), tgtZ = clamp(-vel.x * 0.09, -0.7, 0.7) * (1 + i * 0.3);
      const k = 60, d = 7;
      h.vel.x += ((tgtX - h.ang.x) * k - h.vel.x * d) * dtc; h.vel.y += ((tgtZ - h.ang.y) * k - h.vel.y * d) * dtc;
      h.ang.x += h.vel.x * dtc; h.ang.y += h.vel.y * dtc;
      h.obj.rotation.x = h.ang.x + (i === 0 ? 0.25 : 0.12); h.obj.rotation.z = h.ang.y;
    });
  }

  punch() { if (this.punchT <= 0) { this.punchT = 0.38; this.punchSide *= -1; } }
  dispose() { this.mesh.geometry.dispose(); this.mesh.skeleton.dispose(); }
}

// ------------------------------------------------------------------------------------------- looks
export const SKIN = [0xf3d2bf, 0xe8b996, 0xd49a72, 0xb27650, 0x8d5636, 0x6a3e26, 0x4a2a1a];
const TOPS = [0xf5f5f0, 0x1c1c1e, 0x2b4a7a, 0xc0392b, 0x7a9a5a, 0xe8c070, 0x5ab0c8, 0xe88aa0, 0x6a4a8a, 0xd8d0c0, 0x2a6a5a, 0xf0a040];
const BOTTOMS = [0x2a3a5a, 0x1c1c1e, 0x6a5a40, 0xd8ccb0, 0x3a4a3a, 0x4a6a9a, 0x8a8a8a];
const HAIR = [0x1a120c, 0x2e1e12, 0x4a2e1a, 0x7a5a32, 0xc8a060, 0x9a9a9a, 0x101010];
export function randomLook(r: () => number, style: 'civ' | 'beach' | 'rich' | 'worker' | 'cop' | 'gang' | 'rural' = 'civ'): Look {
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const female = r() < 0.5;
  const L: Look = { skin: pick(SKIN), top: pick(TOPS), bottom: pick(BOTTOMS), shoes: pick([0x222222, 0xf0f0f0, 0x6a4a2a, 0x2a3a5a]), hair: pick(HAIR), hairStyle: female ? pick(['long', 'ponytail', 'bun', 'curly', 'short'] as const) : pick(['short', 'buzz', 'curly', 'bald', 'cap', 'short'] as const), female, build: 0.9 + r() * 0.25, height: (female ? 1.6 : 1.72) + r() * 0.14, beard: !female && r() < 0.3 };
  if (style === 'beach') { L.top = pick([0xff7a59, 0x59c3ff, 0xffe45a, 0xff59a8, 0xf5f5f0]); L.bottom = pick([0x2a6ac0, 0xe0c030, 0xc03030, 0x2ab0a0]); }
  if (style === 'rich') { L.top = pick([0xf2ece0, 0x1c2a40, 0xd8c8a8]); L.jacket = r() < 0.5 ? pick([0x1c2a40, 0x2a2a2a, 0xd8d0c0]) : undefined; L.bottom = pick([0x1c2a40, 0x2a2a2a, 0xd8d0c0]); }
  if (style === 'worker') { L.top = 0xe8742a; L.vest = 0xd8f02a; L.bottom = 0x3a4252; L.hat = 0xf2d02a; L.hairStyle = 'cap'; }
  if (style === 'cop') { L.top = 0x1f3550; L.bottom = 0x162436; L.vest = 0x26384e; L.shoes = 0x111111; if (r() < 0.6) { L.hairStyle = 'cap'; L.hat = 0x162436; } }
  if (style === 'gang') { L.top = pick([0x7a1d1d, 0x1d1d1d, 0x1d4a2a]); L.jacket = r() < 0.4 ? 0x1d1d1d : undefined; L.bottom = 0x2a2a2a; if (r() < 0.5) { L.hairStyle = 'cap'; L.hat = L.top; } L.female = false; }
  if (style === 'rural') { L.top = pick([0x8a3a2a, 0x3a5a8a, 0x7a7a5a]); L.bottom = 0x3a4a6a; L.hat = r() < 0.4 ? 0xc8a070 : undefined; if (L.hat) L.hairStyle = 'cap'; }
  return L;
}
/** The two leads — original characters. */
export const ROSA: Look = { skin: 0xc98c64, top: 0x1d1d20, jacket: 0x7a2e2a, bottom: 0x2a3a5a, shoes: 0xe8e4dc, hair: 0x1a0f0a, hairStyle: 'ponytail', female: true, build: 0.95, height: 1.68, eyes: 0x3a2412 };
export const JACE: Look = { skin: 0xe0b08a, top: 0xe8e2d4, jacket: 0x3a4a3a, bottom: 0x2e2e32, shoes: 0x4a3a2a, hair: 0x3a2616, hairStyle: 'short', female: false, build: 1.08, height: 1.84, beard: true, eyes: 0x4a6a7a };
