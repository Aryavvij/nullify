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

## Only you can do these
1. **Choose a contact address** and put it in the last line of [PRIVACY.md](PRIVACY.md).
2. **Publish the privacy policy at a public address.** The repository is private, so a link to the file won't work for the store. Options: make the repository public and use GitHub Pages, or paste the policy into a public GitHub Gist.
3. **Check the name.** Other products may already be called "Nullify". Search the Chrome Web Store and do a quick trademark search before you commit to the name.
4. **Register as a Chrome Web Store developer** (one-time fee) at the Chrome Web Store developer dashboard.
5. **Upload the zip, paste the listing, upload the images, fill in the privacy tab, and submit.** Consider **Unlisted** visibility for the first version, so you can install it from the store and check it before it's public.

## What to expect in review
Access to all sites (`<all_urls>`) plus `scripting` usually triggers a longer, in-depth review. The permission justifications in LISTING.md explain why each one is needed. Keep the single purpose narrow in any future version: don't add unrelated features to the same extension.
