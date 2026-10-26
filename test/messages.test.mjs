import { test, describe, before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { BUILT_IN_PROFILES, EN, SIZE_NAMES, WIDGETS, configure, createCalendar, createMessages, currentConfig, onConfigure, presets } from '../src/core/index.js'
import { translator } from '../src/elements/messages-cache.js'
import { sizeName } from '../src/core/messages.js'
import { FakeElement, FakeDocument, tick } from './fake-dom.mjs'

// This file is loaded with no DOM: the imports above must not throw.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const keysOf = (table) => Object.keys(table)

describe('EN', () => {
  test('is frozen, with flat dotted keys whose values are text', () => {
    assert.ok(Object.isFrozen(EN))
    for (const [key, value] of Object.entries(EN)) {
      assert.match(key, /^[a-z]+(\.[A-Za-z0-9]+)+$/, key)
      assert.equal(typeof value, 'string', key)
      assert.ok(value.length > 0, key)
    }
    assert.throws(() => {
      'use strict'
      EN['widget.empty'] = 'x'
    }, TypeError)
  })

  test('every placeholder is a plain {name}', () => {
    for (const [key, value] of Object.entries(EN)) {
      const open = value.match(/\{/g) || []
      const named = value.match(/\{\w+\}/g) || []
      assert.equal(open.length, named.length, `${key}: ${value}`)
    }
  })

  test('the Messages interface in index.d.ts types exactly the EN keys', () => {
    const dts = read('src/core/index.d.ts')
    const body = dts.match(/export interface Messages \{([\s\S]*?)\n\}/)[1]
    const typed = [...body.matchAll(/^\s+'([^']+)': string$/gm)].map((m) => m[1])
    assert.deepEqual(typed, keysOf(EN))
  })

  test('a plural family always has an .other form', () => {
    for (const key of keysOf(EN)) {
      const m = key.match(/^(.*)\.(zero|one|two|few|many)$/)
      if (m) assert.ok(`${m[1]}.other` in EN, `${m[1]} needs .other`)
    }
  })

  test('the catalog labels are the widget.<key>.label messages', () => {
    for (const [key, spec] of Object.entries(WIDGETS)) assert.equal(spec.label, EN[`widget.${key}.label`], key)
  })

  test('every size has a name and size.name reads "Medium, 2 by 2"', () => {
    const t = createMessages()
    assert.equal(sizeName(t, 'M'), 'Medium, 2 by 2')
    assert.equal(sizeName(t, 'S'), 'Small, 1 by 1')
    assert.equal(sizeName(t, 'XL'), 'Extra large, 4 by 2')
    assert.equal(sizeName(t, 'Banner'), 'Banner, 4 by 1')
    assert.equal(sizeName(t, 'nonsense'), 'nonsense')
    const de = createMessages({ 'size.M': 'Mittel', 'size.name': '{name}, {cols} × {rows}' })
    assert.equal(sizeName(de, 'M'), 'Mittel, 2 × 2')
  })
})

describe('createMessages', () => {
  test('an override wins and a missing key falls back to EN, then to the key', () => {
    const t = createMessages({ 'widget.empty': 'Keine Daten' })
    assert.equal(t('widget.empty'), 'Keine Daten')
    assert.equal(t('widget.error'), "Couldn't display this data")
    assert.equal(t('no.such.key'), 'no.such.key')
    assert.equal(createMessages()('widget.empty'), 'No data')
    assert.equal(createMessages(null)('widget.empty'), 'No data')
    assert.equal(createMessages('nope')('widget.empty'), 'No data')
  })

  test('{param} interpolation leaves an unknown placeholder as written', () => {
    const t = createMessages()
    assert.equal(t('widget.error.region', { label: 'Desk', message: 'down' }), 'Desk, error: down')
    assert.equal(t('widget.error.region', { label: 'Desk' }), 'Desk, error: {message}')
    assert.equal(t('widget.error.region'), '{label}, error: {message}')
    assert.equal(t('grid.handle', { label: 'A', size: 'M', position: 2, total: 5 }), 'A, M, position 2 of 5')
    assert.equal(t('grid.handle', { label: 'A', size: 'M', position: 0, total: 5 }), 'A, M, position 0 of 5', 'a zero is a value')
  })

  test('a value is never read again, so host data cannot inject a placeholder or a pattern', () => {
    const t = createMessages()
    assert.equal(t('grid.remove', { label: '{size} $& $1' }), 'Remove {size} $& $1')
  })

  test('only own keys and string values count', () => {
    const t = createMessages({ 'widget.empty': 7 })
    assert.equal(t('widget.empty'), 'No data')
    assert.equal(t('constructor'), 'constructor')
    assert.equal(t('toString'), 'toString')
    assert.equal(createMessages({ constructor: 'Konstruktor' })('constructor'), 'Konstruktor')
  })

  test('the REPL case: an override, and the fallback', () => {
    const t = createMessages({ 'widget.empty': 'Keine Daten' })
    assert.equal(t('widget.empty'), 'Keine Daten')
    assert.equal(t('action.retry'), 'Retry')
  })

  describe('plurals', () => {
    test('English reads .one and .other, and {count} is a parameter', () => {
      const t = createMessages(null, 'en')
      assert.equal(t('time.days', {}, 1), '1 day')
      assert.equal(t('time.days', {}, 0), '0 days')
      assert.equal(t('time.days', {}, 2), '2 days')
      assert.equal(t('grid.editStart', {}, 1), 'Editing layout, 1 tile. Tab to a tile, Space to pick it up.')
      assert.equal(t('grid.editStart', {}, 6), 'Editing layout, 6 tiles. Tab to a tile, Space to pick it up.')
      assert.equal(t('time.days', { count: '1,200' }, 1200), '1,200 days', 'a formatted count wins')
    })

    test('Polish: 2 and 22 days take few, 5 takes many', () => {
      const pl = {
        'time.days.one': '{count} dzień',
        'time.days.few': '{count} dni (few)',
        'time.days.many': '{count} dni (many)',
        'time.days.other': '{count} dnia',
      }
      const t = createMessages(pl, 'pl')
      assert.equal(t('time.days', {}, 1), '1 dzień')
      assert.equal(t('time.days', {}, 2), '2 dni (few)')
      assert.equal(t('time.days', {}, 22), '22 dni (few)')
      assert.equal(t('time.days', {}, 5), '5 dni (many)')
      assert.equal(t('time.days', {}, 12), '12 dni (many)', '12 is not few')
      assert.equal(t('time.days', {}, 1.5), '1.5 dnia')
    })

    test('the chain is .<category>, .other, then the bare key; the host table is tried before EN', () => {
      // Only .other given: a host that leaves out .one still never hears English "day".
      const t = createMessages({ 'time.days.other': '{count} Tage' }, 'de')
      assert.equal(t('time.days', {}, 1), '1 Tage')
      assert.equal(t('time.days', {}, 3), '3 Tage')
      // A bare key is the last resort for a key with no forms.
      const bare = createMessages({ 'x.items': '{count} items' })
      assert.equal(bare('x.items', {}, 4), '4 items')
      // With nothing from the host, EN answers with its own forms.
      assert.equal(createMessages({}, 'pl')('time.days', {}, 5), '5 days')
    })

    test('a bad locale falls back to English plural rules instead of throwing', () => {
      const t = createMessages(null, 'not a locale')
      assert.equal(t('time.days', {}, 1), '1 day')
    })

    test('a count that is not a number is not a plural request, and a numeric string is one', () => {
      const t = createMessages()
      assert.equal(t('time.days.other', {}, undefined), '{count} days')
      assert.equal(t('time.days.other', {}, 'many'), '{count} days')
      assert.equal(t('time.days.other', {}, ''), '{count} days')
      assert.equal(t('time.days.other', { count: 3 }, null), '3 days')
      assert.equal(t('time.days', {}, '2'), '2 days')
      assert.equal(t('time.days', {}, '1'), '1 day')
      assert.equal(t('time.days', {}, ' 1 '), '1 day')
      const pl = createMessages({ 'time.days.one': 'jeden', 'time.days.few': 'kilka', 'time.days.other': 'inne' }, 'pl')
      assert.equal(pl('time.days', {}, '22'), 'kilka')
    })

    test('text that falls back to EN is English, so it takes English plural rules in any locale', () => {
      for (const locale of ['ja-JP', 'fr-FR', 'pl', 'ar', 'ru-RU', 'not a locale', undefined]) {
        const t = createMessages(null, locale)
        assert.equal(t('equity.dayCount', {}, 0), '0 days', `${locale} 0`)
        assert.equal(t('equity.dayCount', {}, 1), '1 day', `${locale} 1`)
        assert.equal(t('equity.dayCount', {}, 2), '2 days', `${locale} 2`)
        assert.equal(t('time.days', {}, 1.5), '1.5 days', `${locale} 1.5`)
      }
    })

    test('ja-JP: a host table takes the locale’s one form for everything', () => {
      const ja = createMessages({ 'time.days.other': '{count}日' }, 'ja-JP')
      for (const n of [0, 1, 2, 22]) assert.equal(ja('time.days', {}, n), `${n}日`)
      // A key the host left out is English, with English rules: "1 day", not "1 days".
      assert.equal(ja('equity.dayCount', {}, 1), '1 day')
      assert.equal(ja('equity.dayCount', {}, 0), '0 days')
    })

    test('fr-FR: 0 and 1 are both "one" in French, and still "0 days" in the English fallback', () => {
      const fr = createMessages({ 'time.days.one': '{count} jour', 'time.days.other': '{count} jours' }, 'fr-FR')
      assert.equal(fr('time.days', {}, 0), '0 jour')
      assert.equal(fr('time.days', {}, 1), '1 jour')
      assert.equal(fr('time.days', {}, 1.5), '1.5 jour')
      assert.equal(fr('time.days', {}, 2), '2 jours')
      assert.equal(fr('equity.dayCount', {}, 0), '0 days')
      assert.equal(fr('equity.dayCount', {}, 1), '1 day')
    })
  })
})

describe('onConfigure', () => {
  afterEach(() => configure({ messages: null, locale: undefined }))

  test('fires after every configure() with the new defaults, and stops when told to', () => {
    const seen = []
    const stop = onConfigure((config) => seen.push(config))
    configure({ locale: 'de-DE' })
    configure({ messages: { 'widget.empty': 'Leer' } })
    configure({})
    assert.equal(seen.length, 3)
    assert.equal(seen[0].locale, 'de-DE')
    assert.deepEqual(seen[1].messages, { 'widget.empty': 'Leer' })
    stop()
    configure({ locale: 'fr-FR' })
    assert.equal(seen.length, 3)
    stop() // twice is harmless
  })

  test('two subscriptions of one function are separate', () => {
    let n = 0
    const fn = () => n++
    const a = onConfigure(fn)
    const b = onConfigure(fn)
    configure({})
    assert.equal(n, 2)
    a()
    configure({})
    assert.equal(n, 3)
    b()
    configure({})
    assert.equal(n, 3)
  })

  test('a listener may unsubscribe itself or another while it is called', () => {
    const seen = []
    let stopB
    const stopA = onConfigure(() => {
      seen.push('a')
      stopA()
      stopB()
    })
    stopB = onConfigure(() => seen.push('b'))
    configure({})
    configure({})
    assert.deepEqual(seen, ['a'])
  })

  test('a listener that throws does not stop the others or the configure() call', async () => {
    const caught = []
    const onError = (err) => caught.push(err.message)
    const listeners = process.listeners('uncaughtException')
    process.removeAllListeners('uncaughtException')
    process.on('uncaughtException', onError)
    const seen = []
    const stops = [onConfigure(() => { throw new Error('boom') }), onConfigure(() => seen.push('after'))]
    try {
      configure({ locale: 'en-US' })
      assert.deepEqual(seen, ['after'])
      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      stops.forEach((stop) => stop())
      process.removeListener('uncaughtException', onError)
      for (const l of listeners) process.on('uncaughtException', l)
    }
    assert.deepEqual(caught, ['boom'], 'the host still hears of it')
  })
})

describe('layers merge as strings only', () => {
  test('an undefined or a number in a nearer layer does not hide a translation', () => {
    const t = translator({ 'widget.empty': 'config' }, { 'widget.empty': 'grid', 'widget.error': 'grid error' }, { 'widget.empty': undefined, 'widget.error': 5, 'action.retry': null }, 'en')
    assert.equal(t('widget.empty'), 'grid')
    assert.equal(t('widget.error'), 'grid error')
    assert.equal(t('action.retry'), 'Retry')
  })

  test('plural forms merge key by key, each from the nearest layer that sets it', () => {
    const t = translator(null, { 'time.days.few': 'grid few', 'time.days.other': 'grid other' }, { 'time.days.one': 'own one', 'time.days.other': 'own other' }, 'pl')
    assert.equal(t('time.days', {}, 1), 'own one')
    assert.equal(t('time.days', {}, 2), 'grid few')
    assert.equal(t('time.days', {}, 5), 'own other')
  })

  test('the same tables and locale share one function, and any change makes another', () => {
    const cfg = { 'widget.empty': 'a' }
    const own = { 'widget.error': 'b' }
    assert.equal(translator(cfg, null, own, 'en'), translator(cfg, null, own, 'en'))
    assert.notEqual(translator(cfg, null, own, 'en'), translator(cfg, null, own, 'pl'))
    assert.notEqual(translator(cfg, null, own, 'en'), translator(cfg, null, { ...own }, 'en'))
    assert.notEqual(translator(cfg, null, own, 'en'), translator(cfg, own, null, 'en'))
    assert.equal(translator(null, null, null, 'en'), translator(undefined, undefined, undefined, 'en'))
  })
})

describe('configure({ messages })', () => {
  afterEach(() => configure({ messages: null }))

  test('is stored, returned by currentConfig and cleared by null', () => {
    assert.equal(currentConfig().messages, undefined)
    const table = { 'widget.empty': 'Keine Daten' }
    configure({ messages: table })
    assert.equal(currentConfig().messages, table)
    configure({ locale: 'de-DE' })
    assert.equal(currentConfig().messages, table, 'other options leave it alone')
    configure({ messages: null })
    assert.equal(currentConfig().messages, undefined)
    configure({ locale: undefined })
  })

  test('a value that is not an object clears it', () => {
    configure({ messages: { a: 'b' } })
    configure({ messages: 'nope' })
    assert.equal(currentConfig().messages, undefined)
  })
})

// ── A DOM just big enough to render every widget and the grid ───────────────

const TEXT_ATTRS = ['aria-label', 'title', 'alt', 'placeholder', 'aria-description', 'aria-roledescription']

class Node {
  constructor() {
    this.attrs = new Map()
    this.kids = new Map()
    this.children = []
    this._text = ''
    this.title = ''
    this.hidden = false
    this.style = { setProperty: (k, v) => { this.style[k] = v } }
    this.className = ''
    this.tabIndex = 0
    this.dataset = {}
    this.clientWidth = 0
    this.html = ''
    this.lanes = []
    this.listeners = []
    this.classList = { toggle() {}, add() {}, remove() {}, contains: () => false }
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v))
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null
  }
  hasAttribute(k) {
    return this.attrs.has(k)
  }
  removeAttribute(k) {
    this.attrs.delete(k)
  }
  toggleAttribute(k, force) {
    if (force) this.attrs.set(k, '')
    else this.attrs.delete(k)
    return Boolean(force)
  }
  get textContent() {
    return this._text
  }
  set textContent(v) {
    this._text = v
    // Assigning text drops the children, as in a real DOM.
    this.children = []
  }
  addEventListener() {}
  appendChild(node) {
    this.children.push(node)
    return node
  }
  append(...nodes) {
    this.children.push(...nodes)
  }
  replaceChildren(...nodes) {
    this.children = nodes
  }
  querySelector(sel) {
    if (!this.kids.has(sel)) this.kids.set(sel, new Node())
    return this.kids.get(sel)
  }
  querySelectorAll(sel) {
    return sel === '.lane' ? this.lanes : []
  }
  set innerHTML(v) {
    this.html = v
    this.kids.clear()
    // The session clock's lane rows are read back out of the markup it just wrote.
    this.lanes = Array.from({ length: (v.match(/class="lane"/g) || []).length }, () => new Node())
  }
  get innerHTML() {
    return this.html
  }
  focus() {}
  remove() {}
}

class Root extends Node {
  constructor() {
    super()
    this.section = new Node()
  }
  querySelector(sel) {
    return sel === '.tile' ? this.section : super.querySelector(sel)
  }
}

class Shadowed extends FakeElement {
  attachShadow() {
    this.shadowRoot = new Root()
    return this.shadowRoot
  }
}

// Every string a node holds or ever held, that a reader could see or hear.
function stringsOf(...roots) {
  const out = []
  const seen = new Set()
  const visit = (node) => {
    if (!node || seen.has(node)) return
    seen.add(node)
    if (node.textContent) out.push(node.textContent)
    if (node.title) out.push(node.title)
    for (const k of TEXT_ATTRS) if (node.attrs.get(k)) out.push(node.attrs.get(k))
    for (const child of node.kids.values()) visit(child)
    for (const child of node.children) visit(child)
    for (const lane of node.lanes) visit(lane)
  }
  for (const root of roots) visit(root)
  return out
}

// ── The pseudo-locale ───────────────────────────────────────────────────────

const WRAP = /⟦[^⟦⟧]*⟧/g
const PSEUDO = Object.fromEntries(Object.entries(EN).map(([key, value]) => [key, `⟦${value}⟧`]))

// What is left of `text` once every wrapped message, every piece of host data
// and every duration word the formatter wrote is taken out: any letter still
// there is English nobody chose.
function leaks(text, host = []) {
  let s = text
  for (let n = s.length; n; ) {
    s = s.replace(WRAP, ' ')
    if (s.length === n) break
    n = s.length
  }
  for (const h of [...host].sort((a, b) => b.length - a.length)) s = s.split(h).join(' ')
  // A message split around a value (the words before and after a time) leaves one half open at each end.
  s = s.replace(/⟦[^⟧]*$/, ' ').replace(/^[^⟦]*⟧/, ' ')
  s = s.replace(/\d+[hms]\b/g, ' ').replace(/[⟦⟧]/g, ' ')
  return /\p{L}/u.test(s) ? s.trim() : ''
}

// The text in markup that is not inside a tag, and the values of attributes a reader hears.
function markupLeaks(html) {
  const found = []
  for (const m of html.matchAll(/>([^<]*)</g)) if (/\p{L}/u.test(m[1])) found.push(m[1].trim())
  for (const m of html.matchAll(/\s(aria-label|title|alt|placeholder|aria-description|aria-roledescription)="([^"]*)"/g)) if (m[2]) found.push(`${m[1]}="${m[2]}"`)
  return found
}

describe('the pseudo-locale test', () => {
  test('the detector finds English and lets wrapped messages, host data and fmt words through', () => {
    assert.equal(leaks('⟦Retry⟧'), '')
    assert.match(leaks('⟦Retry⟧ · now'), /now/)
    assert.equal(leaks('Desk, ⟦up 12%⟧', ['Desk']), '')
    assert.equal(leaks('Desk, ⟦up 12%⟧'), 'Desk,')
    assert.equal(leaks('⟦⟦Equity⟧ · ⟦3 days⟧⟧'), '')
    assert.equal(leaks('⟦a ⟦b⟧ English⟧'), '')
    assert.equal(leaks('3h 48m left'), 'left')
    assert.equal(leaks('+₹2,185.65 ▲'), '')
    assert.deepEqual(markupLeaks('<span class="lb">Net</span><i aria-label="">'), ['Net'])
    assert.deepEqual(markupLeaks('<button aria-label="Close" data-k="x"></button>'), ['aria-label="Close"'])
    assert.deepEqual(markupLeaks('<div class="hd"><span data-k="label"></span></div>'), [])
  })
})

describe('every widget and the grid, in the pseudo-locale', () => {
  let C // the widget classes, loaded against the fake HTMLElement
  let Grid
  const today = Date.UTC(2026, 9, 12)
  const ist = (h, m) => today + (h * 60 + m) * 60000 - 330 * 60000

  // Words the formatter and Intl write, which the host chose by choosing a locale.
  const intl = (locale, opts, n) => Array.from({ length: n }, (_, i) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).format(Date.UTC(2026, i % 12, 1 + (i % 7))))
  const WORDS = [...new Set([...intl('en-IN', { month: 'short' }, 12), ...intl('en-IN', { weekday: 'short' }, 14), 'IST'])]

  before(async () => {
    globalThis.HTMLElement = Shadowed
    globalThis.document = Object.assign(new FakeDocument(), { createElement: (tag) => Object.assign(new Node(), tag === 'template' ? { content: { cloneNode: () => new Node() } } : {}) })
    const [pnl, equity, clock, card, metric, chart] = await Promise.all([
      import('../src/elements/today-pnl.js'),
      import('../src/elements/equity-curve.js'),
      import('../src/elements/session-clock.js'),
      import('../src/elements/card.js'),
      import('../src/elements/metric.js'),
      import('../src/elements/series-chart.js'),
    ])
    C = { TsTodayPnl: pnl.TsTodayPnl, TsEquityCurve: equity.TsEquityCurve, TsSessionClock: clock.TsSessionClock, TsCard: card.TsCard, TsMetric: metric.TsMetric, TsChart: chart.TsChart }
    Grid = (await import('../src/elements/grid.js')).TsGrid
    delete globalThis.HTMLElement
    configure({ messages: PSEUDO })
  })
  after(() => {
    configure({ messages: null })
    delete globalThis.document
  })
  afterEach(() => globalThis.document.reset())

  const calendar = createCalendar({ sessions: [presets.nse({ segment: 'derivatives' }), presets.mcx({ years: [2026] })] })
  const days = Array.from({ length: 14 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, pnl: (i % 3 === 0 ? -1 : 1) * (150 + i * 10), trades: 3 }))
  const intraday = [[9, 15, 0], [9, 45, -640], [10, 30, 900], [12, 0, 1400], [15, 0, 2185.65]].map(([h, m, v]) => ({ t: ist(h, m), v }))
  const points = (n, k) => Array.from({ length: n }, (_, i) => ({ x: ist(9, 15) + i * 600000, y: 100 + k * 5 + i * 3 }))

  // [class name, variants, host attributes, data, host strings]
  const CASES = [
    ['TsTodayPnl', ['S', 'Wide', 'M'], { label: 'Desk P&L' }, {
      net: 2185.65, realized: 1860, unrealized: 412.95, fees: 87.3, closedCount: 3, openCount: 1, live: true, asOf: ist(14, 5), intraday,
      marks: [{ t: ist(10, 30), kind: 'entry' }, { t: ist(12, 0), kind: 'exit', label: 'Breakout' }], window: { from: ist(9, 15), to: ist(15, 30) },
    }, ['Desk P&L', 'Breakout']],
    ['TsEquityCurve', ['Wide', 'M', 'XL'], {}, { days, fees: 40, trades: 31, live: true }, []],
    ['TsSessionClock', ['S', 'Banner'], { label: 'Markets' }, { calendar, sessions: ['nse-fo', 'mcx'], timeframes: [5, 90] }, ['Markets', 'NSE F&O', 'MCX', 'nse-fo', 'mcx']],
    ['TsCard', ['S', 'Wide', 'M'], { label: 'Notes', live: '', 'as-of': '2026-10-12T14:05:00Z' }, { asOf: ist(14, 5), live: true }, ['Notes']],
    ['TsMetric', ['S', 'Wide', 'M'], { label: 'Signups' }, {
      value: 1204, previous: 1075, compareLabel: 'vs last week', series: [3, 5, 4, 8, 6], target: 1500, caption: 'New accounts', live: true, asOf: ist(14, 5),
    }, ['Signups', 'vs last week', 'New accounts']],
    ['TsChart', ['Wide', 'M', 'L', 'XL'], { label: 'Revenue' }, {
      series: [{ name: 'Revenue', points: points(8, 0) }, { points: points(8, 1) }, { name: 'Cost', points: [] }], live: true, asOf: ist(14, 5),
    }, ['Revenue', 'Cost']],
  ]

  // The session clock ticks itself, which would keep the process alive.
  const built = []
  afterEach(() => {
    for (const el of built.splice(0)) if (el.isConnected) el.disconnect()
  })
  const build = (name, attrs, size) => {
    const el = new C[name]()
    built.push(el)
    for (const [k, v] of Object.entries({ locale: 'en-IN', currency: 'INR', 'time-zone': 'Asia/Kolkata', ...attrs })) el.setAttribute(k, v)
    if (size) el.setAttribute('size', size)
    el.clock = () => ist(11, 42)
    return el
  }
  const draw = async (el) => {
    el.connect()
    await tick()
    return el
  }
  const everything = (el) => stringsOf(el.shadowRoot)
  const check = (el, host, what) => {
    for (const text of everything(el)) assert.equal(leaks(text, [...WORDS, ...host]), '', `${what}: ${JSON.stringify(text)}`)
  }

  for (const [name, variants, attrs, data, host] of CASES) {
    describe(name, () => {
      for (const variant of variants) {
        test(`content at ${variant}: every string is wrapped, formatted or host data`, async () => {
          const el = build(name, attrs, variant)
          el.data = data
          await draw(el)
          const seen = everything(el)
          assert.ok(seen.length >= 2, 'something was drawn')
          check(el, host, `${name} ${variant}`)
          // Not only fine: it really came from the table.
          assert.ok(seen.some((s) => s.includes('⟦')), 'at least one message was used')
        })

        test(`the label comes from the table at ${variant} when the host gives none`, async () => {
          if (name === 'TsCard') return
          const el = build(name, {}, variant)
          el.data = data
          await draw(el)
          const region = el.shadowRoot.section.getAttribute('aria-label')
          assert.match(region, /^⟦/, region)
        })
      }

      test('static markup: the templates and skeletons hold no words, and no hearable attribute', () => {
        for (const variant of variants) {
          for (const html of [C[name].template(variant), C[name].skeleton(variant)]) assert.deepEqual(markupLeaks(html), [], `${name} ${variant}`)
        }
      })

      test('the loading, empty and error views', async () => {
        const loading = await draw(build(name, attrs, variants[0]))
        if (name !== 'TsCard') {
          check(loading, host, `${name} loading`)
          assert.deepEqual(markupLeaks(loading.shadowRoot.section.html), [])
        }

        const empty = build(name, attrs, variants[0])
        empty.data = null
        await draw(empty)
        check(empty, host, `${name} empty`)
        assert.deepEqual(markupLeaks(empty.shadowRoot.section.html), [])

        const failed = build(name, attrs, variants[0])
        failed.data = data
        failed.actions = ['retry']
        failed.state = 'error'
        await draw(failed)
        check(failed, host, `${name} error`)
        assert.deepEqual(markupLeaks(failed.shadowRoot.section.html), [])
        assert.equal(failed.shadowRoot.section.querySelector('[data-k="retry"]').textContent, '⟦Retry⟧')

        // The host's own message is host data, whatever else the view says.
        failed.error = 'Feed disconnected'
        await tick()
        check(failed, [...host, 'Feed disconnected'], `${name} error with a message`)
      })
    })
  }

  const roundTheClock = createCalendar({ sessions: [{ id: 'crypto', label: 'Crypto', timeZone: 'UTC', days: [1, 2, 3, 4, 5, 6, 7], open: '00:00', close: '00:00' }] })

  test('the session clock: a closed market, a far open, no calendar, an unknown session and one that never closes', async () => {
    const saturday = Date.UTC(2026, 9, 10, 8, 0)
    const cases = [
      [{ calendar, sessions: ['nse-fo'] }, saturday],
      [{ calendar, sessions: ['nse-fo', 'mcx'], timeframes: [15] }, ist(7, 0)],
      [{ sessions: ['nse-fo'] }, ist(11, 0)],
      [{ calendar, sessions: ['nope'] }, ist(11, 0)],
      [{ calendar, sessions: [] }, ist(11, 0)],
      // A session that never closes says 'Open 24/7' through t, like the rest.
      [{ calendar: roundTheClock, sessions: ['crypto'], timeframes: [15] }, ist(11, 0)],
    ]
    for (const variant of ['S', 'Banner']) {
      for (const [data, now] of cases) {
        const el = build('TsSessionClock', { label: 'Markets' }, variant)
        el.clock = () => now
        el.data = data
        await draw(el)
        check(el, ['Markets', 'NSE F&O', 'MCX', 'nse-fo', 'mcx', 'nope', 'Crypto', 'crypto', 'UTC'], `session clock ${variant}`)
      }
    }
  })

  test('the equity curve: no days, and a range that keeps none', async () => {
    for (const [data, range] of [[{ days: [] }, undefined], [{ days, trades: 5 }, '1W'], [{ days: days.slice(0, 1) }, 'All']]) {
      for (const variant of ['Wide', 'M', 'XL']) {
        const el = build('TsEquityCurve', range ? { range } : {}, variant)
        el.data = data
        await draw(el)
        check(el, [], `equity ${variant}`)
      }
    }
  })

  test('the metric and the chart with a falling value, no change and no points', async () => {
    for (const data of [{ value: 90, previous: 100 }, { value: 100, previous: 100 }, { value: 5 }]) {
      for (const variant of ['S', 'Wide', 'M']) {
        const el = build('TsMetric', {}, variant)
        el.data = data
        await draw(el)
        check(el, [], `metric ${variant}`)
      }
    }
    const el = build('TsChart', {}, 'M')
    el.data = { series: [] }
    await draw(el)
    check(el, [], 'chart with no series')
  })

  describe('the grid', () => {
    const make = () => new Grid()
    const grid = (g) => stringsOf(g.shadowRoot)

    test('its static chrome texts come from the table', () => {
      const g = make()
      const seen = grid(g)
      for (const key of ['grid.undo', 'grid.editLayout', 'grid.editingGroup', 'grid.done', 'grid.emptyBoard', 'grid.instructions']) {
        assert.ok(seen.includes(PSEUDO[key]), key)
      }
      for (const text of seen) assert.equal(leaks(text), '', text)
    })

    test('the handle, remove and resize names are messages around the host label', () => {
      const g = make()
      const tile = { getAttribute: (k) => (k === 'item' ? 'pnl' : null), spec: WIDGETS.todayPnl, localName: 'ts-today-pnl' }
      g._tiles.set('pnl', tile)
      g._order = [{ id: 'pnl', type: 'todayPnl', size: 'M' }]
      g._chrome('pnl')
      const names = stringsOf(...g._chromes.values())
      assert.equal(names.length, 4)
      for (const text of names) assert.equal(leaks(text), '', text)
      // No label attribute and the catalog entry's English default: the message wins.
      assert.ok(names.every((s) => s.includes("⟦Today's P&L⟧") || s.includes('⟦')), JSON.stringify(names))
      assert.equal(g._label('pnl'), "⟦Today's P&L⟧")
      tile.getAttribute = (k) => (k === 'item' ? 'pnl' : k === 'label' ? 'Desk' : null)
      assert.equal(g._label('pnl'), 'Desk', 'the host label stays')
    })

    test('a grid announces and toasts nothing but messages', () => {
      const source = read('src/elements/grid.js')
      const calls = [...source.matchAll(/_(?:announce|showToast)\((.*)\)/g)].map((m) => m[1])
      assert.ok(calls.length >= 12, `found ${calls.length}`)
      for (const arg of calls) {
        if (arg === 'text' || arg === 'text, action' || arg === 'message' || arg === 'said') continue // the methods' own parameters
        assert.match(arg, /^(this\.)?t\(/, arg)
      }
    })
  })
})

// ── Resolution: element → grid → configure → EN ─────────────────────────────

describe('which table a widget reads', () => {
  let Card
  let Metric

  before(async () => {
    globalThis.HTMLElement = Shadowed
    globalThis.document = Object.assign(new FakeDocument(), { createElement: (tag) => Object.assign(new Node(), tag === 'template' ? { content: { cloneNode: () => new Node() } } : {}) })
    Card = (await import('../src/elements/card.js')).TsCard
    Metric = (await import('../src/elements/metric.js')).TsMetric
    delete globalThis.HTMLElement
  })
  after(() => delete globalThis.document)
  afterEach(() => {
    configure({ messages: null, locale: undefined })
    globalThis.document.reset()
  })

  const withGrid = (el, grid) => {
    const parent = { localName: 'ts-grid', parentElement: null, messages: grid.messages ?? null, getAttribute: (k) => grid.attrs?.[k] ?? null }
    el.parentElement = parent
    return parent
  }

  test('English when nothing is set, and the same function until something changes', () => {
    const el = new Card()
    assert.equal(el.t('widget.empty'), 'No data')
    assert.equal(el.t, el.t, 'cached')
    assert.equal(el.messages, null)
  })

  test('element, then nearest grid, then configure(), then EN, one key at a time', () => {
    configure({ messages: { 'widget.empty': 'from configure', 'widget.error': 'error from configure', 'action.retry': 'retry from configure' } })
    const el = new Card()
    const grid = withGrid(el, { messages: { 'widget.empty': 'from grid', 'widget.error': 'error from grid' } })
    el.messages = { 'widget.empty': 'from element' }
    assert.equal(el.t('widget.empty'), 'from element')
    assert.equal(el.t('widget.error'), 'error from grid')
    assert.equal(el.t('action.retry'), 'retry from configure')
    assert.equal(el.t('widget.error.region', { label: 'a', message: 'b' }), 'a, error: b', 'EN for the rest')
    el.messages = null
    assert.equal(el.t('widget.empty'), 'from grid')
    grid.messages = null
    assert.equal(el.t('widget.empty'), 'from configure')
    configure({ messages: null })
    assert.equal(el.t('widget.empty'), 'No data')
  })

  test('t is rebuilt when a table or the locale changes, and only then', () => {
    const el = new Card()
    const first = el.t
    configure({ messages: { 'widget.empty': 'a' } })
    const second = el.t
    assert.notEqual(second, first)
    assert.equal(el.t, second)
    el.messages = { 'widget.empty': 'b' }
    assert.notEqual(el.t, second)
    const third = el.t
    el.setAttribute('locale', 'pl')
    assert.notEqual(el.t, third, 'the locale picks plural forms')
  })

  test('plural forms follow the locale: the element, then its grid, then configure()', () => {
    const table = { 'time.days.one': 'jeden', 'time.days.few': 'kilka', 'time.days.many': 'wiele', 'time.days.other': 'inne' }
    const el = new Card()
    el.messages = table
    assert.equal(el.t('time.days', {}, 22), 'inne', 'English rules: 22 is other')
    el.setAttribute('locale', 'pl')
    assert.equal(el.t('time.days', {}, 22), 'kilka')
    assert.equal(el.t('time.days', {}, 5), 'wiele')
    el.removeAttribute('locale')
    withGrid(el, { attrs: { locale: 'pl' } })
    assert.equal(el.t('time.days', {}, 2), 'kilka')
    el.parentElement = null
    configure({ locale: 'pl' })
    assert.equal(el.t('time.days', {}, 2), 'kilka')
  })

  test('messages is a property that renders again, and a value that is not an object clears it', async () => {
    const el = new Card()
    el.setAttribute('label', 'Notes')
    el.connect()
    await tick()
    el.data = null
    await tick()
    const empty = () => el.shadowRoot.section.querySelector('[data-k="empty"]').textContent
    assert.equal(empty(), 'No data')
    el.messages = { 'widget.empty': 'Keine Daten' }
    await tick()
    assert.equal(empty(), 'Keine Daten')
    el.messages = 'nope'
    assert.equal(el.messages, null)
    await tick()
    assert.equal(empty(), 'No data')
  })

  test('a property set before the element was defined is applied on connect', async () => {
    const el = new Card()
    Object.defineProperty(el, 'messages', { value: { 'widget.empty': 'Vorab' }, configurable: true, writable: true, enumerable: true })
    el.connect()
    await tick()
    assert.equal(el.t('widget.empty'), 'Vorab')
  })

  test('the view model gets t, and it is the element’s', async () => {
    const seen = []
    const Probe = class extends Metric {
      static viewModel(data, variant, ctx) {
        seen.push(ctx.t)
        return super.viewModel(data, variant, ctx)
      }
    }
    const el = new Probe()
    el.messages = { 'metric.target': 'Ziel' }
    el.data = { value: 1 }
    el.connect()
    await tick()
    assert.equal(seen[0], el.t)
    assert.equal(seen[0]('metric.target'), 'Ziel')
  })

  test('the empty text: the host wins over the class, and a widget author’s own text still works', async () => {
    const empty = async (el) => {
      el.data = null
      el.connect()
      await tick()
      return el.shadowRoot.section.querySelector('[data-k="empty"]').textContent
    }
    // A built-in's default is its EN value.
    assert.equal(Metric.emptyText, EN['widget.metric.empty'])
    assert.equal(await empty(new Metric()), 'No data yet')
    // The host overrides widget.<catalogKey>.empty.
    const translated = new Metric()
    translated.messages = { 'widget.metric.empty': 'Noch keine Daten' }
    assert.equal(await empty(translated), 'Noch keine Daten')
    // A widget author sets emptyText and the host has said nothing.
    const Custom = class extends Metric {
      static emptyText = 'Nothing here'
    }
    assert.equal(await empty(new Custom()), 'Nothing here')
    // The host still wins over the author.
    const both = new Custom()
    both.messages = { 'widget.metric.empty': 'Hier nichts' }
    assert.equal(await empty(both), 'Hier nichts')
    // A widget with no catalog key falls to widget.empty, which the host can override too.
    const Plain = class extends Metric {
      static catalogKey = null
      static emptyText = EN['widget.empty']
    }
    const plain = new Plain()
    plain.messages = { 'widget.empty': 'Leer' }
    assert.equal(await empty(plain), 'Leer')
  })

  test('the base empty text equals its EN value, and every built-in empty text equals its own', async () => {
    const { TsWidget } = await import('../src/elements/widget.js')
    assert.equal(TsWidget.emptyText, EN['widget.empty'])
    for (const [file, cls, key] of [
      ['today-pnl', 'TsTodayPnl', 'todayPnl'],
      ['equity-curve', 'TsEquityCurve', 'equityCurve'],
      ['session-clock', 'TsSessionClock', 'sessionClock'],
      ['metric', 'TsMetric', 'metric'],
      ['series-chart', 'TsChart', 'chart'],
    ]) {
      const C = (await import(`../src/elements/${file}.js`))[cls]
      assert.equal(C.emptyText, EN[`widget.${key}.empty`], cls)
    }
  })

  test('a catalog widget’s label is its message, the attribute wins, and a host spec is left alone', () => {
    const el = new Metric()
    assert.equal(el.label, 'Metric')
    el.messages = { 'widget.metric.label': 'Kennzahl' }
    assert.equal(el.label, 'Kennzahl')
    el.setAttribute('label', 'Anmeldungen')
    assert.equal(el.label, 'Anmeldungen')
    const Own = class extends Metric {
      static catalogKey = null
      static spec = { label: 'Signups', sizes: ['S'] }
    }
    const own = new Own()
    own.messages = { 'widget.metric.label': 'Kennzahl' }
    assert.equal(own.label, 'Signups')
  })

  test('configure({ messages }) after mount updates a mounted widget, and clearing it puts English back', async () => {
    const el = new Card()
    el.setAttribute('label', 'Notes')
    el.data = null
    el.connect()
    await tick()
    const empty = () => el.shadowRoot.section.querySelector('[data-k="empty"]').textContent
    assert.equal(empty(), 'No data')
    configure({ messages: { 'widget.empty': 'Keine Daten' } })
    await tick()
    assert.equal(empty(), 'Keine Daten')
    configure({ messages: null })
    await tick()
    assert.equal(empty(), 'No data')
    el.disconnect()
  })

  test('configure() draws a mounted widget once however many options change', async () => {
    const el = new Card()
    el.setAttribute('label', 'Notes')
    el.data = { asOf: Date.UTC(2026, 9, 12, 14, 5) }
    el.setAttribute('time-zone', 'UTC')
    el.connect()
    await tick()
    let renders = 0
    const draw = el._draw.bind(el)
    el._draw = (...args) => {
      renders++
      return draw(...args)
    }
    configure({ locale: 'de-DE', currency: 'EUR', messages: { 'widget.empty': 'Leer' } })
    await tick()
    assert.equal(renders, 1)
    el.disconnect()
  })

  test('a widget that left the page is not drawn again, and nothing keeps it', async () => {
    const stayed = new Card()
    const left = new Card()
    const calls = []
    for (const [name, el] of [['stayed', stayed], ['left', left]]) {
      el.setAttribute('label', name)
      el.data = null
      el.invalidate = () => calls.push(name)
      el.connect()
    }
    await tick()
    configure({ locale: 'en-GB' })
    assert.deepEqual(calls.sort(), ['left', 'stayed'])
    calls.length = 0
    left.disconnect()
    configure({ locale: 'en-US' })
    assert.deepEqual(calls, ['stayed'])
    stayed.disconnect()
    calls.length = 0
    configure({ locale: 'en-GB' })
    assert.deepEqual(calls, [], 'the last widget gone, nobody is listening')
    // Connecting again listens again.
    stayed.connect()
    configure({ locale: 'en-US' })
    assert.deepEqual(calls, ['stayed'])
    stayed.disconnect()
  })

  test('elements with the same tables and locale share one translate function', () => {
    configure({ messages: { 'widget.empty': 'Leer' } })
    const a = new Card()
    const b = new Card()
    assert.equal(a.t, b.t)
    b.messages = { 'widget.error': 'Fehler' }
    assert.notEqual(a.t, b.t)
  })

  test('an element’s undefined or non-string value does not hide the grid’s or configure()’s text', () => {
    configure({ messages: { 'widget.error': 'from configure' } })
    const el = new Card()
    withGrid(el, { messages: { 'widget.empty': 'from grid' } })
    el.messages = { 'widget.empty': undefined, 'widget.error': 5 }
    assert.equal(el.t('widget.empty'), 'from grid')
    assert.equal(el.t('widget.error'), 'from configure')
  })
})

describe('a grid tells the widgets under it', () => {
  let Grid
  let Card

  before(async () => {
    globalThis.HTMLElement = Shadowed
    globalThis.document = Object.assign(new FakeDocument(), { createElement: (tag) => Object.assign(new Node(), tag === 'template' ? { content: { cloneNode: () => new Node() } } : {}) })
    Card = (await import('../src/elements/card.js')).TsCard
    Grid = (await import('../src/elements/grid.js')).TsGrid
    delete globalThis.HTMLElement
  })
  after(() => delete globalThis.document)
  afterEach(() => {
    configure({ messages: null, locale: undefined })
    globalThis.document.reset()
  })

  const makeGrid = (attrs = {}) => {
    const g = new Grid()
    g.localName = 'ts-grid'
    g.focus = () => {}
    for (const [k, v] of Object.entries(attrs)) g.setAttribute(k, v)
    return g
  }
  // A widget inside a host component's shadow root, which is inside the grid.
  const nested = (grid) => {
    const host = { localName: 'x-host', parentElement: grid, getRootNode: () => ({}) }
    const card = new Card()
    card.setAttribute('label', 'Notes')
    card.getRootNode = () => ({ host })
    return card
  }
  const empty = (el) => el.shadowRoot.section.querySelector('[data-k="empty"]').textContent

  test('a widget links on connect, even through a shadow root, and unlinks on disconnect', async () => {
    const g = makeGrid()
    const card = nested(g)
    card.data = null
    card.connect()
    await tick()
    assert.ok(g._widgets.has(card))
    card.disconnect()
    assert.equal(g._widgets.size, 0)
  })

  test('grid.messages reaches a widget nested in a host component’s shadow root', async () => {
    const g = makeGrid()
    const card = nested(g)
    card.data = null
    card.connect()
    await tick()
    assert.equal(empty(card), 'No data')
    g.messages = { 'widget.empty': 'Leer' }
    await tick()
    assert.equal(empty(card), 'Leer')
    g.messages = null
    await tick()
    assert.equal(empty(card), 'No data')
    card.disconnect()
  })

  test('the grid’s locale change draws its widgets again, and picks plural forms for them', async () => {
    const g = makeGrid()
    g.messages = { 'time.days.one': 'eins', 'time.days.few': 'wenige', 'time.days.many': 'viele', 'time.days.other': 'andere' }
    const card = nested(g)
    card.data = null
    card.connect()
    await tick()
    let drawn = 0
    const invalidate = card.invalidate.bind(card)
    card.invalidate = () => {
      drawn++
      invalidate()
    }
    assert.equal(card.t('time.days', {}, 22), 'andere')
    g.setAttribute('locale', 'pl')
    assert.equal(drawn, 1)
    assert.equal(card.t('time.days', {}, 22), 'wenige')
    card.disconnect()
  })

  test('a moved widget unlinks from the old grid and links to the new one', async () => {
    const one = makeGrid()
    const two = makeGrid()
    const card = nested(one)
    card.data = null
    card.connect()
    await tick()
    card.disconnect()
    card.getRootNode = nested(two).getRootNode
    card.connect()
    await tick()
    assert.equal(one._widgets.size, 0)
    assert.ok(two._widgets.has(card))
    card.disconnect()
  })

  test('a grid that was not defined yet is linked at the next render', async () => {
    const card = new Card()
    card.setAttribute('label', 'Notes')
    card.data = null
    card.parentElement = { localName: 'ts-grid', parentElement: null, getAttribute: () => null }
    card.connect()
    await tick()
    const g = makeGrid()
    card.parentElement = g
    card.requestRender()
    await tick()
    assert.ok(g._widgets.has(card))
    card.disconnect()
  })

  test('the grid writes its own strings again from new messages', () => {
    const g = makeGrid()
    assert.equal(g._editBtn.textContent, 'Edit layout')
    g.messages = { 'grid.editLayout': 'Layout bearbeiten', 'grid.done': 'Fertig' }
    assert.equal(g._editBtn.textContent, 'Layout bearbeiten')
    assert.equal(g._pill.querySelector('.done').textContent, 'Fertig')
    assert.equal(g._toastUndo.textContent, 'Undo')
  })

  test('a connected, measured grid redoes its controls after a messages or locale change', () => {
    const g = makeGrid()
    let synced = 0
    g.isConnected = true
    g._m = {}
    g._syncControls = () => synced++
    g.messages = { 'grid.addBack': 'Zurück ({count})' }
    assert.equal(synced, 1)
    g.setAttribute('locale', 'de-DE')
    assert.equal(synced, 2)
  })

  test('Add back (N) and its list are written from the current messages', () => {
    const g = makeGrid()
    Object.defineProperty(g, 'hiddenItems', { get: () => [{ id: 'a', type: 'card', label: 'Alpha' }] })
    g._editing = true
    g._rendered = true
    g._m = {}
    g.isConnected = true
    g._syncControls()
    const add = g._pill.querySelector('.add')
    assert.equal(add.querySelector('.t').textContent, 'Add back (1)')
    g.messages = { 'grid.addBack': 'Zurück ({count})', 'grid.hiddenHeading': 'Ausgeblendet' }
    assert.equal(add.querySelector('.t').textContent, 'Zurück (1)')
    assert.equal(g._pill.querySelector('.menu').children[0].textContent, 'Ausgeblendet')
  })

  test('the board’s name follows the messages; a host’s own aria-label wins and is never rewritten', () => {
    const label = (g) => g._board.getAttribute('aria-label')
    const mine = makeGrid()
    assert.equal(label(mine), 'Dashboard')
    mine.messages = { 'grid.dashboard': 'Tableau' }
    assert.equal(label(mine), 'Tableau')
    mine.messages = null
    assert.equal(label(mine), 'Dashboard')
    assert.equal(mine.getAttribute('aria-label'), null, 'the host itself is not named')

    const hosts = makeGrid({ 'aria-label': 'Desk' })
    assert.equal(label(hosts), 'Desk')
    hosts.messages = { 'grid.dashboard': 'Tableau' }
    assert.equal(label(hosts), 'Desk')
    assert.equal(hosts.getAttribute('aria-label'), 'Desk')

    // The host names it, renames it and then drops the name: the board follows each step.
    const renamed = makeGrid()
    renamed.setAttribute('aria-label', 'Board')
    assert.equal(label(renamed), 'Board')
    renamed.messages = { 'grid.dashboard': 'Tableau' }
    assert.equal(label(renamed), 'Board')
    renamed.removeAttribute('aria-label')
    assert.equal(label(renamed), 'Tableau')
  })

  test('the fallback focus goes to the board and adds no role or name to the host', () => {
    const g = makeGrid()
    let focused = null
    g._board.focus = () => { focused = g._board }
    g._focus(g)
    assert.equal(focused, g._board)
    assert.equal(g._board.getAttribute('tabindex'), '-1')
    assert.equal(g.getAttribute('role'), null)
    assert.equal(g.getAttribute('aria-label'), null)
    assert.equal(g.getAttribute('tabindex'), null)
  })

  test('configure() reaches a grid’s own text', () => {
    const g = makeGrid()
    const stop = onConfigure(() => g._refreshText())
    configure({ messages: { 'grid.editLayout': 'Layout bearbeiten' } })
    assert.equal(g._editBtn.textContent, 'Layout bearbeiten')
    stop()
  })
})

// ── What the source may say ─────────────────────────────────────────────────

describe('the source', () => {
  const files = readdirSync(new URL('../src/elements/', import.meta.url)).filter((f) => f.endsWith('.js'))
  const FAMILY = /^(widget|action|size|time|grid|pnl|equity|session|metric|chart|table|progress|funding|calendar|edge|watchlist|positions|picker|controls|list|category)\./

  // Every string literal in the elements' source that is shaped like a key of one of the families, in single or double quotes or backticks.
  // A template literal with a ${…} in it is not a literal key; those are covered below, from the lists they are built from.
  const literalKeys = () => {
    const found = new Map()
    for (const file of files) {
      for (const m of read(`src/elements/${file}`).matchAll(/(['"`])([A-Za-z]+\.[A-Za-z0-9.]+)\1/g)) {
        if (FAMILY.test(m[2])) found.set(m[2], [...(found.get(m[2]) || []), file])
      }
    }
    return found
  }
  const isKey = (key) => key in EN || `${key}.other` in EN

  test('the finder sees keys in every kind of quote', () => {
    const sample = ["t('grid.undo')", 't("grid.undo")', 't(`grid.undo`)']
    for (const code of sample) assert.deepEqual([...code.matchAll(/(['"`])([A-Za-z]+\.[A-Za-z0-9.]+)\1/g)].map((m) => m[2]), ['grid.undo'], code)
    assert.deepEqual([...'`widget.${key}.label`'.matchAll(/(['"`])([A-Za-z]+\.[A-Za-z0-9.]+)\1/g)], [])
  })

  test('every key the code names exists in EN', () => {
    const found = literalKeys()
    assert.ok(found.size > 60, `found ${found.size}`)
    for (const [key, where] of found) assert.ok(isKey(key), `${where[0]} names ${key}, which EN lacks`)
  })

  // The keys the code builds at run time, from the lists they are built from.
  const built = () => [
    ...Object.keys(WIDGETS).map((key) => `widget.${key}.label`),
    // The picker reads each entry's sentence and group from the catalog, and the grid controls name a profile as controls.<profile>.
    ...Object.entries(WIDGETS).flatMap(([key, spec]) => [`widget.${key}.description`, `category.${spec.category}`]),
    ...BUILT_IN_PROFILES.map((profile) => `controls.${profile}`),
    ...['1W', '1M', '3M', 'YTD', 'All'].map((range) => `equity.range${range}`),
    ...['1W', '1M', '3M', 'YTD', 'All'].map((range) => `equity.range${range}.long`),
  ]

  test('the keys built at run time exist too', () => {
    for (const key of built()) assert.ok(key in EN, key)
    for (const size of SIZE_NAMES) assert.ok(`size.${size}` in EN, size)
    assert.equal(SIZE_NAMES.length, 7)
  })

  // The other direction: a key nothing uses is text shipped to every host for nothing.
  // These are the exceptions, each with its reason. Add to this list only with one.
  const UNUSED_ON_PURPOSE = [
    // The plural proof of RFC 0003 §1.2 and the Polish test: `time.days` is the example every other plural key follows.
    'time.days.one',
    'time.days.other',
    // Size names are built by sizeName(), which the picker and the layout list will call; the grid reads the bare token for now.
    ...SIZE_NAMES.map((size) => `size.${size}`),
    'size.name',
  ]

  test('every EN key is used by the code, or listed as unused on purpose', () => {
    const used = new Set([...literalKeys().keys(), ...built()])
    const unused = Object.keys(EN).filter((key) => {
      const base = key.replace(/\.(zero|one|two|few|many|other)$/, '')
      return !used.has(key) && !used.has(base) && !UNUSED_ON_PURPOSE.includes(key)
    })
    assert.deepEqual(unused, [])
    // And the list does not keep a key that is used after all or gone.
    for (const key of UNUSED_ON_PURPOSE) assert.ok(key in EN, `${key} is not in EN`)
    for (const key of ['time.days.one', 'time.days.other']) assert.ok(!used.has(key) && !used.has('time.days'), `${key} is used now: take it off the list`)
  })

  test('no template or view model writes an English literal into the page', () => {
    for (const file of files) {
      if (file === 'dev.js' || file === 'default-tokens.js') continue
      const source = read(`src/elements/${file}`)
      const literal = /\.(?:textContent|title|placeholder) = (['"`])[^'"`$\n]*\p{L}/u
      assert.doesNotMatch(source, literal, `${file} writes a literal into the page`)
      assert.doesNotMatch(source, /setAttribute\('(?:aria-label|title|aria-description|aria-roledescription)', ['"`][^'"`$\n]*\p{L}/u, `${file} sets a literal name`)
    }
  })

  test('nothing exports a table of English any more', () => {
    for (const file of files) assert.doesNotMatch(read(`src/elements/${file}`), /export const STRINGS\b/, file)
    assert.doesNotMatch(read('src/elements/grid.js'), /^const TEXT = /m)
  })
})
