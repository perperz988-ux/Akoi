// Creatures: types, spawning rules, AI (wander / follow / flee / seek food / attack / fly) and combat.
import * as THREE from 'three';
import { B, L_OPAQUE, L_SOLID, UNLOADED } from '../world/Blocks';
import type { World } from '../world/World';
import { Body, makeBody, moveBody } from './Physics';
import { I } from './Items';
import { Model, buildCrawler, buildGlimmerwing, buildGloomling, buildHopkin, buildMossback, buildStingwisp, buildCloudray, buildCinderhound, disposeModel } from './Models';

export interface MobType {
  key: string; name: string; hostile: boolean; flying: boolean;
  hw: number; h: number; health: number; speed: number; damage: number; range: number; aggro: number;
  drops: [number, number, number, number][]; // id, min, max, chance
  lure: number[]; food: number[];
  build: () => Model;
  category: 'passive' | 'hostile' | 'ambient';
}

export const MOB_TYPES: MobType[] = [
  { key: 'mossback', name: 'Mossback', hostile: false, flying: false, hw: 0.48, h: 0.9, health: 12, speed: 1.4, damage: 0, range: 0, aggro: 0, drops: [[I.raw_meat, 1, 3, 1], [I.fiber, 0, 2, 0.6]], lure: [I.berries, B.TALL_GRASS], food: [B.TALL_GRASS, B.BERRY_BUSH], build: buildMossback, category: 'passive' },
  { key: 'hopkin', name: 'Hopkin', hostile: false, flying: false, hw: 0.25, h: 0.62, health: 6, speed: 3.4, damage: 0, range: 0, aggro: 0, drops: [[I.raw_meat, 1, 1, 1], [I.fur, 1, 2, 0.8]], lure: [I.seeds, I.grain_item], food: [B.TALL_GRASS, B.SUNPETAL, B.BLUEBELL], build: buildHopkin, category: 'passive' },
  { key: 'glimmerwing', name: 'Glimmerwing', hostile: false, flying: true, hw: 0.25, h: 0.35, health: 3, speed: 2.4, damage: 0, range: 0, aggro: 0, drops: [[I.glow_dust, 1, 2, 1]], lure: [], food: [], build: buildGlimmerwing, category: 'ambient' },
  { key: 'gloomling', name: 'Gloomling', hostile: true, flying: false, hw: 0.32, h: 1.75, health: 18, speed: 2.7, damage: 3, range: 1.5, aggro: 18, drops: [[I.gloom_essence, 0, 1, 0.7], [I.raw_meat, 0, 1, 0.3], [I.bone, 0, 2, 0.6]], lure: [], food: [], build: buildGloomling, category: 'hostile' },
  { key: 'crawler', name: 'Crag Crawler', hostile: true, flying: false, hw: 0.55, h: 0.7, health: 24, speed: 2.0, damage: 4, range: 1.6, aggro: 12, drops: [[I.crag_shard, 1, 2, 1], [I.coal, 0, 2, 0.5], [B.RUBBLE, 1, 2, 0.5], [I.bone, 0, 1, 0.5]], lure: [], food: [], build: buildCrawler, category: 'hostile' },
  { key: 'cloudray', name: 'Cloudray', hostile: false, flying: true, hw: 0.5, h: 0.3, health: 10, speed: 2.2, damage: 0, range: 0, aggro: 0, drops: [[I.fiber, 1, 2, 1], [B.CLOUD, 1, 2, 0.6]], lure: [], food: [], build: buildCloudray, category: 'ambient' },
  { key: 'cinderhound', name: 'Cinderhound', hostile: true, flying: false, hw: 0.35, h: 1.1, health: 20, speed: 3.6, damage: 4, range: 1.5, aggro: 20, drops: [[I.coal, 1, 2, 1], [I.emberite_ingot, 0, 1, 0.25], [I.raw_meat, 0, 1, 0.5]], lure: [], food: [], build: buildCinderhound, category: 'hostile' },
  { key: 'stingwisp', name: 'Stingwisp', hostile: true, flying: true, hw: 0.3, h: 0.5, health: 8, speed: 4.2, damage: 2, range: 1.2, aggro: 22, drops: [[I.glow_dust, 0, 1, 0.6], [I.fiber, 0, 1, 0.4]], lure: [], food: [], build: buildStingwisp, category: 'hostile' },
];
export const mobType = (k: string) => MOB_TYPES.find((t) => t.key === k)!;

export interface MobContext {
  world: World;
  player: { x: number; y: number; z: number; eye: number; sneaking: boolean; heldId: number; alive: boolean; survival: boolean; hurt: (dmg: number, fx: number, fz: number, src: string) => void };
  dayFactor: number;
  difficulty: number; // 0 peaceful, 1 normal, 2 hard
  dim?: number;
  spawning: boolean;
  drop: (x: number, y: number, z: number, id: number, count: number) => void;
  fx: { puff: (x: number, y: number, z: number, n: number, col?: [number, number, number]) => void; sparkle: (x: number, y: number, z: number, c: [number, number, number]) => void; burst: (x: number, y: number, z: number, col: [number, number, number], n: number) => void };
  sound: (kind: string, ev: 'idle' | 'hurt' | 'death' | 'attack', dist: number) => void;
}

let mobId = 0;

export class Mob {
  id = ++mobId;
  body: Body;
  yaw = Math.random() * Math.PI * 2;
  health: number;
  model: Model;
  state: 'idle' | 'wander' | 'flee' | 'follow' | 'food' | 'chase' | 'dive' | 'fade' = 'idle';
  timer = 1 + Math.random() * 3;
  tx = 0; ty = 0; tz = 0;
  anchor = new THREE.Vector3();
  hurtTimer = 0;
  attackCd = 0;
  hunger = 20 + Math.random() * 40;
  walkPhase = 0;
  soundTimer = 5 + Math.random() * 15;
  dead = false;
  fade = 1;
  far = 0;
  lastSeen = 0;
  constructor(public type: MobType, x: number, y: number, z: number) {
    this.body = makeBody(type.hw, type.h);
    this.body.x = x; this.body.y = y; this.body.z = z;
    this.health = type.health;
    this.model = type.build();
    this.anchor.set(x, y, z);
    this.tx = x; this.ty = y; this.tz = z;
  }
}

export class MobManager {
  mobs: Mob[] = [];
  group = new THREE.Group();
  private spawnTimer = 0;
  private frame = 0;

  constructor(scene: THREE.Scene, private ctx: MobContext) { scene.add(this.group); }

  spawn(type: MobType, x: number, y: number, z: number): Mob {
    const m = new Mob(type, x, y, z);
    this.mobs.push(m);
    this.group.add(m.model.root);
    m.model.root.position.set(x, y, z);
    return m;
  }

  remove(m: Mob) {
    m.dead = true;
    this.group.remove(m.model.root);
    disposeModel(m.model);
    const i = this.mobs.indexOf(m);
    if (i >= 0) this.mobs.splice(i, 1);
  }

  clear() { for (const m of [...this.mobs]) this.remove(m); }

  count(cat: string) { let n = 0; for (const m of this.mobs) if (m.type.category === cat) n++; return n; }

  damage(m: Mob, dmg: number, fromX: number, fromZ: number) {
    if (m.dead) return;
    m.health -= dmg;
    m.hurtTimer = 0.35;
    const dx = m.body.x - fromX, dz = m.body.z - fromZ, d = Math.hypot(dx, dz) || 1;
    m.body.vx += (dx / d) * 6; m.body.vz += (dz / d) * 6; m.body.vy = m.type.flying ? 2 : 5;
    const pd = this.distToPlayer(m);
    if (m.health <= 0) {
      this.ctx.sound(m.type.key, 'death', pd);
      this.ctx.fx.puff(m.body.x, m.body.y + m.type.h * 0.4, m.body.z, 12);
      for (const [id, mn, mx, ch] of m.type.drops) {
        if (Math.random() > ch) continue;
        const n = mn + Math.floor(Math.random() * (mx - mn + 1));
        if (n > 0) this.ctx.drop(m.body.x, m.body.y + 0.3, m.body.z, id, n);
      }
      this.remove(m);
      return;
    }
    this.ctx.sound(m.type.key, 'hurt', pd);
    if (!m.type.hostile) { m.state = 'flee'; m.timer = 5; }
    else { m.state = m.type.flying ? 'chase' : 'chase'; m.timer = 10; }
  }

  private distToPlayer(m: Mob) { const p = this.ctx.player; return Math.hypot(m.body.x - p.x, m.body.y - p.y, m.body.z - p.z); }

  /** Ray-vs-mob AABB test; returns nearest hit distance. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxD: number): { mob: Mob; t: number } | null {
    let best: { mob: Mob; t: number } | null = null;
    for (const m of this.mobs) {
      const b = m.body, pad = 0.1;
      const t = rayBox(ox, oy, oz, dx, dy, dz, b.x - b.hw - pad, b.y, b.z - b.hw - pad, b.x + b.hw + pad, b.y + b.h + pad, b.z + b.hw + pad);
      if (t !== null && t <= maxD && (!best || t < best.t)) best = { mob: m, t };
    }
    return best;
  }

  private effLight(x: number, y: number, z: number) {
    const l = this.ctx.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    return Math.max((l >> 4) * this.ctx.dayFactor, l & 15);
  }

  private trySpawn() {
    const { world, player } = this.ctx;
    if (!this.ctx.spawning) return;
    const ang = Math.random() * Math.PI * 2, dist = 18 + Math.random() * 26;
    const x = Math.floor(player.x + Math.cos(ang) * dist), z = Math.floor(player.z + Math.sin(ang) * dist);
    if (!world.isLoaded(x, z)) return;
    const sy = world.surfaceY(x, z);
    if (sy < 0) return;
    const top = world.getBlock(x, sy, z);
    const night = this.ctx.dayFactor < 0.25;
    const hostileOk = this.ctx.difficulty > 0 && player.survival;
    if (this.ctx.dim === 1) {
      if (this.count('ambient') < 6 && top === B.SKY_GRASS && this.isClear(x, sy + 1, z, 2)) this.spawn(mobType('cloudray'), x + 0.5, sy + 3 + Math.random() * 4, z + 0.5);
      else if (night && hostileOk && this.count('hostile') < 3 && this.isClear(x, sy + 1, z, 2)) this.spawn(mobType('stingwisp'), x + 0.5, sy + 4, z + 0.5);
      return;
    }
    if (this.ctx.dim === 2) {
      if (hostileOk && this.count('hostile') < 5 + this.ctx.difficulty * 2 && (top === B.ASH_SOIL || top === B.BASALT) && this.isClear(x, sy + 1, z, 2)) this.spawn(mobType('cinderhound'), x + 0.5, sy + 1, z + 0.5);
      return;
    }
    const r = Math.random();
    // underground spawn attempt
    if (r < 0.35 && hostileOk && this.count('hostile') < 6 + this.ctx.difficulty * 2) {
      const y = 6 + Math.floor(Math.random() * Math.max(1, sy - 14));
      if (y < sy - 6 && this.isClear(x, y, z, 2) && L_SOLID[world.getBlock(x, y - 1, z)] && this.effLight(x, y, z) < 4) {
        const t = y < 40 && Math.random() < 0.55 ? mobType('crawler') : mobType('gloomling');
        this.spawn(t, x + 0.5, y, z + 0.5);
        return;
      }
    }
    if (top === B.WATER || top === B.MAGMA) return;
    const y = sy + 1;
    if (!this.isClear(x, y, z, 2)) return;
    if (night && hostileOk && this.count('hostile') < 6 + this.ctx.difficulty * 2 && this.effLight(x, y, z) < 5) {
      const t = Math.random() < 0.25 ? mobType('stingwisp') : mobType('gloomling');
      this.spawn(t, x + 0.5, y + (t.flying ? 3 : 0), z + 0.5);
      return;
    }
    if (night && this.count('ambient') < 5 && (top === B.GRASS || top === B.ASH_LEAVES || top === B.FROST_GRASS) && Math.random() < 0.5) {
      this.spawn(mobType('glimmerwing'), x + 0.5, y + 2 + Math.random() * 3, z + 0.5);
      return;
    }
    if (!night && this.count('passive') < 10 && (top === B.GRASS || top === B.FROST_GRASS) && ((world.getLight(x, y, z) >> 4) >= 9)) {
      const t = Math.random() < 0.5 ? mobType('mossback') : mobType('hopkin');
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const ox = x + Math.floor(Math.random() * 3) - 1, oz = z + Math.floor(Math.random() * 3) - 1;
        const oy = world.surfaceY(ox, oz) + 1;
        if (oy > 0 && this.isClear(ox, oy, oz, 1)) this.spawn(t, ox + 0.5, oy, oz + 0.5);
      }
    }
  }

  private isClear(x: number, y: number, z: number, h: number) {
    for (let i = 0; i < h; i++) { const b = this.ctx.world.getBlock(x, y + i, z); if (b === UNLOADED || L_SOLID[b] || b === B.WATER || b === B.MAGMA) return false; }
    return true;
  }

  private canSee(m: Mob) {
    const p = this.ctx.player;
    const ox = m.body.x, oy = m.body.y + m.type.h * 0.8, oz = m.body.z;
    const dx = p.x - ox, dy = p.y + p.eye - oy, dz = p.z - oz;
    const d = Math.hypot(dx, dy, dz);
    const steps = Math.ceil(d * 2);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (L_OPAQUE[this.ctx.world.getBlock(Math.floor(ox + dx * t), Math.floor(oy + dy * t), Math.floor(oz + dz * t))]) return false;
    }
    return true;
  }

  private findFood(m: Mob): [number, number, number] | null {
    const w = this.ctx.world, bx = Math.floor(m.body.x), by = Math.floor(m.body.y), bz = Math.floor(m.body.z);
    for (let i = 0; i < 24; i++) {
      const x = bx + Math.floor(Math.random() * 13) - 6, z = bz + Math.floor(Math.random() * 13) - 6;
      for (let y = by - 2; y <= by + 2; y++) {
        const id = w.getBlock(x, y, z);
        if (m.type.food.includes(id) && (id !== B.BERRY_BUSH || w.getMeta(x, y, z) === 1)) return [x, y, z];
      }
    }
    return null;
  }

  update(dt: number) {
    this.frame++;
    const { world, player } = this.ctx;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) { this.spawnTimer = 0.8; this.trySpawn(); }
    for (const m of [...this.mobs]) {
      if (m.dead) continue;
      const pd = this.distToPlayer(m);
      // despawn
      if (pd > 80 || (m.type.hostile && pd > 56 && Math.random() < dt * 0.2) || (!this.ctx.player.survival && m.type.hostile && pd > 40)) { this.remove(m); continue; }
      if (!world.isLoaded(Math.floor(m.body.x), Math.floor(m.body.z))) continue;
      // simulation LOD: far creatures update at a lower rate
      let sdt = dt;
      if (pd > 40) { m.far += dt; if ((this.frame + m.id) % 4 !== 0) { continue; } sdt = m.far; m.far = 0; }
      sdt = Math.min(sdt, 0.1);
      this.think(m, sdt, pd);
      this.physics(m, sdt);
      this.animate(m, sdt, pd);
      if (m.dead) continue;
      m.soundTimer -= sdt;
      if (m.soundTimer <= 0) { m.soundTimer = 8 + Math.random() * 18; if (pd < 24) this.ctx.sound(m.type.key, 'idle', pd); }
    }
  }

  private think(m: Mob, dt: number, pd: number) {
    const { player, world } = this.ctx;
    const t = m.type;
    m.timer -= dt; m.attackCd -= dt; m.hurtTimer -= dt; m.hunger -= dt;
    // daylight retreat for gloomlings caught in sunlight
    const sunlit = (t.key === 'gloomling' && this.ctx.dayFactor > 0.6 && (world.getLight(Math.floor(m.body.x), Math.floor(m.body.y + 1), Math.floor(m.body.z)) >> 4) > 11)
      || (t.key === 'glimmerwing' && this.ctx.dayFactor > 0.7);
    if (sunlit && m.state !== 'fade') { m.state = 'fade'; m.timer = 3 + Math.random() * 4; this.wanderTarget(m, 4); }
    if (m.state === 'fade') {
      if (!sunlit) { m.state = 'idle'; m.timer = 1; m.fade = 1; }
      else {
        if (m.timer <= 0) { m.fade -= dt * 1.5; if (Math.random() < 0.5) this.ctx.fx.sparkle(m.body.x, m.body.y + t.h / 2, m.body.z, [0.5, 0.4, 0.7]); if (m.fade <= 0) { this.remove(m); return; } }
        return;
      }
    }
    const canAttack = t.hostile && player.alive && player.survival && this.ctx.difficulty > 0;
    if (canAttack && pd < t.aggro) {
      if (m.state !== 'chase' && m.state !== 'dive') {
        if (this.canSee(m)) { m.state = 'chase'; m.timer = 10; m.lastSeen = 0; }
      }
    } else if (m.state === 'chase' || m.state === 'dive') { m.state = 'idle'; m.timer = 2; }

    switch (m.state) {
      case 'chase': {
        m.lastSeen += dt;
        if (m.lastSeen > 1) { m.lastSeen = 0; if (!this.canSee(m) && pd > 6) { m.state = 'wander'; m.timer = 4; this.wanderTarget(m, 8); break; } }
        if (t.flying) {
          // circle the player, then dive
          const a = performance.now() / 1000 * 0.9 + m.id;
          m.tx = player.x + Math.cos(a) * 4.5; m.tz = player.z + Math.sin(a) * 4.5; m.ty = player.y + 3;
          if (m.timer <= 0 && pd < 12) { m.state = 'dive'; m.timer = 1.6; }
        } else { m.tx = player.x; m.ty = player.y; m.tz = player.z; }
        if (pd < t.range + 0.3 && m.attackCd <= 0 && Math.abs(m.body.y - player.y) < 1.8) this.attack(m);
        break;
      }
      case 'dive':
        m.tx = player.x; m.ty = player.y + 1.0; m.tz = player.z;
        if (pd < t.range + 0.4 && m.attackCd <= 0) { this.attack(m); m.state = 'chase'; m.timer = 3 + Math.random() * 2; }
        if (m.timer <= 0) { m.state = 'chase'; m.timer = 3; }
        break;
      case 'flee': {
        const dx = m.body.x - player.x, dz = m.body.z - player.z, d = Math.hypot(dx, dz) || 1;
        m.tx = m.body.x + (dx / d) * 6; m.tz = m.body.z + (dz / d) * 6; m.ty = m.body.y + (t.flying ? 1 : 0);
        if (m.timer <= 0) { m.state = 'idle'; m.timer = 2; }
        break;
      }
      case 'follow':
        m.tx = player.x; m.ty = player.y; m.tz = player.z;
        if (!t.lure.includes(player.heldId) || pd > 12) { m.state = 'idle'; m.timer = 1; }
        break;
      case 'food': {
        const id = world.getBlock(m.tx, m.ty, m.tz);
        if (!t.food.includes(id)) { m.state = 'idle'; m.timer = 1; break; }
        const d = Math.hypot(m.body.x - (m.tx + 0.5), m.body.z - (m.tz + 0.5));
        if (d < 1.3) {
          if (id === B.BERRY_BUSH) world.setMeta(m.tx, m.ty, m.tz, 0);
          else world.setBlock(m.tx, m.ty, m.tz, B.AIR);
          this.ctx.fx.burst(m.tx + 0.5, m.ty + 0.5, m.tz + 0.5, [0.4, 0.7, 0.3], 6);
          m.health = Math.min(t.health, m.health + 2);
          m.hunger = 40 + Math.random() * 60;
          m.state = 'idle'; m.timer = 2 + Math.random() * 2;
        } else if (m.timer <= 0) { m.state = 'idle'; m.timer = 1; }
        break;
      }
      case 'idle':
        m.tx = m.body.x; m.ty = m.body.y; m.tz = m.body.z;
        if (m.timer <= 0) { m.state = 'wander'; m.timer = 4 + Math.random() * 4; this.wanderTarget(m, t.flying ? 6 : 8); }
        break;
      case 'wander':
        if (m.timer <= 0 || (Math.hypot(m.body.x - m.tx, m.body.z - m.tz) < 0.6 && !t.flying)) { m.state = 'idle'; m.timer = 1 + Math.random() * 4; }
        break;
    }
    // passive reactions
    if (!t.hostile && m.state !== 'flee') {
      if (t.key === 'hopkin' && pd < 5 && !player.sneaking && player.alive && !t.lure.includes(player.heldId)) { m.state = 'flee'; m.timer = 3; }
      else if (t.key === 'glimmerwing' && pd < 3.5) { m.state = 'flee'; m.timer = 2; }
      else if (t.lure.length && t.lure.includes(player.heldId) && pd < 10 && m.state !== 'follow') { m.state = 'follow'; }
      else if (t.food.length && m.hunger <= 0 && (m.state === 'idle' || m.state === 'wander')) {
        const f = this.findFood(m);
        if (f) { m.state = 'food'; m.tx = f[0]; m.ty = f[1]; m.tz = f[2]; m.timer = 10; } else m.hunger = 10;
      }
    }
  }

  private wanderTarget(m: Mob, r: number) {
    const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * r;
    m.tx = m.body.x + Math.cos(a) * d; m.tz = m.body.z + Math.sin(a) * d;
    if (m.type.flying) {
      const base = m.anchor.distanceTo(new THREE.Vector3(m.body.x, m.body.y, m.body.z)) > 16 ? m.anchor : null;
      if (base) { m.tx = base.x + Math.cos(a) * 4; m.tz = base.z + Math.sin(a) * 4; }
      const g = this.ctx.world.surfaceY(Math.floor(m.tx), Math.floor(m.tz));
      m.ty = Math.max(g + 2, Math.min(g + 7, m.body.y + (Math.random() - 0.5) * 4));
    } else m.ty = m.body.y;
  }

  private attack(m: Mob) {
    const p = this.ctx.player;
    m.attackCd = m.type.key === 'crawler' ? 1.4 : 1.0;
    const dmg = m.type.damage + (this.ctx.difficulty === 2 ? 1 : 0);
    p.hurt(dmg, m.body.x, m.body.z, m.type.name);
    this.ctx.sound(m.type.key, 'attack', 0);
    if (m.model.arms.length && m.type.key === 'gloomling') (m as any)._swing = 0.4;
  }

  private physics(m: Mob, dt: number) {
    const b = m.body, t = m.type, w = this.ctx.world;
    const dx = m.tx - b.x, dz = m.tz - b.z, dist = Math.hypot(dx, dz);
    let speed = t.speed * (m.state === 'flee' ? 1.7 : m.state === 'chase' ? 1.15 : m.state === 'dive' ? 1.9 : m.state === 'wander' || m.state === 'food' ? 0.55 : m.state === 'follow' ? 0.8 : 0);
    if (m.state === 'follow' && dist < 2.2) speed = 0;
    if (m.state === 'chase' && !t.flying && dist < t.range * 0.8) speed = 0;
    if (dist > 0.05 && speed > 0) {
      const ty = Math.atan2(dx, dz);
      let dy = ty - m.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * Math.min(1, dt * 6);
    }
    const accel = Math.min(1, dt * (b.onGround || t.flying ? 10 : 2));
    let wantX = dist > 0.05 ? (dx / dist) * speed : 0, wantZ = dist > 0.05 ? (dz / dist) * speed : 0;
    // cliff / hazard avoidance for walkers
    if (!t.flying && speed > 0 && b.onGround && m.state !== 'chase') {
      const ax = Math.floor(b.x + Math.sign(wantX) * (t.hw + 0.5)), az = Math.floor(b.z + Math.sign(wantZ) * (t.hw + 0.5));
      let drop = 0;
      for (let y = Math.floor(b.y) - 1; y > Math.floor(b.y) - 5; y--) { const id = w.getBlock(ax, y, az); if (L_SOLID[id]) break; if (id === B.WATER || id === B.MAGMA) { drop = 9; break; } drop++; }
      if (drop > 3) { wantX = 0; wantZ = 0; m.state = 'idle'; m.timer = 0.5 + Math.random(); }
    }
    b.vx += (wantX - b.vx) * accel; b.vz += (wantZ - b.vz) * accel;
    if (t.flying) {
      const dyv = m.ty - b.y;
      b.vy += (Math.max(-3, Math.min(3, dyv * 1.5)) - b.vy) * Math.min(1, dt * 4);
      b.vy += Math.sin(performance.now() / 300 + m.id) * 0.05;
    } else {
      b.vy -= 28 * dt;
      if (b.inWater) { b.vy = Math.min(b.vy + 40 * dt, 2.5); }
      if ((b.hitX || b.hitZ) && b.onGround && speed > 0) b.vy = t.key === 'hopkin' ? 7.5 : 8.2;
      if (t.key === 'hopkin' && b.onGround && speed > 0.5 && Math.hypot(b.vx, b.vz) > 0.5) b.vy = 5.5;
    }
    b.vy = Math.max(-40, b.vy);
    moveBody(w, b, dt);
    if (b.inMagma && t.key !== 'cinderhound') { m.health -= dt * 4; if (m.health <= 0) this.damage(m, 1, b.x, b.z); }
    if (b.touchCactus && Math.random() < dt * 2) this.damage(m, 1, b.x + (Math.random() - 0.5), b.z + (Math.random() - 0.5));
    if (b.y < -20) this.remove(m);
  }

  private animate(m: Mob, dt: number, pd: number) {
    const md = m.model, b = m.body;
    md.root.position.set(b.x, b.y, b.z);
    md.root.rotation.y = m.yaw;
    const sp = Math.hypot(b.vx, b.vz);
    m.walkPhase += dt * sp * 4;
    const sw = Math.sin(m.walkPhase) * Math.min(1, sp * 0.6);
    md.legs.forEach((l, i) => {
      if (m.type.key === 'crawler') l.rotation.y = Math.sin(m.walkPhase * 1.5 + i) * 0.4;
      else l.rotation.x = (i % 2 === 0 ? sw : -sw) * 0.8 * ((i >> 1) % 2 === 0 ? 1 : -1);
    });
    const flap = Math.sin(performance.now() / (m.type.key === 'stingwisp' ? 25 : 90) + m.id);
    md.wings.forEach((w, i) => { w.rotation.z = (i === 0 ? 1 : -1) * flap * 0.7; });
    if (m.type.key === 'gloomling') {
      const s = (m as any)._swing || 0;
      md.arms.forEach((a, i) => { a.rotation.x = -sw * 0.5 * (i ? 1 : -1) - (s > 0 ? 1.6 : (m.state === 'chase' ? 0.9 : 0)); });
      if (s > 0) (m as any)._swing = s - dt;
    } else if (m.type.key === 'hopkin') {
      md.arms.forEach((e, i) => { e.rotation.x = -0.2 + Math.sin(performance.now() / 400 + i) * 0.1 - Math.min(0.5, Math.abs(b.vy) * 0.08); });
    }
    if (md.head) {
      const p = this.ctx.player;
      if (pd < 8) {
        const a = Math.atan2(p.x - b.x, p.z - b.z) - m.yaw;
        let d = a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        md.head.rotation.y = THREE.MathUtils.clamp(d, -0.9, 0.9);
      } else md.head.rotation.y *= 0.9;
    }
    if (m.state === 'food' && md.head) md.head.rotation.x = 0.5; else if (md.head) md.head.rotation.x = 0;
    // lighting and hurt flash
    const l = this.ctx.world.getLight(Math.floor(b.x), Math.floor(b.y + 0.5), Math.floor(b.z));
    const lf = Math.max(((l >> 4) / 15) ** 2 * (0.3 + 0.7 * this.ctx.dayFactor), ((l & 15) / 15) ** 1.7) * 0.9 + 0.08;
    md.mat.color.setScalar(lf);
    md.mat.emissive.setRGB(m.hurtTimer > 0 ? 0.7 : 0, 0, 0);
    const s = m.fade < 1 ? Math.max(0.01, m.fade) : 1;
    md.root.scale.setScalar(s);
  }
}

export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number | null {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [x0, y0, z0], mx = [x1, y1, z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return null; continue; }
    let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
