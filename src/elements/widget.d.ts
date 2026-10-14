import type { Formatter, SizeName } from '../core/index.js'

/** The context a view model receives. */
export interface ViewModelContext {
  /** Whatever the element's viewContext() adds. */
  [extra: string]: unknown
  fmt: Formatter
  /** The time in ms: `clock()` if set, else `Date.now()`. */
  now: number
  /** The effective label: the `label` attribute, else the catalog label. */
  label: string
}

/** Base class of every Tickslate widget (RFC 0001 §8.1). See the header of widget.js for the full contract. */
export declare class TsWidget<Data = unknown, ViewModel extends { ariaLabel?: string } = { ariaLabel?: string }> extends HTMLElement {
  /** The key in the core's WIDGETS catalog: supplies supported sizes and the default label. */
  static catalogKey: string | null
  /** CSS for the widget's own content, appended after the shared CSS. Tokens only. */
  static styles: string
  /** Static markup for one variant, built once per variant. */
  static template(variant: SizeName): string
  /** Pure: data to display strings and numbers. Throwing shows the empty state. */
  static viewModel(data: any, variant: SizeName, ctx: ViewModelContext): { ariaLabel?: string } & Record<string, unknown>
  static get observedAttributes(): string[]

  /** Setting it schedules one render per microtask. null or undefined shows the empty state. */
  data: Data | null | undefined
  /** Attribute and property, snapped to the widget's supported sizes; defaults to the first supported size. */
  size: SizeName
  /** The size actually rendered. */
  readonly variant: SizeName
  /** The `label` attribute, else the catalog label. */
  label: string
  /** What the widget takes the time to be. Tests and demos can freeze it. */
  clock: (() => number) | null
  now(): number
  /** Resolved from own attributes, then the nearest <ts-grid>, then configure(); cached. */
  readonly formatter: Formatter

  /** The first match in the shadow root, cached until the template is rebuilt. */
  $<T extends Element = HTMLElement>(selector: string): T | null
  requestRender(): void
  /** Re-render every `ms` while connected and the page is visible; 0 stops. */
  every(ms: number): void
  /** Dispatch a bubbling, composed 'ts-action' event. Returns false if cancelled. */
  emit(action: string, detail?: Record<string, unknown>): boolean
  /** Re-apply properties set before the element was defined. */
  upgrade(...names: string[]): void

  /** Extra keys for the view model's ctx (an attribute, say). fmt, now and label can't be replaced. */
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

declare global {
  interface HTMLElementEventMap {
    'ts-action': CustomEvent<{ action: string; [k: string]: unknown }>
  }
}
