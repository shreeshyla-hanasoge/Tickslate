### Added

- `fmt.ago(ms, now, opts)`: relative time formatting using a cached `Intl.RelativeTimeFormat`, returning 'just now' under 30 seconds (or custom `opts.justNow`), then relative units ('2 min ago', '3 hours ago') in the active locale.
- `stale-after` attribute on widgets and `<ts-grid>`: duration threshold (milliseconds or duration string with units: '90s', '2m', '1h'; default 120000 ms) beyond which live data is marked stale.
- Freshness context `ctx.freshness` (`{ asOf, ago, stale }`) provided to widget view models.
- Shared header freshness presentation across all widgets:
  - When `live: true` and data is stale (`now - asOf > staleAfter`), the header dot turns `--ts-warn` and stops pulsing (`.dot.live.stale`), the header meta displays 'Stale · 3 min', and the tile accessible name ends with ', stale'.
  - When `live: true` and fresh, the header dot pulses (`.dot.live`), the header meta displays relative age via `fmt.ago`, and the tile accessible name ends with ', live'.
  - When `asOf` is set without `live`, the header dot is hidden and the header meta displays 'synced 11:42'.
  - When `asOf` is present, freshness updates automatically on a 15-second background timer.
- `flash(key, value, opts)` on widget instances: tints the element with `data-k="<key>"` or `data-flash="<key>"` for 700 ms using `--ts-profit` on rise and `--ts-loss` on fall (or swapped with `goodWhen: 'down'`, or `--ts-accent` with `goodWhen: 'neither'`). Throttled to at most once per element per second. Disabled under `prefers-reduced-motion: reduce` or `flash="off"`. Never fires on first render, variant change, or unchanged value. Adopted on headline figures in Today's P&L, Equity Curve, Session Clock, Metric, Card, and Series Chart.

### Internal

- Added messages `time.staleWord`, `time.justNow`, and `time.stale` to `EN` in `src/core/messages.js` and their TypeScript declarations in `src/core/index.d.ts`.
- `parseDuration(value)` helper in `src/elements/widget.js` exported for duration parsing.
- Added test suites in `test/freshness.test.mjs` verifying `parseDuration`, `ctx.freshness`, header states across all 4 modes, 15s timer activation and cleanup, and `flash()` highlighting and throttling behavior.
- Tested `fmt.ago` across multiple locales (`en-IN`, `de-DE`) in `test/format.test.mjs`.
- Growth in the shared base class increased bundled sizes of `today-pnl` (21.17 kB min+gz vs 19.5 kB budget), `equity-curve` (21.23 kB min+gz vs 19.5 kB budget), and `metric` (19.60 kB min+gz vs 18.5 kB budget). Per AGENTS.md rules, budgets are not modified and measurements are reported for maintainer decision.
