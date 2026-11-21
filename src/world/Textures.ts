import * as THREE from 'three';
import { Rng } from '../core/MathUtil';

/** Procedural textures generated on demand (acts as the texture streaming pool). */
export class TextureStreamer {
  private cache = new Map<string, { tex: THREE.Texture; last: number }>();
  constructor(public size = 256, public aniso = 4) {}

  private make(key: string, build: () => THREE.Texture) {
    let e = this.cache.get(key);
    if (!e) { e = { tex: build(), last: 0 }; this.cache.set(key, e); }
    e.last = performance.now();
    return e.tex;
  }

  /** One window module tile (repeating): wall with darker glass pane. */
  windows() {
    return this.make('win' + this.size, () => this.windowTex(false));
  }
  windowMask() {
    return this.make('winmask' + this.size, () => this.windowTex(true));
  }
  private windowTex(mask: boolean) {
    const s = this.size, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d')!;
    const rng = new Rng(7);
    if (mask) { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); g.fillStyle = '#ffe2a0'; g.fillRect(s * 0.2, s * 0.22, s * 0.6, s * 0.56); }
    else {
      g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, s, s);
      for (let i = 0; i < s * 3; i++) { g.fillStyle = `rgba(0,0,0,${rng.range(0.01, 0.05)})`; g.fillRect(rng.range(0, s), rng.range(0, s), rng.range(1, 3), rng.range(1, 3)); }
      g.fillStyle = '#9aa7b3'; g.fillRect(s * 0.17, s * 0.19, s * 0.66, s * 0.62);
      const grd = g.createLinearGradient(0, s * 0.2, 0, s * 0.8); grd.addColorStop(0, '#2b4a63'); grd.addColorStop(1, '#101c27');
      g.fillStyle = grd; g.fillRect(s * 0.2, s * 0.22, s * 0.6, s * 0.56);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(s * 0.2, s * 0.22); g.lineTo(s * 0.5, s * 0.22); g.lineTo(s * 0.2, s * 0.6); g.fill();
      g.fillStyle = '#7d8790'; g.fillRect(s * 0.19, s * 0.5, s * 0.62, s * 0.025);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = this.aniso; t.colorSpace = mask ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    return t;
  }

  /** Tileable water normal map. */
  waterNormal() {
    return this.make('wn', () => {
      const s = 128, c = document.createElement('canvas'); c.width = c.height = s;
      const g = c.getContext('2d')!; const img = g.createImageData(s, s);
      const h = new Float32Array(s * s);
      const rng = new Rng(3);
      const waves = Array.from({ length: 7 }, () => ({ kx: rng.int(1, 4), ky: rng.int(1, 4), p: rng.range(0, 6.28), a: rng.range(0.4, 1) }));
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        let v = 0; for (const w of waves) v += Math.sin(((x * w.kx + y * w.ky) / s) * Math.PI * 2 + w.p) * w.a;
        h[y * s + x] = v;
      }
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = h[y * s + ((x + 1) % s)] - h[y * s + ((x + s - 1) % s)], dy = h[((y + 1) % s) * s + x] - h[((y + s - 1) % s) * s + x];
        const i = (y * s + x) * 4;
        img.data[i] = 128 + dx * 22; img.data[i + 1] = 128 + dy * 22; img.data[i + 2] = 255; img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return t;
    });
  }

  /** Soft round sprite for lights / particles. */
  glow() {
    return this.make('glow', () => {
      const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      return new THREE.CanvasTexture(c);
    });
  }

  /** Free textures unused for a while (memory management). */
  sweep(maxAgeMs = 90000) {
    const now = performance.now();
    for (const [k, e] of this.cache) {
      if (k === 'glow' || k === 'wn') continue;
      if (now - e.last > maxAgeMs) { e.tex.dispose(); this.cache.delete(k); }
    }
  }
  setSize(s: number) { this.size = s; }
}
