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
import { checkColumns, isSize, nearestSize, sizeOrder, snapSize } from './sizes.js'
import { placeFirst } from './place.js'
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

/** The supported size nearest to an extent a resize handle has been dragged to. */
export function sizeForExtent(spec, cols, rows) {
  return nearestSize(spec.sizes, cols, rows)
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
  let best = from
  let bestDistance = Infinity
  for (let i = 0; i < items.length; i++) {
    const order = moveItem(items, id, i)
    const p = placeFirst(order, columns, catalog, i + 1).placements[i]
    const dc = (p.col - target.col) * aspect
    const dr = p.row - target.row
    const distance = dc * dc + dr * dr
    if (distance < bestDistance || (distance === bestDistance && Math.abs(i - from) < Math.abs(best - from))) {
      best = i
      bestDistance = distance
    }
  }
  return best
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
