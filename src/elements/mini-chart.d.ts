import type { Numeric, SizeName, Time } from '../core/index.js'
import { TsWidget } from './widget.js'
import type { ViewModelContext } from './widget.js'
import type { TsCommonAction, WidgetFreshness } from './index.js'

export type { ViewModelContext, TsCommonAction, WidgetFreshness }

// <ts-mini-chart> is declared in this file, not in index.d.ts: it ships only at tickslate/elements/mini-chart, because the
// all-in entry never loads Emberwick (RFC 0004 §6.1). The class is exported by that entry at runtime and by no other.

/** One bar. `time` is read with toTime and becomes ms in Emberwick's own Bar. */
export interface MiniChartBar {
  time: Time
  open: Numeric
  high: Numeric
  low: Numeric
  close: Numeric
  volume?: Numeric
}

/**
 * A volume profile the HOST computed, in Emberwick's own contract (`ProfileData`, version 1, from
 * `emberwick/profiles`). Emberwick never computes one from bars, and neither does Tickslate. It is typed here
 * rather than imported so these declarations resolve for a host that has not installed the optional peer.
 */
export interface MiniChartProfile {
  version: 1
  source?: string
  /** Price width of one bin. Must be above 0. */
  step: number
  sessions: Array<{
    start: number
    end: number
    lo: number
    bins: ArrayLike<number>
    poc?: number
    vah?: number
    val?: number
    total?: number
    developing?: boolean
  }>
}

export interface MiniChartData extends WidgetFreshness {
  /** M and L show the first chart; XL shows the first two side by side. */
  charts: Array<{
    id: string
    instrument: string
    /** '5m'. Shown in the header and the summary; the pressed button at L. */
    timeframe?: string
    /** L: the timeframe buttons, with `timeframe` pressed. They appear only when `actions` includes 'timeframe'. */
    timeframes?: string[]
    /** Ascending by time. A bar with an unreadable time or price is dropped. */
    bars: MiniChartBar[]
    /** An entry is drawn as a circle and an exit as a diamond. A mark with an unreadable time or another kind is dropped. */
    marks?: Array<{ t: Time; kind: 'entry' | 'exit'; label?: string }>
    /** A fraction: 0.012 is +1.20%. Shown in the header. */
    changePct?: Numeric
    /** XL: '2 strategies · 1 in position'. */
    note?: string
  }>
  /** The candle-close countdown on the last price. */
  countdown?: boolean
  /** L: a profile the host computed. Absent or null draws none; one Emberwick rejects shows the error view. */
  volumeProfile?: MiniChartProfile | null
}

/**
 * <ts-mini-chart>, sizes M · L · XL. A small candlestick chart with marks and a candle-close countdown, drawn by
 * Emberwick. Import it from `tickslate/elements/mini-chart`: `tickslate/elements` never loads Emberwick.
 *
 * @element ts-mini-chart
 * @fires {CustomEvent<TsMiniChartAction>} ts-action - Retry, 'open', and 'timeframe' when `actions` includes it.
 * @csspart chart - The framed box one chart is drawn in; it is the image the summary names.
 * @csspart timeframes - The group of timeframe buttons at L.
 */
export declare class TsMiniChart extends TsWidget<MiniChartData> {
  addEventListener(type: 'ts-action', listener: (this: TsMiniChart, ev: CustomEvent<TsMiniChartAction>) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: TsMiniChart, ev: HTMLElementEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void
  /** Pure: normalised bars and marks, header strings, timeframe buttons and the summary. */
  static miniChartModel(data: MiniChartData, variant: SizeName, ctx: ViewModelContext): MiniChartModel
}

export interface MiniChartModel {
  variant: SizeName
  charts: Array<{
    id: string
    instrument: string
    timeframe: string
    /** Emberwick's Bar: numbers, ascending, one per time. */
    bars: Array<{ time: number; open: number; high: number; low: number; close: number; volume?: number }>
    marks: Array<{ time: number; kind: 'entry' | 'exit'; shape: 'circle' | 'diamond'; text?: string }>
    /** Identity of the series (id, instrument, timeframe): a change starts the chart's data again. */
    key: string
    /** The last close, or null with no bars. */
    last: number | null
    lastText: string
    /** Signed: '+1.20%'. '' when there is none. */
    changeText: string
    changeArrow: '▲' | '▼' | ''
    changeTone: 'pos' | 'neg' | ''
    /** The marks header text: '2 marks'. */
    marksCount: string
    note: string
    timeframes: Array<{ value: string; on: boolean }>
    /** The host's volume profile, at L on the first chart only; null otherwise. */
    profile: MiniChartProfile | null
    /** 'ABC Corp, 5m: last 128.40, up 1.20%, 78 bars, 2 entries and 1 exit'. */
    summary: string
  }>
  countdown: boolean
  /** The IANA zone the countdown and time axis use, when the host set one. */
  timeZone: string | undefined
  /** Bars and marks that could not be read. */
  dropped: number
  ariaLabel: string
  live: boolean
}

/** 'timeframe' only fires when the host opts in with `actions = ['timeframe']` (RFC 0004 §6.2). */
export type TsMiniChartAction = TsCommonAction | { action: 'timeframe'; id: string; value: string }
