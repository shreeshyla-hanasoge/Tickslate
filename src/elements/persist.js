/**
 * persistLayout(): save and restore a grid's layout per device, in one line.
 * It uses only the grid's public API (layout, columns and its events), so a
 * fake grid is enough to test it. Every storage call is guarded, because
 * private mode and a full quota both make localStorage throw.
 */
import { readLayout, deviceFor } from '../core/index.js'

const isDevice = (d) => d === 'desktop' || d === 'phone'

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
  const { key, defaults } = options
  if (typeof key !== 'string' || !key) throw new TypeError('persistLayout needs a non-empty `key`')
  const storage = 'storage' in options ? options.storage : defaultStorage()
  const fallback = normaliseDefaults(defaults)
  let device = null
  let disposed = false

  const keyFor = (d) => `${key}:${d}`

  function applyDefaults(d) {
    if (fallback[d] == null) return
    grid.layout = readLayout(fallback[d], { unknown: 'keep', device: d }).layout
  }

  function load(d) {
    let raw = null
    if (storage) {
      try {
        const text = storage.getItem(keyFor(d))
        // JSON.parse(null) would give null, which readLayout would "repair"
        // into an empty layout; nothing stored must mean nothing applied.
        if (text != null) raw = JSON.parse(text)
      } catch (e) {
        raw = null
      }
    }
    if (raw == null) return applyDefaults(d)
    grid.layout = readLayout(raw, { unknown: 'keep', device: d }).layout
  }

  function switchTo(d) {
    if (!isDevice(d) || d === device) return
    device = d
    load(d)
  }

  function onColumns(event) {
    if (disposed || event.target !== grid) return
    const detail = event.detail || {}
    switchTo(isDevice(detail.device) ? detail.device : deviceOfColumns(detail.columns))
  }

  function onChange(event) {
    if (disposed || event.target !== grid || !storage || !device) return
    const layout = event.detail && event.detail.layout
    if (!layout) return
    try {
      storage.setItem(keyFor(device), JSON.stringify(layout))
    } catch (e) {
      // Quota or private mode: the edit stays on screen, it just isn't kept.
    }
  }

  grid.addEventListener('ts-columns-change', onColumns)
  grid.addEventListener('ts-layout-change', onChange)

  const measured = deviceOfColumns(grid.columns)
  if (measured) switchTo(measured)

  return {
    reset(which) {
      if (disposed) return
      const d = isDevice(which) ? which : device
      if (!d) return
      if (storage) {
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
      disposed = true
      grid.removeEventListener('ts-columns-change', onColumns)
      grid.removeEventListener('ts-layout-change', onChange)
    },
  }
}
