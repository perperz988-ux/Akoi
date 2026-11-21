// Player controller: walking, sprinting, sneaking, jumping, swimming, flying and survival stats.
import { B, L_SOLID } from '../world/Blocks';
import type { World } from '../world/World';
import { Body, makeBody, moveBody, overlapsSolid } from './Physics';
import { Inventory } from './Inventory';
import type { Input } from '../core/Input';

export class Player {
  body: Body = makeBody(0.3, 1.8);
  yaw = 0;
  pitch = 0;
  health = 20;
  hunger = 20;
  saturation = 5;
  exhaustion = 0;
  air = 10;
  inv = new Inventory(36);
  mode: 'survival' | 'creative' = 'survival';
  flying = false;
  sneaking = false;
  sprinting = false;
  alive = true;
  spawn = { x: 0.5, y: 80, z: 0.5 };
  invuln = 0;
  hurtFlash = 0;
  regenTimer = 0;
  airTimer = 0;
  hazardTimer = 0;
  fallStart: number | null = null;
  walkDist = 0;
  bob = 0;
  eye = 1.62;
  lastDamageSource = '';
  onStep: (x: number, y: number, z: number) => void = () => {};
  onHurt: (dmg: number) => void = () => {};
  onDeath: (src: string) => void = () => {};
  onSplash: () => void = () => {};
  private wasInWater = false;
  private stepAcc = 0;

  get x() { return this.body.x; } get y() { return this.body.y; } get z() { return this.body.z; }
  get creative() { return this.mode === 'creative'; }

  setPos(x: number, y: number, z: number) { this.body.x = x; this.body.y = y; this.body.z = z; this.body.vx = this.body.vy = this.body.vz = 0; this.fallStart = null; }

  hurt(dmg: number, fromX: number | null, fromZ: number | null, src: string) {
    if (!this.alive || this.creative || this.invuln > 0 || dmg <= 0) return;
    this.health -= dmg;
    this.invuln = 0.5;
    this.hurtFlash = 0.4;
    this.lastDamageSource = src;
    this.exhaustion += 0.3;
    if (fromX !== null && fromZ !== null) {
      const dx = this.body.x - fromX, dz = this.body.z - fromZ, d = Math.hypot(dx, dz) || 1;
      this.body.vx += (dx / d) * 7; this.body.vz += (dz / d) * 7; this.body.vy = Math.max(this.body.vy, 5);
    }
    this.onHurt(dmg);
    if (this.health <= 0) { this.health = 0; this.alive = false; this.onDeath(src); }
  }

  eat(food: number) {
    this.hunger = Math.min(20, this.hunger + food);
    this.saturation = Math.min(this.hunger, this.saturation + food * 0.6);
  }

  respawn() {
    this.health = 20; this.hunger = 20; this.saturation = 5; this.air = 10; this.alive = true; this.exhaustion = 0;
    this.setPos(this.spawn.x, this.spawn.y, this.spawn.z);
  }

  update(dt: number, input: Input, world: World, opts: { autoJump: boolean; difficulty: number }) {
    const b = this.body;
    this.invuln -= dt; this.hurtFlash -= dt;
    if (!this.alive) return;
    if (!world.isLoaded(Math.floor(b.x), Math.floor(b.z))) return; // wait for terrain

    this.sneaking = input.sneak && !this.flying;
    if (this.flying) this.sneaking = false;
    const fwd = input.moveY, str = input.moveX;
    const moving = Math.hypot(fwd, str) > 0.1;
    this.sprinting = (input.sprint || (fwd > 0.95 && input.sprint)) && fwd > 0.3 && !this.sneaking && (this.hunger > 6 || this.creative);
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    // forward is -Z in camera space
    const dirX = -sinY * fwd + cosY * str, dirZ = -cosY * fwd - sinY * str;

    let speed = this.flying ? (this.sprinting ? 22 : 11) : this.sneaking ? 1.4 : this.sprinting ? 5.8 : 4.3;
    if (b.inWater && !this.flying) speed *= 0.55;
    if (b.inMagma) speed *= 0.4;
    const accel = this.flying ? 8 : b.onGround ? 14 : b.inWater ? 6 : 3.5;
    const k = Math.min(1, accel * dt);
    b.vx += (dirX * speed - b.vx) * k;
    b.vz += (dirZ * speed - b.vz) * k;

    if (this.flying) {
      let vy = 0;
      if (input.jump) vy += speed * 0.8;
      if (input.sneak) vy -= speed * 0.8;
      b.vy += (vy - b.vy) * Math.min(1, 10 * dt);
    } else if (b.inWater || b.inMagma) {
      b.vy -= 10 * dt;
      b.vy *= 1 - Math.min(1, dt * 3);
      if (input.jump) b.vy = Math.min(b.vy + 30 * dt, 3.6);
      if (input.jump && (b.hitX || b.hitZ)) b.vy = 5.5;
      this.fallStart = null;
    } else {
      b.vy -= 30 * dt;
      if (b.vy < -54) b.vy = -54;
      if (input.jump && b.onGround) { b.vy = 8.9; this.exhaustion += this.sprinting ? 0.2 : 0.05; if (this.sprinting) { b.vx += dirX * 1.5; b.vz += dirZ * 1.5; } }
    }

    // auto-jump: walking into a 1-block step
    if (opts.autoJump && !this.flying && b.onGround && moving && !this.sneaking) {
      const ax = b.x + Math.sign(b.vx || dirX) * 0.0 + dirX * 0.55, az = b.z + dirZ * 0.55;
      const fx = Math.floor(ax), fz = Math.floor(az), fy = Math.floor(b.y + 0.05);
      const front = world.getBlock(fx, fy, fz);
      if (L_SOLID[front] && front !== B.DOOR_LOWER && front !== B.CACTUS && !L_SOLID[world.getBlock(fx, fy + 1, fz)] && !L_SOLID[world.getBlock(fx, fy + 2, fz)] && !L_SOLID[world.getBlock(Math.floor(b.x), fy + 2, Math.floor(b.z))]) {
        if (overlapsSolid(world, ax - 0.3, b.y + 0.1, az - 0.3, ax + 0.3, b.y + 0.9, az + 0.3)) b.vy = 8.9;
      }
    }

    const prevY = b.y;
    const wasGround = b.onGround;
    const vyBefore = b.vy;
    moveBody(world, b, dt, this.sneaking);
    if (this.flying && b.onGround && !this.creative) this.flying = false;
    if (this.flying && b.onGround && input.sneak) this.flying = false;

    // fall damage
    if (!b.onGround && !this.flying && !b.inWater && b.vy < 0) { if (this.fallStart === null) this.fallStart = prevY; this.fallStart = Math.max(this.fallStart, prevY); }
    if (b.onGround || this.flying || b.inWater) {
      if (this.fallStart !== null && b.onGround && !this.flying) {
        const fall = this.fallStart - b.y;
        if (fall > 3.5 && vyBefore < -8) this.hurt(Math.floor(fall - 3), null, null, 'a fall');
        if (fall > 1) this.onStep(b.x, b.y - 0.5, b.z);
      }
      this.fallStart = null;
    }
    if (b.inWater && !this.wasInWater && vyBefore < -6) this.onSplash();
    this.wasInWater = b.inWater;

    // footsteps & view bob
    const hs = Math.hypot(b.vx, b.vz);
    if (b.onGround && hs > 0.5) {
      this.walkDist += hs * dt;
      this.stepAcc += hs * dt;
      this.bob += hs * dt * 2.2;
      if (this.stepAcc > (this.sprinting ? 2.2 : 1.8)) { this.stepAcc = 0; this.onStep(b.x, b.y - 0.5, b.z); }
      this.exhaustion += hs * dt * (this.sprinting ? 0.1 : 0.01);
    }
    void wasGround;
    this.eye = this.sneaking ? 1.32 : 1.62;

    if (this.creative) { this.health = 20; this.hunger = 20; this.air = 10; return; }

    // hazards
    this.hazardTimer -= dt;
    if (b.inMagma && this.hazardTimer <= 0) { this.hurt(4, null, null, 'magma'); this.hazardTimer = 0.5; }
    if (b.touchCactus && this.hazardTimer <= 0) { this.hurt(1, null, null, 'a spineplant'); this.hazardTimer = 0.5; }
    if (b.y < -10 && this.hazardTimer <= 0) { this.hurt(4, null, null, 'the void'); this.hazardTimer = 0.5; }
    // drowning
    if (b.headInWater) {
      this.airTimer += dt;
      if (this.airTimer > 1) { this.airTimer = 0; this.air -= 1; if (this.air < 0) { this.air = 0; this.hurt(2, null, null, 'drowning'); } }
    } else { this.air = Math.min(10, this.air + dt * 4); this.airTimer = 0; }
    // hunger
    if (this.exhaustion >= 4) { this.exhaustion -= 4; if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1); else this.hunger = Math.max(0, this.hunger - 1); }
    this.exhaustion += dt * 0.004 * (opts.difficulty + 1);
    this.regenTimer += dt;
    if (this.regenTimer > 4) {
      this.regenTimer = 0;
      if (this.hunger >= 18 && this.health < 20) { this.health = Math.min(20, this.health + 1); this.exhaustion += 1.5; }
      else if (this.hunger <= 0 && opts.difficulty > 0 && (this.health > 1 || opts.difficulty === 2)) this.hurt(1, null, null, 'starvation');
    }
  }

  serialize() {
    return {
      x: this.body.x, y: this.body.y, z: this.body.z, yaw: this.yaw, pitch: this.pitch, health: this.health, hunger: this.hunger,
      saturation: this.saturation, air: this.air, inv: this.inv.serialize(), flying: this.flying, spawn: this.spawn, mode: this.mode,
    };
  }
  load(d: any) {
    if (!d) return;
    this.setPos(d.x, d.y, d.z);
    this.yaw = d.yaw || 0; this.pitch = d.pitch || 0;
    this.health = d.health ?? 20; this.hunger = d.hunger ?? 20; this.saturation = d.saturation ?? 5; this.air = d.air ?? 10;
    this.inv.load(d.inv); this.flying = !!d.flying; if (d.spawn) this.spawn = d.spawn;
    if (this.health <= 0) this.health = 20;
  }
}
