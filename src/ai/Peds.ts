import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Npc, Faction } from '../actors/Npc';
import { Vehicle } from '../vehicles/Vehicle';
import { DynamicGrid } from '../world/Collision';
import * as L from '../world/CityLayout';
import { District } from '../world/CityLayout';
import { Rng, clamp, dampAngle, wrapAngle } from '../core/MathUtil';
import { edgeOpen } from './Traffic';
import { Pose } from '../actors/Humanoid';

const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
const FIRST = ['Ava', 'Mateo', 'Lucia', 'Jamal', 'Priya', 'Owen', 'Camila', 'Dmitri', 'Keiko', 'Tomás', 'Nia', 'Hector', 'Sofia', 'Marcus', 'Ines', 'Leon', 'Yara', 'Gabe', 'Rosa', 'Theo', 'Mina', 'Caleb', 'Zara', 'Andre'];
const LAST = ['Santos', 'Brooks', 'Nakamura', 'Okafor', 'Rivera', 'Lindqvist', 'Haddad', 'Moreau', 'Dang', 'Alvarez', 'Pruitt', 'Castellanos', 'Reyes', 'Bell', 'Ortega', 'Kowalski'];
const CHAT = ['Did you see the game last night?', 'Rent is insane around here.', 'This heat is brutal.', 'I heard Aldana is buying up half of Ironside.', 'Best noodles in town, no contest.', 'Traffic on Route 9 again…', 'My cousin works at the port. Says shipments are weird lately.', 'Lovely weather for the beach!', 'Another construction site? Where does the money come from?', 'The Neon Reef opens at eight tonight.', 'Watch out for the Reapers after dark.', 'They say the Saltwater Kings run the docks.', 'I love this city. Mostly.', 'Gas is cheaper at Gulfline.', 'You hear sirens last night?'];
const RAIN_CHAT = ['Ugh, I forgot my umbrella.', 'Storm is getting worse!', 'At least it cools things down.'];
const NIGHT_CHAT = ['It is late… we should head home.', 'The city never sleeps, huh?', 'Stay close, it gets sketchy out here.'];
const BARKS_FEAR = ['Help!', 'Somebody call the police!', 'He has a gun!', 'Run!', 'Oh my god!', 'Please don’t hurt me!'];
const BARKS_ANGRY = ['Watch it!', 'Hey, I’m walking here!', 'Are you blind?!', 'Idiot!'];

export class PedManager {
  npcs: Npc[] = [];
  grid = new DynamicGrid<Npc>(12);
  group = new THREE.Group();
  rng = new Rng(777);
  private spawnT = 0;
  bubbles: { npc: Npc; text: string; t: number }[] = [];
  private tmp: Npc[] = [];
  private tmpV: Vehicle[] = [];
  private updateIdx = 0;
  wildlife: Wildlife;
  enabled = true;


  constructor(private g: Game) {
    g.env.scene.add(this.group);
    this.wildlife = new Wildlife(g);
  }

  all() { return this.npcs; }

  // ------------------------------------------------------------ creation
  private name() { return this.rng.pick(FIRST) + ' ' + this.rng.pick(LAST); }

  makeCivilian(x: number, z: number, style?: 'civ' | 'rich' | 'poor' | 'worker' | 'beach'): Npc {
    const d = L.districtAt(x, z);
    const st = style ?? (d === District.Luxury || d === District.Island ? 'rich' : d === District.Poor ? 'poor' : d === District.Industrial ? 'worker' : d === District.Beach || d === District.Resort || d === District.Marina ? 'beach' : 'civ');
    const n = new Npc(Npc.randomOutfit(this.rng, st), this.rng.range(0.93, 1.07));
    n.name = this.name(); n.x = x; n.z = z; n.y = Math.max(L.groundY(x, z), 0); n.yaw = this.rng.range(0, 6.28);
    n.health = n.maxHealth = this.rng.range(45, 75);
    n.speedWalk = this.rng.range(1.2, 1.7); n.speedRun = this.rng.range(4.4, 5.8);
    n.faction = 'civ'; n.userData.style = st;
    n.userData.courage = this.rng.next();
    n.userData.reporter = this.rng.chance(0.65);
    n.userData.cash = this.rng.int(10, st === 'rich' ? 400 : 120);
    n.gender = this.rng.chance(0.5) ? 'm' : 'f';
    this.add(n);
    return n;
  }

  makeDriver(v: Vehicle): Npc {
    const st = v.def.cls === 'taxi' || v.def.cls === 'bus' ? 'worker' : 'civ';
    const n = new Npc(Npc.randomOutfit(this.rng, st), 1);
    n.name = this.name(); n.state = 'driver'; n.vehicle = v; n.faction = 'civ';
    n.health = n.maxHealth = 60; n.userData.courage = this.rng.next(); n.userData.cash = this.rng.int(20, 300);
    n.userData.reporter = true;
    this.npcs.push(n); this.group.add(n.group); n.group.visible = true;
    return n;
  }

  /** Register an externally created NPC (cops, gang, mission). */
  add(n: Npc) {
    if (!this.npcs.includes(n)) this.npcs.push(n);
    if (n.group.parent !== this.group) this.group.add(n.group);
    n.syncMesh(0, 0);
    return n;
  }
  adopt(n: Npc) {
    this.add(n);
    if (n.faction === 'civ') { n.state = 'walk'; n.userData.walk = undefined; }
  }
  release(n: Npc) {
    const i = this.npcs.indexOf(n); if (i >= 0) this.npcs.splice(i, 1);
    n.group.removeFromParent();
    if (n.hum.root.parent && n.hum.root.parent !== n.group) n.hum.root.removeFromParent();
  }
  remove(n: Npc) { this.release(n); }

  // ------------------------------------------------------------ queries
  pedestrianAhead(x: number, z: number, fx: number, fz: number, dist: number, halfW: number) {
    let best = 999;
    this.grid.query(x + fx * dist * 0.5, z + fz * dist * 0.5, dist * 0.6 + 2, this.tmp);
    for (const n of this.tmp) {
      if (n.vehicle || n.dead && n.corpseT > 5) continue;
      const ox = n.x - x, oz = n.z - z, along = ox * fx + oz * fz, side = ox * -fz + oz * fx;
      if (along > 0 && along < dist && Math.abs(side) < halfW) best = Math.min(best, along - 2);
    }
    return best;
  }

  nearestNpc(x: number, z: number, maxD: number, pred?: (n: Npc) => boolean) {
    let best: Npc | null = null, bd = maxD;
    for (const n of this.npcs) { if (n.vehicle || (pred && !pred(n))) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  canSee(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, eye = 1.6) {
    return this.g.col.los(a.x, a.y + eye, a.z, b.x, b.y + 1.4, b.z);
  }

  /** Civilians / cops that could have witnessed an event at (x,z). */
  findWitnesses(x: number, z: number, range = 35, includeCops = true) {
    const out: Npc[] = [];
    for (const n of this.npcs) {
      if (n.dead || n.knocked > 0 || n.faction === 'gang' || n.faction === 'rival' || n.faction === 'target') continue;
      if (!includeCops && (n.faction === 'cop' || n.faction === 'swat')) continue;
      const d = Math.hypot(n.x - x, n.z - z); if (d > range) continue;
      if (d > 6 && !this.g.col.los(n.x, n.y + 1.6, n.z, x, n.y + 1.4, z)) continue;
      out.push(n);
    }
    return out;
  }

  // ------------------------------------------------------------ events
  alarmed(source: Npc | null, x: number, z: number, kind: string, radius = 60) {
    const rr = kind === 'gunshot' ? radius * 0.8 : kind === 'explosion' ? radius * 1.2 : kind === 'crash' ? 30 : radius;
    for (const n of this.npcs) {
      if (n === source || n.dead || n.vehicle && n.vehicle.role !== 'traffic') continue;
      const d = Math.hypot(n.x - x, n.z - z); if (d > rr) continue;
      if (n.faction === 'civ') {
        const k = 1 - d / rr;
        if (kind === 'crash' && d > 15) { n.userData.watch = { x, z }; if (n.state === 'walk' || n.state === 'idle') { n.state = 'watch'; n.stateT = 3 + this.rng.range(0, 3); } continue; }
        n.fear = Math.max(n.fear, 0.5 + 0.5 * k * (1.1 - n.userData.courage * 0.4));
        if (n.vehicle) { n.userData.panic = true; continue; }
        if (n.state !== 'flee' && n.state !== 'phone') { n.state = 'flee'; n.stateT = 8 + this.rng.range(0, 10); n.userData.fleeFrom = { x, z }; if (this.rng.chance(0.18)) this.say(n, this.rng.pick(BARKS_FEAR), 2.2); }
      } else if (n.faction === 'gang' || n.faction === 'rival') { n.alert = 1; n.userData.hear = { x, z, t: this.g.time }; }
    }
  }

  say(n: Npc, text: string, ttl = 3) {
    if (this.bubbles.find((b) => b.npc === n)) return;
    this.bubbles.push({ npc: n, text, t: ttl });
    this.g.audio.voice(n);
  }

  /** Something hurt an NPC. Handles witness / crime reporting / reactions. */
  onNpcHurt(n: Npc, shooter: any, kind: string, head: boolean, silent = false) {
    const g = this.g;
    n.lastDamager = shooter; n.lastDamageT = g.time;
    if (n.faction === 'civ' || n.faction === 'merchant' || n.faction === 'friend') {
      if (!n.dead && n.knocked <= 0) {
        if (n.userData.courage > 0.88 && shooter !== g.player && false) { n.state = 'combat'; }
        else { n.fear = 1; if (n.state !== 'flee') { n.state = 'flee'; n.stateT = 14; } n.userData.fleeFrom = { x: shooter?.x ?? n.x, z: shooter?.z ?? n.z }; if (this.rng.chance(0.4)) this.say(n, this.rng.pick(BARKS_FEAR), 2); }
      }
      if (shooter === g.player) {
        const dead = n.dead; const sev = dead ? 1.6 : kind === 'takedown' ? 0.5 : 0.8;
        g.police.reportCrime(dead ? 'murder' : 'assault', n.x, n.z, sev, { victim: n, silent });
        g.player.stats.crimes++;
        if (n.dead && n.userData.cash) { g.economy.addCash(Math.floor(n.userData.cash * 0.6), 'Loot'); n.userData.cash = 0; }
      }
    } else if (n.faction === 'cop' || n.faction === 'swat') {
      if (shooter === g.player) { g.police.reportCrime(n.dead ? 'copkill' : 'copassault', n.x, n.z, n.dead ? 3 : 1.5, { victim: n, direct: true }); }
      n.alert = 1; n.userData.target = shooter;
    } else if (n.faction === 'gang' || n.faction === 'rival' || n.faction === 'target') {
      n.alert = 1; n.userData.hostile = true; if (shooter === g.player) { n.state = 'combat'; n.target = g.player; this.alertGroup(n); }
    }
    if (n.dead) { g.bus.emit('npcKilled', { npc: n, by: shooter, kind }); }
    g.bus.emit('npcHurt', { npc: n, by: shooter, kind });
  }

  private alertGroup(n: Npc) {
    for (const o of this.npcs) if (o !== n && o.faction === n.faction && !o.dead && Math.hypot(o.x - n.x, o.z - n.z) < 40) { o.alert = 1; o.userData.hostile = true; if (o.state !== 'combat') { o.state = 'combat'; o.target = this.g.player; } }
  }

  // ------------------------------------------------------------ interaction
  interactNearest(): boolean {
    const g = this.g, p = g.player;
    const n = this.nearestNpc(p.x, p.z, 3.0, (o) => !o.dead && o.knocked <= 0 && o.faction !== 'cop' && o.faction !== 'swat' && o.faction !== 'gang' && o.faction !== 'rival');
    if (!n) return false;
    const toN = Math.atan2(n.x - p.x, n.z - p.z);
    if (Math.abs(wrapAngle(toN - p.yaw)) > 1.6) return false;
    if (g.missions.talkTo(n)) return true;
    // armed? rob
    if (p.aiming && p.currentWeapon.kind === 'ranged') {
      if (n.userData.cash > 0) { const c = n.userData.cash * this.rng.range(1, 2.5); g.economy.addCash(Math.floor(c), 'Robbery'); n.userData.cash = 0; n.state = 'flee'; n.stateT = 15; n.fear = 1; g.police.reportCrime('robbery', n.x, n.z, 1.0, { victim: n }); g.hud?.toast('Robbed a pedestrian'); this.say(n, 'Take it, just take it!', 2.5); p.stats.crimes++; return true; }
      g.hud?.toast('Nothing to steal');
      return true;
    }
    n.state = 'talk'; n.stateT = 3.5; n.userData.talkTo = p; n.yaw = Math.atan2(p.x - n.x, p.z - n.z);
    const line = this.localTalk(n);
    g.hud?.dialogue(n.name, line, n.userData.style === 'poor' ? 'Local' : 'Pedestrian');
    return true;
  }

  private localTalk(n: Npc): string {
    const g = this.g;
    const r = this.rng.next();
    if (r < 0.2 && g.police.wantedLevel > 0) return 'Cops are all over the place. You in trouble?';
    if (r < 0.4) { const poi = g.pois.filter((p) => p.kind === 'restaurant' || p.kind === 'gas' || p.kind === 'club' || p.kind === 'cinema')[this.rng.int(0, 5)]; if (poi) { g.markers.revealPoi(poi.id); return `Looking for something? Try ${poi.name}. I marked it on your map.`; } }
    if (g.env.weather === 'rain' || g.env.weather === 'storm') return this.rng.pick(RAIN_CHAT);
    if (g.env.night > 0.6) return this.rng.pick(NIGHT_CHAT);
    return this.rng.pick(CHAT);
  }

  // ------------------------------------------------------------ spawn
  private ringSpawn() {
    const g = this.g, px = g.player.x, pz = g.player.z, R = g.quality.simRadius;
    const ang = this.rng.range(0, Math.PI * 2), dist = this.rng.range(30, R * 0.85);
    const x = px + Math.cos(ang) * dist, z = pz + Math.sin(ang) * dist;
    if (Math.abs(x) > L.HALF - 20 || Math.abs(z) > L.HALF - 20) return;
    const d = L.districtAt(x, z);
    if (!L.isUrban(d) && d !== District.Beach && d !== District.Marina) return;
    // density by district / time
    let k = d === District.Downtown || d === District.Shopping ? 1.2 : d === District.Midtown || d === District.Resort ? 0.9 : d === District.Beach ? 0.8 : d === District.Park ? 0.6 : d === District.Suburb ? 0.4 : 0.5;
    const h = g.env.hour;
    k *= h < 5 ? 0.15 : h < 7 ? 0.45 : h > 22 ? 0.4 : h > 20 ? 0.7 : 1;
    if (g.env.rainLevel > 0.4) k *= 0.45;
    if (this.rng.next() > k) return;
    // find a sidewalk point
    const i = Math.round((x + L.HALF) / L.CELL), j = Math.round((z + L.HALF) / L.CELL);
    let sx = x, sz = z, walkInit: any = null;
    if (d === District.Beach || d === District.Park || d === District.Marina) {
      if (L.groundY(x, z) < -0.2 || L.onRoad(x, z)) return;
    } else {
      const dir = this.rng.int(0, 3);
      if (!L.nodeExists(i, j) || !edgeOpen(i, j, dir)) return;
      const ti = i + DX[dir], tj = j + DZ[dir]; if (!L.nodeExists(ti, tj)) return;
      const axisX = dir % 2 === 0, hw = axisX ? L.lineHalfWidth('z', j) : L.lineHalfWidth('x', i);
      const t = this.rng.range(0.2, 0.8), side = this.rng.chance(0.5) ? 1 : -1;
      const off = hw + L.SIDEWALK * 0.5;
      sx = L.lineCoord(i) + DX[dir] * L.CELL * t + -DZ[dir] * side * off; sz = L.lineCoord(j) + DZ[dir] * L.CELL * t + DX[dir] * side * off;
      if (L.isWater(sx, sz) || L.onBridge(sx, sz)) return;
      walkInit = { fi: i, fj: j, ti, tj, dir, side, next: dir };
    }
    // not on camera
    const sp = new THREE.Vector3(sx, 1, sz).project(g.cam.camera);
    if (sp.z < 1 && Math.abs(sp.x) < 1.05 && Math.abs(sp.y) < 1.05 && dist < 90) return;
    for (const n of this.npcs) if (Math.abs(n.x - sx) < 1.2 && Math.abs(n.z - sz) < 1.2) return;
    const n = this.makeCivilian(sx, sz);
    if (walkInit) { n.userData.walk = walkInit; n.state = 'walk'; }
    else { n.state = this.rng.chance(0.5) ? 'wander' : (d === District.Beach && this.rng.chance(0.5) ? 'sunbathe' : 'idle'); n.stateT = this.rng.range(3, 12); }
    // groups: chatting pair
    if (this.rng.chance(0.12) && walkInit) {
      const m = this.makeCivilian(sx + 1.0, sz + 0.4); m.state = 'chat'; n.state = 'chat'; n.talkPartner = m; m.talkPartner = n; n.stateT = m.stateT = this.rng.range(15, 50);
      n.yaw = Math.atan2(m.x - n.x, m.z - n.z); m.yaw = n.yaw + Math.PI;
      n.userData.walk = m.userData.walk = undefined;
    }
    // morning commute / nightlife intent
    if (walkInit) this.chooseIntent(n);
  }

  /** Daily routine: pick a destination type from time of day. */
  private chooseIntent(n: Npc) {
    const g = this.g, h = g.env.hour;
    const r = this.rng.next();
    let kinds: string[] = [];
    if (h >= 6 && h < 10) kinds = r < 0.6 ? ['work'] : ['restaurant', 'gas'];
    else if (h >= 11 && h < 14) kinds = ['restaurant'];
    else if (h >= 17 && h < 20) kinds = r < 0.5 ? ['restaurant', 'bar'] : ['home'];
    else if (h >= 20 || h < 3) kinds = r < 0.7 ? ['club', 'bar'] : ['hotel', 'restaurant'];
    else kinds = ['clothing', 'cinema', 'restaurant', 'gym'];
    if (this.rng.chance(0.55)) return; // most just wander
    const cands = g.pois.filter((p) => kinds.includes(p.kind) && g.economy.isOpen(p) && Math.hypot(p.x - n.x, p.z - n.z) < 450);
    if (cands.length) { n.userData.dest = this.rng.pick(cands); n.userData.destKind = n.userData.dest.kind; }
    else if (kinds.includes('work')) { n.userData.workWalk = true; }
  }

  // ------------------------------------------------------------ update
  update(dt: number) {
    const g = this.g, px = g.player.x, pz = g.player.z;
    this.grid.clear();
    for (const n of this.npcs) if (!n.vehicle) this.grid.insert(n);
    this.spawnT -= dt;
    const cap = g.quality.pedCap;
    let civCount = 0; for (const n of this.npcs) if (n.faction === 'civ' && !n.vehicle) civCount++;
    if (this.spawnT <= 0 && civCount < cap && this.enabled) { this.spawnT = 0.15; for (let k = 0; k < 3; k++) this.ringSpawn(); }
    const R = g.quality.simRadius + 40;
    const t = g.time;
    for (let i = this.npcs.length - 1; i >= 0; i--) {
      const n = this.npcs[i];
      const d = Math.hypot(n.x - px, n.z - pz);
      // despawn far civilians (not mission-critical)
      if (d > R + 20 && !n.tag && !n.userData.keep && (n.faction === 'civ' || n.faction === 'gang') && !n.vehicle) { this.release(n); continue; }
      if (n.vehicle) { this.syncDriver(n); continue; }
      n.simLevel = d < 60 ? 0 : d < R ? 1 : 2;
      n.hum.setFar(d > 32 && n.faction !== 'friend' && !n.tag);
      // reduced simulation for distant NPCs: update at lower rate
      const ud = n.userData; ud.acc = (ud.acc ?? 0) + dt;
      const interval = n.simLevel === 0 ? 0 : n.simLevel === 1 ? 0.25 : 1.0;
      if (ud.acc < interval) { n.group.visible = n.simLevel === 0 || (n.simLevel === 1 && d < this.g.quality.simRadius * 0.62); this.tickAnim(n, dt); continue; }
      const sdt = ud.acc; ud.acc = 0;
      this.think(n, sdt, d);
      n.group.visible = d < this.g.quality.simRadius * 0.62 && n.state !== 'inside';
      n.syncMesh(sdt, t);
    }
    // bubbles
    for (let i = this.bubbles.length - 1; i >= 0; i--) { const b = this.bubbles[i]; b.t -= dt; if (b.t <= 0 || b.npc.dead) this.bubbles.splice(i, 1); }
    // vehicle hits
    this.vehicleHits(dt);
    this.wildlife.update(dt);
  }

  private tickAnim(n: Npc, dt: number) {
    if (n.group.visible) { const pose = this.poseFor(n); n.hum.animate(dt, n.speed, pose); n.syncMesh(dt, 0); }
  }
  private poseFor(n: Npc): Pose {
    if (n.dead || n.knocked > 0) return 'fallen';
    if (n.stunned > 0) return 'handsup';
    switch (n.state) {
      case 'handsup': return 'handsup'; case 'phone': return 'phone'; case 'sunbathe': return 'fallen'; case 'sit': return 'sit';
      case 'combat': return n.weapon && n.speed < 2 ? 'aim' : 'walk';
      default: return n.speed > 0.3 ? 'walk' : 'idle';
    }
  }

  private syncDriver(n: Npc) {
    const v = n.vehicle!;
    n.x = v.x; n.y = v.y; n.z = v.z;
    n.hum.animate(0.016, 0, 'drive');
    n.group.visible = v.detail === 'near';
    n.hum.root.visible = v.detail === 'near';
    if (n.group.parent !== this.group) { /* keep */ }
  }

  // Core state machine ------------------------------------------------
  private think(n: Npc, dt: number, distToPlayer: number) {
    const g = this.g;
    n.stateT -= dt; n.fear = Math.max(0, n.fear - dt * 0.04); n.alert = Math.max(0, n.alert - dt * 0.05);
    n.knocked = Math.max(0, n.knocked - dt); n.stunned = Math.max(0, n.stunned - dt);
    // dead / knocked
    if (n.dead) {
      n.corpseT += dt; n.vx *= 0.9; n.vz *= 0.9;
      n.hum.animate(dt, 0, 'fallen'); n.group.visible = n.corpseT < 90 && distToPlayer < 150;
      if (n.corpseT > 90 && !n.tag) this.release(n);
      this.groundNpc(n, dt);
      return;
    }
    if (n.knocked > 0) { n.hum.animate(dt, 0, 'fallen'); this.groundNpc(n, dt); n.vx *= 0.9; n.vz *= 0.9; n.x += n.vx * dt; n.z += n.vz * dt; if (n.knocked <= dt) { n.state = 'flee'; n.stateT = 8; n.fear = 1; } return; }
    if (n.stunned > 0) { n.hum.animate(dt, 0, 'handsup'); return; }
    if (n.brain) { n.brain(n, dt); this.groundNpc(n, dt); return; }

    // perception: recognition of recent crime by the player
    if (n.faction === 'civ' && distToPlayer < 22 && n.state !== 'flee' && n.state !== 'phone' && g.player.mode !== 'dead') {
      const m = n.recall('crime', g.time, 160);
      if (m && this.canSee(n, g.player)) { n.fear = Math.max(n.fear, 0.7); n.state = 'flee'; n.stateT = 8; n.userData.fleeFrom = { x: g.player.x, z: g.player.z }; if (this.rng.chance(0.4)) this.say(n, 'That’s the one who…!', 2.5); }
      // armed player scares civilians
      if (g.player.aiming && g.player.currentWeapon.kind === 'ranged' && distToPlayer < 14 && this.canSee(n, g.player) && n.state !== 'handsup' && n.state !== 'flee') {
        n.state = n.userData.courage < 0.7 ? 'handsup' : 'flee'; n.stateT = 4; n.fear = 0.8; n.userData.fleeFrom = { x: g.player.x, z: g.player.z };
        if (n.userData.reporter && !n.userData.called) { n.userData.called = true; this.startCall(n, 'weapon'); }
      }
    }
    switch (n.state) {
      case 'walk': this.stWalk(n, dt); break;
      case 'wander': this.stWander(n, dt); break;
      case 'idle': this.stIdle(n, dt); break;
      case 'chat': this.stChat(n, dt); break;
      case 'flee': this.stFlee(n, dt); break;
      case 'handsup': this.stHandsUp(n, dt); break;
      case 'phone': this.stPhone(n, dt); break;
      case 'watch': this.stWatch(n, dt); break;
      case 'visit': this.stVisit(n, dt); break;
      case 'inside': if (n.stateT <= 0) { n.state = 'walk'; n.group.visible = true; const p = n.userData.dest; if (p) { n.x = p.x; n.z = p.z + 0.5; } n.userData.dest = null; n.userData.walk = undefined; } break;
      case 'talk': n.hum.animate(dt, 0, 'idle'); if (n.stateT <= 0) { n.state = 'walk'; } break;
      case 'sunbathe': n.hum.animate(dt, 0, 'fallen'); if (n.stateT <= 0 || g.player.mode === 'foot' && Math.hypot(g.player.x - n.x, g.player.z - n.z) < 2.2 && g.player.sprinting) n.state = 'wander'; break;
      case 'combat': break; // handled by owning faction brains
      default: n.state = 'walk';
    }
    if (n.state === 'walk' || n.state === 'wander' || n.state === 'flee' || n.state === 'visit') {
      this.groundNpc(n, dt);
      // gentle separation
      if (n.simLevel === 0) this.separate(n, dt);
    }
  }

  private groundNpc(n: Npc, dt: number) {
    const g = this.g;
    if (n.simLevel === 0) {
      const res = g.col.resolveCircle(n.x, n.z, 0.3, n.y, 1.7, 0.4);
      if (res.hit) { n.x = res.x; n.z = res.z; }
      const sup = g.col.supportY(n.x, n.z, 0.2, n.y + 0.5);
      n.y += (sup - n.y) * Math.min(1, dt * 14);
      if (n.y < sup) n.y = sup;
      // water: avoid
      if (L.groundY(n.x, n.z) < L.WATER_Y - 0.5 && !n.dead) { n.x -= n.vx * dt * 2; n.z -= n.vz * dt * 2; n.state = 'wander'; n.stateT = 2; }
    } else n.y = Math.max(L.groundY(n.x, n.z), 0);
  }

  private separate(n: Npc, dt: number) {
    this.grid.query(n.x, n.z, 1.0, this.tmp);
    for (const o of this.tmp) {
      if (o === n || o.dead) continue;
      const dx = n.x - o.x, dz = n.z - o.z, d = Math.hypot(dx, dz);
      if (d < 0.7 && d > 0.001) { const k = (0.7 - d) * 2; n.x += (dx / d) * k * dt; n.z += (dz / d) * k * dt; }
    }
  }

  private moveToward(n: Npc, tx: number, tz: number, speed: number, dt: number, turn = 9) {
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz) || 1;
    const want = Math.atan2(dx, dz);
    n.yaw = dampAngle(n.yaw, want, turn, dt);
    const sp = speed * clamp(1 - Math.abs(wrapAngle(want - n.yaw)) * 0.5, 0.3, 1);
    n.vx += (Math.sin(n.yaw) * sp - n.vx) * Math.min(1, dt * 8); n.vz += (Math.cos(n.yaw) * sp - n.vz) * Math.min(1, dt * 8);
    n.x += n.vx * dt; n.z += n.vz * dt;
    n.hum.animate(dt, Math.hypot(n.vx, n.vz), 'walk');
    return d;
  }
  private stop(n: Npc, dt: number, pose: Pose = 'idle') { n.vx *= Math.exp(-8 * dt); n.vz *= Math.exp(-8 * dt); n.hum.animate(dt, Math.hypot(n.vx, n.vz), pose); }

  private stWalk(n: Npc, dt: number) {
    const g = this.g;
    let w = n.userData.walk;
    if (!w) {
      // acquire nearest lattice edge
      const i = Math.round((n.x + L.HALF) / L.CELL), j = Math.round((n.z + L.HALF) / L.CELL);
      const dirs = [0, 1, 2, 3].filter((d) => L.nodeExists(i, j) && edgeOpen(i, j, d));
      if (!dirs.length) { n.state = 'wander'; n.stateT = 6; return; }
      let best = dirs[0], bs = -9;
      for (const d of dirs) { const s = Math.sin(n.yaw) * DX[d] + Math.cos(n.yaw) * DZ[d]; if (s > bs) { bs = s; best = d; } }
      const ti = i + DX[best], tj = j + DZ[best];
      const side = this.sideOf(n, i, j, best);
      w = n.userData.walk = { fi: i, fj: j, ti, tj, dir: best, side, next: best };
      this.pickNext(n, w);
    }
    const axisX = w.dir % 2 === 0;
    const hwRoad = axisX ? L.lineHalfWidth('z', w.tj) : L.lineHalfWidth('x', w.ti);
    const off = hwRoad + L.SIDEWALK * 0.5;
    const tx = L.lineCoord(w.ti) + (-DZ[w.dir]) * w.side * off, tz = L.lineCoord(w.tj) + DX[w.dir] * w.side * off;
    const dist = (tx - n.x) * DX[w.dir] + (tz - n.z) * DZ[w.dir];
    const hwCross = axisX ? L.lineHalfWidth('x', w.ti) : L.lineHalfWidth('z', w.tj);
    // crossing safety
    if (dist > hwCross - 0.2 && dist < hwCross + 2.2 && w.next !== (w.dir + (w.side > 0 ? 3 : 1)) % 4) {
      if (!this.crossSafe(w.ti, w.tj, axisX) && !n.userData.jaywalker) { this.stop(n, dt); n.userData.waitT = (n.userData.waitT ?? 0) + dt; if (n.userData.waitT > 25) n.userData.jaywalker = true; return; }
    }
    n.userData.waitT = 0;
    let aimX = tx, aimZ = tz;
    // cut to next corner when close
    if (dist < hwCross + 0.6) {
      const nd = w.next, naxisX = nd % 2 === 0;
      const nhw = naxisX ? L.lineHalfWidth('z', w.tj) : L.lineHalfWidth('x', w.ti), noff = nhw + L.SIDEWALK * 0.5;
      const nside = w.side;
      aimX = L.lineCoord(w.ti) + (-DZ[nd]) * nside * noff + DX[nd] * (hwCross + 1.5); aimZ = L.lineCoord(w.tj) + DX[nd] * nside * noff + DZ[nd] * (hwCross + 1.5);
    }
    const speed = n.userData.hurry ? n.speedRun * 0.6 : n.speedWalk * (n.userData.style === 'worker' ? 1.1 : 1);
    this.moveToward(n, aimX, aimZ, speed, dt);
    // reached node
    if (dist < 0.8 || Math.hypot(aimX - n.x, aimZ - n.z) < 0.7 && dist < hwCross + 0.7) {
      if (w.next !== w.dir || dist < 0.8) { w.fi = w.ti; w.fj = w.tj; w.dir = w.next; w.ti = w.fi + DX[w.dir]; w.tj = w.fj + DZ[w.dir]; if (!L.nodeExists(w.ti, w.tj)) { w.dir = (w.dir + 2) % 4; w.ti = w.fi + DX[w.dir]; w.tj = w.fj + DZ[w.dir]; } this.pickNext(n, w); }
      // reached destination door?
      const dest = n.userData.dest;
      if (dest && Math.hypot(dest.x - n.x, dest.z - n.z) < 14) { n.state = 'visit'; }
    }
    // random behaviours
    if (n.stateT <= 0) {
      n.stateT = this.rng.range(8, 25);
      const r = this.rng.next();
      if (r < 0.06) { n.state = 'phone'; n.stateT = this.rng.range(4, 9); n.userData.phoneNormal = true; }
      else if (r < 0.1) { n.state = 'idle'; n.stateT = this.rng.range(3, 10); }
    }
  }

  private sideOf(n: Npc, i: number, j: number, dir: number) {
    const lx = n.x - L.lineCoord(i), lz = n.z - L.lineCoord(j);
    const r = lx * (-DZ[dir]) + lz * DX[dir];
    return r >= 0 ? 1 : -1;
  }

  private pickNext(n: Npc, w: any) {
    const i = w.ti, j = w.tj, dir = w.dir;
    const dest = n.userData.dest;
    const opts: [number, number][] = [];
    for (const d of [dir, (dir + 1) % 4, (dir + 3) % 4]) {
      if (!edgeOpen(i, j, d) || !L.nodeExists(i + DX[d], j + DZ[d])) continue;
      let wgt = d === dir ? 0.55 : 0.225;
      if (dest) { const ax = L.lineCoord(i + DX[d]), az = L.lineCoord(j + DZ[d]); const dn = Math.hypot(dest.x - ax, dest.z - az), d0 = Math.hypot(dest.x - L.lineCoord(i), dest.z - L.lineCoord(j)); wgt = dn < d0 ? 3 : 0.05; }
      opts.push([d, wgt]);
    }
    if (!opts.length) { w.next = (dir + 2) % 4; return; }
    let tot = 0; for (const o of opts) tot += o[1];
    let r = this.rng.next() * tot, pick = opts[0][0];
    for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
    w.next = pick;
  }

  private crossSafe(i: number, j: number, myAxisX: boolean) {
    const g = this.g;
    if (g.traffic.hasLight(i, j)) {
      const s = g.traffic.signal(i, j, !myAxisX);   // signal for the traffic I am crossing
      return s === 0;
    }
    // no signal: check for fast vehicles near the crossing
    const x = L.lineCoord(i), z = L.lineCoord(j);
    g.vehicles.grid.query(x, z, 16, this.tmpV);
    for (const v of this.tmpV) if (v.speed > 2.5) return false;
    return true;
  }

  private stWander(n: Npc, dt: number) {
    const ud = n.userData;
    if (!ud.wp || Math.hypot(ud.wp.x - n.x, ud.wp.z - n.z) < 0.8 || n.stateT <= 0) {
      if (n.stateT <= 0) { n.state = this.rng.chance(0.5) ? 'idle' : 'walk'; n.stateT = this.rng.range(4, 14); ud.walk = undefined; ud.wp = null; return; }
      const a = this.rng.range(0, 6.28), r = this.rng.range(3, 12);
      let wx = n.x + Math.cos(a) * r, wz = n.z + Math.sin(a) * r;
      if (L.isWater(wx, wz) || L.onRoad(wx, wz)) { wx = n.x; wz = n.z; }
      ud.wp = { x: wx, z: wz };
    }
    this.moveToward(n, ud.wp.x, ud.wp.z, n.speedWalk * 0.9, dt);
  }

  private stIdle(n: Npc, dt: number) {
    this.stop(n, dt);
    // look at player if close
    const p = this.g.player;
    const d = Math.hypot(p.x - n.x, p.z - n.z);
    if (d < 6) n.yaw = dampAngle(n.yaw, Math.atan2(p.x - n.x, p.z - n.z), 2, dt);
    if (n.stateT <= 0) { n.state = 'walk'; n.stateT = this.rng.range(8, 25); n.userData.walk = undefined; }
  }

  private stChat(n: Npc, dt: number) {
    this.stop(n, dt);
    const m = n.talkPartner;
    if (!m || m.dead || m.state !== 'chat') { n.state = 'walk'; n.userData.walk = undefined; return; }
    n.yaw = dampAngle(n.yaw, Math.atan2(m.x - n.x, m.z - n.z), 4, dt);
    // gesture
    n.hum.armR.rotation.x = -0.6 + Math.sin(this.g.time * 3 + n.id) * 0.4; n.hum.foreR.rotation.x = -0.8;
    n.hum.head.rotation.x = Math.sin(this.g.time * 5 + n.id) * 0.05;
    n.talkT -= dt;
    const d = Math.hypot(this.g.player.x - n.x, this.g.player.z - n.z);
    if (n.talkT <= 0 && d < 20 && n.id < m.id) {
      n.talkT = this.rng.range(4, 8);
      const g = this.g;
      const pool = g.env.rainLevel > 0.3 ? RAIN_CHAT : g.env.night > 0.6 ? NIGHT_CHAT : CHAT;
      this.say(this.rng.chance(0.5) ? n : m, this.rng.pick(pool), 3.5);
    }
    if (n.stateT <= 0) { n.state = 'walk'; m.state = 'walk'; n.userData.walk = undefined; m.userData.walk = undefined; n.talkPartner = null; m.talkPartner = null; }
  }

  private stFlee(n: Npc, dt: number) {
    const f = n.userData.fleeFrom ?? { x: this.g.player.x, z: this.g.player.z };
    let dx = n.x - f.x, dz = n.z - f.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    // sprint away, slight jitter, prefer sidewalk (avoid road: just go)
    const ang = Math.atan2(dx, dz) + Math.sin(this.g.time * 0.7 + n.id) * 0.4;
    const tx = n.x + Math.sin(ang) * 10, tz = n.z + Math.cos(ang) * 10;
    this.moveToward(n, tx, tz, n.speedRun, dt, 14);
    n.hum.animate(dt, Math.hypot(n.vx, n.vz), 'walk');
    if (n.userData.reporter && !n.userData.called && n.fear > 0.6 && this.rng.chance(dt * 0.3)) { n.userData.called = true; this.startCall(n, 'panic'); }
    if (n.stateT <= 0 && d > 25) { n.state = 'walk'; n.userData.walk = undefined; n.userData.called = false; }
  }

  private stHandsUp(n: Npc, dt: number) {
    this.stop(n, dt, 'handsup');
    const c = n.userData.cowerFrom ?? { x: this.g.player.x, z: this.g.player.z };
    n.yaw = dampAngle(n.yaw, Math.atan2(c.x - n.x, c.z - n.z), 6, dt);
    if (n.stateT <= 0) { n.state = 'flee'; n.stateT = 10; n.userData.fleeFrom = c; }
  }

  private stWatch(n: Npc, dt: number) {
    this.stop(n, dt);
    const w = n.userData.watch; if (w) n.yaw = dampAngle(n.yaw, Math.atan2(w.x - n.x, w.z - n.z), 4, dt);
    if (n.stateT <= 0) { n.state = 'walk'; n.userData.walk = undefined; }
  }

  private startCall(n: Npc, why: string) {
    n.state = 'phone'; n.stateT = this.rng.range(3.5, 6); n.userData.callWhy = why;
  }
  private stPhone(n: Npc, dt: number) {
    this.stop(n, dt, 'phone');
    if (n.userData.callWhy && n.stateT <= 0.1 && !n.userData.callDone) {
      n.userData.callDone = true;
      const g = this.g, w = n.userData.callWhy;
      // The call goes through if the witness survived
      g.police.callIn(n, w);
    }
    if (n.stateT <= 0) { n.userData.callDone = false; n.userData.callWhy = null; if (n.userData.phoneNormal) { n.state = 'walk'; n.userData.phoneNormal = false; } else { n.state = 'flee'; n.stateT = 10; n.userData.fleeFrom = { x: this.g.player.x, z: this.g.player.z }; } n.userData.walk = undefined; }
  }

  private stVisit(n: Npc, dt: number) {
    const p = n.userData.dest;
    if (!p) { n.state = 'walk'; return; }
    const d = this.moveToward(n, p.x, p.z, n.speedWalk * 1.1, dt);
    if (d < 1.5) {
      if (!this.g.economy.isOpen(p)) { n.userData.dest = null; n.state = 'walk'; n.userData.walk = undefined; return; }
      n.state = 'inside'; n.stateT = this.rng.range(25, 70); n.group.visible = false; p.visitors = (p.visitors ?? 0) + 1;
    }
  }

  // ------------------------------------------------------------ vehicles hurting pedestrians
  private vehicleHits(dt: number) {
    const g = this.g;
    for (const v of g.vehicles.list) {
      if (v.detail !== 'near' && v.detail !== 'far') continue;
      if (v.speed < 1.2) continue;
      this.grid.query(v.x, v.z, v.def.len * 0.5 + 2.5, this.tmp);
      const s = Math.sin(v.yaw), c = Math.cos(v.yaw);
      for (const n of this.tmp) {
        if (n.dead && n.corpseT > 2 || n.vehicle) continue;
        const dx = n.x - v.x, dz = n.z - v.z;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        const hw = v.def.wid / 2 + 0.3, hl = v.def.len / 2 + 0.3;
        // dodge: pedestrians step away from fast cars about to hit
        if (n.simLevel === 0 && n.faction === 'civ' && v.speed > 5 && lz > 0 && Math.abs(lx) < hw + 1.4 && lz < v.speed * 0.9 + 4 && n.state !== 'flee') {
          n.state = 'flee'; n.stateT = 4; n.fear = 0.8; n.userData.fleeFrom = { x: v.x, z: v.z }; if (this.rng.chance(0.3)) this.say(n, this.rng.pick(BARKS_ANGRY), 1.6);
          if (v === g.player.vehicle) n.userData.anger = true;
        }
        if (Math.abs(lx) < hw && Math.abs(lz) < hl && Math.abs(n.y - v.y) < 1.8) {
          const imp = v.speed;
          const dmg = imp * imp * 0.9;
          const dirx = v.worldVx / (v.speed || 1), dirz = v.worldVz / (v.speed || 1);
          const wasDead = n.dead;
          n.hurt(dmg, 'vehicle', v.driver?.kind === 'player' ? g.player : v, dirx, dirz, g.time);
          n.vx += dirx * imp * 0.8; n.vz += dirz * imp * 0.8; n.vy = imp * 0.2;
          if (!n.dead && imp > 4) { n.knocked = Math.max(n.knocked, 3 + imp * 0.2); n.userData.knockedOut = true; }
          if (!wasDead) { g.audio.thud(); g.fx.dust(n.x, n.y + 0.5, n.z, 3); }
          v.vLong *= 0.97;
          if (v.driver?.kind === 'player' && imp > 2) { g.police.reportCrime(n.dead ? 'vehicular' : 'hitrun', n.x, n.z, n.dead ? 1.5 : 0.9, { victim: n }); n.fear = 1; g.player.stats.crimes++; if (n.dead) g.player.stats.kills++; }
          else if (v.driver?.kind === 'npc') { /* traffic accident: witnesses react */ this.alarmed(null, n.x, n.z, 'crash'); }
          g.bus.emit('npcRunOver', { npc: n, v });
        }
      }
    }
  }
}

// ----------------------------------------------------------------------------------------------
/** Light-weight ambient wildlife (birds, gulls, crabs, cats) — pooled and distance limited. */
class Wildlife {
  private birds: { m: THREE.Group; wL: THREE.Mesh; wR: THREE.Mesh; x: number; y: number; z: number; a: number; r: number; cx: number; cz: number; spd: number; kind: 'gull' | 'bird'; phase: number; ground: boolean; scare: number }[] = [];
  private critters: { m: THREE.Mesh; x: number; z: number; vx: number; vz: number; t: number; kind: string }[] = [];
  private group = new THREE.Group();
  private rng = new Rng(99);
  private t = 0;
  constructor(private g: Game) { g.env.scene.add(this.group); }

  private mkBird(gull: boolean) {
    const m = new THREE.Group();
    const col = gull ? 0xf4f4f4 : 0x4a3a2c;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.35), new THREE.MeshStandardMaterial({ color: col }));
    const wing = new THREE.BoxGeometry(0.5, 0.02, 0.18); wing.translate(0.25, 0, 0);
    const wL = new THREE.Mesh(wing, body.material), wR = new THREE.Mesh(wing.clone().scale(-1, 1, 1), body.material);
    m.add(body, wL, wR); this.group.add(m);
    return { m, wL, wR };
  }

  update(dt: number) {
    const g = this.g, q = g.quality.wildlife;
    this.t += dt;
    const px = g.player.x, pz = g.player.z;
    const day = g.env.night < 0.5;
    // birds
    while (this.birds.length < q && day && this.rng.chance(0.3)) {
      const ang = this.rng.range(0, 6.28), d = this.rng.range(30, 180);
      const x = px + Math.cos(ang) * d, z = pz + Math.sin(ang) * d;
      const dist = L.districtAt(x, z);
      const gull = dist === District.Beach || dist === District.Marina || dist === District.Ocean || dist === District.Island;
      if (!gull && dist !== District.Park && dist !== District.Rural && dist !== District.Suburb) break;
      const b = this.mkBird(gull);
      const cx = x, cz = z;
      this.birds.push({ ...b, x, y: this.rng.range(8, 30), z, a: this.rng.range(0, 6.28), r: this.rng.range(8, 30), cx, cz, spd: this.rng.range(0.4, 0.9), kind: gull ? 'gull' : 'bird', phase: this.rng.range(0, 6), ground: false, scare: 0 });
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i];
      const dp = Math.hypot(b.cx - px, b.cz - pz);
      if (dp > 260 || !day && b.y > 3) { this.group.remove(b.m); this.birds.splice(i, 1); continue; }
      b.phase += dt * (b.ground ? 0 : 14);
      const pd = Math.hypot(b.x - px, b.z - pz);
      if (b.ground) { if (pd < 4 || g.police.noiseRecent > 0) { b.ground = false; b.scare = 3; } b.m.position.set(b.x, Math.max(0, L.groundY(b.x, b.z)) + 0.1, b.z); b.wL.rotation.z = b.wR.rotation.z = -0.3; continue; }
      b.a += dt * b.spd; if (b.scare > 0) { b.scare -= dt; b.y += dt * 4; }
      const nx = b.cx + Math.cos(b.a) * b.r, nz = b.cz + Math.sin(b.a) * b.r;
      b.m.rotation.y = Math.atan2(nx - b.x, nz - b.z); b.x = nx; b.z = nz;
      if (b.kind === 'gull' && this.rng.chance(dt * 0.02) && b.scare <= 0 && L.groundY(b.x, b.z) > 0) { b.ground = true; }
      b.m.position.set(b.x, b.y + Math.sin(this.t + b.phase) * 0.8, b.z);
      b.wL.rotation.z = Math.sin(b.phase) * 0.7; b.wR.rotation.z = -Math.sin(b.phase) * 0.7;
      b.m.visible = pd < 160;
    }
    // ground critters (cats in alleys, crabs on beach)
    while (this.critters.length < Math.floor(q * 0.35) && this.rng.chance(0.2)) {
      const ang = this.rng.range(0, 6.28), d = this.rng.range(15, 90), x = px + Math.cos(ang) * d, z = pz + Math.sin(ang) * d;
      const dist = L.districtAt(x, z);
      let kind = '';
      if (dist === District.Beach && L.groundY(x, z) > 0) kind = 'crab'; else if ((dist === District.Poor || dist === District.Midtown) && !L.onRoad(x, z) && L.groundY(x, z) >= 0) kind = 'cat'; else if (dist === District.Suburb && !L.onRoad(x, z)) kind = this.rng.chance(0.5) ? 'cat' : 'dog'; else break;
      const size = kind === 'crab' ? [0.25, 0.1, 0.2] : kind === 'cat' ? [0.18, 0.25, 0.5] : [0.3, 0.5, 0.8];
      const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), new THREE.MeshStandardMaterial({ color: kind === 'crab' ? 0xd0502a : kind === 'cat' ? this.rng.pick([0x222222, 0xc08040, 0x888888]) : this.rng.pick([0x8a5a2a, 0xe8d8b8])}));
      m.position.set(x, Math.max(0, L.groundY(x, z)) + size[1] / 2, z); this.group.add(m);
      this.critters.push({ m, x, z, vx: 0, vz: 0, t: 0, kind });
    }
    for (let i = this.critters.length - 1; i >= 0; i--) {
      const c = this.critters[i];
      const pd = Math.hypot(c.x - px, c.z - pz);
      if (pd > 140) { this.group.remove(c.m); this.critters.splice(i, 1); continue; }
      c.t -= dt;
      const scared = pd < (c.kind === 'dog' ? 4 : 6) && (g.player.sprinting || g.police.noiseRecent > 0);
      if (scared) { const dx = c.x - px, dz = c.z - pz, d = Math.hypot(dx, dz) || 1; c.vx = (dx / d) * (c.kind === 'crab' ? 2.5 : 5); c.vz = (dz / d) * (c.kind === 'crab' ? 2.5 : 5); c.t = 1.2; }
      else if (c.t <= 0) { const a = this.rng.range(0, 6.28), s = this.rng.chance(0.5) ? 0 : (c.kind === 'dog' ? 1.4 : 0.8); c.vx = Math.cos(a) * s; c.vz = Math.sin(a) * s; c.t = this.rng.range(1, 4); }
      const nx = c.x + c.vx * dt, nz = c.z + c.vz * dt;
      if (!L.isWater(nx, nz) && !L.onRoad(nx, nz) && !g.col.resolveCircle(nx, nz, 0.2, 0, 0.3, 0.1).hit) { c.x = nx; c.z = nz; }
      if (c.vx || c.vz) c.m.rotation.y = Math.atan2(c.vx, c.vz);
      c.m.position.set(c.x, Math.max(0, L.groundY(c.x, c.z)) + (c.m.geometry as THREE.BoxGeometry).parameters.height / 2, c.z);
    }
  }
}
