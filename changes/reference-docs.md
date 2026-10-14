### Added

- A reference page for every element: `docs/widgets/ts-grid.md`, `ts-card.md`, `ts-metric.md`, `ts-chart.md`, `ts-today-pnl.md`, `ts-equity-curve.md` and `ts-session-clock.md`. Each widget page has its sizes, data shape in TypeScript, a minimal example, attributes and properties, actions and the `ts-action` detail, parts, the loading, empty and error states, and its accessible name. The grid page covers implicit and explicit layouts, per-item spec resolution, every way of editing, the edit pill and Add back, `locked`, undo, `hiddenItems` and `restore()`, the empty board and every event. These are the pages a render-failure message links to.
- `docs/reference/core.md`: every export of `tickslate`, with its signature and an example where one helps.
- `docs/reference/events.md`: every `ts-*` event with its detail type, who fires it, and that it bubbles and is composed.
- `docs/theming.md`: every `--ts-*` token with its purpose, Paper and Graphite values and where it is used, plus dark-mode rules and islands, the `@layer` defaults, fonts, parts, a brand theme in six variables, and Tailwind and shadcn/ui mappings.
- `docs/guide/your-own-widget.md`: writing a widget with `TsWidget`, `static spec`, `static dataShape` and `customElements.define`, used in an implicit grid, with the full base-class reference.

### Internal

- `test/docs-coverage.test.mjs` fails when an export of `src/core/index.js`, a tag defined under `src/elements`, a fired event or action, a `--ts-*` token in `tokens.css` or a key in a widget's static `dataShape` is missing from `docs/`, when the theming table's Paper and Graphite values drift from `tokens.css`, and when a docs link is broken. It imports only `node:` modules.
