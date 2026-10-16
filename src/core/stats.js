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

// ── Edge and funding (RFC 0003 §21.2) ─────────────────────────────────────
// Kept apart from the day figures above, so the calendar story's additions merge without touching these.

// A rounded sum: 18640.4 − 25000 is -6359.6 in exact arithmetic and -6359.599999999999 in floats, and that last digit would
// show in a deepEqual and could tip a formatted amount that should read ".60".
const tidy = (v) => Math.round(v * 1e8) / 1e8

/**
 * Win rate, profit factor, average win and loss, expectancy and average hold from a list of trades. A trade whose `pnl`
 * can't be read is skipped, not counted as zero: it would drag every average toward zero for a row the host got wrong.
 * A trade that made exactly nothing counts in `trades` and in expectancy's denominator, but is neither a win nor a loss.
 *
 * With no trades every figure is null. Profit factor is Infinity when there is a win and no loss (a ratio against nothing
 * is not a number, and null would read as "no data" on a record that is all wins); with only break-even trades it is null.
 */
export function edgeStats(trades) {
  const list = Array.isArray(trades) ? trades : []
  let n = 0
  let wins = 0
  let losses = 0
  let gain = 0
  let loss = 0
  let hold = 0
  let held = 0
  for (const trade of list) {
    if (!trade || typeof trade !== 'object') continue
    const pnl = toNumber(trade.pnl)
    if (!Number.isFinite(pnl)) continue
    n++
    if (pnl > 0) {
      wins++
      gain += pnl
    } else if (pnl < 0) {
      losses++
      loss += pnl
    }
    const ms = toNumber(trade.holdMs)
    if (Number.isFinite(ms) && ms >= 0) {
      hold += ms
      held++
    }
  }
  if (n === 0) {
    return { trades: 0, wins: 0, losses: 0, winRate: null, profitFactor: null, avgWin: null, avgLoss: null, expectancy: null, avgHoldMs: null }
  }
  return {
    trades: n,
    wins,
    losses,
    winRate: wins / n,
    profitFactor: losses === 0 ? (wins > 0 ? Infinity : null) : gain / -loss,
    avgWin: wins ? tidy(gain / wins) : null,
    avgLoss: losses ? tidy(loss / losses) : null,
    expectancy: tidy((gain + loss) / n),
    avgHoldMs: held ? hold / held : null,
  }
}

/**
 * Counts of `values` between consecutive `edges`: `[from, to)` for each bucket and the last one `[from, to]`, so the
 * largest edge is counted. Edges are sorted and de-duplicated first (a host's list is hardly ever checked), a value
 * outside every bucket is not counted, and fewer than two edges make no buckets.
 */
export function histogram(values, edges) {
  const cuts = [...new Set((Array.isArray(edges) ? edges : []).map(toNumber).filter(Number.isFinite))].sort((a, b) => a - b)
  if (cuts.length < 2) return []
  const out = []
  for (let i = 0; i < cuts.length - 1; i++) out.push({ from: cuts[i], to: cuts[i + 1], count: 0 })
  const last = out.length - 1
  for (const value of Array.isArray(values) ? values : []) {
    const v = toNumber(value)
    if (!Number.isFinite(v) || v < cuts[0] || v > cuts[cuts.length - 1]) continue
    // The first bucket whose upper edge is above v; v equal to the top edge falls into the closed last bucket.
    let i = 0
    while (i < last && v >= out[i].to) i++
    out[i].count++
  }
  return out
}

// An amount that is drawn can't be negative or unreadable: a bad row would otherwise grow the balance.
const amountOf = (v) => {
  const n = toNumber(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * How an account's balance covers its allocations (RFC 0001 decision 5): in array order, each draws what is left of the
 * balance and is short by the rest. A `funded` the host gives replaces that figure, held to 0..amount, and consumes that
 * much of the balance for the allocations after it (RFC 0003 §29 point 9); when it is more than what is left the balance
 * is spent, never negative. `free` is what remains. A balance that can't be read, or is negative, funds nothing.
 */
export function funding(account) {
  const a = account && typeof account === 'object' ? account : {}
  const balance = toNumber(a.balance)
  const list = Array.isArray(a.allocations) ? a.allocations : []
  let left = Number.isFinite(balance) && balance > 0 ? balance : 0
  let allocated = 0
  let fundedTotal = 0
  let shortfall = 0
  const allocations = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const amount = amountOf(item.amount)
    const given = toNumber(item.funded)
    const funded = Number.isFinite(given) ? Math.min(amount, Math.max(0, given)) : Math.min(amount, left)
    left = Math.max(0, left - funded)
    const pnl = toNumber(item.pnl)
    allocated += amount
    fundedTotal += funded
    shortfall += amount - funded
    const row = { id: String(item.id), name: typeof item.name === 'string' ? item.name : String(item.id) }
    if (typeof item.detail === 'string') row.detail = item.detail
    allocations.push({ ...row, amount: tidy(amount), funded: tidy(funded), short: tidy(amount - funded), live: item.live === true, pnl: Number.isFinite(pnl) ? pnl : null })
  }
  return {
    id: String(a.id),
    name: typeof a.name === 'string' ? a.name : String(a.id),
    balance: Number.isFinite(balance) ? balance : 0,
    allocated: tidy(allocated),
    free: tidy(left),
    shortfall: tidy(shortfall),
    fundedShare: allocated > 0 ? fundedTotal / allocated : null,
    allocations,
  }
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
