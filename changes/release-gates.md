### Internal

- `npm run size` prints raw, minified and min+gz bytes for the core, the elements entry and the UMD build, and fails if any is missing. The RFC 0001 §13 budgets (core 6 kB, elements 24 kB min+gz) start in warn mode.
- `npm run verify:package` refuses a `dist-lib/` whose manifest points at missing files, whose version disagrees with the `version` export, that lacks README, LICENSE or CHANGELOG, whose entries fail to import without a DOM, or whose tarball would hold files outside an allowlist.
- `npm run release` now runs test, build:lib, build:umd, pack:lib, verify:package and size, in that order.
- CI's build job runs the release chain, prints what `npm pack` would publish and keeps `dist-lib/` as a build artifact for 14 days.
- esbuild is an explicit dev dependency, pinned to 0.21.5, the version vite already uses.
