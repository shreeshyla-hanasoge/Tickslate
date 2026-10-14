### Added

- `persistLayout(grid, { key, defaults?, storage? })` in `tickslate/elements`: loads the user's layout for the current device, saves each `ts-layout-change`, switches entries when the grid crosses between phone and desktop, and returns `{ reset(device?), dispose() }`. Desktop and phone layouts are stored apart under `${key}:${device}`. Corrupt data is repaired through `readLayout`, and storage that throws is treated as empty.

### Changed

### Breaking

### Internal

- Tests with a fake grid and fake storage in `test/persist.test.mjs`.
