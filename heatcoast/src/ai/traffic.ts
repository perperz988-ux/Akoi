import * as THREE from 'three';
import type { Game } from '../game/game';
import { Vehicle } from '../vehicles/vehicle';
import { VDEFS, vdef } from '../vehicles/models';
import { EDGES, NODES, REdge, otherEnd, lightState, LANE_W, SPOTS, zoneAt, Zone } from '../world/layout';
import { rng, clamp, wrapAngle } from '../core/math';
import { Actor } from '../actors/actor';
import { randomLook } from '../actors/humanoid';

interface Lane { e: REdge; from: number; to: number; lane: number; s: number; turn: { p0: THREE.Vector3; p1: THREE.Vector3; p2: THREE.Vector3; t: number; len: number } | null; speed: number; next: { e: REdge; from: number; to: number; lane: number } | null; honkT: number; stuckT: number }

/** Lane-following traffic that obeys signals, keeps distance, yields to the player and spawns around them. */
export class Traffic {
  cars: Vehicle[] = [];
  private spawnT = 0;
  constructor(private g: Game) {}

  laneOffset(e: REdge, lane: number) { return (lane + 0.5) * LANE_W; }
  /** Position on a lane at arc s from `from` node. */
  lanePos(e: REdge, from: number, lane: number, s: number) {
    const A = NODES[from], B = NODES[otherEnd(e, from)];
    const dx = Math.sign(B.x - A.x), dz = Math.sign(B.z - A.z); // unit along travel
    const rx = -dz, rz = dx; // right side (drive on the right)
    const off = this.laneOffset(e, lane);
    return { x: A.x + dx * s - rx * off * -1, z: A.z + dz * s - rz * off * -1, yaw: Math.atan2(dx, dz), dx, dz, rx, rz };
  }

  spawnAt(e: REdge, from: number, s: number, defId?: string): Vehicle | null {
    const g = this.g;
    const zone = zoneAt(NODES[from].x, NODES[from].z);
    const pool = zone === Zone.Rural || zone === Zone.Swamp ? ['gator', 'gator', 'everglade', 'cortez', 'coastline', 'bolt'] : zone === Zone.Resort || zone === Zone.Downtown ? ['cortez', 'vento', 'everglade', 'bolt', 'cab', 'furia', 'ramrod', 'cortez'] : zone === Zone.Industrial ? ['coastline', 'gator', 'coastline', 'cortez', 'everglade'] : ['cortez', 'bolt', 'everglade', 'cab', 'ramrod', 'coastline', 'gator', 'vento'];
    const d = vdef(defId ?? rng.pick(pool));
    const lane = rng.int(0, e.lanes - 1);
    const p = this.lanePos(e, from, lane, s);
    // avoid overlap
    for (const c of g.vehicles.list) if (Math.hypot(c.x - p.x, c.z - p.z) < 12) return null;
    const v = g.vehicles.spawn(d.id, p.x, p.z, p.yaw, rng.pick(d.colors), 'traffic');
    const drv = new Actor(randomLook(() => rng.next(), zone === Zone.Rural ? 'rural' : 'civ')); drv.name = 'Driver';
    g.peds.addActor(drv); g.vehicles.seat(v, drv, 0);
    v.ai = { e, from, to: otherEnd(e, from), lane, s, turn: null, speed: 0, next: null, honkT: 0, stuckT: 0 } as Lane;
    v.lightsOn = g.env.night > 0.4 || g.env.rainAmt > 0.4;
    this.cars.push(v); return v;
  }

  update(dt: number) {
    const g = this.g, P = g.player;
    const want = Math.round(g.q.traffic * g.settings.trafficDensity * (g.env.hour > 1 && g.env.hour < 5.5 ? 0.45 : 1) * (g.interiorActive ? 0 : 1));
    this.cars = this.cars.filter((v) => g.vehicles.list.includes(v) && v.role === 'traffic' && v.ai);
    // despawn far / unseen
    for (const v of this.cars) {
      const d = Math.hypot(v.x - P.x, v.z - P.z);
      if (d > 330 || (d > 170 && !g.isVisible(v.x, v.y + 1, v.z))) { v.despawnT += dt; if (v.despawnT > 1.5) g.vehicles.remove(v); } else v.despawnT = 0;
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.cars.length < want) {
      this.spawnT = 0.25;
      for (let tries = 0; tries < 6; tries++) {
        const e = EDGES[rng.int(0, EDGES.length - 1)]; const A = NODES[e.a], B = NODES[e.b];
        const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, s = rng.next() * e.len, d = Math.hypot(mx - P.x, mz - P.z);
        if (d < 90 || d > 300 || e.len < 30) continue;
        const from = rng.chance(0.5) ? e.a : e.b; const pp = this.lanePos(e, from, 0, Math.max(A.hw + 6, Math.min(e.len - 20, s)));
        const dd = Math.hypot(pp.x - P.x, pp.z - P.z);
        if (dd < 90 || (dd < 200 && g.isVisible(pp.x, 1, pp.z))) continue;
        if (this.spawnAt(e, from, Math.max(NODES[from].hw + 6, Math.min(e.len - 20, s)))) break;
      }
    }
    for (const v of this.cars) this.drive(v, dt);
  }

  private pickNext(at: number, came: REdge): { e: REdge; from: number; to: number; lane: number } {
    const n = NODES[at]; const opts = n.edges.map((id) => EDGES[id]).filter((e) => e.id !== came.id && e.kind !== 'dirt' || n.edges.length === 1);
    const list = opts.length ? opts : [came];
    // prefer straight on
    const straight = list.find((e) => e.axis === came.axis);
    const e = straight && rng.chance(0.55) ? straight : rng.pick(list);
    return { e, from: at, to: otherEnd(e, at), lane: Math.min(e.lanes - 1, rng.int(0, e.lanes - 1)) };
  }

  private drive(v: Vehicle, dt: number) {
    const g = this.g, a = v.ai as Lane;
    if (v.physics || !v.driver || v.dead) return;
    const target = a.e.speed * (g.env.wet > 0.5 ? 0.85 : 1);
    // obstacles ahead: other cars, player, peds
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    let block = 99;
    for (const o of g.vehicles.list) {
      if (o === v) continue; const dx = o.x - v.x, dz = o.z - v.z; const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 40 && side < 2.4) block = Math.min(block, ahead - o.def.len * 0.5 - v.def.len * 0.5);
    }
    const P = g.player; if (!P.vehicle) { const dx = P.x - v.x, dz = P.z - v.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx); if (ahead > 0 && ahead < 18 && side < 1.8) { block = Math.min(block, ahead - v.def.len * 0.5 - 1); a.honkT -= dt; if (a.honkT <= 0) { a.honkT = 3 + rng.next() * 3; if (ahead < 9) g.audio.horn(true); } } }
    for (const n of g.peds.list) { if (n.vehicle || n.dead) continue; const dx = n.x - v.x, dz = n.z - v.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx); if (ahead > 0 && ahead < 12 && side < 1.6) block = Math.min(block, ahead - v.def.len * 0.5 - 1); }
    // red light at the end of this edge
    let stopAt = 99;
    if (!a.turn) {
      const toN = NODES[a.to]; const remain = a.e.len - a.s - toN.hw - 2.5;
      const st = lightState(toN, a.e.axis, g.time);
      if (toN.light && (st === 'r' || (st === 'y' && remain > 12))) stopAt = remain;
    }
    const gap = Math.min(block - 2.5, stopAt);
    const safeSpeed = gap < 99 ? Math.max(0, Math.sqrt(Math.max(0, gap) * 2 * 6)) : target;
    const desired = Math.min(target, safeSpeed);
    a.speed += clamp(desired - a.speed, -9 * dt, 3.2 * dt);
    if (a.speed < 0.2 && desired < 0.5) a.stuckT += dt; else a.stuckT = 0;
    const ds = a.speed * dt;
    if (!a.turn) {
      a.s += ds;
      const toN = NODES[a.to]; const end = a.e.len - toN.hw - 1;
      if (a.s >= end) {
        a.next = this.pickNext(a.to, a.e);
        const p0 = this.lanePos(a.e, a.from, a.lane, end); const p2 = this.lanePos(a.next.e, a.next.from, a.next.lane, NODES[a.next.from].hw + 1);
        // control point: intersection of the two lane lines
        const p1 = new THREE.Vector3(a.e.axis === 'x' ? p0.x : p2.x, 0, a.e.axis === 'x' ? p2.z : p0.z);
        if (a.e.axis === a.next.e.axis) p1.set((p0.x + p2.x) / 2, 0, (p0.z + p2.z) / 2);
        const P0 = new THREE.Vector3(p0.x, 0, p0.z), P2 = new THREE.Vector3(p2.x, 0, p2.z);
        a.turn = { p0: P0, p1, p2: P2, t: 0, len: P0.distanceTo(p1) + p1.distanceTo(P2) };
      } else { const p = this.lanePos(a.e, a.from, a.lane, a.s); v.kinematic(p.x, p.z, p.yaw, a.speed, dt); }
    }
    if (a.turn) {
      const t = a.turn; t.t = Math.min(1, t.t + ds / Math.max(1, t.len));
      const q = (k: number) => new THREE.Vector3().copy(t.p0).multiplyScalar((1 - k) ** 2).addScaledVector(t.p1, 2 * (1 - k) * k).addScaledVector(t.p2, k * k);
      const p = q(t.t), p2 = q(Math.min(1, t.t + 0.05));
      const yaw = p2.distanceTo(p) > 0.01 ? Math.atan2(p2.x - p.x, p2.z - p.z) : v.yaw;
      v.kinematic(p.x, p.z, v.yaw + wrapAngle(yaw - v.yaw), a.speed, dt);
      if (t.t >= 1 && a.next) { a.e = a.next.e; a.from = a.next.from; a.to = a.next.to; a.lane = a.next.lane; a.s = NODES[a.from].hw + 1; a.turn = null; }
    }
    v.braking = desired < a.speed - 0.5 || a.speed < 0.3 ? 1 : 0;
    v.lightsOn = g.env.night > 0.4 || g.env.rainAmt > 0.4;
  }

  /** Called when something hits a traffic car — it becomes a physics object (and the driver may flee or chase). */
  wake(v: Vehicle) { if (v.physics) return; v.physics = true; v.ai = { panic: rng.chance(0.4) ? 'flee' : 'stop', t: 0 }; }

  /** Parked cars on residential / midtown lots near the player. */
  parked: Vehicle[] = []; private parkedT = 0;
  updateParked(dt: number) {
    const g = this.g, P = g.player; this.parkedT -= dt; if (this.parkedT > 0) return; this.parkedT = 1;
    this.parked = this.parked.filter((v) => g.vehicles.list.includes(v) && v.role === 'parked');
    for (const v of this.parked) if (Math.hypot(v.x - P.x, v.z - P.z) > 260) g.vehicles.remove(v);
    if (this.parked.length > 14) return;
    for (const s of SPOTS) {
      if (s.kind !== 'parked') continue; const d = Math.hypot(s.x - P.x, s.z - P.z); if (d > 200 || d < 70) continue;
      if (this.parked.some((v) => Math.hypot(v.x - s.x, v.z - s.z) < 5)) continue;
      const d0 = rng.pick(VDEFS.filter((x) => !x.police && !x.taxi));
      const v = g.vehicles.spawn(d0.id, s.x, s.z, s.yaw ?? 0, rng.pick(d0.colors), 'parked'); v.locked = rng.chance(0.6); v.physics = true; this.parked.push(v);
      if (this.parked.length > 14) break;
    }
  }
}
