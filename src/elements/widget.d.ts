import type { Formatter, Messages, SizeName, Translate, WidgetSpec } from '../core/index.js'

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
  /** Attribute and property, snapped to the widget's supported sizes; defaults to the first supported size. */
  size: SizeName
  /** The size actually rendered. */
  readonly variant: SizeName
  /** The `label` attribute, else the `widget.<catalogKey>.label` message for a catalog widget, else the spec's label ('' when none; the tile is then named by its tag). */
  label: string
  /** Catalog entry, else the validated static spec, else `{ label: '', sizes: [] }`. Subclasses may override. */
  readonly spec: Omit<WidgetSpec, 'tag'>
  /** What the widget takes the time to be. Tests and demos can freeze it. */
  clock: (() => number) | null
  now(): number
  /** Resolved from own attributes, then the nearest <ts-grid>, then configure(); cached. */
  readonly formatter: Formatter
  /** Overrides for this widget's strings; null clears. Assign a new object to change them. */
  messages: Partial<Messages> | null
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

  connectedCallback(): void
  disconnectedCallback(): void
  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void
}

export declare function resolveFormatOptions(
  ...sources: Array<{ getAttribute(name: string): string | null } | null | undefined>
): { locale?: string; currency?: string; timeZone?: string }
export declare function standaloneCss(): string
export declare function escapeHtml(s: unknown): string
export declare const SHARED_CSS: string
/** One skeleton block: width in percent (snapped to 5) or 'x' for an axis label, height in px. */
export declare function sk(width: number | 'x', height: number): string
/** The words either side of the time in `time.synced`, for a tile that hides them when narrow. */
export declare function syncedParts(t: Translate): { pre: string; post: string }

declare global {
  interface HTMLElementEventMap {
    'ts-action': CustomEvent<{ action: string; [k: string]: unknown }>
  }
}
