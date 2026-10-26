### Added

- `createDashboard(target, options)` in `tickslate/elements`: builds a `<ts-grid>` and a tile for every item from a layout and an object of data, answers `ts-add-request` itself, and returns `{ grid, set, update, destroy }`, for hosts with no framework. Guide: docs/guide/create-dashboard.md.
- `DashboardOptions` and `Dashboard` types.
- examples/vanilla-json.html: a dashboard from a JSON file, updated on an interval.

### Internal

- Deviation from RFC 0004 §7.1: a catalog you pass is tried first and `widgetCatalog()` after it, as the grid itself resolves, so a partial catalog does not hide the built-ins.
- Deviation: ids in the top strip are reached through the profiles, because `readLayout` drops a strip id that no profile holds; there is no item to take a type from.
- A late `defineWidget()` makes tiles for items that were skipped for an unknown type (`onCatalogChange`).
- Data given for an id that no profile holds warns at creation unless `persist` is set, since a restored layout may add it; that data is kept for a later `ts-add-request` for the id.
