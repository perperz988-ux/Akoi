// Procedural, dimensionally accurate aircraft models built from the spec sheet:
// lofted fuselage with type-specific nose/tail shapes, swept tapered wings with real airfoil
// thickness, animated flaps/slats/spoilers/ailerons/elevator/rudder, nacelles with spinning
// fans, retracting gear with bogies, doors, navigation/beacon/strobe/landing lights, liveries.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AircraftSpec, Livery } from '../data/aircraft';
import { DEG, clamp } from '../core/geo';

export interface AircraftParts {
  root: THREE.Group; body: THREE.Object3D; fuselage: THREE.Mesh;
  flaps: { pivot: THREE.Object3D; side: number; base: THREE.Vector3; chord: number }[];
  slats: { obj: THREE.Object3D; base: THREE.Vector3; chord: number }[];
  ailerons: { pivot: THREE.Object3D; side: number }[];
  spoilers: { pivot: THREE.Object3D; side: number; inboard: boolean }[];
  elevators: THREE.Object3D[]; rudder: THREE.Object3D | null;
  fans: { obj: THREE.Object3D; idx: number; prop: boolean; disc?: THREE.Mesh }[];
  gear: { pivot: THREE.Object3D; axis: THREE.Vector3; angle: number; door?: THREE.Object3D; doorAngle?: number; isNose: boolean; wheels: THREE.Object3D[]; strut: THREE.Object3D }[];
  door: { pivot: THREE.Object3D } | null;
  lights: { nav: THREE.Object3D[]; beacon: THREE.Mesh[]; strobe: THREE.Mesh[]; landing: THREE.SpotLight[]; landingGlow: THREE.Mesh[]; taxi: THREE.SpotLight | null; logo: THREE.PointLight | null; cabin: THREE.Mesh | null };
  noseZ: number; tailZ: number; cockpitEye: THREE.Vector3; wingRootZ: number;
  exhaust: THREE.Vector3[]; wingTips: THREE.Vector3[];
}

const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
export function glowSprite(color: number, size: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  m.onBeforeRender = (_r, _s, cam) => m.quaternion.copy(cam.quaternion).premultiply(m.parent ? m.parent.getWorldQuaternion(new THREE.Quaternion()).invert() : new THREE.Quaternion());
  m.renderOrder = 10;
  return m;
}

// ---------- Livery texture ----------
function liveryTexture(spec: AircraftSpec, lv: Livery, noseLen: number, reg: string) {
  const W = 2048, H = 512; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
  // canvas x = along length (nose->tail), y = around (0 top, H/4 right, H/2 bottom, 3H/4 left)
  const L = spec.length;
  g.fillStyle = lv.body; g.fillRect(0, 0, W, H);
  const yRight = H * 0.25, yLeft = H * 0.75, yBot = H * 0.5;
  // belly
  g.fillStyle = lv.belly; g.fillRect(0, yBot - H * 0.14, W, H * 0.28);
  const both = (f: (y: number, dir: number) => void) => { f(yRight, 1); f(yLeft, -1); };
  if (lv.style === 'cheatline') {
    both((y, d) => { g.fillStyle = lv.stripe; g.fillRect(W * 0.03, y + d * H * 0.035, W * 0.95, H * 0.035); g.fillStyle = lv.tail2; g.fillRect(W * 0.05, y + d * H * 0.075, W * 0.93, H * 0.012); });
  } else if (lv.style === 'swoosh') {
    both((y, d) => {
      g.fillStyle = lv.stripe; g.beginPath(); g.moveTo(W * 0.55, y + d * H * 0.2); g.quadraticCurveTo(W * 0.8, y + d * H * 0.05, W, y - d * H * 0.12); g.lineTo(W, y + d * H * 0.2); g.closePath(); g.fill();
      g.fillStyle = lv.tail; g.beginPath(); g.moveTo(W * 0.68, y + d * H * 0.25); g.quadraticCurveTo(W * 0.85, y + d * H * 0.1, W, y - d * H * 0.02); g.lineTo(W, y + d * H * 0.25); g.closePath(); g.fill();
    });
  } else if (lv.style === 'billboard') {
    g.fillStyle = lv.belly; g.fillRect(0, yBot - H * 0.2, W, H * 0.4);
  } else if (lv.style === 'ga') {
    both((y, d) => { g.fillStyle = lv.tail2; g.fillRect(0, y + d * H * 0.02, W, H * 0.03); g.fillStyle = lv.stripe; g.fillRect(0, y + d * H * 0.065, W, H * 0.015); });
  }
  // titles (canvas x->length, y->around; right side is mirrored horizontally, left side vertically)
  const circ = Math.PI * (spec.fuselageD + (spec.fuselageW ?? spec.fuselageD)) / 2;
  const sx = (W / L) / (H / circ);
  const drawText = (txt: string, x: number, off: number, px: number, color: string) => both((y, d) => {
    g.save(); g.fillStyle = color; g.font = `bold ${Math.round(px)}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.translate(x, y - d * off); if (d > 0) g.scale(-sx, 1); else g.scale(sx, -1); g.fillText(txt, 0, 0); g.restore();
  });
  if (lv.text) drawText(lv.text, W * 0.36, H * 0.085, H * 0.065, lv.textColor);
  // passenger windows
  const winY = H * 0.075; const ga = spec.category === 'General Aviation';
  if (!ga) {
    const pitch = spec.category === 'Business Jet' ? 0.95 : 0.53; // m
    const start = noseLen * 1.35 + 2.5, end = L * 0.82;
    const wl = pitch * 0.42 / L * W, wh = H * (spec.category === 'Business Jet' ? 0.05 : spec.fuselageD > 5 ? 0.025 : 0.032);
    g.fillStyle = '#1a1f26';
    for (let z = start; z < end; z += pitch) {
      if (spec.category === 'Business Jet' && z > L * 0.55) break;
      const x = z / L * W;
      both((y, d) => { rr(g, x - wl / 2, y - d * winY - wh / 2, wl, wh, wl * 0.45); });
    }
    // upper-deck windows (747)
    if (spec.hump) for (let z = noseLen * 1.2; z < L * 0.3; z += 0.6) both((y, d) => rr(g, z / L * W, y - d * H * 0.165, wl, wh * 0.9, wl * 0.4));
    // doors
    const doorZ = [noseLen * 1.2 + 0.6];
    if (spec.doors >= 4) doorZ.push(L * 0.78);
    if (spec.doors >= 8) doorZ.push(L * 0.42, L * 0.62);
    if (spec.doors >= 10) doorZ.push(L * 0.3);
    g.strokeStyle = 'rgba(40,45,55,0.75)'; g.lineWidth = 2;
    for (const z of doorZ) both((y, d) => { const x = z / L * W; g.strokeRect(x - 0.5 / L * W, y - d * H * 0.11 - H * 0.04, 1.0 / L * W, H * 0.11); });
  } else {
    g.fillStyle = '#1f2630';
    both((y, d) => { rr(g, W * 0.2, y - d * H * 0.12 - H * 0.07, W * 0.22, H * 0.14, 20); });
  }
  // cockpit windows (painted dark band near nose) - shapes refined per manufacturer
  g.fillStyle = '#0e1318';
  const cx = (noseLen * 0.7) / L * W, cw = (noseLen * 0.38) / L * W;
  if (!ga) {
    both((y, d) => {
      g.beginPath();
      const top = y - d * H * 0.19, bot = y - d * H * 0.11;
      g.moveTo(cx - cw * 0.3, bot); g.lineTo(cx + cw * 0.6, bot); g.lineTo(cx + cw * (spec.noseStyle === 'airbus' ? 0.45 : 0.35), top); g.lineTo(cx - cw * 0.1, top + d * H * 0.02); g.closePath(); g.fill();
    });
    g.fillRect(cx - cw * 0.55, 0, cw * 0.5, H * 0.06); g.fillRect(cx - cw * 0.55, H - H * 0.06, cw * 0.5, H * 0.06);
  }
  drawTextReg();
  // panel lines
  g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1;
  for (let z = 0; z < L; z += ga ? 0.6 : 1.6) { const x = z / L * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.flipY = false; t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  return t;
  function drawTextReg() { drawText(reg, W * (ga ? 0.62 : 0.88), H * (ga ? 0.01 : 0.02), H * (ga ? 0.07 : 0.03), ga ? '#20242a' : 'rgba(30,30,30,0.85)'); }
}
function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
}
function tailTexture(lv: Livery, ga: boolean) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d')!;
  g.fillStyle = lv.tail; g.fillRect(0, 0, 512, 512);
  if (!ga) {
    g.fillStyle = lv.tail2; g.beginPath(); g.moveTo(0, 512); g.lineTo(512, 140); g.lineTo(512, 260); g.lineTo(0, 512); g.fill();
    g.beginPath(); g.arc(260, 250, 80, 0, Math.PI * 2); g.lineWidth = 18; g.strokeStyle = lv.body; g.stroke();
    g.beginPath(); g.moveTo(190, 300); g.lineTo(330, 190); g.lineWidth = 16; g.stroke();
  } else { g.fillStyle = lv.tail2; g.fillRect(0, 300, 512, 40); g.fillStyle = lv.stripe; g.fillRect(0, 350, 512, 14); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- geometry helpers ----------
/** Airfoil (closed loop, chord 0..1 along -z->+z, y thickness). NACA 4-digit-like. */
function airfoil(n: number, tc: number, camber = 0.02, from = 0, to = 1): [number, number][] {
  const pts: [number, number][] = [];
  const yt = (x: number) => 5 * tc * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = (x: number) => (x < 0.4 ? camber / 0.16 * (0.8 * x - x * x) : camber / 0.36 * (0.2 + 0.8 * x - x * x));
  const xs: number[] = []; for (let i = 0; i <= n; i++) { const b = i / n; xs.push(from + (to - from) * (0.5 - 0.5 * Math.cos(b * Math.PI))); }
  for (let i = n; i >= 0; i--) pts.push([xs[i], yc(xs[i]) + yt(xs[i])]);       // upper TE->LE
  for (let i = 1; i <= n; i++) pts.push([xs[i], yc(xs[i]) - yt(xs[i])]);        // lower LE->TE
  return pts;
}
/** Loft between stations. Each station: {le: Vector3 (leading-edge point), chord, tc, twist}. Surface spans chord fraction [from,to]. */
interface Station { le: THREE.Vector3; chord: number; tc: number; twist?: number; up?: THREE.Vector3; }
function loft(st: Station[], from = 0, to = 1, n = 10, vertical = false, capEnds = true): THREE.BufferGeometry {
  const prof = airfoil(n, 1, 0.018, from, to);
  const P = prof.length; const pos: number[] = []; const idx: number[] = []; const uv: number[] = [];
  for (let s = 0; s < st.length; s++) {
    const S = st[s];
    for (let i = 0; i < P; i++) {
      const [x, y] = prof[i];
      const t = S.twist ?? 0;
      const lx = x * S.chord, ly = y * S.chord * S.tc;
      const zz = lx * Math.cos(t) + ly * Math.sin(t), yy = ly * Math.cos(t) - lx * Math.sin(t);
      if (vertical) pos.push(S.le.x + yy, S.le.y, S.le.z + zz);
      else pos.push(S.le.x, S.le.y + yy, S.le.z + zz);
      uv.push(x, s / (st.length - 1));
    }
  }
  for (let s = 0; s < st.length - 1; s++) for (let i = 0; i < P - 1; i++) {
    const a = s * P + i, b = a + 1, c = a + P, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  if (capEnds) for (const s of [0, st.length - 1]) {
    const base = s * P; const cIdx = pos.length / 3;
    let cx = 0, cy = 0, cz = 0; for (let i = 0; i < P; i++) { cx += pos[(base + i) * 3]; cy += pos[(base + i) * 3 + 1]; cz += pos[(base + i) * 3 + 2]; }
    pos.push(cx / P, cy / P, cz / P); uv.push(0.5, s ? 1 : 0);
    for (let i = 0; i < P - 1; i++) s ? idx.push(base + i, base + i + 1, cIdx) : idx.push(base + i + 1, base + i, cIdx);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export interface BuildOpts { lod: 'high' | 'low'; livery: Livery; reg?: string }

export function buildAircraft(spec: AircraftSpec, opts: BuildOpts): AircraftParts {
  const hi = opts.lod === 'high';
  const lv = opts.livery; const ga = spec.category === 'General Aviation';
  const L = spec.length, R = spec.fuselageD / 2, Rw = (spec.fuselageW ?? spec.fuselageD) / 2;
  const cgFromNose = spec.wingX * L + 0.3 * spec.rootChord;
  const noseZ = -cgFromNose, tailZ = noseZ + L;
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const reg = opts.reg ?? (ga ? 'N172SW' : spec.maker === 'Airbus' ? 'F-WSKY' : 'N' + (700 + Math.floor(Math.random() * 99)) + 'SK');

  // materials
  const noseLen = ga ? 1.6 : spec.noseStyle === 'airbus' ? R * 2.3 : spec.noseStyle === '787' ? R * 2.6 : spec.noseStyle === 'bizjet' ? R * 3.2 : R * 2.5;
  const paint = new THREE.MeshPhysicalMaterial({ map: liveryTexture(spec, lv, noseLen, reg), roughness: 0.32, metalness: 0.05, clearcoat: hi ? 0.7 : 0, clearcoatRoughness: 0.15 });
  const wingMat = new THREE.MeshPhysicalMaterial({ color: ga ? lv.body : spec.maker === 'Airbus' ? '#d7dbe0' : '#c3c8ce', roughness: 0.42, metalness: ga ? 0.05 : 0.35, clearcoat: hi ? 0.3 : 0, side: THREE.DoubleSide });
  const tailMat = new THREE.MeshPhysicalMaterial({ map: tailTexture(lv, ga), roughness: 0.3, metalness: 0.05, clearcoat: hi ? 0.7 : 0, side: THREE.DoubleSide });
  const engMat = new THREE.MeshPhysicalMaterial({ color: lv.engine, roughness: 0.3, metalness: 0.1, clearcoat: hi ? 0.6 : 0, side: THREE.DoubleSide });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.12, metalness: 1 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.7 });
  const gearMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.35, metalness: 0.8 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1218, roughness: 0.05, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.92 });

  const parts: AircraftParts = {
    root, body, fuselage: null as any, flaps: [], slats: [], ailerons: [], spoilers: [], elevators: [], rudder: null, fans: [], gear: [], door: null,
    lights: { nav: [], beacon: [], strobe: [], landing: [], landingGlow: [], taxi: null, logo: null, cabin: null },
    noseZ, tailZ, cockpitEye: new THREE.Vector3(), wingRootZ: 0, exhaust: [], wingTips: [],
  };

  // ---------- fuselage ----------
  const NS = hi ? 90 : 36, NA = hi ? 40 : 16;
  const tailLen = ga ? L * 0.55 : L * (spec.category === 'Business Jet' ? 0.3 : 0.27);
  const prof = (t: number) => { // returns [rx, ry, yc, ytop]
    const z = t * L; let k = 1, yc = 0, top = 0;
    if (z < noseLen) {
      const u = z / noseLen;
      const ex = spec.noseStyle === 'airbus' ? 0.42 : spec.noseStyle === '787' ? 0.5 : spec.noseStyle === 'bizjet' ? 0.6 : 0.48;
      k = Math.pow(Math.sin(u * Math.PI / 2), ex); k = Math.max(k, 0.02);
      yc = -R * 0.18 * Math.pow(1 - u, 1.5) * (ga ? 0 : 1);
      if (ga) k = 0.55 + 0.45 * Math.pow(Math.sin(u * Math.PI / 2), 0.7);
    } else if (z > L - tailLen) {
      const u = (z - (L - tailLen)) / tailLen;
      k = 1 - (ga ? 0.82 : 0.82) * Math.pow(u, ga ? 1.1 : 1.6);
      yc = R * (ga ? 0.25 : 0.62) * Math.pow(u, 1.8);
    }
    if (spec.hump) { const u = z / (L * 0.38); if (u < 1) top = R * 0.62 * Math.pow(Math.sin(Math.min(1, u * 1.25) * Math.PI / 2), 0.7) * (u > 0.8 ? 1 - (u - 0.8) / 0.2 * 1 : 1) * clamp((z - noseLen * 0.3) / (noseLen * 0.8), 0, 1); }
    if (ga) { // cabin & boxy
      const u = z / L; if (u > 0.15 && u < 0.5) top = R * 0.25 * Math.sin((u - 0.15) / 0.35 * Math.PI);
    }
    return [Rw * k, R * k, yc, top];
  };
  {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= NS; i++) {
      const t = i / NS; const [rx, ry, yc, top] = prof(t);
      for (let j = 0; j <= NA; j++) {
        const th = j / NA * Math.PI * 2;
        const sx = Math.sin(th), cy = Math.cos(th);
        const pw = ga ? 2.6 : 2; // superellipse for GA boxy shape
        const ex = Math.sign(sx) * Math.pow(Math.abs(sx), 2 / pw), ey = Math.sign(cy) * Math.pow(Math.abs(cy), 2 / pw);
        pos.push(rx * ex, yc + ry * ey + (cy > 0 ? top * Math.pow(cy, 1.5) : 0), noseZ + t * L);
        uv.push(t, j / NA);
      }
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + 1, c = a + NA + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, paint); m.castShadow = true; m.receiveShadow = hi; body.add(m); parts.fuselage = m;
  }
  const fusY = (z: number) => { const t = clamp((z - noseZ) / L, 0, 1); const [, ry, yc] = prof(t); return { ry, yc }; };

  // ---------- wings ----------
  const semi = spec.span / 2;
  const sweepLE = Math.atan(Math.tan(spec.sweep * DEG) + (spec.rootChord - spec.tipChord) / (4 * semi) * 0) + (spec.sweep > 5 ? 2 * DEG : 0);
  const wingRootLE = noseZ + spec.wingX * L;
  parts.wingRootZ = wingRootLE;
  const wingY0 = spec.wingMount === 'high' ? R * 0.98 + (ga ? R * 0.2 : 0) : -R * 0.55;
  const dih = spec.dihedral * DEG;
  const kink = ga ? 0 : 0.35; // yehudi kink fraction of semi-span
  const chordAt = (f: number) => {
    if (ga) return f < 0.45 ? spec.rootChord : spec.rootChord + (spec.tipChord - spec.rootChord) * (f - 0.45) / 0.55;
    const ck = spec.tipChord + (spec.rootChord - spec.tipChord) * 0.58;
    return f < kink ? spec.rootChord + (ck - spec.rootChord) * (f / kink) : ck + (spec.tipChord - ck) * ((f - kink) / (1 - kink));
  };
  const leAt = (f: number, side: number) => new THREE.Vector3(side * (Rw * 0.85 + f * (semi - Rw * 0.85)), wingY0 + f * semi * Math.tan(dih), wingRootLE + f * semi * Math.tan(sweepLE));
  const tcAt = (f: number) => (ga ? 0.15 : 0.14 - f * 0.045);
  const wingStations = (side: number, f0: number, f1: number, n: number) => { const a: Station[] = []; for (let i = 0; i <= n; i++) { const f = f0 + (f1 - f0) * i / n; a.push({ le: leAt(f, side), chord: chordAt(f), tc: tcAt(f), twist: -f * 3 * DEG }); } return a; };
  const MAIN_TO = 0.76;
  for (const side of [-1, 1]) {
    const wingG = loft(wingStations(side, -0.02, 1, hi ? 12 : 4), 0, ga ? 0.78 : MAIN_TO, hi ? 12 : 6);
    if (side < 0) flipWinding(wingG);
    const wm = new THREE.Mesh(wingG, wingMat); wm.castShadow = true; wm.receiveShadow = hi; body.add(wm);
    // trailing edge surfaces
    const flapSpans: [number, number][] = ga ? [[0.08, 0.5]] : spec.category === 'Business Jet' ? [[0.08, 0.62]] : [[0.06, kink], [kink + 0.01, 0.7]];
    const ailSpan: [number, number] = ga ? [0.55, 0.92] : spec.category === 'Business Jet' ? [0.66, 0.94] : [0.74, 0.95];
    const mkSurf = (f0: number, f1: number, mat: THREE.Material) => {
      const st = wingStations(side, f0, f1, 2);
      const hinge0 = st[0].le.clone().add(new THREE.Vector3(0, 0, st[0].chord * MAIN_TO)), hinge1 = st[2].le.clone().add(new THREE.Vector3(0, 0, st[2].chord * MAIN_TO));
      const g = loft(st, MAIN_TO, 1.0, hi ? 6 : 3); if (side < 0) flipWinding(g);
      g.translate(-hinge0.x, -hinge0.y, -hinge0.z);
      const pivot = new THREE.Object3D(); pivot.position.copy(hinge0);
      const axis = hinge1.clone().sub(hinge0).normalize();
      pivot.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), axis.multiplyScalar(side));
      g.applyQuaternion(pivot.quaternion.clone().invert());
      const m = new THREE.Mesh(g, mat); m.castShadow = true; pivot.add(m); body.add(pivot);
      return { pivot, chord: (st[0].chord + st[2].chord) / 2 };
    };
    for (const [a, b] of flapSpans) { const s = mkSurf(a, b, wingMat); parts.flaps.push({ pivot: s.pivot, side, base: s.pivot.position.clone(), chord: s.chord }); }
    { const s = mkSurf(ailSpan[0], ailSpan[1], wingMat); parts.ailerons.push({ pivot: s.pivot, side }); }
    // fixed TE fillers
    const fillers: [number, number][] = ga ? [[-0.02, 0.08], [0.5, 0.55], [0.92, 1]] : [[-0.02, 0.06], [0.7, ailSpan[0]], [ailSpan[1], 1]];
    for (const [a, b] of fillers) { const g = loft(wingStations(side, a, b, 1), MAIN_TO, 1, 3); if (side < 0) flipWinding(g); const m = new THREE.Mesh(g, wingMat); m.castShadow = true; body.add(m); }
    // spoilers (upper panels)
    if (!ga) {
      const nSp = hi ? (spec.category === 'Business Jet' ? 2 : 5) : 2;
      for (let i = 0; i < nSp; i++) {
        const f0 = 0.1 + i * (0.6 / nSp), f1 = f0 + 0.6 / nSp - 0.01;
        const a = leAt(f0, side), b2 = leAt(f1, side); const c0 = chordAt(f0), c1 = chordAt(f1);
        const h0 = a.clone().add(new THREE.Vector3(0, c0 * tcAt(f0) * 0.42, c0 * 0.56)), h1 = b2.clone().add(new THREE.Vector3(0, c1 * tcAt(f1) * 0.42, c1 * 0.56));
        const len = h1.distanceTo(h0), w = (c0 + c1) / 2 * 0.17;
        const g = new THREE.BoxGeometry(len, 0.04, w).translate(len / 2 * side, 0, w / 2);
        const pivot = new THREE.Object3D(); pivot.position.copy(h0);
        const ax = h1.clone().sub(h0).normalize(); pivot.quaternion.setFromUnitVectors(new THREE.Vector3(side, 0, 0), ax);
        const m = new THREE.Mesh(g, wingMat); pivot.add(m); body.add(pivot);
        parts.spoilers.push({ pivot, side, inboard: i < 2 });
      }
      // slats
      if (spec.category !== 'Business Jet') {
        const st = wingStations(side, kink + 0.03, 0.97, 3);
        const g = loft(st, 0, 0.14, hi ? 6 : 3); if (side < 0) flipWinding(g);
        const m = new THREE.Mesh(g, wingMat); const o = new THREE.Object3D(); o.add(m); body.add(o);
        parts.slats.push({ obj: o, base: new THREE.Vector3(), chord: chordAt(0.6) });
      }
    }
    // wingtip devices
    const tipLE = leAt(1, side), tipC = chordAt(1);
    parts.wingTips.push(tipLE.clone().add(new THREE.Vector3(0, 0, tipC * 0.5)));
    if (spec.tip === 'blended' || spec.tip === 'sharklet' || spec.tip === 'winglet' || spec.tip === 'curved') {
      const h = spec.tip === 'blended' ? 2.5 : spec.tip === 'sharklet' ? 2.4 : spec.tip === 'curved' ? 3.2 : 2.7;
      const cant = spec.tip === 'curved' ? 35 * DEG : spec.tip === 'winglet' ? 12 * DEG : 8 * DEG;
      const n = spec.tip === 'curved' || spec.tip === 'sharklet' || spec.tip === 'blended' ? 6 : 2;
      const st: Station[] = [];
      for (let i = 0; i <= n; i++) {
        const u = i / n; const curve = spec.tip === 'winglet' ? 1 : Math.sin(u * Math.PI / 2);
        const out = side * (u * h * Math.sin(cant) + (1 - curve) * 0.9 * (spec.tip === 'curved' ? 1.4 : 0.6));
        st.push({ le: new THREE.Vector3(tipLE.x + out, tipLE.y + u * h, tipLE.z + u * h * 0.7 + (1 - curve) * 0.1 + tipC * 0.12 * u), chord: tipC * (1 - u * 0.62), tc: 0.08 });
      }
      const g = loft(st, 0, 1, hi ? 8 : 4, true); if (side > 0) flipWinding(g);
      const m = new THREE.Mesh(g, tailMat); m.castShadow = true; body.add(m);
    } else if (spec.tip === 'raked') {
      const st: Station[] = [{ le: tipLE, chord: tipC, tc: 0.09 }, { le: tipLE.clone().add(new THREE.Vector3(side * 2.4, 0.15, tipC * 0.9)), chord: tipC * 0.25, tc: 0.07 }];
      const g = loft(st, 0, 1, hi ? 8 : 4); if (side < 0) flipWinding(g);
      const m = new THREE.Mesh(g, wingMat); body.add(m);
      parts.wingTips[parts.wingTips.length - 1] = st[1].le.clone();
    }
  }
  // wing-body fairing / C172 struts
  if (!ga) {
    const fg = new THREE.SphereGeometry(1, 24, 12); fg.scale(Rw * 1.08, R * 0.55, spec.rootChord * 0.85); fg.translate(0, -R * 0.62, wingRootLE + spec.rootChord * 0.5);
    const fm = new THREE.Mesh(fg, new THREE.MeshPhysicalMaterial({ color: lv.belly, roughness: 0.35, clearcoat: hi ? 0.5 : 0 })); fm.castShadow = true; body.add(fm); (parts as any).fairing = fm;
  } else {
    for (const side of [-1, 1]) {
      const a = new THREE.Vector3(side * Rw * 0.9, -R * 0.6, wingRootLE + spec.rootChord * 0.5), b = leAt(0.55, side).add(new THREE.Vector3(0, -0.05, spec.rootChord * 0.35));
      const g = new THREE.CylinderGeometry(0.035, 0.035, a.distanceTo(b), 8); const m = new THREE.Mesh(g, wingMat);
      m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); body.add(m);
    }
  }

  // ---------- empennage ----------
  const vtRootChord = spec.vtHeight * (ga ? 0.9 : 0.95), vtTipChord = vtRootChord * (ga ? 0.55 : 0.38);
  const vtRootLE = new THREE.Vector3(0, fusY(tailZ - L * 0.12).yc + R * (ga ? 0.4 : 0.5), tailZ - vtRootChord * (ga ? 1.0 : 1.25));
  {
    const st: Station[] = [];
    for (let i = 0; i <= 3; i++) { const u = i / 3; st.push({ le: vtRootLE.clone().add(new THREE.Vector3(0, u * spec.vtHeight, u * spec.vtHeight * Math.tan(spec.vtSweep * DEG))), chord: vtRootChord + (vtTipChord - vtRootChord) * u, tc: 0.11 }); }
    const g = loft(st, 0, 0.7, hi ? 10 : 5, true); flipWinding(g);
    const m = new THREE.Mesh(g, tailMat); m.castShadow = true; body.add(m);
    // rudder
    const hinge0 = st[0].le.clone().add(new THREE.Vector3(0, 0, st[0].chord * 0.7)), hinge1 = st[3].le.clone().add(new THREE.Vector3(0, 0, st[3].chord * 0.7));
    const rg = loft(st, 0.7, 1, hi ? 5 : 3, true); flipWinding(rg); rg.translate(-hinge0.x, -hinge0.y, -hinge0.z);
    const pv = new THREE.Object3D(); pv.position.copy(hinge0); pv.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hinge1.sub(hinge0).normalize());
    rg.applyQuaternion(pv.quaternion.clone().invert());
    const rm = new THREE.Mesh(rg, tailMat); rm.castShadow = true; pv.add(rm); body.add(pv); parts.rudder = pv;
    // logo light
    if (hi && !ga) { const pl = new THREE.PointLight(0xffffff, 0, 25, 2); pl.position.set(0, vtRootLE.y + spec.vtHeight * 0.3, vtRootLE.z - 3); body.add(pl); parts.lights.logo = pl; }
    // tail nav light
    parts.lights.nav.push(addLight(body, 0xffffff, new THREE.Vector3(0, ga ? st[3].le.y : fusY(tailZ).yc + R * 0.1, ga ? st[3].le.z + st[3].chord : tailZ + 0.1), 0.35 * Math.max(1, R)));
  }
  {
    const tTail = spec.tail === 't-tail';
    const htRootChord = spec.htSpan * (ga ? 0.42 : 0.27), htTipChord = htRootChord * (ga ? 0.8 : 0.35);
    const y0 = tTail ? vtRootLE.y + spec.vtHeight * 0.97 : fusY(tailZ - L * 0.1).yc + (ga ? 0 : R * 0.05);
    const z0 = tTail ? vtRootLE.z + spec.vtHeight * Math.tan(spec.vtSweep * DEG) + vtTipChord * 0.05 : tailZ - htRootChord * (ga ? 1.15 : 1.5);
    for (const side of [-1, 1]) {
      const st: Station[] = [];
      const x0 = tTail ? 0 : fusY(z0).ry * 0.5 * Rw / R;
      for (let i = 0; i <= 2; i++) { const u = i / 2; st.push({ le: new THREE.Vector3(side * (x0 + u * (spec.htSpan / 2 - x0)), y0 + u * spec.htSpan / 2 * Math.tan((ga ? 0 : 6) * DEG), z0 + u * (spec.htSpan / 2) * Math.tan(spec.htSweep * DEG)), chord: htRootChord + (htTipChord - htRootChord) * u, tc: 0.1 }); }
      const g = loft(st, 0, 0.68, hi ? 8 : 4); if (side < 0) flipWinding(g);
      const m = new THREE.Mesh(g, ga ? wingMat : wingMat); m.castShadow = true; body.add(m);
      const hinge0 = st[0].le.clone().add(new THREE.Vector3(0, 0, st[0].chord * 0.68)), hinge1 = st[2].le.clone().add(new THREE.Vector3(0, 0, st[2].chord * 0.68));
      const eg = loft(st, 0.68, 1, hi ? 5 : 3); if (side < 0) flipWinding(eg); eg.translate(-hinge0.x, -hinge0.y, -hinge0.z);
      const pv = new THREE.Object3D(); pv.position.copy(hinge0); pv.quaternion.setFromUnitVectors(new THREE.Vector3(side, 0, 0), hinge1.sub(hinge0).normalize());
      eg.applyQuaternion(pv.quaternion.clone().invert());
      const em = new THREE.Mesh(eg, wingMat); em.castShadow = true; pv.add(em); body.add(pv); parts.elevators.push(pv);
    }
  }

  // ---------- engines ----------
  const fanGeo = (() => { // fan blades disc
    const g: THREE.BufferGeometry[] = [];
    const nb = hi ? 18 : 8;
    for (let i = 0; i < nb; i++) { const b = new THREE.BoxGeometry(0.06, 0.5, 0.02).translate(0, 0.27, 0); b.rotateZ(i / nb * Math.PI * 2); b.rotateY(0.0); g.push(b); }
    return mergeGeometries(g)!;
  })();
  const nacelle = (D: number, Lc: number) => {
    const pts: THREE.Vector2[] = [];
    const r = D / 2;
    const prof: [number, number][] = [[r * 0.84, 0], [r * 0.95, 0.03], [r, 0.12], [r * 0.99, 0.35], [r * 0.9, 0.62], [r * 0.72, 0.8], [r * 0.6, 0.83], [r * 0.55, 0.95], [r * 0.38, 1]];
    for (const [rr2, z] of prof) pts.push(new THREE.Vector2(rr2, z * Lc));
    const g = new THREE.LatheGeometry(pts, hi ? 36 : 14); g.rotateX(Math.PI / 2); // axis along +z
    return g;
  };
  const addEngine = (pos: THREE.Vector3, idx: number, side: number, rear = false) => {
    const E = spec.engines; const grp = new THREE.Group(); grp.position.copy(pos); body.add(grp);
    const ng = nacelle(E.nacelleD, E.nacelleL); const nm = new THREE.Mesh(ng, engMat); nm.castShadow = true; grp.add(nm);
    nm.material = engMat;
    // inlet lip chrome
    const lip = new THREE.Mesh(new THREE.TorusGeometry(E.nacelleD * 0.45, E.nacelleD * 0.055, 10, hi ? 36 : 14), chrome); lip.position.z = 0.04; grp.add(lip);
    // inner duct (dark)
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(E.nacelleD * 0.42, E.nacelleD * 0.42, E.nacelleL * 0.3, hi ? 28 : 10, 1, true), darkMetal); duct.rotation.x = Math.PI / 2; duct.position.z = E.nacelleL * 0.15; duct.material = darkMetal; (duct.material as THREE.Material).side = THREE.DoubleSide; grp.add(duct);
    // fan + spinner
    const fan = new THREE.Group(); fan.position.z = E.nacelleD * 0.18; grp.add(fan);
    const blades = new THREE.Mesh(fanGeo, darkMetal); blades.scale.setScalar(E.fanD * 0.95); fan.add(blades);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(E.fanD * 0.16, E.fanD * 0.35, 16), chrome); spinner.rotation.x = -Math.PI / 2; spinner.position.z = -E.fanD * 0.12; fan.add(spinner);
    const swirl = new THREE.Mesh(new THREE.CircleGeometry(E.fanD * 0.05, 8), new THREE.MeshBasicMaterial({ color: 0xffffff })); swirl.position.set(E.fanD * 0.05, 0, -E.fanD * 0.3); fan.add(swirl);
    parts.fans.push({ obj: fan, idx, prop: false });
    // core nozzle + plug
    const plug = new THREE.Mesh(new THREE.ConeGeometry(E.nacelleD * 0.2, E.nacelleL * 0.25, 16), darkMetal); plug.rotation.x = Math.PI / 2; plug.position.z = E.nacelleL * 1.08; grp.add(plug);
    parts.exhaust.push(new THREE.Vector3(pos.x, pos.y, pos.z + E.nacelleL * 1.1));
    if (!rear) { // pylon
      const pg = new THREE.BoxGeometry(0.25 * E.nacelleD / 2, E.nacelleD * 0.5, E.nacelleL * 0.9).translate(0, E.nacelleD * 0.55, E.nacelleL * 0.55);
      const pm = new THREE.Mesh(pg, wingMat); grp.add(pm);
    } else {
      const pg = new THREE.BoxGeometry(Math.abs(pos.x) - R * 0.8, 0.12, E.nacelleL * 0.5).translate(-side * (Math.abs(pos.x) - R * 0.8) / 2, 0, E.nacelleL * 0.5);
      grp.add(new THREE.Mesh(pg, engMat));
    }
  };
  const E = spec.engines;
  if (E.mount === 'wing') {
    let i = 0;
    const order: { f: number; side: number }[] = [];
    for (const f of [...E.span].reverse()) order.push({ f, side: -1 });
    for (const f of E.span) order.push({ f, side: 1 });
    for (const { f, side } of order) {
      const le = leAt(f, side);
      const pos = new THREE.Vector3(le.x, le.y - E.nacelleD * 0.62, le.z - E.nacelleL * 0.45);
      addEngine(pos, i++, side);
    }
  } else if (E.mount === 'rear') {
    for (const side of [-1, 1]) addEngine(new THREE.Vector3(side * (R + E.nacelleD * 0.75), fusY(tailZ - L * 0.28).yc + R * 0.35, tailZ - L * 0.33), side < 0 ? 0 : 1, side, true);
  } else {
    // propeller (C172)
    const prop = new THREE.Group(); prop.position.set(0, -R * 0.1, noseZ - 0.12); body.add(prop);
    const spinner = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10).scale(1, 1, 1.6), paint); prop.add(spinner);
    const bladeG = new THREE.BoxGeometry(0.11, E.fanD / 2, 0.025).translate(0, E.fanD / 4, 0);
    for (const a of [0, Math.PI]) { const bm = new THREE.Mesh(bladeG, darkMetal); bm.rotation.z = a; bm.rotation.y = 0.25; prop.add(bm); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(E.fanD / 2, 32), new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    prop.add(disc);
    parts.fans.push({ obj: prop, idx: 0, prop: true, disc });
    // cowling detail
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.7, R * 0.85, 0.3, 16, 1, true).rotateX(Math.PI / 2), paint); cowl.position.set(0, -R * 0.1, noseZ + 0.1); body.add(cowl);
    parts.exhaust.push(new THREE.Vector3(R * 0.5, -R * 0.8, noseZ + 1.2));
  }

  // ---------- landing gear ----------
  const G = spec.gear; const bottomY = -(R + G.height);
  const wheel = (D: number, w: number) => { const g = new THREE.CylinderGeometry(D / 2, D / 2, w, hi ? 20 : 10).rotateZ(Math.PI / 2); return g; };
  const hub = (D: number, w: number) => new THREE.CylinderGeometry(D * 0.28, D * 0.28, w * 1.02, 10).rotateZ(Math.PI / 2);
  const mkGear = (x: number, z: number, isNose: boolean, nWheels: number, side: number) => {
    const pivotY = isNose ? fusY(z).yc - R * 0.55 : (spec.wingMount === 'high' ? -R * 0.5 : wingY0 - 0.1);
    const pivot = new THREE.Object3D(); pivot.position.set(x, pivotY, z); body.add(pivot);
    const legLen = pivotY - bottomY - G.wheelD / 2;
    const strut = new THREE.Group(); pivot.add(strut);
    const sm = new THREE.Mesh(new THREE.CylinderGeometry(G.wheelD * 0.12, G.wheelD * 0.1, legLen, 10), gearMat); sm.position.y = -legLen / 2; strut.add(sm);
    const wheels: THREE.Object3D[] = [];
    const ww = G.wheelD * 0.38;
    if (nWheels <= 2) {
      for (let i = 0; i < nWheels; i++) {
        const off = nWheels === 1 ? 0 : (i ? 1 : -1) * (ww * 0.75);
        const wg = new THREE.Group(); wg.position.set(off, -legLen, 0); strut.add(wg);
        wg.add(new THREE.Mesh(wheel(G.wheelD, ww), tire)); wg.add(new THREE.Mesh(hub(G.wheelD, ww), gearMat)); wheels.push(wg);
        if (ga) { const fair = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8).scale(ww * 0.9, G.wheelD * 0.45, G.wheelD * 0.8), paint); fair.position.copy(wg.position); fair.position.y += 0.05; strut.add(fair); }
      }
    } else {
      // bogie
      const rows = nWheels / 2; const pitchZ = G.wheelD * 1.15;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, pitchZ * (rows - 1) + 0.3), gearMat); beam.position.y = -legLen; strut.add(beam);
      for (let r = 0; r < rows; r++) for (const s2 of [-1, 1]) {
        const wg = new THREE.Group(); wg.position.set(s2 * ww * 0.8, -legLen, (r - (rows - 1) / 2) * pitchZ); strut.add(wg);
        wg.add(new THREE.Mesh(wheel(G.wheelD, ww), tire)); wg.add(new THREE.Mesh(hub(G.wheelD, ww), gearMat)); wheels.push(wg);
      }
    }
    strut.traverse(o => { (o as THREE.Mesh).castShadow = true; });
    // retraction: mains fold inboard (rotate about z), nose folds forward (rotate about x)
    const axis = isNose ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const angle = isNose ? Math.PI / 2 * 0.95 : -side * Math.PI / 2 * 0.95;
    let door: THREE.Object3D | undefined;
    if (!G.fixed) {
      const dg = new THREE.BoxGeometry(isNose ? 0.04 : legLen * 0.6, isNose ? legLen * 0.6 : 0.04, isNose ? legLen * 0.8 : G.wheelD * 1.2);
      dg.translate(isNose ? 0 : -side * legLen * 0.3, isNose ? -legLen * 0.3 : 0, 0);
      const dp = new THREE.Object3D(); dp.position.set(isNose ? x + 0.35 : x * 0.15, pivotY, z); body.add(dp);
      const dm = new THREE.Mesh(dg, paint); dp.add(dm); door = dp;
    }
    // ground lights attached to gear
    parts.gear.push({ pivot, axis, angle, door, doorAngle: 0, isNose, wheels, strut });
    return pivot;
  };
  const noseZg = G.wheelbase * -0.9, mainZg = G.wheelbase * 0.1;
  const np = mkGear(0, noseZg, true, ga ? 1 : 2, 0);
  for (let i = 0; i < G.mainBogies; i++) {
    const side = i % 2 === 0 ? -1 : 1; const inner = G.mainBogies === 4 && i >= 2;
    const x = side * (inner ? G.track * 0.3 : G.track / 2);
    mkGear(x, mainZg + (inner ? -1.5 : 0), false, G.mainWheels, side);
  }

  // ---------- lights ----------
  const tipL = parts.wingTips[0], tipR = parts.wingTips[1];
  parts.lights.nav.push(addLight(body, 0xff2020, tipL.clone().add(new THREE.Vector3(-0.1, 0.05, -0.3)), 0.5 * Math.max(1, R * 0.8)));
  parts.lights.nav.push(addLight(body, 0x20ff40, tipR.clone().add(new THREE.Vector3(0.1, 0.05, -0.3)), 0.5 * Math.max(1, R * 0.8)));
  for (const tp of [tipL, tipR]) { const s = glowSprite(0xffffff, 3 * Math.max(1, R)); s.position.copy(tp).add(new THREE.Vector3(0, 0.05, 0.1)); s.visible = false; body.add(s); parts.lights.strobe.push(s); }
  if (!ga) {
    const tailStrobe = glowSprite(0xffffff, 3 * R); tailStrobe.position.set(0, fusY(tailZ).yc, tailZ + 0.2); tailStrobe.visible = false; body.add(tailStrobe); parts.lights.strobe.push(tailStrobe);
  }
  for (const y of ga ? [vtRootLE.y + spec.vtHeight + 0.05] : [R + 0.15, -R - 0.15]) {
    const bz = ga ? vtRootLE.z + spec.vtHeight * Math.tan(spec.vtSweep * DEG) + 0.1 : wingRootLE + spec.rootChord * 0.4;
    const b = glowSprite(0xff2010, 2.2 * Math.max(1, R * 0.6)); b.position.set(0, (ga ? 0 : fusY(bz).yc) + y + (spec.hump && y > 0 ? R * 0.5 : 0), bz); b.visible = false; body.add(b); parts.lights.beacon.push(b);
  }
  // landing lights: wing roots (airliners) or wing LE (GA)
  const llPos = ga ? [leAt(0.42, -1)] : [leAt(0.12, -1), leAt(0.12, 1)];
  for (const p of llPos) {
    const sl = new THREE.SpotLight(0xfff4e0, 0, 900, 22 * DEG, 0.5, 1.4); sl.position.copy(p).add(new THREE.Vector3(0, -0.15, -0.2));
    const tgt = new THREE.Object3D(); tgt.position.copy(sl.position).add(new THREE.Vector3(0, -6, -100)); body.add(tgt); sl.target = tgt;
    body.add(sl); parts.lights.landing.push(sl);
    const gs = glowSprite(0xfff8e8, 2.5 * Math.max(1, R * 0.6)); gs.position.copy(sl.position).add(new THREE.Vector3(0, 0, -0.2)); gs.visible = false; body.add(gs); parts.lights.landingGlow.push(gs);
  }
  {
    const tl = new THREE.SpotLight(0xffffff, 0, 250, 30 * DEG, 0.6, 1.6); tl.position.set(0, -0.6, 0.0); const tgt = new THREE.Object3D(); tgt.position.set(0, -6, -60);
    np.add(tl); np.add(tgt); tl.target = tgt; parts.lights.taxi = tl;
  }
  // cabin windows glow at night
  // L1 door
  if (!ga) {
    const dz = noseZ + noseLen * 1.2 + 0.6; const dY = fusY(dz);
    const dg = new THREE.BoxGeometry(0.06, 1.85, 0.9).translate(0, 0, 0.45);
    const pv = new THREE.Object3D(); pv.position.set(-Rw * 0.99, dY.yc + 0.15, dz - 0.45); body.add(pv);
    const dm = new THREE.Mesh(dg, new THREE.MeshPhysicalMaterial({ color: lv.body, roughness: 0.35 })); dm.visible = false; pv.add(dm); parts.door = { pivot: pv };
  }

  // cockpit eye point
  const eyeZ = ga ? noseZ + 2.25 : noseZ + noseLen * 0.62;
  const eyeY = ga ? R * 0.55 : fusY(eyeZ).yc + R * 0.38 * (spec.fuselageD > 5 ? 0.85 : 1);
  parts.cockpitEye.set(ga ? -0.28 : -Math.min(0.55, Rw * 0.28), eyeY, eyeZ);
  // windshield glass for GA
  if (ga) {
    const ws = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(Rw * 0.95, R * 0.55, 0.9), glass);
    ws.position.set(0, R * 0.45, noseZ + 1.75); ws.rotation.x = -0.2; body.add(ws); (parts as any).windshield = ws;
  }

  body.traverse(o => { if ((o as THREE.Mesh).isMesh) { const m = o as THREE.Mesh; m.castShadow = m.castShadow || hi; } });
  return parts;
}

function addLight(parent: THREE.Object3D, color: number, pos: THREE.Vector3, size: number) {
  const s = glowSprite(color, size * 2.2); s.position.copy(pos); s.visible = false; parent.add(s);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color })); core.position.copy(pos); parent.add(core);
  return s;
}
function flipWinding(g: THREE.BufferGeometry) {
  const i = g.index!; const a = i.array as Uint16Array | Uint32Array;
  for (let k = 0; k < a.length; k += 3) { const t = a[k]; a[k] = a[k + 1]; a[k + 1] = t; }
  i.needsUpdate = true; g.computeVertexNormals();
}

/** Animate surfaces/gear/lights from simulation state. */
export function animateAircraft(p: AircraftParts, s: {
  flap: number; spoiler: number; ail: number; elev: number; rud: number; gear: number; n1: number[]; dt: number; time: number;
  lights: { nav: boolean; beacon: boolean; strobe: boolean; landing: boolean; taxi: boolean; logo: boolean }; door: number; steer: number; wheelSpin: number; night: number; slats: number; ga: boolean;
}) {
  const fl = s.flap;
  for (const f of p.flaps) {
    f.pivot.quaternion.copy((f.pivot as any).q0 ||= f.pivot.quaternion.clone());
    f.pivot.rotateX(fl * (s.ga ? 30 : 38) * DEG);
    f.pivot.position.copy(f.base).add(new THREE.Vector3(0, -fl * f.chord * 0.06, fl * f.chord * (s.ga ? 0.12 : 0.28)));
  }
  for (const sl of p.slats) sl.obj.position.set(0, -s.slats * sl.chord * 0.04, -s.slats * sl.chord * 0.08);
  for (const a of p.ailerons) { a.pivot.quaternion.copy((a.pivot as any).q0 ||= a.pivot.quaternion.clone()); a.pivot.rotateX(-a.side * s.ail * 20 * DEG); }
  for (const sp of p.spoilers) {
    sp.pivot.quaternion.copy((sp.pivot as any).q0 ||= sp.pivot.quaternion.clone());
    const rollSp = !sp.inboard ? Math.max(0, -s.ail * sp.side) * 0.6 : 0;
    sp.pivot.rotateX(-Math.min(1, s.spoiler + rollSp) * 50 * DEG * (sp.side < 0 ? 1 : 1));
  }
  for (const e of p.elevators) { e.quaternion.copy((e as any).q0 ||= e.quaternion.clone()); e.rotateX(-s.elev * 22 * DEG); }
  if (p.rudder) { p.rudder.quaternion.copy((p.rudder as any).q0 ||= p.rudder.quaternion.clone()); p.rudder.rotateY(0); p.rudder.rotateX(0); p.rudder.rotateOnAxis(new THREE.Vector3(0, 1, 0), s.rud * 25 * DEG); }
  for (const f of p.fans) {
    const n1 = s.n1[f.idx] ?? 0;
    if (f.prop) {
      const rpm = n1 * 27; f.obj.rotation.z += rpm / 60 * Math.PI * 2 * s.dt * (rpm > 1500 ? 0.17 : 1);
      if (f.disc) (f.disc.material as THREE.MeshBasicMaterial).opacity = clamp((rpm - 800) / 1500, 0, 0.12);
      f.obj.children.forEach(c => { if (c !== f.disc && (c as THREE.Mesh).geometry?.type === 'BoxGeometry') c.visible = rpm < 2000; });
    } else f.obj.rotation.z += n1 / 100 * 45 * s.dt * (n1 > 40 ? 0.31 : 1);
  }
  const g = s.gear;
  for (const gr of p.gear) {
    gr.pivot.quaternion.setFromAxisAngle(gr.axis, gr.angle * (1 - g));
    if (gr.isNose) gr.strut.rotation.y = -s.steer * g;
    for (const w of gr.wheels) w.rotation.x -= s.wheelSpin * s.dt / 0.6;
    if (gr.door) { const open = g > 0.02 && g < 0.98 ? 1 : g >= 0.98 ? 0.85 : 0; gr.doorAngle = (gr.doorAngle ?? 0) + (open - (gr.doorAngle ?? 0)) * Math.min(1, s.dt * 4); gr.door.rotation.set(gr.isNose ? 0 : 0, 0, gr.isNose ? 0 : (gr.pivot.position.x < 0 ? -1 : 1) * gr.doorAngle! * 1.4); gr.door.visible = gr.doorAngle! > 0.05; if (gr.isNose) gr.door.rotation.z = gr.doorAngle! * 1.2; }
  }
  if (p.door) { p.door.pivot.rotation.y = -s.door * 1.6; p.door.pivot.children[0].visible = s.door > 0.02; }
  const L = p.lights; const t = s.time;
  const gscale = 0.35 + 0.65 * s.night;
  for (const g of [...L.nav, ...L.beacon, ...L.strobe, ...L.landingGlow]) g.scale.setScalar(gscale);
  for (const n of L.nav) n.visible = s.lights.nav;
  const beaconOn = s.lights.beacon && (t % 1.2) < 0.15;
  for (const b of L.beacon) b.visible = beaconOn;
  const st = t % 1.3; const strobeOn = s.lights.strobe && (st < 0.05 || (st > 0.13 && st < 0.18));
  for (const b of L.strobe) b.visible = strobeOn;
  for (const l of L.landing) l.intensity = s.lights.landing ? 120 * (0.3 + s.night) : 0;
  for (const l of L.landingGlow) l.visible = s.lights.landing;
  if (L.taxi) L.taxi.intensity = s.lights.taxi ? 60 * (0.3 + s.night) : 0;
  if (L.logo) L.logo.intensity = s.lights.logo ? 30 * s.night : 0;
}

/** Low-poly merged model for static/AI aircraft (few draw calls). */
const lowCache = new Map<string, THREE.Group>();
export function buildStaticAircraft(spec: AircraftSpec, livery: Livery): THREE.Group {
  const key = spec.id + '|' + livery.id;
  let tpl = lowCache.get(key);
  if (!tpl) {
    const p = buildAircraft(spec, { lod: 'low', livery });
    p.root.updateMatrixWorld(true);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    p.root.traverse(o => {
      const m = o as THREE.Mesh; if (!m.isMesh || !m.visible) return;
      const mat = m.material as THREE.Material; if ((mat as any).blending === THREE.AdditiveBlending || (mat as THREE.MeshBasicMaterial).transparent) return;
      let g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      (byMat.get(mat) ?? byMat.set(mat, []).get(mat)!).push(g);
    });
    tpl = new THREE.Group();
    for (const [mat, gs] of byMat) { const mg = mergeGeometries(gs); if (!mg) continue; const mm = new THREE.Mesh(mg, mat); mm.castShadow = false; mm.receiveShadow = false; tpl.add(mm); }
    (tpl as any).restY = spec.fuselageD / 2 + spec.gear.height;
    lowCache.set(key, tpl);
  }
  const g = tpl.clone(); (g as any).restY = (tpl as any).restY; return g;
}
