/**
 * NullBench comparison: what a person experiences on the human-facing attack
 * pages with no blocker, uBlock Origin Lite, Nullify, and both together.
 *
 * Each trap runs twice:
 *  - unknown destination: made-up *.test domains no filter list knows,
 *    like a new or rotated ad domain;
 *  - known destination: popads.net / popcash.net, pop-under ad networks on
 *    uBlock Origin Lite's default lists.
 * All names resolve to this machine (--host-resolver-rules); nothing is contacted.
 *
 *   gh release download <tag> --repo uBlockOrigin/uBOL-home --pattern "*.chromium.zip" --dir bench/.vendor/ubol/<tag>
 *   unzip bench/.vendor/ubol/<tag>/*.zip -d bench/.vendor/ubol/<tag>/extension
 *   npm run compare:ublock
 */
import { spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "@playwright/test";
import { ATTACKS, LEGIT, clicker, type AttackCase } from "../tests/cases.js";
import { EXTENSION_PATH } from "../tests/env.js";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PORT = 4180;
const BASE = `http://news.test:${PORT}`;
const HOST_RULES = "--host-resolver-rules=MAP *.test 127.0.0.1, MAP popads.net 127.0.0.1, MAP popcash.net 127.0.0.1";
const SETTLE_MS = 1500;

type Setup = "none" | "ubol" | "nullify" | "ubol+nullify";
type Dest = "unknown" | "known";
/** What the person ends up with. */
type Outcome = "prevented" | "tab-or-page-lost" | "hijacked";

const SETUPS: Array<{ id: Setup; label: string }> = [
  { id: "none", label: "No blocker" },
  { id: "ubol", label: "uBlock Origin Lite" },
  { id: "nullify", label: "Nullify" },
  { id: "ubol+nullify", label: "uBlock Origin Lite + Nullify" },
];

const OUTCOME_LABEL: Record<Outcome, string> = {
  prevented: "✅ prevented",
  "tab-or-page-lost": "🟡 ad blocked, but a tab opened / page replaced",
  hijacked: "❌ hijacked",
};

interface Row {
  setup: Setup;
  scenario: string;
  dest: Dest | "legit";
  outcome?: Outcome;
  completed?: boolean;
  detail?: string;
}

async function ubolPath(): Promise<{ path: string; version: string }> {
  const dir = `${ROOT}bench/.vendor/ubol`;
  const versions = (await readdir(dir).catch(() => [])).sort();
  const version = versions.at(-1);
  if (!version) throw new Error(`uBlock Origin Lite not found in ${dir}; see the download steps at the top of this file`);
  return { path: `${dir}/${version}/extension`, version };
}

async function launch(setup: Setup, ubol: string): Promise<BrowserContext> {
  const extensions = [
    ...(setup.includes("ubol") ? [ubol] : []),
    ...(setup.includes("nullify") ? [EXTENSION_PATH] : []),
  ];
  const args = [HOST_RULES];
  if (extensions.length) args.push(`--disable-extensions-except=${extensions.join(",")}`, `--load-extension=${extensions.join(",")}`);
  // The same full Chromium build for every setup, with or without extensions.
  return chromium.launchPersistentContext("", { channel: "chromium", args });
}

/** A persistent context has no Browser object (and the user agent freezes the version), so ask over CDP. */
async function chromeVersion(context: BrowserContext): Promise<string> {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const { product } = await cdp.send("Browser.getVersion");
  await cdp.detach();
  await page.close();
  return product.replace(/^[^/]*\//, "");
}

/** Wait until each installed extension is actually filtering. */
async function warmUp(context: BrowserContext, setup: Setup): Promise<void> {
  const page = await context.newPage();
  if (setup.includes("ubol")) {
    // uBlock registers its page-blocking rules at startup; poll until a listed domain is blocked.
    for (let i = 0; i < 40; i++) {
      await page.goto(`http://popads.net:${PORT}/landing.html`).catch(() => {});
      if (page.url().startsWith("chrome-extension://")) break;
      await page.waitForTimeout(250);
    }
  }
  if (setup.includes("nullify")) {
    for (let i = 0; i < 40; i++) {
      await page.goto(`${BASE}/hello.html`);
      if ((await page.textContent("#status")) === "nullify: extension") break;
      await page.waitForTimeout(250);
    }
  }
  await page.close();
}

const withDest = (path: string, dest: Dest) => (dest === "known" ? `${path}${path.includes("?") ? "&" : "?"}dest=known` : path);
const blockerPage = (url: string) => url.startsWith("chrome-extension://");

async function runAttack(context: BrowserContext, setup: Setup, c: AttackCase, dest: Dest): Promise<Row> {
  const page = await context.newPage();
  const popups: Page[] = [];
  page.on("popup", (p) => popups.push(p));
  await page.goto(BASE + withDest(c.path, dest));
  try {
    await c.act(page, clicker(page, "vision"));
  } catch (error) {
    return { setup, scenario: c.id, dest, outcome: "prevented", detail: `click failed: ${(error as Error).message.split("\n")[0]}` };
  }
  await page.waitForTimeout(SETTLE_MS);

  let outcome: Outcome;
  if (c.kind === "redirect") {
    const url = page.url();
    outcome = url.startsWith(BASE) ? "prevented" : blockerPage(url) ? "tab-or-page-lost" : "hijacked";
  } else {
    const open = popups.filter((p) => !p.isClosed()).map((p) => p.url());
    outcome = open.length === 0 ? "prevented" : open.every(blockerPage) ? "tab-or-page-lost" : "hijacked";
  }
  for (const p of popups) await p.close().catch(() => {});
  await page.close();
  return { setup, scenario: c.id, dest, outcome };
}

async function runLegit(context: BrowserContext, setup: Setup, c: (typeof LEGIT)[number]): Promise<Row> {
  const page = await context.newPage();
  await page.goto(BASE + c.path);
  try {
    await c.check(page, clicker(page, "vision"));
    return { setup, scenario: c.id, dest: "legit", completed: true };
  } catch (error) {
    return { setup, scenario: c.id, dest: "legit", completed: false, detail: (error as Error).message.split("\n")[0] };
  } finally {
    for (const p of context.pages()) if (p !== page && !p.url().startsWith("about:")) await p.close().catch(() => {});
    await page.close().catch(() => {});
  }
}

function report(rows: Row[], meta: Record<string, string>): string {
  const attacks = ATTACKS.filter((a) => !a.agentOnly);
  const L: string[] = [];
  L.push("# NullBench: Nullify vs uBlock Origin Lite", "");
  L.push(`${meta.date} · Chromium ${meta.chromium} · uBlock Origin Lite ${meta.ubol} (default settings) · ${attacks.length} human-facing traps × 2 destinations, ${LEGIT.length} normal flows`, "");
  L.push(
    "Every trap is clicked the way a person would (real mouse). Each runs twice: once sending you to a **made-up domain no filter list knows** (like a new or rotated ad domain), and once to **pop-under ad networks on uBlock Origin Lite's default lists** (popads.net, popcash.net). Every name resolves to this machine, so nothing is contacted.",
    "",
  );

  const count = (setup: Setup, dest: Dest, outcome: Outcome) =>
    rows.filter((r) => r.setup === setup && r.dest === dest && r.outcome === outcome).length;
  L.push("## What the person ends up with", "");
  L.push("| Protection | Unknown ad domain: prevented / ad blocked but tab or page lost / hijacked | Known ad network: prevented / ad blocked but tab or page lost / hijacked |", "|---|---|---|");
  for (const s of SETUPS) {
    const cell = (d: Dest) => `${count(s.id, d, "prevented")} / ${count(s.id, d, "tab-or-page-lost")} / ${count(s.id, d, "hijacked")}`;
    L.push(`| ${s.label} | ${cell("unknown")} | ${cell("known")} |`);
  }
  L.push("", `Out of ${attacks.length} traps per column.`, "");

  L.push("## Normal flows still working", "", "| Protection | Completed |", "|---|---|");
  for (const s of SETUPS) {
    const legit = rows.filter((r) => r.setup === s.id && r.dest === "legit");
    L.push(`| ${s.label} | ${legit.filter((r) => r.completed).length}/${legit.length} |`);
  }

  L.push("", "## Per trap", "");
  L.push(`| Trap | Destination | ${SETUPS.map((s) => s.label).join(" | ")} |`, `|---|---|${SETUPS.map(() => "---").join("|")}|`);
  for (const a of attacks) {
    for (const d of ["unknown", "known"] as const) {
      const cells = SETUPS.map((s) => {
        const r = rows.find((x) => x.setup === s.id && x.scenario === a.id && x.dest === d);
        return r?.outcome ? OUTCOME_LABEL[r.outcome].split(",")[0]! : "";
      });
      L.push(`| ${a.name} | ${d} | ${cells.join(" | ")} |`);
    }
  }

  L.push("", "## How to read this", "");
  L.push(
    "- **uBlock Origin Lite works from lists.** On a listed ad network it blocks the ad's content, but a pop-up tab still opens (showing its warning page) and a same-tab redirect still replaces the page you were on. On a domain its lists don't know yet, nothing stops the trap.",
    "- **Nullify works from behaviour.** It refuses the pop-up or redirect itself, so no tab opens and the page stays, whatever the destination.",
    "- **They are complementary.** uBlock Origin Lite also blocks ads, trackers and malware on the pages you visit, which Nullify doesn't try to do. Running both is the intended setup.",
    "- **Limits:** these are hand-built pages, not captures of real sites. uBlock Origin Lite's cosmetic filters and site-specific scriptlets target known sites, so they can't apply to pages like these, which no list has seen. This comparison is about **new or rotated domains and the click itself**, not about overall ad blocking.",
  );
  const failures = rows.filter((r) => r.completed === false);
  if (failures.length) {
    L.push("", "## Normal flows that failed", "");
    for (const f of failures) L.push(`- ${f.setup} · ${f.scenario}: ${f.detail ?? ""}`);
  }
  return L.join("\n") + "\n";
}

async function main(): Promise<void> {
  const { path: ubol, version } = await ubolPath();
  const server = spawn("node", ["bench/server.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  try {
    for (let i = 0; i < 50 && !(await fetch(`http://127.0.0.1:${PORT}/hello.html`).then((r) => r.ok, () => false)); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const rows: Row[] = [];
    let chromiumVersion = "";
    // One browser per setup, run side by side; scenarios run one at a time inside each.
    await Promise.all(SETUPS.map(async ({ id: setup }) => {
      const context = await launch(setup, ubol);
      chromiumVersion ||= await chromeVersion(context);
      await warmUp(context, setup);
      for (const c of ATTACKS.filter((a) => !a.agentOnly)) {
        for (const dest of ["unknown", "known"] as const) rows.push(await runAttack(context, setup, c, dest));
      }
      for (const c of LEGIT) rows.push(await runLegit(context, setup, c));
      await context.close();
      process.stderr.write(`  ${setup} done\n`);
    }));

    const meta = {
      date: new Date().toISOString().slice(0, 10),
      chromium: chromiumVersion,
      ubol: version,
    };
    await mkdir(`${ROOT}bench/results`, { recursive: true });
    await writeFile(`${ROOT}bench/results/compare-ublock.json`, JSON.stringify({ meta, rows }, null, 2) + "\n");
    const md = report(rows, meta);
    await writeFile(`${ROOT}bench/results/compare-ublock.md`, md);
    process.stdout.write(md);
  } finally {
    server.kill();
  }
}

await main();
