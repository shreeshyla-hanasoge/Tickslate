# `<ts-chart>`

Line and area trends for up to four series, from either named series or table
rows. It is not finance-specific. For bars, candlesticks or maps, put your own
chart in a [`<ts-card>`](ts-card.md).

```js
import 'tickslate/elements'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `Wide` | 2 x 1 | Label, the first series' name in the header, the plot and an x axis. No y labels |
| `M` | 2 x 2 | Label, a legend (name and last value per series), the plot with y labels and gridlines, x axis |
| `L` | 3 x 2 | Plot with y labels, and a rail on the right with each series' name and last value. Under 460px wide the rail wraps under the plot |
| `XL` | 4 x 2 | The same as `L` |

On a phone `L` and `XL` take 2 x 2 and render the `M` design.

## Data shape

Either named series, or rows with the keys to read.

```ts
interface ChartOptions {
  /** How x is read. Default 'time'. */
  xType?: 'time' | 'number'
  /** How each series' last value is shown. Default 'number'. */
  format?: 'number' | 'money' | 'percent' | 'duration'
  decimals?: number
  /** Formatted with fmt.unit: '182 ms'. */
  unit?: string
  /** Accepted for parity with <ts-metric>; no chart size shows a change yet. */
  goodWhen?: 'up' | 'down' | 'neither'
  asOf?: Time
  live?: boolean
}

type ChartData = ChartOptions &
  (
    | {
        series?: Array<{
          id?: string
          name?: string // default 'Series 1', 'Series 2'...
          kind?: 'line' | 'area' // default 'line'
          points: Array<{ x: Time | number; y: Numeric }>
        }>
      }
    | {
        rows?: Array<Record<string, unknown>>
        /** The row key for x. */
        x?: string
        /** One key, several, or { key, name?, kind? } objects. */
        y?: string | string[] | Array<{ key: string; name?: string; kind?: 'line' | 'area' }>
      }
  )
```

All keys are optional in the checker, because either form alone is enough; the
`points` of each series item are checked. `series` wins when both are given.
Points are read in any order and sorted by x. Anything that cannot be read is
dropped, counted, and reported once in development. Only the first four series
are drawn (a warning says how many were given). x is read with `toTime`, or with
`toNumber` when `xType` is `'number'`, and `xType` is also how a column called
`time` stays unambiguous in the rows form.

Axes: the y range is rounded to four evenly spaced "nice" labels at `M` and up;
any area series anchors the range on zero. A zero line (dashed, `--ts-axis`)
shows when zero is in range. The x axis shows the start, middle and end, as
clock times for a span under a day and as dates for longer ones. A single point
on the whole chart draws as a level line; a lone point among longer series
draws as a dot.

## Minimal example

Named series:

```html
<ts-chart label="Revenue" size="Wide" currency="USD"
  data='{"format": "money", "series": [{"name": "Revenue", "points": [
    {"x": "2026-09-01", "y": 11800}, {"x": "2026-09-02", "y": 12400}, {"x": "2026-09-03", "y": 12100}]}]}'></ts-chart>
```

Rows, two series (the second an area):

```js
const chart = document.querySelector('#traffic')
chart.data = {
  rows: [
    { day: '2026-10-01', visits: 820, signups: 41 },
    { day: '2026-10-02', visits: 905, signups: 38 },
    { day: '2026-10-03', visits: 870, signups: 52 },
  ],
  x: 'day',
  y: ['visits', { key: 'signups', name: 'Signups', kind: 'area' }],
}
```

```html
<ts-chart id="traffic" label="Traffic" size="M"></ts-chart>
```

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the region's name. Defaults to "Chart" |
| `size` | attribute and property | `Wide`, `M`, `L` or `XL`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `ChartData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered, such as `['retry']` |
| `locale`, `currency`, `time-zone` | attributes | Formatting of values, times and dates |
| `item` | attribute | The id a grid matches this child by |

The base members are listed in [Your own widget](../guide/your-own-widget.md).
`TsChart.chartModel(data, variant, ctx)` is the pure view model.

## Actions

`retry` only. With `actions = ['retry']` the error view's button fires
`ts-action` with `{ action: 'retry' }`. See [Events](../reference/events.md).

## Parts

| Part | Element |
|---|---|
| `tile` | The tile's `<section>` |
| `error` | The error view's container |

Series colours are `--ts-series-1` to `--ts-series-4` in order; see
[Theming](../theming.md). Area series get a legend swatch shaped as a filled
square so line and area differ without colour.

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton of the plot, axis and legend or rail |
| Empty | `data = null` | "No data yet", or your `slot="empty"` content |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a throw | The message, and Retry if enabled |
| Content | An object | The chart. A series with no readable points shows a dash for its last value; no series at all names the label with "no data" |

## Accessibility

- The tile is a region named by its label alone. The plot is a `role="img"` svg
  whose label states the result, "Revenue, last 12,100; Cost, last 8,100", so
  the summary is spoken once.
- Series are told apart by position, legend name and (for areas) swatch shape,
  not only by colour. Series colours meet 3:1 on the surface.
- The axis labels are `aria-hidden`; the last values are in the svg's label and
  in the legend text.
- The live pulse and the loading shimmer stop under `prefers-reduced-motion`.
