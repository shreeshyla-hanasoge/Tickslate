/**
 * `import type {} from 'tickslate/svelte'` adds every `ts-*` tag to `svelteHTML.IntrinsicElements`,
 * so svelte-check types its attributes, `data` and `on:ts-…` events. Types only: it needs no
 * `svelte` import, because it only adds to the `svelteHTML` namespace that svelte-check provides.
 */
import type { TsTag, TsAttributes, TsProperties, TsEventName } from './common.js'

// What any element takes. A tag with an entry of its own gets no catch-all, so these are listed here.
interface TsSvelteGlobals {
  id?: string
  class?: string
  style?: string
  slot?: string
  title?: string
  hidden?: boolean
  role?: string
  tabindex?: number
  [attr: `data-${string}`]: unknown
  [attr: `aria-${string}`]: string | undefined
}

type TsSvelteProps<K extends TsTag> = Omit<TsSvelteGlobals, keyof TsAttributes<K>> &
  TsAttributes<K> &
  TsProperties<K> & { [E in TsEventName as `on:${E}`]?: (event: HTMLElementEventMap[E]) => void }

type TsSvelteElements = { [K in TsTag]: TsSvelteProps<K> }

declare global {
  namespace svelteHTML {
    interface IntrinsicElements extends TsSvelteElements {}
  }
}

export {}
