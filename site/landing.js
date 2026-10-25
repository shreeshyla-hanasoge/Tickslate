// The landing page's two live boards, fed by one made-up feed. A fixed seed
// means every visit starts from the same figures, so the page reads the same
// to everyone and in screenshots; the ticks then wander from there.
import 'tickslate/elements'
import { createCalendar } from 'tickslate'

function seeded(seed) {
  // mulberry32: a few lines, and plenty for made-up figures.
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = seeded(20261025)
const jitter = (amp) => (rand() - 0.5) * 2 * amp
const round = (v, places = 2) => Math.round(v * 10 ** places) / 10 ** places

const MIN = 60000
const DAY = 86400000
const hero = document.getElementById('hero-grid')
const trading = document.getElementById('trading-grid')
const tile = (grid, id) => grid.querySelector(`[item="${id}"]`)

// ── The hero board ──────────────────────────────────────────────────────────

const start = Date.now()
const requests = Array.from({ length: 48 }, (_, i) => ({
  x: start - (47 - i) * 5 * MIN,
  y: Math.round(1180 + 260 * Math.sin(i / 7) + jitter(70)),
}))
const baseline = requests.map((p, i) => ({ x: p.x, y: Math.round(1150 + 140 * Math.sin((i + 3) / 9)) }))
let users = 18420
let errors = 0.0062
let spend = 31840
let signups = 304
const userTrend = [16900, 17150, 17020, 17480, 17710, 17630, 17990, 18240, 18110, 18420]
const errorTrend = [0.0091, 0.0084, 0.0088, 0.0079, 0.0073, 0.0075, 0.0069, 0.0066, 0.0064, 0.0062]

// Today's P&L over a made-up six-hour session that is always under way.
const sessionFrom = start - 4 * 3600000
const sessionTo = start + 2 * 3600000
const intraday = []
{
  let v = 0
  for (let t = sessionFrom; t < start; t += 5 * MIN) {
    v += jitter(140) + 22
    intraday.push({ t, v: round(v) })
  }
  intraday.push({ t: start, v: round(v + 40) })
}

function publishHero(asOf) {
  tile(hero, 'requests').data = {
    series: [
      { name: 'Requests', kind: 'area', points: requests },
      { name: 'Same time last week', points: baseline },
    ],
    asOf,
    live: true,
  }
  tile(hero, 'users').data = {
    value: users, previous: 17690, compareLabel: 'vs last Sunday', series: [...userTrend.slice(1), users], asOf, live: true,
  }
  tile(hero, 'errors').data = {
    value: errors, previous: 0.0081, format: 'percent', decimals: 2, goodWhen: 'down', compareLabel: 'vs last week',
    series: [...errorTrend.slice(1), errors], asOf, live: true,
  }
  tile(hero, 'budget').data = {
    value: spend, target: 40000, mode: 'limit', format: 'money', decimals: 0, caption: 'This month', asOf,
  }
  tile(hero, 'signups').data = {
    value: signups, previous: 287, compareLabel: 'vs yesterday', series: [212, 240, 251, 266, 270, 281, signups], asOf, live: true,
  }
  publishPnl(asOf)
  tile(hero, 'notes').data = { asOf }
}

function publishPnl(asOf) {
  const net = intraday[intraday.length - 1].v
  const fees = round(48 + Math.abs(net) * 0.01)
  const unrealized = round(net * 0.35)
  const data = {
    net, unrealized, fees,
    realized: round(net + fees - unrealized),
    closedCount: 7,
    openCount: 3,
    intraday,
    window: { from: sessionFrom, to: sessionTo },
    asOf,
    live: true,
  }
  tile(hero, 'pnl').data = data
  tile(trading, 'pnl').data = data
}

// ── The trading board ───────────────────────────────────────────────────────

// Two made-up exchanges in real zones, so the clock shows one open and one
// closed for most visitors most of the day.
const calendar = createCalendar({
  sessions: [
    { id: 'east', label: 'Harbor Exchange', timeZone: 'Asia/Singapore', days: [1, 2, 3, 4, 5], open: '09:00', close: '17:00' },
    { id: 'west', label: 'Prairie Exchange', timeZone: 'America/Chicago', days: [1, 2, 3, 4, 5], open: '08:30', close: '15:00' },
  ],
})
tile(trading, 'clock').data = { calendar, sessions: ['east', 'west'] }

// About four months of weekday results with a climb, a drawdown and a recovery.
const days = []
{
  const d = new Date(Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), new Date(start).getUTCDate()))
  while (days.length < 84) {
    d.setUTCDate(d.getUTCDate() - 1)
    if (d.getUTCDay() % 6 === 0) continue
    const i = 83 - days.length
    const drift = i < 34 ? 210 : i < 52 ? -330 : 260
    days.unshift({ date: d.toISOString().slice(0, 10), pnl: round(drift + jitter(900)), trades: 2 + Math.floor(rand() * 7) })
  }
}
tile(trading, 'equity').data = { days, fees: 1864.2, trades: days.reduce((s, x) => s + x.trades, 0) }
tile(trading, 'calendar').data = { days }

const instruments = [
  { id: 'w1', symbol: 'ORCA', exchange: 'Harbor', ltp: 184.32, prevClose: 181.9 },
  { id: 'w2', symbol: 'PINE 100', exchange: 'Prairie', ltp: 5216.4, prevClose: 5240.75 },
  { id: 'w3', symbol: 'KESTREL', exchange: 'Harbor', ltp: 42.18, prevClose: 41.66 },
  { id: 'w4', symbol: 'MOSS', exchange: 'Prairie', ltp: 96.05, prevClose: 97.4 },
  { id: 'w5', symbol: 'TERN', exchange: 'Harbor', ltp: 12.74, prevClose: 12.71 },
].map((i) => ({ ...i, dayLow: round(Math.min(i.ltp, i.prevClose) * 0.992), dayHigh: round(Math.max(i.ltp, i.prevClose) * 1.006) }))

const positions = [
  { id: 'p1', instrument: 'ORCA', side: 'long', quantity: 120, entryPrice: 179.4, ltp: 184.32, stop: 175, target: 192 },
  { id: 'p2', instrument: 'MOSS', side: 'short', quantity: 80, entryPrice: 95.2, ltp: 96.05, stop: 98.5, target: 89 },
  { id: 'p3', instrument: 'KESTREL', side: 'long', quantity: 400, entryPrice: 41.9, ltp: 42.18, stop: 40.8, target: 44.5 },
]
const pnlOf = (p) => round((p.ltp - p.entryPrice) * p.quantity * (p.side === 'long' ? 1 : -1))

function publishTrading(asOf) {
  tile(trading, 'watch').data = { instruments, asOf, live: true }
  tile(trading, 'positions').data = { positions: positions.map((p) => ({ ...p, pnl: pnlOf(p) })), asOf, live: true }
}

// ── The feed ────────────────────────────────────────────────────────────────

function tick() {
  const now = Date.now()
  requests.shift()
  baseline.shift()
  const last = requests[requests.length - 1]
  requests.push({ x: now, y: Math.max(200, Math.round(last.y + jitter(90))) })
  baseline.push({ x: now, y: Math.round(baseline[baseline.length - 1].y + jitter(25)) })
  users = Math.max(12000, Math.round(users + jitter(120) + 15))
  errors = Math.max(0.001, round(errors + jitter(0.0004), 4))
  if (rand() < 0.3) spend = Math.round(spend + rand() * 60)
  if (rand() < 0.25) signups += 1
  const v = intraday[intraday.length - 1].v
  intraday.push({ t: now, v: round(v + jitter(60) + 4) })
  for (const i of instruments) {
    i.ltp = round(Math.max(0.5, i.ltp * (1 + jitter(0.0012))))
    i.dayLow = Math.min(i.dayLow, i.ltp)
    i.dayHigh = Math.max(i.dayHigh, i.ltp)
  }
  for (const p of positions) p.ltp = instruments.find((i) => i.symbol === p.instrument).ltp
  publishHero(now)
  publishTrading(now)
}

publishHero(start)
publishTrading(start)

// The figures change every two seconds while the page is visible. A visitor can
// pause them (WCAG 2.2.2), and a hidden tab doesn't tick at all.
let paused = false
let timer = 0
const run = () => {
  clearInterval(timer)
  if (!paused && document.visibilityState === 'visible') timer = setInterval(tick, 2000)
}
run()
document.addEventListener('visibilitychange', run)

const pause = document.getElementById('pause')
pause.addEventListener('click', () => {
  paused = !paused
  pause.setAttribute('aria-pressed', String(paused))
  pause.textContent = paused ? 'Resume live data' : 'Pause live data'
  run()
})

// ── The demo controls ───────────────────────────────────────────────────────

const edit = document.getElementById('edit')
edit.addEventListener('click', () => { hero.editing = !hero.editing })
hero.addEventListener('ts-edit-change', (e) => { edit.textContent = e.detail.editing ? 'Done' : 'Edit layout' })

// The board starts from its markup every visit; Reset puts back the order and
// sizes it started with, and any tile removed while editing.
const initial = JSON.parse(JSON.stringify(hero.layout))
const statusEl = document.getElementById('demo-status')
document.getElementById('reset').addEventListener('click', () => {
  hero.editing = false
  hero.layout = initial
  statusEl.textContent = 'The board is back to how it started.'
})

const preset = document.getElementById('preset')
preset.addEventListener('change', () => {
  if (preset.value) hero.dataset.tsTheme = preset.value
  else delete hero.dataset.tsTheme
  statusEl.textContent = `Preset: ${preset.selectedOptions[0].textContent}.`
})
document.getElementById('try-preset').addEventListener('click', (e) => {
  e.preventDefault()
  document.getElementById('hero-title').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  preset.focus({ preventScroll: true })
})
