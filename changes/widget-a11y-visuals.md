### Added

- `data-ts-palette="cvd"` re-colours profit and loss as blue and orange and moves the accent off blue, so they stay apart under deuteranopia and protanopia, in light and dark.
- `data-ts-palette="red-up"` swaps `--ts-profit` and `--ts-loss` for markets where red means a rise.
- `@media (prefers-contrast: more)` raises `--ts-line` to 3:1 and `--ts-muted` to 7:1 on `--ts-surface`, with no attribute needed.

### Internal

- `test/palettes.test.mjs` simulates colour vision with the Machado 2009 matrices, measures CIE76 ΔE, and checks the contrast floors. One condition added to the media-rule assertion in `test/default-tokens.test.mjs` so palette and contrast blocks do not count as theme switches.
- The gallery (`widgets.html`) is not in this story's file list, so it has no palette switcher yet; a palette can be tried by setting the attribute on a grid.
- The `prefers-contrast` blocks are in `tokens.css` and the defaults only; the preset files set their own `--ts-line` and `--ts-muted`, so a preset overrides the preference. Raising them there is a follow-up.
