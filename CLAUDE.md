# Tickslate — notes for agent sessions

Tickslate is an open-source library of dashboard widgets for any data, with a
finance set built in. It is a standalone project: a sibling of Emberwick (the
maintainer's candlestick chart library), not part of it. The maintainer's
trading app is its first consumer.

**The current contract is [RFC 0002](docs/rfc/0002-integration-and-ux.md),
on top of [RFC 0001](docs/rfc/0001-api.md).** Read both before writing code.
[docs/BRIEF.md](docs/BRIEF.md) is the original handover and explains where the
project came from. Branches, waves and changelog fragments follow
[docs/WORKFLOW.md](docs/WORKFLOW.md), and every widget meets
[docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md). [AGENTS.md](AGENTS.md) carries
these rules for other coding agents; when you change a rule here, change it
there too.

## Hard rules

- **Work only in this repo.** Never edit a sibling project (Emberwick, or the
  first consumer's app) from a Tickslate session. Read them for reference
  only.
- **Commits are authored by the maintainer alone.** Never add a
  `Co-Authored-By` line or any AI attribution to commits or PRs.
- **npm publish, version tags and GitHub releases are the maintainer's.** Prepare
  them; don't run them.
- **Agree the API before building it.** Public API changes go through an RFC
  (RFC 0002 is current; RFC 0003 covers P1) and need the maintainer's
  approval in chat before implementing PRs merge to master.

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
- **Generic vocabulary.** Name things as any dashboard would (metric, series,
  card, row, status, target) and, in the finance set, as any trading app would
  (strategy, account, allocation, position, order, fill, instrument,
  session), never after one product's screens.
- **Accessible by default.** Each widget is a labelled region; charts get
  `role="img"` and a label stating the result; gains and losses always carry a
  sign, not only a colour; motion respects `prefers-reduced-motion`.
  Every widget meets docs/ACCESSIBILITY.md before it merges.

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
npm run release     # test + build:lib + build:dev + build:umd + build:cdn + pack:lib + verify:package + size
```
