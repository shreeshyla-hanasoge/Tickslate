import type { Calendar, DayResult, Layout, LayoutIssue, Numeric, ProfileSchedule, WidgetCatalog } from '../core/index.js'
import { TsWidget } from './widget.js'

export { version } from '../core/index.js'
// widget.d.ts is shipped beside this file (scripts/pack-lib.mjs), so this
// import resolves both in the repo and in the published package.
export { TsWidget } from './widget.js'
export type { ViewModelContext } from './widget.js'

export interface TsLayoutChangeDetail {
  /** The whole layout after the edit; save this. */
  layout: Layout
  profile: string
  reason: 'move' | 'resize' | 'remove'
  /** The item that was moved, resized or removed. */
  id: string
}

/**
 * <ts-grid>: positions its children (each tagged item="<layout id>") from a
 * Layout, and lets the user rearrange them like apps on an iPhone: long-press
 * to edit, drag to move, drag the corner handle to resize, tap − to remove.
 */
export declare class TsGrid extends HTMLElement {
  /** Read through readLayout(); repairs fire `ts-layout-issues`. */
  layout: Layout
  /** Defaults to WIDGETS. Set it before `layout` if it adds tiles of the host's own. */
  catalog: WidgetCatalog
  /** The profile shown; reflects the `profile` attribute. Defaults to 'market'. */
  profile: string
  /** Edit mode; reflects the `editing` attribute. */
  editing: boolean
  /** 2, 3 or 4, from the grid's own width. 0 before it is first measured. */
  readonly columns: number
  /** Switches between 'market' and 'closed' on time when `profile` isn't pinned. */
  schedule: (ProfileSchedule & { calendar: Calendar }) | null
  /** What the grid takes the time to be. Defaults to Date.now. */
  clock: () => number
  /** Show a profile until the schedule next changes (or until override(null) with no schedule). */
  override(profile: string | null): void
}

/** Freshness, allowed on every widget's data (RFC 0001 §8.1). */
export interface WidgetFreshness {
  /** When the data was taken, ms since the epoch. */
  asOf?: number
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
  intraday?: Array<{ t: number; v: Numeric }>
  /** M: dots on the curve; ones outside the readings are left out. */
  marks?: Array<{ t: number; kind: 'entry' | 'exit'; label?: string }>
  /** M: the x-axis span, e.g. today's session from `calendar.hours()`. Defaults to the readings' span. */
  window?: { from: number; to: number }
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
    'ts-grid': TsGrid
    'ts-today-pnl': TsTodayPnl
    'ts-equity-curve': TsEquityCurve
    'ts-session-clock': TsSessionClock
  }
  interface HTMLElementEventMap {
    'ts-layout-change': CustomEvent<TsLayoutChangeDetail>
    'ts-layout-issues': CustomEvent<{ issues: LayoutIssue[] }>
    'ts-edit-change': CustomEvent<{ editing: boolean }>
    'ts-columns-change': CustomEvent<{ columns: 2 | 3 | 4; device: 'desktop' | 'phone' }>
    'ts-profile-change': CustomEvent<{ profile: string; reason: 'schedule' | 'override' | 'override-ended' }>
  }
}
