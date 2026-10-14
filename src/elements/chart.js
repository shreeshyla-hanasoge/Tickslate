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
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  const [x0, x1] = xDomain || (pts.length ? [Math.min(...xs), Math.max(...xs)] : [0, 1])
  let [y0, y1] = yDomain || (pts.length ? [Math.min(...ys), Math.max(...ys)] : [0, 1])
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
