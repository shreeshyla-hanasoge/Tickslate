import type { Calendar, DayResult, Layout, LayoutItem, Numeric, Time } from '../core/index.js'
import { TsWidget } from './widget.js'

export { version } from '../core/index.js'
// widget.d.ts is shipped beside this file (scripts/pack-lib.mjs), so this
// import resolves both in the repo and in the published package.
export { TsWidget } from './widget.js'
export type { ViewModelContext, WidgetState } from './widget.js'
// grid.d.ts is shipped beside this file too (scripts/pack-lib.mjs).
export * from './grid.js'
import type { TsGrid } from './grid.js'

export interface PersistLayoutOptions {
  /** Each device is stored under `${key}:${device}`. */
  key: string
  /** A Layout or item array serves both devices; in the object form `phone` falls back to `desktop`. */
  defaults?: Layout | LayoutItem[] | { desktop: Layout | LayoutItem[]; phone?: Layout | LayoutItem[] }
  /** Defaults to `localStorage` when it exists. Storage that throws is treated as empty. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
}

/** Loads the grid's layout for its device, saves every `ts-layout-change`, and reloads when the device changes. */
export declare function persistLayout(
  grid: TsGrid,
  options: PersistLayoutOptions
): { reset(device?: 'desktop' | 'phone'): void; dispose(): void }

/** Freshness, allowed on every widget's data (RFC 0001 §8.1). */
export interface WidgetFreshness {
  /** When the data was taken: any Time, read with toTime (RFC 0002 §4.1). */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
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
    'ts-today-pnl': TsTodayPnl
    'ts-equity-curve': TsEquityCurve
    'ts-session-clock': TsSessionClock
  }
}
