### Changed

- `<ts-grid>` ignores a second remove that follows the first within 400 ms, so double-clicking a remove badge, or pressing Delete twice, removes one tile instead of the tile that slid into its place. This held only while the fade ran; with reduced motion the second click used to remove the neighbour.
- `<ts-grid>` measures on the frame after a resize rather than inside the `ResizeObserver` callback, so WebKit no longer reports an uncaught "ResizeObserver loop completed with undelivered notifications" error when a grid is first laid out or resized.

### Internal

- Real-browser tests with Playwright: `npm run test:browser` runs `test/browser/*.spec.mjs` in Chromium, WebKit and an iPhone 14 profile (mobile Safari) against fixture pages under `test/browser/fixtures` that use made-up data and a frozen clock, with external network refused and traces kept on failure. `npm test` is unchanged and still needs no install.
- `render.spec.mjs` checks every registered widget at every size in both themes (box = rows x `--ts-row` + gaps, no console errors), that 100 data sets from 0 to +-1e12 and the skeleton, empty and error views never change a tile's box, that a `height: 100%` child fills a `<ts-card>` body, and that theme islands take their own theme.
- `grid.spec.mjs` covers columns at 1300, 900 and 420 px, implicit mode, long press, drag, touch, resize, remove with Undo, `undo()` and Add back, Done, outside tap, the keyboard, tap-to-place and `locked`.
- `a11y.spec.mjs` runs axe-core (WCAG 2.0 to 2.2 A and AA) over the widgets, the grid idle, locked, editing and with a tile held, the toast and Add back list, and the islands, in both themes; serious and critical violations fail.
- `@playwright/test` and `@axe-core/playwright` are dev dependencies at exact versions. A separate `browser` CI job installs the browsers with `npx playwright install --with-deps`, caches them, and uploads the report and traces when a run fails.
