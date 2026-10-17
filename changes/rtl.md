### Added

- `<ts-grid>` mirrors under `dir="rtl"` (the attribute or CSS `direction`, on the grid or any ancestor): the first tile sits top-right, drag, resize, tap-to-place and the arrow keys follow the reading direction, and the remove button and resize handle swap sides. Time-series charts and signed figures stay left to right.

### Internal

- `boxOf`, `cellAt` and `extentOf` in `src/elements/grid-geometry.js` take `{ rtl }`. The grid reads `getComputedStyle(this).direction` in `_measure`, re-measures when a `dir` attribute changes on it or an ancestor, and swaps ArrowLeft and ArrowRight before `keyAction`.
- Chrome and the visually hidden Edit layout button use `inset-inline-start` and `inset-inline-end`; the tiles themselves are still placed from the physical left edge by the mirrored `x`.
- A direction set only by a stylesheet change is picked up at the next measure (a resize or a layout change), because nothing can be observed for it.
