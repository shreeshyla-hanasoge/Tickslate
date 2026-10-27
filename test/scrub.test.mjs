import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createFormatter, createMessages } from '../src/core/index.js'
import { Scrubber, SCRUB_CSS, TABLE_ROWS, formatValue, readoutAt, scrubMarkup, valueText } from '../src/elements/scrub.js'
import { todayPnlModel, TsTodayPnl } from '../src/elements/today-pnl.js'
import { equityCurveModel, TsEquityCurve } from '../src/elements/equity-curve.js'
import { chartModel, TsChart } from '../src/elements/series-chart.js'
import { MiniDoc, MiniNode } from './mini-dom.mjs'

// Scrubbing (RFC 0004 §1): the pure read-out text, the pointer, touch and keyboard binding driven against a small DOM
// that logs every write, and the hidden table's in-place updates.

const en = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const de = createFormatter({ locale: 'de-DE', currency: 'EUR', timeZone: 'Europe/Berlin' })
const t = createMessages()
const ist = (h, m) => Date.UTC(2026, 2, 2, h, m) - (5 * 60 + 30) * 60000

const pnlData = (n = 40) => ({
  net: 2185.65,
  realized: 1860,
  unrealized: 325.65,
  fees: 87.3,
  intraday: Array.from({ length: n }, (_, i) => ({ t: ist(9, 15) + i * 60000, v: i === 3 ? -715 : i * 55 })),
  window: { from: ist(9, 15), to: ist(15, 30) },
})
const pnl = (fmt = en, data = pnlData()) => todayPnlModel(data, 'M', { fmt, t, now: 0, label: "Today's P&L" }).chart.scrub

const dayRows = (n, pnlOf = (i) => (i % 3 === 1 ? -120.5 : 310)) =>
  Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10), pnl: pnlOf(i) }))
const equity = (fmt = en, days = dayRows(30), v = 'M') => equityCurveModel({ days }, v, { fmt, t, now: 0, label: 'Equity curve' }).scrub

const chart = (data, fmt = createFormatter({ locale: 'en-US', currency: 'USD', timeZone: 'UTC' }), v = 'M') => chartModel(data, v, { fmt, t, now: 0, label: 'Revenue' }).scrub
const D = (day) => Date.UTC(2026, 8, day)
const line = (name, ys, xs = ys.map((_, i) => D(1 + i)), kind) => ({ name, kind, points: ys.map((y, i) => ({ x: xs[i], y })) })

describe('formatValue', () => {
  const usd = createFormatter({ locale: 'en-US', currency: 'USD', timeZone: 'UTC' })

  test('formats as the series says, with a true minus', () => {
    assert.equal(formatValue(usd, { kind: 'money' }, -1234.5), '−$1,234.50')
    assert.equal(formatValue(usd, { kind: 'money', sign: 'always' }, 1234.5), '+$1,234.50')
    assert.equal(formatValue(usd, { kind: 'percent' }, 0.125), '12.50%')
    assert.equal(formatValue(usd, { kind: 'duration' }, -61000), '−1:01')
    assert.equal(formatValue(usd, { kind: 'number', unit: 'millisecond', decimals: 0 }, 182), '182 ms')
    assert.equal(formatValue(usd, { kind: 'number', decimals: 1 }, -2.25), '−2.3')
  })

  test('a figure past 1e15 is a power of ten, so it is not read digit by digit', () => {
    assert.equal(formatValue(usd, { kind: 'money' }, 1e300), '1.00e+300')
    assert.equal(formatValue(usd, { kind: 'number' }, -2e20), '−2.00e+20')
  })
})

describe('readoutAt', () => {
  test('Today’s P&L: the time, and Net with a sign and an arrow', () => {
    const s = pnl()
    const first = readoutAt(s, 0, { fmt: en, t })
    assert.equal(first.label, '09:15')
    assert.deepEqual(first.items, [{ name: 'Net', value: '₹0.00', arrow: '' }])
    const loss = readoutAt(s, 3, { fmt: en, t })
    assert.equal(loss.label, '09:18')
    assert.deepEqual(loss.items, [{ name: 'Net', value: '−₹715.00', arrow: '▼' }])
    assert.equal(readoutAt(s, 4, { fmt: en, t }).items[0].arrow, '▲')
    assert.ok(!loss.items[0].value.includes('-'), 'a true minus, never a hyphen')
  })

  test('follows the locale: en-IN groups lakhs, de-DE puts the symbol after', () => {
    const big = { ...pnlData(), intraday: pnlData().intraday.map((r) => ({ t: r.t, v: r.v * 1000 + 1234567 })) }
    assert.equal(readoutAt(pnl(en, big), 39, { fmt: en, t }).items[0].value, '+₹33,79,567.00', 'lakhs and crores')
    const de1 = readoutAt(pnl(de, pnlData()), 39, { fmt: de, t })
    assert.match(de1.items[0].value, /^\+2\.145,00\s€$/)
    assert.equal(de1.label, '05:24', 'the zone is the formatter’s: 09:54 IST is 04:24 UTC, 05:24 in Berlin in March')
  })

  test('the equity curve: the date, Equity (the running total) and Day (that day’s result)', () => {
    const s = equity()
    assert.equal(s.series.length, 2)
    const r1 = readoutAt(s, 1, { fmt: en, t })
    assert.match(r1.label, /^2 Oct 2026$/)
    assert.deepEqual(r1.items.map((i) => i.name), ['Equity', 'Day'])
    assert.equal(r1.items[0].value, '+₹189.50')
    assert.equal(r1.items[1].value, '−₹120.50')
    assert.equal(r1.items[1].arrow, '▼')
    const r0 = readoutAt(s, 0, { fmt: en, t })
    assert.equal(r0.items[0].value, '+₹310.00')
    assert.equal(r0.items[1].value, '+₹310.00', 'the first day’s result is its equity')
    const de2 = readoutAt(equity(de), 1, { fmt: de, t })
    assert.equal(de2.label, '2. Okt. 2026')
    assert.match(de2.items[1].value, /^−120,50\s€$/)
  })

  test('the equity curve reads the day’s own result even where the drawing thinned the points', () => {
    const days = dayRows(5000, (i) => (i % 2 ? -5 : 10))
    const s = equity(en, days, 'M')
    assert.ok(s.points.length <= 1200 && s.points.length < 5000)
    for (let i = 1; i < s.points.length; i++) {
      const at = s.xs[i]
      const want = days[at].pnl
      assert.equal(s.series[1].ys[i], want, `day ${at}`)
    }
    assert.equal(s.xs[s.xs.length - 1], 4999, 'the last day is always drawn')
  })

  test('<ts-chart>: one item per series, a missing value is a dash, and the x reads as the axis does', () => {
    const s = chart({ series: [line('Revenue', [10, 20, 30]), line('Cost', [4, 5, 6]), line('Empty', [])] })
    const r = readoutAt(s, 1, { fmt: createFormatter({ locale: 'en-US', timeZone: 'UTC' }), t })
    assert.equal(r.label, 'Sep 2, 2026')
    assert.deepEqual(r.items.map((i) => [i.name, i.value]), [['Revenue', '20'], ['Cost', '5'], ['Empty', '—']])
    assert.ok(r.items.every((i) => i.arrow === ''), 'a generic series carries no arrow')
  })

  test('<ts-chart>: a span under a day reads as clock times, a number axis as numbers', () => {
    const intra = chart({ series: [line('A', [1, 2, 3], [ist(9, 15), ist(9, 20), ist(9, 25)])] }, en)
    assert.equal(readoutAt(intra, 0, { fmt: en, t }).label, '09:15')
    const num = chart({ xType: 'number', series: [line('A', [1, 2, 3], [1000, 2000, 3000])] }, en)
    assert.equal(readoutAt(num, 2, { fmt: en, t }).label, '3,000')
  })

  test('<ts-chart> on a category axis: the category, and bars only where they stand', () => {
    const cats = ['Jan', 'Feb', 'Mar']
    const s = chart({
      xType: 'category',
      format: 'money',
      series: [
        { name: 'Profit', kind: 'bar', points: [{ x: 'Jan', y: 12 }, { x: 'Feb', y: -4 }, { x: 'Mar', y: 8 }] },
        { name: 'Costs', kind: 'bar', points: [{ x: 'Jan', y: 3 }, { x: 'Mar', y: 9 }] },
        { name: 'Target', points: [{ x: 'Jan', y: 10 }, { x: 'Feb', y: 10 }, { x: 'Mar', y: 10 }] },
      ],
    })
    assert.equal(s.kind, 'category')
    const feb = readoutAt(s, 1, { fmt: createFormatter({ locale: 'en-US', currency: 'USD', timeZone: 'UTC' }), t })
    assert.equal(feb.label, cats[1])
    assert.deepEqual(feb.items.map((i) => i.value), ['−$4.00', '—', '$10.00'], 'Costs has no bar in February')
  })

  test('with several series the pointer snaps to the series with the most points, the others read their nearest', () => {
    const s = chart({ series: [line('Few', [100, 300], [D(1), D(9)]), line('Many', [1, 2, 3, 4, 5, 6, 7, 8, 9])] })
    assert.equal(s.xs.length, 9, 'snapped to Many’s x')
    assert.deepEqual(s.series[0].ys.slice(0, 3), [100, 100, 100])
    assert.equal(s.series[0].ys[8], 300)
    assert.equal(s.series[0].ys[4], 100, 'a tie goes to the earlier point')
  })

  test('the scrub data keeps numbers only, so no string is built per point', () => {
    for (const s of [pnl(), equity(), chart({ series: [line('A', [1, 2, 3])] })]) {
      for (const p of s.points) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y))
      for (const x of s.series) assert.ok(x.ys.every((y) => typeof y === 'number') && (x.py === null || x.py.every((y) => typeof y === 'number')))
    }
  })

  test('no scrub data for a chart with fewer than two points', () => {
    assert.equal(todayPnlModel(pnlData(1), 'M', { fmt: en, t, now: 0, label: 'x' }).chart.scrub, null)
    assert.equal(equity(en, dayRows(1)), null)
    assert.equal(chart({ series: [line('A', [1])] }), null)
    assert.equal(chart({ series: [] }), null)
  })
})

describe('valueText', () => {
  test('is the label and the values, joined as the locale joins a list', () => {
    const ro = { label: '2 Oct 2026', items: [{ name: 'Equity', value: '+₹189.50' }, { name: 'Day', value: '−₹120.50' }] }
    assert.equal(valueText(ro, { fmt: en, t }), '2 Oct 2026: Equity +₹189.50 and Day −₹120.50')
    assert.equal(valueText(ro, { fmt: de, t }), '2 Oct 2026: Equity +₹189.50 und Day −₹120.50')
    assert.equal(valueText({ label: '09:15', items: [{ name: 'Net', value: '₹0.00' }] }, { fmt: en, t }), '09:15: Net ₹0.00')
    const three = { label: 'x', items: ['a', 'b', 'c'].map((n) => ({ name: n, value: '1' })) }
    assert.equal(valueText(three, { fmt: en, t }), 'x: a 1, b 1 and c 1', 'the locale’s own list separators')
  })
})

describe('the markup', () => {
  test('is constant and textless, with no style attribute and nothing aria-live', () => {
    const markup = scrubMarkup(6, 6, true)
    assert.doesNotMatch(markup, /style=|aria-live|role="status"|role="alert"/)
    assert.equal(markup, scrubMarkup(6, 6, true), 'a pure function of its arguments')
    assert.match(markup, /role="slider"[^>]*tabindex="0"[^>]*aria-valuemin="0"/)
    assert.match(markup, /<i class="sc-rule" part="scrub-rule"/)
    assert.match(markup, /part="scrub-readout"/)
    assert.match(markup, /<div class="sc-box" part="scrub"[^>]*aria-hidden="true" hidden>/)
    assert.equal(markup.match(/class="sc-dot c-\d"/g).length, 6)
    assert.equal(markup.match(/class="sc-it"/g).length, 6)
    assert.match(markup, /class="visually-hidden"/)
    assert.match(markup, /<caption/)
    // Between tags there is no text at all: every string is written by update().
    assert.equal(markup.split(/<[^>]*>/).join(''), '')
  })

  test('is in every plot template, and no widget markup anywhere has aria-live', () => {
    const plotted = [[TsTodayPnl, ['M']], [TsEquityCurve, ['Wide', 'M', 'XL']], [TsChart, ['Wide', 'M', 'L', 'XL']]]
    for (const [Ctor, variants] of plotted) {
      for (const v of variants) {
        const html = Ctor.template(v)
        assert.match(html, /data-k="scrub"/, `${Ctor.name} ${v}`)
        assert.match(html, /data-k="plot"/)
        assert.match(html, /role="slider"/)
        assert.match(html, /<table>/)
        assert.doesNotMatch(html, /aria-live|role="status"/, `${Ctor.name} ${v}`)
      }
    }
    for (const v of ['S', 'Wide']) assert.doesNotMatch(TsTodayPnl.template(v), /data-k="scrub"/, 'S and Wide have no plot')
    for (const Ctor of [TsTodayPnl, TsEquityCurve, TsChart]) assert.doesNotMatch(Ctor.styles, /transition|animation/ , 'the overlay has no motion to switch off')
  })

  test('the rules are tokens only, logical, and keep forced colours visible', () => {
    assert.doesNotMatch(SCRUB_CSS, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(SCRUB_CSS, /\b(left|right|top|bottom|margin-left|margin-right|padding-left|padding-right)\s*:/)
    assert.match(SCRUB_CSS, /touch-action: pan-y/)
    assert.match(SCRUB_CSS, /\.sc-out \{[^}]*background: var\(--ts-surface-2\)[^}]*color: var\(--ts-ink\)/)
    assert.match(SCRUB_CSS, /@media \(forced-colors: active\)[\s\S]*CanvasText[\s\S]*Highlight[\s\S]*ButtonFace/)
    assert.match(SCRUB_CSS, /\.sc-slider:focus-visible \{ outline: 2px solid var\(--ts-focus/)
  })
})

// ── The binding, against a DOM that logs its writes ────────────────────────

// Style writes are logged by property, so "only transforms" is checked on the log.
if (!Object.getOwnPropertyDescriptor(MiniNode.prototype, 'style')) {
  Object.defineProperty(MiniNode.prototype, 'style', {
    get() {
      if (!this._style) {
        this._style = new Proxy({}, { set: (o, k, v) => { this.doc.log.push(`style ${this.id()} ${String(k)}=${v}`); o[k] = v; return true } })
      }
      return this._style
    },
  })
}
if (!MiniNode.prototype.replaceChildren) {
  MiniNode.prototype.replaceChildren = function replaceChildren(...nodes) {
    for (const c of this.children) c.parent = null
    this.children = []
    for (const n of nodes) this.appendChild(n)
  }
}

function harness({ model = pnl(), editing = false, scrubOn = true, fmt = en, raf } = {}) {
  const doc = new MiniDoc()
  const nodes = new Map()
  const handlers = new Map()
  const node = (k) => {
    if (!nodes.has(k)) {
      const n = new MiniNode(doc, k.startsWith('scrubTbl') ? 'div' : k === 'scrubHead' ? 'tr' : k === 'scrubBody' ? 'tbody' : k === 'scrubCap' ? 'caption' : 'span')
      n.setAttribute('data-id', k)
      // The template starts these hidden.
      if (['scrub', 'scrubSlider', 'scrubTbl'].includes(k)) n.setAttribute('hidden', '')
      nodes.set(k, n)
    }
    return nodes.get(k)
  }
  const markup = scrubMarkup(1, 2)
  const has = (k) => markup.includes(`data-k="${k}"`) || k === 'plot'
  const state = { editing, scrubOn }
  const w = {
    _section: { addEventListener: (type, fn) => handlers.set(type, fn) },
    $: (sel) => {
      const k = /data-k="(\w+)"/.exec(sel)[1]
      return has(k) ? node(k) : null
    },
    _scrubOn: () => state.scrubOn,
    _isEditing: () => state.editing,
    _setAttr: (el, name, value) => {
      if (value === null) {
        if (el.getAttribute(name) !== null) el.removeAttribute(name)
      } else if (el.getAttribute(name) !== value) el.setAttribute(name, value)
    },
    formatter: fmt,
    t,
    label: "Today's P&L",
  }
  // The dots and read-out lines are found by class inside the overlay, as in the template.
  const dots = [node('scrubDot1')]
  const items = [1, 2].map((i) => {
    const line = node(`scrubIt${i}`)
    line.appendChild(node(`scrubN${i}`))
    line.appendChild(node(`scrubV${i}`))
    return line
  })
  node('scrub').querySelectorAll = (sel) => (sel === '.sc-dot' ? dots : items)
  const plot = node('plot')
  const box = { left: 100, top: 50, right: 700, bottom: 210, width: 600, height: 160 }
  plot.getBoundingClientRect = () => box
  const frames = []
  const scrubber = new Scrubber(w, raf || ((fn) => frames.push(fn)))
  const flush = () => frames.splice(0).forEach((fn) => fn())
  // A pointer event at a fraction of the plot's width, and the key presses a slider gets.
  const at = (f, o = {}) => ({ pointerType: 'mouse', clientX: box.left + f * box.width, clientY: box.top + 80, ...o })
  const send = (type, e = {}) => handlers.get(type)(e)
  const slider = node('scrubSlider')
  const key = (k) => {
    const e = { key: k, target: slider, defaultPrevented: false, preventDefault() { this.defaultPrevented = true } }
    send('keydown', e)
    return e
  }
  return { doc, nodes, node, w, state, scrubber, frames, flush, at, send, key, slider, box, sync: (m = model, caption = "Today's P&L, +₹2,185.65") => scrubber.sync(m, caption) }
}

let realDoc
beforeEach(() => {
  realDoc = globalThis.document
})
afterEach(() => {
  globalThis.document = realDoc
})

describe('the overlay follows a pointer', () => {
  test('a move shows the overlay, then writes only transforms and text, one write per frame', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.doc.take()
    h.send('pointermove', h.at(0.02))
    h.send('pointermove', h.at(0.021))
    h.send('pointermove', h.at(0.022))
    assert.equal(h.frames.length, 1, 'three events, one frame')
    h.flush()
    const first = h.doc.take()
    assert.ok(first.some((l) => l.startsWith('style scrubRule transform=translate(')), first.join('\n'))
    assert.ok(first.some((l) => l.startsWith('attr scrub -hidden')), 'the overlay is shown once')
    h.send('pointermove', h.at(0.07))
    h.flush()
    const next = h.doc.take()
    assert.ok(next.length > 0)
    for (const l of next) assert.match(l, /^(style \S+ transform=|text )/, `only transforms and text: ${l}`)
    assert.ok(next.some((l) => l.startsWith('text scrubLab')))
    assert.ok(next.some((l) => l.startsWith('style scrubDot1 transform=translate(')))
  })

  test('the read-out names the nearest point and the dot sits at its place', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    const s = pnl()
    h.send('pointermove', h.at(s.points[10].x / 375))
    h.flush()
    assert.equal(h.node('scrubLab').textContent, '09:25')
    assert.equal(h.node('scrubV1').textContent, '▲ +₹550.00', 'the arrow is text, in an overlay that is aria-hidden as a whole')
    assert.equal(h.node('scrubN1').textContent, 'Net')
    // The box is 600 by 160px for a drawing of 375 by 100 units.
    assert.equal(h.node('scrubRule').style.transform, `translate(${s.points[10].x * (600 / 375)}px, 0)`)
    assert.equal(h.node('scrubDot1').style.transform, `translate(${s.points[10].x * (600 / 375)}px, ${s.series[0].py[10] * (160 / 100)}px)`)
  })

  test('pointerleave hides it, and a pointer outside the plot is a leave', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.send('pointermove', h.at(0.5))
    h.flush()
    assert.equal(h.node('scrub').hasAttribute('hidden'), false)
    h.send('pointerleave', { pointerType: 'mouse' })
    assert.equal(h.node('scrub').hasAttribute('hidden'), true)
    h.send('pointermove', h.at(0.5))
    h.flush()
    assert.equal(h.node('scrub').hasAttribute('hidden'), false)
    h.send('pointermove', { ...h.at(0.5), clientY: h.box.bottom + 40 })
    h.flush()
    assert.equal(h.node('scrub').hasAttribute('hidden'), true, 'below the plot')
  })

  test('touch follows a drag that starts on the plot and hides when the finger lifts or is cancelled', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.send('pointermove', h.at(0.3, { pointerType: 'touch' }))
    h.flush()
    assert.equal(h.node('scrub').hasAttribute('hidden'), true, 'a finger that never went down scrubs nothing')
    h.send('pointerdown', h.at(0.3, { pointerType: 'touch', clientY: h.box.bottom + 40 }))
    h.flush()
    assert.equal(h.node('scrub').hasAttribute('hidden'), true, 'a touch that starts off the plot is not a scrub')
    h.send('pointerdown', h.at(0.3, { pointerType: 'touch' }))
    h.flush()
    assert.equal(h.node('scrub').hasAttribute('hidden'), false)
    h.send('pointermove', { ...h.at(-0.2, { pointerType: 'touch' }), clientY: h.box.bottom + 60 })
    h.flush()
    assert.equal(h.node('scrub').hasAttribute('hidden'), false, 'a drifting finger keeps scrubbing')
    assert.equal(h.node('scrubLab').textContent, '09:15', 'dragged past the left end, it reads the first point')
    h.send('pointerup', { pointerType: 'touch' })
    assert.equal(h.node('scrub').hasAttribute('hidden'), true)
    h.send('pointerdown', h.at(0.5, { pointerType: 'touch' }))
    h.flush()
    h.send('pointercancel', { pointerType: 'touch' })
    assert.equal(h.node('scrub').hasAttribute('hidden'), true)
  })

  test('the readout stays inside the plot at both edges', () => {
    const h = harness({ model: equity() })
    globalThis.document = h.doc
    h.sync(equity())
    // The read-out is 120px by 40px.
    h.node('scrubOut').offsetWidth = 120
    h.node('scrubOut').offsetHeight = 40
    const place = (f) => {
      h.send('pointermove', h.at(f))
      h.flush()
      const m = /^translate\((-?[\d.]+)px, (-?[\d.]+)px\)$/.exec(h.node('scrubOut').style.transform)
      return { left: Number(m[1]), top: Number(m[2]) }
    }
    for (const f of [0, 0.02, 0.5, 0.98, 1]) {
      const { left, top } = place(f)
      assert.ok(left >= 0 && left + 120 <= h.box.width, `${f}: left ${left}`)
      assert.ok(top >= 0 && top + 40 <= h.box.height, `${f}: top ${top}`)
    }
    const right = place(1)
    assert.equal(right.left, 596 - 10 - 120, 'at the right edge it goes to the left of the rule, which is at the last point')
    assert.equal(place(0).left, 4 + 10, 'at the left edge, to the right of the rule')
  })

  test('nothing is scrubbed with scrub off, with fewer than two points, or while the grid edits', () => {
    const off = harness({ scrubOn: false })
    globalThis.document = off.doc
    off.sync()
    off.send('pointermove', off.at(0.5))
    off.flush()
    assert.equal(off.node('scrub').hasAttribute('hidden'), true)
    assert.equal(off.slider.hasAttribute('hidden'), true, 'no tab stop')
    assert.equal(off.node('scrubTbl').hasAttribute('hidden'), false, 'the table stays')

    const none = harness({ model: null })
    globalThis.document = none.doc
    none.sync(null)
    none.send('pointermove', none.at(0.5))
    none.flush()
    assert.equal(none.node('scrub').hasAttribute('hidden'), true)
    assert.equal(none.slider.hasAttribute('hidden'), true)
    assert.equal(none.node('scrubTbl').hasAttribute('hidden'), true)

    const edit = harness()
    globalThis.document = edit.doc
    edit.sync()
    edit.state.editing = true
    edit.send('pointermove', edit.at(0.5))
    edit.flush()
    assert.equal(edit.node('scrub').hasAttribute('hidden'), true, 'the grid is editing')
    edit.send('pointerdown', edit.at(0.5, { pointerType: 'touch' }))
    edit.flush()
    assert.equal(edit.node('scrub').hasAttribute('hidden'), true)
    assert.equal(edit.key('ArrowLeft').defaultPrevented, false, 'keys are left alone')
    edit.doc.take()
    edit.state.editing = false
    edit.send('pointermove', edit.at(0.5))
    edit.flush()
    assert.equal(edit.node('scrub').hasAttribute('hidden'), false, 'leaving edit mode restores it')
  })

  test('editing takes the tab stop away, and hides a read-out that is showing', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.send('pointermove', h.at(0.5))
    h.flush()
    assert.equal(h.slider.getAttribute('tabindex'), '0')
    h.state.editing = true
    h.w._onEditChange()
    assert.equal(h.slider.getAttribute('tabindex'), '-1')
    assert.equal(h.slider.getAttribute('aria-disabled'), 'true')
    assert.equal(h.node('scrub').hasAttribute('hidden'), true)
    h.state.editing = false
    h.w._onEditChange()
    assert.equal(h.slider.getAttribute('tabindex'), '0')
    assert.equal(h.slider.getAttribute('aria-disabled'), null)
  })
})

describe('the keyboard slider', () => {
  const press = (h, ...keys) => keys.forEach((k) => h.key(k))

  test('is a named slider whose value text is the read-out, at the newest point at rest', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    assert.equal(h.slider.getAttribute('aria-label'), 'Today’s P&L, read point by point'.replace('’', "'"))
    assert.equal(h.slider.getAttribute('aria-valuemax'), '39')
    assert.equal(h.slider.getAttribute('aria-valuenow'), '39')
    assert.equal(h.slider.getAttribute('aria-valuetext'), '09:54: Net +₹2,145.00')
    assert.equal(h.slider.hasAttribute('hidden'), false)
    assert.equal(h.slider.getAttribute('tabindex'), '0')
    for (const [name] of h.slider.attrs) assert.ok(!/^aria-live$/.test(name))
  })

  test('focus shows the last point, and blur hides it', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.send('focusin', { target: h.slider })
    assert.equal(h.node('scrub').hasAttribute('hidden'), false)
    assert.equal(h.node('scrubLab').textContent, '09:54')
    h.send('focusout', { target: h.slider })
    assert.equal(h.node('scrub').hasAttribute('hidden'), true)
    h.send('focusin', { target: h.node('plot') })
    assert.equal(h.node('scrub').hasAttribute('hidden'), true, 'focus elsewhere in the tile is not the slider')
  })

  test('the arrows move one point, the page keys ten, Home and End jump, all clamped', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.send('focusin', { target: h.slider })
    const now = () => Number(h.slider.getAttribute('aria-valuenow'))
    press(h, 'ArrowLeft')
    assert.equal(now(), 38)
    press(h, 'ArrowRight', 'ArrowRight')
    assert.equal(now(), 39, 'clamped at the last point')
    press(h, 'PageDown')
    assert.equal(now(), 29)
    press(h, 'PageUp')
    assert.equal(now(), 39)
    press(h, 'Home')
    assert.equal(now(), 0)
    assert.equal(h.slider.getAttribute('aria-valuetext'), '09:15: Net ₹0.00')
    press(h, 'ArrowLeft')
    assert.equal(now(), 0, 'clamped at the first')
    press(h, 'PageDown')
    assert.equal(now(), 0)
    press(h, 'ArrowRight')
    assert.equal(now(), 1)
    assert.equal(h.node('scrubLab').textContent, '09:16')
    press(h, 'End')
    assert.equal(now(), 39)
  })

  test('every key it handles is stopped from scrolling the page, and every other key is left alone', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.send('focusin', { target: h.slider })
    for (const k of ['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']) assert.equal(h.key(k).defaultPrevented, true, k)
    for (const k of ['Tab', 'Enter', ' ', 'a', 'Shift', 'ArrowUp', 'ArrowDown']) assert.equal(h.key(k).defaultPrevented, false, k)
  })

  test('Escape hides the read-out and keeps the slider; arrows bring it back from where it was', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.send('focusin', { target: h.slider })
    press(h, 'Home', 'ArrowRight', 'ArrowRight')
    assert.equal(h.key('Escape').defaultPrevented, true)
    assert.equal(h.node('scrub').hasAttribute('hidden'), true)
    assert.equal(h.slider.hasAttribute('hidden'), false)
    assert.equal(h.key('Escape').defaultPrevented, false, 'with nothing showing, Escape is left for others')
    press(h, 'ArrowRight')
    assert.equal(h.node('scrub').hasAttribute('hidden'), false)
    assert.equal(h.slider.getAttribute('aria-valuenow'), '3')
  })

  test('keys on anything but the slider do nothing', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.send('focusin', { target: h.slider })
    const e = { key: 'ArrowLeft', target: h.node('plot'), preventDefault() { this.defaultPrevented = true } }
    h.send('keydown', e)
    assert.equal(e.defaultPrevented, undefined)
    assert.equal(h.slider.getAttribute('aria-valuenow'), '39')
  })

  test('a live tick keeps the point the reader is on, and a tick at rest follows the newest', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.send('focusin', { target: h.slider })
    press(h, 'Home', 'ArrowRight')
    h.sync(pnl(en, pnlData(41)))
    assert.equal(h.slider.getAttribute('aria-valuemax'), '40')
    assert.equal(h.slider.getAttribute('aria-valuenow'), '1')
    h.send('focusout', { target: h.slider })
    h.sync(pnl(en, pnlData(42)))
    assert.equal(h.slider.getAttribute('aria-valuenow'), '41', 'at rest it is the newest')
  })

  test('with nothing aria-live anywhere in what the binding writes', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.send('focusin', { target: h.slider })
    press(h, 'ArrowLeft', 'Home', 'End')
    h.send('pointermove', h.at(0.5))
    h.flush()
    for (const n of h.nodes.values()) {
      assert.ok(!n.hasAttribute('aria-live') && n.getAttribute('role') !== 'status', n.id())
    }
    assert.ok(!h.doc.take().some((l) => /aria-live|role=status/.test(l)))
  })
})

describe('the hidden table (RFC 0004 §1.6)', () => {
  const rowsOf = (h) => h.node('scrubBody').children
  const cells = (tr) => tr.children.map((c) => c.textContent)

  test('has a caption, column headers with scope, row headers, and the last 12 points newest last', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    assert.equal(h.node('scrubTbl').hasAttribute('hidden'), false)
    assert.equal(h.node('scrubCap').textContent, "Today's P&L, +₹2,185.65, last 12 points")
    const heads = h.node('scrubHead').children
    assert.deepEqual(heads.map((c) => [c.localName, c.getAttribute('scope'), c.textContent]), [['th', 'col', 'Time'], ['th', 'col', 'Net']])
    const rows = rowsOf(h)
    assert.equal(rows.length, TABLE_ROWS)
    assert.equal(rows[0].firstChild.getAttribute('scope'), 'row')
    assert.deepEqual(cells(rows[0]), ['09:43', '+₹1,540.00'])
    assert.deepEqual(cells(rows[11]), ['09:54', '+₹2,145.00'])
  })

  test('a new reading inserts one row and drops the oldest; an unchanged tick writes nothing', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    h.doc.take()
    h.sync(pnl(en, pnlData(40)))
    assert.deepEqual(h.doc.take().filter((l) => !/^style/.test(l)), [], 'identical data writes nothing')
    h.sync(pnl(en, pnlData(41)))
    const log = h.doc.take()
    assert.equal(log.filter((l) => l === 'insert tr').length, 1, log.join('\n'))
    assert.equal(log.filter((l) => l === 'remove tr').length, 1)
    assert.equal(rowsOf(h).length, TABLE_ROWS)
    assert.deepEqual(cells(rowsOf(h)[0]), ['09:44', '+₹1,595.00'])
    assert.deepEqual(cells(rowsOf(h)[11]), ['09:55', '+₹2,200.00'])
  })

  test('a changed value writes one cell', () => {
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    const changed = pnlData(40)
    changed.intraday[39] = { ...changed.intraday[39], v: 2150 }
    const before = rowsOf(h)[11]
    h.doc.take()
    h.scrubber.sync(pnl(en, changed), "Today's P&L, +₹2,185.65")
    const log = h.doc.take().filter((l) => !/^(style|attr)/.test(l))
    assert.deepEqual(log, ['text td "+₹2,150.00"'])
    assert.equal(rowsOf(h)[11], before, 'the row is the same node, so a reading cursor keeps its place')
  })

  test('fewer than 12 points make fewer rows, and the caption counts them', () => {
    const h = harness({ model: pnl(en, pnlData(5)) })
    globalThis.document = h.doc
    h.sync(pnl(en, pnlData(5)))
    assert.equal(rowsOf(h).length, 5)
    assert.equal(h.node('scrubCap').textContent, "Today's P&L, +₹2,185.65, last 5 points")
    const two = harness({ model: pnl(en, pnlData(2)) })
    globalThis.document = two.doc
    two.sync(pnl(en, pnlData(2)))
    assert.equal(two.node('scrubCap').textContent, "Today's P&L, +₹2,185.65, last 2 points")
  })

  test('has a column for each series, and starts again when the series change', () => {
    const h = harness({ model: equity() })
    globalThis.document = h.doc
    h.sync(equity())
    assert.deepEqual(h.node('scrubHead').children.map((c) => c.textContent), ['Date', 'Equity', 'Day'])
    const tr = rowsOf(h)[11]
    assert.equal(tr.children.length, 3)
    const last = readoutAt(equity(), 29, { fmt: en, t })
    assert.deepEqual(cells(tr), [last.label, last.items[0].value, last.items[1].value])
    assert.equal(last.label, '30 Oct 2026')
    h.sync(pnl())
    assert.deepEqual(h.node('scrubHead').children.map((c) => c.textContent), ['Time', 'Net'])
    assert.equal(rowsOf(h).length, 12)
    assert.equal(rowsOf(h)[0].children.length, 2)
  })

  test('keys rows by day, so a range change keeps the days it still shows', () => {
    const h = harness({ model: equity() })
    globalThis.document = h.doc
    h.sync(equity(en, dayRows(30)))
    const kept = rowsOf(h)[11]
    h.doc.take()
    h.sync(equity(en, dayRows(31)))
    assert.equal(rowsOf(h)[10], kept, 'the same day is the same row though its index moved')
    assert.equal(h.doc.take().filter((l) => l === 'insert tr').length, 1)
  })

  test('is in the accessibility tree: a visually hidden box, not hidden or display none, while there are rows', () => {
    const markup = scrubMarkup(1, 1)
    assert.match(markup, /<div class="visually-hidden" data-k="scrubTbl" hidden><table>/, 'hidden only until it has rows')
    const h = harness()
    globalThis.document = h.doc
    h.sync()
    assert.equal(h.node('scrubTbl').hasAttribute('hidden'), false)
  })
})
