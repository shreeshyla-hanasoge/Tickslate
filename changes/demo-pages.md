### Added

- `examples/index.html`, a page that links every example, the playground and the gallery. The playground and the gallery link back to it.
- Playground: `<ts-card>`, `<ts-metric>` and `<ts-chart>` tiles beside the finance ones, with made-up data and a slotted empty call to action. Controls for Locked, Simulate loading (skeletons for 800 ms before data) and Error (every tile shows its error view with Retry, which loads again). The edit controls, undo toast, Done pill and Add back appear as in any host. A theme switch with Auto (`data-theme="auto"`), Paper and Graphite.
- Gallery: the card at all seven sizes, the metric and the chart at every size they support, on desktop and phone, and a states row (loading, empty and error with Retry) for every widget. The states are built from `data = undefined`, `data = null` and `error`.

### Changed

- The playground saves its layout with `persistLayout(grid, { key: 'playground' })` instead of hand-written `localStorage` code. A layout saved by the old playground (`tickslate-playground-layout`) is no longer read.
- Both pages use relative links, so they work from any base path.

### Breaking

- None.

### Internal

- The hand-rolled `play-tile` element and its copied CSS are gone from the playground; `<ts-card>` replaces them.
