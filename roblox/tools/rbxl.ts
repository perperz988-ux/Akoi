// Escritor minimo del formato binario de Roblox (.rbxl), sin compresion.
// Soporta los tipos de propiedad que usamos: string, bool, float, Vector3, CFrame, enum y Color3uint8.

export type PropValue =
  | { t: 'string'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'float'; v: number }
  | { t: 'vector3'; v: [number, number, number] }
  | { t: 'cframe'; v: { p: [number, number, number]; r?: number[] } } // r: matriz 3x3 por filas (omitida = identidad)
  | { t: 'enum'; v: number }
  | { t: 'color3uint8'; v: [number, number, number] };

export interface Inst {
  cls: string;
  props: Record<string, PropValue>;
  parent: Inst | null;
  service?: boolean;
  ref?: number;
}

const TYPE_ID: Record<PropValue['t'], number> = {
  string: 0x01, bool: 0x02, float: 0x04, vector3: 0x0e, cframe: 0x10, enum: 0x12, color3uint8: 0x1a,
};

class Writer {
  parts: Buffer[] = [];
  u8(n: number) { this.parts.push(Buffer.from([n & 0xff])); }
  u32(n: number) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); this.parts.push(b); }
  f32(n: number) { const b = Buffer.alloc(4); b.writeFloatLE(n); this.parts.push(b); }
  bytes(b: Buffer) { this.parts.push(b); }
  str(s: string) { const b = Buffer.from(s, 'utf8'); this.u32(b.length); this.parts.push(b); }
  done() { return Buffer.concat(this.parts); }
}

function interleave(words: number[]): Buffer {
  const n = words.length, out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const w = words[i] >>> 0;
    out[i] = (w >>> 24) & 0xff; out[n + i] = (w >>> 16) & 0xff; out[2 * n + i] = (w >>> 8) & 0xff; out[3 * n + i] = w & 0xff;
  }
  return out;
}
const zigzag = (x: number) => ((x << 1) ^ (x >> 31)) >>> 0;
function refs(values: number[]): Buffer {
  let prev = 0;
  return interleave(values.map((v) => { const d = v - prev; prev = v; return zigzag(d); }));
}
const fbuf = Buffer.alloc(4);
function rbxFloat(f: number) {
  fbuf.writeFloatBE(f);
  const bits = fbuf.readUInt32BE(0);
  return ((bits << 1) | (bits >>> 31)) >>> 0;
}

function chunk(name: string, data: Buffer) {
  const head = Buffer.alloc(16);
  head.write(name, 0, 'ascii');
  head.writeUInt32LE(0, 4); // sin comprimir
  head.writeUInt32LE(data.length, 8);
  return Buffer.concat([head, data]);
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function propChunk(classId: string | number, name: string, list: Inst[]): Buffer {
  const first = list[0].props[name];
  const w = new Writer();
  w.u32(classId as number); w.str(name); w.u8(TYPE_ID[first.t]);
  const vals = list.map((i) => {
    const p = i.props[name];
    if (!p || p.t !== first.t) throw new Error(`Propiedad ${name} inconsistente en ${i.cls}`);
    return p.v as any;
  });
  switch (first.t) {
    case 'string': for (const v of vals) w.str(v); break;
    case 'bool': w.bytes(Buffer.from(vals.map((v) => (v ? 1 : 0)))); break;
    case 'float': w.bytes(interleave(vals.map(rbxFloat))); break;
    case 'vector3':
      for (let k = 0; k < 3; k++) w.bytes(interleave(vals.map((v) => rbxFloat(v[k]))));
      break;
    case 'cframe':
      for (const v of vals) {
        const r: number[] = v.r ?? IDENTITY;
        if (r.every((x, i) => x === IDENTITY[i])) w.u8(0x02);
        else { w.u8(0x00); for (const x of r) w.f32(x); }
      }
      for (let k = 0; k < 3; k++) w.bytes(interleave(vals.map((v) => rbxFloat(v.p[k]))));
      break;
    case 'enum': w.bytes(interleave(vals.map((v) => v >>> 0))); break;
    case 'color3uint8':
      for (let k = 0; k < 3; k++) w.bytes(Buffer.from(vals.map((v) => Math.max(0, Math.min(255, Math.round(v[k]))))));
      break;
  }
  return chunk('PROP', w.done());
}

export function writeRbxl(insts: Inst[]): Buffer {
  insts.forEach((inst, i) => (inst.ref = i));
  const classes = [...new Set(insts.map((i) => i.cls))];
  const byClass = classes.map((c) => insts.filter((i) => i.cls === c));
  const chunks: Buffer[] = [];
  {
    const w = new Writer(); w.u32(1); w.str('ExplicitAutoJoints'); w.str('true');
    chunks.push(chunk('META', w.done()));
  }
  classes.forEach((cls, id) => {
    const list = byClass[id];
    const svc = !!list[0].service;
    const w = new Writer();
    w.u32(id); w.str(cls); w.u8(svc ? 1 : 0); w.u32(list.length);
    w.bytes(refs(list.map((i) => i.ref!)));
    if (svc) w.bytes(Buffer.from(list.map(() => 1)));
    chunks.push(chunk('INST', w.done()));
  });
  classes.forEach((cls, id) => {
    const list = byClass[id];
    for (const name of Object.keys(list[0].props)) chunks.push(propChunk(id, name, list));
  });
  {
    const w = new Writer();
    w.u8(0); w.u32(insts.length);
    w.bytes(refs(insts.map((i) => i.ref!)));
    w.bytes(refs(insts.map((i) => (i.parent ? i.parent.ref! : -1))));
    chunks.push(chunk('PRNT', w.done()));
  }
  chunks.push(chunk('END\0', Buffer.from('</roblox>', 'ascii')));
  const header = Buffer.concat([
    Buffer.from('<roblox!', 'ascii'), Buffer.from([0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0, 0]), (() => { const b = Buffer.alloc(8); b.writeUInt32LE(classes.length, 0); b.writeUInt32LE(insts.length, 4); return b; })(),
    Buffer.alloc(8),
  ]);
  return Buffer.concat([header, ...chunks]);
}

// Atajos
export const S = (v: string): PropValue => ({ t: 'string', v });
export const B = (v: boolean): PropValue => ({ t: 'bool', v });
export const F = (v: number): PropValue => ({ t: 'float', v });
export const V3 = (x: number, y: number, z: number): PropValue => ({ t: 'vector3', v: [x, y, z] });
export const CF = (x: number, y: number, z: number, r?: number[]): PropValue => ({ t: 'cframe', v: { p: [x, y, z], r } });
export const E = (v: number): PropValue => ({ t: 'enum', v });
export const C3 = (r: number, g: number, b: number): PropValue => ({ t: 'color3uint8', v: [r, g, b] });
