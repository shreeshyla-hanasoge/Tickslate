/**
 * Geometry for the small line and area charts in the widgets. Pure: it turns
 * data into SVG path strings and touches no DOM, so node --test covers it and
 * the widgets only have to set `d` attributes.
 *
 * Charts are drawn in a viewBox of `width` × `height` and stretched to fit,
 * with `vector-effect: non-scaling-stroke` keeping lines the same weight.
 */

import { DEV, warnOnce } from './dev.js'

// The fewest points that still hold the first, the last, a low and a high.
const MIN_POINTS = 4

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
 * At most `max` of the points, for a line that cannot show more than it has
 * pixels (RFC 0003 §23). The first and last point stay; the readings between
 * are cut into equal runs by position and each run keeps its lowest and its
 * highest, in the order they came, so a spike narrower than a pixel still
 * shows and the day's low, high and last value are exactly the data's. One
 * pass, no sort, no copy of the input.
 */
export function downsample(points, max) {
  const n = points.length
  const cap = Math.max(2, Math.floor(max))
  if (!(max < n) || n <= cap) return points
  const buckets = Math.floor((cap - 2) / 2)
  const out = [points[0]]
  const inner = n - 2
  for (let b = 0; b < buckets; b++) {
    // Integer edges, so the runs tile the interior with no gap and no overlap.
    const from = 1 + Math.floor((b * inner) / buckets)
    const to = 1 + Math.floor(((b + 1) * inner) / buckets)
    if (to <= from) continue
    let lo = from
    let hi = from
    for (let i = from + 1; i < to; i++) {
      if (points[i].y < points[lo].y) lo = i
      if (points[i].y > points[hi].y) hi = i
    }
    if (lo === hi) out.push(points[lo])
    else if (lo < hi) out.push(points[lo], points[hi])
    else out.push(points[hi], points[lo])
  }
  out.push(points[n - 1])
  return out
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
 *
 * The scales and the zero line are measured on every point; only the drawing
 * is thinned, to `maxPoints` (default 2 × width, Infinity for all of them).
 */
export function linePaths(points, { width, height, pad = 4, xDomain, yDomain, includeZero = true, maxPoints } = {}) {
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

  if (!pts.length) return { line: '', area: '', zeroY, x, y, drawn: pts }

  let line
  let firstX
  let lastX
  // The points the line runs through, for a scrubber: its readout never names a point the line skips.
  let drawn = pts
  if (pts.length === 1) {
    // One reading has no direction; a level line across the chart shows where
    // it sits without implying a trend.
    firstX = round(pad)
    lastX = round(width - pad)
    const py = round(y(pts[0].y))
    line = `M${firstX} ${py} L${lastX} ${py}`
  } else {
    // null (a JSON host's "unset") and NaN mean the default. Below four a line keeps neither its low nor its high, so
    // that is the floor, and a width that gives less (0) gets it too.
    let cap = maxPoints == null || Number.isNaN(maxPoints) ? 2 * width : maxPoints
    if (cap < MIN_POINTS) {
      if (DEV && maxPoints != null && !Number.isNaN(maxPoints)) warnOnce('maxPoints-floor', `linePaths maxPoints is ${maxPoints}; a line needs at least ${MIN_POINTS} points to keep its low and high, so it draws ${MIN_POINTS}. Pass Infinity to draw every point.`)
      cap = MIN_POINTS
    }
    drawn = downsample(pts, cap)
    line = linePath(drawn, x, y)
    firstX = round(x(pts[0].x))
    lastX = round(x(pts[pts.length - 1].x))
  }
  const area = `${line} L${lastX} ${zeroY} L${firstX} ${zeroY} Z`
  return { line, area, zeroY, x, y, drawn }
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


// Bands past this many are not listed one by one in `centres`: marks use bandGeometry directly, and a caller that
// passes a runaway count must get a result, not a hung page.
const MAX_CENTRES = 1024

/**
 * Bars for several series, grouped side by side inside each band and drawn
 * from the zero line: up for positive values, down for negative. One path per
 * series, so a live update rewrites one attribute. `x` is the band index (a
 * fraction is fine, for bars on a time or number axis); `categories` is how
 * many bands the plot holds. The y domain always takes in zero, so a bar has
 * a base to stand on. `centres` are the bands' middles (the first 1,024), for
 * marks that share the axis.
 *
 * Every bar is at least `minWidth` wide (1 drawing unit) and every nonzero
 * value at least `minHeight` tall, so crowded or tiny data stays visible; a
 * true zero draws nothing. `rects` holds each bar's box as { x, y, w, h },
 * in the groups' own order, for a caller that makes the bar a target.
 */
export function barPaths(groups, { width, height, pad = 4, categories = 0, yDomain, padding, minWidth = 1, minHeight = 1 } = {}) {
  const lists = (groups || []).map((g) => (g || []).filter(finite))
  let [y0, y1] = yDomain || [Infinity, -Infinity]
  if (!yDomain) {
    for (const pts of lists) {
      if (!pts.length) continue
      const [lo, hi] = extent(pts, 'y')
      y0 = Math.min(y0, lo)
      y1 = Math.max(y1, hi)
    }
  }
  if (!Number.isFinite(y0) || !Number.isFinite(y1)) [y0, y1] = [0, 1]
  y0 = Math.min(y0, 0)
  y1 = Math.max(y1, 0)
  const y = scale(y0, y1, height - pad, pad)
  const zeroY = round(clamp(y(0), pad, height - pad))
  const g = bandGeometry(categories, pad, width - pad, padding)
  const share = lists.length ? g.inner / lists.length : 0
  const each = Math.max(share, minWidth)
  const centres = []
  for (let i = 0; i < categories && i < MAX_CENTRES; i++) centres.push(round(g.centre(i)))

  const rects = []
  const paths = lists.map((pts, n) => {
    let d = ''
    const boxes = []
    for (const p of pts) {
      let vy = round(y(p.y))
      // A real value never rounds away to nothing; only a true zero draws no bar.
      if (p.y !== 0 && Math.abs(vy - zeroY) < minHeight) vy = p.y > 0 ? round(zeroY - minHeight) : round(zeroY + minHeight)
      // A bar narrower than the minimum is widened about the middle of its share of the band.
      const mid = g.start(p.x) + (n + 0.5) * share
      const left = round(mid - each / 2)
      const right = round(mid + each / 2)
      boxes.push({ x: left, y: Math.min(vy, zeroY), w: round(right - left), h: round(Math.abs(vy - zeroY)) })
      if (p.y === 0) continue
      d += `${d ? ' ' : ''}M${left} ${zeroY}V${vy}H${right}V${zeroY}Z`
    }
    rects.push(boxes)
    return d
  })
  return { paths, zeroY, centres, rects }
}

/**
 * Ring segments for shares that sum to 1 (a donut): one closed path per share,
 * 'M … A … L … A … Z', in a viewBox of `size` centred on the middle. The first
 * segment starts at twelve o'clock and they run clockwise. `gapDeg` is trimmed
 * between neighbours so adjacent slices are told apart by more than colour; a
 * segment keeps at least half its own width, so a thin slice never vanishes.
 * A zero share gives '' (nothing to draw); a share of 1 is a whole ring drawn as
 * two half arcs, since one arc cannot close on its own start point.
 */
export function arcPaths(fractions, { size, radius, inner, gapDeg = 1 } = {}) {
  const c = size / 2
  const at = (rad, deg) => `${round(c + rad * Math.cos(deg * RAD))} ${round(c + rad * Math.sin(deg * RAD))}`
  const out = []
  let start = -90
  for (const f of fractions || []) {
    if (!(f > 0)) {
      out.push('')
      continue
    }
    if (f >= 1 - 1e-9) {
      out.push(
        `M${at(radius, -90)} A${radius} ${radius} 0 1 1 ${at(radius, 90)} A${radius} ${radius} 0 1 1 ${at(radius, 270)} ` +
          `L${at(inner, 270)} A${inner} ${inner} 0 1 0 ${at(inner, 90)} A${inner} ${inner} 0 1 0 ${at(inner, -90)} Z`,
      )
      start += 360
      continue
    }
    const span = f * 360
    const gap = Math.min(gapDeg, span / 2)
    const a0 = start + gap / 2
    const a1 = start + span - gap / 2
    const large = a1 - a0 > 180 ? 1 : 0
    out.push(`M${at(radius, a0)} A${radius} ${radius} 0 ${large} 1 ${at(radius, a1)} L${at(inner, a1)} A${inner} ${inner} 0 ${large} 0 ${at(inner, a0)} Z`)
    start += span
  }
  return out
}

const RAD = Math.PI / 180

/**
 * The point whose x is nearest a position, for a scrubber (RFC 0004 §1.1), or null for no points or a position
 * that isn't a number. `xFraction` is a share of the x domain, 0 the domain's start and 1 its end, and a value
 * outside 0..1 is clamped. `points` are ascending by x, as the charts draw them; a caller on a category axis has
 * already mapped each category to its band's centre, so one function serves time, number and category axes.
 * `domain` defaults to the first and last x of `points`; a chart drawn on a window (Today's P&L's session) passes
 * it, so the right edge of the box is the end of the window and not the last reading. A tie goes to the earlier
 * point. A binary search over a fixed number of steps: it allocates nothing and cannot loop on unsorted input.
 */
export function nearestPoint(points, xFraction, { domain } = {}) {
  const n = points ? points.length : 0
  if (!n || typeof xFraction !== 'number' || Number.isNaN(xFraction)) return null
  const [d0, d1] = domain || [points[0].x, points[n - 1].x]
  const target = d0 + clamp(xFraction, 0, 1) * (d1 - d0)
  // The first point at or after the target.
  let lo = 0
  let hi = n
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].x < target) lo = mid + 1
    else hi = mid
  }
  let at = lo
  if (lo >= n) at = n - 1
  else if (lo > 0 && target - points[lo - 1].x <= points[lo].x - target) at = lo - 1
  const p = points[at]
  return { index: at, x: p.x, y: p.y }
}

/**
 * Turns a pointer's share of the drawing box (0 at its start edge, 1 at its end) into a share of the x domain,
 * undoing the inset `pad` the drawing keeps inside the viewBox (`linePaths`). The result may fall outside 0..1
 * over the padding; nearestPoint clamps it.
 */
export function plotFraction(boxFraction, { width, pad = 0 }) {
  const inner = width - 2 * pad
  if (!(inner > 0)) return boxFraction
  return (boxFraction * width - pad) / inner
}
