import { test, describe, before, after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { TsWidget, SHARED_CSS, standaloneCss, resolveFormatOptions, escapeHtml } from '../src/elements/widget.js'
import { configure, WIDGETS } from '../src/core/index.js'
import { resetWarnings } from '../src/elements/dev.js'
import { FakeNode, FakeRoot, FakeElement, FakeDocument, tick } from './fake-dom.mjs'

// This file is loaded with no DOM (fake-dom.mjs installs nothing on import):
// importing widget.js above must not throw.

describe('without a DOM', () => {
  test('importing the module is safe and exports the base class', () => {
    assert.equal(typeof TsWidget, 'function')
    assert.equal(TsWidget.catalogKey, null)
    assert.equal(TsWidget.styles, '')
  })

  test('standalone heights follow rows × row + gaps, per size', () => {
    const css = standaloneCss()
    assert.match(css, /:host\(\[size="S"\]\) \{ height: var\(--ts-row, 150px\); \}/)
    assert.match(css, /:host\(\[size="Banner"\]\) \{ height: var\(--ts-row, 150px\); \}/)
    assert.match(css, /:host\(\[size="M"\]\) \{ height: calc\(2 \* var\(--ts-row, 150px\) \+ 1 \* var\(--ts-gap, 16px\)\); \}/)
    assert.match(css, /:host\(\[size="XL"\]\) \{ height: calc\(2 \*/)
    assert.equal(css.split('\n').length, 7)
  })

  test('the shared CSS uses tokens, never colours', () => {
    assert.doesNotMatch(SHARED_CSS, /#[0-9a-f]{3,8}\b/i)
    assert.doesNotMatch(SHARED_CSS, /\b(rgb|hsl)a?\(/i)
    // Reduced motion removes the live dot's pulse.
    assert.match(SHARED_CSS, /prefers-reduced-motion: reduce\) \{ \.dot\.live \{ animation: none; \} \}/)
  })

  test('the tile is a size container and headline figures scale with it, capped at the design size', () => {
    assert.match(SHARED_CSS, /\.tile \{[^}]*container-type: inline-size;/)
    assert.match(SHARED_CSS, /\.big \{ font-size: min\(34px, \d+(\.\d+)?cqi\);/)
    assert.match(SHARED_CSS, /\.xbig \{ font-size: min\(48px, \d+(\.\d+)?cqi\);/)
    assert.match(SHARED_CSS, /\.md \{ font-size: min\(17px, \d+(\.\d+)?cqi\); \}/)
  })

  test('format options come from the nearest source that sets them', () => {
    const attrs = (o) => ({ getAttribute: (k) => (k in o ? o[k] : null) })
    const own = attrs({ currency: 'USD' })
    const grid = attrs({ locale: 'en-IN', currency: 'INR', 'time-zone': 'Asia/Kolkata' })
    assert.deepEqual(resolveFormatOptions(own, grid), { locale: 'en-IN', currency: 'USD', timeZone: 'Asia/Kolkata' })
    assert.deepEqual(resolveFormatOptions(own, null), { currency: 'USD' })
    assert.deepEqual(resolveFormatOptions(attrs({ locale: '' }), grid).locale, 'en-IN')
    assert.deepEqual(resolveFormatOptions(), {})
  })

  test('escapeHtml escapes markup and quotes', () => {
    assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;')
  })
})

describe('rendering', () => {
  let Widget
  let Demo
  let log
  before(async () => {
    globalThis.HTMLElement = FakeElement
    globalThis.document = new FakeDocument()
    // A fresh instance of the module, so it extends the fake HTMLElement.
    Widget = (await import('../src/elements/widget.js?fake-dom')).TsWidget
    delete globalThis.HTMLElement
    Demo = class extends Widget {
      static catalogKey = 'todayPnl'
      static template(variant) {
        this.log.templates.push(variant)
        return `<b class="v">${variant}</b>`
      }
      static viewModel(data, variant, ctx) {
        this.log.contexts.push(ctx)
        if (data.boom) throw new Error('boom')
        return { text: `${data.n}@${variant}`, ariaLabel: data.aria }
      }
      update(vm) {
        this.log.updates.push(vm.text)
        this.log.nodes.push(this.$('.v'))
      }
    }
  })
  afterEach(() => globalThis.document.reset())
  after(() => {
    delete globalThis.document
  })

  const make = (attrs = {}) => {
    log = { templates: [], updates: [], contexts: [], nodes: [] }
    // A subclass each time: templates are cached per class.
    const Cls = class extends Demo {}
    Cls.log = log
    const el = new Cls()
    el.log = log
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    return el
  }
  const section = (el) => el.shadowRoot.section

  test('opens a shadow root with the shared styles and a labelled tile', () => {
    const el = make()
    assert.match(el.shadowRoot.html, /^<style>[\s\S]*\.tile \{[\s\S]*<\/style><section class="tile" part="tile"><\/section>$/)
  })

  // Later element tests rely on this wiring of the shared harness.
  test('the shared fake DOM: the element is a FakeElement, its root a FakeRoot and its tile a FakeNode', () => {
    const el = make()
    assert.ok(el instanceof FakeElement)
    assert.ok(el.shadowRoot instanceof FakeRoot)
    assert.ok(section(el) instanceof FakeNode)
  })

  test('size snaps to the catalog sizes, defaults to the first, and is written back once connected', () => {
    const el = make()
    assert.equal(el.size, 'S')
    assert.equal(el.variant, 'S')
    el.setAttribute('size', 'XL')
    assert.equal(el.size, 'M')
    assert.equal(el.getAttribute('size'), 'XL', 'a detached element keeps what it was given')
    el.connect()
    assert.equal(el.getAttribute('size'), 'M')
    el.size = 'Tall'
    assert.ok(['S', 'M'].includes(el.getAttribute('size')))
    el.removeAttribute('size')
    el.connectedCallback()
    assert.equal(el.getAttribute('size'), 'S')
  })

  test('label is the attribute, else the catalog label', () => {
    const el = make()
    assert.equal(el.label, "Today's P&L")
    el.label = 'Net today'
    assert.equal(el.getAttribute('label'), 'Net today')
    assert.equal(el.label, 'Net today')
  })

  test('connecting without data shows the skeleton named by the label', async () => {
    const el = make()
    el.connect()
    await tick()
    assert.match(section(el).html, /class="sk /)
    assert.equal(section(el).getAttribute('aria-label'), "Today's P&L")
    assert.deepEqual(log.updates, [])
  })

  test('many sets in one tick make one render', async () => {
    const el = make()
    el.connect()
    await tick()
    el.data = { n: 1 }
    el.data = { n: 2 }
    el.data = { n: 3 }
    await tick()
    assert.deepEqual(log.updates, ['3@S'])
  })

  test('the DOM is built once per variant; later data only updates it', async () => {
    const el = make()
    el.connect()
    el.data = { n: 1 }
    await tick()
    el.data = { n: 2 }
    await tick()
    el.data = { n: 3 }
    await tick()
    assert.deepEqual(log.templates, ['S'])
    assert.deepEqual(log.updates, ['1@S', '2@S', '3@S'])
    assert.equal(section(el).htmlWrites, 1, 'the template, once')
    // $ hands back the same node while the DOM is kept.
    assert.equal(log.nodes[0], log.nodes[2])

    el.size = 'M'
    await tick()
    assert.deepEqual(log.templates, ['S', 'M'])
    assert.notEqual(log.nodes[2], log.nodes[3], '$ forgets nodes of the old template')
    assert.equal(log.updates.at(-1), '3@M')
  })

  test('leaving the empty state rebuilds the template; going back shows empty again', async () => {
    const el = make()
    el.connect()
    el.data = { n: 1 }
    await tick()
    el.data = null
    await tick()
    assert.match(section(el).html, /No data/)
    el.data = { n: 2 }
    await tick()
    // template() itself is cached per variant, but the markup is written again.
    assert.deepEqual(log.templates, ['S'])
    assert.equal(section(el).htmlWrites, 3, 'template, empty state, template')
    assert.match(section(el).html, /<b class="v">S<\/b>/)
  })

  test('aria-label is the view model\'s ariaLabel, else the label', async () => {
    const el = make({ label: 'Mine' })
    el.connect()
    el.data = { n: 1, aria: 'Mine, +1' }
    await tick()
    assert.equal(section(el).getAttribute('aria-label'), 'Mine, +1')
    el.data = { n: 2 }
    await tick()
    assert.equal(section(el).getAttribute('aria-label'), 'Mine')
  })

  test('view models get the formatter, the time from clock, and the label', async () => {
    const el = make()
    el.clock = () => 1234
    el.connect()
    el.data = { n: 1 }
    await tick()
    const ctx = log.contexts[0]
    assert.equal(ctx.now, 1234)
    assert.equal(ctx.label, "Today's P&L")
    assert.equal(typeof ctx.fmt.money, 'function')
    assert.equal(el.now(), 1234)
    el.clock = null
    assert.ok(Math.abs(el.now() - Date.now()) < 1000)
  })

  test('viewContext adds keys to ctx but cannot replace fmt, now or label', async () => {
    const el = make()
    el.viewContext = () => ({ extra: 1, fmt: 'x', now: 'y', label: 'z' })
    el.clock = () => 7
    el.connect()
    el.data = { n: 1 }
    await tick()
    const ctx = log.contexts[0]
    assert.equal(ctx.extra, 1)
    assert.equal(ctx.now, 7)
    assert.equal(ctx.label, "Today's P&L")
    assert.equal(typeof ctx.fmt.money, 'function')
  })

  test('a view model that throws logs once and shows the error view', async (t) => {
    const error = t.mock.method(console, 'error', () => {})
    const el = make()
    el.connect()
    el.data = { boom: true }
    await tick()
    el.data = { boom: true }
    await tick()
    assert.equal(error.mock.callCount(), 1)
    assert.match(section(el).html, /part="error"/)
    el.data = { n: 5 }
    await tick()
    assert.equal(log.updates.at(-1), '5@S')
    el.data = { boom: true }
    await tick()
    assert.equal(error.mock.callCount(), 2, 'a new run of failures logs again')
  })

  test('nothing renders while disconnected; reconnecting renders', async () => {
    const el = make()
    el.data = { n: 1 }
    await tick()
    assert.deepEqual(log.updates, [])
    el.connect()
    await tick()
    assert.deepEqual(log.updates, ['1@S'])
  })

  test('properties set before the element was defined are applied on connect', async () => {
    const el = make()
    delete el.data
    Object.defineProperty(el, 'data', { value: { n: 9 }, configurable: true, writable: true, enumerable: true })
    el.connect()
    await tick()
    assert.deepEqual(log.updates, ['9@S'])
  })

  test('formatter: own attribute, then the nearest ts-grid, then configure()', () => {
    const grid = { localName: 'ts-grid', parentElement: null, getAttribute: (k) => ({ locale: 'en-IN', currency: 'INR' })[k] ?? null }
    const el = make({ currency: 'USD' })
    el.parentElement = { localName: 'div', parentElement: grid, getAttribute: () => null }
    assert.equal(el.formatter.locale, 'en-IN')
    assert.equal(el.formatter.currency, 'USD')
    assert.equal(el.formatter, el.formatter, 'cached')
    const before = el.formatter
    el.setAttribute('currency', 'EUR')
    assert.notEqual(el.formatter, before)
    assert.equal(el.formatter.currency, 'EUR')
    configure({ timeZone: 'Asia/Kolkata' })
    assert.equal(el.formatter.timeZone, 'Asia/Kolkata')
    configure({ timeZone: '' })
  })

  test('emit dispatches a bubbling, composed ts-action', () => {
    const el = make()
    let event
    el.addEventListener('ts-action', (e) => (event = e))
    el.emit('range', { value: '1M' })
    assert.deepEqual(event.detail, { action: 'range', value: '1M' })
    assert.equal(event.bubbles, true)
    assert.equal(event.composed, true)
  })

  describe('every', () => {
    test('re-renders on the period while connected and visible', async (t) => {
      t.mock.timers.enable({ apis: ['setInterval'] })
      const el = make()
      el.connect()
      el.data = { n: 1 }
      await tick()
      el.every(1000)
      t.mock.timers.tick(1000)
      await tick()
      t.mock.timers.tick(2000)
      await tick()
      assert.equal(log.updates.length, 3, 'the first render plus two ticks')
      el.every(0)
      t.mock.timers.tick(5000)
      await tick()
      assert.equal(log.updates.length, 3)
    })

    test('calling every with the same period keeps the timer running', async (t) => {
      t.mock.timers.enable({ apis: ['setInterval'] })
      const el = make()
      el.connect()
      el.data = { n: 1 }
      el.every(1000)
      t.mock.timers.tick(600)
      el.every(1000)
      t.mock.timers.tick(400)
      await tick()
      assert.equal(log.updates.length, 1, 'one render for the tick, merged with the data render')
      t.mock.timers.tick(1000)
      await tick()
      assert.equal(log.updates.length, 2)
    })

    test('pauses while hidden, renders at once on becoming visible, and stops on disconnect', async (t) => {
      t.mock.timers.enable({ apis: ['setInterval'] })
      const el = make()
      el.connect()
      el.data = { n: 1 }
      el.every(1000)
      await tick()
      const base = log.updates.length

      document.visibilityState = 'hidden'
      document.dispatchEvent(new Event('visibilitychange'))
      t.mock.timers.tick(5000)
      await tick()
      assert.equal(log.updates.length, base)

      document.visibilityState = 'visible'
      document.dispatchEvent(new Event('visibilitychange'))
      await tick()
      assert.equal(log.updates.length, base + 1)
      t.mock.timers.tick(1000)
      await tick()
      assert.equal(log.updates.length, base + 2)

      el.disconnect()
      t.mock.timers.tick(5000)
      await tick()
      assert.equal(log.updates.length, base + 2)
    })
  })
})

describe('the spec', () => {
  let Widget
  let warnings
  before(async () => {
    globalThis.HTMLElement = FakeElement
    globalThis.document = new FakeDocument()
    Widget = (await import('../src/elements/widget.js?fake-dom-spec')).TsWidget
    delete globalThis.HTMLElement
    // widget.js above and this fresh copy share dev.js, so one reset serves both.
  })
  afterEach(() => globalThis.document.reset())
  after(() => {
    delete globalThis.document
    mock.restoreAll()
  })

  const make = (statics, localName = 'my-tile') => {
    const Cls = class extends Widget {}
    Object.assign(Cls, statics)
    const el = new Cls()
    el.localName = localName
    return el
  }
  const warn = () => {
    resetWarnings()
    warnings = []
    mock.method(console, 'warn', (m) => warnings.push(m))
  }

  test('a static spec with no catalogKey snaps sizes and names the tile', async () => {
    const el = make({ spec: { label: 'Signups', sizes: ['S', 'Wide'] } })
    el.setAttribute('size', 'M')
    assert.equal(el.size, 'Wide')
    assert.equal(el.label, 'Signups')
    el.connect()
    await tick()
    assert.equal(el.shadowRoot.section.getAttribute('aria-label'), 'Signups')
  })

  test('catalogKey wins over a static spec', () => {
    const el = make({ catalogKey: 'todayPnl', spec: { label: 'Signups', sizes: ['Tall'] } })
    assert.equal(el.spec, WIDGETS.todayPnl)
    assert.equal(el.label, "Today's P&L")
    assert.equal(el.size, 'S')
  })

  test('an unknown catalogKey falls through to the static spec', () => {
    const el = make({ catalogKey: 'nope', spec: { label: 'Mine', sizes: ['Tall'] } })
    assert.equal(el.label, 'Mine')
    assert.deepEqual(el.spec.sizes, ['Tall'])
  })

  test('invalid sizes and labels in a static spec are dropped', () => {
    const el = make({ spec: { label: 7, sizes: ['Huge', 'M', 3, 'S'], phoneRows: { M: 3 } } })
    assert.deepEqual(el.spec, { label: '', sizes: ['M', 'S'], phoneRows: { M: 3 } })
    assert.equal(make({ spec: { sizes: 'S' } }).spec.sizes.length, 0)
  })

  test('with no source the spec is empty and size still resolves', () => {
    for (const el of [make({}), make({ spec: null }), make({ spec: 'x' })]) {
      assert.deepEqual(el.spec, { label: '', sizes: [] })
      assert.equal(el.size, 'S')
    }
  })

  test('a subclass can override the spec getter', () => {
    const Cls = class extends Widget {
      get spec() {
        return { label: this.getAttribute('title') || 'Card', sizes: ['M'] }
      }
    }
    const el = new Cls()
    el.setAttribute('title', 'Revenue')
    assert.equal(el.label, 'Revenue')
    assert.equal(el.size, 'M')
  })

  test('no label anywhere warns once and names the region by its tag', async () => {
    warn()
    const el = make({ spec: { sizes: ['S'] } })
    el.connect()
    await tick()
    el.requestRender()
    await tick()
    assert.equal(el.shadowRoot.section.getAttribute('aria-label'), 'my-tile')
    assert.deepEqual(warnings, ['tickslate: <my-tile> has no label, so its region is named "my-tile". Set a label attribute or static spec.'])
    mock.restoreAll()
  })

  test('a label attribute or a spec label does not warn', async () => {
    warn()
    const a = make({ spec: { sizes: ['S'] } })
    a.setAttribute('label', 'Named')
    const b = make({ spec: { label: 'Also named', sizes: ['S'] } }, 'other-tile')
    for (const el of [a, b]) el.connect()
    await tick()
    assert.deepEqual(warnings, [])
    mock.restoreAll()
  })
})
