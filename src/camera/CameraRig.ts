import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, wrapAngle } from '../core/MathUtil';
import type { StaticCollision } from '../world/Collision';

export type CamMode = 'walk' | 'drive' | 'combat' | 'cinematic' | 'heli' | 'interior' | 'boat';

/** Third-person camera with mode blending, collision, shake and cinematic overrides. */
export class CameraRig {
  camera: THREE.PerspectiveCamera;
  yaw = 0; pitch = 0.25;
  dist = 4.6; height = 1.6;
  mode: CamMode = 'walk';
  sensitivity = 1;
  fovBase = 62; fov = 62;
  private pos = new THREE.Vector3(); private look = new THREE.Vector3();
  private curDist = 5; private curH = 1.7; private curShoulder = 0.0;
  shake = 0; shakeT = 0;
  driveView = 0; // 0 chase far, 1 chase near, 2 hood, 3 cockpit
  lookBack = false;
  // cinematic
  cine: { from: THREE.Vector3; to: THREE.Vector3; look: THREE.Vector3; lookTo?: THREE.Vector3; t: number; dur: number; fov?: number } | null = null;
  letterbox = 0;
  autoYaw = true;
  idleT = 0;
  collisionDist = 5;
  private ray = new THREE.Vector3();

  constructor(public col: StaticCollision, aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.fovBase, aspect, 0.15, 2600);
  }

  addLook(dx: number, dy: number, sens: number, invertY: boolean) {
    this.yaw -= dx * 0.0042 * sens * this.sensitivity;
    this.pitch += dy * 0.0036 * sens * this.sensitivity * (invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -0.55, 1.25);
    if (dx || dy) this.idleT = 0;
  }
  addShake(a: number) { this.shake = Math.min(1.5, this.shake + a); }

  playCine(from: THREE.Vector3, to: THREE.Vector3, look: THREE.Vector3, dur: number, lookTo?: THREE.Vector3, fov?: number) {
    this.cine = { from: from.clone(), to: to.clone(), look: look.clone(), lookTo: lookTo?.clone(), t: 0, dur, fov };
  }
  stopCine() { this.cine = null; }

  update(dt: number, target: THREE.Vector3, opt: { mode: CamMode; speed?: number; heading?: number; aiming?: boolean; vehicleLen?: number; sprinting?: boolean; shoulder?: number; vy?: number; pitchTilt?: number }) {
    this.mode = opt.mode;
    const cam = this.camera;
    this.letterbox = lerp(this.letterbox, this.cine ? 1 : 0, 1 - Math.exp(-5 * dt));
    if (this.cine) {
      const c = this.cine; c.t += dt;
      const k = clamp(c.t / c.dur, 0, 1), e = k * k * (3 - 2 * k);
      this.pos.lerpVectors(c.from, c.to, e);
      this.look.copy(c.look); if (c.lookTo) this.look.lerp(c.lookTo, e);
      cam.position.copy(this.pos); cam.lookAt(this.look);
      this.fov = lerp(this.fov, c.fov ?? 45, 0.1); cam.fov = this.fov; cam.updateProjectionMatrix();
      if (c.t >= c.dur) this.cine = null;
      return;
    }
    const speed = opt.speed ?? 0;
    let wantDist: number, wantH: number, wantFov: number, wantShoulder = 0, lookAhead = 0;
    switch (opt.mode) {
      case 'drive': {
        const len = opt.vehicleLen ?? 4.5;
        const views = [[len * 0.95 + 3.4, 1.9], [len * 0.7 + 2.0, 1.5], [0.0, 1.15], [-0.2, 1.2]];
        const v = views[this.driveView];
        wantDist = v[0] + speed * 0.04; wantH = v[1] + speed * 0.006;
        wantFov = this.fovBase + clamp(speed * 0.35, 0, 22);
        lookAhead = 0;
        // auto-follow heading
        if (opt.heading !== undefined && !this.lookBack) {
          this.idleT += dt;
          const follow = this.idleT > 1.1 ? clamp(speed / 6, 0, 1) * 3.2 : 0;
          this.yaw = dampAngle(this.yaw, opt.heading + Math.PI, follow, dt);
          this.pitch = damp(this.pitch, 0.16 - clamp(speed * 0.002, 0, 0.05), 2, dt);
        }
        if (this.lookBack && opt.heading !== undefined) this.yaw = dampAngle(this.yaw, opt.heading, 12, dt);
        break;
      }
      case 'boat': {
        wantDist = (opt.vehicleLen ?? 7) * 0.9 + 4; wantH = 2.6; wantFov = this.fovBase + clamp(speed * 0.3, 0, 14);
        if (opt.heading !== undefined) { this.idleT += dt; if (this.idleT > 1.2) this.yaw = dampAngle(this.yaw, opt.heading + Math.PI, 1.2, dt); }
        this.pitch = damp(this.pitch, 0.2, 2, dt); break;
      }
      case 'heli': wantDist = 14; wantH = 4; wantFov = this.fovBase + 6; if (opt.heading !== undefined) { this.idleT += dt; if (this.idleT > 1.5) this.yaw = dampAngle(this.yaw, opt.heading + Math.PI, 1.0, dt); } break;
      case 'combat': wantDist = 2.2; wantH = 1.55; wantFov = this.fovBase - 12; wantShoulder = opt.shoulder ?? 0.55; break;
      case 'interior': wantDist = 3.0; wantH = 1.5; wantFov = this.fovBase + 4; break;
      default:
        wantDist = this.dist + (opt.sprinting ? 0.6 : 0); wantH = this.height; wantFov = this.fovBase + (opt.sprinting ? 5 : 0); break;
    }
    const k = 1 - Math.exp(-8 * dt);
    this.curDist = lerp(this.curDist, wantDist, k); this.curH = lerp(this.curH, wantH, k); this.curShoulder = lerp(this.curShoulder, wantShoulder, k);
    this.fov = lerp(this.fov, wantFov, 1 - Math.exp(-5 * dt));
    // pivot
    const pivotY = target.y + (opt.mode === 'drive' ? (this.driveView >= 2 ? 0.0 : 0.9) : 0.2) + (this.curH - 1.6) * 0.0;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    // camera offset behind target along (sin yaw, cos yaw)
    const dist = this.curDist;
    const dir = new THREE.Vector3(sy * cp, sp, cy * cp);
    const right = new THREE.Vector3(cy, 0, -sy);
    let px = target.x + right.x * this.curShoulder, py = pivotY + (opt.mode === 'drive' ? this.curH * 0.55 : this.curH * 0.8), pz = target.z + right.z * this.curShoulder;
    if (opt.mode === 'drive' && this.driveView >= 2) {
      // hood / cockpit: camera sits at the vehicle
      const hd = opt.heading ?? 0;
      const fwd = new THREE.Vector3(Math.sin(hd), 0, Math.cos(hd));
      cam.position.set(target.x + fwd.x * (this.driveView === 2 ? 1.2 : 0.1), target.y + (this.driveView === 2 ? 1.35 : 1.15), target.z + fwd.z * (this.driveView === 2 ? 1.2 : 0.1));
      this.pos.copy(cam.position);
      const lk = new THREE.Vector3(Math.sin(hd + (this.lookBack ? Math.PI : 0) + (this.yaw - (hd + Math.PI)) * 0), 0, Math.cos(hd + (this.lookBack ? Math.PI : 0)));
      cam.lookAt(cam.position.x + lk.x * 10, cam.position.y - 0.4 + (this.pitch - 0.16) * 6, cam.position.z + lk.z * 10);
      cam.fov = this.fov; cam.updateProjectionMatrix();
      this.applyShake(dt);
      return;
    }
    // collision: cast from pivot toward desired camera
    const desired = new THREE.Vector3(px + dir.x * dist, py + dir.y * dist, pz + dir.z * dist);
    this.ray.copy(desired).sub(new THREE.Vector3(px, py, pz));
    const len = this.ray.length(); this.ray.divideScalar(len || 1);
    const hit = this.col.raycast(px, py, pz, this.ray.x, this.ray.y, this.ray.z, len + 0.3, true);
    let use = hit < len + 0.3 ? Math.max(0.5, hit - 0.35) : len;
    this.collisionDist = lerp(this.collisionDist, use, use < this.collisionDist ? 1 - Math.exp(-30 * dt) : 1 - Math.exp(-3 * dt));
    use = Math.min(len, this.collisionDist);
    const cx = px + this.ray.x * use, cy2 = Math.max(py + this.ray.y * use, 0.35), cz = pz + this.ray.z * use;
    this.pos.set(cx, cy2, cz);
    cam.position.copy(this.pos);
    cam.lookAt(px - right.x * (this.curShoulder * 0.2), py + (opt.mode === 'combat' ? 0.0 : -0.25) + (opt.pitchTilt ?? 0), pz - right.z * (this.curShoulder * 0.2));
    cam.fov = this.fov; cam.updateProjectionMatrix();
    this.applyShake(dt);
  }

  private applyShake(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.shake > 0.01) {
      this.shakeT += dt * 40;
      const s = this.shake * 0.06;
      this.camera.position.x += Math.sin(this.shakeT * 1.3) * s; this.camera.position.y += Math.sin(this.shakeT * 1.9) * s; this.camera.position.z += Math.cos(this.shakeT * 1.1) * s;
      this.camera.rotation.z += Math.sin(this.shakeT) * s * 0.4;
    }
  }

  /** Camera-relative yaw (forward direction for movement). */
  get forwardYaw() { return this.yaw + Math.PI; }
  snapBehind(heading: number) { this.yaw = heading + Math.PI; this.idleT = 5; }
  resize(aspect: number) { this.camera.aspect = aspect; this.camera.updateProjectionMatrix(); }
}
export { wrapAngle };
