import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Npc } from '../actors/Npc';
import { Vehicle } from '../vehicles/Vehicle';
import * as L from '../world/CityLayout';
import { Rng, clamp, wrapAngle } from '../core/MathUtil';
import { edgeOpen } from './Traffic';

const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
interface Unit { v: Vehicle; kind: 'ambulance' | 'fire'; tx: number; tz: number; state: 'drive' | 'work' | 'leave'; t: number; crew: Npc[]; targets: Npc[]; veh?: Vehicle; stuck: number }

/** Ambulances and rescue crews respond to bodies, injuries and burning vehicles. */
export class Emergency {
  units: Unit[] = [];
  private rng = new Rng(112);
  private scanT = 5;
  constructor(private g: Game) {}

  dispatch(kind: 'ambulance' | 'fire', x: number, z: number, targets: Npc[] = [], veh?: Vehicle) {
    const g = this.g;
    if (this.units.filter((u) => u.kind === kind).length >= 2) return;
    // spawn at road ~220m away from the target
    for (let k = 0; k < 20; k++) {
      const a = this.rng.range(0, 6.28), d = this.rng.range(150, 260);
      const sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d;
      const i = Math.round((sx + L.HALF) / L.CELL), j = Math.round((sz + L.HALF) / L.CELL);
      if (!L.nodeExists(i, j)) continue;
      const dir = [0, 1, 2, 3].find((q) => edgeOpen(i, j, q)); if (dir === undefined) continue;
      const px = L.lineCoord(i), pz = L.lineCoord(j);
      if (Math.hypot(px - g.player.x, pz - g.player.z) < 70) continue;
      const v = g.vehicles.spawn('ambulance', px, pz, Math.atan2(DX[dir], DZ[dir]), 'emergency', kind === 'fire' ? 0xc0392b : 0xf4f4f4);
      v.sirenOn = true; v.userData.emergency = true; v.userData.keepAlive = true; v.vLong = 6;
      const crew: Npc[] = [];
      for (let c = 0; c < 2; c++) { const n = new Npc(Npc.randomOutfit(this.rng, kind === 'fire' ? 'worker' : 'medic'), 1); n.faction = 'medic'; n.name = kind === 'fire' ? 'Firefighter' : 'Paramedic'; n.userData.keep = true; g.peds.add(n); g.vehicles.seatNpc(v, n, c); crew.push(n); }
      this.units.push({ v, kind, tx: x, tz: z, state: 'drive', t: 0, crew, targets, veh, stuck: 0 });
      return;
    }
  }

  update(dt: number) {
    const g = this.g;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 8;
      // corpses near player → ambulance
      const bodies = g.peds.all().filter((n) => n.dead && n.corpseT > 6 && n.corpseT < 40 && !n.userData.collected && Math.hypot(n.x - g.player.x, n.z - g.player.z) < 160 && n.faction !== 'cop');
      if (bodies.length && this.units.filter((u) => u.kind === 'ambulance').length === 0 && g.police.wantedLevel === 0) this.dispatch('ambulance', bodies[0].x, bodies[0].z, bodies.slice(0, 2));
      // burning vehicles
      const burning = g.vehicles.list.find((v) => v.burning && !v.exploded && Math.hypot(v.x - g.player.x, v.z - g.player.z) < 180 && !v.userData.fireCalled);
      if (burning && this.units.filter((u) => u.kind === 'fire').length === 0) { burning.userData.fireCalled = true; this.dispatch('fire', burning.x, burning.z, [], burning); }
    }
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i], v = u.v;
      if (!g.vehicles.list.includes(v) || v.exploded) { for (const c of u.crew) g.peds.release(c); this.units.splice(i, 1); continue; }
      const d = Math.hypot(u.tx - v.x, u.tz - v.z);
      if (u.state === 'drive') {
        this.drive(v, u.tx, u.tz, dt, d);
        if (d < 14) { u.state = 'work'; u.t = 0; v.ctrl.throttle = 0; v.ctrl.brake = 1; v.sirenOn = true; for (const c of u.crew) if (c.vehicle) g.vehicles.ejectNpc(v, c, c.seat); }
        u.stuck = v.speed < 0.8 ? u.stuck + dt : 0; if (u.stuck > 6) { v.place(v.x + Math.sin(v.yaw) * 6, v.z + Math.cos(v.yaw) * 6, v.yaw); u.stuck = 0; }
      } else if (u.state === 'work') {
        u.t += dt;
        v.ctrl.throttle = 0; v.ctrl.brake = 1;
        for (let k = 0; k < u.crew.length; k++) {
          const c = u.crew[k]; c.faction = 'medic'; const tgt = u.targets[k % Math.max(1, u.targets.length)];
          const gx = (tgt?.x ?? u.veh?.x ?? u.tx) + (k ? 1.4 : -1.4), gz = (tgt?.z ?? u.veh?.z ?? u.tz) + 1;
          const dx = gx - c.x, dz = gz - c.z, dd = Math.hypot(dx, dz);
          c.brain = (n, dt2) => { if (dd > 1.2) { n.yaw = Math.atan2(dx, dz); n.vx = Math.sin(n.yaw) * 3.2; n.vz = Math.cos(n.yaw) * 3.2; n.x += n.vx * dt2; n.z += n.vz * dt2; n.hum.animate(dt2, 3.2, 'walk'); } else n.hum.animate(dt2, 0, 'idle'); n.syncMesh(dt2, 0); };
        }
        if (u.kind === 'fire' && u.veh) { g.fx.smoke(u.veh.x, u.veh.y + 1, u.veh.z, 1, 0.8, 2); g.fx.spawn(v.x + Math.sin(v.yaw) * 3, 1.5, v.z + Math.cos(v.yaw) * 3, (u.veh.x - v.x) * 0.5, 0.5, (u.veh.z - v.z) * 0.5, 0.6, 0.4, 0.2, 0x9fd8ff, 0xffffff, 0.8, 4, 0.3); if (u.t > 6) { u.veh.burning = false; u.veh.burnT = 0; u.veh.health = Math.max(u.veh.health, 40); u.veh.userData.fireCalled = false; } }
        if (u.kind === 'ambulance' && u.t > 8) { for (const t of u.targets) { if (t.dead) { t.userData.collected = true; g.peds.release(t); } else if (t.knocked > 0 || t.userData.injured) { t.knocked = 0; t.userData.injured = false; t.state = 'walk'; t.health = 50; } } }
        if (u.t > (u.kind === 'fire' ? 9 : 11)) { u.state = 'leave'; for (const c of u.crew) { c.brain = null; g.vehicles.seatNpc(v, c, c.seat); } v.sirenOn = u.kind === 'ambulance' ? false : false; }
      } else {
        // leave: drive away from player and despawn when far/out of view
        const ang = Math.atan2(v.x - g.player.x, v.z - g.player.z);
        this.drive(v, v.x + Math.sin(ang) * 120, v.z + Math.cos(ang) * 120, dt, 100);
        if (Math.hypot(v.x - g.player.x, v.z - g.player.z) > 260) { for (const c of u.crew) g.peds.release(c); g.vehicles.remove(v); this.units.splice(i, 1); }
      }
    }
  }

  private drive(v: Vehicle, tx: number, tz: number, dt: number, dist: number) {
    const g = this.g, c = v.ctrl;
    // road-following via greedy lattice step when far
    let gx = tx, gz = tz;
    const i = Math.round((v.x + L.HALF) / L.CELL), j = Math.round((v.z + L.HALF) / L.CELL);
    if (dist > 40) {
      let best: [number, number] | null = null, bs = 1e9;
      for (let d = 0; d < 4; d++) { if (!L.nodeExists(i, j) || !edgeOpen(i, j, d)) continue; const ni = i + DX[d], nj = j + DZ[d]; if (!L.nodeExists(ni, nj)) continue; const nx = L.lineCoord(ni), nz = L.lineCoord(nj); const s = Math.hypot(nx - tx, nz - tz) + (DX[d] * v.fwdX + DZ[d] * v.fwdZ < -0.7 ? 150 : 0); if (s < bs) { bs = s; best = [nx, nz]; } }
      if (best && Math.hypot(best[0] - v.x, best[1] - v.z) > 12) { gx = best[0]; gz = best[1]; }
    }
    const err = wrapAngle(Math.atan2(gx - v.x, gz - v.z) - v.yaw);
    c.steer = clamp(-err * 2, -1, 1);
    let target = 17 * (Math.abs(err) > 0.5 ? 0.35 : 1); if (dist < 30) target = Math.min(target, dist * 0.35);
    const near: Vehicle[] = []; g.vehicles.grid.query(v.x + v.fwdX * 8, v.z + v.fwdZ * 8, 6, near);
    for (const o of near) if (o !== v) { const a = (o.x - v.x) * v.fwdX + (o.z - v.z) * v.fwdZ, s = (o.x - v.x) * -v.fwdZ + (o.z - v.z) * v.fwdX; if (a > 0 && a < 9 && Math.abs(s) < 2.2) target = Math.min(target, Math.max(2, o.speed - 1)); }
    const e = target - v.vLong; c.throttle = e > 0.4 ? clamp(e * 0.3, 0, 0.8) : 0; c.brake = e < -1.2 ? 0.5 : 0; v.lightsOn = true; void dt;
  }
}
void THREE;
