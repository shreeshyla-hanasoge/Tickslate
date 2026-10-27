### Added

- `--ts-loss-mark`: the colour of the corner on a loss day in `<ts-pnl-calendar>`, `transparent` by default. For example `ts-pnl-calendar { --ts-loss-mark: currentColor; }` draws it in the widget's ink in any theme.

### Changed

- `<ts-pnl-calendar>`: the corner mark on a loss day is now off by default. Turn it on with the new `--ts-loss-mark` token, for example `--ts-loss-mark: currentColor`; the `cvd` colour-vision palette turns it on for you, and forced colours always show it. Every day's name and the summary still carry the signed figure.

### Internal

- RFC 0005 gains §15 and Decision 95 for the opt-in loss mark. `--ts-loss-mark` is in `tokens.css` and the injected defaults (`transparent`), set to `var(--ts-ink)` by the `cvd` palette blocks, and kept out of every preset; the tests treat it as a host and palette token.
