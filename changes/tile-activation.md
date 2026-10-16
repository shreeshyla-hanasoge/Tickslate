### Added

- `href` attribute and property on any widget: the label becomes a real link that stretches across the whole tile, while buttons, links and other controls inside the tile keep their own clicks. Only `http:`, `https:`, `mailto:`, `tel:` and relative URLs are accepted; other schemes (`javascript:`, `data:`) and protocol-relative URLs (`//host`, `\\host`) are ignored, with a development warning. A rejected `href` does not stop `activatable` from working.
- `activatable` attribute and property on any widget: the label becomes a button that fires a bubbling `ts-action` event with `{ action: 'open', id }` (the tile's `item`) on click, Enter or Space, with a focus ring around the tile. `href` wins only when it is valid.
- Point selection on `<ts-chart>`: when `actions` includes `'select'`, the points are buttons named by series, formatted x (a date or time on a time axis) and value, firing `ts-action` with `{ action: 'select', value, series, y, index }` on click, Enter or Space. The points are one tab stop, and the arrow keys, Home and End move between them.

### Changed

- Plain content slotted into a tile (text, spans, lists) no longer blocks the tile's click; only controls (buttons, links, inputs, anything with `tabindex`) and the `actions` slot sit above it.
- Links, `activatable` tiles and chart points do nothing while the enclosing `<ts-grid>` is editing.

### Internal

- `validateHref` and the `TsOpenAction` and `TsChartSelectAction` types are added to the base widget typings.
