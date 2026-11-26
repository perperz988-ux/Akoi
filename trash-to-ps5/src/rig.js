// Procedural animation for the Kenney CC0 skinned characters (they ship without clips).
// Poses are authored as rotations in the character's own model space and converted to bone-local space.
import * as THREE from 'three';
import { model } from './assets.js';

const BONES = ['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion();

export class Humanoid {
  constructor(name, opts = {}) {
    this.root = model(name, { skinned: true, height: opts.height || 1.78, tint: opts.tint, cloneMat: !!opts.tint });
    this.inner = this.root.userData.inner; this.b = {}; this.rest = {}; this.P = {}; this.Pi = {};
    this.root.updateMatrixWorld(true);
    const innerQ = this.inner.getWorldQuaternion(new THREE.Quaternion()).invert();
    this.inner.traverse((o) => { if (o.isBone && BONES.includes(o.name) && !this.b[o.name]) this.b[o.name] = o; });
    for (const [n, bone] of Object.entries(this.b)) {
      this.rest[n] = bone.quaternion.clone();
      const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion()); const P = innerQ.clone().multiply(pq);
      this.P[n] = P; this.Pi[n] = P.clone().invert();
    }
    if (this.b.Hips) this.hipRest = this.b.Hips.position.clone();
    this.phase = Math.random() * 6; this.t = Math.random() * 10; this.mode = 'idle'; this.talk = 0; this.blend = 0;
    this.extra = null; // optional per-frame pose hook
    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  }
  // rotation in model space for bone n
  _rot(n, axis, ang) { if (!ang || !this.b[n]) return; this.acc[n] = this.acc[n] || new THREE.Quaternion(); _r.setFromAxisAngle(AX[axis], ang); this.acc[n].premultiply(_r); }
  update(dt, speed = 0, mode = 'auto') {
    this.t += dt; const run = speed > 4.2; const walk = speed > 0.3;
    this.phase += dt * (walk ? 2.2 + speed * 1.15 : 0);
    this.blend += ((walk ? 1 : 0) - this.blend) * Math.min(1, dt * 8);
    this.acc = {}; const R = (n, a, v) => this._rot(n, a, v);
    const s = Math.sin(this.phase), c = Math.cos(this.phase), w = this.blend, amp = run ? 0.95 : 0.6;
    const breathe = Math.sin(this.t * 2) * 0.02;
    // arms down from T-pose (left arm points +x in model space)
    let armDownR = null, armDown = 1.25, armFwdL = 0, armFwdR = 0, elbowL = -0.15, elbowR = -0.15, hip = 0, lean = 0, head = 0, headYaw = 0, legL = 0, legR = 0, kneeL = 0, kneeR = 0, bob = 0;
    // walk cycle
    legL = s * amp * w; legR = -s * amp * w;
    kneeL = Math.max(0, -c) * amp * 1.3 * w; kneeR = Math.max(0, c) * amp * 1.3 * w;
    armFwdL = -s * amp * 0.8 * w; armFwdR = s * amp * 0.8 * w;
    elbowL -= (run ? 1.1 : 0.3) * w; elbowR -= (run ? 1.1 : 0.3) * w;
    bob = Math.abs(c) * 0.05 * w; lean = run ? 0.18 * w : 0.04 * w;
    const m = mode === 'auto' ? (walk ? 'walk' : 'idle') : mode;
    this.mode = m;
    if (m === 'idle') { armDown += breathe; head = Math.sin(this.t * 0.7) * 0.04; headYaw = Math.sin(this.t * 0.31) * 0.25; }
    if (m === 'talk') { headYaw = Math.sin(this.t * 1.3) * 0.12; head = Math.sin(this.t * 5) * 0.05; armFwdR = -0.5 + Math.sin(this.t * 3) * 0.25; elbowR = -0.9; }
    if (m === 'phone') { armFwdR = -1.5; elbowR = -2.2; head = 0.35; armDown = 1.2; }
    if (m === 'shock') { armDown = 0.4 + Math.sin(this.t * 20) * 0.03; elbowL = elbowR = -1.6; armFwdL = armFwdR = -0.6; head = -0.15; lean = -0.12; }
    if (m === 'carry') { armFwdL = armFwdR = -1.1; elbowL = elbowR = -0.6; armDown = 1.0; }
    if (m === 'search') { lean = 0.75; hip = 0; armFwdL = -1.0 + Math.sin(this.t * 9) * 0.5; armFwdR = -1.0 - Math.sin(this.t * 9 + 1) * 0.5; elbowL = elbowR = -0.4; kneeL = kneeR = 0.5; legL = legR = 0.45; bob = -0.12; head = 0.3; }
    if (m === 'work') { armFwdL = -1.2 + Math.sin(this.t * 6) * 0.3; armFwdR = -1.2 - Math.sin(this.t * 6) * 0.3; elbowL = elbowR = -1.0; lean = 0.25; head = 0.35; }
    if (m === 'sit' || m === 'sleep') { legL = legR = -1.45; kneeL = kneeR = 1.5; bob = -0.45; armFwdL = armFwdR = -0.5; elbowL = elbowR = -0.9; lean = m === 'sleep' ? 0.1 : -0.05; head = m === 'sleep' ? 0.55 + Math.sin(this.t * 1.5) * 0.04 : 0; headYaw = m === 'sleep' ? 0.3 : 0; }
    if (m === 'wave') { armDownR = 1.2; armDown = -0.9; elbowL = -0.3 - Math.abs(Math.sin(this.t * 6)) * 0.9; }
    if (m === 'cheer') { armDown = -1.0 + Math.sin(this.t * 10) * 0.15; elbowL = elbowR = -0.2; bob = Math.abs(Math.sin(this.t * 7)) * 0.12; }
    if (m === 'lift') { armDown = -0.3; armFwdL = armFwdR = -1.4; elbowL = elbowR = -0.5; head = -0.3; }
    if (m === 'dance') { const d = this.t * 7; armDown = 0.2 + Math.sin(d) * 0.8; armFwdL = Math.sin(d) * 0.8; armFwdR = -Math.sin(d) * 0.8; headYaw = Math.sin(d * 0.5) * 0.5; bob = Math.abs(Math.sin(d)) * 0.1; legL = Math.max(0, Math.sin(d)) * 0.5; kneeL = legL * 1.4; }
    if (this.talk > 0) { this.talk -= dt; head += Math.sin(this.t * 14) * 0.04; }
    // legs swing about X (forward = negative X rotation lifts leg forward for +z facing model)
    R('LeftUpLeg', 'x', -legL); R('RightUpLeg', 'x', -legR);
    R('LeftLeg', 'x', kneeL); R('RightLeg', 'x', kneeR);
    R('LeftFoot', 'x', -kneeL * 0.3); R('RightFoot', 'x', -kneeR * 0.3);
    // arms: lower first (about Z), then swing forward (about X)
    R('LeftArm', 'z', -armDown); R('RightArm', 'z', armDownR == null ? armDown : armDownR);
    R('LeftArm', 'x', armFwdL); R('RightArm', 'x', armFwdR);
    R('LeftForeArm', 'y', elbowL); R('RightForeArm', 'y', -elbowR);
    R('Spine', 'x', lean * 0.6 + hip); R('Chest', 'x', lean * 0.4);
    R('Spine', 'y', s * 0.12 * w);
    R('Head', 'x', head); R('Head', 'y', headYaw);
    if (this.extra) this.extra(R, this);
    for (const [n, bone] of Object.entries(this.b)) {
      const a = this.acc[n];
      if (a) bone.quaternion.copy(this.Pi[n]).multiply(a).multiply(this.P[n]).multiply(this.rest[n]);
      else bone.quaternion.copy(this.rest[n]);
    }
    if (this.b.Hips && this.hipRest) { this.b.Hips.position.copy(this.hipRest); this.b.Hips.position.y += (bob + breathe * 0.2) / this.root.userData.scale; }
  }
}

// Clip-animated model (robot, fox)
export class Animated {
  constructor(name, opts = {}) {
    this.root = model(name, { skinned: true, height: opts.height, length: opts.length, tint: opts.tint, cloneMat: !!opts.tint });
    this.mixer = new THREE.AnimationMixer(this.root.userData.inner); this.actions = {}; this.cur = null;
    for (const clip of this.root.userData.animations || []) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  }
  play(name, fade = 0.25, once = false) {
    const a = this.actions[name]; if (!a || this.cur === a) return;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = once; a.fadeIn(fade).play();
    if (this.cur) this.cur.fadeOut(fade); this.cur = a;
  }
  update(dt) { this.mixer.update(dt); }
}
