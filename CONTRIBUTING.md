# Contributing to Tickslate

Thanks for helping. Tickslate is a library of dashboard widgets built as
framework-free custom elements, with zero runtime dependencies. This page is how
to set up, what to check, and how a change gets in. Please also read the
[Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, don't open an
issue; follow [SECURITY.md](SECURITY.md).

## Before you start

- **A bug**: open an issue with the bug form, or send a fix straight away if it
  is small.
- **A feature or a new widget**: open an issue first (the feature or widget
  request form) so the idea is agreed before you write code. A new public name
  needs an RFC, below.
- **Not sure**: ask in an issue. A short question costs less than a rejected
  pull request.

## Set up

You need Node 20 or later.

```bash
git clone https://github.com/shreeshyla-hanasoge/Tickslate.git
cd Tickslate
npm install
npm test
npm run dev
```

| Command | What it does |
|---|---|
| `npm test` | The unit suite, under `node --test`. Needs no install |
| `npm run test:browser` | The real-browser suites (Playwright) |
| `npm run dev` | The playground, at the address Vite prints |
| `npm run release` | Test, build the library (ESM entries and the development tree), the UMD and the CDN bundle, pack `dist-lib/`, verify the package and check the size budgets |

### The install-free node suite

`npm test` runs `test/*.test.mjs` and works on a fresh clone with no
`npm install`. CI runs it that way on Node 20, 22 and 24, so keep it that way:

- Tests import only from `src/` and `node:*`. Never import a package from
  `node_modules`, not even a dev dependency.
- Element tests use the shared fake DOM in `test/fake-dom.mjs`; read the
  comment at its top for how to render a widget against it.
- Pure logic, such as view models, formatting, layout and data parsing, belongs
  in tests like these. Only what needs a real engine goes in the browser suites.

### The browser suites

`npm run test:browser` runs `test/browser/*.spec.mjs` in real browsers
with Playwright: a render check of every widget at every size in both themes,
the grid's keyboard and tap-to-place flows, and axe accessibility checks. It
starts its own Vite server on port 5174, so a running `npm run dev` doesn't
get in its way.

Download the browsers once:

```bash
npx playwright install --with-deps
```

CI runs Chromium and WebKit (including an iPhone profile). The config also
defines Firefox and Android Chrome projects. To run a subset:

```bash
npx playwright test --project=chromium
npx playwright test test/browser/grid.spec.mjs
```

A failure keeps a trace under `node_modules/.playwright/`; open it with
`npx playwright show-trace`.

## RFC first

The public API is agreed in writing before it is built. An **RFC** is a
document in [docs/rfc/](docs/rfc/), and the current contract is
[RFC 0001](docs/rfc/0001-api.md) as amended by
[RFC 0002](docs/rfc/0002-integration-and-ux.md).

You need an RFC, or an approved section of one, for:

- a new public name: an element, attribute, property, method, event, action,
  CSS part, `--ts-*` token or export
- a changed signature
- a change to documented behaviour

You don't need one for a bug fix, a docs fix, a test, or building what an
approved RFC already says. If the code has to differ from an approved RFC,
change the RFC in the same pull request and point it out.

To propose one, open an issue first, then a pull request that adds
`docs/rfc/NNNN-short-title.md` with the status, the problem, the signatures and
the alternatives you rejected. Don't implement it until the maintainer approves
it. Every figure in an RFC is made up.

## How work moves: docs/WORKFLOW.md

[docs/WORKFLOW.md](docs/WORKFLOW.md) is the full process: how work is planned
as stories, how stories land in a wave and how a wave reaches `master`. For a
contributor it comes to this:

1. Fork the repository and branch from the branch the maintainer names in the
   issue (usually `master`).
2. Keep one pull request to one story: one change a reviewer can hold in their
   head. Touch only the files that story needs.
3. Run `npm test` before you open it, and `npm run release` if you changed
   anything that ships.
4. In the description, say what it does, how you checked it, and anything the
   maintainer has to decide. The pull request template walks you through it.
5. Merge the base branch into yours to catch up. Don't rebase and force-push a
   branch someone has reviewed.

The maintainer merges, publishes to npm, tags and creates releases.

## A changelog fragment per pull request

Don't edit `CHANGELOG.md`. Add `changes/<story-id>.md` instead, with level-three
headings (`### Added`, `### Changed`, `### Breaking`, `### Internal`), one
user-facing line per change, and only the headings you need. A change with
nothing user-facing still gets a fragment with just `### Internal`. The format
and an example are in [changes/README.md](changes/README.md).

## Code style

- ES modules, no semicolons, two-space indent, single quotes.
- **Comments explain why, not what.** The code says what it does. A comment is
  for the reason: the browser quirk, the constraint, the alternative you
  rejected. If a comment only restates the next line, delete it.
- The core (`src/core/`) is framework-free with zero runtime dependencies. It
  imports nothing but platform APIs. DOM work belongs in `src/elements/`.
- Widgets are custom elements. Data goes in as properties or attributes; events
  and `ts-action` requests come out. Widgets never fetch, never call a broker
  and never hold credentials.
- Theme through `--ts-*` CSS variables only (`src/themes/tokens.css`). No
  hard-coded colours in a widget.
- Name things as any app in the field would (strategy, account, allocation,
  position, order, fill, instrument, session), not after one product's screens.
- Numbers in code, tests, docs and demos are made up. Never paste real figures.

To build a widget of your own, start with
[docs/guide/your-own-widget.md](docs/guide/your-own-widget.md). Every widget
has a reference page in [docs/widgets/](docs/widgets/), and the docs tests fail
when a tag, event, action, token or data key is missing from the docs.

## Accessibility

[docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) is the definition of done. Every
new widget, and every change to an existing widget or to `<ts-grid>`, meets
that list, and the reviewer checks the pull request against it item by item.
In short:

- each widget is a labelled region whose name states its result
- charts have `role="img"` and a label that says what they show
- gains and losses carry a sign (and an arrow), never colour alone
- everything a pointer can do, a keyboard can do, with visible focus
- motion respects `prefers-reduced-motion`

The axe suite catches part of this. The manual checks in that file (keyboard
only, VoiceOver, NVDA, forced colours, a 390 px viewport) are not automated;
run the ones your change touches and write the result in the pull request.

## Updating baselines

Two things are held to a stored figure. Change them in the pull
request that needs it, and say why in your changelog fragment.

- **Size budgets**, in `BUDGETS` in `scripts/check-size.mjs`. `npm run size`
  (part of `npm run release`) fails when a file's minified, gzipped size goes
  over its ceiling. Don't raise a ceiling to make a build pass. First look for
  what grew. If the growth is worth it, measure the new size, set the ceiling
  to the measurement plus about 10 %, rounded up to the next 0.5 kB, and update
  the date and the "measured" comment beside it.
- **Token values**, which three places repeat: `src/themes/tokens.css` (the
  canonical copy), the defaults a widget injects in
  `src/elements/default-tokens.js`, and the table in `docs/theming.md`. Tests
  fail when the three drift apart, and `test/tokens.test.mjs` re-checks the
  contrast floors against the CSS. A change to one value is a change to all
  three, and a new token needs an RFC.

The browser suites keep no screenshots to update. They check box sizes
against the grid's row height, so a failure there is a real change in layout.

## Checklist before you open the pull request

- `npm test` passes
- `npm run test:browser` passes, if you changed anything a browser renders
- `npm run release` passes, if you changed anything that ships
- the new or changed public names are in an approved RFC
- the docs for the change are written, and `docs/reference/` or `docs/widgets/`
  covers anything new
- `changes/<story-id>.md` exists
- the accessibility list is met, and the manual checks are recorded

Thank you for helping.
