### Added

- `<ts-grid>` mirrors under `dir="rtl"` (the attribute or CSS `direction`, on the grid, an ancestor or a shadow-tree wrapper it is slotted into): the first tile sits top-right, drag, resize, tap-to-place and the arrow keys follow the reading direction, and the remove button and resize handle swap sides. Time-series charts stay left to right, and signed figures keep their locale's order.

### Internal

- The grid's pixel geometry takes a right-to-left option, the grid reads its computed direction on every measure and re-measures when a `dir` attribute changes on it or an ancestor, and the left and right arrow keys swap before they are interpreted.
- The edit chrome, the visually hidden Edit layout button and the undo toast use inline insets, padding and margins. The empty board's Add back menu is centred with a physical offset on purpose, because centring is symmetric.
- A direction set only by a stylesheet change is picked up at the next measure (a resize or a layout change), because nothing can be observed for it. The same holds for a grid slotted into a closed shadow tree.
