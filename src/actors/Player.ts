import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Humanoid, Pose } from './Humanoid';
import { Vehicle } from '../vehicles/Vehicle';
import { clamp, damp, dampAngle, lerp } from '../core/MathUtil';
import { groundY, WATER_Y, onRoad, districtAt, District } from '../world/CityLayout';
import { WEAPONS, Loadout, defaultLoadout } from '../combat/Weapons';
import { Npc } from './Npc';

export type PMode = 'foot' | 'swim' | 'climb' | 'vehicle' | 'dead' | 'roll' | 'entering' | 'exiting' | 'takedown' | 'cutscene';

export class Player {
  hum: Humanoid;
  group = new THREE.Group();
  x = 0; y = 0; z = 0; yaw = 0; vx = 0; vz = 0; vy = 0;
  mode: PMode = 'foot';
  health = 100; maxHealth = 100; armor = 0; stamina = 100;
  crouch = false; sprinting = false; aiming = false; inCover = false; coverNx = 0; coverNz = 0;
  onGround = true; coyote = 0;
  vehicle: Vehicle | null = null; seat = 0;
  loadout: Loadout = defaultLoadout();
  fireCd = 0; reloadT = 0; meleeCd = 0; combo = 0; comboT = 0;
  dodgeCd = 0; dodgeT = 0; dodgeDirX = 0; dodgeDirZ = 0; invuln = 0;
  noise = 0; visibility = 1;
  climbT = 0; climbDur = 0.8; climbFrom = new THREE.Vector3(); climbTo = new THREE.Vector3();
  enterT = 0; enterTarget: Vehicle | null = null; enterFrom = new THREE.Vector3();
  deadT = 0; lastCombatT = -99;
  stepPhase = 0;
  skills = { driving: 0.1, stamina: 0.1, strength: 0.1, shooting: 0.1, stealth: 0.1 };
  stats = { kills: 0, knockouts: 0, distance: 0, carsStolen: 0, missions: 0, crimes: 0, timePlayed: 0 };
  aimTarget: Npc | null = null;
  takedownT = 0;
  radius = 0.32;
  stunned = 0;
  surface: 'concrete' | 'grass' | 'sand' | 'metal' | 'water' | 'wood' | 'asphalt' = 'concrete';
  coverBox: any = null;
  hitFlash = 0;
  autoSprint = true; sprintTimer = 0;
  interior: string | null = null;
  phoneUp = false;
  lastGround = 0;
  fallStartY = 0;
  actorsNear: Npc[] = [];
  moveIntent = 0;

  constructor(public game: Game) {
    this.hum = new Humanoid({ skin: 0xd9a577, shirt: 0x1f6f8b, pants: 0x23262d, hair: 0x1a1410, shoes: 0xe8e8e8, vest: undefined }, 1.0);
    this.group.add(this.hum.root);
    game.env.scene.add(this.group);
  }

  get pos() { return new THREE.Vector3(this.x, this.y, this.z); }
  get currentWeapon() { return WEAPONS[this.loadout.current]; }
  get inVehicle() { return this.mode === 'vehicle' && !!this.vehicle; }
  get alive() { return this.mode !== 'dead'; }

  teleport(x: number, z: number, yaw?: number, y?: number) {
    this.x = x; this.z = z; this.y = y ?? Math.max(this.game.col.supportY(x, z, 0.3, 1.2), groundY(x, z));
    this.vx = this.vz = this.vy = 0; if (yaw !== undefined) this.yaw = yaw;
    this.syncMesh();
  }

  equip(id: string) {
    if (!this.loadout.owned.includes(id)) return;
    this.loadout.current = id; this.reloadT = 0;
    const w = WEAPONS[id];
    this.hum.weaponSlot.clear();
    if (w.model !== 'none') import('./Humanoid').then((m) => { if (this.loadout.current === id) this.hum.weaponSlot.add(m.weaponMesh(w.model)); });
    this.game.hud?.toast(w.name);
  }
  nextWeapon(dir = 1) {
    const o = this.loadout.owned; const i = o.indexOf(this.loadout.current);
    this.equip(o[(i + dir + o.length) % o.length]);
  }
  giveWeapon(id: string, ammo = 0) {
    if (!this.loadout.owned.includes(id)) this.loadout.owned.push(id);
    this.addAmmo(id, ammo || WEAPONS[id].mag * 3);
    if (this.loadout.mag[id] === undefined) this.loadout.mag[id] = WEAPONS[id].mag;
  }
  addAmmo(id: string, n: number) { this.loadout.ammo[id] = (this.loadout.ammo[id] ?? 0) + n; }

  /** Player takes damage. */
  hurt(amount: number, kind: string, source?: any, dx = 0, dz = 0) {
    if (this.mode === 'dead' || this.invuln > 0 || this.game.cheats.god) return;
    const g = this.game;
    if (this.armor > 0) { const a = Math.min(this.armor, amount * 0.65); this.armor -= a; amount -= a; }
    this.health -= amount; this.hitFlash = 1; this.lastCombatT = g.time;
    g.cam.addShake(Math.min(1, amount / 30));
    g.hud?.hit(dx, dz);
    g.audio.hurt();
    if (this.inCover && this.mode === 'foot') { /* cover reduces via enemy accuracy not here */ }
    if (this.health <= 0) this.die(kind);
  }

  die(kind: string) {
    if (this.mode === 'dead') return;
    this.health = 0;
    if (this.vehicle) this.exitVehicle(true);
    this.mode = 'dead'; this.deadT = 0; this.aiming = false; this.inCover = false;
    this.game.bus.emit('playerDied', { kind });
    this.game.hud?.showDeath(true);
  }

  respawn() {
    const g = this.game;
    const fee = clamp(Math.floor(g.economy.money * 0.05), 100, 2500);
    g.economy.spend(Math.min(fee, g.economy.money), 'Hospital bill');
    const hosp = g.poi('hospital');
    this.health = this.maxHealth; this.armor = 0; this.mode = 'foot'; this.stamina = 100; this.invuln = 3;
    this.teleport(hosp.x, hosp.z + 2, Math.PI);
    g.police.clearWanted();
    g.env.setHour(g.env.hour + 5);
    g.hud?.showDeath(false);
    g.hud?.toast(`Treated at Mercy Bay General — $${fee} billed`);
    g.cam.snapBehind(this.yaw);
    g.bus.emit('playerRespawn');
  }

  // ---------------------------------------------------------------- vehicles
  nearestVehicle(maxD = 4.2): Vehicle | null {
    let best: Vehicle | null = null, bd = maxD;
    for (const v of this.game.vehicles.list) {
      if (v.exploded || v.detail === 'hidden') continue;
      const dd = Math.hypot(v.x - this.x, v.z - this.z) - Math.max(0, (v.def.len * 0.5 - 1.2));
      if (dd < bd && Math.abs(v.y - this.y) < 4) { bd = dd; best = v; }
    }
    return best;
  }

  tryEnterVehicle() {
    if (this.mode !== 'foot' && this.mode !== 'swim') return false;
    const v = this.nearestVehicle();
    if (!v) return false;
    if (v.def.cls === 'heli' && v.driver) return false;
    this.enterTarget = v; this.enterT = 0; this.enterFrom.set(this.x, this.y, this.z);
    this.mode = 'entering'; this.aiming = false; this.inCover = false;
    if (v.driver && v.driver.kind === 'npc') this.game.vehicles.carjack(v, this);
    else if (v.locked) { this.game.police.reportCrime('breakin', this.x, this.z, 0.6); v.locked = false; this.game.audio.glass(); this.game.hud?.toast('Window smashed'); }
    return true;
  }

  private seatInto(v: Vehicle) {
    this.vehicle = v; this.seat = 0; this.mode = 'vehicle';
    v.driver = { kind: 'player', hum: this.hum, ref: this };
    v.engineOn = !v.engineDead;
    v.role = v.role === 'empty' || v.role === 'parked' || v.role === 'traffic' || v.role === 'police' ? (v.role === 'police' ? 'police' : 'owned') : v.role;
    if (v.role === 'owned') v.role = 'player';
    v.lightsOn = this.game.env.night > 0.4 || v.lightsOn;
    this.hum.root.removeFromParent(); v.group.add(this.hum.root);
    this.hum.root.position.copy(v.visual.driverPos); this.hum.root.position.y -= 0.95; this.hum.root.rotation.set(0, 0, 0);
    if (v.isBike) { this.hum.root.position.y += 0.2; }
    this.game.vehicles.onPlayerEnter(v);
    if (v.stolen || v.userData.civilian) { /* theft flagged in carjack */ }
    this.game.cam.snapBehind(v.yaw);
    this.game.bus.emit('enterVehicle', v);
  }

  exitVehicle(force = false) {
    const v = this.vehicle; if (!v) return;
    if (v.isHeli && v.heliAlt > 3.5 && !force) { this.game.hud?.toast('Land first'); return; }
    if (!force && v.speed > 14 && !v.isBoat) { this.game.hud?.toast('Slow down to exit'); return; }
    let spot: THREE.Vector3 | null = null;
    for (const side of [1, -1, 2.4, -2.4]) {
      const p = v.doorWorld(side * 1, new THREE.Vector3());
      const test = this.game.col.resolveCircle(p.x, p.z, 0.35, v.y + 0.2, 1.7, 0.4);
      if (!test.hit) { spot = new THREE.Vector3(p.x, 0, p.z); break; }
    }
    if (!spot) { spot = new THREE.Vector3(v.x, 0, v.z); spot.x += Math.cos(v.yaw) * 3; spot.z -= Math.sin(v.yaw) * 3; }
    this.hum.root.removeFromParent(); this.group.add(this.hum.root); this.hum.root.position.set(0, 0, 0); this.hum.root.rotation.set(0, 0, 0);
    const wasSpeed = v.speed;
    v.driver = null; v.ctrl.throttle = 0; v.ctrl.brake = 0; v.ctrl.steer = 0;
    if (!v.engineDead && v.role === 'player') { v.role = 'owned'; }
    v.engineOn = false;
    this.vehicle = null; this.mode = 'foot';
    this.x = spot.x; this.z = spot.z; this.y = v.isHeli || v.y > 1 ? v.y : Math.max(groundY(spot.x, spot.z), 0);
    this.vx = v.worldVx * 0.6; this.vz = v.worldVz * 0.6; this.vy = 0;
    if (wasSpeed > 12) { this.hurt((wasSpeed - 10) * 1.5, 'fall'); this.mode = 'foot'; this.stunned = 1; }
    this.yaw = v.yaw + Math.PI / 2;
    this.game.vehicles.onPlayerExit(v);
    this.game.cam.snapBehind(this.yaw);
    this.game.bus.emit('exitVehicle', v);
  }

  // ---------------------------------------------------------------- main update
  update(dt: number) {
    const g = this.game, inp = g.input;
    this.invuln = Math.max(0, this.invuln - dt); this.hitFlash = Math.max(0, this.hitFlash - dt * 2.5);
    this.fireCd = Math.max(0, this.fireCd - dt); this.meleeCd = Math.max(0, this.meleeCd - dt); this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.comboT = Math.max(0, this.comboT - dt); if (this.comboT === 0) this.combo = 0;
    this.stunned = Math.max(0, this.stunned - dt);
    this.noise = Math.max(0, this.noise - dt * 40);
    this.stats.timePlayed += dt;
    // health regen out of combat
    if (this.mode !== 'dead' && g.time - this.lastCombatT > 8 && this.health < this.maxHealth && g.police.wantedLevel === 0) this.health = Math.min(this.maxHealth, this.health + dt * 1.5);

    switch (this.mode) {
      case 'dead': this.updateDead(dt); break;
      case 'vehicle': this.updateVehicle(dt); break;
      case 'entering': this.updateEntering(dt); break;
      case 'climb': this.updateClimb(dt); break;
      case 'cutscene': this.hum.animate(dt, 0, 'idle'); break;
      default: if (this.game.cheats.noclip) this.updateNoclip(dt); else this.updateFoot(dt);
    }
    this.syncMesh();
  }

  private updateDead(dt: number) {
    this.deadT += dt;
    this.hum.animate(dt, 0, 'fallen');
    if (this.deadT > 4.2 && !this.game.hud?.deathFading) this.game.hud?.fadeOut();
    if (this.deadT > 5.0) this.respawn();
  }

  private updateEntering(dt: number) {
    const v = this.enterTarget!;
    this.enterT += dt;
    const dur = v.isHeli ? 0.8 : 0.5;
    const t = clamp(this.enterT / dur, 0, 1);
    const door = v.doorWorld(1, new THREE.Vector3());
    const seat = v.seatWorld(0, new THREE.Vector3());
    this.x = lerp(this.enterFrom.x, t < 0.5 ? door.x : seat.x, t < 0.5 ? t * 2 : 1);
    this.z = lerp(this.enterFrom.z, t < 0.5 ? door.z : seat.z, t < 0.5 ? t * 2 : 1);
    if (t >= 0.5) { this.x = lerp(door.x, seat.x, (t - 0.5) * 2); this.z = lerp(door.z, seat.z, (t - 0.5) * 2); }
    this.hum.animate(dt, 1.5, 'walk');
    this.yaw = dampAngle(this.yaw, v.yaw, 12, dt);
    if (t >= 1) { this.seatInto(v); }
  }

  private updateClimb(dt: number) {
    this.climbT += dt;
    const t = clamp(this.climbT / this.climbDur, 0, 1);
    const e = t < 0.6 ? (t / 0.6) * 0.85 : 0.85 + ((t - 0.6) / 0.4) * 0.15;
    const from = this.climbFrom, to = this.climbTo;
    this.y = lerp(from.y, to.y, Math.min(1, t / 0.7));
    const hk = t < 0.5 ? 0 : (t - 0.5) / 0.5;
    this.x = lerp(from.x, to.x, hk * hk); this.z = lerp(from.z, to.z, hk * hk);
    void e;
    this.hum.animate(dt, 0, 'climb');
    if (t >= 1) { this.mode = 'foot'; this.vy = 0; this.onGround = true; }
  }

  private surfaceAt(x: number, z: number) {
    const d = districtAt(x, z);
    if (groundY(x, z) < WATER_Y) return 'water';
    if (onRoad(x, z)) return 'asphalt';
    if (d === District.Beach || d === District.Marina || (d === District.Resort && x > 1100)) return 'sand';
    if (d === District.Park || d === District.Suburb || d === District.Rural || d === District.Luxury || d === District.Island) return 'grass';
    return 'concrete';
  }

  private updateFoot(dt: number) {
    const g = this.game, inp = g.input, col = g.col;
    const w = this.currentWeapon;
    const cam = g.cam;
    // ---- inputs
    let mx = inp.moveX, my = inp.moveY;
    if (this.stunned > 0) { mx = 0; my = 0; }
    const mag = Math.min(1, Math.hypot(mx, my));
    this.moveIntent = mag;
    const cy = cam.forwardYaw;
    const fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
    let wx = fx * my + rx * mx, wz = fz * my + rz * mx;
    const wl = Math.hypot(wx, wz); if (wl > 0.001) { wx /= wl; wz /= wl; }

    // aiming / combat state
    const ranged = w.kind === 'ranged' || w.kind === 'taser' || w.kind === 'throw';
    this.aiming = (inp.isHeld('aim') && ranged) && this.mode === 'foot' && this.stunned <= 0;
    if (inp.consume('weaponNext')) this.nextWeapon(1);
    if (inp.consume('reload') && ranged) this.startReload();
    if (inp.consume('crouch')) { this.crouch = !this.crouch; if (this.crouch) this.sprintTimer = 0; }
    const swimDepth = WATER_Y - groundY(this.x, this.z);
    const swimming = swimDepth > 1.05 && this.y < WATER_Y + 0.2;
    if (swimming && this.mode !== 'swim') { this.mode = 'swim'; g.fx.splash(this.x, WATER_Y, this.z, 14); g.audio.splash(); this.crouch = false; this.inCover = false; }
    if (!swimming && this.mode === 'swim') this.mode = 'foot';

    // ---- cover
    if (inp.consume('cover') && this.mode === 'foot') {
      if (this.inCover) this.leaveCover(); else this.tryCover();
    }
    if (this.inCover && (inp.consume('jump') || inp.consume('dodge'))) { this.leaveCover(); }

    // ---- sprint
    const wantSprint = inp.isHeld('sprint') || (this.autoSprint && mag > 0.93 && !this.aiming && !this.crouch);
    this.sprinting = wantSprint && mag > 0.3 && this.stamina > 3 && !this.aiming && !this.crouch && !this.inCover && this.stunned <= 0;
    const staminaMax = 100 + this.skills.stamina * 60;
    if (this.sprinting) { this.stamina -= dt * (swimming ? 14 : 12) * (1 - this.skills.stamina * 0.4); this.skills.stamina = Math.min(1, this.skills.stamina + dt * 0.0006); this.noise = Math.max(this.noise, 26); }
    else this.stamina = Math.min(staminaMax, this.stamina + dt * (mag < 0.2 ? 22 : 9));
    if (this.stamina < 3) this.sprinting = false;

    // ---- target speed
    let speed: number;
    if (this.mode === 'swim') speed = this.sprinting ? 4.0 : 2.3;
    else if (this.inCover) speed = 1.6;
    else if (this.crouch) speed = 1.9;
    else if (this.aiming) speed = 2.6;
    else if (this.sprinting) speed = 7.4 + this.skills.stamina * 1.0;
    else speed = mag < 0.4 ? 1.7 : 4.3;
    if (this.stunned > 0) speed = 0;
    if (g.cheats.superSpeed) speed *= 2.6;
    if (swimDepth > 0.3 && swimDepth <= 1.05) speed *= 0.65;
    const tx = wx * speed * (this.mode === 'swim' ? Math.min(1, mag) : Math.min(1, mag * 1.15)), tz = wz * speed * (this.mode === 'swim' ? Math.min(1, mag) : Math.min(1, mag * 1.15));
    const accel = this.onGround || this.mode === 'swim' ? 11 : 2.2;

    // ---- dodge roll
    if (this.mode === 'foot' && inp.consume('dodge') && this.dodgeCd <= 0 && this.stamina > 8 && !this.inCover) {
      this.mode = 'roll'; this.dodgeT = 0.52; this.dodgeCd = 0.9; this.invuln = Math.max(this.invuln, 0.36); this.stamina -= 8;
      if (wl > 0.1) { this.dodgeDirX = wx; this.dodgeDirZ = wz; } else { this.dodgeDirX = Math.sin(this.yaw); this.dodgeDirZ = Math.cos(this.yaw); }
      this.yaw = Math.atan2(this.dodgeDirX, this.dodgeDirZ); this.crouch = false; g.audio.whoosh();
    }
    if (this.mode === 'roll') {
      this.dodgeT -= dt;
      this.vx = this.dodgeDirX * 7.0; this.vz = this.dodgeDirZ * 7.0;
      this.hum.body.rotation.x = -(1 - this.dodgeT / 0.52) * Math.PI * 2;
      if (this.dodgeT <= 0) { this.mode = 'foot'; this.hum.body.rotation.x = 0; }
    } else {
      this.vx += (tx - this.vx) * Math.min(1, accel * dt); this.vz += (tz - this.vz) * Math.min(1, accel * dt);
    }

    // ---- facing
    if (this.aiming || (this.inCover && inp.isHeld('aim'))) {
      this.yaw = dampAngle(this.yaw, cy, 16, dt);
    } else if (this.inCover) {
      this.yaw = dampAngle(this.yaw, Math.atan2(-this.coverNx, -this.coverNz), 14, dt);
    } else if (wl > 0.1 && this.mode !== 'roll') {
      this.yaw = dampAngle(this.yaw, Math.atan2(wx, wz), this.sprinting ? 9 : 13, dt);
    }

    // ---- cover movement constraint: only slide along wall
    if (this.inCover) {
      const dot = this.vx * this.coverNx + this.vz * this.coverNz;
      this.vx -= dot * this.coverNx; this.vz -= dot * this.coverNz;
      // keep stuck to wall
      this.vx -= this.coverNx * 1.2; this.vz -= this.coverNz * 1.2;
      if (this.coverBox) { const b = this.coverBox; if (this.x < b.x0 - 1.2 || this.x > b.x1 + 1.2 || this.z < b.z0 - 1.2 || this.z > b.z1 + 1.2 || (mag > 0.5 && inp.isHeld('sprint'))) this.leaveCover(); }
    }

    // ---- jump / gravity
    this.coyote = this.onGround ? 0.12 : Math.max(0, this.coyote - dt);
    if (inp.consume('jump') && this.mode !== 'roll' && !this.inCover) {
      if (this.mode === 'swim') { this.vy = 0; }
      else if (this.coyote > 0 && !this.crouch) { this.vy = g.cheats.superJump ? 17 : 7.4; this.onGround = false; this.coyote = 0; this.fallStartY = this.y; g.audio.jump(); this.noise = Math.max(this.noise, 16); }
      else if (this.crouch) this.crouch = false;
    }
    if (this.mode === 'swim') { this.vy = 0; this.y = lerp(this.y, WATER_Y - 0.95, 1 - Math.exp(-8 * dt)); }
    else this.vy -= 22 * dt;

    // ---- integrate horizontal with collision
    const h = this.crouch || this.inCover ? 1.2 : 1.8;
    const oldX = this.x, oldZ = this.z;
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vx, this.vz) * dt) / 0.25));
    let hitBox: any = null, hitN = [0, 0];
    for (let s = 0; s < steps; s++) {
      this.x += (this.vx * dt) / steps; this.z += (this.vz * dt) / steps;
      const res = col.resolveCircle(this.x, this.z, this.radius, this.y, h, 0.46);
      if (res.hit) { this.x = res.x; this.z = res.z; hitBox = res.box; hitN = [res.nx, res.nz]; }
    }
    // world water boundaries — block walking into deep ocean far from shore? (swim allowed)

    // ---- climb detection
    if (hitBox && this.mode === 'foot' && mag > 0.3 && !this.inCover && (this.vy > -1) && hitBox.kind !== 'tree') {
      const toward = wx * -hitN[0] + wz * -hitN[1];
      const ledge = hitBox.y1 - this.y;
      if (toward > 0.55 && ledge > 0.5 && ledge < 4.3 && (this.onGround || this.vy > 0) && (inp.isHeld('jump') || this.sprinting || ledge < 1.3 || this.autoClimb)) {
        const ex = this.x - hitN[0] * 0.75, ez = this.z - hitN[1] * 0.75;
        const clear = col.resolveCircle(ex, ez, 0.3, hitBox.y1, 1.7, 0.1);
        const sup = col.supportY(ex, ez, 0.2, hitBox.y1 + 0.2);
        if (!clear.hit && Math.abs(sup - hitBox.y1) < 0.35) {
          this.mode = 'climb'; this.climbT = 0; this.climbDur = 0.55 + ledge * 0.16;
          this.climbFrom.set(this.x, this.y, this.z); this.climbTo.set(ex, hitBox.y1, ez);
          this.yaw = Math.atan2(-hitN[0], -hitN[1]); this.vx = this.vz = 0;
          return;
        }
      }
    }

    // ---- vertical
    if (this.mode !== 'swim') {
      this.y += this.vy * dt;
      const support = col.supportY(this.x, this.z, 0.25, this.y + 0.46);
      if (this.y <= support + 0.001 && this.vy <= 0.01) {
        if (!this.onGround) {
          const fall = this.fallStartY - support;
          const impactV = -this.vy;
          if (impactV > 13) { this.hurt((impactV - 13) * 6, 'fall'); g.audio.thud(); this.stunned = Math.max(this.stunned, 0.5); }
          else if (impactV > 4) { g.audio.land(this.surface); this.noise = Math.max(this.noise, 14); }
          void fall;
        }
        this.y = support; this.vy = 0; this.onGround = true; this.fallStartY = this.y;
      } else {
        if (this.onGround && this.y > support + 0.25) this.fallStartY = this.y;
        this.onGround = false;
        if (this.vy > 0 || this.y > support + 0.05) this.onGround = this.y <= support + 0.06 && this.vy <= 0;
      }
      if (this.y < -9) { this.y = -9; this.vy = 0; }
    }
    this.stats.distance += Math.hypot(this.x - oldX, this.z - oldZ);

    // ---- surface/footsteps
    const sp = Math.hypot(this.vx, this.vz);
    if (this.onGround || this.mode === 'swim') {
      this.surface = this.surfaceAt(this.x, this.z) as any;
      this.stepPhase += sp * dt * (this.sprinting ? 0.5 : 0.62);
      if (this.stepPhase > 1) {
        this.stepPhase -= 1;
        if (sp > 1.2) { g.audio.step(this.surface, sp, this.crouch); const base = this.crouch ? 4 : this.sprinting ? 28 : 12; this.noise = Math.max(this.noise, base * (1 - this.skills.stealth * 0.3)); if (this.surface === 'sand') g.fx.dust(this.x, this.y + 0.1, this.z, 2, 0xd9c690); if (this.mode === 'swim') g.fx.splash(this.x, WATER_Y, this.z, 2); }
      }
    }
    if (this.surface === 'water' && this.mode !== 'swim' && sp > 1) g.fx.splash(this.x, WATER_Y, this.z, 1);

    // ---- combat actions
    this.updateCombat(dt, wl > 0.1 ? [wx, wz] : [Math.sin(this.yaw), Math.cos(this.yaw)]);

    // ---- interact / enter vehicle / phone / map

    // visibility
    let vis = 1; if (this.crouch) vis *= 0.55; if (this.inCover) vis *= 0.6; vis *= 1 - g.env.night * 0.35 * (g.env.rainLevel > 0.2 ? 1 : 1); this.visibility = vis * (1 - this.skills.stealth * 0.15);

    // ---- animation
    let pose: Pose = this.mode === 'swim' ? 'swim' : this.aiming ? 'aim' : this.inCover ? 'cover' : 'walk';
    if (this.mode === 'roll') pose = 'dodge';
    if (this.stunned > 0.01) pose = 'handsup';
    if (this.meleeAnim > 0) { pose = 'punch'; this.meleeAnim -= dt; }
    if (this.phoneUp && sp < 0.5) pose = 'phone';
    if (!this.onGround && this.mode === 'foot' && this.vy < -1) pose = 'walk';
    if (this.mode === 'swim') this.hum.body.position.y = lerp(0, 0, 1);
    this.hum.animate(dt, sp, pose, { crouch: this.crouch, aimPitch: 0, sprint: this.sprinting });
  }
  meleeAnim = 0; autoClimb = true;

  private updateNoclip(dt: number) {
    const g = this.game, inp = g.input;
    const cy = g.cam.forwardYaw, sp = inp.isHeld('sprint') ? 70 : 22;
    const fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
    const wx = fx * inp.moveY + rx * inp.moveX, wz = fz * inp.moveY + rz * inp.moveX;
    const up = (inp.isHeld('jump') ? 1 : 0) - (inp.isHeld('crouch') ? 1 : 0);
    this.x += wx * sp * dt; this.z += wz * sp * dt; this.y += up * sp * 0.6 * dt; this.vy = 0; this.vx = this.vz = 0; this.onGround = false; this.fallStartY = this.y;
    if (Math.hypot(wx, wz) > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(wx, wz), 10, dt);
    inp.consume('jump'); inp.consume('crouch');
    this.hum.animate(dt, 0, 'idle');
  }

  private tryCover() {
    const col = this.game.col;
    const boxes = col.query(this.x - 1.6, this.z - 1.6, this.x + 1.6, this.z + 1.6, []);
    let best: any = null, bd = 1.6;
    for (const b of boxes) {
      if (b.kind === 'tree' || b.y1 - this.y < 0.7 || b.y0 > this.y + 0.5) continue;
      const cx = clamp(this.x, b.x0, b.x1), cz = clamp(this.z, b.z0, b.z1);
      const d = Math.hypot(this.x - cx, this.z - cz);
      if (d < bd) { bd = d; best = { b, cx, cz }; }
    }
    if (best) {
      const dx = this.x - best.cx, dz = this.z - best.cz, l = Math.hypot(dx, dz) || 1;
      this.coverNx = dx / l; this.coverNz = dz / l; this.coverBox = best.b; this.inCover = true; this.crouch = true;
      this.x = best.cx + this.coverNx * (this.radius + 0.1); this.z = best.cz + this.coverNz * (this.radius + 0.1);
      this.game.hud?.toast('In cover');
    }
  }
  private leaveCover() { this.inCover = false; this.coverBox = null; this.crouch = false; }

  startReload() {
    const w = this.currentWeapon; if (w.kind === 'melee' || this.reloadT > 0) return;
    const mag = this.loadout.mag[w.id] ?? 0, res = this.loadout.ammo[w.id] ?? 0;
    if (mag >= w.mag || res <= 0) return;
    this.reloadT = w.reload; this.game.audio.reload();
  }

  private updateCombat(dt: number, dir: number[]) {
    const g = this.game, inp = g.input, w = this.currentWeapon;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) { const need = w.mag - (this.loadout.mag[w.id] ?? 0); const take = Math.min(need, this.loadout.ammo[w.id] ?? 0); this.loadout.mag[w.id] = (this.loadout.mag[w.id] ?? 0) + take; this.loadout.ammo[w.id] = (this.loadout.ammo[w.id] ?? 0) - take; }
    }
    const wantFire = w.auto ? inp.isHeld('attack') : inp.consume('attack');
    this.aimTarget = this.aiming ? g.combat.findAimTarget(this) : null;
    if (w.kind === 'melee') {
      if (wantFire && this.meleeCd <= 0 && this.mode === 'foot') {
        // stealth takedown check
        if (g.combat.tryTakedown(this)) return;
        this.meleeCd = 1 / w.rate; this.meleeAnim = 0.3; this.combo = (this.combo + 1) % 3; this.comboT = 0.9;
        if (this.combo === 0) this.meleeCd *= 1.4;
        g.combat.playerMelee(this, w, this.combo);
        this.lastCombatT = g.time;
      }
      return;
    }
    if (wantFire && this.fireCd <= 0 && this.reloadT <= 0 && this.mode === 'foot') {
      const mag = this.loadout.mag[w.id] ?? 0;
      if (w.kind === 'throw') {
        if ((this.loadout.ammo[w.id] ?? 0) > 0 || mag > 0) {
          if (mag > 0) this.loadout.mag[w.id] = mag - 1; else this.loadout.ammo[w.id]!--;
          this.fireCd = 1 / w.rate; g.combat.throwGrenade(this); this.meleeAnim = 0.3; this.lastCombatT = g.time;
        } else g.hud?.toast('No grenades');
        return;
      }
      if (mag <= 0) { if ((this.loadout.ammo[w.id] ?? 0) > 0) this.startReload(); else { g.audio.click(); this.fireCd = 0.3; } return; }
      this.loadout.mag[w.id] = mag - 1;
      this.fireCd = 1 / w.rate;
      g.combat.playerFire(this, w);
      this.lastCombatT = g.time; this.noise = Math.max(this.noise, w.kind === 'taser' ? 8 : w.noise);
      this.skills.shooting = Math.min(1, this.skills.shooting + 0.0008);
      if (!this.aiming) this.yaw = dampAngle(this.yaw, g.cam.forwardYaw, 30, dt);
    }
    void dir;
  }

  // ---------------------------------------------------------------- vehicle driving
  private updateVehicle(dt: number) {
    const g = this.game, inp = g.input, v = this.vehicle!;
    if (!v || v.exploded) { if (v) this.exitVehicle(true); return; }
    const c = v.ctrl;
    let steer = inp.moveX, thr = inp.throttle, brk = inp.brakeAxis;
    if (v.isHeli) {
      c.pitch = inp.moveY; c.steer = inp.moveX; c.lift = (inp.isHeld('ascend') ? 1 : 0) - (inp.isHeld('descend') ? 1 : 0) + (inp.throttle > 0.1 && v.isHeli ? 0 : 0);
      if (inp.isHeld('accelerate')) c.lift = 1; if (inp.isHeld('brake')) c.lift = -1;
      c.throttle = 1; c.brake = 0;
    } else {
      // analog steering curve for touch
      c.steer = Math.sign(steer) * Math.pow(Math.abs(steer), 1.25);
      c.throttle = thr; c.brake = brk;
      if (inp.lastDevice !== 'touch') { /* keyboard: W is throttle, S brake */ }
      if (v.isBoat) { c.throttle = Math.max(thr, inp.moveY > 0.2 ? inp.moveY : 0); c.brake = Math.max(brk, inp.moveY < -0.2 ? -inp.moveY : 0); }
      c.handbrake = inp.isHeld('handbrake'); c.nitro = inp.isHeld('nitro');
    }
    c.horn = inp.isHeld('horn');
    if (inp.consume('camera')) g.cam.driveView = (g.cam.driveView + 1) % 4;
    g.cam.lookBack = inp.isHeld('lookBack');
    if (inp.consume('radio')) g.audio.nextStation();
    if (inp.consume('interact')) { v.lightsOn = !v.lightsOn; g.hud?.toast(v.lightsOn ? 'Lights on' : 'Lights off'); }
    if (inp.consume('enter')) { if (v.speed < 14 || v.isBoat) this.exitVehicle(); else g.hud?.toast('Slow down to exit'); }
    // police siren toggle
    if (v.def.cls === 'police' && inp.consume('horn')) v.sirenOn = !v.sirenOn;
    // skills
    if (v.speed > 25) this.skills.driving = Math.min(1, this.skills.driving + dt * 0.0003);
    if (this.mode === 'vehicle') {
      this.x = v.x; this.y = v.y; this.z = v.z; this.yaw = v.yaw;
      this.hum.animate(dt, 0, 'drive');
      if (v.isBike) { this.hum.armL.rotation.x = -1.2; this.hum.armR.rotation.x = -1.2; }
      else if (!v.isHeli) { this.hum.armL.rotation.x = -1.25 - 0.1; this.hum.armR.rotation.x = -1.25; this.hum.armL.rotation.z = -0.1 + v.steerIn * -0.3; this.hum.armR.rotation.z = 0.1 + v.steerIn * -0.3; }
      this.hum.root.rotation.y = 0;
    }
    this.stats.distance += v.speed * dt;
  }

  syncMesh() {
    if (this.mode === 'vehicle') { this.group.position.set(this.x, this.y - 200, this.z); return; }
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.yaw;
    const sink = this.mode === 'swim' ? -0.3 : 0;
    this.hum.root.position.y = sink;
  }

  /** Serialize for save. */
  toSave() {
    return { x: this.x, y: this.y, z: this.z, yaw: this.yaw, health: this.health, armor: this.armor, loadout: this.loadout, skills: this.skills, stats: this.stats, stamina: this.stamina };
  }
  fromSave(s: any) {
    if (!s) return;
    this.teleport(s.x, s.z, s.yaw, s.y);
    this.health = s.health ?? 100; this.armor = s.armor ?? 0; this.loadout = s.loadout ?? defaultLoadout(); Object.assign(this.skills, s.skills ?? {}); Object.assign(this.stats, s.stats ?? {});
    this.equip(this.loadout.current);
  }
}
