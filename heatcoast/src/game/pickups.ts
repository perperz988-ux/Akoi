import * as THREE from 'three';
import type { Game } from './game';
import { heightAt } from '../world/layout';

interface Pick { mesh: THREE.Object3D; x: number; z: number; kind: 'cash' | 'health' | 'armor' | 'ammo'; amount: number; t: number }
/** World pickups: dropped cash, health, armour, ammo. */
export class Pickups {
  list: Pick[] = [];
  private cashM = new THREE.MeshStandardMaterial({ color: 0x3a8a3a, emissive: new THREE.Color(0x1a6a1a), emissiveIntensity: 0.6, roughness: 0.6 });
  constructor(private g: Game) {}
  drop(kind: Pick['kind'], x: number, z: number, amount: number) {
    const geo = kind === 'cash' ? new THREE.BoxGeometry(0.18, 0.05, 0.08) : new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const m = kind === 'cash' ? this.cashM : new THREE.MeshStandardMaterial({ color: kind === 'health' ? 0xe84040 : kind === 'armor' ? 0x4060e8 : 0xc8a050, emissive: new THREE.Color(kind === 'health' ? 0x801010 : 0x202060), emissiveIntensity: 0.6 });
    const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, heightAt(x, z) + 0.15, z); this.g.scene.add(mesh);
    this.list.push({ mesh, x, z, kind, amount, t: 0 });
  }
  dropCash(x: number, z: number, n: number) { this.drop('cash', x + (Math.random() - 0.5), z + (Math.random() - 0.5), n); }
  clear() { for (const p of this.list) p.mesh.removeFromParent(); this.list = []; }
  update(dt: number) {
    const P = this.g.player;
    for (const p of [...this.list]) {
      p.t += dt; p.mesh.rotation.y += dt * 2; p.mesh.position.y = heightAt(p.x, p.z) + 0.25 + Math.sin(p.t * 3) * 0.06;
      if (!P.vehicle && Math.hypot(p.x - P.x, p.z - P.z) < 1.2 && Math.abs(P.y - p.mesh.position.y) < 2) {
        if (p.kind === 'cash') this.g.economy.earn(p.amount, 'Picked up cash');
        if (p.kind === 'health') P.hp = Math.min(P.maxHp, P.hp + p.amount);
        if (p.kind === 'armor') P.armor = Math.min(100, P.armor + p.amount);
        if (p.kind === 'ammo') { P.ammo[P.weapon] = (P.ammo[P.weapon] ?? 0) + p.amount; }
        p.mesh.removeFromParent(); this.list.splice(this.list.indexOf(p), 1);
      } else if (p.t > 120) { p.mesh.removeFromParent(); this.list.splice(this.list.indexOf(p), 1); }
    }
  }
}
