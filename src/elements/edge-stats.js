/**
 * <ts-edge-stats>: how a strategy's trades have paid, sizes S · Wide · M (RFC 0003 §21.2, data shape RFC 0001 §8.5.4).
 *
 * S shows the one stat the `stat` attribute names, Wide shows four and M adds the distribution of results as a
 * histogram. `edgeStatsModel` is the pure view model: it formats what `edgeStats()` (or the host's own figures) gave and
 * invents nothing, so a figure that is missing shows as a dash. The element writes text, attributes and one custom
 * property per bar, in place; no markup is built from data.
 */

import { TsWidget, sk, syncedParts, header, arrowFor, figure, FIGURE_CSS } from './widget.js'
import { EN, toNumber, toTime } from '../core/index.js'
import { createRows, setText } from './rows.js'

export const STATS = Object.freeze(['win-rate', 'profit-factor', 'avg-win-loss', 'expectancy'])
const DASH = '—'
const INFINITY = '∞'

const isObj = (v) => v !== null && typeof v === 'object'
const str = (v) => (typeof v === 'string' ? v : '')
// A missing field is not zero.
const numberOf = (v) => (v === undefined || v === null || v === '' ? NaN : toNumber(v))

/** The `stat` attribute's value, or the default for one that names no stat. */
export function normalizeStat(v) {
  return STATS.includes(v) ? v : 'win-rate'
}

// A signed amount's text, the arrow that goes with it and its tone. The arrow is read from the text, so a figure that
// rounds to nothing shows no sign and no arrow.
function signed(n, fmt, chars) {
  if (!Number.isFinite(n)) return { text: DASH, full: DASH, arrow: '', tone: 'mut', num: NaN }
  const full = fmt.money(n, { sign: 'always' })
  // Compact only when the full figure is too long for the cell: a lakh-grouped amount in the hundreds of thousands.
  const text = chars ? fmt.fit(n, chars, { style: 'money', sign: 'always' }) : full
  const arrow = arrowFor(full)
  return { text, full, arrow, tone: arrow === '▲' ? 'pos' : arrow === '▼' ? 'neg' : 'mut', num: n }
}

const plain = (text, num = NaN) => ({ text, full: text, arrow: '', tone: 'mut', num })

/**
 * The figures of each stat: `{ label, main, sub, spoken }`, where `main` and `sub` are `{ text, full, arrow, tone, num }`.
 * `sub` is the second line of a stat (the loss beside the win, "per trade"), or null.
 */
function statCells(s, ctx, variant) {
  const chars = variant === 'S' ? 10 : 9
  const { fmt, t } = ctx
  const rate = numberOf(s.winRate)
  const pf = numberOf(s.profitFactor)
  const win = numberOf(s.avgWin)
  const loss = numberOf(s.avgLoss)
  const exp = numberOf(s.expectancy)
  const trades = numberOf(s.trades)
  const spoken = (name, value) => t('edge.spoken', { name, value })

  // Whole percents read cleaner than "60.0%", a fraction of a percent is kept.
  const rateText = Number.isFinite(rate) ? fmt.percent(rate, { sign: 'negative', decimals: Number.isInteger(Math.round(rate * 1000) / 10) ? 0 : 1 }) : DASH
  const pfText = pf === Infinity ? INFINITY : Number.isFinite(pf) ? fmt.number(pf, { decimals: 2 }) : DASH
  const w = signed(win, fmt, chars)
  const l = signed(loss, fmt, chars)
  const e = signed(exp, fmt, chars)
  const na = t('edge.na')
  const perTrade = plain(t('edge.perTrade'))
  // The count is S's second line; the larger sizes have it in the note under the stats.
  const count = variant === 'S' && Number.isFinite(trades) ? plain(t('edge.trades', {}, trades)) : null

  return {
    'win-rate': { key: 'win-rate', label: t('edge.winRate'), main: plain(rateText, rate), sub: count, spoken: spoken(t('edge.winRate'), Number.isFinite(rate) ? rateText : na) },
    'profit-factor': { key: 'profit-factor', label: t('edge.profitFactor'), main: plain(pfText, pf), sub: count, spoken: spoken(t('edge.profitFactor'), pfText === DASH ? na : pfText) },
    'avg-win-loss': {
      key: 'avg-win-loss',
      label: t('edge.avgWinLoss'),
      main: w,
      sub: l,
      spoken: spoken(t('edge.avgWinLoss'), t('edge.winLoss', { win: Number.isFinite(win) ? w.full : na, loss: Number.isFinite(loss) ? l.full : na })),
    },
    expectancy: { key: 'expectancy', label: t('edge.expectancy'), main: e, sub: perTrade, spoken: spoken(t('edge.expectancy'), Number.isFinite(exp) ? `${e.full} ${t('edge.perTrade')}` : na) },
  }
}

/** The histogram's buckets: a height from the largest count, the sign it is drawn with and its words. */
function distributionModel(list, ctx) {
  const { t } = ctx
  const out = []
  if (Array.isArray(list)) {
    for (const b of list) {
      const count = isObj(b) ? numberOf(b.count) : NaN
      if (!Number.isFinite(count) || count < 0) continue
      out.push({ label: str(b.label), count, loss: b.sign === -1 })
    }
  }
  const max = out.reduce((m, b) => Math.max(m, b.count), 0)
  let profit = 0
  let lossCount = 0
  let peak = null
  for (const b of out) {
    if (b.loss) lossCount += b.count
    else profit += b.count
    if (peak === null || b.count > peak.count) peak = b
  }
  const bars = out.map((b, i) => ({
    id: i,
    label: b.label,
    loss: b.loss,
    zero: b.count === 0,
    // One decimal is a pixel on the tallest bar; the writes are skipped when it did not move.
    h: max > 0 ? Math.round((b.count / max) * 1000) / 10 : 0,
    title: t('edge.bucket', { label: b.label, count: b.count }),
  }))
  let ariaLabel = ''
  if (out.length) {
    ariaLabel = t('edge.dist', { profit: t('edge.trades', {}, profit), loss: t('edge.trades', {}, lossCount) })
    if (peak && peak.count > 0 && peak.label) ariaLabel = t('edge.join', { head: ariaLabel, tail: t('edge.distPeak', { label: peak.label }) })
  }
  return { bars, ariaLabel }
}

/**
 * Pure: data in, strings and flags out. Never throws on partial data: a missing figure is a dash, and a stat that
 * could not be read says "not available" in the tile's name. `ctx.stat` picks the one S shows.
 */
export function edgeStatsModel(data, variant, ctx) {
  const d = isObj(data) ? data : {}
  const { fmt, t } = ctx
  const s = isObj(d.stats) ? d.stats : {}
  const stat = normalizeStat(ctx.stat)
  const all = statCells(s, ctx, variant)
  const keys = variant === 'S' ? [stat] : STATS
  const cells = keys.map((k) => all[k])

  const trades = numberOf(s.trades)
  const scope = str(d.scope)
  const meta = Number.isFinite(trades) ? (scope ? t('edge.meta', { trades: t('edge.trades', {}, trades), scope }) : t('edge.trades', {}, trades)) : scope

  let summary = cells.map((c) => c.spoken).reduce((head, tail) => (head ? t('edge.join', { head, tail }) : tail), '')
  if (meta) summary = t('edge.join', { head: summary, tail: meta })

  const asOf = toTime(d.asOf)
  return {
    ariaLabel: t('edge.aria', { label: ctx.label, summary }),
    label: ctx.label,
    live: d.live === true,
    time: Number.isFinite(asOf) ? fmt.time(asOf) : '',
    synced: syncedParts(t),
    cells,
    meta,
    dist: variant === 'M' ? distributionModel(d.distribution, ctx) : { bars: [], ariaLabel: '' },
    distLabel: t('edge.distribution'),
  }
}

// ── Markup ────────────────────────────────────────────────────────────────

const head = header({ dot: true, meta: true })
const cell = (i) => `<div class="col cell" data-k="c${i}"><span class="lb ell" data-k="l${i}"></span>${figure('n md', `v${i}`)}${figure('n sm sub', `s${i}`)}</div>`
const note = (cls) => `<span class="sm mut ell${cls}" data-k="note"></span>`
const DIST = `<div class="dist" data-k="dist" hidden><span class="lb" data-k="distLb"></span><div class="bars" part="chart" role="img" data-k="bars"></div></div>`

// S has no room for the trade count and scope under its stat (they are in the tile's name), and a narrow Wide drops them too.
const TEMPLATES = {
  S: `${head}
<div class="col one"><span class="lb ell" data-k="l0"></span>${figure('big nv', 'v0', 'value')}${figure('n sm sub', 's0')}</div>`,
  Wide: `${head}
<div class="stats" data-k="stats">${[0, 1, 2, 3].map(cell).join('')}</div>
${note(' wn')}`,
  M: `${head}
<div class="stats" data-k="stats">${[0, 1, 2, 3].map(cell).join('')}</div>
${DIST}
${note('')}`,
}

const SKELETONS = {
  S: `${header()}${sk(40, 9)}${sk(60, 30)}${sk(50, 11)}`,
  Wide: `${header()}<div class="stats">${[0, 1, 2, 3].map(() => `<div class="col">${sk(60, 9)}${sk(80, 13)}</div>`).join('')}</div>`,
  M: `${header()}<div class="stats">${[0, 1, 2, 3].map(() => `<div class="col">${sk(60, 9)}${sk(80, 13)}</div>`).join('')}</div><div class="dist"><span class="sk grow"></span></div>${sk(40, 11)}`,
}

const STYLES = `${FIGURE_CSS}
[hidden] { display: none; }
.nv { white-space: nowrap; max-inline-size: 100%; overflow: hidden; text-overflow: clip; unicode-bidi: isolate; }
.big.nv { font-size: min(34px, 15cqi); }
.one { gap: 6px; }
.wn { margin-block-start: auto; }
.sub { font-weight: var(--ts-num-weight-small, 500); color: var(--ts-muted); }
.sub.pos { color: var(--ts-profit); }
.sub.neg { color: var(--ts-loss); }
.sub:empty { display: none; }
/* Four stats share a row when the tile is roomy; a narrow Wide or M tile stacks them two by two, the label above the figure. */
.stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
@container (min-width: 440px) { .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
/* A cell is its own size container (the figure is sized to it), so a query inside it would measure the cell, not the tile:
   the tile's width reaches the cell as custom properties instead. */
.cell { display: var(--cdisp, flex); flex-direction: column; grid-template-columns: auto minmax(0, 1fr); gap: 2px 8px; align-items: var(--calign, stretch); }
.cell > .lb { grid-column: 1 / -1; }
/* The second line gives way (an ellipsis) before the figure does, and a signed one is let into the gap between the cells rather than cut. */
.cell .sub { font-size: 11px; min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell .sub.pos, .cell .sub.neg { overflow: visible; }
@container (max-width: 439px) {
  .stats { --cdisp: grid; --calign: baseline; }
  .wn { display: none; }
}
.dist { flex: 1; min-block-size: 0; display: flex; flex-direction: column; gap: 6px; }
/* The bars read left to right whatever the page's direction: they are a number line, from the worst result to the best. */
.bars { flex: 1; min-block-size: 40px; display: flex; align-items: stretch; gap: 3px; direction: ltr; }
.hb { flex: 1 1 0; min-inline-size: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; }
.hbar { display: block; inline-size: 100%; block-size: calc(var(--h, 0) * 1%); min-block-size: 2px; border-start-start-radius: 2px; border-start-end-radius: 2px; background: var(--ts-profit); }
.hb.zero .hbar { background: var(--ts-line); }
/* A loss is hatched as well as red, so the two sides differ without the colour. */
.hb.loss .hbar { background: repeating-linear-gradient(135deg, var(--ts-loss) 0 2px, color-mix(in srgb, var(--ts-loss) 35%, transparent) 2px 4px); }
.hb.loss.zero .hbar { background: var(--ts-line); }
.hbw { flex: 1; min-block-size: 0; display: flex; align-items: flex-end; }
.hl { font-size: 9px; color: var(--ts-muted); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; unicode-bidi: plaintext; }
@media (forced-colors: active) {
  .hbar { background: CanvasText; forced-color-adjust: none; }
  .hb.loss .hbar { background: ButtonFace; border: 1px dashed CanvasText; }
  .hb.zero .hbar { background: ButtonFace; border: 1px solid CanvasText; }
}
`

const setAttr = (el, name, value) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

export class TsEdgeStats extends TsWidget {
  static catalogKey = 'edgeStats'
  static emptyText = EN['widget.edgeStats.empty']
  static dataShape = Object.freeze({
    stats: 'object',
    scope: Object.freeze({ kind: 'string', optional: true }),
    distribution: Object.freeze({ kind: 'array', optional: true }),
    asOf: Object.freeze({ kind: 'time', optional: true }),
    live: Object.freeze({ kind: 'boolean', optional: true }),
  })

  static styles = STYLES

  static get observedAttributes() {
    return [...super.observedAttributes, 'stat']
  }

  static template(variant) {
    return TEMPLATES[variant] || TEMPLATES.Wide
  }

  static skeleton(variant) {
    return SKELETONS[variant] || SKELETONS.Wide
  }

  /** Pure: data to strings, signs and bar heights. `ctx.stat` is the stat S shows. */
  static edgeStatsModel(data, variant, ctx) {
    return edgeStatsModel(data, variant, ctx)
  }

  static viewModel(data, variant, ctx) {
    return edgeStatsModel(data, variant, ctx)
  }

  /** The stat S shows: 'win-rate' (the default), 'profit-factor', 'avg-win-loss' or 'expectancy'. */
  get stat() {
    return normalizeStat(this.getAttribute('stat'))
  }

  set stat(value) {
    if (value === null || value === undefined || value === '') this.removeAttribute('stat')
    else this.setAttribute('stat', value)
    this.requestRender()
  }

  viewContext() {
    return { stat: this.stat }
  }

  constructor() {
    super()
    this._barsEl = null
    this._bars = null
  }

  connectedCallback() {
    this.upgrade('stat')
    super.connectedCallback()
  }

  update(vm, variant) {
    const write = (k, s) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el) setText(el, s)
      return el
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
    write('note', vm.meta)

    // The tone is the figure's class, so a flash that is running keeps its own (the base puts it back after update()).
    const figureOf = (k, base, f, size) => {
      write(`${k}Ar`, f.arrow)
      write(`${k}V`, f.text)
      const el = this.$(`[data-k="${k}"]`)
      if (el) {
        setAttr(el, 'class', f.tone === 'mut' ? base : `${base} ${f.tone}`)
        const fc = String(size)
        if (size !== undefined && el.style.getPropertyValue('--fc') !== fc) el.style.setProperty('--fc', fc)
      }
    }
    vm.cells.forEach((c, i) => {
      write(`l${i}`, c.label)
      figureOf(`v${i}`, variant === 'S' ? 'big nv' : 'n md', c.main, c.main.text.length)
      if (c.sub) figureOf(`s${i}`, 'n sm sub', c.sub)
      else figureOf(`s${i}`, 'n sm sub', { arrow: '', text: '', tone: 'mut' })
      // The stat's own name keys the flash, so a switch of the `stat` attribute is not a tick.
      const fig = this.$(`[data-k="v${i}"]`)
      if (fig) setAttr(fig, 'data-flash', c.key)
      this.flash(c.key, c.main.num, { goodWhen: 'up' })
    })
    if (variant !== 'M') return

    write('distLb', vm.distLabel)
    hide('dist', vm.dist.bars.length === 0)
    const bars = this.$('[data-k="bars"]')
    setAttr(bars, 'aria-label', vm.dist.ariaLabel)
    this._bind(bars)
    this._bars.sync(vm.dist.bars)
  }

  /** The keyed bars for the box the template last built. */
  _bind(box) {
    if (box === this._barsEl) return
    this._barsEl = box
    const doc = this.ownerDocument
    this._bars = createRows(box, {
      create: () => {
        const b = doc.createElement('span')
        b.setAttribute('class', 'hb')
        const wrap = doc.createElement('span')
        wrap.setAttribute('class', 'hbw')
        const bar = doc.createElement('span')
        bar.setAttribute('class', 'hbar')
        wrap.appendChild(bar)
        b.appendChild(wrap)
        const label = doc.createElement('span')
        label.setAttribute('class', 'hl')
        b.appendChild(label)
        return b
      },
      update: (b, bar) => {
        setAttr(b, 'class', `hb${bar.loss ? ' loss' : ''}${bar.zero ? ' zero' : ''}`)
        setAttr(b, 'title', bar.title)
        const fill = b.firstChild.firstChild
        const h = String(bar.h)
        if (fill.style.getPropertyValue('--h') !== h) fill.style.setProperty('--h', h)
        setText(b.lastChild, bar.label)
      },
    })
  }
}
