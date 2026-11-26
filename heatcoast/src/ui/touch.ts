import type { Game } from '../game/game';
import type { Btn } from '../core/input';
import { WEAPONS } from '../combat/weapons';

const h = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; };
interface TB { id: string; label: string; btn: Btn; cls?: string; r: number; b: number; mode: 'foot' | 'car' | 'both' | 'top'; hold?: boolean; top?: boolean }

/** Mobile controls: floating stick, swipe-look, context-sensitive buttons for on-foot and driving. */
export class Touch {
  root: HTMLElement; private stick: HTMLElement; private knob: HTMLElement; private btns = new Map<string, HTMLElement>();
  private stickId = -1; private stickO = { x: 0, y: 0 }; private lookId = -1; private lookP = { x: 0, y: 0 };
  private enabled = false; private ctxEl!: HTMLElement;
  private defs: TB[] = [
    { id: 'fire', label: 'FIRE', btn: 'fire', cls: 'big fire', r: 26, b: 36, mode: 'foot', hold: true },
    { id: 'aim', label: 'AIM', btn: 'aim', r: 124, b: 30, mode: 'foot', hold: true },
    { id: 'jump', label: 'JUMP', btn: 'jump', r: 40, b: 136, mode: 'foot', hold: true },
    { id: 'sprint', label: 'RUN', btn: 'sprint', r: 120, b: 112, mode: 'foot', hold: true },
    { id: 'enter', label: 'CAR', btn: 'enter', r: 196, b: 56, mode: 'foot' },
    { id: 'wpn', label: 'GUN', btn: 'wnext', cls: 'sm', r: 36, b: 220, mode: 'foot' },
    { id: 'reload', label: 'R', btn: 'reload', cls: 'sm', r: 96, b: 200, mode: 'foot' },
    { id: 'switch', label: '⇄', btn: 'switch', cls: 'sm', r: 156, b: 184, mode: 'foot' },
    { id: 'special', label: 'FOCUS', btn: 'special', cls: 'sm', r: 214, b: 150, mode: 'both' },
    { id: 'gas', label: 'GAS', btn: 'gas', cls: 'big', r: 26, b: 40, mode: 'car', hold: true },
    { id: 'brake', label: 'BRAKE', btn: 'brake', cls: 'big', r: 124, b: 26, mode: 'car', hold: true },
    { id: 'hb', label: 'DRIFT', btn: 'handbrake', r: 40, b: 140, mode: 'car', hold: true },
    { id: 'exit', label: 'EXIT', btn: 'enter', cls: 'sm', r: 120, b: 140, mode: 'car' },
    { id: 'horn', label: 'HORN', btn: 'horn', cls: 'sm', r: 176, b: 120, mode: 'car', hold: true },
    { id: 'cam', label: 'CAM', btn: 'camera', cls: 'sm', r: 36, b: 222, mode: 'car' },
    { id: 'radio', label: '♪', btn: 'wnext', cls: 'sm', r: 96, b: 210, mode: 'car' },
    { id: 'dby', label: 'SHOOT', btn: 'fire', cls: 'sm', r: 214, b: 70, mode: 'car', hold: true },
    { id: 'pause', label: '☰', btn: 'pause', cls: 'sm', r: 0, b: 0, mode: 'top', top: true },
    { id: 'phone', label: '📱', btn: 'phone', cls: 'sm', r: 0, b: 0, mode: 'top', top: true },
  ];
  constructor(private g: Game, ui: HTMLElement) {
    this.root = h(`<div id="touch"><div class="zone" id="zl"></div><div class="zone" id="zr"></div><div class="stick"><i></i></div></div>`);
    ui.appendChild(this.root);
    this.stick = this.root.querySelector('.stick')!; this.knob = this.stick.querySelector('i')!;
    const inp = g.input;
    for (const d of this.defs) {
      const e = h(`<div class="tbtn ${d.cls ?? ''}">${d.label}</div>`); this.root.appendChild(e); this.btns.set(d.id, e);
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); e.setPointerCapture(ev.pointerId); e.classList.add('on'); if (d.btn === 'aim' && !d.hold) return; if (d.id === 'aim') { inp.touchDown('aim'); return; } inp.touchDown(d.btn); if (d.btn === 'fire' && d.id === 'dby') inp.touchDown('aim'); g.audio.init(); g.vibrate(8); });
      const up = (ev: PointerEvent) => { ev.preventDefault(); e.classList.remove('on'); inp.touchUp(d.btn); if (d.id === 'dby') inp.touchUp('aim'); };
      e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up); e.addEventListener('lostpointercapture', () => { e.classList.remove('on'); inp.touchUp(d.btn); });
    }
    // context action button shows what "E" would do
    this.ctxEl = h(`<div class="tbtn" style="width:auto;min-width:110px;height:44px;border-radius:22px;padding:0 14px;font-size:13px;display:none"></div>`); this.root.appendChild(this.ctxEl);
    this.ctxEl.addEventListener('pointerdown', (ev) => { ev.preventDefault(); ev.stopPropagation(); inp.press('interact'); g.vibrate(8); });
    const zl = this.root.querySelector('#zl') as HTMLElement, zr = this.root.querySelector('#zr') as HTMLElement;
    zl.addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.stickId >= 0) return; this.stickId = e.pointerId; zl.setPointerCapture(e.pointerId); this.stickO = { x: e.clientX, y: e.clientY }; this.stick.style.display = 'block'; this.stick.style.left = e.clientX + 'px'; this.stick.style.top = e.clientY + 'px'; this.knob.style.transform = ''; inp.device = 'touch'; g.audio.init(); });
    zl.addEventListener('pointermove', (e) => { if (e.pointerId !== this.stickId) return; const R = 55; let dx = e.clientX - this.stickO.x, dy = e.clientY - this.stickO.y; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } this.knob.style.transform = `translate(${dx}px,${dy}px)`; inp.touchMove.x = dx / R; inp.touchMove.y = -dy / R; });
    const endStick = (e: PointerEvent) => { if (e.pointerId !== this.stickId) return; this.stickId = -1; this.stick.style.display = 'none'; inp.touchMove.x = inp.touchMove.y = 0; };
    zl.addEventListener('pointerup', endStick); zl.addEventListener('pointercancel', endStick);
    zr.addEventListener('pointerdown', (e) => { e.preventDefault(); this.lookId = e.pointerId; zr.setPointerCapture(e.pointerId); this.lookP = { x: e.clientX, y: e.clientY }; inp.device = 'touch'; g.audio.init(); });
    zr.addEventListener('pointermove', (e) => { if (e.pointerId !== this.lookId) return; const k = 0.0062; inp.touchLook.x += (e.clientX - this.lookP.x) * k; inp.touchLook.y += (e.clientY - this.lookP.y) * k * 0.8; this.lookP = { x: e.clientX, y: e.clientY }; });
    const endLook = (e: PointerEvent) => { if (e.pointerId === this.lookId) this.lookId = -1; };
    zr.addEventListener('pointerup', endLook); zr.addEventListener('pointercancel', endLook);
    this.layout();
  }
  get active() { const m = this.g.settings.touchMode; return m === 'on' || (m === 'auto' && (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window)); }
  show(on: boolean) { this.enabled = on; document.body.classList.toggle('touch', on && this.active); this.root.style.display = on && this.active ? 'block' : 'none'; }
  layout() {
    const s = this.g.settings.buttonScale; document.documentElement.style.setProperty('--bs', String(s)); document.documentElement.style.setProperty('--bo', String(this.g.settings.buttonOpacity));
    const sar = 'env(safe-area-inset-right, 0px)', sab = 'env(safe-area-inset-bottom, 0px)';
    for (const d of this.defs) {
      const e = this.btns.get(d.id)!;
      if (d.top) { e.style.top = 'calc(env(safe-area-inset-top,0px) + 12px)'; e.style.left = d.id === 'pause' ? 'calc(env(safe-area-inset-left,0px) + 12px)' : 'calc(env(safe-area-inset-left,0px) + 70px)'; continue; }
      e.style.right = `calc(${sar} + ${d.r * s}px)`; e.style.bottom = `calc(${sab} + ${d.b * s}px)`;
    }
    this.ctxEl.style.right = `calc(${sar} + ${260 * s}px)`; this.ctxEl.style.bottom = `calc(${sab} + ${30 * s}px)`;
  }
  private lastMode = '';
  setContext(label: string | null) {
    if (!this.enabled) return;
    const P = this.g.player; const mode = P.vehicle ? 'car' : 'foot';
    if (mode !== this.lastMode) { this.lastMode = mode; for (const d of this.defs) this.btns.get(d.id)!.style.display = d.mode === mode || d.mode === 'both' || d.mode === 'top' ? 'flex' : 'none'; }
    const isGun = WEAPONS[P.weapon]?.kind === 'gun';
    const fire = this.btns.get('fire')!; fire.textContent = isGun ? 'FIRE' : 'PUNCH';
    this.btns.get('aim')!.style.display = mode === 'foot' && isGun ? 'flex' : 'none'; this.btns.get('reload')!.style.display = mode === 'foot' && isGun ? 'flex' : 'none';
    const near = !P.vehicle && P.nearestVehicle(3.6); this.btns.get('enter')!.style.opacity = near ? '1' : '0.4';
    const show = !!label && !(label.startsWith('Enter ') && near) && !label.startsWith('Carjack');
    this.ctxEl.style.display = show && mode === 'foot' ? 'flex' : 'none'; if (show) this.ctxEl.textContent = label!;
  }
}
