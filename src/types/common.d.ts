/**
 * What the three framework entries share: the tag list and each tag's props, read from the
 * element declarations rather than written out, so an element added later is typed in React, Vue
 * and Svelte with no edit here. Types only: nothing in src/types/ is imported at runtime.
 */
import type { TsWidget, TsWidgetAttributes, TsElementAttributes } from '../elements/index.js'

/** Every `ts-*` tag the loaded declarations know: the built-ins, and a host's own once it adds one to `HTMLElementTagNameMap`. */
export type TsTag = Extract<keyof HTMLElementTagNameMap, `ts-${string}`>

type Extra<K> = K extends keyof TsElementAttributes ? TsElementAttributes[K] : {}

/** The attributes a tag takes: the widget base's, then its own (which win). */
export type TsAttributes<K extends TsTag> = HTMLElementTagNameMap[K] extends TsWidget<any, any>
  ? Omit<TsWidgetAttributes, keyof Extra<K>> & Extra<K>
  : Extra<K>

/**
 * The properties worth setting from a template: `data` in the widget's own type (so a wrong key
 * fails), and `actions`. A JSON string is accepted too, as the `data` attribute takes one.
 */
export type TsProperties<K extends TsTag> = HTMLElementTagNameMap[K] extends TsWidget<infer D, any>
  ? { data?: D | string | null | undefined; actions?: readonly string[] | undefined }
  : {}

/** Every `ts-*` event name on `HTMLElementEventMap`, such as `ts-layout-change`. */
export type TsEventName = Extract<keyof HTMLElementEventMap, `ts-${string}`>
