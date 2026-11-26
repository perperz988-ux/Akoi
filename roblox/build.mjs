// Construye roblox/PortSolano.rbxl a partir del generador original de la ciudad (src/world).
//   node roblox/build.mjs
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(tmpdir(), "portsolano-build-place.mjs");
await build({
  entryPoints: [join(root, "tools/build-place.ts")],
  bundle: true, platform: "node", format: "esm", outfile: out, logLevel: "warning",
});
execFileSync(process.execPath, [out], { stdio: "inherit", env: { ...process.env, ROBLOX_DIR: root } });
