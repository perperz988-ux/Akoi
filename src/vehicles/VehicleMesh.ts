import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VehicleDef } from './VehicleDefs';
import { cMat } from '../actors/Humanoid';

export interface Station { z: number; yb: number; yt: number; wb: number; wt: number }

/** Loft a closed hull from cross-section stations (front → rear). Flat shaded. */
export function loft(st: Station[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { pos.push(...a, ...b, ...c, ...a, ...c, ...d); };
  const ring = (s: Station) => [[-s.wb, s.yb, s.z], [s.wb, s.yb, s.z], [s.wt, s.yt, s.z], [-s.wt, s.yt, s.z]];
  for (let i = 0; i < st.length - 1; i++) {
    const a = ring(st[i]), b = ring(st[i + 1]);
    for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; quad(a[k], b[k], b[k2], a[k2]); }
  }
  const f = ring(st[0]), r = ring(st[st.length - 1]);
  quad(f[3], f[2], f[1], f[0]); quad(r[0], r[1], r[2], r[3]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // ensure outward normals: check centroid
  const n = g.getAttribute('normal'), p = g.getAttribute('position');
  let c = new THREE.Vector3(); for (let i = 0; i < p.count; i++) c.add(new THREE.Vector3().fromBufferAttribute(p, i)); c.divideScalar(p.count);
  let flip = 0;
  for (let i = 0; i < p.count; i += 3) { const v = new THREE.Vector3().fromBufferAttribute(p, i).sub(c); const nn = new THREE.Vector3().fromBufferAttribute(n, i); flip += Math.sign(v.dot(nn)); }
  if (flip < 0) for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  return g;
}

function colorize(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g.clone();
  if (!ng.getAttribute('normal')) ng.computeVertexNormals();
  ng.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = ng.getAttribute('position').count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return ng;
}
const boxG = (w: number, h: number, d: number, x: number, y: number, z: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

// ---------------------------------------------------------------- shared materials
export const MATS = {
  glass: new THREE.MeshStandardMaterial({ color: 0x0c1218, roughness: 0.04, metalness: 0.95, envMapIntensity: 1.4 }),
  tire: cMat(0x141414, 0.95),
  rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.9 }),
  trim: cMat(0x15171a, 0.6),
  headOn: new THREE.MeshBasicMaterial({ color: 0xfff2c8 }), headOff: new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.2, metalness: 0.7 }),
  tailOff: new THREE.MeshStandardMaterial({ color: 0x4a0f10, roughness: 0.4 }), tailDim: new THREE.MeshBasicMaterial({ color: 0x9a1515 }), tailBrake: new THREE.MeshBasicMaterial({ color: 0xff2a22 }), tailRev: new THREE.MeshBasicMaterial({ color: 0xfff0f0 }),
  interior: cMat(0x2a2b30, 0.9), seat: cMat(0x3a3f4a, 0.9),
  red: new THREE.MeshBasicMaterial({ color: 0xff2a2a }), blue: new THREE.MeshBasicMaterial({ color: 0x2a5aff }), redOff: cMat(0x300808, 0.5), blueOff: cMat(0x08143a, 0.5),
  white: cMat(0xf2f2f2, 0.5), black: cMat(0x101113, 0.6), yellowSign: new THREE.MeshBasicMaterial({ color: 0xffd23f }), chrome: new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.15, metalness: 1 }),
};
const paintCache = new Map<number, THREE.MeshStandardMaterial>();
export function paintMat(color: number, premium = false) {
  const k = color * 2 + (premium ? 1 : 0);
  let m = paintCache.get(k);
  if (!m) {
    m = premium ? (new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.2 }) as unknown as THREE.MeshStandardMaterial)
      : new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0.5, envMapIntensity: 1.1 });
    paintCache.set(k, m);
  }
  return m;
}
const farMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });

export interface WheelVis { grp: THREE.Group; spin: THREE.Object3D; front: boolean; x: number; z: number }
export interface VehicleVisual {
  root: THREE.Group; far: THREE.Mesh | null; paintMeshes: THREE.Mesh[]; wheels: WheelVis[];
  steeringWheel?: THREE.Object3D; headLights?: THREE.Mesh; tailLights?: THREE.Mesh;
  beaconRed?: THREE.Mesh; beaconBlue?: THREE.Mesh; rotor?: THREE.Object3D; tailRotor?: THREE.Object3D;
  driverPos: THREE.Vector3; seats: THREE.Vector3[]; headPoints: THREE.Vector3[]; bodyMesh?: THREE.Mesh;
  lean?: THREE.Object3D; exhaust?: THREE.Vector3; fork?: THREE.Object3D; bars?: THREE.Object3D;
}

const wheelGeoCache = new Map<string, THREE.BufferGeometry>();
function wheelGeo(r: number, w: number) {
  const k = `${r.toFixed(2)}_${w.toFixed(2)}`;
  let g = wheelGeoCache.get(k);
  if (!g) {
    const tire = new THREE.CylinderGeometry(r, r, w, 16); tire.rotateZ(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, w * 1.02, 10); rim.rotateZ(Math.PI / 2);
    const spokes = new THREE.BoxGeometry(w * 1.04, r * 1.1, r * 0.12);
    g = mergeGeometries([colorize(tire, 0x151515), colorize(rim, 0xc0c4ca), colorize(spokes, 0x8a8e94), colorize(spokes.clone().rotateX(Math.PI / 2), 0x8a8e94)])!;
    wheelGeoCache.set(k, g);
  }
  return g;
}
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.4 });

const geoCache = new Map<string, { body: THREE.BufferGeometry; glass: THREE.BufferGeometry | null; extra: { g: THREE.BufferGeometry; mat: THREE.Material | 'paint' }[]; far: Map<number, THREE.BufferGeometry> }>();

function carShape(d: VehicleDef) {
  const h = d.len / 2, w = d.wid / 2;
  const y0 = 0.22, belt = d.beltY * d.hei, roof = d.roofY * d.hei, nose = d.noseY * d.hei;
  const cf = d.cabin[0], cr = d.cabin[1];
  const box = d.cls === 'bus' || d.cls === 'van' || d.cls === 'truck' || d.cls === 'ambulance' || d.cls === 'swat';
  const body: Station[] = [
    { z: h, yb: y0 + 0.08, yt: nose * 0.85, wb: w * 0.8, wt: w * 0.76 },
    { z: h * 0.94, yb: y0, yt: nose, wb: w * 0.97, wt: w * 0.93 },
    { z: h * Math.min(0.9, cf + 0.05), yb: y0, yt: belt * (d.cls === 'bus' ? 0.95 : 0.98), wb: w, wt: w * 0.96 },
    { z: h * (cr - 0.05), yb: y0, yt: belt, wb: w, wt: w * 0.96 },
    { z: -h * 0.94, yb: y0, yt: belt * 0.97, wb: w * 0.97, wt: w * 0.93 },
    { z: -h, yb: y0 + 0.06, yt: belt * 0.88, wb: w * 0.82, wt: w * 0.78 },
  ];
  const span = (cf - cr) * h;
  const taper = box ? 1 : 0.76;
  const cab: Station[] = box
    ? [{ z: cf * h, yb: belt, yt: roof, wb: w * 0.97, wt: w * 0.94 }, { z: cr * h, yb: belt, yt: roof, wb: w * 0.97, wt: w * 0.94 }]
    : [
      { z: cf * h, yb: belt - 0.02, yt: belt, wb: w * 0.94, wt: w * 0.92 },
      { z: cf * h - span * 0.28, yb: belt, yt: roof - 0.04, wb: w * 0.92, wt: w * taper },
      { z: cr * h + span * 0.3, yb: belt, yt: roof - 0.04, wb: w * 0.92, wt: w * taper },
      { z: cr * h, yb: belt - 0.02, yt: belt, wb: w * 0.94, wt: w * 0.92 },
    ];
  return { body, cab, roofY: roof, belt, h, w, y0, box };
}

/** Build (and cache) the shared geometries of a land vehicle. */
function carGeos(d: VehicleDef) {
  let c = geoCache.get(d.id);
  if (c) return c;
  const s = carShape(d);
  const body = loft(s.body);
  const glass = loft(s.cab);
  const extra: { g: THREE.BufferGeometry; mat: THREE.Material | 'paint' }[] = [];
  const zc = ((d.cabin[0] + d.cabin[1]) / 2) * s.h, zl = (d.cabin[0] - d.cabin[1]) * s.h * 0.6;
  // roof slab in paint
  if (!s.box) extra.push({ g: boxG(s.w * 1.4 * 0.78, 0.05, zl * 0.95, 0, s.roofY - 0.03, zc), mat: 'paint' });
  else extra.push({ g: boxG(s.w * 2 * 0.95, 0.06, (d.cabin[0] - d.cabin[1]) * s.h, 0, s.roofY, zc), mat: 'paint' });
  // bumpers
  extra.push({ g: boxG(s.w * 1.9, 0.2, 0.18, 0, s.y0 + 0.22, s.h - 0.04), mat: MATS.trim });
  extra.push({ g: boxG(s.w * 1.9, 0.2, 0.18, 0, s.y0 + 0.22, -s.h + 0.04), mat: MATS.trim });
  // grille
  extra.push({ g: boxG(s.w * 1.1, 0.14, 0.04, 0, d.noseY * d.hei * 0.55, s.h * 0.995), mat: MATS.black });
  // cargo bed / box for pickups & trucks
  if (d.cls === 'pickup') {
    extra.push({ g: boxG(s.w * 1.9, 0.5, (-d.cabin[1] + 0.02) * s.h * 0.9 + 1.0, 0, s.belt + 0.2, -s.h * 0.55), mat: 'paint' });
    extra.push({ g: boxG(s.w * 1.6, 0.04, 1.6, 0, s.belt + 0.46, -s.h * 0.55), mat: MATS.black });
  }
  if (d.cls === 'truck') extra.push({ g: boxG(s.w * 2, d.hei * 0.8, s.h * 1.4, 0, s.y0 + d.hei * 0.45, -s.h * 0.35), mat: MATS.white });
  if (d.cls === 'bus') extra.push({ g: boxG(s.w * 2.02, 0.5, s.h * 1.8, 0, s.belt * 0.55 + 0.25, -0.0), mat: 'paint' });
  c = { body, glass, extra, far: new Map() };
  geoCache.set(d.id, c);
  return c;
}

export function buildVehicleVisual(d: VehicleDef, color: number, premium: boolean): VehicleVisual {
  if (d.cls === 'bike') return buildBike(d, color, premium);
  if (d.cls === 'boat' || d.cls === 'jetski') return buildBoat(d, color, premium);
  if (d.cls === 'heli') return buildHeli(d, color, premium);
  const g = carGeos(d), s = carShape(d);
  const root = new THREE.Group();
  const paint = paintMat(color, premium);
  const paintMeshes: THREE.Mesh[] = [];
  const addPaint = (geo: THREE.BufferGeometry) => { const m = new THREE.Mesh(geo, paint); m.castShadow = true; root.add(m); paintMeshes.push(m); return m; };
  const bodyMesh = addPaint(g.body);
  if (g.glass) { const m = new THREE.Mesh(g.glass, MATS.glass); m.castShadow = false; root.add(m); }
  for (const e of g.extra) { if (e.mat === 'paint') addPaint(e.g); else { const m = new THREE.Mesh(e.g, e.mat); root.add(m); } }
  // lights
  const hlGeo = mergeGeometries([boxG(0.34, 0.12, 0.05, -s.w * 0.72, d.noseY * d.hei * 0.78, s.h * 0.985), boxG(0.34, 0.12, 0.05, s.w * 0.72, d.noseY * d.hei * 0.78, s.h * 0.985)])!;
  const tlGeo = mergeGeometries([boxG(0.4, 0.12, 0.05, -s.w * 0.72, s.belt * 0.86, -s.h * 0.995), boxG(0.4, 0.12, 0.05, s.w * 0.72, s.belt * 0.86, -s.h * 0.995)])!;
  const headLights = new THREE.Mesh(hlGeo, MATS.headOff), tailLights = new THREE.Mesh(tlGeo, MATS.tailOff);
  root.add(headLights, tailLights);
  // wheels
  const wheels: WheelVis[] = [];
  const wg = wheelGeo(d.wheelR, d.cls === 'bus' || d.cls === 'truck' ? 0.32 : 0.25);
  const axles: [number, boolean][] = [[d.wheelbase / 2, true], [-d.wheelbase / 2, false]];
  if (d.cls === 'truck' || d.cls === 'bus') axles.push([-d.wheelbase / 2 - 1.1, false]);
  for (const [z, front] of axles) for (const sx of [-1, 1]) {
    const grp = new THREE.Group(); grp.position.set(sx * d.track / 2, d.wheelR, z);
    const spin = new THREE.Mesh(wg, wheelMat); spin.castShadow = true; spin.scale.x = sx;
    grp.add(spin); root.add(grp);
    wheels.push({ grp, spin, front, x: sx * d.track / 2, z });
  }
  // interior
  const inter: THREE.BufferGeometry[] = [];
  const zdash = d.cabin[0] * s.h - 0.25;
  inter.push(colorize(boxG(s.w * 1.7, 0.18, 0.4, 0, s.belt + 0.02, zdash), 0x25262b));
  const seatZ = (d.cabin[0] * 0.55 + d.cabin[1] * 0.45) * s.h;
  const seats: THREE.Vector3[] = [];
  const nrow = d.seats > 2 ? 2 : 1;
  for (let r = 0; r < nrow; r++) for (const sx of [-1, 1]) {
    const z = seatZ - r * 1.0; seats.push(new THREE.Vector3(sx * s.w * 0.45, s.belt - 0.12, z));
    inter.push(colorize(boxG(0.46, 0.1, 0.46, sx * s.w * 0.45, s.belt - 0.28, z), 0x3a3f4a), colorize(boxG(0.46, 0.5, 0.1, sx * s.w * 0.45, s.belt + 0.05, z - 0.22), 0x3a3f4a));
  }
  if (d.cls === 'bus') for (let r = 0; r < 8; r++) for (const sx of [-1, 1]) inter.push(colorize(boxG(0.5, 0.5, 0.5, sx * 0.9, s.belt * 0.8, -s.h * 0.8 + r * 1.2), 0x4a5a70));
  const imesh = new THREE.Mesh(mergeGeometries(inter)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  root.add(imesh);
  const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 14), MATS.trim);
  const driverX = s.w * 0.45;
  steeringWheel.position.set(driverX, s.belt + 0.18, seatZ + 0.55); steeringWheel.rotation.x = -1.1;
  root.add(steeringWheel);
  const driverPos = new THREE.Vector3(driverX, s.belt - 0.38, seatZ);
  // class specific details
  let beaconRed: THREE.Mesh | undefined, beaconBlue: THREE.Mesh | undefined;
  if (d.cls === 'police' || d.cls === 'swat' || d.cls === 'ambulance') {
    const zc = ((d.cabin[0] + d.cabin[1]) / 2) * s.h;
    root.add(new THREE.Mesh(boxG(s.w * 1.3, 0.1, 0.34, 0, s.roofY + 0.07, zc), MATS.black));
    beaconRed = new THREE.Mesh(boxG(s.w * 0.62, 0.12, 0.3, -s.w * 0.34, s.roofY + 0.15, zc), MATS.redOff);
    beaconBlue = new THREE.Mesh(boxG(s.w * 0.62, 0.12, 0.3, s.w * 0.34, s.roofY + 0.15, zc), MATS.blueOff);
    root.add(beaconRed, beaconBlue);
    if (d.cls === 'police') root.add(new THREE.Mesh(boxG(s.w * 2.02, 0.5, (d.cabin[0] - d.cabin[1]) * s.h * 0.7 + 1.2, 0, s.belt * 0.55, 0.1), d.id === 'pd_cruiser' ? MATS.black : MATS.white));
    if (d.cls === 'ambulance') root.add(new THREE.Mesh(boxG(s.w * 2.02, 0.28, s.h * 1.2, 0, s.belt * 0.7, -s.h * 0.35), new THREE.MeshStandardMaterial({ color: 0xd22a2a })));
  }
  if (d.cls === 'taxi') { const m = new THREE.Mesh(boxG(0.7, 0.18, 0.24, 0, s.roofY + 0.12, ((d.cabin[0] + d.cabin[1]) / 2) * s.h), MATS.yellowSign); root.add(m); }
  if (d.cls === 'bus') { root.add(new THREE.Mesh(boxG(s.w * 1.7, 0.3, 0.05, 0, s.roofY - 0.4, s.h * 0.91), MATS.yellowSign)); }
  // far LOD
  const farKey = d.id + ':' + color;
  let far = g.far.get(color);
  if (!far) {
    const parts = [colorize(g.body, color)];
    if (g.glass) parts.push(colorize(g.glass, 0x10161c));
    for (const e of g.extra) parts.push(colorize(e.g, e.mat === 'paint' ? color : 0x15171a));
    for (const w of wheels) parts.push(colorize(new THREE.BoxGeometry(0.25, d.wheelR * 2, d.wheelR * 2).translate(w.x, d.wheelR, w.z), 0x151515));
    far = mergeGeometries(parts)!; g.far.set(color, far);
  }
  void farKey;
  const farMesh = new THREE.Mesh(far, farMat);
  return {
    root, far: farMesh, paintMeshes, wheels, steeringWheel, headLights, tailLights, beaconRed, beaconBlue, driverPos, seats,
    headPoints: [new THREE.Vector3(-s.w * 0.7, d.noseY * d.hei * 0.78, s.h), new THREE.Vector3(s.w * 0.7, d.noseY * d.hei * 0.78, s.h)], bodyMesh, exhaust: new THREE.Vector3(-s.w * 0.6, 0.3, -s.h),
  };
}

function buildBike(d: VehicleDef, color: number, premium: boolean): VehicleVisual {
  const root = new THREE.Group(), lean = new THREE.Group();
  root.add(lean);
  const paint = paintMat(color, premium);
  const paintMeshes: THREE.Mesh[] = [];
  const P = (g: THREE.BufferGeometry, m: THREE.Material = paint) => { const me = new THREE.Mesh(g, m); me.castShadow = true; lean.add(me); if (m === paint) paintMeshes.push(me); return me; };
  const cruiser = d.id === 'mule_cruiser';
  P(boxG(0.3, 0.3, 0.7, 0, 0.78, 0.15));            // tank
  P(boxG(0.28, 0.12, 0.7, 0, 0.7, -0.45), MATS.seat); // seat
  P(boxG(0.34, 0.35, 0.5, 0, 0.45, 0.05), MATS.black); // engine
  if (!cruiser) P(boxG(0.34, 0.45, 0.4, 0, 0.8, 0.62));  // fairing
  P(boxG(0.14, 0.12, 0.5, 0, 0.62, -0.85)); // tail
  const hl = new THREE.Mesh(boxG(0.16, 0.12, 0.05, 0, 0.95, 0.82), MATS.headOff); lean.add(hl);
  const tl = new THREE.Mesh(boxG(0.14, 0.07, 0.05, 0, 0.7, -1.08), MATS.tailOff); lean.add(tl);
  const fork = new THREE.Group(); fork.position.set(0, 0.6, d.wheelbase / 2 - 0.1); lean.add(fork);
  const fk = new THREE.Mesh(boxG(0.08, 0.7, 0.08, 0, -0.1, 0.05), MATS.chrome); fk.rotation.x = 0.35; fork.add(fk);
  const bars = new THREE.Mesh(boxG(0.7, 0.05, 0.05, 0, 0.35, -0.05), MATS.black); fork.add(bars);
  const wg = wheelGeo(d.wheelR, 0.16);
  const wheels: WheelVis[] = [];
  for (const [z, front] of [[d.wheelbase / 2, true], [-d.wheelbase / 2, false]] as [number, boolean][]) {
    const grp = new THREE.Group(); const spin = new THREE.Mesh(wg, wheelMat);
    grp.position.set(0, d.wheelR, z); grp.add(spin); lean.add(grp);
    wheels.push({ grp, spin, front, x: 0, z });
  }
  const farGeo = mergeGeometries([colorize(boxG(0.3, 0.3, 1.5, 0, 0.7, 0), color), colorize(boxG(0.18, 0.62, 0.62, 0, d.wheelR, d.wheelbase / 2), 0x151515), colorize(boxG(0.18, 0.62, 0.62, 0, d.wheelR, -d.wheelbase / 2), 0x151515)])!;
  return { root, lean, far: new THREE.Mesh(farGeo, farMat), paintMeshes, wheels, fork, bars, headLights: hl, tailLights: tl, driverPos: new THREE.Vector3(0, 0.55, -0.35), seats: [new THREE.Vector3(0, 0.55, -0.35), new THREE.Vector3(0, 0.6, -0.85)], headPoints: [new THREE.Vector3(0, 0.95, 0.9)], exhaust: new THREE.Vector3(0.2, 0.3, -1) };
}

function buildBoat(d: VehicleDef, color: number, premium: boolean): VehicleVisual {
  const root = new THREE.Group();
  const paint = paintMat(color, premium), paintMeshes: THREE.Mesh[] = [];
  const h = d.len / 2, w = d.wid / 2;
  const jet = d.cls === 'jetski';
  const hull = loft([
    { z: h, yb: 0.15, yt: d.hei * 0.55, wb: 0.02, wt: w * 0.25 }, { z: h * 0.6, yb: -0.35, yt: d.hei * 0.5, wb: w * 0.35, wt: w * 0.85 },
    { z: -h * 0.4, yb: -0.35, yt: d.hei * 0.5, wb: w * 0.55, wt: w }, { z: -h, yb: -0.25, yt: d.hei * 0.48, wb: w * 0.6, wt: w },
  ]);
  const hm = new THREE.Mesh(hull, paint); hm.castShadow = true; root.add(hm); paintMeshes.push(hm);
  const deck = new THREE.Mesh(boxG(w * 1.5, 0.05, h * 1.2, 0, d.hei * 0.52, -h * 0.3), cMat(0xcdb792, 0.9)); root.add(deck);
  if (!jet) {
    const cab = loft([{ z: h * 0.2, yb: d.hei * 0.5, yt: d.hei * 0.52, wb: w * 0.85, wt: w * 0.8 }, { z: h * 0.05, yb: d.hei * 0.5, yt: d.hei * 0.95, wb: w * 0.8, wt: w * 0.65 }, { z: -h * 0.3, yb: d.hei * 0.5, yt: d.hei * 0.95, wb: w * 0.8, wt: w * 0.65 }, { z: -h * 0.4, yb: d.hei * 0.5, yt: d.hei * 0.52, wb: w * 0.85, wt: w * 0.8 }]);
    root.add(new THREE.Mesh(cab, MATS.glass)); root.add(new THREE.Mesh(boxG(w * 1.3, 0.05, h * 0.55, 0, d.hei * 0.96, -h * 0.12), paint));
  } else root.add(new THREE.Mesh(boxG(0.4, 0.4, 0.8, 0, d.hei * 0.75, 0.1), MATS.black));
  const hl = new THREE.Mesh(boxG(0.4, 0.14, 0.05, 0, d.hei * 0.6, h * 0.55), MATS.headOff), tl = new THREE.Mesh(boxG(0.4, 0.1, 0.05, 0, d.hei * 0.55, -h * 0.98), MATS.tailOff);
  root.add(hl, tl);
  root.add(new THREE.Mesh(boxG(0.3, 0.6, 0.3, 0, 0.4, -h), MATS.black));
  const seats = [new THREE.Vector3(jet ? 0 : w * 0.4, d.hei * 0.6, -h * 0.1), new THREE.Vector3(jet ? 0 : -w * 0.4, d.hei * 0.6, -h * 0.1), new THREE.Vector3(0, d.hei * 0.6, -h * 0.5), new THREE.Vector3(0, d.hei * 0.6, -h * 0.7)];
  const steer = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 6, 12), MATS.trim); steer.position.set(seats[0].x, d.hei * 0.9, h * 0.0); root.add(steer);
  const farGeo = mergeGeometries([colorize(hull, color)])!;
  return { root, far: new THREE.Mesh(farGeo, farMat), paintMeshes, wheels: [], steeringWheel: steer, headLights: hl, tailLights: tl, driverPos: seats[0].clone(), seats, headPoints: [new THREE.Vector3(0, d.hei * 0.6, h * 0.6)] };
}

function buildHeli(d: VehicleDef, color: number, premium: boolean): VehicleVisual {
  const root = new THREE.Group(), paint = paintMat(color, premium), paintMeshes: THREE.Mesh[] = [];
  const fus = loft([{ z: 2.6, yb: 0.5, yt: 1.3, wb: 0.15, wt: 0.12 }, { z: 1.6, yb: 0.25, yt: 2.0, wb: 0.9, wt: 0.75 }, { z: -0.6, yb: 0.25, yt: 2.1, wb: 1.0, wt: 0.8 }, { z: -2.0, yb: 0.7, yt: 1.6, wb: 0.4, wt: 0.3 }]);
  const fm = new THREE.Mesh(fus, paint); fm.castShadow = true; root.add(fm); paintMeshes.push(fm);
  const canopy = loft([{ z: 2.3, yb: 1.0, yt: 1.35, wb: 0.18, wt: 0.14 }, { z: 1.5, yb: 0.8, yt: 2.0, wb: 0.86, wt: 0.7 }, { z: 0.3, yb: 0.9, yt: 2.1, wb: 0.95, wt: 0.75 }]);
  root.add(new THREE.Mesh(canopy, MATS.glass));
  const boom = new THREE.Mesh(boxG(0.28, 0.32, 4.2, 0, 1.4, -4), paint); root.add(boom); paintMeshes.push(boom);
  root.add(new THREE.Mesh(boxG(0.06, 1.1, 0.5, 0, 1.9, -6), paint));
  for (const sx of [-1, 1]) { root.add(new THREE.Mesh(boxG(0.1, 0.1, 3.2, sx * 0.95, 0.12, 0.6), MATS.black)); for (const z of [1.5, -0.4]) root.add(new THREE.Mesh(boxG(0.08, 0.4, 0.08, sx * 0.9, 0.3, z), MATS.black)); }
  const rotor = new THREE.Group(); rotor.position.set(0, 2.4, 0.2);
  rotor.add(new THREE.Mesh(boxG(0.25, 0.18, 0.25, 0, -0.1, 0), MATS.black));
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(boxG(9.2, 0.03, 0.28, 0, 0, 0), MATS.black); b.rotation.y = i * Math.PI / 2; rotor.add(b); }
  root.add(rotor);
  const tail = new THREE.Group(); tail.position.set(0.15, 1.9, -6);
  tail.add(new THREE.Mesh(boxG(0.03, 1.4, 0.16, 0, 0, 0), MATS.black)); root.add(tail);
  const hl = new THREE.Mesh(boxG(0.3, 0.14, 0.1, 0, 0.8, 2.55), MATS.headOff); root.add(hl);
  const tl = new THREE.Mesh(boxG(0.1, 0.1, 0.1, 0, 1.95, -6.1), MATS.tailOff); root.add(tl);
  const seats = [new THREE.Vector3(0.4, 0.85, 1.3), new THREE.Vector3(-0.4, 0.85, 1.3), new THREE.Vector3(0.4, 0.85, 0.1), new THREE.Vector3(-0.4, 0.85, 0.1)];
  const farGeo = mergeGeometries([colorize(fus, color), colorize(boxG(0.28, 0.32, 4.2, 0, 1.4, -4), color)])!;
  return { root, far: new THREE.Mesh(farGeo, farMat), paintMeshes, wheels: [], rotor, tailRotor: tail, headLights: hl, tailLights: tl, driverPos: seats[0].clone(), seats, headPoints: [new THREE.Vector3(0, 0.8, 2.6)] };
}
