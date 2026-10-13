# Bring your own chart

`<ts-chart>` draws line and area trends. For anything else (bars, candlesticks,
maps) or a chart library you already use, put your chart inside a `<ts-card>`.
The card gives you the themed tile, the heading, the grid's sizing and edit
mode; you supply the canvas.

## What the card gives your chart

The card's default slot is a box with `flex: 1; min-height: 0; overflow: hidden`.
A child with `height: 100%` fills whatever is left under the header, at every
size, and follows the tile when the user resizes it. Restrict the sizes the
tile may take with `sizes`, and name the chart for assistive technology:

```html
<ts-card label="Latency" sizes="Wide M L">
  <span slot="value">182 ms</span>
  <div class="chart" style="position: relative; height: 100%">
    <canvas role="img" aria-label="Latency over the last hour: 182 ms now, 140 ms low"></canvas>
  </div>
  <span slot="footer">p95 over the last hour</span>
</ts-card>
```

Use the `value` slot for the headline a screen reader should hear first, and
keep the chart's `aria-label` stating the result, not just its type.

## Theming from `--ts-*`

Chart libraries want colour strings, not CSS variables, so read the tokens with
`getComputedStyle` on the card and read them again whenever the theme changes.
Dark mode is set by `data-theme` or a `.dark` class, so watch both, plus the
operating system when the theme is `auto`:

```js
const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim()

export function onThemeChange(callback) {
  const observe = new MutationObserver(callback)
  observe.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
  const media = matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', callback)
  return () => {
    observe.disconnect()
    media.removeEventListener('change', callback)
  }
}
```

The tokens most charts need: `--ts-ink` and `--ts-muted` for text, `--ts-line`
for grid lines, `--ts-axis` for the zero line, `--ts-series-1` to
`--ts-series-4` for series, and `--ts-profit` and `--ts-loss` for gains and
losses. Keep a sign or label beside any colour that carries meaning.

## Chart.js

```js
import { Chart } from 'chart.js/auto'

const card = document.querySelector('ts-card[label="Latency"]')
const canvas = card.querySelector('canvas')
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

const chart = new Chart(canvas, {
  type: 'line',
  data: { labels: minutes, datasets: [{ label: 'p95 (ms)', data: p95 }] },
  options: {
    responsive: true,            // Chart.js watches the container, so a resize just works
    maintainAspectRatio: false,  // fill the card's box instead of keeping a ratio
    animation: reduceMotion ? false : undefined,
  },
})

function paint() {
  const ink = css(card, '--ts-muted')
  const series = css(card, '--ts-series-1')
  chart.data.datasets[0].borderColor = series
  chart.options.scales.x.ticks.color = ink
  chart.options.scales.y.ticks.color = ink
  chart.options.scales.y.grid.color = css(card, '--ts-line')
  chart.update('none')
}
paint()
onThemeChange(paint)
```

The `position: relative` wrapper in the markup is required: Chart.js sizes
itself from its parent, which must be positioned and hold only the canvas.
Call `chart.destroy()` when the card is removed.

## ECharts

ECharts does not watch its container, so resize it yourself with a
`ResizeObserver` on the same box:

```js
import * as echarts from 'echarts'

const card = document.querySelector('ts-card[label="Latency"]')
const box = card.querySelector('.chart')
const chart = echarts.init(box)

function paint() {
  chart.setOption({
    animation: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    color: [css(card, '--ts-series-1'), css(card, '--ts-series-2')],
    textStyle: { color: css(card, '--ts-muted') },
    xAxis: { type: 'category', data: minutes, axisLine: { lineStyle: { color: css(card, '--ts-axis') } } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: css(card, '--ts-line') } } },
    series: [{ type: 'line', data: p95 }],
  })
}
paint()
onThemeChange(paint)

new ResizeObserver(() => chart.resize()).observe(box)
```

For ECharts, use a `<div class="chart" style="height: 100%">` in place of the
canvas, and call `chart.dispose()` on removal.

## Resizing and edit mode

While a user drags a tile's corner, the card's box changes size and your
observer fires once per frame, so keep `paint` cheap and do not recreate the
chart in it. Both libraries above redraw only what changed.

## Frameworks

Create the chart after the element is in the DOM (`useEffect`, `onMounted`,
`onMount`, `ngAfterViewInit`) and destroy it in the cleanup. The grid never moves
your children, so a framework-owned chart node stays attached. See the
[framework recipes](frameworks/react.md).
