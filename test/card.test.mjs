import { test, describe, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { SIZE_NAMES, createFormatter, createMessages } from '../src/core/index.js'
import { FakeElement, FakeDocument, tick } from './fake-dom.mjs'

// <ts-card> (RFC 0002 §3.1). The module under test needs a base class, so it
// is imported after the shared fake DOM is installed; nothing else here
// imports widget.js first, because this file's process would then keep a
// DOM-less copy.

let Card
let cardModel
let cardSizes

before(async () => {
  globalThis.HTMLElement = FakeElement
  globalThis.document = new FakeDocument()
  const mod = await import('../src/elements/card.js?fake-card')
  Card = mod.TsCard
  cardModel = mod.cardModel
  cardSizes = mod.cardSizes
  delete globalThis.HTMLElement
})
afterEach(() => globalThis.document.reset())
after(() => {
  delete globalThis.document
})

const el = (name, attrs = {}) => ({ nodeType: 1, textContent: '', getAttribute: (k) => (k === 'slot' ? name || null : attrs[k] ?? null) })
const text = (s) => ({ nodeType: 3, textContent: s })

function make({ attrs = {}, kids = [] } = {}) {
  const card = new Card()
  card.localName = 'ts-card'
  // The shared fake root hands out throwaway nodes for anything but the tile;
  // a card's update() writes through this.$(), so route it to the tile's nodes.
  const root = card.shadowRoot
  root.querySelector = (sel) => (sel === '.tile' ? root.section : root.section.querySelector(sel))
  card.childNodes = kids
  for (const [k, v] of Object.entries(attrs)) card.attrs.set(k, v)
  card.connect()
  return card
}

const html = (card) => card.shadowRoot.section.html
const slotsIn = (s) => [...s.matchAll(/<slot(?: name="([^"]+)")?(?: part="[^"]+")?>/g)].map((m) => m[1] || 'default')

describe('static contract', () => {
  test('the card has optional data, the card catalog key and a dataShape for its two optional keys', () => {
    assert.equal(Card.dataOptional, true)
    assert.equal(Card.catalogKey, 'card')
    assert.deepEqual(Object.keys(Card.dataShape).sort(), ['asOf', 'live'])
    assert.ok(Object.values(Card.dataShape).every((f) => f.optional === true))
  })

  test('it observes the base attributes plus sizes, live, as-of and scrollable', () => {
    for (const name of ['size', 'label', 'state', 'sizes', 'live', 'as-of', 'scrollable']) assert.ok(Card.observedAttributes.includes(name), name)
  })

  test('the template has all five slots of the contract, and the body is a flexing box', () => {
    const t = Card.template('M')
    assert.deepEqual(slotsIn(t), ['actions', 'value', 'default', 'footer'])
    assert.match(t, /class="body"[^>]*><slot><\/slot>/)
    assert.match(Card.styles, /\.body \{ flex: 1; min-height: 0; overflow: hidden; \}/)
    assert.match(Card.styles, /\.body\.scroll \{ overflow: auto;/)
  })

  test('styles use tokens only', () => {
    assert.doesNotMatch(Card.styles, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
  })

  test('sizes parse: tokens in size order, invalid ones ignored, all seven by default', () => {
    assert.deepEqual(cardSizes('S Wide M'), ['S', 'Wide', 'M'])
    assert.deepEqual(cardSizes('M  s Bogus  Wide'), ['Wide', 'M'])
    assert.deepEqual(cardSizes('bogus nope'), [...SIZE_NAMES])
    assert.deepEqual(cardSizes(null), [...SIZE_NAMES])
    assert.deepEqual(cardSizes(''), [...SIZE_NAMES])
    assert.equal(SIZE_NAMES.length, 7)
  })
})

describe('cardModel', () => {
  const fmt = createFormatter({ timeZone: 'UTC' })
  const base = { fmt, t: createMessages(), label: 'News', live: false, asOf: null, scrollable: false, valueText: '' }

  test('data wins over the attributes, and bad times show nothing', () => {
    const at = Date.UTC(2026, 0, 5, 14, 5)
    assert.equal(cardModel({ asOf: at }, 'M', base).time, '14:05')
    assert.equal(cardModel({}, 'M', { ...base, asOf: new Date(at).toISOString() }).time, '14:05')
    assert.equal(cardModel({ asOf: at }, 'M', { ...base, asOf: '2020-01-01T00:00:00Z' }).time, '14:05')
    assert.equal(cardModel({ asOf: 'later' }, 'M', base).time, '')
    assert.equal(cardModel(null, 'M', base).time, '')
    assert.equal(cardModel({ live: false }, 'M', { ...base, live: true }).live, false)
    assert.equal(cardModel({}, 'M', { ...base, live: true }).live, true)
  })

  test('the region name adds the headline when one is slotted', () => {
    assert.equal(cardModel({}, 'M', base).ariaLabel, 'News')
    assert.equal(cardModel({}, 'M', { ...base, valueText: '182 ms' }).ariaLabel, 'News, 182 ms')
  })
})

describe('size snapping from the sizes attribute', () => {
  test('the spec reads sizes and label, and snaps size to them', () => {
    const card = make({ attrs: { label: 'Notes', sizes: 'S Wide M', size: 'XL' } })
    assert.deepEqual(card.spec, { label: 'Notes', sizes: ['S', 'Wide', 'M'] })
    assert.equal(card.size, 'M')
    assert.equal(card.getAttribute('size'), 'M')
  })

  test('with no attribute all seven sizes are allowed and every size is kept', () => {
    const card = make({ attrs: { label: 'Notes' } })
    assert.deepEqual(card.spec.sizes, [...SIZE_NAMES])
    assert.equal(card.size, 'S')
    for (const name of SIZE_NAMES) {
      card.setAttribute('size', name)
      assert.equal(card.size, name)
    }
  })

  test('only invalid tokens means all sizes; the first size is the default', () => {
    assert.deepEqual(make({ attrs: { sizes: 'huge tiny' } }).spec.sizes, [...SIZE_NAMES])
    assert.equal(make({ attrs: { sizes: 'M L' } }).size, 'M')
  })

  test('changing sizes re-snaps the current size and re-renders', async () => {
    const card = make({ attrs: { label: 'Notes', size: 'XL' } })
    await tick()
    assert.equal(card.size, 'XL')
    card.setAttribute('sizes', 'S Wide')
    assert.equal(card.getAttribute('size'), 'Wide')
    await tick()
    assert.ok(html(card).includes('<slot'))
  })

  test('the spec getter answers a grid by reference until an attribute changes', () => {
    const card = make({ attrs: { label: 'Notes', sizes: 'S' } })
    assert.equal(card.spec, card.spec)
    const before = card.spec
    card.setAttribute('sizes', 'M')
    assert.notEqual(card.spec, before)
    assert.deepEqual(card.spec.sizes, ['M'])
  })
})

describe('slots are kept in every state', () => {
  const body = [el(null, {}), el('value'), el('footer'), el('actions')]

  test('with no data at all the card renders its content, not a skeleton', async () => {
    const card = make({ attrs: { label: 'Notes' }, kids: body })
    await tick()
    assert.deepEqual(slotsIn(html(card)), ['actions', 'value', 'default', 'footer'])
    assert.equal(card.shadowRoot.section.getAttribute('aria-label'), 'Notes')
    assert.equal(card.shadowRoot.section.getAttribute('aria-busy'), null)
    assert.equal(card.shadowRoot.section.querySelector('[data-k="label"]').textContent, 'Notes')
  })

  test('data = null never replaces slotted content', async () => {
    const card = make({ attrs: { label: 'Notes' }, kids: body })
    card.data = null
    await tick()
    assert.deepEqual(slotsIn(html(card)), ['actions', 'value', 'default', 'footer'])
    assert.equal(card.data, null, 'the property still reads back what the host set')
  })

  test('a text-only body counts as slotted; whitespace and other slots do not', async () => {
    const withText = make({ kids: [text('Deploy freeze from Friday.')] })
    withText.data = null
    await tick()
    assert.ok(slotsIn(html(withText)).includes('default'))

    const none = make({ kids: [text('\n  '), el('footer'), el('value')] })
    none.data = null
    await tick()
    assert.deepEqual(slotsIn(html(none)), ['empty'])
    assert.equal(none.shadowRoot.section.querySelector('[data-k="empty"]').textContent, 'No data')
  })

  test('nothing slotted and data = null shows the empty view, and a slot="empty" child can replace its text', async () => {
    const card = make({ attrs: { label: 'Notes' }, kids: [el('empty')] })
    card.data = null
    await tick()
    assert.deepEqual(slotsIn(html(card)), ['empty'])
  })

  test('the empty view returns to content when a body is added', async () => {
    const kids = []
    const card = make({ attrs: { label: 'Notes' }, kids })
    card.data = null
    await tick()
    assert.deepEqual(slotsIn(html(card)), ['empty'])
    kids.push(el(null))
    card.requestRender()
    await tick()
    assert.ok(slotsIn(html(card)).includes('default'))
  })

  test('loading covers the body only: header, value and footer slots stay, the default slot goes', async () => {
    const card = make({ attrs: { label: 'Notes', state: 'loading' }, kids: body })
    await tick()
    const slots = slotsIn(html(card))
    assert.deepEqual(slots, ['actions', 'value', 'footer'])
    assert.match(html(card), /class="sk grow"/)
    assert.equal(card.shadowRoot.section.getAttribute('aria-busy'), 'true')
    assert.equal(card.shadowRoot.section.getAttribute('aria-label'), 'Notes')
  })

  test('loading over data, and back, leaves the content and the slots intact', async () => {
    const card = make({ attrs: { label: 'Notes' }, kids: body })
    card.data = { live: true }
    await tick()
    card.setAttribute('state', 'loading')
    await tick()
    assert.equal(slotsIn(html(card)).includes('default'), false)
    card.removeAttribute('state')
    await tick()
    assert.deepEqual(slotsIn(html(card)), ['actions', 'value', 'default', 'footer'])
    assert.equal(card.shadowRoot.section.getAttribute('aria-busy'), null)
  })

  test('the error view and back do not touch what the host slotted', async () => {
    const kids = [...body]
    const card = make({ attrs: { label: 'Notes' }, kids })
    card.error = 'Feed down'
    await tick()
    assert.match(card.shadowRoot.section.getAttribute('aria-label'), /Notes, error: Feed down/)
    assert.deepEqual(card.childNodes, kids)
    card.error = null
    await tick()
    assert.deepEqual(slotsIn(html(card)), ['actions', 'value', 'default', 'footer'])
  })

  test('the content is the same markup at every size', async () => {
    const card = make({ attrs: { label: 'Notes' }, kids: body })
    await tick()
    const first = html(card)
    for (const name of SIZE_NAMES) {
      card.setAttribute('size', name)
      await tick()
      assert.equal(html(card), first, name)
    }
  })
})

describe('header, live and as-of', () => {
  test('live and as-of attributes show the dot and "synced HH:MM"', async () => {
    const card = make({ attrs: { label: 'Notes', live: '', 'as-of': '2026-01-05T14:05:00Z' } })
    card.setAttribute('time-zone', 'UTC')
    await tick()
    const s = card.shadowRoot.section
    assert.equal(s.querySelector('[data-k="dot"]').getAttribute('hidden'), null)
    assert.equal(s.querySelector('[data-k="meta"]').getAttribute('hidden'), null)
    assert.equal(s.querySelector('[data-k="time"]').textContent, '14:05')
    assert.equal(s.querySelector('[data-k="pre"]').textContent, 'synced ')
    assert.equal(s.querySelector('[data-k="post"]').textContent, '')
  })

  test('without them the dot and meta are hidden', async () => {
    const card = make({ attrs: { label: 'Notes' } })
    await tick()
    const s = card.shadowRoot.section
    assert.equal(s.querySelector('[data-k="dot"]').getAttribute('hidden'), '')
    assert.equal(s.querySelector('[data-k="meta"]').getAttribute('hidden'), '')
  })

  test('data updates the header in place, and wins over the attributes', async () => {
    const card = make({ attrs: { label: 'Notes', live: '', 'time-zone': 'UTC' } })
    await tick()
    const writes = card.shadowRoot.section.htmlWrites
    card.data = { live: false, asOf: Date.UTC(2026, 0, 5, 9, 30) }
    await tick()
    const s = card.shadowRoot.section
    assert.equal(s.querySelector('[data-k="dot"]').getAttribute('hidden'), '')
    assert.equal(s.querySelector('[data-k="time"]').textContent, '09:30')
    assert.equal(s.htmlWrites, writes, 'the markup is not rebuilt')
  })
})

describe('scrollable', () => {
  test('the attribute makes the body scroll and keyboard reachable; without it the body clips', async () => {
    const card = make({ attrs: { label: 'Notes', scrollable: '' } })
    await tick()
    const body = card.shadowRoot.section.querySelector('[data-k="body"]')
    assert.equal(body.getAttribute('class'), 'body scroll')
    assert.equal(body.getAttribute('tabindex'), '0')
    assert.equal(body.getAttribute('role'), 'group')
    assert.equal(body.getAttribute('aria-label'), 'Notes')
    card.removeAttribute('scrollable')
    await tick()
    assert.equal(body.getAttribute('class'), 'body')
    assert.equal(body.getAttribute('tabindex'), null)
  })

  test('the fade shows only while there is more to scroll to', async () => {
    const card = make({ attrs: { label: 'Notes', scrollable: '' } })
    await tick()
    const body = card.shadowRoot.section.querySelector('[data-k="body"]')
    Object.assign(body, { scrollTop: 0, clientHeight: 100, scrollHeight: 300 })
    card._fade()
    assert.equal(body.getAttribute('data-more'), '')
    body.scrollTop = 200
    card._fade()
    assert.equal(body.getAttribute('data-more'), null)
  })
})
