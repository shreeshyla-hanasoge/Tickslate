### Added

- `<ts-breakdown>`: parts of a whole as a share bar (S), a stacked bar (Wide, Tall) or a donut (M), with percentages that sum to 100.0%, more than six parts folded into "Other", and negative values left out and reported.
- `<ts-status>`: one row per service with its state in words beside a dot whose shape differs for `ok`, `degraded`, `down` and `unknown`, at S, Tall and M.
- `<ts-feed>`: the latest events, newest first, keyed by `id`, so a new item prepends without moving the tile or the reader's place, and nothing is announced.
- The `breakdown`, `status` and `feed` entries in `WIDGETS`, in the General category, and the `tickslate/elements/breakdown`, `status` and `feed` entries.
- Message keys under `breakdown.*`, `status.*`, `feed.*` and `widget.breakdown.*`, `widget.status.*`, `widget.feed.*`.

### Internal

- Built on the 0.3.0 integration branch (strict CSP): templates are constant markup, every data node is made with the DOM and `element.style`, and the three widgets add no `innerHTML` or `style=` sink.
- `arcPaths` is appended to `src/elements/chart.js` (new exported helper only).
- Deviations from RFC 0004 §4, each the nearest thing that works:
  - The models carry a few fields the RFC does not list, all read by the element: `breakdownModel` returns `totalText` ("Total 1,00,000", the donut's middle; `total` stays the formatted sum), `share` (S's "label pct"), `drawn`, `live`, `time`, `aria` on a slice and `key` on an arc; `statusModel` returns `overallText`, `total`, `live`, `time` and, per row, `sinceText` ("since 12 min ago"; `since` stays the `fmt.ago` text) and `aria`; `feedModel` returns `live` and `time` and, per item, `aria`.
  - `statusModel.overall` is `'unknown'` with no readable rows, and its summary is the empty text.
  - The folded "Other" slice shows the sum of what it folded as its value, never `''`.
  - The three scrollers (legend, services, events) are `role="group"` named by the tile's label: the RFC lists no region message.
  - A feed item is named by `feed.itemAria` or `feed.itemAriaPlain` only when it has a time; with no time there is no sentence to put first, so its words stand.
  - The `status.*` state keys are read through a literal map, so the messages test can see each use.
- Files outside the story's list, each a line or a few: `test/messages.test.mjs` (the three families added to the key scan), `test/tile-chrome.test.mjs` (the three classes in its widget list), `test/picker-model.test.mjs` (the General category now has eight entries), `test/types/elements.ts` (typed data for the three), `README.md` and `docs/reference/core.md` (the catalog rows).
- Budgets: one new row each in `scripts/check-size.mjs`. The new message keys add about 0.5 kB min+gz to every entry's core, which on this base takes `chart` (41 B) and `controls` (93 B) over their rows; they were not raised.
