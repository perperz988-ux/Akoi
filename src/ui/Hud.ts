import * as THREE from 'three';
import type { Game } from '../core/Game';
import { MapRender } from './MapRender';
import { MenuDef, MenuRow, FRIENDS } from '../economy/Economy';
import { WEAPONS } from '../combat/Weapons';
import { PRESETS, QualityName } from '../settings/Quality';
import { formatMoney } from '../core/MathUtil';
import * as L from '../world/CityLayout';
import { defById } from '../vehicles/VehicleDefs';

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const h = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; };

export class Hud {
  root: HTMLElement;
  map = new MapRender();
  menuOpen = false; phoneOpen = false; mapOpen = false; pauseOpen = false;
  skipRequested = false; deathFading = false; lastObjective = '';
  private el: Record<string, HTMLElement> = {};
  private mini!: CanvasRenderingContext2D;
  private toastQ: HTMLElement[] = [];
  private subT = 0; private ctxLabel: { label: string; run: () => void } | null = null;
  private moneyShown = 0; private moneyDeltaT = 0; private moneyDeltaV = 0;
  private fullView = { cx: 0, cz: 0, mpp: 6 };
  private menuDef: MenuDef | null = null;
  private bubbleEls = new Map<number, HTMLElement>();
  private fpsEl?: HTMLElement; private frames = 0; private fpsT = 0;
  private interiorHint = '';
  private hitT = 0;
  private lastStars = -1;
  private boot!: HTMLElement;

  constructor(private g: Game, ui: HTMLElement) {
    this.root = ui;
    ui.insertAdjacentHTML('beforeend', `
    <div id="vignette"></div><div id="damage"></div>
    <div class="hud-top-left"><canvas id="minimap" class="interactive" width="264" height="264"></canvas>
      <div class="hud-info"><div class="chip" id="place"><b>—</b></div><div class="chip" id="clock">09:30</div>
        <div class="bar hp"><i id="hpbar"></i></div><div class="bar ar"><i id="arbar"></i></div><div class="bar st"><i id="stbar"></i></div></div></div>
    <div id="cheatBtn" class="btn hit" style="position:absolute;z-index:25;top:calc(var(--sat) + 10px);left:calc(var(--sal) + 300px);padding:7px 12px;font-size:13px;display:none;pointer-events:auto">⚡ CHEATS</div>
    <div class="hud-top-right"><div id="money">$0</div><div id="moneyDelta"></div><div id="stars"><i>★</i><i>★</i><i>★</i><i>★</i><i>★</i></div><div id="weaponBox"><div class="w" id="wname"></div><div id="wammo"></div></div></div>
    <div id="speedo"><div class="kmh" id="kmh">0</div><div class="u">km/h · <span class="gear" id="gear">N</span></div><div id="rpmbar"><i></i></div><div id="nitrobar"><i></i></div><div id="vehHealth"><i></i></div><div id="radioTag"></div></div>
    <div id="crosshair"></div><div id="hitmark"></div>
    <div id="timer"></div><div id="detect"><i></i></div><div id="raceinfo"></div><div id="countdown"></div>
    <div id="toasts"></div><div id="bubbles"></div>
    <div class="hud-bottom-center"><div id="subtitle"></div><div id="progress"><i></i></div><div id="prompt"></div></div>
    <div id="objective"><small id="objT"></small><span id="objX"></span></div>
    <div id="bustbar"><i></i></div>
    <div id="dialogue"><div class="n"></div><div class="r"></div><div class="t"></div><button class="btn" id="dlgOk">OK</button></div>
    <div id="letterTop"></div><div id="letterBot"></div>
    <div id="bigmsg"><h1></h1><p></p><div class="btns"></div></div>
    <div class="overlay" id="menuOv"><div class="panel"><h2 id="menuTitle"></h2><div class="sub" id="menuSub"></div><div class="scroll" id="menuBody"></div><div style="margin-top:8px;text-align:right"><span class="btn" id="menuClose">Close</span></div></div></div>
    <div class="overlay" id="phoneOv"><div class="panel"><div class="phonebar" id="phoneBar"></div><div class="scroll" id="phoneBody"></div><div style="margin-top:8px;text-align:right"><span class="btn" id="phoneClose">Close</span></div></div></div>
    <div class="overlay" id="mapOv"><div class="panel"><h2>City Map</h2><div class="sub">Drag to pan · pinch or +/- to zoom · tap to set waypoint</div><canvas id="fullmap" class="interactive"></canvas><div class="legend" id="legend"></div><div style="margin-top:8px;display:flex;gap:8px;justify-content:flex-end"><span class="btn" id="mapMinus">−</span><span class="btn" id="mapPlus">+</span><span class="btn" id="mapClear">Clear waypoint</span><span class="btn" id="mapClose">Close</span></div></div></div>
    <div class="overlay" id="pauseOv"><div class="panel"><div class="tabs" id="pauseTabs"></div><div class="scroll" id="pauseBody"></div><div style="margin-top:8px;display:flex;gap:8px;justify-content:space-between"><span class="btn danger" id="quitTitle">Quit to title</span><span class="btn primary" id="pauseClose">Resume</span></div></div></div>
    <div id="title"></div>
    <div id="fade"></div>
    <div id="fps" style="position:absolute;left:50%;top:2px;transform:translateX(-50%);font-size:11px;color:#9f9;display:none"></div>
    <div id="boot"><div style="font-size:34px;font-weight:900;letter-spacing:6px">PORT <span style="color:var(--accent)">SOLANO</span></div><div id="bootMsg" style="color:var(--dim);font-size:13px">Starting engine…</div><div class="bar"><i id="bootBar"></i></div></div>`);
    for (const id of ['place', 'clock', 'hpbar', 'arbar', 'stbar', 'money', 'moneyDelta', 'stars', 'wname', 'wammo', 'speedo', 'kmh', 'gear', 'crosshair', 'hitmark', 'timer', 'detect', 'raceinfo', 'countdown', 'toasts', 'bubbles', 'subtitle', 'progress', 'prompt', 'objective', 'objT', 'objX', 'bustbar', 'dialogue', 'bigmsg', 'menuOv', 'menuBody', 'menuTitle', 'menuSub', 'phoneOv', 'phoneBar', 'phoneBody', 'mapOv', 'fullmap', 'legend', 'pauseOv', 'pauseTabs', 'pauseBody', 'title', 'fade', 'damage', 'radioTag', 'fps', 'boot', 'bootBar', 'bootMsg'])
      this.el[id] = $('#' + id, ui);
    this.boot = this.el.boot; this.fpsEl = this.el.fps;
    this.mini = (this.el.place.parentElement!.parentElement!.querySelector('#minimap') as HTMLCanvasElement).getContext('2d')!;
    $('#minimap', ui).addEventListener('click', () => this.openMap());
    $('#cheatBtn', ui).addEventListener('click', () => { g.audio.uiClick(); g.cheats.open(); });
    $('#menuClose', ui).addEventListener('click', () => this.closeMenu());
    $('#phoneClose', ui).addEventListener('click', () => this.togglePhone(false));
    $('#mapClose', ui).addEventListener('click', () => this.openMap(false));
    $('#mapClear', ui).addEventListener('click', () => g.markers.clearWaypoint());
    $('#mapPlus', ui).addEventListener('click', () => { this.fullView.mpp = Math.max(1.2, this.fullView.mpp / 1.4); });
    $('#mapMinus', ui).addEventListener('click', () => { this.fullView.mpp = Math.min(9, this.fullView.mpp * 1.4); });
    $('#pauseClose', ui).addEventListener('click', () => this.togglePause(false));
    $('#quitTitle', ui).addEventListener('click', () => g.quitToTitle());
    $('#dlgOk', ui).addEventListener('click', () => { this.el.dialogue.style.display = 'none'; });
    this.setupFullMap();
    for (const sel of ['#menuOv', '#phoneOv', '#mapOv', '#pauseOv']) { ($(sel, ui) as HTMLElement).addEventListener('pointerdown', (e) => e.stopPropagation()); }
  }

  bootProgress(frac: number, msg?: string) { this.el.bootBar.style.width = Math.round(frac * 100) + '%'; if (msg) this.el.bootMsg.textContent = msg; }
  hideBoot() { this.boot.style.display = 'none'; }

  // ---------------------------------------------------------------- simple feedback
  private toastSeen = new Map<string, number>();
  toast(text: string, secs = 2.6) {
    const now = performance.now(), last = this.toastSeen.get(text) ?? -1e9;
    if (now - last < 4500) return;   // never spam the same message
    this.toastSeen.set(text, now);
    const d = h(`<div class="toast">${text}</div>`); this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild!.remove();
    setTimeout(() => d.remove(), secs * 1000);
  }
  moneyDelta(n: number) { this.moneyDeltaV = (this.moneyDeltaT > 0 ? this.moneyDeltaV : 0) + n; this.moneyDeltaT = 2.2; }
  hit(dx: number, dz: number) { this.el.damage.style.opacity = '1'; this.hitT = 0.35; void dx; void dz; if (this.g.settings.vibration && navigator.vibrate) navigator.vibrate(30); }
  hitMarker(kill: boolean, head: boolean) { const e = this.el.hitmark; e.className = ''; void e.offsetWidth; e.className = 'on' + (kill || head ? ' kill' : ''); this.g.audio.click(); }
  wantedChanged(n: number) { this.toast(n ? `Wanted level ${n}` : 'Wanted level cleared'); }
  busted(frac: number) { const b = this.el.bustbar; b.style.display = frac > 0 ? 'block' : 'none'; (b.firstElementChild as HTMLElement).style.width = Math.min(100, frac * 100) + '%'; }
  setObjective(title: string, text: string) { this.el.objective.style.display = title || text ? 'block' : 'none'; this.el.objT.textContent = title; this.el.objX.textContent = text; this.lastObjective = text; }
  setTimer(label: string, sec: number) { const e = this.el.timer; if (!label) { e.style.display = 'none'; return; } e.style.display = 'block'; e.textContent = `${label} ${Math.max(0, Math.ceil(sec))}s`; e.style.color = sec < 15 ? '#ff4d6d' : '#fff'; }
  setPrompt(t: string) { this.el.prompt.style.display = t ? 'block' : 'none'; this.el.prompt.textContent = t; this.promptTimer = 0.2; }
  private promptTimer = 0;
  setProgress(f: number) { this.el.progress.style.display = f > 0 ? 'block' : 'none'; (this.el.progress.firstElementChild as HTMLElement).style.width = f * 100 + '%'; }
  setDetection(f: number) { const e = this.el.detect; e.style.display = f > 0.01 ? 'block' : 'none'; (e.firstElementChild as HTMLElement).style.width = f * 100 + '%'; }
  setLetterbox(on: boolean) { document.body.classList.toggle('letterbox', on); }
  subtitle(who: string, text: string, ttl = 4) { this.el.subtitle.innerHTML = text ? (who ? `<b>${who}:</b> ${text}` : text) : ''; this.subT = ttl; }
  setContext(label: string, run: () => void) { this.ctxLabel = { label, run }; }
  getContext() { const c = this.ctxLabel; return c; }
  setInteriorHint(t: string) { this.interiorHint = t; }
  countdown(n: number) { const e = this.el.countdown; e.style.display = n > 0 ? 'block' : 'none'; e.textContent = String(n); if (n === 0) { e.style.display = 'block'; e.textContent = 'GO!'; setTimeout(() => (e.style.display = 'none'), 700); } }
  race(on: boolean) { this.el.raceinfo.style.display = on ? 'block' : 'none'; }
  raceInfo(pos: number, total: number, lap: number, laps: number) { this.el.raceinfo.innerHTML = `${pos}<small>/${total}</small><br><small>Lap ${Math.min(lap, laps)}/${laps}</small>`; }

  async fade(on: boolean, dur = 0.25) { const f = this.el.fade; f.style.transitionDuration = dur + 's'; f.classList.toggle('on', on); await new Promise((r) => setTimeout(r, dur * 1000)); }
  fadeOut() { this.deathFading = true; this.el.fade.style.transitionDuration = '0.8s'; this.el.fade.classList.add('on'); }
  hideFade() { this.deathFading = false; this.el.fade.style.transitionDuration = '0.4s'; this.el.fade.classList.remove('on'); }
  showDeath(on: boolean) {
    const b = this.el.bigmsg; if (!on) { b.style.display = 'none'; this.hideFade(); return; }
    b.className = 'death'; (b.querySelector('h1') as HTMLElement).textContent = 'OUT OF ACTION'; (b.querySelector('p') as HTMLElement).textContent = 'You are being taken to the nearest hospital…'; (b.querySelector('.btns') as HTMLElement).innerHTML = ''; b.style.display = 'flex';
  }
  flashMessage(title: string, sub: string) { const b = this.el.bigmsg; b.className = 'busted'; (b.querySelector('h1') as HTMLElement).textContent = title; (b.querySelector('p') as HTMLElement).textContent = sub; (b.querySelector('.btns') as HTMLElement).innerHTML = ''; b.style.display = 'flex'; this.hideFade(); setTimeout(() => (b.style.display = 'none'), 2600); }
  missionBanner(title: string, blurb: string) { this.toast(`<b style="color:var(--accent)">MISSION</b> · ${title}`, 4); this.subtitle('', blurb, 5); }
  missionComplete(title: string, cash: number, unlock?: string) {
    const b = this.el.bigmsg; b.className = 'pass'; (b.querySelector('h1') as HTMLElement).textContent = 'MISSION PASSED'; (b.querySelector('p') as HTMLElement).innerHTML = `${title}<br><b style="color:#c9f7d0">+${formatMoney(cash)}</b>${unlock ? '<br>' + unlock : ''}`; (b.querySelector('.btns') as HTMLElement).innerHTML = ''; b.style.display = 'flex'; setTimeout(() => (b.style.display = 'none'), 3600);
  }
  missionFailed(title: string, why: string, retry: () => void, quit: () => void) {
    const b = this.el.bigmsg; b.className = 'fail'; (b.querySelector('h1') as HTMLElement).textContent = 'MISSION FAILED'; (b.querySelector('p') as HTMLElement).innerHTML = `${title}<br>${why}`;
    const btns = b.querySelector('.btns') as HTMLElement; btns.innerHTML = '<span class="btn primary hit" id="mfRetry">Retry from checkpoint</span><span class="btn hit" id="mfQuit">Give up</span>'; b.style.display = 'flex';
    const done = (fn: () => void) => () => { b.style.display = 'none'; this.g.audio.uiClick(); fn(); };
    $('#mfRetry', b).addEventListener('click', done(retry)); $('#mfQuit', b).addEventListener('click', done(quit));
  }
  dialogue(name: string, text: string, role: string) { const d = this.el.dialogue; d.style.display = 'block'; (d.querySelector('.n') as HTMLElement).textContent = name; (d.querySelector('.r') as HTMLElement).textContent = role; (d.querySelector('.t') as HTMLElement).textContent = text; clearTimeout((d as any)._t); (d as any)._t = setTimeout(() => (d.style.display = 'none'), 6000); this.g.audio.uiOpen(); }

  // ---------------------------------------------------------------- menus
  openMenu(def: MenuDef) {
    this.menuDef = def; this.menuOpen = true; this.root.classList.add('panelopen'); this.el.menuOv.classList.add('on'); this.g.paused = true; this.renderMenu(); this.g.audio.uiOpen(); this.g.input.touchMoveX = this.g.input.touchMoveY = 0;
  }
  refreshMenu() { if (this.menuDef && this.menuOpen) this.renderMenu(); }
  closeMenu() { if (!this.menuOpen) return; this.menuOpen = false; this.root.classList.remove('panelopen'); this.el.menuOv.classList.remove('on'); this.menuDef?.onClose?.(); this.menuDef = null; if (!this.pauseOpen && !this.phoneOpen && !this.mapOpen) this.g.paused = false; }
  private renderMenu() {
    const def = this.menuDef!; this.el.menuTitle.textContent = def.title; this.el.menuSub.innerHTML = `${def.subtitle ?? ''} · <b style="color:#c9f7d0">${formatMoney(this.g.economy.money)}</b>`;
    const body = this.el.menuBody; const st = body.scrollTop; body.innerHTML = '';
    for (const r of def.build()) body.appendChild(this.rowEl(r));
    body.scrollTop = st;
  }
  private rowEl(r: MenuRow) {
    const afford = r.price === undefined || this.g.economy.money >= r.price;
    const e = h(`<div class="row ${r.header ? 'header' : ''} ${r.disabled ? 'disabled' : ''}">${r.swatch !== undefined ? `<div class="sw" style="background:#${r.swatch.toString(16).padStart(6, '0')}"></div>` : ''}<div class="l"><div>${r.label}</div>${r.sub ? `<small>${r.sub}</small>` : ''}</div>${r.price !== undefined && r.price > 0 ? `<div class="p" style="${afford ? '' : 'color:#ff9aa8'}">${formatMoney(r.price)}</div>` : ''}</div>`);
    if (!r.header && !r.disabled && r.action) e.addEventListener('click', () => { this.g.audio.uiClick(); r.action!(); if (r.keepOpen) this.refreshMenu(); else this.closeMenu(); });
    return e;
  }

  // ---------------------------------------------------------------- phone
  togglePhone(force?: boolean) {
    const on = force ?? !this.phoneOpen; if (on === this.phoneOpen) return;
    if (on && (this.g.state !== 'playing' || this.g.interiors.active && false)) return;
    this.phoneOpen = on; this.el.phoneOv.classList.toggle('on', on); this.g.paused = on || this.menuOpen || this.pauseOpen || this.mapOpen;
    if (on) { this.phoneTab = this.phoneTab || 'missions'; this.renderPhone(); this.g.audio.uiOpen(); this.g.player.phoneUp = false; }
    this.g.input.touchMoveX = this.g.input.touchMoveY = 0;
  }
  private phoneTab = 'missions';
  private renderPhone() {
    const g = this.g, bar = this.el.phoneBar, body = this.el.phoneBody;
    const tabs: [string, string, string][] = [['missions', '★', 'Missions'], ['contacts', '☎', 'Contacts'], ['vehicles', '🚗', 'Vehicles'], ['taxi', '🚕', 'Taxi'], ['business', '💼', 'Business'], ['stats', '📊', 'Stats'], ['map', '🗺', 'Map']];
    bar.innerHTML = ''; for (const [id, ic, label] of tabs) { const b = h(`<div class="pbtn ${this.phoneTab === id ? 'on' : ''}"><b>${ic}</b>${label}</div>`); b.addEventListener('click', () => { if (id === 'map') { this.togglePhone(false); this.openMap(); return; } this.phoneTab = id; this.renderPhone(); g.audio.uiClick(); }); bar.appendChild(b); }
    body.innerHTML = '';
    const row = (label: string, sub: string, action?: () => void, price?: number) => { const e = this.rowEl({ label, sub, action, price, keepOpen: true, disabled: !action }); body.appendChild(e); };
    const head = (t: string) => body.appendChild(this.rowEl({ label: t, header: true }));
    if (this.phoneTab === 'missions') {
      const act = g.missions.active;
      if (act) { head('Active'); row(act.mission.title, g.hud?.lastObjective || act.mission.blurb, () => { g.markers.setWaypoint(act.mission.start.x, act.mission.start.z); }); row('Abandon mission', 'Progress on this attempt will be lost', () => { g.missions.abandon(); this.togglePhone(false); }); }
      head('Available story'); for (const m of g.missions.available().filter((m) => !m.side)) row(m.title, `${m.chapter} · ${m.blurb}`, () => { g.markers.setWaypoint(m.start.x, m.start.z); this.togglePhone(false); this.toast('Mission start marked'); });
      head('Side jobs (repeatable)'); for (const m of g.missions.available().filter((m) => m.side)) row(m.title, `${m.blurb} · ${formatMoney(m.reward.cash)}`, () => { g.markers.setWaypoint(m.start.x, m.start.z); this.togglePhone(false); });
      head('Completed'); for (const id of g.missions.completed) { const m = g.missions.missions.find((x) => x.id === id); if (m && !m.side) row(m.title, 'Completed'); }
    } else if (this.phoneTab === 'contacts') {
      for (const [id, f] of Object.entries(FRIENDS)) { const un = g.economy.friendUnlocked(id); row(un ? f.name : '???', un ? `${f.role} · Relationship ${g.economy.friends[id]}/100 · Perk: ${f.perk}` : 'Not met yet', un ? () => this.callFriend(id) : undefined); }
    } else if (this.phoneTab === 'vehicles') {
      head('Your vehicles'); if (!g.vehicles.owned.length) row('No owned vehicles', 'Buy one at Solano Motorhaus or Vela Marina');
      for (const o of g.vehicles.owned) { const d = defById(o.defId); const live = g.vehicles.list.find((v) => v.ownerId === o.uid); row(`${d.maker} ${d.name}`, o.stored ? 'Stored in garage' : live ? `In the city · ${Math.round(Math.hypot(live.x - g.player.x, live.z - g.player.z))} m away` : 'Parked', () => this.vehicleOptions(o.uid), undefined); }
    } else if (this.phoneTab === 'taxi') {
      head('Sol Cab — fast travel'); for (const r of g.economy.poiMenu(g.poi('taxi'))?.build() ?? []) { if (r.header) continue; row(r.label, `${r.sub ?? ''}`, r.action ? () => { r.action!(); this.togglePhone(false); } : undefined, r.price); }
    } else if (this.phoneTab === 'business') {
      const e = g.economy; head('Properties'); for (const id of e.properties) row(g.poi(id).name, 'Owned safehouse'); head('Businesses');
      let any = false; for (const b of Object.values(e.businesses)) if (b.owned) { any = true; row(b.name, `Level ${b.level} · ${formatMoney(b.incomePerHour * (1 + (b.level - 1) * 0.5))}/hr · waiting ${formatMoney(b.pending)}`); }
      if (!any) row('No businesses yet', 'Visit Bayline Realty to invest');
      row('Collect all income', `${formatMoney(e.pendingIncome())} ready`, () => { e.collectIncome(); this.renderPhone(); });
    } else if (this.phoneTab === 'stats') {
      const p = g.player, s = p.stats;
      const stat = (a: string, b: string) => body.appendChild(h(`<div class="stat"><span>${a}</span><b>${b}</b></div>`));
      stat('Money', formatMoney(g.economy.money)); stat('Total earned', formatMoney(g.economy.totalEarned)); stat('Missions', String(s.missions)); stat('Kills', String(s.kills)); stat('Knockouts', String(s.knockouts)); stat('Crimes', String(s.crimes)); stat('Vehicles stolen', String(s.carsStolen));
      stat('Distance', (s.distance / 1000).toFixed(1) + ' km'); stat('Play time', Math.floor(s.timePlayed / 60) + ' min');
      for (const [k, v] of Object.entries(p.skills) as [string, number][]) stat(k[0].toUpperCase() + k.slice(1), Math.round(v * 100) + '%');
      stat('Day', String(g.env.day));
    }
  }
  private callFriend(id: string) {
    const g = this.g;
    if (id === 'teo' && g.economy.friends.teo >= 25) { const o = g.vehicles.owned.find((x) => !x.stored); if (o) { this.toast('Teo is bringing your car'); } }
    g.audio.phoneRing(); this.toast(`Calling ${FRIENDS[id].name}…`);
    setTimeout(() => this.dialogue(FRIENDS[id].name, ({ odessa: 'Come by the garage when you can. Business is business.', teo: 'Race night soon, old man. Bring a clean car.', hart: 'Keep your head down. If you need a favour, drop by the station.', juno: 'I picked up chatter near the docks. Check the bar on Harbor Row for leads.' } as any)[id], FRIENDS[id].role), 1200);
  }
  private vehicleOptions(uid: string) {
    const g = this.g, o = g.vehicles.owned.find((x) => x.uid === uid)!;
    this.openMenu({ title: defById(o.defId).name, subtitle: 'Vehicle services', build: () => [
      { label: 'Mark on map', action: () => { const v = g.vehicles.list.find((x) => x.ownerId === uid); if (v) g.markers.setWaypoint(v.x, v.z); else if (o.stored) g.hud?.toast('It is stored in a garage'); } },
      { label: 'Deliver to my location', sub: g.economy.friends.teo >= 25 ? 'Free (Teo)' : '$300', price: g.economy.friends.teo >= 25 ? 0 : 300, action: () => { const cost = g.economy.friends.teo >= 25 ? 0 : 300; if (!g.economy.spend(cost, 'Vehicle delivery')) { g.hud?.toast('Not enough money'); return; } this.togglePhone(false); g.deliverOwned(uid); } },
    ] });
  }

  // ---------------------------------------------------------------- full map
  openMap(on = true) {
    this.mapOpen = on; this.el.mapOv.classList.toggle('on', on); this.g.paused = on || this.menuOpen || this.pauseOpen || this.phoneOpen;
    if (on) { const p = this.g.player; this.fullView.cx = p.x; this.fullView.cz = p.z; this.fullView.mpp = 5; this.sizeMap(); this.renderLegend(); this.g.audio.uiOpen(); }
  }
  private sizeMap() { const c = this.el.fullmap as HTMLCanvasElement; const r = c.getBoundingClientRect(); c.width = Math.max(300, Math.floor(r.width * Math.min(2, devicePixelRatio))); c.height = Math.max(200, Math.floor(r.height * Math.min(2, devicePixelRatio))); }
  private renderLegend() { this.el.legend.innerHTML = [['#ffd166', 'Mission'], ['#38bdf8', 'Side job'], ['#ff4d6d', 'Waypoint'], ['#4ade80', 'Safehouse'], ['#fb923c', 'Food'], ['#f472b6', 'Dealer / event']].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join(''); }
  private setupFullMap() {
    const c = this.el.fullmap as HTMLCanvasElement; const pts = new Map<number, { x: number; y: number }>(); let moved = 0; let pinch = 0;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); } });
    c.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const r = c.getBoundingClientRect(), k = (c.width / r.width);
      if (pts.size === 1) { const dx = e.clientX - p.x, dy = e.clientY - p.y; moved += Math.abs(dx) + Math.abs(dy); this.fullView.cx -= dx * k * this.fullView.mpp; this.fullView.cz -= dy * k * this.fullView.mpp; }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch) this.fullView.mpp = Math.max(1.2, Math.min(9, this.fullView.mpp * pinch / d)); pinch = d; moved += 10; }
    });
    c.addEventListener('pointerup', (e) => {
      const p = pts.get(e.pointerId); pts.delete(e.pointerId);
      if (p && moved < 8 && pts.size === 0) { const r = c.getBoundingClientRect(), k = c.width / r.width; const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k; const wx = this.fullView.cx + (x - c.width / 2) * this.fullView.mpp, wz = this.fullView.cz + (y - c.height / 2) * this.fullView.mpp; this.g.markers.setWaypoint(wx, wz); this.g.audio.uiClick(); }
    });
    c.addEventListener('wheel', (e) => { this.fullView.mpp = Math.max(1.2, Math.min(9, this.fullView.mpp * (e.deltaY > 0 ? 1.15 : 0.87))); e.preventDefault(); }, { passive: false });
  }

  // ---------------------------------------------------------------- pause menu
  togglePause(force?: boolean) {
    const on = force ?? !this.pauseOpen; if (on === this.pauseOpen) return;
    if (on && this.g.state !== 'playing') return;
    this.pauseOpen = on; this.el.pauseOv.classList.toggle('on', on); this.g.paused = on || this.menuOpen || this.phoneOpen || this.mapOpen; this.g.audio.suspend(false);
    if (on) { this.pauseTab = 'save'; this.renderPause(); this.g.audio.uiOpen(); }
    else this.g.saveSettings();
    this.g.input.touchMoveX = this.g.input.touchMoveY = 0;
  }
  private pauseTab = 'save';
  private renderPause() {
    const g = this.g, tabs = this.el.pauseTabs, body = this.el.pauseBody;
    const list: [string, string][] = [['save', 'Save / Load'], ['graphics', 'Graphics'], ['controls', 'Controls'], ['audio', 'Audio'], ['cheats', 'Cheats'], ['help', 'Help']];
    tabs.innerHTML = ''; for (const [id, t] of list) { const b = h(`<div class="tab ${this.pauseTab === id ? 'on' : ''}">${t}</div>`); b.addEventListener('click', () => { this.pauseTab = id; this.renderPause(); g.audio.uiClick(); }); tabs.appendChild(b); }
    body.innerHTML = '';
    const S = g.settings;
    const sel = (label: string, opts: [string, string][], val: string, on: (v: string) => void) => { const d = h(`<div class="setting"><label>${label}</label><select>${opts.map(([v, t]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`); d.querySelector('select')!.addEventListener('change', (e) => on((e.target as HTMLSelectElement).value)); body.appendChild(d); };
    const rng = (label: string, min: number, max: number, step: number, val: number, on: (v: number) => void) => { const d = h(`<div class="setting"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><span style="width:44px;text-align:right">${val}</span></div>`); const i = d.querySelector('input')!, s = d.querySelector('span')!; i.addEventListener('input', () => { s.textContent = i.value; on(parseFloat(i.value)); }); body.appendChild(d); };
    const chk = (label: string, val: boolean, on: (v: boolean) => void) => { const d = h(`<div class="setting"><label>${label}</label><input type="checkbox" ${val ? 'checked' : ''}></div>`); d.querySelector('input')!.addEventListener('change', (e) => on((e.target as HTMLInputElement).checked)); body.appendChild(d); };
    const btn = (label: string, on: () => void, cls = '') => { const d = h(`<div class="setting"><span class="btn ${cls}">${label}</span></div>`); d.querySelector('.btn')!.addEventListener('click', on); body.appendChild(d); };
    if (this.pauseTab === 'save') {
      body.appendChild(h(`<div class="sub">Autosave runs every few minutes when safe. Saves use app-private storage on Android.</div>`));
      g.saves.listSlots().then((slots) => { for (const s of slots) { const d = h(`<div class="slot"><div style="flex:1"><b>Slot ${s.slot}${g.saves.currentSlot === s.slot ? ' ★' : ''}</b><br><small>${s.used ? `${s.name} · ${s.chapter} · ${formatMoney(s.money)} · Day ${s.day} · ${Math.floor(s.playTime / 60)} min · ${new Date(s.time).toLocaleString()}` : 'Empty'}</small></div><span class="btn primary" data-a="save">Save</span>${s.used ? '<span class="btn" data-a="load">Load</span><span class="btn danger" data-a="del">✕</span>' : ''}</div>`); d.querySelectorAll('.btn').forEach((b) => b.addEventListener('click', async () => { const a = (b as HTMLElement).dataset.a; g.audio.uiClick(); if (a === 'save') { await g.saves.save(s.slot); this.toast(`Saved to slot ${s.slot}`); } else if (a === 'load') { this.togglePause(false); await g.loadSlot(s.slot); } else if (a === 'del') { await g.saves.remove(s.slot); } this.renderPause(); })); body.appendChild(d); } });
    } else if (this.pauseTab === 'graphics') {
      const rec = g.recommended; body.appendChild(h(`<div class="sub">Detected: ${rec.reason}<br>Recommended preset: <b style="color:var(--accent)">${rec.preset}</b> · Active: <b>${g.quality.name}</b> · Render scale ${(g.dynRes.scale * 100) | 0}%</div>`));
      sel('Graphics preset', [['AUTO', `Auto (${rec.preset})`], ['LOW', 'Low'], ['MEDIUM', 'Medium'], ['HIGH', 'High'], ['ULTRA', 'Ultra']], S.quality, (v) => { S.quality = v as any; g.applyQuality(); this.renderPause(); });
      chk('Dynamic resolution (auto-scales to hold FPS)', S.dynamicRes, (v) => { S.dynamicRes = v; g.dynRes.enabled = v; if (!v) { g.dynRes.scale = 1; g.applyResolution(); } });
      rng('Resolution scale', 0.5, 1, 0.05, S.resScale, (v) => { S.resScale = v; g.applyResolution(); });
      rng('Field of view', 50, 85, 1, S.fov, (v) => { S.fov = v; g.cam.fovBase = v; });
      chk('Show FPS', S.showFps, (v) => { S.showFps = v; this.el.fps.style.display = v ? 'block' : 'none'; });
      body.appendChild(h(`<div class="sub">${['LOW: no shadows, short draw distance, minimal traffic.', 'MEDIUM: shadows, reflections, medium crowds.', 'HIGH: big shadows, bloom, rain, dense city.', 'ULTRA: maximum density, 4K shadows, premium paint.'][['LOW', 'MEDIUM', 'HIGH', 'ULTRA'].indexOf(g.quality.name)]}</div>`));
    } else if (this.pauseTab === 'controls') {
      rng('Camera sensitivity', 0.3, 2.5, 0.1, S.sensitivity, (v) => { S.sensitivity = v; g.cam.sensitivity = v; });
      chk('Invert Y axis', S.invertY, (v) => { S.invertY = v; });
      chk('Auto-sprint when stick is fully pushed', S.autoSprint, (v) => { S.autoSprint = v; g.player.autoSprint = v; });
      chk('Aim assist', S.aimAssist, (v) => { S.aimAssist = v; });
      chk('Tilt steering in vehicles', S.tiltSteer, (v) => { S.tiltSteer = v; });
      chk('Haptic feedback', S.vibration, (v) => { S.vibration = v; });
      chk('Fixed joystick position', S.stickFixed, (v) => { S.stickFixed = v; g.touch.applyLayout(); });
      chk('Force touch controls (tablets / testing)', S.forceTouch, (v) => { S.forceTouch = v; });
      rng('Touch button size', 0.7, 1.5, 0.05, S.touchScale, (v) => { g.touch.scaleAll(v); });
      rng('Touch button opacity', 0.3, 1, 0.05, S.touchOpacity, (v) => { S.touchOpacity = v; g.touch.applyLayout(); });
      btn('Edit touch layout (drag buttons)', () => { this.togglePause(false); g.touch.setEditing(true); this.showLayoutBar(); }, 'primary');
      btn('Reset touch layout', () => { g.touch.resetLayout(); this.toast('Layout reset'); });
      body.appendChild(h(`<div class="sub">Controller: ${g.input.gamepadConnected ? 'connected ✓' : 'press any button on your gamepad to connect'} — Left stick move, right stick camera, RT/LT accelerate/brake or fire/aim, A jump, B dodge, X attack, Y enter/exit, LB weapon, RB cover/horn, D-pad ↑ phone, Start pause, Select map.</div>`));
    } else if (this.pauseTab === 'cheats') {
      body.appendChild(h(`<div class="sub">Cheats are for sandbox fun. In the story they can make missions trivial — saves still work.</div>`));
      chk('Show ⚡ CHEATS button on screen', S.cheatsButton, (v) => { S.cheatsButton = v; });
      btn('Open cheat menu', () => { this.togglePause(false); setTimeout(() => g.cheats.open(), 50); }, 'primary');
    } else if (this.pauseTab === 'audio') {
      rng('Master', 0, 1, 0.05, S.volMaster, (v) => { S.volMaster = v; g.audio.setVolumes({ master: v }); });
      rng('Effects & engines', 0, 1, 0.05, S.volSfx, (v) => { S.volSfx = v; g.audio.setVolumes({ sfx: v }); });
      rng('Music & radio', 0, 1, 0.05, S.volMusic, (v) => { S.volMusic = v; g.audio.setVolumes({ music: v }); });
      rng('Ambience', 0, 1, 0.05, S.volAmb, (v) => { S.volAmb = v; g.audio.setVolumes({ amb: v }); });
    } else {
      body.appendChild(h(`<div class="sub" style="font-size:13px;line-height:1.6;color:#dfe6f2">
        <b>On foot</b> — left stick move · right side drag camera · Jump / Crouch / Dodge roll / Cover (near walls) · Aim (hold) then Fire · Reload · Weapon cycle · Phone.<br>
        <b>Context button</b> shows what you can do here: enter vehicles, shops, start missions, talk, rob (armed).<br>
        <b>Stealth</b> — crouch behind unaware targets and attack for a silent takedown. Fists/bat/taser are non-lethal. Witnesses phone in crimes; unseen crimes don't raise wanted level.<br>
        <b>Vehicles</b> — stick steers, GAS / BRAKE (reverse when stopped), handbrake drifts, NOS boosts. Helicopters: stick flies, Up/Down changes altitude. Boats: GAS & stick.<br>
        <b>Police</b> — break line of sight and hide to lose stars. Hart (a contact) can clear wanted level once you're close.<br>
        <b>Keyboard</b> WASD, Shift, Space, F enter/exit, E interact, C crouch, Q cover, Alt/Z dodge, R reload, Tab weapon, V camera, H horn/siren, M map, P phone, Esc pause.</div>`));
    }
  }
  private showLayoutBar() {
    const g = this.g; const bar = h(`<div style="position:absolute;left:50%;top:10px;transform:translateX(-50%);display:flex;gap:8px;z-index:20;pointer-events:auto"><span class="btn primary hit">Done</span><span class="btn hit">Reset</span><span class="btn hit">Smaller</span><span class="btn hit">Bigger</span></div>`);
    this.root.appendChild(bar); const [done, reset, sm, bg] = Array.from(bar.children) as HTMLElement[];
    done.onclick = () => { g.touch.setEditing(false); bar.remove(); g.saveSettings(); };
    reset.onclick = () => g.touch.resetLayout(); sm.onclick = () => g.touch.scaleAll(Math.max(0.6, g.settings.touchScale - 0.1)); bg.onclick = () => g.touch.scaleAll(Math.min(1.6, g.settings.touchScale + 0.1));
  }

  // ---------------------------------------------------------------- title screen
  showTitle(on: boolean) {
    const t = this.el.title; t.classList.toggle('on', on); this.root.classList.toggle('titlemode', on); if (!on) return;
    t.innerHTML = `<h1>PORT<br><span>SOLANO</span></h1><p>An open-world crime saga on the Florida-style coast. Original story, original city — drive, fight, build your empire.</p><div class="menu"></div><div class="sub" style="margin-top:14px;font-size:11px;color:var(--dim)" id="tipline"></div>`;
    const m = t.querySelector('.menu') as HTMLElement;
    const add = (label: string, cls: string, fn: () => void) => { const b = h(`<span class="btn ${cls}">${label}</span>`); b.addEventListener('click', () => { this.g.audio.init(); this.g.audio.uiClick(); fn(); }); m.appendChild(b); return b; };
    this.g.saves.listSlots().then((slots) => {
      const last = slots.filter((s) => s.used).sort((a, b) => b.time - a.time)[0];
      if (last) add(`Continue — Slot ${last.slot}`, 'primary', () => this.g.loadSlot(last.slot));
      add('New Game (Story)', last ? '' : 'primary', () => this.slotPicker());
      add('Free Roam (sandbox, no missions)', '', () => this.slotPicker(false, true));
      if (last) add('Load Game', '', () => this.slotPicker(true));
      add('Settings', '', () => this.titleSettings());
    });
    $('#tipline', t).textContent = `Detected: ${this.g.recommended.reason} → ${this.g.recommended.preset} · v1.0`;
  }
  private slotPicker(load = false, free = false) {
    this.openMenu({ title: load ? 'Load Game' : free ? 'Free Roam — choose a slot' : 'New Game — choose a slot', subtitle: load ? 'Pick a save' : 'Existing saves in a slot are overwritten when you save', build: () => [{ label: 'Loading…', disabled: true }], onClose: () => {} });
    this.g.saves.listSlots().then((slots) => {
      this.menuDef = { title: load ? 'Load Game' : 'New Game — choose a slot', subtitle: '', build: () => slots.filter((s) => !load || s.used).map((s) => ({ label: `Slot ${s.slot}`, sub: s.used ? `${s.chapter} · ${formatMoney(s.money)} · ${Math.floor(s.playTime / 60)} min` : 'Empty', action: () => { if (load) this.g.loadSlot(s.slot); else this.g.newGame(s.slot, free); } })) };
      this.renderMenu();
    });
  }
  private titleSettings() { this.g.state === 'title'; this.pauseOpen = true; this.el.pauseOv.classList.add('on'); this.pauseTab = 'graphics'; this.renderPause(); const close = $('#pauseClose', this.root); const orig = close.onclick; close.onclick = () => { this.pauseOpen = false; this.el.pauseOv.classList.remove('on'); this.g.saveSettings(); close.onclick = orig; this.g.applyQuality(); }; }

  // ---------------------------------------------------------------- per-frame update
  update(dt: number) {
    const g = this.g, p = g.player, e = this.el;
    this.frames++; this.fpsT += dt; if (this.fpsT >= 0.5) { if (g.settings.showFps && this.fpsEl) this.fpsEl.textContent = `${Math.round(this.frames / this.fpsT)} fps · ${g.quality.name} · ${Math.round(g.dynRes.scale * 100)}% · tris ${(g.renderer.info.render.triangles / 1000) | 0}k · calls ${g.renderer.info.render.calls} · veh ${g.vehicles.list.length} npc ${g.peds.npcs.length}`; this.frames = 0; this.fpsT = 0; }
    if (g.state !== 'playing') return;
    const cb = document.getElementById('cheatBtn')!; cb.style.display = (g.freeRoam || g.settings.cheatsButton) && !g.paused && !g.interiors.active ? 'inline-flex' : 'none';
    // damage flash
    this.hitT -= dt; if (this.hitT <= 0 && e.damage.style.opacity !== '0') e.damage.style.opacity = String(p.health < 30 ? 0.35 + Math.sin(g.time * 6) * 0.15 : 0);
    // bars
    (e.hpbar as HTMLElement).style.width = Math.max(0, p.health / p.maxHealth * 100) + '%';
    (e.arbar as HTMLElement).style.width = Math.max(0, p.armor) + '%';
    (e.stbar as HTMLElement).style.width = Math.max(0, p.stamina / (100 + p.skills.stamina * 60) * 100) + '%';
    // money
    this.moneyShown += (g.economy.money - this.moneyShown) * Math.min(1, dt * 8); e.money.textContent = formatMoney(Math.round(this.moneyShown));
    if (this.moneyDeltaT > 0) { this.moneyDeltaT -= dt; e.moneyDelta.textContent = (this.moneyDeltaV >= 0 ? '+' : '−') + formatMoney(Math.abs(this.moneyDeltaV)); e.moneyDelta.style.color = this.moneyDeltaV >= 0 ? '#4ade80' : '#ff4d6d'; e.moneyDelta.style.opacity = '1'; } else e.moneyDelta.style.opacity = '0';
    // stars
    const lv = g.police.wantedLevel; if (lv !== this.lastStars) { this.lastStars = lv; Array.from(e.stars.children).forEach((s, i) => s.classList.toggle('on', i < lv)); }
    e.stars.classList.toggle('search', lv > 0 && !g.police.seen);
    // place & clock
    const district = L.DISTRICT_NAMES[L.districtAt(p.x, p.z)]; const street = L.onRoad(p.x, p.z) ? L.streetName(p.x, p.z) : '';
    e.place.innerHTML = g.interiors.active ? `<b>${this.interiorHint}</b>` : `<b>${district}</b>${street ? ' · ' + street : ''}`;
    const wx = g.env.weather === 'rain' ? '🌧' : g.env.weather === 'storm' ? '⛈' : g.env.weather === 'fog' ? '🌫' : g.env.weather === 'cloudy' ? '☁' : g.env.night > 0.5 ? '🌙' : '☀';
    e.clock.textContent = `${g.env.clockString} · Day ${g.env.day} ${wx}`;
    // weapon
    const w = p.currentWeapon; e.wname.textContent = p.inVehicle ? (p.vehicle!.def.maker + ' ' + p.vehicle!.def.name) : w.name;
    e.wammo.textContent = p.inVehicle ? '' : w.kind === 'melee' ? '' : w.kind === 'throw' ? `×${(p.loadout.mag[w.id] ?? 0) + (p.loadout.ammo[w.id] ?? 0)}` : `${p.loadout.mag[w.id] ?? 0} / ${p.loadout.ammo[w.id] ?? 0}${p.reloadT > 0 ? ' · reloading' : ''}`;
    // crosshair
    const ch = e.crosshair; ch.style.display = p.aiming ? 'block' : 'none'; ch.className = g.combat.crosshairHit === 'enemy' ? 'enemy' : g.combat.crosshairHit === 'friendly' ? 'friendly' : '';
    // speedo
    const v = p.vehicle;
    if (p.inVehicle && v) {
      e.speedo.style.display = 'block'; e.kmh.textContent = String(Math.round(v.kmh)); e.gear.textContent = v.isHeli ? `ALT ${Math.round(v.heliAlt)}m` : v.isBoat ? 'WATER' : v.reversing ? 'R' : v.speed < 0.5 ? 'N' : String(v.gear);
      (e.speedo.querySelector('#rpmbar i') as HTMLElement).style.width = Math.min(100, v.rpm / v.def.maxRpm * 100) + '%';
      (e.speedo.querySelector('#nitrobar i') as HTMLElement).style.width = v.def.nitro ? v.nitroFuel * 100 + '%' : '0%';
      const hp = v.health / v.maxHealth; const hb = e.speedo.querySelector('#vehHealth i') as HTMLElement; hb.style.width = hp * 100 + '%'; hb.style.background = hp > 0.5 ? '#4ade80' : hp > 0.2 ? '#facc15' : '#ff4d6d';
      e.radioTag.textContent = g.audio.station < 4 ? '📻 ' + g.audio.stations[g.audio.station] : '';
    } else e.speedo.style.display = 'none';
    // subtitle timer
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) e.subtitle.innerHTML = ''; }
    // context prompt
    const ca = g.contextAction();
    this.promptTimer -= dt;
    if (ca && !g.paused && this.promptTimer <= 0 && !g.missions.active?.run.e.prog) { e.prompt.style.display = 'block'; e.prompt.textContent = (g.input.lastDevice === 'touch' ? '' : g.input.lastDevice === 'gamepad' ? '[Y] ' : '[F] ') + ca.label; }
    else if (!ca && this.promptTimer <= 0) e.prompt.style.display = 'none';
    this.ctxLabel = null;
    // bubbles
    this.updateBubbles();
    // minimap
    this.drawMini();
    if (this.mapOpen) this.drawFullMap();
  }

  private drawMini() {
    const g = this.g, p = g.player;
    const zoom = p.inVehicle ? 170 + Math.min(120, p.vehicle!.speed * 3) : 130;
    const cops: { x: number; z: number }[] = [], foes: { x: number; z: number }[] = [];
    for (const n of g.peds.npcs) { if (n.dead) continue; if ((n.faction === 'cop' || n.faction === 'swat') && Math.hypot(n.x - p.x, n.z - p.z) < 200) cops.push(n); else if ((n.faction === 'rival' || n.faction === 'gang' || n.faction === 'target') && n.userData.hostile && Math.hypot(n.x - p.x, n.z - p.z) < 200) foes.push(n); }
    for (const pu of g.police.pursuers) cops.push(pu.v);
    const blips = g.markers.blips().concat(g.events.blips() as any);
    this.map.drawMini(this.mini, 264, p.x, p.z, g.cam.forwardYaw, g.interiors.active ? [] : blips, g.markers.route, zoom, cops, foes);
  }
  private drawFullMap() {
    const g = this.g, p = g.player, c = this.el.fullmap as HTMLCanvasElement;
    if (c.width < 10) this.sizeMap();
    this.map.drawFull(c.getContext('2d')!, c.width, c.height, this.fullView, p.x, p.z, p.yaw, g.markers.blips().concat(g.events.blips() as any), g.markers.route);
  }

  private updateBubbles() {
    const g = this.g, cam = g.cam.camera; const seen = new Set<number>();
    const W = window.innerWidth, H = window.innerHeight;
    const v = new THREE.Vector3();
    for (const b of g.peds.bubbles) {
      if (!b.npc.group.visible) continue; v.set(b.npc.x, b.npc.y + 2.1, b.npc.z); v.project(cam); if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      let el = this.bubbleEls.get(b.npc.id); if (!el) { el = h(`<div class="bubble"></div>`); el.textContent = b.text; this.el.bubbles.appendChild(el); this.bubbleEls.set(b.npc.id, el); }
      el.style.left = (v.x * 0.5 + 0.5) * W + 'px'; el.style.top = (-v.y * 0.5 + 0.5) * H + 'px'; seen.add(b.npc.id);
    }
    for (const [id, el] of this.bubbleEls) if (!seen.has(id)) { el.remove(); this.bubbleEls.delete(id); }
  }
}
