// Procedural 3D phone built from a design + an orbit viewer. Units: 1 = 10 mm.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { renderOS } from './os.js';

const MM = 0.1;
function roundRectShape(w, h, r) {
  r = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001)); const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function planeUV(geo, u0 = 0, u1 = 1, v0 = 0, v1 = 1) {
  geo.computeBoundingBox(); const b = geo.boundingBox, p = geo.getAttribute('position'), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = u0 + ((p.getX(i) - b.min.x) / (b.max.x - b.min.x)) * (u1 - u0); uv[i * 2 + 1] = v0 + ((p.getY(i) - b.min.y) / (b.max.y - b.min.y)) * (v1 - v0); }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}
export function frameMaterial(type, color) {
  const c = new THREE.Color(color);
  switch (type) {
    case 'aluminum': return new THREE.MeshStandardMaterial({ color: c, metalness: 0.85, roughness: 0.32 });
    case 'steel': return new THREE.MeshStandardMaterial({ color: c, metalness: 1, roughness: 0.12 });
    case 'titanium': return new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color(0x9a9387), 0.3), metalness: 0.8, roughness: 0.42 });
    case 'ceramic': return new THREE.MeshPhysicalMaterial({ color: c, metalness: 0, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 });
    default: return new THREE.MeshStandardMaterial({ color: c, metalness: 0, roughness: 0.55 });
  }
}
let leatherTex = null;
function backMaterial(type, color) {
  const c = new THREE.Color(color);
  switch (type) {
    case 'gloss': return new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.1, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.02 });
    case 'matte': return new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.05, roughness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.6 });
    case 'leather': {
      if (!leatherTex) { const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 5000; i++) { const v = 100 + Math.random() * 60; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 0, 7); g.fill(); } leatherTex = new THREE.CanvasTexture(cv); leatherTex.wrapS = leatherTex.wrapT = THREE.RepeatWrapping; leatherTex.repeat.set(3, 6); }
      return new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, metalness: 0, bumpMap: leatherTex, bumpScale: 0.02 });
    }
    case 'transparent': return new THREE.MeshPhysicalMaterial({ color: c.clone().lerp(new THREE.Color(0xffffff), 0.6), metalness: 0, roughness: 0.05, transparent: true, opacity: 0.28, clearcoat: 1, depthWrite: false });
    case 'sapphire': return new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.2, roughness: 0.05, clearcoat: 1, iridescence: 0.6, iridescenceIOR: 1.5 });
    default: return new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0 });
  }
}
const lensGlass = new THREE.MeshPhysicalMaterial({ color: 0x05070c, metalness: 0.2, roughness: 0.05, clearcoat: 1 });
const lensIris = new THREE.MeshBasicMaterial({ color: 0x2b4fff, transparent: true, opacity: 0.55 });
const black = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2, metalness: 0.3 });
const glassFront = new THREE.MeshPhysicalMaterial({ color: 0x020203, roughness: 0.05, metalness: 0.1, clearcoat: 1 });

function cameraPositions(layout, n, cs, W, H) {
  // returns positions (mm) relative to back-top-"left" anchor area and module rect
  const gap = cs * 2.5, pts = [];
  switch (layout) {
    case 'vertical': for (let i = 0; i < n; i++) pts.push([0, -i * gap]); break;
    case 'horizontal': for (let i = 0; i < n; i++) pts.push([-i * gap, 0]); break;
    case 'square': { const c = n <= 4 ? 2 : 3; for (let i = 0; i < n; i++) pts.push([-(i % c) * gap, -Math.floor(i / c) * gap]); break; }
    case 'circle': { if (n === 1) pts.push([0, 0]); else { const R = Math.max(gap * 0.75, (gap * n) / (2 * Math.PI)); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 - Math.PI / 2; pts.push([Math.cos(a) * R, Math.sin(a) * R]); } } break; }
    case 'triangle': { let k = 0; for (let row = 0; k < n; row++) for (let j = 0; j <= row && k < n; j++, k++) pts.push([-(j - row / 2) * gap, -row * gap * 0.87]); break; }
    case 'center': { if (n === 1) pts.push([0, 0]); else { const R = gap * Math.max(1, n / 5); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([Math.cos(a) * R, Math.sin(a) * R]); } } break; }
    case 'grid': { const c = Math.ceil(Math.sqrt(n * W / H)); for (let i = 0; i < n; i++) pts.push([-(i % c) * gap, -Math.floor(i / c) * gap]); break; }
    default: { for (let i = 0; i < n; i++) pts.push([-(i % 2) * gap, -Math.floor(i / 2) * gap]); }
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  return { pts, minX, maxX, minY, maxY };
}

// Build one slab (body) of the phone. half: for folds, which part of the screen texture to show
function buildSlab(d, ctx, w, h, screenUV, withCams) {
  const e = d.ext, g = new THREE.Group();
  const W = w * MM, H = h * MM, T = e.t * MM, R = Math.min(e.r, w / 2 - 0.5, h / 2 - 0.5) * MM;
  const bev = Math.min(T * 0.35, R * 0.6, 0.12);
  const bodyGeo = new THREE.ExtrudeGeometry(roundRectShape(W - bev * 2, H - bev * 2, Math.max(0.01, R - bev)), { depth: T - bev * 2, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 5, curveSegments: 18 });
  bodyGeo.translate(0, 0, -(T - bev * 2) / 2);
  const bodyMat = frameMaterial(e.frame, e.frameColor); if (e.back === 'transparent') { bodyMat.transparent = true; bodyMat.opacity = 0.32; bodyMat.depthWrite = false; }
  const body = new THREE.Mesh(bodyGeo, bodyMat); body.renderOrder = 2; body.castShadow = true; g.add(body);
  // back
  const backGeo = new THREE.ShapeGeometry(roundRectShape(W - bev * 1.6, H - bev * 1.6, Math.max(0.01, R - bev)), 18);
  const bm = backMaterial(e.back, e.color); const back = new THREE.Mesh(backGeo, bm); back.position.z = -T / 2 - 0.006; back.rotation.y = Math.PI; g.add(back);
  if (e.back === 'transparent') g.add(internals(d, W, H, T)); // see-through internals
  // front glass + screen
  const front = new THREE.Mesh(new THREE.ShapeGeometry(roundRectShape(W - bev * 1.6, H - bev * 1.6, Math.max(0.01, R - bev)), 18), glassFront); front.position.z = T / 2 + 0.006; g.add(front);
  const bz = e.bezel * MM, topExtra = e.shape === 'bezel' ? 0.6 : 0;
  const sw = Math.max(0.1, W - bz * 2), sh = Math.max(0.1, H - bz * 2 - topExtra);
  const scrGeo = planeUV(new THREE.ShapeGeometry(roundRectShape(sw, sh, Math.max(0.01, R - bz)), 18), ...screenUV);
  const screen = new THREE.Mesh(scrGeo, ctx.screenMat); screen.position.set(0, -topExtra / 2, T / 2 + 0.012); g.add(screen);
  if (e.shape === 'bezel') { const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.8, 4, 8), black); ear.rotation.z = Math.PI / 2; ear.position.set(0, H / 2 - bz - 0.25, T / 2 + 0.006); g.add(ear); const fc = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), lensGlass); fc.position.set(0.9, H / 2 - bz - 0.25, T / 2 + 0.006); g.add(fc); }
  // buttons
  const btn = frameMaterial(e.frame, e.frameColor);
  const sideBtn = (side, y, len, mat = btn) => { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, len, 4, 8), mat); b.position.set(side * (W / 2 + 0.02), y, 0); g.add(b); return b; };
  if (withCams) {
    const pSide = e.buttons === 'left' ? -1 : 1, vSide = e.buttons === 'both' ? -pSide : pSide;
    sideBtn(pSide, H * 0.18, 0.9, e.fingerprint === 'side' ? new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.3 }) : btn);
    sideBtn(vSide, e.buttons === 'both' ? H * 0.2 : H * 0.33, 1.5);
    if (e.actionKey) sideBtn(-pSide, H * 0.38, 0.35, new THREE.MeshStandardMaterial({ color: e.accent, metalness: 0.4, roughness: 0.3 }));
    // bottom: port + speaker holes
    const portMat = new THREE.MeshBasicMaterial({ color: 0x080808 });
    if (e.port === 'usbc') { const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.55, 4, 8), portMat); p.rotation.z = Math.PI / 2; p.position.set(0, -H / 2 + 0.06, 0); g.add(p); }
    if (e.port === 'micro') { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.18), portMat); p.position.set(0, -H / 2, 0); g.add(p); }
    if (e.port === 'magnetic') for (const x of [-0.2, 0.2]) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.08, 12), new THREE.MeshStandardMaterial({ color: 0xd4a017, metalness: 1, roughness: 0.2 })); p.position.set(x, -H / 2 + 0.4, -T / 2 - 0.012); p.rotation.y = Math.PI; g.add(p); }
    const holes = { mono: 1, stereo: 2, quad: 2 }[e.speakers] || 1;
    const grill = (yy, side) => { for (let i = 0; i < 6; i++) { const h2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8), portMat); h2.position.set(side * (0.9 + i * 0.15), yy, 0); g.add(h2); } };
    grill(-H / 2 - 0.005, 1); if (holes >= 2) grill(-H / 2 - 0.005, -1); if (e.speakers === 'quad') { grill(H / 2 + 0.005, 1); grill(H / 2 + 0.005, -1); }
    // cameras on the back (top-left when looking at the back = +x)
    const n = e.camCount, cs = 4.2 * e.camSize; // lens radius (mm)
    const L = cameraPositions(e.camLayout, n, cs, w, h);
    const margin = 4 + cs * 1.3;
    let ax = w / 2 - margin - L.maxX, ay = h / 2 - margin - L.maxY;
    if (e.camLayout === 'center') { ax = -(L.minX + L.maxX) / 2; ay = h * 0.18 - (L.minY + L.maxY) / 2; }
    if (e.camLayout === 'horizontal') { ax = (w - 2 * margin) / 2 - L.maxX - ((w - 2 * margin) - (L.maxX - L.minX)) / 2; }
    const modW = (L.maxX - L.minX) + cs * 3.2, modH = (L.maxY - L.minY) + cs * 3.2, mcx = ax + (L.minX + L.maxX) / 2, mcy = ay + (L.minY + L.maxY) / 2;
    const modMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(e.color).multiplyScalar(0.8), roughness: 0.2, metalness: 0.3, clearcoat: 1 });
    let mod = null;
    if (['square', 'circle', 'horizontal', 'grid', 'center', 'triangle'].includes(e.camLayout) || n > 2) {
      const mw = e.camLayout === 'horizontal' ? (w - 8) : modW, mh = modH;
      const shape = e.camLayout === 'circle' || e.camLayout === 'center' ? (() => { const sh2 = new THREE.Shape(); sh2.absarc(0, 0, Math.max(mw, mh) / 2 * MM, 0, Math.PI * 2); return sh2; })() : roundRectShape(mw * MM, mh * MM, Math.min(mw, mh) * 0.3 * MM);
      mod = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 }), modMat);
      mod.rotation.y = Math.PI; mod.position.set((e.camLayout === 'horizontal' ? 0 : mcx) * MM, mcy * MM, -T / 2 - 0.004); g.add(mod);
    }
    const bump = mod ? 0.1 : 0;
    const ringMat = new THREE.MeshStandardMaterial({ color: e.frame === 'plastic' ? 0x222222 : new THREE.Color(e.frameColor), metalness: 0.9, roughness: 0.25 });
    L.pts.forEach(([px, py], i) => {
      const x = (ax + px) * MM, y = (ay + py) * MM, r = cs * MM * (i === 0 ? 1.1 : 1);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 32), ringMat); ring.rotation.x = Math.PI / 2; ring.position.set(x, y, -T / 2 - bump - 0.05); g.add(ring);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.78, 32), lensGlass); lens.rotation.y = Math.PI; lens.position.set(x, y, -T / 2 - bump - 0.112); g.add(lens);
      const iris = new THREE.Mesh(new THREE.CircleGeometry(r * 0.25, 16), lensIris); iris.rotation.y = Math.PI; iris.position.set(x + r * 0.15, y + r * 0.15, -T / 2 - bump - 0.114); g.add(iris);
    });
    // flash
    const fx = (ax + L.minX - cs * 1.9) * MM, fy = (ay + L.maxY) * MM;
    const fmat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0x554422, roughness: 0.3 });
    if (e.flash === 'single' || e.flash === 'dual') { const f = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), fmat); f.rotation.y = Math.PI; f.position.set(fx, fy, -T / 2 - bump - 0.01); g.add(f); if (e.flash === 'dual') { const f2 = f.clone(); f2.material = new THREE.MeshStandardMaterial({ color: 0xffd28a, emissive: 0x553311 }); f2.position.y -= 0.32; g.add(f2); } }
    if (e.flash === 'ring') { const r0 = cs * MM * 1.1; const t = new THREE.Mesh(new THREE.TorusGeometry(r0 + 0.08, 0.035, 8, 40), fmat); t.position.set((ax + L.pts[0][0]) * MM, (ay + L.pts[0][1]) * MM, -T / 2 - bump - 0.11); g.add(t); }
    // back fingerprint
    if (e.fingerprint === 'back') { const fp = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 32), new THREE.MeshStandardMaterial({ color: new THREE.Color(e.color).multiplyScalar(0.6), roughness: 0.8 })); fp.rotation.x = Math.PI / 2; fp.position.set(0, H * 0.15, -T / 2 - 0.012); g.add(fp); }
    // logo
    if (e.logo && ctx.logoTex) { const ls = Math.min(W, H) * 0.22; const lg = new THREE.Mesh(new THREE.PlaneGeometry(ls, ls), new THREE.MeshBasicMaterial({ map: ctx.logoTex, transparent: true })); lg.rotation.y = Math.PI; lg.position.set(0, -H * 0.05, -T / 2 - 0.016); g.add(lg); }
    if (ctx.nameTex) { const nm = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.5, W * 0.5 / 6), new THREE.MeshBasicMaterial({ map: ctx.nameTex, transparent: true })); nm.rotation.y = Math.PI; nm.position.set(0, -H / 2 + 1.2, -T / 2 - 0.016); g.add(nm); }
    if (e.wireless && e.back === 'transparent') { const coil = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.06, 6, 40), new THREE.MeshStandardMaterial({ color: 0xc87533, metalness: 1, roughness: 0.3 })); coil.position.set(0, -H * 0.05, -T / 2 + 0.1); g.add(coil); }
  }
  return g;
}
// see-through internals for transparent backs
function internals(d, W, H, T) {
  const g = new THREE.Group();
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512; const c = cv.getContext('2d');
  c.fillStyle = '#0c4a2e'; c.fillRect(0, 0, 256, 512); c.strokeStyle = '#d4a017'; c.lineWidth = 1.5;
  for (let i = 0; i < 70; i++) { c.beginPath(); let x = Math.random() * 256, y = Math.random() * 512; c.moveTo(x, y); for (let k = 0; k < 4; k++) { Math.random() < 0.5 ? (x += (Math.random() - 0.5) * 80) : (y += (Math.random() - 0.5) * 80); c.lineTo(x, y); } c.stroke(); }
  c.fillStyle = '#1a1a1a'; c.fillRect(70, 60, 110, 110); c.fillStyle = '#bbb'; c.font = 'bold 18px monospace'; c.fillText('SoC', 105, 120); c.fillStyle = '#222'; c.fillRect(30, 200, 60, 40); c.fillRect(160, 200, 60, 40);
  const tex = new THREE.CanvasTexture(cv);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.8, H * 0.38), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })); board.rotation.y = Math.PI; board.position.set(0, H * 0.27, -T / 2 + 0.05); g.add(board);
  const bat = new THREE.Mesh(new THREE.BoxGeometry(W * 0.72, H * 0.42, 0.05), new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.5, metalness: 0.4 })); bat.position.set(0, -H * 0.18, -T / 2 + 0.06); g.add(bat);
  return g;
}

export function buildPhone(d, ctx) {
  const e = d.ext, root = new THREE.Group(); root.userData.halves = null;
  if (e.fold === 'book' || e.fold === 'flip') {
    const book = e.fold === 'book';
    const A = buildSlab(d, ctx, e.w, e.h, book ? [0, 0.5, 0, 1] : [0, 1, 0, 0.5], false);
    const B = buildSlab(d, ctx, e.w, e.h, book ? [0.5, 1, 0, 1] : [0, 1, 0.5, 1], true);
    const pA = new THREE.Group(), pB = new THREE.Group();
    if (book) { A.position.x = -e.w * MM / 2; B.position.x = e.w * MM / 2; } else { A.position.y = -e.h * MM / 2; B.position.y = e.h * MM / 2; }
    pA.add(A); pB.add(B); root.add(pA, pB);
    const hinge = new THREE.Mesh(new THREE.CylinderGeometry(e.t * MM * 0.5, e.t * MM * 0.5, (book ? e.h : e.w) * MM * 0.96, 20), frameMaterial(e.frame === 'plastic' ? 'aluminum' : e.frame, e.frameColor));
    if (!book) hinge.rotation.z = Math.PI / 2; hinge.position.z = -e.t * MM * 0.05; root.add(hinge);
    root.userData.halves = { pA, pB, book, t: 0 };
  } else root.add(buildSlab(d, ctx, e.w, e.h, [0, 1, 0, 1], true));
  return root;
}
export function setFold(phone, k) {
  const h = phone.userData.halves; if (!h) return; h.t = k; const a = k * Math.PI * 0.98, T = 0.06;
  if (h.book) { h.pB.rotation.y = -a; h.pA.rotation.y = 0; h.pB.position.z = -k * T; } else { h.pB.rotation.x = a; h.pB.position.z = -k * T; }
}
export function screenSize(d) {
  const e = d.ext; let sw = Math.max(5, e.w - 2 * e.bezel), sh = Math.max(5, e.h - 2 * e.bezel - (e.shape === 'bezel' ? 6 : 0));
  if (e.fold === 'book') sw *= 2; if (e.fold === 'flip') sh *= 2;
  return [sw, sh];
}

// -------- viewer --------
export class Viewer {
  constructor(container, opts = {}) {
    this.container = container; this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: !!opts.preserve });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene(); const pm = new THREE.PMREMGenerator(this.renderer); this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200); this.camera.position.set(4, 3, 36);
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(10, 14, 12); this.scene.add(key); this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const rim = new THREE.DirectionalLight(0x88aaff, 1.2); rim.position.set(-12, 4, -10); this.scene.add(rim);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement); this.controls.enableDamping = true; this.controls.dampingFactor = 0.08; this.controls.enablePan = false; this.controls.minDistance = 6; this.controls.maxDistance = 140;
    this.controls.autoRotate = !!opts.autoRotate; this.controls.autoRotateSpeed = 1.5;
    this.osCanvas = document.createElement('canvas'); this.osTex = new THREE.CanvasTexture(this.osCanvas); this.osTex.colorSpace = THREE.SRGBColorSpace; this.osTex.anisotropy = 4;
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.osTex, toneMapped: false });
    this.logoCanvas = document.createElement('canvas'); this.logoCanvas.width = this.logoCanvas.height = 256; this.logoTex = new THREE.CanvasTexture(this.logoCanvas); this.logoTex.colorSpace = THREE.SRGBColorSpace;
    this.nameCanvas = document.createElement('canvas'); this.nameCanvas.width = 512; this.nameCanvas.height = 86; this.nameTex = new THREE.CanvasTexture(this.nameCanvas); this.nameTex.colorSpace = THREE.SRGBColorSpace;
    this.phone = null; this.fold = 0; this.foldTarget = 0; this.screen = 'lock'; this.t = 0; this.running = false; this.extra = null;
    new ResizeObserver(() => this.resize()).observe(container); this.resize();
    // tap on screen → callback (for interactive OS preview)
    this.ray = new THREE.Raycaster(); let down = null;
    this.renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
    this.renderer.domElement.addEventListener('pointerup', (e) => { if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return; const r = this.renderer.domElement.getBoundingClientRect(); const m = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); this.ray.setFromCamera(m, this.camera); const hit = this.phone && this.ray.intersectObject(this.phone, true).find((h) => h.object.material === this.screenMat); if (hit && this.onScreenTap) this.onScreenTap(hit.uv); });
  }
  resize() { const w = this.container.clientWidth || 300, h = this.container.clientHeight || 300; this.renderer.setSize(w, h, false); this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%'; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  setDesign(d, os, company, logoDraw) {
    this.d = d; this.os = os; this.company = company;
    logoDraw(this.logoCanvas); this.logoTex.needsUpdate = true;
    const g = this.nameCanvas.getContext('2d'); g.clearRect(0, 0, 512, 86); g.fillStyle = 'rgba(255,255,255,0.75)'; if (['#ffffff', '#f8f9fa'].includes(d.ext.color.toLowerCase())) g.fillStyle = 'rgba(0,0,0,0.6)'; g.font = '600 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d.name, 256, 43); this.nameTex.needsUpdate = true;
    const [sw, sh] = screenSize(d); const nh = Math.max(120, Math.min(2200, Math.round((540 * sh) / sw))); if (this.osCanvas.height !== nh || this.osCanvas.width !== 540) { this.osCanvas.width = 540; this.osCanvas.height = nh; this.osTex.dispose(); }
    this.drawScreen();
    if (this.phone) { this.scene.remove(this.phone); this.phone.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    this.phone = buildPhone(d, { screenMat: this.screenMat, logoTex: this.logoTex, nameTex: this.nameTex }); this.scene.add(this.phone);
    setFold(this.phone, this.fold);
    const size = Math.max(d.ext.w * (d.ext.fold === 'book' ? 2 : 1), d.ext.h * (d.ext.fold === 'flip' ? 2 : 1)) * MM; this.fitDist = size * 2.3 + 4; this.controls.maxDistance = Math.max(140, this.fitDist * 3);
    if (!this.fitted) { this.view('front34'); this.fitted = true; }
  }
  drawScreen(extra = {}) { if (!this.os) return; const now = new Date(); renderOS(this.osCanvas, this.os, this.screen, Object.assign({ t: this.t, time: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`, cut: this.d.ext.shape, company: this.company }, this.screenOpts || {}, extra)); this.osTex.needsUpdate = true; }
  view(v) {
    const D = this.fitDist || 36; const P = { front: [0, 0, D], back: [0, 0, -D], side: [D, 0, 0.01], top: [0, D, 0.01], front34: [D * 0.45, D * 0.25, D * 0.85], back34: [-D * 0.5, D * 0.2, -D * 0.85] }[v];
    this.camera.position.set(...P); this.controls.target.set(0, 0, 0); this.controls.update();
  }
  toggleFold() { this.foldTarget = this.foldTarget > 0.5 ? 0 : 1; }
  start() { if (this.running) return; this.running = true; const clock = new THREE.Clock(); const loop = () => { if (!this.running) return; requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), 0.05); this.update(dt); }; loop(); }
  stop() { this.running = false; }
  update(dt) {
    this.t += dt;
    if (this.phone && Math.abs(this.fold - this.foldTarget) > 0.001) { this.fold += Math.sign(this.foldTarget - this.fold) * Math.min(Math.abs(this.foldTarget - this.fold), dt * 1.2); setFold(this.phone, this.fold); }
    if (this.animScreen) { this.animScreen(dt); } else if (this.os && (this.os.wallpaper === 'aurora' || this.os.wallpaper === 'waves') && Math.floor(this.t * 8) !== this._lastFrame) { this._lastFrame = Math.floor(this.t * 8); this.drawScreen(); }
    if (this.extra) this.extra(dt, this);
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
}
