/**
 * Geometry for the small line and area charts in the widgets. Pure: it turns
 * data into SVG path strings and touches no DOM, so node --test covers it and
 * the widgets only have to set `d` attributes.
 *
 * Charts are drawn in a viewBox of `width` × `height` and stretched to fit,
 * with `vector-effect: non-scaling-stroke` keeping lines the same weight.
 */

const round = (v) => Math.round(v * 10) / 10

const finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)

/** A linear map from the domain [d0, d1] to the range [r0, r1]. */
export function scale(d0, d1, r0, r1) {
  // A flat series has no extent to stretch; the middle of the box shows it as
  // a level line instead of sticking it to an edge or dividing by zero.
  if (d0 === d1) return () => (r0 + r1) / 2
  const k = (r1 - r0) / (d1 - d0)
  return (v) => r0 + (v - d0) * k
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// [min, max] of one coordinate over the points, in a loop: spreading a long
// series into Math.min passes one argument per point and overflows the stack
// (in Node's V8, from about 125,000 points). Folding with Math.min and
// Math.max gives exactly what the spread gave, NaN and -0 included.
function extent(points, key) {
  let lo = Infinity
  let hi = -Infinity
  for (const p of points) {
    lo = Math.min(lo, p[key])
    hi = Math.max(hi, p[key])
  }
  return [lo, hi]
}

/** 'M x y L x y …' for points in data units, or '' when there are none. */
export function linePath(points, x, y) {
  let d = ''
  for (const p of points) {
    if (!finite(p)) continue
    d += `${d ? ' L' : 'M'}${round(x(p.x))} ${round(y(p.y))}`
  }
  return d
}

/**
 * The line, the filled area down to zero and the scales used to make them, so
 * a widget can place marks and extra lines (a peak, a drawdown) on the same
 * axes.
 *
 * Y is flipped, larger values higher. `pad` keeps the stroke and end marks
 * inside the box. `zeroY` is where value 0 falls, clamped to the plotted
 * area: a widget clips the profit colour to above it and the loss colour to
 * below it, and when every value is on one side the split falls on an edge.
 */
export function linePaths(points, { width, height, pad = 4, xDomain, yDomain, includeZero = true } = {}) {
  const pts = (points || []).filter(finite)
  const [x0, x1] = xDomain || (pts.length ? extent(pts, 'x') : [0, 1])
  let [y0, y1] = yDomain || (pts.length ? extent(pts, 'y') : [0, 1])
  if (includeZero) {
    y0 = Math.min(y0, 0)
    y1 = Math.max(y1, 0)
  }
  const x = scale(x0, x1, pad, width - pad)
  const y = scale(y0, y1, height - pad, pad)
  const zeroY = round(clamp(y(0), pad, height - pad))

  if (!pts.length) return { line: '', area: '', zeroY, x, y }

  let line
  let firstX
  let lastX
  if (pts.length === 1) {
    // One reading has no direction; a level line across the chart shows where
    // it sits without implying a trend.
    firstX = round(pad)
    lastX = round(width - pad)
    const py = round(y(pts[0].y))
    line = `M${firstX} ${py} L${lastX} ${py}`
  } else {
    line = linePath(pts, x, y)
    firstX = round(x(pts[0].x))
    lastX = round(x(pts[pts.length - 1].x))
  }
  const area = `${line} L${lastX} ${zeroY} L${firstX} ${zeroY} Z`
  return { line, area, zeroY, x, y }
}

/**
 * A closed shape between two lines: along `upper`, then back along `lower`.
 * For drawdown, `upper` is the running peak and `lower` the equity, so the
 * shaded band is exactly how far below its high the curve is.
 */
export function bandPath(lower, upper, x, y) {
  const top = (upper || []).filter(finite)
  const bottom = (lower || []).filter(finite)
  if (!top.length || !bottom.length) return ''
  const forward = linePath(top, x, y)
  let back = ''
  for (let i = bottom.length - 1; i >= 0; i--) back += ` L${round(x(bottom[i].x))} ${round(y(bottom[i].y))}`
  return `${forward}${back} Z`
}

/**
 * The shared domain of several series: [min, max] of x and of y over every
 * finite point, so lines drawn on it line up. Loops, not spreads, as `extent`
 * does. `includeZero` (default true) stretches y to 0; a chart of plain lines
 * passes false so a level far from zero isn't flattened against the top.
 * With nothing to measure the domain is [0, 1] on both axes.
 */
export function seriesDomain(series, { includeZero = true } = {}) {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (const points of series || []) {
    for (const p of points || []) {
      if (!finite(p)) continue
      x0 = Math.min(x0, p.x)
      x1 = Math.max(x1, p.x)
      y0 = Math.min(y0, p.y)
      y1 = Math.max(y1, p.y)
    }
  }
  if (x0 === Infinity) return { x: [0, 1], y: [0, 1] }
  if (includeZero) {
    y0 = Math.min(y0, 0)
    y1 = Math.max(y1, 0)
  }
  return { x: [x0, x1], y: [y0, y1] }
}

/**
 * One series drawn on a domain it shares with others: its line, its area
 * closed at the zero line, and where that line falls. The domain is the
 * caller's, so no series stretches the axes for the rest.
 */
export function areaPaths(points, { width, height, pad = 4, xDomain, yDomain }) {
  const { line, area, zeroY } = linePaths(points, { width, height, pad, xDomain, yDomain, includeZero: false })
  return { line, area, zeroY }
}

/**
 * Where `count` equal bands fall between r0 and r1, as plain numbers so the
 * band scale below and `barPaths` share one set of positions. `count` may be
 * fractional: a time axis with bars is read as slots of the smallest gap
 * between bars, and its span is not always a whole number of them.
 */
export function bandGeometry(count, r0, r1, padding = 0.2) {
  const gap = clamp(Number.isFinite(padding) ? padding : 0.2, 0, 1)
  // Nothing to place has no band; a zero keeps every position finite.
  const band = count > 0 ? (r1 - r0) / count : 0
  return {
    band,
    start: (i) => r0 + i * band + (band * gap) / 2,
    centre: (i) => r0 + (i + 0.5) * band,
    // The width left for bars once the padding is taken out of the band.
    inner: band * (1 - gap),
  }
}

/**
 * A band scale for a category axis: one equal band per label, the label's
 * index picking where it falls. `padding` (0 to 1, default .2) is the share
 * of a band left empty around its bars. A label that isn't there has index -1.
 */
export function bandScale(categories, r0, r1, { padding } = {}) {
  const list = categories || []
  const g = bandGeometry(list.length, r0, r1, padding)
  const at = new Map()
  for (let i = 0; i < list.length; i++) if (!at.has(list[i])) at.set(list[i], i)
  return { band: g.band, start: g.start, centre: g.centre, index: (label) => (at.has(label) ? at.get(label) : -1) }
}

/**
 * Bars for several series, grouped side by side inside each band and drawn
 * from the zero line: up for positive values, down for negative. One path per
 * series, so a live update rewrites one attribute. `x` is the band index (a
 * fraction is fine, for bars on a time or number axis); `categories` is how
 * many bands the plot holds. The y domain always takes in zero, so a bar has
 * a base to stand on. `centres` are the bands' middles, for marks that share
 * the axis.
 */
export function barPaths(groups, { width, height, pad = 4, categories = 0, yDomain, padding } = {}) {
  const lists = (groups || []).map((g) => (g || []).filter(finite))
  let [y0, y1] = yDomain || [Infinity, -Infinity]
  if (!yDomain) for (const pts of lists) if (pts.length) {
    const [lo, hi] = extent(pts, 'y')
    y0 = Math.min(y0, lo)
    y1 = Math.max(y1, hi)
  }
  if (!Number.isFinite(y0) || !Number.isFinite(y1)) [y0, y1] = [0, 1]
  y0 = Math.min(y0, 0)
  y1 = Math.max(y1, 0)
  const y = scale(y0, y1, height - pad, pad)
  const zeroY = round(clamp(y(0), pad, height - pad))
  const g = bandGeometry(categories, pad, width - pad, padding)
  const each = lists.length ? g.inner / lists.length : 0
  const centres = []
  for (let i = 0; i < categories; i++) centres.push(round(g.centre(i)))

  const paths = lists.map((pts, n) => {
    let d = ''
    for (const p of pts) {
      const vy = round(y(p.y))
      // A zero bar has no height to draw; leaving it out keeps the path clean.
      if (vy === zeroY) continue
      const left = round(g.start(p.x) + n * each)
      const right = round(g.start(p.x) + (n + 1) * each)
      d += `${d ? ' ' : ''}M${left} ${zeroY}V${vy}H${right}V${zeroY}Z`
    }
    return d
  })
  return { paths, zeroY, centres }
}
