### Added

- `<ts-layout-list for="grid-id">`: edit a grid's layout as a list, with a size button for each supported size, Move up, Move down, Remove and Undo on every row. It edits through the grid's `move`, `resize` and `remove`, so it fires the same `ts-layout-change` events as dragging, and it needs no pointer. Import it with `tickslate/elements/layout-list`.
- `list.*` messages for the layout list's labels and announcements.

### Internal

- `listRows` and `editRow` in `src/elements/layout-list.js` hold the row model and the edit; `wording` in `src/elements/picker-model.js` is now exported for the list to share.
- A budget row for the `layout-list` entry in `scripts/check-size.mjs`, and a line for it in `test/non-widget-defines.mjs`.
