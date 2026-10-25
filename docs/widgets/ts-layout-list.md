# `<ts-layout-list>`

A grid's layout as a plain list, so a person can rearrange it without dragging.
Each tile is a row with its name, a button for every size it supports, **Move
up**, **Move down** and **Remove**, and **Undo** sits under the list. It is the
alternative to dragging (WCAG 2.5.7) for a screen reader, a switch, a phone or a
settings page where the board itself isn't shown.

```js
import 'tickslate/elements/grid'
import 'tickslate/elements/layout-list'
```

```html
<ts-grid id="dashboard"></ts-grid>
<ts-layout-list for="dashboard"></ts-layout-list>
```

## What it shows

One row per tile in the grid's active profile, in order, numbered. It draws again
when the grid fires `ts-layout-change` or `ts-profile-change`, when the grid
turns up later in the page, and when `for` changes.

- **The name** is the tile's `label` attribute, else its catalog label.
- **Sizes**: one button per size the tile's widget supports, the current one with
  `aria-pressed="true"`. The button reads "Medium" and is named "Medium, 2 by 2".
- **Move up** and **Move down**. On the first row Move up, and on the last row
  Move down, are `aria-disabled` rather than removed, so they stay where a
  switch or a screen reader expects them.
- **Remove** hides the tile, as removing it from the board does. It can be
  brought back with the picker's **Add back**, or with **Undo**.
- **Undo** calls `grid.undo()`. The line beside it says "Undone", or "Nothing to
  undo" when there was nothing to undo.

## Edits

Every button calls the grid's own `move`, `resize` or `remove`, so an edit fires
the same [`ts-layout-change`](../reference/events.md#ts-layout-change) as a drag
(`reason` is `'move'`, `'resize'` or `'remove'`), lands in the same undo history
and follows the same rules. The list keeps no layout of its own; the host's
persistence and listeners work as they do for dragging.

## Attributes and properties

| Member | Type | What it does |
|---|---|---|
| `for` | `string` | The id of the `<ts-grid>` it edits. Reflects the `for` attribute |

## Parts

| Part | Element |
|---|---|
| `list` | The labelled region around everything |
| `rows` | The ordered list |
| `row` | One tile |
| `name` | The tile's name |
| `size` | A size button |
| `move` | A Move up or Move down button |
| `remove` | A Remove button |
| `undo` | The Undo button |
| `status` | The line that says what just changed |
| `empty` | The text shown when the layout has no tile, or the `for` grid isn't found |

## Accessibility

- The element is a labelled region holding an ordered list. A row's size buttons
  are a group named "Size of Revenue", and every button's name carries the tile,
  such as "Move up Revenue" or "Remove Revenue".
- What an edit did is spoken through the list's own polite status region, such as
  "Revenue moved to position 2 of 5". The grid also announces the edit in its own
  region, so a screen reader may say the change twice.
- Focus stays on the button used, even when the row moves. When a row goes (a
  remove, an undo, a host's change), focus moves to the same button on the row
  that takes its place, else the row above, else the list.
- It needs no pointer, no drag and no board. Every target is at least 44px, rows
  wrap at 390px, and focus rings are `--ts-focus` outlines that survive forced
  colours. Every string is a message (`list.*`).
