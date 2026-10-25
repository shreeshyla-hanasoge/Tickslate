# Tickslate in Nuxt

Nuxt renders on the server, and custom elements only exist in the browser. So:
tell Vue the `ts-` tags are custom elements, register the elements from a
client plugin, load the stylesheet from `nuxt.config.ts`, and bind object props
with `.prop`. Read [server-side rendering](../ssr.md) first for why. This
recipe is written for Nuxt 3 and later (Vue 3).

## Set up

```bash
npm install tickslate
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  // In the server-rendered <head>, so the pre-upgrade rules reserve each tile's space.
  css: ['tickslate/tokens.css'],
  vue: {
    compilerOptions: {
      // Without this Vue warns "failed to resolve component: ts-grid".
      isCustomElement: (tag) => tag.startsWith('ts-'),
    },
  },
})
```

Register the elements from a client-only plugin. The `.client.ts` suffix keeps
it out of the server render:

```ts
// plugins/tickslate.client.ts
import 'tickslate/elements'

export default defineNuxtPlugin(() => {})
```

For typed templates, add `import type {} from 'tickslate/vue'` once in a `.d.ts`
file or a plugin. See the [Vue recipe](vue.md).

## A page

```vue
<!-- pages/index.vue -->
<script setup lang="ts">
import type { MetricData } from 'tickslate/elements'

// Runs on the server and the client; the result is passed to the client in the payload.
const { data: signups } = await useAsyncData<MetricData>('signups', () => $fetch('/api/signups'))
</script>

<template>
  <ts-grid persist="ops-dashboard">
    <ts-metric item="signups" label="Signups" size="S" :data.prop="signups" />
    <ts-card item="notes" label="Notes" sizes="S Wide M"><p>Deploy freeze from Friday.</p></ts-card>
  </ts-grid>
</template>
```

Use `.prop` on every object or array binding. The server leaves an object out
of the HTML either way (checked with Vue's server renderer), so no
`[object Object]` reaches the page. On the client, `.prop` assigns the property
whether or not the element has upgraded yet, which a plain `:data` does not
when the elements load after hydration.

## `<ClientOnly>`

The grid and its tiles can be rendered on the server (they are plain tags, and
the stylesheet reserves their space), so `<ClientOnly>` is not required. Use it
only if you want the dashboard to appear all at once rather than as
placeholders that upgrade; give it a `#fallback` of the right height:

```vue
<ClientOnly>
  <ts-grid persist="ops-dashboard">…</ts-grid>
  <template #fallback><div style="min-height: 480px" /></template>
</ClientOnly>
```

## Events and layouts

`@ts-layout-change` and `@ts-action` work as in the [Vue recipe](vue.md). Call
`persistLayout(grid.value, …)` inside `onMounted`, which runs in the browser
only; the `persist="…"` attribute needs no code at all.
