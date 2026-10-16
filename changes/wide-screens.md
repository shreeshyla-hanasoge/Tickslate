### Added

- `columnsFor(width, thresholds?)` and `deviceFor(width, thresholds?)` take optional `{ tablet, desktop }` thresholds, and `Thresholds` is a type.
- `<ts-grid>` has a `breakpoints` property (`{ tablet: 700, desktop: 1200 }` by default) that moves where columns change and re-measures when set.
- `--ts-grid-max-width` (default `none`) caps the board's width and centres it, so a large monitor keeps ordinary tiles.

### Internal

- The size model is unchanged: `Columns` stays `2 | 3 | 4`. A wider layout is RFC 0003 Decision 30.
- `test/presets.test.mjs` lists `--ts-grid-max-width` as not themed, like the other layout tokens.
