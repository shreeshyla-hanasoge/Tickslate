import type { Calendar, DayResult, Layout, LayoutItem, Numeric, SizeName, Time, WidgetCatalog } from '../core/index.js'
import { TsWidget } from './widget.js'
import type { ViewModelContext, TsOpenAction, TsChartSelectAction } from './widget.js'

export { version } from '../core/index.js'
// widget.d.ts is shipped beside this file (scripts/pack-lib.mjs), so this
// import resolves both in the repo and in the published package.
export { TsWidget } from './widget.js'
export type { ViewModelContext, WidgetState, TsOpenAction, TsChartSelectAction } from './widget.js'
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

/** The `ts-action` detail every widget can send: the error view's Retry and tile activation (RFC 0003 §7, §22.2). */
export type TsCommonAction = { action: 'retry' } | TsOpenAction

/**
 * What every widget inherits, for the manifest (scripts/gen-manifest.mjs): the attributes, parts and
 * slots of the TsWidget base. They are written here, in a block of their own, because widget.d.ts
 * describes the properties and this describes the markup a host sees. A tag's own `@element` block
 * adds to these and does not repeat them.
 *
 * @base TsWidget
 * @attr {'S' | 'Wide' | 'Tall' | 'M' | 'L' | 'XL' | 'Banner'} size - The size to draw, snapped to the sizes the widget supports.
 * @attr {string} label - The tile's heading and accessible name; defaults to the widget's catalog label.
 * @attr {string} locale - BCP 47 tag for number, date and plural formatting; defaults to the grid's, then configure()'s.
 * @attr {string} currency - ISO 4217 code for money; defaults to the grid's, then configure()'s.
 * @attr {string} time-zone - IANA zone for times and dates; defaults to the grid's, then configure()'s.
 * @attr {string} hour-cycle - 'h12', 'h23' or the locale's own ('auto'); defaults to the grid's, then configure()'s.
 * @attr {'loading' | 'error'} state - Shows the skeleton or the error view, even over existing data.
 * @attr {string} data - JSON (starting with { or [) used as the data until the `data` property is set.
 * @attr {string} heading-level - The aria-level of the label heading, 1 to 6. Default 3.
 * @attr {string} href - Makes the label a link to this URL: http, https, mailto, tel or relative.
 * @attr {boolean} activatable - Makes the label a button that fires `ts-action` with action 'open'.
 * @attr {string} stale-after - How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default 120000; falls back to the grid's.
 * @attr {'off'} flash - 'off' stops the brief tint on a headline figure that changed; the grid's `flash` applies too.
 * @attr {'on' | 'off'} scrub - 'off' turns off scrubbing on a chart: hover, touch drag and the keyboard slider. The widget's own, then the grid's, then on. Only the charts act on it.
 * @attr {string} item - The id the grid matches this tile to, and the `id` of an 'open' action.
 * @csspart tile - The tile: a role="group" box named by the widget's result.
 * @csspart header - The row holding the live dot, the label and the meta.
 * @csspart label - The heading text.
 * @csspart link - The label's link or button when `href` or `activatable` is set.
 * @csspart skeleton - The loading view.
 * @csspart empty - The empty view, shown for `data = null`.
 * @csspart error - The error view and its Retry button.
 * @slot empty - Replaces the empty view's text.
 */

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
 *
 * @element ts-card
 * @attr {string} sizes - Whitespace-separated sizes the card may snap to. Default all seven.
 * @attr {boolean} live - Shows the live dot.
 * @attr {string} as-of - When the content was taken: a time, shown as "synced 11:42".
 * @attr {boolean} scrollable - Lets the body scroll instead of clipping.
 * @fires {CustomEvent<TsCardAction>} ts-action - The error view's Retry, and 'open' when `activatable`.
 * @csspart body - The box around the default slot.
 * @csspart value - The slot for a headline figure.
 * @slot - The card's body.
 * @slot value - A headline figure above the body.
 * @slot actions - Controls in the header, right of the meta.
 * @slot footer - Content below the body.
 */
export declare class TsCard extends TsWidget<CardData> {
  addEventListener(type: 'ts-action', listener: (this: TsCard, ev: CustomEvent<TsCardAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsCard, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  static dataOptional: true
  /** From the sizes and label attributes. */
  readonly spec: { label: string; sizes: SizeName[] }
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

/**
 * <ts-metric>, sizes S · Wide · M.
 *
 * @element ts-metric
 * @fires {CustomEvent<TsMetricAction>} ts-action - The error view's Retry, and 'open' when `activatable`.
 * @csspart value - The headline figure.
 * @csspart chart - The sparkline's box.
 */
export declare class TsMetric extends TsWidget<MetricData> {
  addEventListener(type: 'ts-action', listener: (this: TsMetric, ev: CustomEvent<TsMetricAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsMetric, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  /** Pure: data to display strings, paths and the accessible name. */
  static metricModel(data: MetricData, variant: SizeName, ctx: ViewModelContext): MetricModel
}

export type ChartKind = 'line' | 'area' | 'bar'

export interface ChartSeries {
  id?: string
  name: string
  /** Default 'line'. */
  kind?: ChartKind
  /** Read in any order; x with `toTime` (or `toNumber` when `xType` is 'number', or as text when it is 'category'), y with `toNumber`. */
  points: Array<{ x: Time; y: Numeric }>
}

export interface ChartOptions extends WidgetFreshness {
  /** How x is read. 'category' places points and bars on a band scale, in order of first appearance. Default 'time'. */
  xType?: 'time' | 'number' | 'category'
  /** How each series' last value is shown. Default 'number'; 'percent' takes fractions, 'duration' milliseconds. */
  format?: 'number' | 'money' | 'percent' | 'duration'
  decimals?: number
  /** Formatted with `fmt.unit`: '182 ms'. */
  unit?: string
  /** Accepted for parity with `<ts-metric>`; no chart size shows a change yet. */
  goodWhen?: 'up' | 'down' | 'neither'
}

/** Either named series, or rows with the keys to read. At most six series are drawn. */
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
  series: Array<{ name: string; kind: ChartKind; line: string; area: string; bars: string; last: string }>
  /** `index` 1 to 6 picks `--ts-series-<n>`. */
  legend: Array<{ name: string; index: number }>
  axis: { start: string; middle: string; end: string }
  /** Every category in order of first appearance; `[]` unless `xType` is 'category'. */
  categories: string[]
  /** Where the zero line falls in the 400 by 100 drawing box, drawn in `--ts-axis`. */
  zeroY: number
  /** Rows or points that couldn't be read. */
  dropped: number
}

/**
 * <ts-chart>, sizes Wide · M · L · XL. Lines, areas and bars, up to six series, legend from M up.
 *
 * @element ts-chart
 * @fires {CustomEvent<TsChartAction>} ts-action - Retry, 'open', and 'select' for a point when `actions` includes 'select'.
 * @csspart chart - The drawing box.
 * @csspart scrub - The overlay laid over the plot while a point is read; hidden otherwise.
 * @csspart scrub-rule - The vertical rule at the point.
 * @csspart scrub-dot - A dot on the point, in its series' colour.
 * @csspart scrub-readout - The label naming the point and its values.
 */
export declare class TsChart extends TsWidget<ChartData> {
  addEventListener(type: 'ts-action', listener: (this: TsChart, ev: CustomEvent<TsChartAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsChart, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  /** Pure: data to paths, labels and the accessible name. */
  static chartModel(data: ChartData, variant: SizeName, ctx: ViewModelContext): ChartModel
}

export interface TableColumn {
  key: string
  label: string
  /** Default 'text', shown as given. 'percent' takes fractions, 'duration' milliseconds, 'time' and 'date' any Time. */
  format?: 'text' | 'number' | 'money' | 'percent' | 'duration' | 'time' | 'date'
  decimals?: number
  /** Default 'end' for number, money, percent and duration, else 'start'. */
  align?: 'start' | 'end' | 'center'
  /** '+' or '−' with the pos or neg colour and an arrow. */
  tone?: 'sign'
  /** Lower stays longer when columns must hide. Default: the column's position. */
  priority?: number
  /** Default true. */
  sortable?: boolean
}

export interface TableData extends WidgetFreshness {
  columns: TableColumn[]
  /** Matched by `id`, so a live update changes cells in place. A row with no id, or a repeated one, is dropped. */
  rows: Array<{ id: string | number; [key: string]: unknown }>
  /** The order to show. The user's own choice (a header press) replaces it until a different one is set. */
  sort?: { key: string; dir: 'asc' | 'desc' }
}

export interface TableModel {
  /** 'Open orders, 12 rows, sorted by Price, descending'. */
  ariaLabel: string
  /** Only the columns the column budget kept, in data order. */
  columns: Array<{
    key: string
    label: string
    align: 'start' | 'end' | 'center'
    sortable: boolean
    /** The header's aria-sort. */
    sort: 'ascending' | 'descending' | 'none'
    /** Whether the column's format is a number, which gets the figure typeface. */
    numeric: boolean
  }>
  /** Sorted; one entry per readable row. */
  rows: Array<{
    id: string | number
    cells: Array<{
      /** Formatted; '' for a missing value. */
      text: string
      /** 'mut' unless the column has tone 'sign' and the value is not zero. */
      tone: 'pos' | 'neg' | 'mut'
      /** '' unless tone is 'sign' and the text carries a sign. aria-hidden in the template. */
      arrow: '▲' | '▼' | ''
    }>
  }>
  /** The sort in effect, or null when there is none or its column cannot be sorted. */
  sort: { key: string; dir: 'asc' | 'desc' } | null
  /** Columns dropped by the column budget (0 without a width). */
  hidden: number
  /** Rows that could not be read: no id, a repeated id, or not an object. */
  dropped: number
}

/**
 * <ts-table>, sizes Tall · M · L · XL. Typed columns, a header that sorts, and cells that change in place.
 *
 * @element ts-table
 * @fires {CustomEvent<TsTableAction>} ts-action - Retry, 'open', 'sort' when a sortable header is pressed, and 'select' for a row when `actions` includes 'select'.
 * @csspart table - The table.
 * @csspart row - A body row.
 * @csspart cell - A body cell.
 */
export declare class TsTable extends TsWidget<TableData> {
  addEventListener(type: 'ts-action', listener: (this: TsTable, ev: CustomEvent<TsTableAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsTable, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  /** Pure: formatted cells, a stable sort and the column budget. `o.width` is the content width in px; without it every column is kept. */
  static tableModel(data: TableData, variant: SizeName, ctx: ViewModelContext, o?: { width?: number }): TableModel
}

export interface ProgressData extends WidgetFreshness {
  /** What has been reached or used so far. */
  value: Numeric
  /** The goal or the limit. Missing, non-numeric or 0 or less shows a dash and no bar. */
  target: Numeric
  /** 'goal' turns green at 100%; 'limit' turns to warning at `warnAt` and to danger at 100%. Default 'goal'. */
  mode?: 'goal' | 'limit'
  /** A fraction in (0, 1], limit mode only. Default 0.75. */
  warnAt?: number
  /** Default 'number'. 'percent' takes fractions; 'duration' takes milliseconds. */
  format?: 'number' | 'money' | 'percent' | 'duration'
  decimals?: number
  /** Formatted with fmt.unit: '182 ms'. */
  unit?: string
  /** Wide: one line under the bar. */
  caption?: string
}

export interface ProgressModel {
  /** 'Daily loss limit, 6,400 of 10,000, 64%, near limit' */
  ariaLabel: string
  /** '6,400 of 10,000 · 64%' */
  text: string
  /** '64%', or '—' */
  pct: string
  /** 0..1, 0 without a valid target. */
  fill: number
  state: 'ok' | 'near' | 'over' | 'done' | 'none'
  caption: string
  label: string
  live: boolean
  time: string
  /** The "synced" prefix and suffix of the header. */
  synced: { pre: string; post: string }
  /** The value as a number, NaN without one. */
  valueNum: number
  /** 0 to 100, the meter's aria-valuenow. */
  pctNum: number
  /** The state in words: 'near limit', 'over limit', 'goal reached', or ''. */
  stateText: string
  /** The meter's aria-valuetext: the result and the state in words. */
  valueText: string
}

/**
 * <ts-progress>, sizes S · Wide. A goal and limit gauge.
 *
 * @element ts-progress
 * @fires {CustomEvent<TsProgressAction>} ts-action - The error view's Retry, and 'open' when `activatable`.
 * @csspart value - The percentage.
 * @csspart bar - The track of the gauge.
 */
export declare class TsProgress extends TsWidget<ProgressData> {
  addEventListener(type: 'ts-action', listener: (this: TsProgress, ev: CustomEvent<TsProgressAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsProgress, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  /** Pure: percentage, state, text and the accessible name. */
  static progressModel(data: ProgressData, variant: SizeName, ctx: ViewModelContext): ProgressModel
}

/** One instrument of a watchlist. Prices, times and the change are read as Numeric and Time. */
export interface WatchlistInstrument {
  /** Matched by `id`, so a live update changes cells in place. An instrument with no id, or a repeated one, is dropped. */
  id: string | number
  /** Shown as given: 'NIFTY 50'. Without one the id is shown. */
  symbol?: string
  exchange?: string
  /** The last price. A price that cannot be read shows as a dash. */
  ltp: Numeric
  /** The change and the change % are worked out from it, unless they are given. */
  prevClose?: Numeric
  change?: Numeric
  /** A fraction: 0.027 is +2.70%. */
  changePct?: Numeric
  /** Both draw the day-range bar; with only one there is no bar. */
  dayLow?: Numeric
  dayHigh?: Numeric
  /** The instrument's tick precision, 0 to 20. Applies to the price, the change and the range. Default 2. */
  decimals?: number
  /** M: the sparkline. Readings need not arrive in order; at least two are needed. */
  ticks?: Array<{ t: Time; price: Numeric }>
}

export interface WatchlistData extends WidgetFreshness {
  instruments: WatchlistInstrument[]
}

export interface WatchlistModel {
  /** 'Watchlist, 12 instruments'; at S with more than one, 'Watchlist, 12 instruments, showing the first'. */
  ariaLabel: string
  /** One entry per instrument shown: all of them, or the first at S. */
  rows: Array<{
    id: string | number
    symbol: string
    exchange: string
    /** '24,350.45', or a dash. */
    last: string
    /** Signed: '+24.10' or '−12.50'. '' when there is no change to show. */
    change: string
    /** Signed: '+0.10%'. '' when there is none. */
    pct: string
    /** '' unless the change text carries a sign. aria-hidden in the template. */
    arrow: '▲' | '▼' | ''
    tone: 'pos' | 'neg' | 'mut'
    /** null without both a low and a high. `now` is 0 to 100 along the bar, null when the price cannot be placed. */
    bar: { now: number | null; label: string } | null
    /** M only, with at least two readable ticks. */
    spark: { line: string; label: string; tone: 'pos' | 'neg' | 'mut' } | null
  }>
  /** Instruments that can be read, shown or not. */
  total: number
  /** Instruments that could not be read: no id, a repeated id, or not an object. */
  dropped: number
  live: boolean
  time: string
}

/**
 * <ts-watchlist>, sizes S · Tall · M. The instruments you follow, with the last price, the signed change and the day range; S shows the first.
 *
 * @element ts-watchlist
 * @fires {CustomEvent<TsWatchlistAction>} ts-action - Retry, 'open', and 'add-instrument' when `actions` includes it.
 * @csspart table - The table.
 * @csspart row - The body of one instrument: its row and its range bar.
 * @csspart cell - A cell of an instrument's row.
 * @csspart bar - A day-range bar.
 * @csspart chart - A sparkline.
 */
export declare class TsWatchlist extends TsWidget<WatchlistData> {
  addEventListener(type: 'ts-action', listener: (this: TsWatchlist, ev: CustomEvent<TsWatchlistAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsWatchlist, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  /** Pure: formatted prices, signed changes, bar marks and the accessible name. */
  static watchlistModel(data: WatchlistData, variant: SizeName, ctx: ViewModelContext): WatchlistModel
}

/** One open position. Prices and times are read as Numeric and Time. */
export interface OpenPosition {
  /** Matched by `id`, so a live update changes cells in place. A position with no id, or a repeated one, is dropped. */
  id: string | number
  /** 'NIFTY 24500 CE'. Without one the id is shown. */
  instrument?: string
  /** Shown in the row's hover text. */
  strategy?: string
  account?: string
  side: 'long' | 'short'
  quantity: Numeric
  /** Shown in the row's hover text. */
  lots?: Numeric
  entryPrice: Numeric
  ltp: Numeric
  /** Shown signed, in the money format. */
  pnl: Numeric
  /** Both a stop and a target draw the range bar, whatever the side; with only one there is no bar. */
  stop?: Numeric
  target?: Numeric
  /** True while the host has an exit for this position in flight: its Exit button stays, is marked `aria-disabled` and fires nothing. */
  pending?: boolean
  /** Accepted; not drawn yet. */
  openedAt?: Time
  /** L: the price since entry, as a sparkline. Readings need not arrive in order; at least two are needed. */
  path?: Array<{ t: Time; price: Numeric }>
}

export interface OpenPositionsData extends WidgetFreshness {
  positions: OpenPosition[]
  /** Defaults to the sum of the positions' `pnl`. */
  mtm?: Numeric
  /** L: shown in the summary line. */
  margin?: Numeric
}

export interface OpenPositionsModel {
  /** 'Open positions, 3 positions'. */
  ariaLabel: string
  rows: Array<{
    id: string | number
    name: string
    /** The strategy, the account and the lots, joined: the row's hover text. */
    title: string
    side: 'long' | 'short' | ''
    sideText: string
    /** The Exit button's name: 'Exit ETA 24500 CE, Long 50'. */
    exitLabel: string
    /** The row's `pending`. */
    pending: boolean
    /** '50 @ 128.00'; just the quantity without an entry price; '' without either. */
    detail: string
    last: string
    /** Signed money: '+₹1,240.25' or '−₹310.00'. */
    pnl: string
    arrow: '▲' | '▼' | ''
    tone: 'pos' | 'neg' | 'mut'
    /**
     * null without both a stop and a target. `entry` and `now` are 0 to 100 along the bar from the stop to the target,
     * null when there is no entry price or no last price. `label` is the text alternative.
     */
    bar: { entry: number | null; now: number | null; label: string } | null
    /** L only, with at least two readable points. */
    spark: { line: string; label: string; tone: 'pos' | 'neg' | 'mut' } | null
  }>
  /** The given `mtm`, else the sum of the positions' `pnl`; null when neither can be read. */
  mtm: { value: number; text: string; arrow: '▲' | '▼' | ''; tone: 'pos' | 'neg' | 'mut' } | null
  /** L only; '' otherwise. */
  margin: string
  /** Positions that could not be read: no id, a repeated id, or not an object. */
  dropped: number
  live: boolean
  time: string
}

/**
 * <ts-open-positions>, sizes Wide · M · L. The open positions with their signed profit or loss; M and L add the bar from stop to target.
 *
 * @element ts-open-positions
 * @fires {CustomEvent<TsOpenPositionsAction>} ts-action - Retry, 'open', and 'exit-position' and 'exit-all' when `actions` includes them.
 * @csspart table - The table.
 * @csspart row - The body of one position: its row and its range bar.
 * @csspart cell - A cell of a position's row.
 * @csspart bar - A range bar.
 * @csspart chart - A sparkline.
 */
export declare class TsOpenPositions extends TsWidget<OpenPositionsData> {
  addEventListener(type: 'ts-action', listener: (this: TsOpenPositions, ev: CustomEvent<TsOpenPositionsAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsOpenPositions, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  /** Pure: formatted prices, signed profit and loss, bar marks and the accessible name. */
  static positionsModel(data: OpenPositionsData, variant: SizeName, ctx: ViewModelContext): OpenPositionsModel
}

export interface PnlCalendarData extends WidgetFreshness {
  /** The same series as the equity curve; rows with the same date are summed. */
  days: DayResult[]
  /** Later days are drawn as upcoming. Default: the clock's day. */
  today?: Time
}

export interface PnlCalendarCell {
  /** 'YYYY-MM-DD'. */
  date: string
  /** pos and neg are a gain and a loss, flat a day that nets to nothing, none a day with no entry, up a day yet to come. */
  kind: 'pos' | 'neg' | 'flat' | 'none' | 'up'
  /** The day's net; null for a day with no entry or one yet to come. */
  pnl: number | null
  /** 0.22 + 0.78 x |pnl| / max|pnl| over the cells drawn; null for a flat, empty or upcoming day. */
  strength: number | null
  /** The accessible name: the date and the signed value. */
  name: string
}

export interface CalendarModel {
  variant: SizeName
  /** True when a Banner is folded into two half-year bands. */
  phone: boolean
  /** One band, or two on a phone's Banner. Each holds week columns, oldest first. */
  bands: Array<{ weeks: Array<{ month: string; cells: PnlCalendarCell[] }> }>
  /** The weekday names down the side, one per row of cells. */
  rowLabels: string[]
  rows: number
  dropped: number
  live: boolean
  empty: boolean
  label: string
  net: string
  netNum: number
  best: string
  worst: string
  rate: string
  tradingDays: number
  /** Weekend entries in the window, which have no cell and are left out of the figures. */
  weekendEntries: number
  /** "3 weekend entries not shown", or '' when none were left out. */
  note: string
  /** The summary the grid is named by. */
  chartLabel: string
  /** The date of the cell that starts as the tab stop. */
  focusDate: string
  ariaLabel: string
}

/**
 * <ts-pnl-calendar>, sizes Tall · M · Banner. A heat map of daily profit and loss: Tall shows 6 weeks, M 13 and Banner a year, which folds into two half-year bands on a phone.
 *
 * @element ts-pnl-calendar
 * @fires {CustomEvent<TsPnlCalendarAction>} ts-action - Retry and 'open'.
 */
export declare class TsPnlCalendar extends TsWidget<PnlCalendarData> {
  addEventListener(type: 'ts-action', listener: (this: TsPnlCalendar, ev: CustomEvent<TsPnlCalendarAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsPnlCalendar, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  /** Pure: the week columns, each cell's name, kind and strength, the totals and the summary. `ctx.phone` folds a Banner into two bands. */
  static calendarModel(data: PnlCalendarData, variant: SizeName, ctx: ViewModelContext & { phone?: boolean }): CalendarModel
}

import type { EdgeStats, FundingAccount } from '../core/index.js'

/** The stat <ts-edge-stats> shows at S, chosen by its `stat` attribute. */
export type EdgeStatName = 'win-rate' | 'profit-factor' | 'avg-win-loss' | 'expectancy'

export interface EdgeStatsData extends WidgetFreshness {
  /** What `edgeStats(trades)` returns, or the host's own figures. A figure that is missing or null shows as a dash; a profit factor of Infinity shows as ∞. */
  stats: EdgeStats
  /** Shown after the trade count, as '60 trades · Last 30 days'. */
  scope?: string
  /** M: the histogram. A bucket with `sign: -1` is drawn hatched, on the loss side. `histogram()` can count the buckets. */
  distribution?: Array<{ label: string; count: number; sign: 1 | -1 }>
}

/** One formatted figure of the edge stats. */
export interface EdgeStatFigure {
  /** What is shown, possibly compact to fit a narrow cell. */
  text: string
  /** The full form, which the accessible name uses. */
  full: string
  /** '' unless the text carries a sign. aria-hidden in the template. */
  arrow: '▲' | '▼' | ''
  tone: 'pos' | 'neg' | 'mut'
  /** The number behind it, NaN when there is none. */
  num: number
}

export interface EdgeStatsModel {
  /** 'Edge stats, Win rate 62.5%, 60 trades'. */
  ariaLabel: string
  label: string
  /** One cell at S (the chosen stat), four at Wide and M. */
  cells: Array<{ key: EdgeStatName; label: string; main: EdgeStatFigure; sub: EdgeStatFigure | null; spoken: string }>
  /** '60 trades · Last 30 days'. */
  meta: string
  /** M only. Heights are 0 to 100, from the largest count. */
  dist: { bars: Array<{ id: number; label: string; loss: boolean; zero: boolean; h: number; title: string }>; ariaLabel: string }
  distLabel: string
  live: boolean
  time: string
}

/**
 * <ts-edge-stats>, sizes S · Wide · M. Win rate, profit factor, average win and loss and expectancy; S shows the one `stat` names, M adds the histogram.
 *
 * @element ts-edge-stats
 * @attr {'win-rate' | 'profit-factor' | 'avg-win-loss' | 'expectancy'} stat - The stat S shows. Reflects `stat`; an unknown value reads as 'win-rate'.
 * @fires {CustomEvent<TsEdgeStatsAction>} ts-action - The error view's Retry, and 'open' when `activatable`.
 * @csspart value - The figure S shows.
 * @csspart chart - The histogram's box.
 */
export declare class TsEdgeStats extends TsWidget<EdgeStatsData> {
  addEventListener(type: 'ts-action', listener: (this: TsEdgeStats, ev: CustomEvent<TsEdgeStatsAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsEdgeStats, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  /** The stat S shows. */
  stat: EdgeStatName
  /** Pure: formatted figures with their signs and arrows, the histogram's bar heights and the accessible name. */
  static edgeStatsModel(data: EdgeStatsData, variant: SizeName, ctx: ViewModelContext & { stat?: string }): EdgeStatsModel
}

export interface CapitalFundingData extends WidgetFreshness {
  /** Matched by `id`, so a live update changes cells in place. An account with no id, or a repeated one, is dropped, and so is an allocation. */
  accounts: FundingAccount[]
}

/** One allocation as the widget shows it. */
export interface CapitalFundingAllocationModel {
  id: string
  name: string
  detail: string
  live: boolean
  amount: string
  /** 'short ₹6,359.60', or '' when it is fully funded. */
  short: string
  /** The funded share of its amount, 0 to 100, and whether any of it is short. null for an allocation of nothing. */
  bar: { funded: number; short: boolean; label: string } | null
  /** Signed, '' without a pnl. */
  pnl: string
  arrow: '▲' | '▼' | ''
  tone: 'pos' | 'neg' | 'mut'
}

export interface CapitalFundingModel {
  /** 'Capital funding, 3 accounts'; at S the first account's summary follows, and 'showing the first' with more than one. */
  ariaLabel: string
  rows: Array<{
    id: string
    name: string
    balance: string
    allocated: string
    free: string
    /** '37%', or '' with nothing allocated. */
    share: string
    shareNum: number | null
    /** 'short ₹31,359.60', or ''. */
    short: string
    /** The short text, else 'Fully funded', else 'Nothing allocated'. */
    status: string
    hasShort: boolean
    bar: { funded: number; short: boolean; label: string } | null
    summary: string
    /** The Rebalance button's accessible name. */
    rebalance: string
    allocations: CapitalFundingAllocationModel[]
  }>
  /** Accounts that can be read, shown or not. */
  total: number
  /** Accounts that could not be read: no id, a repeated id, or not an object. */
  dropped: number
  live: boolean
  time: string
}

/**
 * <ts-capital-funding>, sizes S · Tall · L. Each account's balance against its allocations, with shortfalls hatched and written as 'short <amount>'; S shows the first account.
 *
 * @element ts-capital-funding
 * @fires {CustomEvent<TsCapitalFundingAction>} ts-action - Retry, 'open', and 'rebalance' when `actions` includes it.
 * @csspart row - One account.
 * @csspart allocation - One allocation of an account.
 * @csspart bar - A funding bar.
 * @csspart value - The share S shows.
 */
export declare class TsCapitalFunding extends TsWidget<CapitalFundingData> {
  addEventListener(type: 'ts-action', listener: (this: TsCapitalFunding, ev: CustomEvent<TsCapitalFundingAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsCapitalFunding, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  /** Pure: formatted amounts, bar widths, shortfall text and the accessible name. */
  static fundingModel(data: CapitalFundingData, variant: SizeName, ctx: ViewModelContext): CapitalFundingModel
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

/**
 * <ts-today-pnl>, sizes S · Wide · M.
 *
 * @element ts-today-pnl
 * @fires {CustomEvent<TsTodayPnlAction>} ts-action - The error view's Retry, and 'open' when `activatable`.
 * @csspart chart - The intraday curve's box.
 * @csspart scrub - The overlay laid over the plot while a point is read; hidden otherwise.
 * @csspart scrub-rule - The vertical rule at the point.
 * @csspart scrub-dot - A dot on the point, in its series' colour.
 * @csspart scrub-readout - The label naming the point and its values.
 */
export declare class TsTodayPnl extends TsWidget<TodayPnlData> {
  addEventListener(type: 'ts-action', listener: (this: TsTodayPnl, ev: CustomEvent<TsTodayPnlAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsTodayPnl, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
}

export type EquityRange = '1W' | '1M' | '3M' | 'YTD' | 'All'

export interface EquityCurveData extends WidgetFreshness {
  /** The daily P&L series; the widget accumulates it. */
  days: DayResult[]
  /** M, XL: for the whole series, so not shown for a range that cuts it. */
  fees?: Numeric
  /** XL: for the whole series, so not shown for a range that cuts it. Falls back to the sum of `days[].trades`. */
  trades?: number
}

/**
 * <ts-equity-curve>, sizes Wide · M · XL. XL's range buttons fire `ts-action` with action 'range'.
 *
 * @element ts-equity-curve
 * @attr {'1W' | '1M' | '3M' | 'YTD' | 'All'} range - The range shown. Reflects `range`; an unknown value reads as 'All'.
 * @fires {CustomEvent<TsEquityCurveAction>} ts-action - Retry, 'open', and 'range' when a range button is pressed.
 * @csspart chart - The curve's box.
 * @csspart scrub - The overlay laid over the plot while a point is read; hidden otherwise.
 * @csspart scrub-rule - The vertical rule at the point.
 * @csspart scrub-dot - A dot on the point, in its series' colour.
 * @csspart scrub-readout - The label naming the point and its values.
 */
export declare class TsEquityCurve extends TsWidget<EquityCurveData> {
  addEventListener(type: 'ts-action', listener: (this: TsEquityCurve, ev: CustomEvent<TsEquityCurveAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsEquityCurve, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
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

/**
 * <ts-session-clock>, sizes S · Banner. Ticks by itself every second; set `clock` to freeze it.
 *
 * @element ts-session-clock
 * @fires {CustomEvent<TsSessionClockAction>} ts-action - The error view's Retry, and 'open' when `activatable`.
 * @csspart value - The clock reading.
 */
export declare class TsSessionClock extends TsWidget<SessionClockData> {
  addEventListener(type: 'ts-action', listener: (this: TsSessionClock, ev: CustomEvent<TsSessionClockAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsSessionClock, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
}

export type TsCardAction = TsCommonAction
export type TsMetricAction = TsCommonAction
export type TsProgressAction = TsCommonAction
/** 'select' only fires when the host opts in with `actions = ['select']` (RFC 0003 §7.1). */
export type TsChartAction = TsCommonAction | TsChartSelectAction
/** 'select' only fires when the host opts in with `actions = ['select']` (RFC 0003 §7.1, Decision 36). */
export type TsTableAction = TsCommonAction | { action: 'sort'; value: string; dir: 'asc' | 'desc' } | { action: 'select'; id: string | number }
/** 'add-instrument' only fires when the host opts in with `actions = ['add-instrument']` (RFC 0003 §21.3). */
export type TsWatchlistAction = TsCommonAction | { action: 'add-instrument' }
/** 'exit-position' and 'exit-all' only fire when the host opts in with `actions` (RFC 0003 §21.3). */
export type TsOpenPositionsAction = TsCommonAction | { action: 'exit-position'; id: string | number } | { action: 'exit-all' }
export type TsPnlCalendarAction = TsCommonAction
export type TsEdgeStatsAction = TsCommonAction
/** 'rebalance' only fires when the host opts in with `actions = ['rebalance']`; `id` is the account's id (RFC 0003 §21.2). */
export type TsCapitalFundingAction = TsCommonAction | { action: 'rebalance'; id: string }
export type TsTodayPnlAction = TsCommonAction
export type TsEquityCurveAction = TsCommonAction | { action: 'range'; value: EquityRange }
export type TsSessionClockAction = TsCommonAction

/**
 * The markup of <ts-grid>, for the manifest. Its class, with the prose above its members, is in
 * grid.d.ts, which this story does not own; the generator finds the class from
 * `HTMLElementTagNameMap` and reads the tags from here.
 *
 * @element ts-grid
 * @attr {boolean} editing - Edit mode. Reflected by `editing`.
 * @attr {string} profile - The profile shown. Default 'market'.
 * @attr {boolean} locked - A read-only dashboard: no edit mode, no edit controls.
 * @attr {'off'} edit-controls - 'off' hides the built-in edit button and pill, for hosts with their own.
 * @attr {'off'} undo-toast - 'off' suppresses the undo toast after a remove.
 * @attr {string} stale-after - The `stale-after` its tiles use unless they set their own.
 * @attr {'off'} flash - 'off' stops every tile's change flash.
 * @attr {'on' | 'off'} scrub - 'off' turns off scrubbing on every chart in the grid, unless a chart sets its own `scrub`.
 * @attr {string} locale - BCP 47 tag for the grid's strings and its tiles' formatting.
 * @attr {string} currency - ISO 4217 code its tiles format money with.
 * @attr {string} time-zone - IANA zone its tiles format times with.
 * @attr {string} hour-cycle - The hour cycle its tiles use.
 * @attr {string} persist - A key that saves the layout to localStorage per device.
 * @attr {'comfortable' | 'compact'} density - 'compact' sets --ts-row to 120px, --ts-pad to 12px and --ts-gap to 10px. Default 'comfortable'.
 * @attr {string} aria-label - The name of the grid's region.
 * @fires {CustomEvent<TsLayoutChangeDetail>} ts-layout-change - A move, resize, remove, add or undo; save `detail.layout`.
 * @fires {CustomEvent<{ issues: LayoutIssue[] }>} ts-layout-issues - A layout was repaired when read.
 * @fires {CustomEvent<{ editing: boolean }>} ts-edit-change - Edit mode started or ended.
 * @fires {CustomEvent<TsReadingOrderChangeDetail>} ts-reading-order-change - The order of the visible tiles changed.
 * @fires {CustomEvent<{ columns: 2 | 3 | 4; device: 'desktop' | 'phone'; initial: boolean }>} ts-columns-change - The grid's column count changed.
 * @fires {CustomEvent<{ profile: string; reason: 'schedule' | 'override' | 'override-ended' }>} ts-profile-change - The shown profile changed.
 * @csspart board - The box the tiles sit in.
 * @csspart placeholder - The drop target shown while a tile is dragged.
 * @csspart toast - The undo toast.
 * @csspart edit-pill - The floating Done and Add back controls.
 * @csspart empty - The panel shown when no tile is visible.
 * @slot - The tiles.
 * @slot empty - Content that replaces the empty board's text.
 */

/**
 * The markup of <ts-widget-picker>, for the manifest. Its class, with the prose above its members, is in
 * controls.d.ts; the generator finds the class from `HTMLElementTagNameMap` and reads the tags from here.
 * It fires no event of its own: an add it makes reaches the host as the grid's `ts-layout-change`.
 *
 * @element ts-widget-picker
 * @attr {string} for - The id of the <ts-grid> it adds to.
 * @csspart sheet - The dialog's box, a bottom sheet below 700px and centred above.
 * @csspart search - The search field.
 * @csspart group - A heading and the rows under it.
 * @csspart row - One widget or hidden tile.
 * @csspart chip - A size button on a row.
 * @csspart empty - The text shown when nothing matches.
 * @csspart close - The close button.
 */

/**
 * The markup of <ts-grid-controls>, for the manifest. Its class is in controls.d.ts. It fires no event of
 * its own: a profile it picks reaches the host as the grid's `ts-profile-change`.
 *
 * @element ts-grid-controls
 * @attr {string} for - The id of the <ts-grid> it controls.
 * @attr {string} picker - The id of a <ts-widget-picker> to link; the one whose `for` is the same grid when absent.
 * @csspart switcher - The profile buttons' group.
 * @csspart option - One profile button.
 * @csspart next - The line naming the next scheduled switch.
 */

/**
 * The markup of <ts-layout-list>, for the manifest. Its class is in controls.d.ts. It fires no event of its own:
 * an edit it makes reaches the host as the grid's `ts-layout-change`.
 *
 * @element ts-layout-list
 * @attr {string} for - The id of the <ts-grid> it edits.
 * @csspart list - The labelled region around the list.
 * @csspart rows - The ordered list of tiles.
 * @csspart row - One tile.
 * @csspart name - The tile's name.
 * @csspart size - A size button on a row.
 * @csspart move - A Move up or Move down button.
 * @csspart remove - A row's Remove button.
 * @csspart undo - The Undo button.
 * @csspart status - The line that says what changed.
 * @csspart empty - The text shown when the layout has no tile.
 */

/** The attributes of the TsWidget base, as the framework typings (`tickslate/jsx`, `vue`, `svelte`) offer them. Kept in step with the `@base` block above by test/manifest.test.mjs. */
export interface TsWidgetAttributes {
  size?: SizeName | undefined
  label?: string | undefined
  locale?: string | undefined
  currency?: string | undefined
  'time-zone'?: string | undefined
  'hour-cycle'?: string | undefined
  state?: 'loading' | 'error' | undefined
  'heading-level'?: number | string | undefined
  href?: string | undefined
  activatable?: boolean | undefined
  'stale-after'?: number | string | undefined
  flash?: 'off' | undefined
  scrub?: 'on' | 'off' | undefined
  item?: string | undefined
}

/**
 * The attributes each tag adds to `TsWidgetAttributes` (or, for a tag that is no widget, all it has),
 * keyed by tag. A story that adds an element adds its line here, and the framework typings pick it
 * up; a tag with no extra attribute needs none. test/manifest.test.mjs fails when a key here and the
 * tag's `@attr` lines disagree.
 */
export interface TsElementAttributes {
  'ts-card': { sizes?: string | undefined; live?: boolean | undefined; 'as-of'?: string | undefined; scrollable?: boolean | undefined }
  'ts-equity-curve': { range?: EquityRange | undefined }
  'ts-edge-stats': { stat?: EdgeStatName | undefined }
  'ts-widget-picker': { for?: string | undefined }
  'ts-grid-controls': { for?: string | undefined; picker?: string | undefined }
  'ts-layout-list': { for?: string | undefined }
  'ts-grid': {
    editing?: boolean | undefined
    profile?: string | undefined
    locked?: boolean | undefined
    'edit-controls'?: 'off' | undefined
    'undo-toast'?: 'off' | undefined
    locale?: string | undefined
    currency?: string | undefined
    'time-zone'?: string | undefined
    'hour-cycle'?: string | undefined
    persist?: string | undefined
    density?: 'comfortable' | 'compact' | undefined
    'stale-after'?: number | string | undefined
    flash?: 'off' | undefined
    scrub?: 'on' | 'off' | undefined
    'aria-label'?: string | undefined
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ts-card': TsCard
    'ts-metric': TsMetric
    'ts-chart': TsChart
    'ts-table': TsTable
    'ts-progress': TsProgress
    'ts-watchlist': TsWatchlist
    'ts-open-positions': TsOpenPositions
    'ts-edge-stats': TsEdgeStats
    'ts-capital-funding': TsCapitalFunding
    'ts-today-pnl': TsTodayPnl
    'ts-equity-curve': TsEquityCurve
    'ts-session-clock': TsSessionClock
  }
}
