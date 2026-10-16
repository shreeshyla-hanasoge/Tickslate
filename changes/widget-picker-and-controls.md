### Added

- `<ts-widget-picker for="grid-id">` in `tickslate/elements/controls`: a modal dialog (a bottom sheet below 700px, centred above) with search over label and description, results grouped by category, a size chip per supported size and an Add back button per hidden tile. It says "Every widget is already on this layout" when nothing is left, closes on Escape and returns focus to where it was opened, and has 44px targets. `show(opener?)`, `close()`, `open` and the parts `sheet`, `search`, `group`, `row`, `chip`, `empty` and `close`.
- `<ts-grid-controls for="grid-id">` in the same entry: a profile switcher (Auto, Market hours, After close, with the next switch under it) that renders only when the grid has a `schedule`, and the link that makes the edit pill show **Add**, which opens the picker, in place of **Add back (n)**. `picker` names the picker to link; by default it is the one whose `for` is the same grid.
- `grid.add({ type, id?, size? })`, `grid.addTypes` and the cancelable `ts-add-request { type, id, size }` event: the picker offers catalog types only for the types a host lists in `addTypes` (or `'*'`) and answers by calling `preventDefault()` and rendering a child with `item=id`, which the grid places at the size asked for and commits as an `'add'`.
- `grid.move(id, toIndex)`, `grid.resize(id, size)`, `grid.remove(id)`, `grid.profileOverride` and `grid.openPicker`, so a host's own controls edit through the grid, each edit a commit with undo history and a `ts-layout-change`.
- Optional `description` and `category` on a widget's spec, for the picker, filled in for every built-in; a missing one falls back to the messages `widget.<type>.description` and `category.<name>`.
- Messages for the picker, the controls and the catalog's sentences and categories: `picker.*`, `controls.*`, `grid.add`, `grid.added`, `widget.<type>.description` and `category.*`.

### Changed

- A tile's type is now looked up in `widgetCatalog()` after the grid's own `catalog`, so a widget registered with `defineWidget()` is drawn without being added to `catalog`, and the grid draws again when one is registered.

### Internal

- Deviation from RFC 0003 §18.3: a group and an item both carry the translated category name in `category`, not the key, so the model's output is what the sheet shows. A spec with no category is listed under General.
- Deviation from §18.3: choosing a size chip or Add back closes the sheet, and a catalog type the host did not take (`add()` returned `null`) leaves it open. The RFC does not say either way.
- Deviation from §18.4: `openPicker` is called with the Add button as its one argument, so the picker can return focus to it. The declared type `() => void` still fits.
- The picker announces a restore with the grid's own status region (`grid._announce`) and a catalog add is announced by the grid when the child arrives (`grid.added`), so the picker never holds a copy of either. `<ts-grid-controls>` hears of a schedule, clock, override, locale or message change through `grid._onState`, which is not public.
- Chips, the close button and the switcher's buttons carry `tabindex="0"`, because Safari's default keyboard setting skips plain buttons, as the grid does for its Edit layout button.
- `define/controls.js` registers both elements. Test files outside the story's list changed for it, each by a line or two: `test/entries.test.mjs` (the tags of the controls module), `test/tile-chrome.test.mjs` (the controls module holds no widget), `test/docs-coverage.test.mjs` (the two elements are documented as non-widgets), `test/catalog.test.mjs` (the built-in specs now carry `description` and `category`) and `test/messages.test.mjs` (the unused-key allowlist). `src/elements/index.js` and `src/elements/index.d.ts` gather the new entry, and `scripts/pack-lib.mjs` ships `controls.d.ts`.
- New browser fixture `test/browser/fixtures/picker.html` and `test/browser/picker.spec.mjs`.
- Size: `tickslate/elements/controls` is 13,594 B min+gz bundled and has a new 15 kB budget. The core now carries the new messages and the catalog metadata, and the grid carries `add`, the editing methods and the picker link, so four existing rows are over their budgets and were not raised: equity-curve and today-pnl by 516 B each, the grid by 573 B and metric by 17 B. The maintainer decides.
