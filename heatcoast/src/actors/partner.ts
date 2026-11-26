import * as THREE from 'three';
import type { Game } from '../game/game';
import { Actor } from './actor';
import { Look } from './humanoid';
import { clamp, dampAngle, rng } from '../core/math';
import { WEAPONS } from '../combat/weapons';

/** Duo banter — lines only make sense between these two. [speaker 0 = current player hero, 1 = partner] */
export const BANTER: Record<string, [0 | 1, string][][]> = {
  drive: [
    [[1, 'You know you drive like my abuela, right?'], [0, 'Your abuela did 90 on the turnpike.'], [1, '...Fair.']],
    [[1, 'Remember when we said one more job and we\'re out?'], [0, 'Which time?'], [1, 'Exactly.']],
    [[0, 'If this goes sideways, we meet at the motel.'], [1, 'It always goes sideways.'], [0, 'Then we always meet at the motel.']],
    [[1, 'Put on something good.'], [0, 'This IS good.'], [1, 'This is a crime. And I know crimes.']],
    [[0, 'You ever think about the Keys? Little bar, no cops?'], [1, 'Every night. Then I wake up in Bahía Verde.']],
    [[1, 'Light\'s red.'], [0, 'It\'s more of a suggestion.']],
    [[0, 'We\'re being followed?'], [1, 'Nah. That guy just really loves the same exits as us.']],
    [[1, 'When this is over I want a house. With a door that locks.'], [0, 'And a porch.'], [1, 'And no gators.'], [0, 'In Florida? Dream smaller.']],
  ],
  walk: [
    [[1, 'Hot as hell out here.'], [0, 'Welcome to paradise.']],
    [[1, 'Don\'t buy anything stupid.'], [0, 'Define stupid.']],
    [[1, 'People are staring.'], [0, 'Let them. We look good.']],
  ],
  combat: [[[1, 'Get down!']], [[1, 'I got your back!']], [[1, 'Reloading — cover me!']], [[1, 'Behind the car!']], [[1, 'That was close. Too close.']]],
  wanted: [[[1, 'Cops! Go, go, go!']], [[1, 'Lose them — I am NOT going back inside.']], [[1, 'Take the alley!']]],
  crash: [[[1, 'Eyes on the road!']], [[1, 'You hit a mailbox. AGAIN.']], [[1, 'I felt that in my teeth.']]],
};

/** The other half of the duo: follows, rides along, fights, banters. */
export class Partner extends Actor {
  kind = 'partner';
  heroId: 'rosa' | 'jace' = 'jace';
  downT = 0; banterT = 40; private lastLine = '';
  following = true;
  constructor(private g: Game, look: Look) { super(look, true); this.faction = 'partner'; this.hp = this.maxHp = 200; this.ai = { state: 'follow' }; }
  rebuild(look: Look) {
    this.group.remove(this.hum.root); this.hum.dispose();
    const tmp = new Actor(look, true); this.hum = tmp.hum; this.group.add(this.hum.root); this.look = look;
    const w = this.weapon; this.weapon = ''; this.equip(w || 'pistol');
  }

  update(dt: number) {
    const g = this.g, P = g.player;
    if (!this.following) { this.sync(dt); return; }
    if (this.dead) {
      this.downT += dt; this.sync(dt);
      if (this.downT > 45 && Math.hypot(this.x - P.x, this.z - P.z) > 60) this.revive(P.x + 3, P.z + 3);
      return;
    }
    this.fireCd -= dt; if (this.reloading > 0) { this.reloading -= dt; if (this.reloading <= 0) this.mag[this.weapon] = WEAPONS[this.weapon]?.mag ?? 0; }
    this.banterT -= dt;
    // riding along
    if (P.vehicle) {
      const v = P.vehicle;
      if (this.vehicle !== v) {
        if (this.vehicle) g.vehicles.unseat(this.vehicle, this.seat);
        const free = v.seats.findIndex((s, i) => i > 0 && !s);
        if (free < 0) { this.followOnFoot(dt); return; }
        const d = Math.hypot(v.x - this.x, v.z - this.z);
        if (d < 3.5 || d > 50) { g.vehicles.seat(v, this, free); } else if (v.speed < 1.5) { this.runTo(v.x, v.z, 5.5, dt); this.sync(dt); return; } else if (d > 30) { g.vehicles.seat(v, this, free); }
        else { this.followOnFoot(dt); return; }
      }
      this.hum.animate(dt, 0, 'passenger'); this.x = v.x; this.z = v.z; this.y = v.y;
      this.hum.lookAt = new THREE.Vector3(P.x + Math.sin(P.yaw) * 10, P.y + 1.3, P.z + Math.cos(P.yaw) * 10);
      if (Math.random() < dt * 0.5) this.hum.lookAt = null;
      // drive-by support when wanted
      const foe = this.findFoe(30);
      if (foe && this.fireCd <= 0 && (g.police.stars >= 2 || foe.faction !== 'cop')) { this.fireCd = 0.55 + rng.next() * 0.5; g.combat.actorShoot(this, new THREE.Vector3(foe.x, foe.y + 1.2, foe.z), 0.45); }
      if (this.banterT <= 0 && v.speed > 6) { this.banter(g.police.stars > 0 ? 'wanted' : 'drive'); this.banterT = 70 + rng.next() * 60; }
      return;
    }
    if (this.vehicle) { g.vehicles.unseat(this.vehicle, this.seat); }
    // combat on foot
    const foe = this.findFoe(38);
    if (foe) {
      this.aiming = true; this.pose = 'aim';
      const d = Math.hypot(foe.x - this.x, foe.z - this.z);
      this.yaw = dampAngle(this.yaw, Math.atan2(foe.x - this.x, foe.z - this.z), 10, dt);
      this.aimPitch = Math.atan2(foe.y + 1.2 - (this.y + 1.45), d);
      // stay near the player but spread out
      const ox = P.x + Math.cos(P.yaw) * 2.5, oz = P.z - Math.sin(P.yaw) * 2.5;
      if (Math.hypot(ox - this.x, oz - this.z) > 2) this.runTo(ox, oz, 2.6, dt, true); else { this.vx *= 0.8; this.vz *= 0.8; }
      if (this.fireCd <= 0 && this.reloading <= 0) {
        const w = WEAPONS[this.weapon]; this.fireCd = 1 / w.rate + 0.18 + rng.next() * 0.35;
        if ((this.mag[this.weapon] ?? 0) <= 0) { this.reloading = w.reload; this.hum.reloadT = w.reload; if (rng.chance(0.3)) this.say('Reloading — cover me!'); }
        else { this.mag[this.weapon]--; g.combat.actorShoot(this, new THREE.Vector3(foe.x, foe.y + 1.25, foe.z), 0.62); }
      }
      if (this.banterT <= 0) { this.banter('combat'); this.banterT = 12 + rng.next() * 10; }
      this.integrate(dt); this.sync(dt); return;
    }
    this.aiming = false;
    this.followOnFoot(dt);
  }
  private followOnFoot(dt: number) {
    const g = this.g, P = g.player;
    const d = Math.hypot(P.x - this.x, P.z - this.z);
    if (d > 120 && !g.isVisible(this.x, this.y + 1, this.z)) { const a = P.yaw + Math.PI + 0.6; this.placeAt(P.x + Math.sin(a) * 3, P.z + Math.cos(a) * 3, P.yaw); }
    const side = 1.6; const tx = P.x - Math.sin(P.yaw) * 1.4 + Math.cos(P.yaw) * side, tz = P.z - Math.cos(P.yaw) * 1.4 - Math.sin(P.yaw) * side;
    const dt2 = Math.hypot(tx - this.x, tz - this.z);
    if (dt2 > 1.2) this.runTo(tx, tz, clamp(dt2 * 1.2, 1.3, d > 10 ? 7 : P.speed + 1.2), dt);
    else { this.vx *= 0.85; this.vz *= 0.85; this.yaw = dampAngle(this.yaw, P.yaw, 3, dt); this.pose = 'idle'; }
    this.hum.lookAt = d < 6 ? new THREE.Vector3(P.x, P.y + 1.6, P.z) : null;
    if (this.banterT <= 0 && P.speed < 2 && d < 4) { this.banter('walk'); this.banterT = 90 + rng.next() * 80; }
    this.integrate(dt); this.sync(dt);
  }
  private runTo(x: number, z: number, sp: number, dt: number, aim = false) {
    const dx = x - this.x, dz = z - this.z, d = Math.hypot(dx, dz) || 1;
    if (!aim) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 9, dt);
    this.vx += (dx / d * sp - this.vx) * Math.min(1, dt * 6); this.vz += (dz / d * sp - this.vz) * Math.min(1, dt * 6);
    if (!aim) this.pose = 'walk';
  }
  findFoe(r: number): Actor | null {
    const g = this.g; let best: Actor | null = null, bd = r;
    for (const a of g.peds.list) {
      if (a.dead || a.vehicle) continue;
      const hostile = (a.faction === 'cop' && g.police.stars >= 2) || a.faction === 'enemy' || (a.faction === 'gang' && a.ai?.hostile);
      if (!hostile) continue; const d = Math.hypot(a.x - this.x, a.z - this.z);
      if (d < bd && g.lineOfSight(this.x, this.y + 1.5, this.z, a.x, a.y + 1.3, a.z)) { bd = d; best = a; }
    }
    return best;
  }
  banter(kind: string) {
    const set = BANTER[kind]; if (!set) return; let conv = rng.pick(set); if (conv[0][1] === this.lastLine && set.length > 1) conv = rng.pick(set); this.lastLine = conv[0][1];
    this.g.playConversation(conv.map(([who, text]) => ({ who: who === 1 ? 'partner' : 'player', text })));
  }
  say(text: string) { this.g.playConversation([{ who: 'partner', text }]); }
  revive(x: number, z: number) { this.dead = false; this.hp = this.maxHp; this.downT = 0; this.placeAt(x, z); this.g.hud.toast(`${this.name} is back`); }
}
