# NullBench

A local benchmark for one question: **when a browser agent (or a person) clicks, does the click do what was intended?** It measures how often a page can redirect a click to something else (a popup, a different site, or an invisible control) and how often a protection layer gets in the way of normal pages.

Everything runs against local pages on `127.0.0.1`. No live site is ever contacted: every `*.test` hostname is mapped to the local fixture server.

## What it measures

| Metric | Meaning |
|---|---|
| **Attack success rate** | Share of attack pages where the click ended up somewhere other than intended: a tab left open, the tab sent to another site, or a hidden control's action ran. Lower is better. |
| **Legit task completion** | Share of normal flows (logins, payments, menus, uploads…) that still work. Higher is better. |
| **Interventions on legit pages** | How many times the protection blocked or removed something on a normal page, i.e. false positives. Should be 0. |
| **Overhead** | Added time per click and per page load, measured alternating without/with. |

## Who clicks

| Configuration | How it clicks |
|---|---|
| `vision/*` | Mouse at screen coordinates (`page.mouse.click`), like screenshot-based agents |
| `dom/*` | Clicks an element chosen from the DOM (`locator.click`), like DOM-based agents |
| `cdp/*` | Raw input events over CDP, bypassing Playwright |
| `person/*` | A real mouse; `person/extension` has the Nullify browser extension installed |

Each agent configuration runs with no protection (`/none`) and with Nullify Agent Guard (`/nullify`).

The agents in this version are **scripted**: they click exactly what each task says. So the numbers measure the protection itself, not a model's judgement.

## Scenarios

- **Attack pages:** 18 (`fixtures/attacks/`). They cover invisible layers over a video player (including ones that re-appear or appear late), page-wide click listeners that open tabs or redirect, ways of opening a tab without `window.open`, and invisible controls or frames stacked over a visible button.
- **Legit flows:** 13 (`fixtures/legit/`). These are pages that legitimately use popups, redirects or invisible layers: OAuth and payment popups, SSO redirects, video click layers, menu backdrops, cookie banners, and custom-styled file pickers and checkboxes.

The full list with per-configuration results is in [`results/latest.md`](results/latest.md). Scenario definitions live in [`tests/cases.ts`](tests/cases.ts).

## Rules the runner follows, so the numbers stay honest

- Every attack page is checked against an unprotected mouse click. If it doesn't fire there, the report flags the page as broken.
- An unprotected run that doesn't fire is reported as **"didn't fire"**, never as "blocked".
- A scenario that can't apply to a kind of click is **n/a** and left out of that row's rates. For example, raw CDP clicks don't move the pointer, so a pointer-move trigger never fires.
- Known gaps are kept in the results, not removed.
- Popups can take hundreds of ms to appear under parallel load, so every run waits 1.5 s before judging.

## Run it

```bash
npm install && npx playwright install chromium
npm run nullbench   # writes results/latest.md and results/latest.json
```

## Adding your own agent or protection

A scenario only needs a way to click: `type Click = (selector: string) => Promise<void>` in `tests/cases.ts`. To benchmark another agent framework or protection layer, add a driver to `clicker()` (or a configuration in `nullbench/run.ts`) that clicks the way that framework does. Every scenario and report section then picks it up.

## Comparison with uBlock Origin Lite

`npm run compare:ublock` runs the 13 human-facing traps, clicked with a real mouse, in four setups on the same Chromium build: no blocker, uBlock Origin Lite (default settings), Nullify, and both together. Each trap sends you either to a **made-up domain no list knows** (like a new or rotated ad domain) or to **pop-under ad networks on uBlock Origin Lite's default lists** (popads.net, popcash.net). All names resolve to this machine.

| What the person ends up with | Unknown ad domain | Known ad network |
|---|---|---|
| No blocker | 13/13 hijacked | 13/13 hijacked |
| uBlock Origin Lite | 13/13 hijacked | 13/13 ad blocked, **but the tab still opened or the page was replaced** |
| Nullify | **13/13 prevented** | **13/13 prevented** |
| Both | 13/13 prevented | 13/13 prevented |

All 13 normal flows work in every setup. The results were identical over three runs. Full report: [`results/compare-ublock.md`](results/compare-ublock.md).

The two tools work differently and complement each other. uBlock Origin Lite blocks known ad, tracker and malware domains everywhere. Nullify stops the click from opening or redirecting anything, whatever the destination. The comparison measures new domains and the click itself, not overall ad blocking.

uBlock Origin Lite isn't committed to this repo. Download it from its official releases into `bench/.vendor/` (exact commands at the top of `nullbench/compare.ts`).

## Limits

- The pages are hand-built reproductions of patterns, not captures of real sites.
- The scripted agents never "notice" anything. A model-driven agent might avoid some traps on its own, or fall for others in ways a script doesn't.
- Chromium only.
