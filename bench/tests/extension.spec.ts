import { chromium, expect, test as base, type BrowserContext, type Page, type Worker } from "@playwright/test";
import { ATTACKS, LEGIT, clicker, runCase, wasHijacked } from "./cases.js";
import { BASE, EXTENSION_PATH, HOST_RULES } from "./env.js";

/** One Chromium with the unpacked extension per worker. */
const test = base.extend<object, { extension: BrowserContext }>({
  extension: [
    async ({}, use) => {
      const context = await chromium.launchPersistentContext("", {
        channel: "chromium",
        args: [HOST_RULES, `--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
      });
      const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
      // The engine scripts are registered when the extension installs; wait for that before loading pages.
      await expect.poll(() => worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).length)).toBe(2);
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],
});

const sw = (ctx: BrowserContext): Worker => ctx.serviceWorkers()[0]!;
const extensionUrl = (ctx: BrowserContext, path: string) => `chrome-extension://${new URL(sw(ctx).url()).host}/${path}`;

async function tabIdOf(ctx: BrowserContext, page: Page): Promise<number> {
  const url = page.url();
  return sw(ctx).evaluate(async (u) => (await chrome.tabs.query({})).find((t) => t.url === u)!.id!, url);
}

const badge = (ctx: BrowserContext, tabId: number) => sw(ctx).evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);

async function pageEvents(ctx: BrowserContext, tabId: number): Promise<Array<Record<string, unknown>>> {
  return sw(ctx).evaluate(async (id) => {
    const key = `tab:${id}`;
    const record = (await chrome.storage.session.get(key))[key] as { pages: Array<{ events: unknown[] }> } | undefined;
    return (record?.pages.at(-1)?.events ?? []) as Array<Record<string, unknown>>;
  }, tabId);
}

test("extension loads the engine into the page", async ({ extension }) => {
  expect(sw(extension).url()).toMatch(/^chrome-extension:\/\/.+\/service-worker\.js$/);
  const page = await extension.newPage();
  await page.goto(`${BASE}/hello.html`);
  await expect(page.locator("#status")).toHaveText("nullify: extension");
  await page.close();
});

// A person clicks with a real mouse, which is what the vision driver does.
test.describe("extension blocks attacks on people", () => {
  for (const c of ATTACKS.filter((a) => !a.agentOnly)) {
    test(c.name, async ({ extension }) => {
      const page = await extension.newPage();
      const outcome = await runCase(page, BASE + c.path, c.act, clicker(page, "vision"));
      expect(wasHijacked(c, outcome), JSON.stringify(outcome)).toBe(false);
      await page.close();
    });
  }
});

test.describe("extension leaves legit pages working", () => {
  for (const c of LEGIT) {
    test(c.name, async ({ extension }) => {
      const page = await extension.newPage();
      await page.goto(BASE + c.path);
      await c.check(page, clicker(page, "vision"));
      await page.close();
    });
  }
});

test.describe("extension UI", () => {
  /** Load the invisible-overlay page and click the video, which Nullify blocks. */
  async function blockedOverlayClick(ctx: BrowserContext): Promise<{ page: Page; tabId: number }> {
    const page = await ctx.newPage();
    await page.goto(`${BASE}/attacks/overlay-div.html`);
    await clicker(page, "vision")("#video");
    const tabId = await tabIdOf(ctx, page);
    await expect.poll(() => badge(ctx, tabId)).toBe("2"); // the blocked pop-up + the removed layer
    return { page, tabId };
  }

  test("blocks are recorded with what was tried and by which script", async ({ extension }) => {
    const { page, tabId } = await blockedOverlayClick(extension);
    // Only what Nullify did. Whether it also logged "noticed an overlay" first depends on whether
    // its first scan (100 ms after load) ran before the click, so that entry isn't asserted.
    const done = (await pageEvents(extension, tabId)).filter((e) => e.action !== "reported");
    expect(done).toEqual([
      expect.objectContaining({
        kind: "popup", action: "blocked", reason: "click-on-invisible-overlay", via: "window.open",
        url: expect.stringContaining("ads.test"),
        source: `${BASE}/attacks/overlay-div.html`, // an inline script in the page itself
      }),
      expect.objectContaining({ kind: "overlay", action: "removed", reason: "trap-triggered-popup" }),
    ]);
    await page.close();
  });

  test("popup shows the count and what happened, in plain words", async ({ extension }) => {
    const { page, tabId } = await blockedOverlayClick(extension);
    const popup = await extension.newPage();
    await popup.goto(extensionUrl(extension, `popup.html?tab=${tabId}`));

    await expect(popup.locator("#site")).toHaveText("news.test");
    await expect(popup.locator("#count")).toHaveText("2");
    await expect(popup.locator("#events li .title")).toHaveText(["Removed the layer that caught your click", "Blocked a pop-up"]);
    await expect(popup.locator("#events li").nth(1)).toContainText("to ads.test");
    await expect(popup.locator("#empty")).toBeHidden();
    await popup.close();
    await page.close();
  });

  test("replay draws the chain: page, culprit, attempt, verdict", async ({ extension }) => {
    const { page, tabId } = await blockedOverlayClick(extension);
    const replay = await extension.newPage();
    await replay.goto(extensionUrl(extension, `replay.html?tab=${tabId}`));

    const first = replay.locator(".card").first();
    await expect(first.locator("h3")).toHaveText("Blocked a pop-up");
    await expect(first.locator(".step .value")).toHaveText([
      "news.test",
      "a script inside this page",
      "open a pop-up window to ads.test",
      "Blocked",
    ]);
    await expect(first.locator(".story")).toHaveText(
      "An invisible layer was covering the page. Your click landed on it, and it tried to open a pop-up window to ads.test.",
    );
    await expect(replay.locator(".card").nth(1).locator("h3")).toHaveText("Removed the layer that caught your click");
    await replay.close();
    await page.close();
  });

  test("the per-site switch turns the engine off and on for that site", async ({ extension }) => {
    const page = await extension.newPage();
    await page.goto(`${BASE}/hello.html`);
    await expect(page.locator("#status")).toHaveText("nullify: extension");
    const popup = await extension.newPage();
    await popup.goto(extensionUrl(extension, `popup.html?tab=${await tabIdOf(extension, page)}`));
    await popup.bringToFront(); // background tabs get no animation frames, which Playwright's click waits on

    try {
      await popup.locator("#enabled").uncheck();
      await expect(popup.locator("#note")).toContainText("Protection is off for this site");
      await page.reload();
      await expect(page.locator("#status")).toHaveText("nullify: not loaded");
    } finally {
      await popup.locator("#enabled").check();
      await expect(popup.locator("#note")).toContainText("Protection is back on");
    }
    await page.reload();
    await expect(page.locator("#status")).toHaveText("nullify: extension");
    await popup.close();
    await page.close();
  });

  test("a page can't learn the channel secret or forge events", async ({ extension }) => {
    const page = await extension.newPage();
    await page.goto(`${BASE}/legit/counter.html`);
    const tabId = await tabIdOf(extension, page);

    const leaked = await page.evaluate(
      () =>
        new Promise<unknown>((resolve) => {
          let secret: unknown = null;
          document.addEventListener("nullify:isolated-hello", (e) => (secret = (e as CustomEvent).detail), true);
          document.dispatchEvent(new CustomEvent("nullify:main-hello")); // ask the extension to say hello again
          setTimeout(() => resolve(secret), 200);
        }),
    );
    expect(leaked).toBeNull();

    await page.evaluate(() => {
      const forged = JSON.stringify({ type: "event", event: { kind: "popup", action: "blocked", reason: "forged", url: "http://evil.test/" } });
      document.dispatchEvent(new CustomEvent("nullify:isolated-hello", { detail: "x".repeat(64) }));
      for (const name of ["nullify", "nullify:event", "nullify-event"]) document.dispatchEvent(new CustomEvent(name, { detail: forged }));
    });
    await page.waitForTimeout(500);
    expect(await pageEvents(extension, tabId)).not.toContainEqual(expect.objectContaining({ reason: "forged" }));
    expect(await badge(extension, tabId)).toBe("");
    await page.close();
  });
});
