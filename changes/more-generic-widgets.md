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
  - Fold hysteresis (a deviation from the RFC's literal sort): a slice already shown stays shown until a newcomer beats it by at least 1 percentage point of the total, because with the literal sort two near-tied slices swap in and out of "Other" on every tick of a live board. Colours follow the slice's id, not its rank, so a swap never recolours the slices that stay. The element keeps what the pure model needs (`viewContext()` hands back the last render's `colours`, a key-to-colour map the model returns), so `breakdownModel` and `foldSlices` stay pure; with no previous render the result is the literal sort.
  - `<ts-status>` re-renders on the shared 15 s ticker (`every(15000)`) while any row has a `since` or the data has an `asOf`, live or not, so "since 12 min ago" ages like the freshness header; `statusModel` returns `ages` for it.
  - `<ts-feed>` holds the reader's place with an offset measured from the scroller's top and reused while the reader has not moved, and shifts the list by the sub-pixel remainder through the CSSOM, so an engine that keeps `scrollTop` in whole pixels (WebKit) no longer drifts by a fraction on each arrival.
  - The "left out" note sits above the legend (not inside the scroller), and the "Nothing to break down" line shows at every size when nothing is drawn. `apportion` and the model scale values near the double limit before summing, so they still read as shares.
- Files outside the story's list, each a line or a few: `test/messages.test.mjs` (the three families added to the key scan), `test/tile-chrome.test.mjs` (the three classes in its widget list), `test/picker-model.test.mjs` (the General category now has eight entries), `test/types/elements.ts` (typed data for the three), `README.md` and `docs/reference/core.md` (the catalog rows).
- `test/browser/fixtures/csp.html` mounts the three tiles, and `csp.spec.mjs` and `tt.spec.mjs` list them, so the strict-CSP and Trusted Types specs cover the new tags. `widgets.html` already mounts every `WIDGETS` entry, so the render and a11y specs did.
- Budgets: one new row each in `scripts/check-size.mjs`. The new message keys add about 0.5 kB min+gz to every entry's core, which took `chart` (30,761 B) and `controls` (17,501 B) over their rows. Those two rows alone are re-measured (2026-10-26, orchestrator authorised, RFC 0003 §25): measured + 10 %, rounded up to 33.5 kB and 19 kB. No other row changed.
