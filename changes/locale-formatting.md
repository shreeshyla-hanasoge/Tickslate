### Added

- `configure()` and `hour-cycle` accept `h12`, `h23` or `auto`; formatters expose `fmt.date()` with locale-aware dates and a pinned Gregorian calendar.

### Changed

- Word durations, time labels and fit decisions follow the active locale, including right-to-left text and localized middle ticks.
- `<ts-grid>` propagates changes to `locale`, `currency`, `time-zone` and `hour-cycle` to its tiles.

### Internal

- Added the ten-locale formatting matrix and regression coverage for Gregorian dates, configure notifications and localized middle ticks. Updated the stale grid attribute source assertion in `test/tile-chrome.test.mjs` with maintainer approval. `<ts-chart>` day labels remain on their existing formatter because `series-chart.js` is deferred to a later story.
- The release size check reports `tickslate/elements/metric` at 16.79 kB against its unchanged 16.5 kB budget (297 B over); the six grid-plus-widget rows remain warnings.
