// Dynamic weather: METAR-like presets, wind field with altitude, gusts and turbulence,
// streamed volumetric-looking cloud fields, overcast decks, precipitation and lightning.
import * as THREE from 'three';
import { FT, KT, DEG, clamp, hash2, lerp, mulberry, smooth, origin, R_EARTH } from '../core/geo';
import { CURVATURE_GLSL } from './Terrain';

export interface WeatherPreset {
  id: string; name: string; desc: string;
  cover: number; type: 'cumulus' | 'stratus' | 'cb' | 'none'; baseFt: number; thickFt: number;
  visM: number; rain: number; snow: number; storm: boolean;
  windDir: number; windKt: number; gustKt: number; turb: number; tempDev: number;
}
export const WEATHER: WeatherPreset[] = [
  { id: 'clear', name: 'Clear Skies', desc: 'CAVOK — unlimited visibility, light winds', cover: 0, type: 'none', baseFt: 0, thickFt: 0, visM: 120000, rain: 0, snow: 0, storm: false, windDir: 270, windKt: 5, gustKt: 0, turb: 0.05, tempDev: 0 },
  { id: 'few', name: 'Few Clouds', desc: 'FEW045 — fair-weather cumulus', cover: 0.2, type: 'cumulus', baseFt: 4500, thickFt: 2500, visM: 60000, rain: 0, snow: 0, storm: false, windDir: 240, windKt: 8, gustKt: 0, turb: 0.15, tempDev: 2 },
  { id: 'scattered', name: 'Scattered', desc: 'SCT035 BKN080 — building cumulus', cover: 0.45, type: 'cumulus', baseFt: 3500, thickFt: 4000, visM: 40000, rain: 0, snow: 0, storm: false, windDir: 220, windKt: 12, gustKt: 18, turb: 0.3, tempDev: 4 },
  { id: 'overcast', name: 'Overcast', desc: 'OVC020 — grey stratus deck', cover: 0.95, type: 'stratus', baseFt: 2000, thickFt: 3000, visM: 15000, rain: 0, snow: 0, storm: false, windDir: 200, windKt: 14, gustKt: 0, turb: 0.2, tempDev: -2 },
  { id: 'rain', name: 'Rain', desc: '-RA BKN012 OVC025 — steady rain, low ceiling', cover: 0.9, type: 'stratus', baseFt: 1200, thickFt: 6000, visM: 6000, rain: 0.6, snow: 0, storm: false, windDir: 190, windKt: 16, gustKt: 25, turb: 0.35, tempDev: -3 },
  { id: 'storm', name: 'Thunderstorm', desc: '+TSRA FEW015CB — lightning, heavy rain, severe turbulence', cover: 0.85, type: 'cb', baseFt: 1500, thickFt: 28000, visM: 3000, rain: 1, snow: 0, storm: true, windDir: 250, windKt: 24, gustKt: 40, turb: 0.85, tempDev: 3 },
  { id: 'fog', name: 'Fog', desc: 'FG VV001 — 300 m visibility, calm', cover: 0.3, type: 'stratus', baseFt: 300, thickFt: 600, visM: 300, rain: 0, snow: 0, storm: false, windDir: 0, windKt: 2, gustKt: 0, turb: 0.0, tempDev: -1 },
  { id: 'snow', name: 'Snow', desc: 'SN OVC015 — snowfall, contaminated runway', cover: 0.95, type: 'stratus', baseFt: 1500, thickFt: 5000, visM: 2500, rain: 0, snow: 0.8, storm: false, windDir: 330, windKt: 12, gustKt: 20, turb: 0.25, tempDev: -20 },
  { id: 'windy', name: 'Strong Crosswind', desc: 'Gusty 30 kt winds, moderate mechanical turbulence', cover: 0.35, type: 'cumulus', baseFt: 4000, thickFt: 3000, visM: 30000, rain: 0, snow: 0, storm: false, windDir: 300, windKt: 28, gustKt: 42, turb: 0.6, tempDev: 0 },
];
export const weatherById = (id: string) => WEATHER.find(w => w.id === id) ?? WEATHER[0];

const cloudVert = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
#include <fog_pars_vertex>
attribute vec4 aPuff; attribute vec4 aShade;
varying vec2 vUv; varying vec4 vShade; varying float vFade; varying vec3 vOff;
uniform float uFadeNear;
void main(){
  vUv = uv; vShade = aShade;
  vec4 wp = modelMatrix * vec4(aPuff.xyz, 1.0);
  vec2 cdd = wp.xz - cameraPosition.xz; wp.y -= dot(cdd,cdd) * ${(1 / (2 * R_EARTH)).toExponential(6)};
  vec4 mvPosition = viewMatrix * wp;
  float dist = length(mvPosition.xyz);
  vFade = smoothstep(uFadeNear * 0.25, uFadeNear, dist);
  vec2 off = (uv - 0.5) * aPuff.w;
  mvPosition.xy += off;
  vOff = vec3(off / aPuff.w, 0.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;
const cloudFrag = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
#include <fog_pars_fragment>
uniform vec3 uSunV, uLit, uShadow; uniform float uOpacity;
varying vec2 vUv; varying vec4 vShade; varying float vFade; varying vec3 vOff;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){
  #include <logdepthbuf_fragment>
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float seed = vShade.w * 37.0;
  float nz = n2(p * 2.6 + seed) * 0.55 + n2(p * 5.3 - seed) * 0.3 + n2(p * 11.0 + seed * 2.0) * 0.15;
  float a = smoothstep(1.0, 0.25, r + (nz - 0.5) * 0.7);
  if (a < 0.01) discard;
  // pseudo-normal: sphere
  vec3 nrm = normalize(vec3(p, sqrt(max(0.0, 1.0 - r * r)) + 0.3));
  float lit = clamp(dot(nrm, uSunV) * 0.5 + 0.5, 0.0, 1.0);
  float vert = vShade.x; // 0 bottom .. 1 top of cloud
  vec3 col = mix(uShadow, uLit, clamp(lit * 0.55 + vert * 0.6, 0.0, 1.0)) * vShade.y;
  float silver = pow(1.0 - clamp(r,0.0,1.0), 0.5) * 0.0 + smoothstep(0.6, 1.0, r) * max(0.0, uSunV.z) * 0.35;
  col += uLit * silver;
  gl_FragColor = vec4(col, a * uOpacity * vShade.z * vFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const deckFrag = /* glsl */`
#include <common>
#include <logdepthbuf_pars_fragment>
#include <fog_pars_fragment>
uniform vec3 uLit, uShadow; uniform float uOpacity, uTime, uTop; uniform vec2 uOff;
varying vec2 vXZ;
float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){
  #include <logdepthbuf_fragment>
  vec2 p = (vXZ + uOff) / 3000.0 + vec2(uTime * 0.002, 0.0);
  float n = n2(p) * 0.5 + n2(p * 2.1) * 0.25 + n2(p * 4.3) * 0.15 + n2(p * 9.0) * 0.1;
  vec3 col = mix(uShadow, uLit, uTop > 0.5 ? 0.75 + n * 0.35 : 0.35 + n * 0.3);
  float edge = 1.0 - smoothstep(0.75, 1.0, length(vXZ) / 70000.0);
  gl_FragColor = vec4(col, uOpacity * edge * mix(0.85, 1.0, n));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const deckVert = /* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
#include <fog_pars_vertex>
varying vec2 vXZ;
void main(){
  vec3 transformed = position;
  vXZ = position.xz;
  ${CURVATURE_GLSL}
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;

export class Weather {
  preset: WeatherPreset = WEATHER[0];
  cur: WeatherPreset = { ...WEATHER[0] };
  dynamic = false; private dynTimer = 0;
  group = new THREE.Group();
  private puffs: THREE.Mesh; private puffGeo: THREE.InstancedBufferGeometry; private maxPuffs = 2400;
  private deck: THREE.Mesh; private deckU: Record<string, { value: any }>;
  private cloudU: Record<string, { value: any }>;
  private rain: THREE.LineSegments; private rainPos: Float32Array; private snowPts: THREE.Points;
  private lastCell = ''; private gust = 0; private gustT = 0; private turbState = new THREE.Vector3(); private turbRate = new THREE.Vector3();
  flash = 0; private nextFlash = 5; onThunder: ((delay: number, power: number) => void) | null = null;
  cloudBaseM = 0; cloudTopM = 0; inCloud = 0; airportElevM = 0;
  private tOff = new THREE.Vector2();

  constructor() {
    this.puffGeo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.puffGeo.index = quad.index; this.puffGeo.setAttribute('position', quad.getAttribute('position')); this.puffGeo.setAttribute('uv', quad.getAttribute('uv'));
    this.puffGeo.setAttribute('aPuff', new THREE.InstancedBufferAttribute(new Float32Array(this.maxPuffs * 4), 4));
    this.puffGeo.setAttribute('aShade', new THREE.InstancedBufferAttribute(new Float32Array(this.maxPuffs * 4), 4));
    this.puffGeo.instanceCount = 0;
    this.cloudU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uSunV: { value: new THREE.Vector3(0, 1, 0) }, uLit: { value: new THREE.Color(1, 1, 1) }, uShadow: { value: new THREE.Color(0.5, 0.55, 0.62) }, uOpacity: { value: 1 }, uFadeNear: { value: 60 } }]);
    const cm = new THREE.ShaderMaterial({ uniforms: this.cloudU, vertexShader: cloudVert, fragmentShader: cloudFrag, transparent: true, depthWrite: false, fog: true });
    this.puffs = new THREE.Mesh(this.puffGeo, cm); this.puffs.frustumCulled = false; this.puffs.renderOrder = 5;
    this.group.add(this.puffs);
    this.deckU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLit: { value: new THREE.Color() }, uShadow: { value: new THREE.Color() }, uOpacity: { value: 0 }, uTime: { value: 0 }, uTop: { value: 0 }, uOff: { value: this.tOff } }]);
    this.deckU.uOff.value = this.tOff;
    const dg = new THREE.CircleGeometry(70000, 64).rotateX(-Math.PI / 2);
    this.deck = new THREE.Mesh(dg, new THREE.ShaderMaterial({ uniforms: this.deckU, vertexShader: deckVert, fragmentShader: deckFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true }));
    this.deck.frustumCulled = false; this.deck.renderOrder = 4;
    this.group.add(this.deck);
    // rain streaks
    const N = 3000; this.rainPos = new Float32Array(N * 6);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaab4c0, transparent: true, opacity: 0.35, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false; this.group.add(this.rain);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2500 * 3), 3));
    this.snowPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, transparent: true, opacity: 0.85, depthWrite: false }));
    this.snowPts.frustumCulled = false; this.snowPts.visible = false; this.group.add(this.snowPts);
    origin.onShift((dx, dz) => { this.lastCell = ''; this.tOff.x = (this.tOff.x + dx) % 300000; this.tOff.y = (this.tOff.y + dz) % 300000; });
  }

  setQuality(maxPuffs: number) { this.maxPuffs = Math.min(2400, maxPuffs); this.lastCell = ''; }

  set(p: WeatherPreset, dynamic = false) { this.preset = p; this.cur = { ...p }; this.dynamic = dynamic; this.lastCell = ''; }

  /** wind vector (m/s, world x/z, direction "from") at altitude MSL */
  windAt(altM: number, out = new THREE.Vector3()) {
    const agl = Math.max(0, altM - this.airportElevM);
    const shear = agl < 600 ? 0.65 + 0.35 * Math.pow(agl / 600, 0.3) : 1 + Math.min(1.8, (agl - 600) / 6000);
    const spd = (this.cur.windKt + this.gust) * KT * shear;
    const dir = (this.cur.windDir + Math.min(35, agl / 300)) * DEG; // veering with height
    // wind blowing FROM dir -> velocity towards dir+180
    out.set(-Math.sin(dir) * spd, 0, Math.cos(dir) * spd);
    return out;
  }

  /** Turbulence: returns body-axis rate disturbance (rad/s) and vertical gust (m/s). */
  turbulence(altM: number, aglM: number, dt: number, speed: number) {
    let I = this.cur.turb * 0.6;
    if (aglM < 600) I += Math.max(0, this.cur.windKt - 10) / 30 * 0.5 * (1 - aglM / 600);
    I += this.inCloud * (this.cur.type === 'cb' ? 1.2 : 0.3);
    if (this.cur.type === 'cumulus' && altM < this.cloudBaseM && altM > this.cloudBaseM - 1500) I += 0.15 * this.cur.cover;
    if (altM > 7500 && this.cur.turb > 0.3) I += 0.1;
    const k = Math.min(1, dt * (0.8 + speed / 60));
    const rnd = () => (Math.random() * 2 - 1);
    this.turbState.x += (rnd() * I - this.turbState.x) * k; this.turbState.y += (rnd() * I - this.turbState.y) * k; this.turbState.z += (rnd() * I - this.turbState.z) * k;
    this.turbRate.set(this.turbState.x * 0.12, this.turbState.y * 0.05, this.turbState.z * 0.06);
    return { rates: this.turbRate, vert: this.turbState.y * 4.5 * I, intensity: I };
  }

  update(dt: number, cam: THREE.Vector3, sunDir: THREE.Vector3, daylight: number, aircraftVel: THREE.Vector3, camWorld: THREE.Camera) {
    // dynamic weather evolution
    if (this.dynamic) {
      this.dynTimer -= dt;
      if (this.dynTimer <= 0) { this.dynTimer = 240 + Math.random() * 300; const tgt = WEATHER[1 + Math.floor(Math.random() * 5)]; this.preset = tgt; this.lastCell = ''; }
      const k = Math.min(1, dt / 90); const c = this.cur, t = this.preset;
      c.cover = lerp(c.cover, t.cover, k); c.visM = lerp(c.visM, t.visM, k); c.rain = lerp(c.rain, t.rain, k); c.windKt = lerp(c.windKt, t.windKt, k);
      c.turb = lerp(c.turb, t.turb, k); c.gustKt = lerp(c.gustKt, t.gustKt, k); c.baseFt = lerp(c.baseFt, t.baseFt, k); c.thickFt = lerp(c.thickFt, t.thickFt, k);
      if (k > 0 && Math.abs(c.cover - t.cover) < 0.05) { c.type = t.type; c.storm = t.storm; }
    }
    const w = this.cur;
    // gusts
    this.gustT -= dt;
    if (this.gustT <= 0) { this.gustT = 2 + Math.random() * 6; (this as any).gTarget = w.gustKt > w.windKt ? Math.random() * (w.gustKt - w.windKt) : 0; }
    this.gust = lerp(this.gust, (this as any).gTarget ?? 0, Math.min(1, dt * 0.8));

    this.cloudBaseM = this.airportElevM + w.baseFt * FT; this.cloudTopM = this.cloudBaseM + w.thickFt * FT;
    // lightning
    this.flash = Math.max(0, this.flash - dt * 6);
    if (w.storm) {
      this.nextFlash -= dt;
      if (this.nextFlash <= 0) { this.nextFlash = 3 + Math.random() * 14; this.flash = 0.6 + Math.random() * 0.6; this.onThunder?.(0.5 + Math.random() * 4, Math.random()); }
    }
    // in-cloud factor
    let inC = 0;
    if (w.cover > 0.05 && w.type !== 'none') {
      const inside = smooth(this.cloudBaseM - 40, this.cloudBaseM + 120, cam.y) * (1 - smooth(this.cloudTopM - 150, this.cloudTopM + 40, cam.y));
      if (w.type === 'stratus') inC = inside * smooth(0.5, 0.85, w.cover);
      else {
        // test against nearest puffs
        const a = this.puffGeo.getAttribute('aPuff') as THREE.InstancedBufferAttribute;
        let best = 0;
        for (let i = 0; i < this.puffGeo.instanceCount; i++) {
          const dx = a.array[i * 4] - cam.x, dy = a.array[i * 4 + 1] - cam.y, dz = a.array[i * 4 + 2] - cam.z, r = a.array[i * 4 + 3] * 0.42;
          const d2 = dx * dx + dy * dy + dz * dz; if (d2 < r * r) best = Math.max(best, 1 - Math.sqrt(d2) / r);
        }
        inC = Math.min(1, best * 2.5);
      }
    }
    this.inCloud = lerp(this.inCloud, inC, Math.min(1, dt * 3));

    // cloud field streaming
    const lit = new THREE.Color().setRGB(1, 0.97, 0.93).multiplyScalar(lerp(0.06, 1.05, daylight));
    if (sunDir.y < 0.25 && sunDir.y > -0.05) lit.lerp(new THREE.Color(1.0, 0.62, 0.38), (0.25 - sunDir.y) * 2.5 * daylight);
    const shadow = new THREE.Color().setRGB(0.42, 0.47, 0.55).multiplyScalar(lerp(0.04, 1, daylight) * (w.type === 'cb' || w.rain > 0.5 ? 0.6 : 1));
    this.cloudU.uLit.value.copy(lit); this.cloudU.uShadow.value.copy(shadow);
    const sv = sunDir.clone().transformDirection(camWorld.matrixWorldInverse); this.cloudU.uSunV.value.copy(sv);
    this.cloudU.uOpacity.value = w.type === 'none' ? 0 : 1;
    const cellSize = w.type === 'cb' ? 6000 : 2500;
    const ck = `${Math.floor(cam.x / cellSize)},${Math.floor(cam.z / cellSize)},${w.type},${Math.round(w.cover * 20)},${Math.round(w.baseFt / 200)}`;
    if (ck !== this.lastCell) { this.lastCell = ck; this.rebuildPuffs(cam, cellSize); }

    // overcast deck
    const deckOn = w.type === 'stratus' || (w.type === 'cb' && w.cover > 0.6);
    const above = cam.y > (this.cloudBaseM + this.cloudTopM) / 2;
    const deckY = w.type === 'cb' ? this.cloudBaseM + 1200 : above ? this.cloudTopM : this.cloudBaseM;
    this.deck.position.set(cam.x, deckY, cam.z);
    this.deckU.uOpacity.value = deckOn ? smooth(0.4, 0.9, w.cover) * (1 - this.inCloud * 0.5) : 0;
    this.deckU.uTop.value = above ? 1 : 0;
    this.deckU.uLit.value.copy(lit); this.deckU.uShadow.value.copy(shadow);
    this.deckU.uTime.value += dt;
    this.tOff.set(this.tOff.x, this.tOff.y);
    (this.deckU.uOff.value as THREE.Vector2).set(this.tOff.x + cam.x, this.tOff.y + cam.z);
    this.deck.visible = this.deckU.uOpacity.value > 0.01;

    // precipitation
    const precipOn = cam.y < this.cloudBaseM + 300;
    this.rain.visible = w.rain > 0.05 && precipOn;
    if (this.rain.visible) {
      const N = Math.floor(3000 * Math.min(1, w.rain)); const P = this.rainPos;
      const vx = -aircraftVel.x, vy = -9 - aircraftVel.y, vz = -aircraftVel.z; const sl = 0.03;
      const box = 40;
      for (let i = 0; i < N; i++) {
        let x = P[i * 6], y = P[i * 6 + 1], z = P[i * 6 + 2];
        x += vx * dt * 0.0 + (Math.random() - 0.5) * 0; y += -9 * dt;
        if (!x && !y && !z || Math.abs(x - cam.x) > box || Math.abs(y - cam.y) > box || Math.abs(z - cam.z) > box) {
          x = cam.x + (Math.random() - 0.5) * 2 * box; y = cam.y + (Math.random() - 0.5) * 2 * box; z = cam.z + (Math.random() - 0.5) * 2 * box;
        }
        P[i * 6] = x; P[i * 6 + 1] = y; P[i * 6 + 2] = z;
        P[i * 6 + 3] = x + vx * sl; P[i * 6 + 4] = y + vy * sl; P[i * 6 + 5] = z + vz * sl;
      }
      for (let i = N; i < 3000; i++) for (let c = 0; c < 6; c++) P[i * 6 + c] = 0;
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.rain.material as THREE.LineBasicMaterial).color.setScalar(lerp(0.12, 0.7, daylight) + this.flash);
    }
    this.snowPts.visible = w.snow > 0.05 && precipOn;
    if (this.snowPts.visible) {
      const a = this.snowPts.geometry.getAttribute('position') as THREE.BufferAttribute; const P = a.array as Float32Array; const box = 30;
      for (let i = 0; i < 2500; i++) {
        let x = P[i * 3], y = P[i * 3 + 1] - 1.2 * dt, z = P[i * 3 + 2];
        x += Math.sin(i + this.deckU.uTime.value) * 0.5 * dt;
        if (Math.abs(x - cam.x) > box || Math.abs(y - cam.y) > box || Math.abs(z - cam.z) > box) {
          x = cam.x + (Math.random() - 0.5) * 2 * box; y = cam.y + (Math.random() - 0.5) * 2 * box; z = cam.z + (Math.random() - 0.5) * 2 * box;
        }
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
      }
      a.needsUpdate = true;
    }
  }

  private rebuildPuffs(cam: THREE.Vector3, cell: number) {
    const w = this.cur; const a = this.puffGeo.getAttribute('aPuff') as THREE.InstancedBufferAttribute; const s = this.puffGeo.getAttribute('aShade') as THREE.InstancedBufferAttribute;
    const A = a.array as Float32Array, S = s.array as Float32Array;
    let n = 0;
    if (w.type !== 'none' && w.cover > 0.02) {
      const R = w.type === 'cb' ? 9 : 14;
      const cx = Math.floor(cam.x / cell), cz = Math.floor(cam.z / cell);
      // world-anchored hashing (origin-independent): use lat/lon of cell
      const items: { x: number; y: number; z: number; r: number; v: number; b: number; o: number; seed: number; d: number }[] = [];
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
        const gx = cx + i, gz = cz + j;
        const wx = (gx + 0.5) * cell, wz = (gz + 0.5) * cell;
        const latC = origin.latOf(wz), lonC = origin.lonOf(wx);
        const hx = Math.floor(lonC * 111000 / cell), hz = Math.floor(latC * 111000 / cell);
        const hh = hash2(hx, hz);
        const prob = w.type === 'stratus' ? w.cover * 0.6 : w.type === 'cb' ? 0.35 + w.cover * 0.3 : w.cover;
        if (hh > prob) continue;
        const rnd = mulberry((hx * 7919) ^ (hz * 104729));
        const big = w.type === 'cb' && rnd() < 0.35;
        const width = big ? 4500 : w.type === 'stratus' ? 2200 : 700 + rnd() * 1400 * (0.5 + w.cover);
        const height = big ? (this.cloudTopM - this.cloudBaseM) : w.type === 'stratus' ? Math.min(600, (this.cloudTopM - this.cloudBaseM)) : Math.min(this.cloudTopM - this.cloudBaseM, width * (0.5 + rnd() * 0.6));
        const ox = wx + (rnd() - 0.5) * cell * 0.6, oz = wz + (rnd() - 0.5) * cell * 0.6;
        const count = big ? 40 : w.type === 'stratus' ? 8 : 9 + Math.floor(rnd() * 12);
        for (let k = 0; k < count; k++) {
          const v = Math.pow(rnd(), big ? 0.8 : 1.2);
          const spread = (1 - v * (big ? 0.5 : 0.65));
          const ang = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * width * 0.5 * spread;
          const x = ox + Math.cos(ang) * rr, z = oz + Math.sin(ang) * rr * 0.7;
          const y = this.cloudBaseM + v * height + (big && v > 0.85 ? 0 : 0);
          let r = (big ? 1800 : width * 0.55) * (0.55 + rnd() * 0.6) * (1 - v * 0.3);
          if (big && v > 0.85) r *= 2.2; // anvil
          const dx = x - cam.x, dz = z - cam.z; const d = dx * dx + dz * dz;
          items.push({ x, y, z, r, v, b: big ? 0.75 : 1, o: w.type === 'stratus' ? 0.75 : 0.95, seed: rnd(), d });
        }
      }
      items.sort((p, q) => q.d - p.d);
      const take = items.slice(Math.max(0, items.length - this.maxPuffs));
      for (const it of take) {
        A[n * 4] = it.x; A[n * 4 + 1] = it.y; A[n * 4 + 2] = it.z; A[n * 4 + 3] = it.r;
        S[n * 4] = it.v; S[n * 4 + 1] = it.b; S[n * 4 + 2] = it.o; S[n * 4 + 3] = it.seed;
        n++;
      }
    }
    this.puffGeo.instanceCount = n; a.needsUpdate = true; s.needsUpdate = true;
    void clamp;
  }
}
