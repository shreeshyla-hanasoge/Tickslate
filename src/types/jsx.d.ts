/**
 * `import type {} from 'tickslate/jsx'` adds every `ts-*` tag to React's JSX, with its attributes
 * and a typed `data`. Types only: this file imports `react` for its types, which TypeScript erases,
 * and nothing at runtime.
 *
 * Needs @types/react 18.2.6 or later (the `React.JSX` namespace). React 19 sets `data` as a
 * property; React 18 writes attributes only, so set `data` on a ref there. Events are not typed
 * as props: React has no `on` prop for a custom event, so use a ref and `addEventListener`.
 */
import type { DetailedHTMLProps, HTMLAttributes } from 'react'
import type { TsTag, TsAttributes, TsProperties } from './common.js'

type TsJsxProps<K extends TsTag> = Omit<
  DetailedHTMLProps<HTMLAttributes<HTMLElementTagNameMap[K]>, HTMLElementTagNameMap[K]>,
  keyof TsAttributes<K> | keyof TsProperties<K>
> &
  TsAttributes<K> &
  TsProperties<K>

type TsJsxElements = { [K in TsTag]: TsJsxProps<K> }

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends TsJsxElements {}
  }
}

export {}
