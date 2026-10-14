# @nullifyads/agent-guard

Stops AI browser agents from being clickjacked. Every click your Playwright agent makes either lands on what is visible at that point, or is refused with a reason the agent can act on.

```bash
npm install @nullifyads/agent-guard playwright-core
```

```ts
import { chromium } from "playwright-core";
import { guard, NullifyBlockedError } from "@nullifyads/agent-guard";

const browser = await chromium.launch();
const context = await browser.newContext();
const g = await guard(context); // before any navigation

const page = await context.newPage();
await page.goto("https://example.com");

try {
  await page.mouse.click(400, 300); // checked automatically
} catch (e) {
  if (e instanceof NullifyBlockedError) {
    // e.g. "Nullify refused this click: the click would land on an invisible control
    //       (button#hidden-confirm) instead of what is shown (button#no-thanks "No thanks")."
    console.log(e.message);
  }
}

const text = await g.visibleText(page); // page text without hidden text, for your model
```

## Why
Agents that click by coordinates (computer-use / screenshot agents) or send raw input events press whatever is on top at that point, including things a person can't see. In our benchmark, an unprotected coordinate-clicking agent was hijacked by **18 of 18** trap pages: invisible overlays, invisible buttons stacked on visible ones, invisible frames, pop-unders and redirects. With Agent Guard: **0 of 18**, and **13 of 13** normal flows (login and payment pop-ups, video players, menus, custom file pickers) still worked. Playwright's own `locator.click()` refuses some of these traps, but only by timing out without a reason, so an agent often falls back to clicking coordinates.

## What it does
- **Checks each click before it happens.** It refuses a click that would land on an invisible control, an invisible layer covering a visible button, an invisible frame, or (for element clicks) something other than the element you named.
- **Checks again during the click itself.** A shield inside the page cancels the whole click if something appeared between the check and the click. That also covers raw CDP input that never goes through this library.
- **Blocks pop-ups and redirects** that a click didn't ask for, and **closes tabs** that open without approval.
- **Reads the page safely.** `visibleText()` returns page text without hidden text; `hiddenText()` reports what is hidden; `pageRisk()` summarises the page. Refusal messages only use visible text, so a refusal can't carry hidden instructions into your model's context.

## API
| Call | What it does |
|---|---|
| `guard(pageOrContext, options?)` | Injects the engine (call before navigating; prefer a context so pop-ups are covered) and returns a `NullifyGuard` |
| `page.mouse.click / dblclick / down` | Checked automatically once guarded (`protectMouse: false` to opt out) |
| `g.click(page, x, y)` | Explicit checked coordinate click |
| `g.clickElement(locator)` | Element click that fails immediately with a reason instead of a Playwright timeout |
| `g.assess(page, x, y)` / `g.assessElement(locator)` | What a click would hit, without clicking |
| `g.visibleText(page)` / `g.hiddenText(page)` / `g.pageRisk(page)` | Read the page safely |
| `g.events(page)` / `g.interventions` | What the engine blocked in the page / what was refused or closed on the Node side |

Options: `protectMouse` (default `true`), `closeRogueTabs` (default `true`), `onIntervention`, `policy` (`{ mode: "report" }` to log without blocking).

## Limits
- Chromium only. The engine targets Chromium and is tested there.
- `visibleText()` removes *hidden* text. Visible prompt injection still reaches your model.
- Coordinates are checked in the top-level page. Clicks inside same-origin frames are protected by that frame's own engine.
- A frame hidden by a stylesheet change in the very instant before a raw CDP click can slip through. Frames are re-checked on every DOM change and every 500 ms.

Python: [`nullify-guard`](https://pypi.org/project/nullify-guard/). MCP server: [`@nullifyads/mcp`](https://www.npmjs.com/package/@nullifyads/mcp). Source, benchmark and the browser extension: https://github.com/Aryavvij/nullify

MIT License.
