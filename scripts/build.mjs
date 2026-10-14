// Bundles the browser-side artifacts. Library .js/.d.ts output comes from `tsc -b`.
import { build } from "esbuild";
import { copyFile, cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { makeIcons } from "./make-icons.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const browser = { bundle: true, target: "chrome120", logLevel: "info" };

// 1. Core as an injectable script exposing `Nullify` (used by Agent Guard and the crawler).
await build({
  ...browser,
  entryPoints: [`${root}core/src/index.ts`],
  outfile: `${root}core/dist/core.iife.js`,
  format: "iife",
  globalName: "Nullify",
});

// The Python package ships the same bundle.
await copyFile(`${root}core/dist/core.iife.js`, `${root}python/src/nullify_guard/core.iife.js`);

// 2. Extension scripts, each with core bundled in.
await mkdir(`${root}extension/dist`, { recursive: true });
await build({
  ...browser,
  entryPoints: ["main-world", "isolated", "service-worker", "popup", "replay"].map((n) => `${root}extension/src/${n}.ts`),
  outdir: `${root}extension/dist`,
  format: "iife",
});
await copyFile(`${root}extension/manifest.json`, `${root}extension/dist/manifest.json`);
await cp(`${root}extension/static`, `${root}extension/dist`, { recursive: true });
await makeIcons(`${root}extension/dist/icons`);

// 3. NullBench runner (Node); dependencies stay external and resolve from node_modules.
await build({
  entryPoints: { nullbench: `${root}bench/nullbench/run.ts`, compare: `${root}bench/nullbench/compare.ts` },
  outdir: `${root}bench/dist`,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  logLevel: "info",
});
