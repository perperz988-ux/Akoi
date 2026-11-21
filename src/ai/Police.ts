import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Npc } from '../actors/Npc';
import { Vehicle } from '../vehicles/Vehicle';
import * as L from '../world/CityLayout';
import { Rng, clamp, dampAngle, wrapAngle } from '../core/MathUtil';
import { edgeOpen } from './Traffic';

const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const HEAT_STEPS = [0.9, 3, 6.5, 11, 17];
const CRIME_BASE: Record<string, number> = { assault: 0.9, murder: 2.2, gunfire: 0.6, carjack: 1.6, grandtheft: 0.9, hitrun: 1.0, vehicular: 2.0, vehicleshot: 0.4, vehicledestroy: 1.0, explosive: 2.4, robbery: 1.5, breakin: 0.6, copassault: 2.5, copkill: 5, weapon: 0.5, panic: 0.3, trespass: 0.4, heist: 4, jailbreak: 3 };

interface Pursuer { v: Vehicle; kind: 'cruiser' | 'suv' | 'swat' | 'heli' | 'roadblock'; crew: Npc[]; state: 'drive' | 'stopped' | 'blocked'; stuck: number; roleIdx: number; ramT: number }

export class Police {
  heat = 0;
  wantedLevel = 0;
  lastKnown = new THREE.Vector3();
  seen = false; seenT = 0;
  searchT = 0;
  evadeTimer = 0;
  pursuers: Pursuer[] = [];
  foot: Npc[] = [];
  heli: Pursuer | null = null;
  private spawnT = 3;
  noiseRecent = 0;
  private rng = new Rng(555);
  private pending: { t: number; kind: string; x: number; z: number; sev: number; witness: Npc | null }[] = [];
  bustedT = 0;
  roadblockT = 20;
  patrolCops: Npc[] = [];
  private hud = { flash: 0 };
  lastCrimeKind = '';
  dispatchPos = new THREE.Vector3();
  copCountOverride = -1;
  disabled = false;
  hartFavor = false;
  lastCallToast = -99;

  constructor(private g: Game) {}

  isPursuer(v: Vehicle) { return this.pursuers.some((p) => p.v === v); }
  get stars() { return this.wantedLevel; }
  get isSearching() { return this.wantedLevel > 0 && !this.seen; }

  noise(x: number, z: number, radius: number) {
    this.noiseRecent = Math.max(this.noiseRecent, 1.5);
    // cops within hearing radius turn toward the noise
    for (const n of this.foot) { if (Math.hypot(n.x - x, n.z - z) < radius * 0.6) { n.alert = 1; n.userData.invest = { x, z }; } }
  }

  // ---------------------------------------------------------------- crime reporting
  /**
   * Record a crime. Witnesses decide whether it counts: cops see it immediately,
   * civilians may phone it in. Crimes nobody sees do not raise the heat.
   */
  reportCrime(kind: string, x: number, z: number, severity = 1, opts: { victim?: Npc; direct?: boolean; witnessSource?: Npc; silent?: boolean } = {}) {
    if (this.disabled) return;
    const g = this.g;
    const base = (CRIME_BASE[kind] ?? 0.5) * (severity > 0 ? severity : 1) * 0.9;
    this.lastCrimeKind = kind;
    // mark the crime in witnesses' memory
    const vehTheft = kind === 'grandtheft' || kind === 'carjack' || kind === 'breakin';   // stealing cars is not reported by civilians
    const ws = g.peds.findWitnesses(x, z, kind === 'gunfire' || kind === 'explosive' ? 55 : 32);
    let copSaw = false, civSaw = 0;
    for (const w of ws) {
      if (w === opts.victim) continue;
      if (w.faction === 'cop' || w.faction === 'swat') { copSaw = true; continue; }
      if (vehTheft) continue;
      w.remember('crime', x, z, g.time, 'player', severity);
      civSaw++;
      if (w.faction === 'civ' && w.userData.reporter !== false && !w.userData.called && w.state !== 'phone' && !w.dead && (kind !== 'vehicleshot')) {
        if (this.rng.chance(0.55 + severity * 0.12)) { w.userData.called = true; w.state = 'phone'; w.stateT = this.rng.range(3, 6); w.userData.callWhy = kind; w.userData.phoneNormal = false; w.userData.fleeFrom = { x, z }; w.fear = Math.max(w.fear, 0.7); }
      }
    }
    if (vehTheft && !copSaw) return;
    if (opts.direct || copSaw || (opts.witnessSource && !opts.witnessSource.dead && civSaw > 0)) {
      this.addHeat(base, true, kind);
    } else if (civSaw === 0 && !opts.direct) {
      // Unwitnessed (alley, night, empty street): no heat, but loud things still get called in by distant listeners
      if (kind === 'explosive' || kind === 'gunfire') { this.pending.push({ t: g.time + this.rng.range(8, 14), kind, x, z, sev: base * 0.5, witness: null }); }
    }
    if (this.wantedLevel > 0 && (copSaw || this.seen)) { this.addHeat(base * 0.5, true, kind); }
  }

  /** A civilian finished a phone call. */
  callIn(n: Npc, why: string) {
    if (n.dead) return;
    const sev = CRIME_BASE[why] ?? 0.5;
    if (this.g.time - this.lastCallToast > 10) { this.g.hud?.toast('A witness called the police'); this.lastCallToast = this.g.time; }
    this.dispatchPos.set(n.x, 0, n.z);
    this.addHeat(sev * 0.9, false, why);
  }

  private addHeat(amount: number, seenNow: boolean, kind: string) {
    const g = this.g;
    const prev = this.wantedLevel;
    this.heat = Math.min(HEAT_STEPS[4] + 6, this.heat + amount);
    let lvl = 0; for (let i = 0; i < HEAT_STEPS.length; i++) if (this.heat >= HEAT_STEPS[i]) lvl = i + 1;
    if (g.player.vehicle?.def.cls === 'police' && lvl > 0) lvl = Math.max(lvl, 2);
    this.wantedLevel = Math.max(this.wantedLevel, lvl);
    if (seenNow) { this.seen = true; this.seenT = 0; this.lastKnown.set(g.player.x, g.player.y, g.player.z); }
    else if (prev === 0) { this.lastKnown.set(g.player.x, g.player.y, g.player.z); this.seen = false; this.searchT = 0; }
    if (this.wantedLevel > prev) { g.hud?.wantedChanged(this.wantedLevel); g.audio.wantedUp(); g.bus.emit('wantedChanged', this.wantedLevel); }
    this.evadeTimer = 0;
    void kind;
  }

  clearWanted() {
    this.heat = 0; this.wantedLevel = 0; this.seen = false; this.bustedT = 0;
    for (const p of this.pursuers) this.releasePursuer(p);
    this.pursuers.length = 0;
    for (const n of this.foot) { n.state = 'walk'; n.faction = 'civ'; this.g.peds.release(n); }
    this.foot.length = 0;
    if (this.heli) { this.releasePursuer(this.heli); this.heli = null; }
    this.g.hud?.wantedChanged(0);
    this.g.bus.emit('wantedChanged', 0);
  }

  // ---------------------------------------------------------------- update
  update(dt: number) {
    const g = this.g, p = g.player;
    this.noiseRecent = Math.max(0, this.noiseRecent - dt);
    // delayed anonymous reports
    for (let i = this.pending.length - 1; i >= 0; i--) { const e = this.pending[i]; if (g.time >= e.t) { this.pending.splice(i, 1); this.dispatchPos.set(e.x, 0, e.z); this.addHeat(e.sev, false, e.kind); } }
    this.updatePatrols(dt);
    if (this.wantedLevel === 0 || p.mode === 'dead') { this.wantedIdle(dt); return; }
    // --- perception: can anyone see the player?
    this.seenT += dt;
    let spotted = false;
    const range = (p.inVehicle ? 85 : 62) * (g.env.night > 0.5 ? 0.7 : 1) * p.visibility * (1 + this.wantedLevel * 0.08);
    const eyeCheck = (x: number, y: number, z: number, r: number) => {
      const d = Math.hypot(x - p.x, z - p.z); if (d > r) return false;
      return g.col.los(x, y + 1.6, z, p.x, p.y + 1.2, p.z);
    };
    for (const n of this.foot) if (!n.dead && n.knocked <= 0 && eyeCheck(n.x, n.y, n.z, range)) { spotted = true; break; }
    if (!spotted) for (const pu of this.pursuers) if (!pu.v.exploded && (pu.v.driver || pu.crew.length) && eyeCheck(pu.v.x, pu.v.y + 0.5, pu.v.z, range * (pu.kind === 'heli' ? 1.6 : 0.9))) { spotted = true; break; }
    if (!spotted && this.heli && !this.heli.v.exploded && Math.hypot(this.heli.v.x - p.x, this.heli.v.z - p.z) < range * 2 && g.env.night < 0.9 + 0.1) spotted = g.col.los(this.heli.v.x, this.heli.v.y, this.heli.v.z, p.x, p.y + 1.2, p.z) || spotted;
    // civilians who saw crime & see player again
    if (spotted) { this.seen = true; this.seenT = 0; this.lastKnown.set(p.x, p.y, p.z); this.evadeTimer = 0; if (this.heat < HEAT_STEPS[this.wantedLevel - 1]) this.heat = HEAT_STEPS[this.wantedLevel - 1]; }
    else { if (this.seen && this.seenT > 3) { this.seen = false; g.hud?.toast('Lost sight — stay hidden'); } this.evadeTimer += dt; }
    // --- cool down while unseen
    if (!this.seen) {
      const coolNeeded = 14 + this.wantedLevel * 7;
      this.searchT += dt;
      if (this.evadeTimer > coolNeeded) {
        this.heat = Math.max(0, this.heat - dt * (1.2 + this.wantedLevel * 0.2));
        let lvl = 0; for (let i = 0; i < HEAT_STEPS.length; i++) if (this.heat >= HEAT_STEPS[i]) lvl = i + 1;
        if (lvl < this.wantedLevel) { this.wantedLevel = lvl; this.evadeTimer = coolNeeded * 0.5; g.hud?.wantedChanged(lvl); if (lvl === 0) { g.hud?.toast('Wanted level cleared'); this.clearWanted(); g.audio.wantedDown(); return; } }
      }
    } else this.searchT = 0;

    this.dispatch(dt);
    this.updatePursuers(dt);
    this.updateFootCops(dt);
    this.updateBusted(dt);
  }

  private wantedIdle(dt: number) {
    // cool down any lingering heat
    this.heat = Math.max(0, this.heat - dt * 0.2);
  }

  // ---------------------------------------------------------------- patrol cops (always present, light)
  private patrolT = 2;
  private updatePatrols(dt: number) {
    const g = this.g;
    this.patrolT -= dt;
    // light police presence: a few foot patrols in urban districts near the player
    if (this.patrolT <= 0) {
      this.patrolT = 6;
      const nearPatrol = this.patrolCops.filter((n) => !n.dead);
      this.patrolCops = nearPatrol;
      const want = g.quality.name === 'LOW' ? 1 : 3;
      if (this.wantedLevel === 0 && nearPatrol.length < want) {
        const x = g.player.x + this.rng.range(-120, 120), z = g.player.z + this.rng.range(-120, 120);
        const d = L.districtAt(x, z);
        if (L.isUrban(d) && !L.onRoad(x, z) && !L.isWater(x, z) && L.groundY(x, z) >= 0 && (d === L.District.Downtown || d === L.District.Midtown || d === L.District.Shopping || d === L.District.Resort)) {
          const sp = new THREE.Vector3(x, 1, z).project(g.cam.camera);
          if (!(sp.z < 1 && Math.abs(sp.x) < 1.1 && Math.abs(sp.y) < 1.1)) {
            const c = this.makeCop('cop'); c.x = x; c.z = z; c.y = 0; c.state = 'walk'; c.userData.patrol = true; c.userData.walk = undefined;
            c.brain = (n, dt2) => this.patrolBrain(n, dt2);
            this.patrolCops.push(c);
          }
        }
      }
    }
    for (const c of this.patrolCops) { const d = Math.hypot(c.x - g.player.x, c.z - g.player.z); if (d > 280 && !c.dead) { g.peds.release(c); c.userData.gone = true; } }
    this.patrolCops = this.patrolCops.filter((c) => !c.userData.gone);
  }
  private patrolBrain(n: Npc, dt: number) {
    const g = this.g;
    if (this.wantedLevel > 0) { n.brain = null; n.userData.patrol = false; this.foot.push(n); n.state = 'combat'; return; }
    // wander slowly, look at player if suspicious
    const ud = n.userData;
    if (!ud.wp || Math.hypot(ud.wp.x - n.x, ud.wp.z - n.z) < 1.2) { ud.wp = { x: n.x + this.rng.range(-18, 18), z: n.z + this.rng.range(-18, 18) }; if (L.isWater(ud.wp.x, ud.wp.z) || L.onRoad(ud.wp.x, ud.wp.z)) ud.wp = { x: n.x, z: n.z }; }
    const dx = ud.wp.x - n.x, dz = ud.wp.z - n.z, d = Math.hypot(dx, dz);
    if (d > 0.6) { n.yaw = dampAngle(n.yaw, Math.atan2(dx, dz), 6, dt); n.vx = Math.sin(n.yaw) * 1.3; n.vz = Math.cos(n.yaw) * 1.3; n.x += n.vx * dt; n.z += n.vz * dt; } else { n.vx = n.vz = 0; }
    n.hum.animate(dt, Math.hypot(n.vx, n.vz), 'walk');
    // notice weapon
    const p = g.player; const dp = Math.hypot(p.x - n.x, p.z - n.z);
    if (dp < 30 && p.aiming && p.currentWeapon.kind === 'ranged' && g.col.los(n.x, 1.6, n.z, p.x, 1.2, p.z)) { this.reportCrime('weapon', p.x, p.z, 1, { direct: true }); }
    if (dp < 12 && g.police.noiseRecent > 0 && p.noise > 30 && g.col.los(n.x, 1.6, n.z, p.x, 1.2, p.z)) this.reportCrime('gunfire', p.x, p.z, 0.4, { direct: true });
  }

  // ---------------------------------------------------------------- spawning cops
  makeCop(kind: 'cop' | 'swat'): Npc {
    const g = this.g;
    const n = new Npc(Npc.randomOutfit(this.rng, kind === 'swat' ? 'swat' : 'cop'), 1.0);
    n.faction = kind === 'swat' ? 'swat' : 'cop';
    n.name = (kind === 'swat' ? 'Officer ' : 'Officer ') + ['Vega', 'Dunn', 'Okoye', 'Hale', 'Ruiz', 'Park', 'Meyer', 'Quill', 'Frost', 'Bright'][this.rng.int(0, 9)];
    n.health = n.maxHealth = kind === 'swat' ? 160 : 90; n.armor = kind === 'swat' ? 60 : 0;
    n.weapon = kind === 'swat' ? 'longarm' : this.wantedLevel >= 3 ? 'rattler' : 'vigil9';
    n.equip(n.weapon);
    n.speedRun = kind === 'swat' ? 5.4 : 5.8; n.speedWalk = 1.5;
    g.peds.add(n);
    return n;
  }

  private spawnDistance() { return this.rng.range(110, 190); }

  private findRoadSpawn(minD: number, maxD: number): { x: number; z: number; yaw: number } | null {
    const g = this.g, p = g.player;
    for (let tries = 0; tries < 14; tries++) {
      const ang = this.rng.range(0, 6.28), d = this.rng.range(minD, maxD);
      const x = p.x + Math.cos(ang) * d, z = p.z + Math.sin(ang) * d;
      const i = Math.round((x + L.HALF) / L.CELL), j = Math.round((z + L.HALF) / L.CELL);
      if (!L.nodeExists(i, j)) continue;
      const dirs = [0, 1, 2, 3].filter((k) => edgeOpen(i, j, k) && L.nodeExists(i + DX[k], j + DZ[k]));
      if (!dirs.length) continue;
      const dir = dirs[this.rng.int(0, dirs.length - 1)];
      const axisX = dir % 2 === 0, hw = axisX ? L.lineHalfWidth('z', j) : L.lineHalfWidth('x', i);
      const t = this.rng.range(0.15, 0.85);
      const sx = L.lineCoord(i) + DX[dir] * L.CELL * t + (-DZ[dir]) * hw * 0.5, sz = L.lineCoord(j) + DZ[dir] * L.CELL * t + DX[dir] * hw * 0.5;
      if (L.isWater(sx, sz) && !L.onBridge(sx, sz)) continue;
      const sp = new THREE.Vector3(sx, 1, sz).project(g.cam.camera);
      if (sp.z < 1 && Math.abs(sp.x) < 1.05 && Math.abs(sp.y) < 1.05 && d < 160) continue;
      let blocked = false; for (const v of g.vehicles.list) if (Math.hypot(v.x - sx, v.z - sz) < 10) { blocked = true; break; }
      if (blocked) continue;
      return { x: sx, z: sz, yaw: Math.atan2(DX[dir], DZ[dir]) };
    }
    return null;
  }

  private dispatch(dt: number) {
    const g = this.g, q = g.quality;
    this.spawnT -= dt;
    const lvl = this.wantedLevel;
    const wantCars = Math.min(q.copCap, [0, 2, 4, 6, 8, 10][lvl]);
    const alive = this.pursuers.filter((p) => !p.v.exploded && p.kind !== 'heli' && p.kind !== 'roadblock');
    if (this.spawnT <= 0 && alive.length < wantCars) {
      this.spawnT = 2.2 - lvl * 0.25;
      const sp = this.findRoadSpawn(100, 200);
      if (sp) {
        const kind: Pursuer['kind'] = lvl >= 4 && this.rng.chance(0.4) ? 'swat' : lvl >= 3 && this.rng.chance(0.4) ? 'suv' : 'cruiser';
        const id = kind === 'swat' ? 'swat_van' : kind === 'suv' ? 'pd_suv' : 'pd_cruiser';
        const v = g.vehicles.spawn(id, sp.x, sp.z, sp.yaw, 'police');
        v.sirenOn = true; v.userData.emergency = true; v.userData.keepAlive = false; v.vLong = 10;
        const crew: Npc[] = [];
        const driver = this.makeCop(kind === 'swat' ? 'swat' : 'cop'); g.vehicles.seatNpc(v, driver, 0); crew.push(driver);
        if (kind !== 'cruiser' || lvl >= 2) { const pass = this.makeCop(kind === 'swat' ? 'swat' : 'cop'); g.vehicles.seatNpc(v, pass, 1); crew.push(pass); }
        this.pursuers.push({ v, kind, crew, state: 'drive', stuck: 0, roleIdx: this.pursuers.length, ramT: 0 });
        g.audio.siren(v);
      }
    }
    // helicopter from level 3
    if (lvl >= 3 && !this.heli && this.spawnT < 0.5) {
      const sp = this.findRoadSpawn(150, 260);
      if (sp) {
        const v = g.vehicles.spawn('kite_h3', sp.x, sp.z, sp.yaw, 'police', 0x15181d, { y: 70 });
        v.engineOn = true; v.sirenOn = true; v.rotorRpm = 1; v.userData.emergency = true;
        const pilot = this.makeCop('cop'); g.vehicles.seatNpc(v, pilot, 0);
        const gunner = this.makeCop('swat'); g.vehicles.seatNpc(v, gunner, 1);
        this.heli = { v, kind: 'heli', crew: [pilot, gunner], state: 'drive', stuck: 0, roleIdx: 99, ramT: 0 };
        this.pursuers.push(this.heli);
        g.hud?.toast('Police helicopter inbound');
      }
    }
    // roadblocks (level 3+, every ~40 s) ahead of player's travel
    this.roadblockT -= dt;
    if (lvl >= 3 && this.roadblockT <= 0 && g.player.inVehicle) { this.roadblockT = 38; this.makeRoadblock(); }
  }

  private makeRoadblock() {
    const g = this.g, p = g.player, v = p.vehicle; if (!v) return;
    const dirx = v.worldVx / (v.speed || 1), dirz = v.worldVz / (v.speed || 1);
    const ax = p.x + dirx * 150, az = p.z + dirz * 150;
    const i = Math.round((ax + L.HALF) / L.CELL), j = Math.round((az + L.HALF) / L.CELL);
    if (!L.nodeExists(i, j)) return;
    const x = L.lineCoord(i), z = L.lineCoord(j);
    const hw = Math.min(L.lineHalfWidth('x', i), 8);
    for (const dd of [0, 1]) {
      const yaw = Math.atan2(dirx, dirz) + Math.PI / 2;
      const cx = x + (dd ? hw * 0.5 : -hw * 0.5) * (-dirz) * 0 + (dd ? 4 : -4) * (Math.abs(dirx) < 0.5 ? 1 : 0), cz = z + (dd ? 4 : -4) * (Math.abs(dirx) >= 0.5 ? 1 : 0);
      const cv = g.vehicles.spawn('pd_cruiser', cx, cz, yaw, 'police'); cv.sirenOn = true; cv.userData.keepAlive = false;
      const c1 = this.makeCop('cop'); c1.x = cx + 2; c1.z = cz; c1.state = 'combat'; this.foot.push(c1);
      this.pursuers.push({ v: cv, kind: 'roadblock', crew: [], state: 'stopped', stuck: 0, roleIdx: 0, ramT: 0 });
    }
    g.hud?.toast('Roadblock ahead!');
  }

  private releasePursuer(p: Pursuer) {
    for (const c of p.crew) { if (c.vehicle) this.g.vehicles.ejectNpc(p.v, c, c.seat); c.faction = 'civ'; this.g.peds.release(c); }
    p.v.sirenOn = false; p.v.role = 'traffic'; p.v.userData.brain = undefined;
    if (p.kind === 'heli') { this.g.vehicles.remove(p.v); return; }
    // make the cruiser leave: despawn when out of view
    p.v.userData.keepAlive = false; p.v.role = 'parked';
  }

  // ---------------------------------------------------------------- pursuit driving
  private updatePursuers(dt: number) {
    const g = this.g, p = g.player;
    const target = this.seen ? new THREE.Vector3(p.x, p.y, p.z) : this.lastKnown;
    for (let i = this.pursuers.length - 1; i >= 0; i--) {
      const pu = this.pursuers[i], v = pu.v;
      if (v.exploded || !g.vehicles.list.includes(v)) { for (const c of pu.crew) { if (!c.dead && c.vehicle) c.hurt(999, 'explosion', null); } this.pursuers.splice(i, 1); if (this.heli === pu) this.heli = null; continue; }
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d > 520 && pu.kind !== 'roadblock') { this.removePursuer(pu); this.pursuers.splice(i, 1); continue; }
      if (pu.kind === 'heli') { this.heliAI(pu, target, dt); continue; }
      if (pu.kind === 'roadblock') { v.ctrl.brake = 1; v.ctrl.throttle = 0; v.sleeping = false; if (d > 350) { this.removePursuer(pu); this.pursuers.splice(i, 1); } continue; }
      if (pu.state === 'stopped') { v.ctrl.throttle = 0; v.ctrl.brake = 1; continue; }
      this.driveToward(pu, target, dt, d);
      // dismount when close and player is on foot, or blocked
      const nearFoot = d < 28 && !p.inVehicle;
      const stopped = v.speed < 1.2 && d < 40 && this.seen;
      if ((nearFoot || stopped && pu.stuck > 1.5)) this.dismount(pu);
    }
  }

  private removePursuer(pu: Pursuer) {
    for (const c of pu.crew) this.g.peds.release(c);
    this.foot = this.foot.filter((n) => !pu.crew.includes(n));
    this.g.vehicles.remove(pu.v);
  }

  private dismount(pu: Pursuer) {
    const g = this.g;
    pu.state = 'stopped'; pu.v.ctrl.throttle = 0; pu.v.ctrl.brake = 1;
    for (const c of pu.crew) {
      if (c.vehicle && !c.dead) { g.vehicles.ejectNpc(pu.v, c, c.seat); c.faction = pu.kind === 'swat' ? 'swat' : 'cop'; c.state = 'combat'; c.target = g.player; c.alert = 1; this.foot.push(c); c.userData.homeV = pu.v; }
    }
    pu.crew = [];
  }

  private driveToward(pu: Pursuer, tgt: THREE.Vector3, dt: number, dist: number) {
    const g = this.g, v = pu.v, c = v.ctrl, p = g.player;
    // choose a steering point: direct when LOS or close, otherwise follow roads via greedy lattice step
    let tx = tgt.x, tz = tgt.z;
    const los = g.col.los(v.x, 1, v.z, tx, 1, tz);
    if (!los || dist > 70) {
      const i = Math.round((v.x + L.HALF) / L.CELL), j = Math.round((v.z + L.HALF) / L.CELL);
      let best: [number, number] | null = null, bs = 1e9;
      const fx = v.fwdX, fz = v.fwdZ;
      for (let d = 0; d < 4; d++) {
        if (!L.nodeExists(i, j) || !edgeOpen(i, j, d)) continue;
        const ni = i + DX[d], nj = j + DZ[d]; if (!L.nodeExists(ni, nj)) continue;
        const nx = L.lineCoord(ni), nz = L.lineCoord(nj);
        const score = Math.hypot(nx - tgt.x, nz - tgt.z) + (DX[d] * fx + DZ[d] * fz < -0.7 ? 140 : 0) + (pu.roleIdx % 2 ? this.rng.range(0, 40) : 0);
        if (score < bs) { bs = score; best = [nx, nz]; }
      }
      if (best) { const dn = Math.hypot(best[0] - v.x, best[1] - v.z); if (dn > 14 || !los) { tx = best[0]; tz = best[1]; } }
      // cut to node centre lane offset to stay on road
    }
    // flank / ram behaviour
    if (dist < 25 && p.inVehicle && this.wantedLevel >= 2) { pu.ramT += dt; }
    const dx = tx - v.x, dz = tz - v.z;
    const err = wrapAngle(Math.atan2(dx, dz) - v.yaw);
    c.steer = clamp(-err * 2.0, -1, 1);
    const topKmh = v.def.topSpeed * (0.78 + this.wantedLevel * 0.04);
    let target = Math.min(topKmh, 12 + dist * 0.35 + (p.vehicle ? p.vehicle.speed : 8) * 0.6);
    if (Math.abs(err) > 0.7) target = Math.min(target, 9);
    if (dist < 12 && !p.inVehicle) target = 3;
    // obstacle ahead (vehicles)
    const near: Vehicle[] = []; g.vehicles.grid.query(v.x + v.fwdX * 7, v.z + v.fwdZ * 7, 6, near);
    for (const o of near) if (o !== v && o !== p.vehicle && Math.abs((o.x - v.x) * -v.fwdZ + (o.z - v.z) * v.fwdX) < v.def.wid) { const a = (o.x - v.x) * v.fwdX + (o.z - v.z) * v.fwdZ; if (a > 0 && a < 8) { target = Math.min(target, Math.max(0, o.speed - 1)); if (a < 5) c.steer = clamp(c.steer + (this.rng.chance(0.5) ? 0.6 : -0.6), -1, 1); } }
    const e = target - v.vLong;
    c.throttle = e > 0.5 ? clamp(e * 0.25, 0, 1) : 0; c.brake = e < -1 ? clamp(-e * 0.15, 0, 1) : 0;
    c.handbrake = false;
    c.nitro = false;
    // stuck recovery
    if (v.speed < 1.0 && dist > 15) pu.stuck += dt; else pu.stuck = Math.max(0, pu.stuck - dt);
    if (pu.stuck > 2 && pu.stuck < 4.5) { c.throttle = 0; c.brake = 1; c.steer = -c.steer; v.ctrl.steer = -c.steer; }
    if (pu.stuck >= 4.5) { pu.stuck = 0; }
    if (pu.stuck > 3.3) { c.brake = 1; c.throttle = 0.9; /* reverse */ c.throttle = 0; }
    v.lightsOn = true; v.sirenOn = true;
  }

  private heliAI(pu: Pursuer, tgt: THREE.Vector3, dt: number) {
    const g = this.g, v = pu.v, c = v.ctrl, p = g.player;
    v.engineOn = true;
    // orbit above target at ~35 m
    const ang = g.time * 0.35 + 1.2;
    const wx = tgt.x + Math.cos(ang) * 35, wz = tgt.z + Math.sin(ang) * 35;
    const dx = wx - v.x, dz = wz - v.z, dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz); const err = wrapAngle(want - v.yaw);
    c.steer = clamp(-err * 1.5, -1, 1); c.pitch = clamp(dist / 30, 0, 0.9) * (Math.abs(err) < 1 ? 1 : 0.2);
    const wantAlt = L.groundY(v.x, v.z) + 48;
    c.lift = clamp((wantAlt - v.y) * 0.2, -1, 1); c.throttle = 1;
    v.lightsOn = true;
    // gunner at level 4+: fires at player when seen
    if (this.wantedLevel >= 4 && this.seen && Math.hypot(v.x - p.x, v.z - p.z) < 90) {
      const gn = pu.crew[1]; if (gn && !gn.dead) { gn.fireCd -= dt; if (gn.fireCd <= 0) { gn.fireCd = 0.28; gn.weapon = 'longarm'; gn.x = v.x; gn.z = v.z; gn.y = v.y - 1; gn.yaw = Math.atan2(p.x - v.x, p.z - v.z); g.combat.npcFire(gn, p.x, p.y + 1.1, p.z, 0.45); } }
    }
  }

  // ---------------------------------------------------------------- foot cops
  private updateFootCops(dt: number) {
    const g = this.g, p = g.player;
    for (let i = this.foot.length - 1; i >= 0; i--) {
      const n = this.foot[i];
      if (n.dead) { if (n.corpseT > 60) { this.foot.splice(i, 1); } continue; }
      if (n.knocked > 0 || n.stunned > 0) continue;
      const dx = p.x - n.x, dz = p.z - n.z, d = Math.hypot(dx, dz);
      if (d > 320) { g.peds.release(n); this.foot.splice(i, 1); continue; }
      const canSee = this.seen && g.col.los(n.x, 1.6, n.z, p.x, p.y + 1.2, p.z) && d < 90;
      const wlevel = this.wantedLevel;
      const wantTarget = canSee ? { x: p.x, z: p.z } : this.lastKnown.x ? { x: this.lastKnown.x, z: this.lastKnown.z } : { x: p.x, z: p.z };
      const tx = wantTarget.x - n.x, tz = wantTarget.z - n.z, td = Math.hypot(tx, tz);
      // arrest attempt on low levels: close in
      const preferMelee = wlevel <= 1 && d < 18;
      const stopDist = preferMelee ? 1.4 : n.faction === 'swat' ? 16 : 11;
      n.yaw = dampAngle(n.yaw, Math.atan2(tx, tz), 10, dt);
      let moving = false;
      if (td > stopDist + 1 || !canSee) {
        const sp = n.speedRun * (canSee ? 1 : 0.8);
        // simple obstacle sidestep: probe ahead
        let ang = Math.atan2(tx, tz);
        const px2 = n.x + Math.sin(ang) * 1.2, pz2 = n.z + Math.cos(ang) * 1.2;
        if (g.col.resolveCircle(px2, pz2, 0.35, n.y, 1.6, 0.4).hit) ang += (n.id % 2 ? 1 : -1) * 1.1;
        n.vx += (Math.sin(ang) * sp - n.vx) * Math.min(1, dt * 7); n.vz += (Math.cos(ang) * sp - n.vz) * Math.min(1, dt * 7);
        n.x += n.vx * dt; n.z += n.vz * dt; moving = true;
        const r = g.col.resolveCircle(n.x, n.z, 0.32, n.y, 1.6, 0.4); if (r.hit) { n.x = r.x; n.z = r.z; }
        n.y += (Math.max(g.col.supportY(n.x, n.z, 0.2, n.y + 0.5), L.groundY(n.x, n.z)) - n.y) * Math.min(1, dt * 12);
      } else { n.vx *= 0.8; n.vz *= 0.8; }
      // combat
      n.fireCd -= dt;
      if (canSee && d < (n.faction === 'swat' ? 70 : 45) && !preferMelee) {
        n.hum.animate(dt, moving ? n.speed : 0, 'aim');
        if (n.fireCd <= 0) {
          const w = n.weapon === 'longarm' ? 0.12 : n.weapon === 'rattler' ? 0.12 : 0.55;
          n.fireCd = n.weapon === 'vigil9' ? 0.7 + this.rng.range(0, 0.5) : 0.18 + this.rng.range(0, 0.1);
          const acc = (n.faction === 'swat' ? 0.62 : 0.4) * (p.inCover ? 0.55 : 1) * (p.crouch ? 0.8 : 1) * (Math.hypot(p.vx, p.vz) > 4 ? 0.7 : 1) + wlevel * 0.03;
          if (wlevel >= 2 || this.rng.chance(0.4 + w * 0.5)) g.combat.npcFire(n, p.x, p.y + 1.1, p.z, acc);
        }
      } else if (preferMelee && d < 2.0) { n.hum.animate(dt, 0, 'punch'); n.fireCd -= 0; if (n.fireCd <= 0) { n.fireCd = 1.0; if (!p.invuln) p.hurt(6, 'melee', n, dx / (d || 1), dz / (d || 1)); } }
      else n.hum.animate(dt, moving ? n.speed : 0, moving ? 'walk' : 'idle');
      n.syncMesh(dt, 0);
    }
    this.foot = this.foot.filter((n) => !n.dead || n.corpseT < 60);
  }

  private updateBusted(dt: number) {
    const g = this.g, p = g.player;
    if (this.wantedLevel > 2 || p.mode === 'dead') { this.bustedT = 0; return; }
    let n = 0;
    for (const c of this.foot) if (!c.dead && c.knocked <= 0 && Math.hypot(c.x - p.x, c.z - p.z) < 2.0) n++;
    const slow = p.inVehicle ? (p.vehicle!.speed < 2.5) : (Math.hypot(p.vx, p.vz) < 2.5 || p.stunned > 0);
    if (n >= 1 && slow && (n >= 2 || this.wantedLevel === 1 || p.stunned > 0)) {
      this.bustedT += dt * (1 + n * 0.3);
      g.hud?.busted(this.bustedT / 2.2);
      if (this.bustedT >= 2.2) this.arrest();
    } else { this.bustedT = Math.max(0, this.bustedT - dt * 1.5); if (this.bustedT === 0) g.hud?.busted(0); }
  }

  arrest() {
    const g = this.g, p = g.player;
    this.bustedT = 0; g.hud?.busted(0);
    const fee = clamp(Math.floor(g.economy.money * 0.1 * Math.max(1, this.wantedLevel)), 200, 8000);
    g.economy.spend(Math.min(g.economy.money, fee), 'Bail & fine');
    // confiscate illegal ammo (keep weapons owned, but lose ammo)
    for (const id of Object.keys(p.loadout.ammo)) p.loadout.ammo[id] = Math.floor(p.loadout.ammo[id] * 0.3);
    if (p.vehicle) p.exitVehicle(true);
    const st = g.poi('police');
    p.teleport(st.x, st.z + 2, Math.PI); p.health = p.maxHealth; p.stunned = 0;
    this.clearWanted();
    g.env.setHour(g.env.hour + 3);
    g.hud?.flashMessage('BUSTED', `Released on $${fee} bail`);
    g.bus.emit('busted');
    g.cam.snapBehind(p.yaw);
  }
}
