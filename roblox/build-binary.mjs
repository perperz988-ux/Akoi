// Genera PortSolano.rbxl (formato binario de Roblox, sin comprimir) desde roblox/src.
//   node roblox/build-binary.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");

// --- arbol de instancias ---
const insts = [];
function add(cls, name, parent, props = {}, service = false) {
  const inst = { ref: insts.length, cls, name, parent, props, service };
  insts.push(inst);
  return inst;
}
function addScripts(sub, parent) {
  for (const f of readdirSync(join(src, sub)).filter((f) => f.endsWith(".luau")).sort()) {
    const source = readFileSync(join(src, sub, f), "utf8");
    let cls = "ModuleScript", name = f.replace(/\.luau$/, "");
    if (name.endsWith(".server")) { cls = "Script"; name = name.slice(0, -7); }
    else if (name.endsWith(".client")) { cls = "LocalScript"; name = name.slice(0, -7); }
    add(cls, name, parent, { Source: source });
  }
}
add("Workspace", "Workspace", null, {}, true);
add("Lighting", "Lighting", null, {}, true);
addScripts("ReplicatedStorage", add("ReplicatedStorage", "ReplicatedStorage", null, {}, true));
addScripts("ServerScriptService", add("ServerScriptService", "ServerScriptService", null, {}, true));
const sp = add("StarterPlayer", "StarterPlayer", null, {}, true);
addScripts("StarterPlayerScripts", add("StarterPlayerScripts", "StarterPlayerScripts", sp));

// --- utilidades binarias ---
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const u8 = (n) => Buffer.from([n]);
const str = (s) => { const b = Buffer.from(s, "utf8"); return Buffer.concat([u32(b.length), b]); };
function interleavedI32(values, delta = false) {
  const n = values.length;
  const out = Buffer.alloc(n * 4);
  let prev = 0;
  values.forEach((v, i) => {
    let x = delta ? v - prev : v;
    prev = v;
    const z = ((x << 1) ^ (x >> 31)) >>> 0; // zigzag
    for (let k = 0; k < 4; k++) out[k * n + i] = (z >>> (24 - 8 * k)) & 0xff; // big-endian, intercalado
  });
  return out;
}
function chunk(name, data) {
  const nb = Buffer.alloc(4);
  nb.write(name, "ascii");
  return Buffer.concat([nb, u32(0), u32(data.length), u32(0), data]); // sin comprimir
}

// --- chunks ---
const classes = [...new Set(insts.map((i) => i.cls))];
const byClass = classes.map((c) => insts.filter((i) => i.cls === c));
const chunks = [];
chunks.push(chunk("META", Buffer.concat([u32(1), str("ExplicitAutoJoints"), str("true")])));
classes.forEach((cls, id) => {
  const list = byClass[id];
  const isService = list[0].service;
  const parts = [u32(id), str(cls), u8(isService ? 1 : 0), u32(list.length), interleavedI32(list.map((i) => i.ref), true)];
  if (isService) parts.push(Buffer.from(list.map(() => 1)));
  chunks.push(chunk("INST", Buffer.concat(parts)));
});
classes.forEach((cls, id) => {
  const list = byClass[id];
  chunks.push(chunk("PROP", Buffer.concat([u32(id), str("Name"), u8(0x01), ...list.map((i) => str(i.name))])));
  if (list[0].props.Source !== undefined) {
    chunks.push(chunk("PROP", Buffer.concat([u32(id), str("Source"), u8(0x01), ...list.map((i) => str(i.props.Source))])));
  }
});
chunks.push(chunk("PRNT", Buffer.concat([
  u8(0), u32(insts.length),
  interleavedI32(insts.map((i) => i.ref), true),
  interleavedI32(insts.map((i) => (i.parent ? i.parent.ref : -1)), true),
])));
chunks.push(chunk("END\0", Buffer.from("</roblox>", "ascii")));

const header = Buffer.concat([
  Buffer.from("<roblox!", "ascii"), Buffer.from([0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from([0, 0]), u32(classes.length), u32(insts.length), Buffer.alloc(8),
]);
const file = Buffer.concat([header, ...chunks]);
const out = join(root, "PortSolano.rbxl");
writeFileSync(out, file);
console.log(`OK -> ${out} (${(file.length / 1024).toFixed(1)} KB, ${insts.length} instancias, ${classes.length} clases)`);
