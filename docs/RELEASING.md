# Releasing Tickslate

Publishing is the maintainer's. Agents prepare a release and stop before
`npm publish`, tagging and creating a GitHub release. This page is the exact
list of what to run, for 0.1.0 and for later versions (replace the version).

## What is already done for 0.1.0

- `CHANGELOG.md` has a `0.1.0 — Unreleased` section, and the per-story
  fragments in `changes/` are folded in and deleted.
- `package.lib.json` and `src/core/index.js` both read `0.1.0`;
  `test/core.test.mjs` fails if they differ, and `verify:package` checks the
  built files against `dist-lib/package.json`.
- Size budgets are re-baselined (`scripts/check-size.mjs`, RFC 0002 §9).

## Before you publish

These steps are the maintainer-only part of
[PUBLIC-CHECKLIST.md](PUBLIC-CHECKLIST.md). Do them in order, because npm
links (homepage, bugs, repository) 404 while the repository is private.

1. **Settle the flagged figures and decide on history.** Answer the figures
   table in the checklist. If any is real, rewrite history (or start a fresh
   root commit) before the repository is public. GitHub keeps pull request
   refs, so ask GitHub Support to purge them after a rewrite. If none is real,
   history can stay.
2. **Make the repository public** (Settings, General, Danger Zone, Change
   visibility). Then check that the homepage, issues and repository URLs in
   `package.lib.json` return 200.
3. **Enable private vulnerability reporting** (Settings, Code security,
   Private vulnerability reporting, Enable).
4. Decide whether to keep the author email in `package.lib.json`. npm shows it
   publicly.
5. Confirm you are logged in to npm as the account that should own the
   package: `npm whoami`. The name `tickslate` was free when last checked
   (`npm view tickslate` returned 404).

## Publish

Run from the repository root, on the merged branch, with a clean tree.

```bash
# 1. Test, build everything, check the package and the size budgets.
npm run release

# 2. Real-browser tests (Chromium, WebKit, iPhone profile). Needs browsers:
#    npx playwright install --with-deps
npm run test:browser

# 3. Inspect what will ship: the file list and the sizes. Nothing is published.
npm publish ./dist-lib --dry-run

# 4. Edit CHANGELOG.md: replace "Unreleased" in the 0.1.0 heading with the
#    release date (YYYY-MM-DD) and commit it. Then repeat step 1 so the
#    tarball holds the dated changelog.

# 5. Publish. If your npm account uses 2FA, pass --otp=<code>.
npm publish ./dist-lib

# 6. Tag the commit you published and push the tag.
git tag -a v0.1.0 -m "0.1.0"
git push origin v0.1.0

# 7. Create the GitHub release from the changelog section.
gh release create v0.1.0 --title "0.1.0" --notes-file <(awk '/^## 0.1.0/{f=1;next} /^## /{f=0} f' CHANGELOG.md)
```

What to look for in step 3: `dist-lib/package.json` reads `0.1.0`; the file
list holds `index.js`, `elements.js`, `elements.dev.js`, `umd/tickslate.umd.js`,
`tokens.css`, the `.d.ts` files, `README.md`, `LICENSE`, `CHANGELOG.md` and
`package.json`, and nothing else (`verify:package` enforces the allowlist);
and the sizes match the `npm run size` table.

## After publishing

1. Check the package page on npmjs.com: README renders, relative links
   resolve, keywords and description are as intended.
2. Smoke test it as a user would, in an empty folder:
   `npm install tickslate`, then import `tickslate/elements` in a page.
3. Check the pinned jsDelivr URL used in the README
   (`https://cdn.jsdelivr.net/npm/tickslate@0.1.0/umd/tickslate.umd.js`)
   serves the file.
4. Start the next version's `changes/` fragments; see `changes/README.md`.

## If something is wrong

- Before step 5, nothing is public; fix and rerun `npm run release`.
- After step 5, a version cannot be reused. Within 72 hours `npm unpublish`
  is possible, but prefer publishing 0.1.1 with the fix and, for a harmful
  version, `npm deprecate tickslate@0.1.0 "reason"`.
