# Tickslate in React

Tickslate widgets are custom elements, so React renders them like any tag. The
only React-specific question is how data and events reach them. This recipe
covers React 19 and React 18.

> A working React 19 app is in
> [examples/react-vite](../../../examples/react-vite). CI builds it from the
> packed package and runs it in Chromium, so the React 19 sections below are
> exercised there on every change.

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
`document.querySelector('ts-grid')` is typed. To type the tags in JSX, import
the types-only entry once, anywhere in the project (needs `@types/react`
18.2.6 or later):

```ts
import type {} from 'tickslate/jsx'
```

Every `ts-*` tag then checks its attributes (`size="Huge"` is an error) and
its `data` against the widget's own type.

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
skeleton; pass `null` for the empty state. A boolean attribute takes a
boolean: `<ts-metric activatable />` works in React 19,
which sets the property.

Events: React 19 binds a custom event by its own name behind an `on` prefix, so
`ts-action` is `onts-action`:

```jsx
<ts-grid onts-action={(event) => console.log(event.detail.action)}>…</ts-grid>
```

JSX does not type-check a hyphenated prop, so annotate the event yourself
(`event: CustomEvent`). A ref and `addEventListener` works in every version
(the hook below wraps it) and is the form to use on React 18.

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

The simplest way is the `persist` attribute, `<ts-grid persist="ops-dashboard">`,
which the example uses. `persistLayout` takes the grid element, so call it in an effect and dispose it
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
The tiles upgrade in the browser; until then, `tickslate/tokens.css` makes known
tags reserve their height so the page does not jump. See
[server-side rendering](../ssr.md) and the [Next.js recipe](nextjs.md).

## Notes

- Rendering a chart library's canvas inside `<ts-card>` from React is fine; the
  grid never moves your children. See [bring your own chart](../bring-your-own-chart.md).
- Avoid a new `data` object literal on every render: each assignment re-renders the tile.
