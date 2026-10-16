/**
 * What <ts-watchlist> and <ts-open-positions> share (RFC 0003 §21.3): reading
 * the rows they are given, the marks of a range bar, the path of a sparkline,
 * and the few nodes that draw those in place.
 *
 * The bar and the sparkline are drawn without markup built from data. A mark's
 * place is one custom property set through the CSSOM (a `style` attribute in
 * markup would be blocked by a strict style-src, a property set from script is
 * not), so a tick that moves a price writes one property, not a rebuilt row.
 *
 * Internal: not exported from the package. Like rows.js it touches the DOM only
 * through the document it is handed.
 */

import { linePaths } from './chart.js'
import { toNumber, toTime } from '../core/index.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

const isObj = (v) => v !== null && typeof v === 'object'

/** The rows that can be shown (an object with an id, the first of each id), and how many were not. */
export function readItems(list) {
  const out = []
  const seen = new Set()
  let dropped = 0
  if (!Array.isArray(list)) return { out, dropped }
  for (const r of list) {
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

/** A number from a Numeric field, or NaN: a missing field is not zero. */
export function numberOf(v) {
  return v === undefined || v === null || v === '' ? NaN : toNumber(v)
}

/** A whole number of decimals, 0 to 20, or undefined for the formatter's own. */
export function decimalsOf(v) {
  return Number.isInteger(v) && v >= 0 && v <= 20 ? v : undefined
}

/**
 * Where `v` falls between `from` and `to` (in either order), as 0 to 100 with
 * one decimal. A value outside the range sits at its end: the bar shows where
 * the price is held to, and the words beside it say the truth. A range with no
 * extent puts the mark in the middle; a value that is not a number has no place.
 */
export function barPosition(v, from, to) {
  if (!Number.isFinite(v) || !Number.isFinite(from) || !Number.isFinite(to)) return NaN
  if (from === to) return 50
  return Math.round(Math.min(1, Math.max(0, (v - from) / (to - from))) * 1000) / 10
}

// The sparkline's drawing box: stretched to its cell, so only its aspect matters.
export const SPARK_BOX = Object.freeze({ width: 96, height: 28 })
// A sparkline is as wide as a few dozen pixels; a day of ticks drawn point by point is a long path for nothing.
export const SPARK_POINTS = 96

/**
 * The line of a price series, `[{ t, price }]` in any order, or null when
 * fewer than two points can be read: one reading is not a trend. `first` and
 * `last` are the prices at its ends. A long series keeps its first and last
 * points and an even share of those between.
 */
export function sparkModel(series) {
  if (!Array.isArray(series)) return null
  const pts = []
  for (const p of series) {
    if (!isObj(p)) continue
    const x = toTime(p.t)
    const y = numberOf(p.price)
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y })
  }
  if (pts.length < 2) return null
  // A feed sends its ticks in order, and sorting 300 of them for each of 50 rows on every update is work for nothing.
  let ordered = true
  for (let i = 1; i < pts.length && ordered; i++) ordered = pts[i - 1].x <= pts[i].x
  if (!ordered) pts.sort((a, b) => a.x - b.x)
  let kept = pts
  if (pts.length > SPARK_POINTS) {
    kept = []
    const step = (pts.length - 1) / (SPARK_POINTS - 1)
    for (let i = 0; i < SPARK_POINTS; i++) kept.push(pts[Math.round(i * step)])
  }
  const { line } = linePaths(kept, { ...SPARK_BOX, pad: 3, includeZero: false })
  return { line, first: pts[0].y, last: pts[pts.length - 1].y }
}

// ── Drawing ───────────────────────────────────────────────────────────────

const setAttr = (el, name, value) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

const setVar = (el, name, value) => {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value)
}

const part = (doc, cls) => {
  const el = doc.createElement('span')
  el.setAttribute('class', cls)
  return el
}

/**
 * A range bar's nodes. 'day' fills from the low to the price; 'range' shades the
 * loss side and the profit side of the entry. Every mark is its own node, so a
 * tick moves the one that moved.
 */
export function createBar(doc, kind) {
  const box = doc.createElement('span')
  box.setAttribute('part', 'bar')
  box.setAttribute('role', 'img')
  box.setAttribute('class', `rb ${kind}`)
  const marks = kind === 'day' ? ['fl', 'pt'] : ['zl', 'zp', 'tk', 'pt']
  for (const cls of marks) box.appendChild(part(doc, cls))
  return box
}

/**
 * `bar` is `{ entry, now }` (0 to 100 along the bar, entry null for none) and
 * `label` its text alternative. Each write is skipped when it changes nothing.
 */
export function writeBar(box, kind, bar, label) {
  const noEntry = kind === 'range' && bar.entry === null
  const noNow = bar.now === null
  setAttr(box, 'class', `rb ${kind}${noEntry ? ' noe' : ''}${noNow ? ' non' : ''}`)
  setAttr(box, 'aria-label', label)
  if (!noNow) setVar(box, '--n', String(bar.now))
  if (kind === 'range' && !noEntry) setVar(box, '--e', String(bar.entry))
}

/** A sparkline's nodes: an `<svg>` with one path, which the cell stretches. */
export function createSpark(doc) {
  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', `0 0 ${SPARK_BOX.width} ${SPARK_BOX.height}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  svg.setAttribute('role', 'img')
  svg.setAttribute('part', 'chart')
  svg.setAttribute('focusable', 'false')
  svg.setAttribute('class', 'sprk mut')
  svg.appendChild(doc.createElementNS(SVG_NS, 'path'))
  return svg
}

/** `spark` is `{ line, label, tone }`, or null to hide it. */
export function writeSpark(svg, spark) {
  if (!spark) {
    if (!svg.hasAttribute('hidden')) svg.setAttribute('hidden', '')
    return
  }
  if (svg.hasAttribute('hidden')) svg.removeAttribute('hidden')
  setAttr(svg, 'class', `sprk ${spark.tone}`)
  setAttr(svg, 'aria-label', spark.label)
  setAttr(svg.firstChild, 'd', spark.line)
}

/**
 * The last rule of each widget's styles. A class that sets its own `display` (the bar, the summary line, a button) would
 * outrank the bare attribute rule if it came after it, so a bar or a line with nothing to show would still be drawn.
 */
export const HIDDEN_CSS = `
[hidden] { display: none; }
`

/** The rules of the bar and the sparkline, for each widget's own styles. Tokens and logical properties only. */
export const PARTS_CSS = `
.sp { box-sizing: border-box; inline-size: 84px; min-inline-size: 84px; padding-inline: 10px; vertical-align: middle; }
.sprk { display: block; inline-size: 100%; block-size: 24px; direction: ltr; overflow: visible; }
.sprk path { fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.sprk.pos { color: var(--ts-profit); }
.sprk.neg { color: var(--ts-loss); }
.sprk.mut { color: var(--ts-muted); }
/* The bar always reads left to right, low to high: it is a number line, not text. */
.rb { position: relative; display: block; box-sizing: border-box; inline-size: 100%; block-size: 6px; border-radius: 3px; background: var(--ts-surface-2); direction: ltr; }
.rb > * { position: absolute; inset-block: 0; }
.fl { inset-inline-start: 0; inline-size: calc(var(--n, 0) * 1%); border-radius: 3px; background: var(--ts-axis); }
.zl { inset-inline-start: 0; inline-size: calc(var(--e, 0) * 1%); border-start-start-radius: 3px; border-end-start-radius: 3px; background: color-mix(in srgb, var(--ts-loss) 38%, transparent); }
.zp { inset-inline-start: calc(var(--e, 0) * 1%); inset-inline-end: 0; border-start-end-radius: 3px; border-end-end-radius: 3px; background: color-mix(in srgb, var(--ts-profit) 38%, transparent); }
.tk { inset-block: -2px; inset-inline-start: calc(var(--e, 0) * 1%); inline-size: 2px; margin-inline-start: -1px; border-radius: 1px; background: var(--ts-ink); }
.pt {
  inset-block: auto; inset-block-start: 50%; inset-inline-start: calc(var(--n, 0) * 1%); box-sizing: border-box; inline-size: 12px; block-size: 12px;
  margin-inline-start: -6px; margin-block-start: -6px; border-radius: 50%; background: var(--ts-ink); border: 2px solid var(--ts-surface);
}
.range.noe .zl, .range.noe .zp, .range.noe .tk, .non .pt { display: none; }
.range.noe { background: var(--ts-surface-2); }
/* Backgrounds are dropped in forced colours, so the track gets an outline and the marks keep a border of the system's own colours. */
@media (forced-colors: active) {
  .rb { border: 1px solid CanvasText; background: ButtonFace; }
  .fl, .zl, .zp { background: transparent; border-inline-end: 2px solid CanvasText; }
  .zp { border-inline-end: 0; }
  .tk { background: CanvasText; }
  .pt { background: Highlight; border-color: CanvasText; }
  .sprk path { stroke: CanvasText; }
}
`
