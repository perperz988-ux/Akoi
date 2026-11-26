// 2D spatial-hash collision: axis-aligned boxes and circles on the XZ plane, each with a height.
export class Collision {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); this.all = []; this._stamp = 0; }
  _key(cx, cz) { return cx * 100003 + cz; }
  _insert(c) {
    const s = this.cell; this.all.push(c);
    for (let cx = Math.floor(c.minX / s); cx <= Math.floor(c.maxX / s); cx++)
      for (let cz = Math.floor(c.minZ / s); cz <= Math.floor(c.maxZ / s); cz++) {
        const k = this._key(cx, cz); let a = this.map.get(k); if (!a) { a = []; this.map.set(k, a); } a.push(c);
      }
    return c;
  }
  box(minX, minZ, maxX, maxZ, h = 3, tag = null) { return this._insert({ t: 0, minX, minZ, maxX, maxZ, h, tag, on: true, s: 0 }); }
  boxC(x, z, w, d, h = 3, tag = null) { return this.box(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h, tag); }
  circle(x, z, r, h = 3, tag = null) { return this._insert({ t: 1, x, z, r, minX: x - r, minZ: z - r, maxX: x + r, maxZ: z + r, h, tag, on: true, s: 0 }); }
  near(x, z, r, fn) {
    const s = this.cell, st = ++this._stamp;
    for (let cx = Math.floor((x - r) / s); cx <= Math.floor((x + r) / s); cx++)
      for (let cz = Math.floor((z - r) / s); cz <= Math.floor((z + r) / s); cz++) {
        const a = this.map.get(this._key(cx, cz)); if (!a) continue;
        for (const c of a) { if (c.s === st || !c.on) continue; c.s = st; fn(c); }
      }
  }
  // push a circle at p (x,z) radius r out of colliders whose height is above y
  resolve(p, r, y = 0) {
    for (let it = 0; it < 3; it++) {
      let moved = false;
      this.near(p.x, p.z, r + 0.1, (c) => {
        if (y >= c.h) return;
        if (c.t === 1) {
          const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
          if (d < m && d > 1e-5) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; moved = true; }
        } else {
          const qx = Math.max(c.minX, Math.min(p.x, c.maxX)), qz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
          const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x = qx + (dx / d) * r; p.z = qz + (dz / d) * r; }
            else { // centre inside box: push out along smallest axis
              const l = p.x - c.minX, rr = c.maxX - p.x, t = p.z - c.minZ, b = c.maxZ - p.z, m = Math.min(l, rr, t, b);
              if (m === l) p.x = c.minX - r; else if (m === rr) p.x = c.maxX + r; else if (m === t) p.z = c.minZ - r; else p.z = c.maxZ + r;
            }
            moved = true;
          }
        }
      });
      if (!moved) break;
    }
  }
  hit(x, z, r = 0, y = 0) {
    let h = false;
    this.near(x, z, r + 0.1, (c) => {
      if (h || y >= c.h) return;
      if (c.t === 1) { if (Math.hypot(x - c.x, z - c.z) < c.r + r) h = true; }
      else if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) h = true;
    });
    return h;
  }
}
