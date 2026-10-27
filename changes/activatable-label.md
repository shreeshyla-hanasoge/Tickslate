### Changed

- An `activatable` tile's label keeps the label tokens (`--ts-label-case`, `--ts-label-tracking`, size, weight, colour), so it reads like a plain tile's label in every preset.
- The docs for `activatable` now say that the whole tile is the click target, including a chart or a heatmap cell, and that a host should route `open` to a page other than the one the tile is on. Whether data areas should stay out of the click target is tracked in issue #68.
- An `activatable` tile's label is cut with an ellipsis when it is too narrow, as a plain label is, instead of being clipped mid-letter.
- An `activatable` `<ts-session-clock>` is named by the one title it shows ("Open"), not both forms run together.
