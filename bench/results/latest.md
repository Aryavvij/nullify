# NullBench results

2026-10-13 · Chromium 156.0.8078.4 · Playwright 1.64.0 · darwin 27.0.0 arm64

18 attack scenarios, 13 legit flows, 8 configurations. Agents are scripted: they click exactly what each task says, so these numbers measure the protection, not a model's judgement.

## Attack success rate (lower is better)

| Who is clicking | No protection | With Nullify |
|---|---|---|
| Vision agent (clicks coordinates) | 18/18 (100%) | 0/18 (0%) |
| DOM agent (clicks elements) | 9/18 (50%) | 0/18 (0%) |
| Raw CDP agent (browser-use style) | 17/17 (100%) | 0/17 (0%) |
| Person (real mouse) | 18/18 (100%) | 5/18 (28%) (extension) |

Playwright's own `locator.click()` refuses some covered targets by timing out; those count as not hijacked but are listed separately below. Scenarios that can't fire for a kind of click are marked n/a and left out of that row.

## Legit task completion (higher is better)

| Who is clicking | No protection | With Nullify | Nullify interventions on legit pages |
|---|---|---|---|
| Vision agent (clicks coordinates) | 13/13 (100%) | 13/13 (100%) | 0 |
| DOM agent (clicks elements) | 13/13 (100%) | 13/13 (100%) | 0 |
| Raw CDP agent (browser-use style) | 13/13 (100%) | 13/13 (100%) | 0 |
| Person (real mouse) | 13/13 (100%) | 13/13 (100%) | — |

## Per-scenario results

| Scenario | vision/none | vision/nullify | dom/none | dom/nullify | cdp/none | cdp/nullify | person/none | person/extension |
|---|---|---|---|---|---|---|---|---|
| ⚔️ invisible overlay div | ❌ hijacked | ✅ blocked | ⏱️ Playwright timeout | ✅ refused | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ invisible overlay link | ❌ hijacked | ✅ refused | ⏱️ Playwright timeout | ✅ refused | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ page-wide pop-under listener | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ re-arming overlay (two clicks) | ❌ hijacked | ✅ blocked | ⏱️ Playwright timeout | ✅ refused | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ same-tab redirect on click | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ link hijack | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ a.click() bypass | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ synthetic click bypass | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ target=_blank form bypass | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ iframe escape (contentWindow) | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ iframe escape (window.frames) | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ blank window then navigate | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ overlay injected after load | ❌ hijacked | ✅ blocked | ⏱️ Playwright timeout | ✅ refused | ❌ hijacked | ✅ blocked | ❌ hijacked | ✅ blocked |
| ⚔️ invisible control over a visible button | ❌ hijacked | ✅ refused | ⏱️ Playwright timeout | ✅ refused | ❌ hijacked | ✅ blocked | ❌ hijacked | ❌ hijacked |
| ⚔️ invisible control added after load | ❌ hijacked | ✅ refused | ⏱️ Playwright timeout | ✅ refused | ❌ hijacked | ✅ blocked | ❌ hijacked | ❌ hijacked |
| ⚔️ invisible control added as the pointer moves | ❌ hijacked | ✅ refused | ⏱️ Playwright timeout | ✅ refused | n/a | n/a | ❌ hijacked | ❌ hijacked |
| ⚔️ invisible layer over a visible button | ❌ hijacked | ✅ refused | ⏱️ Playwright timeout | ✅ refused | ❌ hijacked | ✅ blocked | ❌ hijacked | ❌ hijacked |
| ⚔️ invisible cross-site frame over a button | ❌ hijacked | ✅ blocked | ⏱️ Playwright timeout | ✅ blocked | ❌ hijacked | ✅ blocked | ❌ hijacked | ❌ hijacked |
| 🟢 OAuth login popup | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 OAuth popup opened after an await | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 payment popup via delegated listener | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 target=_blank link | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 clickable card (cursor: pointer div) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 same-site popup from a plain div | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 button redirect to payment provider | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 SSO redirect on load | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 video player click layer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 menu with invisible backdrop | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 cookie banner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 custom-styled file picker and checkbox | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 🟢 plain button, clicked three times | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## Overhead

| Click type | Without | With Nullify | Added |
|---|---|---|---|
| Vision agent (clicks coordinates) | 1.7 ms | 2.4 ms | +0.7 ms |
| DOM agent (clicks elements) ¹ | 19.8 ms | 30.2 ms | +10.4 ms |
| Raw CDP agent (browser-use style) | 2.2 ms | 2.3 ms | +0.1 ms |
| Nullify's own checks per DOM click (2 in-page calls) | — | — | +1.5 ms |

Median of 100 clicks each, alternating without/with, measured from the agent's side (includes the pre-click check round trip).

¹ Playwright's `locator.click()` waits on animation frames, so DOM click times fall on ~17 ms steps and the end-to-end difference is mostly frame timing. The row below it times Nullify's added calls directly.

| Page load (`loadEventEnd`) | Without | With Nullify | Added |
|---|---|---|---|
| `/hello.html` | 2.8 ms | 3.3 ms | +0.5 ms |
| `/attacks/hidden-instructions.html` | 3.9 ms | 3.9 ms | +0.0 ms |
| `/legit/video-player.html` | 4.0 ms | 4.1 ms | +0.1 ms |

Median of 40 loads each, alternating without/with, local server. Differences of about a millisecond are within run-to-run noise.

| Page load with the extension (a person browsing, same Chromium build) | Without | With extension | Added |
|---|---|---|---|
| `/hello.html` | 4.5 ms | 5.7 ms | +1.2 ms (+27%) |
| `/attacks/hidden-instructions.html` | 5.0 ms | 6.5 ms | +1.5 ms (+29%) |
| `/legit/video-player.html` | 5.5 ms | 6.6 ms | +1.1 ms (+19%) |

Fixture pages load in a few ms from a local server, so the percentage overstates what a real page (hundreds of ms) would see; the absolute number is the meaningful one.

## Failures and false positives

None.

_Person + extension doesn't cancel clicks (people can see the page), so the agent-only clickjacking scenarios are expected to get through there._
