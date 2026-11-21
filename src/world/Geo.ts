import * as THREE from 'three';

/** Accumulates geometry into two buffers: windowed walls (w) and flat-coloured surfaces (f). */
class Buf {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; seed: number[] = []; idx: number[] = [];
  get count() { return this.pos.length / 3; }
  build(): THREE.BufferGeometry | null {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(this.seed, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

const tmpC = new THREE.Color();
export function hex(c: number | string, shade = 1): [number, number, number] {
  tmpC.set(c as any);
  return [tmpC.r * shade, tmpC.g * shade, tmpC.b * shade];
}

export class Geo {
  w = new Buf(); f = new Buf(); g = new Buf(); p = new Buf();
  private seed = 0;
  setSeed(s: number) { this.seed = s; }

  private quad(b: Buf, p: number[][], n: number[], c: [number, number, number], uvs: number[][]) {
    const base = b.count;
    for (let i = 0; i < 4; i++) {
      b.pos.push(p[i][0], p[i][1], p[i][2]);
      b.nor.push(n[0], n[1], n[2]);
      b.uv.push(uvs[i][0], uvs[i][1]);
      b.col.push(c[0], c[1], c[2]);
      b.seed.push(this.seed);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Flat horizontal quad (top facing). */
  rect(x0: number, z0: number, x1: number, z1: number, y: number, color: number | string, shade = 1) {
    const c = hex(color, shade);
    this.quad(this.f, [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [0, 1, 0], c, [[0, 0], [0, 1], [1, 1], [1, 0]]);
  }
  /** Horizontal quad with per-vertex heights (terrain). corners: (x0,z0),(x0,z1),(x1,z1),(x1,z0) */
  terrainQuad(x0: number, z0: number, x1: number, z1: number, y00: number, y01: number, y11: number, y10: number, cs: number[][]) {
    const b = this.f, base = b.count;
    const P = [[x0, y00, z0], [x0, y01, z1], [x1, y11, z1], [x1, y10, z0]];
    const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]], e2 = [P[3][0] - P[0][0], P[3][1] - P[0][1], P[3][2] - P[0][2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
    for (let i = 0; i < 4; i++) { b.pos.push(...P[i]); b.nor.push(nx, ny, nz); b.uv.push(0, 0); b.col.push(...cs[i]); b.seed.push(0); }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Axis-aligned box. windowed → side faces go to the window-textured buffer. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number | string, windowed = false, shade = 1) {
    const c = hex(color, shade);
    const wB = windowed ? this.w : this.f;
    const W = x1 - x0, H = y1 - y0, D = z1 - z0;
    const uW = windowed ? W / 3.2 : 0, uD = windowed ? D / 3.2 : 0, vH = windowed ? H / 3.6 : 0;
    const side = (shadeS: number): [number, number, number] => [c[0] * shadeS, c[1] * shadeS, c[2] * shadeS];
    // +x
    this.quad(wB, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], side(0.92), [[0, 0], [uD, 0], [uD, vH], [0, vH]]);
    // -x
    this.quad(wB, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], side(0.82), [[0, 0], [uD, 0], [uD, vH], [0, vH]]);
    // +z
    this.quad(wB, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], side(1.0), [[0, 0], [uW, 0], [uW, vH], [0, vH]]);
    // -z
    this.quad(wB, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], side(0.88), [[0, 0], [uW, 0], [uW, vH], [0, vH]]);
    // top
    this.quad(this.f, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], [c[0] * 0.8, c[1] * 0.8, c[2] * 0.8], [[0, 0], [0, 1], [1, 1], [1, 0]]);
  }

  /** Emissive (night-lit) box: lamps, signs, neon. */
  glow(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number | string) {
    const f = this.f; this.f = this.g; this.box(x0, y0, z0, x1, y1, z1, color, false); this.f = f;
  }

  /** Night-only additive light pool (flat quad). */
  pool(x0: number, z0: number, x1: number, z1: number, y: number, color: number | string) {
    const f = this.f; this.f = this.p; this.rect(x0, z0, x1, z1, y, color); this.f = f;
  }

  /** Box without bottom/top uv concerns, for thin props; same as box() flat. */
  prop(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number | string) { this.box(x0, y0, z0, x1, y1, z1, color, false); }

  /** Pitched roof (ridge along X when alongX). */
  roof(x0: number, z0: number, x1: number, z1: number, y: number, h: number, color: number | string, alongX = true) {
    const c = hex(color), b = this.f;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    const tri = (a: number[], bb: number[], cc: number[], n: number[], sh: number) => {
      const base = b.count;
      for (const p of [a, bb, cc]) { b.pos.push(...p); b.nor.push(...n); b.uv.push(0, 0); b.col.push(c[0] * sh, c[1] * sh, c[2] * sh); b.seed.push(0); }
      b.idx.push(base, base + 1, base + 2);
    };
    if (alongX) {
      const nl = Math.hypot(h, (z1 - z0) / 2);
      const ny = ((z1 - z0) / 2) / nl, nz = h / nl;
      this.quad(b, [[x0, y, z0], [x0, y + h, mz], [x1, y + h, mz], [x1, y, z0]], [0, ny, -nz], [c[0], c[1], c[2]], [[0, 0], [0, 1], [1, 1], [1, 0]]);
      this.quad(b, [[x0, y + h, mz], [x0, y, z1], [x1, y, z1], [x1, y + h, mz]], [0, ny, nz], [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85], [[0, 0], [0, 1], [1, 1], [1, 0]]);
      tri([x0, y, z0], [x0, y + h, mz], [x0, y, z1], [-1, 0, 0], 0.7);
      tri([x1, y, z1], [x1, y + h, mz], [x1, y, z0], [1, 0, 0], 0.7);
    } else {
      const nl = Math.hypot(h, (x1 - x0) / 2);
      const nx = h / nl, ny = ((x1 - x0) / 2) / nl;
      this.quad(b, [[x0, y, z1], [x0, y, z0], [mx, y + h, z0], [mx, y + h, z1]], [-nx, ny, 0], [c[0], c[1], c[2]], [[0, 0], [0, 1], [1, 1], [1, 0]]);
      this.quad(b, [[mx, y + h, z1], [mx, y + h, z0], [x1, y, z0], [x1, y, z1]], [nx, ny, 0], [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85], [[0, 0], [0, 1], [1, 1], [1, 0]]);
      tri([x0, y, z0], [mx, y + h, z0], [x1, y, z0], [0, 0, -1], 0.7);
      tri([x1, y, z1], [mx, y + h, z1], [x0, y, z1], [0, 0, 1], 0.7);
    }
  }

  /** Vertical cylinder-ish prism (n sides). */
  cyl(cx: number, y0: number, cz: number, rBottom: number, rTop: number, h: number, color: number | string, sides = 8, shade = 1) {
    const c = hex(color, shade), b = this.f;
    const base0 = b.count;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const sh = 0.8 + 0.2 * (ca * 0.6 + sa * 0.8);
      for (const [r, y] of [[rBottom, y0], [rTop, y0 + h]] as [number, number][]) {
        b.pos.push(cx + ca * r, y, cz + sa * r); b.nor.push(ca, 0.1, sa); b.uv.push(0, 0);
        b.col.push(c[0] * sh, c[1] * sh, c[2] * sh); b.seed.push(0);
      }
    }
    for (let i = 0; i < sides; i++) {
      const a = base0 + i * 2;
      b.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    // cap
    const ci = b.count;
    b.pos.push(cx, y0 + h, cz); b.nor.push(0, 1, 0); b.uv.push(0, 0); b.col.push(c[0], c[1], c[2]); b.seed.push(0);
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      b.pos.push(cx + Math.cos(a) * rTop, y0 + h, cz + Math.sin(a) * rTop); b.nor.push(0, 1, 0); b.uv.push(0, 0); b.col.push(c[0], c[1], c[2]); b.seed.push(0);
    }
    for (let i = 0; i < sides; i++) b.idx.push(ci, ci + 2 + i, ci + 1 + i);
  }

  /** Low-poly sphere-like blob (tree canopy). */
  blob(cx: number, cy: number, cz: number, r: number, color: number | string, shade = 1) {
    this.cyl(cx, cy - r * 0.5, cz, r * 0.55, r, r * 0.55, color, 7, shade * 0.85);
    this.cyl(cx, cy, cz, r, r * 0.4, r * 0.75, color, 7, shade);
  }
}
