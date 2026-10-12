/**
 * Pixel geometry for <ts-grid>, kept free of the DOM so node --test can check
 * it. The grid measures its width, row height and gap once, then everything
 * during a drag is arithmetic on these numbers.
 */

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
