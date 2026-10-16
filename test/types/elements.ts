// The element classes, their data, and the typed `ts-action` event, under three module resolutions.
// An `@ts-expect-error` that stops erroring fails the run (TS2578).
import { TsMetric, TsGrid } from 'tickslate/elements'
import type { TsChartAction, TsEquityCurveAction, TsMetricAction, TsTableAction, TsCommonAction, MetricData } from 'tickslate/elements'
import { TsCard } from 'tickslate/elements/card'
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
  const reason: 'move' | 'resize' | 'remove' | 'add' | 'undo' = e.detail.reason
  void reason
})

// <ts-table>: typed columns, keyed rows, and sort and select actions.
const table = document.createElement('ts-table')
table.data = { columns: [{ key: 'pnl', label: 'P&L', format: 'money', tone: 'sign' }], rows: [{ id: 1, pnl: 3 }], sort: { key: 'pnl', dir: 'desc' } }
// @ts-expect-error `bold` is not a column option
table.data = { columns: [{ key: 'pnl', label: 'P&L', bold: true }], rows: [] }
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
