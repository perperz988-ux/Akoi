import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Npc } from '../actors/Npc';
import { Vehicle } from '../vehicles/Vehicle';
import { WeaponDef, WEAPONS } from './Weapons';
import { clamp, wrapAngle } from '../core/MathUtil';
import { rayBox } from '../world/Collision';
import { groundY, WATER_Y } from '../world/CityLayout';

interface Grenade { mesh: THREE.Mesh; x: number; y: number; z: number; vx: number; vy: number; vz: number; fuse: number; owner: any; dmg: number }

export interface HitResult { kind: 'none' | 'world' | 'npc' | 'vehicle' | 'player' | 'prop' | 'water'; t: number; npc?: Npc; vehicle?: Vehicle; head?: boolean; nx?: number; ny?: number; nz?: number }

export class Combat {
  private grenades: Grenade[] = [];
  private gGeo = new THREE.SphereGeometry(0.12, 8, 6);
  private gMat = new THREE.MeshStandardMaterial({ color: 0x3a4a2a });
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  crosshairHit: 'none' | 'enemy' | 'friendly' = 'none';
  constructor(private g: Game) {}

  // ------------------------------------------------------------ targeting
  allNpcs(): Npc[] { return this.g.peds.all(); }

  isHostileToPlayer(n: Npc) {
    if (n.dead) return false;
    if (n.faction === 'gang' || n.faction === 'rival' || n.faction === 'target') return n.state !== 'idle' || n.userData.hostile;
    if (n.faction === 'cop' || n.faction === 'swat' || n.faction === 'guard') return this.g.police.wantedLevel > 0 || n.userData.hostile;
    return !!n.userData.hostile;
  }

  findAimTarget(p: { x: number; y: number; z: number }): Npc | null {
    const cam = this.g.cam;
    const fwd = this.tmp.set(0, 0, -1).applyQuaternion(cam.camera.quaternion);
    const cp = cam.camera.position;
    let best: Npc | null = null, bs = 0.12;
    for (const n of this.allNpcs()) {
      if (n.dead || n.vehicle || n.group.visible === false) continue;
      const dx = n.x - cp.x, dy = n.y + 1.2 - cp.y, dz = n.z - cp.z, d = Math.hypot(dx, dy, dz);
      if (d > 60 || d < 2) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
      const ang = Math.acos(clamp(dot, -1, 1));
      const hostileBonus = this.isHostileToPlayer(n) ? 0.06 : 0;
      if (ang < bs + hostileBonus && (ang - hostileBonus) < bs) { bs = ang - hostileBonus; best = n; }
    }
    return best;
  }

  /** The point the player's reticle is pointing at, from the camera. */
  aimPoint(maxD = 120): { p: THREE.Vector3; dist: number } {
    const cam = this.g.cam.camera;
    const dir = this.tmp.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const o = cam.position;
    // skip first few meters (player body)
    const start = 2.6;
    const ox = o.x + dir.x * start, oy = o.y + dir.y * start, oz = o.z + dir.z * start;
    const t = this.raycastWorld(ox, oy, oz, dir.x, dir.y, dir.z, maxD, { ignoreNpc: this.g.player as any });
    const dist = Math.min(t.t, maxD);
    return { p: new THREE.Vector3(ox + dir.x * dist, oy + dir.y * dist, oz + dir.z * dist), dist };
  }

  // ------------------------------------------------------------ hitscan
  raycastWorld(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number, opt: { ignoreNpc?: any; ignoreVehicle?: Vehicle | null; hitPlayer?: boolean; shooterFaction?: string } = {}): HitResult {
    const g = this.g;
    let best: HitResult = { kind: 'none', t: max };
    const w = g.col.raycast(ox, oy, oz, dx, dy, dz, max, false);
    if (w < best.t) best = { kind: 'world', t: w };
    // water surface
    if (dy < 0 && oy > WATER_Y) { const tw = (oy - WATER_Y) / -dy; if (tw < best.t && groundY(ox + dx * tw, oz + dz * tw) < WATER_Y - 0.3) best = { kind: 'water', t: tw }; }
    // npcs
    for (const n of this.allNpcs()) {
      if (n === opt.ignoreNpc || n.dead && n.corpseT > 0.5 || n.vehicle && false) continue;
      const cx = n.x - ox, cz = n.z - oz;
      const tc = cx * dx + cz * dz; if (tc < 0 || tc > best.t + 1) continue;
      const hx = ox + dx * tc - n.x, hz = oz + dz * tc - n.z;
      if (hx * hx + hz * hz > 0.5 * 0.5) continue;
      const hy = oy + dy * tc - n.y;
      const bottom = n.dead || n.knocked > 0 ? 0 : 0, top = n.dead || n.knocked > 0 ? 0.5 : (n.hum.outfit.hat ? 1.85 : 1.8);
      if (hy < bottom || hy > top) continue;
      if (hx * hx + hz * hz > 0.33 * 0.33 && hy > 1.4) continue;
      if (tc < best.t) best = { kind: 'npc', t: tc, npc: n, head: hy > 1.5 && !n.dead };
    }
    // vehicles (OBB)
    for (const v of g.vehicles.list) {
      if (v === opt.ignoreVehicle || v.detail === 'hidden' || v.exploded) continue;
      const dx0 = v.x - ox, dz0 = v.z - oz; const tc = dx0 * dx + dz0 * dz;
      if (tc < -v.def.len || tc > best.t + v.def.len) continue;
      // transform ray to local
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
      const lox = (ox - v.x) * c - (oz - v.z) * s, loz = (ox - v.x) * s + (oz - v.z) * c, loy = oy - v.y;
      const ldx = dx * c - dz * s, ldz = dx * s + dz * c;
      const t = rayBox(lox, loy, loz, ldx, dy, ldz, { x0: -v.def.wid / 2, x1: v.def.wid / 2, z0: -v.def.len / 2, z1: v.def.len / 2, y0: 0.15, y1: v.def.hei, kind: 'prop' });
      if (t >= 0 && t < best.t) best = { kind: 'vehicle', t, vehicle: v };
    }
    // props
    const ph = g.props.rayHit(ox, oy, oz, dx, dy, dz, best.t);
    if (ph) best = { kind: 'prop', t: ph.t, npc: undefined, nx: 0, ny: 0, nz: 0 } as HitResult, (best as any).prop = ph.prop;
    // player
    if (opt.hitPlayer && g.player.mode !== 'dead' && g.player.mode !== 'vehicle') {
      const p = g.player; const cx = p.x - ox, cz = p.z - oz; const tc = cx * dx + cz * dz;
      if (tc > 0 && tc < best.t) {
        const hx = ox + dx * tc - p.x, hz = oz + dz * tc - p.z, hy = oy + dy * tc - p.y;
        const top = p.crouch ? 1.2 : 1.8;
        if (hx * hx + hz * hz < 0.36 * 0.36 && hy > 0 && hy < top) best = { kind: 'player', t: tc };
      }
    }
    if (opt.hitPlayer && g.player.vehicle) {
      const v = g.player.vehicle; const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
      const lox = (ox - v.x) * c - (oz - v.z) * s, loz = (ox - v.x) * s + (oz - v.z) * c, loy = oy - v.y; const ldx = dx * c - dz * s, ldz = dx * s + dz * c;
      const t = rayBox(lox, loy, loz, ldx, dy, ldz, { x0: -v.def.wid / 2, x1: v.def.wid / 2, z0: -v.def.len / 2, z1: v.def.len / 2, y0: 0.15, y1: v.def.hei, kind: 'prop' });
      if (t >= 0 && t < best.t) best = { kind: 'player', t, vehicle: v };
    }
    return best;
  }

  /** Apply a hit result's effects. */
  private applyHit(h: HitResult, o: THREE.Vector3, d: THREE.Vector3, w: WeaponDef, shooter: any, dmgMul = 1) {
    const g = this.g;
    const px = o.x + d.x * h.t, py = o.y + d.y * h.t, pz = o.z + d.z * h.t;
    const dmg = w.damage * dmgMul;
    switch (h.kind) {
      case 'world': g.fx.sparks(px, py, pz, 4, 0xe0e0e0); g.fx.dust(px, py, pz, 2, 0xaaaaaa); g.audio.impact(px, py, pz); break;
      case 'water': g.fx.splash(px, WATER_Y, pz, 5); break;
      case 'prop': { const pr = (h as any).prop; g.props.hit(pr, d.x, d.z, 4); g.props.damage(pr, dmg); g.fx.sparks(px, py, pz, 3); break; }
      case 'npc': {
        const n = h.npc!; let m = h.head ? 2.6 : 1;
        if (w.kind === 'taser') { n.hurt(0, 'taser', shooter, d.x, d.z, g.time); g.fx.sparks(px, py, pz, 8, 0x7ad0ff); }
        else n.hurt(dmg * m, 'bullet', shooter, d.x, d.z, g.time);
        g.fx.spawn(px, py, pz, d.x * 1.5, 1.0, d.z * 1.5, 0.4, 0.3, 0.1, 0xb02020, 0x601010, 0.6, 6, 1);
        g.peds.onNpcHurt(n, shooter, 'bullet', h.head === true);
        if (shooter === g.player) { g.hud?.hitMarker(n.dead, !!h.head); if (n.dead) g.player.stats.kills++; }
        break;
      }
      case 'vehicle': {
        const v = h.vehicle!; v.damage(dmg * (v.mods.armor ? 0.7 : 1) * 0.6, shooter);
        g.fx.sparks(px, py, pz, 5); g.audio.impact(px, py, pz);
        if (v.driver?.kind === 'npc' && Math.random() < 0.25 && w.kind !== 'taser') (v.driver.ref as Npc).hurt(dmg * 0.8, 'bullet', shooter, 0, 0, g.time);
        if (shooter === g.player) { g.police.reportCrime('vehicleshot', px, pz, 0.3); if (v.health <= 0) v.userData.playerCaused = true; }
        g.peds.alarmed(null, px, pz, 'gunshot');
        v.userData.shotBy = shooter;
        break;
      }
      case 'player': g.player.hurt(dmg * (g.player.inCover ? 0.7 : 1), 'bullet', shooter, d.x, d.z); if (h.vehicle) h.vehicle.damage(dmg * 0.5, shooter); break;
    }
  }

  // ------------------------------------------------------------ player weapons
  muzzlePos(p: any, out = new THREE.Vector3()) {
    out.set(p.x + Math.sin(p.yaw) * 0.55, p.y + 1.35, p.z + Math.cos(p.yaw) * 0.55);
    return out;
  }

  playerFire(p: any, w: WeaponDef) {
    const g = this.g;
    const muzzle = this.muzzlePos(p);
    const ap = this.aimPoint(w.range + 20);
    const tgtNpc = p.aimTarget as Npc | null;
    let tp = ap.p.clone();
    if (tgtNpc && !tgtNpc.dead && p.aiming) {
      const aim = new THREE.Vector3(tgtNpc.x, tgtNpc.y + 1.25, tgtNpc.z);
      // assist: blend only when reticle is near target
      tp.lerp(aim, 0.65);
    }
    const base = tp.sub(muzzle).normalize();
    const skill = 1 - p.skills.shooting * 0.35;
    const spreadMul = (p.aiming ? 0.55 : 1.5) * skill * (p.crouch ? 0.8 : 1) * (Math.hypot(p.vx, p.vz) > 3 ? 1.6 : 1) * (p.inCover ? 0.9 : 1);
    const pellets = w.pellets;
    for (let i = 0; i < pellets; i++) {
      const d = base.clone();
      const sp = w.spread * spreadMul;
      d.x += (Math.random() - 0.5) * sp * 2; d.y += (Math.random() - 0.5) * sp * 2; d.z += (Math.random() - 0.5) * sp * 2; d.normalize();
      const h = this.raycastWorld(muzzle.x, muzzle.y, muzzle.z, d.x, d.y, d.z, w.range, { ignoreNpc: null });
      const end = this.tmp2.set(muzzle.x + d.x * Math.min(h.t, w.range), muzzle.y + d.y * Math.min(h.t, w.range), muzzle.z + d.z * Math.min(h.t, w.range));
      if (i < 3) g.fx.tracer(muzzle, end);
      this.applyHit(h, muzzle, d, w, p);
    }
    g.fx.muzzle(muzzle.x + base.x * 0.4, muzzle.y, muzzle.z + base.z * 0.4);
    g.audio.shot(w.id, muzzle.x, muzzle.y, muzzle.z);
    g.cam.addShake(w.recoil * 3);
    g.cam.pitch += w.recoil * 0.4 * (p.aiming ? 0.6 : 1); g.cam.yaw += (Math.random() - 0.5) * w.recoil * 0.4;
    if (w.kind !== 'taser') { g.peds.alarmed(null, p.x, p.z, 'gunshot', w.noise); g.police.reportCrime('gunfire', p.x, p.z, 0.5); }
    g.police.noise(p.x, p.z, w.noise);
  }

  playerMelee(p: any, w: WeaponDef, combo: number) {
    const g = this.g;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    let hitAny = false;
    const reach = (w.reach ?? 1.7) + 0.4;
    for (const n of this.allNpcs()) {
      if (n.dead && n.corpseT > 1) continue;
      const dx = n.x - p.x, dz = n.z - p.z, d = Math.hypot(dx, dz);
      if (d > reach || d < 0.01) continue;
      if ((dx * fx + dz * fz) / d < 0.35 || Math.abs(n.y - p.y) > 1.6) continue;
      const dmg = w.damage * (1 + p.skills.strength * 0.6) * (combo === 2 ? 1.5 : 1);
      n.userData.lethalMelee = false;
      n.hurt(dmg, 'melee', p, fx * 3, fz * 3, g.time);
      n.vx += fx * (combo === 2 ? 6 : 2.5); n.vz += fz * (combo === 2 ? 6 : 2.5);
      if (!n.dead && combo === 2 && n.faction !== 'cop') n.stunned = Math.max(n.stunned, 1.2);
      g.fx.sparks(n.x, n.y + 1.3, n.z, 3, 0xffffff);
      g.audio.punch();
      g.peds.onNpcHurt(n, p, 'melee', false);
      g.hud?.hitMarker(n.dead || n.knocked > 0, false);
      p.skills.strength = Math.min(1, p.skills.strength + 0.0012);
      if (n.knocked > 0 && n.userData.knockedOut && !n.userData.counted) { n.userData.counted = true; p.stats.knockouts++; }
      hitAny = true;
    }
    // props
    for (const pr of g.props.props) { const dx = pr.x - p.x, dz = pr.z - p.z, d = Math.hypot(dx, dz); if (d < reach && (dx * fx + dz * fz) / (d || 1) > 0.3) { g.props.hit(pr, fx, fz, 6 + p.skills.strength * 4); hitAny = true; } }
    // vehicles: kick/ break glass? smash window
    if (!hitAny) g.audio.whoosh(); else g.cam.addShake(0.12);
    g.police.noise(p.x, p.z, w.noise);
    p.noise = Math.max(p.noise, w.noise);
  }

  /** Stealth takedown: unaware NPC within reach and player behind them. */
  tryTakedown(p: any): boolean {
    const g = this.g;
    if (p.mode !== 'foot') return false;
    let target: Npc | null = null;
    for (const n of this.allNpcs()) {
      if (n.dead || n.vehicle || n.knocked > 0) continue;
      const dx = n.x - p.x, dz = n.z - p.z, d = Math.hypot(dx, dz);
      if (d > 1.9) continue;
      const aware = n.alert > 0.45 || n.fear > 0.3 || n.state === 'combat' || n.state === 'flee' || n.state === 'chase' || n.state === 'handsup';
      if (aware) continue;
      const toP = Math.atan2(-dx, -dz);
      const behind = Math.abs(wrapAngle(toP - n.yaw)) > 1.9; // player is behind npc
      const facing = (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / (d || 1) > 0.5;
      if (behind && facing) { target = n; break; }
    }
    if (!target) return false;
    const lethal = false;
    target.userData.lethalMelee = lethal;
    target.hurt(9999, 'takedown', p, 0, 0, g.time);
    if (!target.dead) { target.knocked = 25; target.userData.knockedOut = true; }
    target.state = 'knocked'; p.meleeAnim = 0.5; p.meleeCd = 0.9;
    target.x = p.x + Math.sin(p.yaw) * 0.9; target.z = p.z + Math.cos(p.yaw) * 0.9;
    g.audio.punch(); g.hud?.hitMarker(true, false); g.hud?.toast('Silent takedown');
    p.skills.stealth = Math.min(1, p.skills.stealth + 0.01); p.stats.knockouts++;
    g.peds.onNpcHurt(target, p, 'takedown', false, true);
    return true;
  }

  // ------------------------------------------------------------ NPC weapons
  npcFire(n: Npc, tx: number, ty: number, tz: number, accuracy: number) {
    const g = this.g;
    const w = WEAPONS[n.weapon ?? 'vigil9'];
    const ox = n.x + Math.sin(n.yaw) * 0.5, oy = n.y + 1.35, oz = n.z + Math.cos(n.yaw) * 0.5;
    const o = new THREE.Vector3(ox, oy, oz);
    const dir = new THREE.Vector3(tx - ox, ty - oy, tz - oz); const dist = dir.length(); dir.normalize();
    const miss = (1 - accuracy) * (0.05 + dist * 0.0015);
    for (let i = 0; i < Math.min(3, w.pellets); i++) {
      const d = dir.clone(); d.x += (Math.random() - 0.5) * (w.spread + miss) * 2; d.y += (Math.random() - 0.5) * (w.spread + miss) * 2; d.z += (Math.random() - 0.5) * (w.spread + miss) * 2; d.normalize();
      const h = this.raycastWorld(ox, oy, oz, d.x, d.y, d.z, w.range + 10, { ignoreNpc: n, hitPlayer: true });
      if (h.kind === 'npc' && h.npc && h.npc.faction === n.faction) { continue; }
      const end = new THREE.Vector3(ox + d.x * Math.min(h.t, w.range), oy + d.y * Math.min(h.t, w.range), oz + d.z * Math.min(h.t, w.range));
      g.fx.tracer(o, end);
      this.applyHit(h, o, d, { ...w, damage: w.damage * (n.faction === 'swat' ? 0.5 : 0.42) }, n);
    }
    g.fx.muzzle(ox + dir.x * 0.4, oy, oz + dir.z * 0.4);
    g.audio.shot(w.id, ox, oy, oz);
    g.police.noise(n.x, n.z, w.noise * 0.5);
    g.peds.alarmed(n, n.x, n.z, 'gunshot', w.noise);
  }

  // ------------------------------------------------------------ explosions & grenades
  throwGrenade(p: any) {
    const g = this.g;
    const ap = this.aimPoint(30).p;
    const o = this.muzzlePos(p); o.y += 0.2;
    const d = ap.sub(o); const dist = Math.min(24, Math.hypot(d.x, d.z));
    const dirx = d.x / (Math.hypot(d.x, d.z) || 1), dirz = d.z / (Math.hypot(d.x, d.z) || 1);
    const spd = Math.sqrt(dist * 14);
    const mesh = new THREE.Mesh(this.gGeo, this.gMat); g.env.scene.add(mesh);
    this.grenades.push({ mesh, x: o.x, y: o.y, z: o.z, vx: dirx * spd, vy: 5.5 + dist * 0.12, vz: dirz * spd, fuse: 2.2, owner: p, dmg: 140 });
    g.audio.whoosh();
    g.police.reportCrime('explosive', p.x, p.z, 1.0);
  }
  throwGrenadeFrom(n: Npc, tx: number, tz: number) {
    const o = { x: n.x, y: n.y + 1.6, z: n.z };
    const dx = tx - o.x, dz = tz - o.z, dist = Math.min(22, Math.hypot(dx, dz)), spd = Math.sqrt(dist * 14);
    const mesh = new THREE.Mesh(this.gGeo, this.gMat); this.g.env.scene.add(mesh);
    this.grenades.push({ mesh, x: o.x, y: o.y, z: o.z, vx: dx / (Math.hypot(dx, dz) || 1) * spd, vy: 5.5, vz: dz / (Math.hypot(dx, dz) || 1) * spd, fuse: 2.0, owner: n, dmg: 90 });
  }

  explode(x: number, y: number, z: number, radius: number, damage: number, source: any, srcVehicle: Vehicle | null) {
    const g = this.g;
    for (const n of this.allNpcs()) {
      if (n.dead && n.corpseT > 3) continue;
      const d = Math.hypot(n.x - x, n.y + 1 - y, n.z - z); if (d > radius) continue;
      const f = 1 - d / radius;
      const dx = (n.x - x) / (d || 1), dz = (n.z - z) / (d || 1);
      n.hurt(damage * f, 'explosion', source, dx, dz, g.time); n.vx += dx * 10 * f; n.vz += dz * 10 * f; n.vy = 6 * f;
      if (!n.dead && n.hum) n.stunned = Math.max(n.stunned, 1.5 * f);
      g.peds.onNpcHurt(n, source, 'explosion', false);
    }
    const p = g.player; const pd = Math.hypot(p.x - x, p.y + 1 - y, p.z - z);
    if (pd < radius && p.mode !== 'dead') { const f = 1 - pd / radius; p.hurt(damage * f * 0.8, 'explosion', source, 0, 0); p.vx += (p.x - x) / (pd || 1) * 8 * f; p.vz += (p.z - z) / (pd || 1) * 8 * f; if (p.mode === 'foot') { p.vy = 5 * f; p.onGround = false; } }
    for (const v of g.vehicles.list) {
      if (v === srcVehicle) continue;
      const d = Math.hypot(v.x - x, v.y - y, v.z - z); if (d > radius * 1.2) continue;
      const f = 1 - d / (radius * 1.2);
      v.damage(damage * f * 3.5, source); v.vy += 4 * f; v.setWorldVel(v.worldVx + (v.x - x) / (d || 1) * 9 * f, v.worldVz + (v.z - z) / (d || 1) * 9 * f); v.yawRate += (Math.random() - 0.5) * 3 * f; v.sleeping = false;
      if (source === g.player) v.userData.playerCaused = true;
    }
    for (const pr of [...g.props.props]) { const d = Math.hypot(pr.x - x, pr.z - z); if (d < radius) { g.props.hit(pr, (pr.x - x) / (d || 1), (pr.z - z) / (d || 1), 14 * (1 - d / radius)); if (pr.explosive && d > 0.5) g.props.damage(pr, 999); } }
    g.cam.addShake(Math.max(0, 1 - Math.hypot(g.cam.camera.position.x - x, g.cam.camera.position.z - z) / 60) * 1.2);
    g.police.noise(x, z, 100); g.peds.alarmed(null, x, z, 'explosion', 100);
    if (source === g.player) g.police.reportCrime('explosive', x, z, 1.0);
  }

  update(dt: number) {
    const g = this.g;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const gr = this.grenades[i];
      gr.fuse -= dt; gr.vy -= 18 * dt;
      gr.x += gr.vx * dt; gr.y += gr.vy * dt; gr.z += gr.vz * dt;
      const ground = g.col.supportY(gr.x, gr.z, 0.1, gr.y + 0.3);
      if (gr.y < ground + 0.1) { gr.y = ground + 0.1; gr.vy = Math.abs(gr.vy) * 0.35; gr.vx *= 0.6; gr.vz *= 0.6; }
      const r = g.col.resolveCircle(gr.x, gr.z, 0.12, gr.y - 0.1, 0.3, 0);
      if (r.hit) { gr.x = r.x; gr.z = r.z; const vn = gr.vx * r.nx + gr.vz * r.nz; if (vn < 0) { gr.vx -= 1.6 * vn * r.nx; gr.vz -= 1.6 * vn * r.nz; } }
      gr.mesh.position.set(gr.x, gr.y, gr.z);
      if (gr.fuse <= 0) {
        g.fx.explosion(gr.x, gr.y, gr.z, 1); g.audio.explosion(gr.x, gr.y, gr.z);
        this.explode(gr.x, gr.y, gr.z, 9, gr.dmg, gr.owner, null);
        g.env.scene.remove(gr.mesh); this.grenades.splice(i, 1);
      }
    }
    // reticle colour
    if (g.player.aiming) {
      const n = g.player.aimTarget;
      this.crosshairHit = n ? (this.isHostileToPlayer(n) ? 'enemy' : 'friendly') : 'none';
    } else this.crosshairHit = 'none';
  }
}
