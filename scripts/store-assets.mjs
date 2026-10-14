// Chrome Web Store images from the real extension UI:
//  - three 1280x800 screenshots (rendered at 640x400 x2, because the store shows them at 640x400)
//  - the 440x280 small promo tile (no text, saturated colour, as the store guidelines ask)
//
//   npm run store:assets   ->   docs/store/*.png
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const EXT = `${root}extension/dist`;
const OUT = `${root}docs/store`;
const PORT = 4182;
const BASE = `http://news.test:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MARK = `<svg viewBox="0 0 100 100" width="44" height="44"><rect width="100" height="100" rx="22" fill="#12141a" stroke="#2a2e38"/>
  <circle cx="50" cy="50" r="26" fill="none" stroke="#fff" stroke-width="8"/>
  <line x1="27" y1="73" x2="73" y2="27" stroke="#fb7185" stroke-width="8" stroke-linecap="round"/></svg>`;

/** A 640x400 frame: headline on the left, a real UI capture on the right. */
const frame = (headline, sub, image) => `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0}
  body{width:640px;height:400px;display:grid;grid-template-columns:1fr 300px;align-items:center;
    background:#111318;color:#eceef2;font-family:system-ui,-apple-system,sans-serif;overflow:hidden}
  .copy{padding:0 8px 0 36px;display:grid;gap:12px}
  h1{margin:0;font-size:27px;line-height:1.15;letter-spacing:-0.01em}
  p{margin:0;font-size:15px;line-height:1.4;color:#9aa2b1}
  .shot{display:grid;place-items:center;height:400px}
  .shot img{width:270px;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.55)}
</style></head><body>
  <div class="copy">${MARK}<h1>${headline}</h1><p>${sub}</p></div>
  <div class="shot"><img src="data:image/png;base64,${image}"></div>
</body></html>`;

const promo = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0}
  body{width:440px;height:280px;display:grid;place-items:center;overflow:hidden;
    background:radial-gradient(circle at 30% 20%,#fb7185 0,#e11d48 45%,#9f1239 100%)}
  svg{filter:drop-shadow(0 18px 30px rgba(0,0,0,.35))}
</style></head><body>
  <svg viewBox="0 0 100 100" width="150" height="150"><rect width="100" height="100" rx="22" fill="#12141a"/>
    <circle cx="50" cy="50" r="26" fill="none" stroke="#fff" stroke-width="8"/>
    <line x1="27" y1="73" x2="73" y2="27" stroke="#fb7185" stroke-width="8" stroke-linecap="round"/></svg>
</body></html>`;

async function centerClick(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
}

const server = spawn("node", ["bench/server.mjs"], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await sleep(500);
await mkdir(OUT, { recursive: true });

try {
  const ctx = await chromium.launchPersistentContext("", {
    channel: "chromium",
    colorScheme: "light",
    deviceScaleFactor: 2, // UI captures at 2x so they stay sharp in the 1280x800 images
    args: ["--host-resolver-rules=MAP *.test 127.0.0.1", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
  while ((await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length)) < 2) await sleep(100);
  const id = new URL(sw.url()).host;
  const tabOf = (page) => sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id, page.url());

  // Blocks to show: a redirect, a pop-under, and the invisible layer over a video, all in one tab.
  const page = await ctx.newPage();
  await page.goto(`${BASE}/attacks/redirect-on-click.html`);
  await centerClick(page, "#article p");
  await page.goto(`${BASE}/attacks/popunder-listener.html`);
  await centerClick(page, "#article p");
  await page.goto(`${BASE}/attacks/overlay-div.html`);
  await centerClick(page, "#video");
  const tabId = await tabOf(page);

  const capturePopup = async (forTab) => {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 340, height: 360 });
    await p.goto(`chrome-extension://${id}/popup.html?tab=${forTab}`);
    await sleep(300);
    const shot = (await p.locator("body").screenshot({ scale: "device" })).toString("base64");
    await p.close();
    return shot;
  };

  // Screenshot 1: what was blocked on this page, and the per-site switch.
  const popupShot = await capturePopup(tabId);

  // Screenshot 3: the scam warning.
  const scam = await ctx.newPage();
  await scam.goto(`${BASE}/attacks/tech-support-scam.html`);
  await sleep(2000);
  const scamShot = await capturePopup(await tabOf(scam));

  // Screenshot 2: the replay page itself, at the store's display size.
  const replay = await ctx.newPage();
  await replay.setViewportSize({ width: 640, height: 400 });
  await replay.emulateMedia({ reducedMotion: "reduce" });
  await replay.goto(`chrome-extension://${id}/replay.html?tab=${tabId}`);
  await sleep(300);
  const replayShot = await replay.screenshot({ scale: "device" });
  await ctx.close();

  // Compose at 640x400, rendered at 2x = 1280x800.
  const browser = await chromium.launch();
  const canvas = await browser.newPage({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
  await canvas.setContent(frame("Stops pop-ups and redirects you didn't ask for", "Even when the ad domain is too new to be on any blocklist.", popupShot));
  await canvas.screenshot({ path: `${OUT}/screenshot-1-blocked.png` });
  await canvas.setContent(`<img src="data:image/png;base64,${replayShot.toString("base64")}" style="display:block;width:640px;height:400px">`);
  await canvas.screenshot({ path: `${OUT}/screenshot-2-replay.png` });
  await canvas.setContent(frame("Flags tech-support scam pages", "The toolbar badge turns to “!” on pages with fake virus alerts and support phone numbers.", scamShot));
  await canvas.screenshot({ path: `${OUT}/screenshot-3-scam.png` });

  const tile = await browser.newPage({ viewport: { width: 440, height: 280 } });
  await tile.setContent(promo);
  await tile.screenshot({ path: `${OUT}/promo-small-440x280.png` });
  await browser.close();
  console.log(`store images written to ${OUT}`);
} finally {
  server.kill();
}
