/** The package version, kept equal to package.lib.json by a test. */
export declare const version: string

// ── Sizes and breakpoints ──────────────────────────────────────────────

export type SizeName = 'S' | 'Wide' | 'Tall' | 'M' | 'L' | 'Banner' | 'XL'
export type Columns = 2 | 3 | 4
export type Device = 'desktop' | 'phone'

export declare const SIZES: Readonly<Record<SizeName, Readonly<{ cols: number; rows: number }>>>
/** Every size, smallest first: S, Wide, Tall, M, L, Banner, XL. */
export declare const SIZE_NAMES: readonly SizeName[]
/** Grid width thresholds in px: ≥ desktop → 4 columns, ≥ tablet → 3, else 2. */
export declare const BREAKPOINTS: Readonly<{ desktop: 1200; tablet: 700 }>

export declare function isSize(name: unknown): name is SizeName
export declare function columnsFor(width: number): Columns
/** 'phone' below 700 px. A tablet uses the desktop layout, clamped to 3 columns. */
export declare function deviceFor(width: number): Device
/** `size` if supported, else the nearest supported size. An unknown name snaps to the smallest. */
export declare function snapSize(size: string, supported: readonly SizeName[]): SizeName

export interface Footprint {
  /** Columns the tile occupies on this grid. */
  cols: number
  /** Rows the tile occupies. */
  rows: number
  /** The designed size the widget renders. */
  variant: SizeName
}

/**
 * The cells a size occupies at a column count, and the design it renders there.
 * Banner always spans the full width and keeps its design; `phoneRows` can
 * give it more height on phones.
 */
export declare function footprint(
  size: SizeName,
  columns: Columns,
  supported?: readonly SizeName[] | null,
  phoneRows?: Partial<Record<SizeName, number>> | null,
): Footprint

// ── Widget catalog ─────────────────────────────────────────────────────

export interface WidgetSpec {
  tag: string
  label: string
  sizes: readonly SizeName[]
  /** Rows a size takes on phones when the default doesn't suit, e.g. { Banner: 2 }. */
  phoneRows?: Readonly<Partial<Record<SizeName, number>>>
}
export type WidgetCatalog = Readonly<Record<string, WidgetSpec>>

/** The v1 widgets. Spread into a larger catalog to add a host's own tiles. */
export declare const WIDGETS: Readonly<{
  todayPnl: WidgetSpec
  equityCurve: WidgetSpec
  pnlCalendar: WidgetSpec
  edgeStats: WidgetSpec
  capitalFunding: WidgetSpec
  openPositions: WidgetSpec
  watchlist: WidgetSpec
  sessionClock: WidgetSpec
  miniChart: WidgetSpec
}>

// ── Layouts ────────────────────────────────────────────────────────────

export interface LayoutItem {
  /** Identifies the tile; matches the `item` attribute of its element. */
  id: string
  /** The widget, a key of the catalog. Defaults to `id`. */
  type?: string
  size: SizeName
}

export interface Layout {
  version: 1
  device: Device
  /** Array order is placement order. 'market' and 'closed' are always present. */
  profiles: Record<string, LayoutItem[]>
  /** Phone only: up to 3 item ids pinned above the grid. */
  topStrip?: string[]
}

export interface LayoutIssue {
  /** Where in the input, e.g. 'profiles.market[3].size'. '' for the whole layout. */
  path: string
  code:
    | 'unknown-version'
    | 'unknown-widget'
    | 'unsupported-size'
    | 'duplicate-id'
    | 'bad-shape'
    | 'top-strip-too-long'
    | 'top-strip-unknown-id'
  message: string
  fixed: 'dropped' | 'replaced' | 'migrated'
}

export declare const LAYOUT_VERSION: 1
export declare const BUILT_IN_PROFILES: readonly ['market', 'closed']
export declare const TOP_STRIP_MAX: 3

/** The item's widget type: `type` when given, else `id`. */
export declare function typeOf(item: LayoutItem): string

/** An empty layout with the built-in profiles. */
export declare function emptyLayout(device?: Device): Layout

/**
 * Reads saved layout JSON. Never throws: it repairs what it can, drops what it
 * can't, and reports each change in `issues`. The result is a fresh copy.
 */
export declare function readLayout(
  input: unknown,
  options?: { catalog?: WidgetCatalog; device?: Device },
): { layout: Layout; issues: LayoutIssue[] }

// ── Placement ──────────────────────────────────────────────────────────

export interface Placement {
  id: string
  /** 0-based. */
  col: number
  /** 0-based. */
  row: number
  cols: number
  rows: number
  variant: SizeName
}

/**
 * Places items in array order, each in the first cell where it fits, the same
 * as CSS `grid-auto-flow: dense`. Placements come back in input order.
 */
export declare function place(
  items: readonly LayoutItem[],
  columns: Columns,
  catalog?: WidgetCatalog,
): { placements: Placement[]; rows: number }

// ── Editing (pure; inputs are never changed) ───────────────────────────

/** Appends an item, snapping its size. Throws on a missing or duplicate id. */
export declare function addItem(items: readonly LayoutItem[], item: LayoutItem, catalog?: WidgetCatalog): LayoutItem[]
export declare function removeItem(items: readonly LayoutItem[], id: string): LayoutItem[]
/** Moves an item to an index, clamped to the list. An unknown id returns a copy. */
export declare function moveItem(items: readonly LayoutItem[], id: string, toIndex: number): LayoutItem[]
export declare function resizeItem(items: readonly LayoutItem[], id: string, size: SizeName, catalog?: WidgetCatalog): LayoutItem[]
/** The next supported size up (1) or down (-1), stopping at the ends. */
export declare function stepSize(spec: WidgetSpec, current: SizeName, dir: 1 | -1): SizeName
/**
 * The supported size nearest an extent of cols × rows cells, as a resize handle
 * is dragged. With `columns`, sizes are compared by their footprint on that
 * grid; ties keep `current`, then take the smaller size.
 */
export declare function sizeForExtent(
  spec: WidgetSpec,
  cols: number,
  rows: number,
  columns?: Columns,
  current?: SizeName,
): SizeName

/**
 * The index to move `id` to so its top-left cell lands nearest `target`
 * (fractional cells). `aspect` is a column's on-screen width over a row's
 * height. Ties keep the current index. Returns -1 for an unknown id.
 */
export declare function dropIndex(
  items: readonly LayoutItem[],
  id: string,
  target: { col: number; row: number },
  columns: Columns,
  catalog?: WidgetCatalog,
  aspect?: number,
): number

/** A layout with one profile replaced; top strip ids no profile holds any more are dropped. */
export declare function withProfile(layout: Layout, profile: string, items: LayoutItem[]): Layout
/** Sets the top strip to at most 3 distinct ids that are in the layout. */
export declare function setTopStrip(layout: Layout, ids: readonly string[]): Layout

// ── Formatting ─────────────────────────────────────────────────────────

export interface FormatOptions {
  /** e.g. 'en-IN'. Defaults to configure(), then the runtime's locale. */
  locale?: string
  /** e.g. 'INR'. Without one, money formats as a plain signed number. */
  currency?: string
  /** For times, e.g. 'Asia/Kolkata'. */
  timeZone?: string
}

/** Values may be numbers or numeric strings; anything else formats as '—'. */
export type Numeric = number | string

export interface Formatter {
  readonly locale: string | undefined
  readonly currency: string | undefined
  readonly timeZone: string | undefined
  /** '+₹2,185.65', '−₹263.00', '₹0.00'. sign defaults to 'always'. */
  money(v: Numeric, o?: { sign?: 'always' | 'negative'; compact?: boolean; decimals?: number }): string
  /** sign defaults to 'negative'. */
  number(v: Numeric, o?: { sign?: 'always' | 'negative'; decimals?: number; compact?: boolean }): string
  /** Grouped, no currency symbol; decimals default to 2. */
  price(v: Numeric, o?: { decimals?: number }): string
  /** Takes a ratio: 0.027 → '+2.70%'. sign defaults to 'always'. */
  percent(v: Numeric, o?: { sign?: 'always' | 'negative'; decimals?: number }): string
  /** 24-hour unless hour12: '11:42', '11:42:20'. */
  time(t: number, o?: { seconds?: boolean; hour12?: boolean }): string
  /** 'clock': '2:40', '1:02:05'. 'words': '3h 48m', '48m', '9s'. */
  duration(ms: number, o?: { style?: 'clock' | 'words' }): string
  /** The full money form if it fits in maxChars, else the compact one. */
  fit(v: Numeric, maxChars: number, o?: { sign?: 'always' | 'negative' }): string
}

export declare function createFormatter(options?: FormatOptions): Formatter
/** Sets defaults for formatters (and widgets) created without their own. */
export declare function configure(options: FormatOptions): void
export declare function currentConfig(): FormatOptions
/** A number from a number or numeric string, else NaN. */
export declare function toNumber(v: unknown): number

// ── Session calendars ──────────────────────────────────────────────────

export interface SessionSpec {
  id: string
  label: string
  /** IANA zone, e.g. 'Asia/Kolkata'. */
  timeZone: string
  /** ISO weekdays it trades, 1 = Monday. */
  days: readonly number[]
  /** 'HH:MM' local. */
  open: string
  /** 'HH:MM' local, after `open`, or date ranges with their own close. */
  close: string | { default: string; ranges: ReadonlyArray<{ from: string; to: string; close: string }> }
  /** Extra sessions on given dates, e.g. a weekend session. They beat weekdays and holidays. */
  specialSessions?: Record<string, { open: string; close: string }>
}

export interface CalendarInput {
  sessions: readonly SessionSpec[]
  /** Session id → 'YYYY-MM-DD' dates; '*' applies to every session. */
  holidays?: Record<string, readonly string[]>
}

export interface SessionState {
  open: boolean
  /** Next open, when closed; null if none within a month. */
  opensAt: number | null
  /** When open. */
  closesAt: number | null
  /** When open. */
  startedAt: number | null
  /** 0..1 through the session, when open. */
  progress: number | null
}

export interface Calendar {
  readonly sessions: readonly string[]
  session(id: string): SessionSpec
  isTradingDay(id: string, date: string): boolean
  /** The session's hours on a date as instants, or null if it doesn't trade. */
  hours(id: string, date: string): { open: number; close: number } | null
  state(id: string, now: number): SessionState
  nextChange(id: string, now: number): { at: number; to: 'open' | 'closed' } | null
  /** The next candle close, aligned to the session open; null while closed. */
  candleClose(id: string, now: number, timeframeMinutes: number): number | null
  /** Every session window overlapping [from, to). */
  windows(id: string, from: number, to: number): Array<{ open: number; close: number }>
}

/** Throws TypeError on a malformed session or holiday list. */
export declare function createCalendar(input: CalendarInput): Calendar

/** Ready-made sessions, checked against exchange circulars on 13 Oct 2026. */
export declare const presets: {
  /** 'equity' → id 'nse', 09:15–15:30. 'derivatives' → id 'nse-fo', 09:15–15:40 (15:30 before 3 Aug 2026). */
  nse(options?: { segment?: 'equity' | 'derivatives' }): SessionSpec
  /**
   * 'international' (metals, energy) → id 'mcx', 09:00–23:30 during US daylight
   * saving, else 23:55, for the given years (default: last, this and next).
   * 'cotton' → 'mcx-cotton', 09:00–21:00. 'agri' → 'mcx-agri', 09:00–17:00.
   */
  mcx(options?: { segment?: 'international' | 'cotton' | 'agri'; years?: number[] }): SessionSpec
}

/** The dates New York is on daylight saving in a year. */
export declare function usDaylightSaving(year: number): { from: string; to: string }

export interface ProfileSchedule {
  market: { sessions: string[]; leadMinutes?: number; lagMinutes?: number }
}

/** 'market' while any listed session is open (widened by lead and lag), else 'closed'. */
export declare function activeProfile(calendar: Calendar, schedule: ProfileSchedule, now: number): 'market' | 'closed'
/** The next instant activeProfile changes, or null if not within a month. */
export declare function nextProfileChange(calendar: Calendar, schedule: ProfileSchedule, now: number): number | null

/** The instant the clock in `timeZone` reads `hhmm` on `date`. */
export declare function zonedTime(date: string, hhmm: string, timeZone: string): number
/** The local 'YYYY-MM-DD' of an instant in `timeZone`. */
export declare function localDate(t: number, timeZone: string): string

// ── Stats ──────────────────────────────────────────────────────────────

export interface DayResult {
  /** 'YYYY-MM-DD'. Entries with any other form are skipped. */
  date: string
  /** The day's P&L in major units; a numeric string is accepted. Entries that aren't finite numbers are skipped. */
  pnl: number | string
  trades?: number
}

export interface EquityPoint {
  date: string
  /** Running sum of pnl, starting from 0. */
  equity: number
  /** Running maximum of equity, counting the starting 0, so never below 0. */
  peak: number
  /** equity − peak, never above 0. */
  drawdown: number
}

/** The running equity curve of a daily P&L series, sorted by date. The input is not changed. */
export declare function equitySeries(days: readonly DayResult[]): EquityPoint[]

export interface EquityStats {
  /** Equity at the end of the series. */
  net: number
  /** Highest equity reached, at least 0. */
  peak: number
  /** The largest fall below a running peak, as a positive number. */
  maxDrawdown: number
  /** Valid entries only. */
  tradingDays: number
  /** The sum of `trades` where it is a finite number. */
  trades: number
}

export declare function equityStats(days: readonly DayResult[]): EquityStats
