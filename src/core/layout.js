/**
 * Reading saved layouts.
 *
 * Layouts are user data that outlive the code that wrote them: a widget gets
 * retired, a size stops being supported, a hand-edited record has a typo.
 * readLayout therefore never throws. It repairs what it can, drops what it
 * can't, and reports every change, because a dashboard that refuses to
 * render over one stale tile is worse than one that drops the tile and says
 * so.
 */

import { WIDGETS, DEFAULT_PROFILE, specFor, typeOf } from './catalog.js'
import { isSize, snapSize } from './sizes.js'

export const LAYOUT_VERSION = 1
export const BUILT_IN_PROFILES = Object.freeze(['market', 'closed'])
export const TOP_STRIP_MAX = 3

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v)

export function emptyLayout(device = 'desktop') {
  return { version: LAYOUT_VERSION, device, profiles: { market: [], closed: [] } }
}

export function readLayout(input, options = {}) {
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
      profiles[name] = readItems(list, path, catalog, report, options.unknown === 'keep')
    }
  }
  for (const name of BUILT_IN_PROFILES) if (!profiles[name]) profiles[name] = []

  const layout = { version: LAYOUT_VERSION, device, profiles }
  if (input.topStrip !== undefined) {
    const strip = readTopStrip(input.topStrip, profiles, report)
    if (strip) layout.topStrip = strip
  }
  return { layout, issues }
}

// `keep` is false by default: RFC 0001's behaviour for direct callers.
function readItems(list, path, catalog, report, keep) {
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

function readTopStrip(raw, profiles, report) {
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
