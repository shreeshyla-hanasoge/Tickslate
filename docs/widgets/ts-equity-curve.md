# `<ts-equity-curve>`

Cumulative P&L from a daily series, with the running peak and the worst
drawdown. Hand it the daily P&L; it accumulates the series itself.

```js
import 'tickslate/elements'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `Wide` | 2 x 1 | A column with the heading ("Equity · 42 days"), the net figure and "peak ..." beside a thin curve |
| `M` | 2 x 2 | Heading, net figure and "over 42 trading days", the curve filled to zero, a month axis, then Peak, Max drawdown and Fees (or Trades). "net of fees" shows only when `fees` is given |
| `XL` | 4 x 2 | The curve with the peak line and the drawdown shaded, the range buttons, and a rail with Net, Peak, Max drawdown and Trading days |

On a phone `XL` takes 2 x 2 and renders the `M` design, so the range buttons
are not there; set `range` yourself if you need one.

## Data shape

```ts
interface EquityCurveData {
  /** The daily P&L series; the widget accumulates it. */
  days: Array<{ date: Time; pnl: Numeric; trades?: number }>
  /** M, XL: for the whole series, so not shown for a range that cuts it. */
  fees?: Numeric
  /** XL: for the whole series, so not shown for a range that cuts it. Falls back to the sum of days[].trades. */
  trades?: number
  /** Accepted on every widget; this one does not show it. */
  asOf?: Time
  /** Shows the pulsing dot at M. */
  live?: boolean
}
```

`days` is required. A day is read with `toDay` in the widget's time zone, and a
day with no readable date or no finite `pnl` is skipped, counted and reported
once in development. Days may arrive in any order and are sorted by date. Equity
starts at 0; the peak counts that starting 0, so it is never below 0.

Ranges are counted back from the **latest date in the data**, not from today:
`1W` is the seven calendar days ending then, `1M` and `3M` step back whole
months (clamped to the shorter month's last day), `YTD` starts on 1 January of
that year, and `All` is everything. Inside a range, equity restarts from 0 at
the range's first day, so it is the P&L made over the range. `fees` and
`trades` describe your whole series, so a range that cuts it hides them.

## Minimal example

```html
<ts-equity-curve label="Equity" size="M" currency="USD" range="All"
  data='{"fees": 310.4, "days": [
    {"date": "2026-10-01", "pnl": 420.5, "trades": 6},
    {"date": "2026-10-02", "pnl": -180},
    {"date": "2026-10-05", "pnl": 640.25, "trades": 4},
    {"date": "2026-10-06", "pnl": -95.1}]}'></ts-equity-curve>
```

Listening for the range buttons at `XL`:

```js
const curve = document.querySelector('ts-equity-curve')
curve.addEventListener('ts-action', (e) => {
  if (e.detail.action === 'range') console.log('range is now', e.detail.value)
})
```

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The tile's name and heading. Defaults to "Equity curve"; `Wide` shortens that default to "Equity" and adds the day count |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000`. Falls back to the nearest `<ts-grid>`'s `stale-after`; an unreadable value falls back to the default with one development warning |
| `scrub` | attribute and property | `off` turns scrubbing off: no hover or drag read-out and no keyboard slider. `on` turns it on where the nearest `<ts-grid>` says `off`. Falls back to the nearest `<ts-grid>`'s `scrub`, then on |
| `flash` | attribute | `off` stops the brief tint on a headline figure that changed. The nearest `<ts-grid>`'s `flash` applies too |
| `size` | attribute and property | `Wide`, `M` or `XL`; others snap. A grid sets it |
| `range` | attribute and property | `'1W'`, `'1M'`, `'3M'`, `'YTD'` or `'All'`. Matched without regard to case; anything else reads as `'All'`. Reads back normalised |
| `data` | property, or a JSON attribute | `EquityCurveData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered, such as `['retry']` |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting; `time-zone` also decides which day a timestamp belongs to. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The base members are listed in [Your own widget](../guide/your-own-widget.md).

## Scrubbing and the data table

Hover a mouse over the plot, or drag a finger along it, and a rule, a dot and a small label show the point
nearest the pointer: its date, and `Equity` (the running total) and `Day` (that day's own result), both signed. A vertical swipe still scrolls the page; only a horizontal drag
scrubs. The label stays inside the plot at both edges. Scrubbing only changes what the tile shows, so it fires no event.

For the keyboard the plot has one tab stop, a `role="slider"` named "Equity curve, read point by point". Left and
Right move one point earlier or later (time runs left to right in every language, so the arrows never swap), Page Up
and Page Down move ten, Home and End jump to the first and last point, and Escape hides the label and keeps focus.
Focus starts on the newest point. The slider's `aria-valuetext` is the label's text, so a screen reader speaks each
point as the keys move, and nothing in the tile is `aria-live`.

The plot has a visually hidden table of its last 12 drawn points, newest last, with a caption, column headers and
row headers. It is the screen-reader route to the data, and it is not announced. Rows are updated in place, so a
tick adds a row and drops the oldest rather than rebuilding the table.

Every size that draws the curve scrubs and has the table. Where the net figure goes compact ("+₹1.2L") its full value is the `title` of the headline, and the tile's accessible name always has the full figure.

Set `scrub="off"` on a tile, or on the `<ts-grid>`, to turn it off. The table stays. Scrubbing is also off while
the grid is in edit mode.

## Freshness and change flashes

Send `asOf` with `live: true` and the header says how old the data is. While it is fresh the dot pulses and the header reads `just now`, then `2 min. ago` (in the tile's locale). Past `stale-after` the dot turns `--ts-warn` and stops pulsing, the header reads `Stale · 3 min`, and the tile's name ends with `, stale` where it would end with `, live`. With `asOf` and no `live` the data is a snapshot: the dot is hidden, the header reads `synced 11:42` and nothing ages.

A live tile re-renders its age every 15 seconds, on one timer shared by every tile on the page. The timer pauses while the page is hidden and stops when no live tile is connected. An `asOf` ahead of the clock reads as `just now` until the clock passes it, and never as a negative age.

When the net figure changes, it is tinted for 700 ms: `--ts-profit` when it rose and `--ts-loss` when it fell. It never flashes on the first render, on a size change or for an unchanged value, at most once a second, and not under `prefers-reduced-motion` or with `flash="off"`. In forced colours the tint is an outline.

## Actions

| Action | When | `ts-action` detail |
|---|---|---|
| `range` | The user presses a range button at `XL` and the range changes. `range` is already set when it fires | `{ action: 'range', value: '1M' }` where `value` is one of `'1W'`, `'1M'`, `'3M'`, `'YTD'`, `'All'` |
| `retry` | The user presses Retry in the error view (needs `actions = ['retry']`) | `{ action: 'retry' }` |

The range buttons are a display control, so `XL` always shows them; the event
only lets your app know, for instance to save the choice. See
[Events](../reference/events.md).

`open` fires too when the tile is `activatable`. The whole tile is the click target, not only the label, so a click on any part of it fires `open`; only the tile's own buttons and the `actions` slot keep their clicks. Route `open` to a page other than the one the tile is already on.

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the headline sentence |
| `header` | The header row: the live dot, the label and the right-hand text (at `XL`, the range buttons) |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `value` | The net figure, with its ▲ or ▼ |
| `chart` | The box around the curve |
| `scrub` | The overlay over the curve while a point is read (hidden otherwise) |
| `scrub-rule` | The vertical rule at the point |
| `scrub-dot` | The dot on the curve at the point |
| `scrub-readout` | The label with the point's date, its equity and the day's result |
| `empty` | The empty view's container, and the "No trading days in this range" message inside the chart |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton shaped like the size's layout |
| Empty | `data = null` | "No trading days yet", or your `slot="empty"` content |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a throw | The message, and Retry if enabled |
| Content | An object | The tile. A series (or a range) with no usable days keeps the layout and says "No trading days in this range" in the plot |

## Accessibility

- The tile is a `role="group"` named with the result: "Equity, +US$785.65 over 4 trading days",
  or "..., no trading days in this range", with ", live" added while `live` is true.
  Its label is a heading.
- The curve is a `role="img"` svg labelled with its extremes: "Equity: peak
  +US$880.75, lowest +US$240.50, ends at +US$785.65".
- The range buttons sit in a `role="group"` named "Range", each a toggle with
  `aria-pressed`. A hidden expansion makes "1W" read as "1W, 1 week". The pressed one also has an underline, so it is not shown by
  tint alone. On touch screens each is at least 44px.
- The curve has one tab stop, a `role="slider"` with a value text such as
  "Mon 12 Oct: Equity +$785.65 and Day −$120.00", and a visually hidden table of the last 12 days. Nothing is `aria-live`.
- Gains and losses carry a sign, colour and an `aria-hidden` ▲ or ▼; a drawdown is
  shown as a negative amount.
- The loading shimmer and the live pulse stop under `prefers-reduced-motion`.
