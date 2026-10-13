### Added

- Tap-to-place on `<ts-grid>` (WCAG 2.5.7). Activating a tile's handle without dragging picks the tile up, and the pick-up is announced. Activating another tile's handle moves the held tile into that slot and drops it, activating the held tile drops it, and Escape or a tap on empty board cancels. The keyboard shares the same held state, so a tile picked up by tap can be moved with the arrows and the reverse.
- Edit announcements through the grid's polite status region: "Editing layout, N tiles. Tab to a tile, Space to pick it up.", "Done editing layout.", "Showing the <profile> layout." (not on load), "Can't move further.", "Undone.", and a position with every move and drop. Each is cleared and set on the next frame, so two identical announcements in a row are both spoken.
- Keyboard moves and resizes, and tap-to-place, scroll the tile's handle into view with `scrollIntoView({ block: 'nearest' })`, smoothly only when `prefers-reduced-motion` allows.
- The handle is named "<label>, <size>, position n of N", has shared hidden instructions through `aria-describedby`, and carries `aria-pressed` while its tile is held.

### Changed

- Each tile's edit chrome is now a plain container with three sibling buttons: a handle that covers the tile (the only Tab stop), Remove ("Remove <label>") and Resize ("Resize <label>, now <size>"), both `tabindex="-1"` but exposed to assistive technology. The old `role="button"` wrapper around the remove button, which axe reports as `nested-interactive`, is gone. Clicking Resize without dragging, as a screen reader does, steps to the next size.
- While editing, managed tiles are `inert`, and each tile's own `inert` value is restored exactly when editing ends.
- Chromes are kept in placement order after every render (with `moveBefore` where the browser has it, otherwise the focused handle is refocused), so Tab follows the visual order and the focused handle keeps focus across reorders.
- Removing a tile whose control had focus moves focus to the next tile's handle, else Done, else the grid, instead of dropping it.
- Focus rings are `outline: 2px solid var(--ts-focus)`, not box shadows, so they survive forced colours.
- Escape ends edit mode only when focus is inside the grid or on `body`, or a gesture is active, so Escape in a host dialog no longer ends editing behind it.
- A scheduled profile change that falls due while editing or dragging is applied after Done (or when the gesture ends), instead of reshuffling tiles under the user's hand.

### Breaking

- The chrome's markup changed (`.chrome > .handle + .remove + .resize`); hosts reaching into the shadow root with `.chrome[role=button]` would break. Nothing public changes: attributes, parts, events and `ts-layout-change` reasons are as before.

### Internal

- `src/elements/grid-input.js`: the pure `keyAction(key, focusedId, state)` and `tapAction(tappedId, state)`, returning `pickUp`, `moveBy`, `placeAt`, `resizeStep`, `remove`, `cancel` and `drop` actions, tested in `test/grid-input.test.mjs`.
- New strings live in the grid's `TEXT` constant.
- `docs/ACCESSIBILITY.md` still lists the `role="button"` chrome and box-shadow rings under "Where the existing widgets stand"; that row can be removed with this change.
