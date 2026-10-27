/**
 * <ts-breakdown>: parts of a whole as a share bar (S), a stacked bar (Wide and
 * Tall) or a donut (M), always with a legend that says each part's label and
 * percentage in text (RFC 0004 §4.1).
 *
 * `breakdownModel` is the pure view model. `apportion` and `foldSlices` are its
 * two pieces of arithmetic, kept pure and exported for the tests. The legend,
 * the bar's segments and the donut's arcs are keyed rows (rows.js): a changed
 * value writes one text node, a changed share one CSS length or one `d`, and no
 * node is rebuilt. All text is set with textContent; no markup is built from data.
 */

import { TsWidget, sk, syncedParts, header } from './widget.js'
import { EN, toNumber, toTime } from '../core/index.js'
import { decimalsOf, HIDDEN_CSS } from './list-parts.js'
import { arcPaths } from './chart.js'
import { createRows, setText } from './rows.js'

const isObj = (v) => v !== null && typeof v === 'object'
const text = (v) => (typeof v === 'string' ? v : '')

// Above this a value is scaled down before it is summed: far below the double limit, far above any real figure.
const HUGE = 1e150

/**
 * Largest-remainder rounding: the shares of `values` as numbers with `decimals`
 * places that sum to exactly 100. Works in whole units of 10^-decimals so the
 * sum is exact on every engine, and gives the leftover units to the biggest
 * remainders, ties going to the earlier (larger) value. A total of 0 gives zeros.
 */
export function apportion(values, decimals = 1) {
  const list = Array.from(values || [], (v) => (Number.isFinite(v) && v > 0 ? v : 0))
  // Values near the largest double would overflow when summed or scaled, so they are divided by the largest first.
  const peak = list.reduce((a, b) => Math.max(a, b), 0)
  const scaled = peak > HUGE ? list.map((v) => v / peak) : list
  const total = scaled.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return list.map(() => 0)
  const unit = Math.pow(10, decimals)
  const whole = 100 * unit
  const exact = scaled.map((v) => (v * whole) / total)
  const floors = exact.map(Math.floor)
  let left = whole - floors.reduce((a, b) => a + b, 0)
  const order = exact.map((e, i) => i).sort((a, b) => exact[b] - floors[b] - (exact[a] - floors[a]) || a - b)
  for (let k = 0; left > 0 && k < order.length; k++, left--) floors[order[k]]++
  return floors.map((n) => n / unit)
}

/**
 * Sorts by value, largest first and stable on ties, and keeps the largest
 * `max - 1` when there are more than `max`, summing the rest into one
 * `{ value, other: true }` slice at the end.
 *
 * `held` is the set of keys shown last time. Deviation from a literal sort
 * (recorded in the changelog fragment): near-tied slices would otherwise swap in
 * and out of Other on every tick, so a slice already shown stays shown until a
 * newcomer beats it by at least `margin` percentage points of the total.
 */
export function foldSlices(slices, { max = 6, held, margin = 1 } = {}) {
  const sorted = Array.from(slices || [], (s, i) => [s, i]).sort((a, b) => b[0].value - a[0].value || a[1] - b[1]).map((p) => p[0])
  if (sorted.length <= max) return sorted
  let shown = sorted.slice(0, max - 1)
  const rest = sorted.slice(max - 1)
  if (held && held.size) {
    // Measured against the largest slice so a total near the double limit cannot overflow.
    const peak = sorted[0].value || 1
    const total = sorted.reduce((a, s) => a + s.value / peak, 0)
    const gap = (margin / 100) * total
    for (;;) {
      // The weakest newcomer against the strongest held slice that fell out: swap unless the newcomer is clear of it.
      let n = -1
      shown.forEach((s, i) => {
        if (!held.has(s.key) && (n < 0 || s.value < shown[n].value)) n = i
      })
      const h = rest.findIndex((s) => held.has(s.key))
      if (n < 0 || h < 0 || !((shown[n].value - rest[h].value) / peak < gap)) break
      ;[shown[n], rest[h]] = [rest[h], shown[n]]
    }
    shown = shown.sort((a, b) => b.value - a.value || sorted.indexOf(a) - sorted.indexOf(b))
  }
  const kept = shown.slice()
  let sum = 0
  for (const s of rest) sum += s.value
  kept.push({ value: Math.min(sum, Number.MAX_VALUE), other: true })
  return kept
}

// The donut's drawing box.
export const DONUT = Object.freeze({ size: 100, radius: 48, inner: 31 })

function shower(fmt, d) {
  const format = ['money', 'percent', 'duration'].includes(d.format) ? d.format : 'number'
  const decimals = decimalsOf(d.decimals)
  const unit = text(d.unit)
  return (n) => {
    const o = { sign: 'negative', decimals }
    switch (format) {
      case 'money':
        return fmt.money(n, o)
      case 'percent':
        return fmt.percent(n, o)
      case 'duration':
        return fmt.duration(n)
      default:
        return unit ? fmt.unit(n, unit, o) : fmt.number(n, o)
    }
  }
}

/**
 * Pure: data in, strings and shares out. Negative values are left out and
 * counted, a value that is not a number is dropped and counted, a zero stays in
 * the legend at 0.0% and draws nothing. Never throws on partial data.
 */
export function breakdownModel(data, variant, ctx) {
  const d = isObj(data) ? data : {}
  const { fmt, t } = ctx
  // The key and colour each slice had last time (the element hands them back), so a near-tie does not churn the fold or the colours.
  const before = isObj(ctx.colours) ? ctx.colours : {}
  const held = new Set(Object.keys(before))
  const show = shower(fmt, d)
  const kind = variant === 'S' ? 'share' : variant === 'M' ? 'donut' : 'stacked'

  // Not an object, or a value that is not a number, is dropped. The id defaults to the label, so ids are made unique here.
  const list = Array.isArray(d.slices) ? d.slices : []
  let dropped = 0
  let excluded = 0
  const kept = []
  // 'other' is the folded slice's key, so a host id of that name is renamed rather than shared.
  const keys = new Set(['other'])
  list.forEach((s, i) => {
    const value = isObj(s) ? toNumber(s.value) : NaN
    if (!Number.isFinite(value)) {
      dropped++
      return
    }
    if (value < 0) {
      excluded++
      return
    }
    const label = text(s.label) || (s.id !== undefined && s.id !== null ? String(s.id) : '—')
    let key = s.id !== undefined && s.id !== null && s.id !== '' ? String(s.id) : label
    while (keys.has(key)) key = `${key}#${i}`
    keys.add(key)
    kept.push({ key, label, value, note: text(s.note) })
  })

  const folded = foldSlices(kept, { held })
  const pcts = apportion(folded.map((s) => s.value))
  const total = folded.reduce((a, s) => a + s.value, 0)
  // Fractions come from values scaled by the largest, so a pair near the double limit still draws.
  const peak = folded.reduce((a, s) => Math.max(a, s.value), 0)
  const parts = folded.map((s) => (peak > 0 ? s.value / peak : 0))
  const whole = parts.reduce((a, b) => a + b, 0)
  const drawn = whole > 0
  // A slice keeps the colour it had; a newcomer takes the lowest free one. Other is always the axis colour.
  // No prototype, so a host's id of `__proto__` is an ordinary key.
  const colours = Object.create(null)
  const used = new Set()
  for (const s of folded) {
    const c = before[s.key]
    if (!s.other && Number.isInteger(c) && c >= 1 && c <= 6 && !used.has(c)) {
      colours[s.key] = c
      used.add(c)
    }
  }
  for (const s of folded) {
    if (s.other || colours[s.key]) continue
    let c = 1
    while (used.has(c)) c++
    colours[s.key] = c
    used.add(c)
  }
  const slices = folded.map((s, i) => ({
    key: s.other ? 'other' : s.key,
    label: s.other ? t('breakdown.other') : s.label,
    value: show(s.value),
    pct: fmt.percent(pcts[i] / 100, { sign: 'negative', decimals: 1 }),
    fraction: whole > 0 ? parts[i] / whole : 0,
    index: s.other ? 0 : colours[s.key],
    other: Boolean(s.other),
    note: s.other ? '' : s.note,
  }))
  for (const s of slices) s.aria = t('breakdown.item', { label: s.label, pct: s.pct })

  const arcs = []
  if (kind === 'donut' && drawn) {
    const paths = arcPaths(slices.map((s) => s.fraction), DONUT)
    slices.forEach((s, i) => {
      if (paths[i]) arcs.push({ key: s.key, d: paths[i], index: s.index })
    })
  }

  const largest = slices[0]
  const label = ctx.label
  const ariaLabel = drawn
    ? t('breakdown.chartLabel', { label, count: kept.length, name: largest.label, pct: largest.pct }, kept.length)
    : t('breakdown.chartEmpty', { label })
  const asOf = toTime(d.asOf)
  return {
    ariaLabel,
    kind,
    total: kept.length && Number.isFinite(total) ? show(total) : '',
    totalText: kept.length && Number.isFinite(total) ? t('breakdown.total', { value: show(total) }) : '',
    colours,
    slices,
    arcs,
    excluded,
    note: excluded ? t('breakdown.excluded', {}, excluded) : '',
    dropped,
    drawn,
    // S: the largest part's label and percentage, in one string.
    share: drawn ? t('breakdown.share', { label: largest.label, pct: largest.pct }) : '',
    live: d.live === true,
    time: Number.isFinite(asOf) ? fmt.time(asOf) : '',
  }
}

// ── Markup ────────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg'
const HEAD = header({ dot: true, meta: true })
const NONE = '<div class="none mut" data-k="none" hidden></div>'

const SHARE = `${HEAD}
<span class="shr" data-k="share"></span>
<div class="track lift" part="bar" role="img" data-k="bar"><span class="fill" data-k="fill"></span></div>
<span class="sm mut foot" data-k="foot"></span>
${NONE}`

// The legend scrolls inside the tile rather than growing it.
const LEGEND = (cls) => `<div class="scroll lift" data-k="scroll" role="group" tabindex="0"><ul class="lg ${cls}" part="legend" data-k="legend"></ul></div>`
// The note about left-out values sits above the legend, so it is never the line that scrolls out of view.
const NOTE = '<p class="sm mut note" data-k="note" hidden></p>'
const BAR = '<div class="bar lift" part="bar" role="img" data-k="bar"></div>'

const TEMPLATES = {
  S: SHARE,
  Wide: `${HEAD}${NONE}${BAR}${NOTE}${LEGEND('flow')}`,
  Tall: `${HEAD}${NONE}${BAR}${NOTE}${LEGEND('stack')}`,
  M: `${HEAD}${NONE}${NOTE}
<div class="dn"><div class="donut"><svg class="lift" viewBox="0 0 100 100" part="chart" role="img" focusable="false" data-k="chart"><g data-k="arcs"></g></svg><span class="mid n sm" data-k="mid"></span></div>${LEGEND('stack round')}</div>`,
}

const SKELETONS = {
  S: `${header()}${sk(70, 13)}${sk(100, 10)}${sk(45, 9)}`,
  Wide: `${header()}${sk(100, 12)}${sk(80, 9)}${sk(60, 9)}`,
  Tall: `${header()}${sk(100, 12)}${sk(90, 9)}${sk(85, 9)}${sk(80, 9)}${sk(75, 9)}`,
  M: `${header()}<div class="skm"><span class="sk w40 h44"></span><div class="col f1">${sk(90, 10)}${sk(80, 10)}${sk(85, 10)}${sk(70, 10)}</div></div>`,
}

const STYLES = `
.scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; overscroll-behavior: contain; }
.scroll:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
/* Series colours by position; the folded Other is the axis colour. */
.c0 { --c: var(--ts-axis); }
.c1 { --c: var(--ts-series-1); }
.c2 { --c: var(--ts-series-2); }
.c3 { --c: var(--ts-series-3); }
.c4 { --c: var(--ts-series-4); }
.c5 { --c: var(--ts-series-5); }
.c6 { --c: var(--ts-series-6); }
.shr { font-size: var(--ts-text-xl, max(16px, 1rem)); font-weight: 600; line-height: 1.25; color: var(--ts-ink); unicode-bidi: isolate; overflow-wrap: anywhere; }
/* S has room for two lines of each; a longer label ends in an ellipsis rather than growing the tile. */
.shr, .foot { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; min-block-size: 0; }
.track { block-size: 10px; flex: none; border-radius: 5px; background: var(--ts-surface-2); overflow: hidden; }
.fill { display: block; block-size: 100%; inline-size: var(--w, 0%); border-radius: inherit; background: var(--c, var(--ts-series-1)); }
/* A gap line in the surface colour parts neighbours, so slices are told apart by more than colour. */
.bar { display: flex; flex: none; block-size: 12px; border-radius: 6px; background: var(--ts-surface-2); overflow: hidden; }
.seg { flex: 0 1 var(--w, 0%); min-inline-size: 3px; box-sizing: border-box; border-inline-end: 2px solid var(--ts-surface); background: var(--c); }
.seg.last { border-inline-end: 0; }
.lg { margin: 0; padding: 0; list-style: none; }
.lg li { min-inline-size: 0; }
.nm { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--ts-ink); unicode-bidi: isolate; }
.pc { white-space: nowrap; color: var(--ts-ink); }
.sw { display: inline-block; flex: none; inline-size: 10px; block-size: 10px; border-radius: 2px; background: var(--c); }
.round .sw { border-radius: 50%; }
.flow { display: flex; flex-wrap: wrap; gap: 3px 12px; }
.flow li { display: flex; align-items: center; gap: 6px; max-inline-size: 100%; font-size: var(--ts-text-md, max(12px, .75rem)); }
.flow .sub { display: none; }
.stack li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; column-gap: 8px; align-items: center; padding-block: 3px; border-block-end: 1px solid var(--ts-line); font-size: var(--ts-text-base, max(13px, .8125rem)); }
.stack li:last-child { border-block-end: 0; }
.stack .sub { grid-column: 2 / -1; display: flex; gap: 8px; min-inline-size: 0; }
.stack .nt { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.stack .nt:empty { display: none; }
.note { margin: 0; }
.dn { display: flex; flex: 1; min-height: 0; align-items: center; gap: 16px; }
.dn .scroll { align-self: stretch; }
/* Square by width, but never taller than the row it sits in: a compact M is shorter than 46cqi is wide, and the ring would run out of the tile. */
.donut { position: relative; flex: none; inline-size: min(46cqi, 230px); aspect-ratio: 1; max-block-size: 100%; }
.donut svg { display: block; inline-size: 100%; block-size: 100%; }
.arc { fill: var(--c); }
/* The hole's width is 62% of the ring, so the total sits inside it and wraps rather than touching the ring. */
.mid { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 19%; text-align: center; overflow-wrap: anywhere; pointer-events: none; color: var(--ts-ink); }
.none { padding-block: 16px; text-align: center; }
.skm { display: flex; align-items: center; gap: 16px; }
/* Backgrounds are dropped in forced colours, so each mark gets an outline of the user's own colours and the largest one a heavier one. */
@media (forced-colors: active) {
  .track, .bar { border: 1px solid CanvasText; background: ButtonFace; }
  .fill { background: Highlight; }
  .seg { background: ButtonFace; border-inline-end: 2px solid CanvasText; }
  .seg.top { background: Highlight; }
  .sw { border: 1px solid CanvasText; background: ButtonFace; }
  .arc { fill: ButtonFace; stroke: CanvasText; stroke-width: 1px; vector-effect: non-scaling-stroke; }
  .arc.top { fill: Highlight; stroke-width: 2px; }
}
${HIDDEN_CSS}`

const setAttr = (el, name, value) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}
const setVar = (el, name, value) => {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value)
}
const node = (doc, tag, cls) => {
  const el = doc.createElement(tag)
  if (cls) el.setAttribute('class', cls)
  return el
}
const pctWidth = (fraction) => `${Math.round(fraction * 10000) / 100}%`

export class TsBreakdown extends TsWidget {
  static catalogKey = 'breakdown'
  static emptyText = EN['widget.breakdown.empty']
  static dataShape = Object.freeze({
    slices: 'array',
    format: Object.freeze({ kind: 'string', optional: true }),
    decimals: Object.freeze({ kind: 'number', optional: true }),
    unit: Object.freeze({ kind: 'string', optional: true }),
    asOf: Object.freeze({ kind: 'time', optional: true }),
    live: Object.freeze({ kind: 'boolean', optional: true }),
  })

  static styles = STYLES

  static template(variant) {
    return TEMPLATES[variant] || TEMPLATES.Wide
  }

  static skeleton(variant) {
    return SKELETONS[variant] || SKELETONS.Wide
  }

  /** Pure: shares that sum to 100.0%, the folded Other, the arcs and the accessible name. */
  static breakdownModel(data, variant, ctx) {
    return breakdownModel(data, variant, ctx)
  }

  static viewModel(data, variant, ctx) {
    return { ...breakdownModel(data, variant, ctx), label: ctx.label, synced: syncedParts(ctx.t), noRows: ctx.t('widget.breakdown.empty') }
  }

  constructor() {
    super()
    this._legendEl = null
    this._legendRows = null
    this._barEl = null
    this._barRows = null
    this._arcsEl = null
    this._arcRows = null
    this._colours = {}
  }

  viewContext() {
    return { colours: this._colours }
  }

  update(vm, variant) {
    const write = (k, s) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el) setText(el, s)
    }
    const hide = (k, on) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el) el.toggleAttribute('hidden', on)
    }
    hide('dot', !vm.live)
    write('label', vm.label)
    hide('meta', !vm.time)
    write('pre', vm.synced.pre)
    write('time', vm.time)
    write('post', vm.synced.post)
    write('none', vm.noRows)
    // Whatever the size, a set with nothing to draw says so; the (zero) parts still list below, so the legend never contradicts the data.
    hide('none', vm.drawn)
    for (const key of ['bar', 'scroll', 'chart']) this._lift(this.$(`[data-k="${key}"]`), vm.drawn)
    // Handed back to the next model, which keeps each slice's colour and holds near-tied slices in place.
    this._colours = vm.colours

    if (variant === 'S') {
      const top = vm.slices[0]
      const on = vm.drawn
      hide('share', !on)
      hide('bar', !on)
      hide('foot', !on)
      write('share', vm.share)
      write('foot', vm.note || vm.totalText)
      if (on) {
        const bar = this.$('[data-k="bar"]')
        setAttr(bar, 'aria-label', vm.ariaLabel)
        const fill = this.$('[data-k="fill"]')
        setAttr(fill, 'class', `fill c${top.index}`)
        setVar(fill, '--w', pctWidth(top.fraction))
      }
      return
    }

    // The last segment that shows loses its gap line; a hidden zero-share one at the end must not take it.
    const lastShown = vm.slices.reduce((at, s, i) => (s.fraction > 0 ? i : at), -1)
    const rows = vm.slices.map((s, i) => ({ ...s, id: s.key, top: i === 0, last: i === lastShown }))
    this._bind(variant)
    const scroll = this.$('[data-k="scroll"]')
    setAttr(scroll, 'aria-label', vm.label)
    this._legendRows.sync(rows)
    write('note', vm.note)
    hide('note', !vm.note)
    if (this._barRows) {
      this.$('[data-k="bar"]').toggleAttribute('hidden', !vm.drawn)
      setAttr(this.$('[data-k="bar"]'), 'aria-label', vm.ariaLabel)
      this._barRows.sync(rows)
    }
    if (this._arcRows) {
      const chart = this.$('[data-k="chart"]')
      chart.toggleAttribute('hidden', !vm.drawn)
      setAttr(chart, 'aria-label', vm.ariaLabel)
      write('mid', vm.drawn ? vm.totalText : '')
      this._arcRows.sync(vm.arcs.map((a) => ({ ...a, id: a.key, top: a.key === vm.slices[0].key })))
    }
  }

  /** The keyed rows for the containers the template last built. */
  _bind(variant) {
    const doc = this.ownerDocument
    const legend = this.$('[data-k="legend"]')
    if (legend !== this._legendEl) {
      this._legendEl = legend
      this._legendRows = createRows(legend, { create: () => this._createItem(doc), update: (li, row) => this._writeItem(li, row) })
    }
    const bar = variant === 'M' ? null : this.$('[data-k="bar"]')
    if (bar !== this._barEl) {
      this._barEl = bar
      this._barRows = bar ? createRows(bar, { create: () => node(doc, 'span', 'seg'), update: (el, row) => this._writeSeg(el, row) }) : null
    }
    const arcs = variant === 'M' ? this.$('[data-k="arcs"]') : null
    if (arcs !== this._arcsEl) {
      this._arcsEl = arcs
      this._arcRows = arcs ? createRows(arcs, { create: () => doc.createElementNS(SVG_NS, 'path'), update: (el, row) => this._writeArc(el, row) }) : null
    }
  }

  _createItem(doc) {
    const li = doc.createElement('li')
    li.setAttribute('part', 'item')
    const sw = node(doc, 'span', 'sw')
    sw.setAttribute('aria-hidden', 'true')
    li.appendChild(sw)
    li.appendChild(node(doc, 'span', 'nm'))
    li.appendChild(node(doc, 'span', 'pc n'))
    const sub = node(doc, 'span', 'sub sm mut')
    sub.appendChild(node(doc, 'span', 'v n'))
    sub.appendChild(node(doc, 'span', 'nt'))
    li.appendChild(sub)
    return li
  }

  _writeItem(li, row) {
    const [sw, nm, pc, sub] = li.children
    setAttr(sw, 'class', `sw c${row.index}`)
    setText(nm, row.label)
    // A long label ends in an ellipsis on a narrow tile, so its full text is its title.
    setAttr(nm, 'title', row.label)
    setText(pc, row.pct)
    setText(sub.children[0], row.value)
    setText(sub.children[1], row.note)
    sub.toggleAttribute('hidden', !row.value && !row.note)
    // The item reads "Equities, 41.2%" whatever the drawing shows.
    setAttr(li, 'aria-label', row.aria)
  }

  _writeSeg(el, row) {
    setAttr(el, 'class', `seg c${row.index}${row.top ? ' top' : ''}${row.last ? ' last' : ''}`)
    setVar(el, '--w', pctWidth(row.fraction))
    el.toggleAttribute('hidden', row.fraction === 0)
  }

  _writeArc(el, row) {
    setAttr(el, 'class', `arc c${row.index}${row.top ? ' top' : ''}`)
    setAttr(el, 'd', row.d)
  }
}
