# `<ts-progress>`

A goal and limit gauge: one value against one target, with a bar that turns to
a warning and then a danger as a limit is approached, or to a success when a
goal is met. It is not finance-specific: a sales target, a daily loss limit and
margin in use are the same widget.

```js
import 'tickslate/elements'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `S` | 1 x 1 | Label, the percentage, the bar, then the figures ("6,400 of 10,000 · 64%") and the state in words |
| `Wide` | 2 x 1 | Label, the percentage and state, the bar, the figures and the caption |

Any other size snaps to the nearest of these. Wide is designed for a tile of at least 300px, as in a two-column grid.

## Data shape

```ts
interface ProgressData {
  /** What has been reached or used. A number, a decimal string, or a Decimal.js / big.js object. */
  value: Numeric
  /** The goal or the limit. Missing, not a number, or 0 or less: the tile shows a dash and no bar. */
  target: Numeric
  /** Default 'goal'. */
  mode?: 'goal' | 'limit'
  /** Limit mode: the fraction of the target at which the bar turns to warning. Default 0.75. */
  warnAt?: number
  /** Default 'number'. 'percent' takes fractions (0.12 is 12%); 'duration' takes milliseconds. */
  format?: 'number' | 'money' | 'percent' | 'duration'
  decimals?: number
  /** Formatted with fmt.unit: '182 ms'. */
  unit?: string
  /** Wide: one line under the bar. */
  caption?: string
  /** When the data was taken. Shown as "synced HH:MM". */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}
```

`value` and `target` are the keys a gauge needs. In development, data that does
not match this shape warns once, naming the path.

How the bar reads:

| Mode | Below `warnAt` | From `warnAt` | At 100% or more |
|---|---|---|---|
| `limit` | `--ts-accent` | `--ts-warn`, "near limit" | `--ts-loss` with stripes, "over limit" |
| `goal` | `--ts-accent` | `--ts-accent` | `--ts-profit`, "goal reached" |

The percentage is the true ratio, rounded half up, and never reads 100% before
the target is met (99.7% shows 99%). A value above the target shows its real
percentage (120%) and fills the bar. A negative value shows its negative
percentage and fills nothing.

## Minimal example

```html
<ts-progress label="Daily loss limit" size="Wide"
  data='{"value": 6400, "target": 10000, "mode": "limit", "format": "money", "caption": "Resets at 09:15"}'></ts-progress>
```

From script:

```js
document.querySelector('#margin').data = { value: 0.82, target: 1, mode: 'limit', warnAt: 0.8, format: 'percent' }
```

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the tile's name. Defaults to "Progress" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000`. Falls back to the nearest `<ts-grid>`'s |
| `flash` | attribute | `off` stops the brief tint on the percentage when the value changes. The nearest `<ts-grid>`'s `flash` applies too |
| `size` | attribute and property | `S` or `Wide`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `ProgressData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered, such as `['retry']` |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()`. Without a currency, `format: 'money'` shows a plain signed number |
| `item` | attribute | The id a grid matches this child by |

The static `TsProgress.progressModel(data, variant, ctx)` is the pure view model,
handy for tests and server rendering. Besides the percentage, text, fill and
state, it returns `ariaLabel`, the sentence that names the tile.

The percentage flashes with `--ts-accent` whichever way it moves, since a rising
value is no verdict on a gauge.

## Actions

`retry` is the only action. With `actions = ['retry']`, the error view's Retry
button fires:

```ts
// ts-action
{ action: 'retry' }
```

See [Events](../reference/events.md).

`open` fires too when the tile is `activatable`. The whole tile is the click target, not only the label: it has no data surface, so a click on any part of it, the progress track included, fires `open` (or follows an `href`); only the tile's own buttons and the `actions` slot keep their clicks. Route `open` to a page other than the one the tile is already on.

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the result and the state |
| `header` | The header row: the live dot, the label and the right-hand text |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `value` | The percentage |
| `bar` | The track the bar fills, `role="meter"` |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton shaped like the size's layout |
| Empty | `data = null` | "No data yet", or your `slot="empty"` content |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a view model that throws | A warning icon and the message, and Retry if enabled |
| Content | An object | The gauge. With no valid target or value it shows a dash and no bar |

## Accessibility

- A `role="group"` named with the result and the state in words: "Daily loss
  limit, 6,400 of 10,000, 64%, near limit" ("over limit", "goal reached"; no
  state word below the warning). With no target: "Daily loss limit, no target
  set". Its label is a heading.
- The bar is a `role="meter"` from 0 to 100, named by the label alone, whose `aria-valuetext` repeats the
  result and the state, so a screen reader hears words and not a bare number.
- The state is never colour alone: it is written beside the figure, and the
  over-limit bar is striped.
- Figures use tabular numbers and keep their sign beside the digits in
  right-to-left pages. The track fills from its inline start edge, so from the right in a right-to-left page.
- In forced colours the track gets an outline and the bar uses the user's own
  highlight colour; the stripes stay.
- The live pulse, the loading shimmer and the change flash stop under
  `prefers-reduced-motion`.
