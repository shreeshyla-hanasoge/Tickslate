### Added

- `fmt.ago(t, now, opts)`: "just now" under 30 seconds, then "2 min. ago" or "3 hr. ago" in the formatter's locale; a time ahead of `now` reads "just now", never a negative age.
- `stale-after` attribute on a widget or `<ts-grid>`: how old live data may get before it reads as stale, in milliseconds or as `'90s'`, `'2m'` or `'1h'`; default 2 minutes.
- Live data with an `asOf` shows its age in the header of `<ts-card>`, `<ts-chart>`, `<ts-equity-curve>`, `<ts-metric>`, `<ts-table>` and `<ts-today-pnl>`: "just now", then "2 min. ago", and past `stale-after` an amber, still dot, "Stale · 3 min" and a tile name ending ", stale". Data with an `asOf` and no `live` shows "synced 11:42".
- `ctx.freshness` (`{ asOf, ago, stale }`) in every widget's view model context, and a `ts-card` `live` or `as-of` attribute feeds it too.
- `flash` attribute on a widget or `<ts-grid>`: `flash="off"` stops the brief tint on a headline figure that changed.
- `<ts-metric>`, `<ts-card>`, `<ts-chart>`, `<ts-equity-curve>` and `<ts-today-pnl>` tint a changed headline figure for 700 ms, in `--ts-profit` on a rise and `--ts-loss` on a fall (`goodWhen` swaps them), never on first render and not under reduced motion.
- `this.flash(key, number, { goodWhen })` for your own widgets.

### Internal

- Live tiles share one 15-second timer (`src/elements/ticker.js`) that pauses while the page is hidden and stops when no live tile is connected, and a snapshot with an `asOf` starts none. RFC 0003 §23 describes the shared ticker as also serving `every(1000)`, which belongs to `perf-hygiene`; until then the ticker serves freshness only.
- `flash` takes the number behind a figure, not its text, so `'1,234.50'` is not read as a number. `<ts-card>` reads its slotted figure's text with `figureOf`, as it holds nothing else.
- The tint is written to a wrapper that paints (a slot is `display: contents`), and a re-render within the 700 ms does not end it.
- `ctx.freshness.stale` is the only place "stale" is decided; the dot, the meta and the tile name read it, and only while the tile is live.
- Messages `time.staleWord`, `time.justNow` and `time.stale` added to `EN`.
- Entry budgets for `card`, `chart` and `session-clock` (and any other entry that failed after the merge) were re-measured; see `scripts/check-size.mjs`.
