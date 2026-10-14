// Zips extension/dist for the Chrome Web Store: manifest.json at the root of
// the archive, only the files the extension uses, nothing else.
//
//   npm run package:extension   ->   release/nullify-extension-<version>.zip
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = `${root}extension/dist`;
const ALLOWED = new Set([".js", ".html", ".css", ".png", ".json"]);

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await files(path)));
    else out.push(relative(dist, path));
  }
  return out.sort();
}

const manifest = JSON.parse(await readFile(`${dist}/manifest.json`, "utf8"));
const list = await files(dist);
const unexpected = list.filter((f) => !ALLOWED.has(extname(f)));
if (unexpected.length) throw new Error(`unexpected files in extension/dist: ${unexpected.join(", ")}`);

// Everything the manifest points at must be in the package.
const referenced = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...Object.values(manifest.icons),
  ...Object.values(manifest.action.default_icon),
];
const missing = referenced.filter((f) => !list.includes(f));
if (missing.length) throw new Error(`manifest references missing files: ${missing.join(", ")}`);

await mkdir(`${root}release`, { recursive: true });
const zip = `${root}release/nullify-extension-${manifest.version}.zip`;
await rm(zip, { force: true });
// -X: no extra file attributes, so the archive only depends on the files' contents and names.
execFileSync("zip", ["-q", "-X", zip, ...list], { cwd: dist });

const { size } = await stat(zip);
console.log(`${relative(root, zip)}: ${list.length} files, ${(size / 1024).toFixed(1)} KB, manifest v${manifest.manifest_version}, version ${manifest.version}`);
