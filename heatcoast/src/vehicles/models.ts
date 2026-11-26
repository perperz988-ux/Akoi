import * as THREE from 'three';

export type VClass = 'sedan' | 'sports' | 'muscle' | 'suv' | 'pickup' | 'van' | 'super' | 'compact';
export interface VDef {
  id: string; name: string; maker: string; cls: VClass; len: number; wid: number; mass: number; power: number; vmax: number; grip: number; steer: number; brake: number;
  price: number; colors: number[]; police?: boolean; taxi?: boolean; seats: number; wheelR: number;
}
// All makes & models are fictional.
export const VDEFS: VDef[] = [
  { id: 'cortez', name: 'Cortez', maker: 'Albright', cls: 'sedan', len: 4.8, wid: 1.85, mass: 1500, power: 9000, vmax: 52, grip: 1.0, steer: 0.6, brake: 11000, price: 22000, colors: [0xf2f2f2, 0x1c1c1e, 0x8a8f94, 0x2a3f5f, 0x7a1f1f], seats: 4, wheelR: 0.34 },
  { id: 'bolt', name: 'Bolt', maker: 'Kanto', cls: 'compact', len: 4.0, wid: 1.75, mass: 1150, power: 7200, vmax: 46, grip: 0.98, steer: 0.65, brake: 9000, price: 14000, colors: [0xe8c030, 0x3a86c8, 0xe85a30, 0xf2f2f2, 0x4a9a5a], seats: 4, wheelR: 0.31 },
  { id: 'vento', name: 'Vento GT', maker: 'Strada', cls: 'sports', len: 4.5, wid: 1.95, mass: 1400, power: 17000, vmax: 72, grip: 1.25, steer: 0.55, brake: 15000, price: 95000, colors: [0xc0141c, 0xf2f2f2, 0x1a1a1a, 0x2050c0, 0xf0a020], seats: 2, wheelR: 0.34 },
  { id: 'furia', name: 'Furia RS', maker: 'Strada', cls: 'super', len: 4.6, wid: 2.05, mass: 1350, power: 24000, vmax: 86, grip: 1.4, steer: 0.52, brake: 17000, price: 240000, colors: [0x7ac020, 0xf0c010, 0xd8d8d8, 0x101010, 0xff4010], seats: 2, wheelR: 0.35 },
  { id: 'ramrod', name: 'Ramrod SS', maker: 'Vanguard', cls: 'muscle', len: 5.0, wid: 1.95, mass: 1700, power: 16000, vmax: 66, grip: 0.95, steer: 0.55, brake: 11000, price: 48000, colors: [0x1a1a1a, 0xe86a10, 0x1f4a8a, 0x8a1010, 0xe8e0d0], seats: 2, wheelR: 0.36 },
  { id: 'everglade', name: 'Everglade XL', maker: 'Vanguard', cls: 'suv', len: 5.1, wid: 2.0, mass: 2300, power: 13000, vmax: 52, grip: 0.95, steer: 0.55, brake: 14000, price: 55000, colors: [0x1c1c1e, 0xf2f2f2, 0x4a5a4a, 0x6a5a48, 0x2a3f5f], seats: 4, wheelR: 0.4 },
  { id: 'gator', name: 'Gator 1500', maker: 'Ridgeline', cls: 'pickup', len: 5.6, wid: 2.05, mass: 2400, power: 12500, vmax: 50, grip: 0.92, steer: 0.52, brake: 13000, price: 38000, colors: [0x8a1a1a, 0xf2f2f2, 0x2a4a3a, 0x3a3a3a, 0x7a6a4a], seats: 2, wheelR: 0.42 },
  { id: 'coastline', name: 'Coastline', maker: 'Albright', cls: 'van', len: 5.4, wid: 2.05, mass: 2500, power: 9500, vmax: 42, grip: 0.88, steer: 0.55, brake: 12000, price: 30000, colors: [0xf2f2f2, 0x9ab0c0, 0xe8e0c0], seats: 2, wheelR: 0.38 },
  { id: 'interceptor', name: 'Interceptor', maker: 'Albright', cls: 'sedan', len: 5.0, wid: 1.9, mass: 1750, power: 15500, vmax: 68, grip: 1.1, steer: 0.58, brake: 14000, price: 0, colors: [0x14181e], police: true, seats: 4, wheelR: 0.36 },
  { id: 'cab', name: 'Cortez Cab', maker: 'Albright', cls: 'sedan', len: 4.8, wid: 1.85, mass: 1500, power: 9000, vmax: 50, grip: 1.0, steer: 0.6, brake: 11000, price: 0, colors: [0xf2c010], taxi: true, seats: 4, wheelR: 0.34 },
];
export const vdef = (id: string) => VDEFS.find((d) => d.id === id)!;

// side profiles (z along length from rear=-L/2 to front=+L/2, y up) — normalised then scaled
const PROFILES: Record<VClass, { body: [number, number][]; cabin: [number, number][]; belt: number }> = {
  sedan: { body: [[-0.5, 0.22], [-0.5, 0.48], [-0.47, 0.56], [-0.3, 0.58], [0.2, 0.58], [0.36, 0.55], [0.49, 0.48], [0.5, 0.3], [0.48, 0.22]], cabin: [[-0.33, 0.57], [-0.2, 0.82], [0.08, 0.83], [0.22, 0.57]], belt: 0.57 },
  compact: { body: [[-0.5, 0.22], [-0.5, 0.56], [-0.46, 0.6], [0.2, 0.6], [0.35, 0.56], [0.49, 0.46], [0.5, 0.3], [0.48, 0.22]], cabin: [[-0.47, 0.6], [-0.42, 0.88], [0.06, 0.88], [0.24, 0.6]], belt: 0.6 },
  sports: { body: [[-0.5, 0.2], [-0.5, 0.45], [-0.45, 0.5], [-0.2, 0.52], [0.15, 0.5], [0.42, 0.42], [0.5, 0.32], [0.49, 0.2]], cabin: [[-0.28, 0.51], [-0.1, 0.72], [0.05, 0.72], [0.22, 0.49]], belt: 0.5 },
  super: { body: [[-0.5, 0.2], [-0.5, 0.44], [-0.4, 0.48], [-0.1, 0.5], [0.2, 0.44], [0.45, 0.34], [0.5, 0.26], [0.49, 0.19]], cabin: [[-0.25, 0.49], [-0.08, 0.66], [0.04, 0.66], [0.24, 0.45]], belt: 0.48 },
  muscle: { body: [[-0.5, 0.24], [-0.5, 0.52], [-0.46, 0.56], [-0.28, 0.57], [0.18, 0.58], [0.48, 0.55], [0.5, 0.32], [0.48, 0.24]], cabin: [[-0.3, 0.56], [-0.16, 0.78], [0.04, 0.78], [0.2, 0.57]], belt: 0.57 },
  suv: { body: [[-0.5, 0.3], [-0.5, 0.66], [-0.48, 0.7], [0.24, 0.7], [0.38, 0.66], [0.5, 0.58], [0.5, 0.34], [0.48, 0.28]], cabin: [[-0.48, 0.69], [-0.45, 1.0], [0.12, 1.0], [0.28, 0.69]], belt: 0.7 },
  pickup: { body: [[-0.5, 0.3], [-0.5, 0.64], [-0.1, 0.64], [-0.08, 0.66], [0.26, 0.66], [0.38, 0.64], [0.5, 0.58], [0.5, 0.34], [0.48, 0.3]], cabin: [[-0.08, 0.65], [-0.06, 0.96], [0.16, 0.96], [0.27, 0.65]], belt: 0.65 },
  van: { body: [[-0.5, 0.28], [-0.5, 0.62], [0.32, 0.62], [0.44, 0.6], [0.5, 0.5], [0.5, 0.32], [0.48, 0.26]], cabin: [[-0.5, 0.61], [-0.5, 1.08], [0.26, 1.08], [0.42, 0.62]], belt: 0.62 },
};
const HEIGHT: Record<VClass, number> = { sedan: 1.45, compact: 1.5, sports: 1.28, super: 1.15, muscle: 1.38, suv: 1.85, pickup: 1.9, van: 2.05 };

function extrude(pts: [number, number][], L: number, Hh: number, W: number, bevel: number) {
  const s = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? s.lineTo(z * L, y * Hh) : s.moveTo(z * L, y * Hh)));
  const g = new THREE.ExtrudeGeometry(s, { depth: W - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(W - bevel * 2) / 2); g.rotateY(-Math.PI / 2); // shape x -> world z (length), extrusion -> world x (width)
  g.computeVertexNormals(); return g;
}
const shared = {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0b0f14, roughness: 0.05, metalness: 0.1, transmission: 0, transparent: true, opacity: 0.78, envMapIntensity: 1.6, clearcoat: 1 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.2, metalness: 1 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd8dce0, roughness: 0.08, metalness: 1 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.5 }),
  interior: new THREE.MeshStandardMaterial({ color: 0x25221f, roughness: 0.85 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf0f0e8, roughness: 0.5 }),
};
const geoCache = new Map<string, { body: THREE.BufferGeometry; cabin: THREE.BufferGeometry; roof: THREE.BufferGeometry }>();
let wheelGeo: { tire: THREE.BufferGeometry; rim: THREE.BufferGeometry } | null = null;

export interface CarParts { root: THREE.Group; body: THREE.Group; wheels: THREE.Group[]; paint: THREE.MeshStandardMaterial; head: THREE.MeshStandardMaterial; tail: THREE.MeshStandardMaterial; bar?: { red: THREE.MeshStandardMaterial; blue: THREE.MeshStandardMaterial }; seats: THREE.Vector3[]; doors: THREE.Vector3[] }

export function buildCar(d: VDef, color: number, hq: boolean): CarParts {
  const L = d.len, W = d.wid, Hh = HEIGHT[d.cls], P = PROFILES[d.cls];
  let gc = geoCache.get(d.id);
  if (!gc) {
    const roofPts: [number, number][] = [[P.cabin[1][0] - 0.01, P.cabin[1][1] - 0.02], [P.cabin[1][0], P.cabin[1][1] + 0.015], [P.cabin[2][0], P.cabin[2][1] + 0.015], [P.cabin[2][0] + 0.01, P.cabin[2][1] - 0.02]];
    gc = { body: extrude(P.body, L, Hh, W, 0.12), cabin: extrude(P.cabin, L, Hh, W * 0.86, 0.1), roof: extrude(roofPts, L, Hh, W * 0.84, 0.05) };
    geoCache.set(d.id, gc);
  }
  if (!wheelGeo) {
    const tire = new THREE.TorusGeometry(0.75, 0.3, 8, 18).rotateY(Math.PI / 2); tire.scale(1, 1, 1);
    const rimG: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.62, 0.62, 0.28, 16).rotateZ(Math.PI / 2)];
    wheelGeo = { tire, rim: rimG[0] };
  }
  const paint = hq ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.06 }) : new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mk = (g: THREE.BufferGeometry, m: THREE.Material, cast = true) => { const me = new THREE.Mesh(g, m); me.castShadow = cast; me.receiveShadow = true; body.add(me); return me; };
  mk(gc.body, paint); mk(gc.cabin, shared.glass, false); mk(gc.roof, d.police ? new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, metalness: 0.4 }) : paint);
  // police livery: white doors
  if (d.police) { const door = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, Hh * 0.22, L * 0.42), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, metalness: 0.3 })); door.position.set(0, Hh * 0.42, -0.02 * L); body.add(door); }
  if (d.taxi) { const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.25), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0xffe080), emissiveIntensity: 0.6 })); sign.position.set(0, P.cabin[1][1] * Hh + 0.12, (P.cabin[1][0] + P.cabin[2][0]) / 2 * L); body.add(sign); }
  // interior hint (dash + seats) so cabins aren't hollow
  const dash = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.25, 0.5), shared.interior); dash.position.set(0, P.belt * Hh - 0.05, P.cabin[3][0] * L - 0.35); body.add(dash);
  const seats: THREE.Vector3[] = []; const seatZ = (P.cabin[0][0] + P.cabin[3][0]) / 2 * L + (d.cls === 'van' || d.cls === 'suv' || d.cls === 'compact' ? 0.5 : 0);
  for (const sx of [0.38, -0.38]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.18), shared.interior); s.position.set(sx * W / 1.85, P.belt * Hh - 0.0, seatZ - 0.35); body.add(s); seats.push(new THREE.Vector3(sx * W / 1.85, P.belt * Hh - 0.62, seatZ - 0.05)); }
  if (d.seats > 2) for (const sx of [0.38, -0.38]) seats.push(new THREE.Vector3(sx * W / 1.85, P.belt * Hh - 0.6, seatZ - 0.95));
  const steering = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 16), shared.black); steering.position.set(seats[0].x, P.belt * Hh, seatZ + 0.28); steering.rotation.x = -0.4; body.add(steering);
  // lights
  const head = new THREE.MeshStandardMaterial({ color: 0xf8f8f0, emissive: new THREE.Color(0xfff4d8), emissiveIntensity: 0.2, roughness: 0.05, metalness: 0.5 });
  const tail = new THREE.MeshStandardMaterial({ color: 0x500808, emissive: new THREE.Color(0xff1010), emissiveIntensity: 0.3, roughness: 0.2 });
  const frontY = P.body[P.body.length - 2][1] * Hh * 0.95 + 0.05, rearY = P.body[1][1] * Hh * 0.9;
  for (const sx of [1, -1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.22, 0.12, 0.08), head); hl.position.set(sx * W * 0.33, frontY, L / 2 - 0.03); body.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.24, 0.12, 0.06), tail); tl.position.set(sx * W * 0.32, rearY, -L / 2 + 0.02); body.add(tl);
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.2), paint); mir.position.set(sx * (W / 2 + 0.06), P.belt * Hh + 0.08, P.cabin[3][0] * L - 0.15); body.add(mir);
  }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.4, 0.18, 0.05), d.cls === 'muscle' || d.cls === 'pickup' || d.cls === 'suv' ? shared.chrome : shared.black); grille.position.set(0, frontY - 0.1, L / 2 - 0.01); body.add(grille);
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.14, 0.12), shared.black); bumperF.position.set(0, 0.32, L / 2 - 0.03); body.add(bumperF);
  const bumperR = bumperF.clone(); bumperR.position.z = -L / 2 + 0.03; body.add(bumperR);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.02), shared.plate); plate.position.set(0, 0.45, -L / 2 - 0.02); body.add(plate);
  if (d.cls === 'pickup') { const bed = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.08, L * 0.36), shared.black); bed.position.set(0, P.body[1][1] * Hh - 0.25, -L * 0.3); body.add(bed); }
  if (d.cls === 'super' || d.cls === 'sports') { const wing = new THREE.Mesh(new THREE.BoxGeometry(W * 0.85, 0.04, 0.3), shared.black); wing.position.set(0, P.body[1][1] * Hh + 0.22, -L / 2 + 0.2); body.add(wing); for (const sx of [1, -1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.1), shared.black); st.position.set(sx * W * 0.3, P.body[1][1] * Hh + 0.1, -L / 2 + 0.2); body.add(st); } }
  let bar: CarParts['bar'];
  if (d.police) {
    const red = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: new THREE.Color(0xff0000), emissiveIntensity: 0 }), blue = new THREE.MeshStandardMaterial({ color: 0x000040, emissive: new THREE.Color(0x0040ff), emissiveIntensity: 0 });
    const y = P.cabin[1][1] * Hh + 0.1, z = (P.cabin[1][0] + P.cabin[2][0]) / 2 * L;
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.3), shared.black); base.position.set(0, y - 0.04, z); body.add(base);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.26), red); r.position.set(0.3, y + 0.04, z); body.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.26), blue); b.position.set(-0.3, y + 0.04, z); body.add(b);
    bar = { red, blue };
  }
  // wheels
  const wheels: THREE.Group[] = []; const wr = d.wheelR, wb = L * 0.32;
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const wg = new THREE.Group(); const spin = new THREE.Group(); wg.add(spin);
    const t = new THREE.Mesh(wheelGeo.tire, shared.tire); t.scale.setScalar(wr / 1.05); t.castShadow = true; spin.add(t);
    const r = new THREE.Mesh(wheelGeo.rim, shared.rim); r.scale.set(wr / 1.05 * 0.35, wr / 1.05, wr / 1.05); spin.add(r);
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.03, wr * 1.1, 0.07), shared.chrome); sp.rotation.x = (k / 5) * Math.PI; sp.position.x = sx * 0.06; spin.add(sp); }
    wg.position.set(sx * (W / 2 - 0.2), wr, sz * wb + (sz > 0 ? L * 0.02 : 0)); root.add(wg); wheels.push(wg);
  }
  const doors = [new THREE.Vector3(W / 2 + 0.7, 0, seats[0].z), new THREE.Vector3(-W / 2 - 0.7, 0, seats[1].z)];
  return { root, body, wheels, paint, head, tail, bar, seats, doors };
}
