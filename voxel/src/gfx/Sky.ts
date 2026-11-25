// Sky dome (gradient, sun, moon, stars), drifting clouds and the day/night lighting rig.
import * as THREE from 'three';
import { shared } from './Materials';
import { mulberry32 } from '../world/Noise';

const C = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const DAY_TOP = C(0.27, 0.52, 0.93), DAY_HOR = C(0.68, 0.82, 0.97);
const NIGHT_TOP = C(0.012, 0.018, 0.05), NIGHT_HOR = C(0.05, 0.07, 0.13);
const DUSK_HOR = C(0.98, 0.52, 0.3), DUSK_TOP = C(0.32, 0.3, 0.55);
const RAIN = C(0.42, 0.45, 0.5);

export class Sky {
  dome: THREE.Mesh;
  clouds: THREE.Mesh;
  sun = new THREE.DirectionalLight(0xffffff, 2);
  hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a5040, 1);
  fog: THREE.Fog;
  fogColor = new THREE.Color();
  dayFactor = 1;
  private skyMat: THREE.ShaderMaterial;
  private cloudMat: THREE.ShaderMaterial;
  private wind = 0;
  flash = 0;
  dim = 0;

  constructor(private scene: THREE.Scene) {
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3() },
        uSunCol: { value: new THREE.Color() }, uStars: { value: 0 }, uTime: shared.uTime, uRain: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunCol; uniform float uStars; uniform float uTime; uniform float uRain;
        varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHor, uTop, smoothstep(-0.02, 0.55, h));
          col = mix(col, uHor * 0.55, smoothstep(0.0, -0.3, h));
          float s = dot(d, uSun);
          float sunVis = (1.0 - uRain * 0.85);
          col += uSunCol * (smoothstep(0.9990, 0.9994, s) * 4.0 + pow(max(s, 0.0), 300.0) * 1.2 + pow(max(s, 0.0), 12.0) * 0.18) * sunVis;
          vec3 m = -uSun; float ms = dot(d, m);
          float moon = smoothstep(0.9988, 0.9991, ms);
          vec3 mt = normalize(cross(m, vec3(0.0, 0.0, 1.0)));
          float crescent = smoothstep(0.9988, 0.9991, dot(normalize(d - mt * 0.012), m));
          col += vec3(0.85, 0.88, 1.0) * max(moon - crescent * 0.85, 0.0) * 1.4 * sunVis + vec3(0.35, 0.4, 0.6) * pow(max(ms, 0.0), 60.0) * 0.25 * uStars;
          if (uStars > 0.01 && h > 0.0) {
            vec3 g = floor(d * 260.0);
            float st = hash(g);
            if (st > 0.9965) col += vec3(0.9, 0.92, 1.0) * uStars * (0.6 + 0.4 * sin(uTime * 2.0 + st * 100.0)) * (1.0 - uRain) * smoothstep(0.0, 0.2, h);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), this.skyMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // clouds: blocky procedural mask
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
    const cx = cv.getContext('2d')!;
    const img = cx.createImageData(128, 128);
    const r = mulberry32(42);
    const grid = new Float32Array(32 * 32).map(() => r());
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const sx = x / 8, sy = y / 8;
      const gx = Math.floor(sx), gy = Math.floor(sy), fx = sx - gx, fy = sy - gy;
      const g = (a: number, b: number) => grid[((a % 16) + 16) % 16 + (((b % 16) + 16) % 16) * 32];
      const v = (g(gx, gy) * (1 - fx) + g(gx + 1, gy) * fx) * (1 - fy) + (g(gx, gy + 1) * (1 - fx) + g(gx + 1, gy + 1) * fx) * fy;
      const g2 = grid[((x >> 2) % 32) + ((y >> 2) % 32) * 32];
      const a = v * 0.8 + g2 * 0.2 > 0.58 ? 255 : 0;
      const i = (y * 128 + x) * 4; img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = a;
    }
    cx.putImageData(img, 0, 0);
    const ctex = new THREE.CanvasTexture(cv);
    ctex.wrapS = ctex.wrapT = THREE.RepeatWrapping; ctex.magFilter = THREE.NearestFilter; ctex.minFilter = THREE.LinearFilter; ctex.generateMipmaps = false;
    this.cloudMat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: ctex }, uOff: { value: new THREE.Vector2() }, uCol: { value: new THREE.Color(1, 1, 1) }, uAlpha: { value: 0.85 } },
      vertexShader: `varying vec2 vUv; varying float vD; void main(){ vUv = uv; vD = length(position.xy) / 600.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec2 uOff; uniform vec3 uCol; uniform float uAlpha; varying vec2 vUv; varying float vD;
        void main(){ float a = texture2D(uTex, vUv * 4.0 + uOff).a; if (a < 0.5) discard; gl_FragColor = vec4(uCol, uAlpha * (1.0 - smoothstep(0.45, 1.0, vD)));
        #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), this.cloudMat);
    this.clouds.rotation.x = -Math.PI / 2;
    this.clouds.renderOrder = -5;
    this.clouds.frustumCulled = false;
    scene.add(this.clouds);

    this.fog = new THREE.Fog(0xaaccee, 40, 120);
    scene.fog = this.fog;
    scene.add(this.hemi);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.04;
  }

  setShadows(enabled: boolean, size: number, range: number) {
    this.sun.castShadow = enabled;
    if (enabled) {
      if (this.sun.shadow.mapSize.x !== size) {
        this.sun.shadow.mapSize.set(size, size);
        this.sun.shadow.map?.dispose(); (this.sun.shadow as any).map = null;
      }
      const cam = this.sun.shadow.camera as THREE.OrthographicCamera;
      cam.left = -range; cam.right = range; cam.top = range; cam.bottom = -range; cam.near = 1; cam.far = 260;
      cam.updateProjectionMatrix();
    }
  }

  private cloudsOn = true;
  setCloudsVisible(v: boolean) { this.cloudsOn = v; this.clouds.visible = v; }

  /** t: time of day 0..1 (0 = sunrise, 0.25 noon, 0.5 sunset, 0.75 midnight); rain 0..1. */
  update(dt: number, t: number, rain: number, camera: THREE.Camera, fogFar: number, underwater: boolean, underground: number) {
    const a = t * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.28).normalize();
    const sh = Math.sin(a);
    const day = THREE.MathUtils.smoothstep(sh, -0.18, 0.22);
    this.dayFactor = day;
    const dusk = Math.max(0, 1 - Math.abs(sh) / 0.3) * (Math.cos(a) > -2 ? 1 : 0);
    const top = NIGHT_TOP.clone().lerp(DAY_TOP, day).lerp(DUSK_TOP, dusk * 0.4);
    const hor = NIGHT_HOR.clone().lerp(DAY_HOR, day);
    // sunset tint only on the side of the sun is approximated by global tint
    hor.lerp(DUSK_HOR, dusk * 0.55);
    const rainK = rain * 0.75;
    top.lerp(RAIN.clone().multiplyScalar(0.25 + day * 0.75), rainK);
    hor.lerp(RAIN.clone().multiplyScalar(0.3 + day * 0.7), rainK);
    if (this.dim === 2) {
      top.lerp(new THREE.Color().setRGB(0.24, 0.05, 0.04, THREE.SRGBColorSpace), 0.85);
      hor.lerp(new THREE.Color().setRGB(0.62, 0.22, 0.09, THREE.SRGBColorSpace), 0.85);
    } else if (this.dim === 3) {
      // Dreamhollow: eternal violet twilight with a teal aurora horizon
      top.lerp(new THREE.Color().setRGB(0.2, 0.1, 0.38, THREE.SRGBColorSpace), 0.8);
      hor.lerp(new THREE.Color().setRGB(0.36, 0.78, 0.74, THREE.SRGBColorSpace), 0.7);
    } else if (this.dim === 1) {
      top.lerp(new THREE.Color().setRGB(0.42, 0.5, 0.98, THREE.SRGBColorSpace), 0.35 * day);
      hor.lerp(new THREE.Color().setRGB(0.98, 0.86, 1.0, THREE.SRGBColorSpace), 0.45 * day);
    }
    if (this.flash > 0) { top.lerp(new THREE.Color(1, 1, 1), this.flash); hor.lerp(new THREE.Color(1, 1, 1), this.flash); this.flash = Math.max(0, this.flash - dt * 3); }
    const u = this.skyMat.uniforms;
    u.uTop.value.copy(top); u.uHor.value.copy(hor); u.uSun.value.copy(sunDir);
    u.uSunCol.value.setRGB(1.0, 0.85 + 0.15 * day, 0.65 + 0.35 * day);
    u.uStars.value = this.dim === 3 ? 0.85 : 1 - day; u.uRain.value = rain;
    shared.uSkyTop.value.copy(top); shared.uSkyHorizon.value.copy(hor);
    shared.uDay.value = day * (1 - rain * 0.4);
    const p = camera.position;
    this.dome.position.copy(p);
    // light rig: sun by day, moon by night
    const above = sh > -0.05;
    const ldir = above ? sunDir : sunDir.clone().multiplyScalar(-1);
    shared.uSunDir.value.copy(ldir);
    const moonI = 0.22, sunI = 2.3 * day * (1 - rain * 0.6);
    this.sun.intensity = above ? Math.max(sunI, 0.0) : moonI * (1 - day) * (1 - rain * 0.5);
    this.sun.color.setRGB(above ? 1.0 : 0.6, above ? 0.82 + 0.18 * day : 0.7, above ? 0.62 + 0.38 * day : 1.0);
    shared.uSunColor.value.copy(this.sun.color).multiplyScalar(above ? day : 0.3);
    const snap = 4;
    const tx = Math.round(p.x / snap) * snap, tz = Math.round(p.z / snap) * snap;
    this.sun.position.set(tx + ldir.x * 120, Math.max(10, p.y) + ldir.y * 120, tz + ldir.z * 120);
    this.sun.target.position.set(tx, p.y, tz);
    this.hemi.intensity = this.dim === 2 ? 0.9 : (0.35 + 1.05 * day) * (1 - rain * 0.25);
    if (this.dim === 2) this.sun.intensity = 0.7;
    if (this.dim === 3) { this.hemi.intensity = 1.0; this.sun.intensity = 0.9; }
    this.hemi.color.copy(top).lerp(new THREE.Color(1, 1, 1), 0.45);
    this.hemi.groundColor.setRGB(0.32 + 0.1 * day, 0.3 + 0.08 * day, 0.26);
    // fog
    this.fogColor.copy(hor).lerp(top, 0.15);
    if (underground > 0) this.fogColor.lerp(new THREE.Color(0.02, 0.02, 0.03), underground * 0.85);
    shared.uFogFlat.value = underwater ? 1 : Math.min(1, underground * 1.3);
    if (underwater) {
      this.fogColor.setRGB(0.04, 0.16, 0.3).multiplyScalar(0.3 + 0.7 * day);
      this.fog.near = 1; this.fog.far = 18;
    } else {
      this.fog.far = fogFar * (1 - rain * 0.35);
      this.fog.near = this.fog.far * 0.45;
    }
    this.fog.color.copy(this.fogColor);
    // clouds
    this.wind += dt * 1.2;
    this.clouds.position.set(p.x, this.dim === 1 ? 20 : 150, p.z);
    this.clouds.visible = this.cloudsOn && this.dim !== 2 && this.dim !== 3;
    const cu = this.cloudMat.uniforms;
    cu.uOff.value.set((p.x + this.wind) / 300, -p.z / 300);
    cu.uCol.value.copy(new THREE.Color(1, 1, 1).lerp(new THREE.Color(0.1, 0.12, 0.18), 1 - day).lerp(RAIN, rain * 0.6));
    cu.uAlpha.value = 0.82 + rain * 0.15;
    return { day, sunDir };
  }
}
