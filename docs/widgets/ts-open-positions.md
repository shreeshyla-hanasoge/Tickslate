# `<ts-open-positions>`

The positions that are open now: the instrument, its side, the quantity and
entry, the last price and a signed profit or loss, with the mark-to-market
total above them. From `M` up, a bar under each position runs from its stop to
its target, with a tick at the entry and a dot at the last price. A live update
changes the cells that moved and the dot, and nothing else, so a reader keeps
their focus and their scroll position while prices tick.

```js
import 'tickslate/elements/open-positions'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `Wide` | 2 x 1 | The MTM and a one-line row for each position |
| `M` | 2 x 2 | The same, with the range bar under each position |
| `L` | 3 x 2 | Adds the price path since entry and the margin |

`Wide` is one row high, which has no room for a bar under each position, so it
draws none; the figures are the same. On a phone an `L` tile takes the `M` design.
Any other size snaps to the nearest of these.

## Data shape

```ts
interface OpenPosition {
  /** Matched by `id`, so a live update changes cells in place. */
  id: string | number
  /** 'NIFTY 24500 CE'. Without one the id is shown. */
  instrument?: string
  /** Shown in the row's hover text. */
  strategy?: string
  account?: string
  side: 'long' | 'short'
  quantity: Numeric
  /** Shown in the row's hover text. */
  lots?: Numeric
  entryPrice: Numeric
  ltp: Numeric
  /** Shown signed, in the money format. */
  pnl: Numeric
  /** Both a stop and a target draw the range bar, whatever the side; with only one there is no bar. */
  stop?: Numeric
  target?: Numeric
  /** True while an exit for this position is in flight: its button stays, is `aria-disabled` and fires nothing. */
  pending?: boolean
  /** Accepted; not drawn yet. */
  openedAt?: Time
  /** L: the price since entry, as a sparkline. Readings need not arrive in order; at least two are needed. */
  path?: Array<{ t: Time; price: Numeric }>
}

interface OpenPositionsData {
  positions: OpenPosition[]
  /** Defaults to the sum of the positions' `pnl`. */
  mtm?: Numeric
  /** L: shown in the summary line. */
  margin?: Numeric
  /** When the data was taken. Shown as "synced HH:MM". */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}
```

Every position needs an `id`, a string or a number, and it must be unique: that is
how a live update finds the row to change. One with none, a repeated one, or one
that is not an object is left out and reported once in development.

**Money and prices.** `pnl`, `mtm` and `margin` are money in the tile's currency,
so a position's profit in `en-IN` reads `+₹1,24,500.00`. Prices (`entryPrice`,
`ltp`, `stop`, `target`) are plain numbers with two decimals, since a contract
may not trade in the page's currency. A figure that cannot be read shows as a dash.

**MTM.** The total in the summary line is `mtm` when you give one, and otherwise
the sum of the positions' `pnl` that can be read. A given `mtm` is shown as it is,
even if it differs from the sum: it is yours to say. With no figure and no way to
add one up, the line is left out.

**The range bar.** It always runs from the stop on the left to the target on the
right, whatever the side, so the loss side is always left. For a long position the
stop is the lower price; for a short one it is the higher, and the bar runs from
the higher price down to the lower. The loss side is tinted with the loss colour
and the profit side with the profit colour, a tick marks the entry and a dot the
last price. **There is no bar without both a stop and a target**, or when they are
the same price, and nothing is invented in its place. A price beyond the stop or
the target sits at the bar's end, and the bar's text alternative still says the
real figures. Without an `entryPrice` there is no tick, and without an `ltp` no dot.

## Minimal example

```html
<ts-open-positions id="open" label="Open positions" size="M"></ts-open-positions>
```

```js
const open = document.querySelector('#open')
open.currency = 'INR'
open.data = {
  positions: [
    { id: 'p1', instrument: 'ETA 24500 CE', side: 'long', quantity: 50, entryPrice: 128, ltp: 133.4, pnl: 270, stop: 120, target: 140 },
    { id: 'p2', instrument: 'IOTA 24400 PE', side: 'short', quantity: 75, entryPrice: 96.5, ltp: 99, pnl: -187.5, stop: 104, target: 85 },
  ],
  live: true,
}
```

To update, set `data` again with the same ids, for example from a socket. A price
that moves writes the last price, the profit, the bar's words and the one mark
that places the dot, and nothing in the rows around it.

**Freshness.** Send `asOf` with `live: true` and the header says how old the data is: the dot pulses and the header reads `just now`, then `2 min. ago`. Past `stale-after` the dot turns `--ts-warn` and stops pulsing, the header reads `Stale · 3 min`, and the tile's name ends with `, stale` where it would end with `, live`. With `asOf` and no `live` the header reads `synced 11:42`. The MTM, the one headline figure, tints for a moment when the total moves: green up, red down.

**How many.** There is no virtualisation: every position is a row in the table. Building the model for 2,000 positions with 300-point paths takes about 55 ms on a laptop, and a tick that touches a few of them writes only those cells. Past a few hundred positions, page the list.

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the tile's name. Defaults to "Open positions" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `size` | attribute and property | `Wide`, `M` or `L`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `OpenPositionsData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered: `'retry'`, `'exit-position'` and `'exit-all'` |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000`. Falls back to the nearest `<ts-grid>`'s `stale-after` |
| `flash` | attribute | `'off'` stops the brief tint on a headline figure that changed; the grid's `flash` applies too |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The base members every widget has are listed in
[Your own widget](../guide/your-own-widget.md). The static
`TsOpenPositions.positionsModel(data, variant, ctx)` is the pure view model, handy
for tests and server rendering.

## Actions

```ts
// ts-action
{ action: 'retry' }
{ action: 'exit-position', id: string | number }   // opt-in
{ action: 'exit-all' }                             // opt-in
```

- **`exit-position`** is off until `actions` includes `'exit-position'`. Each row
  then gets an "Exit" button, named for its position ("Exit ETA 24500 CE"), and
  pressing it fires `exit-position` with the position's `id` as you gave it.
- **`exit-all`** is off until `actions` includes `'exit-all'`. A button at the end of
  the summary line then fires `exit-all`, and it goes when no position is open.
- **`retry`** is the error view's button, with `actions = ['retry']`.

These are requests. The widget does not close anything, remove a row or ask "are you
sure"; your app confirms, places the order and sends the new `positions`. Nothing
fires while the grid is in edit mode.

**Repeated presses.** The widget does not stop a second press, because it acts on
nothing itself: **your app must dedupe or confirm** an exit. Two things help. The event
is cancelable, so a handler can call `preventDefault()` to say it refused. And a
position with `pending: true` keeps its Exit button but marks it `aria-disabled` and
fires nothing, so set it while the order is in flight and clear it when you send the
result. The buttons are named for what they exit: "Exit ETA 24500 CE, Long 50" (two
positions in one instrument differ by side and quantity) and, for Exit all, "Exit all
3 positions". See [Events](../reference/events.md).

`open` fires too when the tile is `activatable`. The whole tile is the click target, not only the label, so a click on any part of it fires `open`; only the tile's own buttons and the `actions` slot keep their clicks. Route `open` to a page other than the one the tile is already on.

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the label |
| `header` | The header row: the live dot, the label and the synced time |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `table` | The `<table>` |
| `row` | The body of one position: its row and its range bar |
| `cell` | A cell of a position's row |
| `bar` | A range bar |
| `chart` | A price path sparkline |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton of positions |
| Empty | `data = null` | "No open positions", or your `slot="empty"` content. `positions: []` shows the header with the same line under it |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a view model that throws | The message, and Retry if enabled |
| Content | An object | The positions. Ones that cannot be read are left out and counted once in development |

## Accessibility

- A real `<table>`: a header row whose cells are visually hidden but read
  ("Instrument", "Last price", "P&L", and "Actions" while the exit buttons show), a row
  header (`<th scope="row">`) for each instrument, and a visually hidden caption
  that says what a sighted reader sees: "Open positions, 3 positions".
- The side is a word ("Long", "Short"), never only a colour. A profit or loss carries
  `+` or the true minus `−` and an `aria-hidden` ▲ or ▼; one that rounds to zero has
  neither, and the same goes for the MTM.
- The range bar is `role="img"` with the words "Between stop 120.00 and target 140.00,
  entry 128.00, now 133.40", and each price path has "ETA 24500 CE, price since entry,
  from 100.00 to 104.00". The marks inside are not read separately. The entry (a tick)
  and the last price (a dot) differ in shape as well as place.
- The scrolling list is a focusable group named "<label>, positions", so the keyboard
  can scroll it. Live updates never move focus or the scroll position.
- When a position closes while its Exit button has focus, focus moves to the next position's Exit button, then to Exit all, then to the list, never to the page.
- The Exit and Exit all buttons are real `<button>`s with names, at least 44px tall on a
  touch screen, and a focus ring. They exist only when you list them in `actions`.
- Instrument names are bidi-isolated.
- Figures use tabular numbers and keep their sign beside the digits in right-to-left
  pages. The bar always runs from stop to target, left to right, in every direction.
- Under forced colours the bar keeps an outline, the entry tick is drawn in the
  system's text colour and the dot in its highlight colour.
