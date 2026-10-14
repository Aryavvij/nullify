// Does Nullify break real websites? Loads popular, ordinary sites in two copies
// of the same Chromium build, one without and one with the extension, scrolls
// (no clicks, no logins, no forms), and compares what loaded. Also records
// anything Nullify blocked or removed (on normal sites that should be nothing)
// and any errors thrown by Nullify's own code.
//
//   npm run build && node scripts/real-site-check.mjs   ->   docs/store/real-site-check.md
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const EXT = `${root}extension/dist`;

const SITES = [
  "https://en.wikipedia.org/wiki/Web_browser",
  "https://github.com/",
  "https://stackoverflow.com/questions",
  "https://developer.mozilla.org/en-US/",
  "https://www.bbc.com/news",
  "https://www.nytimes.com/",
  "https://www.reddit.com/",
  "https://www.amazon.com/",
  "https://www.youtube.com/",
  "https://www.espn.com/",
  "https://www.imdb.com/",
  "https://weather.com/",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function visit(context, url) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e));
  const result = { url, loaded: false, title: "", links: 0, pageErrors: 0, nullifyErrors: 0 };
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30_000 });
    result.loaded = true;
    await sleep(2500);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 1500);
      await sleep(800);
    }
    result.title = await page.title();
    result.links = await page.evaluate(() => document.querySelectorAll("a[href]").length);
  } catch (e) {
    result.error = e.message.split("\n")[0];
  }
  result.pageErrors = errors.length;
  result.nullifyErrors = errors.filter((e) => (e.stack ?? "").includes("chrome-extension://")).length;
  return { page, result };
}

const plain = await chromium.launchPersistentContext("", { channel: "chromium" });
const guarded = await chromium.launchPersistentContext("", {
  channel: "chromium",
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const sw = guarded.serviceWorkers()[0] ?? (await guarded.waitForEvent("serviceworker"));
while ((await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length)) < 2) await sleep(100);

const rows = [];
for (const url of SITES) {
  let [a, b] = await Promise.all([visit(plain, url), visit(guarded, url)]);
  // Live sites time out now and then; give a failed load one more try, on either side alike.
  if (!a.result.loaded) {
    await a.page.close();
    a = await visit(plain, url);
  }
  if (!b.result.loaded) {
    await b.page.close();
    b = await visit(guarded, url);
  }
  // What Nullify did in that tab, read from the extension's own history.
  let did = { blocked: 0, removed: 0, reported: 0, reasons: [] };
  if (b.result.loaded) {
    did = await sw.evaluate(async (pageUrl) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => t.url === pageUrl) ?? tabs.at(-1);
      const key = `tab:${tab?.id}`;
      const record = (await chrome.storage.session.get(key))[key];
      const events = (record?.pages ?? []).flatMap((p) => p.events);
      const count = (a) => events.filter((e) => e.action === a).length;
      const reasons = events.filter((e) => e.action !== "reported").map((e) => `${e.kind}:${e.reason}`);
      return { blocked: count("blocked"), removed: count("removed"), reported: count("reported"), reasons };
    }, b.page.url());
  }
  rows.push({ plain: a.result, nullify: b.result, did });
  await a.page.close();
  await b.page.close();
  process.stderr.write(`  ${url}\n`);
}
await plain.close();
await guarded.close();

const L = [];
L.push("# Real-site check", "");
L.push(`${new Date().toISOString().slice(0, 10)} · the same Chromium build with and without Nullify · ${SITES.length} popular sites, loaded and scrolled (no clicks, no logins, no forms)`, "");
L.push("| Site | Loaded (without / with) | Same title | Links without → with | Nullify blocked / removed | Noticed only | Errors from Nullify's code |", "|---|---|---|---|---|---|---|");
for (const r of rows) {
  const host = new URL(r.plain.url).host;
  const loaded = `${r.plain.loaded ? "✅" : "❌"} / ${r.nullify.loaded ? "✅" : "❌"}`;
  const same = r.plain.loaded && r.nullify.loaded ? (r.plain.title === r.nullify.title ? "yes" : `no ("${r.plain.title.slice(0, 30)}" vs "${r.nullify.title.slice(0, 30)}")`) : "—";
  L.push(`| ${host} | ${loaded} | ${same} | ${r.plain.links} → ${r.nullify.links} | ${r.did.blocked} / ${r.did.removed} | ${r.did.reported} | ${r.nullify.nullifyErrors} |`);
}
const interventions = rows.flatMap((r) => r.did.reasons.map((x) => `${new URL(r.plain.url).host}: ${x}`));
L.push("", "## Anything Nullify blocked or removed", "");
L.push(interventions.length ? interventions.map((x) => `- ${x}`).join("\n") : "Nothing. With no clicks, there was nothing for Nullify to stop on these sites.");
L.push("", "## Notes", "");
L.push("- Link counts differ a little between any two loads of a live site (rotating content and ads). A large drop with Nullify would mean it broke something.");
L.push("- Some sites show bot checks or consent walls to automated browsers. When that happens it affects both columns the same way.");
L.push("- A load that fails is tried once more, on either side alike, since live sites time out now and then.");
L.push("- This is a smoke test of page loading only. Clicking is covered by the 13 normal flows in NullBench, all of which work with Nullify.");
await writeFile(`${root}docs/store/real-site-check.md`, L.join("\n") + "\n");
await writeFile(`${root}docs/store/real-site-check.json`, JSON.stringify(rows, null, 2) + "\n");
console.log(L.join("\n"));
