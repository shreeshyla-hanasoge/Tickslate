### Added

- `density="compact"` on `<ts-grid>` (and the `density` property): `--ts-row` becomes `120px`, `--ts-pad` `12px` and `--ts-gap` `10px`, so more tiles fit on screen. A rule on the `ts-grid` element in your CSS still wins; a phone keeps its own rows and changes only the padding; a saved layout is unchanged. Any other value is `comfortable`, with one development warning.
- `data-ts-density="compact"` on any element sets the same three tokens for a widget outside a grid.
- Tiles answer their height as well as their width (`container: ts-tile / size`). Below a content-box height of `6.5rem` (snug) a widget hides its secondary line, and below `5rem` (tight) also its chart axis labels, so nothing clips: `<ts-today-pnl>` and `<ts-equity-curve>` hide their footer, note and axis rows, and the shared `sec` and `ter` classes do it for any widget of your own. A default dashboard hides nothing.
- Eleven type tokens, `--ts-text-2xs` to `--ts-text-xbig`, in rem with a px floor, as `max(11px, .6875rem)` does for the label. Each equals the px size it replaces at a 16px root, grows with a larger root font size, and never goes below its px size at a smaller one, so an `html { font-size: 62.5% }` page is unchanged.
- The widget gallery has a Density control and a Text spacing switch (the four WCAG 1.4.12 overrides, applied to the page and to every widget's shadow root).

### Changed

- The tile label is 11px, not 10px (`--ts-label-size` is now `max(11px, .6875rem)`), and the `terminal`, `graphite` and `paper` presets take the same value. It is the only text that changed size at a 16px root.
- `<ts-today-pnl>`, `<ts-equity-curve>`, the shared tile text and the grid's own controls size their text from the type tokens, so a reader's larger default text size reaches them. The other built-in widgets still draw their small text in px until a follow-up converts them.
- The side column and the rail of `<ts-equity-curve>`, and the headline column of `<ts-today-pnl>` at `Wide`, widen when their figure does (a larger root font size, or a reader's letter spacing), where before the figure ran into its neighbour or was cut.

### Internal

- `docs/theming.md` has a Density and text size section and a row for each new token; `docs/widgets/ts-grid.md` has the attribute and the property.
- `test/density.test.mjs` (new): the tokens in both files, the px floors at 10px, 16px and 20px roots, a scan of the converted files for `font-size` and `font` in px, and the tier thresholds. `test/browser/density.spec.mjs` (new): the grid attribute, the gallery controls, no headline, label or figure cut at compact density with the text-spacing overrides on (both themes), and the 62.5% and 20px roots. `test/widget.test.mjs`, `test/tile-chrome.test.mjs`, `test/presets.test.mjs` and `test/default-tokens.test.mjs` follow the converted rules.
- Deviation from RFC 0004 §2.2: the RFC's table gives a compact two-row tile a content box of at least 17rem; it is `2 × 120 + 10 − 26 = 224px`, 14rem. No widget needed a tier there except `<ts-equity-curve>` `XL`, whose rail gets its own query at `15rem`: the rail's gap tightens and the "shaded on the chart" note goes, because four stacked stats are 3rem too tall under the text-spacing overrides.
- Deviation: figures can still be wider than their column under the WCAG 1.4.12 letter spacing, and a size formula cannot know the spacing, so the layouts give way instead. The `<ts-today-pnl>` headline column and the `<ts-equity-curve>` side column and rail have a minimum width, not a fixed one, and the `S` headline of `<ts-today-pnl>` may use the tile's padding.
- Deviation: a snug tile also hides the flexible spacer (`.tile > .f1`) that pushes a footer to the bottom, which is a gap and a flex share and hides no text. With it, no gallery widget is cut at compact density alone. Compact density together with the text-spacing overrides still cuts `<ts-metric>` `S` and `Wide` and `<ts-session-clock>` `S` (and two px of `Banner` on a phone), because the row under the headline is not marked `sec`; their files belong to the type-scale follow-up and another story, and the browser spec lists them and fails the day one stops being cut.
- The three entry rows `today-pnl`, `equity-curve` and `chart` are over their budgets; see the PR for the figures.
