# Real-site check

2026-10-13 · the same Chromium build with and without Nullify · 12 popular sites, loaded and scrolled (no clicks, no logins, no forms)

| Site | Loaded (without / with) | Same title | Links without → with | Nullify blocked / removed | Noticed only | Errors from Nullify's code |
|---|---|---|---|---|---|---|
| en.wikipedia.org | ✅ / ✅ | yes | 1223 → 1223 | 0 / 0 | 1 | 0 |
| github.com | ✅ / ✅ | yes | 143 → 143 | 0 / 0 | 0 | 0 |
| stackoverflow.com | ✅ / ✅ | yes | 233 → 233 | 0 / 0 | 0 | 0 |
| developer.mozilla.org | ✅ / ✅ | yes | 160 → 160 | 0 / 0 | 0 | 0 |
| www.bbc.com | ✅ / ✅ | yes | 159 → 159 | 0 / 0 | 0 | 0 |
| www.nytimes.com | ✅ / ✅ | yes | 0 → 0 | 0 / 0 | 0 | 0 |
| www.reddit.com | ✅ / ✅ | yes | 6 → 6 | 0 / 0 | 0 | 0 |
| www.amazon.com | ✅ / ✅ | yes | 184 → 186 | 0 / 0 | 0 | 0 |
| www.youtube.com | ✅ / ✅ | yes | 8 → 8 | 0 / 0 | 0 | 0 |
| www.espn.com | ✅ / ✅ | yes | 324 → 324 | 0 / 0 | 1 | 0 |
| www.imdb.com | ✅ / ✅ | yes | 0 → 0 | 0 / 0 | 0 | 0 |
| weather.com | ✅ / ✅ | yes | 0 → 0 | 0 / 0 | 0 | 0 |

## Anything Nullify blocked or removed

Nothing. With no clicks, there was nothing for Nullify to stop on these sites.

## Notes

- Link counts differ a little between any two loads of a live site (rotating content and ads). A large drop with Nullify would mean it broke something.
- Some sites show bot checks or consent walls to automated browsers. When that happens it affects both columns the same way.
- A load that fails is tried once more, on either side alike, since live sites time out now and then.
- This is a smoke test of page loading only. Clicking is covered by the 13 normal flows in NullBench, all of which work with Nullify.
