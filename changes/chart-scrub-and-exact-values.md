### Added

- Charts can be scrubbed. Hover a mouse, or drag a finger, along `<ts-today-pnl>` (`M`), `<ts-equity-curve>` or `<ts-chart>` and a rule, a dot per series and a small label show the nearest point: its time, date or category, and its values (Net for Today's P&L; Equity and Day for the equity curve; one value per series for `<ts-chart>`). A vertical swipe still scrolls the page.
- Each of those charts has one keyboard tab stop, a `role="slider"` named "…, read point by point". Left and Right move one point (earlier and later, in every language), Page Up and Page Down ten, Home and End jump to the ends, and Escape hides the label. The slider's `aria-valuetext` names the point and its values, so a screen reader speaks each point as the keys move; nothing is `aria-live`.
- The `scrub` attribute and property (`'on'`, `'off'` or null) on any widget or `<ts-grid>`: `scrub="off"` turns scrubbing off, with no read-out and no tab stop. A widget's own value wins over its grid's. Scrubbing is also inert while the grid is in edit mode.
- On a short plot (`S`, `Wide`) a read-out with many series (six in `<ts-chart>`) is laid out in two columns, and when that is still too tall it shows the series that fit and a "+N more" line (`chart.scrubMore`), so it never runs out of the plot. The slider's value text still names every series.
- A visually hidden table of the last 12 points, newest last, with a caption and column and row headers, on `<ts-equity-curve>`, `<ts-today-pnl>` at `M` and `<ts-chart>`. It updates in place, so a new reading adds one row.
- The CSS parts `scrub`, `scrub-rule`, `scrub-dot` and `scrub-readout` on the three charts.
- The messages `chart.scrubSlider`, `chart.scrubValue`, `chart.scrubNone`, `chart.scrubNet`, `chart.scrubEquity`, `chart.scrubDay`, `chart.scrubTableX`, `chart.scrubTableDate`, `chart.scrubTableCategory`, `chart.scrubTableNumber` and `chart.scrubCaption` (with `.one` and `.other`) and `chart.scrubMore`.

### Changed

- When a headline goes compact ("1.2M"), the headline value (`part="value"`) of `<ts-metric>`, `<ts-today-pnl>` and `<ts-equity-curve>` carries the full figure as its `title`, so hovering the number shows it.
- `<ts-metric>`'s accessible name now always has the full figure, also where `compact` is set; it was the compact form there.
- A `<ts-chart>` with `actions` including `'select'` now has the scrubber as a tab stop before its list of points, so one more Tab reaches the points.

### Internal

- `src/elements/scrub.js` (new): the pointer, touch and keyboard binding, the overlay and the table the three charts share. It writes only `element.style.transform` and text while scrubbing, builds nothing from strings and sets no `style` attribute, so strict CSP and Trusted Types hold.
- `src/elements/chart.js`: the pure `nearestPoint(points, xFraction, { domain })` and `plotFraction(boxFraction, { width, pad })`; `linePaths` also returns `drawn`, the points it drew through, which the scrubber reads.
- Deviation from RFC 0004 §1: the message keys are in the `chart.*` family (`chart.scrub*`), as the story brief asked, not a new `scrub.*` family; the table's caption names the tile's accessible name (as the RFC says) while the slider's name uses the plain label, so a ticking figure never renames the slider; `<ts-chart>` keeps its hidden `vals` list of bar sentences, because the merged bar story's tests and acceptance read every bar in words and the table lists only the last 12 points.
- Deviation: the table's rows are kept in place by a small sliding-window sync in `scrub.js` (rows before the first listed x go, new rows are added at the end, a cell is written only when its text changed) and not by `rows.js`, whose keyed diffing would add about 0.7 kB min+gz to each of three entries that have no room under their budgets. The rows are keyed by x (by the ISO day for the equity curve), so a screen reader's cursor keeps its row as readings arrive.
- Deviation: the overlay and the table are also on `<ts-equity-curve>` `Wide`, since §1.3 puts them in every variant that draws a plot; the story file lists `M` and `XL`.
- Page Up moves later and Page Down earlier, as the slider pattern has it (the RFC names the keys, not their direction).
- Other series of a multi-series `<ts-chart>` read their nearest point at the snapped x, and their dot sits on the rule's x, which is a little off its own line where the series are not sampled at the same x.
- `<ts-grid>` observes `scrub` and redraws its tiles when it changes, so `scrub="off"` set at runtime removes the tab stop at once.
- `docs/guide/trading-dashboard.md` no longer lists scrubbing among the gaps.
