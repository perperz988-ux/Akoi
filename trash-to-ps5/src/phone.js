// The in-game smartphone.
import { CONTACTS, MISSIONS, ITEMS, callLine } from './story.js';
import { BOUNDS, LOCATIONS, ZONES } from './world.js';
import { fmtTime, clamp } from './rng.js';
import * as Save from './save.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const APPS = [
  ['messages', 'Messages', '💬', '#34c759'], ['contacts', 'Contacts', '👤', '#8e8e93'], ['map', 'Map', '🗺️', '#0a84ff'], ['camera', 'Camera', '📷', '#3a3a3c'],
  ['gallery', 'Gallery', '🖼️', '#ff9f0a'], ['missions', 'Missions', '🎯', '#ff375f'], ['notes', 'Notes', '📝', '#ffd60a'], ['scanner', 'Junk Scanner', '📡', '#30d158'],
  ['bag', 'Backpack', '🎒', '#a2845e'], ['settings', 'Settings', '⚙️', '#636366'],
];

export class Phone {
  constructor(G) {
    this.G = G; this.el = document.getElementById('phone'); this.app = null; this.sub = null; this.map = { zoom: 1, cx: 0, cz: 0 };
  }
  get isOpen() { return !this.el.classList.contains('hidden'); }
  open(app = null) {
    const G = this.G; if (G.state !== 'play' || G.cine.active) return;
    if (G.mode !== 'walk') G.setMode('walk');
    G.modal = 'phone'; document.exitPointerLock?.(); this.el.classList.remove('hidden'); this.el.classList.add('up'); G.sfx('click');
    this.app = app; this.sub = null; if (app === 'map') this.centerMap(); this.render();
  }
  close() { this.el.classList.add('hidden'); this.el.classList.remove('up'); this.G.modal = null; this.app = null; this.sub = null; this.el.innerHTML = ''; }
  back() { if (this.sub != null) { this.sub = null; this.render(); } else if (this.app) { this.app = null; this.render(); } else this.close(); }
  refresh() { if (this.isOpen) this.render(); }
  unread() { let n = 0; for (const t of Object.values(this.G.threads)) n += t.unread; return n; }
  render() {
    const G = this.G; const app = this.app;
    const title = app ? APPS.find((a) => a[0] === app)[1] : '';
    this.el.innerHTML = `<div class="ph"><div class="notch"></div>
      <div class="status"><span>${fmtTime(G.time)}</span><span>${G.area !== 'out' ? '📵' : '📶'} 🔋${Math.max(5, 100 - ((G.day - 1) * 7) % 90)}%</span></div>
      ${app ? `<div class="bar"><button class="bk">‹</button><b>${title}</b><span></span></div>` : ''}
      <div class="scr ${app || 'home'}"></div>
      <div class="homeb"></div></div>`;
    const scr = this.el.querySelector('.scr');
    this.el.querySelector('.homeb').addEventListener('click', () => { if (this.app) { this.app = null; this.sub = null; this.render(); } else this.close(); });
    const bk = this.el.querySelector('.bk'); bk && bk.addEventListener('click', () => this.back());
    (this['app_' + (app || 'home')] || this.app_home).call(this, scr);
  }
  go(app) { this.G.sfx('click'); if (app === 'camera' || app === 'scanner') { this.close(); this.G.setMode(app); this.G.pointerLock(); return; } this.app = app; this.sub = null; if (app === 'map') this.centerMap(); this.render(); }
  app_home(s) {
    const G = this.G, un = this.unread(), M = MISSIONS[G.story.m];
    s.innerHTML = `<div class="wid"><div class="clk">${fmtTime(G.time).replace(' ', '<small>')}</small></div><div class="dt">Day ${G.day} · ${G.area !== 'out' ? 'Underground' : 'Bellmont'}</div>
      <div class="obj">🎯 ${G.flags.ended ? 'Free roam' : M ? esc(G.story.text()) : ''}</div></div>
      <div class="apps">${APPS.map(([id, n, ic, c]) => `<button data-a="${id}"><span style="background:${c}">${ic}${id === 'messages' && un ? `<i>${un}</i>` : ''}</span><small>${n}</small></button>`).join('')}</div>
      <div class="wall">BRO, FIND THE PS5 💀</div>`;
    s.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => this.go(b.dataset.a)));
  }
  app_messages(s) {
    const G = this.G;
    if (this.sub) {
      const id = this.sub, th = G.thread(id), c = CONTACTS[id];
      if (th.unread) { th.unread = 0; G.story.emit({ type: 'read', id }); }
      s.innerHTML = `<div class="thead"><span class="av" style="background:${c.color}">${c.avatar}</span><b>${esc(c.name)}</b></div>
        <div class="msgs">${th.msgs.map((m) => `<div class="bub ${m.me ? 'me' : ''}">${esc(m.text)}<small>${fmtTime(m.t)}</small></div>`).join('') || '<p class="empty">No messages yet.</p>'}
        ${th.replies ? '' : ''}</div>
        <div class="rep">${th.replies ? th.replies.options.map((o, i) => `<button data-r="${i}">${esc(o)}</button>`).join('') : '<div class="ph-in">iMessage… (nothing to say)</div>'}</div>`;
      const msgs = s.querySelector('.msgs'); msgs.scrollTop = 1e6;
      s.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => G.reply(id, +b.dataset.r)));
      return;
    }
    const ids = G.contacts.filter((c) => G.threads[c] && G.threads[c].msgs.length).sort((a, b) => (G.threads[b].msgs.at(-1).t || 0) - (G.threads[a].msgs.at(-1).t || 0));
    s.innerHTML = ids.length ? ids.map((id) => { const th = G.threads[id], c = CONTACTS[id], last = th.msgs.at(-1); return `<button class="row" data-c="${id}"><span class="av" style="background:${c.color}">${c.avatar}</span><div><b>${esc(c.name)}</b><p>${last.me ? 'You: ' : ''}${esc(last.text)}</p></div>${th.unread ? `<i class="dot">${th.unread}</i>` : th.replies ? '<i class="dot r">↩</i>' : ''}</button>`; }).join('') : '<p class="empty">No messages.</p>';
    s.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { this.sub = b.dataset.c; this.G.sfx('click'); this.render(); }));
  }
  app_contacts(s) {
    const G = this.G;
    if (this.sub) {
      const id = this.sub, c = CONTACTS[id];
      s.innerHTML = `<div class="card"><span class="av big" style="background:${c.color}">${c.avatar}</span><h3>${esc(c.name)}</h3><p class="num">${c.num}</p><p>${esc(c.bio)}</p>
        <div class="acts"><button data-x="call">📞 Call</button><button data-x="msg">💬 Message</button></div><div class="call"></div></div>`;
      s.querySelector('[data-x=msg]').addEventListener('click', () => { this.app = 'messages'; this.sub = G.threads[id] ? id : null; this.render(); });
      s.querySelector('[data-x=call]').addEventListener('click', () => {
        const cl = s.querySelector('.call'); cl.innerHTML = '<p class="ring">📞 Calling…</p>'; G.sfx('buzz');
        setTimeout(() => { if (G.area !== 'out' && id !== 'unknown') { cl.innerHTML = '<p>📵 No signal underground.</p>'; return; } cl.innerHTML = `<p class="line">${esc(callLine(G, id))}</p>`; G.sfx('click'); }, 1300);
      });
      return;
    }
    s.innerHTML = G.contacts.map((id) => { const c = CONTACTS[id]; return `<button class="row" data-c="${id}"><span class="av" style="background:${c.color}">${c.avatar}</span><div><b>${esc(c.name)}</b><p>${c.num}</p></div></button>`; }).join('');
    s.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { this.sub = b.dataset.c; this.render(); }));
  }
  centerMap() { const p = this.G.player.pos; if (p.x < 900) { this.map.cx = p.x; this.map.cz = p.z; } else { this.map.cx = 0; this.map.cz = -20; } }
  app_map(s) {
    const G = this.G;
    s.innerHTML = `<canvas width="300" height="470"></canvas><div class="mapbtns"><button data-z="1">＋</button><button data-z="-1">－</button><button data-z="0">◎</button></div><div class="legend">🔒 locked · ❓ hidden · ◆ objective</div><div class="maptip"></div>`;
    const cv = s.querySelector('canvas'), g = cv.getContext('2d'); cv.width = s.clientWidth || 300; cv.height = s.clientHeight || 470;
    const W = cv.width, H = cv.height, S = G.world.mapScale;
    const draw = () => {
      const z = this.map.zoom, k = z * 0.85; // screen px per map px
      g.fillStyle = '#0c0f14'; g.fillRect(0, 0, W, H);
      const toS = (x, wz) => [W / 2 + (x - this.map.cx) * S * k, H / 2 + (wz - this.map.cz) * S * k];
      const [ox, oy] = toS(BOUNDS.x0, BOUNDS.z0); g.drawImage(G.world.mapCanvas, ox, oy, G.world.mapCanvas.width * k, G.world.mapCanvas.height * k);
      // fog over undiscovered zones
      for (const zn of ZONES) {
        if (zn.interior || ['city', 'lot'].includes(zn.id)) continue; const seen = G.visitedZones && G.visitedZones[zn.id];
        const [a, b] = toS(zn.x0, zn.z0), [c, d] = toS(zn.x1, zn.z1);
        if (!seen) { g.fillStyle = 'rgba(10,12,18,0.82)'; g.fillRect(a, b, c - a, d - b); g.fillStyle = 'rgba(255,255,255,0.35)'; g.font = `bold ${Math.max(10, 13 * z)}px sans-serif`; g.textAlign = 'center'; g.fillText('???', (a + c) / 2, (b + d) / 2); }
      }
      // gates
      for (const gt of Object.values(G.world.gates)) { if (gt.open) continue; const [x, y] = toS(gt.x, gt.z); g.font = '14px sans-serif'; g.textAlign = 'center'; g.fillText('🔒', x, y + 5); }
      // locations
      g.textAlign = 'center';
      for (const l of LOCATIONS) {
        if (!G.discovered.has(l.id) && l.type === 'hidden') continue; if (!G.discovered.has(l.id) && !(G.visitedZones && G.visitedZones[l.zone])) { if (l.zone) continue; }
        const [x, y] = toS(l.x, l.z); let ic = l.icon;
        if (l.type === 'locked') { const open = l.zone === 'B' ? G.flags.innerOpen : l.zone === 'C' ? G.flags.power : true; if (!open) ic = '🔒'; }
        g.font = `${Math.round(13 + z * 2)}px sans-serif`; g.fillText(ic, x, y + 5);
        if (z >= 1) { g.font = 'bold 10px sans-serif'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(l.name, x, y + 20); g.fillText(l.name, x, y + 20); }
      }
      // rare objects found
      for (const sc of G.world.scannables) if (sc.kind === 'rare' && G.scanned[sc.id] && sc.x < 900) { const [x, y] = toS(sc.x, sc.z); g.font = '12px sans-serif'; g.fillText('💎', x, y + 4); }
      // NPCs
      for (const n of Object.values(G.npcs)) { if (!n.visible || n.pos.x > 900) continue; const [x, y] = toS(n.pos.x, n.pos.z); g.fillStyle = '#9ad'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); if (z >= 1.5) { g.font = '9px sans-serif'; g.fillStyle = '#cde'; g.fillText(n.name, x, y - 6); } }
      // objective
      const t = G.story.target && !G.flags.ended ? G.story.target() : null;
      if (t && t[0] < 900) { const [x, y] = toS(t[0], t[1]); g.fillStyle = '#ff3d71'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 8, y); g.lineTo(x, y + 9); g.lineTo(x - 8, y); g.closePath(); g.fill(); g.stroke(); }
      // player
      const pp = G.player.pos.x < 900 ? G.player.pos : null;
      if (pp) { const [x, y] = toS(pp.x, pp.z); g.save(); g.translate(x, y); g.rotate(-G.player.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#0a84ff'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 7); g.lineTo(0, 3); g.lineTo(-7, 7); g.closePath(); g.stroke(); g.fill(); g.restore(); }
      else { g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.fillText('📍 You are underground', W / 2, 20); }
    };
    draw(); this._mapDraw = draw;
    let drag = null;
    const start = (x, y) => (drag = { x, y }); const move = (x, y) => { if (!drag) return; const k = this.map.zoom * 0.85 * S; this.map.cx -= (x - drag.x) / k; this.map.cz -= (y - drag.y) / k; drag = { x, y }; draw(); };
    cv.addEventListener('mousedown', (e) => start(e.clientX, e.clientY)); addEventListener('mousemove', (e) => move(e.clientX, e.clientY)); addEventListener('mouseup', () => (drag = null));
    cv.addEventListener('touchstart', (e) => { const t = e.touches[0]; start(t.clientX, t.clientY); e.preventDefault(); }, { passive: false }); cv.addEventListener('touchmove', (e) => { const t = e.touches[0]; move(t.clientX, t.clientY); e.preventDefault(); }, { passive: false }); cv.addEventListener('touchend', () => (drag = null));
    cv.addEventListener('wheel', (e) => { this.map.zoom = clamp(this.map.zoom * (e.deltaY < 0 ? 1.2 : 0.83), 0.4, 4); draw(); e.preventDefault(); }, { passive: false });
    s.querySelectorAll('[data-z]').forEach((b) => b.addEventListener('click', () => { const z = +b.dataset.z; if (z === 0) this.centerMap(); else this.map.zoom = clamp(this.map.zoom * (z > 0 ? 1.35 : 0.74), 0.4, 4); draw(); }));
  }
  app_gallery(s) {
    const G = this.G;
    if (this.sub != null) { const p = G.gallery[this.sub]; s.innerHTML = p ? `<img class="full" src="${p.img}"><p class="cap">📸 ${esc(p.label)}<br><small>Day ${p.day} · ${fmtTime(p.time)}</small></p><button class="del">🗑 Delete</button>` : ''; const d = s.querySelector('.del'); d && d.addEventListener('click', () => { G.gallery.splice(this.sub, 1); this.sub = null; this.render(); }); return; }
    s.innerHTML = G.gallery.length ? `<div class="gal">${G.gallery.map((p, i) => `<img data-i="${i}" src="${p.img}">`).join('')}</div>` : '<p class="empty">No photos yet.<br>Open 📷 Camera to take some.</p>';
    s.querySelectorAll('[data-i]').forEach((im) => im.addEventListener('click', () => { this.sub = +im.dataset.i; this.render(); }));
  }
  app_missions(s) {
    const G = this.G, st = G.story;
    s.innerHTML = MISSIONS.map((M, i) => {
      const state = G.flags.ended || i < st.m ? 'done' : i === st.m ? 'cur' : 'lock';
      const steps = state === 'cur' ? `<ul>${M.steps.map((sp, j) => `<li class="${j < st.s ? 'ok' : j === st.s ? 'now' : 'no'}">${j < st.s ? '✔' : j === st.s ? '▶' : '·'} ${j <= st.s ? esc(typeof sp.text === 'function' ? sp.text(G) : sp.text) : '???'}</li>`).join('')}</ul>` : '';
      return `<div class="mis ${state}"><b>${state === 'done' ? '✅' : state === 'cur' ? '🎯' : '🔒'} ${i + 1}. ${state === 'lock' ? '???' : M.title}</b>${steps}</div>`;
    }).join('') + `<p class="small">💎 Rare objects scanned: ${Object.keys(G.scanned).filter((k) => /^r\d$/.test(k)).length}/8 · 🏆 Golden controller: ${G.has('gold') ? 'found' : '???'}</p>`;
  }
  app_notes(s) {
    const G = this.G;
    if (this.sub != null) { const n = G.notes[this.sub]; s.innerHTML = `<div class="note"><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p><small>Day ${n.day} · ${fmtTime(n.time)}</small></div>`; return; }
    s.innerHTML = G.notes.length ? G.notes.map((n, i) => `<button class="row" data-n="${i}"><div><b>${esc(n.title)}</b><p>${esc(n.text)}</p></div></button>`).join('') : '<p class="empty">No notes yet. Clues you find are written down here automatically.</p>';
    s.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => { this.sub = +b.dataset.n; this.render(); }));
  }
  app_bag(s) {
    const G = this.G; const ids = Object.keys(G.inv).filter((k) => G.inv[k] > 0);
    s.innerHTML = `<p class="small">💵 Cash: <b>$${G.money}</b></p>` + (ids.length ? ids.map((id) => { const it = ITEMS[id]; return `<div class="row"><span class="av">${it.icon}</span><div><b>${esc(it.name)} ${G.inv[id] > 1 ? '×' + G.inv[id] : ''}</b><p>${esc(it.desc)}</p></div>${it.use ? `<button class="use" data-u="${id}">${it.use === 'drink' ? 'Drink' : 'Eat'}</button>` : ''}</div>`; }).join('') : '<p class="empty">Empty.</p>');
    s.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => { G.useItem(b.dataset.u); this.render(); }));
  }
  app_settings(s) {
    const G = this.G, S = G.settings;
    const sl = (k, label, min, max, st) => `<label>${label}<input type="range" data-k="${k}" min="${min}" max="${max}" step="${st}" value="${S[k]}"></label>`;
    s.innerHTML = `<div class="set">${sl('master', '🔊 Volume', 0, 1, 0.05)}${sl('music', '🎵 Music', 0, 1, 0.05)}${sl('sfx', '💥 Effects', 0, 1, 0.05)}${sl('sens', '🖱 Sensitivity', 0.3, 2.5, 0.1)}${sl('fov', '👁 FOV', 60, 100, 1)}
      <label>🖥 Graphics <select data-k="quality"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      <label class="ck"><input type="checkbox" data-k="invert" ${S.invert ? 'checked' : ''}> Invert Y</label><label class="ck"><input type="checkbox" data-k="bob" ${S.bob ? 'checked' : ''}> Head bob</label></div>
      <h4>💾 Save / Load</h4><div class="slots">${[1, 2, 3].map((i) => { const f = Save.info(i); return `<div class="slot"><span>Slot ${i}: ${f ? `M${f.m + 1} · Day ${f.day}` : 'empty'}</span><button data-s="${i}">Save</button><button data-l="${i}" ${f ? '' : 'disabled'}>Load</button></div>`; }).join('')}
      <div class="slot"><span>Autosave: ${Save.info(0) ? 'Day ' + Save.info(0).day : '—'}</span><button data-l="0" ${Save.info(0) ? '' : 'disabled'}>Load</button></div></div>
      <button class="quit">⏏ Quit to title</button>`;
    s.querySelector('select').value = S.quality;
    s.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('input', () => { const k = el.dataset.k; S[k] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : +el.value; G.applyQuality(); Save.saveSettings(S); }));
    s.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { Save.save(G, +b.dataset.s); G.toast('💾 Saved to slot ' + b.dataset.s); this.render(); }));
    s.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { this.close(); G.continueGame(+b.dataset.l); }));
    s.querySelector('.quit').addEventListener('click', () => { G.autosave(); location.reload(); });
  }
}
