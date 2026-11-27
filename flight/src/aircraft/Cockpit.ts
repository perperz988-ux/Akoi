// Interactive 3D cockpits with live glass displays (PFD/ND/EICAS-ECAM) or GA steam gauges,
// clickable switches, levers and knobs. Display canvases are redrawn at ~15 Hz.
import * as THREE from 'three';
import { AircraftSpec } from '../data/aircraft';
import { FlightModel } from '../sim/FlightModel';
import { Autopilot } from '../sim/Autopilot';
import { FT, KT, NM, DEG, origin, haversine, bearing, wrap180, clamp } from '../core/geo';

export interface CockpitAction { id: string; label: string }
export interface Clickable { mesh: THREE.Mesh; action: string; label: string }
export interface SysState {
  lights: { nav: boolean; beacon: boolean; strobe: boolean; landing: boolean; taxi: boolean; logo: boolean; panel: boolean };
  battery: boolean; apu: boolean; apuN: number; seatbelt: boolean; doorOpen: boolean; fuelPumps: boolean;
}

type Ctx = CanvasRenderingContext2D;
const CYAN = '#32d7ff', GRN = '#3dff7a', MAG = '#ff4fd8', AMB = '#ffb000', WHT = '#f2f2f2', RED = '#ff3030';

export class Cockpit {
  group = new THREE.Group();
  clickables: Clickable[] = [];
  private screens: { tex: THREE.CanvasTexture; ctx: Ctx; kind: string; w: number; h: number }[] = [];
  private t = 0; private yokes: THREE.Object3D[] = []; private throttles: THREE.Object3D[] = []; private flapLever: THREE.Object3D | null = null; private gearLever: THREE.Object3D | null = null; private spdBrake: THREE.Object3D | null = null;
  private panelLight: THREE.PointLight; private floodMat: THREE.MeshStandardMaterial;
  private switchMeshes = new Map<string, THREE.Mesh>();
  private ga: boolean; private airbus: boolean;
  constructor(private spec: AircraftSpec, eye: THREE.Vector3) {
    this.ga = spec.cockpit === 'ga'; this.airbus = spec.cockpit === 'airbus';
    const g = this.group;
    const shell = new THREE.MeshStandardMaterial({ color: this.ga ? 0x4a4744 : this.airbus ? 0x6f7b86 : 0x5d636a, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide });
    this.floodMat = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.7, metalness: 0.2 });
    const panelMat = new THREE.MeshStandardMaterial({ color: this.ga ? 0x1f1f20 : 0x3a4048, roughness: 0.8 });
    // coordinate frame: eye at origin offset; panel ~0.75 m ahead of the captain
    const W = this.ga ? 1.15 : 1.9; const cx = -eye.x; // panel centre x relative to eye (aircraft centreline)
    const pz = -0.78, py = this.ga ? -0.44 : -0.32;
    // main instrument panel
    const panel = new THREE.Mesh(new THREE.BoxGeometry(W, 0.42, 0.06), panelMat); panel.position.set(cx, py, pz); panel.rotation.x = -0.18; g.add(panel);
    // glareshield
    const gs = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 0.08, 0.32), this.floodMat); gs.position.set(cx, py + 0.24, pz + 0.08); g.add(gs);
    // pedestal
    if (!this.ga) { const ped = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.25, 0.75), panelMat); ped.position.set(cx, py - 0.32, pz + 0.38); ped.rotation.x = 0.35; g.add(ped); }
    // side walls / floor / ceiling with window frames (pillars)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 2.2).rotateX(-Math.PI / 2), shell); floor.position.set(cx, -0.95, 0.1); g.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 1.6).rotateX(Math.PI / 2), shell); ceil.position.set(cx, 0.55, 0.15); g.add(ceil);
    for (const s of [-1, 1]) { const wall = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.75), shell); wall.rotation.y = s * Math.PI / 2; wall.position.set(cx + s * (W / 2 + 0.28), -0.6, 0.2); g.add(wall); }
    // window frame pillars
    const frame = this.floodMat;
    const addBar = (x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), frame); b.position.set(x, y, z); b.rotation.set(rx, ry, rz); g.add(b); return b; };
    if (this.ga) {
      addBar(cx, 0.42, -0.45, W, 0.06, 0.5, 0.3);          // top frame
      for (const s of [-1, 1]) addBar(cx + s * W * 0.47, 0.05, -0.62, 0.035, 0.75, 0.035, 0.35, 0, -s * 0.15); // A-pillars
      addBar(cx, 0.02, -0.68, 0.03, 0.6, 0.03, 0.4);        // centre strip
      for (const s of [-1, 1]) addBar(cx + s * (W / 2 + 0.25), 0.1, 0.0, 0.04, 0.9, 0.04, 0, 0, 0); // door frames
      // overhead wing root
      addBar(cx, 0.55, 0.2, W + 0.6, 0.05, 0.9);
    } else {
      addBar(cx, 0.4, -0.62, W, 0.08, 0.15, 0.4); // brow
      const nP = this.spec.cockpit === 'boeing787' ? 1 : 1;
      for (const x of [-W * 0.02, W * 0.02]) addBar(cx + x, 0.12, -0.74, 0.04, 0.45, 0.04, 0.45); // centre post
      for (const s of [-1, 1]) {
        addBar(cx + s * W * 0.27, 0.13, -0.7, 0.045, 0.47, 0.04, 0.45, 0, -s * 0.1);
        addBar(cx + s * W * 0.47, 0.13, -0.55, 0.05, 0.5, 0.05, 0.35, s * 0.5, -s * 0.2);
        addBar(cx + s * (W / 2 + 0.22), 0.13, -0.2, 0.08, 0.45, 0.08, 0.1, s * 0.9, 0);
      }
      void nP;
      // overhead panel
      const ov = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.04, 0.9), panelMat); ov.position.set(cx, 0.5, -0.1); ov.rotation.x = 0.35; g.add(ov);
    }
    // displays
    if (this.ga) {
      this.screen('ga6', 1024, 512, 0.9, 0.42, new THREE.Vector3(0, py + 0.02, pz + 0.035), -0.18);
    } else {
      // captain PFD + ND, centre EICAS/ECAM, FO PFD/ND
      const sW = this.spec.cockpit === 'boeing787' ? 0.38 : 0.2, sH = this.spec.cockpit === 'boeing787' ? 0.26 : 0.2;
      if (this.spec.cockpit === 'boeing787' || this.spec.cockpit === 'bizjet') {
        this.screen('pfd', 512, 512, sW * 0.58, sH, new THREE.Vector3(-0.12, py + 0.02, pz + 0.035), -0.18);
        this.screen('nd', 512, 512, sW * 0.58, sH, new THREE.Vector3(0.12, py + 0.02, pz + 0.035), -0.18);
        this.screen('eicas', 512, 512, sW * 0.62, sH, new THREE.Vector3(cx, py + 0.02, pz + 0.035), -0.18);
        this.screen('pfd', 512, 512, sW * 0.58, sH, new THREE.Vector3(2 * cx + 0.12, py + 0.02, pz + 0.035), -0.18);
        this.screen('nd', 512, 512, sW * 0.58, sH, new THREE.Vector3(2 * cx - 0.12, py + 0.02, pz + 0.035), -0.18);
      } else {
        this.screen('pfd', 512, 512, sW, sH, new THREE.Vector3(-0.15, py + 0.02, pz + 0.035), -0.18);
        this.screen('nd', 512, 512, sW, sH, new THREE.Vector3(0.08, py + 0.02, pz + 0.035), -0.18);
        this.screen('eicas', 512, 512, sW, sH, new THREE.Vector3(cx, py + 0.06, pz + 0.035), -0.18);
        this.screen('pfd', 512, 512, sW, sH, new THREE.Vector3(2 * cx + 0.15, py + 0.02, pz + 0.035), -0.18);
        this.screen('nd', 512, 512, sW, sH, new THREE.Vector3(2 * cx - 0.08, py + 0.02, pz + 0.035), -0.18);
      }
      // MCP / FCU on glareshield
      this.screen('mcp', 1024, 128, 0.9, 0.075, new THREE.Vector3(cx, py + 0.24, pz + 0.245), -0.12);
    }
    // ---- controls ----
    const ctlMat = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.5, metalness: 0.3 });
    const yokeAt = (x: number) => {
      const y = new THREE.Group(); y.position.set(x, py - 0.18, pz + 0.35); g.add(y);
      if (this.airbus) {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.18, 10), ctlMat); st.position.y = 0.09; y.add(st);
        const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.08, 4, 8), ctlMat); grip.position.y = 0.2; y.add(grip);
        y.position.set(x + (x < cx ? -0.45 : 0.45), py - 0.25, pz + 0.55);
      } else {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 0.05), ctlMat); col.position.y = -0.1; y.add(col);
        const hub = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.05), ctlMat); hub.position.y = 0.08; y.add(hub);
        for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.13, 0.04), ctlMat); h.position.set(s * 0.13, 0.1, 0); h.rotation.z = s * 0.25; y.add(h); const a = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.035), ctlMat); a.position.set(s * 0.07, 0.07, 0); y.add(a); }
      }
      this.yokes.push(y);
    };
    yokeAt(0); if (!this.ga) yokeAt(2 * cx); else yokeAt(2 * cx);
    // throttle levers
    const nT = this.spec.engines.count;
    for (let i = 0; i < nT; i++) {
      const tl = new THREE.Group(); tl.position.set(this.ga ? cx : cx + (i - (nT - 1) / 2) * 0.06, this.ga ? py - 0.12 : py - 0.2, this.ga ? pz + 0.1 : pz + 0.32); g.add(tl);
      const h = new THREE.Mesh(this.ga ? new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6).rotateX(Math.PI / 2) : new THREE.BoxGeometry(0.02, 0.16, 0.02), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.3 }));
      if (!this.ga) h.position.y = 0.08; else h.position.z = 0.08;
      tl.add(h);
      const knob = new THREE.Mesh(this.ga ? new THREE.SphereGeometry(0.022, 10, 8) : new THREE.BoxGeometry(0.05, 0.03, 0.04), new THREE.MeshStandardMaterial({ color: this.ga ? 0x111111 : 0x222222 }));
      if (!this.ga) knob.position.y = 0.17; else knob.position.z = 0.16;
      tl.add(knob); this.throttles.push(tl);
      this.click(knob, 'thr+', 'Throttle (tap = +10%)');
    }
    // flap lever / switch, gear lever, speedbrake
    {
      const fl = new THREE.Group(); fl.position.set(this.ga ? cx + 0.2 : cx + 0.16, this.ga ? py - 0.08 : py - 0.2, this.ga ? pz + 0.06 : pz + 0.38); g.add(fl);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0xdddddd })); h.position.y = 0.05; fl.add(h);
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.035), new THREE.MeshStandardMaterial({ color: 0xeeeeee })); k.position.y = 0.11; fl.add(k);
      this.flapLever = fl; this.click(k, 'flaps+', 'Flaps (extend)'); this.click(h, 'flaps-', 'Flaps (retract)');
    }
    if (!this.spec.gear.fixed) {
      const gl = new THREE.Group(); gl.position.set(cx + 0.28, py + 0.0, pz + 0.04); g.add(gl);
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8 })); h.position.z = 0.045; gl.add(h);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.016, 12).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xeeeeee })); wheel.position.z = 0.09; gl.add(wheel);
      this.gearLever = gl; this.click(wheel, 'gear', 'Landing gear lever');
    }
    if (!this.ga) {
      const sb = new THREE.Group(); sb.position.set(cx - 0.16, py - 0.2, pz + 0.36); g.add(sb);
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: 0x333333 })); k.position.y = 0.06; sb.add(k);
      this.spdBrake = sb; this.click(k, 'spoilers', 'Speed brake');
    }
    // switch panel (overhead for jets, lower panel for GA)
    const sw: [string, string][] = this.ga
      ? [['battery', 'MASTER'], ['fuelPumps', 'FUEL PUMP'], ['beacon', 'BCN'], ['landing', 'LAND'], ['taxi', 'TAXI'], ['nav', 'NAV'], ['strobe', 'STROBE'], ['eng0', 'MAG/START'], ['panel', 'PANEL LT']]
      : [['battery', 'BAT'], ['apu', 'APU'], ['fuelPumps', 'FUEL PUMPS'], ...Array.from({ length: nT }, (_, i) => [`eng${i}`, `ENG ${i + 1}`] as [string, string]), ['beacon', 'BEACON'], ['nav', 'NAV'], ['strobe', 'STROBE'], ['landing', 'LAND'], ['taxi', 'TAXI'], ['logo', 'LOGO'], ['seatbelt', 'SEATBELT'], ['panel', 'PANEL LT'], ['door', 'DOOR']];
    sw.forEach(([id, label], i) => {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.012), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(0x000000), emissiveIntensity: 1 }));
      if (this.ga) { plate.position.set(cx - W * 0.42 + i * 0.07, py - 0.21, pz + 0.07); plate.rotation.x = -0.18; }
      else { const col = i % 6, row = Math.floor(i / 6); plate.position.set(cx - 0.17 + col * 0.068, 0.47 - row * 0.03, -0.42 + row * 0.08); plate.rotation.x = -Math.PI / 2 + 0.35; }
      g.add(plate); this.click(plate, 'sw:' + id, label); this.switchMeshes.set(id, plate);
      // label decal
      const lt = labelTex(label); const lm = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.012), new THREE.MeshBasicMaterial({ map: lt, transparent: true }));
      lm.position.copy(plate.position); lm.quaternion.copy(plate.quaternion); lm.translateY(0.026); lm.translateZ(0.007); g.add(lm);
    });
    // MCP knobs as clickables on glareshield
    if (!this.ga) {
      const knobs: [string, string, number][] = [['ap', 'AP', 0.32], ['athr', 'A/THR', 0.24], ['hdg-', 'HDG -', -0.32], ['hdg+', 'HDG +', -0.26], ['alt-', 'ALT -', 0.04], ['alt+', 'ALT +', 0.1], ['spd-', 'SPD -', -0.42], ['spd+', 'SPD +', -0.36], ['lnav', 'LNAV', -0.18], ['app', 'APPR', 0.18], ['vs-', 'V/S -', -0.05], ['vs+', 'V/S +', -0.11]];
      for (const [id, label, x] of knobs) {
        const k = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.6, roughness: 0.4 }));
        k.position.set(cx + x, py + 0.2, pz + 0.25); k.rotation.x = 0; g.add(k); this.click(k, 'ap:' + id, label);
      }
    } else {
      const knobs: [string, string, number][] = [['ap', 'AP', 0.32], ['hdg-', 'HDG -', 0.2], ['hdg+', 'HDG +', 0.25], ['alt-', 'ALT -', 0.38], ['alt+', 'ALT +', 0.43], ['lnav', 'NAV', 0.14]];
      for (const [id, label, x] of knobs) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x222222 })); k.position.set(cx - W * 0.45 + x * 0.9, py - 0.15, pz + 0.05); g.add(k); this.click(k, 'ap:' + id, label); }
    }
    // seats
    const seatMat = new THREE.MeshStandardMaterial({ color: this.ga ? 0x6b5b4b : 0x30353b, roughness: 0.9 });
    for (const x of [0, 2 * cx]) { const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.12), seatMat); back.position.set(x, -0.5, 0.32); back.rotation.x = -0.15; g.add(back); }
    this.panelLight = new THREE.PointLight(0xffd9a8, 0, 2.5, 2); this.panelLight.position.set(cx, 0.35, -0.3); g.add(this.panelLight);
    g.position.copy(eye);
  }

  private click(mesh: THREE.Mesh, action: string, label: string) { this.clickables.push({ mesh, action, label }); }

  private screen(kind: string, w: number, h: number, mw: number, mh: number, pos: THREE.Vector3, rx: number) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d')!;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.copy(pos); m.rotation.x = rx; this.group.add(m);
    this.screens.push({ tex, ctx, kind, w, h });
    if (kind === 'nd') this.click(m, 'nd-range', 'ND range');
  }

  update(dt: number, fm: FlightModel, ap: Autopilot, sys: SysState, night: number, visible: boolean) {
    this.t += dt;
    // control animation
    for (const y of this.yokes) {
      if (this.airbus) { y.rotation.x = fm.ctl.pitch * 0.35; y.rotation.z = -fm.ctl.roll * 0.35; }
      else { y.position.z = (y as any).z0 ??= y.position.z; y.position.z = (y as any).z0 + fm.ctl.pitch * 0.08; y.rotation.z = -fm.ctl.roll * 0.9; }
    }
    this.throttles.forEach((t, i) => { const v = fm.apThrottle ?? fm.ctl.throttle[i]; if (this.ga) t.position.z = ((t as any).z0 ??= t.position.z) - v * 0.07; else t.rotation.x = -0.6 + v * 1.0 - (v < 0 ? 0.3 : 0); });
    if (this.flapLever) this.flapLever.rotation.x = -0.4 + fm.ctl.flapIdx / Math.max(1, fm.flapCount - 1) * 0.9;
    if (this.gearLever) this.gearLever.rotation.x = fm.ctl.gearDown ? 0.5 : -0.5;
    if (this.spdBrake) this.spdBrake.rotation.x = -0.3 + fm.ctl.spoilers * 0.8 + (fm.ctl.spoilerArmed ? 0.1 : 0);
    // switch lamps
    const on = (id: string) => id === 'battery' ? sys.battery : id === 'apu' ? sys.apu : id === 'fuelPumps' ? sys.fuelPumps : id === 'seatbelt' ? sys.seatbelt : id === 'door' ? sys.doorOpen : id.startsWith('eng') ? (fm.eng[+id.slice(3)]?.running || fm.eng[+id.slice(3)]?.starting) : (sys.lights as any)[id];
    for (const [id, m] of this.switchMeshes) { const mat = m.material as THREE.MeshStandardMaterial; const v = on(id); mat.emissive.set(v ? (id.startsWith('eng') && fm.eng[+id.slice(3)]?.starting ? 0xffb000 : 0x22dd66) : 0x220000); mat.emissiveIntensity = v ? 0.9 : 0.4; }
    this.panelLight.intensity = sys.lights.panel ? 1.5 : night * 0.15;
    this.group.visible = visible;
    if (!visible || !sys.battery) { if (!sys.battery) for (const s of this.screens) { s.ctx.fillStyle = '#050607'; s.ctx.fillRect(0, 0, s.w, s.h); s.tex.needsUpdate = true; } return; }
    if (((this as any).acc = ((this as any).acc ?? 0) + dt) < 1 / 15) return; (this as any).acc = 0;
    for (const s of this.screens) {
      const c = s.ctx; c.save();
      c.fillStyle = '#05080b'; c.fillRect(0, 0, s.w, s.h);
      if (s.kind === 'pfd') drawPFD(c, s.w, s.h, fm, ap);
      else if (s.kind === 'nd') drawND(c, s.w, s.h, fm, ap, (this as any).ndRange ?? 40);
      else if (s.kind === 'eicas') drawEICAS(c, s.w, s.h, fm, this.airbus);
      else if (s.kind === 'mcp') drawMCP(c, s.w, s.h, ap, this.airbus);
      else if (s.kind === 'ga6') drawSixPack(c, s.w, s.h, fm, ap);
      c.restore(); s.tex.needsUpdate = true;
    }
  }
  cycleNdRange() { const r = [10, 20, 40, 80, 160, 320]; const cur = (this as any).ndRange ?? 40; (this as any).ndRange = r[(r.indexOf(cur) + 1) % r.length]; }
  dispose() { this.group.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose?.(); }); for (const s of this.screens) s.tex.dispose(); }
}

function labelTex(text: string) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 28; const g = c.getContext('2d')!;
  g.fillStyle = '#e8e8e8'; g.font = 'bold 18px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 64, 15);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------- display drawing ----------------
export function drawPFD(c: Ctx, w: number, h: number, fm: FlightModel, ap: Autopilot) {
  const st = fm.st; const s = fm.spec;
  const cx = w * 0.5, cy = h * 0.47, R = w * 0.3;
  // attitude
  c.save(); c.beginPath(); c.rect(cx - R, cy - R, 2 * R, 2 * R); c.clip();
  c.translate(cx, cy); c.rotate(-st.bank * DEG);
  const ppd = R / 25; const off = st.pitch * ppd;
  c.fillStyle = '#1f7ad1'; c.fillRect(-R * 3, -R * 3 + off, R * 6, R * 3);
  c.fillStyle = '#7a4a1e'; c.fillRect(-R * 3, off, R * 6, R * 3);
  c.strokeStyle = WHT; c.lineWidth = 2; c.beginPath(); c.moveTo(-R * 3, off); c.lineTo(R * 3, off); c.stroke();
  c.fillStyle = WHT; c.font = `${Math.round(w * 0.028)}px monospace`; c.textAlign = 'center';
  for (let p = -30; p <= 30; p += 2.5) { if (p === 0) continue; const y = off - p * ppd; const L = p % 10 === 0 ? R * 0.35 : p % 5 === 0 ? R * 0.2 : R * 0.08; c.beginPath(); c.moveTo(-L, y); c.lineTo(L, y); c.stroke(); if (p % 10 === 0) { c.fillText(String(Math.abs(p)), -L - 16, y + 5); c.fillText(String(Math.abs(p)), L + 16, y + 5); } }
  c.restore();
  // bank scale
  c.strokeStyle = WHT; c.lineWidth = 2;
  c.beginPath(); c.arc(cx, cy, R * 0.92, -Math.PI / 2 - 1.05, -Math.PI / 2 + 1.05); c.stroke();
  for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) { const r = a * DEG - Math.PI / 2; const l = Math.abs(a) % 30 === 0 ? 14 : 8; c.beginPath(); c.moveTo(cx + Math.cos(r) * R * 0.92, cy + Math.sin(r) * R * 0.92); c.lineTo(cx + Math.cos(r) * (R * 0.92 - l), cy + Math.sin(r) * (R * 0.92 - l)); c.stroke(); }
  c.save(); c.translate(cx, cy); c.rotate(-st.bank * DEG); c.fillStyle = WHT; c.beginPath(); c.moveTo(0, -R * 0.9); c.lineTo(-8, -R * 0.9 + 14); c.lineTo(8, -R * 0.9 + 14); c.fill(); c.restore();
  // aircraft symbol
  c.strokeStyle = '#ffd400'; c.lineWidth = 5; c.beginPath(); c.moveTo(cx - R * 0.55, cy); c.lineTo(cx - R * 0.2, cy); c.lineTo(cx - R * 0.2, cy + 10); c.moveTo(cx + R * 0.55, cy); c.lineTo(cx + R * 0.2, cy); c.lineTo(cx + R * 0.2, cy + 10); c.stroke();
  c.fillStyle = '#ffd400'; c.fillRect(cx - 4, cy - 4, 8, 8);
  // flight path vector
  const gamma = Math.asin(clamp(st.vs / Math.max(1, st.tas), -1, 1)) / DEG; const drift = wrap180(st.track - st.heading);
  const fx = cx + clamp(drift, -20, 20) * ppd, fy = cy - (gamma - st.pitch) * ppd;
  c.strokeStyle = GRN; c.lineWidth = 2; c.beginPath(); c.arc(fx, fy, 7, 0, Math.PI * 2); c.moveTo(fx - 18, fy); c.lineTo(fx - 7, fy); c.moveTo(fx + 7, fy); c.lineTo(fx + 18, fy); c.moveTo(fx, fy - 7); c.lineTo(fx, fy - 14); c.stroke();
  // speed tape
  const tapeW = w * 0.13, tx = w * 0.04; const ias = st.ias / KT; const kpp = (h * 0.6) / 80;
  c.fillStyle = 'rgba(60,65,75,0.9)'; c.fillRect(tx, cy - h * 0.3, tapeW, h * 0.6);
  c.save(); c.beginPath(); c.rect(tx, cy - h * 0.3, tapeW, h * 0.6); c.clip();
  c.strokeStyle = WHT; c.fillStyle = WHT; c.font = `${Math.round(w * 0.032)}px monospace`; c.textAlign = 'right';
  for (let v = Math.floor((ias - 45) / 10) * 10; v < ias + 45; v += 10) { if (v < 30) continue; const y = cy - (v - ias) * kpp; c.beginPath(); c.moveTo(tx + tapeW - 10, y); c.lineTo(tx + tapeW, y); c.stroke(); if (v % 20 === 0) c.fillText(String(v), tx + tapeW - 14, y + 6); }
  // stall/overspeed bands
  const vs = Math.sqrt((2 * fm.mass * 9.81) / (1.225 * s.wingArea * (s.clMaxClean + (s.clMaxFull - s.clMaxClean) * fm.flap))) / KT;
  c.fillStyle = RED; for (let v = 0; v < vs; v += 4) { const y = cy - (v - ias) * kpp; c.fillRect(tx + tapeW - 6, y - 4, 6, 4 * kpp * 0.9); }
  c.fillStyle = AMB; c.fillRect(tx + tapeW - 6, cy - (vs * 1.13 - ias) * kpp - 1, 6, (vs * 0.13) * kpp);
  const vmo = s.vmo; c.fillStyle = RED; c.fillRect(tx + tapeW - 6, cy - (vmo + 60 - ias) * kpp, 6, 60 * kpp);
  if (ap.athr || ap.engaged) { const y = cy - (ap.spdKt - ias) * kpp; c.fillStyle = MAG; c.beginPath(); c.moveTo(tx + tapeW, y); c.lineTo(tx + tapeW + 10, y - 8); c.lineTo(tx + tapeW + 10, y + 8); c.fill(); }
  c.restore();
  c.fillStyle = '#000'; c.strokeStyle = WHT; c.lineWidth = 2; c.fillRect(tx, cy - 18, tapeW, 36); c.strokeRect(tx, cy - 18, tapeW, 36);
  c.fillStyle = WHT; c.font = `bold ${Math.round(w * 0.045)}px monospace`; c.textAlign = 'right'; c.fillText(String(Math.round(ias)), tx + tapeW - 6, cy + 10);
  c.fillStyle = GRN; c.font = `${Math.round(w * 0.03)}px monospace`; c.textAlign = 'left'; c.fillText(st.mach > 0.4 ? '.' + Math.round(st.mach * 1000).toString().padStart(3, '0').slice(0, 3) : 'GS ' + Math.round(st.gs / KT), tx, h * 0.84);
  // altitude tape
  const ax = w * 0.83, aW = w * 0.14; const alt = st.altMSL / FT; const fpp = (h * 0.6) / 800;
  c.fillStyle = 'rgba(60,65,75,0.9)'; c.fillRect(ax, cy - h * 0.3, aW, h * 0.6);
  c.save(); c.beginPath(); c.rect(ax, cy - h * 0.3, aW, h * 0.6); c.clip();
  c.strokeStyle = WHT; c.fillStyle = WHT; c.font = `${Math.round(w * 0.028)}px monospace`; c.textAlign = 'left';
  for (let a = Math.floor((alt - 450) / 100) * 100; a < alt + 450; a += 100) { const y = cy - (a - alt) * fpp; c.beginPath(); c.moveTo(ax, y); c.lineTo(ax + 10, y); c.stroke(); if (a % 200 === 0) c.fillText(String(a), ax + 12, y + 6); }
  if (ap.engaged) { const y = cy - (ap.altFt - alt) * fpp; c.fillStyle = MAG; c.fillRect(ax, y - 3, 14, 6); }
  // ground
  const gnd = (st.groundH) / FT; const gy = cy - (gnd - alt) * fpp; c.fillStyle = '#a0522d'; c.fillRect(ax, gy, aW, h);
  c.restore();
  c.fillStyle = '#000'; c.fillRect(ax, cy - 18, aW, 36); c.strokeRect(ax, cy - 18, aW, 36);
  c.fillStyle = WHT; c.font = `bold ${Math.round(w * 0.04)}px monospace`; c.textAlign = 'left'; c.fillText(String(Math.round(alt / 10) * 10), ax + 4, cy + 10);
  c.fillStyle = CYAN; c.font = `${Math.round(w * 0.03)}px monospace`; c.fillText(String(ap.altFt), ax, cy - h * 0.32);
  // VSI
  const vsFpm = st.vs / FT * 60; c.fillStyle = WHT; c.textAlign = 'left'; c.font = `${Math.round(w * 0.026)}px monospace`;
  c.strokeStyle = WHT; c.beginPath(); const vy = cy - clamp(vsFpm / 6000, -1, 1) * h * 0.25; c.moveTo(w * 0.985, cy); c.lineTo(w * 0.975, vy); c.stroke();
  if (Math.abs(vsFpm) > 200) c.fillText((vsFpm > 0 ? '+' : '') + Math.round(vsFpm / 100) * 100, ax - 4, vsFpm > 0 ? cy - h * 0.34 : cy + h * 0.38);
  // radio altitude
  if (st.agl < 2500 && !st.weightOnWheels) { c.fillStyle = st.agl < 300 ? AMB : WHT; c.font = `bold ${Math.round(w * 0.05)}px monospace`; c.textAlign = 'center'; c.fillText(String(Math.round(st.agl / FT / (st.agl < 60 ? 1 : 10)) * (st.agl < 60 ? 1 : 10)), cx, cy + R + 32); }
  // heading
  c.fillStyle = 'rgba(60,65,75,0.9)'; c.fillRect(cx - R, h * 0.88, 2 * R, h * 0.1);
  c.save(); c.beginPath(); c.rect(cx - R, h * 0.88, 2 * R, h * 0.1); c.clip(); c.fillStyle = WHT; c.strokeStyle = WHT; c.textAlign = 'center'; c.font = `${Math.round(w * 0.028)}px monospace`;
  for (let d = Math.floor(st.heading / 5) * 5 - 40; d <= st.heading + 40; d += 5) { const x = cx + (d - st.heading) * (R / 30); c.beginPath(); c.moveTo(x, h * 0.88); c.lineTo(x, h * 0.88 + (d % 10 === 0 ? 12 : 6)); c.stroke(); if (d % 10 === 0) c.fillText(String(((d % 360) + 360) % 360 / 10 | 0).padStart(2, '0'), x, h * 0.88 + 30); }
  c.restore(); c.fillStyle = '#ffd400'; c.fillRect(cx - 1.5, h * 0.87, 3, 16);
  // FMA
  c.fillStyle = GRN; c.font = `bold ${Math.round(w * 0.032)}px monospace`; c.textAlign = 'center';
  const fma = [ap.athr ? (ap.vert === 'FLARE' ? 'RETARD' : 'SPEED') : '', ap.engaged ? ap.lat : '', ap.engaged ? (ap.vert === 'VS' ? 'V/S' : ap.vert === 'ALT' ? 'ALT HOLD' : ap.vert) : ''];
  fma.forEach((t, i) => c.fillText(t, w * (0.22 + i * 0.28), h * 0.05));
  c.fillStyle = ap.engaged ? GRN : '#555'; c.fillText(ap.engaged ? (fm.spec.maker === 'Airbus' ? 'AP1' : 'CMD A') : '', w * 0.5, h * 0.11);
  if (ap.appArmed && !ap.gsCaptured) { c.fillStyle = WHT; c.fillText('G/S  LOC', w * 0.5, h * 0.16); }
  // glideslope / localizer deviation for arrival runway
  if (ap.plan) {
    const arr = ap.plan.arrEnd; const lat = origin.latOf(fm.pos.z), lon = origin.lonOf(fm.pos.x);
    const dist = haversine(lat, lon, arr.lat, arr.lon);
    if (dist < 20 * NM) {
      const gsAlt = ap.plan.arr.elevM + 15 + Math.tan(3 * DEG) * dist; const dev = clamp((st.altMSL - gsAlt) / (dist * Math.tan(0.7 * DEG) + 10), -1, 1);
      const brg = bearing(lat, lon, arr.lat, arr.lon); const ldev = clamp(wrap180(brg - arr.hdg) / 2.5, -1, 1);
      c.strokeStyle = WHT; c.fillStyle = MAG; for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(cx + R + 18, cy + i * R * 0.3, 4, 0, 7); c.stroke(); c.beginPath(); c.arc(cx + i * R * 0.3, cy + R + 8, 4, 0, 7); c.stroke(); }
      c.beginPath(); c.moveTo(cx + R + 18, cy + dev * R * 0.6 - 10); c.lineTo(cx + R + 26, cy + dev * R * 0.6); c.lineTo(cx + R + 18, cy + dev * R * 0.6 + 10); c.lineTo(cx + R + 10, cy + dev * R * 0.6); c.fill();
      c.beginPath(); c.moveTo(cx + ldev * R * 0.6 - 10, cy + R + 8); c.lineTo(cx + ldev * R * 0.6, cy + R); c.lineTo(cx + ldev * R * 0.6 + 10, cy + R + 8); c.lineTo(cx + ldev * R * 0.6, cy + R + 16); c.fill();
    }
  }
  if (st.stallWarn) { c.fillStyle = RED; c.font = `bold ${Math.round(w * 0.06)}px monospace`; c.textAlign = 'center'; c.fillText('STALL', cx, cy - R * 0.5); }
  if (st.overspeed) { c.fillStyle = RED; c.font = `bold ${Math.round(w * 0.05)}px monospace`; c.textAlign = 'center'; c.fillText('OVERSPEED', cx, cy - R * 0.5); }
}

export function drawND(c: Ctx, w: number, h: number, fm: FlightModel, ap: Autopilot, rangeNm: number) {
  const st = fm.st; const cx = w / 2, cy = h * 0.78, R = h * 0.68;
  const lat = origin.latOf(fm.pos.z), lon = origin.lonOf(fm.pos.x);
  const hdg = st.heading;
  c.strokeStyle = WHT; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  c.beginPath(); c.arc(cx, cy, R / 2, Math.PI * 1.15, Math.PI * 1.85); c.setLineDash([6, 6]); c.stroke(); c.setLineDash([]);
  c.fillStyle = WHT; c.font = `${Math.round(w * 0.032)}px monospace`; c.textAlign = 'center';
  for (let d = 0; d < 360; d += 10) { const a = (d - hdg) * DEG - Math.PI / 2; if (Math.cos(a + Math.PI / 2) < Math.cos(0.75)) continue; c.beginPath(); c.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.lineTo(cx + Math.cos(a) * (R - (d % 30 === 0 ? 14 : 7)), cy + Math.sin(a) * (R - (d % 30 === 0 ? 14 : 7))); c.stroke(); if (d % 30 === 0) c.fillText(String(d / 10), cx + Math.cos(a) * (R - 28), cy + Math.sin(a) * (R - 28) + 6); }
  c.fillStyle = WHT; c.fillText(String(Math.round(hdg)).padStart(3, '0'), cx, cy - R - 10);
  // route
  const toXY = (la: number, lo: number) => { const d = haversine(lat, lon, la, lo) / NM; const b = (bearing(lat, lon, la, lo) - hdg) * DEG; return [cx + Math.sin(b) * d / rangeNm * R, cy - Math.cos(b) * d / rangeNm * R]; };
  if (ap.plan) {
    const wps = ap.plan.waypoints;
    c.save(); c.beginPath(); c.rect(0, 0, w, cy + 30); c.clip();
    c.strokeStyle = MAG; c.lineWidth = 3; c.beginPath();
    for (let i = Math.max(0, ap.active - 1); i < wps.length; i++) { const [x, y] = toXY(wps[i].lat, wps[i].lon); i === Math.max(0, ap.active - 1) ? c.moveTo(x, y) : c.lineTo(x, y); if (i === ap.active) { c.stroke(); c.strokeStyle = WHT; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); } }
    c.stroke();
    c.font = `${Math.round(w * 0.028)}px monospace`; c.textAlign = 'left';
    for (let i = ap.active; i < wps.length; i++) { const [x, y] = toXY(wps[i].lat, wps[i].lon); c.fillStyle = i === ap.active ? MAG : WHT; c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 7, y); c.lineTo(x, y + 7); c.lineTo(x - 7, y); c.closePath(); c.fill(); c.fillText(wps[i].id, x + 10, y - 6); }
    // runway symbol
    const arr = ap.plan.arrEnd; const [x1, y1] = toXY(arr.lat, arr.lon), [x2, y2] = toXY(arr.other!.lat, arr.other!.lon);
    c.strokeStyle = WHT; c.lineWidth = 4; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.restore();
    const nx = wps[ap.active];
    if (nx) { const d = haversine(lat, lon, nx.lat, nx.lon) / NM; c.fillStyle = MAG; c.textAlign = 'right'; c.font = `bold ${Math.round(w * 0.035)}px monospace`; c.fillText(nx.id, w - 10, 30); c.fillStyle = WHT; c.fillText(d.toFixed(1) + ' NM', w - 10, 60);
      const etaS = d * NM / Math.max(30, st.gs); c.fillText(Math.floor(etaS / 60) + ':' + String(Math.floor(etaS % 60)).padStart(2, '0'), w - 10, 90); }
  }
  // aircraft symbol
  c.strokeStyle = '#ffd400'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy - 16); c.lineTo(cx, cy + 16); c.moveTo(cx - 14, cy - 2); c.lineTo(cx + 14, cy - 2); c.moveTo(cx - 6, cy + 14); c.lineTo(cx + 6, cy + 14); c.stroke();
  // track line
  const ta = (st.track - hdg) * DEG; c.strokeStyle = GRN; c.setLineDash([8, 8]); c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.sin(ta) * R, cy - Math.cos(ta) * R); c.stroke(); c.setLineDash([]);
  // heading bug
  if (ap.engaged) { const a = (ap.hdg - hdg) * DEG; c.fillStyle = MAG; c.save(); c.translate(cx + Math.sin(a) * R, cy - Math.cos(a) * R); c.rotate(a); c.fillRect(-10, -6, 20, 8); c.restore(); }
  // wind, GS/TAS
  const wk = fm.wind.length() / KT; const wdir = (Math.atan2(-fm.wind.x, fm.wind.z) / DEG + 360) % 360;
  c.fillStyle = WHT; c.textAlign = 'left'; c.font = `${Math.round(w * 0.032)}px monospace`;
  c.fillText(`GS ${Math.round(st.gs / KT)}  TAS ${Math.round(st.tas / KT)}`, 10, 30);
  c.fillText(`${String(Math.round(wdir)).padStart(3, '0')}°/${Math.round(wk)}`, 10, 60);
  const wa = (wdir + 180 - hdg) * DEG; c.strokeStyle = WHT; c.beginPath(); c.moveTo(40 - Math.sin(wa) * 15, 90 + Math.cos(wa) * 15); c.lineTo(40 + Math.sin(wa) * 15, 90 - Math.cos(wa) * 15); c.stroke();
  c.fillStyle = CYAN; c.fillText(`${rangeNm} NM`, 10, h - 14);
}

export function drawEICAS(c: Ctx, w: number, h: number, fm: FlightModel, airbus: boolean) {
  const n = fm.eng.length; c.font = `${Math.round(w * 0.034)}px monospace`; c.textAlign = 'center';
  const gauge = (x: number, y: number, r: number, v: number, max: number, label: string, txt: string, red = 0.98) => {
    c.strokeStyle = '#555'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, r, Math.PI * 0.75, Math.PI * 2.25); c.stroke();
    c.strokeStyle = RED; c.beginPath(); c.arc(x, y, r, Math.PI * (0.75 + 1.5 * red), Math.PI * 2.25); c.stroke();
    const a = Math.PI * 0.75 + Math.PI * 1.5 * clamp(v / max, 0, 1.05);
    c.strokeStyle = WHT; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.moveTo(x, y); c.arc(x, y, r, Math.PI * 0.75, a); c.fill();
    c.fillStyle = WHT; c.fillText(txt, x + r * 0.35, y + r * 0.6); c.fillStyle = CYAN; c.fillText(label, x, y + r + 18);
  };
  const cols = n; const dx = w / (cols + 1) * (n === 4 ? 1 : 0.8);
  for (let i = 0; i < n; i++) {
    const e = fm.eng[i]; const x = w * 0.5 + (i - (n - 1) / 2) * dx;
    gauge(x, h * 0.16, w * (n === 4 ? 0.08 : 0.1), e.n1, 110, 'N1', e.n1.toFixed(1));
    gauge(x, h * 0.42, w * (n === 4 ? 0.07 : 0.085), e.egt, 1000, 'EGT', String(Math.round(e.egt)), 0.92);
    c.fillStyle = WHT; c.fillText(`N2 ${e.n2.toFixed(1)}`, x, h * 0.62); c.fillText(`FF ${(e.ff * 3600).toFixed(0)}`, x, h * 0.67);
    if (e.starting) { c.fillStyle = AMB; c.fillText('START', x, h * 0.72); }
    else if (!e.running) { c.fillStyle = AMB; c.fillText('SHUTDOWN', x, h * 0.72); }
  }
  c.textAlign = 'left'; c.fillStyle = WHT;
  c.fillText(`FUEL ${(fm.fuel / 1000).toFixed(1)} t   GW ${(fm.mass / 1000).toFixed(1)} t`, 12, h * 0.8);
  const fl = fm.spec.flapDetents[fm.ctl.flapIdx];
  c.fillText(`${airbus ? 'FLAPS' : 'FLAP'} ${fl}`, 12, h * 0.86);
  c.fillStyle = fm.gear > 0.99 ? GRN : fm.gear < 0.01 ? '#666' : AMB; c.fillText(fm.gear > 0.99 ? 'GEAR DN ▼▼▼' : fm.gear < 0.01 ? 'GEAR UP' : 'GEAR TRANSIT', 12, h * 0.92);
  c.fillStyle = fm.spoiler > 0.05 ? AMB : fm.ctl.spoilerArmed ? GRN : '#666'; c.fillText(fm.spoiler > 0.05 ? 'SPD BRK EXT' : fm.ctl.spoilerArmed ? 'SPD BRK ARMED' : '', w * 0.5, h * 0.86);
  if (fm.ctl.parkingBrake) { c.fillStyle = AMB; c.fillText('PARK BRK SET', w * 0.5, h * 0.92); }
  if (fm.st.stallWarn) { c.fillStyle = RED; c.fillText('STALL', w * 0.5, h * 0.98); }
}

export function drawMCP(c: Ctx, w: number, h: number, ap: Autopilot, airbus: boolean) {
  c.fillStyle = '#20252b'; c.fillRect(0, 0, w, h);
  c.font = `bold ${Math.round(h * 0.38)}px monospace`; c.textAlign = 'center';
  const field = (x: number, label: string, val: string, act: boolean) => { c.fillStyle = '#000'; c.fillRect(x - 70, h * 0.35, 140, h * 0.5); c.fillStyle = act ? AMB : '#7a5a10'; c.fillText(val, x, h * 0.75); c.fillStyle = WHT; c.font = `${Math.round(h * 0.22)}px monospace`; c.fillText(label, x, h * 0.28); c.font = `bold ${Math.round(h * 0.38)}px monospace`; };
  field(w * 0.1, airbus ? 'SPD' : 'IAS/MACH', String(ap.spdKt), ap.athr);
  field(w * 0.25, 'HDG', String(Math.round(ap.hdg)).padStart(3, '0'), ap.engaged && ap.lat === 'HDG');
  field(w * 0.55, 'ALT', String(ap.altFt), ap.engaged);
  field(w * 0.4, 'V/S', (ap.vsFpm > 0 ? '+' : '') + ap.vsFpm, ap.engaged && ap.vert === 'VS');
  const lamp = (x: number, label: string, on: boolean) => { c.fillStyle = on ? GRN : '#333'; c.fillRect(x - 40, h * 0.4, 80, h * 0.35); c.fillStyle = on ? '#000' : '#999'; c.font = `bold ${Math.round(h * 0.22)}px monospace`; c.fillText(label, x, h * 0.65); c.font = `bold ${Math.round(h * 0.38)}px monospace`; };
  lamp(w * 0.7, ap.lat === 'LNAV' ? 'LNAV' : 'NAV', ap.engaged && ap.lat === 'LNAV'); lamp(w * 0.8, 'APPR', ap.appArmed); lamp(w * 0.9, airbus ? 'AP1' : 'CMD', ap.engaged);
  c.fillStyle = ap.athr ? GRN : '#333'; c.fillRect(w * 0.6 - 30, h * 0.4, 60, h * 0.35); c.fillStyle = ap.athr ? '#000' : '#999'; c.font = `bold ${Math.round(h * 0.2)}px monospace`; c.fillText('A/THR', w * 0.6 + 2, h * 0.65);
}

export function drawSixPack(c: Ctx, w: number, h: number, fm: FlightModel, ap: Autopilot) {
  const st = fm.st; const r = h * 0.2;
  const dial = (x: number, y: number, label: string, draw: (x: number, y: number) => void) => {
    const gr = c.createRadialGradient(x, y, r * 0.2, x, y, r * 1.1); gr.addColorStop(0, '#1b1b1b'); gr.addColorStop(1, '#050505');
    c.fillStyle = '#333'; c.beginPath(); c.arc(x, y, r * 1.08, 0, 7); c.fill(); c.fillStyle = gr; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
    draw(x, y); c.fillStyle = '#ddd'; c.font = `${Math.round(r * 0.14)}px Arial`; c.textAlign = 'center'; c.fillText(label, x, y + r * 0.55);
  };
  const needle = (x: number, y: number, a: number, len: number, col = '#fff', wdt = 4) => { c.strokeStyle = col; c.lineWidth = wdt; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(a) * len, y - Math.cos(a) * len); c.stroke(); };
  const ticks = (x: number, y: number, n: number, a0: number, a1: number, labels?: (i: number) => string) => { c.strokeStyle = '#fff'; c.lineWidth = 2; c.fillStyle = '#fff'; c.font = `${Math.round(r * 0.16)}px Arial`; c.textAlign = 'center'; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; c.beginPath(); c.moveTo(x + Math.sin(a) * r * 0.9, y - Math.cos(a) * r * 0.9); c.lineTo(x + Math.sin(a) * r * 0.78, y - Math.cos(a) * r * 0.78); c.stroke(); if (labels && labels(i)) c.fillText(labels(i), x + Math.sin(a) * r * 0.62, y - Math.cos(a) * r * 0.62 + 6); } };
  const X = [w * 0.15, w * 0.38, w * 0.61], Y = [h * 0.27, h * 0.73];
  // airspeed
  dial(X[0], Y[0], 'AIRSPEED KTS', (x, y) => {
    const ias = st.ias / KT; const ang = (v: number) => (clamp(v, 0, 200) / 200) * Math.PI * 1.75 + 0.1;
    c.lineWidth = r * 0.06; c.strokeStyle = '#fff'; c.beginPath(); c.arc(x, y, r * 0.85, ang(33) - Math.PI / 2, ang(85) - Math.PI / 2); c.stroke();
    c.strokeStyle = '#2c2'; c.beginPath(); c.arc(x, y, r * 0.92, ang(48) - Math.PI / 2, ang(129) - Math.PI / 2); c.stroke();
    c.strokeStyle = '#ee2'; c.beginPath(); c.arc(x, y, r * 0.92, ang(129) - Math.PI / 2, ang(163) - Math.PI / 2); c.stroke();
    ticks(x, y, 20, ang(0), ang(200), i => (i % 2 === 0 && i > 0 ? String(i * 10) : ''));
    needle(x, y, ang(ias), r * 0.8);
  });
  // attitude
  dial(X[1], Y[0], '', (x, y) => {
    c.save(); c.beginPath(); c.arc(x, y, r * 0.95, 0, 7); c.clip(); c.translate(x, y); c.rotate(-st.bank * DEG);
    const off = st.pitch * r / 30; c.fillStyle = '#2d7fd1'; c.fillRect(-r * 2, -r * 2 + off, r * 4, r * 2); c.fillStyle = '#8a5a2a'; c.fillRect(-r * 2, off, r * 4, r * 2);
    c.strokeStyle = '#fff'; c.lineWidth = 2; for (let p = -20; p <= 20; p += 5) { const y2 = off - p * r / 30; const L = p % 10 === 0 ? r * 0.3 : r * 0.15; c.beginPath(); c.moveTo(-L, y2); c.lineTo(L, y2); c.stroke(); }
    c.restore(); c.strokeStyle = '#f80'; c.lineWidth = 5; c.beginPath(); c.moveTo(x - r * 0.5, y); c.lineTo(x - r * 0.15, y); c.lineTo(x, y + r * 0.1); c.lineTo(x + r * 0.15, y); c.lineTo(x + r * 0.5, y); c.stroke();
  });
  // altimeter
  dial(X[2], Y[0], 'ALT', (x, y) => {
    const alt = st.altMSL / FT; ticks(x, y, 50, 0, Math.PI * 2 - 0.13, i => (i % 5 === 0 && i < 50 ? String(i / 5) : ''));
    needle(x, y, (alt % 1000) / 1000 * Math.PI * 2, r * 0.8, '#fff', 3); needle(x, y, (alt % 10000) / 10000 * Math.PI * 2, r * 0.5, '#fff', 6);
    c.fillStyle = '#fff'; c.font = `bold ${Math.round(r * 0.18)}px monospace`; c.fillText(String(Math.round(alt)), x, y - r * 0.3);
  });
  // turn coordinator
  dial(X[0], Y[1], 'TURN COORDINATOR', (x, y) => {
    const rate = -fm.omega.y / DEG; c.save(); c.translate(x, y); c.rotate(clamp(rate / 3 * 0.35, -0.7, 0.7)); c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.moveTo(-r * 0.6, 0); c.lineTo(r * 0.6, 0); c.moveTo(0, -r * 0.15); c.lineTo(0, 0); c.stroke(); c.restore();
    c.fillStyle = '#ddd'; c.beginPath(); c.arc(x + clamp(-st.beta * 4, -40, 40), y + r * 0.35, r * 0.08, 0, 7); c.fill();
  });
  // heading indicator
  dial(X[1], Y[1], '', (x, y) => {
    c.save(); c.translate(x, y); c.rotate(-st.heading * DEG); c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `bold ${Math.round(r * 0.18)}px Arial`;
    for (let d = 0; d < 360; d += 30) { c.save(); c.rotate(d * DEG); c.fillText(d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10), 0, -r * 0.62); c.restore(); }
    for (let d = 0; d < 360; d += 5) { c.save(); c.rotate(d * DEG); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -r * 0.92); c.lineTo(0, -r * (d % 10 ? 0.85 : 0.8)); c.stroke(); c.restore(); }
    if (ap.engaged) { c.save(); c.rotate(ap.hdg * DEG); c.fillStyle = '#f80'; c.fillRect(-8, -r * 0.98, 16, 12); c.restore(); }
    c.restore(); c.strokeStyle = '#f80'; c.lineWidth = 4; c.beginPath(); c.moveTo(x, y - r * 0.4); c.lineTo(x, y + r * 0.4); c.moveTo(x - r * 0.3, y - r * 0.05); c.lineTo(x + r * 0.3, y - r * 0.05); c.stroke();
  });
  // VSI
  dial(X[2], Y[1], 'VERTICAL SPEED', (x, y) => {
    const v = st.vs / FT * 60; const ang = (f: number) => -Math.PI / 2 + clamp(f / 2000, -1, 1) * Math.PI * 0.85;
    ticks(x, y, 8, ang(-2000), ang(2000), i => String(Math.abs(i - 4) * 5 || ''));
    needle(x, y, ang(v), r * 0.8);
  });
  // engine strip
  const e = fm.eng[0]; const ex = w * 0.8;
  c.fillStyle = '#111'; c.fillRect(w * 0.73, h * 0.05, w * 0.25, h * 0.9);
  c.fillStyle = '#fff'; c.font = `bold ${Math.round(h * 0.05)}px monospace`; c.textAlign = 'left';
  c.fillText(`RPM ${Math.round(e.rpm)}`, w * 0.75, h * 0.15);
  c.fillStyle = '#2c2'; c.fillRect(w * 0.75, h * 0.18, w * 0.2 * clamp(e.rpm / 2700, 0, 1), h * 0.03);
  c.fillStyle = '#fff';
  c.fillText(`FF ${(e.ff * 3600 / 2.72).toFixed(1)} GPH`, w * 0.75, h * 0.3);
  c.fillText(`FUEL ${(fm.fuel / 2.72).toFixed(0)} GAL`, w * 0.75, h * 0.4);
  c.fillText(`FLAPS ${fm.spec.flapDetents[fm.ctl.flapIdx]}`, w * 0.75, h * 0.5);
  c.fillText(`TRIM ${(fm.ctl.trim * 100).toFixed(0)}`, w * 0.75, h * 0.6);
  c.fillStyle = ap.engaged ? '#2c2' : '#666'; c.fillText(ap.engaged ? `AP ${ap.lat} ${ap.vert}` : 'AP OFF', w * 0.75, h * 0.72);
  if (ap.engaged) { c.fillStyle = '#0cf'; c.fillText(`HDG ${Math.round(ap.hdg)} ALT ${ap.altFt}`, w * 0.75, h * 0.8); }
  if (st.stallWarn) { c.fillStyle = RED; c.fillText('STALL', w * 0.75, h * 0.9); }
  void ex;
}
