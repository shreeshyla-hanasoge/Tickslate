// The element classes, their data, and the typed `ts-action` event, under three module resolutions.
// An `@ts-expect-error` that stops erroring fails the run (TS2578).
import { TsMetric, TsGrid } from 'tickslate/elements'
import type { TsChartAction, TsEquityCurveAction, TsMetricAction, TsTableAction, TsWatchlistAction, TsOpenPositionsAction, TsCommonAction, MetricData } from 'tickslate/elements'
import { TsCard } from 'tickslate/elements/card'
import type { TsMiniChart, MiniChartData, MiniChartProfile } from 'tickslate/elements/mini-chart'
// @ts-expect-error the mini chart ships only at its own entry; the all-in entry never loads Emberwick
import type { TsMiniChart as NotHere } from 'tickslate/elements'
import type { TsChartSelectAction } from 'tickslate/elements/chart'
import type { TsOpenAction, TsMetricAction as MetricActionFromEntry } from 'tickslate/elements/metric'

// A tag name gives its class.
const metric = document.createElement('ts-metric')
export const metricIsClass: TsMetric = metric
export const cardIsClass: TsCard = document.createElement('ts-card')

// Data is typed per element.
metric.data = { value: 12, format: 'money' }
// @ts-expect-error `valu` is not a key of MetricData
metric.data = { valu: 12 }
export const data: MetricData = { value: 1, live: true }

// The action union of each element.
metric.addEventListener('ts-action', (e) => {
  const a: TsMetricAction = e.detail
  if (a.action === 'open') {
    const id: string = a.id
    void id
  }
  // @ts-expect-error a metric never sends 'range'
  if (a.action === 'range') void 0
})

const chart = document.createElement('ts-chart')
chart.addEventListener('ts-action', (e) => {
  const a: TsChartAction = e.detail
  if (a.action === 'select') {
    const index: number = a.index
    const picked: TsChartSelectAction = a
    void [index, picked]
  }
})

const curve = document.createElement('ts-equity-curve')
curve.addEventListener('ts-action', (e) => {
  if (e.detail.action === 'range') {
    const range: '1W' | '1M' | '3M' | 'YTD' | 'All' = e.detail.value
    void range
  }
})
export const rangeAction: TsEquityCurveAction = { action: 'range', value: '3M' }
// @ts-expect-error '5Y' is not a range
export const badRange: TsEquityCurveAction = { action: 'range', value: '5Y' }

export const common: TsCommonAction[] = [{ action: 'retry' }, { action: 'open', id: 'pnl' }]
export const open: TsOpenAction = { action: 'open', id: '' }
export const sameAction: MetricActionFromEntry = open

// The grid's own events keep their details.
const grid: TsGrid = document.createElement('ts-grid')
grid.addEventListener('ts-layout-change', (e) => {
  const reason: 'move' | 'resize' | 'remove' | 'add' | 'undo' | 'strip' = e.detail.reason
  void reason
})

// <ts-table>: typed columns, keyed rows, and sort and select actions.
const table = document.createElement('ts-table')
table.data = { columns: [{ key: 'pnl', label: 'P&L', format: 'money', tone: 'sign' }], rows: [{ id: 1, pnl: 3 }], sort: { key: 'pnl', dir: 'desc' } }
// @ts-expect-error `bold` is not a column option
table.data = { columns: [{ key: 'pnl', label: 'P&L', bold: true }], rows: [] }
// A column's width: 'content', 'fill', 'shared' (the default) or a number of CSS pixels.
table.data = { columns: [{ key: 'a', label: 'A', width: 'content' }, { key: 'b', label: 'B', width: 'fill' }, { key: 'c', label: 'C', width: 'shared' }, { key: 'd', label: 'D', width: 96 }], rows: [] }
// @ts-expect-error a width is a keyword or a number, not a CSS string
table.data = { columns: [{ key: 'a', label: 'A', width: '96px' }], rows: [] }
table.addEventListener('ts-action', (e) => {
  const a: TsTableAction = e.detail
  if (a.action === 'sort') {
    const dir: 'asc' | 'desc' = a.dir
    const key: string = a.value
    void [dir, key]
  }
  if (a.action === 'select') {
    const id: string | number = a.id
    void id
  }
})

// <ts-watchlist> and <ts-open-positions>: typed rows, and an action union each.
const watchlist = document.createElement('ts-watchlist')
watchlist.data = { instruments: [{ id: 'a', symbol: 'ALPHA 50', ltp: '24350.45', prevClose: 24300, dayLow: 24210, dayHigh: 24420, decimals: 2, ticks: [{ t: 1, price: 2 }] }] }
// @ts-expect-error `last` is not a key of an instrument
watchlist.data = { instruments: [{ id: 'a', ltp: 1, last: 2 }] }
watchlist.addEventListener('ts-action', (e) => {
  const a: TsWatchlistAction = e.detail
  // @ts-expect-error a watchlist never sends 'exit-all'
  if (a.action === 'exit-all') void 0
  if (a.action === 'add-instrument') void a
})

const positions = document.createElement('ts-open-positions')
positions.data = { positions: [{ id: 1, side: 'long', quantity: 50, entryPrice: 128, ltp: 133.4, pnl: 270, stop: 120, target: 140 }], mtm: 270, margin: 1000 }
// @ts-expect-error a side is long or short
positions.data = { positions: [{ id: 1, side: 'flat', quantity: 1, entryPrice: 1, ltp: 1, pnl: 0 }] }
positions.addEventListener('ts-action', (e) => {
  const a: TsOpenPositionsAction = e.detail
  if (a.action === 'exit-position') {
    const id: string | number = a.id
    void id
  }
  // @ts-expect-error a list of positions never sends 'sort'
  if (a.action === 'sort') void 0
})

// The mini chart (tickslate/elements/mini-chart): a host's own volume profile is typed without the optional peer installed.
const profile: MiniChartProfile = { version: 1, step: 0.5, sessions: [{ start: 1, end: 2, lo: 99, bins: [1, 4, 9] }] }
const mini = document.createElement('ts-mini-chart')
const miniClass: TsMiniChart = mini
const miniData: MiniChartData = { charts: [{ id: 'abc', instrument: 'ABC Corp', bars: [] }], volumeProfile: profile }
mini.data = miniData
// @ts-expect-error a profile is version 1
mini.data = { charts: [], volumeProfile: { ...profile, version: 2 } }
void miniClass
void (null as unknown as NotHere)

// <ts-breakdown>, <ts-status> and <ts-feed>: typed data, and the common action union only.
import type { TsBreakdownAction, TsStatusAction, TsFeedAction, StatusState } from 'tickslate/elements'

const breakdown = document.createElement('ts-breakdown')
breakdown.data = { slices: [{ id: 'eq', label: 'Equities', value: '41200.5', note: 'Large caps' }, { label: 'Bonds', value: 23800 }], format: 'money', decimals: 0 }
// @ts-expect-error `amount` is not a key of a slice
breakdown.data = { slices: [{ label: 'a', amount: 1 }] }
breakdown.addEventListener('ts-action', (e) => {
  const a: TsBreakdownAction = e.detail
  // @ts-expect-error nothing in a breakdown opts in to an action
  if (a.action === 'select') void 0
})

const status = document.createElement('ts-status')
const state: StatusState = 'degraded'
status.data = { rows: [{ id: 'api', name: 'Orders API', state, detail: 'Elevated latency', since: 1 }] }
// @ts-expect-error a state is ok, degraded, down or unknown
status.data = { rows: [{ id: 'api', name: 'Orders API', state: 'fine' }] }
status.addEventListener('ts-action', (e) => {
  const a: TsStatusAction = e.detail
  if (a.action === 'retry') void a
})

const feed = document.createElement('ts-feed')
feed.data = { items: [{ id: 1, text: 'Order filled', tag: 'Fill', tone: 'pos', time: 1, detail: '50 at 128.00' }], max: 20 }
// @ts-expect-error a tone is pos, neg or warn
feed.data = { items: [{ id: 1, text: 'x', tone: 'loud' }] }
feed.addEventListener('ts-action', (e) => {
  const a: TsFeedAction = e.detail
  if (a.action === 'open') void a
})

// defineWidget takes the widget's own English (RFC 0004 §10.2); a wrong value type is an error.
import { defineWidget, TsWidget } from 'tickslate/elements'
class TypedMrr extends TsWidget<{ n: number }, { ariaLabel?: string }> {}
defineWidget('acme-typed', TypedMrr, { type: 'acme-typed', messages: { 'widget.acme-typed.label': 'Typed', 'acme-typed.items.one': '{count} item' } })
defineWidget('acme-typed-bare', class extends TsWidget<{ n: number }, { ariaLabel?: string }> {}, { type: 'acme-typed-bare' })
// @ts-expect-error a message is a string
defineWidget('acme-typed-bad', class extends TsWidget<{ n: number }, { ariaLabel?: string }> {}, { type: 'acme-typed-bad', messages: { 'acme-typed-bad.n': 5 } })
