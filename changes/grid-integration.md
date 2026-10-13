### Added

- `<ts-grid>` works from markup alone: with no `layout` set, every child becomes a tile. Its type comes from the tag, its size from the child's `size` attribute (else the first size it supports), and its id from `item` (else the type, then `type-2`, `type-3`). Generated ids are written back as the `item` attribute.
- In that implicit mode the grid keeps the user's arrangement when the host re-renders: moved and resized tiles stay put, a new child is appended, a departed child is dropped, and a tile the user removed stays removed. A `size` the host writes itself resizes that tile.
- Setting `grid.layout` to a `Layout` or an array of items switches the grid to explicit mode for good.
- Two children of one type can have different sizes: each child's own `spec`, or its `sizes` and `label` attributes, decides what it snaps to, before the grid's `catalog` and the built-in widgets.
- `ts-layout-change` detail gains `items` (the active profile's list) and `previous` (the layout before the edit), and on a remove `index` and `item`.
- `ts-columns-change` detail gains `initial`, and the event now fires once after the first measure with `initial: true`.
- Development warnings (`tickslate:` prefix) for an explicit-mode child with no `item`, a layout item with no child after two frames, a dashed child tag still undefined after 2 s, and ids generated for repeated types.

### Changed

- `<ts-grid>` reads every layout it is given with `unknown: 'keep'`, so a tile whose tag isn't defined yet survives a save. A layout item with no child is skipped in placement but stays in every `ts-layout-change`.
- `ts-layout-issues` fires only when the host sets `layout` or `catalog`.
- A child with `slot="empty"`, and `script`, `style` and `template` children, are never tiles.
- `profile` falls back to `DEFAULT_PROFILE`, and profiles are looked up as own properties, so `profile="toString"` renders an empty board rather than throwing.

### Internal

- `itemsFromChildren`, `reconcile`, `specResolver` and `hostResizes` in `grid-geometry.js` hold the pure half of implicit mode, with tests in `test/grid-geometry.test.mjs` and `test/grid-sync.test.mjs`.
