import * as THREE from 'three';
import { Humanoid, Look, Pose } from './humanoid';
import { weaponModel, WEAPONS } from '../combat/weapons';
import type { Vehicle } from '../vehicles/vehicle';
import { heightAt, waterDepth, collideCircle, onRoadInfo, segHalfWidth, SIDEWALK_W } from '../world/layout';

let AID = 1;
export type Faction = 'civ' | 'cop' | 'gang' | 'player' | 'partner' | 'story' | 'enemy';

/** Anything with a body: pedestrians, cops, the duo. */
export class Actor {
  id = AID++;
  kind = 'actor';
  hum: Humanoid; group = new THREE.Group();
  x = 0; y = 0; z = 0; yaw = 0; vx = 0; vz = 0; vy = 0;
  hp = 100; maxHp = 100; armor = 0; dead = false; deadT = 0; knockT = 0;
  faction: Faction = 'civ'; name = 'Citizen';
  weapon = 'fists'; mag: Record<string, number> = {}; ammo: Record<string, number> = {};
  vehicle: Vehicle | null = null; seat = -1;
  pose: Pose = 'idle'; aiming = false; aimPitch = 0; fireCd = 0; reloading = 0;
  onGround = true; swimming = false; radius = 0.32;
  lastHitBy: Actor | null = null; lastHitT = -99;
  ai: any = {}; talkT = 0; turnRate = 0;
  private weaponObj: THREE.Object3D | null = null;
  constructor(public look: Look, hero = false) {
    this.hum = new Humanoid(look, hero);
    this.group.add(this.hum.root);
    (this.group as any).actor = this;
  }
  get alive() { return !this.dead; }
  get speed() { return Math.hypot(this.vx, this.vz); }
  get muzzle(): THREE.Vector3 {
    const m = this.weaponObj?.userData.muzzle as THREE.Vector3 | undefined;
    if (this.weaponObj && m) return this.weaponObj.localToWorld(m.clone());
    return new THREE.Vector3(this.x + Math.sin(this.yaw) * 0.5, this.y + 1.45, this.z + Math.cos(this.yaw) * 0.5);
  }
  equip(id: string) {
    this.weapon = id;
    if (this.weaponObj) this.weaponObj.parent?.remove(this.weaponObj);
    this.weaponObj = null;
    if (id !== 'fists') {
      const w = weaponModel(id);
      // hand frame: bone points down the forearm; rotate the gun so its muzzle points forward when the arm is raised
      w.rotation.set(Math.PI / 2, 0, 0); w.position.set(0, -0.02, 0.01);
      this.hum.handR.add(w); this.weaponObj = w;
    }
    if (this.mag[id] === undefined && WEAPONS[id]) this.mag[id] = WEAPONS[id].mag;
  }
  placeAt(x: number, z: number, yaw = this.yaw) { this.x = x; this.z = z; this.yaw = yaw; this.y = groundAt(x, z); this.vx = this.vz = this.vy = 0; }

  hurt(dmg: number, from: Actor | null, dirX = 0, dirZ = 0, kind: 'bullet' | 'melee' | 'vehicle' | 'explosion' | 'fire' | 'fall' = 'bullet', now = 0): boolean {
    if (this.dead) return false;
    if (this.armor > 0 && kind !== 'fall') { const a = Math.min(this.armor, dmg * 0.7); this.armor -= a; dmg -= a; }
    this.hp -= dmg; this.lastHitBy = from; this.lastHitT = now;
    this.vx += dirX * (kind === 'explosion' ? 9 : kind === 'vehicle' ? 6 : 1.2); this.vz += dirZ * (kind === 'explosion' ? 9 : kind === 'vehicle' ? 6 : 1.2);
    if (kind === 'vehicle' || kind === 'explosion') { this.knockT = 2.2; this.vy = kind === 'explosion' ? 5 : 2.5; }
    if (kind === 'melee' && this.hp > 0 && Math.random() < 0.25) this.knockT = 1.4;
    if (this.hp <= 0) { this.hp = 0; this.die(dirX, dirZ); }
    return true;
  }
  die(dx = 0, dz = 0) {
    this.dead = true; this.deadT = 0; this.aiming = false;
    // fall away from the hit direction
    const fwd = Math.sin(this.yaw) * dx + Math.cos(this.yaw) * dz;
    this.hum.deadSide = fwd > 0 ? -1 : 1;
  }

  /** Basic locomotion integrate with gravity and collisions. */
  room: { y: number; x0: number; x1: number; z0: number; z1: number; boxes: { x0: number; x1: number; z0: number; z1: number }[] } | null = null;
  integrate(dt: number) {
    this.x += this.vx * dt; this.z += this.vz * dt;
    if (this.room) {
      const r = this.room, rad = this.radius;
      this.x = Math.max(r.x0 + rad, Math.min(r.x1 - rad, this.x)); this.z = Math.max(r.z0 + rad, Math.min(r.z1 - rad, this.z));
      for (const b of r.boxes) { if (this.x > b.x0 - rad && this.x < b.x1 + rad && this.z > b.z0 - rad && this.z < b.z1 + rad) { const dl = this.x - (b.x0 - rad), dr = b.x1 + rad - this.x, dt2 = this.z - (b.z0 - rad), db = b.z1 + rad - this.z, m = Math.min(dl, dr, dt2, db); if (m === dl) this.x = b.x0 - rad; else if (m === dr) this.x = b.x1 + rad; else if (m === dt2) this.z = b.z0 - rad; else this.z = b.z1 + rad; } }
      this.y = r.y; this.vy = 0; this.onGround = true; this.swimming = false; return;
    }
    const p = { x: this.x, z: this.z }; collideCircle(p, this.radius, this.y + 0.3); this.x = p.x; this.z = p.z;
    const gy = groundAt(this.x, this.z), wd = waterDepth(this.x, this.z);
    this.swimming = wd > 1.25;
    if (this.swimming) { this.y += (heightAt(this.x, this.z) + wd - 1.25 - this.y) * Math.min(1, dt * 4); this.vy = 0; this.onGround = false; return; }
    this.vy -= 22 * dt; this.y += this.vy * dt;
    if (this.y <= gy) { this.y = gy; if (this.vy < -14 && !this.dead) this.hurt((-this.vy - 14) * 9, null, 0, 0, 'fall'); this.vy = 0; this.onGround = true; } else this.onGround = this.y - gy < 0.05;
  }
  sync(dt: number) {
    this.group.position.set(this.x, this.y, this.z); this.group.rotation.y = this.yaw;
    if (this.dead) this.deadT += dt;
    const sp = this.speed;
    const pose: Pose = this.dead ? 'dead' : this.knockT > 0 ? 'dead' : this.swimming ? 'swim' : this.pose;
    this.hum.animate(dt, sp, pose, { aimPitch: this.aimPitch, turn: this.turnRate, air: !this.onGround && !this.swimming && !this.vehicle, twoHand: WEAPONS[this.weapon]?.twoHand, crouch: false });
    if (this.knockT > 0) { this.knockT -= dt; if (this.knockT <= 0 && !this.dead) this.vy = 0; }
  }
  dispose() { this.hum.dispose(); }
}

/** Ground including raised sidewalks. */
export function groundAt(x: number, z: number) {
  const h = heightAt(x, z);
  if (h > 0.1 || h < -0.2) return Math.max(h, h);
  const s = onRoadInfo(x, z);
  if (s) return h;
  return h + (nearSidewalk(x, z) ? 0.14 : 0);
}
function nearSidewalk(x: number, z: number) {
  // cheap test: within sidewalk band of the closest sidewalk road
  const r = onRoadInfoWide(x, z);
  return r;
}
import { SEGS } from '../world/layout';
function onRoadInfoWide(x: number, z: number) {
  for (const s of SEGS) {
    if (!s.sidewalk) continue; const hw = segHalfWidth(s) + SIDEWALK_W;
    if (s.axis === 'x') { if (Math.abs(x - s.c) <= hw && z >= s.a - hw && z <= s.b + hw) return true; }
    else if (Math.abs(z - s.c) <= hw && x >= s.a - hw && x <= s.b + hw) return true;
  }
  return false;
}
