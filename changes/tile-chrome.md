### Added

- `heading-level` attribute, 1 to 6, on any widget or `<ts-grid>`: the level of each tile's heading. The widget's own wins, then the nearest grid's, then 3. A value outside 1 to 6 is ignored with a development warning.
- Parts `header`, `label`, `value`, `empty` and `skeleton` on every widget, and `chart` on the ones that draw one, joining `tile` and `error`, so `::part()` reaches the same pieces everywhere.
- Typography tokens `--ts-label-size`, `--ts-label-case`, `--ts-label-tracking`, `--ts-label-weight` and `--ts-headline-weight`. Their defaults are today's values, so nothing moves until you set one; `--ts-headline-weight` follows `--ts-num-weight`.
- Under `forced-colors: active` the session-clock fill, ticks and marker, the live dot, Today's P&L marks, chart lines (told apart by colour and dash), the selected range button and the metric target bar stay visible in system colours.
- Messages `time.live`, `equity.rangeExpand` and `equity.range1W.long`, `equity.range1M.long`, `equity.range3M.long`, `equity.rangeYTD.long` and `equity.rangeAll.long`, so "live" and the spoken range names can be translated.

### Changed

- `<ts-grid>`'s board (`part="board"`) is a `role="region"`, named by the `aria-label` on `<ts-grid>` and else by `grid.dashboard` ("Dashboard"), so a dashboard has one landmark. The name follows `messages` and `locale`, and a host's own `aria-label` is never rewritten. The grid no longer writes a `role` or an `aria-label` to its own element: when focus has nowhere else to go it goes to the board.
- Today's P&L (net, realised, unrealised) and the equity curve (net, peak, max drawdown) show an `aria-hidden` ▲ or ▼ beside a gain or a loss, as the metric already did, with a small gap after it. On the narrowest tiles the headline is a few percent smaller to make room for it; the Wide equity curve keeps its 34px headline on a tile of 420px or more and widens its side column by the arrow's width instead.
- Each tile's label is a heading (`role="heading"`), and keeps the plain label as its name where the tile shows other words, such as "Today" in a small P&L tile. A tile with no label has its heading hidden from assistive technology.
- The tile's accessible name is rewritten only when it changes, so a ticking value no longer prompts a screen reader to read the tile again.
- Range buttons on the equity curve read as "1W, 1 week" to a screen reader, and a Today's P&L exit mark is a diamond where an entry is a circle.
- The equity curve's live dot sits before its label at `M`, as in every other widget.
- Time axes, progress tracks (and the times under the session clock's bar) and chart plots stay left to right in a right-to-left page, with their empty text and axis words reading in their own direction; widget CSS uses logical properties only, and figures isolate their bidi run.
- The forced-colours selected range button is `Highlight` with `HighlightText`, its pair.

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
- Departures from RFC 0003, for the maintainer to amend or reject:
  - §29.1 lists three system colours (`Highlight`, `CanvasText`, `ButtonFace`). The selected `.btn.on` used `Highlight` with `ButtonFace` text, which is not a system pair and can fail contrast; it is now `Highlight` with `HighlightText`, a fourth keyword. Proposed amendment: add `HighlightText` to §29.1's list. `test/tile-chrome.test.mjs` and docs/ACCESSIBILITY.md item 16 allow it.
  - §5.2's board region is implemented without writing anything to the host: the grid names `part="board"` and never the host element, so there is one place that names the region (`_nameBoard`) and no second role. A host's `aria-labelledby` is not read; only `aria-label` is, as the RFC says. The grid's fallback focus target is the board (`tabindex="-1"`), not the host.
  - `<ts-grid>` now calls `ensureTokens()` on connect, so its chrome can read `--ts-*` tokens with no colour fallbacks, as the widgets do, even when no widget has connected yet.
  - `arrowFor(text)` still reads the sign from the formatted text, now the first `+` or `−` in the run of non-digits before the first digit (so a leading bidi mark, or a currency before the sign in `nl`, does not hide it). It does not take the number, because a value that rounds to zero shows no sign and so must get no arrow, which only the text knows.
  - The equity view model's `ranges` is `[]` unless the variant is `XL`, the only one with range buttons.
