# `<ts-breakdown>`

Parts of a whole: a share bar, a stacked bar or a donut, with a legend that says
each part's label and percentage in words. It is not finance-specific: an
allocation, traffic by source and time by task are the same widget.

```js
import 'tickslate/elements/breakdown'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `S` | 1 x 1 | A share bar filled to the largest part, with that part's label and percentage beside it |
| `Wide` | 2 x 1 | A stacked bar of every part in one row, with the legend wrapped under it |
| `Tall` | 1 x 2 | The stacked bar, with the legend as a list: label, value, percentage and note |
| `M` | 2 x 2 | A donut with the legend beside it and the total in its middle |

Any other size snaps to the nearest of these.

## Data shape

```ts
interface BreakdownSlice {
  /** A stable key for the legend row. Default: the label. */
  id?: string | number
  label: string
  /** A non-negative amount. A numeric string or a Decimal.js / big.js object is read too. */
  value: Numeric
  /** Tall and M: a short second line. */
  note?: string
}

interface BreakdownData {
  slices: BreakdownSlice[]
  /** How a part's value is shown. Default 'number'. 'percent' takes fractions; 'duration' takes milliseconds. */
  format?: 'number' | 'money' | 'percent' | 'duration'
  decimals?: number
  /** Formatted with fmt.unit: '182 ms'. */
  unit?: string
  /** When the data was taken. Shown as "synced HH:MM". */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}
```

`slices` is the key a breakdown needs. In development, data that does not match
this shape warns once, naming the path.

How the parts are read:

- **Largest first.** Parts are sorted by value, and equal values keep the order they came in.
- **At most six.** With more than six parts, the largest five are shown and the rest are
  summed into one part called "Other", drawn in `--ts-axis`. The others take
  `--ts-series-1` onward.
- **Near-ties hold still.** A part already shown stays shown until a newcomer beats it by at least one
  percentage point, so two parts trading places by a hair on every tick do not swap in and out of "Other".
  Colours follow the part's `id`, not its rank, so a swap never recolours the parts that stay.
- **Large numbers are safe.** Values near the largest double are scaled before they are summed, so they still
  read as shares.
- **Percentages sum to 100.0%.** They are rounded by the largest-remainder method
  at one decimal, so the legend never reads 99.9% or 100.1%. With a total of 0 every part reads `0.0%`
  and nothing is drawn.
- **Negative values are left out and said so.** The tile reads "1 negative value left out", above the legend where it cannot scroll out of view. A part
  whose value is not a number is dropped, and development warns with the count. A part of 0 stays in
  the legend at `0.0%` and draws nothing.

## Minimal example

```html
<ts-breakdown label="Allocation" size="M"
  data='{"slices": [{"label": "Equities", "value": 41200}, {"label": "Bonds", "value": 23800}, {"label": "Cash", "value": 15000}], "format": "money"}'></ts-breakdown>
```

From script:

```js
document.querySelector('#traffic').data = { slices: [{ id: 'search', label: 'Search', value: 5400 }, { id: 'direct', label: 'Direct', value: 3100 }] }
```

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the tile's name. Defaults to "Breakdown" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000`. Falls back to the nearest `<ts-grid>`'s |
| `flash` | attribute | Accepted like on every tile; this tile has no ticking figure to tint, so it changes nothing here |
| `size` | attribute and property | `S`, `Wide`, `Tall` or `M`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | The data shape above |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered, such as `['retry']` |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The static ``TsBreakdown.breakdownModel(data, variant, ctx)`` is the pure view model, handy for tests and server rendering.

Besides the formatted parts it returns `ariaLabel`, the sentence that names the tile and the drawing, the donut's `arcs`, and `excluded` and `dropped`.

## Actions

`retry` is the only action. With `actions = ['retry']`, the error view's Retry
button fires:

```ts
// ts-action
{ action: 'retry' }
```

`open` fires too when the tile is `activatable`. Nothing in this tile tells the host
anything else, so there is no action to opt in to. See [Events](../reference/events.md).

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the largest part |
| `header` | The header row: the live dot, the label and the right-hand text |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `bar` | The share bar or the stacked bar, `role="img"` |
| `chart` | The donut, `role="img"` |
| `legend` | The list of parts |
| `item` | One part of the legend |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton shaped like the size's layout |
| Empty | `data = null` | "Nothing to break down", or your `slot="empty"` content |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a view model that throws | A warning icon and the message, and Retry if enabled |
| Content | An object | The drawing and the legend. With nothing to draw (every part 0) it says "Nothing to break down" at every size, and the legend lists the zeros under it |

## Accessibility

- A `role="group"` named with the result: "Allocation: 5 parts, largest Equities 41.2%". The drawing is one
  `role="img"` with the same sentence, and its slices are not exposed separately.
- Every part's identity and size are in text. The legend is a list whose items read "Equities, 41.2%", so
  nothing depends on colour. Neighbouring slices are separated by a gap line in the tile's surface colour.
- In forced colours the backgrounds are dropped, so the bar and the donut keep their meaning through the
  text legend, the gap lines in the user's own text colour and an outline on the largest part.
- A share is neither a gain nor a loss, so it carries no sign or arrow.
- The legend's list takes focus when it scrolls, and a change of one value writes one text node, so a reader
  keeps their place.
- The live pulse, the loading shimmer and the change flash stop under
  `prefers-reduced-motion`.
