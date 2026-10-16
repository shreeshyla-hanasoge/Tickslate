/**
 * <ts-open-positions>: the positions that are open now, each with its last
 * price, its signed profit or loss and, from M up, a bar from its stop to its
 * target, sizes Wide · M · L (RFC 0003 §21.3, data shape RFC 0001 §8.5.6).
 *
 * `positionsModel` is the pure view model. The element draws a real <table>
 * whose bodies, one per position, are keyed (rows.js): a tick changes the text
 * of the cells that moved and the one custom property that places the price on
 * the bar, and nothing else, so focus and the scroll position stay where they
 * are. All text is set with textContent; no markup is built from data.
 */

import { TsWidget, sk, syncedParts, header, arrowFor } from './widget.js'
import { EN, toTime } from '../core/index.js'
import { createRows, setText } from './rows.js'
import { readItems, numberOf, barPosition, sparkModel, createBar, writeBar, createSpark, writeSpark, PARTS_CSS, HIDDEN_CSS } from './list-parts.js'

const ACTION_EXIT = 'exit-position'
const ACTION_EXIT_ALL = 'exit-all'

const isObj = (v) => v !== null && typeof v === 'object'
const text = (v) => (typeof v === 'string' ? v : '')

function positionRow(p, variant, ctx) {
  const { fmt, t } = ctx
  const price = (v) => fmt.price(v)
  const name = text(p.instrument) || String(p.id)
  const side = p.side === 'long' || p.side === 'short' ? p.side : ''
  const qty = numberOf(p.quantity)
  const entry = numberOf(p.entryPrice)
  const ltp = numberOf(p.ltp)

  const qtyText = Number.isFinite(qty) ? fmt.number(qty) : ''
  const pnlText = fmt.money(p.pnl, { sign: 'always' })
  const arrow = arrowFor(pnlText)

  // The bar runs from the stop to the target whatever the side, so a short's runs from its higher price to its lower one.
  // Without both, or with the same price for both, there is no bar and nothing is invented.
  const stop = numberOf(p.stop)
  const target = numberOf(p.target)
  let bar = null
  if (Number.isFinite(stop) && Number.isFinite(target) && stop !== target) {
    const at = barPosition(entry, stop, target)
    const now = barPosition(ltp, stop, target)
    let label = t('positions.range', { stop: price(stop), target: price(target) })
    const join = (head, tail) => t('positions.join', { head, tail })
    if (Number.isFinite(entry)) label = join(label, t('positions.rangeEntry', { entry: price(entry) }))
    if (Number.isFinite(ltp)) label = join(label, t('positions.rangeNow', { now: price(ltp) }))
    bar = { entry: Number.isFinite(at) ? at : null, now: Number.isFinite(now) ? now : null, label }
  }

  let spark = null
  if (variant === 'L') {
    const s = sparkModel(p.path)
    if (s) {
      spark = {
        line: s.line,
        label: t('positions.trend', { name, from: price(s.first), to: price(s.last) }),
        tone: s.last > s.first ? 'pos' : s.last < s.first ? 'neg' : 'mut',
      }
    }
  }

  // What the row has no room for, as the row's hover text.
  const lots = numberOf(p.lots)
  const title = [text(p.strategy), text(p.account), Number.isFinite(lots) ? t('positions.lots', {}, lots) : ''].filter(Boolean).join(' · ')

  return {
    id: p.id,
    name,
    title,
    side,
    sideText: side ? t(side === 'long' ? 'positions.long' : 'positions.short') : '',
    detail: !qtyText ? '' : Number.isFinite(entry) ? t('positions.qtyAt', { qty: qtyText, entry: price(entry) }) : qtyText,
    last: price(ltp),
    pnl: pnlText,
    arrow,
    tone: arrow === '▲' ? 'pos' : arrow === '▼' ? 'neg' : 'mut',
    bar,
    spark,
  }
}

/**
 * Pure: data in, strings and flags out. Never throws on partial data: a missing
 * field is left out, and a figure that can't be read shows as a dash. `mtm`
 * is the sum of the positions' `pnl` unless the host gives it.
 */
export function positionsModel(data, variant, ctx) {
  const d = isObj(data) ? data : {}
  const { fmt, t } = ctx
  const { out, dropped } = readItems(d.positions)
  const rows = out.map((p) => positionRow(p, variant, ctx))

  let sum = NaN
  for (const p of out) {
    const v = numberOf(p.pnl)
    if (Number.isFinite(v)) sum = (Number.isFinite(sum) ? sum : 0) + v
  }
  const given = numberOf(d.mtm)
  const total = Number.isFinite(given) ? given : sum
  let mtm = null
  if (Number.isFinite(total)) {
    const textOf = fmt.money(total, { sign: 'always' })
    const arrow = arrowFor(textOf)
    mtm = { text: textOf, arrow, tone: arrow === '▲' ? 'pos' : arrow === '▼' ? 'neg' : 'mut' }
  }
  const margin = numberOf(d.margin)

  const asOf = toTime(d.asOf)
  return {
    ariaLabel: t('positions.aria', { label: ctx.label, positions: t('positions.count', {}, out.length) }),
    rows,
    mtm,
    margin: variant === 'L' && Number.isFinite(margin) ? fmt.money(margin, { sign: 'negative' }) : '',
    dropped,
    live: d.live === true,
    time: Number.isFinite(asOf) ? fmt.time(asOf) : '',
  }
}

// ── Markup ────────────────────────────────────────────────────────────────

const head = (k, hidden = '') => `<th scope="col"${hidden} data-k="${k}c"><span class="visually-hidden" data-k="${k}"></span></th>`

// The header row is for a screen reader: its cells take no room, and update() writes their words. L adds the trend
// column, and the actions column exists only while 'exit-position' is listed.
const template = (variant) => `
${header({ dot: true, meta: true })}
<div class="sum" data-k="sum" hidden>
  <span class="lb" data-k="mtmLabel"></span><span class="n md" data-k="mtmBox"><span class="ar" aria-hidden="true" data-k="mtmAr"></span><span data-k="mtm"></span></span>
  <span class="f1"></span>
  <span class="rowb" data-k="marginBox" hidden><span class="lb" data-k="marginLabel"></span><span class="n sm" data-k="margin"></span></span>
  <button type="button" class="btn exitall" data-k="exitAll" hidden></button>
</div>
<div class="scroll" data-k="scroll" role="group" tabindex="0">
<table part="table" data-k="table">
<caption class="visually-hidden" data-k="caption"></caption>
<thead><tr>${head('h0')}${variant === 'L' ? head('h1') : ''}${head('h2')}${head('h3')}${head('h4', ' hidden')}</tr></thead>
</table>
<div class="none mut" data-k="none" hidden></div>
</div>
`

const TEMPLATES = { Wide: template('Wide'), M: template('M'), L: template('L') }

const SKELETON_ROW = `<div class="skrow"><div class="col">${sk(60, 12)}${sk(40, 9)}</div><div class="col skr">${sk(50, 12)}${sk(60, 12)}</div></div>`
const SKELETONS = {
  Wide: `${header()}${SKELETON_ROW}`,
  M: `${header()}${sk(40, 13)}${SKELETON_ROW}${sk(100, 6)}${SKELETON_ROW}${sk(100, 6)}`,
  L: `${header()}${sk(40, 13)}${SKELETON_ROW}${sk(100, 6)}${SKELETON_ROW}${sk(100, 6)}`,
}

const STYLES = `
${PARTS_CSS}
.sum { display: flex; align-items: center; gap: 8px; min-block-size: 28px; }
.scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; overscroll-behavior: contain; }
.scroll:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
table { inline-size: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
thead th { padding: 0; border: 0; block-size: 0; line-height: 0; overflow: hidden; }
th, td { box-sizing: border-box; padding: 7px 0 5px; text-align: start; vertical-align: top; font-weight: inherit; }
/* Without a bar row, the row itself closes the position. */
tbody > tr:last-child > * { border-block-end: 1px solid var(--ts-line); }
tbody:last-of-type > tr:last-child > * { border-block-end: 0; }
.br > td { padding: 2px 6px 9px; }
tbody:last-of-type .br > td { padding-block-end: 2px; }
.id { max-inline-size: 0; inline-size: 100%; overflow: hidden; }
.sym { display: block; font-size: 13px; font-weight: 600; color: var(--ts-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { display: flex; align-items: baseline; gap: 6px; min-inline-size: 0; font-size: 10px; color: var(--ts-muted); white-space: nowrap; }
.sub > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.side { font-weight: var(--ts-label-weight, 600); text-transform: var(--ts-label-case, uppercase); letter-spacing: var(--ts-label-tracking, .12em); color: var(--ts-ink); }
.side:empty, .sub:empty { display: none; }
.last, .pnl { text-align: end; white-space: nowrap; font-size: 13px; padding-inline-start: 10px; }
.pnl { font-weight: var(--ts-num-weight, 500); }
.act { text-align: end; padding-inline-start: 10px; vertical-align: middle; }
.act .btn { min-block-size: 28px; white-space: nowrap; }
.skrow { display: flex; justify-content: space-between; gap: 10px; }
.skr { align-items: flex-end; }
.none { padding-block: 16px; text-align: center; }
@media (pointer: coarse) { .act .btn { min-block-size: 44px; } .exitall { min-block-size: 44px; } }
${HIDDEN_CSS}`

const setAttr = (el, name, value) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

export class TsOpenPositions extends TsWidget {
  static catalogKey = 'openPositions'
  static emptyText = EN['widget.openPositions.empty']
  static dataShape = Object.freeze({
    positions: 'array',
    mtm: Object.freeze({ kind: 'numeric', optional: true }),
    margin: Object.freeze({ kind: 'numeric', optional: true }),
    asOf: Object.freeze({ kind: 'time', optional: true }),
    live: Object.freeze({ kind: 'boolean', optional: true }),
  })

  static styles = STYLES

  static template(variant) {
    return TEMPLATES[variant] || TEMPLATES.M
  }

  static skeleton(variant) {
    return SKELETONS[variant] || SKELETONS.M
  }

  /** Pure: data to strings, signs, bar marks and the accessible name. */
  static positionsModel(data, variant, ctx) {
    return positionsModel(data, variant, ctx)
  }

  // The tile is named by its label alone and the caption carries the summary, so a screen reader does not hear it twice.
  static viewModel(data, variant, ctx) {
    const vm = positionsModel(data, variant, ctx)
    return {
      ...vm,
      summary: vm.ariaLabel,
      ariaLabel: ctx.label,
      label: ctx.label,
      synced: syncedParts(ctx.t),
      noRows: ctx.t('widget.openPositions.empty'),
    }
  }

  constructor() {
    super()
    this._tableEl = null
    this._rows = null
    this._ids = new WeakMap()
    this._variant = 'M'
    this._exits = false

    this._section.addEventListener('click', (e) => {
      const target = e.target
      const one = target?.closest?.('.exit')
      const all = one ? null : target?.closest?.('.exitall')
      if (!one && !all) return
      if (this._isEditing()) {
        e.preventDefault?.()
        e.stopPropagation?.()
        return
      }
      if (one && this.actionEnabled(ACTION_EXIT)) {
        const body = one.closest('tbody')
        if (!body || !this._ids.has(body)) return
        e.preventDefault?.()
        this.emit(ACTION_EXIT, { id: this._ids.get(body) })
      } else if (all && this.actionEnabled(ACTION_EXIT_ALL)) {
        e.preventDefault?.()
        this.emit(ACTION_EXIT_ALL)
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
    this._variant = variant
    this._exits = this.actionEnabled(ACTION_EXIT)

    // Exit all sits at the end of the summary line, and has nothing to exit without a position.
    const exitAll = this.actionEnabled(ACTION_EXIT_ALL) && vm.rows.length > 0
    hide('sum', !vm.mtm && !exitAll)
    hide('exitAll', !exitAll)
    write('exitAll', this.t('positions.exitAll'))
    if (vm.mtm) {
      write('mtmLabel', this.t('positions.mtm'))
      write('mtmAr', vm.mtm.arrow)
      write('mtm', vm.mtm.text)
      setAttr(this.$('[data-k="mtmBox"]'), 'class', `n md${vm.mtm.tone === 'mut' ? '' : ` ${vm.mtm.tone}`}`)
      hide('marginBox', !vm.margin)
      write('marginLabel', this.t('positions.margin'))
      write('margin', vm.margin)
    }

    write('h0', this.t('positions.col.instrument'))
    if (variant === 'L') write('h1', this.t('positions.col.trend'))
    write('h2', this.t('positions.col.last'))
    write('h3', this.t('positions.col.pnl'))
    write('h4', this.t('positions.col.actions'))
    hide('h4c', !this._exits)
    setAttr(this.$('[data-k="scroll"]'), 'aria-label', this.t('positions.region', { label: vm.label }))
    write('none', vm.noRows)
    hide('none', vm.rows.length > 0)

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
      create: (row) => this._createRow(row, doc),
      update: (tb, row) => this._writeRow(tb, row, doc),
    })
  }

  _createRow(row, doc) {
    const tbody = doc.createElement('tbody')
    tbody.setAttribute('part', 'row')
    this._ids.set(tbody, row.id)
    const tr = doc.createElement('tr')
    const th = doc.createElement('th')
    th.setAttribute('scope', 'row')
    th.setAttribute('class', 'id')
    th.setAttribute('part', 'cell')
    const sym = doc.createElement('span')
    sym.setAttribute('class', 'sym')
    th.appendChild(sym)
    const sub = doc.createElement('span')
    sub.setAttribute('class', 'sub')
    const side = doc.createElement('span')
    side.setAttribute('class', 'side')
    sub.appendChild(side)
    sub.appendChild(doc.createElement('span'))
    th.appendChild(sub)
    tr.appendChild(th)
    if (this._variant === 'L') {
      const sp = doc.createElement('td')
      sp.setAttribute('class', 'sp')
      sp.setAttribute('part', 'cell')
      sp.appendChild(createSpark(doc))
      tr.appendChild(sp)
    }
    const last = doc.createElement('td')
    last.setAttribute('class', 'last n')
    last.setAttribute('part', 'cell')
    tr.appendChild(last)
    const pnl = doc.createElement('td')
    pnl.setAttribute('class', 'pnl n')
    pnl.setAttribute('part', 'cell')
    const ar = doc.createElement('span')
    ar.setAttribute('class', 'ar')
    ar.setAttribute('aria-hidden', 'true')
    pnl.appendChild(ar)
    pnl.appendChild(doc.createElement('span'))
    tr.appendChild(pnl)
    const act = doc.createElement('td')
    act.setAttribute('class', 'act')
    act.setAttribute('part', 'cell')
    tr.appendChild(act)
    tbody.appendChild(tr)

    if (this._variant !== 'Wide') {
      const br = doc.createElement('tr')
      br.setAttribute('class', 'br')
      const td = doc.createElement('td')
      td.appendChild(createBar(doc, 'range'))
      br.appendChild(td)
      tbody.appendChild(br)
    }
    return tbody
  }

  _writeRow(tbody, row, doc) {
    const tr = tbody.firstChild
    const spark = this._variant === 'L'
    const [th] = tr.children
    const last = tr.children[spark ? 2 : 1]
    const pnl = tr.children[spark ? 3 : 2]
    const act = tr.children[spark ? 4 : 3]
    setText(th.children[0], row.name)
    // A long name ends in an ellipsis on a narrow tile, so its full text is its title.
    setAttr(th.children[0], 'title', row.name)
    const sub = th.children[1]
    setText(sub.children[0], row.sideText)
    setText(sub.children[1], row.detail)
    // A hover for what has no room: the strategy, the account and the lots.
    if (row.title) setAttr(th, 'title', row.title)
    else if (th.getAttribute('title') !== null) th.removeAttribute('title')
    if (spark) writeSpark(tr.children[1].firstChild, row.spark)
    setText(last, row.last)
    setAttr(pnl, 'class', `pnl n${row.tone === 'mut' ? '' : ` ${row.tone}`}`)
    setText(pnl.children[0], row.arrow)
    setText(pnl.children[1], row.pnl)

    // The exit button exists only while the host lists 'exit-position'; the column goes with it.
    act.toggleAttribute('hidden', !this._exits)
    const has = act.firstChild
    if (!this._exits) {
      if (has) act.removeChild(has)
    } else {
      let btn = has
      if (!btn) {
        btn = doc.createElement('button')
        btn.setAttribute('type', 'button')
        btn.setAttribute('class', 'btn exit')
        act.appendChild(btn)
      }
      setText(btn, this.t('positions.exit'))
      setAttr(btn, 'aria-label', this.t('positions.exitLabel', { name: row.name }))
    }

    if (this._variant !== 'Wide') {
      const cell = tbody.lastChild.firstChild
      setAttr(cell, 'colspan', String((spark ? 4 : 3) + (this._exits ? 1 : 0)))
      const bar = cell.firstChild
      bar.toggleAttribute('hidden', !row.bar)
      if (row.bar) writeBar(bar, 'range', row.bar, row.bar.label)
    }
  }
}
