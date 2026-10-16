### Added

- Six theme presets, each an opt-in file switched by one attribute: `neutral`, `paper`, `graphite`, `calm`, `signal` and `terminal`. Link `tickslate/themes/<name>.css` after `tokens.css` and set `data-ts-theme="<name>"` on a grid or widget.
- `neutral`, `calm`, `signal` and `terminal` have a light and a dark mode, dark under `data-theme="dark"`, a `.dark` ancestor or `data-theme="auto"`, and a `data-theme="light"` island stays light inside a dark page.
- `paper` and `graphite` are one mode each and ignore `data-theme`, so a grid can be light on a dark page or dark on a light one by preset name.
- The package exports `tickslate/themes/*.css`.

### Internal

- `src/themes/presets/*.css` hold the presets, each declared inside `:where([data-ts-theme='<name>'])`.
- The tokens a palette will own (`--ts-profit`, `--ts-loss`, `--ts-accent`, `--ts-focus`, `--ts-series-1` to `-6`) sit in a second block per preset scoped `:not([data-ts-palette])`, so the palette story only adds palettes (Decision 35).
- `scripts/pack-lib.mjs` copies the presets to `dist-lib/themes/`.
- `scripts/verify-package.mjs` expands the `./themes/*.css` export pattern, requires it, and checks that each preset ships byte for byte.
- `test/presets.test.mjs` applies the RFC 0002 §6.6 contrast floors to every preset in every mode, and checks each file's selectors against the exact expected set, the palette guard, and that `paper` and `graphite` equal the default tokens.
- `test/browser/presets.spec.mjs` checks the cascade in a browser for `calm` and `terminal`: light, `data-theme="dark"`, a `.dark` ancestor, `data-theme="auto"` under a dark OS, light and dark islands, and a palette on the same element; it also checks that `paper` and `graphite` ignore `data-theme`.
- The gallery gains a preset switcher, which keeps `?preset=<name>` in the address so the link is shareable.
- Deviation from RFC 0003 §13.1: the design sheet and canvas define `calm`, `signal` and `terminal` as dark-only, so their light modes are new designs that keep each style's type, corners, density and weights, and the dark modes follow the references.
- Deviation from RFC 0003 §13.1: `signal`'s reference tints a whole tile by its state, which no token expresses, so it is left out and area fill is 30% in dark and 18% in light.
- Deviation from RFC 0003 §13.1: `paper` and `graphite` restate every colour, type, corner, padding, shadow and weight token but not the grid metrics and motion (`--ts-row`, `--ts-gap`, `--ts-row-compact`, `--ts-gap-compact`, `--ts-motion`, `--ts-ease`), and no preset sets those.
- Deviation from RFC 0003 §13.1: all six series colours sit in the palette-guarded block, because §13.2 does not say which series a palette changes.
- Deviation from RFC 0003 §13.1: the dark selectors follow the island rule of `tokens.css`, so `data-theme="light"` on the element or between it and a dark ancestor keeps it light, and a light island inside a dark island inside a light page is the one case not tracked.
