### Added

- `<ts-chart>`: line and area trends for up to four series, at Wide, M, L and XL. Wide names the first series in the header and has no legend or gridlines. M adds a legend row (each series' name and last value), dashed gridlines with compact labels on the right, and start, middle and end labels on the x axis. L and XL move the legend to a rail on the right (under the plot on a narrow tile). Every series ends in a dot, and a legend swatch is a bar for a line and a filled square for an area, so the kind never relies on colour alone. Skeletons follow each size's layout, and the empty state says "No data yet".
- Two data forms draw the same chart: `{ series: [{ name, kind, points: [{ x, y }] }] }` and `{ rows, x: 'date', y: ['revenue', 'cost'] }`. In the rows form `y` is a key, keys, or `{ key, name, kind }` objects. Kinds `'line'` and `'area'` can be mixed in one chart.
- `x` is read with `toTime` by default (seconds, milliseconds, ISO strings and Dates), or with `toNumber` when `xType: 'number'` (the RFC's name for the axis type, since `x` already names the row key). `y` is read with `toNumber`, so numeric strings count. Points are sorted by x. A row or point that can't be read is dropped and counted, and development warns once, "dropped 3 rows it couldn't read".
- Only the first four series are drawn; development warns once, "draws at most 4 series; 6 were given".
- Time axes label spans under a day with `fmt.time` and longer spans with day labels from a cached `Intl.DateTimeFormat` in the formatter's locale and zone (with the year once a span reaches a year). Number axes use `fmt.number`. Gridlines fall on four evenly spaced round values; the zero line is drawn in `--ts-axis`.
- `format` (`number`, `money`, `percent`, `duration`), `decimals` and `unit` shape the last values and the axis labels, as in `<ts-metric>`. `asOf` and `live` show the synced time and the live dot.
- The tile is named like `Revenue and cost: Revenue, last 12,400; Cost, last 8,100`, and the svg inside is a `role="img"` whose label is the result alone: `Revenue, last 12,400; Cost, last 8,100`.
- Tokens `--ts-series-1` to `--ts-series-6` in `tokens.css` and the built-in defaults, for Paper and for both dark blocks, each at least 3:1 against `--ts-surface` (the tokens test checks all twelve). `<ts-chart>` uses 1 to 4.
- `TsChart`, `ChartData`, `ChartSeries`, `ChartOptions`, `ChartKind`, `ChartModel` and the `ts-chart` tag-map entry in the types, and `TsChart` exported from `tickslate/elements`.
- `examples/generic.html` gains two charts with made-up data: revenue and cost from rows (M), and requests per minute from named series (L).

### Changed

### Breaking

### Internal

- `chart.js` gains `seriesDomain` (the shared x and y domain of several series) and `areaPaths` (one series' line and area on a given domain, with the zero line clamped into the plot), both written with loops so a very long series can't overflow the stack.
- `chartModel` is pure and also exposed as `TsChart.chartModel`; `TsChart.viewModel` adds the tile name and keeps the svg label as `chartLabel`. It returns a few fields beyond the RFC's `ChartModel` for the element to write (`ticks`, `grid`, `zero`, `zeroPath`, per-series `dot`, `extra`, header `label`, `time` and `live`).
- Every template holds four series slots that are hidden when unused, so new data never changes the markup. `update()` writes only `d` attributes, text, and (when the series changes) a swatch class or `hidden`, skipping any write that would change nothing; the end dots are zero-length round-capped paths, so they stay circles under a stretched viewBox and need no inline style.
- `niceDomain` (exported for tests) picks the round bounds and step for the gridlines.
- `test/series-chart.test.mjs` covers both data forms, mixed kinds, an empty series, a single point, missing fields, numeric strings, seconds timestamps, axis labels per locale and zone, the series cap, and a write-count check on `update()`.
