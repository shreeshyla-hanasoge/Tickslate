# Changelog

All notable changes to Tickslate are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## 0.1.0 — Unreleased

The first release. The date is filled in when it is published. Version 0.0.0
was only ever a private scaffold, so nothing is breaking for anyone who has
installed from npm. The Changed and Breaking entries below describe how this
release differs from the development builds that came before it, for anyone
who tried the repository early.

### Added

A grid that works from markup

- `<ts-grid>`: lays out its children as a resizable dashboard that reflows
  across 4, 3 and 2 columns, with phone and tablet reflow and gap-filling
  placement that matches CSS `grid-auto-flow: dense`. With no `layout` set,
  every child becomes a tile. Its type comes from the tag, its size from the
  child's `size` attribute (else the first size it supports), and its id from
  `item`. The grid keeps the user's arrangement when the host re-renders.
  Setting `layout` to a `Layout` or an array of items switches to explicit mode.
- Per-child sizing: each child's `spec`, or its `sizes` and `label` attributes,
  decides what it snaps to, so two children of one type can differ.
- Market and closed layouts that switch on a `schedule`, with `override()` for
  the manual switch and a replaceable `clock`.
- `persistLayout(grid, { key, defaults?, storage? })`: loads the user's layout
  for the current device, saves each `ts-layout-change`, switches between phone
  and desktop entries, repairs corrupt data and treats throwing storage as
  empty. Returns `{ reset(device?), dispose() }`.
- Events: `ts-layout-change` (with `items`, `previous`, and on a remove `index`
  and `item`; reasons include `'undo'` and `'add'`), `ts-columns-change` (with
  `initial`, fired once after the first measure), `ts-layout-issues`,
  `ts-edit-change` and `ts-action`.
- Core: `readLayout` (which also takes a plain array, and
  `{ unknown: 'keep' }` to keep items no catalog knows), pure editing
  operations, `dropIndex`, `sizeForExtent`, `DEFAULT_PROFILE`, `typeForTag`,
  and catalogs given as a function `(item) => spec | null`.

Editing that is safe and accessible

- Edit like an iPhone home screen: long press or `editing` to start, drag with
  live reflow, a resize handle that snaps between supported sizes, remove
  badges, edge auto-scroll and full keyboard support.
- Built-in controls, so no host has to build UI: a visually hidden "Edit layout"
  button that is the grid's first Tab stop, and a floating edit pill
  (`part="edit-pill"`) with Done and "Add back (n)". Hide them with `locked` or
  `edit-controls="off"`.
- `locked`: a read-only dashboard.
- `grid.undo()` (20 steps per profile, Ctrl or Cmd+Z while editing) and an undo
  toast after a remove (`part="toast"`, `undo-toast="off"` to suppress).
  `grid.hiddenItems` and `grid.restore(id)` bring removed tiles back.
- Tap-to-place for users who cannot drag (WCAG 2.5.7), shared with the keyboard
  moves, plus polite status announcements for every edit and focus handling
  that survives reorders, removes and the end of editing.
- An empty board message ("No widgets on this layout yet", replaceable through
  `slot="empty"`), with Add back when tiles are hidden.
- Development warnings (`tickslate:` prefix) for the common integration
  mistakes: an explicit-mode child with no `item`, a layout item with no
  child, a dashed tag that is never defined, and repeated generated ids.

Widgets

- `<ts-card>`: a themed tile for any content, including another library's
  chart, at all seven sizes. Slots `value`, `actions`, `footer` and `empty`; the
  default slot is a body that a `height: 100%` child fills. Attributes `label`,
  `sizes`, `live`, `as-of` and `scrollable`.
- `<ts-metric>`: a KPI tile at S, Wide and M with a signed change (from `delta`,
  `deltaPct` or `previous`), `goodWhen`, a sparkline, a target bar, and
  `number`, `money`, `percent` and `duration` formats plus `unit` and `compact`.
- `<ts-chart>`: line and area trends for up to four series at Wide, M, L and XL,
  from `{ series }` or `{ rows, x, y }`, with a legend, gridlines and axis labels
  by size. The kind never relies on colour alone.
- `<ts-today-pnl>`, `<ts-equity-curve>` and `<ts-session-clock>`: the finance
  set, with an intraday curve, peak and max drawdown with range buttons, and
  exchange session lanes.
- The widget base `TsWidget` for your own widgets: open shadow root, shared
  themed CSS, `data`, `size`, `label`, `clock`, `static spec`,
  `static dataShape`, one render per microtask and `every()` for timers that
  pause while the page is hidden. See `docs/guide/your-own-widget.md`.
- Every widget has `spec`, `tickslateVersion` and the loading, empty and error
  views below.

Data and states

- Loading, empty and error views on every widget. Data never set shows a
  skeleton and `aria-busy`; `data = null` shows the empty state; the `state`
  attribute and `error` property show the error view, with Retry when `actions`
  includes `'retry'`. A `slot="empty"` child replaces the empty text.
- The `data` attribute: a value starting with `{` or `[` is parsed as JSON, so a
  server template can pass data with no script.
- `toTime(v)` and `toDay(v, timeZone?)`: instants as epoch seconds or
  milliseconds, a `Date`, an ISO 8601 string (including six-digit microseconds)
  or a numeric string. `toNumber` accepts decimal-library objects with a
  `toNumber()` method. Time zones flow through `equitySeries`, `equityStats`
  and `filterRange`.
- Development checks against each widget's `dataShape`, naming the element, its
  `item`, the path and what arrived; warnings for invalid JSON, an invalid
  `locale`, `currency` or `time-zone`, dropped rows and data still unset after
  10 s. A render failure logs the element and a docs link, in production too.
- Formatting: `createFormatter` (signed money with the true minus sign, lakh
  grouping, compact forms, prices, percents, 24-hour times, durations, `fit`)
  and `configure` for defaults. `fmt.unit(value, unit)` formats units, and
  `fit` takes `{ style: 'money' | 'number' | 'percent' }`. Invalid options fall
  back to the defaults and are listed in `formatter.issues`.
- Session calendars: `createCalendar` with holidays and special sessions,
  `state`, `nextChange`, `candleClose` and `windows`; NSE and MCX presets;
  `activeProfile` and `nextProfileChange`.

Install and theming

- Tiles look finished with only `import 'tickslate/elements'`: the default
  tokens are adopted in `@layer tickslate.defaults` when the page has none, and
  anything you define wins. Before the elements upgrade, tiles reserve their
  height so the page does not jump.
- Theme through `--ts-*` tokens only. Paper (light) and Graphite (dark), light
  and dark islands with `data-theme`, `--ts-axis`, `--ts-focus` and
  `--ts-series-1` to `--ts-series-6`, plus the layout tokens `--ts-row-compact`,
  `--ts-gap-compact`, `--ts-num-weight`, `--ts-shadow-lift`, `--ts-motion` and
  `--ts-ease`.
- A development build: `tickslate/elements` resolves to `elements.dev.js` under
  the `development` export condition, with every warning. Production builds
  resolve `elements.js`, which has none.
- Types for everything, including `grid.d.ts` and `widget.d.ts`.

Documentation

- A README from install to a saved dashboard, framework recipes for React,
  Vue, Svelte and Angular, and guides for saving layouts, server templates and
  bringing your own chart.
- Reference pages for every element, every core export, every event and every
  theme token, in `docs/`.
- `examples/` (quickstart, generic dashboard, bare), a playground and a widget
  gallery.

### Changed

- Dark mode follows the page, not the OS, by default; see Breaking.
- `--ts-font-num` falls back to a system sans stack after Newsreader instead of
  Georgia, whose digits are old-style and proportional.
- `fit` tries the full form, then (for `number` and `percent`) no decimals, then
  compact, and returns the compact form only when it is shorter. Money still
  goes straight from full to compact.
- `<ts-grid>` reads every layout with `unknown: 'keep'`, so a tile whose tag is
  not defined yet survives a save, and fires `ts-layout-issues` only when the
  host sets `layout` or `catalog`.
- A widget with no label is named by its tag, and registering a tag that
  another class owns warns in development.
- The edit chrome is a plain container with three sibling buttons (handle,
  Remove, Resize); managed tiles are `inert` while editing; focus rings are
  `outline`, so they survive forced colours; Escape ends editing only when
  focus is inside the grid.
- Double-clicking a remove badge, or pressing Delete twice, removes one tile.
- Requires Node 20 or later wherever Node is used (`engines`).
- The dark theme is called Graphite in the docs and demos. `data-theme="dark"`,
  `.dark` and every token name are unchanged.

### Breaking

- OS dark mode is opt-in. With no `data-theme` and no `.dark` class, tiles stay
  light whatever `prefers-color-scheme` says. Set `data-theme="auto"` on
  `<html>` or any ancestor to follow the OS.
- A widget whose `data` was never set (`undefined`) shows a loading skeleton,
  not "No data". Set `data = null` to show the empty state. A view model that
  throws shows the error view instead of the empty state.
- A number below 1e11 in an instant field is read as epoch seconds, not
  milliseconds. Millisecond values from before March 1973 would be misread;
  send an ISO string for those.
- `toNumber` is stricter: `'0x10'`, `'0b1'`, `'Infinity'` and `''` are `NaN`.
  Only decimal and exponent strings parse.
- The grid's edit chrome markup is `.chrome > .handle + .remove + .resize`. A
  host reaching into the shadow root for `.chrome[role=button]` must update.
  Attributes, parts and events are unchanged.
- Hosts that listen for `ts-layout-change` should expect the new reasons
  `'undo'` and `'add'`.
- The playground's old saved layout (`tickslate-playground-layout`) is no
  longer read.

### Internal

- Tests run with `node --test` and need no install. Real-browser tests run
  with `npm run test:browser` in Chromium, WebKit and an iPhone profile,
  including axe checks over every widget and the grid in both themes.
- `npm run release` runs test, build:lib, build:dev, build:umd, pack:lib,
  verify:package and size. `verify:package` checks the manifest, exports,
  version agreement, DOM-free imports and the tarball allowlist. `npm run size`
  enforces gzipped budgets of 9.5 kB for the core and the UMD build and 50 kB
  for `tickslate/elements` with its core, each measured plus 10 %.
- `docs/rfc/0002-integration-and-ux.md` is the approved contract for this
  release, `docs/ACCESSIBILITY.md` the definition of done for every widget, and
  `docs/RELEASING.md` the maintainer's publish steps.
- Tests, docs and demos use made-up figures only.
