// A flight session: aircraft + systems + physics + autopilot + cameras + UI, inside the shared world.
import * as THREE from 'three';
import { Engine } from '../core/Engine';
import { AircraftSpec, aircraftById, liveryById } from '../data/aircraft';
import { Airport, RunwayEnd, nearestAirports } from '../data/world';
import { FlightModel } from './FlightModel';
import { Autopilot } from './Autopilot';
import { CameraRig, CAM_LABEL } from './CameraRig';
import { FlightPlan, planFlight } from './Route';
import { buildAircraft, animateAircraft, AircraftParts } from '../aircraft/Model';
import { Cockpit, SysState } from '../aircraft/Cockpit';
import { weatherById } from '../world/Weather';
import { layoutOf, taxiRoute, endInfo, toLocal, isPaved, V2, Gate, toLatLon } from '../world/AirportLayout';
import { origin, FT, KT, NM, DEG, clamp, haversine, bearing, destination, isa, wrap180, G0, damp, lerp } from '../core/geo';
import { Input } from '../ui/Input';
import { Hud, landingReport } from '../ui/Hud';
import { TouchControls } from '../ui/Touch';
import { audio } from '../audio/Audio';
import { settings, isTouch } from '../game/Save';
import { Spawn } from '../game/Modes';

export interface FlightConfig {
  aircraft: string; livery?: string;
  dep: Airport; depEnd: RunwayEnd; arr?: Airport | null; arrEnd?: RunwayEnd | null;
  spawn: Spawn; weather: string; dynamicWeather?: boolean; hour: number;
  fuel?: number; payload?: number;
  mode: 'free' | 'career' | 'challenge' | 'explore';
  air?: { lat: number; lon: number; altFt: number; hdg: number };
  approachNm?: number; missionId?: string; title?: string;
}
export interface FlightResult { kind: 'landed' | 'crash' | 'quit'; landing?: LandingData; reason?: string; completedAt?: Airport | null; timeSec: number; distNm: number }
export interface LandingData { vs: number; g: number; centerline: number; tdz: number; speedErr: number; bank: number; score: number; grade: string; notes: string[]; airport: Airport | null }

export class Flight {
  spec: AircraftSpec; fm: FlightModel; ap: Autopilot; rig: CameraRig; parts: AircraftParts; cockpit: Cockpit;
  plan: FlightPlan | null = null; hud: Hud; touch: TouchControls | null = null;
  sys: SysState = { lights: { nav: false, beacon: false, strobe: false, landing: false, taxi: false, logo: false, panel: false }, battery: false, apu: false, apuN: 0, seatbelt: false, doorOpen: false, fuelPumps: false };
  private accum = 0; private time = 0; private paused = false; private ready = false; private loadT = 0;
  private taxiLine: THREE.Mesh | null = null; private taxiPts: V2[] = []; private taxiIdx = 0; private gate: Gate | null = null;
  private pushback: { t: number; dur: number; from: THREE.Vector3; hdg0: number; hdg1: number; dist: number; dir: THREE.Vector3; tug: THREE.Object3D } | null = null;
  private autoStart: { step: number; t: number } | null = null;
  private landing: LandingData | null = null; private touchdownT = -1; private reported = false; private airborneOnce = false; private callouts = new Set<number>();
  private distFlown = 0; private lastLL = { lat: 0, lon: 0 };
  private onEnd: (r: FlightResult) => void;
  private lightsMode = 0; private warnings: string[] = []; private wind = new THREE.Vector3();
  private shiftFn = (dx: number, dz: number) => { this.fm.pos.x -= dx; this.fm.pos.z -= dz; this.rig.shiftBy(dx, dz); };
  private overlay: HTMLElement | null = null;
  constructor(private engine: Engine, private input: Input, public cfg: FlightConfig, private uiRoot: HTMLElement, onEnd: (r: FlightResult) => void) {
    this.onEnd = onEnd;
    this.spec = aircraftById(cfg.aircraft);
    const s = this.spec;
    // world placement
    const spawnLL = this.spawnLatLon();
    origin.set(spawnLL.lat, spawnLL.lon);
    engine.setLocalTime(cfg.hour, spawnLL.lon);
    const wx = weatherById(cfg.weather); engine.weather.set(wx, !!cfg.dynamicWeather);
    engine.weather.airportElevM = cfg.dep.elevM;
    if (cfg.spawn === 'approach' && cfg.arr) engine.weather.airportElevM = cfg.arr.elevM;
    (engine.weather as any).cur.tempDev = wx.tempDev;
    // physics
    this.fm = new FlightModel(s); this.fm.assist = settings.assist;
    (this.fm as any).tempDev = wx.tempDev;
    this.fm.setLoad(cfg.fuel ?? (cfg.arr ? 0.6 : 0.5), cfg.payload ?? 0.6);
    this.fm.surfaceFriction = wx.snow > 0.3 ? 0.35 : wx.rain > 0.3 ? 0.65 : 1;
    this.fm.heightAt = (x, z) => this.groundAt(x, z);
    this.fm.onTouchdown = (vs, g) => this.touchdown(vs, g);
    this.ap = new Autopilot(this.fm);
    // flight plan
    if (cfg.arr && cfg.arrEnd && cfg.arr !== cfg.dep) { this.plan = planFlight(cfg.dep, cfg.arr, cfg.depEnd, cfg.arrEnd, s); this.ap.plan = this.plan; }
    else if (cfg.arr && cfg.arrEnd) { this.plan = planFlight(cfg.dep, cfg.arr, cfg.depEnd, cfg.arrEnd, s); this.ap.plan = this.plan; }
    // aircraft visuals
    this.parts = buildAircraft(s, { lod: 'high', livery: liveryById(cfg.livery ?? (s.category === 'General Aviation' ? 'ga' : 'house')) });
    engine.scene.add(this.parts.root);
    this.cockpit = new Cockpit(s, this.parts.cockpitEye);
    this.parts.body.add(this.cockpit.group);
    this.rig = new CameraRig(innerWidth / innerHeight);
    this.rig.groundAt = (x, z) => this.groundAt(x, z).h;
    this.rig.towerPoint = () => { const sc = engine.airports.get((this.nearAirport() ?? cfg.dep).icao); if (!sc) return null; const t = sc.layout.tower; return new THREE.Vector3(t[0], 0, t[1]).add(sc.group.position).add(new THREE.Vector3(0, 60, 0)); };
    this.rig.setMode(cfg.spawn === 'gate' ? 'chase' : cfg.spawn === 'approach' ? 'chase' : 'chase');
    this.rig.yaw = cfg.spawn === 'gate' ? 25 : 0;
    origin.onShift(this.shiftFn);
    // airports: departure with reserved gate
    engine.airports.clear();
    const depSc = engine.airports.pin(cfg.dep, { reserveGate: cfg.spawn === 'gate', playerSpan: s.span });
    if (cfg.arr && cfg.arr !== cfg.dep) engine.airports.pin(cfg.arr);
    this.gate = depSc.playerGate;
    engine.terrain.prefetch(spawnLL.lat, spawnLL.lon);
    if (cfg.arr) engine.terrain.prefetch(cfg.arr.lat, cfg.arr.lon);
    // UI
    this.hud = new Hud(uiRoot);
    if (isTouch()) this.touch = new TouchControls(uiRoot, input, this.touchActions());
    this.bindKeys();
    this.input.lookDrag = (dx, dy) => { if (!this.paused) this.rig.look(dx, dy); };
    this.input.zoom = f => this.rig.zoom(f);
    this.input.click = (x, y) => this.cockpitClick(x, y);
    this.input.invertPitch = settings.invertPitch; this.input.sensitivity = settings.sensitivity; this.input.tilt.enabled = settings.tilt;
    audio.init(s.engines.count, s.engines.type === 'piston'); audio.setVolume(settings.volume); audio.voice = settings.voice;
    engine.weather.onThunder = (d, p) => { audio.thunder(d, p); };
    engine.timeScale = settings.timeScale;
    this.showLoading();
  }

  private spawnLatLon() {
    const c = this.cfg;
    if (c.spawn === 'air' && c.air) return { lat: c.air.lat, lon: c.air.lon };
    if (c.spawn === 'approach' && c.arr && c.arrEnd) return destination(c.arrEnd.lat, c.arrEnd.lon, c.arrEnd.hdg + 180, (c.approachNm ?? 8) * NM);
    return { lat: c.dep.lat, lon: c.dep.lon };
  }

  private showLoading() {
    const o = this.overlay = document.createElement('div'); o.className = 'loading';
    o.innerHTML = `<div class="ld-box"><div class="ld-title">${this.cfg.title ?? 'PREPARING FLIGHT'}</div><div class="ld-sub">${this.spec.name} · ${this.cfg.dep.icao} ${this.cfg.dep.name}${this.cfg.arr && this.cfg.arr !== this.cfg.dep ? ' → ' + this.cfg.arr.icao : ''}</div><div class="boot-bar"><i></i></div><div class="ld-msg">Streaming terrain elevation…</div></div>`;
    this.uiRoot.appendChild(o);
  }

  private finishLoading() {
    this.overlay?.remove(); this.overlay = null; this.ready = true;
    this.placeAtSpawn();
    const msg: Record<string, string> = {
      gate: `Parked at gate ${this.gate?.id ?? ''}. Cold & dark: BATTERY → ${this.spec.engines.type === 'piston' ? 'MAG/START' : 'APU → ENG'} (or press ENG / Ctrl+E for auto-start), then PUSHBACK (P).`,
      runway: `Lined up on runway ${this.cfg.depEnd.ident}. Release parking brake (.), full throttle, rotate at ${this.spec.vr} kt.`,
      approach: `Established on final for ${this.cfg.arrEnd?.ident}. Vref ${this.spec.vref} kt — two white, two red on the PAPI.`,
      cruise: 'Cruising on autopilot. Follow the magenta route.', air: 'Exploration flight — the world is yours.',
    };
    this.hud.message(msg[this.cfg.spawn] ?? '', 9);
  }

  private placeAtSpawn() {
    const c = this.cfg, s = this.spec, fm = this.fm;
    const L = layoutOf(c.dep);
    const depGroup = this.engine.airports.get(c.dep.icao)!.group;
    const lpos = (p: V2) => new THREE.Vector3(depGroup.position.x + p[0], 0, depGroup.position.z + p[1]);
    if (c.spawn === 'gate' && this.gate) {
      const p = lpos(this.gate.pos); const gh = this.groundAt(p.x, p.z).h;
      fm.place(p.x, p.z, gh, this.gate.hdg); fm.ctl.parkingBrake = true; fm.ctl.flapIdx = 0;
      this.sys.doorOpen = true;
      this.taxiPts = taxiRoute(L, this.gate, c.depEnd, s.length); this.taxiIdx = 0;
      this.buildTaxiLine(depGroup);
    } else if (c.spawn === 'runway' || (c.spawn === 'gate' && !this.gate)) {
      const ei = endInfo(L, c.depEnd); const thr = ei.thr; const p = lpos([thr[0] + ei.dir[0] * (s.length * 0.4 + 15), thr[1] + ei.dir[1] * (s.length * 0.4 + 15)]);
      fm.place(p.x, p.z, this.groundAt(p.x, p.z).h, c.depEnd.hdg);
      this.readyForFlight(); fm.ctl.parkingBrake = true; fm.ctl.flapIdx = this.takeoffFlap();
    } else if (c.spawn === 'approach' && c.arr && c.arrEnd) {
      const dist = (c.approachNm ?? 8) * NM;
      const p = destination(c.arrEnd.lat, c.arrEnd.lon, c.arrEnd.hdg + 180, dist);
      const alt = c.arr.elevM + 15 + Math.tan(3 * DEG) * dist;
      const v = (s.vref + 12) * KT / Math.sqrt(isa(alt).sigma);
      fm.ctl.flapIdx = fm.flapCount - 2; fm.flap = fm.ctl.flapIdx / (fm.flapCount - 1); fm.ctl.gearDown = true;
      const trim = this.trimEstimate(v, alt, -3);
      fm.place(origin.x(p.lon), origin.z(p.lat), 0, c.arrEnd.hdg, { alt, speed: v, pitch: trim.pitch });
      this.readyForFlight(); fm.ctl.throttle.fill(trim.thr); this.touch?.setThrottle(trim.thr);
      this.sys.lights.landing = true; this.sys.lights.strobe = true; this.lightsMode = 2;
      this.fm.vel.y = -v * Math.sin(3 * DEG);
      this.rig.setMode('chase');
    } else if ((c.spawn === 'cruise' && this.plan) || c.spawn === 'air') {
      let lat: number, lon: number, altM: number, hdg: number;
      if (c.spawn === 'cruise' && this.plan) {
        const w = this.plan.waypoints; const i = Math.max(2, Math.floor(w.length * 0.4)); const a = w[i - 1], b = w[i];
        lat = (a.lat + b.lat) / 2; lon = (a.lon + b.lon) / 2; altM = this.plan.cruiseFt * FT; hdg = bearing(lat, lon, b.lat, b.lon); this.ap.active = i;
      } else { lat = c.air!.lat; lon = c.air!.lon; altM = c.air!.altFt * FT; hdg = c.air!.hdg; }
      origin.set(lat, lon);
      for (const t of this.engine.terrain.tiles.values()) if (t.mesh) t.mesh.position.set(origin.x(t.cLon), 0, origin.z(t.cLat));
      for (const sc of this.engine.airports.active.values()) sc.place();
      const atm = isa(altM);
      const ktas = s.category === 'General Aviation' ? s.cruiseKtas : Math.min(s.cruiseMach * atm.a / KT, (s.vmo - 30) / Math.sqrt(atm.sigma));
      const v = Math.max(ktas, (s.vref + 60) / Math.sqrt(atm.sigma)) * KT;
      fm.ctl.gearDown = false; fm.ctl.flapIdx = 0; fm.flap = 0; fm.gear = 0;
      const trim = this.trimEstimate(v, altM, 0);
      fm.place(0, 0, 0, hdg, { alt: altM, speed: v, pitch: trim.pitch });
      fm.gear = 0;
      this.readyForFlight(); fm.ctl.throttle.fill(trim.thr); this.touch?.setThrottle(trim.thr);
      this.ap.engage(true); this.ap.altFt = Math.round(altM / FT / 100) * 100; this.ap.vert = 'ALT'; this.ap.hdg = Math.round(hdg);
      this.ap.lat = this.plan ? 'LNAV' : 'HDG'; this.ap.setAthr(true); this.ap.spdKt = Math.round(fm.st.ias / KT) || Math.round(v / KT * Math.sqrt(atm.sigma));
      this.sys.lights.landing = false;
    }
    this.lastLL = this.latLon();
    this.engine.focus.copy(fm.pos);
  }

  private trimEstimate(v: number, alt: number, gammaDeg: number) {
    const s = this.spec, fm = this.fm; const atm = isa(alt); const q = 0.5 * atm.rho * v * v;
    const CL = fm.mass * G0 * Math.cos(gammaDeg * DEG) / (q * s.wingArea);
    const fi = fm.ctl.flapIdx; const dCL = s.flapCL[fi] ?? 0;
    const alpha = (CL - dCL) / fm.CLa - 2.2 * DEG;
    const CD = s.cd0 + (s.flapCD[fi] ?? 0) + (fm.ctl.gearDown && !s.gear.fixed ? 0.016 : 0) + CL * CL / (Math.PI * s.oswald * fm.AR);
    const D = CD * q * s.wingArea + fm.mass * G0 * Math.sin(gammaDeg * DEG);
    const mach = v / atm.a; const lapse = Math.pow(atm.sigma, 0.75) * (1 - 0.35 * mach + 0.12 * mach * mach);
    let thr: number;
    if (s.engines.type === 'piston') thr = clamp(D / 2400 + 0.2, 0.2, 1);
    else { const Tmax = s.thrustN * s.engines.count * lapse; const frac = clamp((D / Tmax - 0.045) / 0.955, 0, 1); thr = clamp(Math.pow(frac, 1 / 1.5), 0.05, 1); }
    return { pitch: alpha / DEG + gammaDeg, thr };
  }
  private takeoffFlap() { const s = this.spec; return s.category === 'General Aviation' ? 1 : s.maker === 'Airbus' ? 2 : Math.min(2, s.flapDetents.length - 1); }

  private readyForFlight() {
    this.fm.forceRunning();
    Object.assign(this.sys, { battery: true, fuelPumps: true, seatbelt: true, doorOpen: false, apu: false });
    Object.assign(this.sys.lights, { nav: true, beacon: true, strobe: true, landing: true, taxi: false, logo: true });
    this.lightsMode = 2;
  }

  private buildTaxiLine(group: THREE.Object3D) {
    const pts = this.taxiPts; if (pts.length < 2) return;
    const pos: number[] = [], uv: number[] = [], idx: number[] = []; let acc = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; const nx = -dz / L * 0.7, nz = dx / L * 0.7;
      if (i > 0) acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      pos.push(pts[i][0] - nx, 0.4, pts[i][1] - nz, pts[i][0] + nx, 0.4, pts[i][1] + nz); uv.push(0, acc / 6, 1, acc / 6);
      if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const c = document.createElement('canvas'); c.width = 16; c.height = 64; const x = c.getContext('2d')!; x.fillStyle = 'rgba(60,255,120,0.95)'; x.fillRect(0, 0, 16, 40); x.clearRect(0, 40, 16, 24);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    this.taxiLine = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
    this.taxiLine.renderOrder = 3; group.add(this.taxiLine);
  }

  latLon() { return { lat: origin.latOf(this.fm.pos.z), lon: origin.lonOf(this.fm.pos.x) }; }

  groundAt(x: number, z: number) {
    const lat = origin.latOf(z), lon = origin.lonOf(x);
    const r = this.engine.terrain.heightAt(lat, lon);
    let h = r.h, grass = false;
    const ap = this.nearAirport();
    if (ap) {
      const L = layoutOf(ap); const p = toLocal(ap, lat, lon);
      if (Math.abs(p[0]) < 8000 && Math.abs(p[1]) < 8000) { if (isPaved(L, p)) { h = ap.elevM + 0.25; return { h, water: false, grass: false }; } else if (Math.abs(h - ap.elevM) < 3) grass = true; }
    }
    return { h, water: r.water, grass };
  }
  private _nearAp: Airport | null = null; private _nearT = 0;
  nearAirport() {
    if (performance.now() - this._nearT > 1000) {
      this._nearT = performance.now();
      const ll = this.latLon(); this._nearAp = nearestAirports(ll.lat, ll.lon, 1, 8000)[0]?.a ?? null;
    }
    return this._nearAp;
  }

  // ---------------- controls ----------------
  private touchActions() {
    return {
      gear: () => this.act('gear'), flapsUp: () => this.act('flapsUp'), flapsDown: () => this.act('flapsDown'), spoilers: () => this.act('spoilers'),
      reverse: () => this.act('reverse'), camera: () => this.act('camera'), ap: () => this.act('ap'), lights: () => this.act('lights'),
      engines: () => this.act('engines'), parking: () => this.act('parking'), map: () => this.act('map'), pause: () => this.act('pause'),
    };
  }
  private bindKeys() {
    const i = this.input; i.actions.clear();
    const m: [string, string][] = [['g', 'gear'], ['f', 'flapsDown'], ['v', 'flapsUp'], ['/', 'spoilers'], ['c', 'camera'], ['ctrl+e', 'engines'], ['l', 'lights'], ['n', 'nav'],
      ['.', 'parking'], ['p', 'pushback'], ['Escape', 'pause'], ['m', 'map'], ['h', 'hud'], ['r', 'reverse'], ['1', 'cam1'], ['2', 'cam2'], ['3', 'cam3'], ['4', 'cam4'], ['5', 'cam5'], ['6', 'cam6'],
      ['Tab', 'ap'], ['t', 'athr'], ['[', 'hdg-'], [']', 'hdg+'], [',', 'alt-'], ["'", 'alt+'], ['y', 'app'], ['k', 'lnav'], ['Insert', 'trimUp'], ['Delete', 'trimDn'], ['u', 'trimUp'], ['j', 'trimDn'], ['o', 'door']];
    for (const [k, a] of m) i.on(k, () => this.act(a));
    for (const a of ['gear', 'flapsDown', 'flapsUp', 'camera', 'spoilers', 'pause']) i.on('pad:' + a, () => this.act(a));
  }

  act(a: string) {
    const fm = this.fm, c = fm.ctl, s = this.spec;
    if (!this.ready && a !== 'pause') return;
    audio.click();
    switch (a) {
      case 'gear':
        if (s.gear.fixed) { this.hud.message('Fixed landing gear'); break; }
        if (fm.st.weightOnWheels && c.gearDown) { this.hud.message('Gear lever locked — weight on wheels'); break; }
        c.gearDown = !c.gearDown; this.hud.message(c.gearDown ? 'Gear DOWN' : 'Gear UP'); break;
      case 'flapsDown': c.flapIdx = Math.min(fm.flapCount - 1, c.flapIdx + 1); this.hud.message('Flaps ' + s.flapDetents[c.flapIdx]); break;
      case 'flapsUp': c.flapIdx = Math.max(0, c.flapIdx - 1); this.hud.message('Flaps ' + s.flapDetents[c.flapIdx]); break;
      case 'spoilers':
        if (s.category === 'General Aviation') break;
        if (!c.spoilerArmed && c.spoilers === 0) { c.spoilerArmed = true; this.hud.message('Ground spoilers ARMED'); }
        else if (c.spoilerArmed) { c.spoilerArmed = false; c.spoilers = 1; this.hud.message('Speed brakes EXTENDED'); }
        else { c.spoilers = 0; this.hud.message('Speed brakes RETRACTED'); }
        break;
      case 'reverse':
        if (s.engines.type === 'piston') break;
        if (!fm.st.weightOnWheels) { this.hud.message('Reverse thrust only on the ground'); break; }
        (this as any).rev = !(this as any).rev; this.hud.message((this as any).rev ? 'REVERSE THRUST' : 'Reverse stowed'); break;
      case 'camera': this.rig.next(); this.hud.message(CAM_LABEL[this.rig.mode], 1.5); break;
      case 'cam1': this.rig.setMode('cockpit'); break; case 'cam2': this.rig.setMode('pilot'); break; case 'cam3': this.rig.setMode('chase'); break;
      case 'cam4': this.rig.setMode('cinematic'); break; case 'cam5': this.rig.setMode('wing'); break; case 'cam6': this.rig.setMode('gear'); break;
      case 'ap':
        if (fm.st.weightOnWheels) { this.hud.message('Autopilot unavailable on the ground'); break; }
        this.ap.engage(); if (this.ap.engaged && !this.ap.athr && s.category !== 'General Aviation') this.ap.setAthr(true);
        this.hud.message(this.ap.engaged ? `AP ENGAGED — ${this.ap.lat} / ${this.ap.vert}` : 'AP DISCONNECTED'); if (!this.ap.engaged) audio.chime(); break;
      case 'athr': if (s.category === 'General Aviation') break; this.ap.setAthr(); this.hud.message(this.ap.athr ? 'A/THR ON' : 'A/THR OFF'); break;
      case 'hdg-': this.ap.hdg = (this.ap.hdg + 355) % 360; this.ap.lat = 'HDG'; break; case 'hdg+': this.ap.hdg = (this.ap.hdg + 5) % 360; this.ap.lat = 'HDG'; break;
      case 'alt-': this.ap.altFt = Math.max(1000, this.ap.altFt - 1000); this.ap.vert = 'VS'; this.ap.vsFpm = -1500; break;
      case 'alt+': this.ap.altFt = Math.min(s.ceilingFt, this.ap.altFt + 1000); this.ap.vert = 'VS'; this.ap.vsFpm = s.category === 'General Aviation' ? 600 : 2000; break;
      case 'vs-': this.ap.vert = 'VS'; this.ap.vsFpm -= 500; break; case 'vs+': this.ap.vert = 'VS'; this.ap.vsFpm += 500; break;
      case 'spd-': this.ap.spdKt = Math.max(100, this.ap.spdKt - 5); break; case 'spd+': this.ap.spdKt = Math.min(s.vmo, this.ap.spdKt + 5); break;
      case 'lnav': if (this.plan) { this.ap.lat = 'LNAV'; this.hud.message('LNAV'); } else this.hud.message('No flight plan'); break;
      case 'app': if (this.plan) { this.ap.appArmed = !this.ap.appArmed; this.ap.locCaptured = this.ap.gsCaptured = false; this.hud.message(this.ap.appArmed ? `APPROACH ARMED — ${this.plan.arr.icao} ${this.plan.arrEnd.ident}` : 'APPROACH DISARMED'); } break;
      case 'lights': {
        this.lightsMode = (this.lightsMode + 1) % 3; const L = this.sys.lights;
        L.nav = L.beacon = L.logo = this.lightsMode > 0; L.strobe = L.landing = this.lightsMode > 1; L.taxi = this.lightsMode > 1 && fm.st.weightOnWheels;
        this.hud.message(['Exterior lights OFF', 'NAV · BEACON · LOGO', 'NAV · BEACON · STROBE · LANDING · TAXI'][this.lightsMode]); break;
      }
      case 'nav': this.sys.lights.nav = !this.sys.lights.nav; break;
      case 'engines':
        if (fm.eng.every(e => e.running)) { this.hud.message('Engines running'); break; }
        this.autoStart = { step: 0, t: 0 }; this.hud.message('Auto-start sequence initiated'); break;
      case 'parking': c.parkingBrake = !c.parkingBrake; this.hud.message(c.parkingBrake ? 'Parking brake SET' : 'Parking brake RELEASED'); break;
      case 'pushback': this.startPushback(); break;
      case 'door': if (fm.st.gs < 1) { this.sys.doorOpen = !this.sys.doorOpen; } break;
      case 'trimUp': c.trim = clamp(c.trim + 0.05, -1, 1); break; case 'trimDn': c.trim = clamp(c.trim - 0.05, -1, 1); break;
      case 'hud': settings.hud = !settings.hud; break;
      case 'map': this.openMap(); break;
      case 'pause': this.togglePause(); break;
    }
  }

  private cockpitClick(x: number, y: number) {
    if (!this.rig.inside || this.paused) return;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), this.rig.cam);
    const hits = ray.intersectObjects(this.cockpit.clickables.map(c => c.mesh), false);
    if (!hits.length) return;
    const ck = this.cockpit.clickables.find(c => c.mesh === hits[0].object)!;
    audio.click();
    const a = ck.action; const fm = this.fm;
    if (a.startsWith('sw:')) {
      const id = a.slice(3);
      if (id === 'battery') this.sys.battery = !this.sys.battery;
      else if (id === 'apu') { if (!this.sys.battery) this.hud.message('Battery required'); else this.sys.apu = !this.sys.apu; }
      else if (id === 'fuelPumps') this.sys.fuelPumps = !this.sys.fuelPumps;
      else if (id === 'seatbelt') { this.sys.seatbelt = !this.sys.seatbelt; audio.chime(); }
      else if (id === 'door') this.act('door');
      else if (id.startsWith('eng')) {
        const i = +id.slice(3); const e = fm.eng[i];
        if (e.running || e.starting) fm.stopEngine(i);
        else if (!this.sys.battery) this.hud.message('Battery is OFF');
        else if (this.spec.engines.type !== 'piston' && !(this.sys.apu && this.sys.apuN > 95) && !fm.eng.some(x => x.running)) this.hud.message('Bleed air required: start the APU first');
        else { fm.startEngine(i); this.hud.message(`Engine ${i + 1} start`); }
      } else (this.sys.lights as any)[id] = !(this.sys.lights as any)[id];
      this.hud.message(ck.label + ' ' + (id.startsWith('eng') ? '' : ((this.sys as any)[id] ?? (this.sys.lights as any)[id] ? 'ON' : 'OFF')), 1.5);
    } else if (a.startsWith('ap:')) this.act(a.slice(3));
    else if (a === 'gear') this.act('gear');
    else if (a === 'flaps+') this.act('flapsDown'); else if (a === 'flaps-') this.act('flapsUp');
    else if (a === 'spoilers') this.act('spoilers');
    else if (a === 'thr+') { const v = (fm.ctl.throttle[0] + 0.1) > 1.001 ? 0 : fm.ctl.throttle[0] + 0.1; fm.ctl.throttle.fill(v); this.touch?.setThrottle(v); }
    else if (a === 'nd-range') this.cockpit.cycleNdRange();
  }

  private startPushback() {
    const fm = this.fm;
    if (!this.gate || this.pushback || fm.st.gs > 1 || !fm.st.weightOnWheels) { this.hud.message('Pushback only available when parked at the gate'); return; }
    if (this.sys.doorOpen) this.sys.doorOpen = false;
    const L = layoutOf(this.cfg.dep);
    const back = new THREE.Vector3(-L.apron.nrm[0], 0, -L.apron.nrm[1]);
    const route = this.taxiPts; const next = route[2] ?? route[1];
    const along = new THREE.Vector3(next[0] - route[0][0], 0, next[1] - route[0][1]);
    const side = Math.sign(along.dot(new THREE.Vector3(L.apron.dir[0], 0, L.apron.dir[1]))) || 1;
    const hdg1 = (Math.atan2(L.apron.dir[0] * side, -L.apron.dir[1] * side) / DEG + 360) % 360;
    const tug = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 4.5), new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5 }));
    this.engine.scene.add(tug);
    this.pushback = { t: 0, dur: 28, from: fm.pos.clone(), hdg0: fm.st.heading, hdg1, dist: this.spec.length * 0.9 + 25, dir: back, tug };
    fm.ctl.parkingBrake = false;
    this.hud.message('Pushback in progress — start engines now', 5);
  }

  private updatePushback(dt: number) {
    const pb = this.pushback!; const fm = this.fm;
    pb.t += dt; const f = clamp(pb.t / pb.dur, 0, 1); const e = f * f * (3 - 2 * f);
    const straight = Math.min(1, e / 0.5); const turn = clamp((e - 0.35) / 0.65, 0, 1);
    const p = pb.from.clone().addScaledVector(pb.dir, pb.dist * (straight * 0.6 + turn * 0.4));
    const hdg = pb.hdg0 + wrap180(pb.hdg1 - pb.hdg0) * turn;
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.atan2(fm.contacts[0].p.y - fm.contacts[1].p.y, -(fm.contacts[0].p.z - fm.contacts[1].p.z)));
    fm.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -hdg * DEG).multiply(pitchQ);
    fm.pos.set(p.x, this.groundAt(p.x, p.z).h + fm.restHeight(), p.z); fm.vel.set(0, 0, 0); fm.omega.set(0, 0, 0);
    const noseW = new THREE.Vector3(0, 0, -this.spec.gear.wheelbase * 0.9 - 4).applyQuaternion(fm.quat).add(fm.pos);
    pb.tug.position.set(noseW.x, this.groundAt(noseW.x, noseW.z).h + 1, noseW.z); pb.tug.quaternion.copy(fm.quat);
    fm.st.gs = 1.5;
    if (f >= 1) { pb.tug.removeFromParent(); this.pushback = null; fm.ctl.parkingBrake = true; this.taxiIdx = 1; this.hud.message('Pushback complete. Set parking brake off and taxi via the green line.', 6); }
  }

  private updateAutoStart(dt: number) {
    const a = this.autoStart!; a.t += dt; const fm = this.fm; const piston = this.spec.engines.type === 'piston';
    if (a.step === 0) { this.sys.battery = true; this.sys.fuelPumps = true; this.sys.lights.beacon = true; this.sys.lights.nav = true; this.lightsMode = Math.max(1, this.lightsMode); a.step = 1; a.t = 0; }
    else if (a.step === 1) { if (!piston) { this.sys.apu = true; if (this.sys.apuN > 95) { a.step = 2; a.t = 0; } } else { a.step = 2; } }
    else if (a.step >= 2) {
      const i = a.step - 2; if (i >= fm.eng.length) { this.autoStart = null; this.sys.seatbelt = true; this.hud.message('Engines stable — ready to taxi'); if (!piston) setTimeout(() => (this.sys.apu = false), 30000); return; }
      const e = fm.eng[i]; if (!e.running && !e.starting) fm.startEngine(i); if (e.running) { a.step++; a.t = 0; }
    }
  }

  // ---------------- main update ----------------
  update(dt: number) {
    const eng = this.engine;
    if (!this.ready) {
      this.loadT += dt;
      const ll = this.spawnLatLon(); eng.terrain.prefetch(ll.lat, ll.lon);
      const pend = eng.terrain.pendingCount();
      const bar = this.overlay?.querySelector('i') as HTMLElement | null; if (bar) bar.style.width = `${clamp(this.loadT / 6, 0, 0.95) * 100}%`;
      const msg = this.overlay?.querySelector('.ld-msg'); if (msg) msg.textContent = eng.terrain.online ? `Streaming terrain elevation… (${pend} tiles)` : 'Offline — using synthetic terrain';
      eng.camera.position.set(0, 2000, 0); eng.focus.set(0, 0, 0);
      if ((eng.terrain.isReadyAround(ll.lat, ll.lon, Math.min(13, eng.terrain.maxZ)) && this.loadT > 1.2) || this.loadT > 20 || (!eng.terrain.online && this.loadT > 2)) this.finishLoading();
      return;
    }
    if (this.paused) { this.rig.update(0, this.fm, this.parts); eng.camera.copy(this.rig.cam); return; }
    const fm = this.fm, c = fm.ctl, s = this.spec;
    this.time += dt;
    // ---- input ----
    const inp = this.input.read(dt);
    c.pitch = inp.pitch; c.roll = inp.roll; c.yaw = inp.yaw; c.tiller = 0; c.brakes = inp.brake; // pitch + = pull (stick back / down-arrow)
    const rev = (this as any).rev && fm.st.weightOnWheels;
    if (inp.throttleAbs !== null) c.throttle.fill(inp.throttleAbs);
    if (inp.throttleDelta) { const v = clamp(c.throttle[0] + inp.throttleDelta * dt * 0.5, 0, 1); c.throttle.fill(v); this.touch?.setThrottle(v); if (this.ap.athr && Math.abs(inp.throttleDelta) > 0) { /* manual override */ } }
    if (rev) c.throttle.fill(-clamp(Math.max(c.throttle[0], this.touch?.throttle ?? 0, 0.8), 0, 1)); else if (c.throttle[0] < 0) c.throttle.fill(0);
    if (!fm.st.weightOnWheels) (this as any).rev = false;
    if (this.fm.apThrottle !== null && !this.ap.athr) this.fm.apThrottle = null;
    if (this.ap.engaged && (Math.abs(inp.pitch) > 0.5 || Math.abs(inp.roll) > 0.5)) { this.ap.engage(false); this.hud.message('AP DISCONNECT (override)'); audio.chime(); }
    // ---- systems ----
    this.sys.apuN = this.sys.apu ? Math.min(100, this.sys.apuN + dt * 6) : Math.max(0, this.sys.apuN - dt * 10);
    if (!this.sys.battery && !fm.eng.some(e => e.running)) { for (const k of Object.keys(this.sys.lights)) (this.sys.lights as any)[k] = false; }
    if (this.autoStart) this.updateAutoStart(dt);
    // ---- environment ----
    const ll = this.latLon();
    eng.weather.windAt(fm.pos.y, this.wind); fm.wind.copy(this.wind);
    const turb = eng.weather.turbulence(fm.pos.y, fm.st.agl, dt, fm.st.tas);
    if (fm.st.weightOnWheels) { fm.turbRates.set(0, 0, 0); fm.turbVert = 0; } else { fm.turbRates.copy(turb.rates); fm.turbVert = turb.vert; }
    this.rig.shake = Math.max(this.rig.shake, turb.intensity * (this.rig.inside ? 1.2 : 0.6) + (fm.st.stall ? 1.5 : 0) + (fm.st.weightOnWheels ? fm.st.gs / 80 : 0));
    // ---- physics ----
    if (this.pushback) this.updatePushback(dt);
    else {
      this.ap.update(dt);
      this.accum += dt; const h = 1 / 240; let n = 0;
      while (this.accum >= h && n < 40) { fm.step(h); this.accum -= h; n++; }
      if (n >= 40) this.accum = 0;
    }
    if (!fm.st.weightOnWheels && fm.st.agl > 15) this.airborneOnce = true;
    const d = haversine(this.lastLL.lat, this.lastLL.lon, ll.lat, ll.lon); if (d < 5000) this.distFlown += d; this.lastLL = ll;
    // origin shift
    if (Math.abs(fm.pos.x) > 8000 || Math.abs(fm.pos.z) > 8000) origin.shiftTo(ll.lat, ll.lon);
    // ---- visuals ----
    this.parts.root.position.copy(fm.pos); this.parts.root.quaternion.copy(fm.quat);
    const nose = fm.contacts[0];
    animateAircraft(this.parts, {
      flap: fm.flap, spoiler: fm.spoiler, ail: fm.ail, elev: fm.elev, rud: fm.rud, gear: fm.gear, n1: fm.eng.map(e => e.n1), dt, time: this.time,
      lights: this.sys.lights, door: this.sys.doorOpen ? 1 : 0, steer: clamp(c.yaw, -1, 1) * (fm.st.gs < 15 ? 1 : 0.1), wheelSpin: nose.onGround ? nose.wheelSpin : fm.st.weightOnWheels ? fm.st.gs : 0,
      night: eng.sky.night, slats: fm.flap > 0.01 ? 1 : 0, ga: s.category === 'General Aviation',
    });
    this.rig.update(dt, fm, this.parts);
    eng.camera.copy(this.rig.cam); eng.camera.aspect = innerWidth / innerHeight; eng.camera.updateProjectionMatrix();
    eng.focus.copy(fm.pos); eng.focusVel.copy(fm.vel);
    (eng as any).shadowRadius = Math.max(40, Math.max(s.span, s.length) * 0.9);
    // hide exterior fuselage when inside to see the cockpit
    this.parts.fuselage.visible = !this.rig.inside;
    for (const k of ['windshield', 'fairing']) if ((this.parts as any)[k]) (this.parts as any)[k].visible = !this.rig.inside;
    this.cockpit.update(dt, fm, this.ap, this.sys, eng.sky.night, this.rig.inside);
    if (this.taxiLine) this.taxiLine.visible = fm.st.weightOnWheels && !this.airborneOnce;
    // ---- warnings & callouts ----
    this.updateWarnings(dt);
    // ---- landing / completion ----
    this.checkLanding(dt);
    if (fm.crashed && !this.reported) { this.reported = true; this.crashed(); }
    // ---- UI ----
    this.hud.show(settings.hud || !this.rig.inside);
    this.hud.update(dt, fm, this.ap, { cam: CAM_LABEL[this.rig.mode] + (this.rig.inside ? ' · tap switches to operate' : ''), warnings: this.warnings, compact: this.rig.inside, route: this.cfg.mode === 'explore' ? `EXPLORING · ${ll.lat.toFixed(3)}°, ${ll.lon.toFixed(3)}° · local ${fmtClock(eng.localTime(ll.lon))}` : undefined });
    this.hud.tip(this.tipText());
    if (this.touch) { this.touch.setState('gear', c.gearDown); this.touch.setState('ap', this.ap.engaged); this.touch.setState('parking', c.parkingBrake); this.touch.setState('spoilers', fm.spoiler > 0.05 || c.spoilerArmed); this.touch.setState('reverse', !!(this as any).rev); }
    audio.update({ n1: fm.eng.map(e => e.n1), piston: s.engines.type === 'piston', ias: fm.st.ias / KT, gs: fm.st.gs, onGround: fm.st.weightOnWheels, rain: eng.weather.cur.rain, stall: fm.st.stallWarn, inside: this.rig.inside, gearMoving: fm.gear > 0.02 && fm.gear < 0.98, overspeed: fm.st.overspeed });
  }

  private tipText() {
    const fm = this.fm;
    if (this.pushback) return 'PUSHBACK — start engines now (ENG / Ctrl+E)';
    if (this.cfg.spawn === 'gate' && !this.airborneOnce && this.taxiPts.length && fm.st.weightOnWheels) {
      const ap = this.cfg.dep; const p = toLocal(ap, this.latLon().lat, this.latLon().lon);
      while (this.taxiIdx < this.taxiPts.length - 1 && Math.hypot(this.taxiPts[this.taxiIdx][0] - p[0], this.taxiPts[this.taxiIdx][1] - p[1]) < 40) this.taxiIdx++;
      const t = this.taxiPts[this.taxiIdx]; const dist = Math.hypot(t[0] - p[0], t[1] - p[1]);
      const ll = toLatLon(ap, t); const brg = bearing(this.latLon().lat, this.latLon().lon, ll.lat, ll.lon);
      const turn = wrap180(brg - fm.st.heading);
      if (fm.eng.some(e => e.starting)) return 'Engine start in progress…';
      if (!fm.eng.some(e => e.running)) return 'Engines off — press ENG (Ctrl+E) for auto-start · P = pushback';
      if (this.taxiIdx >= this.taxiPts.length - 2) return `Runway ${this.cfg.depEnd.ident}: line up, flaps ${this.spec.flapDetents[this.takeoffFlap()]}, takeoff thrust, rotate at ${this.spec.vr} kt`;
      return `TAXI → runway ${this.cfg.depEnd.ident} · ${Math.round(dist)} m · ${Math.abs(turn) < 10 ? 'straight ahead' : (turn > 0 ? 'turn right ' : 'turn left ') + Math.round(Math.abs(turn)) + '°'} · keep below 25 kt`;
    }
    return '';
  }

  private updateWarnings(dt: number) {
    const fm = this.fm, st = fm.st, s = this.spec; const w: string[] = [];
    const aglFt = st.agl / FT; const vsFpm = st.vs / FT * 60;
    if (st.stallWarn) w.push('STALL');
    if (st.overspeed) w.push('OVERSPEED');
    if (!st.weightOnWheels && Math.abs(st.bank) > 40) { w.push('BANK ANGLE'); }
    const nearArr = this.plan ? haversine(this.latLon().lat, this.latLon().lon, this.plan.arr.lat, this.plan.arr.lon) < 15 * NM : !!this.nearAirport();
    if (!st.weightOnWheels && aglFt < 2000 && vsFpm < -500 && aglFt / (-vsFpm / 60) < 12 && !(nearArr && fm.ctl.gearDown && vsFpm > -1500)) { w.push('PULL UP'); if (((this as any).gpT = ((this as any).gpT ?? 0) - dt) <= 0) { audio.resetCall(); audio.say('pull up'); (this as any).gpT = 3; } }
    if (!st.weightOnWheels && !s.gear.fixed && !fm.ctl.gearDown && aglFt < 600 && vsFpm < -200 && st.ias / KT < 200) w.push('TOO LOW · GEAR');
    if (fm.tailStrike) { (this as any).tsT = 6; fm.tailStrike = false; this.hud.message('TAIL STRIKE — pitch attitude too high on rotation', 4); }
    if (((this as any).tsT = ((this as any).tsT ?? 0) - dt) > 0) w.push('TAIL STRIKE');
    if (fm.eng.some(e => e.fire)) w.push('ENGINE FIRE');
    if (fm.fuel < this.spec.fuelMax * 0.03) w.push('LOW FUEL');
    this.warnings = w;
    if (st.stallWarn && ((this as any).stT = ((this as any).stT ?? 0) - dt) <= 0) { audio.resetCall(); audio.say('stall'); (this as any).stT = 2.5; }
    // radio altitude callouts on approach
    if (!st.weightOnWheels && fm.ctl.gearDown && vsFpm < -100) {
      for (const h of [2500, 1000, 500, 100, 50, 40, 30, 20, 10]) {
        if (aglFt < h && aglFt > h - 30 * (h > 100 ? 4 : 1) && !this.callouts.has(h)) {
          this.callouts.add(h); audio.say(h === 2500 ? 'twenty five hundred' : h === 1000 ? 'one thousand' : h === 500 ? 'five hundred' : h === 100 ? 'one hundred' : String(h));
          if (h === 20 && s.maker === 'Airbus') setTimeout(() => audio.say('retard'), 300);
          if (h === 500) setTimeout(() => this.callouts.clear(), 60000);
        }
      }
    }
    if (aglFt > 3000) this.callouts.clear();
  }

  private touchdown(vsFpm: number, g: number) {
    if (!this.airborneOnce || this.touchdownT >= 0) { audio.thump(Math.min(1, Math.abs(vsFpm) / 600) * 0.6); return; }
    audio.thump(Math.min(1, Math.abs(vsFpm) / 400));
    this.rig.shake = Math.min(3, Math.abs(vsFpm) / 200);
    const fm = this.fm, st = fm.st; const ll = this.latLon();
    // find runway under the aircraft
    const ap = this.nearAirport(); let centerline = 99, tdz = -1;
    let bestEnd: RunwayEnd | null = null;
    if (ap) {
      const L = layoutOf(ap); const p = toLocal(ap, ll.lat, ll.lon);
      let best = 1e9;
      for (const r of L.rwys) for (const e of r.rw.ends) {
        const ei = endInfo(L, e); const dx = p[0] - ei.thr[0], dz = p[1] - ei.thr[1];
        const along = dx * ei.dir[0] + dz * ei.dir[1]; const lat = Math.abs(-dx * ei.dir[1] + dz * ei.dir[0]);
        const hdgOk = Math.abs(wrap180(st.heading - e.hdg)) < 45;
        if (hdgOk && along > -100 && along < r.len + 100 && lat < best) { best = lat; centerline = lat; tdz = along; bestEnd = e; }
      }
    }
    const vs = Math.abs(vsFpm); const speedErr = st.ias / KT - this.spec.vref; const bank = Math.abs(st.bank);
    let score = 100; const notes: string[] = [];
    if (vs > 240) { score -= Math.min(45, (vs - 240) / 8); notes.push(vs > 600 ? 'Hard landing — inspect the gear.' : 'Firm touchdown.'); } else if (vs < 60) notes.push('Butter! Very smooth touchdown.'); else notes.push('Smooth touchdown.');
    if (!bestEnd) { score -= 50; notes.push('Landed off the runway!'); }
    else {
      if (centerline > 3) { score -= Math.min(25, (centerline - 3) * 1.5); notes.push(`Off centreline by ${centerline.toFixed(1)} m.`); }
      if (tdz < 150) { score -= 15; notes.push('Touched down short of the touchdown zone.'); } else if (tdz > 900) { score -= Math.min(25, (tdz - 900) / 40); notes.push('Long landing — floated past the touchdown zone.'); } else notes.push('In the touchdown zone.');
    }
    if (Math.abs(speedErr) > 8) { score -= Math.min(20, (Math.abs(speedErr) - 8) * 1.2); notes.push(speedErr > 0 ? 'Fast approach.' : 'Slow approach — close to stall.'); }
    if (bank > 3) { score -= Math.min(20, (bank - 3) * 4); notes.push('Wing low at touchdown.'); }
    if (st.pitch < 0) { score -= 15; notes.push('Nose-wheel first! Flare more.'); }
    score = Math.max(0, Math.round(score));
    const grade = score >= 95 ? 'A+' : score >= 88 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
    this.landing = { vs: vsFpm, g, centerline, tdz, speedErr, bank, score, grade, notes, airport: ap };
    this.touchdownT = this.time;
    this.hud.message(`TOUCHDOWN ${Math.round(vsFpm)} fpm · ${grade}`, 5);
  }

  private checkLanding(dt: number) {
    const fm = this.fm;
    if (!this.landing || this.reported) return;
    if (!fm.st.weightOnWheels && this.time - this.touchdownT > 3 && fm.st.agl > 30) { this.landing = null; this.touchdownT = -1; this.hud.message('Go-around'); return; }
    if ((fm.st.gs < 30 * KT && fm.st.weightOnWheels) || this.time - this.touchdownT > 40) {
      this.reported = true;
      const ld = this.landing; const done = this.cfg.arr && ld.airport?.icao === this.cfg.arr.icao;
      const res: FlightResult = { kind: 'landed', landing: ld, completedAt: ld.airport, timeSec: this.time, distNm: this.distFlown / NM };
      landingReport(this.uiRoot, ld, () => { if (this.cfg.mode === 'career' || this.cfg.mode === 'challenge') this.onEnd(res); else { (this as any).landedRes = res; this.reported = false; this.landing = null; this.touchdownT = -1; this.airborneOnce = false; } }, { label: 'END FLIGHT', fn: () => this.onEnd(res) });
      void done;
    }
    void dt;
  }

  private crashed() {
    audio.thump(1); this.rig.shake = 4;
    const d = document.createElement('div'); d.className = 'modal crash';
    d.innerHTML = `<div class="panel"><h2>CRASH</h2><p>${this.fm.crashReason}</p><div class="row"><button class="btn primary" data-r>RESTART</button><button class="btn" data-m>MAIN MENU</button></div></div>`;
    this.uiRoot.appendChild(d);
    d.querySelector('[data-r]')!.addEventListener('click', () => { d.remove(); (this.onEnd as any)({ kind: 'crash', reason: this.fm.crashReason, timeSec: this.time, distNm: this.distFlown / NM, restart: true }); });
    d.querySelector('[data-m]')!.addEventListener('click', () => { d.remove(); this.onEnd({ kind: 'crash', reason: this.fm.crashReason, timeSec: this.time, distNm: this.distFlown / NM }); });
  }

  togglePause() {
    if (document.querySelector('.modal.pause')) { document.querySelector('.modal.pause')!.remove(); this.paused = false; audio.resume(); return; }
    this.paused = true; audio.suspend();
    const d = document.createElement('div'); d.className = 'modal pause';
    const W = ['clear', 'few', 'scattered', 'overcast', 'rain', 'storm', 'fog', 'snow', 'windy'];
    const ll = this.latLon(); const lt = this.engine.localTime(ll.lon);
    d.innerHTML = `<div class="panel wide"><h2>PAUSED</h2>
      <div class="grid2">
        <div><h3>WEATHER</h3><div class="chips">${W.map(w => `<button class="chip ${this.engine.weather.preset.id === w ? 'on' : ''}" data-w="${w}">${weatherById(w).name}</button>`).join('')}</div></div>
        <div><h3>TIME OF DAY <span data-tl>${fmtClock(lt)}</span></h3><input type="range" min="0" max="24" step="0.25" value="${lt.toFixed(2)}" data-time>
          <h3>CAMERA</h3><div class="chips">${(['cockpit', 'pilot', 'chase', 'cinematic', 'wing', 'gear'] as const).map(m => `<button class="chip ${this.rig.mode === m ? 'on' : ''}" data-cam="${m}">${CAM_LABEL[m]}</button>`).join('')}</div>
          <h3>FLIGHT ASSIST</h3><div class="chips"><button class="chip ${this.fm.assist === 'assisted' ? 'on' : ''}" data-as="assisted">Assisted</button><button class="chip ${this.fm.assist === 'realistic' ? 'on' : ''}" data-as="realistic">Realistic</button></div></div>
      </div>
      <div class="row"><button class="btn primary" data-res>RESUME</button><button class="btn" data-map>WORLD MAP</button><button class="btn" data-rs>RESTART</button><button class="btn" data-q>EXIT TO MENU</button></div>
      <div class="keys">Keys: W/S or ↑/↓ pitch · A/D or ←/→ roll · Q/E rudder · Shift/Ctrl throttle · G gear · F/V flaps · / spoilers · B brakes · . parking brake · P pushback · Ctrl+E engines · L lights · C camera (1-6) · Tab AP · T A/THR · Y approach · M map · H HUD</div></div>`;
    this.uiRoot.appendChild(d);
    d.querySelectorAll<HTMLElement>('[data-w]').forEach(b => b.addEventListener('click', () => { const p = weatherById(b.dataset.w!); this.engine.weather.set(p); this.fm.surfaceFriction = p.snow > 0.3 ? 0.35 : p.rain > 0.3 ? 0.65 : 1; d.querySelectorAll('[data-w]').forEach(x => x.classList.toggle('on', x === b)); }));
    d.querySelectorAll<HTMLElement>('[data-cam]').forEach(b => b.addEventListener('click', () => { this.rig.setMode(b.dataset.cam as any); d.querySelectorAll('[data-cam]').forEach(x => x.classList.toggle('on', x === b)); }));
    d.querySelectorAll<HTMLElement>('[data-as]').forEach(b => b.addEventListener('click', () => { this.fm.assist = b.dataset.as as any; settings.assist = this.fm.assist; d.querySelectorAll('[data-as]').forEach(x => x.classList.toggle('on', x === b)); }));
    const tr = d.querySelector<HTMLInputElement>('[data-time]')!; tr.addEventListener('input', () => { this.engine.setLocalTime(+tr.value, ll.lon); d.querySelector('[data-tl]')!.textContent = fmtClock(+tr.value); });
    d.querySelector('[data-res]')!.addEventListener('click', () => this.togglePause());
    d.querySelector('[data-map]')!.addEventListener('click', () => { this.togglePause(); this.openMap(); });
    d.querySelector('[data-rs]')!.addEventListener('click', () => { d.remove(); this.paused = false; (this.onEnd as any)({ kind: 'quit', timeSec: this.time, distNm: 0, restart: true }); });
    d.querySelector('[data-q]')!.addEventListener('click', () => { d.remove(); this.paused = false; this.onEnd({ kind: 'quit', timeSec: this.time, distNm: this.distFlown / NM }); });
  }

  openMap() { (this as any).mapHook?.(); }

  /** Teleport (exploration) to lat/lon keeping altitude & speed. */
  teleport(lat: number, lon: number, altFt?: number) {
    const fm = this.fm;
    origin.shiftTo(lat, lon);
    fm.pos.set(0, Math.max(fm.pos.y, (altFt ?? 3000) * FT), 0);
    if (altFt) fm.pos.y = altFt * FT;
    this.engine.terrain.prefetch(lat, lon);
    if (fm.st.weightOnWheels || fm.vel.length() < 40) { const v = (this.spec.vref + 40) * KT; const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(fm.quat); fwd.y = 0; fwd.normalize(); fm.quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-fwd.x, -fwd.z)); fm.vel.copy(fwd).multiplyScalar(v); fm.ctl.gearDown = false; fm.gear = 0; fm.forceRunning(); fm.ctl.throttle.fill(0.7); }
    this.rig.setMode(this.rig.mode);
    this.hud.message(`Teleported to ${lat.toFixed(2)}°, ${lon.toFixed(2)}°`);
  }

  dispose() {
    origin.offShift(this.shiftFn);
    this.parts.root.removeFromParent(); this.cockpit.dispose();
    this.parts.root.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); });
    this.pushback?.tug.removeFromParent();
    this.taxiLine?.removeFromParent();
    this.hud.destroy(); this.touch?.destroy(); this.overlay?.remove();
    document.querySelectorAll('.modal').forEach(m => m.remove());
    this.engine.weather.onThunder = null;
    this.input.lookDrag = null; this.input.click = null; this.input.zoom = null; this.input.actions.clear();
    audio.suspend();
    void damp; void lerp; void FT;
  }
}

export function fmtClock(h: number) { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
