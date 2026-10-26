import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createFormatter, createMessages, EN, WIDGETS, zonedTime } from '../src/core/index.js'
import { checkShape } from '../src/elements/dev.js'
import { FakeElement, FakeDocument } from './fake-dom.mjs'
import { MiniDoc, MiniNode, keyedNodes } from './list-dom.mjs'

let F // feed.js, loaded against the fake HTMLElement (a static import would load widget.js before it exists)
let feedModel, maxOf, DEFAULT_MAX
before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  F = await import('../src/elements/feed.js')
  ;({ feedModel, maxOf, DEFAULT_MAX } = F)
  delete globalThis.HTMLElement
})
after(() => {
  delete globalThis.document
})

// <ts-feed> (RFC 0004 §4.3): the pure model.

const fmt = createFormatter({ locale: 'en-IN', currency: 'INR', timeZone: 'Asia/Kolkata' })
const NOW = zonedTime('2026-08-05', '11:42', 'Asia/Kolkata')
const ctx = { fmt, t: createMessages(), now: NOW, label: 'Activity' }
const model = (data, variant = 'M') => feedModel(data, variant, ctx)

const at = (date, time) => zonedTime(date, time, 'Asia/Kolkata')
const ITEMS = [
  { id: 3, text: 'Order filled', time: at('2026-08-05', '11:40'), tag: 'Fill', tone: 'pos', detail: '50 at 128.00' },
  { id: 2, text: 'Latency alert', time: at('2026-08-04', '16:05'), tag: 'Alert', tone: 'warn' },
  { id: 1, text: 'Session opened' },
]
const many = (n) => Array.from({ length: n }, (_, i) => ({ id: n - i, text: `Event ${n - i}` }))

describe('feedModel', () => {
  test('keeps the host\'s order and reads text, tag, tone and detail', () => {
    const m = model({ items: ITEMS })
    assert.deepEqual(m.items.map((i) => i.id), [3, 2, 1])
    assert.deepEqual([m.items[0].tag, m.items[0].tone, m.items[0].detail], ['Fill', 'pos', '50 at 128.00'])
    assert.equal(m.items[1].tone, 'warn')
  })

  test('the time is the clock for today, and the day and the clock for another day', () => {
    const m = model({ items: ITEMS })
    assert.deepEqual(m.items.map((i) => i.time), ['11:40', '4 Aug 16:05', ''])
  })

  test('a tag-less item has no tone, and a tone with no tag is ignored; an unknown tone is muted', () => {
    const m = model({ items: [{ id: 1, text: 'a', tone: 'pos' }, { id: 2, text: 'b', tag: 'T', tone: 'loud' }, { id: 3, text: 'c', tag: 'T' }] })
    assert.deepEqual(m.items.map((i) => i.tone), ['mut', 'mut', 'mut'])
  })

  test('the default is 50 items; max shows the first max and counts the rest', () => {
    const m = model({ items: many(62) })
    assert.deepEqual([m.items.length, m.hidden, m.more], [50, 12, '12 older events not shown'])
    assert.equal(m.items[0].id, 62)
    const two = model({ items: many(5), max: 3 })
    assert.deepEqual([two.items.length, two.hidden, two.more], [3, 2, '2 older events not shown'])
    assert.equal(model({ items: many(2), max: 1 }).more, '1 older event not shown')
    assert.deepEqual([model({ items: many(5) }).hidden, model({ items: many(5) }).more], [0, ''])
  })

  test('max is at least 1, and an unusable value is the default', () => {
    assert.equal(maxOf(0), 1)
    assert.equal(maxOf(-4), 1)
    assert.equal(maxOf(2.9), 2)
    for (const bad of [undefined, null, 'x', NaN, Infinity]) assert.equal(maxOf(bad), DEFAULT_MAX)
  })

  test('the name states the count and the latest event', () => {
    assert.equal(model({ items: ITEMS }).ariaLabel, 'Activity, 3 events, latest: Order filled')
    assert.equal(model({ items: [ITEMS[0]] }).ariaLabel, 'Activity, 1 event, latest: Order filled')
    assert.equal(model({ items: many(62) }).ariaLabel, 'Activity, 62 events, latest: Event 62')
    assert.equal(model({ items: [] }).ariaLabel, 'Activity, no events')
  })

  test('an item with no id, no text or a repeated id is dropped and counted', () => {
    const m = model({ items: [ITEMS[0], { text: 'x' }, { id: 9 }, { id: 9, text: '' }, { ...ITEMS[0] }, null] })
    assert.deepEqual(m.items.map((i) => i.id), [3])
    assert.equal(m.dropped, 5)
  })

  test('does not throw on null, [], a non-array or junk', () => {
    for (const bad of [null, undefined, 5, 'x', [], {}, { items: 'x' }, { items: {} }]) {
      const m = model(bad)
      assert.deepEqual([m.items, m.hidden, m.more], [[], 0, ''], String(bad))
    }
  })

  test('each item has a spoken sentence when it has a time', () => {
    const m = model({ items: ITEMS })
    assert.deepEqual(m.items.map((i) => i.aria), ['11:40, Fill: Order filled', '4 Aug 16:05, Alert: Latency alert', ''])
    assert.equal(model({ items: [{ id: 1, text: 'Hello', time: at('2026-08-05', '09:00') }] }).items[0].aria, '09:00, Hello')
  })

  test('freshness: the live dot and the synced time', () => {
    const m = model({ items: ITEMS, live: true, asOf: Date.UTC(2026, 7, 5, 6, 12) })
    assert.deepEqual([m.live, m.time], [true, '11:42'])
  })
})

describe('words and the catalog', () => {
  const PSEUDO = createMessages(Object.fromEntries(Object.entries(EN).map(([key, value]) => [key, `⟦${value}⟧`])))
  const WRAP = /⟦[^⟦⟧]*⟧/g
  test('every word in the model comes from the messages, in the pseudo-locale', () => {
    const m = feedModel({ items: [...ITEMS, ...many(60)], max: 5 }, 'M', { ...ctx, t: PSEUDO })
    for (const s of [m.ariaLabel, m.more, m.items[0].aria]) {
      assert.match(s, /⟦/)
      const left = s.replace(WRAP, ' ').split('Activity').join(' ').split('Order filled').join(' ').split('Fill').join(' ')
      assert.doesNotMatch(left, /\p{L}/u, s)
    }
  })

  test('the catalog entry is the RFC\'s, in General', () => {
    const { tag, label, sizes, category } = WIDGETS.feed
    assert.deepEqual({ tag, label, sizes }, { tag: 'ts-feed', label: 'Feed', sizes: ['Tall', 'M', 'L'] })
    assert.equal(category, 'General')
  })
})

describe('the class and its templates', () => {
  test('declares its contract and a pure model the class re-exports', () => {
    assert.equal(F.TsFeed.catalogKey, 'feed')
    assert.equal(F.TsFeed.emptyText, 'Nothing yet')
    assert.deepEqual(F.TsFeed.feedModel({ items: ITEMS }, 'M', ctx), model({ items: ITEMS }))
    assert.equal(checkShape({ items: ITEMS }, F.TsFeed.dataShape), null)
    assert.ok(checkShape({}, F.TsFeed.dataShape))
  })

  test('every size is a list in a focusable scroller, textless, and no aria-live anywhere', () => {
    for (const v of ['Tall', 'M', 'L']) {
      const html = F.TsFeed.template(v)
      assert.match(html, /<ul class="fl [a-z]+" part="list"/)
      assert.match(html, /data-k="scroll" role="group" tabindex="0"/)
      assert.doesNotMatch(html, />[^<]*\p{L}[^<]*</u)
      assert.doesNotMatch(html, /\s(aria-label|title)="[^"]*\p{L}/u)
      assert.match(F.TsFeed.skeleton(v), /class="sk /)
    }
    const source = readFileSync(new URL('../src/elements/feed.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(source, /aria-live|aria-atomic|role="(status|alert|log)"|innerHTML|insertAdjacentHTML|outerHTML/)
  })

  test('the CSS uses tokens and logical properties only', () => {
    const css = F.TsFeed.styles
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(css, /\b(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/)
    for (const tone of ['pos', 'neg', 'warn']) assert.match(css, new RegExp(`\\.tg\\.${tone} \\{ color: var\\(--ts-(profit|loss|warn)\\)`))
  })
})

describe('the element draws in place', () => {
  // Rows are 40px tall, so a scroll offset and a row's place are plain arithmetic.
  const build = (variant = 'M') => {
    const doc = new MiniDoc()
    const el = new F.TsFeed()
    el.$ = keyedNodes(doc, (k) => (k === 'list' ? 'ul' : 'div'))
    el.ownerDocument = doc
    el.requestRender = () => {}
    const scroll = el.$('[data-k="scroll"]')
    scroll.scrollTop = 0
    const view = (d, v = variant) => el.update(F.TsFeed.viewModel(d, v, ctx), v)
    return { el, doc, view, scroll, list: el.$('[data-k="list"]'), node: el.$ }
  }
  const lay = (scroll) => {
    const was = MiniNode.prototype.getBoundingClientRect
    MiniNode.prototype.getBoundingClientRect = function () {
      if (this.localName !== 'li') return { top: 0, bottom: 200 }
      const top = this.parent.children.indexOf(this) * 40 - scroll.scrollTop
      return { top, bottom: top + 40 }
    }
    return () => {
      MiniNode.prototype.getBoundingClientRect = was
    }
  }
  const texts = (list) => list.children.map((li) => [li.children[0].textContent, li.children[1].textContent, li.children[2].textContent, li.children[3].textContent])

  test('the first render makes one item for each event, newest first, with its time, tag, text and detail', () => {
    const { view, list } = build('M')
    view({ items: ITEMS })
    assert.deepEqual(texts(list), [['11:40', 'Fill', 'Order filled', '50 at 128.00'], ['4 Aug 16:05', 'Alert', 'Latency alert', ''], ['', '', 'Session opened', '']])
    assert.deepEqual(list.children.map((li) => li.children[1].getAttribute('class')), ['tg pos', 'tg warn', 'tg mut'])
    assert.equal(list.children[0].getAttribute('part'), 'item')
    assert.equal(list.children[0].getAttribute('aria-label'), '11:40, Fill: Order filled')
    assert.equal(list.children[2].hasAttribute('aria-label'), false)
    assert.equal(list.children[2].children[1].hasAttribute('hidden'), true, 'no tag, no tag chip')
  })

  test('the tile and the list are never live: nothing is announced when an event arrives', () => {
    const { view, node, list } = build('M')
    view({ items: many(3) })
    view({ items: many(4) })
    for (const n of [node('[data-k="scroll"]'), list, ...list.children]) {
      assert.equal(n.hasAttribute('aria-live'), false)
      assert.equal(n.getAttribute('role') === 'status' || n.getAttribute('role') === 'alert', false)
    }
  })

  test('an arrival is one insert at the front and nothing else moves or is rewritten', () => {
    const { view, doc, list } = build('M')
    view({ items: many(5) })
    const first = list.children[0]
    doc.take()
    view({ items: many(6) })
    const log = doc.take()
    assert.equal(log.filter((l) => /^insert li\b/.test(l)).length, 1, log.join('\n'))
    assert.equal(log.filter((l) => l.startsWith('remove')).length, 0)
    // The new item's cells, its name, the tile's name caption and nothing from the five that were there.
    assert.equal(list.children.length, 6)
    assert.equal(list.children[1], first)
    assert.equal(list.children[0].children[2].textContent, 'Event 6')
    assert.ok(!log.some((l) => /Event [1-5]"/.test(l)), log.join('\n'))
  })

  test('a departed item is one remove, and a changed item writes only its changed text', () => {
    const { view, doc, list } = build('M')
    view({ items: many(5) })
    doc.take()
    view({ items: many(5).map((i) => (i.id === 3 ? { ...i, text: 'Event 3, edited' } : i)).slice(0, 4) })
    const log = doc.take()
    assert.equal(log.filter((l) => l.startsWith('remove')).length, 1)
    assert.deepEqual(log.filter((l) => l.startsWith('text')), ['text tx "Event 3, edited"'])
    assert.equal(list.children.length, 4)
  })

  test('at the top an arrival leaves the scroll offset alone', () => {
    const { view, scroll } = build('M')
    const unlay = lay(scroll)
    try {
      view({ items: many(10) })
      view({ items: many(12) })
      assert.equal(scroll.scrollTop, 0)
    } finally {
      unlay()
    }
  })

  test('scrolled away from the top, an arrival moves the offset by the height it added, so the reading place stays', () => {
    const { view, scroll } = build('M')
    const unlay = lay(scroll)
    try {
      view({ items: many(10) })
      scroll.scrollTop = 100
      view({ items: many(12) })
      assert.equal(scroll.scrollTop, 180, 'two rows of 40px were added in front')
      view({ items: many(13) })
      assert.equal(scroll.scrollTop, 220)
    } finally {
      unlay()
    }
  })

  test('an engine that rounds scrollTop to whole pixels does not creep: the sub-pixel remainder is shifted away and the row in view stays put', () => {
    const { view, scroll, list } = build('M')
    // Rows 40.13 px tall, and a scroller that keeps whole pixels, as WebKit does.
    let top = 0
    Object.defineProperty(scroll, 'scrollTop', { get: () => top, set: (v) => { top = Math.round(v) }, configurable: true })
    const H = 40.13
    const was = MiniNode.prototype.getBoundingClientRect
    MiniNode.prototype.getBoundingClientRect = function () {
      if (this.localName !== 'li') return { top: 0, bottom: 200 }
      // The list's own translation moves every row, as a transform does in a browser.
      const m = /translateY\((-?[\d.]+)px\)/.exec(this.parent.style.getPropertyValue('transform'))
      const t = this.parent.children.indexOf(this) * H - top + (m ? Number(m[1]) : 0)
      return { top: t, bottom: t + H }
    }
    const place = (text) => list.children.find((li) => li.children[2].textContent === text).getBoundingClientRect().top
    try {
      view({ items: many(20) })
      scroll.scrollTop = 500
      const start = place('Event 12')
      for (let n = 21; n <= 60; n++) {
        // The window is wide enough that the reader's row never trims out.
        view({ items: many(n), max: 100 })
        assert.ok(Math.abs(place('Event 12') - start) < 0.011, `arrival ${n}: drifted ${place('Event 12') - start}`)
      }
    } finally {
      MiniNode.prototype.getBoundingClientRect = was
    }
  })

  test('the offset follows the row in view when an arrival and a departure come together', () => {
    const { view, scroll } = build('M')
    const unlay = lay(scroll)
    try {
      view({ items: many(10) })
      scroll.scrollTop = 100
      // One in front, the oldest gone: the rows in view are 40px further down.
      view({ items: many(11).slice(0, 10) })
      assert.equal(scroll.scrollTop, 140)
    } finally {
      unlay()
    }
  })

  test('the older-events line says how many max left out, and hides when none', () => {
    const { view, node } = build('M')
    view({ items: many(8), max: 5 })
    assert.equal(node('[data-k="more"]').textContent, '3 older events not shown')
    assert.equal(node('[data-k="more"]').hasAttribute('hidden'), false)
    view({ items: many(4), max: 5 })
    assert.equal(node('[data-k="more"]').hasAttribute('hidden'), true)
  })

  test('with no events the line says so, and the tile is named with no events', () => {
    const { view, node } = build('M')
    view({ items: [] })
    assert.equal(node('[data-k="none"]').textContent, 'Nothing yet')
    assert.equal(node('[data-k="none"]').hasAttribute('hidden'), false)
  })

  test('an update that changes nothing writes nothing', () => {
    const { view, doc } = build('M')
    view({ items: ITEMS, live: true, asOf: 0 })
    doc.take()
    view({ items: ITEMS.map((i) => ({ ...i })), live: true, asOf: 0 })
    assert.deepEqual(doc.take(), [])
  })
})
