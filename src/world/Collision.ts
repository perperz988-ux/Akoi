import { groundY } from './CityLayout';

export type ColliderKind = 'building' | 'wall' | 'prop' | 'tree' | 'water' | 'interior';
export interface Box {
  x0: number; z0: number; x1: number; z1: number; y0: number; y1: number;
  kind: ColliderKind;
  /** Props can be knocked over by vehicles. */
  breakable?: boolean;
  onBreak?: (impact: number, dirX: number, dirZ: number) => void;
  disabled?: boolean;
  stamp?: number;
}

const G = 25; // grid cell size

/** Static world collision using a uniform spatial hash of axis-aligned boxes. */
export class StaticCollision {
  private grid = new Map<number, Box[]>();
  private stamp = 1;
  count = 0;

  private key(cx: number, cz: number) { return (cx + 2000) * 4096 + (cz + 2000); }

  add(b: Box) {
    const cx0 = Math.floor(b.x0 / G), cx1 = Math.floor(b.x1 / G), cz0 = Math.floor(b.z0 / G), cz1 = Math.floor(b.z1 / G);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = this.key(cx, cz);
      let arr = this.grid.get(k);
      if (!arr) { arr = []; this.grid.set(k, arr); }
      arr.push(b);
    }
    this.count++;
    return b;
  }

  remove(b: Box) {
    b.disabled = true;
    const cx0 = Math.floor(b.x0 / G), cx1 = Math.floor(b.x1 / G), cz0 = Math.floor(b.z0 / G), cz1 = Math.floor(b.z1 / G);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = this.key(cx, cz);
      const arr = this.grid.get(k);
      if (!arr) continue;
      const i = arr.indexOf(b);
      if (i >= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); }
      if (!arr.length) this.grid.delete(k);
    }
    this.count--;
  }

  query(x0: number, z0: number, x1: number, z1: number, out: Box[] = []) {
    out.length = 0;
    const s = ++this.stamp;
    const cx0 = Math.floor(x0 / G), cx1 = Math.floor(x1 / G), cz0 = Math.floor(z0 / G), cz1 = Math.floor(z1 / G);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const arr = this.grid.get(this.key(cx, cz));
      if (!arr) continue;
      for (const b of arr) {
        if (b.stamp === s || b.disabled) continue;
        b.stamp = s;
        if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
        out.push(b);
      }
    }
    return out;
  }

  private tmp: Box[] = [];
  /**
   * Push a vertical cylinder (x,z,r) spanning [y, y+h] out of all boxes.
   * Returns corrected position and collision normal (if any).
   */
  resolveCircle(x: number, z: number, r: number, y: number, h: number, stepUp = 0.45) {
    const res = { x, z, hit: false, nx: 0, nz: 0, box: null as Box | null };
    const boxes = this.query(x - r, z - r, x + r, z + r, this.tmp);
    for (const b of boxes) {
      if (b.y1 <= y + stepUp || b.y0 >= y + h) continue;
      const cx = Math.max(b.x0, Math.min(res.x, b.x1));
      const cz = Math.max(b.z0, Math.min(res.z, b.z1));
      let dx = res.x - cx, dz = res.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-5) {
        // centre inside box: push out along smallest axis
        const pl = res.x - b.x0, pr = b.x1 - res.x, pt = res.z - b.z0, pb = b.z1 - res.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) { dx = -1; dz = 0; d = 0; res.x = b.x0 - r; }
        else if (m === pr) { dx = 1; dz = 0; res.x = b.x1 + r; }
        else if (m === pt) { dx = 0; dz = -1; res.z = b.z0 - r; }
        else { dx = 0; dz = 1; res.z = b.z1 + r; }
        res.nx = dx; res.nz = dz;
      } else {
        const push = r - d;
        dx /= d; dz /= d;
        res.x += dx * push; res.z += dz * push;
        res.nx = dx; res.nz = dz;
      }
      res.hit = true; res.box = b;
    }
    return res;
  }

  /** Highest walkable surface under a circle (terrain or box top) not higher than maxY. */
  supportY(x: number, z: number, r: number, maxY: number) {
    let best = groundY(x, z);
    const boxes = this.query(x - r, z - r, x + r, z + r, this.tmp);
    for (const b of boxes) {
      if (b.kind === 'tree') continue;
      if (x + r * 0.5 < b.x0 || x - r * 0.5 > b.x1 || z + r * 0.5 < b.z0 || z - r * 0.5 > b.z1) continue;
      if (b.y1 <= maxY && b.y1 > best) best = b.y1;
    }
    return best;
  }

  /** Ray vs boxes (3D slab test). Returns distance to first hit or Infinity. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number, ignoreProps = false) {
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    const boxes = this.query(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), this.tmp);
    let best = maxDist;
    let hit = false;
    for (const b of boxes) {
      if (ignoreProps && (b.kind === 'prop' || b.kind === 'tree')) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, b);
      if (t >= 0 && t < best) { best = t; hit = true; }
    }
    // terrain: sample coarse steps for water banks / ground
    if (dy < 0) {
      const tg = (oy - 0) / -dy;
      if (tg > 0 && tg < best && groundY(ox + dx * tg, oz + dz * tg) >= -0.01) { best = tg; hit = true; }
    }
    return hit ? best : Infinity;
  }

  /** Line-of-sight check between two points. */
  los(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.01) return true;
    return this.raycast(ax, ay, az, dx / d, dy / d, dz / d, d, true) >= d - 0.3;
  }
}

export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box) {
  let tmin = -Infinity, tmax = Infinity;
  const axes: [number, number, number, number][] = [[ox, dx, b.x0, b.x1], [oy, dy, b.y0, b.y1], [oz, dz, b.z0, b.z1]];
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return -1; continue; }
    let t1 = (mn - o) / d, t2 = (mx - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return tmin >= 0 ? tmin : 0;
}

/** Dynamic objects (vehicles, peds) bucketed each frame for neighbour queries. */
export class DynamicGrid<T extends { x: number; z: number }> {
  private grid = new Map<number, T[]>();
  constructor(private size = 20) {}
  clear() { this.grid.clear(); }
  insert(o: T) {
    const k = this.k(Math.floor(o.x / this.size), Math.floor(o.z / this.size));
    let a = this.grid.get(k);
    if (!a) { a = []; this.grid.set(k, a); }
    a.push(o);
  }
  private k(cx: number, cz: number) { return (cx + 4000) * 8192 + (cz + 4000); }
  query(x: number, z: number, r: number, out: T[] = []) {
    out.length = 0;
    const s = this.size;
    for (let cx = Math.floor((x - r) / s); cx <= Math.floor((x + r) / s); cx++)
      for (let cz = Math.floor((z - r) / s); cz <= Math.floor((z + r) / s); cz++) {
        const a = this.grid.get(this.k(cx, cz));
        if (a) for (const o of a) if ((o.x - x) ** 2 + (o.z - z) ** 2 <= r * r) out.push(o);
      }
    return out;
  }
}
