/**
 * Tile sizes, breakpoints and how a size reflows on narrower grids.
 *
 * A size has two readings that the brief's rules mix together: the
 * footprint (the cells a tile occupies on this grid) and the variant (which
 * of the widget's designed sizes it renders). Keeping them apart is what
 * lets an L tile on a phone occupy 2×2 and render its M design.
 */

const freeze = Object.freeze

export const SIZES = freeze({
  S: freeze({ cols: 1, rows: 1 }),
  Wide: freeze({ cols: 2, rows: 1 }),
  Tall: freeze({ cols: 1, rows: 2 }),
  M: freeze({ cols: 2, rows: 2 }),
  L: freeze({ cols: 3, rows: 2 }),
  Banner: freeze({ cols: 4, rows: 1 }),
  XL: freeze({ cols: 4, rows: 2 }),
})

export const SIZE_NAMES = freeze(Object.keys(SIZES))

export const BREAKPOINTS = freeze({ desktop: 1200, tablet: 700 })

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

export function isSize(name) {
  return typeof name === 'string' && hasOwn(SIZES, name)
}

export function columnsFor(width) {
  // Written as "not ≥" so NaN and missing widths fall to the phone grid,
  // the layout that fits anywhere.
  if (!(width >= BREAKPOINTS.tablet)) return 2
  return width >= BREAKPOINTS.desktop ? 4 : 3
}

export function deviceFor(width) {
  return columnsFor(width) === 2 ? 'phone' : 'desktop'
}

export function checkColumns(columns) {
  if (columns !== 2 && columns !== 3 && columns !== 4) {
    throw new RangeError(`columns must be 2, 3 or 4, not ${columns}`)
  }
}

const area = (s) => SIZES[s].cols * SIZES[s].rows

/**
 * The supported size closest to an extent of cols × rows cells. Ties go to
 * the smaller area, then to SIZE_NAMES order, so the answer never depends on
 * the order a catalog happens to list its sizes in.
 */
export function nearestSize(supported, cols, rows) {
  let best = null
  let bestDistance = Infinity
  for (const name of SIZE_NAMES) {
    if (!supported.includes(name)) continue
    const s = SIZES[name]
    const distance = Math.abs(s.cols - cols) + Math.abs(s.rows - rows)
    if (distance < bestDistance || (distance === bestDistance && area(name) < area(best))) {
      best = name
      bestDistance = distance
    }
  }
  return best
}

/** `size` if supported, else the nearest supported size. An unknown name snaps to the smallest. */
export function snapSize(size, supported) {
  const list = supportedList(supported, size)
  if (list.includes(size)) return size
  const want = isSize(size) ? SIZES[size] : SIZES.S
  return nearestSize(list, want.cols, want.rows)
}

// A tile with no catalog entry (a host's own element) supports exactly the
// size it was given.
function supportedList(supported, size) {
  const list = Array.isArray(supported) ? supported.filter(isSize) : []
  if (list.length) return list
  return isSize(size) ? [size] : ['S']
}

/** Supported sizes from smallest to largest: by area, then narrower first. */
export function sizeOrder(supported) {
  return SIZE_NAMES.filter((s) => supported.includes(s)).sort(
    (a, b) => area(a) - area(b) || SIZES[a].cols - SIZES[b].cols,
  )
}

/**
 * `phoneRows` lets a widget give a full-width size more height on phones,
 * e.g. { Banner: 2 } so a year heat map can wrap into two half-year bands.
 */
export function footprint(size, columns, supported, phoneRows) {
  checkColumns(columns)
  const list = supportedList(supported, size)
  const variant = snapSize(size, list)
  const { cols, rows } = SIZES[variant]
  if (columns === 4) return { cols, rows, variant }
  if (columns === 3) return { cols: Math.min(cols, 3), rows, variant }
  // Phone. One-column sizes (S and Tall) stay half width, as on the design
  // sheet, so two of them can sit side by side (RFC 0001 §12, decision 1).
  if (cols === 1) return { cols, rows, variant }
  // Banner is the always-full-width size: it keeps its own design at every
  // width, so a year heat map still shows the whole year (amendment B).
  if (variant === 'Banner') {
    const extra = phoneRows && Number.isInteger(phoneRows.Banner) && phoneRows.Banner > 0 ? phoneRows.Banner : rows
    return { cols: 2, rows: extra, variant }
  }
  if ((variant === 'L' || variant === 'XL') && list.includes('M')) return { cols: 2, rows: 2, variant: 'M' }
  return { cols: 2, rows, variant }
}
