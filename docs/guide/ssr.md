# Server-side rendering

Tickslate widgets are custom elements, and a custom element is a browser
feature: it upgrades when its script runs in a page. Server rendering therefore
never produces a finished tile. It produces a placeholder that the browser
upgrades, and this guide covers keeping that placeholder tidy.

## Importing is safe on the server

Importing `tickslate` or `tickslate/elements` where there is no DOM (Node, an
edge runtime, a server component) registers nothing and throws nothing. So an
import at the top of a shared module will not break a server render.

What does not work on the server is anything that needs an element: reading
`el.data`, calling `grid.add()`, or `persistLayout(grid, …)`. Those belong in
code that only runs in the browser: an effect, `onMounted`, `onMount`, or a
client-only component.

## Load the elements in the browser only

Register the elements from client code, so the server bundle stays free of
them and the registration happens once in the browser:

- **Plain script or CDN.** A `<script type="module">` or the one-file
  `tickslate/cdn/tickslate.iife.js` runs only in the browser.
- **A framework with server rendering.** Import `tickslate/elements` from a
  client-only module: a `'use client'` component in Next.js, a `.client.ts`
  plugin in Nuxt, `onMount` in SvelteKit. The recipes for
  [Next.js](frameworks/nextjs.md) and [Nuxt](frameworks/nuxt.md) show both.

Prefer the narrow entries (`tickslate/elements/grid`,
`tickslate/elements/metric`, …) in a client module for pages that use a few
widgets: each registers exactly one tag.

## Reserve the space before the upgrade

Until the script runs, `<ts-grid>` and its tiles are unknown tags: unstyled
inline elements, which would collapse the page and then jump when the elements
upgrade. `tickslate/tokens.css` handles that. While a tag is not yet defined:

- `ts-grid:not(:defined)` is a block one row tall (`--ts-row`, 150px by
  default), and its children are hidden;
- a known widget tag standing alone reserves one row of height, or two for the
  sizes M, Tall, L and XL.

So load the stylesheet in the server-rendered `<head>`, not from the client
script, or the placeholder rules arrive too late to help:

```js
// Next.js: app/layout.tsx          Nuxt: nuxt.config.ts, css: ['tickslate/tokens.css']
import 'tickslate/tokens.css'
```

The rules have zero specificity (`:where()`), so your own CSS for the same
selectors always wins. To reserve a taller grid, set the height yourself:

```css
ts-grid:not(:defined) { min-height: 480px; }
```

## What to render on the server

Render the tags, with their attributes, and leave the data to the client:

```html
<ts-grid persist="ops-dashboard">
  <ts-metric item="signups" label="Signups" size="S"></ts-metric>
  <ts-chart item="revenue" label="Revenue" size="Wide"></ts-chart>
</ts-grid>
```

- **Strings and numbers** are safe as attributes: `label`, `size`, `item`,
  `locale`, `currency`.
- **Objects** are set as the `data` property once the framework hydrates. If
  you do have the data on the server and want a first paint, put it in the
  `data` attribute as escaped JSON; see [server templates](server-templates.md).
  The property wins as soon as the client assigns it.
- **Without data**, a tile shows its loading skeleton once upgraded, which is
  what you want while a client fetch is in flight.

## Hydration

The server HTML and the first client render must agree, or the framework warns
about a mismatch. Two things make that easy to keep:

- Tickslate changes the DOM only after the elements upgrade, which happens
  from the client script and after hydration begins. Its shadow content is
  never part of the server HTML, so there is nothing for the framework to
  compare it with.
- The grid sets `translate`, `width` and `height` styles on the tiles and an
  `item` attribute where one is missing. Render the `item` yourself, so what
  the server sent and what the client renders match, and treat the styles as
  Tickslate's: a framework that re-renders a tile does not remove them.

Do not put anything that differs between server and client (the current time,
a random id) in an attribute of a tile. Fetch it in an effect and pass it in as
`data`.

## Layouts and `persist`

`persist` reads `localStorage` in the browser when the grid connects, so a
server render always shows the default layout and the saved one applies after
the upgrade. The tiles are placed in a frame, not animated, so the move is
quick, but it is a visible change. If that matters, keep the layout on the
server and pass it in with a [storage adapter](saving-layouts.md) rather than
relying on `localStorage`.

## Examples

`examples/` has a minimal app per framework, built in CI from the packed
package: [React](../../examples/react-vite), [Vue](../../examples/vue-vite),
[Svelte](../../examples/svelte-vite) and
[a plain script tag](../../examples/vanilla-cdn). They are client-rendered Vite
apps; the SSR pattern above is the same wherever the framework renders.
