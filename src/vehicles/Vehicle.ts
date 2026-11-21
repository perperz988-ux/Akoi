import * as THREE from 'three';
import { VehicleDef } from './VehicleDefs';
import { VehicleVisual, buildVehicleVisual, MATS, paintMat } from './VehicleMesh';
import { StaticCollision } from '../world/Collision';
import { groundY, WATER_Y, isWater } from '../world/CityLayout';
import { clamp, lerp, smoothstep, wrapAngle } from '../core/MathUtil';
import { Humanoid } from '../actors/Humanoid';

export interface Controls { throttle: number; brake: number; steer: number; handbrake: boolean; nitro: boolean; lift: number; pitch: number; horn: boolean }
export type Role = 'player' | 'traffic' | 'police' | 'parked' | 'mission' | 'gang' | 'emergency' | 'empty' | 'owned';

export interface Occupant { kind: 'player' | 'npc'; hum: Humanoid; ref: any }

let VID = 1;
const G = 9.81;

export class Vehicle {
  id = VID++;
  def: VehicleDef;
  role: Role = 'empty';
  color: number;
  visual!: VehicleVisual;
  group = new THREE.Group();
  nearMesh = new THREE.Group();
  detail: 'near' | 'far' | 'hidden' = 'hidden';
  // state
  x = 0; y = 0; z = 0; yaw = 0; vLong = 0; vLat = 0; yawRate = 0; vy = 0;
  pitchV = 0; rollV = 0; pitchVel = 0; rollVel = 0;
  steerAngle = 0; steerIn = 0;
  rpm = 900; gear = 1; shiftT = 0; throttleSm = 0;
  wheelSpin = 0;
  ctrl: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, lift: 0, pitch: 0, horn: false };
  driver: Occupant | null = null;
  passengers: (Occupant | null)[] = [];
  health: number; maxHealth: number;
  burning = false; exploded = false; burnT = 0; engineOn = false; engineDead = false;
  lightsOn = false; braking = false; reversing = false; sirenOn = false; hornT = 0;
  locked = false; stolen = false; ownerId: string | null = null; plate = '';
  onGround = true; inWater = false; sinkT = 0;
  dents: { x: number; y: number; z: number; a: number }[] = [];
  nitroFuel = 1; nitroActive = false;
  lastImpact = 0; lastHitBy: any = null;
  /** upgrade levels */
  mods = { engine: 0, brakes: 0, tires: 0, armor: 0 };
  premium = false;
  beaconPhase = 0;
  rotorRpm = 0; heliAlt = 0;
  isBike: boolean; isBoat: boolean; isHeli: boolean;
  radius: number;
  tmp = new THREE.Vector3();
  wheelH = [0, 0, 0, 0];
  wheelOff = [0, 0, 0, 0];
  dentGeoOwned = false;
  userData: any = {};
  missionId: string | null = null;
  lastDriverTime = 0;
  sleeping = false; keepOwned = false;
  syncIfNeeded() { if (this.group.visible && (this.group.position.x !== this.x || this.group.position.z !== this.z)) this.syncTransform(); }

  constructor(def: VehicleDef, color: number, premium = false) {
    this.def = def; this.color = color; this.premium = premium;
    this.maxHealth = this.health = def.hp;
    this.isBike = def.cls === 'bike'; this.isBoat = def.cls === 'boat' || def.cls === 'jetski'; this.isHeli = def.cls === 'heli';
    this.radius = Math.max(def.wid, def.len * 0.5) * 0.5 + 0.5;
    this.plate = Math.random().toString(36).slice(2, 5).toUpperCase() + ' ' + (100 + Math.floor(Math.random() * 900));
    this.passengers = new Array(Math.max(0, def.seats - 1)).fill(null);
    this.buildVisual();
    this.group.add(this.nearMesh);
    this.group.matrixAutoUpdate = true;
  }

  buildVisual() {
    if (this.visual) { this.group.remove(this.nearMesh); }
    this.nearMesh = new THREE.Group();
    this.visual = buildVehicleVisual(this.def, this.color, this.premium);
    this.nearMesh.add(this.visual.root);
    this.nearMesh.userData.far = this.visual.far;
    this.group.add(this.nearMesh);
    if (this.visual.far) { this.visual.far.visible = false; this.group.add(this.visual.far); }
    this.setDetail(this.detail === 'hidden' ? 'near' : this.detail);
  }

  setColor(c: number) {
    this.color = c;
    const m = paintMat(c, this.premium);
    for (const p of this.visual.paintMeshes) p.material = m;
    if (this.visual.far) { this.visual.far.removeFromParent(); }
    const oldDetail = this.detail;
    this.buildVisual();
    this.setDetail(oldDetail === 'hidden' ? 'near' : oldDetail);
  }

  setDetail(d: 'near' | 'far' | 'hidden') {
    if (d === this.detail) return;
    this.detail = d;
    this.group.visible = d !== 'hidden';
    this.visual.root.visible = d === 'near';
    if (this.visual.far) this.visual.far.visible = d === 'far';
    if (d === 'near') { for (const m of this.visual.paintMeshes) m.castShadow = true; }
  }

  get speed() { return Math.hypot(this.vLong, this.vLat); }
  get kmh() { return this.speed * 3.6; }
  get fwdX() { return Math.sin(this.yaw); }
  get fwdZ() { return Math.cos(this.yaw); }
  get worldVx() { return this.vLong * Math.sin(this.yaw) + this.vLat * Math.cos(this.yaw); }
  get worldVz() { return this.vLong * Math.cos(this.yaw) - this.vLat * Math.sin(this.yaw); }
  setWorldVel(vx: number, vz: number) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    this.vLong = vx * s + vz * c; this.vLat = vx * c - vz * s;
  }
  get wrecked() { return this.health <= 0; }
  get occupied() { return !!this.driver; }

  place(x: number, z: number, yaw: number, y?: number) {
    this.x = x; this.z = z; this.yaw = yaw;
    this.y = y ?? (this.isBoat ? WATER_Y : this.isHeli ? groundY(x, z) : Math.max(groundY(x, z), 0));
    this.vLong = this.vLat = this.yawRate = this.vy = 0;
    this.syncTransform();
  }

  /** Seat world position for an occupant slot (0 = driver). */
  seatWorld(slot: number, out = new THREE.Vector3()) {
    const s = slot === 0 ? this.visual.driverPos : (this.visual.seats[slot] ?? this.visual.seats[0]);
    out.set(s.x, s.y, s.z).applyMatrix4(this.group.matrixWorld);
    return out;
  }
  /** Door position (left side) in world space. */
  doorWorld(side: number, out = new THREE.Vector3()) {
    const lx = side * (this.def.wid / 2 + 0.7);
    out.set(this.x + Math.cos(this.yaw) * lx, this.y, this.z - Math.sin(this.yaw) * lx);
    return out;
  }

  damage(amount: number, source?: any) {
    if (this.exploded) return;
    const armor = 1 - this.mods.armor * 0.12;
    this.health -= amount * armor;
    if (source) this.lastHitBy = source;
    if (this.health <= 0 && !this.burning) { this.health = 0; this.burning = true; this.burnT = 0; this.engineDead = true; this.userData.wrecked = true; }
  }

  /** Visually dent the body mesh around a local point. */
  dent(lx: number, ly: number, lz: number, amount: number) {
    const mesh = this.visual.bodyMesh; if (!mesh || this.detail !== 'near') return;
    if (!this.dentGeoOwned) { mesh.geometry = mesh.geometry.clone(); this.dentGeoOwned = true; }
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const c = new THREE.Vector3(lx, ly, lz), v = new THREE.Vector3();
    const r = 0.9;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = v.distanceTo(c);
      if (d < r) {
        const f = (1 - d / r) * amount * 0.35;
        v.x -= Math.sign(lx) * f * 0.5 * (Math.abs(lx) > 0.3 ? 1 : 0);
        v.z -= Math.sign(lz) * f * (Math.abs(lz) > 0.6 ? 1 : 0.2);
        v.y -= f * 0.15 + (Math.random() - 0.5) * f * 0.1;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number, col: StaticCollision, nitroBoost = 1) {
    if (this.exploded) return;
    const sub = Math.max(1, Math.ceil(dt / 0.017));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      if (this.isHeli) this.stepHeli(h, col);
      else if (this.isBoat) this.stepBoat(h, col);
      else this.stepCar(h, col, nitroBoost);
    }
    // burning
    if (this.burning) {
      this.burnT += dt;
      this.health = 0;
      this.engineDead = true;
    }
    this.hornT = this.ctrl.horn ? this.hornT + dt : 0;
    this.beaconPhase += dt * 6;
    this.animateVisual(dt);
    this.syncTransform();
  }

  private stepCar(dt: number, col: StaticCollision, nitroBoost: number) {
    const d = this.def;
    const c = this.ctrl;
    const alive = !this.engineDead && !this.inWater && this.engineOn;
    // --- inputs
    const steerTarget = clamp(c.steer, -1, 1);
    const speedAbs = Math.abs(this.vLong);
    const steerRate = this.isBike ? 4 : 5.5;
    this.steerIn += clamp(steerTarget - this.steerIn, -steerRate * dt, steerRate * dt);
    const steerLimit = d.steer / (1 + (speedAbs / (this.isBike ? 18 : 22)) ** 1.5 * 1.4);
    this.steerAngle = -this.steerIn * steerLimit; // + = left
    const m = d.mass;
    const wb = d.wheelbase, a = wb * (1 - d.front), b = wb * d.front;
    const gripMul = 1 + this.mods.tires * 0.07;
    const wet = (this.userData.wet ?? 0) as number;
    let mu = d.grip * gripMul * (1 - wet * 0.22);
    if (this.onRoadOffsurface) mu *= 0.75;
    const sgn = this.vLong >= 0 ? 1 : -1;

    // --- drive / brake demand
    let throttle = alive ? c.throttle : 0;
    let brake = c.brake;
    let reverse = false;
    if (brake > 0.05 && this.vLong < 1.0 && throttle < 0.05) { reverse = true; throttle = brake; brake = 0; }
    this.throttleSm = lerp(this.throttleSm, throttle, 1 - Math.exp(-8 * dt));
    this.reversing = reverse && this.vLong < 0.5 && alive;
    this.braking = (brake > 0.05 && this.vLong > 0.5) || (c.brake > 0.05 && this.vLong > 0.5) || c.handbrake;
    // gearbox / rpm
    const gears = d.gears, ratios: number[] = [];
    for (let i = 0; i < gears; i++) ratios.push(lerp(3.7, 0.85, gears === 1 ? 0 : i / (gears - 1)));
    const fd = d.engine === 'ev' ? 1 : 3.6;
    const wheelRot = speedAbs / d.wheelR;
    const idle = d.engine === 'ev' ? 0 : 900;
    this.shiftT = Math.max(0, this.shiftT - dt);
    if (gears > 1) {
      const rpmAt = (g: number) => wheelRot * ratios[g - 1] * fd * 60 / (Math.PI * 2);
      let r = rpmAt(this.gear);
      if (r > d.maxRpm * 0.9 && this.gear < gears && !reverse) { this.gear++; this.shiftT = 0.18; }
      else if (r < d.maxRpm * 0.42 && this.gear > 1) { this.gear--; this.shiftT = 0.1; }
      r = rpmAt(this.gear);
      const target = alive ? Math.max(idle, Math.min(d.maxRpm, r)) : 0;
      this.rpm = lerp(this.rpm, Math.max(target, idle + throttle * d.maxRpm * 0.25 * (speedAbs < 3 ? 1 : 0)), 1 - Math.exp(-14 * dt));
    } else this.rpm = lerp(this.rpm, alive ? Math.min(d.maxRpm, wheelRot * fd * 60 / (Math.PI * 2) + 800) : 0, 1 - Math.exp(-12 * dt));
    const rpmN = this.rpm / d.maxRpm;
    const curve = 0.72 + 0.28 * Math.sin(clamp(rpmN * 1.15, 0, 1) * Math.PI);

    // nitro
    this.nitroActive = false;
    let power = d.power * (1 + this.mods.engine * 0.1);
    if (c.nitro && d.nitro && this.nitroFuel > 0.02 && alive && this.vLong > 3) { this.nitroActive = true; this.nitroFuel = Math.max(0, this.nitroFuel - dt / 4); power *= 1.7 * nitroBoost; }
    else this.nitroFuel = Math.min(1, this.nitroFuel + dt / 25);

    const vTop = d.topSpeed * (1 + this.mods.engine * 0.04) * (this.nitroActive ? 1.15 : 1);
    let Fdrive = 0;
    if (alive && this.shiftT <= 0) {
      const v = Math.max(speedAbs, 3.5);
      Fdrive = Math.min(power * curve / v, m * 9.5) * throttle * (1 - Math.pow(clamp(speedAbs / vTop, 0, 1.2), 4));
      if (reverse) { Fdrive = -Math.min(Fdrive, m * 3.5) * (speedAbs > 9 ? 0 : 1); }
    }
    // weight transfer
    const ax0 = this.axPrev ?? 0;
    const Wf = m * G * d.front - m * ax0 * (0.45 / wb) * 1.0 - 0;
    const Wr = m * G * (1 - d.front) + m * ax0 * (0.45 / wb);
    const Nf = Math.max(m * G * 0.12, Wf), Nr = Math.max(m * G * 0.12, Wr);
    // brakes
    const brakeF = (this.onGround ? 1 : 0) * (brake * d.brake * (1 + this.mods.brakes * 0.1));
    let Fbrake = -sgn * brakeF;
    // handbrake locks rear
    const hb = c.handbrake && !this.isBike ? 1 : 0;
    // split
    const drivenF = d.drive === 'fwd' ? 1 : d.drive === 'awd' ? 0.45 : 0;
    const drivenR = 1 - drivenF;
    let FxF = Fdrive * drivenF + Fbrake * 0.62;
    let FxR = Fdrive * drivenR + Fbrake * 0.38 - (hb ? sgn * Math.min(m * G * 0.7, 9000) * (speedAbs > 0.5 ? 1 : 0) : 0);
    const capF = mu * Nf, capR = mu * Nr * (hb ? 0.38 : 1);
    FxF = clamp(FxF, -capF, capF); FxR = clamp(FxR, -mu * Nr, mu * Nr);
    // slip angles
    const vxAbs = Math.max(speedAbs, 0.0001) * 0 + Math.abs(this.vLong) + 0.6;
    const alphaF = Math.atan2(this.vLat + a * this.yawRate, vxAbs) - this.steerAngle * sgn;
    const alphaR = Math.atan2(this.vLat - b * this.yawRate, vxAbs);
    const stiff = this.isBike ? 9 : 6.5;
    const latCapF = Math.sqrt(Math.max(0, capF * capF - FxF * FxF * 0.6));
    const latCapR = Math.sqrt(Math.max(0, capR * capR - FxR * FxR * (hb ? 0.2 : 0.7)));
    const FyF = -latCapF * Math.tanh(alphaF * stiff);
    const FyR = -latCapR * Math.tanh(alphaR * stiff * (hb ? 0.7 : 1));
    // resistances
    const air = 0.5 * 1.2 * d.cda * (1 + this.mods.armor * 0.01) * this.vLong * Math.abs(this.vLong) * (this.onGround ? 1 : 0.4);
    const roll = (this.onGround ? 1 : 0) * 0.015 * m * G * Math.sign(this.vLong) * (speedAbs > 0.1 ? 1 : 0);
    const sd = Math.sin(this.steerAngle), cd = Math.cos(this.steerAngle);
    let Fx = FxF * cd - FyF * sd + FxR - air - roll;
    let Fy = FyF * cd + FxF * sd + FyR;
    if (!this.onGround) { Fx *= 0.05; Fy *= 0.05; }
    const Iz = m * (d.len * d.len + d.wid * d.wid) / 12 * 1.6;
    const torque = a * (FyF * cd + FxF * sd) - b * FyR;
    const axL = Fx / m, ayL = Fy / m;
    this.vLong += (axL + this.yawRate * this.vLat) * dt;
    this.vLat += (ayL - this.yawRate * this.vLong) * dt;
    this.yawRate += (torque / Iz) * dt;
    this.axPrev = lerp(this.axPrev ?? 0, axL, 0.2);
    this.ayPrev = lerp(this.ayPrev ?? 0, ayL, 0.2);
    // low speed kinematic blend
    const kin = 1 - smoothstep(1.5, 5, speedAbs);
    if (kin > 0) {
      const rKin = (this.vLong * Math.tan(this.steerAngle)) / wb;
      this.yawRate = lerp(this.yawRate, rKin, kin * Math.min(1, dt * 12));
      this.vLat *= Math.exp(-kin * 8 * dt);
    }
    // standing still: brake holds
    if (speedAbs < 0.35 && throttle < 0.05 && !this.isBike) { this.vLong *= Math.exp(-6 * dt); }
    if (speedAbs < 0.5 && (c.handbrake || (c.brake > 0.1 && !reverse && throttle < 0.05))) { this.vLong *= 0.8; }
    this.yawRate *= Math.exp(-0.3 * dt);
    if (this.inWater) { const k = Math.exp(-2.2 * dt); this.vLong *= k; this.vLat *= k; this.yawRate *= k; }

    // --- integrate pose
    const wvx = this.worldVx, wvz = this.worldVz;
    let nx = this.x + wvx * dt, nz = this.z + wvz * dt;
    this.yaw += this.yawRate * dt;
    this.x = nx; this.z = nz;

    // --- terrain support & suspension
    this.updateSupport(dt, col);
    // --- collision
    this.collide(dt, col);
    this.wheelSpin += (this.vLong / d.wheelR) * dt;
  }
  axPrev?: number; ayPrev?: number; onRoadOffsurface = false;

  private updateSupport(dt: number, col: StaticCollision) {
    const d = this.def, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const hw = (d.track || 0.5) / 2, hl = d.wheelbase / 2;
    const pts = [[hw, hl], [-hw, hl], [hw, -hl], [-hw, -hl]];
    let sum = 0, nSamples = 0;
    const maxY = this.y + 0.9;
    for (let i = 0; i < 4; i++) {
      const [lx, lz] = pts[i];
      const wx = this.x + lx * c + lz * s, wz = this.z - lx * s + lz * c;
      const h = col.supportY(wx, wz, 0.25, maxY);
      this.wheelH[i] = h; sum += h; nSamples++;
    }
    const gAvg = sum / nSamples;
    const hf = (this.wheelH[0] + this.wheelH[1]) / 2, hr = (this.wheelH[2] + this.wheelH[3]) / 2;
    const hl_ = (this.wheelH[1] + this.wheelH[3]) / 2, hrr = (this.wheelH[0] + this.wheelH[2]) / 2; // left (x -) vs right (x +)
    const pitchT = Math.atan2(hf - hr, d.wheelbase), rollT = Math.atan2(hl_ - hrr, Math.max(d.track, 1.0));
    // water check
    const wetHere = isWater(this.x, this.z) && gAvg < WATER_Y - 0.6;
    this.inWater = wetHere;
    if (wetHere) {
      this.sinkT += dt;
      this.y = lerp(this.y, Math.max(gAvg, WATER_Y - 0.9 - this.sinkT * 0.15), 1 - Math.exp(-3 * dt));
      this.vy = 0; this.onGround = true;
      if (this.sinkT > 1.8) { this.engineDead = true; }
      if (this.sinkT > 12 && !this.userData.drowned) { this.userData.drowned = true; this.damage(this.maxHealth * 0.5); }
    } else {
      this.sinkT = Math.max(0, this.sinkT - dt * 2);
      const ground = gAvg;
      if (this.y <= ground + 0.03 && this.vy <= 0.5) {
        if (this.vy < -6) { const imp = -this.vy; this.damage((imp - 6) * 35); this.pitchVel -= imp * 0.05; this.lastImpact = imp; }
        else if (this.vy < -2.5) { this.pitchVel -= (-this.vy) * 0.05; }
        const climb = ground - this.y;
        this.y = climb > 0 ? this.y + Math.min(climb, 4 * dt + climb * 0.5) : ground;
        this.vy = 0; this.onGround = true;
      } else {
        this.vy -= G * dt; this.y += this.vy * dt; this.onGround = this.y <= ground + 0.08;
        if (this.y < ground) { this.y = ground; }
      }
    }
    // body dynamics (spring-damper)
    const ax = this.axPrev ?? 0, ay = this.ayPrev ?? 0;
    const pT = pitchT * 0.9 - ax * 0.012 * (this.def.mass > 3000 ? 2 : 1) + (this.onGround ? 0 : this.vy * 0.01);
    const rT = rollT * 0.9 + ay * 0.012 * (this.def.mass > 3000 ? 2 : 1) * (this.isBike ? 0 : 1);
    const k = 90, dmp = 13;
    this.pitchVel += ((pT - this.pitchV) * k - this.pitchVel * dmp) * dt; this.pitchV += this.pitchVel * dt;
    this.rollVel += ((rT - this.rollV) * k - this.rollVel * dmp) * dt; this.rollV += this.rollVel * dt;
    for (let i = 0; i < 4; i++) this.wheelOff[i] = lerp(this.wheelOff[i], clamp(this.wheelH[i] - gAvg, -0.25, 0.25), 0.3);
  }

  private tmpBoxes: any[] = [];
  private collide(dt: number, col: StaticCollision) {
    const d = this.def;
    const n = Math.max(2, Math.ceil(d.len / (Math.max(d.wid, 0.8) * 0.85)));
    const r = Math.max(d.wid, this.isBike ? 0.8 : 1.0) / 2 * 0.98;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let pushX = 0, pushZ = 0, hit = false, nxSum = 0, nzSum = 0, lzHit = 0;
    const span = d.len / 2 - r;
    for (let i = 0; i < n; i++) {
      const lz = n === 1 ? 0 : -span + (span * 2 * i) / (n - 1);
      const cx = this.x + lz * s + pushX, cz = this.z + lz * c + pushZ;
      const res = col.resolveCircle(cx, cz, r, this.y, d.hei * 0.85, 0.32);
      if (res.hit) {
        if (res.box && res.box.kind === 'water') continue;
        pushX += res.x - cx; pushZ += res.z - cz; hit = true; nxSum += res.nx; nzSum += res.nz; lzHit += lz;
      }
    }
    if (hit) {
      this.x += pushX; this.z += pushZ;
      const nl = Math.hypot(nxSum, nzSum) || 1, nx = nxSum / nl, nz = nzSum / nl;
      const vx = this.worldVx, vz = this.worldVz;
      const vn = vx * nx + vz * nz;
      if (vn < 0) {
        const impact = -vn;
        const e = 0.18;
        let nvx = vx - (1 + e) * vn * nx, nvz = vz - (1 + e) * vn * nz;
        // tangential friction
        const tx = -nz, tz = nx, vt = nvx * tx + nvz * tz;
        nvx -= vt * tx * 0.12; nvz -= vt * tz * 0.12;
        this.setWorldVel(nvx, nvz);
        // spin from off-centre hit
        const lzAvg = lzHit / Math.max(1, n);
        this.yawRate += clamp(-(lzAvg * (nx * c - nz * s)) * impact * 0.04, -1.5, 1.5);
        if (impact > 2.2) this.registerImpact(impact, -nx, -nz);
      }
    }
  }

  /** Called on any collision: damage, dents, events. */
  registerImpact(impact: number, dirX: number, dirZ: number, other?: Vehicle) {
    const m = other ? Math.min(1.4, other.def.mass / this.def.mass) : 1;
    const dmg = Math.max(0, impact - 2.2) ** 1.7 * 9 * m;
    this.lastImpact = Math.max(this.lastImpact, impact);
    this.damage(dmg, other ?? undefined);
    // local direction of the hit for dent
    const lx = dirX * Math.cos(this.yaw) - dirZ * Math.sin(this.yaw), lz = dirX * Math.sin(this.yaw) + dirZ * Math.cos(this.yaw);
    this.dent(clamp(-lx, -1, 1) * this.def.wid / 2, this.def.hei * 0.4, clamp(-lz, -1, 1) * this.def.len / 2, clamp(impact / 12, 0.1, 1));
    if (this.userData.onImpact) this.userData.onImpact(impact, this);
  }

  // ------------------------------------------------------------------ boats
  private stepBoat(dt: number, col: StaticCollision) {
    const d = this.def, c = this.ctrl;
    const alive = !this.engineDead && this.engineOn;
    const thr = alive ? c.throttle - (c.brake > 0.1 ? c.brake * 0.4 : 0) : 0;
    this.steerIn += clamp(c.steer - this.steerIn, -4 * dt, 4 * dt);
    const v = this.vLong;
    let power = d.power; if (c.nitro && d.nitro) power *= 1.4;
    const F = Math.min(power / Math.max(Math.abs(v), 4), d.mass * 6) * thr * (1 - Math.pow(clamp(Math.abs(v) / d.topSpeed, 0, 1.2), 3));
    this.vLong += (F / d.mass - 0.15 * v * Math.abs(v) / Math.max(d.mass * 0.05, 1) * 0.1 - v * 0.12) * dt;
    this.vLat *= Math.exp(-3.2 * dt);
    const steerEff = clamp(Math.abs(v) / 5, 0, 1) * (v >= 0 ? 1 : -1);
    const target = -this.steerIn * d.steer * 1.4 * steerEff * (1 / (1 + Math.abs(v) / 25));
    this.yawRate = lerp(this.yawRate, target, 1 - Math.exp(-3 * dt));
    this.yaw += this.yawRate * dt;
    const wvx = this.worldVx, wvz = this.worldVz;
    const nx = this.x + wvx * dt, nz = this.z + wvz * dt;
    // shore / seabed
    const probeF = 0.5 * d.len * 0.7;
    const fx = nx + Math.sin(this.yaw) * probeF, fz = nz + Math.cos(this.yaw) * probeF;
    const bad = (px: number, pz: number) => groundY(px, pz) > WATER_Y - 0.45;
    if (bad(fx, fz) || bad(nx, nz)) {
      const sp = this.speed;
      if (sp > 4) this.damage(sp * sp * 2.2);
      this.vLong *= -0.25; this.vLat *= -0.2;
      const away = bad(nx, nz);
      if (away) { this.x -= wvx * dt * 2; this.z -= wvz * dt * 2; }
    } else { this.x = nx; this.z = nz; }
    // static collisions (piers, moored boats are decoration)
    const res = col.resolveCircle(this.x, this.z, d.wid * 0.5, WATER_Y - 0.5, 1.5, 0.1);
    if (res.hit) { this.x = res.x; this.z = res.z; const vn = this.worldVx * res.nx + this.worldVz * res.nz; if (vn < 0) { this.setWorldVel(this.worldVx - 1.3 * vn * res.nx, this.worldVz - 1.3 * vn * res.nz); if (-vn > 3) this.registerImpact(-vn, -res.nx, -res.nz); } }
    this.inWater = true; this.onGround = true;
    const bob = Math.sin(performance.now() * 0.002 + this.id) * 0.06 + Math.sin(performance.now() * 0.0013 + this.id * 2) * 0.05;
    const plane = clamp(Math.abs(v) / 14, 0, 1);
    this.y = lerp(this.y, WATER_Y + 0.15 + bob + plane * 0.15, 1 - Math.exp(-6 * dt));
    this.rpm = lerp(this.rpm, alive ? 900 + Math.abs(thr) * 4500 + Math.abs(v) * 80 : 0, 0.1);
    const ax = (F / d.mass);
    this.pitchV = lerp(this.pitchV, -0.18 * plane * (1 - plane * 0.5) + clamp(ax * 0.01, -0.05, 0.1), 1 - Math.exp(-3 * dt));
    this.rollV = lerp(this.rollV, this.steerIn * clamp(Math.abs(v) / 20, 0, 1) * 0.35 + Math.sin(performance.now() * 0.0017 + this.id) * 0.02, 1 - Math.exp(-4 * dt));
    this.axPrev = ax;
    // dead engine sinks slowly if wrecked
    if (this.health <= 0) { this.y -= dt * 0.3; if (this.y < WATER_Y - 2.5) this.userData.sunk = true; }
  }

  // ------------------------------------------------------------------ helicopters
  private stepHeli(dt: number, col: StaticCollision) {
    const d = this.def, c = this.ctrl;
    const alive = !this.engineDead && this.engineOn;
    this.rotorRpm = lerp(this.rotorRpm, alive ? 1 : 0, 1 - Math.exp(-(alive ? 0.5 : 0.25) * dt));
    const power = this.rotorRpm > 0.85 ? 1 : this.rotorRpm * 0.3;
    const ground = Math.max(groundY(this.x, this.z), col.supportY(this.x, this.z, 1.5, this.y + 3));
    const agl = this.y - ground;
    // vertical
    const vyT = alive ? c.lift * 9 * power : -3;
    this.vy = lerp(this.vy, agl < 0.3 && c.lift <= 0 ? 0 : vyT, 1 - Math.exp(-1.6 * dt));
    // forward flight
    const fwd = alive ? c.pitch * power : 0;
    const maxV = d.topSpeed;
    this.vLong = lerp(this.vLong, fwd * maxV, 1 - Math.exp(-0.9 * dt));
    this.vLat *= Math.exp(-1.5 * dt);
    const yawT = alive ? -c.steer * 1.3 * power : 0;
    this.yawRate = lerp(this.yawRate, agl < 0.4 && Math.abs(c.lift) < 0.1 && Math.abs(fwd) < 0.1 ? yawT * 0.5 : yawT, 1 - Math.exp(-3 * dt));
    this.yaw += this.yawRate * dt;
    this.x += this.worldVx * dt; this.z += this.worldVz * dt; this.y += this.vy * dt;
    // collisions
    const res = col.resolveCircle(this.x, this.z, 2.4, this.y + 0.2, 2.5, 0.2);
    if (res.hit) {
      this.x = res.x; this.z = res.z;
      const sp = this.speed; if (sp > 4) { this.damage(sp * sp * 4); this.vLong *= -0.3; this.registerImpact(sp, -res.nx, -res.nz); } else this.vLong *= 0.5;
    }
    if (this.y < ground) {
      if (this.vy < -5) { this.damage((-this.vy - 5) ** 2 * 60); this.registerImpact(-this.vy, 0, 0); }
      this.y = ground; this.vy = Math.max(0, this.vy);
    }
    this.onGround = this.y - ground < 0.15;
    if (isWater(this.x, this.z) && this.y < WATER_Y + 0.5 && this.y - ground < 0.3 && ground < WATER_Y - 1) { this.damage(this.maxHealth); }
    this.heliAlt = agl;
    const tiltP = -fwd * 0.22 * power, tiltR = -this.yawRate * 0.35 * power;
    this.pitchV = lerp(this.pitchV, tiltP, 1 - Math.exp(-3 * dt)); this.rollV = lerp(this.rollV, tiltR, 1 - Math.exp(-3 * dt));
    this.rpm = this.rotorRpm * 1000;
    if (this.onGround) this.vy = Math.max(this.vy, 0);
  }

  // ------------------------------------------------------------------ visuals
  private animateVisual(dt: number) {
    if (this.detail !== 'near') return;
    const v = this.visual;
    for (let i = 0; i < v.wheels.length; i++) {
      const w = v.wheels[i];
      if (w.front) w.grp.rotation.y = this.steerAngle * (this.isBike ? 0 : 1);
      w.spin.rotation.x = this.wheelSpin;
      const off = this.wheelOff[i] ?? 0;
      if (!this.isBike) w.grp.position.y = this.def.wheelR + off * 0.8;
    }
    if (v.fork) v.fork.rotation.y = this.steerAngle * 1.4;
    if (v.steeringWheel) v.steeringWheel.rotation.z = this.isBoat ? -this.steerIn * 2 : -this.steerIn * 2.4;
    if (v.rotor) { v.rotor.rotation.y += this.rotorRpm * 40 * dt; }
    if (v.tailRotor) v.tailRotor.rotation.x += this.rotorRpm * 50 * dt;
    // lights
    if (v.headLights) v.headLights.material = this.lightsOn && !this.engineDead ? MATS.headOn : MATS.headOff;
    if (v.tailLights) v.tailLights.material = this.engineDead ? MATS.tailOff : this.braking ? MATS.tailBrake : this.reversing ? MATS.tailRev : this.lightsOn ? MATS.tailDim : MATS.tailOff;
    if (v.beaconRed && v.beaconBlue) {
      const on = this.sirenOn && !this.engineDead;
      const ph = Math.floor(this.beaconPhase) % 2 === 0;
      v.beaconRed.material = on && ph ? MATS.red : MATS.redOff; v.beaconBlue.material = on && !ph ? MATS.blue : MATS.blueOff;
    }
    if (v.lean) {
      const lean = clamp(Math.atan2(this.yawRate * this.vLong, G), -0.7, 0.7);
      v.lean.rotation.z = -lean * 1.0; v.lean.position.y = 0;
    }
  }

  syncTransform() {
    const g = this.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.set(0, 0, 0, 'YXZ');
    g.rotation.order = 'YXZ';
    g.rotation.y = this.yaw; g.rotation.x = -this.pitchV; g.rotation.z = this.rollV;
    g.updateMatrixWorld(true);
  }

  explodeVisual() {
    this.exploded = true;
    for (const m of this.visual.paintMeshes) m.material = MATS.black;
    this.visual.root.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh && me.material !== MATS.glass) me.material = MATS.black; });
    if (this.visual.far) this.visual.far.material = new THREE.MeshStandardMaterial({ color: 0x151515 });
    this.engineOn = false; this.lightsOn = false; this.sirenOn = false;
  }

  dispose() {
    this.group.removeFromParent();
    if (this.dentGeoOwned && this.visual.bodyMesh) this.visual.bodyMesh.geometry.dispose();
  }
}

export const newControls = (): Controls => ({ throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false, lift: 0, pitch: 0, horn: false });
export { wrapAngle };
