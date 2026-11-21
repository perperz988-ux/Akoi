import * as THREE from 'three';
import type { Game } from '../core/Game';
import * as L from './CityLayout';
import { District } from './CityLayout';
import { Rng, hash2 } from '../core/MathUtil';
import { WEAPONS } from '../combat/Weapons';

interface Spot { id: string; x: number; z: number; kind: string; amount: number; hint: string }

/** Hidden collectibles scattered around the map: weapons, armor, cash and ammo. Walk over them to collect. */
export class Pickups {
  spots: Spot[] = [];
  collected = new Set<string>();
  private group = new THREE.Group();
  private live = new Map<string, THREE.Object3D>();
  private geo = new THREE.OctahedronGeometry(0.28);
  private t = 0;
  constructor(private g: Game) {
    g.env.scene.add(this.group);
    this.generate();
  }

  private generate() {
    const rng = new Rng(1999);
    const weapons = ['slugger', 'zap', 'rattler', 'brawler', 'longarm', 'cinder'];
    const add = (id: string, x: number, z: number, hint: string, forceKind?: string) => {
      if (L.isWater(x, z)) return;
      const r = rng.next();
      const kind = forceKind ?? (r < 0.5 ? 'weapon' : r < 0.68 ? 'armor' : r < 0.9 ? 'cash' : 'ammo');
      const wid = rng.pick(weapons);
      this.spots.push({ id, x, z, kind: kind === 'weapon' ? 'weapon:' + wid : kind, amount: kind === 'cash' ? rng.int(5, 25) * 100 : 0, hint });
    };
    for (let i = 0; i < L.N; i++) for (let j = 0; j < L.N; j++) {
      const d = L.cellDistrict(i, j), key = `${i}_${j}`;
      if (L.poiAtCell(i, j) || L.isConstructionCell(i, j)) continue;
      const lot = L.cellLot(i, j);
      if (lot.x1 - lot.x0 < 20) continue;
      const h = hash2(i, j, 4242);
      if ((d === District.Midtown || d === District.Poor) && h < 0.14) add('alley' + key, d === District.Poor ? lot.x0 + (lot.x1 - lot.x0 - 10) / 3 + 2.5 : (lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2, 'Back alley');
      else if (d === District.Park) add('park' + key, L.lineCoord(i) + 22, L.lineCoord(j) + 22, 'Park');
      else if (d === District.Rural && h < 0.12) add('rural' + key, lot.x0 + 8, lot.z0 + 8, 'Countryside');
      else if (d === District.Suburb && h < 0.06) add('sub' + key, lot.x0 + 12, lot.z0 + 12, 'Backyard');
      else if (d === District.Beach && j % 3 === 0) { const zc = L.lineCoord(j) + 50; add('pier' + key, 1252, zc, 'End of a pier', 'weapon'); }
      else if (d === District.Airport && h < 0.15) add('air' + key, L.lineCoord(i) + 30, L.lineCoord(j) + 30, 'Airfield');
      else if (d === District.Industrial && h < 0.1) add('ind' + key, lot.x0 + 3, lot.z1 - 3, 'Industrial yard');
    }
    add('island', 1300, -420, 'Coral Key shoreline', 'weapon');
    add('marinaEnd', 1232, 747, 'Marina dock', 'weapon');
  }

  private makeMesh(s: Spot) {
    const col = s.kind.startsWith('weapon') ? 0xff5a4d : s.kind === 'armor' ? 0x38bdf8 : s.kind === 'cash' ? 0x4ade80 : 0xffd166;
    const m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: col }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, depthWrite: false }));
    const o = new THREE.Group(); o.add(m, halo); return o;
  }

  update(dt: number) {
    const g = this.g, p = g.player; this.t += dt;
    if (g.interiors.active) return;
    for (const s of this.spots) {
      if (this.collected.has(s.id)) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      let o = this.live.get(s.id);
      if (d < 55) {
        if (!o) { o = this.makeMesh(s); this.group.add(o); this.live.set(s.id, o); o.userData.y = g.col.supportY(s.x, s.z, 0.3, 1.5); }
        o.position.set(s.x, o.userData.y + 0.9 + Math.sin(this.t * 2 + s.x) * 0.12, s.z); o.rotation.y = this.t * 1.6;
        if (d < 1.7 && Math.abs(p.y - o.userData.y) < 2.5 && !p.inVehicle) this.collect(s);
      } else if (o) { this.group.remove(o); this.live.delete(s.id); }
    }
  }

  private collect(s: Spot) {
    const g = this.g, p = g.player;
    this.collected.add(s.id);
    const o = this.live.get(s.id); if (o) { this.group.remove(o); this.live.delete(s.id); }
    if (s.kind.startsWith('weapon:')) {
      const id = s.kind.slice(7), w = WEAPONS[id], had = p.loadout.owned.includes(id);
      p.giveWeapon(id, w.kind === 'throw' ? 3 : w.mag * 2);
      g.hud.toast(had ? `Found ammo for ${w.name}` : `Hidden weapon found: ${w.name}`, 3.5);
    } else if (s.kind === 'armor') { p.armor = Math.min(100, p.armor + 50); g.hud.toast('Hidden body armor found', 3); }
    else if (s.kind === 'cash') { g.economy.addCash(s.amount, 'Hidden cash'); g.hud.toast('Hidden cash stash found', 3); }
    else { for (const id of p.loadout.owned) if (WEAPONS[id].kind === 'ranged') p.addAmmo(id, WEAPONS[id].mag); g.hud.toast('Hidden ammo crate found', 3); }
    g.audio.cash();
  }
  toSave() { return [...this.collected]; }
  fromSave(a: string[] | undefined) { this.collected = new Set(a ?? []); for (const [, o] of this.live) this.group.remove(o); this.live.clear(); }
}
