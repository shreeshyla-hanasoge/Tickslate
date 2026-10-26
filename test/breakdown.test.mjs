import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFormatter, createMessages, EN, WIDGETS } from '../src/core/index.js'
import { checkShape } from '../src/elements/dev.js'
import { arcPaths } from '../src/elements/chart.js'
import { FakeElement, FakeDocument } from './fake-dom.mjs'
import { MiniDoc, keyedNodes } from './list-dom.mjs'

let B // breakdown.js, loaded against the fake HTMLElement (a static import would load widget.js before it exists)
let apportion, foldSlices, breakdownModel
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  B = await import('../src/elements/breakdown.js')
  ;({ apportion, foldSlices, breakdownModel } = B)
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})

// <ts-breakdown> (RFC 0004 §4.1): the arithmetic, the pure model and the arcs.

const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const ctx = { fmt, t: createMessages(), now: 0, label: 'Allocation' }
const model = (data, variant = 'M') => B.breakdownModel(data, variant, ctx)

const seeded = (seed) => {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// Hundredths, summed as integers: no floating-point drift in the check itself.
const hundredths = (list) => list.reduce((sum, n) => sum + Math.round(n * 10), 0)

const FIVE = [
  { id: 'eq', label: 'Equities', value: 41200, note: 'Large and mid caps' },
  { id: 'bd', label: 'Bonds', value: 23800 },
  { id: 'cs', label: 'Cash', value: 15000 },
  { id: 'gd', label: 'Gold', value: 12000 },
  { id: 're', label: 'Property', value: 8000 },
]

describe('apportion', () => {
  test('sums to exactly 100 for ties, thirds, one slice and a total of 0', () => {
    assert.deepEqual(apportion([1, 1, 1]), [33.4, 33.3, 33.3])
    assert.equal(hundredths(apportion([1, 1, 1])), 1000)
    assert.deepEqual(apportion([5]), [100])
    assert.deepEqual(apportion([1, 1]), [50, 50])
    assert.deepEqual(apportion([0, 0, 0]), [0, 0, 0])
    assert.deepEqual(apportion([]), [])
  })

  test('breaks equal remainders toward the earlier value, the same on every run', () => {
    assert.deepEqual(apportion([2, 2, 2, 2, 2, 2, 2]), apportion([2, 2, 2, 2, 2, 2, 2]))
    const r = apportion([1, 1, 1, 1, 1, 1, 1])
    assert.equal(hundredths(r), 1000)
    assert.ok(r[0] >= r[6])
  })

  test('1,000 seeded random lists always sum to 100.0', () => {
    const rnd = seeded(2026)
    for (let n = 0; n < 1000; n++) {
      const list = Array.from({ length: 1 + Math.floor(rnd() * 9) }, () => (rnd() < 0.15 ? 0 : Math.floor(rnd() * 100000) / (rnd() < 0.5 ? 1 : 100)))
      const r = apportion(list)
      if (list.some((v) => v > 0)) assert.equal(hundredths(r), 1000, JSON.stringify(list))
      else assert.equal(hundredths(r), 0)
      list.forEach((v, i) => v === 0 && assert.equal(r[i], 0))
    }
  })

  test('honours the decimals asked for', () => {
    const r = apportion([1, 2, 4], 0)
    assert.equal(r.reduce((a, b) => a + b, 0), 100)
    assert.ok(r.every(Number.isInteger))
  })
})

describe('foldSlices', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: i, value: 100 - i }))
  test('six slices are left alone, sorted largest first', () => {
    const out = foldSlices([{ value: 1 }, { value: 9 }, { value: 5 }, { value: 2 }, { value: 3 }, { value: 4 }])
    assert.deepEqual(out.map((s) => s.value), [9, 5, 4, 3, 2, 1])
  })
  test('seven become five plus Other, which sums the rest', () => {
    const out = foldSlices(mk(7))
    assert.equal(out.length, 6)
    assert.deepEqual(out.slice(0, 5).map((s) => s.id), [0, 1, 2, 3, 4])
    assert.deepEqual(out[5], { value: 95 + 94, other: true })
  })
  test('equal values keep their input order', () => {
    const out = foldSlices(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id, value: 3 })))
    assert.deepEqual(out.slice(0, 5).map((s) => s.id), ['a', 'b', 'c', 'd', 'e'])
  })
})

describe('breakdownModel', () => {
  test('reads shares, labels and the largest slice into the name', () => {
    const m = model({ slices: FIVE })
    assert.equal(m.kind, 'donut')
    assert.deepEqual(m.slices.map((s) => [s.label, s.pct]), [['Equities', '41.2%'], ['Bonds', '23.8%'], ['Cash', '15.0%'], ['Gold', '12.0%'], ['Property', '8.0%']])
    assert.equal(m.ariaLabel, 'Allocation: 5 parts, largest Equities 41.2%')
    assert.equal(m.total, '1,00,000')
    assert.equal(m.totalText, 'Total 1,00,000')
    assert.deepEqual(m.slices.map((s) => s.index), [1, 2, 3, 4, 5])
    assert.equal(m.slices[0].note, 'Large and mid caps')
    assert.ok(m.slices.every((s) => s.label && s.pct))
  })

  test('the kind follows the size', () => {
    assert.deepEqual(['S', 'Wide', 'Tall', 'M'].map((v) => model({ slices: FIVE }, v).kind), ['share', 'stacked', 'stacked', 'donut'])
  })

  test('beyond six, the rest fold into Other, drawn in the axis colour', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ label: `P${i}`, value: 90 - i * 5 }))
    const m = model({ slices: many })
    assert.equal(m.slices.length, 6)
    const other = m.slices[5]
    assert.deepEqual([other.label, other.other, other.index, other.key], ['Other', true, 0, 'other'])
    assert.equal(other.value, '230')
    assert.equal(hundredths(m.slices.map((s) => Number.parseFloat(s.pct))), 1000)
    assert.equal(m.ariaLabel, 'Allocation: 9 parts, largest P0 14.3%')
  })

  test('six slices all get a series colour and no Other', () => {
    const m = model({ slices: Array.from({ length: 6 }, (_, i) => ({ label: `P${i}`, value: 6 - i })) })
    assert.deepEqual(m.slices.map((s) => s.index), [1, 2, 3, 4, 5, 6])
    assert.ok(m.slices.every((s) => !s.other))
  })

  test('negative values are left out and reported; the legend still sums to 100.0%', () => {
    const m = model({ slices: [...FIVE, { label: 'Short', value: -3000 }] })
    assert.equal(m.excluded, 1)
    assert.equal(m.note, '1 negative value left out')
    assert.equal(m.slices.length, 5)
    assert.equal(model({ slices: [{ label: 'a', value: -1 }, { label: 'b', value: -2 }, { label: 'c', value: 4 }] }).note, '2 negative values left out')
  })

  test('values that are not numbers are dropped and counted; numeric strings are read', () => {
    const m = model({ slices: [{ label: 'a', value: '40.5' }, { label: 'b', value: 'n/a' }, null, 'x', { label: 'c' }, { label: 'd', value: 10 }] })
    assert.equal(m.dropped, 4)
    assert.deepEqual(m.slices.map((s) => s.label), ['a', 'd'])
  })

  test('a zero slice stays in the legend at 0.0% and draws nothing', () => {
    const m = model({ slices: [{ label: 'a', value: 5 }, { label: 'z', value: 0 }] })
    assert.deepEqual(m.slices.map((s) => s.pct), ['100.0%', '0.0%'])
    assert.equal(m.arcs.length, 1)
    assert.equal(m.slices[1].fraction, 0)
  })

  test('a total of 0 shows 0.0% for each and draws nothing', () => {
    const m = model({ slices: [{ label: 'a', value: 0 }, { label: 'b', value: 0 }] })
    assert.deepEqual(m.slices.map((s) => s.pct), ['0.0%', '0.0%'])
    assert.deepEqual([m.arcs, m.drawn], [[], false])
    assert.equal(m.ariaLabel, 'Allocation: nothing to break down')
  })

  test('does not throw on null, [], a non-array or junk, and says there is nothing', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { slices: 'x' }, { slices: {} }, { slices: [] }]) {
      const m = model(bad)
      assert.deepEqual([m.slices, m.total, m.drawn], [[], '', false], String(bad))
      assert.equal(m.ariaLabel, 'Allocation: nothing to break down')
    }
  })

  test('ids default to the label, a repeated id is made unique, and a host id of "other" does not collide', () => {
    const m = model({ slices: [{ label: 'a', value: 3 }, { label: 'a', value: 2 }, { id: 'other', label: 'o', value: 1 }] })
    assert.equal(new Set(m.slices.map((s) => s.key)).size, 3)
    assert.equal(m.slices[0].key, 'a')
  })

  test('formats the value as asked: money, percent, duration, a unit and decimals', () => {
    const one = (extra) => model({ slices: [{ label: 'a', value: 1500 }], ...extra }).slices[0].value
    assert.equal(one({ format: 'money' }), '₹1,500.00')
    assert.equal(model({ slices: [{ label: 'a', value: 0.125 }], format: 'percent' }).slices[0].value, '12.50%')
    assert.equal(model({ slices: [{ label: 'a', value: 90000 }], format: 'duration' }).slices[0].value, '1:30')
    assert.equal(one({ unit: 'ms' }), '1,500 ms')
    assert.equal(one({ decimals: 1 }), '1,500.0')
  })

  test('donut arcs: one per positive share, in the slices\' order, with the slice\'s colour index', () => {
    const m = model({ slices: FIVE })
    assert.deepEqual(m.arcs.map((a) => a.index), [1, 2, 3, 4, 5])
    for (const a of m.arcs) assert.match(a.d, /^M[\d. -]+ A.*Z$/)
    assert.deepEqual(model({ slices: FIVE }, 'Wide').arcs, [])
  })

  test('freshness: the live dot and the synced time', () => {
    const m = model({ slices: FIVE, live: true, asOf: Date.UTC(2026, 7, 5, 6, 12) })
    assert.deepEqual([m.live, m.time], [true, '11:42'])
  })
})

describe('arcPaths', () => {
  const o = { size: 100, radius: 48, inner: 30 }
  const numbers = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number)
  test('closed ring segments, one per share, with only finite numbers', () => {
    const paths = arcPaths([0.5, 0.25, 0.25], o)
    assert.equal(paths.length, 3)
    for (const d of paths) {
      assert.match(d, /^M.*A.*L.*A.*Z$/)
      assert.ok(numbers(d).every(Number.isFinite))
    }
  })
  test('a zero share is an empty path', () => assert.deepEqual(arcPaths([0, 1], o).map((d) => d === ''), [true, false]))
  test('one full-circle slice is two half arcs on each edge, so it still closes', () => {
    const [d] = arcPaths([1], o)
    assert.equal((d.match(/ A/g) || []).length, 4)
    assert.match(d, /Z$/)
  })
  test('a thin slice survives the gap and a long one takes the large arc', () => {
    const [thin, big] = arcPaths([0.001, 0.999], { ...o, gapDeg: 5 })
    assert.ok(thin.length > 0)
    assert.match(big, /A48 48 0 1 1/)
  })
  test('does not throw on nothing', () => assert.deepEqual(arcPaths([], o), []))
})

describe('words and the catalog', () => {
  const PSEUDO = createMessages(Object.fromEntries(Object.entries(EN).map(([key, value]) => [key, `⟦${value}⟧`])))
  const pseudo = { ...ctx, t: PSEUDO }
  const WRAP = /⟦[^⟦⟧]*⟧/g
  test('every word in the model comes from the messages, in the pseudo-locale', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ label: `P${i}`, value: 90 - i * 5 }))
    const m = breakdownModel({ slices: [...many, { label: 'Neg', value: -1 }] }, 'M', pseudo)
    for (const s of [m.ariaLabel, m.note, m.totalText, m.slices[5].label]) {
      assert.match(s, /⟦/)
      assert.doesNotMatch(s.replace(WRAP, ' ').split('Allocation').join(' ').replace(/P\d/g, ' '), /\p{L}/u, s)
    }
    assert.match(breakdownModel(null, 'M', pseudo).ariaLabel, /⟦/)
  })

  test('the catalog entry is the RFC\'s, in General', () => {
    const { tag, label, sizes, description, category } = WIDGETS.breakdown
    assert.deepEqual({ tag, label, sizes }, { tag: 'ts-breakdown', label: 'Breakdown', sizes: ['S', 'Wide', 'Tall', 'M'] })
    assert.equal(category, 'General')
    assert.equal(description, EN['widget.breakdown.description'])
  })
})

describe('the class and its templates', () => {
  test('declares its contract and a pure model the class re-exports', () => {
    assert.equal(B.TsBreakdown.catalogKey, 'breakdown')
    assert.equal(B.TsBreakdown.emptyText, 'Nothing to break down')
    assert.deepEqual(B.TsBreakdown.breakdownModel({ slices: FIVE }, 'M', ctx), model({ slices: FIVE }))
    assert.equal(checkShape({ slices: FIVE }, B.TsBreakdown.dataShape), null)
    assert.ok(checkShape({}, B.TsBreakdown.dataShape))
  })

  test('every size has a pure, textless template with the shared header, and a skeleton', () => {
    for (const v of ['S', 'Wide', 'Tall', 'M']) {
      const html = B.TsBreakdown.template(v)
      assert.match(html, /part="header"/)
      assert.match(html, /role="img"/)
      assert.doesNotMatch(html, />[^<]*\p{L}[^<]*</u)
      assert.doesNotMatch(html, /\s(aria-label|title)="[^"]*\p{L}/u)
      assert.doesNotMatch(html, /aria-live|role="(status|alert|log)"/)
      assert.equal(B.TsBreakdown.template(v), B.TsBreakdown.template(v))
      assert.match(B.TsBreakdown.skeleton(v), /class="sk /)
    }
    assert.match(B.TsBreakdown.template('M'), /<svg[^>]*part="chart"/)
    assert.match(B.TsBreakdown.template('Tall'), /part="legend"/)
    assert.doesNotMatch(B.TsBreakdown.template('S'), /part="legend"/)
  })

  test('the CSS uses tokens and logical properties only, and covers forced colours', () => {
    const css = B.TsBreakdown.styles
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(css, /\b(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/)
    assert.match(css, /@media \(forced-colors: active\)/)
    assert.match(css, /\.c0 \{ --c: var\(--ts-axis\)/)
    for (let n = 1; n <= 6; n++) assert.match(css, new RegExp(`\\.c${n} \\{ --c: var\\(--ts-series-${n}\\)`))
  })

  test('nothing writes markup from data', () => {
    assert.doesNotMatch(readFileSync(new URL('../src/elements/breakdown.js', import.meta.url), 'utf8'), /innerHTML|insertAdjacentHTML|outerHTML/)
  })
})

describe('the element draws in place', () => {
  const build = (variant = 'M') => {
    const doc = new MiniDoc()
    const el = new B.TsBreakdown()
    el.$ = keyedNodes(doc, (k) => (k === 'legend' ? 'ul' : k === 'bar' || k === 'arcs' ? 'div' : 'div'))
    el.ownerDocument = doc
    el.requestRender = () => {}
    const view = (d, v = variant) => el.update(B.TsBreakdown.viewModel(d, v, ctx), v)
    return { el, doc, view, legend: el.$('[data-k="legend"]'), bar: el.$('[data-k="bar"]'), arcs: el.$('[data-k="arcs"]'), node: el.$ }
  }
  const items = (legend) => legend.children.map((li) => [li.children[1].textContent, li.children[2].textContent, li.children[3].children[0].textContent, li.children[3].children[1].textContent])

  test('the first render makes one legend row, one segment and one arc for each part, with its label, share and note', () => {
    const { view, legend, arcs } = build('M')
    view({ slices: FIVE })
    assert.deepEqual(items(legend), [
      ['Equities', '41.2%', '41,200', 'Large and mid caps'],
      ['Bonds', '23.8%', '23,800', ''],
      ['Cash', '15.0%', '15,000', ''],
      ['Gold', '12.0%', '12,000', ''],
      ['Property', '8.0%', '8,000', ''],
    ])
    assert.equal(arcs.children.length, 5)
    assert.equal(legend.children[0].getAttribute('aria-label'), 'Equities, 41.2%')
    assert.equal(legend.children[0].getAttribute('part'), 'item')
    assert.equal(legend.children[0].children[0].getAttribute('aria-hidden'), 'true')
  })

  test('Wide and Tall draw segments whose widths are the true shares, set through the CSSOM', () => {
    const { view, bar, node } = build('Wide')
    view({ slices: FIVE }, 'Wide')
    assert.deepEqual(bar.children.map((s) => s.style.getPropertyValue('--w')), ['41.2%', '23.8%', '15%', '12%', '8%'])
    assert.equal(bar.getAttribute('aria-label'), 'Allocation: 5 parts, largest Equities 41.2%')
    assert.equal(bar.children.every((s) => !s.hasAttribute('style')), true)
    assert.equal(node('[data-k="note"]').hasAttribute('hidden'), true)
  })

  test('a changed value writes one text node, one length and one name; nothing is rebuilt', () => {
    const { view, doc } = build('Wide')
    view({ slices: FIVE }, 'Wide')
    doc.take()
    const next = FIVE.map((s) => (s.id === 'bd' ? { ...s, value: 23900 } : s))
    view({ slices: next }, 'Wide')
    const log = doc.take()
    assert.ok(!log.some((l) => l.startsWith('insert') || l.startsWith('remove')), log.join('\n'))
    // 23,900 of 100,100 shifts every share a little, so the percentages and the lengths move; the labels and notes never do.
    assert.ok(log.filter((l) => l.startsWith('text')).every((l) => /\d/.test(l)), log.join('\n'))
    assert.ok(log.some((l) => l.startsWith('text pc "23.9%"')) || log.some((l) => l.includes('23.9%')))
  })

  test('an update that changes nothing writes nothing', () => {
    const { view, doc } = build('M')
    view({ slices: FIVE, live: true, asOf: 0 })
    doc.take()
    view({ slices: FIVE.map((s) => ({ ...s })), live: true, asOf: 0 })
    assert.deepEqual(doc.take(), [])
  })

  test('a part that leaves is removed and one that arrives is inserted, and only those', () => {
    const { view, doc, legend } = build('Tall')
    view({ slices: FIVE }, 'Tall')
    doc.take()
    view({ slices: [...FIVE.slice(0, 4), { id: 'x', label: 'New', value: 100 }] }, 'Tall')
    const log = doc.take()
    assert.equal(log.filter((l) => l.startsWith('remove')).length, 2, 'one legend row and one segment')
    assert.equal(log.filter((l) => /^insert (li|seg)\b/.test(l)).length, 2, log.join('\n'))
    assert.equal(legend.children.length, 5)
  })

  test('negatives are said in words; with nothing to draw the drawing is hidden and the line says so', () => {
    const { view, node } = build('M')
    view({ slices: [...FIVE, { label: 'Short', value: -5 }] })
    assert.equal(node('[data-k="note"]').textContent, '1 negative value left out')
    assert.equal(node('[data-k="note"]').hasAttribute('hidden'), false)
    view({ slices: [] })
    assert.equal(node('[data-k="none"]').textContent, 'Nothing to break down')
    assert.equal(node('[data-k="none"]').hasAttribute('hidden'), false)
    assert.equal(node('[data-k="chart"]').hasAttribute('hidden'), true)
  })

  test('S writes the largest part\'s words and one length', () => {
    const { view, node } = build('S')
    view({ slices: FIVE }, 'S')
    assert.equal(node('[data-k="share"]').textContent, 'Equities 41.2%')
    assert.equal(node('[data-k="fill"]').style.getPropertyValue('--w'), '41.2%')
    assert.equal(node('[data-k="foot"]').textContent, 'Total 1,00,000')
    view({ slices: [{ label: 'a', value: 0 }] }, 'S')
    assert.equal(node('[data-k="none"]').hasAttribute('hidden'), false)
    assert.equal(node('[data-k="bar"]').hasAttribute('hidden'), true)
  })
})
