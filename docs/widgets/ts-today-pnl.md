# `<ts-today-pnl>`

Today's profit and loss: the net figure, its realized, unrealized and fee
parts, and at `M` the intraday curve with entry and exit marks.

```js
import 'tickslate/elements'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `S` | 1 x 1 | The heading "Today", the net figure, a footer of "3 closed · 1 open · fees 42.00", and the time when `asOf` is given |
| `Wide` | 2 x 1 | The heading, the net figure, "net of fees" and the time, and Realised, Unrealised and Fees on the right. Under 420px wide the three stack label over value |
| `M` | 2 x 2 | Heading, closed and open counts, the net figure with the day's low and high, the intraday curve with marks and a time axis, then Realised, Unrealised and Fees |

Any other size snaps to the nearest of these.

## Data shape

```ts
interface TodayPnlData {
  /** Shown exactly as given; the widget never recomputes it from the parts. */
  net: Numeric
  realized: Numeric
  unrealized: Numeric
  /** Shown as a deduction whichever way it is signed. */
  fees: Numeric
  closedCount?: number
  openCount?: number
  /** M: the curve. Readings need not arrive in order. */
  intraday?: Array<{ t: Time; v: Numeric }>
  /** M: dots on the curve; ones outside the readings are left out. */
  marks?: Array<{ t: Time; kind: 'entry' | 'exit'; label?: string }>
  /** M: the x-axis span, e.g. today's session from calendar.hours(). Defaults to the readings' span. */
  window?: { from: Time; to: Time }
  /** When the data was taken. Shown as the time. */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}
```

`net`, `realized`, `unrealized` and `fees` are required. `net` is never
recomputed from the parts, so the tile cannot disagree with your books. Amounts
are in major units (rupees, dollars), not minor.

The headline goes compact ("1.2M") when it would not fit its size (10
characters at `S`, 11 at `Wide`, 14 at `M`) so the tile never resizes.

At `M` the curve is drawn above its zero line in `--ts-profit` and below it in
`--ts-loss`. A mark's `kind` other than `'exit'` reads as an entry. With fewer
than two readings the chart says "No intraday data yet" instead of drawing a
line.

## Minimal example

```html
<ts-today-pnl label="Today's P&L" size="S" currency="INR" locale="en-IN"
  data='{"net": 2185.65, "realized": 1450.25, "unrealized": 777.4, "fees": 42,
         "closedCount": 6, "openCount": 2}'></ts-today-pnl>
```

At `M`, with a curve:

```js
const tile = document.querySelector('#pnl')
tile.data = {
  net: 2185.65, realized: 1450.25, unrealized: 777.4, fees: 42,
  closedCount: 6, openCount: 2,
  intraday: [
    { t: '2026-10-13T09:30:00+05:30', v: 0 },
    { t: '2026-10-13T10:15:00+05:30', v: -640 },
    { t: '2026-10-13T12:00:00+05:30', v: 900 },
    { t: '2026-10-13T13:45:00+05:30', v: 2185.65 },
  ],
  marks: [
    { t: '2026-10-13T10:15:00+05:30', kind: 'entry', label: 'Long breakout' },
    { t: '2026-10-13T13:45:00+05:30', kind: 'exit' },
  ],
  window: { from: '2026-10-13T09:15:00+05:30', to: '2026-10-13T15:30:00+05:30' },
}
```

```html
<ts-today-pnl id="pnl" label="Today's P&L" size="M" currency="INR" locale="en-IN" time-zone="Asia/Kolkata"></ts-today-pnl>
```

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The tile's name and the heading at `Wide` and `M`. `S` always says "Today". Defaults to "Today's P&L" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000`. Falls back to the nearest `<ts-grid>`'s `stale-after`; an unreadable value falls back to the default with one development warning |
| `flash` | attribute | `off` stops the brief tint on a headline figure that changed. The nearest `<ts-grid>`'s `flash` applies too |
| `size` | attribute and property | `S`, `Wide` or `M`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `TodayPnlData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered, such as `['retry']` |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()`. Without a currency, money is a plain signed number |
| `item` | attribute | The id a grid matches this child by |

The base members are listed in [Your own widget](../guide/your-own-widget.md).

## Freshness and change flashes

Send `asOf` with `live: true` and the header says how old the data is. While it is fresh the dot pulses and the header reads `just now`, then `2 min. ago` (in the tile's locale). Past `stale-after` the dot turns `--ts-warn` and stops pulsing, the header reads `Stale · 3 min`, and the tile's name ends with `, stale` where it would end with `, live`. With `asOf` and no `live` the data is a snapshot: the dot is hidden, the header reads `synced 11:42` and nothing ages.

A live tile re-renders its age every 15 seconds, on one timer shared by every tile on the page. The timer pauses while the page is hidden and stops when no live tile is connected. An `asOf` ahead of the clock reads as `just now` until the clock passes it, and never as a negative age.

When the net figure changes, it is tinted for 700 ms: `--ts-profit` when it rose and `--ts-loss` when it fell. It never flashes on the first render, on a size change or for an unchanged value, at most once a second, and not under `prefers-reduced-motion` or with `flash="off"`. In forced colours the tint is an outline.

## Actions

`retry` only. With `actions = ['retry']` the error view's button fires
`ts-action` with `{ action: 'retry' }`. See [Events](../reference/events.md).

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the headline sentence |
| `header` | The header row: the live dot, the label and the right-hand text |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `value` | The headline figure, with its ▲ or ▼ |
| `chart` | At `M`, the box around the intraday curve and its marks |
| `empty` | The empty view's container, and the "No intraday data yet" message inside the `M` chart |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton shaped like the size's layout (`S` says "Today" already) |
| Empty | `data = null` | "No trades today", or your `slot="empty"` content |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a throw | The message, and Retry if enabled |
| Content | An object | The tile. A figure that cannot be read shows a dash; unreadable intraday readings and marks are counted and reported once in development |

## Accessibility

- The tile is a `role="group"` named with the headline: "Today's P&L, +₹2,185.65"
  (the label you set, then the net figure with its sign), and ", live" is added
  while `live` is true. Its label is a heading that always says the plain label, even
  where the small tile shows "Today".
- Gains and losses carry a sign, a colour and an `aria-hidden` ▲ or ▼; fees always
  read as a deduction.
- The `M` curve is a `role="img"` svg labelled with the result, for example
  "Intraday P&L: low −₹640, now +₹2,185.65". Each mark is a labelled image with its
  name and time, an entry a circle and an exit a diamond, and the day's low and high are written beside the headline.
- Figures use tabular numbers and clip rather than run into their neighbour.
- The live pulse and the loading shimmer stop under `prefers-reduced-motion`.
