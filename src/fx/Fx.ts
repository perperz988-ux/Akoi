import * as THREE from 'three';
import { TextureStreamer } from '../world/Textures';

const VERT = `
attribute float aSize; attribute vec4 aColor; varying vec4 vColor;
uniform float uScale;
void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FRAG = `
precision mediump float; varying vec4 vColor; uniform sampler2D uMap;
void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vColor.rgb, vColor.a * t.a); if (gl_FragColor.a < 0.01) discard; }`;

interface P { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; s0: number; s1: number; c0: THREE.Color; c1: THREE.Color; a0: number; grav: number; drag: number; alive: boolean }

/** Single pooled GPU point cloud for smoke / fire / sparks / dust / splashes. */
export class Fx {
  max: number;
  private ps: P[] = [];
  private pos: Float32Array; private size: Float32Array; private col: Float32Array;
  private geo = new THREE.BufferGeometry();
  points: THREE.Points;
  private head = 0;
  private tracers: { a: THREE.Vector3; b: THREE.Vector3; t: number }[] = [];
  tracerLines: THREE.LineSegments;
  private tPos: Float32Array;
  flashLight = new THREE.PointLight(0xffa040, 0, 40, 2);
  private flashT = 0;
  private tmpC = new THREE.Color();

  constructor(scene: THREE.Scene, tex: TextureStreamer, max = 1200, public scale = 600) {
    this.max = max;
    for (let i = 0; i < max; i++) this.ps.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, s0: 1, s1: 1, c0: new THREE.Color(), c1: new THREE.Color(), a0: 1, grav: 0, drag: 0, alive: false });
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.col = new Float32Array(max * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, uniforms: { uMap: { value: tex.glow() }, uScale: { value: scale } } });
    this.points = new THREE.Points(this.geo, mat); this.points.frustumCulled = false; this.points.renderOrder = 4;
    scene.add(this.points);
    this.tPos = new Float32Array(48 * 6);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(this.tPos, 3).setUsage(THREE.DynamicDrawUsage));
    for (let i = 0; i < 48; i++) this.tracers.push({ a: new THREE.Vector3(), b: new THREE.Vector3(), t: 0 });
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.8, depthWrite: false }));
    this.tracerLines.frustumCulled = false; scene.add(this.tracerLines);
    scene.add(this.flashLight);
  }

  setScale(s: number) { this.scale = s; (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = s; }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, s0: number, s1: number, c0: number, c1: number, a0 = 1, grav = 0, drag = 0.5) {
    const p = this.ps[this.head]; this.head = (this.head + 1) % this.max;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = p.max = life; p.s0 = s0; p.s1 = s1; p.c0.set(c0); p.c1.set(c1); p.a0 = a0; p.grav = grav; p.drag = drag; p.alive = true;
  }

  smoke(x: number, y: number, z: number, n = 1, dark = 0.3, rise = 2) {
    for (let i = 0; i < n; i++) this.spawn(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.8, rise + Math.random(), (Math.random() - 0.5) * 0.8, 1.6 + Math.random(), 0.8, 3.2, new THREE.Color(dark, dark, dark).getHex(), 0x888888, 0.5, 0, 0.6);
  }
  fire(x: number, y: number, z: number, n = 1) {
    for (let i = 0; i < n; i++) this.spawn(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, 1.4, 0.2, 0xffc040, 0xd02000, 0.9, 0, 0.5);
  }
  sparks(x: number, y: number, z: number, n = 6, color = 0xffd060) {
    for (let i = 0; i < n; i++) this.spawn(x, y, z, (Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6, 0.25 + Math.random() * 0.25, 0.25, 0.05, color, 0xff6020, 1, 14, 0.5);
  }
  dust(x: number, y: number, z: number, n = 4, color = 0xb8a890) {
    for (let i = 0; i < n; i++) this.spawn(x, y, z, (Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.7 + Math.random() * 0.5, 0.5, 2.0, color, color, 0.5, 0, 1.2);
  }
  splash(x: number, y: number, z: number, n = 8) {
    for (let i = 0; i < n; i++) this.spawn(x, y, z, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3, 0.6 + Math.random() * 0.4, 0.4, 0.15, 0xd8f0ff, 0xaad0ee, 0.9, 12, 0.3);
  }
  explosion(x: number, y: number, z: number, size = 1) {
    for (let i = 0; i < 26 * size; i++) { const a = Math.random() * 6.28, e = Math.random() * 3.14; const sp = (4 + Math.random() * 9) * size; this.spawn(x, y + 0.8, z, Math.cos(a) * Math.sin(e) * sp, Math.cos(e) * sp * 0.8 + 2, Math.sin(a) * Math.sin(e) * sp, 0.5 + Math.random() * 0.6, 2.6 * size, 0.5, 0xffd060, 0xc02800, 1, 1, 1.5); }
    for (let i = 0; i < 18 * size; i++) this.spawn(x + (Math.random() - 0.5) * 2, y + 1, z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 4, 2 + Math.random() * 5, (Math.random() - 0.5) * 4, 2 + Math.random() * 1.5, 2, 6 * size, 0x222222, 0x666666, 0.7, 0, 0.8);
    this.sparks(x, y + 1, z, 20 * size);
    this.flashLight.position.set(x, y + 2, z); this.flashT = 0.35; this.flashLight.intensity = 400 * size;
  }
  tracer(a: THREE.Vector3, b: THREE.Vector3) {
    let best = this.tracers[0];
    for (const t of this.tracers) { if (t.t <= 0) { best = t; break; } if (t.t < best.t) best = t; }
    best.a.copy(a); best.b.copy(b); best.t = 0.07;
  }
  muzzle(x: number, y: number, z: number) {
    this.spawn(x, y, z, 0, 0, 0, 0.06, 0.7, 0.3, 0xfff0b0, 0xffa040, 1, 0, 0);
    this.flashLight.position.set(x, y, z); this.flashT = 0.06; this.flashLight.intensity = 30;
  }

  update(dt: number) {
    let n = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.ps[i];
      if (!p.alive) { this.size[i] = 0; this.col[i * 4 + 3] = 0; this.pos[i * 3 + 1] = -999; continue; }
      p.life -= dt;
      if (p.life <= 0) { p.alive = false; this.size[i] = 0; this.col[i * 4 + 3] = 0; continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const t = 1 - p.life / p.max;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.size[i] = p.s0 + (p.s1 - p.s0) * t;
      this.tmpC.copy(p.c0).lerp(p.c1, t);
      this.col[i * 4] = this.tmpC.r; this.col[i * 4 + 1] = this.tmpC.g; this.col[i * 4 + 2] = this.tmpC.b; this.col[i * 4 + 3] = p.a0 * (1 - t) * Math.min(1, t * 8 + 0.2);
      n++;
    }
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    // tracers
    let ti = 0;
    for (const t of this.tracers) {
      if (t.t > 0) { t.t -= dt; this.tPos.set([t.a.x, t.a.y, t.a.z, t.b.x, t.b.y, t.b.z], ti * 6); ti++; }
    }
    for (let i = ti; i < 48; i++) this.tPos.fill(0, i * 6, i * 6 + 6);
    (this.tracerLines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.flashT -= dt;
    if (this.flashT <= 0) this.flashLight.intensity = 0; else this.flashLight.intensity *= Math.exp(-dt * 8);
    return n;
  }
}
