# `<ts-grid>`

Lays out your tiles in a responsive grid and lets the user rearrange them the
way they rearrange apps on a phone: long press, drag, resize, remove, undo. It
works from its children alone, or from a layout you save and load.

```js
import 'tickslate/elements'
```

```html
<ts-grid>
  <ts-metric label="Signups" size="S" data='{"value": 1204}'></ts-metric>
  <ts-card label="Notes" size="Wide"><p>Deploy freeze from Friday.</p></ts-card>
</ts-grid>
```

The grid never moves your children in the DOM, so Vue, React and the like keep
track of their nodes. It positions each child and writes its `size` attribute.

## Columns and sizes

The grid measures its own width (not the window's).

| Grid width | Columns | `device` |
|---|---|---|
| 1200px and up | 4 | `'desktop'` |
| 700px to 1199px | 3 | `'desktop'` |
| under 700px | 2 | `'phone'` |

A size is a footprint in cells; the same size can render a different design when
the grid is narrow.

| Size | 4 columns | 3 columns | 2 columns (phone) |
|---|---|---|---|
| `S` | 1 x 1 | 1 x 1 | 1 x 1 |
| `Wide` | 2 x 1 | 2 x 1 | 2 x 1 |
| `Tall` | 1 x 2 | 1 x 2 | 1 x 2 |
| `M` | 2 x 2 | 2 x 2 | 2 x 2 |
| `L` | 3 x 2 | 3 x 2 | 2 x 2, renders `M` if the widget has it |
| `Banner` | 4 x 1 | 3 x 1 | 2 x 1, keeps its design |
| `XL` | 4 x 2 | 3 x 2 | 2 x 2, renders `M` if the widget has it |

Row height and gap come from `--ts-row` and `--ts-gap` (`--ts-row-compact` and
`--ts-gap-compact` at 2 columns); see [Theming](../theming.md). Rows are fixed
so live numbers never resize a tile. The grid reads these tokens when it
measures, so set them on the grid or an ancestor in `px`.

Items are placed in array order, each in the first cell where it fits, the same
as CSS `grid-auto-flow: dense`.

## Layouts: implicit and explicit

### Implicit mode

A grid whose `layout` you never set builds its layout from its children, once,
in DOM order.

- **Type** of a child: the catalog key whose `tag` matches the child's tag
  (your `catalog`, then the built-in one), else the tag itself.
- **Size**: the child's `size` attribute as first read (kept for the life of the
  element), snapped to what the widget supports; with none, the widget's first
  supported size; with no spec, `S`. The grid writes the size it renders back to
  `size`, which at 2 columns is the reflowed design (`M` for an `L` tile), and
  it remembers the real one, so the tile is `L` again at 4 columns.
- **Id**: the child's `item` attribute, else its type, then `type-2`, `type-3`
  for repeats. Generated ids are written back as `item`. Give repeated children
  an `item` so saved layouts survive reordering (development builds warn).
- **After seeding the grid's own list is the truth.** A child you add is
  appended at the end; one you remove from the DOM is dropped; a tile the user
  moved keeps its place whatever the DOM order, so a framework re-render does
  not undo the user's edits. An id the user removed stays removed until
  `restore(id)`.
- A `size` change you make on a child (a value the grid did not write) resizes
  that tile.
- Reading `layout` returns the seeded layout and changes nothing.

### Explicit mode

Setting `layout` to a `Layout` or an item array switches to explicit mode for
good. Each child is matched to an item by its `item` attribute.

```js
const grid = document.querySelector('ts-grid')
grid.layout = [
  { id: 'signups', type: 'metric', size: 'S' },
  { id: 'revenue', type: 'chart', size: 'Wide' },
]
```

```html
<ts-grid>
  <ts-metric item="signups" label="Signups"></ts-metric>
  <ts-chart item="revenue" label="Revenue"></ts-chart>
</ts-grid>
```

- The value is read with `readLayout` (never throws; repairs what it can and
  reports each change in `ts-layout-issues`), keeping items whose widget is
  unknown so a saved layout never loses a tile because its tag is not defined
  yet.
- An item with no child leaves no hole but is kept in every
  `ts-layout-change`. A child with no item stays hidden.
- Setting `layout` clears the undo history.
- `ts-layout-issues` fires only when you set `layout` or `catalog`, never for
  the grid's own edits or implicit seeding.

To save and restore layouts, use `persistLayout`; see
[Saving layouts](../guide/saving-layouts.md).

### Profiles

A `Layout` holds several item lists by profile name; `'market'` and `'closed'`
always exist. The grid shows the profile named by its `profile` attribute, else
a manual `override(name)`, else the one a `schedule` calls for, else
`'market'`. With a schedule, the grid switches between `'market'` and
`'closed'` on time:

```js
grid.schedule = { calendar, market: { sessions: ['nse'], leadMinutes: 15 } }
grid.override('closed') // until the schedule next changes
grid.override(null)     // back to the schedule
```

A switch fires `ts-profile-change` and is announced. A switch that falls due
while the user is editing or dragging waits until they finish. Undo history is
kept per profile.

### Per-item spec resolution

What sizes and label a tile has is looked up for each item, lazily, in this
order:

1. the element's own `spec` getter (every Tickslate widget has one, and
   [your own widget](../guide/your-own-widget.md) can too); for a plain element,
   its `sizes` and `label` attributes;
2. your `catalog[type]` (an object, or a function from an item to a spec);
3. `widgetCatalog()`: the built-in `WIDGETS[type]` and every widget registered
   with `defineWidget()`. The grid draws again when one is registered.

So two `<ts-card>`s can allow different sizes, and a tile that upgrades after
the grid rendered is resolved again on its next render. Set `catalog` to add
your own tiles:

```js
import { WIDGETS } from 'tickslate'
grid.catalog = { ...WIDGETS, news: { tag: 'my-news', label: 'News', sizes: ['Tall'] } }
```

## Attributes

| Attribute | Meaning |
|---|---|
| `editing` | Edit mode. Reflects the `editing` property |
| `profile` | The profile to show. Reflects the `profile` property; a set attribute beats the schedule and `override()` |
| `locked` | Read-only dashboard: no long press, no edit mode, no edit controls |
| `edit-controls="off"` | Hides the Edit layout button, the edit pill and the empty board's Add back button, for hosts with their own controls. Long press, Escape and the `editing` attribute still work |
| `undo-toast="off"` | Suppresses the undo toast; the removal is announced instead |
| `locale`, `currency`, `time-zone`, `hour-cycle` | Formatting for every tile that has none of its own: the widget's attribute, then these, then `configure()` |
| `stale-after` | The `stale-after` every tile uses that has none of its own (milliseconds or a duration such as `'90s'`, `'2m'`, `'1h'`; default `120000`) |
| `flash="off"` | Stops the change flash on every tile |
| `dragging` | Set by the grid while a tile is lifted, so you can style around a drag. Do not set it |

## Properties and methods

| Member | Type | What it does |
|---|---|---|
| `layout` | `Layout` (set: `Layout` or `LayoutItem[]`) | See Layouts. Setting it ends implicit mode for good |
| `catalog` | `Catalog` | Your tiles' specs. Defaults to `WIDGETS` |
| `profile` | `string` | The profile shown. Defaults to `'market'` |
| `editing` | `boolean` | Edit mode |
| `locked` | `boolean` | Read-only. While set, `editing = true` is ignored with one development warning; setting it while editing ends edit mode |
| `columns` | `2 \| 3 \| 4` (readonly) | From the grid's width. `0` before the first measure |
| `readingOrder` | `readonly string[]` (readonly) | The visible tiles' ids in visual order, which is the order they are read and tabbed in. Empty before the first render. While editing it holds the order from before, except that a tile removed meanwhile leaves it at once, and it takes the new order at Done |
| `hiddenItems` | `{ id, type, label }[]` (readonly) | Children whose item is not in the active profile, which includes tiles the user removed |
| `undo()` | `() => boolean` | Restores the active profile's previous layout (up to 20 steps per profile); fires `ts-layout-change` with reason `'undo'`. `false` when there is nothing to undo. Works while locked, because the lock is for the user's hands |
| `restore(id)` | `(id) => boolean` | Adds a hidden child back at the end of the profile, at its declared size (else its first supported one); fires `ts-layout-change` with reason `'add'` and records an undo step. `false` when no hidden child has that id |
| `addTypes` | `readonly string[] \| '*' \| null` | The catalog types you answer `ts-add-request` for. The picker offers new tiles of these only. Default `null`: none |
| `add({ type, id?, size? })` | `(request) => string \| null` | Asks for a new tile: restores a hidden child with that `id`, or fires the cancelable `ts-add-request` and places the child you render. Returns the id, or `null` when the type is unknown or nobody took the request |
| `move(id, toIndex)` | `(id, number) => boolean` | Moves the item to that index in the active profile (clamped). Commits with reason `'move'`. `false` for an unknown id |
| `resize(id, size)` | `(id, SizeName) => boolean` | Snaps to the item's spec. Commits with reason `'resize'`. `false` for an unknown id |
| `remove(id)` | `(id) => boolean` | Removes the item, which becomes a hidden child. Commits with reason `'remove'`. `false` for an unknown id |
| `profileOverride` | `string \| null` (readonly) | The profile `override()` is showing, or `null` when the schedule decides |
| `openPicker` | `(() => void) \| null` | Set by [`<ts-grid-controls>`](ts-grid-controls.md) while a picker is linked. The edit pill then shows **Add**, which calls it |
| `schedule` | `(ProfileSchedule & { calendar }) \| null` | Switches between `'market'` and `'closed'` on time |
| `override(profile)` | `(string \| null) => void` | Show a profile until the schedule next changes (or until `override(null)` with no schedule) |
| `clock` | `() => number` | What the grid takes the time to be. Defaults to `Date.now` |

## Editing

Edit mode is on while `editing` is set. Tiles wiggle (not under
`prefers-reduced-motion`), each shows its edit chrome, managed tiles become
`inert` (their own `inert` value is restored exactly afterwards), and a polite
status region announces each step. `ts-edit-change` fires on every change.

### Getting in and out

| How | Notes |
|---|---|
| Long press | Hold a tile for 500ms without moving more than 8px. It squeezes slightly, then lifts into the drag. Not on a locked grid, and a widget's own button under the finger keeps its click |
| The Edit layout button | A visually hidden button that is the grid's first Tab stop; it shows when focused. Enter or Space starts editing. Absent when `locked` or `edit-controls="off"` |
| `grid.editing = true`, or the `editing` attribute | For your own controls |
| Done | In the edit pill (below) |
| Escape | Cancels a held tile first; otherwise ends editing, but only when focus is in the grid or on `body`, so Escape in your dialog is yours |
| An outside tap | A press outside the grid ends editing. A press in the pill or its Add back list is inside |

When editing ends, focus goes back to the element that started it (the Edit
layout button, or the tile under the long press) if it can still take focus,
else to the grid's board, the dashboard region (`tabindex="-1"`, named "Dashboard"
unless you set `aria-label` on the grid).

### The edit pill and Add back

While editing, a floating pill (`part="edit-pill"`) sits at the bottom of the
grid with **Done** and, while `hiddenItems` is not empty, **Add back (n)**.
Add back opens a list headed "Hidden from this layout"; choosing a tile calls
`restore(id)`, announces it, and moves focus to the restored tile's handle.
Arrow keys move through the list and Escape closes it without leaving edit
mode. The pill is hidden when `locked` or `edit-controls="off"`.

With a [`<ts-widget-picker>`](ts-widget-picker.md) linked by
[`<ts-grid-controls>`](ts-grid-controls.md), the pill shows **Add** instead,
which opens the picker. The picker lists the hidden children first, so nothing
Add back did is lost.

### Moving and resizing

| Method | Move | Resize | Remove |
|---|---|---|---|
| Pointer | After the long press, drag. With a mouse in edit mode, drag past 4px. On touch in edit mode, rest on a tile for 200ms so a quick swipe still scrolls. The grid scrolls near the top and bottom edges | Drag the corner handle | The minus badge |
| Keyboard | Tab to a tile's handle; Space or Enter picks it up, the arrow keys move it, Space or Enter drops it, Escape cancels | `+` or `=` for the next size up, `-` or `_` for down | Delete or Backspace |
| Tap to place (no drag needed) | Tap a tile to pick it up, then tap another tile to put the held one in that slot, or the held tile to drop it. Escape, or a tap on empty board, cancels | Tap the resize button to step up (past the largest size it wraps to the smallest) | The minus badge |

Each tile's chrome is a plain container of three sibling buttons, so nothing
interactive nests inside anything interactive:

| Button | Accessible name | Tab stop |
|---|---|---|
| Handle | "Signups, S, position 1 of 6", plus shared instructions | Yes, the tile's only one |
| Remove | "Remove Signups" | No (reachable by assistive technology) |
| Resize | "Resize Signups, now Wide" | No |

The label in those names is the tile's `label` attribute, else its `aria-label`,
else its spec's label, else its id. Tab order follows the visual order.

### Undo, the toast and restore

- Before every commit (move, resize, remove, add) the active profile's layout
  is saved; 20 steps per profile.
- Ctrl+Z or Cmd+Z while editing calls `undo()` (not inside a text field, and
  not during a gesture).
- After a remove, a toast (`part="toast"`) reads "Signups removed · Undo" for
  6 seconds, paused while hovered or focused. While it shows it carries the
  announcement. `undo-toast="off"` replaces it with a plain announcement.
- A removed child stays in the DOM (hidden); `hiddenItems` lists it and
  `restore(id)` or Add back brings it back. Double-clicking a remove badge
  removes once.

### The empty board

When the active profile has no visible tiles, the board keeps one row of height
and shows a dashed panel (`part="empty"`) saying "No widgets on this layout
yet". Put your own content in a child with `slot="empty"` (it is never a tile)
to replace the text. While `hiddenItems` is not empty, the panel also offers
Add back, unless the grid is `locked` or `edit-controls="off"`.

## Locked

`locked` makes a read-only dashboard: no long press (a widget's buttons under
the pointer still click), no edit mode, no Edit layout button, no pill, no
Add back. `editing = true` is ignored with one development warning. Setting it
while editing ends edit mode. `undo()` and `restore()` still work from code.

## Events

All bubble and are composed. Details and types are in
[Events](../reference/events.md).

| Event | When |
|---|---|
| `ts-layout-change` | The layout changed by a user's move, resize, remove, add back or undo. Carries the whole layout to save |
| `ts-layout-issues` | You set `layout` or `catalog` and `readLayout` repaired something |
| `ts-edit-change` | Edit mode started or ended |
| `ts-reading-order-change` | The order of the visible tiles changed: at Done after an edit that moved or removed tiles (before `ts-edit-change`), or when a `layout` you set, a new column count or a tile appearing or going changes it. Not for the first order with a tile in it, nor for your first `layout` before any edit, nor mid-edit |
| `ts-columns-change` | The column count changed, and once after the first measure |
| `ts-profile-change` | The shown profile changed by schedule or `override()` |
| `ts-add-request` | `add()` or the picker asks for a new tile. Cancelable: `preventDefault()` and render a child with `item=id` |

## Parts and slots

| Part | Element |
|---|---|
| `board` | The area the tiles sit in |
| `placeholder` | The slot a lifted tile will land in |
| `toast` | The undo toast |
| `edit-pill` | The Done and Add back pill |
| `empty` | The empty board panel |

| Slot | Content |
|---|---|
| (default) | The tiles. The grid assigns each one to a slot of its own, so a tile's `slot` attribute is not used |
| `empty` | Replaces the empty board's text. Put `slot="empty"` on your content; the grid assigns it |

## Before the elements upgrade

`tokens.css` hides a grid's children until the grid is defined and keeps one
row of height, and known widget tags keep their standalone height, so a page
that loads its script late does not jump. See [Theming](../theming.md).

## Accessibility

- The grid's board is the dashboard's one `role="region"` landmark, named by
  your `aria-label` on `<ts-grid>` and else "Dashboard" (`grid.dashboard`, so
  it follows `messages` and `locale`). Each tile is a labelled group inside it,
  not a landmark of its own. The grid writes nothing to its own host: no role
  and no `aria-label`. When focus has nowhere else to go, for example after the
  last tile is removed, it goes to the board.
- Reading order and Tab order follow the layout, not your markup (WCAG 1.3.2
  and 2.4.3). After tiles are rearranged, a screen reader and the Tab key meet
  them in the order they sit on screen: row by row, left to right by each
  tile's top-left cell. The grid does this with one slot per visible tile and
  never moves a child, so Vue, React and the like keep patching their own
  nodes. `readingOrder` lists the ids in that order and
  `ts-reading-order-change` tells you when it changes. Manual slot assignment
  needs Safari 16.4, Chrome 86 or Firefox 92; below that the grid keeps one
  slot, and reading and Tab order follow your DOM order. The same goes for a
  declarative shadow root on the grid without `shadowrootslotassignment="manual"`,
  which the grid reuses as it is and warns about in development. In that
  fallback a tile's own `slot` attribute, anything but `empty`, names a slot the
  grid does not have, so the tile is not rendered. In edit mode the tiles are
  inert and the edit handles carry Tab, in placement order, so the new reading
  order is taken at Done.
- Everything the pointer can do has a keyboard path and a single-pointer path
  (WCAG 2.5.7): the handle, `+` and `-`, Delete, tap to place and the resize
  button. Targets in the pill and toast are 44px.
- Announcements go to a polite status region, each cleared and set on the next
  frame so two identical ones are both spoken: "Editing layout, 6 tiles. Tab to
  a tile, Space to pick it up.", "Signups, picked up. Use the arrow keys to move
  it, Space to drop, Escape to cancel.", "Signups, moved to position 2 of 6.",
  "Can't move further.", "Signups, size Wide.", "Signups added back.",
  "Undone.", "Showing the closed layout.", "Done editing layout."
- Focus rings use `--ts-focus` as an outline, which survives forced colours.
  Under `prefers-reduced-motion` the wiggle is replaced by a steady outline of
  at least 3:1 contrast.
- With a coarse pointer, text in tiles is not selectable (so a long press never
  selects); with a fine pointer it is, except while editing or dragging.
- Moving or resizing from the keyboard scrolls the handle into view, smoothly
  only when motion is allowed.
