import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Geo } from './Geo';
import { Box } from './Collision';
import { Poi, POIS } from './CityLayout';
import { Npc } from '../actors/Npc';
import { Rng } from '../core/MathUtil';
import { defById } from '../vehicles/VehicleDefs';
import { buildVehicleVisual } from '../vehicles/VehicleMesh';

interface Inst { group: THREE.Group; colliders: Box[]; lights: THREE.Light[]; npc: Npc | null; exit: THREE.Vector3; counter: THREE.Vector3; spawn: THREE.Vector3; terminal: THREE.Vector3; animated: ((t: number) => void)[]; w: number; d: number }

/**
 * Walk-in interiors. Each POI gets a room built at a hidden location high above the map,
 * so entering has no loading screen: a quick fade, world hidden and simulation paused.
 */
export class Interiors {
  active: string | null = null;
  private inst: Inst | null = null;
  private poi: Poi | null = null;
  private saved: { x: number; z: number; y: number; yaw: number } | null = null;
  private hidden: THREE.Object3D[] = [];
  private cache = new Map<string, Inst>();
  private anim = 0;
  fogBackup: THREE.Fog | null = null;
  lightsOff: THREE.Light[] = [];
  readonly Y = 300;

  constructor(private g: Game) {}

  private origin(poi: Poi) {
    const idx = POIS.indexOf(poi);
    return new THREE.Vector3(-1500 + (idx % 20) * 60, this.Y, 1380 + Math.floor(idx / 20) * 90);
  }

  canEnter(poi: Poi): boolean {
    const g = this.g;
    if (g.police.wantedLevel > 0) { g.hud?.toast('Not with the police on your tail'); return false; }
    if (!g.economy.isOpen(poi) && poi.kind !== 'safehouse') { g.hud?.toast(`${poi.name} is closed (opens ${String(poi.open).padStart(2, '0')}:00)`); return false; }
    if (poi.kind === 'safehouse' && !g.economy.properties.has(poi.id)) return true; // can still browse the sale
    return true;
  }

  async enter(poi: Poi) {
    const g = this.g, p = g.player;
    if (this.active) return;
    if (!this.canEnter(poi)) return;
    if (p.inVehicle) return;
    await g.hud?.fade(true, 0.22);
    this.poi = poi; this.active = poi.id;
    this.saved = { x: p.x, z: p.z, y: p.y, yaw: p.yaw };
    let inst = this.cache.get(poi.id);
    if (!inst) { inst = this.build(poi); this.cache.set(poi.id, inst); }
    this.inst = inst;
    g.env.scene.add(inst.group);
    for (const b of inst.colliders) g.col.add(b);
    // hide the outside world
    g.world.group.visible = false; g.vehicles.group.visible = false; g.peds.group.visible = false; g.props.group.visible = false;
    g.env.skyMesh.visible = false; g.env.waterMesh.visible = false; g.env.rain.visible = false; g.env.sun.visible = false; g.env.moon.visible = false;
    this.lightsOff = [g.env.hemi]; g.env.hemi.intensity = 0.55; g.env.hemi.color.set(0xfff4e0); g.env.hemi.groundColor.set(0x6a5a48);
    this.fogBackup = g.env.scene.fog as THREE.Fog; g.env.scene.fog = null;
    g.env.scene.background = new THREE.Color(0x0c0d10);
    if (inst.npc) { g.peds.add(inst.npc); inst.npc.group.visible = true; g.env.scene.add(inst.npc.group); }
    p.interior = poi.id;
    p.teleport(inst.spawn.x, inst.spawn.z, Math.PI, this.Y);
    g.cam.snapBehind(Math.PI);
    g.hud?.setInteriorHint(this.hint());
    g.bus.emit('enterInterior', poi.id);
    await g.hud?.fade(false, 0.25);
    g.audio.doorClose();
  }

  hint() { return this.poi ? `${this.poi.name}` : ''; }

  async exitAsync() {
    const g = this.g, p = g.player;
    if (!this.active || !this.inst) return;
    g.hud?.closeMenu();
    await g.hud?.fade(true, 0.2);
    this.leave();
    await g.hud?.fade(false, 0.25);
    void p;
  }
  /** Synchronous exit (used from menu actions that then teleport). */
  exit() {
    if (!this.active) return;
    this.leave();
    this.g.hud?.closeMenu();
  }
  private leave() {
    const g = this.g, p = g.player, inst = this.inst!;
    for (const b of inst.colliders) g.col.remove(b);
    g.env.scene.remove(inst.group);
    if (inst.npc) { g.peds.release(inst.npc); }
    g.world.group.visible = true; g.vehicles.group.visible = true; g.peds.group.visible = true; g.props.group.visible = true;
    g.env.skyMesh.visible = true; g.env.waterMesh.visible = true; g.env.sun.visible = true; g.env.moon.visible = true;
    g.env.scene.fog = this.fogBackup; g.env.scene.background = null;
    p.interior = null;
    const poi = this.poi!;
    this.active = null; this.inst = null;
    // cached NPC must be rebuilt next time
    this.cache.delete(poi.id);
    inst.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    p.teleport(poi.x, poi.z + 1.5, Math.PI);
    p.vy = 0;
    g.cam.snapBehind(Math.PI);
    g.bus.emit('exitInterior', poi.id);
  }

  /** What can the player do right now inside? */
  nearestAction(): { label: string; run: () => void } | null {
    if (!this.inst || !this.poi) return null;
    const p = this.g.player, i = this.inst;
    const dx = p.x - i.exit.x, dz = p.z - i.exit.z;
    if (Math.hypot(dx, dz) < 2.2) return { label: 'Leave', run: () => this.exitAsync() };
    if (Math.hypot(p.x - i.terminal.x, p.z - i.terminal.z) < 3.2) return { label: this.poi.kind === 'metro' ? 'Use ticket machine' : this.poi.kind === 'safehouse' ? 'Use' : 'Talk to clerk', run: () => this.openMenu() };
    return null;
  }
  openMenu() {
    const g = this.g; if (!this.poi) return;
    const m = g.economy.poiMenu(this.poi);
    if (m) g.hud?.openMenu(m);
  }

  update(dt: number) {
    if (!this.active || !this.inst) return;
    this.anim += dt;
    for (const a of this.inst.animated) a(this.anim);
    // keep clerk looking at player
    const n = this.inst.npc, p = this.g.player;
    if (n) { n.yaw = Math.atan2(p.x - n.x, p.z - n.z); n.hum.animate(dt, 0, 'idle'); n.syncMesh(dt, 0); }
    // keep hemi up inside
    this.g.env.hemi.intensity = 0.7;
  }

  // ---------------------------------------------------------------- builder
  private build(poi: Poi): Inst {
    const g = this.g;
    const o = this.origin(poi), rng = new Rng(poi.id.length * 7919 + poi.ci * 31 + poi.cj);
    const extra: THREE.Object3D[] = [];
    const geo = new Geo(); const cols: Box[] = []; const lights: THREE.Light[] = []; const animated: ((t: number) => void)[] = [];
    const kind = poi.kind;
    const big = ['club', 'cinema', 'dealer', 'garage', 'metro', 'hotel', 'airport', 'gym', 'hospital', 'police', 'marina'].includes(kind);
    const W = big ? 22 : 14, D = big ? 18 : 12, H = kind === 'metro' ? 6 : 4.2;
    const x0 = o.x - W / 2, x1 = o.x + W / 2, z0 = o.z - D / 2, z1 = o.z + D / 2, y = this.Y;
    const floorC = kind === 'club' ? 0x1b1020 : kind === 'gym' ? 0x6b6b72 : kind === 'metro' ? 0x6e6a60 : kind === 'garage' ? 0x4a4c50 : kind === 'safehouse' ? 0x8a6a4a : kind === 'hospital' ? 0xdfe6ea : 0x8a8478;
    const wallC = kind === 'club' ? 0x2b1b3c : kind === 'hospital' ? 0xf1f4f6 : kind === 'metro' ? 0x9a9488 : kind === 'police' ? 0x6f86a8 : kind === 'garage' ? 0x7a7e84 : kind === 'safehouse' ? 0xe5dccb : kind === 'restaurant' ? 0xd8a070 : kind === 'cinema' ? 0x4a1c1c : 0xcfc8b8;
    // floor, ceiling, walls
    geo.box(x0, y - 1, z0, x1, y, z1, floorC);
    geo.box(x0, y + H, z0, x1, y + H + 0.3, z1, 0xe8e4dc);
    const wall = (ax: number, az: number, bx: number, bz: number) => { geo.box(ax, y, az, bx, y + H, bz, wallC); cols.push({ x0: ax, z0: az, x1: bx, z1: bz, y0: y - 1, y1: y + H, kind: 'interior' }); };
    wall(x0 - 0.4, z0 - 0.4, x1 + 0.4, z0); wall(x0 - 0.4, z1, x1 + 0.4, z1 + 0.4); wall(x0 - 0.4, z0, x0, z1); wall(x1, z0, x1 + 0.4, z1);
    cols.push({ x0, z0, x1, z1, y0: y - 1, y1: y, kind: 'interior' });
    // door (exit) on +z wall? spawn near it
    const exit = new THREE.Vector3(o.x, y, z1 - 1.0);
    geo.box(o.x - 1.2, y, z1 - 0.15, o.x + 1.2, y + 2.6, z1, 0x2a2118);
    geo.glow(o.x - 1.0, y + 0.1, z1 - 0.2, o.x + 1.0, y + 2.4, z1 - 0.15, 0xffe9b0);
    const spawn = new THREE.Vector3(o.x, y, z1 - 2.4);
    const counter = new THREE.Vector3(o.x, y, z0 + 3.5);
    let terminal = counter.clone();
    // light fixtures
    geo.glow(o.x - 1.5, y + H - 0.05, o.z - 1.5, o.x + 1.5, y + H, o.z + 1.5, 0xfff2cf);
    const pl = new THREE.PointLight(0xfff0d8, 70, 40, 1.6); pl.position.set(o.x, y + H - 0.6, o.z); lights.push(pl);
    const pl2 = new THREE.PointLight(0xffe2c0, 40, 30, 1.6); pl2.position.set(o.x, y + H - 0.6, o.z - D * 0.3); lights.push(pl2);
    const solid = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, c: number) => { geo.box(ax, y + ay, az, bx, y + by, bz, c); cols.push({ x0: ax, z0: az, x1: bx, z1: bz, y0: y + ay, y1: y + by, kind: 'prop' }); };
    const sign = new THREE.Color(poi.color).getHex();
    geo.glow(o.x - 3, y + H - 1.1, z0 + 0.05, o.x + 3, y + H - 0.4, z0 + 0.2, sign);
    // ---- kind specific
    const counterDesk = () => { solid(o.x - 3, 0, z0 + 3, o.x + 3, 1.05, z0 + 4, 0x4a3a2c); geo.box(o.x - 3.1, y + 1.05, z0 + 2.95, o.x + 3.1, y + 1.12, z0 + 4.05, 0xd9d0c0); terminal = new THREE.Vector3(o.x, y, z0 + 5.2); };
    switch (kind) {
      case 'restaurant': case 'gas': case 'bar': case 'clothing': case 'gear': case 'carwash': case 'taxi': case 'realestate': case 'marina': case 'helipad': {
        counterDesk();
        for (let i = 0; i < 3; i++) solid(x0 + 0.6, 0, z0 + 3 + i * 3.2, x0 + 1.6, 1.8, z0 + 5.4 + i * 3.2, 0x7a6a58);
        for (let i = 0; i < 3; i++) solid(x1 - 1.6, 0, z0 + 3 + i * 3.2, x1 - 0.6, 1.8, z0 + 5.4 + i * 3.2, 0x7a6a58);
        if (kind === 'restaurant' || kind === 'bar') for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { solid(o.x - 4 + i * 6, 0, o.z + 0.5 + j * 3, o.x - 3 + i * 6, 0.9, o.z + 1.5 + j * 3, 0x6b4a2a); }
        if (kind === 'gear') for (let i = 0; i < 5; i++) geo.box(x0 + 0.1, y + 1.6 + (i % 2) * 0.5, z0 + 3.4 + i * 1.2, x0 + 0.3, y + 1.9 + (i % 2) * 0.5, z0 + 4.2 + i * 1.2, 0x222222);
        if (kind === 'clothing') for (let i = 0; i < 4; i++) geo.box(x1 - 1.4, y + 1.0 + (i % 2) * 0.1, z0 + 3 + i * 2, x1 - 0.8, y + 1.7, z0 + 3.6 + i * 2, [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f][i]);
        break; }
      case 'club': {
        geo.rect(o.x - 6, o.z - 5, o.x + 2, o.z + 3, y + 0.02, 0x3a2060);
        solid(x0 + 1, 0, z0 + 1, x1 - 1, 1.1, z0 + 2.2, 0x1a1a22); terminal = new THREE.Vector3(o.x, y, z0 + 3.4);
        solid(x1 - 5, 0, o.z - 2, x1 - 2, 1.0, o.z + 2, 0x222233);
        const cols2 = [0xff2ad4, 0x2ad4ff, 0xffe42a, 0x6a2aff];
        const sl = cols2.map((c, i) => { const l = new THREE.PointLight(c, 90, 28, 1.6); l.position.set(o.x - 4 + i * 3, y + H - 0.8, o.z - 1); lights.push(l); return l; });
        animated.push((t) => { sl.forEach((l, i) => { l.position.x = o.x - 5 + Math.sin(t * 1.3 + i * 1.7) * 5; l.position.z = o.z + Math.cos(t * 1.1 + i) * 4; l.intensity = 70 + Math.sin(t * 6 + i) * 40; }); });
        break; }
      case 'cinema': {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) solid(o.x - 7 + c * 2.4, 0, o.z - 1 + r * 2.2, o.x - 6 + c * 2.4, 0.8, o.z - 0.2 + r * 2.2, 0x8a2020);
        geo.glow(o.x - 6, y + 1, z0 + 0.3, o.x + 6, y + 3.6, z0 + 0.45, 0x9fc4ff);
        solid(x1 - 4, 0, z1 - 5, x1 - 1, 1.1, z1 - 3, 0x3a2a2a); terminal = new THREE.Vector3(x1 - 2.5, y, z1 - 6);
        break; }
      case 'gym': {
        geo.box(o.x - 4, y, o.z - 4, o.x + 1, y + 0.3, o.z + 1, 0x1a3a7a); for (const [ax, az] of [[-4, -4], [1, -4], [-4, 1], [1, 1]]) geo.box(o.x + ax - 0.1, y + 0.3, o.z + az - 0.1, o.x + ax + 0.1, y + 1.3, o.z + az + 0.1, 0xb02020);
        solid(x1 - 3, 0, z0 + 1, x1 - 1, 1.0, z0 + 4, 0x333333); terminal = new THREE.Vector3(x1 - 3.5, y, z0 + 5.2);
        for (let i = 0; i < 3; i++) solid(x0 + 1, 0, z0 + 1 + i * 2.4, x0 + 2.4, 1.2, z0 + 2.4 + i * 2.4, 0x444444);
        break; }
      case 'hospital': case 'police': case 'hotel': case 'airport': {
        counterDesk();
        for (let i = 0; i < 3; i++) solid(x0 + 1, 0, o.z - 2 + i * 3, x0 + 3, 0.7, o.z - 0.5 + i * 3, kind === 'hospital' ? 0xcfd8dc : 0x555a60);
        for (let i = 0; i < 3; i++) solid(x1 - 3, 0, o.z - 2 + i * 3, x1 - 1, 0.7, o.z - 0.5 + i * 3, kind === 'hospital' ? 0xcfd8dc : 0x555a60);
        break; }
      case 'dealer': {
        counterDesk();
        const showroom = ['halcyon_zero', 'vexa_gt', 'bruiser_70'];
        showroom.forEach((id, i) => {
          const d = defById(id); const vis = buildVehicleVisual(d, d.colors[i % d.colors.length], true);
          const pos = new THREE.Vector3(o.x - 6 + i * 6, y + 0.3, o.z + 2);
          vis.root.position.copy(pos); vis.root.rotation.y = 0.5 - i * 0.5;
          geo.cyl(pos.x, y, pos.z, 2.6, 2.6, 0.3, 0x2a2a32, 12);
          cols.push({ x0: pos.x - 1, z0: pos.z - 2.3, x1: pos.x + 1, z1: pos.z + 2.3, y0: y, y1: y + 1.4, kind: 'prop' });
          animated.push((t) => { vis.root.rotation.y = t * 0.3 + i; }); extra.push(vis.root);
        });
        break; }
      case 'garage': {
        counterDesk();
        solid(x0 + 1, 0, o.z - 1, x0 + 3, 1.2, o.z + 4, 0x884020); solid(x1 - 3, 0, o.z - 2, x1 - 1, 1.5, o.z + 3, 0x333a44);
        geo.box(o.x - 2, y, o.z + 2, o.x + 2, y + 0.35, o.z + 8, 0x777777);
        for (let i = 0; i < 4; i++) geo.glow(x0 + 0.05, y + 2.4, z0 + 3 + i * 3, x0 + 0.2, y + 2.7, z0 + 4.6 + i * 3, 0xffcc66);
        break; }
      case 'safehouse': {
        solid(x0 + 0.8, 0, z0 + 1, x0 + 3.2, 0.6, z0 + 3.5, 0x5a6a8a); // bed
        geo.box(x0 + 0.8, y + 0.6, z0 + 1, x0 + 3.2, y + 0.9, z0 + 2.2, 0xeeeeee);
        solid(x1 - 4, 0, z0 + 1, x1 - 1, 0.8, z0 + 2.4, 0x4a5a3a); // couch
        geo.glow(x1 - 3.8, y + 1.2, z0 + 0.1, x1 - 1.2, y + 2.4, z0 + 0.2, 0x7aa0ff); // tv
        solid(o.x - 1.5, 0, o.z - 1, o.x + 1.5, 0.45, o.z + 1, 0x6b4a2a);
        terminal = new THREE.Vector3(o.x, y, o.z + 3);
        geo.rect(o.x - 3, o.z - 2.5, o.x + 3, o.z + 2.5, y + 0.02, 0x7a3a3a);
        break; }
      case 'metro': {
        // platform with tracks and an arriving train
        geo.box(x0, y - 2, o.z + 1, x1, y - 0.3, o.z + 6, 0x2a2a2e);
        geo.box(x0, y, o.z + 1, x1, y + 0.12, o.z + 2.2, 0xe0c030);
        const train = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 3.2, 2.8), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.5, roughness: 0.4 }));
        train.position.set(x1 + 30, y + 0.4, o.z + 4); extra.push(train);
        animated.push((t) => { const k = (t % 14) / 14; train.position.x = k < 0.35 ? x1 + 30 - (k / 0.35) * (30 + W * 0.1) : k < 0.7 ? x1 - W * 0.1 : x1 - W * 0.1 + ((k - 0.7) / 0.3) * 60; });
        solid(o.x - 1, 0, z0 + 2, o.x + 1, 1.5, z0 + 3, 0x335577); terminal = new THREE.Vector3(o.x, y, z0 + 4.2);
        for (let i = 0; i < 4; i++) geo.cyl(x0 + 3 + i * 5, y, o.z - 2, 0.35, 0.35, H, 0x777770, 8);
        break; }
      default: counterDesk();
    }
    const group = new THREE.Group();
    const mk = (b: THREE.BufferGeometry | null, mat: THREE.Material) => { if (b) { const m = new THREE.Mesh(b, mat); group.add(m); } };
    mk(geo.f.build(), g.world.flatMat); mk(geo.w.build(), g.world.wallMat); mk(geo.g.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    for (const l of lights) group.add(l);
    // shopkeeper
    let npc: Npc | null = null;
    if (!['safehouse', 'metro', 'cinema'].includes(kind) || kind === 'cinema') {
      npc = new Npc(Npc.randomOutfit(rng, kind === 'hospital' ? 'medic' : kind === 'police' ? 'cop' : kind === 'gym' ? 'beach' : 'worker'), 1);
      npc.faction = 'merchant'; npc.essential = true; npc.name = poi.name + ' staff'; npc.userData.keep = true;
      npc.x = terminal.x; npc.z = terminal.z - 1.3; npc.y = this.Y; npc.yaw = 0; if (kind === 'club') { npc.z = terminal.z - 1.0; }
      npc.syncMesh(0, 0);
    }
    for (const x of extra) group.add(x);
    return { group, colliders: cols, lights, npc, exit, counter, spawn, terminal, animated, w: W, d: D };
  }
}
