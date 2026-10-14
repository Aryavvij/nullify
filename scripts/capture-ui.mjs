// Screenshots of the extension UI with real data, for the README and the demo.
// Triggers blocks on local fixture pages, then captures the popup and the
// replay page in light and dark mode into docs/img/.
//
//   npm run build && node scripts/capture-ui.mjs
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const EXT = `${root}extension/dist`;
const OUT = `${root}docs/img`;
const PORT = 4177;
const BASE = `http://news.test:${PORT}`;

const server = spawn("node", ["bench/server.mjs"], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 500));
await mkdir(OUT, { recursive: true });

async function centerClick(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
}

try {
  for (const colorScheme of ["light", "dark"]) {
    const ctx = await chromium.launchPersistentContext("", {
      channel: "chromium",
      colorScheme,
      args: ["--host-resolver-rules=MAP *.test 127.0.0.1", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
    while ((await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length)) < 2) {
      await new Promise((r) => setTimeout(r, 100));
    }
    const id = new URL(sw.url()).host;

    // One tab, three pages, three kinds of block.
    const page = await ctx.newPage();
    await page.goto(`${BASE}/attacks/redirect-on-click.html`);
    await centerClick(page, "#article p");
    await page.goto(`${BASE}/attacks/popunder-listener.html`);
    await centerClick(page, "#article p");
    await page.goto(`${BASE}/attacks/overlay-div.html`);
    await centerClick(page, "#video");
    const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id, page.url());

    const popup = await ctx.newPage();
    await popup.setViewportSize({ width: 340, height: 600 });
    await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
    await popup.waitForTimeout(300);
    await popup.screenshot({ path: `${OUT}/popup-${colorScheme}.png`, fullPage: true });

    const replay = await ctx.newPage();
    await replay.setViewportSize({ width: 960, height: 900 });
    await replay.emulateMedia({ reducedMotion: "reduce" }); // capture the finished state, not mid-animation
    await replay.goto(`chrome-extension://${id}/replay.html?tab=${tabId}`);
    await replay.waitForTimeout(300);
    await replay.screenshot({ path: `${OUT}/replay-${colorScheme}.png`, fullPage: true });

    // The scam warning, in its own tab.
    const scam = await ctx.newPage();
    await scam.goto(`${BASE}/attacks/tech-support-scam.html`);
    await scam.waitForTimeout(2000);
    const scamTab = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id, scam.url());
    const scamPopup = await ctx.newPage();
    await scamPopup.setViewportSize({ width: 340, height: 600 });
    await scamPopup.goto(`chrome-extension://${id}/popup.html?tab=${scamTab}`);
    await scamPopup.waitForTimeout(300);
    await scamPopup.screenshot({ path: `${OUT}/popup-scam-${colorScheme}.png`, fullPage: true });

    await ctx.close();
  }
  console.log(`screenshots written to ${OUT}`);
} finally {
  server.kill();
}
