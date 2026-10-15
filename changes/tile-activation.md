### Added

- `href` attribute on any widget: wraps the tile label in `<a part="link" href="...">` with a stretched-link pseudo-element (`[part~="link"]::after`) that makes the whole tile clickable while inner buttons and slotted action controls continue to receive clicks. Only `http:`, `https:`, `mailto:`, `tel:` and relative URLs are accepted; unsupported schemes (like `javascript:` or `data:`) are rejected with a development warning.
- `activatable` attribute and property on any widget: turns the tile into an interactive trigger, firing a bubbling `ts-action` event with `{ action: 'open', id }` (where `id` is the tile's `item` attribute) on click, Enter or Space. A visible `--ts-focus` ring outlines the tile on keyboard focus (`:focus-visible`).
- Point selection on `<ts-chart>`: when `actions` includes `'select'`, data points render as interactive targets (`.pt`), firing `ts-action` with `{ action: 'select', value, series, y, index }` on click or Enter.
- Edit-mode suppression: activation clicks, links and chart point selection are disabled while the enclosing `<ts-grid>` is in editing mode (`grid.editing`).

### Internal

- Added `validateHref` validator in `src/elements/widget.js` and TypeScript types for `TsOpenAction` and `TsChartSelectAction` in `src/elements/widget.d.ts`.
- `test/tile-activation.test.mjs` covers URL validation, stretched link CSS rules, `href` and `activatable` reflection, keyboard activation, edit-mode suppression, and chart point select calculations.
- `test/browser/activation.spec.mjs` validates full browser interactions across Chromium, WebKit, Mobile Safari, Firefox, and Mobile Chrome.
- Size measurements: `chart (bundled)` measures 20,024 B (19.55 kB min+gz), which is 56 B over its 19.5 kB (19,968 B) budget. `session-clock (bundled)` is 18,939 B (18.49 kB min+gz, within its 18.5 kB budget). In accordance with AGENTS.md, the budget was not raised and strings were preserved; reported for maintainer baseline update.
