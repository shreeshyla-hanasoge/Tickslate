### Changed

- `linePaths` draws at most `maxPoints` points, `2 × width` by default, so a host that passes a long series now gets a line with fewer points above that size. Each run of readings keeps its lowest and highest, and the first, last, low and high are exact; the scales and the zero line still come from every point. Pass `maxPoints: Infinity` to draw them all.
- Widgets that are `display: none`, or more than one screen from the viewport, skip their renders and draw once, with the latest data, when they can be seen again. A printout draws every widget first.
- Every widget timer of a whole number of seconds (the session clock's second, the 15 s freshness refresh, the calendar's minute) now runs on one shared timer aligned to the second, which sleeps while the page is hidden.

### Internal

- RFC 0003 §23 deviations and additions: `linePaths` takes `maxPoints` as §3.1 lists; the widget base also time-slices a burst of renders (past 12 ms in one task the rest wait for the next), so thirty tiles fed in one tick no longer make one long task. Periods that are not a whole number of seconds keep their own `setInterval`.
- The shared ticker (`src/elements/ticker.js`) counts beats per subscriber, waits for the next second boundary before it starts, and stops its timer and its listener with the last subscriber.
- The session clock asks the calendar once per open or close, per candle and per day instead of every second.
- `dropIndex` lays the other tiles out once and tries the held tile at each slot (incremental placement, `createPlacer` in `src/core/place.js`), remembers the slots for the same tiles, and `<ts-grid>` reuses its last answer while the pointer stays on the same cell. About 0.1 ms at 100 tiles.
- `<ts-grid>` mounts without `ResizeObserver` (it listens for the window's `resize` instead) and without `MutationObserver`; a widget needs no `IntersectionObserver`.
- Today's P&L skips sorting readings that already arrive in time order.
- `test/browser/fixtures/widgets.html` has no `IntersectionObserver`, so the specs that read every tile of its long page keep seeing drawn tiles; `freshness.spec.mjs` now expects the one shared 1 s interval.
- Tests: `test/ticker.test.mjs`, the downsampling and 500,000-reading cases in `test/chart.test.mjs`, the dropIndex benchmark and observer guards in `test/layout.test.mjs`, and `test/browser/perf.spec.mjs` (Chromium only: 30 tiles at 4x CPU throttling, 200 mount/unmount cycles, hidden and distant widgets). `TICKSLATE_PERF_SECONDS=60` runs the full 60 s window.
