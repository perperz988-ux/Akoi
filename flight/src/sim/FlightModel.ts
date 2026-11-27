// Six-degree-of-freedom flight dynamics: aerodynamic coefficients (lift curve with stall,
// induced/parasite/wave drag, stability derivatives), engine spool & thrust lapse, fuel burn,
// landing gear spring/damper contacts with tyre friction and brakes, fly-by-wire control laws.
import * as THREE from 'three';
import { AircraftSpec } from '../data/aircraft';
import { isa, clamp, DEG, KT, FT, G0, lerp, smooth } from '../core/geo';

export interface Controls {
  pitch: number; roll: number; yaw: number;     // pilot inputs -1..1 (pitch + = pull / nose up, roll + = right, yaw + = right)
  throttle: number[];                            // 0..1 per engine; -1..0 reverse (ground)
  flapIdx: number; spoilers: number; spoilerArmed: boolean; gearDown: boolean;
  brakes: number; parkingBrake: boolean; trim: number; tiller: number;
}
export interface Engine {
  running: boolean; starting: boolean; startT: number; fuelOn: boolean;
  n1: number; n2: number; egt: number; ff: number; thrust: number; rpm: number; fire: boolean;
}
export interface Contact { name: string; p: THREE.Vector3; gear: boolean; steer?: boolean; k: number; c: number; comp: number; onGround: boolean; wheelSpin: number }

export interface FMState {
  ias: number; tas: number; gs: number; mach: number; alpha: number; beta: number; vs: number; gload: number;
  altMSL: number; agl: number; groundH: number; heading: number; pitch: number; bank: number; track: number;
  stall: boolean; stallWarn: boolean; overspeed: boolean; onGround: boolean; weightOnWheels: boolean; onWater: boolean;
  qbar: number; rho: number; cl: number; cd: number; ld: number;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion();
const _r = new THREE.Vector3(), _vc = new THREE.Vector3(), _fw = new THREE.Vector3(), _rt = new THREE.Vector3();

export class FlightModel {
  spec: AircraftSpec;
  pos = new THREE.Vector3(); vel = new THREE.Vector3(); quat = new THREE.Quaternion(); omega = new THREE.Vector3(); // omega: body rad/s (x pitch-up, y yaw-left, z roll-left)
  mass: number; fuel: number; payload: number;
  I = new THREE.Vector3();
  ctl: Controls;
  eng: Engine[] = [];
  flap = 0;      // actual deployed flap fraction (0..1 of max)
  flapTarget = 0;
  spoiler = 0; gear = 1; // gear extension 0..1
  elev = 0; ail = 0; rud = 0; // actual surface deflections -1..1
  contacts: Contact[] = [];
  wind = new THREE.Vector3(); turbRates = new THREE.Vector3(); turbVert = 0;
  surfaceFriction = 1; surfaceGrass = false;
  assist: 'realistic' | 'assisted' = 'assisted';
  apCmd: { pitchRate: number | null; rollRate: number | null } = { pitchRate: null, rollRate: null };
  apThrottle: number | null = null;
  crashed = false; crashReason = ''; damage = 0; tailStrike = false;
  onTouchdown: ((vsFpm: number, g: number) => void) | null = null;
  st: FMState;
  private pInt = 0; private rInt = 0; private prevOnGround = true; private airborneT = 0; private gAcc = new THREE.Vector3(); private lastVel = new THREE.Vector3();
  heightAt: (x: number, z: number) => { h: number; water: boolean; grass?: boolean } = () => ({ h: 0, water: false });
  span: number; chord: number; AR: number; CLa: number;

  constructor(spec: AircraftSpec) {
    this.spec = spec;
    this.span = spec.span; this.chord = spec.wingArea / spec.span; this.AR = spec.span * spec.span / spec.wingArea;
    this.CLa = 2 * Math.PI * this.AR / (2 + Math.sqrt(this.AR * this.AR + 4));
    this.fuel = spec.fuelMax * 0.5; this.payload = (spec.mtow - spec.oew - spec.fuelMax) * 0.6;
    this.mass = spec.oew + this.fuel + Math.max(0, this.payload);
    this.ctl = { pitch: 0, roll: 0, yaw: 0, throttle: new Array(spec.engines.count).fill(0), flapIdx: 0, spoilers: 0, spoilerArmed: false, gearDown: true, brakes: 0, parkingBrake: false, trim: 0, tiller: 0 };
    for (let i = 0; i < spec.engines.count; i++) this.eng.push({ running: false, starting: false, startT: 0, fuelOn: false, n1: 0, n2: 0, egt: 15, ff: 0, thrust: 0, rpm: 0, fire: false });
    this.st = { ias: 0, tas: 0, gs: 0, mach: 0, alpha: 0, beta: 0, vs: 0, gload: 1, altMSL: 0, agl: 0, groundH: 0, heading: 0, pitch: 0, bank: 0, track: 0, stall: false, stallWarn: false, overspeed: false, onGround: true, weightOnWheels: true, onWater: false, qbar: 0, rho: 1.225, cl: 0, cd: 0, ld: 0 };
    this.buildContacts();
    this.updateInertia();
  }

  setLoad(fuelFrac: number, payloadFrac: number) {
    const s = this.spec;
    this.fuel = s.fuelMax * clamp(fuelFrac, 0.02, 1);
    const maxPayload = Math.max(0, s.mtow - s.oew - this.fuel);
    this.payload = s.category === 'General Aviation' ? Math.min(maxPayload, 80 + payloadFrac * 250) : maxPayload * clamp(payloadFrac, 0, 1) * 0.85;
    this.mass = s.oew + this.fuel + this.payload;
    this.updateInertia(); this.buildContacts();
  }

  private updateInertia() {
    const m = this.mass, s = this.spec;
    const wingFuel = this.fuel / Math.max(1, s.fuelMax);
    this.I.set(m * (0.17 * s.length) ** 2, m * ((0.12 * s.span) ** 2 + (0.17 * s.length) ** 2) * 0.95, m * (0.115 * s.span) ** 2 * (1 + wingFuel * 0.25)).multiplyScalar(s.inertiaScale);
  }

  /** Gear and structure contact points in body coords (CG at origin). */
  buildContacts() {
    const s = this.spec, g = s.gear;
    const bottom = -(s.fuselageD * 0.5 + g.height);
    const W = this.mass * G0;
    const mk = (name: string, x: number, y: number, z: number, share: number, gear: boolean, steer = false): Contact => {
      const k = gear ? (W * share) / 0.12 : W * 4;
      const c = gear ? 2 * 0.9 * Math.sqrt(k * this.mass * share) : Math.sqrt(k * this.mass) * 0.5;
      return { name, p: new THREE.Vector3(x, y, z), gear, steer, k, c, comp: 0, onGround: false, wheelSpin: 0 };
    };
    const noseZ = -g.wheelbase * 0.9, mainZ = g.wheelbase * 0.1;
    const ns = mainZ / (mainZ - noseZ), ms = (1 - ns) / 2;
    this.contacts = [
      mk('nose', 0, bottom, noseZ, ns, true, true),
      mk('mainL', -g.track / 2, bottom, mainZ, ms, true),
      mk('mainR', g.track / 2, bottom, mainZ, ms, true),
      // structure points (crash detection)
      mk('tail', 0, -s.fuselageD * 0.5 * (s.category === 'General Aviation' ? 0.2 : 0.12), s.length * 0.45, 0, false),
      mk('noseTip', 0, -s.fuselageD * 0.3, -s.length * 0.5, 0, false),
      mk('wingL', -s.span / 2, s.wingMount === 'high' ? s.fuselageD * 0.5 : -s.fuselageD * 0.25 + s.span / 2 * Math.tan(s.dihedral * DEG), s.length * 0.05, 0, false),
      mk('wingR', s.span / 2, s.wingMount === 'high' ? s.fuselageD * 0.5 : -s.fuselageD * 0.25 + s.span / 2 * Math.tan(s.dihedral * DEG), s.length * 0.05, 0, false),
    ];
    if (s.engines.mount === 'wing') for (const f of s.engines.span) for (const sd of [-1, 1])
      this.contacts.push(mk('eng', sd * f * s.span / 2, -s.fuselageD * 0.25 - s.engines.nacelleD * 0.85 + f * s.span / 2 * Math.tan(s.dihedral * DEG), -s.length * 0.08, 0, false));
    if (s.engines.type === 'piston') this.contacts.push(mk('prop', 0, -s.fuselageD * 0.5 - 0.05 + 0.0, -s.length * 0.42, 0, false));
  }

  /** Static height of CG above ground when resting on gear. */
  restHeight() { return -this.contacts[1].p.y - 0.12; }

  get flapCount() { return this.spec.flapDetents.length; }

  step(dt: number) {
    if (this.crashed) return;
    const s = this.spec, c = this.ctl;
    // --- secondary surfaces ---
    this.flapTarget = c.flapIdx / Math.max(1, this.flapCount - 1);
    this.flap += clamp(this.flapTarget - this.flap, -dt / 12, dt / 12) * (s.category === 'General Aviation' ? 1.5 : 1);
    const gearTgt = c.gearDown || s.gear.fixed ? 1 : 0;
    if (!(this.st.weightOnWheels && !c.gearDown)) this.gear += clamp(gearTgt - this.gear, -dt / 9, dt / 9);
    let spTgt = c.spoilers;
    if (c.spoilerArmed && this.st.weightOnWheels && this.airborneT > 5 && c.throttle.every(t => t < 0.15)) spTgt = 1;
    this.spoiler += clamp(spTgt - this.spoiler, -dt * 1.5, dt * 1.5);

    // --- kinematics in body frame ---
    const qInv = _q.copy(this.quat).invert();
    const vAir = _v.copy(this.vel).sub(this.wind);
    vAir.y -= this.turbVert;
    const vb = vAir.clone().applyQuaternion(qInv);
    const V = Math.max(0.1, vb.length());
    const atm = isa(this.pos.y, s.id ? (this as any).tempDev ?? 0 : 0);
    const rho = atm.rho, qbar = 0.5 * rho * V * V;
    const alpha = Math.atan2(-vb.y, -vb.z);
    const beta = Math.asin(clamp(vb.x / V, -1, 1));
    const mach = V / atm.a;
    const S = s.wingArea, b = this.span, cbar = this.chord;
    const p = -this.omega.z, q = this.omega.x, r = -this.omega.y; // roll-right, pitch-up, yaw-right
    const Vd = Math.max(V, 15); const pH = p * b / (2 * Vd), qH = q * cbar / (2 * Vd), rH = r * b / (2 * Vd);
    const aeroFade = smooth(2, 14, V);

    // --- control laws ---
    this.controlLaw(dt, { p, q, r, alpha, beta, qbar, V });

    // --- lift ---
    const fi = this.flap * (this.flapCount - 1);
    const fLo = Math.floor(fi), fHi = Math.min(this.flapCount - 1, fLo + 1), ft = fi - fLo;
    const dCLf = lerp(s.flapCL[fLo], s.flapCL[fHi], ft), dCDf = lerp(s.flapCD[fLo], s.flapCD[fHi], ft);
    const flapFrac = dCLf / Math.max(0.01, s.flapCL[s.flapCL.length - 1]);
    const clMax = lerp(s.clMaxClean, s.clMaxFull, flapFrac) * (1 - this.spoiler * 0.25);
    const a0 = -2.2 * DEG;
    let h = this.st.agl; const ge = h < b ? 1 + 0.25 * Math.pow(1 - h / b, 2) : 1; // ground effect
    const aStall = (clMax - dCLf) / this.CLa + a0;
    let CL: number;
    const ad = alpha;
    if (ad < aStall) CL = this.CLa * (ad - a0) + dCLf;
    else {
      const over = ad - aStall;
      CL = clMax - over * this.CLa * 0.9;
      CL = Math.max(CL, 0.9 * Math.sin(2 * ad) + dCLf * 0.3);
    }
    if (ad < -aStall * 0.8) CL = Math.max(CL, -1.0 + 0.9 * Math.sin(2 * ad) * 0);
    if (Math.abs(ad) > 0.6) CL = 0.95 * Math.sin(2 * ad); // flat-plate deep stall / tail slide
    CL *= ge; CL -= this.spoiler * 0.35 * Math.max(0, CL);
    const stalled = ad > aStall;
    // --- drag ---
    const mc = s.mcrit;
    const wave = mach > mc ? 20 * Math.pow(mach - mc, 4) + 0.5 * Math.pow(Math.max(0, mach - mc - 0.05), 2) : 0;
    const gearCD = s.gear.fixed ? 0 : this.gear * (s.category === 'Business Jet' ? 0.018 : 0.016);
    const CDi = (CL * CL) / (Math.PI * s.oswald * this.AR) / (ge * ge);
    const CD = s.cd0 + dCDf + gearCD + this.spoiler * 0.045 + CDi + wave + (stalled ? 0.9 * Math.pow(Math.sin(ad - aStall), 2) * 2 : 0) + Math.abs(beta) * 0.25;
    const CY = -0.95 * beta + 0.12 * this.rud;
    // --- moments ---
    const cp = s.controlPower;
    const Cm = 0.03 - 1.25 * (ad - 1.5 * DEG) - 22 * qH + 1.35 * cp * (this.elev + c.trim * 0.35) - 0.08 * flapFrac + 0.04 * this.gear * (s.category === 'General Aviation' ? 0 : 1) - (stalled ? 0.3 * (ad - aStall) * 3 : 0);
    const Cl = -0.09 * beta - 0.55 * pH + 0.14 * rH * CL + 0.2 * cp * this.ail + this.spoiler * 0 + (stalled ? (Math.random() - 0.5) * 0.04 * Math.min(1, (ad - aStall) * 10) : 0);
    const Cn = 0.14 * beta - 0.18 * rH - 0.025 * pH * CL + 0.095 * cp * this.rud - 0.012 * this.ail;
    // --- engines ---
    const T = this.engines(dt, atm, mach, V);
    // --- forces (body) ---
    const vhat = vb.clone().divideScalar(V);
    const liftDir = _rt.set(1, 0, 0).cross(vhat).normalize(); // perpendicular to airflow in symmetry plane
    const F = new THREE.Vector3();
    F.addScaledVector(liftDir, CL * qbar * S);
    F.addScaledVector(vhat, -CD * qbar * S);
    F.x += CY * qbar * S;
    // thrust along body forward, with asymmetric yaw
    let yawT = 0;
    for (let i = 0; i < this.eng.length; i++) {
      F.z -= this.eng[i].thrust;
      if (s.engines.mount === 'wing') { const n = this.eng.length; const side = n === 2 ? (i === 0 ? -1 : 1) : (i < 2 ? -1 : 1); const arm = (n === 2 ? s.engines.span[0] : s.engines.span[i === 0 || i === 3 ? 1 : 0]) * b / 2; yawT += side * this.eng[i].thrust * arm; }
    }
    // body torques (x pitch up, y yaw left, z roll left)
    const tq = new THREE.Vector3(Cm * qbar * S * cbar * aeroFade, -Cn * qbar * S * b * aeroFade + yawT, -Cl * qbar * S * b * aeroFade);
    // propeller effects (P-factor / slipstream torque) for single-engine piston
    if (s.engines.type === 'piston' && this.eng[0].thrust > 0) { tq.z -= this.eng[0].thrust * 0.02; tq.y += this.eng[0].thrust * 0.035 * (0.4 + Math.max(0, ad) * 3); }
    // turbulence
    tq.x += this.turbRates.x * this.I.x * 2; tq.y += this.turbRates.y * this.I.y * 2; tq.z += this.turbRates.z * this.I.z * 2;

    // to world
    const Fw = F.applyQuaternion(this.quat);
    Fw.y -= this.mass * G0;
    // --- ground contacts ---
    const gnd = this.contactForces(dt, Fw, tq);

    if (gnd.onGround) { tq.x -= this.omega.x * this.I.x * 3; tq.z -= this.omega.z * this.I.z * 3; }
    // --- integrate ---
    const acc = Fw.divideScalar(this.mass);
    this.vel.addScaledVector(acc, dt);
    this.pos.addScaledVector(this.vel, dt);
    // angular: I dω/dt = τ - ω × Iω
    const Iw = new THREE.Vector3(this.omega.x * this.I.x, this.omega.y * this.I.y, this.omega.z * this.I.z);
    const gyro = new THREE.Vector3().crossVectors(this.omega, Iw);
    tq.sub(gyro);
    this.omega.x += (tq.x / this.I.x) * dt; this.omega.y += (tq.y / this.I.y) * dt; this.omega.z += (tq.z / this.I.z) * dt;
    if (gnd.parked) { this.omega.multiplyScalar(0.9); }
    const dq = new THREE.Quaternion(this.omega.x * dt * 0.5, this.omega.y * dt * 0.5, this.omega.z * dt * 0.5, 1);
    this.quat.multiply(dq).normalize();

    // --- state ---
    const fwd = _fw.set(0, 0, -1).applyQuaternion(this.quat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.quat);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.quat);
    const st = this.st;
    st.alpha = alpha / DEG; st.beta = beta / DEG; st.tas = V; st.mach = mach; st.rho = rho; st.qbar = qbar;
    st.ias = V * Math.sqrt(atm.sigma) * (1 + 0.2 * mach * mach * 0.1); st.gs = Math.hypot(this.vel.x, this.vel.z); st.vs = this.vel.y;
    st.heading = (Math.atan2(fwd.x, -fwd.z) / DEG + 360) % 360;
    st.track = st.gs > 2 ? (Math.atan2(this.vel.x, -this.vel.z) / DEG + 360) % 360 : st.heading;
    st.pitch = Math.asin(clamp(fwd.y, -1, 1)) / DEG;
    st.bank = Math.atan2(-right.y, up.y) / DEG;
    st.altMSL = this.pos.y; st.cl = CL; st.cd = CD; st.ld = CL / Math.max(0.001, CD);
    st.stall = stalled && !st.weightOnWheels && V > 10;
    st.stallWarn = !st.weightOnWheels && (ad > aStall - 2.5 * DEG) && V > 10;
    st.overspeed = st.ias / KT > s.vmo + 5 || mach > s.mmo + 0.01;
    // g-load (filtered specific force along body up)
    this.gAcc.lerp(acc.clone().sub(new THREE.Vector3(0, -G0, 0)), Math.min(1, dt * 8));
    st.gload = this.gAcc.dot(up) / G0;
    if (!st.weightOnWheels) this.airborneT += dt; else if (st.gs < 5) this.airborneT = 0;
    // fuel / mass
    let ffTot = 0; for (const e of this.eng) ffTot += e.ff;
    this.fuel = Math.max(0, this.fuel - ffTot * dt);
    this.mass = s.oew + this.fuel + this.payload;
    if (this.fuel <= 0) for (const e of this.eng) { e.fuelOn = false; }
    void smooth; void FT; void h;
  }

  private controlLaw(dt: number, a: { p: number; q: number; r: number; alpha: number; beta: number; qbar: number; V: number }) {
    const s = this.spec, c = this.ctl;
    const fbw = s.control === 'fbw' || this.assist === 'assisted';
    const rate = (cur: number, tgt: number, r: number) => cur + clamp(tgt - cur, -r * dt, r * dt);
    const surfRate = s.category === 'General Aviation' ? 4 : 2.2;
    const onGnd = this.st.weightOnWheels;
    const S = s.wingArea, b = this.span, cbar = this.chord;
    const Mde = Math.max(1e-3, a.qbar * S * cbar * 1.35 * s.controlPower / this.I.x); // rad/s² per unit elevator
    const Lda = Math.max(1e-3, a.qbar * S * b * 0.2 * s.controlPower / this.I.z);
    let e: number, ai: number, ru: number;
    const apP = this.apCmd.pitchRate, apR = this.apCmd.rollRate;
    if ((fbw || apP !== null) && (!onGnd || (a.V > 30 && fbw)) && a.V > 25) {
      // pitch: rate command / attitude hold (C*-like), with alpha protection
      const qMax = onGnd ? 3.5 * DEG : s.category === 'General Aviation' ? 10 * DEG : 5 * DEG;
      const bankR = this.st.bank * DEG;
      const turnComp = Math.abs(Math.cos(bankR)) > 0.2 ? (G0 / a.V) * Math.sin(bankR) * Math.tan(bankR) : 0;
      let qCmd = apP !== null ? apP : c.pitch * qMax + turnComp * Math.cos(bankR);
      const aMax = ((s.clMaxClean + (s.clMaxFull - s.clMaxClean) * this.flap) - (s.flapCL[Math.round(this.flap * (this.flapCount - 1))] ?? 0)) / this.CLa - 2.2 * DEG;
      const aProt = aMax - 3 * DEG;
      if (a.alpha > aProt && qCmd > 0) qCmd = Math.min(qCmd, (aMax - 1.5 * DEG - a.alpha) * 2);
      if (this.st.pitch > 30 && qCmd > 0) qCmd *= 0.2;
      if (this.st.pitch < -20 && qCmd < 0) qCmd *= 0.2;
      const qErr = qCmd - a.q;
      this.pInt = clamp(this.pInt + qErr * dt * 2.5, -1.5, 1.5);
      e = clamp((4 * qErr + this.pInt) / Mde * 0.9 + (this.pInt * 0.0), -1, 1);
      // roll: rate command with bank protection
      const pMax = s.category === 'General Aviation' ? 30 * DEG : 15 * DEG;
      let pCmd: number;
      const bank = this.st.bank;
      if (apR !== null) pCmd = apR;
      else if (Math.abs(c.roll) > 0.05) pCmd = c.roll * pMax;
      else pCmd = Math.abs(bank) > 33 ? -(bank - Math.sign(bank) * 33) * DEG * 0.5 : 0;
      if (Math.abs(bank) > 67 && Math.sign(pCmd) === Math.sign(bank)) pCmd = -(bank - Math.sign(bank) * 67) * DEG;
      const pErr = pCmd - a.p;
      this.rInt = clamp(this.rInt + pErr * dt * 1.5, -0.5, 0.5);
      ai = onGnd ? c.roll : clamp((3 * pErr + this.rInt) / Lda * 0.5, -1, 1);
      // turn coordination + yaw damper
      ru = clamp(c.yaw + a.beta * 3.5 - a.r * 1.2, -1, 1);
      c.trim = rate(c.trim, 0, 0.2);
    } else {
      this.pInt *= 0.95; this.rInt *= 0.95;
      e = c.pitch; ai = c.roll; ru = c.yaw;
      if (s.control === 'boeing' && !onGnd) ru = clamp(ru - a.r * 0.8, -1, 1); // yaw damper
      // gentle pitch augmentation on the ground roll so rotation feels right
    }
    if (onGnd) { ai = c.roll; ru = c.yaw; }
    this.elev = rate(this.elev, e, surfRate); this.ail = rate(this.ail, ai, surfRate * 1.2); this.rud = rate(this.rud, ru, surfRate);
  }

  private engines(dt: number, atm: ReturnType<typeof isa>, mach: number, V: number) {
    const s = this.spec; let tot = 0;
    for (let i = 0; i < this.eng.length; i++) {
      const e = this.eng[i];
      let thr = this.apThrottle !== null ? this.apThrottle : this.ctl.throttle[i];
      if (s.engines.type === 'piston') {
        if (e.starting) { e.startT += dt; e.rpm = Math.min(e.rpm + dt * 300, 350); if (e.startT > 1.6) { e.starting = false; e.running = true; e.fuelOn = true; } }
        const tgtRpm = e.running && e.fuelOn ? 650 + clamp(thr, 0, 1) * 2050 + Math.min(200, V * 3) : 0;
        e.rpm += (tgtRpm - e.rpm) * Math.min(1, dt * (e.running ? 2.5 : 0.8));
        if (e.starting) e.rpm = Math.max(e.rpm, 300);
        const pw = e.running ? s.thrustN * Math.max(0, atm.sigma - (1 - atm.sigma) / 7.55) * Math.pow(clamp((e.rpm - 600) / 2100, 0, 1), 1.3) : 0;
        e.thrust = Math.min(2700, pw * 0.85 / (V + 12));
        e.ff = e.running ? (s.tsfc * Math.max(pw, s.thrustN * 0.05)) / 3600 : 0;
        e.n1 = e.rpm / 27; e.n2 = e.n1; e.egt = e.running ? 600 + (e.rpm / 2700) * 800 : lerp(e.egt, 60, dt * 0.05);
      } else {
        // turbofan start: starter N2 -> fuel/ignition -> self-sustaining
        if (e.starting) {
          e.startT += dt;
          if (e.n2 < 25) e.n2 += dt * 2.6; else { e.fuelOn = true; e.n2 += dt * 2.2; e.egt = Math.min(e.egt + dt * 45, 680); }
          if (e.n2 >= 58) { e.starting = false; e.running = true; }
          e.n1 = e.n2 * 0.33;
        }
        if (e.running && !e.fuelOn) e.running = false;
        const idle = 20, tgtN1 = e.running ? (thr >= 0 ? idle + clamp(thr, 0, 1) * (100 - idle) : idle + Math.min(1, -thr) * 55) : 0;
        if (!e.starting) {
          const tau = e.running ? (s.spoolUp * (e.n1 < 40 && tgtN1 > e.n1 ? 0.55 : 0.28)) : 6;
          e.n1 += (tgtN1 - e.n1) * Math.min(1, dt / tau);
          e.n2 = e.running ? 58 + (e.n1 - idle) / (100 - idle) * 42 : Math.max(0, e.n2 - dt * 3);
          const egtT = e.running ? 420 + (e.n1 / 100) ** 2 * 450 : 20;
          e.egt += (egtT - e.egt) * Math.min(1, dt * 0.5);
        }
        const lapse = Math.pow(atm.sigma, 0.75) * (1 - 0.35 * mach + 0.12 * mach * mach) * (1 + 0.15 * (1 - atm.sigma) * mach);
        const frac = e.running ? Math.max(0, (e.n1 - idle) / (100 - idle)) : 0;
        let T = e.running ? s.thrustN * lapse * (0.045 + 0.955 * Math.pow(frac, 1.5)) : 0;
        if (thr < 0 && this.st.weightOnWheels && e.running) T = -s.thrustN * 0.3 * Math.pow(frac, 1.2) * smooth(5, 25, V);
        e.thrust = T;
        e.ff = e.running ? s.tsfc * Math.max(Math.abs(T), s.thrustN * 0.03) / 3600 : 0;
        e.rpm = e.n1;
      }
      tot += e.thrust;
    }
    return tot;
  }

  private contactForces(dt: number, Fw: THREE.Vector3, tq: THREE.Vector3) {
    const s = this.spec, c = this.ctl;
    let anyGear = false, anyGround = false, parked = false; let water = false;
    const qInv = _q.copy(this.quat).invert();
    let maxComp = 0;
    const groundInfo = this.heightAt(this.pos.x, this.pos.z);
    this.st.groundH = groundInfo.h; this.st.onWater = groundInfo.water;
    this.st.agl = this.pos.y - groundInfo.h - this.restHeight();
    for (const ct of this.contacts) {
      if (ct.gear && this.gear < 0.95) { ct.onGround = false; ct.comp = 0; continue; }
      _r.copy(ct.p).applyQuaternion(this.quat);
      const wx = this.pos.x + _r.x, wz = this.pos.z + _r.z, wy = this.pos.y + _r.y;
      const gi = Math.abs(_r.x) + Math.abs(_r.z) < 3 ? groundInfo : this.heightAt(wx, wz);
      const comp = gi.h - wy;
      const prevComp = ct.comp; ct.comp = comp;
      if (comp <= 0) { ct.onGround = false; continue; }
      ct.onGround = true; anyGround = true;
      if (gi.water) water = true;
      if (!ct.gear) {
        const vImp = this.vel.length();
        if (ct.name === 'tail' && this.vel.y > -3 && comp < 0.6) { this.damage = Math.min(1, this.damage + dt * 2); this.tailStrike = true; }
        else if (vImp > 12 || this.vel.y < -3) { this.crash(ct.name === 'tail' ? 'Tail strike — structural failure' : ct.name === 'eng' ? 'Engine pod struck the ground' : ct.name.startsWith('wing') ? 'Wingtip struck the ground' : 'Fuselage impact'); return { parked }; }
        if (ct.name === 'tail' && this.vel.length() > 5) this.damage = Math.min(1, this.damage + dt * 0.5);
      }
      anyGear ||= ct.gear;
      maxComp = Math.max(maxComp, comp);
      // contact point velocity
      _vc.copy(this.omega).applyQuaternion(this.quat); // world angular velocity
      _vc.cross(_r).add(this.vel);
      const compRate = -_vc.y; void prevComp; // penetration rate from contact-point velocity (no spikes)
      let N = ct.k * comp + ct.c * compRate; if (!ct.gear) N = ct.k * comp * 0.3 + ct.c * compRate;
      N = Math.max(0, N);
      // wheel frame
      const fwd = _fw.set(0, 0, -1).applyQuaternion(this.quat); fwd.y = 0; fwd.normalize();
      if (ct.steer) {
        const maxSteer = (s.category === 'General Aviation' ? 10 : 70) * DEG;
        const spd = Math.hypot(this.vel.x, this.vel.z);
        const steer = clamp(c.tiller + c.yaw * (spd < 15 ? 1 : 0.15), -1, 1) * maxSteer * (spd > 40 ? 0.1 : 1);
        fwd.applyAxisAngle(new THREE.Vector3(0, 1, 0), -steer);
      }
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const vLong = _vc.dot(fwd), vLat = _vc.dot(side);
      const mu = this.surfaceFriction;
      const grass = gi.grass ?? false;
      let brake = ct.gear && !ct.steer ? Math.max(c.brakes, c.parkingBrake ? 1 : 0) : 0;
      const rollRes = grass ? 0.06 : 0.015;
      let fLong = -Math.sign(vLong) * N * rollRes;
      if (brake > 0) fLong += -clamp(vLong / 0.4, -1, 1) * N * 0.55 * brake * mu * (grass ? 0.6 : 1);
      if (!ct.gear) fLong = -clamp(vLong / 1, -1, 1) * N * 0.5;
      const latMu = (ct.gear ? 0.75 : 0.5) * mu;
      const fLat = -clamp(vLat / 0.6, -1, 1) * N * latMu;
      _f.set(0, N, 0).addScaledVector(fwd, fLong).addScaledVector(side, fLat);
      Fw.add(_f);
      // torque in body frame: r x F
      _t.crossVectors(_r, _f).applyQuaternion(qInv);
      tq.add(_t);
      ct.wheelSpin = vLong;
      if (ct.gear && c.parkingBrake && Math.abs(vLong) < 0.5) parked = true;
    }
    const wow = anyGear && maxComp > 0.005;
    this.st.weightOnWheels = wow; this.st.onGround = anyGround;
    if (wow && !this.prevOnGround) {
      const vsFpm = this.lastVel.y / FT * 60;
      this.onTouchdown?.(vsFpm, this.st.gload);
      if (vsFpm < -1100) this.crash(`Hard landing: ${Math.round(-vsFpm)} fpm — landing gear collapsed`);
      else if (water && this.st.gs > 15) this.crash('Ditched in water');
    }
    if (water && anyGround && this.st.gs > 20 && !this.crashed && this.airborneT > 1) this.crash('Ditched in water');
    if (!anyGear && anyGround && this.gear < 0.5 && this.st.gs > 10 && !this.crashed) this.crash('Gear-up landing');
    this.prevOnGround = wow;
    this.lastVel.copy(this.vel);
    return { parked, onGround: wow };
  }

  crash(reason: string) { if (this.crashed) return; this.crashed = true; this.crashReason = reason; this.vel.set(0, 0, 0); this.omega.set(0, 0, 0); }

  /** Place aircraft at rest or in flight. */
  place(x: number, z: number, groundH: number, headingDeg: number, airborne?: { alt: number; speed: number; pitch?: number }) {
    this.crashed = false; this.crashReason = ''; this.damage = 0;
    this.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -headingDeg * DEG);
    this.omega.set(0, 0, 0); this.pInt = 0; this.rInt = 0;
    if (airborne) {
      this.pos.set(x, airborne.alt, z);
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quat);
      // trim pitch for level flight
      this.vel.copy(fwd).multiplyScalar(airborne.speed);
      const pitch = (airborne.pitch ?? 2.5) * DEG;
      this.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
      this.prevOnGround = false; this.st.weightOnWheels = false; this.airborneT = 30;
      this.gear = this.ctl.gearDown ? 1 : 0;
    } else {
      // nose attitude from gear geometry
      const n = this.contacts[0], m = this.contacts[1];
      const pitch = Math.atan2(n.p.y - m.p.y, -(n.p.z - m.p.z));
      this.quat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch));
      this.pos.set(x, groundH + this.restHeight(), z);
      this.vel.set(0, 0, 0); this.prevOnGround = true; this.st.weightOnWheels = true; this.airborneT = 0;
      this.gear = 1; this.ctl.gearDown = true;
    }
    this.lastVel.copy(this.vel);
  }

  startEngine(i: number) {
    const e = this.eng[i]; if (!e || e.running || e.starting || this.fuel <= 0) return;
    e.starting = true; e.startT = 0;
  }
  stopEngine(i: number) { const e = this.eng[i]; if (!e) return; e.running = false; e.starting = false; e.fuelOn = false; }
  /** Instant engine start (spawn "ready for takeoff" / in-flight). */
  forceRunning() {
    for (const e of this.eng) { e.running = true; e.fuelOn = true; e.starting = false; e.n2 = 60; e.n1 = 20; e.rpm = this.spec.engines.type === 'piston' ? 800 : 20; e.egt = 450; }
  }
}
