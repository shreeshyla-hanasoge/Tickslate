### Added

- Strict CSP and Trusted Types: widgets, the grid, the picker and the grid controls render styled and edit under `default-src 'self'; style-src 'self'; script-src 'self'` and under `require-trusted-types-for 'script'; trusted-types tickslate`, with no exception. See docs/guide/security.md.
- `configure({ styleNonce })`: the nonce for the `<style>` fallback below Safari 16.4, where constructed stylesheets are missing. A nonce configured after the elements are defined is applied to the fallback `<style>` elements already made.
- A development warning when the page's `trusted-types` directive does not allow the `tickslate` policy. The policy is private to the module; a second copy of Tickslate on a page needs `'allow-duplicates'`.

### Changed

- Widget CSS is one constructed stylesheet per widget class, adopted by each instance, rather than a `<style>` element in every shadow root.
- A tile's heading link and button, a chart's selectable points and the session clock's ticks are built with the DOM and `element.style`, not from markup strings.

### Internal

- `src/elements/html.js` is the one place markup is parsed: a lazy `tickslate` policy, templates parsed once and cloned, and a `securitypolicyviolation`-collecting browser suite (`csp.spec.mjs`, `tt.spec.mjs`). `test/html.test.mjs` asserts templates are pure functions of the variant and that no source writes markup, a `style` attribute or an evaluated string outside it.
- The browser specs add the policy headers to the fixture's response with `page.route`, so the Playwright config and the dev server are unchanged. Vite's hot-reload client is stubbed in those specs.
- Where a test double has no `createElement` (the node element tests), `html.js` writes the same markup as a string, so those tests read what they always did; a real document never takes that path.
- Edits outside the story's file list, all small: `src/core/format.js` (`styleNonce` accepted by `configure`), `src/core/index.d.ts`, `docs/reference/core.md`, `src/elements/series-chart.js`, `grid-controls.js`, `picker.js` and `default-tokens.js` (their markup and `<style>` sinks), and one regex in `test/tile-chrome.test.mjs` that found the grid's CSS between `<style>` tags.
