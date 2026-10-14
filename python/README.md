# nullify-guard

Stops AI browser agents from being clickjacked. Playwright-Python wrapper for [Nullify](https://github.com/Aryavvij/nullify) Agent Guard: every click lands on what is visible at that point, or is refused with a reason the agent can act on.

```bash
pip install nullify-guard
playwright install chromium
```

```python
from playwright.async_api import async_playwright
from nullify_guard import guard, NullifyBlockedError

async with async_playwright() as p:
    browser = await p.chromium.launch()
    context = await browser.new_context()
    g = await guard(context)                 # before any navigation
    page = await context.new_page()
    await page.goto("https://example.com")

    try:
        await page.mouse.click(400, 300)     # checked automatically
    except NullifyBlockedError as e:
        print(e)                             # says what was really under the pointer

    text = await g.visible_text(page)        # page text without hidden text, for your model
```

Sync Playwright: `from nullify_guard.sync_api import guard` (same methods, without `await`).

| Call | What it does |
|---|---|
| `guard(page_or_context, ...)` | Injects the engine and returns a guard; `page.mouse` clicks are then checked |
| `g.click(page, x, y)` / `g.click_element(locator)` | Checked clicks; the element version fails immediately with a reason |
| `g.assess(page, x, y)` / `g.assess_element(locator)` | What a click would hit, without clicking |
| `g.visible_text(page)` / `g.hidden_text(page)` / `g.page_risk(page)` | Read the page safely |
| `g.interventions` | Clicks refused and tabs closed so far |

Same engine and behaviour as the npm package [`@nullifyads/agent-guard`](https://www.npmjs.com/package/@nullifyads/agent-guard), including its limits: Chromium only, and visible prompt injection still reaches your model.

MIT License.
