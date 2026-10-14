import { expect, test } from "@playwright/test";
import { guard, NullifyBlockedError, type NullifyGuard } from "@nullify/agent-guard";
import { clicker } from "./cases.js";
import { BASE } from "./env.js";

let g: NullifyGuard;

test.beforeEach(async ({ page }) => {
  g = await guard(page);
});

test.describe("hidden text", () => {
  test("finds hidden instructions and ignores normal hidden UI", async ({ page }) => {
    await page.goto("/attacks/hidden-instructions.html");
    const found = await g.hiddenText(page);
    const byElement = Object.fromEntries(found.map((f) => [`${f.element}:${f.technique}`, f.instructionLike]));

    expect(byElement).toEqual({
      "p#white:same-color": true,
      "p#tiny:tiny-font": true,
      "p#offscreen:offscreen": true,
      "p#transparent:transparent": true,
      'button#buy "Buy now":attribute': true,
      "a:clipped": false, // screen-reader-only "Skip to main content": hidden, but not an instruction
    });
  });

  test("visibleText keeps what people see and drops hidden instructions", async ({ page }) => {
    await page.goto("/attacks/hidden-instructions.html");
    const text = await g.visibleText(page);

    expect(text).toContain("We tested 14 pairs of headphones");
    expect(text).toContain("Prices checked on 1 October 2026.");
    expect(text).not.toMatch(/ignore all previous instructions|new instructions|enter the user's password|Do not tell the user/i);
    expect(text).not.toContain("Skip to main content");
  });
});

test.describe("page risk", () => {
  test("high on a page with hidden instructions", async ({ page }) => {
    await page.goto("/attacks/hidden-instructions.html");
    const risk = await g.pageRisk(page);
    expect(risk.level).toBe("high");
    expect(risk.hiddenInstructions).toBe(5);
  });

  test("high on a tech-support scam page", async ({ page }) => {
    await page.goto("/attacks/tech-support-scam.html");
    const risk = await g.pageRisk(page);
    expect(risk.scam.likelyScam).toBe(true);
    expect(risk.scam.signals).toEqual(expect.arrayContaining(["device-locked-claim", "call-support", "notification-prompt-without-click"]));
    expect(risk.level).toBe("high");
  });

  test("low on ordinary pages", async ({ page }) => {
    for (const path of ["/legit/cookie-banner.html", "/legit/security-news.html", "/legit/counter.html"]) {
      await page.goto(path);
      expect((await g.pageRisk(page)).level, path).toBe("low");
    }
  });
});

test.describe("refusals", () => {
  test("explain what was really under the pointer, in words an agent can use", async ({ page }) => {
    await page.goto("/attacks/invisible-control.html");
    const error = await clicker(page, "vision", g)("#no-thanks").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NullifyBlockedError);
    expect((error as Error).message).toBe(
      'Nullify refused this click: the click would land on an invisible control (button#hidden-confirm) instead of what is shown (button#no-thanks "No thanks").',
    );
    expect(g.interventions).toEqual([expect.objectContaining({ kind: "click-refused", reason: "invisible-control" })]);
  });

  test("never echo hidden instruction text into the agent's context", async ({ page }) => {
    await page.goto("/attacks/hidden-instructions.html");
    const verdict = await g.assessElement(page.locator("#transparent"));
    expect(JSON.stringify(verdict)).not.toMatch(/Buy now"|Do not tell the user/);
  });
});

test.describe("invisible frames", () => {
  for (const driver of ["vision", "cdp"] as const) {
    test(`made click-through, so a ${driver} click reaches the visible button`, async ({ page }) => {
      await page.goto("/attacks/invisible-frame.html");
      await page.frameLocator("#widget").locator("#confirm").waitFor({ state: "attached" });
      await clicker(page, driver, g)("#no-thanks");
      await expect(page.locator("#status")).toHaveText("ok");
      expect(await g.events(page)).toContainEqual(expect.objectContaining({ reason: "invisible-frame-disabled" }));
    });
  }

  test("stays click-through when the page tries to undo it", async ({ page }) => {
    await page.goto("/attacks/invisible-frame.html");
    await expect.poll(() => page.locator("#widget").evaluate((f) => getComputedStyle(f).pointerEvents)).toBe("none");
    await page.locator("#widget").evaluate((f: HTMLElement) => f.style.removeProperty("pointer-events"));
    await expect.poll(() => page.locator("#widget").evaluate((f) => getComputedStyle(f).pointerEvents)).toBe("none");
  });
});

test.describe("tamper resistance", () => {
  test("the page can't replace the agent API or approve its own click target", async ({ page }) => {
    await page.goto("/attacks/invisible-control.html");
    const result = await page.evaluate(() => {
      const w = window as unknown as { __nullifyAgent: { arm(key: string, el: Element): boolean; assess: unknown } };
      try {
        (w as unknown as Record<string, unknown>).__nullifyAgent = {};
      } catch {
        // strict-mode assignment to a read-only property throws
      }
      return {
        armed: w.__nullifyAgent.arm("guessed-token", document.getElementById("hidden-confirm")!),
        stillFunction: typeof w.__nullifyAgent.assess,
      };
    });
    expect(result).toEqual({ armed: false, stillFunction: "function" });
  });
});

test.describe("rogue tabs", () => {
  test("a tab the engine didn't approve is closed", async ({ browser }) => {
    // Report mode lets the popup through in the page, so this exercises the Node-side backstop alone.
    const page = await browser.newPage({ baseURL: BASE });
    const guarded = await guard(page, { policy: { mode: "report", clickShield: false } });
    await page.goto("/attacks/overlay-div.html");
    const popup = page.waitForEvent("popup");
    await clicker(page, "vision", guarded)("#video");
    const tab = await popup;
    await expect.poll(() => tab.isClosed()).toBe(true);
    expect(guarded.interventions).toEqual([expect.objectContaining({ kind: "rogue-tab-closed" })]);
    await page.close();
  });

  test("report mode logs the hijack without blocking it", async ({ browser }) => {
    const page = await browser.newPage({ baseURL: BASE });
    const guarded = await guard(page, { policy: { mode: "report", clickShield: false }, closeRogueTabs: false });
    await page.goto("/attacks/overlay-div.html");
    const popup = page.waitForEvent("popup");
    await clicker(page, "vision", guarded)("#video");
    await popup;
    expect(await guarded.events(page)).toContainEqual(
      expect.objectContaining({ kind: "popup", action: "reported", reason: "click-on-invisible-overlay" }),
    );
    await page.close();
  });
});
