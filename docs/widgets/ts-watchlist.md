# `<ts-watchlist>`

The instruments you follow: a symbol, the last price, a signed change and where
the price sits in the day's range. A live update changes the cells that moved
and nothing else, so a reader keeps their focus and their scroll position while
prices tick. It reads any instrument, in any currency, and fetches nothing.

```js
import 'tickslate/elements/watchlist'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `S` | 1 x 1 | The first instrument |
| `Tall` | 1 x 2 | Every instrument, in a list that scrolls |
| `M` | 2 x 2 | The same list, with a sparkline of each instrument's ticks |

The design is the same at every size: a symbol and exchange on the left, the last
price and the change on the right, and the day-range bar under them. `S` shows
the first instrument that can be read and says so in its name ("Markets, 12
instruments, showing the first"). Any other size snaps to the nearest of these.

## Data shape

```ts
interface WatchlistInstrument {
  /** Matched by `id`, so a live update changes cells in place. */
  id: string | number
  /** Shown as given: 'NIFTY 50'. Without one the id is shown. */
  symbol?: string
  exchange?: string
  /** The last price. A price that cannot be read shows as a dash. */
  ltp: Numeric
  /** The change and the change % are worked out from it, unless they are given. */
  prevClose?: Numeric
  change?: Numeric
  /** A fraction: 0.027 is +2.70%. */
  changePct?: Numeric
  /** Both draw the day-range bar; with only one there is no bar. */
  dayLow?: Numeric
  dayHigh?: Numeric
  /** The instrument's tick precision, 0 to 20. Applies to the price, the change and the range. Default 2. */
  decimals?: number
  /** M: the sparkline. Readings need not arrive in order; at least two are needed. */
  ticks?: Array<{ t: Time; price: Numeric }>
}

interface WatchlistData {
  instruments: WatchlistInstrument[]
  /** When the data was taken. Shown as "synced HH:MM". */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}
```

Every instrument needs an `id`, a string or a number, and it must be unique: that
is how a live update finds the row to change. One with none, a repeated one, or
one that is not an object is left out and reported once in development.

**Change.** `change` and `changePct` are worked out from `prevClose` (the last
price less the previous close, and that over the previous close) unless you give
them, and a given one is never recomputed. A `changePct` is a fraction. With no
`prevClose` and nothing given, the change is left blank: nothing is invented, and
a zero previous close has no percentage rather than an infinity. A change that
rounds to nothing at the instrument's `decimals` shows no sign and no arrow.

**Decimals.** `decimals` is the instrument's tick precision and applies to its
price, its change and the ends of its range, so a currency pair can show four
places beside an index that shows two. The default is two. Prices are plain
numbers, grouped by the formatter's locale (`24,350.45`, and `1,23,456.50` in
`en-IN`); there is no currency symbol, since an instrument may not trade in the
page's currency.

**Day range.** The bar is drawn only when both `dayLow` and `dayHigh` are
numbers and the low is not above the high. The dot is the last price. A price
outside the range sits at the bar's end, and the bar's text alternative still
says the real figures. A range with no extent puts the dot in the middle.

**Sparkline.** At `M`, an instrument with at least two readable `ticks` gets a
sparkline, coloured by its own direction (first reading to last). A long series
is thinned to 96 points, keeping the first and the last.

## Minimal example

```html
<ts-watchlist id="markets" label="Markets" size="Tall"></ts-watchlist>
```

```js
const list = document.querySelector('#markets')
list.data = {
  instruments: [
    { id: 'i1', symbol: 'ALPHA 50', exchange: 'NSE', ltp: 24350.45, prevClose: 24300, dayLow: 24210.1, dayHigh: 24420.9 },
    { id: 'i2', symbol: 'BETA BANK', exchange: 'NSE', ltp: 51200, prevClose: 51500, decimals: 0 },
  ],
  live: true,
}
```

To update, set `data` again with the same ids, for example from a socket. The
instruments whose figures did not change are not touched, and a price that moves
writes its own cells and moves the dot on the bar, and nothing more.

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the tile's name. Defaults to "Watchlist" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `size` | attribute and property | `S`, `Tall` or `M`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `WatchlistData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered: `'retry'`, and `'add-instrument'` to show the add button |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The base members every widget has are listed in
[Your own widget](../guide/your-own-widget.md). The static
`TsWatchlist.watchlistModel(data, variant, ctx)` is the pure view model, handy for
tests and server rendering.

## Actions

```ts
// ts-action
{ action: 'retry' }
{ action: 'add-instrument' }   // opt-in
```

- **`add-instrument`** is off until `actions` includes `'add-instrument'`. The
  header then ends in a `+` button named "Add instrument", and pressing it fires
  `add-instrument`. The widget has no form of its own: it asks, and your app
  shows its search or picker and sends the new list in `data`.
- **`retry`** is the error view's button, with `actions = ['retry']`.

Nothing fires while the grid is in edit mode. See [Events](../reference/events.md).

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the label |
| `header` | The header row: the live dot, the label, the synced time and the add button |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `table` | The `<table>` |
| `row` | The body of one instrument: its row and its range bar |
| `cell` | A cell of an instrument's row |
| `bar` | A day-range bar |
| `chart` | A sparkline |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton of instruments |
| Empty | `data = null` | "No instruments yet", or your `slot="empty"` content. `instruments: []` shows the header with the same line under it |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a view model that throws | The message, and Retry if enabled |
| Content | An object | The list. Instruments that cannot be read are left out and counted once in development |

## Accessibility

- A real `<table>`: a header row whose cells are visually hidden but read ("Instrument",
  "Last price and change"), a row header (`<th scope="row">`) for each symbol, and a
  visually hidden caption that says what a sighted reader sees: "Markets, 12
  instruments".
- The day-range bar is `role="img"` with the words "Day range 24,210.10 to 24,420.90,
  now 24,350.45", and each sparkline has "ALPHA 50 trend, from 24,350.45 to 24,118.92".
  The marks inside are not read separately.
- A change carries `+` or the true minus `−` and an `aria-hidden` ▲ or ▼, so a gain
  and a loss never differ by colour alone. A change that rounds to zero has neither.
- The scrolling list is a focusable group named "<label>, instruments", so the keyboard
  can scroll it. Live updates never move focus or the scroll position.
- The add button is a real `<button>` with a name, at least 44px on a touch screen,
  and a focus ring.
- Figures use tabular numbers and keep their sign beside the digits in right-to-left
  pages. The bar always runs from low to high, left to right, in every direction.
- Under forced colours the bar keeps an outline and the dot is drawn in the system's
  highlight colour.
