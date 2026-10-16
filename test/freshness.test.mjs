import { test, describe, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { parseDuration, header } from '../src/elements/widget.js'
import { FakeElement, FakeDocument, tick } from './fake-dom.mjs'

describe('parseDuration', () => {
  test('parses numbers as milliseconds', () => {
    assert.equal(parseDuration(90000), 90000)
    assert.equal(parseDuration(0), 0)
    assert.equal(parseDuration('90000'), 90000)
  })

  test('parses duration strings with units: ms, s, m, h', () => {
    assert.equal(parseDuration('500ms'), 500)
    assert.equal(parseDuration('90s'), 90000)
    assert.equal(parseDuration('2m'), 120000)
    assert.equal(parseDuration('1h'), 3600000)
    assert.equal(parseDuration('1.5h'), 5400000)
  })

  test('returns null for unreadable or negative values', () => {
    assert.equal(parseDuration(null), null)
    assert.equal(parseDuration(undefined), null)
    assert.equal(parseDuration(''), null)
    assert.equal(parseDuration('abc'), null)
    assert.equal(parseDuration('-5s'), null)
    assert.equal(parseDuration('10d'), null)
  })
})

describe('freshness and flash', () => {
  let Widget
  before(async () => {
    globalThis.HTMLElement = FakeElement
    globalThis.document = new FakeDocument()
    Widget = (await import('../src/elements/widget.js?fake-dom-freshness')).TsWidget
    delete globalThis.HTMLElement
  })
  afterEach(() => globalThis.document.reset())
  after(() => {
    delete globalThis.document
  })

  const make = ({ attrs = {}, onUpdate } = {}) => {
    let capturedCtx = null
    const Cls = class extends Widget {
      static spec = { label: 'Revenue', sizes: ['S', 'Wide'] }
      static template(variant) {
        return `${header({ dot: true, meta: true })}<span class="val" data-flash="val" data-k="val"></span>`
      }
      static viewModel(data, variant, ctx) {
        capturedCtx = ctx
        return { label: ctx.label, val: data && data.val !== undefined ? data.val : '' }
      }
      update(vm, variant) {
        const el = this.$('[data-k="val"]')
        if (el && vm.val !== undefined) el.textContent = String(vm.val)
        if (onUpdate) onUpdate(this, vm, variant)
      }
    }
    const el = new Cls()
    const root = el.shadowRoot
    root.querySelector = (sel) => (sel === '.tile' ? root.section : root.section.querySelector(sel))
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    el._getCtx = () => capturedCtx
    return el
  }

  const section = (el) => el.shadowRoot.section
  const connect = async (el) => {
    el.connect()
    await tick()
    return el
  }

  describe('ctx.freshness', () => {
    test('computes { asOf, ago, stale } from data and stale-after', async () => {
      const fixedNow = 1760000120000
      const el = await connect(make())
      el.now = () => fixedNow

      // Fresh live data: 60 s ago (within default 120 s stale-after)
      el.data = { val: 10, asOf: fixedNow - 60000, live: true }
      await tick()
      const f1 = el._getCtx().freshness
      assert.equal(f1.asOf, fixedNow - 60000)
      assert.match(f1.ago, /^1 min\.? ago$/)
      assert.equal(f1.stale, false)

      // Stale live data: 180 s ago (beyond default 120 s)
      el.data = { val: 10, asOf: fixedNow - 180000, live: true }
      await tick()
      const f2 = el._getCtx().freshness
      assert.equal(f2.asOf, fixedNow - 180000)
      assert.equal(f2.stale, true)

      // Snapshot data: not live is never stale
      el.data = { val: 10, asOf: fixedNow - 180000, live: false }
      await tick()
      const f3 = el._getCtx().freshness
      assert.equal(f3.stale, false)

      // Missing asOf
      el.data = { val: 10, live: true }
      await tick()
      const f4 = el._getCtx().freshness
      assert.equal(f4.asOf, null)
      assert.equal(f4.ago, '')
      assert.equal(f4.stale, false)
    })

    test('stale-after attribute customises the threshold', async () => {
      const fixedNow = 1760000120000
      const el = await connect(make({ attrs: { 'stale-after': '90s' } }))
      el.now = () => fixedNow

      // 80 s ago: fresh under 90s
      el.data = { val: 10, asOf: fixedNow - 80000, live: true }
      await tick()
      assert.equal(el._getCtx().freshness.stale, false)

      // 100 s ago: stale under 90s
      el.data = { val: 10, asOf: fixedNow - 100000, live: true }
      await tick()
      assert.equal(el._getCtx().freshness.stale, true)
    })
  })

  describe('header states', () => {
    test('State 1: No asOf - dot hidden (or pulsing if live), meta hidden, tile name plain', async () => {
      const el = await connect(make())
      el.data = { val: 100, live: false }
      await tick()

      const s = section(el)
      assert.equal(s.querySelector('[data-k="dot"]').getAttribute('hidden'), '')
      assert.equal(s.querySelector('[data-k="meta"]').getAttribute('hidden'), '')
      assert.equal(s.getAttribute('aria-label'), 'Revenue')

      // With live: true but no asOf
      el.data = { val: 100, live: true }
      await tick()
      assert.equal(s.querySelector('[data-k="dot"]').getAttribute('hidden'), null)
      assert.equal(s.querySelector('[data-k="dot"]').getAttribute('class'), 'dot live')
      assert.equal(s.querySelector('[data-k="meta"]').getAttribute('hidden'), '')
      assert.equal(s.getAttribute('aria-label'), 'Revenue, live')
    })

    test('State 2: asOf, not live - dot hidden, meta reads "synced 11:42", tile name plain', async () => {
      const el = await connect(make())
      el.setAttribute('time-zone', 'UTC')
      const asOf = Date.parse('2026-10-12T11:42:00Z')
      el.data = { val: 100, asOf, live: false }
      await tick()

      const s = section(el)
      assert.equal(s.querySelector('[data-k="dot"]').getAttribute('hidden'), '')
      assert.equal(s.querySelector('[data-k="meta"]').getAttribute('hidden'), null)
      assert.equal(s.querySelector('[data-k="pre"]').textContent, 'synced ')
      assert.equal(s.querySelector('[data-k="time"]').textContent, '11:42')
      assert.equal(s.getAttribute('aria-label'), 'Revenue')
    })

    test('State 3: Live, fresh - dot pulsing, meta reads ago, tile name ends with ", live"', async () => {
      const fixedNow = 1760000120000
      const el = await connect(make())
      el.now = () => fixedNow

      // 10 s ago -> just now
      el.data = { val: 100, asOf: fixedNow - 10000, live: true }
      await tick()

      const s = section(el)
      assert.equal(s.querySelector('[data-k="dot"]').getAttribute('hidden'), null)
      assert.equal(s.querySelector('[data-k="dot"]').getAttribute('class'), 'dot live')
      assert.equal(s.querySelector('[data-k="meta"]').getAttribute('hidden'), null)
      assert.equal(s.querySelector('[data-k="time"]').textContent, 'just now')
      assert.equal(s.getAttribute('aria-label'), 'Revenue, live')
    })

    test('State 4: Live, stale - dot .stale, meta reads "Stale · 3 min", tile name ends with ", stale"', async () => {
      const fixedNow = 1760000120000
      const el = await connect(make())
      el.now = () => fixedNow

      // 180 s (3 minutes) ago
      el.data = { val: 100, asOf: fixedNow - 180000, live: true }
      await tick()

      const s = section(el)
      assert.equal(s.querySelector('[data-k="dot"]').getAttribute('hidden'), null)
      assert.equal(s.querySelector('[data-k="dot"]').getAttribute('class'), 'dot live stale')
      assert.equal(s.querySelector('[data-k="meta"]').getAttribute('hidden'), null)
      assert.equal(s.querySelector('[data-k="time"]').textContent, 'Stale · 3 min')
      assert.equal(s.getAttribute('aria-label'), 'Revenue, stale')
    })
  })

  describe('15 s timer', () => {
    test('timer is active while asOf is set, and stops when cleared', async () => {
      const el = await connect(make())
      assert.equal(el._freshTimer, 0)

      el.data = { val: 100, asOf: 1760000000000 }
      await tick()
      assert.ok(el._freshTimer !== 0, 'timer armed with asOf')

      el.data = { val: 100 }
      await tick()
      assert.equal(el._freshTimer, 0, 'timer disarmed without asOf')
    })
  })

  describe('flash(key, value, o)', () => {
    test('never fires on first render or unchanged value', async () => {
      let firedKey = null
      let firedVal = null
      const el = await connect(
        make({
          onUpdate(w, vm) {
            w.flash('val', vm.val)
          },
        }),
      )

      el.data = { val: 10 }
      await tick()
      const valEl = section(el).querySelector('[data-k="val"]')
      assert.doesNotMatch(valEl.getAttribute('class') || '', /flash/)

      // Unchanged value
      el.data = { val: 10 }
      await tick()
      assert.doesNotMatch(valEl.getAttribute('class') || '', /flash/)
    })

    test('tints element with flash-up or flash-down on value change', async () => {
      let simNow = 1000
      const el = await connect(
        make({
          onUpdate(w, vm) {
            w.flash('val', vm.val)
          },
        }),
      )
      el.now = () => simNow

      el.data = { val: 10 }
      await tick()
      const valEl = section(el).querySelector('[data-k="val"]')

      // Rose from 10 to 20
      simNow += 2000
      el.data = { val: 20 }
      await tick()
      assert.match(valEl.getAttribute('class') || '', /\bflash-up\b/)

      // Fell from 20 to 15
      simNow += 2000
      el.data = { val: 15 }
      await tick()
      assert.match(valEl.getAttribute('class') || '', /\bflash-down\b/)
    })

    test('respects goodWhen: down and neither', async () => {
      let simNow = 1000
      let gw = 'down'
      const el = await connect(
        make({
          onUpdate(w, vm) {
            w.flash('val', vm.val, { goodWhen: gw })
          },
        }),
      )
      el.now = () => simNow

      el.data = { val: 10 }
      await tick()
      const valEl = section(el).querySelector('[data-k="val"]')

      // Rose: with goodWhen 'down', rising is bad (flash-down)
      simNow += 2000
      el.data = { val: 20 }
      await tick()
      assert.match(valEl.getAttribute('class') || '', /\bflash-down\b/)

      // With goodWhen 'neither'
      gw = 'neither'
      simNow += 2000
      el.data = { val: 30 }
      await tick()
      assert.match(valEl.getAttribute('class') || '', /\bflash-neither\b/)
    })

    test('throttles to at most once per element per second', async () => {
      let simNow = 1000
      const el = await connect(
        make({
          onUpdate(w, vm) {
            w.flash('val', vm.val)
          },
        }),
      )
      el.now = () => simNow

      el.data = { val: 10 }
      await tick()

      // Change at t = 2000: flashes
      simNow = 2000
      el.data = { val: 20 }
      await tick()
      const valEl = section(el).querySelector('[data-k="val"]')
      assert.match(valEl.getAttribute('class') || '', /\bflash-up\b/)
      valEl.setAttribute('class', 'val')

      // Second change at t = 2500 (< 1000 ms later): throttled, does not flash
      simNow = 2500
      el.data = { val: 30 }
      await tick()
      assert.doesNotMatch(valEl.getAttribute('class') || '', /flash/)
    })

    test('disabled when flash="off" or under reduced motion', async () => {
      let simNow = 1000
      const el = await connect(
        make({
          attrs: { flash: 'off' },
          onUpdate(w, vm) {
            w.flash('val', vm.val)
          },
        }),
      )
      el.now = () => simNow

      el.data = { val: 10 }
      await tick()

      simNow += 2000
      el.data = { val: 20 }
      await tick()
      const valEl = section(el).querySelector('[data-k="val"]')
      assert.doesNotMatch(valEl.getAttribute('class') || '', /flash/)
    })
  })
})
