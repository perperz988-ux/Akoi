// Airport scenery generated from real runway data + deterministic layout.
import * as THREE from 'three';
import { Airport, RunwayEnd, airportsNear } from '../data/world';
import { origin, DEG, hash2, mulberry, clamp, haversine } from '../core/geo';
import { layoutOf, Layout, V2, endInfo, hdgOf, Gate } from './AirportLayout';
import { AIRCRAFT, LIVERIES } from '../data/aircraft';
import { buildStaticAircraft, glowSprite } from '../aircraft/Model';

// ---------- shared textures/materials ----------
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!; draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
function noise(g: CanvasRenderingContext2D, w: number, h: number, base: [number, number, number], amp: number, n = 6000) {
  g.fillStyle = `rgb(${base.join(',')})`; g.fillRect(0, 0, w, h);
  const r = mulberry(7);
  for (let i = 0; i < n; i++) { const v = (r() - 0.5) * amp; g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
}
let M: ReturnType<typeof makeMats> | null = null;
function makeMats() {
  const asphalt = canvasTex(256, 512, g => {
    noise(g, 256, 512, [52, 54, 57], 40, 12000);
    // tyre marks band near centre
    g.fillStyle = 'rgba(20,20,20,0.18)'; g.fillRect(90, 0, 76, 512);
    g.fillStyle = '#e8e8e8'; g.fillRect(125, 0, 6, 307); // centreline 36 m of 60 m
    g.fillRect(2, 0, 4, 512); g.fillRect(250, 0, 4, 512); // edge stripes
  });
  const taxi = canvasTex(128, 128, g => {
    noise(g, 128, 128, [70, 72, 74], 30, 2500);
    g.fillStyle = '#d9a514'; g.fillRect(62, 0, 4, 128);
    g.fillStyle = '#d9a514'; g.fillRect(2, 0, 2, 128); g.fillRect(124, 0, 2, 128);
  });
  const concrete = canvasTex(256, 256, g => {
    noise(g, 256, 256, [122, 122, 118], 26, 5000);
    g.strokeStyle = 'rgba(70,70,70,0.16)'; g.lineWidth = 1;
    for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  });
  const facade = canvasTex(512, 256, g => {
    g.fillStyle = '#3b4552'; g.fillRect(0, 0, 512, 256);
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#6d8aa6'); gr.addColorStop(1, '#2b3a4a');
    g.fillStyle = gr; g.fillRect(0, 30, 512, 200);
    g.fillStyle = '#c9ced4'; for (let x = 0; x < 512; x += 32) g.fillRect(x, 30, 3, 200); g.fillRect(0, 30, 512, 4); g.fillRect(0, 128, 512, 3); g.fillRect(0, 226, 512, 4);
    g.fillStyle = '#d7dadf'; g.fillRect(0, 0, 512, 30); g.fillRect(0, 230, 512, 26);
  });
  const facadeNight = canvasTex(512, 256, g => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 256);
    const r = mulberry(3);
    for (let x = 0; x < 512; x += 32) for (const y of [34, 131]) { const on = r() > 0.25; g.fillStyle = on ? `rgba(255,${200 + r() * 40},${140 + r() * 60},${0.5 + r() * 0.5})` : '#000'; g.fillRect(x + 3, y, 29, 92); }
  });
  const hangarTex = canvasTex(256, 256, g => { g.fillStyle = '#a7adb3'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#8c9299'; for (let x = 0; x < 256; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); } });
  const grass = new THREE.MeshStandardMaterial({ color: 0x4f6a33, roughness: 1 });
  const std = (map: THREE.Texture, rough = 0.9, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0, ...extra });
  return {
    asphalt: std(asphalt, 0.85), taxi: std(taxi, 0.88), concrete: std(concrete, 0.9, { emissive: new THREE.Color(0xffd9a0), emissiveIntensity: 0 }),
    facade: new THREE.MeshStandardMaterial({ map: facade, roughness: 0.25, metalness: 0.4, emissiveMap: facadeNight, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.5, metalness: 0.5 }),
    hangar: std(hangarTex, 0.6, { metalness: 0.4 }), white: new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2a38, roughness: 0.08, metalness: 0.9, emissive: new THREE.Color(0x9fd4ff), emissiveIntensity: 0 }),
    bridge: new THREE.MeshStandardMaterial({ color: 0xc6cacf, roughness: 0.5, metalness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.7 }),
    yellow: new THREE.MeshBasicMaterial({ color: 0xd9a514 }), grass,
    shoulder: std(canvasTex(64, 64, g => noise(g, 64, 64, [64, 66, 66], 30, 800)), 0.9),
    sign: new Map<string, THREE.Material>(),
  };
}
const mats = () => (M ||= makeMats());

function quad(p: [V2, V2, V2, V2], y: number, uv: [number, number][]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([p[0][0], y, p[0][1], p[1][0], y, p[1][1], p[2][0], y, p[2][1], p[3][0], y, p[3][1]], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv.flat(), 2));
  const e1x = p[1][0] - p[0][0], e1z = p[1][1] - p[0][1], e2x = p[2][0] - p[0][0], e2z = p[2][1] - p[0][1];
  const ny = e1z * e2x - e1x * e2z; // y component of e1 x e2
  g.setIndex(ny > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3]);
  return g;
}
/** strip from a to b of width w: corners [aL, aR, bL, bR] where L/R relative to direction a->b */
function strip(a: V2, b: V2, w: number, y: number, vScale: number) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; const ux = dx / L, uz = dz / L;
  const rx = -uz * w / 2, rz = ux * w / 2;
  return quad([[a[0] - rx, a[1] - rz], [a[0] + rx, a[1] + rz], [b[0] - rx, b[1] - rz], [b[0] + rx, b[1] + rz]], y, [[0, 0], [1, 0], [0, L / vScale], [1, L / vScale]]);
}

function decalTexture(ident: string, widthM: number) {
  const W = 256, H = 2048, LEN = 600; const ppmX = W / widthM, ppmY = H / LEN;
  return canvasTex(W, H, g => {
    g.clearRect(0, 0, W, H); g.fillStyle = '#efefef';
    const Y = (d: number) => H - d * ppmY; // distance from threshold -> canvas y
    // threshold bar & piano keys
    g.fillRect(0, Y(3), W, 3 * ppmY);
    const nk = widthM >= 45 ? 16 : widthM >= 30 ? 12 : 8; const kw = 1.8 * ppmX; const gap = (W - 6 * ppmX - nk * kw) / (nk - 1 + 2);
    for (let i = 0; i < nk; i++) { const x = 3 * ppmX + gap + i * (kw + gap) + (i >= nk / 2 ? gap * 0.8 : 0) - (i >= nk / 2 ? 0 : 0); g.fillRect(x - (i >= nk / 2 ? gap * 0.8 : 0) + (i >= nk / 2 ? gap * 0.8 : 0), Y(36), kw, 30 * ppmY); }
    // designator
    const m = ident.match(/^(\d+)([LRC]?)$/); const num = m ? m[1] : ident; const let_ = m ? m[2] : '';
    const draw = (txt: string, dist: number, hM: number) => { g.save(); g.translate(W / 2, Y(dist)); g.scale(1, ppmY / ppmX); g.font = `bold ${hM * ppmX}px Arial Narrow, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(txt, 0, 0); g.restore(); };
    if (let_) draw(let_, 48, 16);
    draw(num, let_ ? 72 : 52, 18);
    // touchdown zone and aiming point
    const pair = (dist: number, bars: number, len: number, bw: number) => {
      for (const s of [-1, 1]) for (let i = 0; i < bars; i++) { const x = W / 2 + s * (widthM * 0.18 + i * 2.6) * ppmX; g.fillRect(x - (s < 0 ? bw * ppmX : 0), Y(dist + len), bw * ppmX, len * ppmY); }
    };
    pair(150, 3, 22.5, 1.8); pair(300, 1, 45, widthM >= 45 ? 9 : 6); pair(450, 2, 22.5, 1.8); pair(560, 1, 22.5, 1.8);
  }, false);
}

function signTexture(text: string, type: 'mandatory' | 'location' | 'direction') {
  return canvasTex(256, 64, g => {
    g.fillStyle = type === 'mandatory' ? '#c21a1a' : type === 'location' ? '#111' : '#f1c40f'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = type === 'mandatory' ? '#fff' : type === 'location' ? '#f1c40f' : '#111';
    g.font = 'bold 42px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 34);
    if (type === 'location') { g.strokeStyle = '#f1c40f'; g.lineWidth = 4; g.strokeRect(4, 4, 248, 56); }
  }, false);
}

// ---------- lights ----------
const lightVert = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aColor; attribute vec4 aInfo; // x size, y papi angle (deg, 0=none), z flash phase (-1 none), w directional (0/1)
uniform float uI, uTime, uFogD, uScale; uniform vec3 uCam;
varying vec3 vCol; varying float vA;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vec3 d = uCam - wp.xyz; float dist = length(d);
  vec3 col = aColor;
  if (aInfo.y > 0.0) { float ang = degrees(atan(d.y, length(d.xz))); col = ang > aInfo.y ? vec3(1.0, 0.95, 0.9) : vec3(1.0, 0.08, 0.05); }
  float a = uI;
  if (aInfo.z >= 0.0) { float ph = fract(uTime * 2.0 - aInfo.z); a = smoothstep(0.08, 0.0, ph) * 2.5; }
  float fogT = exp(-pow(dist * uFogD * 0.55, 2.0));
  vCol = col; vA = a * fogT;
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aInfo.x * uScale / max(1.0, -mv.z) * 900.0, 1.5, 22.0) * (0.6 + 0.4 * min(1.0, a));
  #include <logdepthbuf_vertex>
}`;
const lightFrag = /* glsl */`
#include <logdepthbuf_pars_fragment>
varying vec3 vCol; varying float vA;
void main(){
  #include <logdepthbuf_fragment>
  vec2 p = gl_PointCoord * 2.0 - 1.0; float r = dot(p, p); if (r > 1.0) discard;
  float core = exp(-r * 5.0);
  gl_FragColor = vec4(vCol * (core * 1.8 + 0.2), core * vA);
}`;
export const lightUniforms = { uI: { value: 1 }, uTime: { value: 0 }, uFogD: { value: 0.0001 }, uScale: { value: 1 }, uCam: { value: new THREE.Vector3() } };
const lightMat = () => new THREE.ShaderMaterial({ uniforms: lightUniforms, vertexShader: lightVert, fragmentShader: lightFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

class LightBuilder {
  pos: number[] = []; col: number[] = []; info: number[] = [];
  add(p: V2, y: number, c: [number, number, number], size = 1, papi = 0, flash = -1) { this.pos.push(p[0], y, p[1]); this.col.push(...c); this.info.push(size, papi, flash, 0); }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3)); g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 4));
    const p = new THREE.Points(g, lightMat()); p.frustumCulled = false; p.renderOrder = 8; return p;
  }
}
const WHITE: [number, number, number] = [1, 0.95, 0.85], YEL: [number, number, number] = [1, 0.8, 0.3], RED: [number, number, number] = [1, 0.1, 0.06], GRN: [number, number, number] = [0.2, 1, 0.35], BLUE: [number, number, number] = [0.25, 0.4, 1];

// ---------- vehicles ----------
interface Vehicle { obj: THREE.Object3D; path: V2[]; t: number; speed: number; beacon: THREE.Object3D }
function vehicleMesh(kind: number, r: () => number) {
  const g = new THREE.Group();
  const colors = [0xf2c200, 0xffffff, 0xd8dde2, 0x2c6cc4, 0xe46f1b];
  const body = new THREE.MeshStandardMaterial({ color: colors[kind % colors.length], roughness: 0.5 });
  const dims: [number, number, number][] = [[2.2, 1.5, 4], [2.6, 3.0, 12], [2.5, 2.8, 9], [2.0, 1.6, 3.5], [2.4, 2.2, 6]];
  const [w, h, l] = dims[kind % dims.length];
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), body); b.position.y = h / 2 + 0.4; g.add(b);
  if (kind === 2) { const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, l * 0.65, 12).rotateX(Math.PI / 2), mats().white); tank.position.set(0, h * 0.75 + 0.4, l * 0.12); g.add(tank); }
  if (kind === 1) { const win = new THREE.Mesh(new THREE.BoxGeometry(w * 1.01, h * 0.35, l * 0.9), mats().glass); win.position.y = h * 0.7 + 0.4; g.add(win); }
  const wm = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  for (const sx of [-1, 1]) for (const sz of [-0.35, 0.35]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10).rotateZ(Math.PI / 2), wm); wh.position.set(sx * w / 2, 0.4, sz * l); g.add(wh); }
  const beacon = glowSprite(0xffa020, 1.4); beacon.position.y = h + 0.7; g.add(beacon);
  void r;
  return { g, beacon };
}

export class AirportScenery {
  group = new THREE.Group(); ap: Airport; layout: Layout;
  private lights: THREE.Points; private vehicles: Vehicle[] = []; private towerBeacon: THREE.Object3D[] = []; private windsocks: THREE.Object3D[] = [];
  private shift = () => this.place();
  playerGate: Gate | null = null; private statics: THREE.Object3D[] = [];
  constructor(ap: Airport, opts: { playerSpan?: number; reserveGate?: boolean } = {}) {
    this.ap = ap; this.layout = layoutOf(ap);
    const L = this.layout; const m = mats(); const r = mulberry(hash2(Math.round(ap.lat * 100), Math.round(ap.lon * 100)) * 1e9);
    const lb = new LightBuilder();
    // runways
    for (const rl of L.rwys) {
      const rw = rl.rw;
      const shoulder = strip(rl.a, rl.b, rl.width + 14, 0.18, 30); this.mesh(shoulder, m.shoulder, true);
      const g = strip(rl.a, rl.b, rl.width, 0.25, 60); this.mesh(g, rw.hard ? m.asphalt : m.grass, true);
      for (const end of rw.ends) {
        const ei = endInfo(L, end);
        const far: V2 = [ei.thr[0] + ei.dir[0] * Math.min(600, rl.len / 2), ei.thr[1] + ei.dir[1] * Math.min(600, rl.len / 2)];
        const dg = strip(ei.thr, far, rl.width, 0.3, 1);
        // flip v so canvas bottom is at threshold
        const uv = dg.getAttribute('uv') as THREE.BufferAttribute; const k = Math.min(600, rl.len / 2) / 600;
        uv.setXY(0, 0, 0); uv.setXY(1, 1, 0); uv.setXY(2, 0, k); uv.setXY(3, 1, k);
        if (rw.hard) this.mesh(dg, new THREE.MeshStandardMaterial({ map: decalTexture(end.ident, rl.width), transparent: true, roughness: 0.8, depthWrite: false }), true);
        // lighting
        if (rw.lighted || rw.hard) this.runwayLights(lb, rl, ei, ap.size);
      }
      // edge lights
      if (rw.lighted || rw.hard) {
        const n = Math.max(2, Math.round(rl.len / 60));
        for (let i = 0; i <= n; i++) { const t = i / n; const p: V2 = [rl.a[0] + rl.dir[0] * rl.len * t, rl.a[1] + rl.dir[1] * rl.len * t]; const nearEnd = Math.min(t, 1 - t) * rl.len < 600; for (const s of [-1, 1]) lb.add([p[0] + rl.nrm[0] * s * (rl.width / 2 + 1.5), p[1] + rl.nrm[1] * s * (rl.width / 2 + 1.5)], 0.7, nearEnd ? YEL : WHITE, 1.0); }
        if (ap.size >= 1) { const nc = Math.round(rl.len / 15); for (let i = 1; i < nc; i++) { const t = i / nc; const dEnd = Math.min(t, 1 - t) * rl.len; const c = dEnd < 300 ? RED : dEnd < 900 && i % 2 ? RED : WHITE; lb.add([rl.a[0] + rl.dir[0] * rl.len * t, rl.a[1] + rl.dir[1] * rl.len * t], 0.32, c, 0.6); } }
      }
      // parallel taxiway + connectors
      const tw = 23;
      const twyPts: [V2, V2][] = [[rl.twyA, rl.twyB], [rl.a, rl.twyA], [rl.b, rl.twyB]];
      for (const e of rl.exits) twyPts.push([[rl.a[0] + rl.dir[0] * rl.len * e, rl.a[1] + rl.dir[1] * rl.len * e], [rl.twyA[0] + rl.dir[0] * rl.len * e, rl.twyA[1] + rl.dir[1] * rl.len * e]]);
      for (const [a, b] of twyPts) { this.taxiway(a, b, tw, lb); }
      // signs at holding points
      for (const [i, end] of rw.ends.entries()) {
        const start = i === 0 ? rl.a : rl.b; const twEnd = i === 0 ? rl.twyA : rl.twyB;
        const hp: V2 = [start[0] + rl.nrm[0] * rl.side * (rl.width / 2 + 55), start[1] + rl.nrm[1] * rl.side * (rl.width / 2 + 55)];
        const dir: V2 = [twEnd[0] - start[0], twEnd[1] - start[1]];
        this.sign([hp[0] + rl.dir[0] * 20, hp[1] + rl.dir[1] * 20], hdgOf(dir) + 180, `${rw.ends[0].ident}-${rw.ends[1].ident}`, 'mandatory');
        this.sign([hp[0] - rl.dir[0] * 20, hp[1] - rl.dir[1] * 20], hdgOf(dir) + 180, String.fromCharCode(65 + (L.rwys.indexOf(rl) % 6)) + (i + 1), 'location');
        void end;
      }
      // windsock near the first threshold
      this.windsock([rl.a[0] + rl.dir[0] * 300 + rl.nrm[0] * -rl.side * (rl.width / 2 + 60), rl.a[1] + rl.dir[1] * 300 + rl.nrm[1] * -rl.side * (rl.width / 2 + 60)]);
    }
    for (const l of L.links) this.taxiway(l.from, l.to, 23, lb);
    // apron
    {
      const A = L.apron; const hl = A.len / 2, hd = A.depth / 2;
      const c = (i: number, j: number): V2 => [A.c[0] + A.dir[0] * i * hl + A.nrm[0] * j * hd, A.c[1] + A.dir[1] * i * hl + A.nrm[1] * j * hd];
      const g = quad([c(-1, -1), c(1, -1), c(-1, 1), c(1, 1)], 0.15, [[0, 0], [A.len / 20, 0], [0, A.depth / 20], [A.len / 20, A.depth / 20]]);
      this.mesh(g, m.concrete, true);
      for (let i = -1; i <= 1; i += 0.5) for (const j of [-1]) lb.add(c(i, j), 0.6, BLUE, 0.8);
    }
    // terminal
    {
      const T = L.terminal; const hdg = hdgOf(L.apron.dir);
      const box = new THREE.Mesh(new THREE.BoxGeometry(T.len, T.h, T.depth), [m.facade, m.facade, m.roof, m.roof, m.facade, m.facade]);
      const fm = box.material as THREE.Material[]; void fm;
      (box.geometry as THREE.BufferGeometry).attributes.uv.array.forEach(() => 0);
      box.position.set(T.c[0], T.h / 2, T.c[1]); box.rotation.y = -hdg * DEG + Math.PI / 2; box.castShadow = true; box.receiveShadow = true; this.group.add(box);
      const uvA = box.geometry.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uvA.count; i++) uvA.setX(i, uvA.getX(i) * T.len / 60);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(T.depth * 0.9, T.depth * 0.9, T.len, 24, 1, false, -0.5, 1.0).rotateZ(Math.PI / 2), m.roof);
      roof.scale.set(1, 0.25, 1); roof.position.set(T.c[0], T.h - T.depth * 0.2, T.c[1]); roof.rotation.y = box.rotation.y; this.group.add(roof);
    }
    // gates: parked aircraft + jet bridges
    const fleet = AIRCRAFT.filter(a => a.category !== 'General Aviation' && a.category !== 'Business Jet');
    const reserveIdx = opts.reserveGate ? L.gates.findIndex((g2, i) => g2.maxSpan >= (opts.playerSpan ?? 36) && i >= 1) : -1;
    L.gates.forEach((gt, i) => {
      const toTerm = L.apron.nrm;
      if (ap.size >= 1) this.jetBridge(gt, toTerm);
      // stand lead-in line
      const back: V2 = [gt.pos[0] - toTerm[0] * 70, gt.pos[1] - toTerm[1] * 70];
      this.mesh(strip(back, [gt.pos[0] + toTerm[0] * 8, gt.pos[1] + toTerm[1] * 8], 0.4, 0.2, 1e6), m.yellow, false);
      if (i === reserveIdx) { this.playerGate = gt; gt.occupied = true; return; }
      if (r() < 0.25) return;
      let pool = fleet.filter(a => a.span <= gt.maxSpan + 1);
      if (ap.size === 0) pool = AIRCRAFT.filter(a => a.category === 'General Aviation' || a.category === 'Business Jet');
      if (!pool.length) return;
      const spec = pool[Math.floor(r() * pool.length)];
      const lv = LIVERIES[Math.floor(r() * 7)];
      const ac = buildStaticAircraft(spec, lv);
      const fwdOff = spec.length * 0.5 - spec.length * spec.wingX - 0.3 * spec.rootChord;
      ac.position.set(gt.pos[0] + toTerm[0] * fwdOff * 0, (ac as any).restY + 0.2, gt.pos[1] + toTerm[1] * fwdOff * 0);
      ac.rotation.y = -gt.hdg * DEG;
      this.group.add(ac); this.statics.push(ac); gt.occupied = true;
    });
    if (!this.playerGate && opts.reserveGate) this.playerGate = L.gates[0];
    // tower
    {
      const h = ap.size === 2 ? 70 + r() * 30 : ap.size === 1 ? 38 : 16;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, h, 16), m.white); shaft.position.set(L.tower[0], h / 2, L.tower[1]); shaft.castShadow = true; this.group.add(shaft);
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(8, 6, 6, 12), m.glass); cab.position.set(L.tower[0], h + 3, L.tower[1]); this.group.add(cab);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1.2, 12), m.dark); roof.position.set(L.tower[0], h + 6.6, L.tower[1]); this.group.add(roof);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 10, 4), m.dark); ant.position.set(L.tower[0], h + 12, L.tower[1]); this.group.add(ant);
      for (const c of [0x40ff60, 0xffffff]) { const b = glowSprite(c, 7); b.position.set(L.tower[0], h + 17, L.tower[1]); b.visible = false; this.group.add(b); this.towerBeacon.push(b); }
      const red = glowSprite(0xff2020, 3); red.position.set(L.tower[0], h + 17.5, L.tower[1]); this.group.add(red); (this as any).obst = red;
    }
    // hangars
    for (const [i, hp] of L.hangars.entries()) {
      if (ap.size === 0 && i > 0) break;
      const w = ap.size === 2 ? 85 : 45, d = ap.size === 2 ? 70 : 35, h = ap.size === 2 ? 28 : 14;
      const hg = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.6, d), m.hangar); hg.position.set(hp[0], h * 0.3, hp[1]); hg.rotation.y = -hdgOf(L.apron.dir) * DEG; hg.castShadow = true; this.group.add(hg);
      const rf = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.6, d * 0.6, w, 20, 1, false, -0.95, 1.9).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), m.roof);
      rf.scale.set(1, 0.6, 1); rf.position.set(hp[0], h * 0.6 - d * 0.6 * 0.35, hp[1]); rf.rotation.y = hg.rotation.y + Math.PI / 2; rf.rotation.y = hg.rotation.y; this.group.add(rf);
    }
    // ground vehicles on apron service loops
    if (ap.size >= 1) {
      const A = L.apron; const nv = ap.size === 2 ? 10 : 5;
      for (let i = 0; i < nv; i++) {
        const { g, beacon } = vehicleMesh(i, r);
        const inset = 18 + r() * 25;
        const hl = A.len / 2 - inset, hd = A.depth / 2 - inset * 0.6 - 30;
        const c = (a: number, b: number): V2 => [A.c[0] + A.dir[0] * a * hl + A.nrm[0] * b * hd, A.c[1] + A.dir[1] * a * hl + A.nrm[1] * b * hd];
        const path = [c(-1, -1), c(1, -1), c(1, 0.6), c(-1, 0.6)];
        this.group.add(g); this.vehicles.push({ obj: g, path, t: r() * 4, speed: (4 + r() * 5), beacon });
      }
    }
    // apron flood light poles
    {
      const A = L.apron;
      for (let i = -2; i <= 2; i++) {
        const p: V2 = [A.c[0] + A.dir[0] * i * A.len / 5 + A.nrm[0] * (A.depth / 2 - 5), A.c[1] + A.dir[1] * i * A.len / 5 + A.nrm[1] * (A.depth / 2 - 5)];
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 25, 6), m.dark); pole.position.set(p[0], 12.5, p[1]); this.group.add(pole);
        lb.add(p, 25.5, [1, 0.85, 0.6], 3.5);
      }
    }
    this.lights = lb.build(); this.group.add(this.lights);
    this.group.name = 'airport-' + ap.icao;
    this.place();
    origin.onShift(this.shift);
  }

  private mesh(g: THREE.BufferGeometry, mat: THREE.Material, receive: boolean) { const m = new THREE.Mesh(g, mat); m.receiveShadow = receive; this.group.add(m); return m; }

  private taxiway(a: V2, b: V2, w: number, lb: LightBuilder) {
    const m = mats();
    this.mesh(strip(a, b, w, 0.2, w), m.taxi, true);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(w / 2 + 6, 20).rotateX(-Math.PI / 2), m.taxi); disc.position.set(b[0], 0.19, b[1]); this.group.add(disc);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.max(1, Math.round(L / 60));
    const ux = (b[0] - a[0]) / (L || 1), uz = (b[1] - a[1]) / (L || 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n; const p: V2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      for (const s of [-1, 1]) lb.add([p[0] - uz * s * (w / 2 + 1), p[1] + ux * s * (w / 2 + 1)], 0.5, BLUE, 0.7);
      lb.add(p, 0.3, GRN, 0.45);
    }
  }

  private runwayLights(lb: LightBuilder, rl: ReturnType<typeof layoutOf>['rwys'][0], ei: ReturnType<typeof endInfo>, size: number) {
    const { thr, dir } = ei; const nrm: V2 = [-dir[1], dir[0]]; // right of approach direction
    const at = (along: number, across: number): V2 => [thr[0] + dir[0] * along + nrm[0] * across, thr[1] + dir[1] * along + nrm[1] * across];
    // threshold (green) and opposite end (red)
    for (let x = -rl.width / 2; x <= rl.width / 2 + 0.1; x += 3) { lb.add(at(-1, x), 0.5, GRN, 1); lb.add(at(-3, x), 0.5, RED, 0.8); }
    // PAPI on the left, 300 m from threshold
    const angs = [3.5, 3.17, 2.83, 2.5];
    for (let i = 0; i < 4; i++) lb.add(at(300, -(rl.width / 2 + 15 + i * 9)), 1.0, WHITE, 2.2, angs[i]);
    if (size < 1) return;
    // approach lighting system (900 m) with sequenced flashers
    for (let d = 30; d <= 900; d += 30) {
      for (let k = -2; k <= 2; k++) lb.add(at(-d, k * 1.0), 1.2 + d * 0.002, WHITE, 1.1);
      if (d >= 300) lb.add(at(-d, 0), 2 + d * 0.002, [1, 1, 1], 2.6, 0, (900 - d) / 600 * 0.5);
      if (d === 300) for (let k = -15; k <= 15; k += 1.5) lb.add(at(-d, k), 1.4, WHITE, 1.1);
      if (d <= 270) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) lb.add(at(-d, s * (9 + k * 1.5)), 1, RED, 0.9);
    }
  }

  private jetBridge(gt: Gate, toTerm: V2) {
    const m = mats();
    const T = this.layout.terminal;
    const hdg = gt.hdg; const right: V2 = [-toTerm[1], toTerm[0]];
    // from terminal face toward aircraft left forward door (nose-in: aircraft's left = our right of terminal-facing)
    const termFace: V2 = [gt.pos[0] + toTerm[0] * 0, gt.pos[1] + toTerm[1] * 0];
    const dist = (T.c[0] - gt.pos[0]) * toTerm[0] + (T.c[1] - gt.pos[1]) * toTerm[1] - T.depth / 2;
    const start: V2 = [gt.pos[0] + toTerm[0] * dist + right[0] * -6, gt.pos[1] + toTerm[1] * dist + right[1] * -6];
    const end: V2 = [gt.pos[0] + toTerm[0] * (dist * 0.25) + right[0] * -4.5, gt.pos[1] + toTerm[1] * (dist * 0.25) + right[1] * -4.5];
    const L = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const br = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3, L), m.bridge);
    br.position.set((start[0] + end[0]) / 2, 5.2, (start[1] + end[1]) / 2); br.rotation.y = Math.atan2(end[0] - start[0], end[1] - start[1]); br.castShadow = true; this.group.add(br);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 4, 0.6), m.dark); leg.position.set(end[0], 2, end[1]); this.group.add(leg);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.4, 3.6), m.bridge); cab.position.set(end[0], 5.2, end[1]); cab.rotation.y = br.rotation.y; this.group.add(cab);
    void hdg; void termFace;
  }

  private sign(p: V2, hdg: number, text: string, type: 'mandatory' | 'location') {
    const m = mats(); const key = type + text;
    let mat = m.sign.get(key); if (!mat) { mat = new THREE.MeshBasicMaterial({ map: signTexture(text, type) }); m.sign.set(key, mat); }
    const s = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 0.3), [m.dark, m.dark, m.dark, m.dark, mat, mat]);
    s.position.set(p[0], 1.1, p[1]); s.rotation.y = -hdg * DEG; this.group.add(s);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.15), m.dark); leg.position.set(p[0], 0.35, p[1]); this.group.add(leg);
  }

  private windsock(p: V2) {
    const m = mats();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6), m.white); pole.position.set(p[0], 3, p[1]); this.group.add(pole);
    const sock = new THREE.Group(); sock.position.set(p[0], 6, p[1]); this.group.add(sock);
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 3.5, 12, 5, true).rotateX(Math.PI / 2).translate(0, 0, 1.75), new THREE.MeshStandardMaterial({ color: 0xff5a1a, side: THREE.DoubleSide, roughness: 0.8 }));
    sock.add(cone); this.windsocks.push(sock);
  }

  place() { this.group.position.set(origin.x(this.ap.lon), this.ap.elevM, origin.z(this.ap.lat)); }

  update(dt: number, night: number, windFrom: number, windKt: number, time: number) {
    for (const v of this.vehicles) {
      const segs = v.path.map((a, i) => { const b = v.path[(i + 1) % v.path.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); });
      const total = segs.reduce((x, y) => x + y, 0);
      v.t = (v.t + dt * v.speed) % total; let d = v.t, seg = 0;
      while (d > segs[seg]) { d -= segs[seg]; seg++; }
      const a = v.path[seg], b = v.path[(seg + 1) % v.path.length], f = d / segs[seg];
      v.obj.position.set(a[0] + (b[0] - a[0]) * f, 0.2, a[1] + (b[1] - a[1]) * f);
      v.obj.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
      v.beacon.visible = (time * 1.5 + seg * 0.3) % 1 < 0.4;
    }
    const ph = time % 2;
    this.towerBeacon[0].visible = night > 0.3 && ph < 0.1; this.towerBeacon[1].visible = night > 0.3 && ph > 1 && ph < 1.1;
    for (const s of this.windsocks) {
      s.rotation.y = -windFrom * DEG; // points downwind
      s.rotation.x = clamp(1.3 - windKt / 15, 0, 1.3) + Math.sin(time * 3) * 0.04 * Math.min(1, windKt / 10);
      s.rotation.order = 'YXZ';
    }
    const m = mats();
    m.facade.emissiveIntensity = night * 1.6; m.concrete.emissiveIntensity = night * 0.05; m.glass.emissiveIntensity = night * 0.4;
  }

  dispose() {
    origin.offShift(this.shift);
    for (const s of this.statics) s.removeFromParent();
    this.group.traverse(o => { const mm = o as THREE.Mesh; if (mm.geometry) mm.geometry.dispose?.(); });
    this.group.removeFromParent();
  }
}

export class AirportManager {
  active = new Map<string, AirportScenery>();
  group = new THREE.Group();
  pinned = new Map<string, { playerSpan?: number; reserveGate?: boolean }>();
  private timer = 0;
  get(icao: string) { return this.active.get(icao); }
  ensure(ap: Airport, opts: { playerSpan?: number; reserveGate?: boolean } = {}) {
    let s = this.active.get(ap.icao);
    if (!s) { s = new AirportScenery(ap, opts); this.active.set(ap.icao, s); this.group.add(s.group); }
    return s;
  }
  pin(ap: Airport, opts: { playerSpan?: number; reserveGate?: boolean } = {}) { this.pinned.set(ap.icao, opts); return this.ensure(ap, opts); }
  clear() { for (const s of this.active.values()) s.dispose(); this.active.clear(); this.pinned.clear(); }
  update(dt: number, camLat: number, camLon: number, camAlt: number, night: number, windFrom: number, windKt: number, time: number) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1.5;
      const radius = camAlt > 6000 ? 30000 : 40000;
      const near = airportsNear(camLat, camLon, radius).map(a => ({ a, d: haversine(camLat, camLon, a.lat, a.lon) })).sort((x, y) => x.d - y.d).slice(0, 5);
      let built = 0;
      for (const { a } of near) if (!this.active.has(a.icao) && built < 1) { this.ensure(a, this.pinned.get(a.icao)); built++; }
      for (const [k, s] of this.active) if (!this.pinned.has(k) && haversine(camLat, camLon, s.ap.lat, s.ap.lon) > radius * 1.4) { s.dispose(); this.active.delete(k); }
    }
    for (const s of this.active.values()) s.update(dt, night, windFrom, windKt, time);
  }
}
export type { RunwayEnd };
