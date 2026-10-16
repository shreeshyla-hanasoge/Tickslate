### Added

- `<ts-edge-stats>`: win rate, profit factor, average win and loss, and expectancy, at S (the one stat the `stat` attribute names), Wide (four) and M (four and a histogram of the results).
- `<ts-capital-funding>`: each account's balance against its allocations at S (the first account), Tall and L, with a shortfall hatched and written as `short <amount>`, and an opt-in Rebalance button that fires `ts-action` with `action: 'rebalance'` and the account's `id` when `actions` includes `'rebalance'`.
- `edgeStats(trades)`, `histogram(values, edges)` and `funding(account)`: the figures the two widgets show, for a host that wants the same numbers elsewhere. Allocations draw the balance in array order, and a `funded` amount you give replaces the rule and consumes the balance for the allocations after it.
- The `stat` attribute and property of `<ts-edge-stats>`, and the message keys `edge.*` and `funding.*` for translating both widgets.

### Internal

- `edgeStats` returns a profit factor of `null`, not `Infinity`, for trades that are all break-even (no win and no loss), where RFC 0003 §21.2 says `Infinity` with no losses: a ratio of nothing to nothing is not "no losses".
- `funding()` reads an unreadable amount as 0 and an unreadable or negative balance as nothing to draw, and rounds its sums to 8 decimals so a shortfall reads `6359.6`, not `6359.599999999999`.
- The funding widget's S size shows Rebalance as an icon button in the header (named by `aria-label` and `title`), as the watchlist's add button does, because S has no room for a row of its own.
- The new message keys add about 400 bytes gzipped to every entry that bundles the core, which takes `equity-curve` (249 B) and `today-pnl` (173 B) over their existing budgets. No budget was raised; the maintainer decides.
- New budgets for the two new entries, `edge-stats` 24.5 kB and `capital-funding` 25.5 kB, measured + 10 %.
- Browser spec and fixture for both widgets, in `test/browser/edge-funding.spec.mjs` and `test/browser/fixtures/edge-funding.html`; the shared fixture data gains edge stats and funding data, so the box-never-depends-on-data spec covers them.
