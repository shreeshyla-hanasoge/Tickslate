### Added

- Warnings appear in development builds. `tickslate/elements` now resolves to `elements.dev.js` under the `development` export condition (Vite and webpack in dev mode, `node --conditions=development`), which carries every development warning. Production builds resolve `elements.js`, which has none.
- `npm run build:dev` builds `dist-lib/elements.dev.js` from `vite.dev.config.js`. It shares one core, imported as `./index.js`, with `elements.js`, so both see the same `configure()` state.

### Changed

- Every `exports` entry now has `types`, `import` and `default` conditions. `sideEffects` lists `elements.js` and `elements.dev.js`.

### Breaking

- None.

### Internal

- `vite.lib.config.js` defines `__TS_DEV__` as false and folds `DEV` to a literal, so production drops the warning strings and `console.warn`.
- `npm run size` enforces the RFC 0002 budgets: core 8 kB, UMD 8 kB and all-in `tickslate/elements` with its core 40 kB, min + gzip. `elements.dev.js` is reported, not budgeted.
- `npm run verify:package` also checks the export conditions, `sideEffects`, `engines`, that `elements.js` has no `console.warn` while `elements.dev.js` has, that the dev build imports `./index.js` and never `elements.js`, DOM-free imports of both, and resolution under `--conditions=development`.
- `npm run release` order: test, build:lib, build:dev, build:umd, pack:lib, verify:package, size.
- CI keeps the Node 20, 22 and 24 test matrix and `engines` stays `>=20`.
