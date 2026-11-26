// HUD, dialogue, menus, cutscene overlays, touch controls.
import * as THREE from 'three';
import { ITEMS, SPEAKERS, MISSIONS, ENDINGS } from './story.js';
import { BOUNDS, LOCATIONS } from './world.js';
import { fmtTime, clamp } from './rng.js';
import * as Save from './save.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export class UI {
  constructor(G) {
    this.G = G; const root = (this.root = document.getElementById('ui'));
    root.innerHTML = `
    <div id="hud" class="hidden">
      <div id="obj"><div class="m"></div><div class="s"></div><div class="d"></div></div>
      <div id="tr"><div id="clock"></div><div id="money"></div><canvas id="mini" width="180" height="180"></canvas></div>
      <div id="cross"></div><div id="prompt"></div><svg id="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16"/></svg>
      <div id="wp"><div class="dia"></div><span></span></div>
      <div id="tags"></div>
      <div id="toasts"></div>
      <div id="hotbar"><button data-a="phone">📱<small>P</small></button><button data-a="inv">🎒<small>I</small></button><button data-a="light">🔦<small>F</small></button></div>
      <div id="savei">💾</div>
      <div id="energy"></div>
    </div>
    <div id="modeov"></div>
    <div id="banner"><div class="a"></div><div class="b"></div></div>
    <div id="area"></div>
    <div id="notif"></div>
    <div id="sub"></div>
    <div id="lb1" class="lb"></div><div id="lb2" class="lb"></div><button id="skip">SKIP ⏭</button>
    <div id="cctv"><div class="ts"></div><div class="rec">● REC CAM-03</div></div>
    <div id="big"><div class="t"></div><div class="s"></div></div>
    <div id="fade"></div>
    <div id="dlg" class="hidden"><div class="who"></div><div class="txt"></div><div class="ch"></div><div class="more">▼</div></div>
    <div id="panel" class="hidden"></div>
    <div id="phone" class="hidden"></div>
    <div id="touch" class="hidden"><div id="joy"><div></div></div>
      <button class="tb" id="tAct" data-a="act">✋</button><button class="tb" id="tJump" data-a="jump">⤒</button><button class="tb" id="tRun" data-a="sprint">🏃</button>
      <button class="tb" id="tPhone" data-a="phone">📱</button><button class="tb" id="tPause" data-a="back">⏸</button></div>
    <div id="screen"></div>`;
    this.$ = (s) => root.querySelector(s);
    this.mini = this.$('#mini').getContext('2d');
    this.toastQ = []; this.camZoom = 1; this.tagEls = {};
    // hotbar / touch buttons
    root.querySelectorAll('#hotbar button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); G.input.tap(b.dataset.a); }));
    root.querySelectorAll('#touch .tb').forEach((b) => G.input.bindButton(b, b.dataset.a, true));
    G.input.onJoy = (j) => { const el = this.$('#joy'); if (!j) { el.style.display = 'none'; return; } el.style.display = 'block'; el.style.left = j.ox - 60 + 'px'; el.style.top = j.oy - 60 + 'px'; const dx = clamp(j.x - j.ox, -50, 50), dy = clamp(j.y - j.oy, -50, 50); el.firstChild.style.transform = `translate(${dx}px,${dy}px)`; };
    G.canvas.addEventListener('click', () => { G.audio.init(); G.pointerLock(); });
    this.$('#skip').addEventListener('click', () => this.onSkip && this.onSkip());
    document.addEventListener('keydown', (e) => this.key(e));
    this.$('#dlg').addEventListener('click', () => this.advance());
  }
  key(e) {
    if (this.dlg) {
      if (['Enter', 'Space', 'KeyE'].includes(e.code)) { e.preventDefault(); this.advance(); }
      const n = +e.key; if (n >= 1 && n <= 9 && this.dlg.choiceEls) { const b = this.dlg.choiceEls[n - 1]; b && b.click(); }
      return;
    }
    if (this.keyHandler) this.keyHandler(e);
    if (this.G.cine.active && (e.code === 'Escape' || e.code === 'Enter') && this.onSkip) { this.skipHold = (this.skipHold || 0) + 1; if (this.skipHold >= 1) this.onSkip(); }
  }
  // ---------- boot / title ----------
  loading(p) {
    let s = this.$('#screen'); if (!this._ld) { s.innerHTML = `<div class="load"><div class="logo">TRASH<span>TO</span>PS5</div><div class="bar"><i></i></div><div class="tip">Loading junk…</div></div>`; this._ld = true; s.classList.add('on'); }
    s.querySelector('.bar i').style.width = Math.round(p * 100) + '%';
    s.querySelector('.tip').textContent = ['Loading junk…', 'Spawning garbage…', 'Teaching foxes to steal…', 'Hiding the PS5…', 'Almost there bro…'][Math.min(4, Math.floor(p * 5))];
  }
  title() {
    const s = this.$('#screen'); s.classList.add('on'); const auto = Save.info(0); const ends = Save.endings();
    s.innerHTML = `<div class="title">
      <div class="logo big">TRASH<span>TO</span>PS5</div><div class="tag">a first-person junkyard adventure</div>
      <div class="menu">
        ${auto ? `<button data-x="cont">▶ CONTINUE <small>Mission ${auto.m + 1} · Day ${auto.day}</small></button>` : ''}
        <button data-x="new">✦ NEW GAME</button><button data-x="load">📂 LOAD</button><button data-x="set">⚙ SETTINGS</button><button data-x="cred">★ CREDITS</button>
      </div>
      <div class="ends">ENDINGS FOUND: ${ends.length}/5 ${['perfect', 'keep', 'tyler', 'sell', 'squad'].map((e) => `<span class="${ends.includes(e) ? 'got' : ''}">${ends.includes(e) ? ENDINGS[e].title : '???'}</span>`).join('')}</div>
      <div class="hint">WASD move · Mouse look · E interact · P phone · I bag · F flashlight · Shift sprint · Space jump</div></div>`;
    s.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      this.G.audio.init(); this.G.sfx('click'); const x = b.dataset.x;
      if (x === 'new') { if (!auto) return this.G.newGame(); this.panel(`<h2>New game?</h2><p>Your autosave will be overwritten once you start playing.</p><div class="list"><button data-y="1">✦ Start new game</button></div><button class="close">Cancel</button>`, (p) => p.querySelector('[data-y]').addEventListener('click', () => { this.closePanel(); this.G.newGame(); })); }
      if (x === 'cont') this.G.continueGame(0);
      if (x === 'load') this.slots(true);
      if (x === 'set') this.settingsPanel();
      if (x === 'cred') this.credits();
    }));
  }
  hideTitle() { const s = this.$('#screen'); s.classList.remove('on'); s.innerHTML = ''; }
  slots(fromTitle) {
    const rows = [0, 1, 2, 3].map((i) => { const f = Save.info(i); return `<button data-s="${i}" ${f ? '' : 'disabled'}>${i === 0 ? 'AUTOSAVE' : 'SLOT ' + i} — ${f ? `Mission ${f.m + 1} · Day ${f.day} · ${fmtTime(f.time)}` : 'empty'}</button>`; }).join('');
    this.panel(`<h2>Load game</h2><div class="list">${rows}</div><button class="close">Back</button>`, (p) => p.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { this.closePanel(); this.G.continueGame(+b.dataset.s); })));
  }
  credits() {
    this.panel(`<h2>Credits</h2><div class="cred">
      <p><b>TRASH TO PS5</b> — game design, code, story, procedural audio & world: made for this project.</p>
      <p><b>3D models (CC0 / public domain)</b> via <i>pmndrs market</i> & Kenney Starter Kits:<br>Characters, cars, houses, junk props, bench, trees — <b>Kenney</b> (kenney.nl)<br>Sci-fi crate, low-poly tree, bench — <b>Sara Vieira</b><br>Old Citroën van — <b>Creative Trio</b><br>Dog "Dogue" — <b>Reuben Sotomayor & Alejandro León</b><br>Controller & headphones — <b>Lightbringer3D</b> & community (CC0)<br>BOLT-9000 robot ("RobotExpressive") — <b>Tomás Laulhé</b> (CC0)</p>
      <p><b>Bandit the fox</b> — Fox model by <b>PixelMannen</b> (CC0), rigging & animation by <b>@tomkranis</b> (CC-BY 4.0), via Khronos glTF Sample Assets.</p>
      <p>Engine: three.js (MIT). The console in this game is a fictional design.</p></div><button class="close">Back</button>`);
  }
  // ---------- generic panel ----------
  panel(html, bind, onClose) {
    const p = this.$('#panel'); p.innerHTML = `<div class="box">${html}</div>`; p.classList.remove('hidden'); document.exitPointerLock?.();
    p.querySelectorAll('.close').forEach((b) => b.addEventListener('click', () => this.closePanel()));
    this.panelClose = onClose; this.G.modal = this.G.modal || 'panel'; if (this.G.state !== 'play') this.G.modal = this.G.modal === 'panel' ? null : this.G.modal; bind && bind(p.querySelector('.box'));
  }
  closePanel() { const p = this.$('#panel'); if (p.classList.contains('hidden')) return; p.classList.add('hidden'); p.innerHTML = ''; if (this.G.modal === 'panel') this.G.modal = null; const c = this.panelClose; this.panelClose = null; c && c(); this.keyHandler = null; }
  back() {
    if (this.dlg) return;
    if (!this.$('#phone').classList.contains('hidden')) return this.G.phone.back();
    this.closePanel();
  }
  pause() {
    this.G.modal = 'panel';
    this.panel(`<h2>Paused</h2><div class="list"><button data-p="res">▶ Resume</button><button data-p="save">💾 Save (slot 1)</button><button data-p="load">📂 Load</button><button data-p="set">⚙ Settings</button><button data-p="quit">⏏ Quit to title</button></div>`, (p) => p.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
      const x = b.dataset.p; if (x === 'res') this.closePanel(); if (x === 'save') { Save.save(this.G, 1); this.toast('💾 Saved to slot 1'); this.closePanel(); }
      if (x === 'load') this.slots(); if (x === 'set') this.settingsPanel(); if (x === 'quit') { this.G.autosave(); location.reload(); }
    })));
  }
  settingsPanel() {
    const S = this.G.settings;
    const sl = (k, label, min, max, st) => `<label>${label}<input type="range" data-k="${k}" min="${min}" max="${max}" step="${st}" value="${S[k]}"></label>`;
    this.panel(`<h2>Settings</h2><div class="set">${sl('master', 'Master volume', 0, 1, 0.05)}${sl('music', 'Music', 0, 1, 0.05)}${sl('sfx', 'Sound effects', 0, 1, 0.05)}${sl('sens', 'Look sensitivity', 0.3, 2.5, 0.1)}${sl('fov', 'Field of view', 60, 100, 1)}
      <label>Graphics<select data-k="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label><input type="checkbox" data-k="invert" ${S.invert ? 'checked' : ''}> Invert look Y</label><label><input type="checkbox" data-k="bob" ${S.bob ? 'checked' : ''}> Head bob</label></div><button class="close">Done</button>`, (p) => {
      p.querySelector('select').value = S.quality;
      p.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('input', () => { const k = el.dataset.k; S[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : +el.value; this.G.applyQuality(); Save.saveSettings(S); }));
    });
  }
  // ---------- HUD ----------
  showHud(on) { this.$('#hud').classList.toggle('hidden', !on); this.$('#touch').classList.toggle('hidden', !on || !this.G.input.touchMode); if (on) this.objective(); }
  objective() {
    const G = this.G, st = G.story; if (!st) return; const o = this.$('#obj');
    if (G.flags.ended) { o.querySelector('.m').textContent = 'FREE ROAM'; o.querySelector('.s').textContent = 'You found the PS5. Explore, collect rare objects, find all 5 endings.'; return; }
    const M = MISSIONS[st.m]; if (!M) return;
    o.querySelector('.m').textContent = `MISSION ${st.m + 1} — ${M.title}`; o.querySelector('.s').textContent = st.pending ? 'Mission complete!' : st.text();
    o.classList.remove('pulse'); void o.offsetWidth; o.classList.add('pulse');
  }
  prompt(label, kind) {
    const p = this.$('#prompt');
    if (!label) { if (p.textContent) p.textContent = ''; p.classList.remove('on'); this.$('#cross').classList.remove('on'); return; }
    const key = this.G.input.touchMode ? '✋' : 'E'; const txt = `<b>${key}</b> ${kind === 'hold' ? 'Hold · ' : ''}${esc(label)}`;
    if (p.innerHTML !== txt) p.innerHTML = txt; p.classList.add('on'); this.$('#cross').classList.add('on');
  }
  holdProgress(k) { const c = this.$('#ring circle'); this.$('#ring').style.opacity = k > 0 ? 1 : 0; c.style.strokeDashoffset = 100.5 * (1 - clamp(k, 0, 1)); }
  toast(t) {
    const el = h('div', 'toast', esc(t)); const box = this.$('#toasts'); box.appendChild(el); while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 3600); setTimeout(() => el.remove(), 4200);
  }
  itemToast(it, n) { const el = h('div', 'toast item', `<span class="ic">${it.icon}</span><div><b>${esc(it.name)}${n > 1 ? ' ×' + n : ''}</b><small>${esc(it.desc)}</small></div>`); const box = this.$('#toasts'); box.appendChild(el); while (box.children.length > 4) box.firstChild.remove(); setTimeout(() => el.classList.add('out'), 4200); setTimeout(() => el.remove(), 4800); }
  notify(c, text) { const n = this.$('#notif'); n.innerHTML = `<span class="av" style="background:${c.color}">${c.avatar}</span><div><b>${esc(c.name)}</b><p>${esc(text)}</p></div><small>now · 📱 P</small>`; n.classList.remove('on'); void n.offsetWidth; n.classList.add('on'); clearTimeout(this._nt); this._nt = setTimeout(() => n.classList.remove('on'), 4200); }
  fakeNotify(t, text) { this.notify({ name: t, avatar: '❔', color: '#8d99ae' }, text); }
  banner(a, b) { (this.bq = this.bq || []).push([a, b]); this.pumpBanner(); }
  pumpBanner() {
    const now = performance.now(); if (!this.bq || !this.bq.length || (this.G.cine && this.G.cine.active) || now < (this.bannerUntil || 0)) return;
    const [a, b] = this.bq.shift(); this.bannerUntil = now + 3500; this._banner(a, b);
  }
  _banner(a, b) { const el = this.$('#banner'); el.querySelector('.a').textContent = a; el.querySelector('.b').textContent = b; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  areaTitle(t) { if (this.G.cine && this.G.cine.active) return; const el = this.$('#area'); el.textContent = t; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  saveIcon() { const el = this.$('#savei'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
  update(dt) {
    this.pumpBanner();
    const G = this.G; if (G.state !== 'play') return;
    this.$('#clock').textContent = `Day ${G.day} · ${fmtTime(G.time)}`; this.$('#money').textContent = `$${G.money}`;
    const en = this.$('#energy'); en.style.display = G.energyT > 0 ? 'block' : 'none'; if (G.energyT > 0) en.textContent = `⚡ BRO ENERGY ${Math.ceil(G.energyT)}s`;
    this.drawMini();
    // waypoint marker
    const wp = this.$('#wp'); const t = G.story.target && !G.flags.ended ? G.story.target() : null;
    const interior = G.area !== 'out', tInterior = t && t[0] > 900;
    if (t && interior === tInterior && !G.modal) {
      const v = new THREE.Vector3(t[0], 2.2, t[1]); const d = Math.hypot(t[0] - G.player.pos.x, t[1] - G.player.pos.z);
      v.project(G.camera); let x = v.x, y = v.y; const behind = v.z > 1; if (behind) { x = -x; y = -1; }
      const m = 0.92; if (behind || Math.abs(x) > m || Math.abs(y) > m) { const s = m / Math.max(Math.abs(x), Math.abs(y)); x *= s; y *= s; }
      wp.style.display = d < 3 ? 'none' : 'flex'; wp.style.left = ((x + 1) / 2) * innerWidth + 'px'; wp.style.top = ((1 - y) / 2) * innerHeight + 'px'; wp.querySelector('span').textContent = Math.round(d) + 'm';
    } else wp.style.display = 'none';
    // NPC tags (name + ! for story)
    const used = new Set();
    for (const n of Object.values(G.npcs)) {
      if (!n.visible) continue; const d = Math.hypot(n.pos.x - G.player.pos.x, n.pos.z - G.player.pos.z); const imp = n.def.important && n.def.important(G) && !G.flags.ended;
      if (d > (imp ? 40 : 9)) continue;
      const v = new THREE.Vector3(n.pos.x, n.rig.mixer ? 1.4 : 2.2, n.pos.z).project(G.camera); if (v.z > 1) continue;
      let el = this.tagEls[n.id]; if (!el) { el = this.tagEls[n.id] = h('div', 'tag'); this.$('#tags').appendChild(el); }
      el.innerHTML = `${imp ? '<i>!</i>' : ''}${d < 9 ? esc(n.name) + (n.mode === 'sleep' ? ' 💤' : '') : ''}`;
      el.style.left = ((v.x + 1) / 2) * innerWidth + 'px'; el.style.top = ((1 - v.y) / 2) * innerHeight + 'px'; el.style.display = 'block'; used.add(n.id);
    }
    for (const [id, el] of Object.entries(this.tagEls)) if (!used.has(id)) el.style.display = 'none';
  }
  drawMini() {
    const G = this.G, g = this.mini, W = 180, P = G.player.pos;
    g.clearRect(0, 0, W, W); g.save(); g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, 7); g.clip();
    if (G.area !== 'out') { g.fillStyle = '#111'; g.fillRect(0, 0, W, W); g.fillStyle = '#888'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('UNDERGROUND', W / 2, W / 2 - 6); g.fillText('NO SIGNAL 📵', W / 2, W / 2 + 12); }
    else {
      const S = G.world.mapScale, zoom = 1.6; g.translate(W / 2, W / 2); g.rotate(G.player.yaw); g.scale(zoom, zoom);
      g.drawImage(G.world.mapCanvas, -(P.x - BOUNDS.x0) * S / 1, -(P.z - BOUNDS.z0) * S / 1);
      g.setTransform(1, 0, 0, 1, 0, 0);
      const tp = (x, z) => { const dx = (x - P.x) * S * zoom, dz = (z - P.z) * S * zoom, c = Math.cos(G.player.yaw), s = Math.sin(G.player.yaw); return [W / 2 + dx * c + dz * s, W / 2 - dx * s + dz * c]; };
      for (const n of Object.values(G.npcs)) { if (!n.visible) continue; const [x, y] = tp(n.pos.x, n.pos.z); g.fillStyle = n.def.important && n.def.important(G) ? '#ffd166' : '#9ad'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
      for (const [id, gt] of Object.entries(G.world.gates)) { if (gt.open) continue; const [x, y] = tp(gt.x, gt.z); g.font = '11px sans-serif'; g.fillText('🔒', x - 6, y + 4); }
      const t = G.story.target && !G.flags.ended ? G.story.target() : null;
      if (t && t[0] < 900) { let [x, y] = tp(t[0], t[1]); const dx = x - W / 2, dy = y - W / 2, d = Math.hypot(dx, dy), m = W / 2 - 12; if (d > m) { x = W / 2 + (dx / d) * m; y = W / 2 + (dy / d) * m; } g.fillStyle = '#ff3d71'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x + 6, y); g.lineTo(x, y + 7); g.lineTo(x - 6, y); g.closePath(); g.fill(); g.stroke(); }
    }
    g.restore();
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W / 2, W / 2 - 8); g.lineTo(W / 2 + 6, W / 2 + 6); g.lineTo(W / 2, W / 2 + 3); g.lineTo(W / 2 - 6, W / 2 + 6); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.arc(W / 2, W / 2, W / 2 - 2, 0, 7); g.stroke();
    if (G.area === 'out') { const a = G.player.yaw; g.fillStyle = '#ff3d71'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('N', W / 2 - Math.sin(a) * (W / 2 - 12), W / 2 - Math.cos(a) * (W / 2 - 12) + 5); }
  }
  // ---------- dialogue ----------
  dialog(nodes, onEnd) {
    document.exitPointerLock?.();
    this.dlg = { nodes, i: -1, onEnd }; const el = this.$('#dlg'); el.classList.remove('hidden'); this.$('#prompt').classList.remove('on');
    this.goNode(0);
  }
  goNode(i) {
    const d = this.dlg; if (!d) return; const n = d.nodes[i];
    if (!n) return this.endDialog();
    d.i = i; d.node = n; if (n.fx) n.fx(this.G);
    const el = this.$('#dlg'); const who = SPEAKERS[n.s] || n.s || '';
    el.querySelector('.who').textContent = who; el.querySelector('.who').className = 'who ' + (n.s || '');
    let t = (n.t || '').replace('{time}', fmtTime(this.G.time));
    d.full = t; d.shown = 0; d.typing = true; el.querySelector('.txt').textContent = ''; el.querySelector('.ch').innerHTML = ''; d.choiceEls = null; el.querySelector('.more').style.display = 'none';
    clearInterval(this._tw);
    this._tw = setInterval(() => { if (!this.dlg || this.dlg !== d) return clearInterval(this._tw); d.shown += 2; el.querySelector('.txt').textContent = d.full.slice(0, d.shown); if (d.shown % 6 === 0 && n.s !== 'me') this.G.sfx('talk', n.s === 'bolt' ? 2 : 1); if (d.shown >= d.full.length) this.finishTyping(); }, 18);
  }
  finishTyping() {
    const d = this.dlg; clearInterval(this._tw); d.typing = false; const el = this.$('#dlg'); el.querySelector('.txt').textContent = d.full;
    const n = d.node;
    if (n.c) {
      const ch = el.querySelector('.ch'); ch.innerHTML = ''; d.choiceEls = [];
      n.c.filter((c) => !c.if || c.if(this.G)).forEach((c, k) => {
        const b = h('button', '', `<em>${k + 1}</em> ${esc(c.t)}`); b.addEventListener('click', (e) => { e.stopPropagation(); this.G.sfx('click'); if (c.fx) c.fx(this.G); if (!this.dlg) return; if (c.go) this.goNode(this.findNode(c.go)); else if (c.end) this.endDialog(); else this.goNode(d.i + 1 + this.skipLabeled(d.i + 1)); }); ch.appendChild(b); d.choiceEls.push(b);
      });
    } else el.querySelector('.more').style.display = 'block';
  }
  findNode(id) { const i = this.dlg.nodes.findIndex((n) => n.id === id); return i < 0 ? 1e9 : i; }
  skipLabeled() { return 0; }
  advance() {
    const d = this.dlg; if (!d) return;
    if (d.typing) return this.finishTyping();
    if (d.node.c) return;
    if (d.node.end) return this.endDialog();
    if (d.node.go) return this.goNode(this.findNode(d.node.go));
    // after a labeled branch node without go, end if next node is another branch label target of the same choice
    this.goNode(d.i + 1);
  }
  endDialog() { const d = this.dlg; if (!d) return; clearInterval(this._tw); this.dlg = null; this.dlgEnded = performance.now(); this.G.input.release('act'); this.$('#dlg').classList.add('hidden'); d.onEnd && d.onEnd(); }
  // ---------- inventory ----------
  inventory() {
    const G = this.G; G.modal = 'panel';
    const ids = Object.keys(G.inv).filter((k) => G.inv[k] > 0);
    const cell = (id) => { const it = ITEMS[id] || { name: id, icon: '❓', desc: '' }; return `<div class="it ${it.story ? 'story' : ''}" data-i="${id}"><span>${it.icon}</span><b>${G.inv[id] > 1 ? '×' + G.inv[id] : ''}</b></div>`; };
    this.panel(`<h2>🎒 Backpack <small>$${G.money}</small></h2><div class="grid">${ids.map(cell).join('') || '<p class="empty">Empty. Go dig through some trash!</p>'}</div><div class="desc">Tap an item to inspect it.</div><button class="close">Close</button>`, (p) => {
      p.querySelectorAll('.it').forEach((c) => c.addEventListener('click', () => {
        const it = ITEMS[c.dataset.i]; const d = p.querySelector('.desc');
        d.innerHTML = `<b>${it.icon} ${esc(it.name)}</b><br>${esc(it.desc)}${it.value ? `<br><small>Sells for ~$${it.value}</small>` : ''}${it.use ? `<br><button class="use">${it.use === 'drink' ? 'Drink' : 'Eat'}</button>` : ''}`;
        const u = d.querySelector('.use'); if (u) u.addEventListener('click', () => { G.useItem(c.dataset.i); this.closePanel(); });
      }));
    });
  }
  keypad(cb) {
    const G = this.G; G.modal = 'panel'; let code = '';
    this.panel(`<h2>🔢 VAULT</h2><div class="kp"><div class="scr">____</div>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div><button class="close">Cancel</button>`, (p) => {
      const scr = p.querySelector('.scr'); const draw = () => (scr.textContent = (code + '____').slice(0, 4));
      const press = (k) => { G.sfx('click'); if (k === 'C') code = ''; else if (k === 'OK') { if (code.length === 4) { const ok = cb(code); if (ok) { this.closePanel(); } else { scr.classList.add('bad'); setTimeout(() => scr.classList.remove('bad'), 400); code = ''; } } } else if (code.length < 4) code += k; draw(); };
      p.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => press(b.dataset.k)));
      this.keyHandler = (e) => { if (/^\d$/.test(e.key)) press(e.key); if (e.key === 'Enter') press('OK'); if (e.key === 'Backspace') { code = code.slice(0, -1); draw(); } };
    });
  }
  // ---------- tool modes ----------
  setMode(m) {
    const ov = this.$('#modeov'); ov.className = m === 'walk' ? '' : 'on ' + m; this.camZoom = 1;
    if (m === 'camera') ov.innerHTML = `<div class="vf"><i></i><i></i><i></i><i></i></div><div class="camui"><button class="ex">✕</button><button class="shoot">◉</button><span>${this.G.input.touchMode ? 'Tap ◉ to shoot' : 'E / click ◉ shoot · wheel zoom · Esc exit'}</span></div><div class="rec">📷 CAMERA</div>`;
    else if (m === 'scanner') ov.innerHTML = `<div class="scan"><div class="radar"><i class="sweep"></i><i class="arrow">▲</i></div><div class="bars"></div><div class="info">Searching…</div><div class="ring"><b></b></div></div><div class="camui"><button class="ex">✕</button><button class="shoot">SCAN</button><span>${this.G.input.touchMode ? 'Hold SCAN near a signal' : 'Hold E near a strong signal · Esc exit'}</span></div><div class="rec">📡 JUNKYARD SCANNER v0.9 (beta)</div>`;
    else ov.innerHTML = '';
    const ex = ov.querySelector('.ex'); ex && ex.addEventListener('click', () => this.G.setMode('walk'));
    const sh = ov.querySelector('.shoot'); if (sh) { if (m === 'camera') sh.addEventListener('click', () => this.G.takePhoto()); else this.G.input.bindButton(sh, 'scan', true); }
    this.$('#cross').style.display = m === 'walk' ? '' : 'none';
  }
  scanner(str, dir, target, inRange, prog, dist) {
    const ov = this.$('#modeov'); if (!ov.classList.contains('scanner')) return;
    const bars = Math.round(str * 10); ov.querySelector('.bars').innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i < bars ? 'on' : ''}"></i>`).join('');
    ov.querySelector('.arrow').style.transform = `rotate(${-dir}rad)`; ov.querySelector('.arrow').style.opacity = target ? 1 : 0.15;
    ov.querySelector('.info').textContent = !target ? 'No signal… keep walking.' : inRange ? `SIGNAL LOCKED — HOLD TO SCAN (${Math.round(dist)}m)` : str > 0.7 ? `VERY STRONG signal · ${Math.round(dist)}m` : str > 0.4 ? `Strong signal · ${Math.round(dist)}m` : `Weak signal · ${Math.round(dist)}m`;
    ov.querySelector('.ring b').style.width = Math.round(prog * 100) + '%'; ov.querySelector('.scan').classList.toggle('lock', !!inRange);
  }
  scanResult(t, s) { this.banner(t, s); this.toast(`📡 ${t}: ${s}`); }
  flash() { const f = this.$('#fade'); f.style.transition = 'none'; f.style.background = '#fff'; f.style.opacity = 0.8; requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; setTimeout(() => (f.style.background = '#000'), 400); }); }
  // ---------- cutscene overlays ----------
  fade(a, dur) { const f = this.$('#fade'); f.style.background = '#000'; f.style.transition = `opacity ${dur}s`; f.style.opacity = a; }
  flashWhite() { const f = this.$('#fade'); f.style.transition = 'none'; f.style.background = '#fff'; f.style.opacity = 1; requestAnimationFrame(() => { f.style.transition = 'opacity .6s'; f.style.opacity = 0; setTimeout(() => (f.style.background = '#000'), 650); }); }
  cineStart(skippable, onSkip) { this.root.classList.add('cine'); this.$('#skip').style.display = skippable ? 'block' : 'none'; this.onSkip = onSkip; this.showHud(false); this.$('#prompt').classList.remove('on'); this.setMode('walk'); }
  cineEnd() { this.root.classList.remove('cine'); this.$('#skip').style.display = 'none'; this.onSkip = null; this.skipHold = 0; }
  subtitle(t, who) { const s = this.$('#sub'); if (!t) { s.classList.remove('on'); return; } s.innerHTML = (who ? `<b>${esc(who)}:</b> ` : '') + esc(t); s.classList.add('on'); }
  bigTitle(t, sub, dur = 4, final) { const b = this.$('#big'); b.querySelector('.t').textContent = t; b.querySelector('.s').textContent = sub || ''; b.classList.toggle('final', !!final); b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); clearTimeout(this._bt); this._bt = setTimeout(() => b.classList.remove('on'), dur * 1000); }
  cctv(on) {
    const c = this.$('#cctv'); c.classList.toggle('on', on); this.G.canvas.classList.toggle('cctv', on); this.G.cctvOn = on; clearInterval(this._cc);
    if (on) { let s = 7; this._cc = setInterval(() => { s++; c.querySelector('.ts').textContent = `11/23  02:14:${String(s % 60).padStart(2, '0')} AM`; }, 1000); c.querySelector('.ts').textContent = '11/23  02:14:07 AM'; }
  }
  cardThen(text, cb) { const b = this.$('#big'); b.querySelector('.t').textContent = text; b.querySelector('.s').textContent = ''; b.classList.add('on', 'card'); setTimeout(() => { b.classList.remove('on', 'card'); cb(); }, 2600); }
  choice(title, opts, cb) {
    const s = this.$('#screen'); s.classList.add('on', 'dim'); document.exitPointerLock?.();
    s.innerHTML = `<div class="choice"><h2>${esc(title)}</h2>${opts.map((o, i) => `<button data-i="${i}" ${o.v ? '' : 'disabled'}>${esc(o.t)}</button>`).join('')}</div>`;
    s.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const o = opts[+b.dataset.i]; if (!o.v) return; this.G.sfx('click'); s.classList.remove('on', 'dim'); s.innerHTML = ''; cb(o.v); }));
  }
  endingScreen(E, id, onExplore) {
    const G = this.G, s = this.$('#screen'); s.classList.add('on', 'dim'); const ends = Save.endings();
    const rare = Object.keys(G.scanned).filter((k) => /^r\d$/.test(k)).length;
    s.innerHTML = `<div class="ending"><div class="sub">ENDING ${['perfect', 'keep', 'tyler', 'sell', 'squad'].indexOf(id) + 1}/5 — ${esc(E.sub)}</div><h1>${esc(E.title)}</h1><div class="story"></div>
      <div class="stats hidden">Days in the junkyard: <b>${G.day}</b> · Money: <b>$${G.money}</b> · Rare scans: <b>${rare}/8</b> · Photos: <b>${G.gallery.length}</b> · Golden controller: <b>${G.has('gold') ? 'YES 🏆' : 'no'}</b><br>Endings found: <b>${ends.length}/5</b></div>
      <div class="btns hidden"><button data-x="explore">🗺 Keep exploring</button><button data-x="title">⏏ Title screen</button><button data-x="cred">★ Credits</button></div></div>`;
    const st = s.querySelector('.story'); let i = 0;
    const nextLine = () => { if (i >= E.text.length) { s.querySelector('.stats').classList.remove('hidden'); s.querySelector('.btns').classList.remove('hidden'); return; } const p = h('p', '', esc(E.text[i++])); st.appendChild(p); setTimeout(nextLine, 2600); };
    setTimeout(nextLine, 800);
    s.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => { const x = b.dataset.x; if (x === 'explore') { s.classList.remove('on', 'dim'); s.innerHTML = ''; onExplore(); } if (x === 'title') { G.autosave(); location.reload(); } if (x === 'cred') this.credits(); }));
  }
}
