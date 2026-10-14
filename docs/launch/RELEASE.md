# Releasing Nullify 0.1.0

Everything below publishes something publicly, so run each step yourself. All packages were built, installed from their tarballs or wheel into empty projects, and used successfully before this was written.

## 0. Before anything
- [ ] Put a contact address in the last line of `docs/store/PRIVACY.md`.
- [ ] Run the full test suite: `npm run test:all` (should be all green).
- [ ] Check the name: search the Chrome Web Store, npm and GitHub for "Nullify" products, and do a quick trademark search.

## 1. Repository
Public since 14 October 2026. Turn on GitHub Pages (Settings → Pages → deploy from `main`, folder `/docs`), so the privacy policy is reachable at `https://aryavvij.github.io/nullify/store/PRIVACY`.

## 2. npm (in this order: each package depends on the one before)
First create a free organization named **nullify** on npmjs.com (avatar menu → Add Organization; the npm command line can't create one). If that name is taken, rename the packages to `nullify-core`, `nullify-agent-guard` and `nullify-mcp`, all free on 13 Oct 2026.
```bash
npm login
npm run build
npm publish -w core
npm publish -w agent-guard
npm publish -w mcp
```

## 3. PyPI
Create an API token at pypi.org (Account settings → API tokens), then:
```bash
npm run build                   # copies the engine bundle into the Python package
cd python && rm -rf dist && uv build && uv publish
```

## 4. GitHub release
```bash
npm run package:extension
git tag v0.1.0 && git push origin v0.1.0
gh release create v0.1.0 release/nullify-extension-0.1.0.zip --title "Nullify 0.1.0" --notes-file CHANGELOG.md
```

## 5. Chrome Web Store
Follow `docs/store/README.md`: upload the zip, paste `docs/store/LISTING.md`, upload the images, use the Pages URL from step 1 as the privacy policy, and submit. Unlisted visibility is a good first step.

## 6. Check it worked
```bash
npm view @nullify/agent-guard version   # 0.1.0
pip index versions nullify-guard        # 0.1.0
```
