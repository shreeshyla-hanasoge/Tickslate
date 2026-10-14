# Tickslate in React

Tickslate widgets are custom elements, so React renders them like any tag. The
only React-specific question is how data and events reach them. This recipe
covers React 19 and React 18.

> **To be verified.** The property and event behaviour below follows
> [RFC 0001 §10](../../rfc/0001-api.md) and React's documented custom element
> support. It has not yet been run in a scratch app; consumer-examples will
> confirm it. The `onts-action` form is marked where it appears.

## Set up

```bash
npm install tickslate
```

Import the elements once, near your app's entry, so they register before the
first render:

```jsx
import 'tickslate/elements'
import 'tickslate/tokens.css' // optional: the tiles carry their own defaults
```

For TypeScript, `tickslate/elements` augments `HTMLElementTagNameMap`, so
`document.querySelector('ts-grid')` is typed. To type the tags in JSX, add a
declaration once (the exact shape depends on your `@types/react`):

```ts
// tickslate-jsx.d.ts
import type { TsGrid, TsMetric, TsCard } from 'tickslate/elements'
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ts-grid': React.DetailedHTMLProps<React.HTMLAttributes<TsGrid>, TsGrid>
      'ts-metric': React.DetailedHTMLProps<React.HTMLAttributes<TsMetric>, TsMetric>
      'ts-card': React.DetailedHTMLProps<React.HTMLAttributes<TsCard>, TsCard>
    }
  }
}
```

## React 19

React 19 sets a property, not an attribute, when the element defines one, so
objects pass straight through:

```jsx
import 'tickslate/elements'

export function Signups({ stats }) {
  return <ts-metric label="Signups" size="S" data={stats} />
}
```

`stats` is `undefined` until your fetch resolves, which shows the loading
skeleton; pass `null` for the empty state. Boolean attributes such as `locked`
are strings in JSX: `<ts-grid locked="" />`.

Events: use a ref and `addEventListener`, which works in every version (the
next section's hook wraps it). React 19 can also bind custom events with an
`on` prefix, `onts-layout-change={handler}`; this form is **to be verified**
and the ref form below is the safe choice.

## React 18 (and 19)

React 18 passes everything to custom elements as attributes, which turns an
object into `"[object Object]"`. Set properties from an effect instead:

```jsx
import { useEffect, useRef } from 'react'
import 'tickslate/elements'

export function Signups({ stats }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current.data = stats
  }, [stats])
  return <ts-metric ref={ref} label="Signups" size="S" />
}
```

## Events with a `useTsEvent` hook

```jsx
import { useEffect, useRef } from 'react'

export function useTsEvent(ref, name, handler) {
  // Keep the latest handler without re-subscribing on every render.
  const latest = useRef(handler)
  latest.current = handler
  useEffect(() => {
    const el = ref.current
    const listener = (e) => latest.current(e)
    el.addEventListener(name, listener)
    return () => el.removeEventListener(name, listener)
  }, [ref, name])
}
```

## Saving layouts

`persistLayout` takes the grid element, so call it in an effect and dispose it
on cleanup:

```jsx
import { useEffect, useRef } from 'react'
import { persistLayout } from 'tickslate/elements'

export function Dashboard({ stats, revenue }) {
  const grid = useRef(null)
  useEffect(() => {
    const saved = persistLayout(grid.current, { key: 'ops-dashboard' })
    return () => saved.dispose()
  }, [])

  return (
    <ts-grid ref={grid}>
      <ts-metric item="signups" label="Signups" size="S" data={stats} />
      <ts-chart item="revenue" label="Revenue" size="Wide" data={revenue} />
    </ts-grid>
  )
}
```

Give every child a stable `item` so a saved layout still matches it after a
refactor. React Strict Mode runs effects twice in development; the dispose in
the cleanup keeps that harmless.

To save somewhere else, such as your API, listen instead:

```jsx
useTsEvent(grid, 'ts-layout-change', (e) => api.saveLayout(e.detail.layout))
```

## Server-side rendering

Importing `tickslate/elements` where there is no DOM registers nothing and
does not throw, so Next.js and Remix can import it from a server component.
The tiles upgrade in the browser; until then, known tags reserve their height
so the page does not jump.

## Notes

- Rendering a chart library's canvas inside `<ts-card>` from React is fine; the
  grid never moves your children. See [bring your own chart](../bring-your-own-chart.md).
- Avoid a new `data` object literal on every render: each assignment re-renders the tile.
