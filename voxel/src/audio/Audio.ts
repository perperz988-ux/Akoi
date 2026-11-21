// Fully synthesized audio: material sounds, creature voices, ambience and generative music.
import type { Mat } from '../world/Blocks';

interface MatSound { type: BiquadFilterType; f: number; q: number; dur: number; gain: number; tone?: number; toneDur?: number; crackle?: boolean }
const MAT: Record<Mat, MatSound> = {
  stone: { type: 'bandpass', f: 1700, q: 1.2, dur: 0.09, gain: 0.7, tone: 140, toneDur: 0.06 },
  wood: { type: 'bandpass', f: 650, q: 2.5, dur: 0.1, gain: 0.7, tone: 210, toneDur: 0.12 },
  grass: { type: 'highpass', f: 2400, q: 0.7, dur: 0.14, gain: 0.45, crackle: true },
  leaves: { type: 'highpass', f: 3200, q: 0.7, dur: 0.16, gain: 0.35, crackle: true },
  plant: { type: 'highpass', f: 3000, q: 0.7, dur: 0.1, gain: 0.3 },
  dirt: { type: 'lowpass', f: 900, q: 0.8, dur: 0.12, gain: 0.7 },
  sand: { type: 'highpass', f: 1400, q: 0.5, dur: 0.18, gain: 0.4, crackle: true },
  gravel: { type: 'bandpass', f: 1100, q: 0.9, dur: 0.15, gain: 0.6, crackle: true },
  glass: { type: 'highpass', f: 4000, q: 1, dur: 0.12, gain: 0.5, tone: 2600, toneDur: 0.25 },
  snow: { type: 'lowpass', f: 1300, q: 0.6, dur: 0.16, gain: 0.45 },
  cloth: { type: 'lowpass', f: 600, q: 0.6, dur: 0.12, gain: 0.4 },
  metal: { type: 'bandpass', f: 2400, q: 4, dur: 0.06, gain: 0.5, tone: 880, toneDur: 0.3 },
  water: { type: 'lowpass', f: 700, q: 1.5, dur: 0.25, gain: 0.6 },
};

const PENTA = [0, 2, 4, 7, 9];
const NIGHT = [0, 3, 5, 7, 10];

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private ambient!: GainNode;
  private noise!: AudioBuffer;
  private rainGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private musicTimer = 8;
  private vol = { master: 0.8, sfx: 0.9, music: 0.5 };
  night = false;
  underground = false;

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC() as AudioContext;
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.connect(this.master);
    this.ambient = c.createGain(); this.ambient.connect(this.master);
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startAmbience();
  }

  setVolumes(master: number, sfx: number, music: number) { this.vol = { master, sfx, music }; this.applyVolumes(); }
  private applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.sfx.gain.value = this.vol.sfx;
    this.music.gain.value = this.vol.music * 0.5;
    this.ambient.gain.value = this.vol.sfx * 0.6;
  }

  private noiseBurst(type: BiquadFilterType, f: number, q: number, dur: number, gain: number, when = 0, dest?: AudioNode) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const flt = c.createBiquadFilter(); flt.type = type; flt.frequency.value = f * (0.9 + Math.random() * 0.2); flt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(dest || this.sfx);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }
  private tone(freq: number, dur: number, gain: number, type: OscillatorType = 'sine', when = 0, slide = 0, dest?: AudioNode) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }

  block(mat: Mat, kind: 'break' | 'place' | 'step' | 'hit', vol = 1) {
    if (!this.ctx) return;
    const m = MAT[mat] || MAT.stone;
    const k = kind === 'step' ? 0.35 : kind === 'hit' ? 0.45 : kind === 'place' ? 0.8 : 1;
    const dur = m.dur * (kind === 'break' ? 1.6 : 1);
    this.noiseBurst(m.type, m.f, m.q, dur, m.gain * k * vol);
    if (m.crackle && kind !== 'step') for (let i = 0; i < 3; i++) this.noiseBurst(m.type, m.f * 1.3, m.q, 0.03, m.gain * 0.5 * k * vol, 0.03 + i * 0.03);
    if (m.tone && kind !== 'step') this.tone(m.tone * (0.9 + Math.random() * 0.2), m.toneDur!, 0.18 * k * vol, mat === 'metal' ? 'triangle' : 'sine', 0, kind === 'break' ? 0.6 : 1);
    if (mat === 'glass' && kind === 'break') for (let i = 0; i < 4; i++) this.tone(2000 + Math.random() * 2500, 0.2, 0.06, 'sine', i * 0.04);
  }
  ui() { if (this.ctx) this.tone(660, 0.06, 0.08, 'triangle'); }
  craft() { if (!this.ctx) return; this.noiseBurst('bandpass', 900, 2, 0.08, 0.3); this.tone(520, 0.1, 0.1, 'triangle', 0.05); this.tone(780, 0.14, 0.1, 'triangle', 0.12); }
  pickup() { if (this.ctx) this.tone(880 + Math.random() * 200, 0.08, 0.07, 'sine', 0, 1.5); }
  eat() { if (!this.ctx) return; for (let i = 0; i < 3; i++) this.noiseBurst('bandpass', 1200, 1.5, 0.07, 0.35, i * 0.12); }
  hurt() { if (!this.ctx) return; this.tone(240, 0.18, 0.25, 'sawtooth', 0, 0.5); this.noiseBurst('lowpass', 800, 1, 0.12, 0.3); }
  splash() { if (!this.ctx) return; this.noiseBurst('lowpass', 1100, 0.8, 0.4, 0.5); this.noiseBurst('highpass', 2500, 0.5, 0.25, 0.2, 0.05); }
  swing() { if (this.ctx) this.noiseBurst('bandpass', 1800, 0.8, 0.1, 0.12); }
  door(open: boolean) { if (!this.ctx) return; this.noiseBurst('bandpass', open ? 500 : 380, 3, 0.18, 0.4); this.tone(open ? 180 : 140, 0.15, 0.12, 'triangle'); }
  thunder() { if (!this.ctx) return; this.noiseBurst('lowpass', 180, 0.5, 2.4, 0.9); this.noiseBurst('lowpass', 400, 0.5, 0.8, 0.5, 0.1); }
  creature(kind: string, ev: 'idle' | 'hurt' | 'death' | 'attack', dist = 0) {
    if (!this.ctx) return;
    const v = Math.max(0, 1 - dist / 24);
    if (v <= 0) return;
    const p = ev === 'hurt' ? 1.3 : ev === 'death' ? 0.7 : 1;
    switch (kind) {
      case 'mossback': this.tone(90 * p, 0.35, 0.25 * v, 'triangle', 0, 0.8); this.tone(130 * p, 0.25, 0.1 * v, 'sine', 0.1); break;
      case 'hopkin': this.tone(1400 * p, 0.06, 0.08 * v, 'sine', 0, 1.4); this.tone(1700 * p, 0.05, 0.06 * v, 'sine', 0.08); break;
      case 'glimmerwing': for (let i = 0; i < 3; i++) this.tone(2400 + i * 300, 0.12, 0.03 * v, 'sine', i * 0.07); break;
      case 'gloomling': this.tone(70 * p, 0.6, 0.25 * v, 'sawtooth', 0, 1.5); this.noiseBurst('bandpass', 300, 4, 0.5, 0.15 * v); break;
      case 'crawler': for (let i = 0; i < 5; i++) this.noiseBurst('bandpass', 2400, 6, 0.03, 0.2 * v, i * 0.05); break;
      case 'stingwisp': this.tone(320 * p, 0.4, 0.07 * v, 'sawtooth', 0, 1.1); this.tone(330 * p, 0.4, 0.07 * v, 'square', 0); break;
    }
  }

  private startAmbience() {
    const c = this.ctx!;
    const mk = (f: number) => {
      const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
      const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = f;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(flt); flt.connect(g); g.connect(this.ambient); src.start();
      return g;
    };
    this.rainGain = mk(2200);
    this.windGain = mk(350);
  }
  setAmbience(rain: number, wind: number) {
    if (!this.ctx || !this.rainGain || !this.windGain) return;
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(rain * 0.35, t, 0.5);
    this.windGain.gain.setTargetAtTime(wind * 0.25, t, 1.0);
  }

  update(dt: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) { this.playPhrase(); this.musicTimer = 25 + Math.random() * 35; }
    if (this.underground && Math.random() < dt * 0.08) this.drip();
  }

  private drip() { this.tone(1200 + Math.random() * 900, 0.12, 0.05, 'sine', 0, 0.5); }

  /** Generative ambient music phrase: a soft pad plus a pentatonic melody. */
  private playPhrase() {
    const c = this.ctx!;
    const scale = this.night || this.underground ? NIGHT : PENTA;
    const root = [48, 50, 53, 55, 45][Math.floor(Math.random() * 5)];
    const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const t0 = c.currentTime + 0.1;
    const len = 10 + Math.random() * 6;
    const flt = c.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1400; flt.connect(this.music);
    const chord = [0, scale[2], scale[3] + 0, 12 + scale[1]];
    for (const n of chord) {
      for (const det of [-4, 4]) {
        const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = midi(root + n); o.detune.value = det;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.035, t0 + 3); g.gain.setValueAtTime(0.035, t0 + len - 4); g.gain.linearRampToValueAtTime(0, t0 + len);
        o.connect(g); g.connect(flt); o.start(t0); o.stop(t0 + len + 0.1);
      }
    }
    let t = t0 + 1.5;
    const notes = 6 + Math.floor(Math.random() * 8);
    let deg = Math.floor(Math.random() * 5);
    for (let i = 0; i < notes; i++) {
      deg = Math.max(0, Math.min(9, deg + Math.floor(Math.random() * 5) - 2));
      const n = root + 12 + scale[deg % 5] + 12 * Math.floor(deg / 5);
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = midi(n);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
      o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 2);
      t += [0.5, 0.75, 1, 1.5][Math.floor(Math.random() * 4)];
      if (t > t0 + len - 2) break;
    }
  }
}
