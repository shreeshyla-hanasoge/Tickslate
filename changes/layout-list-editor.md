### Added

- `<ts-layout-list for="grid-id">`: edit a grid's layout as a list, with a size button for each supported size, Move up, Move down, Remove and Undo on every row. It edits through the grid's `move`, `resize` and `remove`, so it fires the same `ts-layout-change` events as dragging, and it needs no pointer. Import it with `tickslate/elements/layout-list`.
- `list.*` messages for the layout list's labels and announcements.

### Internal

- `listRows` and `editRow` in `src/elements/layout-list.js` hold the row model and the edit; `wording` in `src/elements/picker-model.js` is now exported for the list to share.
- A budget row for the `layout-list` entry in `scripts/check-size.mjs`, and a line for it in `test/non-widget-defines.mjs`.
- Deviations from the RFC, accepted: `listRows` takes an optional fourth argument `labelOf(item)` so a tile's own `label` wins; the list also watches the grid's `profile`, `locked` and tile attributes, its children, `layout = ...` (through a pass-through on the instance's `layout` setter) and `_onState`, because none of those fire an event; unit tests drive `editRow` with a fake grid and the element is covered in real engines; `editRow` takes a seventh argument that formats the figures in a message; a `locked` grid makes the list read-only (every row button and Undo `aria-disabled`, with a `list.locked` caption), which the maintainer may overrule.
- A row's size buttons are one Tab stop with the arrow keys, Home and End moving between them (four stops per row instead of up to ten); they keep `aria-pressed`.
- `layoutState` in `src/elements/layout-list.js` reads the active profile back so an edit is announced only when the layout changed.
