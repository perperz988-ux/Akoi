import type { Game } from '../game/game';
import { Actor } from '../actors/actor';
import { randomLook } from '../actors/humanoid';
import { NODES, EDGES, RNode, zoneAt, Zone, POIS, Poi, coastX, isWater, heightAt } from '../world/layout';
import { rng, clamp, dampAngle, wrapAngle } from '../core/math';

const FIRST = ['Maria', 'Luis', 'Ana', 'Carlos', 'Jess', 'Tyler', 'Destiny', 'Marcus', 'Yolanda', 'Brett', 'Keisha', 'Diego', 'Hannah', 'Ray', 'Nina', 'Omar', 'Tasha', 'Wade', 'Lupe', 'Chase'];
const LAST = ['Ortiz', 'Hale', 'Nguyen', 'Brooks', 'Silva', 'Reyes', 'Coleman', 'Pratt', 'Duval', 'Moreno', 'Booker', 'Tate'];
const CHATTER = ['Hot one today, huh?', 'You see that game last night?', 'Rent went up AGAIN.', 'I swear the traffic on Biscayne is getting worse.', 'My cousin got a boat. A BOAT.', 'Gator in the canal again, no joke.', 'Heard sirens all night.', 'Hurricane season, baby.', 'Is that a Furia RS? No way.', 'I need a vacation from this vacation.', 'Don\'t go near the port after dark.', 'You posted that on Pulse?'];
const SCARED = ['Oh my God!', 'Somebody call 911!', 'Don\'t shoot!', 'Run!', 'Please, I have kids!', 'Get away from me!'];
const ANGRY = ['Watch it!', 'Hey! You trying something?', 'Back off, man.', 'You want a problem?'];

/** Pedestrians with routines (stroll, jog, shop, commute, chat, phone), witnesses and crowd reactions. */
export class Peds {
  list: Actor[] = [];
  private spawnT = 0;
  constructor(private g: Game) {}
  addActor(a: Actor) { this.list.push(a); this.g.scene.add(a.group); return a; }
  remove(a: Actor) { const i = this.list.indexOf(a); if (i >= 0) this.list.splice(i, 1); a.group.removeFromParent(); a.dispose(); }

  spawnCivilian(x: number, z: number, style?: 'civ' | 'beach' | 'rich' | 'worker' | 'rural' | 'gang'): Actor {
    const zone = zoneAt(x, z);
    const st = style ?? (zone === Zone.Beach ? 'beach' : zone === Zone.Resort || zone === Zone.Downtown ? (rng.chance(0.4) ? 'rich' : 'civ') : zone === Zone.Industrial ? (rng.chance(0.5) ? 'worker' : 'civ') : zone === Zone.Rural || zone === Zone.Swamp || zone === Zone.Town ? 'rural' : 'civ');
    const a = new Actor(randomLook(() => rng.next(), st)); a.name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`; a.faction = st === 'gang' ? 'gang' : 'civ';
    a.hp = a.maxHp = 70; a.placeAt(x, z, rng.next() * 6.28);
    a.ai = { state: 'idle', t: 0, routine: this.pickRoutine(zone), cash: rng.int(5, 140), brave: rng.next(), fear: 0, target: null, walkSpeed: 1.2 + rng.next() * 0.5 };
    if (a.ai.routine === 'jog') a.ai.walkSpeed = 3.2;
    return this.addActor(a);
  }
  private pickRoutine(zone: Zone) {
    const h = this.g.env.hour;
    if (zone === Zone.Beach) return rng.pick(['stroll', 'stroll', 'sunbathe', 'jog', 'chat']);
    if (h > 5.5 && h < 9 && rng.chance(0.25)) return 'jog';
    return rng.pick(['stroll', 'stroll', 'stroll', 'shop', 'chat', 'phone', 'commute']);
  }

  update(dt: number) {
    const g = this.g, P = g.player;
    // spawn / despawn civilians near the player
    const zone = zoneAt(P.x, P.z), h = g.env.hour;
    const zf = ({ [Zone.Downtown]: 1.2, [Zone.Midtown]: 1, [Zone.Resort]: 1.1, [Zone.Beach]: 1.0, [Zone.Suburb]: 0.55, [Zone.Industrial]: 0.5, [Zone.Town]: 0.7, [Zone.Rural]: 0.12, [Zone.Swamp]: 0.1, [Zone.Airport]: 0.4, [Zone.Park]: 0.9, [Zone.Ocean]: 0 } as Record<number, number>)[zone] ?? 0.5;
    const tf = h < 5 ? 0.25 : h < 7 ? 0.6 : h > 22 ? 0.55 : 1;
    const want = g.interiorActive ? 0 : Math.round(g.q.peds * zf * tf * (g.env.rainAmt > 0.5 ? 0.5 : 1));
    const civs = this.list.filter((a) => a.faction === 'civ' && !a.vehicle && !a.ai.story);
    for (const a of civs) { const d = Math.hypot(a.x - P.x, a.z - P.z); if (d > 150 || (a.dead && a.deadT > 40) || (d > 90 && !g.isVisible(a.x, a.y + 1, a.z) && a.ai.state !== 'flee')) this.remove(a); }
    this.spawnT -= dt;
    if (this.spawnT <= 0 && civs.length < want) {
      this.spawnT = 0.15;
      if (zone === Zone.Beach || (Math.abs(P.x - coastX(P.z)) < 160 && rng.chance(0.5))) {
        const z = P.z + rng.range(-110, 110), x = coastX(z) - rng.range(8, 70);
        if (Math.hypot(x - P.x, z - P.z) > 35 && !isWater(x, z)) this.spawnCivilian(x, z, 'beach');
      } else {
        const n = this.randomNodeNear(P.x, P.z, 40, 130);
        if (n) { const sx = rng.chance(0.5) ? 1 : -1, sz = rng.chance(0.5) ? 1 : -1, o = n.hw + 1.6; const x = n.x + sx * o, z = n.z + sz * o; if (!g.isVisible(x, 1, z) || Math.hypot(x - P.x, z - P.z) > 70) { const a = this.spawnCivilian(x, z); a.ai.node = n.id; a.ai.sx = sx; a.ai.sz = sz; this.nextCorner(a); } }
        else if (zone === Zone.Rural || zone === Zone.Swamp) { /* sparse */ }
      }
    }
    // update brains
    for (const a of [...this.list]) {
      if (a.vehicle) { a.sync(dt); continue; }
      const d = Math.hypot(a.x - P.x, a.z - P.z);
      if (a.dead) { a.vx *= 0.9; a.vz *= 0.9; a.integrate(dt); a.sync(dt); continue; }
      if (a.knockT > 0) { a.vx *= 0.94; a.vz *= 0.94; a.integrate(dt); a.sync(dt); continue; }
      const far = d > 70;
      if (a.ai.brain) a.ai.brain(a, dt); else this.civBrain(a, dt);
      a.integrate(dt);
      if (!far || Math.random() < 0.3) a.sync(far ? dt * 3 : dt);
      a.group.visible = d < 160;
      a.hum.mesh.castShadow = d < 35 && g.q.shadows;
    }
  }

  randomNodeNear(x: number, z: number, r0: number, r1: number): RNode | null {
    for (let k = 0; k < 14; k++) { const a = rng.next() * Math.PI * 2, r = rng.range(r0, r1); const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; let best: RNode | null = null, bd = 60; for (const n of NODES) { if (!n.edges.some((e) => EDGES[e].sidewalk)) continue; const dd = Math.hypot(n.x - px, n.z - pz); if (dd < bd) { bd = dd; best = n; } } if (best) return best; }
    return null;
  }
  /** Sidewalk navigation: walk from corner to corner around blocks, occasionally crossing at intersections. */
  private nextCorner(a: Actor) {
    const n = NODES[a.ai.node]; if (!n) return;
    const moves: { node: number; sx: number; sz: number }[] = [];
    for (const id of n.edges) {
      const e = EDGES[id]; if (!e.sidewalk) continue; const o = NODES[e.a === n.id ? e.b : e.a];
      if (e.axis === 'x' && Math.sign(o.z - n.z) === a.ai.sz) moves.push({ node: o.id, sx: a.ai.sx, sz: -a.ai.sz }, { node: o.id, sx: a.ai.sx, sz: -a.ai.sz });
      if (e.axis === 'z' && Math.sign(o.x - n.x) === a.ai.sx) moves.push({ node: o.id, sx: -a.ai.sx, sz: a.ai.sz }, { node: o.id, sx: -a.ai.sx, sz: a.ai.sz });
    }
    if (n.light || rng.chance(0.15)) { moves.push({ node: n.id, sx: -a.ai.sx, sz: a.ai.sz }, { node: n.id, sx: a.ai.sx, sz: -a.ai.sz }); }
    const m = moves.length ? rng.pick(moves) : { node: n.id, sx: -a.ai.sx, sz: a.ai.sz };
    const nn = NODES[m.node], o = nn.hw + 1.6 + rng.range(-0.5, 0.8);
    a.ai.node = m.node; a.ai.sx = m.sx; a.ai.sz = m.sz; a.ai.target = { x: nn.x + m.sx * o, z: nn.z + m.sz * o }; a.ai.state = 'walk';
  }

  walkTo(a: Actor, tx: number, tz: number, speed: number, dt: number) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { a.vx *= 0.7; a.vz *= 0.7; return true; }
    const want = Math.atan2(dx, dz); const prev = a.yaw;
    a.yaw = dampAngle(a.yaw, want, 7, dt); a.turnRate = wrapAngle(a.yaw - prev) / Math.max(dt, 1e-3);
    const sp = Math.min(speed, d * 2);
    a.vx += (Math.sin(a.yaw) * sp - a.vx) * Math.min(1, dt * 6); a.vz += (Math.cos(a.yaw) * sp - a.vz) * Math.min(1, dt * 6);
    a.pose = 'walk'; return false;
  }
  stop(a: Actor, dt: number) { a.vx *= Math.max(0, 1 - dt * 8); a.vz *= Math.max(0, 1 - dt * 8); }

  private civBrain(a: Actor, dt: number) {
    const g = this.g, ai = a.ai, P = g.player;
    ai.t += dt; a.aiming = false;
    // fear decays; panic states
    ai.fear = Math.max(0, ai.fear - dt * 0.05);
    if (ai.state === 'flee') {
      const dx = a.x - ai.fx, dz = a.z - ai.fz, d = Math.hypot(dx, dz) || 1;
      this.walkTo(a, a.x + dx / d * 10, a.z + dz / d * 10, 5.2, dt);
      if (ai.t > 9 && d > 60) { ai.state = 'walk'; ai.t = 0; ai.target = null; }
      if (Math.random() < dt * 0.25) g.bubble(a, rng.pick(SCARED));
      return;
    }
    if (ai.state === 'cower') { this.stop(a, dt); a.pose = 'cower'; if (ai.t > 6 && !(P.aiming && Math.hypot(P.x - a.x, P.z - a.z) < 14)) { ai.state = 'flee'; ai.t = 0; ai.fx = P.x; ai.fz = P.z; } return; }
    if (ai.state === 'call') { this.stop(a, dt); a.pose = 'phone'; if (ai.t > 4) { g.police.report(ai.crime ?? 1, ai.cx, ai.cz, a); ai.state = 'flee'; ai.t = 0; ai.fx = ai.cx; ai.fz = ai.cz; } return; }
    if (ai.state === 'fight') {
      const tgt = ai.foe as Actor | null; if (!tgt || tgt.dead || ai.t > 14) { ai.state = 'walk'; ai.target = null; return; }
      const d = Math.hypot(tgt.x - a.x, tgt.z - a.z);
      if (d > 1.3) this.walkTo(a, tgt.x, tgt.z, 4.5, dt); else { this.stop(a, dt); a.yaw = dampAngle(a.yaw, Math.atan2(tgt.x - a.x, tgt.z - a.z), 10, dt); a.pose = 'idle'; a.fireCd -= dt; if (a.fireCd <= 0) { a.fireCd = 0.9 + rng.next() * 0.6; a.hum.punch(); setTimeout(() => { if (!a.dead && Math.hypot(tgt.x - a.x, tgt.z - a.z) < 1.6) { g.combat.damageActor(tgt, 9, a, 'melee'); g.audio.punch(); } }, 180); } }
      return;
    }
    // routines
    switch (ai.routine) {
      case 'phone': case 'sunbathe': {
        if (ai.t < 12 + (ai.routine === 'sunbathe' ? 40 : 0)) { this.stop(a, dt); a.pose = ai.routine === 'phone' ? 'phone' : 'idle'; if (ai.routine === 'sunbathe') a.pose = 'sit'; return; }
        ai.routine = 'stroll'; break;
      }
      case 'chat': {
        if (!ai.partner) { const o = this.list.find((b) => b !== a && b.faction === 'civ' && !b.vehicle && !b.dead && b.ai.routine === 'chat' && !b.ai.partner && Math.hypot(b.x - a.x, b.z - a.z) < 30); if (o) { ai.partner = o; o.ai.partner = a; } else { ai.routine = 'stroll'; break; } }
        const o = ai.partner as Actor; const d = Math.hypot(o.x - a.x, o.z - a.z);
        if (d > 1.6) { this.walkTo(a, o.x, o.z, 1.3, dt); return; }
        this.stop(a, dt); a.pose = 'idle'; a.yaw = dampAngle(a.yaw, Math.atan2(o.x - a.x, o.z - a.z), 5, dt);
        if (Math.random() < dt * 0.12) g.bubble(a, rng.pick(CHATTER)); a.hum.talk = Math.random() < 0.5 ? 0.2 : 0;
        if (ai.t > 30) { ai.routine = 'stroll'; ai.partner = null; } return;
      }
      case 'shop': case 'commute': {
        if (!ai.dest) { const open = POIS.filter((p) => g.isOpen(p) && Math.hypot(p.x - a.x, p.z - a.z) < 220 && p.kind !== 'airport'); if (open.length) ai.dest = rng.pick(open); else { ai.routine = 'stroll'; break; } }
        const p = ai.dest as Poi; if (this.walkTo(a, p.door.x, p.door.z, ai.walkSpeed, dt)) { // "go inside"
          if (Math.hypot(P.x - a.x, P.z - a.z) > 25 || !g.isVisible(a.x, a.y + 1, a.z)) { this.remove(a); return; }
          ai.routine = 'stroll'; ai.dest = null;
        }
        return;
      }
    }
    // stroll / jog along sidewalks (or wander on beach & countryside)
    if (!ai.target) { if (ai.node !== undefined) this.nextCorner(a); else { const r = rng.next() * 6.28; let tx = a.x + Math.cos(r) * 18, tz = a.z + Math.sin(r) * 18; if (zoneAt(a.x, a.z) === Zone.Beach) tx = Math.min(tx, coastX(tz) - 6); if (isWater(tx, tz) || Math.abs(heightAt(tx, tz) - heightAt(a.x, a.z)) > 3) { tx = a.x; tz = a.z; } ai.target = { x: tx, z: tz }; } }
    if (ai.target) {
      // wait at crossings when cars are near
      if (this.walkTo(a, ai.target.x, ai.target.z, ai.walkSpeed, dt)) { ai.target = null; if (rng.chance(0.08)) { ai.routine = rng.pick(['phone', 'chat', 'shop', 'stroll']); ai.t = 0; } }
    }
  }

  /** Crowd reaction to a loud crime (gunshots, explosions, crash) at x,z. */
  panic(x: number, z: number, radius: number, crime: number, culprit: Actor | null) {
    const g = this.g;
    for (const a of this.list) {
      if (a.dead || a.faction !== 'civ' || a.vehicle || a.ai.story) continue;
      const d = Math.hypot(a.x - x, a.z - z); if (d > radius) continue;
      const sees = d < radius * 0.6 && g.lineOfSight(a.x, a.y + 1.6, a.z, x, 1.4, z);
      a.ai.t = 0;
      if (sees && crime > 0 && !a.ai.called && a.ai.brave > 0.45 && Math.random() < 0.65) { a.ai.state = 'call'; a.ai.called = true; a.ai.crime = crime; a.ai.cx = x; a.ai.cz = z; g.bubble(a, 'I\'m calling the cops!'); }
      else if (culprit === g.player && g.player.aiming && d < 10 && a.ai.brave < 0.6) { a.ai.state = 'cower'; }
      else { a.ai.state = 'flee'; a.ai.fx = x; a.ai.fz = z; }
    }
  }
  /** Something bumped / insulted a civilian. */
  provoke(a: Actor, by: Actor) {
    if (a.faction !== 'civ' || a.dead) return;
    if (a.ai.brave > 0.7 && !a.look.female && rng.chance(0.7)) { a.ai.state = 'fight'; a.ai.foe = by; a.ai.t = 0; this.g.bubble(a, rng.pick(ANGRY)); }
    else { a.ai.state = 'flee'; a.ai.fx = by.x; a.ai.fz = by.z; a.ai.t = 0; this.g.bubble(a, rng.pick(SCARED)); }
  }
  nearest(x: number, z: number, r: number, f: (a: Actor) => boolean) { let b: Actor | null = null, bd = r; for (const a of this.list) { if (!f(a)) continue; const d = Math.hypot(a.x - x, a.z - z); if (d < bd) { bd = d; b = a; } } return b; }
  clamp = clamp;
}
