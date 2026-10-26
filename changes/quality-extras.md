### Added

- `docs/VERSIONING.md`: what counts as a breaking change for each public surface (exports, attributes, events, parts, `--ts-*` tokens, package entries) and how a release announces it.

### Internal

- Visual regression: `test/browser/visual.spec.mjs` compares every registered widget at every size, in the light, dark and default (no `data-theme`) palettes, on a desktop viewport, and on a phone viewport for the tiles it narrows. Chromium only. `npm run test:visual` compares; `npm run test:visual:update` rewrites the baselines in the pinned Playwright container. A `visual` CI job runs in that image and uploads the diff images on failure.
- Tightening of RFC 0004 §9.1: besides `maxDiffPixelRatio` 0.001 the comparison sets `maxDiffPixels` 0 and a per-pixel `threshold` of 0.005 (the RFC's ratio lets an XL table differ by hundreds of pixels), so a one-digit text change, a 1 px radius step and a 2-level accent shift all fail. The tile fixture takes `?exact=1` so each tile has its real column width.
- API snapshot: `test/api-surface.test.mjs` pins the exports, each tag's attributes, events, `ts-action` names and parts (including parts set with `setAttribute`), the `--ts-*` tokens and the package entries against `test/api-surface.snapshot.json`; `npm run api:update` rewrites it. It throws on `export *`.
- Coverage: `npm run coverage` enforces 90 % lines for `src/core` and 80 % for the view models, leaving out the DOM-bound infrastructure files (`html.js`, `layout-list.js` and the element classes listed in `package.json`). The `coverage` CI job runs on Node 22, the first version with the coverage flags, and fails the build on a miss.
- Deviation from RFC 0004 §9.1: the committed baselines are generated on macOS (`*-chromium-darwin.png`), not in the container. Commit the `visual-baselines` artifact of the first Linux CI run and delete the darwin files.
