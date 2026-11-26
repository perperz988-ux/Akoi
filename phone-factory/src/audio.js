// Tiny procedural sound effects.
export class Sfx {
  constructor() { this.ctx = null; this.vol = 0.6; this.on = true; }
  init() { if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; } const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; this.ctx = new AC(); this.out = this.ctx.createGain(); this.out.gain.value = this.vol; this.out.connect(this.ctx.destination); const n = this.ctx.sampleRate; const b = this.ctx.createBuffer(1, n, n); const d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noise = b; }
  tone(f, t, dur, vol = 0.12, type = 'sine', f2) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05); }
  hiss(t, dur, vol, freq = 1500, q = 0.7) { const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(this.out); s.start(t); s.stop(t + dur); }
  play(name) {
    if (!this.ctx || !this.on) return; const t = this.ctx.currentTime;
    switch (name) {
      case 'click': this.tone(900, t, 0.04, 0.05, 'square'); break;
      case 'cash': this.tone(988, t, 0.08, 0.08, 'square'); this.tone(1319, t + 0.08, 0.25, 0.08, 'square'); break;
      case 'good': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.08, 0.3, 0.09, 'triangle')); break;
      case 'bad': this.tone(220, t, 0.2, 0.1, 'square'); this.tone(165, t + 0.18, 0.35, 0.1, 'square'); break;
      case 'test': this.tone(600, t, 0.06, 0.05, 'sine', 1200); break;
      case 'pass': this.tone(784, t, 0.12, 0.08, 'triangle'); this.tone(1175, t + 0.1, 0.2, 0.08, 'triangle'); break;
      case 'fail': this.tone(300, t, 0.25, 0.1, 'sawtooth', 120); break;
      case 'boot': [262, 392, 523, 784].forEach((f, i) => { this.tone(f, t + i * 0.12, 1.6 - i * 0.2, 0.07, 'sine'); this.tone(f * 2, t + i * 0.12, 0.8, 0.02, 'triangle'); }); break;
      case 'whoosh': this.hiss(t, 0.6, 0.25, 800, 0.5); break;
      case 'crowd': for (let i = 0; i < 6; i++) this.hiss(t + i * 0.12, 1.8, 0.12, 600 + Math.random() * 1400, 0.4); for (let i = 0; i < 12; i++) this.hiss(t + 0.3 + Math.random() * 1.5, 0.05, 0.25, 3000, 2); break;
      case 'fanfare': [[523, 0], [659, 0.15], [784, 0.3], [1046, 0.45], [784, 0.7], [1046, 0.85]].forEach(([f, d]) => { this.tone(f, t + d, 0.4, 0.1, 'square'); this.tone(f / 2, t + d, 0.4, 0.08, 'triangle'); }); break;
      case 'research': [660, 880, 1320].forEach((f, i) => this.tone(f, t + i * 0.06, 0.25, 0.07, 'sine')); break;
      case 'alert': this.tone(880, t, 0.12, 0.1, 'square'); this.tone(880, t + 0.2, 0.12, 0.1, 'square'); break;
    }
  }
}
