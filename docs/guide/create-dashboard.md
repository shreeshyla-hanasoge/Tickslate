# A dashboard from JSON: `createDashboard()`

For a host with a JSON API and no front-end framework. You describe the
dashboard as a layout plus an object of data; `createDashboard` makes the
`<ts-grid>` and a tile for every item, and you write no DOM code. It is not an
element and registers nothing; it comes with the all-in entry.

```js
import { createDashboard } from 'tickslate/elements'

const { layout, data } = await (await fetch('/api/dashboard')).json()
const dashboard = createDashboard('#app', { layout, data, label: 'Service overview' })

setInterval(async () => {
  const changed = await (await fetch('/api/changes')).json()
  dashboard.update(changed) // { revenue: {...}, usage: {...} }: only these tiles
}, 5000)
```

[`examples/vanilla-json.html`](../../examples/vanilla-json.html) is the whole
thing running: four tiles from `examples/data/sample.json`, refreshed on an
interval. The library does not fetch; you load the JSON and pass the object.

## `createDashboard(target, options)`

`target` is the element to put the grid in, or a CSS selector for it. A selector
that matches nothing throws a `TypeError` naming it. Existing content of the
target is left alone. Without a DOM (server rendering) it throws
`TypeError('createDashboard needs a DOM')`; importing it there is fine.

| Option | Meaning |
|---|---|
| `layout` | A [`Layout`](../reference/core.md#layouts) or a bare array of items. The grid reads it like any layout, and repairs are reported on `ts-layout-issues`. |
| `data` | Data by item id, assigned to each tile's `data` at creation. An id with no item warns in development and is ignored. |
| `catalog` | The widget catalog. Default `widgetCatalog()`: the built-ins and every `defineWidget` type. Types registered with `defineWidget` are still found after a catalog you pass. |
| `persist` | The grid's `persist` key. See [saving layouts](saving-layouts.md). Off by default. |
| `locale`, `currency`, `timeZone` | Set on the grid as `locale`, `currency` and `time-zone`; every tile inherits them. |
| `label` | The grid's accessible name. Say what the dashboard is ("Service overview"); the default is the grid's own "Dashboard". |
| `addTypes` | What the picker offers and `ts-add-request` is answered for: a list of types, `'*'` or `null`. Default `'*'`. |

It returns `{ grid, set(id, data), update(dataById), destroy() }`.

## Tiles

Every item of **every** profile gets one tile, once per id, so switching profile
needs no further code. The tag comes from the item's catalog entry. An item whose
type is not in the catalog is skipped with one development warning. A tag that
is not defined yet still gets its tile, which upgrades when the tag is defined,
with a development warning to import the widget.

## Updating

`dashboard.set(id, data)` assigns one tile's data and returns `false` (with a
development warning) for an id it has no tile for. `dashboard.update(dataById)`
does that for each key of the object and for nothing else, so a polling loop can
send only what changed and every other tile keeps the data it has. Each unknown
id warns once.

## Adding and removing

The dashboard answers the grid's [`ts-add-request`](../reference/events.md)
itself, for the types in `addTypes`: it takes the request with
`preventDefault()` and creates the tile, with the data you gave for that id if
any. So the widget picker and `grid.add()` work with no host code. A type outside
`addTypes` is left alone, so a listener of yours may still take it.

A tile the user removes becomes a hidden child; the dashboard never deletes it.
`set(id, …)` still reaches it, and Add back shows it with the figures it has by
then.

With `persist`, a restored layout may hold ids this page did not start with (a
tile added in an earlier visit). The dashboard creates their tiles when the
grid reads the layout.

## `destroy()`

Removes its listeners and the grid, which stops the grid's persistence and
timers. Calling it twice is fine. Afterwards `set` returns `false` and `update`
does nothing, each with one development warning.

## What it builds on

Only the grid's public surface: `layout`, `catalog`, `addTypes`, the attributes,
the events and the DOM. A host that wants less than the all-in entry can write
the same few lines on that surface.
