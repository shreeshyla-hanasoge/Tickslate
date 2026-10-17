### Added

- `<ts-edge-stats>`: win rate, profit factor, average win and loss, and expectancy, at S (the one stat the `stat` attribute names), Wide (four) and M (four and a histogram of the results).
- `<ts-capital-funding>`: each account's balance against its allocations at S (the first account), Tall and L, with a shortfall hatched and written as `short <amount>`, and an opt-in Rebalance button that fires `ts-action` with `action: 'rebalance'` and the account's `id` when `actions` includes `'rebalance'`.
- `edgeStats(trades)`, `histogram(values, edges)` and `funding(account)`: the figures the two widgets show, for a host that wants the same numbers elsewhere. Allocations draw the balance in array order, and a `funded` amount you give replaces the rule and consumes the balance for the allocations after it.
- `edgeStats` gives a profit factor of `null`, not `Infinity`, for trades that are all break-even, because a ratio of nothing to nothing is not "no losses"; `Infinity` is for a win and no loss.
- `funding()` rounds its sums, so a shortfall reads `6359.6` and float drift over a million allocations is not a shortfall.
- A trade count of 0 shows `<ts-edge-stats>`'s empty state; a win rate that is not exactly 0 or 1 never shows as 0% or 100%; `∞` is read as "no losses"; and an allocation with a missing or repeated id still draws the balance.
- The `stat` attribute and property of `<ts-edge-stats>`, and the message keys `edge.*` and `funding.*` for translating both widgets.

### Internal

- RFC 0003 §21.2 says a profit factor of `Infinity` with no losses; with only break-even trades this is `null` instead (see Added).
- The funding widget's S size shows Rebalance as an icon button in the header (named by `aria-label` and `title`), as the watchlist's add button does, because S has no room for a row of its own.
- The new message keys add about 400 bytes gzipped to every entry that bundles the core, which takes `equity-curve` (249 B) and `today-pnl` (173 B) over their existing budgets. No budget was raised; the maintainer decides.
- New budgets for the two new entries, `edge-stats` 24.5 kB and `capital-funding` 25.5 kB, measured + 10 %.
- Browser spec and fixture for both widgets, in `test/browser/edge-funding.spec.mjs` and `test/browser/fixtures/edge-funding.html`; the shared fixture data gains edge stats and funding data, so the box-never-depends-on-data spec covers them.
