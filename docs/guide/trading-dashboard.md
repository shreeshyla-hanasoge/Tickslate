# A trading dashboard

This is the walk-through for the developer of a trading app: from `npm install`
to a saved, scheduled dashboard that answers its users' buttons. The page it
follows is [examples/trading.html](../../examples/trading.html): every finance
widget, a metric, a loss-limit gauge and a table of fills on one grid, fed by a
seeded fake feed. Run `npm run dev`, open `/examples/trading.html`, and read the
page beside this guide. All its figures are made up and nothing in it names a
product.

The one rule behind all of it: **Tickslate draws what you give it and tells you
what the user did.** It fetches nothing, places no order and moves no money. Your
app owns the data, the confirmation and the broker call.

Contents: [install](#install-and-tokens) · [payloads](#mapping-broker-payloads-onto-the-widgets) ·
[actions](#the-actions-your-app-must-answer) · [saving layouts](#saving-layouts-on-a-server) ·
[schedule](#schedule-and-the-market-presets) · [translation](#translation-hooks) ·
[testing](#what-to-assert-in-your-own-tests) · [not yet](#not-yet-in-tickslate)

## Install and tokens

```bash
npm install tickslate
```

```js
import 'tickslate/tokens.css'
import 'tickslate/themes/terminal.css' // optional presets: link one after tokens.css
import 'tickslate/elements'            // registers <ts-grid> and every widget
import { configure } from 'tickslate'

configure({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
```

Set the locale, currency and zone once, on the grid or in `configure()`, and
every tile inherits them: lakh grouping (`₹1,24,500.00`), 24-hour times and the
exchange's day boundaries all follow. Amounts are in **major units** (rupees),
never paise.

Theme with `--ts-*` variables only. The default is light (Paper); put
`data-theme="dark"` on `<html>` for Graphite, `data-theme="auto"` to follow the
system, and `data-ts-theme="terminal"` on the grid or the page for the dense
monospaced preset. A brand theme is six variables; see [Theming](../theming.md).

The grid, with the picker and the controls beside it:

```html
<ts-grid id="board" aria-label="Trading dashboard" heading-level="2" stale-after="20s">
  <ts-session-clock item="sessionClock" label="Sessions"></ts-session-clock>
  <ts-today-pnl item="todayPnl" label="Today's P&amp;L" activatable></ts-today-pnl>
  <ts-watchlist item="watchlist" label="Watchlist"></ts-watchlist>
  <ts-open-positions item="openPositions" label="Open positions"></ts-open-positions>
  <!-- ts-pnl-calendar, ts-edge-stats, ts-capital-funding, ts-equity-curve, ts-metric, ts-progress, ts-table -->
</ts-grid>
<ts-widget-picker for="board"></ts-widget-picker>
<ts-grid-controls for="board"></ts-grid-controls>
```

Give every tile a stable `item` (it is the key of a saved layout) and a `label`.
Set `heading-level` to follow your page's own headings: with an `<h1>` above the
grid, `2` keeps the outline in order.

## Mapping broker payloads onto the widgets

Brokers disagree on names, so write one small mapper per payload and keep the
widgets ignorant of your broker. The shapes below are the full ones in each
[widget page](../widgets/); the "Typical broker field" column uses common names
and will not match yours exactly.

| Your data | Widget and key | Typical broker field to Tickslate key | Watch for |
|---|---|---|---|
| Quotes | `<ts-watchlist>` `instruments[]` | `tradingsymbol` to `symbol`, `last_price` to `ltp`, `close` to `prevClose`, `low` and `high` to `dayLow` and `dayHigh`, `exchange` | `id` must be unique and stable. `changePct` is a **fraction** (`0.012`), not the broker's `1.2`: omit it and send `prevClose` and the widget works the change out. Set `decimals` per instrument |
| Positions | `<ts-open-positions>` `positions[]` | `net_quantity` to `side` (its sign) and `quantity` (its size), `average_price` to `entryPrice`, `last_price` to `ltp`, `pnl` to `pnl` | Drop rows whose quantity is 0. A stop and a target come from your own bracket or exit orders: the range bar is drawn only with both. Set `pending: true` while an exit is in flight |
| Orders | `<ts-table>` `rows[]` | `order_id` to `id`, status, quantity, price and time to typed columns | Declare the column `format` (`number`, `money`, `time`, `percent`) so the table sorts and aligns them. Text is shown as given and never as markup |
| Fills (trades) | `<ts-table>` `rows[]`, and `edgeStats()` | `trade_id` to `id`, `fill_timestamp` to a `time` column, realised `pnl` | Send each round trip's `pnl` to `edgeStats(trades)` for the stats and to `histogram()` for the distribution |
| Daily P&L | `<ts-equity-curve>` and `<ts-pnl-calendar>` `days[]` | one row per trading day: `{ date, pnl, trades? }` | The same array feeds both widgets, so they agree. Rows for one date are summed in the calendar. `fees` and `trades` describe the whole series |
| Today | `<ts-today-pnl>` | `net`, `realized`, `unrealized`, `fees`, with `intraday[]` readings at `M` | `net` is shown as given and never recomputed from the parts. Fees read as a deduction whichever way you sign them |
| Balances | `<ts-capital-funding>` `accounts[]` | `available_cash` or net equity to `balance`, your own strategy allocations to `allocations[]` | The broker does not know your strategy allocations: they are yours. Each allocation takes what is left of the balance in array order |
| Loss limit, margin | `<ts-progress>` | `value` and `target` | Use `mode: 'limit'` so the bar warns at `warnAt` (75% by default) and reads "over limit" at 100% |
| A KPI | `<ts-metric>` | `value`, with `previous` or `delta` | `goodWhen: 'down'` for a number where lower is better |

### Numbers and times

Pass whatever the broker sends; the widgets read it with `toNumber` and `toTime`:

- `toNumber` accepts a number, a decimal string (`"12.50"`) and a Decimal.js or
  big.js object. Anything else, including `null`, `"N/A"` and `"Infinity"`, is
  `NaN` and shows as a dash, so a missing figure is never drawn as `0`.
- `toTime` accepts epoch milliseconds, epoch seconds (a number under 1e11), a
  `Date` and ISO 8601. **Send an offset** (`2026-10-26T10:15:00+05:30`): a
  date-time without one is read in the viewer's zone, so two traders would see
  two different times. A bare date (`2026-10-26`) is a calendar day, and for
  daily rows it stays that day in every zone. Free text such as `"26 Oct"` is
  refused, not guessed.

```js
import { toNumber, toTime } from 'tickslate'

const toQuote = (q) => ({
  id: q.instrument_token,
  symbol: q.tradingsymbol,
  exchange: q.exchange,
  ltp: q.last_price,           // a string is fine
  prevClose: q.ohlc.close,
  dayLow: q.ohlc.low,
  dayHigh: q.ohlc.high,
})

const toPosition = (p) => ({
  id: `${p.instrument_token}:${p.product}`,
  instrument: p.tradingsymbol,
  side: toNumber(p.net_quantity) < 0 ? 'short' : 'long',
  quantity: Math.abs(toNumber(p.net_quantity)),
  entryPrice: p.average_price,
  ltp: p.last_price,
  pnl: p.pnl,
  stop: stops.get(p.instrument_token),
  target: targets.get(p.instrument_token),
  pending: exitsInFlight.has(p.instrument_token),
})

positions.data = {
  positions: raw.net.filter((p) => toNumber(p.net_quantity) !== 0).map(toPosition),
  asOf: raw.fetchedAt, // when the broker said so, not when you drew it
  live: true,
}
```

### Rows that cannot be read

A widget never throws on bad data. A row that has no `id`, a repeated `id`, a
date or `pnl` that cannot be read, or is not an object is **left out**; a figure
that cannot be read is a dash. Development builds count what was dropped and warn
once per widget (the `development` export condition loads those builds);
production builds are silent. So the screen can look complete while rows are
missing. Count in your own mapper (`raw.length` against what you sent) and report
that to your logging, not to the user.

### Live data

Set `data` again with the same ids and only the cells that changed are written:
focus and scroll position survive a tick. Send `asOf` with `live: true`. The
header then reads "just now", then "2 min. ago"; once `asOf` is older than
`stale-after` (set on the grid or a tile) the dot turns amber, the header says
"Stale", and the tile's name ends with ", stale". Take `asOf` from the data, not
from the moment you render, or a frozen feed looks fresh. Figures that move
flash briefly in their direction (`flash="off"` stops it, and so does
`prefers-reduced-motion`).

## The actions your app must answer

A button in a tile is a **request**. The tile fires `ts-action` and changes
nothing itself. Your app confirms, sends the order, then sets the tile's `data`.
The events bubble and are composed, so one listener on the grid hears every tile;
`e.target` is the tile and `e.target.getAttribute('item')` is its item.

| `detail` | Tile | Turn on with | What your app does |
|---|---|---|---|
| `{ action: 'exit-position', id }` | open positions | `actions = ['exit-position']` | Confirm, send the exit order, then send `positions` without it |
| `{ action: 'exit-all' }` | open positions | `actions = ['exit-all']` | Confirm with the count and the total, send every exit, then send the new `positions` |
| `{ action: 'add-instrument' }` | watchlist | `actions = ['add-instrument']` | Show your own search, then send `instruments` with the new one |
| `{ action: 'rebalance', id }` | capital funding | `actions = ['rebalance']` | Show your own flow (`id` is the account's), then send the new `accounts` |
| `{ action: 'select', id }` | table | `actions = ['select']` | Open the order or fill |
| `{ action: 'select', value, series, y, index }` | chart | `actions = ['select']` | Show the point's detail |
| `{ action: 'open', id }` | any tile with `activatable` | the `activatable` attribute | Route to the tile's page (`id` is its item). The header and the empty space fire it; a click on a chart, a cell or a list never does. Send it somewhere other than the page the tile is on. Use `href` instead for a plain link |
| `{ action: 'sort', value, dir }` | table | always on | Keep the choice by sending the same `sort` back in `data` |
| `{ action: 'range', value }` | equity curve at `XL` | always on | Save the range if you want it remembered |
| `{ action: 'retry' }` | every tile | `actions = ['retry']` | Fetch again; clear `error` and send `data` |

Nothing fires while the grid is in edit mode.

**The confirm-then-send rule.** Exiting a position is money. So:

1. On `exit-position`, find the position by `id`; if it is already `pending`,
   call `e.preventDefault()` and stop (the event is cancelable, and a refusal is
   worth saying).
2. Ask the user, naming what will happen ("Sell 150 at about 131.22").
3. On yes, set `pending: true` on that position and send `positions` so the
   button is disabled while the order is in flight.
4. When the broker answers, send the new list. On failure, clear `pending` and
   say so, in your own words.

```js
grid.addEventListener('ts-action', async (e) => {
  if (e.detail.action === 'exit-position') {
    const p = store.positions.find((x) => x.id === e.detail.id)
    if (!p || p.pending) return e.preventDefault()
    if (!(await confirmExit(p))) return
    p.pending = true
    publishPositions()
    await broker.exit(p) // your call
    store.positions = store.positions.filter((x) => x !== p)
    publishPositions()
  }
})
```

The example page does this for every row of the table above, with a native
`<dialog>` as its confirm panel. Its activity list at the bottom shows each
answer.

Tiles the user adds from the picker are yours to render too: set
`grid.addTypes = ['metric', 'progress']` (or `'*'`), answer `ts-add-request` with
`preventDefault()` and append a child carrying `item=<id>`, and render the same
children again from a saved layout on load (the grid keeps layout items it has no
child for, and warns in development).

## Saving layouts on a server

`persist="my-key"` on the grid is enough for `localStorage`. For a server, use
`persistLayout` with an adapter: per-device `load`, `save` and `remove`, each of
which may return a promise (see [Saving layouts](saving-layouts.md)).

```js
import { persistLayout } from 'tickslate/elements'

persistLayout(grid, {
  adapter: {
    load: (device) => fetch(`/api/layout/${device}`).then((r) => (r.ok ? r.json() : null)),
    save: (device, layout) => fetch(`/api/layout/${device}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(layout) }),
    remove: (device) => fetch(`/api/layout/${device}`, { method: 'DELETE' }),
  },
  // What a trader sees on the first visit: one arrangement while the market is open, one after the close.
  defaults: {
    desktop: { version: 1, device: 'desktop', profiles: { market: [/* ... */], closed: [/* ... */] } },
    phone: [{ id: 'todayPnl', size: 'Wide' }, { id: 'openPositions', size: 'M' }],
  },
})
```

While `load` is pending the grid shows `defaults`; an answer that arrives after
the user has edited is ignored. A failing request leaves the edit on screen and
warns in development; retries are the adapter's. Keep the layout per user and per
device (desktop and phone are stored apart). A saved layout can name a tile your
app no longer renders, or a size a tile no longer has: the grid repairs it and
fires `ts-layout-issues`.

The example page does not use the `persist` attribute: it calls `persistLayout`
with `defaults` for each device, because a phone should not get the desktop
order squeezed into two columns. Its phone default is a full layout of its own
(both profiles), with the session banner and P&L first so they are on screen
when the page opens. A layout that only names `device: 'desktop'` is reused on a
phone, in the same order.

A tile the user adds from the picker belongs to the profile showing when it was
added (market or closed) and to that device. It is saved there only, so a tile
added during market hours is gone after the close and back at the next open;
say so in your own copy, as the example does. The example's grid also sets
`edit-controls="off"`, because the page has its own Edit layout button.

## Schedule and the market presets

A grid with a `schedule` switches between a `market` and a `closed` arrangement
on its own, and `<ts-grid-controls>` adds the switcher (Auto, Market hours, After
close) so a user can look at the other one.

```js
import { createCalendar, presets } from 'tickslate'

const calendar = createCalendar({
  sessions: [presets.nse(), presets.mcx()],
  holidays: { nse: ['2026-11-10'], mcx: ['2026-12-25'] }, // yours; '*' applies to every session
})
grid.schedule = { calendar, market: { sessions: ['nse'], leadMinutes: 15, lagMinutes: 5 } }
clock.data = { calendar, sessions: ['nse', 'mcx'], timeframes: [5, 15] }
```

- `presets.nse()` is the cash session (id `nse`, 09:15 to 15:30); `{ segment:
  'derivatives' }` gives `nse-fo`. `presets.mcx()` gives the international
  commodities session (id `mcx`, 09:00 to 23:30 or 23:55 by US daylight saving),
  with `cotton` and `agri` segments. The presets were checked against exchange
  circulars on 13 Oct 2026: **verify them against your exchange**.
- **Holidays are yours.** The calendar knows weekdays and hours, not the
  exchange's holiday list, which changes every year. Pass the dates a session
  does not open on, `YYYY-MM-DD`, from your own source.
- The calendar copies its input once, so build a new one (and set `schedule`
  again) when the list changes.
- Test the switch without waiting for 09:00: `grid.clock = () => fakeNow` moves
  the grid's clock, and the clock tile and the widgets have a `clock` property
  too. The example's "Pretend it's" control does this.

## Translation hooks

Every visible and spoken string is a key in one table. Reword or translate with
`configure({ messages })` (every widget), a `messages` property on a grid (every
tile in it) or on one widget. A key you leave out falls back to English.

```js
import { configure, EN } from 'tickslate'

configure({
  locale: 'hi-IN',
  messages: { 'widget.openPositions.label': 'खुले पोज़िशन', 'widget.empty': 'कोई डेटा नहीं' },
})
console.log(Object.keys(EN)) // every key, with its English text
```

Keys with plural forms use `.one` and `.other`, and texts take `{name}`
placeholders. Numbers, dates and times are formatted by the locale, not by the
table. The label you set on a tile (`label="Watchlist"`) is yours and is not
translated for you. The strings in your own page, such as the confirm panel, are
yours as well.

## What to assert in your own tests

The widgets already have their own tests; yours should cover the wiring.

- **Names.** Every tile is a `role="group"` named with its headline, and a live
  tile's name ends with `, live` (or `, stale` once its data is older than
  `stale-after`). Query by role and name, for example
  `getByRole('group', { name: /^Open positions, (live|stale)$/ })`. A tile has
  two groups: the tile itself ("Open positions, live") and, inside it, the
  scroll region that holds its rows, which is a focusable group too so a
  keyboard can scroll it ("Open positions, positions"). A pattern that only
  checks the start of the name matches both and fails Playwright's strict mode,
  so match the whole tile name, or take `.first()`, which is the tile. Some
  tiles put their headline result in the name (`Funding, 2 accounts, live`,
  `Equity, +₹25,760.08 over 71 trading days, live`), so for those match the start
  and take `.first()`: `getByRole('group', { name: /^Funding, / }).first()`. Playwright
  and Testing Library both see through open shadow roots.
- **Heading level.** Each tile's label is a heading: `getByRole('heading', { level: 2, name: 'Watchlist' })`
  when the grid has `heading-level="2"`.
- **The landmark.** The grid is one region named by your `aria-label`.
- **Staleness.** Stop sending data (or send an old `asOf`) and expect `, stale`
  in the name. Tiles check their age on a shared 15 second tick, so allow up to
  15 seconds plus `stale-after` (35 seconds for `stale-after="20s"`), or use fake
  timers.
- **Actions.** Press the button (`getByRole('button', { name: 'Exit ALPHA 24500 CE, Long 150' })`),
  assert your confirm panel, confirm, and assert both the order your fake broker
  received and the row leaving the tile.
- **Repeats.** Press Exit twice; assert one order.
- **Layout.** Resize a tile from the keyboard (focus its handle, press `+`),
  reload, and assert it kept its size.
- **Figures.** Assert signed text with a true minus (`−₹1,215.50`, U+2212), not a
  hyphen.

Add an accessibility scan (axe) over the page; the example passes it in the three
themes.

## Not yet in Tickslate

These are real gaps for a trading app. They are on the roadmap, not in the
library; plan around them.

- **Compact density.** Rows and tiles have one height (`--ts-row`). A denser
  grid for a trading desk's small print is not there yet; the terminal preset
  tightens padding and type, not row height.
- **More market presets and lunch breaks.** Only NSE and MCX ship, as single
  continuous sessions. Other exchanges are `SessionSpec` objects you write (see
  [`createCalendar`](../reference/core.md#session-calendars)), and a session
  with a midday break is two sessions today.
- **The phone top strip.** Pinning up to three tiles above the grid on a phone
  is specified ([RFC 0003 §19](../rfc/0003-p1-surfaces.md)) and not shipped.
- **The layout list editor.** A list-based way to reorder and size tiles without
  dragging ([RFC 0003 §20](../rfc/0003-p1-surfaces.md)) is the same.
- **Right-to-left and a strict content security policy.** Both are in review
  ([§9](../rfc/0003-p1-surfaces.md) and [§14](../rfc/0003-p1-surfaces.md)).
  Until they land, test an `rtl` or CSP-locked page yourself before relying on it.
- **Weekend trading.** The P&L calendar draws the days of the locale's working
  week (with `en-IN` that is Monday to Saturday, and Sunday is the weekend), so
  an entry on a weekend day is counted in a note, not drawn.
- **Column widths and short labels on a phone.** A table gives its spare width to
  the first column and leaves the others narrow, so put the text column (the
  instrument) first, as the fills table does. A half-width phone tile gives its
  heading very little room, so keep labels short (`Funding`, `Win rate`,
  `Loss limit`) until the trading-polish story lands per-column widths and a
  fuller phone design.

The maintainer's board tracks all of these.
