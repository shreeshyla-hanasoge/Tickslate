/**
 * <ts-watchlist>: the instruments you follow, each with its last price, its
 * signed change and where the price sits in the day's range, sizes S · Tall · M
 * (RFC 0003 §21.3, data shape RFC 0001 §8.5.7).
 *
 * `watchlistModel` is the pure view model. The element draws a real <table>
 * whose bodies, one per instrument, are keyed (rows.js): a tick changes the
 * text of the cells that moved and nothing else, so focus and the scroll
 * position stay where they are. Each body holds the instrument's row and, under
 * it, the day-range bar. All text is set with textContent; no markup is built
 * from data.
 */

import { TsWidget, sk, syncedParts, header, arrowFor } from './widget.js'
import { EN, toTime } from '../core/index.js'
import { createRows, setText } from './rows.js'
import { readItems, numberOf, decimalsOf, barPosition, sparkModel, createBar, writeBar, createSpark, writeSpark, PARTS_CSS, HIDDEN_CSS } from './list-parts.js'

const ACTION_ADD = 'add-instrument'

const isObj = (v) => v !== null && typeof v === 'object'
const text = (v) => (typeof v === 'string' ? v : '')

/**
 * `change` and `changePct` as given, else from `prevClose`. A change that is
 * given is never recomputed, and `changePct` is a fraction (0.027 is +2.70%).
 */
function changeOf(i, ltp) {
  const prev = numberOf(i.prevClose)
  const given = numberOf(i.change)
  const change = Number.isFinite(given) ? given : Number.isFinite(ltp) && Number.isFinite(prev) ? ltp - prev : NaN
  const givenPct = numberOf(i.changePct)
  // A zero previous close has no percentage; dividing would show an infinity.
  const pct = Number.isFinite(givenPct) ? givenPct : Number.isFinite(change) && Number.isFinite(prev) && prev !== 0 ? change / Math.abs(prev) : NaN
  return { change, pct }
}

function instrumentRow(i, variant, ctx) {
  const { fmt, t } = ctx
  const dp = decimalsOf(i.decimals)
  const ltp = numberOf(i.ltp)
  const { change, pct } = changeOf(i, ltp)
  const symbol = text(i.symbol) || String(i.id)

  const changeText = Number.isFinite(change) ? fmt.number(change, { decimals: dp === undefined ? 2 : dp, sign: 'always' }) : ''
  const pctText = Number.isFinite(pct) ? fmt.percent(pct, { sign: 'always', decimals: 2 }) : ''
  // The direction is read from what the reader sees, so a change that rounds to nothing shows no sign and no arrow.
  const arrow = arrowFor(changeText) || arrowFor(pctText)

  // The day-range bar needs both ends, and a range read backwards is not one.
  const low = numberOf(i.dayLow)
  const high = numberOf(i.dayHigh)
  let bar = null
  if (Number.isFinite(low) && Number.isFinite(high) && low <= high) {
    const price = (v) => fmt.price(v, { decimals: dp })
    const now = barPosition(ltp, low, high)
    bar = {
      now: Number.isFinite(now) ? now : null,
      label: Number.isFinite(ltp) ? t('watchlist.range', { low: price(low), high: price(high), now: price(ltp) }) : t('watchlist.rangeOnly', { low: price(low), high: price(high) }),
    }
  }

  let spark = null
  if (variant === 'M') {
    const s = sparkModel(i.ticks)
    if (s) {
      const price = (v) => fmt.price(v, { decimals: dp })
      spark = {
        line: s.line,
        label: t('watchlist.trend', { name: symbol, from: price(s.first), to: price(s.last) }),
        tone: s.last > s.first ? 'pos' : s.last < s.first ? 'neg' : 'mut',
      }
    }
  }

  return {
    id: i.id,
    symbol,
    exchange: text(i.exchange),
    last: fmt.price(ltp, { decimals: dp }),
    change: changeText,
    pct: pctText,
    arrow,
    tone: arrow === '▲' ? 'pos' : arrow === '▼' ? 'neg' : 'mut',
    bar,
    spark,
  }
}

/**
 * Pure: data in, strings and flags out. Never throws on partial data: a missing
 * field is left out, and a price that can't be read shows as a dash. S shows the
 * first instrument that can be read; Tall and M show them all.
 */
export function watchlistModel(data, variant, ctx) {
  const d = isObj(data) ? data : {}
  const { fmt, t } = ctx
  const { out, dropped } = readItems(d.instruments)
  const rows = (variant === 'S' ? out.slice(0, 1) : out).map((i) => instrumentRow(i, variant, ctx))

  let summary = t('watchlist.aria', { label: ctx.label, instruments: t('watchlist.instruments', {}, out.length) })
  if (variant === 'S' && out.length > 1) summary = t('watchlist.join', { head: summary, tail: t('watchlist.firstOnly') })

  const asOf = toTime(d.asOf)
  return {
    ariaLabel: summary,
    rows,
    total: out.length,
    dropped,
    live: d.live === true,
    time: Number.isFinite(asOf) ? fmt.time(asOf) : '',
  }
}

// ── Markup ────────────────────────────────────────────────────────────────

// Static: the header cells say what a column is for a screen reader, in a row that takes no room. The words are
// written by update(). M adds the trend column in front of the price.
const head = (k, cls = '') => `<th scope="col"${cls}><span class="visually-hidden" data-k="${k}"></span></th>`
const heads = (trend) => `${head('h0')}${trend ? head('h1', ' class="sp"') : ''}${head(`h${trend ? 2 : 1}`)}`

// The add button ends the header, after the synced time: a tile as short as S has no room for a row of its own under the list.
const ADD = '<button type="button" class="btn add" data-k="add" hidden><span aria-hidden="true">+</span></button>'
const HEAD = header({ dot: true, meta: true }).replace(/<\/div>$/, `${ADD}</div>`)

const template = (trend) => `
${HEAD}
<div class="scroll" data-k="scroll" role="group" tabindex="0">
<table part="table" data-k="table">
<caption class="visually-hidden" data-k="caption"></caption>
<thead><tr>${heads(trend)}</tr></thead>
</table>
<div class="none mut" data-k="none" hidden></div>
</div>
`

const TEMPLATES = { S: template(false), Tall: template(false), M: template(true) }

const SKELETON_ROW = `<div class="skrow"><div class="col">${sk(60, 12)}${sk(30, 9)}</div><div class="col skr">${sk(70, 12)}${sk(50, 9)}</div></div>`
const SKELETONS = {
  S: `${header()}${SKELETON_ROW}${sk(100, 6)}`,
  Tall: `${header()}${SKELETON_ROW}${sk(100, 6)}${SKELETON_ROW}${sk(100, 6)}${SKELETON_ROW}${sk(100, 6)}`,
  M: `${header()}${SKELETON_ROW}${sk(100, 6)}${SKELETON_ROW}${sk(100, 6)}${SKELETON_ROW}${sk(100, 6)}`,
}

const STYLES = `
${PARTS_CSS}
.scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; overscroll-behavior: contain; }
.scroll:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
table { inline-size: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--ts-text-md, max(12px, .75rem)); }
/* The header row is for a screen reader: its cells take no room, and their words are visually hidden. */
thead th { padding: 0; border: 0; block-size: 0; line-height: 0; overflow: hidden; }
th, td { box-sizing: border-box; padding: 7px 0 3px; text-align: start; vertical-align: top; font-weight: inherit; }
/* The bar's row closes the instrument, so the rule under it is the instrument's. */
.br > td { padding: 2px 6px 9px; border-block-end: 1px solid var(--ts-line); }
tbody:last-of-type .br > td { border-block-end: 0; padding-block-end: 2px; }
.id { max-inline-size: 0; inline-size: 100%; overflow: hidden; }
.sym { display: block; unicode-bidi: isolate; font-size: var(--ts-text-base, max(13px, .8125rem)); font-weight: 600; color: var(--ts-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ex { display: block; unicode-bidi: isolate; font-size: var(--ts-text-xs, max(10px, .625rem)); color: var(--ts-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ex:empty { display: none; }
.fig { inline-size: 1%; padding-inline-start: 10px; text-align: end; white-space: nowrap; }
.last { display: block; font-size: var(--ts-text-base, max(13px, .8125rem)); }
.chg { display: flex; justify-content: flex-end; column-gap: 6px; font-size: var(--ts-text-sm, max(11px, .6875rem)); }
/* On a narrow tile the percent drops under the change rather than squeezing the symbol. */
@container (max-width: 230px) { .chg { flex-wrap: wrap; } }
.chg > * { white-space: nowrap; }
.chg .abs:empty, .chg .pct:empty { display: none; }
.add { display: inline-flex; align-items: center; justify-content: center; min-inline-size: 28px; padding: 0; font-size: var(--ts-text-xl, max(16px, 1rem)); line-height: 1; }
@media (pointer: coarse) { .add { min-inline-size: 44px; min-block-size: 44px; } }
.skrow { display: flex; justify-content: space-between; gap: 10px; }
.skr { align-items: flex-end; }
.none { padding-block: 16px; text-align: center; }
@container (max-width: 200px) { .tile[data-add] .meta { display: none; } }
${HIDDEN_CSS}`

const setAttr = (el, name, value) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

export class TsWatchlist extends TsWidget {
  static catalogKey = 'watchlist'
  static emptyText = EN['widget.watchlist.empty']
  static dataShape = Object.freeze({
    instruments: 'array',
    asOf: Object.freeze({ kind: 'time', optional: true }),
    live: Object.freeze({ kind: 'boolean', optional: true }),
  })

  static styles = STYLES

  static template(variant) {
    return TEMPLATES[variant] || TEMPLATES.Tall
  }

  static skeleton(variant) {
    return SKELETONS[variant] || SKELETONS.Tall
  }

  /** Pure: data to strings, signs, bar marks and the accessible name. */
  static watchlistModel(data, variant, ctx) {
    return watchlistModel(data, variant, ctx)
  }

  // The tile is named by its label alone and the caption carries the summary, so a screen reader does not hear it twice.
  static viewModel(data, variant, ctx) {
    const vm = watchlistModel(data, variant, ctx)
    return {
      ...vm,
      summary: vm.ariaLabel,
      ariaLabel: ctx.label,
      label: ctx.label,
      synced: syncedParts(ctx.t),
      noRows: ctx.t('widget.watchlist.empty'),
    }
  }

  constructor() {
    super()
    this._tableEl = null
    this._rows = null
    this._cols = 2

    this._section.addEventListener('click', (e) => {
      const add = e.target?.closest?.('.add')
      if (!add) return
      if (this._isEditing()) {
        e.preventDefault?.()
        e.stopPropagation?.()
        return
      }
      if (this.actionEnabled(ACTION_ADD)) {
        e.preventDefault?.()
        this.emit(ACTION_ADD)
      }
    })
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
    write('caption', vm.summary)
    const trend = variant === 'M'
    write('h0', this.t('watchlist.col.instrument'))
    if (trend) write('h1', this.t('watchlist.col.trend'))
    write(`h${trend ? 2 : 1}`, this.t('watchlist.col.price'))
    setAttr(this.$('[data-k="scroll"]'), 'aria-label', this.t('watchlist.region', { label: vm.label }))
    write('none', vm.noRows)
    hide('none', vm.rows.length > 0)
    const add = this.$('[data-k="add"]')
    const canAdd = this.actionEnabled(ACTION_ADD)
    add.toggleAttribute('hidden', !canAdd)
    // A narrow tile drops the synced time to keep the label beside the button (see the container rule).
    this._section.toggleAttribute('data-add', canAdd)
    setAttr(add, 'aria-label', this.t('watchlist.add'))
    setAttr(add, 'title', this.t('watchlist.add'))

    this._cols = trend ? 3 : 2
    this._bind()
    this._rows.sync(vm.rows)
  }

  /** The keyed bodies for the table the template last built. */
  _bind() {
    const table = this.$('[data-k="table"]')
    if (table === this._tableEl) return
    this._tableEl = table
    const doc = this.ownerDocument
    this._rows = createRows(table, {
      create: () => this._createRow(doc),
      update: (tb, row) => this._writeRow(tb, row, doc),
    })
  }

  _createRow(doc) {
    const tbody = doc.createElement('tbody')
    tbody.setAttribute('part', 'row')
    const tr = doc.createElement('tr')
    const th = doc.createElement('th')
    th.setAttribute('scope', 'row')
    th.setAttribute('class', 'id')
    th.setAttribute('part', 'cell')
    for (const cls of ['sym', 'ex']) {
      const line = doc.createElement('span')
      line.setAttribute('class', cls)
      th.appendChild(line)
    }
    tr.appendChild(th)
    if (this._cols === 3) {
      const sp = doc.createElement('td')
      sp.setAttribute('class', 'sp')
      sp.setAttribute('part', 'cell')
      sp.appendChild(createSpark(doc))
      tr.appendChild(sp)
    }
    const fig = doc.createElement('td')
    fig.setAttribute('class', 'fig n')
    fig.setAttribute('part', 'cell')
    const last = doc.createElement('span')
    last.setAttribute('class', 'last')
    fig.appendChild(last)
    const chg = doc.createElement('span')
    chg.setAttribute('class', 'chg n')
    const ar = doc.createElement('span')
    ar.setAttribute('class', 'ar')
    ar.setAttribute('aria-hidden', 'true')
    chg.appendChild(ar)
    for (const cls of ['abs', 'pct']) {
      const part = doc.createElement('span')
      part.setAttribute('class', cls)
      chg.appendChild(part)
    }
    fig.appendChild(chg)
    tr.appendChild(fig)
    tbody.appendChild(tr)

    const br = doc.createElement('tr')
    br.setAttribute('class', 'br')
    const td = doc.createElement('td')
    td.setAttribute('colspan', String(this._cols))
    td.appendChild(createBar(doc, 'day'))
    br.appendChild(td)
    tbody.appendChild(br)
    return tbody
  }

  _writeRow(tbody, row) {
    const tr = tbody.firstChild
    const th = tr.firstChild
    setText(th.children[0], row.symbol)
    // A long symbol ends in an ellipsis on a narrow tile, so its full text is its title.
    setAttr(th.children[0], 'title', row.symbol)
    setText(th.children[1], row.exchange)
    if (this._cols === 3) writeSpark(tr.children[1].firstChild, row.spark)
    const fig = tr.lastChild
    setText(fig.children[0], row.last)
    const chg = fig.children[1]
    setAttr(chg, 'class', `chg n${row.tone === 'mut' ? '' : ` ${row.tone}`}`)
    setText(chg.children[0], row.arrow)
    setText(chg.children[1], row.change)
    setText(chg.children[2], row.pct)

    const bar = tbody.lastChild.firstChild.firstChild
    bar.toggleAttribute('hidden', !row.bar)
    if (row.bar) writeBar(bar, 'day', { now: row.bar.now }, row.bar.label)
  }
}
