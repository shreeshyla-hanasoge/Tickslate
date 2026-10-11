# Tickslate — product brief

Handover brief for the session that builds Tickslate. Written 12 Oct 2026,
from a design session that started as a redesign of Traed's dashboard.

## Where this came from

The maintainer runs Traed, an algo-trading app (Vue 3, Laravel, Tailwind). Its
dashboard was one long scrolling page. A design session replaced it with a
widget grid, then decided to build the widgets as an open-source library
instead of inside Traed. Traed will install Tickslate, the same way it uses
Emberwick for its backtest chart.

Reference material (designs, not code):

- **Design canvas:** https://claude.ai/artifact/AuLTryP9S4AhWfzdUNcrbh
  - *Final layouts*: desktop and phone, market hours and after close, light and dark.
  - *Widget designs*: all 25 widgets at every size, with a style switch (Paper and Traed Dark are the chosen ones).
  - *Widget library*: the catalogue, the grid and reflow rules, and phone editing.
- **Traed build spec:** https://claude.ai/artifact/4BEEAfW8xaDbLCYdbZMM8C.
  It was written for building inside Traed, but its tokens, grid rules,
  layout JSON and widget table carry over to the library.

The designs use the maintainer's real figures in places and a made-up 11:42
session elsewhere. Don't copy numbers into code or tests as if they were facts.

## Decisions already made

| Decision | Detail |
|---|---|
| Standalone library | Its own repo and npm name (`tickslate`), separate from Emberwick |
| Widget grid | Fixed sizes on a 4-column grid; widgets fill gaps automatically |
| Light theme | Paper: warm off-white surfaces, ink text, serif numbers |
| Dark theme | Tailwind gray-900/800/700 with emerald, rose, amber and indigo 400, which is Traed's existing dark mode |
| Type | Geist for text and Newsreader for numbers in both themes, both overridable |
| Two layouts | Market hours and after close, switched by the session clock, with manual override |
| Phone | 2 columns, a pinned top strip, and a list for editing instead of dragging tiles |

## Architecture

| Layer | Entry | Contents |
|---|---|---|
| Core | `tickslate` (`src/core/`) | Layout engine, formatting, session calendars. Pure functions, no DOM side effects, zero dependencies. |
| Elements | `tickslate/elements` (`src/elements/`) | Custom elements: the grid and the widgets. Registers on import. |
| Tokens | `tickslate/tokens.css` (`src/themes/`) | The `--ts-*` CSS variables for both themes. Already written. |

Emberwick is an optional peer dependency, used only by the mini-chart widget.

### Data contract

Widgets render what the host gives them. The host sets a `data` property (or
calls an update method; the RFC decides) whenever its numbers change. Widgets
never fetch, poll or hold credentials. Updates must not change a widget's size
or move the grid; numbers change in place.

### Formatting

Use `Intl.NumberFormat`. Locale and currency are configured once by the host
(Traed: `en-IN`, `INR`, with lakh grouping). Money always shows its sign
(`+₹1,523.85`, `−₹141.00`, using the true minus sign U+2212). Compact forms
(`+₹1.8k`) are for tight sizes only.

## Grid and sizes

| Size | Columns × rows |
|---|---|
| S | 1 × 1 |
| Wide | 2 × 1 |
| Tall | 1 × 2 |
| M | 2 × 2 |
| L | 3 × 2 |
| Banner | 4 × 1 |
| XL | 4 × 2 |

| Width | Columns | Rule |
|---|---|---|
| ≥ 1200px | 4 | As designed |
| 700–1199px | 3 | Width becomes min(width, 3) |
| < 700px | 2 | S stays half width; everything else is full width; L, XL and Banner use their M size |

Rows are 150px (`--ts-row`); the gap is 16px (`--ts-gap`), 10px on phones.

Rules:

- Resizing snaps between the sizes a widget supports, never to free pixels.
- Widgets move up and left into empty space. Removing one closes its gap; a
  new widget goes in the first spot it fits. CSS `grid-auto-flow: dense`
  gives this, but the core should also compute placement as a pure function
  so it can be tested and used by non-CSS hosts.
- Nothing scrolls inside a widget except feeds and lists. If content doesn't
  fit a size, that size shows less.

## Layout model

```json
{
  "version": 1,
  "device": "desktop",
  "profiles": {
    "market": [
      { "id": "todayPnl", "size": "Wide" },
      { "id": "sessionClock", "size": "S" }
    ],
    "closed": []
  },
  "topStrip": ["todayPnl", "sessionClock"]
}
```

Array order is placement order. The core validates and migrates this JSON. The
host stores it (Traed: per user, per device type, on its server). Profile
names are open-ended; `market` and `closed` are built-in names the session
calendar can switch between.

## Exchange sessions (v1)

- NSE equity and F&O: 09:15–15:30 IST, Monday to Friday, except exchange holidays.
- MCX commodities: from 09:00 IST, closing at 23:30 or 23:55 IST depending on the commodity and the season.

Verify both against current exchange circulars before coding; don't trust
these lines. Holidays need a data source the host supplies, so the calendar
takes a holiday list as input. The candle-close countdown already exists in
Emberwick 0.14; reuse the idea, not the code.

## v1 scope

The grid plus nine widgets, each at the sizes listed:

1. Today's P&L — S, Wide, M
2. Equity curve — Wide, M, XL
3. Daily P&L calendar — Tall, M, Banner
4. Edge stats (win rate, profit factor, average win/loss, expectancy) — S, Wide, M
5. Capital funding (balance vs allocations per account, shortfalls hatched) — S, Tall, L
6. Open positions (LTP, P&L, a stop-to-target range bar) — Wide, M, L
7. Watchlist — S, Tall, M
8. Session clock — S, Banner
9. Mini chart (Emberwick, optional) — M, L, XL

Later releases (the rest of the 25 in the canvas catalogue): account balance,
drawdown, fee drag, margin in use, daily loss limit, live strategies table,
strategy spotlight, armed and next candle, orders and fills feed, paper
trading, leaderboard, market calendar, account health, backtests, strategy
inventory, trading journal.

## First tasks, in order

1. **API RFC** at `docs/rfc/0001-api.md`: core functions and their
   signatures, element tag names, the data shape for each v1 widget, how
   themes and locale are configured, and how a host saves and loads layouts.
   Stop for the maintainer's approval.
2. **Layout engine** in the core, with tests: size table, breakpoint clamping,
   gap-filling placement, layout JSON validation.
3. **Formatting and session calendar**, with tests.
4. **The grid element and the first three widgets** (Today's P&L, Equity
   curve, Session clock), shown in the playground at every size in both
   themes.
5. **Size budget and package check**, modelled on Emberwick's scripts.
6. **The remaining v1 widgets**, README usage docs, then 0.1.0 release prep
   (the maintainer publishes).

## Open questions

1. **Tag prefix** for custom elements: `ts-`, `tick-` or `tickslate-`?
2. **Fonts:** document a Google Fonts link for hosts, or bundle nothing and
   only declare the font stacks? (Bundling font files is not planned.)
3. **Framework wrappers:** are custom elements enough for Vue and React at
   v1? Vue needs `compilerOptions.isCustomElement` for the tag prefix.
4. **Layout editing UI:** ship an editor (drag, resize, add sheet) in the
   library, or a headless API that hosts build their own editor on?
5. **Small serif numbers in dark mode** may look thin below 14px. Use weight
   600 in dark, or a monospace face for small figures?
6. **Shortfall pattern:** CSS stripes mixed from `--ts-loss` (as designed), or
   an SVG pattern?

## Out of scope

Broker integrations, data fetching, authentication, server-side storage, and
any change to Traed or Emberwick.
