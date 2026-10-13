### Added

- Loading, empty and error views on every widget. Data never set (`undefined`) or `state="loading"` shows a skeleton shaped like the widget's layout, keeps the real label and sets `aria-busy="true"`; `state="loading"` over existing data shows it too, and clearing `state` brings the content back. The shimmer is built from `--ts-surface-2` and stops under `prefers-reduced-motion`.
- `state` attribute and property (`'loading'`, `'error'` or `null`), and an `error` property: a message, or an `Error`, shows the error view with a warn glyph (`part="error"`), and the region is named `<label>, error: <message>`. With no message the text is "Couldn't display this data".
- `actions` property and `actionEnabled(name)`, re-applied on connect. The error view shows a Retry button only when `actions` includes `'retry'`; it fires `ts-action` with `{ action: 'retry' }`.
- `static dataOptional`, for a widget that draws its template before it has data (the view model gets `{}`), `static emptyText` and `static skeleton(variant)`. `sk(width, height)` and `STRINGS` are exported from the widget module for widgets that build their own skeletons.
- The empty view renders `<slot name="empty">` with the widget's `emptyText` as its fallback, so a light-DOM child with `slot="empty"` replaces it and stays clickable. Today's P&L says "No trades today", the Equity curve "No trading days yet" and the Session clock "No sessions set up".

### Breaking

- A widget whose `data` was never set now shows a loading skeleton, not "No data". Set `data = null` to show the empty state.
- A view model that throws now shows the error view (still logged once per run of failures), not the empty state.

### Internal

- `test/widget-states.test.mjs` covers every transition, retry gating, recovery, the skeleton and reduced-motion CSS, and that no view carries inline sizes. The shared fake DOM gained `removeAttribute`, `addEventListener`, `dispatch`, and `querySelector` that returns the same node until the markup is rewritten.
- Two assertions in `test/widget.test.mjs` changed to the new behaviour: connecting without data shows a skeleton, and a throwing view model shows the error view.
