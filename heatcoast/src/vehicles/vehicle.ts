import * as THREE from 'three';
import { VDef, buildCar, CarParts } from './models';
import { heightAt, collideCircle, waterDepth, onRoadInfo, zoneAt, Zone } from '../world/layout';
import { clamp, damp, lerp } from '../core/math';

let VID = 1;
export type VRole = 'traffic' | 'parked' | 'police' | 'player' | 'mission' | 'wreck' | 'owned';
export interface VInput { throttle: number; steer: number; handbrake: boolean }
export interface Occupant { kind: string; vehicle: Vehicle | null; seat: number; [k: string]: any }

/** A car with a tyre-slip bicycle model (lateral grip saturation, weight transfer, handbrake drifts). */
export class Vehicle {
  id = VID++;
  parts: CarParts; root: THREE.Group;
  x = 0; y = 0; z = 0; yaw = 0; vx = 0; vz = 0; yawRate = 0;
  steer = 0; throttle = 0; braking = 0; handbrake = false; rpm = 800; gear = 1;
  health = 1000; dead = false; burnT = 0; exploded = false;
  role: VRole = 'traffic';
  seats: (Occupant | null)[];
  physics = false; // false = kinematic (traffic AI drives it on rails)
  lightsOn = false; siren = false; horn = 0;
  wet = 0; slip = 0; lastImpact = 0; inWater = false; engineOn = true;
  pitch = 0; roll = 0; private pitchV = 0; private rollV = 0; private sus = 0;
  color: number;
  ai: any = null; // traffic / police brain state
  locked = false; stolen = false; despawnT = 0; ownerUid: string | null = null;
  mods = { engine: 0, brakes: 0, armor: 0, turbo: false };
  constructor(public def: VDef, color: number, hq: boolean) {
    this.color = color;
    this.parts = buildCar(def, color, hq);
    this.root = this.parts.root;
    this.seats = new Array(def.seats).fill(null);
    (this.root as any).vehicle = this;
  }
  get fx() { return Math.sin(this.yaw); } get fz() { return Math.cos(this.yaw); }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get vf() { return this.vx * this.fx + this.vz * this.fz; }
  get vl() { return this.vx * -this.fz + this.vz * this.fx; }
  get driver() { return this.seats[0]; }
  get kmh() { return Math.abs(this.vf) * 3.6; }

  place(x: number, z: number, yaw: number) { this.x = x; this.z = z; this.yaw = yaw; this.y = heightAt(x, z); this.vx = this.vz = this.yawRate = 0; this.sync(0); }

  /** Physics step (player, police, panicking drivers). */
  step(dt: number, inp: VInput): { impact: number; nx: number; nz: number } | null {
    const d = this.def, m = d.mass, g = 9.81;
    const n = Math.max(1, Math.ceil(dt / 0.012)); const h = dt / n;
    let impact: { impact: number; nx: number; nz: number } | null = null;
    const dead = this.dead || !this.engineOn || this.inWater;
    for (let it = 0; it < n; it++) {
      const fx = this.fx, fz = this.fz, rx = -fz, rz = fx;
      const vf = this.vx * fx + this.vz * fz, vl = this.vx * rx + this.vz * rz, sp = Math.hypot(vf, vl);
      // steering: speed-sensitive lock, smooth
      const lock = d.steer / (1 + sp / 16);
      this.steer = damp(this.steer, clamp(inp.steer, -1, 1) * lock, 7, h);
      const zone = zoneAt(this.x, this.z), road = onRoadInfo(this.x, this.z);
      const surf = road ? (road.kind === 'dirt' ? 0.82 : 1) : zone === Zone.Beach ? 0.62 : zone === Zone.Swamp || zone === Zone.Rural ? 0.75 : 0.9;
      const mu = d.grip * surf * (1 - this.wet * 0.28) * (1 + this.mods.brakes * 0.02);
      const wb = d.len * 0.62, a = wb * 0.5, b = wb * 0.5;
      // weight transfer from braking / acceleration
      const transfer = clamp(-this.lastAx * 0.05, -0.15, 0.15);
      const Nf = m * g * (0.5 + transfer), Nr = m * g * (0.5 - transfer);
      const muR = mu * (inp.handbrake ? 0.42 : 1);
      const Cf = Nf * mu * 9, Cr = Nr * muR * 9.5;
      const avf = Math.max(Math.abs(vf), 0.6);
      const vlF = vl - a * this.yawRate, vlR = vl + b * this.yawRate;
      const af = Math.atan2(vlF, avf) + this.steer * Math.sign(vf || 1), ar = Math.atan2(vlR, avf);
      let Fyf = clamp(-Cf * af, -mu * Nf, mu * Nf), Fyr = clamp(-Cr * ar, -muR * Nr, muR * Nr);
      // longitudinal
      let Fx = 0; let brakeAmt = 0;
      const thr = dead ? 0 : inp.throttle;
      const power = d.power * (1 + this.mods.engine * 0.08) * (this.mods.turbo ? 1.1 : 1);
      if (thr > 0.02) { if (vf < -1) brakeAmt = thr; else Fx = power * thr * clamp(1 - (vf / d.vmax) ** 2, 0, 1); }
      else if (thr < -0.02) { if (vf > 1) brakeAmt = -thr; else Fx = power * 0.55 * thr * clamp(1 + vf / 12, 0, 1); }
      Fx -= Math.sign(vf) * brakeAmt * d.brake * (1 + this.mods.brakes * 0.1);
      if (inp.handbrake) Fx -= Math.sign(vf) * d.brake * 0.45;
      const tracLimit = mu * m * g * 1.05; this.slip = Math.max(Math.abs(af), Math.abs(ar)) + (Math.abs(Fx) > tracLimit ? 0.3 : 0);
      Fx = clamp(Fx, -tracLimit, tracLimit);
      Fx -= vf * Math.abs(vf) * 0.42 + vf * (surf < 0.8 ? 120 : 28) + (dead ? vf * 300 : 0);
      if (this.inWater) Fx -= vf * 1200;
      this.braking = brakeAmt;
      // low-speed: kinematic yaw, kill sideways creep
      const lowK = clamp(1 - sp / 3, 0, 1);
      const yawKin = vf * Math.tan(this.steer) / wb;
      const I = m * (d.len * d.len + d.wid * d.wid) / 12;
      const yawAcc = (a * Fyf * Math.cos(this.steer) * -1 + b * Fyr) / I;
      this.yawRate += yawAcc * h * (1 - lowK);
      this.yawRate = lerp(this.yawRate, yawKin, lowK * 0.5 + 0.0);
      if (sp < 0.3 && Math.abs(thr) < 0.05) this.yawRate *= 0.8;
      Fyf *= 1 - lowK; Fyr *= 1 - lowK;
      const Fy = Fyf * Math.cos(this.steer) + Fyr - vl * m * lowK * 6;
      const ax = (fx * Fx + rx * Fy) / m, az = (fz * Fx + rz * Fy) / m;
      this.lastAx = Fx / m; this.lastAy = Fy / m;
      this.vx += ax * h; this.vz += az * h;
      this.x += this.vx * h; this.z += this.vz * h; this.yaw += this.yawRate * h;
      // collisions vs buildings: two circles along the body
      const r = d.wid * 0.5, off = d.len * 0.5 - r;
      for (const s of [1, -1]) {
        const p = { x: this.x + this.fx * off * s, z: this.z + this.fz * off * s };
        const hit = collideCircle(p, r, this.y + 0.4);
        if (hit) {
          const cx = p.x - (this.x + this.fx * off * s), cz = p.z - (this.z + this.fz * off * s);
          this.x += cx; this.z += cz;
          const vn = this.vx * hit.nx + this.vz * hit.nz;
          if (vn < 0) {
            this.vx -= vn * hit.nx * 1.25; this.vz -= vn * hit.nz * 1.25;
            this.vx *= 0.92; this.vz *= 0.92; this.yawRate += s * (hit.nx * this.fz - hit.nz * this.fx) * vn * 0.08;
            if (-vn > 3 && (!impact || -vn > impact.impact)) impact = { impact: -vn, nx: hit.nx, nz: hit.nz };
          }
        }
      }
    }
    this.vx = isFinite(this.vx) ? this.vx : 0; this.vz = isFinite(this.vz) ? this.vz : 0; this.yawRate = clamp(isFinite(this.yawRate) ? this.yawRate : 0, -4, 4);
    // engine rpm / auto gearbox (for audio + HUD)
    const sp = Math.abs(this.vf), ratios = [0, 3.2, 2.1, 1.5, 1.15, 0.92, 0.75];
    const ups = [0, 8, 15, 23, 33, 45];
    if (this.vf < -0.5) this.gear = -1; else { this.gear = 1; for (let i = 1; i < ups.length; i++) if (sp > ups[i] * (d.vmax / 60)) this.gear = i + 1; }
    const gr = ratios[Math.abs(this.gear)] ?? 3.2;
    this.rpm = damp(this.rpm, clamp(900 + sp * gr * 95 + (Math.abs(inp.throttle) > 0.1 && sp < 2 ? 2600 * Math.abs(inp.throttle) : 0), 800, 7400), 9, dt);
    this.throttle = inp.throttle;
    this.groundFollow(dt);
    if (impact) this.damage(impact.impact * impact.impact * 2.2 * (1 - this.mods.armor * 0.15));
    this.lastImpact = impact ? impact.impact : 0;
    return impact;
  }
  lastAx = 0; lastAy = 0;

  /** Kinematic move used by traffic AI. */
  kinematic(x: number, z: number, yaw: number, speed: number, dt: number) {
    const ox = this.x, oz = this.z;
    this.x = x; this.z = z;
    const dy = ((yaw - this.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.yawRate = dt > 0 ? dy / dt : 0; this.yaw = yaw;
    this.vx = dt > 0 ? (x - ox) / dt : 0; this.vz = dt > 0 ? (z - oz) / dt : 0;
    this.steer = damp(this.steer, clamp(this.yawRate * 0.4, -0.5, 0.5), 6, dt);
    this.rpm = 900 + speed * 120; this.lastAx = 0; this.lastAy = this.yawRate * speed;
    this.groundFollow(dt);
  }

  private groundFollow(dt: number) {
    const d = this.def, fx = this.fx, fz = this.fz, rx = -fz, rz = fx;
    const hf = heightAt(this.x + fx * d.len * 0.35, this.z + fz * d.len * 0.35), hb = heightAt(this.x - fx * d.len * 0.35, this.z - fz * d.len * 0.35);
    const hl = heightAt(this.x - rx * d.wid * 0.4, this.z - rz * d.wid * 0.4), hr = heightAt(this.x + rx * d.wid * 0.4, this.z + rz * d.wid * 0.4);
    const groundY = (hf + hb + hl + hr) / 4;
    const depth = waterDepth(this.x, this.z);
    this.inWater = depth > 0.75;
    if (this.inWater) { this.engineOn = false; this.y = damp(this.y, groundY + 0.2, 1.5, dt); if (!this.dead) this.damage(dt * 60); }
    else this.y = damp(this.y, groundY, 20, dt);
    const terrainPitch = Math.atan2(hb - hf, d.len * 0.7), terrainRoll = Math.atan2(hr - hl, d.wid * 0.8);
    // spring-damper body motion from accelerations
    const tp = terrainPitch + clamp(this.lastAx * 0.006, -0.06, 0.06), tr = terrainRoll + clamp(this.lastAy * 0.007, -0.08, 0.08);
    this.pitchV += ((tp - this.pitch) * 90 - this.pitchV * 11) * dt; this.pitch += this.pitchV * dt;
    this.rollV += ((tr - this.roll) * 80 - this.rollV * 10) * dt; this.roll += this.rollV * dt;
    this.sus = damp(this.sus, 0, 8, dt);
  }

  damage(n: number) {
    if (this.dead) return; this.health -= n;
    if (this.health <= 0) { this.health = 0; this.burnT = this.burnT || 8; }
  }

  sync(dt: number, night = 0) {
    const r = this.root; r.position.set(this.x, this.y, this.z);
    r.rotation.set(0, this.yaw, 0, 'YXZ'); this.parts.body.rotation.set(this.pitch, 0, -this.roll, 'YXZ');
    const vf = this.vf;
    this.parts.wheels.forEach((w, i) => { const spin = w.children[0]; spin.rotation.x += vf / this.def.wheelR * dt; if (i < 2) w.rotation.y = this.steer; });
    const on = this.lightsOn && !this.dead;
    this.parts.head.emissiveIntensity = on ? 4 : 0.15 + night * 0;
    this.parts.tail.emissiveIntensity = this.dead ? 0 : this.braking > 0.1 ? 5 : on ? 1.6 : 0.25;
    if (this.parts.bar) { const t = performance.now() * 0.012; const a = this.siren ? (Math.sin(t) > 0 ? 6 : 0) : 0, b = this.siren ? (Math.sin(t) <= 0 ? 6 : 0) : 0; this.parts.bar.red.emissiveIntensity = a; this.parts.bar.blue.emissiveIntensity = b; }
    if (this.dead) { this.parts.paint.color.lerp(new THREE.Color(0x1a1714), Math.min(1, dt * 0.5)); }
  }
}
