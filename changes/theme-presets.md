### Added

- Six theme presets, each an opt-in file switched by one attribute: `neutral`, `paper`, `graphite`, `calm`, `signal` and `terminal`. Link `tickslate/themes/<name>.css` after `tokens.css` and set `data-ts-theme="<name>"` on a grid or widget.
- `neutral`, `calm`, `signal` and `terminal` have a light and a dark mode, dark under `data-theme="dark"`, a `.dark` ancestor or `data-theme="auto"`. `paper` and `graphite` are one mode each and ignore `data-theme`, so a grid can be light on a dark page or dark on a light one by preset name.
- The package exports `tickslate/themes/*.css`.

### Internal

- `src/themes/presets/*.css` hold the presets. Each declares inside `:where([data-ts-theme='<name>'])`, with the tokens a palette will own (`--ts-profit`, `--ts-loss`, `--ts-accent`, `--ts-focus`, `--ts-series-1` to `-6`) in a second block scoped `:not([data-ts-palette])`, so the palette story only adds palettes (Decision 35).
- `scripts/pack-lib.mjs` copies the presets to `dist-lib/themes/`, and `scripts/verify-package.mjs` expands the `./themes/*.css` export pattern, requires it, and checks each preset ships byte for byte.
- `test/presets.test.mjs` applies the RFC 0002 §6.6 contrast floors to every preset in every mode, checks scoping, the palette guard and that `paper` and `graphite` equal the default tokens. The gallery gains a preset switcher (also `?preset=<name>`).
- Differences from RFC 0003 §13.1. (1) The design sheet and the design canvas define `calm`, `signal` and `terminal` as dark-only, so their light modes are new designs that keep each style's type, corners, density and weights; the dark modes follow the references. (2) `signal`'s reference tints a whole tile by its state, which no token expresses, so it is left out; area fill is 30% in dark and 18% in light. (3) `paper` and `graphite` restate every colour, type, corner, padding, shadow and weight token but not the grid metrics and motion (`--ts-row`, `--ts-gap`, `--ts-row-compact`, `--ts-gap-compact`, `--ts-motion`, `--ts-ease`), which stay the host's; no preset sets them. (4) All six series colours sit in the palette-guarded block, because §13.2 does not say which series a palette changes. (5) The dark selectors also exclude an element with `data-theme="light"`, so a light island stays light under a `.dark` ancestor.
