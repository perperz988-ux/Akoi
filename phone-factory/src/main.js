// PHONE FACTORY — game controller: title screen, time loop, saving, popups, cinematics.
import * as S from './sim.js';
import { UI, applyPreset } from './ui.js';
import { Cinema } from './cine.js';
import { Sfx } from './audio.js';
import { Viewer } from './phone3d.js';
import { drawLogo } from './os.js';
import { MISSIONS } from './sim.js';

const KEY = (i) => `pf_slot_${i}`;
class Game {
  constructor() { this.s = null; this.speed = 1; this.paused = false; this.dayLen = 1.5; this.modalOpen = false; this.sfx = new Sfx(); this.ui = new UI(this); this.cinema = new Cinema(this); this.t = 0; addEventListener('pointerdown', () => this.sfx.init(), { once: false }); }
  // ---------- title ----------
  title() {
    const el = document.getElementById('title'); el.classList.add('on');
    const sb = !!localStorage.getItem('pf_sandbox'); const auto = this.slotInfo(0);
    el.innerHTML = `<div class="tview" id="tview"></div><div class="tmenu"><div class="tlogo">PHONE<span>FACTORY</span></div><p class="tsub">Design it. Build it. Sell it. Rule the world.</p>
      ${auto ? `<button class="pri" data-t="cont">▶ Continue <small>${auto.name} · ${S.dateOf(auto.day)}</small></button>` : ''}
      <button data-t="new" class="${auto ? '' : 'pri'}">✦ New campaign</button><button data-t="load">📂 Load game</button>
      <button data-t="sandbox" class="${sb ? '' : 'lockd'}">${sb ? '🏖️' : '🔒'} Sandbox mode ${sb ? '' : '<small>finish the campaign</small>'}</button></div>`;
    const v = new Viewer(document.getElementById('tview'), { autoRotate: true }); const s0 = S.newState('Phone Factory'); const d = S.defaultDesign(1, 'Ω Infinity'); applyPreset(d, 'Futuristic'); d.ext.color = '#ff3d71'; d.ext.frameColor = '#ffd6e0'; Object.assign(d.ext, { camCount: 4, camLayout: 'square', back: 'gloss' });
    s0.os.wallpaper = 'aurora'; v.screen = 'home'; v.setDesign(d, s0.os, 'Phone Factory', (cv) => drawLogo(cv, { shape: 'circle', bg: '#ff3d71', fg: '#fff', glyph: 'P', font: 'bold' })); v.view('back34'); v.start(); this.titleViewer = v;
    el.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
      this.sfx.init(); this.sfx.play('click'); const t = b.dataset.t;
      if (t === 'cont') return this.load(0);
      if (t === 'load') return this.loadMenu();
      if (t === 'sandbox') { if (!sb) return this.ui.toast('🔒 Complete all 7 campaign missions to unlock Sandbox mode', 'bad'); return this.start(S.newState('Sandbox Labs', 'sandbox')); }
      if (t === 'new') this.ui.modal(`<h2>Found your company</h2><p>Every giant started in a garage.</p><input id="nc" maxlength="24" placeholder="Company name" value="Garage Mobile">`, [['Start', (m) => this.start(S.newState(m.querySelector('#nc').value.trim() || 'Garage Mobile'))], ['Cancel', null]]);
    }));
  }
  loadMenu() { const rows = [0, 1, 2, 3].map((i) => { const f = this.slotInfo(i); return f ? [`${i ? 'Slot ' + i : 'Autosave'}: ${f.name} · ${S.dateOf(f.day)}`, () => this.load(i)] : null; }).filter(Boolean); if (!rows.length) return this.ui.toast('No saved games yet'); this.ui.modal('<h2>Load game</h2>', rows.concat([['Cancel', null]])); }
  start(s) {
    this.s = s; document.getElementById('title').classList.remove('on'); document.getElementById('title').innerHTML = ''; if (this.titleViewer) { this.titleViewer.stop(); this.titleViewer.renderer.dispose(); this.titleViewer = null; }
    this.ui.shell(); this.ui.go('hq'); this.paused = false; this.speed = 1;
    if (!s.flags.intro) { s.flags.intro = true; this.ui.modal(`<h2>📱 Welcome to ${s.company.name}!</h2><p>${S.sandbox(s) ? 'Sandbox mode: unlimited money and every technology. Go wild.' : `You have <b>${S.fmtMoney(s.money)}</b>, a garage, two workers and a dream.</p><p><b>Mission 1 — FIRST PHONE:</b> open <b>Design</b>, customize your phone and build a prototype.`}</p>`, [['Let\'s build!', () => this.ui.go(S.sandbox(s) ? 'design' : 'hq')]]); }
    if (!this.looping) { this.looping = true; let last = performance.now(); const loop = (now) => { requestAnimationFrame(loop); const dt = Math.min(0.1, (now - last) / 1000); last = now; this.frame(dt); }; requestAnimationFrame(loop); }
    window.__pf = this;
  }
  setSpeed(v) { if (v === 0) this.paused = true; else { this.paused = false; this.speed = v; } this.ui.header(); }
  frame(dt) {
    const s = this.s; if (!s) return; this.t += dt;
    const blocked = this.modalOpen || this.cinema.active;
    if (!this.paused && !blocked) { const moved = S.tick(s, (dt * this.speed) / this.dayLen); if (this.ui.fview && this.ui.screen === 'factory') this.ui.fview.feed(moved); this.post(); }
    if (this.ui.fview && this.ui.screen === 'factory' && document.getElementById('fcanvas')) this.ui.fview.draw(blocked ? 0 : dt);
    this.liveT = (this.liveT || 0) - dt; if (this.liveT < 0) { this.liveT = 0.4; this.ui.header(); this.ui.live(); }
    this.autoT = (this.autoT || 0) + dt; if (this.autoT > 45) { this.autoT = 0; this.save(0); }
  }
  // react to things the simulation produced
  post() {
    const s = this.s;
    if (s._newNews) { for (const n of s._newNews) if (n.kind === 'good' || n.kind === 'bad') this.ui.toast(`${n.icon} ${n.text}`, n.kind); s._newNews = null; }
    if (s._researchDone) { this.sfx.play('research'); s._researchDone = null; }
    if (s.cineQueue.length) { const q = s.cineQueue.splice(0); for (const c of q) this.cinema.push(c); if (q.some((c) => c.name === 'campaign')) localStorage.setItem('pf_sandbox', '1'); }
    if (s._event && !this.cinema.active) { const e = s._event; s._event = null; this.sfx.play('alert'); this.ui.modal(`<div class="evi">${e.icon}</div><h2>${e.title}</h2><p>${e.text}</p>`, [['OK', null]], 'event'); }
    if (s._mission && !this.cinema.active && !this.modalOpen) { const m = s._mission; s._mission = null; this.sfx.play('good'); const next = S.currentMission(s); this.ui.modal(`<div class="evi">✅</div><h2>MISSION COMPLETE: ${m.title}</h2><p>Reward: <b>${S.fmtMoney(m.reward)}</b></p>${next ? `<hr><p><b>Next — ${next.title}:</b> ${next.desc}</p><p class="hint">💡 ${next.hint}</p>` : '<p>🏆 You finished the campaign! Sandbox mode is now unlocked on the title screen.</p>'}`, [['Continue', null]], 'event'); this.save(0); }
  }
  afterAction() { this.post(); this.ui.header(); this.ui.live(); }
  onCineEnd() { this.post(); }
  // ---------- save ----------
  serialize() { const s = this.s; const o = Object.assign({}, s, { money: isFinite(s.money) ? s.money : 0, _newNews: null, _event: null, _mission: null }); return JSON.stringify(o); }
  save(i) { if (!this.s) return; try { localStorage.setItem(KEY(i), this.serialize()); } catch (e) { this.ui.toast('⚠️ Could not save: ' + e.message, 'bad'); } }
  slotInfo(i) { try { const raw = localStorage.getItem(KEY(i)); if (!raw) return null; const o = JSON.parse(raw); return { name: o.company.name, day: o.day, money: o.mode === 'sandbox' ? Infinity : o.money }; } catch { return null; } }
  load(i) { try { const o = JSON.parse(localStorage.getItem(KEY(i))); if (!o) return; if (o.mode === 'sandbox') o.money = Infinity; o.cineQueue = []; this.start(o); this.ui.toast('📂 Game loaded', 'good'); } catch (e) { this.ui.toast('⚠️ Save is corrupted', 'bad'); } }
}
const G = new Game(); G.title(); window.__S = S; window.__G = G;
addEventListener('beforeunload', () => G.s && G.save(0));
