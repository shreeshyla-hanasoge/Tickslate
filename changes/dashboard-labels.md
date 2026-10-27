### Added

- `createDashboard` takes `labels`, an object from item id to title, written as each tile's `label` attribute when the dashboard creates it, so two metrics can have different titles. It wins over `messages` on that tile and is never saved in the layout.
