# `<ts-widget-picker>`

A sheet a user adds tiles from, so a host needs no add-a-widget UI of its own.
It is a native modal `<dialog>`: a bottom sheet below 700px, centred above.

```js
import 'tickslate/elements/grid'
import 'tickslate/elements/controls'
```

```html
<ts-grid id="dashboard"></ts-grid>
<ts-widget-picker for="dashboard"></ts-widget-picker>
<ts-grid-controls for="dashboard"></ts-grid-controls>
```

With the controls linking it, the edit pill's **Add** opens the picker. Without
them, call `picker.show()` from your own button.

## What it lists

- **Hidden children** first in their group, each with one **Add back** button.
  It calls `grid.restore(id)` at the size the child declares.
- **Catalog types**, only the ones in `grid.addTypes` (`'*'` for all of them),
  each with one button per size the widget supports: Small, Medium and so on.
  Choosing one calls `grid.add({ type, size })`, which asks your code to render
  the child (see [`ts-add-request`](../reference/events.md#ts-add-request)).
  The sheet stays open if nobody took the request.

Rows are grouped by category and sorted by label. A widget's category and
description come from its spec (`category`, `description`), else from the
messages `category.<name>` and `widget.<type>.description`. A spec with no
category is listed under General. When there is nothing to offer, the sheet
says "Every widget is already on this layout".

Search matches the label and the description, ignoring case.

## Attributes and properties

| Member | Type | What it does |
|---|---|---|
| `for` | `string` | The id of the `<ts-grid>` it adds to. Reflects the `for` attribute |
| `open` | `boolean` (readonly) | Whether the dialog is open. Reflected as an `open` attribute |
| `show(opener?)` | `(HTMLElement?) => void` | Opens the dialog. Focus returns to `opener`, else the element that was focused, when it closes |
| `close()` | `() => void` | Closes it |

## Parts

| Part | Element |
|---|---|
| `sheet` | The dialog |
| `search` | The search field |
| `group` | One category, with its heading and rows |
| `row` | One widget or hidden tile |
| `chip` | A size button, or Add back |
| `empty` | The text shown when nothing is left or nothing matches |
| `close` | The Close button |

## Accessibility

- The dialog is modal, named by its title, and the page behind it is inert.
- The search field takes focus on open. Tab walks the close button, the search
  field and then every chip. Escape or Close closes it, and focus returns to
  the opener.
- Rows are list items under a heading per group. A chip's name says what it
  does, such as "Add Card as Medium, 2 by 2".
- The number of results is announced as the search changes.
- The grid announces the outcome ("Card added", "Card added back") through its
  status region.
- Every target is at least 44px. Colours come from `--ts-*` tokens, and the
  sheet keeps a visible border under forced colours.
