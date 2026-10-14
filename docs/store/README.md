# Publishing Nullify to the Chrome Web Store

## What's ready
| Item | Where | Check |
|---|---|---|
| Upload package | `release/nullify-extension-0.1.0.zip` (`npm run package:extension`) | 15 files, 32 KB, `manifest.json` at the root. The packaged copy was unzipped and loaded on its own, and it blocked a test trap |
| Listing text, privacy-tab answers | [LISTING.md](LISTING.md) | Summary 129/132 characters; one justification per permission |
| Privacy policy | [PRIVACY.md](PRIVACY.md) | Matches the data answers: nothing collected or sent |
| Screenshots, 3 × 1280×800 | `screenshot-1-blocked.png`, `screenshot-2-replay.png`, `screenshot-3-scam.png` | Real UI, rendered at 2× so text stays readable at the store's 640×400 |
| Small promo tile, 440×280 | `promo-small-440x280.png` | No text, saturated colour, fills the tile (store guidelines) |
| Store icon, 128×128 | inside the zip (`icons/icon-128.png`) | 96 px artwork + 16 px transparent padding (store guidelines) |
| No remote code | verified in the shipped bundles | No `fetch`, `XMLHttpRequest`, WebSocket, `eval`, `new Function`, or external URLs |
| Doesn't break real sites | [real-site-check.md](real-site-check.md) (`node scripts/real-site-check.mjs`) | 12 popular sites: same titles and links with and without Nullify, nothing blocked, no errors |
| Doesn't break normal flows | NullBench (`npm run nullbench`) | 13/13 login, payment, video, menu, upload and other flows work |

Regenerate the images with `npm run store:assets`.

## Done
- Privacy policy contact: GitHub Issues. Published at https://aryavvij.github.io/nullify/store/PRIVACY (GitHub Pages).
- Name check (14 Oct 2026): no Chrome Web Store extension is called "Nullify". A Firefox add-on with that name exists (a page-decluttering tool). This was not a legal trademark search.

## Only you can do these
1. Register as a Chrome Web Store developer.
2. Upload the zip, paste the listing, upload the images, fill in the privacy tab, and submit.

## What to expect in review
Access to all sites (`<all_urls>`) plus `scripting` usually triggers a longer, in-depth review. The permission justifications in LISTING.md explain why each one is needed. Keep the single purpose narrow in any future version: don't add unrelated features to the same extension.
