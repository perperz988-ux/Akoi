import * as THREE from 'three';
import type { Game } from '../game/game';
import { Vehicle, VRole } from './vehicle';
import { vdef } from './models';
import { Actor } from '../actors/actor';
import { clamp, rng, wrapAngle } from '../core/math';
import { nearestNode } from '../world/layout';

/** Owns every vehicle: spawning, seating, car-car & car-pedestrian collisions, damage, fire, explosions. */
export class VehicleManager {
  list: Vehicle[] = [];
  headL: THREE.SpotLight; headR: THREE.SpotLight;
  constructor(private g: Game) {
    const mk = () => { const s = new THREE.SpotLight(0xfff1d6, 0, 70, 0.5, 0.55, 1.4); s.castShadow = false; g.scene.add(s); g.scene.add(s.target); return s; };
    this.headL = mk(); this.headR = mk();
  }
  spawn(id: string, x: number, z: number, yaw: number, color: number, role: VRole): Vehicle {
    const v = new Vehicle(vdef(id), color, this.g.q.name !== 'LOW');
    v.role = role; v.place(x, z, yaw); this.g.scene.add(v.root); this.list.push(v); return v;
  }
  remove(v: Vehicle) {
    const i = this.list.indexOf(v); if (i < 0) return; this.list.splice(i, 1);
    for (let s = 0; s < v.seats.length; s++) { const o = v.seats[s] as Actor | null; if (o && o !== (this.g.player as any)) { this.g.peds.remove(o); } }
    v.root.removeFromParent();
    v.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { const mats = Array.isArray(m.material) ? m.material : [m.material]; for (const mm of mats) if (mm === v.parts.paint || mm === v.parts.head || mm === v.parts.tail) mm.dispose(); } });
  }
  seat(v: Vehicle, a: Actor, seat: number) {
    if (seat >= v.seats.length) seat = v.seats.findIndex((s) => !s); if (seat < 0) return false;
    v.seats[seat] = a as any; a.vehicle = v; a.seat = seat;
    v.parts.body.add(a.group); a.group.position.copy(v.parts.seats[Math.min(seat, v.parts.seats.length - 1)]); a.group.rotation.set(0, 0, 0);
    a.pose = seat === 0 ? 'drive' : 'passenger'; a.vx = a.vz = 0;
    return true;
  }
  unseat(v: Vehicle, seat: number): Actor | null {
    const a = v.seats[seat] as Actor | null; if (!a) return null;
    v.seats[seat] = null; a.vehicle = null; a.seat = -1;
    this.g.scene.add(a.group);
    const side = seat % 2 === 0 ? 1 : -1; const rx = -Math.cos(v.yaw), rz = Math.sin(v.yaw); // right vector
    let x = v.x - rx * side * (v.def.wid / 2 + 0.7), z = v.z - rz * side * (v.def.wid / 2 + 0.7);
    if (seat >= 2) { x -= Math.sin(v.yaw) * 1; z -= Math.cos(v.yaw) * 1; }
    a.placeAt(x, z, v.yaw); a.pose = 'idle';
    return a;
  }

  update(dt: number) {
    const g = this.g, P = g.player;
    for (const v of this.list) {
      if (v.role === 'player' || (v === P.vehicle)) continue; // player-driven handled by Player
      if (v.role === 'traffic' && !v.physics) continue; // traffic AI kinematic
      if (v.role === 'police') continue; // police AI steps it
      if (v.ai?.panic) this.panicDrive(v, dt);
      else if (v.ai?.script) v.ai.script(v, dt);
      else { const imp = v.step(dt, { throttle: 0, steer: 0, handbrake: true }); if (imp) g.onVehicleImpact(v, imp.impact); }
    }
    // collisions between vehicles (circle pairs)
    const L = this.list;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) this.collidePair(L[i], L[j]);
    // vehicles vs pedestrians
    for (const v of L) {
      const sp = v.speed; if (sp < 2.5) { this.pushActors(v); continue; }
      for (const a of g.allActors()) {
        if (a.vehicle || a.dead && a.deadT > 2) continue;
        const lx = a.x - v.x, lz = a.z - v.z; const f = lx * Math.sin(v.yaw) + lz * Math.cos(v.yaw), s = lx * Math.cos(v.yaw) - lz * Math.sin(v.yaw);
        if (Math.abs(f) < v.def.len / 2 + 0.3 && Math.abs(s) < v.def.wid / 2 + 0.3 && Math.abs(a.y - v.y) < 2) {
          if ((a.ai?.hitCd ?? 0) > g.time) continue; if (a.ai) a.ai.hitCd = g.time + 0.8;
          const dmg = sp * sp * 0.9; const nx = v.vx / sp, nz = v.vz / sp;
          const driver = v.driver as Actor | null;
          g.combat.damageActor(a, dmg, driver, 'vehicle', nx, nz);
          a.vx = v.vx * 0.8 + nx * 2; a.vz = v.vz * 0.8 + nz * 2; a.vy = 2 + sp * 0.15; a.knockT = Math.max(a.knockT, 2);
          g.audio.impact(sp * 0.6); g.fx.blood(a.x, a.y + 1, a.z, 6);
          v.vx *= 0.92; v.vz *= 0.92;
          if (driver === (P as any) && a !== (P as any)) { g.reportCrime(a.dead ? 2 : 1, a.x, a.z, 50, true); g.bus.emit('runOver', a); }
        }
      }
    }
    // damage FX, fire & explosions
    for (const v of [...L]) {
      if (v.health < 350 && !v.exploded && Math.random() < dt * 8) g.fx.smoke(v.x + Math.sin(v.yaw) * v.def.len * 0.4, v.y + 1.1, v.z + Math.cos(v.yaw) * v.def.len * 0.4, v.health < 150 ? 0.12 : 0.55);
      if (v.burnT > 0 && !v.exploded) {
        v.burnT -= dt; if (Math.random() < dt * 20) g.fx.fire(v.x + Math.sin(v.yaw) * v.def.len * 0.35, v.y + 1, v.z + Math.cos(v.yaw) * v.def.len * 0.35, 2);
        if (v.burnT <= 0) this.explode(v);
      }
      if (v.exploded) { v.despawnT += dt; if (Math.random() < dt * 4) g.fx.smoke(v.x, v.y + 1, v.z, 0.1); if (v.despawnT > 90 && Math.hypot(v.x - P.x, v.z - P.z) > 120) this.remove(v); }
      v.wet = g.env.wet;
      const d = Math.hypot(v.x - P.x, v.z - P.z);
      v.root.visible = d < g.q.fogFar + 50;
      if (d < 200) v.sync(dt, g.env.night);
      v.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = d < 45 && g.q.shadows; });
    }
    // headlight spots for the player's car
    const pv = P.vehicle;
    for (const [s, sx] of [[this.headL, 1], [this.headR, -1]] as const) {
      if (pv && pv.lightsOn && g.q.name !== 'LOW') {
        const fx = Math.sin(pv.yaw), fz = Math.cos(pv.yaw), rx = -fz, rz = fx;
        s.position.set(pv.x + fx * pv.def.len * 0.5 - rx * sx * 0.6, pv.y + 0.75, pv.z + fz * pv.def.len * 0.5 - rz * sx * 0.6);
        s.target.position.set(s.position.x + fx * 20, pv.y - 0.6, s.position.z + fz * 20); s.target.updateMatrixWorld(); s.intensity = 90;
      } else s.intensity = 0;
    }
  }
  private pushActors(v: Vehicle) {
    for (const a of this.g.allActors()) {
      if (a.vehicle) continue; const lx = a.x - v.x, lz = a.z - v.z; const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      const f = lx * fx + lz * fz, s = lx * fz - lz * fx; const hl = v.def.len / 2 + a.radius, hw = v.def.wid / 2 + a.radius;
      if (Math.abs(f) < hl && Math.abs(s) < hw && Math.abs(a.y - v.y) < 1.6) {
        const pf = hl - Math.abs(f), ps = hw - Math.abs(s);
        if (pf < ps) { a.x += fx * Math.sign(f) * pf; a.z += fz * Math.sign(f) * pf; } else { a.x += fz * Math.sign(s) * ps; a.z += -fx * Math.sign(s) * ps; }
      }
    }
  }
  private collidePair(a: Vehicle, b: Vehicle) {
    const dx = b.x - a.x, dz = b.z - a.z; const dd = dx * dx + dz * dz; if (dd > 64) return;
    const circles = (v: Vehicle) => { const r = v.def.wid * 0.5, off = v.def.len * 0.5 - r; return [[v.x + Math.sin(v.yaw) * off, v.z + Math.cos(v.yaw) * off, r], [v.x, v.z, r], [v.x - Math.sin(v.yaw) * off, v.z - Math.cos(v.yaw) * off, r]]; };
    const ca = circles(a), cb = circles(b);
    let hit = false; let nx = 0, nz = 0, pen = 0;
    for (const p of ca) for (const q of cb) { const ex = q[0] - p[0], ez = q[1] - p[1], d = Math.hypot(ex, ez), m = p[2] + q[2]; if (d < m && d > 1e-4 && m - d > pen) { pen = m - d; nx = ex / d; nz = ez / d; hit = true; } }
    if (!hit) return;
    const g = this.g;
    // kinematic traffic gets woken up
    for (const v of [a, b]) if (v.role === 'traffic' && !v.physics) { g.traffic.wake(v); }
    const ma = a.def.mass, mb = b.def.mass, tot = ma + mb;
    a.x -= nx * pen * (mb / tot); a.z -= nz * pen * (mb / tot); b.x += nx * pen * (ma / tot); b.z += nz * pen * (ma / tot);
    const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (rv < 0) {
      const jimp = -(1.3) * rv / (1 / ma + 1 / mb);
      a.vx -= (jimp / ma) * nx; a.vz -= (jimp / ma) * nz; b.vx += (jimp / mb) * nx; b.vz += (jimp / mb) * nz;
      a.yawRate += (Math.random() - 0.5) * -rv * 0.15; b.yawRate += (Math.random() - 0.5) * -rv * 0.15;
      const f = -rv; if (f > 2) { a.damage(f * f * 3 * (mb / tot)); b.damage(f * f * 3 * (ma / tot)); g.audio.impact(f); g.fx.sparks((a.x + b.x) / 2, a.y + 0.6, (a.z + b.z) / 2, Math.min(20, Math.round(f))); }
      if (f > 3 && (a === g.player.vehicle || b === g.player.vehicle)) {
        g.cam.addShake(Math.min(1, f / 15)); g.vibrate(Math.min(200, f * 12));
        const other = a === g.player.vehicle ? b : a;
        if (other.role === 'police') g.reportCrime(2, other.x, other.z, 10, true);
        else if (other.driver && rng.chance(0.4)) { const d = other.driver as Actor; g.bubble(d, rng.pick(['Are you blind?!', 'My car!', 'Learn to drive!', 'Hey! Insurance!'])); }
      }
    }
  }
  private panicDrive(v: Vehicle, dt: number) {
    const ai = v.ai; ai.t += dt; const g = this.g;
    if (!v.driver || v.dead) { v.step(dt, { throttle: 0, steer: 0, handbrake: true }); return; }
    if (ai.panic === 'stop') { v.step(dt, { throttle: 0, steer: 0, handbrake: false }); if (ai.t > 6 && v.speed < 0.5) { /* driver gets out to shout or leaves */ const d = this.unseat(v, 0); if (d) { d.ai = { state: 'flee', t: 0, fx: g.player.x, fz: g.player.z, brave: 0.3, fear: 1 }; g.peds.list.includes(d) || g.peds.addActor(d); } } return; }
    // flee: drive away from player along roads
    if (!ai.wp || ai.t > ai.wpT) { const away = Math.atan2(v.x - g.player.x, v.z - g.player.z); const n = nearestNode(v.x + Math.sin(away) * 90, v.z + Math.cos(away) * 90); ai.wp = { x: n.x, z: n.z }; ai.wpT = ai.t + 4; }
    const err = wrapAngle(Math.atan2(ai.wp.x - v.x, ai.wp.z - v.z) - v.yaw);
    let thr = 0.9, st = clamp(err * 1.5, -1, 1); if (Math.abs(v.vf) < 1 && ai.t > 2) ai.stuck = (ai.stuck ?? 0) + dt; if ((ai.stuck ?? 0) > 1.5) { ai.rev = 1.2; ai.stuck = 0; } if ((ai.rev ?? 0) > 0) { ai.rev -= dt; thr = -0.7; st = -st; }
    const imp = v.step(dt, { throttle: thr, steer: st, handbrake: false }); if (imp) g.onVehicleImpact(v, imp.impact);
    if (ai.t > 25) { v.ai = null; v.physics = true; }
  }
  /** Generic AI steering with stuck recovery (mission drivers, rivals, chasers). */
  aiSteer(v: Vehicle, x: number, z: number, vmax: number, dt: number, ram = false) {
    const ai = v.ai ?? (v.ai = {}); const want = Math.atan2(x - v.x, z - v.z); const err = wrapAngle(want - v.yaw); const d = Math.hypot(x - v.x, z - v.z);
    let thr = clamp((vmax - v.speed) / 5, -1, 1); if (Math.abs(err) > 1.1 && v.speed > 12) thr = -0.5; if (!ram && d < 10) thr = Math.min(thr, (d - 4) / 6);
    let steer = clamp(err * 1.8, -1, 1);
    if (Math.abs(v.vf) < 1 && thr > 0.3) ai.stuck = (ai.stuck ?? 0) + dt; else ai.stuck = Math.max(0, (ai.stuck ?? 0) - dt);
    if (ai.stuck > 1.4) { ai.rev = 1.3; ai.stuck = 0; }
    if ((ai.rev ?? 0) > 0) { ai.rev -= dt; thr = -0.8; steer = -steer; }
    const imp = v.step(dt, { throttle: thr, steer, handbrake: Math.abs(err) > 1.2 && v.speed > 10 });
    if (imp) this.g.onVehicleImpact(v, imp.impact);
  }
  explode(v: Vehicle) {
    if (v.exploded) return; const g = this.g;
    v.exploded = true; v.dead = true; v.health = 0; v.siren = false; v.engineOn = false;
    v.vx += (Math.random() - 0.5) * 3; v.vz += (Math.random() - 0.5) * 3; v.y += 0.5;
    for (let s = 0; s < v.seats.length; s++) { const o = v.seats[s] as Actor | null; if (!o) continue; if (o === (g.player as any)) { g.player.exitVehicle(true); g.player.takeDamage(200, null, 'explosion'); } else { this.unseat(v, s); o.hurt(999, null, 0, 0, 'explosion'); } }
    const culprit = v.ai?.lastHitBy ?? null;
    g.combat.explode(v.x, v.y + 0.5, v.z, 9, 160, culprit);
    v.parts.paint.color.setHex(0x161412); v.parts.paint.metalness = 0.1; v.parts.paint.roughness = 0.9;
    for (const w of v.parts.wheels) w.visible = Math.random() < 0.5;
  }
}
