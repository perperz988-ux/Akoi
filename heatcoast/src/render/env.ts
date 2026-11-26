import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { clamp, lerp, rng, smoothstep } from '../core/math';
import type { Quality } from '../game/settings';
import { loadHdris, HdriName } from './assets';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';
interface WParams { cloud: number; rain: number; fog: number; wind: number }
const WP: Record<Weather, WParams> = {
  clear: { cloud: 0.18, rain: 0, fog: 0, wind: 0.2 },
  cloudy: { cloud: 0.65, rain: 0, fog: 0.15, wind: 0.45 },
  rain: { cloud: 0.85, rain: 0.65, fog: 0.35, wind: 0.6 },
  storm: { cloud: 1, rain: 1, fog: 0.5, wind: 1 },
  fog: { cloud: 0.45, rain: 0, fog: 1, wind: 0.1 },
};
export const WEATHER_LABEL: Record<Weather, string> = { clear: 'Sunny', cloudy: 'Cloudy', rain: 'Rain', storm: 'Thunderstorm', fog: 'Fog' };

/** Sky, sun/moon, day-night cycle, weather, clouds, rain, fog, image based lighting. */
export class Environment {
  scene = new THREE.Scene();
  sky = new Sky();
  sun = new THREE.DirectionalLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a45, 0.8);
  hour = 8.5; day = 1; timeScale = 1 / 60; // game hours per real second (1 h = 60 s)
  frozen = false;
  weather: Weather = 'clear'; next: Weather = 'clear'; wT = 0; wDur = 420;
  cur: WParams = { ...WP.clear };
  wet = 0; night = 0; sunDir = new THREE.Vector3(); lightning = 0;
  fogColor = new THREE.Color();
  private pmrem: THREE.PMREMGenerator; private envRT: THREE.WebGLRenderTarget | null = null; private envT = 999;
  private skyScene = new THREE.Scene(); private skyForEnv = new Sky();
  private stars: THREE.Points; private clouds: THREE.Mesh | null = null; private rain: THREE.LineSegments | null = null;
  private moon: THREE.Mesh;
  private rainMat!: THREE.ShaderMaterial; private cloudMat!: THREE.ShaderMaterial;
  onThunder: (() => void) | null = null;
  hdris: Partial<Record<HdriName, THREE.Texture>> = {};
  async loadHdris() { this.hdris = await loadHdris(this.pmrem); this.envT = 999; }
  private thunderT = 10;

  constructor(private renderer: THREE.WebGLRenderer, public q: Quality) {
    const s = this.scene;
    this.sky.scale.setScalar(9000); s.add(this.sky);
    this.skyForEnv.scale.setScalar(1000); this.skyScene.add(this.skyForEnv);
    s.add(this.hemi); s.add(this.sun); s.add(this.sun.target);
    this.sun.castShadow = q.shadows;
    this.configureShadows();
    s.fog = new THREE.Fog(0xbfd2e0, 60, q.fogFar);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    // stars
    const sg = new THREE.BufferGeometry(); const sp: number[] = [];
    for (let i = 0; i < 1600; i++) { const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); if (u < 0.05) continue; sp.push(Math.cos(a) * r * 4000, u * 4000, Math.sin(a) * r * 4000); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.renderOrder = -1; s.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(70, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8ecf5, fog: false, transparent: true }));
    s.add(this.moon);
    this.buildClouds(); this.buildRain();
    this.setQuality(q);
  }

  private configureShadows() {
    const q = this.q, sh = this.sun.shadow;
    sh.mapSize.set(q.shadowSize, q.shadowSize);
    const r = q.shadowRange; const c = sh.camera as THREE.OrthographicCamera;
    c.left = -r; c.right = r; c.top = r; c.bottom = -r; c.near = 1; c.far = 900; c.updateProjectionMatrix();
    sh.bias = -0.0004; sh.normalBias = 0.6;
    sh.map?.dispose(); (sh as any).map = null;
  }
  setQuality(q: Quality) {
    this.q = q; this.sun.castShadow = q.shadows; this.configureShadows();
    (this.scene.fog as THREE.Fog).far = q.fogFar;
    if (this.clouds) this.clouds.visible = q.clouds;
    if (this.rain) this.rain.geometry.setDrawRange(0, q.rainDrops * 2);
    this.envT = 999;
  }

  private buildClouds() {
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
      uniforms: { uT: { value: 0 }, uCover: { value: 0.3 }, uSun: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color(0.6, 0.65, 0.72) }, uCam: { value: new THREE.Vector3() } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `
        uniform float uT, uCover; uniform vec3 uSun, uShade, uCam; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=n(p)*a; p=p*2.07+vec2(1.7,9.2); a*=.5; } return s; }
        void main(){
          vec2 p = vW.xz*0.0011 + vec2(uT*0.006, uT*0.002);
          float d = fbm(p); float base = smoothstep(1.0-uCover-0.1, 1.0-uCover+0.35, d);
          float shade = fbm(p*1.9+3.1);
          float dist = length(vW.xz-uCam.xz); float fade = 1.0 - smoothstep(2200., 4200., dist);
          vec3 col = mix(uSun, uShade, smoothstep(0.3,0.9,shade)*0.8 + uCover*0.25);
          gl_FragColor = vec4(col, base*fade*0.92);
        }`,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(Math.PI / 2), this.cloudMat);
    this.clouds.position.y = 520; this.clouds.renderOrder = -1; this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);
  }
  private buildRain() {
    const N = 8000; const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (Math.random() - 0.5) * 70, y = Math.random() * 40, z = (Math.random() - 0.5) * 70; pos.set([x, y, z, x, y, z], i * 6); pos[i * 6 + 4] += 0.0; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const end = new Float32Array(N * 2); for (let i = 0; i < N; i++) end[i * 2 + 1] = 1; g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      uniforms: { uT: { value: 0 }, uCam: { value: new THREE.Vector3() }, uI: { value: 0 }, uWind: { value: 0 } },
      vertexShader: `attribute float aEnd; uniform float uT, uWind; uniform vec3 uCam; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y - uT*22.0, 40.0) - 12.0; p.x += -p.y*uWind*0.3;
          vec3 w = vec3(uCam.x + mod(p.x - uCam.x + 35.0, 70.0) - 35.0 + uCam.x*0.0, uCam.y + p.y, uCam.z + mod(p.z - uCam.z + 35.0, 70.0) - 35.0);
          w.x = uCam.x + (mod(p.x - uCam.x, 70.0) - 35.0); w.z = uCam.z + (mod(p.z - uCam.z, 70.0) - 35.0);
          w.y -= aEnd*0.9; w.x -= aEnd*uWind*0.25; vA = 1.0 - aEnd*0.7;
          gl_Position = projectionMatrix*viewMatrix*vec4(w,1.); }`,
      fragmentShader: `uniform float uI; varying float vA; void main(){ gl_FragColor = vec4(0.75,0.8,0.9, 0.38*uI*vA); }`,
    });
    this.rain = new THREE.LineSegments(g, this.rainMat); this.rain.frustumCulled = false; this.scene.add(this.rain);
  }

  setHour(h: number) { this.hour = ((h % 24) + 24) % 24; this.envT = 999; }
  setWeather(w: Weather, instant = true) { this.weather = w; this.next = w; this.wT = 0; this.wDur = 300 + rng.next() * 500; if (instant) this.cur = { ...WP[w] }; this.envT = 999; }
  forecast(): Weather[] { return [this.weather, this.next]; }

  update(dt: number, cam: THREE.Camera, focus: THREE.Vector3, time: number) {
    if (!this.frozen) {
      this.hour += dt * this.timeScale;
      if (this.hour >= 24) { this.hour -= 24; this.day++; }
      // weather state machine
      this.wT += dt;
      if (this.wT > this.wDur) {
        this.wT = 0; this.wDur = 300 + rng.next() * 600; this.weather = this.next;
        const opts: Weather[] = this.weather === 'storm' ? ['rain', 'cloudy'] : this.weather === 'rain' ? ['cloudy', 'storm', 'clear'] : this.weather === 'fog' ? ['clear', 'cloudy'] : this.weather === 'cloudy' ? ['clear', 'rain', 'clear'] : ['clear', 'cloudy', 'clear', 'fog'];
        this.next = rng.pick(opts);
      }
    }
    const target = WP[this.wT > this.wDur * 0.75 ? this.next : this.weather];
    for (const k of ['cloud', 'rain', 'fog', 'wind'] as const) this.cur[k] = lerp(this.cur[k], target[k], 1 - Math.exp(-dt * 0.08));
    this.wet = clamp(this.wet + (this.cur.rain > 0.15 ? dt * 0.03 * this.cur.rain : -dt * 0.004), 0, 1);

    // sun & moon
    const t = (this.hour - 6) / 12; const ang = t * Math.PI;
    this.sunDir.set(Math.cos(ang), Math.sin(ang), 0.38).normalize();
    const elev = this.sunDir.y;
    this.night = 1 - smoothstep(-0.12, 0.12, elev);
    const moonDir = this.sunDir.clone().multiplyScalar(-1); moonDir.y = Math.abs(moonDir.y) * 0.8 + 0.25; moonDir.normalize();
    const day = 1 - this.night, cloud = this.cur.cloud;
    // sky shader params
    const u = this.sky.material.uniforms;
    for (const sk of [this.sky, this.skyForEnv]) {
      const uu = sk.material.uniforms;
      uu.turbidity.value = 2 + cloud * 8; uu.rayleigh.value = 1.2 + (1 - elev) * 1.5 - cloud * 0.6; uu.mieCoefficient.value = 0.004 + cloud * 0.01; uu.mieDirectionalG.value = 0.86;
      uu.sunPosition.value.copy(this.sunDir).multiplyScalar(1000);
    }
    void u;
    this.sky.position.copy(cam.position);
    // lighting
    const warm = smoothstep(0.45, 0.02, elev);
    const sunCol = new THREE.Color().setRGB(1, lerp(0.97, 0.62, warm), lerp(0.92, 0.38, warm));
    const lightDir = elev > -0.05 ? this.sunDir : moonDir;
    const sunI = elev > -0.05 ? smoothstep(-0.05, 0.25, elev) * 3.0 * (1 - cloud * 0.7) : 0.22;
    this.sun.color.copy(elev > -0.05 ? sunCol : new THREE.Color(0.55, 0.65, 1));
    this.sun.intensity = sunI + this.lightning * 6;
    // shadow camera follows focus, snapped to texels to avoid shimmer
    const r = this.q.shadowRange, texel = (r * 2) / this.q.shadowSize;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.sun.position.set(fx + lightDir.x * 400, lightDir.y * 400 + 5, fz + lightDir.z * 400);
    this.sun.target.position.set(fx, 0, fz); this.sun.target.updateMatrixWorld();
    this.hemi.intensity = lerp(0.06, 0.35, day) * (1 - cloud * 0.15) + this.lightning * 2;
    this.hemi.color.setRGB(lerp(0.25, 0.72, day), lerp(0.3, 0.82, day), lerp(0.5, 1, day));
    this.hemi.groundColor.setRGB(lerp(0.06, 0.42, day), lerp(0.06, 0.36, day), lerp(0.08, 0.3, day));
    // fog colour approximates sky horizon
    const fogDay = new THREE.Color(0.74, 0.82, 0.9).lerp(new THREE.Color(0.95, 0.68, 0.5), warm * day).lerp(new THREE.Color(0.62, 0.66, 0.7), cloud * 0.7);
    this.fogColor.copy(fogDay).lerp(new THREE.Color(0.035, 0.05, 0.09), this.night);
    const fog = this.scene.fog as THREE.Fog; fog.color.copy(this.fogColor);
    const fogK = Math.max(this.cur.fog, this.cur.rain * 0.5);
    fog.far = lerp(this.q.fogFar, 170, fogK); fog.near = lerp(80, 5, fogK);
    this.renderer.toneMappingExposure = lerp(0.75, 0.62, day);
    // stars / moon
    (this.stars.material as THREE.PointsMaterial).opacity = this.night * (1 - cloud);
    this.stars.position.copy(cam.position);
    this.moon.position.copy(cam.position).addScaledVector(moonDir, 3800); this.moon.visible = this.night > 0.05;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = this.night * (1 - cloud * 0.8);
    // clouds
    if (this.clouds) {
      this.clouds.position.set(cam.position.x, 520, cam.position.z);
      const cu = this.cloudMat.uniforms; cu.uT.value = time * (1 + this.cur.wind * 3); cu.uCover.value = 0.15 + cloud * 0.8; cu.uCam.value.copy(cam.position);
      cu.uSun.value.setRGB(lerp(0.12, 1, day) * lerp(1, 0.75, cloud), lerp(0.13, 0.95, day) * lerp(1, 0.75, cloud) * lerp(1, 0.8, warm), lerp(0.18, 0.92, day) * lerp(1, 0.78, cloud) * lerp(1, 0.6, warm));
      cu.uShade.value.setRGB(lerp(0.05, 0.55, day), lerp(0.06, 0.58, day), lerp(0.09, 0.64, day)).multiplyScalar(1 - cloud * 0.35);
    }
    // rain
    if (this.rain) { const ru = this.rainMat.uniforms; ru.uT.value = time; ru.uCam.value.copy(cam.position); ru.uI.value = this.cur.rain; ru.uWind.value = this.cur.wind; this.rain.visible = this.cur.rain > 0.02; }
    // lightning
    this.lightning = Math.max(0, this.lightning - dt * 4);
    if (this.cur.rain > 0.85) { this.thunderT -= dt; if (this.thunderT < 0) { this.thunderT = 6 + Math.random() * 18; this.lightning = 1; setTimeout(() => this.onThunder?.(), 400 + Math.random() * 1500); } }
    // image based lighting: real CC0 HDRIs chosen by time of day (falls back to the procedural sky)
    this.envT += dt;
    const h = this.hour; const pick: HdriName = h < 5.2 || h >= 20 ? 'night' : h < 7.5 ? 'sunrise' : h < 17.2 ? (cloud > 0.6 ? 'park' : 'city') : 'sunset';
    const envTex = this.hdris[pick];
    if (envTex) { this.scene.environment = envTex; }
    else if (this.envT > this.q.envEvery) {
      this.envT = 0; const old = this.envRT; this.envRT = this.pmrem.fromScene(this.skyScene as any, 0, 0.1, 2000); this.scene.environment = this.envRT.texture; old?.dispose();
    }
    (this.scene as any).environmentIntensity = (envTex ? lerp(0.12, 0.55, day) : lerp(0.08, 0.6, day)) * (1 - cloud * 0.25) + this.lightning;
  }
  get cloud() { return this.cur.cloud; }
  get rainAmt() { return this.cur.rain; }
}
