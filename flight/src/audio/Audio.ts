// Procedural WebAudio: turbofan (fan whine + broadband roar), piston engine (harmonic buzz),
// wind/airflow, rain, rolling/tyre noises, gear motor, warnings, thunder and voice callouts.
export class Audio {
  ctx: AudioContext | null = null; master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private eng: { whine: OscillatorNode; whineG: GainNode; roar: BiquadFilterNode; roarG: GainNode; buzz: OscillatorNode; buzzG: GainNode; buzzF: BiquadFilterNode }[] = [];
  private wind!: { f: BiquadFilterNode; g: GainNode }; private rain!: GainNode; private roll!: { f: BiquadFilterNode; g: GainNode };
  private warn!: { o: OscillatorNode; g: GainNode };
  volume = 0.8; voice = true; private lastCall = ''; private cockpit = false;
  init(engines: number, piston: boolean) {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2; this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2; }
      const mkNoise = (type: BiquadFilterType, f: number) => { const s = this.ctx!.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const fl = this.ctx!.createBiquadFilter(); fl.type = type; fl.frequency.value = f; const g = this.ctx!.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); s.start(); return { f: fl, g }; };
      this.wind = mkNoise('bandpass', 600); this.roll = mkNoise('lowpass', 300);
      const r = mkNoise('highpass', 2500); this.rain = r.g;
      const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = 420; const g = this.ctx.createGain(); g.gain.value = 0; o.connect(g); g.connect(this.master); o.start(); this.warn = { o, g };
    }
    this.ctx.resume();
    for (const e of this.eng) { e.whine.stop(); e.buzz.stop(); e.whineG.disconnect(); e.roarG.disconnect(); e.buzzG.disconnect(); }
    this.eng = [];
    for (let i = 0; i < Math.min(2, engines); i++) {
      const c = this.ctx;
      const whine = c.createOscillator(); whine.type = 'sawtooth'; const whineF = c.createBiquadFilter(); whineF.type = 'bandpass'; whineF.Q.value = 8; const whineG = c.createGain(); whineG.gain.value = 0;
      whine.connect(whineF); whineF.connect(whineG); whineG.connect(this.master); whine.start();
      const ns = c.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true; ns.playbackRate.value = 0.9 + i * 0.13; const roar = c.createBiquadFilter(); roar.type = 'lowpass'; roar.frequency.value = 400; const roarG = c.createGain(); roarG.gain.value = 0;
      ns.connect(roar); roar.connect(roarG); roarG.connect(this.master); ns.start();
      const buzz = c.createOscillator(); buzz.type = 'sawtooth'; const buzzF = c.createBiquadFilter(); buzzF.type = 'lowpass'; buzzF.frequency.value = 900; const buzzG = c.createGain(); buzzG.gain.value = 0;
      buzz.connect(buzzF); buzzF.connect(buzzG); buzzG.connect(this.master); buzz.start();
      (whine as any).filt = whineF;
      this.eng.push({ whine, whineG, roar, roarG, buzz, buzzG, buzzF });
    }
    void piston;
  }
  setVolume(v: number) { this.volume = v; if (this.ctx) this.master.gain.value = v; }
  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }

  update(s: { n1: number[]; piston: boolean; ias: number; gs: number; onGround: boolean; rain: number; stall: boolean; inside: boolean; gearMoving: boolean; overspeed: boolean }) {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    const inside = s.inside; this.cockpit = inside;
    const att = inside ? 0.45 : 1;
    this.eng.forEach((e, i) => {
      const n = s.n1[i] ?? 0; const f = n / 100;
      if (s.piston) {
        const rpm = n * 27; e.buzz.frequency.setTargetAtTime(Math.max(10, rpm / 60 * 2), t, 0.05);
        e.buzzG.gain.setTargetAtTime(rpm > 100 ? (0.12 + f * 0.25) * att : 0, t, 0.1); e.buzzF.frequency.setTargetAtTime(500 + f * 1800, t, 0.1);
        e.roarG.gain.setTargetAtTime(f * 0.15 * att, t, 0.1); e.roar.frequency.setTargetAtTime(300 + f * 900, t, 0.1);
        e.whineG.gain.setTargetAtTime(0, t, 0.1);
      } else {
        e.whine.frequency.setTargetAtTime(200 + n * 38, t, 0.1); (e.whine as any).filt.frequency.setTargetAtTime(300 + n * 40, t, 0.1);
        e.whineG.gain.setTargetAtTime(n > 3 ? (0.03 + f * 0.05) * (inside ? 0.6 : 1) : 0, t, 0.2);
        e.roarG.gain.setTargetAtTime(Math.pow(f, 2.2) * 0.45 * att, t, 0.2); e.roar.frequency.setTargetAtTime(250 + f * f * 1800, t, 0.2);
        e.buzzG.gain.setTargetAtTime(0, t, 0.1);
      }
    });
    const v = s.ias;
    this.wind.g.gain.setTargetAtTime(Math.min(0.35, (v / 150) ** 2 * 0.25) * (inside ? 0.6 : 1) + (s.overspeed ? 0.1 : 0), t, 0.2); this.wind.f.frequency.setTargetAtTime(300 + v * 8, t, 0.2);
    this.roll.g.gain.setTargetAtTime(s.onGround ? Math.min(0.35, s.gs / 60 * 0.3) : 0, t, 0.08); this.roll.f.frequency.setTargetAtTime(120 + s.gs * 6, t, 0.1);
    this.rain.gain.setTargetAtTime(s.rain * (inside ? 0.12 : 0.07), t, 0.5);
    // stall warning: Boeing stick shaker-ish rattle / horn
    this.warn.g.gain.setTargetAtTime(s.stall ? 0.08 * ((t * 12) % 1 < 0.5 ? 1 : 0) : 0, t, 0.01);
  }
  thump(power: number) {
    const c = this.ctx; if (!c) return; const s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180; const g = c.createGain();
    g.gain.setValueAtTime(Math.min(1, power), c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.5); s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + 0.6);
    // tyre chirp
    const o = c.createOscillator(); o.frequency.setValueAtTime(900, c.currentTime); o.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.25); const og = c.createGain(); og.gain.setValueAtTime(0.06 * Math.min(1, power * 2), c.currentTime); og.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.3); o.connect(og); og.connect(this.master); o.start(); o.stop(c.currentTime + 0.35);
  }
  thunder(delay: number, power: number) {
    const c = this.ctx; if (!c) return; const t0 = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.3; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160 + power * 200; const g = c.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.5 + power * 0.5, t0 + 0.15); g.gain.exponentialRampToValueAtTime(0.001, t0 + 4.5);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t0); s.stop(t0 + 5);
  }
  click() { const c = this.ctx; if (!c) return; const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 2200; const g = c.createGain(); g.gain.setValueAtTime(0.05, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.04); o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + 0.05); }
  chime() { const c = this.ctx; if (!c) return; for (const [f, d] of [[880, 0], [660, 0.35]]) { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.setValueAtTime(0, c.currentTime + d); g.gain.linearRampToValueAtTime(0.12, c.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + d + 1.2); o.connect(g); g.connect(this.master); o.start(c.currentTime + d); o.stop(c.currentTime + d + 1.3); } }
  say(text: string) {
    if (!this.voice || text === this.lastCall) return; this.lastCall = text;
    try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.15; u.pitch = 0.8; u.volume = Math.min(1, this.volume * 1.2); speechSynthesis.speak(u); } catch { /* unsupported */ }
  }
  resetCall() { this.lastCall = ''; }
}
export const audio = new Audio();
