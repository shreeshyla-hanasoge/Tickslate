# `<ts-edge-stats>`

How a strategy's trades have paid: win rate, profit factor, average win and loss,
and expectancy. Hand it the figures from `edgeStats(trades)`, or your own. It
reads any trades, in any currency, and fetches nothing.

```js
import 'tickslate/elements/edge-stats'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `S` | 1 x 1 | One stat, chosen with the `stat` attribute, and the trade count |
| `Wide` | 2 x 1 | Four stats: win rate, profit factor, average win and loss, expectancy |
| `M` | 2 x 2 | The same four, and a histogram of the results from `distribution` |

On a narrow tile (a phone's two-column grid) the four stats sit two by two; on a
roomy one they share a row. Any other size snaps to the nearest of these.

## Data shape

```ts
interface EdgeStatsData {
  /** What edgeStats(trades) returns, or your own figures. */
  stats: EdgeStats
  /** Shown after the trade count: '60 trades · Last 30 days'. */
  scope?: string
  /** M: the histogram. A bucket with sign -1 is drawn hatched, on the loss side. */
  distribution?: Array<{ label: string; count: number; sign: 1 | -1 }>
  /** When the data was taken. Shown as "synced HH:MM". */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}

interface EdgeStats {
  trades: number
  wins: number
  losses: number
  winRate: number | null        // 0..1
  profitFactor: number | null   // Infinity with no losses
  avgWin: number | null
  avgLoss: number | null        // negative
  expectancy: number | null     // per trade
  avgHoldMs?: number | null
}
```

A figure that is `null` or missing shows as `—` and is read as "not available". A
profit factor of `Infinity` (all wins) shows as `∞`, which is read as "no losses".
**Keep `Infinity` if you send the stats through JSON:** `JSON.stringify` turns it
into `null`, and a `null`, or the string `"Infinity"`, reads as `—`, "not available".
A win rate that is not exactly 0 or 1 never shows as `0%` or `100%`: it shows
one decimal (`99.9%`, `0.1%`). Money is formatted with the
tile's `currency` and `locale`, so with `en-IN` an amount in the lakhs is grouped
`1,24,500.00`; a long one drops to its compact form on a narrow tile.

`distribution` is the host's to build. `histogram(values, edges)` counts the
buckets for you: half-open `[from, to)`, with the last one closed so the largest
edge is counted. Give each bucket a label and a sign.

## Minimal example

```html
<ts-edge-stats id="edge" label="Edge, last 30 days" size="Wide"></ts-edge-stats>
```

```js
import { edgeStats, histogram } from 'tickslate'

const trades = [{ pnl: 420 }, { pnl: -180 }, { pnl: 95.5 }, { pnl: -60 }]
const edge = document.querySelector('#edge')
edge.data = {
  stats: edgeStats(trades),
  scope: 'Last 30 days',
}
```

For S, name the stat:

```html
<ts-edge-stats size="S" stat="expectancy"></ts-edge-stats>
```

To update, set `data` again. Only the figures that changed are written.

**Freshness.** Send `asOf` with `live: true` and the header says how old the data is, as every widget's does; past `stale-after` it reads stale. With `asOf` and no `live` the header reads `synced 11:42`. A stat that moves flashes briefly in the colour of its direction, unless `flash="off"`.

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `stat` | attribute and property | The stat S shows: `win-rate` (the default), `profit-factor`, `avg-win-loss` or `expectancy`. An unknown value reads as `win-rate` |
| `label` | attribute and property | The heading and the tile's name. Defaults to "Edge stats" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `size` | attribute and property | `S`, `Wide` or `M`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `EdgeStatsData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered: `'retry'` |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000`. Falls back to the nearest `<ts-grid>`'s `stale-after` |
| `flash` | attribute | `'off'` stops the brief tint on a figure that changed; the grid's `flash` applies too |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The base members every widget has are listed in
[Your own widget](../guide/your-own-widget.md). The static
`TsEdgeStats.edgeStatsModel(data, variant, ctx)` is the pure view model; pass the
stat as `ctx.stat`.

## Actions

```ts
// ts-action
{ action: 'retry' }
```

- **`retry`** is the error view's button, with `actions = ['retry']`. Edge stats offers nothing else, and a tile fires `open` only when `activatable`.

See [Events](../reference/events.md).

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the label |
| `header` | The header row: the live dot, the label and the synced time |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `value` | The figure S shows |
| `chart` | The histogram's box (M) |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton of the cells |
| Empty | `data = null`, or `stats.trades` of 0 | "No trades yet", or your `slot="empty"` content (a count of 0 shows the words in the tile, with its header) |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a view model that throws | The message, and Retry if enabled |
| Content | An object | The stats. A figure the data lacks is a dash |

## Accessibility

- The tile is named with its figures: "Edge stats, Win rate 62.5%, Profit factor 1.84, Avg win / loss +₹2,450.00 / −₹1,320.00, Expectancy +₹412.50 per trade, 60 trades · Last 30 days". A figure that is missing reads "not available", and `∞` reads "no losses" (it is an image with that text).
- Money carries `+` or the true minus `−` and an `aria-hidden` ▲ or ▼, so a gain and a loss never differ by colour alone. A figure that rounds to zero has neither.
- The histogram is `role="img"` with its own name ("Result distribution: 28 trades above zero, 14 trades below zero, most in 0 to 500"), and each bar has a title. A loss bucket is hatched as well as red, so the two sides differ without colour.
- Figures use tabular numbers and keep their sign beside the digits in right-to-left pages. The histogram always runs left to right, from the worst result to the best.
- Under forced colours the bars use the system's colours, and a loss bar is dashed.
