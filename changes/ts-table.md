### Added

- `<ts-table>` (sizes Tall, M, L, XL): a table with typed columns (`text`, `number`, `money`, `percent`, `duration`, `time`, `date`), a header that sorts, and live updates that change cells in place, so focus and scroll position survive a tick. Its entry is `tickslate/elements/table`.
- `tone: 'sign'` columns show `+` or `−` with an arrow and the profit or loss colour. Columns that do not fit hide by `priority`, at no less than 56px each.
- `ts-action` from a table: `{ action: 'sort', value, dir }` for a header press, and `{ action: 'select', id }` for a row once the host lists `'select'` in `actions`. The `TsTableAction`, `TableData`, `TableColumn` and `TableModel` types, and `TsTable.tableModel()`.
- The `table` entry in `WIDGETS`, and the `widget.table.*` and `table.*` messages.

### Internal

- `src/elements/rows.js` (`createRows`, `setText`) does the keyed diffing for reuse by the watchlist and open positions. It moves only the rows a new order needs, and puts focus back on a focused row it had to move.
- Deviation from RFC 0003 §16: after the 56px budget, the element also drops columns that still overflow once drawn (figures such as `+₹36,069.90` need more than 56px), by the same priority, so the body never scrolls sideways. `tableModel` itself is as specified. Text columns shrink with an ellipsis instead.
- Deviation from §16: `TableModel.columns[]` adds `numeric` (the figure typeface) and the model adds `sort` (the sort in effect), which the element reads. A `tone` of `'mut'` draws in the ink colour, not the muted one.
- Deviation from §16: the user's header press replaces `data.sort` until the host sends a different one; a live update that repeats the same `sort` keeps the user's.
- The row buttons of `select` sit before the cell text in the first cell and are named `table.select` ("Select {name}"). `sort` and `select` are emitted through constants, so `docs/reference/events.md` gained their rows by hand.
- Tests: `test/rows.test.mjs` and `test/table.test.mjs` run against `test/mini-dom.mjs`, a small tree DOM that logs every write. `test/browser/table.spec.mjs` and `fixtures/table.html` cover the element in five browsers, and `fixtures/data.js` gained table data. Existing tests that list widgets changed by a line each: `tile-chrome`, `entries`, `picker-model`, and the types fixture `test/types/elements.ts`. `docs/reference/core.md` lists the new catalog entry.
- Size: `tickslate/elements/table` is 20,137 B min+gz bundled, with a new 21.5 kB budget.
- The `sort` event is not cancelable by design: sorting is always on (Decision 36) because it only changes what the table shows, so a host that wants its own order sends `data.sort`. `select` is cancelable like every `ts-action`.
- Columns dropped for overflow are worked out again from each new `data` value (a live tick or another set of columns), not kept from the last one. Rows are one tab stop in selection mode, moved with the arrows, Home and End; a removed focused row hands focus to its neighbour. Text cells carry a `title` with their full text. The scroller is named `table.region` ("{label}, rows").
