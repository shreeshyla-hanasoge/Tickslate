### Added

- `<ts-widget-picker>`: a sheet to add widgets from, with search, categories, a size button per size and Add back for hidden tiles.
- `<ts-grid-controls>`: a Auto, Market hours and After close switcher for scheduled grids, and the link that makes the edit pill's Add open the picker.
- `grid.add()`, `grid.addTypes` and the cancelable `ts-add-request` event, for the host to answer by rendering a tile.
- `grid.move()`, `grid.resize()` and `grid.remove()`, which edit like a drag, with undo, a `ts-layout-change` and a spoken announcement.
- `grid.profileOverride` and `grid.openPicker`.
- `description` and `category` on a widget's spec, filled in for every built-in widget.
- Messages for the picker, the controls, the catalog's descriptions and categories, and a failed add.

### Changed

- A widget registered with `defineWidget()` is drawn by any grid without being added to its `catalog`.

### Internal

- Deviation from RFC 0003 §18.3: a group and an item both carry the translated category name in `category`, not the key, so the model's output is what the sheet shows. A spec with no category is listed under General.
- Deviation from §18.3: choosing a size chip or Add back closes the sheet, and a catalog type the host did not take (`add()` returned `null`) leaves it open. The RFC does not say either way.
- Deviation from §18.4: `openPicker` is called with the Add button as its one argument, so the picker can return focus to it. The declared type `() => void` still fits.
- The picker announces a restore with the grid's own status region (`grid._announce`) and a catalog add is announced by the grid when the child arrives (`grid.added`), so the picker never holds a copy of either. `<ts-grid-controls>` hears of a schedule, clock, override, locale or message change through `grid._onState`, which is not public.
- Chips, the close button and the switcher's buttons carry `tabindex="0"`, because Safari's default keyboard setting skips plain buttons, as the grid does for its Edit layout button.
- `define/controls.js` registers both elements. Test files outside the story's list changed for it, each by a line or two: `test/entries.test.mjs` (the tags of the controls module), `test/tile-chrome.test.mjs` (the controls module holds no widget), `test/docs-coverage.test.mjs` (the two elements are documented as non-widgets), `test/catalog.test.mjs` (the built-in specs now carry `description` and `category`) and `test/messages.test.mjs` (the unused-key allowlist). `src/elements/index.js` and `src/elements/index.d.ts` gather the new entry, and `scripts/pack-lib.mjs` ships `controls.d.ts`.
- New browser fixture `test/browser/fixtures/picker.html` and `test/browser/picker.spec.mjs`.
- Size: `tickslate/elements/controls` is 13,594 B min+gz bundled and has a new 15 kB budget. The core now carries the new messages and the catalog metadata, and the grid carries `add`, the editing methods and the picker link, so four existing rows are over their budgets and were not raised: equity-curve and today-pnl by 516 B each, the grid by 573 B and metric by 17 B. The maintainer decides.
- Review fixes: a request the host takes with `preventDefault()` and never answers keeps the picker open until the child arrives, and after 10 seconds the grid announces `grid.addFailed`, releases the id and warns in development. A second `add()` for an id still waiting returns `null`. Two children with one waiting `item`, a non-size passed to `resize()` and a non-number passed to `move()` warn once in development. A picker with no grid says `picker.noGrid`. `<ts-grid-controls>` redraws only when its grid or picker changes, queues one `whenDefined` per tag and caches its formatter.
- `test/non-widget-defines.mjs` lists the define modules whose elements are not widgets (`controls`), so the entries, tile-chrome and docs-coverage tests share one exception, and a later story adds one line there.
