import * as THREE from 'three';

export interface WeaponDef {
  id: string; name: string; kind: 'melee' | 'gun'; dmg: number; rate: number; mag: number; reload: number; spread: number; range: number;
  pellets?: number; auto?: boolean; twoHand?: boolean; price: number; ammoPrice: number; recoil: number; noise: number; sound: 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'melee';
}
/** Original, fictional firearms (no real brand names). */
export const WEAPONS: Record<string, WeaponDef> = {
  fists: { id: 'fists', name: 'Fists', kind: 'melee', dmg: 14, rate: 2.4, mag: 0, reload: 0, spread: 0, range: 1.6, price: 0, ammoPrice: 0, recoil: 0, noise: 0, sound: 'melee' },
  bat: { id: 'bat', name: 'Louisville-style Bat', kind: 'melee', dmg: 34, rate: 1.6, mag: 0, reload: 0, spread: 0, range: 2.0, price: 120, ammoPrice: 0, recoil: 0, noise: 0, sound: 'melee' },
  pistol: { id: 'pistol', name: 'P-17 Compact', kind: 'gun', dmg: 26, rate: 4.5, mag: 15, reload: 1.3, spread: 0.012, range: 90, price: 900, ammoPrice: 60, recoil: 0.5, noise: 60, sound: 'pistol', twoHand: false },
  revolver: { id: 'revolver', name: '.44 Marshal', kind: 'gun', dmg: 70, rate: 1.3, mag: 6, reload: 2.4, spread: 0.006, range: 120, price: 2400, ammoPrice: 90, recoil: 1.2, noise: 80, sound: 'pistol', twoHand: false },
  smg: { id: 'smg', name: 'Wasp SMG', kind: 'gun', dmg: 18, rate: 13, mag: 30, reload: 1.8, spread: 0.03, range: 70, auto: true, price: 3800, ammoPrice: 120, recoil: 0.35, noise: 70, sound: 'smg', twoHand: true },
  shotgun: { id: 'shotgun', name: 'Bayou 12 Pump', kind: 'gun', dmg: 16, rate: 1.1, mag: 8, reload: 2.8, spread: 0.075, range: 35, pellets: 9, price: 4200, ammoPrice: 110, recoil: 1.4, noise: 90, sound: 'shotgun', twoHand: true },
  rifle: { id: 'rifle', name: 'K-5 Carbine', kind: 'gun', dmg: 34, rate: 9, mag: 30, reload: 2.2, spread: 0.014, range: 160, auto: true, price: 7500, ammoPrice: 160, recoil: 0.6, noise: 95, sound: 'rifle', twoHand: true },
};
export const WEAPON_ORDER = ['fists', 'bat', 'pistol', 'revolver', 'smg', 'shotgun', 'rifle'];

const M = {
  polymer: new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.55, metalness: 0.1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.28, metalness: 0.92 }),
  blued: new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.22, metalness: 0.95 }),
  bright: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.18, metalness: 1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6a3f22, roughness: 0.45, metalness: 0 }),
  fde: new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.6, metalness: 0.05 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9, metalness: 0 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.25, metalness: 1 }),
  sight: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(0x40ff60), emissiveIntensity: 1.5 }),
  ash: new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.5 }),
};
function part(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.rotation.set(rx, ry, rz); me.castShadow = true; g.add(me); return me;
}
const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (r1: number, r2: number, l: number, s = 12) => new THREE.CylinderGeometry(r1, r2, l, s).rotateX(Math.PI / 2);
/** Rounded slab via extruded rounded rectangle (for slides, receivers). */
function slab(w: number, h: number, d: number, r = 0.004) {
  const s = new THREE.Shape(); const x = -d / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + d - r, y); s.quadraticCurveTo(x + d, y, x + d, y + r); s.lineTo(x + d, y + h - r); s.quadraticCurveTo(x + d, y + h, x + d - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1, curveSegments: 3 });
  g.translate(0, 0, -w / 2); g.rotateY(-Math.PI / 2); return g;
}
const cache = new Map<string, THREE.Group>();
/** Detailed weapon model. Local frame: +Z forward (muzzle), grip at origin. Returns a clone. */
export function weaponModel(id: string): THREE.Group {
  let base = cache.get(id);
  if (!base) { base = buildWeapon(id); cache.set(id, base); }
  const c = base.clone(); c.userData = { ...base.userData };
  return c;
}
function buildWeapon(id: string): THREE.Group {
  const g = new THREE.Group(); let muzzle = 0.2;
  switch (id) {
    case 'pistol': {
      part(g, slab(0.028, 0.032, 0.19), M.blued, 0, 0.055, 0.06); // slide
      for (let i = 0; i < 7; i++) part(g, B(0.03, 0.026, 0.003), M.polymer, 0, 0.056, -0.02 + i * 0.006); // serrations
      part(g, slab(0.026, 0.024, 0.17), M.polymer, 0, 0.028, 0.055); // frame
      part(g, B(0.006, 0.006, 0.02), M.steel, 0, 0.075, 0.14); part(g, B(0.018, 0.008, 0.008), M.steel, 0, 0.074, -0.025); // sights
      part(g, B(0.006, 0.004, 0.006), M.sight, 0, 0.08, 0.14);
      part(g, C(0.006, 0.006, 0.02), M.steel, 0, 0.055, 0.157); // barrel crown
      const grip = part(g, slab(0.03, 0.11, 0.05, 0.008), M.polymer, 0, -0.03, -0.005, -0.28); void grip;
      for (let i = 0; i < 5; i++) part(g, B(0.032, 0.004, 0.04), M.rubber, 0, -0.01 - i * 0.018, -0.002 - i * 0.004, -0.28);
      part(g, B(0.006, 0.004, 0.05), M.polymer, 0, 0.006, 0.035); part(g, B(0.006, 0.03, 0.004), M.polymer, 0, -0.008, 0.06); // trigger guard
      part(g, B(0.004, 0.02, 0.006), M.steel, 0, 0.004, 0.035, 0.3); // trigger
      part(g, B(0.03, 0.012, 0.012), M.steel, 0, 0.028, 0.12); // rail
      muzzle = 0.17; break;
    }
    case 'revolver': {
      part(g, C(0.009, 0.01, 0.16), M.bright, 0, 0.06, 0.12); part(g, B(0.014, 0.01, 0.15), M.bright, 0, 0.073, 0.115); // barrel + rib
      part(g, new THREE.CylinderGeometry(0.022, 0.022, 0.045, 12).rotateX(Math.PI / 2), M.bright, 0, 0.048, 0.025); // cylinder
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; part(g, B(0.006, 0.006, 0.046), M.steel, Math.cos(a) * 0.022, 0.048 + Math.sin(a) * 0.022, 0.025); }
      part(g, slab(0.022, 0.04, 0.07), M.bright, 0, 0.045, -0.01); part(g, B(0.006, 0.02, 0.012), M.bright, 0, 0.075, -0.04, 0.5); // frame, hammer
      part(g, slab(0.03, 0.1, 0.045, 0.012), M.wood, 0, -0.025, -0.035, -0.4); part(g, B(0.006, 0.026, 0.004), M.bright, 0, 0.012, 0.03);
      muzzle = 0.2; break;
    }
    case 'smg': {
      part(g, slab(0.036, 0.05, 0.25), M.polymer, 0, 0.05, 0.08); part(g, B(0.03, 0.012, 0.2), M.steel, 0, 0.082, 0.08); // receiver + top rail
      for (let i = 0; i < 12; i++) part(g, B(0.032, 0.004, 0.006), M.steel, 0, 0.09, -0.01 + i * 0.016);
      part(g, C(0.012, 0.012, 0.09), M.steel, 0, 0.05, 0.245); part(g, C(0.018, 0.018, 0.04), M.polymer, 0, 0.05, 0.3); // barrel + comp
      part(g, slab(0.03, 0.1, 0.045, 0.008), M.polymer, 0, -0.03, 0.0, -0.25); // grip
      part(g, B(0.024, 0.17, 0.03), M.steel, 0, -0.06, 0.1, 0.12); // long magazine
      part(g, B(0.03, 0.06, 0.05), M.rubber, 0, 0.035, 0.18); // handguard
      part(g, B(0.016, 0.016, 0.2), M.steel, 0, 0.05, -0.12); part(g, B(0.03, 0.06, 0.02), M.rubber, 0, 0.04, -0.22); // folding stock + butt
      part(g, B(0.03, 0.03, 0.04), M.polymer, 0, 0.105, 0.06); part(g, B(0.022, 0.018, 0.005), M.sight, 0, 0.115, 0.045); // red dot
      muzzle = 0.32; break;
    }
    case 'shotgun': {
      part(g, C(0.012, 0.012, 0.62), M.blued, 0, 0.06, 0.32); part(g, C(0.011, 0.011, 0.5), M.blued, 0, 0.035, 0.28); // barrel + tube mag
      part(g, slab(0.04, 0.06, 0.2), M.blued, 0, 0.05, 0.02); part(g, B(0.042, 0.02, 0.06), M.bright, 0.001, 0.055, 0.03); // receiver + ejection port
      const pump = part(g, slab(0.05, 0.045, 0.16, 0.01), M.wood, 0, 0.04, 0.32); for (let i = 0; i < 6; i++) part(g, B(0.052, 0.046, 0.006), M.polymer, 0, 0.04, 0.26 + i * 0.022); void pump;
      part(g, slab(0.038, 0.06, 0.3, 0.012), M.wood, 0, 0.0, -0.22, 0.18); part(g, B(0.04, 0.07, 0.02), M.rubber, 0, -0.03, -0.37, 0.18); // stock + pad
      part(g, B(0.006, 0.028, 0.004), M.steel, 0, 0.012, 0.02); part(g, B(0.006, 0.006, 0.006), M.bright, 0, 0.074, 0.62); // trigger, bead
      muzzle = 0.63; break;
    }
    case 'rifle': {
      part(g, slab(0.032, 0.06, 0.22), M.fde, 0, 0.05, 0.03); part(g, slab(0.03, 0.045, 0.16), M.fde, 0, 0.012, 0.0); // upper/lower receiver
      part(g, slab(0.045, 0.05, 0.26), M.polymer, 0, 0.055, 0.25); // handguard
      for (let i = 0; i < 6; i++) { part(g, B(0.047, 0.012, 0.02), M.fde, 0, 0.055, 0.15 + i * 0.04); }
      part(g, B(0.03, 0.01, 0.48), M.steel, 0, 0.087, 0.15); for (let i = 0; i < 22; i++) part(g, B(0.032, 0.004, 0.008), M.steel, 0, 0.094, -0.08 + i * 0.021); // picatinny
      part(g, C(0.009, 0.009, 0.16), M.steel, 0, 0.055, 0.44); part(g, C(0.015, 0.012, 0.05), M.steel, 0, 0.055, 0.53); // barrel + muzzle brake
      part(g, slab(0.028, 0.09, 0.04, 0.008), M.polymer, 0, -0.04, -0.06, -0.3); // pistol grip
      const mag = part(g, B(0.024, 0.15, 0.06), M.polymer, 0, -0.05, 0.065, 0.22); void mag;
      part(g, B(0.03, 0.03, 0.2), M.polymer, 0, 0.048, -0.2); part(g, slab(0.04, 0.09, 0.12, 0.01), M.fde, 0, 0.03, -0.3); // buffer tube + stock
      part(g, C(0.02, 0.02, 0.11, 14), M.polymer, 0, 0.12, 0.04); part(g, C(0.022, 0.022, 0.008, 14), M.steel, 0, 0.12, 0.1); part(g, C(0.022, 0.022, 0.008, 14), M.steel, 0, 0.12, -0.016); // scope
      part(g, B(0.028, 0.04, 0.03), M.polymer, 0, 0.0, 0.22); // vertical grip
      muzzle = 0.56; break;
    }
    case 'bat': { part(g, new THREE.CylinderGeometry(0.032, 0.014, 0.82, 10).rotateX(Math.PI / 2), M.ash, 0, 0, 0.36); part(g, C(0.018, 0.018, 0.02, 10), M.ash, 0, 0, -0.05); part(g, C(0.016, 0.016, 0.16, 8), M.rubber, 0, 0, 0.03); muzzle = 0.8; break; }
    default: break;
  }
  g.userData.muzzle = new THREE.Vector3(0, id === 'smg' || id === 'shotgun' || id === 'rifle' ? 0.055 : 0.058, muzzle);
  return g;
}
/** Muzzle flash billboard (shared). */
export function muzzleFlashMesh(): THREE.Mesh {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d')!;
  const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.25, 'rgba(255,200,90,0.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 64, 64); for (let i = 0; i < 6; i++) { c.save(); c.translate(32, 32); c.rotate(i * 1.05); c.fillStyle = 'rgba(255,220,120,0.7)'; c.fillRect(0, -2, 32, 4); c.restore(); }
  const t = new THREE.CanvasTexture(cv);
  return new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.35), new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
}
export const brassMat = M.brass;
