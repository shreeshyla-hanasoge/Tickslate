/**
 * <acme-mrr>: monthly recurring revenue and its change on last month, the
 * worked example of docs/guide/custom-widgets.md. The figures in its tests and
 * in the guide are made up.
 *
 * In your own project the imports below are `from 'tickslate'` and
 * `from 'tickslate/elements'`. Here they are relative so that
 * `node --test examples/custom-widget/*.test.mjs` runs from a clone with no install.
 */
import { toNumber } from '../../src/core/index.js'
import { TsWidget, defineWidget, widgetCatalog, linePaths } from '../../src/elements/index.js'

const UP = '▲'
const DOWN = '▼'

// The sparkline is drawn in this box and stretched to the tile, so only its
// proportions matter.
const SPARK = { width: 240, height: 80, pad: 4 }

// A tile of this many characters or fewer shows the figure whole; a longer one goes compact.
const S_CHARS = 8
// The customer count sits in a slot that holds about this many.
const COUNT_CHARS = 6

// Every word the widget shows comes from a message, never from the template. These are its English
// defaults, handed to defineWidget below: Tickslate answers from them after the host's own tables
// (configure({ messages }), the grid's, the element's) and before its built-in English, so a host
// translates or rewords any of them under the same keys. The prefix is the widget's type.
export const MESSAGES = Object.freeze({
  'widget.acme-mrr.label': 'MRR',
  'acme-mrr.up': 'up {delta} on last month',
  'acme-mrr.down': 'down {delta} on last month',
  'acme-mrr.flat': 'no change on last month',
  'acme-mrr.trend': '{label} trend, from {from} to {to}',
  'acme-mrr.breakdown': 'Breakdown',
  'acme-mrr.customers.one': '{count} customer',
  'acme-mrr.customers.other': '{count} customers',
})

/**
 * Pure: data in, display strings out. It never throws on partial data: an
 * unreadable figure shows as a dash and a missing one is left out.
 */
export function mrrModel(data, variant, { fmt, t, label }) {
  const mrr = toNumber(data.mrr)
  const previous = toNumber(data.previous)
  const known = Number.isFinite(mrr)

  const money = (n) => fmt.money(n, { decimals: 0, sign: 'negative' })
  // At S the figure goes compact when it would not fit; the spoken name keeps the whole one.
  // Not fmt.fit(): money's full form carries cents, so fit would go compact even at $48,250.
  const whole = money(mrr)
  const value = variant === 'S' && whole.length > S_CHARS ? fmt.money(mrr, { compact: true, sign: 'negative' }) : whole

  // A previous of zero has no percentage; dividing would show an infinity.
  const change = known && Number.isFinite(previous) && previous !== 0 ? (mrr - previous) / Math.abs(previous) : NaN
  const delta = Number.isFinite(change) ? fmt.percent(change, { sign: 'always', decimals: 1 }) : ''
  // The direction comes from the number, never from the text: in some locales (ar-EG) a mark comes
  // before the sign and the digits are not 0 to 9. A change that shows as 0.0% gets no arrow.
  const moved = Math.round(Math.abs(change) * 1000) > 0
  const rise = moved && change > 0
  const fall = moved && change < 0
  const spokenDelta = Number.isFinite(change) ? fmt.percent(Math.abs(change), { sign: 'negative', decimals: 1 }) : ''

  let ariaLabel = known ? `${label}, ${money(mrr)}` : label
  if (known && delta) {
    const how = rise ? t('acme-mrr.up', { delta: spokenDelta }) : fall ? t('acme-mrr.down', { delta: spokenDelta }) : t('acme-mrr.flat')
    ariaLabel += `, ${how}`
  }

  const count = toNumber(data.customers)
  const vm = {
    ariaLabel,
    label,
    value,
    delta,
    arrow: rise ? UP : fall ? DOWN : '',
    tone: rise ? 'pos' : fall ? 'neg' : 'mut',
    // fit() tries the full number, then compact, and keeps the shorter that fits the slot.
    customers: Number.isFinite(count) ? t('acme-mrr.customers', { count: fmt.fit(count, COUNT_CHARS, { style: 'number' }) }, count) : '',
    more: t('acme-mrr.breakdown'),
    line: '',
    area: '',
    sparkLabel: '',
    dropped: 0,
  }

  if (variant === 'M' && Array.isArray(data.history)) {
    const readings = data.history.map(toNumber)
    const points = readings.flatMap((y, x) => (Number.isFinite(y) ? [{ x, y }] : []))
    vm.dropped = readings.length - points.length
    // One reading is not a trend, and no line beats a line implying one.
    if (points.length >= 2) {
      const { line, area } = linePaths(points, { ...SPARK, includeZero: false })
      vm.line = line
      vm.area = area
      const from = money(points[0].y)
      const to = money(points[points.length - 1].y)
      vm.sparkLabel = t('acme-mrr.trend', { label, from, to })
    }
  }
  return vm
}

const head = '<div class="hd"><span class="lb ell" data-k="label"></span></div>'
const change = '<span class="sm n nv" data-k="change"><span aria-hidden="true" data-k="arrow"></span> <span data-k="delta"></span></span>'
const more = '<button type="button" class="btn" data-action="breakdown" data-k="more" hidden></button>'

// Static markup per size, built once. The figures arrive in update().
const TEMPLATES = {
  S: `${head}<span class="big n nv" data-k="value"></span><span class="f1"></span>${change}`,
  Wide: `${head}<span class="xbig n nv" data-k="value"></span><span class="f1"></span>
<div class="row">${change}<span class="f1"></span><span class="sm mut ell" data-k="customers"></span></div>`,
  M: `${head}<div class="rowb"><span class="xbig n nv" data-k="value"></span>${change}</div>
<div class="spark"><svg viewBox="0 0 ${SPARK.width} ${SPARK.height}" preserveAspectRatio="none" role="img" data-k="spark" hidden>
  <path class="sa" data-k="area"></path><path class="sl" data-k="line"></path>
</svg></div>
<div class="row"><span class="sm mut ell f1" data-k="customers"></span>${more}</div>`,
}

export class AcmeMrr extends TsWidget {
  // What a grid, a picker and widgetCatalog() know about this widget.
  static spec = {
    sizes: ['S', 'Wide', 'M'],
    description: 'Monthly recurring revenue and its change on last month.',
    category: 'Revenue',
  }
  static emptyText = 'No revenue data yet'
  // Development only: data of the wrong shape warns once, naming the path.
  static dataShape = {
    mrr: 'numeric',
    previous: { kind: 'numeric', optional: true },
    customers: { kind: 'number', optional: true },
    history: { kind: 'array', optional: true },
  }
  static styles = `
[hidden] { display: none; }
.nv { white-space: nowrap; max-width: 100%; overflow: hidden; unicode-bidi: isolate; }
.spark { flex: 1; min-height: 0; position: relative; }
.spark svg { position: absolute; inset: 0; width: 100%; height: 100%; direction: ltr; }
.sl { fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.sa { fill: currentColor; fill-opacity: .12; stroke: none; }
`

  static template(variant) {
    return TEMPLATES[variant] || TEMPLATES.Wide
  }

  static viewModel(data, variant, ctx) {
    return mrrModel(data, variant, ctx)
  }

  constructor() {
    super()
    // The root, not the tile: the base already listens on the tile for Retry.
    this.shadowRoot.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-action="breakdown"]')) this.emit('breakdown', { metric: 'mrr' })
    })
  }

  update(vm, variant) {
    // Each write is skipped when it would change nothing, so a live tick that
    // moves one figure touches one node and the rest of the tile stays put.
    const text = (k, s) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el && el.textContent !== s) el.textContent = s
    }
    const attr = (k, name, v) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el && el.getAttribute(name) !== v) el.setAttribute(name, v)
    }
    text('label', vm.label)
    text('value', vm.value)
    text('arrow', vm.arrow)
    text('delta', vm.delta)
    attr('change', 'class', `sm n nv ${vm.tone}`)
    if (variant === 'S') return

    text('customers', vm.customers)
    if (variant === 'Wide') return

    this.$('[data-k="spark"]').toggleAttribute('hidden', !vm.line)
    attr('spark', 'class', vm.tone)
    attr('spark', 'aria-label', vm.sparkLabel)
    attr('line', 'd', vm.line)
    attr('area', 'd', vm.area)
    text('more', vm.more)
    this.$('[data-k="more"]').toggleAttribute('hidden', !this.actionEnabled('breakdown'))
  }
}

// The tag and type carry a prefix of your own, so they can never clash with a future Tickslate
// widget. Only this very class is a no-op the second time: if this module is evaluated again (hot
// reload, a second bundle) it makes a new class, and defineWidget would throw. The guard keeps the first.
if (!widgetCatalog()['acme-mrr']) defineWidget('acme-mrr', AcmeMrr, { type: 'acme-mrr', messages: MESSAGES })
