/**
 * <ts-metric>: a KPI tile with its change, trend and target, sizes S · Wide · M
 * (RFC 0002 §3.2).
 *
 * `metricModel` is the pure view model; the class is only the templates and a
 * thin update() that writes text and attributes, so live numbers change in
 * place. Nothing is computed from the host's other figures except what the
 * RFC names: the delta from `previous`, and the target bar from `target`.
 *
 * One delta is shown, the percentage when it is known and else the absolute
 * change, so a tile never says "+130 (+12%)" in one size and "+12%" in another.
 */

import { TsWidget, sk, syncedParts } from './widget.js'
import { linePaths } from './chart.js'
import { EN, toNumber, toTime } from '../core/index.js'

// Characters the S headline holds before fmt.fit() switches it to the compact
// form. Sized for the 34px figure in a tile that never resizes.
export const HEADLINE_CHARS = Object.freeze({ S: 10 })

// The sparkline's drawing box. It is stretched to the tile, so only the
// aspect of the numbers matters.
export const SPARK_BOX = Object.freeze({ width: 240, height: 80 })
const PAD = 4

const MINUS = '−'
const UP = '▲'
const DOWN = '▼'

const round = (v) => Math.round(v * 10) / 10
const isObj = (v) => v !== null && typeof v === 'object'
const str = (v) => (typeof v === 'string' ? v : '')

/**
 * The series as chart points and how many entries couldn't be read. A plain
 * number is spaced evenly; a { t, v } point is placed by its time (seconds,
 * ms, ISO string or Date) and sorted, because a line drawn through unsorted
 * points doubles back on itself. In a mix, only the timed points can be placed.
 */
function seriesPoints(series, scale) {
  if (!Array.isArray(series)) return { pts: [], dropped: 0 }
  const timed = []
  const plain = []
  let dropped = 0
  for (const item of series) {
    if (isObj(item) && !(typeof item.toNumber === 'function')) {
      const t = toTime(item.t)
      const v = toNumber(item.v) / scale
      if (Number.isFinite(t) && Number.isFinite(v)) timed.push({ x: t, y: v })
      else dropped++
    } else {
      const v = toNumber(item) / scale
      if (Number.isFinite(v)) plain.push({ x: plain.length, y: v })
      else dropped++
    }
  }
  if (timed.length) return { pts: timed.sort((a, b) => a.x - b.x), dropped: dropped + plain.length }
  return { pts: plain, dropped }
}

/**
 * Everything the tile shows, as strings. Never throws on partial data: a
 * missing or garbled field shows as a dash or is left out.
 */
export function metricModel(data, variant, ctx) {
  const { fmt, t } = ctx
  const d = isObj(data) ? data : {}
  const format = ['money', 'percent', 'duration'].includes(d.format) ? d.format : 'number'
  const decimals = Number.isInteger(d.decimals) && d.decimals >= 0 && d.decimals <= 20 ? d.decimals : undefined
  const unit = str(d.unit)
  const compact = d.compact === true
  // Percent points (0-100) are brought to the fraction the formatter takes.
  const scale = format === 'percent' && d.percentPoints === true ? 100 : 1

  // '+' for a rise on the formats that don't sign themselves, but never on a
  // figure that rounds to zero ("+0").
  const plus = (s, n) => (n > 0 && /[1-9]/.test(s) && s[0] !== '+' ? `+${s}` : s)

  // One number in the tile's format. sign 'always' is for deltas.
  const show = (n, sign, compactForm) => {
    const o = { sign, decimals, compact: compactForm }
    switch (format) {
      case 'money':
        return fmt.money(n, o)
      case 'percent':
        return fmt.percent(n, o)
      case 'duration': {
        const s = fmt.duration(Math.abs(n))
        return Number.isFinite(n) && n < 0 ? `${MINUS}${s}` : sign === 'always' ? plus(s, n) : s
      }
      default: {
        const s = unit ? fmt.unit(n, unit, o) : fmt.number(n, { ...o, sign: 'negative' })
        return sign === 'always' ? plus(s, n) : s
      }
    }
  }

  const value = toNumber(d.value) / scale
  const known = Number.isFinite(value)

  // The headline: compact everywhere when asked, else full, and at S through
  // fmt.fit so a long figure goes compact while the tile stays its size.
  let headline = '—'
  let spoken = ''
  if (known) {
    spoken = show(value, 'negative', compact)
    headline = spoken
    if (variant === 'S' && !compact) {
      if (format === 'money' || format === 'percent' || (format === 'number' && !unit)) {
        headline = fmt.fit(value, HEADLINE_CHARS.S, { style: format, decimals, sign: 'negative' })
        // The spoken name keeps the full form unless the tile itself went compact.
        spoken = show(value, 'negative', false)
      } else if (headline.length > HEADLINE_CHARS.S) {
        const short = show(value, 'negative', true)
        if (short.length < headline.length) headline = short
      }
    }
  }

  // The delta: given, else from previous. deltaPct is always a fraction.
  const previous = toNumber(d.previous) / scale
  const givenAbs = toNumber(d.delta) / scale
  let abs = Number.isFinite(givenAbs) ? givenAbs : known && Number.isFinite(previous) ? value - previous : NaN
  let pct = toNumber(d.deltaPct)
  if (!Number.isFinite(pct)) {
    // A zero previous has no percentage; dividing would show an infinity.
    pct = Number.isFinite(abs) && Number.isFinite(previous) && previous !== 0 ? abs / Math.abs(previous) : NaN
  }

  let delta = ''
  let spokenDelta = ''
  let basis = NaN
  if (Number.isFinite(pct)) {
    basis = pct
    // Big moves read as whole percents ("+12%"), small ones keep a decimal.
    const dp = Math.abs(pct) >= 0.1 || pct === 0 ? 0 : 1
    delta = fmt.percent(pct, { sign: 'always', decimals: dp })
    spokenDelta = fmt.percent(Math.abs(pct), { sign: 'negative', decimals: dp })
  } else if (Number.isFinite(abs)) {
    basis = abs
    delta = show(abs, 'always', compact)
    spokenDelta = show(Math.abs(abs), 'negative', compact)
  }

  // The direction comes from the text, so a change that rounds to nothing
  // shows no sign and no arrow rather than a '+0%' with a rise beside it.
  const rise = delta.startsWith('+')
  const fall = delta.startsWith(MINUS)
  const arrow = rise ? UP : fall ? DOWN : ''
  let tone = 'mut'
  const goodWhen = d.goodWhen === 'down' || d.goodWhen === 'neither' ? d.goodWhen : 'up'
  if (goodWhen !== 'neither' && (rise || fall)) tone = rise === (goodWhen === 'up') ? 'pos' : 'neg'

  const compare = str(d.compareLabel)
  const label = ctx.label
  let ariaLabel = known ? `${label}, ${spoken}` : label
  if (known && delta) {
    const how = rise ? t('metric.up', { delta: spokenDelta }) : fall ? t('metric.down', { delta: spokenDelta }) : t('metric.unchanged')
    ariaLabel += `, ${how}${compare ? ` ${compare}` : ''}`
  }

  const vm = {
    ariaLabel,
    label,
    live: d.live === true,
    time: '',
    synced: syncedParts(t),
    value: headline,
    delta,
    arrow,
    tone,
    compare,
    line: '',
    area: '',
    sparkLabel: '',
    targetPct: '',
    targetWidth: 0,
    caption: '',
    dropped: 0,
  }
  const asOf = toTime(d.asOf)
  if (Number.isFinite(asOf)) vm.time = fmt.time(asOf)

  if (variant === 'Wide' || variant === 'M') {
    const { pts, dropped } = seriesPoints(d.series, scale)
    vm.dropped = dropped
    // One reading is not a trend; no line is better than one implying it.
    if (pts.length >= 2) {
      const { line, x, y } = linePaths(pts, { ...SPARK_BOX, pad: PAD, includeZero: false })
      // The fill runs to the bottom edge whatever the sign of the values:
      // a sparkline shows shape, not distance from zero.
      const floor = SPARK_BOX.height - PAD
      vm.line = line
      vm.area = `${line} L${round(x(pts[pts.length - 1].x))} ${floor} L${round(x(pts[0].x))} ${floor} Z`
      vm.sparkLabel = t('metric.trend', { label, from: show(pts[0].y, 'negative', compact), to: show(pts[pts.length - 1].y, 'negative', compact) })
    }
  }

  if (variant === 'M') {
    vm.caption = str(d.caption)
    const target = toNumber(d.target) / scale
    if (known && Number.isFinite(target) && target > 0) {
      const ratio = value / target
      // The text is the honest figure; only the bar is held to its track.
      vm.targetPct = fmt.percent(ratio, { sign: 'negative', decimals: 0 })
      vm.targetWidth = Math.round(Math.min(1, Math.max(0, ratio)) * 1000) / 1000
    }
  }
  return vm
}

const delta = `<span class="delta" data-k="deltabox" hidden><span class="n" data-k="change"><span aria-hidden="true" data-k="arrow"></span> <span class="nv" data-k="delta"></span></span><span class="mut ell" data-k="compare"></span></span>`
const dot = '<span class="dot live" data-k="dot" hidden></span>'
const head = `<div class="hd">${dot}<span class="lb ell" data-k="label"></span><span class="f1"></span><span class="sm mut n meta" data-k="meta" hidden><span class="pre" data-k="pre"></span><span data-k="time"></span><span class="pre" data-k="post"></span></span></div>`
const spark = (cls) => `
<div class="${cls}"><svg viewBox="0 0 ${SPARK_BOX.width} ${SPARK_BOX.height}" preserveAspectRatio="none" role="img" data-k="spark" hidden>
  <path class="sa" data-k="area"></path><path class="sl" data-k="line"></path>
</svg></div>`

// Variant markup is static; update() fills it.
const TEMPLATES = {
  S: `${head}
<span class="big nv" data-k="value"></span>
<span class="f1"></span>
${delta}`,
  Wide: `
<div class="cols">
  <div class="col lhs">${head}<span class="xbig nv" data-k="value"></span>${delta}</div>
  ${spark('rhs')}
</div>`,
  M: `${head}
<div class="rowb wrap"><span class="xbig nv" data-k="value"></span>${delta}</div>
${spark('plot')}
<div class="target" data-k="target" hidden>
  <div class="rowb"><span class="lb f1" data-k="lbTarget"></span><span class="sm n" data-k="tpct"></span></div>
  <div class="tbar" aria-hidden="true"><svg viewBox="0 0 100 6" preserveAspectRatio="none"><rect class="fill" data-k="fill" x="0" y="0" width="0" height="6"></rect></svg></div>
</div>
<span class="sm mut ell" data-k="caption"></span>`,
}

// Loading shapes follow each size's layout block for block, so the figures
// land where the blocks were.
const SKELETONS = {
  S: `<div class="hd"><span class="lb ell" data-k="label"></span></div>${sk(60, 30)}<span class="f1"></span>${sk(70, 11)}`,
  Wide: `<div class="cols">
  <div class="col lhs"><div class="hd"><span class="lb ell" data-k="label"></span></div>${sk(70, 44)}${sk(85, 11)}</div>
  <div class="rhs"><span class="sk grow"></span></div>
</div>`,
  M: `<div class="hd"><span class="lb ell" data-k="label"></span></div>
<div class="rowb wrap">${sk(35, 44)}${sk(40, 11)}</div>
<div class="plot"><span class="sk grow"></span></div>
<div class="target"><div class="rowb">${sk(20, 9)}<span class="f1"></span>${sk(30, 11)}</div>${sk(100, 6)}</div>
${sk(65, 11)}`,
}

export class TsMetric extends TsWidget {
  static catalogKey = 'metric'
  static emptyText = EN['widget.metric.empty']
  // value is the one required key: a tile without it has nothing to say, and
  // naming it is what lets a wrong-shape object be explained (RFC 0002 §2.7).
  static dataShape = {
    value: 'numeric',
    format: { kind: 'string', optional: true },
    decimals: { kind: 'number', optional: true },
    unit: { kind: 'string', optional: true },
    compact: { kind: 'boolean', optional: true },
    percentPoints: { kind: 'boolean', optional: true },
    previous: { kind: 'numeric', optional: true },
    delta: { kind: 'numeric', optional: true },
    deltaPct: { kind: 'numeric', optional: true },
    compareLabel: { kind: 'string', optional: true },
    goodWhen: { kind: 'string', optional: true },
    series: { kind: 'array', optional: true },
    target: { kind: 'numeric', optional: true },
    caption: { kind: 'string', optional: true },
    asOf: { kind: 'time', optional: true },
    live: { kind: 'boolean', optional: true },
  }

  static styles = `
[hidden] { display: none; }
/* Figures keep their sign beside their digits in right-to-left pages, and a
   value too wide for its slot clips rather than running into its neighbour. */
.nv { white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: clip; unicode-bidi: isolate; }
.n { unicode-bidi: isolate; }
/* On a tile narrower than 200px the meta says '14:05', so the label keeps its room. */
.meta { flex: none; white-space: nowrap; }
@container (max-width: 200px) { .pre { display: none; } }
.delta { display: flex; align-items: baseline; gap: 6px; min-width: 0; white-space: nowrap; font-size: 12px; }
.delta .n { font-weight: var(--ts-num-weight-small, 500); flex: none; }
.wrap { flex-wrap: wrap; gap: 2px 20px; }
.cols { flex: 1; display: flex; gap: 24px; min-height: 0; }
.lhs { flex: 1.1; min-width: 0; justify-content: space-between; }
.rhs { flex: 1; min-width: 0; position: relative; }
@container (max-width: 420px) { .cols { gap: 12px; } .lhs { flex: 1.3; } }
.plot { flex: 1; min-height: 0; position: relative; }
.rhs svg, .plot svg { position: absolute; inset: 0; width: 100%; height: 100%; direction: ltr; }
.sl { fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.sa { fill: currentColor; fill-opacity: .12; stroke: none; }
svg.pos { color: var(--ts-profit); }
svg.neg { color: var(--ts-loss); }
svg.mut { color: var(--ts-muted); }
.target { display: flex; flex-direction: column; gap: 6px; }
.tbar { height: 6px; border-radius: 3px; background: var(--ts-surface-2); overflow: hidden; }
.tbar svg { display: block; width: 100%; height: 100%; }
.fill { fill: var(--ts-accent); }
`

  static template(variant) {
    return TEMPLATES[variant] || TEMPLATES.Wide
  }

  static skeleton(variant) {
    return SKELETONS[variant] || SKELETONS.Wide
  }

  static metricModel(data, variant, ctx) {
    return metricModel(data, variant, ctx)
  }

  static viewModel(data, variant, ctx) {
    return metricModel(data, variant, ctx)
  }

  update(vm, variant) {
    // Each write is skipped when it would change nothing, so a tick that
    // moves one figure touches one node.
    const text = (k, s) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el && el.textContent !== s) el.textContent = s
      return el
    }
    const attr = (el, name, v) => {
      if (el && el.getAttribute(name) !== v) el.setAttribute(name, v)
    }
    this.$('[data-k="dot"]').toggleAttribute('hidden', !vm.live)
    text('label', vm.label)
    this.$('[data-k="meta"]').toggleAttribute('hidden', !vm.time)
    text('pre', vm.synced.pre)
    text('time', vm.time)
    text('post', vm.synced.post)
    text('value', vm.value)

    const box = this.$('[data-k="deltabox"]')
    box.toggleAttribute('hidden', !vm.delta)
    text('arrow', vm.arrow)
    attr(this.$('[data-k="change"]'), 'class', `n ${vm.tone}`)
    text('delta', vm.delta)
    text('compare', vm.compare)

    if (variant === 'S') return

    const svg = this.$('[data-k="spark"]')
    svg.toggleAttribute('hidden', !vm.line)
    attr(svg, 'class', vm.tone)
    attr(svg, 'aria-label', vm.sparkLabel)
    attr(this.$('[data-k="line"]'), 'd', vm.line)
    attr(this.$('[data-k="area"]'), 'd', vm.area)

    if (variant !== 'M') return
    this.$('[data-k="target"]').toggleAttribute('hidden', !vm.targetPct)
    text('lbTarget', this.t('metric.target'))
    text('tpct', vm.targetPct)
    attr(this.$('[data-k="fill"]'), 'width', String(Math.round(vm.targetWidth * 100 * 10) / 10))
    text('caption', vm.caption)
  }
}
