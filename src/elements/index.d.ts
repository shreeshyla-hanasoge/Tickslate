import type { Calendar, DayResult, Layout, LayoutItem, Numeric, SizeName, Time, WidgetCatalog } from '../core/index.js'
import { TsWidget } from './widget.js'
import type { ViewModelContext } from './widget.js'

export { version } from '../core/index.js'
// widget.d.ts is shipped beside this file (scripts/pack-lib.mjs), so this
// import resolves both in the repo and in the published package.
export { TsWidget } from './widget.js'
export type { ViewModelContext, WidgetState } from './widget.js'
// grid.d.ts is shipped beside this file too (scripts/pack-lib.mjs).
export * from './grid.js'
// controls.d.ts (the picker and the grid controls) ships beside this file too.
export * from './controls.js'
import type { TsGrid, LayoutAdapter } from './grid.js'

export interface PersistLayoutOptions {
  /** Each device is stored under `${key}:${device}`. Required unless `adapter` is given. */
  key?: string
  /** A Layout or item array serves both devices; in the object form `phone` falls back to `desktop`. */
  defaults?: Layout | LayoutItem[] | { desktop: Layout | LayoutItem[]; phone?: Layout | LayoutItem[] }
  /** Defaults to `localStorage` when it exists. Storage that throws is treated as empty. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  /** Remote or async storage. It wins over `storage` (giving both warns once in development) and names its own storage, so it needs no `key`. */
  adapter?: LayoutAdapter
}

/** Loads the grid's layout for its device, saves every `ts-layout-change`, and reloads when the device changes. */
export declare function persistLayout(
  grid: TsGrid,
  options: PersistLayoutOptions
): { reset(device?: 'desktop' | 'phone'): void; dispose(): void }

/**
 * Defines `tag` as `Ctor` (the registration rules of RFC 0002 §2.2) and records the
 * class's validated `static spec` in the widget catalog under `options.type`:
 * `{ tag, label, sizes, phoneRows?, description?, category? }`. The record is a snapshot
 * taken now; changing the static spec later does not change the catalog. Give your tag and
 * type a prefix of your own (`acme-mrr`).
 *
 * Calling it again is a no-op only for the same class object, tag and type. A module that is
 * evaluated twice (hot reload, two bundles, a dev server that re-imports it) makes a new class,
 * and that throws, so guard it: `if (!widgetCatalog()['acme-mrr']) defineWidget(...)`.
 *
 * Throws a `TypeError` for:
 * - a missing or empty `type`;
 * - a `type` that is a built-in key such as `'todayPnl'`;
 * - a class with a `catalogKey` (set, or inherited from a built-in such as `TsMetric`), because
 *   its elements would use the built-in's spec, not the one recorded;
 * - a `type` recorded by another class;
 * - a `tag` recorded under another type, or already defined by another class;
 * - a class already recorded under another type, or the same class and type under a second tag;
 * - a spec with no valid size.
 *
 * A failed call records and defines nothing, and notifies no one.
 */
export declare function defineWidget(tag: string, Ctor: typeof TsWidget, options: { type: string }): void

/** A frozen merge of the built-in `WIDGETS` and every `defineWidget` spec: the same object until the next registration. */
export declare function widgetCatalog(): WidgetCatalog

/**
 * `fn` runs after each registration with the new type, once the catalog holds it. Returns the function
 * that stops it. A listener that throws is logged with `console.error` and skipped: the others still
 * run and the registration stands.
 */
export declare function onCatalogChange(fn: (type: string) => void): () => void

/**
 * Stable for 0.x. A linear map from the domain [d0, d1] to the range [r0, r1]. A flat
 * domain (d0 equal to d1) maps every value to the middle of the range.
 */
export declare function scale(d0: number, d1: number, r0: number, r1: number): (v: number) => number

/**
 * Stable for 0.x. A line and the area under it as SVG path strings, in a `width` by `height`
 * box with y flipped (larger values higher). Points that are not finite are skipped. `zeroY`
 * is where value 0 falls, clamped to the plotted area, so a widget can colour above and below it.
 * `x` and `y` are the scales used, for placing marks on the same axes.
 */
export declare function linePaths(
  points: ReadonlyArray<{ x: number; y: number }>,
  options: {
    width: number
    height: number
    /** Keeps the stroke and end marks inside the box. Default 4. */
    pad?: number
    xDomain?: [number, number]
    yDomain?: [number, number]
    /** Stretch y to include 0. Default true. */
    includeZero?: boolean
    /** Default 2 × width; Infinity turns downsampling off. Not applied until the performance story (RFC 0003 §23). */
    maxPoints?: number
  }
): { line: string; area: string; zeroY: number; x: (v: number) => number; y: (v: number) => number }

/** Stable for 0.x. Escapes `& < > " '` in `String(s)`, for text a template writes into markup. */
export declare function escapeHtml(s: unknown): string

/** Freshness, allowed on every widget's data (RFC 0001 §8.1). */
export interface WidgetFreshness {
  /** When the data was taken: any Time, read with toTime (RFC 0002 §4.1). */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}

export interface CardData extends WidgetFreshness {}

/**
 * <ts-card>, every size. Slots: default (the body), value, actions, footer and empty.
 * Attributes: label, sizes (whitespace-separated, default all seven), live, as-of, scrollable.
 * `data` only updates the header; `data = null` never replaces slotted content.
 */
export declare class TsCard extends TsWidget<CardData> {
  static dataOptional: true
  /** From the sizes and label attributes. */
  get spec(): { label: string; sizes: SizeName[] }
}

export interface MetricData extends WidgetFreshness {
  value: Numeric
  /** Default 'number'. 'percent' takes a fraction (0.12 is 12%); 'duration' takes milliseconds. */
  format?: 'number' | 'money' | 'percent' | 'duration'
  decimals?: number
  /** Formatted with `fmt.unit`: '182 ms', '3 seats'. */
  unit?: string
  /** '1.2M' at every size. Without it, S still goes compact when the figure is too long. */
  compact?: boolean
  /** With format 'percent': value, previous, delta and target are 0 to 100. */
  percentPoints?: boolean
  previous?: Numeric
  /** The absolute change; wins over `previous`. */
  delta?: Numeric
  /** The change as a fraction (0.12 is 12%); always a fraction, whatever `percentPoints` says. */
  deltaPct?: Numeric
  /** Shown after the delta, e.g. 'vs last week'. */
  compareLabel?: string
  /** Which way is good, for the delta's colour. Default 'up'. */
  goodWhen?: 'up' | 'down' | 'neither'
  /** Wide and M: the sparkline. Plain numbers are spaced evenly. */
  series?: Array<{ t: Time; v: Numeric }> | Numeric[]
  /** M: the bar's goal; no bar when 0 or less. */
  target?: Numeric
  /** M: one line under the bar. */
  caption?: string
}

export interface MetricModel {
  label: string
  live: boolean
  time: string
  sparkLabel: string
  ariaLabel: string
  value: string
  delta: string
  arrow: '▲' | '▼' | ''
  tone: 'pos' | 'neg' | 'mut'
  compare: string
  line: string
  area: string
  targetPct: string
  targetWidth: number
  caption: string
  dropped: number
}

/** <ts-metric>, sizes S · Wide · M. */
export declare class TsMetric extends TsWidget<MetricData> {
  /** Pure: data to display strings, paths and the accessible name. */
  static metricModel(data: MetricData, variant: SizeName, ctx: ViewModelContext): MetricModel
}

export type ChartKind = 'line' | 'area'

export interface ChartSeries {
  id?: string
  name: string
  /** Default 'line'. */
  kind?: ChartKind
  /** Read in any order; x with `toTime` (or `toNumber` when `xType` is 'number'), y with `toNumber`. */
  points: Array<{ x: Time; y: Numeric }>
}

export interface ChartOptions extends WidgetFreshness {
  /** How x is read. Default 'time'. */
  xType?: 'time' | 'number'
  /** How each series' last value is shown. Default 'number'; 'percent' takes fractions, 'duration' milliseconds. */
  format?: 'number' | 'money' | 'percent' | 'duration'
  decimals?: number
  /** Formatted with `fmt.unit`: '182 ms'. */
  unit?: string
  /** Accepted for parity with `<ts-metric>`; no chart size shows a change yet. */
  goodWhen?: 'up' | 'down' | 'neither'
}

/** Either named series, or rows with the keys to read. At most four series are drawn. */
export type ChartData = ChartOptions &
  (
    | { series: ChartSeries[] }
    | {
        rows: Array<Record<string, unknown>>
        /** The row key for x. */
        x: string
        y: string | string[] | Array<{ key: string; name?: string; kind?: ChartKind }>
      }
  )

export interface ChartModel {
  /** What the svg's `aria-label` says: 'Revenue, last 12,400; Cost, last 8,100'. */
  ariaLabel: string
  series: Array<{ name: string; kind: ChartKind; line: string; area: string; last: string }>
  /** `index` 1 to 4 picks `--ts-series-<n>`. */
  legend: Array<{ name: string; index: number }>
  axis: { start: string; middle: string; end: string }
  /** Where the zero line falls in the 400 by 100 drawing box, drawn in `--ts-axis`. */
  zeroY: number
  /** Rows or points that couldn't be read. */
  dropped: number
}

/** <ts-chart>, sizes Wide · M · L · XL. Lines and areas, up to four series, legend from M up. */
export declare class TsChart extends TsWidget<ChartData> {
  /** Pure: data to paths, labels and the accessible name. */
  static chartModel(data: ChartData, variant: SizeName, ctx: ViewModelContext): ChartModel
}

export interface TodayPnlData extends WidgetFreshness {
  /** Shown exactly as given; the widget never recomputes it from the parts. */
  net: Numeric
  realized: Numeric
  unrealized: Numeric
  /** Shown as a deduction whichever way it is signed. */
  fees: Numeric
  closedCount?: number
  openCount?: number
  /** M: the curve. Readings need not arrive in order. */
  intraday?: Array<{ t: Time; v: Numeric }>
  /** M: dots on the curve; ones outside the readings are left out. */
  marks?: Array<{ t: Time; kind: 'entry' | 'exit'; label?: string }>
  /** M: the x-axis span, e.g. today's session from `calendar.hours()`. Defaults to the readings' span. */
  window?: { from: Time; to: Time }
}

/** <ts-today-pnl>, sizes S · Wide · M. */
export declare class TsTodayPnl extends TsWidget<TodayPnlData> {}

export type EquityRange = '1W' | '1M' | '3M' | 'YTD' | 'All'

export interface EquityCurveData extends WidgetFreshness {
  /** The daily P&L series; the widget accumulates it. */
  days: DayResult[]
  /** M, XL: for the whole series, so not shown for a range that cuts it. */
  fees?: Numeric
  /** XL: for the whole series, so not shown for a range that cuts it. Falls back to the sum of `days[].trades`. */
  trades?: number
}

/** <ts-equity-curve>, sizes Wide · M · XL. XL's range buttons fire `ts-action` with action 'range'. */
export declare class TsEquityCurve extends TsWidget<EquityCurveData> {
  /** Reflects the `range` attribute; an unknown value reads as 'All'. */
  range: EquityRange
}

export interface SessionClockData {
  calendar: Calendar
  /** Session ids, one lane each on Banner. S shows the first. */
  sessions: string[]
  /** Banner: candle-close ticks. Only the first two are drawn. */
  timeframes?: number[]
}

/** <ts-session-clock>, sizes S · Banner. Ticks by itself every second; set `clock` to freeze it. */
export declare class TsSessionClock extends TsWidget<SessionClockData> {}

declare global {
  interface HTMLElementTagNameMap {
    'ts-card': TsCard
    'ts-metric': TsMetric
    'ts-chart': TsChart
    'ts-today-pnl': TsTodayPnl
    'ts-equity-curve': TsEquityCurve
    'ts-session-clock': TsSessionClock
  }
}
