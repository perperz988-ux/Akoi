import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Vehicle } from '../vehicles/Vehicle';
import { TRAFFIC_MIX } from '../vehicles/VehicleDefs';
import * as L from '../world/CityLayout';
import { District } from '../world/CityLayout';
import { Npc } from '../actors/Npc';
import { Rng, clamp, wrapAngle, hash2 } from '../core/MathUtil';

/** Directions on the lattice: 0=+x,1=+z,2=-x,3=-z */
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
export const edgeOpen = (i: number, j: number, dir: number) => {
  switch (dir) {
    case 0: return L.hSegment(i, j);
    case 1: return L.vSegment(i, j);
    case 2: return L.hSegment(i - 1, j);
    default: return L.vSegment(i, j - 1);
  }
};
export const laneHalf = (axis: 'x' | 'z', idx: number) => L.lineHalfWidth(axis, idx);

export interface TrafficBrain { fromI: number; fromJ: number; toI: number; toJ: number; dir: number; speedLimit: number; stuckT: number; waitT: number; laneOff: number; turning: boolean; nextDir: number; bus: boolean; stopT: number; honkT: number; lastMoveT: number; }

export class Traffic {
  rng = new Rng(4242);
  private spawnT = 0;
  private cars: Vehicle[] = [];
  private mixTotal = TRAFFIC_MIX.reduce((s, m) => s + m[1], 0);
  private lightMeshes: THREE.Mesh[] = [];
  private lightGroup = new THREE.Group();
  private lightMat = [new THREE.MeshBasicMaterial({ color: 0xff2a1a }), new THREE.MeshBasicMaterial({ color: 0xffc21a }), new THREE.MeshBasicMaterial({ color: 0x20e060 })];
  parkedSpawned = new Set<number>();
  enabled = true;

  constructor(private g: Game) {
    g.env.scene.add(this.lightGroup);
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.2);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(geo, this.lightMat[2]); m.visible = false; this.lightGroup.add(m); this.lightMeshes.push(m); }
    g.world.onCellLoaded = (ci, cj) => this.spawnParked(ci, cj);
    g.world.onCellUnloaded = (ci, cj) => this.removeParked(ci, cj);
  }

  // ---------------------------------------------------------------- signals
  /** returns 0 red,1 yellow,2 green for travel along given axis ('x' = moving along x). */
  signal(i: number, j: number, axisX: boolean, t = this.g.time): number {
    const cyc = 26, ph = (t + (i * 5 + j * 3) % 13) % cyc;
    // phase 0-11 x green, 11-13 x yellow, 13-24 z green, 24-26 z yellow
    if (axisX) return ph < 11 ? 2 : ph < 13 ? 1 : 0;
    return ph >= 13 && ph < 24 ? 2 : ph >= 24 ? 1 : 0;
  }
  hasLight(i: number, j: number) { return L.hasTrafficLights(i, j); }

  private updateLightVisuals() {
    const px = this.g.player.x, pz = this.g.player.z;
    const ci = Math.round((px + L.HALF) / L.CELL), cj = Math.round((pz + L.HALF) / L.CELL);
    let n = 0;
    for (let di = -2; di <= 2; di++) for (let dj = -2; dj <= 2; dj++) {
      const i = ci + di, j = cj + dj;
      if (!L.nodeExists(i, j) || !this.hasLight(i, j)) continue;
      const x = L.lineCoord(i), z = L.lineCoord(j), hx = L.lineHalfWidth('x', i), hz = L.lineHalfWidth('z', j);
      const sx = this.signal(i, j, true), sz = this.signal(i, j, false);
      // poles at (-,-) face along x traffic (visible from -x side) & (+,+)
      const spots: [number, number, number][] = [[x - hx - 0.8, z - hz - 0.8, sx], [x + hx + 0.8, z + hz + 0.8, sx], [x + hx + 0.8, z - hz - 0.8, sz], [x - hx - 0.8, z + hz + 0.8, sz]];
      for (const [sx2, sz2, s] of spots) {
        if (n >= this.lightMeshes.length) break;
        const m = this.lightMeshes[n++]; m.visible = true; m.position.set(sx2, 5.0, sz2); m.material = this.lightMat[s];
      }
    }
    for (let k = n; k < this.lightMeshes.length; k++) this.lightMeshes[k].visible = false;
  }

  // ---------------------------------------------------------------- parked cars
  private spawnParked(ci: number, cj: number) {
    const key = ci * 64 + cj;
    if (this.parkedSpawned.has(key)) return;
    this.parkedSpawned.add(key);
    const d = L.cellDistrict(ci, cj);
    if (!L.isUrban(d) || d === District.Park) return;
    const rng = new Rng(key * 977 + 13);
    const dens = d === District.Poor ? 0.55 : d === District.Suburb ? 0.5 : d === District.Downtown ? 0.35 : d === District.Luxury ? 0.25 : d === District.Shopping ? 0.3 : 0.3;
    const X = L.lineCoord(ci), Z = L.lineCoord(cj);
    // curb parking along the vertical road at X (right side) and the horizontal road at Z
    for (let s = 0; s < 4; s++) {
      if (!rng.chance(dens)) continue;
      const vertical = s < 2;
      const t = rng.range(14, 84);
      let x: number, z: number, yaw: number;
      const side = s % 2 === 0 ? -1 : 1;
      if (vertical) {
        if (!L.vSegment(ci, cj)) continue;
        const hw = L.lineHalfWidth('x', ci); if (hw > 7) continue;
        x = X + side * (hw - 1.4); z = Z + t; yaw = side < 0 ? 0 : Math.PI;
      } else {
        if (!L.hSegment(ci, cj)) continue;
        const hw = L.lineHalfWidth('z', cj); if (hw > 7) continue;
        z = Z + side * (hw - 1.4); x = X + t; yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      if (L.isBridgeV(ci, cj) || L.isDirtRoad(x) && rng.chance(0.5)) continue;
      const ids = d === District.Luxury || d === District.Resort ? ['vexa_gt', 'kestrel_rs', 'marlin_s', 'volt_ev', 'ridgeback', 'avanti_lx', 'halcyon_zero'] : d === District.Poor ? ['comet', 'tern_200', 'stallion_ss', 'haul_150', 'dune_runner', 'avanti_lx'] : d === District.Industrial ? ['haul_150', 'delivery_van', 'box_truck', 'dune_runner'] : ['tern_200', 'avanti_lx', 'comet', 'mesa_x', 'ridgeback', 'haul_150', 'marlin_s', 'sparrow_600', 'mule_cruiser'];
      const id = rng.pick(ids);
      const v = this.g.vehicles.spawn(id, x, z, yaw + (rng.chance(0.03) ? Math.PI : 0), 'parked');
      v.locked = rng.chance(0.55); v.userData.civilian = true; v.userData.parkedCell = key; v.sleeping = true;
      v.lightsOn = false;
    }
  }
  private removeParked(ci: number, cj: number) {
    const key = ci * 64 + cj;
    this.parkedSpawned.delete(key);
    for (const v of [...this.g.vehicles.list]) if (v.userData.parkedCell === key && v.role === 'parked' && !v.driver) this.g.vehicles.remove(v);
  }

  // ---------------------------------------------------------------- spawning
  private density(x: number, z: number) {
    const d = L.districtAt(x, z);
    let k = d === District.Downtown ? 1.4 : d === District.Midtown || d === District.Shopping ? 1.1 : d === District.Resort ? 1.0 : d === District.Rural ? 0.35 : d === District.Industrial ? 0.7 : d === District.Suburb ? 0.6 : 0.8;
    const h = this.g.env.hour;
    k *= h >= 6 && h < 10 ? 1.3 : h >= 16 && h < 19 ? 1.4 : h >= 0 && h < 5 ? 0.35 : 1;
    return k;
  }

  private pickDef() {
    let r = this.rng.next() * this.mixTotal;
    for (const [id, w] of TRAFFIC_MIX) { r -= w; if (r <= 0) return id; }
    return 'tern_200';
  }

  private visibleToCamera(x: number, z: number) {
    const cam = this.g.cam.camera;
    const v = new THREE.Vector3(x, 1, z).project(cam);
    return v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
  }

  private trySpawn() {
    const g = this.g, px = g.player.x, pz = g.player.z;
    const R = g.quality.simRadius;
    const ang = this.rng.range(0, Math.PI * 2), dist = this.rng.range(Math.max(70, R * 0.45), R * 0.95);
    const x = px + Math.cos(ang) * dist, z = pz + Math.sin(ang) * dist;
    if (Math.abs(x) > L.HALF - 20 || Math.abs(z) > L.HALF - 20) return;
    if (this.rng.next() > this.density(x, z)) return;
    // snap to nearest lane
    const i = Math.round((x + L.HALF) / L.CELL), j = Math.round((z + L.HALF) / L.CELL);
    const dir = this.rng.int(0, 3);
    if (!L.nodeExists(i, j) || !edgeOpen(i, j, dir)) return;
    const nx = i + DX[dir], nj = j + DZ[dir];
    if (!L.nodeExists(nx, nj)) return;
    const axisX = dir % 2 === 0;
    const hw = axisX ? L.lineHalfWidth('z', j) : L.lineHalfWidth('x', i);
    const lane = hw * 0.5;
    const t = this.rng.range(0.15, 0.8);
    const bx = L.lineCoord(i) + DX[dir] * L.CELL * t, bz = L.lineCoord(j) + DZ[dir] * L.CELL * t;
    // right of travel = (-dz, dx)
    const rx = -DZ[dir], rz = DX[dir];
    const sx = bx + rx * lane * (axisX ? 1 : 1), sz = bz + rz * lane;
    if (L.isWater(sx, sz) && !L.onBridge(sx, sz)) return;
    if (this.visibleToCamera(sx, sz) && dist < 140) return;
    for (const v of g.vehicles.list) if (Math.hypot(v.x - sx, v.z - sz) < 14) return;
    const id = this.pickDef();
    const v = g.vehicles.spawn(id, sx, sz, Math.atan2(DX[dir], DZ[dir]), 'traffic');
    this.initBrain(v, i, j, nx, nj, dir, lane);
    v.vLong = 8;
    // driver
    const npc = g.peds.makeDriver(v);
    g.vehicles.seatNpc(v, npc, 0);
    v.userData.civilian = true;
    this.cars.push(v);
  }

  initBrain(v: Vehicle, fi: number, fj: number, ti: number, tj: number, dir: number, lane: number) {
    const hwy = dir % 2 === 0 ? L.isHighway('z', fj) : L.isHighway('x', fi);
    const d = L.districtAt(v.x, v.z);
    const base = hwy ? 24 : d === District.Downtown || d === District.Resort ? 11 : d === District.Suburb || d === District.Poor ? 10 : d === District.Rural ? 17 : 13.5;
    const b: TrafficBrain = { fromI: fi, fromJ: fj, toI: ti, toJ: tj, dir, speedLimit: base * this.rng.range(0.85, 1.12) * Math.min(1.1, v.def.topSpeed / 40), stuckT: 0, waitT: 0, laneOff: lane, turning: false, nextDir: dir, bus: v.def.cls === 'bus', stopT: 0, honkT: 0, lastMoveT: 0 };
    v.userData.brain = b;
    this.chooseNext(v, b);
  }

  private chooseNext(v: Vehicle, b: TrafficBrain) {
    const i = b.toI, j = b.toJ, dir = b.dir;
    const opts: [number, number][] = [];
    const L1 = (dir + 3) % 4, R1 = (dir + 1) % 4; // left/right turn (dir cycles +x,+z,-x,-z => +1 = left (ccw) in x-z plane?)
    const straight = edgeOpen(i, j, dir), left = edgeOpen(i, j, L1), right = edgeOpen(i, j, R1);
    // note: with x right and z "down" in plan view, dir+1 turns clockwise on screen; we only need consistency
    if (straight) opts.push([dir, 0.62]);
    if (left) opts.push([L1, 0.19]);
    if (right) opts.push([R1, 0.19]);
    if (!opts.length) { if (edgeOpen(i, j, (dir + 2) % 4)) opts.push([(dir + 2) % 4, 1]); else { b.nextDir = dir; return; } }
    let tot = 0; for (const o of opts) tot += o[1];
    let r = this.rng.next() * tot, pick = opts[0][0];
    for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }
    // dirt roads: avoid for non-offroad? fine
    b.nextDir = pick;
  }

  // ---------------------------------------------------------------- update
  update(dt: number) {
    const g = this.g;
    if (!this.enabled) return;
    this.updateLightVisuals();
    this.spawnT -= dt;
    const cap = g.quality.trafficCap;
    this.cars = this.cars.filter((v) => g.vehicles.list.includes(v) && v.role === 'traffic' && !!v.userData.brain);
    if (this.spawnT <= 0) { this.spawnT = 0.12; if (this.cars.length < cap * (g.env.night > 0.5 ? 0.7 : 1)) for (let k = 0; k < 2; k++) this.trySpawn(); }
    const px = g.player.x, pz = g.player.z, R = g.quality.simRadius + 60;
    for (const v of this.cars) {
      const dpl = Math.hypot(v.x - px, v.z - pz);
      if (dpl > R || (v.userData.brain as TrafficBrain).stuckT > 25 && !this.visibleToCamera(v.x, v.z)) { this.despawn(v); continue; }
      this.drive(v, dt);
    }
  }

  despawn(v: Vehicle) {
    const npc = v.driver?.kind === 'npc' ? (v.driver.ref as Npc) : null;
    if (npc) this.g.peds.release(npc);
    this.g.vehicles.remove(v);
  }

  /** Re-assign civilians who lost control (crash) to simple brake & honk, then resume after cooldown. */
  private drive(v: Vehicle, dt: number) {
    const g = this.g, b = v.userData.brain as TrafficBrain, c = v.ctrl;
    if (v.exploded || v.engineDead || v.burning) { c.throttle = 0; c.brake = 1; if (v.driver && v.driver.kind === 'npc') { const n = v.driver.ref as Npc; g.vehicles.ejectNpc(v, n, 0); n.fear = 1; n.state = 'flee'; n.stateT = 12; g.peds.alarmed(n, v.x, v.z, 'crash'); } return; }
    if (!v.driver) { c.throttle = 0; c.brake = 0.3; return; }
    if (v.driver.kind === 'npc') {
      const npc = v.driver.ref as Npc;
      if (npc.fear > 0.8 && (v.lastImpact > 4 || npc.userData.panic)) { b.speedLimit = Math.max(b.speedLimit, 17); }
    }
    // --- geometry along current edge
    const dx = DX[b.dir], dz = DZ[b.dir];
    const rx = -dz, rz = dx;
    const axisX = b.dir % 2 === 0;
    const hwRoad = axisX ? L.lineHalfWidth('z', b.toJ) : L.lineHalfWidth('x', b.toI);
    const lane = hwRoad * 0.5;
    const tx = L.lineCoord(b.toI), tz = L.lineCoord(b.toJ);
    const toNodeX = tx - v.x, toNodeZ = tz - v.z;
    const distToNode = toNodeX * dx + toNodeZ * dz; // signed along travel
    // lateral error relative to lane centre line through target node
    const laneX = tx + rx * lane, laneZ = tz + rz * lane;
    const lat = (v.x - laneX) * rx + (v.z - laneZ) * rz; // + => right of lane center
    // --- decide target point
    let targetX: number, targetZ: number;
    const look = clamp(6 + v.speed * 0.9, 7, 24);
    const hwNode = (axisX ? L.lineHalfWidth('x', b.toI) : L.lineHalfWidth('z', b.toJ));
    if (distToNode < hwNode + 2 && b.nextDir !== b.dir) {
      // in the turn: aim at the lane start of next edge
      const nd = b.nextDir, nx = DX[nd], nz = DZ[nd];
      const nAxisX = nd % 2 === 0;
      const nlane = (nAxisX ? L.lineHalfWidth('z', b.toJ) : L.lineHalfWidth('x', b.toI)) * 0.5;
      const nrx = -nz, nrz = nx;
      targetX = tx + nrx * nlane + nx * (hwNode + 5); targetZ = tz + nrz * nlane + nz * (hwNode + 5);
    } else if (distToNode < look && b.nextDir !== b.dir) {
      const nd = b.nextDir, nx = DX[nd], nz = DZ[nd];
      const nAxisX = nd % 2 === 0;
      const nlane = (nAxisX ? L.lineHalfWidth('z', b.toJ) : L.lineHalfWidth('x', b.toI)) * 0.5;
      targetX = tx + (-nz) * nlane + nx * 2; targetZ = tz + nx * nlane + nz * 2;
      // blend corner cut
      const k = clamp(1 - distToNode / look, 0, 1);
      const sx = laneX - dx * 1, sz = laneZ - dz * 1;
      targetX = sx + (targetX - sx) * k * 0.7; targetZ = sz + (targetZ - sz) * k * 0.7;
      if (distToNode < hwNode + 6) { targetX = tx + (-nz) * nlane + nx * (hwNode + 3); targetZ = tz + nx * nlane + nz * (hwNode + 3); }
    } else {
      const ahead = Math.min(look, Math.max(distToNode, 2));
      targetX = laneX - dx * (distToNode - ahead) + (b.nextDir === b.dir ? dx * 6 * (distToNode < look ? 1 : 0) : 0);
      targetZ = laneZ - dz * (distToNode - ahead) + (b.nextDir === b.dir ? dz * 6 * (distToNode < look ? 1 : 0) : 0);
      void lat;
    }
    // yield to emergency vehicles
    let yieldOff = 0, yieldSlow = false;
    for (const e of g.vehicles.list) {
      if (!e.sirenOn || e === v || e.detail === 'hidden') continue;
      const ex = e.x - v.x, ez = e.z - v.z, dd = Math.hypot(ex, ez);
      if (dd < 45 && (ex * v.fwdX + ez * v.fwdZ) < 5) { // behind us or beside
        const sameDir = e.fwdX * v.fwdX + e.fwdZ * v.fwdZ > 0.5;
        if (sameDir) { yieldSlow = true; yieldOff = 1.8; }
      }
    }
    if (yieldOff) { targetX += rx * yieldOff; targetZ += rz * yieldOff; }

    // --- steering (pure pursuit)
    const hx = targetX - v.x, hz = targetZ - v.z;
    const desiredYaw = Math.atan2(hx, hz);
    const err = wrapAngle(desiredYaw - v.yaw);
    c.steer = clamp(-err * 1.9, -1, 1) * (v.isBike ? 1 : 1);
    c.handbrake = false; c.nitro = false;

    // --- speed targeting
    let target = b.speedLimit;
    if (b.nextDir !== b.dir && distToNode < 38) target = Math.min(target, 6.5);
    if (Math.abs(err) > 0.5) target = Math.min(target, 5);
    if (yieldSlow) target = Math.min(target, 3);
    // signals
    if (distToNode > 0 && distToNode < 32 && this.hasLight(b.toI, b.toJ)) {
      const s = this.signal(b.toI, b.toJ, axisX);
      const stopDist = distToNode - hwNode - 1.5;
      const canStop = stopDist > Math.max(2, v.speed * v.speed / 14);
      if ((s === 0 || s === 1 && canStop) && stopDist > -1) { const lim = Math.sqrt(Math.max(0, 2 * 5 * Math.max(0, stopDist))); target = Math.min(target, lim); if (stopDist < 2) target = 0; }
    }
    // cars / pedestrians / player ahead
    const aheadDist = 6 + v.speed * 1.4;
    let gap = 999, gapSpeed = 0;
    const near: Vehicle[] = [];
    g.vehicles.grid.query(v.x + v.fwdX * aheadDist * 0.5, v.z + v.fwdZ * aheadDist * 0.5, aheadDist * 0.7 + 4, near);
    for (const o of near) {
      if (o === v || o.exploded) continue;
      const ox = o.x - v.x, oz = o.z - v.z;
      const along = ox * v.fwdX + oz * v.fwdZ, side = ox * rx + oz * rz;
      const sideLim = (v.def.wid + o.def.wid) / 2 + 0.5 + (o.isBike ? 0.2 : 0);
      if (along > 0 && along < aheadDist + o.def.len / 2 && Math.abs(side) < sideLim && Math.abs(o.y - v.y) < 2.5) {
        const gp = along - o.def.len / 2 - v.def.len / 2;
        if (gp < gap) { gap = gp; gapSpeed = o.worldVx * v.fwdX + o.worldVz * v.fwdZ; }
      }
    }
    const pg = g.peds.pedestrianAhead(v.x, v.z, v.fwdX, v.fwdZ, aheadDist + 3, v.def.wid / 2 + 0.8);
    if (pg < gap) { gap = pg; gapSpeed = 0; }
    if (gap < 999) {
      const safe = 3 + v.speed * 0.9;
      if (gap < safe) target = Math.min(target, Math.max(0, gapSpeed - (safe - gap) * 1.2));
      if (gap < 2.2) target = 0;
      if (gap < 4 && v.speed < 0.5) { b.honkT += dt; if (b.honkT > 2.5 && this.rng.chance(dt * 0.6)) { v.ctrl.horn = true; g.audio.horn(v); b.honkT = 0; } } else v.ctrl.horn = false;
    }
    // bus stops
    if (b.bus && distToNode < 5 && distToNode > 0 && (b.toI + b.toJ) % 3 === 0 && b.stopT <= 0) { b.stopT = 5; }
    if (b.stopT > 0) { b.stopT -= dt; if (b.stopT > 0) target = 0; }

    // --- throttle/brake
    const sp = v.vLong;
    const e = target - sp;
    if (e > 0.3) { c.throttle = clamp(e * 0.35, 0, 0.75); c.brake = 0; }
    else if (e < -0.5) { c.throttle = 0; c.brake = clamp(-e * 0.3, 0, 0.9); }
    else { c.throttle = 0.12; c.brake = 0; }
    if (target === 0 && sp < 0.5) { c.throttle = 0; c.brake = 0.6; }

    // --- arrival at node
    if (distToNode < 0.5 + (b.nextDir === b.dir ? 0 : hwNode * 0.4)) {
      b.fromI = b.toI; b.fromJ = b.toJ;
      const nd = b.nextDir;
      b.dir = nd; b.toI = b.fromI + DX[nd]; b.toJ = b.fromJ + DZ[nd];
      if (!L.nodeExists(b.toI, b.toJ)) { b.dir = (nd + 2) % 4; b.toI = b.fromI + DX[b.dir]; b.toJ = b.fromJ + DZ[b.dir]; }
      this.chooseNext(v, b);
    }
    // --- stuck handling
    if (v.speed < 0.6 && target > 3 && gap > 6) { b.stuckT += dt; } else b.stuckT = Math.max(0, b.stuckT - dt * 2);
    if (b.stuckT > 4 && b.stuckT < 6.5) { c.throttle = 0.6; c.brake = 0; c.steer = -c.steer; if (v.vLong < 0.5) { c.throttle = 0; c.brake = 0.8; } }
    if (b.stuckT > 6.5) { b.stuckT = 6.5 + (b.stuckT % 1); }
    // recover from being knocked off course: if far from lane re-seat by picking nearest edge
    if (Math.abs(lat) > 7 && v.speed < 4) this.reseat(v, b);
    // lights
    v.lightsOn = g.env.night > 0.4 || g.env.rainLevel > 0.4;
  }

  private reseat(v: Vehicle, b: TrafficBrain) {
    const i = Math.round((v.x + L.HALF) / L.CELL), j = Math.round((v.z + L.HALF) / L.CELL);
    for (let d = 0; d < 4; d++) {
      const dir = (Math.round(((Math.atan2(v.fwdX, v.fwdZ) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 2)) % 4 + 4 + d * 0) % 4;
      void dir;
    }
    const dirs = [0, 1, 2, 3].filter((d) => L.nodeExists(i, j) && edgeOpen(i, j, d));
    if (!dirs.length) { b.stuckT = 30; return; }
    let best = dirs[0], ba = 99;
    for (const d of dirs) { const a = Math.abs(wrapAngle(Math.atan2(DX[d], DZ[d]) - v.yaw)); if (a < ba) { ba = a; best = d; } }
    b.fromI = i; b.fromJ = j; b.dir = best; b.toI = i + DX[best]; b.toJ = j + DZ[best]; b.nextDir = best; this.chooseNext(v, b);
  }
}
void hash2;
