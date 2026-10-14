# Saving layouts

Users rearrange the grid, so a dashboard that forgets their arrangement on
reload feels broken. `persistLayout` is the one-line fix; the rest of this page
covers what it does in edge cases and how to save somewhere else.

## `persistLayout`

```js
import { persistLayout } from 'tickslate/elements'

const grid = document.querySelector('ts-grid')
const saved = persistLayout(grid, { key: 'ops-dashboard' })
```

- **Load.** It reads the saved layout for the current device and gives it to the
  grid. Nothing saved means nothing changes: an implicit grid (one built from
  its children) stays as written until the first edit is saved.
- **Save.** Every `ts-layout-change` writes `JSON.stringify(event.detail.layout)`
  to `localStorage` under `ops-dashboard:desktop` or `ops-dashboard:phone`.
- **Returns** `{ reset(device?), dispose() }`. `reset()` removes the stored
  layout for the current device (or the one you name) and re-applies its
  defaults. `dispose()` removes the listeners; call it when the grid goes away.

Give every child a stable `item` attribute. In implicit mode the grid writes
generated ids (`metric`, `metric-2`) back, which is fine until you reorder the
markup; your own ids keep saved layouts matched after a refactor.

## Defaults

`defaults` is what a first-time visitor sees, and what `reset()` restores. It
takes the array shorthand, a full layout, or one of each per device:

```js
persistLayout(grid, {
  key: 'ops-dashboard',
  defaults: [
    { id: 'signups', size: 'S' },
    { id: 'revenue', size: 'Wide' },
    { id: 'notes', size: 'M' },
  ],
})
```

## The array shorthand

Wherever a layout is accepted (`grid.layout = …`, `defaults`, `readLayout`),
an array of items works. It becomes a layout with one profile, so you never
have to write `version`, `device` or `profiles`:

```js
grid.layout = [{ id: 'signups', size: 'S' }, { id: 'revenue', size: 'Wide' }]
grid.addEventListener('ts-layout-change', (e) => console.log(e.detail.items))
```

Coming out, `event.detail.items` is the same array shape. Setting `layout`
switches the grid from implicit to explicit mode for good: each child is then
matched to an item by its `item` attribute.

## Per-device layouts

Desktop and phone are stored apart, because a 4-column arrangement means
nothing in 2 columns. The device is `phone` at 2 columns and `desktop`
otherwise, and when the viewport crosses the breakpoint, `persistLayout` loads
the other device's entry. Give each its own defaults:

```js
persistLayout(grid, {
  key: 'ops-dashboard',
  defaults: { desktop: desktopItems, phone: phoneItems }, // phone falls back to desktop
})
```

## Storage that throws

`localStorage` throws in some private windows and when a quota is full.
`persistLayout` catches every read and write: unreadable or unparseable
storage counts as nothing stored, and a failed save is ignored, so the edit
stays on screen and only fails to persist. With no storage at all, only the
defaults are applied. To use another store, pass anything with
`getItem`, `setItem` and `removeItem`:

```js
persistLayout(grid, { key: 'ops-dashboard', storage: window.sessionStorage })
```

For a server, skip `persistLayout` and save from the event instead:

```js
grid.addEventListener('ts-layout-change', (e) => {
  fetch('/api/layout', { method: 'PUT', body: JSON.stringify(e.detail.layout) })
})
```

## `ts-layout-issues`

A saved layout can be stale: it may name a size a tile no longer supports or
repeat an id. Tickslate repairs it, keeps what it can, and fires
`ts-layout-issues` with `{ issues }`, each with a `path`, a `code`, a
message and what was `fixed`. Attach the listener before calling
`persistLayout`, which sets the layout straight away:

```js
grid.addEventListener('ts-layout-issues', (e) => console.warn(e.detail.issues))
persistLayout(grid, { key: 'ops-dashboard' })
```

An item whose widget isn't registered yet is kept, not dropped, so a saved
layout survives a tile whose script loads late.

## Undo

While editing, Ctrl or Cmd+Z undoes up to 20 steps per profile, and removing a
tile shows an Undo toast for 6 seconds. From code, `grid.undo()` returns
`false` when there is nothing to undo. An undo fires `ts-layout-change` with
`reason: 'undo'` and an empty `id`, so it is saved like any other edit. Setting
`grid.layout` yourself clears the history.

## An Add back menu in five lines

Removed tiles stay in the DOM as `grid.hiddenItems`, and `grid.restore(id)`
puts one back. The built-in pill already offers this; to build your own, set
`edit-controls="off"` on the grid and render a list:

```js
const menu = document.querySelector('#add-back')
const refresh = () => menu.replaceChildren(...grid.hiddenItems.map((h) =>
  Object.assign(document.createElement('button'), { textContent: `Add ${h.label}`, onclick: () => grid.restore(h.id) })))
grid.addEventListener('ts-layout-change', refresh)
refresh()
```

`restore(id)` returns `false` when no hidden tile has that id, restores the tile
at its declared size (or its first supported one), records an undo step and
fires `ts-layout-change` with `reason: 'add'`, so the menu refreshes itself.
