// On-screen touch controls: virtual flight stick, throttle lever, rudder/tiller strip, brake and
// quick-action buttons (gear, flaps, spoilers, camera, autopilot, lights, engines, map, pause).
import { Input } from './Input';

export interface TouchActions { [k: string]: () => void }

export class TouchControls {
  root: HTMLElement; private stick: HTMLElement; private knob: HTMLElement; private thr: HTMLElement; private thrKnob: HTMLElement; private rud: HTMLElement; private rudKnob: HTMLElement;
  throttle = 0;
  constructor(parent: HTMLElement, private input: Input, actions: TouchActions) {
    const r = this.root = document.createElement('div'); r.className = 'touch'; parent.appendChild(r);
    r.innerHTML = `
      <div class="t-stick"><div class="t-stick-ring"></div><div class="t-knob"></div><span class="t-lbl">PITCH / ROLL</span></div>
      <div class="t-thr"><div class="t-thr-track"><div class="t-thr-fill"></div></div><div class="t-thr-knob"><span>0%</span></div><span class="t-lbl">THR</span></div>
      <div class="t-rud"><div class="t-rud-knob"></div><span class="t-lbl">RUDDER / STEER</span></div>
      <div class="t-btns">
        <button data-a="brake" class="hold">BRAKE</button>
        <button data-a="gear">GEAR</button>
        <button data-a="flapsUp">FLAP −</button>
        <button data-a="flapsDown">FLAP +</button>
        <button data-a="spoilers">SPLR</button>
        <button data-a="reverse">REV</button>
      </div>
      <div class="t-top">
        <button data-a="camera">CAM</button>
        <button data-a="ap">AP</button>
        <button data-a="lights">LIGHTS</button>
        <button data-a="engines">ENG</button>
        <button data-a="parking">PARK</button>
        <button data-a="map">MAP</button>
        <button data-a="pause">❚❚</button>
      </div>`;
    this.stick = r.querySelector('.t-stick')!; this.knob = r.querySelector('.t-knob')!;
    this.thr = r.querySelector('.t-thr')!; this.thrKnob = r.querySelector('.t-thr-knob')!;
    this.rud = r.querySelector('.t-rud')!; this.rudKnob = r.querySelector('.t-rud-knob')!;
    input.touch.active = true;
    // stick
    const stickMove = (e: PointerEvent) => {
      const b = this.stick.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2; const R = b.width / 2;
      let dx = (e.clientX - cx) / R, dy = (e.clientY - cy) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      this.knob.style.transform = `translate(${dx * R * 0.7}px, ${dy * R * 0.7}px)`;
      input.touch.roll = dx; input.touch.pitch = dy;
    };
    this.drag(this.stick, stickMove, () => { this.knob.style.transform = ''; input.touch.roll = 0; input.touch.pitch = 0; });
    // throttle
    const thrMove = (e: PointerEvent) => {
      const b = this.thr.getBoundingClientRect(); const v = 1 - Math.min(1, Math.max(0, (e.clientY - b.top - 20) / (b.height - 40)));
      this.setThrottle(v); input.touch.throttle = v;
    };
    this.drag(this.thr, thrMove, () => { input.touch.throttle = null; });
    // rudder
    const rudMove = (e: PointerEvent) => {
      const b = this.rud.getBoundingClientRect(); const v = Math.min(1, Math.max(-1, ((e.clientX - b.left) / b.width) * 2 - 1));
      this.rudKnob.style.left = `${(v + 1) * 50}%`; input.touch.yaw = v;
    };
    this.drag(this.rud, rudMove, () => { this.rudKnob.style.left = '50%'; input.touch.yaw = 0; });
    // buttons
    r.querySelectorAll<HTMLButtonElement>('button').forEach(b => {
      const a = b.dataset.a!;
      if (b.classList.contains('hold')) {
        b.addEventListener('pointerdown', e => { e.preventDefault(); input.touch.brake = 1; b.classList.add('on'); });
        const off = () => { input.touch.brake = 0; b.classList.remove('on'); };
        b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
      } else b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); actions[a]?.(); b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 150); });
    });
  }
  private drag(el: HTMLElement, move: (e: PointerEvent) => void, end: () => void) {
    let id = -1;
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); id = e.pointerId; el.setPointerCapture(id); move(e); });
    el.addEventListener('pointermove', e => { if (e.pointerId === id) move(e); });
    const up = (e: PointerEvent) => { if (e.pointerId === id) { id = -1; end(); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  setThrottle(v: number) {
    this.throttle = v; const b = this.thr.getBoundingClientRect(); const h = b.height || 200;
    this.thrKnob.style.top = `${20 + (1 - v) * (h - 40) - 20}px`; this.thrKnob.querySelector('span')!.textContent = `${Math.round(v * 100)}%`;
    (this.root.querySelector('.t-thr-fill') as HTMLElement).style.height = `${v * 100}%`;
  }
  setState(k: string, on: boolean) { this.root.querySelector(`[data-a="${k}"]`)?.classList.toggle('on', on); }
  show(v: boolean) { this.root.style.display = v ? '' : 'none'; this.input.touch.active = v; }
  destroy() { this.root.remove(); this.input.touch.active = false; }
}
