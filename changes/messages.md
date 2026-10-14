### Added

- `EN` and `createMessages(overrides, locale)`: every visible and every spoken string in one frozen table, and a `t(key, params?, count?)` with `{param}` interpolation and plural forms from `Intl.PluralRules`. A key a table leaves out falls back to English. The `Messages` and `Translate` types list every key.
- `configure({ messages })` translates or rewords every widget and grid; `currentConfig()` returns it, and `null` clears it.
- A `messages` property on any widget, and on `<ts-grid>` for every tile inside it, overrides the table for that subtree. Resolution is per key: the element, then the nearest grid, then `configure()`, then `EN`. Widgets also expose `t`, and view models receive it as `ctx.t`.
- Plural forms are keyed by suffix (`equity.dayCount.one`, `time.days.few`), with `.other` as the fallback, and follow the element's `locale`, then its grid's, then `configure()`.

### Changed

- Every string the widgets and the grid show or announce now comes from messages: the empty, error and Retry text, the chrome labels, the grid's announcements, the toast, the Add back list and each widget's own words. English output is unchanged.
- A built-in widget's default label and empty text are the `widget.<key>.label` and `widget.<key>.empty` messages, so a host overrides them in `messages` without a `label` attribute. A widget's own `static emptyText` still works, and a host's `widget.<key>.empty` wins over it.
- `<ts-grid>` observes `locale` so its messages pick plural forms in the right language.

### Internal

- Messages live in `src/core/messages.js` and are re-exported from the core. The widgets' and the grid's `STRINGS` and `TEXT` constants are gone; they were never in a package entry. The base's `static emptyText` equals `EN['widget.empty']`, and each built-in's equals its own `EN` value, which a test asserts.
- Static template text now sits in `data-k` nodes that `update()` fills from `this.t`, so a template stays a pure function of its variant. The empty view's fallback text is a `<span data-k="empty">` inside `slot="empty"`, and the Retry button's text is filled the same way.
- `test/messages.test.mjs` holds the pseudo-locale test: it wraps every `EN` value as ⟦…⟧, renders every widget at every size (content, loading, empty and error) and the grid's chrome in a fake DOM, and fails on any letter that is not wrapped, formatted by `fmt` or host data. It also asserts that no template or skeleton holds a word, that every key the source names exists in `EN`, that `Messages` in `index.d.ts` lists exactly the `EN` keys, and the Polish forms for 1, 2, 5, 12 and 22.
- Existing tests that built a view-model `ctx` by hand now pass `t: createMessages()`, and the ones that read English out of markup now read it from the `data-k` node it moved to.
- Differences from RFC 0003 §1, for the documentation story:
  - **Size names are not used by the grid yet.** `size.S` … `size.XL` and `size.name` ("Medium, 2 by 2") are in `EN`, and `sizeName(t, size)` in `src/core/messages.js` builds them (not exported from the package, so the bundles drop it until the picker uses it). The grid's handle, resize name and "size …" announcement still read the bare token ("Notes, S, position 2 of 5"), because RFC 0003 §1.3 and this story require English output to be unchanged and `test/browser/grid.spec.mjs` asserts that text. Switching is one change where the grid passes `size` to `grid.handle`, `grid.resize` and `grid.resized`.
  - **No roledescription string.** §1.2 lists "the `roledescription` strings" under `grid.*` but names no element, text or key, and 0.1.0 sets no `aria-roledescription` anywhere. Adding one would change the accessible output, so none was added.
  - **Keys that no code in this story uses were left out**, so the core carries no dead text: `widget.loading`, `widget.live`, the `.description` keys, `time.justNow`, `time.ago`, `time.stale`, `time.live`, `session.open247`, `category.*` and `action.*` beyond `action.retry`. The stories that need them add them to `EN`.
  - **`time.synced` is `synced {time}`.** The widgets read the words either side of `{time}` (`syncedParts` in `widget.js`) so a narrow tile can hide them, and a translation may put the time first.
  - **`TsGrid` has a readonly `t`**, which §1.1 gives only to `TsWidget`, because the grid's own strings need the same cached resolution and the picker will too.
  - **`catalog.js` is unchanged.** The built-in labels stay as literals in `WIDGETS`, for hosts that spread it into their own catalog, and a test asserts each equals `EN['widget.<key>.label']`. A spec label that is the English default gives way to the message; a host's own label is left as given.
  - **A table is cached by identity**, as the formatter's options are by value: assign a new object to `messages` or `configure()` to change a table.
  - The widgets' own families are `pnl.*` (Today's P&L), `equity.*` and `session.*`, plus `metric.*` and `chart.*`; the RFC lists only the last two.
- Size budgets, from `npm run release` (min + gzip, before this story in brackets): the core `dist-lib/index.js` is 10,394 B against its 9.5 kB (9,728 B) budget, so it is over by 666 B (8,485 B); the UMD is 10,551 B, over by 823 B (8,640 B). Both were left as they are, as RFC 0003 §25 asks. The `EN` table is nearly all of the growth. The all-in `tickslate/elements` plus core is 48,905 B against 50 kB (46,719 B), `elements.js` is 41,131 B (40,762 B) and `elements.dev.js` is 42,956 B (42,543 B). `npm run release` therefore ends in the two size failures; its tests, builds and package checks pass.
- Outside the story's file list: `docs/reference/core.md` gains a Messages section, because the docs-coverage test requires a heading for every core export.
