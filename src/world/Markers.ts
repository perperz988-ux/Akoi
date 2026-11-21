import * as THREE from 'three';
import type { Game } from '../core/Game';
import * as L from '../world/CityLayout';
import { POIS } from '../world/CityLayout';

export interface Blip { x: number; z: number; color: string; label: string; kind: string; icon?: string; always?: boolean; pulse?: boolean; id?: string; radius?: number }

const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];

/** World markers (3D rings/beams), minimap blips, waypoint and GPS route. */
export class Markers {
  group = new THREE.Group();
  private pool: { ring: THREE.Mesh; beam: THREE.Mesh; mat: THREE.MeshBasicMaterial; bmat: THREE.MeshBasicMaterial; used: boolean }[] = [];
  waypoint: { x: number; z: number } | null = null;
  discovered = new Set<string>();
  extra: Blip[] = [];            // mission & event blips
  tips: Blip[] = [];
  route: { x: number; z: number }[] = [];
  private routeT = 0;
  private shutters = new Map<string, THREE.Mesh>();
  private revealed = new Set<string>();
  private objectiveMarkers: { x: number; z: number; color: number; radius: number; id: string }[] = [];

  constructor(private g: Game) {
    g.env.scene.add(this.group);
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 28).rotateX(-Math.PI / 2), mat);
      const bmat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 14, 1, true), bmat);
      ring.visible = beam.visible = false; this.group.add(ring, beam);
      this.pool.push({ ring, beam, mat, bmat, used: false });
    }
  }

  setWaypoint(x: number, z: number) { this.waypoint = { x, z }; this.routeT = 0; this.g.hud?.toast('Waypoint set'); }
  clearWaypoint() { this.waypoint = null; this.route = []; }
  revealPoi(id: string) { this.revealed.add(id); this.discovered.add(id); }
  revealRandomTip() {
    const g = this.g;
    const c = g.missions.availableSideTips();
    if (c) { this.tips.push(c); g.hud?.toast('New lead marked on the map'); }
    else g.hud?.toast('Nothing new — the regulars are quiet');
  }
  setObjectiveMarkers(list: { x: number; z: number; color: number; radius: number; id: string }[]) { this.objectiveMarkers = list; }

  blips(): Blip[] {
    const g = this.g, out: Blip[] = [];
    for (const p of POIS) {
      const always = ['hospital', 'police', 'safehouse', 'dealer', 'garage', 'airport', 'marina'].includes(p.kind);
      const seen = this.discovered.has(p.id) || this.revealed.has(p.id);
      if (!always && !seen) continue;
      const open = g.economy.isOpen(p);
      out.push({ x: p.x, z: p.z, color: open ? p.color : '#666', label: p.name, kind: p.kind, id: p.id });
    }
    out.push(...this.g.missions.startBlips());
    out.push(...this.extra, ...this.tips);
    if (this.waypoint) out.push({ x: this.waypoint.x, z: this.waypoint.z, color: '#ff4d6d', label: 'Waypoint', kind: 'waypoint', pulse: true });
    return out;
  }

  private acquire() { const s = this.pool.find((p) => !p.used); if (s) s.used = true; return s; }

  update(dt: number) {
    const g = this.g, p = g.player, t = g.time;
    // discover POIs
    for (const poi of POIS) if (!this.discovered.has(poi.id) && Math.hypot(poi.x - p.x, poi.z - p.z) < 120) { this.discovered.add(poi.id); if (!['safehouse', 'hospital', 'police'].includes(poi.kind)) g.hud?.toast(`Discovered: ${poi.name}`); }
    for (const s of this.pool) { s.used = false; s.ring.visible = s.beam.visible = false; }
    if (g.interiors.active) return;
    // door markers
    for (const poi of POIS) {
      const d = Math.hypot(poi.x - p.x, poi.z - p.z);
      if (d > 70 || p.inVehicle && d > 40) { const sh = this.shutters.get(poi.id); if (sh && d > 160) { this.group.remove(sh); this.shutters.delete(poi.id); } continue; }
      const open = g.economy.isOpen(poi);
      const s = this.acquire(); if (!s) break;
      const col = new THREE.Color(open ? poi.color : '#884444');
      s.mat.color.copy(col); s.bmat.color.copy(col);
      s.ring.position.set(poi.x, Math.max(0.1, L.groundY(poi.x, poi.z)) + 0.15, poi.z); s.ring.scale.setScalar(1.1 + Math.sin(t * 3) * 0.06); s.ring.visible = true;
      s.beam.position.set(poi.x, 20, poi.z); s.beam.scale.set(0.6, 1, 0.6); s.beam.visible = open;
      // closed shutter
      let sh = this.shutters.get(poi.id);
      if (!open && !sh && d < 120) {
        sh = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.2), new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.5, metalness: 0.6 }));
        sh.position.set(poi.x, 1.5, poi.z - 1.5); this.group.add(sh); this.shutters.set(poi.id, sh);
      } else if (open && sh) { this.group.remove(sh); this.shutters.delete(poi.id); }
    }
    // objective markers
    for (const m of this.objectiveMarkers) {
      const s = this.acquire(); if (!s) break;
      s.mat.color.setHex(m.color); s.bmat.color.setHex(m.color);
      s.ring.position.set(m.x, Math.max(0.1, L.groundY(m.x, m.z)) + 0.2, m.z); s.ring.scale.setScalar(m.radius * (1 + Math.sin(t * 4) * 0.04)); s.ring.visible = true;
      s.beam.position.set(m.x, 22, m.z); s.beam.scale.set(m.radius * 0.7, 1.2, m.radius * 0.7); s.beam.visible = true;
    }
    if (this.waypoint) {
      const s = this.acquire();
      if (s) { s.mat.color.setHex(0xff4d6d); s.bmat.color.setHex(0xff4d6d); s.ring.position.set(this.waypoint.x, Math.max(0.1, L.groundY(this.waypoint.x, this.waypoint.z)) + 0.2, this.waypoint.z); s.ring.scale.setScalar(2.4); s.ring.visible = true; s.beam.position.set(this.waypoint.x, 40, this.waypoint.z); s.beam.scale.set(1.8, 2, 1.8); s.beam.visible = true; }
      if (Math.hypot(this.waypoint.x - p.x, this.waypoint.z - p.z) < 8) this.clearWaypoint();
      this.routeT -= dt;
      if (this.routeT <= 0) { this.routeT = 2.5; this.computeRoute(); }
    } else this.route = [];
  }

  /** BFS over road lattice for the GPS line. */
  private computeRoute() {
    const g = this.g, wp = this.waypoint; if (!wp) return;
    const si = Math.round((g.player.x + L.HALF) / L.CELL), sj = Math.round((g.player.z + L.HALF) / L.CELL);
    const ti = Math.round((wp.x + L.HALF) / L.CELL), tj = Math.round((wp.z + L.HALF) / L.CELL);
    const N = L.N + 1;
    const key = (i: number, j: number) => i * N + j;
    const prev = new Map<number, number>(); const dist = new Map<number, number>();
    const open: [number, number, number][] = [[Math.hypot(si - ti, sj - tj), si, sj]];
    dist.set(key(si, sj), 0);
    let found = false;
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [, i, j] = open.shift()!;
      if (i === ti && j === tj) { found = true; break; }
      for (let d = 0; d < 4; d++) {
        const ok = d === 0 ? L.hSegment(i, j) : d === 1 ? L.vSegment(i, j) : d === 2 ? L.hSegment(i - 1, j) : L.vSegment(i, j - 1);
        if (!ok) continue; const ni = i + DX[d], nj = j + DZ[d]; if (ni < 0 || nj < 0 || ni > L.N || nj > L.N) continue;
        const nd = dist.get(key(i, j))! + 1;
        if (nd < (dist.get(key(ni, nj)) ?? 1e9)) { dist.set(key(ni, nj), nd); prev.set(key(ni, nj), key(i, j)); open.push([nd + Math.hypot(ni - ti, nj - tj), ni, nj]); }
      }
      if (dist.size > 1500) break;
    }
    const pts: { x: number; z: number }[] = [{ x: wp.x, z: wp.z }];
    if (found) { let k = key(ti, tj); while (k !== key(si, sj)) { pts.push({ x: L.lineCoord(Math.floor(k / N)), z: L.lineCoord(k % N) }); k = prev.get(k)!; } pts.push({ x: L.lineCoord(si), z: L.lineCoord(sj) }); }
    pts.push({ x: g.player.x, z: g.player.z });
    this.route = pts.reverse();
  }
}

