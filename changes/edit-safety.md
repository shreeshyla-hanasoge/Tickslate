### Added

- `locked` attribute and property on `<ts-grid>`: a read-only dashboard. A long press neither starts editing nor fires `ts-edit-change`, and a widget button under the pointer still gets its click. `editing = true` while locked is reverted with one development warning, and locking while editing ends edit mode.
- `grid.undo()` restores the active profile's previous layout and returns `true` (`false` when there is nothing to undo). History holds 20 steps per profile and is cleared when the host sets `layout`. Ctrl+Z or Cmd+Z undoes while editing.
- An undo toast after a remove, "<Label> removed · Undo" (`part="toast"`, `role="status"`, a 44px Undo button). It stays 6 s, pauses while hovered or focused, and appears without sliding under reduced motion. `undo-toast="off"` suppresses it, and the removal is then announced by the grid's own status region instead.
- `grid.hiddenItems` lists children whose item isn't in the active profile as `{ id, type, label }`, and `grid.restore(id)` adds one back (its declared size, else its first supported size).
- `ts-layout-change` reasons `'undo'` (with `id: ''`) and `'add'`.

### Changed

- Double-clicking a remove badge, or pressing Delete twice, now fires one `ts-layout-change` and one announcement. The badge hides while the tile fades.
- Text selection: with a coarse pointer tiles keep `user-select: none` and `-webkit-touch-callout: none` (not when locked). With a fine pointer text in tiles can be selected outside edit mode; selection is blocked while editing or dragging.

### Breaking

- None. Hosts that listen for `ts-layout-change` should expect the new reasons `'undo'` and `'add'`.

### Internal

- `src/elements/grid-history.js`: `createHistory(cap = 20)` with `push`, `undo` and `clear`, tested in `test/grid-history.test.mjs`.
- The grid's English strings live in one `TEXT` constant, ready for a messages option.
