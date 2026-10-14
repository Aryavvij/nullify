/**
 * NullBench: attack success and task completion for different kinds of
 * browser agents, with and without Nullify, plus the overhead it adds.
 *
 * Agents here are scripted (they click exactly what the task says), so the
 * numbers measure the protection, not a model's judgement. Results go to
 * bench/results/latest.{md,json}.
 *
 *   npm run nullbench
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { fileURLToPath } from "node:url";
import { guard, type NullifyGuard } from "@nullifyads/agent-guard";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { ATTACKS, LEGIT, clicker, runCase, wasHijacked, type Driver } from "../tests/cases.js";
import { EXTENSION_PATH, HOST_RULES } from "../tests/env.js";

const PORT = 4176;
const BASE = `http://news.test:${PORT}`;
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RESULTS = `${ROOT}bench/results`;
const CONCURRENCY = 4;
/** Wait after each attack's click for anything it set off; popups can be slow under parallel load. */
const SETTLE_MS = 1500;
const OVERHEAD_CLICKS = 100;
const OVERHEAD_LOADS = 40;

type Protection = "none" | "nullify" | "extension";

interface Config {
  id: string;
  label: string;
  driver: Driver;
  protection: Protection;
}

const AGENT_LABEL: Record<Driver, string> = {
  vision: "Vision agent (clicks coordinates)",
  dom: "DOM agent (clicks elements)",
  cdp: "Raw CDP agent (browser-use style)",
};

const CONFIGS: Config[] = [
  ...(["vision", "dom", "cdp"] as const).flatMap((driver) => [
    { id: `${driver}/none`, label: AGENT_LABEL[driver], driver, protection: "none" as const },
    { id: `${driver}/nullify`, label: AGENT_LABEL[driver], driver, protection: "nullify" as const },
  ]),
  { id: "person/none", label: "Person (real mouse)", driver: "vision", protection: "none" },
  { id: "person/extension", label: "Person (real mouse)", driver: "vision", protection: "extension" },
];

type Verdict = "hijacked" | "blocked" | "refused" | "refused-by-playwright" | "not-triggered" | "n/a" | "completed" | "failed";

interface Row {
  config: string;
  scenario: string;
  type: "attack" | "legit";
  verdict: Verdict;
  detail?: string;
  /** Interventions logged on a legit page (false positives), Nullify configs only. */
  interventions?: number;
  ms: number;
}

interface Env {
  browser: Browser;
  extension: BrowserContext;
}

async function open(cfg: Config, env: Env): Promise<{ page: Page; guard?: NullifyGuard; close(): Promise<void> }> {
  if (cfg.protection === "extension") {
    const page = await env.extension.newPage();
    return { page, close: () => page.close() };
  }
  const context = await env.browser.newContext();
  const page = await context.newPage();
  const g = cfg.protection === "nullify" ? await guard(page) : undefined;
  return { page, ...(g ? { guard: g } : {}), close: () => context.close() };
}

async function runAttack(cfg: Config, c: (typeof ATTACKS)[number], env: Env): Promise<Row> {
  const na = c.notApplicable?.[cfg.driver];
  if (na) return { config: cfg.id, scenario: c.id, type: "attack", verdict: "n/a", detail: na, ms: 0 };
  const { page, guard: g, close } = await open(cfg, env);
  const start = performance.now();
  try {
    const o = await runCase(page, BASE + c.path, c.act, clicker(page, cfg.driver, g), SETTLE_MS);
    // Unprotected and not hijacked means the trap never fired for this kind of click, which isn't a block.
    let verdict: Verdict = cfg.protection === "none" ? "not-triggered" : "blocked";
    let detail: string | undefined;
    if (wasHijacked(c, o)) verdict = "hijacked";
    else if (o.refused?.startsWith("nullify")) [verdict, detail] = ["refused", o.refused.slice("nullify: ".length)];
    else if (o.refused) verdict = "refused-by-playwright";
    return { config: cfg.id, scenario: c.id, type: "attack", verdict, ...(detail ? { detail } : {}), ms: performance.now() - start };
  } finally {
    await close();
  }
}

async function runLegit(cfg: Config, c: (typeof LEGIT)[number], env: Env): Promise<Row> {
  const { page, guard: g, close } = await open(cfg, env);
  const start = performance.now();
  try {
    await page.goto(BASE + c.path);
    let verdict: Verdict = "completed";
    let detail: string | undefined;
    try {
      await c.check(page, clicker(page, cfg.driver, g));
    } catch (e) {
      verdict = "failed";
      detail = (e as Error).message.split("\n")[0];
    }
    let interventions: number | undefined;
    if (g) {
      const pageEvents = await g.events(page).catch(() => []);
      interventions = g.interventions.length + pageEvents.filter((e) => e.action !== "reported").length;
    }
    return {
      config: cfg.id, scenario: c.id, type: "legit", verdict,
      ...(detail ? { detail } : {}), ...(interventions !== undefined ? { interventions } : {}),
      ms: performance.now() - start,
    };
  } finally {
    await close();
  }
}

async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) await fn(items[next++]!);
  }));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

// ---------------------------------------------------------------------------
// Overhead

interface Overhead {
  clickMs: Record<Driver, { without: number; with: number }>;
  /** Nullify's own work per DOM click (its two in-page calls), timed directly. */
  domChecksMs: number;
  loadMs: Record<string, { without: number; with: number }>;
  /** Same pages in a plain browser vs one with the extension installed (a person browsing). */
  extensionLoadMs: Record<string, { without: number; with: number }>;
}

/** A plain page and a guarded page side by side, so measurements can alternate between them. */
async function pair(env: Env): Promise<{ plain: Page; guarded: Page; g: NullifyGuard; close(): Promise<void> }> {
  const a = await env.browser.newContext();
  const b = await env.browser.newContext();
  const plain = await a.newPage();
  const guarded = await b.newPage();
  const g = await guard(guarded);
  return { plain, guarded, g, close: async () => { await a.close(); await b.close(); } };
}

/**
 * Alternate without/with on every sample, so drift in machine load hits both
 * sides equally (measuring one side and then the other made the result
 * swing by several ms between runs).
 */
async function interleaved(samples: number, without: () => Promise<number>, withNullify: () => Promise<number>) {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < samples; i++) {
    a.push(await without());
    b.push(await withNullify());
  }
  return { without: median(a), with: median(b) };
}

const timed = async (fn: () => Promise<unknown>) => {
  const t = performance.now();
  await fn();
  return performance.now() - t;
};

async function measureOverhead(env: Env): Promise<Overhead> {
  const clickMs = {} as Overhead["clickMs"];
  for (const d of ["vision", "dom", "cdp"] as const) {
    const { plain, guarded, g, close } = await pair(env);
    await plain.goto(`${BASE}/legit/counter.html`);
    await guarded.goto(`${BASE}/legit/counter.html`);
    const clickPlain = clicker(plain, d);
    const clickGuarded = clicker(guarded, d, g);
    clickMs[d] = await interleaved(OVERHEAD_CLICKS, () => timed(() => clickPlain("#inc")), () => timed(() => clickGuarded("#inc")));
    await close();
  }

  // Playwright's locator.click() waits on animation frames, so end-to-end DOM click times land on ~17 ms steps
  // and can't resolve a 1-2 ms difference. Time the two in-page calls Nullify adds to a DOM click instead.
  const { guarded, g, close } = await pair(env);
  await guarded.goto(`${BASE}/legit/counter.html`);
  const target = guarded.locator("#inc");
  const samples: number[] = [];
  for (let i = 0; i < OVERHEAD_CLICKS; i++) {
    samples.push(await timed(async () => {
      await g.assessElement(target); // same work as the pre-click call
      await g.events(guarded); // stands in for the post-click block-log read
    }));
  }
  const domChecksMs = median(samples);
  await close();

  const loadMs: Overhead["loadMs"] = {};
  const loadEnd = async (page: Page, path: string) => {
    await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    return page.evaluate(() => (performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming).loadEventEnd);
  };
  for (const path of ["/hello.html", "/attacks/hidden-instructions.html", "/legit/video-player.html"]) {
    const { plain, guarded, close } = await pair(env);
    loadMs[path] = await interleaved(OVERHEAD_LOADS, () => loadEnd(plain, path), () => loadEnd(guarded, path));
    await close();
  }

  // Baseline: the same full Chromium build the extension runs in, minus the extension
  // (the default headless shell is a different browser and would skew the comparison).
  const sameBrowser = await chromium.launchPersistentContext("", { channel: "chromium", args: [HOST_RULES] });
  const extensionLoadMs: Overhead["extensionLoadMs"] = {};
  for (const path of ["/hello.html", "/attacks/hidden-instructions.html", "/legit/video-player.html"]) {
    const plain = await sameBrowser.newPage();
    const withExtension = await env.extension.newPage();
    extensionLoadMs[path] = await interleaved(OVERHEAD_LOADS, () => loadEnd(plain, path), () => loadEnd(withExtension, path));
    await withExtension.close();
    await plain.close();
  }
  await sameBrowser.close();
  return { clickMs, domChecksMs, loadMs, extensionLoadMs };
}

// ---------------------------------------------------------------------------
// Report

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${n}/${d} (${Math.round((100 * n) / d)}%)`);
const ms = (n: number) => `${n.toFixed(1)} ms`;
const delta = (n: number) => `${n < 0 ? "−" : "+"}${ms(Math.abs(n))}`;
const percent = (fraction: number) => `${fraction < 0 ? "−" : "+"}${Math.abs(fraction * 100).toFixed(0)}%`;

const CELL: Record<Verdict, string> = {
  hijacked: "❌ hijacked",
  blocked: "✅ blocked",
  refused: "✅ refused",
  "refused-by-playwright": "⏱️ Playwright timeout",
  "not-triggered": "➖ didn't fire",
  "n/a": "n/a",
  completed: "✅",
  failed: "❌ failed",
};

function report(rows: Row[], overhead: Overhead, meta: Record<string, string>): string {
  const byConfig = (id: string, type: Row["type"]) => rows.filter((r) => r.config === id && r.type === type);
  const lines: string[] = [];
  lines.push(`# NullBench results`, "");
  lines.push(`${meta.date} · Chromium ${meta.chromium} · Playwright ${meta.playwright} · ${meta.os}`, "");
  lines.push(`${ATTACKS.length} attack scenarios, ${LEGIT.length} legit flows, ${CONFIGS.length} configurations. Agents are scripted: they click exactly what each task says, so these numbers measure the protection, not a model's judgement.`, "");

  lines.push("## Attack success rate (lower is better)", "");
  lines.push("| Who is clicking | No protection | With Nullify |", "|---|---|---|");
  for (const label of [...new Set(CONFIGS.map((c) => c.label))]) {
    const cells = CONFIGS.filter((c) => c.label === label).map((c) => {
      const attacks = byConfig(c.id, "attack").filter((r) => r.verdict !== "n/a");
      return `${pct(attacks.filter((r) => r.verdict === "hijacked").length, attacks.length)}${c.protection === "extension" ? " (extension)" : ""}`;
    });
    lines.push(`| ${label} | ${cells[0]} | ${cells[1] ?? "—"} |`);
  }
  lines.push("", "Playwright's own `locator.click()` refuses some covered targets by timing out; those count as not hijacked but are listed separately below. Scenarios that can't fire for a kind of click are marked n/a and left out of that row.", "");

  lines.push("## Legit task completion (higher is better)", "");
  lines.push("| Who is clicking | No protection | With Nullify | Nullify interventions on legit pages |", "|---|---|---|---|");
  for (const label of [...new Set(CONFIGS.map((c) => c.label))]) {
    const [plain, protectedCfg] = CONFIGS.filter((c) => c.label === label);
    const done = (id: string | undefined) => {
      if (!id) return "—";
      const legit = byConfig(id, "legit");
      return pct(legit.filter((r) => r.verdict === "completed").length, legit.length);
    };
    const fp = protectedCfg ? byConfig(protectedCfg.id, "legit").reduce((n, r) => n + (r.interventions ?? 0), 0) : 0;
    lines.push(`| ${label} | ${done(plain?.id)} | ${done(protectedCfg?.id)} | ${protectedCfg?.protection === "nullify" ? fp : "—"} |`);
  }

  lines.push("", "## Per-scenario results", "");
  lines.push(`| Scenario | ${CONFIGS.map((c) => c.id).join(" | ")} |`, `|---|${CONFIGS.map(() => "---").join("|")}|`);
  for (const [type, list] of [["attack", ATTACKS], ["legit", LEGIT]] as const) {
    for (const s of list) {
      const cells = CONFIGS.map((c) => {
        const r = rows.find((x) => x.config === c.id && x.scenario === s.id && x.type === type);
        return r ? CELL[r.verdict] : "";
      });
      lines.push(`| ${type === "attack" ? "⚔️" : "🟢"} ${s.name} | ${cells.join(" | ")} |`);
    }
  }

  lines.push("", "## Overhead", "");
  lines.push("| Click type | Without | With Nullify | Added |", "|---|---|---|---|");
  for (const [driver, t] of Object.entries(overhead.clickMs)) {
    const frameBound = driver === "dom" ? " ¹" : "";
    lines.push(`| ${AGENT_LABEL[driver as Driver]}${frameBound} | ${ms(t.without)} | ${ms(t.with)} | ${delta(t.with - t.without)} |`);
  }
  lines.push(`| Nullify's own checks per DOM click (2 in-page calls) | — | — | +${ms(overhead.domChecksMs)} |`);
  lines.push("", `Median of ${OVERHEAD_CLICKS} clicks each, alternating without/with, measured from the agent's side (includes the pre-click check round trip).`);
  lines.push("", "¹ Playwright's `locator.click()` waits on animation frames, so DOM click times fall on ~17 ms steps and the end-to-end difference is mostly frame timing. The row below it times Nullify's added calls directly.", "");
  lines.push("| Page load (`loadEventEnd`) | Without | With Nullify | Added |", "|---|---|---|---|");
  for (const [path, t] of Object.entries(overhead.loadMs)) {
    lines.push(`| \`${path}\` | ${ms(t.without)} | ${ms(t.with)} | ${delta(t.with - t.without)} |`);
  }
  lines.push("", `Median of ${OVERHEAD_LOADS} loads each, alternating without/with, local server. Differences of about a millisecond are within run-to-run noise.`, "");
  lines.push("| Page load with the extension (a person browsing, same Chromium build) | Without | With extension | Added |", "|---|---|---|---|");
  for (const [path, t] of Object.entries(overhead.extensionLoadMs)) {
    const pctAdded = t.without > 0 ? ` (${percent((t.with - t.without) / t.without)})` : "";
    lines.push(`| \`${path}\` | ${ms(t.without)} | ${ms(t.with)} | ${delta(t.with - t.without)}${pctAdded} |`);
  }
  lines.push("", "Fixture pages load in a few ms from a local server, so the percentage overstates what a real page (hundreds of ms) would see; the absolute number is the meaningful one.", "");

  const failures = rows.filter((r) =>
    r.verdict === "failed" ||
    (r.config.endsWith("/nullify") && r.verdict === "hijacked") ||
    (r.interventions ?? 0) > 0 ||
    // Every attack page must fire for an unprotected mouse click, or the page itself is broken.
    (r.verdict === "not-triggered" && (r.config === "vision/none" || r.config === "person/none")));
  lines.push("## Failures and false positives", "");
  if (failures.length === 0) lines.push("None.");
  for (const r of failures) lines.push(`- \`${r.config}\` · ${r.scenario}: ${r.verdict}${r.detail ? ` (${r.detail})` : ""}${r.interventions ? `, ${r.interventions} intervention(s)` : ""}`);
  lines.push("", "_Person + extension doesn't cancel clicks (people can see the page), so the agent-only clickjacking scenarios are expected to get through there._");
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const server = spawn("node", ["bench/server.mjs"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  try {
    for (let i = 0; i < 50 && !(await fetch(`http://127.0.0.1:${PORT}/hello.html`).then((r) => r.ok, () => false)); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const browser = await chromium.launch({ args: [HOST_RULES] });
    const extension = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [HOST_RULES, `--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
    });
    if (extension.serviceWorkers().length === 0) await extension.waitForEvent("serviceworker");
    const env: Env = { browser, extension };

    const tasks = CONFIGS.flatMap((cfg) => [
      ...ATTACKS.map((c) => () => runAttack(cfg, c, env)),
      ...LEGIT.map((c) => () => runLegit(cfg, c, env)),
    ]);
    const rows: Row[] = [];
    let done = 0;
    await pool(tasks, CONCURRENCY, async (task) => {
      rows.push(await task());
      if (++done % 25 === 0) process.stderr.write(`  ${done}/${tasks.length} scenarios\n`);
    });

    process.stderr.write("  measuring overhead\n");
    const overhead = await measureOverhead(env);

    const meta = {
      date: new Date().toISOString().slice(0, 10),
      chromium: browser.version(),
      playwright: (await import("@playwright/test/package.json", { with: { type: "json" } })).default.version as string,
      os: `${platform()} ${release()} ${arch()}`,
    };
    await mkdir(RESULTS, { recursive: true });
    await writeFile(`${RESULTS}/latest.json`, JSON.stringify({ meta, configs: CONFIGS, rows, overhead }, null, 2) + "\n");
    const md = report(rows, overhead, meta);
    await writeFile(`${RESULTS}/latest.md`, md);
    process.stdout.write(md);

    await extension.close();
    await browser.close();
  } finally {
    server.kill();
  }
}

await main();
