/**
 * Chart scrubbing, the half the three charts share (RFC 0004 §1). Internal: no package entry exports it.
 *
 * A chart's view model carries `ScrubData`, numbers only (see readoutAt): where each drawn point falls, in the
 * drawing's viewBox units, and the value of every series at it. Nothing is formatted per point there. This module
 * formats the point under the pointer on demand, moves a rule, a dot per series and a read-out over the plot, and
 * keeps one tab stop for the keyboard: a `role="slider"` whose `aria-valuetext` is the same text. It also keeps the
 * visually hidden table of the last 12 drawn points, which is how a screen reader reads the data.
 *
 * The overlay writes only transforms and text while it follows a pointer, so a move costs no reflow, and every
 * node it touches is in the widget's constant template: no markup is built here, and no style attribute is written
 * (RFC 0003 §14). Nothing is aria-live; assistive technology speaks a changed value text of the focused slider itself.
 */

import { arrowFor } from './widget.js'
import { nearestPoint, plotFraction } from './chart.js'
import { setText } from './rows.js'

/** Drawn points the hidden table lists, newest last (Decision 41). */
export const TABLE_ROWS = 12
// Page Up and Page Down move this many points; Home and End jump to the ends.
const PAGE = 10
// The gap between the rule and the read-out, in px.
const GAP = 10
// Beyond this a figure is written as a power of ten, so 1e300 is not 300 digits in a screen reader's ear.
const BIG = 1e15
const MINUS = '−'

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const upTo = (n) => Array.from({ length: n }, (_, i) => i + 1)

// ── Markup (constant) ─────────────────────────────────────────────────────

/**
 * The overlay, the slider and the hidden table, for a plot box with `dots` marks and room for `items` read-out lines.
 * Static and textless, so a template stays a pure function of its variant; update() fills it. `coloured` gives each
 * dot its series colour (`c-1`..`c-6`); otherwise a dot is `--ts-ink`.
 */
export function scrubMarkup(dots, items, coloured = false) {
  const dot = upTo(dots).map((i) => `<i class="sc-dot${coloured ? ` c-${i}` : ''}" part="scrub-dot" hidden></i>`).join('')
  const item = '<span class="sc-it" hidden><span class="sc-n ell"></span><span class="sc-v"></span></span>'.repeat(items)
  return `<div class="sc-box" part="scrub" data-k="scrub" aria-hidden="true" hidden><i class="sc-rule" part="scrub-rule" data-k="scrubRule"></i>${dot}<span class="sc-out" part="scrub-readout" data-k="scrubOut"><span class="sc-lab" data-k="scrubLab"></span>${item}</span></div>`
    + '<div class="sc-slider" role="slider" tabindex="0" aria-valuemin="0" data-k="scrubSlider" hidden></div>'
    + '<div class="visually-hidden" data-k="scrubTbl" hidden><table><caption data-k="scrubCap"></caption><thead><tr data-k="scrubHead"></tr></thead><tbody data-k="scrubBody"></tbody></table></div>'
}

/**
 * The overlay's rules. The plot box (class `sc`) pans vertically by touch so a horizontal drag is the scrub; the
 * read-out sits on --ts-surface-2 with --ts-ink text only (ACCESSIBILITY item 14), and has no transition at all.
 */
export const SCRUB_CSS = `
.sc { touch-action: pan-y; }
.sc-box, .sc-slider { position: absolute; inset: 0; pointer-events: none; }
.sc-rule, .sc-dot, .sc-out { position: absolute; inset-block-start: 0; inset-inline-start: 0; }
.sc-rule { inset-block-end: 0; inline-size: 1px; background: var(--ts-axis); }
.sc-dot { box-sizing: border-box; inline-size: 10px; block-size: 10px; margin-block-start: -5px; margin-inline-start: -5px; border-radius: 50%; border: 2px solid var(--ts-surface); background: var(--c, var(--ts-ink)); }
.sc-out { display: flex; flex-direction: column; padding: 4px 6px; border-radius: var(--ts-radius-sm); border: 1px solid var(--ts-line); background: var(--ts-surface-2); color: var(--ts-ink); font-size: 11px; line-height: 1.3; white-space: nowrap; }
.sc-lab { font-weight: 600; }
.sc-it { display: flex; justify-content: space-between; gap: 10px; }
.sc-lab, .sc-n { unicode-bidi: plaintext; }
.sc-v { font-family: var(--ts-font-num); font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
.sc-slider:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: -2px; }
@media (forced-colors: active) {
  .sc-rule { background: CanvasText; }
  .sc-dot { background: Highlight; border-color: ButtonFace; }
  .sc-out { background: ButtonFace; color: CanvasText; border-color: CanvasText; }
}
`

// ── Formatting (pure) ─────────────────────────────────────────────────────

/**
 * One value as its series spec says: `{ kind: 'money' | 'percent' | 'duration' | 'number', unit?, decimals?, sign? }`
 * (sign defaults to 'negative'; a P&L chart passes 'always'). The same function names a <ts-chart> value in its
 * label and in the read-out, so the two never differ.
 */
export function formatValue(fmt, spec, n) {
  const o = { sign: spec.sign || 'negative', decimals: spec.decimals }
  if (Math.abs(n) >= BIG) return `${n < 0 ? MINUS : ''}${Math.abs(n).toExponential(2)}`
  switch (spec.kind) {
    case 'money':
      return fmt.money(n, o)
    case 'percent':
      return fmt.percent(n, o)
    case 'duration': {
      const s = fmt.duration(Math.abs(n))
      return Number.isFinite(n) && n < 0 ? `${MINUS}${s}` : s
    }
    default:
      return spec.unit ? fmt.unit(n, spec.unit, { decimals: spec.decimals }) : fmt.number(n, o)
  }
}

/**
 * ScrubData for a line chart drawn by `linePaths`: its `drawn` points, the scales that placed them, and the series
 * to read (`ys` the value at each drawn point, `mark` whether it has a dot). `extra` adds `labels`.
 */
export function lineScrub(kind, box, drawn, x, y, series, extra) {
  return {
    kind,
    xs: drawn.map((p) => p.x),
    points: drawn.map((p) => ({ x: x(p.x), y: y(p.y) })),
    box,
    domain: [box.pad, box.width - box.pad],
    series: series.map((s) => ({ name: s.name, signed: true, fmt: { kind: 'money', sign: 'always' }, ys: drawn.map(s.ys), py: s.mark ? drawn.map((p) => y(p.y)) : null })),
    ...extra,
  }
}

const xLabel = (d, i, fmt) =>
  d.kind === 'time' || d.kind === 'date'
    ? fmt[d.kind](d.xs[i])
    : d.kind === 'day'
      ? fmt.date(d.labels[i])
      : d.kind === 'category'
        ? d.labels[d.xs[i]] || ''
        : fmt.number(d.xs[i], { sign: 'negative' })

/**
 * The text one point shows, for the read-out and for the table's rows: `label` (its x as the axis reads it) and one
 * `{ name, value, arrow }` per series. A series with nothing at this point reads `chart.scrubNone`. Pure, and run for
 * the point under the pointer and for the table's rows only, never for every point.
 *
 * `d` is the chart's ScrubData, numbers only:
 *   kind    'time' | 'date' | 'day' | 'number' | 'category': how x reads as a label
 *   xs      each drawn point's x in data units, ascending (a category's band index)
 *   labels  the categories ('category') or the ISO days ('day')
 *   points  each point as { x, y } in the drawing's viewBox units, for nearestPoint; y is the first mark's
 *   box     { width, height, pad }, the viewBox the points are in; domain: [pad, width - pad]
 *   series  [{ name, mark (draws a dot), signed (carries a sign and an arrow), fmt, ys, py }], ys the value at
 *           each point (NaN where the series has none) and py the dot's y in viewBox units
 */
export function readoutAt(d, i, ctx) {
  const { fmt, t } = ctx
  return {
    label: xLabel(d, i, fmt),
    items: d.series.map((s) => {
      const y = s.ys[i]
      if (!Number.isFinite(y)) return { name: s.name, value: t('chart.scrubNone'), arrow: '' }
      const value = formatValue(fmt, s.fmt, y)
      return { name: s.name, value, arrow: s.signed ? arrowFor(value) : '' }
    }),
  }
}

// The join is the locale's own list separator, not a message (RFC 0003 §8).
const join = (fmt, parts) => new Intl.ListFormat(fmt.locale, { style: 'long', type: 'conjunction' }).format(parts)

/** "Mon 12 Oct: Equity +₹5,000 and Day −₹120": what the slider's `aria-valuetext` says. */
export const valueText = (ro, ctx) => ctx.t('chart.scrubValue', { label: ro.label, values: join(ctx.fmt, ro.items.map((it) => `${it.name} ${it.value}`)) })

// ── The binding ───────────────────────────────────────────────────────────

// A header or data cell; the scope is what makes a header a column's or a row's.
const cell = (tag, scope, text) => {
  const el = document.createElement(tag)
  if (scope) el.setAttribute('scope', scope)
  if (text !== undefined) el.textContent = text
  return el
}

const HEADS = { time: 'chart.scrubTableX', date: 'chart.scrubTableDate', day: 'chart.scrubTableDate', number: 'chart.scrubTableNumber', category: 'chart.scrubTableCategory' }

/**
 * Pointer, touch and keyboard for one chart widget. Made once in the widget's constructor; the widget calls `sync`
 * from update() with the view model's ScrubData (or null where there is no plot to read). Listeners sit on the tile,
 * so they survive the template being rebuilt for another size, and look the nodes up when they run.
 */
export class Scrubber {
  constructor(widget, raf = typeof requestAnimationFrame === 'function' ? (fn) => requestAnimationFrame(fn) : (fn) => fn()) {
    this.w = widget
    this.raf = raf
    this.index = 0
    this.data = this.at = this.refsFor = this.r = null
    this.shown = this.touching = this.focused = this.queued = false
    // Each event is the method of its own name.
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'pointerleave', 'keydown', 'focusin', 'focusout']) {
      widget._section.addEventListener(type, (e) => this[type](e))
    }
    // The grid says when editing starts or stops, so the tab stop follows it without a render.
    widget._onEditChange = () => this.syncEditing()
  }

  // The nodes of the current template, found again when the template was rebuilt (the widget's $ cache is dropped then).
  refs() {
    const w = this.w
    const box = w.$('[data-k="scrub"]')
    if (!box) return null
    if (box === this.refsFor) return this.r
    const q = (k) => w.$(`[data-k="${k}"]`)
    // A rebuilt template (another size) starts hidden, whatever the old one was doing.
    this.refsFor = box
    this.shown = false
    this.touching = false
    // The dots and the read-out's lines are found by their place, so the template needs no name for each.
    this.r = { box, plot: q('plot'), rule: q('scrubRule'), dots: [...box.querySelectorAll('.sc-dot')], out: q('scrubOut'), lab: q('scrubLab'), items: [...box.querySelectorAll('.sc-it')], slider: q('scrubSlider'), tbl: q('scrubTbl'), cap: q('scrubCap'), head: q('scrubHead'), body: q('scrubBody') }
    return this.r
  }

  ctx() {
    return { fmt: this.w.formatter, t: this.w.t }
  }

  // Scrubbing exists for a plot of two or more points, with scrub on, and never while the grid edits.
  can() {
    const d = this.data
    return Boolean(d && d.points.length > 1 && this.w._scrubOn() && !this.w._isEditing())
  }

  // ── Pointer ──

  pointerdown(e) {
    if (e.pointerType !== 'touch' || !this.can()) return
    const r = this.refs()
    if (!r) return
    const b = r.plot.getBoundingClientRect()
    if (e.clientX < b.left || e.clientX > b.right || e.clientY < b.top || e.clientY > b.bottom) return
    this.touching = true
    this.queue(e)
  }

  pointermove(e) {
    // A finger scrubs only once it went down on the plot; a mouse or a pen hovers.
    if (e.pointerType === 'touch' ? this.touching : this.data) this.queue(e)
  }

  pointerup() {
    if (!this.touching) return
    this.touching = false
    this.leave()
  }

  pointercancel() {
    this.pointerup()
  }

  pointerleave(e) {
    if (e.pointerType !== 'touch') this.leave()
  }

  // One write per animation frame, whatever the pointer's rate.
  queue(e) {
    this.at = { x: e.clientX, y: e.clientY }
    if (this.queued) return
    this.queued = true
    this.raf(() => {
      this.queued = false
      this.follow()
    })
  }

  follow() {
    const at = this.at
    if (!at) return
    if (!this.can()) return this.hide()
    const r = this.refs()
    if (!r) return
    const b = r.plot.getBoundingClientRect()
    // A finger may drift off the plot while it drags, and reads the nearest end; a mouse that did leaves.
    const out = !this.touching && (at.x < b.left || at.x > b.right || at.y < b.top || at.y > b.bottom)
    if (out || !(b.width > 0)) {
      if (!this.touching) this.leave()
      return
    }
    const d = this.data
    const hit = nearestPoint(d.points, plotFraction(clamp((at.x - b.left) / b.width, 0, 1), d.box), { domain: d.domain })
    if (hit) this.show(hit.index)
  }

  // The pointer is gone: back to the keyboard's point if the slider has focus, else nothing.
  leave() {
    this.at = null
    if (this.focused && this.can()) this.show(this.index)
    else this.hide()
  }

  // ── Keyboard ──

  focusin(e) {
    if (!this.r || e.target !== this.r.slider) return
    this.focused = true
    this.syncEditing()
    // The last point is the one the headline names, so it is where reading starts.
    if (this.can()) this.show(this.data.points.length - 1)
  }

  focusout(e) {
    if (!this.r || e.target !== this.r.slider) return
    this.focused = false
    this.hide()
  }

  keydown(e) {
    const slider = this.r && this.r.slider
    if (!slider || e.target !== slider || !this.can()) return
    const last = this.data.points.length - 1
    const at = this.index
    let to
    switch (e.key) {
      // Time runs left to right in every locale, so the arrows mean earlier and later, never start and end.
      case 'ArrowLeft':
        to = at - 1
        break
      case 'ArrowRight':
        to = at + 1
        break
      case 'PageDown':
        to = at - PAGE
        break
      case 'PageUp':
        to = at + PAGE
        break
      case 'Home':
        to = 0
        break
      case 'End':
        to = last
        break
      case 'Escape':
        if (!this.shown) return
        e.preventDefault()
        this.hide()
        return
      default:
        return
    }
    e.preventDefault()
    this.show(clamp(to, 0, last))
  }

  // ── The overlay ──

  show(index) {
    const r = this.refs()
    const d = this.data
    if (!r || !d) return
    const i = clamp(index, 0, d.points.length - 1)
    this.index = i
    const ro = readoutAt(d, i, this.ctx())
    setText(r.lab, ro.label)
    r.items.forEach((slot, k) => {
      const it = ro.items[k]
      slot.toggleAttribute('hidden', !it)
      if (!it) return
      setText(slot.firstChild, it.name)
      // The overlay is aria-hidden as a whole, so the arrow is plain text beside the value.
      setText(slot.lastChild, it.arrow ? `${it.arrow} ${it.value}` : it.value)
    })
    // The slider follows the keyboard (and a pointer while it has focus); a hover leaves it at rest, so it never writes.
    if (this.focused) this.slide(i, ro)

    // Pixels per viewBox unit: the drawing is stretched to its box.
    const b = r.plot.getBoundingClientRect()
    const kx = b.width / d.box.width
    const ky = b.height / d.box.height
    const x = d.points[i].x * kx
    r.rule.style.transform = `translate(${x}px, 0)`
    let first = NaN
    r.dots.forEach((dot, k) => {
      const s = d.series[k]
      const py = s && s.py ? s.py[i] : NaN
      const has = Number.isFinite(py)
      dot.toggleAttribute('hidden', !has)
      if (!has) return
      if (Number.isNaN(first)) first = py
      dot.style.transform = `translate(${x}px, ${py * ky}px)`
    })
    // Shown before it is measured: a hidden box has no size.
    if (!this.shown) {
      r.box.removeAttribute('hidden')
      this.shown = true
    }
    // The read-out goes to the side of the rule that has room, and to the half of the plot the dot is not in.
    const w = r.out.offsetWidth || 0
    const h = r.out.offsetHeight || 0
    let left = x + GAP
    if (left + w > b.width) left = x - GAP - w
    left = clamp(left, 0, Math.max(0, b.width - w))
    const top = Number.isNaN(first) || first * ky >= b.height / 2 ? 4 : Math.max(0, b.height - h - 4)
    r.out.style.transform = `translate(${left}px, ${top}px)`
  }

  hide() {
    if (!this.shown) return
    this.shown = false
    const r = this.refs()
    if (r) r.box.setAttribute('hidden', '')
  }

  // The slider says what the overlay says; the screen reader speaks a changed value text of the focused control.
  slide(i, ro) {
    const r = this.r
    if (!r || !r.slider || r.slider.hasAttribute('hidden')) return
    const w = this.w
    const ctx = this.ctx()
    w._setAttr(r.slider, 'aria-valuenow', String(i))
    w._setAttr(r.slider, 'aria-valuetext', valueText(ro || readoutAt(this.data, i, ctx), ctx))
  }

  syncEditing() {
    const r = this.refs()
    if (!r || !r.slider) return
    const editing = this.w._isEditing()
    this.w._setAttr(r.slider, 'tabindex', editing ? '-1' : '0')
    this.w._setAttr(r.slider, 'aria-disabled', editing ? 'true' : null)
    if (editing) {
      this.touching = false
      this.hide()
    }
  }

  // ── From update() ──

  /** `data` is the view model's ScrubData or null; `caption` names the table. */
  sync(data, caption) {
    this.data = data
    const r = this.refs()
    if (!r) return
    const w = this.w
    const on = Boolean(data && data.points.length > 1 && w._scrubOn())
    const ctx = this.ctx()
    r.slider.toggleAttribute('hidden', !on)
    if (on) {
      const last = data.points.length - 1
      w._setAttr(r.slider, 'aria-label', ctx.t('chart.scrubSlider', { label: w.label }))
      w._setAttr(r.slider, 'aria-valuemax', String(last))
      this.syncEditing()
      // A live chart keeps the point the reader is on; at rest the slider sits on the newest.
      this.index = this.shown || this.focused ? Math.min(this.index, last) : last
      if (this.shown && this.can()) this.show(this.index)
      else this.slide(this.index)
    } else {
      this.hide()
      this.touching = false
    }
    this.table(data, caption, ctx)
  }

  // The last 12 drawn points, newest last, written in place: a new reading adds one row and drops the oldest, and a
  // changed value writes one cell, so a screen reader's cursor inside the table keeps its place.
  table(data, caption, ctx) {
    const r = this.r
    const rows = data && data.points.length > 1 ? Math.min(TABLE_ROWS, data.points.length) : 0
    r.tbl.toggleAttribute('hidden', !rows)
    // The tests' stand-in nodes have no children to keep rows in.
    if (!rows || !r.body.children) return
    const { series } = data
    const heads = [ctx.t(HEADS[data.kind]), ...series.map((s) => s.name)]
    const body = r.body
    // A new size or other series: new columns, so the rows start again.
    if (body._cols !== heads.join('\u0001')) {
      r.head.replaceChildren(...heads.map((text) => cell('th', 'col', text)))
      body.replaceChildren()
      body._cols = heads.join('\u0001')
    }
    setText(r.cap, ctx.t('chart.scrubCaption', { label: caption, count: rows }, rows))
    const list = []
    for (let i = data.points.length - rows; i < data.points.length; i++) {
      const ro = readoutAt(data, i, ctx)
      list.push({ id: data.kind === 'day' ? data.labels[i] : data.xs[i], label: ro.label, cells: ro.items.map((it) => it.value) })
    }
    // Rows are keyed by x and the window only slides: the rows before the first listed x are dropped, new ones come at
    // the end, and a cell is written only where its text changed, so a screen reader's cursor keeps its row.
    const kids = body.children
    while (kids.length && kids[0]._key !== list[0].id) body.removeChild(kids[0])
    list.forEach((row, i) => {
      if (!kids[i]) {
        const tr = body.appendChild(document.createElement('tr'))
        tr.appendChild(cell('th', 'row'))
        series.forEach(() => tr.appendChild(cell('td')))
      }
      const tr = kids[i]
      tr._key = row.id
      setText(tr.firstChild, row.label)
      row.cells.forEach((text, j) => setText(tr.children[j + 1], text))
    })
    while (kids.length > list.length) body.removeChild(body.lastChild)
  }
}
