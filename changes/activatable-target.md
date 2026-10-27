### Changed

- On a touch screen the header row of an `href` or `activatable` tile is a little taller in compact density, so the strip that opens the tile stays 44px tall.

### Breaking

- **A click on data no longer opens an `href` or `activatable` tile.** The label, the header and the empty space still open it, but a click on a chart scrubs, on a `<ts-pnl-calendar>` cell focuses the cell, on a scrolling list scrolls it, on a sort button sorts and on a selectable row or chart point fires `select`, and none of them fires `open` or follows the `href`. Lists inside such a tile now scroll under the mouse wheel. The keyboard is unchanged: the label is one Tab stop and Enter opens it. Do this instead: to open the tile from a click anywhere, listen for `click` on the tile yourself; in a widget of your own, put `class="lift"` on each data surface so it behaves the same way.

### Internal

- `test/browser/activatable.spec.mjs` clicks every lifted surface of every widget at every size, on an `activatable` and an `href` tile, and checks that the label, the header, the padding and the headline figure open it, that lists scroll under the wheel, that sorting, selecting and scrubbing still work, that the Tab order is the plain tile's with the label in front, and that the open target is 44px tall on a touch screen in both densities. `test/tile-activation.test.mjs` checks the shared rule and which surfaces of each template carry `lift`.
- Measured before the change, on all five projects: a click on a chart, a calendar cell, a scrolling list, a selectable row or a selectable chart point opened the tile, and a wheel over a list in an activatable tile did not scroll it. A sort button already sorted and did not open the tile, because its sticky header cell has `z-index: 2`; RFC 0005 §1 inferred from the CSS that it opened the tile.
- Deviation from RFC 0005 §1.8: `README.md` had no attribute table, so it gains a short "Opening a tile" section with a table of `href` and `activatable` instead.
- Deviation from RFC 0005 §1.2: `<ts-mini-chart>`'s instrument picker does not exist yet, so only its plot boxes carry `lift`; `mini-chart-actions` lifts the picker when it builds it.
- Deviation from RFC 0005 §1.4: the 44px floor is met by a `min-block-size` on the header under `(pointer: coarse)` only, as the other 44px targets are; with a fine pointer at compact density the strip is 41px.
- `docs/reference/events.md`, `docs/guide/trading-dashboard.md`, `src/elements/index.d.ts` and `test/card.test.mjs` each change a line to match the narrower target, and `test/browser/activatable-label.spec.mjs` expects the taller header on a touch screen at 12px padding.
