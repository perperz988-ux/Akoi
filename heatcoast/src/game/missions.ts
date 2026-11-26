import * as THREE from 'three';
import type { Game, Line } from './game';
import { Actor } from '../actors/actor';
import { randomLook, Look } from '../actors/humanoid';
import { Vehicle } from '../vehicles/vehicle';
import { poiById, route, nearestNode, NODES } from '../world/layout';
import { rng, clamp, wrapAngle, dist2d } from '../core/math';
import { buildStory, buildSide } from './story';

export class MissionFail extends Error {}
export interface MissionDef {
  id: string; title: string; chapter: string; giver: string; blurb: string; requires: string[]; reward: number; side?: boolean; repeatable?: boolean;
  start: () => { x: number; z: number }; hours?: [number, number]; run: (m: Ctx) => Promise<void>; auto?: boolean;
}
export interface Blip { x: number; z: number; color: string; label?: string; route?: boolean; radius?: number }

/** Async mission scripting context: `await m.goto(...)`, `await m.say(...)`, `await m.choice(...)`. */
export class Ctx {
  spawned: { actors: Actor[]; vehicles: Vehicle[] } = { actors: [], vehicles: [] };
  blips: Blip[] = []; private fails: { pred: () => boolean; why: string }[] = [];
  waiter: { pred: () => boolean; tick?: (dt: number) => void; resolve: () => void; reject: (e: any) => void } | null = null;
  objective = ''; timer: { label: string; left: number } | null = null; noWanted = false; lockSwitch = false; skipped = false;
  t = 0; dead = false;
  constructor(public g: Game, public def: MissionDef) {}
  get P() { return this.g.player; } get Q() { return this.g.partner; }
  obj(text: string) { this.objective = text; this.g.hud.objective(text); }
  failIf(pred: () => boolean, why: string) { this.fails.push({ pred, why }); }
  clearFails() { this.fails = []; }
  check(): string | null { for (const f of this.fails) if (f.pred()) return f.why; if (this.timer && this.timer.left <= 0) return 'Out of time'; return null; }
  until(pred: () => boolean, tick?: (dt: number) => void): Promise<void> {
    if (this.dead) return Promise.reject(new MissionFail('aborted'));
    return new Promise((resolve, reject) => { this.waiter = { pred, tick, resolve, reject }; });
  }
  wait(sec: number) { const end = this.t + sec; return this.until(() => this.t >= end); }
  /** Travel objective with GPS route. */
  async goto(x: number, z: number, text: string, o: { radius?: number; car?: boolean; foot?: boolean; vehicle?: Vehicle; noCops?: boolean; color?: string } = {}) {
    const r = o.radius ?? 5;
    this.blips = [{ x, z, color: o.color ?? '#ffd34d', route: true, radius: r }]; this.g.hud.setRoute(x, z);
    await this.until(() => {
      const P = this.P;
      if (o.vehicle && P.vehicle !== o.vehicle) { this.obj(`Get back in the ${o.vehicle.def.name}`); this.blips = [{ x: o.vehicle.x, z: o.vehicle.z, color: '#4dd0ff' }]; return false; }
      if (o.noCops && this.g.police.stars > 0) { this.obj('Lose the cops'); this.blips = []; return false; }
      this.obj(text); this.blips = [{ x, z, color: o.color ?? '#ffd34d', route: true, radius: r }];
      if (o.car && !P.vehicle) return false; if (o.foot && P.vehicle) return false;
      const px = P.vehicle ? P.vehicle.x : P.x, pz = P.vehicle ? P.vehicle.z : P.z;
      return Math.hypot(px - x, pz - z) < r && (!P.vehicle || P.vehicle.speed < 8 || r > 10);
    });
    this.blips = []; this.g.hud.setRoute(null);
  }
  async loseCops() { if (this.g.police.stars === 0) return; this.obj('Lose the cops'); await this.until(() => this.g.police.stars === 0); }
  /** Lines of dialogue played while gameplay continues. */
  async say(lines: Line[]) { this.g.playConversation(lines); await this.until(() => !this.g.speaking); }
  /** Cinematic two-person conversation with shot / reverse-shot framing. */
  async converse(lines: (Line & { to?: Actor })[], actors: Record<string, Actor>, opts: { wide?: [number, number, number] } = {}) {
    const g = this.g; this.cinematic(true);
    try {
      for (const l of lines) {
        const S = actors[l.who] ?? (l.who === 'player' ? this.P : l.who === 'partner' ? this.Q : null);
        const Lr = l.to ?? (S === this.P ? this.Q : this.P);
        if (S && Lr) {
          for (const [a, b] of [[S, Lr], [Lr, S]]) { a.yaw = Math.atan2(b.x - a.x, b.z - a.z); a.hum.lookAt = new THREE.Vector3(b.x, b.y + b.hum.height - 0.12, b.z); }
          const sh = new THREE.Vector3(S.x, S.y + S.hum.height - 0.1, S.z), lh = new THREE.Vector3(Lr.x, Lr.y + Lr.hum.height - 0.05, Lr.z);
          const dir = sh.clone().sub(lh).setY(0).normalize(); const right = new THREE.Vector3(-dir.z, 0, dir.x);
          const side = (lines.indexOf(l) % 2 ? 1 : -1) * 0.55;
          const from = lh.clone().addScaledVector(dir, -0.85).addScaledVector(right, side).add(new THREE.Vector3(0, 0.12, 0));
          const to = from.clone().addScaledVector(dir, 0.25);
          if (opts.wide && lines.indexOf(l) === 0) g.cam.playShot(new THREE.Vector3(...opts.wide), new THREE.Vector3(...opts.wide).lerp(sh, 0.15), sh, sh, 3, 40);
          else g.cam.playShot(from, to, sh, sh, 6, 38);
        }
        const name = S ? S.name.split(' ')[0] : l.who; const dur = l.dur ?? Math.max(2.3, l.text.length * 0.068);
        g.hud.subtitle(name, l.text, dur); if (S) S.hum.talk = dur * 0.9;
        const end = this.t + dur + 0.25; this.skipped = false;
        await this.until(() => this.t >= end || this.skipped);
      }
    } finally { this.cinematic(false); }
  }
  /** Free camera cutscene shot. */
  async shot(from: [number, number, number], to: [number, number, number], look: [number, number, number], dur: number, lines: Line[] = [], lookTo?: [number, number, number]) {
    this.cinematic(true); this.g.cam.playShot(new THREE.Vector3(...from), new THREE.Vector3(...to), new THREE.Vector3(...look), new THREE.Vector3(...(lookTo ?? look)), dur, 45);
    this.g.playConversation(lines, true); const end = this.t + dur; this.skipped = false;
    try { await this.until(() => this.t >= end || this.skipped); } finally { this.cinematic(false); }
  }
  cinematic(on: boolean) {
    const g = this.g; g.hud.letterbox(on); g.touch.show(!on);
    if (on) { if (this.P.mode === 'foot') this.P.mode = 'cutscene'; this.P.vx = this.P.vz = 0; this.noWanted = true; }
    else { g.cam.stopCine(); if (this.P.mode === 'cutscene') this.P.mode = 'foot'; this.noWanted = false; g.cam.snapBehind(this.P.yaw); this.P.hum.lookAt = null; this.Q.hum.lookAt = null; }
  }
  async choice(prompt: string, options: string[], seconds = 0): Promise<number> { return this.g.menus.choice(prompt, options, seconds); }
  async call(from: string, lines: Line[]) { await this.g.phone.incomingCall(from); this.P.pose = 'phone'; await this.say(lines); this.g.phone.endCall(); }
  text(from: string, msg: string) { this.g.phone.message(from, msg); }

  // ---------- spawning helpers
  actor(x: number, z: number, look: Look | 'gang' | 'civ' | 'rich' | 'cop', name: string, faction: Actor['faction'] = 'story', weapon?: string): Actor {
    const a = new Actor(typeof look === 'string' ? randomLook(() => rng.next(), look as any) : look, typeof look !== 'string');
    a.name = name; a.faction = faction; a.placeAt(x, z); a.ai = { story: true, state: 'idle', t: 0 };
    if (weapon) { a.equip(weapon); a.ammo[weapon] = 999; }
    this.g.peds.addActor(a); this.spawned.actors.push(a); return a;
  }
  enemy(x: number, z: number, weapon = 'pistol', name = 'Kane\'s Muscle', hp = 90): Actor {
    const a = this.actor(x, z, 'gang', name, 'enemy', weapon); a.hp = a.maxHp = hp; a.ai.acc = 0.3;
    a.ai.brain = (s: Actor, dt: number) => this.g.events.hostileBrain(s, dt); return a;
  }
  car(id: string, x: number, z: number, yaw: number, color?: number, role: Vehicle['role'] = 'mission'): Vehicle {
    const v = this.g.vehicles.spawn(id, x, z, yaw, color ?? rng.pick([0x1c1c1e, 0xf2f2f2, 0x7a1f1f]), role); v.physics = true; this.spawned.vehicles.push(v); return v;
  }
  /** Give a mission car a driver that follows a GPS route (or chases a target). */
  driveRoute(v: Vehicle, to: { x: number; z: number }, speed: number, onArrive?: () => void) {
    const pts = route(v.x, v.z, to.x, to.z); let i = 1;
    v.ai = { script: (car: Vehicle, dt: number) => {
      if (!car.driver || car.dead) { car.step(dt, { throttle: 0, steer: 0, handbrake: true }); return; }
      while (i < pts.length - 1 && Math.hypot(pts[i].x - car.x, pts[i].z - car.z) < 12) i++;
      const wp = pts[Math.min(i, pts.length - 1)]; const last = i >= pts.length - 1 && Math.hypot(wp.x - car.x, wp.z - car.z) < 8;
      if (last) { car.step(dt, { throttle: -0.6, steer: 0, handbrake: car.speed < 2 }); onArrive?.(); onArrive = undefined; return; }
      this.g.vehicles.aiSteer(car, wp.x, wp.z, speed, dt);
    } };
  }
  chase(v: Vehicle, target: () => { x: number; z: number }, speed: number) {
    v.ai = { script: (car: Vehicle, dt: number) => { if (!car.driver || car.dead) { car.step(dt, { throttle: 0, steer: 0, handbrake: true }); return; } const t = target(); this.g.vehicles.aiSteer(car, t.x, t.z, speed, dt, true); } };
  }
  cleanup(keepCars = false) {
    for (const a of this.spawned.actors) if (!a.dead && a.ai) { a.ai.story = false; a.ai.brain = null; if (a.faction === 'enemy') a.faction = 'gang'; a.ai.state = 'flee'; a.ai.fx = this.P.x; a.ai.fz = this.P.z; }
    if (!keepCars) for (const v of this.spawned.vehicles) if (v !== this.P.vehicle) { v.ai = null; if (v.role === 'mission') v.role = 'parked'; }
    this.blips = []; this.g.hud.setRoute(null); this.timer = null;
  }
}

/** Mission manager: availability, start markers, running/failing/retrying, story progress & chapters. */
export class Missions {
  defs: MissionDef[] = []; done = new Set<string>(); active: Ctx | null = null; private queued: string | null = null;
  constructor(private g: Game) { this.defs = [...buildStory(), ...buildSide()]; }
  reset() { this.done.clear(); this.abort(true); }
  available() { return this.defs.filter((d) => (!this.done.has(d.id) || d.repeatable) && d.requires.every((r) => this.done.has(r))); }
  nextStory() { return this.available().find((d) => !d.side); }
  chapterName() { const s = this.nextStory(); return s ? s.chapter : 'Story complete'; }
  progress() { const st = this.defs.filter((d) => !d.side); return st.filter((d) => this.done.has(d.id)).length / st.length; }
  startStory() { const d = this.nextStory(); if (d?.auto) this.start(d.id); }
  blips(): Blip[] {
    if (this.active) return this.active.blips;
    return this.available().filter((d) => !d.auto || this.done.has(d.id) === false).map((d) => { const s = d.start(); return { x: s.x, z: s.z, color: d.side ? '#4dd0ff' : '#ffd34d', label: d.title }; });
  }
  contextAt(x: number, z: number): (() => void) | null {
    if (this.active) return null;
    for (const d of this.available()) { const s = d.start(); if (Math.hypot(s.x - x, s.z - z) < 3.5) return () => this.start(d.id); }
    return null;
  }
  contextLabel(x: number, z: number) { if (this.active) return null; for (const d of this.available()) { const s = d.start(); if (Math.hypot(s.x - x, s.z - z) < 3.5) return `Start: ${d.title}`; } return null; }
  start(id: string) {
    const g = this.g, d = this.defs.find((x) => x.id === id); if (!d || this.active) return;
    if (g.police.stars > 0) { g.hud.toast('Lose the cops first'); return; }
    if (g.player.vehicle && !d.side) { /* fine */ }
    const m = new Ctx(g, d); this.active = m;
    g.hud.missionBanner(d.title, d.chapter); g.audio.mission();
    if (!d.side) m.failIf(() => g.partner.dead && !g.partner.vehicle, `${g.partner.name.split(' ')[0]} went down`);
    d.run(m).then(() => this.complete(m)).catch((e) => { if (e instanceof MissionFail && e.message === 'aborted') return; if (!(e instanceof MissionFail)) console.error(e); this.fail(m, e instanceof MissionFail ? e.message : 'Something went wrong'); });
  }
  private complete(m: Ctx) {
    const g = this.g; if (this.active !== m) return;
    m.cleanup(); this.active = null; this.done.add(m.def.id); g.player.stats.missions++;
    if (m.def.reward) g.economy.earn(m.def.reward, m.def.title);
    g.hud.bigMessage('MISSION PASSED', `${m.def.title}  +$${m.def.reward.toLocaleString()}`, '#f5c542'); g.audio.mission();
    g.bus.emit('missionDone', m.def.id); g.saves.save(); g.phone.pulsePost('mission', m.def.title);
    const n = this.nextStory(); if (n && !m.def.side) setTimeout(() => { g.phone.message(n.giver, `${n.blurb} (Check the map: yellow marker)`); }, 6000);
  }
  private fail(m: Ctx, why: string) {
    const g = this.g; if (this.active !== m) return;
    m.dead = true; m.cinematic(false); m.cleanup(); this.active = null; g.audio.fail();
    if (m.def.auto && !this.done.has(m.def.id)) { /* story auto-start mission retries itself */ }
    g.menus.failScreen(m.def.title, why, () => this.start(m.def.id));
  }
  abort(silent = false) { const m = this.active; if (!m) return; m.dead = true; m.waiter?.reject(new MissionFail('aborted')); m.cinematic(false); m.cleanup(); this.active = null; if (!silent) this.g.hud.toast('Mission abandoned'); }
  skip() { if (this.active) this.active.skipped = true; }
  update(dt: number) {
    const m = this.active; if (!m) return; m.t += dt;
    if (m.timer) { m.timer.left -= dt; this.g.hud.timer(m.timer.label, m.timer.left); } else this.g.hud.timer('', 0);
    const why = m.check(); if (why && m.waiter) { const w = m.waiter; m.waiter = null; w.reject(new MissionFail(why)); return; }
    const w = m.waiter; if (!w) return;
    w.tick?.(dt);
    if (w.pred()) { m.waiter = null; w.resolve(); }
  }
  onRespawn() { if (this.active) { const m = this.active; m.waiter?.reject(new MissionFail(this.g.player.mode === 'busted' ? 'You were busted' : 'You were wasted')); } }
  afterLoad() { /* nothing in-flight survives a load */ }
  /** Sitting down with the partner at a booth / couch — a relationship scene with choices. */
  async boothTalk() {
    const g = this.g; if (this.active) { g.hud.toast('Not now'); return; }
    const topics = [
      { q: 'What do we do when this is over?', a: ['Open a bar in the Keys.', 'Leave Florida. For good.', 'There is no "over" for people like us.'], d: [6, 3, -3] },
      { q: 'You still think about that night in Tampa?', a: ['Every day.', 'I try not to.', 'It was your fault, you know.'], d: [4, 2, -5] },
      { q: 'Do you trust Beto?', a: ['As far as I can throw him.', 'He\'s family.', 'I trust you. That\'s enough.'], d: [1, 0, 6] },
    ];
    const t = rng.pick(topics); g.playConversation([{ who: 'partner', text: t.q }], true);
    const i = await g.menus.choice(t.q, t.a, 0);
    g.playConversation([{ who: 'player', text: t.a[i] }, { who: 'partner', text: t.d[i] > 3 ? 'Yeah. Me too.' : t.d[i] < 0 ? '...Okay. Noted.' : 'Huh. Fair enough.' }]);
    g.bond = clamp(g.bond + t.d[i], 0, 100); g.hud.toast(`Bond ${t.d[i] >= 0 ? '+' : ''}${t.d[i]} (${g.bond}/100)`);
    g.env.setHour(g.env.hour + 0.5);
  }
  toSave() { return { done: [...this.done] }; }
  fromSave(d: any) { this.done = new Set(d.done ?? []); this.abort(true); }
}
export { dist2d, wrapAngle, nearestNode, NODES, poiById };
