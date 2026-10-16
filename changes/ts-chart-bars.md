### Added

- `<ts-chart>` draws `kind: 'bar'` series: filled bars from the zero line, up for gains and down for losses, grouped side by side and mixable with lines and areas. Bars are allowed on time and number axes too.
- `xType: 'category'` reads x as text and puts points and bars on a band scale, with one label per band that truncates with an ellipsis. `chartModel` returns `categories`, and each series carries `bars`.
- Bars carry their values as text, with a true minus for negatives: each bar is a named button when `select` is on, and sits in a hidden list when it is not.

### Changed

- `<ts-chart>` draws up to six series, using `--ts-series-1` to `--ts-series-6`, where it drew four. Anything beyond six warns once in development.
- `<ts-chart>` rewrites its point buttons after a size change, where a new size could drop them until the data changed.

### Internal

- `bandScale`, `bandGeometry` and `barPaths` are added to `src/elements/chart.js`, pure and tested.
- RFC 0003 §26 lists `linePaths` downsampling above `2 × width` points as part of 0.2.0, but it belongs to §23 (`perf-hygiene`) and this story does not build it. The six-series change from §26 is built here.
- The sixth series in forced colours adds a dash pattern (`2 3`) for series 5 and 6, and bars take `ButtonFace` as a separator stroke, since the forced-colours test allows only four system colours.
- Bars hold up on awkward data: the bar slot on a time or number axis follows the typical gap and is capped, every bar has a minimum width and height, grouped bars are read band by band, a bar is selected by its whole rectangle, and each of six bar series has its own outline cue under forced colours.
