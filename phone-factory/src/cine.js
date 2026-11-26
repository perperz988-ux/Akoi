// Cinematic sequences for big moments. Full-screen overlay with its own 3D viewer / canvas. Tap to skip.
import * as THREE from 'three';
import { Viewer, setFold } from './phone3d.js';
import { drawLogo } from './os.js';
import { FACTORIES } from './data.js';
import { fmtNum, fmtMoney } from './sim.js';

export class Cinema {
  constructor(G) { this.G = G; this.el = document.getElementById('cine'); this.queue = []; this.active = false; }
  push(c) { this.queue.push(c); if (!this.active) this.next(); }
  next() {
    const c = this.queue.shift(); if (!c) { this.active = false; this.el.classList.remove('on'); this.el.innerHTML = ''; if (this.v) { this.v.stop(); this.v.renderer.dispose(); this.v = null; } this.G.onCineEnd && this.G.onCineEnd(); return; }
    this.active = true; this.el.classList.add('on'); this.el.innerHTML = `<div class="stage"></div><canvas class="fx"></canvas><div class="cap"><div class="k"></div><div class="t"></div><div class="s"></div></div><div class="lb top"></div><div class="lb bot"></div><button class="skip">Skip ▶▶</button>`;
    this.el.querySelector('.skip').onclick = () => this.finish(); this.el.onclick = (e) => { if (e.target.classList.contains('skip')) return; if (this.elapsed > 1.2) this.finish(); };
    this.elapsed = 0; this.cur = c; this.fx = this.el.querySelector('.fx'); this.particles = [];
    const fn = this['c_' + c.name]; if (fn) fn.call(this, c); else this.finish();
  }
  finish() { clearTimeout(this.timer); cancelAnimationFrame(this.raf); if (this.v) { this.v.stop(); this.v.renderer.dispose(); this.v = null; } this.next(); }
  caption(k, t, s) { const c = this.el.querySelector('.cap'); c.querySelector('.k').textContent = k || ''; c.querySelector('.t').textContent = t || ''; c.querySelector('.s').textContent = s || ''; c.classList.remove('show'); void c.offsetWidth; c.classList.add('show'); }
  run(dur, frame) { const t0 = performance.now(); const loop = () => { this.raf = requestAnimationFrame(loop); const t = (performance.now() - t0) / 1000; this.elapsed = t; this.drawFx(); frame && frame(t); if (t > dur) this.finish(); }; loop(); }
  viewer(d, opts = {}) {
    const st = this.el.querySelector('.stage'); const v = new Viewer(st, { autoRotate: false }); const s = this.G.s; v.screen = opts.screen || 'lock'; v.setDesign(d, s.os, s.company.name, (cv) => drawLogo(cv, s.company.logo)); v.controls.enabled = false; v.start(); this.v = v; return v;
  }
  confetti(n = 120) { const W = innerWidth, H = innerHeight; for (let i = 0; i < n; i++) this.particles.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 80, vy: 80 + Math.random() * 160, r: Math.random() * 6, c: ['#ff3d71', '#ffd166', '#4cc9f0', '#06d6a0', '#fff'][i % 5], a: Math.random() * 6 }); }
  flashes(n = 12) { for (let i = 0; i < n; i++) this.particles.push({ flash: true, x: Math.random() * innerWidth, y: innerHeight * (0.55 + Math.random() * 0.4), t: -Math.random() * 3 }); }
  drawFx() {
    const cv = this.fx; if (cv.width !== innerWidth) { cv.width = innerWidth; cv.height = innerHeight; } const g = cv.getContext('2d'); g.clearRect(0, 0, cv.width, cv.height);
    for (const p of this.particles) {
      if (p.flash) { p.t += 1 / 60; if (p.t > 0 && p.t < 0.15) { g.fillStyle = `rgba(255,255,255,${1 - p.t / 0.15})`; g.beginPath(); g.arc(p.x, p.y, 18, 0, 7); g.fill(); } if (p.t > 2.5) { p.t = -Math.random() * 2; p.x = Math.random() * innerWidth; } continue; }
      p.x += p.vx / 60; p.y += p.vy / 60; p.a += 0.1; if (p.y > cv.height + 20) { p.y = -20; p.x = Math.random() * cv.width; }
      g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.fillRect(-4, -2, 8 + p.r, 4); g.restore();
    }
  }
  design(id) { return this.G.s.designs.find((d) => d.id === id) || this.G.s.designs[0]; }
  // ----- sequences -----
  c_prototype(c) {
    const d = this.design(c.design); const v = this.viewer(d, { screen: 'off' }); this.el.classList.add('dark'); this.G.sfx.play('whoosh');
    const D = v.fitDist; v.camera.position.set(0, -D * 0.3, D * 1.6); v.phone.position.y = -6; v.phone.rotation.y = Math.PI;
    const spot = new THREE.SpotLight(0xffffff, 300, 80, 0.35, 0.6); spot.position.set(0, 25, 10); v.scene.add(spot); spot.target = v.phone;
    this.caption('PROTOTYPE #001', d.name.toUpperCase(), 'Hand-built in a garage. One of one.');
    this.run(7, (t) => { const k = Math.min(1, t / 2.5); v.phone.position.y = -6 * (1 - k * k * (3 - 2 * k)); v.phone.rotation.y = Math.PI + t * 0.9; v.camera.position.lerp(new THREE.Vector3(D * 0.4, D * 0.15, D * 0.9), 0.01); v.camera.lookAt(0, 0, 0); });
  }
  c_boot(c) {
    const d = this.design(c.design); const v = this.viewer(d, { screen: 'off' }); const s = this.G.s; this.el.classList.add('dark');
    v.view('front'); v.camera.position.multiplyScalar(0.8); v.controls.update();
    const logo = drawLogo(Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), s.company.logo);
    this.caption('FIRST BOOT', 'Hold the power button…', ''); let phase = 0;
    v.animScreen = (dt) => { v._b = (v._b || 0) + dt; const t = v._b; if (t < 1.2) { v.screen = 'off'; } else if (t < 5) { if (phase === 0) { phase = 1; this.G.sfx.play('boot'); this.caption('FIRST BOOT', 'It\'s alive!', `${s.os.name} 1.0 · ${s.company.name}`); } v.screen = 'boot'; v.drawScreen({ boot: (t - 1.2) / 3.8, logoCanvas: logo, t }); return; } else if (t < 6.5) v.screen = 'lock'; else { v.screen = 'home'; if (phase === 1) { phase = 2; this.caption('IT WORKS!', 'Your first phone just booted up.', 'Now test it, build it, sell it.'); } } if (Math.floor(t * 4) !== v._f) { v._f = Math.floor(t * 4); v.drawScreen(); } };
    this.run(9, (t) => { v.phone.rotation.y = Math.sin(t * 0.4) * 0.25; });
  }
  c_factory(c) {
    const F = FACTORIES.find((f) => f.id === c.type) || FACTORIES[1]; const st = this.el.querySelector('.stage'); const cv = document.createElement('canvas'); st.appendChild(cv); this.G.sfx.play('fanfare');
    this.caption('GRAND OPENING', F.name.toUpperCase(), `${this.G.s.company.name} goes industrial. ${F.base} phones/day per line.`);
    let cut = false;
    this.run(6.5, (t) => {
      cv.width = innerWidth; cv.height = innerHeight; const g = cv.getContext('2d'), W = cv.width, H = cv.height;
      const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#1d2b53'); sky.addColorStop(1, '#ff8a5b'); g.fillStyle = sky; g.fillRect(0, 0, W, H);
      g.fillStyle = '#20232f'; g.fillRect(0, H * 0.78, W, H); const bw = Math.min(W * 0.7, 900), bx = W / 2 - bw / 2, by = H * 0.38, bh = H * 0.4;
      g.fillStyle = '#3d4459'; g.fillRect(bx, by, bw, bh); for (let i = 0; i < 6; i++) { g.fillStyle = '#4b5570'; g.beginPath(); g.moveTo(bx + (i * bw) / 6, by); g.lineTo(bx + ((i + 0.5) * bw) / 6, by - H * 0.08); g.lineTo(bx + ((i + 1) * bw) / 6, by); g.fill(); }
      for (let i = 0; i < 3; i++) { g.fillStyle = '#2b3040'; g.fillRect(bx + bw * (0.1 + i * 0.12), by - H * 0.22, bw * 0.05, H * 0.22); g.fillStyle = `rgba(220,220,230,${0.25})`; g.beginPath(); g.arc(bx + bw * (0.125 + i * 0.12) + Math.sin(t + i) * 10, by - H * 0.25 - ((t * 40 + i * 30) % 120), 18 + ((t * 20) % 30), 0, 7); g.fill(); }
      g.fillStyle = '#ffd166'; for (let i = 0; i < 8; i++) g.fillRect(bx + bw * 0.08 + i * bw * 0.11, by + bh * 0.2, bw * 0.06, bh * 0.15);
      g.fillStyle = '#fff'; g.font = `900 ${Math.min(42, bw * 0.05)}px system-ui`; g.textAlign = 'center'; g.fillText(this.G.s.company.name.toUpperCase(), W / 2, by + bh * 0.55);
      const lg = drawLogo(Object.assign(document.createElement('canvas'), { width: 128, height: 128 }), this.G.s.company.logo); g.drawImage(lg, W / 2 - 40, by + bh * 0.6, 80, 80);
      // ribbon
      const ry = H * 0.82; if (t < 2.4) { g.fillStyle = '#e63946'; g.fillRect(bx - 40, ry, bw + 80, 14); g.fillStyle = '#ffd166'; g.font = '40px sans-serif'; g.fillText('✂️', bx + (bw + 80) * Math.min(1, t / 2.4) - 40, ry + 10); }
      else { if (!cut) { cut = true; this.confetti(160); this.G.sfx.play('crowd'); } g.fillStyle = '#e63946'; g.save(); g.translate(bx - 40, ry); g.rotate(0.6 * Math.min(1, (t - 2.4) * 2)); g.fillRect(0, 0, bw / 2 + 40, 14); g.restore(); g.save(); g.translate(bx + bw + 40, ry); g.rotate(-0.6 * Math.min(1, (t - 2.4) * 2)); g.fillRect(-bw / 2 - 40, 0, bw / 2 + 40, 14); g.restore(); }
    });
  }
  c_launch(c) {
    const s = this.G.s; const p = s.products.find((x) => x.id === c.product); const d = this.design(p ? p.d : null); const v = this.viewer(d, { screen: 'home' });
    this.el.classList.add('stagebg'); this.G.sfx.play('crowd'); this.flashes(16);
    const D = v.fitDist; v.camera.position.set(0, D * 0.1, D * 1.05); v.camera.lookAt(0, 0, 0);
    const spot = new THREE.SpotLight(0xffffff, 400, 90, 0.3, 0.5); spot.position.set(0, 30, 15); v.scene.add(spot); spot.target = v.phone;
    this.caption('LAUNCH DAY', d.name.toUpperCase(), p ? `${fmtMoney(p.price)} · available now in ${p.regions.length} region${p.regions.length > 1 ? 's' : ''}` : '');
    setTimeout(() => { this.G.sfx.play('fanfare'); this.confetti(90); }, 3500);
    this.run(8, (t) => { v.phone.rotation.y = t * 0.8; v.phone.position.y = Math.sin(t * 1.5) * 0.3; });
  }
  c_milestone(c) {
    const st = this.el.querySelector('.stage'); st.innerHTML = '<div class="bignum">0</div>'; const el = st.querySelector('.bignum'); this.G.sfx.play('fanfare'); this.confetti(140);
    this.caption('MILESTONE', `${fmtNum(c.n)} PHONES SOLD`, `${this.G.s.company.name} is on fire 🔥`);
    this.run(5, (t) => { el.textContent = Math.round(c.n * Math.min(1, t / 2) ** 0.5).toLocaleString('en-US'); });
  }
  c_world() {
    const st = this.el.querySelector('.stage'); const v = new Viewer(st); v.controls.enabled = false; this.v = v; v.start();
    const globe = new THREE.Group(); const sph = new THREE.Mesh(new THREE.SphereGeometry(8, 48, 32), new THREE.MeshStandardMaterial({ color: 0x0b3d91, roughness: 0.6, metalness: 0.2 })); globe.add(sph);
    const dots = new THREE.Group(); for (let i = 0; i < 400; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.28, r = Math.sqrt(1 - u * u); const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: Math.random() < 0.7 ? 0xff3d71 : 0xffd166 })); m.position.set(Math.cos(a) * r * 8.05, u * 8.05, Math.sin(a) * r * 8.05); dots.add(m); }
    globe.add(dots); v.scene.add(globe); v.camera.position.set(0, 4, 30); v.camera.lookAt(0, 0, 0);
    this.G.sfx.play('fanfare'); setTimeout(() => this.G.sfx.play('crowd'), 800); this.confetti(160);
    this.caption('HISTORY MADE', '#1 PHONE COMPANY IN THE WORLD', `${this.G.s.company.name} now sells more phones than anyone on Earth.`);
    this.run(8, (t) => { globe.rotation.y = t * 0.5; dots.children.forEach((m, i) => m.scale.setScalar(Math.min(1, Math.max(0, t * 1.5 - i / 300)))); });
  }
  c_campaign() {
    const st = this.el.querySelector('.stage'); st.innerHTML = '<div class="bignum">🏆</div>'; this.G.sfx.play('fanfare'); this.confetti(200);
    this.caption('CAMPAIGN COMPLETE', 'SANDBOX MODE UNLOCKED', 'Unlimited money. Every technology. Go build something ridiculous.');
    this.run(7);
  }
}
