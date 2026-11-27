// Analytic sky with sun/moon/stars, astronomical sun position, lighting, haze/fog and
// a PMREM environment map for physically based reflections on aircraft.
import * as THREE from 'three';
import { DEG, clamp, smooth, lerp } from '../core/geo';

export function sunPosition(utcHours: number, dayOfYear: number, lat: number, lon: number) {
  const decl = 23.44 * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365) * DEG;
  const solar = utcHours + lon / 15;
  const H = (solar - 12) * 15 * DEG, phi = lat * DEG;
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(clamp(sinEl, -1, 1));
  const az = Math.atan2(-Math.sin(H) * Math.cos(decl), Math.cos(phi) * Math.sin(decl) - Math.sin(phi) * Math.cos(decl) * Math.cos(H));
  // direction in world (x east, y up, z south)
  return { el: el / DEG, az: az / DEG, dir: new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)) };
}

const skyVert = /* glsl */`
varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const skyFrag = /* glsl */`
uniform vec3 uSun, uMoon, uZenith, uHorizon, uGlow, uGround; uniform float uNight, uCloud, uAlt, uFlash;
varying vec3 vDir;
float h3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
void main(){
  vec3 d = normalize(vDir);
  float up = d.y;
  float t = pow(clamp(up, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  // below horizon: haze into ground colour
  col = mix(col, uGround, smoothstep(0.0, -0.12, up));
  float sd = max(dot(d, uSun), 0.0);
  col += uGlow * (pow(sd, 6.0) * 0.45 + pow(sd, 60.0) * 0.6) * (1.0 - uCloud * 0.7);
  float disk = smoothstep(0.99955, 0.99975, sd) * (1.0 - uCloud);
  col += vec3(1.0, 0.95, 0.85) * disk * 20.0 * step(-0.02, uSun.y);
  // stars & moon
  if (uNight > 0.01 && up > -0.05) {
    vec3 sp = floor(d * 380.0);
    float st = step(0.9975, h3(sp)) * h3(sp + 7.0);
    col += vec3(st) * uNight * (1.0 - uCloud) * 1.6 * smoothstep(-0.05, 0.15, up);
    float md = max(dot(d, uMoon), 0.0);
    col += vec3(0.85, 0.88, 0.95) * (smoothstep(0.99965, 0.9998, md) * 2.5 + pow(md, 40.0) * 0.08) * uNight * (1.0 - uCloud * 0.8);
    // milky haze band
    col += vec3(0.05, 0.06, 0.09) * uNight * (1.0 - uCloud) * pow(1.0 - abs(dot(d, normalize(vec3(0.3, 0.6, 0.74)))), 8.0);
  }
  col += vec3(0.7, 0.75, 1.0) * uFlash;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  scene = new THREE.Scene();
  mesh: THREE.Mesh;
  sun = new THREE.DirectionalLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xbfd6ff, 0x5a5040, 0.8);
  fog = new THREE.FogExp2(0xcfe0f0, 0.00002);
  sunDir = new THREE.Vector3(0, 1, 0); moonDir = new THREE.Vector3(0, 1, 0);
  sunEl = 45; night = 0; daylight = 1;
  zenith = new THREE.Color(); horizon = new THREE.Color(); glow = new THREE.Color();
  private uni: Record<string, { value: any }>;
  private pmrem: THREE.PMREMGenerator; envRT: THREE.WebGLRenderTarget | null = null; private envKey = '';
  private envScene = new THREE.Scene();

  constructor(private renderer: THREE.WebGLRenderer) {
    this.uni = {
      uSun: { value: this.sunDir }, uMoon: { value: this.moonDir }, uZenith: { value: this.zenith }, uHorizon: { value: this.horizon },
      uGlow: { value: this.glow }, uGround: { value: new THREE.Color() }, uNight: { value: 0 }, uCloud: { value: 0 }, uAlt: { value: 0 }, uFlash: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.uni, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, depthTest: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    this.scene.add(this.mesh);
    const envMesh = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat);
    this.envScene.add(envMesh);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.sun.castShadow = true;
  }

  /** cloud: 0..1 overcast fraction; visM: visibility; alt: camera altitude m; flash: lightning 0..1 */
  update(sunDir: THREE.Vector3, cloud: number, visM: number, alt: number, flash: number, fogOverride?: { color: THREE.Color; density: number }) {
    this.sunDir.copy(sunDir);
    this.moonDir.set(-sunDir.x, Math.abs(sunDir.y) * 0.6 + 0.25, -sunDir.z).normalize();
    const el = Math.asin(clamp(sunDir.y, -1, 1)) / DEG; this.sunEl = el;
    const day = smooth(-6, 8, el); this.daylight = day;
    this.night = 1 - smooth(-10, 0, el);
    const golden = (1 - smooth(0, 14, el)) * smooth(-7, 1, el);
    const altF = smooth(2000, 14000, alt);
    // zenith
    this.zenith.setRGB(lerp(0.01, lerp(0.16, 0.05, altF), day), lerp(0.015, lerp(0.38, 0.2, altF), day), lerp(0.04, lerp(0.78, 0.6, altF), day));
    // horizon
    this.horizon.setRGB(lerp(0.02, 0.72, day), lerp(0.03, 0.82, day), lerp(0.06, 0.92, day));
    this.horizon.lerp(new THREE.Color(1.0, 0.55, 0.28), golden * 0.75);
    this.glow.setRGB(1.0, lerp(0.55, 0.85, smooth(0, 20, el)), lerp(0.3, 0.7, smooth(0, 20, el))).multiplyScalar(day);
    const grey = new THREE.Color().setRGB(0.55, 0.58, 0.62).multiplyScalar(lerp(0.04, 1, day));
    this.zenith.lerp(grey, cloud * 0.85); this.horizon.lerp(grey.clone().multiplyScalar(1.05), cloud * 0.7);
    this.uni.uGround.value.copy(this.horizon).multiplyScalar(0.55);
    this.uni.uNight.value = this.night; this.uni.uCloud.value = cloud; this.uni.uAlt.value = alt; this.uni.uFlash.value = flash;

    // lights
    const sunUp = smooth(-3, 4, el);
    this.sun.position.copy(sunDir).multiplyScalar(1000);
    const sc = new THREE.Color().setRGB(1.0, lerp(0.5, 0.96, smooth(0, 25, el)), lerp(0.25, 0.9, smooth(0, 25, el)));
    this.sun.color.copy(sc);
    this.sun.intensity = sunUp * lerp(2.3, 0.8, cloud) + flash * 4;
    if (this.night > 0.5 && sunUp < 0.05) { // moonlight
      this.sun.position.copy(this.moonDir).multiplyScalar(1000);
      this.sun.color.setRGB(0.55, 0.62, 0.85); this.sun.intensity = 0.12 * (1 - cloud * 0.7) + flash * 4;
    }
    this.hemi.color.copy(this.zenith).lerp(new THREE.Color(1, 1, 1), 0.35);
    this.hemi.groundColor.setRGB(0.32, 0.29, 0.24).multiplyScalar(lerp(0.05, 1, day));
    this.hemi.intensity = lerp(0.1, 0.62, day) + flash * 2;

    // fog / haze
    if (fogOverride) { this.fog.color.copy(fogOverride.color); this.fog.density = fogOverride.density; }
    else {
      const altFade = alt < 2500 ? 1 : Math.max(0.18, Math.exp(-(alt - 2500) / 7000));
      this.fog.density = (1.75 / Math.max(200, visM)) * altFade;
      this.fog.color.copy(this.horizon);
    }
    // environment for reflections
    const key = `${Math.round(el / 2)}|${Math.round(cloud * 5)}|${Math.round(altF * 3)}`;
    if (key !== this.envKey) {
      this.envKey = key;
      const old = this.envRT;
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
      old?.dispose();
    }
  }

  render(camera: THREE.PerspectiveCamera) {
    const c = (this as any)._cam ||= new THREE.PerspectiveCamera();
    c.fov = camera.fov; c.aspect = camera.aspect; c.near = 0.1; c.far = 10; c.updateProjectionMatrix();
    c.quaternion.copy(camera.getWorldQuaternion(new THREE.Quaternion())); c.position.set(0, 0, 0); c.updateMatrixWorld();
    this.renderer.render(this.scene, c);
  }
}
