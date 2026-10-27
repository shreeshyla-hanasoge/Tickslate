// Determinism of readLayout (RFC 0004 section 8.1 follow-up). The caps changed how readLayout walks the profiles
// (the built-ins are budgeted first); a valid layout inside the caps must still come back exactly as it did before
// the caps, key order included, because a host that compares or re-saves the JSON string would notice. The block
// below is a frozen copy of that earlier readLayout. Do not update it when readLayout changes on purpose: change
// the test and say why.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readLayout, WIDGETS, DEFAULT_PROFILE, LAYOUT_VERSION, BUILT_IN_PROFILES, TOP_STRIP_MAX } from '../src/core/index.js'
import { specFor, typeOf } from '../src/core/catalog.js'
import { isSize, snapSize } from '../src/core/sizes.js'

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

function emptyLayout(device = 'desktop') {
  return { version: LAYOUT_VERSION, device, profiles: { market: [], closed: [] } }
}

function baseReadLayout(input, options = {}) {
  const catalog = options.catalog || WIDGETS
  const fallbackDevice = options.device === 'phone' ? 'phone' : 'desktop'
  const issues = []
  const report = (path, code, message, fixed) => issues.push({ path, code, message, fixed })

  // A bare item array is the shorthand for a layout that never names a profile.
  if (Array.isArray(input)) {
    input = { version: LAYOUT_VERSION, device: fallbackDevice, profiles: { [DEFAULT_PROFILE]: input, closed: [] } }
  }

  if (!isObject(input)) {
    report('', 'bad-shape', 'The layout is not an object, so an empty layout is used instead.', 'replaced')
    return { layout: emptyLayout(fallbackDevice), issues }
  }

  if (input.version !== LAYOUT_VERSION) {
    const what = input.version === undefined ? 'The layout has no version' : `Version ${JSON.stringify(input.version)} is unknown`
    report('version', 'unknown-version', `${what}; it was read as version ${LAYOUT_VERSION}.`, 'migrated')
  }

  let device = input.device
  if (device !== 'desktop' && device !== 'phone') {
    report('device', 'bad-shape', `The device ${JSON.stringify(device)} is not "desktop" or "phone"; "${fallbackDevice}" is used.`, 'replaced')
    device = fallbackDevice
  }

  const profiles = {}
  if (!isObject(input.profiles)) {
    report('profiles', 'bad-shape', 'The profiles are not an object, so every profile starts empty.', 'replaced')
  } else {
    for (const name of Object.keys(input.profiles)) {
      const path = `profiles.${name}`
      // Assigning "__proto__" would set the prototype instead of a key.
      if (name === '__proto__') {
        report(path, 'bad-shape', 'A profile cannot be called "__proto__".', 'dropped')
        continue
      }
      const list = input.profiles[name]
      if (!Array.isArray(list)) {
        report(path, 'bad-shape', `Profile "${name}" is not a list, so it starts empty.`, 'replaced')
        profiles[name] = []
        continue
      }
      profiles[name] = baseReadItems(list, path, catalog, report, options.unknown === 'keep')
    }
  }
  for (const name of BUILT_IN_PROFILES) if (!profiles[name]) profiles[name] = []

  const layout = { version: LAYOUT_VERSION, device, profiles }
  if (input.topStrip !== undefined) {
    const strip = baseReadTopStrip(input.topStrip, profiles, report)
    if (strip) layout.topStrip = strip
  }
  return { layout, issues }
}

// `keep` is false by default: RFC 0001's behaviour for direct callers.
function baseReadItems(list, path, catalog, report, keep) {
  const items = []
  const seen = new Set()
  list.forEach((raw, i) => {
    const at = `${path}[${i}]`
    if (!isObject(raw) || typeof raw.id !== 'string' || raw.id === '') {
      report(at, 'bad-shape', 'An item needs a non-empty string id.', 'dropped')
      return
    }
    if (raw.type !== undefined && (typeof raw.type !== 'string' || raw.type === '')) {
      report(`${at}.type`, 'bad-shape', `Item "${raw.id}" has a type that is not a non-empty string.`, 'dropped')
      return
    }
    const spec = specFor(raw, catalog)
    const unknown = !spec && `No widget called "${typeOf(raw)}" is in the catalog.`
    if (unknown && !keep) {
      report(at, 'unknown-widget', unknown, 'dropped')
      return
    }
    if (seen.has(raw.id)) {
      report(at, 'duplicate-id', `The id "${raw.id}" appears more than once in this profile; later copies are dropped.`, 'dropped')
      return
    }
    seen.add(raw.id)

    let size = raw.size
    if (!spec) {
      // A tile whose widget isn't defined yet (or never will be) must survive a
      // save, so it keeps whatever size it had and is reported once.
      report(at, 'unknown-widget', unknown, 'kept')
      if (!isSize(size)) size = 'S'
    } else if (!isSize(size) || !spec.sizes.includes(size)) {
      size = snapSize(size, spec.sizes)
      const why = isSize(raw.size) ? `${spec.label} does not come in size ${raw.size}` : `${JSON.stringify(raw.size)} is not a size`
      report(`${at}.size`, 'unsupported-size', `${why}; ${size} is used.`, 'replaced')
    }
    const item = { id: raw.id, size }
    if (raw.type !== undefined) item.type = raw.type
    items.push(item)
  })
  return items
}

function baseReadTopStrip(raw, profiles, report) {
  if (!Array.isArray(raw)) {
    report('topStrip', 'bad-shape', 'The top strip is not a list, so it is left out.', 'dropped')
    return null
  }
  const known = new Set()
  for (const name of Object.keys(profiles)) for (const item of profiles[name]) known.add(item.id)
  const strip = []
  raw.forEach((id, i) => {
    const at = `topStrip[${i}]`
    if (typeof id !== 'string') {
      report(at, 'bad-shape', 'A top strip entry must be an item id.', 'dropped')
    } else if (!known.has(id)) {
      report(at, 'top-strip-unknown-id', `"${id}" is not an item in any profile.`, 'dropped')
    } else if (strip.includes(id)) {
      report(at, 'duplicate-id', `"${id}" is already in the top strip.`, 'dropped')
    } else if (strip.length === TOP_STRIP_MAX) {
      report(at, 'top-strip-too-long', `The top strip holds at most ${TOP_STRIP_MAX} items.`, 'dropped')
    } else {
      strip.push(id)
    }
  })
  return strip
}

// mulberry32, as in the fuzz test.
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

const SEED = 0x51ed270b
const RUNS = 3000

// A layout that is valid and inside the caps, with its profiles in a random order (the built-ins anywhere, or missing),
// extra profiles, repeated and unknown widgets, snapped sizes and a top strip that mixes good and bad ids. Issues
// are allowed: the point is that both readers say the same thing in the same order.
function layoutAt(index) {
  const rand = mulberry32((SEED ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0)
  const int = (n) => Math.floor(rand() * n)
  const types = Object.keys(WIDGETS)
  const names = ['market', 'closed', ...Array.from({ length: int(10) }, (_, i) => `custom${i}`)].filter((n) => (n === 'market' || n === 'closed' ? rand() < 0.7 : true))
  for (let i = names.length - 1; i > 0; i--) {
    const j = int(i + 1)
    ;[names[i], names[j]] = [names[j], names[i]]
  }
  const profiles = {}
  const ids = []
  for (const name of names) {
    profiles[name] = Array.from({ length: int(12) }, (_, k) => {
      const item = { id: `${types[int(types.length)]}${int(6)}`, size: ['S', 'M', 'Wide', 'Banner', 'L', 'XL'][int(6)] }
      if (rand() < 0.3) item.type = rand() < 0.9 ? types[int(types.length)] : 'nope'
      if (k % 5 === 4) item.id = 'x'.repeat(1 + int(120))
      ids.push(item.id)
      return item
    })
  }
  const layout = { version: 1, device: rand() < 0.5 ? 'desktop' : 'phone', profiles }
  if (rand() < 0.5) layout.topStrip = Array.from({ length: int(6) }, () => (rand() < 0.7 && ids.length ? ids[int(ids.length)] : 'missing'))
  return layout
}

for (const options of [undefined, { unknown: 'keep', device: 'phone' }]) {
  test(`readLayout matches the pre-cap reader on ${RUNS} valid layouts, byte for byte (${options ? 'options' : 'no options'})`, () => {
    for (let i = 0; i < RUNS; i++) {
      const input = layoutAt(i)
      const now = readLayout(input, options)
      const before = baseReadLayout(input, options)
      assert.equal(JSON.stringify(now), JSON.stringify(before), `seed ${SEED} index ${i}`)
    }
  })
}

test('profiles come back in the order they went in, with a missing built-in added at the end', () => {
  const { layout } = readLayout({ version: 1, device: 'desktop', profiles: { zeta: [], closed: [], alpha: [] } })
  assert.deepEqual(Object.keys(layout.profiles), ['zeta', 'closed', 'alpha', 'market'])
  const capped = readLayout({ version: 1, device: 'desktop', profiles: { b: [], market: [], a: [], closed: [] } }, { maxProfiles: 3 })
  assert.deepEqual(Object.keys(capped.layout.profiles), ['b', 'market', 'closed'])
})
