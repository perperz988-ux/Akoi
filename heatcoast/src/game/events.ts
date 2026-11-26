import * as THREE from 'three';
import type { Game } from './game';
import { Actor } from '../actors/actor';
import { randomLook } from '../actors/humanoid';
import { rng } from '../core/math';
import { zoneAt, Zone, NODES } from '../world/layout';

/** Random street encounters that make the county feel alive. */
export class Events {
  private t = 50; active: { kind: string; actors: Actor[]; t: number; x: number; z: number; done?: boolean } | null = null;
  constructor(private g: Game) {}
  update(dt: number) {
    const g = this.g; if (g.missions.active) return;
    if (this.active) { this.tick(dt); return; }
    this.t -= dt; if (this.t > 0) return; this.t = 70 + rng.next() * 90;
    const P = g.player; const n = g.peds.randomNodeNear(P.x, P.z, 50, 110); if (!n) return;
    const zone = zoneAt(n.x, n.z);
    const opts = ['mugging', 'thief', 'stranded', 'gangfight', 'busker', 'proposal'].filter((k) => !(k === 'gangfight' && (zone === Zone.Resort || zone === Zone.Suburb)));
    this.start(rng.pick(opts), n.x + n.hw + 2, n.z + n.hw + 2);
  }
  private spawn(x: number, z: number, style: any = 'civ', faction: any = 'civ', name = 'Stranger') { const a = new Actor(randomLook(() => rng.next(), style)); a.name = name; a.faction = faction; a.placeAt(x, z); a.hp = a.maxHp = 80; a.ai = { story: true, cash: rng.int(40, 200), state: 'idle', t: 0 }; this.g.peds.addActor(a); return a; }
  private start(kind: string, x: number, z: number) {
    const g = this.g; const actors: Actor[] = [];
    if (kind === 'mugging') { const v = this.spawn(x, z, 'rich', 'civ', 'Victim'); const m = this.spawn(x + 1.2, z, 'gang', 'enemy', 'Mugger'); m.equip('pistol'); m.ammo.pistol = 99; v.pose = 'cower'; actors.push(v, m); g.phone.notify('Pulse', 'Someone is getting mugged nearby!'); }
    if (kind === 'thief') { const t = this.spawn(x, z, 'gang', 'enemy', 'Purse Snatcher'); t.ai.cash = 600; actors.push(t); const vic = this.spawn(x - 3, z, 'civ', 'civ', 'Victim'); actors.push(vic); g.bubble(vic, 'Stop! Thief! He took my bag!'); }
    if (kind === 'stranded') { const s = this.spawn(x, z, 'civ', 'civ', 'Stranded Driver'); actors.push(s); const v = g.vehicles.spawn('bolt', x + 3, z + 2, rng.next() * 6, 0x8a8f94, 'mission'); v.health = 260; v.physics = true; v.ai = null; g.bubble(s, 'Hey! Can you help me? My car died.'); }
    if (kind === 'gangfight') { for (let i = 0; i < 4; i++) { const a = this.spawn(x + (i % 2 ? 8 : -8), z + i * 1.5, 'gang', 'gang', i % 2 ? 'Kings' : 'Saints'); a.equip(rng.pick(['pistol', 'smg'])); a.ammo[a.weapon] = 999; a.ai.side = i % 2; actors.push(a); } }
    if (kind === 'busker') { const b = this.spawn(x, z, 'civ', 'civ', 'Street Musician'); b.ai.dance = true; actors.push(b); }
    if (kind === 'proposal') { const a = this.spawn(x, z, 'rich', 'civ', 'Nervous Guy'), b = this.spawn(x + 1.4, z, 'beach', 'civ', 'Girlfriend'); actors.push(a, b); }
    this.active = { kind, actors, t: 0, x, z };
  }
  private tick(dt: number) {
    const g = this.g, e = this.active!, P = g.player; e.t += dt;
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    const end = (reward = 0, msg = '') => { if (reward) { g.economy.earn(reward, 'Good deed'); } if (msg) g.hud.toast(msg); e.done = true; };
    if (e.kind === 'mugging') { const [v, m] = e.actors; if (!e.done) { m.yaw = Math.atan2(v.x - m.x, v.z - m.z); m.aiming = true; m.pose = 'aim'; if (Math.random() < dt * 0.3) g.bubble(m, rng.pick(['Wallet. NOW.', 'Don\'t make me do this!'])); if (m.dead) { g.bubble(v, 'Thank you! Here, take this!'); end(250, 'You stopped a mugging (+$250)'); g.phone.pulsePost('hero'); } else if (d < 12 && e.t > 3) { m.faction = 'enemy'; m.ai.brain = (a: Actor, dt2: number) => this.hostileBrain(a, dt2); } } }
    if (e.kind === 'thief') { const [t] = e.actors; if (!e.done) { if (t.ai.state !== 'run') { t.ai.state = 'run'; t.ai.brain = (a: Actor, dt2: number) => { const away = Math.atan2(a.x - P.x, a.z - P.z); g.peds.walkTo(a, a.x + Math.sin(away) * 8, a.z + Math.cos(away) * 8, 5.4, dt2); }; } if (t.dead || t.knockT > 0) { g.pickups.dropCash(t.x, t.z, 300); end(0, 'Grab the stolen cash!'); } } }
    if (e.kind === 'stranded') { const [s] = e.actors; if (!e.done && d < 3 && g.input.peek('interact')) { g.input.consume('interact'); g.bubble(s, 'You\'re a lifesaver!'); end(120, 'Helped a stranded driver (+$120)'); } }
    if (e.kind === 'gangfight') { if (!e.done) for (const a of e.actors) { if (a.dead) continue; const foe = e.actors.find((b) => !b.dead && b.ai.side !== a.ai.side); if (!foe) { end(); break; } a.ai.brain = (x: Actor, dt2: number) => { const f = e.actors.find((b) => !b.dead && b.ai.side !== x.ai.side); if (!f) return; const dd = Math.hypot(f.x - x.x, f.z - x.z); x.yaw = Math.atan2(f.x - x.x, f.z - x.z); x.aiming = true; x.pose = 'aim'; if (dd > 14) g.peds.walkTo(x, f.x, f.z, 3, dt2); else g.peds.stop(x, dt2); x.fireCd -= dt2; if (x.fireCd <= 0) { x.fireCd = 0.8 + Math.random(); g.combat.actorShoot(x, new THREE.Vector3(f.x, f.y + 1.2, f.z), 0.35); } if (x.ai.hostile) this.hostileBrain(x, dt2); }; } }
    if (e.kind === 'busker') { const [b] = e.actors; b.pose = 'dance'; if (d < 3 && g.input.peek('interact')) { g.input.consume('interact'); if (g.economy.spend(5, 'Tip')) { g.bubble(b, 'Gracias, amigo!'); g.bond += 1; } } }
    if (e.kind === 'proposal') { const [a, b] = e.actors; a.pose = 'sit'; b.hum.lookAt = new THREE.Vector3(a.x, a.y + 1, a.z); if (e.t > 6 && e.t < 6.1) { g.bubble(b, 'YES! Oh my God, YES!'); g.partner.say('Aww. Don\'t get any ideas.'); } }
    if (e.t > 120 || d > 220 || (e.done && e.t > 20)) { for (const a of e.actors) if (!a.dead) { a.ai.story = false; a.ai.brain = null; a.ai.state = 'walk'; a.faction = a.faction === 'enemy' ? 'civ' : a.faction; } this.active = null; }
  }
  hostileBrain(a: Actor, dt: number) {
    const g = this.g, P = g.player; const d = Math.hypot(P.x - a.x, P.z - a.z);
    a.yaw = Math.atan2(P.x - a.x, P.z - a.z); a.aiming = true; a.pose = 'aim';
    if (d > 16) g.peds.walkTo(a, P.x, P.z, 3.5, dt); else g.peds.stop(a, dt);
    a.fireCd -= dt; if (a.fireCd <= 0 && d < 35 && g.lineOfSight(a.x, a.y + 1.5, a.z, P.x, P.y + 1.2, P.z)) { a.fireCd = 0.7 + Math.random() * 0.8; g.combat.actorShoot(a, new THREE.Vector3(P.x, P.y + 1.1, P.z), 0.35); }
  }
  nodes = NODES;
}
