### Fixed

- An `activatable` tile's label keeps the label tokens (`--ts-label-case`, `--ts-label-tracking`, size, weight, colour), so it reads like a plain tile's label in every preset.
- The docs for `activatable` now say that the whole tile is the click target, including a chart or a heatmap cell, and that a host should route `open` to a page other than the one the tile is on. Whether data areas should stay out of the click target is tracked in issue #68.
