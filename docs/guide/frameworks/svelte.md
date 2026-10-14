# Tickslate in Svelte

This recipe is written for Svelte 5 and works the same in Svelte 4 with the
differences noted. Svelte treats any tag with a dash as a custom element, so no
compiler setting is needed.

## Set up

```bash
npm install tickslate
```

```js
// src/main.js, or a +layout.svelte script (client side)
import 'tickslate/elements'
import 'tickslate/tokens.css' // optional
```

With SvelteKit, import the elements in a layout. Importing them during
server rendering is safe: where there is no DOM they register nothing.

## Binding data

Svelte sets a property when the element has one, so objects pass through:

```svelte
<script>
  let stats = $state(undefined) // undefined shows the loading skeleton
  fetch('/api/signups').then((r) => r.json()).then((d) => (stats = d))
</script>

<ts-metric label="Signups" size="S" data={stats}></ts-metric>
```

Use `null` for the empty state and `error="Could not load"` for the error view.
In Svelte 4, `let stats` and plain assignment do the same.

## Events

Bind with `bind:this` and `addEventListener` in an effect. It works in every
Svelte version and cleans up after itself:

```svelte
<script>
  let grid
  $effect(() => {
    const onChange = (e) => api.saveLayout(e.detail.layout)
    grid.addEventListener('ts-layout-change', onChange)
    return () => grid.removeEventListener('ts-layout-change', onChange)
  })
</script>

<ts-grid bind:this={grid}>
  <ts-metric item="signups" label="Signups" size="S"></ts-metric>
</ts-grid>
```

In Svelte 4, use `onMount` and return the cleanup from it. Svelte 5 also lets
you write `onts-layout-change={handler}` on the element; the effect form above
is the one that needs no assumptions.

## Saving layouts

```svelte
<script>
  import { onMount } from 'svelte'
  import { persistLayout } from 'tickslate/elements'

  let grid
  onMount(() => {
    const saved = persistLayout(grid, { key: 'ops-dashboard' })
    return () => saved.dispose()
  })
</script>

<ts-grid bind:this={grid}>
  <ts-metric item="signups" label="Signups" size="S" data={stats}></ts-metric>
  <ts-card item="notes" label="Notes" sizes="S Wide M"><p>Deploy freeze from Friday.</p></ts-card>
</ts-grid>
```

`onMount` runs only in the browser, which is also what you want under
SvelteKit's server rendering. Give every tile a stable `item` so a saved layout
matches it later.

## Tiles from a list

An `{#each}` block is fine; key it by the same id you give `item`:

```svelte
<ts-grid>
  {#each metrics as m (m.id)}
    <ts-metric item={m.id} label={m.label} size="S" data={m.data}></ts-metric>
  {/each}
</ts-grid>
```

A tile added to the list is appended to the layout, and one removed from the
list leaves it.

## Notes

- Slotted content for `<ts-card>` is plain Svelte markup; put
  `slot="value"` or `slot="footer"` on the element as an attribute.
- Bring your own chart into a `<ts-card>` from `onMount`, and destroy it in the
  returned cleanup: see [bring your own chart](../bring-your-own-chart.md).
