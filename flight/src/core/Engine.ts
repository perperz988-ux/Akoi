// Renderer, scene graph and world systems shared by menus and flights.
import * as THREE from 'three';
import { Terrain } from '../world/Terrain';
import { Sky, sunPosition } from '../world/Sky';
import { Weather } from '../world/Weather';
import { AirportManager, lightUniforms } from '../world/Airport';
import { Scenery } from '../world/Scenery';
import { origin, clamp } from './geo';
import { settings } from '../game/Save';

export interface Quality { pixelRatio: number; shadows: number; splitK: number; maxZ: number; puffs: number; buildings: number; antialias: boolean; trees: boolean }
export const QUALITY: Record<string, Quality> = {
  low: { pixelRatio: 1, shadows: 0, splitK: 1.25, maxZ: 13, puffs: 500, buildings: 0.4, antialias: false, trees: false },
  medium: { pixelRatio: 1.25, shadows: 1024, splitK: 1.6, maxZ: 13, puffs: 1100, buildings: 0.7, antialias: false, trees: true },
  high: { pixelRatio: 1.75, shadows: 2048, splitK: 2.0, maxZ: 14, puffs: 1800, buildings: 1, antialias: true, trees: true },
  ultra: { pixelRatio: 2, shadows: 4096, splitK: 2.5, maxZ: 14, puffs: 2400, buildings: 1.3, antialias: true, trees: true },
};

export class Engine {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene();
  terrain = new Terrain(); sky: Sky; weather = new Weather(); airports = new AirportManager(); scenery: Scenery;
  camera: THREE.PerspectiveCamera;
  utcHours = 12; dayOfYear = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 0)) / 86400000); timeScale = 1;
  q: Quality = QUALITY.medium;
  private last = performance.now(); fps = 60; private fpsAcc = 0; private fpsN = 0;
  tick: ((dt: number) => void) | null = null; worldTime = 0;
  focus = new THREE.Vector3(); focusVel = new THREE.Vector3(); // point of interest (aircraft)
  private shadowTarget = new THREE.Object3D();
  constructor(public canvas: HTMLCanvasElement) {
    this.q = QUALITY[settings.quality] ?? QUALITY.medium;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.q.antialias, logarithmicDepthBuffer: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.sky = new Sky(this.renderer);
    this.scenery = new Scenery(this.terrain);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 900000);
    this.scene.fog = this.sky.fog;
    this.scene.add(this.terrain.group, this.airports.group, this.scenery.group, this.weather.group, this.sky.sun, this.sky.hemi, this.shadowTarget);
    this.sky.sun.target = this.shadowTarget;
    this.applyQuality();
    addEventListener('resize', () => this.resize()); this.resize();
    this.weather.onThunder = null;
    requestAnimationFrame(this.loop);
  }
  applyQuality() {
    this.q = QUALITY[settings.quality] ?? QUALITY.medium;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.q.pixelRatio * (window.devicePixelRatio > 1 ? 1 : 1)));
    this.renderer.shadowMap.enabled = this.q.shadows > 0;
    const s = this.sky.sun.shadow; s.mapSize.set(this.q.shadows || 512, this.q.shadows || 512); s.map?.dispose(); (s as any).map = null;
    s.bias = -0.0004; s.normalBias = 0.05;
    this.terrain.splitK = this.q.splitK; this.terrain.maxZ = this.q.maxZ;
    this.weather.setQuality(this.q.puffs); this.scenery.density = this.q.buildings; this.scenery.treesOn = this.q.trees && settings.trees;
    this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  get sunDir() { return sunPosition(this.utcHours, this.dayOfYear, origin.latOf(this.focus.z), origin.lonOf(this.focus.x)).dir; }
  setLocalTime(hour: number, lon: number) { this.utcHours = ((hour - lon / 15) % 24 + 24) % 24; }
  localTime(lon: number) { return ((this.utcHours + lon / 15) % 24 + 24) % 24; }

  private loop = (now: number) => {
    requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000; this.last = now; dt = clamp(dt, 0, 0.1);
    this.fpsAcc += dt; this.fpsN++; if (this.fpsAcc > 1) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }
    this.utcHours = (this.utcHours + dt * this.timeScale / 3600) % 24;
    this.tick?.(dt);
    this.updateWorld(dt);
    this.render();
  };

  updateWorld(dt: number) {
    const cam = this.camera.position;
    const camLat = origin.latOf(cam.z), camLon = origin.lonOf(cam.x);
    const sun = sunPosition(this.utcHours, this.dayOfYear, camLat, camLon).dir;
    const w = this.weather.cur;
    const alt = cam.y;
    const inCloud = this.weather.inCloud;
    let fogOverride: { color: THREE.Color; density: number } | undefined;
    const visM = w.visM * (alt > this.weather.cloudTopM && w.type === 'stratus' ? 6 : 1);
    if (inCloud > 0.02) {
      const base = new THREE.Color().setRGB(0.62, 0.65, 0.7).multiplyScalar(0.15 + this.sky.daylight * 0.85);
      fogOverride = { color: base.lerp(this.sky.horizon, 1 - inCloud), density: (1.75 / Math.max(25, 80 / Math.max(0.05, inCloud))) };
    }
    const cover = w.type === 'none' ? 0 : w.type === 'stratus' ? (alt < this.weather.cloudBaseM ? w.cover : w.cover * 0.15) : w.cover * 0.45;
    this.sky.update(sun, cover, visM, alt, this.weather.flash, fogOverride);
    this.terrain.uniforms.uNight.value = this.sky.night;
    this.terrain.uniforms.uSunDir.value.copy(sun);
    this.terrain.uniforms.uSkyCol.value.copy(this.sky.zenith); this.terrain.uniforms.uHorizon.value.copy(this.sky.horizon);
    this.terrain.uniforms.uSnow.value = w.snow > 0.3 ? 1 : (w.tempDev < -12 ? 0.6 : 0);
    this.terrain.uniforms.uWet.value = Math.max(w.rain, w.snow * 0.5);
    this.scene.environment = this.sky.envRT?.texture ?? null;
    this.scene.environmentIntensity = 0.12 + this.sky.daylight * 0.38;
    this.terrain.update(cam, camLat, camLon, dt);
    this.weather.update(dt, cam, sun, this.sky.daylight, this.focusVel, this.camera);
    this.scenery.night.value = this.sky.night;
    const gh = this.terrain.heightAt(camLat, camLon).h;
    this.scenery.update(cam, alt - gh);
    this.worldTime += dt;
    this.airports.update(dt, camLat, camLon, alt - gh, this.sky.night, w.windDir, w.windKt, this.worldTime);
    // shadows follow the focus
    const sd = this.sky.sun; const fp = this.focus;
    this.shadowTarget.position.copy(fp); sd.position.copy(fp).addScaledVector(this.sky.sunEl > 0 ? sun : this.sky.moonDir, 400);
    const sc = sd.shadow.camera as THREE.OrthographicCamera; const R = (this as any).shadowRadius ?? 60;
    if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 1200; sc.updateProjectionMatrix(); }
    sd.castShadow = this.q.shadows > 0 && this.sky.sunEl > -2;
    lightUniforms.uI.value = 0.18 + this.sky.night * 0.9; lightUniforms.uTime.value += dt; lightUniforms.uCam.value.copy(cam);
    lightUniforms.uFogD.value = this.sky.fog.density; lightUniforms.uScale.value = this.renderer.getPixelRatio() * innerHeight / 900;
  }
  render() {
    this.renderer.clear();
    this.sky.render(this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}
