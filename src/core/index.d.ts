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
