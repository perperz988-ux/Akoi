// Loads the bundled CC0 glTF models (see CREDITS in README) and hands out clones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const URLS = import.meta.glob('./models/*.glb', { eager: true, query: '?url', import: 'default' });
export const MODELS = {};

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader(); const entries = Object.entries(URLS); let done = 0;
  await Promise.all(entries.map(async ([path, url]) => {
    const name = path.split('/').pop().replace('.glb', '');
    try {
      const g = await loader.loadAsync(url);
      g.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of ms) { if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; m.side = THREE.FrontSide; }
        }
      });
      const box = new THREE.Box3().setFromObject(g.scene);
      MODELS[name] = { scene: g.scene, animations: g.animations, box, size: box.getSize(new THREE.Vector3()) };
    } catch (e) { console.warn('model failed', name, e); }
    done++; onProgress && onProgress(done / entries.length);
  }));
  return MODELS;
}

// Clone a model. opts.height scales it to a target height, opts.tint multiplies colours, opts.skinned uses SkeletonUtils.
export function model(name, opts = {}) {
  const m = MODELS[name]; if (!m) { const g = new THREE.Group(); g.userData.missing = true; return g; }
  const obj = opts.skinned ? skClone(m.scene) : m.scene.clone(true);
  if (opts.tint || opts.cloneMat) {
    const tint = opts.tint ? new THREE.Color(opts.tint) : null;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const clone = (mt) => { const c = mt.clone(); if (tint) c.color.multiply(tint); if (opts.emissive) { c.emissive = new THREE.Color(opts.emissive); c.emissiveIntensity = opts.emissiveIntensity || 0.4; } if (opts.metal != null) { c.metalness = opts.metal; c.roughness = opts.rough ?? 0.35; } return c; };
      o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
    });
  }
  const wrap = new THREE.Group(); wrap.add(obj);
  let s = opts.scale || 1;
  if (opts.height) s = opts.height / m.size.y;
  if (opts.length) s = opts.length / Math.max(m.size.x, m.size.z);
  obj.scale.setScalar(s);
  if (opts.ground !== false) obj.position.y = -m.box.min.y * s;
  if (opts.center) { obj.position.x = -(m.box.min.x + m.box.max.x) / 2 * s; obj.position.z = -(m.box.min.z + m.box.max.z) / 2 * s; }
  wrap.userData.inner = obj; wrap.userData.animations = m.animations; wrap.userData.scale = s;
  return wrap;
}
export const has = (n) => !!MODELS[n];
