# Changelog

All notable changes to Tickslate are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## Unreleased

- Repository scaffold: build, packaging, test and CI setup, theme tokens, and
  the product brief. No widgets yet.
- Layout engine in the core (RFC 0001 §4): sizes and breakpoints, phone and
  tablet reflow, gap-filling placement that matches CSS `grid-auto-flow:
  dense`, forgiving layout loading (`readLayout`), pure editing operations, and
  `dropIndex` / `sizeForExtent` for live drag and resize in the grid.
- `<ts-grid>` (RFC 0001 §8.4, §8.6): lays out the host's tiles from a layout,
  reflows across 4, 3 and 2 columns, and edits like an iPhone home screen:
  long-press or `editing` to start, drag with live reflow, a resize handle that
  snaps between supported sizes, remove badges, edge auto-scroll, and full
  keyboard support. Fires `ts-layout-change` for the host to save.
- New tokens: `--ts-row-compact`, `--ts-gap-compact`, `--ts-num-weight`,
  `--ts-num-weight-small`, `--ts-shadow-lift`, `--ts-motion`, `--ts-ease`.
- `sizeForExtent` takes optional `columns` and `current`, so resizing on a
  phone or tablet snaps by what the user sees.
- Playground: a demo dashboard to try it, in both themes and both profiles.
- Banner is the always-full-width size: it keeps its own design on phones,
  so the year heat map shows the whole year at every width. Widgets can give
  it more height there with `phoneRows` (RFC amendment B).
- Formatting (RFC 0001 §5): `createFormatter` with signed money and the true
  minus sign, lakh grouping from Intl, compact forms, prices, percents,
  24-hour times, durations and `fit`; `configure` for defaults.
- Session calendars (RFC 0001 §7): `createCalendar` with holidays and special
  sessions, `state`, `nextChange`, `candleClose` and `windows`; presets for NSE
  (equity, and derivatives closing at 15:40 from 3 Aug 2026) and MCX (23:30 or
  23:55 by US daylight saving, plus cotton and agri); `activeProfile` and
  `nextProfileChange`.
- `<ts-grid>` switches between market and closed layouts on a `schedule`, with
  `override()` for the manual switch and a replaceable `clock`.
- Playground: live session status, a pretend clock to try scheduled
  switching, and formatting samples.
- Widget base `TsWidget` (RFC 0001 §8.1): open shadow root, shared themed CSS,
  `data` / `size` / `label` / `clock`, formatting attributes resolved from the
  nearest `<ts-grid>`, one render per microtask, an empty state, and `every()`
  for timers that pause while the page is hidden. Headlines scale with the tile
  so phone sizes fit.
- `<ts-today-pnl>` (S, Wide, M): headline net with realised, unrealised and fees,
  and on M an intraday curve with entry and exit marks on the session window.
- `<ts-equity-curve>` (Wide, M, XL): cumulative P&L with peak and max drawdown,
  `range` of 1W, 1M, 3M, YTD or All, and on XL the shaded drawdown and range
  buttons that fire `ts-action`.
- `<ts-session-clock>` (S, Banner): the exchange's time, open or closed, and the
  time to the close or open; on Banner one lane per session with candle-close ticks.
- `tickslate/elements` exports `TsWidget`, `TsTodayPnl`, `TsEquityCurve` and
  `TsSessionClock`, with typed `data`, and types for the shared base ship as
  `widget.d.ts`. `npm run pack:lib` fails if a shipped declaration imports a
  file that is not in the package.
- Widget gallery (`widgets.html`): every widget at every size, desktop and phone,
  in Paper and Traed Dark, with empty states, a frozen or live clock and a
  loss-day toggle. The playground now uses the real widgets for Today's P&L,
  the session clock and the equity curve.
