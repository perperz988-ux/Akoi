// Unified input: keyboard, mouse, gamepad, device tilt and on-screen touch controls.
export interface InputState {
  pitch: number; roll: number; yaw: number; throttleDelta: number; throttleAbs: number | null; brake: number; tiller: number;
}
type Handler = () => void;

export class Input {
  keys = new Set<string>();
  actions = new Map<string, Handler>();
  touch = { pitch: 0, roll: 0, yaw: 0, throttle: null as number | null, brake: 0, active: false };
  tilt = { enabled: false, pitch: 0, roll: 0, zeroB: 0, zeroG: 0, has: false };
  lookDrag: ((dx: number, dy: number) => void) | null = null;
  zoom: ((f: number) => void) | null = null;
  click: ((x: number, y: number) => void) | null = null;
  hover: ((x: number, y: number) => void) | null = null;
  invertPitch = false; sensitivity = 1;
  private padPrev: boolean[] = []; private kp = 0; private kr = 0; private ky = 0;
  enabled = true;
  constructor(private canvas: HTMLCanvasElement) {
    addEventListener('keydown', e => {
      if (!this.enabled || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys.has(k)) {
        const combo = (e.ctrlKey ? 'ctrl+' : '') + (e.shiftKey && k.length > 1 ? 'shift+' : '') + k;
        const h = this.actions.get(combo) ?? this.actions.get(k);
        if (h) { h(); e.preventDefault(); }
      }
      this.keys.add(k);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'PageUp', 'PageDown', 'Home', 'End'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; this.keys.delete(k); });
    addEventListener('blur', () => this.keys.clear());
    // pointer look / click on canvas
    let down: { x: number; y: number; id: number; moved: number } | null = null;
    const pts = new Map<number, { x: number; y: number }>(); let pinch = 0;
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) down = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 }; else down = null; });
    canvas.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId);
      if (!p) { this.hover?.(e.clientX, e.clientY); return; }
      if (pts.size === 2) {
        const arr = [...pts.values()]; const d0 = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
        p.x = e.clientX; p.y = e.clientY;
        const arr2 = [...pts.values()]; const d1 = Math.hypot(arr2[0].x - arr2[1].x, arr2[0].y - arr2[1].y);
        if (pinch && d0 > 0) this.zoom?.(d0 / Math.max(1, d1)); pinch = 1; return;
      }
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      this.lookDrag?.(dx, dy);
    });
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = 0; if (down && down.id === e.pointerId && down.moved < 8) this.click?.(e.clientX, e.clientY); if (down?.id === e.pointerId) down = null; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { this.zoom?.(e.deltaY > 0 ? 1.1 : 0.9); e.preventDefault(); }, { passive: false });
    addEventListener('deviceorientation', e => {
      if (e.beta == null || e.gamma == null) return; this.tilt.has = true;
      // landscape: gamma ~ pitch, beta ~ roll
      const land = (screen.orientation?.angle ?? 0);
      const b = e.beta, g = e.gamma;
      let roll = b, pitch = g;
      if (land === 90) { roll = b; pitch = -g; } else if (land === 270 || land === -90) { roll = -b; pitch = g; }
      this.tilt.roll = roll; this.tilt.pitch = pitch;
    });
  }
  calibrateTilt() { this.tilt.zeroB = this.tilt.roll; this.tilt.zeroG = this.tilt.pitch; }
  on(key: string, h: Handler) { this.actions.set(key, h); }
  down(k: string) { return this.keys.has(k); }

  read(dt: number): InputState {
    const k = (a: string) => this.keys.has(a);
    let pitch = 0, roll = 0, yaw = 0, thr = 0, brake = 0, tiller = 0; let thrAbs: number | null = null;
    if (k('ArrowUp') || k('w')) pitch -= 1; if (k('ArrowDown') || k('s')) pitch += 1;
    if (k('ArrowLeft') || k('a')) roll -= 1; if (k('ArrowRight') || k('d')) roll += 1;
    if (k('q') || k('z')) yaw -= 1; if (k('e') || k('x')) yaw += 1;
    // keyboard is digital: ramp it like a real control input
    const ramp = (cur: number, tgt: number, r: number) => cur + Math.max(-r * dt, Math.min(r * dt, tgt - cur));
    this.kp = ramp(this.kp, pitch, pitch === 0 ? 4 : 1.6); this.kr = ramp(this.kr, roll, roll === 0 ? 4 : 2.2); this.ky = ramp(this.ky, yaw, 3);
    pitch = this.kp; roll = this.kr; yaw = this.ky;
    if (k('Shift') || k('PageUp') || k('=') || k('+')) thr += 1; if (k('Control') || k('PageDown') || k('-')) thr -= 1;
    if (k('b') || k(' ')) brake = 1;
    if (k('F4') || k('End')) thrAbs = 1; if (k('F1') || k('Home')) thrAbs = 0;
    // gamepad
    const pads = navigator.getGamepads?.() ?? [];
    for (const gp of pads) {
      if (!gp) continue;
      const dz = (v: number) => (Math.abs(v) < 0.08 ? 0 : v);
      roll += dz(gp.axes[0] ?? 0); pitch += dz(gp.axes[1] ?? 0); yaw += dz(gp.axes[2] ?? 0);
      const rt = gp.buttons[7]?.value ?? 0, lt = gp.buttons[6]?.value ?? 0; thr += rt - lt;
      if (gp.buttons[0]?.pressed) brake = 1;
      const btnMap: [number, string][] = [[3, 'gear'], [5, 'flapsDown'], [4, 'flapsUp'], [1, 'camera'], [2, 'spoilers'], [9, 'pause']];
      for (const [b, act] of btnMap) { const p = !!gp.buttons[b]?.pressed; if (p && !this.padPrev[b]) this.actions.get('pad:' + act)?.(); this.padPrev[b] = p; }
      break;
    }
    // touch
    if (this.touch.active) { pitch += this.touch.pitch; roll += this.touch.roll; yaw += this.touch.yaw; brake = Math.max(brake, this.touch.brake); if (this.touch.throttle !== null) thrAbs = this.touch.throttle; }
    if (this.tilt.enabled && this.tilt.has) {
      const r = (this.tilt.roll - this.tilt.zeroB) / 30, p = (this.tilt.pitch - this.tilt.zeroG) / 25;
      roll += Math.max(-1, Math.min(1, r)); pitch += Math.max(-1, Math.min(1, p));
    }
    // response curve
    const curve = (v: number) => Math.sign(v) * Math.pow(Math.min(1, Math.abs(v)), 1.6) * this.sensitivity;
    pitch = curve(pitch) * (this.invertPitch ? -1 : 1); roll = curve(roll); yaw = Math.max(-1, Math.min(1, yaw));
    tiller = yaw;
    return { pitch: Math.max(-1, Math.min(1, pitch)), roll: Math.max(-1, Math.min(1, roll)), yaw, throttleDelta: thr, throttleAbs: thrAbs, brake, tiller };
  }
}
