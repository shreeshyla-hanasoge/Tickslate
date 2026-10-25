/**
 * Editing operations. Every one is pure and returns new arrays and objects,
 * so a host can keep the previous layout for undo, and a framework sees a
 * new reference it can react to.
 *
 * dropIndex and sizeForExtent are what make dragging in <ts-grid> feel like
 * rearranging an iPhone home screen: the grid asks the core where the tile
 * would land for the pointer's current position, and the other tiles slide
 * to the positions place() gives for that order.
 */

import { WIDGETS, specFor } from './catalog.js'
import { checkColumns, footprint, isSize, nearestSize, sizeOrder, snapSize } from './sizes.js'
import { createPlacer } from './place.js'
import { TOP_STRIP_MAX } from './layout.js'

const indexOf = (items, id) => items.findIndex((item) => item.id === id)

export function addItem(items, item, catalog = WIDGETS) {
  if (!item || typeof item.id !== 'string' || item.id === '') {
    throw new TypeError('addItem needs an item with a non-empty string id')
  }
  if (indexOf(items, item.id) !== -1) {
    throw new Error(`An item with id "${item.id}" is already in this profile`)
  }
  const spec = specFor(item, catalog)
  const added = { id: item.id, size: spec ? snapSize(item.size, spec.sizes) : item.size }
  if (item.type !== undefined) added.type = item.type
  // Appending is enough: placement backfills, so the new tile lands in the
  // first gap it fits, not necessarily at the end.
  return [...items, added]
}

export function removeItem(items, id) {
  return items.filter((item) => item.id !== id)
}

export function moveItem(items, id, toIndex) {
  const from = indexOf(items, id)
  const next = items.slice()
  if (from === -1 || next.length === 0) return next
  const to = Math.max(0, Math.min(next.length - 1, Math.trunc(toIndex) || 0))
  if (to === from) return next
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function resizeItem(items, id, size, catalog = WIDGETS) {
  return items.map((item) => {
    if (item.id !== id) return item
    const spec = specFor(item, catalog)
    if (spec) return { ...item, size: snapSize(size, spec.sizes) }
    return isSize(size) ? { ...item, size } : item
  })
}

/** The next size up (dir 1) or down (dir -1), stopping at the ends rather than wrapping. */
export function stepSize(spec, current, dir) {
  const order = sizeOrder(spec.sizes)
  const at = order.indexOf(snapSize(current, spec.sizes))
  return order[Math.max(0, Math.min(order.length - 1, at + (dir < 0 ? -1 : 1)))]
}

/**
 * The supported size nearest to an extent a resize handle has been dragged
 * to. With `columns`, sizes are compared by the footprint they would have on
 * that grid, which is what the user sees while dragging on a phone or tablet.
 * There, several sizes can share a footprint (XL and L are both 3×2 on three
 * columns), so a tie keeps `current` and otherwise takes the smaller size.
 */
export function sizeForExtent(spec, cols, rows, columns, current) {
  if (columns === undefined) return nearestSize(spec.sizes, cols, rows)
  let best = null
  let bestDistance = Infinity
  for (const size of sizeOrder(spec.sizes)) {
    const fp = footprint(size, columns, spec.sizes, spec.phoneRows)
    const distance = Math.abs(fp.cols - cols) + Math.abs(fp.rows - rows)
    if (distance < bestDistance || (distance === bestDistance && size === current)) {
      best = size
      bestDistance = distance
    }
  }
  return best
}

/**
 * The index to move `id` to so its top-left cell lands closest to `target`
 * ({ col, row }, fractions allowed). `aspect` is a column's width over a
 * row's height, so the distance is measured as the eye sees it: on desktop a
 * column is about twice as wide as a row is tall.
 *
 * Ties keep the index nearest the current one, which stops a tile
 * flickering between two equally good slots while the pointer is still.
 * Returns -1 when `id` is not in `items`.
 */
export function dropIndex(items, id, target, columns, catalog = WIDGETS, aspect = 1) {
  checkColumns(columns)
  const from = indexOf(items, id)
  if (from === -1) return -1
  const slots = slotsFor(items, id, columns, catalog)
  let best = from
  let bestDistance = Infinity
  for (let i = 0; i < slots.length; i++) {
    const dc = (slots[i].col - target.col) * aspect
    const dr = slots[i].row - target.row
    const distance = dc * dc + dr * dr
    if (distance < bestDistance || (distance === bestDistance && Math.abs(i - from) < Math.abs(best - from))) {
      best = i
      bestDistance = distance
    }
  }
  return best
}

/**
 * Where the top-left cell of `id` lands at each index, for the tiles as they
 * are. A tile before index i is placed the same wherever `id` goes after it,
 * so one sweep lays the other tiles out once and tries `id` at each step:
 * n placements, not the n²/2 of laying out a prefix per slot.
 */
function computeSlots(items, id, columns, catalog) {
  const moving = items.find((item) => item.id === id)
  const rest = items.filter((item) => item.id !== id)
  const placer = createPlacer(columns, catalog)
  const slots = []
  for (let i = 0; i <= rest.length; i++) {
    slots.push(placer.probe(moving))
    if (i < rest.length) placer.add(rest[i])
  }
  return slots
}

// A drag asks again every frame with a new pointer position and the same
// tiles, and the slots depend only on the tiles. The last answer is kept per
// array (a weak map frees it with the array). The tiles are compared again on
// every call, because an array a host edited in place must not get stale slots.
const slotCache = new WeakMap()

function slotsFor(items, id, columns, catalog) {
  const hit = slotCache.get(items)
  if (hit && hit.id === id && hit.columns === columns && hit.catalog === catalog && hit.refs.length === items.length) {
    let same = true
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (hit.refs[i] !== item || hit.sizes[i] !== item.size || hit.types[i] !== item.type) {
        same = false
        break
      }
    }
    if (same) return hit.slots
  }
  const slots = computeSlots(items, id, columns, catalog)
  slotCache.set(items, { id, columns, catalog, refs: items.slice(), sizes: items.map((item) => item.size), types: items.map((item) => item.type), slots })
  return slots
}

/** A layout with one profile replaced. Top strip ids no profile holds any more are dropped. */
export function withProfile(layout, name, items) {
  const next = { ...layout, profiles: { ...layout.profiles, [name]: items } }
  if (layout.topStrip) next.topStrip = layout.topStrip.filter((id) => holds(next, id))
  return next
}

export function setTopStrip(layout, ids) {
  const strip = []
  for (const id of ids) {
    if (strip.length === TOP_STRIP_MAX) break
    if (typeof id === 'string' && !strip.includes(id) && holds(layout, id)) strip.push(id)
  }
  return { ...layout, topStrip: strip }
}

function holds(layout, id) {
  return Object.keys(layout.profiles).some((name) => indexOf(layout.profiles[name], id) !== -1)
}
