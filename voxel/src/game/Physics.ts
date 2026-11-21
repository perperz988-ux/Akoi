// Axis-separated swept AABB collision against voxel boxes.
import { B, collisionBoxes } from '../world/Blocks';
import type { World } from '../world/World';

export interface Body {
  x: number; y: number; z: number;      // feet centre
  vx: number; vy: number; vz: number;
  hw: number; h: number;                // half width, height
  onGround: boolean;
  hitX: boolean; hitZ: boolean;
  inWater: boolean; inMagma: boolean; touchCactus: boolean;
  headInWater: boolean;
}

export function makeBody(hw: number, h: number): Body {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, hw, h, onGround: false, hitX: false, hitZ: false, inWater: false, inMagma: false, touchCactus: false, headInWater: false };
}

const EPS = 1e-4;

function clip(world: World, b: Body, axis: number, d: number): number {
  if (d === 0) return 0;
  const minx = b.x - b.hw, maxx = b.x + b.hw, miny = b.y, maxy = b.y + b.h, minz = b.z - b.hw, maxz = b.z + b.hw;
  const ex0 = axis === 0 ? Math.min(minx, minx + d) : minx, ex1 = axis === 0 ? Math.max(maxx, maxx + d) : maxx;
  const ey0 = axis === 1 ? Math.min(miny, miny + d) : miny, ey1 = axis === 1 ? Math.max(maxy, maxy + d) : maxy;
  const ez0 = axis === 2 ? Math.min(minz, minz + d) : minz, ez1 = axis === 2 ? Math.max(maxz, maxz + d) : maxz;
  const X0 = Math.floor(ex0), X1 = Math.floor(ex1 - EPS), Y0 = Math.floor(ey0) - 1, Y1 = Math.floor(ey1 - EPS), Z0 = Math.floor(ez0), Z1 = Math.floor(ez1 - EPS);
  for (let y = Y0; y <= Y1; y++) for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) {
    const id = world.getBlock(x, y, z);
    if (id === 0) continue;
    const boxes = collisionBoxes(id, id === B.DOOR_LOWER || id === B.DOOR_UPPER || id === B.TORCH ? world.getMeta(x, y, z) : 0);
    if (!boxes) continue;
    for (const bx of boxes) {
      const bx0 = x + bx[0] / 16, by0 = y + bx[1] / 16, bz0 = z + bx[2] / 16;
      const bx1 = x + bx[3] / 16, by1 = y + bx[4] / 16, bz1 = z + bx[5] / 16;
      if (axis === 0) {
        if (maxy <= by0 + EPS || miny >= by1 - EPS || maxz <= bz0 + EPS || minz >= bz1 - EPS) continue;
        if (d > 0 && bx0 >= maxx - EPS) d = Math.min(d, bx0 - maxx);
        else if (d < 0 && bx1 <= minx + EPS) d = Math.max(d, bx1 - minx);
      } else if (axis === 1) {
        if (maxx <= bx0 + EPS || minx >= bx1 - EPS || maxz <= bz0 + EPS || minz >= bz1 - EPS) continue;
        if (d > 0 && by0 >= maxy - EPS) d = Math.min(d, by0 - maxy);
        else if (d < 0 && by1 <= miny + EPS) d = Math.max(d, by1 - miny);
      } else {
        if (maxx <= bx0 + EPS || minx >= bx1 - EPS || maxy <= by0 + EPS || miny >= by1 - EPS) continue;
        if (d > 0 && bz0 >= maxz - EPS) d = Math.min(d, bz0 - maxz);
        else if (d < 0 && bz1 <= minz + EPS) d = Math.max(d, bz1 - minz);
      }
    }
  }
  return d;
}

/** Tests whether the body's box overlaps any collision box (used for placement and sneak edges). */
export function overlapsSolid(world: World, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
  for (let y = Math.floor(y0); y <= Math.floor(y1 - EPS); y++) for (let z = Math.floor(z0); z <= Math.floor(z1 - EPS); z++) for (let x = Math.floor(x0); x <= Math.floor(x1 - EPS); x++) {
    const id = world.getBlock(x, y, z);
    if (id === 0) continue;
    const boxes = collisionBoxes(id, world.getMeta(x, y, z));
    if (!boxes) continue;
    for (const b of boxes) {
      if (x1 > x + b[0] / 16 + EPS && x0 < x + b[3] / 16 - EPS && y1 > y + b[1] / 16 + EPS && y0 < y + b[4] / 16 - EPS && z1 > z + b[2] / 16 + EPS && z0 < z + b[5] / 16 - EPS) return true;
    }
  }
  return false;
}

export function moveBody(world: World, b: Body, dt: number, sneakEdge = false) {
  let dx = b.vx * dt, dy = b.vy * dt, dz = b.vz * dt;
  if (sneakEdge && b.onGround) {
    const step = 0.05;
    const hasGround = (ox: number, oz: number) => overlapsSolid(world, b.x - b.hw + ox, b.y - 0.6, b.z - b.hw + oz, b.x + b.hw + ox, b.y, b.z + b.hw + oz);
    while (dx !== 0 && !hasGround(dx, 0)) { dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step; }
    while (dz !== 0 && !hasGround(0, dz)) { dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step; }
    while (dx !== 0 && dz !== 0 && !hasGround(dx, dz)) { dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step; dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step; }
  }
  const ody = dy, odx = dx, odz = dz;
  dy = clip(world, b, 1, dy); b.y += dy;
  dx = clip(world, b, 0, dx); b.x += dx;
  dz = clip(world, b, 2, dz); b.z += dz;
  b.onGround = ody < 0 && Math.abs(dy - ody) > 1e-6;
  if (Math.abs(dy - ody) > 1e-6) b.vy = 0;
  b.hitX = Math.abs(dx - odx) > 1e-6; if (b.hitX) b.vx = 0;
  b.hitZ = Math.abs(dz - odz) > 1e-6; if (b.hitZ) b.vz = 0;
  // liquids / hazards
  b.inWater = false; b.inMagma = false; b.touchCactus = false;
  const x0 = Math.floor(b.x - b.hw), x1 = Math.floor(b.x + b.hw), z0 = Math.floor(b.z - b.hw), z1 = Math.floor(b.z + b.hw);
  for (let y = Math.floor(b.y); y <= Math.floor(b.y + b.h * 0.6); y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const id = world.getBlock(x, y, z);
    if (id === B.WATER) b.inWater = true;
    else if (id === B.MAGMA) b.inMagma = true;
  }
  for (let y = Math.floor(b.y - 0.05); y <= Math.floor(b.y + b.h); y++) for (let z = Math.floor(b.z - b.hw - 0.05); z <= Math.floor(b.z + b.hw + 0.05); z++) for (let x = Math.floor(b.x - b.hw - 0.05); x <= Math.floor(b.x + b.hw + 0.05); x++) {
    if (world.getBlock(x, y, z) === B.CACTUS) b.touchCactus = true;
  }
  b.headInWater = world.getBlock(Math.floor(b.x), Math.floor(b.y + b.h - 0.15), Math.floor(b.z)) === B.WATER;
}
