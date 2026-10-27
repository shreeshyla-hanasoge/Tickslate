# Events

Tickslate fires nine events, all named `ts-*`. Every one is a `CustomEvent`
that **bubbles and is composed**, so one listener on the grid, a wrapper or the
document hears it, even from inside a shadow root. Only `ts-action` and
`ts-add-request` are cancelable: `preventDefault()` on `ts-action` stops the
widget's built-in follow-up (an equity curve keeps its old `range`), and on
`ts-add-request` it says the host will answer. On the others it changes nothing.

| Event | Fired by | `detail` | Bubbles | Composed |
|---|---|---|---|---|
| [`ts-action`](#ts-action) | any widget | `{ action: string, ...extra }` | yes | yes |
| [`ts-layout-change`](#ts-layout-change) | `<ts-grid>` | `TsLayoutChangeDetail` | yes | yes |
| [`ts-layout-issues`](#ts-layout-issues) | `<ts-grid>` | `{ issues: LayoutIssue[] }` | yes | yes |
| [`ts-edit-change`](#ts-edit-change) | `<ts-grid>` | `{ editing: boolean }` | yes | yes |
| [`ts-reading-order-change`](#ts-reading-order-change) | `<ts-grid>` | `{ order: string[] }` | yes | yes |
| [`ts-columns-change`](#ts-columns-change) | `<ts-grid>` | `{ columns, device, initial }` | yes | yes |
| [`ts-profile-change`](#ts-profile-change) | `<ts-grid>` | `{ profile, reason }` | yes | yes |
| [`ts-add-request`](#ts-add-request) | `<ts-grid>` | `{ type, id, size }` | yes | yes |
| [`ts-hint-dismiss`](#ts-hint-dismiss) | `<ts-grid>` | `{ reason }` | yes | yes |

The types are in the package's `.d.ts` files, so
`grid.addEventListener('ts-layout-change', (e) => ...)` is typed.

Widgets only tell you what the user did. They never fetch, save or navigate;
what happens next is your code.

## `ts-action`

A widget's way of asking the host to do something. Fired from the widget
element (the event's `target` is the tile), so a listener on `<ts-grid>` or the
document hears every tile and tells them apart with `e.target` or its `item`
attribute.

```ts
interface TsActionDetail {
  /** Which action: 'retry', 'range', or a name of your own widget's. */
  action: string
  /** Whatever the widget adds for that action. */
  [key: string]: unknown
}
```

| `action` | Fired by | When | Extra detail |
|---|---|---|---|
| `retry` | every widget | The user presses Retry in the error view. The button only exists when the widget's `actions` includes `'retry'` | none |
| `range` | `<ts-equity-curve>` | The user presses a range button at `XL` and the range changes. The element's `range` is already updated | `value`: `'1W'`, `'1M'`, `'3M'`, `'YTD'` or `'All'` |
| `sort` | `<ts-table>` | The user activates a sortable column header. The table has already re-sorted; send the same `sort` back in `data` to remember it | `value`: the column key, `dir`: `'asc'` or `'desc'` |
| `add-instrument` | `<ts-watchlist>` | The user presses the add button in the header, and `actions` includes `'add-instrument'`. The widget has no form of its own: show yours, then send the new `instruments` in `data` | none |
| `open` | any widget with `activatable` | The user activates the tile. The whole tile is the target, not only the label, so a click on a chart or a cell counts; route it to a page other than the one the tile is on | `id`: the tile's `item` attribute, `''` without one |
| `exit-position` | `<ts-open-positions>` | The user presses a row's Exit button, and `actions` includes `'exit-position'`. Nothing is closed or removed by the widget: place the order, then send the new `positions` | `id`: the position's id, as given |
| `exit-all` | `<ts-open-positions>` | The user presses Exit all, and `actions` includes `'exit-all'`. The button only shows while a position is open | none |
| `rebalance` | `<ts-capital-funding>` | The user presses an account's Rebalance button, and `actions` includes `'rebalance'`. Nothing is moved by the widget: show your own flow, then send the new `accounts` | `id`: the account's id, as given |
| `select` | `<ts-table>`, `<ts-chart>` | The user activates a row, or a chart point, and `actions` includes `'select'` | A table sends `id`, the row's id as given; a chart sends `value`, `series`, `y` and `index` |
| `timeframe` | `<ts-mini-chart>` | The user presses a timeframe button at `L`, and `actions` includes `'timeframe'`. Nothing changes in the widget: send the new `bars` and `timeframe` in `data` | `id`: the chart's id, `value`: the timeframe pressed, as listed in `timeframes` |

```js
document.addEventListener('ts-action', (e) => {
  if (e.detail.action === 'retry') reload(e.target)
})
```

A widget you write fires its own with `this.emit('name', { ...detail })`; see
[Your own widget](../guide/your-own-widget.md).

## `ts-layout-change`

The user changed the layout. `detail.layout` is the whole layout after the
edit: **save this**. Fired by the grid for the user's moves, resizes, removes,
Add back and undo, never for a `layout` you set yourself.

```ts
interface TsLayoutChangeDetail {
  /** The whole layout after the edit; save this. */
  layout: Layout
  /** layout.profiles[profile], for hosts that don't use profiles. */
  items: LayoutItem[]
  /** The layout before the edit. */
  previous: Layout
  /** The profile that was edited. */
  profile: string
  reason: 'move' | 'resize' | 'remove' | 'add' | 'undo'
  /** The item moved, resized, removed or added back. '' for 'undo'. */
  id: string
  /** On 'remove': the item's index in the profile before it went. On 'add': its index after it came back. */
  index?: number
  /** On 'remove': the item that was removed. On 'add': the item as restored. */
  item?: LayoutItem
}
```

| `reason` | When | `id` |
|---|---|---|
| `move` | A tile was dropped in a new place (drag, keyboard or tap to place). Once, on the drop, and only if the order changed | The tile |
| `resize` | A tile's size changed (drag, `+` or `-`, or the resize button) | The tile |
| `remove` | A tile was removed | The tile; `index` and `item` are set |
| `add` | `restore(id)` or Add back brought a hidden tile back. `index` and `item` are set (its place and entry after the restore) | The tile |
| `undo` | `undo()`, the toast's Undo button or Ctrl or Cmd+Z. It restores a whole profile, so compare `previous` and `layout` for the difference | `''` |

`persistLayout` listens to this event to save. Items whose widget the grid
cannot find are kept in `layout`, so saving it loses nothing.

## `ts-layout-issues`

You set `layout` or `catalog` and `readLayout` had to repair something. The
grid shows the repaired layout; this tells you what changed. It does not fire
for the grid's own edits or for implicit seeding.

```ts
interface LayoutIssue {
  /** Where in the input, e.g. 'profiles.market[3].size'. '' for the whole layout. */
  path: string
  code:
    | 'unknown-version' | 'unknown-widget' | 'unsupported-size' | 'duplicate-id'
    | 'bad-shape' | 'top-strip-too-long' | 'top-strip-unknown-id'
    | 'too-many-items' | 'too-many-profiles'
  message: string
  fixed: 'dropped' | 'replaced' | 'migrated' | 'kept'
}
// detail: { issues: LayoutIssue[] }
```

## `ts-edit-change`

Edit mode started or ended, whether by long press, the Edit layout button, Done,
Escape, an outside tap, or your code setting `editing`.

```ts
// detail
{ editing: boolean }
```

Setting `editing = true` on a locked grid is reverted and fires nothing.

## `ts-reading-order-change`

The order of the grid's visible tiles changed, so reading and Tab order, which
follow it (see [`<ts-grid>`](../widgets/ts-grid.md#accessibility)), now differ
from before. It fires when the list of ids differs from the last one told of:
when Done ends an edit that moved or removed tiles, when you set a `layout`
after the first, when the column count changes, or when a tile appears or goes.

It does not fire for:

- **The first order.** That is the first order with a tile in it after the grid
  connects, which `grid.readingOrder` already reports. A grid that connects
  empty and is then given its children has not been rearranged.
- **The host's first `layout`.** Setting `layout` for the first time, before
  the user has edited, replaces the order the children made. That is setting
  up, so the new order is taken without an event. A later `layout` fires it,
  and so does a first one set after the user's first edit.
- **The middle of an edit.** While tiles are held and moved the order is not
  read (tiles are inert and the edit handles carry Tab), so nothing fires
  until Done. `readingOrder` drops a tile removed meanwhile at once, and a
  removal still counts as a change, told at Done.

At Done the event fires before `ts-edit-change`.

```ts
// detail
{
  /** The visible tiles' ids, row by row and left to right by each tile's top-left cell. */
  order: string[]
}
```

The grid reports this order even where the browser lacks manual slot
assignment (below Safari 16.4, or a declarative shadow root without
`shadowrootslotassignment="manual"`). There the grid keeps one slot, so Tab and
reading order follow your DOM order, and a tile whose own `slot` attribute is
anything but `empty` is not rendered.

## `ts-columns-change`

The grid's column count changed, and once after its first measure
(`initial: true`), so a host learns the device without measuring the grid. The
first event can fire before your listener exists if the grid is already
connected; read `grid.columns` too.

```ts
// detail
{
  columns: 2 | 3 | 4
  /** 'phone' at 2 columns, else 'desktop'. */
  device: 'desktop' | 'phone'
  /** true once, after the first measure. */
  initial: boolean
}
```

`persistLayout` uses it to load the layout for the right device.

## `ts-profile-change`

The profile on show changed because of the schedule or `override()`. Not
fired when you change the `profile` attribute yourself. It does fire when a
schedule set at load puts the grid straight into another profile (the
announcement is skipped then, the event is not). It fires once the new layout
is on the board, so a handler reading `grid.readingOrder` sees the layout it
was told about; for a scheduled switch that is half-way through the crossfade,
about 110 ms after the profile changed.

```ts
// detail
{
  profile: string
  /** 'schedule': the clock crossed an open or close. 'override': override(name). 'override-ended': override(null), or the override ran out. */
  reason: 'schedule' | 'override' | 'override-ended'
}
```

## `ts-add-request`

The grid wants a new tile and children belong to you, so it asks. It fires from
`grid.add({ type, id?, size? })`, which the widget picker calls when a user
chooses a catalog type. It is **cancelable**, and cancelling it is the answer
"I'll render that".

```ts
// detail
{
  /** The catalog key. */
  type: string
  /** The item id the child you render must carry. */
  id: string
  /** The size the grid will place it at. */
  size: SizeName
}
```

```js
grid.addTypes = ['card', 'metric'] // the picker offers only these
grid.addEventListener('ts-add-request', (e) => {
  e.preventDefault() // you will answer
  const el = document.createElement(e.detail.type === 'card' ? 'ts-card' : 'ts-metric')
  el.setAttribute('item', e.detail.id)
  grid.append(el) // in a framework: render a child with item={id}
})
```

- Not calling `preventDefault()` means nobody handled it: `add()` returns `null`
  and development warns once.
- The grid expects the child within 10 seconds. When it appears the grid places
  it at `size`, records an undo step, announces it and fires `ts-layout-change`
  with reason `'add'`. If none appears the request is forgotten, with one
  development warning.
- A hidden child with the same `id` is restored instead, and no event fires.
- `grid.addTypes` is only for the picker, which offers catalog types it knows
  you answer. A host that calls `add()` from its own button has already decided.

## `ts-hint-dismiss`

The first-run hint (the `hint` attribute on `<ts-grid>`) ended because the user
dismissed it or started editing. The library stores nothing, so this event is
how you remember it: keep it in a cookie, a user preference or a server row, and
stop setting `hint` next time. Removing the attribute yourself fires nothing.

```ts
// detail
{
  /** 'dismiss': the user pressed Got it (or Escape on it). 'edit': edit mode started, by long press, Edit layout or editing = true. */
  reason: 'dismiss' | 'edit'
}
```

```js
if (!localStorage.getItem('seen-grid-hint')) grid.hint = true
grid.addEventListener('ts-hint-dismiss', () => localStorage.setItem('seen-grid-hint', '1'))
```
