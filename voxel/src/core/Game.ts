// Main game orchestration: render loop, world session lifecycle, interaction, survival rules, saving.
import * as THREE from 'three';
import { B, BX, COLOR_BLOCKS, STRIPPED, BLOCKS, CRACK_TILES, HEIGHT, L_SOLID, SHAPE_CROSS, SHAPE_CUBE, UNLOADED, blockDef, isLiquid, pickBoxes, ATLAS_CELL, ATLAS_COLS, ATLAS_SIZE, ATLAS_TILE } from '../world/Blocks';
import { World, Stack } from '../world/World';
import { BIOME, BIOME_NAMES, SEA, seedFromString } from '../world/Generator';
import { buildAtlas, AtlasInfo } from '../gfx/Atlas';
import { makeChunkMaterials, shared } from '../gfx/Materials';
import { Sky } from '../gfx/Sky';
import { Particles } from '../gfx/Particles';
import { Audio } from '../audio/Audio';
import { Input } from './Input';
import { Settings, loadSettings, saveSettings } from './Settings';
import { Player } from '../game/Player';
import { MobManager, MOB_TYPES, Mob, rayBox } from '../game/Mobs';
import { DropManager, blockGeometry } from '../game/Drops';
import { I, item, itemCanvas, maxStack, setTileCanvasSource, toolMatches } from '../game/Items';
import { Station, Recipe, craft as doCraft } from '../game/Inventory';
import { overlapsSolid } from '../game/Physics';
import { buildAvatar, Model } from '../game/Models';
import * as Store from '../save/Storage';
import type { WorldMeta } from '../save/Storage';

export type GameState = 'menu' | 'loading' | 'play' | 'pause' | 'inventory' | 'dead';
export interface Rules { daylightCycle: boolean; mobSpawning: boolean; keepInventory: boolean; difficulty: number; weatherCycle: boolean }
export interface Target { x: number; y: number; z: number; nx: number; ny: number; nz: number; id: number; t: number }

const DREAM_ZONES = ['Mistmeadow', 'Bloomwood', 'Crystal Spires'];
const TGLASS = new Set(Object.values(COLOR_BLOCKS.tglass));
export const DAY_LENGTH = 960; // seconds per full day/night cycle

export interface UIHooks {
  showScreen(s: GameState): void;
  toast(msg: string): void;
  openCrate(items: (Stack | null)[], x: number, y: number, z: number): void;
  openInventory(station?: Station): void;
  onDeath(msg: string): void;
  refreshHud(): void;
  toggleHud(): void;
  setLoading(p: number, msg: string): void;
  openCreative(): void;
}

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  handScene = new THREE.Scene();
  handCam = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
  atlas: AtlasInfo;
  mats: ReturnType<typeof makeChunkMaterials>;
  sky: Sky;
  particles: Particles;
  audio = new Audio();
  input: Input;
  settings: Settings;
  state: GameState = 'menu';
  world: World | null = null;
  meta: WorldMeta | null = null;
  player = new Player();
  mobs: MobManager;
  drops: DropManager;
  ui!: UIHooks;
  time = DAY_LENGTH * 0.05;
  rain = 0; rainTarget = 0; storm = false; weatherTimer = 300;
  rules: Rules = { daylightCycle: true, mobSpawning: true, keepInventory: false, difficulty: 1, weatherCycle: true };
  target: Target | null = null;
  targetMob: Mob | null = null;
  breakProgress = 0;
  private breakKey = '';
  private breakSoundT = 0;
  private creativeBreakCd = 0;
  private attackCd = 0;
  private crack: THREE.Mesh;
  private outline: THREE.LineSegments;
  private hand = new THREE.Group();
  private handItem: THREE.Object3D | null = null;
  private handItemId = -2;
  private handMat: THREE.MeshBasicMaterial;
  private swing = 0;
  private avatar: Model;
  viewMode = 0;
  private last = performance.now();
  private saveTimer = 0;
  private playTimeAcc = 0;
  private menuWorld: World | null = null;
  private menuAngle = 0;
  private fpsFrames = 0; private fpsTime = 0; fps = 0;
  private dynScale = 1;
  private frameTimes: number[] = [];
  private skip = false;
  biome = '';
  private torchTimer = 0;
  private placeCd = 0;
  loadingTarget = { x: 0, z: 0, fresh: false, arrive: false };
  dim = 0;
  private fuses: { x: number; y: number; z: number; t: number }[] = [];
  private arrows: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; mesh: THREE.Mesh }[] = [];
  private arrowGeo = new THREE.BoxGeometry(0.06, 0.06, 0.6);
  private arrowMat = new THREE.MeshLambertMaterial({ color: 0xb08a5a });
  fishing: { x: number; y: number; z: number; t: number; bob: THREE.Mesh } | null = null;
  private travelling = false;
  private loadingT = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.settings = loadSettings();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.settings.antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.enabled = true;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.08, 700);
    this.scene.add(this.camera);
    this.atlas = buildAtlas();
    setTileCanvasSource(this.atlas.tileCanvas);
    this.mats = makeChunkMaterials(this.atlas.texture);
    this.sky = new Sky(this.scene);
    this.particles = new Particles(this.scene);
    this.input = new Input(canvas, this.settings);
    this.input.onLockLost = () => { if (this.state === 'play') this.setState('pause'); };

    const mctx = {
      world: null as any as World,
      player: {
        x: 0, y: 0, z: 0, eye: 1.62, sneaking: false, heldId: -1, alive: true, survival: true,
        hurt: (d: number, fx: number, fz: number, src: string) => this.player.hurt(d, fx, fz, src),
      },
      dayFactor: 1, difficulty: 1, spawning: true,
      drop: (x: number, y: number, z: number, id: number, n: number) => this.spawnDrop(x, y, z, id, n),
      fx: this.particles,
      sound: (k: string, ev: any, d: number) => this.audio.creature(k, ev, d),
    };
    this.mobs = new MobManager(this.scene, mctx);
    this.drops = new DropManager(this.scene, this.atlas.texture, () => this.world!);

    // break overlay + outline
    const cg = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const cm = new THREE.MeshBasicMaterial({ map: this.atlas.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, opacity: 0.85 });
    this.crack = new THREE.Mesh(cg, cm);
    this.crack.visible = false;
    this.scene.add(this.crack);
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.outline = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x101418, transparent: true, opacity: 0.55, fog: false }));
    this.outline.visible = false;
    this.scene.add(this.outline);

    // first-person hand
    this.handMat = new THREE.MeshBasicMaterial({ vertexColors: false, color: 0xffffff });
    this.handScene.add(this.hand);
    this.handScene.add(this.handCam);
    this.avatar = buildAvatar();
    this.avatar.root.visible = false;
    this.scene.add(this.avatar.root);

    // world callbacks bound later
    this.player.onStep = (x, y, z) => {
      if (!this.world) return;
      const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      if (id !== 0 && id !== UNLOADED) this.audio.block(blockDef(id).mat, 'step', 0.8);
    };
    this.player.onHurt = () => { this.audio.hurt(); if (this.settings.haptics) navigator.vibrate?.(40); };
    this.player.onDeath = (src) => this.handleDeath(src);
    this.player.onSplash = () => { this.audio.splash(); this.particles.splash(this.player.x, this.player.y + 0.5, this.player.z); };

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.save(); if (this.state === 'play') this.setState('pause'); } });
    window.addEventListener('pagehide', () => this.save());
    this.resize();
    this.applySettings();
  }

  // ---------------------------------------------------------------- lifecycle
  start() {
    this.startMenuWorld();
    const loop = () => { requestAnimationFrame(loop); this.frame(); };
    requestAnimationFrame(loop);
  }

  private startMenuWorld() {
    if (this.menuWorld) return;
    const seed = seedFromString('akoi-vista');
    this.menuWorld = new World({ scene: this.scene, seed, worldId: null, materials: this.mats, radius: Math.min(5, this.settings.renderDistance), lodStart: 3, fancyLeaves: this.settings.fancyLeaves, shadows: false });
    this.menuWorld.init();
    const sp = this.menuWorld.gen.findSpawn();
    (this.menuWorld as any)._spawn = sp;
    this.time = DAY_LENGTH * 0.08;
  }
  private stopMenuWorld() { if (this.menuWorld) { this.menuWorld.dispose(); this.menuWorld = null; } }

  setState(s: GameState) {
    this.state = s;
    this.input.enabled = s === 'play';
    if (s === 'play') { this.input.requestLock(); } else this.input.releaseLock();
    this.input.touchBreak = false; this.input.touchJump = false;
    this.ui?.showScreen(s);
  }

  async createWorld(name: string, seedText: string, mode: 'survival' | 'creative', difficulty: number) {
    const st = seedText.trim() || String(Math.floor(Math.random() * 2147483647));
    const meta: WorldMeta = {
      id: 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      name: name.trim() || 'New World', seedText: st, seed: seedFromString(st), mode,
      created: Date.now(), lastPlayed: Date.now(), playTime: 0, player: null,
      state: { time: DAY_LENGTH * 0.05, rules: { ...this.rules, difficulty } },
    };
    await Store.putWorld(meta);
    await this.enterWorld(meta);
  }

  async enterWorld(meta: WorldMeta) {
    this.audio.unlock();
    this.stopMenuWorld();
    this.closeWorld();
    this.meta = meta;
    this.setState('loading');
    this.ui.setLoading(0, 'Shaping terrain…');
    this.dim = (meta.state && meta.state.dim) || 0;
    const world = await this.makeWorld(this.dim);
    this.player = Object.assign(new Player(), { onStep: this.player.onStep, onHurt: this.player.onHurt, onDeath: this.player.onDeath, onSplash: this.player.onSplash });
    this.player.mode = meta.mode;
    const st = meta.state || {};
    this.time = st.time ?? DAY_LENGTH * 0.05;
    this.rules = { daylightCycle: true, mobSpawning: true, keepInventory: false, difficulty: 1, weatherCycle: true, ...(st.rules || {}) };
    this.rain = this.rainTarget = st.rain ?? 0; this.storm = !!st.storm;
    if (meta.player) { this.player.load(meta.player); this.player.mode = meta.mode; this.loadingTarget = { x: this.player.x, z: this.player.z, fresh: false, arrive: false }; }
    else {
      const sp = world.gen.findSpawn();
      this.player.spawn = { ...sp };
      this.player.setPos(sp.x, sp.y + 1, sp.z);
      this.loadingTarget = { x: sp.x, z: sp.z, fresh: true, arrive: false };
    }
    this.mobs.clear(); this.drops.clear();
    this.viewMode = 0;
    this.loadingT = 0;
    this.handItemId = -2;
  }

  private async makeWorld(dim: number) {
    const s = this.settings, meta = this.meta!;
    const world = new World({ scene: this.scene, seed: meta.seed, worldId: dim ? `${meta.id}@${dim}` : meta.id, materials: this.mats, radius: s.renderDistance, lodStart: s.lodDistance, fancyLeaves: s.fancyLeaves, shadows: s.shadows, dim });
    await world.init();
    this.world = world;
    world.onDrop = (x, y, z, id, m) => { for (const st of this.blockDrops(id, m, null)) this.spawnDrop(x + 0.5, y + 0.5, z + 0.5, st.id, st.count, st.dur); };
    world.onCrateSpill = (x, y, z, items) => { for (const st of items) this.spawnDrop(x + 0.5, y + 0.5, z + 0.5, st.id, st.count, st.dur); };
    (this.mobs as any).ctx.world = world;
    return world;
  }

  /** Travel between the Overworld (0), Celestia (1) and the Ashen Wastes (2). */
  async travel(dim: number) {
    if (dim === this.dim || this.travelling || !this.meta) return;
    this.travelling = true;
    const p = this.player, st = this.meta.state || (this.meta.state = {});
    if (this.dim === 0) st.owPos = { x: p.x, y: p.y, z: p.z };
    await this.save();
    this.closeWorld();
    this.cancelFishing();
    this.dim = dim;
    st.dim = dim;
    this.setState('loading');
    this.ui.setLoading(0, dim === 1 ? 'Rising to Celestia…' : dim === 2 ? 'Descending into the Ashen Wastes…' : dim === 3 ? 'Drifting into Dreamhollow…' : 'Returning home…');
    await this.makeWorld(dim);
    if (dim === 0 && st.owPos) { p.setPos(st.owPos.x, st.owPos.y, st.owPos.z); this.loadingTarget = { x: p.x, z: p.z, fresh: false, arrive: false }; }
    else { const x = Math.floor(p.x) + 0.5, z = Math.floor(p.z) + 0.5; p.setPos(x, 90, z); this.loadingTarget = { x, z, fresh: false, arrive: true }; }
    this.loadingT = 0;
    this.travelling = false;
  }

  /** On arrival in another dimension: find solid ground (or build a platform) and place a return rift. */
  private arriveSafely() {
    const w = this.world!, p = this.player;
    const bx = Math.floor(p.x), bz = Math.floor(p.z);
    let spot: [number, number, number] | null = null;
    for (let r = 0; r <= 24 && !spot; r += 2) for (let dx = -r; dx <= r && !spot; dx += 2) for (let dz = -r; dz <= r && !spot; dz += 2) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = bx + dx, z = bz + dz, y = w.surfaceY(x, z);
      if (y < 4 || y > HEIGHT - 4) continue;
      const top = w.getBlock(x, y, z);
      if (!L_SOLID[top] || isLiquid(top)) continue;
      if (w.getBlock(x, y + 1, z) !== B.AIR || w.getBlock(x, y + 2, z) !== B.AIR) continue;
      spot = [x, y + 1, z];
    }
    if (!spot) {
      const y = 70, mat = this.dim === 1 ? B.SKYSTONE : this.dim === 3 ? BX.dreamstone : B.BASALT;
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { w.setBlock(bx + dx, y - 1, bz + dz, mat); for (let dy = 0; dy < 3; dy++) w.setBlock(bx + dx, y + dy, bz + dz, B.AIR); }
      spot = [bx, y, bz];
    }
    p.setPos(spot[0] + 0.5, spot[1], spot[2] + 0.5);
    const rift = this.dim === 1 ? B.SKY_RIFT : this.dim === 3 ? BX.dream_rift : B.ASH_RIFT;
    let placed = false;
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1]]) {
      const x = spot[0] + dx, z = spot[2] + dz, y = spot[1];
      if (this.replaceable(w.getBlock(x, y, z)) && L_SOLID[w.getBlock(x, y - 1, z)]) { w.setBlock(x, y, z, rift); placed = true; break; }
    }
    if (!placed) { w.setBlock(spot[0] + 2, spot[1] - 1, spot[2], B.SKYSTONE); w.setBlock(spot[0] + 2, spot[1], spot[2], rift); }
    this.ui.toast(this.dim === 1 ? 'Celestia — use the rift to return home' : this.dim === 3 ? 'Dreamhollow — use the rift to return home' : 'Ashen Wastes — use the rift to return home');
  }

  private finishLoading() {
    const w = this.world!;
    if (this.loadingTarget.arrive) { this.arriveSafely(); this.save(); this.setState('play'); return; }
    if (this.loadingTarget.fresh) {
      const x = Math.floor(this.player.x), z = Math.floor(this.player.z);
      const y = w.surfaceY(x, z) + 1;
      this.player.setPos(this.player.x, Math.max(y, SEA + 1), this.player.z);
      this.player.spawn = { x: this.player.x, y: this.player.y, z: this.player.z };
      this.save();
    }
    this.setState('play');
    if (this.dim !== 0) return;
    this.ui.toast(this.meta!.mode === 'creative' ? 'Creative mode — double-tap jump to fly' : 'Gather wood: hold BREAK on a tree trunk');
  }

  closeWorld() {
    if (this.world) { this.world.dispose(); this.world = null; }
    this.mobs.clear(); this.drops.clear();
    this.target = null; this.targetMob = null;
  }

  async exitToMenu() {
    await this.save();
    this.closeWorld();
    this.meta = null;
    this.avatar.root.visible = false;
    this.hand.visible = false;
    this.startMenuWorld();
    this.setState('menu');
  }

  async save() {
    if (!this.world || !this.meta || this.state === 'loading') return;
    const m = this.meta;
    m.player = this.player.serialize();
    m.mode = this.player.mode;
    m.state = { ...(m.state || {}), time: this.time, rules: this.rules, rain: this.rainTarget, storm: this.storm, dim: this.dim };
    m.lastPlayed = Date.now();
    m.playTime += this.playTimeAcc; this.playTimeAcc = 0;
    try { await Store.putWorld(m); await this.world.saveAll(); } catch (e) { console.warn('save failed', e); }
  }

  // ---------------------------------------------------------------- settings
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.handCam.aspect = w / h; this.handCam.updateProjectionMatrix();
    this.applyPixelRatio();
  }
  private applyPixelRatio() {
    const base = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(Math.max(0.4, base * this.settings.resolution * this.dynScale));
  }
  applySettings() {
    const s = this.settings;
    saveSettings(s);
    this.camera.fov = s.fov; this.camera.updateProjectionMatrix();
    this.dynScale = 1;
    this.applyPixelRatio();
    this.renderer.shadowMap.enabled = s.shadows;
    this.sky.setShadows(s.shadows, s.shadowSize, Math.min(64, 24 + s.renderDistance * 3));
    this.sky.setCloudsVisible(s.clouds);
    this.particles.density = s.particles;
    shared.uMinLight.value = 0.02 + s.brightness * 0.12;
    this.audio.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume);
    this.world?.setQuality(s.renderDistance, s.lodDistance, s.fancyLeaves, s.shadows);
    this.mats.opaque.needsUpdate = true; this.mats.cutout.needsUpdate = true;
  }

  // ---------------------------------------------------------------- frame
  private frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    if (this.settings.targetFps === 30 && dt < 1 / 32) return; // frame cap for battery saving
    this.last = now;
    dt = Math.min(dt, 0.05);
    this.fpsFrames++; this.fpsTime += dt;
    if (this.fpsTime >= 0.5) { this.fps = Math.round(this.fpsFrames / this.fpsTime); this.fpsFrames = 0; this.fpsTime = 0; }
    this.dynamicResolution(dt);
    this.input.update(dt);
    shared.uTime.value += dt;

    if (this.state === 'menu') this.updateMenu(dt);
    else if (this.state === 'loading') this.updateLoading(dt);
    else if (this.world) {
      if (this.state !== 'pause') this.updateGame(dt);
      else this.updateCameraAndSky(0);
    }
    this.render();
    this.audio.update(dt);
    if (this.state === 'play' || this.state === 'inventory' || this.state === 'dead') this.ui.refreshHud();
  }

  private dynamicResolution(dt: number) {
    if (!this.settings.performanceMode) { if (this.dynScale !== 1) { this.dynScale = 1; this.applyPixelRatio(); } return; }
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 60) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes = [];
    const target = 1 / this.settings.targetFps;
    let ns = this.dynScale;
    if (avg > target * 1.2) ns = Math.max(0.55, ns - 0.1);
    else if (avg < target * 1.05 && ns < 1) ns = Math.min(1, ns + 0.05);
    if (ns !== this.dynScale) { this.dynScale = ns; this.applyPixelRatio(); }
  }

  private render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if ((this.state === 'play' || this.state === 'inventory') && this.viewMode === 0 && this.world) {
      r.clearDepth();
      r.render(this.handScene, this.handCam);
    }
  }

  private updateMenu(dt: number) {
    const w = this.menuWorld;
    if (!w) return;
    const sp = (w as any)._spawn || { x: 0, y: 70, z: 0 };
    this.menuAngle += dt * 0.04;
    const R = 34;
    const cx = sp.x + Math.cos(this.menuAngle) * R, cz = sp.z + Math.sin(this.menuAngle) * R;
    w.update(dt, sp.x, sp.z);
    this.camera.position.set(cx, Math.max(sp.y + 22, SEA + 20), cz);
    this.camera.lookAt(sp.x, sp.y + 4, sp.z);
    this.camera.updateMatrixWorld();
    this.time += dt * 2;
    this.sky.update(dt, (this.time / DAY_LENGTH) % 1, 0, this.camera, Math.max(64, w.renderRadius * 16), false, 0);
    this.particles.update(dt, this.camera.position, 0, false, () => -999);
    w.updateVisibility(this.camera);
  }

  private updateLoading(dt: number) {
    const w = this.world;
    if (!w) return;
    this.loadingT += dt;
    const { x, z } = this.loadingTarget;
    w.update(dt, x, z);
    const st = w.stats();
    const need = 9;
    let have = 0;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const c = w.getChunk(cx + dx, cz + dz); if (c && c.meshLod >= 0) have++; }
    this.ui.setLoading(Math.min(1, (have + Math.min(st.chunks, 25) / 25 * 3) / (need + 3)), have < need ? 'Generating terrain…' : 'Lighting the world…');
    this.camera.position.set(x, this.player.y + 1.6, z);
    this.sky.update(dt, (this.time / DAY_LENGTH) % 1, this.rain, this.camera, 64, false, 0);
    if (w.isAreaReady(x, z, 1) && this.loadingT > 0.3) this.finishLoading();
  }

  // ---------------------------------------------------------------- gameplay
  private updateGame(dt: number) {
    const w = this.world!, p = this.player, inp = this.input;
    const playing = this.state === 'play';
    if (playing) {
      const [lx, ly] = inp.takeLook();
      p.yaw -= lx; p.pitch = THREE.MathUtils.clamp(p.pitch - ly, -1.55, 1.55);
      this.handleActions();
    } else inp.takeLook();
    this.playTimeAcc += dt;

    p.update(dt, inp, w, { autoJump: this.settings.autoJump && inp.usingTouch, difficulty: this.rules.difficulty });
    w.update(dt, p.x, p.z);
    if (this.rules.daylightCycle) this.time += dt;
    this.updateWeather(dt);

    const mc = (this.mobs as any).ctx;
    mc.player.x = p.x; mc.player.y = p.y; mc.player.z = p.z; mc.player.eye = p.eye; mc.player.sneaking = p.sneaking;
    mc.player.heldId = p.inv.held?.id ?? -1; mc.player.alive = p.alive; mc.player.survival = !p.creative;
    mc.dayFactor = this.sky.dayFactor; mc.difficulty = this.rules.difficulty; mc.spawning = this.rules.mobSpawning;
    this.mobs.update(dt);
    this.drops.update(dt, p.x, p.y, p.z, p.alive, (s) => {
      const left = p.inv.add(s.id, s.count, s.dur);
      const taken = s.count - left;
      if (taken > 0) this.audio.pickup();
      return taken;
    });

    this.updateCameraAndSky(dt);
    this.updateTargeting(dt);
    this.updateHand(dt);
    this.updateFuses(dt);
    this.updateArrows(dt);
    this.updateFishing(dt);
    if (this.dim === 1 && p.y < 2 && p.alive && !this.travelling) { this.ui.toast('You fell from Celestia…'); this.travel(0); }
    (this.mobs as any).ctx.dim = this.dim;

    // torch flames near the player
    this.torchTimer -= dt;
    if (this.torchTimer <= 0) {
      this.torchTimer = 0.12;
      const pcx = Math.floor(p.x / 16), pcz = Math.floor(p.z / 16);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const c = w.getChunk(pcx + dx, pcz + dz);
        if (!c) continue;
        for (const i of c.torches) {
          const x = c.cx * 16 + (i & 15), z = c.cz * 16 + ((i >> 4) & 15), y = i >> 8;
          if (Math.abs(x - p.x) > 20 || Math.abs(z - p.z) > 20 || Math.random() > 0.6) continue;
          const m = c.meta[i];
          const off = m === 1 ? [0.88, 0.85, 0.5] : m === 2 ? [0.12, 0.85, 0.5] : m === 3 ? [0.5, 0.85, 0.88] : m === 4 ? [0.5, 0.85, 0.12] : [0.5, 0.66, 0.5];
          this.particles.flame(x + off[0], y + off[1], z + off[2]);
        }
      }
    }

    // ambience
    const underground = this.undergroundFactor();
    this.audio.underground = underground > 0.6;
    this.audio.night = this.sky.dayFactor < 0.3;
    this.audio.setAmbience(this.rain * (1 - underground), (p.y > SEA + 40 ? 1 : 0.3) * (1 - underground));

    // autosave
    this.saveTimer += dt;
    if (this.saveTimer > 30) { this.saveTimer = 0; this.save(); }
  }

  private undergroundFactor() {
    if (!this.world) return 0;
    const p = this.player;
    const l = this.world.getLight(Math.floor(p.x), Math.floor(p.y + p.eye), Math.floor(p.z));
    return 1 - Math.min(1, (l >> 4) / 10);
  }

  private updateWeather(dt: number) {
    if (this.rules.weatherCycle) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        this.weatherTimer = 240 + Math.random() * 420;
        const r = Math.random();
        this.rainTarget = r < 0.6 ? 0 : 1; this.storm = r > 0.88;
      }
    }
    this.rain += (this.rainTarget - this.rain) * Math.min(1, dt * 0.3);
    if (this.storm && this.rain > 0.6 && Math.random() < dt * 0.05) { this.sky.flash = 0.8; setTimeout(() => this.audio.thunder(), 300 + Math.random() * 1500); }
  }

  setWeather(kind: 'clear' | 'rain' | 'storm') {
    this.rainTarget = kind === 'clear' ? 0 : 1; this.storm = kind === 'storm';
    this.weatherTimer = 600;
  }

  private updateCameraAndSky(dt: number) {
    const p = this.player, w = this.world!;
    const cam = this.camera;
    const eyeY = p.y + p.eye;
    const bobAmt = this.settings.viewBobbing && p.body.onGround && !p.flying ? Math.min(1, Math.hypot(p.body.vx, p.body.vz) / 4) : 0;
    const bob = Math.sin(p.bob * 2) * 0.05 * bobAmt, bobX = Math.cos(p.bob) * 0.03 * bobAmt;
    const dir = new THREE.Vector3(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
    const eye = new THREE.Vector3(p.x, eyeY, p.z);
    if (this.viewMode === 0) {
      cam.position.set(p.x + bobX * Math.cos(p.yaw), eyeY + bob, p.z - bobX * Math.sin(p.yaw));
      cam.lookAt(cam.position.clone().add(dir));
      this.avatar.root.visible = false;
    } else {
      const back = this.viewMode === 1 ? dir.clone().multiplyScalar(-1) : dir.clone();
      let d = 4;
      for (let t = 0.3; t <= 4; t += 0.2) {
        const q = eye.clone().addScaledVector(back, t);
        if (L_SOLID[w.getBlock(Math.floor(q.x), Math.floor(q.y), Math.floor(q.z))] && w.getBlock(Math.floor(q.x), Math.floor(q.y), Math.floor(q.z)) !== UNLOADED) { d = Math.max(0.3, t - 0.35); break; }
      }
      cam.position.copy(eye).addScaledVector(back, d);
      cam.lookAt(this.viewMode === 1 ? eye.clone().add(dir) : eye);
      this.updateAvatar(dt);
    }
    cam.updateMatrixWorld();
    const camBlock = w.getBlock(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z));
    const underwater = camBlock === B.WATER;
    const biome = this.dim ? -1 : w.gen.column(Math.floor(p.x), Math.floor(p.z)).biome;
    this.biome = this.dim === 1 ? 'Celestia' : this.dim === 2 ? 'Ashen Wastes' : this.dim === 3 ? DREAM_ZONES[w.gen.dreamZone(Math.floor(p.x), Math.floor(p.z))] : BIOME_NAMES[biome];
    const snowy = biome === BIOME.TUNDRA || (biome === BIOME.MOUNTAINS && p.y > SEA + 45);
    const desert = biome === BIOME.DESERT;
    const rain = desert || this.dim ? 0 : this.rain;
    this.sky.dim = this.dim;
    const ug = this.undergroundFactor();
    this.sky.update(dt, this.dim === 3 ? 0.48 : (this.time / DAY_LENGTH) % 1, rain, cam, Math.max(48, w.renderRadius * 16 - 8), underwater, ug);
    if (this.state !== 'pause') this.particles.update(dt, cam.position, rain * (1 - ug), snowy, (x, z) => w.surfaceY(Math.floor(x), Math.floor(z)));
    (this as any)._underwater = underwater;
    (this as any)._inMagma = camBlock === B.MAGMA;
    w.updateVisibility(cam);
    // held light source illuminates surroundings
    const held = p.inv.held;
    const lightItem = held && (held.id === B.TORCH || held.id === B.GLOWCAP || held.id === B.LUMEN_LAMP || held.id === B.GLOWSHARD_ORE || held.id === I.glowshard || held.id === B.LANTERN || held.id === B.CRYSTAL_SHARD || held.id === B.GLOW_VINE);
    shared.uHandLight.value += ((lightItem ? 0.85 : 0) - shared.uHandLight.value) * Math.min(1, dt * 8 || 1);
    shared.uHandPos.value.set(p.x, eyeY, p.z);
  }

  private updateAvatar(dt: number) {
    const p = this.player, a = this.avatar;
    a.root.visible = true;
    a.root.position.set(p.x, p.y, p.z);
    a.root.rotation.y = p.yaw + Math.PI;
    const sp = Math.hypot(p.body.vx, p.body.vz);
    const sw = Math.sin(p.walkDist * 3) * Math.min(1, sp / 3);
    a.legs[0].rotation.x = sw * 0.8; a.legs[1].rotation.x = -sw * 0.8;
    a.arms[0].rotation.x = -sw * 0.6 - (this.swing > 0 ? Math.sin(this.swing * Math.PI) * 1.4 : 0); a.arms[1].rotation.x = sw * 0.6;
    if (a.head) a.head.rotation.x = -p.pitch * 0.7;
    a.body.position.y = p.sneaking ? -0.2 : 0;
    const l = this.world!.getLight(Math.floor(p.x), Math.floor(p.y + 1), Math.floor(p.z));
    a.mat.color.setScalar(Math.max(((l >> 4) / 15) ** 2 * (0.3 + 0.7 * this.sky.dayFactor), ((l & 15) / 15) ** 1.7) * 0.9 + 0.1);
    void dt;
  }

  // ---------------------------------------------------------------- interaction
  private eyeRay(): { o: THREE.Vector3; d: THREE.Vector3 } {
    const p = this.player;
    const o = new THREE.Vector3(p.x, p.y + p.eye, p.z);
    let d: THREE.Vector3;
    if (this.input.aim && this.settings.aimMode === 'touch') {
      const v = new THREE.Vector3(this.input.aim.x, this.input.aim.y, 0.5).unproject(this.camera);
      d = v.sub(this.camera.position).normalize();
      if (this.viewMode !== 0) d = new THREE.Vector3(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
    } else d = new THREE.Vector3(-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch));
    return { o, d };
  }

  get reach() { return this.player.creative ? 7 : 5; }

  raycast(o: THREE.Vector3, d: THREE.Vector3, maxD: number, liquids = false): Target | null {
    const w = this.world!;
    let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
    const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
    const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
    let tmx = sx > 0 ? (x + 1 - o.x) * tdx : sx < 0 ? (o.x - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - o.y) * tdy : sy < 0 ? (o.y - y) * tdy : Infinity;
    let tmz = sz > 0 ? (z + 1 - o.z) * tdz : sz < 0 ? (o.z - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 64 && t <= maxD; i++) {
      const id = w.getBlock(x, y, z);
      if (id === UNLOADED) return null;
      if (id !== 0) {
        if (isLiquid(id)) {
          if (liquids && w.getMeta(x, y, z) === 0) return { x, y, z, nx, ny, nz, id, t };
        } else if (blockDef(id).hardness >= 0 || this.player.creative) {
          if (BLOCKS[id].shape === SHAPE_CUBE) return { x, y, z, nx, ny, nz, id, t };
          for (const bx of pickBoxes(id, w.getMeta(x, y, z))) {
            const ht = rayBox(o.x, o.y, o.z, d.x, d.y, d.z, x + bx[0] / 16, y + bx[1] / 16, z + bx[2] / 16, x + bx[3] / 16, y + bx[4] / 16, z + bx[5] / 16);
            if (ht !== null && ht <= maxD) return { x, y, z, nx, ny, nz, id, t: ht };
          }
        }
      }
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
      if (y < 0 || y >= HEIGHT) return null;
    }
    return null;
  }

  private updateTargeting(dt: number) {
    const p = this.player, w = this.world!;
    this.creativeBreakCd -= dt; this.attackCd -= dt; this.swing = Math.max(0, this.swing - dt * 3.5); this.placeCd -= dt;
    if (!p.alive || this.state !== 'play') { this.outline.visible = false; this.crack.visible = false; this.breakProgress = 0; return; }
    const { o, d } = this.eyeRay();
    const hit = this.raycast(o, d, this.reach);
    const mh = this.mobs.raycast(o.x, o.y, o.z, d.x, d.y, d.z, this.reach - 1);
    this.targetMob = mh && (!hit || mh.t < hit.t) ? mh.mob : null;
    this.target = this.targetMob ? null : hit;
    if (this.target) {
      const t = this.target;
      const boxes = BLOCKS[t.id].shape === SHAPE_CUBE ? [[0, 0, 0, 16, 16, 16]] : pickBoxes(t.id, w.getMeta(t.x, t.y, t.z));
      const b = boxes[0];
      this.outline.visible = true;
      this.outline.scale.set((b[3] - b[0]) / 16 + 0.004, (b[4] - b[1]) / 16 + 0.004, (b[5] - b[2]) / 16 + 0.004);
      this.outline.position.set(t.x + (b[0] + b[3]) / 32, t.y + (b[1] + b[4]) / 32, t.z + (b[2] + b[5]) / 32);
    } else this.outline.visible = false;

    // breaking
    const held = p.inv.held;
    if (this.input.breakHeld && this.target && !this.targetMob) {
      const t = this.target;
      const key = `${t.x},${t.y},${t.z}`;
      if (key !== this.breakKey) { this.breakKey = key; this.breakProgress = 0; }
      if (p.creative) {
        if (this.creativeBreakCd <= 0) { this.breakBlock(t); this.creativeBreakCd = 0.22; }
      } else {
        const bt = this.breakTime(t.id, held);
        this.breakProgress += bt <= 0 ? 1 : dt / bt;
        this.swing = Math.max(this.swing, 0.6);
        this.breakSoundT -= dt;
        if (this.breakSoundT <= 0) { this.breakSoundT = 0.25; this.audio.block(blockDef(t.id).mat, 'hit'); this.particles.burst(t.x + 0.5 + t.nx * 0.5, t.y + 0.5 + t.ny * 0.5, t.z + 0.5 + t.nz * 0.5, this.blockColor(t.id), 2); }
        if (this.breakProgress >= 1) { this.breakBlock(t); this.breakProgress = 0; this.breakKey = ''; }
      }
    } else {
      this.breakProgress = 0; this.breakKey = '';
      if (this.input.breakHeld && this.targetMob && this.attackCd <= 0) this.attack();
    }
    if (this.breakProgress > 0 && this.target) {
      const stage = Math.min(7, Math.floor(this.breakProgress * 8));
      const tile = CRACK_TILES[stage];
      const g = this.crack.geometry as THREE.BufferGeometry;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const TS = ATLAS_TILE / ATLAS_SIZE, PAD = (ATLAS_CELL - ATLAS_TILE) / 2 / ATLAS_SIZE, CS = ATLAS_CELL / ATLAS_SIZE;
      const u0 = (tile % ATLAS_COLS) * CS + PAD, v0 = Math.floor(tile / ATLAS_COLS) * CS + PAD;
      const base = [[0, 1], [1, 1], [0, 0], [1, 0]];
      for (let i = 0; i < uv.count; i++) { const bb = base[i % 4]; uv.setXY(i, u0 + bb[0] * TS, v0 + (1 - bb[1]) * TS); }
      uv.needsUpdate = true;
      this.crack.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
      this.crack.visible = true;
    } else this.crack.visible = false;
  }

  blockColor(id: number): [number, number, number] { return this.atlas.avgColor(BLOCKS[id]?.tex[2] ?? 0); }

  breakTime(id: number, held: Stack | null): number {
    const d = blockDef(id);
    if (d.hardness < 0) return Infinity;
    if (d.hardness === 0) return 0;
    const tool = held ? item(held.id).tool : undefined;
    const correct = !!tool && toolMatches(tool.type, d.tool);
    const harvest = this.canHarvest(id, held);
    let t = d.hardness * (harvest ? 1.5 : 5) / (correct ? tool!.speed : 1);
    if (tool?.type === 'blade' && (d.mat === 'leaves' || d.mat === 'plant')) t /= 4;
    if (this.player.body.headInWater) t *= 3;
    if (!this.player.body.onGround && !this.player.flying && !this.player.body.inWater) t *= 1.6;
    return t;
  }

  canHarvest(id: number, held: Stack | null) {
    const d = blockDef(id);
    if (d.tier === 0 || d.tool !== 'pick') return true;
    const tool = held ? item(held.id).tool : undefined;
    return !!tool && tool.type === 'pick' && tool.tier >= d.tier;
  }

  blockDrops(id: number, meta: number, held: Stack | null): Stack[] {
    const r = Math.random();
    const one = (i: number, n = 1): Stack[] => [{ id: i, count: n }];
    switch (id) {
      case B.STONE: return one(B.RUBBLE);
      case B.GRASS: case B.FROST_GRASS: case B.FARMLAND: return one(B.DIRT);
      case B.COAL_ORE: return one(I.coal, 1 + (r < 0.2 ? 1 : 0));
      case B.AZURITE_ORE: return one(I.azurite);
      case B.FROSTQUARTZ_ORE: return this.canHarvest(id, held) ? one(I.frostquartz, 1 + (r < 0.3 ? 1 : 0)) : [];
      case B.RUBELLITE_ORE: return this.canHarvest(id, held) ? one(I.rubellite) : [];
      case B.STARSTONE_ORE: return this.canHarvest(id, held) ? one(I.starstone) : [];
      case B.GLOWSHARD_ORE: return one(I.glowshard, 1 + (r < 0.5 ? 1 : 0));
      case B.ASH_LEAVES: case B.PINE_LEAVES: case B.PALM_LEAVES:
        if (r < 0.08 && id !== B.PALM_LEAVES) return one(id === B.ASH_LEAVES ? B.ASH_SAPLING : B.PINE_SAPLING);
        if (r < 0.14) return one(I.stick);
        if (id === B.ASH_LEAVES && r < 0.17) return one(I.berries);
        return [];
      case B.TALL_GRASS: return r < 0.15 ? one(I.seeds) : r < 0.6 ? one(I.fiber) : [];
      case B.DRY_SHRUB: return r < 0.6 ? one(I.stick) : [];
      case B.GLASS: case B.ICE: case B.WATER: case B.MAGMA: case B.DEEPSTONE: return [];
      case B.BERRY_BUSH: return meta ? [{ id: B.BERRY_BUSH, count: 1 }, { id: I.berries, count: 2 }] : one(B.BERRY_BUSH);
      case B.GRAIN: return meta >= 7 ? [{ id: I.grain_item, count: 1 + (r < 0.5 ? 1 : 0) }, { id: I.seeds, count: 1 + Math.floor(Math.random() * 2) }] : one(I.seeds);
      case B.DOOR_LOWER: case B.DOOR_UPPER: return one(I.door);
      case B.LUMEN_LAMP: return one(B.LUMEN_LAMP);
      case B.CRYSTAL_SHARD: return one(I.prism_shard, 1 + Math.floor(r * 3));
      case B.EMBER_LEAVES: return r < 0.1 ? one(I.ashfruit) : r < 0.16 ? one(I.stick) : [];
      case B.SILVER_LEAVES: return r < 0.12 ? one(I.stick) : [];
      case B.GLOW_VINE: return one(B.GLOW_VINE);
      case BX.melon: return one(I.melon_slice, 3 + Math.floor(r * 4));
      case BX.lumenite_ore: return this.canHarvest(id, held) ? one(I.lumenite, 1 + (r < 0.35 ? 1 : 0)) : [];
      case BX.frond_fern: return r < 0.5 ? one(I.fiber) : [];
    }
    if (TGLASS.has(id)) return [];
    if (!this.canHarvest(id, held)) return [];
    return BLOCKS[id]?.item ? one(id) : [];
  }

  private breakBlock(t: Target) {
    const w = this.world!, p = this.player;
    const meta = w.getMeta(t.x, t.y, t.z);
    const held = p.inv.held;
    const d = blockDef(t.id);
    if (d.hardness < 0 && !p.creative) return;
    if (!p.creative) {
      const drops = this.blockDrops(t.id, meta, held);
      for (const s of drops) this.spawnDrop(t.x + 0.5, t.y + 0.5, t.z + 0.5, s.id, s.count, s.dur);
      p.exhaustion += 0.005;
      this.useDurability();
    }
    w.setBlock(t.x, t.y, t.z, B.AIR);
    this.audio.block(d.mat, 'break');
    const l = w.getLight(t.x, t.y, t.z);
    const lf = Math.max((l >> 4) / 15 * (0.3 + 0.7 * this.sky.dayFactor), (l & 15) / 15) * 0.85 + 0.15;
    this.particles.burst(t.x + 0.5, t.y + 0.5, t.z + 0.5, this.blockColor(t.id), 14, lf);
    this.swing = 1;
    if (this.settings.haptics) navigator.vibrate?.(12);
  }

  private useDurability() {
    const p = this.player, s = p.inv.held;
    if (!s || p.creative) return;
    const tool = item(s.id).tool;
    if (!tool) return;
    s.dur = (s.dur ?? tool.durability) - 1;
    if (s.dur <= 0) { p.inv.slots[p.inv.selected] = null; this.audio.block('wood', 'break'); this.ui.toast(item(s.id).name + ' broke!'); }
  }

  private attack() {
    const m = this.targetMob;
    if (!m) return;
    const p = this.player;
    const tool = p.inv.held ? item(p.inv.held.id).tool : undefined;
    const dmg = tool ? tool.damage : 1;
    this.mobs.damage(m, p.creative ? 100 : dmg, p.x, p.z);
    this.attackCd = 0.45;
    this.swing = 1;
    p.exhaustion += 0.1;
    if (tool?.type === 'blade') this.useDurability();
    else if (tool && Math.random() < 0.5) this.useDurability();
    this.audio.swing();
    if (this.settings.haptics) navigator.vibrate?.(20);
  }

  spawnDrop(x: number, y: number, z: number, id: number, count: number, dur?: number) {
    if (count <= 0) return;
    this.drops.spawn(x, y, z, { id, count, ...(dur !== undefined ? { dur } : {}) });
  }

  dropFromInventory(stack: Stack) {
    const p = this.player;
    const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw);
    this.drops.spawn(p.x + dx * 0.5, p.y + p.eye - 0.3, p.z + dz * 0.5, stack, dx * 5, 3, dz * 5, 1.5);
  }

  dropHeld(all: boolean) {
    const inv = this.player.inv, s = inv.held;
    if (!s) return;
    const n = all ? s.count : 1;
    this.dropFromInventory({ id: s.id, count: n, ...(s.dur !== undefined ? { dur: s.dur } : {}) });
    s.count -= n; if (s.count <= 0) inv.slots[inv.selected] = null;
    this.swing = 0.5;
  }

  private handleActions() {
    const inp = this.input, p = this.player;
    for (let i = 0; i < 9; i++) if (inp.consume(('slot' + i) as any)) p.inv.selected = i;
    if (inp.consume('next')) p.inv.selected = (p.inv.selected + 1) % 9;
    if (inp.consume('prev')) p.inv.selected = (p.inv.selected + 8) % 9;
    if (inp.consume('inventory')) { this.ui.openInventory(); return; }
    if (inp.consume('pause')) { this.setState('pause'); return; }
    if (inp.consume('creative')) { if (p.creative) this.ui.openCreative(); }
    if (inp.consume('drop')) this.dropHeld(false);
    if (inp.consume('dropStack')) this.dropHeld(true);
    if (inp.consume('view')) this.viewMode = (this.viewMode + 1) % 3;
    if (inp.consume('hud')) this.ui.toggleHud();
    if (inp.consume('debug')) { this.settings.showFps = !this.settings.showFps; saveSettings(this.settings); }
    if (inp.consume('pick') && this.target) {
      // pick block (middle click): select it in the hotbar, or put it in hand in creative
      const id = this.target.id;
      const want = id === B.DOOR_LOWER || id === B.DOOR_UPPER ? I.door : BLOCKS[id]?.item ? id : -1;
      if (want >= 0) {
        const slot = p.inv.slots.slice(0, 9).findIndex((s) => s && s.id === want);
        if (slot >= 0) p.inv.selected = slot;
        else if (p.creative) p.inv.slots[p.inv.selected] = { id: want, count: maxStack(want) };
      }
    }
    if (inp.consume('fly')) { if (p.creative) { p.flying = !p.flying; this.ui.toast(p.flying ? 'Flying' : 'Walking'); } }
    if (inp.consume('attack')) {
      if (this.targetMob) { if (this.attackCd <= 0) this.attack(); }
      else if (p.creative && this.target) { this.breakBlock(this.target); this.creativeBreakCd = 0.3; }
      else this.swing = Math.max(this.swing, 0.5);
    }
    if (inp.consume('interact')) this.use(true);
    if (inp.consume('place')) this.use(false);
  }

  /** Context label for the interact button. */
  contextAction(): string | null {
    const p = this.player, t = this.target, held = p.inv.held;
    if (this.targetMob) return 'Attack';
    if (t) {
      const w = this.world!;
      if (t.id === BX.dream_rift) return 'Travel';
      switch (t.id) {
        case B.CRATE: return 'Open';
        case B.WORKBENCH: return 'Craft';
        case B.KILN: return 'Kiln';
        case B.BED: return 'Sleep';
        case B.SKY_RIFT: case B.ASH_RIFT: return 'Travel';
        case B.BLAST_KEG: return 'Ignite';
        case B.DOOR_LOWER: case B.DOOR_UPPER: return (w.getMeta(t.x, t.y, t.z) & 4) ? 'Close' : 'Open';
        case B.BERRY_BUSH: if (w.getMeta(t.x, t.y, t.z)) return 'Harvest'; break;
        case B.GRAIN: if (w.getMeta(t.x, t.y, t.z) >= 7) return 'Harvest'; break;
      }
      if (held) {
        const d = item(held.id);
        if (d.tool?.type === 'tiller' && (t.id === B.DIRT || t.id === B.GRASS)) return 'Till';
        if (d.tool?.type === 'axe' && STRIPPED[t.id]) return 'Strip';
        if (held.id === I.seeds && t.id === B.FARMLAND) return 'Plant';
      }
    }
    if (held) {
      const d = item(held.id);
      if (d.food && p.hunger < 20 && !p.creative) return 'Eat';
      if (held.id === I.bucket) return 'Fill';
      if (d.ranged) return 'Shoot';
      if (d.fishing) return this.fishing ? 'Reel' : 'Cast';
      if (d.armor) return 'Equip';
      if (held.id === I.water_bucket) return 'Pour';
    }
    return null;
  }

  private use(interactOnly: boolean) {
    const p = this.player, w = this.world!;
    if (!p.alive || this.placeCd > 0) return;
    const t = this.target, held = p.inv.held;
    if (held && item(held.id).ranged) { this.shoot(); return; }
    if (held && item(held.id).fishing) { this.castLine(); return; }
    if (held && item(held.id).armor) { this.equip(); return; }
    // tapping a creature attacks it
    if (this.targetMob && !(held && item(held.id).food)) { if (this.attackCd <= 0) this.attack(); return; }
    if (t && (!p.sneaking || interactOnly)) {
      const meta = w.getMeta(t.x, t.y, t.z);
      if (t.id === BX.dream_rift) { this.audio.thunder(); this.travel(this.dim !== 0 ? 0 : 3); return; }
      switch (t.id) {
        case B.CRATE: { const inv = w.getCrate(t.x, t.y, t.z); if (inv) { this.audio.block('wood', 'place'); this.ui.openCrate(inv, t.x, t.y, t.z); } return; }
        case B.WORKBENCH: this.ui.openInventory('bench'); return;
        case B.KILN: this.ui.openInventory('kiln'); return;
        case B.BED: this.sleep(t.x, t.y, t.z); return;
        case B.SKY_RIFT: case B.ASH_RIFT: this.audio.thunder(); this.travel(this.dim !== 0 ? 0 : t.id === B.SKY_RIFT ? 1 : 2); return;
        case B.BLAST_KEG: this.ignite(t.x, t.y, t.z, 3); return;
        case B.DOOR_LOWER: case B.DOOR_UPPER: {
          const ly = t.id === B.DOOR_LOWER ? t.y : t.y - 1;
          const m = w.getMeta(t.x, ly, t.z) ^ 4;
          w.setBlock(t.x, ly, t.z, B.DOOR_LOWER, m, { noUpdate: true });
          if (w.getBlock(t.x, ly + 1, t.z) === B.DOOR_UPPER) w.setBlock(t.x, ly + 1, t.z, B.DOOR_UPPER, m, { noUpdate: true });
          this.audio.door(!!(m & 4)); this.swing = 0.6; this.placeCd = 0.2;
          return;
        }
        case B.BERRY_BUSH: if (meta) { w.setBlock(t.x, t.y, t.z, B.BERRY_BUSH, 0, { noUpdate: true }); this.spawnDrop(t.x + 0.5, t.y + 0.6, t.z + 0.5, I.berries, 2 + (Math.random() < 0.4 ? 1 : 0)); this.audio.block('leaves', 'break'); this.swing = 0.6; return; } break;
        case B.GRAIN: if (meta >= 7) { this.breakBlock(t); w.setBlock(t.x, t.y, t.z, B.GRAIN, 0); return; } break;
      }
    }
    if (!held) return;
    const d = item(held.id);
    // tools / items with special uses
    if (d.tool?.type === 'axe' && t && STRIPPED[t.id]) {
      w.setBlock(t.x, t.y, t.z, STRIPPED[t.id], w.getMeta(t.x, t.y, t.z)); this.audio.block('wood', 'place'); this.useDurability(); this.swing = 1; this.placeCd = 0.25;
      return;
    }
    if (d.tool?.type === 'tiller') {
      if (t && (t.id === B.DIRT || t.id === B.GRASS) && w.getBlock(t.x, t.y + 1, t.z) === B.AIR) {
        w.setBlock(t.x, t.y, t.z, B.FARMLAND); this.audio.block('dirt', 'place'); this.useDurability(); this.swing = 1;
      }
      return;
    }
    if (held.id === I.seeds) {
      if (t && t.id === B.FARMLAND && w.getBlock(t.x, t.y + 1, t.z) === B.AIR) {
        w.setBlock(t.x, t.y + 1, t.z, B.GRAIN, 0); this.audio.block('plant', 'place'); if (!p.creative) p.inv.consumeHeld(); this.swing = 0.6;
      }
      return;
    }
    if (d.food) {
      if (p.hunger < 20 || p.creative) {
        p.eat(d.food); this.audio.eat(); if (!p.creative) { p.inv.consumeHeld(); if (held.id === I.glowcap_stew) p.inv.add(I.bucket, 1); }
        this.particles.burst(p.x, p.y + p.eye - 0.3, p.z, [0.8, 0.5, 0.3], 5); this.placeCd = 0.4;
      }
      return;
    }
    if (held.id === I.bucket) {
      const { o, d: dir } = this.eyeRay();
      const lt = this.raycast(o, dir, this.reach, true);
      if (lt && lt.id === B.WATER) {
        w.setBlock(lt.x, lt.y, lt.z, B.AIR);
        if (!p.creative) { p.inv.consumeHeld(); if (p.inv.add(I.water_bucket, 1)) this.spawnDrop(p.x, p.y + 1, p.z, I.water_bucket, 1); }
        this.audio.splash();
      }
      return;
    }
    if (held.id === I.water_bucket) {
      if (!t) return;
      const px = t.x + t.nx, py = t.y + t.ny, pz = t.z + t.nz;
      const cur = w.getBlock(px, py, pz);
      if (cur === B.AIR || (BLOCKS[cur]?.replaceable && cur !== B.WATER)) {
        w.setBlock(px, py, pz, B.WATER, 0);
        if (!p.creative) { p.inv.slots[p.inv.selected] = { id: I.bucket, count: 1 }; }
        this.audio.splash();
      }
      return;
    }
    if (held.id === I.door) { this.placeDoor(t); return; }
    if (interactOnly) return;
    if (d.block !== undefined) this.placeBlock(t, d.block);
  }

  private placeDoor(t: Target | null) {
    const w = this.world!, p = this.player;
    if (!t || t.ny !== 1) return;
    const x = t.x, y = t.y + 1, z = t.z;
    if (!this.replaceable(w.getBlock(x, y, z)) || !this.replaceable(w.getBlock(x, y + 1, z))) return;
    if (!L_SOLID[w.getBlock(x, y - 1, z)]) return;
    if (this.blocksEntity(x, y, z, 2)) return;
    // facing: panel on the side away from the player
    const a = ((p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const q = Math.round(a / (Math.PI / 2)) % 4; // 0 = facing -z
    const facing = [0, 3, 2, 1][q];
    w.setBlock(x, y, z, B.DOOR_LOWER, facing);
    w.setBlock(x, y + 1, z, B.DOOR_UPPER, facing);
    this.audio.block('wood', 'place');
    if (!p.creative) p.inv.consumeHeld();
    this.swing = 0.7; this.placeCd = 0.2;
  }

  private replaceable(id: number) { return id === B.AIR || (!!BLOCKS[id]?.replaceable && id !== UNLOADED); }

  private blocksEntity(x: number, y: number, z: number, h = 1) {
    const p = this.player.body;
    const hit = (bx: number, by: number, bz: number, hw: number, hh: number) => bx + hw > x && bx - hw < x + 1 && by + hh > y && by < y + h && bz + hw > z && bz - hw < z + 1;
    if (this.player.alive && hit(p.x, p.y, p.z, p.hw, p.h)) return true;
    for (const m of this.mobs.mobs) if (hit(m.body.x, m.body.y, m.body.z, m.body.hw, m.body.h)) return true;
    return false;
  }

  private placeBlock(t: Target | null, id: number) {
    const w = this.world!, p = this.player;
    if (!t) return;
    let x = t.x + t.nx, y = t.y + t.ny, z = t.z + t.nz;
    const tdef = BLOCKS[t.id];
    if (tdef?.replaceable && t.id !== id && tdef.shape === SHAPE_CROSS) { x = t.x; y = t.y; z = t.z; }
    if (y < 0 || y >= HEIGHT) return;
    const cur = w.getBlock(x, y, z);
    if (!this.replaceable(cur) || cur === id) return;
    const def = BLOCKS[id];
    let meta = 0;
    if (id === B.TORCH) {
      if (t.ny === 1) meta = 0;
      else if (t.nx === 1) meta = 2; else if (t.nx === -1) meta = 1; else if (t.nz === 1) meta = 4; else if (t.nz === -1) meta = 3;
      else meta = 0;
    }
    if (id === B.LADDER) {
      if (t.ny !== 0) return;
      meta = t.nz === 1 ? 0 : t.nx === -1 ? 1 : t.nx === 1 ? 2 : 3;
    } else if (id === B.STONE_SLAB || id === B.PLANK_SLAB) {
      const { o, d } = this.eyeRay();
      const hy = o.y + d.y * t.t - Math.floor(o.y + d.y * t.t);
      meta = t.ny === -1 || (t.ny === 0 && hy > 0.5) ? 1 : 0;
    } else if (id === B.STONE_STAIRS || id === B.PLANK_STAIRS) {
      const a = ((p.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      meta = [2, 1, 0, 3][Math.round(a / (Math.PI / 2)) % 4];
    }
    if (def.solid && this.blocksEntity(x, y, z)) return;
    if (!w.isSupported(id, meta, x, y, z)) {
      if (id === B.TORCH && w.isSupported(id, 0, x, y, z)) meta = 0; else return;
    }
    if (id === B.WATER || id === B.MAGMA) meta = 0;
    w.setBlock(x, y, z, id, meta);
    this.audio.block(def.mat, 'place');
    if (!p.creative) p.inv.consumeHeld();
    this.swing = 0.7;
    this.placeCd = 0.12;
  }

  // ---------------------------------------------------------------- expansion mechanics
  private sleep(x: number, y: number, z: number) {
    const p = this.player;
    p.spawn = { x: x + 0.5, y: y + 1, z: z + 0.5 };
    if (this.meta) (this.meta.state || (this.meta.state = {})).spawnDim = this.dim;
    if (this.dim !== 0) { this.ui.toast('Spawn point set'); return; }
    const danger = !p.creative && this.mobs.mobs.some((m) => m.type.hostile && Math.hypot(m.body.x - p.x, m.body.z - p.z) < 10);
    if (danger) { this.ui.toast('You cannot rest — creatures are nearby'); return; }
    if (this.sky.dayFactor < 0.35) {
      const day = Math.floor(this.time / DAY_LENGTH) + (this.timeOfDay > 0.5 ? 1 : 0);
      this.time = (day + 0.01) * DAY_LENGTH;
      p.health = Math.min(20, p.health + 4);
      this.ui.toast('You slept until morning');
    } else this.ui.toast('Spawn point set');
  }

  ignite(x: number, y: number, z: number, fuse: number) {
    if (this.fuses.some((f) => f.x === x && f.y === y && f.z === z)) return;
    this.fuses.push({ x, y, z, t: fuse });
    this.audio.block('sand', 'hit');
  }

  private updateFuses(dt: number) {
    for (let i = this.fuses.length - 1; i >= 0; i--) {
      const f = this.fuses[i];
      f.t -= dt;
      if (Math.random() < dt * 20) this.particles.flame(f.x + 0.5, f.y + 1.05, f.z + 0.5);
      if (f.t <= 0) { this.fuses.splice(i, 1); this.explode(f.x + 0.5, f.y + 0.5, f.z + 0.5, 3.4); }
    }
  }

  explode(cx: number, cy: number, cz: number, R: number) {
    const w = this.world!;
    const keepIds = new Set<number>([B.DEEPSTONE, B.SKY_RIFT, B.ASH_RIFT, B.WATER, B.MAGMA]);
    const r = Math.ceil(R);
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy, dz) + Math.random() * 0.8;
      if (d > R) continue;
      const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy, z = Math.floor(cz) + dz;
      const id = w.getBlock(x, y, z);
      if (id === B.AIR || id === UNLOADED || keepIds.has(id)) continue;
      if (id === B.BLAST_KEG) { this.ignite(x, y, z, 0.4 + Math.random() * 0.4); continue; }
      const m = w.getMeta(x, y, z);
      w.setBlock(x, y, z, B.AIR);
      if (Math.random() < 0.3) for (const st of this.blockDrops(id, m, null)) this.spawnDrop(x + 0.5, y + 0.5, z + 0.5, st.id, st.count, st.dur);
    }
    const p = this.player;
    const pd = Math.hypot(p.x - cx, p.y + 1 - cy, p.z - cz);
    if (pd < R + 2.5) p.hurt(Math.round(16 * (1 - pd / (R + 2.5))), cx, cz, 'a blast');
    for (const m of [...this.mobs.mobs]) {
      const md = Math.hypot(m.body.x - cx, m.body.y - cy, m.body.z - cz);
      if (md < R + 2.5) this.mobs.damage(m, Math.round(20 * (1 - md / (R + 2.5))), cx, cz);
    }
    this.particles.puff(cx, cy - 0.5, cz, 40, [0.35, 0.33, 0.32]);
    this.particles.burst(cx, cy, cz, [1, 0.6, 0.2], 40);
    this.sky.flash = 0.35;
    this.audio.thunder();
    if (this.settings.haptics) navigator.vibrate?.(120);
  }

  private shoot() {
    const p = this.player;
    if (!p.creative && !p.inv.remove(I.arrow, 1)) { this.ui.toast('You need arrows'); return; }
    if (this.attackCd > 0) return;
    const { o, d } = this.eyeRay();
    const mesh = new THREE.Mesh(this.arrowGeo, this.arrowMat);
    this.scene.add(mesh);
    this.arrows.push({ x: o.x + d.x * 0.5, y: o.y + d.y * 0.5, z: o.z + d.z * 0.5, vx: d.x * 34, vy: d.y * 34, vz: d.z * 34, life: 6, mesh });
    this.useDurability();
    this.attackCd = 0.55; this.swing = 0.8;
    this.audio.swing();
  }

  private updateArrows(dt: number) {
    const w = this.world!;
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.life -= dt;
      let done = a.life <= 0;
      const steps = 4;
      for (let s2 = 0; s2 < steps && !done; s2++) {
        const h = dt / steps;
        a.vy -= 14 * h;
        a.x += a.vx * h; a.y += a.vy * h; a.z += a.vz * h;
        const id = w.getBlock(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z));
        if (id !== B.AIR && L_SOLID[id]) {
          done = true;
          if (Math.random() < 0.6) this.spawnDrop(a.x - a.vx * h, a.y - a.vy * h, a.z - a.vz * h, I.arrow, 1);
          this.audio.block(blockDef(id === UNLOADED ? B.STONE : id).mat, 'hit', 0.6);
          if (id === B.BLAST_KEG) this.ignite(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z), 1.5);
        }
        for (const m of this.mobs.mobs) {
          const b = m.body;
          if (a.x > b.x - b.hw - 0.1 && a.x < b.x + b.hw + 0.1 && a.z > b.z - b.hw - 0.1 && a.z < b.z + b.hw + 0.1 && a.y > b.y && a.y < b.y + b.h) {
            this.mobs.damage(m, 6 + Math.round(Math.hypot(a.vx, a.vy, a.vz) / 12), a.x - a.vx, a.z - a.vz);
            done = true; break;
          }
        }
      }
      a.mesh.position.set(a.x, a.y, a.z);
      a.mesh.lookAt(a.x + a.vx, a.y + a.vy, a.z + a.vz);
      if (done) { this.scene.remove(a.mesh); this.arrows.splice(i, 1); }
    }
  }

  private castLine() {
    if (this.fishing) { this.cancelFishing(); this.ui.toast('Line reeled in'); return; }
    const { o, d } = this.eyeRay();
    const hit = this.raycast(o, d, 14, true);
    if (!hit || hit.id !== B.WATER) {
      // also accept flowing water directly in view
      this.ui.toast('Cast your line into water');
      return;
    }
    const bob = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial({ color: 0xe04040 }));
    bob.position.set(hit.x + 0.5, hit.y + 0.9, hit.z + 0.5);
    this.scene.add(bob);
    this.fishing = { x: hit.x + 0.5, y: hit.y + 0.9, z: hit.z + 0.5, t: 3 + Math.random() * 6, bob };
    this.audio.splash();
  }

  private cancelFishing() {
    if (!this.fishing) return;
    this.scene.remove(this.fishing.bob);
    this.fishing.bob.geometry.dispose();
    this.fishing = null;
  }

  private updateFishing(dt: number) {
    const f = this.fishing;
    if (!f) return;
    const p = this.player;
    const held = p.inv.held;
    if (!held || !item(held.id).fishing || Math.hypot(p.x - f.x, p.z - f.z) > 18) { this.cancelFishing(); return; }
    f.t -= dt;
    f.bob.position.y = f.y + Math.sin(performance.now() / 300) * 0.04 - (f.t < 0.6 ? 0.15 : 0);
    if (f.t <= 0) {
      const r = Math.random();
      const catchId = r < 0.8 ? I.raw_fish : r < 0.88 ? I.fiber : r < 0.94 ? I.arrow : r < 0.98 ? I.prism_shard : I.rubellite;
      this.particles.splash(f.x, f.y, f.z);
      this.audio.splash();
      if (p.inv.add(catchId, 1)) this.spawnDrop(p.x, p.y + 1, p.z, catchId, 1);
      else this.audio.pickup();
      this.ui.toast('Caught: ' + item(catchId).name);
      this.useDurability();
      this.cancelFishing();
    }
  }

  private equip() {
    const p = this.player, s = p.inv.held;
    if (!s) return;
    const a = item(s.id).armor!;
    const old = p.armor[a.slot];
    p.armor[a.slot] = { ...s, count: 1 };
    p.inv.slots[p.inv.selected] = old;
    this.audio.block('metal', 'place');
    this.ui.toast('Equipped: ' + item(s.id).name);
  }

  // ---------------------------------------------------------------- crafting / UI helpers
  nearbyStations(): Set<Station> {
    const s = new Set<Station>(['hand']);
    const w = this.world, p = this.player;
    if (!w) return s;
    if (p.creative) { s.add('bench'); s.add('kiln'); return s; }
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    for (let y = by - 2; y <= by + 3; y++) for (let z = bz - 4; z <= bz + 4; z++) for (let x = bx - 4; x <= bx + 4; x++) {
      const id = w.getBlock(x, y, z);
      if (id === B.WORKBENCH) s.add('bench');
      else if (id === B.KILN) s.add('kiln');
    }
    return s;
  }

  craft(r: Recipe): boolean {
    const left = doCraft(this.player.inv, r, this.player.creative);
    if (left < 0) return false;
    if (left > 0) this.dropFromInventory({ id: r.out, count: left });
    this.audio.craft();
    return true;
  }

  async respawn() {
    const p = this.player;
    const sd = this.meta?.state?.spawnDim || 0;
    p.respawn();
    if (sd !== this.dim) {
      const sp = { ...p.spawn };
      if (this.meta?.state) this.meta.state.owPos = sp;
      await this.travel(sd);
      if (sd !== 0) { p.setPos(sp.x, sp.y, sp.z); this.loadingTarget = { x: sp.x, z: sp.z, fresh: false, arrive: false }; }
      return;
    }
    this.setState('play');
  }

  private handleDeath(src: string) {
    const p = this.player;
    if (!this.rules.keepInventory) {
      for (let i = 0; i < p.inv.slots.length; i++) {
        const s = p.inv.slots[i];
        if (s) this.drops.spawn(p.x, p.y + 1, p.z, s, (Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6, 2);
        p.inv.slots[i] = null;
      }
    }
    if (!this.rules.keepInventory) for (let i = 0; i < 4; i++) { const a = p.armor[i]; if (a) this.drops.spawn(p.x, p.y + 1, p.z, a, (Math.random() - 0.5) * 6, 4, (Math.random() - 0.5) * 6, 2); p.armor[i] = null; }
    this.particles.puff(p.x, p.y + 0.8, p.z, 16, [0.8, 0.2, 0.2]);
    this.setState('dead');
    this.ui.onDeath(`You were defeated by ${src}.`);
  }

  setMode(mode: 'survival' | 'creative') {
    this.player.mode = mode;
    if (this.meta) this.meta.mode = mode;
    if (mode === 'survival') this.player.flying = false;
  }

  spawnCreature(key: string) {
    const p = this.player;
    const t = MOB_TYPES.find((m) => m.key === key);
    if (!t || !this.world) return;
    const dx = -Math.sin(p.yaw) * 3, dz = -Math.cos(p.yaw) * 3;
    const x = Math.floor(p.x + dx), z = Math.floor(p.z + dz);
    let y = Math.floor(p.y);
    for (let k = 0; k < 6 && overlapsSolid(this.world, x + 0.2, y, z + 0.2, x + 0.8, y + t.h, z + 0.8); k++) y++;
    this.mobs.spawn(t, x + 0.5, y + (t.flying ? 1 : 0), z + 0.5);
    this.particles.puff(x + 0.5, y + 0.5, z + 0.5, 10);
  }

  // ---------------------------------------------------------------- first-person hand
  private updateHand(dt: number) {
    const p = this.player;
    const held = p.inv.held;
    const id = held ? held.id : -1;
    if (id !== this.handItemId) {
      this.handItemId = id;
      if (this.handItem) { this.hand.remove(this.handItem); this.handItem.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); }); }
      this.handItem = this.makeHandItem(id);
      this.hand.add(this.handItem);
    }
    const l = this.world!.getLight(Math.floor(p.x), Math.floor(p.y + p.eye), Math.floor(p.z));
    const lf = Math.max(((l >> 4) / 15) ** 2 * (0.25 + 0.75 * this.sky.dayFactor), ((l & 15) / 15) ** 1.7, shared.uHandLight.value * 0.8) * 0.85 + 0.12;
    this.hand.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial;
      if (m && m.userData?.lit) m.color.copy(m.userData.base).multiplyScalar(lf);
    });
    const sp = Math.hypot(p.body.vx, p.body.vz);
    const bob = this.settings.viewBobbing && p.body.onGround ? Math.min(1, sp / 4) : 0;
    const s = this.swing > 0 ? Math.sin((1 - this.swing) * Math.PI) : 0;
    this.hand.position.set(0.4 + Math.cos(p.bob) * 0.02 * bob - s * 0.15, -0.36 + Math.abs(Math.sin(p.bob)) * 0.03 * bob - s * 0.12, -0.7 - s * 0.1);
    this.hand.rotation.set(-s * 0.9, -0.35 + s * 0.3, s * 0.2);
    this.hand.visible = this.viewMode === 0 && p.alive;
    void dt;
  }

  private makeHandItem(id: number): THREE.Object3D {
    const g = new THREE.Group();
    const mk = (mat: THREE.MeshBasicMaterial) => { mat.userData = { lit: true, base: mat.color.clone() }; return mat; };
    if (id < 0) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.42), mk(new THREE.MeshBasicMaterial({ color: 0x2a6b74 })));
      const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.135, 0.05), mk(new THREE.MeshBasicMaterial({ color: 0xe0a04a })));
      const skin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.1), mk(new THREE.MeshBasicMaterial({ color: 0xd9ad85 })));
      arm.position.set(0.06, -0.08, 0.1);
      cuff.position.set(0.06, -0.08, -0.12);
      skin.position.set(0.06, -0.08, -0.18);
      g.add(arm, cuff, skin);
      return g;
    }
    const d = item(id);
    if (d.block !== undefined && BLOCKS[d.block].shape === SHAPE_CUBE) {
      const m = new THREE.Mesh(blockGeometry(d.block, 0.24), mk(new THREE.MeshBasicMaterial({ map: this.atlas.texture, alphaTest: 0.5 })));
      m.rotation.set(0.15, 0.7, 0);
      m.position.set(0, 0.02, -0.05);
      g.add(m);
    } else {
      const tex = new THREE.CanvasTexture(itemCanvas(id));
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.36), mk(new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide })));
      m.rotation.set(0, -1.2, 0.35);
      m.position.set(0, 0.12, -0.05);
      g.add(m);
    }
    return g;
  }

  get timeOfDay() { return (this.time / DAY_LENGTH) % 1; }
  setTimeOfDay(t: number) { const day = Math.floor(this.time / DAY_LENGTH); this.time = (day + t) * DAY_LENGTH; }
  get dayNumber() { return Math.floor(this.time / DAY_LENGTH) + 1; }
  get underwater() { return !!(this as any)._underwater; }
  get inMagma() { return !!(this as any)._inMagma; }
}
