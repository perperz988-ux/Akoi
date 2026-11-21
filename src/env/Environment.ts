import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/MathUtil';
import { QualityCfg } from '../settings/Quality';
import { TextureStreamer } from '../world/Textures';
import { WATER_Y } from '../world/CityLayout';
import { EventBus } from '../core/Events';

export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog';

const SKY_VERT = `
varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`;
const SKY_FRAG = `
precision highp float;
varying vec3 vDir;
uniform vec3 uSunDir; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSunColor; uniform float uNight; uniform float uCloud; uniform float uTime; uniform vec3 uCloudColor;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uTop, pow(max(h,0.0), 0.55));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 600.0) * 4.0 + pow(sd, 12.0) * 0.35 + pow(sd, 3.0) * 0.12);
  // stars
  if (uNight > 0.01 && d.y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.25) * 90.0;
    float s = step(0.9965, hash(floor(sp))) * (0.5 + 0.5 * hash(floor(sp)+3.0));
    col += vec3(s) * uNight * (1.0 - uCloud);
    // moon
    vec3 md = -uSunDir; float m = smoothstep(0.9993, 0.9996, dot(d, md));
    col += vec3(0.9,0.93,1.0) * m * uNight;
  }
  // clouds
  if (d.y > 0.0) {
    vec2 cp = d.xz / (d.y + 0.15) * 1.6 + vec2(uTime * 0.01, uTime * 0.004);
    float c = fbm(cp);
    float cov = mix(0.62, 0.28, uCloud);
    float cl = smoothstep(cov, cov + 0.25, c) * smoothstep(0.0, 0.25, d.y);
    vec3 cc = uCloudColor * (0.75 + 0.25 * sd) + uSunColor * pow(sd, 6.0) * 0.25;
    col = mix(col, cc, cl * (0.55 + 0.4 * uCloud));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const WATER_VERT = `
varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FRAG = `
precision highp float;
varying vec3 vWorld;
uniform sampler2D uNormal; uniform float uTime; uniform vec3 uSunDir; uniform vec3 uHorizon; uniform vec3 uTop; uniform vec3 uSunColor; uniform vec3 uDeep; uniform vec3 uShallow;
uniform vec3 uFogColor; uniform float uFogFar; uniform float uDetail; uniform float uOpacity; uniform float uRain;
void main(){
  vec2 p = vWorld.xz;
  vec3 n1 = texture2D(uNormal, p * 0.045 + vec2(uTime * 0.02, uTime * 0.013)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNormal, p * 0.11 - vec2(uTime * 0.03, -uTime * 0.02)).xyz * 2.0 - 1.0;
  vec3 n = normalize(vec3((n1.x + n2.x) * (0.35 + uRain * 0.4), 2.0, (n1.y + n2.y) * (0.35 + uRain * 0.4)));
  if (uDetail < 0.5) n = vec3(0.0, 1.0, 0.0);
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 4.0);
  vec3 refl = mix(uHorizon, uTop, clamp(reflect(-V, n).y * 1.2, 0.0, 1.0));
  vec3 R = reflect(-V, n);
  float spec = pow(max(dot(R, uSunDir), 0.0), 220.0) * 2.5 + pow(max(dot(R, uSunDir), 0.0), 20.0) * 0.12;
  vec3 body = mix(uDeep, uShallow, clamp(0.3 + n.x * 0.2, 0.0, 1.0));
  vec3 col = mix(body, refl, fres) + uSunColor * spec * uDetail;
  float f = clamp((dist - uFogFar * 0.15) / (uFogFar * 0.85), 0.0, 1.0);
  col = mix(col, uFogColor, f * f);
  gl_FragColor = vec4(col, mix(uOpacity, 1.0, fres * 0.4));
}`;

const RAIN_VERT = `
uniform float uTime; uniform vec3 uCenter; uniform float uAmount; uniform vec2 uWind; attribute float aSeed; attribute float aEnd; varying float vA;
void main(){
  vec3 base = vec3(fract(aSeed * 7.13) * 40.0 - 20.0, 0.0, fract(aSeed * 3.71) * 40.0 - 20.0);
  float speed = 22.0 + fract(aSeed * 5.3) * 6.0;
  float y = 24.0 - mod(uTime * speed + fract(aSeed * 11.0) * 24.0, 24.0);
  vec3 pos = uCenter + base + vec3(uWind.x * (24.0 - y) * 0.05, y - 6.0 + aEnd * 0.9, uWind.y * (24.0 - y) * 0.05);
  pos.x += aEnd * uWind.x * 0.08; pos.z += aEnd * uWind.y * 0.08;
  vA = step(aSeed, uAmount);
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}`;
const RAIN_FRAG = `precision mediump float; varying float vA; void main(){ if (vA < 0.5) discard; gl_FragColor = vec4(0.75,0.82,0.9, 0.35); }`;

const col = (h: number) => new THREE.Color(h);

export class Environment {
  scene = new THREE.Scene();
  sun = new THREE.DirectionalLight(0xffffff, 3);
  moon = new THREE.DirectionalLight(0x6f86c8, 0);
  hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a4a40, 0.7);
  skyMesh!: THREE.Mesh;
  skyMat!: THREE.ShaderMaterial;
  waterMesh!: THREE.Mesh;
  waterMat!: THREE.ShaderMaterial;
  rain!: THREE.LineSegments;
  rainMat!: THREE.ShaderMaterial;
  hour = 9.5; day = 1; timeScale = 1 / 60;  // game hours per real second (1 game min / real sec)
  weather: Weather = 'clear';
  private targetWeather: Weather = 'clear';
  private cloud = 0.15; private rainAmt = 0; private fogAmt = 0; private storm = 0;
  private weatherTimer = 150;
  private flash = 0; private nextBolt = 8;
  night = 0; sunElev = 1;
  time = 0;
  private pmrem?: THREE.PMREMGenerator;
  private envTimer = 999;
  private envScene?: THREE.Scene;
  private envRT?: THREE.WebGLRenderTarget;
  fogColor = new THREE.Color(0xaec8e0);
  wind = new THREE.Vector2(1, 0.3);
  frozen = false;
  /** wetness 0..1 (surfaces darker/glossier after rain) */
  wet = 0;

  constructor(public q: QualityCfg, private tex: TextureStreamer, private bus: EventBus, private renderer: THREE.WebGLRenderer) {
    const s = this.scene;
    s.add(this.hemi, this.sun, this.moon, this.sun.target, this.moon.target);
    s.fog = new THREE.Fog(0xaec8e0, 40, q.fogFar);
    this.makeSky(); this.makeWater(); this.makeRain();
    this.configureShadows();
    this.pmrem = new THREE.PMREMGenerator(renderer);
  }

  configureShadows() {
    const q = this.q;
    this.sun.castShadow = q.shadows;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      const d = q.shadowDist, c = this.sun.shadow.camera;
      c.left = -d; c.right = d; c.top = d; c.bottom = -d; c.near = 1; c.far = 500; c.updateProjectionMatrix();
      this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.5;
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); (this.sun.shadow as any).map = null; }
    }
  }

  setQuality(q: QualityCfg) {
    this.q = q;
    (this.scene.fog as THREE.Fog).far = q.fogFar;
    this.configureShadows();
    this.waterMat.uniforms.uDetail.value = q.waterDetail > 0 ? 1 : 0;
    this.makeRain(true);
  }

  private makeSky() {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: { uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uTop: { value: col(0x3a78d8) }, uHorizon: { value: col(0xbcd4ee) }, uSunColor: { value: col(0xfff2d0) }, uNight: { value: 0 }, uCloud: { value: 0.2 }, uTime: { value: 0 }, uCloudColor: { value: col(0xffffff) } },
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.skyMat);
    this.skyMesh.frustumCulled = false; this.skyMesh.renderOrder = -10;
    this.scene.add(this.skyMesh);
  }

  private makeWater() {
    this.waterMat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false,
      uniforms: {
        uNormal: { value: this.tex.waterNormal() }, uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uHorizon: { value: col(0xbcd4ee) }, uTop: { value: col(0x3a78d8) }, uSunColor: { value: col(0xfff2d0) },
        uDeep: { value: col(0x0f3d52) }, uShallow: { value: col(0x2a8ea0) }, uFogColor: { value: col(0xaec8e0) }, uFogFar: { value: this.q.fogFar }, uDetail: { value: this.q.waterDetail > 0 ? 1 : 0 }, uOpacity: { value: 0.82 }, uRain: { value: 0 },
      },
    });
    const g = new THREE.PlaneGeometry(4000, 4000); g.rotateX(-Math.PI / 2);
    this.waterMesh = new THREE.Mesh(g, this.waterMat);
    this.waterMesh.position.y = WATER_Y; this.waterMesh.renderOrder = 2; this.waterMesh.frustumCulled = false;
    this.scene.add(this.waterMesh);
  }

  private makeRain(rebuild = false) {
    if (this.rain) { this.scene.remove(this.rain); this.rain.geometry.dispose(); }
    const n = this.q.rain, pos = new Float32Array(n * 6), seed = new Float32Array(n * 2), end = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { seed[i * 2] = seed[i * 2 + 1] = (i + 0.5) / n; end[i * 2] = 0; end[i * 2 + 1] = 1; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    if (!this.rainMat) this.rainMat = new THREE.ShaderMaterial({ vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false, fog: false, uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uWind: { value: new THREE.Vector2() } } });
    this.rain = new THREE.LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false; this.rain.visible = false; this.rain.renderOrder = 5;
    this.scene.add(this.rain);
    void rebuild;
  }

  setWeather(w: Weather) { this.targetWeather = w; this.weatherTimer = 120 + Math.random() * 240; }
  get rainLevel() { return this.rainAmt; }
  get isStormy() { return this.storm; }
  get visibilityFactor() { return 1 - this.fogAmt * 0.7 - this.rainAmt * 0.25; }
  setHour(h: number) { this.hour = ((h % 24) + 24) % 24; }
  get clockString() { const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

  update(dt: number, cam: THREE.Camera, focus: THREE.Vector3) {
    this.time += dt;
    if (!this.frozen) {
      this.hour += dt * this.timeScale;
      if (this.hour >= 24) { this.hour -= 24; this.day++; }
    }
    // weather state machine
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      const r = Math.random();
      const w: Weather = r < 0.5 ? 'clear' : r < 0.72 ? 'cloudy' : r < 0.88 ? 'rain' : r < 0.95 ? 'fog' : 'storm';
      this.setWeather(w);
    }
    this.weather = this.targetWeather;
    const t = this.targetWeather;
    const tCloud = t === 'clear' ? 0.12 : t === 'cloudy' ? 0.6 : t === 'fog' ? 0.5 : 0.95;
    const tRain = t === 'rain' ? 0.55 : t === 'storm' ? 1 : 0;
    const tFog = t === 'fog' ? 1 : t === 'rain' ? 0.25 : t === 'storm' ? 0.35 : 0;
    const k = 1 - Math.exp(-dt * 0.25);
    this.cloud = lerp(this.cloud, tCloud, k); this.rainAmt = lerp(this.rainAmt, tRain, k * 1.4); this.fogAmt = lerp(this.fogAmt, tFog, k); this.storm = lerp(this.storm, t === 'storm' ? 1 : 0, k);
    this.wet = clamp(this.wet + (this.rainAmt > 0.1 ? dt * 0.05 : -dt * 0.008), 0, 1);

    // sun
    const ang = ((this.hour - 6) / 24) * Math.PI * 2;
    const elev = Math.sin(ang);
    this.sunElev = elev;
    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.85, elev, 0.35).normalize();
    const day = smoothstep(-0.08, 0.22, elev);
    const dusk = (1 - smoothstep(0.0, 0.4, Math.abs(elev))) * (elev > -0.15 ? 1 : 0);
    this.night = 1 - smoothstep(-0.2, 0.05, elev);
    const over = this.cloud * 0.55 + this.rainAmt * 0.25;

    const top = col(0x2f6fd0).lerp(col(0x0a1030), this.night).lerp(col(0xd0884a), dusk * 0.35).lerp(col(0x66707a), over);
    const hor = col(0xbcd6f2).lerp(col(0x1a2342), this.night).lerp(col(0xff9a58), dusk * 0.85).lerp(col(0x9aa3ab), over).lerp(col(0xb8bec2), this.fogAmt * 0.8);
    const sunCol = col(0xfff4dc).lerp(col(0xff9040), dusk).multiplyScalar(day);
    const cloudCol = col(0xffffff).lerp(col(0x1a2038), this.night).lerp(col(0xf0a070), dusk * 0.6).lerp(col(0x7c828a), this.rainAmt * 0.8);
    const u = this.skyMat.uniforms;
    u.uSunDir.value.copy(sunDir); u.uTop.value.copy(top); u.uHorizon.value.copy(hor); u.uSunColor.value.copy(sunCol); u.uNight.value = this.night; u.uCloud.value = this.cloud; u.uTime.value = this.time; u.uCloudColor.value.copy(cloudCol);
    this.skyMesh.position.copy(cam.position); this.skyMesh.scale.setScalar(900);

    // lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.storm > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.flash = 1; this.nextBolt = 4 + Math.random() * 12; setTimeout(() => this.bus.emit('thunder', { dist: 300 + Math.random() * 1500 }), 300 + Math.random() * 1500); }
    }

    // lights
    const sunI = (day * 3.2 + dusk * 0.4) * (1 - over * 0.75);
    this.sun.color.copy(col(0xfff1dc).lerp(col(0xffa060), dusk));
    this.sun.intensity = sunI;
    const hemiI = 0.18 + day * 0.75 * (1 - over * 0.4) + this.flash * 1.2;
    this.hemi.intensity = hemiI;
    this.hemi.color.copy(col(0xbcd4ff).lerp(col(0x31406a), this.night).lerp(col(0xffc59a), dusk * 0.5));
    this.hemi.groundColor.copy(col(0x5a5446).lerp(col(0x1a1c24), this.night));
    this.moon.intensity = this.night * 0.35 * (1 - over * 0.5);
    // shadow rig: follow focus, snap to texels
    const follow = focus;
    const lightDir = elev > -0.02 ? sunDir : sunDir.clone().multiplyScalar(-1);
    const snap = (this.q.shadowDist * 2) / this.q.shadowMap;
    const fx = Math.round(follow.x / snap) * snap, fz = Math.round(follow.z / snap) * snap;
    this.sun.position.set(fx + lightDir.x * 200, follow.y + Math.max(lightDir.y, 0.12) * 200, fz + lightDir.z * 200);
    this.sun.target.position.set(fx, follow.y, fz);
    this.sun.castShadow = this.q.shadows && (elev > 0.03) && sunI > 0.2;
    this.moon.position.set(follow.x - lightDir.x * 200, follow.y + 150, follow.z - lightDir.z * 200); this.moon.target.position.copy(follow);

    // fog
    const fog = this.scene.fog as THREE.Fog;
    this.fogColor.copy(hor).multiplyScalar(0.92 + this.flash * 0.3);
    fog.color.copy(this.fogColor);
    const vis = this.visibilityFactor;
    fog.far = this.q.fogFar * (0.35 + 0.65 * vis) * (this.fogAmt > 0.5 ? 0.5 : 1);
    fog.near = 20 + (1 - this.fogAmt) * 60;
    this.scene.background = null;

    // water
    const wu = this.waterMat.uniforms;
    wu.uTime.value = this.time; wu.uSunDir.value.copy(sunDir); wu.uHorizon.value.copy(hor); wu.uTop.value.copy(top); wu.uSunColor.value.copy(sunCol);
    wu.uFogColor.value.copy(this.fogColor); wu.uFogFar.value = fog.far; wu.uRain.value = this.rainAmt;
    wu.uDeep.value.copy(col(0x0f3d52).multiplyScalar(0.3 + day * 0.7)); wu.uShallow.value.copy(col(0x2a8ea0).multiplyScalar(0.25 + day * 0.75));
    this.waterMesh.position.x = Math.round(cam.position.x / 100) * 100; this.waterMesh.position.z = Math.round(cam.position.z / 100) * 100;

    // rain
    const ru = this.rainMat.uniforms;
    this.rain.visible = this.rainAmt > 0.03;
    ru.uTime.value = this.time; ru.uCenter.value.copy(cam.position); ru.uAmount.value = this.rainAmt; ru.uWind.value.set(this.wind.x * (1 + this.storm * 3), this.wind.y * (1 + this.storm * 3));

    // reflections / IBL refresh
    this.envTimer += dt;
    if (this.q.envMap && this.envTimer > 25) { this.envTimer = 0; this.refreshEnv(sunDir, top, hor); }
  }

  /** Bake the procedural sky into an environment cubemap for PBR reflections (low-res, infrequent). */
  private refreshEnv(sunDir: THREE.Vector3, top: THREE.Color, hor: THREE.Color) {
    if (!this.pmrem) return;
    if (!this.envScene) {
      this.envScene = new THREE.Scene();
      const m = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), this.skyMat.clone());
      (m.material as THREE.ShaderMaterial).depthTest = true;
      this.envScene.add(m);
    }
    const mesh = this.envScene.children[0] as THREE.Mesh;
    const mat = mesh.material as THREE.ShaderMaterial;
    for (const k of Object.keys(this.skyMat.uniforms)) mat.uniforms[k].value = (this.skyMat.uniforms[k].value as any).clone ? (this.skyMat.uniforms[k].value as any).clone() : this.skyMat.uniforms[k].value;
    void sunDir; void top; void hor;
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    this.envRT?.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.35 + (1 - this.night) * 0.5;
  }

  dispose() { this.envRT?.dispose(); this.pmrem?.dispose(); }
}
