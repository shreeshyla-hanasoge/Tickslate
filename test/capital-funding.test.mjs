import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createFormatter, createMessages, EN, WIDGETS } from '../src/core/index.js'
import { checkShape } from '../src/elements/dev.js'
import { FakeElement, FakeDocument } from './fake-dom.mjs'
import { MiniDoc, keyedNodes } from './list-dom.mjs'

// <ts-capital-funding> (RFC 0003 §21.2): the pure model, and the element's writes against a small tree DOM.

const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const ctx = { fmt, t: createMessages(), now: 0, label: 'Funding' }

let W // capital-funding.js, loaded against the fake HTMLElement
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  W = await import('../src/elements/capital-funding.js')
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})

const model = (data, variant = 'Tall') => W.fundingModel(data, variant, ctx)
const alloc = (id, amount, extra) => ({ id, name: id.toUpperCase(), amount, ...extra })

// The designs' account: a balance below each of two equal allocations.
const A = { id: 'a', name: 'Broker A', balance: 18640.4, allocations: [alloc('x', 25000, { detail: 'NIFTY 50 · 5m', live: true, pnl: 1240.5 }), alloc('y', 25000, { pnl: -310 })] }
const B = { id: 'b', name: 'Broker B', balance: '452800.5', allocations: [alloc('p', 200000), alloc('q', '150000.00')] }
const data = (extra) => ({ accounts: [A, B], ...extra })

describe('without a DOM', () => {
  test('the class module loads and declares its contract', () => {
    assert.equal(typeof W.TsCapitalFunding, 'function')
    assert.equal(W.TsCapitalFunding.catalogKey, 'capitalFunding')
    assert.equal(W.TsCapitalFunding.emptyText, 'No accounts yet')
    assert.deepEqual(W.TsCapitalFunding.fundingModel(data(), 'Tall', ctx), model(data()))
  })

  test('the catalog entry is the RFC\'s', () => {
    const { tag, label, sizes } = WIDGETS.capitalFunding
    assert.deepEqual({ tag, label, sizes }, { tag: 'ts-capital-funding', label: 'Capital funding', sizes: ['S', 'Tall', 'L'] })
  })

  test('the templates hold no words, a list is a focusable named group, and every variant has a skeleton', () => {
    for (const v of ['S', 'Tall', 'L']) {
      const html = W.TsCapitalFunding.template(v)
      assert.doesNotMatch(html, />[^<]*\p{L}[^<]*</u, v)
      assert.doesNotMatch(html, /\s(aria-label|title)="[^"]*\p{L}/u, v)
      assert.match(W.TsCapitalFunding.skeleton(v), /class="sk /)
    }
    assert.match(W.TsCapitalFunding.template('Tall'), /data-k="scroll" role="group" tabindex="0"/)
    assert.match(W.TsCapitalFunding.template('S'), /class="ar" aria-hidden="true" data-k="shareAr"|data-k="shareAr"/)
    assert.match(W.TsCapitalFunding.template('S'), /<span aria-hidden="true">↻<\/span>/)
  })

  test('the CSS uses tokens and logical properties only, with the stripes mixed from the loss colour', () => {
    const css = W.TsCapitalFunding.styles
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(css, /\b(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/)
    assert.doesNotMatch(css, /text-align:\s*(left|right)/)
    assert.match(css, /\.fb\.short \{[^}]*repeating-linear-gradient[^}]*color-mix\(in srgb, var\(--ts-loss\)/)
    assert.match(css, /@media \(forced-colors: active\)/)
  })

  test('dataShape asks for the accounts, and lists the freshness keys as optional', () => {
    const { accounts, ...rest } = W.TsCapitalFunding.dataShape
    assert.equal(accounts, 'array')
    assert.deepEqual(Object.keys(rest).sort(), ['asOf', 'live'])
    assert.equal(checkShape(data(), W.TsCapitalFunding.dataShape), null)
    assert.ok(checkShape({}, W.TsCapitalFunding.dataShape))
  })

  test('nothing writes markup from data', async () => {
    const { readFileSync } = await import('node:fs')
    assert.doesNotMatch(readFileSync(new URL('../src/elements/capital-funding.js', import.meta.url), 'utf8'), /innerHTML|insertAdjacentHTML|outerHTML/)
  })
})

describe('funding an account', () => {
  test('allocations draw the balance in order, and each is short by the rest', () => {
    const [a] = model(data()).rows
    assert.deepEqual([a.balance, a.allocated, a.free], ['₹18,640.40', '₹50,000.00', '₹0.00'])
    assert.deepEqual(a.allocations.map((x) => x.short), ['short ₹6,359.60', 'short ₹25,000.00'])
    assert.equal(a.short, 'short ₹31,359.60')
    assert.deepEqual([a.share, a.hasShort, a.status], ['37%', true, 'short ₹31,359.60'])
  })

  test('the stripes: a bar with a shortfall is flagged, its funded share is a percent of what is allocated', () => {
    const [a] = model(data()).rows
    assert.deepEqual([a.bar.short, a.bar.funded], [true, 37.3])
    assert.deepEqual(a.allocations.map((x) => [x.bar.short, x.bar.funded]), [[true, 74.6], [true, 0]])
  })

  test('a fully funded account says so, has no shortfall text and keeps its free balance', () => {
    const [, b] = model(data()).rows
    assert.deepEqual([b.short, b.status, b.hasShort, b.share, b.free], ['', 'Fully funded', false, '100%', '₹1,02,800.50'])
    assert.equal(b.bar.short, false)
    assert.ok(b.allocations.every((x) => x.short === ''))
  })

  test('money is grouped in lakhs for en-IN, and a negative figure takes the true minus', () => {
    const [, b] = model(data()).rows
    assert.deepEqual([b.balance, b.allocated], ['₹4,52,800.50', '₹3,50,000.00'])
    const [c] = model({ accounts: [{ id: 'c', name: 'C', balance: -5000, allocations: [alloc('x', 1000)] }] }).rows
    assert.equal(c.balance, '−₹5,000.00')
    assert.equal(c.allocations[0].short, 'short ₹1,000.00')
  })

  test('over-allocation: the first allocations take the balance and the last goes short, and nothing is funded twice', () => {
    const [a] = model({ accounts: [{ id: 'o', name: 'O', balance: 1000, allocations: [alloc('x', 600), alloc('y', 600), alloc('z', 600)] }] }).rows
    assert.deepEqual(a.allocations.map((x) => x.short), ['', 'short ₹200.00', 'short ₹600.00'])
    assert.deepEqual([a.allocated, a.free, a.short], ['₹1,800.00', '₹0.00', 'short ₹800.00'])
  })

  test('a given funded replaces the rule and consumes the balance for the allocations after it', () => {
    const [a] = model({ accounts: [{ id: 'g', name: 'G', balance: 100, allocations: [alloc('x', 60, { funded: 10 }), alloc('y', 60), alloc('z', 60)] }] }).rows
    // x is funded 10 by the host; y takes 60 of the 90 left; z takes the last 30.
    assert.deepEqual(a.allocations.map((x) => x.short), ['short ₹50.00', '', 'short ₹30.00'])
  })

  test('numeric strings are read; an amount or a balance that cannot be is zero', () => {
    const [a] = model({ accounts: [{ id: 's', name: 'S', balance: '100.50', allocations: [alloc('x', '60.25'), alloc('y', 'n/a')] }] }).rows
    assert.deepEqual([a.balance, a.allocated, a.free], ['₹100.50', '₹60.25', '₹40.25'])
    // An allocation of nothing has no bar: zero over zero would claim a state the data does not have.
    assert.equal(a.allocations[1].bar, null)
    const [none] = model({ accounts: [{ id: 'n', name: 'N', balance: 'abc', allocations: [alloc('x', 10)] }] }).rows
    assert.deepEqual([none.balance, none.short], ['₹0.00', 'short ₹10.00'])
  })

  test('nothing allocated: no bar, no share, and it says so', () => {
    for (const allocations of [[], undefined]) {
      const [a] = model({ accounts: [{ id: 'e', name: 'E', balance: 100, allocations }] }).rows
      assert.deepEqual([a.bar, a.share, a.status, a.hasShort, a.free], [null, '', 'Nothing allocated', false, '₹100.00'])
    }
  })

  test('the share is never rounded up to 100% while anything is short', () => {
    const [a] = model({ accounts: [{ id: 'r', name: 'R', balance: 99999, allocations: [alloc('x', 100000)] }] }).rows
    assert.equal(a.share, '99%')
    assert.equal(a.hasShort, true)
  })

  test('each allocation carries its P&L signed, with an arrow, its detail and its live flag', () => {
    const [x, y] = model(data()).rows[0].allocations
    assert.deepEqual([x.pnl, x.arrow, x.tone, x.detail, x.live], ['+₹1,240.50', '▲', 'pos', 'NIFTY 50 · 5m', true])
    assert.deepEqual([y.pnl, y.arrow, y.tone, y.live], ['−₹310.00', '▼', 'neg', false])
    const [, b] = model(data()).rows
    assert.deepEqual([b.allocations[0].pnl, b.allocations[0].arrow], ['', ''])
    const [z] = model({ accounts: [{ id: 'z', name: 'Z', balance: 1, allocations: [alloc('x', 1, { pnl: 0.001 })] }] }).rows[0].allocations
    assert.deepEqual([z.arrow, z.tone], ['', 'mut'], 'a P&L that rounds to zero has no sign and no arrow')
  })
})

describe('rows and the accessible name', () => {
  test('an account or an allocation with no id, a repeated id or no object is dropped and counted', () => {
    const m = model({ accounts: [A, null, 'x', { name: 'no id', balance: 1 }, { ...B, id: 'a' }, B] })
    assert.deepEqual(m.rows.map((r) => r.id), ['a', 'b'])
    assert.equal(m.dropped, 4)
    assert.match(m.ariaLabel, /4 items not shown$/)
  })

  test('an allocation with a missing or repeated id still draws the balance, under an id of its own; only what is no object is left out', () => {
    const [c] = model({ accounts: [{ id: 'c', name: 'C', balance: 100, allocations: [{ id: 1, name: 'one', amount: 100 }, { id: 1, name: 'two', amount: 50 }, { name: 'none', amount: 10 }, null] }] }).rows
    assert.deepEqual(c.allocations.map((x) => x.id), ['1', '1#2', '#3'])
    assert.deepEqual(c.allocations.map((x) => x.short), ['', 'short ₹50.00', 'short ₹10.00'])
    assert.equal(c.short, 'short ₹60.00')
    assert.equal(c.dropped, 1)
    assert.equal(model({ accounts: [{ id: 'c', name: 'C', balance: 100, allocations: [null] }] }).ariaLabel, 'Funding, 1 account, 1 item not shown')
  })

  test('the note says how many are not shown, in the tile, with plural forms', () => {
    assert.equal(model({ accounts: [A, null] }).note, '1 item not shown')
    assert.equal(model({ accounts: [A, null, 3] }).note, '2 items not shown')
    assert.equal(model(data()).note, '')
  })

  test('data that is not accounts gives an empty list rather than throwing', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { accounts: 'x' }, { accounts: {} }]) {
      const m = model(bad)
      assert.deepEqual([m.rows, m.total], [[], 0], String(bad))
    }
  })

  test('S shows the first account; the name states the count, and S says it shows the first', () => {
    assert.deepEqual(model(data(), 'S').rows.map((r) => r.id), ['a'])
    assert.deepEqual(model(data(), 'Tall').rows.map((r) => r.id), ['a', 'b'])
    assert.equal(model(data(), 'Tall').ariaLabel, 'Funding, 2 accounts')
    assert.equal(model(data(), 'S').ariaLabel, 'Funding, 2 accounts, Broker A, balance ₹18,640.40, allocated ₹50,000.00, 37% funded, short ₹31,359.60, showing the first')
    assert.equal(model({ accounts: [B] }, 'S').ariaLabel, 'Funding, 1 account, Broker B, balance ₹4,52,800.50, allocated ₹3,50,000.00, 100% funded')
  })

  test('each bar says its result in words, including the shortfall', () => {
    const [a] = model(data()).rows
    assert.equal(a.bar.label, 'Broker A: ₹18,640.40 of ₹50,000.00 funded, short ₹31,359.60')
    assert.equal(a.allocations[0].bar.label, 'X: ₹18,640.40 of ₹25,000.00 funded, short ₹6,359.60')
    assert.equal(model(data()).rows[1].bar.label, 'Broker B: ₹3,50,000.00 of ₹3,50,000.00 funded')
  })

  test('the Rebalance button names its account', () => {
    assert.equal(model(data()).rows[0].rebalance, 'Rebalance Broker A')
  })

  test('freshness: the live dot and the synced time', () => {
    const m = model(data({ live: true, asOf: Date.UTC(2026, 7, 5, 6, 12) }))
    assert.deepEqual([m.live, m.time], [true, '11:42'])
  })
})

describe('words', () => {
  const PSEUDO = createMessages(Object.fromEntries(Object.entries(EN).map(([key, value]) => [key, `⟦${value}⟧`])))
  const pseudo = { ...ctx, t: PSEUDO }
  const WRAP = /⟦[^⟦⟧]*⟧/g
  const peel = (s) => {
    for (let before = ''; before !== s; ) {
      before = s
      s = s.replace(WRAP, ' ')
    }
    return s
  }

  test('every word in the model comes from the messages, in the pseudo-locale', () => {
    for (const variant of ['S', 'Tall', 'L']) {
      const m = W.fundingModel(data(), variant, pseudo)
      const strings = [
        m.ariaLabel,
        ...m.rows.flatMap((r) => [r.status, r.short, r.summary, r.rebalance, r.bar && r.bar.label, ...r.allocations.flatMap((a) => [a.short, a.bar && a.bar.label])]),
      ].filter(Boolean)
      assert.ok(strings.length >= 8)
      for (const s of strings) {
        const left = peel(s).split('Funding').join(' ').split('Broker A').join(' ').split('Broker B').join(' ').split(/[XYPQ]: /).join(' ')
        assert.doesNotMatch(left, /\p{L}/u, `${variant}: ${s}`)
        assert.match(s, /⟦/)
      }
    }
  })

  test('the keys exist', () => {
    for (const key of ['funding.short', 'funding.full', 'funding.nothing', 'funding.share', 'funding.funded', 'funding.bar', 'funding.rebalance', 'funding.rebalanceLabel', 'funding.live', 'funding.balance', 'funding.allocated', 'funding.free', 'widget.capitalFunding.empty']) {
      assert.ok(key in EN, key)
    }
    assert.equal(EN['funding.short'], 'short {amount}')
  })
})

// ── The element ───────────────────────────────────────────────────────────

function build({ actions = [], variant = 'Tall' } = {}) {
  const doc = new MiniDoc()
  const el = new W.TsCapitalFunding()
  el.$ = keyedNodes(doc, (k) => (k === 'reb' ? 'button' : k === 'list' ? 'ul' : 'div'))
  // S's bar is in its template with the filled part inside it.
  el.$('[data-k="bar"]').appendChild(doc.createElement('span'))
  doc.take()
  el.ownerDocument = doc
  el.actions = actions
  el.requestRender = () => {}
  const events = []
  el.addEventListener('ts-action', (e) => events.push(e.detail))
  const view = (d, v = variant) => el.update(W.TsCapitalFunding.viewModel(d, v, ctx), v)
  return { el, doc, view, events, list: el.$('[data-k="list"]'), node: el.$ }
}

// An account's head, bar, meta and allocations, by position.
const parts = (li) => {
  const [head, bar, meta, totals, allocs] = li.children
  return { head, bar, meta, totals, allocs }
}

describe('the element draws in place', () => {
  test('the first render makes one item for each account, with its bar and its allocations', () => {
    const { view, list } = build()
    view(data(), 'L')
    assert.equal(list.children.length, 2)
    const a = parts(list.children[0])
    assert.equal(a.head.children[0].textContent, 'Broker A')
    assert.equal(a.meta.children[0].children[1].textContent, '₹18,640.40')
    assert.equal(a.meta.children[1].textContent, '37% funded')
    assert.equal(a.meta.children[2].textContent, 'short ₹31,359.60')
    assert.equal(a.meta.children[2].getAttribute('class'), 'st n neg')
    assert.deepEqual([a.totals.children[0].textContent, a.totals.children[1].textContent, a.totals.children[3].textContent], ['Allocated', '₹50,000.00', '₹0.00'])
    assert.equal(a.bar.getAttribute('role'), 'img')
    assert.equal(a.bar.getAttribute('aria-label'), 'Broker A: ₹18,640.40 of ₹50,000.00 funded, short ₹31,359.60')
    assert.equal(a.bar.getAttribute('class'), 'fb short')
    assert.equal(a.bar.firstChild.style.getPropertyValue('--f'), '37.3')
    assert.equal(a.allocs.children.length, 2)
    const b = parts(list.children[1])
    assert.equal(b.bar.getAttribute('class'), 'fb')
    assert.equal(b.meta.children[2].getAttribute('class'), 'st n')
  })

  test('an allocation shows its amount, the words "short <amount>", its live dot and its P&L at L', () => {
    const { view, list } = build({ variant: 'L' })
    view(data(), 'L')
    const [x, y] = parts(list.children[0]).allocs.children
    const [name, num, sub, pn, bar] = x.children
    assert.equal(name.children[1].textContent, 'X')
    assert.equal(name.children[0].hasAttribute('hidden'), false, 'the live dot')
    assert.equal(name.children[0].getAttribute('aria-hidden'), 'true')
    assert.equal(name.children[2].textContent, 'live')
    assert.equal(num.textContent, '₹25,000.00')
    assert.deepEqual([sub.children[0].textContent, sub.children[1].textContent], ['NIFTY 50 · 5m', 'short ₹6,359.60'])
    assert.deepEqual([pn.children[0].textContent, pn.children[1].textContent, pn.getAttribute('class')], ['▲', '+₹1,240.50', 'pn n pos'])
    assert.equal(pn.children[0].getAttribute('aria-hidden'), 'true')
    assert.equal(bar.getAttribute('class'), 'fb short')
    assert.equal(y.children[0].children[0].hasAttribute('hidden'), true, 'no dot when it is not live')
    assert.equal(y.children[3].getAttribute('class'), 'pn n neg')
  })

  test('Tall leaves out the detail and the P&L, which only L has room for', () => {
    const { view, list } = build()
    view(data(), 'Tall')
    const [x] = parts(list.children[0]).allocs.children
    assert.equal(x.children[2].children[0].textContent, '')
    assert.equal(x.children[3].hasAttribute('hidden'), true)
  })

  test('S writes the first account: the name, the share, the bar and the shortfall', () => {
    const { view, node } = build({ variant: 'S' })
    view(data(), 'S')
    assert.equal(node('[data-k="name"]').textContent, 'Broker A')
    assert.equal(node('[data-k="shareV"]').textContent, '37%')
    assert.equal(node('[data-k="funded"]').textContent, 'funded')
    assert.equal(node('[data-k="status"]').textContent, 'short ₹31,359.60')
    assert.equal(node('[data-k="status"]').getAttribute('class'), 'sm n ell st neg')
    assert.equal(node('[data-k="bar"]').getAttribute('class'), 'fb short')
    assert.equal(node('[data-k="bar"]').hasAttribute('hidden'), false)
    view({ accounts: [{ id: 'e', name: 'E', balance: 5, allocations: [] }] }, 'S')
    assert.equal(node('[data-k="bar"]').hasAttribute('hidden'), true)
    assert.equal(node('[data-k="shareV"]').textContent, '—')
    assert.equal(node('[data-k="status"]').textContent, 'Nothing allocated')
  })

  test('a balance that moves writes the cells it changes and rebuilds nothing', () => {
    const { view, doc, list } = build()
    view(data(), 'L')
    const before = [...list.children]
    doc.take()
    view({ accounts: [{ ...A, balance: 20000 }, B] }, 'L')
    const log = doc.take()
    assert.ok(!log.some((l) => l.startsWith('insert') || l.startsWith('remove')), log.join('\n'))
    assert.deepEqual([...list.children], before)
    assert.ok(log.some((l) => l.includes('₹20,000.00')))
    assert.ok(log.length < 24, `${log.length} writes: ${log.join('\n')}`)
  })

  test('an update that changes nothing writes nothing', () => {
    const { view, doc } = build()
    view(data({ live: true, asOf: 0 }), 'L')
    doc.take()
    view(data({ live: true, asOf: 0 }), 'L')
    assert.deepEqual(doc.take(), [])
  })

  test('accounts and allocations are keyed: a new one is added and the others are not touched, a gone one is removed', () => {
    const { view, list } = build()
    view(data(), 'L')
    const [a, b] = list.children
    const x = parts(a).allocs.children[0]
    view({ accounts: [{ ...A, allocations: [...A.allocations, alloc('w', 5000)] }, B, { id: 'c', name: 'C', balance: 1, allocations: [] }] }, 'L')
    assert.equal(list.children.length, 3)
    assert.equal(list.children[0], a)
    assert.equal(list.children[1], b)
    assert.equal(parts(a).allocs.children.length, 3)
    assert.equal(parts(a).allocs.children[0], x)
    view({ accounts: [B] }, 'L')
    assert.deepEqual([...list.children], [b])
  })
})

describe('Rebalance', () => {
  test('is not there until actions lists it', () => {
    const { view, list } = build()
    view(data(), 'L')
    assert.ok(list.children.every((li) => parts(li).head.children[1].hasAttribute('hidden')))
    const s = build({ variant: 'S' })
    s.view(data(), 'S')
    assert.equal(s.node('[data-k="reb"]').hasAttribute('hidden'), true)
    // 'retry' alone is not it either.
    const r = build({ actions: ['retry'] })
    r.view(data(), 'L')
    assert.ok(r.list.children.every((li) => parts(li).head.children[1].hasAttribute('hidden')))
  })

  const click = (b, target) => b.el._section.dispatch('click', { target, preventDefault() {}, stopPropagation() {} })

  test('shows a button on each account, named for the account, and fires with the account\'s id', () => {
    const b = build({ actions: ['rebalance'] })
    b.view(data(), 'L')
    const buttons = b.list.children.map((li) => parts(li).head.children[1])
    assert.ok(buttons.every((x) => !x.hasAttribute('hidden')))
    assert.deepEqual(buttons.map((x) => x.textContent), ['Rebalance', 'Rebalance'])
    assert.deepEqual(buttons.map((x) => x.getAttribute('aria-label')), ['Rebalance Broker A', 'Rebalance Broker B'])
    click(b, buttons[1])
    click(b, buttons[0])
    assert.deepEqual(b.events, [{ action: 'rebalance', id: 'b' }, { action: 'rebalance', id: 'a' }])
  })

  test('at S the press fires with the first account\'s id', () => {
    const b = build({ actions: ['rebalance'], variant: 'S' })
    b.view(data(), 'S')
    const reb = b.node('[data-k="reb"]')
    reb.setAttribute('class', 'btn reb ico')
    click(b, reb)
    assert.deepEqual(b.events, [{ action: 'rebalance', id: 'a' }])
  })

  test('with no opt-in a press fires nothing, and a click elsewhere does nothing', () => {
    const b = build({ actions: ['rebalance'] })
    b.view(data(), 'L')
    const button = parts(b.list.children[0]).head.children[1]
    b.el.actions = []
    click(b, button)
    b.el.actions = ['rebalance']
    click(b, b.list.children[0])
    click(b, undefined)
    assert.deepEqual(b.events, [])
  })

  test('nothing fires while the grid is editing', () => {
    const b = build({ actions: ['rebalance'] })
    b.el._isEditing = () => true
    b.view(data(), 'L')
    click(b, parts(b.list.children[0]).head.children[1])
    assert.deepEqual(b.events, [])
  })

  test('S has an icon button, named by aria-label and title', () => {
    const { view, node } = build({ actions: ['rebalance'], variant: 'S' })
    view(data(), 'S')
    const reb = node('[data-k="reb"]')
    assert.equal(reb.hasAttribute('hidden'), false)
    assert.deepEqual([reb.getAttribute('aria-label'), reb.getAttribute('title')], ['Rebalance Broker A', 'Rebalance Broker A'])
    assert.equal(reb.textContent, '', 'the icon is in the markup, the words are the name')
  })
})
