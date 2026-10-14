import { test, describe, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { define } from '../src/elements/registry.js'
import { DEV, warnOnce, resetWarnings } from '../src/elements/dev.js'
import { version } from '../src/core/index.js'

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
