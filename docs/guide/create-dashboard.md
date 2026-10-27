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
target is left alone. A selector that matches several elements uses the first.
Calling `createDashboard` again on the same target appends a second grid and
leaves the first running, with one development warning; call `destroy()` on the
old one first. Without a DOM (server rendering) it throws
`TypeError('createDashboard needs a DOM')`; importing it there is fine.

| Option | Meaning |
|---|---|
| `layout` | A [`Layout`](../reference/core.md#layouts) or a bare array of items. The grid reads it like any layout, and repairs are reported on `ts-layout-issues`. |
| `data` | Data by item id, assigned to each tile's `data` at creation. An id with no item yet is kept: a later add request for that id (the picker or `grid.add()`) creates the tile with this data. Without `persist` it warns once in development, since the layout is all there is to match. |
| `catalog` | The widget catalog. Default `widgetCatalog()`: the built-ins and every `defineWidget` type. Types registered with `defineWidget` are still found after a catalog you pass. |
| `persist` | The grid's `persist` key. See [saving layouts](saving-layouts.md). Off by default. |
| `locale`, `currency`, `timeZone` | Set on the grid as `locale`, `currency` and `time-zone`; every tile inherits them. |
| `label` | The grid's accessible name. Say what the dashboard is ("Service overview"); the default is the grid's own "Dashboard". |
| `labels` | A title per item id, `{ revenue: 'Revenue', costs: 'Costs' }`, written as the `label` attribute of that id's tile each time the dashboard creates it: at the start, for an add request, for a layout `persist` restores. See [Headings and names](#headings-and-names). |
| `addTypes` | What the picker offers and `ts-add-request` is answered for: a list of types, `'*'` or `null`. Default `'*'`. |

`layout` is required: without it the grid is empty, with one development
warning. It returns `{ grid, set(id, data), update(dataById), destroy() }`.

### Headings and names

The tiles' headings take their level from the grid's `heading-level`, which is
3 by default. A page with an `<h1>` and the dashboard directly under it should
set 2 (RFC 0003 Decision 29), or a screen reader and axe find a skipped level.
`grid` is the real element, so:

```js
dashboard.grid.setAttribute('heading-level', '2')
```

Each tile is named after its catalog entry ("Metric", "Chart"), so two metrics
share a name. Pass `labels`, an object from item id to title, to name them:

```js
createDashboard('#app', { layout, data, labels: { revenue: 'Revenue', costs: 'Costs' } })
```

`labels` is written as the tile's `label` attribute, so it wins over the
widget's `messages`, the grid's, `configure()` and the built-in English, on that
tile only. A host that translates passes translated titles. It is host data, not
part of the layout: nothing is saved with it, and it is read once, so changing
the object later does nothing. Own keys only (`constructor` is an id like any
other). A value that is not a non-empty string, an empty one included, is
ignored with one development warning, and the tile keeps its catalog name. An
id no profile holds is kept for a later add request, and warns unless `persist`
is set, as `data` does. `set()` and `update()` change data, never titles; to
retitle a tile later, set `label` on it:
`dashboard.grid.querySelector('[item="revenue"]').setAttribute('label', 'Revenue')`.

## Tiles

Every item of **every** profile gets one tile, once per id, so switching profile
needs no further code. The tag comes from the item's catalog entry. An item whose
type is not in the catalog is skipped with one development warning. A tag that
is not defined yet still gets its tile, which upgrades when the tag is defined,
with a development warning to import the widget. If `ts-grid` itself is not
defined yet (you imported `createDashboard` without the grid), the layout and
tiles wait until it is.

## Updating

`dashboard.set(id, data)` assigns one tile's data and returns `false` (with a
development warning) for an id it has no tile for; the data is still kept, so a tile added later for that id arrives with it. `dashboard.update(dataById)`
does that for each key of the object and for nothing else, so a polling loop can
send only what changed and every other tile keeps the data it has. Each unknown
id warns once per page, not once per dashboard.

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
