# Launch posts

Every number here comes from `bench/results/`. Edit the wording into your own voice before posting.

---

## Show HN

**Title** (77/80 characters):
Show HN: Nullify – stop AI browser agents (and people) from being clickjacked

**URL:** https://github.com/Aryavvij/nullify

**First comment** (post it right after submitting):

> Hi HN. I built Nullify because browser agents click whatever is on top of the page, even when it's invisible.
>
> An agent that clicks by screen coordinates (computer-use style) or sends raw CDP input presses whatever element is at that point. Pages already put things there: a transparent "Confirm" button stacked on "No thanks", an invisible iframe over "Close", a full-page layer over a video player that opens an ad tab. Playwright's `locator.click()` refuses some covered targets, but only by timing out without saying why, and coordinate or CDP clicks get no protection at all.
>
> Nullify injects a small engine before the page's own scripts run. It checks each click before it's sent and again inside the real pointerdown event, so nothing can slip in between. If the click wouldn't land on what's visible, it's refused with a reason the agent can act on, e.g. `the click would land on an invisible control (button#hidden-confirm) instead of what is shown (button#no-thanks "No thanks")`. It also blocks pop-ups and redirects that a click didn't ask for, and gives the model page text with hidden text removed.
>
> Numbers from the benchmark in the repo (18 local trap pages, 13 normal flows, scripted agents):
> - coordinate-clicking agent: hijacked 18/18 → 0/18
> - raw-CDP agent: 17/17 → 0/17
> - normal flows (OAuth and payment pop-ups, video players, menus, custom file pickers): 13/13 still work
> - about 0.7 ms extra per click
>
> There's also a Chrome extension for people. Compared with uBlock Origin Lite on the 13 human-facing traps: on ad domains no filter list knows, uBlock Origin Lite let 13/13 through and Nullify prevented 13/13. On known pop-under networks, uBlock Origin Lite blocks the ad's content but a tab still opens or the page still gets replaced. They're complementary: lists for known-bad domains, behaviour for the click itself.
>
> Try it:
> - Playwright (Node): `npm i @nullifyads/agent-guard`; Python: `pip install nullify-guard`
> - MCP (e.g. Claude Code): `claude mcp add nullify -- npx -y @nullifyads/mcp`
> - Extension: zip in the GitHub release (store listing pending). Test pages that hijack clicks harmlessly: https://aryavvij.github.io/nullify/try/
>
> Limits, also in the README: the benchmark agents are scripted, not LLMs (running real computer-use agents through it is next); the trap pages are hand-built reproductions, not captures from the wild; Chromium only; it strips hidden prompt injection, not visible text.
>
> MIT licensed. I'd especially like to hear from people running agents in production: what do your agents trip over?

---

## Reddit: agent builders (r/LocalLLaMA, r/AI_Agents)

**Title:** I measured how often browser agents get clickjacked by invisible elements (18/18) and built an open-source guard

**Body:**

> If your agent clicks by coordinates (computer-use style) or sends raw CDP input, it clicks whatever is on top at that point, visible or not: a transparent button stacked on "No thanks", an invisible iframe over "Close", a layer over a video that opens an ad tab.
>
> I built 18 local trap pages and 13 normal flows and measured:
> - Coordinate-clicking agent: hijacked 18/18
> - Raw-CDP agent: 17/17 (one trap needs pointer movement, which raw CDP clicks don't make)
> - Playwright `locator.click()`: refuses 9 of the 18, but only by timing out with no reason
>
> With Nullify: 0/18, the 13 normal flows still work (OAuth and payment pop-ups, video players, menus), about 0.7 ms per click. Refused clicks come back with a reason the model can use, and `visibleText()` gives it page text without hidden instructions.
>
> - Node / Playwright: `npm i @nullifyads/agent-guard`
> - Python: `pip install nullify-guard`
> - MCP server: `npx -y @nullifyads/mcp`
>
> Repo, benchmark and a 66-second demo: https://github.com/Aryavvij/nullify (MIT)
>
> Honest limits: the benchmark agents are scripted, not LLMs. Real computer-use agents are next. It's Chromium only, and it strips hidden injected text, not visible text.
>
> If you run browser agents, what do they trip over? I'm looking for real cases to add to the benchmark.

---

## Reddit: everyday users (r/chrome_extensions, r/browsers)

**Title:** I made a free extension that stops pop-ups and redirects from invisible layers, even from ad domains no blocklist knows yet

**Body:**

> You know the streaming sites where clicking "play" opens an ad tab instead? Usually there's an invisible layer over the player catching your click. Ad blockers stop these when the ad domain is on their lists, but new domains get through.
>
> Nullify watches what a click actually does instead. If you clicked on an invisible layer, plain text or a video, and the page tries to open a pop-up or send your tab elsewhere, it refuses. Normal links, login pop-ups and payment windows keep working.
>
> I compared it with uBlock Origin Lite on 13 test traps:
> - Ad domains no list knows: uBlock Origin Lite let 13/13 through, Nullify stopped 13/13
> - Known pop-under networks: uBlock Origin Lite blocked the ad, but a tab still opened or the page was replaced; Nullify stopped all 13
>
> Use them together: uBlock for known ads and trackers, Nullify for the click itself.
>
> - The toolbar badge counts what was blocked; the popup explains it in plain words; "See what happened" replays each block step by step
> - One switch turns it off for any site
> - It flags pages that look like tech-support scams
> - Runs entirely in your browser: no data collected, no account, no remote code
>
> Try it on harmless test pages: https://aryavvij.github.io/nullify/try/
> Download (Chrome Web Store listing pending): https://github.com/Aryavvij/nullify/releases/latest
>
> Free and open source (MIT). Feedback welcome, especially sites where it gets something wrong.

---

## Before and after posting
- **Read each subreddit's rules first.** Many limit self-promotion or require a flair. r/webdev, for example, keeps project posts to its Showoff Saturday threads.
- **Post one place at a time**, a few days apart, so you can answer everyone.
- **Show HN:** post on a weekday morning, US time, and stay for the first two or three hours to answer comments. Never ask anyone to upvote.
- **Questions to expect:**
  - "Does it work with real LLM agents?" Not benchmarked yet; say so.
  - "False positives?" 13/13 normal flows, 12 popular sites unaffected.
  - "Why not just uBlock?" Different job; use both.
  - "How does it know what's invisible?" Opacity, size and stacking checks at the click point, re-run inside the real click event.
  - "How did you build it?" Answer honestly.
