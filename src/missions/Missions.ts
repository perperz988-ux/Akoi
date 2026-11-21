import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Npc } from '../actors/Npc';
import { Vehicle } from '../vehicles/Vehicle';
import * as L from '../world/CityLayout';
import { Blip } from '../world/Markers';
import { clamp, wrapAngle, Rng } from '../core/MathUtil';
import { edgeOpen } from '../ai/Traffic';

export type StepResult = void | 'next' | 'fail' | { fail: string };
export interface Run {
  g: Game; m: Mission; i: number; t: number; e: Record<string, any>; flags: Record<string, any>;
  obj: (text: string) => void; marker: (pts: { x: number; z: number; color?: number; radius?: number }[]) => void;
  sub: (who: string, text: string, ttl?: number) => void; fail: (why: string) => void;
}
export interface Step {
  text?: string; checkpoint?: boolean; skippable?: boolean;
  init?(r: Run): void; update?(r: Run, dt: number): StepResult; end?(r: Run): void;
  intensity?: boolean;
}
export interface Mission {
  id: string; title: string; giver: string; blurb: string; chapter: string; requires: string[]; reward: { cash: number; friend?: [string, number]; unlock?: string; vehicle?: string };
  start: { x: number; z: number }; build: (g: Game) => Step[]; side?: boolean; repeatable?: boolean; unlocksFriend?: string; icon?: string; failOnWanted?: boolean;
}

const poi = (g: Game, id: string) => g.poi(id);
const pt = (x: number, z: number) => ({ x, z });
const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// ------------------------------------------------------------------------------------------------ step builders
function cine(shots: { from: [number, number, number]; to: [number, number, number]; look: [number, number, number]; lookTo?: [number, number, number]; dur: number; lines: [string, string][] }[]): Step {
  return {
    skippable: true,
    init(r) {
      r.e.shot = 0; r.e.shotT = 0; r.g.player.mode === 'foot' && (r.e.prevMode = 'foot'); r.g.hud?.setLetterbox(true); r.g.input.moveX = r.g.input.moveY = 0;
      this.next!(r);
    },
    update(r, dt) {
      r.e.shotT += dt;
      const s = shots[r.e.shot];
      if (r.g.input.consume('skip') || r.g.hud?.skipRequested) { r.g.hud!.skipRequested = false; return 'next'; }
      if (r.e.shotT >= s.dur + 0.2) { r.e.shot++; r.e.shotT = 0; if (r.e.shot >= shots.length) return 'next'; this.next!(r); }
    },
    end(r) { r.g.cam.stopCine(); r.g.hud?.setLetterbox(false); r.g.hud?.subtitle('', ''); r.g.player.mode = r.g.player.mode === 'cutscene' ? 'foot' : r.g.player.mode; },
    next(r: Run) {
      const s = shots[r.e.shot]; const c = r.g.cam;
      const look = new THREE.Vector3(...s.look);
      // keep the virtual camera out of buildings: pull it toward the subject until the line of sight is clear
      const safe = (p: [number, number, number]) => { const v = new THREE.Vector3(...p); const d = v.clone().sub(look); const len = d.length(); d.normalize(); const hit = r.g.col.raycast(look.x, look.y, look.z, d.x, d.y, d.z, len, true); const k = Math.min(len, hit - 0.8); const out = look.clone().addScaledVector(d, Math.max(2.5, k)); out.y = Math.max(out.y, 1.2); return out; };
      c.playCine(safe(s.from), safe(s.to), look, s.dur, s.lookTo ? new THREE.Vector3(...s.lookTo) : undefined, 48);
      let delay = 0; for (const [who, line] of s.lines) { const d = delay; setTimeout(() => { if (r.m && r.g.missions.active?.mission === r.m) r.g.hud?.subtitle(who, line, Math.max(1.8, line.length * 0.055)); }, d * 1000); delay += Math.max(1.8, line.length * 0.055) + 0.2; }
      r.g.audio.missionStart();
    },
  } as Step & { next: (r: Run) => void };
}

/** Subtitle-only conversation while play continues (e.g. while driving). */
function chatter(lines: [string, string][], gap = 3.2): Step {
  return { init(r) { r.e.idx = 0; r.e.tt = 0.5; }, update(r, dt) { r.e.tt -= dt; if (r.e.tt <= 0) { const [w, l] = lines[r.e.idx++]; r.sub(w, l, Math.max(2.4, l.length * 0.06)); r.e.tt = gap + l.length * 0.04; if (r.e.idx >= lines.length) return 'next'; } } };
}

function go(text: string, target: (g: Game) => { x: number; z: number }, radius = 6, opts: { needVehicle?: boolean; vehicleKey?: string; foot?: boolean; checkpoint?: boolean; wanted0?: boolean } = {}): Step {
  return {
    text, checkpoint: opts.checkpoint,
    init(r) { const t = target(r.g); r.e.target = t; r.marker([{ x: t.x, z: t.z, color: 0xffd166, radius }]); r.g.markers.setWaypoint(t.x, t.z); },
    update(r) {
      const p = r.g.player, t = r.e.target;
      if (opts.vehicleKey) { const v = r.e[opts.vehicleKey] as Vehicle; if (v && !p.inVehicle) { r.obj('Get back in the vehicle'); r.marker([{ x: v.x, z: v.z, color: 0x4ade80, radius: 3 }]); return; } r.obj(text); r.marker([{ x: t.x, z: t.z, color: 0xffd166, radius }]); }
      if (opts.foot && p.inVehicle) return;
      if (opts.wanted0 && r.g.police.wantedLevel > 0) { r.obj('Lose the cops'); return; } else if (opts.wanted0) r.obj(text);
      const pos = opts.vehicleKey && r.e[opts.vehicleKey] ? r.e[opts.vehicleKey] : p;
      if (dist2(pos, t) < radius && (!opts.needVehicle || p.inVehicle) && (!opts.vehicleKey || p.vehicle === r.e[opts.vehicleKey])) return 'next';
    },
    end(r) { r.g.markers.clearWaypoint(); r.marker([]); },
  };
}

function getVehicle(text: string, key: string, defId: string, at: (g: Game) => { x: number; z: number; yaw?: number }, opts: { color?: number; locked?: boolean; keepHealth?: boolean; guards?: number } = {}): Step {
  return {
    text, checkpoint: true,
    init(r) {
      const a = at(r.g); const v = r.g.vehicles.spawn(defId, a.x, a.z, a.yaw ?? 0, 'mission', opts.color);
      v.userData.keepAlive = true; v.locked = !!opts.locked; v.missionId = r.m.id; v.userData.civilian = false; v.sleeping = false; r.e[key] = v; r.g.markers.setWaypoint(a.x, a.z);
      if (opts.guards) for (let i = 0; i < opts.guards; i++) { const n = r.g.missions.spawnHostile(r, a.x + 5 + i * 2, a.z + 4, 'guard', 'vigil9'); n.userData.hostile = false; }
    },
    update(r) { const v = r.e[key] as Vehicle; if (v.exploded) return { fail: 'The vehicle was destroyed.' }; r.marker([{ x: v.x, z: v.z, color: 0x4ade80, radius: 3 }]); if (r.g.player.vehicle === v) return 'next'; },
    end(r) { r.marker([]); r.g.markers.clearWaypoint(); },
  };
}

function killAll(text: string, key: string, spawns: (g: Game) => { x: number; z: number; weapon?: string; faction?: 'gang' | 'rival' | 'guard' | 'target'; hp?: number }[], opts: { alertAll?: boolean; intense?: boolean; vehicle?: string } = {}): Step {
  return {
    text, checkpoint: true, intensity: opts.intense !== false,
    init(r) {
      const list = spawns(r.g); r.e[key] = [];
      for (const s of list) { const n = r.g.missions.spawnHostile(r, s.x, s.z, s.faction ?? 'rival', s.weapon ?? 'rattler'); if (s.hp) n.health = n.maxHealth = s.hp; if (opts.alertAll) { n.alert = 1; n.userData.hostile = true; n.state = 'combat'; n.target = r.g.player; } r.e[key].push(n); }
    },
    update(r) {
      const arr = r.e[key] as Npc[]; const left = arr.filter((n) => !n.dead && n.knocked <= 0 && n.stunned <= 0 || n.stunned > 0 && !n.dead && false);
      const alive = arr.filter((n) => !n.dead && !(n.knocked > 0));
      void left;
      r.obj(`${text} (${alive.length} left)`);
      r.marker(alive.slice(0, 4).map((n) => ({ x: n.x, z: n.z, color: 0xff4d4d, radius: 1.2 })));
      if (alive.length === 0) return 'next';
    },
    end(r) { r.marker([]); },
  };
}

function wantedZero(text = 'Lose the cops'): Step {
  return { text, intensity: true, init(r) { r.marker([]); }, update(r) { if (r.g.police.wantedLevel === 0) return 'next'; r.obj(r.g.police.seen ? `${text} (they can see you)` : `${text} (hide until the stars fade)`); } };
}

function timed(inner: Step, seconds: number, label = 'Time'): Step {
  return {
    ...inner,
    init(r) { r.e['__tl' + r.i] = seconds; inner.init?.(r); },
    update(r, dt) { r.e['__tl' + r.i] -= dt; r.g.hud?.setTimer(label, r.e['__tl' + r.i]); if (r.e['__tl' + r.i] <= 0) return { fail: 'Out of time.' }; return inner.update?.(r, dt); },
    end(r) { r.g.hud?.setTimer('', 0); inner.end?.(r); },
  };
}

function holdAction(text: string, at: (g: Game) => { x: number; z: number }, seconds: number, onDone?: (r: Run) => void, radius = 2.4): Step {
  return {
    text, checkpoint: true,
    init(r) { const t = at(r.g); r.e.target = t; r.e.prog = 0; r.marker([{ x: t.x, z: t.z, color: 0x38bdf8, radius }]); r.g.markers.setWaypoint(t.x, t.z); },
    update(r, dt) {
      const p = r.g.player, t = r.e.target;
      if (p.inVehicle) { r.obj('Get out of the vehicle'); return; }
      r.obj(text);
      if (dist2(p, t) < radius) { r.g.hud?.setPrompt(`Hold to ${text.toLowerCase()}`); if (r.g.input.isHeld('enter') || r.g.input.isHeld('interact')) { r.e.prog += dt / seconds; r.g.hud?.setProgress(r.e.prog); } else r.e.prog = Math.max(0, r.e.prog - dt); if (r.e.prog >= 1) { onDone?.(r); return 'next'; } } else r.g.hud?.setProgress(0);
    },
    end(r) { r.g.hud?.setProgress(0); r.marker([]); r.g.markers.clearWaypoint(); },
  };
}

function stealthInfiltrate(text: string, guardsAt: (g: Game) => { x: number; z: number; yaw: number }[], goal: (g: Game) => { x: number; z: number }, radius = 3, mayFight = false): Step {
  return {
    text, checkpoint: true,
    init(r) {
      r.e.guards = guardsAt(r.g).map((s) => { const n = r.g.missions.spawnHostile(r, s.x, s.z, 'guard', 'vigil9'); n.yaw = s.yaw; n.userData.hostile = false; n.userData.sleepy = true; n.userData.homeYaw = s.yaw; n.userData.patrol = true; n.alert = 0; return n; });
      r.e.target = goal(r.g); r.e.detect = 0; r.marker([{ x: r.e.target.x, z: r.e.target.z, color: 0xffd166, radius }]); r.g.markers.setWaypoint(r.e.target.x, r.e.target.z);
    },
    update(r, dt) {
      const p = r.g.player; let seen = 0;
      for (const n of r.e.guards as Npc[]) {
        if (n.dead || n.knocked > 0 || n.stunned > 0) continue;
        const dx = p.x - n.x, dz = p.z - n.z, d = Math.hypot(dx, dz);
        const fov = Math.abs(wrapAngle(Math.atan2(dx, dz) - n.yaw)) < 1.0;
        const range = (p.crouch ? 9 : p.sprinting ? 28 : 18) * p.visibility * (r.g.env.night > 0.5 ? 0.85 : 1.1);
        const heard = d < p.noise * 0.45;
        if (((fov && d < range) || heard) && r.g.col.los(n.x, 1.6, n.z, p.x, p.y + 1.2, p.z)) seen = Math.max(seen, 1 - d / Math.max(range, 1));
      }
      r.e.detect = clamp(r.e.detect + (seen > 0 ? seen * dt * 1.8 + dt * 0.25 : -dt * 0.35), 0, 1);
      r.g.hud?.setDetection(r.e.detect);
      if (r.e.detect >= 1 && !r.e.alarm) {
        r.e.alarm = true; r.g.hud?.toast('You were spotted!');
        if (!mayFight) return { fail: 'You were spotted.' };
        for (const n of r.e.guards as Npc[]) { n.alert = 1; n.userData.hostile = true; n.state = 'combat'; n.target = r.g.player; }
      }
      const t = r.e.target;
      r.obj(r.e.alarm ? 'Take them out or reach the objective' : text);
      if (dist2(p, t) < radius) return 'next';
    },
    end(r) { r.g.hud?.setDetection(0); r.marker([]); r.g.markers.clearWaypoint(); },
  };
}

function followTarget(text: string, defId: string, route: (g: Game) => { x: number; z: number }[], opts: { minGap?: number; maxGap?: number; speed?: number } = {}): Step {
  const minGap = opts.minGap ?? 14, maxGap = opts.maxGap ?? 85;
  return {
    text, checkpoint: true,
    init(r) {
      const rt = route(r.g); r.e.route = rt; r.e.ri = 1; const a = rt[0], b = rt[1];
      const v = r.g.vehicles.spawn(defId, a.x, a.z, Math.atan2(b.x - a.x, b.z - a.z), 'mission'); v.userData.keepAlive = true; v.engineOn = true; v.missionId = r.m.id; r.e.tv = v;
      const d = r.g.peds.makeDriver(v); r.g.vehicles.seatNpc(v, d, 0); d.faction = 'target'; r.e.driver = d; r.e.lost = 0; r.e.close = 0;
    },
    update(r, dt) {
      const v = r.e.tv as Vehicle, p = r.g.player; const gap = dist2(v, p);
      if (v.exploded) return { fail: 'The target vehicle was destroyed.' };
      r.marker([{ x: v.x, z: v.z, color: 0xff4d4d, radius: 2.5 }]);
      const rt = r.e.route as { x: number; z: number }[];
      const tp = rt[r.e.ri];
      if (dist2(v, tp) < 14) { r.e.ri++; if (r.e.ri >= rt.length) { v.ctrl.throttle = 0; v.ctrl.brake = 1; return 'next'; } }
      const c = v.ctrl, tgt = rt[r.e.ri];
      const err = wrapAngle(Math.atan2(tgt.x - v.x, tgt.z - v.z) - v.yaw);
      c.steer = clamp(-err * 2, -1, 1);
      let sp = (opts.speed ?? 14) * (Math.abs(err) > 0.6 ? 0.45 : 1);
      if (gap > 55) sp *= 0.5;
      const e = sp - v.vLong; c.throttle = e > 0.5 ? clamp(e * 0.3, 0, 0.8) : 0; c.brake = e < -1 ? 0.5 : 0;
      v.lightsOn = r.g.env.night > 0.4;
      // detection rules
      if (gap > maxGap) { r.e.lost += dt; r.obj('Stay closer — you are losing them'); if (r.e.lost > 8) return { fail: 'You lost the target.' }; } else r.e.lost = Math.max(0, r.e.lost - dt);
      if (gap < minGap) { r.e.close += dt; r.obj('Back off — you are too close'); if (r.e.close > 7) return { fail: 'The target noticed you.' }; } else { r.e.close = Math.max(0, r.e.close - dt); if (gap >= minGap && gap <= maxGap) r.obj(text); }
      if (r.g.police.wantedLevel > 0) return { fail: 'Cops spooked the target.' };
    },
    end(r) { r.marker([]); },
  };
}

function race(title: string, cps: { x: number; z: number }[], laps: number, rivalDefs: string[], playerNeedsVehicle = true): Step {
  return {
    text: title, checkpoint: true, intensity: true,
    init(r) {
      r.e.cp = 0; r.e.lap = 0; r.e.finished = false; r.e.go = 3.5; r.e.rivals = [] as { v: Vehicle; cp: number; lap: number; skill: number; done: boolean }[];
      const a = cps[cps.length - 1], b = cps[0]; const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      rivalDefs.forEach((id, i) => { const off = (i + 1) * 5 * (i % 2 ? 1 : -1); const v = r.g.vehicles.spawn(id, a.x + Math.cos(yaw) * off - Math.sin(yaw) * -(i * 4), a.z - Math.sin(yaw) * off - Math.cos(yaw) * -(i * 4) * 0, yaw, 'mission'); v.userData.keepAlive = true; v.engineOn = true; v.missionId = r.m.id; r.g.vehicles.seatNpc(v, r.g.peds.makeDriver(v), 0); r.e.rivals.push({ v, cp: 0, lap: 0, skill: 0.88 + i * 0.04, done: false }); });
      r.g.hud?.race(true);
    },
    update(r, dt) {
      const p = r.g.player, g = r.g;
      if (r.e.go > 0) { r.e.go -= dt; g.hud?.countdown(Math.ceil(r.e.go)); for (const rv of r.e.rivals) { rv.v.ctrl.throttle = 0; rv.v.ctrl.brake = 1; } if (r.e.go <= 0) g.hud?.countdown(0); r.marker([{ x: cps[0].x, z: cps[0].z, color: 0x38bdf8, radius: 8 }]); if (r.e.go > 0) return; }
      const total = cps.length * laps;
      const idx = r.e.lap * cps.length + r.e.cp;
      const cur = cps[r.e.cp], nxt = cps[(r.e.cp + 1) % cps.length];
      r.marker([{ x: cur.x, z: cur.z, color: 0x38bdf8, radius: 9 }, ...(idx + 1 < total ? [{ x: nxt.x, z: nxt.z, color: 0x7dd3fc, radius: 5 }] : [])]);
      const pos = p.vehicle ?? p;
      if (playerNeedsVehicle && !p.inVehicle) { r.obj('Get back in your car!'); r.e.offT = (r.e.offT ?? 0) + dt; if (r.e.offT > 12) return { fail: 'You abandoned the race.' }; } else { r.e.offT = 0; r.obj(`${title}  ·  checkpoint ${idx + 1}/${total}`); }
      if (dist2(pos, cur) < 11) { r.e.cp++; g.audio.checkpoint(); if (r.e.cp >= cps.length) { r.e.cp = 0; r.e.lap++; } if (r.e.lap >= laps) { r.e.finished = true; } }
      // rivals
      let ahead = 0;
      for (const rv of r.e.rivals) {
        if (rv.done) { rv.v.ctrl.throttle = 0; rv.v.ctrl.brake = 1; ahead++; continue; }
        const t = cps[rv.cp % cps.length]; const v = rv.v; const c = v.ctrl;
        const err = wrapAngle(Math.atan2(t.x - v.x, t.z - v.z) - v.yaw);
        c.steer = clamp(-err * 2.2, -1, 1);
        const top = v.def.topSpeed * rv.skill * (1 - Math.min(0.5, Math.abs(err) * 0.6)) * 0.85;
        const e = top - v.vLong; c.throttle = clamp(e * 0.3, 0, 1); c.brake = e < -3 ? 0.6 : 0; c.nitro = false;
        if (dist2(v, t) < 12) { rv.cp++; if (rv.cp >= cps.length * laps) { rv.done = true; } }
        if (rv.cp > idx || (rv.cp === idx && dist2(v, cur) < dist2(pos, cur))) ahead++;
      }
      g.hud?.raceInfo(ahead + 1, rivalDefs.length + 1, r.e.lap + 1, laps);
      // anti-stuck for rivals
      for (const rv of r.e.rivals) { if (rv.v.speed < 1 && r.e.go <= 0) { rv.stuck = (rv.stuck ?? 0) + dt; if (rv.stuck > 4) { const t = cps[(rv.cp + cps.length - 1) % cps.length]; rv.v.place(t.x, t.z, rv.v.yaw); rv.stuck = 0; } } else rv.stuck = 0; }
      if (r.e.finished) { r.e.place = ahead + 1; if (ahead >= 1) return { fail: `You finished ${ahead + 1}${['st', 'nd', 'rd'][ahead] ?? 'th'}. You need to win.` }; return 'next'; }
      if (g.police.wantedLevel > 0 && !g.police.disabled) { /* racing is street legal in this city */ }
    },
    end(r) { for (const rv of r.e.rivals) { if (rv.v.driver) { const n = rv.v.driver.ref as Npc; g_release(r, n); } rv.v.userData.keepAlive = false; rv.v.role = 'traffic'; rv.v.userData.brain = undefined; r.g.vehicles.remove(rv.v); } r.g.hud?.race(false); r.marker([]); },
  };
}
function g_release(r: Run, n: Npc) { r.g.peds.release(n); }

function deliverVehicle(text: string, key: string, at: (g: Game) => { x: number; z: number }, minHealth = 0.0, radius = 7): Step {
  return {
    text, checkpoint: true,
    init(r) { const t = at(r.g); r.e.target = t; r.marker([{ x: t.x, z: t.z, color: 0xffd166, radius }]); r.g.markers.setWaypoint(t.x, t.z); r.e.dealt = 0; },
    update(r, dt) {
      const v = r.e[key] as Vehicle, p = r.g.player; if (v.exploded) return { fail: 'The vehicle was destroyed.' };
      if (v.health < v.maxHealth * minHealth) return { fail: 'The vehicle was too damaged.' };
      if (!p.inVehicle || p.vehicle !== v) { r.obj('Get back in the vehicle'); r.marker([{ x: v.x, z: v.z, color: 0x4ade80, radius: 3 }]); return; }
      r.obj(text); const t = r.e.target; r.marker([{ x: t.x, z: t.z, color: 0xffd166, radius }]);
      if (dist2(v, t) < radius && v.speed < 6) { r.e.dealt += dt; if (r.e.dealt > 0.4) return 'next'; } else r.e.dealt = 0;
    },
    end(r) { r.marker([]); r.g.markers.clearWaypoint(); },
  };
}

function leaveVehicleAt(text: string, at: (g: Game) => { x: number; z: number }, key: string): Step {
  return { text, init(r) { const t = at(r.g); r.e.target = t; r.marker([{ x: t.x, z: t.z, color: 0xffd166, radius: 6 }]); }, update(r) { const v = r.e[key] as Vehicle; if (dist2(r.g.player, r.e.target) < 6 && !r.g.player.inVehicle) return 'next'; void v; }, end(r) { r.marker([]); } };
}

function collectClues(text: string, spots: { x: number; z: number; note: string }[]): Step {
  return {
    text, checkpoint: true,
    init(r) { r.e.found = new Set<number>(); r.g.markers.setObjectiveMarkers([]); },
    update(r) {
      const p = r.g.player, found = r.e.found as Set<number>;
      r.obj(`${text} (${found.size}/${spots.length})`);
      r.marker(spots.map((s, i) => ({ x: s.x, z: s.z, color: found.has(i) ? 0x4ade80 : 0xa78bfa, radius: 1.6 })).filter((_, i) => !found.has(i)));
      spots.forEach((s, i) => { if (found.has(i)) return; const d = dist2(p, s); if (d < 12) r.g.hud?.setPrompt('Examine clue'); if (d < 2.8 && (r.g.input.consume('enter') || r.g.input.consume('interact'))) { found.add(i); r.sub('Kit', s.note, 5); r.g.audio.checkpoint(); } });
      if (found.size === spots.length) return 'next';
    },
    end(r) { r.marker([]); },
  };
}

function escortNpc(text: string, key: string, from: (g: Game) => { x: number; z: number }, to: (g: Game) => { x: number; z: number }, name: string, attackers = 0): Step {
  return {
    text, checkpoint: true, intensity: true,
    init(r) {
      const a = from(r.g); const n = r.g.missions.spawnFriend(r, a.x, a.z, name); r.e[key] = n; r.e.target = to(r.g); r.e.boarded = false; r.e.atkSpawned = false; r.e.tgtAt = r.e.target;
      r.marker([{ x: a.x, z: a.z, color: 0x4ade80, radius: 2 }]); r.g.markers.setWaypoint(a.x, a.z);
    },
    update(r, dt) {
      const n = r.e[key] as Npc, p = r.g.player, g = r.g; if (n.dead) return { fail: `${name} was killed.` };
      if (!r.e.boarded) {
        r.obj(`Get ${name} into your vehicle`);
        if (p.inVehicle) {
          const v = p.vehicle!; r.marker([{ x: n.x, z: n.z, color: 0x4ade80, radius: 2 }]);
          if (dist2(v, n) < 6 && v.speed < 3) { g.vehicles.seatNpc(v, n, 1); r.e.boarded = true; n.userData.escort = true; r.sub(name, "Let's go, drive!", 3); const t = r.e.target; r.marker([{ x: t.x, z: t.z, color: 0xffd166, radius: 6 }]); g.markers.setWaypoint(t.x, t.z); }
        } else r.marker([{ x: n.x, z: n.z, color: 0x4ade80, radius: 2 }]);
        // npc follows nearby when on foot
        if (!p.inVehicle) { const dx = p.x - n.x, dz = p.z - n.z, d = Math.hypot(dx, dz); if (d > 3) { n.yaw = Math.atan2(dx, dz); n.x += Math.sin(n.yaw) * 4 * dt; n.z += Math.cos(n.yaw) * 4 * dt; n.hum.animate(dt, 4, 'walk'); } else n.hum.animate(dt, 0, 'idle'); n.syncMesh(dt, 0); }
        return;
      }
      const v = p.vehicle; if (!v) { r.obj('Get back in the vehicle'); return; }
      r.obj(text);
      const t = r.e.target; r.marker([{ x: t.x, z: t.z, color: 0xffd166, radius: 6 }]);
      if (attackers > 0 && !r.e.atkSpawned && dist2(p, t) < dist2(r.e.tgtAt, r.e.pstart ?? { x: n.x, z: n.z }) * 0.5 + 60) { r.e.atkSpawned = true; r.e.atk = []; for (let i = 0; i < attackers; i++) { const sp = g.missions.roadAhead(r, 120 + i * 18); const av = g.vehicles.spawn(['stallion_ss', 'tern_200', 'mesa_x'][i % 3], sp.x, sp.z, sp.yaw, 'gang', 0x6b1d1d); av.userData.keepAlive = true; av.engineOn = true; av.sirenOn = false; const d = g.missions.spawnHostile(r, 0, 0, 'rival', 'rattler'); g.vehicles.seatNpc(av, d, 0); const d2 = g.missions.spawnHostile(r, 0, 0, 'rival', 'rattler'); g.vehicles.seatNpc(av, d2, 1); d.userData.vehicleChaser = av; r.e.atk.push(av); } r.sub('Dispatch', 'Hostiles approaching your location!', 3); }
      if (r.e.atk) for (const av of r.e.atk as Vehicle[]) g.missions.chaseAI(r, av, v, dt);
      if (dist2(v, t) < 6.5 && v.speed < 5) { g.vehicles.ejectNpc(v, n, 1); n.state = 'idle'; return 'next'; }
      if (v.exploded) return { fail: 'Your vehicle was destroyed.' };
    },
    end(r) { r.marker([]); if (r.e.atk) for (const av of r.e.atk as Vehicle[]) { av.userData.keepAlive = false; } r.g.markers.clearWaypoint(); },
  };
}

const wait = (text: string, secs: number): Step => ({ text, init(r) { r.e.w = secs; }, update(r, dt) { r.e.w -= dt; r.obj(text); if (r.e.w <= 0) return 'next'; } });
const note = (fn: (r: Run) => void): Step => ({ init(r) { fn(r); }, update() { return 'next'; } });

// ================================================================================================
export class MissionSystem {
  missions: Mission[] = [];
  completed = new Set<string>();
  active: { mission: Mission; run: Run; steps: Step[]; idx: number; cp: { x: number; z: number; step: number; yaw: number; hasV: boolean } | null } | null = null;
  failedMsg = '';
  friendsUnlocked = new Set<string>();
  chapter = 0;
  dynamicSide: Mission | null = null;
  introSeen = false;
  private flags: Record<string, any> = {};
  best: Record<string, number> = {};
  tipsGiven = 0;
  private rng = new Rng(31337);
  sideRuns = 0;

  constructor(private g: Game) { this.missions = buildStory(g); }

  isFriendUnlocked(id: string) { return this.friendsUnlocked.has(id); }
  get activeId() { return this.active?.mission.id ?? null; }
  chapterName() { const c = [...this.completed].filter((id) => !id.startsWith('side_')).length; return c === 0 ? 'Prologue' : c >= 12 ? 'Epilogue' : `Chapter ${Math.ceil(c / 3)}: ${CHAPTER_NAMES[Math.min(3, Math.floor((c - 1) / 3))]}`; }

  available(): Mission[] {
    return this.missions.filter((m) => !this.completed.has(m.id) || m.repeatable).filter((m) => m.requires.every((r) => this.completed.has(r)));
  }
  startBlips(): Blip[] {
    if (this.active) return [];
    return this.available().map((m) => ({ x: m.start.x, z: m.start.z, color: m.side ? '#38bdf8' : '#ffd166', label: m.title, kind: m.side ? 'side' : 'mission', icon: m.side ? '$' : 'M', id: m.id, pulse: !m.side }));
  }
  availableSideTips(): Blip | null {
    const sides = this.available().filter((m) => m.side && !this.g.markers.tips.find((t) => t.id === m.id));
    if (!sides.length) return null; const m = sides[this.rng.int(0, sides.length - 1)];
    return { x: m.start.x, z: m.start.z, color: '#38bdf8', label: m.title, kind: 'side', icon: '$', id: m.id };
  }

  // ------------------------------------------------------------ starting & running
  start(id: string) {
    const g = this.g, m = this.missions.find((x) => x.id === id);
    if (!m || this.active) return;
    if (g.police.wantedLevel > 0 && !m.failOnWanted) { g.hud?.toast('Lose the cops first'); return; }
    const steps = m.build(g);
    const run: Run = {
      g, m, i: 0, t: 0, e: {}, flags: {},
      obj: (t) => g.hud?.setObjective(m.title, t), marker: (pts) => g.markers.setObjectiveMarkers(pts.map((p, i) => ({ x: p.x, z: p.z, color: p.color ?? 0xffd166, radius: p.radius ?? 5, id: String(i) }))),
      sub: (w, t, ttl = 4) => g.hud?.subtitle(w, t, ttl), fail: (why) => this.fail(why),
    };
    this.active = { mission: m, run, steps, idx: 0, cp: null };
    g.hud?.missionBanner(m.title, m.blurb);
    g.audio.missionStart();
    g.bus.emit('missionStart', m.id);
    this.beginStep(0);
  }

  private beginStep(idx: number) {
    const a = this.active!, g = this.g;
    a.idx = idx; a.run.i = idx; a.run.e = a.run.e ?? {};
    const step = a.steps[idx];
    if (step.checkpoint) { const p = g.player; a.cp = { x: p.x, z: p.z, step: idx, yaw: p.yaw, hasV: false }; if (idx > 0) { g.audio.checkpoint(); g.hud?.toast('Checkpoint', 1.1); } }
    g.hud?.setObjective(a.mission.title, step.text ?? '');
    g.hud?.setPrompt('');
    step.init?.(a.run);
  }

  private endStep() { const a = this.active; if (!a) return; a.steps[a.idx].end?.(a.run); }

  complete() {
    const a = this.active!, g = this.g, m = a.mission;
    this.endStep(); this.cleanup(a);
    this.completed.add(m.id);
    g.economy.addCash(m.reward.cash, 'Mission: ' + m.title);
    if (m.reward.friend) g.economy.adjustFriend(m.reward.friend[0], m.reward.friend[1]);
    if (m.unlocksFriend) { this.friendsUnlocked.add(m.unlocksFriend); g.hud?.toast(`${m.unlocksFriend.toUpperCase()} added to your contacts`); }
    g.player.stats.missions++;
    g.hud?.missionComplete(m.title, m.reward.cash, m.reward.unlock);
    g.audio.missionPass();
    g.bus.emit('missionComplete', m.id);
    g.hud?.setObjective('', ''); g.hud?.setTimer('', 0); g.markers.clearWaypoint(); g.markers.setObjectiveMarkers([]);
    this.active = null;
    if (!m.side) g.saves.save(g.saves.currentSlot).then(() => g.hud?.toast('Progress saved', 1.5));
  }

  fail(why: string) {
    const a = this.active; if (!a) return;
    const g = this.g;
    this.failedMsg = why;
    g.audio.missionFail();
    g.hud?.missionFailed(a.mission.title, why, () => this.retry(), () => this.abandon(true));
    a.run.e.__failed = true;
  }

  retry() {
    const a = this.active; if (!a) return;
    const g = this.g, cp = a.cp;
    this.endStep(); this.cleanupEntities(a.run);
    a.run.e = {};
    g.police.clearWanted();
    const p = g.player;
    if (p.mode === 'dead') { p.health = p.maxHealth; p.mode = 'foot'; }
    p.health = p.maxHealth; p.invuln = 3;
    if (p.vehicle) p.exitVehicle(true);
    if (cp) { p.teleport(cp.x, cp.z, cp.yaw); g.cam.snapBehind(cp.yaw); }
    g.hud?.showDeath(false); g.hud?.hideFade();
    this.beginStep(cp?.step ?? 0);
  }

  abandon(fromFail = false) {
    const a = this.active; if (!a) return;
    this.endStep(); this.cleanup(a);
    this.g.hud?.setObjective('', ''); this.g.hud?.setTimer('', 0); this.g.markers.clearWaypoint(); this.g.markers.setObjectiveMarkers([]);
    this.active = null;
    if (!fromFail) this.g.hud?.toast('Mission abandoned');
    const p = this.g.player; if (p.mode === 'dead') this.g.hud?.showDeath(false);
  }

  private cleanup(a: NonNullable<MissionSystem['active']>) { this.cleanupEntities(a.run); this.g.hud?.setDetection(0); this.g.hud?.race(false); this.g.hud?.setLetterbox(false); this.g.cam.stopCine(); this.g.hud?.setProgress(0); }
  private cleanupEntities(run: Run) {
    const g = this.g;
    for (const n of [...g.peds.all()]) if (n.tag === run.m.id) { if (n.vehicle) g.vehicles.ejectNpc(n.vehicle, n, n.seat); g.peds.release(n); }
    for (const v of [...g.vehicles.list]) if (v.missionId === run.m.id && g.player.vehicle !== v) { v.userData.keepAlive = false; v.missionId = null; v.role = v.role === 'mission' ? 'owned' : v.role; if (v.userData.deleteOnEnd) g.vehicles.remove(v); }
  }

  update(dt: number) {
    const a = this.active, g = this.g;
    if (!a) { this.checkStarts(dt); return; }
    if (a.run.e.__failed) return;
    a.run.t += dt;
    const step = a.steps[a.idx];
    // global fail conditions
    if (g.player.mode === 'dead') { if (!a.run.e.__failed && !a.run.e.deadShown) { a.run.e.deadShown = true; setTimeout(() => { if (this.active === a && g.player.mode === 'dead') this.fail('You died.'); }, 1500); } return; }
    const r = step.update?.(a.run, dt);
    if (r === 'next') { this.endStep(); a.run.e = { ...a.run.e, __prev: undefined }; if (a.idx + 1 >= a.steps.length) { this.complete(); return; } this.beginStep(a.idx + 1); }
    else if (r === 'fail') this.fail('Mission failed.');
    else if (r && typeof r === 'object') this.fail(r.fail);
    if (a && a.mission.failOnWanted && g.police.wantedLevel >= 4) this.fail('Too much heat.');
    // abandon if far from everything (safety)
  }

  get intensity() { return this.active ? this.active.steps[this.active.idx].intensity : false; }

  private startHold = 0;
  private checkStarts(dt: number) {
    const g = this.g, p = g.player;
    if (p.inVehicle && p.vehicle!.speed > 10 || g.interiors.active || p.mode === 'cutscene' || p.mode === 'dead') return;
    for (const m of this.available()) {
      const d = dist2(p, m.start);
      if (d < 3.2 && !p.inVehicle || d < 7 && p.inVehicle && p.vehicle!.speed < 4) {
        g.hud?.setContext(`${m.side ? 'Job' : 'Mission'}: ${m.title}`, () => this.start(m.id));
        return;
      }
    }
  }
  contextStart(): { label: string; run: () => void } | null {
    const g = this.g, p = g.player; if (this.active) return null;
    for (const m of this.available()) { const d = dist2(p, m.start); if (d < 3.4 && !p.inVehicle || d < 7 && p.inVehicle && p.vehicle!.speed < 4) return { label: `${m.side ? 'Start job' : 'Start mission'}: ${m.title}`, run: () => this.start(m.id) }; }
    return null;
  }

  /** NPC dialogue with story characters. */
  talkTo(n: Npc): boolean {
    if (n.userData.story) { this.g.hud?.dialogue(n.name, n.userData.story.lines[Math.floor(Math.random() * n.userData.story.lines.length)], n.userData.story.role); return true; }
    return false;
  }

  // ------------------------------------------------------------ spawn helpers for steps
  spawnHostile(r: Run, x: number, z: number, faction: 'rival' | 'gang' | 'guard' | 'target', weapon: string): Npc {
    const g = this.g;
    const n = new Npc(Npc.randomOutfit(this.rng, faction === 'guard' ? 'swat' : 'gang'), 1.0);
    n.faction = faction; n.name = faction === 'guard' ? 'Security' : 'Thug'; n.tag = r.m.id; n.userData.keep = true;
    n.health = n.maxHealth = faction === 'guard' ? 80 : 70; n.x = x; n.z = z; n.y = Math.max(L.groundY(x, z), g.col.supportY(x, z, 0.3, 50));
    n.weapon = weapon; n.equip(weapon); n.userData.hostile = faction !== 'guard'; n.userData.style = 'gang';
    n.brain = (npc, dt) => this.hostileBrain(npc, dt);
    g.peds.add(n); return n;
  }
  spawnFriend(r: Run, x: number, z: number, name: string): Npc {
    const g = this.g; const n = new Npc(Npc.randomOutfit(this.rng, 'civ'), 1.0);
    n.faction = 'friend'; n.name = name; n.tag = r.m.id; n.userData.keep = true; n.x = x; n.z = z; n.y = Math.max(L.groundY(x, z), 0); n.essential = false; n.health = n.maxHealth = 120;
    n.brain = (npc, dt) => { npc.hum.animate(dt, 0, 'idle'); npc.syncMesh(dt, 0); };
    g.peds.add(n); return n;
  }
  roadAhead(r: Run, ahead: number) {
    const g = this.g, p = g.player, v = p.vehicle;
    const dx = v ? v.worldVx / (v.speed || 1) : Math.sin(p.yaw), dz = v ? v.worldVz / (v.speed || 1) : Math.cos(p.yaw);
    const ax = p.x + dx * ahead, az = p.z + dz * ahead;
    const i = Math.round((ax + L.HALF) / L.CELL), j = Math.round((az + L.HALF) / L.CELL);
    const x = L.lineCoord(i), z = L.lineCoord(j);
    void r;
    return { x, z, yaw: Math.atan2(-dx, -dz) };
  }
  chaseAI(r: Run, av: Vehicle, target: Vehicle, dt: number) {
    const c = av.ctrl; if (av.exploded) return;
    const dx = target.x - av.x, dz = target.z - av.z, d = Math.hypot(dx, dz);
    const err = wrapAngle(Math.atan2(dx, dz) - av.yaw);
    c.steer = clamp(-err * 2, -1, 1);
    const want = clamp(target.speed + (d > 30 ? 8 : -2), 4, av.def.topSpeed * 0.9) * (Math.abs(err) > 0.8 ? 0.4 : 1);
    const e = want - av.vLong; c.throttle = clamp(e * 0.3, 0, 1); c.brake = e < -2 ? 0.7 : 0;
    // shooters
    if (d < 40) for (const o of [av.driver, av.passengers[0]]) { if (!o || o.kind !== 'npc') continue; const n = o.ref as Npc; n.fireCd -= dt; if (n.fireCd <= 0 && !n.dead) { n.fireCd = 0.55; n.x = av.x; n.z = av.z; n.y = av.y; n.yaw = Math.atan2(dx, dz); this.g.combat.npcFire(n, target.x, target.y + 1, target.z, 0.3); } }
    void r;
  }

  /** Enemy / guard AI used by missions & gang encounters. */
  hostileBrain(n: Npc, dt: number) {
    const g = this.g, p = g.player;
    n.fireCd -= dt;
    if (n.dead) return;
    const dx = p.x - n.x, dz = p.z - n.z, d = Math.hypot(dx, dz);
    const los = d < 90 && g.col.los(n.x, 1.6, n.z, p.x, p.y + 1.2, p.z);
    const hostile = n.userData.hostile;
    // unaware guards: patrol & perception
    if (!hostile) {
      if (n.userData.patrol) {
        n.userData.pt = (n.userData.pt ?? 0) + dt;
        n.yaw = n.userData.homeYaw + Math.sin(n.userData.pt * 0.5 + n.id) * 0.9;
        n.hum.animate(dt, 0, 'idle');
        // turning to investigate noise
        if (n.userData.invest) { n.yaw = Math.atan2(n.userData.invest.x - n.x, n.userData.invest.z - n.z); }
      }
      if (n.faction === 'guard' && los && d < (p.crouch ? 8 : 20) * p.visibility && Math.abs(wrapAngle(Math.atan2(dx, dz) - n.yaw)) < 1.0 && !n.userData.sleepy) { n.userData.hostile = true; n.state = 'combat'; }
      n.syncMesh(dt, 0); return;
    }
    n.target = p;
    n.yaw += wrapAngle(Math.atan2(dx, dz) - n.yaw) * Math.min(1, dt * 9);
    const w = n.weapon ?? 'rattler';
    const stop = w === 'brawler' ? 7 : 12;
    let moving = false;
    if (n.vehicle) { n.syncMesh(dt, 0); return; }
    if (d > stop || !los) {
      let ang = Math.atan2(dx, dz) + Math.sin(g.time * 0.8 + n.id) * (los ? 0.6 : 0.2);
      const ax = n.x + Math.sin(ang) * 1.2, az = n.z + Math.cos(ang) * 1.2; if (g.col.resolveCircle(ax, az, 0.35, n.y, 1.6, 0.4).hit) ang += (n.id % 2 ? 1.2 : -1.2);
      n.vx += (Math.sin(ang) * 4.6 - n.vx) * Math.min(1, dt * 7); n.vz += (Math.cos(ang) * 4.6 - n.vz) * Math.min(1, dt * 7);
      n.x += n.vx * dt; n.z += n.vz * dt; moving = true;
      const rr = g.col.resolveCircle(n.x, n.z, 0.32, n.y, 1.6, 0.4); if (rr.hit) { n.x = rr.x; n.z = rr.z; }
    } else { n.vx *= 0.8; n.vz *= 0.8; }
    n.y += (Math.max(g.col.supportY(n.x, n.z, 0.2, n.y + 0.5), L.groundY(n.x, n.z)) - n.y) * Math.min(1, dt * 12);
    if (los && d < 60 && n.fireCd <= 0) {
      n.fireCd = w === 'vigil9' ? 0.75 : w === 'brawler' ? 1.3 : 0.2;
      g.combat.npcFire(n, p.x, p.y + 1.1, p.z, 0.5 * (p.inCover ? 0.55 : 1) * (Math.hypot(p.vx, p.vz) > 4 ? 0.75 : 1) * (p.vehicle ? 0.6 : 1));
    }
    n.hum.animate(dt, moving ? 4 : 0, los ? 'aim' : 'walk');
    n.syncMesh(dt, 0);
  }

  // ------------------------------------------------------------ persistence
  toSave() { return { completed: [...this.completed], friends: [...this.friendsUnlocked], best: this.best, introSeen: this.introSeen }; }
  fromSave(s: any) { if (!s) return; this.completed = new Set(s.completed ?? []); this.friendsUnlocked = new Set(s.friends ?? []); this.best = s.best ?? {}; this.introSeen = !!s.introSeen; }
}

const CHAPTER_NAMES = ['Homecoming', 'The Fixers', 'Turf', 'Undertow'];

// ================================================================================================
//  STORY: "Undertow" — Kit Calder returns to Port Solano owing a debt to Odessa Vance and gets
//  pulled into the war between the Saltwater Kings, the Ironside Reapers, and developer Victor Aldana.
// ================================================================================================
function buildStory(g: Game): Mission[] {
  const P = (id: string) => poi(g, id);
  const ms: Mission[] = [];
  const garage = P('garage_vance');
  const M = (m: Mission) => ms.push(m);

  M({ id: 'm01', title: 'Homecoming', giver: 'odessa', chapter: 'Prologue', requires: [], blurb: 'Kit Calder is back in Port Solano with nothing but a debt. Odessa Vance has a way to work it off.', reward: { cash: 600, friend: ['odessa', 10] }, start: { x: garage.x, z: garage.z + 4 }, unlocksFriend: 'odessa',
    build: (gg) => [
      cine([
        { from: [garage.x + 22, 12, garage.z + 34], to: [garage.x + 12, 8, garage.z + 22], look: [garage.x, 3, garage.z], dur: 6, lines: [['Narrator', 'Port Solano. Eight years since I left. It smells exactly the same.'], ['Kit', 'Salt, exhaust, and bad decisions.']] },
        { from: [garage.x - 4, 2, garage.z + 12], to: [garage.x + 2, 1.8, garage.z + 8], look: [garage.x, 1.6, garage.z + 2], dur: 6.5, lines: [['Odessa', 'You look thinner, Calder. Prison food or guilt?'], ['Kit', 'Both. I need work, Odessa.'], ['Odessa', 'You owe me twelve grand. Work is how you pay.']] },
      ]),
      { text: 'Walk to the Sunfuel station', init(r) { const t = poi(r.g, 'gas1'); r.e.target = { x: t.x, z: t.z }; r.marker([{ x: t.x, z: t.z, color: 0xffd166, radius: 5 }]); r.g.markers.setWaypoint(t.x, t.z); r.sub('Odessa', 'Learn the city again. Hit the Sunfuel on Cypress — I left something for you.', 5); }, update(r) { if (dist2(r.g.player, r.e.target) < 5) return 'next'; }, end(r) { r.marker([]); r.g.markers.clearWaypoint(); } },
      getVehicle('Take the old Tern parked outside', 'car', 'tern_200', (gg2) => { const t = poi(gg2, 'gas1'); return { x: t.x + 6, z: t.z + 14, yaw: 0 }; }, { color: 0x7f8c8d }),
      chatter([['Odessa', 'Call me when you reach the dealership. Learn to drive again — the city changed.'], ['Kit', 'Not by much.']], 3),
      go('Drive to Solano Motorhaus', (g2) => { const t = poi(g2, 'dealer'); return { x: t.x, z: t.z + 3 }; }, 7, { needVehicle: true }),
      note((r) => r.sub('Odessa', 'Good. Come back to my garage; there is a job waiting.', 4)),
      go('Return to Vance Motorworks', (g2) => { const t = poi(g2, 'garage_vance'); return { x: t.x, z: t.z + 4 }; }, 8),
    ] });

  M({ id: 'm02', title: 'Lift', giver: 'odessa', chapter: 'Chapter 1: Homecoming', requires: ['m01'], blurb: 'Steal a luxury sports car from Bellavista Heights for Odessa\'s buyer.', reward: { cash: 2500, friend: ['odessa', 8] }, start: { x: garage.x + 3, z: garage.z + 4 }, failOnWanted: false,
    build: (gg) => {
      const lux = { x: 820, z: -780 };
      return [
        chatter([['Odessa', 'A white Vexa GT, Bellavista Heights. The owner is at a gala till late.'], ['Kit', 'Alarm?'], ['Odessa', 'There is always an alarm. Be fast.']], 3),
        getVehicle('Steal the white Vexa GT', 'car', 'vexa_gt', () => lux, { color: 0xf5f5f5, locked: true }),
        { text: 'Get away from the estate', init(r) { r.g.police.reportCrime('grandtheft', r.g.player.x, r.g.player.z, 1.5, { direct: true }); }, update(r) { if (dist2(r.g.player, lux) > 160) return 'next'; } },
        wantedZero('Shake the cops'),
        deliverVehicle('Deliver the car to Vance Motorworks', 'car', (g2) => ({ x: P('garage_vance').x, z: P('garage_vance').z + 8 }), 0.4),
      ];
    } });

  M({ id: 'm03', title: 'Wheels & Deals', giver: 'teo', chapter: 'Chapter 1: Homecoming', requires: ['m02'], blurb: 'Teo Marquez wants to see if you still have it. A midnight sprint through downtown.', reward: { cash: 3500, friend: ['teo', 12] }, unlocksFriend: 'teo', start: { x: P('club').x, z: P('club').z + 4 },
    build: (gg) => {
      const cps = [{ x: 750, z: 100 }, { x: 750, z: -300 }, { x: 450, z: -300 }, { x: 450, z: 100 }, { x: 150, z: 100 }, { x: 150, z: -400 }, { x: 550, z: -400 }, { x: 550, z: 100 }, { x: 850, z: 100 }];
      return [
        cine([{ from: [P('club').x + 10, 6, P('club').z + 16], to: [P('club').x + 6, 3, P('club').z + 10], look: [P('club').x, 1.6, P('club').z + 4], dur: 6, lines: [['Teo', 'Calder! Heard you were out. Heard you were slow, too.'], ['Kit', 'Heard wrong.'], ['Teo', 'Prove it. Three laps of downtown, no rules but the finish line.']] }]),
        getVehicle('Pick a car — take the Marlin S', 'car', 'marlin_s', (g2) => ({ x: P('club').x - 8, z: P('club').z + 6, yaw: Math.PI / 2 }), { color: 0xe71d36 }),
        go('Drive to the start line', () => cps[cps.length - 1], 12, { needVehicle: true, vehicleKey: 'car' }),
        race('Downtown Sprint', cps, 2, ['tern_200', 'stallion_ss', 'avanti_lx']),
        note((r) => r.sub('Teo', 'Not bad, old man. We should do this more.', 4)),
      ];
    } });

  M({ id: 'm04', title: 'Dead Drop', giver: 'odessa', chapter: 'Chapter 1: Homecoming', requires: ['m03'], blurb: 'Pick up a package from the Saltwater Kings\' stash — and get out before the Kings notice.', reward: { cash: 4500, friend: ['odessa', 8] }, start: { x: garage.x + 3, z: garage.z + 4 },
    build: (gg) => {
      const stash = { x: 560, z: 1100 };
      return [
        chatter([['Odessa', 'The Kings keep a drop at the port. Cash cases. They owe me more than they know.'], ['Kit', 'Armed?'], ['Odessa', 'Rattlers. Don’t be a hero.']], 3),
        getVehicle('Take the Dune Runner outside', 'car', 'dune_runner', (g2) => ({ x: P('garage_vance').x + 14, z: P('garage_vance').z + 8, yaw: 0 }), { color: 0x2ec4b6 }),
        go('Drive to Saltworks Port', () => ({ x: stash.x, z: stash.z - 40 }), 14, { needVehicle: true, vehicleKey: 'car' }),
        killAll('Clear out the Kings at the stash', 'kings', () => [{ x: stash.x - 6, z: stash.z, weapon: 'vigil9' }, { x: stash.x + 5, z: stash.z + 5, weapon: 'rattler' }, { x: stash.x, z: stash.z + 12, weapon: 'rattler' }, { x: stash.x + 14, z: stash.z, weapon: 'vigil9' }]),
        holdAction('Grab the cash cases', () => ({ x: stash.x, z: stash.z + 3 }), 3, (r) => r.g.police.reportCrime('robbery', stash.x, stash.z, 1.2, { direct: true })),
        { text: 'Get back to your vehicle', init(r) { const v = r.g.vehicles.list.find((x) => x.missionId === r.m.id); r.e.v = v; }, update(r) { if (r.g.player.vehicle === r.e.v) return 'next'; r.marker(r.e.v ? [{ x: r.e.v.x, z: r.e.v.z, color: 0x4ade80, radius: 3 }] : []); }, end(r) { r.marker([]); } },
        wantedZero('Evade reinforcements'),
        go('Deliver the cash to Vance Motorworks', () => ({ x: garage.x, z: garage.z + 8 }), 8, { needVehicle: true }),
      ];
    } });

  M({ id: 'm05', title: 'Quiet Night', giver: 'juno', chapter: 'Chapter 2: The Fixers', requires: ['m04'], blurb: 'Plant a tracker inside Aldana\'s construction tower without being seen.', reward: { cash: 5200, friend: ['juno', 12] }, unlocksFriend: 'juno', start: { x: P('club').x + 4, z: P('club').z + 4 },
    build: (gg) => {
      let site: { ci: number; cj: number } | null = null;
      for (let i = 0; i < L.N && !site; i++) for (let j = 0; j < L.N; j++) if (L.isConstructionCell(i, j)) { site = { ci: i, cj: j }; break; }
      const lot = site ? L.cellLot(site.ci, site.cj) : { x0: 100, x1: 180, z0: 100, z1: 180 };
      const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
      return [
        cine([{ from: [P('club').x + 12, 9, P('club').z + 10], to: [P('club').x + 6, 5, P('club').z + 6], look: [P('club').x, 2, P('club').z], dur: 6, lines: [['Juno', 'Aldana Developments — every shell company points to one tower.'], ['Juno', 'Plant this tracker in the site office. Cameras are down till dawn, guards are not.'], ['Kit', 'Quiet it is.']] }]),
        { text: 'Head to the Aldana construction site', checkpoint: true, init(r) { r.marker([{ x: cx, z: lot.z1 + 15, color: 0xffd166, radius: 8 }]); r.g.markers.setWaypoint(cx, lot.z1 + 15); r.g.env.setHour(r.g.env.hour < 20 && r.g.env.hour > 5 ? 23 : r.g.env.hour); r.g.hud?.toast('It is night. Stay crouched in the shadows.'); }, update(r) { if (dist2(r.g.player, { x: cx, z: lot.z1 + 15 }) < 12 && !r.g.player.inVehicle) return 'next'; if (dist2(r.g.player, { x: cx, z: lot.z1 + 15 }) < 12) r.obj('Leave your vehicle and continue on foot'); }, end(r) { r.marker([]); r.g.markers.clearWaypoint(); } },
        stealthInfiltrate('Sneak to the site office', () => [{ x: cx - 12, z: lot.z1 - 8, yaw: 1.2 }, { x: cx + 14, z: cz, yaw: 3.1 }, { x: cx, z: lot.z0 + 14, yaw: 0.3 }], () => ({ x: cx, z: lot.z0 + 6 }), 3.5, true),
        holdAction('Plant the tracker', () => ({ x: cx, z: lot.z0 + 6 }), 3.5, (r) => r.sub('Juno', 'Signal acquired. Get out of there!', 4)),
        go('Leave the construction site', () => ({ x: cx, z: lot.z1 + 60 }), 12),
      ];
    } });

  M({ id: 'm06', title: 'Tail', giver: 'hart', chapter: 'Chapter 2: The Fixers', requires: ['m05'], blurb: 'Detective Hart needs the Kings\' courier followed — without being seen.', reward: { cash: 4800, friend: ['hart', 12] }, unlocksFriend: 'hart', start: { x: P('police').x, z: P('police').z + 3 },
    build: (gg) => {
      const rt = [{ x: -400, z: 600 }, { x: -400, z: 100 }, { x: -100, z: 100 }, { x: -100, z: -300 }, { x: 200, z: -300 }, { x: 200, z: -700 }, { x: 800, z: -700 }];
      return [
        cine([{ from: [P('police').x - 10, 8, P('police').z + 14], to: [P('police').x - 4, 4, P('police').z + 8], look: [P('police').x, 2, P('police').z], dur: 6.5, lines: [['Hart', 'I am off the books here, Calder. The Kings move product through a courier.'], ['Hart', 'Tail him. Do not engage. If he sees you, we lose months.'], ['Kit', 'Why me?'], ['Hart', 'Because nobody on my force is as good a liar.']] }]),
        getVehicle('Take the Avanti outside', 'car', 'avanti_lx', (g2) => ({ x: P('taxi').x + 8, z: P('taxi').z + 8, yaw: 0 }), { color: 0x3b4b63 }),
        go('Get to the Kings\' drop-off point', () => ({ x: rt[0].x + 25, z: rt[0].z + 60 }), 14, { needVehicle: true, vehicleKey: 'car' }),
        followTarget('Tail the courier', 'delivery_van', () => rt, { speed: 13 }),
        note((r) => r.sub('Hart', 'That warehouse in Bellavista. Good work. I owe you one.', 4)),
      ];
    } });

  M({ id: 'm07', title: 'The Counting House', giver: 'odessa', chapter: 'Chapter 2: The Fixers', requires: ['m06'], blurb: 'Hit the Kings\' cash depot in Midtown and run for the safehouse — a four-star getaway.', reward: { cash: 12000, friend: ['odessa', 10] }, start: { x: garage.x + 3, z: garage.z + 4 },
    build: (gg) => {
      const depot = { x: 450, z: -480 };
      return [
        chatter([['Odessa', 'Midtown cash depot. Three guards, one vault door, one way out.'], ['Kit', 'And the cops?'], ['Odessa', 'Will be there in under two minutes. Plan your exit.']], 3),
        getVehicle('Take the getaway car — a Kestrel RS', 'car', 'kestrel_rs', (g2) => ({ x: P('garage_vance').x + 10, z: P('garage_vance').z + 10, yaw: 0 }), { color: 0x222428 }),
        go('Drive to the Midtown depot', () => ({ x: depot.x, z: depot.z + 30 }), 12, { needVehicle: true, vehicleKey: 'car' }),
        killAll('Neutralise the guards', 'g', () => [{ x: depot.x - 5, z: depot.z, faction: 'guard', weapon: 'vigil9' }, { x: depot.x + 6, z: depot.z - 3, faction: 'guard', weapon: 'rattler' }, { x: depot.x, z: depot.z + 7, faction: 'guard', weapon: 'rattler' }], { alertAll: true }),
        holdAction('Crack the vault', () => ({ x: depot.x, z: depot.z - 4 }), 5, (r) => { r.g.police.reportCrime('heist', depot.x, depot.z, 4, { direct: true }); r.g.economy.addCash(2500, 'Vault cash'); }),
        note((r) => { r.sub('Odessa', 'Alarms are screaming. Get to the car and run!', 4); r.g.police.heat = Math.max(r.g.police.heat, 6.6); r.g.police.wantedLevel = Math.max(r.g.police.wantedLevel, 3); r.g.hud?.wantedChanged(r.g.police.wantedLevel); }),
        { text: 'Get back to the getaway car', init(r) { r.e.v = r.g.vehicles.list.find((x) => x.missionId === r.m.id); }, update(r) { if (r.g.player.vehicle === r.e.v) return 'next'; r.marker(r.e.v ? [{ x: r.e.v.x, z: r.e.v.z, color: 0x4ade80, radius: 3 }] : []); }, intensity: true, end(r) { r.marker([]); } },
        go('Lose the cops and reach the Calder Apartment', () => ({ x: P('safe_midtown').x, z: P('safe_midtown').z + 5 }), 9, { needVehicle: true, wanted0: true }),
        wantedZero('Wait for the heat to die'),
      ];
    } });

  M({ id: 'm08', title: 'Cold Case', giver: 'hart', chapter: 'Chapter 3: Turf', requires: ['m07'], blurb: 'Find four pieces of evidence tying Aldana to the Kings. Hart will meet you at the Rusty Anchor.', reward: { cash: 5500, friend: ['hart', 12] }, start: { x: P('police').x, z: P('police').z + 3 },
    build: (gg) => {
      const clues = [
        { x: P('realestate').x, z: P('realestate').z + 3, note: 'Property deeds signed the same day the Kings\' warehouses burned. Convenient.' },
        { x: -650, z: 1050, note: 'A burner phone stuffed in a Saltworks dumpster: calls only to an Aldana Developments number.' },
        { x: 1050, z: 650, note: 'Marina logbook. A yacht with no owner, paid in cash by "A.D.".' },
        { x: 250, z: -250, note: 'Noodle shop owner saw Aldana\'s driver collecting envelopes from Silas Crane. Every Friday.' },
      ];
      return [
        chatter([['Hart', 'Four leads. Real estate office, Saltworks, the marina, the noodle bar.'], ['Hart', 'Photograph nothing. Touch nothing. Just remember.']], 3),
        collectClues('Search the leads', clues),
        go('Meet Hart at The Rusty Anchor', () => ({ x: P('bar').x, z: P('bar').z + 3 }), 5),
        note((r) => { r.sub('Hart', 'This is enough to start a war. Crane will know someone talked. Keep your head down.', 5); }),
        wait('Listening…', 3),
      ];
    } });

  M({ id: 'm09', title: 'Safe Passage', giver: 'juno', chapter: 'Chapter 3: Turf', requires: ['m08'], blurb: 'The Reapers want Juno silenced. Get her across the city alive.', reward: { cash: 7000, friend: ['juno', 14] }, start: { x: P('club').x + 4, z: P('club').z + 4 },
    build: (gg) => [
      cine([{ from: [P('club').x + 6, 4, P('club').z + 10], to: [P('club').x + 3, 2.5, P('club').z + 6], look: [P('club').x, 1.6, P('club').z + 2], dur: 5.5, lines: [['Juno', 'The Reapers burned my server room. They want my drives.'], ['Juno', 'Take me to the airport terminal. Rafa has people everywhere.']] }]),
      getVehicle('Take the armored Ridgeback', 'car', 'ridgeback', (g2) => ({ x: P('club').x - 8, z: P('club').z + 8, yaw: 0 }), { color: 0x222428 }),
      escortNpc('Escort Juno to the airport', 'juno', (g2) => ({ x: P('club').x + 4, z: P('club').z + 6 }), (g2) => ({ x: P('airport').x, z: P('airport').z + 6 }), 'Juno Park', 3),
      note((r) => r.sub('Juno', 'You saved my life. Remember this when the war comes.', 4)),
    ] });

  M({ id: 'm10', title: 'Turf War', giver: 'teo', chapter: 'Chapter 3: Turf', requires: ['m09'], blurb: 'The Ironside Reapers hold the east blocks. Push them out with Teo.', reward: { cash: 9000, friend: ['teo', 12] }, start: { x: P('club').x, z: P('club').z + 4 },
    build: (gg) => {
      const hq = { x: -750, z: 750 };
      return [
        chatter([['Teo', 'Rafa moved the Reapers into the old laundromat on Ironside. They have shotguns and a grudge.'], ['Kit', 'And you want to walk in?'], ['Teo', 'Not walk. Roll in. I will cover the street.']], 3),
        go('Head to Ironside', () => ({ x: hq.x, z: hq.z - 80 }), 14, { needVehicle: true }),
        killAll('Take the street from the Reapers', 'wave1', () => [0, 1, 2, 3, 4].map((i) => ({ x: hq.x - 12 + i * 6, z: hq.z - 10 + (i % 2) * 9, weapon: i % 2 ? 'brawler' : 'rattler', faction: 'rival' as const })), { alertAll: true }),
        killAll('Clear the laundromat', 'wave2', () => [0, 1, 2, 3].map((i) => ({ x: hq.x - 8 + i * 6, z: hq.z + 22 + (i % 2) * 4, weapon: 'rattler', faction: 'rival' as const })), { alertAll: true }),
        killAll('Take down Rafa Ortiz', 'rafa', () => [{ x: hq.x, z: hq.z + 30, weapon: 'longarm', faction: 'target', hp: 260 }], { alertAll: true }),
        wantedZero('Get out before backup arrives'),
      ];
    } });

  M({ id: 'm11', title: 'Port Authority', giver: 'odessa', chapter: 'Chapter 4: Undertow', requires: ['m10'], blurb: 'Silas Crane\'s port is open for the taking. Hit his armored convoy and claim Dockside Customs.', reward: { cash: 15000, friend: ['odessa', 15] }, start: { x: garage.x + 3, z: garage.z + 4 },
    build: (gg) => {
      const port = P('garage_port');
      return [
        cine([{ from: [garage.x - 6, 3, garage.z + 12], to: [garage.x + 2, 2, garage.z + 6], look: [garage.x, 1.8, garage.z], dur: 6, lines: [['Odessa', 'Crane runs an armored convoy from the airport to the port every night.'], ['Odessa', 'Hit it, bring the truck to Dockside Customs, and the garage is ours.'], ['Kit', 'You mean mine.'], ['Odessa', 'I mean ours. For now.']] }]),
        getVehicle('Take the Haul 150', 'car', 'haul_150', () => ({ x: garage.x + 16, z: garage.z + 8, yaw: 0 }), { color: 0x1a1a1d }),
        go('Intercept the convoy near the airport road', () => ({ x: -900, z: -1250 }), 16, { needVehicle: true, vehicleKey: 'car' }),
        { text: 'Destroy the convoy escorts', checkpoint: true, intensity: true,
          init(r) { const g2 = r.g; r.e.es = []; for (let i = 0; i < 3; i++) { const a = { x: -1000 + i * 28, z: -1250 }; const v = g2.vehicles.spawn(i === 1 ? 'box_truck' : 'stallion_ss', a.x, a.z, Math.PI / 2, 'gang', i === 1 ? 0x3a3a3a : 0x6b1d1d); v.userData.keepAlive = true; v.engineOn = true; v.missionId = r.m.id; v.health = v.maxHealth = v.def.hp * 1.4; v.maxHealth = v.health; const d = g2.missions.spawnHostile(r, 0, 0, 'rival', 'rattler'); g2.vehicles.seatNpc(v, d, 0); r.e.es.push(v); if (i === 1) r.e.truck = v; } r.e.legT = 0; },
          update(r, dt) { const g2 = r.g, p = g2.player; const tv = r.e.truck as Vehicle; r.e.legT += dt;
            for (let k = 0; k < r.e.es.length; k++) { const v = r.e.es[k] as Vehicle; if (v.exploded) continue; const c = v.ctrl; const tgt = k === 1 ? { x: port.x, z: port.z } : { x: port.x, z: port.z }; const err = wrapAngle(Math.atan2(tgt.x - v.x, tgt.z - v.z) - v.yaw); c.steer = clamp(-err * 1.6, -1, 1); const want = (k === 1 ? 12 : 14) * (Math.abs(err) > 0.6 ? 0.4 : 1); const e = want - v.vLong; c.throttle = clamp(e * 0.3, 0, 0.8); c.brake = e < -2 ? 0.5 : 0;
              if (k !== 1 && v.driver?.kind === 'npc') { const n = v.driver.ref as Npc; const d = dist2(v, p); if (d < 45) { n.fireCd -= dt; if (n.fireCd <= 0) { n.fireCd = 0.4; n.x = v.x; n.z = v.z; n.y = v.y; n.yaw = Math.atan2(p.x - v.x, p.z - v.z); g2.combat.npcFire(n, p.x, p.y + 1, p.z, 0.3); } } } }
            if (tv.exploded) return { fail: 'The truck was destroyed.' };
            r.marker([{ x: tv.x, z: tv.z, color: 0xff4d4d, radius: 3 }]); r.obj('Stop the convoy — disable the escorts, keep the truck intact');
            const esc = (r.e.es as Vehicle[]).filter((v, i) => i !== 1 && !v.exploded && v.health > v.maxHealth * 0.1); if (esc.length === 0) return 'next'; if (r.e.legT > 140) return { fail: 'The convoy got away.' }; },
          end(r) { r.marker([]); } },
        { text: 'Drive the armored truck to Dockside Customs', checkpoint: true,
          init(r) { const t = r.e.truck as Vehicle; if (t.driver && t.driver.kind === 'npc') { const n = t.driver.ref as Npc; r.g.vehicles.ejectNpc(t, n, 0); n.fear = 1; n.state = 'flee'; n.stateT = 10; } r.e.v = t; t.locked = false; r.marker([{ x: t.x, z: t.z, color: 0x4ade80, radius: 3 }]); },
          update(r) { const t = r.e.v as Vehicle; if (t.exploded) return { fail: 'The truck was destroyed.' }; if (r.g.player.vehicle === t) return 'next'; r.marker([{ x: t.x, z: t.z, color: 0x4ade80, radius: 3 }]); },
          end(r) { r.marker([]); } },
        { text: 'Deliver the truck to Dockside Customs', checkpoint: true, init(r) { r.e.target = { x: port.x, z: port.z + 8 }; r.marker([{ x: port.x, z: port.z + 8, color: 0xffd166, radius: 7 }]); r.g.markers.setWaypoint(port.x, port.z + 8); r.e.v = r.g.vehicles.list.find((v) => v.missionId === r.m.id && v.def.id === 'box_truck'); },
          update(r) { const t = r.e.v as Vehicle; if (!t || t.exploded) return { fail: 'The truck was destroyed.' }; if (!r.g.player.inVehicle) { r.obj('Get back in the truck'); return; } r.obj('Deliver the truck to Dockside Customs'); if (dist2(t, r.e.target) < 7 && t.speed < 5) return 'next'; }, end(r) { r.marker([]); r.g.markers.clearWaypoint(); } },
        note((r) => { const b = r.g.economy.businesses['garage_port']; if (b && !b.owned) { b.owned = true; b.level = 1; r.g.hud?.toast('You now own Dockside Customs'); } r.sub('Odessa', 'Look at that. A legitimate business. Almost.', 4); }),
      ];
    } });

  M({ id: 'm12', title: 'Undertow', giver: 'hart', chapter: 'Chapter 4: Undertow', requires: ['m11'], blurb: 'Silas Crane runs for open water. End the chase on the bay.', reward: { cash: 30000, friend: ['hart', 15], unlock: 'Story complete' }, start: { x: P('police').x, z: P('police').z + 3 },
    build: (gg) => {
      const marina = P('marina');
      return [
        cine([{ from: [marina.x - 20, 12, marina.z + 20], to: [marina.x - 10, 7, marina.z + 8], look: [marina.x + 30, 1, marina.z - 40], dur: 7, lines: [['Hart', 'Crane is leaving by yacht. Aldana is waiting for him past the buoys.'], ['Hart', 'If they meet, the evidence sinks with them.'], ['Kit', 'Then I take a boat.'], ['Hart', 'Make it a fast one.']] }]),
        getVehicle('Take the Skipper boat at the marina', 'boat', 'skipper', () => ({ x: 1215, z: marina.z - 55, yaw: Math.PI / 2 }), { color: 0xf4f4f4 }),
        { text: 'Chase Crane\'s yacht across the bay', checkpoint: true, intensity: true,
          init(r) { const g2 = r.g; const y = g2.vehicles.spawn('wavebreaker', 1240, marina.z - 120, Math.PI / 2, 'mission', 0x111111); y.userData.keepAlive = true; y.engineOn = true; y.missionId = r.m.id; y.health = y.maxHealth = 4000; r.e.y = y; const d = g2.missions.spawnHostile(r, 0, 0, 'rival', 'rattler'); g2.vehicles.seatNpc(y, d, 0); r.e.wp = [{ x: 1500, z: marina.z - 300 }, { x: 1550, z: -100 }, { x: 1480, z: -600 }]; r.e.wi = 0; r.e.guards = [g2.missions.spawnHostile(r, 0, 0, 'rival', 'longarm'), g2.missions.spawnHostile(r, 0, 0, 'rival', 'longarm')]; g2.vehicles.seatNpc(y, r.e.guards[0], 1); g2.vehicles.seatNpc(y, r.e.guards[1], 2); r.e.fireT = 0; },
          update(r, dt) { const y = r.e.y as Vehicle, p = r.g.player; if (y.exploded) return 'next'; const wp = r.e.wp[r.e.wi]; const err = wrapAngle(Math.atan2(wp.x - y.x, wp.z - y.z) - y.yaw); y.ctrl.steer = clamp(-err * 1.5, -1, 1); y.ctrl.throttle = 0.75; if (dist2(y, wp) < 40 && r.e.wi < r.e.wp.length - 1) r.e.wi++;
            const d = dist2(y, p); r.e.fireT -= dt; if (d < 80 && r.e.fireT <= 0) { r.e.fireT = 0.5; for (const gn of r.e.guards as Npc[]) { gn.x = y.x; gn.z = y.z; gn.y = y.y + 1; gn.yaw = Math.atan2(p.x - y.x, p.z - y.z); r.g.combat.npcFire(gn, p.x, p.y + 1, p.z, 0.35); } }
            r.marker([{ x: y.x, z: y.z, color: 0xff4d4d, radius: 4 }]); r.obj(`Chase and destroy Crane's yacht (${Math.round(y.health / y.maxHealth * 100)}%)`);
            if (d > 260) return { fail: 'Crane got away.' }; if (!p.inVehicle) r.obj('Get back in the boat'); },
          end(r) { r.marker([]); } },
        note((r) => r.sub('Hart', 'It is over. Port Solano owes you more than it will ever admit.', 5)),
      ];
    } });

  // ---- repeatable side jobs
  const sideStart = (id: string) => poi(g, id);
  const raceCourse = (cps: { x: number; z: number }[]) => cps;
  const races: { id: string; title: string; at: string; cps: { x: number; z: number }[]; laps: number; reward: number }[] = [
    { id: 'side_race_downtown', title: 'Street Race: Downtown Loop', at: 'club', cps: raceCourse([{ x: 750, z: 100 }, { x: 750, z: -300 }, { x: 450, z: -300 }, { x: 450, z: 100 }]), laps: 3, reward: 2500 },
    { id: 'side_race_coast', title: 'Street Race: Coast Run', at: 'hotel_azure', cps: raceCourse([{ x: 1050, z: 400 }, { x: 1050, z: -400 }, { x: 850, z: -400 }, { x: 850, z: 200 }]), laps: 3, reward: 3000 },
    { id: 'side_race_industrial', title: 'Street Race: Saltworks Dash', at: 'bar', cps: raceCourse([{ x: 650, z: 1100 }, { x: 250, z: 1100 }, { x: 250, z: 700 }, { x: 650, z: 700 }]), laps: 3, reward: 2800 },
  ];
  for (const r of races) {
    const sp = sideStart(r.at);
    M({ id: r.id, title: r.title, giver: 'teo', chapter: 'Side', requires: ['m03'], blurb: 'Win a street race against three rivals.', reward: { cash: r.reward }, side: true, repeatable: true, start: { x: sp.x + 6, z: sp.z + 10 },
      build: () => [getVehicle('Pick the fast ride', 'car', 'vexa_gt', () => ({ x: sp.x + 12, z: sp.z + 12, yaw: 0 }), { color: 0xff5a1f }), go('Go to the start line', () => r.cps[r.cps.length - 1], 12, { needVehicle: true, vehicleKey: 'car' }), race(r.title, r.cps, r.laps, ['marlin_s', 'kestrel_rs', 'bruiser_70'])] });
  }
  // vehicle exports
  const exports: { id: string; model: string; title: string; spawn: { x: number; z: number } }[] = [
    { id: 'side_export_a', model: 'ridgeback', title: 'Vehicle Export: Ridgeback', spawn: { x: -850, z: -250 } },
    { id: 'side_export_b', model: 'bruiser_70', title: 'Vehicle Export: Bruiser 70', spawn: { x: 650, z: -950 } },
    { id: 'side_export_c', model: 'kestrel_rs', title: 'Vehicle Export: Kestrel RS', spawn: { x: 1050, z: 250 } },
  ];
  for (const e of exports) M({ id: e.id, title: e.title, giver: 'odessa', chapter: 'Side', requires: ['m02'], blurb: 'Steal the listed vehicle and drop it at Dockside Customs.', reward: { cash: 3000 }, side: true, repeatable: true, start: { x: garage.x - 5, z: garage.z + 6 },
    build: () => [getVehicle(`Steal the target ${defName(e.model)}`, 'car', e.model, () => e.spawn, { locked: true }), { text: 'Shake any heat', init(r) { r.g.police.reportCrime('grandtheft', r.g.player.x, r.g.player.z, 1, { direct: false }); }, update(r) { if (r.g.police.wantedLevel === 0) return 'next'; r.obj('Lose the cops'); } }, deliverVehicle('Deliver to Dockside Customs', 'car', () => ({ x: P('garage_port').x, z: P('garage_port').z + 8 }), 0.5)] });
  // courier
  M({ id: 'side_courier', title: 'Courier Run', giver: 'juno', chapter: 'Side', requires: ['m05'], blurb: 'Deliver a sealed case across the city before time runs out.', reward: { cash: 1800 }, side: true, repeatable: true, start: { x: P('cinema').x, z: P('cinema').z + 5 },
    build: () => [holdAction('Pick up the case', () => ({ x: P('cinema').x, z: P('cinema').z + 3 }), 1.5), timed(go('Deliver the case to Mercy Bay General', () => ({ x: P('hospital').x, z: P('hospital').z + 3 }), 6), 120, 'Deliver'), note((r) => r.sub('Juno', 'Perfect timing. Same time tomorrow?', 3))] });
  // bounty
  M({ id: 'side_bounty', title: 'Bounty: Reapers Lieutenant', giver: 'hart', chapter: 'Side', requires: ['m08'], blurb: 'Take down a Reapers lieutenant hiding out in Ironside.', reward: { cash: 4000 }, side: true, repeatable: true, start: { x: P('police').x + 4, z: P('police').z + 5 },
    build: () => { const t = { x: -900, z: 900 }; return [go('Go to Ironside', () => ({ x: t.x, z: t.z - 60 }), 14), killAll('Eliminate the lieutenant and his crew', 'k', () => [{ x: t.x, z: t.z, weapon: 'longarm', faction: 'target', hp: 200 }, { x: t.x + 6, z: t.z + 4, weapon: 'rattler' }, { x: t.x - 7, z: t.z + 3, weapon: 'brawler' }], { alertAll: true })]; } });
  return ms;
}
const defName = (id: string) => id.replace(/_/g, ' ');
void edgeOpen;
