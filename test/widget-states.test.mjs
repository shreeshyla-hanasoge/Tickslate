import { test, describe, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { SHARED_CSS, sk } from '../src/elements/widget.js'
import { TsTodayPnl } from '../src/elements/today-pnl.js'
import { TsEquityCurve } from '../src/elements/equity-curve.js'
import { TsSessionClock } from '../src/elements/session-clock.js'
import { EN, WIDGETS } from '../src/core/index.js'
import { FakeElement, FakeDocument, tick } from './fake-dom.mjs'

// Loading, empty and error views (RFC 0002 §2.3, §2.4). Importing the modules
// above needs no DOM; the element tests below install the shared fake one.

describe('static contract, no DOM', () => {
  test('each widget says what an empty state means for it', () => {
    assert.equal(TsTodayPnl.emptyText, 'No trades today')
    assert.equal(TsEquityCurve.emptyText, 'No trading days yet')
    assert.equal(TsSessionClock.emptyText, 'No sessions set up')
  })

  test('every variant of every widget has a skeleton of blocks, with no inline style or colour', () => {
    for (const [Ctor, key] of [[TsTodayPnl, 'todayPnl'], [TsEquityCurve, 'equityCurve'], [TsSessionClock, 'sessionClock']]) {
      for (const variant of WIDGETS[key].sizes) {
        const html = Ctor.skeleton(variant)
        assert.match(html, /class="sk /, `${key} ${variant}`)
        assert.doesNotMatch(html, /style=|#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i, `${key} ${variant}`)
        // The real label: from the base (data-k="label"), or the S tile's own word.
        assert.match(html, /data-k="label"|class="lb ell">Today</, `${key} ${variant} names the tile`)
      }
    }
  })

  test('the default skeleton is a header, a headline bar and two text lines', () => {
    const html = Object.getPrototypeOf(TsTodayPnl).skeleton('S')
    assert.equal((html.match(/class="hd"/g) || []).length, 1)
    assert.equal((html.match(/class="sk /g) || []).length, 3)
    assert.match(html, /h30/)
    assert.equal((html.match(/h11/g) || []).length, 2)
  })

  test('sk() snaps widths and heights to the sizes the stylesheet defines', () => {
    assert.equal(sk(58, 30), '<span class="sk w60 h30"></span>')
    assert.equal(sk('x', 9), '<span class="sk wx h9"></span>')
    assert.equal(sk(400, 1), '<span class="sk w100 h4"></span>')
    for (const m of sk(58, 30).matchAll(/\b(w\d+|h\d+)\b/g)) assert.ok(SHARED_CSS.includes(`.sk.${m[1]} `), m[1])
  })

  test('the shimmer is a colour mix of surface tokens and stops under reduced motion', () => {
    assert.match(SHARED_CSS, /\.sk::after \{[^}]*color-mix\(in srgb, var\(--ts-surface-2\) 35%, var\(--ts-surface\)\)[^}]*animation: ts-shimmer/)
    assert.match(SHARED_CSS, /@media \(prefers-reduced-motion: reduce\) \{ \.sk::after \{ animation: none; display: none; \} \}/)
    assert.match(SHARED_CSS, /\.sk \{[^}]*background: var\(--ts-surface-2\)/)
    assert.doesNotMatch(SHARED_CSS, /#[0-9a-f]{3,8}\b/i)
    assert.doesNotMatch(SHARED_CSS, /\b(rgb|hsl)a?\(/i)
  })

  test('the error view colours its glyph with the warn token', () => {
    assert.match(SHARED_CSS, /\.err-msg svg \{[^}]*color: var\(--ts-warn\)/)
  })

  test('every view fills the same fixed tile, so none can resize it', () => {
    assert.match(SHARED_CSS, /\.tile \{[^}]*box-sizing: border-box; height: 100%;[^}]*overflow: hidden/)
    assert.match(SHARED_CSS, /\.empty \{ flex: 1; min-height: 0;/)
    assert.match(SHARED_CSS, /\.err \{ flex: 1; min-height: 0;/)
    assert.match(SHARED_CSS, /\.sk\.grow \{ flex: 1; min-height: 0;/)
  })

  test('the base strings are EN messages', () => {
    assert.ok(Object.isFrozen(EN))
    assert.equal(EN['widget.error'], "Couldn't display this data")
  })
})

describe('the views', () => {
  let Widget
  let log
  before(async () => {
    globalThis.HTMLElement = FakeElement
    globalThis.document = new FakeDocument()
    Widget = (await import('../src/elements/widget.js?fake-dom-states')).TsWidget
    delete globalThis.HTMLElement
  })
  afterEach(() => globalThis.document.reset())
  after(() => {
    delete globalThis.document
  })

  const make = ({ attrs = {}, statics = {} } = {}) => {
    log = { updates: [], contexts: [] }
    const L = log
    const Cls = class extends Widget {
      static spec = { label: 'Signups', sizes: ['S', 'Wide'] }
      static template(variant) {
        return `<b class="v">${variant}</b>`
      }
      static viewModel(data, variant, ctx) {
        L.contexts.push(data)
        if (data && data.boom) throw new Error('boom')
        return { text: `${data.n}@${variant}`, ariaLabel: data.aria }
      }
      update(vm) {
        L.updates.push(vm.text)
      }
    }
    Object.assign(Cls, statics)
    const el = new Cls()
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    return el
  }
  const section = (el) => el.shadowRoot.section
  const text = (el, sel) => section(el).querySelector(sel).textContent
  const connect = async (el) => {
    el.connect()
    await tick()
    return el
  }
  const silently = (t) => t.mock.method(console, 'error', () => {})

  describe('loading', () => {
    test('data never set: a skeleton with the real label, aria-busy and no content', async () => {
      const el = await connect(make())
      assert.match(section(el).html, /class="sk /)
      assert.doesNotMatch(section(el).html, /class="v"/)
      assert.equal(text(el, '[data-k="label"]'), 'Signups')
      assert.equal(section(el).getAttribute('aria-label'), 'Signups')
      assert.equal(section(el).getAttribute('aria-busy'), 'true')
      assert.deepEqual(log.updates, [])
    })

    test('explicitly setting undefined is still loading', async () => {
      const el = await connect(make())
      el.data = { n: 1 }
      await tick()
      el.data = undefined
      await tick()
      assert.match(section(el).html, /class="sk /)
      assert.equal(section(el).getAttribute('aria-busy'), 'true')
    })

    test('data replaces the skeleton and removes aria-busy', async () => {
      const el = await connect(make())
      el.data = { n: 1, aria: 'Signups, 1' }
      await tick()
      assert.match(section(el).html, /<b class="v">S<\/b>/)
      assert.equal(section(el).getAttribute('aria-busy'), null)
      assert.equal(section(el).getAttribute('aria-label'), 'Signups, 1')
      assert.deepEqual(log.updates, ['1@S'])
    })

    test("state='loading' over existing data shows the skeleton, and clearing it brings the content back", async () => {
      const el = await connect(make())
      el.data = { n: 1 }
      await tick()
      el.setAttribute('state', 'loading')
      await tick()
      assert.match(section(el).html, /class="sk /)
      assert.equal(section(el).getAttribute('aria-busy'), 'true')
      assert.equal(section(el).getAttribute('aria-label'), 'Signups', 'the headline result is not announced while stale')
      el.data = { n: 2 }
      await tick()
      assert.match(section(el).html, /class="sk /, 'still loading')
      assert.deepEqual(log.updates, ['1@S'], 'nothing is drawn while loading')
      el.state = null
      await tick()
      assert.equal(el.getAttribute('state'), null)
      assert.match(section(el).html, /<b class="v">S<\/b>/)
      assert.equal(section(el).getAttribute('aria-busy'), null)
      assert.deepEqual(log.updates, ['1@S', '2@S'])
    })

    test('the skeleton follows the variant', async () => {
      const el = await connect(make({ statics: { skeleton: (v) => `<div class="hd"><span class="lb" data-k="label"></span></div><i>${v}</i>` } }))
      assert.match(section(el).html, /<i>S<\/i>/)
      el.size = 'Wide'
      await tick()
      assert.match(section(el).html, /<i>Wide<\/i>/)
    })

    test('a skeleton with its own label words still sets aria-busy and the region name', async () => {
      const el = make({ statics: { skeleton: () => '<div class="hd"><span class="lb">Today</span></div>' } })
      section(el).querySelector = () => null // a real DOM finds no data-k="label" here
      await connect(el)
      assert.equal(section(el).getAttribute('aria-busy'), 'true')
      assert.equal(section(el).getAttribute('aria-label'), 'Signups')
    })

    test("state='loading' wins over null data, and error wins over loading", async () => {
      const el = await connect(make({ attrs: { state: 'loading' } }))
      el.data = null
      await tick()
      assert.match(section(el).html, /class="sk /)
      el.error = 'down'
      await tick()
      assert.match(section(el).html, /part="error"/)
      assert.equal(section(el).getAttribute('aria-busy'), null)
    })

    test('the state property reflects the attribute and ignores unknown words', () => {
      const el = make()
      assert.equal(el.state, null)
      el.state = 'loading'
      assert.equal(el.getAttribute('state'), 'loading')
      el.setAttribute('state', 'stale')
      assert.equal(el.state, null)
      el.state = 'error'
      assert.equal(el.state, 'error')
      el.state = null
      assert.equal(el.getAttribute('state'), null)
    })
  })

  describe('dataOptional', () => {
    test('the template renders while data is undefined, with an empty view model input', async () => {
      const el = await connect(make({ statics: { dataOptional: true } }))
      assert.match(section(el).html, /<b class="v">S<\/b>/)
      assert.deepEqual(log.contexts, [{}])
      assert.equal(section(el).getAttribute('aria-busy'), null)
    })

    test("the skeleton shows only for state='loading'", async () => {
      const el = await connect(make({ statics: { dataOptional: true } }))
      el.state = 'loading'
      await tick()
      assert.match(section(el).html, /class="sk /)
      el.state = null
      await tick()
      assert.match(section(el).html, /<b class="v">S<\/b>/)
    })

    test('null is still empty', async () => {
      const el = await connect(make({ statics: { dataOptional: true } }))
      el.data = null
      await tick()
      assert.match(section(el).html, /<slot name="empty"><span data-k="empty"><\/span><\/slot>/)
      assert.equal(text(el, '[data-k="empty"]'), 'No data')
    })
  })

  describe('empty', () => {
    test('null shows the label and the default text inside the empty slot', async () => {
      const el = await connect(make())
      el.data = null
      await tick()
      assert.match(section(el).html, /<div class="empty" part="empty"><slot name="empty"><span data-k="empty"><\/span><\/slot><\/div>/)
      assert.equal(text(el, '[data-k="empty"]'), 'No data')
      assert.equal(text(el, '[data-k="label"]'), 'Signups')
      assert.equal(section(el).getAttribute('aria-label'), 'Signups')
      assert.equal(section(el).getAttribute('aria-busy'), null)
    })

    test('emptyText is the fallback inside the slot, escaped; slotted content replaces it by being light DOM', async () => {
      const el = await connect(make({ statics: { emptyText: 'No <b>trades</b> & more' } }))
      el.data = null
      await tick()
      // Written as text, so markup in it is never parsed.
      assert.equal(text(el, '[data-k="empty"]'), 'No <b>trades</b> & more')
      assert.doesNotMatch(section(el).html, /trades/)
      // The slot is in the shadow tree, so a light-DOM child with slot="empty"
      // is projected there and keeps its own events: nothing here wraps it.
      assert.doesNotMatch(section(el).html, /pointer-events/)
    })

    test('data after empty rebuilds the content', async () => {
      const el = await connect(make())
      el.data = null
      await tick()
      el.data = { n: 3 }
      await tick()
      assert.match(section(el).html, /<b class="v">S<\/b>/)
      assert.deepEqual(log.updates, ['3@S'])
    })

    test('the three widgets name their empty text in the view', async () => {
      for (const [Ctor, text] of [[TsTodayPnl, 'No trades today'], [TsEquityCurve, 'No trading days yet'], [TsSessionClock, 'No sessions set up']]) {
        const el = make({ statics: { emptyText: Ctor.emptyText } })
        await connect(el)
        el.data = null
        await tick()
        assert.equal(section(el).querySelector('[data-k="empty"]').textContent, text)
      }
    })
  })

  describe('error', () => {
    test('a throwing view model shows the error view, logs once, and recovers', async (t) => {
      const logged = silently(t)
      const el = await connect(make())
      el.data = { boom: true }
      await tick()
      el.data = { boom: true }
      await tick()
      assert.equal(logged.mock.callCount(), 1)
      assert.match(section(el).html, /<div class="err" part="error">/)
      assert.doesNotMatch(section(el).html, /class="empty"/, 'never shown as empty')
      assert.equal(text(el, '[data-k="message"]'), "Couldn't display this data")
      assert.equal(section(el).getAttribute('aria-label'), "Signups, error: Couldn't display this data")
      assert.equal(text(el, '[data-k="label"]'), 'Signups')
      el.data = { n: 5 }
      await tick()
      assert.match(section(el).html, /<b class="v">S<\/b>/)
      assert.equal(section(el).getAttribute('aria-label'), 'Signups')
      el.data = { boom: true }
      await tick()
      assert.equal(logged.mock.callCount(), 2, 'a new run of failures logs again')
    })

    test("el.error shows its message, names the region with it, and clears with null", async () => {
      const el = await connect(make())
      el.data = { n: 1 }
      await tick()
      el.error = 'Feed disconnected'
      await tick()
      assert.match(section(el).html, /part="error"/)
      assert.equal(text(el, '[data-k="message"]'), 'Feed disconnected')
      assert.equal(section(el).getAttribute('aria-label'), 'Signups, error: Feed disconnected')
      assert.deepEqual(log.updates, ['1@S'], 'the content is not redrawn under an error')
      el.error = null
      await tick()
      assert.match(section(el).html, /<b class="v">S<\/b>/)
      assert.equal(section(el).getAttribute('aria-label'), 'Signups')
    })

    test("state='error' with no message shows the default text, even with no data", async () => {
      const el = await connect(make({ attrs: { state: 'error' } }))
      assert.match(section(el).html, /part="error"/)
      assert.equal(text(el, '[data-k="message"]'), "Couldn't display this data")
      el.data = null
      await tick()
      assert.match(section(el).html, /part="error"/, 'null data does not turn an error into empty')
    })

    test('the glyph is decorative and the message goes in as text, never markup', async () => {
      const el = await connect(make())
      el.error = '<img src=x onerror=alert(1)>'
      await tick()
      assert.match(section(el).html, /<svg [^>]*aria-hidden="true"/)
      assert.doesNotMatch(section(el).html, /onerror/)
      assert.equal(text(el, '[data-k="message"]'), '<img src=x onerror=alert(1)>')
    })

    test('an Error object is read as its message; other values and empty strings clear it', () => {
      const el = make()
      el.error = new Error('Timed out')
      assert.equal(el.error, 'Timed out')
      el.error = ''
      assert.equal(el.error, null)
      el.error = 42
      assert.equal(el.error, null)
    })
  })

  describe('actions and retry', () => {
    const click = (el, action) => {
      const button = { getAttribute: (k) => (k === 'data-action' ? action : null) }
      section(el).dispatch('click', { target: { closest: () => button } })
    }

    test('actions defaults to none, a non-array gives none, and actionEnabled reads it', () => {
      const el = make()
      assert.deepEqual([...el.actions], [])
      assert.equal(el.actionEnabled('retry'), false)
      el.actions = ['retry', 3, 'exit-all']
      assert.deepEqual([...el.actions], ['retry', 'exit-all'])
      assert.equal(el.actionEnabled('retry'), true)
      assert.equal(el.actionEnabled('other'), false)
      el.actions = 'retry'
      assert.deepEqual([...el.actions], [])
      el.actions = null
      assert.deepEqual([...el.actions], [])
    })

    test('actions set before the element was defined are re-applied on connect', async () => {
      const el = make()
      delete el.actions
      Object.defineProperty(el, 'actions', { value: ['retry'], configurable: true, writable: true, enumerable: true })
      el.error = 'x'
      await connect(el)
      assert.equal(el.actionEnabled('retry'), true)
      assert.match(section(el).html, /data-action="retry"/)
    })

    test('no Retry button unless actions includes retry', async () => {
      const el = await connect(make())
      el.error = 'Feed disconnected'
      await tick()
      assert.doesNotMatch(section(el).html, /<button/)
      el.actions = ['exit-all']
      await tick()
      assert.doesNotMatch(section(el).html, /<button/)
      el.actions = ['exit-all', 'retry']
      await tick()
      assert.match(section(el).html, /<button type="button" class="btn retry" data-action="retry" data-k="retry"><\/button>/)
      assert.equal(text(el, '[data-k="retry"]'), 'Retry')
      el.actions = []
      await tick()
      assert.doesNotMatch(section(el).html, /<button/)
    })

    test("the button fires ts-action { action: 'retry' }, bubbling and composed", async () => {
      const el = await connect(make())
      el.actions = ['retry']
      el.error = 'Feed disconnected'
      await tick()
      const events = []
      el.addEventListener('ts-action', (e) => events.push(e))
      click(el, 'retry')
      assert.equal(events.length, 1)
      assert.deepEqual(events[0].detail, { action: 'retry' })
      assert.equal(events[0].bubbles, true)
      assert.equal(events[0].composed, true)
    })

    test('a click on anything else, or after retry was switched off, fires nothing', async () => {
      const el = await connect(make())
      el.actions = ['retry']
      el.error = 'x'
      await tick()
      const events = []
      el.addEventListener('ts-action', (e) => events.push(e))
      click(el, 'other')
      section(el).dispatch('click', { target: {} })
      section(el).dispatch('click', { target: { closest: () => null } })
      el.actions = []
      click(el, 'retry')
      assert.equal(events.length, 0)
    })

    test('retry then recovery: the host sets the data and the error view goes away', async () => {
      const el = await connect(make())
      el.actions = ['retry']
      el.data = { n: 1 }
      el.error = 'Feed disconnected'
      await tick()
      el.addEventListener('ts-action', (e) => {
        if (e.detail.action === 'retry') {
          el.error = null
          el.data = { n: 2 }
        }
      })
      click(el, 'retry')
      await tick()
      assert.match(section(el).html, /<b class="v">S<\/b>/)
      assert.doesNotMatch(section(el).html, /part="error"/)
      assert.deepEqual(log.updates, ['2@S'])
    })
  })

  describe('transitions', () => {
    test('undefined, then null, then data, then loading over it, then error, then data again', async () => {
      const el = await connect(make())
      const view = () => (/class="sk /.test(section(el).html) ? 'loading' : /part="error"/.test(section(el).html) ? 'error' : /class="empty"/.test(section(el).html) ? 'empty' : /class="v"/.test(section(el).html) ? 'content' : '?')
      const seen = [view()]
      for (const step of [() => (el.data = null), () => (el.data = { n: 1 }), () => (el.state = 'loading'), () => (el.state = 'error'), () => (el.state = null), () => (el.error = 'x'), () => (el.error = null)]) {
        step()
        await tick()
        seen.push(view())
      }
      assert.deepEqual(seen, ['loading', 'empty', 'content', 'loading', 'error', 'content', 'error', 'content'])
    })

    test('only the tile section is written: no view touches the host box', async () => {
      const el = await connect(make())
      const before = [...el.attrs.entries()].filter(([k]) => k !== 'size')
      for (const step of [() => (el.data = null), () => (el.data = { n: 1 }), () => (el.state = 'loading'), () => (el.error = 'x')]) {
        step()
        await tick()
        assert.doesNotMatch(section(el).html, /\s(style|width|height)=/)
      }
      const after = [...el.attrs.entries()].filter(([k]) => !['size', 'state'].includes(k))
      assert.deepEqual(after, before)
    })

    test('re-rendering the same view does not rewrite the markup', async () => {
      const el = await connect(make())
      const writes = section(el).htmlWrites
      el.requestRender()
      await tick()
      el.requestRender()
      await tick()
      assert.equal(section(el).htmlWrites, writes)
    })
  })
})
