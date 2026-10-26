# Saving layouts

Users rearrange the grid, so a dashboard that forgets their arrangement on
reload feels broken. `persistLayout` is the one-line fix; the rest of this page
covers what it does in edge cases and how to save somewhere else.

## The `persist` attribute

For `localStorage` there is no script to write: name a key on the grid.

```html
<ts-grid persist="ops-dashboard">
  <ts-metric item="signups" label="Signups" size="S"></ts-metric>
</ts-grid>
```

The grid saves each edit per device and restores it on the next visit. The
layout it has once its device is known is what a device with nothing saved
shows, so an implicit grid keeps tiles that arrive late. `grid.persist`
reflects the attribute; changing or removing it re-keys or stops saving, and a
grid taken off the page stops saving until it is put back. `persist=""` is off,
with one development warning.

In development builds, the first edit to a grid that nothing saves warns that
the arrangement will be lost on reload and links to this page. Setting
`persist`, or calling `persistLayout()`, silences it, and a locked grid never
warns. Using both on one grid works but says so once in development.

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

## Limits

A saved layout is user data, so it is read with limits: 100 items per profile,
20 profiles (`market` and `closed` always among them) and 128 characters per
id. What is over a limit is dropped and reported as `too-many-items`,
`too-many-profiles` or `bad-shape` in `ts-layout-issues`. The grid and
`persistLayout` always apply them; only a direct `readLayout` call can change
them, with `maxItems` and `maxProfiles`.

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

## Device-specific tile sets

Each device's layout lists its own tiles. A tile that is in the desktop layout
and not in the phone layout is not drawn on a phone: it stays in the DOM, hidden,
and `grid.hiddenItems` lists it so Add back can offer it. So a phone can show
three tiles where the desktop shows eight. Give each device the items it should
show through `defaults`:

```js
persistLayout(grid, {
  key: 'ops-dashboard',
  defaults: {
    desktop: [{ id: 'signups', size: 'S' }, { id: 'revenue', size: 'Wide' }, { id: 'notes', size: 'M' }],
    phone: [{ id: 'signups', size: 'S' }, { id: 'revenue', size: 'Wide' }],
  },
})
```

Edits on one device never change the other's set.

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

## Saving to a server: `LayoutAdapter`

Pass an `adapter` instead of `key` and `storage`. It has `load(device)`,
`save(device, layout)` and an optional `remove(device)`, and each may return a
promise:

```js
persistLayout(grid, {
  adapter: {
    load: (device) => fetch(`/api/layout/${device}`).then((r) => (r.ok ? r.json() : null)),
    save: (device, layout) => fetch(`/api/layout/${device}`, { method: 'PUT', body: JSON.stringify(layout) }),
    remove: (device) => fetch(`/api/layout/${device}`, { method: 'DELETE' }),
  },
  defaults: [{ id: 'signups', size: 'S' }],
})
```

- An adapter needs no `key`, and wins over `storage`.
- While `load` is pending the grid shows its defaults. A result that arrives
  after the device changed, after `reset()` or `dispose()`, after a later load
  started, or after the user edited is ignored.
- An adapter never throws out of the grid. A `load` that rejects, throws or
  returns something that is not a layout counts as nothing stored, and a failing
  `save` or `remove` leaves the edit on screen. Each case logs one development
  warning.

To keep full control instead, skip `persistLayout` and save from the event:

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
