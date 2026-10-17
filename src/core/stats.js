/**
 * Figures derived from a daily P&L series (RFC 0001 §6). Pure functions: the
 * widgets and a host that wants the same numbers elsewhere get one answer.
 */

import { toNumber } from './format.js'
import { toDay } from './time.js'

/**
 * The usable entries, sorted by date. Hosts pass whatever their API returned,
 * so a bad row is dropped rather than turning the whole series into NaN.
 * Dates are read with toDay in `timeZone`, so an instant lands on the day the
 * trader saw. They are then 'YYYY-MM-DD', so comparing the strings sorts them;
 * the sort is stable, so two rows for one date keep the order they came in.
 */
function clean(days, timeZone) {
  if (!Array.isArray(days)) return []
  const out = []
  for (const day of days) {
    if (!day) continue
    const date = toDay(day.date, timeZone)
    if (date === null) continue
    const pnl = toNumber(day.pnl)
    if (!Number.isFinite(pnl)) continue
    out.push({ date, pnl, trades: day.trades })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * Running equity, its running peak and the drop from that peak, one row per
 * valid day. Equity starts from 0 and the peak counts that starting 0, so a
 * series that only ever loses has a peak of 0 and a drawdown equal to its
 * equity, rather than a "peak" that is already a loss.
 */
export function equitySeries(days, options) {
  // null is not undefined, so a destructuring default alone would throw on it.
  const { timeZone = 'UTC' } = options || {}
  let equity = 0
  let peak = 0
  return clean(days, timeZone).map((day) => {
    equity += day.pnl
    if (equity > peak) peak = equity
    return { date: day.date, equity, peak, drawdown: equity - peak }
  })
}

export function equityStats(days, options) {
  const { timeZone = 'UTC' } = options || {}
  const rows = clean(days, timeZone)
  let equity = 0
  let peak = 0
  let maxDrawdown = 0
  let trades = 0
  for (const day of rows) {
    equity += day.pnl
    if (equity > peak) peak = equity
    if (peak - equity > maxDrawdown) maxDrawdown = peak - equity
    const n = day.trades
    if (typeof n === 'number' && Number.isFinite(n)) trades += n
  }
  return { net: equity, peak, maxDrawdown, tradingDays: rows.length, trades }
}

/**
 * A day's total as the books show it: to the cent. A day that sums to 5.55e-17 (0.1 + 0.2 - 0.3) is flat, not green,
 * and the calendar's cells and dayStats both ask here, so they never disagree about a day's colour. Not part of the
 * public API.
 */
export function settle(pnl) {
  return Math.round(pnl * 100) / 100 || 0
}

/**
 * The day-by-day figures of a daily P&L series (RFC 0003 §21.1). Rows that
 * share a date are summed first, because a day is one result however many
 * rows a backend split it into, and each total is settled to the cent; a day is then green when its net is above zero
 * and red when below, and a day that nets to exactly zero is neither. The rate
 * is over the days that were one or the other, so a flat day does not dilute it.
 * With no days there is nothing to rank, so best, worst and the rate are null.
 */
export function dayStats(days, options) {
  const { timeZone = 'UTC' } = options || {}
  const byDate = new Map()
  for (const row of clean(days, timeZone)) byDate.set(row.date, (byDate.get(row.date) || 0) + row.pnl)
  let net = 0
  let greenDays = 0
  let redDays = 0
  let best = null
  let worst = null
  for (const total of byDate.values()) {
    const pnl = settle(total)
    net += pnl
    if (pnl > 0) greenDays++
    else if (pnl < 0) redDays++
    if (best === null || pnl > best) best = pnl
    if (worst === null || pnl < worst) worst = pnl
  }
  const counted = greenDays + redDays
  return { net, greenDays, redDays, greenRate: counted ? greenDays / counted : null, best, worst }
}
