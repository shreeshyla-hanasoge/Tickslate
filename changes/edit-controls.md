### Added

- Built-in ways in and out of edit mode on `<ts-grid>`, so no host has to build UI. They are hidden by `locked` and by the new `edit-controls="off"` attribute, for hosts with their own controls (long press, Escape and the `editing` attribute still work).
  - An "Edit layout" button, visually hidden until focused, that is the grid's first Tab stop. Enter starts editing.
  - A floating edit pill (`part="edit-pill"`), sticky at the bottom of the grid while editing, with 44px targets. Done ends edit mode. While tiles are hidden it also shows "Add back (n)", which opens a list of them by label; choosing one calls `restore(id)`, announces "<Label> added back." and moves focus to the restored tile. Escape closes the list. The undo toast shares the pill's dock and sits 10px above it.
  - A `pointerdown` outside the grid (judged with `composedPath()`) ends edit mode. One inside the pill or its list doesn't.
  - When editing ends, focus returns to the element that started it (the Edit layout button, or the tile under the long press) if it can still take focus, else to the grid, which gets `tabindex="-1"`, `role="group"` and `aria-label="Dashboard"` when the host gave none. Focus is moved before any chrome turns inert or `aria-hidden`, and only if it was inside the grid.
- An empty board: when the active profile has no visible tiles the board stays one row tall and shows "No widgets on this layout yet" (`part="empty"`), replaceable with a `slot="empty"` child. It offers Add back while `hiddenItems` isn't empty (not while locked).
- Types for the `edit-controls` attribute, the `edit-pill` and `empty` parts and the `empty` slot in `grid.d.ts`.

### Changed

- Under `prefers-reduced-motion` the edit outline is `color-mix(in srgb, var(--ts-ink) 50%, transparent)`, up from a `--ts-line` dash. RFC 0002 §5.7 says 45%, but that is 2.81:1 against Paper's `--ts-bg`, under the 3:1 it requires; 50% is 3.21:1 in Paper and 4.86:1 in Graphite.
- The toast now sits in a `.stack` inside the sticky dock, above the pill, instead of being positioned on its own.

### Breaking

- None.

### Internal

- `src/elements/grid-focus.js`: the pure `isOutside(path, grid, extras?)` and `pickFocusTarget(candidates)`, tested in `test/grid-focus.test.mjs`, which also checks the outline's contrast against `--ts-bg` in both themes.
- New strings live in the grid's `TEXT` constant.
