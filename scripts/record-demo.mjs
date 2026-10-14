// Records the demo video from real runs against the local fixture pages:
// a person with and without the extension, the replay page, and a scripted
// coordinate-clicking agent with and without Agent Guard. Title cards are
// plain HTML pages recorded like any other clip; ffmpeg joins everything.
//
//   npm run build && npm run nullbench && node scripts/record-demo.mjs
//   -> docs/demo/nullify-demo.mp4
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { guard } from "@nullifyads/agent-guard";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const EXT = `${root}extension/dist`;
const OUT = `${root}docs/demo`;
const CLIPS = `${OUT}/.clips`;
const PORT = 4178;
const BASE = `http://news.test:${PORT}`;
const HOST_RULES = "--host-resolver-rules=MAP *.test 127.0.0.1";
const SIZE = { width: 1280, height: 720 };

const clips = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Shows a red ripple where each click lands (Playwright videos don't draw the cursor). Click-through, so it changes nothing. */
const RIPPLE = () => {
  addEventListener("pointerdown", (e) => {
    const dot = document.createElement("div");
    dot.style.cssText = `position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border-radius:50%;` +
      "border:3px solid #e11d48;pointer-events:none;z-index:2147483647;transition:transform .6s,opacity .6s";
    document.documentElement.appendChild(dot);
    requestAnimationFrame(() => { dot.style.transform = "scale(2)"; dot.style.opacity = "0"; });
    setTimeout(() => dot.remove(), 700);
  }, true);
};

async function centerClick(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Record one page's lifetime as a clip, in order. */
async function clip(context, run) {
  const page = await context.newPage();
  await run(page);
  await page.close();
  clips.push({ path: await page.video().path() });
}

/** Bigger status text on the agent pages, for legibility on video only. Looks only; no behaviour changes. */
const BIG_STATUS = () => {
  addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = "#status{font:700 32px system-ui;margin-top:16px}";
    document.head.appendChild(style);
  });
};

/**
 * A title card. The progress bar keeps the page repainting for the whole card:
 * Playwright only captures frames on repaint, so a fully static card could be
 * recorded as nothing but its first blank frame.
 */
function cardHtml(title, body = "", ms = 3000, tone = "dark") {
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%}
    body{display:grid;place-content:center;gap:22px;padding:0 120px;font-family:system-ui,-apple-system,sans-serif;
      background:${tone === "dark" ? "#111318" : "#ffffff"};color:${tone === "dark" ? "#eceef2" : "#12141a"}}
    h1{margin:0;font-size:52px;line-height:1.1;letter-spacing:-0.02em}
    p{margin:0;font-size:26px;line-height:1.45;color:${tone === "dark" ? "#9aa2b1" : "#5c6370"};white-space:pre-line}
    code{font:22px/1.5 ui-monospace,Menlo,monospace;color:#fb7185;white-space:pre-wrap}
    .null{width:64px;height:64px}
    .bar{position:fixed;left:0;bottom:0;height:4px;background:#fb7185;animation:fill ${ms}ms linear both}
    @keyframes fill{from{width:0}to{width:100%}}
  </style></head><body><div class="bar"></div>
    <svg class="null" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#12141a" stroke="#2a2e38"/>
      <circle cx="50" cy="50" r="26" fill="none" stroke="#fff" stroke-width="8"/>
      <line x1="27" y1="73" x2="73" y2="27" stroke="#fb7185" stroke-width="8" stroke-linecap="round"/></svg>
    <h1>${esc(title)}</h1>${body}</body></html>`;
}

async function card(browser, ms, title, body = "") {
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: CLIPS, size: SIZE } });
  await clip(context, async (page) => {
    await page.setContent(cardHtml(title, body, ms));
    await sleep(ms);
  });
  await context.close();
}

const server = spawn("node", ["bench/server.mjs"], { cwd: root, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await sleep(500);
await rm(CLIPS, { recursive: true, force: true });
await mkdir(CLIPS, { recursive: true });

try {
  const browser = await chromium.launch({ args: [HOST_RULES] });

  // ---- 1. People ------------------------------------------------------------------
  await card(browser, 3500, "Nullify", "<p>Stops click hijacks: invisible layers that steal clicks,\npop-ups you didn't ask for, and redirects to other sites.</p>");
  await card(browser, 3000, "Without protection", "<p>A streaming page. One click on the video player…</p>");

  const plain = await browser.newContext({ viewport: SIZE, recordVideo: { dir: CLIPS, size: SIZE } });
  await plain.addInitScript(RIPPLE);
  let adTab;
  await clip(plain, async (page) => {
    await page.goto(`${BASE}/attacks/overlay-div.html`);
    await sleep(1200);
    const popup = page.waitForEvent("popup");
    await centerClick(page, "#video");
    adTab = await popup;
    await sleep(1200);
  });
  await sleep(1500);
  await adTab.close();
  clips.push({ path: await adTab.video().path() }); // the tab that opened behind the user's back
  await plain.close();

  await card(browser, 3000, "…opened an ad tab.", "<p>An invisible layer was sitting on top of the player.\nNow the same page, with the Nullify extension.</p>");

  const extension = await chromium.launchPersistentContext("", {
    channel: "chromium",
    viewport: SIZE,
    recordVideo: { dir: CLIPS, size: SIZE },
    args: [HOST_RULES, `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  await extension.addInitScript(RIPPLE);
  const sw = extension.serviceWorkers()[0] ?? (await extension.waitForEvent("serviceworker"));
  while ((await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length)) < 2) await sleep(100);
  // The attack tab stays open while the replay is recorded: closing a tab clears its history.
  const attack = await extension.newPage();
  const attackStart = Date.now();
  const attackSlot = clips.push(null) - 1;
  await attack.goto(`${BASE}/attacks/overlay-div.html`);
  await sleep(1200);
  await centerClick(attack, "#video");
  await sleep(1500);
  await centerClick(attack, "#video"); // the trap is gone: this click reaches the player
  await sleep(1200);
  const attackSeconds = (Date.now() - attackStart) / 1000;
  const tabId = await sw.evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u).id, attack.url());

  await card(browser, 2800, "Nothing opened.", "<p>Nullify blocked the pop-up and removed the invisible layer.\nHere's what it saw:</p>");
  await clip(extension, async (page) => {
    await page.goto(`chrome-extension://${new URL(sw.url()).host}/replay.html?tab=${tabId}`);
    await sleep(4500);
  });
  await attack.close();
  clips[attackSlot] = { path: await attack.video().path(), trim: attackSeconds };
  await extension.close();

  // ---- 2. AI agents ---------------------------------------------------------------
  await card(browser, 3500, "AI agents get trapped the same way", "<p>An agent that clicks screen coordinates is asked to close a\nnewsletter pop-up by clicking “No thanks”.</p>");

  const agentPlain = await browser.newContext({ viewport: SIZE, recordVideo: { dir: CLIPS, size: SIZE } });
  await agentPlain.addInitScript(RIPPLE);
  await agentPlain.addInitScript(BIG_STATUS);
  await clip(agentPlain, async (page) => {
    await page.goto(`${BASE}/attacks/invisible-control.html`);
    await sleep(1500);
    await centerClick(page, "#no-thanks");
    await sleep(2200);
  });
  await agentPlain.close();
  await card(browser, 3200, "The click hit an invisible button.", "<p>A hidden “Confirm” sat exactly on top of “No thanks”,\nso the status reads <b>hijacked</b>. Now with Nullify Agent Guard:</p>");

  const agentGuarded = await browser.newContext({ viewport: SIZE, recordVideo: { dir: CLIPS, size: SIZE } });
  await agentGuarded.addInitScript(RIPPLE);
  await agentGuarded.addInitScript(BIG_STATUS);
  await guard(agentGuarded);
  let refusal = "";
  await clip(agentGuarded, async (page) => {
    await page.goto(`${BASE}/attacks/invisible-control.html`);
    await sleep(1500);
    refusal = await centerClick(page, "#no-thanks").then(() => "(clicked)", (e) => e.message);
    await sleep(2200);
  });
  await agentGuarded.close();
  await card(browser, 5500, "Refused, with a reason the agent can use", `<code>${refusal.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</code><p>Nothing was clicked. Status still reads “pending”.</p>`);

  // ---- 3. Results ------------------------------------------------------------------
  const results = JSON.parse(await readFile(`${root}bench/results/latest.json`, "utf8"));
  const rate = (config) => {
    const rows = results.rows.filter((r) => r.config === config && r.type === "attack" && r.verdict !== "n/a");
    return `${Math.round((100 * rows.filter((r) => r.verdict === "hijacked").length) / rows.length)}%`;
  };
  const legit = results.rows.filter((r) => r.config.endsWith("/nullify") && r.type === "legit");
  const legitDone = legit.filter((r) => r.verdict === "completed").length;
  const o = results.overhead;
  await card(browser, 6000, "NullBench results", `<p>Hijack success, no protection → with Nullify
Vision agent: ${rate("vision/none")} → ${rate("vision/nullify")}   ·   Raw-CDP agent: ${rate("cdp/none")} → ${rate("cdp/nullify")}
Normal flows that still work with Nullify: ${legitDone}/${legit.length} (13 flows × 3 kinds of agent)
Added per click: +${(o.clickMs.vision.with - o.clickMs.vision.without).toFixed(1)} ms (vision)</p>`);
  await card(browser, 3000, "Nullify", "<p>For people and for AI agents.</p>");

  await browser.close();

  // ---- join -------------------------------------------------------------------------
  const inputs = clips.flatMap((c) => ["-i", c.path]);
  const scaled = clips.map((c, i) => {
    const trim = c.trim ? `trim=duration=${c.trim.toFixed(2)},setpts=PTS-STARTPTS,` : "";
    return `[${i}:v]${trim}fps=30,scale=${SIZE.width}:${SIZE.height}:force_original_aspect_ratio=decrease,pad=${SIZE.width}:${SIZE.height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}]`;
  });
  const filter = `${scaled.join(";")};${clips.map((_, i) => `[v${i}]`).join("")}concat=n=${clips.length}:v=1:a=0[out]`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filter, "-map", "[out]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-movflags", "+faststart", `${OUT}/nullify-demo.mp4`]);
  console.log(`${clips.length} clips -> ${OUT}/nullify-demo.mp4`);
} finally {
  server.kill();
}
