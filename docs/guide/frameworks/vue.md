# Tickslate in Vue 3

## Set up

```bash
npm install tickslate
```

Tell the compiler that `ts-` tags are custom elements, or Vue warns about
"failed to resolve component":

```js
// vite.config.js
import vue from '@vitejs/plugin-vue'

export default {
  plugins: [
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('ts-') } } }),
  ],
}
```

For typed templates, add `import type {} from 'tickslate/vue'` once (for
example in `env.d.ts`). Every `ts-*` tag then checks its attributes, its `data`
and its `@ts-…` listeners. `isCustomElement` is still needed: the types do not
stop Vue trying to resolve the tags as components.

Register the elements once, in your entry file:

```js
import 'tickslate/elements'
import 'tickslate/tokens.css' // optional
```

## Binding data

Vue sets a property when the element has one, which every widget's `data`
does, so a plain binding passes the object:

```vue
<ts-metric label="Signups" size="S" :data="stats" />
```

To force a property in every case (Vue decides by checking `key in element`),
add `.prop`:

```vue
<ts-chart label="Revenue" size="Wide" :data.prop="revenue" />
```

### Objects, and elements that are not defined yet

Vue decides between a property and an attribute by checking `key in element`.
If the element has not been upgraded yet (its script loads after Vue renders,
for example a lazy `import('tickslate/elements')`), `data` is not a property, so
a plain `:data="stats"` sets the attribute `data="[object Object]"`. The tile
then shows its error view, with a development warning, until something sets the
`data` property. Use `.prop`, which assigns the property whatever the element
is; the element applies a value set before it was defined once it upgrades:

```vue
<ts-metric label="Signups" size="S" :data.prop="stats" />
```

Or set `data` from script, which also keeps large objects out of the template:

```js
const metric = ref(null)
onMounted(() => { metric.value.data = stats.value })
```

Use `.prop` on every object or array binding (`data`, `actions`, `messages`),
and a plain binding only for strings and numbers.

`undefined` (not yet loaded) shows the loading skeleton and `null` the empty
state, so a `ref(undefined)` that you fill after a fetch needs no extra
loading flag. For an error, set `error` the same way:
`:error.prop="failed ? 'Could not load' : null"`.

## Events

Custom events bind with `@` and the event's own name:

```vue
<ts-grid @ts-layout-change="onLayout" @ts-edit-change="editing = $event.detail.editing">
  ...
</ts-grid>

<script setup>
function onLayout(event) {
  api.saveLayout(event.detail.layout)
}
</script>
```

Widget actions arrive the same way: `@ts-action="onAction"`, where
`event.detail.action` is `'retry'`, `'range'` and so on.

## Saving layouts

Call `persistLayout` once the grid is mounted, and dispose it with the
component:

```vue
<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { persistLayout } from 'tickslate/elements'

const grid = ref(null)
const stats = ref(undefined)
let saved

onMounted(() => {
  saved = persistLayout(grid.value, { key: 'ops-dashboard' })
})
onBeforeUnmount(() => saved?.dispose())
</script>

<template>
  <ts-grid ref="grid">
    <ts-metric item="signups" label="Signups" size="S" :data="stats" />
    <ts-card item="notes" label="Notes" sizes="S Wide M"><p>Deploy freeze from Friday.</p></ts-card>
  </ts-grid>
</template>
```

`item` ids keep a saved layout matched to the right tile. With `v-for`, bind it
from your own id: `:item="row.id"`.

Rendering tiles conditionally with `v-if` is fine. The grid appends a tile
that joins the DOM and drops one that leaves, and an id the user removed stays
removed until `grid.restore(id)` (or the built-in Add back) brings it back.

## Notes

- Vue never has to move the grid's children, and Tickslate never does either,
  so `v-for` and transitions are safe.
- Teleports and `<KeepAlive>` work; the grid re-measures when it reconnects.
- Slotted content in `<ts-card>` is ordinary Vue template, with its
  `slot="value"` and `slot="footer"` attributes written as plain attributes.
