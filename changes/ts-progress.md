### Added

- `<ts-progress>` (sizes S and Wide): a gauge for a value against a goal or a limit. In `limit` mode the bar turns to `--ts-warn` from `warnAt` (default 0.75) and to `--ts-loss` with stripes at 100%; in `goal` mode it turns to `--ts-profit` at 100%. It reads "6,400 of 10,000 · 64%", names the state in words ("near limit", "over limit", "goal reached") and shows a dash and no bar without a valid `target`. Its entry is `tickslate/elements/progress`.
- The `ProgressData`, `ProgressModel` and `TsProgressAction` types, `TsProgress.progressModel()`, the `progress` entry in `WIDGETS` (General), and the `widget.progress.*` and `progress.*` messages.

### Internal

- The bar is `role="meter"` (0 to 100) with `aria-valuetext`; RFC 0003 §17 names no role.
- `ProgressModel` also carries what the element needs: `label`, `live`, `time`, `synced`, `stateText`, `valueText`, `valueNum` and `pctNum`. A missing or non-numeric `value` is state `none`, like a missing target.
- `warnAt` outside (0, 1] falls back to 0.75.
