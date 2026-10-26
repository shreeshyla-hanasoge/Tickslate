import { test, describe, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { define, defineWidget, widgetCatalog, onCatalogChange } from '../src/elements/registry.js'
import { DEV, warnOnce, resetWarnings } from '../src/elements/dev.js'
import { version, WIDGETS, EN } from '../src/core/index.js'
import { classDefaultsOf, translator } from '../src/elements/messages-cache.js'
import { pickerItems } from '../src/elements/picker-model.js'

// Only the two methods define() uses.
class FakeRegistry {
  constructor() {
    this.map = new Map()
    this.defined = []
  }
  get(tag) {
    return this.map.get(tag)
  }
  define(tag, ctor) {
    this.defined.push(tag)
    this.map.set(tag, ctor)
  }
}

describe('dev helpers', () => {
  let warnings
  beforeEach(() => {
    resetWarnings()
    warnings = []
    mock.method(console, 'warn', (m) => warnings.push(m))
  })
  afterEach(() => mock.restoreAll())

  test('DEV is on in unbundled source', () => {
    assert.equal(DEV, true)
  })

  test('warnOnce prefixes the message and fires once per key', () => {
    warnOnce('a', 'first')
    warnOnce('a', 'again')
    warnOnce('b', 'other')
    assert.deepEqual(warnings, ['tickslate: first', 'tickslate: other'])
  })

  test('resetWarnings lets a key warn again', () => {
    warnOnce('a', 'one')
    resetWarnings()
    warnOnce('a', 'two')
    assert.deepEqual(warnings, ['tickslate: one', 'tickslate: two'])
  })
})

describe('define', () => {
  let registry
  let warnings
  beforeEach(() => {
    resetWarnings()
    registry = new FakeRegistry()
    globalThis.customElements = registry
    warnings = []
    mock.method(console, 'warn', (m) => warnings.push(m))
  })
  afterEach(() => {
    delete globalThis.customElements
    mock.restoreAll()
  })

  test('registers the class and stamps the core version', () => {
    class A {}
    define('x-a', A)
    assert.equal(registry.get('x-a'), A)
    assert.equal(A.tickslateVersion, version)
  })

  test('defining the same class again does nothing, not even a warning', () => {
    class A {}
    define('x-a', A)
    define('x-a', A)
    assert.deepEqual(registry.defined, ['x-a'])
    assert.deepEqual(warnings, [])
  })

  test('a collision with another Tickslate copy warns once, naming both versions', () => {
    class Old {}
    Old.tickslateVersion = '0.0.0-old'
    registry.define('x-a', Old)
    class Mine {}
    define('x-a', Mine)
    define('x-a', Mine)
    assert.equal(registry.get('x-a'), Old)
    assert.deepEqual(warnings, [`tickslate: <x-a> is already defined by Tickslate 0.0.0-old, so this copy (${version}) was not registered.`])
  })

  test('a collision with a non-Tickslate element says so', () => {
    registry.define('x-a', class Other {})
    define('x-a', class Mine {})
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /^tickslate: <x-a> is already defined by a non-Tickslate element, so this copy/)
  })

  test('without customElements it does nothing', () => {
    delete globalThis.customElements
    class A {}
    define('x-a', A)
    assert.equal(A.tickslateVersion, undefined)
  })
})

// The registry's state is module-level, as RFC 0003 §3 asks, so these tests
// give each widget a type and a tag of its own instead of resetting it.
describe('defineWidget, widgetCatalog and onCatalogChange (RFC 0003 §3)', () => {
  let registry
  let heard
  let stop
  let errors
  beforeEach(() => {
    resetWarnings()
    registry = new FakeRegistry()
    globalThis.customElements = registry
    heard = []
    stop = onCatalogChange((type) => heard.push(type))
    errors = []
    mock.method(console, 'error', (...args) => errors.push(args))
  })
  afterEach(() => {
    stop()
    delete globalThis.customElements
    mock.restoreAll()
  })

  const widget = (spec = { label: 'MRR', sizes: ['S', 'Wide'] }) => {
    class W {}
    W.spec = spec
    return W
  }

  test('defines the tag, records the spec under the type and says so', () => {
    const W = widget({ label: 'Signups', sizes: ['Wide', 'M'], description: 'New signups.', category: 'Growth' })
    defineWidget('acme-signups', W, { type: 'signups' })
    assert.equal(registry.get('acme-signups'), W)
    assert.equal(W.tickslateVersion, version)
    assert.deepEqual(widgetCatalog().signups, { tag: 'acme-signups', label: 'Signups', sizes: ['Wide', 'M'], description: 'New signups.', category: 'Growth' })
    assert.deepEqual(heard, ['signups'])
  })

  test('the same class again does nothing: no second define, no second notice', () => {
    const W = widget()
    defineWidget('acme-again', W, { type: 'again' })
    const before = widgetCatalog()
    defineWidget('acme-again', W, { type: 'again' })
    assert.deepEqual(registry.defined, ['acme-again'])
    assert.deepEqual(heard, ['again'])
    assert.equal(widgetCatalog(), before)
  })

  test('throws for a built-in key, and records nothing', () => {
    for (const type of Object.keys(WIDGETS)) {
      assert.throws(() => defineWidget('acme-builtin', widget(), { type }), (err) => err instanceof TypeError && err.message.includes(`'${type}' is a built-in`))
    }
    assert.deepEqual(registry.defined, [])
    assert.deepEqual(heard, [])
    assert.equal(widgetCatalog().todayPnl, WIDGETS.todayPnl)
  })

  test('throws for a type another class recorded, and keeps the first', () => {
    const First = widget({ label: 'First', sizes: ['S'] })
    defineWidget('acme-first', First, { type: 'taken' })
    assert.throws(() => defineWidget('acme-second', widget({ label: 'Second', sizes: ['S'] }), { type: 'taken' }), /type 'taken' is already recorded by another class \(<acme-first>\)/)
    assert.equal(widgetCatalog().taken.label, 'First')
    assert.equal(registry.get('acme-second'), undefined)
    assert.deepEqual(heard, ['taken'])
  })

  test('throws for a tag another class owns, whoever defined it', () => {
    class Other {}
    registry.define('acme-owned', Other)
    assert.throws(() => defineWidget('acme-owned', widget(), { type: 'owned' }), /<acme-owned> is already defined by another class/)
    class Old {}
    Old.tickslateVersion = '0.0.0-old'
    registry.define('acme-old', Old)
    assert.throws(() => defineWidget('acme-old', widget(), { type: 'old' }), /<acme-old> is already defined by Tickslate 0.0.0-old/)
    // The failed calls left no trace.
    assert.equal(widgetCatalog().owned, undefined)
    assert.equal(widgetCatalog().old, undefined)
    assert.equal(registry.get('acme-owned'), Other)
    assert.deepEqual(heard, [])
  })

  test('throws for a tag recorded under another type, with or without a DOM', () => {
    defineWidget('acme-pair', widget(), { type: 'pair' })
    assert.throws(() => defineWidget('acme-pair', widget(), { type: 'pair2' }), /<acme-pair> is already recorded under type 'pair' by another class/)
    delete globalThis.customElements
    assert.throws(() => defineWidget('acme-pair', widget(), { type: 'pair3' }), /<acme-pair> is already recorded under type 'pair' by another class/)
  })

  test('one class cannot be recorded under two types, nor one type under two tags', () => {
    const W = widget()
    defineWidget('acme-one', W, { type: 'one' })
    assert.throws(() => defineWidget('acme-one', W, { type: 'uno' }), /already recorded under type 'one'/)
    assert.throws(() => defineWidget('acme-eins', W, { type: 'one' }), /already recorded as <acme-one> under 'one'/)
  })

  test('throws for a spec with no valid size', () => {
    for (const spec of [null, {}, { label: 'x' }, { label: 'x', sizes: [] }, { label: 'x', sizes: ['Huge', 4] }, { label: 'x', sizes: 'S' }]) {
      class W {}
      W.spec = spec
      assert.throws(() => defineWidget('acme-nosize', W, { type: 'nosize' }), /needs at least one valid size/)
    }
    assert.deepEqual(registry.defined, [])
    assert.equal(widgetCatalog().nosize, undefined)
  })

  test('throws without a type or a class', () => {
    assert.throws(() => defineWidget('acme-x', widget()), TypeError)
    assert.throws(() => defineWidget('acme-x', widget(), {}), /needs options.type/)
    assert.throws(() => defineWidget('acme-x', widget(), { type: '' }), TypeError)
    assert.throws(() => defineWidget('acme-x', {}, { type: 'x' }), TypeError)
    assert.throws(() => defineWidget(null, widget(), { type: 'x' }), TypeError)
  })

  test('a tag the browser refuses is not recorded', () => {
    registry.define = () => {
      throw new Error('invalid name')
    }
    assert.throws(() => defineWidget('nohyphen', widget(), { type: 'refused' }), /invalid name/)
    assert.equal(widgetCatalog().refused, undefined)
    assert.deepEqual(heard, [])
  })

  test('the recorded spec is validated and frozen: bad sizes dropped, a missing label is empty', () => {
    const W = widget({ sizes: ['S', 'Nope', 'S', 'Banner'], phoneRows: { Banner: 2, S: 0, Wide: 1.5, Bogus: 3 }, description: 7, category: null })
    defineWidget('acme-plain', W, { type: 'plain' })
    const spec = widgetCatalog().plain
    assert.deepEqual(spec, { tag: 'acme-plain', label: '', sizes: ['S', 'Banner'], phoneRows: { Banner: 2 } })
    assert.ok(Object.isFrozen(spec) && Object.isFrozen(spec.sizes) && Object.isFrozen(spec.phoneRows))
  })

  test('works with no DOM at all: it records and notifies, as on a server', () => {
    delete globalThis.customElements
    defineWidget('acme-ssr', widget(), { type: 'ssr' })
    assert.equal(widgetCatalog().ssr.tag, 'acme-ssr')
    assert.deepEqual(heard, ['ssr'])
  })

  test('a type called __proto__ is a type, not a prototype', () => {
    defineWidget('acme-proto', widget(), { type: '__proto__' })
    assert.ok(Object.prototype.hasOwnProperty.call(widgetCatalog(), '__proto__'))
    assert.equal(Object.getPrototypeOf(widgetCatalog()), Object.prototype)
  })

  test('widgetCatalog is a frozen merge of WIDGETS and the registered specs', () => {
    defineWidget('acme-merge', widget(), { type: 'merge' })
    const catalog = widgetCatalog()
    assert.ok(Object.isFrozen(catalog))
    for (const key of Object.keys(WIDGETS)) assert.equal(catalog[key], WIDGETS[key])
    assert.equal(catalog.merge.tag, 'acme-merge')
    assert.throws(() => {
      'use strict'
      catalog.merge = null
    }, TypeError)
    // The built-in table itself is never written to.
    assert.equal(WIDGETS.merge, undefined)
  })

  test('widgetCatalog is the same object until the next registration', () => {
    const a = widgetCatalog()
    assert.equal(widgetCatalog(), a)
    defineWidget('acme-cache', widget(), { type: 'cache' })
    const b = widgetCatalog()
    assert.notEqual(b, a)
    assert.equal(widgetCatalog(), b)
    // A call that registered nothing leaves the cache alone.
    defineWidget('acme-cache', registry.get('acme-cache'), { type: 'cache' })
    assert.equal(widgetCatalog(), b)
    assert.throws(() => defineWidget('acme-cache2', widget(), { type: 'todayPnl' }))
    assert.equal(widgetCatalog(), b)
  })

  test('listeners run after the registration, so the catalog already holds the type', () => {
    let seen
    const off = onCatalogChange((type) => (seen = widgetCatalog()[type]))
    defineWidget('acme-after', widget(), { type: 'after' })
    off()
    assert.equal(seen.tag, 'acme-after')
  })

  test('onCatalogChange returns an unsubscribe that stops it, and is safe to call twice', () => {
    const calls = []
    const off = onCatalogChange((type) => calls.push(type))
    defineWidget('acme-sub1', widget(), { type: 'sub1' })
    off()
    off()
    defineWidget('acme-sub2', widget(), { type: 'sub2' })
    assert.deepEqual(calls, ['sub1'])
  })

  test('the same function subscribed twice runs twice, and each unsubscribe stops one', () => {
    const calls = []
    const fn = (type) => calls.push(type)
    const off1 = onCatalogChange(fn)
    const off2 = onCatalogChange(fn)
    defineWidget('acme-twice', widget(), { type: 'twice' })
    assert.deepEqual(calls, ['twice', 'twice'])
    off1()
    defineWidget('acme-twice2', widget(), { type: 'twice2' })
    assert.deepEqual(calls, ['twice', 'twice', 'twice2'])
    off2()
  })

  test('a listener may unsubscribe itself without skipping the next one', () => {
    const order = []
    const off = onCatalogChange(() => {
      order.push('first')
      off()
    })
    const off2 = onCatalogChange(() => order.push('second'))
    defineWidget('acme-self', widget(), { type: 'self' })
    defineWidget('acme-self2', widget(), { type: 'self2' })
    off2()
    assert.deepEqual(order, ['first', 'second', 'second'])
  })

  test('a listener that throws is reported and does not stop the others or undo the registration', () => {
    const calls = []
    const offBad = onCatalogChange(() => {
      throw new Error('broken listener')
    })
    const offGood = onCatalogChange((type) => calls.push(type))
    defineWidget('acme-throws', widget(), { type: 'throws' })
    offBad()
    offGood()
    assert.deepEqual(calls, ['throws'])
    assert.equal(widgetCatalog().throws.tag, 'acme-throws')
    assert.equal(errors.length, 1)
    assert.match(errors[0][0], /an onCatalogChange listener threw for 'throws'/)
  })

  test('a listener that another listener stopped during the dispatch does not run', () => {
    const order = []
    let offSecond
    const offFirst = onCatalogChange(() => {
      order.push('first')
      offSecond()
    })
    offSecond = onCatalogChange(() => order.push('second'))
    defineWidget('acme-stopped', widget(), { type: 'stopped' })
    offFirst()
    assert.deepEqual(order, ['first'])
  })

  test('throws for a class with a catalogKey, set on it or inherited, and says why', () => {
    class Own {}
    Own.spec = { label: 'x', sizes: ['S'] }
    Own.catalogKey = 'metric'
    assert.throws(() => defineWidget('acme-own-key', Own, { type: 'own-key' }), (err) => err instanceof TypeError && /catalogKey 'metric'.*built-in 'metric' spec/.test(err.message))
    class Metric {}
    Metric.catalogKey = 'metric'
    class Sub extends Metric {}
    Sub.spec = { label: 'x', sizes: ['S'] }
    assert.throws(() => defineWidget('acme-sub-key', Sub, { type: 'sub-key' }), /catalogKey 'metric'/)
    // Clearing it on the subclass is the way out.
    class Cleared extends Metric {}
    Cleared.catalogKey = null
    Cleared.spec = { label: 'Cleared', sizes: ['S'] }
    defineWidget('acme-cleared', Cleared, { type: 'cleared' })
    assert.equal(widgetCatalog().cleared.label, 'Cleared')
    assert.equal(widgetCatalog()['own-key'], undefined)
  })

  test('the recorded spec is a snapshot: changing the static spec afterwards does not change the catalog', () => {
    const W = widget({ label: 'Before', sizes: ['S'] })
    defineWidget('acme-snap', W, { type: 'snap' })
    W.spec = { label: 'After', sizes: ['S', 'Wide'] }
    assert.equal(widgetCatalog().snap.label, 'Before')
    assert.deepEqual([...widgetCatalog().snap.sizes], ['S'])
  })

  test('re-evaluating a module makes a new class, which throws; the same class object is the only no-op', () => {
    const make = () => widget({ label: 'Hot', sizes: ['S'] })
    const first = make()
    defineWidget('acme-hot', first, { type: 'acme-hot' })
    defineWidget('acme-hot', first, { type: 'acme-hot' })
    assert.throws(() => defineWidget('acme-hot', make(), { type: 'acme-hot' }), /type 'acme-hot' is already recorded by another class/)
    // The guard the guide shows leaves the first class in place.
    const guarded = make()
    if (!widgetCatalog()['acme-hot']) defineWidget('acme-hot', guarded, { type: 'acme-hot' })
    assert.equal(registry.get('acme-hot'), first)
  })

  describe('messages: a custom widget\'s English defaults (RFC 0004 §10.2)', () => {
    const MESSAGES = { 'widget.dflt.label': 'Defaults', 'dflt.hello': 'Hello {who}', 'dflt.items.one': '{count} item', 'dflt.items.other': '{count} items' }

    test('are stored frozen and copied, and fill a label and description the class left out', () => {
      const W = widget({ sizes: ['S'] })
      const given = { ...MESSAGES, 'widget.dflt.description': 'Says hello.' }
      defineWidget('acme-dflt', W, { type: 'dflt', messages: given })
      given['dflt.hello'] = 'changed after'
      const { type, table } = classDefaultsOf(W)
      assert.equal(type, 'dflt')
      assert.equal(table['dflt.hello'], 'Hello {who}')
      assert.ok(Object.isFrozen(table))
      // Not copied into the spec: the grid and the picker ask t(), so a host's override reaches them.
      assert.equal(widgetCatalog().dflt.label, '')
      assert.equal(widgetCatalog().dflt.description, undefined)
      const t = translator(null, null, null, 'en')
      assert.equal(t('widget.dflt.label'), 'Defaults')
      assert.equal(t('widget.dflt.description'), 'Says hello.')
      assert.equal(translator({ 'widget.dflt.label': 'Host' }, null, null, 'en')('widget.dflt.label'), 'Host')
    })

    test('the picker entry shows the author\'s words, and the host\'s when it overrides them', () => {
      defineWidget('acme-pick', widget({ sizes: ['S'] }), { type: 'pick', messages: { 'widget.pick.label': 'Author label', 'widget.pick.description': 'Author text.' } })
      const item = (host) => pickerItems({ catalog: widgetCatalog(), addTypes: ['pick'], t: translator(host, null, null, 'en'), locale: 'en' })[0].items[0]
      assert.equal(item(null).label, 'Author label')
      assert.equal(item(null).description, 'Author text.')
      const over = item({ 'widget.pick.label': 'Host label', 'widget.pick.description': 'Host text.' })
      assert.equal(over.label, 'Host label')
      assert.equal(over.description, 'Host text.')
    })

    test('a message wins over a static label, so the tile and the catalog name the widget alike', () => {
      defineWidget('acme-both', widget({ label: 'Static', sizes: ['S'] }), { type: 'both', messages: { 'widget.both.label': 'Message' } })
      assert.equal(widgetCatalog().both.label, '')
      assert.equal(translator(null, null, null, 'en')('widget.both.label'), 'Message')
    })

    test('a static label with no message stays the name', () => {
      defineWidget('acme-fixed', widget({ label: 'Fixed', sizes: ['S'] }), { type: 'fixed', messages: { 'fixed.x': 'x' } })
      assert.equal(widgetCatalog().fixed.label, 'Fixed')
    })

    test('a subclass resolves the registered defaults through the prototype chain', () => {
      const W = widget()
      defineWidget('acme-base', W, { type: 'base', messages: { 'base.hello': 'Hi' } })
      class Sub extends W {}
      assert.equal(classDefaultsOf(Sub), classDefaultsOf(W))
      class Own extends W {}
      Own.spec = { label: 'Own', sizes: ['S'] }
      defineWidget('acme-own', Own, { type: 'own', messages: { 'own.x': 'x' } })
      assert.equal(classDefaultsOf(Own).type, 'own')
    })

    test('answer after the host\'s tables and before EN, with English plural rules', () => {
      const t = translator(null, null, null, 'pl', MESSAGES)
      assert.equal(t('dflt.hello', { who: 'there' }), 'Hello there')
      assert.equal(t('dflt.items', {}, 1), '1 item')
      assert.equal(t('dflt.items', {}, 5), '5 items')
      // A built-in key is still answered by EN.
      assert.equal(t('action.retry'), EN['action.retry'])
      // The host wins at every layer, in the order element, grid, configure().
      assert.equal(translator({ 'dflt.hello': 'config' }, null, null, 'en', MESSAGES)('dflt.hello'), 'config')
      assert.equal(translator({ 'dflt.hello': 'config' }, { 'dflt.hello': 'grid' }, null, 'en', MESSAGES)('dflt.hello'), 'grid')
      assert.equal(translator({ 'dflt.hello': 'config' }, { 'dflt.hello': 'grid' }, { 'dflt.hello': 'own' }, 'en', MESSAGES)('dflt.hello'), 'own')
      // A host that translates only one plural form keeps the author's other forms.
      const some = translator({ 'dflt.items.other': '{count} Stück' }, null, null, 'de', MESSAGES)
      assert.equal(some('dflt.items', {}, 3), '3 Stück')
      assert.equal(some('dflt.items', {}, 1), '1 Stück')
    })

    test('a key nobody has comes back as itself', () => {
      assert.equal(translator(null, null, null, 'en', MESSAGES)('dflt.unknown'), 'dflt.unknown')
    })

    test('onCatalogChange hears of the type after the defaults are stored', () => {
      const W = widget({ sizes: ['S'] })
      let seen
      const off = onCatalogChange(() => {
        seen = classDefaultsOf(W)
      })
      defineWidget('acme-heard', W, { type: 'heard', messages: { 'heard.x': 'x' } })
      off()
      assert.equal(seen.table['heard.x'], 'x')
    })

    test('throw for a key outside the prefix, a built-in key, a non-string and a non-object, and record nothing', () => {
      const bad = (messages, pattern) => {
        const W = widget()
        assert.throws(() => defineWidget('acme-bad', W, { type: 'bad', messages }), pattern)
        assert.equal(widgetCatalog().bad, undefined)
        assert.equal(registry.get('acme-bad'), undefined)
        assert.equal(classDefaultsOf(W), null)
      }
      bad({ 'other.hello': 'Hi' }, /must start with 'widget\.bad\.' or 'bad\.'/)
      bad({ 'badly.hello': 'Hi' }, /must start with/)
      bad({ 'bad.ok': 'fine', 'action.retry': 'Again' }, /must start with/)
      bad({ 'bad.n': 5 }, /must be a string/)
      bad('nope', /must be an object/)
      bad([], /must be an object/)
      assert.deepEqual(heard, [])
    })

    test('a key that EN already has throws, even under the widget\'s own prefix', () => {
      const key = Object.keys(EN)[0]
      const type = key.split('.')[0]
      assert.throws(() => defineWidget('acme-en', widget(), { type, messages: { [key]: 'mine' } }), /one of Tickslate's own messages/)
    })

    test('a repeat call with different messages warns once and keeps the first; the same table is silent', () => {
      const warnings = []
      mock.method(console, 'warn', (m) => warnings.push(m))
      const W = widget()
      defineWidget('acme-rep', W, { type: 'rep', messages: { 'rep.a': 'first' } })
      defineWidget('acme-rep', W, { type: 'rep', messages: { 'rep.a': 'first' } })
      defineWidget('acme-rep', W, { type: 'rep' })
      assert.deepEqual(warnings, [])
      defineWidget('acme-rep', W, { type: 'rep', messages: { 'rep.a': 'second' } })
      defineWidget('acme-rep', W, { type: 'rep', messages: { 'rep.a': 'third' } })
      assert.equal(warnings.length, 1)
      assert.match(warnings[0], /different messages, so the first table is kept/)
      assert.equal(classDefaultsOf(W).table['rep.a'], 'first')
    })

    test('a class registered without messages has a type and no table, and a host\'s keys for it still apply', () => {
      const W = widget({ sizes: ['S'] })
      defineWidget('acme-none', W, { type: 'none' })
      assert.deepEqual(classDefaultsOf(W), { type: 'none', table: null })
      const item = (host) => pickerItems({ catalog: widgetCatalog(), addTypes: ['none'], t: translator(host, null, null, 'en'), locale: 'en' })[0].items[0]
      assert.equal(item({ 'widget.none.label': 'Host name' }).label, 'Host name')
    })
  })

  test('onCatalogChange needs a function', () => {
    assert.throws(() => onCatalogChange('nope'), TypeError)
    assert.throws(() => onCatalogChange(), TypeError)
  })
})
