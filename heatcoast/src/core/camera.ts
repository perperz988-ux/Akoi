import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from './math';
import { raycastBuildings, heightAt } from '../world/layout';

export type CamMode = 'foot' | 'aim' | 'car' | 'cine' | 'photo' | 'interior';

/** Third-person camera with collision, speed FOV, look-behind auto-centering, shake and cinematic shots. */
export class CameraRig {
  cam: THREE.PerspectiveCamera;
  yaw = 0; pitch = 0.18; dist = 4.2; fov = 62;
  private shake = 0; private curDist = 4.2; private pos = new THREE.Vector3(); private look = new THREE.Vector3();
  private idleT = 0; carView = 0;
  cine: { from: THREE.Vector3; to: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3; t: number; dur: number; fov: number } | null = null;
  shakeEnabled = true;
  constructor(aspect: number) { this.cam = new THREE.PerspectiveCamera(62, aspect, 0.1, 9000); }
  addLook(dx: number, dy: number) { this.yaw -= dx; this.pitch = clamp(this.pitch + dy, -1.1, 1.25); this.idleT = 0; }
  addShake(a: number) { if (this.shakeEnabled) this.shake = Math.min(1.2, this.shake + a); }
  snapBehind(yaw: number) { this.yaw = yaw + Math.PI; this.idleT = 0; }
  playShot(from: THREE.Vector3, to: THREE.Vector3, lookFrom: THREE.Vector3, lookTo: THREE.Vector3, dur: number, fov = 42) { this.cine = { from, to, lookFrom, lookTo, t: 0, dur, fov }; }
  stopCine() { this.cine = null; }

  update(dt: number, target: THREE.Vector3, mode: CamMode, o: { heading?: number; speed?: number; aimShoulder?: number; vehLen?: number; sprint?: boolean; room?: { x0: number; x1: number; z0: number; z1: number; y: number; h: number } } = {}) {
    const c = this.cam;
    if (this.cine) {
      const s = this.cine; s.t += dt; const k = clamp(s.t / s.dur, 0, 1), e = k * k * (3 - 2 * k);
      c.position.lerpVectors(s.from, s.to, e); c.lookAt(this.look.lerpVectors(s.lookFrom, s.lookTo, e));
      c.fov = damp(c.fov, s.fov, 4, dt); c.updateProjectionMatrix(); return;
    }
    let dist = 4.2, height = 1.55, side = 0.0, fovT = 62;
    if (mode === 'aim') { dist = 2.1; height = 1.55; side = -0.62 * (o.aimShoulder ?? 1); fovT = 48; }
    else if (mode === 'car') {
      const L = o.vehLen ?? 4.6; const views = [[L * 1.25 + 1.6, 1.7], [L * 1.8 + 3, 2.6], [L * 0.9 + 0.8, 1.15]];
      const v = views[this.carView % 3]; dist = v[0]; height = v[1]; fovT = 64 + clamp((o.speed ?? 0) * 0.35, 0, 18);
      // drift camera behind the direction of travel once the player stops steering the camera
      this.idleT += dt;
      if (this.idleT > 1.4 && o.heading !== undefined && (o.speed ?? 0) > 3) this.yaw = dampAngle(this.yaw, o.heading + Math.PI, 2.5, dt);
      if (this.idleT > 1.4) this.pitch = damp(this.pitch, 0.16, 2, dt);
    } else if (mode === 'interior') { dist = 3.0; height = 1.6; fovT = 66; }
    else if (mode === 'photo') { dist = 0.01; height = 1.62; fovT = 55; }
    else { this.idleT += dt; if (o.sprint) fovT = 68; if (this.idleT > 3 && (o.speed ?? 0) > 1.5 && o.heading !== undefined) this.yaw = dampAngle(this.yaw, o.heading + Math.PI, 0.8, dt); }
    const piv = new THREE.Vector3(target.x, target.y + height, target.z);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    piv.addScaledVector(right, side);
    // collision: pull in when a building is between pivot and camera
    const hit = o.room ? 99 : raycastBuildings(piv.x, piv.y, piv.z, dir.x, dir.y, dir.z, dist + 0.3);
    const want = Math.min(dist, hit - 0.35);
    this.curDist = want < this.curDist ? want : damp(this.curDist, want, 4, dt);
    this.pos.copy(piv).addScaledVector(dir, Math.max(0.4, this.curDist));
    if (o.room) { const r = o.room; this.pos.x = clamp(this.pos.x, r.x0 + 0.3, r.x1 - 0.3); this.pos.z = clamp(this.pos.z, r.z0 + 0.3, r.z1 - 0.3); this.pos.y = clamp(this.pos.y, r.y + 0.5, r.y + r.h - 0.3); }
    else { const gy = heightAt(this.pos.x, this.pos.z) + 0.35; if (this.pos.y < gy) this.pos.y = gy; }
    c.position.copy(this.pos);
    if (this.shake > 0) { const s = this.shake * 0.08; c.position.x += (Math.random() - 0.5) * s; c.position.y += (Math.random() - 0.5) * s; this.shake = Math.max(0, this.shake - dt * 2.2); }
    this.look.copy(piv).addScaledVector(dir, -(mode === 'aim' ? 8 : 1.2));
    if (mode === 'car') this.look.y = lerp(this.look.y, target.y + 1.1, 0.5);
    c.lookAt(this.look);
    c.fov = damp(c.fov, fovT, 6, dt); c.updateProjectionMatrix();
  }
  /** World-space aim ray from screen centre. */
  aimRay(): { o: THREE.Vector3; d: THREE.Vector3 } { const d = new THREE.Vector3(); this.cam.getWorldDirection(d); return { o: this.cam.position.clone(), d }; }
  resize(aspect: number) { this.cam.aspect = aspect; this.cam.updateProjectionMatrix(); }
}
