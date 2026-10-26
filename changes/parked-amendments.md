### Added

- `defineWidget(tag, Ctor, { type, messages })`: a custom widget can ship its own English strings. `messages` is a table of flat dotted keys, each starting with `widget.<type>.` or `<type>.` (plural suffixes such as `.few` are fine); a key Tickslate already has, or a value that is not a string, throws a `TypeError`. The widget's `t` answers from it after the element's, the grid's and `configure({ messages })` tables and before Tickslate's own English, so a host's translation always wins and the widget needs no `configure()` call to read well. `widget.<type>.label` and `.description` fill a spec that has none, and the tile's label follows the same key. Calling again with the same class and different `messages` warns once in development and keeps the first.
- The token `--ts-num-width`: the average advance of a figure character in `em`, default `.62` in both themes. A host with a wider `--ts-font-num` sets it once and the figures in a tile's stat cells shrink to fit.

### Changed

- `Translate` (the type of `t`) accepts any string key, so a custom widget's own keys type-check.
- The guide's worked example (`docs/guide/custom-widgets.md`, `examples/custom-widget/`) registers its strings with `defineWidget` instead of carrying its own fallback code. Its keys are now `acme-mrr.*` and `widget.acme-mrr.label`, under the widget's type.

### Internal

- The size check now judges "each widget adds at most 15 kB to the grid" (RFC 0004 §10.4, Decision 68) in place of the warn-only "grid + one widget" rows: each widget gets a row `<name> adds to grid (min+gz)`, the size of a bundle of the grid and that widget minus the size of the grid alone, enforced. The pair totals are still printed. Eleven widgets are over 15 kB today (capital-funding, chart, edge-stats, equity-curve, metric, open-positions, pnl-calendar, session-clock, table, today-pnl, watchlist), so their rows stay warnings, with a dated comment in `scripts/check-size.mjs`, until the maintainer decides; no figure was raised.
- Decision 65 (`HighlightText` in forced colours): no code change was needed. The scan in `test/tile-chrome.test.mjs` already allows `Highlight`, `HighlightText`, `CanvasText` and `ButtonFace`, and a test already pins `.btn.on`'s `Highlight` / `HighlightText` pair.
- Deviation from RFC 0004 §10.2: the author's defaults are English text, so their plural forms are chosen with English rules even when the host's locale is another (the host's own forms keep the host's rules). The defaults are a separate layer in `translator()` (a fifth argument), not merged into the host's table, so `createMessages` is unchanged.
- Deviation: `widget.<type>.label` and `.description` from `messages` also fill the recorded catalog spec when the class has none, so a grid and a picker (which read the catalog) show them without a change to `grid.js`.
- `test/presets.test.mjs` lists `--ts-num-width` with the host's own tokens: it follows the font the host picks, so a preset does not have to restate it.
- `defineWidget`'s class parameter is typed as any `TsWidget` subclass (`new (...args) => TsWidget<any, any>`). It was `typeof TsWidget`, which TypeScript refused for any subclass with its own data type, so a typed custom widget could not call it. A type fixture now registers one.
