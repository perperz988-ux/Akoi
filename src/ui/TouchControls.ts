import type { Game } from '../core/Game';
import type { Action } from '../core/Input';

interface BtnDef { id: string; label: string; action?: Action | 'context' | 'phone' | 'map' | 'pause' | 'sprintToggle'; x: number; y: number; size: number; modes: ('foot' | 'veh' | 'heli' | 'boat' | 'aim')[]; icon?: string; big?: boolean; toggle?: boolean }

const ICON = {
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19V6M6 11l6-6 6 6"/></svg>',
  crouch: '<svg viewBox="0 0 24 24"><path d="M6 10l6 7 6-7"/></svg>',
  fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5"/></svg>',
  aim: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-3-6.2M20 4v5h-5"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg>',
  dodge: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  cover: '<svg viewBox="0 0 24 24"><rect x="5" y="9" width="14" height="10"/><path d="M8 9V5h8v4"/></svg>',
  sprint: '<svg viewBox="0 0 24 24"><path d="M7 5l5 7-5 7M13 5l5 7-5 7"/></svg>',
  phone: '<svg viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="12" rx="2"/><circle cx="12" cy="13" r="3"/></svg>',
  radio: '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="11" rx="2"/><circle cx="16" cy="13.5" r="2.5"/><path d="M6 12h6M6 15h6M8 8l8-4"/></svg>',
  light: '<svg viewBox="0 0 24 24"><path d="M3 12h6M3 8h6M3 16h6"/><path d="M13 6a6 6 0 0 1 0 12z"/></svg>',
  horn: '<svg viewBox="0 0 24 24"><path d="M4 10v4h4l6 4V6L8 10zM17 9a4 4 0 0 1 0 6"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
};

/**
 * On-screen touch controls: floating virtual joystick, look area, context-sensitive buttons.
 * Layout is fully customisable (drag & scale) and stored in settings.
 */
export class TouchControls {
  root: HTMLElement;
  private btns = new Map<string, { el: HTMLElement; def: BtnDef }>();
  private stick: HTMLElement; private knob: HTMLElement;
  private stickId = -1; private stickOrigin = { x: 0, y: 0 }; private lookId = -1; private lookLast = { x: 0, y: 0 };
  private moveVec = { x: 0, y: 0 };
  editing = false;
  visible = true;
  private mode: 'foot' | 'veh' | 'heli' | 'boat' = 'foot';
  private ctxBtn!: HTMLElement;
  private defs: BtnDef[] = [
    { id: 'fire', label: 'Fire', action: 'attack', x: 3, y: 26, size: 82, modes: ['foot'], icon: ICON.fire, big: true },
    { id: 'aim', label: 'Aim', action: 'aim', x: 17, y: 40, size: 62, modes: ['foot'], icon: ICON.aim },
    { id: 'jump', label: 'Jump', action: 'jump', x: 3, y: 50, size: 62, modes: ['foot'], icon: ICON.jump },
    { id: 'context', label: 'Use', action: 'context', x: 16, y: 14, size: 70, modes: ['foot', 'veh', 'heli', 'boat'], big: true },
    { id: 'sprint', label: 'Run', action: 'sprint', x: 16, y: 65, size: 54, modes: ['foot'], icon: ICON.sprint },
    { id: 'crouch', label: 'Crouch', action: 'crouch', x: 27, y: 52, size: 50, modes: ['foot'], icon: ICON.crouch },
    { id: 'dodge', label: 'Dodge', action: 'dodge', x: 27, y: 30, size: 50, modes: ['foot'], icon: ICON.dodge },
    { id: 'cover', label: 'Cover', action: 'cover', x: 28, y: 12, size: 50, modes: ['foot'], icon: ICON.cover },
    { id: 'reload', label: 'Reload', action: 'reload', x: 36, y: 40, size: 46, modes: ['foot'], icon: ICON.reload },
    { id: 'weapon', label: 'Weapon', action: 'weaponNext', x: 36, y: 20, size: 46, modes: ['foot'], icon: ICON.swap },
    { id: 'phone', label: 'Phone', action: 'phone', x: 36, y: 9, size: 44, modes: ['foot', 'veh', 'boat', 'heli'], icon: ICON.phone },
    // vehicle
    { id: 'gas', label: 'GAS', action: 'accelerate', x: 3, y: 12, size: 92, modes: ['veh', 'boat'], big: true },
    { id: 'brake', label: 'BRAKE', action: 'brake', x: 20, y: 5, size: 74, modes: ['veh', 'boat'] },
    { id: 'hand', label: 'Hand', action: 'handbrake', x: 12, y: 36, size: 56, modes: ['veh'] },
    { id: 'nitro', label: 'NOS', action: 'nitro', x: 3, y: 50, size: 56, modes: ['veh', 'boat'] },
    { id: 'horn', label: 'Horn', action: 'horn', x: 21, y: 36, size: 46, modes: ['veh', 'boat', 'heli'], icon: ICON.horn },
    { id: 'vcam', label: 'View', action: 'camera', x: 56, y: 9, size: 44, modes: ['veh', 'boat', 'heli'], icon: ICON.cam },
    { id: 'radio', label: 'Radio', action: 'radio', x: 48, y: 9, size: 44, modes: ['veh', 'boat'], icon: ICON.radio },
    { id: 'lights', label: 'Lights', action: 'interact', x: 42, y: 9, size: 44, modes: ['veh', 'boat', 'heli'], icon: ICON.light },
    { id: 'hup', label: 'Up', action: 'ascend', x: 3, y: 38, size: 72, modes: ['heli'], icon: ICON.up, big: true },
    { id: 'hdown', label: 'Down', action: 'descend', x: 3, y: 14, size: 72, modes: ['heli'], icon: ICON.down },
  ];

  constructor(private g: Game, ui: HTMLElement) {
    this.root = document.createElement('div'); this.root.style.cssText = 'position:absolute;inset:0;display:none;';
    ui.appendChild(this.root);
    const sz = document.createElement('div'); sz.className = 'stick-zone'; this.root.appendChild(sz);
    const lz = document.createElement('div'); lz.className = 'look-zone'; this.root.appendChild(lz);
    this.stick = document.createElement('div'); this.stick.className = 'stick'; this.knob = document.createElement('i'); this.stick.appendChild(this.knob); this.root.appendChild(this.stick);
    sz.addEventListener('pointerdown', (e) => this.stickDown(e)); sz.addEventListener('pointermove', (e) => this.stickMove(e)); sz.addEventListener('pointerup', (e) => this.stickUp(e)); sz.addEventListener('pointercancel', (e) => this.stickUp(e));
    lz.addEventListener('pointerdown', (e) => { if (this.editing) return; if (this.lookId >= 0) return; this.lookId = e.pointerId; lz.setPointerCapture(e.pointerId); this.lookLast = { x: e.clientX, y: e.clientY }; g.input.lastDevice = 'touch'; });
    lz.addEventListener('pointermove', (e) => { if (e.pointerId !== this.lookId) return; const dx = e.clientX - this.lookLast.x, dy = e.clientY - this.lookLast.y; this.lookLast = { x: e.clientX, y: e.clientY }; g.input.addTouchLook(dx * 1.15, dy * 1.15); });
    const up = (e: PointerEvent) => { if (e.pointerId === this.lookId) this.lookId = -1; };
    lz.addEventListener('pointerup', up); lz.addEventListener('pointercancel', up);
    for (const d of this.defs) this.makeBtn(d);
    this.ctxBtn = this.btns.get('context')!.el;
    this.applyLayout();
    window.addEventListener('resize', () => this.applyLayout());
    // tilt steering
    window.addEventListener('deviceorientation', (e) => { this.tilt = e.gamma ?? 0; });
  }
  private tilt = 0;

  private makeBtn(d: BtnDef) {
    const el = document.createElement('div'); el.className = 'tbtn' + (d.big ? ' big' : ''); el.dataset.id = d.id;
    el.innerHTML = d.icon ? d.icon : `<span>${d.label}</span>`;
    el.style.touchAction = 'none';
    const input = this.g.input;
    let pid = -1;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      if (this.editing) { this.dragStart(e, d, el); return; }
      pid = e.pointerId; el.setPointerCapture(e.pointerId); el.classList.add('down');
      input.lastDevice = 'touch'; this.g.audio.init();
      this.press(d, true);
      if (this.g.settings.vibration && navigator.vibrate && d.id !== 'gas' && d.id !== 'brake') navigator.vibrate(8);
    };
    const upf = (e: PointerEvent) => { if (this.editing) return; if (e.pointerId !== pid) return; pid = -1; el.classList.remove('down'); this.press(d, false); };
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', upf); el.addEventListener('pointercancel', upf);
    el.addEventListener('lostpointercapture', (e) => { if (!this.editing && e.pointerId === pid) upf(e as PointerEvent); });
    this.root.appendChild(el); this.btns.set(d.id, { el, def: d });
  }

  private press(d: BtnDef, down: boolean) {
    const g = this.g, input = g.input;
    switch (d.action) {
      case 'context': if (down) g.contextPress(); break;
      case 'phone': if (down) g.hud?.togglePhone(); break;
      case 'sprint': input.setTouchButton('sprint', down); break;
      default: if (d.action) input.setTouchButton(d.action as Action, down);
    }
  }

  // ---- joystick
  private stickDown(e: PointerEvent) {
    if (this.editing || this.stickId >= 0) return;
    this.stickId = e.pointerId; (e.target as HTMLElement).setPointerCapture(e.pointerId);
    this.g.input.lastDevice = 'touch'; this.g.audio.init();
    const r = this.root.getBoundingClientRect();
    const fixed = this.g.settings.stickFixed;
    const lay = this.g.settings.layout['stick'];
    const fx = lay ? lay.x : 11, fy = lay ? lay.y : 28;
    this.stickOrigin = fixed ? { x: r.left + (fx / 100) * r.width, y: r.bottom - (fy / 100) * r.height } : { x: e.clientX, y: e.clientY };
    this.stick.style.display = 'block'; this.stick.style.left = this.stickOrigin.x - 64 - r.left + 'px'; this.stick.style.top = this.stickOrigin.y - 64 - r.top + 'px';
    this.stickMove(e);
  }
  private stickMove(e: PointerEvent) {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y;
    const R = 56; const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    let x = dx / R, y = -dy / R;
    const m = Math.hypot(x, y); const dead = 0.12;
    if (m < dead) { x = y = 0; } else { const k = (m - dead) / (1 - dead) / m; x *= k; y *= k; }
    this.moveVec = { x, y };
    // sprint-by-push: full deflection flagged through magnitude handled in Player
    this.g.input.touchMoveX = x; this.g.input.touchMoveY = y;
  }
  private stickUp(e: PointerEvent) {
    if (e.pointerId !== this.stickId) return;
    this.stickId = -1; this.stick.style.display = this.g.settings.stickFixed ? 'block' : 'none'; this.knob.style.transform = '';
    this.moveVec = { x: 0, y: 0 }; this.g.input.touchMoveX = 0; this.g.input.touchMoveY = 0;
  }

  // ---- layout / editing
  applyLayout() {
    const W = this.root.clientWidth || window.innerWidth, H = this.root.clientHeight || window.innerHeight;
    const unit = Math.min(W, H * 1.8) / 900; // responsive scale
    const base = Math.max(0.78, Math.min(1.25, unit)) * this.g.settings.touchScale;
    const lay = this.g.settings.layout;
    for (const { el, def } of this.btns.values()) {
      const l = lay[def.id] ?? { x: def.x, y: def.y, s: 1 };
      const size = def.size * l.s * base;
      el.style.width = el.style.height = size + 'px';
      el.style.right = `calc(${l.x}% + var(--sar))`; el.style.bottom = `calc(${l.y}% * ${H / 100 / 1} / ${H / 100} + var(--sab))`;
      el.style.bottom = `calc(${(l.y / 100) * H}px - ${size / 2}px + var(--sab))`;
      el.style.right = `calc(${(l.x / 100) * W}px + var(--sar))`;
      el.style.opacity = String(this.g.settings.touchOpacity);
    }
    const sl = lay['stick'] ?? { x: 11, y: 28, s: 1 };
    this.stick.style.width = this.stick.style.height = 128 * sl.s * base + 'px';
    if (this.g.settings.stickFixed && this.stickId < 0) { this.stick.style.display = 'block'; this.stick.style.left = (sl.x / 100) * W - 64 * sl.s * base + 'px'; this.stick.style.top = H - (sl.y / 100) * H - 64 * sl.s * base + 'px'; }
  }

  private drag: { id: string; px: number; py: number; startX: number; startY: number; startL: ButtonLayoutAny } | null = null;
  private dragStart(e: PointerEvent, d: BtnDef, el: HTMLElement) {
    el.setPointerCapture(e.pointerId);
    const lay = this.g.settings.layout[d.id] ?? { x: d.x, y: d.y, s: 1 };
    this.drag = { id: d.id, px: e.clientX, py: e.clientY, startX: e.clientX, startY: e.clientY, startL: { ...lay } };
    const move = (ev: PointerEvent) => {
      if (!this.drag) return; const W = window.innerWidth, H = window.innerHeight;
      const nx = this.drag.startL.x - ((ev.clientX - this.drag.startX) / W) * 100, ny = this.drag.startL.y - ((ev.clientY - this.drag.startY) / H) * 100;
      this.g.settings.layout[d.id] = { x: Math.max(0, Math.min(90, nx)), y: Math.max(2, Math.min(95, ny)), s: this.drag.startL.s };
      this.applyLayout();
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); this.drag = null; this.g.saveSettings(); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
  }
  setEditing(on: boolean) {
    this.editing = on; document.body.classList.toggle('editlayout', on);
    for (const { el } of this.btns.values()) el.style.display = on ? 'flex' : el.style.display;
    if (!on) this.updateVisibility(true);
  }
  resetLayout() { this.g.settings.layout = {}; this.applyLayout(); this.g.saveSettings(); }
  scaleAll(f: number) { this.g.settings.touchScale = f; this.applyLayout(); this.g.saveSettings(); }

  /** per-frame: choose which buttons are visible for the current mode and update labels */
  updateVisibility(force = false) {
    const g = this.g, p = g.player;
    const touch = g.input.lastDevice === 'touch' || g.settings.forceTouch;
    const show = this.visible && touch && !g.paused && g.state === 'playing' && !g.hud?.menuOpen;
    this.root.style.display = show || this.editing ? 'block' : 'none';
    if (!show && !this.editing) return;
    let mode: 'foot' | 'veh' | 'heli' | 'boat' = 'foot';
    const v = p.vehicle;
    if (p.inVehicle && v) mode = v.isHeli ? 'heli' : v.isBoat ? 'boat' : 'veh';
    const aim = p.aiming;
    this.mode = mode;
    for (const { el, def } of this.btns.values()) {
      const ok = this.editing ? def.modes.includes(mode) : def.modes.includes(mode);
      el.style.display = ok ? 'flex' : 'none';
      if (def.id === 'sprint') el.classList.toggle('down', g.input.isHeld('sprint'));
    }
    void aim; void force;
    // context button label
    const ca = g.contextAction();
    const ctxEl = this.ctxBtn;
    if (mode === 'foot') { ctxEl.innerHTML = `<span>${ca ? shortLabel(ca.label) : 'Use'}</span>`; ctxEl.style.opacity = ca ? String(g.settings.touchOpacity) : String(g.settings.touchOpacity * 0.45); }
    else { ctxEl.innerHTML = `<span>${v && v.isHeli && v.heliAlt > 3.5 ? 'Land' : 'Exit'}</span>`; ctxEl.style.opacity = String(g.settings.touchOpacity); }
    // tilt steering overrides stick X in vehicles
    if (g.settings.tiltSteer && mode !== 'foot' && mode !== 'heli') g.input.touchMoveX = Math.max(-1, Math.min(1, this.tilt / 22));
  }
}
type ButtonLayoutAny = { x: number; y: number; s: number };
const shortLabel = (s: string) => (s.length > 14 ? s.slice(0, 13) + '…' : s);
