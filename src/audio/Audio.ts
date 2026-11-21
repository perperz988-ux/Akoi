import type { Game } from '../core/Game';
import type { Vehicle } from '../vehicles/Vehicle';
import type { Npc } from '../actors/Npc';
import { Rng, clamp } from '../core/MathUtil';
import * as L from '../world/CityLayout';
import { District } from '../world/CityLayout';

/** Procedural WebAudio engine: synthesized SFX, engine voices, ambience, weather and an original generative soundtrack. */
export class AudioSystem {
  ctx: AudioContext | null = null;
  master!: GainNode; sfx!: GainNode; engineBus!: GainNode; musicBus!: GainNode; ambBus!: GainNode;
  vol = { master: 0.8, sfx: 0.9, music: 0.6, amb: 0.7 };
  private noiseBuf!: AudioBuffer;
  private rng = new Rng(2026);
  private engines: { v: Vehicle | null; osc1: OscillatorNode; osc2: OscillatorNode; sub: OscillatorNode; noise: AudioBufferSourceNode; nf: BiquadFilterNode; lp: BiquadFilterNode; gain: GainNode; pan: StereoPannerNode; ng: GainNode }[] = [];
  private screech!: { src: AudioBufferSourceNode; g: GainNode; f: BiquadFilterNode };
  private wind!: { g: GainNode; f: BiquadFilterNode };
  private rain!: { g: GainNode; f: BiquadFilterNode };
  private amb!: { city: GainNode; waves: GainNode; crick: GainNode; ind: GainNode; windS: GainNode; wavesLfo: OscillatorNode };
  private sirens: { osc: OscillatorNode; lfo: OscillatorNode; g: GainNode; pan: StereoPannerNode; v: Vehicle | null }[] = [];
  private lastStep = 0; private voiceT = 0; private birdT = 0;
  station = 0; stations = ['Solano Waves', 'Neon Reef FM', 'Ironside Radio', 'Cypress AM', 'Radio Off'];
  private music: MusicEngine | null = null;
  unlocked = false;
  listener = { x: 0, y: 0, z: 0, rx: 1, rz: 0 };
  enabled = true;

  constructor(private g: Game) {
    g.bus.on('thunder', (d: any) => this.thunder(d.dist));
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master = ctx.createGain(); this.master.gain.value = this.vol.master; this.master.connect(comp); comp.connect(ctx.destination);
    for (const n of ['sfx', 'engineBus', 'musicBus', 'ambBus'] as const) { const gn = ctx.createGain(); gn.connect(this.master); (this as any)[n] = gn; }
    this.sfx.gain.value = this.vol.sfx; this.engineBus.gain.value = this.vol.sfx * 0.8; this.musicBus.gain.value = this.vol.music * 0.5; this.ambBus.gain.value = this.vol.amb;
    // noise buffer
    const len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 3; }
    this.noiseBuf = b;
    for (let i = 0; i < 4; i++) this.engines.push(this.mkEngine());
    this.screech = this.mkLoopNoise('bandpass', 1800, 0.0);
    const wf = this.mkLoopNoise('highpass', 600, 0); this.wind = { g: wf.g, f: wf.f };
    const rf = this.mkLoopNoise('highpass', 1800, 0); this.rain = { g: rf.g, f: rf.f };
    // ambience layers
    const c = this.mkLoopNoise('lowpass', 260, 0), w = this.mkLoopNoise('lowpass', 700, 0), ind = this.mkLoopNoise('lowpass', 120, 0), wi = this.mkLoopNoise('bandpass', 500, 0), cr = this.mkLoopNoise('highpass', 4200, 0);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12; const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(w.g.gain); lfo.start();
    for (const x of [c, w, ind, wi, cr]) { x.g.disconnect(); x.g.connect(this.ambBus); }
    this.amb = { city: c.g, waves: w.g, crick: cr.g, ind: ind.g, windS: wi.g, wavesLfo: lfo };
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; const l = ctx.createOscillator(); l.frequency.value = 0.6 + i * 0.1; const lgn = ctx.createGain(); lgn.gain.value = 250; l.connect(lgn); lgn.connect(o.frequency);
      const gn = ctx.createGain(); gn.gain.value = 0; const pan = ctx.createStereoPanner(); const lpf = ctx.createBiquadFilter(); lpf.type = 'bandpass'; lpf.frequency.value = 1100; lpf.Q.value = 1.2;
      o.frequency.value = 800; o.connect(lpf); lpf.connect(gn); gn.connect(pan); pan.connect(this.sfx); o.start(); l.start();
      this.sirens.push({ osc: o, lfo: l, g: gn, pan, v: null });
    }
    this.music = new MusicEngine(ctx, this.musicBus, this.noiseBuf, this.g);
    this.unlocked = true;
    this.music.setStation(this.station);
  }

  setVolumes(v: Partial<typeof this.vol>) {
    Object.assign(this.vol, v);
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master; this.sfx.gain.value = this.vol.sfx; this.engineBus.gain.value = this.vol.sfx * 0.8; this.musicBus.gain.value = this.vol.music * 0.5; this.ambBus.gain.value = this.vol.amb;
  }
  suspend(s: boolean) { if (!this.ctx) return; if (s) this.ctx.suspend(); else this.ctx.resume(); }

  private mkLoopNoise(type: BiquadFilterType, freq: number, gain: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = type === 'bandpass' ? 2 : 0.7;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(this.sfx); src.start();
    return { src, f, g };
  }

  private mkEngine() {
    const ctx = this.ctx!;
    const osc1 = ctx.createOscillator(), osc2 = ctx.createOscillator(), sub = ctx.createOscillator();
    osc1.type = 'sawtooth'; osc2.type = 'square'; sub.type = 'sine';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 2;
    const gain = ctx.createGain(); gain.gain.value = 0; const pan = ctx.createStereoPanner();
    const g1 = ctx.createGain(); g1.gain.value = 0.35; const g2 = ctx.createGain(); g2.gain.value = 0.18; const g3 = ctx.createGain(); g3.gain.value = 0.5;
    osc1.connect(g1); osc2.connect(g2); sub.connect(g3); g1.connect(lp); g2.connect(lp); g3.connect(lp); lp.connect(gain); gain.connect(pan); pan.connect(this.engineBus);
    const noise = ctx.createBufferSource(); noise.buffer = this.noiseBuf; noise.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 500; nf.Q.value = 0.8; const ng = ctx.createGain(); ng.gain.value = 0;
    noise.connect(nf); nf.connect(ng); ng.connect(pan);
    osc1.start(); osc2.start(); sub.start(); noise.start();
    return { v: null as Vehicle | null, osc1, osc2, sub, noise, nf, lp, gain, pan, ng };
  }

  // ---------------------------------------------------------------- spatial helper
  private spat(x: number, y: number, z: number, ref = 25) {
    const l = this.listener;
    const dx = x - l.x, dz = z - l.z, d = Math.hypot(dx, dz, (y - l.y) * 0.5);
    const gain = clamp(ref / (ref + d * d * 0.02 + d * 0.5), 0, 1);
    const pan = d < 1 ? 0 : clamp((dx * l.rx + dz * l.rz) / d, -1, 1);
    return { gain, pan, d };
  }

  private burst(opts: { dur: number; freq?: number; q?: number; type?: BiquadFilterType; gain: number; pan?: number; attack?: number; decay?: number; pitch?: number; sweepTo?: number; bus?: GainNode }) {
    const ctx = this.ctx; if (!ctx || !this.unlocked) return;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.playbackRate.value = opts.pitch ?? 1;
    const f = ctx.createBiquadFilter(); f.type = opts.type ?? 'bandpass'; f.frequency.value = opts.freq ?? 1000; f.Q.value = opts.q ?? 1;
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, ctx.currentTime + opts.dur);
    const g = ctx.createGain(); const t = ctx.currentTime; const a = opts.attack ?? 0.002;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(opts.gain, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);
    const p = ctx.createStereoPanner(); p.pan.value = opts.pan ?? 0;
    src.connect(f); f.connect(g); g.connect(p); p.connect(opts.bus ?? this.sfx);
    src.start(t, Math.random() * 1.5, opts.dur + 0.05);
  }
  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', opts: { pan?: number; to?: number; delay?: number; bus?: GainNode } = {}) {
    const ctx = this.ctx; if (!ctx || !this.unlocked) return;
    const o = ctx.createOscillator(); o.type = type; const t = ctx.currentTime + (opts.delay ?? 0);
    o.frequency.setValueAtTime(freq, t); if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.value = opts.pan ?? 0;
    o.connect(g); g.connect(p); p.connect(opts.bus ?? this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- one-shots
  uiClick() { this.tone(900, 0.05, 0.12, 'triangle'); }
  uiOpen() { this.tone(500, 0.08, 0.1, 'triangle'); this.tone(750, 0.1, 0.1, 'triangle', { delay: 0.05 }); }
  cash() { this.tone(1318, 0.08, 0.15, 'square'); this.tone(1760, 0.18, 0.15, 'square', { delay: 0.07 }); }
  hurt() { this.burst({ dur: 0.18, freq: 300, q: 0.7, gain: 0.5, type: 'lowpass' }); this.tone(160, 0.15, 0.2, 'sawtooth', { to: 90 }); }
  glass() { this.burst({ dur: 0.35, freq: 5000, q: 0.5, gain: 0.5, type: 'highpass' }); this.tone(2400, 0.1, 0.1, 'triangle', { to: 1500 }); }
  splash() { this.burst({ dur: 0.5, freq: 900, q: 0.5, gain: 0.5, type: 'lowpass', sweepTo: 200 }); }
  whoosh() { this.burst({ dur: 0.22, freq: 600, q: 1, gain: 0.18, type: 'bandpass', attack: 0.06, sweepTo: 2200 }); }
  jump() { this.burst({ dur: 0.12, freq: 400, q: 1, gain: 0.1, type: 'bandpass' }); }
  thud() { this.burst({ dur: 0.18, freq: 160, q: 0.8, gain: 0.55, type: 'lowpass' }); this.tone(70, 0.15, 0.35, 'sine', { to: 40 }); }
  land(surf: string) { this.burst({ dur: 0.12, freq: surf === 'grass' || surf === 'sand' ? 300 : 700, q: 0.8, gain: 0.25, type: 'lowpass' }); }
  click() { this.tone(1800, 0.02, 0.1, 'square'); }
  reload() { this.tone(900, 0.03, 0.12, 'square'); this.tone(500, 0.05, 0.12, 'square', { delay: 0.35 }); this.tone(1200, 0.03, 0.12, 'square', { delay: 0.7 }); }
  punch() { this.burst({ dur: 0.12, freq: 220, q: 0.8, gain: 0.5, type: 'lowpass' }); this.tone(110, 0.1, 0.25, 'sine', { to: 60 }); }
  clang() { this.tone(520, 0.3, 0.2, 'square', { to: 480 }); this.burst({ dur: 0.1, freq: 3000, gain: 0.2, type: 'highpass' }); }
  eat() { this.burst({ dur: 0.08, freq: 1200, gain: 0.2 }); this.burst({ dur: 0.08, freq: 1000, gain: 0.2 }); }
  doorClose() { this.burst({ dur: 0.15, freq: 300, q: 0.8, gain: 0.35, type: 'lowpass' }); this.tone(130, 0.1, 0.2, 'square', { to: 80 }); }
  wantedUp() { this.tone(660, 0.12, 0.2, 'square'); this.tone(880, 0.12, 0.2, 'square', { delay: 0.14 }); this.tone(660, 0.12, 0.2, 'square', { delay: 0.28 }); }
  wantedDown() { this.tone(880, 0.15, 0.15, 'triangle'); this.tone(660, 0.2, 0.15, 'triangle', { delay: 0.15 }); this.tone(440, 0.3, 0.15, 'triangle', { delay: 0.3 }); }
  missionStart() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 0.15, 'triangle', { delay: i * 0.1 })); }
  missionPass() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.4, 0.18, 'triangle', { delay: i * 0.12 })); this.tone(262, 1, 0.12, 'sawtooth', { delay: 0 }); }
  missionFail() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.45, 0.18, 'sawtooth', { delay: i * 0.18 })); }
  phoneRing() { for (let i = 0; i < 4; i++) { this.tone(1350, 0.12, 0.12, 'sine', { delay: i * 0.18 }); } }
  checkpoint() { this.tone(988, 0.1, 0.15, 'triangle'); this.tone(1319, 0.2, 0.15, 'triangle', { delay: 0.1 }); }
  step(surface: string, speed: number, crouch: boolean) {
    const k = crouch ? 0.35 : clamp(speed / 7, 0.4, 1);
    const f = surface === 'grass' ? 380 : surface === 'sand' ? 280 : surface === 'water' ? 600 : surface === 'metal' ? 1800 : 900 + this.rng.range(-150, 150);
    this.burst({ dur: surface === 'sand' ? 0.12 : 0.07, freq: f, q: 0.9, gain: 0.12 * k + 0.02, type: surface === 'water' ? 'lowpass' : 'bandpass', pitch: 0.8 + Math.random() * 0.5 });
  }
  shot(id: string, x: number, y: number, z: number) {
    const s = this.spat(x, y, z, 60);
    const heavy = id === 'brawler' || id === 'longarm';
    const dur = id === 'brawler' ? 0.35 : id === 'longarm' ? 0.28 : id === 'rattler' ? 0.12 : id === 'zap' ? 0.2 : 0.2;
    if (id === 'zap') { this.tone(2400, 0.2, 0.2 * s.gain, 'sawtooth', { pan: s.pan, to: 700 }); return; }
    this.burst({ dur, freq: heavy ? 700 : 1400, q: 0.5, gain: 0.7 * s.gain, pan: s.pan, type: 'bandpass', sweepTo: 150 });
    this.tone(heavy ? 90 : 140, 0.18, 0.5 * s.gain, 'sine', { pan: s.pan, to: 40 });
    if (s.d > 40) this.burst({ dur: 0.5, freq: 400, gain: 0.2 * s.gain, pan: s.pan, type: 'lowpass', attack: 0.12 });
  }
  impact(x: number, y: number, z: number) { const s = this.spat(x, y, z, 20); this.burst({ dur: 0.07, freq: 2500, q: 1, gain: 0.25 * s.gain, pan: s.pan }); }
  explosion(x: number, y: number, z: number) {
    const s = this.spat(x, y, z, 90);
    this.burst({ dur: 1.4, freq: 500, q: 0.4, gain: 1.0 * s.gain, pan: s.pan, type: 'lowpass', sweepTo: 60 });
    this.tone(65, 1.0, 0.9 * s.gain, 'sine', { pan: s.pan, to: 28 });
    this.burst({ dur: 0.35, freq: 4000, q: 0.5, gain: 0.5 * s.gain, pan: s.pan, type: 'highpass' });
  }
  crash(imp: number, x: number, z: number) {
    const s = this.spat(x, 1, z, 40); const k = clamp(imp / 14, 0.15, 1);
    this.burst({ dur: 0.35, freq: 700, q: 0.6, gain: 0.7 * k * s.gain, pan: s.pan, type: 'bandpass', sweepTo: 200 });
    this.burst({ dur: 0.25, freq: 3500, q: 0.5, gain: 0.35 * k * s.gain, pan: s.pan, type: 'highpass' });
    this.tone(90, 0.2, 0.4 * k * s.gain, 'sine', { pan: s.pan, to: 45 });
  }
  horn(v: Vehicle) {
    const s = this.spat(v.x, v.y, v.z, 40); if (s.gain < 0.02) return;
    const base = v.def.cls === 'bus' || v.def.cls === 'truck' ? 180 : v.isBike ? 520 : 340;
    this.tone(base, 0.35, 0.14 * s.gain, 'sawtooth', { pan: s.pan }); this.tone(base * 1.26, 0.35, 0.12 * s.gain, 'sawtooth', { pan: s.pan });
  }
  thunder(dist: number) { const g = clamp(1 - dist / 2200, 0.15, 1); this.burst({ dur: 3.2, freq: 220, q: 0.4, gain: 0.9 * g, type: 'lowpass', attack: 0.3, sweepTo: 40 }); }
  /** Murmured pseudo-voice for an NPC line. */
  voice(n: Npc) {
    const s = this.spat(n.x, n.y, n.z, 14); if (s.gain < 0.05 || !this.ctx) return;
    const base = (n.gender === 'f' ? 210 : 120) * (0.9 + (n.id % 7) * 0.04);
    const syl = 4 + (n.id % 4);
    for (let i = 0; i < syl; i++) {
      const f = base * (1 + (this.rng.next() - 0.5) * 0.5);
      this.tone(f, 0.11, 0.07 * s.gain, 'sawtooth', { pan: s.pan, delay: i * 0.13, to: f * 0.9 });
      this.burst({ dur: 0.09, freq: 700 + this.rng.range(0, 900), q: 3, gain: 0.05 * s.gain, pan: s.pan });
    }
  }
  siren(_v: Vehicle) { /* handled in updateVehicles */ }
  nextStation() { this.station = (this.station + 1) % this.stations.length; this.music?.setStation(this.station); this.g.hud?.toast('📻 ' + this.stations[this.station]); this.uiClick(); }

  // ---------------------------------------------------------------- continuous
  updateVehicles(near: Vehicle[], player: Vehicle | null) {
    if (!this.ctx || !this.unlocked) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // choose engine voices
    const cand = near.filter((v) => v.engineOn && !v.engineDead).map((v) => ({ v, d: v === player ? -1 : Math.hypot(v.x - this.listener.x, v.z - this.listener.z) })).sort((a, b) => a.d - b.d).slice(0, this.engines.length);
    for (const e of this.engines) e.v = null;
    for (const c of cand) {
      let e = this.engines.find((x) => x.v === c.v) ?? this.engines.find((x) => !x.v && x.gain.gain.value < 0.001) ?? this.engines.find((x) => !x.v);
      if (e) e.v = c.v;
    }
    let screech = 0; let sx = 0, sz = 0;
    for (const e of this.engines) {
      const v = e.v;
      if (!v) { e.gain.gain.setTargetAtTime(0, t, 0.08); e.ng.gain.setTargetAtTime(0, t, 0.08); continue; }
      const s = this.spat(v.x, v.y, v.z, 22);
      const kind = v.def.engine, rpm = clamp(v.rpm, 0, v.def.maxRpm), rn = rpm / v.def.maxRpm;
      const cyl = kind === 'i4' ? 4 : kind === 'v6' ? 6 : kind === 'v8' ? 8 : kind === 'v12' ? 12 : kind === 'bike' ? 4 : kind === 'bike2' ? 2 : kind === 'diesel' ? 6 : 4;
      let f = (rpm / 60) * (cyl / 2) * 0.55;
      let w1: OscillatorType = 'sawtooth', w2: OscillatorType = 'square', cut = 500 + rn * 2200 + v.throttleSm * 1200;
      if (kind === 'ev') { f = 120 + rn * 1400; w1 = 'sine'; w2 = 'triangle'; cut = 4000; }
      if (kind === 'boat') { f = 30 + rn * 70; cut = 400 + rn * 600; }
      if (kind === 'heli') { f = 40 + v.rotorRpm * 20; w1 = 'sawtooth'; w2 = 'sine'; cut = 300; }
      if (kind === 'diesel') { w2 = 'sawtooth'; cut *= 0.6; }
      if (kind === 'bike') cut *= 1.4;
      e.osc1.type = w1; e.osc2.type = w2;
      e.osc1.frequency.setTargetAtTime(Math.max(18, f), t, 0.03); e.osc2.frequency.setTargetAtTime(Math.max(18, f * (kind === 'v8' ? 0.5 : 1.003)), t, 0.03); e.sub.frequency.setTargetAtTime(Math.max(15, f * 0.5), t, 0.03);
      e.lp.frequency.setTargetAtTime(cut, t, 0.05);
      const load = 0.35 + v.throttleSm * 0.65;
      const base = kind === 'heli' ? 0.9 : kind === 'ev' ? 0.25 : kind === 'bike' ? 0.5 : 0.62;
      const idleG = v.rpm > 100 || kind === 'heli' ? 1 : 0;
      e.gain.gain.setTargetAtTime(base * load * s.gain * (v === player ? 1.0 : 0.85) * idleG * (0.5 + rn * 0.7), t, 0.06);
      e.pan.pan.setTargetAtTime(v === player ? 0 : s.pan, t, 0.05);
      // intake / turbo / rotor chop noise
      const chop = kind === 'heli' ? (0.5 + 0.5 * Math.sin(this.g.time * 55)) : 1;
      e.nf.frequency.setTargetAtTime(kind === 'heli' ? 300 : 700 + rn * 2400, t, 0.05);
      e.ng.gain.setTargetAtTime((kind === 'boat' ? 0.35 : kind === 'heli' ? 0.7 * chop : 0.12 * v.throttleSm) * s.gain, t, 0.05);
      // tyre slip
      if (!v.isBoat && !v.isHeli && v.onGround && v.speed > 4) {
        const slip = Math.abs(v.vLat) * 0.35 + (v.braking && v.speed > 14 ? 0.35 : 0) + (v.ctrl.handbrake ? 0.4 : 0);
        const sc = clamp(slip - 0.35, 0, 1) * s.gain; if (sc > screech) { screech = sc; sx = v.x; sz = v.z; }
      }
    }
    this.screech.g.gain.setTargetAtTime(screech * 0.5, t, 0.05);
    this.screech.f.frequency.setTargetAtTime(1400 + Math.min(1, screech) * 900, t, 0.1);
    void sx; void sz;
    // sirens (two nearest)
    const sir = near.filter((v) => v.sirenOn && !v.engineDead).map((v) => ({ v, d: Math.hypot(v.x - this.listener.x, v.z - this.listener.z) })).sort((a, b) => a.d - b.d).slice(0, 2);
    for (let i = 0; i < this.sirens.length; i++) {
      const s = this.sirens[i], c = sir[i];
      if (!c) { s.g.gain.setTargetAtTime(0, t, 0.1); continue; }
      const sp = this.spat(c.v.x, c.v.y, c.v.z, 60);
      const yelp = c.v.def.cls === 'ambulance' ? 1.9 : 0.7;
      s.lfo.frequency.setTargetAtTime(yelp + (c.v.id % 3) * 0.15, t, 0.2);
      s.g.gain.setTargetAtTime(0.1 * sp.gain, t, 0.1); s.pan.pan.setTargetAtTime(sp.pan, t, 0.05);
    }
  }

  update(dt: number) {
    if (!this.ctx || !this.unlocked) return;
    const g = this.g, t = this.ctx.currentTime;
    const cam = g.cam.camera;
    this.listener.x = cam.position.x; this.listener.y = cam.position.y; this.listener.z = cam.position.z;
    const yaw = g.cam.forwardYaw; this.listener.rx = -Math.cos(yaw); this.listener.rz = Math.sin(yaw);
    // weather
    const rain = g.env.rainLevel * (g.interiors.active ? 0.2 : 1);
    this.rain.g.gain.setTargetAtTime(rain * 0.22, t, 0.5); this.rain.f.frequency.setTargetAtTime(1500 + rain * 1500, t, 0.5);
    const p = g.player;
    const spd = p.vehicle ? p.vehicle.speed : Math.hypot(p.vx, p.vz);
    this.wind.g.gain.setTargetAtTime(clamp(spd / 55, 0, 1) * 0.28 * (p.vehicle && g.cam.driveView >= 3 ? 0.6 : 1) + g.env.isStormy * 0.12, t, 0.2);
    this.wind.f.frequency.setTargetAtTime(500 + spd * 25, t, 0.2);
    // ambience by district
    if (g.interiors.active) { for (const a of [this.amb.city, this.amb.waves, this.amb.crick, this.amb.ind, this.amb.windS]) a.gain.setTargetAtTime(0.02, t, 0.5); }
    else {
      const d = L.districtAt(p.x, p.z);
      const urban = d === District.Downtown ? 1 : d === District.Midtown || d === District.Shopping || d === District.Resort ? 0.8 : d === District.Poor || d === District.Luxury ? 0.55 : d === District.Industrial ? 0.4 : d === District.Suburb ? 0.3 : 0.1;
      const coast = clamp((p.x - 900) / 300, 0, 1) * (d === District.Beach || d === District.Marina || d === District.Ocean || d === District.Resort || d === District.Island ? 1 : 0.5);
      const night = g.env.night;
      this.amb.city.gain.setTargetAtTime(urban * 0.28 * (1 - night * 0.4), t, 1);
      this.amb.waves.gain.setTargetAtTime(coast * 0.32, t, 1);
      this.amb.ind.gain.setTargetAtTime((d === District.Industrial || d === District.Airport ? 0.3 : 0.02) * (1 - night * 0.2), t, 1);
      const nat = d === District.Rural || d === District.Park || d === District.Suburb ? 1 : 0.1;
      this.amb.crick.gain.setTargetAtTime(nat * night * 0.06, t, 1);
      this.amb.windS.gain.setTargetAtTime((d === District.Rural || d === District.Airport ? 0.12 : 0.03) + g.env.isStormy * 0.12, t, 1);
      // birds
      this.birdT -= dt;
      if (this.birdT <= 0 && night < 0.4 && (nat > 0.5 || coast > 0.3) && g.env.rainLevel < 0.2) {
        this.birdT = 1 + Math.random() * 5; const f = coast > 0.3 ? 1400 : 2800 + Math.random() * 1500;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.tone(f, 0.08, 0.04, 'sine', { to: f * 1.25, delay: i * 0.11, pan: Math.random() * 2 - 1 });
      }
    }
    // music
    this.music?.update(dt, this.musicMode());
    // siren/engine updates called by VehicleManager each frame
  }

  private musicMode(): 'radio' | 'explore' | 'tension' | 'chase' | 'off' | 'interior' {
    const g = this.g;
    if (g.interiors.active) return 'interior';
    if (g.police.wantedLevel > 0 && g.police.seen) return 'chase';
    if (g.police.wantedLevel > 0) return 'tension';
    if (g.player.inVehicle && this.station < 4) return 'radio';
    if (g.missions.intensity) return 'tension';
    return 'explore';
  }
}

// ================================================================================================
/** Seeded generative music: four radio stations + exploration pads + tension/chase layers. */
class MusicEngine {
  private station = 0; private step = 0; private nextT = 0; private bar = 0; private mode = 'explore';
  private rng = new Rng(8080);
  private lowpass: BiquadFilterNode; private out: GainNode; private padGain: GainNode;
  private chordRoots = [57, 53, 48, 55];     // A F C G (MIDI)
  private lastMode = '';
  constructor(private ctx: AudioContext, bus: GainNode, private noise: AudioBuffer, private g: Game) {
    this.out = ctx.createGain(); this.out.gain.value = 1; this.lowpass = ctx.createBiquadFilter(); this.lowpass.type = 'lowpass'; this.lowpass.frequency.value = 18000;
    this.padGain = ctx.createGain(); this.padGain.gain.value = 1;
    this.out.connect(this.lowpass); this.lowpass.connect(bus);
    this.nextT = ctx.currentTime + 0.1;
  }
  setStation(i: number) { this.station = i; this.step = 0; this.bar = 0; }
  private hz(m: number) { return 440 * Math.pow(2, (m - 69) / 12); }

  update(dt: number, mode: string) {
    void dt;
    const ctx = this.ctx;
    if (mode !== this.lastMode) { this.lastMode = mode; this.step = 0; this.bar = 0; this.nextT = Math.max(this.nextT, ctx.currentTime + 0.05); }
    this.mode = mode;
    // interiors muffle
    const target = mode === 'interior' ? 700 : this.g.player.inVehicle && mode === 'radio' ? 16000 : 18000;
    this.lowpass.frequency.setTargetAtTime(target, ctx.currentTime, 0.2);
    while (this.nextT < ctx.currentTime + 0.25) {
      const bpm = this.bpm(); const stepDur = 60 / bpm / 4;
      this.schedule(this.nextT, this.step);
      this.step = (this.step + 1) % 64; if (this.step % 16 === 0) this.bar++;
      this.nextT += stepDur;
    }
  }
  private bpm() {
    switch (this.mode) { case 'chase': return 140; case 'tension': return 96; case 'interior': return 84; case 'explore': return 72;
      default: return [96, 124, 88, 100, 90][this.station]; }
  }
  private chordIdx() { return Math.floor(this.step / 16) % 4; }

  private note(t: number, midi: number, dur: number, type: OscillatorType, vol: number, lpf = 2000, att = 0.005) {
    const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = type; o.frequency.value = this.hz(midi); f.type = 'lowpass'; f.frequency.value = lpf;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }
  private pad(t: number, root: number, dur: number, vol: number, minor = true) {
    for (const iv of [0, minor ? 3 : 4, 7, 12]) for (const det of [-6, 6]) {
      const ctx = this.ctx, o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = this.hz(root + iv); o.detune.value = det; f.type = 'lowpass'; f.frequency.value = 900;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol / 6, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  private kick(t: number, v = 0.9) { const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.3); }
  private hat(t: number, v = 0.15, open = false) { const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = this.noise; f.type = 'highpass'; f.frequency.value = 7000; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.18 : 0.04)); s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random(), 0.25); }
  private snare(t: number, v = 0.5) { const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 1900; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); s.connect(f); f.connect(g); g.connect(this.out); s.start(t, Math.random(), 0.2); this.note(t, 52, 0.1, 'triangle', v * 0.4, 800); }

  private schedule(t: number, step: number) {
    const ci = this.chordIdx(), root = this.chordRoots[ci];
    const s16 = step % 16;
    const major = this.station === 3;
    switch (this.mode) {
      case 'explore': case 'interior': {
        if (s16 === 0) this.pad(t, root + (this.mode === 'interior' ? 0 : -12) + 12, 60 / this.bpm() * 4 * 1.05, 0.5);
        if (s16 % 4 === 2 && this.rng.chance(this.mode === 'interior' ? 0.35 : 0.25)) this.note(t, root + 24 + this.rng.pick([0, 3, 7, 10, 12]), 0.9, 'sine', 0.14, 3000, 0.01);
        return;
      }
      case 'tension': {
        if (s16 === 0) this.pad(t, root - 12, 60 / this.bpm() * 4, 0.55);
        if (s16 % 4 === 0) this.kick(t, 0.55);
        if (s16 % 2 === 0) this.hat(t, 0.06);
        if (s16 % 8 === 6) this.note(t, root + 12 + this.rng.pick([0, 1, 7]), 0.2, 'square', 0.07, 1200);
        return;
      }
      case 'chase': {
        if (s16 % 4 === 0) this.kick(t, 0.8);
        if (s16 % 8 === 4) this.snare(t, 0.45);
        this.hat(t, 0.07, s16 % 4 === 2);
        this.note(t, root - 12 + (s16 % 2 ? 0 : 0), 0.14, 'sawtooth', 0.18, 700);
        if (s16 % 2 === 0) this.note(t, root + 12 + [0, 3, 7, 10][(s16 / 2) % 4], 0.12, 'square', 0.07, 1800);
        return;
      }
    }
    // ---- radio stations
    switch (this.station) {
      case 0: { // Solano Waves — chill synthwave
        if (s16 === 0) this.pad(t, root, 60 / this.bpm() * 4, 0.7);
        if (s16 % 8 === 0) this.note(t, root - 12, 60 / this.bpm() * 2, 'sawtooth', 0.22, 500);
        if (s16 % 4 === 0) this.kick(t, 0.6);
        if (s16 % 8 === 4) this.snare(t, 0.3);
        if (s16 % 2 === 0) this.hat(t, 0.05);
        const arp = [0, 7, 12, 15, 12, 7][(s16 / 2 | 0) % 6]; if (s16 % 2 === 0) this.note(t, root + 12 + arp, 0.2, 'square', 0.055, 2400);
        break; }
      case 1: { // Neon Reef FM — four on the floor
        if (s16 % 4 === 0) this.kick(t, 0.85);
        if (s16 % 8 === 4) this.snare(t, 0.35);
        if (s16 % 4 === 2) this.hat(t, 0.1, true); else this.hat(t, 0.04);
        this.note(t, root - 12 + (s16 % 4 === 2 ? 12 : 0), 0.2, 'sawtooth', 0.16, 600 + (this.bar % 4) * 250);
        if (s16 === 0 || s16 === 6 || s16 === 10) this.pad(t, root + 12, 0.45, 0.35);
        if (s16 % 4 === 3 && this.rng.chance(0.6)) this.note(t, root + 24 + this.rng.pick([0, 3, 7, 10]), 0.12, 'square', 0.05, 3000);
        break; }
      case 2: { // Ironside Radio — boom bap
        if (s16 === 0 || s16 === 7 || s16 === 10) this.kick(t, 0.9);
        if (s16 === 4 || s16 === 12) this.snare(t, 0.55);
        if (s16 % 2 === 0) this.hat(t, 0.06 + (s16 % 4 === 2 ? 0.04 : 0));
        if (s16 === 0) this.pad(t, root, 60 / this.bpm() * 4, 0.45);
        if (s16 % 8 === 0) this.note(t, root - 24, 0.5, 'sine', 0.45, 300);
        if ([2, 6, 11, 14].includes(s16)) this.note(t, root + 12 + this.rng.pick([0, 3, 7, 10]), 0.35, 'triangle', 0.1, 2000);
        break; }
      case 3: { // Cypress AM — warm plucked folk/jazz
        const sc = major ? [0, 2, 4, 7, 9, 12] : [0, 3, 5, 7, 10, 12];
        if (s16 % 4 === 0) this.note(t, root - 12 + (s16 % 8 === 0 ? 0 : 7), 0.5, 'triangle', 0.3, 700);
        if (s16 % 2 === 0 && this.rng.chance(0.7)) this.note(t, root + 12 + sc[this.rng.int(0, sc.length - 1)], 0.5, 'triangle', 0.1, 2400);
        if (s16 % 8 === 4) this.hat(t, 0.06, false);
        if (s16 === 0) this.pad(t, root, 60 / this.bpm() * 4, 0.25, !major);
        break; }
      default: break;
    }
  }
}
