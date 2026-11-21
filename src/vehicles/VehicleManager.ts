import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Vehicle, Role } from './Vehicle';
import { defById, VehicleDef, VEHICLES } from './VehicleDefs';
import { DynamicGrid } from '../world/Collision';
import { Npc } from '../actors/Npc';
import { clamp } from '../core/MathUtil';
import { Humanoid } from '../actors/Humanoid';

export interface OwnedVehicle { uid: string; defId: string; color: number; mods: { engine: number; brakes: number; tires: number; armor: number }; premium: boolean; health: number; plate: string; stored: boolean; x: number; z: number; yaw: number }

export class VehicleManager {
  list: Vehicle[] = [];
  group = new THREE.Group();
  grid = new DynamicGrid<Vehicle>(15);
  owned: OwnedVehicle[] = [];
  private lights: THREE.SpotLight[] = [];
  private tmpV: Vehicle[] = [];
  private t = 0;
  private lightScan = 0;
  wrecks: Vehicle[] = [];

  constructor(private g: Game) {
    g.env.scene.add(this.group);
    this.setupLights();
  }

  setupLights() {
    for (const l of this.lights) { this.group.remove(l); this.group.remove(l.target); l.dispose(); }
    this.lights = [];
    for (let i = 0; i < this.g.quality.headlights; i++) {
      const l = new THREE.SpotLight(0xfff0d0, 0, 55, 0.5, 0.6, 1.6); l.castShadow = false; l.visible = false;
      this.group.add(l, l.target); this.lights.push(l);
    }
  }

  spawn(defId: string, x: number, z: number, yaw: number, role: Role = 'parked', color?: number, opts: { y?: number; engine?: boolean; premium?: boolean } = {}): Vehicle {
    const def = defById(defId);
    const rng = Math.random;
    const c = color ?? def.colors[Math.floor(rng() * def.colors.length)];
    const v = new Vehicle(def, c, opts.premium ?? false);
    v.role = role; v.place(x, z, yaw, opts.y);
    if (role === 'traffic' || role === 'police' || role === 'emergency' || role === 'gang') v.engineOn = true;
    v.lightsOn = this.g.env.night > 0.45 || role === 'police';
    v.setDetail('hidden');
    this.group.add(v.group);
    this.list.push(v);
    v.userData.onImpact = (imp: number, self: Vehicle) => this.g.bus.emit('vehicleImpact', { v: self, imp });
    if (def.cls === 'police' || def.cls === 'ambulance' || def.cls === 'swat') v.userData.emergency = true;
    return v;
  }

  spawnOwned(o: OwnedVehicle, x: number, z: number, yaw: number) {
    const v = this.spawn(o.defId, x, z, yaw, 'owned', o.color, { premium: o.premium });
    v.mods = { ...o.mods }; v.health = o.health; v.plate = o.plate; v.ownerId = o.uid; v.userData.owned = o;
    o.stored = false;
    return v;
  }

  remove(v: Vehicle) {
    const i = this.list.indexOf(v); if (i >= 0) this.list.splice(i, 1);
    if (this.g.player.vehicle === v) this.g.player.exitVehicle(true);
    v.dispose();
  }

  nearest(x: number, z: number, maxD = 30, filter?: (v: Vehicle) => boolean) {
    let best: Vehicle | null = null, bd = maxD;
    for (const v of this.list) { if (filter && !filter(v)) continue; const d = Math.hypot(v.x - x, v.z - z); if (d < bd) { bd = d; best = v; } }
    return best;
  }

  /** Remove NPC driver (carjack). */
  carjack(v: Vehicle, p: { x: number; z: number }) {
    const d = v.driver;
    if (!d || d.kind !== 'npc') return;
    const npc = d.ref as Npc;
    this.ejectNpc(v, npc, 0);
    npc.fear = 1; npc.state = 'handsup'; npc.stateT = 2.5; npc.userData.cowerFrom = { x: p.x, z: p.z };
    this.g.police.reportCrime('carjack', v.x, v.z, 1.4, { witnessSource: npc });
    v.stolen = true; v.locked = false;
    this.g.hud?.toast('Carjacked!');
    this.g.audio.horn(v);
  }

  ejectNpc(v: Vehicle, npc: Npc, slot: number) {
    const side = slot % 2 === 0 ? 1 : -1;
    const p = v.doorWorld(side * 1, new THREE.Vector3());
    npc.hum.root.removeFromParent(); npc.group.add(npc.hum.root); npc.hum.root.position.set(0, 0, 0); npc.hum.root.rotation.set(0, 0, 0);
    npc.vehicle = null; npc.x = p.x; npc.z = p.z; npc.y = v.y; npc.yaw = v.yaw + Math.PI / 2; npc.group.visible = true;
    if (slot === 0) v.driver = null; else v.passengers[slot - 1] = null;
    this.g.peds.adopt(npc);
  }

  /** Put an NPC into a vehicle (driver slot 0). */
  seatNpc(v: Vehicle, npc: Npc, slot = 0) {
    npc.vehicle = v; npc.seat = slot;
    npc.hum.root.removeFromParent(); v.group.add(npc.hum.root);
    const s = slot === 0 ? v.visual.driverPos : (v.visual.seats[slot] ?? v.visual.seats[0]);
    npc.hum.root.position.set(s.x, s.y - 0.95 + (v.isBike ? 0.2 : 0), s.z); npc.hum.root.rotation.set(0, 0, 0);
    npc.group.visible = true;
    if (slot === 0) v.driver = { kind: 'npc', hum: npc.hum, ref: npc }; else v.passengers[slot - 1] = { kind: 'npc', hum: npc.hum, ref: npc };
  }

  onPlayerEnter(v: Vehicle) {
    const wasCiv = v.role === 'traffic' || v.userData.civilian;
    if (wasCiv && !v.ownerId) {
      v.stolen = true; this.g.player.stats.carsStolen++;
      this.g.police.reportCrime('grandtheft', v.x, v.z, 1.0);
      this.g.bus.emit('stolenVehicle', v);
    }
    v.role = v.role === 'police' ? 'police' : 'player';
    v.userData.civilian = false;
    v.sleeping = false;
    this.g.audio.doorClose();
  }
  onPlayerExit(v: Vehicle) { v.sleeping = false; this.g.audio.doorClose(); }

  // -------------------------------------------------------------- per frame
  update(dt: number) {
    this.t += dt;
    const g = this.g, cam = g.cam.camera.position, px = g.player.x, pz = g.player.z;
    const simR = g.quality.simRadius + 40;
    this.grid.clear();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      const d = Math.hypot(v.x - cam.x, v.z - cam.z);
      const dp = Math.hypot(v.x - px, v.z - pz);
      // LOD
      const maxFar = g.quality.farCells * 100 * 0.8;
      const wantDetail: 'near' | 'far' | 'hidden' = d < 65 ? 'near' : d < Math.min(maxFar, 420) ? 'far' : 'hidden';
      v.setDetail(wantDetail);
      // sim culling
      const important = v === g.player.vehicle || !!v.driver && v.driver.kind === 'player' || v.userData.keepAlive || v.role === 'mission';
      if (dp > simR && !important) { if (v.role === 'traffic' || v.role === 'police' && !g.police.isPursuer(v)) { /* despawn handled by Traffic */ } v.sleeping = true; }
      const active = important || dp < simR;
      if (v.sleeping && v.speed < 0.05 && !v.driver && active && Math.abs(v.vy) < 0.1 && v.role !== 'traffic') { v.syncIfNeeded(); this.grid.insert(v); continue; }
      if (!active && !v.driver) { this.grid.insert(v); continue; }
      if (v.sleeping && (v.speed > 0.2 || v.driver)) v.sleeping = false;
      v.update(dt, g.col, 1);
      this.grid.insert(v);
      if (v.role === 'parked' && v.speed < 0.05 && !v.driver && v.onGround && v.health > 0 && !v.burning) v.sleeping = true;
      // wreck handling
      if (v.burning && !v.exploded) {
        if (v.detail !== 'hidden') { g.fx.smoke(v.x, v.y + 1, v.z, 1, 0.1, 3); if (v.burnT > 1.2) g.fx.fire(v.x, v.y + 0.8, v.z, 1); }
        if (v.burnT > 5.5 || v.health <= 0 && v.userData.explodeNow) this.explode(v);
      } else if (v.health < v.maxHealth * 0.3 && v.detail === 'near' && Math.random() < dt * 8) g.fx.smoke(v.x + v.fwdX * v.def.len * 0.35, v.y + 0.9, v.z + v.fwdZ * v.def.len * 0.35, 1, v.health < v.maxHealth * 0.15 ? 0.05 : 0.5, 1.4);
      if (v.exploded) { v.userData.wreckT = (v.userData.wreckT ?? 0) + dt; if (v.userData.wreckT > 45 && v.detail === 'hidden' || v.userData.wreckT > 120) { this.remove(v); continue; } if (v.userData.wreckT < 20) g.fx.smoke(v.x, v.y + 1, v.z, 1, 0.1, 2); }
      if (v.userData.sunk) { this.remove(v); continue; }
    }
    this.collideVehicles(dt);
    this.updateLights();
    // sirens
    g.audio.updateVehicles(this.list.filter((v) => v.detail === 'near' && (v.engineOn || v.sirenOn)), g.player.vehicle);
  }

  private collideVehicles(dt: number) {
    const out: Vehicle[] = [];
    for (const a of this.list) {
      if (a.detail === 'hidden' || a.exploded || (a.sleeping && a.speed < 0.05)) continue;
      this.grid.query(a.x, a.z, a.radius + 7, out);
      for (const b of out) {
        if (b.id <= a.id || b.exploded) continue;
        if (Math.abs(a.y - b.y) > 2.5) continue;
        this.pair(a, b, dt);
      }
    }
  }

  private pair(a: Vehicle, b: Vehicle, dt: number) {
    const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
    const rr = (a.radius + b.radius) ** 2;
    if (d2 > rr) return;
    // OBB test via circle chains
    const ca = this.circles(a), cb = this.circles(b);
    let best = 0, nx = 0, nz = 0, px = 0, pz = 0;
    for (const p of ca) for (const q of cb) {
      const ddx = q.x - p.x, ddz = q.z - p.z, dist = Math.hypot(ddx, ddz), pen = p.r + q.r - dist;
      if (pen > best) { best = pen; nx = dist > 1e-4 ? ddx / dist : 1; nz = dist > 1e-4 ? ddz / dist : 0; px = (p.x + q.x) / 2; pz = (p.z + q.z) / 2; }
    }
    if (best <= 0) return;
    a.sleeping = b.sleeping = false;
    const ma = a.def.mass, mb = b.def.mass, tot = ma + mb;
    const aMov = !(a.sleeping && !a.driver) , bMov = true;
    void aMov; void bMov;
    a.x -= nx * best * (mb / tot); a.z -= nz * best * (mb / tot);
    b.x += nx * best * (ma / tot); b.z += nz * best * (ma / tot);
    const rvx = b.worldVx - a.worldVx, rvz = b.worldVz - a.worldVz;
    const vn = rvx * nx + rvz * nz;
    if (vn < 0) {
      const e = 0.28, j = -(1 + e) * vn / (1 / ma + 1 / mb);
      a.setWorldVel(a.worldVx - (j / ma) * nx, a.worldVz - (j / ma) * nz);
      b.setWorldVel(b.worldVx + (j / mb) * nx, b.worldVz + (j / mb) * nz);
      const imp = -vn;
      // spin from off-centre contact
      const ra = (px - a.x) * nz - (pz - a.z) * nx, rb = (px - b.x) * nz - (pz - b.z) * nx;
      a.yawRate += clamp(ra * imp * 0.02 * (mb / tot), -1.5, 1.5); b.yawRate += clamp(-rb * imp * 0.02 * (ma / tot), -1.5, 1.5);
      if (imp > 1.8) {
        a.registerImpact(imp, nx, nz, b); b.registerImpact(imp, -nx, -nz, a);
        const g = this.g;
        g.fx.sparks(px, a.y + 0.6, pz, Math.min(12, imp * 1.2));
        g.audio.crash(imp, px, pz);
        g.cam.addShake(imp > 6 && (a === g.player.vehicle || b === g.player.vehicle) ? imp / 25 : 0);
        g.bus.emit('vehicleCollision', { a, b, imp, x: px, z: pz });
        const pv = g.player.vehicle;
        if ((a === pv || b === pv) && imp > 3) { const other = a === pv ? b : a; if (other.role === 'traffic' || other.role === 'parked') g.police.reportCrime('hitrun', px, pz, imp > 8 ? 0.8 : 0.4); }
      }
    }
    void dt;
  }
  private circleBuf: { x: number; z: number; r: number }[] = [];
  private circles(v: Vehicle) {
    const d = v.def, n = Math.max(2, Math.ceil(d.len / Math.max(d.wid, 0.8) / 0.85)), r = Math.max(d.wid, 0.8) / 2;
    const span = d.len / 2 - r, s = Math.sin(v.yaw), c = Math.cos(v.yaw);
    const out: { x: number; z: number; r: number }[] = [];
    for (let i = 0; i < n; i++) { const lz = -span + (span * 2 * i) / (n - 1); out.push({ x: v.x + lz * s, z: v.z + lz * c, r }); }
    return out;
  }

  explode(v: Vehicle) {
    if (v.exploded) return;
    const g = this.g;
    v.explodeVisual();
    g.fx.explosion(v.x, v.y, v.z, v.def.mass > 3000 ? 1.5 : 1);
    g.audio.explosion(v.x, v.y, v.z);
    g.combat.explode(v.x, v.y, v.z, 8, 120, v.lastHitBy ?? null, v);
    if (v.driver) { const d = v.driver; if (d.kind === 'player') { g.player.exitVehicle(true); g.player.hurt(500, 'explosion'); } else { const n = d.ref as Npc; this.ejectNpc(v, n, 0); n.hurt(999, 'explosion', null); } }
    for (let i = 0; i < v.passengers.length; i++) { const p = v.passengers[i]; if (p && p.kind === 'npc') { this.ejectNpc(v, p.ref as Npc, i + 1); (p.ref as Npc).hurt(999, 'explosion', null); } }
    v.vy = 5; v.vLong *= 0.2;
    g.bus.emit('vehicleExploded', v);
    if (v.lastHitBy === g.player || v.userData.playerCaused) g.police.reportCrime('vehicledestroy', v.x, v.z, 0.9);
  }

  private updateLights() {
    if (!this.lights.length) return;
    this.lightScan -= 1;
    const cam = this.g.cam.camera.position;
    const cands = this.list.filter((v) => v.lightsOn && v.detail === 'near' && !v.engineDead && !v.isHeli).map((v) => ({ v, d: Math.hypot(v.x - cam.x, v.z - cam.z) + (v === this.g.player.vehicle ? -1000 : 0) })).sort((a, b) => a.d - b.d);
    const night = this.g.env.night;
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i], c = cands[i];
      if (!c || night < 0.05 && this.g.env.rainLevel < 0.3) { l.visible = false; l.intensity = 0; continue; }
      const v = c.v; l.visible = true; l.intensity = 120 * (0.5 + night);
      l.position.set(v.x + v.fwdX * (v.def.len * 0.5), v.y + 0.7, v.z + v.fwdZ * (v.def.len * 0.5));
      l.target.position.set(v.x + v.fwdX * 25, v.y - 0.5, v.z + v.fwdZ * 25);
    }
  }
}
