/**
 * <ts-capital-funding>: how much of each account's balance its strategies' allocations are covered by, sizes S · Tall · L
 * (RFC 0003 §21.2, data shape RFC 0001 §8.5.5).
 *
 * `fundingModel` is the pure view model, built on the core's `funding()` (allocations draw the balance in array order,
 * and a `funded` the host gives overrides it). A shortfall is marked with hatching and the words "short <amount>",
 * never with colour alone. S shows the first account; Tall and L list them all, each with its allocations, in keyed
 * rows (rows.js), so a balance that moves rewrites the cells that moved and nothing else. Rebalance is a button only
 * when 'rebalance' is in `actions`, and it asks: the widget moves no money.
 */

import { TsWidget, sk, syncedParts, header, arrowFor, figure } from './widget.js'
import { EN, funding, toTime } from '../core/index.js'
import { createRows, setText } from './rows.js'
import { readItems, numberOf, HIDDEN_CSS } from './list-parts.js'

const ACTION_REBALANCE = 'rebalance'

const isObj = (v) => v !== null && typeof v === 'object'
const text = (v) => (typeof v === 'string' ? v : '')

// The share of the allocated amount that is funded, as the whole percent a reader compares (37%, not 37.28%). A share
// that is not quite whole never rounds up to 100%: "100% funded" beside "short ₹1.00" would contradict itself.
function shareText(share, fmt) {
  if (share === null) return ''
  const whole = Math.round(share * 100)
  return fmt.percent(share < 1 && whole === 100 ? 0.99 : share, { sign: 'negative', decimals: 0 })
}

const idOf = (v) => (typeof v === 'string' && v !== '') || (typeof v === 'number' && Number.isFinite(v)) ? String(v) : ''

function allocationsOf(list) {
  const out = []
  const seen = new Map()
  let dropped = 0
  if (!Array.isArray(list)) return { out, dropped }
  list.forEach((a, i) => {
    if (!isObj(a)) {
      dropped++
      return
    }
    const base = idOf(a.id) || `#${i + 1}`
    const n = (seen.get(base) || 0) + 1
    seen.set(base, n)
    out.push({ ...a, id: n === 1 ? base : `${base}#${n}` })
  })
  return { out, dropped }
}

function accountRow(source, ctx) {
  const { fmt, t } = ctx
  const money = (n) => fmt.money(n, { sign: 'negative' })
  // Every allocation draws the balance, so none is dropped for its id: a missing or repeated one is made unique here ('x#2'),
  // and only what is not an object at all is left out, and counted.
  const kept = allocationsOf(source.allocations)
  const f = funding({ ...source, allocations: kept.out })
  const name = text(source.name) || f.id
  const share = shareText(f.fundedShare, fmt)
  const shortText = f.shortfall > 0 ? t('funding.short', { amount: money(f.shortfall) }) : ''
  const barLabel = (who, funded, amount, short) => {
    const base = t('funding.bar', { name: who, funded: money(funded), amount: money(amount) })
    return short > 0 ? t('funding.join', { head: base, tail: t('funding.short', { amount: money(short) }) }) : base
  }

  let funded = 0
  for (const a of f.allocations) funded += a.funded
  const allocations = f.allocations.map((a) => {
    const pnlText = a.pnl === null ? '' : fmt.money(a.pnl, { sign: 'always' })
    const arrow = arrowFor(pnlText)
    return {
      id: a.id,
      name: a.name,
      detail: a.detail || '',
      live: a.live,
      amount: money(a.amount),
      short: a.short > 0 ? t('funding.short', { amount: money(a.short) }) : '',
      // Nothing to fund is no bar: a bar of zero over zero would claim a state the data does not have.
      bar: a.amount > 0 ? { funded: Math.round((a.funded / a.amount) * 1000) / 10, short: a.short > 0, label: barLabel(a.name, a.funded, a.amount, a.short) } : null,
      pnl: pnlText,
      arrow,
      tone: arrow === '▲' ? 'pos' : arrow === '▼' ? 'neg' : 'mut',
    }
  })

  return {
    id: f.id,
    dropped: kept.dropped,
    name,
    balance: money(f.balance),
    allocated: money(f.allocated),
    free: money(f.free),
    share,
    shareNum: f.fundedShare,
    short: shortText,
    status: shortText || (f.allocated > 0 ? t('funding.full') : t('funding.nothing')),
    hasShort: f.shortfall > 0,
    bar: f.allocated > 0 ? { funded: Math.round((funded / f.allocated) * 1000) / 10, short: f.shortfall > 0, label: barLabel(name, funded, f.allocated, f.shortfall) } : null,
    summary: [
      t('funding.account', { name, balance: money(f.balance), allocated: money(f.allocated) }),
      share ? t('funding.share', { share }) : '',
      shortText,
    ]
      .filter(Boolean)
      .reduce((head, tail) => (head ? t('funding.join', { head, tail }) : tail), ''),
    rebalance: t('funding.rebalanceLabel', { name }),
    allocations,
  }
}

/**
 * Pure: data in, strings and flags out. Never throws on partial data: an account or allocation without an id is
 * counted in `dropped` and left out, an amount that can't be read is zero (core `funding()`), and a figure that has
 * nothing to show is empty. S holds the first account.
 */
export function fundingModel(data, variant, ctx) {
  const d = isObj(data) ? data : {}
  const { fmt, t } = ctx
  const { out, dropped } = readItems(d.accounts)
  const rows = (variant === 'S' ? out.slice(0, 1) : out).map((a) => accountRow(a, ctx))

  const hidden = dropped + rows.reduce((n, r) => n + r.dropped, 0)
  let summary = t('funding.aria', { label: ctx.label, accounts: t('funding.accounts', {}, out.length) })
  if (variant === 'S' && rows.length) summary = t('funding.join', { head: summary, tail: rows[0].summary })
  if (variant === 'S' && out.length > 1) summary = t('funding.join', { head: summary, tail: t('funding.firstOnly') })
  const note = hidden > 0 ? t('funding.hidden', {}, hidden) : ''
  if (note) summary = t('funding.join', { head: summary, tail: note })

  const asOf = toTime(d.asOf)
  return {
    ariaLabel: summary,
    rows,
    total: out.length,
    dropped: hidden,
    note,
    live: d.live === true,
    time: Number.isFinite(asOf) ? fmt.time(asOf) : '',
  }
}

// ── Markup ────────────────────────────────────────────────────────────────

const BAR = '<span class="fb" role="img" data-k="bar"><span class="ff"></span></span>'
// S has no room for a row of its own under the share, so its button is an icon at the end of the header, named by aria-label and title.
const ICON = '<button type="button" class="btn reb ico" data-k="reb" hidden><span aria-hidden="true">↻</span></button>'
const head = header({ dot: true, meta: true })
const headS = head.replace(/<\/div>$/, `${ICON}</div>`)

const TEMPLATES = {
  S: `${headS}
<div class="col one">
  <span class="lb ell" data-k="name"></span>
  <div class="rowb">${figure('big nv', 'share', 'value')}<span class="sm mut" data-k="funded"></span></div>
  ${BAR}
  <span class="sm n ell st sec" data-k="status"></span>
</div>`,
  list: `${head}
<div class="scroll lift" data-k="scroll" role="group" tabindex="0">
  <ul class="accts" data-k="list"></ul>
  <div class="none mut" data-k="none" hidden></div>
  <div class="sm mut note" data-k="note" hidden></div>
</div>`,
}

const SKELETON_ACCOUNT = `<div class="col">${sk(50, 12)}${sk(100, 6)}${sk(70, 9)}</div>`
const SKELETONS = {
  S: `${header()}${sk(40, 9)}${sk(50, 30)}${sk(100, 6)}${sk(60, 11)}`,
  list: `${header()}${SKELETON_ACCOUNT}${SKELETON_ACCOUNT}${SKELETON_ACCOUNT}`,
}

const STYLES = `
.nv { white-space: nowrap; max-inline-size: 100%; overflow: hidden; text-overflow: clip; unicode-bidi: isolate; }
.big.nv { font-size: min(var(--ts-text-big, max(34px, 2.125rem)), 15cqi); }
.one { gap: 6px; }
.ah { align-items: center; flex-wrap: wrap; gap: 4px 8px; min-inline-size: 0; }
.ah > .an { flex: 1 1 70px; }
.ico { display: inline-flex; align-items: center; justify-content: center; min-inline-size: 28px; padding: 0; font-size: var(--ts-text-xl, max(16px, 1rem)); line-height: 1; }
@media (pointer: coarse) { .ico { min-inline-size: 44px; } }
/* The synced time gives way to the icon on the narrowest tile, as the watchlist's does to its add button. */
@container (max-width: 200px) { .tile[data-act] .meta { display: none; } }
/* Positioned, so the words that are visually hidden inside it are placed in it and not in the tile, which they would otherwise make taller. */
.scroll { position: relative; flex: 1; min-block-size: 0; overflow: auto; scrollbar-width: thin; overscroll-behavior: contain; }
.scroll:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
ul { list-style: none; margin: 0; padding: 0; }
.ac { display: flex; flex-direction: column; gap: 6px; padding-block: 8px 10px; border-block-end: 1px solid var(--ts-line); }
.ac:first-child { padding-block-start: 2px; }
.ac:last-child { border-block-end: 0; }
.an { font-size: var(--ts-text-base, max(13px, .8125rem)); font-weight: 600; color: var(--ts-ink); unicode-bidi: isolate; }
/* The funded part is solid; what is short is the track showing through, hatched in the loss colour, so a shortfall reads without colour. */
.fb { display: block; box-sizing: border-box; inline-size: 100%; block-size: 6px; border-radius: 3px; overflow: hidden; background: var(--ts-surface-2); direction: ltr; }
.fb.short { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ts-loss) 70%, transparent) 0 3px, color-mix(in srgb, var(--ts-loss) 22%, transparent) 3px 6px); }
.ff { display: block; block-size: 100%; inline-size: calc(var(--f, 0) * 1%); background: var(--ts-accent); }
.fb[hidden] { display: none; }
.am { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; font-size: var(--ts-text-sm, max(11px, .6875rem)); min-inline-size: 0; }
.am > * { white-space: nowrap; }
.am2 { display: none; flex-wrap: wrap; gap: 2px 10px; font-size: var(--ts-text-sm, max(11px, .6875rem)); }
.am2 > * { white-space: nowrap; }
@container (min-width: 280px) { .am2 { display: flex; } }
.st { color: var(--ts-ink); }
/* What is short is the one figure that must be read whole, so on a narrow tile it wraps at its space ("short" over the amount) and is never cut. */
.ac .st, .al .st { white-space: normal; overflow-wrap: normal; min-inline-size: 0; }
.note { padding-block: 6px 2px; }
.note[hidden] { display: none; }
.st.neg { color: var(--ts-loss); font-weight: 600; }
.al-list { display: flex; flex-direction: column; gap: 7px; padding-block-start: 4px; }
/* The narrowest tile gives each allocation its name, then its amount and what is short under it, then its bar. */
.al { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: 8px; row-gap: 3px; align-items: baseline; font-size: var(--ts-text-md, max(12px, .75rem)); }
.al .fb { block-size: 4px; }
.alname { min-inline-size: 0; display: flex; align-items: baseline; gap: 6px; }
.alname > .ell { min-inline-size: 0; }
.ad { color: var(--ts-muted); font-size: var(--ts-text-xs, max(10px, .625rem)); }
.ad:empty { display: none; }
.alsub { min-inline-size: 0; display: flex; flex-wrap: wrap; gap: 0 8px; align-items: baseline; font-size: var(--ts-text-sm, max(11px, .6875rem)); }
.alnum { white-space: nowrap; }
@container (min-width: 221px) {
  .al { grid-template-columns: minmax(0, 1fr) auto; }
  .al .fb { grid-column: 1 / -1; }
  .alnum { grid-column: 2; grid-row: 1; justify-self: end; text-align: end; }
  .alsub { grid-column: 1; }
}
.pn { white-space: nowrap; }
.reb { min-block-size: 28px; white-space: nowrap; flex: none; }
@media (pointer: coarse) { .reb { min-block-size: 44px; } }
.none { padding-block: 16px; text-align: center; }
/* L is roomy enough to give each allocation one line: the strategy and its detail, the bar, the amount, what is short, the P&L. */
@container (min-width: 520px) {
  .al { grid-template-columns: minmax(120px, 1.4fr) minmax(60px, 1fr) minmax(90px, auto) minmax(90px, auto); column-gap: 14px; }
  .al .fb { grid-column: 2; grid-row: 1; block-size: 6px; }
  .al .alname { grid-column: 1; grid-row: 1; }
  .al .alsub { grid-column: 1; grid-row: 2; }
  .al .alnum { grid-column: 3; grid-row: 1; }
  .al .alsub { flex-wrap: nowrap; }
  .al .pn { grid-column: 4; grid-row: 1; justify-self: end; }
}
@media (forced-colors: active) {
  .fb { border: 1px solid CanvasText; background: ButtonFace; }
  .fb.short { background: ButtonFace; border-style: dashed; }
  .ff { background: Highlight; }
}
${HIDDEN_CSS}`

const setAttr = (el, name, value) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

// A bar is its funded width as one custom property, written through the CSSOM (a style attribute in markup would meet a
// strict style-src), and the hatching class when anything is short.
function writeBar(bar, model) {
  bar.toggleAttribute('hidden', !model)
  if (!model) return
  setAttr(bar, 'class', `fb${model.short ? ' short' : ''}`)
  setAttr(bar, 'aria-label', model.label)
  const fill = bar.firstChild
  const f = String(model.funded)
  if (fill.style.getPropertyValue('--f') !== f) fill.style.setProperty('--f', f)
}

export class TsCapitalFunding extends TsWidget {
  static catalogKey = 'capitalFunding'
  static emptyText = EN['widget.capitalFunding.empty']
  static dataShape = Object.freeze({
    accounts: 'array',
    asOf: Object.freeze({ kind: 'time', optional: true }),
    live: Object.freeze({ kind: 'boolean', optional: true }),
  })

  static styles = STYLES

  static template(variant) {
    return variant === 'S' ? TEMPLATES.S : TEMPLATES.list
  }

  static skeleton(variant) {
    return variant === 'S' ? SKELETONS.S : SKELETONS.list
  }

  /** Pure: data to strings, bar widths and the accessible name. */
  static fundingModel(data, variant, ctx) {
    return fundingModel(data, variant, ctx)
  }

  static viewModel(data, variant, ctx) {
    const vm = fundingModel(data, variant, ctx)
    return { ...vm, label: ctx.label, synced: syncedParts(ctx.t), region: ctx.t('funding.region', { label: ctx.label }), noRows: ctx.t('widget.capitalFunding.empty') }
  }

  constructor() {
    super()
    this._variant = 'Tall'
    this._listEl = null
    this._rows = null
    this._ids = new WeakMap()
    this._inner = new WeakMap()
    this._firstId = null

    this._section.addEventListener('click', (e) => {
      const button = e.target?.closest?.('.reb')
      if (!button) return
      if (this._isEditing()) {
        e.preventDefault?.()
        e.stopPropagation?.()
        return
      }
      if (!this.actionEnabled(ACTION_REBALANCE)) return
      const li = button.closest('li')
      const id = li ? this._ids.get(li) : this._firstId
      if (id === undefined || id === null) return
      e.preventDefault?.()
      this.emit(ACTION_REBALANCE, { id })
    })
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
    this._variant = variant

    if (variant === 'S') {
      this._updateFirst(vm, write)
      return
    }
    setAttr(this.$('[data-k="scroll"]'), 'aria-label', vm.region)
    write('none', vm.noRows)
    hide('none', vm.rows.length > 0)
    this._lift(this.$('[data-k="scroll"]'), vm.rows.length > 0)
    write('note', vm.note)
    hide('note', !vm.note)
    this._bind()
    this._rows.sync(vm.rows)
  }

  _updateFirst(vm, write) {
    const a = vm.rows[0]
    this._firstId = a ? a.id : null
    if (!a) {
      for (const k of ['name', 'shareAr', 'shareV', 'funded', 'status']) write(k, '')
      this.$('[data-k="bar"]').toggleAttribute('hidden', true)
      this.$('[data-k="reb"]').toggleAttribute('hidden', true)
      this._section.toggleAttribute('data-act', false)
      return
    }
    write('name', a.name)
    setAttr(this.$('[data-k="name"]'), 'title', a.name)
    write('shareAr', '')
    write('shareV', a.share || '—')
    write('funded', a.share ? this.t('funding.funded') : '')
    const share = this.$('[data-k="share"]')
    const fc = String((a.share || '—').length)
    if (share.style.getPropertyValue('--fc') !== fc) share.style.setProperty('--fc', fc)
    this.flash('share', a.shareNum === null ? NaN : a.shareNum, { goodWhen: 'up' })
    writeBar(this.$('[data-k="bar"]'), a.bar)
    const status = write('status', a.status)
    setAttr(status, 'class', `sm n ell st sec${a.hasShort ? ' neg' : ''}`)
    this._writeReb(this.$('[data-k="reb"]'), a, true)
    this._section.toggleAttribute('data-act', this.actionEnabled(ACTION_REBALANCE))
  }

  // S's button is an icon, so its words are the name and the hover text; a list's has them as its text.
  _writeReb(button, a, icon) {
    button.toggleAttribute('hidden', !this.actionEnabled(ACTION_REBALANCE))
    if (icon) setAttr(button, 'title', a.rebalance)
    else setText(button, this.t('funding.rebalance'))
    setAttr(button, 'aria-label', a.rebalance)
  }

  /** The keyed accounts for the list the template last built. */
  _bind() {
    const list = this.$('[data-k="list"]')
    if (list === this._listEl) return
    this._listEl = list
    const doc = this.ownerDocument
    this._rows = createRows(list, {
      create: (row) => this._createAccount(row, doc),
      update: (li, row) => this._writeAccount(li, row, doc),
      rescue: (li) => {
        const target = li && li.querySelector ? li.querySelector('.reb:not([hidden])') : null
        const fallback = target || this.$('[data-k="scroll"]')
        if (fallback && fallback.focus) fallback.focus({ preventScroll: true })
      },
    })
  }

  _node(doc, tag, cls, part) {
    const el = doc.createElement(tag)
    if (cls) el.setAttribute('class', cls)
    if (part) el.setAttribute('part', part)
    return el
  }

  _createAccount(row, doc) {
    const li = this._node(doc, 'li', 'ac', 'row')
    this._ids.set(li, row.id)
    const head = this._node(doc, 'div', 'rowb ah')
    head.appendChild(this._node(doc, 'span', 'an ell'))
    const reb = this._node(doc, 'button', 'btn reb')
    reb.setAttribute('type', 'button')
    reb.setAttribute('hidden', '')
    head.appendChild(reb)
    li.appendChild(head)
    const bar = this._node(doc, 'span', 'fb', 'bar')
    bar.setAttribute('role', 'img')
    bar.appendChild(this._node(doc, 'span', 'ff'))
    li.appendChild(bar)
    const meta = this._node(doc, 'div', 'am')
    // The word is for assistive technology: a balance beside a share says nothing of what the figure is.
    const balance = this._node(doc, 'span', 'n')
    balance.appendChild(this._node(doc, 'span', 'visually-hidden'))
    balance.appendChild(this._node(doc, 'span', ''))
    meta.appendChild(balance)
    for (const cls of ['n', 'st n']) meta.appendChild(this._node(doc, 'span', cls))
    li.appendChild(meta)
    const totals = this._node(doc, 'div', 'am2 mut')
    for (const cls of ['', 'n', '', 'n']) totals.appendChild(this._node(doc, 'span', cls))
    li.appendChild(totals)
    li.appendChild(this._node(doc, 'ul', 'al-list'))
    // Allocations are keyed in their own list, so a strategy that is added or goes does not rebuild the account.
    const inner = createRows(li.lastChild, {
      create: (a) => this._createAllocation(a, doc),
      update: (el, a) => this._writeAllocation(el, a),
    })
    this._inner.set(li, inner)
    return li
  }

  _writeAccount(li, row) {
    const [head, bar, meta, totals] = li.children
    setText(head.children[0], row.name)
    setAttr(head.children[0], 'title', row.name)
    this._writeReb(head.children[1], row, false)
    writeBar(bar, row.bar)
    setText(meta.children[0].children[0], `${this.t('funding.balance')} `)
    setText(meta.children[0].children[1], row.balance)
    setText(meta.children[1], row.share ? this.t('funding.share', { share: row.share }) : '')
    const st = meta.children[2]
    setText(st, row.status)
    setAttr(st, 'class', `st n${row.hasShort ? ' neg' : ''}`)
    setText(totals.children[0], this.t('funding.allocated'))
    setText(totals.children[1], row.allocated)
    setText(totals.children[2], this.t('funding.free'))
    setText(totals.children[3], row.free)
    this._inner.get(li).sync(row.allocations)
  }

  _createAllocation(a, doc) {
    const el = this._node(doc, 'li', 'al', 'allocation')
    const name = this._node(doc, 'span', 'alname')
    const dot = this._node(doc, 'span', 'dot live')
    dot.setAttribute('aria-hidden', 'true')
    dot.setAttribute('hidden', '')
    name.appendChild(dot)
    name.appendChild(this._node(doc, 'span', 'ell an'))
    // The word is for assistive technology: the dot alone says nothing to it.
    name.appendChild(this._node(doc, 'span', 'visually-hidden'))
    el.appendChild(name)
    el.appendChild(this._node(doc, 'span', 'alnum n'))
    const sub = this._node(doc, 'span', 'alsub')
    sub.appendChild(this._node(doc, 'span', 'ad ell'))
    sub.appendChild(this._node(doc, 'span', 'st n neg'))
    el.appendChild(sub)
    const pn = this._node(doc, 'span', 'pn n')
    const ar = this._node(doc, 'span', 'ar')
    ar.setAttribute('aria-hidden', 'true')
    pn.appendChild(ar)
    pn.appendChild(this._node(doc, 'span', ''))
    el.appendChild(pn)
    const bar = this._node(doc, 'span', 'fb')
    bar.setAttribute('role', 'img')
    bar.appendChild(this._node(doc, 'span', 'ff'))
    el.appendChild(bar)
    return el
  }

  _writeAllocation(el, a) {
    const [name, num, sub, pn, bar] = el.children
    name.children[0].toggleAttribute('hidden', !a.live)
    setText(name.children[1], a.name)
    setAttr(name.children[1], 'title', a.name)
    setText(name.children[2], a.live ? this.t('funding.live') : '')
    setText(num, a.amount)
    // The detail is for the roomy tile; a narrow one has the strategy's name and what it lacks.
    const roomy = this._variant === 'L'
    setText(sub.children[0], roomy ? a.detail : '')
    setText(sub.children[1], a.short)
    sub.toggleAttribute('hidden', !(roomy && a.detail) && !a.short)
    pn.toggleAttribute('hidden', !roomy || !a.pnl)
    setAttr(pn, 'class', `pn n${a.tone === 'mut' ? '' : ` ${a.tone}`}`)
    setText(pn.children[0], a.arrow)
    setText(pn.children[1], a.pnl)
    writeBar(bar, a.bar)
  }
}
