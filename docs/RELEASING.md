# Releasing Tickslate

Publishing is the maintainer's. Agents prepare a release and stop before
`npm publish`, tagging and creating a GitHub release. This page is the exact
list of what to run for a release. Below, `X.Y.Z` stands for the version you
are cutting.

0.1.0 is published (npm, and this repository is public). The steps that only
the first release needed are gone from this page; what follows is how to cut
the next one.

## Prepare the release

1. **Fold the changelog.** `CHANGELOG.md` keeps an empty `## Unreleased`
   section at the top. Rename what is under it into a new
   `## X.Y.Z — YYYY-MM-DD` section (today's date), add the entries from the
   story fragments in `changes/` as `changes/README.md` describes, delete the
   folded fragments in the same commit, and leave a fresh empty
   `## Unreleased` above it.
2. **Bump the version** in `package.lib.json` and in `src/core/index.js`.
   `test/core.test.mjs` fails if they differ, and `verify:package` checks the
   built files against `dist-lib/package.json`.
3. **Re-baseline the size budgets** if the release changes them
   (`scripts/check-size.mjs`, RFC 0002 §9).
4. Update the pinned jsDelivr URL in the README to `tickslate@X.Y.Z`.
5. Confirm you are logged in to npm as the account that owns the package:
   `npm whoami`.

## Publish

Run from the repository root, on the merged branch, with a clean tree.

```bash
# 1. Test, build everything, check the package and the size budgets.
npm run release

# 2. Real-browser tests on every project in playwright.config.mjs: chromium,
#    webkit, firefox, mobile-safari (iPhone 14) and mobile-chrome (Pixel 7).
#    Needs browsers: npx playwright install --with-deps
npm run test:browser

# 3. Inspect what will ship: the file list and the sizes. Nothing is published.
npm publish ./dist-lib --dry-run

# 4. Commit the dated changelog and version bump from "Prepare the release",
#    then repeat step 1 so the tarball holds them.

# 5. Publish. If your npm account uses 2FA, pass --otp=<code>.
npm publish ./dist-lib

# 6. Tag the commit you published and push the tag.
git tag -a vX.Y.Z -m "X.Y.Z"
git push origin vX.Y.Z

# 7. Create the GitHub release from the changelog section.
gh release create vX.Y.Z --title "X.Y.Z" --notes-file <(awk '/^## X.Y.Z/{f=1;next} /^## /{f=0} f' CHANGELOG.md)
```

What to look for in step 3: `dist-lib/package.json` reads `X.Y.Z`; the file
list holds `index.js`, `elements.js`, `elements/<name>.js` (one per widget),
`chunks/`, the development tree under `dev/` (`dev/elements.js`,
`dev/elements/<name>.js`, `dev/chunks/`), `cdn/tickslate.js`,
`cdn/tickslate.iife.js`, `umd/tickslate.umd.js`, `tokens.css`, the `.d.ts`
files (including `elements/<name>.d.ts`), `README.md`, `LICENSE`,
`CHANGELOG.md` and `package.json`, plus source maps for everything except the
two `cdn/` files, and nothing else (`verify:package` enforces the allowlist);
and the sizes match the `npm run size` table.

## Publish from CI (optional)

`.github/workflows/release.yml` publishes the same package with an npm
provenance attestation, which links the tarball to the commit and workflow
that built it. The by-hand steps above stay valid; this is the other way to
do step 5, and it never does steps 6 and 7.

- **Only the maintainer starts it.** It has one trigger, `workflow_dispatch`
  (Actions, Release, Run workflow), and it runs only from `master`. No push,
  pull request, tag, release or schedule starts it, and no agent dispatches it.
- **`dry-run` is on by default.** A dry run installs, runs `npm run release`
  and `npm publish ./dist-lib --dry-run`, and stops: the same checks as step 1
  and step 3. Turn `dry-run` off to publish.
- **Publishing waits for you.** The publish job declares the `npm-release`
  environment. Create it once under Settings, Environments, with yourself as
  the required reviewer; the job cannot start until you approve it. Nothing in
  the repository can create the environment.
- **Provenance** needs the job's `id-token: write` permission (the file sets it),
  a public repository, and a way to authenticate to npm. Until that is set up
  the publish job fails at `npm publish`, and nothing is published: either add an
  npm automation token as the environment secret `NPM_TOKEN`, or configure npm
  trusted publishing for this repository and workflow and delete the
  `env: NODE_AUTH_TOKEN` block from the publish step. Trusted publishing needs
  npm 11.5.1 or later; Node 20 ships npm 10, so the publish job runs
  `npm install -g npm@11` first and prints the version. The token route works
  with either.
- **The dry run has not been run.** Nothing can show that the `verify` job's
  `npm publish --dry-run` passes without dispatching the workflow, which only you
  do. Watch the first dry run before you turn `dry-run` off.
- **It publishes and nothing else.** It does not tag or create a GitHub
  release: do steps 6 and 7 yourself, after the job succeeds and after you
  have prepared the release (changelog, version, README URL) as above.

Every `uses:` in every workflow is pinned to a full commit SHA with the tag in a
comment, and Dependabot (weekly) proposes the updates; read each pull request
before you merge it.

## After publishing

1. Check the package page on npmjs.com: README renders, relative links
   resolve, keywords and description are as intended.
2. Smoke test it as a user would, in an empty folder:
   `npm install tickslate`, then import `tickslate/elements` in a page.
3. Check the pinned jsDelivr URL used in the README
   (`https://cdn.jsdelivr.net/npm/tickslate@X.Y.Z/cdn/tickslate.iife.js`)
   serves the file.
4. Start the next version's `changes/` fragments; see `changes/README.md`.
5. Redeploy the public site with `SITE_VERSION` unset, so its install lines
   name the version just published; see [site.md](site.md).

## If something is wrong

- Before step 5, nothing is public; fix and rerun `npm run release`.
- After step 5, a version cannot be reused. Within 72 hours `npm unpublish`
  is possible, but prefer publishing the next patch with the fix and, for a harmful
  version, `npm deprecate tickslate@X.Y.Z "reason"`.
