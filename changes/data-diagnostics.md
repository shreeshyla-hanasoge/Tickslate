### Added

- The `data` attribute: a trimmed value starting with `{` or `[` is parsed as JSON, so a Blade, Django or Rails template can write `<ts-today-pnl data='{"net": 2185.65, …}'>` with no script. The attribute feeds the widget until the `data` property is set; the property wins from then on. Other values are ignored, and removing the attribute drops data it supplied.
- Invalid JSON in the attribute shows the error view (the property still clears it).
- `static dataShape` on every widget, and a development check against it: wrong data warns once per element, naming the element, its `item`, the path and what arrived, e.g. `tickslate: <ts-today-pnl item="pnl"> data.readings is missing (got keys: rows, total)`. Kinds are `number`, `numeric`, `time`, `string`, `boolean`, `array` and `object`, as a bare kind (required) or `{ kind, optional?, of? }`. `ShapeKind`, `ShapeField` and `DataShape` are exported from the widget types.
- Development warnings, each once per element: invalid JSON in `data` (with the parser's position); a `data` attribute reading `[object Object]` (set the property instead); an invalid `locale`, `currency` or `time-zone`, naming whether it came from the widget's attribute, the grid's attribute or `configure()`; a view model that dropped rows it couldn't read; data still `undefined` 10 s after connecting.

### Changed

- A render failure now logs `console.error('tickslate: <ts-today-pnl item="pnl"> could not render its data; see docs/widgets/ts-today-pnl.md', err)`, naming the element and item. Still once per run of failures, and still in production.

### Breaking

- None.

### Internal

- `checkShape`, `shapeMessage` and `parseErrorParts` are in `src/elements/dev.js`; every use sits behind `if (DEV)`, and the base's check methods wrap their whole body in it, because a class method survives tree-shaking even when its only caller is guarded. Production `elements.js` has no `console.warn`.
- `describeElement(el)` (`<tag item="…">`) lives in `widget.js`, not `dev.js`, because the render-failure error uses it in production.
- `test/data-diagnostics.test.mjs` covers parsing and precedence, a parse failure, shape messages (missing, wrong kind, extra nesting, array items), every development warning, a source check that each `warnOnce` call is guarded, and the production switch (run in a child process, since `dev.js` reads `__TS_DEV__` once).
- The Today's P&L, Equity curve and Session clock shapes follow RFC 0002 §2.7. The docs path in the error message (`docs/widgets/<tag>.md`) points at pages that don't exist yet.
