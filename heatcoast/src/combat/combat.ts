import * as THREE from 'three';
import type { Game } from '../game/game';
import { Actor } from '../actors/actor';
import { WEAPONS, WeaponDef } from './weapons';
import { raycastBuildings, heightAt } from '../world/layout';
import type { Vehicle } from '../vehicles/vehicle';

interface Hit { t: number; actor?: Actor; vehicle?: Vehicle; point: THREE.Vector3; head?: boolean }

/** Hitscan ballistics, melee, explosions, damage routing and crime reporting. */
export class Combat {
  constructor(private g: Game) {}
  def(id: string): WeaponDef { return WEAPONS[id] ?? WEAPONS.fists; }

  /** Ray vs actors (vertical capsules), vehicles (oriented boxes), buildings and ground. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxD: number, ignore: (Actor | Vehicle | null)[] = []): Hit | null {
    const g = this.g; let best: Hit | null = null;
    const wall = raycastBuildings(o.x, o.y, o.z, d.x, d.y, d.z, maxD);
    let limit = Math.min(maxD, wall);
    // ground
    if (d.y < 0) { for (let t = 2; t < limit; t += 2) { const p = o.clone().addScaledVector(d, t); if (p.y < heightAt(p.x, p.z)) { limit = t; break; } } }
    const actors = g.allActors();
    for (const a of actors) {
      if (a.dead || ignore.includes(a) || a.vehicle) continue;
      // closest approach between ray and vertical segment [y, y+1.8]
      const px = a.x - o.x, pz = a.z - o.z; const hd = Math.hypot(d.x, d.z) || 1e-6;
      const t = (px * d.x + pz * d.z) / (hd * hd); if (t < 0 || t > limit) continue;
      const cx = o.x + d.x * t - a.x, cz = o.z + d.z * t - a.z; const lat = Math.hypot(cx, cz);
      if (lat > 0.38) continue;
      const y = o.y + d.y * t; if (y < a.y || y > a.y + a.hum.height + 0.05) continue;
      if (!best || t < best.t) best = { t, actor: a, point: o.clone().addScaledVector(d, t), head: y > a.y + a.hum.height - 0.25 };
    }
    for (const v of g.vehicles.list) {
      if (ignore.includes(v)) continue;
      const lo = new THREE.Vector3(o.x - v.x, o.y - v.y, o.z - v.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -v.yaw);
      const ld = d.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -v.yaw);
      const hx = v.def.wid / 2, hy = 1.5, hz = v.def.len / 2;
      let t0 = 0, t1 = limit; let ok = true;
      for (const [oo, dd, mn, mx] of [[lo.x, ld.x, -hx, hx], [lo.y, ld.y, 0.2, hy], [lo.z, ld.z, -hz, hz]] as [number, number, number, number][]) {
        if (Math.abs(dd) < 1e-8) { if (oo < mn || oo > mx) { ok = false; break; } continue; }
        let a = (mn - oo) / dd, b = (mx - oo) / dd; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) { ok = false; break; }
      }
      if (ok && (!best || t0 < best.t)) best = { t: t0, vehicle: v, point: o.clone().addScaledVector(d, t0) };
    }
    if (!best && limit < maxD) return { t: limit, point: o.clone().addScaledVector(d, limit) };
    if (best && best.t > limit) return { t: limit, point: o.clone().addScaledVector(d, limit) };
    return best;
  }

  /** Fire a gun from `from` toward a direction. Returns hit. */
  shoot(shooter: Actor | null, from: THREE.Vector3, dir: THREE.Vector3, w: WeaponDef, spreadMul = 1, aimOrigin?: THREE.Vector3) {
    const g = this.g;
    const pellets = w.pellets ?? 1;
    let any: Hit | null = null;
    for (let i = 0; i < pellets; i++) {
      const sp = w.spread * spreadMul;
      const d = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * sp * 2, (Math.random() - 0.5) * sp * 2, (Math.random() - 0.5) * sp * 2)).normalize();
      const o = aimOrigin ?? from;
      const ign: (Actor | Vehicle | null)[] = [shooter, shooter?.vehicle ?? null];
      const hit = this.raycast(o, d, w.range, ign);
      const end = hit ? hit.point : o.clone().addScaledVector(d, w.range);
      if (i === 0 || pellets < 4 || i % 3 === 0) g.fx.tracer(from, end);
      if (hit) { any = hit; this.applyHit(hit, w, shooter, d); }
    }
    // noise: panic & crime
    const pos = from;
    if (shooter === g.player || shooter?.faction === 'partner') {
      g.peds.panic(pos.x, pos.z, w.noise, 0, shooter);
      g.reportCrime(2, pos.x, pos.z, w.noise * 0.6);
    } else g.peds.panic(pos.x, pos.z, w.noise * 0.7, 0, shooter);
    return any;
  }
  private applyHit(hit: Hit, w: WeaponDef, shooter: Actor | null, d: THREE.Vector3) {
    const g = this.g;
    if (hit.actor) {
      const dmg = w.dmg * (hit.head ? 2.6 : 1) * (shooter === g.player ? g.player.dmgMul() : 1);
      this.damageActor(hit.actor, dmg, shooter, 'bullet', d.x, d.z);
      g.fx.blood(hit.point.x, hit.point.y, hit.point.z, 8);
      if (shooter === g.player) g.hud.hitMarker(hit.actor.dead, !!hit.head);
    } else if (hit.vehicle) {
      hit.vehicle.damage(w.dmg * 1.4); g.fx.sparks(hit.point.x, hit.point.y, hit.point.z, 5); g.audio.bulletHit();
      if (hit.vehicle.role === 'traffic') { g.traffic.wake(hit.vehicle); this.scareDriver(hit.vehicle); }
      // occupants can get hit through glass
      if (Math.random() < 0.3) { const occ = hit.vehicle.seats.find((s) => s) as Actor | undefined; if (occ && occ !== g.player as any) this.damageActor(occ, w.dmg * 0.6, shooter, 'bullet'); }
      if (shooter === g.player) g.hud.hitMarker(false, false);
    } else {
      g.fx.sparks(hit.point.x, hit.point.y, hit.point.z, 4); g.fx.dust(hit.point.x, hit.point.y, hit.point.z, 2, 0xb0aaa0); if (Math.random() < 0.3) g.audio.ricochet();
    }
  }
  scareDriver(v: Vehicle) { const drv = v.driver as Actor | null; if (!drv || drv.faction !== 'civ') return; v.ai = { panic: 'flee', t: 0 }; }

  damageActor(a: Actor, dmg: number, from: Actor | null, kind: 'bullet' | 'melee' | 'vehicle' | 'explosion' | 'fire' | 'fall', dx = 0, dz = 0) {
    const g = this.g;
    if (a === (g.player as any)) { g.player.takeDamage(dmg, from, kind); return; }
    const was = a.dead;
    if (a.ai?.story && a.ai.invulnerable) return;
    if (a.faction === 'partner' && g.cheats.god) return;
    a.hurt(dmg, from, dx, dz, kind, g.time);
    if (a.faction === 'partner') { g.onPartnerHurt(a); return; }
    if (from === g.player || from?.faction === 'partner') {
      // crimes
      const lvl = a.faction === 'cop' ? (a.dead ? 4 : 3) : a.dead && !was ? 2 : 1;
      g.reportCrime(lvl, a.x, a.z, kind === 'melee' ? 25 : 60, true);
      if (a.dead && !was) { g.player.stats.kills++; g.bus.emit('kill', a); if (a.faction === 'gang' || a.faction === 'enemy') g.player.skillUp('shooting', 0.01); }
      if (!a.dead && a.faction === 'civ' && a.ai) { if (kind === 'melee') g.peds.provoke(a, from!); else { a.ai.state = 'flee'; a.ai.fx = from!.x; a.ai.fz = from!.z; a.ai.t = 0; } }
      if (!a.dead && (a.faction === 'gang') && a.ai) { a.ai.hostile = true; }
    }
    if (a.dead && !was) { g.bus.emit('actorDied', a); if (a.ai?.cash && Math.random() < 0.7) g.pickups.dropCash(a.x, a.z, a.ai.cash); }
  }

  /** AI soldier/cop shooting toward a target point with accuracy 0..1. */
  actorShoot(a: Actor, target: THREE.Vector3, acc: number) {
    const g = this.g; const w = this.def(a.weapon); if (w.kind !== 'gun') return;
    const from = a.muzzle; const dir = target.clone().sub(from).normalize();
    const miss = (1 - acc) * 0.12 * (g.player.vehicle ? 1.3 : 1) * (g.player.speed > 4 ? 1.4 : 1) * (g.time - g.player.lastHurtT < 1 ? 0.8 : 1);
    dir.add(new THREE.Vector3((Math.random() - 0.5) * miss, (Math.random() - 0.5) * miss, (Math.random() - 0.5) * miss)).normalize();
    a.hum.recoil = w.recoil; g.fx.muzzle(from); g.audio.gun(w.sound, from.distanceTo(g.cam.cam.position));
    this.shoot(a, from, dir, w, 1.6);
  }
  fireFrom(from: THREE.Vector3, target: THREE.Vector3, wid: string, acc: number, shooter: Actor | null) {
    const g = this.g; const w = this.def(wid); const dir = target.clone().sub(from).normalize(); const miss = (1 - acc) * 0.1; dir.add(new THREE.Vector3((Math.random() - 0.5) * miss, (Math.random() - 0.5) * miss, (Math.random() - 0.5) * miss)).normalize();
    g.audio.gun(w.sound, from.distanceTo(g.cam.cam.position)); this.shoot(shooter, from, dir, w, 1.5);
  }
  /** Melee swing in front of the attacker. */
  melee(a: Actor, w: WeaponDef) {
    const g = this.g; a.hum.punch();
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    setTimeout(() => {
      for (const o of g.allActors()) {
        if (o === a || o.dead || o.vehicle) continue; const dx = o.x - a.x, dz = o.z - a.z, d = Math.hypot(dx, dz);
        if (d < w.range && (dx * fx + dz * fz) / (d || 1) > 0.4 && Math.abs(o.y - a.y) < 1.2) { this.damageActor(o, w.dmg * (a === g.player as any ? g.player.meleeMul() : 1), a, 'melee', fx, fz); g.audio.punch(); g.fx.blood(o.x, o.y + 1.5, o.z, 3); g.cam.addShake(0.15); break; }
      }
      for (const v of g.vehicles.list) { const dx = v.x - a.x, dz = v.z - a.z; if (Math.hypot(dx, dz) < v.def.len * 0.5 + 0.5 && (dx * fx + dz * fz) > 0) { v.damage(w.dmg * 0.4); break; } }
    }, 170);
  }
  explode(x: number, y: number, z: number, radius: number, dmg: number, culprit: Actor | null) {
    const g = this.g; g.fx.explosion(x, y, z); g.audio.explosion(Math.hypot(x - g.cam.cam.position.x, z - g.cam.cam.position.z)); g.cam.addShake(Math.max(0, 1.2 - Math.hypot(x - g.player.x, z - g.player.z) / 40));
    for (const a of g.allActors()) { const d = Math.hypot(a.x - x, a.z - z); if (d < radius) { const k = 1 - d / radius; this.damageActor(a, dmg * k, culprit, 'explosion', (a.x - x) / (d || 1), (a.z - z) / (d || 1)); } }
    for (const v of g.vehicles.list) { const d = Math.hypot(v.x - x, v.z - z); if (d < radius && d > 0.5) { v.damage(dmg * 8 * (1 - d / radius)); v.vx += (v.x - x) / d * 8; v.vz += (v.z - z) / d * 8; if (v.role === 'traffic') g.traffic.wake(v); } }
    g.peds.panic(x, z, 120, 0, culprit);
    if (culprit === g.player) g.reportCrime(3, x, z, 120);
  }
}
