# NullBench: Nullify vs uBlock Origin Lite

2026-10-13 · Chromium 156.0.8078.4 · uBlock Origin Lite 2026.1012.1545 (default settings) · 13 human-facing traps × 2 destinations, 13 normal flows

Every trap is clicked the way a person would (real mouse). Each runs twice: once sending you to a **made-up domain no filter list knows** (like a new or rotated ad domain), and once to **pop-under ad networks on uBlock Origin Lite's default lists** (popads.net, popcash.net). Every name resolves to this machine, so nothing is contacted.

## What the person ends up with

| Protection | Unknown ad domain: prevented / ad blocked but tab or page lost / hijacked | Known ad network: prevented / ad blocked but tab or page lost / hijacked |
|---|---|---|
| No blocker | 0 / 0 / 13 | 0 / 0 / 13 |
| uBlock Origin Lite | 0 / 0 / 13 | 0 / 13 / 0 |
| Nullify | 13 / 0 / 0 | 13 / 0 / 0 |
| uBlock Origin Lite + Nullify | 13 / 0 / 0 | 13 / 0 / 0 |

Out of 13 traps per column.

## Normal flows still working

| Protection | Completed |
|---|---|
| No blocker | 13/13 |
| uBlock Origin Lite | 13/13 |
| Nullify | 13/13 |
| uBlock Origin Lite + Nullify | 13/13 |

## Per trap

| Trap | Destination | No blocker | uBlock Origin Lite | Nullify | uBlock Origin Lite + Nullify |
|---|---|---|---|---|---|
| invisible overlay div | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| invisible overlay div | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| invisible overlay link | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| invisible overlay link | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| page-wide pop-under listener | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| page-wide pop-under listener | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| re-arming overlay (two clicks) | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| re-arming overlay (two clicks) | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| same-tab redirect on click | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| same-tab redirect on click | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| link hijack | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| link hijack | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| a.click() bypass | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| a.click() bypass | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| synthetic click bypass | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| synthetic click bypass | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| target=_blank form bypass | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| target=_blank form bypass | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| iframe escape (contentWindow) | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| iframe escape (contentWindow) | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| iframe escape (window.frames) | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| iframe escape (window.frames) | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| blank window then navigate | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| blank window then navigate | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |
| overlay injected after load | unknown | ❌ hijacked | ❌ hijacked | ✅ prevented | ✅ prevented |
| overlay injected after load | known | ❌ hijacked | 🟡 ad blocked | ✅ prevented | ✅ prevented |

## How to read this

- **uBlock Origin Lite works from lists.** On a listed ad network it blocks the ad's content, but a pop-up tab still opens (showing its warning page) and a same-tab redirect still replaces the page you were on. On a domain its lists don't know yet, nothing stops the trap.
- **Nullify works from behaviour.** It refuses the pop-up or redirect itself, so no tab opens and the page stays, whatever the destination.
- **They are complementary.** uBlock Origin Lite also blocks ads, trackers and malware on the pages you visit, which Nullify doesn't try to do. Running both is the intended setup.
- **Limits:** these are hand-built pages, not captures of real sites. uBlock Origin Lite's cosmetic filters and site-specific scriptlets target known sites, so they can't apply to pages like these, which no list has seen. This comparison is about **new or rotated domains and the click itself**, not about overall ad blocking.
