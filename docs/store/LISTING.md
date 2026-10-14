# Chrome Web Store listing: Nullify 0.1.0

Everything to paste into the developer dashboard. Images are in this folder; the upload package is built with `npm run package:extension` → `release/nullify-extension-0.1.0.zip`.

## Store listing tab

**Name:** Nullify

**Summary** (132 characters max; this is 129):
> Stops pop-ups and redirects that hijack your clicks, including ones from invisible layers, and shows you exactly what it blocked.

**Category:** Privacy & Security
**Language:** English

**Description:**
> Some pages turn your click into something you didn't ask for. An invisible layer sits on top of a video player, and your click opens an ad tab behind your back. A script sends your tab to a different site. A "close" button is really something else.
>
> Nullify watches what a click actually does, not just where the page sends you, so it stops these tricks even when the ad domain is too new to be on any blocklist.
>
> What it does
> • Blocks pop-ups and pop-unders that a click didn't ask for, including ones opened through hidden links, hidden forms and invisible frames.
> • Stops redirects that send your tab to another site when you clicked on something that isn't a link.
> • Removes invisible layers that steal clicks, and keeps them gone if the page puts them back.
> • Leaves normal things alone: login and payment pop-ups, links that open in a new tab, video players, menus and cookie banners keep working.
> • Flags pages that look like tech-support scams (fake virus alerts, support phone numbers).
> • Shows what it did, in plain words: the toolbar badge counts what was blocked, the popup lists it, and "See what happened" replays each block step by step.
> • One switch turns it off for any site.
>
> Nullify works alongside your ad blocker. Ad blockers stop known ad and tracker domains; Nullify stops the click itself from being hijacked. In our tests, a list-based blocker let these tricks through on domains its lists didn't know, and Nullify stopped them.
>
> Private by design: Nullify runs entirely in your browser. It sends nothing anywhere, has no account, no analytics, and loads no code from the internet.

**Screenshots** (1280×800): `screenshot-1-blocked.png`, `screenshot-2-replay.png`, `screenshot-3-scam.png`
**Small promo tile** (440×280): `promo-small-440x280.png`
**Store icon:** packaged in the zip as `icons/icon-128.png` (96 px artwork, 16 px transparent padding).

## Privacy practices tab

**Single purpose description:**
> Nullify protects your clicks: it stops web pages from turning a click into a pop-up, a redirect to another site, or a click on something invisible, and shows you what it stopped.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `scripting` | Registers Nullify's protection script so it runs on each page before the page's own scripts (that's when hijacking code sets its traps), and re-registers it without the sites the user switches off. |
| `storage` | Saves the user's per-site on/off choice (`storage.local`) and the list of what was blocked in each tab (`storage.session`, which stays in memory and is cleared when the browser closes). |
| `webNavigation` | Starts a fresh "what was blocked" list when a tab loads a new page, and notices when a page opens a new tab, so a tab that opened to a site Nullify had just blocked in that same tab can be closed. |
| Host permission `<all_urls>` | Click-hijacking traps can appear on any website, so the protection script has to run on every page. It runs locally and sends nothing off the device. |

**Remote code:** No, I am not using remote code. (All code is in the package. The shipped scripts contain no `fetch`, `XMLHttpRequest`, WebSocket, `eval` or `new Function`, and no external URLs.)

**Data usage:** tick no data types. Nullify reads the pages you visit only inside your browser, to spot traps, and doesn't collect or transmit anything. Then certify all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** the published address of [PRIVACY.md](PRIVACY.md). It has to be publicly reachable; see "Before you submit" in [README.md](README.md).
