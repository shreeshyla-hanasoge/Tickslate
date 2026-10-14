### Internal

- The real-browser suite now runs on five Playwright projects: desktop Chromium, WebKit and Firefox, plus mobile Safari (iPhone 14) and mobile Chrome (Pixel 7). The CI browser job installs Firefox and runs all five.
- New `test/browser/grid-edge.spec.mjs` covers editing edge cases in a real DOM: implicit-mode reconcile after a framework re-render (following a drag, an insert before existing tiles, a removal, a child leaving the DOM), every way a tap-to-place hold ends without a move, and the outside-tap exit with grids nested in shadow roots.
- A grid inside a closed shadow root reads every tap inside it as an outside tap (`isOutside()` sees a path that stops at the closed host). The spec for it is marked `fixme` until `src/` is fixed.
