# `<ts-table>`

A table for any list of records: orders, users, strategies, fills. Columns are
typed (text, number, money, percent, duration, time, date), a header press
sorts, and a live update changes the cells that moved and nothing else, so a
reader keeps their focus and their scroll position while the numbers tick. It is
not finance-specific.

```js
import 'tickslate/elements/table'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `Tall` | 1 x 2 | The columns that fit at 56px or more each, in the height of two rows |
| `M` | 2 x 2 | The same table, wider |
| `L` | 3 x 2 | The same table, wider still |
| `XL` | 4 x 2 | The same table, widest |

The design is the same at every size. What changes is how many columns fit: the
table keeps as many as the width allows at no less than 56px each, and hides the
rest by `priority`. The body scrolls under a header that stays put. Any other
size snaps to the nearest of these.

## Data shape

```ts
interface TableColumn {
  key: string
  label: string
  /** Default 'text', shown as given. 'percent' takes fractions, 'duration' milliseconds, 'time' and 'date' any Time. */
  format?: 'text' | 'number' | 'money' | 'percent' | 'duration' | 'time' | 'date'
  decimals?: number
  /** Default 'end' for number, money, percent and duration, else 'start'. */
  align?: 'start' | 'end' | 'center'
  /** '+' or '−' with the pos or neg colour and an arrow. */
  tone?: 'sign'
  /** Lower stays longer when columns must hide. Default: the column's position. */
  priority?: number
  /** Default true. */
  sortable?: boolean
}

interface TableData {
  columns: TableColumn[]
  /** Matched by `id`, so a live update changes cells in place. */
  rows: Array<{ id: string | number; [key: string]: unknown }>
  /** The order to show. A header press replaces it until you set a different one. */
  sort?: { key: string; dir: 'asc' | 'desc' }
  /** When the data was taken. Shown as "synced HH:MM". */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}
```

Every row needs an `id`, a string or a number, and it must be unique: that is how
a live update finds the row to change. A row with none, a repeated one, or one that
is not an object is left out and reported once in development.

Each cell is formatted with the table's formatter (`locale`, `currency`), so a
money column in `en-IN` reads `₹1,24,500.00`. `text` is shown as given, and every
cell is written as text, never as markup. A missing value is a blank cell; a value
a numeric column cannot read shows a dash.

**Sorting.** Numbers sort numerically, text with `Intl.Collator` in the locale
(so "Order 9" comes before "Order 10"), and missing values go last whichever way
it sorts. The sort is stable: rows that compare equal stay in the order you gave.

**Sign columns.** `tone: 'sign'` shows `+` or the true minus `−`, a `▲` or `▼` that
is hidden from assistive technology, and the profit or loss colour. A value that
rounds to zero shows no sign and no arrow.

## Minimal example

```html
<ts-table id="orders" label="Open orders" size="M"></ts-table>
```

```js
const table = document.querySelector('#orders')
table.currency = 'INR'
table.data = {
  columns: [
    { key: 'symbol', label: 'Symbol', priority: 1 },
    { key: 'qty', label: 'Qty', format: 'number', priority: 3 },
    { key: 'price', label: 'Price', format: 'money', priority: 2 },
    { key: 'pnl', label: 'P&L', format: 'money', tone: 'sign', priority: 0 },
  ],
  rows: [
    { id: 'o1', symbol: 'ALPHA', qty: 50, price: 2450.5, pnl: 1240.25 },
    { id: 'o2', symbol: 'BETA', qty: 20, price: 1180, pnl: -310 },
  ],
  sort: { key: 'pnl', dir: 'desc' },
  live: true,
}
```

To update, set `data` again with the same ids. The rows whose cells did not
change are not touched.

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the tile's name. Defaults to "Table" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `size` | attribute and property | `Tall`, `M`, `L` or `XL`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `TableData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered: `'retry'`, and `'select'` to make rows activatable |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting of cells. Resolved from the table, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The base members every widget has are listed in
[Your own widget](../guide/your-own-widget.md). The static
`TsTable.tableModel(data, variant, ctx, { width })` is the pure view model, handy
for tests and server rendering; without a `width` it keeps every column.

## Actions

```ts
// ts-action
{ action: 'retry' }
{ action: 'sort', value: string, dir: 'asc' | 'desc' }   // value: the column key
{ action: 'select', id: string | number }                // opt-in
```

- **`sort`** is always on, since it only changes what the table shows. A sortable
  header is a button: the first press sorts ascending, the next descending, the
  next ascending again, and a different column starts ascending. The table has
  already re-sorted when the event fires; to remember the choice, send the same
  `sort` back in `data`.
- **`select`** is off until `actions` includes `'select'`, so a table with no
  listener has no extra tab stops. Each row then gets a button that covers it, so a
  click or Enter on the row fires `select` with the row's `id` as you gave it.
- **`retry`** is the error view's button, with `actions = ['retry']`.

Nothing fires while the grid is in edit mode. See [Events](../reference/events.md).

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the label |
| `header` | The header row: the live dot, the label and the right-hand text |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `table` | The `<table>` |
| `row` | A body row |
| `cell` | A body cell |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton of header and rows |
| Empty | `data = null` | "No rows yet", or your `slot="empty"` content. `rows: []` shows the header with "No rows yet" under it |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a view model that throws | The message, and Retry if enabled |
| Content | An object | The table. Rows that cannot be read are left out and counted once in development |

## Accessibility

- A real `<table>` with `<thead>`, `<tbody>` and `scope="col"` header cells. A
  visually hidden caption says what a sighted reader sees: "Open orders, 12 rows,
  sorted by Price, descending", and how many columns are hidden when some are.
- A sortable header is a button inside its `th`, with `aria-sort` on the cell, so
  a screen reader announces the column and its order. The ↑ or ↓ beside it is
  decoration.
- The scrolling body is a focusable group named by the label, so the keyboard can
  scroll it. Live updates never move focus or the scroll position.
- A signed figure carries `+` or `−` and an `aria-hidden` arrow, so a gain and a
  loss never differ by colour alone.
- With `select`, each row has a real `<button>` named "Select" and the row's
  first cell, at least 44px tall on a touch screen, with a focus ring.
- Figures use tabular numbers and keep their sign beside the digits in
  right-to-left pages. Alignment is logical (`start` and `end`).
