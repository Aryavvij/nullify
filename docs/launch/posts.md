# Launch post drafts

Edit freely, and keep every number traceable to `bench/results/`. Don't post these until the packages are published and the repository is public.

---

## Show HN

**Title:** Show HN: Nullify – stops AI browser agents (and people) from being clickjacked

**Body:**
> Browser agents that click by screen coordinates press whatever is on top at that point, including things a person can't see: a transparent button stacked on "No thanks", an invisible frame over "Close", a layer over a video player that opens an ad tab.
>
> I built a benchmark for this (18 trap pages, 13 normal flows). An unprotected coordinate-clicking agent was hijacked by 18/18 traps. Playwright's `locator.click()` refuses some covered targets, but only by timing out without a reason.
>
> Nullify checks each click before it happens and again inside the real pointer event. If the click wouldn't land on what's visible, it refuses with a reason the agent can use ("the click would land on an invisible control instead of 'No thanks'"). With it: 0/18 hijacks, 13/13 normal flows still work, about 1 ms per click.
>
> It ships as an npm/PyPI library for Playwright agents, an MCP server, and a Chrome extension for people. Compared with uBlock Origin Lite on the human-facing traps, the two complement each other: uBlock blocks known ad domains; Nullify stops the click itself, including on domains no list knows yet.
>
> Limits are in the README (Chromium only; it removes *hidden* prompt injection, not visible text). Benchmark, demo video and code: https://github.com/Aryavvij/nullify. I'd love to hear from people running agents in production: what do your agents trip over?

---

## r/LocalLLaMA / r/AI_Agents

**Title:** I benchmarked how often browser agents get clickjacked: 18/18 for an unprotected coordinate-clicking agent. Here's an open-source fix.

**Body:**
> If your agent clicks by coordinates (computer-use style) or sends raw CDP input, it clicks whatever is on top, visible or not. I wrote 18 local trap pages (invisible buttons, invisible frames, overlays that appear after the screenshot) and 13 normal flows, and measured.
>
> - Unprotected vision agent: hijacked 18/18
> - Raw CDP agent: 17/17 (one trap can't fire for it)
> - With Nullify: 0/18, normal flows 13/13, ~1 ms per click
>
> It refuses bad clicks with a reason the model can act on, and `visibleText()` gives the model page text without hidden instructions. npm: `@nullify/agent-guard`, pip: `nullify-guard`, and an MCP server: `@nullify/mcp`. MIT. Repo with the benchmark and a 66-second demo: https://github.com/Aryavvij/nullify
>
> Looking for people running agents in production to tell me what breaks. What does your agent trip over?

---

## browser-use / Stagehand / Playwright MCP community message

> Hi all. I've been working on click safety for browser agents and wanted to share it in case it's useful here. `@nullify/agent-guard` checks each Playwright click (coordinates or element) against what's actually under the pointer, refuses clicks that would hit invisible controls, frames or layers, and gives a reason the agent can act on. On my benchmark it took an unprotected coordinate agent from 18/18 hijacked to 0/18 without breaking normal flows. Repo: https://github.com/Aryavvij/nullify. Would an integration with [framework] be welcome? Happy to open a PR if so.

---

## Short post (X / LinkedIn)

> Browser agents click whatever is on top, even when it's invisible. My benchmark: an unprotected coordinate-clicking agent fell for 18/18 traps. With Nullify: 0/18, normal flows unaffected, ~1 ms per click. Open source: library, MCP server and Chrome extension. https://github.com/Aryavvij/nullify
