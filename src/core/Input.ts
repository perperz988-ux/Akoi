export type Action =
  | 'sprint' | 'jump' | 'attack' | 'aim' | 'enter' | 'interact' | 'crouch' | 'cover' | 'dodge'
  | 'reload' | 'weaponNext' | 'horn' | 'handbrake' | 'accelerate' | 'brake' | 'camera' | 'pause'
  | 'map' | 'phone' | 'ascend' | 'descend' | 'radio' | 'nitro' | 'lookBack' | 'skip';

const KEYMAP: Record<string, Action[]> = {
  ShiftLeft: ['sprint', 'nitro'], Space: ['jump', 'handbrake'], KeyF: ['enter'], KeyE: ['interact'],
  KeyC: ['crouch'], KeyQ: ['cover'], AltLeft: ['dodge'], KeyR: ['reload', 'radio'], Tab: ['weaponNext'],
  KeyH: ['horn'], KeyV: ['camera'], Escape: ['pause'], KeyM: ['map'], KeyP: ['phone'],
  KeyX: ['lookBack'], Enter: ['skip'], KeyZ: ['dodge'],
};

/**
 * Unified input layer: keyboard/mouse, touch (fed by TouchControls) and Gamepad API
 * all write into the same action/axis state so gameplay code never cares about the device.
 */
export class Input {
  moveX = 0; moveY = 0;          // left stick / WASD (-1..1), +Y = forward
  lookX = 0; lookY = 0;          // accumulated look delta this frame (pixels-ish)
  throttle = 0; brakeAxis = 0;   // analog triggers for driving
  private held = new Set<Action>();
  private pressedNow = new Set<Action>();
  private touchHeld = new Set<Action>();
  private keys = new Set<string>();
  touchMoveX = 0; touchMoveY = 0;
  private mouseDown = new Set<number>();
  pointerLocked = false;
  lastDevice: 'touch' | 'keyboard' | 'gamepad' = 'keyboard';
  sensitivity = 1;
  invertY = false;
  gamepadConnected = false;
  private prevPadButtons: boolean[] = [];

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
      for (const a of KEYMAP[e.code] ?? []) this.press(a);
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      for (const a of KEYMAP[e.code] ?? []) this.held.delete(a);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.held.clear(); this.mouseDown.clear(); });
    canvas.addEventListener('mousedown', (e) => {
      if (this.lastDevice === 'touch') return;
      this.mouseDown.add(e.button);
      if (e.button === 0) this.press('attack');
      if (e.button === 2) this.press('aim');
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseDown.delete(e.button);
      if (e.button === 0) this.held.delete('attack');
      if (e.button === 2) this.held.delete('aim');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('click', () => {
      if (this.lastDevice !== 'touch' && !this.pointerLocked && (canvas as any).requestPointerLock) {
        try { (canvas as any).requestPointerLock(); } catch { /* ignore */ }
      }
    });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === canvas; });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) { this.lookX += e.movementX; this.lookY += e.movementY; }
    });
    window.addEventListener('touchstart', () => { this.lastDevice = 'touch'; }, { passive: true });
    window.addEventListener('gamepadconnected', () => { this.gamepadConnected = true; this.lastDevice = 'gamepad'; });
    window.addEventListener('gamepaddisconnected', () => { this.gamepadConnected = false; });
  }

  private press(a: Action) {
    if (!this.held.has(a)) this.pressedNow.add(a);
    this.held.add(a);
  }

  /** Called by touch UI. */
  setTouchButton(a: Action, down: boolean) {
    this.lastDevice = 'touch';
    if (down) { if (!this.touchHeld.has(a)) this.pressedNow.add(a); this.touchHeld.add(a); }
    else this.touchHeld.delete(a);
  }
  addTouchLook(dx: number, dy: number) { this.lookX += dx; this.lookY += dy; }

  isHeld(a: Action) { return this.held.has(a) || this.touchHeld.has(a); }
  wasPressed(a: Action) { return this.pressedNow.has(a); }
  consume(a: Action) { const p = this.pressedNow.has(a); this.pressedNow.delete(a); return p; }

  /** Poll devices; call once at the beginning of each frame. */
  poll() {
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    let thr = this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0;
    let brk = this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0;
    if (this.keys.has('PageUp') || this.keys.has('KeyI')) this.held.add('ascend'); else if (!this.touchHeld.has('ascend')) this.held.delete('ascend');
    if (this.keys.has('PageDown') || this.keys.has('KeyK')) this.held.add('descend'); else if (!this.touchHeld.has('descend')) this.held.delete('descend');

    if (this.touchMoveX || this.touchMoveY) { mx = this.touchMoveX; my = this.touchMoveY; }
    if (this.touchHeld.has('accelerate')) thr = 1;
    if (this.touchHeld.has('brake')) brk = 1;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      const lx = dz(p.axes[0] ?? 0), ly = dz(p.axes[1] ?? 0), rx = dz(p.axes[2] ?? 0), ry = dz(p.axes[3] ?? 0);
      if (lx || ly) { mx = lx; my = -ly; this.lastDevice = 'gamepad'; }
      if (rx || ry) { this.lookX += rx * 14; this.lookY += ry * 14; this.lastDevice = 'gamepad'; }
      const b = (i: number) => !!p.buttons[i]?.pressed;
      const rt = p.buttons[7]?.value ?? 0, lt = p.buttons[6]?.value ?? 0;
      if (rt > 0.05) thr = Math.max(thr, rt);
      if (lt > 0.05) brk = Math.max(brk, lt);
      const map: [number, Action[]][] = [
        [0, ['jump', 'handbrake']], [1, ['dodge']], [2, ['attack']], [3, ['enter']], [4, ['weaponNext']],
        [5, ['cover', 'horn']], [6, ['aim']], [7, ['attack']], [8, ['map']], [9, ['pause']], [10, ['sprint', 'nitro']],
        [11, ['crouch']], [12, ['phone']], [13, ['interact']], [14, ['camera']], [15, ['radio']],
      ];
      for (const [i, acts] of map) {
        const now = b(i), was = this.prevPadButtons[i] ?? false;
        if (now && !was) for (const a of acts) { if (i === 7 || i === 6) continue; this.press(a); }
        if (!now && was) for (const a of acts) this.held.delete(a);
        this.prevPadButtons[i] = now;
      }
      if (lt > 0.4) this.held.add('aim'); else if (this.prevPadButtons[6] !== undefined && !this.mouseDown.has(2) && !this.touchHeld.has('aim')) this.held.delete('aim');
      if (rt > 0.4) { if (!this.held.has('attack')) this.pressedNow.add('attack'); this.held.add('attack'); }
      else if (!this.mouseDown.has(0) && !this.touchHeld.has('attack') && this.lastDevice === 'gamepad') this.held.delete('attack');
      break;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    this.moveX = mx; this.moveY = my;
    this.throttle = thr; this.brakeAxis = brk;
  }

  /** Clears per-frame state; call at end of each frame. */
  endFrame() {
    this.pressedNow.clear();
    this.lookX = 0; this.lookY = 0;
  }
}
