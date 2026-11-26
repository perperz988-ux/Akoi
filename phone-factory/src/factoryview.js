// Real-time 2D factory floor: 10 stations on a snaking conveyor, units flowing as the simulation moves them.
import { STAGES, STAGE_ICON } from './data.js';
import { factoryRate, inPipeline } from './sim.js';

export class FactoryView {
  constructor(canvas, G) { this.cv = canvas; this.G = G; this.sprites = []; this.acc = new Array(10).fill(0); this.t = 0; this.fx = []; }
  layout() {
    const W = this.cv.width, H = this.cv.height, cols = W < 600 ? 2 : 5, rows = Math.ceil(10 / cols);
    const mx = W / cols, my = H / rows; const pts = [];
    for (let i = 0; i < 10; i++) { const r = Math.floor(i / cols), c = r % 2 ? cols - 1 - (i % cols) : i % cols; pts.push([mx * (c + 0.5), my * (r + 0.5)]); }
    this.pts = pts; this.cell = Math.min(mx, my);
  }
  feed(moved) {
    // moved: [[stage, units], ...] — spawn up to a handful of sprites per stage per frame
    for (const [st, m] of moved) {
      const rate = Math.max(1, factoryRate(this.G.s).cap); const per = Math.max(1, rate / 25); // one sprite ≈ per units
      this.acc[st] += m / per;
      while (this.acc[st] >= 1 && this.sprites.length < 260) { this.acc[st] -= 1; this.sprites.push({ st, k: 0, col: this.colorFor(st) }); }
      if (this.acc[st] > 5) this.acc[st] = 5;
      if (st === 7 && Math.random() < 0.04) this.fx.push({ x: this.pts?.[7]?.[0] || 0, y: this.pts?.[7]?.[1] || 0, t: 0 });
    }
  }
  colorFor() { const s = this.G.s; const q = s.pipeline.find((x) => x.length); const d = q && s.designs.find((dd) => dd.id === q[0].d); return d ? d.ext.color : '#ccc'; }
  draw(dt) {
    const cv = this.cv, g = cv.getContext('2d'); const r = cv.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio, 2);
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    this.layout(); this.t += dt; const s = this.G.s; const W = cv.width, H = cv.height, P = this.pts, C = this.cell;
    const running = !this.G.paused && this.G.speed > 0;
    g.fillStyle = '#151824'; g.fillRect(0, 0, W, H);
    // floor tiles
    g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 1; for (let x = 0; x < W; x += 40 * dpr) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 40 * dpr) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // conveyor
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = '#2d3142'; g.lineWidth = C * 0.16; g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke();
    g.strokeStyle = '#4f5d75'; g.lineWidth = 2 * dpr; g.setLineDash([8 * dpr, 10 * dpr]); g.lineDashOffset = running ? -this.t * 40 * dpr * Math.min(3, this.G.speed) : 0; g.beginPath(); P.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); g.setLineDash([]);
    const q = inPipeline(s); const fr = factoryRate(s); const maxLv = (i) => Math.max(...s.factories.map((f) => f.stations[i]));
    const bott = fr.rates.indexOf(Math.min(...fr.rates));
    P.forEach(([x, y], i) => {
      const w = C * 0.62, h = C * 0.46; const busy = q[i] > 0.5;
      g.fillStyle = busy ? '#283149' : '#1f2433'; g.strokeStyle = i === bott ? '#ff3d71' : busy ? '#4cc9f0' : '#3a4256'; g.lineWidth = 2 * dpr;
      g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, 10 * dpr); g.fill(); g.stroke();
      g.font = `${C * 0.13}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(STAGE_ICON[i], x - w * 0.32, y - h * 0.18);
      g.fillStyle = '#fff'; g.font = `600 ${Math.max(9 * dpr, C * 0.058)}px system-ui,sans-serif`; g.textAlign = 'left'; g.fillText(`${i + 1}. ${STAGES[i]}`.slice(0, 22), x - w * 0.18, y - h * 0.18);
      g.fillStyle = '#9aa5b8'; g.font = `${Math.max(8 * dpr, C * 0.05)}px system-ui,sans-serif`; g.fillText(`cola ${Math.round(q[i])} · ${Math.round(fr.rates[i])}/día`, x - w * 0.42, y + h * 0.08);
      g.fillStyle = '#ffd166'; g.fillText('★'.repeat(maxLv(i)) + '☆'.repeat(5 - maxLv(i)), x - w * 0.42, y + h * 0.3);
      // workers
      const nw = Math.min(3, Math.max(1, Math.round(fr.staff * 3)));
      for (let k = 0; k < nw; k++) { const wx = x + w * 0.22 + k * C * 0.06, wy = y + h * 0.25 + (busy && running ? Math.sin(this.t * 8 + k + i) * 2 * dpr : 0); g.fillStyle = ['#f4a261', '#2a9d8f', '#e9c46a'][k]; g.beginPath(); g.arc(wx, wy - 6 * dpr, 3.5 * dpr, 0, 7); g.fill(); g.fillRect(wx - 3 * dpr, wy - 3 * dpr, 6 * dpr, 7 * dpr); }
      if (busy && running && i >= 1 && i <= 8 && Math.random() < 0.15) this.fx.push({ x: x + (Math.random() - 0.5) * w * 0.5, y: y - h * 0.5, t: 0, spark: true });
    });
    // sprites
    const sp = (running ? Math.min(3, 0.8 + this.G.speed * 0.4) : 0) * dt;
    for (let i = this.sprites.length - 1; i >= 0; i--) {
      const o = this.sprites[i]; o.k += sp * 1.6; const a = P[o.st], b = P[Math.min(9, o.st + 1)];
      if (o.k >= 1 || o.st === 9) { if (o.st === 9) { o.k2 = (o.k2 || 0) + sp; if (o.k2 > 1) { this.sprites.splice(i, 1); continue; } } else { this.sprites.splice(i, 1); continue; } }
      const x = o.st === 9 ? a[0] + (o.k2 || 0) * C * 0.6 : a[0] + (b[0] - a[0]) * o.k, y = o.st === 9 ? a[1] - (o.k2 || 0) * C * 0.2 : a[1] + (b[1] - a[1]) * o.k;
      g.fillStyle = o.st >= 8 ? '#c8a26b' : o.col; g.strokeStyle = '#000'; g.lineWidth = 1;
      const pw = (o.st >= 8 ? 9 : 6) * dpr, ph = (o.st >= 8 ? 9 : 11) * dpr; g.beginPath(); g.roundRect(x - pw / 2, y - ph / 2, pw, ph, 2 * dpr); g.fill(); g.stroke();
    }
    // sparks / rejects
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t += dt; if (f.t > 0.6) { this.fx.splice(i, 1); continue; } g.fillStyle = f.spark ? `rgba(255,220,120,${1 - f.t / 0.6})` : `rgba(255,61,113,${1 - f.t / 0.6})`; g.beginPath(); g.arc(f.x + (f.spark ? Math.sin(f.t * 30) * 6 : 0), f.y - f.t * 30 * dpr, (f.spark ? 2 : 6) * dpr, 0, 7); g.fill(); if (!f.spark) { g.font = `bold ${11 * dpr}px sans-serif`; g.fillText('✖ rechazo', f.x, f.y - 14 * dpr - f.t * 30 * dpr); } }
    if (!running) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff'; g.font = `700 ${16 * dpr}px system-ui`; g.textAlign = 'center'; g.fillText('⏸ EN PAUSA', W / 2, H / 2); }
  }
}
