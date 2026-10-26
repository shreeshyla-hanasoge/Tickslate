### Added

- `createDashboard(target, options)` in `tickslate/elements`: builds a `<ts-grid>` and a tile for every item from a layout and an object of data, answers `ts-add-request` itself, and returns `{ grid, set, update, destroy }`, for hosts with no framework.
- `DashboardOptions` and `Dashboard` types.
- A vanilla example: a dashboard from a JSON file, updated on an interval.

### Internal

- Deviation from RFC 0004 §7.1: a catalog you pass is tried first and `widgetCatalog()` after it, as the grid itself resolves, so a partial catalog does not hide the built-ins.
- Deviation: ids in the top strip are reached through the profiles, because `readLayout` drops a strip id that no profile holds; there is no item to take a type from.
- A late `defineWidget()` makes tiles for items that were skipped for an unknown type (`onCatalogChange`).
- Data given for an id that no profile holds warns at creation unless `persist` is set, since a restored layout may add it; that data is kept for a later `ts-add-request` for the id.
- Data given to `update()` or `set()` for an id with no tile yet is kept, so a tile added later for that id (RFC 0004 §7.1, "if update or data had an entry") arrives with it.
- If `ts-grid` is not defined when `createDashboard` runs, the layout and tiles wait for `customElements.whenDefined('ts-grid')`, because properties set on an unupgraded grid are lost.
- Development warnings for a missing `layout` and for a second dashboard on the same target.
- Proposed amendment, not built: a per-tile label (a `labels` option of `{ id: label }` on `DashboardOptions`, which leaves `Layout` alone), so two metrics need not share the title "Metric". It needs an RFC 0004 amendment and the maintainer's approval; until then a host sets the `label` attribute on the tile.
