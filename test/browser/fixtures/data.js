// Made-up, deterministic data for the browser fixtures. Nothing here comes
// from a real account or a design reference, and nothing reads the real clock:
// the frozen time is a fixed weekday morning, so every run draws the same
// pixels and the same words.
import { configure, createCalendar, presets, zonedTime } from '/src/core/index.js'

export const TZ = 'Asia/Kolkata'
export const TODAY = '2026-08-05' // a Wednesday
export const FROZEN = zonedTime(TODAY, '11:42', TZ) + 20000
export const frozenClock = () => FROZEN

export const calendar = createCalendar({ sessions: [presets.nse({ segment: 'derivatives' }), presets.mcx()] })

export function setup() {
  configure({ locale: 'en-IN', currency: 'INR', timeZone: TZ })
}

// A small seeded generator, so the same curves appear on every load.
export function seeded(seed) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY_MS = 86400000
const shiftDay = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const isWeekend = (iso) => [0, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay())
const weekdayOnOrBefore = (iso) => {
  while (isWeekend(iso)) iso = shiftDay(iso, -1)
  return iso
}

// `scale` stretches every money figure, so one generator serves both the
// ordinary data and the churn test that pushes values to +-1e12.
function todayPnl(scale = 1) {
  const hours = calendar.hours('nse-fo', TODAY)
  const rng = seeded(7)
  const span = FROZEN - hours.open
  const intraday = []
  let wobble = 0
  for (let t = hours.open; t <= FROZEN; t += 60000) {
    const f = (t - hours.open) / span
    wobble = wobble * 0.9 + (rng() - 0.5) * 36
    intraday.push({ t, v: (2600 * (0.9 * f * f + 0.1 * f) + wobble) * scale })
  }
  const net = intraday[intraday.length - 1].v
  return {
    net,
    unrealized: net * 0.38,
    realized: net * 0.62 + 184.6 * scale,
    fees: 184.6 * scale,
    closedCount: 9,
    openCount: 2,
    intraday,
    marks: [
      { t: intraday[20].t, kind: 'entry' },
      { t: intraday[60].t, kind: 'exit' },
    ],
    window: { from: hours.open, to: hours.close },
    asOf: FROZEN,
    live: true,
  }
}

function equityCurve(scale = 1) {
  const rng = seeded(42)
  const dates = []
  for (let d = weekdayOnOrBefore(shiftDay(TODAY, -1)); dates.length < 60; d = weekdayOnOrBefore(shiftDay(d, -1))) dates.unshift(d)
  const days = dates.map((date, i) => {
    const drift = i < 22 ? 650 : i < 40 ? -1150 : 900
    return { date, pnl: (drift + (rng() - 0.5) * 4200) * scale, trades: 2 + Math.floor(rng() * 8) }
  })
  return { days, fees: 21460.35 * scale, trades: days.reduce((sum, d) => sum + d.trades, 0) }
}

const day = (n) => Date.UTC(2026, 7, 3 + n)
const wave = (base, amp, phase, drift, scale, n = 40) =>
  Array.from({ length: n }, (_, i) => (base + amp * Math.sin((i + phase) / 4.6) + drift * i) * scale)
const pts = (values) => values.map((y, i) => ({ x: day(i), y }))

const STRATEGIES = ['Opening range breakout', 'Mean reversion', 'Carry', 'Gap fade', 'Momentum', 'Pairs', 'Volatility', 'Calendar spread', 'Index arbitrage', 'Trend follow', 'Basis trade', 'Straddle', 'Iron condor', 'Scalper', 'Swing', 'Hedge']

/** A strategies table: money in the account currency, signed P&L and returns, `rows` of them. */
export function table(scale = 1, rows = 16, tick = 0) {
  const rng = seeded(11)
  return {
    columns: [
      { key: 'name', label: 'Strategy', priority: 0 },
      { key: 'pnl', label: 'P&L', format: 'money', tone: 'sign', priority: 1 },
      { key: 'ret', label: 'Return', format: 'percent', decimals: 1, tone: 'sign', priority: 3 },
      { key: 'capital', label: 'Capital', format: 'money', decimals: 0, priority: 2 },
      { key: 'trades', label: 'Trades', format: 'number', priority: 4 },
      { key: 'avg', label: 'Avg hold', format: 'duration', priority: 5 },
    ],
    rows: Array.from({ length: rows }, (_, i) => {
      const pnl = (rng() - 0.45) * 90000 * scale + (i === 3 ? tick * 137.5 : 0)
      const capital = (200000 + rng() * 800000) * scale
      return { id: `s${i}`, name: `${STRATEGIES[i % STRATEGIES.length]}${i >= STRATEGIES.length ? ` ${Math.floor(i / STRATEGIES.length) + 1}` : ''}`, pnl, ret: pnl / capital, capital, trades: 4 + Math.floor(rng() * 90), avg: (5 + rng() * 240) * 60000 }
    }),
    sort: { key: 'pnl', dir: 'desc' },
    asOf: FROZEN,
    live: true,
  }
}

/** Data for a tag. `scale` multiplies every figure (1 is the ordinary size of the numbers). */
export function dataFor(tag, scale = 1) {
  switch (tag) {
    case 'ts-card':
      return { asOf: FROZEN }
    case 'ts-metric':
      return {
        value: 1204 * scale, previous: 1075 * scale, compareLabel: 'vs last week', asOf: FROZEN, target: 1500 * scale,
        caption: 'New accounts, this week',
        series: [820, 860, 905, 880, 940, 1010, 985, 1040, 1100, 1075, 1150, 1204].map((v) => v * scale),
      }
    case 'ts-chart':
      return {
        series: [
          { name: 'Requests', kind: 'area', points: pts(wave(4200, 700, 0, 12, scale)) },
          { name: 'Errors', points: pts(wave(3100, 500, 5, 8, scale)) },
          { name: 'Cached', points: pts(wave(2000, 400, 9, 5, scale)) },
        ],
        asOf: FROZEN,
      }
    case 'ts-progress':
      // The target stays positive for a negative scale, so every set draws a gauge; the magnitude is in the figures.
      return { value: 6400 * scale, target: 10000 * Math.abs(scale), mode: 'limit', format: 'money', caption: 'Resets at 09:15', asOf: FROZEN }
    case 'ts-table': {
      // The first column carries the data's magnitude too, so a narrow size that shows only it still shows the data changing.
      const t = table(scale)
      const mag = Math.floor(Math.log10(Math.abs(scale) + 1) * 10)
      t.rows.forEach((r, i) => { r.name = `${r.name} ${i}${mag}` })
      return t
    }
    case 'ts-watchlist': {
      // Like the table, the first instrument's name carries the data's magnitude, so S still shows the data changing.
      const w = watchlist({ scale })
      w.instruments[0].symbol = `${w.instruments[0].symbol} ${Math.floor(Math.log10(Math.abs(scale) + 1) * 10)}`
      return w
    }
    case 'ts-open-positions': {
      const p = openPositions({ scale })
      p.positions[0].instrument = `${p.positions[0].instrument} ${Math.floor(Math.log10(Math.abs(scale) + 1) * 10)}`
      return p
    }
    case 'ts-pnl-calendar':
      return pnlCalendar({ scale })
    case 'ts-edge-stats':
      return edgeStatsData(scale)
    case 'ts-capital-funding':
      return fundingData(scale)
    case 'ts-today-pnl':
      return todayPnl(scale)
    case 'ts-equity-curve':
      return equityCurve(scale)
    case 'ts-session-clock':
      return { calendar, sessions: ['nse-fo', 'mcx'], timeframes: [5, 15] }
    case 'ts-mini-chart':
      return miniChart(scale)
    default:
      return null
  }
}

const ROWS = [['Larkspur Press', '2 min'], ['Tidewater Bakery', '9 min'], ['Mossgate Cycles', '14 min'], ['Pinecone Audio', '31 min'], ['Halyard Books', '48 min'], ['Quarry Lane Studio', '1 h']]

/** What a card holds, slotted, as a host would: a headline small, a list larger. */
export function fillCard(el, size) {
  el.setAttribute('label', 'New subscribers')
  el.setAttribute('sizes', 'S Wide Tall M L Banner XL')
  if (size === 'S' || size === 'Wide') {
    el.insertAdjacentHTML('beforeend', '<span slot="value">42</span><span slot="footer">Newest 2 min ago</span>')
    return
  }
  const rows = size === 'Banner' ? ROWS.slice(0, 2) : ROWS
  el.insertAdjacentHTML('beforeend', `<ul>${rows.map(([n, w]) => `<li>${n} <small>${w}</small></li>`).join('')}</ul><span slot="footer">Newest first</span>`)
}

/** A tag's label for the tiles that don't set one, so every tile has a name. */
export const LABELS = { 'ts-card': 'Notes' }

// ── The mini chart ────────────────────────────────────────────────────────
/** `n` five-minute bars of a random walk ending at the frozen morning, so the last one is still forming. */
export function miniBars({ seed = 11, n = 30, base = 128, scale = 1 } = {}) {
  const rng = seeded(seed)
  const start = zonedTime(TODAY, '09:15', TZ)
  let close = base
  return Array.from({ length: n }, (_, i) => {
    const open = close
    close = open + (rng() - 0.48) * 1.1
    const high = Math.max(open, close) + rng() * 0.5
    const low = Math.min(open, close) - rng() * 0.5
    return { time: start + i * 300000, open: open * scale, high: high * scale, low: low * scale, close: close * scale, volume: Math.round(900 + rng() * 2600) }
  })
}

/** A profile the host would compute from finer data: a bell of volume over the day's range, in Emberwick's contract. */
export function miniProfile(bars) {
  const lo = Math.floor(Math.min(...bars.map((b) => b.low)))
  const hi = Math.ceil(Math.max(...bars.map((b) => b.high)))
  const step = 0.5
  const bins = Array.from({ length: Math.round((hi - lo) / step) }, (_, i) => {
    const mid = (bars.at(-1).close - lo) / step
    return Math.round(400 * Math.exp(-((i - mid) ** 2) / 40))
  })
  return { version: 1, source: 'tick data', step, sessions: [{ start: bars[0].time, end: bars.at(-1).time, lo, bins }] }
}

function miniChart(scale = 1) {
  const a = miniBars({ seed: 11, base: 128, scale })
  const b = miniBars({ seed: 23, base: 412, scale })
  return {
    asOf: FROZEN,
    countdown: true,
    charts: [
      {
        id: 'abc', instrument: 'ABC Corp', timeframe: '5m', timeframes: ['1m', '5m', '15m'], bars: a, changePct: 0.012, note: '2 strategies · 1 in position',
        marks: [{ t: a[8].time, kind: 'entry', label: 'Long' }, { t: a[19].time, kind: 'exit' }, { t: a[24].time, kind: 'entry' }],
      },
      { id: 'xyz', instrument: 'XYZ Ltd', timeframe: '5m', bars: b, changePct: -0.007, note: '1 strategy', marks: [{ t: b[12].time, kind: 'entry' }] },
    ],
    // The churn tests scale prices to 1e12, which would make millions of bins.
    volumeProfile: scale === 1 ? miniProfile(a) : null,
  }
}

// ── The two trading lists ─────────────────────────────────────────────────
// `step` moves the live figures the way a feed would: only some instruments tick at a step, so a test can count the
// cells a tick touched. `plain` leaves the day range, the stop and the target out of the data.
const NAMES = ['ALPHA 50', 'BETA BANK', 'GAMMA IT', 'DELTA AUTO', 'OMEGA PHARMA', 'SIGMA METALS', 'THETA ENERGY', 'KAPPA FMCG', 'LAMBDA INFRA', 'ZETA FIN',
  'ETA 24500 CE', 'IOTA 24400 PE', 'MU CRUDE', 'NU GOLD', 'XI USDINR', 'PI MIDCAP', 'RHO SMALLCAP', 'TAU NEXT 50']
const EXCHANGES = ['NSE', 'NSE', 'NSE', 'BSE', 'NSE', 'NSE', 'NSE', 'NSE', 'BSE', 'NSE', 'NFO', 'NFO', 'MCX', 'MCX', 'CDS', 'NSE', 'NSE', 'NSE']
const PRICES = [24350.45, 52110.8, 3480.2, 1260.75, 9845.1, 1020.3, 410.65, 2765.9, 318.25, 1587.4, 133.4, 96.15, 6412, 71844, 83.4125, 55120, 18340.6, 68250]
const T0 = FROZEN - 135 * 60000

/** A watchlist of `n` instruments: a loss and a gain, one with its own change, one with no range, one with four decimals. */
export function watchlist({ n = 14, step = 0, plain = false, scale = 1 } = {}) {
  return {
    live: true,
    asOf: FROZEN + step * 1000,
    instruments: Array.from({ length: n }, (_, i) => {
      const r = seeded(100 + i)
      const price = PRICES[i % 18] * scale
      const drift = (r() - 0.5) * 0.03
      const dp = i % 18 === 14 ? 4 : i % 4 === 3 ? 0 : 2
      const ticking = (i + step) % 3 === 0 ? step * (r() - 0.45) * 0.0006 : 0
      const spread = price * 0.012
      const out = {
        id: `i${i}`, symbol: NAMES[i % 18], exchange: EXCHANGES[i % 18], ltp: Number((price * (1 + drift + ticking)).toFixed(dp)), prevClose: price, decimals: dp,
        ticks: Array.from({ length: 40 }, (_, k) => ({ t: T0 + k * 180000, price: price * (1 + drift * (k / 39) + Math.sin(k / 4 + i) * 0.002) })),
      }
      if (i === 2) {
        out.change = 12.5 * scale
        out.changePct = 0.0036
      }
      if (i !== 5 && !plain) {
        out.dayLow = Number((price - spread).toFixed(dp))
        out.dayHigh = Number((price + spread * 1.3).toFixed(dp))
      }
      return out
    }),
  }
}

/** `n` open positions, long and short: gains and losses, one with a stop and no target, one with neither. */
export function openPositions({ n = 9, step = 0, plain = false, scale = 1 } = {}) {
  return {
    live: true,
    asOf: FROZEN + step * 1000,
    margin: 184500.5 * scale,
    positions: Array.from({ length: n }, (_, i) => {
      const r = seeded(200 + i)
      const price = PRICES[(i + 10) % 18]
      const long = i % 3 !== 1
      const entry = Number((price * (1 + (r() - 0.5) * 0.01)).toFixed(2))
      const ticking = (i + step) % 3 === 0 ? step * (r() - 0.45) * 0.0008 : 0
      const ltp = Number((price * (1 + (r() - 0.5) * 0.018 + ticking)).toFixed(2))
      const quantity = [50, 75, 120, 25, 200][i % 5]
      const risk = price * 0.02
      const out = {
        id: `p${i}`, instrument: NAMES[(i + 10) % 18], side: long ? 'long' : 'short', quantity, entryPrice: entry, ltp, pnl: (long ? ltp - entry : entry - ltp) * quantity * scale,
        strategy: ['Breakout', 'Carry', 'Mean reversion'][i % 3], account: 'Account A', lots: quantity / 25,
        path: Array.from({ length: 30 }, (_, k) => ({ t: T0 + k * 270000, price: entry + (ltp - entry) * (k / 29) + Math.sin(k / 3 + i) * risk * 0.1 })),
      }
      if (i !== 4 && !plain) {
        out.stop = Number((long ? entry - risk : entry + risk).toFixed(2))
        out.target = i === 6 ? undefined : Number((long ? entry + risk * 2 : entry - risk * 2).toFixed(2))
      }
      return out
    }),
  }
}

/**
 * About 400 days of daily P&L ending the day before TODAY: weekdays with a few holidays left out, runs of red,
 * two weekend special sessions and a day with two rows. `scale` multiplies every figure.
 */
export function pnlCalendar({ scale = 1, step = 0 } = {}) {
  const r = seeded(77)
  const days = []
  for (let i = 400; i >= 1; i--) {
    const date = shiftDay(TODAY, -i)
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
    const weekend = dow === 0 || dow === 6
    // Two Saturday special sessions; a holiday now and then.
    if (weekend && !(dow === 6 && i % 97 === 0)) continue
    if (!weekend && r() < 0.06) continue
    const cold = Math.sin(i / 17) < -0.35
    const pnl = Math.round(((r() - (cold ? 0.62 : 0.4)) * 9200 + (r() < 0.04 ? 14000 : 0)) * scale)
    days.push({ date, pnl })
    if (i === 30) days.push({ date, pnl: 450 * scale })
  }
  days.push({ date: TODAY, pnl: Math.round((1240 + step * 10) * scale) })
  return { days, asOf: FROZEN, live: true }
}

// ── Edge stats and capital funding ────────────────────────────────────────
// The magnitude is in a count and a name, so the S size, which shows neither of the scaled figures, still shows the data changing.
const magnitude = (scale) => Math.floor(Math.log10(Math.abs(scale) + 1) * 10)

export function edgeStatsData(scale = 1) {
  const m = magnitude(scale)
  return {
    stats: { trades: 40 + m, wins: 22, losses: 18, winRate: 0.55, profitFactor: 1.42, avgWin: 2400 * scale, avgLoss: -1700 * scale, expectancy: 560 * scale },
    scope: 'Last 30 days',
    distribution: ['−3k', '−2k', '−1k', '0', '1k', '2k', '3k'].map((label, i) => ({ label, count: 3 + ((i * 7 + m) % 11), sign: i < 3 ? -1 : 1 })),
    asOf: FROZEN,
    live: true,
  }
}

export function fundingData(scale = 1) {
  const m = magnitude(scale)
  return {
    accounts: [
      { id: 'a', name: `Broker A ${m}`, balance: 18640.4 * scale, allocations: [{ id: 'a1', name: 'Opening range', detail: 'NIFTY 50 · 5m', amount: 25000 * scale, live: true, pnl: 1240.5 * scale }, { id: 'a2', name: 'Mean reversion', amount: 25000 * scale, pnl: -310 * scale }] },
      { id: 'b', name: 'Broker B', balance: 452800.5 * scale, allocations: [{ id: 'b1', name: 'Trend follow', amount: 200000 * scale }, { id: 'b2', name: 'Gap fade', amount: 150000 * scale }] },
    ],
    asOf: FROZEN,
    live: true,
  }
}
