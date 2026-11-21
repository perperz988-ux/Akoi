// All DOM UI: menus, world list, world creation, settings, HUD, pause, inventory/crafting/crates, creative tools.
import type { Game, GameState, UIHooks } from '../core/Game';
import { DAY_LENGTH } from '../core/Game';
import { Preset, applyPreset, PRESETS } from '../core/Settings';
import { BLOCKS } from '../world/Blocks';
import type { Stack } from '../world/World';
import { ITEMS, item, itemIcon, maxStack } from '../game/Items';
import { RECIPES, Station, canCraft, ingredientIds, ingredientName } from '../game/Inventory';
import { MOB_TYPES } from '../game/Mobs';
import * as Store from '../save/Storage';
import type { WorldMeta } from '../save/Storage';
import { ICON } from './Icons';
import { Touch } from './Touch';

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const TIPS = [
  'Hold BREAK (or press and hold the screen) to mine. Tap to place or use.',
  'Craft a Workbench from boards, then stand near it to unlock tools.',
  'A Kiln smelts ore veins into ingots — each batch needs fuel.',
  'Torches and Glowcaps keep the dark — and the Gloomlings — away.',
  'Mossbacks follow anyone carrying Emberberries.',
  'Sneak to creep up on skittish Hopkins.',
  'Till soil with a Tiller, plant Grain Seeds, and come back later.',
  'Holding a torch lights the way around you.',
];

export class UI implements UIHooks {
  root: HTMLElement;
  touch: Touch;
  private screens: Record<string, HTMLElement> = {};
  private hud!: HTMLElement;
  private hotbarEl!: HTMLElement;
  private hpEl!: HTMLElement; private foodEl!: HTMLElement; private airEl!: HTMLElement;
  private infoEl!: HTMLElement; private crossEl!: HTMLElement; private nameEl!: HTMLElement; private toastEl!: HTMLElement;
  private vigHurt!: HTMLElement; private vigWater!: HTMLElement; private vigMagma!: HTMLElement; private breakEl!: HTMLElement;
  private creativeBtn!: HTMLElement;
  private hotSig = '';
  private lastSel = -1;
  private nameTimer = 0;
  private settingsReturn: string = 'menu';
  private settingsTab = 'graphics';
  // inventory state
  private cursor: Stack | null = null;
  private crate: (Stack | null)[] | null = null;
  private cratePos: [number, number, number] | null = null;
  private invTab: 'pack' | 'catalog' = 'pack';
  private station: Station = 'hand';
  private invEl!: HTMLElement;
  private invSig = '';

  constructor(private game: Game, root: HTMLElement) {
    this.root = root;
    this.touch = new Touch(game, root);
    this.buildHud();
    this.buildMenu();
    this.screens.worlds = this.overlay('worlds');
    this.screens.create = this.overlay('create');
    this.screens.settings = this.overlay('settings');
    this.screens.credits = this.overlay('credits');
    this.screens.pause = this.overlay('pause');
    this.screens.creative = this.overlay('creative');
    this.screens.inventory = this.overlay('inventory');
    this.screens.dialog = this.overlay('dialog');
    this.screens.dialog.style.zIndex = '20';
    this.screens.loading = h('div', 'screen loading', `<div class="logo" style="font-size:54px">AKOI</div><div class="pb"><b></b></div><div class="small" id="lmsg"></div><div class="small" id="ltip" style="max-width:60vw;text-align:center"></div>`);
    root.appendChild(this.screens.loading);
    this.screens.dead = h('div', 'screen death', `<h1>FALLEN</h1><div id="dmsg"></div><div class="row"><button class="btn amber" id="respawn">Rise again</button><button class="btn" id="dquit">Save &amp; quit</button></div>`);
    root.appendChild(this.screens.dead);
    this.screens.dead.querySelector('#respawn')!.addEventListener('click', () => this.game.respawn());
    this.screens.dead.querySelector('#dquit')!.addEventListener('click', () => this.game.exitToMenu());
    this.touch.onEditDone = () => this.openSettings(this.settingsReturn, 'touch');
    document.addEventListener('pointerdown', () => game.audio.unlock(), { capture: true });
  }

  private overlay(id: string) {
    const e = h('div', 'screen overlay');
    e.id = 'scr-' + id;
    this.root.appendChild(e);
    return e;
  }

  // ------------------------------------------------------------ screen routing
  private menuSub: string | null = null;
  showScreen(s: GameState) {
    for (const k of Object.keys(this.screens)) this.screens[k].classList.remove('on');
    this.hud.style.display = 'none';
    this.touch.setVisible(false);
    if (s === 'menu') { this.screens.menu.classList.add('on'); if (this.menuSub) this.screens[this.menuSub].classList.add('on'); }
    else if (s === 'loading') { this.screens.loading.classList.add('on'); (this.screens.loading.querySelector('#ltip') as HTMLElement).textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; }
    else if (s === 'play') { this.hud.style.display = 'block'; this.touch.setVisible(this.game.input.usingTouch); this.hotSig = ''; }
    else if (s === 'pause') { this.hud.style.display = 'block'; this.renderPause(); this.screens.pause.classList.add('on'); }
    else if (s === 'inventory') { this.hud.style.display = 'block'; this.screens.inventory.classList.add('on'); }
    else if (s === 'dead') { this.hud.style.display = 'block'; this.screens.dead.classList.add('on'); }
  }

  private nav(sub: string | null) {
    if (this.menuSub) this.screens[this.menuSub].classList.remove('on');
    this.menuSub = sub;
    if (sub) this.screens[sub].classList.add('on');
    this.game.audio.ui();
  }

  toast(msg: string) {
    const t = h('div', 'toast');
    t.textContent = msg;
    this.toastEl.appendChild(t);
    while (this.toastEl.children.length > 3) this.toastEl.firstChild!.remove();
    setTimeout(() => t.remove(), 2800);
  }

  setLoading(p: number, msg: string) {
    (this.screens.loading.querySelector('.pb b') as HTMLElement).style.width = Math.round(p * 100) + '%';
    (this.screens.loading.querySelector('#lmsg') as HTMLElement).textContent = msg;
  }

  onDeath(msg: string) { (this.screens.dead.querySelector('#dmsg') as HTMLElement).textContent = msg + (this.game.rules.keepInventory ? '' : ' Your belongings were scattered where you fell.'); }

  // ------------------------------------------------------------ dialogs
  confirm(text: string, okLabel = 'Delete'): Promise<boolean> {
    return new Promise((res) => {
      const d = this.screens.dialog;
      d.innerHTML = '';
      const p = h('div', 'panel dialog', `<div class="head"><h2>Confirm</h2></div><div class="body"><p>${esc(text)}</p><div class="row" style="justify-content:flex-end"><button class="btn" id="no">Cancel</button><button class="btn warn" id="yes">${esc(okLabel)}</button></div></div>`);
      d.appendChild(p); d.classList.add('on');
      p.querySelector('#no')!.addEventListener('click', () => { d.classList.remove('on'); res(false); });
      p.querySelector('#yes')!.addEventListener('click', () => { d.classList.remove('on'); res(true); });
    });
  }
  prompt(title: string, value: string): Promise<string | null> {
    return new Promise((res) => {
      const d = this.screens.dialog;
      d.innerHTML = '';
      const p = h('div', 'panel dialog', `<div class="head"><h2>${esc(title)}</h2></div><div class="body"><input type="text" id="pv" maxlength="32"><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="no">Cancel</button><button class="btn go" id="yes">Save</button></div></div>`);
      d.appendChild(p); d.classList.add('on');
      const inp = p.querySelector('#pv') as HTMLInputElement; inp.value = value; setTimeout(() => inp.focus(), 50);
      p.querySelector('#no')!.addEventListener('click', () => { d.classList.remove('on'); res(null); });
      p.querySelector('#yes')!.addEventListener('click', () => { d.classList.remove('on'); res(inp.value.trim() || value); });
    });
  }

  // ------------------------------------------------------------ main menu
  private buildMenu() {
    const m = h('div', 'screen menu');
    m.innerHTML = `<div class="col">
      <div><div class="logo">AKOI<span class="dot">.</span></div><div class="tagline">Shape the wild lands</div></div>
      <button class="mbtn primary" data-a="play"><span class="gem"></span>PLAY</button>
      <button class="mbtn" data-a="create"><span class="gem"></span>CREATE WORLD</button>
      <button class="mbtn" data-a="settings"><span class="gem"></span>SETTINGS</button>
      <button class="mbtn" data-a="credits"><span class="gem"></span>CREDITS</button>
    </div><div class="ver">AKOI v0.1 · original voxel sandbox</div>`;
    m.querySelectorAll('.mbtn').forEach((b) => b.addEventListener('click', () => {
      const a = (b as HTMLElement).dataset.a!;
      this.game.audio.unlock();
      if (a === 'play') this.openWorlds();
      else if (a === 'create') this.openCreate();
      else if (a === 'settings') this.openSettings('menu');
      else if (a === 'credits') this.openCredits();
    }));
    this.root.appendChild(m);
    this.screens.menu = m;
  }

  async openWorlds() {
    const s = this.screens.worlds;
    const worlds = await Store.listWorlds();
    s.innerHTML = '';
    const p = h('div', 'panel', `<div class="head"><h2>Your worlds</h2><button class="btn go" id="new">+ New world</button><button class="x" id="cl">✕</button></div><div class="body" id="wl"></div>`);
    p.style.width = 'min(640px, 94vw)'; p.style.height = 'min(520px, 92vh)';
    s.appendChild(p);
    p.querySelector('#cl')!.addEventListener('click', () => this.nav(null));
    p.querySelector('#new')!.addEventListener('click', () => this.openCreate());
    const list = p.querySelector('#wl')!;
    if (!worlds.length) list.innerHTML = `<div style="text-align:center;padding:40px 10px" class="small">No worlds yet. Create one to begin.</div>`;
    for (const w of worlds) {
      const row = h('div', 'world');
      const date = new Date(w.lastPlayed);
      const mins = Math.round(w.playTime / 60);
      row.innerHTML = `<div class="thumb ${w.mode === 'creative' ? 'creative' : ''}"></div>
        <div class="meta"><div class="name">${esc(w.name)}<span class="badge ${w.mode === 'creative' ? 'c' : ''}">${w.mode.toUpperCase()}</span></div>
        <div class="small">Seed ${esc(w.seedText)} · ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${mins} min</div></div>
        <button class="btn" data-a="ren">Rename</button><button class="btn warn" data-a="del">Delete</button><button class="btn amber" data-a="play">▶ Play</button>`;
      row.querySelector('[data-a=play]')!.addEventListener('click', () => { this.nav(null); this.game.enterWorld(w); });
      row.querySelector('[data-a=ren]')!.addEventListener('click', async () => {
        const n = await this.prompt('Rename world', w.name);
        if (n) { w.name = n; await Store.putWorld(w); this.openWorlds(); }
      });
      row.querySelector('[data-a=del]')!.addEventListener('click', async () => {
        if (await this.confirm(`Delete "${w.name}" forever? This cannot be undone.`)) { await Store.deleteWorld(w.id); this.openWorlds(); }
      });
      list.appendChild(row);
    }
    this.nav('worlds');
  }

  openCreate() {
    const s = this.screens.create;
    s.innerHTML = '';
    let mode: 'survival' | 'creative' = 'survival';
    let diff = 1;
    const p = h('div', 'panel', `<div class="head"><h2>Create world</h2><button class="x" id="cl">✕</button></div>
      <div class="body" style="display:flex;flex-direction:column;gap:12px">
        <div><div class="sect">Name</div><input type="text" id="wn" maxlength="32" value="Wild Lands"></div>
        <div><div class="sect">Seed <span class="small">(same seed = same world)</span></div><div class="row"><input type="text" id="ws" maxlength="40" placeholder="Leave empty for a random seed"><button class="btn" id="dice">🎲</button></div></div>
        <div class="row"><div class="grow"><div class="sect">Game mode</div><div class="seg" id="gm"><button data-v="survival" class="on">Survival</button><button data-v="creative">Creative</button></div></div>
        <div class="grow"><div class="sect">Difficulty</div><div class="seg" id="df"><button data-v="0">Peaceful</button><button data-v="1" class="on">Normal</button><button data-v="2">Hard</button></div></div></div>
        <div class="small" id="mdesc">Gather, craft and survive. Hunger, health and hostile creatures.</div>
        <div class="row" style="justify-content:flex-end"><button class="btn amber" id="go" style="padding:12px 22px">Create &amp; enter</button></div>
      </div>`);
    p.style.width = 'min(560px, 94vw)';
    s.appendChild(p);
    p.querySelector('#cl')!.addEventListener('click', () => this.nav(null));
    p.querySelector('#dice')!.addEventListener('click', () => { (p.querySelector('#ws') as HTMLInputElement).value = String(Math.floor(Math.random() * 2147483647)); });
    this.seg(p.querySelector('#gm')!, (v) => { mode = v as any; (p.querySelector('#mdesc') as HTMLElement).textContent = mode === 'creative' ? 'Unlimited blocks, flight, instant breaking and world tools.' : 'Gather, craft and survive. Hunger, health and hostile creatures.'; });
    this.seg(p.querySelector('#df')!, (v) => { diff = parseInt(v, 10); });
    p.querySelector('#go')!.addEventListener('click', () => {
      const name = (p.querySelector('#wn') as HTMLInputElement).value;
      const seed = (p.querySelector('#ws') as HTMLInputElement).value;
      this.nav(null);
      this.game.createWorld(name, seed, mode, diff);
    });
    this.nav('create');
  }

  private seg(el: Element, cb: (v: string) => void) {
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on'); cb((b as HTMLElement).dataset.v!); this.game.audio.ui();
    }));
  }

  openCredits() {
    const s = this.screens.credits;
    s.innerHTML = '';
    const p = h('div', 'panel credits', `<div class="head"><h2>Credits</h2><button class="x" id="cl">✕</button></div><div class="body">
      <p><b>AKOI</b> — an original voxel sandbox about shaping the wild lands.</p>
      <p>Design, code, world generation, creatures, textures, sounds and music were all created procedurally for this game. No external art or audio assets are used: every texture is painted by code at start-up and every sound is synthesized live.</p>
      <p>Creatures: Mossback, Hopkin, Glimmerwing, Gloomling, Crag Crawler and Stingwisp.</p>
      <p>Built with <b>three.js</b> (MIT licence) for WebGL rendering and <b>Capacitor</b> (MIT licence) for the Android shell.</p>
      <p class="small">Thanks for playing. Build something wonderful.</p></div>`);
    p.style.width = 'min(560px, 94vw)';
    s.appendChild(p);
    p.querySelector('#cl')!.addEventListener('click', () => this.nav(null));
    this.nav('credits');
  }

  // ------------------------------------------------------------ settings
  openSettings(ret: string, tab?: string) {
    this.settingsReturn = ret;
    if (tab) this.settingsTab = tab;
    const s = this.screens.settings;
    const g = this.game, st = g.settings;
    s.innerHTML = '';
    const p = h('div', 'panel', `<div class="head"><h2>Settings</h2><div class="tabs" id="tabs"></div><button class="x" id="cl">✕</button></div><div class="body" id="sb"></div>`);
    p.style.width = 'min(720px, 96vw)'; p.style.height = 'min(560px, 94vh)';
    s.appendChild(p);
    const tabs = p.querySelector('#tabs')!;
    for (const [k, n] of [['graphics', 'Graphics'], ['controls', 'Controls'], ['touch', 'Touch'], ['audio', 'Audio']]) {
      const t = h('button', 'tab' + (this.settingsTab === k ? ' on' : ''), n);
      t.addEventListener('click', () => { this.settingsTab = k; this.openSettings(ret); });
      tabs.appendChild(t);
    }
    const close = () => {
      g.applySettings();
      s.classList.remove('on');
      if (ret === 'menu') this.nav(null);
      else { this.renderPause(); this.screens.pause.classList.add('on'); }
    };
    p.querySelector('#cl')!.addEventListener('click', close);
    const body = p.querySelector('#sb') as HTMLElement;
    const apply = () => g.applySettings();
    const slider = (label: string, key: keyof typeof st, min: number, max: number, step: number, fmt: (v: number) => string = (v) => String(v), after?: () => void) => {
      const r = h('div', 'set', `<label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}"><span class="v"></span>`);
      const i = r.querySelector('input') as HTMLInputElement, v = r.querySelector('.v') as HTMLElement;
      i.value = String(st[key]); v.textContent = fmt(st[key] as number);
      i.addEventListener('input', () => { (st as any)[key] = parseFloat(i.value); v.textContent = fmt(parseFloat(i.value)); });
      i.addEventListener('change', () => { apply(); after?.(); });
      body.appendChild(r);
    };
    const toggle = (label: string, key: keyof typeof st, after?: () => void) => {
      const r = h('div', 'set', `<label>${label}</label><button class="tog ${st[key] ? 'on' : ''}"></button>`);
      const b = r.querySelector('.tog')!;
      b.addEventListener('click', () => { (st as any)[key] = !st[key]; b.classList.toggle('on', !!st[key]); apply(); after?.(); g.audio.ui(); });
      body.appendChild(r);
    };
    const choice = (label: string, opts: [string, string][], get: () => string, set: (v: string) => void) => {
      const r = h('div', 'set', `<label>${label}</label><div class="seg"></div>`);
      const sg = r.querySelector('.seg')!;
      for (const [v, n] of opts) { const b = h('button', get() === v ? 'on' : '', n); b.dataset.v = v; sg.appendChild(b); }
      this.seg(sg, (v) => { set(v); apply(); });
      body.appendChild(r);
    };
    if (this.settingsTab === 'graphics') {
      choice('Quality preset', (['LOW', 'MEDIUM', 'HIGH', 'ULTRA'] as Preset[]).map((x) => [x, x[0] + x.slice(1).toLowerCase()] as [string, string]), () => st.preset, (v) => { applyPreset(st, v as Preset); g.applySettings(); this.openSettings(ret); });
      slider('Render distance (chunks)', 'renderDistance', 2, 16, 1, (v) => String(v), () => { st.lodDistance = Math.min(st.lodDistance, st.renderDistance); });
      slider('Full-detail distance (LOD)', 'lodDistance', 1, 16, 1);
      toggle('Dynamic shadows', 'shadows');
      slider('Shadow resolution', 'shadowSize', 512, 2048, 512);
      toggle('Fancy leaves (see-through)', 'fancyLeaves');
      toggle('Clouds', 'clouds');
      slider('Particles', 'particles', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
      slider('Resolution scale', 'resolution', 0.5, 1.5, 0.05, (v) => Math.round(v * 100) + '%');
      slider('Field of view', 'fov', 50, 110, 1, (v) => v + '°');
      slider('Brightness', 'brightness', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
      toggle('View bobbing', 'viewBobbing');
      toggle('Show FPS', 'showFps');
      toggle('Performance mode (dynamic resolution)', 'performanceMode');
      choice('Frame-rate target', [['30', '30 FPS'], ['60', '60 FPS']], () => String(st.targetFps), (v) => { st.targetFps = parseInt(v, 10) as 30 | 60; });
      toggle('Anti-aliasing (applies after restart)', 'antialias');
      body.appendChild(h('div', 'small', `Presets: ${Object.keys(PRESETS).join(' / ')}. LOW targets older phones; ULTRA is for flagship devices.`));
    } else if (this.settingsTab === 'controls') {
      slider('Look sensitivity', 'sensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2));
      toggle('Invert vertical look', 'invertY');
      toggle('Auto-jump (touch)', 'autoJump');
      toggle('Sneak button toggles', 'sneakToggle');
      choice('Aim', [['crosshair', 'Crosshair'], ['touch', 'Touch point']], () => st.aimMode, (v) => { st.aimMode = v as any; });
      body.appendChild(h('div', 'sect', 'Controller'));
      slider('Controller look speed', 'padSensitivity', 0.2, 3, 0.05, (v) => v.toFixed(2));
      slider('Stick dead-zone', 'padDeadzone', 0, 0.5, 0.01, (v) => v.toFixed(2));
      body.appendChild(h('div', 'small', 'Gamepad: left stick move · right stick look · A jump · B sneak · RT break · LT place · X use · Y inventory · LB/RB hotbar · Start pause · D-pad up fly. Keyboard: WASD, mouse, Space, Shift, Ctrl sprint, E inventory, Q drop, F use, V view, 1-9 hotbar.'));
    } else if (this.settingsTab === 'touch') {
      slider('Button size', 'touchSize', 0.6, 1.6, 0.05, (v) => Math.round(v * 100) + '%', () => this.touch.refresh());
      slider('Button opacity', 'touchOpacity', 0.15, 1, 0.05, (v) => Math.round(v * 100) + '%', () => this.touch.refresh());
      toggle('Tap to place / use', 'tapToPlace');
      toggle('Hold screen to break', 'holdToBreak');
      toggle('Left-handed layout', 'leftHanded', () => this.touch.refresh());
      toggle('Vibration feedback', 'haptics');
      const r = h('div', 'set', `<label>Button layout</label><button class="btn go" id="edit">Edit layout</button>`);
      r.querySelector('#edit')!.addEventListener('click', () => {
        s.classList.remove('on');
        this.screens.pause.classList.remove('on');
        if (ret === 'menu') this.nav(null);
        this.screens.menu.classList.remove('on');
        this.touch.setVisible(true);
        this.touch.setEditing(true);
      });
      body.appendChild(r);
    } else {
      slider('Master volume', 'masterVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
      slider('Sound effects', 'sfxVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
      slider('Music', 'musicVolume', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
    }
    if (ret === 'menu') this.nav('settings'); else s.classList.add('on');
  }

  // ------------------------------------------------------------ pause & creative
  private renderPause() {
    const g = this.game, s = this.screens.pause;
    s.innerHTML = '';
    const m = g.meta;
    const p = h('div', 'panel', `<div class="head"><h2>Paused</h2></div><div class="body" style="display:flex;flex-direction:column;gap:8px;min-width:280px">
      <div class="small">${esc(m?.name || '')} · seed ${esc(m?.seedText || '')} · Day ${g.dayNumber}</div>
      <button class="mbtn primary" id="res"><span class="gem"></span>RESUME</button>
      <button class="mbtn" id="wo"><span class="gem"></span>WORLD OPTIONS</button>
      <button class="mbtn" id="set"><span class="gem"></span>SETTINGS</button>
      <button class="mbtn" id="quit"><span class="gem"></span>SAVE &amp; QUIT</button></div>`);
    s.appendChild(p);
    p.querySelector('#res')!.addEventListener('click', () => g.setState('play'));
    p.querySelector('#set')!.addEventListener('click', () => { s.classList.remove('on'); this.openSettings('pause'); });
    p.querySelector('#wo')!.addEventListener('click', () => { s.classList.remove('on'); this.openCreative(); });
    p.querySelector('#quit')!.addEventListener('click', () => { g.exitToMenu(); this.toast('World saved'); });
  }

  openCreative() {
    const g = this.game;
    if (g.state === 'play') g.setState('pause');
    this.screens.pause.classList.remove('on');
    const s = this.screens.creative;
    s.innerHTML = '';
    const cr = g.player.creative;
    const p = h('div', 'panel', `<div class="head"><h2>World options</h2><button class="x" id="cl">✕</button></div><div class="body" id="cb"></div>`);
    p.style.width = 'min(640px, 96vw)'; p.style.height = 'min(560px, 94vh)';
    s.appendChild(p);
    const body = p.querySelector('#cb') as HTMLElement;
    const close = () => { s.classList.remove('on'); g.setState('play'); };
    p.querySelector('#cl')!.addEventListener('click', close);
    const row = (label: string, inner: string) => { const r = h('div', 'set', `<label>${label}</label>${inner}`); body.appendChild(r); return r; };
    const mode = row('Game mode', `<div class="seg"><button data-v="survival" class="${!cr ? 'on' : ''}">Survival</button><button data-v="creative" class="${cr ? 'on' : ''}">Creative</button></div>`);
    this.seg(mode.querySelector('.seg')!, (v) => { g.setMode(v as any); this.openCreative(); this.toast(v === 'creative' ? 'Creative mode' : 'Survival mode'); });
    const tod = row('Time of day', `<input type="range" min="0" max="1" step="0.005"><span class="v"></span>`);
    const ti = tod.querySelector('input') as HTMLInputElement, tv = tod.querySelector('.v') as HTMLElement;
    const fmtT = (t: number) => { const hrs = (t * 24 + 6) % 24; return `${String(Math.floor(hrs)).padStart(2, '0')}:${String(Math.floor((hrs % 1) * 60)).padStart(2, '0')}`; };
    ti.value = String(g.timeOfDay); tv.textContent = fmtT(g.timeOfDay);
    ti.addEventListener('input', () => { g.setTimeOfDay(parseFloat(ti.value)); tv.textContent = fmtT(parseFloat(ti.value)); });
    const quick = row('', `<div class="row"><button class="btn" data-t="0">Dawn</button><button class="btn" data-t="0.25">Noon</button><button class="btn" data-t="0.5">Dusk</button><button class="btn" data-t="0.75">Midnight</button></div>`);
    quick.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { const t = parseFloat((b as HTMLElement).dataset.t!); g.setTimeOfDay(t); ti.value = String(t); tv.textContent = fmtT(t); }));
    const wx = row('Weather', `<div class="seg"><button data-v="clear" class="${g.rainTarget < 0.5 ? 'on' : ''}">Clear</button><button data-v="rain" class="${g.rainTarget >= 0.5 && !g.storm ? 'on' : ''}">Rain</button><button data-v="storm" class="${g.storm ? 'on' : ''}">Storm</button></div>`);
    this.seg(wx.querySelector('.seg')!, (v) => g.setWeather(v as any));
    const rules = g.rules;
    const tog = (label: string, get: () => boolean, set: (v: boolean) => void) => {
      const r = row(label, `<button class="tog ${get() ? 'on' : ''}"></button>`);
      const b = r.querySelector('.tog')!;
      b.addEventListener('click', () => { set(!get()); b.classList.toggle('on', get()); g.audio.ui(); });
    };
    tog('Daylight cycle', () => rules.daylightCycle, (v) => { rules.daylightCycle = v; });
    tog('Weather cycle', () => rules.weatherCycle, (v) => { rules.weatherCycle = v; });
    tog('Creature spawning', () => rules.mobSpawning, (v) => { rules.mobSpawning = v; });
    tog('Keep inventory on death', () => rules.keepInventory, (v) => { rules.keepInventory = v; });
    const df = row('Difficulty', `<div class="seg"><button data-v="0" class="${rules.difficulty === 0 ? 'on' : ''}">Peaceful</button><button data-v="1" class="${rules.difficulty === 1 ? 'on' : ''}">Normal</button><button data-v="2" class="${rules.difficulty === 2 ? 'on' : ''}">Hard</button></div>`);
    this.seg(df.querySelector('.seg')!, (v) => { rules.difficulty = parseInt(v, 10); if (rules.difficulty === 0) for (const m of [...g.mobs.mobs]) if (m.type.hostile) g.mobs.remove(m); });
    if (cr) {
      tog('Flying', () => g.player.flying, (v) => { g.player.flying = v; });
      const sp = h('div', '', `<div class="sect" style="margin:10px 0 6px">Spawn a creature in front of you</div><div class="spawn"></div>`);
      const grid = sp.querySelector('.spawn')!;
      for (const t of MOB_TYPES) {
        const b = h('button', 'btn', `${t.name}<div class="small">${t.hostile ? 'hostile' : t.flying ? 'flying' : 'passive'}</div>`);
        b.addEventListener('click', () => { g.spawnCreature(t.key); this.toast(t.name + ' summoned'); });
        grid.appendChild(b);
      }
      body.appendChild(sp);
      const sv = h('div', 'set', `<label>Set world spawn here</label><button class="btn">Set</button>`);
      sv.querySelector('button')!.addEventListener('click', () => { g.player.spawn = { x: g.player.x, y: g.player.y, z: g.player.z }; this.toast('Spawn point set'); });
      body.appendChild(sv);
    } else body.appendChild(h('div', 'small', 'Switch to Creative mode for flight, unlimited blocks and creature summoning.'));
    s.classList.add('on');
  }

  // ------------------------------------------------------------ HUD
  private buildHud() {
    const hud = h('div', '');
    hud.id = 'hud';
    hud.innerHTML = `<div class="vig water"></div><div class="vig magma"></div><div class="vig hurt"></div>
      <div class="cross"></div><div class="breakbar"><b></b></div>
      <div class="info"></div>
      <div class="topbtns"><div class="ibtn tap" id="hcr">${ICON.star}</div><div class="ibtn tap" id="hinv">${ICON.bag}</div><div class="ibtn tap" id="hpause">${ICON.pause}</div></div>
      <div class="toasts"></div><div class="iname"></div>
      <div class="bottom"><div class="bars"><div class="bar hp"></div><div class="bar air"></div><div class="bar food"></div></div><div class="hotbar"></div></div>`;
    hud.style.display = 'none';
    this.root.appendChild(hud);
    this.hud = hud;
    this.hotbarEl = hud.querySelector('.hotbar')!;
    this.hpEl = hud.querySelector('.bar.hp')!; this.foodEl = hud.querySelector('.bar.food')!; this.airEl = hud.querySelector('.bar.air')!;
    this.infoEl = hud.querySelector('.info')!; this.crossEl = hud.querySelector('.cross')!; this.nameEl = hud.querySelector('.iname')!;
    this.toastEl = hud.querySelector('.toasts')!;
    this.vigHurt = hud.querySelector('.vig.hurt')!; this.vigWater = hud.querySelector('.vig.water')!; this.vigMagma = hud.querySelector('.vig.magma')!;
    this.breakEl = hud.querySelector('.breakbar')!;
    this.creativeBtn = hud.querySelector('#hcr')!;
    for (let i = 0; i < 10; i++) {
      this.hpEl.appendChild(h('i', '', '<b></b>'));
      this.foodEl.appendChild(h('i', '', '<b></b>'));
      this.airEl.appendChild(h('i', '', '<b></b>'));
    }
    hud.querySelector('#hinv')!.addEventListener('click', () => { if (this.game.state === 'play') this.openInventory(); });
    hud.querySelector('#hpause')!.addEventListener('click', () => { if (this.game.state === 'play') this.game.setState('pause'); });
    this.creativeBtn.addEventListener('click', () => { if (this.game.state === 'play') this.openCreative(); });
    this.hotbarEl.addEventListener('pointerdown', (e) => {
      const sl = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
      if (!sl || this.game.state !== 'play') return;
      e.stopPropagation();
      if (sl.dataset.i === 'more') { this.openInventory(); return; }
      this.game.player.inv.selected = parseInt(sl.dataset.i!, 10);
      this.game.audio.ui();
    });
  }

  private slotHtml(s: Stack | null, extra = '') {
    if (!s) return `<div class="slot ${extra}"></div>`;
    const d = item(s.id);
    let dur = '';
    if (d.tool && s.dur !== undefined && s.dur < d.tool.durability) {
      const f = s.dur / d.tool.durability;
      dur = `<div class="dur"><b style="width:${Math.round(f * 100)}%;background:hsl(${Math.round(f * 120)},80%,50%)"></b></div>`;
    }
    return `<div class="slot ${extra}"><img src="${itemIcon(s.id)}" alt="">${s.count > 1 ? `<span class="n">${s.count}</span>` : ''}${dur}</div>`;
  }

  refreshHud() {
    const g = this.game, p = g.player, st = g.settings;
    // size
    const slot = Math.max(34, Math.min(52, Math.floor(Math.min(window.innerWidth / 15, window.innerHeight / 8.5))));
    this.root.style.setProperty('--slot', slot + 'px');
    // hotbar
    const sig = p.inv.slots.slice(0, 9).map((s) => (s ? `${s.id}:${s.count}:${s.dur ?? ''}` : '-')).join('|') + '#' + p.inv.selected;
    if (sig !== this.hotSig) {
      this.hotSig = sig;
      let html = '';
      for (let i = 0; i < 9; i++) html += this.slotHtml(p.inv.slots[i], i === p.inv.selected ? 'sel' : '').replace('class="slot', `data-i="${i}" class="slot`);
      html += `<div class="slot more" data-i="more">⋯</div>`;
      this.hotbarEl.innerHTML = html;
    }
    if (p.inv.selected !== this.lastSel || this.nameTimer > 0) {
      if (p.inv.selected !== this.lastSel) {
        this.lastSel = p.inv.selected; this.nameTimer = 2;
        const s = p.inv.held;
        this.nameEl.textContent = s ? item(s.id).name : '';
      }
      this.nameTimer -= 1 / 60;
      this.nameEl.style.opacity = this.nameTimer > 0 ? '1' : '0';
    }
    // bars
    const surv = !p.creative;
    this.hpEl.style.visibility = surv ? 'visible' : 'hidden';
    this.foodEl.style.visibility = surv ? 'visible' : 'hidden';
    const fill = (el: HTMLElement, v: number) => {
      const kids = el.children;
      for (let i = 0; i < 10; i++) { const f = Math.max(0, Math.min(1, v / 2 - i)); ((kids[i] as HTMLElement).firstChild as HTMLElement).style.width = (f * 100) + '%'; }
    };
    fill(this.hpEl, p.health); fill(this.foodEl, p.hunger);
    const showAir = surv && (p.body.headInWater || p.air < 10);
    this.airEl.style.visibility = showAir ? 'visible' : 'hidden';
    if (showAir) fill(this.airEl, p.air * 2);
    this.creativeBtn.style.display = p.creative ? 'grid' : 'none';
    // effects
    this.vigHurt.style.opacity = p.hurtFlash > 0 ? String(Math.min(1, p.hurtFlash * 2.5)) : (surv && p.health <= 4 ? '0.35' : '0');
    this.vigWater.style.opacity = g.underwater ? '1' : '0';
    this.vigMagma.style.opacity = g.inMagma ? '1' : '0';
    this.crossEl.classList.toggle('target', !!(g.target || g.targetMob));
    this.crossEl.style.display = g.viewMode === 0 && st.aimMode === 'crosshair' ? 'block' : 'none';
    if (g.breakProgress > 0) { this.breakEl.style.display = 'block'; (this.breakEl.firstChild as HTMLElement).style.width = Math.round(g.breakProgress * 100) + '%'; }
    else this.breakEl.style.display = 'none';
    // info
    let info = '';
    if (st.showFps) {
      const w = g.world?.stats();
      info += `${g.fps} FPS`;
      if (w) info += ` · ${w.chunks} chunks · ${w.visible}/${w.meshes} meshes · ${(w.tris / 1000).toFixed(0)}k tris`;
      info += `<br>XYZ ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)} · ${g.biome}`;
    }
    const tod = g.timeOfDay, hrs = (tod * 24 + 6) % 24;
    info += `${info ? '<br>' : ''}Day ${g.dayNumber} · ${String(Math.floor(hrs)).padStart(2, '0')}:${String(Math.floor((hrs % 1) * 60)).padStart(2, '0')}`;
    if (g.target) info += `<br><span style="color:#f2c27a">${esc(BLOCKS[g.target.id]?.name || '')}</span>`;
    else if (g.targetMob) info += `<br><span style="color:#ff9b8f">${esc(g.targetMob.type.name)}</span>`;
    if (this.infoEl.innerHTML !== info) this.infoEl.innerHTML = info;
    if (g.state === 'play') this.touch.update();
    if (g.state === 'inventory') this.refreshInventoryIfChanged();
  }

  // ------------------------------------------------------------ inventory / crafting / crates
  openInventory(station?: Station) {
    const g = this.game;
    this.crate = null; this.cratePos = null;
    const avail = g.nearbyStations();
    this.station = station && avail.has(station) ? station : (avail.has('bench') && station !== 'hand' ? 'bench' : 'hand');
    if (station) this.station = station;
    if (!g.player.creative && this.invTab === 'catalog') this.invTab = 'pack';
    g.setState('inventory');
    this.renderInventory();
  }

  openCrate(items: (Stack | null)[], x: number, y: number, z: number) {
    this.crate = items; this.cratePos = [x, y, z];
    this.invTab = 'pack';
    this.game.setState('inventory');
    this.renderInventory();
  }

  private closeInventory() {
    const g = this.game;
    if (this.cursor) {
      const left = g.player.inv.add(this.cursor.id, this.cursor.count, this.cursor.dur);
      if (left > 0) g.dropFromInventory({ ...this.cursor, count: left });
      this.cursor = null;
    }
    if (this.cratePos && g.world) g.world.markCrateDirty(this.cratePos[0], this.cratePos[2]);
    this.crate = null; this.cratePos = null;
    g.setState('play');
  }

  private invSignature() {
    const g = this.game;
    return JSON.stringify([g.player.inv.slots, this.crate, this.cursor, this.invTab, this.station]);
  }
  private refreshInventoryIfChanged() { if (this.invSignature() !== this.invSig) this.renderInventory(); }

  private clickSlot(arr: (Stack | null)[], i: number, half: boolean) {
    const s = arr[i];
    const c = this.cursor;
    if (!c) {
      if (!s) return;
      if (half && s.count > 1) { const n = Math.ceil(s.count / 2); this.cursor = { ...s, count: n }; s.count -= n; }
      else { this.cursor = s; arr[i] = null; }
    } else if (!s) {
      if (half) { arr[i] = { ...c, count: 1 }; c.count -= 1; if (c.count <= 0) this.cursor = null; }
      else { arr[i] = c; this.cursor = null; }
    } else if (s.id === c.id && maxStack(s.id) > 1) {
      const room = maxStack(s.id) - s.count;
      const n = Math.min(room, half ? 1 : c.count);
      s.count += n; c.count -= n;
      if (c.count <= 0) this.cursor = null;
    } else { arr[i] = c; this.cursor = s; }
    this.game.audio.ui();
    this.renderInventory();
  }

  private renderInventory() {
    const g = this.game, inv = g.player.inv, cr = g.player.creative;
    const s = this.screens.inventory;
    this.invSig = this.invSignature();
    const scrollY = (s.querySelector('.recipes') as HTMLElement | null)?.scrollTop ?? 0;
    const leftScroll = (s.querySelector('.left') as HTMLElement | null)?.scrollTop ?? 0;
    s.innerHTML = '';
    const p = h('div', 'panel inv');
    const title = this.crate ? 'Storage crate' : 'Pack';
    p.innerHTML = `<div class="head"><h2>${title}</h2>
      ${cr && !this.crate ? `<div class="tabs"><button class="tab ${this.invTab === 'pack' ? 'on' : ''}" data-t="pack">Pack</button><button class="tab ${this.invTab === 'catalog' ? 'on' : ''}" data-t="catalog">Catalog</button></div>` : ''}
      <div class="held small" id="held"></div>
      <button class="btn" id="sort">Sort</button><button class="btn" id="drop">Drop</button>${cr ? '<button class="btn warn" id="trash">Trash</button>' : ''}<button class="x" id="cl">✕</button></div>
      <div class="body"><div class="left" id="left"></div><div class="right" id="right"></div></div>`;
    s.appendChild(p);
    p.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { this.invTab = (t as HTMLElement).dataset.t as any; this.renderInventory(); }));
    p.querySelector('#cl')!.addEventListener('click', () => this.closeInventory());
    p.querySelector('#drop')!.addEventListener('click', () => { if (this.cursor) { g.dropFromInventory(this.cursor); this.cursor = null; this.renderInventory(); } else this.toast('Pick up an item first, then press Drop'); });
    p.querySelector('#trash')?.addEventListener('click', () => { this.cursor = null; this.renderInventory(); });
    p.querySelector('#sort')!.addEventListener('click', () => {
      const pack = inv.slots.slice(9).filter((x): x is Stack => !!x);
      for (let i = 9; i < 36; i++) inv.slots[i] = null;
      pack.sort((a, b) => a.id - b.id);
      for (const st of pack) { const left = inv.add(st.id, st.count, st.dur); if (left) g.dropFromInventory({ ...st, count: left }); }
      this.renderInventory();
    });
    const held = p.querySelector('#held') as HTMLElement;
    held.innerHTML = this.cursor ? `${this.slotHtml(this.cursor, 'pick')}<span>${esc(item(this.cursor.id).name)} — tap a slot to place</span>` : '<span>Tap an item to pick it up · long-press to split</span>';
    const left = p.querySelector('#left') as HTMLElement;
    const grid = (arr: (Stack | null)[], from: number, to: number, label: string) => {
      left.appendChild(h('div', 'sect', label));
      const gEl = h('div', 'grid');
      for (let i = from; i < to; i++) {
        const tmp = h('div'); tmp.innerHTML = this.slotHtml(arr[i], arr === inv.slots && i === inv.selected ? 'sel' : '');
        const el = tmp.firstElementChild as HTMLElement;
        this.bindSlot(el, () => this.clickSlot(arr, i, false), () => this.clickSlot(arr, i, true));
        gEl.appendChild(el);
      }
      left.appendChild(gEl);
    };
    if (this.invTab === 'catalog' && cr && !this.crate) {
      left.appendChild(h('div', 'sect', 'Catalog — tap to take a full stack'));
      const gEl = h('div', 'grid cat');
      for (const d of ITEMS) {
        if (!d) continue;
        if (d.block !== undefined && !BLOCKS[d.block]?.catalog) continue;
        const tmp = h('div'); tmp.innerHTML = this.slotHtml({ id: d.id, count: 1 });
        const el = tmp.firstElementChild as HTMLElement;
        el.title = d.name;
        el.addEventListener('click', () => { this.cursor = { id: d.id, count: d.maxStack, ...(d.tool ? { dur: d.tool.durability } : {}) }; g.audio.ui(); this.renderInventory(); });
        gEl.appendChild(el);
      }
      left.appendChild(gEl);
      grid(inv.slots, 0, 9, 'Hotbar');
    } else {
      if (this.crate) grid(this.crate, 0, 27, 'Crate');
      grid(inv.slots, 9, 36, 'Pack');
      grid(inv.slots, 0, 9, 'Hotbar');
    }
    left.scrollTop = leftScroll;
    // crafting
    const right = p.querySelector('#right') as HTMLElement;
    if (this.crate) {
      right.innerHTML = `<div class="sect">Crate</div><div class="small">Move items between the crate and your pack. Contents are saved with the world and spill out if the crate is broken.</div>`;
    } else {
      const avail = g.nearbyStations();
      const chips = h('div', 'tabs');
      for (const [k, n] of [['hand', 'Hand'], ['bench', 'Workbench'], ['kiln', 'Kiln']] as [Station, string][]) {
        const c = h('button', 'chip' + (this.station === k ? ' on' : '') + (avail.has(k) ? '' : ' off'), n);
        c.addEventListener('click', () => { this.station = k; this.renderInventory(); });
        chips.appendChild(c);
      }
      right.appendChild(h('div', 'sect', 'Crafting'));
      right.appendChild(chips);
      if (!avail.has(this.station)) right.appendChild(h('div', 'small', `Stand within 4 blocks of a ${this.station === 'bench' ? 'Workbench' : 'Kiln'} to use these recipes.`));
      const list = h('div', 'recipes');
      const recs = RECIPES.filter((r) => r.station === this.station);
      const usable = avail.has(this.station);
      const sorted = [...recs].sort((a, b) => Number(canCraft(inv, b, cr)) - Number(canCraft(inv, a, cr)));
      for (const r of sorted) {
        const ok = usable && canCraft(inv, r, cr);
        const row = h('div', 'rec' + (ok ? '' : ' no'));
        const ings = r.inputs.map(([ing, n]) => {
          const have = ingredientIds(ing).reduce((a, id) => a + inv.count(id), 0);
          const icon = itemIcon(ingredientIds(ing)[0]);
          return `<span class="ing ${have >= n || cr ? '' : 'miss'}"><img src="${icon}" alt="">${n}× ${esc(ingredientName(ing))}${cr ? '' : ` (${have})`}</span>`;
        }).join('');
        row.innerHTML = `<div class="out"><img src="${itemIcon(r.out)}" alt="">${r.count > 1 ? `<span class="n">${r.count}</span>` : ''}</div><div class="info2"><div class="nm">${esc(item(r.out).name)}</div><div class="ings">${ings}</div></div><button class="btn ${ok ? 'go' : ''}" ${ok ? '' : 'disabled'}>Craft</button>`;
        const go = () => { if (usable && g.craft(r)) this.renderInventory(); };
        row.querySelector('button')!.addEventListener('click', go);
        list.appendChild(row);
      }
      right.appendChild(list);
      list.scrollTop = scrollY;
    }
  }

  private bindSlot(el: HTMLElement, tap: () => void, long: () => void) {
    let timer: any = 0, fired = false;
    el.addEventListener('pointerdown', () => { fired = false; timer = setTimeout(() => { fired = true; long(); }, 420); });
    el.addEventListener('pointerup', () => { clearTimeout(timer); if (!fired) tap(); });
    el.addEventListener('pointerleave', () => clearTimeout(timer));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); });
  }
}

export { DAY_LENGTH };
