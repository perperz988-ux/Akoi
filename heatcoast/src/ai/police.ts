import * as THREE from 'three';
import type { Game } from '../game/game';
import { Actor } from '../actors/actor';
import { randomLook } from '../actors/humanoid';
import { Vehicle } from '../vehicles/vehicle';
import { NODES, EDGES, route, nearestNode, poiById, otherEnd } from '../world/layout';
import { rng, clamp, wrapAngle, dampAngle } from '../core/math';
import { GeoBuilder } from '../render/geo';

/** Wanted system: witnesses -> stars, pursuit, line-of-sight search area, cruisers, foot officers, helicopter, busts. */
export class Police {
  stars = 0; heat = 0; lastSeen = { x: 0, z: 0 }; seenT = 0; unseenT = 0; searching = false; bust = 0;
  cars: Vehicle[] = []; cops: Actor[] = [];
  heli: THREE.Group | null = null; private heliPos = new THREE.Vector3(); private heliShotT = 0; private beam: THREE.Mesh | null = null;
  private spawnT = 0; neverWanted = false; private recentCrimes: { t: number; lvl: number }[] = [];
  constructor(private g: Game) {}
  get searchRadius() { return 70 + this.stars * 45; }

  /** A crime has been reported (by a witness or seen by a cop). */
  report(level: number, x: number, z: number, witness?: Actor | null, direct = false) {
    if (this.neverWanted || this.g.cheats.noWanted) return;
    if (witness && witness.dead) return;
    const g = this.g;
    const prev = this.stars;
    this.recentCrimes.push({ t: g.time, lvl: level }); this.recentCrimes = this.recentCrimes.filter((c) => g.time - c.t < 90);
    const sum = this.recentCrimes.reduce((s, c) => s + c.lvl, 0);
    const lvl = clamp(Math.max(this.stars, Math.ceil(level), sum >= 12 ? 4 : sum >= 7 ? 3 : sum >= 4 ? 2 : 1), 0, 5);
    if (this.stars === 0 || direct || lvl > this.stars) { this.lastSeen = { x, z }; this.unseenT = 0; this.searching = false; }
    this.stars = Math.max(this.stars, lvl);
    if (this.stars !== prev) { g.audio.wanted(); g.hud.toast(this.stars > prev && prev === 0 ? 'You are wanted by the police' : `Wanted level ${this.stars}`); g.bus.emit('wanted', this.stars); g.phone.pulsePost('wanted', this.stars); }
  }
  setStars(n: number) { const was = this.stars; this.stars = clamp(n, 0, 5); if (this.stars) { this.lastSeen = { x: this.g.player.x, z: this.g.player.z }; } if (was && !this.stars) this.clear(); }
  clear() {
    this.stars = 0; this.searching = false; this.recentCrimes = []; this.bust = 0;
    for (const v of this.cars) { v.siren = false; if (v.ai) v.ai.mode = 'leave'; }
    for (const c of this.cops) { c.ai.state = 'leave'; }
    this.g.bus.emit('wanted', 0);
  }

  update(dt: number) {
    const g = this.g, P = g.player;
    this.cars = this.cars.filter((v) => g.vehicles.list.includes(v)); this.cops = this.cops.filter((c) => g.peds.list.includes(c));
    // cleanup units far away when not wanted
    for (const v of this.cars) { const d = Math.hypot(v.x - P.x, v.z - P.z); if ((this.stars === 0 && d > 120) || d > 420) { if (!g.isVisible(v.x, v.y + 1, v.z) || d > 300) { for (const s of v.seats) if (s) g.peds.remove(s as Actor); g.vehicles.remove(v); } } }
    for (const c of this.cops) { const d = Math.hypot(c.x - P.x, c.z - P.z); if (!c.vehicle && ((this.stars === 0 && d > 70 && !g.isVisible(c.x, c.y + 1, c.z)) || d > 300 || (c.dead && c.deadT > 30))) g.peds.remove(c); }
    if (this.stars === 0) { this.updateHeli(dt, false); for (const v of this.cars) this.driveCar(v, dt, null); return; }
    // line of sight from any unit
    let seen = false;
    const pp = new THREE.Vector3(P.x, P.y + 1.2, P.z);
    for (const c of this.cops) { if (c.dead || c.vehicle) continue; if (Math.hypot(c.x - P.x, c.z - P.z) < 55 && g.lineOfSight(c.x, c.y + 1.6, c.z, pp.x, pp.y, pp.z)) { seen = true; break; } }
    if (!seen) for (const v of this.cars) { if (!v.driver || v.dead) continue; if (Math.hypot(v.x - P.x, v.z - P.z) < 80 && g.lineOfSight(v.x, v.y + 1.4, v.z, pp.x, pp.y, pp.z)) { seen = true; break; } }
    if (!seen && this.heli && this.heliPos.distanceTo(pp) < 90 && g.env.cloud < 0.9) seen = true;
    if (seen) { this.seenT += dt; this.unseenT = 0; this.lastSeen = { x: P.x, z: P.z }; this.searching = false; }
    else { this.unseenT += dt; if (this.unseenT > 5) this.searching = true; }
    // evade: outside the search circle long enough
    if (this.searching) {
      const d = Math.hypot(P.x - this.lastSeen.x, P.z - this.lastSeen.z);
      if (d > this.searchRadius && this.unseenT > 8 + this.stars * 2) { this.clear(); g.hud.toast('You lost the cops'); g.audio.cash(); g.player.skillUp('stealth', 0.02); return; }
    }
    // spawn units
    this.spawnT -= dt;
    const wantCars = [0, 1, 2, 3, 4, 6][this.stars], wantCops = [0, 2, 4, 6, 8, 10][this.stars];
    if (this.spawnT <= 0 && !g.interiorActive) {
      this.spawnT = 2.5;
      if (this.cars.filter((v) => v.driver && !v.dead).length < wantCars) this.spawnCruiser();
      if (this.stars >= 3 && !this.heli) this.spawnHeli();
    }
    void wantCops;
    for (const v of this.cars) this.driveCar(v, dt, P);
    for (const c of this.cops) this.copBrain(c, dt);
    this.updateHeli(dt, this.stars >= 3);
    // busted
    const nearCop = this.cops.find((c) => !c.dead && !c.vehicle && Math.hypot(c.x - P.x, c.z - P.z) < 1.8);
    const slow = !P.vehicle || P.vehicle.speed < 1.2;
    if (nearCop && slow && this.stars <= 2 && P.hp > 0) { this.bust += dt / (P.vehicle ? 3 : 1.6); if (this.bust >= 1) { this.bust = 0; g.busted(); } }
    else this.bust = Math.max(0, this.bust - dt * 0.6);
  }

  private spawnCruiser() {
    const g = this.g, P = g.player;
    // pick a road node 120-220 m away, out of sight
    let best: typeof NODES[0] | null = null;
    for (let k = 0; k < 30; k++) { const n = NODES[rng.int(0, NODES.length - 1)]; const d = Math.hypot(n.x - P.x, n.z - P.z); if (d > 110 && d < 240 && !g.isVisible(n.x, 1, n.z)) { best = n; break; } }
    if (!best) return;
    const e = EDGES[best.edges[0]]; const o = NODES[otherEnd(e, best.id)];
    const v = g.vehicles.spawn('interceptor', best.x, best.z, Math.atan2(o.x - best.x, o.z - best.z), 0x14181e, 'police');
    v.physics = true; v.siren = true; v.lightsOn = true; v.ai = { mode: 'chase', path: [], pathT: 0, stuck: 0, rev: 0 };
    for (let s = 0; s < 2; s++) { const c = this.makeCop(best.x, best.z); g.vehicles.seat(v, c, s); }
    this.cars.push(v);
  }
  makeCop(x: number, z: number) {
    const g = this.g; const c = new Actor(randomLook(() => rng.next(), 'cop')); c.faction = 'cop'; c.name = 'Officer ' + rng.pick(['Diaz', 'Kowalski', 'Bennett', 'Hayes', 'Ruiz', 'Park', 'Grant']);
    c.hp = c.maxHp = 110; c.armor = this.stars >= 4 ? 60 : 20; c.placeAt(x, z);
    c.equip(this.stars >= 4 ? rng.pick(['rifle', 'shotgun']) : 'pistol'); c.ammo[c.weapon] = 999;
    c.ai = { state: 'pursue', t: 0, brain: (a: Actor, dt: number) => this.copBrain(a, dt), acc: 0.35 + this.stars * 0.06 };
    g.peds.addActor(c); this.cops.push(c); return c;
  }
  private spawnHeli() {
    const b = new GeoBuilder();
    b.sphere(1.4, 0, 0, 0.5, 0x1a2a44, 1, 0.9, 1.7, 2, 0); b.box(0.5, 0.5, 6, 0, 0.2, -4, 0x1a2a44); b.box(0.1, 1.4, 0.8, 0, 0.8, -6.8, 0x1a2a44); b.box(2.6, 0.12, 0.15, 0, -1.4, 0.6, 0x333333); b.box(0.12, 0.6, 0.12, 0.9, -1.0, 0.6, 0x333333); b.box(0.12, 0.6, 0.12, -0.9, -1.0, 0.6, 0x333333);
    b.sphere(0.9, 0, 0.1, 1.6, 0x0a0f18, 1, 0.8, 1, 1, 0);
    const heli = new THREE.Group(); heli.add(new THREE.Mesh(b.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 })));
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.05, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 })); rotor.position.y = 1.5; heli.add(rotor); heli.userData.rotor = rotor;
    const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = -30; heli.add(beam); this.beam = beam;
    const P = this.g.player; this.heliPos.set(P.x + 200, 60, P.z + 120); this.heli = heli; this.g.scene.add(heli);
  }
  private updateHeli(dt: number, active: boolean) {
    if (!this.heli) return; const g = this.g, P = g.player;
    const tgt = active ? new THREE.Vector3(this.lastSeen.x + Math.sin(g.time * 0.3) * 25, 45 + Math.sin(g.time * 0.5) * 4, this.lastSeen.z + Math.cos(g.time * 0.3) * 25) : this.heliPos.clone().add(new THREE.Vector3(60, 25, 60));
    const k = Math.min(1, dt * 0.6); this.heliPos.lerp(tgt, k);
    this.heli.position.copy(this.heliPos); this.heli.lookAt(P.x, this.heliPos.y - 4, P.z); (this.heli.userData.rotor as THREE.Mesh).rotation.y += dt * 40;
    if (this.beam) { this.beam.visible = g.env.night > 0.3 && active; }
    if (!active && Math.hypot(this.heliPos.x - P.x, this.heliPos.z - P.z) > 400) { this.heli.removeFromParent(); this.heli = null; return; }
    if (active && this.stars >= 4) { this.heliShotT -= dt; if (this.heliShotT <= 0) { this.heliShotT = 0.14; if (Math.random() < 0.5) g.combat.fireFrom(this.heliPos.clone().add(new THREE.Vector3(0, -1.5, 0)), new THREE.Vector3(P.x, P.y + 1, P.z), 'rifle', 0.5, null); } }
  }

  /** Cruiser AI: road-following when far, direct pursuit when near, rams at 3+, deploys officers. */
  private driveCar(v: Vehicle, dt: number, P: Game['player'] | null) {
    const g = this.g, ai = v.ai; if (!ai) return;
    if (v.dead || !v.driver) { v.step(dt, { throttle: 0, steer: 0, handbrake: true }); v.siren = false; return; }
    if (!P || ai.mode === 'leave') { v.siren = false; const n = nearestNode(v.x + Math.sin(v.yaw) * 60, v.z + Math.cos(v.yaw) * 60); this.steerTo(v, n.x, n.z, 12, dt); return; }
    const tx = P.vehicle ? P.vehicle.x + P.vehicle.vx * 0.8 : P.x, tz = P.vehicle ? P.vehicle.z + P.vehicle.vz * 0.8 : P.z;
    const d = Math.hypot(tx - v.x, tz - v.z);
    const target = this.searching ? this.lastSeen : { x: tx, z: tz };
    if (d > 55 || this.searching) {
      ai.pathT -= dt;
      if (ai.pathT <= 0 || !ai.path.length) { ai.path = route(v.x, v.z, target.x, target.z).slice(1); ai.pathT = 2.5; }
      while (ai.path.length > 1 && Math.hypot(ai.path[0].x - v.x, ai.path[0].z - v.z) < 14) ai.path.shift();
      const wp = ai.path[0] ?? target; this.steerTo(v, wp.x, wp.z, this.stars >= 3 ? 40 : 30, dt);
    } else {
      // close: exit to arrest / shoot when the suspect is on foot or stopped
      const pv = P.vehicle;
      if ((!pv || pv.speed < 3) && d < 26 && v.speed < 6) { this.deploy(v); v.step(dt, { throttle: 0, steer: 0, handbrake: true }); return; }
      this.steerTo(v, tx, tz, this.stars >= 3 ? 45 : 25, dt, this.stars >= 3);
    }
  }
  private steerTo(v: Vehicle, x: number, z: number, vmax: number, dt: number, ram = false) {
    const ai = v.ai; const want = Math.atan2(x - v.x, z - v.z); const err = wrapAngle(want - v.yaw); const d = Math.hypot(x - v.x, z - v.z);
    let thr = clamp((vmax - v.speed) / 6, -1, 1); if (Math.abs(err) > 1.2 && v.speed > 10) thr = -0.6; if (!ram && d < 12) thr = Math.min(thr, (d - 6) / 6);
    let steer = clamp(err * 1.6, -1, 1);
    // stuck recovery: reverse
    if (Math.abs(v.vf) < 1 && Math.abs(thr) > 0.3) ai.stuck += dt; else ai.stuck = Math.max(0, ai.stuck - dt);
    if (ai.stuck > 1.6) { ai.rev = 1.4; ai.stuck = 0; }
    if (ai.rev > 0) { ai.rev -= dt; thr = -0.8; steer = -steer; }
    const imp = v.step(dt, { throttle: thr, steer, handbrake: Math.abs(err) > 1.0 && v.speed > 14 });
    if (imp) this.g.onVehicleImpact(v, imp.impact);
  }
  private deploy(v: Vehicle) {
    for (let s = 0; s < v.seats.length; s++) { const c = v.seats[s] as Actor | null; if (c && c.faction === 'cop') { this.g.vehicles.unseat(v, s); c.ai.state = 'pursue'; } }
  }
  private copBrain(c: Actor, dt: number) {
    const g = this.g, P = g.player, ai = c.ai; if (c.dead || c.vehicle) return;
    ai.t += dt; c.fireCd -= dt;
    if (this.stars === 0 || ai.state === 'leave') { c.aiming = false; c.pose = 'walk'; const away = Math.atan2(c.x - P.x, c.z - P.z); g.peds.walkTo(c, c.x + Math.sin(away) * 10, c.z + Math.cos(away) * 10, 1.4, dt); return; }
    const tx = P.vehicle ? P.vehicle.x : P.x, tz = P.vehicle ? P.vehicle.z : P.z;
    const d = Math.hypot(tx - c.x, tz - c.z);
    const los = d < 60 && g.lineOfSight(c.x, c.y + 1.6, c.z, tx, P.y + 1.2, tz);
    if (this.stars <= 1) {
      // arrest attempt
      c.aiming = d < 12; c.pose = c.aiming ? 'aim' : 'walk';
      if (d > 1.4) g.peds.walkTo(c, tx, tz, d > 8 ? 5 : 2.2, dt); else g.peds.stop(c, dt);
      if (c.aiming) { c.yaw = dampAngle(c.yaw, Math.atan2(tx - c.x, tz - c.z), 10, dt); c.pose = d > 1.4 ? 'aim' : 'aim'; }
      if (ai.t > 1 && Math.random() < dt * 0.2) g.bubble(c, rng.pick(['Freeze! Hands where I can see them!', 'Get on the ground!', 'Police! Don\'t move!']));
      return;
    }
    // 2+ stars: take cover-ish positions and shoot
    const ideal = 14;
    if (!los || d > 32) g.peds.walkTo(c, tx, tz, 4.8, dt);
    else if (d < 8) { const a = Math.atan2(c.x - tx, c.z - tz); g.peds.walkTo(c, c.x + Math.sin(a) * 4, c.z + Math.cos(a) * 4, 2.5, dt); }
    else { const side = (c.id % 2 ? 1 : -1); const a = Math.atan2(c.x - tx, c.z - tz) + side * 0.6 * dt; g.peds.walkTo(c, tx + Math.sin(a) * ideal, tz + Math.cos(a) * ideal, 1.6, dt); }
    if (los && d < 45) {
      c.aiming = true; c.pose = 'aim'; c.yaw = dampAngle(c.yaw, Math.atan2(tx - c.x, tz - c.z), 12, dt);
      c.aimPitch = Math.atan2(P.y + 1.1 - (c.y + 1.45), d);
      if (c.fireCd <= 0) { const w = g.combat.def(c.weapon); c.fireCd = 1 / w.rate + 0.25 + rng.next() * 0.5; g.combat.actorShoot(c, new THREE.Vector3(tx, P.y + 1.1, tz), ai.acc * (P.vehicle ? 0.8 : 1)); }
      if (Math.random() < dt * 0.15) g.bubble(c, rng.pick(['Shots fired! Shots fired!', 'Drop the weapon!', 'Suspect is armed!', 'Need backup!']));
    } else c.aiming = false;
  }
  /** Police witness check for crimes committed in their view. */
  witness(level: number, x: number, z: number) {
    const g = this.g;
    for (const c of g.peds.list) if (c.faction === 'cop' && !c.dead && Math.hypot(c.x - x, c.z - z) < 50 && g.lineOfSight(c.x, c.y + 1.6, c.z, x, 1.2, z)) { this.report(level, x, z, c, true); return true; }
    for (const v of this.cars) if (v.driver && Math.hypot(v.x - x, v.z - z) < 60 && g.lineOfSight(v.x, v.y + 1.4, v.z, x, 1.2, z)) { this.report(level, x, z, null, true); return true; }
    return false;
  }
  stationPos() { const p = poiById('police'); return p.door; }
}
