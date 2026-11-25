// On-screen touch controls: floating joystick, look/tap/hold area, customizable buttons and a layout editor.
import type { Game } from '../core/Game';
import { DEFAULT_LAYOUT } from '../core/Settings';
import { ICON } from './Icons';
import { t } from './i18n';

interface BtnDef { id: string; icon: string; label?: string }
const BUTTONS: BtnDef[] = [
  { id: 'jump', icon: ICON.jump }, { id: 'sneak', icon: ICON.sneak }, { id: 'break', icon: ICON.break }, { id: 'place', icon: ICON.place },
  { id: 'interact', icon: '', label: 'USE' }, { id: 'sprint', icon: ICON.sprint }, { id: 'fly', icon: ICON.wing }, { id: 'drop', icon: ICON.drop }, { id: 'view', icon: ICON.eye },
];

export class Touch {
  layer: HTMLDivElement;
  private joy: HTMLDivElement;
  private knob: HTMLDivElement;
  private btns = new Map<string, HTMLDivElement>();
  private joyId: number | null = null;
  private joyC = { x: 0, y: 0 };
  private lookId: number | null = null;
  private look = { x: 0, y: 0, t: 0, moved: 0, breaking: false };
  private holdTimer: any = 0;
  private lastJump = 0;
  private dropTimer: any = 0;
  private aimClear: any = 0;
  editing = false;
  private editSel: string | null = null;
  private editBar: HTMLDivElement;
  private drag: { id: string; pid: number } | null = null;

  constructor(private game: Game, parent: HTMLElement) {
    const layer = document.createElement('div');
    layer.id = 'touch';
    this.layer = layer;
    parent.appendChild(layer);
    this.joy = document.createElement('div'); this.joy.className = 'joy idle';
    this.knob = document.createElement('div'); this.knob.className = 'knob';
    this.joy.appendChild(this.knob);
    layer.appendChild(this.joy);
    for (const b of BUTTONS) {
      const e = document.createElement('div');
      e.className = 'tbtn' + (b.id === 'interact' ? ' ctx' : '');
      e.dataset.id = b.id;
      e.innerHTML = b.icon || b.label || '';
      layer.appendChild(e);
      this.btns.set(b.id, e);
    }
    this.editBar = document.createElement('div');
    this.editBar.className = 'editbar';
    this.editBar.style.display = 'none';
    this.editBar.innerHTML = `<span class="small">Drag buttons to move</span><span class="small">Size</span><input type="range" min="0.5" max="2" step="0.05" id="edsz"><button class="btn" id="edreset">Reset</button><button class="btn go" id="eddone">Done</button>`;
    parent.appendChild(this.editBar);
    (this.editBar.querySelector('#edsz') as HTMLInputElement).oninput = (e) => {
      if (!this.editSel) return;
      this.game.settings.layout[this.editSel].s = parseFloat((e.target as HTMLInputElement).value);
      this.refresh();
    };
    (this.editBar.querySelector('#edreset') as HTMLButtonElement).onclick = () => { this.game.settings.layout = JSON.parse(JSON.stringify(DEFAULT_LAYOUT)); this.refresh(); };
    (this.editBar.querySelector('#eddone') as HTMLButtonElement).onclick = () => this.setEditing(false);

    layer.addEventListener('pointerdown', (e) => this.down(e));
    layer.addEventListener('pointermove', (e) => this.move(e));
    layer.addEventListener('pointerup', (e) => this.up(e));
    layer.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('resize', () => this.refresh());
    this.refresh();
  }

  onEditDone: () => void = () => {};

  setEditing(on: boolean) {
    this.editing = on;
    this.editBar.style.display = on ? 'flex' : 'none';
    this.editSel = null;
    if (!on) { this.game.applySettings(); this.onEditDone(); }
    this.refresh();
  }

  private pos(id: string) {
    const s = this.game.settings;
    const l = s.layout[id] || DEFAULT_LAYOUT[id];
    const x = s.leftHanded ? 1 - l.x : l.x;
    return { x: x * window.innerWidth, y: l.y * window.innerHeight, size: 64 * s.touchSize * l.s };
  }

  refresh() {
    const s = this.game.settings;
    this.layer.style.opacity = String(this.editing ? 1 : s.touchOpacity + 0.2);
    for (const [id, e] of this.btns) {
      const p = this.pos(id);
      e.style.left = p.x + 'px'; e.style.top = p.y + 'px';
      e.style.width = p.size * (id === 'interact' ? 1.35 : 1) + 'px'; e.style.height = p.size + 'px';
      e.style.margin = `${-p.size / 2}px 0 0 ${-p.size * (id === 'interact' ? 1.35 : 1) / 2}px`;
      e.classList.toggle('edit', this.editing);
      e.classList.toggle('sel', this.editing && this.editSel === id);
      if (this.editing) e.classList.remove('hidden');
    }
    if (this.joyId === null) {
      const jx = s.leftHanded ? window.innerWidth * 0.86 : window.innerWidth * 0.14;
      this.joy.style.left = jx + 'px'; this.joy.style.top = window.innerHeight * 0.72 + 'px';
    }
    const js = 132 * s.touchSize;
    this.joy.style.width = js + 'px'; this.joy.style.height = js + 'px';
  }

  /** Called each frame from the HUD to update dynamic buttons. */
  update() {
    const g = this.game;
    if (this.editing) return;
    const ctx = g.contextAction();
    const ib = this.btns.get('interact')!;
    ib.classList.toggle('hidden', !ctx);
    const label = ctx ? t(ctx).toUpperCase() : '';
    if (ctx && ib.textContent !== label) ib.textContent = label;
    this.btns.get('fly')!.classList.toggle('hidden', !g.player.creative);
    this.btns.get('fly')!.classList.toggle('on', g.player.flying);
    this.btns.get('sneak')!.classList.toggle('on', g.input.touchSneak);
    this.btns.get('sprint')!.classList.toggle('on', g.input.touchSprint);
  }

  private haptic(ms = 8) { if (this.game.settings.haptics) navigator.vibrate?.(ms); }

  private down(e: PointerEvent) {
    const g = this.game, inp = g.input;
    inp.usingTouch = true;
    g.audio.unlock();
    const btn = (e.target as HTMLElement).closest('.tbtn') as HTMLDivElement | null;
    try { this.layer.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (this.editing) {
      if (btn) { this.editSel = btn.dataset.id!; this.drag = { id: btn.dataset.id!, pid: e.pointerId }; (this.editBar.querySelector('#edsz') as HTMLInputElement).value = String(g.settings.layout[this.editSel].s); this.refresh(); }
      return;
    }
    if (g.state !== 'play') return;
    if (btn) {
      const id = btn.dataset.id!;
      btn.classList.add('down');
      (btn as any)._pid = e.pointerId;
      this.haptic();
      switch (id) {
        case 'jump': {
          inp.touchJump = true;
          const now = performance.now();
          if (now - this.lastJump < 300) inp.fire('fly');
          this.lastJump = now; break;
        }
        case 'sneak': if (g.settings.sneakToggle) inp.touchSneak = !inp.touchSneak; else inp.touchSneak = true; break;
        case 'break': inp.touchBreak = true; inp.fire('attack'); break;
        case 'place': inp.fire('place'); break;
        case 'interact': inp.fire('interact'); break;
        case 'sprint': inp.touchSprint = !inp.touchSprint; break;
        case 'fly': inp.fire('fly'); break;
        case 'view': inp.fire('view'); break;
        case 'drop': this.dropTimer = setTimeout(() => { inp.fire('dropStack'); this.dropTimer = -1; this.haptic(30); }, 500); break;
      }
      return;
    }
    const x = e.clientX, y = e.clientY, W = window.innerWidth;
    const left = g.settings.leftHanded ? x > W * 0.6 : x < W * 0.4;
    if (left && this.joyId === null && y > window.innerHeight * 0.25) {
      this.joyId = e.pointerId;
      this.joyC = { x, y };
      this.joy.classList.remove('idle');
      this.joy.style.left = x + 'px'; this.joy.style.top = y + 'px';
      this.knob.style.transform = '';
      return;
    }
    if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.look = { x, y, t: performance.now(), moved: 0, breaking: false };
      clearTimeout(this.aimClear);
      if (g.settings.aimMode === 'touch') inp.aim = this.ndc(x, y);
      if (g.settings.holdToBreak) {
        clearTimeout(this.holdTimer);
        this.holdTimer = setTimeout(() => {
          if (this.lookId !== null && this.look.moved < 16) { this.look.breaking = true; inp.touchBreak = true; inp.fire('attack'); this.haptic(12); }
        }, 280);
      }
    }
  }

  private ndc(x: number, y: number) { return { x: (x / window.innerWidth) * 2 - 1, y: -(y / window.innerHeight) * 2 + 1 }; }

  private move(e: PointerEvent) {
    const g = this.game, inp = g.input;
    if (this.editing && this.drag && this.drag.pid === e.pointerId) {
      const l = g.settings.layout[this.drag.id];
      let fx = e.clientX / window.innerWidth;
      if (g.settings.leftHanded) fx = 1 - fx;
      l.x = Math.max(0.03, Math.min(0.97, fx)); l.y = Math.max(0.05, Math.min(0.95, e.clientY / window.innerHeight));
      this.refresh();
      return;
    }
    if (e.pointerId === this.joyId) {
      const R = 55 * g.settings.touchSize;
      let dx = e.clientX - this.joyC.x, dy = e.clientY - this.joyC.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = dx / d * R; dy = dy / d * R; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      inp.touchMoveX = dx / R; inp.touchMoveY = -dy / R;
      const mag = Math.hypot(inp.touchMoveX, inp.touchMoveY);
      inp.joySprint = mag > 0.97 && inp.touchMoveY > 0.85;
      return;
    }
    if (e.pointerId === this.lookId) {
      const dx = e.clientX - this.look.x, dy = e.clientY - this.look.y;
      this.look.x = e.clientX; this.look.y = e.clientY;
      this.look.moved += Math.abs(dx) + Math.abs(dy);
      const k = 0.0058;
      inp.addLook(dx * k, dy * k);
      if (g.settings.aimMode === 'touch') inp.aim = this.ndc(e.clientX, e.clientY);
      if (!this.look.breaking && this.look.moved > 16) clearTimeout(this.holdTimer);
    }
  }

  private up(e: PointerEvent) {
    const g = this.game, inp = g.input;
    if (this.editing) { this.drag = null; return; }
    for (const [id, b] of this.btns) {
      if ((b as any)._pid !== e.pointerId) continue;
      (b as any)._pid = null;
      b.classList.remove('down');
      if (id === 'jump') inp.touchJump = false;
      if (id === 'break') inp.touchBreak = false;
      if (id === 'sneak' && !g.settings.sneakToggle) inp.touchSneak = false;
      if (id === 'drop') { if (this.dropTimer !== -1) { clearTimeout(this.dropTimer); inp.fire('drop'); } this.dropTimer = 0; }
      return;
    }
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      inp.touchMoveX = 0; inp.touchMoveY = 0; inp.joySprint = false;
      this.joy.classList.add('idle');
      this.knob.style.transform = '';
      this.refresh();
      return;
    }
    if (e.pointerId === this.lookId) {
      clearTimeout(this.holdTimer);
      const dur = performance.now() - this.look.t;
      if (this.look.breaking) inp.touchBreak = false;
      else if (dur < 280 && this.look.moved < 16 && g.state === 'play') {
        if (g.settings.tapToPlace) inp.fire('place'); else inp.fire('attack');
      }
      this.lookId = null;
      this.aimClear = setTimeout(() => { inp.aim = null; }, 160);
    }
  }

  releaseAll() {
    const inp = this.game.input;
    inp.touchMoveX = inp.touchMoveY = 0; inp.touchBreak = false; inp.touchJump = false;
    this.joyId = null; this.lookId = null;
    for (const b of this.btns.values()) b.classList.remove('down');
    this.refresh();
  }

  setVisible(v: boolean) { this.layer.style.display = v ? 'block' : 'none'; if (!v) this.releaseAll(); }
}
