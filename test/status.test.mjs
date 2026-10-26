import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFormatter, createMessages, EN, WIDGETS, zonedTime } from '../src/core/index.js'
import { checkShape } from '../src/elements/dev.js'
import { FakeElement, FakeDocument } from './fake-dom.mjs'
import { MiniDoc, keyedNodes } from './list-dom.mjs'

let S // status.js, loaded against the fake HTMLElement (a static import would load widget.js before it exists)
let statusModel
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  S = await import('../src/elements/status.js')
  statusModel = S.statusModel
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})

// <ts-status> (RFC 0004 §4.2): the pure model.

const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const NOW = zonedTime('2026-08-05', '11:42', 'Asia/Kolkata')
const ctx = { fmt, t: createMessages(), now: NOW, label: 'Services' }
const model = (data, variant = 'M') => statusModel(data, variant, ctx)

const ROWS = [
  { id: 'api', name: 'Orders API', state: 'ok' },
  { id: 'feed', name: 'Price feed', state: 'degraded', detail: 'Elevated latency', since: NOW - 12 * 60000 },
  { id: 'db', name: 'Ledger', state: 'ok' },
  { id: 'mail', name: 'Email', state: 'ok' },
]

describe('statusModel', () => {
  test('every state has its words', () => {
    const m = model({ rows: ['ok', 'degraded', 'down', 'unknown'].map((state, i) => ({ id: i, name: `S${i}`, state })) })
    assert.deepEqual(m.rows.map((r) => r.stateText), ['OK', 'Degraded', 'Down', 'Unknown'])
    assert.deepEqual(m.counts, { ok: 1, degraded: 1, down: 1, unknown: 1 })
  })

  test('overall is the worst state present: down, degraded, unknown, then ok', () => {
    const of = (...states) => model({ rows: states.map((state, i) => ({ id: i, name: 'x', state })) }).overall
    assert.equal(of('ok', 'unknown', 'degraded', 'down'), 'down')
    assert.equal(of('ok', 'unknown', 'degraded'), 'degraded')
    assert.equal(of('ok', 'unknown'), 'unknown')
    assert.equal(of('ok', 'ok'), 'ok')
  })

  test('the summary and the name state the count, and the worst state when it is not OK', () => {
    const m = model({ rows: ROWS })
    assert.equal(m.summary, '3 of 4 OK')
    assert.equal(m.ariaLabel, 'Services, 3 of 4 OK, Degraded')
    assert.equal(model({ rows: [ROWS[0]] }).ariaLabel, 'Services, 1 of 1 OK')
  })

  test('rows keep the host\'s order and are never sorted', () => {
    const m = model({ rows: [ROWS[1], ROWS[0], ROWS[2]] })
    assert.deepEqual(m.rows.map((r) => r.id), ['feed', 'api', 'db'])
  })

  test('since is the age, and the M cell says "since" before it', () => {
    const [, feed] = model({ rows: ROWS }).rows
    assert.equal(feed.since, '12 min ago')
    assert.equal(feed.sinceText, 'since 12 min ago')
    assert.equal(feed.detail, 'Elevated latency')
    assert.deepEqual([model({ rows: ROWS }).rows[0].since, model({ rows: ROWS }).rows[0].detail], ['', ''])
  })

  test('a row with no id or name, a repeated id or a state that is not one of the four is dropped and counted', () => {
    const m = model({ rows: [ROWS[0], { name: 'x', state: 'ok' }, { id: 'a', state: 'ok' }, { id: 'b', name: 'b', state: 'fine' }, { ...ROWS[0] }, null, 'x'] })
    assert.deepEqual(m.rows.map((r) => r.id), ['api'])
    assert.equal(m.dropped, 6)
  })

  test('does not throw on null, [], a non-array or junk', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { rows: 'x' }, { rows: {} }, { rows: [] }]) {
      const m = model(bad)
      assert.deepEqual([m.rows, m.total, m.overallText], [[], 0, ''], String(bad))
      assert.equal(m.summary, 'No services to show')
    }
  })

  test('each row has a spoken name', () => assert.equal(model({ rows: ROWS }).rows[1].aria, 'Price feed, Degraded'))

  test('freshness: the live dot and the synced time', () => {
    const m = model({ rows: ROWS, live: true, asOf: Date.UTC(2026, 7, 5, 6, 12) })
    assert.deepEqual([m.live, m.time], [true, '11:42'])
  })
})

describe('words and the catalog', () => {
  const PSEUDO = createMessages(Object.fromEntries(Object.entries(EN).map(([key, value]) => [key, `⟦${value}⟧`])))
  const WRAP = /⟦[^⟦⟧]*⟧/g
  test('every word in the model comes from the messages, in the pseudo-locale', () => {
    const m = statusModel({ rows: ROWS }, 'M', { ...ctx, t: PSEUDO })
    const strings = [m.ariaLabel, m.summary, m.overallText, m.rows[1].stateText, m.rows[1].sinceText, m.rows[1].aria]
    for (const s of strings) {
      assert.match(s, /⟦/)
      const left = s.replace(WRAP, ' ').split('Services').join(' ').split('Price feed').join(' ').replace(/\d+ min ago/, ' ')
      assert.doesNotMatch(left, /\p{L}/u, s)
    }
  })

  test('the catalog entry is the RFC\'s, in General', () => {
    const { tag, label, sizes, category } = WIDGETS.status
    assert.deepEqual({ tag, label, sizes }, { tag: 'ts-status', label: 'Status', sizes: ['S', 'Tall', 'M'] })
    assert.equal(category, 'General')
  })
})

describe('the class and its templates', () => {
  test('declares its contract and a pure model the class re-exports', () => {
    assert.equal(S.TsStatus.catalogKey, 'status')
    assert.equal(S.TsStatus.emptyText, 'No services to show')
    assert.deepEqual(S.TsStatus.statusModel({ rows: ROWS }, 'M', ctx), model({ rows: ROWS }))
    assert.equal(checkShape({ rows: ROWS }, S.TsStatus.dataShape), null)
    assert.ok(checkShape({}, S.TsStatus.dataShape))
  })

  test('the table is real: a caption, header cells and a keyed body, in a focusable scroller; S has none', () => {
    for (const v of ['Tall', 'M']) {
      const html = S.TsStatus.template(v)
      assert.match(html, /<table part="table"/)
      assert.match(html, /<caption class="visually-hidden" data-k="caption"><\/caption>/)
      assert.match(html, /data-k="scroll" role="group" tabindex="0"/)
      assert.equal((html.match(/<th scope="col"/g) || []).length, v === 'M' ? 3 : 2)
    }
    assert.doesNotMatch(S.TsStatus.template('S'), /<table/)
  })

  test('every template is textless and speaks nothing; every size has a skeleton', () => {
    for (const v of ['S', 'Tall', 'M']) {
      const html = S.TsStatus.template(v)
      assert.doesNotMatch(html, />[^<]*\p{L}[^<]*</u)
      assert.doesNotMatch(html, /\s(aria-label|title)="[^"]*\p{L}/u)
      assert.doesNotMatch(html, /aria-live|role="(status|alert|log)"/)
      assert.match(S.TsStatus.skeleton(v), /class="sk /)
    }
  })

  test('each state has its own shape, and in forced colours the shapes stay', () => {
    const css = S.TsStatus.styles
    assert.match(css, /\.mk\.ok \{[^}]*border-radius: 50%[^}]*var\(--ts-profit\)/)
    assert.match(css, /\.mk\.degraded \{[^}]*var\(--ts-warn\)[^}]*clip-path: polygon/)
    assert.match(css, /\.mk\.down \{[^}]*var\(--ts-loss\)/)
    assert.match(css, /\.mk\.unknown \{[^}]*border-radius: 50%[^}]*border: 2px solid var\(--ts-muted\)/)
    assert.match(css, /@media \(forced-colors: active\)[\s\S]*CanvasText/)
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(css, /\b(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/)
  })

  test('nothing writes markup from data', () => {
    assert.doesNotMatch(readFileSync(new URL('../src/elements/status.js', import.meta.url), 'utf8'), /innerHTML|insertAdjacentHTML|outerHTML/)
  })
})

describe('the element draws in place', () => {
  const build = (variant = 'M') => {
    const doc = new MiniDoc()
    const el = new S.TsStatus()
    el.$ = keyedNodes(doc, (k) => (k === 'body' ? 'tbody' : k === 'table' ? 'table' : 'div'))
    el.ownerDocument = doc
    el.requestRender = () => {}
    const view = (d, v = variant) => el.update(S.TsStatus.viewModel(d, v, ctx), v)
    return { el, doc, view, body: el.$('[data-k="body"]'), node: el.$ }
  }
  // Name, detail, the mark's class, the state's words and the since cell of each row.
  const cells = (body) => body.children.map((tr) => [tr.children[0].children[0].textContent, tr.children[0].children[1].textContent, tr.children[1].children[0].getAttribute('class'), tr.children[1].children[1].textContent, tr.children[2] ? tr.children[2].textContent : null])

  test('M makes a row for each service, in the host\'s order, with the detail and the since cell', () => {
    const { view, body } = build('M')
    view({ rows: ROWS })
    assert.deepEqual(cells(body), [
      ['Orders API', '', 'mk ok', 'OK', ''],
      ['Price feed', 'Elevated latency', 'mk degraded', 'Degraded', 'since 12 min ago'],
      ['Ledger', '', 'mk ok', 'OK', ''],
      ['Email', '', 'mk ok', 'OK', ''],
    ])
    assert.ok(body.children.every((tr) => tr.getAttribute('part') === 'row' && tr.children.every((c) => c.getAttribute('part') === 'cell' || c.getAttribute('part') === 'cell')))
    assert.equal(body.children[1].getAttribute('aria-label'), 'Price feed, Degraded')
    assert.equal(body.children[0].children[1].children[0].getAttribute('aria-hidden'), 'true')
  })

  test('Tall has no since cell and does not write the detail', () => {
    const { view, body } = build('Tall')
    view({ rows: ROWS }, 'Tall')
    assert.equal(body.children[1].children.length, 2)
    assert.equal(body.children[1].children[0].children[1].textContent, '')
  })

  test('the caption and the column names are said in words; the header cells are the messages', () => {
    const { view, node } = build('M')
    view({ rows: ROWS })
    assert.equal(node('[data-k="caption"]').textContent, 'Services, 3 of 4 OK, Degraded')
    assert.deepEqual(['h0', 'h1', 'h2'].map((k) => node(`[data-k="${k}"]`).textContent), ['Name', 'Status', 'Since'])
  })

  test('a change of one row\'s state writes that row\'s mark, words and name, and the caption, and nothing else', () => {
    const { view, doc } = build('M')
    view({ rows: ROWS })
    doc.take()
    view({ rows: ROWS.map((r) => (r.id === 'db' ? { ...r, state: 'down' } : r)) })
    const log = doc.take()
    // The row's mark, words and name, and the caption that counts the services.
    assert.deepEqual(log, ['text div "Services, 2 of 4 OK, Down"', 'attr mk ok class=mk down', 'text stx "Down"', 'attr tr aria-label=Ledger, Down'])
    assert.ok(log.every((l) => !l.startsWith('insert') && !l.startsWith('remove')))
  })

  test('an update that changes nothing writes nothing', () => {
    const { view, doc } = build('M')
    view({ rows: ROWS, live: true, asOf: 0 })
    doc.take()
    view({ rows: ROWS.map((r) => ({ ...r })), live: true, asOf: 0 })
    assert.deepEqual(doc.take(), [])
  })

  test('a service that arrives is one insert, one that leaves one remove', () => {
    const { view, doc, body } = build('Tall')
    view({ rows: ROWS }, 'Tall')
    doc.take()
    view({ rows: [...ROWS.slice(0, 3), { id: 'new', name: 'Search', state: 'unknown' }] }, 'Tall')
    const log = doc.take()
    assert.equal(log.filter((l) => l.startsWith('remove')).length, 1)
    assert.equal(log.filter((l) => /^insert tr\b/.test(l)).length, 1, log.join('\n'))
    assert.equal(body.children.length, 4)
  })

  test('S writes the summary, the overall state\'s words and its mark', () => {
    const { view, node } = build('S')
    view({ rows: ROWS }, 'S')
    assert.equal(node('[data-k="sum"]').textContent, '3 of 4 OK')
    assert.equal(node('[data-k="otext"]').textContent, 'Degraded')
    assert.equal(node('[data-k="odot"]').getAttribute('class'), 'mk degraded')
    view({ rows: [] }, 'S')
    assert.equal(node('[data-k="none"]').textContent, 'No services to show')
    assert.equal(node('[data-k="none"]').hasAttribute('hidden'), false)
    assert.equal(node('[data-k="sum"]').hasAttribute('hidden'), true)
  })
})
