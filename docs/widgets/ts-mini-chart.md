# `<ts-mini-chart>`

A small candlestick chart with entry and exit marks and a candle-close countdown,
drawn by [Emberwick](https://github.com/shreeshyla-hanasoge/Emberwick). Hand it
bars; it draws them, and when you replace the data on every tick it changes only
the last candle.

Emberwick is an **optional peer**. The widget has its own entry, and
`tickslate/elements` never loads it, so a host that does not use the chart never
installs, downloads or pays for Emberwick:

```sh
npm i emberwick   # 0.14.0 or later
```

```js
import 'tickslate/elements'             // every other widget
import 'tickslate/elements/mini-chart'  // this one, and the only import that reaches Emberwick
```

The CDN files (`tickslate.js`, `tickslate.iife.js`) do not contain it either. A
layout may name `miniChart` before its entry is imported; the grid shows an
empty tile until `<ts-mini-chart>` is defined.

Emberwick is loaded with `import('emberwick')` the first time there are bars,
not when the module is imported. Without it (not installed, or your bundler
could not resolve it) the tile shows its error view, "The chart library isn't
installed", with one development warning, and the rest of the page is untouched. The tile does not try again
by itself once the import has failed: install the package and reload the page.

While the first import is pending the chart's box shows a skeleton and the tile is marked `aria-busy`, so an
empty frame is never mistaken for a chart with no data.

### Bundlers that cannot resolve a missing package

Vite (dev and build) and webpack treat an optional peer that is not installed as absent, and the tile shows its
error view. A raw esbuild build (or a tool that wraps it, such as tsup or bun build) stops with "Could not resolve
emberwick" instead, because it has to resolve every `import()` it sees. Either install the peer, or mark it
external:

```js
// esbuild
await build({ entryPoints: ['app.js'], bundle: true, external: ['emberwick', 'emberwick/profiles'] })
```

An external import is left as written, and the browser then needs a way to find `emberwick` (an import map, or
serving it yourself). Without one the tile shows the same error view.

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `M` | 2 x 2 | The first chart: instrument, timeframe, last price, the signed change, and the candles |
| `L` | 2 x 3 | The same, with the timeframe buttons in the header (when `actions` includes `'timeframe'`) and a volume profile if you give one |
| `XL` | 4 x 2 | The first two charts side by side, each with its own header and `note` |

## Data shape

```ts
interface MiniChartData {
  /** M and L show the first chart; XL shows the first two. */
  charts: Array<{
    id: string
    instrument: string
    /** '5m'. Shown in the header and the summary; the pressed button at L. */
    timeframe?: string
    /** L: the buttons, with `timeframe` pressed. Shown only when `actions` includes 'timeframe'. */
    timeframes?: string[]
    /** Ascending by time. */
    bars: Array<{ time: Time; open: Numeric; high: Numeric; low: Numeric; close: Numeric; volume?: Numeric }>
    /** An entry is a circle and an exit a diamond, never colour alone. */
    marks?: Array<{ t: Time; kind: 'entry' | 'exit'; label?: string }>
    /** A fraction: 0.012 is +1.20%. */
    changePct?: Numeric
    /** XL: '2 strategies · 1 in position'. */
    note?: string
  }>
  /** The candle-close countdown under the last price. */
  countdown?: boolean
  /** L: a profile YOU computed, in Emberwick's ProfileData (version 1). Absent or null draws none. */
  volumeProfile?: MiniChartProfile | null
  asOf?: Time
  live?: boolean
}
```

A bar with a time or price that cannot be read is dropped, a mark with an unreadable time
or a `kind` other than `entry` or `exit` is dropped, and both are counted and reported once in
development. Bars may arrive in any order and are drawn ascending; two bars at one time keep the later.
`volumeProfile` is the contract of `emberwick/profiles`: Emberwick never computes a profile
from bars, and neither does Tickslate. A profile Emberwick rejects (a `step` of 0, a session whose
`start` is after its `end`, a `version` other than 1) shows the error view, "The volume profile couldn't be
drawn", until you send another; it is not thrown. A profile is compared by its figures, not by its object, so
sending an equal one on every tick costs nothing: it is neither reloaded nor reported again.

## Minimal example

```html
<ts-mini-chart label="Watch" size="M" id="watch"></ts-mini-chart>
<script type="module">
  import 'tickslate/elements/mini-chart'
  const t0 = Date.UTC(2026, 9, 26, 9, 15)
  document.getElementById('watch').data = {
    countdown: true,
    charts: [{
      id: 'abc', instrument: 'ABC Corp', timeframe: '5m', changePct: 0.012,
      bars: [
        { time: t0, open: 127.1, high: 127.9, low: 126.8, close: 127.6 },
        { time: t0 + 300000, open: 127.6, high: 128.7, low: 127.4, close: 128.4 },
      ],
      marks: [{ t: t0 + 300000, kind: 'entry', label: 'Long' }],
    }],
  }
</script>
```

Updating every tick, from Vue or React state or by hand, is cheap. The widget compares the new
bars with the old: the same list does nothing, a changed last candle is one `update`, a closed
candle is one `update` and one `append`, and anything else (an earlier bar changed, bars removed, more than 10 new
ones, a different instrument or timeframe) is a `setData`.

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The tile's name and heading. Defaults to "Mini chart" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s, then 3 |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale. Default `120000` |
| `flash` | attribute | Accepted on every widget; this one has no figure that flashes |
| `size` | attribute and property | `M`, `L` or `XL`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `MiniChartData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered: `['retry']`, `['timeframe']` |
| `clock` | property | `() => number`. Frozen in a demo, it reaches Emberwick's countdown too |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting. `time-zone` is also the zone of the chart's time axis |
| `item` | attribute | The id a grid matches this child by |

The base members are listed in [Your own widget](../guide/your-own-widget.md).

## Theme

The candles take their colours from the tokens, read when the chart is made and again whenever one of them
resolves differently. The theme can be set where [Theming](../theming.md) says, on any element above the tile or on
the tile itself: `data-theme`, `class`, `data-ts-theme`, `data-ts-palette` or an inline `style` that sets a token,
on `<html>`, a wrapper, the grid, `<body>` or the widget. One observer on `<html>` serves every mini chart on the
page, the system's colour scheme is followed under `data-theme="auto"`, and each data update checks again, so a
token changed by a stylesheet swap is picked up on the next tick. Emberwick is told only when a value actually
changed. The tokens used are: the surface, `--ts-line`, `--ts-axis`, `--ts-muted`, `--ts-ink`,
`--ts-profit` (up candles), `--ts-loss` (down candles), `--ts-accent` (the volume profile) and `--ts-font-num`.
The `red-up` palette swaps profit and loss, so the candles follow it. Emberwick's watermark is off, and its
animation stops under `prefers-reduced-motion`, and follows that setting if it changes while the page is open.

## Actions

| Action | When | `ts-action` detail |
|---|---|---|
| `timeframe` | The user presses a timeframe button at `L` (needs `actions = ['timeframe']` and `timeframes`) | `{ action: 'timeframe', id: 'abc', value: '15m' }` |
| `retry` | The user presses Retry in the error view (needs `actions = ['retry']`) | `{ action: 'retry' }` |

The widget does not change its own bars: replace `bars` and `timeframe` in `data`. See [Events](../reference/events.md).

`open` fires too when the tile is `activatable`. The whole tile is the click target, not only the label, so a click on any part of it fires `open`; only the tile's own buttons and the `actions` slot keep their clicks. Route `open` to a page other than the one the tile is already on.

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the label and the headline ("Mini chart, ABC Corp, last 128.40") |
| `header` | The header row: the live dot, the label, the timeframe buttons at `L`, the sync time |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `chart` | The framed box one chart is drawn in; a `role="img"` named by the summary |
| `timeframes` | The group of timeframe buttons at `L` |
| `empty` | The empty view's container |
| `error` | The error view's container (also for a missing Emberwick or a rejected profile) |
| `skeleton` | The loading view's container |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton shaped like the size's layout |
| Empty | `data = null` | "No bars yet", or your `slot="empty"` content. A chart with no bars says "No bars yet" in its box |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, a throw, Emberwick missing, or a rejected `volumeProfile` | The message, and Retry if enabled |
| Content | An object | The chart or charts |

## Accessibility

- The canvas is `aria-hidden`. A candlestick chart drawn on a canvas has no structure of its own, so its box is a
  `role="img"` named by a summary built from the data: "ABC Corp, 5m: last 128.40, up 1.20%, 78 bars, 2 entries and 1 exit".
  The change carries a word, "up" or "down", and the figure beside the chart carries its sign and an `aria-hidden` ▲ or ▼.
- Emberwick's hover and touch crosshair are not exposed to assistive technology. The summary and your own table of
  the bars are the text route.
- Entries are circles and exits are diamonds, so a mark is never told apart by colour alone.
- The timeframe buttons sit in a `role="group"` named "Timeframe", each a toggle with `aria-pressed`, and are at least
  44px on touch screens.
- In forced colours the canvas keeps Emberwick's colours; the frame and the controls use the system's.
- Emberwick's animation stops under `prefers-reduced-motion`, also if the setting changes while the page is open.
- The tile's group is named by the label and the headline, and each chart's box is the `role="img"` that carries the
  full summary, so a screen reader does not say the same sentence twice.
