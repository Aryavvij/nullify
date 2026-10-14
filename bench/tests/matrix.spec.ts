import { expect, test } from "@playwright/test";
import { guard, type NullifyGuard } from "@nullifyads/agent-guard";
import { ATTACKS, DRIVERS, LEGIT, clicker, runCase, wasHijacked } from "./cases.js";

test.describe("fixture check: every attack really hijacks an unprotected vision agent", () => {
  for (const c of ATTACKS) {
    test(c.name, async ({ page }) => {
      const outcome = await runCase(page, c.path, c.act, clicker(page, "vision"));
      expect(wasHijacked(c, outcome), JSON.stringify(outcome)).toBe(true);
    });
  }
});

for (const driver of DRIVERS) {
  test.describe(`${driver} agent with Nullify`, () => {
    for (const c of ATTACKS) {
      const gap = c.knownGaps?.[driver];
      test(`blocks: ${c.name}`, async ({ page }) => {
        const na = c.notApplicable?.[driver];
        test.skip(na !== undefined, `not applicable: ${na}`);
        test.fail(gap !== undefined, `known gap: ${gap}`);
        const g = await guard(page);
        const outcome = await runCase(page, c.path, c.act, clicker(page, driver, g));
        expect(wasHijacked(c, outcome), JSON.stringify(outcome)).toBe(false);
      });
    }

    for (const c of LEGIT) {
      test(`still works: ${c.name}`, async ({ page }) => {
        const g: NullifyGuard = await guard(page);
        await page.goto(c.path);
        await c.check(page, clicker(page, driver, g));

        expect(g.interventions, "no click refused, no tab closed").toEqual([]);
        const events = await g.events(page).catch(() => []); // page may have navigated to a site without our fixture
        expect(events.filter((e) => e.action !== "reported"), "nothing blocked or removed in the page").toEqual([]);
      });
    }
  });
}
