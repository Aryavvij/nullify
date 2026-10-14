import { expect, test } from "@playwright/test";
import { guard } from "@nullify/agent-guard";

test("Agent Guard injects core before page scripts run", async ({ page }) => {
  await guard(page);
  await page.goto("/hello.html");

  await expect(page.locator("#status")).toHaveText("nullify: agent-guard");
  expect(await page.evaluate(() => (window as any).__nullify?.version)).toBe("0.1.0");
  expect(await page.evaluate(() => typeof (window as any).Nullify), "bundle must not leak a global").toBe("undefined");
});
