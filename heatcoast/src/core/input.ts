export type Btn = 'fire' | 'aim' | 'sprint' | 'jump' | 'gas' | 'brake' | 'handbrake' | 'horn' | 'enter' | 'interact' | 'switch' | 'phone' | 'map' | 'pause' | 'wnext' | 'wprev' | 'reload' | 'camera' | 'skip' | 'crouch' | 'special' | 'lights';

/** Unified keyboard+mouse / gamepad / touch input. Touch UI writes into the same fields. */
export class Input {
  moveX = 0; moveY = 0; lookX = 0; lookY = 0;
  touchMove = { x: 0, y: 0 }; touchLook = { x: 0, y: 0 };
  held = new Set<Btn>(); private pressed = new Set<Btn>(); private touchHeld = new Set<Btn>();
  device: 'kbm' | 'pad' | 'touch' = 'kbm';
  sensitivity = 1; invertY = false;
  private keys = new Set<string>(); private mouseDX = 0; private mouseDY = 0; private mouseBtn = new Set<number>();
  pointerLocked = false; padConnected = false; private padPrev: boolean[] = [];
  wheel = 0;
  constructor(private canvas: HTMLElement) {
    addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.device = 'kbm';
      if (!this.keys.has(e.code)) this.onKeyPress(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseBtn.clear(); });
    canvas.addEventListener('mousedown', (e) => { this.device = 'kbm'; this.mouseBtn.add(e.button); if (!this.pointerLocked && matchMedia('(pointer:fine)').matches) canvas.requestPointerLock?.(); });
    addEventListener('mouseup', (e) => this.mouseBtn.delete(e.button));
    addEventListener('mousemove', (e) => { if (this.pointerLocked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; } });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('wheel', (e) => { if (this.pointerLocked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === canvas; });
    addEventListener('gamepadconnected', () => { this.padConnected = true; this.device = 'pad'; });
    addEventListener('gamepaddisconnected', () => { this.padConnected = false; });
  }
  private onKeyPress(code: string) {
    const map: Record<string, Btn> = { KeyF: 'enter', KeyE: 'interact', KeyQ: 'switch', ArrowUp: 'phone', KeyP: 'phone', KeyM: 'map', Escape: 'pause', KeyR: 'reload', KeyV: 'camera', Enter: 'skip', KeyX: 'special', KeyL: 'lights', Tab: 'wnext' };
    const b = map[code]; if (b) this.pressed.add(b);
  }
  press(b: Btn) { this.pressed.add(b); }
  touchDown(b: Btn) { this.touchHeld.add(b); this.pressed.add(b); this.device = 'touch'; }
  touchUp(b: Btn) { this.touchHeld.delete(b); }
  consume(b: Btn) { if (this.pressed.has(b)) { this.pressed.delete(b); return true; } return false; }
  peek(b: Btn) { return this.pressed.has(b); }
  isHeld(b: Btn) { return this.held.has(b); }

  poll() {
    const k = (c: string) => this.keys.has(c);
    this.held.clear();
    let mx = 0, my = 0, lx = 0, ly = 0;
    // keyboard / mouse
    mx += (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
    my += (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
    lx += this.mouseDX * 0.0024; ly += this.mouseDY * 0.0024; this.mouseDX = this.mouseDY = 0;
    if (this.mouseBtn.has(0)) this.held.add('fire');
    if (this.mouseBtn.has(2)) this.held.add('aim');
    if (k('ShiftLeft') || k('ShiftRight')) this.held.add('sprint');
    if (k('Space')) { this.held.add('jump'); this.held.add('handbrake'); }
    if (k('KeyW')) this.held.add('gas'); if (k('KeyS')) this.held.add('brake');
    if (k('KeyH')) this.held.add('horn'); if (k('KeyC') || k('ControlLeft')) this.held.add('crouch');
    if (this.wheel) { this.pressed.add(this.wheel > 0 ? 'wnext' : 'wprev'); this.wheel = 0; }
    for (let i = 1; i <= 7; i++) if (k('Digit' + i)) this.held.add(('w' + i) as any);
    // gamepad (standard mapping)
    const pads = navigator.getGamepads?.() ?? [];
    for (const p of pads) {
      if (!p || !p.connected) continue; this.padConnected = true;
      const dz = (v: number) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84);
      const ax = dz(p.axes[0] ?? 0), ay = dz(p.axes[1] ?? 0), rx = dz(p.axes[2] ?? 0), ry = dz(p.axes[3] ?? 0);
      if (ax || ay || rx || ry) this.device = 'pad';
      mx += ax; my += -ay; lx += rx * 0.05; ly += ry * 0.045;
      const b = (i: number) => !!p.buttons[i]?.pressed, bv = (i: number) => p.buttons[i]?.value ?? 0;
      const edge = (i: number, btn: Btn) => { if (b(i) && !this.padPrev[i]) { this.pressed.add(btn); this.device = 'pad'; } };
      if (bv(7) > 0.2) { this.held.add('fire'); this.held.add('gas'); }
      if (bv(6) > 0.2) { this.held.add('aim'); this.held.add('brake'); }
      if (b(0)) this.held.add('sprint'); if (b(2)) this.held.add('jump'); if (b(5)) this.held.add('handbrake'); if (b(10)) this.held.add('horn');
      edge(3, 'enter'); edge(1, 'interact'); edge(12, 'phone'); edge(13, 'switch'); edge(8, 'map'); edge(9, 'pause'); edge(4, 'wprev'); edge(15, 'wnext'); edge(14, 'reload'); edge(11, 'camera'); edge(0, 'skip'); edge(10, 'special');
      this.padPrev = p.buttons.map((x) => x.pressed);
      break;
    }
    // touch
    mx += this.touchMove.x; my += this.touchMove.y; lx += this.touchLook.x; ly += this.touchLook.y; this.touchLook.x = this.touchLook.y = 0;
    for (const t of this.touchHeld) this.held.add(t);
    const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    this.moveX = mx; this.moveY = my; this.lookX = lx * this.sensitivity; this.lookY = ly * this.sensitivity * (this.invertY ? -1 : 1);
  }
  endFrame() { this.pressed.clear(); }
  clearAll() { this.pressed.clear(); this.touchHeld.clear(); this.touchMove.x = this.touchMove.y = 0; }
}
