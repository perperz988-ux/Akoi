import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { Input } from '../core/input';
import { CameraRig } from '../core/camera';
import { Environment } from '../render/env';
import { Water } from '../render/water';
import { Fx } from '../render/fx';
import { SHARED } from '../render/materials';
import { World } from '../world/world';
import * as L from '../world/layout';
import { Audio } from '../audio/audio';
import { VehicleManager } from '../vehicles/manager';
import type { Vehicle } from '../vehicles/vehicle';
import { Traffic } from '../ai/traffic';
import { Peds } from '../ai/peds';
import { Police } from '../ai/police';
import { Combat } from '../combat/combat';
import { Player, HeroState } from '../actors/player';
import { Partner } from '../actors/partner';
import { Actor } from '../actors/actor';
import { ROSA, JACE } from '../actors/humanoid';
import { PRESETS, Quality, SettingsData, loadSettings, saveSettings, recommendPreset, isTouchDevice } from './settings';
import { Hud } from '../ui/hud';
import { Phone } from '../ui/phone';
import { Touch } from '../ui/touch';
import { Menus } from '../ui/menus';
import { Economy } from './economy';
import { Interiors } from './interiors';
import { Missions } from './missions';
import { Events } from './events';
import { Pickups } from './pickups';
import { SaveSystem } from './save';
import { clamp, rng } from '../core/math';
import { WEAPONS } from '../combat/weapons';

class Bus { private m = new Map<string, ((d: any) => void)[]>(); on(e: string, f: (d: any) => void) { (this.m.get(e) ?? this.m.set(e, []).get(e)!).push(f); } emit(e: string, d?: any) { for (const f of this.m.get(e) ?? []) try { f(d); } catch (err) { console.error(err); } } }
export interface Line { who: 'player' | 'partner' | string; text: string; dur?: number }

export class Game {
  renderer: THREE.WebGLRenderer; composer: EffectComposer | null = null; private vignette: ShaderPass | null = null;
  scene: THREE.Scene; settings: SettingsData = loadSettings(); q: Quality;
  input: Input; cam: CameraRig; env!: Environment; water!: Water; world!: World; fx!: Fx; audio = new Audio();
  vehicles!: VehicleManager; traffic!: Traffic; peds!: Peds; police!: Police; combat!: Combat;
  player!: Player; partner!: Partner; hud!: Hud; phone!: Phone; touch!: Touch; menus!: Menus;
  economy!: Economy; interiors!: Interiors; missions!: Missions; events!: Events; pickups!: Pickups; saves!: SaveSystem;
  bus = new Bus(); time = 0; state: 'boot' | 'title' | 'play' = 'boot'; paused = false; timeScale = 1;
  cheats = { god: false, infAmmo: false, noWanted: false };
  heroes: Record<'rosa' | 'jace', HeroState | null> = { rosa: null, jace: null };
  bond = 50; // duo relationship (dialogue choices move it)
  private last = performance.now(); private frustum = new THREE.Frustum(); private fpsT = 0; private frames = 0; fps = 60; private slowT = 0;
  private convQueue: { line: Line; t: number }[] = []; private convT = 0;
  captureCb: ((url: string) => void) | null = null;
  autoTuned = false;

  constructor(private canvas: HTMLCanvasElement, private ui: HTMLElement) {
    const preset = this.settings.preset === 'AUTO' ? recommendPreset() : this.settings.preset;
    this.q = { ...PRESETS[preset] };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.q.antialias && !this.q.bloom, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 0.6;
    this.renderer.shadowMap.enabled = this.q.shadows; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.hud?.fatal('The graphics driver reset. Tap to reload.', true); });
    this.scene = new THREE.Scene();
    this.input = new Input(canvas); this.input.sensitivity = this.settings.sensitivity; this.input.invertY = this.settings.invertY;
    this.cam = new CameraRig(innerWidth / innerHeight); this.cam.shakeEnabled = this.settings.cameraShake;
  }

  async init(progress: (f: number, msg: string) => void) {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    progress(0.1, 'Lighting the sky'); await tick();
    this.env = new Environment(this.renderer, this.q); this.scene = this.env.scene;
    this.env.onThunder = () => { this.audio.thunder(); this.cam.addShake(0.08); };
    progress(0.2, 'Raising Bahía Verde'); await tick();
    this.world = new World(this.q); this.scene.add(this.world.group);
    this.water = new Water(this.q.waterSegs); this.scene.add(this.water.mesh);
    this.fx = new Fx(this.scene, this.q.name === 'LOW' ? 1200 : 2500);
    progress(0.35, 'Fuelling the traffic'); await tick();
    this.vehicles = new VehicleManager(this); this.traffic = new Traffic(this); this.peds = new Peds(this); this.police = new Police(this); this.combat = new Combat(this);
    this.economy = new Economy(this); this.interiors = new Interiors(this); this.pickups = new Pickups(this); this.events = new Events(this); this.saves = new SaveSystem(this);
    progress(0.45, 'Waking up Rosa & Jace'); await tick();
    this.player = new Player(this, ROSA); this.player.name = 'Rosa Delgado'; this.player.heroId = 'rosa'; this.scene.add(this.player.group);
    this.partner = new Partner(this, JACE); this.partner.name = 'Jace Holloway'; this.partner.heroId = 'jace'; this.scene.add(this.partner.group);
    this.hud = new Hud(this, this.ui); this.phone = new Phone(this, this.ui); this.touch = new Touch(this, this.ui); this.menus = new Menus(this, this.ui);
    this.missions = new Missions(this);
    this.setupPost(); this.resize();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') { this.menus.pause(true); this.saves.autosave(); } this.audio.suspend(document.hidden); });
    // title-screen backdrop: stream the world around downtown
    const sp = L.poiById('motel');
    this.player.placeAt(sp.door.x + 2, sp.door.z, -Math.PI / 2); this.partner.placeAt(sp.door.x + 2, sp.door.z + 1.5, -Math.PI / 2);
    for (let i = 0; i < 60 && this.world.pending > 0 || i < 3; i++) { this.world.update(600, -100, 6); progress(0.5 + 0.45 * (i / 60), 'Streaming the city'); if (i % 4 === 0) await tick(); }
    this.env.setHour(18.2); this.env.setWeather('clear');
    progress(1, 'Ready');
    this.state = 'title';
    requestAnimationFrame((t) => this.loop(t));
  }

  // ------------------------------------------------------------------ rendering
  private setupPost() {
    this.composer?.dispose(); this.composer = null;
    if (!this.q.bloom) return;
    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: this.q.antialias ? 4 : 0 });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.cam.cam));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.5, 0.95));
    c.addPass(new OutputPass());
    this.vignette = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uAmt: { value: 0.32 }, uHurt: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmt, uHurt; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv-0.5; float v = 1.0 - dot(d,d)*uAmt*2.2; c.rgb *= v; c.rgb = mix(c.rgb, vec3(dot(c.rgb, vec3(0.3,0.59,0.11))), uHurt*0.6); c.r += uHurt*0.08*(1.0-v); gl_FragColor = c; }` });
    c.addPass(this.vignette);
    this.composer = c;
  }
  resize() {
    const pr = Math.min(devicePixelRatio || 1, this.q.pixelRatio) * this.settings.resScale * (this.dynScale ?? 1);
    this.renderer.setPixelRatio(pr); this.renderer.setSize(innerWidth, innerHeight, false);
    this.composer?.setPixelRatio(pr); this.composer?.setSize(innerWidth, innerHeight);
    this.cam.resize(innerWidth / innerHeight); this.fx?.setScale(innerHeight * pr * 0.9);
    this.touch?.layout();
  }
  dynScale = 1;
  applyQuality(p: Quality['name']) {
    this.q = { ...PRESETS[p] }; this.renderer.shadowMap.enabled = this.q.shadows;
    this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material; if (m) m.needsUpdate = true; });
    this.env.setQuality(this.q); this.world.setQuality(this.q); this.setupPost(); this.resize();
  }
  setSettings(s: Partial<SettingsData>) {
    Object.assign(this.settings, s); saveSettings(this.settings);
    this.input.sensitivity = this.settings.sensitivity; this.input.invertY = this.settings.invertY; this.cam.shakeEnabled = this.settings.cameraShake;
    this.audio.setVolumes({ master: this.settings.volMaster, sfx: this.settings.volSfx, music: this.settings.volMusic });
    if (s.preset) this.applyQuality(s.preset === 'AUTO' ? recommendPreset() : s.preset);
    if (s.resScale !== undefined) this.resize();
    this.touch?.layout();
  }

  // ------------------------------------------------------------------ game flow
  async newGame(slot: number) {
    this.saves.slot = slot;
    await this.hud.fade(true);
    this.resetWorld();
    this.economy.reset(); this.missions.reset(); this.phone.reset(); this.bond = 50;
    const m = L.poiById('motel');
    this.player.fromState(this.defaultHero('rosa', m.door.x + 2.5, m.door.z - 1)); this.partner.rebuild(JACE); this.partner.name = 'Jace Holloway'; this.partner.heroId = 'jace';
    this.heroes = { rosa: this.player.toState(), jace: this.defaultHero('jace', m.door.x + 2.5, m.door.z + 1) };
    this.partner.placeAt(m.door.x + 2.5, m.door.z + 1, Math.PI / 2); this.partner.hp = this.partner.maxHp; this.partner.dead = false; this.partner.equip('pistol'); this.partner.ammo.pistol = 999;
    this.env.setHour(9.5); this.env.day = 1; this.env.setWeather('clear');
    this.cam.snapBehind(this.player.yaw);
    await this.preload();
    this.state = 'play'; this.menus.showTitle(false); this.hud.show(true); this.touch.show(true);
    await this.hud.fade(false);
    this.audio.init();
    this.missions.startStory();
    this.saves.save();
  }
  defaultHero(id: 'rosa' | 'jace', x: number, z: number): HeroState {
    return id === 'rosa'
      ? { id, name: 'Rosa Delgado', look: ROSA, hp: 200, armor: 0, weapons: ['fists', 'pistol'], ammo: { pistol: 45 }, mag: { pistol: 15 }, weapon: 'fists', skills: { driving: 0.45, shooting: 0.25, stamina: 0.3, strength: 0.15, stealth: 0.35 }, x, z, yaw: Math.PI / 2 }
      : { id, name: 'Jace Holloway', look: JACE, hp: 200, armor: 0, weapons: ['fists', 'pistol', 'bat'], ammo: { pistol: 60 }, mag: { pistol: 15 }, weapon: 'fists', skills: { driving: 0.25, shooting: 0.45, stamina: 0.3, strength: 0.4, stealth: 0.15 }, x, z, yaw: Math.PI / 2 };
  }
  async preload() {
    for (let i = 0; i < 120 && (this.world.pending > 0 || i < 4); i++) { this.world.update(this.player.x, this.player.z, 4); if (i % 3 === 0) await new Promise((r) => setTimeout(r, 0)); }
  }
  resetWorld() {
    for (const v of [...this.vehicles.list]) this.vehicles.remove(v);
    for (const a of [...this.peds.list]) this.peds.remove(a);
    this.police.clear(); this.police.stars = 0; this.pickups.clear(); this.interiors.leave(true);
    if (this.player.vehicle) this.player.exitVehicle(true);
    this.player.mode = 'foot'; this.player.dead = false; this.player.knockT = 0;
  }

  // ------------------------------------------------------------------ main loop
  private loop(now: number) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    this.frames++; this.fpsT += dt; if (this.fpsT >= 1) { this.fps = this.frames / this.fpsT; this.frames = 0; this.fpsT = 0; this.governor(); }
    try {
      this.input.poll();
      if (this.state === 'title') this.updateTitle(dt);
      else if (this.state === 'play') this.updatePlay(dt);
      this.render();
      if (this.captureCb) { const cb = this.captureCb; this.captureCb = null; try { cb(this.canvas.toDataURL('image/jpeg', 0.85)); } catch { cb(''); } }
    } catch (err) { console.error(err); this.hud?.error(String((err as Error)?.message ?? err)); }
    this.input.endFrame();
  }
  /** Dynamic resolution to hold frame rate on phones. */
  private governor() {
    if (this.state !== 'play') return;
    const target = this.q.name === 'LOW' ? 28 : 40;
    if (this.fps < target - 4) { this.slowT++; if (this.dynScale > 0.6) { this.dynScale = Math.max(0.6, this.dynScale - 0.08); this.resize(); } else if (this.slowT > 8 && this.settings.preset === 'AUTO' && this.q.name !== 'LOW') { const order: Quality['name'][] = ['LOW', 'MEDIUM', 'HIGH', 'ULTRA']; this.applyQuality(order[order.indexOf(this.q.name) - 1]); this.dynScale = 1; this.slowT = 0; this.resize(); this.hud.toast(`Graphics lowered to ${this.q.name} for smoother play`); } }
    else if (this.fps > target + 15 && this.dynScale < 1) { this.slowT = 0; this.dynScale = Math.min(1, this.dynScale + 0.05); this.resize(); }
  }
  private updateTitle(dt: number) {
    this.time += dt;
    const a = this.time * 0.04; const c = new THREE.Vector3(600, 0, -100);
    this.cam.cam.position.set(c.x + Math.cos(a) * 520, 120 + Math.sin(this.time * 0.1) * 20, c.z + Math.sin(a) * 520); this.cam.cam.lookAt(c.x, 40, c.z); this.cam.cam.fov = 50; this.cam.cam.updateProjectionMatrix();
    this.env.update(dt, this.cam.cam, c, this.time); this.world.update(c.x, c.z, 1); this.world.tick(this.time, this.env.night);
    this.water.update(this.time, this.cam.cam, this.env.sunDir, this.env.sun.color, this.env.fogColor, this.env.night, this.env.cur.wind, this.env.rainAmt);
    SHARED.uWet.value = this.env.wet;
  }
  private updatePlay(rawDt: number) {
    const inp = this.input;
    if (inp.consume('pause')) { if (this.phone.open) this.phone.toggle(false); else if (this.hud.mapOpen) this.hud.openMap(false); else this.menus.pause(!this.paused); }
    if (inp.consume('phone') && !this.paused) this.phone.toggle();
    if (inp.consume('map') && !this.paused) this.hud.openMap(!this.hud.mapOpen);
    if (this.paused) { this.hud.update(0); return; }
    const slow = this.player.specialOn ? 0.45 : 1;
    const dt = rawDt * this.timeScale * slow;
    this.time += dt;
    const P = this.player;
    // camera look
    if (!this.phone.open || this.phone.cameraMode) this.cam.addLook(inp.lookX, inp.lookY);
    if (this.phone.open && !this.phone.cameraMode) { inp.moveX = inp.moveY = 0; inp.held.clear(); }
    if (inp.consume('skip')) this.missions.skip();
    P.update(dt); this.partner.update(dt);
    if (!this.interiors.active) {
      this.traffic.update(dt); this.traffic.updateParked(dt); this.vehicles.update(dt); this.peds.update(dt); this.police.update(dt); this.events.update(dt);
    } else { this.interiors.update(dt); }
    this.missions.update(dt); this.economy.update(dt); this.pickups.update(dt); this.fx.update(dt); this.phone.update(dt);
    this.updateConversation(rawDt);
    // environment & streaming
    const focus = new THREE.Vector3(P.x, P.y, P.z);
    this.env.update(dt, this.cam.cam, focus, this.time);
    this.world.update(P.x, P.z, 1); this.world.tick(this.time, this.env.night);
    this.water.update(this.time, this.cam.cam, this.env.sunDir, this.env.sun.color, this.env.fogColor, this.env.night, this.env.cur.wind, this.env.rainAmt);
    SHARED.uWet.value = this.env.wet;
    this.updateCamera(rawDt);
    // audio mix
    const v = P.vehicle; let sirenD = 999; for (const c of this.police.cars) if (c.siren) sirenD = Math.min(sirenD, Math.hypot(c.x - P.x, c.z - P.z));
    const zone = L.zoneAt(P.x, P.z);
    this.audio.update(rawDt, { inCar: !!v, rpm: v?.rpm ?? 0, throttle: v?.throttle ?? 0, slip: v?.slip ?? 0, speed: v?.speed ?? 0, sirenDist: sirenD, rain: this.interiors.active ? 0 : this.env.rainAmt, wind: this.env.cur.wind, coast: clamp(1 - Math.abs(P.x - L.coastX(P.z)) / 200, 0, 1), city: zone === L.Zone.Downtown || zone === L.Zone.Midtown ? 1 : 0.4, swamp: zone === L.Zone.Swamp ? 1 : 0, night: this.env.night, radio: !!v && this.audio.station < 2, heavy: !!v && (v.def.cls === 'pickup' || v.def.cls === 'van' || v.def.cls === 'suv' || v.def.cls === 'muscle') });
    if (this.vignette) this.vignette.uniforms.uHurt.value = clamp(1 - P.hp / (P.maxHp * 0.4), 0, 1);
    this.hud.update(rawDt);
    this.saves.update(rawDt);
    if (P.mode === 'dead' && P.deadT2 > 4.5) this.respawnHospital();
  }
  private updateCamera(dt: number) {
    const P = this.player, v = P.vehicle;
    if (this.phone.cameraMode) { this.phone.updateCamera(dt); return; }
    if (this.interiors.active) { this.cam.update(dt, new THREE.Vector3(P.x, P.y, P.z), 'interior', { heading: P.yaw, speed: P.speed }); return; }
    if (v) this.cam.update(dt, new THREE.Vector3(v.x, v.y, v.z), 'car', { heading: Math.atan2(v.vx, v.vz) * (v.speed > 3 ? 1 : 0) + (v.speed > 3 ? 0 : v.yaw), speed: v.speed, vehLen: v.def.len });
    else this.cam.update(dt, new THREE.Vector3(P.x, P.y, P.z), P.aiming ? 'aim' : 'foot', { heading: P.yaw, speed: P.speed, sprint: P.sprinting });
  }
  private render() {
    const p = this.cam.cam;
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, p);
    this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(p.projectionMatrix, p.matrixWorldInverse));
  }

  // ------------------------------------------------------------------ queries & helpers
  get interiorActive() { return !!this.interiors?.active; }
  allActors(): Actor[] { const a: Actor[] = [...this.peds.list]; if (!this.partner.dead || true) a.push(this.partner); a.push(this.player); return a; }
  isVisible(x: number, y: number, z: number) { return this.frustum.containsPoint(new THREE.Vector3(x, y, z)) && Math.hypot(x - this.cam.cam.position.x, z - this.cam.cam.position.z) < this.q.fogFar; }
  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz); if (d < 0.01) return true;
    return L.raycastBuildings(ax, ay, az, dx / d, dy / d, dz / d, d) >= d - 0.3;
  }
  isOpen(p: L.Poi) { const h = this.env.hour; const [a, b] = p.open; return a <= b ? h >= a && h < b : h >= a || h < b; }
  /** A crime by the player: witnesses may call it in, nearby cops react instantly. */
  reportCrime(level: number, x: number, z: number, radius: number, violent = false) {
    if (this.missions.active?.noWanted) return;
    this.player.stats.crimes++;
    if (this.police.witness(level, x, z)) return;
    if (this.police.stars > 0) { this.police.report(level, x, z, null, false); return; }
    this.peds.panic(x, z, radius, level, this.player);
    void violent;
  }
  bubble(a: Actor, text: string) { this.hud.bubble(a, text); a.hum.talk = Math.min(3, text.length * 0.06); }
  vibrate(ms: number) { if (this.settings.vibration && navigator.vibrate) try { navigator.vibrate(ms); } catch { /* */ } }

  /** Spoken lines with subtitles + lip movement on the speaking hero. */
  playConversation(lines: Line[], interrupt = false) {
    if (interrupt) this.convQueue = [];
    if (this.convQueue.length > 6) return;
    for (const l of lines) this.convQueue.push({ line: l, t: l.dur ?? Math.max(2.2, l.text.length * 0.065) });
  }
  private updateConversation(dt: number) {
    if (this.convT > 0) { this.convT -= dt; return; }
    const c = this.convQueue.shift(); if (!c) return;
    const who = c.line.who === 'player' ? this.player : c.line.who === 'partner' ? this.partner : null;
    const name = who ? who.name.split(' ')[0] : c.line.who;
    this.hud.subtitle(name, c.line.text, c.t);
    if (who) who.hum.talk = c.t * 0.9;
    this.convT = c.t + 0.25;
  }
  get speaking() { return this.convQueue.length > 0 || this.convT > 0; }

  tryContext(): boolean {
    const P = this.player;
    if (this.interiors.active) return this.interiors.interact();
    const m = this.missions.contextAt(P.x, P.z); if (m) { m(); return true; }
    for (const p of L.POIS) if (Math.hypot(p.door.x - P.x, p.door.z - P.z) < 2.6) { this.economy.enterPoi(p); return true; }
    const n = this.peds.nearest(P.x, P.z, 2.2, (a) => !a.dead && a.faction === 'civ' && !a.vehicle);
    if (n) { this.economy.talkTo(n); return true; }
    return false;
  }
  contextLabel(): string | null {
    const P = this.player; if (P.mode !== 'foot') return P.mode === 'vehicle' ? null : null;
    if (this.interiors.active) return this.interiors.label();
    const ml = this.missions.contextLabel(P.x, P.z); if (ml) return ml;
    for (const p of L.POIS) if (Math.hypot(p.door.x - P.x, p.door.z - P.z) < 2.6) return this.isOpen(p) ? `Enter ${p.name}` : `${p.name} — closed`;
    const v = P.nearestVehicle(3.6); if (v) return v.driver && (v.driver as any) !== this.partner ? `Carjack ${v.def.maker} ${v.def.name}` : `Enter ${v.def.maker} ${v.def.name}`;
    const n = this.peds.nearest(P.x, P.z, 2.2, (a) => !a.dead && a.faction === 'civ' && !a.vehicle); if (n) return P.aiming && WEAPONS[P.weapon].kind === 'gun' ? `Rob ${n.name.split(' ')[0]}` : `Talk to ${n.name.split(' ')[0]}`;
    return null;
  }

  /** Swap control between Rosa and Jace (the other becomes the AI partner). */
  switchCharacter() {
    const P = this.player, Q = this.partner;
    if (this.missions.active?.lockSwitch) { this.hud.toast('Can\'t switch right now'); return; }
    if (P.mode !== 'foot' && P.mode !== 'vehicle') return;
    if (Q.dead) { this.hud.toast(`${Q.name.split(' ')[0]} is down`); return; }
    const sameCar = P.vehicle && Q.vehicle === P.vehicle;
    if (P.vehicle && !sameCar) { this.hud.toast('Get out of the car first'); return; }
    const mine = P.toState(); const pState = { look: Q.look, name: Q.name, heroId: Q.heroId, x: Q.x, z: Q.z, yaw: Q.yaw, hp: Q.hp };
    const stored = this.heroes[Q.heroId] ?? this.defaultHero(Q.heroId, Q.x, Q.z);
    this.heroes[P.heroId] = mine;
    this.hud.flashSwitch(pState.name.split(' ')[0]);
    this.audio.notify();
    if (sameCar) {
      const v = P.vehicle!; const ps = Q.seat;
      this.vehicles.unseat(v, 0); this.vehicles.unseat(v, ps);
      P.fromState({ ...stored, look: pState.look, name: pState.name, id: pState.heroId, hp: pState.hp, x: v.x, z: v.z, yaw: v.yaw });
      Q.rebuild(mine.look); Q.name = mine.name; Q.heroId = mine.id; Q.hp = mine.hp;
      this.vehicles.seat(v, P, 0); P.mode = 'vehicle'; this.vehicles.seat(v, Q, ps);
    } else {
      P.fromState({ ...stored, look: pState.look, name: pState.name, id: pState.heroId, hp: pState.hp, x: pState.x, z: pState.z, yaw: pState.yaw });
      Q.rebuild(mine.look); Q.name = mine.name; Q.heroId = mine.id; Q.hp = mine.hp; Q.placeAt(mine.x, mine.z, mine.yaw);
      P.mode = 'foot'; this.cam.snapBehind(P.yaw);
    }
    Q.equip(mine.weapons.includes('smg') ? 'smg' : 'pistol'); Q.ammo[Q.weapon] = 999; Q.mag[Q.weapon] = WEAPONS[Q.weapon].mag;
    this.hud.weaponChanged();
  }

  // ------------------------------------------------------------------ events from subsystems
  onEnterVehicle(v: Vehicle) { this.hud.toast(`${v.def.maker} ${v.def.name}`, 1.6); if (v.stolen && v.role !== 'owned') this.bus.emit('stole', v); if (this.env.night > 0.4) v.lightsOn = true; this.bus.emit('enterVehicle', v); }
  onExitVehicle(v: Vehicle) { this.bus.emit('exitVehicle', v); }
  onVehicleImpact(v: Vehicle, f: number) {
    if (v === this.player.vehicle) { this.cam.addShake(Math.min(1, f / 14)); this.vibrate(Math.min(150, f * 10)); this.audio.impact(f); if (f > 9 && rng.chance(0.3)) this.partner.banter('crash'); }
    else if (Math.hypot(v.x - this.player.x, v.z - this.player.z) < 60) this.audio.impact(f * 0.5);
  }
  onPartnerHurt(a: Actor) { if (a.dead) { this.hud.toast(`${a.name.split(' ')[0]} is down!`); this.bus.emit('partnerDown'); } }
  onPlayerDeath() { this.hud.bigMessage('WASTED', 'Taken to Mercy Shores Hospital', '#c0392b'); this.audio.fail(); this.bus.emit('playerDied'); }
  private respawnHospital() {
    const P = this.player; const h = L.poiById('hospital');
    const bill = Math.min(this.economy.money, 500 + Math.floor(this.economy.money * 0.04));
    this.economy.spend(bill, 'Hospital bill'); this.police.clear(); this.police.stars = 0;
    P.dead = false; P.hp = P.maxHp; P.armor = 0; P.mode = 'foot'; P.placeAt(h.door.x + 2, h.door.z + 2, h.face); this.cam.snapBehind(P.yaw);
    if (this.partner.dead) this.partner.revive(h.door.x + 3, h.door.z + 3); else this.partner.placeAt(h.door.x + 3, h.door.z + 3);
    this.env.setHour(this.env.hour + 6); this.hud.toast(`Hospital bill: $${bill}`); this.missions.onRespawn();
  }
  busted() {
    const P = this.player; if (P.mode === 'busted') return; P.mode = 'busted';
    this.hud.bigMessage('BUSTED', 'Released from BVPD Central', '#2a6ac0'); this.audio.fail(); this.bus.emit('busted');
    setTimeout(() => {
      const st = L.poiById('police'); const fine = Math.min(this.economy.money, 300 + this.police.stars * 400);
      if (P.vehicle) P.exitVehicle(true);
      this.economy.spend(fine, 'Bail'); P.ammo = {}; for (const k of Object.keys(P.mag)) P.mag[k] = 0; P.mag.pistol = 0;
      this.police.clear(); this.police.stars = 0; P.mode = 'foot'; P.placeAt(st.door.x, st.door.z - 2, st.face); this.partner.placeAt(st.door.x + 1.5, st.door.z - 2); this.cam.snapBehind(P.yaw);
      this.env.setHour(this.env.hour + 8); this.hud.toast(`Bail: $${fine}. Weapons ammo confiscated.`); this.missions.onRespawn();
    }, 3000);
  }
  teleport(x: number, z: number, yaw = 0) {
    const P = this.player; if (P.vehicle) { const v = P.vehicle; v.place(x, z, yaw); } else P.placeAt(x, z, yaw);
    if (!this.partner.vehicle) this.partner.placeAt(x + 2, z + 1, yaw); this.cam.snapBehind(yaw);
  }
  capture(cb: (url: string) => void) { this.captureCb = cb; }
  quitToTitle() { this.saves.autosave(); setTimeout(() => location.reload(), 200); }
  static isTouch = isTouchDevice;
}
