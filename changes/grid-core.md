### Added

- `readLayout()` accepts a plain array of items as shorthand for a layout with that list in the `market` profile.
- `readLayout(input, { unknown: 'keep' })` keeps items whose widget no catalog knows, reporting each once as `{ code: 'unknown-widget', fixed: 'kept' }`. The default stays `'drop'`.
- A catalog may be a function `(item) => spec | null`, so two items of one type can have different sizes. This works wherever the core takes a catalog (`readLayout`, `place`, `addItem`, `resizeItem`, `dropIndex`); the `Catalog` type covers both forms.
- `DEFAULT_PROFILE` (`'market'`) and `typeForTag(catalog, tag)`, which finds a catalog key from a tag by own entries only.
- `WIDGETS` gains `card`, `metric` and `chart` for the generic widgets.

### Changed

- `LayoutIssue.fixed` can now be `'kept'`.

### Internal

- The `TsGrid` typings moved into `src/elements/grid.d.ts`, re-exported from `src/elements/index.d.ts` and shipped by `scripts/pack-lib.mjs`.
- Tests for function catalogs, `typeForTag`, the new entries, the array shorthand and `'keep'`.
