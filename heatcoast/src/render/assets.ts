import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
// CC0 assets from @pmndrs/assets (Poly Haven HDRIs resized to 512px, seamless CC0 normal maps). See ASSETS.md.
import nAsphalt from '@pmndrs/assets/normals/0015.webp.js';
import nConcrete from '@pmndrs/assets/normals/0003.webp.js';
import nPlaster from '@pmndrs/assets/normals/0010.webp.js';
import nCloth from '@pmndrs/assets/normals/0020.webp.js';

const loader = new THREE.TextureLoader();
function nm(url: string, rep: number) { const t = loader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 4; t.colorSpace = THREE.NoColorSpace; return t; }
export const NORMALS = { asphalt: nm(nAsphalt, 1), concrete: nm(nConcrete, 1), plaster: nm(nPlaster, 1), cloth: nm(nCloth, 1) };

export type HdriName = 'city' | 'sunset' | 'sunrise' | 'night' | 'sky' | 'park';
const HDRI: Record<HdriName, () => Promise<{ default: string }>> = {
  city: () => import('@pmndrs/assets/hdri/city.exr.js'), sunset: () => import('@pmndrs/assets/hdri/sunset.exr.js'), sunrise: () => import('@pmndrs/assets/hdri/sunrise.exr.js'),
  night: () => import('@pmndrs/assets/hdri/night.exr.js'), sky: () => import('@pmndrs/assets/hdri/sky.exr.js'), park: () => import('@pmndrs/assets/hdri/park.exr.js'),
};
/** Loads all HDRIs and prefilters them for image-based lighting. */
export async function loadHdris(pmrem: THREE.PMREMGenerator): Promise<Partial<Record<HdriName, THREE.Texture>>> {
  const out: Partial<Record<HdriName, THREE.Texture>> = {}; const ex = new EXRLoader();
  await Promise.all((Object.keys(HDRI) as HdriName[]).map(async (k) => {
    try { const url = (await HDRI[k]()).default; const tex = await ex.loadAsync(url); tex.mapping = THREE.EquirectangularReflectionMapping; out[k] = pmrem.fromEquirectangular(tex).texture; tex.dispose(); }
    catch (e) { console.warn('HDRI failed', k, e); }
  }));
  return out;
}
