/**
 * <ts-status>: health at a glance, one row per service, sizes S · Tall · M
 * (RFC 0004 §4.2). The state is always words beside a dot, and the dot's shape
 * differs by state, so colour is never the only signal.
 *
 * `statusModel` is the pure view model. The rows are a real <table> whose body
 * is keyed (rows.js): a change of one service's state writes that row's cells
 * and nothing else. All text is set with textContent; no markup is built from data.
 */

import { TsWidget, sk, syncedParts, header } from './widget.js'
import { EN, toTime } from '../core/index.js'
import { readItems, HIDDEN_CSS } from './list-parts.js'
import { createRows, setText } from './rows.js'

export const STATES = Object.freeze(['ok', 'degraded', 'down', 'unknown'])
// The worst first: down, then degraded, then unknown, then ok.
const WORST = Object.freeze(['down', 'degraded', 'unknown', 'ok'])

// Written out, not built from the state, so a search for a message key finds its use.
const STATE_KEY = Object.freeze({ ok: 'status.ok', degraded: 'status.degraded', down: 'status.down', unknown: 'status.unknown' })

const isObj = (v) => v !== null && typeof v === 'object'
const text = (v) => (typeof v === 'string' ? v : '')

/**
 * Pure. Rows keep the host's order (a status board's order is part of its
 * meaning). A row with no id or name, or a state that is not one of the four, is
 * dropped and counted.
 */
export function statusModel(data, variant, ctx) {
  const d = isObj(data) ? data : {}
  const { fmt, t, now } = ctx
  const read = readItems(d.rows)
  let dropped = read.dropped
  const rows = []
  const counts = { ok: 0, degraded: 0, down: 0, unknown: 0 }
  for (const r of read.out) {
    if (typeof r.name !== 'string' || r.name === '' || !STATES.includes(r.state)) {
      dropped++
      continue
    }
    counts[r.state]++
    const since = toTime(r.since)
    const when = Number.isFinite(since) ? fmt.ago(since, now, { justNow: t('time.justNow') }) : ''
    const stateText = t(STATE_KEY[r.state])
    rows.push({
      id: r.id,
      name: r.name,
      state: r.state,
      stateText,
      detail: text(r.detail),
      since: when,
      sinceText: when ? t('status.since', { when }) : '',
      aria: t('status.rowAria', { name: r.name, state: stateText }),
    })
  }
  const total = rows.length
  const overall = total ? WORST.find((s) => counts[s] > 0) : 'unknown'
  const summary = total ? t('status.summary', { ok: counts.ok, total }, total) : t('widget.status.empty')
  const asOf = toTime(d.asOf)
  return {
    ariaLabel: overall === 'ok' || !total ? t('status.aria', { label: ctx.label, summary }) : t('status.ariaWorst', { label: ctx.label, summary, state: t(STATE_KEY[overall]) }),
    overall,
    overallText: total ? t(STATE_KEY[overall]) : '',
    summary,
    counts,
    rows,
    total,
    dropped,
    live: d.live === true,
    // A "since" is an age and an asOf is a time on the page: either one moves with the clock, live or not.
    ages: Number.isFinite(asOf) || rows.some((r) => r.since !== ''),
    time: Number.isFinite(asOf) ? fmt.time(asOf) : '',
  }
}

// ── Markup ────────────────────────────────────────────────────────────────

const HEAD = header({ dot: true, meta: true })
const NONE = '<div class="none mut" data-k="none" hidden></div>'
// At Tall the words sit in a visually hidden span: a cell's own text would still give the column a minimum width.
const head = (k, hidden) => (hidden ? `<th scope="col"><span class="visually-hidden" data-k="${k}"></span></th>` : `<th scope="col" data-k="${k}"></th>`)

// The header row is visible at M and takes no room at Tall, where the columns are obvious: it is still there for a screen reader.
const table = (cols) => `${HEAD}
<div class="scroll" data-k="scroll" role="group" tabindex="0">
<table part="table" data-k="table" class="c${cols}">
<caption class="visually-hidden" data-k="caption"></caption>
<thead><tr>${head('h0', cols === 2)}${head('h1', cols === 2)}${cols === 3 ? head('h2', false) : ''}</tr></thead>
<tbody data-k="body"></tbody>
</table>
${NONE}
</div>`

const TEMPLATES = {
  S: `${HEAD}
<div class="ov"><span class="sum" data-k="sum"></span><span class="stt"><span class="mk" part="dot" aria-hidden="true" data-k="odot"></span><span data-k="otext"></span></span></div>
${NONE}`,
  Tall: table(2),
  M: table(3),
}

const ROW = `<div class="skrow">${sk(45, 12)}${sk(20, 12)}</div>`
const SKELETONS = {
  S: `${header()}${sk(50, 30)}${sk(35, 12)}`,
  Tall: `${header()}${ROW}${ROW}${ROW}${ROW}${ROW}`,
  M: `${header()}${ROW}${ROW}${ROW}${ROW}${ROW}`,
}

const STYLES = `
.scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; overscroll-behavior: contain; }
.scroll:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
.ov { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 6px; min-height: 0; }
.sum { font-size: min(var(--ts-text-3xl, max(26px, 1.625rem)), 15cqi); font-weight: var(--ts-headline-weight, 500); font-family: var(--ts-font-num); font-variant-numeric: tabular-nums; color: var(--ts-ink); unicode-bidi: isolate; }
.stt { display: flex; align-items: center; gap: 8px; font-size: var(--ts-text-base, max(13px, .8125rem)); font-weight: 600; color: var(--ts-ink); }
.ov .mk { inline-size: 14px; block-size: 14px; }
/* Four shapes, so the state survives without colour: a circle, a triangle, a square and a ring. */
.mk { display: inline-block; flex: none; inline-size: 10px; block-size: 10px; box-sizing: border-box; }
.mk.ok { border-radius: 50%; background: var(--ts-profit); }
.mk.degraded { background: var(--ts-warn); clip-path: polygon(50% 0, 100% 100%, 0 100%); }
.mk.down { background: var(--ts-loss); }
.mk.unknown { border-radius: 50%; border: 2px solid var(--ts-muted); }
table { inline-size: 100%; border-collapse: separate; border-spacing: 0; font-size: var(--ts-text-base, max(13px, .8125rem)); }
th, td { box-sizing: border-box; padding: 7px 0; text-align: start; vertical-align: top; font-weight: inherit; border-block-end: 1px solid var(--ts-line); }
tbody tr:last-child > * { border-block-end: 0; }
/* Tall: the header cells take no room, and their words are visually hidden: still in the accessibility tree. */
.c2 thead th { padding: 0; border: 0; block-size: 0; line-height: 0; overflow: hidden; }
.c3 thead th { padding-block: 0 5px; font-size: var(--ts-text-xs, max(10px, .625rem)); font-weight: 600; color: var(--ts-muted); }
.nm { max-inline-size: 0; inline-size: 100%; overflow: hidden; }
.t { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--ts-ink); font-weight: 600; unicode-bidi: isolate; }
.dt { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: var(--ts-text-sm, max(11px, .6875rem)); color: var(--ts-muted); unicode-bidi: isolate; }
.dt:empty { display: none; }
.stc { inline-size: 1%; padding-inline-start: 10px; white-space: nowrap; color: var(--ts-ink); }
.stc .mk { margin-inline-end: 8px; vertical-align: -1px; }
.sn { inline-size: 1%; padding-inline-start: 10px; white-space: nowrap; font-size: var(--ts-text-sm, max(11px, .6875rem)); color: var(--ts-muted); }
.skrow { display: flex; justify-content: space-between; gap: 10px; }
.none { padding-block: 16px; text-align: center; }
/* Backgrounds are dropped in forced colours: the shapes stay, in the user's text colour. */
@media (forced-colors: active) {
  .mk.ok, .mk.degraded, .mk.down { background: CanvasText; }
  .mk.unknown { border-color: CanvasText; }
}
${HIDDEN_CSS}`

const setAttr = (el, name, value) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}
const node = (doc, tag, cls) => {
  const el = doc.createElement(tag)
  if (cls) el.setAttribute('class', cls)
  return el
}

export class TsStatus extends TsWidget {
  static catalogKey = 'status'
  static emptyText = EN['widget.status.empty']
  static dataShape = Object.freeze({
    rows: 'array',
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

  /** Pure: the states in words, the overall state and the accessible name. */
  static statusModel(data, variant, ctx) {
    return statusModel(data, variant, ctx)
  }

  static viewModel(data, variant, ctx) {
    return { ...statusModel(data, variant, ctx), label: ctx.label, synced: syncedParts(ctx.t), noRows: ctx.t('widget.status.empty') }
  }

  constructor() {
    super()
    this._bodyEl = null
    this._rows = null
    this._cols = 2
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
    // The shared 15 s ticker (the freshness pattern) re-renders the words; nothing else here keeps time.
    this.every(vm.ages ? 15000 : 0)
    write('label', vm.label)
    hide('meta', !vm.time)
    write('pre', vm.synced.pre)
    write('time', vm.time)
    write('post', vm.synced.post)
    write('none', vm.noRows)
    hide('none', vm.total > 0)

    if (variant === 'S') {
      write('sum', vm.total ? vm.summary : '')
      write('otext', vm.overallText)
      hide('sum', !vm.total)
      hide('odot', !vm.total)
      setAttr(this.$('[data-k="odot"]'), 'class', `mk ${vm.overall}`)
      return
    }

    write('caption', vm.ariaLabel)
    write('h0', this.t('status.colName'))
    write('h1', this.t('status.colState'))
    if (variant === 'M') write('h2', this.t('status.colSince'))
    setAttr(this.$('[data-k="scroll"]'), 'aria-label', vm.label)
    this.$('[data-k="table"]').toggleAttribute('hidden', vm.total === 0)
    this._cols = variant === 'M' ? 3 : 2
    this._bind()
    this._rows.sync(vm.rows)
  }

  _bind() {
    const body = this.$('[data-k="body"]')
    if (body === this._bodyEl) return
    this._bodyEl = body
    const doc = this.ownerDocument
    this._rows = createRows(body, { create: () => this._createRow(doc), update: (tr, row) => this._writeRow(tr, row) })
  }

  _createRow(doc) {
    const tr = doc.createElement('tr')
    tr.setAttribute('part', 'row')
    const th = node(doc, 'th', 'nm')
    th.setAttribute('scope', 'row')
    th.setAttribute('part', 'cell')
    th.appendChild(node(doc, 'span', 't'))
    th.appendChild(node(doc, 'span', 'dt'))
    tr.appendChild(th)
    const st = node(doc, 'td', 'stc')
    st.setAttribute('part', 'cell')
    const mk = node(doc, 'span', 'mk')
    mk.setAttribute('part', 'dot')
    mk.setAttribute('aria-hidden', 'true')
    st.appendChild(mk)
    st.appendChild(node(doc, 'span', 'stx'))
    tr.appendChild(st)
    if (this._cols === 3) {
      const sn = node(doc, 'td', 'sn n')
      sn.setAttribute('part', 'cell')
      tr.appendChild(sn)
    }
    return tr
  }

  _writeRow(tr, row) {
    const [th, st, sn] = tr.children
    setText(th.children[0], row.name)
    setAttr(th.children[0], 'title', row.name)
    // The detail line is M's; Tall has no room for it, so it is not written there.
    setText(th.children[1], this._cols === 3 ? row.detail : '')
    setAttr(st.children[0], 'class', `mk ${row.state}`)
    setText(st.children[1], row.stateText)
    if (sn) setText(sn, row.sinceText)
    setAttr(tr, 'aria-label', row.aria)
  }
}
