import * as THREE from 'three';
import { Humanoid, Outfit, Pose, SKINS, SHIRTS, PANTS, HAIRS, weaponMesh } from './Humanoid';
import type { Vehicle } from '../vehicles/Vehicle';
import { Rng } from '../core/MathUtil';

export type Faction = 'civ' | 'cop' | 'swat' | 'gang' | 'rival' | 'medic' | 'friend' | 'merchant' | 'guard' | 'target';
export type DamageKind = 'bullet' | 'melee' | 'vehicle' | 'explosion' | 'fire' | 'taser' | 'fall' | 'takedown';

let NID = 1;
export interface Memory { kind: string; t: number; x: number; z: number; who?: string; severity?: number }

export class Npc {
  id = NID++;
  hum: Humanoid;
  group = new THREE.Group();
  name = '';
  faction: Faction = 'civ';
  x = 0; y = 0; z = 0; yaw = 0; vx = 0; vz = 0; vy = 0;
  health = 60; maxHealth = 60; armor = 0;
  state = 'idle'; stateT = 0;
  pose: Pose = 'idle';
  dead = false; knocked = 0; stunned = 0; corpseT = 0;
  weapon: string | null = null; ammo = 99; fireCd = 0; reloadT = 0;
  vehicle: Vehicle | null = null; seat = 0;
  simLevel: 0 | 1 | 2 = 0;
  speedWalk = 1.5; speedRun = 4.8;
  fear = 0; anger = 0; alert = 0;
  memories: Memory[] = [];
  target: any = null;
  path: { x: number; z: number }[] = [];
  pathI = 0;
  home = { x: 0, z: 0 }; work = { x: 0, z: 0 };
  job = ''; schedule = 0;
  userData: any = {};
  onGround = true;
  radius = 0.32;
  aimYaw = 0;
  cashDrop = 0;
  phoneT = 0; talkT = 0; talkPartner: Npc | null = null;
  injuredPose = 0;
  handsUp = 0;
  sawCrime = false; calledPolice = 0;
  brain: ((n: Npc, dt: number) => void) | null = null;
  tag: string | null = null;     // mission id
  essential = false;
  lastDamageT = -99; lastDamager: any = null;
  idleAnim = 0;
  carryingMoney = 0;
  dialogue: string[] = [];
  gender: 'm' | 'f' = 'm';
  bodyScale = 1;

  constructor(public outfit: Outfit, scale = 1) {
    this.hum = new Humanoid(outfit, scale);
    this.bodyScale = scale;
    this.group.add(this.hum.root);
  }

  static randomOutfit(rng: Rng, style: 'civ' | 'rich' | 'poor' | 'worker' | 'cop' | 'swat' | 'gang' | 'medic' | 'beach' = 'civ'): Outfit {
    const o: Outfit = { skin: rng.pick(SKINS), shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), hair: rng.pick(HAIRS) };
    switch (style) {
      case 'cop': o.shirt = 0x1f3a6e; o.pants = 0x15233f; o.hat = rng.chance(0.5) ? 0x15233f : undefined; o.vest = 0x2a3550; break;
      case 'swat': o.shirt = 0x1a1c20; o.pants = 0x1a1c20; o.hat = 0x1a1c20; o.vest = 0x2b2f36; o.shoes = 0x0a0a0a; break;
      case 'gang': o.shirt = rng.pick([0x6b1d1d, 0x1d1d6b, 0x222222, 0x6b4a1d]); o.pants = 0x2a2a2a; o.hat = rng.chance(0.5) ? o.shirt : undefined; break;
      case 'worker': o.shirt = 0xe8742a; o.vest = 0xe8f02a; o.pants = 0x3a4252; o.hat = 0xf2d02a; break;
      case 'medic': o.shirt = 0xd9272e; o.pants = 0x222831; break;
      case 'rich': o.shirt = rng.pick([0xf2ece0, 0x1c2a40, 0xd8c8a8, 0x2a2a2a]); o.pants = rng.pick([0x1c2a40, 0x2a2a2a, 0xd8d0c0]); break;
      case 'beach': o.shirt = rng.pick([0xff7a59, 0x59c3ff, 0xffe45a, 0xff59a8]); o.pants = rng.pick([0x2a6ac0, 0xe0c030, 0xc03030]); break;
      case 'poor': o.shirt = rng.pick([0x777777, 0x5a4a3a, 0x3a4a5a, 0x8a6a4a]); o.pants = rng.pick([0x3a3a3a, 0x4a4030]); break;
    }
    return o;
  }

  equip(id: string | null) {
    this.weapon = id;
    this.hum.weaponSlot.clear();
    if (id) {
      const model = ({ vigil9: 'pistol', rattler: 'smg', brawler: 'shotgun', longarm: 'rifle', slugger: 'bat', zap: 'taser', cinder: 'grenade' } as Record<string, string>)[id] ?? id;
      this.hum.weaponSlot.add(weaponMesh(model));
    }
  }

  remember(kind: string, x: number, z: number, t: number, who?: string, severity = 1) {
    this.memories.push({ kind, t, x, z, who, severity });
    if (this.memories.length > 8) this.memories.shift();
  }
  recall(kind: string, now: number, maxAge = 300) {
    for (let i = this.memories.length - 1; i >= 0; i--) { const m = this.memories[i]; if (m.kind === kind && now - m.t < maxAge) return m; }
    return null;
  }

  get alive() { return !this.dead; }
  get incapacitated() { return this.dead || this.knocked > 0 || this.stunned > 0; }
  get speed() { return Math.hypot(this.vx, this.vz); }

  hurt(amount: number, kind: DamageKind, source: any, dirX = 0, dirZ = 0, time = 0): boolean {
    if (this.dead || this.essential && kind !== 'explosion' && kind !== 'vehicle') { return false; }
    if (kind === 'taser') { this.stunned = 6; this.hum.punchT = 0; this.lastDamager = source; this.lastDamageT = time; return true; }
    if (this.armor > 0) { const a = Math.min(this.armor, amount * 0.6); this.armor -= a; amount -= a; }
    this.health -= amount;
    this.lastDamageT = time; this.lastDamager = source;
    this.vx += dirX * 2; this.vz += dirZ * 2;
    if (this.health <= 0) {
      this.health = 0;
      if (kind === 'melee' && !this.userData.lethalMelee) { this.knocked = 12 + Math.random() * 6; this.health = this.maxHealth * 0.25; this.userData.knockedOut = true; return true; }
      this.dead = true; this.corpseT = 0; this.hum.punchT = 0;
      this.userData.killedBy = source; this.userData.deathKind = kind;
    }
    return true;
  }

  syncMesh(dt: number, t: number) {
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    void dt; void t;
  }
}
