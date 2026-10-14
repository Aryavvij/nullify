# @nullifyads/mcp

An MCP server that gives an AI agent a browser where every click is checked by [Nullify](https://github.com/Aryavvij/nullify). A click lands on what is visible, or is refused with a reason. Page text comes back without hidden instructions.

## Use it with Claude Code
```bash
npx playwright install chromium        # once: the browser it drives
claude mcp add nullify -- npx -y @nullifyads/mcp
```

Any MCP client works: run `npx -y @nullifyads/mcp` as a stdio server.

## Tools
| Tool | What it does |
|---|---|
| `browser_navigate` | Open an http(s) URL. Returns the page title and a risk summary, with a warning if the page hides text aimed at an AI |
| `browser_screenshot` | PNG of the current tab (1280×720) |
| `browser_click` | Click at screenshot coordinates. Refused with a reason if it would land on something invisible |
| `browser_click_element` | Click a CSS selector. Refused with a reason if something else would receive the click |
| `browser_type`, `browser_press` | Keyboard input |
| `page_text` | Text a person can see on the page. Hidden text is left out |
| `page_risk` | Invisible overlays, count of hidden instructions, scam signals, blocked hijacks |
| `browser_close` | Close the browser |

## What it won't do
- Open anything but http(s) URLs.
- Return hidden text. `page_text` drops it, and `page_risk` only counts hidden instructions, it never quotes them.
- Make your agent safe on its own. Visible text on a page can still try to instruct the model.

## Settings
| Variable | Effect |
|---|---|
| `NULLIFY_HEADLESS=0` | Show the browser window |
| `NULLIFY_CHROMIUM_ARGS` | Extra Chromium flags, e.g. `--lang=en` |

MIT License.
