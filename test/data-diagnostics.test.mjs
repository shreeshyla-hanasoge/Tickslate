import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { checkShape, shapeMessage, parseErrorParts, resetWarnings } from '../src/elements/dev.js'
import { FakeElement, FakeDocument, tick } from './fake-dom.mjs'

// The widget modules pick their base class when first evaluated, so the fake
// DOM is installed before they are imported.
globalThis.HTMLElement = FakeElement
globalThis.document = new FakeDocument()
afterEach(() => globalThis.document.reset())
const { TsWidget: Widget, describeElement } = await import('../src/elements/widget.js')
const { TsTodayPnl } = await import('../src/elements/today-pnl.js')
const { TsEquityCurve } = await import('../src/elements/equity-curve.js')
const { TsSessionClock } = await import('../src/elements/session-clock.js')

// JSON data attribute, dataShape and the development warnings (RFC 0002 §2.6,
// §2.7, §7.2). Pure pieces first, then the elements against the shared fake DOM.

describe('checkShape', () => {
  const shape = {
    value: 'numeric',
    label: { kind: 'string', optional: true },
    series: { kind: 'array', optional: true, of: { t: 'time', v: 'numeric' } },
    window: { kind: 'object', optional: true, of: { from: 'time' } },
  }

  test('valid data, extra keys and absent optional keys pass', () => {
    assert.equal(checkShape({ value: 4, extra: 1 }, shape), null)
    assert.equal(checkShape({ value: '1204.5', label: null, series: [{ t: '2026-03-02', v: '3' }] }, shape), null)
  })

  test('a missing key reports the keys it did get', () => {
    const p = checkShape({ rows: [], total: 3 }, { readings: 'array' })
    assert.deepEqual(p, { path: 'data.readings', expected: 'array', received: 'missing', keys: ['rows', 'total'] })
    assert.equal(shapeMessage(p), 'data.readings is missing (got keys: rows, total)')
  })

  test('wrong kinds say what was received', () => {
    assert.equal(shapeMessage(checkShape({ value: 'n/a' }, shape)), 'data.value should be numeric (got string "n/a")')
    assert.equal(shapeMessage(checkShape({ value: 1, series: {} }, shape)), 'data.series should be array (got object)')
    assert.equal(shapeMessage(checkShape({ value: 1, label: 5 }, shape)), 'data.label should be string (got number 5)')
    assert.equal(shapeMessage(checkShape({ value: NaN }, { value: 'number' })), 'data.value should be number (got number NaN)')
    assert.equal(shapeMessage(checkShape({ value: null }, shape)), 'data.value should be numeric (got null)')
  })

  test('the path goes into array items and nested objects', () => {
    const items = [{ t: 1, v: 1 }, { t: 2, v: 1 }, { t: 'noon', v: 1 }]
    assert.equal(shapeMessage(checkShape({ value: 1, series: items }, shape)), 'data.series[2].t should be time (got string "noon")')
    assert.equal(shapeMessage(checkShape({ value: 1, series: [{ t: 1 }] }, shape)), 'data.series[0].v is missing (got keys: t)')
    assert.equal(shapeMessage(checkShape({ value: 1, window: { from: 'x' } }, shape)), 'data.window.from should be time (got string "x")')
  })

  test('items given as a bare kind, and a hole in the list', () => {
    assert.equal(checkShape({ ids: ['a', 'b'] }, { ids: { kind: 'array', of: 'string' } }), null)
    assert.equal(shapeMessage(checkShape({ ids: ['a', 3] }, { ids: { kind: 'array', of: 'string' } })), 'data.ids[1] should be string (got number 3)')
    assert.equal(shapeMessage(checkShape({ ids: ['a', null] }, { ids: { kind: 'array', of: 'string' } })), 'data.ids[1] should be string (got null)')
  })

  test('a shape with a key called kind is a shape when it has other keys', () => {
    const marks = { marks: { kind: 'array', of: { t: 'time', kind: 'string' } } }
    assert.equal(checkShape({ marks: [{ t: 1, kind: 'buy' }] }, marks), null)
    assert.equal(shapeMessage(checkShape({ marks: [{ t: 1 }] }, marks)), 'data.marks[0].kind is missing (got keys: t)')
  })

  test('extra nesting: the data wrapped in another object is a missing-key problem', () => {
    const p = checkShape({ data: { value: 1 } }, shape)
    assert.equal(shapeMessage(p), 'data.value is missing (got keys: data)')
  })

  test('data that is not an object at all', () => {
    assert.equal(shapeMessage(checkShape([1], shape)), 'data should be object (got array)')
    assert.equal(shapeMessage(checkShape('x', shape)), 'data should be object (got string "x")')
  })

  test('boolean kind', () => {
    assert.equal(checkShape({ live: true }, { live: 'boolean' }), null)
    assert.equal(shapeMessage(checkShape({ live: 'yes' }, { live: 'boolean' })), 'data.live should be boolean (got string "yes")')
  })
})

describe('parse error and element naming', () => {
  test('the position is split out of V8-style and newer messages', () => {
    assert.deepEqual(parseErrorParts(new Error('Unexpected token } in JSON at position 41')), { message: 'Unexpected token }', position: 41 })
    assert.deepEqual(parseErrorParts(new Error("Expected ',' or '}' after property value in JSON at position 9 (line 1 column 10)")), {
      message: "Expected ',' or '}' after property value",
      position: 9,
    })
    assert.deepEqual(parseErrorParts(new Error('bad')), { message: 'bad', position: null })
  })

  test('an element is named with its item when it has one', () => {
    const el = { localName: 'ts-today-pnl', getAttribute: (k) => (k === 'item' ? 'pnl' : null) }
    assert.equal(describeElement(el), '<ts-today-pnl item="pnl">')
    assert.equal(describeElement({ localName: 'ts-card', getAttribute: () => null }), '<ts-card>')
  })
})

describe('each widget declares its dataShape', () => {
  test('the finance widgets', () => {
    assert.deepEqual(Object.keys(TsTodayPnl.dataShape).slice(0, 4), ['net', 'realized', 'unrealized', 'fees'])
    assert.equal(TsEquityCurve.dataShape.days.kind, 'array')
    assert.equal(TsSessionClock.dataShape.calendar, 'object')
  })

  test("today's P&L wrong shape produces the documented message", () => {
    const p = checkShape({ rows: [], total: 1 }, { readings: 'array' })
    assert.equal(`tickslate: <ts-today-pnl item="pnl"> ${shapeMessage(p)}`, 'tickslate: <ts-today-pnl item="pnl"> data.readings is missing (got keys: rows, total)')
  })

  test('good data for each widget passes its own shape', () => {
    assert.equal(
      checkShape({ net: 1, realized: 1, unrealized: 0, fees: 0.5, intraday: [{ t: 1760331000, v: 1 }], live: true }, TsTodayPnl.dataShape),
      null,
    )
    assert.equal(checkShape({ days: [{ date: '2026-03-02', pnl: -40.5 }] }, TsEquityCurve.dataShape), null)
    assert.equal(checkShape({ calendar: { NSE: {} }, sessions: ['NSE'], timeframes: [15, 60] }, TsSessionClock.dataShape), null)
  })
})

describe('on an element', () => {
  let warns
  let errors
  beforeEach(() => resetWarnings())

  const spy = (t) => {
    warns = []
    errors = []
    t.mock.method(console, 'warn', (m) => warns.push(m))
    t.mock.method(console, 'error', (m) => errors.push(m))
  }

  const make = ({ attrs = {}, statics = {}, tag = 'ts-metric' } = {}) => {
    const Cls = class extends Widget {
      static spec = { label: 'Signups', sizes: ['S'] }
      static dataShape = { value: 'numeric' }
      static template() {
        return '<b data-k="v"></b>'
      }
      static viewModel(data) {
        if (data.boom) throw new Error('boom')
        return { text: String(data.value), dropped: data.dropped }
      }
      update(vm) {
        this.shown = vm.text
      }
    }
    Object.assign(Cls, statics)
    const el = new Cls()
    el.localName = tag
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
    return el
  }
  const section = (el) => el.shadowRoot.section
  const connect = async (el) => {
    el.connect()
    await tick()
    return el
  }

  describe('the JSON data attribute', () => {
    test('an object value renders with no script', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { data: '{"value": 12}' } }))
      assert.equal(el.data.value, 12)
      assert.equal(el.shown, '12')
      assert.deepEqual(warns, [])
    })

    test('an array value is parsed, with surrounding whitespace', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { data: '  [1, 2]  ' }, statics: { dataShape: null } }))
      assert.deepEqual(el.data, [1, 2])
    })

    test("<ts-today-pnl data='{\"readings\":[],\"asOf\":1760331000}'> renders from markup alone", async (t) => {
      spy(t)
      const el = new TsTodayPnl()
      el.localName = 'ts-today-pnl'
      el.setAttribute('item', 'pnl')
      el.setAttribute('data', '{"readings":[],"asOf":1760331000}')
      await connect(el)
      assert.deepEqual(el.data, { readings: [], asOf: 1760331000 })
      assert.doesNotMatch(section(el).html, /class="sk |class="err"/)
      assert.equal(warns.length, 1)
      assert.equal(warns[0], 'tickslate: <ts-today-pnl item="pnl"> data.net is missing (got keys: readings, asOf)')
    })

    test('a value that is not JSON-shaped is ignored', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { data: 'hello' } }))
      assert.equal(el.data, undefined)
      assert.match(section(el).html, /class="sk /)
      assert.deepEqual(warns, [])
    })

    test('changing the attribute re-reads it; a later non-JSON value clears what it supplied', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { data: '{"value": 1}' } }))
      el.setAttribute('data', '{"value": 2}')
      await tick()
      assert.equal(el.shown, '2')
      el.setAttribute('data', 'x')
      await tick()
      assert.equal(el.data, undefined)
      assert.match(section(el).html, /class="sk /)
    })

    test('the property wins once set, and the attribute is ignored from then on', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { data: '{"value": 1}' } }))
      el.data = { value: 7 }
      await tick()
      el.setAttribute('data', '{"value": 99}')
      await tick()
      assert.equal(el.data.value, 7)
      assert.equal(el.shown, '7')
    })

    test('a property set to null before the attribute keeps the empty state', async (t) => {
      spy(t)
      const el = make()
      el.data = null
      await connect(el)
      el.setAttribute('data', '{"value": 5}')
      await tick()
      assert.equal(el.data, null)
    })

    test('a parse failure shows the error view and warns once with the position', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { item: 'signups', data: '{"value": 1,}' } }))
      assert.match(section(el).html, /class="err"/)
      assert.match(section(el).getAttribute('aria-label'), /error/)
      assert.equal(warns.length, 1)
      assert.match(warns[0], /^tickslate: <ts-metric item="signups"> data attribute is not valid JSON: .+ \(position \d+\)\.$/)
      el.requestRender()
      await tick()
      assert.equal(warns.length, 1)
    })

    test('setting the property after a failure clears the error view', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { data: '{bad' } }))
      el.data = { value: 3 }
      await tick()
      assert.doesNotMatch(section(el).html, /class="err"/)
      assert.equal(el.shown, '3')
    })

    test('fixing the attribute recovers', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { data: '{bad' } }))
      el.setAttribute('data', '{"value": 4}')
      await tick()
      assert.equal(el.shown, '4')
    })

    test('"[object Object]" warns once to set the property, and shows the error view', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { item: 'signups', data: '[object Object]' } }))
      assert.equal(warns.length, 1)
      assert.equal(warns[0], 'tickslate: <ts-metric item="signups"> data attribute reads "[object Object]"; set the data property instead.')
      assert.match(section(el).html, /class="err"/)
    })
  })

  describe('shape warnings', () => {
    test('a wrong-shape object warns once per element, naming the keys received', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { item: 'pnl' }, tag: 'ts-today-pnl', statics: { dataShape: { readings: 'array' } } }))
      el.data = { rows: [], total: 1 }
      await tick()
      assert.deepEqual(warns, ['tickslate: <ts-today-pnl item="pnl"> data.readings is missing (got keys: rows, total)'])
      el.data = { rows: [], total: 2 }
      await tick()
      assert.equal(warns.length, 1, 'once per element')
    })

    test('wrong kind', async (t) => {
      spy(t)
      const el = await connect(make())
      el.data = { value: 'n/a' }
      await tick()
      assert.deepEqual(warns, ['tickslate: <ts-metric> data.value should be numeric (got string "n/a")'])
    })

    test('two elements of one tag each warn', async (t) => {
      spy(t)
      for (const n of [1, 2]) {
        const el = await connect(make())
        el.data = { nope: n }
        await tick()
      }
      assert.equal(warns.length, 2)
    })

    test('valid data, a widget with no dataShape and a never-set dataOptional widget stay quiet', async (t) => {
      spy(t)
      const ok = await connect(make())
      ok.data = { value: 3 }
      const none = await connect(make({ statics: { dataShape: null } }))
      none.data = { anything: true }
      await connect(make({ statics: { dataOptional: true } }))
      await tick()
      assert.deepEqual(warns, [])
    })
  })

  describe('other development warnings', () => {
    test('formatter issues name the widget attribute', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { item: 'signups', currency: 'RUPEE' } }))
      el.data = { value: 1 }
      await tick()
      assert.equal(warns.length, 1)
      assert.match(warns[0], /^tickslate: <ts-metric item="signups"> currency "RUPEE" .+ \(from its currency attribute\); the default is used\.$/)
    })

    test('formatter issues name the grid attribute', async (t) => {
      spy(t)
      const el = make()
      el.parentElement = { localName: 'ts-grid', getAttribute: (k) => (k === 'currency' ? 'RUPEE' : null), parentElement: null }
      await connect(el)
      el.data = { value: 1 }
      await tick()
      assert.match(warns[0], /\(from its grid's currency attribute\)/)
    })

    test('formatter issues from configure() are named as such', async (t) => {
      spy(t)
      const core = await import('../src/core/index.js')
      const before = core.currentConfig()
      core.configure({ locale: 'not a locale!!' })
      try {
        const el = await connect(make())
        el.data = { value: 1 }
        await tick()
        assert.match(warns[0], /locale .+ \(from configure\(\)\)/)
      } finally {
        core.configure({ locale: before.locale || '' })
      }
    })

    test('a view model reporting dropped rows warns once, with the count', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { item: 'revenue' } }))
      el.data = { value: 1, dropped: 3 }
      await tick()
      el.data = { value: 2, dropped: 4 }
      await tick()
      assert.deepEqual(warns, ["tickslate: <ts-metric item=\"revenue\"> dropped 3 rows it couldn't read."])
    })

    test('dropped: 0 or a single row', async (t) => {
      spy(t)
      const quiet = await connect(make())
      quiet.data = { value: 1, dropped: 0 }
      const one = await connect(make())
      one.data = { value: 1, dropped: 1 }
      await tick()
      assert.deepEqual(warns, ["tickslate: <ts-metric> dropped 1 row it couldn't read."])
    })

    test('data still undefined 10 s after connect warns once', async (t) => {
      spy(t)
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const el = await connect(make({ attrs: { item: 'signups' } }))
      t.mock.timers.tick(9999)
      assert.deepEqual(warns, [])
      t.mock.timers.tick(1)
      assert.deepEqual(warns, ['tickslate: <ts-metric item="signups"> has had no data for 10 s and still shows a skeleton. Set data, or null for the empty state.'])
      el.disconnect()
    })

    test('no warning when data arrives, is null, state is loading on purpose, or the element left', async (t) => {
      spy(t)
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const arrived = await connect(make())
      arrived.data = { value: 1 }
      const empty = await connect(make())
      empty.data = null
      await connect(make({ attrs: { state: 'loading' } }))
      const gone = await connect(make())
      gone.disconnect()
      t.mock.timers.tick(20000)
      assert.deepEqual(warns, [])
    })
  })

  describe('render failures', () => {
    test('console.error names the element and item and points to the widget docs, once per run', async (t) => {
      spy(t)
      const el = await connect(make({ attrs: { item: 'pnl' }, tag: 'ts-today-pnl' }))
      el.data = { value: 1, boom: true }
      await tick()
      el.data = { value: 1, boom: true, again: 1 }
      await tick()
      assert.deepEqual(errors, ['tickslate: <ts-today-pnl item="pnl"> could not render its data; see docs/widgets/ts-today-pnl.md'])
      assert.match(section(el).html, /class="err"/)
    })
  })
})

describe('the production switch', () => {
  test('every warning call site is guarded by DEV', () => {
    for (const file of ['widget.js', 'today-pnl.js', 'equity-curve.js', 'session-clock.js', 'registry.js']) {
      const lines = readFileSync(new URL(`../src/elements/${file}`, import.meta.url), 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (!/warnOnce\(/.test(line) || /^\s*(\*|\/\/)/.test(line)) return
        // Guarded means this line, or a block that encloses it (found by walking out through
        // less-indented lines), starts with `if (DEV)`.
        const indent = (l) => l.length - l.trimStart().length
        let guarded = /if \(DEV\)|DEV &&/.test(line)
        let at = indent(line)
        for (let j = i - 1; j >= 0 && !guarded && at > 0; j--) {
          if (!lines[j].trim() || indent(lines[j]) >= at) continue
          at = indent(lines[j])
          guarded = /if \(DEV\)|DEV &&/.test(lines[j])
        }
        assert.ok(guarded, `${file}:${i + 1} calls warnOnce outside if (DEV)`)
      })
      assert.doesNotMatch(lines.join('\n'), /console\.warn/, `${file} must not call console.warn directly`)
    }
  })

  test('with __TS_DEV__ false the checks never run and nothing warns', () => {
    // A child process, because dev.js reads the switch once, when first loaded.
    const code = `
      import { FakeElement, FakeDocument, tick } from ${JSON.stringify(new URL('./fake-dom.mjs', import.meta.url).href)}
      globalThis.__TS_DEV__ = false
      globalThis.HTMLElement = FakeElement
      globalThis.document = new FakeDocument()
      const { DEV } = await import(${JSON.stringify(new URL('../src/elements/dev.js', import.meta.url).href)})
      const { TsWidget } = await import(${JSON.stringify(new URL('../src/elements/widget.js', import.meta.url).href)})
      const calls = []
      console.warn = (m) => calls.push(m)
      console.error = () => {}
      const Cls = class extends TsWidget {
        static spec = { sizes: ['S'] }
        static dataShape = { value: 'numeric' }
        static viewModel() { return { dropped: 5 } }
      }
      const bad = new Cls()
      bad.localName = 'ts-metric'
      bad.setAttribute('currency', 'RUPEE')
      bad.setAttribute('data', '{nope')
      bad.connect()
      const wrong = new Cls()
      wrong.localName = 'ts-metric'
      wrong.setAttribute('currency', 'RUPEE')
      wrong.setAttribute('data', '[object Object]')
      wrong.connect()
      const shaped = new Cls()
      shaped.localName = 'ts-metric'
      shaped.setAttribute('currency', 'RUPEE')
      shaped.data = { wrong: 1 }
      shaped.connect()
      await tick()
      console.log(JSON.stringify({ DEV, calls, error: /class="err"/.test(bad.shadowRoot.section.html) }))
    `
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' })
    assert.equal(run.status, 0, run.stderr)
    const out = JSON.parse(run.stdout)
    assert.equal(out.DEV, false)
    assert.deepEqual(out.calls, [])
    // Behaviour that isn't diagnostics is unchanged: a bad attribute still shows the error view.
    assert.equal(out.error, true)
  })
})
