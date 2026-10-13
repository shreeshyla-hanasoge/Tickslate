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
| `label` | attribute and property | The region's name and heading. Defaults to "Equity curve"; `Wide` shortens that default to "Equity" and adds the day count |
| `size` | attribute and property | `Wide`, `M` or `XL`; others snap. A grid sets it |
| `range` | attribute and property | `'1W'`, `'1M'`, `'3M'`, `'YTD'` or `'All'`. Matched without regard to case; anything else reads as `'All'`. Reads back normalised |
| `data` | property, or a JSON attribute | `EquityCurveData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered, such as `['retry']` |
| `locale`, `currency`, `time-zone` | attributes | Formatting; `time-zone` also decides which day a timestamp belongs to. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The base members are listed in [Your own widget](../guide/your-own-widget.md).

## Actions

| Action | When | `ts-action` detail |
|---|---|---|
| `range` | The user presses a range button at `XL` and the range changes. `range` is already set when it fires | `{ action: 'range', value: '1M' }` where `value` is one of `'1W'`, `'1M'`, `'3M'`, `'YTD'`, `'All'` |
| `retry` | The user presses Retry in the error view (needs `actions = ['retry']`) | `{ action: 'retry' }` |

The range buttons are a display control, so `XL` always shows them; the event
only lets your app know, for instance to save the choice. See
[Events](../reference/events.md).

## Parts

| Part | Element |
|---|---|
| `tile` | The tile's `<section>` |
| `error` | The error view's container |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton shaped like the size's layout |
| Empty | `data = null` | "No trading days yet", or your `slot="empty"` content |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a throw | The message, and Retry if enabled |
| Content | An object | The tile. A series (or a range) with no usable days keeps the layout and says "No trading days in this range" in the plot |

## Accessibility

- The region is named with the result: "Equity, +US$785.65 over 4 trading days",
  or "..., no trading days in this range".
- The curve is a `role="img"` svg labelled with its extremes: "Equity: peak
  +US$880.75, lowest +US$240.50, ends at +US$785.65".
- The range buttons sit in a `role="group"` named "Range", each a toggle with
  `aria-pressed`. The pressed one also has an underline, so it is not shown by
  tint alone. On touch screens each is at least 44px.
- Gains and losses carry a sign and colour; a drawdown is shown as a negative
  amount. The finance widgets do not yet show a gain or loss arrow.
- The loading shimmer and the live pulse stop under `prefers-reduced-motion`.
