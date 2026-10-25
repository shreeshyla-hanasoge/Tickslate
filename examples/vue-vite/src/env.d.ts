/// <reference types="vite/client" />
// Types every ts-* tag in templates: attributes, a typed `data`, and @ts-… listeners.
// Types only; it adds no code to the bundle.
import type {} from 'tickslate/vue'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
