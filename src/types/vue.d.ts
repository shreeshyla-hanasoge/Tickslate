/**
 * `import type {} from 'tickslate/vue'` adds every `ts-*` tag to Vue's `GlobalComponents`, so
 * templates check the attributes, `data` and `@ts-…` listeners of each tag. Types only.
 *
 * Tell the compiler the tags are custom elements (`compilerOptions.isCustomElement:
 * (tag) => tag.startsWith('ts-')`), or Vue warns that it cannot resolve them.
 */
import type { HTMLAttributes } from 'vue'
import type { TsTag, TsAttributes, TsProperties, TsEventName } from './common.js'

// `ts-layout-change` becomes `TsLayoutChange`, the form Vue turns `@ts-layout-change` into.
type Pascal<S extends string> = S extends `${infer A}-${infer B}` ? `${Capitalize<A>}${Pascal<B>}` : Capitalize<S>
type TsListeners = { [E in TsEventName as `on${Pascal<E>}`]?: (event: HTMLElementEventMap[E]) => void }

type TsVueProps<K extends TsTag> = Omit<HTMLAttributes, keyof TsAttributes<K> | keyof TsProperties<K>> &
  TsAttributes<K> &
  TsProperties<K> &
  TsListeners

type TsVueComponents = { [K in TsTag]: new () => { $props: TsVueProps<K> } }

declare module 'vue' {
  interface GlobalComponents extends TsVueComponents {}
}

export {}
