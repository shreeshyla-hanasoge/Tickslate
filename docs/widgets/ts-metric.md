# `<ts-metric>`

A KPI tile: one headline figure, its change since a previous value, a
sparkline and a progress bar toward a target. It is not finance-specific.

```js
import 'tickslate/elements'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `S` | 1 x 1 | Label, headline, change. If the headline is longer than 10 characters it goes compact ("1.2M") while the tile keeps its size |
| `Wide` | 2 x 1 | Label, headline and change on the left, sparkline on the right |
| `M` | 2 x 2 | Label, headline and change, sparkline, target bar and caption |

Any other size snaps to the nearest of these. On a phone a Wide or M tile keeps
its design; the figures scale down with the tile.

## Data shape

```ts
interface MetricData {
  /** The headline. A number, a decimal string, or a Decimal.js / big.js object. */
  value: Numeric
  /** Default 'number'. 'percent' takes a fraction (0.12 is 12%); 'duration' takes milliseconds. */
  format?: 'number' | 'money' | 'percent' | 'duration'
  decimals?: number
  /** Formatted with fmt.unit: '182 ms', '3 seats'. */
  unit?: string
  /** '1.2M' at every size. Without it, S still goes compact when the figure is too long. */
  compact?: boolean
  /** With format 'percent': value, previous, delta and target are 0 to 100. */
  percentPoints?: boolean
  previous?: Numeric
  /** The absolute change; wins over `previous`. */
  delta?: Numeric
  /** The change as a fraction (0.12 is 12%); always a fraction, whatever percentPoints says. */
  deltaPct?: Numeric
  /** Shown after the delta, e.g. 'vs last week'. */
  compareLabel?: string
  /** Which way is good, for the delta's colour. Default 'up'. */
  goodWhen?: 'up' | 'down' | 'neither'
  /** Wide and M: the sparkline. Plain numbers are spaced evenly. */
  series?: Array<{ t: Time; v: Numeric }> | Numeric[]
  /** M: the bar's goal; no bar when 0 or less. */
  target?: Numeric
  /** M: one line under the bar. */
  caption?: string
  /** When the data was taken. Shown as "synced HH:MM". */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}
```

`value` is the only required key. In development, data that does not match this
shape warns once, naming the path. Production never checks.

How the change is chosen: `deltaPct` if given; else a percentage worked out from
`delta` (or `value - previous`) over `previous`; else the absolute change. One
change is shown, so the tile never says "+130 (+12%)" at one size and "+12%" at
another. A change that rounds to nothing shows no sign and no arrow.

## Minimal example

```html
<ts-metric label="Signups" size="S"
  data='{"value": 1204, "previous": 1075, "compareLabel": "vs last week"}'></ts-metric>
```

With a trend and a target, set from script:

```js
const tile = document.querySelector('#revenue')
tile.data = {
  value: 48200,
  format: 'money',
  previous: 43900,
  compareLabel: 'vs last month',
  series: [41000, 42500, 41800, 44900, 46100, 48200],
  target: 60000,
  caption: 'Q4 goal',
  asOf: '2026-10-13T14:05:00Z',
}
```

```html
<ts-metric id="revenue" label="Revenue" size="M" currency="USD"></ts-metric>
```

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the tile's name. Defaults to "Metric" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000`. Falls back to the nearest `<ts-grid>`'s `stale-after`; an unreadable value falls back to the default with one development warning |
| `flash` | attribute | `off` stops the brief tint on a headline figure that changed. The nearest `<ts-grid>`'s `flash` applies too |
| `size` | attribute and property | `S`, `Wide` or `M`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `MetricData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered, such as `['retry']` |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()`. Without a currency, `format: 'money'` shows a plain signed number |
| `item` | attribute | The id a grid matches this child by |

The base members every widget has (`variant`, `clock`, `formatter`, `every()`
and so on) are listed in [Your own widget](../guide/your-own-widget.md). The
static `TsMetric.metricModel(data, variant, ctx)` is the pure view model, handy
for tests and server rendering.

## Freshness and change flashes

Send `asOf` with `live: true` and the header says how old the data is. While it is fresh the dot pulses and the header reads `just now`, then `2 min. ago` (in the tile's locale). Past `stale-after` the dot turns `--ts-warn` and stops pulsing, the header reads `Stale · 3 min`, and the tile's name ends with `, stale` where it would end with `, live`. With `asOf` and no `live` the data is a snapshot: the dot is hidden, the header reads `synced 11:42` and nothing ages.

A live tile re-renders its age every 15 seconds, on one timer shared by every tile on the page. The timer pauses while the page is hidden and stops when no live tile is connected. An `asOf` ahead of the clock reads as `just now` until the clock passes it, and never as a negative age.

When the headline value (the number, not its text) changes, it is tinted for 700 ms: `--ts-profit` when it rose and `--ts-loss` when it fell (swapped by `goodWhen: 'down'` in the data, `--ts-accent` for `'neither'` where the widget reads it). It never flashes on the first render, on a size change or for an unchanged value, at most once a second, and not under `prefers-reduced-motion` or with `flash="off"`. In forced colours the tint is an outline.

## Actions

`retry` is the only action. With `actions = ['retry']`, the error view's Retry
button fires:

```ts
// ts-action
{ action: 'retry' }
```

See [Events](../reference/events.md).

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the headline sentence |
| `header` | The header row: the live dot, the label and the right-hand text |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `value` | The headline figure |
| `chart` | At `Wide` and `M`, the box around the sparkline |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton shaped like the size's layout, so figures land where the blocks were |
| Empty | `data = null` | "No data yet", or your `slot="empty"` content |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a view model that throws | A warning icon and the message (default "Couldn't display this data"), and Retry if enabled. A throw is logged once with a link to this page |
| Content | An object | The tile. Fields that cannot be read show as a dash or are left out, and a count of unreadable sparkline entries is reported once in development |

## Accessibility

- A `role="group"` named with the headline and the change:
  "Signups, 1,204, up 12% vs last week" (and ", live" while `live` is true). Its
  label is a heading.
- The change always carries a sign and an arrow (the arrow is `aria-hidden`; the
  accessible name says "up" or "down"), so colour is never the only signal. Tone
  follows `goodWhen`: up is green by default, `goodWhen: 'down'` flips it, and
  `'neither'` leaves it muted.
- The sparkline is a `role="img"` svg labelled "Revenue trend, from US$41,000.00
  to US$48,200.00". Its fill is a tint of the line.
- Figures use tabular numbers, keep their sign beside the digits in
  right-to-left pages, and clip rather than run into their neighbour.
- On a tile under 200px the "synced" prefix is dropped so the label keeps room.
- The live pulse and the loading shimmer stop under `prefers-reduced-motion`.
