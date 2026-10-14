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
/** A catalog object, or a function that resolves one item to its spec (null when unknown). */
export type Catalog = WidgetCatalog | ((item: LayoutItem) => WidgetSpec | null)

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
  card: WidgetSpec
  metric: WidgetSpec
  chart: WidgetSpec
}>

/** The profile a layout uses when none is named. */
export declare const DEFAULT_PROFILE: 'market'

/** The catalog key whose spec has this tag; own entries only, null for a function catalog. */
export declare function typeForTag(catalog: Catalog, tag: string): string | null

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
  fixed: 'dropped' | 'replaced' | 'migrated' | 'kept'
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
  input: Layout | LayoutItem[] | unknown,
  options?: { catalog?: Catalog; device?: Device; unknown?: 'drop' | 'keep' },
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
  catalog?: Catalog,
): { placements: Placement[]; rows: number }

// ── Editing (pure; inputs are never changed) ───────────────────────────

/** Appends an item, snapping its size. Throws on a missing or duplicate id. */
export declare function addItem(items: readonly LayoutItem[], item: LayoutItem, catalog?: Catalog): LayoutItem[]
export declare function removeItem(items: readonly LayoutItem[], id: string): LayoutItem[]
/** Moves an item to an index, clamped to the list. An unknown id returns a copy. */
export declare function moveItem(items: readonly LayoutItem[], id: string, toIndex: number): LayoutItem[]
export declare function resizeItem(items: readonly LayoutItem[], id: string, size: SizeName, catalog?: Catalog): LayoutItem[]
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
  catalog?: Catalog,
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

/** Values may be numbers, decimal strings or decimal-library objects (Decimal.js, big.js); anything else formats as '—'. */
export type Numeric = number | string | { toNumber(): number }

/** An option that failed validation and fell back to its default. */
export interface FormatterIssue {
  option: 'locale' | 'currency' | 'timeZone'
  value: unknown
  message: string
}

export interface Formatter {
  readonly locale: string | undefined
  readonly currency: string | undefined
  readonly timeZone: string | undefined
  /** The options that failed validation and fell back to the defaults. */
  readonly issues: readonly FormatterIssue[]
  /** '+₹2,185.65', '−₹263.00', '₹0.00'. sign defaults to 'always'. */
  money(v: Numeric, o?: { sign?: 'always' | 'negative'; compact?: boolean; decimals?: number }): string
  /** sign defaults to 'negative'. compact: 1200000 → '1.2M' in en-US, '1,2 Mio.' in de-DE. */
  number(v: Numeric, o?: { sign?: 'always' | 'negative'; decimals?: number; compact?: boolean }): string
  /** Grouped, no currency symbol; decimals default to 2. */
  price(v: Numeric, o?: { decimals?: number }): string
  /** Takes a fraction, not a percentage: 0.12 → '+12.00%' (sign 'always' by default), '12.00%' with sign 'negative'. */
  percent(v: Numeric, o?: { sign?: 'always' | 'negative'; decimals?: number }): string
  /** 24-hour unless hour12: '11:42', '11:42:20'. */
  time(t: number, o?: { seconds?: boolean; hour12?: boolean }): string
  /** 'clock': '2:40', '1:02:05'. 'words': '3h 48m', '48m', '9s'. */
  duration(ms: number, o?: { style?: 'clock' | 'words' }): string
  /** '182 ms' for an ECMA-402 sanctioned unit (or an 'x-per-y' pair of them), '3 seats' for any other. */
  unit(v: Numeric, unit: string, o?: { decimals?: number; compact?: boolean }): string
  /** The full form if it fits in maxChars, else without decimals, else compact (only if shorter). style defaults to 'money'. */
  fit(v: Numeric, maxChars: number, o?: { style?: 'money' | 'number' | 'percent'; sign?: 'always' | 'negative'; decimals?: number }): string
}

export declare function createFormatter(options?: FormatOptions): Formatter
/** Sets defaults for formatters (and widgets) created without their own. `messages` is the table every widget and grid reads; null clears it. */
export declare function configure(options: FormatOptions & { messages?: Partial<Messages> | null }): void
export declare function currentConfig(): FormatOptions & { messages?: Partial<Messages> }
/** A finite number from a number, a decimal string or a decimal-library object; else NaN. */
export declare function toNumber(v: unknown): number

// ── Messages ───────────────────────────────────────────────────────────

/** One entry per key, each a string. A key with plural forms is listed by its forms, `time.days.one`, `time.days.other` and so on. */
export interface Messages {
  'widget.empty': string
  'widget.error': string
  'widget.error.region': string
  'action.retry': string
  'widget.todayPnl.label': string
  'widget.equityCurve.label': string
  'widget.pnlCalendar.label': string
  'widget.edgeStats.label': string
  'widget.capitalFunding.label': string
  'widget.openPositions.label': string
  'widget.watchlist.label': string
  'widget.sessionClock.label': string
  'widget.miniChart.label': string
  'widget.card.label': string
  'widget.metric.label': string
  'widget.chart.label': string
  'widget.todayPnl.empty': string
  'widget.equityCurve.empty': string
  'widget.sessionClock.empty': string
  'widget.metric.empty': string
  'widget.chart.empty': string
  'size.S': string
  'size.Wide': string
  'size.Tall': string
  'size.M': string
  'size.L': string
  'size.Banner': string
  'size.XL': string
  'size.name': string
  'time.synced': string
  'time.days.one': string
  'time.days.other': string
  'grid.dashboard': string
  'grid.editLayout': string
  'grid.editingGroup': string
  'grid.done': string
  'grid.undo': string
  'grid.emptyBoard': string
  'grid.addBack': string
  'grid.addBackItem': string
  'grid.hiddenHeading': string
  'grid.instructions': string
  'grid.handle': string
  'grid.remove': string
  'grid.resize': string
  'grid.removed': string
  'grid.removedSaid': string
  'grid.addedBack': string
  'grid.editStart.one': string
  'grid.editStart.other': string
  'grid.editDone': string
  'grid.pickedUp': string
  'grid.moved': string
  'grid.dropped': string
  'grid.droppedAt': string
  'grid.cancelled': string
  'grid.blocked': string
  'grid.resized': string
  'grid.profile': string
  'grid.undone': string
  'pnl.today': string
  'pnl.realised': string
  'pnl.unrealised': string
  'pnl.fees': string
  'pnl.closed': string
  'pnl.open': string
  'pnl.feesNote': string
  'pnl.netOfFees': string
  'pnl.now': string
  'pnl.at': string
  'pnl.low': string
  'pnl.high': string
  'pnl.highNow': string
  'pnl.noIntraday': string
  'pnl.chartEmpty': string
  'pnl.chartLabel': string
  'pnl.entry': string
  'pnl.exit': string
  'pnl.markTitle': string
  'equity.short': string
  'equity.wide': string
  'equity.net': string
  'equity.peak': string
  'equity.maxDrawdown': string
  'equity.tradingDays': string
  'equity.shaded': string
  'equity.fees': string
  'equity.trades': string
  'equity.netOfFees': string
  'equity.noDays': string
  'equity.rangeLabel': string
  'equity.range1W': string
  'equity.range1M': string
  'equity.range3M': string
  'equity.rangeYTD': string
  'equity.rangeAll': string
  'equity.peakNote': string
  'equity.over': string
  'equity.dayCount.one': string
  'equity.dayCount.other': string
  'equity.tradingDayCount.one': string
  'equity.tradingDayCount.other': string
  'equity.tradeCount.one': string
  'equity.tradeCount.other': string
  'equity.chartEmpty': string
  'equity.chartLabel': string
  'equity.ariaEmpty': string
  'equity.aria': string
  'session.title': string
  'session.open': string
  'session.closed': string
  'session.openShort': string
  'session.closedShort': string
  'session.noCalendar': string
  'session.none': string
  'session.unknown': string
  'session.noneScheduled': string
  'session.noneShort': string
  'session.toClose': string
  'session.left': string
  'session.opens': string
  'session.opensIn': string
  'session.opensOn': string
  'session.opensDay': string
  'session.dayTime': string
  'session.ariaOpen': string
  'session.ariaClosed': string
  'session.ariaNone': string
  'session.aria': string
  'session.tfHours': string
  'session.tfMinutes': string
  'session.legend': string
  'session.legendNext': string
  'session.nextClose': string
  'metric.target': string
  'metric.up': string
  'metric.down': string
  'metric.unchanged': string
  'metric.trend': string
  'chart.series': string
  'chart.last': string
  'chart.noData': string
}

export type MessageKey = keyof Messages

/** `{param}` interpolation and plural forms; a missing key falls back to EN, then to the key itself. A `count` selects `key.<category>`, then `key.other`, then `key`. */
export type Translate = (key: MessageKey, params?: Record<string, string | number>, count?: number) => string

/** Every key and its English text. Frozen; keys are flat and dotted. */
export declare const EN: Readonly<Messages>

/** Builds a `t` from a table of overrides (missing keys fall back to EN) and the locale that picks plural forms. */
export declare function createMessages(overrides?: Partial<Messages> | null, locale?: string): Translate

/** An instant: ms or seconds since the epoch, a Date, an ISO 8601 string or a numeric string. */
export type Time = number | string | Date
/** An instant in ms since the epoch, or NaN. A number with |n| < 1e11 is seconds, otherwise ms. */
export declare function toTime(v: unknown): number
/** A calendar day 'YYYY-MM-DD' in `timeZone` (default 'UTC'), or null. */
export declare function toDay(v: unknown, timeZone?: string): string | null

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
  /** 'YYYY-MM-DD', or any Time: read with toDay(date, timeZone). Entries toDay can't read are skipped. */
  date: Time
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
export declare function equitySeries(days: readonly DayResult[], options?: { timeZone?: string }): EquityPoint[]

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

export declare function equityStats(days: readonly DayResult[], options?: { timeZone?: string }): EquityStats
