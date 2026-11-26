// Empaqueta roblox/src en PortSolano.rbxlx (archivo de lugar de Roblox en XML).
//   node roblox/build.mjs
// ReplicatedStorage/*.luau          -> ModuleScript
// ServerScriptService/*.server.luau -> Script
// StarterPlayerScripts/*.client.luau -> LocalScript (StarterPlayer > StarterPlayerScripts)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");
let ref = 0;
const nextRef = () => `RBX${(ref++).toString(16).toUpperCase().padStart(8, "0")}`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function scriptItem(file, dir) {
  const source = readFileSync(join(dir, file), "utf8");
  if (source.includes("]]>")) throw new Error(`${file} contiene "]]>"`);
  let cls = "ModuleScript";
  let name = file.replace(/\.luau$/, "");
  if (name.endsWith(".server")) { cls = "Script"; name = name.slice(0, -7); }
  else if (name.endsWith(".client")) { cls = "LocalScript"; name = name.slice(0, -7); }
  return `<Item class="${cls}" referent="${nextRef()}"><Properties>` +
    `<string name="Name">${esc(name)}</string>` +
    (cls === "ModuleScript" ? "" : `<bool name="Disabled">false</bool>`) +
    `<ProtectedString name="Source"><![CDATA[${source}]]></ProtectedString>` +
    `</Properties></Item>`;
}

function folderScripts(sub) {
  const dir = join(src, sub);
  return readdirSync(dir).filter((f) => f.endsWith(".luau")).sort().map((f) => scriptItem(f, dir)).join("\n");
}

const service = (cls, children = "") =>
  `<Item class="${cls}" referent="${nextRef()}"><Properties><string name="Name">${cls}</string></Properties>\n${children}\n</Item>`;

const xml = `<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">
${service("Workspace")}
${service("Lighting")}
${service("ReplicatedStorage", folderScripts("ReplicatedStorage"))}
${service("ServerScriptService", folderScripts("ServerScriptService"))}
${service("StarterPlayer", service("StarterPlayerScripts", folderScripts("StarterPlayerScripts")))}
</roblox>
`;
const out = join(root, "PortSolano.rbxlx");
writeFileSync(out, xml);
console.log(`OK -> ${out} (${(xml.length / 1024).toFixed(1)} KB)`);
