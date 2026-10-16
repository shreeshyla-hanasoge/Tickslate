/**
 * Pixel geometry for <ts-grid>, kept free of the DOM so node --test can check
 * it. The grid measures its width, row height and gap once, then everything
 * during a drag is arithmetic on these numbers. The same goes for the pure
 * half of implicit mode (RFC 0002 §1.5): which items a set of children makes,
 * and how a changed set of children updates the grid's own list.
 */

import { isSize, snapSize } from '../core/index.js'

export function metrics(width, columns, rowHeight, gap) {
  const colWidth = Math.max(0, (width - gap * (columns - 1)) / columns)
  return { columns, colWidth, rowHeight, gap, pitchX: colWidth + gap, pitchY: rowHeight + gap }
}

/** The pixel box of a placement, relative to the grid's top-left corner. */
export function boxOf(p, m) {
  return {
    x: p.col * m.pitchX,
    y: p.row * m.pitchY,
    w: p.cols * m.colWidth + (p.cols - 1) * m.gap,
    h: p.rows * m.rowHeight + (p.rows - 1) * m.gap,
  }
}

export function boardHeight(rows, m) {
  return rows > 0 ? rows * m.rowHeight + (rows - 1) * m.gap : 0
}

/**
 * The fractional cell under a tile whose top-left corner is at (x, y),
 * clamped so a tile `cols` wide never targets a column it would overhang.
 */
export function cellAt(x, y, cols, m) {
  const maxCol = Math.max(0, m.columns - cols)
  return {
    col: Math.min(maxCol, Math.max(0, x / m.pitchX)),
    row: Math.max(0, y / m.pitchY),
  }
}

/** The extent in cells of a box being resized to w × h pixels. */
export function extentOf(w, h, m) {
  return {
    cols: Math.min(m.columns, Math.max(1, (w + m.gap) / m.pitchX)),
    rows: Math.max(1, (h + m.gap) / m.pitchY),
  }
}

/**
 * Ids in row-major order of each tile's top-left cell, which is the order the
 * eye reads a dashboard in (RFC 0003 §11). A tall tile sorts by where it
 * starts, and tiles sharing a cell, which place() never makes, keep their input
 * order because Array.prototype.sort is stable from ES2019.
 */
export function visualOrder(placements) {
  return [...placements].sort((a, b) => a.row - b.row || a.col - b.col).map((p) => p.id)
}

/**
 * Which of `wanted` can stay where they are when `current` is reordered into
 * `wanted`: the longest run that already sits in the right relative order (a
 * longest increasing subsequence), so the fewest are moved. Moving one tile's
 * slot reattaches that tile in some engines and drops its slide, so a last-to-
 * first change must move one slot, not all of the others. Every item of
 * `wanted` must be in `current`.
 */
export function keepInPlace(current, wanted) {
  const at = new Map(current.map((item, i) => [item, i]))
  const seq = wanted.map((item) => at.get(item))
  // Patience sorting: `tails[k]` ends the best run of length k + 1, and `prev` links each entry back along its run.
  const tails = []
  const prev = []
  for (let i = 0; i < seq.length; i++) {
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (seq[tails[mid]] < seq[i]) lo = mid + 1
      else hi = mid
    }
    prev[i] = lo ? tails[lo - 1] : -1
    tails[lo] = i
  }
  const keep = new Set()
  for (let k = tails.length ? tails[tails.length - 1] : -1; k >= 0; k = prev[k]) keep.add(wanted[k])
  return keep
}

/**
 * Write a new order for the visible items back into the full profile.
 * Items with no element on the page keep their slots; the visible ones
 * refill theirs in the new order. A host that renders only some tiles never
 * has the rest shuffled by an edit it couldn't see.
 */
export function mergeOrder(full, visibleOrder) {
  const visible = new Set(visibleOrder.map((item) => item.id))
  let next = 0
  return full.map((item) => (visible.has(item.id) ? visibleOrder[next++] : item))
}

/** A CSS length in px, or the fallback when it is missing or not in px. */
export function px(value, fallback) {
  const n = parseFloat(value)
  return Number.isFinite(n) && /px\s*$/.test(String(value).trim()) ? n : fallback
}

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

/**
 * One layout item per child descriptor, in DOM order.
 *
 * `resolve(tag)` says what type a tag is and which spec the catalogs hold for
 * it. A descriptor's own `spec` (the element's getter, or its sizes and label
 * attributes) wins over that, so two cards can differ.
 *
 * Ids are the item attribute, else the type, then type-2, type-3 and so on.
 * Explicit ids are claimed first, so a generated id never takes one a later
 * child asked for, and `reserved` (ids the user removed) are never generated
 * either: a new anonymous child must not come back already removed.
 */
export function itemsFromChildren(descriptors, resolve, reserved) {
  const claimed = new Set()
  const ids = descriptors.map((d) => {
    if (!d.item || claimed.has(d.item)) return null
    claimed.add(d.item)
    return d.item
  })
  const taken = new Set([...claimed, ...(reserved || [])])
  return descriptors.map((d, i) => {
    const { type, spec: catalogSpec } = resolve(d.tag)
    const spec = d.spec || catalogSpec || null
    let id = ids[i]
    if (id === null) {
      id = type
      for (let n = 2; taken.has(id); n++) id = `${type}-${n}`
      taken.add(id)
    }
    const sizes = spec && Array.isArray(spec.sizes) && spec.sizes.length ? spec.sizes : null
    let size
    if (isSize(d.declaredSize)) size = sizes ? snapSize(d.declaredSize, sizes) : d.declaredSize
    else size = sizes ? sizes[0] : 'S'
    // The type is implied when it is the id; otherwise the item must say it.
    return id === type ? { id, size } : { id, type, size }
  })
}

/**
 * The grid's list after its children changed. The list is the source of
 * truth once seeded: items keep their own order and sizes, departed children
 * are dropped, new ones are appended, and an id the user removed stays out.
 */
export function reconcile(prevItems, current, removedIds) {
  const removed = removedIds || new Set()
  const live = new Set(current.map((item) => item.id))
  const kept = prevItems.filter((item) => live.has(item.id) && !removed.has(item.id))
  const have = new Set(kept.map((item) => item.id))
  return kept.concat(current.filter((item) => !have.has(item.id) && !removed.has(item.id)))
}

/**
 * Per-item specs as one function the core accepts as a catalog (RFC 0002
 * §1.6): the element's own spec, else the host's catalog, else the built-in
 * one. `elementSpecs` is only asked for ids, so it can compute lazily.
 */
export function specResolver(elementSpecs, hostCatalog, base) {
  return (item) => elementSpecs.get(item.id) || lookup(item, hostCatalog) || lookup(item, base) || null
}

function lookup(item, catalog) {
  if (typeof catalog === 'function') return catalog(item) || null
  if (!catalog) return null
  const type = item.type === undefined ? item.id : item.type
  // Own entries only, so a type called "toString" is unknown.
  return typeof type === 'string' && hasOwn(catalog, type) ? catalog[type] : null
}

/**
 * Sizes the host wrote since the grid's own last write. `entries` are
 * { id, size (the attribute now), written (what the grid last wrote) }.
 * The grid writes the reflowed variant (M for an L tile on a phone), so only
 * a value that differs from that is the host asking for a new size.
 */
export function hostResizes(entries) {
  const out = new Map()
  for (const { id, size, written } of entries) {
    if (written !== undefined && size !== written && isSize(size)) out.set(id, size)
  }
  return out
}

/**
 * The spec a child brings (RFC 0002 §1.6): its own `spec` getter wins. The
 * `sizes` and `label` attributes are for an element with no such getter, a
 * plain or not-yet-defined one. With neither, the catalogs answer.
 */
export function elementSpec(el) {
  if (!el) return null
  const own = el.spec
  if (own !== undefined) {
    return own && typeof own === 'object' && Array.isArray(own.sizes) && own.sizes.length ? own : null
  }
  const attr = el.getAttribute('sizes')
  if (!attr) return null
  const sizes = attr.split(/[\s,]+/).filter(isSize)
  return sizes.length ? { label: el.getAttribute('label') || '', sizes } : null
}
