// The shared ticker (RFC 0003 §23): one timer for every periodic widget, aligned to second boundaries, asleep while
// the page is hidden, and leaving nothing behind. Runs on node's fake timers and a fake document.
import { test, describe, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { subscribe, shareable } from '../src/elements/ticker.js'
import { FakeDocument, FakeElement, tick } from './fake-dom.mjs'
import { header } from '../src/elements/widget.js'
import { sessionClockModel } from '../src/elements/session-clock.js'
import { createCalendar, createFormatter, createMessages, presets, zonedTime } from '../src/core/index.js'

describe('the shared ticker', () => {
  let doc
  let live
  const hide = () => {
    doc.visibilityState = 'hidden'
    doc.dispatchEvent(new Event('visibilitychange'))
  }
  const show = () => {
    doc.visibilityState = 'visible'
    doc.dispatchEvent(new Event('visibilitychange'))
  }

  // Fake timers on, then counted: `live` holds every interval and every wait for a boundary that is still pending.
  const timers = (t, now) => {
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now })
    live = new Set()
    const wrap = (set, clear, track) => {
      const realSet = globalThis[set]
      const realClear = globalThis[clear]
      globalThis[set] = (fn, ms, ...rest) => {
        const id = realSet(
          (...args) => {
            if (!track.interval) live.delete(id)
            fn(...args)
          },
          ms,
          ...rest,
        )
        live.add(id)
        return id
      }
      globalThis[clear] = (id) => {
        live.delete(id)
        realClear(id)
      }
    }
    wrap('setInterval', 'clearInterval', { interval: true })
    wrap('setTimeout', 'clearTimeout', { interval: false })
  }

  beforeEach(() => {
    doc = new FakeDocument()
    globalThis.document = doc
  })
  afterEach(() => {
    doc.reset()
    delete globalThis.document
  })

  test('a period rides the shared beat only when it is a whole number of seconds', () => {
    assert.equal(shareable(1000), true)
    assert.equal(shareable(15000), true)
    assert.equal(shareable(60000), true)
    assert.equal(shareable(500), false)
    assert.equal(shareable(1500), false)
    assert.equal(shareable(0), false)
  })

  test('beats on second boundaries, whenever it was started', (t) => {
    // 10.3 s on the wall clock: the first beat is at 11.0, 700 ms later, not 1000 ms.
    timers(t, 10300)
    let n = 0
    const stop = subscribe(() => n++, 1000)
    t.mock.timers.tick(699)
    assert.equal(n, 0)
    t.mock.timers.tick(1)
    assert.equal(n, 1)
    t.mock.timers.tick(999)
    assert.equal(n, 1)
    t.mock.timers.tick(1)
    assert.equal(n, 2)
    t.mock.timers.tick(2000)
    assert.equal(n, 4)
    stop()
  })

  test('every(1000) and every(15000) users share one interval and a period counts whole beats', (t) => {
    timers(t, 20000)
    let fast = 0
    let slow = 0
    const stops = []
    for (let i = 0; i < 30; i++) stops.push(subscribe(() => fast++, 1000))
    stops.push(subscribe(() => slow++, 15000))
    t.mock.timers.tick(1000)
    // One wait for the boundary, then one interval, for thirty-one subscribers.
    assert.equal(live.size, 1)
    t.mock.timers.tick(14000)
    assert.equal(fast, 30 * 15)
    assert.equal(slow, 1)
    t.mock.timers.tick(15000)
    assert.equal(slow, 2)
    stops.forEach((stop) => stop())
    assert.equal(live.size, 0, 'nothing left when the last one goes')
  })

  test('is asleep while the page is hidden and starts again, aligned, when it shows', (t) => {
    timers(t, 50000)
    let n = 0
    const stop = subscribe(() => n++, 1000)
    // One second at a time: the interval is made when the first boundary is reached.
    for (let i = 0; i < 3; i++) t.mock.timers.tick(1000)
    assert.equal(n, 3)
    hide()
    assert.equal(live.size, 0, 'no timer while hidden')
    t.mock.timers.tick(60000)
    assert.equal(n, 3)
    t.mock.timers.tick(400)
    show()
    assert.equal(live.size, 1)
    // The clock is now on 113.4 s: the next beat is at 114.0.
    t.mock.timers.tick(599)
    assert.equal(n, 3)
    t.mock.timers.tick(1)
    assert.equal(n, 4)
    stop()
    assert.equal(live.size, 0)
  })

  test('a page that starts hidden does not start a timer until it shows', (t) => {
    timers(t, 1000)
    doc.visibilityState = 'hidden'
    const stop = subscribe(() => {}, 1000)
    assert.equal(live.size, 0)
    show()
    assert.equal(live.size, 1)
    stop()
    assert.equal(live.size, 0)
  })

  test('a subscriber may stop itself, or another, from inside a beat', (t) => {
    timers(t, 2000)
    const calls = []
    let stopB
    const stopA = subscribe(() => {
      calls.push('a')
      stopA()
      stopB()
    }, 1000)
    stopB = subscribe(() => calls.push('b'), 1000)
    t.mock.timers.tick(5000)
    assert.deepEqual(calls, ['a'])
    assert.equal(live.size, 0)
  })

  test('subscribing the same function again replaces its period instead of doubling it', (t) => {
    timers(t, 3000)
    let n = 0
    const fn = () => n++
    const first = subscribe(fn, 1000)
    const second = subscribe(fn, 2000)
    for (let i = 0; i < 4; i++) t.mock.timers.tick(1000)
    assert.equal(n, 2)
    first()
    second()
    assert.equal(live.size, 0)
  })

  test('200 mount and unmount cycles leave no timer and no listener', (t) => {
    timers(t, 7000)
    const listeners = new Set()
    const add = doc.addEventListener.bind(doc)
    const remove = doc.removeEventListener.bind(doc)
    doc.addEventListener = (type, fn, o) => {
      if (type === 'visibilitychange') listeners.add(fn)
      add(type, fn, o)
    }
    doc.removeEventListener = (type, fn, o) => {
      if (type === 'visibilitychange') listeners.delete(fn)
      remove(type, fn, o)
    }
    for (let i = 0; i < 200; i++) {
      const stops = [subscribe(() => {}, 1000), subscribe(() => {}, 15000)]
      // Half of the cycles get as far as a beat, half are gone before the first boundary.
      if (i % 2) t.mock.timers.tick(1000)
      for (const stop of stops) stop()
    }
    assert.equal(live.size, 0, 'no live interval or pending boundary wait')
    assert.equal(listeners.size, 0, 'no visibilitychange listener left')
  })
})

describe('the session clock lane cache (RFC 0003 §23)', () => {
  const IST = 'Asia/Kolkata'
  const calendar = createCalendar({ sessions: [presets.nse({ segment: 'derivatives' }), presets.mcx({ years: [2026] })] })
  const fmt = createFormatter({ locale: 'en-IN', currency: 'INR' })
  const t = createMessages()
  const at = (date, hhmm, seconds = 0) => zonedTime(date, hhmm, IST) + seconds * 1000
  const model = (cal, variant, now) =>
    sessionClockModel({ calendar: cal, sessions: ['nse-fo', 'mcx'], timeframes: [5, 15] }, variant, { fmt, t, now, label: 'Session clock' })
  // A new object has a new, empty cache: the reference for what an uncached answer is.
  const fresh = (variant, now) => model(counting(calendar).wrapped, variant, now)
  // The same calendar with every question it is asked counted.
  const counting = (inner) => {
    const calls = { state: 0, candleClose: 0 }
    const wrapped = {
      sessions: inner.sessions,
      session: (id) => inner.session(id),
      hours: (...a) => inner.hours(...a),
      state: (...a) => (calls.state++, inner.state(...a)),
      candleClose: (...a) => (calls.candleClose++, inner.candleClose(...a)),
    }
    return { wrapped, calls }
  }

  test('a second-by-second hour asks the calendar a handful of times, and answers as it would uncached', () => {
    const { wrapped, calls } = counting(calendar)
    const start = at('2026-10-12', '11:00')
    for (let s = 0; s < 3600; s++) {
      for (const variant of ['S', 'Banner']) {
        const now = start + s * 1000
        assert.deepEqual(model(wrapped, variant, now), fresh(variant, now), `${variant} at +${s}s`)
      }
    }
    // Uncached this is thousands of questions per lane; cached it is one per lane to open the hour, then one
    // per candle close (every 5 and 15 minutes) on the banner.
    assert.ok(calls.state <= 8, `${calls.state} state calls`)
    assert.ok(calls.candleClose <= 40, `${calls.candleClose} candleClose calls`)
  })

  test('crossing the close, and the turn of the day, recomputes the lane', () => {
    const { wrapped, calls } = counting(calendar)
    const before = at('2026-10-12', '15:39', 59)
    assert.equal(model(wrapped, 'S', before).live, true)
    const after = model(wrapped, 'S', before + 2000)
    assert.equal(after.live, false)
    assert.deepEqual(after, fresh('S', before + 2000))
    const stateCalls = calls.state
    // The next morning is a new day and a new window.
    const next = model(wrapped, 'S', at('2026-10-13', '10:00'))
    assert.equal(next.live, true)
    assert.ok(calls.state > stateCalls)
    // Time going backwards is a different question, not a stale answer.
    assert.deepEqual(model(wrapped, 'S', before), fresh('S', before))
  })

  test('a different calendar object is a different cache', () => {
    const a = counting(calendar)
    const b = counting(calendar)
    const now = at('2026-10-12', '11:42')
    model(a.wrapped, 'S', now)
    model(b.wrapped, 'S', now)
    assert.equal(b.calls.state > 0, true)
  })
})

describe('visibility gating (RFC 0003 §23)', () => {
  // An IntersectionObserver that does nothing until the test says what it saw.
  const observers = []
  class FakeIntersectionObserver {
    constructor(fn, options) {
      this.fn = fn
      this.options = options
      this.targets = new Set()
      observers.push(this)
    }
    observe(el) {
      this.targets.add(el)
    }
    unobserve(el) {
      this.targets.delete(el)
    }
    see(el, isIntersecting) {
      this.fn([{ target: el, isIntersecting }])
    }
  }

  let Widget
  let updates
  before(async () => {
    globalThis.HTMLElement = FakeElement
    globalThis.document = new FakeDocument()
    globalThis.IntersectionObserver = FakeIntersectionObserver
    globalThis.window = new EventTarget()
    // A fresh module, so the shared observer is made against this fake.
    Widget = (await import('../src/elements/widget.js?visibility-gating')).TsWidget
    delete globalThis.HTMLElement
  })
  after(() => {
    delete globalThis.document
    delete globalThis.IntersectionObserver
    delete globalThis.window
  })
  afterEach(() => globalThis.document.reset())

  const make = (Base = Widget) => {
    const mine = []
    updates = mine
    const Cls = class extends Base {
      static spec = { label: 'Revenue', sizes: ['S'] }
      static template() {
        return `${header({})}<span data-k="n"></span>`
      }
      static viewModel(data) {
        return { n: data.n }
      }
      update(vm) {
        mine.push(vm.n)
      }
    }
    const el = new Cls()
    const root = el.shadowRoot
    root.querySelector = (sel) => (sel === '.tile' ? root.section : root.section.querySelector(sel))
    return el
  }
  const observer = () => observers[observers.length - 1]

  test('watches with a margin of one screen, and a widget renders on connect before the observer has spoken', async () => {
    const el = make()
    el.data = { n: 1 }
    el.connect()
    await tick()
    assert.deepEqual(updates, [1])
    assert.equal(observer().options.rootMargin, '100% 100% 100% 100%')
    assert.equal(observer().targets.has(el), true)
    el.disconnect()
    assert.equal(observer().targets.has(el), false, 'unobserved when it leaves')
  })

  test('a widget out of the zone skips renders and draws once, with the latest data, when it comes back', async () => {
    const el = make()
    el.data = { n: 1 }
    el.connect()
    await tick()
    observer().see(el, false)
    el.data = { n: 2 }
    await tick()
    el.data = { n: 3 }
    await tick()
    el.requestRender()
    await tick()
    assert.deepEqual(updates, [1], 'nothing drawn while out of the zone')
    observer().see(el, true)
    await tick()
    assert.deepEqual(updates, [1, 3], 'one render, with the newest data')
    observer().see(el, true)
    await tick()
    assert.deepEqual(updates, [1, 3], 'coming back with nothing missed draws nothing')
    el.disconnect()
  })

  test('a printout draws widgets that were out of the zone, then goes back to watching', async () => {
    const el = make()
    el.data = { n: 1 }
    el.connect()
    await tick()
    observer().see(el, false)
    el.data = { n: 2 }
    await tick()
    assert.deepEqual(updates, [1])
    window.dispatchEvent(new Event('beforeprint'))
    await tick()
    assert.deepEqual(updates, [1, 2], 'the page prints what it holds')
    window.dispatchEvent(new Event('afterprint'))
    assert.equal(observer().targets.has(el), true, 'watched again, so the observer reports where it is')
    observer().see(el, false)
    el.data = { n: 3 }
    await tick()
    assert.deepEqual(updates, [1, 2], 'and out of the zone it waits again')
    el.disconnect()
  })

  test('the shared ticker does no work for a widget that is out of the zone', async () => {
    const el = make()
    el.data = { n: 1 }
    el.connect()
    await tick()
    el.every(1000)
    observer().see(el, false)
    // Beats arrive as render requests; none may reach the draw.
    for (let i = 0; i < 5; i++) {
      el.requestRender()
      await tick()
    }
    assert.deepEqual(updates, [1])
    observer().see(el, true)
    await tick()
    assert.deepEqual(updates, [1, 1])
    el.disconnect()
  })

  test('disconnecting while out of the zone, then connecting again, draws at once', async () => {
    const el = make()
    el.data = { n: 1 }
    el.connect()
    await tick()
    observer().see(el, false)
    el.disconnect()
    el.data = { n: 2 }
    el.connect()
    await tick()
    assert.deepEqual(updates, [1, 2])
    el.disconnect()
  })

  test('one observer serves every widget, and it reports each one separately', async () => {
    const a = make()
    const aUpdates = updates
    const b = make()
    const bUpdates = updates
    a.data = { n: 'a' }
    b.data = { n: 'b' }
    a.connect()
    b.connect()
    await tick()
    const count = observers.length
    observer().fn([{ target: a, isIntersecting: false }, { target: b, isIntersecting: true }])
    a.data = { n: 'a2' }
    b.data = { n: 'b2' }
    await tick()
    assert.deepEqual(aUpdates, ['a'])
    assert.deepEqual(bUpdates, ['b', 'b2'])
    assert.equal(observers.length, count)
    a.disconnect()
    b.disconnect()
  })

  test('without an IntersectionObserver a widget is never blank', async () => {
    const saved = globalThis.IntersectionObserver
    delete globalThis.IntersectionObserver
    try {
      // A new module record has no observer made yet, and finds none to make.
      globalThis.HTMLElement = FakeElement
      const Fresh = (await import('../src/elements/widget.js?visibility-gating-none')).TsWidget
      delete globalThis.HTMLElement
      const el = make(Fresh)
      el.data = { n: 7 }
      el.connect()
      el.data = { n: 8 }
      await tick()
      assert.deepEqual(updates, [8])
      el.disconnect()
    } finally {
      globalThis.IntersectionObserver = saved
    }
  })
})
