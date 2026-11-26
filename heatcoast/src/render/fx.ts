import * as THREE from 'three';
import { brassMat } from '../combat/weapons';
import { heightAt } from '../world/layout';

/** Pooled GPU particles (single draw call) + tracers + brass casings + flash lights. */
export class Fx {
  private N: number; private pos: Float32Array; private col: Float32Array; private size: Float32Array; private alpha: Float32Array;
  private vel: Float32Array; private life: Float32Array; private maxLife: Float32Array; private grow: Float32Array; private drag: Float32Array; private grav: Float32Array; private fade: Float32Array;
  private geo = new THREE.BufferGeometry(); points: THREE.Points; private next = 0;
  private tracers: { line: THREE.Line; t: number }[] = [];
  private shells: { m: THREE.Mesh; vx: number; vy: number; vz: number; t: number }[] = []; private shellI = 0;
  flash = new THREE.PointLight(0xffc070, 0, 14, 2); private flashT = 0;
  boom = new THREE.PointLight(0xff8a30, 0, 60, 2); private boomT = 0;
  constructor(private scene: THREE.Scene, n = 2500) {
    this.N = n; this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.maxLife = new Float32Array(n).fill(1); this.grow = new Float32Array(n); this.drag = new Float32Array(n); this.grav = new Float32Array(n); this.fade = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1)); this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d')!; const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uTex: { value: tex }, uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
      vertexColors: true,
    });
    this.points = new THREE.Points(this.geo, mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
    scene.add(this.flash); scene.add(this.boom);
    const sg = new THREE.CylinderGeometry(0.006, 0.006, 0.022, 6);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(sg, brassMat); m.visible = false; scene.add(m); this.shells.push({ m, vx: 0, vy: 0, vz: 0, t: 0 }); }
    const tm = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8, toneMapped: false });
    for (let i = 0; i < 24; i++) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), tm.clone()); l.visible = false; l.frustumCulled = false; scene.add(l); this.tracers.push({ line: l, t: 0 }); }
  }
  setScale(s: number) { (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = s; }
  emit(x: number, y: number, z: number, o: { vx?: number; vy?: number; vz?: number; spread?: number; color: number; size: number; life: number; grow?: number; drag?: number; grav?: number; alpha?: number; n?: number }) {
    const c = new THREE.Color(o.color); const n = o.n ?? 1;
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.N; const s = o.spread ?? 0;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = (o.vx ?? 0) + (Math.random() - 0.5) * s; this.vel[i * 3 + 1] = (o.vy ?? 0) + (Math.random() - 0.5) * s; this.vel[i * 3 + 2] = (o.vz ?? 0) + (Math.random() - 0.5) * s;
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.size[i] = o.size * (0.7 + Math.random() * 0.6); this.life[i] = this.maxLife[i] = o.life * (0.7 + Math.random() * 0.6); this.grow[i] = o.grow ?? 0; this.drag[i] = o.drag ?? 1; this.grav[i] = o.grav ?? 0; this.fade[i] = o.alpha ?? 1;
    }
  }
  smoke(x: number, y: number, z: number, dark = 0.3, n = 1) { this.emit(x, y, z, { vy: 1.4, spread: 0.8, color: new THREE.Color(dark, dark, dark).getHex(), size: 1.2, life: 2.6, grow: 1.4, drag: 0.6, alpha: 0.55, n }); }
  fire(x: number, y: number, z: number, n = 2) { this.emit(x, y, z, { vy: 2.4, spread: 0.9, color: 0xff7a20, size: 0.9, life: 0.6, grow: -0.6, drag: 0.5, alpha: 0.95, n }); }
  sparks(x: number, y: number, z: number, n = 6) { this.emit(x, y, z, { spread: 6, vy: 2, color: 0xffd080, size: 0.06, life: 0.35, grav: -14, alpha: 1, n }); }
  dust(x: number, y: number, z: number, n = 3, c = 0x9a8a70) { this.emit(x, y, z, { spread: 1.2, vy: 0.8, color: c, size: 0.35, life: 0.9, grow: 0.9, drag: 0.4, alpha: 0.5, n }); }
  blood(x: number, y: number, z: number, n = 8) { this.emit(x, y, z, { spread: 2.6, vy: 0.8, color: 0x7a0808, size: 0.09, life: 0.55, grav: -10, alpha: 0.95, n }); this.emit(x, y, z, { spread: 0.4, color: 0x6a0606, size: 0.4, life: 0.4, grow: 0.8, alpha: 0.6 }); }
  splash(x: number, y: number, z: number, n = 10) { this.emit(x, y, z, { spread: 3, vy: 4, color: 0xdde8ee, size: 0.25, life: 0.7, grav: -12, alpha: 0.8, n }); }
  tyreSmoke(x: number, y: number, z: number) { this.emit(x, y + 0.2, z, { spread: 0.7, vy: 0.5, color: 0xcfcfcf, size: 0.8, life: 1.8, grow: 1.6, drag: 0.5, alpha: 0.35 }); }
  explosion(x: number, y: number, z: number) {
    this.emit(x, y + 1, z, { spread: 14, vy: 4, color: 0xffb040, size: 2.2, life: 0.7, grow: 2, drag: 0.15, alpha: 1, n: 40 });
    this.emit(x, y + 1, z, { spread: 8, vy: 6, color: 0x2a2826, size: 2.5, life: 4, grow: 2.2, drag: 0.4, alpha: 0.7, n: 30 });
    this.sparks(x, y + 1, z, 40);
    this.boom.position.set(x, y + 3, z); this.boom.intensity = 900; this.boomT = 0.6;
  }
  muzzle(p: THREE.Vector3) { this.flash.position.copy(p); this.flash.intensity = 40; this.flashT = 0.05; this.emit(p.x, p.y, p.z, { spread: 0.3, color: 0xffd090, size: 0.25, life: 0.06, alpha: 1, n: 2 }); this.emit(p.x, p.y, p.z, { spread: 0.4, vy: 0.4, color: 0x9a9a9a, size: 0.3, life: 0.8, grow: 0.8, alpha: 0.25 }); }
  tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const t = this.tracers.find((x) => x.t <= 0) ?? this.tracers[0];
    const p = t.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    const s = a.clone().lerp(b, 0.15); p.setXYZ(0, s.x, s.y, s.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; t.line.visible = true; t.t = 0.06;
  }
  shell(p: THREE.Vector3, yaw: number) {
    const s = this.shells[this.shellI = (this.shellI + 1) % this.shells.length];
    s.m.position.copy(p); s.m.visible = true; s.t = 2.5; const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    s.vx = -rx * (1.5 + Math.random()) ; s.vz = -rz * (1.5 + Math.random()); s.vy = 2.2 + Math.random();
  }
  update(dt: number) {
    const N = this.N;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const k = this.life[i] / this.maxLife[i];
      const d = Math.pow(this.drag[i], dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d + this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = Math.max(0.01, this.size[i] + this.grow[i] * dt);
      this.alpha[i] = Math.max(0, k) * this.fade[i];
    }
    for (const n of ['position', 'size', 'alpha', 'color']) (this.geo.getAttribute(n) as THREE.BufferAttribute).needsUpdate = true;
    for (const t of this.tracers) if (t.t > 0) { t.t -= dt; if (t.t <= 0) t.line.visible = false; }
    for (const s of this.shells) {
      if (s.t <= 0) continue; s.t -= dt; s.vy -= 14 * dt;
      s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt; s.m.rotation.x += dt * 20; s.m.rotation.z += dt * 13;
      const gy = heightAt(s.m.position.x, s.m.position.z) + 0.02;
      if (s.m.position.y < gy) { s.m.position.y = gy; s.vy = -s.vy * 0.3; s.vx *= 0.5; s.vz *= 0.5; }
      if (s.t <= 0) s.m.visible = false;
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.intensity = 0; }
    if (this.boomT > 0) { this.boomT -= dt; this.boom.intensity = Math.max(0, this.boomT / 0.6) * 900; }
  }
}
