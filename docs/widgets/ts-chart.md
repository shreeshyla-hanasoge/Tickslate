# `<ts-chart>`

Line, area and bar series, up to six, from either named series or table rows,
on a time, number or category axis. It is not finance-specific. For
candlesticks or maps, put your own chart in a [`<ts-card>`](ts-card.md).

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
  /** How x is read. 'category' reads it as text and puts points and bars on a band scale. Default 'time'. */
  xType?: 'time' | 'number' | 'category'
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
          kind?: 'line' | 'area' | 'bar' // default 'line'
          points: Array<{ x: Time | number; y: Numeric }>
        }>
      }
    | {
        rows?: Array<Record<string, unknown>>
        /** The row key for x. */
        x?: string
        /** One key, several, or { key, name?, kind? } objects. */
        y?: string | string[] | Array<{ key: string; name?: string; kind?: 'line' | 'area' | 'bar' }>
      }
  )
```

All keys are optional in the checker, because either form alone is enough; the
`points` of each series item are checked. `series` wins when both are given.
Points are read in any order and sorted by x. Anything that cannot be read is
dropped, counted, and reported once in development. Only the first six series
are drawn (a warning says how many were given). x is read with `toTime`, or with
`toNumber` when `xType` is `'number'`, or as text when it is `'category'`; `xType`
is also how a column called `time` stays unambiguous in the rows form.

Axes: the y range is rounded to four evenly spaced "nice" labels at `M` and up;
any area or bar series anchors the range on zero. A zero line (dashed, `--ts-axis`)
shows when zero is in range. The x axis shows the start, middle and end, as
clock times for a span under a day and as dates for longer ones. A single point
on the whole chart draws as a level line; a lone point among longer series
draws as a dot.

## Bars and categories

A series with `kind: 'bar'` is drawn as filled bars from the zero line: up for a
positive value and down for a negative one. Several bar series sit side by side
inside each band, grouped and never stacked. Bars mix with lines and areas on
one chart.

With `xType: 'category'`, x is read as text and each distinct value gets a band,
in order of first appearance across all series. A point whose x is `null` or empty is
dropped and counted. Lines and areas run through the centre of each band, so any
kinds can share the axis. A single category takes the whole plot, and a series
with one point on a category axis draws as a dot at its band's centre.

Category labels sit under their bands, one per band, and truncate with an
ellipsis. When the width cannot hold them all the chart skips labels evenly,
always keeping the first and the last. `chartModel` returns every category in
`categories`, and `[]` on the other axes.

Bars are allowed on `'time'` and `'number'` axes too, at the x positions given.
The bars' width is the smallest gap between them. Time and number charts show no
category labels.

```js
chart.data = {
  xType: 'category',
  format: 'money',
  series: [
    { name: 'Profit', kind: 'bar', points: [{ x: 'Jan', y: 1200 }, { x: 'Feb', y: -400 }, { x: 'Mar', y: 800 }] },
    { name: 'Target', points: [{ x: 'Jan', y: 1000 }, { x: 'Feb', y: 1000 }, { x: 'Mar', y: 1000 }] },
  ],
}
```

On a time or number axis the bars' slot is the typical (median) gap between
bars, not the smallest, and there are at most about 200 slots across the plot,
so one stray close-together point never shrinks the rest. Every bar is at least
a pixel or two wide, and any nonzero value is at least a pixel tall however
small it is next to the others; only a true zero draws nothing.

Give each x once per series. Two bars of one series at the same x (a repeated
category, or a repeated time or number) are drawn on top of each other, and
development warns once. Merge them in your data first.

Bars never rely on colour: a loss is a bar below the zero line, its value is
written with a true minus (`−400`), and every bar's value is also in text (see
[Accessibility](#accessibility)).

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
| `label` | attribute and property | The heading and the tile's name. Defaults to "Chart" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000`. Falls back to the nearest `<ts-grid>`'s `stale-after`; an unreadable value falls back to the default with one development warning |
| `scrub` | attribute and property | `off` turns scrubbing off: no hover or drag read-out and no keyboard slider. `on` turns it on where the nearest `<ts-grid>` says `off`. Falls back to the nearest `<ts-grid>`'s `scrub`, then on |
| `flash` | attribute | `off` stops the brief tint on a headline figure that changed. The nearest `<ts-grid>`'s `flash` applies too |
| `size` | attribute and property | `Wide`, `M`, `L` or `XL`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `ChartData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered, such as `['retry']` |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting of values, times and dates |
| `item` | attribute | The id a grid matches this child by |

The base members are listed in [Your own widget](../guide/your-own-widget.md).
`TsChart.chartModel(data, variant, ctx)` is the pure view model.

## Scrubbing and the data table

Hover a mouse over the plot, or drag a finger along it, and a rule, a dot and a small label show the point
nearest the pointer: its x as the axis shows it (a time, a date, a number or a category), and one `name value` pair for each series. A vertical swipe still scrolls the page; only a horizontal drag
scrubs. The label stays inside the plot at both edges, and inside its height: on a short plot (`S`, `Wide`) it lays its
series out in two columns, and when even that is too tall it shows the series that fit and a count of the rest ("+2 more").
The slider's value text always names every series. Scrubbing only changes what the tile shows, so it fires no event.

For the keyboard the plot has one tab stop, a `role="slider"` named "Revenue, read point by point". Left and
Right move one point earlier or later (time runs left to right in every language, so the arrows never swap), Page Up
and Page Down move ten, Home and End jump to the first and last point, and Escape hides the label and keeps focus.
Focus starts on the newest point. The slider's `aria-valuetext` is the label's text, so a screen reader speaks each
point as the keys move, and nothing in the tile is `aria-live`.

The plot has a visually hidden table of its last 12 drawn points, newest last, with a caption, column headers and
row headers. It is the screen-reader route to the data, and it is not announced. Rows are updated in place, so a
tick adds a row and drops the oldest rather than rebuilding the table. A chart with bars also keeps its visually hidden
list of bar sentences, which names every bar and not only the last 12 points, so a screen reader may read the newest
values both there and in the table's last row. That is a deliberate deviation from the table replacing the list
(RFC 0004 §1.6).

With several series the pointer snaps to the x of the series with the most points, and every other series shows its
own nearest point there. A bar series shows a value only at a category it has a bar for, and reads `—` elsewhere. The
label reads the drawn points: a very long series is thinned for drawing (twice the plot's width in points, keeping
the low, the high and the last value), and the read-out names only points the line passes through.

Choosing a point with `select` is separate. The slider is its own tab stop, before the list of points, and fires no
event; the arrow keys on a point and on the slider never share a key.

Set `scrub="off"` on a tile, or on the `<ts-grid>`, to turn it off; a change on the grid applies to its tiles at once. The table stays. Scrubbing is also off while
the grid is in edit mode.

## Freshness and change flashes

Send `asOf` with `live: true` and the header says how old the data is. While it is fresh the dot pulses and the header reads `just now`, then `2 min. ago` (in the tile's locale). Past `stale-after` the dot turns `--ts-warn` and stops pulsing, the header reads `Stale · 3 min`, and the tile's name ends with `, stale` where it would end with `, live`. With `asOf` and no `live` the data is a snapshot: the dot is hidden, the header reads `synced 11:42` and nothing ages.

A live tile re-renders its age every 15 seconds, on one timer shared by every tile on the page. The timer pauses while the page is hidden and stops when no live tile is connected. An `asOf` ahead of the clock reads as `just now` until the clock passes it, and never as a negative age.

When the first series' latest value changes, it is tinted for 700 ms: `--ts-profit` when it rose and `--ts-loss` when it fell (swapped by `goodWhen: 'down'` in the data, `--ts-accent` for `'neither'` where the widget reads it). It never flashes on the first render, on a size change or for an unchanged value, at most once a second, and not under `prefers-reduced-motion` or with `flash="off"`. In forced colours the tint is an outline.

## Actions

`retry`, and `select`. With `actions = ['retry']` the error view's button fires
`ts-action` with `{ action: 'retry' }`. With `'select'`, each point and each bar
is a button that fires `{ action: 'select', value, series, y, index }`, where
`value` is the x as given (the category, for a category axis). One tab stop
covers them all, and the arrow keys, Home and End move between them. For
grouped bars the order is band by band, as they look: Profit January, Costs
January, Profit February. A bar's whole rectangle is its target, at least 24px
each way; on a crowded axis a click goes to the nearest bar. See
[Events](../reference/events.md).

`open` fires too when the tile is `activatable`. The header and the empty space open it, and an `href` tile follows its link from the same places; the chart scrubs, a point fires `select` when `actions` includes `'select'`, and a click elsewhere on the plot does nothing, and the tile's own buttons and the `actions` slot keep their clicks. Route `open` to a page other than the one the tile is already on.

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the label (the plot carries the result) |
| `header` | The header row: the live dot, the label and the right-hand text (at `Wide`, the first series' name) |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `chart` | The plot box: the svg, without its axis labels |
| `scrub` | The overlay over the plot while a point is read (hidden otherwise) |
| `scrub-rule` | The vertical rule at the point |
| `scrub-dot` | A dot on the point for each series, in the series' colour |
| `scrub-readout` | The label with the point's x and each series' value |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

Series colours are `--ts-series-1` to `--ts-series-6` in order; see
[Theming](../theming.md). Area and bar series get a legend swatch shaped as a
square, so they differ from lines without colour.

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton of the plot, axis and legend or rail |
| Empty | `data = null` | "No data yet", or your `slot="empty"` content |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a throw | The message, and Retry if enabled |
| Content | An object | The chart. A series with no readable points shows a dash for its last value; no series at all names the label with "no data" |

## Accessibility

- The tile is a `role="group"` named by its label alone, and the label is a heading. The plot is a `role="img"` svg
  whose label states the result, "Revenue, last 12,100; Cost, last 8,100", so
  the summary is spoken once.
- Series are told apart by position, legend name and (for areas and bars) swatch
  shape, not only by colour. Series colours meet 3:1 on the surface.
- The plot has one tab stop, a `role="slider"` with a value text such as
  "Sep 1: Revenue 120 and Cost 60", and a visually hidden table of the last 12 points, one column per series.
  Nothing is `aria-live`.
- The axis labels are `aria-hidden`; the last values are in the svg's label and
  in the legend text.
- Bars carry their values as text: with `select` on, every bar is a button named
  "Profit: Feb, −400"; without it the same sentences sit in a visually hidden
  list beside the plot. Negative values use the true minus.
- Under forced colours lines use dash patterns, and each bar is outlined in the
  other system colour with a width and dash of its own per series (the legend
  swatch's border matches), so six series stay apart without colour.
- Values of 1e15 and beyond are written as a power of ten (`1.00e+300`) in labels.
- The live pulse and the loading shimmer stop under `prefers-reduced-motion`.
