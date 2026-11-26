// Fully procedural WebAudio: SFX, ambience and a small adaptive music engine.
export class Audio {
  constructor() {
    this.ctx = null; this.vol = { master: 0.8, music: 0.5, sfx: 0.8 };
    this.mode = 'none'; this.step = 0; this.nextT = 0; this.night = 0; this.interior = false;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.connect(c.destination);
    this.musicG = c.createGain(); this.musicG.connect(this.master);
    this.sfxG = c.createGain(); this.sfxG.connect(this.master);
    this.ambG = c.createGain(); this.ambG.gain.value = 0; this.ambG.connect(this.master);
    // noise buffer
    const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    // wind ambience
    const n = c.createBufferSource(); n.buffer = b; n.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    this.windF = f; n.connect(f); f.connect(this.ambG); n.start();
    this.applyVol();
    this._iv = setInterval(() => this._tick(), 50);
  }
  applyVol() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master; this.musicG.gain.value = this.vol.music * 0.35; this.sfxG.gain.value = this.vol.sfx;
  }
  setEnv(night, interior) { this.night = night; this.interior = interior; if (this.ctx) { this.ambG.gain.setTargetAtTime(interior ? 0.03 : 0.07 + night * 0.03, this.ctx.currentTime, 0.5); this.windF.frequency.setTargetAtTime(interior ? 160 : 380, this.ctx.currentTime, 0.5); } }
  setMusic(mode) { this.mode = mode; }
  _osc(type, freq, t, dur, vol, dest, glide) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxG); o.start(t); o.stop(t + dur + 0.05);
  }
  _noise(t, dur, vol, freq = 1200, type = 'bandpass', dest) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxG); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  sfx(name, p = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    switch (name) {
      case 'step': this._noise(t, 0.08, 0.05 * p, this.interior ? 500 : 900); break;
      case 'rummage': for (let i = 0; i < 3; i++) this._noise(t + i * 0.07 + Math.random() * 0.03, 0.09, 0.12, 600 + Math.random() * 2400); if (Math.random() < 0.3) this._osc('square', 300 + Math.random() * 500, t, 0.05, 0.03); break;
      case 'found': [660, 880, 1320].forEach((f, i) => this._osc('triangle', f, t + i * 0.07, 0.18, 0.15)); break;
      case 'junk': this._osc('square', 200, t, 0.12, 0.08, null, 120); this._osc('triangle', 300, t + 0.05, 0.12, 0.08); break;
      case 'ding': this._osc('sine', 1318, t, 0.25, 0.18); this._osc('sine', 1760, t + 0.09, 0.35, 0.15); break;
      case 'click': this._osc('square', 1400, t, 0.03, 0.05); break;
      case 'buzz': for (let i = 0; i < 2; i++) this._osc('sawtooth', 110, t + i * 0.18, 0.12, 0.06); break;
      case 'shutter': this._noise(t, 0.06, 0.3, 3000, 'highpass'); this._noise(t + 0.08, 0.08, 0.2, 2000, 'highpass'); break;
      case 'scan': this._osc('sine', 900 + p * 900, t, 0.07, 0.08); break;
      case 'scanDone': [523, 784, 1046, 1568].forEach((f, i) => this._osc('sine', f, t + i * 0.06, 0.2, 0.12)); break;
      case 'gate': this._osc('sawtooth', 90, t, 1.2, 0.08, null, 60); this._noise(t, 1.0, 0.05, 300); for (let i = 0; i < 5; i++) this._osc('square', 800 + Math.random() * 300, t + i * 0.2, 0.05, 0.02); break;
      case 'power': this._osc('sawtooth', 40, t, 1.6, 0.15, null, 120); this._osc('sine', 60, t + 0.4, 1.4, 0.1); break;
      case 'mission': [523, 659, 784, 1046].forEach((f, i) => { this._osc('square', f, t + i * 0.11, 0.25, 0.07); this._osc('triangle', f / 2, t + i * 0.11, 0.3, 0.1); }); break;
      case 'start': [392, 523, 659].forEach((f, i) => this._osc('triangle', f, t + i * 0.12, 0.3, 0.12)); break;
      case 'sting': // DUN DUN DUNNN
        [[147, 0], [139, 0.45], [131, 0.9]].forEach(([f, d], i) => { const dur = i === 2 ? 2.2 : 0.38; this._osc('sawtooth', f, t + d, dur, 0.18); this._osc('sawtooth', f * 1.5, t + d, dur, 0.08); this._osc('sine', f / 2, t + d, dur, 0.25); });
        this._noise(t + 0.9, 1.5, 0.15, 120, 'lowpass'); break;
      case 'whoosh': this._noise(t, 0.5, 0.2, 800, 'bandpass'); break;
      case 'thud': this._osc('sine', 90, t, 0.4, 0.4, null, 40); this._noise(t, 0.2, 0.2, 200, 'lowpass'); break;
      case 'raccoon': for (let i = 0; i < 4; i++) this._osc('square', 1200 + Math.random() * 800, t + i * 0.08, 0.06, 0.05, null, 700); break;
      case 'reveal': [262, 330, 392, 523, 659, 784].forEach((f, i) => { this._osc('sine', f, t + i * 0.05, 4, 0.08); this._osc('triangle', f * 2, t + 0.3 + i * 0.05, 3.5, 0.03); }); break;
      case 'error': this._osc('square', 220, t, 0.15, 0.1); this._osc('square', 160, t + 0.15, 0.25, 0.1); break;
      case 'coin': this._osc('square', 988, t, 0.07, 0.07); this._osc('square', 1319, t + 0.07, 0.2, 0.07); break;
      case 'vault': this._osc('sawtooth', 55, t, 2.5, 0.2, null, 35); for (let i = 0; i < 4; i++) this._noise(t + i * 0.5, 0.3, 0.2, 400); this._osc('sine', 880, t + 2.3, 0.6, 0.1); break;
      case 'talk': this._osc('triangle', 180 + Math.random() * 120 * p, t, 0.05, 0.04); break;
      case 'drink': for (let i = 0; i < 4; i++) this._noise(t + i * 0.12, 0.08, 0.1, 500); this._osc('sine', 500, t + 0.6, 0.2, 0.05, null, 900); break;
    }
  }
  // tiny adaptive music: chord pads + arps, different per mode
  _tick() {
    const c = this.ctx; if (!c || this.mode === 'none') return;
    if (this.nextT < c.currentTime) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.25) { this._beat(this.nextT); this.nextT += this.mode === 'tension' ? 0.32 : this.mode === 'cine' ? 0.5 : 0.24; this.step++; }
  }
  _beat(t) {
    const m = this.mode, s = this.step, out = this.musicG;
    const prog = {
      explore: [[220, 277, 330], [196, 247, 294], [175, 220, 262], [196, 247, 294]],
      title: [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]],
      tension: [[147, 175, 220], [139, 165, 208], [147, 175, 220], [131, 156, 196]],
      cine: [[131, 165, 196], [147, 175, 220], [110, 131, 165], [123, 147, 185]],
      ending: [[262, 330, 392], [294, 370, 440], [330, 415, 494], [262, 330, 392]],
    }[m] || [[220, 277, 330]];
    const bar = Math.floor(s / 16) % prog.length, ch = prog[bar], i = s % 16;
    if (i === 0) ch.forEach((f) => this._osc('triangle', f, t, m === 'cine' ? 7.5 : 3.6, 0.05, out));
    if (m === 'explore' || m === 'title' || m === 'ending') {
      if (i % 2 === 0) this._osc('square', ch[(i / 2) % 3] * 2, t, 0.15, i % 4 === 0 ? 0.025 : 0.015, out);
      if (i % 4 === 0) this._osc('sine', ch[0] / 2, t, 0.3, 0.12, out, ch[0] / 2.2);
      if (i % 8 === 4) this._noise(t, 0.08, 0.06, 4000, 'highpass', out);
      if (i % 2 === 1 && Math.random() < 0.5) this._noise(t, 0.03, 0.02, 8000, 'highpass', out);
    } else if (m === 'tension') {
      if (i % 4 === 0) this._osc('sine', ch[0] / 2, t, 0.5, 0.15, out);
      if (i % 8 === 6) this._osc('sawtooth', ch[2] * 2, t, 0.25, 0.02, out);
    } else if (m === 'cine') {
      if (i % 8 === 0) this._osc('sine', ch[0] / 2, t, 3, 0.1, out);
    }
  }
}
