# Events

Tickslate fires six events, all named `ts-*`. Every one is a `CustomEvent`
that **bubbles and is composed**, so one listener on the grid, a wrapper or the
document hears it, even from inside a shadow root. Only `ts-action` is
cancelable: `preventDefault()` on it stops the widget's built-in follow-up
(an equity curve keeps its old `range`). On the others it changes nothing.

| Event | Fired by | `detail` | Bubbles | Composed |
|---|---|---|---|---|
| [`ts-action`](#ts-action) | any widget | `{ action: string, ...extra }` | yes | yes |
| [`ts-layout-change`](#ts-layout-change) | `<ts-grid>` | `TsLayoutChangeDetail` | yes | yes |
| [`ts-layout-issues`](#ts-layout-issues) | `<ts-grid>` | `{ issues: LayoutIssue[] }` | yes | yes |
| [`ts-edit-change`](#ts-edit-change) | `<ts-grid>` | `{ editing: boolean }` | yes | yes |
| [`ts-columns-change`](#ts-columns-change) | `<ts-grid>` | `{ columns, device, initial }` | yes | yes |
| [`ts-profile-change`](#ts-profile-change) | `<ts-grid>` | `{ profile, reason }` | yes | yes |

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
announcement is skipped then, the event is not).

```ts
// detail
{
  profile: string
  /** 'schedule': the clock crossed an open or close. 'override': override(name). 'override-ended': override(null), or the override ran out. */
  reason: 'schedule' | 'override' | 'override-ended'
}
```
