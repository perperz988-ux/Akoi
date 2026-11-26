// The world: small city + huge junkyard (4 zones + secret compound) + underground interiors.
import * as THREE from 'three';
import { Collision } from './collision.js';
import { StaticBatch, Scatter } from './static.js';
import { MODELS, model } from './assets.js';
import { mulberry32, pick } from './rng.js';

export const BOUNDS = { x0: -260, x1: 260, z0: -330, z1: 310 };
const GW = BOUNDS.x1 - BOUNDS.x0, GD = BOUNDS.z1 - BOUNDS.z0, PPM = 3; // ground canvas pixels per metre

export const PLACES = {
  home: [-150, 236], store: [40, 181], pawn: [100, 181], pizza: [-40, 181], gas: [-95, 145],
  junkGate: [0, 100], parking: [0, 118], gusOffice: [35, 80], rosa: [-80, 70], innerGate: [0, 0], samCamp: [-178, 30],
  keyCar: [158, 46], shack: [-60, -40], generator: [-50, -47], monitor: [-60, -41], warehouse1: [60, -38], warehouse2: [150, -38],
  elecGate: [116, -80], cctv: [128, -77],
  clue1: [108, -100], clue2: [137, -138], clue3: [158, -183], fakeBox: [166, -191],
  trailerHidden: [-168, -186], tunnel: [-30, -252], hatch: [75, -262], secret: [165, -262], secretDoor: [152, -262], backGate: [120, -218],
  // interiors
  tunnelIn: [1000, -3], tunnelOut: [1090, -80], bunkerIn: [1200, 7], vault: [1200, -11], diary: [1193, -4], hiddenIn: [1400, 2],
};

export const ZONES = [
  { id: 'city', name: 'Bellmont (City)', x0: -260, x1: 260, z0: 132, z1: 310 },
  { id: 'lot', name: 'Junkyard Parking', x0: -260, x1: 260, z0: 100, z1: 132 },
  { id: 'A', name: 'Front Lot', x0: -210, x1: 210, z0: 0, z1: 100 },
  { id: 'B', name: 'Locked Yard', x0: -210, x1: 210, z0: -80, z1: 0 },
  { id: 'C', name: 'Container Maze', x0: 40, x1: 210, z0: -218, z1: -80 },
  { id: 'D', name: 'Garbage Mountains', x0: -210, x1: 40, z0: -300, z1: -80 },
  { id: 'S', name: 'Secret Compound', x0: 40, x1: 210, z0: -300, z1: -218 },
  { id: 'tunnel', name: 'Underground Tunnels', x0: 960, x1: 1120, z0: -110, z1: 20, interior: true },
  { id: 'bunker', name: 'Secret Building', x0: 1180, x1: 1220, z0: -30, z1: 20, interior: true },
  { id: 'hidden', name: 'Hidden Room', x0: 1390, x1: 1410, z0: -10, z1: 10, interior: true },
];
export function zoneAt(x, z) {
  for (let i = ZONES.length - 1; i >= 0; i--) { const q = ZONES[i]; if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) return q; }
  return null;
}

// map locations (icons on the phone map)
export const LOCATIONS = [
  { id: 'home', name: 'Home', x: -150, z: 246, type: 'house', icon: '🏠' },
  { id: 'store', name: 'Quik Stop', x: 40, z: 192, type: 'store', icon: '🛒' },
  { id: 'pawn', name: 'Pawn & Pay', x: 100, z: 192, type: 'store', icon: '💰' },
  { id: 'pizza', name: 'Pizza Bro', x: -40, z: 192, type: 'store', icon: '🍕' },
  { id: 'gas', name: 'Gas Station', x: -95, z: 145, type: 'city', icon: '⛽' },
  { id: 'gate', name: 'Junkyard Gate', x: 0, z: 100, type: 'junk', icon: '🚧' },
  { id: 'office', name: "Gus's Office", x: 35, z: 80, type: 'junk', icon: '🏚️', zone: 'A' },
  { id: 'garage', name: "Rosa's Garage", x: -80, z: 72, type: 'junk', icon: '🔧', zone: 'A' },
  { id: 'cars', name: 'Car Graveyard', x: 135, z: 45, type: 'junk', icon: '🚗', zone: 'A' },
  { id: 'camp', name: "Sam's Camp", x: -178, z: 30, type: 'junk', icon: '🔥', zone: 'A' },
  { id: 'lockedyard', name: 'Locked Yard', x: 0, z: -40, type: 'locked', icon: '🔒', zone: 'B' },
  { id: 'shack', name: 'Security Shack', x: -60, z: -40, type: 'junk', icon: '📹', zone: 'B' },
  { id: 'containers', name: 'Container Maze', x: 125, z: -150, type: 'locked', icon: '📦', zone: 'C' },
  { id: 'mountains', name: 'Garbage Mountains', x: -90, z: -180, type: 'junk', icon: '⛰️', zone: 'D' },
  { id: 'trailers', name: 'Old Trailer Park', x: -150, z: -135, type: 'junk', icon: '🏚️', zone: 'D' },
  { id: 'tunnel', name: 'Tunnel Entrance', x: -30, z: -252, type: 'hidden', icon: '🕳️', zone: 'D' },
  { id: 'secret', name: 'Secret Building', x: 165, z: -262, type: 'hidden', icon: '❓', zone: 'S' },
  { id: 'trapdoor', name: 'Trapdoor', x: -168, z: -186, type: 'hidden', icon: '🚪', zone: 'D' },
];

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.userData.canvas = c; return t;
}
export function textSign(text, w, h, bg = '#f4d03f', fg = '#111', font = 'bold 64px Impact, Arial Black, sans-serif') {
  return canvasTex(512, Math.round((512 * h) / w), (g, cw, ch) => {
    g.fillStyle = bg; g.fillRect(0, 0, cw, ch); g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(5, 5, cw - 10, ch - 10);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = text.split('\n'); const lh = ch / (lines.length + 0.6);
    lines.forEach((l, i) => { let f = font; g.font = f; while (g.measureText(l).width > cw - 40) { const px = parseInt(g.font.match(/(\d+)px/)[1]) - 4; g.font = g.font.replace(/\d+px/, px + 'px'); } g.fillText(l, cw / 2, lh * (i + 0.8)); g.font = font; });
    // grime
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(60,40,20,${Math.random() * 0.15})`; g.fillRect(Math.random() * cw, Math.random() * ch, 3 + Math.random() * 8, 2 + Math.random() * 5); }
  });
}

export class World {
  constructor(G) {
    this.G = G; this.scene = G.scene; this.col = new Collision(4); this.B = new StaticBatch(this.scene); this.S = new Scatter(this.scene);
    this.inter = []; this.piles = []; this.scannables = []; this.photoTargets = []; this.gates = {}; this.lamps = []; this.dyn = {};
    this.mapRects = []; // for minimap: {x,z,w,d,c}
    this.rng = mulberry32(1337);
  }
  // ---------- helpers ----------
  addInter(o) { const it = Object.assign({ y: 1, r: 2.6, hold: 0, on: true }, o); this.inter.push(it); return it; }
  solidBox(w, h, d, color, x, y, z, ry = 0, mapColor) {
    this.B.box(w, h, d, color, x, y, z, ry);
    if (Math.abs(Math.sin(ry * 2)) < 0.01) { const sw = Math.abs(Math.cos(ry)) > 0.5 ? w : d, sd = Math.abs(Math.cos(ry)) > 0.5 ? d : w; this.col.boxC(x, z, sw, sd, y + h); if (mapColor) this.mapRects.push({ x, z, w: sw, d: sd, c: mapColor }); }
    else { const r = Math.max(w, d) / 2; this.col.circle(x, z, r * 0.8, y + h); }
  }
  placeModel(name, x, z, ry, o = {}) {
    const f = this.B.model(name, x, o.y || 0, z, ry, o); if (!f) return null;
    if (o.collide !== false) {
      const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
      const w = f.w * c + f.d * s, d = f.w * s + f.d * c;
      if (o.circles) { // long objects at arbitrary angles: 3 circles along the long axis
        const L = Math.max(f.w, f.d), r = Math.min(f.w, f.d) / 2, ax = f.d >= f.w ? [Math.sin(ry), Math.cos(ry)] : [Math.cos(ry), -Math.sin(ry)];
        for (const k of [-0.33, 0, 0.33]) this.col.circle(x + ax[0] * L * k, z + ax[1] * L * k, r, (o.y || 0) + f.h);
      } else this.col.boxC(x, z, w * (o.shrink || 0.92), d * (o.shrink || 0.92), (o.y || 0) + f.h);
      if (o.map) this.mapRects.push({ x, z, w, d, c: o.map });
    }
    return f;
  }
  fence(x0, z0, x1, z1, h = 3.2, wall = false) {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (wall) { // corrugated junk wall
      const n = Math.ceil(len / 3);
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t; const col = pick(this.rng, [0x6d5d4b, 0x5b6770, 0x7a4a32, 0x4f5a45]); this.B.box(0.3, h + this.rng() * 1.5, len / n + 0.2, col, px, 0, pz, ang, { rx: (this.rng() - 0.5) * 0.06 }); }
    } else {
      const n = Math.ceil(len / 3);
      for (let i = 0; i <= n; i++) { const t = i / n; this.B.cyl(0.05, 0.05, h, 0x8a8f94, x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t, 5); }
      this.B.prim(new THREE.CylinderGeometry(0.035, 0.035, len, 4), 0x8a8f94, cx, h - 0.05, cz, ang, Math.PI / 2, 0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), this.fenceMat); m.position.set(cx, h / 2, cz); m.rotation.y = ang + Math.PI / 2;
      m.material.map.repeat.set(len / 1.2, h / 1.2); this.scene.add(m);
    }
    const t = 0.4; this.col.box(Math.min(x0, x1) - t, Math.min(z0, z1) - t, Math.max(x0, x1) + t, Math.max(z0, z1) + t, h + 2);
    this.mapRects.push({ x: cx, z: cz, w: Math.abs(x1 - x0) + 0.8, d: Math.abs(z1 - z0) + 0.8, c: wall ? '#3a2e24' : '#9aa' });
  }
  gate(id, x, z, width, alongX = true, locked = true, color = 0xb0482e) {
    const g = new THREE.Group(); g.position.set(x, 0, z); this.scene.add(g);
    const leaves = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(alongX ? side * width / 2 : 0, 0, alongX ? 0 : side * width / 2); g.add(pivot);
      const lw = width / 2;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(alongX ? lw : 0.12, 3, alongX ? 0.12 : lw), new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.0 }));
      const bars = new THREE.Group();
      for (let i = 0; i <= 6; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3, 0.08), new THREE.MeshLambertMaterial({ color })); const o = -side * (i / 6) * lw; b.position.set(alongX ? o : 0, 1.5, alongX ? 0 : o); bars.add(b); }
      for (const yy of [0.2, 1.5, 2.9]) { const r = new THREE.Mesh(new THREE.BoxGeometry(alongX ? lw : 0.1, 0.12, alongX ? 0.1 : lw), new THREE.MeshLambertMaterial({ color })); r.position.set(alongX ? -side * lw / 2 : 0, yy, alongX ? 0 : -side * lw / 2); bars.add(r); }
      bars.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      pivot.add(bars); leaves.push({ pivot, side }); frame.visible = false;
    }
    this.B.cyl(0.18, 0.18, 3.6, 0x555b60, x + (alongX ? -width / 2 - 0.2 : 0), 0, z + (alongX ? 0 : -width / 2 - 0.2), 8);
    this.B.cyl(0.18, 0.18, 3.6, 0x555b60, x + (alongX ? width / 2 + 0.2 : 0), 0, z + (alongX ? 0 : width / 2 + 0.2), 8);
    const col = alongX ? this.col.boxC(x, z, width, 0.6, 6) : this.col.boxC(x, z, 0.6, width, 6);
    const gate = { id, x, z, open: !locked, t: locked ? 0 : 1, leaves, col, alongX };
    col.on = locked; this.gates[id] = gate;
    this.mapRects.push({ x, z, w: alongX ? width : 0.8, d: alongX ? 0.8 : width, c: '#d94', gate: id });
    return gate;
  }
  setGate(id, open) { const g = this.gates[id]; if (!g) return; g.open = open; g.col.on = !open; }
  sign(text, x, y, z, ry, w = 4, h = 1.5, bg, fg, post = true) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: textSign(text, w, h, bg, fg) }));
    m.position.set(x, y, z); m.rotation.y = ry; this.scene.add(m);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: 0x555555 })); back.position.copy(m.position); back.rotation.y = ry + Math.PI; back.translateZ(0.01); this.scene.add(back);
    if (post) { const dx = Math.cos(ry) * w * 0.4, dz = -Math.sin(ry) * w * 0.4; this.B.cyl(0.07, 0.07, y - h / 2, 0x666666, x - dx, 0, z - dz, 6); this.B.cyl(0.07, 0.07, y - h / 2, 0x666666, x + dx, 0, z + dz, 6); }
    return m;
  }
  lamp(x, z, h = 6, color = 0xffd9a0) {
    this.B.cyl(0.09, 0.13, h, 0x3d4247, x, 0, z, 6); this.B.box(0.9, 0.12, 0.3, 0x3d4247, x, h - 0.1, z);
    this.B.box(0.5, 0.08, 0.25, 0xfff2c0, x, h - 0.2, z, 0, { glow: true });
    this.col.circle(x, z, 0.2, h); this.lamps.push({ x, y: h - 0.4, z, color });
  }
  // building with walls, door gap and roof. door: 'n'|'s'|'e'|'w'
  building(x, z, w, d, h, color, roofColor, door = 's', o = {}) {
    const t = 0.25, dw = o.doorW || 1.6, B = this.B;
    const wall = (wx, wz, ww, wd, gap) => {
      if (!gap) { this.solidBox(ww, h, wd, color, wx, 0, wz); return; }
      if (ww > wd) { const seg = (ww - dw) / 2; this.solidBox(seg, h, wd, color, wx - dw / 2 - seg / 2, 0, wz); this.solidBox(seg, h, wd, color, wx + dw / 2 + seg / 2, 0, wz); B.box(dw, h - 2.3, wd, color, wx, 2.3, wz); }
      else { const seg = (wd - dw) / 2; this.solidBox(ww, h, seg, color, wx, 0, wz - dw / 2 - seg / 2); this.solidBox(ww, h, seg, color, wx, 0, wz + dw / 2 + seg / 2); B.box(ww, h - 2.3, dw, color, wx, 2.3, wz); }
    };
    wall(x, z - d / 2, w, t, door === 'n'); wall(x, z + d / 2, w, t, door === 's'); wall(x - w / 2, z, t, d, door === 'w'); wall(x + w / 2, z, t, d, door === 'e');
    B.box(w + 0.8, 0.3, d + 0.8, roofColor, x, h, z);
    if (!o.noFloor) B.box(w, 0.04, d, o.floor || 0x5a5048, x, 0, z, 0, { shadow: false });
    // windows (glow at night)
    if (o.windows !== false) for (const side of [-1, 1]) { B.box(1.2, 0.9, 0.05, 0xfff0b0, x + side * w / 4, 1.4, z + d / 2 + 0.14, 0, { glow: true }); B.box(1.2, 0.9, 0.05, 0xfff0b0, x + side * w / 4, 1.4, z - d / 2 - 0.14, 0, { glow: true }); }
    this.mapRects.push({ x, z, w, d, c: o.map || '#7b6a5a' });
  }
  pile(x, z, r, zone, opts = {}) {
    const rng = this.rng, B = this.B, h = r * (0.5 + rng() * 0.25);
    // mound
    const g = new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const n = 0.75 + rng() * 0.45; p.setX(i, p.getX(i) * n); p.setZ(i, p.getZ(i) * n); p.setY(i, y * (h / r) * (0.8 + rng() * 0.4)); }
    g.computeVertexNormals(); B.prim(g, pick(rng, [0x5c4d3c, 0x4e4a44, 0x63584a, 0x54483a]), x, 0, z, rng() * 6, 0, 0, { jitter: 0.35 });
    const idx = []; const props = ['soda-can-crushed', 'soda-can', 'pizza-box', 'banana', 'fish-bones', 'styrofoam', 'candy-bar-wrapper', 'carton', 'bottle', 'bag', 'plate-broken', 'barrel'];
    const n = opts.n || Math.round(8 + r * 4);
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * r * 0.95, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      const py = Math.max(0, h * Math.sqrt(Math.max(0, 1 - (rr / r) ** 2)) * 0.85 - 0.05);
      const name = pick(rng, props); const M = MODELS[name]; if (!M) continue;
      const target = name === 'barrel' ? 1.0 : name === 'pizza-box' || name === 'carton' || name === 'styrofoam' ? 0.55 : 0.35 + rng() * 0.15;
      const s = target / Math.max(M.size.x, M.size.y, M.size.z);
      const tint = pick(rng, [0xffffff, 0xdddddd, 0xc8b8a0, 0xbbbbbb, 0xe0d0b0]);
      idx.push([name, this.S.add(name, px, py + target * 0.3, pz, (rng() - 0.5) * 2.5, rng() * 6.3, (rng() - 0.5) * 2.5, s, tint)]);
    }
    // procedural junk: boxes, planks, tyres
    for (let i = 0; i < 3 + r; i++) {
      const a = rng() * Math.PI * 2, rr = rng() * r * 0.8, px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr, py = h * Math.sqrt(Math.max(0, 1 - (rr / r) ** 2)) * 0.8;
      const k = rng();
      if (k < 0.4) B.box(0.4 + rng() * 0.8, 0.3 + rng() * 0.6, 0.4 + rng() * 0.8, pick(rng, [0x8b6b45, 0xa08055, 0x6c757d, 0x3e6b8a, 0x993333]), px, py - 0.2, pz, rng() * 3, { rx: (rng() - 0.5), rz: (rng() - 0.5) });
      else if (k < 0.7) B.box(2 + rng() * 2, 0.08, 0.25, 0x7a5c3a, px, py, pz, rng() * 3, { rz: (rng() - 0.5) * 0.8 });
      else B.prim(new THREE.TorusGeometry(0.35, 0.14, 6, 12), 0x1d1d1f, px, py + 0.1, pz, rng() * 3, rng() * 3, 0);
    }
    this.col.circle(x, z, r * 0.62, h);
    const pl = { id: this.piles.length, x, z, r, zone, searched: false, idx, ...opts };
    this.piles.push(pl);
    this.mapRects.push({ x, z, w: r * 1.6, d: r * 1.6, c: '#6d5a44', round: true });
    this.addInter({ x, y: Math.min(h, 1.3), z, r: r + 1.6, hold: 1.3, kind: 'pile', pile: pl,
      label: () => (pl.searched ? null : 'Search garbage'), action: () => this.G.searchPile(pl) });
    return pl;
  }
  mountain(x, z, r, h) {
    const rng = this.rng;
    const g = new THREE.ConeGeometry(r, h, 22, 7); const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = 1 - (y + h / 2) / h; const n = 1 + (rng() - 0.5) * 0.3 * k; p.setX(i, p.getX(i) * n); p.setZ(i, p.getZ(i) * n); p.setY(i, y + (rng() - 0.5) * 1.2 * k); }
    g.computeVertexNormals(); this.B.prim(g, pick(rng, [0x5a4a3a, 0x4d463f, 0x5f5244]), x, h / 2, z, rng() * 6, 0, 0, { jitter: 0.45 });
    const props = ['soda-can-crushed', 'pizza-box', 'styrofoam', 'carton', 'bag', 'barrel', 'bottle', 'plate-broken'];
    for (let i = 0; i < r * 5; i++) {
      const a = rng() * Math.PI * 2, t = rng(), rr = r * (1 - t) * 0.97, py = h * t; const name = pick(rng, props); const M = MODELS[name]; if (!M) continue;
      const s = (name === 'barrel' ? 1.1 : 0.5 + rng() * 0.3) / Math.max(M.size.x, M.size.y, M.size.z);
      this.S.add(name, x + Math.cos(a) * rr, py + 0.2, z + Math.sin(a) * rr, rng() * 3, rng() * 6, rng() * 3, s, pick(rng, [0xffffff, 0xcccccc, 0xb8a890]));
    }
    for (let i = 0; i < r * 1.5; i++) { const a = rng() * Math.PI * 2, t = rng() * 0.8, rr = r * (1 - t); this.B.box(1 + rng() * 2, 0.5 + rng(), 1 + rng() * 2, pick(rng, [0x7d6b55, 0x5c6670, 0x8a3b2b, 0x3d5a3d, 0xaaa59a]), x + Math.cos(a) * rr, h * t - 0.3, z + Math.sin(a) * rr, rng() * 6, { rx: rng() - 0.5, rz: rng() - 0.5 }); }
    this.col.circle(x, z, r * 0.88, h);
    this.mapRects.push({ x, z, w: r * 2, d: r * 2, c: '#4a3c2e', round: true });
  }
  car(name, x, z, ry, tint = 0x9a7d66, o = {}) {
    const len = o.length || 4.4;
    const f = this.placeModel(name, x, z, ry, { length: len, tint, circles: true, y: o.y || 0, rz: o.rz || 0, rx: o.rx || 0, map: '#5c4a3e' });
    return f;
  }
  container(x, z, ry, color, open = false, stack = 0) {
    const L = 12, W = 2.5, H = 2.6, y = stack * H, B = this.B; const alongX = Math.abs(Math.cos(ry)) > 0.5;
    if (!open) {
      B.box(alongX ? L : W, H, alongX ? W : L, color, x, y, z, 0);
      for (let i = -5; i <= 5; i++) { const o = i * 1.05; B.box(alongX ? 0.12 : W + 0.06, H - 0.1, alongX ? W + 0.06 : 0.12, color, x + (alongX ? o : 0), y + 0.05, z + (alongX ? 0 : o), 0, { jitter: 0.15 }); }
      if (stack === 0) { this.col.boxC(x, z, alongX ? L : W, alongX ? W : L, y + H + 3); this.mapRects.push({ x, z, w: alongX ? L : W, d: alongX ? W : L, c: '#' + new THREE.Color(color).getHexString() }); }
    } else { // open along -x end; walls N/S/E + roof
      B.box(L, H, 0.12, color, x, y, z - W / 2); B.box(L, H, 0.12, color, x, y, z + W / 2); B.box(0.12, H, W, color, x + L / 2, y, z); B.box(L, 0.1, W, color, x, y + H - 0.1, z); B.box(L, 0.05, W, 0x4a3d30, x, y, z, 0, { shadow: false });
      this.col.box(x - L / 2, z - W / 2 - 0.2, x + L / 2, z - W / 2 + 0.06, 5); this.col.box(x - L / 2, z + W / 2 - 0.06, x + L / 2, z + W / 2 + 0.2, 5); this.col.boxC(x + L / 2, z, 0.3, W, 5);
      // open doors
      B.box(0.08, H, W / 2, color, x - L / 2 - W / 4 * 0, y, z - W / 2 - W / 4, Math.PI / 2 * 0.0);
      this.mapRects.push({ x, z, w: L, d: W, c: '#' + new THREE.Color(color).getHexString() });
    }
  }
  trailer(x, z, ry, color) {
    const B = this.B; const L = 10, W = 3.6, H = 2.8; const ax = Math.abs(Math.cos(ry)) > 0.5;
    const w = ax ? L : W, d = ax ? W : L;
    this.building(x, z, w, d, H, color, 0x6b6b6b, ax ? 's' : 'e', { windows: false, floor: 0x5b4a3a, map: '#8a7a6a' });
    // broken bits
    B.box(1.4, 0.9, 0.08, 0x223344, x - w / 4, 1.3, z + d / 2 + 0.15); B.box(2, 0.1, 1.5, 0x777777, x + w / 3, H + 0.2, z, 0.3, { rz: 0.4 });
    B.prim(new THREE.CylinderGeometry(0.25, 0.25, 0.25, 8), 0x111111, x - w / 3, 0.25, z + d / 2, 0, Math.PI / 2, 0);
  }
  // ---------- build ----------
  build() {
    const B = this.B, rng = this.rng;
    this.fenceMat = new THREE.MeshLambertMaterial({ map: canvasTex(64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(190,195,200,0.95)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 64); g.moveTo(64, 0); g.lineTo(0, 64); g.stroke(); }, true), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    this.buildGround();
    this.buildCity();
    this.buildJunkyard();
    this.buildInteriors();
    B.finish(); this.S.finish();
    this.buildMapCanvas();
  }
  buildGround() {
    const W = GW * PPM, D = GD * PPM, X = (x) => (x - BOUNDS.x0) * PPM, Z = (z) => (z - BOUNDS.z0) * PPM;
    const rng = mulberry32(99);
    const tex = canvasTex(W, D, (g) => {
      g.fillStyle = '#5d7a3e'; g.fillRect(0, 0, W, D); // grass
      for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${40 + rng() * 40},${80 + rng() * 50},${20 + rng() * 30},0.35)`; g.fillRect(rng() * W, rng() * D, 4 + rng() * 10, 4 + rng() * 10); }
      // junkyard dirt
      g.fillStyle = '#7a6448'; g.fillRect(X(-212), Z(-302), 424 * PPM, 404 * PPM);
      for (let i = 0; i < 26000; i++) { const x = X(-212) + rng() * 424 * PPM, y = Z(-302) + rng() * 404 * PPM; g.fillStyle = `rgba(${70 + rng() * 60},${55 + rng() * 40},${35 + rng() * 25},0.4)`; g.fillRect(x, y, 3 + rng() * 12, 3 + rng() * 12); }
      // oil stains & puddles
      for (let i = 0; i < 260; i++) { const x = X(-200 + rng() * 400), y = Z(-290 + rng() * 380); g.fillStyle = rng() < 0.5 ? 'rgba(20,18,15,0.35)' : 'rgba(70,80,90,0.35)'; g.beginPath(); g.ellipse(x, y, 6 + rng() * 25, 4 + rng() * 15, rng() * 3, 0, 7); g.fill(); }
      // dirt roads in the junkyard
      g.strokeStyle = 'rgba(150,125,90,0.8)'; g.lineWidth = 8 * PPM; g.lineCap = 'round';
      const road = (pts) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z)))); g.stroke(); };
      road([[0, 100], [0, -80], [0, -150], [-40, -230], [-30, -250]]); road([[-200, 50], [200, 50]]); road([[-200, -40], [200, -40]]); road([[116, -40], [116, -210]]); road([[0, -150], [-180, -150]]);
      // tyre tracks
      g.strokeStyle = 'rgba(60,45,30,0.35)'; g.lineWidth = 2;
      for (let i = 0; i < 40; i++) { let x = -200 + rng() * 400, z = -290 + rng() * 380; g.beginPath(); g.moveTo(X(x), Z(z)); for (let k = 0; k < 8; k++) { x += (rng() - 0.5) * 20; z += (rng() - 0.5) * 20; g.lineTo(X(x), Z(z)); } g.stroke(); }
      // city asphalt
      const asphalt = (x0, z0, x1, z1) => { g.fillStyle = '#3b3d40'; g.fillRect(X(x0), Z(z0), (x1 - x0) * PPM, (z1 - z0) * PPM); };
      const side = (x0, z0, x1, z1) => { g.fillStyle = '#9c9890'; g.fillRect(X(x0), Z(z0), (x1 - x0) * PPM, (z1 - z0) * PPM); };
      side(-260, 160, 260, 180); side(-260, 228, 260, 242); for (const x of [-120, 0, 120]) side(x - 8, 132, x + 8, 310); side(-8, 100, 8, 170);
      asphalt(-260, 163, 260, 177); asphalt(-260, 230, 260, 240); for (const x of [-120, 0, 120]) asphalt(x - 5, 140, x + 5, 310); asphalt(-5, 100, 5, 170);
      asphalt(-35, 103, 35, 132); // parking
      g.fillStyle = '#ddd'; for (let x = -30; x <= 30; x += 5) g.fillRect(X(x), Z(118), 2, 12 * PPM);
      // lane markings
      g.fillStyle = '#e8c840'; for (let x = -258; x < 258; x += 6) { g.fillRect(X(x), Z(169.8), 3 * PPM, 0.3 * PPM); g.fillRect(X(x), Z(234.85), 3 * PPM, 0.3 * PPM); }
      for (const xx of [-120, 0, 120]) for (let z = 140; z < 310; z += 6) g.fillRect(X(xx - 0.15), Z(z), 0.3 * PPM, 3 * PPM);
      for (let z = 100; z < 163; z += 6) g.fillRect(X(-0.15), Z(z), 0.3 * PPM, 3 * PPM);
      // asphalt grain
      for (let i = 0; i < 20000; i++) { const x = rng() * W, y = Z(132) + rng() * (D - Z(132)); g.fillStyle = `rgba(0,0,0,${rng() * 0.06})`; g.fillRect(x, y, 2, 2); }
      // compound concrete
      g.fillStyle = '#77756f'; g.fillRect(X(42), Z(-298), 166 * PPM, 78 * PPM);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 8; this.groundTex = tex;
    const detail = canvasTex(256, 256, (g) => { const r = mulberry32(5); g.fillStyle = '#888'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 6000; i++) { const v = 100 + r() * 70; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3); } }, true);
    detail.colorSpace = THREE.NoColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.detail = { value: detail };
      sh.fragmentShader = 'uniform sampler2D detail;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.rgb *= texture2D(detail, vMapUv * vec2(${(GW / 3).toFixed(1)}, ${(GD / 3).toFixed(1)})).rgb * 1.75;`);
    };
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, GD), mat); ground.rotation.x = -Math.PI / 2; ground.position.set((BOUNDS.x0 + BOUNDS.x1) / 2, 0, (BOUNDS.z0 + BOUNDS.z1) / 2); ground.receiveShadow = true; this.scene.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshLambertMaterial({ color: 0x4f6a35 })); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; this.scene.add(outer);
    // world edge
    this.col.box(BOUNDS.x0 - 5, BOUNDS.z0 - 5, BOUNDS.x0, BOUNDS.z1 + 5, 99); this.col.box(BOUNDS.x1, BOUNDS.z0 - 5, BOUNDS.x1 + 5, BOUNDS.z1 + 5, 99);
    this.col.box(BOUNDS.x0 - 5, BOUNDS.z1, BOUNDS.x1 + 5, BOUNDS.z1 + 5, 99); this.col.box(BOUNDS.x0 - 5, BOUNDS.z0 - 5, BOUNDS.x1 + 5, BOUNDS.z0, 99);
  }
  buildCity() {
    const B = this.B, rng = this.rng;
    // stores on Main St (south side, facing north = -z)
    const stores = [[-200, 'building-small-c'], [-160, 'building-small-b'], [-80, 'building-small-d'], [-40, 'building-small-a'], [40, 'building-small-b'], [100, 'building-small-c'], [160, 'building-small-d'], [200, 'building-small-a']];
    for (const [x, n] of stores) this.placeModel(n, x, 194, Math.PI, { width: 15, center: true, map: '#8b7fa3' });
    this.sign('QUIK STOP', 40, 5.2, 185.9, Math.PI, 6, 1.3, '#d62828', '#fff', false);
    this.sign('PAWN & PAY', 100, 5.2, 185.9, Math.PI, 6, 1.3, '#2a9d8f', '#fff', false);
    this.sign('PIZZA BRO', -40, 5.2, 185.9, Math.PI, 6, 1.3, '#f4a261', '#222', false);
    // north side: gas station + billboard + park
    const gx = -95, gz = 147; B.box(16, 0.35, 9, 0xd62828, gx, 4.4, gz); for (const [dx, dz] of [[-7, -4], [7, -4], [-7, 4], [7, 4]]) this.solidBox(0.4, 4.4, 0.4, 0xdddddd, gx + dx, 0, gz + dz);
    for (const dx of [-3, 3]) this.solidBox(0.8, 1.6, 0.6, 0xeeeeee, gx + dx, 0, gz);
    this.building(-95, 137, 10, 6, 3.4, 0xe9e2d0, 0xd62828, 'n', { map: '#c9b' });
    this.sign('GAS', gx, 6.2, gz + 4.5, 0, 3, 1, '#d62828', '#fff');
    this.sign('PS5\nSOLD OUT\nFOREVER 💀', 70, 7, 145, 0, 10, 5, '#1d3557', '#f1faee');
    // houses along Oak Ave
    const houses = ['house-3', 'house-4', 'house-5', 'house-6', 'house1'];
    for (let x = -235; x <= 235; x += 26) {
      if (Math.abs(x - -120) < 12 || Math.abs(x) < 12 || Math.abs(x - 120) < 12) continue;
      for (const side of [-1, 1]) {
        const z = side < 0 ? 216 : 256, ry = side < 0 ? 0 : Math.PI;
        const isHome = side > 0 && Math.abs(x - -150) < 14;
        this.placeModel(isHome ? 'house-5' : pick(rng, houses), x, z, ry, { width: 12, center: true, map: isHome ? '#e76f51' : '#a98' });
        if (rng() < 0.7) this.placeModel(pick(rng, ['tree-big', 'low-poly-tree']), x + 9, z + (side < 0 ? -4 : 4), rng() * 6, { height: 6 + rng() * 3, map: '#3b6' });
      }
    }
    // home marker + mailbox
    this.sign('HOME', -150, 1.3, 247.5, 0, 1.4, 0.5, '#fff', '#e76f51');
    // street lamps
    for (let x = -240; x <= 240; x += 30) { this.lamp(x, 159); this.lamp(x + 15, 181); this.lamp(x, 228); }
    for (let z = 105; z <= 160; z += 18) { this.lamp(-7, z); this.lamp(7, z + 9); }
    // parked cars
    const cars = ['sedan', 'hatchback', 'taxi', 'suv', 'van', 'police-car', 'truck'];
    for (let i = 0; i < 14; i++) { const x = -230 + rng() * 460; if (Math.abs(x) < 10 || Math.abs(Math.abs(x) - 120) < 10) continue; const z = rng() < 0.5 ? 165 : 175.5; this.placeModel(pick(rng, cars), x, z, Math.PI / 2 * (z < 170 ? 1 : -1), { length: 4.6, map: '#46a' }); }
    this.placeModel('sedan', 18, 112, 0.1, { length: 4.6, map: '#46a' }); this.placeModel('garbage-truck', -22, 120, Math.PI / 2, { length: 8, map: '#6a6' });
    this.placeModel('dogue', -142, 238, -0.5, { height: 0.7 });
    // benches
    for (const x of [-60, 20, 130]) this.placeModel('bench', x, 160, 0, { length: 2, map: '#975' });
    // the junkyard billboard
    this.sign('JUNK MOUNTAIN SALVAGE\nOPEN 8 AM - 8 PM', 0, 6.5, 103, 0, 9, 3, '#f4d03f', '#111', true);
  }
  buildJunkyard() {
    const B = this.B, rng = this.rng;
    // ---- fences ----
    this.fence(-210, 100, -8, 100); this.fence(8, 100, 210, 100);
    this.fence(-210, 100, -210, -300); this.fence(210, 100, 210, -300); this.fence(-210, -300, 40, -300);
    this.fence(-210, 0, -6, 0); this.fence(6, 0, 210, 0);
    this.fence(40, -80, 110, -80); this.fence(122, -80, 210, -80);
    this.fence(40, -80, 40, -218);
    this.fence(40, -218, 114, -218, 5, true); this.fence(126, -218, 210, -218, 5, true); this.fence(40, -218, 40, -300, 5, true); this.fence(40, -300, 210, -300, 5, true);
    this.gate('junk', 0, 100, 16, true, true);
    this.gate('inner', 0, 0, 12, true, true, 0x7a6a2a);
    this.gate('elec', 116, -80, 12, true, true, 0x2a6a9a);
    this.gate('back', 120, -218, 12, true, true, 0x553322);
    this.sign('LOCKED YARD\nAUTHORIZED ONLY', -9, 2.4, 0.4, 0, 3.4, 1.4, '#c0392b', '#fff');
    this.sign('⚡ ELECTRIC GATE ⚡\nPOWER: OFF', 103, 2.4, -79.6, 0, 3.6, 1.4, '#2980b9', '#fff');
    this.sign('NO REFUNDS\nNO FOXES\nNO QUESTIONS', 14, 2.2, 101, 0, 3, 1.6, '#fff', '#c0392b');
    // ---- Zone A: office, garage, camp ----
    this.building(35, 80, 9, 7, 3.2, 0xb7a98f, 0x5a4636, 'e', { map: '#b9a' });
    this.sign("GUS'S OFFICE", 35, 3.7, 83.7, 0, 3, 0.7, '#fff', '#333', false);
    B.box(2, 0.8, 1, 0x6b4f3a, 33, 0, 78); this.col.boxC(33, 78, 2, 1, 1); B.box(0.6, 0.45, 0.4, 0x222222, 33, 0.8, 78);
    B.box(1, 0.5, 1, 0x7a3b2b, 37, 0, 82); // chair
    this.placeModel('building-garage', -80, 66, 0, { width: 16, center: true, map: '#889' });
    this.sign("ROSA'S GARAGE\nWE FIX ANYTHING*", -80, 6, 74.6, 0, 5, 1.6, '#e9c46a', '#222', false);
    this.placeModel('citroen-old-van', -86, 78, 0.4, { length: 5, circles: true });
    B.box(3, 0.9, 1, 0x555555, -72, 0, 78); this.col.boxC(-72, 78, 3, 1, 1);
    for (let i = 0; i < 4; i++) B.prim(new THREE.TorusGeometry(0.45, 0.2, 6, 14), 0x1a1a1a, -66, 0.2 + i * 0.4, 76, 0, Math.PI / 2, 0); this.col.circle(-66, 76, 0.7, 2);
    // Sam's camp
    B.box(3.5, 2.2, 3, 0x3b6e8f, -184, 0, 26, 0.3); this.col.circle(-184, 26, 2, 2);
    this.placeModel('sci-fi-crate', -172, 24, 0.5, { length: 1.2 }); this.placeModel('chest', -170, 34, 2, { length: 1 });
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; B.box(0.35, 0.25, 0.3, 0x777777, -178 + Math.cos(a) * 0.9, 0, 30 + Math.sin(a) * 0.9, a); }
    this.fire = { x: -178, z: 30 }; this.col.circle(-178, 30, 0.9, 1);
    // car graveyard
    const wrecks = ['sedan', 'hatchback', 'suv', 'van', 'taxi', 'truck', 'police-car', 'citroen-old-van'];
    this.cars = [];
    let ci = 0;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
      const x = 92 + i * 17 + (rng() - 0.5) * 3, z = 26 + row * 17 + (rng() - 0.5) * 3, ry = (rng() - 0.5) * 0.7 + (row % 2 ? Math.PI : 0);
      const n = wrecks[ci++ % wrecks.length], tint = pick(rng, [0x9a7d66, 0x8c7360, 0xa08a70, 0x7a6858, 0xb09070]);
      const isKey = Math.abs(x - PLACES.keyCar[0]) < 9 && Math.abs(z - PLACES.keyCar[1]) < 9 && !this.cars.some((c) => c.key);
      this.car(n, x, z, ry, tint, { rz: (rng() - 0.5) * 0.1 });
      if (rng() < 0.3) this.car(pick(rng, wrecks), x + 0.3, z, ry + 0.2, 0x8a7a6a, { y: 1.55, rz: 0.05 });
      const c = { x, z, ry, name: n, key: isKey, searched: false, id: this.cars.length }; this.cars.push(c);
      this.addInter({ x, y: 0.9, z, r: 3.4, hold: 1.0, kind: 'car', car: c, label: () => (c.searched ? null : 'Check glovebox'), action: () => this.G.searchCar(c) });
      this.scannables.push({ id: 'car' + c.id, x, y: 1, z, r: 5, kind: 'car', car: c });
    }
    // tyre towers & barrels around A
    for (let i = 0; i < 14; i++) { const x = -190 + rng() * 380, z = 8 + rng() * 85; if (Math.abs(x) < 14 || (x > 80 && z > 18 && z < 72) || (x > 20 && x < 50 && z > 70) || (x < -60 && x > -100 && z > 55)) continue; const n = 2 + Math.floor(rng() * 5); for (let k = 0; k < n; k++) B.prim(new THREE.TorusGeometry(0.45, 0.2, 6, 14), 0x1b1b1b, x, 0.2 + k * 0.4, z, 0, Math.PI / 2, 0); this.col.circle(x, z, 0.7, n * 0.4); }
    // ---- piles: Zone A ----
    const avoidA = (x, z) => Math.abs(x) < 10 || (x > 80 && z > 15 && z < 75) || (x > 22 && x < 50 && z > 68) || (x < -60 && x > -102 && z > 52) || (x < -165 && z > 15 && z < 45) || Math.abs(z - 50) < 4;
    this.spread(16, -195, 195, 8, 92, 'A', avoidA);
    // ---- Zone B ----
    this.building(-60, -40, 7, 6, 3, 0x8d8f86, 0x3d4a52, 'n', { map: '#899' });
    this.sign('SECURITY', -60, 3.5, -36.8, 0, 2.6, 0.6, '#2c3e50', '#fff', false);
    B.box(2.2, 0.85, 0.8, 0x4a4a4a, -60, 0, -42.3); this.col.boxC(-60, -42.3, 2.2, 0.8, 1);
    this.monitorScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ color: 0x050505 })); this.monitorScreen.position.set(-60, 1.3, -42.6); this.scene.add(this.monitorScreen);
    B.box(1.0, 0.7, 0.3, 0x222222, -60, 0.9, -42.75);
    // generator
    B.box(1.6, 1.3, 1.1, 0x6a7b3a, -50, 0, -47); B.box(0.5, 0.4, 0.06, 0x111111, -50, 0.7, -46.43); this.col.boxC(-50, -47, 1.6, 1.1, 1.3);
    this.genLight = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2200 })); this.genLight.position.set(-49.4, 1.15, -46.4); this.scene.add(this.genLight);
    // CCTV pole
    B.cyl(0.12, 0.15, 6, 0x555555, PLACES.cctv[0], 0, PLACES.cctv[1], 6); B.box(0.35, 0.3, 0.7, 0xdddddd, PLACES.cctv[0], 6, PLACES.cctv[1] - 0.3);
    this.col.circle(PLACES.cctv[0], PLACES.cctv[1], 0.3, 6);
    // warehouses (open front facing north)
    for (const [wx, wz] of [PLACES.warehouse1, PLACES.warehouse2]) {
      const w = 34, d = 22, h = 8;
      this.solidBox(w, h, 0.4, 0x7f8c8d, wx, 0, wz - d / 2); this.solidBox(0.4, h, d, 0x7f8c8d, wx - w / 2, 0, wz); this.solidBox(0.4, h, d, 0x7f8c8d, wx + w / 2, 0, wz);
      for (let i = 0; i < 9; i++) B.box(w / 9 + 0.1, 0.25, d + 1, i % 2 ? 0x95a5a6 : 0x8a9899, wx - w / 2 + (i + 0.5) * (w / 9), h, wz, 0, { rz: 0.0 });
      for (const dx of [-w / 2 + 1, w / 2 - 1]) this.solidBox(0.4, h, 0.4, 0x555555, wx + dx, 0, wz + d / 2);
      this.mapRects.push({ x: wx, z: wz, w, d, c: '#6c7a7d' });
      for (let k = 0; k < 6; k++) this.placeModel('barrel', wx - w / 2 + 2 + k * 1.1, wz - d / 2 + 1.2, 0, { height: 1.1, center: true });
      this.pile(wx - 8, wz - 2, 2.6, 'B'); this.pile(wx + 7, wz + 1, 2.2, 'B');
    }
    this.placeModel('garbage-truck', 20, -60, 0.6, { length: 8.5, tint: 0xb0a090, circles: true, map: '#6a6' });
    this.placeModel('vehicle-truck-red', -130, -20, 1.2, { length: 5, tint: 0xa08070, circles: true, map: '#a66' });
    this.spread(12, -195, 195, -76, -6, 'B', (x, z) => Math.abs(x) < 8 || (x > -70 && x < -40 && z < -32 && z > -52) || (x > 38 && x < 82 && z < -24) || (x > 128 && x < 172 && z < -24) || Math.abs(z + 40) < 4 || (x > 105 && x < 135 && z < -64));
    // ---- Zone C: containers ----
    const cols = [0xb03a2e, 0x2e6fb0, 0x3a8a4a, 0xd67a1e, 0x7a5a9a, 0x8a8a8a, 0x2a7a7a];
    for (let row = 0; row < 6; row++) {
      const z = -96 - row * 20;
      for (let x = 56; x <= 200; x += 14) {
        if (Math.abs(x - 116) < 9) continue; // main aisle
        if (Math.abs(x - PLACES.fakeBox[0]) < 16 && Math.abs(z - PLACES.fakeBox[1]) < 12) continue;
        if (rng() < 0.18) continue;
        const c = pick(rng, cols);
        this.container(x, z + (rng() - 0.5) * 2, 0, c, false, 0);
        if (rng() < 0.4) this.container(x, z, 0, pick(rng, cols), false, 1);
      }
    }
    { // the trail ends in a little clearing: a tarp, junk ring and a suspicious mound
      const [fx, fz] = PLACES.fakeBox;
      B.box(4.5, 0.03, 3.5, 0x2c4f7c, fx + 0.5, 0, fz, 0.2, { shadow: false });
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.3; if (Math.abs(Math.sin(a)) < 0.35 && Math.cos(a) < 0) continue; const r = 3.6 + rng() * 0.8; this.placeModel(pick(rng, ['barrel', 'pizza-box', 'carton', 'styrofoam', 'bag']), fx + Math.cos(a) * r, fz + Math.sin(a) * r, rng() * 6, { length: 0.7 + rng() * 0.5, collide: true }); }
      this.dyn.fakeMound = new THREE.Group();
      for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.25 + rng() * 0.4, 0.15 + rng() * 0.25, 0.25 + rng() * 0.4), new THREE.MeshLambertMaterial({ color: pick(rng, [0x6b5a45, 0x8a7a5a, 0x555555, 0x7a3b2b]) })); m.position.set((rng() - 0.5) * 1.1, 0.2 + rng() * 0.6, (rng() - 0.5) * 0.9); m.rotation.set(rng(), rng(), rng()); m.castShadow = true; this.dyn.fakeMound.add(m); }
      this.dyn.fakeMound.position.set(fx, 0, fz); this.scene.add(this.dyn.fakeMound);
      this.dyn.fakeBox = makeWhiteBox(); this.dyn.fakeBox.position.set(fx, 0, fz); this.dyn.fakeBox.rotation.y = -Math.PI / 2; this.scene.add(this.dyn.fakeBox);
      this.col.circle(fx, fz, 0.6, 1);
    }
    // spray-painted X on a container (clue 3)
    const xs = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g) => { g.clearRect(0, 0, 128, 128); g.strokeStyle = '#ff2a6d'; g.lineWidth = 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(20, 20); g.lineTo(108, 108); g.moveTo(108, 20); g.lineTo(20, 108); g.stroke(); g.font = 'bold 22px Arial'; g.fillStyle = '#ff2a6d'; g.fillText('G WAS HERE', 6, 124); }), transparent: true }));
    xs.position.set(PLACES.clue3[0], 1.4, PLACES.clue3[1] + 1.3); this.scene.add(xs);
    this.container(PLACES.clue3[0], PLACES.clue3[1], 0, 0x3a8a4a, false, 0);
    // boot prints (clue 1)
    const bp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3), new THREE.MeshBasicMaterial({ map: canvasTex(64, 160, (g) => { g.clearRect(0, 0, 64, 160); g.fillStyle = 'rgba(40,25,10,0.85)'; for (let i = 0; i < 5; i++) { const x = i % 2 ? 36 : 12; g.beginPath(); g.ellipse(x + 8, 150 - i * 32, 7, 13, 0, 0, 7); g.fill(); } }), transparent: true, depthWrite: false }));
    bp.rotation.x = -Math.PI / 2; bp.position.set(PLACES.clue1[0], 0.03, PLACES.clue1[1]); this.scene.add(bp);
    // snack wrapper (clue 2)
    this.placeModel('candy-bar-wrapper', PLACES.clue2[0], PLACES.clue2[1], 0.7, { length: 0.5, collide: false });
    this.placeModel('fish-bones', PLACES.clue2[0] + 0.6, PLACES.clue2[1] + 0.3, 2, { length: 0.4, collide: false });
    this.photoTargets.push({ id: 'clue1', x: PLACES.clue1[0], y: 0.1, z: PLACES.clue1[1], name: 'Muddy boot prints' }, { id: 'clue2', x: PLACES.clue2[0], y: 0.15, z: PLACES.clue2[1], name: 'Chewed snack wrapper' }, { id: 'clue3', x: PLACES.clue3[0], y: 1.4, z: PLACES.clue3[1] + 1.3, name: 'Spray-painted X' });
    this.spread(8, 50, 200, -210, -86, 'C', (x, z) => Math.abs(x - 116) < 9 || Math.hypot(x - PLACES.fakeBox[0], z - PLACES.fakeBox[1]) < 10);
    // ---- Zone D: garbage mountains & trailers ----
    for (const [x, z, r, h] of [[-160, -250, 30, 22], [-90, -275, 22, 16], [-30, -275, 20, 15], [-110, -210, 18, 13], [-180, -200, 14, 10], [-40, -190, 16, 12], [10, -120, 14, 9], [-80, -110, 12, 8], [-190, -95, 11, 8], [15, -250, 14, 10]]) this.mountain(x, z, r, h);
    for (const [x, z, ry, c] of [[-150, -125, 0, 0xc9b79c], [-180, -150, Math.PI / 2, 0xa7c4bc], [-125, -150, 0, 0xd6c8a8], [-168, -186, 0, 0xb5a38a]]) this.trailer(x, z, ry, c);
    this.spread(16, -205, 35, -296, -84, 'D', (x, z) => this.col.hit(x, z, 3) || Math.abs(z + 150) < 4);
    // tunnel entrance (covered until discovered)
    const [tx, tz] = PLACES.tunnel;
    B.box(4, 3, 0.6, 0x3a3a3a, tx, 0, tz - 2.4); B.box(0.6, 3, 3, 0x3a3a3a, tx - 2.2, 0, tz - 1); B.box(0.6, 3, 3, 0x3a3a3a, tx + 2.2, 0, tz - 1); B.box(5, 0.5, 3.5, 0x333333, tx, 3, tz - 1);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8), new THREE.MeshBasicMaterial({ color: 0x000000 })); hole.position.set(tx, 1.4, tz - 2.05); this.scene.add(hole);
    this.col.boxC(tx, tz - 2.4, 4, 0.6, 4);
    const cover = new THREE.Group(); for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1 + Math.random(), 0.6 + Math.random(), 0.8), new THREE.MeshLambertMaterial({ color: pick(rng, [0x6b5a45, 0x555555, 0x7a3b2b]) })); m.position.set((Math.random() - 0.5) * 3.4, Math.random() * 2.4, -1.4 + Math.random() * 0.6); m.rotation.set(Math.random(), Math.random(), Math.random()); m.castShadow = true; cover.add(m); }
    cover.position.set(tx, 0, tz); this.scene.add(cover); this.dyn.tunnelCover = cover;
    // ---- Secret compound ----
    const [sx, sz] = PLACES.secret;
    this.building(sx, sz, 22, 14, 5, 0x5d6d5e, 0x2f3a30, 'w', { windows: false, map: '#5d6d5e', doorW: 2 });
    this.sign('STORAGE\n(NOT A GAMING ROOM)', sx - 11.2, 3.8, sz + 4, -Math.PI / 2, 4, 1.4, '#eee', '#222', false);
    this.col.boxC(sx, sz, 21.5, 13.5, 6); // solid from outside (door is a teleport)
    const [hx, hz] = PLACES.hatch; B.cyl(0.8, 0.8, 0.2, 0x444444, hx, 0, hz, 12); B.box(0.1, 1.2, 0.1, 0x777777, hx + 0.5, 0, hz);
    for (let i = 0; i < 5; i++) this.placeModel('barrel', 60 + rng() * 40, -235 - rng() * 55, 0, { height: 1.1, center: true });
    this.placeModel('headphones', sx - 13, sz - 5, 0.4, { length: 0.6, collide: false });
    this.lamp(140, -240, 5, 0xbbe0ff); this.lamp(100, -280, 5, 0xbbe0ff);
    // ---- rare objects for the scanner (8) ----
    const rares = [
      ['r1', 'Ancient Game Cartridge', -120, 62], ['r2', 'Haunted Teddy Bear', 180, 88], ['r3', 'Meteorite (probably)', -150, -60], ['r4', 'Golden Toilet', 190, -10],
      ['r5', 'Alien Antenna', 196, -205], ['r6', 'VHS: "DO NOT WATCH"', -200, -270], ['r7', 'Fossilised Hot Dog', 1072, -36], ['r8', 'Cursed Wi-Fi Router', 1404, -6],
    ];
    const rareMats = [0x9b59b6, 0xc0392b, 0x34495e, 0xf1c40f, 0x1abc9c, 0x111111, 0xd35400, 0x2c3e50];
    rares.forEach(([id, name, x, z], i) => {
      const m = new THREE.Mesh(i === 3 ? new THREE.CylinderGeometry(0.35, 0.25, 0.6, 10) : new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshStandardMaterial({ color: rareMats[i], metalness: i === 3 ? 1 : 0.2, roughness: 0.4, emissive: rareMats[i], emissiveIntensity: 0.25 }));
      m.position.set(x, 0.35, z); m.castShadow = true; this.scene.add(m);
      this.scannables.push({ id, x, y: 0.4, z, r: 6, kind: 'rare', name, mesh: m });
    });
    // story scannables
    this.scannables.push({ id: 'fakebox', x: PLACES.fakeBox[0], y: 0.5, z: PLACES.fakeBox[1], r: 8, kind: 'story', name: 'Suspicious white box' });
    this.scannables.push({ id: 'tunnel', x: tx, y: 1, z: tz - 1.5, r: 9, kind: 'story', name: 'Hollow ground' });
    this.scannables.push({ id: 'trapdoor', x: PLACES.trailerHidden[0], y: 0.2, z: PLACES.trailerHidden[1], r: 4, kind: 'story', name: 'Hollow floor' });
    // lamps in junkyard
    for (const [x, z] of [[-14, 96], [14, 96], [30, 70], [-70, 60], [0, 40], [-60, -30], [60, -20], [120, -70], [0, -70], [116, -140], [116, -200], [-60, -140], [-178, 40], [150, 60]]) this.lamp(x, z, 6.5, 0xffc98a);
  }
  spread(n, x0, x1, z0, z1, zone, avoid) {
    let tries = 0, made = 0;
    while (made < n && tries++ < 600) {
      const x = x0 + this.rng() * (x1 - x0), z = z0 + this.rng() * (z1 - z0), r = 1.8 + this.rng() * 1.6;
      if (avoid(x, z)) continue; if (this.col.hit(x, z, r + 2.5)) continue;
      if (this.piles.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 4)) continue;
      this.pile(x, z, r, zone); made++;
    }
  }
  buildInteriors() {
    const B = this.B;
    const room = (x0, z0, x1, z1, h, wall, floor, ceil) => {
      B.box(x1 - x0, 0.1, z1 - z0, floor, (x0 + x1) / 2, -0.1, (z0 + z1) / 2, 0, { shadow: false });
      B.box(x1 - x0, 0.2, z1 - z0, ceil, (x0 + x1) / 2, h, (z0 + z1) / 2);
    };
    const wallSeg = (x0, z0, x1, z1, h, c) => { const w = Math.abs(x1 - x0) || 0.3, d = Math.abs(z1 - z0) || 0.3; this.solidBox(w, h, d, c, (x0 + x1) / 2, 0, (z0 + z1) / 2); };
    // ---- tunnels: corridors as rooms with walls ----
    const T = 3.4, cw = 2.2, wc = 0x4b4a46, fc = 0x2e2c29;
    const corr = (ax, az, bx, bz) => { // axis aligned corridor centreline
      const x0 = Math.min(ax, bx) - cw, x1 = Math.max(ax, bx) + cw, z0 = Math.min(az, bz) - cw, z1 = Math.max(az, bz) + cw;
      room(x0, z0, x1, z1, T, wc, fc, 0x3a3936);
      return { x0, x1, z0, z1 };
    };
    const segs = [corr(1000, 2, 1000, -40), corr(1000, -40, 1040, -40), corr(1040, -40, 1040, -80), corr(1040, -80, 1092, -80), corr(1040, -40, 1074, -40), corr(1000, -40, 978, -40), corr(978, -40, 978, -66)];
    // walls: build a grid mask and place wall blocks on boundary cells
    const inside = (x, z) => segs.some((s) => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1);
    for (let x = 970; x <= 1100; x += 1) for (let z = -90; z <= 10; z += 1) {
      const c = inside(x + 0.5, z + 0.5); if (c) continue;
      if (inside(x + 1.5, z + 0.5) || inside(x - 0.5, z + 0.5) || inside(x + 0.5, z + 1.5) || inside(x + 0.5, z - 0.5) || inside(x + 1.5, z + 1.5) || inside(x - 0.5, z - 0.5) || inside(x + 1.5, z - 0.5) || inside(x - 0.5, z + 1.5)) {
        B.box(1, T, 1, (x + z) % 3 ? wc : 0x55534d, x + 0.5, 0, z + 0.5, 0, { jitter: 0.1 }); this.col.box(x, z, x + 1, z + 1, 9);
      }
    }
    // pipes, puddles, junk, lamps in the tunnel
    for (let z = 0; z > -40; z -= 4) B.prim(new THREE.CylinderGeometry(0.15, 0.15, 4, 6), 0x6d4c33, 998.2, 2.6, z - 2, 0, Math.PI / 2, 0);
    for (let x = 1000; x < 1092; x += 4) B.prim(new THREE.CylinderGeometry(0.12, 0.12, 4, 6), 0x4c5d6d, x + 2, 2.8, -81.9, 0, 0, Math.PI / 2);
    this.tunnelLamps = [[1000, -10], [1000, -36], [1030, -40], [1040, -62], [1065, -80], [1086, -80], [1070, -40], [978, -60]];
    for (const [x, z] of this.tunnelLamps) { B.box(0.4, 0.1, 0.4, 0xffeeaa, x, T - 0.15, z, 0, { glow: true }); this.lamps.push({ x, y: T - 0.4, z, color: 0xffb060, interior: true, flicker: true }); }
    this.pile(1003, -55 + 15, 1.4, 'tunnel', { n: 10 }); this.pile(1072, -38, 1.3, 'tunnel', { n: 8 }); this.pile(978, -62, 1.5, 'tunnel', { n: 10 });
    B.box(1.2, 0.1, 0.4, 0x888888, 1000, 0, 0.8); for (let i = 0; i < 6; i++) B.box(0.8, 0.06, 0.06, 0x999999, 1000, 0.4 + i * 0.5, 1.6);
    for (let i = 0; i < 6; i++) B.box(0.8, 0.06, 0.06, 0x999999, 1091.6, 0.4 + i * 0.5, -80);
    this.sign('THIS WAY →\n(probably)', 1003, 2, -37.9, Math.PI, 2, 0.9, '#ddd', '#222', false);
    // ---- secret bunker ----
    const bx = 1200;
    room(bx - 9, -11, bx + 9, 10, 3.6, 0x3f4a3f, 0x3a2f2a, 0x2f3530);
    wallSeg(bx - 9, -11, bx + 9, -11, 3.6, 0x46524a); wallSeg(bx - 9, 10, bx + 9, 10, 3.6, 0x46524a); wallSeg(bx - 9, -11, bx - 9, 10, 3.6, 0x46524a); wallSeg(bx + 9, -11, bx + 9, 10, 3.6, 0x46524a);
    // vault chamber behind
    room(bx - 3, -18, bx + 3, -11, 3.6, 0x333333, 0x222222, 0x222222);
    wallSeg(bx - 3, -18, bx + 3, -18, 3.6, 0x777777); wallSeg(bx - 3, -18, bx - 3, -11, 3.6, 0x777777); wallSeg(bx + 3, -18, bx + 3, -11, 3.6, 0x777777);
    // couch, TV, rug, fridge, desk
    B.box(4.5, 0.5, 1.6, 0x7a2f2f, bx + 3, 0, 4); B.box(4.5, 1.1, 0.4, 0x6a2525, bx + 3, 0, 4.8); this.col.boxC(bx + 3, 4.2, 4.5, 1.8, 1.1);
    B.box(3, 0.6, 0.7, 0x2a2a2a, bx + 3, 0, -2); this.col.boxC(bx + 3, -2, 3, 0.7, 1);
    B.box(2.6, 1.5, 0.15, 0x111111, bx + 3, 0.65, -2.1); B.box(2.4, 1.3, 0.02, 0x3355ff, bx + 3, 0.75, -2.0, 0, { glow: true });
    B.box(4, 0.02, 3, 0x7d5ba6, bx + 3, 0, 1, 0, { shadow: false });
    B.box(1, 1.9, 0.9, 0xdddddd, bx - 8, 0, 8); this.col.boxC(bx - 8, 8, 1, 0.9, 2);
    B.box(2.2, 0.85, 1, 0x6b4f3a, bx - 7, 0, -4); this.col.boxC(bx - 7, -4, 2.2, 1, 1);
    this.placeModel('headphones', bx - 6.4, -4, 0.5, { length: 0.4, y: 0.85, collide: false });
    this.placeModel('pizza-box', bx + 1.5, 2.4, 0.3, { length: 0.6, y: 0.02, collide: false });
    this.placeModel('soda-can', bx + 4.5, 2, 0, { height: 0.15, y: 0.0, collide: false });
    for (const [i, t] of ['RACING\nLEGEND', 'GAMER\nGUS', '1st PLACE\nTOWN KART CUP 1987'].entries()) this.sign(t, bx - 8.85, 2.1, -6 + i * 4, Math.PI / 2, 2, 1.4, ['#e63946', '#1d3557', '#f4a261'][i], '#fff', false);
    // vault door (round)
    const vd = new THREE.Group(); const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0x8a9097, metalness: 0.9, roughness: 0.35 }));
    disc.rotation.x = Math.PI / 2; vd.add(disc); for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.8, roughness: 0.4 })); sp.rotation.z = (i / 6) * Math.PI * 2; sp.position.z = 0.25; sp.position.x = Math.sin(sp.rotation.z) * -0.6; sp.position.y = Math.cos(sp.rotation.z) * 0.6; vd.add(sp); }
    vd.position.set(bx, 1.6, -10.8); vd.traverse((o) => { if (o.isMesh) o.castShadow = true; }); this.scene.add(vd); this.dyn.vaultDoor = vd;
    this.dyn.vaultCol = this.col.boxC(bx, -11, 3.4, 0.8, 9);
    B.box(0.4, 0.6, 0.12, 0x222222, bx + 2.2, 1.2, -10.9); B.box(0.3, 0.12, 0.02, 0x33ff66, bx + 2.2, 1.35, -10.83, 0, { glow: true });
    // pedestal + PS5 (hidden until vault opens)
    B.cyl(0.6, 0.7, 1.1, 0xeeeeee, bx, 0, -15, 16);
    this.dyn.ps5 = makePS5(); this.dyn.ps5.position.set(bx, 1.1, -15); this.scene.add(this.dyn.ps5);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 3.6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fd3ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    beam.position.set(bx, 1.8, -15); this.scene.add(beam); this.dyn.beam = beam;
    this.lamps.push({ x: bx, y: 3, z: 0, color: 0xffd7a0, interior: true }, { x: bx + 3, y: 1.4, z: -1.2, color: 0x4466ff, interior: true }, { x: bx, y: 3.2, z: -15, color: 0xbfe3ff, interior: true });
    // ---- hidden room under trailer ----
    const hx = 1400; room(hx - 5, -6, hx + 5, 5, 2.8, 0x4a3a2a, 0x3a2a1a, 0x2a2018);
    wallSeg(hx - 5, -6, hx + 5, -6, 2.8, 0x5a4632); wallSeg(hx - 5, 5, hx + 5, 5, 2.8, 0x5a4632); wallSeg(hx - 5, -6, hx - 5, 5, 2.8, 0x5a4632); wallSeg(hx + 5, -6, hx + 5, 5, 2.8, 0x5a4632);
    for (let i = 0; i < 5; i++) B.box(0.8, 0.06, 0.06, 0x999999, hx, 0.4 + i * 0.5, 4.6);
    B.box(1.4, 1, 1, 0x8a6d3b, hx, 0, -4); this.col.boxC(hx, -4, 1.4, 1, 1);
    this.dyn.gold = model('nes-controller', { length: 0.6, tint: 0xffd700, metal: 1, rough: 0.25, emissive: 0x553300, emissiveIntensity: 0.5 });
    this.dyn.gold.position.set(hx, 1.05, -4); this.scene.add(this.dyn.gold);
    this.sign('THE SHRINE OF\nTHE GOLDEN\nCONTROLLER', hx, 2, -5.8, 0, 2.2, 1.3, '#111', '#ffd700', false);
    this.lamps.push({ x: hx, y: 2.4, z: -2, color: 0xffcc66, interior: true });
    this.pile(hx + 3, 2, 1.2, 'hidden', { n: 8 });
  }
  buildMapCanvas() {
    // top-down map: ground texture + footprints
    const src = this.groundTex.userData.canvas; const S = 1.6; // px per metre
    const c = document.createElement('canvas'); c.width = GW * S; c.height = GD * S; const g = c.getContext('2d');
    g.drawImage(src, 0, 0, c.width, c.height);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 0, c.width, c.height);
    for (const r of this.mapRects) {
      if (r.gate) continue;
      const x = (r.x - BOUNDS.x0) * S, y = (r.z - BOUNDS.z0) * S;
      g.fillStyle = r.c; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
      if (r.round) { g.beginPath(); g.ellipse(x, y, (r.w / 2) * S, (r.d / 2) * S, 0, 0, 7); g.fill(); g.stroke(); }
      else { g.fillRect(x - (r.w / 2) * S, y - (r.d / 2) * S, r.w * S, r.d * S); g.strokeRect(x - (r.w / 2) * S, y - (r.d / 2) * S, r.w * S, r.d * S); }
    }
    this.mapCanvas = c; this.mapScale = S;
  }
  update(dt, t) {
    for (const g of Object.values(this.gates)) {
      const target = g.open ? 1 : 0; g.t += Math.sign(target - g.t) * Math.min(Math.abs(target - g.t), dt * 0.6);
      for (const l of g.leaves) l.pivot.rotation.y = l.side * g.t * 1.6 * (g.alongX ? 1 : 1);
    }
    if (this.dyn.ps5) { this.dyn.ps5.rotation.y += dt * 0.5; }
    if (this.dyn.gold) { this.dyn.gold.rotation.y += dt * 0.8; this.dyn.gold.position.y = 1.05 + Math.sin(t * 2) * 0.05; }
    for (const s of this.scannables) if (s.mesh) { s.mesh.rotation.y += dt; }
  }
}

// a generic white "next-gen" console (original design)
export function makePS5() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 0.35, metalness: 0.05 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.3, metalness: 0.3 });
  const blue = new THREE.MeshBasicMaterial({ color: 0x3aa0ff });
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.26), black); core.position.y = 0.22; g.add(core);
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(0.22, 0); shape.quadraticCurveTo(0.3, 0.25, 0.24, 0.48); shape.quadraticCurveTo(0.12, 0.52, 0.02, 0.46); shape.lineTo(0, 0);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 10 }), white);
    p.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; p.position.set(s * 0.065, -0.01, s > 0 ? -0.13 : 0.13); g.add(p);
  }
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.36, 0.006), blue); led.position.set(0, 0.24, 0.131); g.add(led);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16), black); base.position.y = 0.0; g.add(base);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.scale.setScalar(1.4);
  return g;
}
export function makeWhiteBox() {
  const g = new THREE.Group();
  const label = textSign('PS-FIVE\n(100% REAL)', 1, 0.8, '#f8f8f8', '#2244aa', 'bold 90px Arial Black, Impact, sans-serif');
  const mats = [new THREE.MeshLambertMaterial({ color: 0xf0f0ee }), new THREE.MeshLambertMaterial({ color: 0xf0f0ee }), new THREE.MeshLambertMaterial({ color: 0xf6f6f4 }), new THREE.MeshLambertMaterial({ color: 0xe0e0dd }), new THREE.MeshLambertMaterial({ map: label }), new THREE.MeshLambertMaterial({ map: label })];
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.5), mats); box.position.y = 0.3; box.castShadow = true; g.add(box);
  g.userData.box = box; return g;
}
