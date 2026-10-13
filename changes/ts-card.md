### Added

- `<ts-card>`: a themed tile for any content, including another charting library's chart. It draws the shared tile chrome (surface, border, radius, padding, header) from `--ts-*` tokens only, in every theme, at all seven sizes.
- Slots: the default slot is the body, a `flex: 1; min-height: 0; overflow: hidden` box, so a slotted element with `height: 100%` fills the tile's remaining height and follows resizes. `value` is a headline styled like the other widgets' big figure, `actions` sits at the header's right end, `footer` is one muted line, and `empty` replaces the empty text.
- Attributes: `label`, `sizes` (whitespace-separated, such as `S Wide M`; invalid tokens are ignored and the default is all seven, so it limits snapping standalone and in a `<ts-grid>`), `live` (the live dot), `as-of` (a time, shown as "synced HH:MM", and shortened to "HH:MM" on a tile under 200px) and `scrollable`. A scrollable body scrolls on its own, takes keyboard focus, and fades its last 28px only while there is more below.
- `data` is optional and only `{ asOf?, live? }`, which win over the attributes. `data = null` never replaces slotted content: the empty view shows only when nothing is slotted into the body. `state="loading"` covers the body only; the header, headline and footer stay.
- The region's accessible name is the label followed by the slotted `value` text, when there is one.
- `examples/generic.html`: a non-finance dashboard of cards in implicit mode with made-up content and a placeholder chart at `height: 100%`, with theme and width toggles.
- `TsCard`, `CardData` and the `ts-card` tag-map entry in the types, and `TsCard` exported from `tickslate/elements`.

### Changed

### Breaking

### Internal

- `test/card.test.mjs` covers slot preservation in every state and size, snapping from the `sizes` attribute, the header and `scrollable` behaviour.
- `test/element-names.test.mjs` fails if any observed attribute or added property of a Tickslate element is one of a fixed list of DOM names (RFC 0002 §2.8), which is why the card's attribute is `scrollable` and not `scroll`.
