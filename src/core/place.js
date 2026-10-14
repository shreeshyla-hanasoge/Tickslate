/**
 * Gap-filling placement.
 *
 * Each item, in array order, goes in the first cell (scanning rows top to
 * bottom, columns left to right) where its footprint fits. That is the
 * algorithm CSS grid uses for `grid-auto-flow: dense` with auto-placed spans:
 * the cursor restarts at the top left for every item, which is what makes
 * small tiles backfill holes left by big ones. Computing it here means
 * <ts-grid> can set explicit positions that tests have already checked, and
 * hosts that don't render with CSS get the same layout.
 */

import { WIDGETS, specFor } from './catalog.js'
import { checkColumns, footprint } from './sizes.js'

export function place(items, columns, catalog = WIDGETS) {
  checkColumns(columns)
  return placeFirst(items, columns, catalog, items.length)
}

// Placing item i depends only on items 0..i, so dropIndex can stop early.
export function placeFirst(items, columns, catalog, count) {
  // One bitmask per row: bit c is set when column c is taken. Four columns
  // fit in any integer, and a fit test becomes one AND per row.
  const taken = []
  const placements = []
  let height = 0
  for (let i = 0; i < count; i++) {
    const item = items[i]
    const spec = specFor(item, catalog)
    const fp = footprint(item.size, columns, spec ? spec.sizes : null, spec ? spec.phoneRows : null)
    const mask = (1 << fp.cols) - 1
    const { col, row } = firstFit(taken, columns, fp.cols, fp.rows, mask)
    for (let r = row; r < row + fp.rows; r++) taken[r] = (taken[r] || 0) | (mask << col)
    placements.push({ id: item.id, col, row, cols: fp.cols, rows: fp.rows, variant: fp.variant })
    if (row + fp.rows > height) height = row + fp.rows
  }
  return { placements, rows: height }
}

function firstFit(taken, columns, cols, rows, mask) {
  // Always ends: rows past the last taken one are empty.
  for (let row = 0; ; row++) {
    for (let col = 0; col + cols <= columns; col++) {
      const want = mask << col
      let free = true
      for (let r = row; r < row + rows; r++) {
        if ((taken[r] || 0) & want) {
          free = false
          break
        }
      }
      if (free) return { col, row }
    }
  }
}
