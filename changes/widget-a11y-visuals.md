### Added

- `data-ts-palette="cvd"` re-colours profit and loss as blue and orange and moves the accent off blue, so they stay apart under deuteranopia and protanopia, in light and dark.
- `data-ts-palette="red-up"` swaps `--ts-profit` and `--ts-loss` for markets where red means a rise.
- `@media (prefers-contrast: more)` raises `--ts-line` to 3:1 and `--ts-muted` to 7:1 on `--ts-surface`, with no attribute needed, in the default tokens and in every theme preset.
- The widget gallery has a Palette switcher beside the Preset one (`widgets.html?palette=cvd`).

### Fixed

- A palette on any ancestor now applies through a themed island below it: a `data-ts-palette` on `<body>` reaches a `<ts-grid data-theme="dark">`, a `.dark` element, a `data-theme="light"` island and a `data-theme="auto"` grid, instead of falling back to the default red and green. A preset on the island still beats an ancestor palette, as documented.
- The `cvd` palette also sets series 2, 3 and 4 so the six series colours stay at least 30 ΔE apart, and the first two stay apart from profit and loss under deuteranopia and protanopia.

### Internal

- `test/palettes.test.mjs` simulates colour vision with the Machado 2009 matrices, measures CIE76 ΔE, and checks the contrast floors; `test/browser/palettes.spec.mjs` and `test/browser/palette-gallery.spec.mjs` check the computed values in real engines. `test/presets.test.mjs` covers the preset high-contrast blocks. One condition added to `test/default-tokens.test.mjs`, and `test/browser/presets.spec.mjs` now expects the real palette values.
- Palettes use the same nearest-island rule as presets, so a light island in a dark island in a light page is not tracked (put `data-theme="light"` on the element there).
- Firefox answers `matchMedia('(prefers-contrast: more)')` under emulation but kept the root's old custom properties until a reload; the spec reloads after emulating.
