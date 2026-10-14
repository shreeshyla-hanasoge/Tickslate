### Added

- `static spec = { label, sizes, phoneRows? }` on a `TsWidget` subclass describes a widget that has no catalog entry: its size is snapped to those sizes and its tile is named by the label. `catalogKey` still works and wins when both are set.
- Every widget has a read-only `spec` getter returning `{ label, sizes, phoneRows? }`, which a subclass may override.
- Every registered element class carries `static tickslateVersion`, the version of the Tickslate that registered it.
- In development, a widget with no label from any source warns once, and a tag already owned by another class warns once, naming both Tickslate versions or saying the owner is a non-Tickslate element.

### Changed

- A widget with no label is named by its tag rather than an empty `aria-label`.
- Registering a tag that a different class already owns is no longer silent in development.

### Internal

- `src/elements/dev.js` holds the development switch `DEV` (true unless a build defines `__TS_DEV__` as false), `warnOnce(key, message)` and `resetWarnings()`; call sites are written `if (DEV) warnOnce(...)`.
- `define(tag, ctor)` moved from `src/elements/index.js` to `src/elements/registry.js`. The entry registers the same four elements and its exports are unchanged.
- Tests for spec precedence, size filtering, the label fallback and registration.
