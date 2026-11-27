// Camera modes: cockpit (panel), pilot eye, chase, cinematic fly-by / tower, wing, landing gear.
import * as THREE from 'three';
import { FlightModel } from './FlightModel';
import { AircraftParts } from '../aircraft/Model';
import { clamp, damp, DEG } from '../core/geo';

export type CamMode = 'cockpit' | 'pilot' | 'chase' | 'cinematic' | 'wing' | 'gear';
export const CAM_MODES: CamMode[] = ['cockpit', 'pilot', 'chase', 'cinematic', 'wing', 'gear'];
export const CAM_LABEL: Record<CamMode, string> = { cockpit: 'Cockpit', pilot: 'Pilot View', chase: 'External', cinematic: 'Cinematic', wing: 'Wing View', gear: 'Gear View' };

export class CameraRig {
  cam: THREE.PerspectiveCamera;
  mode: CamMode = 'chase';
  yaw = 0; pitch = -8; dist = 1; fovZoom = 1;
  private smoothPos = new THREE.Vector3(); private smoothQ = new THREE.Quaternion(); private init = false;
  private flyby = new THREE.Vector3(); private flybyT = 0; private flybyTower: THREE.Vector3 | null = null;
  towerPoint: (() => THREE.Vector3 | null) | null = null;
  groundAt: (x: number, z: number) => number = () => 0;
  shake = 0;
  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(60, aspect, 0.5, 900000);
  }
  setMode(m: CamMode) { this.mode = m; this.yaw = 0; this.pitch = m === 'cockpit' ? -14 : m === 'pilot' ? -4 : m === 'chase' ? -8 : 0; this.fovZoom = 1; this.flybyT = 0; this.init = false; }
  next() { const i = CAM_MODES.indexOf(this.mode); this.setMode(CAM_MODES[(i + 1) % CAM_MODES.length]); }
  look(dx: number, dy: number) {
    const s = this.mode === 'cockpit' || this.mode === 'pilot' ? 0.18 : 0.3;
    this.yaw = this.mode === 'cockpit' || this.mode === 'pilot' ? clamp(this.yaw - dx * s, -160, 160) : this.yaw - dx * s;
    this.pitch = clamp(this.pitch - dy * s, -80, 70);
  }
  zoom(f: number) {
    if (this.mode === 'chase') this.dist = clamp(this.dist * f, 0.35, 6);
    else this.fovZoom = clamp(this.fovZoom * f, 0.3, 1.4);
  }

  update(dt: number, fm: FlightModel, parts: AircraftParts) {
    const s = fm.spec; const c = this.cam;
    const q = fm.quat, p = fm.pos;
    const inside = this.mode === 'cockpit' || this.mode === 'pilot';
    c.near = inside ? 0.05 : this.mode === 'wing' || this.mode === 'gear' ? 0.2 : 0.8;
    let fov = 60;
    const shakeV = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), 0).multiplyScalar(this.shake * 0.015);
    if (inside) {
      const eye = parts.cockpitEye.clone();
      if (this.mode === 'cockpit') { eye.y += 0.02; eye.z += 0.12; }
      c.position.copy(eye.add(shakeV).applyQuaternion(q).add(p));
      const lq = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch * DEG, this.yaw * DEG, 0, 'YXZ'));
      c.quaternion.copy(q).multiply(lq);
      fov = this.mode === 'cockpit' ? 62 : 70;
    } else if (this.mode === 'chase') {
      const L = Math.max(s.length, s.span * 0.8);
      const d = (L * 1.25 + 8) * this.dist;
      const hdg = Math.atan2(-(new THREE.Vector3(0, 0, -1).applyQuaternion(q).x), -(new THREE.Vector3(0, 0, -1).applyQuaternion(q).z));
      const yawW = hdg + this.yaw * DEG; const pit = this.pitch * DEG;
      const off = new THREE.Vector3(Math.sin(yawW) * Math.cos(pit), -Math.sin(pit), Math.cos(yawW) * Math.cos(pit)).multiplyScalar(d);
      const target = p.clone().add(new THREE.Vector3(0, s.height * 0.25, 0));
      const want = target.clone().add(off);
      const gy = this.groundAt(want.x, want.z) + 1.5; if (want.y < gy) want.y = gy;
      if (!this.init) { this.smoothPos.copy(want); this.init = true; }
      this.smoothPos.lerp(want, damp(6, dt));
      // keep exact distance (avoid lag stretching at high speed)
      const dir = this.smoothPos.clone().sub(target); dir.setLength(d); this.smoothPos.copy(target).add(dir);
      if (this.smoothPos.y < gy) this.smoothPos.y = gy;
      c.position.copy(this.smoothPos).add(shakeV.multiplyScalar(0.3));
      c.up.set(0, 1, 0); c.lookAt(target);
      fov = 55;
    } else if (this.mode === 'cinematic') {
      this.flybyT -= dt;
      const tower = this.towerPoint?.();
      const far = this.flyby.distanceTo(p);
      if (this.flybyT <= 0 || far > 900 + fm.st.gs * 6) {
        if (tower && tower.distanceTo(p) < 6000 && fm.st.agl < 400 && Math.random() < 0.6) { this.flybyTower = tower.clone(); this.flyby.copy(tower); this.flybyT = 14; }
        else {
          this.flybyTower = null;
          const v = fm.vel.lengthSq() > 4 ? fm.vel.clone().normalize() : new THREE.Vector3(0, 0, -1).applyQuaternion(q);
          const side = new THREE.Vector3(-v.z, 0, v.x).normalize().multiplyScalar((Math.random() < 0.5 ? -1 : 1) * (s.span * 0.8 + 20 + Math.random() * 40));
          const ahead = v.clone().multiplyScalar(Math.max(80, fm.st.gs * 5));
          this.flyby.copy(p).add(ahead).add(side); this.flyby.y += (Math.random() - 0.3) * 20;
          const gy = this.groundAt(this.flyby.x, this.flyby.z) + 2; if (this.flyby.y < gy) this.flyby.y = gy;
          this.flybyT = 10;
        }
      }
      c.position.copy(this.flyby); c.up.set(0, 1, 0); c.lookAt(p);
      const dist = this.flyby.distanceTo(p);
      fov = clamp(2 * Math.atan((s.length * 1.6) / (2 * dist)) / DEG, 3, 60);
    } else if (this.mode === 'wing') {
      const local = new THREE.Vector3(-(s.fuselageW ?? s.fuselageD) / 2 - 0.25, s.wingMount === 'high' ? -0.1 : s.fuselageD * 0.2, parts.wingRootZ + s.rootChord * 1.1);
      c.position.copy(local.applyQuaternion(q).add(p));
      const lq = new THREE.Quaternion().setFromEuler(new THREE.Euler((-12 + this.pitch) * DEG, (80 + this.yaw) * DEG, 0, 'YXZ'));
      c.quaternion.copy(q).multiply(lq);
      fov = 70;
    } else if (this.mode === 'gear') {
      const bottom = -(s.fuselageD / 2 + s.gear.height);
      const local = new THREE.Vector3(0.4, bottom + s.gear.height * 0.6 + s.gear.wheelD * 0.5, -s.gear.wheelbase * 0.35);
      c.position.copy(local.applyQuaternion(q).add(p));
      const lq = new THREE.Quaternion().setFromEuler(new THREE.Euler((-10 + this.pitch) * DEG, (180 + this.yaw) * DEG, 0, 'YXZ'));
      c.quaternion.copy(q).multiply(lq);
      fov = 75;
    }
    c.fov = fov * this.fovZoom; c.updateProjectionMatrix();
    this.shake = Math.max(0, this.shake - dt * 2);
  }
  shiftBy(dx: number, dz: number) { this.smoothPos.x -= dx; this.smoothPos.z -= dz; this.flyby.x -= dx; this.flyby.z -= dz; }
  get inside() { return this.mode === 'cockpit' || this.mode === 'pilot'; }
}
