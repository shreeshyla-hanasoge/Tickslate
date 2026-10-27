import type { Formatter, MessageOverrides, Numeric, SizeName, Translate, WidgetSpec } from '../core/index.js'

/** 'loading' covers a re-fetch over existing data; 'error' shows the error view. */
export type WidgetState = 'loading' | 'error' | null

/** What dataShape can ask of a value (RFC 0002 §2.7). `numeric` and `time` accept what toNumber and toTime read. */
export type ShapeKind = 'number' | 'numeric' | 'time' | 'string' | 'boolean' | 'array' | 'object'

export interface ShapeField {
  kind: ShapeKind
  /** Absent (or null) is fine. Default false: the key is required. */
  optional?: boolean
  /** Array items, or a nested object's shape. */
  of?: ShapeKind | ShapeField | DataShape
}

/** A bare kind is required; keys not listed are allowed. */
export type DataShape = Readonly<Record<string, ShapeKind | ShapeField>>

/** Freshness information computed from data.asOf, data.live and stale-after (RFC 0003 §6.2). */
export interface Freshness {
  /** data.asOf read with toTime; null when absent or unreadable. */
  asOf: number | null
  /** fmt.ago, '' without asOf. An asOf ahead of `now` reads as 'just now', never a negative age. */
  ago: string
  /** live and past the threshold. */
  stale: boolean
}

/** The context a view model receives. */
export interface ViewModelContext {
  /** Whatever the element's viewContext() adds. */
  [extra: string]: unknown
  fmt: Formatter
  /** This element's messages: its own, then its grid's, then configure()'s, then EN. */
  t: Translate
  /** The time in ms: `clock()` if set, else `Date.now()`. */
  now: number
  /** The effective label: the `label` attribute, else the spec's label, else the tag. */
  label: string
  /** Freshness information computed from data.asOf, data.live and stale-after (RFC 0003 §6.2). */
  freshness: Freshness
}

/** Base class of every Tickslate widget (RFC 0001 §8.1). See the header of widget.js for the full contract. */
export declare class TsWidget<Data = unknown, ViewModel extends { ariaLabel?: string } = { ariaLabel?: string }> extends HTMLElement {
  /** The key in the core's WIDGETS catalog: supplies supported sizes and the default label. */
  static catalogKey: string | null
  /** A widget's own description, for host widgets with no catalog entry. catalogKey wins when both are set. */
  static spec: { label?: string; sizes?: readonly string[]; phoneRows?: Partial<Record<SizeName, number>> } | null
  /** CSS for the widget's own content, appended after the shared CSS. Tokens only. */
  static styles: string
  /** Static markup for one variant, built once per variant. */
  static template(variant: SizeName): string
  /** The data's expected shape. In development, data that doesn't match warns once per element; production never checks. Default null. */
  static dataShape: DataShape | null
  /** Render the template while data is undefined (viewModel then gets `{}`); the skeleton shows only for state="loading". Default false. */
  static dataOptional: boolean
  /** What the empty state says. Default: the EN value of `widget.empty`; a built-in's is the EN value of its `widget.<key>.empty`, which a host's messages override. */
  static emptyText: string
  /** Loading markup for one variant, built once: `.sk` blocks shaped like the content. Default: a header, a headline bar and two text lines. */
  static skeleton(variant: SizeName): string
  /** Pure: data to display strings and numbers. Throwing shows the error view. */
  static viewModel(data: any, variant: SizeName, ctx: ViewModelContext): { ariaLabel?: string } & Record<string, unknown>
  static get observedAttributes(): string[]

  /** Setting it schedules one render per microtask. Once set, the `data` attribute (JSON starting with { or [) is ignored; until then it supplies the data, and a parse failure shows the error view. undefined (never set) shows the loading skeleton; null shows the empty state. */
  data: Data | null | undefined
  /** Attribute and property. 'loading' shows the skeleton even over existing data; 'error' shows the error view. */
  state: WidgetState
  /** A message shows the error view; null clears it. An Error is read as its message. */
  error: string | null
  /** The action names the widget may offer, such as ['retry']. Setting a non-array gives []. Re-applied on connect. */
  actions: readonly string[]
  /** True when `actions` includes `name`. */
  actionEnabled(name: string): boolean
  /** Attribute and property. Makes the label a real link, followed from a click on the header, the headline figure or the empty space; a click on data (a chart, a cell, a list) never follows it. Only http, https, mailto, tel and relative URLs are accepted. */
  href: string | null
  /** Attribute and property. The label becomes a button, and a click on it, on the header, on the headline figure or on the empty space fires ts-action { action: 'open', id }. A click on data (a chart, a calendar cell, a list or its rows) scrubs, focuses, selects, scrolls or does nothing, and the tile's own buttons and the actions slot keep their clicks. Route `open` to a page other than the one the tile is on. */
  activatable: boolean
  /**
   * Attribute and property: `'off'` turns scrubbing off on a chart (hover, touch drag and the keyboard slider),
   * `'on'` turns it on. Resolved as `flash` is: the widget's own, then the nearest `<ts-grid>`'s, then on; anything
   * other than `'off'` is on. Null when the widget sets none. Only the charts (`<ts-chart>`, `<ts-equity-curve>`,
   * `<ts-today-pnl>`) act on it. The overlay parts are `scrub`, `scrub-rule`, `scrub-dot` and `scrub-readout`.
   */
  scrub: 'on' | 'off' | null
  /** Attribute and property, snapped to the widget's supported sizes; defaults to the first supported size. */
  size: SizeName
  /** The size actually rendered. */
  readonly variant: SizeName
  /** Catalog entry, else the validated static spec, else `{ label: '', sizes: [] }`. Subclasses may override. */
  readonly spec: Omit<WidgetSpec, 'tag'>
  /** What the widget takes the time to be. Tests and demos can freeze it. */
  clock: (() => number) | null
  now(): number
  /** Resolved from own attributes, then the nearest <ts-grid>, then configure(); cached. */
  readonly formatter: Formatter
  /** Overrides for this widget's strings; null clears. Assign a new object to change them. */
  messages: MessageOverrides | null
  /** Resolved for this element: element → nearest <ts-grid> → configure() → EN. Cached; rebuilt when a table or the locale changes. */
  readonly t: Translate

  /** The first match in the shadow root, cached until the template is rebuilt. */
  $<T extends Element = HTMLElement>(selector: string): T | null
  requestRender(): void
  /** Re-render every `ms` while connected and the page is visible; 0 stops. */
  every(ms: number): void
  /** Dispatch a bubbling, composed, cancelable 'ts-action' event. Returns false if a listener called preventDefault. */
  emit(action: string, detail?: Record<string, unknown>): boolean
  /** Re-apply properties set before the element was defined. */
  upgrade(...names: string[]): void

  /** Extra keys for the view model's ctx (an attribute, say). fmt, t, now and label can't be replaced. */
  viewContext(): Record<string, unknown>

  /** Write the view model into the DOM template() built. Called on every render. */
  update(vm: ViewModel, variant: SizeName): void

  /**
   * Tints the element marked data-k or data-flash "<key>" for 700 ms: up (--ts-profit) when
   * the value rose, down (--ts-loss) when it fell. With goodWhen 'down' the
   * colours swap; 'neither' uses --ts-accent for both (RFC 0003 §6.3). Pass the number behind the
   * figure, not its text. Never on a first render, an unchanged or unreadable value, or under
   * `flash="off"` or reduced motion; at most once a second per key. A clock needs no flash: don't call it.
   */
  protected flash(key: string, value: Numeric, o?: { goodWhen?: 'up' | 'down' | 'neither' }): void

  connectedCallback(): void
  disconnectedCallback(): void
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void
}

/** Parses milliseconds as a number (90000) or duration string ('90s', '2m', '1h'). Null if unreadable. */
export declare function parseDuration(v: unknown): number | null

export declare function resolveFormatOptions(
  ...sources: Array<{ getAttribute(name: string): string | null } | null | undefined>
): { locale?: string; currency?: string; timeZone?: string }
export declare function standaloneCss(): string
export declare function escapeHtml(s: unknown): string
export declare const SHARED_CSS: string
/** One skeleton block: width in percent (snapped to 5) or 'x' for an axis label, height in px. */
export declare function sk(width: number | 'x', height: number): string
/** What header() takes (RFC 0003 §5.1). Internal for now: the built-in widgets use it, and custom widgets are not yet promised it. */
export interface HeaderOptions {
  /** The live dot, hidden until the widget unhides it. */
  dot?: boolean
  /** `true` for the standard "synced 11:42" meta, or markup for the widget's own right-hand content. */
  meta?: boolean | string
  /** A `<slot name="actions">` after the meta. */
  actions?: boolean
  /** Markup straight after the label. */
  extra?: string
  /** Markup inside the label, for a label that shows two forms; the widget then writes those nodes. */
  inner?: string
  /** An extra class on the label. */
  labelClass?: string
}
/** The header row `[dot][label][spacer][meta]`, with `part="header"`, and the label as `part="label"` and `role="heading"`. */
export declare function header(opts?: HeaderOptions): string
/** ▲ for a text that starts with `+`, ▼ for one that starts with `−` (U+2212), else ''. */
export declare function arrowFor(text: unknown): '▲' | '▼' | ''
/** The words either side of the time in `time.synced`, for a tile that hides them when narrow. */
export declare function syncedParts(t: Translate): { pre: string; post: string }
/** Only http:, https:, mailto:, tel: and relative URLs are accepted (RFC 0003 §7). */
export declare function validateHref(raw: unknown, el?: { _uid?: string; localName?: string; getAttribute?(name: string): string | null }): string | null

/** RFC 0003 §7: Tile activation */
export type TsOpenAction = { action: 'open'; id: string }

/** RFC 0003 §7.1: Chart point selection */
export type TsChartSelectAction = {
  action: 'select'
  value: number | string
  series: string
  y: number
  index: number
}

declare global {
  interface HTMLElementEventMap {
    'ts-action': CustomEvent<{ action: string; [k: string]: unknown }>
  }
}
