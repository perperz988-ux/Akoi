// Modo "Probar teléfono": usa tu móvil como si fuera real. Las apps funcionan y el hardware importa
// (rendimiento = velocidad de apertura y FPS, batería = autonomía, refrigeración = temperatura, etc.).
import { Viewer, setFold } from './phone3d.js';
import { renderOS, drawIcon, drawLogo, APP_ICONS, ANIM_EASE, ANIM_DUR, hitHome } from './os.js';
import * as S from './sim.js';

const TASKS = [
  ['unlock', '🔓 Desbloquear el teléfono'], ['photo', '📸 Hacer una foto'], ['calc', '🧮 Usar la calculadora'], ['call', '📞 Hacer una llamada'],
  ['game', '🎮 Jugar 15 segundos'], ['music', '🎵 Poner música'], ['charge', '🔌 Cargar el teléfono'], ['drop', '💥 Dejarlo caer'], ['water', '💧 Meterlo en agua'],
];
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

export class TryMode {
  constructor(G) { this.G = G; this.el = null; }
  open(d) {
    const G = this.G, s = G.s; this.d = d; this.st = S.computeStats(d, s); this.hw = { cpu: S.hwItem('cpu', d.hw.cpu), cam: S.hwItem('camera', d.hw.camera), spk: S.hwItem('speaker', d.hw.speaker), mod: S.hwItem('modem', d.hw.modem), chg: S.hwItem('charging', d.hw.charging), dsp: S.hwItem('display', d.hw.display) };
    this.os = JSON.parse(JSON.stringify(s.os));
    Object.assign(this, { screen: 'lock', on: true, battery: 100, temp: 27, charging: false, dead: false, cracked: 0, done: {}, photos: [], calc: { disp: '0', acc: null, op: null, fresh: true }, game: null, musicOn: false, call: null, loading: 0, appT: 1, t: 0, fps: 60, gameTime: 0, dial: '', notes: 'Mis ideas para el próximo móvil:\n- ', drop: null });
    G.paused = true; G.modalOpen = true;
    const el = (this.el = document.createElement('div')); el.id = 'try';
    el.innerHTML = `<div class="tv" id="tryview"></div>
      <div class="tside"><div class="th"><b>📱 ${esc(d.name)}</b><small>Prueba de usuario · puntuación ${this.st.overall}</small></div>
        <div class="meters"><div><small>Batería</small><b id="mBat"></b></div><div><small>Temperatura</small><b id="mTmp"></b></div><div><small>Rendimiento</small><b id="mFps"></b></div><div><small>Señal</small><b>${this.hw.mod.name}</b></div></div>
        <div class="tbtns"><button data-a="power">⏻ Encender / apagar</button><button data-a="home">⌂ Inicio</button><button data-a="charge">🔌 Cargar</button><button data-a="drop">💥 Dejar caer</button><button data-a="water">💧 Meter en agua</button><button data-a="rotate">🔄 Girar</button>${d.ext.fold !== 'none' ? '<button data-a="fold">📖 Plegar</button>' : ''}<button data-a="repair">🛠 Reparar</button></div>
        <div class="tasks" id="tasks"></div><div class="tlog" id="tlog">Toca la pantalla del teléfono para usarlo. Desliza o pulsa ⌂ para volver al inicio.</div>
        <button class="pri" data-a="exit">✔ Terminar prueba</button></div>`;
    document.body.appendChild(el);
    const v = (this.v = new Viewer(document.getElementById('tryview')));
    v.setDesign(d, this.os, s.company.name, (cv) => drawLogo(cv, s.company.logo)); v.view('front'); v.camera.position.multiplyScalar(0.85); v.controls.update();
    v.onScreenTap = (uv) => this.tap(uv.x * v.osCanvas.width, (1 - uv.y) * v.osCanvas.height);
    v.animScreen = (dt) => this.update(dt); v.start();
    el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => this.action(b.dataset.a)));
    this.renderTasks(); G.sfx.play('boot');
  }
  close() { this.v.stop(); this.v.renderer.dispose(); this.el.remove(); this.G.paused = false; this.G.modalOpen = false; this.G.sfx.play('click'); const n = Object.keys(this.done).length; if (n) this.G.ui.toast(`📱 Prueba terminada: ${n}/${TASKS.length} tareas completadas`, 'good'); }
  log(t) { document.getElementById('tlog').innerHTML = t; }
  task(k) { if (this.done[k]) return; this.done[k] = true; this.renderTasks(); this.G.sfx.play('pass'); }
  renderTasks() { document.getElementById('tasks').innerHTML = TASKS.map(([k, l]) => `<div class="${this.done[k] ? 'ok' : ''}">${this.done[k] ? '✅' : '⬜'} ${l}</div>`).join(''); }
  lag() { return Math.max(0.05, (100 - this.st.scores.performance) / 100) * 1.4 * (this.temp > 44 ? 1.6 : 1); }
  openApp(name) {
    if (this.loading > 0) return; this.pending = name; this.loading = this.lag(); this.G.sfx.play('click');
    if (this.loading > 0.6) this.log(`⏳ Abriendo ${name}… (procesador ${this.hw.cpu.name}: ${this.loading > 1 ? 'muy lento' : 'algo lento'})`);
  }
  action(a) {
    const G = this.G, st = this.st, v = this.v;
    if (a === 'exit') return this.close();
    if (a === 'rotate') { v.controls.autoRotate = !v.controls.autoRotate; if (!v.controls.autoRotate) v.view('front'); return; }
    if (a === 'fold') { v.toggleFold(); return; }
    if (a === 'repair') { Object.assign(this, { dead: false, cracked: 0, battery: Math.max(this.battery, 20), temp: 28, on: true, screen: 'lock' }); this.log('🛠 Teléfono reparado y como nuevo.'); return; }
    if (this.dead && a !== 'charge') return this.log('💀 El teléfono está muerto. Pulsa 🛠 Reparar.');
    if (a === 'power') { this.on = !this.on; if (this.on) { this.screen = 'lock'; G.sfx.play('boot'); } this.musicOn = false; return; }
    if (a === 'home') { if (this.on) this.goHome(); return; }
    if (a === 'charge') {
      if (this.d.ext.port === 'none' && !this.d.ext.wireless) return this.log('❌ No tiene puerto ni carga inalámbrica. ¿Cómo se carga esto?');
      this.charging = !this.charging; G.sfx.play(this.charging ? 'cash' : 'click');
      this.log(this.charging ? `🔌 Cargando a ${this.hw.chg.watts} W${this.d.ext.wireless && this.d.ext.port === 'none' ? ' (inalámbrica)' : ''}. 0→100% en ${st.chargeMins} min reales del teléfono.` : 'Cargador desconectado.'); if (this.charging) this.task('charge'); return;
    }
    if (a === 'drop') {
      this.drop = { t: 0 }; G.sfx.play('whoosh'); this.task('drop');
      setTimeout(() => { G.sfx.play('bad'); const p = S.clamp(st.scores.durability / 100 + 0.05, 0.05, 0.97); if (Math.random() < p) this.log(`💪 ¡Sobrevivió a la caída! (durabilidad ${Math.round(st.scores.durability)}/100)`); else { this.cracked++; this.log(`💥 ¡Pantalla rota! El ${this.d.ext.frame === 'plastic' ? 'plástico' : 'marco'} no aguantó. Durabilidad ${Math.round(st.scores.durability)}/100.`); if (this.cracked >= 3) { this.dead = true; this.on = false; } } }, 900);
      return;
    }
    if (a === 'water') {
      this.task('water'); G.sfx.play('whoosh');
      if (st.ip) this.log('💧 30 minutos bajo el agua… ¡y funciona perfecto! IP68 ✅');
      else { this.log('💧 Glu glu glu… La pantalla parpadea… ⚡ ¡Se ha muerto! No tenía sellado IP68.'); this.glitch = 1.5; setTimeout(() => { this.dead = true; this.on = false; G.sfx.play('fail'); }, 1500); }
    }
  }
  goHome() { if (this.screen === 'lock') return; this.screen = 'home'; this.game = null; this.call = null; this.appT = 1; }
  tap(x, y) {
    if (!this.on || this.dead) { this.log(this.dead ? '💀 Muerto. Pulsa 🛠 Reparar.' : '⏻ La pantalla está apagada. Pulsa ⏻ Encender.'); return; }
    const W = this.v.osCanvas.width, H = this.v.osCanvas.height, s = W / 360;
    if (this.screen === 'lock') { this.screen = 'home'; this.task('unlock'); this.G.sfx.play('click'); const f = this.d.ext.face !== 'none' ? 'reconocimiento facial' : this.d.ext.fingerprint !== 'none' ? 'huella dactilar' : 'deslizar'; this.log(`🔓 Desbloqueado con ${f}.`); return; }
    if (y > H - 30 * s) return this.goHome(); // barra de gestos
    if (this.screen === 'home') { if (y < 40 * s) { this.screen = 'control'; return; } const app = hitHome(this.os, x, y, W, H); if (app) this.openApp(app); return; }
    if (this.screen === 'control') { this.goHome(); return; }
    const app = this.screen.slice(4);
    if (y < 50 * s && x < 80 * s) return this.goHome(); // botón atrás
    this['tap_' + appKey(app)]?.(x / s, y / s, W / s, H / s);
  }
  // ---------- apps (coordenadas en unidades de 360 de ancho) ----------
  tap_camera(x, y, W, H) { if (Math.hypot(x - W / 2, y - (H - 70)) < 34) { this.flash = 0.25; this.G.sfx.play('click'); this.photos.unshift({ hue: Math.random() * 360, q: this.st.scores.camera }); this.task('photo'); this.log(`📸 Foto hecha con ${this.d.ext.camCount} cámara${this.d.ext.camCount > 1 ? 's' : ''} (${this.hw.cam.name}). Calidad ${Math.round(this.st.scores.camera)}/100.`); this.temp += 0.5; } }
  tap_calc(x, y, W, H) {
    const keys = ['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '0', '.', '='];
    const top = H * 0.38, cw = (W - 30) / 4, ch = (H - top - 30) / 5; const c = Math.floor((x - 15) / cw), r = Math.floor((y - top) / ch); if (c < 0 || c > 3 || r < 0 || r > 4) return;
    const k = keys[r * 4 + c]; const C = this.calc; this.G.sfx.play('click');
    if (/\d/.test(k)) { C.disp = C.fresh || C.disp === '0' ? k : (C.disp + k).slice(0, 12); C.fresh = false; }
    else if (k === '.') { if (!C.disp.includes('.')) C.disp += '.'; C.fresh = false; }
    else if (k === 'C') Object.assign(C, { disp: '0', acc: null, op: null, fresh: true });
    else if (k === '±') C.disp = String(-parseFloat(C.disp)); else if (k === '%') C.disp = String(parseFloat(C.disp) / 100);
    else { const v = parseFloat(C.disp); if (C.op && C.acc != null && !C.fresh) { const a = C.acc; const res = { '+': a + v, '−': a - v, '×': a * v, '÷': v ? a / v : NaN }[C.op]; C.disp = String(+res.toPrecision(10)); this.task('calc'); } C.acc = parseFloat(C.disp); C.op = k === '=' ? null : k; C.fresh = true; }
  }
  tap_phone(x, y, W, H) {
    if (this.call) { if (y > H - 110) { this.call = null; this.G.sfx.play('click'); } return; }
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']; const top = H * 0.36, cw = W / 3, ch = 62;
    const c = Math.floor(x / cw), r = Math.floor((y - top) / ch); if (r >= 0 && r < 4 && c >= 0 && c < 3) { this.dial = (this.dial + keys[r * 3 + c]).slice(0, 12); this.G.sfx.play('test'); return; }
    if (Math.hypot(x - W / 2, y - (top + 4 * ch + 40)) < 34 && this.dial) { this.call = { t: 0 }; this.task('call'); this.G.sfx.play('alert'); this.log(`📞 Llamando a ${this.dial}… calidad de voz: ${this.hw.spk.name}, red ${this.hw.mod.name}.`); }
  }
  tap_music() { this.musicOn = !this.musicOn; if (this.musicOn) { this.task('music'); this.log(`🎵 Sonando por altavoces ${{ mono: 'mono', stereo: 'estéreo', quad: 'cuádruples' }[this.d.ext.speakers]} (${this.hw.spk.name}).`); } }
  tap_games(x, y) { if (!this.game) { this.game = { score: 0, t: 0, x: 180, y: 300, r: 30 }; return; } const g = this.game; if (Math.hypot(x - g.x, y - g.y) < g.r + 10) { g.score++; g.x = 50 + Math.random() * 260; g.y = 140 + Math.random() * 380; this.G.sfx.play('test'); } }
  tap_settings(x, y) { const i = Math.floor((y - 96) / 50); if (i === 3) { this.os.dark = !this.os.dark; this.G.sfx.play('click'); } }
  // ---------- frame ----------
  update(dt) {
    this.t += dt; const st = this.st, v = this.v, cv = v.osCanvas, g = cv.getContext('2d'), W = cv.width, H = cv.height, s = W / 360;
    // simulación física: batería y temperatura
    const app = this.screen.startsWith('app:') ? this.screen.slice(4) : '';
    const load = !this.on ? 0 : app === 'Juegos' && this.game ? 2.6 : app === 'Cámara' ? 1.8 : 1;
    if (this.on && !this.dead) this.battery -= (dt * 100 / (st.hours * 30)) * load;
    if (this.charging) this.battery += dt * 100 / Math.max(4, st.chargeMins / 3);
    this.battery = S.clamp(this.battery, 0, 100); if (this.battery <= 0 && this.on) { this.on = false; this.log('🪫 Sin batería. Pulsa 🔌 Cargar.'); }
    const target = 26 + (load > 0 ? (st.heat - 26) * (load / 2.6) : 0) + (this.charging ? this.hw.chg.heat * 1.5 : 0);
    this.temp += (target - this.temp) * Math.min(1, dt * 0.25);
    if (this.temp > 46 && !this.hot) { this.hot = true; this.log('🥵 ¡El teléfono está ardiendo! Rendimiento reducido. Mejor refrigeración = menos calor.'); this.G.sfx.play('alert'); } if (this.temp < 43) this.hot = false;
    this.fps = Math.round(S.clamp(st.scores.performance * 1.6 * (this.hw.dsp.hz / 60) * 0.8 * (this.temp > 44 ? 0.6 : 1), 5, this.hw.dsp.hz));
    if (this.game) { this.gameTime += dt; if (this.gameTime > 15) this.task('game'); }
    if (this.loading > 0) { this.loading -= dt; if (this.loading <= 0) { this.screen = 'app:' + this.pending; this.appT = 0; this.log(`📲 ${this.pending} abierta.`); } }
    if (this.musicOn && Math.floor(this.t * 4) !== this._beat) { this._beat = Math.floor(this.t * 4); const n = [523, 659, 784, 659, 587, 698, 880, 698][this._beat % 8]; const sfx = this.G.sfx; if (sfx.ctx) sfx.tone(n, sfx.ctx.currentTime, 0.22, 0.03 + this.hw.spk.q / 1500, 'triangle'); }
    if (this.call) this.call.t += dt;
    // caída animada
    if (this.drop) { this.drop.t += dt; const t = this.drop.t; const p = v.phone; if (t < 0.6) { p.position.y = -t * t * 30; p.rotation.z = t * 4; } else if (t < 1.4) { const k = (t - 0.6) / 0.8; p.position.y = -10.8 + Math.abs(Math.sin(k * Math.PI * 2)) * 3 * (1 - k); p.rotation.z = 2.4 + k * 2; } else { p.position.set(0, 0, 0); p.rotation.set(0, 0, 0); this.drop = null; } }
    // meters
    const bt = document.getElementById('mBat'); if (bt) { bt.textContent = `${Math.round(this.battery)}%${this.charging ? ' ⚡' : ''}`; bt.style.color = this.battery < 20 ? '#ff6b8b' : ''; document.getElementById('mTmp').textContent = `${this.temp.toFixed(1)} °C`; document.getElementById('mTmp').style.color = this.temp > 44 ? '#ff6b8b' : ''; document.getElementById('mFps').textContent = `${this.fps} FPS`; }
    // ---------- dibujar pantalla ----------
    const now = new Date(); const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (!this.on || this.dead) { g.fillStyle = '#030305'; g.fillRect(0, 0, W, H); if (this.charging && !this.dead) { g.fillStyle = '#06d6a0'; g.font = `700 ${40 * s}px system-ui`; g.textAlign = 'center'; g.fillText(`⚡ ${Math.round(this.battery)}%`, W / 2, H / 2); } }
    else if (this.screen === 'lock' || this.screen === 'home' || this.screen === 'control') renderOS(cv, this.os, this.screen, { t: this.t, time, cut: this.d.ext.shape, company: this.G.s.company.name });
    else if (this.screen === 'app:Ajustes') renderOS(cv, this.os, 'settings', { t: this.t, time, cut: this.d.ext.shape });
    else this.drawApp(g, W, H, s, app, time);
    if (this.on && !this.dead && this.loading > 0) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, W, H); g.strokeStyle = '#fff'; g.lineWidth = 5 * s; g.beginPath(); g.arc(W / 2, H / 2, 24 * s, this.t * 6, this.t * 6 + 4); g.stroke(); }
    if (this.on && this.battery < 15) { g.fillStyle = 'rgba(255,61,113,0.9)'; g.font = `700 ${13 * s}px system-ui`; g.textAlign = 'center'; g.fillText('🪫 Batería baja', W / 2, 50 * s); }
    if (this.flash > 0) { this.flash -= dt; g.fillStyle = `rgba(255,255,255,${this.flash * 4})`; g.fillRect(0, 0, W, H); }
    if (this.glitch > 0) { this.glitch -= dt; for (let i = 0; i < 12; i++) { g.fillStyle = `hsla(${Math.random() * 360},100%,50%,0.6)`; g.fillRect(0, Math.random() * H, W, Math.random() * 30 * s); } }
    if (this.cracked) { g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5 * s; const rnd = mulberry(7 + this.cracked); for (let c = 0; c < this.cracked; c++) { const cx = W * (0.3 + rnd() * 0.4), cy = H * (0.3 + rnd() * 0.4); for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(cx, cy); let x = cx, y = cy; const a = rnd() * 6.28; for (let k = 0; k < 4; k++) { x += Math.cos(a + (rnd() - 0.5)) * 60 * s; y += Math.sin(a + (rnd() - 0.5)) * 60 * s; g.lineTo(x, y); } g.stroke(); } } }
    if (this.on && this.temp > 46) { g.fillStyle = 'rgba(255,90,0,0.18)'; g.fillRect(0, 0, W, H); }
    v.osTex.needsUpdate = true;
  }
  drawApp(g, W, H, s, app, time) {
    const dark = this.os.dark, bg = dark ? '#111318' : '#f4f4f8', fg = dark ? '#fff' : '#111';
    this.appT = Math.min(1, this.appT + 1 / 60 / Math.max(0.01, ANIM_DUR[this.os.animations])); const k = ANIM_EASE[this.os.animations](this.appT);
    g.save(); g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.translate(W / 2, H / 2); g.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); g.translate(-W / 2, -H / 2); g.globalAlpha = Math.min(1, k * 1.5);
    g.fillStyle = bg; g.fillRect(0, 0, W, H); g.fillStyle = fg; g.font = `600 ${14 * s}px system-ui`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('‹ Inicio', 14 * s, 26 * s); g.textAlign = 'right'; g.fillText(`${time}  ${Math.round(this.battery)}%`, W - 14 * s, 26 * s);
    g.textAlign = 'left'; g.font = `800 ${26 * s}px system-ui`; g.fillText(app, 18 * s, 72 * s);
    const S2 = (v) => v * s; const key = appKey(app);
    if (key === 'camera') {
      const t = this.t; const gr = g.createLinearGradient(0, S2(90), 0, H - S2(130)); gr.addColorStop(0, '#87ceeb'); gr.addColorStop(1, '#3a7d44'); g.fillStyle = gr; g.fillRect(0, S2(90), W, H - S2(220));
      g.fillStyle = '#fff6a8'; g.beginPath(); g.arc(W * 0.75 + Math.sin(t) * 10, S2(150), S2(26), 0, 7); g.fill(); g.fillStyle = '#2d6a4f'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(i * W / 4 - S2(40), H - S2(130)); g.lineTo(i * W / 4 + S2(10), H - S2(260) - (i % 2) * S2(40)); g.lineTo(i * W / 4 + S2(60), H - S2(130)); g.fill(); }
      const blur = Math.max(0, (60 - this.st.scores.camera) / 12); if (blur > 0.5) { g.fillStyle = `rgba(128,128,128,${Math.min(0.5, blur / 10)})`; for (let i = 0; i < 200 * blur; i++) g.fillRect(Math.random() * W, S2(90) + Math.random() * (H - S2(220)), S2(2), S2(2)); }
      g.fillStyle = '#000'; g.fillRect(0, H - S2(130), W, S2(130)); g.strokeStyle = '#fff'; g.lineWidth = S2(4); g.beginPath(); g.arc(W / 2, H - S2(70), S2(30), 0, 7); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(W / 2, H - S2(70), S2(24), 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = `600 ${12 * s}px system-ui`; g.textAlign = 'center'; g.fillText(`${this.hw.cam.name} · ${this.d.ext.camCount} lentes · ${this.photos.length} fotos`, W / 2, H - S2(118));
      if (this.photos[0]) { g.fillStyle = `hsl(${this.photos[0].hue},60%,55%)`; g.fillRect(S2(30), H - S2(92), S2(44), S2(44)); }
    } else if (key === 'gallery') {
      if (!this.photos.length) { g.font = `${15 * s}px system-ui`; g.fillStyle = '#888'; g.fillText('Aún no hay fotos. Abre la Cámara.', 18 * s, 120 * s); }
      this.photos.slice(0, 24).forEach((p, i) => { const c = i % 3, r = Math.floor(i / 3), sz = (W - S2(40)) / 3; const x = S2(14) + c * (sz + S2(6)), y = S2(100) + r * (sz + S2(6)); const gr = g.createLinearGradient(x, y, x, y + sz); gr.addColorStop(0, `hsl(${p.hue},70%,70%)`); gr.addColorStop(1, `hsl(${p.hue + 60},50%,35%)`); g.fillStyle = gr; g.fillRect(x, y, sz, sz); if (p.q < 40) { g.fillStyle = 'rgba(128,128,128,0.35)'; g.fillRect(x, y, sz, sz); } });
    } else if (key === 'calc') {
      g.textAlign = 'right'; g.font = `300 ${58 * s}px system-ui`; g.fillText(this.calc.disp.length > 9 ? (+this.calc.disp).toExponential(4) : this.calc.disp, W - S2(20), H * 0.3);
      const keys = ['C', '±', '%', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '', '.', '=']; const top = H * 0.38, cw = (W - S2(30)) / 4, ch = (H - top - S2(30)) / 5;
      keys.forEach((kk, i) => { if (!kk && i === 17) return; const c = i % 4, r = Math.floor(i / 4); const w = kk === '0' ? cw * 2 : cw; const x = S2(15) + c * cw, y = top + r * ch; g.fillStyle = c === 3 ? this.os.accent : r === 0 ? (dark ? '#555' : '#ccc') : dark ? '#2a2d36' : '#e2e2e8'; rr(g, x + S2(4), y + S2(4), w - S2(8), ch - S2(8), ch / 2); g.fill(); g.fillStyle = c === 3 ? '#fff' : fg; g.font = `500 ${26 * s}px system-ui`; g.textAlign = 'center'; g.fillText(kk, x + w / 2, y + ch / 2); });
    } else if (key === 'phone') {
      if (this.call) { g.textAlign = 'center'; g.font = `700 ${30 * s}px system-ui`; g.fillText(this.dial, W / 2, H * 0.3); g.font = `${16 * s}px system-ui`; const t = this.call.t; g.fillText(t < 2.5 ? 'Llamando' + '.'.repeat(1 + Math.floor(t * 2) % 3) : `En llamada · ${Math.floor(t - 2.5)} s · 📶 ${this.hw.mod.name}`, W / 2, H * 0.36); g.fillStyle = '#ff3b30'; g.beginPath(); g.arc(W / 2, H - S2(70), S2(32), 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = `${26 * s}px sans-serif`; g.fillText('📞', W / 2, H - S2(70)); }
      else { g.textAlign = 'center'; g.font = `600 ${32 * s}px system-ui`; g.fillText(this.dial || 'Marca un número', W / 2, H * 0.27); const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#']; const top = H * 0.36, cw = W / 3, ch = S2(62); keys.forEach((kk, i) => { const x = (i % 3) * cw + cw / 2, y = top + Math.floor(i / 3) * ch + ch / 2; g.fillStyle = dark ? '#2a2d36' : '#e2e2e8'; g.beginPath(); g.arc(x, y, S2(26), 0, 7); g.fill(); g.fillStyle = fg; g.font = `500 ${24 * s}px system-ui`; g.fillText(kk, x, y); }); g.fillStyle = '#34c759'; g.beginPath(); g.arc(W / 2, top + 4 * ch + S2(40), S2(30), 0, 7); g.fill(); g.font = `${24 * s}px sans-serif`; g.fillText('📞', W / 2, top + 4 * ch + S2(40)); }
    } else if (key === 'music') {
      g.fillStyle = this.os.accent; rr(g, W * 0.15, S2(110), W * 0.7, W * 0.7, S2(24)); g.fill(); g.font = `${90 * s}px sans-serif`; g.textAlign = 'center'; g.fillText('🎵', W / 2, S2(110) + W * 0.35);
      g.fillStyle = fg; g.font = `700 ${18 * s}px system-ui`; g.fillText('Canción del Garaje', W / 2, S2(130) + W * 0.75); g.font = `${13 * s}px system-ui`; g.fillStyle = '#888'; g.fillText(`${this.G.s.company.name} Records`, W / 2, S2(150) + W * 0.75);
      if (this.musicOn) for (let i = 0; i < 16; i++) { const h2 = S2(10) + Math.abs(Math.sin(this.t * 6 + i)) * S2(40) * (this.hw.spk.q / 100 + 0.3); g.fillStyle = this.os.accent; g.fillRect(W * 0.15 + i * W * 0.044, S2(230) + W * 0.75 - h2, W * 0.03, h2); }
      g.fillStyle = fg; g.font = `${44 * s}px sans-serif`; g.fillText(this.musicOn ? '⏸' : '▶️', W / 2, H - S2(90));
    } else if (key === 'games') {
      if (!this.game) { g.textAlign = 'center'; g.font = `800 ${26 * s}px system-ui`; g.fillText('TOCA EL PUNTO', W / 2, H * 0.4); g.font = `${15 * s}px system-ui`; g.fillText('Toca para empezar', W / 2, H * 0.46); }
      else { const gm = this.game; const jit = this.fps < 25 ? (Math.random() - 0.5) * 20 : 0; g.fillStyle = '#ff3d71'; g.beginPath(); g.arc(S2(gm.x + jit), S2(gm.y), S2(gm.r), 0, 7); g.fill(); g.fillStyle = fg; g.textAlign = 'left'; g.font = `700 ${16 * s}px system-ui`; g.fillText(`Puntos: ${gm.score}   ${this.fps} FPS   ${this.temp.toFixed(0)}°C`, S2(18), S2(105)); if (this.fps < 25) { g.fillStyle = '#ff6b8b'; g.fillText('⚠️ ¡Lag! El procesador no da más', S2(18), S2(128)); } }
    } else if (key === 'clock') {
      g.textAlign = 'center'; g.font = `200 ${80 * s}px system-ui`; g.fillText(time, W / 2, H * 0.35); const cx = W / 2, cy = H * 0.62, R = W * 0.3; g.strokeStyle = fg; g.lineWidth = S2(3); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
      const now = new Date(); const sec = now.getSeconds() + now.getMilliseconds() / 1000; for (const [ang, len, w] of [[(now.getHours() % 12 + now.getMinutes() / 60) / 12, 0.5, 5], [now.getMinutes() / 60, 0.75, 3], [sec / 60, 0.9, 1.5]]) { g.lineWidth = S2(w); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(ang * 6.283) * R * len, cy - Math.cos(ang * 6.283) * R * len); g.stroke(); }
    } else if (key === 'notes') {
      g.fillStyle = dark ? '#2a2618' : '#fff8c4'; g.fillRect(S2(14), S2(95), W - S2(28), H - S2(140)); g.fillStyle = dark ? '#ffe08a' : '#333'; g.font = `${15 * s}px "Comic Sans MS", system-ui`; this.notes.split('\n').forEach((l, i) => g.fillText(l, S2(26), S2(125) + i * S2(24)));
      g.fillText(`- Batería de ${this.st.mAh} mAh, temp. ${this.st.heat} °C`, S2(26), S2(173)); g.fillText(`- Puntuación actual: ${this.st.overall}/100`, S2(26), S2(197));
    } else if (key === 'browser') {
      const t = (this.t * 1000) % 4000 / 1000; const speed = this.hw.mod.q; const prog = Math.min(1, t * speed / 60); g.fillStyle = dark ? '#2a2d36' : '#e2e2e8'; rr(g, S2(14), S2(92), W - S2(28), S2(34), S2(17)); g.fill(); g.fillStyle = '#888'; g.font = `${13 * s}px system-ui`; g.fillText('🔒 noticias-del-movil.es', S2(30), S2(109)); g.fillStyle = this.os.accent; g.fillRect(S2(14), S2(130), (W - S2(28)) * prog, S2(3));
      if (prog > 0.3) { g.fillStyle = fg; g.font = `800 ${20 * s}px system-ui`; g.fillText(`${this.G.s.company.name} presenta`, S2(18), S2(165)); g.fillText(`el ${this.d.name}`, S2(18), S2(190)); } if (prog > 0.6) { g.fillStyle = '#888'; for (let i = 0; i < 8; i++) g.fillRect(S2(18), S2(215) + i * S2(18), W - S2(36) - (i % 3) * S2(40), S2(9)); } g.fillStyle = '#888'; g.fillText(`Velocidad de carga según el módem (${this.hw.mod.name})`, S2(18), H - S2(40));
    } else if (key === 'messages') {
      const msgs = [['¿Ya tienes el móvil nuevo?', 0], [`¡Sí! Es el ${this.d.name} 😎`, 1], ['¿Qué tal la batería?', 0], [`${this.st.hours} horas de uso. ${this.st.hours > 12 ? '¡Una pasada!' : 'Meh…'}`, 1], ['¿Y la cámara?', 0], [this.st.scores.camera > 60 ? '¡Hace fotos increíbles!' : 'Mejor no preguntes 🥔', 1]];
      msgs.forEach(([t, me], i) => { const y = S2(100) + i * S2(50); g.font = `${14 * s}px system-ui`; const w = g.measureText(t).width + S2(24); g.fillStyle = me ? this.os.accent : dark ? '#2a2d36' : '#e2e2e8'; rr(g, me ? W - w - S2(14) : S2(14), y, w, S2(38), S2(16)); g.fill(); g.fillStyle = me ? '#fff' : fg; g.fillText(t, (me ? W - w - S2(14) : S2(14)) + S2(12), y + S2(19)); });
    } else {
      drawIcon(g, W / 2 - S2(50), H * 0.3, S2(100), this.os, app, 3); g.fillStyle = '#888'; g.font = `${15 * s}px system-ui`; g.textAlign = 'center'; g.fillText('Esta app funciona correctamente ✅', W / 2, H * 0.55);
    }
    g.restore();
    // barra de gestos
    g.fillStyle = dark || app === 'Cámara' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.5)'; rr(g, W / 2 - S2(60), H - S2(12), S2(120), S2(5), S2(3)); g.fill();
  }
}
const KEYMAP = { 'Cámara': 'camera', 'Galería': 'gallery', 'Calculadora': 'calc', 'Teléfono': 'phone', 'Música': 'music', 'Juegos': 'games', 'Reloj': 'clock', 'Notas': 'notes', 'Navegador': 'browser', 'Mensajes': 'messages', 'Ajustes': 'settings' };
function appKey(name) { return KEYMAP[name] || 'other'; }
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
