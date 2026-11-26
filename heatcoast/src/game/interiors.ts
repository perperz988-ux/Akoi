import * as THREE from 'three';
import type { Game } from './game';
import { Poi } from '../world/layout';
import { Actor } from '../actors/actor';
import { randomLook } from '../actors/humanoid';
import { mat } from '../render/materials';
import { rng } from '../core/math';

const IY = -300;
type Kind = 'store' | 'diner' | 'apartment';
interface Room { kind: Kind; group: THREE.Group; x0: number; x1: number; z0: number; z1: number; h: number; spots: { x: number; z: number; label: string; run: () => void }[]; boxes: { x0: number; x1: number; z0: number; z1: number }[]; clerk?: Actor; door: { x: number; z: number } }

/** Enterable interiors (convenience store / gun shop / boutique, diner, safehouse apartment). */
export class Interiors {
  active: { poi: Poi; room: Room } | null = null;
  constructor(private g: Game) {}

  private floorTex(kind: Kind) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d')!;
    if (kind === 'diner') { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#eee'; c.fillRect(i * 32, j * 32, 32, 32); } }
    else if (kind === 'apartment') { c.fillStyle = '#8a6440'; c.fillRect(0, 0, 256, 256); for (let i = 0; i < 16; i++) { c.fillStyle = `rgba(${60 + Math.random() * 40},${40 + Math.random() * 20},20,0.35)`; c.fillRect(0, i * 16, 256, 15); } }
    else { c.fillStyle = '#d8d4cc'; c.fillRect(0, 0, 256, 256); c.strokeStyle = '#b8b4ac'; for (let i = 0; i <= 256; i += 64) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 256); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(256, i); c.stroke(); } }
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  private build(p: Poi): Room {
    const kind: Kind = p.interior ?? 'store';
    const g = new THREE.Group(); g.position.y = IY;
    const W = kind === 'apartment' ? 12 : 16, D = kind === 'apartment' ? 10 : 12, H = 3.4;
    const room: Room = { kind, group: g, x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2, h: H, spots: [], boxes: [], door: { x: 0, z: D / 2 - 0.8 } };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, solid = true) => { const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; g.add(me); if (solid && h > 0.5) room.boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }); return me; };
    const floorM = new THREE.MeshStandardMaterial({ map: this.floorTex(kind), roughness: kind === 'diner' ? 0.25 : 0.6 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floorM); floor.receiveShadow = true; g.add(floor);
    const wallC = kind === 'diner' ? 0xe8c8c0 : kind === 'apartment' ? 0xece6da : p.kind === 'gunshop' ? 0x5a6066 : p.kind === 'clothes' ? 0xf4f0ea : 0xe8ece8;
    const wm = mat(wallC, 0.9);
    box(W, H, 0.2, 0, H / 2, -D / 2, wm, false); box(0.2, H, D, -W / 2, H / 2, 0, wm, false); box(0.2, H, D, W / 2, H / 2, 0, wm, false);
    box(W / 2 - 1.2, H, 0.2, -W / 4 - 0.6, H / 2, D / 2, wm, false); box(W / 2 - 1.2, H, 0.2, W / 4 + 0.6, H / 2, D / 2, wm, false); box(2.4, 0.8, 0.2, 0, H - 0.4, D / 2, wm, false);
    const glassDoor = new THREE.Mesh(new THREE.PlaneGeometry(2.4, H - 0.8), new THREE.MeshStandardMaterial({ color: 0x9ac8e0, transparent: true, opacity: 0.35, roughness: 0.05, emissive: new THREE.Color(0x8ab0c8), emissiveIntensity: this.g.env.night > 0.5 ? 0.05 : 0.8 })); glassDoor.position.set(0, (H - 0.8) / 2, D / 2 - 0.05); glassDoor.rotation.y = Math.PI; g.add(glassDoor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), mat(0xf4f4f0, 0.95)); ceil.position.y = H; g.add(ceil);
    // lighting
    g.add(new THREE.HemisphereLight(0xfff6e8, 0x6a6054, kind === 'apartment' ? 0.6 : 0.9));
    const lightC = kind === 'apartment' ? 0xffd8a0 : kind === 'diner' ? 0xffe8c8 : 0xf4fbff;
    for (const x of [-W / 4, W / 4]) { const l = new THREE.PointLight(lightC, kind === 'apartment' ? 18 : 26, 14, 1.6); l.position.set(x, H - 0.3, 0); g.add(l); const tube = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.25), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(lightC), emissiveIntensity: 3 })); tube.position.set(x, H - 0.04, 0); g.add(tube); }
    const exit = () => this.leave();
    room.spots.push({ x: 0, z: D / 2 - 0.9, label: 'Leave', run: exit });
    if (kind === 'store') {
      const counter = box(4, 1.05, 1, -W / 2 + 3, 0.52, -D / 2 + 2.2, mat(0x6a4a32, 0.5)); void counter; box(4, 0.06, 1.1, -W / 2 + 3, 1.08, -D / 2 + 2.2, mat(0x2a2a2a, 0.3), false);
      box(0.4, 0.3, 0.35, -W / 2 + 2, 1.26, -D / 2 + 2.1, mat(0x222222, 0.4), false); // register
      const shelfC = p.kind === 'gunshop' ? 0x2a2e33 : p.kind === 'clothes' ? 0xd8d0c4 : 0xeeeeee;
      for (let i = 0; i < 3; i++) { const x = -1 + i * 3.2; box(0.8, 1.8, 6, x, 0.9, 0.5, mat(shelfC, 0.6)); for (let s = 0; s < 3; s++) for (let k = 0; k < 10; k++) { const pc = p.kind === 'gunshop' ? 0x1a1c1e : p.kind === 'clothes' ? rng.pick([0xc0392b, 0x2a3f5f, 0xf2f2f2, 0x1c1c1e, 0xe8c070]) : rng.pick([0xe84a3a, 0x3a8ae8, 0xf2c030, 0x4ab04a, 0xf2f2f2, 0xe87a2a]); box(0.3, 0.28, 0.45, x + (k % 2 ? 0.25 : -0.25), 0.4 + s * 0.6, -2.2 + k * 0.6, mat(pc, 0.5), false); } }
      if (p.kind !== 'gunshop' && p.kind !== 'clothes') { for (let k = 0; k < 4; k++) { box(1.4, 2.2, 0.8, W / 2 - 1, 1.1, -D / 2 + 1.2 + k * 1.5, new THREE.MeshStandardMaterial({ color: 0xcfe8f4, emissive: new THREE.Color(0x9ad0ff), emissiveIntensity: 0.5, roughness: 0.1, transparent: true, opacity: 0.85 })); } }
      if (p.kind === 'gunshop') { for (let k = 0; k < 6; k++) { const gun = box(1.0, 0.12, 0.06, -W / 2 + 1.5 + k * 1.4, 2.2, -D / 2 + 0.15, mat(0x1a1c1e, 0.3, 0.8), false); void gun; } box(3, 0.9, 0.8, 3, 0.45, -D / 2 + 1.5, new THREE.MeshStandardMaterial({ color: 0x9ab0c0, transparent: true, opacity: 0.4, roughness: 0.05 })); }
      const clerk = new Actor(randomLook(() => rng.next(), 'civ')); clerk.name = rng.pick(['Raj', 'Darlene', 'Mike', 'Yesenia', 'Tom']); clerk.faction = 'civ';
      clerk.placeAt(-W / 2 + 3, -D / 2 + 1.2, 0); clerk.room = { y: IY, x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2, boxes: [] }; clerk.y = IY; clerk.ai = { story: true, invulnerable: false, cash: 300 };
      room.clerk = clerk;
      room.spots.push({ x: -W / 2 + 3, z: -D / 2 + 3.2, label: p.kind === 'gunshop' ? 'Browse weapons' : p.kind === 'clothes' ? 'Try on outfits' : 'Buy something', run: () => this.g.economy.openPoiMenu(p) });
      room.spots.push({ x: -W / 2 + 3, z: -D / 2 + 3.25, label: 'Rob the register', run: () => this.rob(p) });
    } else if (kind === 'diner') {
      box(7, 1.05, 0.8, -1, 0.52, -D / 2 + 2, mat(0xd8d0c8, 0.3)); box(7, 0.06, 0.9, -1, 1.08, -D / 2 + 2, mat(0xc0392b, 0.3), false);
      for (let k = 0; k < 6; k++) { const st = box(0.4, 0.75, 0.4, -4 + k * 1.2, 0.38, -D / 2 + 2.9, mat(0xc0392b, 0.4), false); void st; }
      for (let k = 0; k < 3; k++) { const z = -1 + k * 2.4; box(1.6, 0.06, 1, W / 2 - 2.2, 0.75, z, mat(0xf2f2f2, 0.3)); box(0.5, 1.1, 1.1, W / 2 - 3.4, 0.55, z, mat(0x8a1a1a, 0.5)); box(0.5, 1.1, 1.1, W / 2 - 1.0, 0.55, z, mat(0x8a1a1a, 0.5)); }
      const juke = box(1, 1.6, 0.6, -W / 2 + 0.8, 0.8, 2, new THREE.MeshStandardMaterial({ color: 0x8a3a8a, emissive: new THREE.Color(0xff60c0), emissiveIntensity: 1.2 })); void juke;
      const clerk = new Actor(randomLook(() => rng.next(), 'civ')); clerk.name = 'Dolores'; clerk.placeAt(-1, -D / 2 + 1.1, 0); clerk.room = { y: IY, x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2, boxes: [] }; clerk.ai = { story: true };
      room.clerk = clerk;
      room.spots.push({ x: -1, z: -D / 2 + 3.0, label: 'Order food', run: () => this.g.economy.openPoiMenu(p) });
      room.spots.push({ x: W / 2 - 2.2, z: 0.4, label: 'Sit with your partner', run: () => this.g.missions.boothTalk() });
    } else {
      // safehouse apartment / motel room
      box(2.2, 0.55, 2.8, -W / 2 + 1.6, 0.28, -D / 2 + 2, mat(0xf2ece0, 0.9)); box(2.2, 0.9, 0.2, -W / 2 + 1.6, 0.6, -D / 2 + 0.6, mat(0x5a3a22, 0.6)); box(0.9, 0.18, 0.5, -W / 2 + 1.1, 0.64, -D / 2 + 1.1, mat(0xffffff, 0.9), false); box(0.9, 0.18, 0.5, -W / 2 + 2.1, 0.64, -D / 2 + 1.1, mat(0xffffff, 0.9), false);
      box(2.6, 0.8, 0.9, 2, 0.4, 1.4, mat(0x3a4a6a, 0.8)); box(2.6, 0.8, 0.25, 2, 0.75, 1.85, mat(0x3a4a6a, 0.8), false);
      box(1.8, 1.0, 0.1, 2, 1.4, -D / 2 + 0.2, new THREE.MeshStandardMaterial({ color: 0x050505, emissive: new THREE.Color(0x2a4a8a), emissiveIntensity: 0.8, roughness: 0.2 }), false); box(2, 0.5, 0.5, 2, 0.25, -D / 2 + 0.4, mat(0x3a2a1a, 0.6));
      box(3, 0.9, 0.7, W / 2 - 1.6, 0.45, 3.5, mat(0xe8e8e8, 0.4)); box(1, 1.9, 0.7, W / 2 - 0.6, 0.95, 1.6, mat(0xdddddd, 0.3, 0.5));
      box(1.2, 0.05, 1.8, 0, 0.02, -0.5, mat(0x8a2a2a, 1), false);
      // window with city view glow
      const win = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.6), new THREE.MeshStandardMaterial({ color: 0x223344, emissive: new THREE.Color(this.g.env.night > 0.5 ? 0x334466 : 0xb8d8f0), emissiveIntensity: 1 })); win.position.set(-W / 2 + 0.12, 1.8, 2); win.rotation.y = Math.PI / 2; g.add(win);
      room.spots.push({ x: -W / 2 + 1.6, z: -D / 2 + 3.7, label: 'Sleep & save', run: () => this.g.economy.sleep(8) });
      room.spots.push({ x: W / 2 - 0.6, z: 2.4, label: 'Wardrobe', run: () => this.g.economy.openPoiMenu({ ...p, kind: 'clothes', name: 'Wardrobe' }) });
      room.spots.push({ x: 2, z: 0.4, label: 'Sit with your partner', run: () => this.g.missions.boothTalk() });
    }
    return room;
  }
  enter(p: Poi) {
    const g = this.g; if (this.active) return;
    g.hud.fade(true).then(() => {
      const room = this.build(p); g.scene.add(room.group);
      this.active = { poi: p, room };
      const r = { y: IY, x0: room.x0, x1: room.x1, z0: room.z0, z1: room.z1, boxes: room.boxes };
      g.player.room = r; g.player.placeAt(0, room.z1 - 1.6, Math.PI); g.player.y = IY;
      if (!g.partner.dead) { g.partner.room = r; g.partner.placeAt(1.2, room.z1 - 1.8, Math.PI); g.partner.y = IY; }
      if (room.clerk) { g.scene.add(room.clerk.group); room.clerk.y = IY; }
      g.world.group.visible = false; g.water.mesh.visible = false;
      for (const v of g.vehicles.list) v.root.visible = false; for (const a of g.peds.list) a.group.visible = false;
      g.cam.snapBehind(Math.PI); g.cam.pitch = 0.25;
      g.hud.toast(p.name);
      g.hud.fade(false);
    });
  }
  leave(instant = false) {
    const g = this.g; const a = this.active; if (!a) return;
    const go = () => {
      a.room.group.removeFromParent(); a.room.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
      if (a.room.clerk) { a.room.clerk.group.removeFromParent(); a.room.clerk.dispose(); }
      this.active = null; g.player.room = null; g.partner.room = null;
      const p = a.poi; g.player.placeAt(p.door.x + Math.sin(p.face) * 1.2, p.door.z + Math.cos(p.face) * 1.2, p.face); if (!g.partner.dead) g.partner.placeAt(p.door.x + Math.sin(p.face) * 1.5 + Math.cos(p.face), p.door.z + Math.cos(p.face) * 1.5 - Math.sin(p.face), p.face);
      g.world.group.visible = true; g.water.mesh.visible = true; g.cam.snapBehind(p.face);
    };
    if (instant) { go(); return; }
    g.hud.fade(true).then(() => { go(); g.hud.fade(false); });
  }
  private rob(p: Poi) {
    const g = this.g, P = g.player, c = this.active?.room.clerk; if (!c || c.dead) { g.hud.toast('Nobody to rob'); return; }
    if (g.combat.def(P.weapon).kind !== 'gun' || !P.aiming) { g.hud.toast('Aim a gun at the clerk to rob the store'); return; }
    const take = 400 + rng.int(0, 900); c.pose = 'cower'; g.bubble(c, 'Okay, okay! Take it!');
    g.economy.earn(take, `Robbed ${p.name}`); g.police.report(2, p.door.x, p.door.z, null, true); g.police.lastSeen = { x: p.door.x, z: p.door.z }; if (c.ai) c.ai.cash = 0;
    g.phone.pulsePost('robbery', p.name);
  }
  update(dt: number) {
    const a = this.active; if (!a) return; const g = this.g;
    if (a.room.clerk) { const c = a.room.clerk; c.hum.lookAt = new THREE.Vector3(g.player.x, g.player.y + 1.6, g.player.z); if (c.pose !== 'cower') c.pose = 'idle'; c.yaw = Math.atan2(g.player.x - c.x, g.player.z - c.z) * 0.5; c.integrate(dt); c.sync(dt); }
    if (g.player.z > a.room.z1 - 0.6) this.leave();
  }
  private nearest() { const a = this.active; if (!a) return null; const P = this.g.player; let best: Room['spots'][0] | null = null, bd = 1.7; for (const s of a.room.spots) { const d = Math.hypot(s.x - P.x, s.z - P.z); if (d < bd) { bd = d; best = s; } } return best; }
  label() { const s = this.nearest(); if (!s) return null; if (s.label === 'Rob the register') return this.g.player.aiming ? 'Rob the register' : null; return s.label; }
  interact() { const s = this.nearest(); if (!s) return false; if (s.label === 'Rob the register' && !this.g.player.aiming) { const o = this.active!.room.spots.find((x) => x.label !== 'Rob the register' && x.label !== 'Leave' && Math.hypot(x.x - s.x, x.z - s.z) < 0.2); o?.run(); return true; } s.run(); return true; }
  get room() { const a = this.active?.room; return a ? { x0: a.x0, x1: a.x1, z0: a.z0, z1: a.z1, y: IY, h: a.h } : undefined; }
}
