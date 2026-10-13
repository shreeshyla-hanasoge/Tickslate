### Added

- Tiles look finished with only `import 'tickslate/elements'`. On the first widget connect, if `--ts-surface` is not defined on the document, the default tokens are adopted as a constructed stylesheet (a `<style>` element where adoption is unavailable) inside `@layer tickslate.defaults`, and development builds warn once that `tokens.css` isn't loaded. Unlayered CSS beats layered CSS, so a `tokens.css` link added later or a host rule such as `:root { --ts-surface: … }` always wins. Nothing happens without a document.
- `<ts-grid data-theme="light">` (or any element with `data-theme="light"`) is a light island: it restores the Paper values inside a `.dark` or `data-theme="dark"` page, and `data-theme="dark"` makes a dark island in a light page.
- `--ts-axis` (the chart zero line, now used by `.lz`) and `--ts-focus` (focus rings, defaulting to the accent) in both themes and the defaults.
- `.btn.on` has an inset accent underline, so the pressed state isn't carried by a background tint alone.
- Before the elements upgrade, `tokens.css` hides `ts-grid` children and reserves one `--ts-row` of height for the grid, and known widget tags reserve their standalone height, all at zero specificity, so a page that loads the script late doesn't jump.
- `examples/bare.html`: the elements entry only, with no `tokens.css` and no fonts.

### Changed

- `--ts-font-num` falls back to a system sans stack (`ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`) after Newsreader instead of Georgia, whose digits are old-style and proportional. Figure classes keep tabular numerals, so live numbers stay steady without the web font.

### Breaking

- Dark mode from the OS is now opt-in. With no `data-theme` and no `.dark` class, tiles stay light whatever `prefers-color-scheme` says. Set `data-theme="auto"` on `<html>` (or any ancestor) to follow the OS again. `data-theme="dark"` and the `.dark` class are unchanged.

### Internal

- `src/elements/default-tokens.js` exports `TOKENS_CSS` and `ensureTokens(doc)`.
- `test/default-tokens.test.mjs` parses `tokens.css` and the defaults and fails unless they have the same blocks, properties and values; it also covers `ensureTokens` with stand-in documents.
- `test/tokens.test.mjs` checks contrast floors in both themes with the WCAG luminance formula. Paper `--ts-warn` on `--ts-bg` is 4.43:1, below 4.5:1, so following RFC 0002 §14 C warn is asserted on `--ts-surface` only (no widget renders warn text on `--ts-bg`); ink and muted are asserted on both.
