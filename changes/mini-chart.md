### Added

- `<ts-mini-chart>`: a small candlestick chart with entry and exit marks and a candle-close countdown, at `M`, `L` and `XL`, drawn by Emberwick. Import it from `tickslate/elements/mini-chart`; `tickslate/elements` and the CDN files never load it.
- `emberwick` (0.14.0 or later) is an optional peer dependency, loaded the first time the chart has bars. Without it the tile shows "The chart library isn't installed" and the rest of the page is untouched.
- `<ts-mini-chart>` updates in place: the same bars do nothing, a changed last candle is one Emberwick `update`, a closing candle is one `update` and one `append`, and anything else is a `setData`.
- The chart follows your theme: the `--ts-*` tokens (candles from `--ts-profit` and `--ts-loss`) are read when it is made and again when `data-theme`, `class`, `data-ts-theme` or `data-ts-palette` change.
- `volumeProfile` (L) takes Emberwick's own `ProfileData`, which you compute; a profile Emberwick rejects shows "The volume profile couldn't be drawn".
- A `timeframe` action (`ts-action` with `id` and `value`) for the timeframe buttons at `L`, offered with `actions = ['timeframe']`.
- Types `TsMiniChart`, `MiniChartData`, `MiniChartBar`, `MiniChartProfile`, `MiniChartModel` and `TsMiniChartAction`, and the `miniChart.*` messages.

### Internal

- `scripts/verify-package.mjs` proves that importing `tickslate`, `tickslate/elements` or a CDN file never imports or names `emberwick`, that no shared chunk carries it, that `tickslate/elements/mini-chart` imports it only lazily and as an external, that the optional peer stays at `>=0.14.0`, and that `tickslate/elements` bundles with esbuild with Emberwick not installed. `scripts/pack-lib.mjs` refuses a `package.lib.json` that makes it anything but an optional peer. `vite.lib.config.js` and `vite.dev.config.js` keep `emberwick/profiles` external too.
- `emberwick` 0.14.2 is a dev dependency, for the browser spec and the gallery fixture only; the unit suite stays install-free and uses a fake Emberwick.
- The size budget of the new entry is 29 kB (measured 26,800 B min+gz on the integrate/0.3.0 base, Emberwick not counted). The `miniChart.*` messages add about 215 to 220 B min+gz to every entry through the shared core.
- Deviations from RFC 0004 §6: `volumeProfile` is typed by `MiniChartProfile`, a structural copy of Emberwick's `ProfileData`, so the declarations resolve without the optional peer installed; the summary is built from `miniChart.head`, `miniChart.last`, `miniChart.bars`, `miniChart.join`, `miniChart.pair` and `miniChart.flat` (added beside the RFC's keys) so a missing timeframe or change and a single bar still read as a sentence; the message check accepts a camelCase first segment (`miniChart.*`); the box Emberwick draws in has `tabindex="-1"` because Emberwick otherwise makes it a tab stop inside `aria-hidden`.
