# The public site

The website at <https://tickslate.ldio.app> (and, once Pages is turned on, at
`https://<owner>.github.io/Tickslate/`) is built from this repository. It is
plain HTML, CSS and ES modules built by Vite, with no framework and no runtime
dependency, which is the library's own rule. Nothing on it ships in the npm
package.

## What is on it

| URL | Source | What it is |
|---|---|---|
| `/` (`/index.html`) | `site/index.html`, `site/landing.js` | The landing page: a live, editable board on a made-up feed, what Tickslate is, install, the widgets, the finance set, accessibility and theming |
| `/playground.html` | `index.html` | The playground `npm run dev` serves at `/` |
| `/widgets.html` | `widgets.html` | The widget gallery |
| `/examples/*.html` | `examples/*.html` | Every top-level example page, found by the build |
| `/docs/index.html` | generated | The docs hub |
| `/docs/**/*.html` | `docs/guide/**`, `docs/widgets/`, `docs/reference/`, `docs/theming.md`, `docs/ACCESSIBILITY.md` | One page per Markdown file, rendered at build time |
| `/changelog.html` | `CHANGELOG.md` | The changelog |
| `/404.html` | `site/404.html` | Not found (GitHub Pages serves it) |

**Every link names a file.** The LambdaDeploy host answers any path that has
no file with the root page: `/examples/` and `/docs/` return the landing page
with status 200, not their `index.html`. So nothing on the site links a
folder; links go to `/examples/index.html`, `/docs/index.html` and so on.
Keep it that way when adding a page.

The site styles itself with the library's `--ts-*` tokens: Paper in light,
Graphite in dark, following the system until the visitor picks one with the
switch in the bar (kept in `localStorage`). It loads nothing from another
host: no web fonts (the tokens' system fallbacks are used), no analytics.

## How it is built

`vite.site.config.js` holds the whole build. Its plugins:

- **Pages.** The landing page lives in `site/` so the playground can stay at
  `index.html`, where `npm run dev` and the tests expect it. The build
  publishes each page at its site URL (the table above).
- **Docs.** `scripts/md.mjs` is a small Markdown renderer written for this
  site, so the site has no Markdown dependency. It covers what the docs use:
  headings with GitHub's anchor ids, paragraphs, nested lists, fenced code,
  block quotes, rules, tables with alignment, inline code, links, autolinks,
  emphasis and hard breaks. It does not do setext headings, indented code,
  reference links, images, footnotes, strikethrough or task lists, and it
  escapes raw HTML instead of passing it through. `scripts/site-docs.mjs`
  finds the pages, builds the sidebar and rewrites links: a link to another
  rendered `.md` goes to its page, a link to an example or the playground to
  the site's copy, a link to a folder of docs to that group on the hub, and
  anything else in the repository (an RFC, a `.d.ts`, the README) to the file
  on GitHub. The pages are generated in memory; nothing is written to `docs/`.
- **The site bar.** The playground, the gallery and the example pages carry a
  `<!-- site-header -->` comment after `<body>`. The site build puts the shared
  bar there (`site/bar.css`), with a theme switch on pages that have no theme
  control of their own. Under `npm run dev` the comment stays a comment, so
  those pages behave exactly as before.
- **Links and the version.** A link written as `/x` in a site page means the
  site root; the build puts the base in front. The landing page's install
  snippets name the version in `package.lib.json`, and its "Your first
  dashboard" block is the README's quick start, read at build time.
- **Tokens first.** Each page's stylesheets are linked with `tokens.css`
  first, so a theme preset (the same zero specificity) overrides the
  defaults. The build fails if a page links another stylesheet before it.
- **Offline.** The build fails if any page or stylesheet would load something
  from another host.

### Commands

| Command | Output | Base |
|---|---|---|
| `npm run dev:site` | Development server, at the site's URLs | `/` |
| `npm run build:site` | `dist-site/` | `SITE_BASE`, else `/Tickslate/` (GitHub Pages) |
| `SITE_BASE=/ npm run build:site` | `dist-site/` | `/` |
| `npm run build:ld` | `dist/` (`vite.ld.config.js`) | `/` (LambdaDeploy) |
| `npm run pack:site` | `dist-ld-src/`, the upload folder | |
| `npm run preview:site` | Serves `dist-site/` | as built |

`SITE_BASE` must be an absolute path that starts and ends with `/`. A relative
base (`./`) is refused: the pages move to new folders when published, so URLs
relative to the page would point one level off.

## Deploying to GitHub Pages

`.github/workflows/pages.yml` runs `npm run build:site` and deploys
`dist-site/` on every push to `master`, once the maintainer has turned it on:
set Pages' source to GitHub Actions, then add the Actions variable
`PAGES_ENABLED` with the value `true`. The base `/Tickslate/` matches the
repository name; change both together if it is renamed.

## Deploying to LambdaDeploy

The site at <https://tickslate.ldio.app> is the LambdaDeploy app **Tickslate**
in the **duo1c** account. LambdaDeploy builds it on its own server: it runs
`npm install` and then `vite build` in a folder with a `package.json`, and
publishes `dist/`.

1. `npm run pack:site`. It writes `dist-ld-src/`: the pages, `src/`, the docs
   Markdown, `CHANGELOG.md`, `README.md`, `package.lib.json`, the site build
   (`vite.site.config.js`, `scripts/md.mjs`, `scripts/site-docs.mjs`,
   `scripts/entries.mjs`), `vite.ld.config.js` saved as `vite.config.js`, and a
   `package.json` whose only dependency is the `vite` the repository uses.
2. Optionally check it builds from scratch:
   `cd dist-ld-src && npm install && npx vite build` (the site lands in
   `dist-ld-src/dist/`).
3. Upload the folder's files to the app, replacing what is there, and delete
   files that are no longer in the folder.
4. Build, then publish.

**Upload file by file.** LambdaDeploy's zip import currently fails with an S3
signature mismatch, so a zip of the folder can't be imported; upload each file
on its own instead.

Redeploy after every release (see [RELEASING.md](RELEASING.md)), so the
install snippets name the new version, and after any change to the docs.
