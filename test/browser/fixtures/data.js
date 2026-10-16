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
    case 'ts-table': {
      // The first column carries the data's magnitude too, so a narrow size that shows only it still shows the data changing.
      const t = table(scale)
      const mag = Math.floor(Math.log10(Math.abs(scale) + 1) * 10)
      t.rows.forEach((r, i) => { r.name = `${r.name} ${i}${mag}` })
      return t
    }
    case 'ts-today-pnl':
      return todayPnl(scale)
    case 'ts-equity-curve':
      return equityCurve(scale)
    case 'ts-session-clock':
      return { calendar, sessions: ['nse-fo', 'mcx'], timeframes: [5, 15] }
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
