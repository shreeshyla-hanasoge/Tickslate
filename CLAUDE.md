# Tickslate — notes for agent sessions

Tickslate is an open-source library of finance dashboard widgets. It is a
standalone project: a sibling of Emberwick (the maintainer's candlestick chart
library), not part of it. Traed, the maintainer's trading app, is its first
consumer.

**Read [docs/BRIEF.md](docs/BRIEF.md) before writing code.** It holds the
decisions already made, the v1 scope and the first tasks in order.

## Hard rules

- **Work only in this repo.** Never edit Emberwick (`~/projects/Emberwick`) or
  Traed (`~/projects/traed` and its `traed-*` checkouts) from a Tickslate
  session. Read them for reference only.
- **Commits are authored by the maintainer alone.** Never add a
  `Co-Authored-By` line or any AI attribution to commits or PRs.
- **npm publish, version tags and GitHub releases are the maintainer's.** Prepare
  them; don't run them.
- **Agree the API before building it.** The first task is an API RFC; get the
  maintainer's approval on it before implementing.

## Principles

- **The core is framework-free with zero runtime dependencies.** It imports
  nothing but platform APIs. DOM work belongs in `src/elements/`.
- **Widgets are custom elements.** One implementation serves Vue, React and
  plain HTML. Framework wrappers come later, only if they earn their keep.
- **Theme through `--ts-*` CSS variables only** (`src/themes/tokens.css`).
  No hard-coded colours in widgets, so a host's own theme is a few variables,
  never a fork.
- **Data in, nothing out.** Widgets render data the host passes in. No
  fetching, no broker APIs, no credentials.
- **Generic vocabulary.** Name things as any trading app would (strategy,
  account, allocation, position, order, fill, instrument, session), never
  after one product's screens.
- **Accessible by default.** Each widget is a labelled region; charts get
  `role="img"` and a label stating the result; gains and losses always carry a
  sign, not only a colour; motion respects `prefers-reduced-motion`.

## Conventions copied from Emberwick

- `package.json` is the private dev manifest; `package.lib.json` is what gets
  published. `scripts/pack-lib.mjs` assembles `dist-lib/`, and publishing is
  `npm publish ./dist-lib`.
- ESM is built unminified (consumers minify) and the UMD build is minified.
  Target es2019.
- Tests use `node --test` and import nothing outside `src/` and `node:*`, so
  CI runs them without `npm install`.
- Comments explain *why*, not *what*.
- When the core has real code, add a gzipped size budget and a package check,
  modelled on Emberwick's `scripts/check-size.mjs` and
  `scripts/verify-package.mjs`.

## Commands

```bash
npm test            # unit tests
npm run dev         # playground (also in .claude/launch.json as "playground")
npm run release     # test + build:lib + build:umd + pack:lib
```
