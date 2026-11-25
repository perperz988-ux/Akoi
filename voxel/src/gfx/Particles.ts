// Pooled voxel particles (single instanced draw call) and weather precipitation.
import * as THREE from 'three';

interface Part { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; g: number; r: number; gr: number; b: number; glow: boolean }

export class Particles {
  private max = 700;
  private mesh: THREE.InstancedMesh;
  private parts: Part[] = [];
  private free: Part[] = [];
  private m = new THREE.Matrix4();
  private c = new THREE.Color();
  density = 1;
  // weather
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private snow: THREE.Points;
  private snowPos: Float32Array;
  private drops = 900;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    for (let i = 0; i < this.max; i++) this.free.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.1, g: 0, r: 1, gr: 1, b: 1, glow: false });

    this.rainPos = new Float32Array(this.drops * 6);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9fb8d8, transparent: true, opacity: 0.55, fog: true }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    scene.add(this.rain);
    this.snowPos = new Float32Array(this.drops * 3);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.9 }));
    this.snow.frustumCulled = false; this.snow.visible = false;
    scene.add(this.snow);
    for (let i = 0; i < this.drops; i++) this.resetDrop(i, 0, 60, 0, true);
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, col: [number, number, number], gravity = 18, glow = false) {
    if (this.free.length === 0) return;
    const p = this.free.pop()!;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.size = size; p.g = gravity;
    p.r = col[0]; p.gr = col[1]; p.b = col[2]; p.glow = glow;
    this.parts.push(p);
  }

  burst(x: number, y: number, z: number, col: [number, number, number], n: number, light = 1) {
    n = Math.ceil(n * this.density);
    for (let i = 0; i < n; i++) {
      const v = 0.8 + Math.random() * 0.4;
      this.spawn(x + Math.random() - 0.5, y + Math.random() - 0.5, z + Math.random() - 0.5,
        (Math.random() - 0.5) * 4, Math.random() * 4 + 1, (Math.random() - 0.5) * 4, 0.5 + Math.random() * 0.5,
        0.08 + Math.random() * 0.08, [col[0] * v * light, col[1] * v * light, col[2] * v * light]);
    }
  }
  puff(x: number, y: number, z: number, n: number, col: [number, number, number] = [0.85, 0.85, 0.9]) {
    n = Math.ceil(n * this.density);
    for (let i = 0; i < n; i++) this.spawn(x + (Math.random() - 0.5) * 0.8, y + Math.random(), z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5, 0.6 + Math.random() * 0.6, 0.12 + Math.random() * 0.1, col, -1.5);
  }
  flame(x: number, y: number, z: number) {
    if (Math.random() > this.density) return;
    this.spawn(x + (Math.random() - 0.5) * 0.08, y, z + (Math.random() - 0.5) * 0.08, 0, 0.5 + Math.random() * 0.4, 0, 0.35 + Math.random() * 0.25, 0.06, [1, 0.6 + Math.random() * 0.3, 0.2], -0.5, true);
    if (Math.random() < 0.15) this.spawn(x, y + 0.15, z, (Math.random() - 0.5) * 0.2, 0.7, (Math.random() - 0.5) * 0.2, 1.2, 0.05, [0.35, 0.35, 0.38], -0.3);
  }
  splash(x: number, y: number, z: number) {
    for (let i = 0; i < 14 * this.density; i++) this.spawn(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), (Math.random() - 0.5) * 3, 3 + Math.random() * 3, (Math.random() - 0.5) * 3, 0.6, 0.07, [0.6, 0.78, 1]);
  }
  sparkle(x: number, y: number, z: number, col: [number, number, number]) {
    this.spawn(x, y, z, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, 0.8, 0.05, col, 0, true);
  }

  private resetDrop(i: number, cx: number, cy: number, cz: number, randomY: boolean) {
    const x = cx + (Math.random() - 0.5) * 40, z = cz + (Math.random() - 0.5) * 40;
    const y = cy + (randomY ? Math.random() * 30 - 8 : 22 + Math.random() * 6);
    const r = this.rainPos;
    r[i * 6] = x; r[i * 6 + 1] = y; r[i * 6 + 2] = z; r[i * 6 + 3] = x + 0.05; r[i * 6 + 4] = y + 0.6; r[i * 6 + 5] = z;
    const s = this.snowPos;
    s[i * 3] = x; s[i * 3 + 1] = y; s[i * 3 + 2] = z;
  }

  /** ground: returns the top solid y at x,z for occluding rain under roofs. */
  update(dt: number, cam: THREE.Vector3, rain: number, snowy: boolean, ground: (x: number, z: number) => number) {
    // particles
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); this.free.push(p); continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
    }
    for (const p of this.parts) {
      const s = p.size * (p.glow ? p.life / p.max : Math.min(1, p.life / p.max * 2));
      this.m.makeScale(s, s, s); this.m.setPosition(p.x, p.y, p.z);
      this.mesh.setMatrixAt(n, this.m);
      this.c.setRGB(p.r, p.gr, p.b, THREE.SRGBColorSpace);
      this.mesh.setColorAt(n, this.c);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // weather
    const active = rain > 0.05;
    const count = Math.floor(this.drops * Math.min(1, rain) * Math.max(0.3, this.density));
    this.rain.visible = active && !snowy;
    this.snow.visible = active && snowy;
    if (!active) return;
    const r = this.rainPos, s = this.snowPos;
    for (let i = 0; i < count; i++) {
      if (snowy) {
        s[i * 3 + 1] -= dt * 2.5; s[i * 3] += Math.sin(s[i * 3 + 1] + i) * dt * 0.5;
        if (s[i * 3 + 1] < cam.y - 10 || s[i * 3 + 1] < ground(s[i * 3], s[i * 3 + 2]) || Math.abs(s[i * 3] - cam.x) > 22 || Math.abs(s[i * 3 + 2] - cam.z) > 22) this.resetDrop(i, cam.x, cam.y, cam.z, false);
      } else {
        const v = dt * 22;
        r[i * 6 + 1] -= v; r[i * 6 + 4] -= v;
        if (r[i * 6 + 1] < cam.y - 10 || r[i * 6 + 1] < ground(r[i * 6], r[i * 6 + 2]) || Math.abs(r[i * 6] - cam.x) > 22 || Math.abs(r[i * 6 + 2] - cam.z) > 22) {
          if (Math.random() < 0.05) this.spawn(r[i * 6], Math.max(r[i * 6 + 1], cam.y - 10) + 0.1, r[i * 6 + 2], 0, 1, 0, 0.2, 0.04, [0.7, 0.8, 1]);
          this.resetDrop(i, cam.x, cam.y, cam.z, false);
        }
      }
    }
    for (let i = count; i < this.drops; i++) { r[i * 6 + 1] = -999; r[i * 6 + 4] = -999; s[i * 3 + 1] = -999; }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.snow.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
