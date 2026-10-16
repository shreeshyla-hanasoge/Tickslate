/**
 * <ts-table>: a generic table that updates cells in place, sizes Tall · M · L ·
 * XL (RFC 0003 §16).
 *
 * `tableModel` is the pure view model: it formats each cell, sorts stably and
 * drops the columns that do not fit. The element draws a real <table> whose
 * rows and header cells are keyed (rows.js), so a live feed changes the text
 * of the cells that moved and nothing else: focus, scroll position and the
 * rows around it stay where they are. All text is set with textContent; no
 * markup is built from data.
 */

import { TsWidget, sk, syncedParts, header, arrowFor } from './widget.js'
import { EN, toNumber, toTime } from '../core/index.js'
import { createRows, setText } from './rows.js'

/** No column is narrower than this, so the budget keeps at most width / 56 of them. */
export const MIN_COLUMN = 56

const NUMERIC = ['number', 'money', 'percent', 'duration']
const FORMATS = [...NUMERIC, 'text', 'time', 'date']
const ALIGNS = ['start', 'end', 'center']
const ACTION_SORT = 'sort'
const ACTION_SELECT = 'select'

const isObj = (v) => v !== null && typeof v === 'object'
const missing = (v) => v === undefined || v === null || v === ''

// One collator per locale: constructing it costs far more than a comparison.
const collators = new Map()
function collatorFor(locale) {
  let c = collators.get(locale)
  if (!c) {
    try {
      c = new Intl.Collator(locale, { numeric: true })
    } catch {
      c = new Intl.Collator(undefined, { numeric: true })
    }
    collators.set(locale, c)
  }
  return c
}

/** The columns that can be drawn: an object with a key, the first of each key. */
function readColumns(columns) {
  const out = []
  const seen = new Set()
  if (!Array.isArray(columns)) return out
  for (const c of columns) {
    if (!isObj(c) || typeof c.key !== 'string' || !c.key || seen.has(c.key)) continue
    seen.add(c.key)
    const format = FORMATS.includes(c.format) ? c.format : 'text'
    out.push({
      key: c.key,
      label: typeof c.label === 'string' ? c.label : c.key,
      format,
      decimals: Number.isFinite(c.decimals) ? c.decimals : undefined,
      align: ALIGNS.includes(c.align) ? c.align : NUMERIC.includes(format) ? 'end' : 'start',
      signed: c.tone === 'sign',
      priority: Number.isFinite(c.priority) ? c.priority : out.length,
      sortable: c.sortable !== false,
      numeric: NUMERIC.includes(format),
    })
  }
  return out
}

/** Keeps the columns that fit at 56px or more each, dropping the highest `priority` number first. */
function budget(columns, width) {
  if (!(width > 0)) return columns
  const slots = Math.max(1, Math.floor(width / MIN_COLUMN))
  if (columns.length <= slots) return columns
  const drop = new Set(
    columns
      .map((c, i) => ({ c, i }))
      .sort((a, b) => b.c.priority - a.c.priority || b.i - a.i)
      .slice(0, columns.length - slots)
      .map((x) => x.c),
  )
  return columns.filter((c) => !drop.has(c))
}

function format(col, value, fmt) {
  if (missing(value)) return ''
  // A sign column shows + as well as −; any other shows only a minus.
  const sign = col.signed ? 'always' : 'negative'
  switch (col.format) {
    case 'number':
      return fmt.number(value, { decimals: col.decimals, sign })
    case 'money':
      return fmt.money(value, { decimals: col.decimals, sign })
    case 'percent':
      return fmt.percent(value, { decimals: col.decimals, sign })
    case 'duration':
      return fmt.duration(toNumber(value))
    case 'time':
      return fmt.time(toTime(value))
    case 'date':
      return fmt.date(value)
    default:
      // An object with no toString of its own would read "[object Object]".
      return isObj(value) && value.toString === Object.prototype.toString ? '' : String(value)
  }
}

/** What a column sorts by: a number, or the text, or null for a value it cannot read. */
function sortKey(col, value) {
  if (missing(value)) return null
  if (col.format === 'time' || col.format === 'date') {
    const t = toTime(value)
    return Number.isFinite(t) ? t : null
  }
  if (col.numeric) {
    const n = toNumber(value)
    return Number.isFinite(n) ? n : null
  }
  return isObj(value) && value.toString === Object.prototype.toString ? null : String(value)
}

/** The rows that can be shown (an object with an id, the first of each id), and how many were not. */
function readRows(rows) {
  const out = []
  const seen = new Set()
  let dropped = 0
  if (!Array.isArray(rows)) return { out, dropped }
  for (const r of rows) {
    const ok = isObj(r) && ((typeof r.id === 'string' && r.id !== '') || (typeof r.id === 'number' && Number.isFinite(r.id)))
    if (!ok || seen.has(r.id)) {
      dropped++
      continue
    }
    seen.add(r.id)
    out.push(r)
  }
  return { out, dropped }
}

/** A stable sort: rows that compare equal, and rows with no value (always last), keep the order they came in. */
function sorted(rows, col, dir, locale) {
  const text = !col.numeric && col.format !== 'time' && col.format !== 'date'
  const collator = text ? collatorFor(locale) : null
  const sign = dir === 'desc' ? -1 : 1
  const keyed = rows.map((row, i) => ({ row, i, k: sortKey(col, row[col.key]) }))
  keyed.sort((a, b) => {
    if (a.k === null || b.k === null) return a.k === b.k ? a.i - b.i : a.k === null ? 1 : -1
    const c = text ? collator.compare(a.k, b.k) : a.k - b.k
    return c ? c * sign : a.i - b.i
  })
  return keyed.map((x) => x.row)
}

/**
 * Pure: data in, strings and flags out. With `o.width` (the scroller's content
 * width in px) the columns that do not fit are left out; without it all are kept.
 */
export function tableModel(data, variant, ctx, o = {}) {
  const d = isObj(data) ? data : {}
  const { fmt, t } = ctx
  const all = readColumns(d.columns)
  const kept = budget(all, o.width)
  const { out, dropped } = readRows(d.rows)

  const want = isObj(d.sort) ? d.sort : null
  const sortCol = want ? all.find((c) => c.key === want.key) : null
  const dir = want && want.dir === 'desc' ? 'desc' : 'asc'
  const ordered = sortCol && sortCol.sortable ? sorted(out, sortCol, dir, fmt.locale) : out
  const sort = sortCol && sortCol.sortable ? { key: sortCol.key, dir } : null

  let summary = t('table.aria', { label: ctx.label, rows: t('table.rows', {}, out.length) })
  const join = (head, tail) => t('table.join', { head, tail })
  if (sort) summary = join(summary, t('table.sortedBy', { column: sortCol.label, dir: t(dir === 'desc' ? 'table.descending' : 'table.ascending') }))
  const hidden = all.length - kept.length
  if (hidden) summary = join(summary, t('table.hidden', {}, hidden))

  return {
    ariaLabel: summary,
    columns: kept.map((c) => ({
      key: c.key,
      label: c.label,
      align: c.align,
      sortable: c.sortable,
      sort: sort && sort.key === c.key ? (dir === 'desc' ? 'descending' : 'ascending') : 'none',
      numeric: c.numeric,
    })),
    rows: ordered.map((row) => ({
      id: row.id,
      cells: kept.map((c) => {
        const text = format(c, row[c.key], fmt)
        const arrow = c.signed ? arrowFor(text) : ''
        return { text, tone: arrow === '▲' ? 'pos' : arrow === '▼' ? 'neg' : 'mut', arrow }
      }),
    })),
    sort,
    hidden,
    dropped,
  }
}

// ── Markup ────────────────────────────────────────────────────────────────

// One template for every size: the column budget, not the size, decides what a
// table shows. The header cells and the rows are made by update(), because
// they depend on the data. The caption names the table for a screen reader; it
// holds the rows, the sort and the hidden columns, which the tile's own name
// leaves out so a ticking table does not make it read again.
const TEMPLATE = `
${header({ dot: true, meta: true })}
<div class="scroll" data-k="scroll" role="group" tabindex="0">
<table part="table" data-k="table">
<caption class="visually-hidden" data-k="caption"></caption>
<thead><tr data-k="head"></tr></thead>
<tbody data-k="body"></tbody>
</table>
<div class="none mut" data-k="none" hidden></div>
</div>`

const SKELETON = `${header()}${sk(100, 13)}${sk(100, 13)}${sk(85, 13)}${sk(100, 13)}${sk(70, 13)}${sk(100, 13)}`

const STYLES = `
[hidden] { display: none; }
.scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; overscroll-behavior: contain; }
.scroll:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
table { inline-size: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
th, td { box-sizing: border-box; min-inline-size: ${MIN_COLUMN}px; padding: 7px 8px; text-align: start; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* A text column gives way to the figures beside it, down to the 56px floor, and ends in an ellipsis; a figure is never cut. */
.t { max-inline-size: 0; inline-size: 100%; }
th:first-child, td:first-child { padding-inline-start: 0; }
th:last-child, td:last-child { padding-inline-end: 0; }
.start { text-align: start; }
.end { text-align: end; }
.center { text-align: center; }
/* The header stays while the body scrolls under it. */
th {
  position: sticky; inset-block-start: 0; z-index: 2; background: var(--ts-surface); border-block-end: 1px solid var(--ts-line);
  font-size: var(--ts-label-size, 10px); text-transform: var(--ts-label-case, uppercase); letter-spacing: var(--ts-label-tracking, .12em);
  font-weight: var(--ts-label-weight, 600); color: var(--ts-muted);
}
td { border-block-end: 1px solid var(--ts-line); }
tbody tr { position: relative; }
tbody tr:last-child td { border-block-end: 0; }
td.n { font-family: var(--ts-font-num); font-variant-numeric: tabular-nums lining-nums; font-weight: var(--ts-num-weight, 500); unicode-bidi: isolate; }
.sort {
  display: inline-flex; align-items: center; gap: 4px; max-inline-size: 100%; margin: 0; padding: 0; border: 0; background: none;
  font: inherit; letter-spacing: inherit; text-transform: inherit; color: inherit; cursor: pointer; min-block-size: 18px;
}
.sort:hover { color: var(--ts-ink); }
.sort:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
th[aria-sort="ascending"], th[aria-sort="descending"] { color: var(--ts-ink); }
th.end .sort { flex-direction: row-reverse; }
.si:empty { display: none; }
/* The stretched button of a selectable row: it covers the whole row, and the focus ring is drawn around it. */
.rowbtn { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; margin: 0; padding: 0; border: 0; background: none; cursor: pointer; }
.rowbtn:hover { background: color-mix(in srgb, var(--ts-surface-2) 60%, transparent); }
.rowbtn:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: -2px; }
.none { padding-block: 16px; text-align: center; }
@media (pointer: coarse) {
  tbody td { block-size: 44px; }
  .sort { min-block-size: 44px; }
}
`

// The glyph beside a sorted header: decoration, the state is in aria-sort.
const SORT_GLYPH = { ascending: '↑', descending: '↓', none: '' }

const setAttr = (el, name, value) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

export class TsTable extends TsWidget {
  static catalogKey = 'table'
  static emptyText = EN['widget.table.empty']
  static dataShape = Object.freeze({
    columns: 'array',
    rows: 'array',
    sort: Object.freeze({ kind: 'object', optional: true }),
    asOf: Object.freeze({ kind: 'time', optional: true }),
    live: Object.freeze({ kind: 'boolean', optional: true }),
  })

  static styles = STYLES

  static template() {
    return TEMPLATE
  }

  static skeleton() {
    return SKELETON
  }

  /** Pure: data to cells, header states and the accessible name. */
  static tableModel(data, variant, ctx, o) {
    return tableModel(data, variant, ctx, o)
  }

  // The tile is named by its label alone and the caption carries the summary,
  // so a screen reader does not hear it twice.
  static viewModel(data, variant, ctx) {
    const d = ctx.sort && isObj(data) ? { ...data, sort: ctx.sort } : data
    const vm = tableModel(d, variant, ctx, { width: ctx.width })
    const asOf = toTime(isObj(data) ? data.asOf : undefined)
    return {
      ...vm,
      summary: vm.ariaLabel,
      ariaLabel: ctx.label,
      label: ctx.label,
      live: isObj(data) && data.live === true,
      time: Number.isFinite(asOf) ? ctx.fmt.time(asOf) : '',
      synced: syncedParts(ctx.t),
      noRows: ctx.t('widget.table.empty'),
    }
  }

  constructor() {
    super()
    this._width = 0
    this._slots = 0
    this._extra = 0
    this._userSort = null
    this._sortSeen = ''
    this._sort = null
    this._ids = new WeakMap()
    this._cols = []
    this._bodyEl = null
    this._headEl = null
    this._rows = null
    this._heads = null
    this._scrollEl = null
    this._resize = null

    this._section.addEventListener('click', (e) => {
      const target = e.target
      const head = target?.closest?.('.sort')
      const row = head ? null : target?.closest?.('.rowbtn')
      if (!head && !row) return
      if (this._isEditing()) {
        e.preventDefault?.()
        e.stopPropagation?.()
        return
      }
      if (head) this._toggleSort(head.closest('th').getAttribute('data-key'))
      else if (this.actionEnabled(ACTION_SELECT) && this._ids.has(row.closest('tr'))) {
        e.preventDefault?.()
        this.emit(ACTION_SELECT, { id: this._ids.get(row.closest('tr')) })
      }
    })
  }

  /** Ascending, then descending, then ascending again; a different column starts ascending. */
  _toggleSort(key) {
    const dir = this._sort && this._sort.key === key && this._sort.dir === 'asc' ? 'desc' : 'asc'
    this._userSort = { key, dir }
    this.emit(ACTION_SORT, { value: key, dir })
    this.requestRender()
  }

  viewContext() {
    // A sort the host sets in `data` replaces the one the user chose; the same sort sent again with every live update does not.
    const want = isObj(this._data) && isObj(this._data.sort) ? `${this._data.sort.key}\n${this._data.sort.dir}` : ''
    if (want !== this._sortSeen) {
      this._sortSeen = want
      this._userSort = null
    }
    // Each column dropped for overflow takes one slot off the width the budget sees.
    return { width: this._width > 0 ? Math.max(MIN_COLUMN, this._width - this._extra * MIN_COLUMN) : 0, sort: this._userSort }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    if (this._resize) this._resize.disconnect()
    this._resize = null
    this._scrollEl = null
  }

  update(vm) {
    const text = (k, s) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el) setText(el, s)
    }
    const hide = (k, on) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el) el.toggleAttribute('hidden', on)
    }
    hide('dot', !vm.live)
    text('label', vm.label)
    hide('meta', !vm.time)
    text('pre', vm.synced.pre)
    text('time', vm.time)
    text('post', vm.synced.post)
    text('caption', vm.summary)
    const scroll = this.$('[data-k="scroll"]')
    setAttr(scroll, 'aria-label', vm.label)
    text('none', vm.noRows)
    hide('none', vm.rows.length > 0)

    this._sort = vm.sort
    this._cols = vm.columns
    this._selectable = this.actionEnabled(ACTION_SELECT)
    this._bind()
    this._heads.sync(vm.columns.map((c) => ({ ...c, id: c.key })))
    this._rows.sync(vm.rows)
    this._measure(scroll)
  }

  /** The keyed header cells and rows for the tbody and header row the template last built. */
  _bind() {
    const body = this.$('[data-k="body"]')
    const head = this.$('[data-k="head"]')
    const doc = this.ownerDocument
    if (body !== this._bodyEl || head !== this._headEl) {
      this._bodyEl = body
      this._headEl = head
      this._heads = createRows(head, {
        create: (col) => {
          const th = doc.createElement('th')
          th.setAttribute('scope', 'col')
          th.setAttribute('data-key', col.key)
          return th
        },
        update: (th, col) => this._writeHead(th, col, doc),
      })
      this._rows = createRows(body, {
        create: (row) => {
          const tr = doc.createElement('tr')
          tr.setAttribute('part', 'row')
          this._ids.set(tr, row.id)
          return tr
        },
        update: (tr, row) => this._writeRow(tr, row, doc),
      })
    }
  }

  _writeHead(th, col, doc) {
    setAttr(th, 'class', `${col.align}${col.numeric ? '' : ' t'}`)
    setAttr(th, 'aria-sort', col.sort)
    // A column that stops being sortable (or starts) swaps the button for plain text, never the cell.
    const want = col.sortable ? 'button' : 'span'
    let inner = th.firstChild
    if (!inner || inner.localName !== want) {
      while (th.firstChild) th.removeChild(th.firstChild)
      inner = doc.createElement(want)
      if (col.sortable) {
        inner.setAttribute('type', 'button')
        inner.setAttribute('class', 'sort')
        inner.appendChild(doc.createElement('span'))
        const glyph = doc.createElement('span')
        glyph.setAttribute('class', 'si')
        glyph.setAttribute('aria-hidden', 'true')
        inner.appendChild(glyph)
      }
      th.appendChild(inner)
    }
    if (col.sortable) {
      setText(inner.firstChild, col.label)
      setText(inner.lastChild, SORT_GLYPH[col.sort])
    } else setText(inner, col.label)
  }

  _writeRow(tr, row, doc) {
    const cells = row.cells
    // Columns come and go with the width; a row follows them in place.
    while (tr.children.length > cells.length) tr.removeChild(tr.lastChild)
    cells.forEach((cell, i) => {
      const col = this._cols[i]
      let td = tr.children[i]
      if (!td) {
        td = doc.createElement('td')
        td.setAttribute('part', 'cell')
        const arrow = doc.createElement('span')
        arrow.setAttribute('class', 'ar')
        arrow.setAttribute('aria-hidden', 'true')
        td.appendChild(arrow)
        td.appendChild(doc.createElement('span'))
        tr.appendChild(td)
      }
      const cls = `${col.align}${col.numeric ? ' n' : ' t'}${cell.tone === 'mut' ? '' : ` ${cell.tone}`}`
      setAttr(td, 'class', cls)
      // The arrow and the value are the last two children; the row button, when there is one, is first.
      setText(td.children[td.children.length - 2], cell.arrow)
      setText(td.children[td.children.length - 1], cell.text)
      if (i === 0) this._writeSelect(td, row, doc)
    })
  }

  /** The stretched button in a selectable row's first cell, named by what the cell says. */
  _writeSelect(td, row, doc) {
    const first = td.firstChild
    const has = first && first.localName === 'button'
    if (!this._selectable) {
      if (has) td.removeChild(first)
      return
    }
    let btn = first
    if (!has) {
      btn = doc.createElement('button')
      btn.setAttribute('type', 'button')
      btn.setAttribute('class', 'rowbtn')
      td.insertBefore(btn, first)
    }
    setAttr(btn, 'aria-label', this.t('table.select', { name: row.cells[0].text || String(row.id) }))
  }

  /**
   * The column budget needs the scroller's width, which exists only once it is
   * laid out. It is read here, straight after the first draw, and a render
   * that follows in the same microtask means the table is never painted with
   * columns it will drop. A later resize is watched.
   */
  _measure(scroll) {
    if (scroll !== this._scrollEl) {
      if (this._resize) this._resize.disconnect()
      this._scrollEl = scroll
      if (typeof ResizeObserver !== 'undefined') {
        this._resize = new ResizeObserver(() => this._fit())
        this._resize.observe(scroll)
      }
    }
    this._fit()
  }

  /**
   * 56px a column is the floor, not what a money figure needs, so columns that
   * still overflow once drawn are dropped too, by the same priority, one at a
   * time, until the table fits or one is left. Text columns shrink instead of
   * overflowing. A new width starts again from what it allows.
   */
  _fit() {
    const scroll = this._scrollEl
    const width = scroll && typeof scroll.clientWidth === 'number' ? scroll.clientWidth : 0
    this._width = width
    const slots = Math.floor(width / MIN_COLUMN)
    if (slots !== this._slots) {
      this._slots = slots
      this._extra = 0
      this.requestRender()
    } else if (width > 0 && scroll.scrollWidth > width + 1 && this._cols.length > 1) {
      this._extra++
      this.requestRender()
    }
  }
}
