### Added

- `<ts-grid>` reads and tabs its tiles in the order they sit on screen, row by row and left to right, after they are rearranged (WCAG 1.3.2 and 2.4.3). Your markup order is untouched, so Vue and React keep patching their own nodes. Below Safari 16.4, which lacks manual slot assignment, the grid keeps one slot and both orders follow your DOM order, as before.
- `grid.readingOrder`: the visible tiles' ids in that visual order.
- `ts-reading-order-change`: fires, bubbling and composed, with `detail.order` when the visible order changes. It does not fire for the first order with a tile in it, for your first `layout` before any edit, or mid-edit; at Done it fires before `ts-edit-change`.

### Internal

- The shadow root is created with `slotAssignment: 'manual'` when `HTMLSlotElement.prototype.assign` exists, with one `<slot>` per visible tile in `visualOrder`, each tile given its slot by `slot.assign()` after every render.
- `_manual` is read from `root.slotAssignment`, so a reused declarative root that assigns by name falls back to one slot, with a one-time development warning.
- Slots are reordered with the fewest moves (`keepInPlace`, a longest increasing subsequence), by `moveBefore` where there is one, so "last goes first" moves one slot.
- WebKit and Firefox drop the slide of a tile whose slot moved, even with `moveBefore`: when one tile jumps to the other end, that tile does not slide and the rest do. Chromium keeps every slide.
- `visualOrder(placements)` in `grid-geometry.js` is unit tested for ties and multi-row tiles, and `_orderChromes` uses it too.
- Differences from RFC 0003 §11, which the RFC does not spell out:
  - While editing, the slots keep their order and `readingOrder` holds still, except that a removed tile leaves it at once and a new one follows the rest; both take the new order at Done, where the event tells of every difference from the last order told of.
  - The first order is the first with a tile in it after connect, and the host's first `layout` before any `ts-layout-change` is taken without an event; later changes, including tiles appearing, fire it.
  - The default slot keeps what is not a tile (text, `<script>`, `<style>`), and `slot="empty"` content is assigned to the empty panel's slot, so both render where they did.
  - A hidden tile's slot is cleared with `slot.assign()` before it is removed, because removing a slot alone left Chrome reporting the tile as assigned to it.
  - `readingOrder` and the event also work in the single-slot fallback, where they report the visual order that Tab does not follow.
- `test/browser/grid-order.spec.mjs` covers Tab order, the accessibility tree, the untouched host DOM across twenty rearrangements, slides with motion on, the fallback and a reused named root, start-up, the event and its order with `ts-edit-change`, hidden tiles, the empty slot, implicit mode and `persist`.
