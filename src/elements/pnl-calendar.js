/**
 * <ts-pnl-calendar>: every trading day as one cell, coloured by its profit or
 * loss, sizes Tall · M · Banner (RFC 0003 §21.1, data shape RFC 0001 §8.5.3).
 *
 * `calendarModel` is the pure view model: it lays the days out in week columns,
 * works each cell's strength, name and kind, and totals the days in view. The
 * element draws what it returns. Cells are made with createElement and written
 * with attributes and one CSSOM custom property (`--s`, the strength), so no
 * markup is built from data and a strict `style-src` cannot blank the colours.
 *
 * The grid is one named image for a screen reader (its summary: best day, worst
 * day, net), and each cell is a stop of a roving tabindex so a keyboard reader
 * can still read any one day. `moveFocus` is the pure part of that.
 */

import { TsWidget, sk, header, arrowFor, figure, FIGURE_CSS } from './widget.js'
import { EN, dayStats, toDay, toNumber } from '../core/index.js'
import { addDays, weekday } from '../core/zone.js'
import { settle } from '../core/stats.js'

// Week columns per size (RFC 0003 §21.1). A year is 53, not 52: 53 × 7 days always covers the last 365 days
// whichever weekday today is.
export const WEEKS = Object.freeze({ Tall: 6, M: 13, Banner: 53 })

// Below this tile width Banner folds into two half-year bands: 53 columns in a phone's ~315px would be cells under 6px.
export const BAND_BELOW = 560

// Two month names closer than this many columns would print over each other.
const LABEL_GAP = 4

const DASH = '—'

// ── Week layout (pure) ────────────────────────────────────────────────────

/**
 * The locale's first weekday and weekend, as ISO weekdays (1 Monday … 7 Sunday).
 * Intl.Locale's week info is missing from Firefox and older engines: Monday
 * and Saturday–Sunday are then the answer. `getWeekInfo()` is the standard
 * spelling and the `weekInfo` property the older one.
 */
export function weekInfoFor(locale) {
  const fallback = { firstDay: 1, weekend: [6, 7] }
  try {
    const loc = new Intl.Locale(locale || new Intl.DateTimeFormat().resolvedOptions().locale)
    const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo
    if (!info || !Number.isInteger(info.firstDay) || info.firstDay < 1 || info.firstDay > 7) return fallback
    const weekend = Array.isArray(info.weekend) ? info.weekend.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) : fallback.weekend
    // A week that is all weekend would draw nothing.
    return { firstDay: info.firstDay, weekend: weekend.length >= 7 ? fallback.weekend : weekend }
  } catch {
    return fallback
  }
}

/**
 * The calendar's week columns: `weeks` of them, the last one holding `today`.
 * Each is the weekdays of that week that are not weekend, in the locale's order,
 * as 'YYYY-MM-DD'. The `rows` are the ISO weekdays those cells sit on.
 */
export function weekGrid(today, weeks, { firstDay, weekend }) {
  const back = (weekday(today) - firstDay + 7) % 7
  const lastStart = addDays(today, -back)
  const start = addDays(lastStart, -(weeks - 1) * 7)
  const rows = []
  for (let i = 0; i < 7; i++) {
    const iso = ((firstDay - 1 + i) % 7) + 1
    if (!weekend.includes(iso)) rows.push({ offset: i, iso })
  }
  const columns = []
  for (let w = 0; w < weeks; w++) columns.push(rows.map((r) => addDays(start, w * 7 + r.offset)))
  return { start, end: addDays(lastStart, 6), rows: rows.map((r) => r.iso), columns }
}

/**
 * Splits the week columns into bands: one, or on a phone's Banner two half
 * years, the first taking the extra column of an odd count.
 */
export function splitBands(columns, bands) {
  if (bands < 2) return [columns]
  const first = Math.ceil(columns.length / bands)
  const out = []
  for (let i = 0; i < columns.length; i += first) out.push(columns.slice(i, i + first))
  return out
}

// ── View model (pure) ─────────────────────────────────────────────────────

const monthOf = (date) => date.slice(0, 7)

// The summary with the weekend note after it, when entries were left out.
const join = (summary, note, t) => (note ? t('calendar.chartNote', { summary, note }) : summary)

/**
 * data → everything the DOM needs. `ctx` is the widget context plus `phone`,
 * which the element measures: true when a Banner is too narrow for a year in
 * one band.
 */
export function calendarModel(data, variant, ctx) {
  const { fmt, t } = ctx
  const d = data && typeof data === 'object' ? data : {}
  const v = WEEKS[variant] ? variant : 'M'
  const label = ctx.label || t('widget.pnlCalendar.label')
  const timeZone = fmt.timeZone || 'UTC'
  const bandCount = v === 'Banner' && ctx.phone === true ? 2 : 1

  let today = d.today === undefined || d.today === null ? null : toDay(d.today, timeZone)
  if (today === null) today = toDay(ctx.now, timeZone)
  if (today === null) today = toDay(Date.now(), timeZone)

  const grid = weekGrid(today, WEEKS[v], weekInfoFor(fmt.locale))

  // One result per date, the rows of a date summed. Entries dated after today are not results yet.
  const totals = new Map()
  let readable = 0
  if (Array.isArray(d.days)) {
    for (const row of d.days) {
      if (!row || typeof row !== 'object') continue
      const date = toDay(row.date, timeZone)
      const pnl = toNumber(row.pnl)
      if (date === null || !Number.isFinite(pnl)) continue
      readable++
      totals.set(date, (totals.get(date) || 0) + pnl)
    }
    for (const [date, pnl] of totals) totals.set(date, settle(pnl))
  }
  const dropped = Array.isArray(d.days) ? d.days.length - readable : 0

  // Strength is relative to the biggest day among the cells that are drawn.
  const drawn = new Set(grid.columns.flat())
  let maxAbs = 0
  for (const [date, pnl] of totals) if (date <= today && drawn.has(date)) maxAbs = Math.max(maxAbs, Math.abs(pnl))

  const dayName = (date) => t('calendar.date', { weekday: fmt.date(date, { style: 'weekday' }), day: fmt.date(date, { style: 'day' }) })
  const cellOf = (date) => {
    const name = dayName(date)
    if (date > today) return { date, kind: 'up', pnl: null, strength: null, name: t('calendar.cellUpcoming', { date: name }) }
    if (!totals.has(date)) return { date, kind: 'none', pnl: null, strength: null, name: t('calendar.cellNone', { date: name }) }
    const pnl = totals.get(date)
    const text = fmt.money(pnl)
    // The kind follows the sign the reader sees, so a day that rounds to nothing is flat, not a loss with no minus.
    const arrow = arrowFor(text)
    // A day that settles to nothing is flat whatever the text says, and so is one whose text shows no sign.
    const kind = pnl === 0 ? 'flat' : arrow === '▲' ? 'pos' : arrow === '▼' ? 'neg' : 'flat'
    const strength = kind === 'flat' || maxAbs === 0 ? null : 0.22 + (0.78 * Math.abs(pnl)) / maxAbs
    return { date, kind, pnl, strength, name: t('calendar.cell', { date: name, value: text }) }
  }

  // Which columns carry a month name: where the month of the first day changes, never two within LABEL_GAP.
  const columnsOf = (cols) => {
    const marks = []
    cols.forEach((col, i) => {
      if (i === 0 || monthOf(col[0]) !== monthOf(cols[i - 1][0])) marks.push(i)
    })
    // A first column that a new month follows too closely gives way to it.
    if (marks.length > 1 && marks[1] - marks[0] < LABEL_GAP) marks.shift()
    const kept = []
    for (const at of marks) if (kept.length === 0 || at - kept[kept.length - 1] >= LABEL_GAP) kept.push(at)
    return cols.map((col, i) => {
      const at = kept.indexOf(i)
      // A January names its year, so a year boundary reads, when the month after it is far enough off to leave room:
      // every month keeps its name before the year does.
      const room = at === kept.length - 1 || kept[at + 1] - i > LABEL_GAP
      const year = at >= 0 && monthOf(col[0]).endsWith('-01') && room
      return { month: at >= 0 ? fmt.date(col[0], { style: year ? 'monthYear' : 'month' }) : '', cells: col.map(cellOf) }
    })
  }
  const bands = splitBands(grid.columns, bandCount).map((cols) => ({ weeks: columnsOf(cols) }))

  // The figures cover the days drawn, so the best and the worst day always have a cell to point at. A weekend entry
  // (a special session) is left out of them, and said so: the RFC draws no cell for it. dayStats itself counts it.
  const inView = []
  let weekendEntries = 0
  for (const [date, pnl] of totals) {
    if (date < grid.start || date > today) continue
    if (drawn.has(date)) inView.push({ date, pnl })
    else weekendEntries++
  }
  const stats = dayStats(inView, { timeZone })
  const empty = inView.length === 0
  const note = weekendEntries ? t('calendar.weekend', {}, weekendEntries) : ''
  const dayOf = (pnl) => inView.find((r) => r.pnl === pnl)

  const net = fmt.money(stats.net)
  const best = stats.best === null ? DASH : fmt.money(stats.best)
  const worst = stats.worst === null ? DASH : fmt.money(stats.worst)
  const from = fmt.date(grid.start, { style: 'medium' })
  const to = fmt.date(today, { style: 'medium' })
  const named = (pnl, text) => t('calendar.cell', { date: dayName(dayOf(pnl).date), value: text })
  const counted = stats.greenDays + stats.redDays

  return {
    variant: v,
    phone: bandCount > 1,
    bands,
    // The weekday names down the side, one per row of cells.
    rowLabels: grid.rows.map((iso) => fmt.date(addDays('2024-01-01', iso - 1), { style: 'weekday' })),
    rows: grid.rows.length,
    dropped,
    live: d.live === true,
    empty,
    label,
    net,
    netArrow: arrowFor(net),
    netClass: arrowFor(net) === '▲' ? 'pos' : arrowFor(net) === '▼' ? 'neg' : '',
    netNum: stats.net,
    best,
    bestArrow: arrowFor(best),
    bestClass: arrowFor(best) === '▲' ? 'pos' : arrowFor(best) === '▼' ? 'neg' : '',
    worst,
    worstArrow: arrowFor(worst),
    worstClass: arrowFor(worst) === '▲' ? 'pos' : arrowFor(worst) === '▼' ? 'neg' : '',
    rate: stats.greenRate === null ? DASH : fmt.percent(stats.greenRate, { decimals: 0, sign: 'negative' }),
    tradingDays: inView.length,
    counted,
    weekendEntries,
    note,
    chartLabel: join(
      empty ? t('calendar.chartEmpty', { label, from, to }) : t('calendar.chartLabel', { label, from, to, best: named(stats.best, best), worst: named(stats.worst, worst), net }),
      note,
      t,
    ),
    // The roving tabindex starts on today's cell (or the last day drawn up to today).
    focusDate: grid.columns.flat().filter((date) => date <= today).pop() || grid.columns[0][0],
    ariaLabel: empty ? t('calendar.ariaEmpty', { label }) : t('calendar.aria', { label, net, days: t('calendar.dayCount', {}, inView.length) }),
  }
}

// ── Keyboard (pure) ───────────────────────────────────────────────────────

// '2026-08' moved by `n` months.
function shiftMonth(key, n) {
  const at = Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1 + n
  return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, '0')}`
}

/**
 * Where a key moves the cursor: the date of the cell to focus, or null when the
 * key is not one the grid takes. The bands are `model.bands`. Left and Right
 * move between weeks (time runs left to right in every locale, so Right is
 * always the later week), and from the last week of a band into the first of
 * the next, so two half-year bands read as one long year. Up and Down move
 * between the weekdays of a week and stop at its ends. Home and End go to the
 * first and last week of the row, Control with them to the first and last cell
 * of the grid, and Page Up and Page Down to the same weekday's first cell in the
 * month before and after (or the end of the grid, where there is none). Stopping
 * at an edge returns the same date.
 */
export function moveFocus(bands, date, key, ctrl = false) {
  // Every week column in order, whichever band it is in.
  const cols = bands.flatMap((band, b) => band.weeks.map((week, w) => ({ b, w, cells: week.cells })))
  const i = cols.findIndex((col) => col.cells.some((c) => c.date === date))
  if (i < 0) return null
  const r = cols[i].cells.findIndex((c) => c.date === date)
  const rows = cols[i].cells.length
  const at = (col, row) => col.cells[Math.min(row, col.cells.length - 1)].date
  const band = (col) => cols.filter((c) => c.b === col.b)
  switch (key) {
    case 'ArrowRight':
      return at(cols[Math.min(i + 1, cols.length - 1)], r)
    case 'ArrowLeft':
      return at(cols[Math.max(i - 1, 0)], r)
    case 'ArrowDown':
      return r + 1 < rows ? at(cols[i], r + 1) : date
    case 'ArrowUp':
      return r > 0 ? at(cols[i], r - 1) : date
    case 'Home':
      return ctrl ? at(cols[0], 0) : at(band(cols[i])[0], r)
    case 'End':
      return ctrl ? at(cols[cols.length - 1], cols[cols.length - 1].cells.length - 1) : at(band(cols[i]).at(-1), r)
    case 'PageDown':
    case 'PageUp': {
      const month = shiftMonth(monthOf(date), key === 'PageDown' ? 1 : -1)
      const to = cols.find((col) => monthOf(col.cells[Math.min(r, col.cells.length - 1)].date) === month)
      return at(to || (key === 'PageDown' ? cols[cols.length - 1] : cols[0]), r)
    }
    default:
      return null
  }
}

// ── Element ───────────────────────────────────────────────────────────────

const k = (name) => `[data-k="${name}"]`

const stat = (key, cls, tier = '') => `<div class="col cell${tier}"><span class="lb ell" data-k="lb${key}"></span>${figure(cls, key.toLowerCase())}</div>`
const SUMMARY = {
  Tall: `${stat('Net', 'n md')}${stat('Rate', 'n md')}`,
  M: `${stat('Net', 'n md')}${stat('Rate', 'n md')}${stat('Best', 'n md')}${stat('Worst', 'n md')}`,
  // Best and Worst are the Banner's secondary stats: a snug tile keeps the net and the rate (the summary text has all four).
  // A Banner stacked under 700px, on a 150px row, goes without them too: with them the year gets no room at all, and a weekday name has no row to sit in.
  Banner: `${stat('Net', 'n md')}${stat('Rate', 'n md')}${stat('Best', 'n md', ' sec')}${stat('Worst', 'n md', ' sec')}`,
}

const SKELETONS = {
  Tall: `${header()}<div class="g2">${sk(70, 16)}${sk(70, 16)}</div><div class="calsk"><span class="sk"></span></div>`,
  M: `${header()}<div class="g4">${sk(70, 16)}${sk(70, 16)}${sk(70, 16)}${sk(70, 16)}</div><div class="calsk"><span class="sk"></span></div>`,
  Banner: `${header()}<div class="body"><div class="g4 sum">${sk(70, 16)}${sk(70, 16)}${sk(70, 16)}${sk(70, 16)}</div><div class="calsk"><span class="sk"></span></div></div>`,
}

const setAttr = (el, name, value) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

export class TsPnlCalendar extends TsWidget {
  static catalogKey = 'pnlCalendar'
  static emptyText = EN['widget.pnlCalendar.empty']
  static dataShape = Object.freeze({
    days: Object.freeze({ kind: 'array', of: Object.freeze({ date: 'time', pnl: 'numeric' }) }),
    today: Object.freeze({ kind: 'time', optional: true }),
    asOf: Object.freeze({ kind: 'time', optional: true }),
    live: Object.freeze({ kind: 'boolean', optional: true }),
  })

  static styles = `${FIGURE_CSS}
[hidden] { display: none !important; }
.body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.sum { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; }
.sum.m, .body.m .sum { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.calwrap { flex: 1; min-height: 0; display: flex; flex-direction: column; position: relative; }
/* Time runs left to right in every locale, so the calendar never mirrors. */
.cal { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 6px; direction: ltr; }
.band { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 2px; }
.mrow, .rw { display: flex; gap: 2px; min-width: 0; }
.rw { flex: 1; min-height: 0; }
.mrow { flex: none; block-size: 12px; }
.mw { flex: 1; min-width: 0; }
.mo { display: block; font-size: var(--ts-text-2xs, max(9px, .5625rem)); line-height: 12px; color: var(--ts-muted); white-space: nowrap; unicode-bidi: plaintext; }
.sp, .wl { flex: none; inline-size: 2.4em; }
.wl { font-size: var(--ts-text-2xs, max(9px, .5625rem)); color: var(--ts-muted); display: flex; align-items: center; white-space: nowrap; overflow: hidden; unicode-bidi: plaintext; }
.c { flex: 1; min-height: 0; min-width: 0; border-radius: 2px; box-sizing: border-box; background: var(--ts-surface-2); position: relative; }
.c.pos { background: color-mix(in srgb, var(--ts-profit) var(--s, 100%), transparent); }
.c.neg { background: color-mix(in srgb, var(--ts-loss) var(--s, 100%), transparent); }
/* A day not yet traded is an outline, not a fill. */
.c.up { background: transparent; box-shadow: inset 0 0 0 1px var(--ts-line); }
/* A loss can carry a corner mark so it does not depend on colour alone. It is off by default: --ts-loss-mark is transparent, so the corner draws nothing, and a host or the cvd palette sets a colour to turn it on (RFC 0005 Decision 95). Every cell's name and the summary carry the signed figure either way. */
.c.neg::after { content: ''; position: absolute; inset-block-start: 0; inset-inline-end: 0; inline-size: 45%; block-size: 45%; max-inline-size: 7px; max-block-size: 7px; background: var(--ts-loss-mark, transparent); clip-path: polygon(0 0, 100% 0, 100% 100%); }
.c:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 1px; z-index: 1; }
/* A wide fallback face with tracking runs to about .72em a character, so the figure is sized for that and not for the shared .62. */
.cell .md { font-size: min(var(--ts-text-2xl, max(17px, 1.0625rem)), calc(100cqi / (var(--fc, 10) * .72 + .65))); }
.none { color: var(--ts-muted); font-size: var(--ts-text-md, max(12px, .75rem)); text-align: center; padding-block-start: 4px; unicode-bidi: plaintext; }
.calsk { flex: 1; min-height: 40px; position: relative; }
.calsk .sk { position: absolute; inset: 0; width: auto; }
@container (max-width: 260px) { .sp, .wl { display: none; } }
/* Four figures in a row need about 80px each: on a narrow M they take two rows of two. */
@container (max-width: 420px) { .body.m .sum { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* A phone's Banner stacks its two bands; a wide one keeps the figures beside the year. */
@container (min-width: 700px) {
  .body.banner { flex-direction: row; gap: 20px; }
  .body.banner .sum { grid-template-columns: repeat(2, minmax(0, 1fr)); inline-size: 280px; flex: none; align-content: center; }
  .body.banner .calwrap { flex: 1; min-width: 0; }
}
@container ts-tile (max-width: 699px) and (max-height: 8.5rem) { .body.banner .sum .sec, .body.banner .sp, .body.banner .wl { display: none; } }
/* Forced colours drop backgrounds the page set, so the heat is drawn again from system colours: a gain in Highlight,
   a loss in CanvasText with a double border and its corner (kept on here, since colour is gone and the corner is then the only shape cue), both stepped by strength, a flat day in ButtonFace, a
   day with no entry dotted and a day to come dashed. */
@media (forced-colors: active) {
  .c { forced-color-adjust: none; border: 1px solid CanvasText; }
  .c.none { background: transparent; border-style: dotted; }
  .c.flat { background: ButtonFace; }
  .c.pos { background: color-mix(in srgb, Highlight var(--s, 100%), transparent); }
  .c.neg { background: color-mix(in srgb, CanvasText var(--s, 100%), transparent); border: 3px double CanvasText; }
  .c.neg::after { background: Highlight; }
  .c.up { background: transparent; border-style: dashed; box-shadow: none; }
}
`

  static template(variant) {
    const v = WEEKS[variant] ? variant : 'M'
    return `${header({ dot: true, meta: true })}
<div class="body ${v.toLowerCase()}">
<div class="sum">${SUMMARY[v]}</div>
<div class="calwrap">
<div class="cal" data-k="grid" role="grid" aria-label="" aria-describedby="summary"></div>
<span class="visually-hidden" id="summary" data-k="summary"></span>
<div class="none" data-k="none" hidden></div>
</div>
</div>`
  }

  static skeleton(variant) {
    return SKELETONS[variant] || SKELETONS.M
  }

  static calendarModel(data, variant, ctx) {
    return calendarModel(data, variant, ctx)
  }

  static viewModel(data, variant, ctx) {
    return calendarModel(data, variant, ctx)
  }

  // Whether a Banner is too narrow for a year in one band: measured, since the tile decides it, not the page.
  viewContext() {
    const width = typeof this.getBoundingClientRect === 'function' ? this.getBoundingClientRect().width : 0
    this._phone = width > 0 && width < BAND_BELOW
    return { phone: this._phone }
  }

  constructor() {
    super()
    this._cells = new Map()
    this._model = null
    this._rove = null
    this._shape = ''
    this._section.addEventListener('keydown', (e) => {
      const cell = e.target && e.target.closest ? e.target.closest('.c') : null
      if (!cell || !this._model || e.altKey || e.metaKey) return
      const to = moveFocus(this._model.bands, cell.getAttribute('data-d'), e.key, e.ctrlKey)
      if (to === null) return
      e.preventDefault()
      this._focusCell(to)
    })
    // A click or a tab landing on a cell makes it the one the grid returns to.
    this._section.addEventListener('focusin', (e) => {
      const cell = e.target && e.target.closest ? e.target.closest('.c') : null
      if (cell) this._setRove(cell.getAttribute('data-d'))
    })
  }

  connectedCallback() {
    super.connectedCallback()
    // A dashboard left open across midnight rolls its window forward: the day is read from the clock on every render.
    this.every(60000)
    // A Banner changing width across the fold re-renders into one band or two.
    if (!this._resize && typeof ResizeObserver !== 'undefined') {
      this._resize = new ResizeObserver(() => {
        const width = this.getBoundingClientRect().width
        const phone = width > 0 && width < BAND_BELOW
        if (this.variant === 'Banner' && phone !== this._phone) this.requestRender()
      })
    }
    if (this._resize) this._resize.observe(this)
  }

  disconnectedCallback() {
    if (this._resize) this._resize.disconnect()
    super.disconnectedCallback()
  }

  _focusCell(date) {
    this._setRove(date)
    const cell = this._cells.get(date)
    if (cell) cell.focus()
  }

  // Exactly one cell is a tab stop; the others are reached by the arrow keys.
  _setRove(date) {
    if (date === this._rove && this._cells.has(date) && this._cells.get(date).getAttribute('tabindex') === '0') return
    this._rove = date
    for (const [d, cell] of this._cells) setAttr(cell, 'tabindex', d === date ? '0' : '-1')
  }

  // The grid's nodes are made here and not by the template, because how many there are depends on the locale's week.
  // A row of the grid is one weekday across the weeks; the month names above are decoration (aria-hidden).
  _build(grid, vm, labels) {
    const doc = grid.ownerDocument
    // The window and the weekday order are in the key: a new week, or a locale with another first day, redraws the dates.
    const starts = vm.bands.map((b) => b.weeks[0].cells[0].date).join()
    const shape = `${vm.variant}|${vm.bands.length}|${vm.bands[0].weeks.length}|${starts}|${vm.rowLabels.join()}|${labels}`
    // The template is rebuilt on leaving the loading, empty or error view, which leaves a new, empty grid node.
    if (this._shape === shape && this._gridNode === grid && this._cells.size) return false
    this._gridNode = grid
    const held = this._section.getRootNode().activeElement
    const hadFocus = held && grid.contains(held) ? held.getAttribute('data-d') : null
    while (grid.firstChild) grid.removeChild(grid.firstChild)
    this._cells = new Map()
    const make = (tag, cls, role) => {
      const el = doc.createElement(tag)
      el.setAttribute('class', cls)
      if (role) el.setAttribute('role', role)
      return el
    }
    for (const band of vm.bands) {
      const group = make('div', 'band', 'rowgroup')
      const names = make('div', 'mrow')
      names.setAttribute('aria-hidden', 'true')
      if (labels) names.appendChild(make('span', 'sp'))
      for (let w = 0; w < band.weeks.length; w++) {
        const slot = make('span', 'mw')
        slot.appendChild(make('span', 'mo'))
        names.appendChild(slot)
      }
      group.appendChild(names)
      for (let r = 0; r < vm.rows; r++) {
        const row = make('div', 'rw', 'row')
        if (labels) {
          const name = make('span', 'wl')
          name.setAttribute('aria-hidden', 'true')
          row.appendChild(name)
        }
        for (const week of band.weeks) {
          const cell = week.cells[r]
          const el = make('span', 'c', 'gridcell')
          el.setAttribute('tabindex', '-1')
          el.setAttribute('data-d', cell.date)
          row.appendChild(el)
        }
        group.appendChild(row)
      }
      grid.appendChild(group)
    }
    // Cells by date; the same date is never drawn twice.
    for (const el of grid.querySelectorAll ? grid.querySelectorAll('.c') : grid.all('.c')) this._cells.set(el.getAttribute('data-d'), el)
    this._shape = shape
    this._pendingFocus = hadFocus
    return true
  }

  update(vm, variant) {
    const text = (key, value) => {
      const el = this.$(k(key))
      if (el && el.textContent !== value) el.textContent = value
    }
    const t = this.t
    text('label', vm.label)
    const fig = (key, arrow, value, tone, base = 'n md') => {
      text(`${key}Ar`, arrow)
      text(`${key}V`, value)
      const el = this.$(k(key))
      if (el) {
        setAttr(el, 'class', tone ? `${base} ${tone}` : base)
        el.style.setProperty('--fc', String(value.length))
      }
    }
    text('lbNet', t('calendar.net'))
    fig('net', vm.netArrow, vm.net, vm.netClass)
    this.flash('net', vm.netNum)
    text('lbRate', t('calendar.greenRate'))
    text('rateV', vm.rate)
    text('rateAr', '')
    if (variant !== 'Tall') {
      text('lbBest', t('calendar.best'))
      text('lbWorst', t('calendar.worst'))
      fig('best', vm.bestArrow, vm.best, vm.bestClass)
      fig('worst', vm.worstArrow, vm.worst, vm.worstClass)
    }
    // Under the grid: what is missing from it, in words.
    const none = this.$(k('none'))
    text('none', vm.empty ? t('calendar.noDays') : vm.note)
    none.toggleAttribute('hidden', !vm.empty && !vm.note)

    const grid = this.$(k('grid'))
    // The grid's name is short; the summary of best day, worst day and net is its description.
    setAttr(grid, 'aria-label', vm.label)
    text('summary', vm.chartLabel)
    const labels = variant !== 'Tall'
    const rebuilt = this._build(grid, vm, labels)
    this._model = vm

    // Month names and weekday names sit in the nodes the build made, in grid order.
    const months = grid.querySelectorAll ? [...grid.querySelectorAll('.mo')] : grid.all('.mo')
    let m = 0
    for (const band of vm.bands) {
      for (const week of band.weeks) {
        const node = months[m++]
        if (node.textContent !== week.month) node.textContent = week.month
      }
    }
    if (labels) {
      const names = grid.querySelectorAll ? [...grid.querySelectorAll('.wl')] : grid.all('.wl')
      names.forEach((node, i) => {
        const name = vm.rowLabels[i % vm.rows]
        if (node.textContent !== name) node.textContent = name
      })
    }

    // Each cell: its kind, the strength as one custom property, and its name.
    for (const band of vm.bands) {
      for (const week of band.weeks) {
        for (const cell of week.cells) {
          const el = this._cells.get(cell.date)
          if (!el) continue
          setAttr(el, 'class', `c ${cell.kind}`)
          setAttr(el, 'aria-label', cell.name)
          if (cell.strength !== null) {
            const pct = `${Math.round(cell.strength * 100)}%`
            if (el.style.getPropertyValue('--s') !== pct) el.style.setProperty('--s', pct)
          }
        }
      }
    }

    // A tab stop that is still in the grid stays; else today's cell, or the last day up to it.
    const rove = this._rove && this._cells.has(this._rove) ? this._rove : vm.focusDate
    this._rove = null
    this._setRove(rove)
    // A rebuild must not drop the focus a keyboard reader held.
    if (rebuilt && this._pendingFocus && this._cells.has(this._pendingFocus)) this._cells.get(this._pendingFocus).focus()
    this._pendingFocus = null
  }
}
