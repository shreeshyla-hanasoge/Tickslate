### Added

- `<ts-grid>` pins up to three tiles above the board at 2 columns (phones): one sticky row, equal in width, each tile at its `S` variant, left out of the board. At 3 or 4 columns the tiles return to the board at their layout sizes and `topStrip` is kept.
- `grid.setTopStrip(ids)` pins or unpins tiles from code and returns `false` when nothing changed. `ts-layout-change` gains the reason `'strip'`, and the change can be undone.
- In edit mode a strip tile reorders among the others by drag, arrow keys and tap-to-place, and every tile gets a **Pin to top** / **Unpin** button at 2 columns. A fourth pin is refused with an announcement. The strip comes first in Tab and reading order and mirrors under `dir="rtl"`.
- `--ts-strip-top` (default `0px`) sets how far below the top of the page the strip sticks, for a host's own fixed header.
- New messages: `grid.strip`, `grid.pin`, `grid.unpin`, `grid.pinned`, `grid.unpinned` and `grid.stripFull`.

### Internal

- The pure helpers `splitStrip`, `stripBoxes`, `stripSlotAt` and `mergeStrip` in the grid's geometry, with tests.
- Undo restores the strip as it was along with the profile.
- The strip needs manual slot assignment; where the browser lacks it the pinned tiles stay on the board.
