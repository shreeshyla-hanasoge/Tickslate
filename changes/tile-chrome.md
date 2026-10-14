### Added

- `heading-level` attribute, 1 to 6, on any widget or `<ts-grid>`: the level of each tile's heading. The widget's own wins, then the nearest grid's, then 3. A value outside 1 to 6 is ignored with a development warning.
- Parts `header`, `label`, `value`, `empty` and `skeleton` on every widget, and `chart` on the ones that draw one, joining `tile` and `error`, so `::part()` reaches the same pieces everywhere.
- Typography tokens `--ts-label-size`, `--ts-label-case`, `--ts-label-tracking`, `--ts-label-weight` and `--ts-headline-weight`. Their defaults are today's values, so nothing moves until you set one; `--ts-headline-weight` follows `--ts-num-weight`.
- Under `forced-colors: active` the session-clock fill, ticks and marker, the live dot, Today's P&L marks, chart lines (told apart by colour and dash), the selected range button and the metric target bar stay visible in system colours.
- Messages `time.live`, `equity.rangeExpand` and `equity.range1W.long`, `equity.range1M.long`, `equity.range3M.long`, `equity.rangeYTD.long` and `equity.rangeAll.long`, so "live" and the spoken range names can be translated.

### Changed

- Today's P&L (net, realised, unrealised) and the equity curve (net, peak, max drawdown) show an `aria-hidden` ▲ or ▼ beside a gain or a loss, as the metric already did. On the narrowest tiles the headline is a few percent smaller to make room for it.
- Each tile's label is a heading (`role="heading"`), and keeps the plain label as its name where the tile shows other words, such as "Today" in a small P&L tile. A tile with no label has its heading hidden from assistive technology.
- The tile's accessible name is rewritten only when it changes, so a ticking value no longer prompts a screen reader to read the tile again.
- Range buttons on the equity curve read as "1W, 1 week" to a screen reader, and a Today's P&L exit mark is a diamond where an entry is a circle.
- The equity curve's live dot sits before its label at `M`, as in every other widget.
- Time axes, progress tracks and chart plots stay left to right in a right-to-left page; widget CSS uses logical properties only, and figures isolate their bidi run.

### Breaking

- Each tile is a `role="group"` named by its headline, with a heading inside, instead of a `<section>` region landmark. A dashboard is one labelled region (the grid), not one per tile; tests that look a tile up with `getByRole('region', …)` need `'group'`.
- A live tile's accessible name ends with ", live" (and the session clock's while a session is open), so a test that matches a name exactly, such as "Signups, 1,204", needs the suffix or a looser match.

### Internal

- `header(opts)` and `arrowFor(text)` in `src/elements/widget.js`, used by every built-in widget and not yet promoted for custom ones. `header()` takes two options beyond RFC 0003 §5.1: `inner` (markup inside the label, for the session clock's long and short titles) and a string `meta` (a widget's own right-hand markup, for Today's P&L counts and the equity range buttons), plus `labelClass`.
- `part="skeleton"` is a wrapper the base puts around a widget's skeleton markup (`.skel`, laid out like the tile), so widgets' skeletons are unchanged; the RFC does not say which element carries it.
- `--ts-headline-weight` is declared `var(--ts-num-weight)` rather than the literal `500` in RFC 0003 §5.4's table, so a host that set only `--ts-num-weight` keeps its heavier headlines; it resolves to 500 by default. A `--ts-num-weight` set on a descendant of `:root` does not reach it, because custom properties inherit their computed value.
- `<ts-card>`'s `value` part is the `<slot name="value">`, so `::part(value)` styles what is slotted there.
- A grid's `heading-level` is read at each widget render. Changing it on a grid that is already drawn takes effect at the widget's next render; telling widgets to redraw belongs to the grid story.
- `test/tile-chrome.test.mjs` checks the parts, the heading level, the name's writes, ", live", the arrows, the typography tokens, logical-properties-only CSS and the forced-colours colour rules; `test/browser/tile-chrome.spec.mjs` checks the group, forced colours and right-to-left rendering in a browser. `test/browser/render.spec.mjs` reads the tile as `.tile` rather than `section`.
- Sizes grew with the chrome: each per-widget entry is about 1.1 to 1.7 kB min+gz larger (Today's P&L 15,991 to 17,653 B, over its 17 kB budget); the orchestrator re-baselines.
