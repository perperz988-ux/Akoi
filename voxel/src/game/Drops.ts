// Dropped item entities: physics, merging, magnet pickup. Meshes are pooled per item id.
import * as THREE from 'three';
import { BLOCKS, SHAPE_CUBE, faceTile, ATLAS_CELL, ATLAS_COLS, ATLAS_SIZE, ATLAS_TILE } from '../world/Blocks';
import type { World, Stack } from '../world/World';
import { Body, makeBody, moveBody } from './Physics';
import { item, itemCanvas } from './Items';

export interface Drop { stack: Stack; body: Body; age: number; mesh: THREE.Object3D; pickupDelay: number; spin: number }

const TS = ATLAS_TILE / ATLAS_SIZE, PAD = (ATLAS_CELL - ATLAS_TILE) / 2 / ATLAS_SIZE, CS = ATLAS_CELL / ATLAS_SIZE;

/** Cube geometry textured with a block's atlas tiles (used for drops and the held block). */
export function blockGeometry(id: number, size: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(size, size, size);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 verts each)
  for (let f = 0; f < 6; f++) {
    const t = faceTile(id, f, 0);
    const u0 = (t % ATLAS_COLS) * CS + PAD, v0 = Math.floor(t / ATLAS_COLS) * CS + PAD;
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, u0 + uv.getX(i) * TS, v0 + (1 - uv.getY(i)) * TS);
    }
  }
  return g;
}

export class DropManager {
  drops: Drop[] = [];
  group = new THREE.Group();
  private geoCache = new Map<number, THREE.BufferGeometry>();
  private matCache = new Map<number, THREE.Material>();
  private pool = new Map<number, THREE.Object3D[]>();
  private blockMat: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, atlas: THREE.Texture, private world: () => World) {
    scene.add(this.group);
    this.blockMat = new THREE.MeshLambertMaterial({ map: atlas, alphaTest: 0.5 });
  }

  private makeMesh(id: number): THREE.Object3D {
    const list = this.pool.get(id);
    if (list && list.length) return list.pop()!;
    const d = item(id);
    if (d.block !== undefined && BLOCKS[d.block]?.shape === SHAPE_CUBE) {
      let g = this.geoCache.get(id);
      if (!g) { g = blockGeometry(d.block, 0.28); this.geoCache.set(id, g); }
      const m = new THREE.Mesh(g, this.blockMat); m.castShadow = true; return m;
    }
    let mat = this.matCache.get(id);
    if (!mat) {
      const tex = new THREE.CanvasTexture(itemCanvas(id));
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide });
      this.matCache.set(id, mat);
    }
    let g = this.geoCache.get(-1);
    if (!g) { g = new THREE.PlaneGeometry(0.42, 0.42); this.geoCache.set(-1, g); }
    const m = new THREE.Mesh(g, mat);
    return m;
  }

  spawn(x: number, y: number, z: number, stack: Stack, vx = (Math.random() - 0.5) * 3, vy = 4, vz = (Math.random() - 0.5) * 3, delay = 0.4) {
    const body = makeBody(0.14, 0.28);
    body.x = x; body.y = y; body.z = z; body.vx = vx; body.vy = vy; body.vz = vz;
    const mesh = this.makeMesh(stack.id);
    this.group.add(mesh);
    this.drops.push({ stack: { ...stack }, body, age: 0, mesh, pickupDelay: delay, spin: Math.random() * 6 });
  }

  private release(d: Drop) {
    this.group.remove(d.mesh);
    const list = this.pool.get(d.stack.id) || [];
    if (list.length < 16) list.push(d.mesh);
    this.pool.set(d.stack.id, list);
  }

  clear() { for (const d of this.drops) this.release(d); this.drops = []; }

  /** pickup returns how many items were taken from a stack offered to the player. */
  update(dt: number, px: number, py: number, pz: number, alive: boolean, pickup: (s: Stack) => number) {
    const w = this.world();
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt; d.pickupDelay -= dt;
      const b = d.body;
      if (d.age > 300 || b.y < -30) { this.release(d); this.drops.splice(i, 1); continue; }
      if (!w.isLoaded(Math.floor(b.x), Math.floor(b.z))) continue;
      const dx = px - b.x, dy = py + 0.8 - b.y, dz = pz - b.z;
      const dist = Math.hypot(dx, dy, dz);
      if (alive && d.pickupDelay <= 0 && dist < 2.2) {
        b.vx += (dx / dist) * dt * 30; b.vy += (dy / dist) * dt * 30; b.vz += (dz / dist) * dt * 30;
        if (dist < 0.9) {
          const taken = pickup(d.stack);
          if (taken > 0) {
            d.stack.count -= taken;
            if (d.stack.count <= 0) { this.release(d); this.drops.splice(i, 1); continue; }
          }
        }
      }
      b.vy -= 20 * dt;
      if (b.inWater) b.vy = Math.min(b.vy + 30 * dt, 1.5);
      b.vx *= b.onGround ? 1 - Math.min(1, dt * 8) : 1 - dt; b.vz *= b.onGround ? 1 - Math.min(1, dt * 8) : 1 - dt;
      moveBody(w, b, dt);
      if (b.inMagma) { this.release(d); this.drops.splice(i, 1); continue; }
      d.spin += dt * 1.8;
      d.mesh.position.set(b.x, b.y + 0.18 + Math.sin(d.age * 2.5) * 0.05, b.z);
      d.mesh.rotation.y = d.spin;
      const l = w.getLight(Math.floor(b.x), Math.floor(b.y + 0.2), Math.floor(b.z));
      (d.mesh as any).userData.light = l;
    }
    // merge nearby identical stacks (cheap, a few per frame)
    for (let k = 0; k < Math.min(4, this.drops.length); k++) {
      const a = this.drops[Math.floor(Math.random() * this.drops.length)];
      for (const o of this.drops) {
        if (o === a || o.stack.id !== a.stack.id || o.stack.dur !== undefined) continue;
        if (Math.abs(o.body.x - a.body.x) < 0.8 && Math.abs(o.body.y - a.body.y) < 0.8 && Math.abs(o.body.z - a.body.z) < 0.8 && a.stack.count + o.stack.count <= item(a.stack.id).maxStack) {
          a.stack.count += o.stack.count; o.stack.count = 0;
          this.release(o); this.drops.splice(this.drops.indexOf(o), 1);
          break;
        }
      }
    }
  }
}
