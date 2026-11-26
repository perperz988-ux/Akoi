// NPCs: daily routines, grid A* navigation, wander, talk-facing and scripted paths for cutscenes.
import * as THREE from 'three';
import { Humanoid, Animated } from './rig.js';
import { BOUNDS } from './world.js';
import { angleLerp } from './rng.js';

const CS = 2; // nav cell size
export class Nav {
  constructor(col) { this.col = col; this.nx = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / CS); this.nz = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / CS); this.rebuild(); }
  rebuild() {
    const { nx, nz } = this; this.block = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = BOUNDS.x0 + (i + 0.5) * CS, z = BOUNDS.z0 + (j + 0.5) * CS; this.block[i + j * nx] = this.col.hit(x, z, 0.55, 0) ? 1 : 0; }
  }
  cell(x, z) { return [Math.floor((x - BOUNDS.x0) / CS), Math.floor((z - BOUNDS.z0) / CS)]; }
  free(i, j) { return i >= 0 && j >= 0 && i < this.nx && j < this.nz && !this.block[i + j * this.nx]; }
  nearestFree(i, j) { if (this.free(i, j)) return [i, j]; for (let r = 1; r < 6; r++) for (let a = -r; a <= r; a++) for (const [di, dj] of [[a, -r], [a, r], [-r, a], [r, a]]) if (this.free(i + di, j + dj)) return [i + di, j + dj]; return null; }
  path(ax, az, bx, bz) {
    if (ax > BOUNDS.x1 || bx > BOUNDS.x1) return [[bx, bz]];
    const s = this.nearestFree(...this.cell(ax, az)), g = this.nearestFree(...this.cell(bx, bz)); if (!s || !g) return null;
    const { nx, nz } = this, N = nx * nz, start = s[0] + s[1] * nx, goal = g[0] + g[1] * nx;
    const gs = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = [], push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
    const h = (n) => { const dx = Math.abs((n % nx) - g[0]), dz = Math.abs(((n / nx) | 0) - g[1]); return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    gs[start] = 0; push(start, h(start)); let it = 0;
    while (heap.length && it++ < 60000) {
      const c = pop(); if (c === goal) break; if (closed[c]) continue; closed[c] = 1;
      const ci = c % nx, cj = (c / nx) | 0;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue; const ni = ci + di, nj = cj + dj; if (!this.free(ni, nj)) continue;
        if (di && dj && (!this.free(ci + di, cj) || !this.free(ci, cj + dj))) continue;
        const n = ni + nj * nx, ng = gs[c] + (di && dj ? Math.SQRT2 : 1);
        if (ng < gs[n]) { gs[n] = ng; came[n] = c; push(n, ng + h(n)); }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const pts = []; let c = goal; while (c !== -1 && c !== start) { pts.push(c); c = came[c]; } pts.reverse();
    const out = pts.map((n) => [BOUNDS.x0 + ((n % nx) + 0.5) * CS, BOUNDS.z0 + (((n / nx) | 0) + 0.5) * CS]);
    // string pulling
    const sm = []; let anchor = [ax, az];
    for (let i = 0; i < out.length; i++) { const nxt = out[i + 1]; if (nxt && this.clear(anchor, nxt)) continue; sm.push(out[i]); anchor = out[i]; }
    sm.push([bx, bz]); return sm;
  }
  clear(a, b) { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(d / 1); for (let k = 1; k < n; k++) { const t = k / n, [i, j] = this.cell(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); if (!this.free(i, j)) return false; } return true; }
}

export class NPC {
  constructor(G, def) {
    this.G = G; this.def = def; this.id = def.id; this.name = def.name;
    this.rig = def.anim ? new Animated(def.model, def.anim) : new Humanoid(def.model, { tint: def.tint, height: def.height || 1.78 });
    this.mesh = this.rig.root; G.scene.add(this.mesh);
    if (def.hat) this.attachHat(def.hat);
    this.pos = new THREE.Vector3(def.start[0], 0, def.start[1]); this.yaw = 0; this.speed = def.speed || 1.5;
    this.path = null; this.goalKey = ''; this.wanderT = 0; this.anim = 'idle'; this.talking = false; this.script = null; this.visible = true; this.mode = 'idle';
    this.mesh.position.copy(this.pos);
  }
  attachHat(kind) {
    const head = this.rig.b && this.rig.b.Head; if (!head) return;
    const g = new THREE.Group();
    const s = 1 / this.rig.root.userData.scale;
    if (kind === 'hardhat') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf2c400 })); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 14), m.material); b.position.y = 0.01; g.add(m, b); g.position.y = 0.3; }
    if (kind === 'cap') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1f2f4f })); const v = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.025, 0.16), m.material); v.position.set(0, 0.01, 0.17); g.add(m, v); g.position.y = 0.29; }
    if (kind === 'hood') { const m = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshLambertMaterial({ color: 0x1a1a22 })); m.position.y = 0.17; m.position.z = -0.03; g.add(m); }
    g.scale.setScalar(s * 1.05); head.add(g); this.hat = g;
  }
  setPos(x, z, yaw) { this.pos.set(x, 0, z); if (yaw != null) this.yaw = yaw; this.path = null; this.goalKey = ''; }
  goTo(x, z, key) {
    this.path = this.G.nav.path(this.pos.x, this.pos.z, x, z) || [[x, z]]; this.goalKey = key;
  }
  // scripted movement for cutscenes/chases: {pts:[[x,z]...], speed, anim, onDone}
  runScript(s) { this.script = Object.assign({ i: 0 }, s); }
  update(dt) {
    const G = this.G, def = this.def;
    const present = def.present ? def.present(G) : true;
    if (present !== this.visible) { this.visible = present; this.mesh.visible = present; }
    if (!present && !this.script) return;
    let moving = 0, mode = 'auto';
    if (this.script) {
      const s = this.script, p = s.pts[s.i];
      if (!p) { const d = s.onDone; this.script = null; this.anim = s.endAnim || 'idle'; d && d(this); }
      else {
        const dx = p[0] - this.pos.x, dz = p[1] - this.pos.z, d = Math.hypot(dx, dz), sp = s.speed || this.speed;
        if (s.waitFor && !s.waitFor(this)) { moving = 0; }
        else if (d < 0.25) s.i++;
        else { const st = Math.min(d, sp * dt); this.pos.x += (dx / d) * st; this.pos.z += (dz / d) * st; this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10)); moving = sp; }
        mode = moving ? (s.anim || 'auto') : 'idle';
      }
    } else if (this.talking) {
      const p = G.player.pos; this.yaw = angleLerp(this.yaw, Math.atan2(p.x - this.pos.x, p.z - this.pos.z), Math.min(1, dt * 6)); mode = 'talk';
    } else {
      const r = def.routine(G.hour, G); const key = r.key || `${r.at[0]},${r.at[1]}`;
      if (key !== this.goalKey) { this.goTo(r.at[0], r.at[1], key); this.wanderT = 3 + Math.random() * 4; }
      if (this.path && this.path.length) {
        const p = this.path[0], dx = p[0] - this.pos.x, dz = p[1] - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.3) this.path.shift();
        else {
          const st = Math.min(d, this.speed * dt); const nx = this.pos.x + (dx / d) * st, nz = this.pos.z + (dz / d) * st;
          // don't walk through the player
          const pp = G.player.pos; if (Math.hypot(nx - pp.x, nz - pp.z) > 0.7 || G.area !== 'out') { this.pos.x = nx; this.pos.z = nz; moving = this.speed; }
          this.yaw = angleLerp(this.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
        }
      } else {
        mode = r.anim || 'idle';
        if (r.ry != null) this.yaw = angleLerp(this.yaw, r.ry, Math.min(1, dt * 4));
        if (r.wander) {
          this.wanderT -= dt;
          if (this.wanderT < 0) {
            this.wanderT = 5 + Math.random() * 8;
            for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28, rr = Math.random() * r.wander, x = r.at[0] + Math.cos(a) * rr, z = r.at[1] + Math.sin(a) * rr; const c = G.nav.cell(x, z); if (G.nav.free(c[0], c[1])) { this.path = G.nav.path(this.pos.x, this.pos.z, x, z) || null; break; } }
          }
        }
      }
    }
    this.mesh.position.set(this.pos.x, 0, this.pos.z); this.mesh.rotation.y = this.yaw;
    const close = Math.hypot(this.pos.x - G.camera.position.x, this.pos.z - G.camera.position.z) < 70 || G.cine.active;
    if (close) { if (this.rig.mixer) { this.rig.play(moving > 2.5 ? (def.runClip || 'Running') : moving ? (def.walkClip || 'Walking') : (this.forceClip || def.idleClip || 'Idle')); this.rig.update(dt); } else this.rig.update(dt, moving, this.forceMode || mode); }
    this.mode = moving ? 'walk' : mode;
  }
}
