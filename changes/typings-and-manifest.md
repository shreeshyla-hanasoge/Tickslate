### Added

- `tickslate/jsx`, `tickslate/vue` and `tickslate/svelte`: types-only entries that add every `ts-*` tag, with its attributes and a typed `data`, to React, Vue and Svelte templates; write `import type {} from 'tickslate/jsx'` (or `vue`, `svelte`) once.
- `TsCommonAction`, `TsCardAction`, `TsMetricAction`, `TsChartAction`, `TsTodayPnlAction`, `TsEquityCurveAction` and `TsSessionClockAction`: the `ts-action` detail of each element as a union, with `addEventListener('ts-action', …)` typed to it.
- `TsOpenAction` and `TsChartSelectAction`: exported from `tickslate/elements` and each element's entry.
- `tickslate/custom-elements.json`: a Custom Elements Manifest listing every tag with its attributes, properties, events, parts and slots, also named by the package's `customElements` field.
- `tickslate/vscode.html-custom-data.json`: the same tags as VS Code HTML custom data, for attribute completion and hover.

### Changed

- `TsCard`'s `spec` is declared as a property, matching `TsWidget`, so `elements.d.ts` type-checks with `skipLibCheck` off.

### Internal

- A CommonJS host on `moduleResolution: node16` gets TS1541 for `import type {} from 'tickslate/jsx'`: add `with { 'resolution-mode': 'import' }` or `/// <reference types="tickslate/jsx" />` (see `test/types/README.md`).
- `scripts/gen-manifest.mjs` builds both manifest files from JSDoc tags in the `.d.ts` files; it fails for an undocumented tag, an unnamed or repeated tag, or a missing class.
- A new element needs an `@element` block in its `.d.ts`, and a line in `TsElementAttributes` if it has attributes of its own.
- `npm run check:types` compiles `test/types/` against `dist-lib/` under bundler, node16, node10, `exactOptionalPropertyTypes` and a CommonJS host; CI runs it after `npm run release`.
- New dev dependencies: `typescript` 5.9.3 (TypeScript 7 removes node10 resolution), `@types/react` and `vue`.
- `verify-package` checks each `src/types/` file has an `exports` and a `typesVersions` entry, and that both manifests list every tag.
- `pack-lib` refuses a typings file that imports react, vue or svelte at runtime, including `import 'react'` and `import { type X } from 'react'`.
- Difference from RFC 0003 §22.3: the "no documentation" failure covers tags a `define/` module registers, not the `WIDGETS` tags that have no element yet.
- `ts-grid` and the widget-base markup are documented in `src/elements/index.d.ts`, because `grid.d.ts` and `widget.d.ts` belong to other stories.
- The manifest lists instance members only, and Vue and Svelte event props use the loose `ts-action` detail.
