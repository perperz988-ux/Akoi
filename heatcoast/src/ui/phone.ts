import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Actor } from '../actors/actor';
import { fmtMoney, fmtTime, rng, clamp } from '../core/math';
import { WEATHER_LABEL } from '../render/env';
import { vdef } from '../vehicles/models';
import { poiById } from '../world/layout';

const h = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; };
interface Contact { id: string; name: string; role: string; color: string }
interface Msg { from: string; text: string; out?: boolean; t: number }
interface Post { user: string; handle: string; text: string; img?: string; likes: number; t: number; mine?: boolean; liked?: boolean }
const GALLERY_KEY = 'heatcoast.gallery';
const NPC_USERS = [['Crystal ✨', '@crystalclearbv'], ['BV Traffic', '@bvtraffic'], ['Mike from Palm Grove', '@mikepg'], ['Calle Verde Eats', '@cveats'], ['SunlineSurfCo', '@sunlinesurf'], ['Gator Watch', '@gatorwatch'], ['BVPD Scanner (unofficial)', '@bvscanner'], ['Lexi Moreno', '@lexi.m'], ['Coral Mile Nights', '@coralmile']];
const GENERIC = ['Another 90° day in Bahía Verde 🥵🌴', 'Who keeps parking on Ocean Drive like that??', 'Cuban coffee is a personality trait', 'Saw a gator at the Gulfstar. Just chilling. Buying chips?', 'Sunset at Sunline hits different tonight 🌅', 'Port Expwy is a PARKING LOT', 'Rent in Downtown is a crime and nobody is arresting anyone', 'Hurricane prep = 40 cases of Sol Cola', 'If you see a red Vento GT doing 200 on Biscayne... no you didn\'t', 'Flamingo Diner pancakes > therapy'];

/** The in-game smartphone OS. */
export class Phone {
  open = false; cameraMode = false; private selfie = false; private filter = 0; private app = 'home';
  root: HTMLElement; private screen: HTMLElement; private camui: HTMLElement; private notifEl: HTMLElement;
  contacts: Contact[] = []; threads: Record<string, Msg[]> = {}; unread: Record<string, number> = {}; calls: { who: string; t: number; dir: 'in' | 'out' | 'missed' }[] = [];
  feed: Post[] = []; followers = 120; wallpaper = '';
  private photoCbs = new Set<(visible: Actor[]) => void>(); private callState: { who: string; resolve: () => void } | null = null; private feedT = 30; private viewing = '';
  private camYaw = 0; private camPitch = 0;
  constructor(private g: Game, ui: HTMLElement) {
    this.root = h(`<div class="phone"><div class="notch"></div><div class="status"><span id="phTime">9:41</span><span>●●●● 5G ▮▮▮</span></div><div class="screen"></div></div>`);
    ui.appendChild(this.root); this.screen = this.root.querySelector('.screen')!;
    this.camui = h(`<div id="camui"><div class="grid3"></div><div class="flash"></div><div class="tools"><span class="btn" id="camFlip">⟲ Selfie</span><span class="btn" id="camFilter">Filter: None</span><span class="btn" id="camExit">✕ Close</span></div><div class="shutter" id="camShoot"></div></div>`);
    ui.appendChild(this.camui);
    this.notifEl = h(`<div id="notif"><div class="ic"></div><div><b></b><div class="t"></div></div></div>`); ui.appendChild(this.notifEl);
    this.notifEl.addEventListener('click', () => { const id = this.notifEl.dataset.app; if (id) { this.toggle(true); this.openApp(id); } this.notifEl.classList.remove('on'); });
    this.camui.querySelector('#camShoot')!.addEventListener('click', () => this.shoot());
    this.camui.querySelector('#camFlip')!.addEventListener('click', () => { this.selfie = !this.selfie; (this.camui.querySelector('#camFlip') as HTMLElement).textContent = this.selfie ? '⟲ Rear' : '⟲ Selfie'; });
    this.camui.querySelector('#camFilter')!.addEventListener('click', () => { this.filter = (this.filter + 1) % 4; (this.camui.querySelector('#camFilter') as HTMLElement).textContent = 'Filter: ' + ['None', 'Golden', 'Noir', 'Vice'][this.filter]; document.getElementById('game')!.style.filter = ['', 'sepia(0.35) saturate(1.3) brightness(1.05)', 'grayscale(1) contrast(1.2)', 'saturate(1.6) hue-rotate(-15deg) contrast(1.1)'][this.filter]; });
    this.camui.querySelector('#camExit')!.addEventListener('click', () => this.exitCamera());
    this.root.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.reset();
  }
  reset() {
    this.contacts = [
      { id: 'partner', name: 'Partner', role: '❤', color: '#ff4f8b' }, { id: 'beto', name: 'Tío Beto', role: 'Fixer', color: '#c08a3a' },
      { id: 'cab', name: 'Sol Cabs', role: 'Fast travel to your GPS waypoint', color: '#f2c010' }, { id: '911', name: 'Emergency 911', role: 'Police · Fire · EMS', color: '#ff3b30' },
    ];
    this.threads = {}; this.unread = {}; this.calls = []; this.followers = 120;
    this.feed = Array.from({ length: 6 }, () => this.npcPost(rng.pick(GENERIC)));
    this.message('jace', 'Morning sunshine. Ice machine is still judging me.', true);
  }
  unlockContact(id: string) {
    const meta: Record<string, Contact> = { marisol: { id: 'marisol', name: 'Marisol Vega', role: 'Mechanic · car delivery', color: '#3a8ae8' }, ferro: { id: 'ferro', name: 'Det. Ana Ferro', role: 'BVPD', color: '#5a5a7a' }, earl: { id: 'earl', name: 'Earl Boudreaux', role: 'Gator\'s Rest', color: '#6a8a3a' } };
    if (meta[id] && !this.contacts.find((c) => c.id === id)) { this.contacts.push(meta[id]); this.notify('Contacts', `${meta[id].name} added to contacts`, 'contacts'); }
  }
  private nameOf(id: string) { if (id === 'jace' || id === 'rosa') return id === 'jace' ? 'Jace' : 'Rosa'; if (id === 'partner') return this.g.partner.name.split(' ')[0]; return this.contacts.find((c) => c.id === id)?.name ?? ({ beto: 'Tío Beto', marisol: 'Marisol Vega', ferro: 'Det. Ana Ferro', earl: 'Earl', pulse: 'Pulse' } as Record<string, string>)[id] ?? id; }

  // ------------------------------------------------------------ open/close
  toggle(on?: boolean) {
    const want = on ?? !this.open; if (want === this.open) return;
    if (want && (this.g.state !== 'play' || this.g.player.mode === 'dead' || this.g.player.mode === 'cutscene')) return;
    this.open = want; this.root.classList.toggle('on', want);
    if (want) { this.app = 'home'; this.render(); this.g.audio.click(); } else if (this.cameraMode) this.exitCamera();
  }
  openApp(id: string) { this.app = id; this.viewing = ''; this.render(); this.g.audio.click(); }
  update(dt: number) {
    (this.root.querySelector('#phTime') as HTMLElement).textContent = fmtTime(this.g.env.hour);
    this.feedT -= dt; if (this.feedT <= 0) { this.feedT = 40 + rng.next() * 60; this.feed.unshift(this.npcPost(rng.pick(GENERIC))); this.feed.length = Math.min(this.feed.length, 40); }
    for (const p of this.feed) if (p.mine && Math.random() < dt * 0.5) { const n = Math.floor(rng.next() * (3 + this.followers / 200)); p.likes += n; this.followers += Math.random() < 0.3 ? 1 : 0; }
    if (this.open && this.app === 'pulse' && Math.random() < dt * 0.3) this.render();
  }

  // ------------------------------------------------------------ render
  private render() {
    const s = this.screen; s.innerHTML = '';
    if (this.callState) return this.renderCall(this.callState.who, 'Incoming call…', true);
    const page = (title: string, dark = false) => { const p = h(`<div class="page ${dark ? 'dark' : ''}"><div class="hdr"><span class="back">‹</span>${title}</div><div class="body"></div></div>`); p.querySelector('.back')!.addEventListener('click', () => { if (this.viewing) { this.viewing = ''; this.render(); } else this.openApp('home'); }); s.appendChild(p); return p.querySelector('.body') as HTMLElement; };
    const li = (body: HTMLElement, av: string, color: string, title: string, sub: string, on?: () => void, right = '') => { const e = h(`<div class="li"><div class="av" style="background:${color}">${av}</div><div style="flex:1;min-width:0"><div>${title}</div><small>${sub}</small></div>${right}</div>`); if (on) e.addEventListener('click', on); body.appendChild(e); return e; };
    const g = this.g;
    switch (this.app) {
      case 'home': {
        const unreadAll = Object.values(this.unread).reduce((a, b) => a + b, 0);
        const apps: [string, string, string, string, number?][] = [['messages', '💬', 'Messages', '#34c759', unreadAll], ['contacts', '📞', 'Phone', '#30d158'], ['camera', '📷', 'Camera', '#3a3a3c'], ['gallery', '🖼', 'Gallery', '#ff9f0a'], ['maps', '🗺', 'Maps', '#0a84ff'], ['pulse', '◎', 'Pulse', '#ff375f'], ['jobs', '★', 'Jobs', '#ffd60a'], ['bank', '$', 'Bank', '#1c7c54'], ['garage', '🚗', 'Garage', '#5e5ce6'], ['weather', '☀', 'Weather', '#64d2ff'], ['stats', '📈', 'Stats', '#8e8e93'], ['settings', '⚙', 'Settings', '#636366']];
        const home = h(`<div class="home" style="${this.wallpaper ? `background:url(${this.wallpaper}) center/cover` : ''}"><div class="wp">${fmtTime(g.env.hour)}</div><div class="dt">Day ${g.env.day} · ${WEATHER_LABEL[g.env.weather]} · Bahía Verde</div><div class="grid"></div></div>`);
        const grid = home.querySelector('.grid')!;
        for (const [id, ic, name, col, badge] of apps) { const a = h(`<div class="app"><div class="ic" style="background:${col}">${ic}</div>${name}${badge ? `<span class="badge">${badge}</span>` : ''}</div>`); a.addEventListener('click', () => (id === 'camera' ? this.enterCamera() : id === 'maps' ? (this.toggle(false), g.hud.openMap(true)) : this.openApp(id))); grid.appendChild(a); }
        s.appendChild(home); break;
      }
      case 'messages': {
        if (this.viewing) {
          const b = page(this.nameOf(this.viewing)); for (const m of this.threads[this.viewing] ?? []) b.appendChild(h(`<div class="msg ${m.out ? 'out' : 'in'}">${m.text}</div>`)); this.unread[this.viewing] = 0; setTimeout(() => (b.scrollTop = b.scrollHeight), 0);
          const quick = h(`<div style="display:flex;gap:6px;padding:6px"><span class="btn" style="font-size:12px;padding:6px 10px;background:#e5e5ea;color:#111">👍</span><span class="btn" style="font-size:12px;padding:6px 10px;background:#e5e5ea;color:#111">On my way</span><span class="btn" style="font-size:12px;padding:6px 10px;background:#e5e5ea;color:#111">Call</span></div>`);
          const v = this.viewing; quick.children[0].addEventListener('click', () => { this.reply(v, '👍'); }); quick.children[1].addEventListener('click', () => this.reply(v, 'On my way.')); quick.children[2].addEventListener('click', () => this.call(v));
          b.parentElement!.appendChild(quick); break;
        }
        const b = page('Messages'); const ids = Object.keys(this.threads).sort((a, c) => (this.threads[c].at(-1)?.t ?? 0) - (this.threads[a].at(-1)?.t ?? 0));
        if (!ids.length) b.appendChild(h('<div style="padding:20px;color:#888;text-align:center">No messages</div>'));
        for (const id of ids) { const last = this.threads[id].at(-1)!; li(b, this.nameOf(id)[0], '#8e8e93', `${this.nameOf(id)}${this.unread[id] ? ` <span class="badge" style="position:static;background:#ff3b30;color:#fff;border-radius:9px;padding:0 6px;font-size:11px">${this.unread[id]}</span>` : ''}`, last.text.slice(0, 48), () => { this.viewing = id; this.render(); }); }
        break;
      }
      case 'contacts': {
        const b = page('Phone');
        for (const c of this.contacts) li(b, c.id === 'partner' ? this.nameOf('partner')[0] : c.name[0], c.color, c.id === 'partner' ? this.g.partner.name : c.name, c.role, () => this.call(c.id), '<span style="color:#30d158;font-size:20px">📞</span>');
        b.appendChild(h('<div style="padding:10px 6px 4px;font-weight:800;color:#888;font-size:12px">RECENTS</div>'));
        for (const r of this.calls.slice(0, 10)) li(b, r.dir === 'in' ? '↙' : r.dir === 'out' ? '↗' : '✕', r.dir === 'missed' ? '#ff3b30' : '#8e8e93', this.nameOf(r.who), `${r.dir === 'missed' ? 'Missed' : r.dir === 'in' ? 'Incoming' : 'Outgoing'} · ${fmtTime(r.t)}`);
        break;
      }
      case 'gallery': {
        const photos = this.photos();
        if (this.viewing) { const p = photos[+this.viewing]; const b = page('Photo', true); if (!p) break; b.appendChild(h(`<img src="${p}" style="width:100%;border-radius:10px">`)); const row = h(`<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap"><span class="btn primary">Post to Pulse</span><span class="btn">Wallpaper</span><span class="btn danger">Delete</span></div>`); row.children[0].addEventListener('click', () => { this.post('Out here in Bahía Verde 🌴', p); this.openApp('pulse'); }); row.children[1].addEventListener('click', () => { this.wallpaper = p; this.g.hud.toast('Wallpaper set'); }); row.children[2].addEventListener('click', () => { const ph = this.photos(); ph.splice(+this.viewing, 1); this.savePhotos(ph); this.viewing = ''; this.render(); }); b.appendChild(row); break; }
        const b = page('Gallery'); if (!photos.length) b.appendChild(h('<div style="padding:20px;color:#888;text-align:center">No photos yet — open the Camera app</div>'));
        const grid = h('<div class="gal"></div>'); photos.forEach((p, i) => { const im = h(`<img src="${p}">`); im.addEventListener('click', () => { this.viewing = String(i); this.render(); }); grid.appendChild(im); }); b.appendChild(grid); break;
      }
      case 'pulse': {
        const b = page(`Pulse <span style="font-size:12px;color:#888;font-weight:600;margin-left:auto">${this.followers.toLocaleString()} followers</span>`);
        b.style.background = '#efeff4';
        for (const p of this.feed.slice(0, 30)) { const e = h(`<div class="post"><span class="u">${p.user}</span> <span class="h">${p.handle} · ${fmtTime(p.t)}</span><div>${p.text}</div>${p.img ? `<img src="${p.img}">` : ''}<div class="acts"><span class="lk">${p.liked ? '❤️' : '♡'} ${p.likes}</span><span>💬 ${Math.floor(p.likes / 7)}</span><span>↻ ${Math.floor(p.likes / 12)}</span></div></div>`); e.querySelector('.lk')!.addEventListener('click', () => { if (!p.liked) { p.liked = true; p.likes++; this.render(); } }); b.appendChild(e); }
        break;
      }
      case 'jobs': {
        const b = page('Jobs'); const act = g.missions.active;
        if (act) { li(b, '▶', '#ff9f0a', act.def.title, act.objective || act.def.blurb); li(b, '✕', '#ff3b30', 'Abandon job', 'Progress on this attempt is lost', () => { g.missions.abort(); this.render(); }); }
        b.appendChild(h(`<div style="padding:8px 4px;font-size:12px;color:#888">STORY ${Math.round(g.missions.progress() * 100)}% · ${g.missions.chapterName()}</div>`));
        for (const d of g.missions.available()) { const st = d.start(); li(b, d.side ? '$' : '★', d.side ? '#0a84ff' : '#ffd60a', d.title, `${d.chapter} · ${d.blurb}`, () => { g.hud.waypoint = { x: st.x, z: st.z }; g.hud.setRoute(null); this.g.hud.toast('GPS set to job start'); this.toggle(false); }, d.reward ? `<b style="color:#1c7c54">${fmtMoney(d.reward)}</b>` : ''); }
        break;
      }
      case 'bank': { const b = page('Gulf Coast Savings'); b.appendChild(h(`<div style="background:linear-gradient(135deg,#1c7c54,#0a4a30);color:#fff;border-radius:14px;padding:16px;margin:4px 0 10px"><div style="font-size:12px;opacity:.8">Available balance</div><div style="font-size:30px;font-weight:800;font-family:Georgia">${fmtMoney(g.economy.money)}</div><div style="font-size:11px;opacity:.7">Joint account · R. Delgado & J. Holloway</div></div>`)); for (const t of g.economy.log.slice(0, 30)) li(b, t.amt > 0 ? '+' : '−', t.amt > 0 ? '#1c7c54' : '#c0392b', t.t, `Day ${t.day}`, undefined, `<b style="color:${t.amt > 0 ? '#1c7c54' : '#c0392b'}">${t.amt > 0 ? '+' : '−'}${fmtMoney(Math.abs(t.amt))}</b>`); break; }
      case 'garage': {
        const b = page('Garage'); const own = g.economy.owned;
        if (!own.length) b.appendChild(h('<div style="padding:14px;color:#888">No saved cars. Drive one into Pit Stop Customs and register it, or order one below.</div>'));
        for (const o of own) li(b, '🚗', '#5e5ce6', `${vdef(o.def).maker} ${vdef(o.def).name}`, 'Tap: Marisol delivers it to you', () => { if (!this.contacts.find((c) => c.id === 'marisol')) { g.hud.toast('You need Marisol\'s number first'); return; } g.economy.vehicleDelivery(o.uid); this.toggle(false); });
        if (this.contacts.find((c) => c.id === 'marisol')) { b.appendChild(h('<div style="padding:10px 4px 4px;font-weight:800;color:#888;font-size:12px">ORDER FROM MARISOL</div>')); for (const it of g.economy.dealerItems()) li(b, '+', '#30d158', it.label, it.sub ?? '', () => { it.action!(); this.render(); }, `<b>${fmtMoney(it.price ?? 0)}</b>`); }
        break;
      }
      case 'weather': { const b = page('Weather'); const [now, next] = g.env.forecast(); const icon = (w: string) => ({ clear: '☀️', cloudy: '⛅', rain: '🌧', storm: '⛈', fog: '🌫' } as Record<string, string>)[w]; b.appendChild(h(`<div style="text-align:center;padding:20px 0"><div style="font-size:64px">${icon(now)}</div><div style="font-size:40px;font-weight:300">${Math.round(26 + (1 - g.env.night) * 7 - g.env.rainAmt * 5)}°</div><div>${WEATHER_LABEL[now]} · Bahía Verde</div><div style="color:#888;margin-top:12px">Later: ${icon(next)} ${WEATHER_LABEL[next]}</div><div style="color:#888;font-size:12px;margin-top:6px">Wet roads reduce grip. Drive carefully.</div></div>`)); break; }
      case 'stats': { const b = page('Stats'); const P = g.player; const st = (a: string, v: string) => b.appendChild(h(`<div class="li"><div style="flex:1">${a}</div><b>${v}</b></div>`)); st('Story', `${Math.round(g.missions.progress() * 100)}%`); st('Duo bond', `${g.bond}/100`); for (const [k, v] of Object.entries(P.skills)) st(`${P.name.split(' ')[0]} · ${k}`, `${Math.round(v * 100)}%`); st('Distance', `${(P.stats.distance / 1000).toFixed(1)} km`); st('Cars stolen', String(P.stats.carsStolen)); st('Kills', String(P.stats.kills)); st('Missions', String(P.stats.missions)); st('Photos', String(P.stats.photos)); st('Play time', `${Math.floor(P.stats.playTime / 60)} min`); break; }
      case 'settings': {
        const b = page('Settings'); const s2 = g.settings;
        const tog = (label: string, val: boolean, set: (v: boolean) => void) => { const e = h(`<div class="li"><div style="flex:1">${label}</div><b style="color:${val ? '#30d158' : '#888'}">${val ? 'On' : 'Off'}</b></div>`); e.addEventListener('click', () => { set(!val); this.render(); }); b.appendChild(e); };
        tog('Subtitles', s2.subtitles, (v) => g.setSettings({ subtitles: v })); tog('Vibration', s2.vibration, (v) => g.setSettings({ vibration: v })); tog('Aim assist', s2.autoAim, (v) => g.setSettings({ autoAim: v })); tog('Show FPS', s2.showFps, (v) => g.setSettings({ showFps: v }));
        const e = h(`<div class="li"><div style="flex:1">Graphics</div><b>${s2.preset}</b></div>`); e.addEventListener('click', () => { const o = ['AUTO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as const; g.setSettings({ preset: o[(o.indexOf(s2.preset) + 1) % o.length] }); this.render(); }); b.appendChild(e);
        const all = h(`<div class="li"><div style="flex:1;color:#0a84ff">All settings…</div></div>`); all.addEventListener('click', () => { this.toggle(false); g.menus.settings(); }); b.appendChild(all);
        const sv = h(`<div class="li"><div style="flex:1;color:#0a84ff">Save game</div></div>`); sv.addEventListener('click', () => { this.toggle(false); g.menus.slots('save'); }); b.appendChild(sv);
        break;
      }
    }
  }
  private renderCall(who: string, status: string, incoming = false) {
    const s = this.screen; s.innerHTML = '';
    const c = h(`<div class="call"><div class="av" style="background:#5e5ce6">${this.nameOf(who)[0]}</div><div style="font-size:22px;font-weight:700">${this.nameOf(who)}</div><div style="opacity:.7" class="stt">${status}</div><div class="acts">${incoming ? '<span style="background:#30d158" class="ans">📞</span>' : ''}<span style="background:#ff3b30" class="end">✕</span></div></div>`);
    c.querySelector('.ans')?.addEventListener('click', () => this.answer());
    c.querySelector('.end')!.addEventListener('click', () => { if (this.callState) this.answer(); else this.endCall(); });
    s.appendChild(c);
  }

  // ------------------------------------------------------------ messaging & calls
  message(from: string, text: string, silent = false) {
    (this.threads[from] ??= []).push({ from, text, t: this.g.env?.hour ?? 9 }); this.unread[from] = (this.unread[from] ?? 0) + 1;
    if (!silent) { this.notify(this.nameOf(from), text, 'messages'); this.g.audio.notify(); }
    if (this.open && this.app === 'messages') this.render();
  }
  private reply(id: string, text: string) { (this.threads[id] ??= []).push({ from: 'me', text, out: true, t: this.g.env.hour }); this.render(); }
  notify(title: string, text: string, app = '') {
    const n = this.notifEl; (n.querySelector('b') as HTMLElement).textContent = title; (n.querySelector('.t') as HTMLElement).textContent = text.length > 90 ? text.slice(0, 88) + '…' : text;
    (n.querySelector('.ic') as HTMLElement).textContent = app === 'messages' ? '💬' : app === 'pulse' ? '◎' : '🔔'; (n.querySelector('.ic') as HTMLElement).style.background = app === 'messages' ? '#34c759' : app === 'pulse' ? '#ff375f' : '#ffd60a';
    n.dataset.app = app; n.classList.add('on'); clearTimeout((n as any)._t); (n as any)._t = setTimeout(() => n.classList.remove('on'), 4200);
  }
  incomingCall(who: string): Promise<void> {
    return new Promise((resolve) => {
      this.callState = { who, resolve }; this.g.audio.ring(); this.toggle(true); this.renderCall(who, 'Incoming call…', true);
      const ring = setInterval(() => { if (this.callState?.who === who) this.g.audio.ring(); else clearInterval(ring); }, 1800);
      setTimeout(() => { if (this.callState?.who === who) this.answer(); }, 5000); // auto-answer so the story never soft-locks
    });
  }
  private answer() { const c = this.callState; if (!c) return; this.callState = null; this.calls.unshift({ who: c.who, t: this.g.env.hour, dir: 'in' }); this.renderCall(c.who, 'Connected'); c.resolve(); }
  endCall() { this.toggle(false); this.g.player.pose = 'walk'; }
  call(id: string) {
    const g = this.g; this.calls.unshift({ who: id, t: g.env.hour, dir: 'out' }); this.renderCall(id, 'Calling…'); g.audio.ring();
    setTimeout(() => {
      if (!this.open) return; this.renderCall(id, 'Connected');
      const P = g.player, Q = g.partner;
      const lines: Record<string, () => void> = {
        partner: () => { if (Q.dead) { g.playConversation([{ who: 'player', text: 'Hey… you okay? Call me back.' }]); return; } const far = Math.hypot(Q.x - P.x, Q.z - P.z) > 30; g.playConversation([{ who: 'player', text: far ? 'Where are you? Come find me.' : 'Just checking you\'re still there.' }, { who: 'partner', text: far ? 'On my way. Don\'t do anything stupid without me.' : 'Turn around, genius. I\'m right here.' }]); if (far && !Q.vehicle) setTimeout(() => { Q.placeAt(P.x + 2, P.z + 2); g.hud.toast(`${Q.name.split(' ')[0]} caught up`); }, 4000); },
        beto: () => g.playConversation([{ who: 'Tío Beto', text: rng.pick(['Mija! Check your Jobs app. Money is waiting.', 'I\'m at mass. Call me after. Kidding. I don\'t go to mass.', 'You two stay out of trouble. Or at least out of the news.']) }]),
        marisol: () => g.playConversation([{ who: 'Marisol Vega', text: g.economy.owned.length ? 'Open your Garage app and I\'ll drop a car off.' : 'Bring me something nice and I\'ll keep it safe for you.' }]),
        ferro: () => g.playConversation([{ who: 'Det. Ana Ferro', text: g.police.stars ? 'I can\'t help you while every cruiser in the county is on you. Lose them.' : 'Don\'t call this number unless you have something for me.' }]),
        earl: () => g.playConversation([{ who: 'Earl Boudreaux', text: 'Bar\'s open \'til three. Gators are free.' }]),
        cab: () => { const wp = g.hud.waypoint; if (!wp) { g.playConversation([{ who: 'Sol Cabs', text: 'Set a GPS waypoint on your map first, hon.' }]); return; } if (g.police.stars) { g.playConversation([{ who: 'Sol Cabs', text: 'We don\'t pick up from police chases.' }]); return; } const cost = Math.round(20 + Math.hypot(wp.x - P.x, wp.z - P.z) * 0.05); if (!g.economy.spend(cost, 'Sol Cabs')) { g.playConversation([{ who: 'Sol Cabs', text: `That's $${cost}. Call back when you have it.` }]); return; } this.toggle(false); g.hud.fade(true).then(async () => { if (P.vehicle) P.exitVehicle(true); g.teleport(wp.x, wp.z, P.yaw); g.env.setHour(g.env.hour + 0.4); await g.preload(); g.hud.fade(false); g.hud.toast(`Sol Cabs: $${cost}`); }); },
        '911': () => { g.playConversation([{ who: 'Dispatcher', text: '911, what\'s your emergency?' }, { who: 'player', text: 'Wrong number. Sorry.' }]); },
      };
      (lines[id] ?? (() => g.playConversation([{ who: this.nameOf(id), text: 'Hey. Can\'t talk right now.' }])))();
      setTimeout(() => { if (this.open && this.app !== 'camera') { this.app = 'contacts'; this.render(); } }, 5000);
    }, 1600);
  }

  // ------------------------------------------------------------ camera
  enterCamera() {
    const g = this.g; this.cameraMode = true; this.root.classList.remove('on'); this.camui.classList.add('on'); g.hud.show(false); g.touch.show(false);
    this.camYaw = g.cam.yaw + Math.PI; this.camPitch = 0; this.selfie = false;
  }
  exitCamera() { const g = this.g; this.cameraMode = false; this.camui.classList.remove('on'); document.getElementById('game')!.style.filter = ''; g.hud.show(true); g.touch.show(true); this.open = false; this.root.classList.remove('on'); g.cam.stopCine(); g.cam.snapBehind(g.player.yaw); }
  updateCamera(dt: number) {
    const g = this.g, P = g.player, c = g.cam.cam; const inp = g.input;
    this.camYaw -= inp.lookX; this.camPitch = clamp(this.camPitch - inp.lookY, -1.2, 1.2);
    const head = new THREE.Vector3(P.x, P.y + P.hum.height - 0.1, P.z);
    if (P.vehicle) head.y = P.vehicle.y + 1.3;
    const dir = new THREE.Vector3(Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch));
    if (this.selfie) { c.position.copy(head).addScaledVector(dir, 0.85); c.position.y += 0.1; c.lookAt(head); P.yaw = this.camYaw; P.pose = 'phone'; P.hum.lookAt = c.position.clone(); g.partner.hum.lookAt = c.position.clone(); }
    else { c.position.copy(head).addScaledVector(dir, 0.25); c.lookAt(c.position.clone().add(dir)); if (!P.vehicle) P.yaw = this.camYaw; }
    c.fov = 55; c.updateProjectionMatrix(); void dt;
  }
  private shoot() {
    const g = this.g; g.audio.shutter(); const fl = this.camui.querySelector('.flash') as HTMLElement; fl.style.transition = 'none'; fl.style.opacity = '0.9'; requestAnimationFrame(() => { fl.style.transition = 'opacity .35s'; fl.style.opacity = '0'; });
    // which story actors are in frame
    const cam = g.cam.cam; const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const vis = g.allActors().filter((a) => !a.dead && fr.containsPoint(new THREE.Vector3(a.x, a.y + 1.5, a.z)) && a.group.position.distanceTo(cam.position) < 70 && g.lineOfSight(cam.position.x, cam.position.y, cam.position.z, a.x, a.y + 1.5, a.z));
    g.capture((url) => {
      if (!url) { g.hud.toast('Camera unavailable'); return; }
      const img = new Image(); img.onload = () => {
        const w = 480, hh = Math.round(480 * img.height / img.width); const cv = document.createElement('canvas'); cv.width = w; cv.height = hh; const c = cv.getContext('2d')!;
        c.filter = ['none', 'sepia(0.35) saturate(1.3) brightness(1.05)', 'grayscale(1) contrast(1.2)', 'saturate(1.6) hue-rotate(-15deg) contrast(1.1)'][this.filter]; c.drawImage(img, 0, 0, w, hh);
        const data = cv.toDataURL('image/jpeg', 0.72); const ph = this.photos(); ph.unshift(data); this.savePhotos(ph.slice(0, 24));
        g.player.stats.photos++; g.hud.toast('Saved to Gallery');
      }; img.src = url;
      for (const cb of this.photoCbs) cb(vis);
    });
  }
  onPhoto(cb: (visible: Actor[]) => void) { this.photoCbs.add(cb); return () => this.photoCbs.delete(cb); }
  photos(): string[] { try { return JSON.parse(localStorage.getItem(GALLERY_KEY) ?? '[]'); } catch { return []; } }
  private savePhotos(p: string[]) { for (let n = p.length; n > 0; n--) { try { localStorage.setItem(GALLERY_KEY, JSON.stringify(p.slice(0, n))); return; } catch { /* quota: drop oldest */ } } }

  // ------------------------------------------------------------ Pulse social feed
  private npcPost(text: string): Post { const [user, handle] = rng.pick(NPC_USERS); return { user, handle, text, likes: rng.int(2, 900), t: this.g.env?.hour ?? 9 }; }
  post(text: string, img?: string) { const P = this.g.player; this.feed.unshift({ user: P.name, handle: P.heroId === 'rosa' ? '@rosa.d' : '@jaceh', text, img, likes: 0, t: this.g.env.hour, mine: true }); this.followers += 3; this.g.hud.toast('Posted to Pulse'); }
  pulsePost(kind: string, arg?: any) {
    const t: Record<string, string[]> = {
      wanted: arg >= 3 ? ['HELICOPTERS over the city rn 🚁🚁', 'Whoever is running from the cops right now… godspeed??', 'Police chase on the news AGAIN 😭'] : ['Cop cars flying down Biscayne, what happened?', 'Sirens everywhere. Stay safe out there 🙏'],
      mission: ['Something big just went down, my scanner is going crazy', 'Heard a crazy story at the Flamingo today…'],
      robbery: [`${arg ?? 'A store'} just got robbed?!`, 'Stay safe out there, robbery reported on Calle Verde'], hero: ['Some woman just stopped a mugging on my street 🦸‍♀️', 'Bahía Verde has heroes after all'],
      club: ['Velvet Room is ON tonight 🍾🔥'], sunset: ['Golden hour at Sunline 🌅'],
    };
    const l = t[kind]; if (!l) return; const p = this.npcPost(rng.pick(l)); this.feed.unshift(p);
    if (kind === 'sunset') this.followers += 40;
    if (Math.random() < 0.5) this.notify(p.user, p.text, 'pulse');
  }
  toSave() { return { contacts: this.contacts, threads: this.threads, calls: this.calls.slice(0, 20), feed: this.feed.filter((p) => !p.img).slice(0, 20), followers: this.followers }; }
  fromSave(d: any) { if (d.contacts) this.contacts = d.contacts; this.threads = d.threads ?? {}; this.calls = d.calls ?? []; if (d.feed) this.feed = d.feed; this.followers = d.followers ?? 120; this.unread = {}; }
  static poi = poiById;
}
