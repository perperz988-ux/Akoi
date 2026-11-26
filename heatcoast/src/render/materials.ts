import * as THREE from 'three';
import { NORMALS } from './assets';

/** All textures are generated procedurally at startup — no external assets, no licensing risk. */
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void, repeat = true, srgb = true) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d')!;
  draw(c);
  const t = new THREE.CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function speckle(c: CanvasRenderingContext2D, w: number, h: number, n: number, base: [number, number, number], vari: number, size = 1) {
  for (let i = 0; i < n; i++) { const v = (Math.random() - 0.5) * vari; c.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`; c.fillRect(Math.random() * w, Math.random() * h, size, size); }
}

/** Road texture: u across the road (0..1), v along (1 unit = 16 m). */
export function roadTexture(lanes: number, kind: string) {
  return canvasTex(256, 512, (c) => {
    const W = 256, H = 512;
    if (kind === 'dirt') { c.fillStyle = '#8a7556'; c.fillRect(0, 0, W, H); speckle(c, W, H, 9000, [138, 117, 86], 50, 2); c.fillStyle = 'rgba(90,70,50,0.35)'; c.fillRect(W * 0.22, 0, W * 0.12, H); c.fillRect(W * 0.66, 0, W * 0.12, H); return; }
    c.fillStyle = '#2e3033'; c.fillRect(0, 0, W, H);
    speckle(c, W, H, 16000, [48, 50, 53], 30, 1.4);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(20,20,22,${Math.random() * 0.15})`; c.beginPath(); c.ellipse(Math.random() * W, Math.random() * H, 10 + Math.random() * 30, 20 + Math.random() * 60, 0, 0, 7); c.fill(); }
    // tyre tracks (darker) per lane
    const lw = W / (lanes * 2);
    for (let l = 0; l < lanes * 2; l++) { c.fillStyle = 'rgba(15,15,18,0.18)'; c.fillRect(l * lw + lw * 0.2, 0, lw * 0.15, H); c.fillRect(l * lw + lw * 0.65, 0, lw * 0.15, H); }
    // edge lines
    c.fillStyle = '#d8d8d0'; c.fillRect(3, 0, 4, H); c.fillRect(W - 7, 0, 4, H);
    // centre double yellow
    c.fillStyle = '#d9b43a'; c.fillRect(W / 2 - 6, 0, 4, H); c.fillRect(W / 2 + 2, 0, 4, H);
    // lane dashes
    c.fillStyle = '#e8e8e0';
    for (let l = 1; l < lanes; l++) for (const side of [-1, 1]) { const x = W / 2 + side * l * lw; for (let y = 0; y < H; y += 128) c.fillRect(x - 2, y, 4, 64); }
  });
}
export const TEX = {
  asphalt: canvasTex(256, 256, (c) => { c.fillStyle = '#3c3e42'; c.fillRect(0, 0, 256, 256); speckle(c, 256, 256, 9000, [60, 62, 66], 34, 1.4); }),
  sidewalk: canvasTex(256, 256, (c) => { c.fillStyle = '#8f8b84'; c.fillRect(0, 0, 256, 256); speckle(c, 256, 256, 9000, [143, 139, 132], 34, 1.5); for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(40,36,30,${Math.random() * 0.12})`; c.beginPath(); c.arc(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 20, 0, 7); c.fill(); } c.strokeStyle = 'rgba(80,78,72,0.55)'; c.lineWidth = 2; for (let i = 0; i <= 256; i += 64) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 256); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(256, i); c.stroke(); } }),
  ground: canvasTex(512, 512, (c) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) { const v = 128 + (Math.random() - 0.5) * 90; c.fillStyle = `rgb(${v},${v},${v})`; const s = Math.random() * 2.5 + 0.5; c.fillRect(Math.random() * 512, Math.random() * 512, s, s * (1 + Math.random() * 3)); }
    for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '40,40,40' : '210,210,210'},0.08)`; c.beginPath(); c.arc(Math.random() * 512, Math.random() * 512, 20 + Math.random() * 60, 0, 7); c.fill(); }
  }, true, false),
  crosswalk: canvasTex(64, 64, (c) => { c.clearRect(0, 0, 64, 64); c.fillStyle = 'rgba(235,235,230,0.92)'; for (let x = 4; x < 64; x += 16) c.fillRect(x, 0, 8, 64); }),
  glow: canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }, false),
  pool: canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,210,150,0.55)'); g.addColorStop(0.5, 'rgba(255,190,120,0.2)'); g.addColorStop(1, 'rgba(255,180,100,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }, false),
  bark: canvasTex(64, 256, (c) => { c.fillStyle = '#6d5a45'; c.fillRect(0, 0, 64, 256); for (let y = 0; y < 256; y += 10) { c.fillStyle = `rgba(40,30,20,${0.3 + Math.random() * 0.3})`; c.fillRect(0, y, 64, 3); } }),
  leaf: canvasTex(128, 128, (c) => { c.fillStyle = '#3d6b2e'; c.fillRect(0, 0, 128, 128); speckle(c, 128, 128, 3000, [70, 115, 50], 60, 3); }),
};
export const roadTex: Record<string, THREE.Texture> = {};
export function getRoadTex(lanes: number, kind: string) { const k = kind === 'dirt' ? 'dirt' : String(lanes); return roadTex[k] ?? (roadTex[k] = roadTexture(lanes, kind)); }

// --------------------------------------------------------------------------------- shared uniforms
export const SHARED = { uNight: { value: 0 }, uWet: { value: 0 }, uTime: { value: 0 } };

/**
 * Procedural facade material: windows, storefronts, balconies and night-lit rooms computed per pixel
 * from a metre-based UV, so thousands of buildings cost one material and one draw call per chunk.
 * aStyle = (style, seed); style < 0 => roof.
 */
export function facadeMaterial() {
  const pl = NORMALS.plaster.clone(); pl.repeat.set(0.45, 0.45);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0, envMapIntensity: 1, normalMap: pl, normalScale: new THREE.Vector2(0.16, 0.16) });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = SHARED.uNight; sh.uniforms.uWet = SHARED.uWet;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aStyle; varying vec2 vStyle; varying vec2 vFac;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvStyle = aStyle; vFac = uv;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uNight; uniform float uWet; varying vec2 vStyle; varying vec2 vFac;
      float fh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      float gWin = 0.0; float gLit = 0.0; float gFrame = 0.0;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        float st = vStyle.x; float seed = vStyle.y;
        if (st >= -0.5) {
          float floorH = st > 5.5 ? 3.0 : st > 4.5 ? 6.0 : 3.6;
          float spacing = st < 0.5 ? 3.2 : st < 1.5 ? 2.0 : st < 3.5 ? 4.2 : st < 4.5 ? 12.0 : st < 5.5 ? 9.0 : st < 6.5 ? 5.5 : st < 7.5 ? 5.0 : 4.0;
          vec2 cell = vec2(vFac.x / spacing, vFac.y / floorH); vec2 id = floor(cell); vec2 f = fract(cell);
          float mx = st < 0.5 ? 0.08 : st < 1.5 ? 0.04 : st < 3.5 ? 0.24 : st < 5.5 ? 0.3 : 0.28;
          float myLo = st < 0.5 ? 0.35 : st < 1.5 ? 0.06 : 0.3, myHi = st < 1.5 ? 0.08 : 0.18;
          if (st > 4.5 && st < 5.5) { myLo = 0.62; myHi = 0.1; }
          bool ground = id.y < 0.5 && (st > 1.5 && st < 4.5 || st > 6.5 && st < 7.5);
          if (ground) { mx = 0.06; myLo = 0.05; myHi = 0.25; }
          float win = step(mx, f.x) * step(f.x, 1.0 - mx) * step(myLo, f.y) * step(f.y, 1.0 - myHi);
          if (st > 7.5) win *= step(0.5, fh(id + seed));               // rural: sparse windows
          if (st > 5.5 && st < 6.5) win *= step(0.35, fh(id*1.7 + seed)); // houses
          gFrame = (1.0 - win) * (step(mx - 0.04, f.x) * step(f.x, 1.0 - mx + 0.04) * step(myLo - 0.05, f.y) * step(f.y, 1.0 - myHi + 0.05));
          gWin = win;
          float r = fh(id + vec2(seed * 7.3, seed));
          gLit = step(0.55 - uNight * 0.25, r) * win * (ground ? 1.5 : 1.0);
          vec3 glass = mix(vec3(0.08, 0.11, 0.14), vec3(0.2, 0.28, 0.32), fh(id * 3.1 + seed));
          if (st > 0.5 && st < 1.5) glass = mix(vec3(0.12, 0.2, 0.25), vec3(0.25, 0.35, 0.42), fh(vec2(seed)));
          // subtle wall grime by height + horizontal floor bands
          float band = smoothstep(0.0, 0.06, abs(f.y - 0.02)) ;
          vec3 wall = diffuseColor.rgb * (0.86 + 0.14 * fh(floor(vFac * 0.5) + seed)) * mix(0.82, 1.0, band);
          wall *= mix(0.75, 1.0, smoothstep(0.0, 2.5, vFac.y));
          diffuseColor.rgb = mix(wall, glass, win);
          diffuseColor.rgb *= 1.0 - gFrame * 0.45;
        } else {
          diffuseColor.rgb *= 0.9 + 0.1 * fh(floor(vFac * 0.25));
        }
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.12, gWin); roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.6, uWet);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor = mix(metalnessFactor, 0.55, gWin * (1.0 - uNight * 0.6));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += gLit * uNight * mix(vec3(1.0, 0.78, 0.48), vec3(0.75, 0.85, 1.0), fh(vec2(vStyle.y, 3.0))) * 1.25;`);
  };
  m.customProgramCacheKey = () => 'facade2';
  return m;
}

/** Ground material: vertex colours * tiling detail texture; roads / wetness affect roughness. */
export function groundMaterial() {
  const gn = NORMALS.concrete.clone(); gn.repeat.set(1, 1);
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: TEX.ground, normalMap: gn, normalScale: new THREE.Vector2(0.6, 0.6) });
  TEX.ground.repeat.set(1, 1);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = SHARED.uWet;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uWet;')
      .replace('#include <map_fragment>', `
        vec4 d1 = texture2D(map, vWp.xz / 9.0); vec4 d2 = texture2D(map, vWp.xz / 61.0);
        diffuseColor.rgb *= (0.55 + 0.9 * d1.r) * (0.7 + 0.6 * d2.g);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, uWet * 0.6);');
  };
  m.customProgramCacheKey = () => 'ground1';
  return m;
}
export function roadMaterial(tex: THREE.Texture) {
  const an = NORMALS.asphalt.clone(); an.repeat.set(3, 4);
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0, normalMap: an, normalScale: new THREE.Vector2(0.7, 0.7), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = SHARED.uWet;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.12, uWet); ')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= 1.0 - uWet * 0.35;');
  };
  m.customProgramCacheKey = () => 'road1';
  return m;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: number, rough = 0.7, metal = 0, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const k = `${color}_${rough}_${metal}_${JSON.stringify(extra)}`;
  let m = cache.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }); cache.set(k, m); }
  return m;
}
export function emissive(color: number, intensity = 2) { return mat(0x000000, 0.5, 0, { emissive: new THREE.Color(color), emissiveIntensity: intensity }); }
