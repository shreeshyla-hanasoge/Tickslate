import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createFormatter, createMessages, EN, WIDGETS } from '../src/core/index.js'
import { checkShape } from '../src/elements/dev.js'
import { barPosition } from '../src/elements/list-parts.js'
import { FakeElement, FakeDocument } from './fake-dom.mjs'
import { MiniDoc, keyedNodes } from './list-dom.mjs'

// <ts-open-positions> (RFC 0003 §21.3): the pure model, and the element's writes against a small tree DOM.

const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const ctx = { fmt, t: createMessages(), now: 0, label: 'Positions' }

let P // open-positions.js, loaded against the fake HTMLElement
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  P = await import('../src/elements/open-positions.js')
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})

const model = (data, variant = 'M') => P.positionsModel(data, variant, ctx)

const LONG = { id: 'p1', instrument: 'ETA 24500 CE', side: 'long', quantity: 50, entryPrice: 128, ltp: 133.4, pnl: 270, stop: 120, target: 140, strategy: 'Breakout', account: 'Account A', lots: 2 }
const SHORT = { id: 'p2', instrument: 'IOTA 24400 PE', side: 'short', quantity: 75, entryPrice: 96.5, ltp: 99, pnl: -187.5, stop: 104, target: 85 }
const BARE = { id: 'p3', instrument: 'MU CRUDE', side: 'long', quantity: 10, entryPrice: 6400, ltp: 6390.5, pnl: -95 }
const data = (extra) => ({ positions: [LONG, SHORT, BARE], ...extra })
const path = (n, f = (k) => 100 + k) => Array.from({ length: n }, (_, k) => ({ t: 1_700_000_000_000 + k * 60000, price: f(k) }))

describe('without a DOM', () => {
  test('the class module loads and declares its contract', () => {
    assert.equal(typeof P.TsOpenPositions, 'function')
    assert.equal(P.TsOpenPositions.catalogKey, 'openPositions')
    assert.equal(P.TsOpenPositions.emptyText, EN['widget.openPositions.empty'])
    assert.equal(P.TsOpenPositions.emptyText, 'No open positions')
    assert.deepEqual(P.TsOpenPositions.positionsModel(data(), 'M', ctx), model(data()))
  })

  test('the catalog entry is the RFC\'s, with a description and a category', () => {
    const { tag, label, sizes, description, category } = WIDGETS.openPositions
    assert.deepEqual({ tag, label, sizes }, { tag: 'ts-open-positions', label: 'Open positions', sizes: ['Wide', 'M', 'L'] })
    assert.ok(description.length > 0 && category === 'Accounts')
  })

  test('the template is a table in a focusable scroller, with a caption, header cells and no words', () => {
    for (const v of ['Wide', 'M', 'L']) {
      const html = P.TsOpenPositions.template(v)
      assert.match(html, /<table part="table"/)
      assert.match(html, /<caption class="visually-hidden" data-k="caption"><\/caption>/)
      assert.match(html, /data-k="scroll" role="group" tabindex="0"/)
      // Instrument, last price, P&L and the actions column (hidden until exit-position is listed); L adds the trend.
      assert.equal((html.match(/<th scope="col"/g) || []).length, v === 'L' ? 5 : 4)
      assert.match(html, /<th scope="col" hidden data-k="h4c">/)
      assert.doesNotMatch(html, />[^<]*\p{L}[^<]*</u)
      assert.doesNotMatch(html, /\s(aria-label|title)="[^"]*\p{L}/u)
      assert.match(P.TsOpenPositions.skeleton(v), /class="sk /)
    }
  })

  test('the CSS uses tokens and logical properties only', () => {
    const css = P.TsOpenPositions.styles
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(css, /\b(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/)
    assert.doesNotMatch(css, /text-align:\s*(left|right)/)
    assert.match(css, /\.rb \{[^}]*direction: ltr/)
    assert.match(css, /\.zl \{[^}]*--ts-loss/)
    assert.match(css, /\.zp \{[^}]*--ts-profit/)
  })

  test('dataShape asks for the positions, and lists the rest as optional', () => {
    const { positions, ...rest } = P.TsOpenPositions.dataShape
    assert.equal(positions, 'array')
    assert.deepEqual(Object.keys(rest).sort(), ['asOf', 'live', 'margin', 'mtm'])
    assert.ok(Object.values(rest).every((f) => f.optional === true))
    assert.equal(checkShape(data(), P.TsOpenPositions.dataShape), null)
    assert.ok(checkShape({}, P.TsOpenPositions.dataShape))
  })

  test('nothing writes markup from data', async () => {
    const { readFileSync } = await import('node:fs')
    assert.doesNotMatch(readFileSync(new URL('../src/elements/open-positions.js', import.meta.url), 'utf8'), /innerHTML|insertAdjacentHTML|outerHTML/)
  })
})

describe('the range bar', () => {
  test('runs from the stop to the target, with the entry and the last price placed along it', () => {
    const { bar } = model(data()).rows[0]
    assert.deepEqual([bar.entry, bar.now], [40, 67])
    assert.equal(bar.entry, barPosition(128, 120, 140))
  })

  test('says so in words: the RFC\'s own sentence', () => {
    assert.equal(model(data()).rows[0].bar.label, 'Between stop 120.00 and target 140.00, entry 128.00, now 133.40')
  })

  test('is the same bar for a short: the stop is still on the left and the target on the right', () => {
    const { bar } = model(data()).rows[1]
    // 96.5 sits 39.5 % of the way from the stop (104) down to the target (85), and 99 sits at 26.3 %.
    assert.deepEqual([bar.entry, bar.now], [39.5, 26.3])
    assert.equal(bar.label, 'Between stop 104.00 and target 85.00, entry 96.50, now 99.00')
    // A loss for a short is the price rising towards the stop: the mark moves left.
    const worse = model({ positions: [{ ...SHORT, ltp: 102 }] }).rows[0].bar
    assert.ok(worse.now < bar.now)
  })

  test('needs both a stop and a target: with one, or neither, there is no bar', () => {
    const [full, noTarget, noStop, none] = model({
      positions: [LONG, { ...LONG, id: 'a', target: undefined }, { ...LONG, id: 'b', stop: undefined }, BARE],
    }).rows
    assert.ok(full.bar)
    assert.equal(noTarget.bar, null)
    assert.equal(noStop.bar, null)
    assert.equal(none.bar, null)
  })

  test('a stop equal to the target has no extent, so no bar; unreadable ends are not ends', () => {
    const [same, text, nan] = model({ positions: [{ ...LONG, id: 'a', stop: 130, target: 130 }, { ...LONG, id: 'b', stop: 'low', target: 140 }, { ...LONG, id: 'c', stop: null, target: 140 }] }).rows
    assert.deepEqual([same.bar, text.bar, nan.bar], [null, null, null])
  })

  test('without an entry price there is no entry tick, without a last price no dot, and the words follow', () => {
    const [noEntry, noLast, neither] = model({
      positions: [{ ...LONG, id: 'a', entryPrice: undefined }, { ...LONG, id: 'b', ltp: 'n/a' }, { ...LONG, id: 'c', entryPrice: undefined, ltp: undefined }],
    }).rows
    assert.deepEqual([noEntry.bar.entry, noEntry.bar.now], [null, 67])
    assert.equal(noEntry.bar.label, 'Between stop 120.00 and target 140.00, now 133.40')
    assert.deepEqual([noLast.bar.entry, noLast.bar.now], [40, null])
    assert.equal(noLast.bar.label, 'Between stop 120.00 and target 140.00, entry 128.00')
    assert.equal(neither.bar.label, 'Between stop 120.00 and target 140.00')
  })

  test('a price beyond the stop or the target sits at the bar\'s end, and the words say where it is', () => {
    const [past, below] = model({ positions: [{ ...LONG, id: 'a', ltp: 150 }, { ...LONG, id: 'b', ltp: 110 }] }).rows
    assert.deepEqual([past.bar.now, below.bar.now], [100, 0])
    assert.match(past.bar.label, /now 150\.00$/)
  })

  test('is drawn at M and L; the model gives it at every size, the element decides', () => {
    for (const v of ['Wide', 'M', 'L']) assert.ok(model(data(), v).rows[0].bar, v)
  })
})

describe('profit and loss, quantity and the summary', () => {
  test('the figures are signed money with a true minus, an arrow and a tone', () => {
    const rows = model(data()).rows
    assert.deepEqual(rows.map((r) => [r.pnl, r.arrow, r.tone]), [['+₹270.00', '▲', 'pos'], ['−₹187.50', '▼', 'neg'], ['−₹95.00', '▼', 'neg']])
  })

  test('a profit that rounds to nothing shows no sign and no arrow; a missing one is a dash', () => {
    const [flat, missing] = model({ positions: [{ ...LONG, pnl: 0.001 }, { ...LONG, id: 'b', pnl: undefined }] }).rows
    assert.deepEqual([flat.pnl, flat.arrow, flat.tone], ['₹0.00', '', 'mut'])
    assert.deepEqual([missing.pnl, missing.arrow], ['—', ''])
  })

  test('the side is a word, never only a colour; quantity and entry read "50 @ 128.00"', () => {
    const [long, short] = model(data()).rows
    assert.deepEqual([long.side, long.sideText, long.detail], ['long', 'Long', '50 @ 128.00'])
    assert.deepEqual([short.side, short.sideText, short.detail], ['short', 'Short', '75 @ 96.50'])
    const [odd] = model({ positions: [{ id: 'x', side: 'sideways', quantity: 3 }] }).rows
    assert.deepEqual([odd.side, odd.sideText, odd.detail], ['', '', '3'])
    assert.equal(model({ positions: [{ id: 'x' }] }).rows[0].detail, '')
  })

  test('prices read as numbers: strings work, and one that cannot be read is a dash', () => {
    const [a, b] = model({ positions: [{ ...LONG, ltp: '133.40' }, { ...LONG, id: 'b', ltp: 'x' }] }).rows
    assert.deepEqual([a.last, b.last], ['133.40', '—'])
  })

  test('the name is the instrument, or the id; the strategy, account and lots are the hover text', () => {
    const [a, b] = model({ positions: [LONG, { id: 'zz', side: 'long' }] }).rows
    assert.deepEqual([a.name, b.name], ['ETA 24500 CE', 'zz'])
    assert.equal(a.title, 'Breakout · Account A · 2 lots')
    assert.equal(b.title, '')
    assert.equal(model({ positions: [{ ...LONG, lots: 1, strategy: undefined, account: undefined }] }).rows[0].title, '1 lot')
  })

  test('mtm is the sum of the pnl unless the host gives it', () => {
    assert.deepEqual(model(data()).mtm, { text: '−₹12.50', arrow: '▼', tone: 'neg' })
    assert.deepEqual(model(data({ mtm: 1500 })).mtm, { text: '+₹1,500.00', arrow: '▲', tone: 'pos' })
    // A given mtm is the host's; an unreadable one falls back to the sum.
    assert.equal(model(data({ mtm: -2 })).mtm.text, '−₹2.00')
    assert.equal(model(data({ mtm: 'n/a' })).mtm.text, '−₹12.50')
  })

  test('mtm adds the pnl that can be read, and is null when none can', () => {
    assert.equal(model({ positions: [LONG, { ...SHORT, pnl: 'x' }] }).mtm.text, '+₹270.00')
    assert.equal(model({ positions: [{ ...LONG, pnl: undefined }] }).mtm, null)
    assert.equal(model({ positions: [] }).mtm, null)
    assert.deepEqual(model({ positions: [LONG, { ...SHORT, pnl: -270 }] }).mtm, { text: '₹0.00', arrow: '', tone: 'mut' })
  })

  test('a given mtm shows even with no positions, and the margin is L\'s', () => {
    assert.equal(model({ positions: [], mtm: 10 }).mtm.text, '+₹10.00')
    assert.equal(model(data({ margin: 184500.5 }), 'L').margin, '₹1,84,500.50')
    assert.equal(model(data({ margin: 184500.5 }), 'M').margin, '')
    assert.equal(model(data({ margin: 'x' }), 'L').margin, '')
    assert.equal(model(data(), 'L').margin, '')
  })
})

describe('the price path', () => {
  test('is L\'s, from at least two points, in any order', () => {
    const shuffled = [...path(6)].reverse()
    const [l] = model({ positions: [{ ...LONG, path: shuffled }] }, 'L').rows
    assert.ok(l.spark.line.startsWith('M'))
    assert.equal(l.spark.line, model({ positions: [{ ...LONG, path: path(6) }] }, 'L').rows[0].spark.line)
    assert.equal(model({ positions: [{ ...LONG, path: shuffled }] }, 'M').rows[0].spark, null)
    assert.equal(model({ positions: [{ ...LONG, path: path(1) }] }, 'L').rows[0].spark, null)
    assert.equal(model({ positions: [{ ...LONG, path: 5 }] }, 'L').rows[0].spark, null)
  })

  test('is toned by its direction and has a text alternative', () => {
    const rows = model({ positions: [{ ...LONG, path: path(5) }, { ...LONG, id: 'b', path: path(5, (k) => 200 - k) }] }, 'L').rows
    assert.deepEqual(rows.map((r) => r.spark.tone), ['pos', 'neg'])
    assert.equal(rows[0].spark.label, 'ETA 24500 CE, price since entry, from 100.00 to 104.00')
  })
})

describe('rows and the accessible name', () => {
  test('a position with no id, a repeated id or no object is dropped and counted', () => {
    const m = model({ positions: [LONG, null, 'x', { instrument: 'no id' }, { ...SHORT, id: 'p1' }, { id: '' }, { id: 7, side: 'long' }, SHORT] })
    assert.deepEqual(m.rows.map((r) => r.id), ['p1', 7, 'p2'])
    assert.equal(m.dropped, 5)
  })

  test('data that is not a list of positions gives an empty one rather than throwing', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { positions: 'x' }, { positions: {} }]) {
      const m = model(bad)
      assert.deepEqual([m.rows, m.mtm], [[], null], String(bad))
    }
  })

  test('the name states the count', () => {
    assert.equal(model(data()).ariaLabel, 'Positions, 3 positions')
    assert.equal(model({ positions: [LONG] }).ariaLabel, 'Positions, 1 position')
    assert.equal(model({ positions: [] }).ariaLabel, 'Positions, 0 positions')
  })

  test('the tile is named by its label alone and the caption carries the summary', () => {
    const vm = P.TsOpenPositions.viewModel(data(), 'M', ctx)
    assert.equal(vm.ariaLabel, 'Positions')
    assert.equal(vm.summary, 'Positions, 3 positions')
    assert.equal(vm.noRows, 'No open positions')
  })

  test('freshness: the live dot and the synced time', () => {
    const m = model(data({ live: true, asOf: Date.UTC(2026, 7, 5, 6, 12) }))
    assert.deepEqual([m.live, m.time], [true, '11:42'])
  })

  test('500 positions with a path take under 250 ms (a loaded machine included)', () => {
    const big = { positions: Array.from({ length: 500 }, (_, i) => ({ ...LONG, id: `i${i}`, path: path(300) })) }
    const t0 = performance.now()
    model(big, 'L')
    assert.ok(performance.now() - t0 < 250, `${performance.now() - t0} ms`)
  })
})

describe('words', () => {
  const PSEUDO = createMessages(Object.fromEntries(Object.entries(EN).map(([key, value]) => [key, `⟦${value}⟧`])))
  const pseudo = { ...ctx, t: PSEUDO }
  const WRAP = /⟦[^⟦⟧]*⟧/g

  test('every word in the model comes from the messages, in the pseudo-locale', () => {
    const rich = { positions: [{ ...LONG, path: path(5) }, SHORT, { ...LONG, id: 'z', entryPrice: undefined }] }
    for (const variant of ['Wide', 'M', 'L']) {
      const m = P.positionsModel(rich, variant, pseudo)
      const strings = [m.ariaLabel, ...m.rows.flatMap((r) => [r.bar && r.bar.label, r.spark && r.spark.label, r.sideText, r.title])].filter(Boolean)
      assert.ok(strings.length >= 4)
      for (const s of strings) {
        const left = s.replace(WRAP, ' ').split('ETA 24500 CE').join(' ').split('Positions').join(' ').split('Breakout').join(' ').split('Account A').join(' ').split('IOTA 24400 PE').join(' ')
        assert.doesNotMatch(left, /\p{L}/u, `${variant}: ${s}`)
        assert.match(s, /⟦/)
      }
    }
  })

  test('the keys exist', () => {
    for (const key of ['positions.aria', 'positions.region', 'positions.col.instrument', 'positions.col.trend', 'positions.col.last', 'positions.col.pnl', 'positions.col.actions', 'positions.mtm', 'positions.margin',
      'positions.long', 'positions.short', 'positions.qtyAt', 'positions.join', 'positions.range', 'positions.rangeEntry', 'positions.rangeNow', 'positions.trend', 'positions.exit', 'positions.exitLabel',
      'positions.exitAll', 'widget.openPositions.empty']) {
      assert.ok(key in EN, key)
    }
  })
})

// ── The element ───────────────────────────────────────────────────────────

function build({ actions = [], variant = 'M' } = {}) {
  const doc = new MiniDoc()
  const el = new P.TsOpenPositions()
  const node = keyedNodes(doc, (k) => (k === 'table' ? 'table' : k === 'exitAll' ? 'button' : 'div'))
  el.$ = node
  el.ownerDocument = doc
  el.actions = actions
  el.requestRender = () => {}
  const events = []
  el.addEventListener('ts-action', (e) => events.push(e.detail))
  const view = (d, v = variant) => el.update(P.TsOpenPositions.viewModel(d, v, ctx), v)
  return { el, doc, view, events, section: el._section, table: node('[data-k="table"]'), node }
}

// A position's cells, by name: the row is [th, (spark), last, pnl, act].
const cells = (tb, variant = 'M') => {
  const tr = tb.children[0]
  const spark = variant === 'L'
  return { th: tr.children[0], spark: spark ? tr.children[1] : null, last: tr.children[spark ? 2 : 1], pnl: tr.children[spark ? 3 : 2], act: tr.children[spark ? 4 : 3], bar: tb.children[1] }
}
const texts = (table, variant) =>
  table.children.map((tb) => {
    const c = cells(tb, variant)
    return [c.th.children[0].textContent, c.th.children[1].children[0].textContent, c.th.children[1].children[1].textContent, c.last.textContent, c.pnl.children[0].textContent, c.pnl.children[1].textContent]
  })

describe('the element draws in place', () => {
  test('the first render makes one body for each position, with its row and its range bar', () => {
    const { view, table } = build()
    view(data())
    assert.deepEqual(texts(table), [
      ['ETA 24500 CE', 'Long', '50 @ 128.00', '133.40', '▲', '+₹270.00'],
      ['IOTA 24400 PE', 'Short', '75 @ 96.50', '99.00', '▼', '−₹187.50'],
      ['MU CRUDE', 'Long', '10 @ 6,400.00', '6,390.50', '▼', '−₹95.00'],
    ])
    assert.ok(table.children.every((tb) => tb.getAttribute('part') === 'row' && tb.children.length === 2))
    const [a, , c] = table.children
    const bar = (tb) => tb.children[1].firstChild.firstChild
    assert.equal(bar(a).getAttribute('role'), 'img')
    assert.equal(bar(a).getAttribute('aria-label'), 'Between stop 120.00 and target 140.00, entry 128.00, now 133.40')
    assert.deepEqual([bar(a).style.getPropertyValue('--e'), bar(a).style.getPropertyValue('--n')], ['40', '67'])
    assert.equal(bar(a).getAttribute('class'), 'rb range')
    assert.equal(bar(c).hasAttribute('hidden'), true, 'no stop or target, no bar')
  })

  test('the hover text carries the strategy, the account and the lots; none removes it', () => {
    const { view, table } = build()
    view(data())
    assert.equal(cells(table.children[0]).th.getAttribute('title'), 'Breakout · Account A · 2 lots')
    assert.equal(cells(table.children[2]).th.hasAttribute('title'), false)
    view({ positions: [{ ...LONG, strategy: undefined, account: undefined, lots: undefined }] })
    assert.equal(cells(table.children[0]).th.hasAttribute('title'), false)
  })

  test('a price tick writes the price, the profit, the bar\'s words and the bar\'s mark, and nothing in the rows around it', () => {
    const { view, doc } = build()
    view(data())
    doc.take()
    view(data({ positions: [{ ...LONG, ltp: 134, pnl: 300 }, SHORT, BARE] }))
    // The summary line moves too (its figure and its colour); the rows are what is counted.
    const log = doc.take().filter((l) => !/^(text div|attr div|attr n md)/.test(l))
    assert.deepEqual(log.filter((l) => l.startsWith('text')), ['text last n "134.00"', 'text span "+₹300.00"'])
    assert.equal(log.length, 4, log.join('\n'))
    assert.ok(log.some((l) => l.startsWith('attr rb range aria-label=')))
    assert.ok(log.some((l) => l.startsWith('style rb range --n=70')))
  })

  test('the summary writes only the figure that moved', () => {
    const { view, doc } = build()
    view(data())
    doc.take()
    view(data({ positions: [{ ...LONG, pnl: 300 }, SHORT, BARE] }))
    assert.ok(doc.take().some((l) => l === 'text div "+₹17.50"'))
  })

  test('an update that changes nothing writes nothing', () => {
    const { view, doc } = build()
    view(data({ live: true, asOf: 0 }))
    doc.take()
    view(data({ positions: [{ ...LONG }, { ...SHORT }, { ...BARE }], live: true, asOf: 0 }))
    assert.deepEqual(doc.take(), [])
  })

  test('a flip of the profit\'s sign rewrites its arrow, text and colour, and nothing else in the row', () => {
    const { view, doc } = build()
    view({ positions: [{ ...LONG, stop: undefined }] })
    doc.take()
    view({ positions: [{ ...LONG, stop: undefined, pnl: -50 }] })
    const log = doc.take().filter((l) => !/^(text div|attr div|attr n md)/.test(l))
    assert.deepEqual(log, ['attr pnl n pos class=pnl n neg', 'text ar "▼"', 'text span "−₹50.00"'])
  })

  test('a new position is added and the others are not touched; a closed one is removed alone', () => {
    const { view, doc, table } = build()
    view(data())
    const before = [...table.children]
    doc.take()
    view(data({ positions: [...data().positions, { ...BARE, id: 'p4', instrument: 'NEW' }] }))
    assert.deepEqual(table.children.slice(0, 3), before)
    const log = doc.take()
    assert.equal(log.filter((l) => l.startsWith('remove')).length, 0)
    assert.equal(table.children.length, 4)
    view({ positions: [LONG, BARE] })
    assert.deepEqual(table.children.map((tb) => tb.children[0].children[0].children[0].textContent), ['ETA 24500 CE', 'MU CRUDE'])
    assert.equal(table.children[0], before[0])
  })

  test('Wide has no bar row; its bar and its words are the larger sizes\'', () => {
    const { view, table } = build({ variant: 'Wide' })
    view(data(), 'Wide')
    assert.ok(table.children.every((tb) => tb.children.length === 1))
  })

  test('L adds a price path column with its own text alternative, and the margin to the summary', () => {
    const { view, node, table } = build({ variant: 'L' })
    view(data({ positions: [{ ...LONG, path: path(5) }, SHORT], margin: 184500.5 }), 'L')
    const [a, b] = table.children
    assert.equal(cells(a, 'L').spark.firstChild.getAttribute('aria-label'), 'ETA 24500 CE, price since entry, from 100.00 to 104.00')
    assert.equal(cells(b, 'L').spark.firstChild.hasAttribute('hidden'), true)
    assert.equal(node('[data-k="margin"]').textContent, '₹1,84,500.50')
    assert.equal(node('[data-k="marginBox"]').hasAttribute('hidden'), false)
    assert.deepEqual(texts(table, 'L').map((r) => r[0]), ['ETA 24500 CE', 'IOTA 24400 PE'])
    assert.equal(node('[data-k="h1"]').textContent, 'Price since entry')
  })

  test('the summary shows the MTM with its arrow and tone, and hides with no figure', () => {
    const { view, node } = build()
    view(data())
    assert.equal(node('[data-k="sum"]').hasAttribute('hidden'), false)
    assert.equal(node('[data-k="mtmLabel"]').textContent, 'MTM')
    assert.deepEqual([node('[data-k="mtmAr"]').textContent, node('[data-k="mtm"]').textContent], ['▼', '−₹12.50'])
    assert.equal(node('[data-k="mtmBox"]').getAttribute('class'), 'n md neg')
    view({ positions: [] })
    assert.equal(node('[data-k="sum"]').hasAttribute('hidden'), true)
  })

  test('the caption, the scroller\'s name, the column names and the empty line are written', () => {
    const { view, node } = build()
    view(data())
    assert.equal(node('[data-k="caption"]').textContent, 'Positions, 3 positions')
    assert.equal(node('[data-k="scroll"]').getAttribute('aria-label'), 'Positions, positions')
    assert.deepEqual(['h0', 'h2', 'h3', 'h4'].map((k) => node(`[data-k="${k}"]`).textContent), ['Instrument', 'Last price', 'P&L', 'Actions'])
    view({ positions: [] })
    assert.equal(node('[data-k="none"]').textContent, 'No open positions')
    assert.equal(node('[data-k="none"]').hasAttribute('hidden'), false)
  })
})

describe('exit-position and exit-all', () => {
  const click = (b, target) => b.section.dispatch('click', { target, preventDefault() {}, stopPropagation() {} })

  test('neither button exists until actions lists it', () => {
    const b = build()
    b.view(data())
    for (const tb of b.table.children) {
      assert.equal(tb.children[0].lastChild.firstChild, null)
      assert.equal(tb.children[0].lastChild.hasAttribute('hidden'), true)
    }
    assert.equal(b.node('[data-k="h4c"]').hasAttribute('hidden'), true)
    assert.equal(b.node('[data-k="exitAll"]').hasAttribute('hidden'), true)
  })

  test('exit-position gives each row a button named for it, and the actions column its header', () => {
    const b = build({ actions: ['exit-position'] })
    b.view(data())
    const names = b.table.children.map((tb) => {
      const btn = tb.children[0].lastChild.firstChild
      assert.equal(btn.localName, 'button')
      assert.equal(btn.getAttribute('type'), 'button')
      assert.equal(btn.textContent, 'Exit')
      return btn.getAttribute('aria-label')
    })
    assert.deepEqual(names, ['Exit ETA 24500 CE', 'Exit IOTA 24400 PE', 'Exit MU CRUDE'])
    assert.equal(b.node('[data-k="h4c"]').hasAttribute('hidden'), false)
    // The bar's cell spans the actions column too.
    assert.equal(b.table.children[0].children[1].firstChild.getAttribute('colspan'), '4')
  })

  test('pressing a row\'s button fires exit-position with the id as given, number or string', () => {
    const b = build({ actions: ['exit-position'] })
    b.view({ positions: [{ ...LONG, id: 7 }, { ...SHORT, id: 'x' }] })
    for (const tb of b.table.children) {
      const btn = tb.children[0].lastChild.firstChild
      btn.setAttribute('class', 'btn exit')
      click(b, btn)
    }
    assert.deepEqual(b.events, [{ action: 'exit-position', id: 7 }, { action: 'exit-position', id: 'x' }])
  })

  test('a button follows its row when the rows are reordered', () => {
    const b = build({ actions: ['exit-position'] })
    b.view(data())
    b.view({ positions: [SHORT, LONG, BARE] })
    const btn = b.table.children[0].children[0].lastChild.firstChild
    btn.setAttribute('class', 'btn exit')
    click(b, btn)
    assert.deepEqual(b.events, [{ action: 'exit-position', id: 'p2' }])
  })

  test('turning exit-position off removes the buttons and hides the column', () => {
    const b = build({ actions: ['exit-position'] })
    b.view(data())
    b.el.actions = []
    b.view(data())
    for (const tb of b.table.children) assert.equal(tb.children[0].lastChild.firstChild, null)
    assert.equal(b.node('[data-k="h4c"]').hasAttribute('hidden'), true)
  })

  test('exit-all shows with the actions and a position, and fires exit-all with no detail', () => {
    const b = build({ actions: ['exit-all'] })
    b.view(data())
    const all = b.node('[data-k="exitAll"]')
    all.setAttribute('class', 'btn exitall')
    assert.equal(all.hasAttribute('hidden'), false)
    assert.equal(all.textContent, 'Exit all')
    click(b, all)
    assert.deepEqual(b.events, [{ action: 'exit-all' }])
    // With nothing to exit the button goes, and the summary with it when there is no figure either.
    b.view({ positions: [] })
    assert.equal(all.hasAttribute('hidden'), true)
    assert.equal(b.node('[data-k="sum"]').hasAttribute('hidden'), true)
    // The row buttons are a separate opt-in.
    assert.equal(b.table.children.length, 0)
  })

  test('exit-all alone fires nothing from a row, and neither fires without its opt-in', () => {
    const b = build({ actions: ['exit-position', 'exit-all'] })
    b.view(data())
    const btn = b.table.children[0].children[0].lastChild.firstChild
    btn.setAttribute('class', 'btn exit')
    const all = b.node('[data-k="exitAll"]')
    all.setAttribute('class', 'btn exitall')
    b.el.actions = []
    click(b, btn)
    click(b, all)
    assert.deepEqual(b.events, [])
    b.el.actions = ['exit-all']
    click(b, btn)
    assert.deepEqual(b.events, [])
  })

  test('nothing fires while the grid is editing, and a click elsewhere does nothing', () => {
    const b = build({ actions: ['exit-position', 'exit-all'] })
    b.el._isEditing = () => true
    b.view(data())
    const btn = b.table.children[0].children[0].lastChild.firstChild
    btn.setAttribute('class', 'btn exit')
    const all = b.node('[data-k="exitAll"]')
    all.setAttribute('class', 'btn exitall')
    click(b, btn)
    click(b, all)
    b.el._isEditing = () => false
    click(b, b.table.children[0].children[0].children[0])
    click(b, undefined)
    assert.deepEqual(b.events, [])
  })

  test('a press only asks: nothing here closes a position or removes a row', () => {
    // Actions are requests (RFC 0001 §8.3): the host closes the position and sends new data.
    const b = build({ actions: ['exit-position'] })
    b.view(data())
    const btn = b.table.children[0].children[0].lastChild.firstChild
    btn.setAttribute('class', 'btn exit')
    click(b, btn)
    assert.equal(b.table.children.length, 3)
  })
})
