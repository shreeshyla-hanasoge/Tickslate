### Added

- A README that goes from install to a saved dashboard: the one-line pitch, npm and pinned jsDelivr install, optional fonts and `tokens.css`, a nine-line quick start (`<ts-grid>` in implicit mode with `<ts-metric>`, `<ts-chart>`, `<ts-card>` and one `persistLayout` call), data states and JSON attributes, saving layouts, edit mode, an events table, theming, browser support and the Jest `transformIgnorePatterns` line.
- Framework recipes for React 19 and 18, Vue 3, Svelte and Angular, each covering data, events and saving layouts.
- Guides for saving layouts (per-device layouts, throwing storage, the array shorthand, `ts-layout-issues`, undo and an Add back menu), server templates (Blade and Django through the JSON `data` attribute) and bringing your own chart (Chart.js and ECharts inside `<ts-card>`, with resize and `--ts-*` theming).
- `examples/quickstart.html`, the README quick start as a page that runs under `npm run dev`.

### Changed

- The README no longer says nothing usable has shipped.

### Internal

- `test/readme.test.mjs` (`node:fs` only) checks that the example runs the README quick start, that the quick start stays within 12 lines, and that every `tickslate` import in the README and guides names an export of the shipped types.
- The React recipe marks its property and event behaviour, including the `onts-action` form, "to be verified" until consumer-examples runs it.
