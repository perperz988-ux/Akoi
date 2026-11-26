/** Fully procedural WebAudio: engines, tyres, guns, sirens, ambience, phone sounds and a generative car radio. */
export class Audio {
  ctx: AudioContext | null = null; master!: GainNode; sfx!: GainNode; music!: GainNode; amb!: GainNode;
  private noiseBuf!: AudioBuffer;
  private eng: { o1: OscillatorNode; o2: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null = null;
  private tyre: { g: GainNode } | null = null; private siren: { o: OscillatorNode; g: GainNode } | null = null;
  private ambN: { wind: GainNode; waves: GainNode; rain: GainNode; city: GainNode; swamp: GainNode } | null = null;
  private radioOn = false; private radioT = 0; private radioStep = 0; station = 0;
  vols = { master: 0.8, sfx: 0.9, music: 0.5 };
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor(); comp.connect(this.master);
    this.sfx = c.createGain(); this.sfx.connect(comp); this.music = c.createGain(); this.music.connect(comp); this.amb = c.createGain(); this.amb.connect(comp);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.setVolumes(this.vols);
    // engine
    const o1 = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 600; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(this.sfx); o1.start(); o2.start(); this.eng = { o1, o2, f, g };
    // tyres
    const tn = this.noise(true), tf = c.createBiquadFilter(), tg = c.createGain(); tf.type = 'bandpass'; tf.frequency.value = 1800; tf.Q.value = 3; tg.gain.value = 0; tn.connect(tf); tf.connect(tg); tg.connect(this.sfx); this.tyre = { g: tg };
    // siren
    const so = c.createOscillator(), sg = c.createGain(); so.type = 'triangle'; sg.gain.value = 0; so.connect(sg); sg.connect(this.sfx); so.start(); this.siren = { o: so, g: sg };
    // ambience beds
    const bed = (freq: number, type: BiquadFilterType, q = 0.7) => { const n = this.noise(true), fl = c.createBiquadFilter(), gg = c.createGain(); fl.type = type; fl.frequency.value = freq; fl.Q.value = q; gg.gain.value = 0; n.connect(fl); fl.connect(gg); gg.connect(this.amb); return { gg, fl }; };
    const wind = bed(400, 'lowpass'), waves = bed(500, 'lowpass'), rain = bed(4000, 'highpass'), city = bed(220, 'lowpass'), swamp = bed(3200, 'bandpass', 8);
    this.ambN = { wind: wind.gg, waves: waves.gg, rain: rain.gg, city: city.gg, swamp: swamp.gg };
    (this as any).wavesF = waves.fl;
  }
  setVolumes(v: { master: number; sfx: number; music: number }) { this.vols = v; if (!this.ctx) return; this.master.gain.value = v.master; this.sfx.gain.value = v.sfx; this.music.gain.value = v.music * 0.6; this.amb.gain.value = v.sfx * 0.8; }
  suspend(on: boolean) { if (!this.ctx) return; if (on) this.ctx.suspend(); else this.ctx.resume(); }
  private noise(loop = false) { const s = this.ctx!.createBufferSource(); s.buffer = this.noiseBuf; s.loop = loop; if (loop) s.start(0, Math.random()); return s; }
  private burst(dur: number, freq: number, type: BiquadFilterType, gain: number, q = 1, sweep = 0) {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    const n = this.noise(), f = c.createBiquadFilter(), g = c.createGain(); f.type = type; f.frequency.setValueAtTime(freq, t); if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur); f.Q.value = q;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); n.connect(f); f.connect(g); g.connect(this.sfx); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }
  private tone(freq: number, dur: number, type: OscillatorType, gain: number, to?: number, dest?: AudioNode, when = 0) {
    const c = this.ctx; if (!c) return; const t = c.currentTime + when;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(dest ?? this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  gun(kind: string, dist = 0) {
    const a = Math.max(0.05, 1 - dist / 220);
    if (kind === 'shotgun') { this.burst(0.5, 1400, 'lowpass', 1.2 * a, 0.7, 0.2); this.tone(70, 0.3, 'sine', 0.9 * a, 35); }
    else if (kind === 'rifle') { this.burst(0.28, 2400, 'lowpass', 0.9 * a, 0.8, 0.25); this.tone(90, 0.16, 'sine', 0.6 * a, 40); this.burst(0.6, 600, 'lowpass', 0.18 * a, 0.5); }
    else if (kind === 'smg') { this.burst(0.14, 2600, 'lowpass', 0.6 * a, 0.9, 0.3); this.tone(120, 0.08, 'sine', 0.4 * a, 60); }
    else { this.burst(0.22, 2000, 'lowpass', 0.8 * a, 0.8, 0.25); this.tone(100, 0.12, 'sine', 0.55 * a, 45); }
  }
  dryFire() { this.tone(2400, 0.03, 'square', 0.08); }
  reload() { this.burst(0.05, 3000, 'bandpass', 0.25, 4); setTimeout(() => this.burst(0.06, 2200, 'bandpass', 0.3, 4), 260); }
  punch() { this.burst(0.12, 400, 'lowpass', 0.6, 1); this.tone(90, 0.1, 'sine', 0.4, 50); }
  impact(force: number) { this.burst(0.3 + force * 0.02, 900, 'lowpass', Math.min(1.2, 0.2 + force * 0.05), 0.7, 0.3); this.burst(0.15, 4000, 'highpass', Math.min(0.5, force * 0.03), 1); }
  explosion(dist = 0) { const a = Math.max(0.1, 1 - dist / 400); this.burst(2.2, 800, 'lowpass', 1.6 * a, 0.6, 0.1); this.tone(50, 1.4, 'sine', 1.2 * a, 25); }
  bulletHit() { this.burst(0.05, 3500, 'bandpass', 0.15, 3); }
  ricochet() { this.tone(3000 + Math.random() * 2000, 0.18, 'sine', 0.06, 1200); }
  step(surface: string) { this.burst(0.06, surface === 'grass' ? 900 : surface === 'wood' ? 600 : 1500, 'bandpass', 0.07, 1.5); }
  horn(on: boolean) { if (on) { this.tone(392, 0.25, 'sawtooth', 0.14); this.tone(494, 0.25, 'sawtooth', 0.12); } }
  click() { this.tone(1800, 0.04, 'sine', 0.06); }
  notify() { this.tone(1320, 0.12, 'sine', 0.12); this.tone(1760, 0.18, 'sine', 0.1, undefined, undefined, 0.11); }
  ring() { for (let i = 0; i < 3; i++) { this.tone(880, 0.1, 'sine', 0.1, undefined, undefined, i * 0.22); this.tone(1100, 0.1, 'sine', 0.1, undefined, undefined, i * 0.22 + 0.1); } }
  shutter() { this.burst(0.05, 5000, 'highpass', 0.4, 1); setTimeout(() => this.burst(0.07, 3000, 'highpass', 0.3, 1), 70); }
  thunder() { this.burst(3.5, 300, 'lowpass', 1.0, 0.4, 0.3); }
  cash() { this.tone(1500, 0.08, 'square', 0.06); this.tone(2000, 0.12, 'square', 0.05, undefined, undefined, 0.08); }
  wanted() { this.tone(660, 0.15, 'square', 0.06); this.tone(440, 0.2, 'square', 0.06, undefined, undefined, 0.15); }
  mission() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.1, undefined, this.music, i * 0.12)); }
  fail() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.1, undefined, this.music, i * 0.18)); }

  /** Continuous mixes, called every frame. */
  update(dt: number, s: { inCar: boolean; rpm: number; throttle: number; slip: number; speed: number; sirenDist: number; rain: number; wind: number; coast: number; city: number; swamp: number; night: number; radio: boolean; heavy: boolean }) {
    const c = this.ctx; if (!c || !this.eng) return; const t = c.currentTime;
    const e = this.eng; const f0 = 28 + s.rpm / 60 * (s.heavy ? 0.7 : 1);
    e.o1.frequency.setTargetAtTime(f0, t, 0.05); e.o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.05);
    e.f.frequency.setTargetAtTime(300 + s.rpm * 0.25 + Math.abs(s.throttle) * 900, t, 0.05);
    e.g.gain.setTargetAtTime(s.inCar ? 0.05 + Math.abs(s.throttle) * 0.08 : 0, t, 0.08);
    this.tyre!.g.gain.setTargetAtTime(s.inCar ? Math.min(0.35, Math.max(0, s.slip - 0.12) * 0.8) * Math.min(1, s.speed / 6) : 0, t, 0.05);
    // siren wail from the nearest cop car
    const sv = s.sirenDist < 200 ? (1 - s.sirenDist / 200) * 0.09 : 0;
    this.siren!.g.gain.setTargetAtTime(sv, t, 0.1); this.siren!.o.frequency.setTargetAtTime(700 + Math.sin(t * 4) * 300, t, 0.02);
    const a = this.ambN!;
    a.rain.gain.setTargetAtTime(s.rain * 0.25, t, 0.5); a.wind.gain.setTargetAtTime(0.02 + s.wind * 0.08, t, 0.5);
    a.waves.gain.setTargetAtTime(s.coast * 0.18 * (0.6 + 0.4 * Math.sin(t * 0.4)), t, 0.3); a.city.gain.setTargetAtTime(s.city * 0.06, t, 0.5);
    a.swamp.gain.setTargetAtTime(s.swamp * 0.025 * (s.night > 0.5 ? 1.5 : 0.6) * (Math.sin(t * 13) > 0.3 ? 1 : 0.2), t, 0.05);
    // radio
    this.radioOn = s.radio;
    if (this.radioOn) { this.radioT -= dt; if (this.radioT <= 0) { this.radioT = 60 / (this.station === 0 ? 104 : 88) / 2; this.radioTick(); } }
  }
  private radioTick() {
    const st = this.radioStep++; const bar = Math.floor(st / 8) % 4, beat = st % 8;
    const roots = this.station === 0 ? [220, 174.6, 196, 164.8] : [146.8, 130.8, 110, 123.5]; const r = roots[bar];
    if (beat % 2 === 0) { this.tone(55, 0.18, 'sine', 0.3, 40, this.music); }
    if (beat % 4 === 2) this.burst(0.12, 1800, 'bandpass', 0.18, 0.8);
    this.burst(0.03, 8000, 'highpass', 0.04, 1);
    this.tone(r / 2, 0.2, 'sawtooth', 0.05, undefined, this.music);
    if (beat === 0 || beat === 3 || beat === 6) { const scale = [1, 1.2, 1.5, 1.78, 2]; this.tone(r * scale[(st * 7) % 5] * 2, 0.25, this.station === 0 ? 'square' : 'triangle', 0.03, undefined, this.music); }
    if (beat === 0) for (const k of [1, 1.26, 1.5]) this.tone(r * k, 1.6, 'triangle', 0.018, undefined, this.music);
  }
}
