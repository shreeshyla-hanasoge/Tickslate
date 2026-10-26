// Hostile and broken layouts (RFC 0004 §8.2). readLayout is fed 10,000 values from a fixed seed: it must never
// throw, must always return a layout inside the caps, and must stay fast. The seed is in every failure message, so
// a failing value is rebuilt by calling valueAt(SEED, index).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readLayout, WIDGETS, BUILT_IN_PROFILES, isSize } from '../src/core/index.js'

const SEED = 0x7ac15a7e
const RUNS = 10000
// Generous on purpose: a call over this is a bug in readLayout, but a slow shared runner must not be one.
const CEILING_MS = 5

// mulberry32: small, fast and the same on every engine.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STRINGS = ['', ' ', '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', '<img src=x onerror=alert(1)>', '"><svg onload=alert(1)>', 'javascript:alert(1)', 'market', 'closed', 'S', 'M', 'Wide', 'Banner', 'metric', 'ts-metric', 'a\u0000b', '‮', 'é'.repeat(40)]
const NUMBERS = [0, -0, 1, -1, 0.5, 1e308, -1e308, Infinity, -Infinity, 2 ** 53, 4294967295]
const widgetIds = Object.keys(WIDGETS)

function valueAt(seed, index) {
  const rand = mulberry32((seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0)
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const int = (n) => Math.floor(rand() * n)

  const string = () => {
    const r = rand()
    if (r < 0.5) return pick(STRINGS)
    if (r < 0.6) return 'x'.repeat(int(400))
    if (r < 0.7) return pick(widgetIds)
    return Array.from({ length: int(12) }, () => String.fromCharCode(32 + int(95))).join('')
  }

  const json = (depth) => {
    const r = rand()
    if (depth <= 0 || r < 0.35) {
      const leaf = int(5)
      if (leaf === 0) return string()
      if (leaf === 1) return pick(NUMBERS)
      if (leaf === 2) return rand() < 0.5
      if (leaf === 3) return null
      return Math.round(rand() * 1e6) / 1000
    }
    if (r < 0.65) return Array.from({ length: rand() < 0.05 ? 100 + int(51) : int(8) }, () => json(depth - 1))
    const object = {}
    for (let i = int(6); i > 0; i--) Object.defineProperty(object, string(), { value: json(depth - 1), enumerable: true, configurable: true, writable: true })
    return object
  }

  const item = () => {
    const out = { id: rand() < 0.1 ? string() : `${pick(widgetIds)}${int(40)}`, size: rand() < 0.15 ? string() : pick(['S', 'M', 'Wide', 'Banner', 'L']) }
    if (rand() < 0.2) out.type = rand() < 0.7 ? pick(widgetIds) : string()
    return out
  }

  // A layout that is nearly right: correct shape, then one field wrong.
  const nearlyRight = () => {
    const profiles = {}
    for (let p = int(24); p > 0; p--) profiles[rand() < 0.3 ? pick(['market', 'closed']) : `p${int(40)}`] = Array.from({ length: rand() < 0.1 ? 90 + int(70) : int(10) }, item)
    const layout = { version: 1, device: pick(['desktop', 'phone']), profiles }
    if (rand() < 0.5) layout.topStrip = Array.from({ length: int(6) }, () => (rand() < 0.5 ? `${pick(widgetIds)}${int(40)}` : string()))
    const wrong = int(7)
    if (wrong === 0) layout.version = json(1)
    else if (wrong === 1) layout.device = json(1)
    else if (wrong === 2) layout.profiles = json(2)
    else if (wrong === 3) layout.topStrip = json(2)
    else if (wrong === 4) layout.profiles[pick(['market', 'x'])] = json(2)
    return layout
  }

  const r = rand()
  if (r < 0.4) return nearlyRight()
  if (r < 0.55) return Array.from({ length: int(160) }, item)
  return json(6)
}

function assertValid(result, maxItems = 100, maxProfiles = 20) {
  const { layout, issues } = result
  assert.ok(Array.isArray(issues))
  assert.equal(layout.version, 1)
  assert.ok(layout.device === 'desktop' || layout.device === 'phone')
  const names = Object.keys(layout.profiles)
  assert.ok(names.length <= Math.max(maxProfiles, BUILT_IN_PROFILES.length), `${names.length} profiles`)
  for (const name of BUILT_IN_PROFILES) assert.ok(Array.isArray(layout.profiles[name]))
  for (const name of names) {
    const list = layout.profiles[name]
    assert.ok(Array.isArray(list) && list.length <= maxItems, `${list.length} items in ${name}`)
    for (const item of list) {
      assert.equal(typeof item.id, 'string')
      assert.ok(item.id !== '' && item.id.length <= 128)
      assert.ok(isSize(item.size))
    }
  }
  if (layout.topStrip) assert.ok(layout.topStrip.length <= 3)
}

test(`readLayout survives ${RUNS} seeded random values (seed ${SEED})`, () => {
  let slowest = 0
  for (let i = 0; i < RUNS; i++) {
    const input = valueAt(SEED, i)
    for (const options of [undefined, { unknown: 'keep', device: 'phone' }]) {
      let result
      const start = performance.now()
      try {
        result = readLayout(input, options)
      } catch (error) {
        assert.fail(`readLayout threw for seed ${SEED} index ${i}: ${error && error.message}`)
      }
      let took = performance.now() - start
      // A pause (garbage collection, a busy runner) is not a slow algorithm: a call over the ceiling is timed twice
      // more and fails only if every attempt is slow. The result is deterministic, so the repeats read the same thing.
      for (let again = 0; again < 2 && took >= CEILING_MS; again++) {
        const t = performance.now()
        readLayout(input, options)
        took = Math.min(took, performance.now() - t)
      }
      slowest = Math.max(slowest, took)
      assert.ok(took < CEILING_MS, `readLayout took ${took.toFixed(2)} ms for seed ${SEED} index ${i}`)
      try {
        assertValid(result)
      } catch (error) {
        error.message = `${error.message} (seed ${SEED} index ${i})`
        throw error
      }
    }
  }
  console.log(`# fuzz seed ${SEED}: ${RUNS} values, slowest call ${slowest.toFixed(3)} ms`)
})

test('the generator is deterministic', () => {
  assert.deepEqual(valueAt(SEED, 123), valueAt(SEED, 123))
  assert.notDeepEqual(valueAt(SEED, 1), valueAt(SEED, 2))
})

const items = (n, prefix = 'a') => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, size: 'S', type: 'metric' }))
const codes = (r) => r.issues.map((i) => i.code)

test('items: 100 are read, 101 are capped with one issue', () => {
  const at100 = readLayout({ version: 1, device: 'desktop', profiles: { market: items(100), closed: [] } })
  assert.equal(at100.layout.profiles.market.length, 100)
  assert.deepEqual(at100.issues, [])
  const at101 = readLayout({ version: 1, device: 'desktop', profiles: { market: items(101), closed: [] } })
  assert.equal(at101.layout.profiles.market.length, 100)
  assert.deepEqual(at101.issues.map((i) => [i.path, i.code, i.fixed]), [['profiles.market', 'too-many-items', 'dropped']])
  assert.match(at101.issues[0].message, /Profile "market" has 101 items; only the first 100 are read\./)
})

test('items: only the first 100 entries are read, valid or not', () => {
  const list = [...Array.from({ length: 100 }, () => null), ...items(5)]
  const { layout, issues } = readLayout({ version: 1, device: 'desktop', profiles: { market: list, closed: [] } })
  assert.deepEqual(layout.profiles.market, [])
  assert.equal(issues.filter((i) => i.code === 'too-many-items').length, 1)
  assert.equal(issues.filter((i) => i.code === 'bad-shape').length, 100)
})

test('items: a bare array is capped too, and a huge sparse list costs one comparison', () => {
  assert.equal(readLayout(items(130)).layout.profiles.market.length, 100)
  const huge = new Array(5e7)
  const start = performance.now()
  const result = readLayout({ version: 1, device: 'desktop', profiles: { market: huge, closed: [] } })
  assert.ok(performance.now() - start < 50)
  assert.deepEqual(codes(result), ['too-many-items'])
})

test('profiles: 20 are read, 21 are capped with one issue, built-ins first', () => {
  const profiles = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, []]))
  const at18 = readLayout({ version: 1, device: 'desktop', profiles: profiles(18) })
  assert.equal(Object.keys(at18.layout.profiles).length, 20)
  assert.deepEqual(at18.issues, [])
  const over = readLayout({ version: 1, device: 'desktop', profiles: { ...profiles(25), market: [{ id: 'metric', size: 'S' }], closed: [] } })
  assert.equal(Object.keys(over.layout.profiles).length, 20)
  assert.equal(over.layout.profiles.market.length, 1)
  assert.ok('closed' in over.layout.profiles)
  assert.deepEqual(over.issues.map((i) => [i.path, i.code, i.fixed]), [['profiles', 'too-many-profiles', 'dropped']])
  const exactly20 = readLayout({ version: 1, device: 'desktop', profiles: { ...profiles(18), market: [], closed: [] } })
  assert.deepEqual(exactly20.issues, [])
  assert.equal(Object.keys(exactly20.layout.profiles).length, 20)
})

test('ids: 128 characters are kept, 129 are dropped as bad-shape', () => {
  const read = (id) => readLayout({ version: 1, device: 'desktop', profiles: { market: [{ id, size: 'S', type: 'metric' }], closed: [] } })
  assert.equal(read('a'.repeat(128)).layout.profiles.market.length, 1)
  const long = read('a'.repeat(129))
  assert.equal(long.layout.profiles.market.length, 0)
  assert.deepEqual(long.issues.map((i) => [i.code, i.fixed]), [['bad-shape', 'dropped']])
  assert.match(long.issues[0].message, /longer than 128 characters/)
  const strip = readLayout({ version: 1, device: 'desktop', profiles: { market: [{ id: 'a'.repeat(128), size: 'S', type: 'metric' }], closed: [] }, topStrip: ['a'.repeat(128), 'b'.repeat(129)] })
  assert.deepEqual(strip.layout.topStrip, ['a'.repeat(128)])
  assert.deepEqual(codes(strip), ['bad-shape'])
})

test('options: maxItems and maxProfiles change a direct read, and a bad value is ignored', () => {
  const input = { version: 1, device: 'desktop', profiles: { market: items(150), closed: [] } }
  assert.equal(readLayout(input, { maxItems: 150 }).layout.profiles.market.length, 150)
  assert.equal(readLayout(input, { maxItems: Infinity }).layout.profiles.market.length, 150)
  assert.equal(readLayout(input, { maxItems: 5 }).layout.profiles.market.length, 5)
  for (const bad of [0, -1, 1.5, NaN, '5', null, {}]) assert.equal(readLayout(input, { maxItems: bad }).layout.profiles.market.length, 100)
  const many = { version: 1, device: 'desktop', profiles: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`p${i}`, []])) }
  assert.equal(Object.keys(readLayout(many, { maxProfiles: Infinity }).layout.profiles).length, 32)
  assert.equal(Object.keys(readLayout(many, { maxProfiles: 5 }).layout.profiles).length, 5)
  assert.equal(Object.keys(readLayout(many, { maxProfiles: 'x' }).layout.profiles).length, 20)
})

test('topStrip: a million entries cost one comparison and a short read, with one issue', () => {
  const base = { version: 1, device: 'desktop', profiles: { market: [{ id: 'a', size: 'S', type: 'metric' }], closed: [] } }
  const big = Array.from({ length: 1e6 }, () => 'a')
  const start = performance.now()
  const result = readLayout({ ...base, topStrip: big })
  assert.ok(performance.now() - start < 50, 'a million-entry strip took too long')
  assert.deepEqual(result.layout.topStrip, ['a'])
  const capped = result.issues.filter((i) => i.code === 'too-many-items')
  assert.deepEqual(capped.map((i) => [i.path, i.fixed]), [['topStrip', 'dropped']])
  assert.ok(result.issues.length <= 34, `${result.issues.length} issues`)
  // At the limit nothing is capped.
  assert.equal(readLayout({ ...base, topStrip: big.slice(0, 32) }).issues.filter((i) => i.code === 'too-many-items').length, 0)
})

test('input that is not JSON: cycles, deep nesting, throwing getters, Proxies and null options never throw', () => {
  const cyclic = { version: 1, device: 'desktop', profiles: { market: [], closed: [] } }
  cyclic.profiles.market.push(cyclic, { id: 'a', size: 'S', type: 'metric', self: cyclic })
  cyclic.self = cyclic
  assert.deepEqual(readLayout(cyclic).layout.profiles.market, [{ id: 'a', size: 'S', type: 'metric' }])
  let deep = {}
  for (let i = 0; i < 200000; i++) deep = { deeper: deep }
  assert.equal(readLayout(deep).layout.version, 1)
  assert.equal(readLayout({ version: 1, device: 'desktop', profiles: { market: [], closed: [] } }, null).layout.version, 1)

  const thrower = () => {
    throw new Error('boom')
  }
  const getters = [
    { version: 1, device: 'desktop', get profiles() { return thrower() } },
    { version: 1, device: 'desktop', profiles: { market: [{ get id() { return thrower() }, size: 'S' }], closed: [] } },
    { version: 1, device: 'desktop', profiles: { market: [], closed: [] }, get topStrip() { return thrower() } },
    new Proxy({}, { get: thrower, ownKeys: thrower, getPrototypeOf: thrower }),
    new Proxy([], { get: thrower }),
    { version: 1, device: { toString: thrower, toJSON: thrower }, profiles: {} },
  ]
  for (const input of getters) {
    for (const options of [undefined, null, { unknown: 'keep', device: 'phone' }]) {
      const { layout, issues } = readLayout(input, options)
      assertValid({ layout, issues })
      assert.ok(issues.some((i) => i.code === 'bad-shape'))
    }
  }
  // The device option is still honoured on the replacement layout.
  assert.equal(readLayout(getters[0], { device: 'phone' }).layout.device, 'phone')
  // A catalog or option that throws is caught too.
  const bad = { get catalog() { return thrower() } }
  assert.deepEqual(readLayout({ version: 1, device: 'desktop', profiles: {} }, bad).layout.profiles, { market: [], closed: [] })
})
