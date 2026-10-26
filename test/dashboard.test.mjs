import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readLayout } from '../src/core/index.js'
import { resetWarnings } from '../src/elements/dev.js'
import { createDashboard } from '../src/elements/dashboard.js'

// A just-enough DOM: elements with attributes and children, and a grid that
// keeps the part of <ts-grid>'s contract the dashboard builds on. `touched`
// records every property read or written through the proxies, so a test can
// assert that no `_` member is used.
const touched = new Set()
const spy = (obj) =>
  new Proxy(obj, {
    get(t, k, r) {
      if (typeof k === 'string') touched.add(k)
      return Reflect.get(t, k, r)
    },
    set(t, k, v, r) {
      if (typeof k === 'string') touched.add(k)
      return Reflect.set(t, k, v, r)
    },
  })

class FakeEl extends EventTarget {
  constructor(tag) {
    super()
    this.localName = tag
    this.attrs = new Map()
    this.children = []
    this.parentElement = null
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)) }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null }
  appendChild(el) {
    el.parentElement = this
    this.children.push(el)
    if (el.onConnect && this.isConnected) el.onConnect()
    return el
  }
  get isConnected() { return this.parentElement === null ? this === doc.body : this.parentElement.isConnected }
  remove() {
    if (!this.parentElement) return
    const list = this.parentElement.children
    list.splice(list.indexOf(this), 1)
    this.parentElement = null
  }
}

class FakeGrid extends FakeEl {
  constructor() {
    super('ts-grid')
    this.held = readLayout([]).layout
    this.addTypes = null
    this.catalog = undefined
    this.connected = 0
  }
  get layout() { return this.held }
  set layout(v) { this.held = readLayout(v === undefined ? [] : v, { unknown: 'keep', catalog: this.catalog }).layout }
  get hiddenItems() {
    const shown = new Set(this.held.profiles.market.map((i) => i.id))
    return this.children.filter((c) => !shown.has(c.getAttribute('item'))).map((c) => ({ id: c.getAttribute('item') }))
  }
  onConnect() { this.connected++ }
  // What the grid does when a user removes a tile: the item leaves the layout, the child stays.
  removeItem(id) {
    const market = this.held.profiles.market.filter((i) => i.id !== id)
    this.held = { ...this.held, profiles: { ...this.held.profiles, market } }
    this.dispatchEvent(new CustomEvent('ts-layout-change', { detail: { reason: 'remove', id } }))
  }
  // What grid.add() does: ask, and wait for the host to answer with a child.
  add(type, id) {
    const event = new CustomEvent('ts-add-request', { detail: { type, id, size: 'S' }, cancelable: true })
    this.dispatchEvent(event)
    return event
  }
}

const doc = {
  body: new FakeEl('body'),
  elements: new Map(),
  createElement(tag) { return tag === 'ts-grid' ? spy(new FakeGrid()) : spy(new FakeEl(tag)) },
  querySelector(sel) { return sel === '#app' ? app : null },
}
let app
let warnings
let realWarn

beforeEach(() => {
  resetWarnings()
  touched.clear()
  globalThis.document = doc
  doc.body = new FakeEl('body')
  app = new FakeEl('div')
  doc.body.appendChild(app)
  warnings = []
  realWarn = console.warn
  console.warn = (m) => warnings.push(String(m))
})
afterEach(() => {
  console.warn = realWarn
  delete globalThis.document
})

const item = (id, extra = {}) => ({ id, size: 'S', ...extra })
const tiles = (grid) => grid.children.map((c) => `${c.localName}#${c.getAttribute('item')}`)

describe('createDashboard', () => {
  test('makes a grid and one child per item with its tag, item and data', () => {
    const today = { pnl: 120 }
    const dash = createDashboard(app, {
      layout: [item('todayPnl'), item('revenue', { type: 'metric' })],
      data: { todayPnl: today, revenue: { value: 5 } },
      locale: 'en-IN',
      currency: 'INR',
      timeZone: 'Asia/Kolkata',
      persist: 'dash',
      label: 'Desk',
    })
    const { grid } = dash
    assert.equal(grid.localName, 'ts-grid')
    assert.equal(grid.parentElement, app)
    assert.deepEqual(['locale', 'currency', 'time-zone', 'persist', 'aria-label'].map((k) => grid.getAttribute(k)), ['en-IN', 'INR', 'Asia/Kolkata', 'dash', 'Desk'])
    assert.deepEqual(tiles(grid), ['ts-today-pnl#todayPnl', 'ts-metric#revenue'])
    assert.equal(grid.children[0].data, today)
    assert.equal(grid.addTypes, '*')
  })

  test('a tile without data gets none, and addTypes can be a list or null', () => {
    const a = createDashboard(app, { layout: [item('metric')], addTypes: ['card'] })
    assert.equal(a.grid.children[0].data, undefined)
    assert.deepEqual(a.grid.addTypes, ['card'])
    assert.equal(createDashboard(app, { layout: [], addTypes: null }).grid.addTypes, null)
  })

  test('an id in two profiles and the top strip has one child', () => {
    const layout = {
      version: 1,
      device: 'desktop',
      profiles: { market: [item('metric'), item('card')], closed: [item('metric'), item('table')], review: [item('card')] },
      topStrip: ['metric', 'card'],
    }
    const { grid } = createDashboard(app, { layout })
    assert.deepEqual(tiles(grid).sort(), ['ts-card#card', 'ts-metric#metric', 'ts-table#table'])
  })

  test('uses the catalog option, an object or a function', () => {
    const catalog = { acme: { tag: 'acme-mrr', label: 'MRR', sizes: ['S'] } }
    assert.deepEqual(tiles(createDashboard(app, { layout: [item('acme')], catalog }).grid), ['acme-mrr#acme'])
    const fn = (it) => (it.id === 'x' ? { tag: 'x-tile', label: 'X', sizes: ['S'] } : null)
    const dash = createDashboard(app, { layout: [item('x')], catalog: fn })
    assert.deepEqual(tiles(dash.grid), ['x-tile#x'])
    assert.equal(dash.grid.catalog, fn)
  })

  test('a selector target resolves; a missing one throws naming it', () => {
    const dash = createDashboard('#app', { layout: [] })
    assert.equal(dash.grid.parentElement, app)
    assert.throws(() => createDashboard('#nope', { layout: [] }), (e) => e instanceof TypeError && e.message.includes('#nope'))
    assert.throws(() => createDashboard(null, { layout: [] }), TypeError)
  })

  test('does not clear what the target already holds', () => {
    app.appendChild(new FakeEl('p'))
    createDashboard(app, { layout: [] })
    assert.deepEqual(app.children.map((c) => c.localName), ['p', 'ts-grid'])
  })

  test('without a DOM it throws first', () => {
    delete globalThis.document
    assert.throws(() => createDashboard('#app', {}), (e) => e instanceof TypeError && e.message === 'createDashboard needs a DOM')
  })

  test('an unknown type is skipped with one warning', () => {
    const { grid } = createDashboard(app, { layout: [item('ghost'), item('metric')] })
    assert.deepEqual(tiles(grid), ['ts-metric#metric'])
    assert.equal(warnings.filter((w) => w.includes('"ghost"')).length, 1)
  })

  test('data for an id with no item warns in development and is ignored', () => {
    const { grid } = createDashboard(app, { layout: [item('metric')], data: { metric: 1, nope: 2 } })
    assert.equal(grid.children.length, 1)
    assert.equal(warnings.filter((w) => w.includes('"nope"')).length, 1)
  })
})

describe('a second call on one target', () => {
  test('appends a second grid and warns once; after destroy() it is silent', () => {
    const a = createDashboard(app, { layout: [] })
    const b = createDashboard(app, { layout: [] })
    assert.equal(app.children.filter((c) => c.localName === 'ts-grid').length, 2)
    assert.equal(warnings.filter((w) => w.includes('already holds')).length, 1)
    a.destroy()
    b.destroy()
    resetWarnings()
    warnings.length = 0
    createDashboard(app, { layout: [] })
    assert.equal(warnings.length, 0)
  })
})

describe('missing layout', () => {
  test('warns in development and builds an empty grid', () => {
    const dash = createDashboard(app, {})
    assert.equal(dash.grid.children.length, 0)
    assert.equal(warnings.filter((w) => w.includes('no layout')).length, 1)
  })
})

describe('set and update', () => {
  test('update() sets only the ids named, in key order, and leaves other data alone', () => {
    const a = { v: 1 }
    const b = { v: 2 }
    const dash = createDashboard(app, { layout: [item('metric'), item('card'), item('table')], data: { metric: a, card: b } })
    const [metric, card, table] = dash.grid.children
    const next = { v: 3 }
    dash.update({ metric: next })
    assert.equal(metric.data, next)
    assert.equal(card.data, b)
    assert.equal(table.data, undefined)
    const order = []
    for (const el of [metric, card]) Object.defineProperty(el, 'data', { set: () => order.push(el.getAttribute('item')), configurable: true })
    dash.update({ card: 1, metric: 2 })
    assert.deepEqual(order, ['card', 'metric'])
  })

  test('set() returns true for a tile and false, with a warning, for an unknown id', () => {
    const dash = createDashboard(app, { layout: [item('metric')] })
    assert.equal(dash.set('metric', 7), true)
    assert.equal(dash.grid.children[0].data, 7)
    assert.equal(dash.set('missing', 1), false)
    assert.equal(warnings.length, 1)
  })

  test('unknown ids in update() warn once each and the rest still apply', () => {
    const dash = createDashboard(app, { layout: [item('metric')] })
    dash.update({ a: 1, metric: 5, b: 2 })
    dash.update({ a: 1, b: 2 })
    assert.equal(dash.grid.children[0].data, 5)
    assert.equal(warnings.filter((w) => w.includes('"a"')).length, 1)
    assert.equal(warnings.filter((w) => w.includes('"b"')).length, 1)
  })

  test('data for an id with no tile yet is kept for a later add request', () => {
    const dash = createDashboard(app, { layout: [item('metric')] })
    assert.equal(dash.update({ 'card-2': { text: 'early' } }), undefined)
    assert.equal(warnings.filter((w) => w.includes('"card-2"')).length, 1)
    dash.grid.add('card', 'card-2')
    const child = dash.grid.children.find((c) => c.getAttribute('item') === 'card-2')
    assert.deepEqual(child.data, { text: 'early' })
  })

  test('inherited names are not ids', () => {
    const dash = createDashboard(app, { layout: [item('metric')] })
    assert.equal(dash.set('toString', 1), false)
    assert.equal(dash.set('__proto__', 1), false)
  })
})

describe('before ts-grid is defined', () => {
  afterEach(() => { delete globalThis.customElements })

  test('layout and tiles wait for the tag, so a bare array and the top strip survive', async () => {
    let define
    const defined = new Promise((resolve) => { define = resolve })
    let ready = false
    globalThis.customElements = {
      get: (tag) => (tag === 'ts-grid' && !ready ? undefined : class {}),
      whenDefined: () => defined,
    }
    const dash = createDashboard(app, { layout: { profiles: { market: [item('metric'), item('card')] }, topStrip: ['card'] }, data: { metric: 1 } })
    assert.equal(dash.grid.parentElement, app)
    assert.equal(dash.grid.children.length, 0)
    assert.equal(dash.grid.layout.profiles.market.length, 0)
    ready = true
    define()
    await defined
    await Promise.resolve()
    assert.deepEqual(tiles(dash.grid), ['ts-metric#metric', 'ts-card#card'])
    assert.deepEqual(dash.grid.layout.topStrip, ['card'])
    assert.equal(dash.grid.children[0].data, 1)
  })

  test('destroy() before the tag is defined leaves nothing to build', async () => {
    let define
    const defined = new Promise((resolve) => { define = resolve })
    globalThis.customElements = { get: () => undefined, whenDefined: () => defined }
    const dash = createDashboard(app, { layout: [item('metric')] })
    dash.destroy()
    define()
    await defined
    await Promise.resolve()
    assert.equal(dash.grid.children.length, 0)
    assert.equal(app.children.includes(dash.grid), false)
  })
})

describe('add requests', () => {
  test('a catalog type in addTypes is prevented and answered with a child', () => {
    const dash = createDashboard(app, { layout: [item('metric')], data: { 'card-2': { text: 'kept' } } })
    const event = dash.grid.add('card', 'card-2')
    assert.equal(event.defaultPrevented, true)
    const child = dash.grid.children.find((c) => c.getAttribute('item') === 'card-2')
    assert.equal(child.localName, 'ts-card')
    assert.deepEqual(child.data, { text: 'kept' })
    assert.equal(dash.set('card-2', 3), true)
  })

  test('a type outside addTypes, or not in the catalog, is left alone', () => {
    const dash = createDashboard(app, { layout: [], addTypes: ['metric'] })
    assert.equal(dash.grid.add('card', 'card').defaultPrevented, false)
    assert.equal(dash.grid.add('metric', 'metric').defaultPrevented, true)
    const all = createDashboard(app, { layout: [] })
    assert.equal(all.grid.add('nonesuch', 'n').defaultPrevented, false)
    const none = createDashboard(app, { layout: [], addTypes: null })
    assert.equal(none.grid.add('card', 'c').defaultPrevented, false)
    assert.equal(none.grid.children.length, 0)
  })

  test('follows addTypes changed on the grid after creation', () => {
    const dash = createDashboard(app, { layout: [] })
    dash.grid.addTypes = ['card']
    assert.equal(dash.grid.add('metric', 'm').defaultPrevented, false)
  })

  test('an id the dashboard already has gets no second child', () => {
    const dash = createDashboard(app, { layout: [item('metric')] })
    dash.grid.add('metric', 'metric')
    assert.equal(dash.grid.children.length, 1)
  })
})

describe('removed tiles and restored layouts', () => {
  test('a removed item keeps its hidden child and its data, and set() still reaches it', () => {
    const data = { v: 1 }
    const dash = createDashboard(app, { layout: [item('metric'), item('card')], data: { metric: data } })
    const metric = dash.grid.children[0]
    dash.grid.removeItem('metric')
    assert.equal(dash.grid.children.includes(metric), true)
    assert.deepEqual(dash.grid.hiddenItems, [{ id: 'metric' }])
    assert.equal(metric.data, data)
    const fresh = { v: 2 }
    assert.equal(dash.set('metric', fresh), true)
    assert.equal(metric.data, fresh)
  })

  test('children appear for ids that only a restored layout holds, once each', () => {
    const dash = createDashboard(app, { layout: [item('metric')], data: { 'card-2': 9 } })
    dash.grid.layout = [item('metric'), item('card-2', { type: 'card' })]
    dash.grid.dispatchEvent(new CustomEvent('ts-columns-change', { detail: { initial: true } }))
    dash.grid.dispatchEvent(new CustomEvent('ts-layout-change', { detail: {} }))
    assert.deepEqual(tiles(dash.grid), ['ts-metric#metric', 'ts-card#card-2'])
    assert.equal(dash.grid.children[1].data, 9)
  })
})

describe('destroy', () => {
  test('removes the grid and the listeners, and is idempotent', () => {
    const dash = createDashboard(app, { layout: [item('metric')] })
    const { grid } = dash
    dash.destroy()
    dash.destroy()
    assert.equal(grid.parentElement, null)
    assert.equal(app.children.includes(grid), false)
    // The listeners are gone: a request now is not taken and no child is made.
    const before = grid.children.length
    assert.equal(grid.add('card', 'card').defaultPrevented, false)
    assert.equal(grid.children.length, before)
  })

  test('afterwards set returns false and update does nothing, with a warning each', () => {
    const dash = createDashboard(app, { layout: [item('metric')] })
    const metric = dash.grid.children[0]
    dash.destroy()
    assert.equal(dash.set('metric', 1), false)
    dash.update({ metric: 2 })
    assert.equal(metric.data, undefined)
    assert.equal(warnings.length, 2)
  })
})

describe('the grid contract', () => {
  test('touches no underscore member of the grid or its children', () => {
    const dash = createDashboard(app, { layout: [item('metric')], data: { metric: 1 } })
    dash.update({ metric: 2 })
    dash.grid.add('card', 'card')
    dash.destroy()
    assert.deepEqual([...touched].filter((k) => k.startsWith('_')), [])
  })

  test('the source uses no underscore member and imports no grid internals', () => {
    const source = readFileSync(new URL('../src/elements/dashboard.js', import.meta.url), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    assert.deepEqual(code.match(/\.\s*_[A-Za-z]/g), null)
    const imports = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1])
    assert.deepEqual(imports.sort(), ['../core/index.js', './dev.js', './registry.js'])
  })

  test('imports without a DOM', async () => {
    delete globalThis.document
    const mod = await import('../src/elements/dashboard.js?no-dom')
    assert.equal(typeof mod.createDashboard, 'function')
  })
})
