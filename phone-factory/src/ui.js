// All screens of PHONE FACTORY.
import * as S from './sim.js';
import { HW, HW_LABEL, FRAMES, BACKS, SCREEN_SHAPES, CAM_LAYOUTS, FINGERPRINT, FACE, PORTS, SPEAKER_LAYOUT, FOLD, FLASH, RESEARCH, RES, AUDIENCES, REGIONS, AD_STYLES, PROMOTE, FACTORIES, STAGES, STAGE_ICON, ROLES, TESTS } from './data.js';
import { ALL_APPS, CONTROL_TILES, WALLPAPERS, PALETTES, LOGO_GLYPHS, drawLogo, hitHome, ANIM_EASE, ANIM_DUR } from './os.js';
import { Viewer } from './phone3d.js';
import { FactoryView } from './factoryview.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const M = S.fmtMoney, N = S.fmtNum;
const COLORS = ['#2b2d42', '#111111', '#f8f9fa', '#e63946', '#ff6b6b', '#f4a261', '#ffd166', '#06d6a0', '#2a9d8f', '#118ab2', '#3a86ff', '#3a0ca3', '#7209b7', '#f72585', '#ffafcc', '#a8dadc', '#8d99ae', '#c9ada7', '#b08968', '#d4af37'];
const bar = (v, color) => `<div class="bar"><i style="width:${Math.max(2, Math.min(100, v))}%;background:${color || (v >= 70 ? '#06d6a0' : v >= 40 ? '#ffd166' : '#ff3d71')}"></i></div>`;
const stars = (r) => '★★★★★'.slice(0, Math.round(r)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(r));

export const NAV = [
  ['hq', '🏢', 'HQ'], ['design', '✏️', 'Design'], ['lab', '🧪', 'Lab'], ['factory', '🏭', 'Factory'], ['research', '🔬', 'Research'],
  ['marketing', '📣', 'Marketing'], ['market', '📈', 'Market'], ['company', '👥', 'Company'], ['missions', '🎯', 'Missions'], ['menu', '☰', 'Menu'],
];

export class UI {
  constructor(G) { this.G = G; this.screen = 'hq'; this.designTab = 'exterior'; this.selDesign = null; this.selProduct = null; this.liveT = 0; }
  get s() { return this.G.s; }
  toast(text, kind = '') { const box = $('#toasts'); const el = document.createElement('div'); el.className = 'toast ' + kind; el.innerHTML = text; box.appendChild(el); while (box.children.length > 4) box.firstChild.remove(); setTimeout(() => el.classList.add('out'), 3800); setTimeout(() => el.remove(), 4400); }
  err(msg) { if (msg) { this.toast('⚠️ ' + esc(msg), 'bad'); this.G.sfx.play('bad'); return true; } return false; }
  modal(html, buttons = [['OK', null]], cls = '') {
    const m = $('#modal'); const gen = String(Math.random()); m.dataset.gen = gen; m.innerHTML = `<div class="box ${cls}">${html}<div class="mbtns">${buttons.map(([t], i) => `<button data-i="${i}" class="${i === 0 ? 'pri' : ''}">${t}</button>`).join('')}</div></div>`; m.classList.add('on'); this.G.modalOpen = true;
    return new Promise((res) => { $$('[data-i]', m).forEach((b) => (b.onclick = () => { const f = buttons[+b.dataset.i][1]; m.classList.remove('on'); this.G.modalOpen = false; if (f && f(m) === false) { m.classList.add('on'); this.G.modalOpen = true; return; } if (!m.classList.contains('on') || m.dataset.gen === gen) m.innerHTML = ''; res(+b.dataset.i); })); });
  }
  // ---------- shell ----------
  shell() {
    document.getElementById('app').innerHTML = `
      <header id="top"><div class="brand"><canvas id="toplogo" width="64" height="64"></canvas><b id="cname"></b></div>
        <div class="kpis"><span id="kMoney"></span><span id="kDay"></span><span id="kRep"></span></div>
        <div class="speed">${[[0, '⏸'], [1, '▶'], [3, '▶▶'], [8, '▶▶▶']].map(([v, l]) => `<button data-sp="${v}">${l}</button>`).join('')}</div></header>
      <nav id="nav">${NAV.map(([id, ic, l]) => `<button data-nav="${id}"><span>${ic}</span><small>${l}</small><i class="dot"></i></button>`).join('')}</nav>
      <main id="main"></main>`;
    $$('[data-nav]').forEach((b) => (b.onclick = () => { this.G.sfx.play('click'); this.go(b.dataset.nav); }));
    $$('[data-sp]').forEach((b) => (b.onclick = () => { this.G.setSpeed(+b.dataset.sp); }));
    this.header();
  }
  header() {
    const s = this.s; $('#cname').textContent = s.company.name; drawLogo($('#toplogo'), s.company.logo);
    $('#kMoney').innerHTML = `💰 <b class="${s.money < 0 ? 'neg' : ''}">${M(s.money)}</b>`; $('#kDay').innerHTML = `📅 ${S.dateOf(s.day)}`; $('#kRep').innerHTML = `⭐ ${Math.round(s.rep)}`;
    $$('[data-sp]').forEach((b) => b.classList.toggle('on', +b.dataset.sp === (this.G.paused ? 0 : this.G.speed)));
    const m = S.currentMission(s); $('[data-nav="missions"] .dot').style.display = m && !S.sandbox(s) ? 'block' : 'none';
  }
  go(screen) {
    this.screen = screen; $$('[data-nav]').forEach((b) => b.classList.toggle('on', b.dataset.nav === screen));
    if (this.viewer && screen !== 'design') { this.viewer.stop(); }
    const main = $('#main'); main.scrollTop = 0; main.className = 'scr-' + screen;
    this['s_' + screen](main); this.live(true);
  }
  live(force) { const fn = this['l_' + this.screen]; if (fn) fn.call(this, force); }
  design() { const s = this.s; let d = s.designs.find((x) => x.id === this.selDesign); if (!d) { d = s.designs[s.designs.length - 1]; this.selDesign = d && d.id; } return d; }

  // ================= HQ =================
  s_hq(el) {
    const s = this.s; const m = S.currentMission(s);
    el.innerHTML = `<h1>Headquarters</h1>
      ${S.sandbox(s) ? '<div class="card sandbox">🏖️ <b>SANDBOX MODE</b> — unlimited money, every technology unlocked. Build something ridiculous.</div>' : m ? `<div class="card mission"><div class="mk">CURRENT MISSION ${S.MISSIONS.indexOf(m) + 1}/7</div><h2>${m.title}</h2><p>${m.desc}</p><p class="hint">💡 ${m.hint}</p><div class="prog" id="mprog"></div><div class="rw">Reward: ${M(m.reward)}</div></div>` : '<div class="card mission"><h2>🏆 Campaign complete!</h2><p>Sandbox mode is unlocked from the title screen.</p></div>'}
      <div class="grid4" id="hqk"></div>
      <div class="cols"><div class="card"><h3>Money</h3><canvas id="chart" height="160"></canvas></div><div class="card"><h3>Market share (30 days)</h3><div id="share"></div></div></div>
      <div class="card"><h3>Active events</h3><div id="effects"></div></div>
      <div class="card"><h3>News</h3><div id="news" class="news"></div></div>`;
  }
  l_hq() {
    const s = this.s; const m = S.currentMission(s); const mp = $('#mprog'); if (mp && m) mp.textContent = m.progress ? 'Progress: ' + m.progress(s) : '';
    const fr = S.factoryRate(s);
    $('#hqk').innerHTML = [['📱 Phones sold', N(s.stats.sold)], ['💵 Revenue', M(s.stats.revenue)], ['🏭 Produced', N(s.stats.produced)], ['📦 In stock', N(Object.values(s.inventory).reduce((a, b) => a + b, 0))], ['⚙️ Capacity', N(fr.cap) + '/day'], ['🔬 Research', s.researching ? `${RES[s.researching].name} ${Math.floor((s.rp / RES[s.researching].rp) * 100)}%` : 'idle'], ['👥 Staff', s.employees.length], ['🌍 Regions', Object.keys(s.regions).length]].map(([a, b]) => `<div class="kpi"><small>${a}</small><b>${b}</b></div>`).join('');
    $('#share').innerHTML = (s.share || S.marketShare(s)).map((r) => `<div class="sh ${r.me ? 'me' : ''}"><span>${esc(r.name)}</span>${bar(r.pct, r.color)}<b>${r.pct.toFixed(1)}%</b></div>`).join('');
    $('#effects').innerHTML = s.effects.length ? s.effects.map((e) => `<div class="eff">${e.icon} <b>${e.title}</b> <small>until ${S.dateOf(e.until)}</small></div>`).join('') : '<small class="muted">Nothing unusual. Calm before the storm.</small>';
    $('#news').innerHTML = s.news.slice(0, 25).map((n) => `<div class="nw ${n.kind}"><small>${S.dateOf(n.day)}</small> ${n.icon} ${esc(n.text)}</div>`).join('');
    this.chart($('#chart'), s.history.map((h) => h.money), '#06d6a0');
  }
  chart(cv, data, color) {
    if (!cv) return; const r = cv.getBoundingClientRect(); cv.width = r.width * 2; cv.height = 320; const g = cv.getContext('2d'); const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
    if (data.length < 2) { g.fillStyle = '#667'; g.font = '24px system-ui'; g.fillText('Not enough data yet…', 20, H / 2); return; }
    const mn = Math.min(0, ...data), mx = Math.max(1, ...data); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.beginPath(); const zy = H - ((0 - mn) / (mx - mn)) * (H - 20) - 10; g.moveTo(0, zy); g.lineTo(W, zy); g.stroke();
    g.strokeStyle = color; g.lineWidth = 4; g.beginPath(); data.forEach((v, i) => { const x = (i / (data.length - 1)) * W, y = H - ((v - mn) / (mx - mn)) * (H - 20) - 10; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fillStyle = color + '22'; g.fill();
    g.fillStyle = '#ccd'; g.font = '22px system-ui'; g.fillText(M(data[data.length - 1]), 10, 28);
  }

  // ================= DESIGN =================
  s_design(el) {
    const s = this.s; const d = this.design();
    el.innerHTML = `<div class="dsg">
      <div class="dl"><div class="dlist">${s.designs.map((x) => `<button data-dsel="${x.id}" class="${x.id === d.id ? 'on' : ''}">${esc(x.name)}${x.prototype ? ' 🧪' : ''}${s.products.some((p) => p.d === x.id) ? ' 🛒' : ''}</button>`).join('')}<button data-dact="new">＋ New</button><button data-dact="dup">⧉ Copy</button>${s.designs.length > 1 && !s.products.some((p) => p.d === d.id) ? '<button data-dact="del">🗑</button>' : ''}</div>
        <div class="view" id="view"><div class="vbtns"><button data-v="front">Front</button><button data-v="back">Back</button><button data-v="side">Side</button><button data-v="front34">3/4</button><button data-v="back34">Back 3/4</button>${d.ext.fold !== 'none' ? '<button data-v="fold">Fold ↔</button>' : ''}<button data-v="spin">⟳</button></div>
          <div class="sbtns">${['lock', 'home', 'control', 'settings', 'boot'].map((x) => `<button data-scr="${x}">${x}</button>`).join('')}</div><div class="tip">Drag to rotate · pinch/scroll to zoom · tap the screen to open apps</div></div>
        <div class="livestats" id="livestats"></div></div>
      <div class="dr"><div class="tabs">${[['exterior', 'Exterior'], ['hardware', 'Hardware'], ['software', 'Software'], ['summary', 'Summary']].map(([k, l]) => `<button data-tab="${k}" class="${this.designTab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="dpanel" class="dpanel"></div>
        <div class="dact"><input id="dname" value="${esc(d.name)}" maxlength="28"><button id="proto" class="pri"></button></div><div id="derr" class="derr"></div></div></div>`;
    // viewer
    if (!this.viewer) { this.viewer = new Viewer($('#view')); this.viewer.onScreenTap = (uv) => this.screenTap(uv); }
    else $('#view').appendChild(this.viewer.renderer.domElement);
    this.viewer.container = $('#view'); this.viewer.resize(); this.viewer.start(); this.refreshViewer();
    $$('[data-dsel]').forEach((b) => (b.onclick = () => { this.selDesign = +b.dataset.dsel; this.viewer.fitted = false; this.go('design'); }));
    $$('[data-dact]').forEach((b) => (b.onclick = () => this.designAction(b.dataset.dact)));
    $$('[data-v]').forEach((b) => (b.onclick = () => { const v = b.dataset.v; if (v === 'fold') this.viewer.toggleFold(); else if (v === 'spin') this.viewer.controls.autoRotate = !this.viewer.controls.autoRotate; else this.viewer.view(v); }));
    $$('[data-scr]').forEach((b) => (b.onclick = () => this.setScreen(b.dataset.scr)));
    $$('[data-tab]').forEach((b) => (b.onclick = () => { this.designTab = b.dataset.tab; $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === b)); this.designPanel(); }));
    $('#dname').oninput = (e) => { d.name = e.target.value || 'Unnamed'; this.refreshViewer(); };
    $('#proto').onclick = () => { if (this.err(S.buildPrototype(s, d))) return; this.G.sfx.play('good'); this.toast(`🧪 Prototype of <b>${esc(d.name)}</b> built! Head to the Lab to test it.`, 'good'); this.G.afterAction(); this.go('design'); };
    this.designPanel();
  }
  setScreen(scr) {
    const v = this.viewer; v.animScreen = null;
    if (scr === 'boot') { const logo = drawLogo(Object.assign(document.createElement('canvas'), { width: 256, height: 256 }), this.s.company.logo); let t = 0; v.screen = 'boot'; this.G.sfx.play('boot'); v.animScreen = (dt) => { t += dt; v.drawScreen({ boot: Math.min(1, t / 3.5), logoCanvas: logo, t }); if (t > 3.6) { v.animScreen = null; v.screen = 'lock'; v.drawScreen(); } }; return; }
    v.screen = scr; v.drawScreen();
  }
  screenTap(uv) {
    const v = this.viewer, os = this.s.os; const W = v.osCanvas.width, H = v.osCanvas.height; const x = uv.x * W, y = (1 - uv.y) * H; this.G.sfx.play('click');
    if (v.screen === 'lock') return this.setScreen('home');
    if (v.screen.startsWith('app:') || v.screen === 'control' || v.screen === 'settings') return this.setScreen('home');
    if (v.screen === 'home') {
      const app = hitHome(os, x, y, W, H); if (!app) { if (y < H * 0.08) this.setScreen('control'); return; }
      if (app === 'Settings') return this.setScreen('settings');
      const dur = ANIM_DUR[os.animations], ease = ANIM_EASE[os.animations]; let t = 0; v.screen = 'app:' + app;
      v.animScreen = (dt) => { t += dt; v.drawScreen({ appT: ease(Math.min(1, t / dur)) }); if (t > dur) v.animScreen = null; };
    }
  }
  refreshViewer() { const d = this.design(); if (!this.viewer || !d) return; this.viewer.setDesign(d, this.s.os, this.s.company.name, (cv) => drawLogo(cv, this.s.company.logo)); this.designStats(); }
  designAction(a) {
    const s = this.s; const d = this.design();
    if (a === 'new') { const n = S.defaultDesign(s.nextDesign++, 'Model ' + (s.designs.length + 1)); n.created = s.day; s.designs.push(n); this.selDesign = n.id; }
    if (a === 'dup') { const n = JSON.parse(JSON.stringify(d)); n.id = s.nextDesign++; n.name = d.name + ' Pro'; n.prototype = false; n.tests = {}; n.hidden = []; n.found = []; n.rev = 1; s.designs.push(n); this.selDesign = n.id; }
    if (a === 'del') { s.designs = s.designs.filter((x) => x.id !== d.id); this.selDesign = null; }
    this.viewer.fitted = false; this.go('design');
  }
  designStats() {
    const s = this.s, d = this.design(); const st = S.computeStats(d, s); const errs = S.designErrors(d, s);
    const ls = $('#livestats'); if (ls) ls.innerHTML = `<span class="ov">Score <b>${st.overall}</b></span><span>💵 ${M(st.cost)}/unit</span><span>⚖️ ${st.weight} g</span><span>🔋 ${st.hours} h</span><span>🌡️ ${st.heat}°C</span><span>📐 ${st.diag}"</span>`;
    const pb = $('#proto'); if (pb) { const stale = d.prototype && d.protoRev !== d.rev; pb.textContent = d.prototype && !stale ? '✅ Prototype built — rebuild (' + M(S.prototypeCost(d, s)) + ')' : `🔧 Build prototype (${M(S.prototypeCost(d, s))})`; pb.disabled = errs.length > 0 || s.products.some((p) => p.d === d.id); if (s.products.some((p) => p.d === d.id)) pb.textContent = '🛒 Launched — copy to make a new model'; }
    const de = $('#derr'); if (de) de.innerHTML = errs.map((e) => `⚠️ ${esc(e)}`).join('<br>') + (d.prototype && d.protoRev !== d.rev ? '<br>✏️ Design changed since the prototype — rebuild & retest before production.' : '');
    if (this.designTab === 'summary') this.summaryPanel();
  }
  // generic segmented control with research locks
  seg(path, opts, val, small) {
    return `<div class="seg ${small ? 'sm' : ''}">${opts.map((o) => { const locked = o.req && !S.has(this.s, o.req); return `<button data-set="${path}" data-val="${o.id}" class="${String(val) === String(o.id) ? 'on' : ''} ${locked ? 'lock' : ''}" ${locked ? `data-req="${o.req}"` : ''}>${locked ? '🔒 ' : ''}${o.name}</button>`; }).join('')}</div>`;
  }
  slider(path, min, max, step, val, unit = '') { return `<div class="sl"><input type="range" data-num="${path}" min="${min}" max="${max}" step="${step}" value="${val}"><output>${val}${unit}</output></div>`; }
  colors(path, val) { return `<div class="sw">${COLORS.map((c) => `<button data-set="${path}" data-val="${c}" style="background:${c}" class="${val === c ? 'on' : ''}"></button>`).join('')}<input type="color" data-color="${path}" value="${val}"></div>`; }
  toggle(path, val, req) { const locked = req && !S.has(this.s, req); return `<button class="tg ${val ? 'on' : ''} ${locked ? 'lock' : ''}" data-tog="${path}" ${locked ? `data-req="${req}"` : ''}>${locked ? '🔒' : val ? 'ON' : 'OFF'}</button>`; }
  designPanel() {
    const p = $('#dpanel'); const s = this.s, d = this.design(), e = d.ext, L = S.limits(s), os = s.os;
    const row = (label, html) => `<div class="row"><label>${label}</label>${html}</div>`;
    if (this.designTab === 'exterior') {
      p.innerHTML = `<h3>Body</h3>${row('Form factor', this.seg('ext.fold', FOLD, e.fold))}
        ${row('Width (mm)', this.slider('ext.w', L.w[0], L.w[1], 0.5, e.w))}${row('Height (mm)', this.slider('ext.h', L.h[0], L.h[1], 0.5, e.h))}${row('Thickness (mm)', this.slider('ext.t', L.t[0], L.t[1], 0.1, e.t))}${row('Corner radius', this.slider('ext.r', L.r[0], L.r[1], 0.5, e.r))}
        <h3>Screen</h3>${row('Screen shape', this.seg('ext.shape', SCREEN_SHAPES, e.shape))}${row('Bezels (mm)', this.slider('ext.bezel', L.bezel[0], L.bezel[1], 0.1, e.bezel))}
        <h3>Materials & colors</h3>${row('Frame', this.seg('ext.frame', FRAMES, e.frame))}${row('Back', this.seg('ext.back', BACKS, e.back))}
        ${row('Body color', this.colors('ext.color', e.color))}${row('Frame color', this.colors('ext.frameColor', e.frameColor))}${row('Accent', this.colors('ext.accent', e.accent))}
        <h3>Cameras</h3>${row('Layout', this.seg('ext.camLayout', CAM_LAYOUTS, e.camLayout, true))}${row(`Number of cameras (max ${L.camCount[1]})`, this.slider('ext.camCount', 1, L.camCount[1], 1, Math.min(e.camCount, L.camCount[1])))}${row('Camera size', this.slider('ext.camSize', L.camSize[0], L.camSize[1], 0.05, e.camSize))}${row('Flash', this.seg('ext.flash', FLASH, e.flash))}
        <h3>Controls & ports</h3>${row('Buttons', this.seg('ext.buttons', [{ id: 'right', name: 'Right' }, { id: 'left', name: 'Left' }, { id: 'both', name: 'Both sides' }], e.buttons))}${row('Action key', this.toggle('ext.actionKey', e.actionKey))}
        ${row('Speakers', this.seg('ext.speakers', SPEAKER_LAYOUT, e.speakers))}${row('Charging port', this.seg('ext.port', PORTS, e.port))}${row('Wireless charging', this.toggle('ext.wireless', e.wireless, 'r_wireless'))}
        ${row('Water sealing (IP68)', this.toggle('ext.ip', e.ip, 'r_ip'))}
        <h3>Security & branding</h3>${row('Fingerprint', this.seg('ext.fingerprint', FINGERPRINT, e.fingerprint))}${row('Face unlock', this.seg('ext.face', FACE, e.face))}${row('Logo on the back', this.toggle('ext.logo', e.logo))}
        ${S.sandbox(s) ? `<h3>Sandbox presets</h3><div class="seg">${['Giant', 'Tiny', 'Gaming', 'Foldable', 'Transparent', '20 cameras', 'Futuristic'].map((n) => `<button data-preset="${n}">${n}</button>`).join('')}</div>` : ''}`;
    } else if (this.designTab === 'hardware') {
      p.innerHTML = Object.keys(HW).map((k) => `<h3>${HW_LABEL[k]}</h3><div class="hw">${HW[k].map((it) => { const locked = it.req && !S.has(s, it.req); const info = { cpu: `⚡${it.perf} · ${it.power}W · 🔥${it.heat}`, ram: `+${it.perf} perf`, storage: `${it.gb} GB`, battery: `${it.density} mAh/cm³ · ${it.wpm}g/Ah`, display: `Q${it.q} · ${it.hz}Hz`, camera: `Q${it.q}`, speaker: `Q${it.q}`, cooling: `−${it.cap}°C`, modem: `Q${it.q}${it.sat ? ' · 🛰️' : ''}`, charging: `${it.watts} W` }[k];
        const cost = k === 'battery' ? `$${it.costPer1k}/Ah` : `$${it.cost}`; return `<button data-hw="${k}" data-val="${it.id}" class="${d.hw[k] === it.id ? 'on' : ''} ${locked ? 'lock' : ''}" ${locked ? `data-req="${it.req}"` : ''}><b>${locked ? '🔒 ' : ''}${it.name}</b><small>${info}</small><em>${cost}</em></button>`; }).join('')}</div>`).join('');
    } else if (this.designTab === 'software') {
      const o = (id, name, req) => ({ id, name, req });
      p.innerHTML = `<p class="muted">The operating system is shared by all your phones. Changes show live on the 3D screen.</p>
        ${row('OS name', `<input data-str="os.name" value="${esc(os.name)}" maxlength="18">`)}
        <h3>Home screen</h3>${row('Wallpaper', this.seg('os.wallpaper', WALLPAPERS.map((w) => o(w, w)), os.wallpaper, true))}${row('Wallpaper color 1', this.colors('os.c1', os.c1))}${row('Wallpaper color 2', this.colors('os.c2', os.c2))}
        ${row('Icon shape', this.seg('os.iconShape', ['squircle', 'circle', 'square', 'teardrop', 'hex'].map((x) => o(x, x)), os.iconShape))}${row('Icon style', this.seg('os.iconStyle', ['flat', 'gradient', 'outline', 'neon', 'glass'].map((x) => o(x, x)), os.iconStyle))}
        ${row('Icon palette', this.seg('os.palette', Object.keys(PALETTES).map((x) => o(x, x)), os.palette))}${row('Grid columns', this.seg('os.cols', [o(4, '4'), o(5, '5')], os.cols))}${row('Dock', this.toggle('os.dock', os.dock))}${row('Font', this.seg('os.font', ['sans', 'rounded', 'mono', 'serif'].map((x) => o(x, x)), os.font))}
        <h3>Lock screen</h3>${row('Clock style', this.seg('os.lockClock', ['big', 'center', 'stacked', 'minimal'].map((x) => o(x, x)), os.lockClock))}${row('Widgets', this.toggle('os.widgets', os.widgets, 'r_os3'))}${row('Always-on display', this.toggle('os.aod', os.aod, 'r_dsp3'))}
        <h3>System</h3>${row('Animations', this.seg('os.animations', ['none', 'snappy', 'smooth', 'bouncy', 'cinematic'].map((x) => o(x, x)), os.animations))}${row('Dark mode', this.toggle('os.dark', os.dark))}${row('Accent color', this.colors('os.accent', os.accent))}
        ${row('Gesture navigation', this.toggle('os.gestures', os.gestures, 'r_os3'))}${row('AI assistant', this.toggle('os.assistant', os.assistant, 'r_os4'))}
        <h3>Default apps <small>(${os.apps.length} — 8–14 is ideal)</small></h3><div class="chips">${ALL_APPS.map((a) => `<button data-app="${a}" class="${os.apps.includes(a) ? 'on' : ''}">${a}</button>`).join('')}</div>
        <h3>Control center <small>(${os.control.length})</small></h3><div class="chips">${Object.keys(CONTROL_TILES).map((a) => `<button data-cc="${a}" class="${os.control.includes(a) ? 'on' : ''}">${CONTROL_TILES[a]} ${a}</button>`).join('')}</div>
        <div class="card">Software score: <b id="osScore"></b></div>`;
    } else this.summaryPanel();
    this.bindPanel(p);
  }
  summaryPanel() {
    const p = $('#dpanel'); if (!p || this.designTab !== 'summary') return; const s = this.s, d = this.design(); const st = S.computeStats(d, s);
    const lab = { performance: '⚡ Performance', battery: '🔋 Battery', camera: '📷 Camera', display: '📱 Display', design: '🎨 Design', durability: '🛡️ Durability', software: '💾 Software', features: '✨ Features', thermals: '🌡️ Thermals', storage: '💽 Storage' };
    const auds = Object.entries(AUDIENCES).map(([k, A]) => [k, A, S.fit(st.scores, k)]).sort((a, b) => b[2] - a[2]);
    p.innerHTML = `<div class="big">Overall <b>${st.overall}</b>/100</div>${Object.entries(st.scores).map(([k, v]) => `<div class="stat"><span>${lab[k]}</span>${bar(v)}<b>${Math.round(v)}</b></div>`).join('')}
      <div class="grid2 facts">${[['Battery', `${st.mAh} mAh · ${st.hours} h`], ['Peak temp', `${st.heat} °C${st.throttle < 1 ? ' (throttles!)' : ''}`], ['Charge 0→100', `${st.chargeMins} min`], ['Weight', `${st.weight} g`], ['Screen', `${st.diag}" · ${Math.round(st.s2b * 100)}% of body`], ['Water', st.ip ? 'IP68' : 'not sealed'], ['Unit cost', M(st.cost)], ['Suggested price', `${M(st.cost * 1.8)} – ${M(st.cost * 3)}`]].map(([a, b]) => `<div><small>${a}</small><b>${b}</b></div>`).join('')}</div>
      <h3>Who will love it?</h3>${auds.map(([k, A, f]) => `<div class="stat"><span>${A.icon} ${A.name} <small>(~${M(A.ideal)})</small></span>${bar(f * 100)}<b>${Math.round(f * 100)}%</b></div>`).join('')}`;
  }
  bindPanel(p) {
    const s = this.s, d = this.design();
    const setPath = (path, val) => { const [a, k] = path.split('.'); const obj = a === 'os' ? s.os : d.ext; obj[k] = val; if (a === 'ext') S.touchDesign(d); this.onDesignChange(a); };
    const lockMsg = (req) => { this.toast(`🔒 Research <b>${esc(RES[req].name)}</b> first`, 'bad'); this.G.sfx.play('bad'); };
    $$('[data-set]', p).forEach((b) => (b.onclick = () => { if (b.dataset.req) return lockMsg(b.dataset.req); const path = b.dataset.set; let v = b.dataset.val; if (path === 'os.cols') v = +v; setPath(path, v); $$(`[data-set="${path}"]`, p).forEach((x) => x.classList.toggle('on', x === b)); }));
    $$('[data-num]', p).forEach((i) => (i.oninput = () => { i.nextElementSibling.textContent = i.value; setPath(i.dataset.num, +i.value); }));
    $$('[data-color]', p).forEach((i) => (i.oninput = () => setPath(i.dataset.color, i.value)));
    $$('[data-str]', p).forEach((i) => (i.oninput = () => setPath(i.dataset.str, i.value || 'OS')));
    $$('[data-tog]', p).forEach((b) => (b.onclick = () => { if (b.dataset.req) return lockMsg(b.dataset.req); const [a, k] = b.dataset.tog.split('.'); const obj = a === 'os' ? s.os : d.ext; setPath(b.dataset.tog, !obj[k]); b.classList.toggle('on', !!obj[k]); b.textContent = obj[k] ? 'ON' : 'OFF'; }));
    $$('[data-hw]', p).forEach((b) => (b.onclick = () => { if (b.dataset.req) return lockMsg(b.dataset.req); d.hw[b.dataset.hw] = b.dataset.val; S.touchDesign(d); $$(`[data-hw="${b.dataset.hw}"]`, p).forEach((x) => x.classList.toggle('on', x === b)); this.onDesignChange('hw'); }));
    $$('[data-app]', p).forEach((b) => (b.onclick = () => { const a = b.dataset.app, L = s.os.apps; const i = L.indexOf(a); if (i >= 0) L.splice(i, 1); else L.push(a); b.classList.toggle('on'); this.onDesignChange('os'); }));
    $$('[data-cc]', p).forEach((b) => (b.onclick = () => { const a = b.dataset.cc, L = s.os.control; const i = L.indexOf(a); if (i >= 0) L.splice(i, 1); else if (L.length < 16) L.push(a); b.classList.toggle('on'); this.onDesignChange('os'); this.setScreen('control'); }));
    $$('[data-preset]', p).forEach((b) => (b.onclick = () => { applyPreset(d, b.dataset.preset); S.touchDesign(d); this.viewer.fitted = false; this.go('design'); }));
    const osS = $('#osScore', p); if (osS) osS.textContent = S.osScore(s.os, s, S.hwItem('cpu', d.hw.cpu)) + '/100';
  }
  onDesignChange(kind) {
    clearTimeout(this._dc); this._dc = setTimeout(() => { this.refreshViewer(); if (kind === 'os') { const o = $('#osScore'); if (o) o.textContent = S.osScore(this.s.os, this.s, S.hwItem('cpu', this.design().hw.cpu)) + '/100'; if (this.viewer.screen === 'lock' && this._lastKind !== 'os') this.setScreen('home'); } this._lastKind = kind; }, 60);
  }

  // ================= LAB =================
  s_lab(el) {
    const s = this.s; const ds = s.designs; const d = this.design();
    el.innerHTML = `<h1>Testing Lab</h1><div class="seg">${ds.map((x) => `<button data-ld="${x.id}" class="${x.id === d.id ? 'on' : ''}">${esc(x.name)}</button>`).join('')}</div><div id="labbody"></div>`;
    $$('[data-ld]').forEach((b) => (b.onclick = () => { this.selDesign = +b.dataset.ld; this.go('lab'); }));
    this.labBody();
  }
  labBody() {
    const s = this.s, d = this.design(); const box = $('#labbody'); const ok = d.prototype && d.protoRev === d.rev;
    if (!ok) { box.innerHTML = `<div class="card"><h2>No prototype yet</h2><p>${d.prototype ? 'The design changed after the last prototype.' : 'Build a prototype of this design first.'}</p><button class="pri" id="goD">✏️ Go to Design</button></div>`; $('#goD').onclick = () => this.go('design'); return; }
    const done = TESTS.filter((t) => d.tests[t.id]).length;
    box.innerHTML = `<div class="card"><p>Each test costs <b>${M(S.testCost(s))}</b>. All 8 tests are required before production. Failed tests become permanent flaws customers will notice — or go back and improve the design.</p>
      <div class="prog2">${bar((done / 8) * 100, '#4cc9f0')} ${done}/8 tests done</div><button class="pri" id="runAll">▶ Run all remaining tests</button></div>
      <div class="tests">${TESTS.map((t) => { const r = d.tests[t.id]; return `<div class="test ${r ? (r.pass ? 'pass' : 'fail') : ''}" id="t_${t.id}"><div class="ti">${t.icon}</div><div class="tb"><b>${t.name} test</b><small>${r ? esc(r.detail) : 'Not run yet'}</small><div class="tp"><i></i></div></div><div class="tr">${r ? (r.pass ? '✅ PASS' : '❌ FAIL') : `<button data-test="${t.id}">Run</button>`}</div></div>`; }).join('')}</div>
      <div class="card"><h3>🐞 Defects found by testers</h3>${d.found.length ? d.found.map((f) => `<span class="pill bad">${f}</span>`).join(' ') + `<p>Engineers can fix these for ${M(S.fixCost(d))}.</p><button id="fix" class="pri">🛠 Fix defects</button>` : '<p class="muted">None found (that doesn\'t mean there are none… more testers = better detection).</p>'}</div>
      ${S.allTested(d) ? `<div class="card good">✅ <b>${esc(d.name)}</b> is ready for production. Flaws carried into production: ${S.productFlags(d).filter((f) => !d.hidden.includes(f) || d.found.includes(f)).join(', ') || 'none'}.<br><button class="pri" id="toF">🏭 Go to Factory</button></div>` : ''}`;
    $$('[data-test]').forEach((b) => (b.onclick = () => this.runTest(d, b.dataset.test)));
    $('#runAll').onclick = async () => { for (const t of TESTS) if (!d.tests[t.id]) { const ok2 = await this.runTest(d, t.id, true); if (!ok2) break; } this.labBody(); };
    const fx = $('#fix'); if (fx) fx.onclick = () => { if (this.err(S.fixDefects(s, d))) return; this.G.sfx.play('good'); this.labBody(); };
    const tf = $('#toF'); if (tf) tf.onclick = () => this.go('factory');
  }
  runTest(d, id, chain) {
    return new Promise((res) => {
      const card = $('#t_' + id); if (!card) return res(false); const btn = card.querySelector('button'); if (btn) btn.disabled = true; const bar2 = card.querySelector('.tp i'); let k = 0;
      card.classList.add('running'); const iv = setInterval(() => { k += 0.05; bar2.style.width = Math.min(100, k * 100) + '%'; if (Math.random() < 0.3) this.G.sfx.play('test'); if (k >= 1) { clearInterval(iv); const r = S.runTest(this.s, d, id); if (r.err) { this.err(r.err); res(false); return; } this.G.sfx.play(r.pass ? 'pass' : 'fail'); if (r.found) this.toast(`🐞 Testers found a hidden defect: <b>${r.found}</b>`, 'bad'); if (!chain) this.labBody(); else { card.classList.remove('running'); card.classList.add(r.pass ? 'pass' : 'fail'); card.querySelector('small').textContent = r.detail; card.querySelector('.tr').innerHTML = r.pass ? '✅ PASS' : '❌ FAIL'; } this.G.afterAction(); res(true); } }, 45);
    });
  }

  // ================= FACTORY =================
  s_factory(el) {
    const s = this.s; const ready = s.designs.filter((d) => S.allTested(d) || S.sandbox(s));
    el.innerHTML = `<h1>Factory</h1><div class="card fcv"><canvas id="fcanvas"></canvas></div>
      <div class="cols"><div class="card"><h3>📦 Production order</h3>${ready.length ? `<div class="row"><label>Model</label><select id="oD">${ready.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div>
        <div class="row"><label>Quantity</label><div class="seg sm">${[50, 100, 500, 1000, 5000, 20000, 100000].map((q) => `<button data-q="${q}">${N(q)}</button>`).join('')}</div><input id="oQ" type="number" value="100" min="1"></div><div id="oInfo" class="muted"></div><button class="pri" id="oGo">Order components</button>` : '<p>No tested design yet. Build a prototype and run all tests in the Lab.</p>'}</div>
      <div class="card"><h3>📊 Line status</h3><div id="fstat"></div></div></div>
      <div class="card"><h3>🏭 Your factories</h3><div id="flist"></div></div>
      <div class="card"><h3>🏗️ Build a new factory</h3><div class="bf">${FACTORIES.filter((f) => f.cost > 0).map((f) => { const locked = f.req && !S.has(s, f.req); return `<button data-bf="${f.id}" ${locked ? 'class="lock"' : ''}><span>${f.icon}</span><b>${f.name}</b><small>${f.base}/day per stage · needs ${f.workers} workers · upkeep ${M(f.upkeep)}/mo</small><em>${locked ? '🔒 ' + RES[f.req].name : M(f.cost)}</em></button>`; }).join('')}</div></div>
      <div class="card"><h3>📦 Inventory</h3><div id="inv"></div></div>`;
    this.fview = new FactoryView($('#fcanvas'), this.G);
    const oq = $('#oQ'), od = $('#oD');
    const info = () => { if (!od) return; const d = s.designs.find((x) => x.id === +od.value); const q = Math.max(1, +oq.value | 0); $('#oInfo').innerHTML = `Unit cost ${M(S.unitCost(s, d))} · total <b>${M(S.orderCost(s, d, q))}</b>${q >= 1000 ? ' (bulk discount)' : ''} · ≈${Math.ceil(q / Math.max(1, S.factoryRate(s).cap))} days at full capacity`; };
    if (od) { od.onchange = info; oq.oninput = info; $$('[data-q]').forEach((b) => (b.onclick = () => { oq.value = b.dataset.q; info(); })); info();
      $('#oGo').onclick = () => { const d = s.designs.find((x) => x.id === +od.value); if (this.err(S.placeOrder(s, d, +oq.value))) return; this.G.sfx.play('cash'); this.toast(`📦 Components for <b>${N(+oq.value)}× ${esc(d.name)}</b> ordered`); this.G.afterAction(); info(); }; }
    $$('[data-bf]').forEach((b) => (b.onclick = () => { if (this.err(S.buildFactory(s, b.dataset.bf))) return; this.G.sfx.play('cash'); this.G.afterAction(); this.go('factory'); }));
    this.factoryList();
  }
  factoryList() {
    const s = this.s; $('#flist').innerHTML = s.factories.map((f, fi) => { const F = FACTORIES.find((x) => x.id === f.type); return `<div class="fac"><b>${F.icon} ${F.name}</b><div class="st">${STAGES.map((n, i) => `<button data-up="${fi},${i}" title="${n}">${STAGE_ICON[i]}<small>Lv ${f.stations[i]}</small><em>${f.stations[i] >= 5 ? 'MAX' : '⬆ ' + M(S.upgradeCost(s, fi, i))}</em></button>`).join('')}</div></div>`; }).join('');
    $$('[data-up]').forEach((b) => (b.onclick = () => { const [fi, st] = b.dataset.up.split(',').map(Number); if (this.err(S.upgradeStation(s, fi, st))) return; this.G.sfx.play('cash'); this.factoryList(); }));
  }
  l_factory() {
    const s = this.s; const fr = S.factoryRate(s); const q = S.inPipeline(s); const ordered = s.orders.reduce((a, o) => a + o.qty, 0);
    $('#fstat').innerHTML = `<div class="grid2 facts"><div><small>Bottleneck capacity</small><b>${N(fr.cap)}/day</b></div><div><small>Workers</small><b class="${fr.staff < 1 ? 'neg' : ''}">${fr.workers}/${fr.need} (${Math.round(fr.staff * 100)}%)</b></div><div><small>Components in transit</small><b>${N(ordered)}</b></div><div><small>On the line</small><b>${N(q.reduce((a, b) => a + b, 0))}</b></div><div><small>Produced (all time)</small><b>${N(s.stats.produced)}</b></div><div><small>QC rejects</small><b>${N(s.qcRejected)}</b></div></div>${fr.staff < 0.9 ? '<p class="neg">⚠️ Understaffed! Hire factory workers in Company.</p>' : ''}${s.effects.some((e) => e.type === 'accident') ? '<p class="neg">🔥 Accident: production slowed!</p>' : ''}`;
    $('#inv').innerHTML = s.designs.filter((d) => s.inventory[d.id] > 0.5 || s.pipeline.some((st) => st.some((c) => c.d === d.id))).map((d) => `<div class="stat"><span>${esc(d.name)}</span><b>${N(s.inventory[d.id] || 0)} ready</b></div>`).join('') || '<p class="muted">Warehouse is empty.</p>';
  }

  // ================= RESEARCH =================
  s_research(el) {
    const s = this.s; const cats = [...new Set(RESEARCH.map((r) => r.cat))];
    el.innerHTML = `<h1>Research & Development</h1><div class="card"><div id="rcur"></div></div>${cats.map((c) => `<h3>${c}</h3><div class="rgrid">${RESEARCH.filter((r) => r.cat === c).map((r) => { const done = s.researched[r.id] || S.sandbox(s), avail = S.canResearch(s, r.id), cur = s.researching === r.id; return `<button data-rs="${r.id}" class="rc ${done ? 'done' : cur ? 'cur' : avail ? 'av' : 'lock'}"><b>${done ? '✅ ' : cur ? '⏳ ' : avail ? '' : '🔒 '}${r.name}</b><small>${r.rp} RP · ${M(r.cost)}</small>${!done && !avail ? `<em>needs ${r.pre.filter((p) => !s.researched[p]).map((p) => RES[p].name).join(', ')}</em>` : ''}</button>`; }).join('')}</div>`).join('')}`;
    $$('[data-rs]').forEach((b) => (b.onclick = () => { const id = b.dataset.rs; if (s.researched[id]) return; if (s.researching && s.researching !== id) { this.modal(`<h2>Switch research?</h2><p>Progress on <b>${RES[s.researching].name}</b> will be lost (money is not refunded).</p>`, [['Switch', () => this.startRes(id)], ['Cancel', null]]); return; } this.startRes(id); }));
  }
  startRes(id) { if (this.err(S.startResearch(this.s, id))) return; this.G.sfx.play('cash'); this.go('research'); }
  l_research() { const s = this.s; const r = s.researching && RES[s.researching]; $('#rcur').innerHTML = r ? `<b>⏳ ${r.name}</b> ${bar((s.rp / r.rp) * 100, '#4cc9f0')} ${Math.floor(s.rp)}/${r.rp} RP · ${S.rpPerDay(s).toFixed(1)} RP/day · ≈${Math.ceil((r.rp - s.rp) / S.rpPerDay(s))} days` : `No active research. You generate <b>${S.rpPerDay(s).toFixed(1)} RP/day</b> — hire researchers to go faster.`; }

  // ================= MARKETING =================
  s_marketing(el) {
    const s = this.s; const launchable = s.designs.filter((d) => (S.allTested(d) || S.sandbox(s)) && !s.products.some((p) => p.d === d.id && p.status !== 'retired'));
    const live = s.products.filter((p) => p.status !== 'retired');
    el.innerHTML = `<h1>Marketing & Launch</h1>
      <div class="card"><h2>🚀 Plan a launch</h2>${launchable.length ? `<div class="row"><label>Phone</label><select id="lD">${launchable.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></div><div id="lform"></div>` : '<p>No phone is ready to launch. A phone must be designed, prototyped and fully tested.</p>'}</div>
      <div class="card"><h2>📺 Running campaigns</h2>${live.length ? live.map((p) => `<div class="prod"><b>${esc(p.name)}</b> <span class="pill">${p.status}</span> ${M(p.price)} · hype ${Object.entries(p.hype).map(([a, v]) => `${AUDIENCES[a].icon}${v.toFixed(1)}`).join(' ')}<div class="seg sm"><button data-ad="${p.id}">📣 New ad</button><button data-pr="${p.id}">💲 Price</button>${p.status === 'onsale' ? `<button data-rt="${p.id}">Retire</button>` : ''}</div></div>`).join('') : '<p class="muted">Nothing on the market yet.</p>'}</div>`;
    if (launchable.length) { const sel = $('#lD'); sel.onchange = () => this.launchForm(+sel.value); this.launchForm(+sel.value); }
    $$('[data-ad]').forEach((b) => (b.onclick = () => this.adModal(s.products.find((p) => p.id === +b.dataset.ad))));
    $$('[data-pr]').forEach((b) => (b.onclick = () => { const p = s.products.find((x) => x.id === +b.dataset.pr); this.modal(`<h2>Price of ${esc(p.name)}</h2><input id="np" type="number" value="${p.price}"> <p class="muted">Unit cost ${M(p.stats.cost)}</p>`, [['Set price', (m) => { S.setPrice(p, +$('#np', m).value); this.go('marketing'); }], ['Cancel', null]]); }));
    $$('[data-rt]').forEach((b) => (b.onclick = () => { S.retire(s, s.products.find((x) => x.id === +b.dataset.rt)); this.go('marketing'); }));
  }
  launchForm(did) {
    const s = this.s, d = s.designs.find((x) => x.id === did); const st = S.computeStats(d, s); const best = S.bestAudience(st.scores, st.cost * 2.2);
    const f = this.lf = this.lf && this.lf.d === did ? this.lf : { d: did, price: Math.round(st.cost * 2.2 / 10) * 10 - 1, audience: best, style: 'funny', budget: 5000, promote: [], regions: ['home'], delay: 0 };
    const box = $('#lform');
    box.innerHTML = `<div class="row"><label>Price <small>(unit cost ${M(st.cost)})</small></label><div class="sl"><input type="range" id="lP" min="${Math.max(9, Math.round(st.cost * 0.8))}" max="${Math.max(300, Math.round(st.cost * 6))}" step="1" value="${f.price}"><output>${M(f.price)}</output></div></div>
      <div class="row"><label>Target audience</label><div class="seg">${Object.entries(AUDIENCES).map(([k, A]) => `<button data-la="${k}" class="${f.audience === k ? 'on' : ''}">${A.icon} ${A.name} <small>${Math.round(S.fit(st.scores, k) * 100)}%</small></button>`).join('')}</div></div>
      <div class="row"><label>Ad style</label><div class="seg">${Object.entries(AD_STYLES).map(([k, A]) => `<button data-ls="${k}" class="${f.style === k ? 'on' : ''}">${A.icon} ${A.name}</button>`).join('')}</div></div>
      <div class="row"><label>Ad budget</label><div class="seg sm">${[0, 2000, 5000, 20000, 100000, 500000, 2000000].map((b) => `<button data-lb="${b}" class="${f.budget === b ? 'on' : ''}">${M(b)}</button>`).join('')}</div></div>
      <div class="row"><label>Promote (max 3)</label><div class="chips">${Object.entries(PROMOTE).map(([k, l]) => { const v = k === 'price' ? 0 : st.scores[k]; return `<button data-lp="${k}" class="${f.promote.includes(k) ? 'on' : ''}">${l}${k !== 'price' ? ` <small style="color:${v >= 70 ? '#06d6a0' : v >= 40 ? '#ffd166' : '#ff3d71'}">${Math.round(v)}</small>` : ''}</button>`; }).join('')}</div></div>
      <div class="row"><label>Regions</label><div class="chips">${REGIONS.map((r) => `<button data-lr="${r.id}" class="${f.regions.includes(r.id) ? 'on' : ''} ${s.regions[r.id] ? '' : 'lock'}">${r.flag} ${r.name}${s.regions[r.id] ? '' : ' 🔒'}</button>`).join('')}</div></div>
      <div class="row"><label>Launch date</label><div class="seg sm">${[0, 7, 14, 30].map((x) => `<button data-ld2="${x}" class="${f.delay === x ? 'on' : ''}">${x ? 'in ' + x + ' days' : 'Today'}</button>`).join('')}</div></div>
      <div id="lpred" class="card inner"></div><button class="pri big" id="lGo">🚀 LAUNCH</button>`;
    const pred = () => { const A = AUDIENCES[f.audience]; const u = S.utility(st.scores, f.price, f.audience, s.rep, 0, 3.5, 0); const margin = f.price * 0.85 - st.cost; const reaction = u > 2.2 ? '🤩 They will LOVE it' : u > 1.6 ? '🙂 Solid interest' : u > 1.0 ? '😐 Lukewarm' : '😬 Hard sell'; const fake = f.promote.filter((k) => k !== 'price' && st.scores[k] < 40); $('#lpred').innerHTML = `<b>${A.icon} ${A.name}</b> reaction: ${reaction} · margin per phone <b class="${margin < 0 ? 'neg' : ''}">${M(margin)}</b> (after 15% retail cut) · ad cost ${M(S.adCost(f.style, f.budget))} · stock ${N(s.inventory[d.id] || 0)}${fake.length ? `<br><span class="neg">⚠️ Promoting weak features (${fake.join(', ')}) will cause "false advertising" reviews.</span>` : ''}${!(s.inventory[d.id] > 0) ? '<br><span class="neg">⚠️ No phones in stock yet — buyers will wait, then lose interest.</span>' : ''}`; };
    const rerender = () => this.launchForm(did);
    $('#lP').oninput = (e) => { f.price = +e.target.value; e.target.nextElementSibling.textContent = M(f.price); pred(); };
    $$('[data-la]').forEach((b) => (b.onclick = () => { f.audience = b.dataset.la; rerender(); }));
    $$('[data-ls]').forEach((b) => (b.onclick = () => { f.style = b.dataset.ls; rerender(); }));
    $$('[data-lb]').forEach((b) => (b.onclick = () => { f.budget = +b.dataset.lb; rerender(); }));
    $$('[data-lp]').forEach((b) => (b.onclick = () => { const k = b.dataset.lp, i = f.promote.indexOf(k); if (i >= 0) f.promote.splice(i, 1); else if (f.promote.length < 3) f.promote.push(k); rerender(); }));
    $$('[data-lr]').forEach((b) => (b.onclick = () => { const r = b.dataset.lr; if (!s.regions[r]) return this.toast('🔒 Unlock this region in Market first', 'bad'); const i = f.regions.indexOf(r); if (i >= 0) f.regions.splice(i, 1); else f.regions.push(r); rerender(); }));
    $$('[data-ld2]').forEach((b) => (b.onclick = () => { f.delay = +b.dataset.ld2; rerender(); }));
    pred();
    $('#lGo').onclick = () => { if (this.err(S.launchProduct(s, d, f))) return; this.G.sfx.play('fanfare'); this.lf = null; this.G.afterAction(); this.go('market'); };
  }
  adModal(p) {
    const st = { style: 'funny', budget: 5000, aud: p.audience };
    const html = () => `<h2>📣 New ad for ${esc(p.name)}</h2><div class="row"><label>Style</label><div class="seg sm">${Object.entries(AD_STYLES).map(([k, A]) => `<button data-as="${k}" class="${st.style === k ? 'on' : ''}">${A.icon} ${A.name}</button>`).join('')}</div></div><div class="row"><label>Audience</label><div class="seg sm">${Object.entries(AUDIENCES).map(([k, A]) => `<button data-aa="${k}" class="${st.aud === k ? 'on' : ''}">${A.icon} ${A.name}</button>`).join('')}</div></div><div class="row"><label>Budget</label><div class="seg sm">${[2000, 5000, 20000, 100000, 500000, 2000000].map((b) => `<button data-ab="${b}" class="${st.budget === b ? 'on' : ''}">${M(b)}</button>`).join('')}</div></div><p>Cost: <b>${M(S.adCost(st.style, st.budget))}</b></p>`;
    this.modal(`<div id="adm">${html()}</div>`, [['Run ad', () => { if (this.err(S.runAd(this.s, p, st.style, st.budget, st.aud))) return; this.G.sfx.play('cash'); this.go('marketing'); }], ['Cancel', null]]);
    const bind = () => { const m = $('#adm'); $$('[data-as]', m).forEach((b) => (b.onclick = () => { st.style = b.dataset.as; m.innerHTML = html(); bind(); })); $$('[data-aa]', m).forEach((b) => (b.onclick = () => { st.aud = b.dataset.aa; m.innerHTML = html(); bind(); })); $$('[data-ab]', m).forEach((b) => (b.onclick = () => { st.budget = +b.dataset.ab; m.innerHTML = html(); bind(); })); };
    bind();
  }

  // ================= MARKET =================
  s_market(el) {
    const s = this.s;
    el.innerHTML = `<h1>Market & Sales</h1><div class="card"><h3>Your phones</h3><div id="ptable"></div></div>
      <div class="cols"><div class="card"><h3>Market share (30 days)</h3><div id="mshare"></div></div><div class="card"><h3>Rival phones</h3><div id="rivals"></div></div></div>
      <div class="card"><h3>🌍 Regions</h3><div class="regions">${REGIONS.map((r) => `<div class="reg ${s.regions[r.id] ? 'on' : ''}"><b>${r.flag} ${r.name}</b><small>~${N(r.daily)} buyers/day</small>${s.regions[r.id] ? '<em>✅ unlocked</em>' : `<button data-rg="${r.id}">${r.global && !S.has(s, 'r_global') ? '🔒 needs Global logistics' : 'Unlock ' + M(r.cost)}</button>`}</div>`).join('')}</div>
        <p class="muted">New regions apply to launches from now on. To sell an existing phone abroad, launch a new model there.</p></div>
      <div class="card"><h3>⭐ Customer reviews</h3><div id="reviews"></div></div>`;
    $$('[data-rg]').forEach((b) => (b.onclick = () => { if (this.err(S.unlockRegion(s, b.dataset.rg))) return; this.G.sfx.play('good'); this.go('market'); }));
  }
  l_market() {
    const s = this.s; const ps = s.products;
    $('#ptable').innerHTML = ps.length ? `<div class="tbl"><div class="th"><span>Phone</span><span>Price</span><span>Sold</span><span>7 days</span><span>Stock</span><span>Rating</span><span>Revenue</span></div>${ps.map((p) => `<div class="tr2 ${this.selProduct === p.id ? 'sel' : ''}" data-ps="${p.id}"><span><b>${esc(p.name)}</b> <small class="pill">${p.status === 'onsale' && p.soldOut ? 'SOLD OUT' : p.status}</small></span><span>${M(p.price)}</span><span>${N(p.sold)}</span><span>${N(p.daily.slice(-7).reduce((a, b) => a + b, 0))}</span><span>${N(s.inventory[p.d] || 0)}</span><span>${p.nReviews ? `${p.rating.toFixed(1)}★ (${p.nReviews})` : '—'}</span><span>${M(p.revenue)}</span></div>`).join('')}</div>` : '<p class="muted">No phones launched yet.</p>';
    $$('[data-ps]').forEach((r) => (r.onclick = () => { this.selProduct = +r.dataset.ps; this.l_market(); }));
    $('#mshare').innerHTML = (s.share || S.marketShare(s)).map((r) => `<div class="sh ${r.me ? 'me' : ''}"><span>${esc(r.name)}</span>${bar(r.pct, r.color)}<b>${r.pct.toFixed(1)}%</b></div>`).join('');
    $('#rivals').innerHTML = s.rivals.map((r) => r.phones.map((ph) => `<div class="riv"><i style="background:${r.color}"></i><b>${esc(ph.name)}</b> <small>${esc(r.name)}</small><span>score ${ph.overall} · ${M(ph.price)} · ${N(ph.daily.slice(-7).reduce((a, b) => a + b, 0))}/wk</span></div>`).join('')).join('');
    const p = ps.find((x) => x.id === this.selProduct) || ps[ps.length - 1];
    $('#reviews').innerHTML = p ? `<p><b>${esc(p.name)}</b> ${p.nReviews ? `${stars(p.rating)} ${p.rating.toFixed(2)} from ${p.nReviews} reviews` : 'no reviews yet'}</p>` + (p.reviews.slice(0, 14).map((r) => `<div class="rev"><span class="st">${stars(r.stars)}</span> “${esc(r.text)}” <small>— ${esc(r.who)} ${AUDIENCES[r.aud].icon}</small></div>`).join('') || '') : '<p class="muted">Reviews appear after launch.</p>';
  }

  // ================= COMPANY =================
  s_company(el) {
    const s = this.s; const L = s.company.logo; const byRole = (r) => s.employees.filter((e) => e.role === r);
    const payroll = s.employees.reduce((a, e) => a + e.salary, 0);
    el.innerHTML = `<h1>Company</h1><div class="cols"><div class="card"><h3>Brand</h3><div class="row"><label>Company name</label><input id="cn" value="${esc(s.company.name)}" maxlength="24"></div>
        <div class="logoed"><canvas id="logo" width="160" height="160"></canvas><div>
          <div class="row"><label>Shape</label>${this.lseg('shape', ['circle', 'square', 'shield', 'hex', 'diamond', 'none'], L.shape)}</div>
          <div class="row"><label>Font</label>${this.lseg('font', ['bold', 'serif', 'round', 'thin', 'mono'], L.font)}</div>
          <div class="row"><label>Background</label><div class="sw">${COLORS.map((c) => `<button data-lc="bg" data-val="${c}" style="background:${c}" class="${L.bg === c ? 'on' : ''}"></button>`).join('')}</div></div>
          <div class="row"><label>Symbol color</label><div class="sw">${COLORS.map((c) => `<button data-lc="fg" data-val="${c}" style="background:${c}" class="${L.fg === c ? 'on' : ''}"></button>`).join('')}</div></div>
          <div class="row"><label>Symbol</label><div class="glyphs">${LOGO_GLYPHS.map((g) => `<button data-lg="${g}" class="${L.glyph === g ? 'on' : ''}">${g}</button>`).join('')}<input id="lgT" maxlength="2" placeholder="Aa" value=""></div></div></div></div></div>
      <div class="card"><h3>Team <small>payroll ${M(payroll)}/month</small></h3>${Object.entries(ROLES).map(([k, R]) => `<div class="role"><b>${R.icon} ${R.name}s: ${byRole(k).length}</b><small>${R.desc}</small><div class="seg sm"><button data-hb="${k},1">+1</button><button data-hb="${k},5">+5</button><button data-hb="${k},20">+20</button>${byRole(k).some((e) => !e.founder) ? `<button data-fb="${k}">−1</button>` : ''}</div></div>`).join('')}
        <p class="muted">Hiring pays a signing bonus of half a monthly salary. Salaries are paid every 30 days.</p></div></div>
      <div class="card"><h3>⭐ Recommended candidates <small>(refreshes monthly)</small></h3><div class="cands">${s.candidates.map((c, i) => `<div class="cand"><b>${esc(c.name)}</b><small>${ROLES[c.role].icon} ${ROLES[c.role].name} · ${'★'.repeat(c.skill)}${'☆'.repeat(5 - c.skill)}</small><em>${M(c.salary)}/mo</em><button data-hc="${i}">Hire</button></div>`).join('')}</div></div>
      <div class="card"><h3>Staff list</h3><div class="staff">${s.employees.slice(0, 120).map((e) => `<span>${ROLES[e.role].icon} ${esc(e.name)} ${'★'.repeat(e.skill)}</span>`).join('')}${s.employees.length > 120 ? `<span>…and ${s.employees.length - 120} more</span>` : ''}</div></div>`;
    drawLogo($('#logo'), L);
    $('#cn').oninput = (e) => { s.company.name = e.target.value || 'Company'; this.header(); };
    const upd = () => { drawLogo($('#logo'), L); this.header(); if (this.viewer) this.viewer.fitted = true; };
    $$('[data-lk]').forEach((b) => (b.onclick = () => { L[b.dataset.lk] = b.dataset.val; $$(`[data-lk="${b.dataset.lk}"]`).forEach((x) => x.classList.toggle('on', x === b)); upd(); }));
    $$('[data-lc]').forEach((b) => (b.onclick = () => { L[b.dataset.lc] = b.dataset.val; $$(`[data-lc="${b.dataset.lc}"]`).forEach((x) => x.classList.toggle('on', x === b)); upd(); }));
    $$('[data-lg]').forEach((b) => (b.onclick = () => { L.glyph = b.dataset.lg; $$('[data-lg]').forEach((x) => x.classList.toggle('on', x === b)); upd(); }));
    $('#lgT').oninput = (e) => { if (e.target.value) { L.glyph = e.target.value; upd(); } };
    $$('[data-hb]').forEach((b) => (b.onclick = () => { const [r, n] = b.dataset.hb.split(','); const k = S.hireBulk(s, r, +n); if (k < +n) this.err(k ? `Only hired ${k} — out of money` : 'Not enough money'); else this.G.sfx.play('cash'); this.go('company'); }));
    $$('[data-fb]').forEach((b) => (b.onclick = () => { const e = s.employees.filter((x) => x.role === b.dataset.fb && !x.founder).pop(); if (e) S.fire(s, e.id); this.go('company'); }));
    $$('[data-hc]').forEach((b) => (b.onclick = () => { const c = s.candidates[+b.dataset.hc]; if (this.err(S.hire(s, c))) return; s.candidates.splice(+b.dataset.hc, 1); this.G.sfx.play('cash'); this.go('company'); }));
  }
  lseg(k, opts, val) { return `<div class="seg sm">${opts.map((o) => `<button data-lk="${k}" data-val="${o}" class="${val === o ? 'on' : ''}">${o}</button>`).join('')}</div>`; }

  // ================= MISSIONS =================
  s_missions(el) {
    const s = this.s; const cur = S.currentMission(s);
    el.innerHTML = `<h1>Campaign</h1>${S.sandbox(s) ? '<div class="card sandbox">Sandbox mode has no missions. Have fun!</div>' : ''}${S.MISSIONS.map((m, i) => { const done = s.missions.done.includes(m.id), now = cur === m; return `<div class="card mis ${done ? 'done' : now ? 'now' : 'lock'}"><div class="mk">MISSION ${i + 1}</div><h2>${done ? '✅' : now ? '🎯' : '🔒'} ${m.title}</h2><p>${m.desc}</p>${now ? `<p class="hint">💡 ${m.hint}</p>${m.progress ? `<p>Progress: ${m.progress(s)}</p>` : ''}` : ''}<small>Reward ${M(m.reward)}</small></div>`; }).join('')}
      <div class="card">${localStorage.getItem('pf_sandbox') ? '🏖️ Sandbox mode is unlocked (title screen).' : '🔒 Complete all 7 missions to unlock Sandbox mode.'}</div>`;
  }

  // ================= MENU =================
  s_menu(el) {
    const slots = [1, 2, 3].map((i) => { const inf = this.G.slotInfo(i); return `<div class="slot"><b>Slot ${i}</b><small>${inf ? `${esc(inf.name)} · ${S.dateOf(inf.day)} · ${M(inf.money)}` : 'empty'}</small><button data-sv="${i}">Save</button><button data-lo="${i}" ${inf ? '' : 'disabled'}>Load</button></div>`; }).join('');
    const auto = this.G.slotInfo(0);
    el.innerHTML = `<h1>Menu</h1><div class="card"><h3>💾 Save & load</h3>${slots}<div class="slot"><b>Autosave</b><small>${auto ? `${esc(auto.name)} · ${S.dateOf(auto.day)}` : '—'}</small><button data-lo="0" ${auto ? '' : 'disabled'}>Load</button></div></div>
      <div class="card"><h3>⚙️ Settings</h3><div class="row"><label>Sound</label><button class="tg ${this.G.sfx.on ? 'on' : ''}" id="snd">${this.G.sfx.on ? 'ON' : 'OFF'}</button></div><div class="row"><label>Day length</label><div class="seg sm">${[[2.5, 'Slow'], [1.5, 'Normal'], [0.8, 'Fast']].map(([v, l]) => `<button data-dl="${v}" class="${this.G.dayLen === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
      <div class="card"><h3>How to play</h3><ol class="howto"><li><b>Design</b> a phone: exterior, hardware and your own OS.</li><li><b>Build a prototype</b> and run all 8 tests in the <b>Lab</b>.</li><li><b>Order production</b> in the <b>Factory</b> and watch phones flow down the line.</li><li><b>Launch</b> it in <b>Marketing</b>: price, audience, ad style, features, regions.</li><li>Watch <b>Market</b> sales and reviews. Hire staff, research new tech, build bigger factories.</li></ol></div>
      <button class="danger" id="quit">⏏ Save & quit to title</button>`;
    $$('[data-sv]').forEach((b) => (b.onclick = () => { this.G.save(+b.dataset.sv); this.toast('💾 Saved to slot ' + b.dataset.sv, 'good'); this.go('menu'); }));
    $$('[data-lo]').forEach((b) => (b.onclick = () => this.G.load(+b.dataset.lo)));
    $('#snd').onclick = () => { this.G.sfx.on = !this.G.sfx.on; this.go('menu'); };
    $$('[data-dl]').forEach((b) => (b.onclick = () => { this.G.dayLen = +b.dataset.dl; this.go('menu'); }));
    $('#quit').onclick = () => { this.G.save(0); location.reload(); };
  }
}

export function applyPreset(d, name) {
  const e = d.ext; const top = { cpu: 'cpu8', ram: 'ram7', storage: 'st9', battery: 'bat6', display: 'dsp7', camera: 'cam7', speaker: 'spk4', cooling: 'cool5', modem: 'mod6', charging: 'chg6' };
  Object.assign(e, { fold: 'none' });
  switch (name) {
    case 'Giant': Object.assign(e, { w: 300, h: 400, t: 25, r: 40, bezel: 12, camCount: 4, camLayout: 'square', camSize: 2.5 }); d.name = 'MEGA Phone'; break;
    case 'Tiny': Object.assign(e, { w: 22, h: 42, t: 9, r: 6, bezel: 2, camCount: 1, camSize: 0.6 }); d.name = 'Nano'; break;
    case 'Gaming': Object.assign(e, { w: 78, h: 172, t: 12, r: 6, frame: 'aluminum', back: 'transparent', color: '#39ff14', frameColor: '#111111', accent: '#ff00e6', actionKey: true, speakers: 'quad', camCount: 3, camLayout: 'vertical' }); Object.assign(d.hw, top, { cooling: 'cool4' }); d.name = 'RAGE X'; break;
    case 'Foldable': Object.assign(e, { fold: 'book', w: 72, h: 155, t: 7, frame: 'titanium', back: 'matte', shape: 'punch', bezel: 1.5, camCount: 3, camLayout: 'vertical' }); d.name = 'Fold Ultra'; break;
    case 'Transparent': Object.assign(e, { back: 'transparent', frame: 'steel', color: '#9bf6ff', frameColor: '#dddddd', wireless: true }); d.name = 'Glass'; break;
    case '20 cameras': Object.assign(e, { camCount: 20, camLayout: 'grid', camSize: 0.75, flash: 'ring' }); d.name = 'Paparazzi 20'; break;
    case 'Futuristic': Object.assign(e, { w: 74, h: 160, t: 6.5, r: 14, bezel: 0.5, shape: 'none', frame: 'ceramic', back: 'sapphire', color: '#e0aaff', frameColor: '#f8f9fa', camCount: 5, camLayout: 'circle', port: 'none', wireless: true, fingerprint: 'under', face: '3d', ip: true, speakers: 'quad', flash: 'ring' }); Object.assign(d.hw, top); d.name = 'Ω Infinity'; break;
  }
}
