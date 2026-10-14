### Added

- `<ts-metric>`: a KPI tile at S, Wide and M. S shows the label, the value and its change; Wide adds a sparkline; M adds a target bar with its percentage, and a caption. Skeletons follow each size's layout, and the empty state says "No data yet".
- The change comes from `delta` or `deltaPct` when given, else from `previous`. It always carries `+` or `−` (U+2212) and an `aria-hidden` ▲ or ▼; a zero change has neither. When `previous` is 0 there is no percentage, never `∞%`. `goodWhen` (`'up'`, `'down'` or `'neither'`) decides whether a rise is coloured as a gain, a loss or neither.
- Formats: `number` (default), `money` (the resolved currency), `percent` (a fraction, or 0 to 100 with `percentPoints: true`) and `duration` (milliseconds). `unit` formats through `fmt.unit` (`182 ms`, `3 seats`), and `compact: true` gives `1.2M` at every size. At S the headline goes through `fmt.fit` with the matching style, so a long figure goes compact while the tile stays its size. Money shows the formatter's own decimals; pass `decimals: 0` for whole currency units.
- `series` takes `{ t, v }` points (`t` read with `toTime`, in any order) or plain numbers spaced evenly; `target` draws the bar (no bar for 0 or less, and past 100% the text reads over while the bar stops at full).
- The region is named like `Signups, 1,204, up 12% vs last week`, and the sparkline is a `role="img"` that says where the trend went.
- `TsMetric`, `MetricData`, `MetricModel` and the `ts-metric` tag-map entry in the types, and `TsMetric` exported from `tickslate/elements`.
- `examples/generic.html` gains a row of metric tiles with made-up numbers.

### Changed

### Breaking

### Internal

- `metricModel` is pure and also exposed as `TsMetric.metricModel`. `update()` writes only `textContent` and attributes, skipping any write that would change nothing; the bar's fill is an SVG `width` attribute so no inline style is needed.
- `test/metric.test.mjs` covers the model (no previous, zero previous, negatives, numeric strings, seconds timestamps, goodWhen, unit, compact, compaction at S, the sparkline and the target) and counts the DOM writes `update()` makes.
