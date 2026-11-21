import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Npc } from '../actors/Npc';
import { Vehicle } from '../vehicles/Vehicle';
import * as L from '../world/CityLayout';
import { Rng, clamp, wrapAngle } from '../core/MathUtil';

interface Ev { id: string; kind: string; x: number; z: number; t: number; npcs: Npc[]; vehs: Vehicle[]; done: boolean; reward: number; label: string; state: string; ud: any }

/** Random street events that pop up around the player: crimes in progress, accidents, fires, gang fights. */
export class RandomEvents {
  events: Ev[] = [];
  private timer = 45;
  private rng = new Rng(9001);
  constructor(private g: Game) {}

  blips() { return this.events.filter((e) => !e.done).map((e) => ({ x: e.x, z: e.z, color: '#f472b6', label: e.label, kind: 'event', icon: '!', pulse: true })); }

  private tooClose(x: number, z: number) { return Math.hypot(x - this.g.player.x, z - this.g.player.z) < 60; }

  private findSpot(minD = 90, maxD = 200) {
    const g = this.g;
    for (let k = 0; k < 20; k++) {
      const a = this.rng.range(0, 6.28), d = this.rng.range(minD, maxD);
      const x = g.player.x + Math.cos(a) * d, z = g.player.z + Math.sin(a) * d;
      const i = Math.round((x + L.HALF) / L.CELL), j = Math.round((z + L.HALF) / L.CELL);
      if (!L.nodeExists(i, j) || !L.isUrban(L.districtAt(x, z)) || L.isWater(x, z)) continue;
      const sx = L.lineCoord(i), sz = L.lineCoord(j);
      if (L.isHighway('x', i) || L.isHighway('z', j)) continue;
      return { x: sx + 10, z: sz + 10, i, j };
    }
    return null;
  }

  update(dt: number) {
    const g = this.g;
    if (g.interiors.active || g.missions.active || g.police.wantedLevel > 0 || g.player.mode === 'dead') { return this.tick(dt); }
    this.timer -= dt;
    if (this.timer <= 0 && this.events.filter((e) => !e.done).length < 2) { this.timer = this.rng.range(70, 140); this.spawnRandom(); }
    this.tick(dt);
  }

  private spawnRandom() {
    const spot = this.findSpot(); if (!spot) return;
    const kinds = ['mugging', 'accident', 'shootout', 'fire', 'stranded', 'shoplifter'];
    const kind = this.rng.pick(kinds);
    const g = this.g, id = 'ev' + Math.floor(Math.random() * 1e6);
    const ev: Ev = { id, kind, x: spot.x, z: spot.z, t: 0, npcs: [], vehs: [], done: false, reward: 0, label: '', state: 'idle', ud: {} };
    const mk = (x: number, z: number, faction: 'civ' | 'rival' | 'gang' = 'civ', weapon?: string) => {
      const n = g.peds.makeCivilian(x, z, faction === 'civ' ? 'civ' : 'poor'); n.userData.keep = true; n.tag = 'ev:' + id;
      if (faction !== 'civ') { n.faction = faction; n.weapon = weapon ?? 'vigil9'; n.equip(n.weapon); n.health = n.maxHealth = 70; n.userData.style = 'gang'; n.brain = (nn, d) => g.missions.hostileBrain(nn, d); n.userData.hostile = false; }
      ev.npcs.push(n); return n;
    };
    switch (kind) {
      case 'mugging': {
        ev.label = 'Mugging in progress'; ev.reward = 400;
        const v = mk(ev.x, ev.z); v.state = 'handsup'; v.stateT = 999; v.brain = (n, d) => { n.hum.animate(d, 0, 'handsup'); n.syncMesh(d, 0); };
        const a = mk(ev.x + 1.4, ev.z, 'rival', 'vigil9'), b = mk(ev.x - 1.2, ev.z + 1, 'rival', 'vigil9');
        a.yaw = Math.atan2(v.x - a.x, v.z - a.z); b.yaw = Math.atan2(v.x - b.x, v.z - b.z);
        a.userData.patrol = b.userData.patrol = true; a.userData.homeYaw = a.yaw; b.userData.homeYaw = b.yaw; a.userData.sleepy = b.userData.sleepy = true;
        ev.ud = { victim: v, thugs: [a, b] }; break; }
      case 'accident': {
        ev.label = 'Car accident'; ev.reward = 0;
        const v1 = g.vehicles.spawn('tern_200', ev.x, ev.z, 0.5, 'parked'), v2 = g.vehicles.spawn('mesa_x', ev.x + 3, ev.z + 2, 2.2, 'parked');
        v1.health = v1.maxHealth * 0.3; v2.health = v2.maxHealth * 0.25; v1.userData.keepAlive = v2.userData.keepAlive = true; ev.vehs.push(v1, v2);
        for (let i = 0; i < 3; i++) { const n = mk(ev.x + 4 + i, ev.z - 3); n.state = 'watch'; n.stateT = 999; }
        const inj = mk(ev.x + 1, ev.z + 4); inj.knocked = 999; inj.state = 'knocked'; inj.userData.injured = true;
        g.fx.smoke(ev.x, 1, ev.z, 6, 0.1);
        ev.ud = { ambT: 20 }; break; }
      case 'shootout': {
        ev.label = 'Gang shootout'; ev.reward = 600;
        for (let i = 0; i < 3; i++) { const a = mk(ev.x - 8 + i * 2, ev.z, 'gang', 'rattler'); a.userData.hostile = false; a.userData.team = 0; }
        for (let i = 0; i < 3; i++) { const b = mk(ev.x + 8 - i * 2, ev.z + 3, 'rival', 'rattler'); b.userData.hostile = false; b.userData.team = 1; }
        ev.ud = { fightT: 0 }; break; }
      case 'fire': {
        ev.label = 'Vehicle fire'; ev.reward = 0;
        const v = g.vehicles.spawn('avanti_lx', ev.x, ev.z, 0, 'parked'); v.health = 0; v.burning = true; v.engineDead = true; v.userData.keepAlive = true; ev.vehs.push(v);
        for (let i = 0; i < 3; i++) { const n = mk(ev.x + 6 + i, ev.z + 4); n.state = 'watch'; n.stateT = 999; n.userData.watch = { x: ev.x, z: ev.z }; }
        ev.ud = { fireT: 25 }; break; }
      case 'stranded': {
        ev.label = 'Stranded motorist'; ev.reward = 250;
        const v = g.vehicles.spawn('comet', ev.x, ev.z, 1.0, 'parked'); v.health = v.maxHealth * 0.5; v.engineDead = true; v.userData.keepAlive = true; ev.vehs.push(v);
        const n = mk(ev.x + 2, ev.z); n.state = 'idle'; n.stateT = 9999; ev.ud = { who: n }; break; }
      case 'shoplifter': {
        ev.label = 'Thief on the run'; ev.reward = 500;
        const n = mk(ev.x, ev.z); n.userData.cash = 0; n.userData.thief = true; n.userData.carry = 500; n.state = 'flee'; n.stateT = 9999; n.userData.fleeFrom = { x: ev.x - 30, z: ev.z - 30 }; n.speedRun = 6.2;
        n.brain = (nn, d) => { nn.userData.run = (nn.userData.run ?? 0) + d; const ang = Math.atan2(nn.x - g.player.x, nn.z - g.player.z) + Math.sin(g.time * 0.5) * 0.5; const tx = nn.x + Math.sin(ang) * 10, tz = nn.z + Math.cos(ang) * 10; nn.yaw += wrapAngle(Math.atan2(tx - nn.x, tz - nn.z) - nn.yaw) * Math.min(1, d * 8); nn.vx = Math.sin(nn.yaw) * 6.2; nn.vz = Math.cos(nn.yaw) * 6.2; const r = g.col.resolveCircle(nn.x + nn.vx * d, nn.z + nn.vz * d, 0.3, nn.y, 1.6, 0.4); nn.x = r.hit ? r.x : nn.x + nn.vx * d; nn.z = r.hit ? r.z : nn.z + nn.vz * d; nn.y = Math.max(0, L.groundY(nn.x, nn.z)); nn.hum.animate(d, 6, 'walk'); nn.syncMesh(d, 0); };
        ev.ud = { thief: n }; g.hud?.toast('A thief is running through the district!'); break; }
    }
    g.hud?.toast(`⚠ ${ev.label}`);
    this.events.push(ev);
  }

  private tick(dt: number) {
    const g = this.g, p = g.player;
    for (const ev of this.events) {
      if (ev.done) continue;
      ev.t += dt;
      const d = Math.hypot(ev.x - p.x, ev.z - p.z);
      if (d > 420 && ev.t > 20 || ev.t > 420) { this.end(ev, false); continue; }
      switch (ev.kind) {
        case 'mugging': {
          const { victim, thugs } = ev.ud as { victim: Npc; thugs: Npc[] };
          if (victim.dead) { this.end(ev, false); break; }
          if (thugs.every((t) => t.dead || t.knocked > 0)) { victim.state = 'walk'; victim.brain = null; g.economy.addCash(ev.reward, 'Good samaritan'); g.hud?.toast('The victim thanks you'); g.economy.friends.hart = Math.min(100, g.economy.friends.hart + 1); this.end(ev, true); }
          // thugs notice player at range
          if (d < 24) for (const t of thugs) if (!t.userData.hostile && !t.dead) { t.userData.hostile = true; t.state = 'combat'; t.userData.sleepy = false; }
          break; }
        case 'accident': {
          ev.ud.ambT -= dt;
          if (ev.ud.ambT <= 0 && !ev.ud.amb && d < 400) { ev.ud.amb = true; g.emergency.dispatch('ambulance', ev.x, ev.z, ev.npcs.filter((n) => n.userData.injured)); }
          if (ev.t > 120 && !ev.ud.amb) this.end(ev, false);
          if (ev.t > 90 && ev.ud.amb && ev.ud.amb !== true) this.end(ev, false);
          break; }
        case 'shootout': {
          const arr = ev.npcs;
          for (const n of arr) { if (n.dead) continue; const foe = arr.find((o) => !o.dead && o.userData.team !== n.userData.team && Math.hypot(o.x - n.x, o.z - n.z) < 35); n.userData.skirmishTarget = foe; }
          ev.ud.fightT += dt;
          for (const n of arr) {
            if (n.dead || n.userData.hostile) continue; const foe = n.userData.skirmishTarget as Npc | undefined;
            if (foe && !foe.dead) { n.yaw = Math.atan2(foe.x - n.x, foe.z - n.z); n.fireCd -= dt; n.hum.animate(dt, 0, 'aim'); if (n.fireCd <= 0) { n.fireCd = 0.4 + Math.random() * 0.4; g.combat.npcFire(n, foe.x, foe.y + 1.2, foe.z, 0.35); if (foe.dead) g.peds.onNpcHurt(foe, n, 'bullet', false); } n.syncMesh(dt, 0); }
            else if (d < 40) { n.userData.hostile = true; n.state = 'combat'; }
          }
          if (d < 14) for (const n of arr) if (!n.dead) n.userData.hostile = true;
          const t0 = arr.filter((n) => !n.dead && n.userData.team === 0).length, t1 = arr.filter((n) => !n.dead && n.userData.team === 1).length;
          if (t0 === 0 || t1 === 0 || arr.every((n) => n.dead || n.userData.hostile) && arr.every((n) => n.dead)) { if (arr.filter((n) => !n.dead).length === 0 || ev.t > 90) { if (arr.every((n) => n.dead)) g.economy.addCash(ev.reward, 'Street justice'); this.end(ev, arr.every((n) => n.dead)); } }
          break; }
        case 'fire': {
          const v = ev.vehs[0]; if (!v || v.exploded) { this.end(ev, false); break; }
          ev.ud.fireT -= dt;
          if (ev.ud.fireT <= 0 && !ev.ud.fd) { ev.ud.fd = true; g.emergency.dispatch('fire', ev.x, ev.z, [], v); }
          if (v.exploded || !v.burning && ev.ud.fd) this.end(ev, false);
          break; }
        case 'stranded': {
          const n = ev.ud.who as Npc; if (n.dead) { this.end(ev, false); break; }
          if (d < 4 && p.inVehicle && p.vehicle!.speed < 4 && !ev.ud.ride) { g.hud?.setContext('Give a ride', () => { ev.ud.ride = true; g.vehicles.seatNpc(p.vehicle!, n, 1); const dst = g.pois.filter((q) => q.kind === 'hotel' || q.kind === 'restaurant')[Math.floor(Math.random() * 4)]; ev.ud.dest = dst; g.markers.setWaypoint(dst.x, dst.z); g.hud?.toast(`Drop them off at ${dst.name}`); }); }
          if (ev.ud.ride) { const dst = ev.ud.dest; if (Math.hypot(p.x - dst.x, p.z - dst.z) < 12 && p.vehicle && p.vehicle.speed < 5) { g.vehicles.ejectNpc(p.vehicle, n, 1); n.state = 'walk'; g.economy.addCash(ev.reward, 'Ride tip'); g.markers.clearWaypoint(); this.end(ev, true); } if (!p.inVehicle) { n.state = 'walk'; this.end(ev, false); } }
          break; }
        case 'shoplifter': {
          const n = ev.ud.thief as Npc;
          if (n.dead || n.knocked > 0) { if (!ev.ud.paid) { ev.ud.paid = true; if (n.lastDamager === p || n.hum) { g.economy.addCash(ev.reward, 'Stopped a thief'); g.hud?.toast('Thief caught — reward collected'); } } this.end(ev, true); break; }
          if (n.userData.run > 70) this.end(ev, false);
          break; }
      }
    }
    this.events = this.events.filter((e) => !e.done || e.t < 1e9 && false);
  }

  private end(ev: Ev, success: boolean) {
    ev.done = true;
    const g = this.g;
    for (const n of ev.npcs) { n.tag = null; n.userData.keep = false; if (!n.dead && n.faction !== 'civ') { n.brain = null; n.faction = 'civ'; n.state = 'flee'; n.stateT = 12; n.userData.fleeFrom = { x: g.player.x, z: g.player.z }; } else if (!n.dead) { n.brain = null; if (n.state === 'handsup' || n.state === 'knocked') n.state = 'walk'; } }
    for (const v of ev.vehs) v.userData.keepAlive = false;
    if (success) g.audio.checkpoint();
    this.events = this.events.filter((e) => e !== ev);
  }
}
void THREE; void clamp;
