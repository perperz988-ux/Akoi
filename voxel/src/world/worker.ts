// Background world worker: terrain generation and chunk lighting/meshing.
import { Generator } from './Generator';
import { meshChunk, GeomData } from './Mesher';

const gens = new Map<number, Generator>();
function gen(seed: number) {
  let g = gens.get(seed);
  if (!g) { g = new Generator(seed); gens.set(seed, g); }
  return g;
}

function geomBuffers(g: GeomData | null, out: ArrayBuffer[]) {
  if (!g) return;
  out.push(g.pos.buffer as ArrayBuffer, g.nor.buffer as ArrayBuffer, g.uv.buffer as ArrayBuffer, g.col.buffer as ArrayBuffer, g.lig.buffer as ArrayBuffer, g.idx.buffer as ArrayBuffer);
}

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'gen') {
    const r = gen(m.seed).generateChunk(m.cx, m.cz, m.dim || 0);
    (self as any).postMessage({ type: 'gen', uid: m.uid, cx: m.cx, cz: m.cz, blocks: r.blocks, meta: r.meta }, [r.blocks.buffer, r.meta.buffer]);
  } else if (m.type === 'mesh') {
    const r = meshChunk(m.cx, m.cz, m.blocks, m.metas, m.lod, m.fancy);
    const tr: ArrayBuffer[] = [];
    for (const s of r.sections) { geomBuffers(s.o, tr); geomBuffers(s.c, tr); geomBuffers(s.w, tr); }
    if (r.light) tr.push(r.light.buffer as ArrayBuffer);
    (self as any).postMessage({ type: 'mesh', uid: m.uid, cx: m.cx, cz: m.cz, lod: m.lod, version: m.version, sections: r.sections, conn: r.conn, light: r.light }, tr);
  }
};
