# Nullify: Build Plan

## What we're making
**Nullify** is an open-source security layer that stops **click hijacks** (invisible overlays, rogue pop-ups and tabs, malicious redirects, hidden instructions) for both **AI browser agents** and **humans**.

| Deliverable | Who it's for | Role |
|---|---|---|
| **`@nullify/core`** | Everything below | One detection engine. The shared brain. |
| **Nullify Agent Guard** (npm + pip + MCP server) | Developers running browser agents (browser-use, Stagehand, Playwright MCP, in-house agents) | **The headline product.** Blocks hijacked clicks before the agent makes them. |
| **Nullify Extension** (Chrome/Edge, MV3) | Everyday users | Demo, showcase, and a data source. Not the main product. |
| **NullBench** | Researchers and agent developers | A public benchmark for agent clickjacking. The asset most likely to get cited. |

**Pitch:** *"AI agents click whatever is on top. Attackers put invisible traps on top. Nullify checks every click before it happens, for agents and for people."*

**Goals:** (1) protection you can measure, proven by an open benchmark; (2) real use by people who run browser agents.

**What we don't claim:** "100%" or "no alternatives." We claim measured results ("attack success went from X% to Y%").

---

## Architecture
```
                         @nullify/core
   (overlay · click-intent · rogue-tab · redirect · hidden-text · scam detectors)
          ┌──────────────────┼───────────────────┬────────────────────┐
     Agent Guard          Extension            NullBench           (Phase 5) Crawler
  Playwright hook /    MV3 MAIN + ISOLATED   fixtures + agent       data → filter list
  browser-use plugin /   worlds, popup,       eval harness
  MCP server             replay UI
```
The core is page-agnostic. The same detector file is injected by the extension, by Playwright's `addInitScript`, and by the crawler.

---

## Phase 0: Setup (week 1)
- Monorepo: `core/`, `agent-guard/`, `extension/`, `bench/`, `crawler/` (empty for now).
- TypeScript, a bundler (esbuild) producing one injectable `core.js`, and a test runner (Vitest + Playwright).
- **Done when:** `core.js` loads on a local page via both the extension and a Playwright script, and logs from both.

## Phase 1: Core detection engine + fixtures (weeks 2–4)
**Detectors:**
1. **Click-intent check (`window.open` guard).** ⚠️ This *does not* use `event.isTrusted`, because hijacks fire on real clicks. Instead, block a `window.open` or navigation when **what the user clicked doesn't explain what opened**:
   - the click landed on an overlay, a document/body listener, or a video/iframe area, **and**
   - no `<a>`/button with a matching URL or target was clicked, **and**
   - the destination is an unrelated eTLD+1.
2. **Overlay detector.** Near-transparent element, covers >50% of the viewport or sits over a `<video>`/`<iframe>`, high z-index, catches pointer events. Re-checked by a MutationObserver plus a short interval, because traps re-arm.
3. **Redirect guard.** Same-tab `location` changes to unrelated domains without a matching link click.
4. **Hidden-text finder.** Text that is in the DOM or accessibility tree but not visible: white-on-white, zero-size, off-screen, `opacity:0`, clipped, hidden aria-labels.
5. **Scam page heuristics.** Fake virus alerts, "press Allow", countdowns, fake OS dialogs, `Notification.requestPermission` on load. (Low priority, because Chrome already covers this.)

**MAIN ↔ ISOLATED world messaging:** use a per-load random channel token so page scripts can't fake messages.

**Fixtures (`bench/fixtures/`):** one local page per attack pattern (overlay on player, page-wide click listener → pop-under, re-arming trap, same-tab redirect, TOCTOU overlay injected after a delay, hidden instructions) **plus a legit set**: OAuth popup, Stripe/PayPal popup, print dialog, cookie banner, real video player, target=_blank links.

**First test to write:** a real click on an overlay over a video is **blocked**, and a real click on an OAuth "Sign in" button is **allowed**.

**Done when:** every attack fixture is caught and the legit set has 0 false positives.

### ✅ Phase 1 status (done)
- **13/13 attack scenarios blocked** in both hosts (Agent Guard + extension). Each one is also run unprotected to prove the fixture really hijacks.
- **11/11 legit flows work, with 0 interventions**: OAuth popup (incl. after an `await`), delegated payment popup, target=_blank link, clickable card, same-site popup, button → payment redirect, SSO redirect on load, video player click layer, menu backdrop, cookie banner.
- Hidden-text finder catches 5/5 hidden instructions (same colour, 0px font, off-screen, opacity 0, aria-label) and ignores a closed menu and faint-but-readable text. Screen-reader-only text is reported as hidden but *not* as an instruction.
- Scam score flags the tech-support page and not a news article about malware.
- Also closes bypasses not in the original plan: `a.click()`, synthetic click events, target=_blank forms, `window.open` taken from a fresh iframe (`contentWindow` and `window.frames`), and `window.open()` followed by setting the URL.
- Tests: 19 unit + 67 end-to-end, stable across 3 repeated runs.

**Decision:** the MAIN ↔ ISOLATED channel moved to Phase 4, where the popup/event log first needs it. All detectors run in the MAIN world using native functions captured before page scripts run (`core/src/pristine.ts`).

**Known gaps (on purpose, documented):**
1. A page-wide hijack listener that fires when the user clicks a *real* control (e.g. the play button) is allowed. The click explains a popup.
2. Redirects with no click at all are **reported, not blocked**, because SSO logins look identical. Phase 2 agent mode can be stricter.
3. An iframe inserted via `innerHTML` and then used synchronously through `window.frames[n]` before our MutationObserver runs.
4. A cross-origin ad iframe navigating the top window after a click inside the ad.
5. Site comparison uses a short public-suffix list, not the full PSL.
6. Pages can detect Nullify (`data-nullify`, `__nullify`). Fine for users and agents, but it matters for the Phase 5 crawler (cloaking).
7. `navigator.keyboard.lock` only exists on HTTPS, so the fixture (HTTP) doesn't exercise it.

## Phase 2: Agent Guard, the headline product (weeks 5–8)
**Two modes, because there are two kinds of agents:**

| Mode | Agents | What the guard knows | Check |
|---|---|---|---|
| **DOM mode** | browser-use, Stagehand, Playwright MCP, selector-based scripts | The intended element | Intended element === `elementFromPoint(x,y)`? If not, and the top element is an invisible overlay → **refuse** |
| **Vision mode** | Claude computer use, OpenAI CUA (coordinate clicks) | Only x, y | Is the topmost element at x,y invisible, oversized or freshly injected? → **refuse or warn** |

**Both modes:**
- **TOCTOU re-check:** rescan for overlays *at click time*, not only when the screenshot was taken.
- **Rogue-tab block:** close tabs the agent didn't ask for.
- **Redirect check:** flag navigations the agent didn't trigger.
- **Hidden-text report:** return invisible text so the agent can remove it from its context.
- Every refusal returns a **reason** the agent can act on (`"blocked: invisible overlay z=9999 covering target"`).

**Packaging:**
- `npm i @nullify/agent-guard`: Playwright/Puppeteer wrapper (`guard(page)` patches `click`).
- `pip install nullify-guard`: wrapper for Playwright-Python and browser-use.
- **MCP server** exposing `safe_click`, `page_risk`, `visible_text`.

**Done when:** a Playwright agent using the guard runs through all fixtures, every hijack attempt is refused, and every legit fixture works.

### ✅ Phase 2 status (done)
**Finding that reshaped the phase:** Playwright's own `locator.click()` already refuses covered elements, but only by **timing out with no reason given**. `page.mouse.click(x, y)` (vision / computer-use agents) and raw CDP input (browser-use style) had **no protection at all** and were hijacked by every overlay test page. So Phase 2 focuses on coordinate clicks, and gives element-based agents an immediate, explained refusal instead of a timeout.

What's built:
- **Pre-click check** (`assessPoint`): what a click at (x, y) really hits. Refuses invisible controls, invisible layers over a visible control, invisible frames, and (for element-based agents) covered targets.
- **In-page click shield:** the same check inside the real `pointerdown`, which cancels the whole click. This closes the gap between check and click and covers raw CDP input that never touches our Node code.
- **Invisible frames made click-through** in agent mode: a cross-site frame can't see that its parent hid it, but the parent page can. The setting is kept even if the page tries to undo it.
- **Rogue-tab closer**, `visibleText()` (page text without hidden text), `pageRisk()`.
- **Safe refusal messages:** only visible, non-instruction text, so a refusal can't become an injection channel.
- **Tamper-resistant in-page API:** it can't be replaced, and the one state-changing call needs a per-session token.
- **Packages:** `@nullify/agent-guard` (npm), `nullify-guard` (Python, async + sync), and `@nullify/mcp` (an MCP server with screenshot / click / type / page_text / page_risk tools).

Results: **18/18 attacks blocked for vision, DOM and raw-CDP agents** (5 new agent clickjacking pages). **13/13 legit flows work with zero interventions** for all three, including custom-styled file pickers and checkboxes (invisible native inputs under a styled label). Tests: 26 unit (incl. 7 MCP) + 152 end-to-end + 6 Python.

**Known gaps:**
1. A frame made invisible by a *stylesheet* change in the instant before a raw CDP click: the frame check runs on DOM/attribute changes and every 500ms, not on stylesheet edits.
2. Clicks inside same-origin child frames are shielded by that frame's own engine; the Node side only reads the top frame's block log.
3. `page_text` removes hidden text, but visible prompt injection can't be filtered by visibility. `pageRisk` counts it as hidden only when it's hidden.

## Phase 3: NullBench, the proof (weeks 8–10)
- Package the fixtures as a **public benchmark**: attack pages + benign task pages + a runner script.
- Run 2–3 real agents (e.g. browser-use with a Claude/GPT model, plus one vision agent) **with and without** the guard.
- **Metrics:**

| Metric | Target |
|---|---|
| Attack success rate, no guard → with guard | e.g. 80–100% → < 10% |
| Benign task completion drop | < 5 points |
| Extra time per click | < 20 ms |
| False positives on legit set | 0 |

- Write it up as an arXiv preprint or workshop paper draft.

### 🟡 Phase 3 status (in progress)
**Done: NullBench runner with scripted agents** (`npm run nullbench` → [bench/results/latest.md](bench/results/latest.md)). It covers 18 attacks and 13 legit flows across 8 configurations: vision / DOM / raw-CDP agents, each with and without Nullify, plus a person with and without the extension.

| Metric | Target | Scripted-agent result |
|---|---|---|
| Attack success rate, no guard → with guard | 80–100% → < 10% | Vision 100% → **0%**, raw CDP 100% → **0%**, DOM 50% → **0%** (Playwright timed out on the other 50%) |
| Benign task completion drop | < 5 points | **0 points** (13/13 everywhere) |
| Extra time per click | < 20 ms | Vision **+0.7 ms**, raw CDP **+0.1 ms**, DOM **+1.5 ms** of Nullify work (+10–12 ms end to end, set by Playwright's frame-aligned waiting) |
| False positives on legit set | 0 | **0** |

Method notes, kept in the report:
- Unprotected runs that don't fire are labelled "didn't fire", not "blocked".
- Scenarios that can't apply to a kind of click (raw CDP has no pointer movement) are n/a and left out of that row's rates.
- Overhead is measured alternating without/with, so machine-load drift hits both sides equally.

**Also done:** a benchmark card ([bench/README.md](bench/README.md)): what it measures, the configurations, the honesty rules the runner follows, how to plug in another agent or protection, and the limits.

**Still to do:**
1. **Model-driven agents** on the same pages, with and without the guard. Not built in this session. Any framework plugs in through the `Click` driver interface described in the benchmark card. Needs an API key and a small budget.
2. Publish NullBench as its own repo (the card is ready).
3. Paper draft.

### 🚦 Checkpoint A: demand check (week ~8)
Publish the guard on GitHub, npm and PyPI. Post it in the browser-use, Stagehand, Playwright MCP and r/LocalLLaMA / AI-agent communities. Talk to 5–10 people who run agents.
- **People care** (stars, issues, "can it support X") → keep pushing adoption after Phase 4.
- **Silence** → finish Phase 4, write the paper, and treat it as a research project.


### 🟡 Checkpoint A status: ready to launch, waiting on you
**Done:**
- Licensed MIT (© 2026 Aryavvij); every package is at version 0.1.0 with full metadata.
- `@nullify/core`, `@nullify/agent-guard` and `@nullify/mcp` were packed, installed from their tarballs into an empty project, and used successfully: a refused trap click, visible-only text, and the MCP server started via its installed command.
- `nullify-guard` was built as a wheel (it includes the engine bundle) and used successfully from a fresh virtual environment.
- Names checked on 13 Oct 2026: all three npm names and the PyPI name are unpublished. The `@nullify` scope needs an npm org of that name, which can only be confirmed when creating it; unscoped fallbacks are free.
- Public README, CHANGELOG, CI workflow (pull requests and manual runs until the repo is public), and the launch kit:
  - [docs/launch/RELEASE.md](docs/launch/RELEASE.md): exact publishing steps;
  - [docs/launch/CHECKPOINT-A.md](docs/launch/CHECKPOINT-A.md): where to post, what to measure, interview guide, go/no-go rule for Phase 5;
  - [docs/launch/posts.md](docs/launch/posts.md): post drafts.

**Yours to do:** follow RELEASE.md (make the repo public, publish to npm and PyPI, create the GitHub release, submit to the Chrome Web Store), then run the two-week demand check in CHECKPOINT-A.md. Phase 5 starts only if that check passes, and only in a throwaway container or VM.
## Phase 4: Extension + demo (weeks 10–12)
- MV3 extension built on the same `core.js`: rogue-tab killer in the service worker, popup with stats, per-site toggle.
- **Replay screen:** when something is blocked, show the chain (site → ad network → … → destination) and the script that did it. This is the demo moment.
- Quick benchmark on human-facing fixtures: no blocker vs uBlock Origin vs Brave vs Nullify, plus page-load overhead (< 5%).
- **Demo video (2 min):** an agent gets hijacked → turn on Nullify → the same agent is protected; then a human gets hijacked → the extension blocks it and replays the chain.

### ✅ Phase 4 status (done, ready to submit)
**Done: the extension's UI and plumbing** (screenshots in `docs/img/`, regenerate with `npm run screenshots`):
- **Secure engine → extension channel.** The engine runs in the page's own JS world, so a page could otherwise forge or read reports. Both sides start before any page script and complete a synchronous handshake that hands over a random secret. Messages then travel only on that secret, using built-ins captured before the page can patch them. The handshake answers only once. A test page tries to learn the secret and to forge events, and fails.
- **Toolbar badge:** the count of things blocked on the current page, or "!" on a likely scam page.
- **Popup:** the count, the last 5 things blocked in plain words, a scam warning, and an **on/off switch per site**. The switch re-registers the engine without that site; it takes effect on reload.
- **Replay page:** every block in the tab across its last 5 pages, drawn as a chain: *this page → the script that did it → what it tried → Blocked*, with a one-sentence explanation. The steps animate in, and there's a Replay button (the animation is off for reduced-motion users).
- **Which script did it:** the engine reads it from the call stack at the moment of the block (informational only).
- **Tab backstop:** if a tab still opens to a site the engine refused moments earlier in that tab, it's closed. It never acts right after the engine approved a popup (a real click on a real link).
- History is kept in memory-only session storage, filed by Chrome's document ID, capped at 5 pages × 100 events per tab, and validated and size-capped as it arrives from pages.
- Tests: 6 new UI and channel tests, plus 5 backstop unit tests; extension suite stable across 5 repeats.

**Also done:**
- **Demo video** ([docs/demo/nullify-demo.mp4](docs/demo/nullify-demo.mp4), 66 s, recorded from real runs with `npm run demo`). It shows a person's click hijacked without protection and blocked with the extension, the replay screen, a coordinate-clicking agent hijacked by an invisible button and then refused with a reason under Agent Guard, and the NullBench numbers read from the latest results.
- **Page-load overhead** of the extension: **about +1.3 ms per page load**, measured against the same Chromium build without it. That's 19–30% of a 5 ms local fixture page, and well under 1% of a real page.

- **Comparison with uBlock Origin Lite** (`npm run compare:ublock`, [results](bench/results/compare-ublock.md)). Chrome no longer runs the classic uBlock Origin, so this uses uBlock Origin Lite 2026.1012.1545, downloaded from its official GitHub releases and checked against GitHub's SHA-256. On 13 human-facing traps:
  - **Unknown ad domain:** no blocker 13/13 hijacked; uBlock Origin Lite 13/13 hijacked; **Nullify 13/13 prevented**.
  - **Known pop-under ad network:** uBlock Origin Lite blocks the ad's content in 13/13, but the tab still opens or the page is still replaced; **Nullify 13/13 prevented**.
  - Both together: 13/13 prevented everywhere. All normal flows work in every setup. Results identical over three runs.
  - Brave isn't included: it can't be driven by this harness.

- **Store readiness** ([docs/store/README.md](docs/store/README.md)):
  - Upload package `release/nullify-extension-0.1.0.zip` (32 KB; the packaged copy was verified on its own).
  - Listing text and privacy-tab answers.
  - Privacy policy.
  - 3 screenshots and the promo tile, following the store's image rules (including the padded 128 px icon).
  - Checked that the shipped code makes no network calls and has no remote code.
  - Real-site check: 12 popular sites look the same with and without Nullify, nothing was blocked, and there were no errors.

**Left for you before submitting:** a contact address in the privacy policy, a public address for it (the repo is private), a check that the name is free, the developer registration, and the upload itself.

## Phase 5: Stretch, only if Checkpoint A was positive
### 🚦 Checkpoint B: crawler test first
Run **one** crawler in a disposable Docker container for 3 days against streaming and piracy sites. If cloaking hides nearly everything, **stop here** and use public datasets instead.

If it works:
- A small crawler fleet (throwaway containers, no credentials) → redirect-chain data.
- An hourly **uBO/AdGuard-compatible filter list** + a **lead-time chart** (how much earlier Nullify sees a domain than public lists).
- Opt-in, anonymized reports from extension users (domains only, k-reporter threshold).
- Abuse reports **reviewed and sent by hand only**.

---

## Risks and rules
- **Safety:** test only on local fixtures. Crawl only in throwaway containers, never from your own machine.
- **False positives** kill adoption faster than missed attacks. The legit fixture set is mandatory in CI.
- **Chrome Web Store review:** MAIN-world patching plus `tabs`/`webNavigation` permissions get scrutiny. Write a clear privacy policy.
- **The window is ~12–18 months.** Agent frameworks will start building this in themselves. Ship the guard early (end of Phase 2) rather than polishing it.
- **Out of scope:** Android app, general ad and tracker blocking, competing with Chrome's scam detection.
