// Publica PortSolano.rbxlx en tu experiencia de Roblox con la API Open Cloud.
//   UNIVERSE_ID=... PLACE_ID=... ROBLOX_API_KEY=... node roblox/publish.mjs
// La API key se crea en create.roblox.com > Open Cloud > API Keys,
// con el permiso "universe-places: write" para tu experiencia.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const { UNIVERSE_ID, PLACE_ID, ROBLOX_API_KEY } = process.env;
if (!UNIVERSE_ID || !PLACE_ID) {
  console.error("Faltan UNIVERSE_ID y PLACE_ID");
  process.exit(1);
}
const file = join(dirname(fileURLToPath(import.meta.url)), "PortSolano.rbxlx");
const url = `https://apis.roblox.com/universes/v1/${UNIVERSE_ID}/places/${PLACE_ID}/versions?versionType=Published`;
const res = await fetch(url, {
  method: "POST",
  headers: { "x-api-key": ROBLOX_API_KEY || "placeholder", "Content-Type": "application/xml" },
  body: readFileSync(file),
});
const text = await res.text();
console.log(res.status, text);
process.exit(res.ok ? 0 : 1);
