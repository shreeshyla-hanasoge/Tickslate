/**
 * Figures derived from a daily P&L series (RFC 0001 §6). Pure functions: the
 * widgets and a host that wants the same numbers elsewhere get one answer.
 */

import { toNumber } from './format.js'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The usable entries, sorted by date. Hosts pass whatever their API returned,
 * so a bad row is dropped rather than turning the whole series into NaN.
 * Dates are ISO, so comparing the strings sorts them; the sort is stable, so
 * two rows for one date keep the order they came in.
 */
function clean(days) {
  if (!Array.isArray(days)) return []
  const out = []
  for (const day of days) {
    if (!day || typeof day.date !== 'string' || !DATE.test(day.date)) continue
    const pnl = toNumber(day.pnl)
    if (!Number.isFinite(pnl)) continue
    out.push({ date: day.date, pnl, trades: day.trades })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * Running equity, its running peak and the drop from that peak, one row per
 * valid day. Equity starts from 0 and the peak counts that starting 0, so a
 * series that only ever loses has a peak of 0 and a drawdown equal to its
 * equity, rather than a "peak" that is already a loss.
 */
export function equitySeries(days) {
  let equity = 0
  let peak = 0
  return clean(days).map((day) => {
    equity += day.pnl
    if (equity > peak) peak = equity
    return { date: day.date, equity, peak, drawdown: equity - peak }
  })
}

export function equityStats(days) {
  const rows = clean(days)
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
