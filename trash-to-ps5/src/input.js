// Keyboard + mouse + touch input with per-frame edge detection.
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyE: 'act', Enter: 'act', Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyP: 'phone', Tab: 'phone', KeyI: 'inv',
  KeyM: 'map', Escape: 'back', KeyF: 'light', KeyQ: 'scan', KeyC: 'cam', Digit1: 'n1', Digit2: 'n2', Digit3: 'n3', Digit4: 'n4', Digit5: 'n5',
};
export class Input {
  constructor(canvas) {
    this.down = new Set(); this.edge = new Set(); this.look = { x: 0, y: 0 }; this.move = { x: 0, y: 0 };
    this.joy = null; this.lookTouch = null; this.touchMode = matchMedia('(pointer: coarse)').matches; this.sens = 1;
    this.blocked = false; this.wheel = 0;
    addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code]; if (!a) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.down.has(a)) this.edge.add(a); this.down.add(a);
    });
    addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) this.down.delete(a); });
    addEventListener('blur', () => this.down.clear());
    // mouse look: drag on canvas, or pointer lock
    let drag = false, lx = 0, ly = 0;
    canvas.addEventListener('mousedown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; });
    addEventListener('mouseup', () => (drag = false));
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) { this.look.x += e.movementX * this.sens; this.look.y += e.movementY * this.sens; return; }
      if (!drag) return; this.look.x += (e.clientX - lx) * this.sens; this.look.y += (e.clientY - ly) * this.sens; lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    // touch: left half = joystick, right half = look
    canvas.addEventListener('touchstart', (e) => {
      this.touchMode = true;
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && !this.joy) { this.joy = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY }; this.onJoy && this.onJoy(this.joy); }
        else if (!this.lookTouch) this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.joy && t.identifier === this.joy.id) { this.joy.x = t.clientX; this.joy.y = t.clientY; this.onJoy && this.onJoy(this.joy); }
        if (this.lookTouch && t.identifier === this.lookTouch.id) { this.look.x += (t.clientX - this.lookTouch.x) * 1.4 * this.sens; this.look.y += (t.clientY - this.lookTouch.y) * 1.4 * this.sens; this.lookTouch.x = t.clientX; this.lookTouch.y = t.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.joy && t.identifier === this.joy.id) { this.joy = null; this.onJoy && this.onJoy(null); }
        if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
      }
    };
    canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
  }
  // virtual buttons
  press(a) { if (!this.down.has(a)) this.edge.add(a); this.down.add(a); }
  release(a) { this.down.delete(a); }
  tap(a) { this.edge.add(a); }
  bindButton(el, a, hold = false) {
    const on = (e) => { e.preventDefault(); e.stopPropagation(); this.press(a); el.classList.add('on'); };
    const off = (e) => { e && e.preventDefault(); this.release(a); el.classList.remove('on'); };
    el.addEventListener('touchstart', on, { passive: false }); el.addEventListener('touchend', off); el.addEventListener('touchcancel', off);
    el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', () => { if (this.down.has(a) && hold) off(); });
  }
  is(a) { return this.down.has(a); }
  hit(a) { return this.edge.has(a); }
  consume(a) { const h = this.edge.has(a); this.edge.delete(a); return h; }
  update() {
    let x = 0, y = 0;
    if (this.down.has('left')) x -= 1; if (this.down.has('right')) x += 1; if (this.down.has('up')) y += 1; if (this.down.has('down')) y -= 1;
    if (this.joy) { const dx = this.joy.x - this.joy.ox, dy = this.joy.y - this.joy.oy, m = 55; x = Math.max(-1, Math.min(1, dx / m)); y = Math.max(-1, Math.min(1, -dy / m)); }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    this.move.x = x; this.move.y = y;
  }
  endFrame() { this.edge.clear(); this.look.x = 0; this.look.y = 0; this.wheel = 0; }
}
