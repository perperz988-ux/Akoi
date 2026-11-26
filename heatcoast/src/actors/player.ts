import * as THREE from 'three';
import type { Game } from '../game/game';
import { Actor, groundAt } from './actor';
import { Look } from './humanoid';
import { WEAPONS, WEAPON_ORDER } from '../combat/weapons';
import type { Vehicle } from '../vehicles/vehicle';
import { clamp, damp, dampAngle, wrapAngle } from '../core/math';
import { zoneAt, Zone, onRoadInfo } from '../world/layout';

export interface HeroState { id: 'rosa' | 'jace'; name: string; look: Look; hp: number; armor: number; weapons: string[]; ammo: Record<string, number>; mag: Record<string, number>; weapon: string; skills: Record<string, number>; x: number; z: number; yaw: number }
export const SKILL_NAMES = ['driving', 'shooting', 'stamina', 'strength', 'stealth'];

/** The player-controlled protagonist (Rosa or Jace). */
export class Player extends Actor {
  kind = 'player';
  heroId: 'rosa' | 'jace' = 'rosa';
  owned: string[] = ['fists'];
  stamina = 100; sprinting = false; crouch = false; special = 100; specialOn = false;
  skills: Record<string, number> = { driving: 0.2, shooting: 0.2, stamina: 0.2, strength: 0.2, stealth: 0.2 };
  stats = { kills: 0, distance: 0, carsStolen: 0, missions: 0, photos: 0, playTime: 0, crimes: 0 };
  lastHurtT = -99; enterT = 0; enterTarget: Vehicle | null = null; jumpCd = 0; stepT = 0; meleeCd = 0;
  mode: 'foot' | 'vehicle' | 'entering' | 'dead' | 'cutscene' | 'busted' | 'interior' = 'foot';
  aimTarget: Actor | null = null; deadT2 = 0;
  constructor(private g: Game, look: Look) { super(look, true); this.faction = 'player'; this.hp = this.maxHp = 200; }

  rebuildBody(look: Look) {
    const parent = this.group; parent.remove(this.hum.root); this.hum.dispose();
    const fresh = new Actor(look, true); this.hum = fresh.hum; parent.add(this.hum.root); this.look = look;
    const w = this.weapon; this.weapon = ''; this.equip(w || 'fists');
  }
  dmgMul() { return 1 + this.skills.shooting * 0.3 + (this.heroId === 'jace' && this.specialOn ? 0.5 : 0); }
  meleeMul() { return 1 + this.skills.strength * 0.8; }
  skillUp(k: string, n: number) { const before = Math.floor(this.skills[k] * 10); this.skills[k] = clamp(this.skills[k] + n, 0, 1); if (Math.floor(this.skills[k] * 10) > before) this.g.hud.toast(`${k[0].toUpperCase() + k.slice(1)} skill increased`); }

  takeDamage(dmg: number, from: Actor | null, kind: 'bullet' | 'melee' | 'vehicle' | 'explosion' | 'fire' | 'fall') {
    const g = this.g; if (this.mode === 'dead' || g.cheats.god) return;
    if (this.vehicle && kind === 'bullet') dmg *= 0.45;
    if (this.heroId === 'jace' && this.specialOn) dmg *= 0.5;
    this.hurt(dmg, from, 0, 0, kind, g.time); this.lastHurtT = g.time;
    g.hud.damageFlash(); g.cam.addShake(Math.min(0.6, dmg / 40)); g.vibrate(40);
    if (this.dead) this.die2();
  }
  private die2() { const g = this.g; if (this.vehicle) this.exitVehicle(true); this.mode = 'dead'; this.deadT2 = 0; g.onPlayerDeath(); }

  // ------------------------------------------------------------------------- vehicles
  nearestVehicle(r = 4): Vehicle | null {
    let best: Vehicle | null = null, bd = r;
    for (const v of this.g.vehicles.list) { if (v.exploded) continue; const d = Math.hypot(v.x - this.x, v.z - this.z) - v.def.len * 0.3; if (d < bd && Math.abs(v.y - this.y) < 3) { bd = d; best = v; } }
    return best;
  }
  tryEnter(): boolean {
    const v = this.nearestVehicle(); if (!v) return false;
    const g = this.g;
    this.enterTarget = v; this.enterT = 0; this.mode = 'entering'; this.aiming = false;
    const drv = v.driver as Actor | null;
    if (drv && drv !== (this as any)) {
      if (drv.faction === 'partner') { g.vehicles.unseat(v, 0); g.vehicles.seat(v, drv, 1); }
      else {
        // carjack: yank the driver out
        const d = g.vehicles.unseat(v, 0); if (d) { d.knockT = 1.5; d.vx = -Math.cos(v.yaw) * 2; d.vz = Math.sin(v.yaw) * 2; if (d.faction === 'civ') { d.ai = { ...(d.ai ?? {}), state: 'flee', t: 0, fx: this.x, fz: this.z, brave: 0.5, fear: 1 }; g.bubble(d, 'Hey! That\'s my car!'); } if (d.faction === 'cop') g.reportCrime(3, v.x, v.z, 40, true); }
        g.reportCrime(1, v.x, v.z, 35); this.stats.carsStolen++;
        // passengers flee too
        for (let s = 1; s < v.seats.length; s++) { const o = v.seats[s] as Actor | null; if (o && o.faction !== 'partner') { g.vehicles.unseat(v, s); o.ai = { ...(o.ai ?? {}), state: 'flee', t: 0, fx: this.x, fz: this.z, brave: 0.2, fear: 1 }; } }
      }
    } else if (v.locked) { v.locked = false; g.audio.impact(2); g.hud.toast('Smashed the window'); g.reportCrime(1, v.x, v.z, 25); this.stats.carsStolen++; v.stolen = true; }
    else if (v.role === 'parked' || v.role === 'traffic') { v.stolen = true; }
    return true;
  }
  private finishEnter(v: Vehicle) {
    const g = this.g;
    if (v.seats[0] && v.seats[0] !== (this as any)) { const o = g.vehicles.unseat(v, 0); if (o && o.faction === 'partner') g.vehicles.seat(v, o, 1); }
    g.vehicles.seat(v, this, 0);
    if (v.role === 'traffic' || v.role === 'parked' || v.role === 'mission') { v.role = v.role === 'mission' ? 'mission' : 'player'; }
    if (v.role !== 'mission' && v.role !== 'owned') v.role = 'player';
    v.physics = true; v.ai = null; v.engineOn = !v.inWater; this.mode = 'vehicle';
    g.cam.snapBehind(v.yaw); g.onEnterVehicle(v);
  }
  exitVehicle(force = false) {
    const v = this.vehicle; if (!v) return;
    if (!force && v.speed > 8) { // bail out at speed
      this.knockT = 1.2; this.hurt(Math.min(40, v.speed * 2), null, 0, 0, 'fall', this.g.time);
    }
    this.g.vehicles.unseat(v, this.seat); this.mode = this.dead ? 'dead' : 'foot';
    if (v.role === 'player') v.role = 'parked';
    this.g.onExitVehicle(v);
  }

  // ------------------------------------------------------------------------- per frame
  update(dt: number) {
    const g = this.g, inp = g.input;
    this.stats.playTime += dt; this.jumpCd -= dt; this.meleeCd -= dt; this.fireCd -= dt;
    if (this.reloading > 0) { this.reloading -= dt; if (this.reloading <= 0) this.finishReload(); }
    // special ability (slow-mo focus)
    if (inp.consume('special') && this.special > 20 && this.mode !== 'dead') { this.specialOn = !this.specialOn; g.hud.toast(this.specialOn ? (this.heroId === 'rosa' ? 'Rosa — Driver\'s Focus' : 'Jace — Combat Focus') : 'Focus off'); }
    if (this.specialOn) { this.special -= dt * 14; if (this.special <= 0) { this.special = 0; this.specialOn = false; } } else this.special = Math.min(100, this.special + dt * 1.5);
    if (this.mode === 'dead') { this.deadT2 += dt; this.vx *= 0.9; this.vz *= 0.9; this.integrate(dt); this.sync(dt); return; }
    if (this.mode === 'cutscene' || this.mode === 'busted') { this.vx = this.vz = 0; this.integrate(dt); this.sync(dt); return; }
    if (this.mode === 'entering') { this.updateEnter(dt); return; }
    if (this.mode === 'vehicle' && this.vehicle) { this.updateDriving(dt); return; }
    this.updateFoot(dt);
  }

  private updateEnter(dt: number) {
    const v = this.enterTarget; if (!v || v.exploded) { this.mode = 'foot'; return; }
    this.enterT += dt;
    const door = new THREE.Vector3(v.x + Math.cos(v.yaw) * (v.def.wid / 2 + 0.6), 0, v.z - Math.sin(v.yaw) * (v.def.wid / 2 + 0.6));
    const dx = door.x - this.x, dz = door.z - this.z, d = Math.hypot(dx, dz);
    if (d > 0.5 && this.enterT < 2.5) { this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 12, dt); this.vx = dx / d * 3.5; this.vz = dz / d * 3.5; this.pose = 'walk'; this.integrate(dt); this.sync(dt); return; }
    this.finishEnter(v);
  }

  private updateDriving(dt: number) {
    const g = this.g, inp = g.input, v = this.vehicle!;
    if (inp.consume('enter')) { this.exitVehicle(); return; }
    let thr = 0; if (inp.isHeld('gas')) thr += 1; if (inp.isHeld('brake')) thr -= 1;
    if (inp.device === 'kbm' && !inp.isHeld('gas') && !inp.isHeld('brake')) thr = 0;
    if (inp.device === 'touch' || inp.device === 'pad') { /* buttons/triggers already set */ }
    const steer = -inp.moveX;
    const hb = inp.isHeld('handbrake');
    if (inp.consume('camera')) g.cam.carView++;
    if (inp.consume('lights')) v.lightsOn = !v.lightsOn;
    if (inp.isHeld('horn')) { if (v.horn <= 0) { g.audio.horn(true); v.horn = 0.3; g.peds.panic(v.x, v.z, 12, 0, null); } }
    v.horn -= dt;
    if (inp.consume('wnext')) { g.audio.station = (g.audio.station + 1) % 3; g.hud.toast(['Radio: Sunwave 104.1 FM', 'Radio: Bayou Blues 88.7', 'Radio off'][g.audio.station]); }
    const imp = v.step(dt, { throttle: thr * (this.heroId === 'rosa' && this.specialOn ? 1.15 : 1), steer, handbrake: hb });
    if (imp) g.onVehicleImpact(v, imp.impact);
    if (v.slip > 0.3 && v.speed > 8) { this.skillUp('driving', dt * 0.002); if (Math.random() < dt * 25) for (const w of v.parts.wheels.slice(2)) { const p = w.getWorldPosition(new THREE.Vector3()); g.fx.tyreSmoke(p.x, p.y - 0.3, p.z); } }
    this.x = v.x; this.y = v.y; this.z = v.z; this.yaw = v.yaw; this.vx = v.vx; this.vz = v.vz;
    this.stats.distance += v.speed * dt;
    this.hum.animate(dt, 0, 'drive', { steer: v.steer / Math.max(0.1, v.def.steer) });
    // drive-by: aim & fire sideways with pistol/smg
    if (inp.isHeld('aim') && (this.weapon === 'pistol' || this.weapon === 'smg')) { this.aiming = true; if (inp.isHeld('fire')) this.fireWeapon(true); } else this.aiming = false;
    if (inp.consume('wprev')) this.cycleWeapon(-1);
  }

  private updateFoot(dt: number) {
    const g = this.g, inp = g.input, cam = g.cam;
    // movement relative to camera
    const cy = cam.yaw + Math.PI;
    const fx = Math.sin(cy), fz = Math.cos(cy), rx = -fz, rz = fx;
    let mx = inp.moveX, my = inp.moveY; const mag = Math.min(1, Math.hypot(mx, my));
    const wx = fx * my + -rx * mx, wz = fz * my + -rz * mx;
    const wantSprint = (inp.isHeld('sprint') || (inp.device === 'touch' && mag > 0.92)) && this.stamina > 5 && mag > 0.3;
    this.sprinting = wantSprint && !this.aiming;
    if (inp.consume('crouch')) this.crouch = !this.crouch;
    this.aiming = inp.isHeld('aim') || (inp.device === 'touch' && inp.isHeld('fire') && WEAPONS[this.weapon].kind === 'gun');
    const run = this.sprinting ? 6.8 : mag > 0.6 ? 3.9 : 1.6;
    const speed = (this.aiming ? Math.min(run, 2.4) : run) * mag * (this.swimming ? 0.45 : 1) * (this.crouch ? 0.5 : 1);
    if (this.sprinting) { this.stamina -= dt * (14 - this.skills.stamina * 8); this.skillUp('stamina', dt * 0.0015); } else this.stamina = Math.min(100, this.stamina + dt * 12);
    const tvx = mag > 0.05 ? wx / (Math.hypot(wx, wz) || 1) * speed : 0, tvz = mag > 0.05 ? wz / (Math.hypot(wx, wz) || 1) * speed : 0;
    const acc = this.onGround ? 12 : 2;
    if (this.knockT <= 0) { this.vx = damp(this.vx, tvx, acc, dt); this.vz = damp(this.vz, tvz, acc, dt); } else { this.vx *= 0.95; this.vz *= 0.95; }
    const prevYaw = this.yaw;
    if (this.aiming) this.yaw = dampAngle(this.yaw, cy, 18, dt);
    else if (mag > 0.05) this.yaw = dampAngle(this.yaw, Math.atan2(wx, wz), 10, dt);
    this.turnRate = wrapAngle(this.yaw - prevYaw) / Math.max(dt, 1e-3);
    if (inp.consume('jump') || (inp.isHeld('jump') && inp.device !== 'touch' && false)) { /* handled below */ }
    if (inp.isHeld('jump') && this.onGround && this.jumpCd <= 0 && !this.swimming && this.knockT <= 0) { this.vy = 6.2; this.onGround = false; this.jumpCd = 0.7; }
    this.integrate(dt);
    // footsteps
    const sp = this.speed; this.stats.distance += sp * dt;
    if (this.onGround && sp > 1) { this.stepT -= dt * sp; if (this.stepT <= 0) { this.stepT = 1.6; const z = zoneAt(this.x, this.z); g.audio.step(onRoadInfo(this.x, this.z) ? 'concrete' : z === Zone.Beach ? 'grass' : z === Zone.Rural || z === Zone.Swamp || z === Zone.Park || z === Zone.Suburb ? 'grass' : 'concrete'); } }
    // aim pitch from camera
    this.aimPitch = clamp(-cam.pitch * 0.9 + 0.12, -0.9, 0.9);
    // interact
    if (inp.consume('enter')) { if (!g.tryContext()) this.tryEnter(); }
    if (inp.consume('interact')) g.tryContext();
    if (inp.consume('wnext')) this.cycleWeapon(1); if (inp.consume('wprev')) this.cycleWeapon(-1);
    for (let i = 1; i <= 7; i++) if (inp.held.has(('w' + i) as any)) { const id = WEAPON_ORDER[i - 1]; if (this.owned.includes(id) && this.weapon !== id) this.selectWeapon(id); }
    if (inp.consume('reload')) this.startReload();
    if (inp.consume('switch')) g.switchCharacter();
    // fire / melee
    const w = WEAPONS[this.weapon];
    if (inp.isHeld('fire') && this.knockT <= 0) {
      if (w.kind === 'melee') { if (this.meleeCd <= 0) { this.meleeCd = 1 / w.rate; this.faceNearestTarget(3); g.combat.melee(this, w); this.skillUp('strength', 0.002); } }
      else this.fireWeapon(false);
    }
    // soft lock-on for touch / pad
    this.aimTarget = this.aiming && g.settings.autoAim && inp.device !== 'kbm' ? this.findAimTarget() : null;
    this.pose = this.aiming && w.kind === 'gun' ? 'aim' : g.phone.open ? 'phone' : 'walk';
    this.hum.animate(dt, this.speed, this.pose, { aimPitch: this.aimPitch, turn: this.turnRate, air: !this.onGround && !this.swimming, twoHand: w.twoHand, crouch: this.crouch });
    if (this.swimming) this.hum.animate(0, this.speed, 'swim');
    this.group.position.set(this.x, this.y, this.z); this.group.rotation.y = this.yaw;
    if (this.knockT > 0) { this.knockT -= dt; this.hum.animate(dt, 0, 'dead'); }
    this.hum.lookAt = g.partner && !g.partner.dead ? new THREE.Vector3(g.partner.x, g.partner.y + 1.6, g.partner.z) : null;
    if (this.hum.lookAt && Math.hypot(g.partner.x - this.x, g.partner.z - this.z) > 8) this.hum.lookAt = null;
  }
  private faceNearestTarget(r: number) { const t = this.g.peds.nearest(this.x, this.z, r, (a) => !a.dead && a !== (this as any) && a.faction !== 'partner'); if (t) this.yaw = Math.atan2(t.x - this.x, t.z - this.z); }
  findAimTarget(): Actor | null {
    const g = this.g; const cy = g.cam.yaw + Math.PI; let best: Actor | null = null, bs = 0.35;
    for (const a of g.peds.list) {
      if (a.dead || a.vehicle || a.faction === 'partner') continue; const dx = a.x - this.x, dz = a.z - this.z, d = Math.hypot(dx, dz); if (d > 45 || d < 0.5) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - cy)); const hostile = a.faction === 'cop' || a.faction === 'gang' || a.faction === 'enemy' ? 0.25 : 0;
      const score = ang - hostile + d * 0.004; if (score < bs && g.lineOfSight(this.x, this.y + 1.5, this.z, a.x, a.y + 1.3, a.z)) { bs = score; best = a; }
    }
    return best;
  }
  fireWeapon(driveBy: boolean) {
    const g = this.g, w = WEAPONS[this.weapon]; if (w.kind !== 'gun' || this.fireCd > 0 || this.reloading > 0) return;
    if (!w.auto && !g.input.peek('fire') && this.fireCd > -0.05 && !g.input.isHeld('fire')) return;
    const mag = this.mag[w.id] ?? 0;
    if (mag <= 0) { if ((this.ammo[w.id] ?? 0) > 0 || g.cheats.infAmmo) this.startReload(); else { g.audio.dryFire(); this.fireCd = 0.3; } return; }
    this.fireCd = 1 / w.rate; if (!g.cheats.infAmmo) this.mag[w.id] = mag - 1;
    // aim: from camera through crosshair, or towards soft-locked target
    let target: THREE.Vector3;
    if (this.aimTarget) target = new THREE.Vector3(this.aimTarget.x, this.aimTarget.y + (this.aimTarget.hum.height - 0.45) * (Math.random() < 0.15 + this.skills.shooting * 0.2 ? 1 : 0.75), this.aimTarget.z);
    else { const r = g.cam.aimRay(); const hit = g.combat.raycast(r.o, r.d, w.range, [this, this.vehicle]); target = hit ? hit.point : r.o.clone().addScaledVector(r.d, w.range); }
    const from = driveBy ? new THREE.Vector3(this.x, this.y + 1.4, this.z) : this.muzzle;
    const dir = target.clone().sub(from).normalize();
    const moveSpread = 1 + this.speed * 0.15 + (driveBy ? 1 : 0) - this.skills.shooting * 0.4 - (this.heroId === 'jace' && this.specialOn ? 0.5 : 0);
    g.combat.shoot(this, from, dir, w, Math.max(0.3, moveSpread));
    g.fx.muzzle(from); g.fx.shell(from, this.yaw); g.audio.gun(w.sound, 0);
    this.hum.recoil = w.recoil; g.cam.addShake(w.recoil * 0.12); g.cam.pitch = clamp(g.cam.pitch - w.recoil * 0.012, -1.1, 1.25);
    this.skillUp('shooting', 0.0015);
    if (inp(g)) {/* noop */ }
  }
  startReload() {
    const w = WEAPONS[this.weapon]; if (w.kind !== 'gun' || this.reloading > 0) return;
    if ((this.mag[w.id] ?? 0) >= w.mag) return;
    if ((this.ammo[w.id] ?? 0) <= 0 && !this.g.cheats.infAmmo) { this.g.hud.toast('No ammo'); return; }
    this.reloading = w.reload; this.hum.reloadT = w.reload; this.g.audio.reload();
  }
  private finishReload() {
    const w = WEAPONS[this.weapon]; const need = w.mag - (this.mag[w.id] ?? 0);
    const take = this.g.cheats.infAmmo ? need : Math.min(need, this.ammo[w.id] ?? 0);
    this.mag[w.id] = (this.mag[w.id] ?? 0) + take; if (!this.g.cheats.infAmmo) this.ammo[w.id] = (this.ammo[w.id] ?? 0) - take;
  }
  selectWeapon(id: string) { if (!this.owned.includes(id)) return; this.reloading = 0; this.equip(id); this.g.hud.weaponChanged(); }
  cycleWeapon(dir: number) { const o = WEAPON_ORDER.filter((w) => this.owned.includes(w)); const i = o.indexOf(this.weapon); this.selectWeapon(o[(i + dir + o.length) % o.length]); }
  giveWeapon(id: string, ammo: number) { if (!this.owned.includes(id)) this.owned.push(id); this.ammo[id] = (this.ammo[id] ?? 0) + ammo; if (this.mag[id] === undefined) this.mag[id] = WEAPONS[id].mag; }

  toState(): HeroState { return { id: this.heroId, name: this.name, look: this.look, hp: this.hp, armor: this.armor, weapons: [...this.owned], ammo: { ...this.ammo }, mag: { ...this.mag }, weapon: this.weapon, skills: { ...this.skills }, x: this.x, z: this.z, yaw: this.yaw }; }
  fromState(s: HeroState) {
    this.heroId = s.id; this.name = s.name; if (s.look !== this.look) this.rebuildBody(s.look);
    this.hp = s.hp; this.armor = s.armor; this.owned = [...s.weapons]; this.ammo = { ...s.ammo }; this.mag = { ...s.mag }; this.skills = { ...s.skills };
    this.dead = false; this.equip(s.weapon); this.placeAt(s.x, s.z, s.yaw); this.y = groundAt(s.x, s.z);
  }
}
function inp(_g: Game) { return false; }
