import type { Game } from '../game/game';
import type { MenuItem } from '../game/economy';
import { fmtMoney, fmtTime } from '../core/math';
import { VDEFS } from '../vehicles/models';
import { WEAPON_ORDER, WEAPONS } from '../combat/weapons';
import { ITEMS } from '../game/economy';
import type { Weather } from '../render/env';

const h = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; };

/** Title screen, pause, settings, save slots, shop lists, dialogue choices, failure screen. */
export class Menus {
  private title: HTMLElement; private ov: HTMLElement; private panel: HTMLElement; private choiceEl: HTMLElement;
  private stack: (() => void)[] = []; private choiceResolve: ((i: number) => void) | null = null;
  constructor(private g: Game, ui: HTMLElement) {
    this.title = h(`<div id="title"><div class="logo"><h1>HEAT<br>COAST</h1><p>Bahía Verde · An original open-world story</p></div><div class="menu"></div><div class="foot">Rosa Delgado & Jace Holloway are original characters. All places, brands and vehicles are fictional. Built with Three.js — every model, texture and sound is generated procedurally.</div></div>`);
    ui.appendChild(this.title);
    this.ov = h(`<div class="overlay"><div class="panel"></div></div>`); ui.appendChild(this.ov); this.panel = this.ov.querySelector('.panel')!;
    this.ov.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === this.ov && this.g.state === 'play') this.back(); });
    this.choiceEl = h(`<div class="choice"></div>`); ui.appendChild(this.choiceEl);
  }
  isOpen() { return this.ov.classList.contains('on'); }
  showTitle(on: boolean) {
    this.title.classList.toggle('on', on); if (!on) return;
    const m = this.title.querySelector('.menu')!; m.innerHTML = '';
    const add = (label: string, fn: () => void, primary = false) => { const b = h(`<span class="btn ${primary ? 'primary' : ''}">${label}</span>`); b.addEventListener('click', () => { this.g.audio.init(); this.g.audio.click(); this.requestFullscreen(); fn(); }); m.appendChild(b); };
    const latest = this.g.saves.latest();
    if (latest) add(`Continue <small style="opacity:.7;margin-left:auto">${latest.chapter.split('—')[0]}</small>`, () => this.g.saves.load(latest.slot), true);
    add('New Game', () => this.slots('new'), !latest);
    if (latest) add('Load Game', () => this.slots('load'));
    add('Settings', () => this.settings()); add('Controls', () => this.controls());
  }
  requestFullscreen() {
    try { const d = document.documentElement as any; if (!document.fullscreenElement && matchMedia('(pointer: coarse)').matches) (d.requestFullscreen?.({ navigationUI: 'hide' }) ?? d.webkitRequestFullscreen?.())?.catch?.(() => {}); (screen.orientation as any)?.lock?.('landscape').catch(() => {}); } catch { /* not supported */ }
  }
  // ------------------------------------------------------------ generic panel
  private open(build: (p: HTMLElement) => void, pushBack?: () => void) {
    this.panel.innerHTML = ''; build(this.panel); this.ov.classList.add('on');
    if (pushBack) this.stack.push(pushBack);
    if (this.g.state === 'play') this.g.paused = true;
  }
  closeAll() { this.ov.classList.remove('on'); this.stack = []; if (this.g.state === 'play') this.g.paused = this.g.hud.mapOpen; }
  back() { this.stack.pop(); const prev = this.stack.pop(); if (prev) prev(); else this.closeAll(); }
  private header(p: HTMLElement, title: string, sub = '') { p.appendChild(h(`<h2>${title}</h2>`)); if (sub) p.appendChild(h(`<div class="sub">${sub}</div>`)); const sc = h('<div class="scroll"></div>'); p.appendChild(sc); return sc; }
  private footer(p: HTMLElement, label = 'Back') { const f = h(`<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><span class="btn">${label}</span></div>`); f.querySelector('.btn')!.addEventListener('click', () => { this.g.audio.click(); this.back(); }); p.appendChild(f); return f; }
  private row(sc: HTMLElement, it: MenuItem, close = true) {
    const afford = it.price === undefined || this.g.economy.money >= it.price;
    const e = h(`<div class="row ${it.disabled ? 'dis' : ''}"><div><div>${it.label}</div>${it.sub ? `<small>${it.sub}</small>` : ''}</div>${it.price ? `<div class="p" style="${afford ? '' : 'color:#ff9a9a'}">${fmtMoney(it.price)}</div>` : ''}</div>`);
    if (it.action && !it.disabled) e.addEventListener('click', () => { this.g.audio.click(); it.action!(); if (it.keep) { /* refresh */ const top = this.stack[this.stack.length - 1]; this.stack.pop(); top?.(); } else if (close) this.closeAll(); });
    sc.appendChild(e);
  }
  list(title: string, sub: string, items: MenuItem[]) {
    const show = () => this.open((p) => { const sc = this.header(p, title, `${sub} · <b style="color:#9ff0b5">${fmtMoney(this.g.economy.money)}</b>`); for (const it of items) this.row(sc, it); this.footer(p, 'Close'); }, () => show());
    this.stack = []; show();
  }
  // ------------------------------------------------------------ pause
  pause(on: boolean) {
    if (!on) { this.closeAll(); this.g.audio.suspend(false); return; }
    if (this.g.state !== 'play') return;
    const show = () => this.open((p) => {
      const g = this.g; const sc = this.header(p, 'Paused', `${g.missions.chapterName()} · ${fmtTime(g.env.hour)} Day ${g.env.day} · Bond ${g.bond}/100`);
      const items: MenuItem[] = [
        { label: 'Resume', action: () => this.closeAll() },
        { label: 'Map', action: () => { this.closeAll(); g.hud.openMap(true); } },
        { label: 'Inventory', sub: 'Food, first aid, armour', action: () => this.inventory() },
        { label: 'Save Game', action: () => this.slots('save') }, { label: 'Load Game', action: () => this.slots('load') },
        { label: 'Settings', action: () => this.settings() }, { label: 'Controls', action: () => this.controls() },
        { label: 'Cheats', sub: 'Sandbox tools', action: () => this.cheats() },
        { label: 'Quit to Title', sub: 'Progress is autosaved', action: () => g.quitToTitle() },
      ];
      for (const it of items) this.row(sc, { ...it, keep: false }, false);
    }, () => show());
    this.stack = []; show();
  }
  inventory() {
    const show = () => this.open((p) => { const g = this.g; const sc = this.header(p, 'Inventory', `${g.player.name} · HP ${Math.round(g.player.hp)}/${g.player.maxHp} · Armour ${Math.round(g.player.armor)}`);
      const inv = Object.entries(g.economy.inv).filter(([, n]) => n > 0); if (!inv.length) sc.appendChild(h('<div class="sub">Nothing — buy snacks at a Quik Mart or Gulfstar.</div>'));
      for (const [id, n] of inv) this.row(sc, { label: `${ITEMS[id].name} ×${n}`, sub: ITEMS[id].desc, keep: true, action: () => g.economy.use(id) });
      sc.appendChild(h('<div class="sub" style="margin-top:10px">WEAPONS</div>'));
      for (const w of WEAPON_ORDER) if (g.player.owned.includes(w)) this.row(sc, { label: WEAPONS[w].name, sub: WEAPONS[w].kind === 'gun' ? `${g.player.mag[w] ?? 0} / ${g.player.ammo[w] ?? 0}` : 'Melee', keep: true, action: () => g.player.selectWeapon(w) });
      this.footer(p); }, () => show());
    show();
  }
  slots(mode: 'new' | 'save' | 'load') {
    const show = () => this.open((p) => {
      const g = this.g; const sc = this.header(p, mode === 'new' ? 'New Game — choose a slot' : mode === 'save' ? 'Save Game' : 'Load Game');
      for (const s of g.saves.slots()) {
        if (mode !== 'load' && s.slot === 0) continue; if (mode === 'load' && !s.used) continue;
        const label = s.slot === 0 ? 'Autosave' : `Slot ${s.slot}`;
        this.row(sc, { label: `${label}${s.used ? ` — ${s.chapter}` : ' — empty'}`, sub: s.used ? `${s.hero} · ${fmtMoney(s.money)} · Day ${s.day} · ${new Date(s.time).toLocaleString()}` : '', action: () => {
          if (mode === 'new') { this.closeAll(); g.newGame(s.slot); } else if (mode === 'save') { if (g.missions.active) { g.hud.toast('Can\'t save during a mission'); return; } g.saves.save(s.slot); g.saves.slot = s.slot; g.hud.toast('Game saved'); } else { this.closeAll(); g.saves.load(s.slot); }
        } }, true);
      }
      this.footer(p);
    }, () => show());
    show();
  }
  settings() {
    const show = () => this.open((p) => {
      const g = this.g, s = g.settings; const sc = this.header(p, 'Settings', `Running ${g.q.name} · ${Math.round(g.fps)} fps`);
      const sel = (label: string, val: string, opts: string[], set: (v: string) => void) => { const e = h(`<div class="set"><span>${label}</span><select>${opts.map((o) => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`); e.querySelector('select')!.addEventListener('change', (ev) => set((ev.target as HTMLSelectElement).value)); sc.appendChild(e); };
      const rng = (label: string, val: number, min: number, max: number, step: number, set: (v: number) => void) => { const e = h(`<div class="set"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"></div>`); e.querySelector('input')!.addEventListener('input', (ev) => set(+(ev.target as HTMLInputElement).value)); sc.appendChild(e); };
      const tog = (label: string, val: boolean, set: (v: boolean) => void) => { const e = h(`<div class="set"><span>${label}</span><span class="btn" style="padding:6px 12px">${val ? 'On' : 'Off'}</span></div>`); e.querySelector('.btn')!.addEventListener('click', () => { set(!val); show2(); }); sc.appendChild(e); };
      const show2 = () => { this.stack.pop(); show(); };
      sc.appendChild(h('<div class="sub" style="margin-top:4px">GRAPHICS</div>'));
      sel('Quality preset', s.preset, ['AUTO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA'], (v) => g.setSettings({ preset: v as any }));
      rng('Resolution scale', s.resScale, 0.5, 1, 0.05, (v) => g.setSettings({ resScale: v }));
      tog('Show FPS', s.showFps, (v) => g.setSettings({ showFps: v }));
      rng('Traffic & crowd density', s.trafficDensity, 0.3, 1.3, 0.1, (v) => g.setSettings({ trafficDensity: v }));
      sc.appendChild(h('<div class="sub" style="margin-top:10px">AUDIO</div>'));
      rng('Master volume', s.volMaster, 0, 1, 0.05, (v) => g.setSettings({ volMaster: v })); rng('Effects', s.volSfx, 0, 1, 0.05, (v) => g.setSettings({ volSfx: v })); rng('Music & radio', s.volMusic, 0, 1, 0.05, (v) => g.setSettings({ volMusic: v }));
      sc.appendChild(h('<div class="sub" style="margin-top:10px">CONTROLS</div>'));
      rng('Camera sensitivity', s.sensitivity, 0.3, 2.5, 0.05, (v) => g.setSettings({ sensitivity: v })); tog('Invert look Y', s.invertY, (v) => g.setSettings({ invertY: v })); tog('Aim assist (touch & pad)', s.autoAim, (v) => g.setSettings({ autoAim: v }));
      sel('Touch controls', s.touchMode, ['auto', 'on', 'off'], (v) => { g.setSettings({ touchMode: v as any }); g.touch.show(g.state === 'play'); });
      rng('Button size', s.buttonScale, 0.7, 1.5, 0.05, (v) => g.setSettings({ buttonScale: v })); rng('Button opacity', s.buttonOpacity, 0.25, 1, 0.05, (v) => g.setSettings({ buttonOpacity: v }));
      tog('Vibration', s.vibration, (v) => g.setSettings({ vibration: v })); tog('Camera shake', s.cameraShake, (v) => g.setSettings({ cameraShake: v })); tog('Subtitles', s.subtitles, (v) => g.setSettings({ subtitles: v }));
      this.footer(p);
    }, () => show());
    if (!this.isOpen()) this.stack = [];
    show();
  }
  controls() {
    const show = () => this.open((p) => { const sc = this.header(p, 'Controls');
      sc.appendChild(h(`<div style="font-size:13px;line-height:1.7;color:#ddd">
        <b>Touch (phones)</b> — left side: floating joystick · right side: swipe to look · FIRE / AIM / JUMP / RUN / CAR · GUN cycles weapons · ⇄ switches Rosa/Jace · FOCUS = special ability · 📱 phone · tap the minimap for the full map. In cars: GAS / BRAKE (reverse) / DRIFT (handbrake) / EXIT / HORN / CAM / ♪ radio / SHOOT (drive-by).<br><br>
        <b>Controller</b> — L-stick move/steer · R-stick camera · RT fire/accelerate · LT aim/brake · A sprint · X jump · RB handbrake · Y enter/exit · B interact · D-pad ↑ phone, ↓ switch character, → weapon · LB weapon · R3 camera · L3 focus · Start pause · Select map.<br><br>
        <b>Keyboard & mouse</b> — WASD move/drive · mouse look (click to lock) · LMB fire · RMB aim · Shift sprint · Space jump/handbrake · F enter/exit · E interact · Q switch character · R reload · 1-7 / wheel / Tab weapons · X focus · V camera · H horn · L lights · ↑/P phone · M map · Esc pause · Enter skip cutscene.</div>`)); this.footer(p); }, () => show());
    if (!this.isOpen()) this.stack = [];
    show();
  }
  cheats() {
    const show = () => this.open((p) => { const g = this.g, P = g.player; const sc = this.header(p, 'Cheats', 'Sandbox tools — have fun');
      const items: MenuItem[] = [
        { label: `God mode: ${g.cheats.god ? 'ON' : 'off'}`, keep: true, action: () => { g.cheats.god = !g.cheats.god; } },
        { label: `Infinite ammo: ${g.cheats.infAmmo ? 'ON' : 'off'}`, keep: true, action: () => { g.cheats.infAmmo = !g.cheats.infAmmo; } },
        { label: `Never wanted: ${g.cheats.noWanted ? 'ON' : 'off'}`, keep: true, action: () => { g.cheats.noWanted = !g.cheats.noWanted; g.police.clear(); } },
        { label: '+ $100,000', keep: true, action: () => g.economy.earn(100000, 'Cheat') },
        { label: 'All weapons', keep: true, action: () => { for (const w of WEAPON_ORDER) if (w !== 'fists') P.giveWeapon(w, WEAPONS[w].mag * 6); P.armor = 100; } },
        { label: 'Wanted +1 ★', keep: true, action: () => g.police.setStars(g.police.stars + 1) },
        { label: 'Clear wanted level', keep: true, action: () => g.police.clear() },
        ...(['clear', 'cloudy', 'rain', 'storm', 'fog'] as Weather[]).map((w) => ({ label: `Weather: ${w}`, keep: true, action: () => g.env.setWeather(w) })),
        { label: 'Skip 3 hours', keep: true, action: () => g.env.setHour(g.env.hour + 3) },
        ...VDEFS.map((d) => ({ label: `Spawn ${d.maker} ${d.name}`, action: () => { const v = g.vehicles.spawn(d.id, P.x + Math.sin(P.yaw) * 6, P.z + Math.cos(P.yaw) * 6, P.yaw, d.colors[0], 'parked'); v.physics = true; } })),
      ];
      for (const it of items) this.row(sc, it); this.footer(p); }, () => show());
    show();
  }
  // ------------------------------------------------------------ dialogue choice
  choice(prompt: string, options: string[], seconds = 0): Promise<number> {
    const c = this.choiceEl; c.innerHTML = ''; c.style.display = 'flex';
    c.appendChild(h(`<div class="q">${prompt}</div>`));
    return new Promise((resolve) => {
      let done = false; const pick = (i: number) => { if (done) return; done = true; c.style.display = 'none'; this.g.audio.click(); this.choiceResolve = null; resolve(i); };
      this.choiceResolve = pick;
      options.forEach((o, i) => { const b = h(`<span class="btn">${i + 1}. ${o}</span>`); b.addEventListener('click', () => pick(i)); c.appendChild(b); });
      const keyH = (e: KeyboardEvent) => { const n = parseInt(e.key); if (n >= 1 && n <= options.length) { removeEventListener('keydown', keyH); pick(n - 1); } }; addEventListener('keydown', keyH);
      if (seconds) { const tm = h('<div class="tm" style="width:100%"></div>'); c.appendChild(tm); requestAnimationFrame(() => { tm.style.transitionDuration = seconds + 's'; tm.style.width = '0%'; }); setTimeout(() => pick(0), seconds * 1000); }
      // gamepad: poll D-pad/face buttons
      const poll = () => { if (done) return; const p = navigator.getGamepads?.()[0]; if (p) { if (p.buttons[0]?.pressed) return pick(0); if (p.buttons[1]?.pressed && options.length > 1) return pick(1); if (p.buttons[2]?.pressed && options.length > 2) return pick(2); } requestAnimationFrame(poll); }; setTimeout(poll, 400);
    });
  }
  failScreen(title: string, why: string, retry: () => void) {
    const show = () => this.open((p) => { const sc = this.header(p, 'Mission Failed', `${title} — ${why}`); this.row(sc, { label: 'Retry', action: () => { this.closeAll(); retry(); } }); this.row(sc, { label: 'Continue free roam', action: () => this.closeAll() }); }, () => show());
    this.stack = []; setTimeout(show, 1200);
  }
}
