import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readsOf } from './ops.mjs'
import { createFormatter, createMessages, EN, WIDGETS } from '../src/core/index.js'
import { checkShape } from '../src/elements/dev.js'
import { barPosition, SPARK_POINTS } from '../src/elements/list-parts.js'
import { FakeElement, FakeDocument } from './fake-dom.mjs'
import { MiniDoc, keyedNodes } from './list-dom.mjs'

// <ts-watchlist> (RFC 0003 §21.3): the pure model, and the element's writes against a small tree DOM.

const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const ctx = { fmt, t: createMessages(), now: 0, label: 'Markets' }

let W // watchlist.js, loaded against the fake HTMLElement
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  W = await import('../src/elements/watchlist.js')
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})

const model = (data, variant = 'Tall') => W.watchlistModel(data, variant, ctx)

const ALPHA = { id: 'a', symbol: 'ALPHA 50', exchange: 'NSE', ltp: 24350.45, prevClose: 24300, dayLow: 24210.1, dayHigh: 24420.9, decimals: 2 }
const BETA = { id: 'b', symbol: 'BETA BANK', exchange: 'BSE', ltp: 51200, prevClose: 51500, dayLow: 51000, dayHigh: 51900, decimals: 0 }
const GAMMA = { id: 'c', symbol: 'GAMMA', ltp: 100, change: 1.5, changePct: 0.015 }
const data = (extra) => ({ instruments: [ALPHA, BETA, GAMMA], ...extra })
const ticks = (n, f = (k) => 100 + k) => Array.from({ length: n }, (_, k) => ({ t: 1_700_000_000_000 + k * 60000, price: f(k) }))

describe('without a DOM', () => {
  test('the class module loads and declares its contract', () => {
    assert.equal(typeof W.TsWatchlist, 'function')
    assert.equal(W.TsWatchlist.catalogKey, 'watchlist')
    assert.equal(W.TsWatchlist.emptyText, EN['widget.watchlist.empty'])
    assert.equal(W.TsWatchlist.emptyText, 'No instruments yet')
    assert.deepEqual(W.TsWatchlist.watchlistModel(data(), 'Tall', ctx), model(data()))
  })

  test('the catalog entry is the RFC\'s, with a description and a category', () => {
    const { tag, label, sizes, description, category } = WIDGETS.watchlist
    assert.deepEqual({ tag, label, sizes }, { tag: 'ts-watchlist', label: 'Watchlist', sizes: ['S', 'Tall', 'M'] })
    assert.ok(description.length > 0 && category === 'Markets')
  })

  test('the template is a table in a focusable scroller, with a caption, header cells and no words', () => {
    for (const v of ['S', 'Tall', 'M']) {
      const html = W.TsWatchlist.template(v)
      assert.match(html, /<table part="table"/)
      assert.match(html, /<caption class="visually-hidden" data-k="caption"><\/caption>/)
      assert.match(html, /data-k="scroll" role="group" tabindex="0"/)
      assert.equal((html.match(/<th scope="col"/g) || []).length, v === 'M' ? 3 : 2)
      assert.doesNotMatch(html, />[^<]*\p{L}[^<]*</u)
      assert.doesNotMatch(html, /\s(aria-label|title)="[^"]*\p{L}/u)
      assert.match(W.TsWatchlist.skeleton(v), /class="sk /)
    }
  })

  test('the CSS uses tokens and logical properties only', () => {
    const css = W.TsWatchlist.styles
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(css, /\b(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/)
    assert.doesNotMatch(css, /text-align:\s*(left|right)/)
    assert.match(css, /\.pt \{[^}]*border-radius: 50%/)
    assert.match(css, /@media \(forced-colors: active\)/)
  })

  test('dataShape asks for the instruments, and lists the freshness keys as optional', () => {
    const { instruments, ...rest } = W.TsWatchlist.dataShape
    assert.equal(instruments, 'array')
    assert.deepEqual(Object.keys(rest).sort(), ['asOf', 'live'])
    assert.equal(checkShape(data(), W.TsWatchlist.dataShape), null)
    assert.ok(checkShape({}, W.TsWatchlist.dataShape))
  })

  test('nothing writes markup from data', async () => {
    const { readFileSync } = await import('node:fs')
    for (const file of ['watchlist.js', 'list-parts.js']) {
      assert.doesNotMatch(readFileSync(new URL(`../src/elements/${file}`, import.meta.url), 'utf8'), /innerHTML|insertAdjacentHTML|outerHTML/, file)
    }
  })
})

describe('change and change %', () => {
  test('are worked out from the previous close, and the percent is a fraction of it', () => {
    const [a, b] = model(data()).rows
    assert.deepEqual([a.last, a.change, a.pct, a.arrow, a.tone], ['24,350.45', '+50.45', '+0.21%', '▲', 'pos'])
    assert.deepEqual([b.last, b.change, b.pct, b.arrow, b.tone], ['51,200', '−300', '−0.58%', '▼', 'neg'])
  })

  test('are used as given, and a given one is never recomputed', () => {
    const [, , c] = model(data()).rows
    assert.deepEqual([c.change, c.pct, c.arrow], ['+1.50', '+1.50%', '▲'])
    // A change that disagrees with the previous close is the host's to say.
    const [x] = model({ instruments: [{ ...ALPHA, change: -3, changePct: -0.01 }] }).rows
    assert.deepEqual([x.change, x.pct, x.arrow], ['−3.00', '−1.00%', '▼'])
  })

  test('one given and one not: each follows its own rule', () => {
    const [onlyChange] = model({ instruments: [{ ...ALPHA, change: 10 }] }).rows
    assert.deepEqual([onlyChange.change, onlyChange.pct], ['+10.00', '+0.04%'])
    const [onlyPct] = model({ instruments: [{ ...ALPHA, changePct: 0.5 }] }).rows
    assert.deepEqual([onlyPct.change, onlyPct.pct], ['+50.45', '+50.00%'])
  })

  test('without a previous close, and none given, nothing is shown or invented', () => {
    const [x] = model({ instruments: [{ id: 'x', symbol: 'X', ltp: 10 }] }).rows
    assert.deepEqual([x.change, x.pct, x.arrow, x.tone], ['', '', '', 'mut'])
  })

  test('a zero previous close has a change but no percentage, never an infinity', () => {
    const [x] = model({ instruments: [{ id: 'x', ltp: 5, prevClose: 0 }] }).rows
    assert.deepEqual([x.change, x.pct], ['+5.00', ''])
  })

  test('a change that rounds to zero shows no sign and no arrow', () => {
    const [x] = model({ instruments: [{ id: 'x', ltp: 100.001, prevClose: 100, decimals: 2 }] }).rows
    assert.deepEqual([x.change, x.arrow, x.tone], ['0.00', '', 'mut'])
  })

  test('numeric strings are read like numbers; a price that cannot be read is a dash', () => {
    const [x, y] = model({ instruments: [{ id: 'x', ltp: '100.50', prevClose: '100' }, { id: 'y', ltp: 'n/a', prevClose: 100 }] }).rows
    assert.deepEqual([x.last, x.change], ['100.50', '+0.50'])
    assert.deepEqual([y.last, y.change, y.arrow], ['—', '', ''])
  })
})

describe('decimals', () => {
  test('each instrument\'s own apply to its price, its change and its range', () => {
    const rows = model({
      instruments: [
        { id: 'a', ltp: 24350.456, prevClose: 24300, decimals: 3, dayLow: 24200, dayHigh: 24400 },
        { id: 'b', ltp: 83.41256, prevClose: 83.4, decimals: 4 },
        { id: 'c', ltp: 51200.4, prevClose: 51500, decimals: 0 },
      ],
    }).rows
    assert.deepEqual(rows.map((r) => [r.last, r.change]), [['24,350.456', '+50.456'], ['83.4126', '+0.0126'], ['51,200', '−300']])
    assert.match(rows[0].bar.label, /24,200\.000 to 24,400\.000, now 24,350\.456/)
  })

  test('default to two, and an unusable value is the default', () => {
    for (const decimals of [undefined, -1, 1.5, 'x', 21]) {
      const [r] = model({ instruments: [{ id: 'a', ltp: 10, prevClose: 9, decimals }] }).rows
      assert.deepEqual([r.last, r.change], ['10.00', '+1.00'], String(decimals))
    }
  })
})

describe('the day range', () => {
  test('is drawn only with both a low and a high', () => {
    const [full, noLow, noHigh, none] = model({
      instruments: [
        ALPHA,
        { ...ALPHA, id: 'l', dayLow: undefined },
        { ...ALPHA, id: 'h', dayHigh: undefined },
        { id: 'n', ltp: 5 },
      ],
    }).rows
    assert.ok(full.bar)
    assert.equal(noLow.bar, null)
    assert.equal(noHigh.bar, null)
    assert.equal(none.bar, null)
  })

  test('places the price along the range, and says so in words', () => {
    const { bar } = model(data()).rows[0]
    assert.equal(bar.now, barPosition(24350.45, 24210.1, 24420.9))
    assert.equal(bar.label, 'Day range 24,210.10 to 24,420.90, now 24,350.45')
  })

  test('holds a price outside the range to the bar\'s end, and the words still tell the truth', () => {
    const [above, below] = model({ instruments: [{ id: 'a', ltp: 120, dayLow: 90, dayHigh: 110 }, { id: 'b', ltp: 80, dayLow: 90, dayHigh: 110 }] }).rows
    assert.deepEqual([above.bar.now, below.bar.now], [100, 0])
    assert.match(above.bar.label, /now 120\.00$/)
  })

  test('a range with no extent puts the price in the middle, and a range read backwards is no range', () => {
    const [flat, backwards] = model({ instruments: [{ id: 'a', ltp: 100, dayLow: 100, dayHigh: 100 }, { id: 'b', ltp: 100, dayLow: 110, dayHigh: 90 }] }).rows
    assert.equal(flat.bar.now, 50)
    assert.equal(backwards.bar, null)
  })

  test('without a readable price the bar keeps its ends and has no mark', () => {
    const [x] = model({ instruments: [{ id: 'a', ltp: 'n/a', dayLow: 90, dayHigh: 110 }] }).rows
    assert.deepEqual([x.bar.now, x.bar.label], [null, 'Day range 90.00 to 110.00'])
  })

  test('barPosition is one decimal, clamped, and null for what is not a number', () => {
    assert.equal(barPosition(1, 0, 3), 33.3)
    assert.equal(barPosition(5, 0, 3), 100)
    assert.equal(barPosition(3, 6, 0), 50)
    assert.ok(Number.isNaN(barPosition(NaN, 0, 1)))
    assert.ok(Number.isNaN(barPosition(1, undefined, 1)))
  })
})

describe('sizes', () => {
  test('S shows the first instrument that can be read; Tall and M show them all', () => {
    const list = { instruments: [{ nope: 1 }, ALPHA, BETA, GAMMA] }
    assert.deepEqual(model(list, 'S').rows.map((r) => r.id), ['a'])
    assert.deepEqual(model(list, 'Tall').rows.map((r) => r.id), ['a', 'b', 'c'])
    assert.deepEqual(model(list, 'M').rows.map((r) => r.id), ['a', 'b', 'c'])
  })

  test('the sparkline is M\'s, from at least two ticks, and any order', () => {
    const shuffled = [...ticks(6)].reverse()
    const [m] = model({ instruments: [{ ...ALPHA, ticks: shuffled }] }, 'M').rows
    assert.ok(m.spark.line.startsWith('M'))
    assert.deepEqual(model({ instruments: [{ ...ALPHA, ticks: shuffled }] }, 'Tall').rows[0].spark, null)
    assert.equal(model({ instruments: [{ ...ALPHA, ticks: ticks(1) }] }, 'M').rows[0].spark, null)
    assert.equal(model({ instruments: [{ ...ALPHA, ticks: 'x' }] }, 'M').rows[0].spark, null)
    // Sorted by time, so the line runs from the first reading to the last.
    assert.equal(m.spark.line, model({ instruments: [{ ...ALPHA, ticks: ticks(6) }] }, 'M').rows[0].spark.line)
  })

  test('the sparkline is toned by its own direction, and has a text alternative', () => {
    const rows = model({ instruments: [{ ...ALPHA, ticks: ticks(5) }, { ...ALPHA, id: 'd', ticks: ticks(5, (k) => 200 - k) }, { ...ALPHA, id: 'f', ticks: ticks(5, () => 7) }] }, 'M').rows
    assert.deepEqual(rows.map((r) => r.spark.tone), ['pos', 'neg', 'mut'])
    assert.equal(rows[0].spark.label, 'ALPHA 50 trend, from 100.00 to 104.00')
  })

  test('a long series is thinned to a few dozen points, keeping both ends', () => {
    const long = ticks(5000, (k) => 100 + Math.sin(k / 50) * 10)
    const { spark } = model({ instruments: [{ ...ALPHA, ticks: long }] }, 'M').rows[0]
    const points = spark.line.split(' L').length
    assert.equal(points, SPARK_POINTS)
    assert.match(spark.label, /from 100\.00 to /)
  })

  test('the model\'s cost grows in step with the rows: four times the rows is well under ten times the work', () => {
    // Counts reads of the input instead of timing the call: a clock flakes under
    // load, a count does not. Linear is 4; a quadratic step (each row looking at
    // the others) would be 16, so 4.5 leaves room only for constants.
    const reads = (n) => readsOf({ instruments: Array.from({ length: n }, (_, i) => ({ ...ALPHA, id: `i${i}`, ticks: ticks(300) })) }, (big) => model(big, 'M'))
    const ratio = reads(480) / reads(120)
    assert.ok(ratio > 3 && ratio <= 4.5, `reads grew ${ratio.toFixed(2)}x for 4x the rows`)
  })

  test('a tiny previous close gives a change of zero and no sign', () => {
    for (const ltp of [1e-9, 1.0000001e-9]) {
      const [r] = model({ instruments: [{ id: 'x', ltp, prevClose: 1e-9 }] }).rows
      assert.deepEqual([r.change, r.pct, r.arrow], ['0.00', '0.00%', ''], String(ltp))
    }
  })

  test('a development warning counts the instruments dropped for want of an id, once', () => {
    const el = new W.TsWatchlist()
    const warned = []
    const was = console.warn
    console.warn = (m) => warned.push(m)
    try {
      el._checkDropped(model({ instruments: [ALPHA, { symbol: 'x' }, null] }))
      el._checkDropped(model({ instruments: [ALPHA, { symbol: 'x' }, null] }))
    } finally {
      console.warn = was
    }
    assert.equal(warned.length, 1)
    assert.match(warned[0], /dropped 2 rows/)
  })

  test('symbols and exchanges are bidi-isolated, and no row of the list takes focus, so none can lose it', () => {
    assert.match(W.TsWatchlist.styles, /\.sym \{[^}]*unicode-bidi: isolate/)
    assert.match(W.TsWatchlist.styles, /\.ex \{[^}]*unicode-bidi: isolate/)
  })
})

describe('rows and the accessible name', () => {
  test('an instrument with no id, a repeated id or no object is dropped and counted', () => {
    const m = model({ instruments: [ALPHA, null, 'x', { symbol: 'no id' }, { ...BETA, id: 'a' }, { id: '' }, { id: 7, ltp: 1 }, BETA] })
    assert.deepEqual(m.rows.map((r) => r.id), ['a', 7, 'b'])
    assert.equal(m.dropped, 5)
  })

  test('data that is not a watchlist gives an empty one rather than throwing', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { instruments: 'x' }, { instruments: {} }]) {
      const m = model(bad)
      assert.deepEqual([m.rows, m.total], [[], 0], String(bad))
    }
  })

  test('the symbol is the id when there is none, and an exchange is optional', () => {
    const [x] = model({ instruments: [{ id: 'abc', ltp: 1 }] }).rows
    assert.deepEqual([x.symbol, x.exchange], ['abc', ''])
  })

  test('the name states the count; S says it shows the first', () => {
    assert.equal(model(data()).ariaLabel, 'Markets, 3 instruments')
    assert.equal(model({ instruments: [ALPHA] }).ariaLabel, 'Markets, 1 instrument')
    assert.equal(model(data(), 'S').ariaLabel, 'Markets, 3 instruments, showing the first')
    assert.equal(model({ instruments: [ALPHA] }, 'S').ariaLabel, 'Markets, 1 instrument')
  })

  test('the tile is named by its label alone and the caption carries the summary', () => {
    const vm = W.TsWatchlist.viewModel(data(), 'Tall', ctx)
    assert.equal(vm.ariaLabel, 'Markets')
    assert.equal(vm.summary, 'Markets, 3 instruments')
    assert.equal(vm.noRows, 'No instruments yet')
  })

  test('freshness: the live dot and the synced time', () => {
    const m = model(data({ live: true, asOf: Date.UTC(2026, 7, 5, 6, 12) }))
    assert.deepEqual([m.live, m.time], [true, '11:42'])
    assert.deepEqual([model(data()).live, model(data()).time], [false, ''])
  })
})

describe('words', () => {
  const PSEUDO = createMessages(Object.fromEntries(Object.entries(EN).map(([key, value]) => [key, `⟦${value}⟧`])))
  const pseudo = { ...ctx, t: PSEUDO }
  const WRAP = /⟦[^⟦⟧]*⟧/g

  test('every word in the model comes from the messages, in the pseudo-locale', () => {
    const rich = { instruments: [{ ...ALPHA, ticks: ticks(5) }, BETA] }
    for (const variant of ['S', 'Tall', 'M']) {
      const m = W.watchlistModel(rich, variant, pseudo)
      const strings = [m.ariaLabel, ...m.rows.flatMap((r) => [r.bar && r.bar.label, r.spark && r.spark.label])].filter(Boolean)
      assert.ok(strings.length >= 2)
      for (const s of strings) {
        const left = s.replace(WRAP, ' ').split('ALPHA 50').join(' ').split('Markets').join(' ')
        assert.doesNotMatch(left, /\p{L}/u, `${variant}: ${s}`)
        assert.match(s, /⟦/)
      }
    }
  })

  test('the keys exist: the caption, the column names, the bar and the trend', () => {
    for (const key of ['watchlist.aria', 'watchlist.col.instrument', 'watchlist.col.trend', 'watchlist.col.price', 'watchlist.range', 'watchlist.rangeOnly', 'watchlist.trend', 'watchlist.add', 'watchlist.region', 'widget.watchlist.empty']) {
      assert.ok(key in EN, key)
    }
  })
})

// ── The element ───────────────────────────────────────────────────────────

function build({ actions = [], variant = 'Tall' } = {}) {
  const doc = new MiniDoc()
  const el = new W.TsWatchlist()
  el.$ = keyedNodes(doc, (k) => (k === 'table' ? 'table' : k === 'add' ? 'button' : 'div'))
  el.ownerDocument = doc
  el.actions = actions
  el.requestRender = () => {}
  const events = []
  el.addEventListener('ts-action', (e) => events.push(e.detail))
  const view = (d, v = variant) => el.update(W.TsWatchlist.viewModel(d, v, ctx), v)
  return { el, doc, view, events, section: el._section, table: el.$('[data-k="table"]'), node: el.$ }
}

// The cells' text of each instrument: symbol, exchange, last price, arrow, change, percent.
const textsOf = (table) =>
  table.children.map((tb) => {
    const tr = tb.children[0]
    const [th] = tr.children
    const fig = tr.children[tr.children.length - 1]
    return [th.children[0].textContent, th.children[1].textContent, fig.children[0].textContent, ...fig.children[1].children.map((c) => c.textContent)]
  })

describe('the element draws in place', () => {
  test('the first render makes one body for each instrument, with its row and its range bar', () => {
    const { view, table } = build()
    view(data())
    assert.deepEqual(textsOf(table), [
      ['ALPHA 50', 'NSE', '24,350.45', '▲', '+50.45', '+0.21%'],
      ['BETA BANK', 'BSE', '51,200', '▼', '−300', '−0.58%'],
      ['GAMMA', '', '100.00', '▲', '+1.50', '+1.50%'],
    ])
    assert.ok(table.children.every((tb) => tb.getAttribute('part') === 'row' && tb.children.length === 2))
    const [a, , c] = table.children
    const bar = (tb) => tb.children[1].firstChild.firstChild
    assert.equal(bar(a).hasAttribute('hidden'), false)
    assert.equal(bar(c).hasAttribute('hidden'), true, 'no range, no bar')
    assert.equal(bar(a).getAttribute('role'), 'img')
    assert.equal(bar(a).getAttribute('aria-label'), 'Day range 24,210.10 to 24,420.90, now 24,350.45')
    assert.equal(bar(a).style.getPropertyValue('--n'), String(barPosition(24350.45, 24210.1, 24420.9)))
  })

  test('a price change writes the price, the change, the bar\'s words and the bar\'s mark, and nothing else', () => {
    const { view, doc } = build()
    view(data())
    doc.take()
    view(data({ instruments: [{ ...ALPHA, ltp: 24351.45 }, BETA, GAMMA] }))
    const log = doc.take()
    assert.equal(log.length, 4, log.join('\n'))
    assert.deepEqual(log.filter((l) => l.startsWith('text')), ['text last "24,351.45"', 'text abs "+51.45"'])
    assert.ok(log.some((l) => l.startsWith('attr rb day aria-label=')))
    assert.ok(log.some((l) => l.startsWith('style rb day --n=')))
  })

  test('an update that changes nothing writes nothing', () => {
    const { view, doc } = build()
    view(data({ live: true, asOf: 0 }))
    doc.take()
    view(data({ instruments: [{ ...ALPHA }, { ...BETA }, { ...GAMMA }], live: true, asOf: 0 }))
    assert.deepEqual(doc.take(), [])
  })

  test('a flip of the change\'s sign rewrites the arrow, the colour and the figures, and nothing else', () => {
    const { view, doc, table } = build()
    view({ instruments: [{ id: 'a', symbol: 'A', ltp: 105, prevClose: 100 }] })
    doc.take()
    view({ instruments: [{ id: 'a', symbol: 'A', ltp: 95, prevClose: 100 }] })
    assert.deepEqual(doc.take(), ['text last "95.00"', 'attr chg n pos class=chg n neg', 'text ar "▼"', 'text abs "−5.00"', 'text pct "−5.00%"'])
    const chg = table.children[0].children[0].children[1].children[1]
    assert.equal(chg.getAttribute('class'), 'chg n neg')
    assert.equal(chg.children[0].getAttribute('aria-hidden'), 'true')
  })

  test('a new instrument is added and the others are not touched', () => {
    const { view, doc, table } = build()
    view(data())
    const before = [...table.children]
    doc.take()
    view({ instruments: [...data().instruments, { id: 'd', symbol: 'DELTA', ltp: 9, prevClose: 10, dayLow: 8, dayHigh: 12 }] })
    assert.deepEqual(table.children.slice(0, 3), before)
    const log = doc.take()
    assert.equal(log.filter((l) => l.startsWith('remove')).length, 0)
    // Its own text: symbol, price, arrow, change and percent (the empty exchange is not written).
    assert.equal(log.filter((l) => /^text (sym|ex|last|ar|abs|pct) /.test(l)).length, 5)
    // The caption counts the instruments now.
    assert.ok(log.includes('text div "Markets, 4 instruments"'))
    assert.equal(table.children.length, 4)
  })

  test('a reorder moves the bodies and rewrites no text; a removal removes only that body', () => {
    const { view, doc, table } = build()
    view(data())
    const [a, b, c] = table.children
    doc.take()
    view({ instruments: [GAMMA, ALPHA, BETA] })
    assert.deepEqual(table.children, [c, a, b])
    assert.deepEqual(doc.take().filter((l) => /^(text|attr|style)/.test(l)), [])
    view({ instruments: [GAMMA, BETA] })
    assert.deepEqual(table.children, [c, b])
  })

  test('S draws the first instrument only, and the narrow header, caption and empty line are written', () => {
    const { view, node, table } = build({ variant: 'S' })
    view(data(), 'S')
    assert.equal(table.children.length, 1)
    assert.equal(node('[data-k="caption"]').textContent, 'Markets, 3 instruments, showing the first')
    assert.equal(node('[data-k="scroll"]').getAttribute('aria-label'), 'Markets, instruments')
    assert.deepEqual(['h0', 'h1'].map((k) => node(`[data-k="${k}"]`).textContent), ['Instrument', 'Last price and change'])
    view({ instruments: [] }, 'S')
    assert.equal(node('[data-k="none"]').textContent, 'No instruments yet')
    assert.equal(node('[data-k="none"]').hasAttribute('hidden'), false)
  })

  test('M adds the sparkline column, with its own text alternative; fewer than two ticks hides it', () => {
    const { view, node, table } = build({ variant: 'M' })
    view({ instruments: [{ ...ALPHA, ticks: ticks(5) }, BETA] }, 'M')
    assert.deepEqual(['h0', 'h1', 'h2'].map((k) => node(`[data-k="${k}"]`).textContent), ['Instrument', 'Trend', 'Last price and change'])
    const [a, b] = table.children
    const svg = (tb) => tb.children[0].children[1].firstChild
    assert.equal(a.children[0].children.length, 3)
    assert.equal(svg(a).getAttribute('role'), 'img')
    assert.equal(svg(a).getAttribute('aria-label'), 'ALPHA 50 trend, from 100.00 to 104.00')
    assert.ok(svg(a).firstChild.getAttribute('d').startsWith('M'))
    assert.equal(svg(b).hasAttribute('hidden'), true)
    assert.equal(a.children[1].firstChild.firstChild.getAttribute('colspan') ?? a.children[1].firstChild.getAttribute('colspan'), '3')
  })

  test('the header marks the live dot and the synced time', () => {
    const { view, node } = build()
    view(data({ live: true, asOf: Date.UTC(2026, 7, 5, 6, 12) }))
    assert.equal(node('[data-k="dot"]').hasAttribute('hidden'), false)
    assert.equal(node('[data-k="time"]').textContent, '11:42')
    view(data())
    assert.equal(node('[data-k="dot"]').hasAttribute('hidden'), true)
    assert.equal(node('[data-k="meta"]').hasAttribute('hidden'), true)
  })
})

describe('add-instrument', () => {
  const click = (b, target) => b.section.dispatch('click', { target, preventDefault() {}, stopPropagation() {} })

  test('the button is hidden until actions lists it', () => {
    const b = build()
    b.view(data())
    assert.equal(b.node('[data-k="add"]').hasAttribute('hidden'), true)
    assert.equal(b.section.hasAttribute('data-add'), false)
    b.el.actions = ['add-instrument']
    b.view(data())
    assert.equal(b.node('[data-k="add"]').hasAttribute('hidden'), false)
    assert.equal(b.section.hasAttribute('data-add'), true)
    assert.equal(b.node('[data-k="add"]').getAttribute('aria-label'), 'Add instrument')
    assert.equal(b.node('[data-k="add"]').getAttribute('title'), 'Add instrument')
  })

  test('a press fires add-instrument, with no detail', () => {
    const b = build({ actions: ['add-instrument'] })
    b.view(data())
    const add = b.node('[data-k="add"]')
    add.setAttribute('class', 'btn add')
    click(b, add)
    assert.deepEqual(b.events, [{ action: 'add-instrument' }])
  })

  test('with no opt-in a press fires nothing', () => {
    const b = build({ actions: ['add-instrument'] })
    b.view(data())
    const add = b.node('[data-k="add"]')
    add.setAttribute('class', 'btn add')
    b.el.actions = []
    click(b, add)
    assert.deepEqual(b.events, [])
  })

  test('nothing fires while the grid is editing, and a click elsewhere does nothing', () => {
    const b = build({ actions: ['add-instrument'] })
    b.el._isEditing = () => true
    b.view(data())
    const add = b.node('[data-k="add"]')
    add.setAttribute('class', 'btn add')
    click(b, add)
    b.el._isEditing = () => false
    click(b, b.table.children[0])
    click(b, undefined)
    assert.deepEqual(b.events, [])
  })
})
