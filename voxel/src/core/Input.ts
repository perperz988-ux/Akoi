// Unified input state from keyboard/mouse, touch controls and gamepads.
import type { Settings } from './Settings';

export type Action =
  | 'place' | 'interact' | 'inventory' | 'pause' | 'drop' | 'dropStack' | 'next' | 'prev' | 'view' | 'fly' | 'attack'
  | 'slot0' | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5' | 'slot6' | 'slot7' | 'slot8' | 'sprintToggle' | 'creative';

export class Input {
  moveX = 0; moveY = 0;
  lookX = 0; lookY = 0;
  jump = false;
  sneak = false;
  sprint = false;
  breakHeld = false;
  touchMoveX = 0; touchMoveY = 0;
  touchBreak = false; touchJump = false;
  aim: { x: number; y: number } | null = null;
  private actions = new Set<Action>();
  private keys = new Set<string>();
  private mouseBreak = false;
  pointerLocked = false;
  usingTouch = 'ontouchstart' in window;
  private padPrev: boolean[] = [];
  gamepadActive = false;
  enabled = true;
  lastJumpTap = 0;

  constructor(private canvas: HTMLCanvasElement, private settings: Settings) {
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyE': this.fire('inventory'); break;
        case 'Escape': this.fire('pause'); break;
        case 'KeyQ': this.fire(e.ctrlKey ? 'dropStack' : 'drop'); break;
        case 'KeyF': this.fire('interact'); break;
        case 'F5': case 'KeyV': this.fire('view'); e.preventDefault(); break;
        case 'KeyG': this.fire('fly'); break;
        case 'KeyC': this.fire('creative'); break;
        case 'Space': {
          const now = performance.now();
          if (now - this.lastJumpTap < 300) this.fire('fly');
          this.lastJumpTap = now; break;
        }
        default:
          if (e.code.startsWith('Digit')) { const n = parseInt(e.code.slice(5), 10); if (n >= 1 && n <= 9) this.fire(('slot' + (n - 1)) as Action); }
      }
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseBreak = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (this.usingTouch) return;
      if (!this.pointerLocked) return;
      if (e.button === 0) { this.mouseBreak = true; this.fire('attack'); }
      if (e.button === 2) this.fire('place');
      if (e.button === 1) this.fire('interact');
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouseBreak = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.lookX += e.movementX * 0.0022;
      this.lookY += e.movementY * 0.0022;
    });
    window.addEventListener('wheel', (e) => { if (this.pointerLocked) this.fire(e.deltaY > 0 ? 'next' : 'prev'); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.pointerLocked;
      this.pointerLocked = document.pointerLockElement === canvas;
      if (was && !this.pointerLocked && this.enabled && !this.usingTouch) this.onLockLost();
    });
    canvas.addEventListener('click', () => { if (this.enabled && !this.pointerLocked && !this.usingTouch) this.requestLock(); });
    window.addEventListener('touchstart', () => { this.usingTouch = true; }, { passive: true, capture: true });
  }

  requestLock() {
    if (this.usingTouch) return;
    try { this.canvas.requestPointerLock?.(); } catch { /* ignore */ }
  }
  releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  fire(a: Action) { if (this.enabled) this.actions.add(a); }
  consume(a: Action): boolean { const h = this.actions.has(a); this.actions.delete(a); return h; }
  clearActions() { this.actions.clear(); }

  addLook(dx: number, dy: number) { this.lookX += dx; this.lookY += dy; }
  takeLook(): [number, number] {
    const s = this.settings.sensitivity;
    const r: [number, number] = [this.lookX * s, this.lookY * s * (this.settings.invertY ? -1 : 1)];
    this.lookX = 0; this.lookY = 0;
    return r;
  }

  update(dt: number) {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    let jump = k.has('Space') || this.touchJump;
    let sneakHeld = k.has('ShiftLeft') || k.has('ShiftRight');
    let sprint = k.has('ControlLeft') || k.has('KeyR');
    let brk = this.mouseBreak || this.touchBreak;
    mx += this.touchMoveX; my += this.touchMoveY;

    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && Array.from(pads).find((p) => p && p.connected);
    if (gp) {
      const dz = this.settings.padDeadzone;
      const ax = (v: number) => (Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz));
      const lx = ax(gp.axes[0] || 0), ly = ax(gp.axes[1] || 0), rx = ax(gp.axes[2] || 0), ry = ax(gp.axes[3] || 0);
      if (lx || ly || rx || ry || gp.buttons.some((b) => b.pressed)) this.gamepadActive = true;
      mx += lx; my -= ly;
      const ps = this.settings.padSensitivity * 2.6 * dt;
      this.lookX += rx * Math.abs(rx) * ps / Math.max(0.01, this.settings.sensitivity);
      this.lookY += ry * Math.abs(ry) * ps / Math.max(0.01, this.settings.sensitivity);
      const b = (i: number) => !!gp.buttons[i]?.pressed;
      const edge = (i: number) => b(i) && !this.padPrev[i];
      if (b(0)) jump = true;
      if (b(1)) sneakHeld = true;
      if (b(10)) sprint = true;
      if (b(7)) brk = true;
      if (edge(7)) this.fire('attack');
      if (edge(6)) this.fire('place');
      if (edge(2)) this.fire('interact');
      if (edge(3)) this.fire('inventory');
      if (edge(4)) this.fire('prev');
      if (edge(5)) this.fire('next');
      if (edge(9)) this.fire('pause');
      if (edge(8)) this.fire('view');
      if (edge(12)) this.fire('fly');
      if (edge(13)) this.fire('drop');
      this.padPrev = gp.buttons.map((x) => x.pressed);
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.moveX = this.enabled ? mx : 0; this.moveY = this.enabled ? my : 0;
    this.jump = this.enabled && jump;
    this.sneak = this.enabled && (sneakHeld || this.touchSneak);
    this.sprint = this.enabled && (sprint || this.touchSprint || this.joySprint);
    this.breakHeld = this.enabled && brk;
  }
  touchSneak = false;
  onLockLost: () => void = () => {};
  touchSprint = false;
  joySprint = false;
}
