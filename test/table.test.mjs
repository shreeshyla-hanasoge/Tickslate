import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createFormatter, createMessages, EN, WIDGETS } from '../src/core/index.js'
import { checkShape } from '../src/elements/dev.js'
import { FakeElement, FakeDocument } from './fake-dom.mjs'
import { MiniDoc, MiniNode } from './mini-dom.mjs'

// <ts-table> (RFC 0003 §16): the pure model, and the element's writes against
// a small tree DOM.

const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const ctx = { fmt, t: createMessages(), now: 0, label: 'Strategies' }

let T // table.js, loaded against the fake HTMLElement
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  T = await import('../src/elements/table.js')
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})

const model = (data, o) => T.tableModel(data, 'M', ctx, o)

const COLUMNS = [
  { key: 'name', label: 'Strategy' },
  { key: 'qty', label: 'Qty', format: 'number' },
  { key: 'price', label: 'Price', format: 'money' },
  { key: 'pnl', label: 'P&L', format: 'money', tone: 'sign' },
  { key: 'ret', label: 'Return', format: 'percent', decimals: 1, tone: 'sign' },
]
const ROWS = [
  { id: 'a', name: 'Breakout', qty: 50, price: 2450.5, pnl: 12400.25, ret: 0.0421 },
  { id: 'b', name: 'Mean reversion', qty: 120, price: 118, pnl: -3100, ret: -0.0173 },
  { id: 'c', name: 'Carry', qty: 8, price: 99999.5, pnl: 0, ret: 0 },
]
const data = (extra) => ({ columns: COLUMNS, rows: ROWS, ...extra })

describe('without a DOM', () => {
  test('the class module loads and declares its contract', () => {
    assert.equal(typeof T.TsTable, 'function')
    assert.equal(T.TsTable.catalogKey, 'table')
    assert.equal(T.TsTable.emptyText, EN['widget.table.empty'])
    assert.equal(T.TsTable.emptyText, 'No rows yet')
    assert.deepEqual(T.TsTable.tableModel(data(), 'M', ctx), model(data()))
  })

  test('the catalog entry is the RFC\'s, with a description and a category', () => {
    const { tag, label, sizes, description, category } = WIDGETS.table
    assert.deepEqual({ tag, label, sizes }, { tag: 'ts-table', label: 'Table', sizes: ['Tall', 'M', 'L', 'XL'] })
    assert.ok(description.length > 0 && category === 'General')
  })

  test('the template is one table with a sticky-header scroller, a caption, and no words', () => {
    for (const v of ['Tall', 'M', 'L', 'XL']) {
      const html = T.TsTable.template(v)
      assert.equal(html, T.TsTable.template('M'))
      assert.match(html, /<table part="table"/)
      assert.match(html, /<caption class="visually-hidden" data-k="caption"><\/caption>/)
      assert.match(html, /<thead><tr data-k="head"><\/tr><\/thead>/)
      assert.match(html, /<tbody data-k="body"><\/tbody>/)
      assert.match(html, /data-k="scroll" role="group" tabindex="0"/)
      assert.doesNotMatch(html, />[^<]*\p{L}[^<]*</u)
      assert.match(T.TsTable.skeleton(v), /class="sk /)
    }
  })

  test('the CSS uses tokens and logical properties only, and the header is sticky', () => {
    const css = T.TsTable.styles
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(css, /\b(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/)
    assert.doesNotMatch(css, /text-align:\s*(left|right)/)
    assert.match(css, /th \{[^}]*position: sticky; inset-block-start: 0/)
    assert.match(css, /min-inline-size: 56px/)
    assert.match(css, /\.rowbtn:focus-visible \{ outline: 2px solid var\(--ts-focus/)
  })

  test('dataShape asks for the columns and the rows, and lists the rest as optional', () => {
    const { columns, rows, ...rest } = T.TsTable.dataShape
    assert.equal(columns, 'array')
    assert.equal(rows, 'array')
    assert.deepEqual(Object.keys(rest).sort(), ['asOf', 'live', 'sort'])
    assert.ok(Object.values(rest).every((f) => f.optional === true))
    assert.equal(checkShape(data(), T.TsTable.dataShape), null)
    assert.ok(checkShape({ columns: COLUMNS }, T.TsTable.dataShape))
  })

  test('nothing writes markup from data', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(new URL('../src/elements/table.js', import.meta.url), 'utf8')
    assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/)
  })
})

describe('cells', () => {
  test('are formatted by the column, in the formatter\'s locale and currency', () => {
    const m = model(data())
    const [a, b, c] = m.rows
    assert.deepEqual(a.cells.map((x) => x.text), ['Breakout', '50', '₹2,450.50', '+₹12,400.25', '+4.2%'])
    assert.deepEqual(b.cells.map((x) => x.text), ['Mean reversion', '120', '₹118.00', '−₹3,100.00', '−1.7%'])
    // Money in en-IN groups by lakh and crore.
    assert.equal(c.cells[2].text, '₹99,999.50')
    assert.equal(model({ columns: [{ key: 'v', label: 'V', format: 'money', decimals: 0 }], rows: [{ id: 1, v: 12345678 }] }).rows[0].cells[0].text, '₹1,23,45,678')
  })

  test('a plain money or percent column shows no plus, only a true minus', () => {
    const m = model({ columns: [{ key: 'v', label: 'V', format: 'money' }, { key: 'p', label: 'P', format: 'percent' }, { key: 'n', label: 'N', format: 'number' }], rows: [{ id: 1, v: 5, p: 0.1, n: 4 }, { id: 2, v: -5, p: -0.1, n: -4 }] })
    assert.deepEqual(m.rows[0].cells.map((x) => x.text), ['₹5.00', '10.00%', '4'])
    assert.deepEqual(m.rows[1].cells.map((x) => x.text), ['−₹5.00', '−10.00%', '−4'])
    assert.ok(m.rows.every((r) => r.cells.every((c) => c.tone === 'mut' && c.arrow === '')))
  })

  test('a tone: sign column carries + or −, pos or neg, and an arrow; zero carries none', () => {
    const [a, b, c] = model(data()).rows
    assert.deepEqual([a.cells[3], a.cells[4]].map((x) => [x.tone, x.arrow]), [['pos', '▲'], ['pos', '▲']])
    assert.deepEqual([b.cells[3], b.cells[4]].map((x) => [x.tone, x.arrow]), [['neg', '▼'], ['neg', '▼']])
    assert.deepEqual([c.cells[3], c.cells[4]].map((x) => [x.tone, x.arrow, x.text]), [['mut', '', '₹0.00'], ['mut', '', '0.0%']])
  })

  test('a signed number column adds the plus a plain one leaves out', () => {
    const m = model({ columns: [{ key: 'd', label: 'Delta', format: 'number', tone: 'sign' }], rows: [{ id: 1, d: 4 }, { id: 2, d: -4 }] })
    assert.deepEqual(m.rows.map((r) => r.cells[0].text), ['+4', '−4'])
  })

  test('a value that rounds to zero has no sign and no arrow', () => {
    const m = model({ columns: [{ key: 'v', label: 'V', format: 'money', tone: 'sign', decimals: 0 }], rows: [{ id: 1, v: 0.2 }, { id: 2, v: -0.2 }] })
    assert.deepEqual(m.rows.map((r) => [r.cells[0].text, r.cells[0].arrow, r.cells[0].tone]), [['₹0', '', 'mut'], ['₹0', '', 'mut']])
  })

  test('text is shown as given; missing is blank; an unreadable number is a dash', () => {
    const m = model({ columns: [{ key: 't', label: 'T' }, { key: 'n', label: 'N', format: 'number' }], rows: [{ id: 1, t: 'x', n: 'oops' }, { id: 2, n: null }, { id: 3, t: 0, n: '' }, { id: 4, t: { a: 1 }, n: '1,5' }] })
    assert.deepEqual(m.rows.map((r) => r.cells.map((c) => c.text)), [['x', '—'], ['', ''], ['0', ''], ['', '—']])
  })

  test('numbers may be decimal strings, and durations, times and dates are formatted', () => {
    const m = model({
      columns: [{ key: 'n', label: 'N', format: 'number', decimals: 2 }, { key: 'd', label: 'D', format: 'duration' }, { key: 't', label: 'T', format: 'time' }, { key: 'day', label: 'Day', format: 'date' }],
      rows: [{ id: 1, n: '1234.5', d: 125000, t: Date.UTC(2026, 9, 12, 4, 0), day: '2026-10-12' }],
    })
    assert.deepEqual(m.rows[0].cells.map((c) => c.text), ['1,234.50', '2:05', '09:30', '12 Oct 2026'])
  })

  test('align defaults to the end for numbers and the start for the rest, and a column may say', () => {
    const cols = model({ columns: [...COLUMNS, { key: 'x', label: 'X', align: 'center' }, { key: 'y', label: 'Y', format: 'date', align: 'bogus' }, { key: 'z', label: 'Z', format: 'duration' }], rows: [] }).columns
    assert.deepEqual(cols.map((c) => c.align), ['start', 'end', 'end', 'end', 'end', 'center', 'start', 'end'])
    assert.deepEqual(cols.map((c) => c.numeric), [false, true, true, true, true, false, false, true])
  })

  test('columns with no key, or a key already used, are left out; a missing label is the key', () => {
    const m = model({ columns: [{ key: 'a', label: 'A' }, { label: 'none' }, null, { key: 'a', label: 'again' }, { key: 'b' }], rows: [] })
    assert.deepEqual(m.columns.map((c) => [c.key, c.label]), [['a', 'A'], ['b', 'b']])
  })
})

describe('rows', () => {
  test('a row with no id, a repeated id or no object is dropped and counted', () => {
    const m = model({ columns: COLUMNS, rows: [{ id: 'a' }, { name: 'no id' }, null, 'text', { id: 'a', name: 'twice' }, { id: NaN }, { id: '' }, { id: 0 }] })
    assert.deepEqual(m.rows.map((r) => r.id), ['a', 0])
    assert.equal(m.dropped, 6)
  })

  test('data that is not a table gives an empty one rather than throwing', () => {
    for (const bad of [{}, { columns: 3, rows: 'x' }, null, undefined, 'x']) {
      const m = model(bad)
      assert.deepEqual([m.columns, m.rows, m.dropped, m.hidden], [[], [], 0, 0])
    }
  })

  test('one entry per readable row, one cell per kept column', () => {
    const m = model(data())
    assert.equal(m.rows.length, 3)
    assert.ok(m.rows.every((r) => r.cells.length === m.columns.length))
  })
})

describe('sorting', () => {
  const by = (key, dir, rows = ROWS, columns = COLUMNS) => model({ columns, rows, sort: { key, dir } })
  const ids = (m) => m.rows.map((r) => r.id)

  test('numbers sort numerically, not as text', () => {
    assert.deepEqual(ids(by('qty', 'asc')), ['c', 'a', 'b'])
    assert.deepEqual(ids(by('qty', 'desc')), ['b', 'a', 'c'])
    assert.deepEqual(ids(by('price', 'asc')), ['b', 'a', 'c'])
  })

  test('text sorts with the locale\'s collator, digits by value', () => {
    const rows = ['Order 10', 'order 9', 'Zed', 'äpple', 'Apple'].map((name, i) => ({ id: i, name }))
    assert.deepEqual(by('name', 'asc', rows).rows.map((r) => r.cells[0].text), ['Apple', 'äpple', 'order 9', 'Order 10', 'Zed'])
  })

  test('missing and unreadable values go last, whichever way it sorts', () => {
    const rows = [{ id: 1, qty: 5 }, { id: 2 }, { id: 3, qty: 1 }, { id: 4, qty: 'n/a' }, { id: 5, qty: null }]
    assert.deepEqual(ids(by('qty', 'asc', rows)), [3, 1, 2, 4, 5])
    assert.deepEqual(ids(by('qty', 'desc', rows)), [1, 3, 2, 4, 5])
  })

  test('is stable: equal rows keep the order they came in, both ways', () => {
    const rows = [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }, { id: 'c', qty: 1 }, { id: 'd', qty: 2 }, { id: 'e', qty: 1 }]
    assert.deepEqual(ids(by('qty', 'asc', rows)), ['a', 'c', 'e', 'b', 'd'])
    assert.deepEqual(ids(by('qty', 'desc', rows)), ['b', 'd', 'a', 'c', 'e'])
  })

  test('times and dates sort by the instant', () => {
    const columns = [{ key: 'day', label: 'Day', format: 'date' }]
    const rows = [{ id: 1, day: '2026-10-12' }, { id: 2, day: '2025-01-03' }, { id: 3, day: '2026-02-20' }]
    assert.deepEqual(ids(by('day', 'asc', rows, columns)), [2, 3, 1])
  })

  test('without a sort the order is the data\'s, and an unknown or unsortable column is ignored', () => {
    assert.deepEqual(ids(model(data())), ['a', 'b', 'c'])
    assert.deepEqual(ids(by('nope', 'asc')), ['a', 'b', 'c'])
    assert.equal(by('nope', 'asc').sort, null)
    const locked = [{ ...COLUMNS[1], sortable: false }, ...COLUMNS.slice(2)]
    assert.deepEqual(ids(by('qty', 'asc', ROWS, locked)), ['a', 'b', 'c'])
    assert.equal(by('qty', 'asc', ROWS, locked).sort, null)
  })

  test('the header says which column is sorted, and sortable defaults to true', () => {
    const m = by('price', 'desc')
    assert.deepEqual(m.columns.map((c) => c.sort), ['none', 'none', 'descending', 'none', 'none'])
    assert.deepEqual(by('price', 'asc').columns.map((c) => c.sort)[2], 'ascending')
    assert.ok(m.columns.every((c) => c.sortable))
    assert.deepEqual(m.sort, { key: 'price', dir: 'desc' })
    assert.equal(model({ columns: [{ key: 'a', label: 'A', sortable: false }], rows: [] }).columns[0].sortable, false)
  })

  test('an unrecognised dir sorts ascending', () => {
    assert.deepEqual(ids(by('qty', 'sideways')), ['c', 'a', 'b'])
  })

  test('500 rows sort in under 16 ms', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: `o${i}`, name: `Order ${(i * 7919) % 500}`, qty: (i * 7919) % 997, price: ((i * 104729) % 100000) / 7, pnl: ((i * 31) % 2001) - 1000, ret: ((i * 17) % 200) / 1000 - 0.1 }))
    const run = (key) => {
      const start = performance.now()
      const m = model({ columns: COLUMNS, rows, sort: { key, dir: 'desc' } })
      const ms = performance.now() - start
      assert.equal(m.rows.length, 500)
      return ms
    }
    // The first runs warm the formatter's caches, as a live table's first render does.
    for (const key of ['name', 'qty', 'price', 'pnl']) run(key)
    for (const key of ['name', 'qty', 'price', 'pnl', 'ret']) {
      const best = Math.min(run(key), run(key), run(key))
      assert.ok(best < 16, `sorting 500 rows by ${key} took ${best.toFixed(1)} ms`)
    }
  })
})

describe('the column budget', () => {
  const wide = Array.from({ length: 8 }, (_, i) => ({ key: `c${i}`, label: `C${i}` }))
  const keys = (m) => m.columns.map((c) => c.key)

  test('without a width every column is kept', () => {
    for (const o of [undefined, {}, { width: 0 }, { width: NaN }, { width: -1 }]) {
      const m = model({ columns: wide, rows: [] }, o)
      assert.equal(m.columns.length, 8)
      assert.equal(m.hidden, 0)
    }
  })

  test('keeps width / 56 columns, dropping the last positions first', () => {
    assert.deepEqual(keys(model({ columns: wide, rows: [] }, { width: 224 })), ['c0', 'c1', 'c2', 'c3'])
    assert.deepEqual(keys(model({ columns: wide, rows: [] }, { width: 223 })), ['c0', 'c1', 'c2'])
    assert.equal(model({ columns: wide, rows: [] }, { width: 223 }).hidden, 5)
    assert.equal(model({ columns: wide, rows: [] }, { width: 448 }).hidden, 0)
  })

  test('none is narrower than 56px: a width under one column keeps one', () => {
    assert.deepEqual(keys(model({ columns: wide, rows: [] }, { width: 30 })), ['c0'])
    assert.deepEqual(keys(model({ columns: wide, rows: [] }, { width: 111 })), ['c0'])
    assert.deepEqual(keys(model({ columns: wide, rows: [] }, { width: 112 })), ['c0', 'c1'])
  })

  test('priority decides: the highest number goes first, and the rest stay in data order', () => {
    const columns = [{ key: 'a', label: 'A', priority: 5 }, { key: 'b', label: 'B', priority: 1 }, { key: 'c', label: 'C', priority: 9 }, { key: 'd', label: 'D', priority: 2 }]
    assert.deepEqual(keys(model({ columns, rows: [] }, { width: 170 })), ['a', 'b', 'd'])
    assert.deepEqual(keys(model({ columns, rows: [] }, { width: 112 })), ['b', 'd'])
  })

  test('equal priorities drop the later column, and a column with none defaults to its position', () => {
    const columns = [{ key: 'a', label: 'A', priority: 1 }, { key: 'b', label: 'B', priority: 1 }, { key: 'c', label: 'C' }, { key: 'd', label: 'D', priority: 0 }]
    // c has priority 2 (its position), so it goes first, then b over a.
    assert.deepEqual(keys(model({ columns, rows: [] }, { width: 168 })), ['a', 'b', 'd'])
    assert.deepEqual(keys(model({ columns, rows: [] }, { width: 112 })), ['a', 'd'])
  })

  test('a hidden column still sorts, and the rows have a cell for each kept column only', () => {
    const rows = [{ id: 1, c0: 'x', c7: 2 }, { id: 2, c0: 'y', c7: 1 }]
    const m = model({ columns: wide, rows, sort: { key: 'c7', dir: 'asc' } }, { width: 112 })
    assert.deepEqual(m.rows.map((r) => r.id), [2, 1])
    assert.ok(m.rows.every((r) => r.cells.length === 2))
  })
})

describe('the accessible name', () => {
  test('states the label, the rows, the sort and the hidden columns', () => {
    assert.equal(model(data()).ariaLabel, 'Strategies, 3 rows')
    assert.equal(model({ columns: COLUMNS, rows: [ROWS[0]] }).ariaLabel, 'Strategies, 1 row')
    assert.equal(model(data({ sort: { key: 'price', dir: 'desc' } })).ariaLabel, 'Strategies, 3 rows, sorted by Price, descending')
    assert.equal(model(data({ sort: { key: 'qty', dir: 'asc' } })).ariaLabel, 'Strategies, 3 rows, sorted by Qty, ascending')
    assert.equal(model(data(), { width: 112 }).ariaLabel, 'Strategies, 3 rows, 3 columns hidden')
    assert.equal(model(data({ sort: { key: 'qty', dir: 'asc' } }), { width: 224 }).ariaLabel, 'Strategies, 3 rows, sorted by Qty, ascending, 1 column hidden')
  })

  test('the tile is named by its label alone, and the caption carries the summary', () => {
    const vm = T.TsTable.viewModel(data({ sort: { key: 'qty', dir: 'asc' } }), 'M', { ...ctx, width: 0, sort: null })
    assert.equal(vm.ariaLabel, 'Strategies')
    assert.equal(vm.summary, 'Strategies, 3 rows, sorted by Qty, ascending')
  })

  test('words come from the messages', () => {
    const t = createMessages({ 'table.rows.other': '{count} Zeilen', 'table.aria': '{rows} · {label}' })
    assert.equal(T.tableModel(data(), 'M', { ...ctx, t }).ariaLabel, '3 Zeilen · Strategies')
  })
})

// ── The element ─────────────────────────────────────────────────────────────

function build({ doc = new MiniDoc(), actions = [] } = {}) {
  const el = new T.TsTable()
  const nodes = new Map()
  const node = (k) => {
    if (!nodes.has(k)) {
      const n = new MiniNode(doc, k === 'body' ? 'tbody' : k === 'head' ? 'tr' : 'div')
      n.clientWidth = 0
      nodes.set(k, n)
    }
    return nodes.get(k)
  }
  el.$ = (sel) => node(/data-k="(\w+)"/.exec(sel)[1])
  el.ownerDocument = doc
  el.actions = actions
  let renders = 0
  el.requestRender = () => renders++
  const events = []
  el.addEventListener('ts-action', (e) => events.push(e.detail))
  const section = el._section
  const view = (d, width = 0, sort = null) => el.update(T.TsTable.viewModel(d, 'M', { ...ctx, width, sort }))
  return { el, doc, node, view, events, section, renders: () => renders, body: node('body'), head: node('head') }
}

const cellsOf = (body) => body.children.map((tr) => tr.children.map((td) => td.children[td.children.length - 1].textContent))
const headLabels = (head) => head.children.map((th) => th.firstChild.firstChild ? th.firstChild.firstChild.textContent : th.firstChild.textContent)

describe('the element draws in place', () => {
  test('the first render makes the header cells and the rows', () => {
    const { view, body, head } = build()
    view(data())
    assert.deepEqual(headLabels(head), ['Strategy', 'Qty', 'Price', 'P&L', 'Return'])
    assert.deepEqual(cellsOf(body), [
      ['Breakout', '50', '₹2,450.50', '+₹12,400.25', '+4.2%'],
      ['Mean reversion', '120', '₹118.00', '−₹3,100.00', '−1.7%'],
      ['Carry', '8', '₹99,999.50', '₹0.00', '0.0%'],
    ])
    assert.ok(body.children.every((tr) => tr.getAttribute('part') === 'row'))
    assert.ok(head.children.every((th) => th.getAttribute('scope') === 'col'))
  })

  test('changing one cell is one write', () => {
    const { view, doc } = build()
    view(data())
    doc.take()
    const rows = ROWS.map((r) => (r.id === 'b' ? { ...r, qty: 121 } : r))
    view(data({ rows }))
    assert.deepEqual(doc.take(), ['text span "121"'])
  })

  test('an update that changes nothing writes nothing', () => {
    const { view, doc } = build()
    view(data({ sort: { key: 'qty', dir: 'asc' }, asOf: 0, live: true }))
    doc.take()
    view(data({ rows: ROWS.map((r) => ({ ...r })), sort: { key: 'qty', dir: 'asc' }, asOf: 0, live: true }))
    assert.deepEqual(doc.take(), [])
  })

  test('a flip of a figure\'s sign rewrites its text, arrow and colour, and nothing else', () => {
    const { view, doc } = build()
    view(data())
    doc.take()
    view(data({ rows: ROWS.map((r) => (r.id === 'a' ? { ...r, pnl: -50 } : r)) }))
    assert.deepEqual(doc.take(), ['attr end n pos class=end n neg', 'text ar "▼"', 'text span "−₹50.00"'])
  })

  test('a new row is added at the end and the others are not touched', () => {
    const { view, doc, body } = build()
    view(data())
    const [first, second, third] = body.children
    doc.take()
    view(data({ rows: [...ROWS, { id: 'd', name: 'Pairs', qty: 3, price: 10, pnl: 1, ret: 0.001 }] }))
    assert.deepEqual(body.children.slice(0, 3), [first, second, third])
    const log = doc.take()
    assert.equal(log.filter((l) => l.startsWith('remove')).length, 0)
    // Only the new row's own text: five values and the two arrows of its signed cells.
    assert.equal(log.filter((l) => /^text (span|ar) /.test(l)).length, 7)
    assert.equal(body.children.length, 4)
    assert.deepEqual(cellsOf(body)[3], ['Pairs', '3', '₹10.00', '+₹1.00', '+0.1%'])
  })

  test('a sort moves the rows that need to move and rewrites none of their cells', () => {
    const { view, doc, body } = build()
    view(data())
    const [a, b, c] = body.children
    doc.take()
    view(data({ sort: { key: 'qty', dir: 'asc' } }))
    assert.deepEqual(body.children, [c, a, b])
    assert.deepEqual(doc.take().filter((l) => /^text (span|ar) /.test(l)), [])
  })

  test('the caption, the scroller\'s name and the empty line are written', () => {
    const { view, node } = build()
    view(data({ rows: [] }))
    assert.equal(node('caption').textContent, 'Strategies, 0 rows')
    // Named apart from the tile, which the label already names.
    assert.equal(node('scroll').getAttribute('aria-label'), 'Strategies, rows')
    assert.equal(node('none').textContent, 'No rows yet')
    assert.equal(node('none').hasAttribute('hidden'), false)
    view(data())
    assert.equal(node('none').hasAttribute('hidden'), true)
  })

  test('the header marks the sorted column with aria-sort and a glyph that is hidden from assistive technology', () => {
    const { view, head } = build()
    view(data({ sort: { key: 'price', dir: 'desc' } }))
    assert.deepEqual(head.children.map((th) => th.getAttribute('aria-sort')), ['none', 'none', 'descending', 'none', 'none'])
    const glyph = head.children[2].firstChild.lastChild
    assert.equal(glyph.textContent, '↓')
    assert.equal(glyph.getAttribute('aria-hidden'), 'true')
    assert.equal(head.children[0].firstChild.localName, 'button')
    assert.equal(head.children[0].firstChild.getAttribute('type'), 'button')
  })

  test('a column that is not sortable has plain text and no button', () => {
    const { view, head } = build()
    view({ columns: [{ key: 'a', label: 'A', sortable: false }, { key: 'b', label: 'B' }], rows: [] })
    assert.equal(head.children[0].firstChild.localName, 'span')
    assert.equal(head.children[0].textContent, 'A')
    assert.equal(head.children[1].firstChild.localName, 'button')
  })

  test('columns that come and go with the width change the cells in place', () => {
    const { view, body, head } = build()
    view(data(), 0)
    const rowEls = [...body.children]
    const thEls = [...head.children]
    view(data(), 112)
    assert.deepEqual(headLabels(head), ['Strategy', 'Qty'])
    assert.deepEqual(body.children, rowEls)
    assert.deepEqual(head.children, thEls.slice(0, 2))
    assert.deepEqual(cellsOf(body)[0], ['Breakout', '50'])
    view(data(), 0)
    assert.deepEqual(cellsOf(body)[0], ['Breakout', '50', '₹2,450.50', '+₹12,400.25', '+4.2%'])
    assert.deepEqual(body.children, rowEls)
  })

  test('cells carry their alignment, figure typeface and tone as classes', () => {
    const { view, body } = build()
    view(data())
    const classes = (tr) => tr.children.map((td) => td.getAttribute('class'))
    assert.deepEqual(classes(body.children[0]), ['start t', 'end n', 'end n', 'end n pos', 'end n pos'])
    assert.deepEqual(classes(body.children[1]), ['start t', 'end n', 'end n', 'end n neg', 'end n neg'])
    assert.deepEqual(classes(body.children[2]), ['start t', 'end n', 'end n', 'end n', 'end n'])
    assert.equal(body.children[0].children[3].firstChild.getAttribute('aria-hidden'), 'true')
    assert.equal(body.children[0].children[3].firstChild.textContent, '▲')
    assert.equal(body.children[1].children[3].firstChild.textContent, '▼')
  })

  test('the width is read after a draw, and a change in how many columns fit asks for a new one', () => {
    const { view, node, renders } = build()
    node('scroll').clientWidth = 400
    view(data())
    assert.equal(renders(), 1)
    view(data())
    assert.equal(renders(), 1)
    node('scroll').clientWidth = 410
    view(data())
    assert.equal(renders(), 1)
    node('scroll').clientWidth = 170
    view(data())
    assert.equal(renders(), 2)
  })
})

describe('columns that still overflow', () => {
  test('are dropped one at a time, by priority, until the table fits', () => {
    const { el, view, node, renders } = build()
    const scroll = node('scroll')
    scroll.clientWidth = 400
    scroll.scrollWidth = 400
    view(data())
    const base = renders()
    // The figures need more than 56px each: the first draw overflows.
    scroll.scrollWidth = 480
    view(data())
    assert.equal(renders(), base + 1)
    assert.equal(el.viewContext().width, 344)
    // Drawn again with a column fewer, it fits, so nothing more is dropped.
    scroll.scrollWidth = 400
    view(data(), 344)
    assert.equal(renders(), base + 1)
    assert.equal(el._extra, 1)
  })

  test('a new width starts again from what it allows, and one column is never dropped for overflow', () => {
    const { el, view, node } = build()
    const scroll = node('scroll')
    scroll.clientWidth = 400
    scroll.scrollWidth = 600
    view(data())
    view(data())
    assert.ok(el._extra >= 1)
    scroll.clientWidth = 300
    view(data())
    assert.equal(el._extra, 0)
    assert.equal(el.viewContext().width, 300)
    // With one column left there is nothing to drop.
    view({ columns: [COLUMNS[2]], rows: ROWS }, 300)
    const extra = el._extra
    view({ columns: [COLUMNS[2]], rows: ROWS }, 300)
    assert.equal(el._extra, extra)
  })

  test('the width the budget sees never goes below one column', () => {
    const { el } = build()
    el._width = 100
    el._extra = 9
    assert.equal(el.viewContext().width, 56)
    el._width = 0
    assert.equal(el.viewContext().width, 0)
  })
})

describe('overflow is not a ratchet', () => {
  test('new data starts again from what the width allows, and drops only what it must', () => {
    const { el, view, node } = build()
    const scroll = node('scroll')
    scroll.clientWidth = 400
    scroll.scrollWidth = 400
    el._data = data()
    el.viewContext()
    view(data())
    // A spike: the figures overflow twice over.
    scroll.scrollWidth = 520
    view(data())
    scroll.scrollWidth = 460
    view(data())
    assert.equal(el._extra, 2)
    assert.equal(el.viewContext().width, 400 - 112)
    // The same data drawn again keeps what it dropped; a new tick gives the columns back.
    assert.equal(el._extra, 2)
    el._data = data({ rows: ROWS.map((r) => ({ ...r })) })
    assert.equal(el.viewContext().width, 400)
    assert.equal(el._extra, 0)
  })

  test('a different set of columns starts again too', () => {
    const { el, view, node } = build()
    const scroll = node('scroll')
    scroll.clientWidth = 400
    scroll.scrollWidth = 400
    el._data = data()
    el.viewContext()
    view(data())
    scroll.scrollWidth = 600
    view(data())
    assert.ok(el._extra > 0)
    scroll.scrollWidth = 400
    el._data = { columns: COLUMNS.slice(1, 5), rows: ROWS }
    el.viewContext()
    assert.equal(el._extra, 0)
  })
})

describe('focus, titles and tab stops', () => {
  test('a removed focused row hands focus to its neighbour\'s button, and to the scroller when none is left', () => {
    const b = build({ actions: ['select'] })
    b.node('scroll').focus = () => { b.doc.activeElement = b.node('scroll') }
    b.el._scrollEl = b.node('scroll')
    b.view(data())
    b.body.children[1].all('button')[0].focus()
    b.view(data({ rows: [ROWS[0], ROWS[2]] }))
    assert.equal(b.doc.activeElement, b.body.children[1].all('button')[0])
    assert.equal(b.body.children[1].getAttribute('part'), 'row')
    b.body.children[1].all('button')[0].focus()
    b.view(data({ rows: [] }))
    assert.equal(b.doc.activeElement, b.node('scroll'))
  })

  test('a text cell\'s title is its text, a figure has none, and an unchanged cell is not rewritten', () => {
    const { view, body, doc } = build()
    view(data())
    const tds = body.children[0].children
    assert.equal(tds[0].getAttribute('title'), 'Breakout')
    assert.deepEqual(body.children[0].children.map((td) => td.getAttribute('title')), ['Breakout', null, null, null, null])
    doc.take()
    view(data({ rows: ROWS.map((r) => ({ ...r })) }))
    assert.deepEqual(doc.take(), [])
    view(data({ rows: [{ ...ROWS[0], name: '' }, ROWS[1], ROWS[2]] }))
    assert.equal(tds[0].getAttribute('title'), null)
  })

  test('rows have one tab stop, and the arrows, Home and End move it in place', () => {
    const b = build({ actions: ['select'] })
    b.view(data())
    const stops = () => b.body.children.map((tr) => tr.all('button')[0].getAttribute('tabindex'))
    assert.deepEqual(stops(), ['0', '-1', '-1'])
    const key = (code, target) => b.section.dispatch('keydown', { key: code, target, preventDefault() {} })
    const btn = (i) => b.body.children[i].all('button')[0]
    key('ArrowDown', btn(0))
    assert.deepEqual(stops(), ['-1', '0', '-1'])
    assert.equal(b.doc.activeElement, btn(1))
    key('End', btn(1))
    assert.deepEqual(stops(), ['-1', '-1', '0'])
    key('ArrowDown', btn(2))
    assert.deepEqual(stops(), ['-1', '-1', '0'])
    key('Home', btn(2))
    key('ArrowUp', btn(0))
    assert.deepEqual(stops(), ['0', '-1', '-1'])
    // A live tick keeps the stop on the same row, rewriting nothing.
    key('ArrowDown', btn(0))
    b.doc.take()
    b.view(data({ rows: ROWS.map((r) => ({ ...r })) }))
    assert.deepEqual(stops(), ['-1', '0', '-1'])
    assert.deepEqual(b.doc.take(), [])
    // The row that held the stop going away moves it to the first.
    b.view(data({ rows: [ROWS[0], ROWS[2]] }))
    assert.deepEqual(stops(), ['0', '-1'])
  })

  test('a development warning counts the rows dropped for want of an id', () => {
    const { el } = build()
    const warned = []
    const was = console.warn
    console.warn = (m) => warned.push(m)
    try {
      el._checkDropped(model({ columns: COLUMNS, rows: [{ name: 'x' }, { id: 'a' }, null] }))
    } finally {
      console.warn = was
    }
    assert.equal(warned.length, 1)
    assert.match(warned[0], /dropped 2 rows/)
  })
})

describe('sort and select', () => {
  const click = (b, target) => b.section.dispatch('click', { target, preventDefault() {}, stopPropagation() {} })

  test('a header press fires sort: ascending, then descending, then ascending again', () => {
    const b = build()
    b.view(data())
    const press = (i) => click(b, b.head.children[i].firstChild)
    press(2)
    assert.deepEqual(b.events.splice(0), [{ action: 'sort', value: 'price', dir: 'asc' }])
    b.view(data(), 0, b.el._userSort)
    press(2)
    assert.deepEqual(b.events.splice(0), [{ action: 'sort', value: 'price', dir: 'desc' }])
    b.view(data(), 0, b.el._userSort)
    press(2)
    assert.deepEqual(b.events.splice(0), [{ action: 'sort', value: 'price', dir: 'asc' }])
    // Another column starts ascending.
    b.view(data(), 0, b.el._userSort)
    press(1)
    assert.deepEqual(b.events.splice(0), [{ action: 'sort', value: 'qty', dir: 'asc' }])
    assert.ok(b.renders() >= 4)
  })

  test('a press when the host sorted the data starts from the host\'s sort', () => {
    const b = build()
    b.view(data({ sort: { key: 'qty', dir: 'asc' } }))
    click(b, b.head.children[1].firstChild)
    assert.deepEqual(b.events, [{ action: 'sort', value: 'qty', dir: 'desc' }])
  })

  test('the user\'s sort lasts through live updates with the same data sort, and the host\'s new one replaces it', () => {
    const b = build()
    const ctx2 = () => b.el.viewContext()
    b.el._data = data({ sort: { key: 'qty', dir: 'asc' } })
    ctx2()
    b.el._userSort = { key: 'price', dir: 'desc' }
    assert.deepEqual(ctx2().sort, { key: 'price', dir: 'desc' })
    b.el._data = data({ sort: { key: 'qty', dir: 'asc' }, rows: [] })
    assert.deepEqual(ctx2().sort, { key: 'price', dir: 'desc' })
    b.el._data = data({ sort: { key: 'qty', dir: 'desc' } })
    assert.equal(ctx2().sort, null)
  })

  test('rows are not activatable until actions includes select', () => {
    const b = build()
    b.view(data())
    assert.equal(b.body.all('.rowbtn').length, 0)
    b.el.actions = ['select']
    b.view(data())
    assert.equal(b.body.all('.rowbtn').length, 3)
  })

  test('each row gets one stretched button in its first cell, named by what the cell says', () => {
    const b = build({ actions: ['select'] })
    b.view(data())
    for (const tr of b.body.children) {
      assert.equal(tr.all('.rowbtn').length, 1)
      assert.equal(tr.children[0].firstChild.localName, 'button')
      assert.equal(tr.children[0].firstChild.getAttribute('type'), 'button')
    }
    assert.deepEqual(b.body.children.map((tr) => tr.children[0].firstChild.getAttribute('aria-label')), ['Select Breakout', 'Select Mean reversion', 'Select Carry'])
    // The cell's text is still the last two children.
    assert.deepEqual(cellsOf(b.body)[0], ['Breakout', '50', '₹2,450.50', '+₹12,400.25', '+4.2%'])
  })

  test('a row with no text in its first cell is named by its id', () => {
    const b = build({ actions: ['select'] })
    b.view(data({ rows: [{ id: 'z9', qty: 1 }] }))
    assert.equal(b.body.children[0].all('.rowbtn')[0].getAttribute('aria-label'), 'Select z9')
  })

  test('activating a row fires select with its id as given, number or string', () => {
    const b = build({ actions: ['select'] })
    b.view(data({ rows: [{ id: 7, name: 'Seven' }, { id: 'x', name: 'Ex' }] }))
    click(b, b.body.children[0].all('.rowbtn')[0])
    click(b, b.body.children[1].all('.rowbtn')[0])
    assert.deepEqual(b.events, [{ action: 'select', id: 7 }, { action: 'select', id: 'x' }])
  })

  test('a select button follows its row when the rows are sorted', () => {
    const b = build({ actions: ['select'] })
    b.view(data())
    b.view(data({ sort: { key: 'qty', dir: 'asc' } }))
    click(b, b.body.children[0].all('.rowbtn')[0])
    assert.deepEqual(b.events, [{ action: 'select', id: 'c' }])
  })

  test('turning select off removes the buttons and leaves the cells', () => {
    const b = build({ actions: ['select'] })
    b.view(data())
    b.el.actions = []
    b.view(data())
    assert.equal(b.body.all('.rowbtn').length, 0)
    assert.deepEqual(cellsOf(b.body)[1], ['Mean reversion', '120', '₹118.00', '−₹3,100.00', '−1.7%'])
  })

  test('a select with no opt-in fires nothing', () => {
    const b = build({ actions: ['select'] })
    b.view(data())
    const btn = b.body.children[0].all('.rowbtn')[0]
    b.el.actions = []
    click(b, btn)
    assert.deepEqual(b.events, [])
  })

  test('nothing fires while the grid is editing', () => {
    const b = build({ actions: ['select'] })
    b.el._isEditing = () => true
    b.view(data())
    click(b, b.head.children[1].firstChild)
    click(b, b.body.children[0].all('.rowbtn')[0])
    assert.deepEqual(b.events, [])
  })

  test('a click elsewhere in the table does nothing', () => {
    const b = build({ actions: ['select'] })
    b.view(data())
    click(b, b.body.children[0].children[1])
    click(b, undefined)
    assert.deepEqual(b.events, [])
  })
})
