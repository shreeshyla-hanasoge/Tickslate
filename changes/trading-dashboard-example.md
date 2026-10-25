### Added

- A complete trading dashboard example (`examples/trading.html`): every finance widget, a metric, a loss-limit gauge and a table of fills on one saved, scheduled grid with the picker and controls, a seeded fake feed, its own phone layout (P&L and sessions first), and every `ts-action` answered with a confirm panel.
- A guide for trading apps (`docs/guide/trading-dashboard.md`): install, mapping broker payloads onto each widget, the confirm-then-send rule for actions, saving layouts on a server, the NSE and MCX presets, translation, what to test and what is not yet in Tickslate.

### Internal

- The docs-coverage test checks that every example is linked from the examples index and built into the site, and that the trading example handles each of the nine actions the widgets emit (read from the widgets' `ACTION_*` constants as well as `this.emit('...')`, and kept in a hand list that fails when a widget adds one).
- `docs/reference/events.md` omits the `open` action in its `ts-action` table; another story owns that file, so it is only noted here.
- `<ts-chart>` with `select` turned on exposes every point as a tab stop (70 stops for a 70-point series); a roving tab stop is a library follow-up.
