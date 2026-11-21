import * as THREE from 'three';
import type { Game } from '../core/Game';
import { groundY } from '../world/CityLayout';
import { cMat } from '../actors/Humanoid';

interface Prop { kind: string; mesh: THREE.Mesh; x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; rx: number; rz: number; r: number; h: number; hp: number; explosive: boolean; home: { x: number; z: number }; moving: boolean; dead: boolean }

/** Pooled dynamic props (cones, barrels, bins, crates) that vehicles / explosions / melee can knock around. */
export class DynProps {
  props: Prop[] = [];
  group = new THREE.Group();
  private geos: Record<string, { g: THREE.BufferGeometry; m: THREE.Material; r: number; h: number }> = {};
  private spawned = new Set<string>();
  constructor(private game: Game) {
    game.env.scene.add(this.group);
    const mk = (id: string, g: THREE.BufferGeometry, color: number, r: number, h: number, rough = 0.8) => { g.translate(0, h / 2, 0); this.geos[id] = { g, m: cMat(color, rough), r, h }; };
    mk('cone', new THREE.ConeGeometry(0.25, 0.7, 8), 0xff6a1a, 0.25, 0.7);
    mk('barrel', new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), 0xb8322a, 0.3, 0.9, 0.5);
    mk('bin', new THREE.CylinderGeometry(0.32, 0.28, 0.9, 8), 0x2f5e3f, 0.32, 0.9);
    mk('crate', new THREE.BoxGeometry(0.8, 0.8, 0.8), 0x9a7a4a, 0.5, 0.8);
  }

  spawnFromSpots(spots: { x: number; z: number; kind: string }[]) {
    for (const s of spots) {
      const key = `${s.x.toFixed(1)}_${s.z.toFixed(1)}`;
      if (this.spawned.has(key)) continue; this.spawned.add(key);
      this.add(s.kind, s.x, s.z);
    }
    spots.length = 0;
  }

  add(kind: string, x: number, z: number) {
    const def = this.geos[kind]; if (!def) return;
    const mesh = new THREE.Mesh(def.g, kind === 'barrel' && Math.random() < 0.5 ? cMat(0x3a6ea5, 0.5) : def.m);
    mesh.castShadow = true;
    const p: Prop = { kind, mesh, x, y: Math.max(0, groundY(x, z)), z, vx: 0, vy: 0, vz: 0, spin: 0, rx: 0, rz: 0, r: def.r, h: def.h, hp: 20, explosive: kind === 'barrel' && Math.random() < 0.6, home: { x, z }, moving: false, dead: false };
    if (p.explosive) mesh.material = cMat(0xc0392b, 0.5);
    this.props.push(p); this.group.add(mesh); mesh.position.set(x, p.y, z);
    return p;
  }

  hit(p: Prop, dirX: number, dirZ: number, force: number) {
    p.vx += dirX * force; p.vz += dirZ * force; p.vy += force * 0.35; p.spin += (Math.random() - 0.5) * force; p.moving = true;
    if (p.kind === 'bin' || p.kind === 'crate') this.game.audio.thud();
    else this.game.audio.clang();
  }

  damage(p: Prop, amount: number) {
    p.hp -= amount;
    if (p.hp <= 0 && p.explosive && !p.dead) { p.dead = true; this.game.combat.explode(p.x, p.y, p.z, 7, 100, this.game.player, null); this.game.fx.explosion(p.x, p.y, p.z, 0.8); this.game.audio.explosion(p.x, p.y, p.z); this.remove(p); }
  }
  remove(p: Prop) { this.group.remove(p.mesh); const i = this.props.indexOf(p); if (i >= 0) this.props.splice(i, 1); }

  /** Ray test used by bullets. */
  rayHit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number) {
    let best: Prop | null = null, bt = max;
    for (const p of this.props) {
      const cx = p.x - ox, cz = p.z - oz, cy = p.y + p.h / 2 - oy;
      const t = cx * dx + cy * dy + cz * dz; if (t < 0 || t > bt) continue;
      const px = ox + dx * t - p.x, py = oy + dy * t - (p.y + p.h / 2), pz = oz + dz * t - p.z;
      if (px * px + pz * pz < p.r * p.r && Math.abs(py) < p.h / 2) { best = p; bt = t; }
    }
    return best ? { prop: best, t: bt } : null;
  }

  update(dt: number) {
    const g = this.game, px = g.player.x, pz = g.player.z;
    const vlist = g.vehicles.list;
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      const dpl = Math.hypot(p.x - px, p.z - pz);
      p.mesh.visible = dpl < 120;
      if (dpl > 260) { this.group.remove(p.mesh); this.props.splice(i, 1); this.spawned.delete(`${p.home.x.toFixed(1)}_${p.home.z.toFixed(1)}`); continue; }
      if (dpl > 130 && !p.moving) continue;
      // vehicle contact
      for (const v of vlist) {
        if (v.detail !== 'near' || v.speed < 0.8) continue;
        const dx = p.x - v.x, dz = p.z - v.z; if (dx * dx + dz * dz > (v.def.len / 2 + 1.2) ** 2) continue;
        const lx = dx * Math.cos(v.yaw) - dz * Math.sin(v.yaw), lz = dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw);
        if (Math.abs(lx) < v.def.wid / 2 + p.r && Math.abs(lz) < v.def.len / 2 + p.r) this.hit(p, v.worldVx / v.speed + (Math.random() - 0.5) * 0.4, v.worldVz / v.speed + (Math.random() - 0.5) * 0.4, v.speed * 0.9 + 2);
      }
      // player contact
      if (Math.hypot(p.x - px, p.z - pz) < p.r + 0.4 && g.player.mode === 'foot') {
        const sp = Math.hypot(g.player.vx, g.player.vz);
        if (sp > 3) { const d = Math.hypot(p.x - px, p.z - pz) || 1; this.hit(p, (p.x - px) / d, (p.z - pz) / d, sp * 0.6); }
      }
      if (!p.moving) continue;
      p.vy -= 18 * dt;
      p.x += p.vx * dt; p.z += p.vz * dt; p.y += p.vy * dt;
      const ground = g.col.supportY(p.x, p.z, 0.15, p.y + 0.5);
      if (p.y <= ground) { p.y = ground; if (p.vy < -2) p.vy *= -0.3; else p.vy = 0; const f = Math.exp(-3.5 * dt); p.vx *= f; p.vz *= f; p.spin *= f; }
      const res = g.col.resolveCircle(p.x, p.z, p.r, p.y, p.h, 0.1);
      if (res.hit) { p.x = res.x; p.z = res.z; const vn = p.vx * res.nx + p.vz * res.nz; if (vn < 0) { p.vx -= 1.5 * vn * res.nx; p.vz -= 1.5 * vn * res.nz; } }
      p.rx += p.spin * dt * (p.vz > 0 ? 1 : -1); p.rz += p.spin * dt * 0.5;
      const lay = p.kind === 'cone' || p.kind === 'bin' || p.kind === 'barrel';
      if (lay) { p.mesh.rotation.x = Math.min(Math.PI / 2, Math.abs(p.rx)) * Math.sign(p.rx || 1) * (Math.hypot(p.vx, p.vz) > 0.5 ? 1 : 0.9); p.mesh.rotation.z = p.rz * 0.3; } else p.mesh.rotation.y += p.spin * dt;
      if (Math.hypot(p.vx, p.vz) < 0.05 && Math.abs(p.vy) < 0.1 && p.y <= ground + 0.01) p.moving = false;
      p.mesh.position.set(p.x, p.y, p.z);
    }
  }
}
