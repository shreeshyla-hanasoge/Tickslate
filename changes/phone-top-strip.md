### Added

- `<ts-grid>` pins up to three tiles above the board at 2 columns (phones): one sticky row, equal in width, each tile at its `S` variant, left out of the board. At 3 or 4 columns the tiles return to the board at their layout sizes and `topStrip` is kept.
- `grid.setTopStrip(ids)` pins or unpins tiles from code and returns `false` when nothing changed. `ts-layout-change` gains the reason `'strip'`, and the change can be undone.
- In edit mode a strip tile reorders among the others by drag, arrow keys and tap-to-place, and every tile gets a **Pin to top** / **Unpin** button at 2 columns. A fourth pin is refused with an announcement. The strip comes first in Tab and reading order and mirrors under `dir="rtl"`.
- `--ts-strip-top` (default `0px`) sets how far below the top of the page the strip sticks, for a host's own fixed header.
- With a tile focused or held in edit mode, the **P** key pins or unpins it, so the strip needs no pointer. It is in the keyboard table and in the grid's instructions text.
- New messages: `grid.strip`, `grid.pin`, `grid.unpin`, `grid.pinned`, `grid.unpinned`, `grid.stripFull` and `grid.pinUnsupported`. `grid.instructions` gains a sentence about **P**.

### Internal

- The pure helpers `splitStrip`, `stripBoxes`, `stripSlotAt` and `mergeStrip` in the grid's geometry, with tests.
- Undo restores the strip only for a step that changed it (a pin, an unpin, removing a pinned tile); other steps leave the current pins alone, so undoing a move in one profile cannot drop pins made in another.
- Only tiles the grid shows (in the active profile, with a rendered tile) take one of the three pin slots. Ids in `topStrip` that the profile does not show are kept, after the shown ones, and never block a pin. `setTopStrip(layout, ids, counts)` in the core takes an optional `counts(id)` for this.
- Deviation from RFC 0003 §19, which assumes every widget has an `S` variant: a widget whose sizes do not include `S` (for example the equity curve, table and calendar) cannot be pinned. It has no pin button, **P** announces `grid.pinUnsupported` ("This widget has no small size."), `setTopStrip` ignores it with one development warning, and a saved `topStrip` that names it keeps the id while the tile stays on the board.
- **Add back** after removing a pinned tile returns the tile to the board unpinned (undo the removal to get the pin back); recorded in docs/widgets/ts-grid.md.
- The grid's size budget row was re-measured to 35 kB (RFC 0003 §25) for this story's rendering, pinning and chrome.
- The strip needs manual slot assignment; where the browser lacks it the pinned tiles stay on the board.
