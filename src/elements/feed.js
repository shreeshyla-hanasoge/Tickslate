/**
 * <ts-feed>: the latest events, newest first, sizes Tall · M · L (RFC 0004 §4.3).
 *
 * `feedModel` is the pure view model. The host keeps the order; the widget never
 * sorts, and it never speaks: a feed that ticks has no `aria-live`.
 *
 * The list is keyed (rows.js), so an arrival inserts one row at the front and
 * the rest are untouched. The tile keeps its size and the list scrolls inside
 * it; when the reader has scrolled away from the top, the scroll offset is moved
 * by the height the arrival added, because Safari has no scroll anchoring.
 * All text is set with textContent; no markup is built from data.
 */

import { TsWidget, sk, syncedParts, header } from './widget.js'
import { EN, toTime, localDate } from '../core/index.js'
import { readItems, HIDDEN_CSS } from './list-parts.js'
import { createRows, setText } from './rows.js'

export const DEFAULT_MAX = 50

const isObj = (v) => v !== null && typeof v === 'object'
const text = (v) => (typeof v === 'string' ? v : '')
const TONES = ['pos', 'neg', 'warn']

/** `max` as a whole number of at least 1; anything else is the default. */
export function maxOf(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(1, Math.floor(v)) : DEFAULT_MAX
}

/** The time of an event: the clock time for today, else the day and the time. */
function whenOf(fmt, now, t) {
  const ms = toTime(t)
  if (!Number.isFinite(ms)) return ''
  const clock = fmt.time(ms)
  const today = localDate(ms, fmt.timeZone) === localDate(now, fmt.timeZone)
  return today ? clock : `${fmt.date(ms, { style: 'day' })} ${clock}`
}

export function feedModel(data, variant, ctx) {
  const d = isObj(data) ? data : {}
  const { fmt, t, now } = ctx
  const read = readItems(d.items)
  let dropped = read.dropped
  const ok = []
  for (const i of read.out) {
    if (typeof i.text !== 'string' || i.text === '') dropped++
    else ok.push(i)
  }
  const max = maxOf(d.max)
  const shown = ok.slice(0, max)
  const hidden = ok.length - shown.length
  const items = shown.map((i) => {
    const tag = text(i.tag)
    const time = whenOf(fmt, now, i.time)
    return {
      id: i.id,
      text: i.text,
      time,
      tag,
      tone: tag && TONES.includes(i.tone) ? i.tone : 'mut',
      detail: text(i.detail),
      // The sentence a list navigator reads; with no time there is nothing to put first, so the row's own words stand.
      aria: time ? (tag ? t('feed.itemAria', { time, tag, text: i.text }) : t('feed.itemAriaPlain', { time, text: i.text })) : '',
    }
  })
  const asOf = toTime(d.asOf)
  return {
    ariaLabel: ok.length ? t('feed.aria', { label: ctx.label, count: ok.length, text: ok[0].text }, ok.length) : t('feed.ariaEmpty', { label: ctx.label }),
    items,
    hidden,
    more: hidden ? t('feed.more', { count: hidden }, hidden) : '',
    dropped,
    live: d.live === true,
    time: Number.isFinite(asOf) ? fmt.time(asOf) : '',
  }
}

// ── Markup ────────────────────────────────────────────────────────────────

const HEAD = header({ dot: true, meta: true })
const list = (cls) => `${HEAD}
<div class="scroll lift" data-k="scroll" role="group" tabindex="0">
<ul class="fl ${cls}" part="list" data-k="list"></ul>
<p class="sm mut more" data-k="more" hidden></p>
<div class="none mut" data-k="none" hidden></div>
</div>`

const TEMPLATES = { Tall: list('tall'), M: list('wide'), L: list('wide') }

const LINE = `<div class="col">${sk(30, 9)}${sk(90, 11)}</div>`
const SKELETON = `${header()}${LINE}${LINE}${LINE}${LINE}`
const SKELETONS = { Tall: SKELETON, M: SKELETON, L: SKELETON }

const STYLES = `
.scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; overscroll-behavior: contain; }
.scroll:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
.fl { margin: 0; padding: 0; list-style: none; }
.fl li { display: grid; column-gap: 10px; align-items: baseline; padding-block: 7px; border-block-end: 1px solid var(--ts-line); }
.fl li:last-child { border-block-end: 0; }
.tm { min-inline-size: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: var(--ts-muted); }
.tx { min-inline-size: 0; overflow-wrap: anywhere; color: var(--ts-ink); unicode-bidi: isolate; }
.dt { min-inline-size: 0; overflow-wrap: anywhere; font-size: var(--ts-text-sm, max(11px, .6875rem)); color: var(--ts-muted); unicode-bidi: isolate; }
.dt:empty { display: none; }
/* The tag's colour is a hint: its words are always shown. */
.tg { justify-self: start; max-inline-size: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 0 6px; border: 1px solid currentColor; border-radius: var(--ts-radius-sm); font-size: var(--ts-text-xs, max(10px, .625rem)); font-weight: 600; line-height: 16px; }
.tg.mut { color: var(--ts-muted); }
.tg.pos { color: var(--ts-profit); }
.tg.neg { color: var(--ts-loss); }
.tg.warn { color: var(--ts-warn); }
/* Tall: the time (small) and the tag share a line, the event under them. */
.tall li { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "tm tg" "tx tx"; row-gap: 2px; }
.tall .tm { grid-area: tm; font-size: var(--ts-text-xs, max(10px, .625rem)); }
.tall .tg { grid-area: tg; }
.tall .tx { grid-area: tx; font-size: var(--ts-text-base, max(13px, .8125rem)); }
.tall .dt { display: none; }
/* M and L: a time column, a tag column and the event with its detail under it. */
.wide li { grid-template-columns: 7.5em 5em minmax(0, 1fr); grid-template-areas: "tm tg tx" ". . dt"; row-gap: 2px; font-size: var(--ts-text-base, max(13px, .8125rem)); }
.wide .tm { grid-area: tm; font-size: var(--ts-text-md, max(12px, .75rem)); }
.wide .tg { grid-area: tg; }
.wide .tx { grid-area: tx; }
.wide .dt { grid-area: dt; }
.more { margin: 6px 0 0; text-align: center; }
.none { padding-block: 16px; text-align: center; }
${HIDDEN_CSS}`

const setAttr = (el, name, value) => {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}
const node = (doc, tag, cls) => {
  const el = doc.createElement(tag)
  if (cls) el.setAttribute('class', cls)
  return el
}

export class TsFeed extends TsWidget {
  static catalogKey = 'feed'
  static emptyText = EN['widget.feed.empty']
  static dataShape = Object.freeze({
    items: 'array',
    max: Object.freeze({ kind: 'number', optional: true }),
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

  /** Pure: the items shown, those beyond `max`, and the accessible name. */
  static feedModel(data, variant, ctx) {
    return feedModel(data, variant, ctx)
  }

  static viewModel(data, variant, ctx) {
    return { ...feedModel(data, variant, ctx), label: ctx.label, synced: syncedParts(ctx.t), noRows: ctx.t('widget.feed.empty') }
  }

  constructor() {
    super()
    this._listEl = null
    this._rows = null
    this._hold = null
  }

  update(vm) {
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
    write('none', vm.noRows)
    hide('none', vm.items.length > 0)
    this._lift(this.$('[data-k="scroll"]'), vm.items.length > 0)
    write('more', vm.more)
    hide('more', !vm.more)
    const scroll = this.$('[data-k="scroll"]')
    setAttr(scroll, 'aria-label', vm.label)

    const listEl = this.$('[data-k="list"]')
    this._bind(listEl)
    // A reader who has scrolled down keeps what they are reading where it is: note the first row in view and how far
    // below the scroller's top it sits, sync, and put that row back at that offset. scrollTop moves in whole pixels on
    // some engines (WebKit), so what it cannot take up, under a pixel, is shown by shifting the list by that remainder,
    // and the row does not creep by a fraction on each arrival. The offset is kept from the first arrival and reused
    // while the reader has not moved. At the top nothing is held still.
    const edge = () => scroll.getBoundingClientRect().top
    let hold = this._hold
    if (scroll.scrollTop <= 0) {
      this._shift(listEl, 0)
      hold = null
    } else if (!hold || scroll.scrollTop !== hold.left || !listEl.contains(hold.row)) {
      // The reader scrolled, which hides the remainder going: measure afresh from the list as laid out.
      this._shift(listEl, 0)
      const row = this._rowInView(scroll, listEl)
      hold = row ? { row, offset: row.getBoundingClientRect().top - edge(), left: 0, shift: 0 } : null
    }
    this._rows.sync(vm.items)
    if (hold && listEl.contains(hold.row)) {
      const laid = hold.row.getBoundingClientRect().top - hold.shift - edge() - hold.offset
      const was = scroll.scrollTop
      if (laid) scroll.scrollTop = was + laid
      hold.left = scroll.scrollTop
      hold.shift = -(laid - (hold.left - was))
      this._shift(listEl, hold.shift)
    } else {
      this._shift(listEl, 0)
      hold = null
    }
    this._hold = hold
  }

  /** The sub-pixel remainder, as a translation written through the CSSOM (no style attribute). */
  _shift(listEl, px) {
    const want = px ? `translateY(${Math.round(px * 100) / 100}px)` : ''
    if (listEl.style.getPropertyValue('transform') !== want) listEl.style.setProperty('transform', want)
  }

  _rowInView(scroll, listEl) {
    const top = scroll.getBoundingClientRect().top
    for (const el of listEl.children) if (el.getBoundingClientRect().bottom > top) return el
    return null
  }

  _bind(listEl) {
    if (listEl === this._listEl) return
    this._listEl = listEl
    const doc = this.ownerDocument
    this._rows = createRows(listEl, { create: () => this._createItem(doc), update: (li, row) => this._writeItem(li, row) })
  }

  _createItem(doc) {
    const li = doc.createElement('li')
    li.setAttribute('part', 'item')
    li.appendChild(node(doc, 'span', 'tm n'))
    li.appendChild(node(doc, 'span', 'tg'))
    li.appendChild(node(doc, 'span', 'tx'))
    li.appendChild(node(doc, 'span', 'dt'))
    return li
  }

  _writeItem(li, row) {
    const [tm, tg, tx, dt] = li.children
    setText(tm, row.time)
    tm.toggleAttribute('hidden', !row.time)
    setText(tg, row.tag)
    setAttr(tg, 'class', `tg ${row.tone}`)
    tg.toggleAttribute('hidden', !row.tag)
    setText(tx, row.text)
    setText(dt, row.detail)
    if (row.aria) setAttr(li, 'aria-label', row.aria)
    else if (li.hasAttribute('aria-label')) li.removeAttribute('aria-label')
  }
}
