# Changelog

## 0.1.0 (first release)

**For AI agents**
- `@nullifyads/agent-guard` (npm) and `nullify-guard` (PyPI): every Playwright click lands on what is visible, or is refused with a reason the agent can act on. That covers invisible controls, invisible layers over buttons, invisible frames, and targets covered by something else. A shield inside the page re-checks during the click itself.
- Blocks pop-ups and redirects a click didn't ask for, and closes tabs opened without approval.
- `visibleText()` returns page text without hidden text; `pageRisk()` summarises overlays, hidden instructions and scam signals.
- `@nullifyads/mcp`: an MCP server with a protected browser (navigate, screenshot, checked clicks, visible page text, page risk).

**For people**
- Chrome extension: blocks pop-ups, pop-unders and redirects from invisible layers and stray clicks, removes click-stealing layers, flags tech-support scam pages, and shows each block as a step-by-step chain. On/off switch per site.

**Measured (NullBench, scripted agents)**
- Attack success: vision agent 100% → 0%, raw-CDP agent 100% → 0%, DOM agent 50% → 0% (Playwright timed out on the rest).
- 13/13 normal flows still work. Added time per click: about 0.7 ms (vision), 1.5 ms of checks (DOM).
- Compared with uBlock Origin Lite on 13 human-facing traps: unknown ad domains 13/13 prevented vs 13/13 hijacked; known pop-under networks 13/13 prevented vs 13/13 "ad blocked, but a tab still opened or the page was replaced".
