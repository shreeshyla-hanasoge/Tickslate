# Examples

Four small apps with the same dashboard: `vanilla-cdn`, `react-vite`, `vue-vite`
and `svelte-vite`. Figures are made up.

Each `package.json` points `tickslate` at `file:../../dist-lib`, the build of
this checkout, so a run from the repo never pulls npm's release by accident:

```bash
npm run release                 # builds dist-lib/ (from the repo root)
cd examples/react-vite
npm install && npm run dev
```

To try the published package instead, copy the example out of the repo and set
the dependency to a version, for example `"tickslate": "0.3.1"`, or run
`npm install tickslate@latest` inside the copy.

`npm run test:consumers` (repo root) is what CI runs: it packs `dist-lib/`,
copies each example to a temp directory, swaps the dependency for that tarball,
builds and smoke-tests it.
