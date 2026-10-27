/**
 * persistLayout(): save and restore a grid's layout per device, in one line.
 * It uses only the grid's public API (layout, columns and its events), so a
 * fake grid is enough to test it. Every storage call is guarded, because
 * private mode and a full quota both make localStorage throw.
 *
 * An adapter (RFC 0003 §4.2) replaces storage for hosts that keep layouts on a
 * server: `load` and `save` may return promises. Everything that can arrive
 * late is checked against a request counter and an edit counter before it is
 * applied, so a slow answer never undoes what the user did in the meantime.
 *
 * A host often assigns the grid's layout a moment after the grid connects. Until the
 * user's first edit on a device, that assignment is captured as the device's
 * defaults, and a saved layout is still shown over it (RFC 0004 §11.2). The grid
 * announces such assignments through `_watchLayout`, a private hook, because a
 * layout can be set without any event; persistLayout's own assignments are marked
 * and never captured. A grid without the hook only misses the later captures.
 */
import { readLayout } from '../core/index.js'
import { DEV, warnOnce } from './dev.js'

const isDevice = (d) => d === 'desktop' || d === 'phone'
const isThenable = (v) => v != null && typeof v.then === 'function'
const messageOf = (e) => String((e && e.message) || e)

/** Runs an adapter call that may throw or reject, without awaiting it; either failure goes to `onError` and none escapes. */
function fire(call, onError) {
  try {
    const done = call()
    if (isThenable(done)) Promise.resolve(done).then(undefined, onError)
  } catch (e) {
    onError(e)
  }
}

// Tells one attachment's warnings from another's: warnOnce keys are global, and
// a failing adapter on each of two grids should be heard on both.
let serial = 0

// A grid with columns 0 hasn't measured yet, and deviceFor(0) would say
// "phone", so the unmeasured case is kept apart from it.
const deviceOfColumns = (columns) => (columns > 0 ? (columns === 2 ? 'phone' : 'desktop') : null)

function normaliseDefaults(defaults) {
  if (defaults == null) return { desktop: null, phone: null }
  const twoDevices =
    typeof defaults === 'object' && !Array.isArray(defaults) && !('profiles' in defaults) && 'desktop' in defaults
  if (!twoDevices) return { desktop: defaults, phone: defaults }
  return { desktop: defaults.desktop ?? null, phone: defaults.phone ?? defaults.desktop ?? null }
}

function defaultStorage() {
  // Merely reading the property can throw (blocked site data), hence the try.
  try {
    return globalThis.localStorage || null
  } catch (e) {
    return null
  }
}

export function persistLayout(grid, options = {}) {
  const { key, defaults, adapter } = options
  if (adapter != null && (typeof adapter !== 'object' || typeof adapter.load !== 'function' || typeof adapter.save !== 'function')) {
    throw new TypeError('persistLayout needs an `adapter` with load() and save()')
  }
  if (!adapter && (typeof key !== 'string' || !key)) throw new TypeError('persistLayout needs a non-empty `key`, or an `adapter`')
  // An adapter names its own storage, so it wins over `storage` and `key`.
  const storage = adapter ? null : 'storage' in options ? options.storage : defaultStorage()
  // A function is for the grid's own attribute, whose implicit layout is still
  // changing as children arrive: it is asked each time defaults are needed.
  const fallback = () => normaliseDefaults(typeof defaults === 'function' ? defaults() : defaults)
  const id = DEV ? ++serial : 0
  let device = null
  let disposed = false
  // A load is stale when another has started since (a device change, a reset)
  // and when the user has edited since it started: their edit wins (RFC 0003 §29.8).
  let request = 0
  let edits = 0
  // Per device: the host's latest layout (the defaults), and whether the user has edited there (which ends capturing).
  const captured = { desktop: null, phone: null }
  const edited = { desktop: false, phone: false }
  // True while persistLayout assigns grid.layout itself, so the hook does not take that for the host.
  let applying = false

  if (DEV) {
    if (adapter && options.storage != null) warnOnce(`persist-both:${id}`, 'persistLayout was given both an adapter and storage; the adapter is used and storage is ignored.')
    // A count rather than a flag: disposing one of two attachments must leave the grid counted as saved.
    if (grid._persisted) warnOnce(`persist-twice:${id}`, '<ts-grid> is saved by more than one persistLayout attachment (the persist attribute counts as one), each to its own key.')
    grid._persisted = (grid._persisted || 0) + 1
  }

  const keyFor = (d) => `${key}:${d}`

  function applyDefaults(d) {
    // The grid already shows them (the persist attribute passes its own layout),
    // and setting it again would end implicit mode for a layout nobody changed.
    const wanted = captured[d] || fallback()[d]
    if (wanted == null || grid.layout === wanted) return
    try {
      assign(readLayout(wanted, { unknown: 'keep', device: d }).layout)
    } catch (e) {
      applyFailed(e)
    }
  }

  function assign(layout) {
    applying = true
    // Tells the grid too, which keeps the host's layout as the other device's fallback and must not take this for it.
    grid._persistWriting = true
    try {
      grid.layout = layout
    } finally {
      applying = false
      grid._persistWriting = false
    }
  }

  function loadFailed(e) {
    if (DEV) warnOnce(`persist-load:${id}`, `persistLayout adapter load() failed (${messageOf(e)}); it counts as nothing stored, so the defaults are shown.`)
    return null
  }

  function saveFailed(e) {
    if (DEV) warnOnce(`persist-save:${id}`, `persistLayout adapter save() failed (${messageOf(e)}); the edit stays on screen but was not kept. The adapter owns retries.`)
  }

  function applyFailed(e) {
    if (DEV) warnOnce(`persist-apply:${id}`, `persistLayout could not apply the layout adapter load() returned (${messageOf(e)}).`)
  }

  function removeFailed(e) {
    if (DEV) warnOnce(`persist-remove:${id}`, `persistLayout adapter remove() failed (${messageOf(e)}); reset() still applied the defaults.`)
  }

  // An error page, a bare string or a number from a server would otherwise be
  // "repaired" into an empty board over the defaults. A genuinely saved empty
  // layout has its profiles, so it still loads.
  function plausible(raw) {
    if (raw == null || (typeof raw === 'object' && (Array.isArray(raw) || 'profiles' in raw))) return raw
    if (DEV) warnOnce(`persist-shape:${id}`, `persistLayout adapter load() returned ${typeof raw === 'object' ? 'an object with no profiles' : typeof raw}, not a layout; it counts as nothing stored, so the defaults are shown.`)
    return null
  }

  /** What is stored for `d`: the raw value, null for nothing, or a promise of either. It never throws and a promise never rejects. */
  function read(d) {
    if (adapter) {
      let got
      try {
        got = adapter.load(d)
      } catch (e) {
        return loadFailed(e)
      }
      return isThenable(got) ? Promise.resolve(got).then(plausible, loadFailed) : plausible(got)
    }
    if (!storage) return null
    try {
      const text = storage.getItem(keyFor(d))
      // JSON.parse(null) would give null, which readLayout would "repair"
      // into an empty layout; nothing stored must mean nothing applied.
      return text != null ? JSON.parse(text) : null
    } catch (e) {
      return null
    }
  }

  function show(d, raw) {
    // `== null` covers an adapter's undefined too: both mean nothing stored.
    if (raw == null) return applyDefaults(d)
    assign(readLayout(raw, { unknown: 'keep', device: d }).layout)
  }

  function load(d) {
    const mine = ++request
    const seen = edits
    const got = read(d)
    if (!isThenable(got)) return show(d, got)
    // While it is pending the grid shows this device's defaults: never an
    // empty board, and never the other device's saved layout.
    applyDefaults(d)
    got
      .then((raw) => {
        if (disposed || mine !== request || seen !== edits) return
        // The defaults are already up, so nothing stored leaves the board as it is.
        if (raw != null) show(d, raw)
      })
      .catch(applyFailed)
  }

  function switchTo(d) {
    if (!isDevice(d) || d === device) return
    // Attached with no defaults after the host set its layout: that layout is the defaults, so reset() has somewhere to go.
    // Only the first device seen, before any edit: later the layout on show may be a saved one or the other device's.
    if (device === null && defaults == null && !edited[d] && !captured[d]) captured[d] = grid.layout
    device = d
    load(d)
  }

  function onColumns(event) {
    if (disposed || event.target !== grid) return
    const detail = event.detail || {}
    switchTo(isDevice(detail.device) ? detail.device : deviceOfColumns(detail.columns))
  }

  function onChange(event) {
    if (disposed || event.target !== grid || !device) return
    const layout = event.detail && event.detail.layout
    if (!layout) return
    edits++
    edited[device] = true
    if (adapter) {
      // In event order and not awaited: a slow save must not hold the grid up.
      fire(() => adapter.save(device, layout), saveFailed)
      return
    }
    if (!storage) return
    try {
      storage.setItem(keyFor(device), JSON.stringify(layout))
    } catch (e) {
      // Quota or private mode: the edit stays on screen, it just isn't kept.
    }
  }

  // The host assigned grid.layout: before this device's first edit it is the new defaults, and a saved layout still wins.
  function onHostLayout() {
    if (disposed || applying || !device || edited[device]) return
    captured[device] = grid.layout
    load(device)
  }

  const unwatch = typeof grid._watchLayout === 'function' ? grid._watchLayout(onHostLayout) : null

  grid.addEventListener('ts-columns-change', onColumns)
  grid.addEventListener('ts-layout-change', onChange)

  const measured = deviceOfColumns(grid.columns)
  if (measured) switchTo(measured)

  return {
    reset(which) {
      if (disposed) return
      const d = isDevice(which) ? which : device
      if (!d) return
      // Whatever a pending load for this device brings back is what the user just reset away.
      if (d === device) request++
      if (adapter) {
        if (typeof adapter.remove === 'function') fire(() => adapter.remove(d), removeFailed)
      } else if (storage) {
        try {
          storage.removeItem(keyFor(d))
        } catch (e) {
          // Nothing to remove if storage is unusable.
        }
      }
      // Another device's defaults would replace what is on screen, so only
      // the current device is re-applied.
      if (d === device) applyDefaults(d)
    },
    dispose() {
      if (disposed) return
      disposed = true
      if (unwatch) unwatch()
      if (DEV) grid._persisted--
      grid.removeEventListener('ts-columns-change', onColumns)
      grid.removeEventListener('ts-layout-change', onChange)
    },
  }
}
