import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Tests for the worked example in docs/guide/custom-widgets.md. `npm test` runs
// them (node --test examples/custom-widget/*.test.mjs, with no install), so this
// file imports only from the repo's src/ (through mrr.js) and from node:*.
//
// Rendering needs a DOM. The library's own tests share test/fake-dom.mjs, but a
// widget author's test can't import from test/, and src/ has no such helper,
// so the few classes the base class touches are written out below. A test of
// your own widget can copy them as they are.

class FakeNode {
  constructor() {
    this.attrs = new Map()
    this.textContent = ''
    this.htmlWrites = 0
    this.html = ''
    this.kids = new Map()
    this.listeners = new Map()
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v))
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null
  }
  removeAttribute(k) {
    this.attrs.delete(k)
  }
  toggleAttribute(k, force) {
    const on = force === undefined ? !this.attrs.has(k) : Boolean(force)
    if (on) this.setAttribute(k, '')
    else this.removeAttribute(k)
    return on
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type).push(fn)
  }
  // Runs the listeners for `type`, like an event arriving at this node.
  dispatch(type, event) {
    for (const fn of this.listeners.get(type) || []) fn(event)
  }
  // New markup means new descendants. Until the next write, one selector gives
  // one node, so a test reads what a render put there. Only a [data-k="…"] or
  // [data-action="…"] that is in the markup resolves; anything else is null, as in a
  // browser, so a typo or a node the template lacks fails the test that reads it.
  set innerHTML(v) {
    this.html = v
    this.htmlWrites++
    this.kids.clear()
  }
  get innerHTML() {
    return this.html
  }
  querySelector(sel) {
    const m = /^\[(data-k|data-action)="([\w-]+)"\]$/.exec(sel)
    if (!m || !this.html.includes(`${m[1]}="${m[2]}"`)) return null
    if (!this.kids.has(sel)) this.kids.set(sel, new FakeNode())
    return this.kids.get(sel)
  }
}

class FakeRoot extends FakeNode {
  constructor() {
    super()
    this.section = new FakeNode()
  }
  // Everything inside the shadow root is inside the tile, so what update() writes
  // through this.$() is what a test reads back from the tile.
  querySelector(sel) {
    return sel === '.tile' ? this.section : this.section.querySelector(sel)
  }
}

class FakeElement extends EventTarget {
  constructor() {
    super()
    this.attrs = new Map()
    this.isConnected = false
    this.parentElement = null
    this.localName = 'x-fake'
  }
  attachShadow() {
    this.shadowRoot = new FakeRoot()
    return this.shadowRoot
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null
  }
  hasAttribute(k) {
    return this.attrs.has(k)
  }
  setAttribute(k, v) {
    const old = this.getAttribute(k)
    this.attrs.set(k, String(v))
    // A real element only calls this for the attributes it observes.
    if (this.constructor.observedAttributes.includes(k)) this.attributeChangedCallback(k, old, String(v))
  }
  removeAttribute(k) {
    const old = this.getAttribute(k)
    this.attrs.delete(k)
    if (this.constructor.observedAttributes.includes(k)) this.attributeChangedCallback(k, old, null)
  }
  connect() {
    this.isConnected = true
    this.connectedCallback()
  }
}

class FakeRegistry {
  constructor() {
    this.map = new Map()
  }
  get(tag) {
    return this.map.get(tag)
  }
  define(tag, ctor) {
    this.map.set(tag, ctor)
  }
}

// Resolves after the microtask a render is batched into has run.
const tick = () => new Promise((resolve) => setImmediate(resolve))

// Installed before the widget is imported: the base class takes HTMLElement
// when its module first loads.
const registry = new FakeRegistry()
globalThis.HTMLElement = FakeElement
globalThis.customElements = registry
// The base class listens for the tab becoming visible; here the tab always is.
globalThis.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }

const { AcmeMrr, mrrModel, MESSAGES } = await import('./mrr.js')
const { createFormatter, configure } = await import('../../src/core/index.js')
const { translator } = await import('../../src/elements/messages-cache.js')
const { defineWidget, widgetCatalog, escapeHtml, scale, linePaths } = await import('../../src/elements/index.js')
const { pickerItems } = await import('../../src/elements/picker-model.js')

const fmt = createFormatter({ locale: 'en-US', currency: 'USD' })
// What an element's `t` is: the host's table (if any) first, then the widget's defaults handed to defineWidget.
const tFor = (host, locale = 'en-US') => translator(host || null, null, null, locale, MESSAGES)
const ctx = (extra = {}) => ({ fmt, t: tFor(), label: 'MRR', ...extra })

// Made-up figures: a fictional SaaS product's recurring revenue, in dollars.
const DATA = { mrr: 48250, previous: 45900, customers: 412, history: [41200, 42900, 44100, 45900, 48250] }

describe('mrrModel, the pure view model', () => {
  test('shows the figure, the change and the sentence a screen reader gets', () => {
    const vm = mrrModel(DATA, 'Wide', ctx())
    assert.equal(vm.value, '$48,250')
    assert.equal(vm.delta, '+5.1%')
    assert.equal(vm.arrow, '▲')
    assert.equal(vm.tone, 'pos')
    assert.equal(vm.customers, '412 customers')
    assert.equal(vm.ariaLabel, 'MRR, $48,250, up 5.1% on last month')
  })

  test('a fall carries its own sign, arrow and tone, not only a colour', () => {
    const vm = mrrModel({ mrr: 44100, previous: 45900 }, 'Wide', ctx())
    assert.equal(vm.delta, '−3.9%')
    assert.equal(vm.arrow, '▼')
    assert.equal(vm.tone, 'neg')
    assert.equal(vm.ariaLabel, 'MRR, $44,100, down 3.9% on last month')
  })

  test('S goes compact when the figure would not fit, and the spoken name keeps all of it', () => {
    const vm = mrrModel({ mrr: 1248500, previous: 1200000 }, 'S', ctx())
    assert.equal(vm.value, '$1.2M')
    assert.match(vm.ariaLabel, /^MRR, \$1,248,500, up /)
  })

  test('no previous month, or a zero one, shows no change rather than an infinity', () => {
    for (const previous of [undefined, 0, 'n/a']) {
      const vm = mrrModel({ mrr: 48250, previous }, 'Wide', ctx())
      assert.equal(vm.delta, '')
      assert.equal(vm.arrow, '')
      assert.equal(vm.ariaLabel, 'MRR, $48,250')
    }
  })

  test('a change that rounds to nothing has no arrow', () => {
    const vm = mrrModel({ mrr: 48250, previous: 48250 }, 'Wide', ctx())
    assert.equal(vm.arrow, '')
    assert.equal(vm.tone, 'mut')
    assert.equal(vm.ariaLabel, 'MRR, $48,250, no change on last month')
  })

  test('an unreadable figure is a dash, and nothing throws', () => {
    for (const data of [{}, { mrr: 'abc' }, { mrr: null, previous: 5 }]) {
      const vm = mrrModel(data, 'M', ctx())
      assert.equal(vm.value, '—')
      assert.equal(vm.delta, '')
      assert.equal(vm.ariaLabel, 'MRR')
    }
  })

  test('M draws the history as a line, and counts what it could not read', () => {
    const vm = mrrModel({ ...DATA, history: [41200, 'oops', 44100, 48250] }, 'M', ctx())
    assert.match(vm.line, /^M[\d. ]+( L[\d. ]+){2}$/)
    assert.equal(vm.dropped, 1)
    assert.equal(vm.sparkLabel, 'MRR trend, from $41,200 to $48,250')
    // The sizes without a chart draw none.
    assert.equal(mrrModel(DATA, 'Wide', ctx()).line, '')
  })

  test('one reading is not a trend, so there is no line', () => {
    assert.equal(mrrModel({ ...DATA, history: [48250] }, 'M', ctx()).line, '')
    assert.equal(mrrModel({ ...DATA, history: [] }, 'M', ctx()).line, '')
  })

  test('a host that translates a sentence gets its words; the rest stay English', () => {
    const t = tFor({ 'acme-mrr.up': 'en hausse de {delta}' }, 'fr')
    const vm = mrrModel(DATA, 'Wide', ctx({ t }))
    assert.equal(vm.ariaLabel, 'MRR, $48,250, en hausse de 5.1%')
    assert.equal(mrrModel({ mrr: 1, previous: 2 }, 'Wide', ctx({ t })).ariaLabel, 'MRR, $1, down 50.0% on last month')
  })

  test('the direction comes from the number, so a locale that writes signs and digits differently still gets its arrow', () => {
    const ar = createFormatter({ locale: 'ar-EG', currency: 'USD' })
    const rise = mrrModel(DATA, 'Wide', ctx({ fmt: ar }))
    // The text is not "+5.1%": an invisible mark comes first and the digits are Arabic-Indic.
    assert.ok(!rise.delta.startsWith('+'), `expected a localised sign, got ${rise.delta}`)
    assert.equal(rise.arrow, '▲')
    assert.equal(rise.tone, 'pos')
    assert.match(rise.ariaLabel, /, up /)
    const fall = mrrModel({ mrr: 44100, previous: 45900 }, 'Wide', ctx({ fmt: ar }))
    assert.equal(fall.arrow, '▼')
    assert.equal(fall.tone, 'neg')
    assert.match(fall.ariaLabel, /, down /)
    // A change that shows as zero is flat in every locale.
    assert.equal(mrrModel({ mrr: 48250, previous: 48249 }, 'Wide', ctx({ fmt: ar })).arrow, '')
    assert.equal(mrrModel({ mrr: 48250, previous: 48249 }, 'Wide', ctx()).arrow, '')
  })

  test('the customer count is a plural message: English defaults, then the host\'s own forms', () => {
    assert.equal(mrrModel({ mrr: 1, customers: 1 }, 'Wide', ctx()).customers, '1 customer')
    assert.equal(mrrModel({ mrr: 1, customers: 412 }, 'Wide', ctx()).customers, '412 customers')
    assert.equal(mrrModel({ mrr: 1, customers: 112412 }, 'Wide', ctx()).customers, '112.4K customers')
    const pl = tFor({ 'acme-mrr.customers.one': '{count} klient', 'acme-mrr.customers.few': '{count} klientów', 'acme-mrr.customers.other': '{count} klientów' }, 'pl')
    assert.equal(mrrModel({ mrr: 1, customers: 1 }, 'Wide', ctx({ t: pl })).customers, '1 klient')
    assert.equal(mrrModel({ mrr: 1, customers: 3 }, 'Wide', ctx({ t: pl })).customers, '3 klientów')
    // A host that gives only .other is not answered with the English .one.
    const other = tFor({ 'acme-mrr.customers.other': '{count} Kunden' }, 'de')
    assert.equal(mrrModel({ mrr: 1, customers: 1 }, 'Wide', ctx({ t: other })).customers, '1 Kunden')
  })

  test('every string comes through a message key a host can override, none from the model\'s own words', () => {
    const everything = Object.fromEntries(
      ['up', 'down', 'flat', 'trend', 'breakdown', 'customers.one', 'customers.other'].map((k) => [`acme-mrr.${k}`, `«${k}»`]),
    )
    const vm = mrrModel(DATA, 'M', ctx({ t: tFor(everything) }))
    assert.equal(vm.ariaLabel, 'MRR, $48,250, «up»')
    assert.equal(vm.sparkLabel, '«trend»')
    assert.equal(vm.more, '«breakdown»')
    assert.equal(vm.customers, '«customers.other»')
  })

  test('no template holds a word: markup only, the text is written by update()', () => {
    for (const variant of ['S', 'Wide', 'M']) {
      assert.equal(AcmeMrr.template(variant).replace(/<[^>]*>/g, '').trim(), '', variant)
    }
  })

  test('is a pure function: the same data twice gives the same model, and the data is not touched', () => {
    const data = structuredClone(DATA)
    assert.deepEqual(mrrModel(data, 'M', ctx()), mrrModel(data, 'M', ctx()))
    assert.deepEqual(data, DATA)
  })
})

  // What the picker and the layout list build their translator from: configure()'s table only, no element.
  const entry = (host) => {
    const t = translator(host || null, null, null, 'en-US')
    return pickerItems({ catalog: widgetCatalog(), addTypes: ['acme-mrr'], t, locale: 'en-US' })[0].items[0]
  }

describe('registration', () => {
  test('defineWidget defined the tag and recorded the spec under its type', () => {
    assert.equal(registry.get('acme-mrr'), AcmeMrr)
    const spec = widgetCatalog()['acme-mrr']
    assert.equal(spec.tag, 'acme-mrr')
    // The class gives no label and the catalog copies none: the grid and the picker ask t('widget.acme-mrr.label'),
    // so a host's translation of it reaches them. The author's 'MRR' answers when the host says nothing.
    assert.equal(spec.label, '')
    assert.deepEqual([...spec.sizes], ['S', 'Wide', 'M'])
    assert.equal(spec.category, 'Revenue')
    // Built-in types are still there, untouched.
    assert.equal(widgetCatalog().todayPnl.tag, 'ts-today-pnl')
  })

  test('the picker shows the author\'s label and description, and a host\'s override of either wins', () => {
    const plain = entry()
    assert.equal(plain.label, 'MRR')
    assert.equal(plain.description, 'Monthly recurring revenue and its change on last month.')
    const host = entry({ 'widget.acme-mrr.label': 'MRR (monatlich)', 'widget.acme-mrr.description': 'Monatlicher Umsatz.' })
    assert.equal(host.label, 'MRR (monatlich)')
    assert.equal(host.description, 'Monatlicher Umsatz.')
  })

  test('evaluating the module again makes a new class; the guard keeps the first instead of throwing', async () => {
    const again = await import('./mrr.js?evaluated-again')
    assert.notEqual(again.AcmeMrr, AcmeMrr)
    assert.equal(registry.get('acme-mrr'), AcmeMrr)
    assert.throws(() => defineWidget('acme-mrr', again.AcmeMrr, { type: 'acme-mrr' }), /already recorded by another class/)
  })
})

describe('the element', () => {
  let ids = 0

  const make = async (attrs = {}) => {
    const el = new AcmeMrr()
    el.localName = `acme-mrr-${++ids}`
    // currency and locale are the host's to set, on the widget or its grid.
    for (const [k, v] of Object.entries({ currency: 'USD', locale: 'en-US', ...attrs })) el.setAttribute(k, v)
    el.connect()
    await tick()
    return el
  }
  const section = (el) => el.shadowRoot.section
  const text = (el, k) => section(el).querySelector(`[data-k="${k}"]`).textContent

  test('is a skeleton until it has data, then the tile', async () => {
    const el = await make()
    assert.match(section(el).html, /class="sk /)
    el.data = DATA
    await tick()
    assert.match(section(el).html, /data-k="value"/)
    assert.equal(text(el, 'label'), 'MRR')
    assert.equal(text(el, 'value'), '$48,250')
    assert.equal(text(el, 'delta'), '+5.1%')
    assert.equal(section(el).getAttribute('aria-label'), 'MRR, $48,250, up 5.1% on last month')
  })

  test('speaks its registered English with no configure() call, and a host override of the same key wins', async () => {
    const el = await make({ size: 'M' })
    el.data = DATA
    el.actions = ['breakdown']
    await tick()
    assert.equal(text(el, 'more'), 'Breakdown')
    assert.equal(text(el, 'customers'), '412 customers')
    el.messages = { 'acme-mrr.breakdown': 'Détail' }
    await tick()
    assert.equal(text(el, 'more'), 'Détail')
    assert.equal(text(el, 'customers'), '412 customers')
    el.messages = null
    configure({ messages: { 'acme-mrr.breakdown': 'Aufschlüsselung', 'widget.acme-mrr.label': 'MRR (monatlich)' } })
    try {
      await tick()
      assert.equal(text(el, 'more'), 'Aufschlüsselung')
      assert.equal(text(el, 'label'), 'MRR (monatlich)')
    } finally {
      configure({ messages: null })
    }
  })

  test('a host\'s label override shows on the tile and in the picker alike', async () => {
    configure({ messages: { 'widget.acme-mrr.label': 'MRR (monatlich)' } })
    try {
      const el = await make()
      el.data = DATA
      await tick()
      assert.equal(el.label, 'MRR (monatlich)')
      assert.equal(text(el, 'label'), 'MRR (monatlich)')
      assert.equal(entry({ 'widget.acme-mrr.label': 'MRR (monatlich)' }).label, el.label)
    } finally {
      configure({ messages: null })
    }
  })

  test('a subclass of the registered widget keeps the defaults', async () => {
    class Sub extends AcmeMrr {}
    registry.define('acme-mrr-sub', Sub)
    const el = new Sub()
    el.localName = 'acme-mrr-sub-1'
    el.setAttribute('currency', 'USD')
    el.setAttribute('locale', 'en-US')
    el.connect()
    el.data = DATA
    await tick()
    assert.equal(text(el, 'label'), 'MRR')
    assert.equal(el.label, 'MRR')
  })

  test('new numbers change in place: the markup is written once, only the text moves', async () => {
    const el = await make({ size: 'Wide' })
    el.data = DATA
    await tick()
    const writes = section(el).htmlWrites
    const value = section(el).querySelector('[data-k="value"]')
    el.data = { ...DATA, mrr: 48910 }
    await tick()
    assert.equal(section(el).htmlWrites, writes)
    assert.equal(section(el).querySelector('[data-k="value"]'), value)
    assert.equal(value.textContent, '$48,910')
    assert.equal(text(el, 'delta'), '+6.6%')
  })

  test('the change is signed and toned', async () => {
    const el = await make({ size: 'Wide' })
    el.data = { mrr: 44100, previous: 45900 }
    await tick()
    assert.equal(text(el, 'arrow'), '▼')
    assert.equal(text(el, 'delta'), '−3.9%')
    assert.equal(section(el).querySelector('[data-k="change"]').getAttribute('class'), 'sm n nv neg')
  })

  test('M draws the line and hides the chart when there is none to draw', async () => {
    const el = await make({ size: 'M' })
    el.data = DATA
    await tick()
    assert.match(section(el).querySelector('[data-k="line"]').getAttribute('d'), /^M/)
    assert.equal(section(el).querySelector('[data-k="spark"]').getAttribute('hidden'), null)
    assert.equal(section(el).querySelector('[data-k="spark"]').getAttribute('aria-label'), 'MRR trend, from $41,200 to $48,250')
    el.data = { mrr: 48250 }
    await tick()
    assert.equal(section(el).querySelector('[data-k="spark"]').getAttribute('hidden'), '')
  })

  test('null is the empty state with the widget\'s own words', async () => {
    const el = await make()
    el.data = null
    await tick()
    assert.equal(text(el, 'empty'), 'No revenue data yet')
  })

  test('the empty text is a message too: the host\'s override wins over the author\'s', async () => {
    const el = await make()
    el.data = null
    await tick()
    el.messages = { 'widget.acme-mrr.empty': 'Noch keine Umsatzdaten' }
    await tick()
    assert.equal(text(el, 'empty'), 'Noch keine Umsatzdaten')
    el.messages = null
    configure({ messages: { 'widget.acme-mrr.empty': 'Pas encore de données' } })
    try {
      await tick()
      assert.equal(text(el, 'empty'), 'Pas encore de données')
    } finally {
      configure({ messages: null })
    }
  })

  test('an unsupported size snaps to one the spec lists', async () => {
    const el = await make({ size: 'XL' })
    assert.ok(['S', 'Wide', 'M'].includes(el.variant))
  })

  test('the Breakdown button shows only when the host offers the action, and emits it', async () => {
    const el = await make({ size: 'M' })
    el.data = DATA
    await tick()
    const more = section(el).querySelector('[data-k="more"]')
    assert.equal(more.getAttribute('hidden'), '')
    el.actions = ['breakdown']
    await tick()
    assert.equal(more.getAttribute('hidden'), null)
    assert.equal(more.textContent, 'Breakdown')

    const heard = []
    el.addEventListener('ts-action', (e) => heard.push(e.detail))
    el.shadowRoot.dispatch('click', { target: { closest: (sel) => (sel === '[data-action="breakdown"]' ? {} : null) } })
    assert.deepEqual(heard, [{ action: 'breakdown', metric: 'mrr' }])
    // A click anywhere else on the tile does nothing.
    el.shadowRoot.dispatch('click', { target: { closest: () => null } })
    assert.equal(heard.length, 1)
  })
})

describe('the helpers the guide shows', () => {
  test('escapeHtml makes text safe to write into markup', () => {
    assert.equal(escapeHtml(`<b onclick="x()">Fish & 'chips'</b>`), '&lt;b onclick=&quot;x()&quot;&gt;Fish &amp; &#39;chips&#39;&lt;/b&gt;')
    assert.equal(escapeHtml(48250), '48250')
  })

  test('scale maps a domain onto a range, and a flat domain onto the middle', () => {
    const x = scale(0, 4, 4, 236)
    assert.equal(x(0), 4)
    assert.equal(x(2), 120)
    assert.equal(x(4), 236)
    assert.equal(scale(5, 5, 0, 100)(5), 50)
  })

  test('linePaths gives a line, the area under it and the scales it used', () => {
    const points = [0, 1, 2].map((x) => ({ x, y: [10, 30, 20][x] }))
    const { line, area, zeroY, x, y } = linePaths(points, { width: 100, height: 50, pad: 0, includeZero: false })
    assert.equal(line, 'M0 50 L50 0 L100 25')
    assert.equal(area, `${line} L100 ${zeroY} L0 ${zeroY} Z`)
    assert.equal(zeroY, 50)
    assert.equal(x(1), 50)
    assert.equal(y(30), 0)
  })
})

describe('the guide', () => {
  const guide = readFileSync(new URL('../../docs/guide/custom-widgets.md', import.meta.url), 'utf8')
  const source = readFileSync(new URL('./mrr.js', import.meta.url), 'utf8')
  const blocks = [...guide.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1])
  const marked = blocks.filter((b) => b.startsWith('// mrr.js\n')).map((b) => b.slice('// mrr.js\n'.length))

  test('every excerpt marked "// mrr.js" is in mrr.js word for word, so the guide cannot drift from the tested code', () => {
    assert.ok(marked.length >= 6, `the guide has ${marked.length} excerpts of mrr.js`)
    for (const block of marked) assert.ok(source.includes(block), `not in mrr.js:\n${block}`)
  })

  test('has a heading for each part of a widget the story promises', () => {
    const headings = [...guide.matchAll(/^#{2,3} (.+)$/gm)].map((m) => m[1])
    const wanted = {
      'static spec': /^1\. The class and its spec/,
      template: /^2\. The template/,
      viewModel: /^3\. The view model/,
      'numbers in place (update)': /^4\. `update`: numbers change in place/,
      emit: /^5\. `emit`/,
      states: /^6\. States/,
      dataShape: /^7\. `dataShape`/,
      defineWidget: /^8\. Register it: `defineWidget`/,
      'fit()': /^`fit\(\)`/,
      'the catalog': /^Reading the catalog/,
      helpers: /^The helpers/,
    }
    for (const [what, pattern] of Object.entries(wanted)) {
      assert.ok(headings.some((h) => pattern.test(h)), `the guide has no heading for ${what}; headings are:\n${headings.join('\n')}`)
    }
  })

  test('says every way defineWidget throws, and that a listener that throws is logged', () => {
    for (const phrase of ['built-in', '`catalogKey`', 'another class recorded', 'another class already owns', 'recorded under another type', 'no valid size', 'missing or empty `type`', '`console.error`']) {
      assert.ok(guide.includes(phrase), `the guide should mention ${phrase}`)
    }
  })
})
