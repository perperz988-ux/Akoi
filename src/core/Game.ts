import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { EventBus } from './Events';
import { Input } from './Input';
import { PRESETS, QualityCfg, QualityName, recommendQuality, DynamicResolution } from '../settings/Quality';
import { Settings } from '../settings/Settings';
import { TextureStreamer } from '../world/Textures';
import { World } from '../world/World';
import { Environment } from '../env/Environment';
import { CameraRig } from '../camera/CameraRig';
import { Fx } from '../fx/Fx';
import { AudioSystem } from '../audio/Audio';
import { Player } from '../actors/Player';
import { VehicleManager } from '../vehicles/VehicleManager';
import { Traffic } from '../ai/Traffic';
import { PedManager } from '../ai/Peds';
import { Police } from '../ai/Police';
import { Emergency } from '../ai/Emergency';
import { Combat } from '../combat/Combat';
import { DynProps } from '../combat/Props';
import { Markers } from '../world/Markers';
import { Interiors } from '../world/Interiors';
import { Economy } from '../economy/Economy';
import { MissionSystem } from '../missions/Missions';
import { RandomEvents } from '../missions/RandomEvents';
import { SaveSystem } from '../save/SaveSystem';
import { Hud } from '../ui/Hud';
import { TouchControls } from '../ui/TouchControls';
import { POIS, Poi, poiById, cellOf } from '../world/CityLayout';
import { clamp } from './MathUtil';
import { defaultLoadout } from '../combat/Weapons';

export type GameState = 'boot' | 'title' | 'playing';

export class Game {
  canvas: HTMLCanvasElement;
  renderer!: THREE.WebGLRenderer;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  quality: QualityCfg = PRESETS.MEDIUM;
  recommended = { preset: 'MEDIUM' as QualityName, reason: '' };
  settings = new Settings();
  bus = new EventBus();
  input!: Input;
  tex = new TextureStreamer(256, 4);
  env!: Environment; world!: World; cam!: CameraRig; fx!: Fx; audio!: AudioSystem; player!: Player;
  vehicles!: VehicleManager; traffic!: Traffic; peds!: PedManager; police!: Police; emergency!: Emergency; combat!: Combat; props!: DynProps;
  markers!: Markers; interiors!: Interiors; economy!: Economy; missions!: MissionSystem; events!: RandomEvents; saves!: SaveSystem; hud!: Hud; touch!: TouchControls;
  dynRes = new DynamicResolution();
  state: GameState = 'boot';
  paused = false;
  time = 0;
  pois: Poi[] = POIS;
  private last = 0;
  private titleT = 0;
  private slowFrames = 0;
  private fastT = 0;
  private perfT = 0;
  private nextTexSweep = 60;
  private contextCache: { label: string; run: () => void } | null = null;
  private ctxTimer = 0;

  get col() { return this.world.collision; }
  poi(id: string) { return poiById(id); }

  constructor(canvas: HTMLCanvasElement, private uiRoot: HTMLElement) { this.canvas = canvas; }

  // ------------------------------------------------------------------------------------ init
  async init() {
    const ui = this.uiRoot;
    this.saves = new SaveSystem(this);
    const hud0 = (this.hud = new Hud(this, ui));
    hud0.bootProgress(0.05, 'Detecting device…');
    // renderer
    const testCtx = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (testCtx) this.recommended = recommendQuality(testCtx as WebGLRenderingContext);
    const stored = (await this.saves.loadSettingsAsync()) ?? this.saves.loadSettings();
    this.settings.load(stored);
    const wantPreset: QualityName = this.settings.quality === 'AUTO' ? this.recommended.preset : this.settings.quality;
    this.quality = PRESETS[wantPreset];
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.quality.antialias && !this.quality.bloom, powerPreference: 'high-performance', stencil: false, alpha: false, preserveDrawingBuffer: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.quality.shadows; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.info.autoReset = true;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.hud.toast('Graphics context lost — restoring…'); setTimeout(() => location.reload(), 1200); });
    this.tex = new TextureStreamer(this.quality.texSize, Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    hud0.bootProgress(0.12, 'Building world systems…');
    this.input = new Input(this.canvas);
    this.input.sensitivity = this.settings.sensitivity;
    this.env = new Environment(this.quality, this.tex, this.bus, this.renderer);
    this.world = new World(this.quality, this.tex);
    this.env.scene.add(this.world.group);
    this.cam = new CameraRig(this.col, innerWidth / innerHeight);
    this.cam.fovBase = this.cam.fov = this.settings.fov; this.cam.sensitivity = this.settings.sensitivity;
    this.fx = new Fx(this.env.scene, this.tex, this.quality.name === 'LOW' ? 700 : 1500);
    this.audio = new AudioSystem(this);
    this.audio.setVolumes({ master: this.settings.volMaster, sfx: this.settings.volSfx, music: this.settings.volMusic, amb: this.settings.volAmb });
    this.economy = new Economy(this);
    this.player = new Player(this);
    this.player.autoSprint = this.settings.autoSprint;
    this.vehicles = new VehicleManager(this);
    this.props = new DynProps(this);
    this.combat = new Combat(this);
    this.peds = new PedManager(this);
    this.traffic = new Traffic(this);
    this.police = new Police(this);
    this.emergency = new Emergency(this);
    this.markers = new Markers(this);
    this.interiors = new Interiors(this);
    this.missions = new MissionSystem(this);
    this.events = new RandomEvents(this);
    this.touch = new TouchControls(this, ui);
    this.dynRes.enabled = this.settings.dynamicRes;
    this.setupComposer();
    this.applyResolution();
    this.fps_target();
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.audio.suspend(true); if (this.state === 'playing' && !this.paused) this.hud.togglePause(true); } else if (!this.hud.pauseOpen) this.audio.suspend(false); });
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.canvas.addEventListener('pointerdown', () => this.audio.init());
    window.addEventListener('pointerdown', () => this.audio.init(), { once: true });
    this.nativeSetup();
    hud0.bootProgress(0.2, 'Streaming the city…');
    // title scene
    this.player.group.visible = false;
    this.player.mode = 'cutscene';
    this.player.teleport(250, -150, 0);
    this.env.setHour(18.4); this.env.frozen = true;
    await this.loadAround(250, -150, (f) => hud0.bootProgress(0.2 + f * 0.75, 'Streaming the city…'));
    this.state = 'title';
    hud0.bootProgress(1, 'Ready');
    hud0.hideBoot();
    hud0.showTitle(true);
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    (window as any).game = this;
  }

  fps_target() { /* quality drives targets */ }

  private async nativeSetup() {
    try {
      const w: any = window;
      if (w.Capacitor?.isNativePlatform?.()) {
        const app = await import('@capacitor/app');
        app.App.addListener('backButton', () => { if (this.state === 'playing') { if (this.hud.menuOpen) this.hud.closeMenu(); else if (this.hud.phoneOpen) this.hud.togglePhone(false); else if (this.hud.mapOpen) this.hud.openMap(false); else this.hud.togglePause(); } });
        app.App.addListener('pause', () => { if (this.state === 'playing') { this.saves.save(this.saves.currentSlot); if (!this.paused) this.hud.togglePause(true); } });
        const so = await import('@capacitor/screen-orientation'); so.ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => {});
      }
    } catch { /* web */ }
  }

  /** Build world around a point synchronously-ish with progress. */
  async loadAround(x: number, z: number, progress?: (f: number) => void) {
    const cells = this.quality.nearCells;
    this.world.update(x, z, x, 50, z, 0);
    this.world.preload(x, z, 1);
    const total = (cells * 2 + 1) ** 2; let n = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      this.world.update(x, z, x, 50, z, 14);
      n = [...this.world.cells.values()].filter((c) => c.lod === 0).length;
      progress?.(Math.min(1, n / total));
      if (n >= total * 0.92) break;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    this.props.spawnFromSpots(this.world.propSpots);
  }

  // ------------------------------------------------------------------------------------ rendering setup
  private setupComposer() {
    const q = this.quality;
    this.composer?.dispose(); this.composer = null; this.bloom = null;
    if (q.bloom) {
      const size = this.renderer.getSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.antialias ? 4 : 0 });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new RenderPass(this.env.scene, this.cam.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x * (q.bloomHalf ? 0.5 : 1), size.y * (q.bloomHalf ? 0.5 : 1)), 0.45, 0.6, 0.92);
      this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    }
  }
  applyResolution() {
    const q = this.quality;
    const base = Math.min(window.devicePixelRatio || 1, q.maxPixelRatio);
    const pr = Math.max(0.4, base * this.dynRes.scale * this.settings.resScale);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.composer?.setPixelRatio(pr); this.composer?.setSize(innerWidth, innerHeight);
    this.fx?.setScale(600 * (innerHeight / 720) * pr);
  }
  private onResize() { this.cam.resize(innerWidth / innerHeight); this.applyResolution(); this.touch?.applyLayout(); }

  /** Apply the quality preset from settings (AUTO = device recommendation). */
  applyQuality(name?: QualityName) {
    const want: QualityName = name ?? (this.settings.quality === 'AUTO' ? this.recommended.preset : this.settings.quality);
    if (this.quality.name === want && !name) return;
    this.quality = PRESETS[want];
    this.renderer.shadowMap.enabled = this.quality.shadows; this.renderer.shadowMap.needsUpdate = true;
    this.world.q = this.quality; this.world.setShadows(this.quality.shadows);
    this.env.setQuality(this.quality);
    this.tex.setSize(this.quality.texSize);
    this.vehicles.setupLights();
    this.setupComposer(); this.applyResolution();
    this.fx.setScale(this.fx.scale);
    this.dynRes.scale = 1; this.dynRes.lowStreak = 0;
    this.hud?.toast(`Graphics: ${this.quality.name}`);
    // force a stream refresh around the player
    (this.world as any).lastCell = -1;
  }

  saveSettings() { this.saves.saveSettings(this.settings.toJSON()); }

  // ------------------------------------------------------------------------------------ lifecycle
  async newGame(slot: number) {
    this.hud.closeMenu();
    this.saves.currentSlot = slot;
    await this.hud.fade(true, 0.3);
    this.hud.showTitle(false);
    // reset state
    this.economy = new Economy(this); this.missions = new MissionSystem(this); this.vehicles.owned = [];
    this.player.loadout = defaultLoadout(); this.player.health = 100; this.player.armor = 0; this.player.mode = 'foot'; this.player.group.visible = true;
    const home = this.poi('safe_midtown');
    this.player.teleport(home.x, home.z + 3, Math.PI);
    this.env.frozen = false; this.env.setHour(9.2); this.env.setWeather('clear');
    this.police.clearWanted();
    await this.loadAround(home.x, home.z);
    this.cam.snapBehind(Math.PI);
    this.state = 'playing'; this.paused = false;
    const g = this.poi('garage_vance');
    this.markers.setWaypoint(g.x, g.z + 6);
    this.hud.toast('Welcome to Port Solano. Head to Vance Motorworks — the yellow marker.', 5);
    this.hud.subtitle('Kit', 'Eight years. Time to see who still remembers my name.', 5);
    await this.hud.fade(false, 0.5);
    this.audio.init();
    this.saves.save(slot);
  }

  async loadSlot(slot: number) {
    this.hud.closeMenu();
    await this.hud.fade(true, 0.3);
    this.hud.showTitle(false);
    const ok = await this.saves.load(slot);
    if (!ok) { this.hud.toast('Could not load that save'); this.hud.showTitle(true); await this.hud.fade(false, 0.2); return; }
    await this.hud.fade(false, 0.5);
    this.audio.init();
  }

  /** Called by SaveSystem.load */
  async applySave(d: any) {
    this.economy = new Economy(this); this.missions = new MissionSystem(this); this.vehicles.owned = [];
    this.economy.fromSave(d.economy); this.missions.fromSave(d.missions);
    this.player.mode = 'foot'; this.player.group.visible = true; this.player.fromSave(d.player);
    const w = d.world ?? {};
    this.env.frozen = false; this.env.setHour(w.hour ?? 9); this.env.day = w.day ?? 1; this.env.setWeather(w.weather ?? 'clear');
    this.police.clearWanted();
    for (const v of [...this.vehicles.list]) if (v.role === 'owned' || v.role === 'player') this.vehicles.remove(v);
    this.vehicles.owned = (w.vehicles ?? []).map((o: any) => ({ ...o }));
    await this.loadAround(this.player.x, this.player.z);
    for (const o of this.vehicles.owned) { if (o.stored) continue; const v = this.vehicles.spawnOwned(o, o.x, o.z, o.yaw); v.keepOwned = true; if (w.currentVehicle === o.uid) { /* player stands next to it */ } }
    (w.discovered ?? []).forEach((id: string) => this.markers.discovered.add(id));
    if (w.waypoint) this.markers.waypoint = w.waypoint;
    this.state = 'playing'; this.paused = false; this.cam.snapBehind(this.player.yaw);
    if (w.currentVehicle) { const v = this.vehicles.list.find((x) => x.ownerId === w.currentVehicle); if (v) { this.player.teleport(v.x, v.z); this.player.tryEnterVehicle(); } }
    this.hud.toast('Game loaded');
  }

  quitToTitle() { this.saves.save(this.saves.currentSlot).finally(() => location.reload()); }

  teleportTo(x: number, z: number, yaw = 0) {
    this.player.teleport(x, z, yaw);
    this.cam.snapBehind(yaw);
    (this.world as any).lastCell = -1;
    this.markers.clearWaypoint();
  }

  sleepUntil(hour: number, heal = true) {
    const e = this.env; let h = e.hour; if (hour <= h) e.day++; e.hour = hour; void h;
    if (heal) { this.player.health = this.player.maxHealth; this.player.stamina = 100; }
    this.hud.toast('You slept well'); this.saves.save(this.saves.currentSlot);
  }

  deliverOwned(uid: string) {
    const o = this.vehicles.owned.find((x) => x.uid === uid); if (!o) return;
    const live = this.vehicles.list.find((v) => v.ownerId === uid); if (live) this.vehicles.remove(live);
    const p = this.player; const x = p.x + Math.sin(p.yaw + 1.6) * 8, z = p.z + Math.cos(p.yaw + 1.6) * 8;
    this.vehicles.spawnOwned(o, x, z, p.yaw);
    this.hud.toast('Your vehicle has arrived');
  }

  // ------------------------------------------------------------------------------------ interaction
  contextAction(): { label: string; run: () => void } | null {
    // cache for a few frames so per-frame callers (HUD, touch) stay cheap
    this.ctxTimer -= 1;
    if (this.ctxTimer > 0) return this.contextCache;
    this.ctxTimer = 3;
    this.contextCache = this.computeContext();
    return this.contextCache;
  }
  private computeContext(): { label: string; run: () => void } | null {
    const p = this.player;
    if (this.state !== 'playing' || p.mode === 'dead' || p.mode === 'cutscene' || p.mode === 'entering') return null;
    if (this.interiors.active) return this.interiors.nearestAction();
    if (p.inVehicle) return { label: p.vehicle!.isHeli && p.vehicle!.heliAlt > 3.5 ? 'Land to exit' : 'Exit vehicle', run: () => p.exitVehicle() };
    const hc = this.hud.getContext(); if (hc) return hc;
    const ms = this.missions.contextStart(); if (ms) return ms;
    if (p.mode !== 'foot' && p.mode !== 'swim') return null;
    // POI door
    for (const poi of POIS) {
      if (Math.hypot(poi.x - p.x, poi.z - p.z) < 3.0 && poi.kind !== 'construction') {
        const open = this.economy.isOpen(poi);
        return { label: open ? `Enter ${poi.name}` : `${poi.name} (closed)`, run: () => this.interiors.enter(poi) };
      }
    }
    // vehicle
    const v = p.nearestVehicle(3.8);
    if (v && !(v.def.cls === 'heli' && v.driver)) {
      const name = `${v.def.maker} ${v.def.name}`;
      const label = v.driver && v.driver.kind === 'npc' ? `Carjack ${name}` : v.locked ? `Break into ${name}` : `Enter ${name}`;
      // prefer NPC if closer
      const n = this.peds.nearestNpc(p.x, p.z, 2.2, (o) => !o.dead && o.knocked <= 0 && o.faction !== 'cop' && o.faction !== 'swat' && o.faction !== 'gang' && o.faction !== 'rival');
      const dv = Math.hypot(v.x - p.x, v.z - p.z) - v.def.len * 0.3;
      if (!n || dv < Math.hypot(n.x - p.x, n.z - p.z)) return { label, run: () => p.tryEnterVehicle() };
    }
    const n = this.peds.nearestNpc(p.x, p.z, 2.4, (o) => !o.dead && o.knocked <= 0 && !['cop', 'swat', 'gang', 'rival', 'target'].includes(o.faction));
    if (n) return { label: p.aiming && p.currentWeapon.kind === 'ranged' ? `Rob ${n.name}` : `Talk to ${n.name.split(' ')[0]}`, run: () => this.peds.interactNearest() };
    return null;
  }
  contextPress() {
    const ca = this.contextAction(); this.ctxTimer = 0;
    const p = this.player;
    if (p.inVehicle) { p.exitVehicle(); return; }
    ca?.run();
  }

  // ------------------------------------------------------------------------------------ input shortcuts
  private onKey(e: KeyboardEvent) {
    if (this.state !== 'playing') return;
    if (e.code === 'Escape') { if (this.hud.menuOpen) this.hud.closeMenu(); else if (this.hud.phoneOpen) this.hud.togglePhone(false); else if (this.hud.mapOpen) this.hud.openMap(false); else this.hud.togglePause(); }
  }

  private handleGlobalInput() {
    const inp = this.input;
    if (inp.consume('map')) this.hud.openMap(!this.hud.mapOpen);
    if (inp.consume('phone')) this.hud.togglePhone();
    if (inp.consume('pause')) { if (this.hud.menuOpen) this.hud.closeMenu(); else this.hud.togglePause(); }
    if (this.paused) return;
    const p = this.player;
    if (p.mode === 'foot' || p.mode === 'swim') { if (inp.consume('enter') || inp.consume('interact')) this.contextPress(); }
    if (inp.wasPressed('skip')) this.hud.skipRequested = true;
  }

  // ------------------------------------------------------------------------------------ main loop
  private loop(now: number) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.last) / 1000; this.last = now;
    dt = clamp(dt, 0.001, 0.05);
    this.input.poll();
    try {
      if (this.state === 'title') this.updateTitle(dt);
      else if (this.state === 'playing') this.updatePlaying(dt);
    } catch (err) { console.error(err); }
    this.renderFrame(dt);
    this.input.endFrame();
  }

  private updateTitle(dt: number) {
    this.titleT += dt;
    const a = this.titleT * 0.06 + 0.6, R = 150;
    const cx = 260, cz = -140;
    const pos = new THREE.Vector3(cx + Math.cos(a) * R, 55 + Math.sin(this.titleT * 0.13) * 14, cz + Math.sin(a) * R);
    this.cam.camera.position.copy(pos); this.cam.camera.lookAt(cx, 28, cz); this.cam.camera.fov = 52; this.cam.camera.updateProjectionMatrix();
    this.env.update(dt, this.cam.camera, new THREE.Vector3(cx, 0, cz));
    this.world.setNight(this.env.night);
    this.world.update(cx, cz, pos.x, pos.y, pos.z, 4);
    this.vehicles.update(dt); this.traffic.update(dt); this.peds.update(dt); this.fx.update(dt);
    this.hud.update(dt);
    this.audio.listener.x = pos.x; this.audio.listener.z = pos.z;
    this.perf(dt);
  }

  private updatePlaying(dt: number) {
    this.handleGlobalInput();
    this.touch.updateVisibility();
    if (this.paused) { this.hud.update(dt); this.audio.update(dt); return; }
    this.time += dt;
    const p = this.player, inp = this.input;
    // time of day scale: 1 game minute = 1 real second by default
    // camera look input
    const sens = (p.aiming ? 0.6 : 1) * (inp.lastDevice === 'touch' ? 1 : 1);
    if (inp.lookX || inp.lookY) { this.cam.addLook(inp.lookX, inp.lookY, sens, this.settings.invertY); }
    // simulate
    p.update(dt);
    this.interiors.update(dt);
    const inInterior = !!this.interiors.active;
    if (!inInterior) {
      this.vehicles.update(dt); this.traffic.update(dt); this.peds.update(dt); this.police.update(dt); this.emergency.update(dt); this.events.update(dt);
    } else this.peds.bubbles.length = 0;
    this.combat.update(dt); this.props.update(dt); this.missions.update(dt); this.economy.update(dt);
    this.fx.update(dt);
    this.markers.update(dt);
    this.saves.update(dt);
    // environment
    if (!inInterior) { this.env.update(dt, this.cam.camera, new THREE.Vector3(p.x, p.y, p.z)); this.world.setNight(this.env.night); this.applyWetness(); }
    // streaming (only follows player outside)
    if (!inInterior) { this.world.update(p.x, p.z, this.cam.camera.position.x, this.cam.camera.position.y, this.cam.camera.position.z, this.quality.buildBudgetMs * (this.dynRes.scale < 0.7 ? 0.6 : 1)); if (this.world.propSpots.length) this.props.spawnFromSpots(this.world.propSpots); }
    // camera
    this.updateCamera(dt);
    // audio & hud
    this.audio.update(dt);
    this.hud.update(dt);
    // texture streaming sweep
    this.nextTexSweep -= dt; if (this.nextTexSweep <= 0) { this.nextTexSweep = 60; this.tex.sweep(); }
    // drunk effect
    if (this.economy.buffs.tipsy > 0) { this.cam.camera.rotation.z += Math.sin(this.time * 1.7) * 0.03; }
    this.perf(dt);
  }

  private applyWetness() {
    const w = this.env.wet;
    this.world.flatMat.roughness = 0.92 - w * 0.5; this.world.wallMat.roughness = 0.55 - w * 0.25;
    this.world.flatMat.color.setScalar(1 - w * 0.22); this.world.wallMat.color.setScalar(1 - w * 0.15);
    for (const v of this.vehicles.list) v.userData.wet = w;
  }

  private updateCamera(dt: number) {
    const p = this.player, cam = this.cam, v = p.vehicle;
    const tgt = new THREE.Vector3(p.x, p.y, p.z);
    let mode: 'walk' | 'drive' | 'combat' | 'heli' | 'boat' | 'interior' = 'walk';
    const opt: any = {};
    if (this.interiors.active) mode = 'interior';
    else if (p.inVehicle && v) { tgt.set(v.x, v.y, v.z); mode = v.isHeli ? 'heli' : v.isBoat ? 'boat' : 'drive'; opt.speed = v.speed; opt.heading = v.isHeli ? v.yaw : Math.atan2(v.worldVx, v.worldVz) * (v.speed > 4 ? 1 : 0) + (v.speed > 4 ? 0 : v.yaw); opt.vehicleLen = v.def.len; if (v.vLong < -2) opt.heading = v.yaw; }
    else if (p.aiming || (p.inCover && this.input.isHeld('aim'))) mode = 'combat';
    else { opt.sprinting = p.sprinting; opt.speed = Math.hypot(p.vx, p.vz); if (p.mode === 'dead') opt.speed = 0; }
    if (p.mode === 'swim') { tgt.y = p.y + 0.6; }
    if (p.mode === 'climb' || p.mode === 'roll') tgt.y += 0.1;
    cam.update(dt, tgt, { mode, ...opt, shoulder: 0.55 });
    // keep listener aligned
    void dt;
  }

  private renderFrame(dt: number) {
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.env.scene, this.cam.camera);
  }

  /** performance governor: dynamic resolution + automatic preset downgrade */
  private perf(dt: number) {
    this.perfT += dt;
    if (this.dynRes.update(dt, this.quality.targetFps)) this.applyResolution();
    if (this.dynRes.lowStreak > 8 && this.settings.quality === 'AUTO' && this.quality.name !== 'LOW') {
      const order: QualityName[] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA']; const i = order.indexOf(this.quality.name);
      this.dynRes.lowStreak = 0; this.applyQuality(order[Math.max(0, i - 1)]); this.hud.toast('Lowered graphics to keep the game smooth');
    }
  }
}
