# Changelog

All notable changes to Tickslate are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

## 0.3.0 — 2026-10-26

The second feature release. It adds a mini candlestick chart, three general-purpose widgets (breakdown, status and feed), scrubbing and exact values on the charts, a layout list, a phone top strip, right-to-left grids, compact density and text scaling, resize and profile-switch feedback, session breaks and market presets, colour-vision and high-contrast palettes, strict CSP and Trusted Types support, `createDashboard`, table column widths and a page clock, and it makes the changes listed under Breaking. Read that list before upgrading.

### Breaking

- **`widget.clock` and `grid.clock` return a function, never `null`.** Read without a clock of their own they return the page clock (`configure({ clock })`, or `Date.now()`); they returned `null` before. Do this instead: to find out whether a clock was set on the element, keep your own reference to what you assigned rather than testing for `null`.
- **Every chart that draws a plot has one tab stop.** `<ts-today-pnl>` (`M`), `<ts-equity-curve>` and `<ts-chart>` each gain a slider that reads the chart point by point, so Tab stops once more on each, and a `<ts-chart>` with `actions` including `'select'` needs one more Tab to reach its points. Do this instead: set `scrub="off"` on the widget or the grid to remove the stop; a test that counts tab stops needs the extra ones.
- **A tile's container is `container: ts-tile / size`**, where it was `container-type: inline-size`, so tiles answer their height as well as their width. Unnamed `@container` width rules keep working. Do this instead: if you set a widget's `height: auto`, give it a definite height. A default tile loses no line.
- **A layout is read with a cap.** `readLayout`, and so `<ts-grid>` and `persistLayout`, keep at most 100 items per profile, 20 profiles (the built-in `market` and `closed` count) and ids of 128 characters; the excess is dropped and reported in `ts-layout-issues` as `too-many-items`, `too-many-profiles` or `bad-shape`. Do this instead: split a layout that needs more across profiles; a direct `readLayout` call can pass `maxItems` and `maxProfiles`.

### Added

New widgets and controls

- `<ts-mini-chart>` (sizes M, L, XL): a small candlestick chart with entry and exit marks and a candle-close countdown, drawn by Emberwick and imported from `tickslate/elements/mini-chart`; `tickslate/elements` and the CDN files never load it. `emberwick` (0.14.0 or later) is an optional peer dependency, loaded the first time the chart has bars, and without it the tile says so and the page is untouched.
- `<ts-mini-chart>` follows your theme (candles from `--ts-profit` and `--ts-loss`, re-read when a token changes), updates in place, takes Emberwick's own volume profile in `volumeProfile` at `L`, and fires a `timeframe` action (`ts-action` with `id` and `value`) for the timeframe buttons when `actions` includes `'timeframe'`. CSS parts `tile`, `header`, `label`, `chart`, `timeframes`, `empty`, `error` and `skeleton`; class `TsMiniChart`; types: `TsMiniChart`, `MiniChartData`, `MiniChartBar`, `MiniChartProfile`, `MiniChartModel` and `TsMiniChartAction`.
- `<ts-breakdown>`: parts of a whole as a share bar (S), a stacked bar (Wide, Tall) or a donut (M), with percentages that sum to 100.0%, more than six parts folded into "Other", and negative values left out and reported. CSS parts `bar`, `legend` and `item` beside the common ones.
- `<ts-status>`: one row per service with its state in words beside a dot whose shape differs for `ok`, `degraded`, `down` and `unknown`, at S, Tall and M. CSS parts `table`, `row`, `cell`, `dot` and `bar`.
- `<ts-feed>`: the latest events, newest first, keyed by `id`, so a new item prepends without moving the tile or the reader's place, and nothing is announced. CSS parts `list`, `item` and `bar`.
- `<ts-breakdown>`, `<ts-status>`, `<ts-feed>` and `<ts-mini-chart>` take the common attributes (`label`, `size`, `data`, `state`, `href`, `activatable`, `scrub`, `locale`, `currency`, `time-zone`, `hour-cycle`, `stale-after`, `flash`, `heading-level`) and fire `ts-action` with `open` and `retry` like the other widgets. Classes `TsBreakdown`, `TsStatus` and `TsFeed`, the `breakdown`, `status` and `feed` entries in `WIDGETS` (General category) and `tickslate/elements/breakdown`, `status` and `feed`.
- `<ts-layout-list for="grid-id">` (from `tickslate/elements/layout-list`): edit a grid's layout as a list, with a size button for each supported size, Move up, Move down, Remove and Undo on every row. It edits through the grid's `move`, `resize` and `remove`, fires the same `ts-layout-change` events as dragging, needs no pointer, and is read-only on a `locked` grid. CSS parts `rows`, `row`, `name`, `list`, `status`, `undo`, `empty` and `locked`; class `TsLayoutList`.
- `createDashboard(target, options)` in `tickslate/elements`: builds a `<ts-grid>` and a tile for every item from a layout and an object of data, answers `ts-add-request` itself, and returns `{ grid, set, update, destroy }`, for hosts with no framework. The `DashboardOptions` and `Dashboard` types.

Charts

- Charts can be scrubbed. Hover a mouse, or drag a finger, along `<ts-today-pnl>` (`M`), `<ts-equity-curve>` or `<ts-chart>` and a rule, a dot per series and a small label show the nearest point and its values. A vertical swipe still scrolls the page, and a read-out too tall for a short plot shows the series that fit and a "+N more" line.
- Each of those charts has one keyboard tab stop, a `role="slider"` named "…, read point by point": Left and Right move one point, Page Up and Page Down ten, Home and End jump to the ends and Escape hides the label. Its `aria-valuetext` names the point and its values, so a screen reader speaks each point as the keys move; nothing is `aria-live`.
- `scrub="off"` (the `scrub` attribute and property, `'on'`, `'off'` or null) on any widget or `<ts-grid>` turns scrubbing off, with no read-out and no tab stop. A widget's own value wins over its grid's, and scrubbing is inert while the grid is editing.
- A visually hidden table of the last 12 points, with a caption and column and row headers, on `<ts-equity-curve>`, `<ts-today-pnl>` at `M` and `<ts-chart>`. It updates in place, so a new reading adds one row.
- The CSS parts `scrub`, `scrub-rule`, `scrub-dot` and `scrub-readout` on the three charts.

Layouts and editing

- `<ts-grid>` pins up to three tiles above the board at 2 columns (phones): one sticky row, equal in width, each tile at its `S` variant. `grid.setTopStrip(ids)` pins or unpins from code, `ts-layout-change` gains the reason `'strip'`, and in edit mode every tile gets a **Pin to top** / **Unpin** button and the **P** key does the same. The strip is CSS part `strip`. A widget with no `S` size cannot be pinned. `--ts-strip-top` (default `0px`) sets how far below the top of the page the strip sticks.
- `<ts-grid>` mirrors under `dir="rtl"` (the attribute or CSS `direction`, on the grid or an ancestor): the first tile sits top-right, drag, resize, tap-to-place and the arrow keys follow the reading direction, and the remove button and resize handle swap sides. Time-series charts stay left to right.
- A size badge on a tile while it is resized, such as "Medium · 2×2", fading a second after the last release or key press (CSS part `badge`).
- The `hint` attribute on `<ts-grid>`: a first-run coach mark (`part="hint"`, with a 44 px **Got it** button, `part="hint-dismiss"`) pointing at the first tile until it is dismissed or edit mode starts, and the `ts-hint-dismiss` event (`detail: { reason: 'dismiss' | 'edit' }`). The library stores nothing: you remember it and stop setting `hint`.
- A scheduled profile change shows a toast, "Switched to After close", with a **Keep Market hours** button that keeps the previous profile until the schedule next changes. `undo-toast="off"` suppresses it.
- `density="compact"` on `<ts-grid>` (and the `density` property): `--ts-row` becomes `120px`, `--ts-pad` `12px` and `--ts-gap` `10px`, so more tiles fit on screen. `data-ts-density="compact"` on any element sets the same three tokens for a widget outside a grid.
- Tiles answer their height as well as their width: below a content-box height of `6.5rem` a widget hides its secondary line, and below `5rem` also its chart axis labels, so nothing clips; the shared `sec` and `ter` classes do it for your own widgets. A default dashboard hides nothing.
- Eleven type tokens, `--ts-text-2xs` to `--ts-text-xbig`, in rem with a px floor, so a reader's larger default text size reaches every built-in widget and control, and a page with `html { font-size: 62.5% }` is unchanged.
- The widget gallery has a Density control, a Text spacing switch (the four WCAG 1.4.12 overrides) and a Palette switcher.

Saving layouts and tables

- `width` on a `<ts-table>` column: `'content'` (as wide as its widest text, up to half the table, a cut cell ending in an ellipsis with its text as its `title`), `'fill'`, or a number of CSS pixels (at least 40). A table that sets none renders as before.
- `configure({ clock })`: one clock for the page. Every grid and widget without a `clock` of its own reads it, `null` returns to `Date.now()`, and `currentConfig()` returns it. `createCalendar` takes its default `now` from it, so a pretend clock also makes `calendar.issues` deterministic.
- `readLayout` never throws for input that is not JSON: a throwing getter or Proxy gives an empty layout and one `bad-shape` issue. `topStrip` is read up to 32 entries.

Sessions

- `SessionSpec.breaks` (and `breaks` on a special session): gaps such as a lunch break. The session is closed during one, `calendar.state()` gains `onBreak` and `ends`, and `<ts-session-clock>` reads "Break" and "resumes 12:30", counts "to break", draws the gap and names itself "on break".
- `presets.nyse()`, `presets.nasdaq()` (each with `pre`, `post` and `extended` segments), `presets.lse()`, `presets.fx()` and `presets.tse()` (with a lunch break), each citing the exchange page and the date its hours were read; `presets.nse()` and `presets.mcx()` now cite theirs too.
- `calendar.holidaysThrough(id)`, `calendar.issues` and the `now` option of `createCalendar`: a holiday list that ends less than 30 days ahead is a `'holiday-coverage'` issue, and `<ts-session-clock>` logs it once in development. Tickslate still fetches no holidays.
- `calendar.windows(id, from, to, { throughBreaks })` and `duringBreaks: 'closed'` on a profile schedule: a lunch break does not change the layout profile unless the schedule asks.

Themes and accessibility

- `data-ts-palette="cvd"` re-colours profit and loss as blue and orange and moves the accent off blue, so they stay apart under deuteranopia and protanopia, in light and dark; the six series colours stay at least 30 ΔE apart.
- `data-ts-palette="red-up"` swaps `--ts-profit` and `--ts-loss` for markets where red means a rise.
- `@media (prefers-contrast: more)` raises `--ts-line` to 3:1 and `--ts-muted` to 7:1 on `--ts-surface`, with no attribute needed, in the default tokens and in every theme preset.
- `--ts-num-width`: the average advance of a figure character in `em` (default `.62`), for a host with a wider `--ts-font-num`; the figures in a tile's stat cells shrink to fit.

Security

- Strict CSP and Trusted Types: widgets, the grid, the picker and the grid controls render styled and edit under `default-src 'self'; style-src 'self'; script-src 'self'` and under `require-trusted-types-for 'script'; trusted-types tickslate`, with no exception. See docs/guide/security.md.
- `configure({ styleNonce })`: the nonce for the `<style>` fallback below Safari 16.4, where constructed stylesheets are missing. A development warning when the page's `trusted-types` directive does not allow the `tickslate` policy; a second copy of Tickslate on a page needs `'allow-duplicates'`.

Building your own widgets

- `defineWidget(tag, Ctor, { type, messages })`: a custom widget can ship its own English strings, as flat dotted keys starting with `widget.<type>.` or `<type>.`. A host's translation always wins, and the widget needs no `configure()` call to read well.

Messages

- New keys to translate: `chart.scrub*` (and `chart.scrubMore`), `grid.badge`, `grid.hint.touch`, `grid.hint.pointer`, `grid.hintDismiss`, `grid.profileSwitched`, `grid.keepProfile`, `grid.keptProfile`, `grid.strip`, `grid.pin`, `grid.unpin`, `grid.pinned`, `grid.unpinned`, `grid.stripFull`, `grid.pinUnsupported`, `list.*`, `miniChart.*`, `breakdown.*`, `status.*`, `feed.*`, `widget.breakdown.*`, `widget.status.*`, `widget.feed.*`, `session.break`, `session.resumes`, `session.toBreak` and `session.ariaBreak`. `grid.instructions` gains a sentence about **P**.

Guides and examples

- A trading dashboard example (`examples/trading.html`) and a guide for trading apps (`docs/guide/trading-dashboard.md`); a sessions guide (`docs/guide/sessions.md`); guides for server-side rendering, with recipes for Next.js and Nuxt; working example apps for `vanilla-cdn`, `react-vite`, `vue-vite` and `svelte-vite`; and `docs/VERSIONING.md`, which says what counts as a breaking change for each public surface.
- A public site: a landing page with a live, editable board, a docs hub, the changelog, the playground, the gallery and the examples.

### Changed

- The tile label is 11px, not 10px (`--ts-label-size` is now `max(11px, .6875rem)`), and the `terminal`, `graphite` and `paper` presets take the same value. Every built-in widget and control now sizes its text from the rem type tokens; at a 16px root nothing else changes size, except the rebalance glyph of `<ts-capital-funding>` (15px, now 16px).
- At compact density, or a larger root font size, a tile that cannot fit the row under its headline hides that row instead of cutting the headline; the words stay in the tile's accessible name. A `<ts-pnl-calendar>` `Banner` narrower than 700px on a 150px row also drops the Best and Worst stats and the weekday names.
- Under a reader's text spacing, the figure columns of `<ts-today-pnl>` and `<ts-equity-curve>` widen when their figure does, the next close of the `<ts-session-clock>` `Banner` header gives way with an ellipsis before the clock does, and the words under the bar of `<ts-progress>` `S` are no longer squeezed.
- When a headline goes compact ("1.2M"), the headline value (`part="value"`) of `<ts-metric>`, `<ts-today-pnl>` and `<ts-equity-curve>` carries the full figure as its `title`. `<ts-metric>`'s accessible name now always has the full figure, also where `compact` is set.
- When the schedule changes the profile (`reason: 'schedule'`) or a kept override lapses (`'override-ended'`), the tiles crossfade instead of swapping in one frame; your own `override()`, the `profile` attribute, the first render and every edit still apply at once, and nothing animates under `prefers-reduced-motion`. The switch is announced once, as "Showing the After close layout.", naming the built-in profiles as the controls do (it used the profile's id, "closed", before). `ts-profile-change` fires once the new layout is on the board.
- With `persist` (or `persistLayout()`), a layout you assign to `grid.layout` after the grid connects, and before the user's first edit on that device, is now the device's defaults: a saved layout still wins over it, and `reset()` returns to it. `persistLayout()` with no `defaults` takes the grid's layout at attach.
- The default font stacks (`--ts-font-ui`, `--ts-font-num`, and the presets that restate them) put `Arial` before `system-ui`, so a Linux page without Geist or Newsreader falls back to Liberation Sans (Arial's metrics) rather than DejaVu Sans, whose digits are 14% wider. Platforms with their own UI face are unchanged. A tile heading's label floor is `max(6ch, 4.2em)`, so it keeps about five letters in a narrow tile whatever the face's digit width.
- When a tile is under 7rem wide and its header meta ("just now", "synced 11:42", "stale 5 min") is dropped, the tile's `aria-description` and the dot's `title` carry that text, so neither the age nor the sync time is lost.
- A tile heading too narrow for its label ends in an ellipsis and carries the full label as its `title`; the header's meta shrinks first, so a label keeps about six characters at 320px.
- `linePaths` draws at most `maxPoints` points, `2 × width` by default, keeping each run's lowest and highest, so a long series gets a line with fewer points; pass `maxPoints: Infinity` to draw them all.
- Widgets that are `display: none`, or more than one screen from the viewport, skip their later renders and draw once, with the latest data, when they can be seen again. A tile always draws its first content, and a printout draws every tile first. Every whole-second widget timer runs on one shared timer, which sleeps while the page is hidden.
- `Translate` (the type of `t`) accepts any string key, so a custom widget's own keys type-check, and `defineWidget`'s class parameter accepts any `TsWidget` subclass with its own data type.
- Widget CSS is one constructed stylesheet per widget class, adopted by each instance, rather than a `<style>` element in every shadow root. When the page's `trusted-types` directive refuses the `tickslate` policy, no element throws: they stay empty.
- The bundles grew with the new features and messages. The core UMD is 18,623 B min+gz, up from 14,977 B, and the `grid` entry is 39,477 B. Import per-widget entries rather than `tickslate/elements` if size matters. Each widget adds at most 15 kB to the grid; eleven of them are over it today and the size check reports them.

### Fixed

- A `data-ts-palette` on `<body>` or any ancestor now reaches a `<ts-grid data-theme="dark">`, a `.dark` element, a `data-theme="light"` island and a `data-theme="auto"` grid, instead of falling back to the default red and green. A preset on the island still beats an ancestor palette.
- A `<ts-table>` far down the page draws its first fit even before it is near the viewport, so a full-page screenshot or a find in the page no longer reads it with columns it had already measured to be too many.
- A `<ts-table>` counts an overflow once, so a render deferred by the time-slicer no longer makes it drop a second column that fits.

## 0.2.0 — 2026-10-17

The first feature release. It adds a table, a watchlist and open positions, a
progress gauge, a P&L calendar, edge stats and capital funding, bar charts, a
widget picker, wide-screen layouts, translation of every string, six theme presets, framework
typings and per-widget entries, and it makes the tile and package changes
listed under Breaking. Read that list before upgrading.

### Added

New widgets and controls

- `<ts-table>` (sizes Tall, M, L, XL): typed columns (`text`, `number`, `money`, `percent`, `duration`, `time`, `date`), a header that sorts, `tone: 'sign'` columns that show `+` or `−` with an arrow, columns that drop by `priority` when they do not fit, and live updates that change cells in place so focus and scroll position survive a tick. `ts-action` carries `{ action: 'sort', value, dir }` and, once `actions` lists `'select'`, `{ action: 'select', id }`.
- `<ts-watchlist>` (sizes S, Tall, M): the instruments you follow, each with its last price, a signed change and a day-range bar, plus a sparkline at M. `change` and `changePct` are worked out from `prevClose` unless given.
- `<ts-open-positions>` (sizes Wide, M, L): open positions with a signed profit or loss and the MTM total. M and L draw a bar from stop to target with the entry and last price marked, and L adds the price path and margin. A position with `pending: true` disables its Exit button while your order is in flight.
- `<ts-progress>` (sizes S, Wide): a gauge for a value against a goal or a limit. In `limit` mode the bar turns to `--ts-warn` from `warnAt` (default 0.75) and to `--ts-loss` with stripes at 100%; in `goal` mode it turns to `--ts-profit` at 100%. It reads "6,400 of 10,000 · 64%", names the state in words ("near limit", "over limit", "goal reached") and shows a dash and no bar without a valid `target`.
- `<ts-pnl-calendar>` (sizes Tall, M, Banner): a heat map of daily profit and loss, one cell per trading day, stronger the bigger the day. Tall shows 6 weeks, M 13 and Banner a year, which folds into two half-year bands on a phone. It reads the same `days` series as the equity curve, and `today` marks later days as upcoming. Each cell is named with its date and signed value, a loss carries a corner mark so it never depends on colour, and the cells are one tab stop moved with the arrow keys, Home, End and Page Up and Down. The week starts on the locale's first day, and a weekend entry is left out of the figures with a "weekend entries not shown" note.
- `<ts-edge-stats>` (sizes S, Wide, M): win rate, profit factor, average win and loss, and expectancy. S shows the one stat its `stat` attribute names (`win-rate`, `profit-factor`, `avg-win-loss` or `expectancy`), Wide shows four, and M adds a histogram of the results.
- `<ts-capital-funding>` (sizes S, Tall, L): each account's balance against its allocations, with a shortfall hatched and written as `short <amount>`; S shows the first account. A Rebalance button is off until `actions` includes `'rebalance'`, and then fires `ts-action` with `action: 'rebalance'` and the account's `id`.
- `ts-action` from the two lists, each off until `actions` lists it: `add-instrument`, `exit-position` and `exit-all`. The widgets ask; you confirm and send new data.
- `<ts-widget-picker>`: a sheet to add widgets from, with search, categories, a size button per size and Add back for hidden tiles. `<ts-grid-controls>`: an Auto, Market hours and After close switcher for scheduled grids, and the link that makes the edit pill's Add open the picker. Both come from `tickslate/elements/controls`.
- `grid.add()`, `grid.addTypes` and the cancelable `ts-add-request` event, for you to answer by rendering a tile; `grid.move()`, `grid.resize()` and `grid.remove(id)`, which edit like a drag, with undo, `ts-layout-change` and a spoken announcement; `grid.profileOverride` and `grid.openPicker`.
- `description` and `category` on a widget's spec, filled in for every built-in widget.

Charts

- `<ts-chart>` draws `kind: 'bar'` series: filled bars from the zero line, up for gains and down for losses, grouped side by side and mixable with lines and areas, on time, number and category axes. Bars carry their values as text with a true minus, and are named buttons when `select` is on.
- `xType: 'category'` reads x as text and puts points and bars on a band scale, with one label per band that truncates with an ellipsis. `chartModel` returns `categories`, and each series carries `bars`.

Wide screens

- `<ts-grid>` has a `breakpoints` property (`{ tablet: 700, desktop: 1200 }` by default) that moves where its columns change, and `columnsFor(width, thresholds?)` and `deviceFor(width, thresholds?)` take the same optional `{ tablet, desktop }` thresholds (a `Thresholds` type).
- `--ts-grid-max-width` (default `none`) caps the board's width and centres it, so a large monitor keeps ordinary tiles.

Statistics helpers

- `dayStats(days, { timeZone })`: net, green and red days, the green rate and the best and worst day of a daily series. Rows with the same date are summed first.
- `edgeStats(trades)`, `histogram(values, edges)` and `funding(account)`: the figures the edge stats and capital funding widgets show, for a host that wants the same numbers elsewhere. `edgeStats` gives a profit factor of `null` for trades that are all break-even and `Infinity` for a win with no loss. `funding()` draws the balance across the allocations in array order, and a `funded` amount you give replaces that rule.
- The `ProgressData`, `PnlCalendarData`, `EdgeStatsData`, `CapitalFundingData` and related model and action types, and the `progress.*`, `calendar.*`, `edge.*` and `funding.*` messages for translating the new widgets.

Saving layouts

- `<ts-grid persist="my-dash">` saves the layout to `localStorage` per device and restores it, with no script. `grid.persist` reflects it. In development builds, the first edit to a grid that nothing saves warns that the edits will be lost on reload.
- `persistLayout(grid, { adapter })` takes a `LayoutAdapter` (`load(device)`, `save(device, layout)`, optional `remove(device)`), any of which may return a promise, for layouts kept on a server. A late, stale or failing adapter never throws out of the grid.
- `tickslate/elements/grid` exports `persistLayout`.

Accessibility and reading order

- `<ts-grid>` reads and tabs its tiles in the order they sit on screen after they are rearranged (WCAG 1.3.2 and 2.4.3), without moving your DOM nodes, so Vue and React keep patching their own. Below Safari 16.4 the grid keeps one slot and both orders follow your DOM.
- `grid.readingOrder` and the `ts-reading-order-change` event (`detail.order`).
- `heading-level` (1 to 6) on a widget or `<ts-grid>`: the level of each tile's heading, default 3.
- Under `forced-colors: active`, the session-clock track, live dot, P&L marks, chart lines, selected range button and metric target bar stay visible in system colours.

Tile actions

- `href` on any widget turns the label into a real link across the whole tile; only `http:`, `https:`, `mailto:`, `tel:` and relative URLs are accepted. `activatable` makes the tile a button that fires `ts-action` with `{ action: 'open', id }` on click, Enter or Space.
- `<ts-chart>` points become buttons when `actions` includes `'select'`, firing `ts-action` with `{ action: 'select', value, series, y, index }`; the arrow keys, Home and End move between them.

Freshness

- Live data with an `asOf` shows its age in the header of every widget that has one ("just now", "2 min. ago"), and past `stale-after` an amber, still dot, "Stale · 3 min" and a tile name ending ", stale". Data with an `asOf` and no `live` shows "synced 11:42".
- `stale-after` (milliseconds, or `'90s'`, `'2m'`, `'1h'`; default 2 minutes) on a widget or `<ts-grid>`, `fmt.ago(t, now, opts)` and `ctx.freshness` (`{ asOf, ago, stale }`).
- A changed headline figure tints for 700 ms in `--ts-profit` or `--ts-loss` (never on first render or under reduced motion). `flash="off"` stops it, and `this.flash(key, number, { goodWhen })` does the same for your own widgets.

Translation and formatting

- `EN` and `createMessages(overrides, locale)`: every visible and spoken string in one table, with `{param}` interpolation and plural forms from `Intl.PluralRules`. `configure({ messages })` translates every widget and grid, `currentConfig()` reads it back and `onConfigure(fn)` hears each change. A `messages` property on a widget or `<ts-grid>` overrides it for that subtree, and widgets expose `t` and pass `ctx.t` to view models. Types: `Messages`, `Translate`, `MessageOverrides` and `PluralBase`.
- `configure()` and the `hour-cycle` attribute accept `h12`, `h23` or `auto`. `fmt.date()` formats dates for the active locale on the Gregorian calendar.

Sessions

- `createCalendar` accepts sessions that cross midnight or never close: a `close` before `open` is on the next local day, and a `close` equal to `open` is a 24-hour session. Windows that touch are one (Sunday 17:00 to Friday 17:00). `'24:00'` is still rejected.
- `<ts-session-clock>` shows "Open 24/7" for a session that never closes, and an overnight window's lane and times name the day of any time that is not today.

Themes

- Six opt-in presets, `neutral`, `paper`, `graphite`, `calm`, `signal` and `terminal`: link `tickslate/themes/<name>.css` after `tokens.css` and set `data-ts-theme="<name>"` on a grid or widget. `neutral`, `calm`, `signal` and `terminal` have light and dark modes; `paper` and `graphite` are one mode each.
- Typography tokens `--ts-label-size`, `--ts-label-case`, `--ts-label-tracking`, `--ts-label-weight` and `--ts-headline-weight`, and the parts `header`, `label`, `value`, `empty`, `skeleton` and `chart` on every widget.

Packaging and typings

- Per-widget entries: `tickslate/elements/grid`, `card`, `metric`, `chart`, `today-pnl`, `equity-curve`, `session-clock`, `table`, `progress`, `watchlist`, `open-positions`, `pnl-calendar`, `edge-stats`, `capital-funding` and `controls`. Each registers only its own tag, so importing one no longer pulls in every widget. `tickslate/elements` still registers everything.
- A one-script bundle for pages with no build step: `cdn/tickslate.iife.js` sets `window.Tickslate` and registers every element, and `cdn/tickslate.js` is the same code as a minified ES module.
- `tickslate/jsx`, `tickslate/vue` and `tickslate/svelte`: types-only entries that add every `ts-*` tag, with its attributes and a typed `data`, to React, Vue and Svelte templates. `TsCommonAction` and one `ts-action` union per element, `TsOpenAction` and `TsChartSelectAction`.
- `tickslate/custom-elements.json` (a Custom Elements Manifest) and `tickslate/vscode.html-custom-data.json`.

Building your own widgets

- `defineWidget(tag, Class, { type })` registers a widget and its `static spec` in the catalog in one call, and any grid then draws it without a `catalog` entry. `widgetCatalog()` returns the built-ins plus every registered widget, and `onCatalogChange(fn)` hears each registration.
- `linePaths`, `scale` and `escapeHtml` are exported from `tickslate/elements` and are stable for 0.x.
- A demo site (the playground, the widget gallery and the examples) and a custom widgets guide.

### Changed

- `<ts-chart>` draws up to six series, using `--ts-series-1` to `--ts-series-6`, where it drew four; more than six warns once in development. It also rewrites its point buttons after a size change, where a new size could drop them until the data changed.
- A `<ts-grid>` fills its parent's width (`inline-size: 100%`), so it stays full width inside a flex or grid parent.
- `<ts-grid>`'s board is the dashboard's one labelled region, named by the grid's `aria-label` or else "Dashboard". The grid no longer writes a `role` or `aria-label` to its own element.
- Each tile's label is a heading. The tile's accessible name is rewritten only when it changes, so a ticking value no longer prompts a screen reader to read the tile again.
- Today's P&L and the equity curve show a ▲ or ▼ beside a gain or a loss, as the metric already did. A signed figure never wraps apart from its arrow, in any theme.
- Range buttons on the equity curve read as "1W, 1 week" to a screen reader, a Today's P&L exit mark is a diamond where an entry is a circle, and the equity curve's live dot sits before its label.
- Time axes, progress tracks and chart plots stay left to right on a right-to-left page, and widget CSS uses logical properties only.
- Every string the widgets and grid show or announce now comes from messages; English output is unchanged. A built-in widget's default label and empty text are the `widget.<key>.label` and `widget.<key>.empty` messages.
- Word durations, time labels, fit decisions and axis ticks follow the active locale, 24-hour by default. English durations are unchanged. `<ts-grid>` passes changes to `locale`, `currency`, `time-zone` and `hour-cycle` on to its tiles.
- Plain content slotted into a tile no longer blocks its click; only controls and the `actions` slot sit above it. Links, `activatable` tiles and chart points do nothing while the grid is editing.
- `<ts-session-clock>` with a known close but no known start shows no progress track, only the countdown and the close.
- `zonedTime` puts a wall time inside a spring-forward gap just after the gap, in every zone (02:30 on the day New York springs forward is 03:30 EDT); west of Greenwich it landed an hour early. A calendar reads its specs and holidays once, at `createCalendar`, and keeps a frozen copy.
- Fixed: a `<ts-grid>` inside a closed shadow root no longer leaves edit mode when a tile, handle or the edit pill is tapped, and its Add back list is no longer closed by a press on its own items.
- Fixed: a resize that loses its pointer now puts the tile back as it was, instead of leaving it lifted.
- The empty board's Add back button opens its list on a mouse click in every browser.
- `TsCard`'s `spec` is declared as a property, matching `TsWidget`.
- Signed figures keep their sign beside the digits in right-to-left pages in every locale: an English `+12%` no longer reads `12%+` under `dir="rtl"`, and Arabic, Hebrew and Persian figures read the same in either page direction.

### Breaking

- **Tiles are `role="group"` with a heading, not region landmarks.** Each tile was a `<section>` region; it is now a group named by its headline, with the label as a heading inside, and the grid is the one labelled region. Do this instead: look tiles up with `getByRole('group', …)` rather than `'region'`, and set `heading-level` on the grid if the default of 3 does not fit your page.
- **A live tile's accessible name ends with ", live" or ", stale".** The session clock's does while a session is open. A test that matches a name exactly, such as "Signups, 1,204", needs the suffix or a looser match.
- **`elements.dev.js` is gone.** The development build is now `dev/elements.js` (and `dev/elements/<name>.js`), reached through the `development` export condition. Do this instead: import `tickslate/elements` and enable the `development` condition in your bundler or runtime, rather than importing `elements.dev.js` by path.
- **The `unpkg` and `jsdelivr` fields point at the IIFE bundle**, `cdn/tickslate.iife.js`, which registers every element and sets `window.Tickslate`; they pointed at the core-only UMD. The UMD is unchanged and still ships at `umd/tickslate.umd.js`. Do this instead: if you want the core without elements from a CDN, name `umd/tickslate.umd.js` in the URL. Do not load the IIFE together with the UMD or the package entries, as they carry separate copies of the core.
- **`SessionState.closesAt`, `startedAt` and `progress` can be `null` while `open` is `true`**, and `Calendar.nextChange` can return `null` for an open session. Do this instead: read `null` as "no close in sight", and in TypeScript handle the wider types.
- **A calendar spec with a `close` at or before its `open` is now valid.** It used to throw `TypeError`; it now means a session that ends on the next day (or runs 24 hours when equal). A host that relied on the throw to catch a typo in `close` should check its specs.
- **The bundles grew** with the new features and messages. The core is about 14.8 kB min+gz, up from 8.5 kB, and the core UMD is 14,977 B, up from 8,639 B. Each per-widget entry is also larger (for example `tickslate/elements/metric` is 22,030 B). Do this instead: import per-widget entries rather than `tickslate/elements` if size matters.

### Internal

- The size budgets of the UMD, `controls`, `chart`, `equity-curve` and `today-pnl` were re-measured for 0.2.0 after the new widgets and messages grew the shared core, and each new widget has an entry budget.
- New contributor files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (contact still a placeholder), `SECURITY.md`, issue forms and a pull request template.
- The real-browser suite runs on five Playwright projects (Chromium, WebKit, Firefox, mobile Safari and mobile Chrome), and CI builds and deploys the demo site to GitHub Pages once the maintainer enables it.
- `npm run check:types` compiles type fixtures against `dist-lib/` under bundler, node16, node10, `exactOptionalPropertyTypes` and a CommonJS host.
- `scripts/check-size.mjs` budgets every entry; the "grid plus one widget at 15 kB" rows are warnings, not enforced, because the grid alone is about 30 kB (RFC 0003 §25).

## 0.1.0 — 2026-10-14

The first release. Version 0.0.0 was only ever a private scaffold, so nothing
is breaking for anyone who has installed from npm. The Changed and Breaking
entries below describe how this release differs from the development builds
that came before it, for anyone who tried the repository early.

### Added

A grid that works from markup

- `<ts-grid>`: lays out its children as a resizable dashboard that reflows
  across 4, 3 and 2 columns, with phone and tablet reflow and gap-filling
  placement that matches CSS `grid-auto-flow: dense`. With no `layout` set,
  every child becomes a tile. Its type comes from the tag, its size from the
  child's `size` attribute (else the first size it supports), and its id from
  `item`. The grid keeps the user's arrangement when the host re-renders.
  Setting `layout` to a `Layout` or an array of items switches to explicit mode.
- Per-child sizing: each child's `spec`, or its `sizes` and `label` attributes,
  decides what it snaps to, so two children of one type can differ.
- Market and closed layouts that switch on a `schedule`, with `override()` for
  the manual switch and a replaceable `clock`.
- `persistLayout(grid, { key, defaults?, storage? })`: loads the user's layout
  for the current device, saves each `ts-layout-change`, switches between phone
  and desktop entries, repairs corrupt data and treats throwing storage as
  empty. Returns `{ reset(device?), dispose() }`.
- Events: `ts-layout-change` (with `items`, `previous`, and on a remove `index`
  and `item`; reasons include `'undo'` and `'add'`), `ts-columns-change` (with
  `initial`, fired once after the first measure), `ts-layout-issues`,
  `ts-edit-change` and `ts-action`.
- Core: `readLayout` (which also takes a plain array, and
  `{ unknown: 'keep' }` to keep items no catalog knows), pure editing
  operations, `dropIndex`, `sizeForExtent`, `DEFAULT_PROFILE`, `typeForTag`,
  and catalogs given as a function `(item) => spec | null`.

Editing that is safe and accessible

- Edit like an iPhone home screen: long press or `editing` to start, drag with
  live reflow, a resize handle that snaps between supported sizes, remove
  badges, edge auto-scroll and full keyboard support.
- Built-in controls, so no host has to build UI: a visually hidden "Edit layout"
  button that is the grid's first Tab stop, and a floating edit pill
  (`part="edit-pill"`) with Done and "Add back (n)". Hide them with `locked` or
  `edit-controls="off"`.
- `locked`: a read-only dashboard.
- `grid.undo()` (20 steps per profile, Ctrl or Cmd+Z while editing) and an undo
  toast after a remove (`part="toast"`, `undo-toast="off"` to suppress).
  `grid.hiddenItems` and `grid.restore(id)` bring removed tiles back.
- Tap-to-place for users who cannot drag (WCAG 2.5.7), shared with the keyboard
  moves, plus polite status announcements for every edit and focus handling
  that survives reorders, removes and the end of editing.
- An empty board message ("No widgets on this layout yet", replaceable through
  `slot="empty"`), with Add back when tiles are hidden.
- Development warnings (`tickslate:` prefix) for the common integration
  mistakes: an explicit-mode child with no `item`, a layout item with no
  child, a dashed tag that is never defined, and repeated generated ids.

Widgets

- `<ts-card>`: a themed tile for any content, including another library's
  chart, at all seven sizes. Slots `value`, `actions`, `footer` and `empty`; the
  default slot is a body that a `height: 100%` child fills. Attributes `label`,
  `sizes`, `live`, `as-of` and `scrollable`.
- `<ts-metric>`: a KPI tile at S, Wide and M with a signed change (from `delta`,
  `deltaPct` or `previous`), `goodWhen`, a sparkline, a target bar, and
  `number`, `money`, `percent` and `duration` formats plus `unit` and `compact`.
- `<ts-chart>`: line and area trends for up to four series at Wide, M, L and XL,
  from `{ series }` or `{ rows, x, y }`, with a legend, gridlines and axis labels
  by size. The kind never relies on colour alone.
- `<ts-today-pnl>`, `<ts-equity-curve>` and `<ts-session-clock>`: the finance
  set, with an intraday curve, peak and max drawdown with range buttons, and
  exchange session lanes.
- The widget base `TsWidget` for your own widgets: open shadow root, shared
  themed CSS, `data`, `size`, `label`, `clock`, `static spec`,
  `static dataShape`, one render per microtask and `every()` for timers that
  pause while the page is hidden. See `docs/guide/your-own-widget.md`.
- Every widget has `spec`, `tickslateVersion` and the loading, empty and error
  views below.

Data and states

- Loading, empty and error views on every widget. Data never set shows a
  skeleton and `aria-busy`; `data = null` shows the empty state; the `state`
  attribute and `error` property show the error view, with Retry when `actions`
  includes `'retry'`. A `slot="empty"` child replaces the empty text.
- The `data` attribute: a value starting with `{` or `[` is parsed as JSON, so a
  server template can pass data with no script.
- `toTime(v)` and `toDay(v, timeZone?)`: instants as epoch seconds or
  milliseconds, a `Date`, an ISO 8601 string (including six-digit microseconds)
  or a numeric string. `toNumber` accepts decimal-library objects with a
  `toNumber()` method. Time zones flow through `equitySeries`, `equityStats`
  and `filterRange`.
- Development checks against each widget's `dataShape`, naming the element, its
  `item`, the path and what arrived; warnings for invalid JSON, an invalid
  `locale`, `currency` or `time-zone`, dropped rows and data still unset after
  10 s. A render failure logs the element and a docs link, in production too.
- Formatting: `createFormatter` (signed money with the true minus sign, lakh
  grouping, compact forms, prices, percents, 24-hour times, durations, `fit`)
  and `configure` for defaults. `fmt.unit(value, unit)` formats units, and
  `fit` takes `{ style: 'money' | 'number' | 'percent' }`. Invalid options fall
  back to the defaults and are listed in `formatter.issues`.
- Session calendars: `createCalendar` with holidays and special sessions,
  `state`, `nextChange`, `candleClose` and `windows`; NSE and MCX presets;
  `activeProfile` and `nextProfileChange`.

Install and theming

- Tiles look finished with only `import 'tickslate/elements'`: the default
  tokens are adopted in `@layer tickslate.defaults` when the page has none, and
  anything you define wins. Before the elements upgrade, tiles reserve their
  height so the page does not jump.
- Theme through `--ts-*` tokens only. Paper (light) and Graphite (dark), light
  and dark islands with `data-theme`, `--ts-axis`, `--ts-focus` and
  `--ts-series-1` to `--ts-series-6`, plus the layout tokens `--ts-row-compact`,
  `--ts-gap-compact`, `--ts-num-weight`, `--ts-shadow-lift`, `--ts-motion` and
  `--ts-ease`.
- A development build: `tickslate/elements` resolves to `elements.dev.js` under
  the `development` export condition, with every warning. Production builds
  resolve `elements.js`, which has none.
- Types for everything, including `grid.d.ts` and `widget.d.ts`.

Documentation

- A README from install to a saved dashboard, framework recipes for React,
  Vue, Svelte and Angular, and guides for saving layouts, server templates and
  bringing your own chart.
- Reference pages for every element, every core export, every event and every
  theme token, in `docs/`.
- `examples/` (quickstart, generic dashboard, bare), a playground and a widget
  gallery.

### Changed

- Dark mode follows the page, not the OS, by default; see Breaking.
- `--ts-font-num` falls back to a system sans stack after Newsreader instead of
  Georgia, whose digits are old-style and proportional.
- `fit` tries the full form, then (for `number` and `percent`) no decimals, then
  compact, and returns the compact form only when it is shorter. Money still
  goes straight from full to compact.
- `<ts-grid>` reads every layout with `unknown: 'keep'`, so a tile whose tag is
  not defined yet survives a save, and fires `ts-layout-issues` only when the
  host sets `layout` or `catalog`.
- A widget with no label is named by its tag, and registering a tag that
  another class owns warns in development.
- The edit chrome is a plain container with three sibling buttons (handle,
  Remove, Resize); managed tiles are `inert` while editing; focus rings are
  `outline`, so they survive forced colours; Escape ends editing only when
  focus is inside the grid.
- Double-clicking a remove badge, or pressing Delete twice, removes one tile.
- Requires Node 20 or later wherever Node is used (`engines`).
- The dark theme is called Graphite in the docs and demos. `data-theme="dark"`,
  `.dark` and every token name are unchanged.

### Breaking

- OS dark mode is opt-in. With no `data-theme` and no `.dark` class, tiles stay
  light whatever `prefers-color-scheme` says. Set `data-theme="auto"` on
  `<html>` or any ancestor to follow the OS.
- A widget whose `data` was never set (`undefined`) shows a loading skeleton,
  not "No data". Set `data = null` to show the empty state. A view model that
  throws shows the error view instead of the empty state.
- A number below 1e11 in an instant field is read as epoch seconds, not
  milliseconds. Millisecond values from before March 1973 would be misread;
  send an ISO string for those.
- `toNumber` is stricter: `'0x10'`, `'0b1'`, `'Infinity'` and `''` are `NaN`.
  Only decimal and exponent strings parse.
- The grid's edit chrome markup is `.chrome > .handle + .remove + .resize`. A
  host reaching into the shadow root for `.chrome[role=button]` must update.
  Attributes, parts and events are unchanged.
- Hosts that listen for `ts-layout-change` should expect the new reasons
  `'undo'` and `'add'`.
- The playground's old saved layout (`tickslate-playground-layout`) is no
  longer read.

### Internal

- Tests run with `node --test` and need no install. Real-browser tests run
  with `npm run test:browser` in Chromium, WebKit and an iPhone profile,
  including axe checks over every widget and the grid in both themes.
- `npm run release` runs test, build:lib, build:dev, build:umd, pack:lib,
  verify:package and size. `verify:package` checks the manifest, exports,
  version agreement, DOM-free imports and the tarball allowlist. `npm run size`
  enforces gzipped budgets of 9.5 kB for the core and the UMD build and 50 kB
  for `tickslate/elements` with its core, each measured plus 10 %.
- `docs/rfc/0002-integration-and-ux.md` is the approved contract for this
  release, `docs/ACCESSIBILITY.md` the definition of done for every widget, and
  `docs/RELEASING.md` the maintainer's publish steps.
- Tests, docs and demos use made-up figures only.
