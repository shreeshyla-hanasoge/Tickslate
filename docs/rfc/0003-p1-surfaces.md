# RFC 0003 — Every P1 surface: messages, entries, authoring, tile chrome, themes, new widgets and editing extras

| | |
|---|---|
| Status | **Approved** (14 Oct 2026), with every recommended option of §28. P1 ships as 0.2.0. |
| Written | 14 Oct 2026 |
| Amends | [RFC 0002](0002-integration-and-ux.md) §1.6, §1.8, §1.9, §2.2, §2.4, §2.5, §3.3, §4.4, §5, §6, §7, §8, §9, §10, §11 and §14 (point I); [RFC 0001](0001-api.md) §2, §4.1, §6, §7, §8.1, §8.5 and §8.6 |
| Covers | Every public name the P1 stories add: overridable messages, per-widget entries and the CDN bundle, `defineWidget`, the `persist` attribute, tile chrome, freshness and flash, tile activation, wide screens, reading order, locale formatting, right-to-left grids, overnight sessions, theme presets and palettes, strict CSP and Trusted Types, `<ts-chart>` bars, `<ts-table>`, `<ts-progress>`, the picker and grid controls, the phone top strip, the layout list editor, the remaining finance widgets, typings and a manifest |
| Sources | RFC 0001, RFC 0002, [docs/BRIEF.md](../BRIEF.md), [docs/ACCESSIBILITY.md](../ACCESSIBILITY.md), and the P1 stories of the build plan. It takes no new measurements. |
| Approval | The maintainer accepted every recommendation ("go with the recommendations") on 14 Oct 2026. |

RFC 0001 and RFC 0002 stay the contract for everything this RFC doesn't
mention. Each section below says which sections it amends. Where this RFC and
RFC 0002 differ, this RFC wins, and RFC 0002's §12 points here.

Every P1 story in the build plan implements a part of this RFC, so the names below are the ones those stories use. Each section
says which stories implement it.

**How P1 stories use this RFC**

- **They implement it and never edit it.** A story that finds a name, a
  signature or a behaviour that can't be built as written records the
  difference in its changes fragment (`changes/<story-id>.md`, under
  `### Internal`) and builds the nearest thing that works. It does not touch
  this file.
- **Later amendments go through one documentation story**, which collects the
  differences the stories found, applies them here in a single reviewed change
  and asks for approval once. Stories running in parallel therefore never edit
  an RFC at the same time.
- **A story's file list is the boundary.** Where this RFC puts a name in a file
  the story doesn't own (the grid's editing methods in §18, for example), the
  section says which story builds it.

**Conventions in this RFC**

- Signatures are TypeScript, as they will appear in `src/core/index.d.ts`,
  `src/elements/index.d.ts`, `src/elements/grid.d.ts`,
  `src/elements/widget.d.ts` and `src/elements/controls.d.ts`.
- *Internal* marks a module or helper that the stories build and test but that
  no package entry exports. It is written down so stories agree on it; it can
  change without an RFC.
- Every figure in this RFC is made up.
- English strings quoted here are the `EN` defaults of §1. Every one of them is
  overridable, so a string in this RFC fixes what English says, not what a host
  sees.

**Which story builds which section**

| Section | Story |
|---|---|
| §1 Messages | `messages` |
| §2 Entries, the CDN bundle and the development tree | `entries-and-cdn` |
| §3 The authoring kit | `authoring-kit` |
| §4 `persist` and storage adapters | `persist-attribute` |
| §5 Tile chrome | `tile-chrome` |
| §6 Freshness and flash | `freshness-and-flash` |
| §7 Tile activation and point selection | `tile-activation` |
| §8 Locale formatting | `locale-formatting` |
| §9 Right-to-left grids | `rtl` |
| §10 Wide screens | `wide-screens` |
| §11 Reading order | `reading-order` |
| §12 Overnight and 24/7 sessions | `overnight-sessions` |
| §13 Theme presets and palettes | `theme-presets`, `widget-a11y-visuals` |
| §14 Strict CSP and Trusted Types | `csp-trusted-types` |
| §15 `<ts-chart>` bars and categories | `ts-chart-bars` |
| §16 `<ts-table>` and keyed rows | `ts-table` |
| §17 `<ts-progress>` | `ts-progress` |
| §18 The picker, grid controls and grid editing methods | `widget-picker-and-controls` |
| §19 The phone top strip | `phone-top-strip` |
| §20 The layout list editor | `layout-list-editor` |
| §21 The finance set | `pnl-calendar`, `edge-stats-and-funding`, `watchlist-and-positions` |
| §22 Typings and the manifest | `typings-and-manifest` |
| §23 Performance hygiene | `perf-hygiene` |
| §24 Tooling and documentation stories | `browser-matrix`, `consumer-examples`, `demo-site`, `community-files`, `changelog-date` |
| §25 Budgets | `entries-and-cdn`, then each story that adds an entry |

## 1. Messages (amends RFC 0002 §2.4, §5.11 and §10)

Every visible and every spoken string is overridable, so a host can translate
Tickslate or reword it without a fork. RFC 0002 put each module's English
strings in one frozen constant; this section makes them one shared table. It is
the first P1 infrastructure pass: every later widget is built on it.

*Implemented by: messages.*

```ts
// tickslate
/** Every key and its English text. Frozen; keys are flat and dotted. */
declare const EN: Readonly<Messages>

/** One entry per key, each a string. Plural keys are listed by their forms (§1.2). */
interface Messages { 'widget.empty': string /* … every key … */ }
type MessageKey = keyof Messages

/** `{param}` interpolation and plural forms; a missing key falls back to EN, then to the key itself. */
type Translate = (key: MessageKey, params?: Record<string, string | number>, count?: number) => string

function createMessages(overrides?: Partial<Messages> | null, locale?: string): Translate

// configure() gains one option; currentConfig() returns it.
function configure(options: FormatOptions & { messages?: Partial<Messages> }): void
```

```js
configure({ messages: { 'widget.empty': 'Keine Daten' } })   // every widget, from now on
```

`EN`, `createMessages` and the `Messages` and `Translate` types are exported
from `tickslate`. The core stays free of side effects: `createMessages` builds a
closure and logs nothing.

### 1.1 Where overrides come from

```ts
class TsWidget {
  /** Overrides for this widget's strings; null clears. */
  messages: Partial<Messages> | null
  /** Resolved for this element: element → nearest <ts-grid> → configure() → EN. */
  readonly t: Translate
}
class TsGrid {
  /** Overrides for the grid's own strings and for every tile inside it. */
  messages: Partial<Messages> | null
}
interface ViewModelContext { t: Translate }   // added next to fmt, now and label
```

- Resolution is **per key**: an element that overrides one key still gets every
  other key from its grid, then `configure()`, then `EN`.
- `t` is cached like the formatter (RFC 0001 §10) and rebuilt when the
  element's `messages`, its grid's `messages`, `configure()` or the locale
  changes. A change re-renders the affected tiles (§8 describes the shared
  mechanism).
- `messages` is a property only. A host passing JSON through markup sets it from
  script, as with `layout`.
- The plural rules come from the same locale as the formatter (`locale`
  attribute, then the grid's, then `configure()`).

### 1.2 Keys, parameters and plurals

- **Keys are `family.name`**, lower camel case after the first dot. A key with
  plural forms is never looked up bare: `t('time.days', {}, 2)` reads
  `time.days.<category>`, where the category is `Intl.PluralRules(locale)
  .select(count)` (`zero`, `one`, `two`, `few`, `many`, `other`), then
  `time.days.other`, then `time.days`. `{count}` is always available as a
  parameter.
- **Parameters** are written `{name}`. A placeholder with no parameter stays as
  written, so a missing value shows up rather than vanishing. Values that are
  numbers, times or money are formatted with `fmt` before they are passed in;
  `t` never formats.
- **Lookups are exact.** There is no locale negotiation: a host that translates
  passes its own table for its own locale.

| Family | Holds | Parameters |
|---|---|---|
| `widget.*` | The base's strings: `widget.empty` ("No data"), `widget.error` ("Couldn't display this data"), `widget.error.region` ("{label}, error: {message}"), `widget.loading`, `widget.live` | `label`, `message` |
| `widget.<key>.label`, `.description`, `.empty` | A catalog entry's name, one-line description (§18) and empty text. A catalog label falls back to `t('widget.<key>.label')` when the spec has none (§3). | |
| `action.*` | Button names: `action.retry`, `action.sort`, `action.rebalance`, `action.addInstrument`, `action.exitPosition`, `action.exitAll` | `label` |
| `size.*` | `size.S` … `size.XL` ("Small", "Wide", "Tall", "Medium", "Large", "Banner", "Extra large") and `size.name` ("{name}, {cols} by {rows}"), so a size reads "Medium, 2 by 2" | `name`, `cols`, `rows` |
| `time.*` | `time.justNow`, `time.ago`, `time.days.<form>`, `time.stale`, `time.synced`, `time.live` (§6) | `age`, `time`, `count` |
| `grid.*` | The grid's chrome and announcements (RFC 0002 §5.11's table), the handle, remove and resize names (§5.9), the toast, the pill, the empty panel, `grid.dashboard` ("Dashboard") and the `roledescription` strings | `label`, `size`, `position`, `total`, `profile`, `count` |
| `session.*` | Session clock text, including `session.open247` ("Open 24/7") | `session`, `time` |
| `chart.*`, `metric.*`, `table.*`, `progress.*`, `funding.*`, `calendar.*`, `edge.*`, `watchlist.*`, `positions.*` | Each widget's own strings | per key |
| `picker.*`, `controls.*`, `list.*` | §18 and §20 | per key |
| `category.*` | Catalog category names (`category.general`, …) | |

`EN` itself is the complete list, and a `Messages` interface in
`src/core/index.d.ts` types every key. The stories write no English literal
outside it.

### 1.3 What the stories must show

- **English output is unchanged** by this section; moving a string into `EN`
  changes no rendered text.
- **No English UI literal remains** in `src/elements` templates, view models or
  grid constants. Static template text sits in `data-k` nodes that `update()`
  fills from `ctx.t`, so a template stays a pure function of its variant (§14).
- **A pseudo-locale test** wraps every `EN` value as `⟦…⟧`, renders every
  widget and the grid with it, and asserts that every string in the output is
  either wrapped, formatted by `fmt`, or host data. A second test asserts that
  every key the code uses exists in `EN`.
- **Polish** is the plural proof: 2 and 22 days take `few`, 5 takes `many`.
- The base's `static emptyText` stays as the English fallback and a test asserts
  it equals the matching `EN` value, so a widget author who sets it keeps working
  and a host who overrides `widget.<key>.empty` wins.
- The base's former exported `STRINGS` objects were never part of a package
  entry; they are replaced by `EN`.

## 2. Entries, the CDN bundle and the development tree (amends RFC 0001 §2 and RFC 0002 §8)

Pay only for what you import, and run without a bundler.

*Implemented by: entries-and-cdn.*

### 2.1 Per-widget entries

`tickslate/elements` still registers everything and still exports the same
names. Each element also has its own entry, whose module registers exactly one
tag:

| Entry | Registers | Define module |
|---|---|---|
| `tickslate/elements` | Every element | `src/elements/index.js` |
| `tickslate/elements/grid` | `<ts-grid>` | `define/grid.js` |
| `tickslate/elements/card` | `<ts-card>` | `define/card.js` |
| `tickslate/elements/metric` | `<ts-metric>` | `define/metric.js` |
| `tickslate/elements/chart` | `<ts-chart>` | `define/series-chart.js` |
| `tickslate/elements/today-pnl` | `<ts-today-pnl>` | `define/today-pnl.js` |
| `tickslate/elements/equity-curve` | `<ts-equity-curve>` | `define/equity-curve.js` |
| `tickslate/elements/session-clock` | `<ts-session-clock>` | `define/session-clock.js` |
| `tickslate/elements/table`, `progress`, `pnl-calendar`, `edge-stats`, `capital-funding`, `watchlist`, `open-positions` | The tag of the same name | `define/<name>.js`, each added by the story that builds the widget |
| `tickslate/elements/controls` | `<ts-widget-picker>` and `<ts-grid-controls>` | `define/controls.js` |
| `tickslate/elements/layout-list` | `<ts-layout-list>` | `define/layout-list.js` |
| `tickslate/elements/mini-chart` | `<ts-mini-chart>` | Unchanged from RFC 0001 §2 |

- A define module calls the shared `define()` (RFC 0002 §2.2) for its one tag
  and re-exports the class, so `import { TsMetric } from 'tickslate/elements/metric'`
  both registers and types.
- **The entry name is the tag without `ts-`.** The chart's define module keeps
  the name `series-chart.js` because its class lives in `series-chart.js`;
  `scripts/pack-lib.mjs` maps that one name to `chart`.
- **Discovery is automatic.** `vite.lib.config.js`, `vite.dev.config.js` and
  `scripts/pack-lib.mjs` read `src/elements/define/*.js`, so a story that adds a
  widget adds one file and touches no build script.
- `src/elements/index.js` imports every define module, so the all-in entry is
  the same set as before plus the new widgets.
- `package.lib.json` is generated: `exports`, `typesVersions` and `sideEffects`
  come from the define list rather than being written by hand.

### 2.2 Export conditions and the development tree

Every elements entry has `types`, `development`, `import` and `default`, in that
order:

```json
"./elements/metric": {
  "types": "./elements/metric.d.ts",
  "development": "./dev/elements/metric.js",
  "import": "./elements/metric.js",
  "default": "./elements/metric.js"
}
```

- **Production files** are `dist-lib/elements.js` and
  `dist-lib/elements/<name>.js`, with shared chunks in `dist-lib/chunks/`.
- **The development tree** is `dist-lib/dev/elements.js`,
  `dist-lib/dev/elements/<name>.js` and `dist-lib/dev/chunks/`. It is built with
  `__TS_DEV__` true, its chunks are shared among themselves, and every file
  imports the one core file, `dist-lib/index.js`, by a relative path, never a
  development copy of it, so both trees share one core and one `configure()`
  state. This replaces RFC 0002 §8's single
  `elements.dev.js`; its `development` condition now points into `dev/`.
- **Separation is checked.** `verify-package` asserts that every `import` export
  has a `development` one, that production and development files never import
  each other, and that no production file contains `console.warn`.
- **`sideEffects`** lists the entry files (`./elements.js`, `./elements/*.js`,
  `./dev/elements.js`, `./dev/elements/*.js`) and `*.css`. Chunks are not
  listed: they define classes and register nothing.

### 2.3 The one-script CDN bundle

```html
<script src="https://cdn.example/tickslate/cdn/tickslate.iife.js"></script>
<ts-grid>…</ts-grid>
```

| File | What it is |
|---|---|
| `dist-lib/cdn/tickslate.js` | Minified ESM. Core and every element in one file, registering all elements. |
| `dist-lib/cdn/tickslate.iife.js` | The same code as an IIFE. Sets `window.Tickslate` (every export of `tickslate` and `tickslate/elements`, which share `version`) and registers all elements. |
| `dist-lib/umd/tickslate.umd.js` | Unchanged: the core only. |

`package.json`'s `unpkg` and `jsdelivr` fields point at the IIFE, so a bare
`<script src>` on either CDN gets a working dashboard. Both CDN files are listed
in `exports` as plain paths (`./cdn/tickslate.js`, `./cdn/tickslate.iife.js`)
and are built by `vite.cdn.config.js`. The CDN bundle is production only; it
contains no development warnings.

### 2.4 Checks

- `import 'tickslate/elements/metric'` bundled with esbuild contains no
  `ts-equity-curve` and no `ts-grid` string (`verify-package`).
- A test with a fake `customElements` asserts that each define module registers
  exactly its own tag.
- `scripts/check-size.mjs` budgets every entry and the CDN files (§25).

## 3. The authoring kit (amends RFC 0002 §1.6 and §2.2)

A host registers its own widget and the grid, the picker and the catalog all see
it.

*Implemented by: authoring-kit.*

```ts
// tickslate/elements
/**
 * Defines `tag` as `Ctor` (RFC 0002 §2.2 rules), and records the class's static
 * spec under `options.type`. Calling it again with the same class does nothing.
 * Throws TypeError for a built-in key such as 'todayPnl', for a type already
 * recorded by a different class, for a class whose static spec has no valid
 * size, and when the tag is owned by a different class.
 */
function defineWidget(tag: string, Ctor: typeof TsWidget, options: { type: string }): void

/** A frozen merge of WIDGETS and every registered spec, cached until the next registration. */
function widgetCatalog(): WidgetCatalog

/** `fn` runs after each registration with the new type. Returns an unsubscribe function. */
function onCatalogChange(fn: (type: string) => void): () => void
```

- **The recorded spec** is `{ tag, label, sizes, phoneRows?, description?, category? }`
  from the class's validated static `spec` (RFC 0002 §2.1, plus the two optional
  strings of §18). A class with no label records `''`, and consumers then show
  `t('widget.<type>.label')`, then the type.
- **State is a module-level `Map`**, so two imports of the same bundle share
  it. Two copies of Tickslate each have their own, which is why a second copy's
  `defineWidget` for an existing tag throws rather than splitting the catalog.
- **Spec resolution gains a step** (amends RFC 0002 §1.6): the element's own
  spec, then the host's `catalog[type]`, then `widgetCatalog()[type]`, which
  includes `WIDGETS`. The grid consults `widgetCatalog()` from the picker story
  onward; until then `WIDGETS` is the third source.
- **`onCatalogChange`** lets the grid re-render, and the picker rebuild its
  list, when a widget registers after they connected.

### 3.1 Helpers for widget authors

`tickslate/elements` also exports three pure helpers, declared and documented as
**stable for 0.x**:

```ts
function scale(d0: number, d1: number, r0: number, r1: number): (v: number) => number

function linePaths(
  points: ReadonlyArray<{ x: number; y: number }>,
  options: {
    width: number; height: number; pad?: number
    xDomain?: [number, number]; yDomain?: [number, number]
    includeZero?: boolean      // default true
    maxPoints?: number         // default 2 × width; Infinity turns downsampling off (§23)
  },
): { line: string; area: string; zeroY: number; x: (v: number) => number; y: (v: number) => number }

function escapeHtml(s: unknown): string
```

`docs/guide/custom-widgets.md` walks through a made-up MRR widget (static spec,
template, pure `viewModel`, `update`, `emit`, states, `dataShape`, numbers
changing in place, `fit()` and `defineWidget`), with `examples/custom-widget/`
and a test that CI runs with `node --test examples/custom-widget/` and no
install.

## 4. Saving layouts: the `persist` attribute and storage adapters (amends RFC 0002 §1.9)

Zero-code persistence for markup, and remote storage for hosts that keep layouts
on a server. `persistLayout` (RFC 0002 §1.9) stays the engine.

*Implemented by: persist-attribute.*

```html
<ts-grid persist="ops-dashboard">…</ts-grid>
```

```ts
class TsGrid {
  /** Attribute and property. A key; null (or no attribute) turns saving off. */
  persist: string | null
}

/** Remote or async storage for persistLayout. Either method may return a promise. */
interface LayoutAdapter {
  load(device: Device): Layout | LayoutItem[] | unknown | null | undefined | Promise<Layout | LayoutItem[] | unknown | null | undefined>
  save(device: Device, layout: Layout): void | Promise<void>
  /** Called by reset(); without it reset() only applies the defaults. */
  remove?(device: Device): void | Promise<void>
}

// tickslate/elements. `key` is required unless `adapter` is given.
function persistLayout(grid: TsGrid, options: {
  key?: string
  defaults?: Layout | LayoutItem[] | { desktop: Layout | LayoutItem[]; phone?: Layout | LayoutItem[] }
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  adapter?: LayoutAdapter
}): { reset(device?: Device): void; dispose(): void }
```

### 4.1 The attribute

- `<ts-grid persist="my-dash">` is `persistLayout(grid, { key: 'my-dash', defaults })`
  with `localStorage`. The grid attaches in `connectedCallback` and disposes in
  `disconnectedCallback`, so a re-parented or removed grid leaves no listeners.
- **Defaults** are the grid's layout as it stands when the device is first known
  (the `initial` `ts-columns-change`): the implicit layout seeded from its
  children, or the layout the host set. A saved layout then replaces them, and
  `reset()` returns to them.
- Changing `persist` disposes the old attachment and attaches the new key.
  Removing it disposes. An empty value is the same as no attribute, with one
  development warning.
- A grid that also has a host-made `persistLayout` attachment is saved twice
  to two keys; the flag in §4.3 lets development say so.

### 4.2 Adapters

- **Loading.** While `load` is pending the grid shows the defaults. A pending
  load that resolves after the device changed, after `reset()` or `dispose()`,
  or after a later load started, is **stale and ignored**; a request counter
  decides. A load that resolves after the user has already committed an edit on
  that device is also stale: the user's edit wins.
- **A rejected or throwing `load`** counts as nothing stored, with one
  development warning. The result goes through `readLayout(raw, { unknown: 'keep', device })`
  as for `localStorage`.
- **Saving.** `save(device, layout)` is called on each `ts-layout-change`, in
  event order, and not awaited. A rejection or a throw is caught and warns once
  in development; the adapter owns retries and ordering.
- **`adapter` wins over `storage`**; giving both warns once in development. An
  adapter has no `key`, so it names its own storage.

### 4.3 The "edits will be lost" warning (RFC 0002 §7.2, new row 16)

`persistLayout` sets an internal flag on the grid it manages (`grid._persisted`,
Internal). On the grid's **first committed edit**, if the flag is unset, development
warns once for that grid:

```
tickslate: <ts-grid> edits will be lost on reload: add a persist attribute, or call persistLayout(). See docs/guide/saving-layouts.md
```

A locked grid never commits, so it never warns. Production builds contain
neither the flag check nor the string.

## 5. Tile chrome (amends RFC 0002 §2.4, §6.4 and §10, and docs/ACCESSIBILITY.md)

One pass over the base and every existing widget, so each later widget is built
once on the final chrome. It runs before any new P1 widget.

*Implemented by: tile-chrome.*

### 5.1 The shared header

```ts
// Internal (src/elements/widget.js), used by every widget's templates.
function header(opts?: {
  dot?: boolean       // the status dot: live, stale or hidden (§6)
  meta?: boolean      // the right-hand meta text: 'synced 11:42', 'Stale · 3 min'
  actions?: boolean   // a <slot name="actions"> after the meta, as <ts-card> has
  extra?: string      // markup after the label, such as the equity range buttons
}): string
```

It renders `[status dot][label][spacer][meta]`, with `part="header"` on the row
and `part="label"` on the label. Today's P&L, the equity curve, the session
clock, `<ts-card>`, `<ts-metric>` and `<ts-chart>` all use it, and so does every
widget after them. It is internal for now; promoting it for custom widgets is a
later documentation story.

### 5.2 Tile semantics (amends RFC 0002 Decision 25; Decisions 28 and 29)

| Was (0.1.0) | Now |
|---|---|
| Each tile is `<section part="tile" aria-label="…">`, so each is a region landmark | Each tile is `<div part="tile" role="group">` named by the view model's `ariaLabel` (the label, then the headline: `Signups, 1,204, up 12% vs last week`) |
| The label is a styled `<span>` | The label is `role="heading"` with `aria-level` from `heading-level` |
| Nothing names the dashboard | `<ts-grid>`'s board (`part="board"`) is `role="region"`, named by the host's `aria-label` attribute, else `t('grid.dashboard')` |

- The group's name is the **headline sentence**, not the bare label, so
  docs/ACCESSIBILITY.md item 1 keeps its rule that the name states the result.
  The heading carries the plain label for heading navigation.
- **`heading-level`** is an attribute on a widget or a grid, `1` to `6`.
  Resolution: the widget's own, then the nearest `<ts-grid>`'s, then **3**
  (Decision 29).
  An invalid value falls back to the default with one development warning. The
  heading is `role="heading"` plus `aria-level`, never an `<h3>`, so shadow
  styles stay in control.
- **`aria-label` is written only when its value changes**, so a ticking value
  doesn't make a screen reader re-read the tile.
- A tile with no label from any source is still named by its tag (RFC 0002
  §2.1), and its heading is hidden from the accessibility tree.

### 5.3 Parts

Every widget exposes the same eight parts, and a test asserts each widget's
template contains them:

| Part | Element |
|---|---|
| `tile` | The tile box |
| `header` | The header row |
| `label` | The heading text |
| `value` | The headline figure (for a widget with one) |
| `chart` | The drawing box (for a widget with one) |
| `empty` | The empty view |
| `error` | The error view |
| `skeleton` | The loading view |

A widget may add parts of its own, which its docs page lists. `::part()` reaches
all of them from the host's CSS.

### 5.4 Typography tokens

| Token | Default (both themes) | Used by |
|---|---|---|
| `--ts-label-size` | `10px` | `.lb`, the label |
| `--ts-label-case` | `uppercase` | `.lb` (`text-transform`) |
| `--ts-label-tracking` | `.12em` | `.lb` (`letter-spacing`) |
| `--ts-label-weight` | `600` | `.lb` |
| `--ts-headline-weight` | `500` | `.big`, `.xbig` (replaces the direct use of `--ts-num-weight`; defaults to it) |

The defaults are today's values, so nothing moves. Each token exists in both
`tokens.css` and `default-tokens.js` (the sync test keeps them equal) and in the
docs' token table.

### 5.5 Forced colours, direction and text alternatives

- **Forced colours.** Under `@media (forced-colors: active)` the session-clock
  fill and ticks, the live dot, Today's P&L marks, chart lines, `.btn.on` and the
  metric target bar use the system colours `Highlight`, `CanvasText` and
  `ButtonFace`, and stay visible. These are the one place widget CSS names a
  colour, which the token rule allows because the user agent owns them (§29,
  point 1).
- **Logical properties only.** A regex test fails on `left`, `right`,
  `margin-left`, `padding-right`, `text-align: left|right` and the like in widget
  CSS. Figures use `unicode-bidi: isolate`, and chart drawing boxes force
  `direction: ltr`, because time runs left to right in every locale.
- **Text alternatives.** Decorative glyphs (▲, ▼, dots, icons) are
  `aria-hidden`. A live tile's name ends with `, live` (`time.live`), and a stale
  one with `, stale` (§6). Entry and exit marks differ in **shape**, not colour
  alone: an entry is a circle and an exit a diamond. Range buttons add a
  visually hidden expansion, so `1W` is announced as "1W, 1 week".
- **Gains and losses carry arrows.** This closes the gap RFC 0002 §14 point I
  listed: Today's P&L and the equity curve gain an `aria-hidden` ▲ or ▼ beside
  every signed gain and loss, as docs/ACCESSIBILITY.md item 5 requires.
- docs/ACCESSIBILITY.md is updated for the group, the heading, the headline-sentence
  name and the removal of "known gaps" that this story closes.

### 5.6 Attributes widgets inherit from the grid

A widget's own attribute wins; otherwise the nearest `<ts-grid>`'s applies;
otherwise `configure()` or the default.

| Attribute | Section | Default |
|---|---|---|
| `locale`, `currency`, `time-zone` | RFC 0001 §10 | `configure()` |
| `hour-cycle` | §8 | 24-hour |
| `heading-level` | §5.2 | `3` |
| `stale-after` | §6 | 120000 ms |
| `flash` | §6 | on |

`messages` (§1.1) is the same idea as a property.

## 6. Freshness, stale warnings and change flashes (amends RFC 0001 §8.1)

Live data reads as live and stale data reads as stale, and a number that just
changed says so for a moment.

*Implemented by: freshness-and-flash.*

### 6.1 `fmt.ago`

```ts
interface Formatter {
  /** 'just now' under 30 s, then '2 min ago', '3 hr ago', in the formatter's locale. `t` is an instant in ms. */
  ago(t: number, now: number, o?: { justNow?: string }): string
}
```

`ago` uses a cached `Intl.RelativeTimeFormat` with `style: 'short'` and
`numeric: 'always'`, so it reads `2 min ago` in `en-IN` and `vor 2 Min.` in
`de-DE` (`en-US` has a full stop: `2 min. ago`). Under 30 s it returns
`o.justNow`, default `'just now'`; widgets pass `t('time.justNow')`. The core
makes no `Date.now()` call: `now` is a parameter, as for the calendar.

### 6.2 `ctx.freshness`

```ts
interface Freshness {
  asOf: number | null    // data.asOf read with toTime; null when absent or unreadable
  ago: string            // fmt.ago, '' without asOf
  stale: boolean         // live and past the threshold
}
interface ViewModelContext { freshness: Freshness }
```

- **Inputs:** `data.asOf` (Time), `data.live` (boolean), and the `stale-after`
  attribute: milliseconds as a number (`90000`) or a duration string
  (`'90s'`, `'2m'`, `'1h'`; units `ms`, `s`, `m`, `h`). Default `120000`. An
  unreadable value falls back to the default with one development warning.
- **`stale`** is true when `live === true` and `now − asOf` is beyond
  `stale-after`. Without `live`, data is never stale: it is a snapshot.

| State | Dot | Header meta | Tile name |
|---|---|---|---|
| No `asOf` | Hidden, or pulsing when `live` | Nothing | Unchanged |
| `asOf`, not live | Hidden | `synced 11:42` (`time.synced` with `fmt.time`) | Unchanged |
| Live, fresh | Pulsing, `--ts-profit` | `just now`, `1 min. ago`… (`fmt.ago`) | `…, live` |
| Live, stale | `--ts-warn`, **not pulsing** (`.dot.stale`) | `Stale · 3 min` (`time.stale`, age as `fmt.unit` in minutes, hours or days) | `…, stale` |

- The meta text goes through the shared header (§5.1), so it appears on every
  variant of every widget.
- **The timer.** A widget with `asOf` set re-renders its freshness every 15 s
  through the shared ticker (§23), and only while `asOf` is set. A widget
  without `asOf` has no timer.

### 6.3 `flash`

```ts
class TsWidget {
  /**
   * Tints the element marked data-flash="<key>" for 700 ms: up (--ts-profit) when
   * the value rose, down (--ts-loss) when it fell. With goodWhen 'down' the
   * colours swap; 'neither' uses --ts-accent for both.
   */
  protected flash(key: string, value: Numeric, o?: { goodWhen?: 'up' | 'down' | 'neither' }): void
}
```

- **It never fires** on a first render, on a variant change (which also forgets
  the remembered values), for an unchanged value (compared after `toNumber`),
  or for a value that can't be read.
- **At most once per element per second**; a change inside that second updates
  the remembered value silently.
- **Disabled** under `prefers-reduced-motion`, and with `flash="off"` on the
  widget or its grid. The tint is a `color-mix()` of a token, never a colour
  value, and the class that carries it is removed after 700 ms.
- Today's P&L, the equity curve, the session clock, `<ts-metric>`, `<ts-card>`
  and `<ts-chart>` call it for their headline figures.

## 7. Tile activation and point selection (amends RFC 0002 §2.5)

Tiles become entry points, and chart points become selectable.

*Implemented by: tile-activation.*

```ts
class TsWidget {
  /** Attribute and property. Makes the label a real link. */
  href: string | null
  /** Attribute and property. Fires ts-action { action: 'open', id }. */
  activatable: boolean
}

type TsOpenAction = { action: 'open'; id: string }       // id: the item attribute, '' without one
```

- **`href`.** The label renders as `<a part="link" href>` inside the heading. A
  **stretched-link** rule (`::after` covering the tile) makes the whole tile
  clickable, while the widget's own buttons and slots sit above it and keep
  working. Only `http:`, `https:`, `mailto:`, `tel:` and relative URLs are
  accepted; any other scheme (`javascript:`, `data:`) is ignored with one
  development warning. The link navigates natively and fires no event.
- **`activatable`.** The label renders as `<button type="button" part="link">`
  with the same stretched rule, so Enter and Space work and the tile is one tab
  stop. Activating it fires `ts-action { action: 'open', id }` (the existing
  bubbling, composed, cancelable action event).
- **Both set:** `href` wins and `activatable` is ignored.
- **Focus.** The ring is drawn around the whole tile in `--ts-focus`
  (`outline: 2px solid`, which survives forced colours), not only around the
  label.
- **Inert while editing.** Handlers check the closest `<ts-grid>`'s `editing`
  state and do nothing while it is true, and the grid's click suppression after
  a drag still applies.

### 7.1 Selecting chart points

`<ts-chart>` points fire `ts-action` on click or Enter when the host opts in with
`actions = ['select']` (RFC 0002 §2.5: a control that tells the host something is
off until listed, and a chart with no opt-in has no extra tab stops):

```ts
type TsChartSelectAction = {
  action: 'select'
  value: number | string      // the point's x as given: the time, the number or the category
  series: string              // the series' id, else its name
  y: number                   // the point's y after toNumber
  index: number               // the point's position in that series
}
```

Points are real focusable elements in a list outside the `role="img"` drawing
(which stays one image for assistive technology), reachable by Tab and
activated by Enter or Space. They obey the same edit-mode guard. Hover, a
crosshair and exact-value read-outs are a later story.

## 8. Locale formatting (amends RFC 0002 §4.4)

Times, dates and durations come out natural for the locale and update live when
the locale changes.

*Implemented by: locale-formatting.*

```ts
interface FormatOptions {
  locale?: string
  currency?: string
  timeZone?: string
  /** 'h23' (the default: 24-hour), 'h12', or 'auto' to let the locale decide. */
  hourCycle?: 'h23' | 'h12' | 'auto'
}
interface FormatterIssue { option: 'locale' | 'currency' | 'timeZone' | 'hourCycle'; value: unknown; message: string }

type DateStyle = 'day' | 'month' | 'monthYear' | 'medium' | 'weekday'   // '12 Oct', 'Oct', 'Oct 2026', '12 Oct 2026', 'Mon'

interface Formatter {
  readonly hourCycle: 'h23' | 'h12' | 'auto'
  /** A date. A plain 'YYYY-MM-DD' is never shifted; an instant is read in the formatter's time zone. Default style 'medium'. */
  date(t: Time, o?: { style?: DateStyle }): string
}

/** Calls `fn` after every configure(); returns an unsubscribe function. Registers nothing on import. */
function onConfigure(fn: (config: FormatOptions) => void): () => void
```

- **`hourCycle`.** `configure({ hourCycle: 'h12' })`, or `hour-cycle="h12"` on a
  grid or widget, makes `fmt.time` give `2:15 PM` in `en-US`. The default stays
  24-hour (RFC 0001 §5: session times are published that way). `'auto'` lets
  the locale decide. `fmt.time`'s per-call `hour12` still wins.
- **`fmt.date`.** Plain days (`'YYYY-MM-DD'`) are formatted at UTC noon in UTC
  so they never shift; instants use the formatter's zone. The calendar is pinned
  to `gregory` unless the locale itself names one (`-u-ca-`), so `fa-IR` reads
  Gregorian dates with Persian digits. It replaces the equity curve's own month
  formatter now, and `<ts-chart>`'s day labels in the next story that touches
  `series-chart.js` (noted in the changes fragment).
- **Durations.** `fmt.duration(ms, { style: 'words' })` uses `Intl.DurationFormat`
  (`style: 'narrow'`) when it exists, else `Intl.NumberFormat` units joined with
  `Intl.ListFormat`. English output is unchanged (`3h 48m`); `de-DE` no longer
  gives `2h 30m`. `style: 'clock'` is unchanged.
- **`fit()` ignores bidi controls** (U+200E, U+200F, U+061C, U+2066–U+2069) when
  counting characters, so a right-to-left value isn't cut short.
- **Today's P&L's middle tick** is computed from numeric minutes in the
  formatter's zone, never parsed from formatted text, and lands on a `:00` or
  `:30` boundary in `fi-FI`, `ar-EG` and `hi-IN-u-nu-deva`.
- **`<ts-grid>` observes `locale`, `currency`, `time-zone` and `hour-cycle`**
  and re-renders its tiles when one changes. A widget also re-renders when
  `configure()` notifies it. The mechanism is internal: the grid and `onConfigure`
  both call the widget's `invalidate()`, which drops the cached formatter and
  messages (§1.1) and requests one render.
- **The matrix test** (`test/format-locales.test.mjs`) covers `en-IN`, `en-US`,
  `de-DE`, `fr-FR`, `de-CH`, `ja-JP`, `ar-EG`, `he-IL`, `fi-FI` and `sv-SE`.

## 9. Right-to-left grids (amends RFC 0002 §5)

With `dir="rtl"` the grid mirrors; time-series charts stay left to right.

*Implemented by: rtl.*

```ts
// Internal (src/elements/grid-geometry.js)
function boxOf(p: Placement, m: Metrics, o?: { rtl?: boolean }): { x: number; y: number; w: number; h: number }
function cellAt(x: number, y: number, cols: number, m: Metrics, o?: { rtl?: boolean }): { col: number; row: number }
function extentOf(w: number, h: number, m: Metrics, o?: { rtl?: boolean }): { cols: number; rows: number }
```

- **Boxes.** With `rtl`, `boxOf` returns `x = (columns − col − cols) × pitchX`;
  `cellAt` is its inverse (`col = columns − cols − x ÷ pitchX`, clamped).
  `extentOf` accepts `{ rtl }` so all three share one call shape; the extent of a
  box doesn't depend on direction, because the grid flips the drag's horizontal
  delta before it calls.
- **Reading direction.** `_measure` reads `getComputedStyle(this).direction`,
  so a `dir` attribute or a stylesheet on the grid or any ancestor counts, and a
  change of direction re-measures.
- **Keyboard.** The grid swaps ArrowLeft and ArrowRight before calling
  `keyAction`, so ArrowRight moves a held tile visually right in either
  direction.
- **Chrome.** With `dir="rtl"` the first tile sits top-right, the remove button
  sits top-right of its tile and the resize handle bottom-left. Chrome buttons
  are positioned with inline insets (`inset-inline-end`), never `left` or
  `right`.
- **Charts and figures** keep `direction: ltr` and `unicode-bidi: isolate`
  (§5.5), so a sign stays beside its digits.

## 10. Wide screens: host breakpoints and a maximum width (amends RFC 0001 §4.1)

Hosts control where columns change and how wide the board grows.

*Implemented by: wide-screens.*

```ts
interface Thresholds { tablet?: number; desktop?: number }   // px of the grid's own width

function columnsFor(width: number, thresholds?: Thresholds): Columns
function deviceFor(width: number, thresholds?: Thresholds): Device

class TsGrid {
  /** Defaults to { tablet: 700, desktop: 1200 }. Setting it re-measures. */
  breakpoints: Thresholds
}
```

- **Defaults** are `BREAKPOINTS` (`{ tablet: 700, desktop: 1200 }`, unchanged and
  still exported). A missing key falls back per key. A value that isn't a finite
  number above 0, or a `tablet` that isn't below `desktop`, falls back to the
  defaults with one development warning.
- `columnsFor(width, { desktop: 1600 })` gives 4 columns from 1600 px;
  `deviceFor` is `'phone'` below `tablet`. Without the second argument both
  behave exactly as today.
- `<ts-grid>` passes `breakpoints` to `columnsFor` in `_measure`. It is a
  property only; a markup-only host that needs other thresholds sets it from
  script.
- **`--ts-grid-max-width`** (default `none`) caps the board's width and centres
  it (`margin-inline: auto`). It is in both token files. Because columns come
  from the grid's own width, a capped board on a 2560 px monitor stays at 4
  columns of ordinary tiles instead of stretching them.
- **Six columns.** The size model is unchanged: `Columns` stays `2 | 3 | 4`, and
  Banner spans the full width. Whether a wider column count is wanted later is
  Decision 30.
- The docs explain sizing for large monitors with the two controls above.

## 11. Reading order outside edit mode (amends RFC 0002 §5.10)

Reading order and Tab order follow the layout (WCAG 1.3.2 and 2.4.3) without
the grid ever moving a host node, which would upset Vue and React.

*Implemented by: reading-order.*

```ts
// Internal (src/elements/grid-geometry.js)
/** Ids in row-major order of each tile's top-left cell; equal cells keep input order. */
function visualOrder(placements: readonly Placement[]): string[]

class TsGrid {
  /** The visible tiles' ids in visual order. */
  readonly readingOrder: readonly string[]
}

interface TsReadingOrderChangeDetail { order: string[] }   // event 'ts-reading-order-change'
```

- **Manual slot assignment.** The grid's shadow root is created with
  `slotAssignment: 'manual'` when `HTMLSlotElement.prototype.assign` exists.
  After each render the grid puts **one `<slot>` per visible tile** in the board,
  in `visualOrder`, and calls `slot.assign(tile)` for each, so the accessibility
  tree and Tab order follow the placement while the host's DOM order is
  untouched. The grid makes **no `childList` mutations** on host children;
  framework-owned children still patch correctly after any number of moves.
- **Hidden tiles** (no layout item) are assigned to no slot. The empty board's
  `slot="empty"` content is assigned to the empty panel's slot by the grid, since
  named slotting doesn't apply in manual mode.
- **The fallback** (no manual assignment, below Safari 16.4 and similar) creates
  the root as before, with one default slot and one `empty` slot, and no error.
  Tab and reading order then follow the host's DOM order, as in 0.1.0
  (Decision 27).
- **`readingOrder` and the event.** `ts-reading-order-change` fires, bubbling
  and composed, whenever the visible order differs from the previous one. It
  does not fire for the first order, which `readingOrder` already reports.
- **Edit mode** is unchanged: chromes are re-inserted in placement order
  (RFC 0002 §5.10).

## 12. Overnight and 24/7 sessions (amends RFC 0001 §7)

Futures, FX and crypto calendars.

*Implemented by: overnight-sessions.*

```ts
interface SessionSpec {
  // …as RFC 0001 §7, with these changes:
  /** ISO weekdays on which the session OPENS (1 = Monday, 7 = Sunday). */
  days: readonly number[]
  /** 'HH:MM' local. 'close' may now be earlier than or equal to 'open'. */
  open: string
  close: string | { default: string; ranges: ReadonlyArray<{ from: string; to: string; close: string }> }
}
```

- **Windows.** `close < open` means the session closes on the **next local
  day**. `close === open` is a 24-hour session. `days` names the weekdays a
  window opens on, and `holidays` and `specialSessions` are keyed by the
  **opening date**, so a holiday on Monday removes the window that opens Monday
  evening.
- **`'24:00'` is still rejected**; `'00:00'` to `'00:00'` is how a 24-hour
  session is written. The relaxed `checkSpec` throws `TypeError` for malformed
  times and for a close that has no open, as before.
- **State.** `state()` also checks the previous local date's window, so a window
  that opened yesterday and runs past midnight is found. Windows that touch
  merge (`mergeWindows`, Internal), so `state`, `nextChange` and `windows` see
  one continuous window across days. `windowOn(spec, date)` (Internal) returns the
  window that opens on a date, with a next-day `close` when `close <= open`.
- **Unbounded windows.** When the merged window continues past the calendar's
  look-ahead (31 days, as for "next open"), `closesAt`, `startedAt` and
  `progress` are `null` while `open` is true, and `nextChange` returns `null`.
  `activeProfile` stays `'market'`, `nextProfileChange` returns `null`, and
  `<ts-session-clock>` shows `t('session.open247')` ("Open 24/7").
- **Session-clock lanes** may span two dates; the lane draws the overnight window
  across midnight, and its times name the date when they fall on another day.

Examples (made-up exchanges):

| Spec | Probe | Result |
|---|---|---|
| `{ timeZone: 'America/Chicago', days: [7,1,2,3,4], open: '17:00', close: '16:00' }` | Monday 10:00 | Open, `closesAt` Monday 16:00 |
| the same | Monday 16:30 | Closed, `opensAt` Monday 17:00 |
| the same | Friday 16:30 | Closed, `opensAt` Sunday 17:00 |
| An FX week, `America/New_York`, open Sunday 17:00 to Friday 17:00 | Wednesday 12:00 | Open, `closesAt` Friday 17:00 New York |
| Crypto, `UTC`, every day, `00:00` to `00:00` | Any instant | Open, `closesAt` `null` |

All existing calendar tests pass unchanged, and new fixtures cover the DST
weeks in `America/Chicago` and `America/New_York`.

## 13. Theme presets and palettes (amends RFC 0002 §6)

Brand matching with one attribute, and colour choices for colour-vision and
market conventions.

*Implemented by: theme-presets (13.1), widget-a11y-visuals (13.2, 13.3).*

### 13.1 Presets

```html
<link rel="stylesheet" href="tickslate/themes/calm.css">
<ts-grid data-ts-theme="calm">…</ts-grid>
```

`data-ts-theme` takes one of six names. Each preset is its own file,
`src/themes/presets/<name>.css`, shipped as `dist-lib/themes/<name>.css` and
exported as `tickslate/themes/*.css`.

| Name | What it is |
|---|---|
| `neutral` | A new design: `system-ui` fonts for both `--ts-font-ui` and `--ts-font-num`, white surfaces and a zinc scale. It has a light and a dark mode. This is the system-font preset RFC 0002 §6.3 promised. |
| `paper` | The default light tokens, restated so a grid can be light on a dark page by preset name |
| `graphite` | The default dark tokens (the design references call it "night"), restated so a grid can be dark on a light page by preset name |
| `calm` | Design decisions taken from the reference style block of the same name |
| `signal` | As `calm` |
| `terminal` | As `calm` |

- **Scope.** Each file declares its tokens inside
  `:where([data-ts-theme='<name>'])` (zero specificity), and a dark mode, where
  the style has one, under the conditions `tokens.css` uses for Graphite:
  `data-theme="dark"`, a `.dark` ancestor, or `data-theme="auto"` inside
  `@media (prefers-color-scheme: dark)`. `paper` and `graphite` are one-mode:
  they ignore `data-theme`.
- **Tokens only.** A preset sets `--ts-*` variables and nothing else. It never
  names a widget or a part.
- **Delivery.** Presets are opt-in files, not part of `tokens.css` and not in the
  injected defaults, so a host that uses none pays nothing (Decision 35).
- **Contrast.** `test/presets.test.mjs` applies RFC 0002 §6.6's floors to every
  preset block, each mode, with the luminance helper copied from
  `test/tokens.test.mjs` (tests import only `src/` and `node:*`). Every widget is
  legible in each preset in the gallery, which gains a preset switcher.
- docs/theming.md lists the presets and the parts (§5.3).

### 13.2 Palettes

```html
<ts-grid data-ts-palette="cvd">…</ts-grid>
<ts-grid data-ts-palette="red-up">…</ts-grid>
```

| `data-ts-palette` | Effect |
|---|---|
| `cvd` | Profit and loss become a **blue and orange** pair, and the accent (and `--ts-focus`) moves off blue. Simulated deuteranopia and protanopia separate profit from loss by CIE76 ΔE of at least 40 in both themes, and text stays at 4.5:1 or better. |
| `red-up` | Swaps the values of `--ts-profit` and `--ts-loss`, for markets where red means a rise |

- Palettes are zero-specificity blocks in `tokens.css` and `default-tokens.js`
  (the sync test keeps them equal), with a dark variant under the same three
  conditions as Graphite. One value per element: there is no combined
  `cvd red-up`.
- **Presets and palettes together.** The palette wins. The tokens a palette owns
  (profit, loss, accent, focus and the series colours it changes) are declared in
  each preset file in a second block scoped
  `:where([data-ts-theme='<name>']:not([data-ts-palette]))`, so a preset never
  overrides a palette set on the same element (Decision 35). Palette contrast is
  tested against the default tokens only.

### 13.3 High contrast preference

Under `@media (prefers-contrast: more)` the tokens raise `--ts-line` to at least
3:1 and `--ts-muted` to at least 7:1, against `--ts-surface`, in both themes.
This needs no attribute, and sits in both token files like every other block.

`test/palettes.test.mjs` simulates colour vision with the Machado 2009 matrices,
measures CIE76 ΔE, and checks the contrast floors above. docs/theming.md
documents the palettes.

## 14. Strict CSP and Trusted Types (amends RFC 0002 §6.1 and §7)

Tickslate needs no CSP or Trusted Types exception, so it can be dropped into the
strictest pages.

*Implemented by: csp-trusted-types.*

The two policies it must work under, with every widget and the grid rendering,
styled, and editing:

```
Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types tickslate
```

```ts
// tickslate: one new option, if Decision 34 is accepted as recommended.
function configure(options: FormatOptions & { messages?: Partial<Messages>; styleNonce?: string }): void
```

- **Adopted sheets.** Shared CSS is one constructed `CSSStyleSheet` per widget
  class, built lazily and adopted by each instance's shadow root
  (`adoptedStyleSheets`). No inline `style` attribute appears in any template,
  and no `eval` or `new Function` is used anywhere.
- **The fallback** where constructable sheets are missing (below Safari 16.4):
  a `<style>` element in the shadow root, carrying `styleNonce` when it was
  configured. A strict `style-src` without the nonce blocks it; the supported
  floor for strict CSP is Safari 16.4 (Decision 27).
- **DOM-built ticks.** The session clock builds its ticks with DOM APIs and sets
  positions through `element.style` (the CSSOM, which `style-src` doesn't block),
  never through markup.
- **Trusted Types.** `src/elements/html.js` creates a lazy policy named
  `tickslate` the first time markup is written. Only **module-constant strings**
  pass through it: each template is a pure function of its variant, parsed once
  into a `<template>` and cloned per instance. Every other write uses
  `textContent`, attributes or `setAttribute`. A node test asserts that
  `template(variant)` returns the same string on every call and contains no
  data. Modules stay importable without a DOM.
- **The tile `href`** (§7) is assigned as a property and checked for scheme
  before it is set, so it can't carry script.
- docs/guide/security.md documents the setup, with fixtures served with the
  headers above and Playwright specs asserting no `securitypolicyviolation`
  events.

## 15. `<ts-chart>` bars and categories (amends RFC 0002 §3.3)

*Implemented by: ts-chart-bars.*

```ts
type ChartKind = 'line' | 'area' | 'bar'

interface ChartOptions {
  /** How x is read. 'category' places points and bars on a band scale. Default 'time'. */
  xType?: 'time' | 'number' | 'category'
  // …unchanged: format, decimals, unit, goodWhen, asOf, live
}

interface ChartModel {
  // …as RFC 0002 §3.3, with these changes:
  series: Array<{ name: string; kind: ChartKind; line: string; area: string; bars: string; last: string }>
  legend: Array<{ name: string; index: number }>      // index 1–6 picks --ts-series-<n>
  categories: string[]                                // [] unless xType is 'category'
}
```

- **Bars.** Series with `kind: 'bar'` are drawn as filled rectangles from the zero
  line, upwards for positive and downwards for negative values. The y domain
  always includes zero. Several bar series sit side by side inside each band
  (grouped, not stacked).
- **Categories.** With `xType: 'category'`, `x` is read as text, in order of first
  appearance across all series; a point whose `x` is `null` or empty is dropped
  and counted in `dropped`. Lines and areas run through each band's centre, so
  kinds can be mixed on one axis. Time and number charts take no bars from this
  change: `bar` is allowed there too, at the x positions given.
- **Labels** are one per band and truncate with an ellipsis (`.ell`). The model
  returns every category; the template shows as many as fit without overlap,
  always including the first and the last.
- **Six series.** Up to six series draw, using `--ts-series-1` to
  `--ts-series-6`; more than six warns once in development (RFC 0002 §7.2 row 15,
  now six rather than four).
- **Updates** still rewrite only path `d` attributes and text. `bars` is a single
  path per series.

```ts
// Internal (src/elements/chart.js). Pure; loops, no spreads.
function bandScale(
  categories: readonly string[], r0: number, r1: number, o?: { padding?: number },   // padding 0..1 of a band, default .2
): { band: number; start(i: number): number; centre(i: number): number; index(label: string): number }

function barPaths(
  groups: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,   // one array per bar series; x is the category index
  options: { width: number; height: number; pad?: number; categories: number; yDomain: [number, number]; padding?: number },
): { paths: string[]; zeroY: number; centres: number[] }
```

`barPaths` and `bandScale` are tested for mixed kinds, negatives, a single
category and empty data (empty paths, no throw). docs/widgets/ts-chart.md covers
the new kinds.

## 16. `<ts-table>` and keyed rows

A generic list and table widget that updates cells in place.

*Implemented by: ts-table.*

```ts
interface TableColumn {
  key: string
  label: string
  format?: 'text' | 'number' | 'money' | 'percent' | 'duration' | 'time' | 'date'   // default 'text'
  decimals?: number
  align?: 'start' | 'end' | 'center'      // default 'end' for numeric formats, else 'start'
  tone?: 'sign'                           // '+' or '−' with pos or neg
  priority?: number                       // lower stays longer when columns must hide; default: the column's position
  sortable?: boolean                      // default true
}

interface TableData extends WidgetFreshness {
  columns: TableColumn[]
  rows: Array<{ id: string | number; [key: string]: unknown }>
  sort?: { key: string; dir: 'asc' | 'desc' }
}

/** <ts-table>, sizes Tall · M · L · XL. catalogKey 'table'. */
declare class TsTable extends TsWidget<TableData> {
  static tableModel(data: TableData, variant: SizeName, ctx: ViewModelContext, o?: { width?: number }): TableModel
}

/** What tableModel returns: everything the template writes, as strings and flags. */
interface TableModel {
  ariaLabel: string               // 'Open orders, 12 rows, sorted by Price, descending'
  columns: Array<{                // only the columns kept by the column budget, in data order
    key: string
    label: string
    align: 'start' | 'end' | 'center'    // resolved: the default is applied
    sortable: boolean                    // resolved: default true
    sort: 'ascending' | 'descending' | 'none'   // the header's aria-sort
  }>
  rows: Array<{                   // sorted; one entry per row of data.rows
    id: string | number
    cells: Array<{                // one per kept column, in the same order
      text: string                // formatted; '' for a missing value
      tone: 'pos' | 'neg' | 'mut' // 'mut' unless the column has tone 'sign' and the value is not zero
      arrow: '▲' | '▼' | ''       // aria-hidden in the template; '' unless tone is 'sign'
    }>
  }>
  hidden: number                  // columns dropped by the column budget (0 without o.width)
  dropped: number                 // rows that could not be read (no id, or not an object)
}

/** The ts-action detail of <ts-table>. TsCommonAction is {retry} or TsOpenAction (§7). */
type TsTableAction =
  | { action: 'retry' }
  | TsOpenAction
  | { action: 'sort'; value: string; dir: 'asc' | 'desc' }    // value: the column key
  | { action: 'select'; id: string | number }                 // row activation; opt-in
```

- **Model.** `tableModel` is pure: it formats each cell with `fmt` by `format`
  (`text` is shown as given), applies a **stable** sort (numbers numerically,
  text with `Intl.Collator` in the locale, missing values last), and applies the
  **column budget**: with a content width `o.width` it keeps the columns that fit
  at no less than **56 px** each, dropping by `priority` (highest number first).
  Without a width it keeps all columns. The element measures its width with a
  `ResizeObserver` (guarded where one is missing) and re-renders on change.
  Sorting 500 rows takes under 16 ms in a test.
- **Keyed rows.** `src/elements/rows.js` does the diffing, for reuse by
  `<ts-watchlist>` and `<ts-open-positions>`:

  ```ts
  // Internal (src/elements/rows.js)
  function createRows<Row extends { id: string | number }>(
    container: Element,
    o: {
      create(row: Row): Element
      update(el: Element, row: Row, prev: Row | undefined): void
    },
  ): { sync(rows: readonly Row[]): void }

  /** Writes `text` only when it differs from what the node holds; returns whether it wrote. */
  function setText(node: Node, text: string): boolean
  ```

  Rows are matched by `id`: `sync` inserts new rows, moves reordered ones and
  removes departed ones, without rebuilding the others, and `update` writes only
  cells whose text changed (through `setText`). Changing one cell is one write,
  counted by the fake DOM in tests; new rows insert without touching the rest.
- **Markup.** A real `<table>` with `<thead>` and `<tbody>`; the body scrolls
  under a sticky header in a keyboard-focusable scroller (`tabindex="0"`). All
  text is set with `textContent`; the element builds no markup from data.
- **Sorting** is always on, since it only changes what the widget shows (RFC 0002
  §2.5). A sortable header is a button with `aria-sort`; activating it re-sorts
  (ascending, then descending, then ascending) and fires
  `ts-action { action: 'sort', value: key, dir }`, so a host can remember it.
- **Row activation** is opt-in: when `actions` includes `'select'`, each row
  gets a stretched button in its first cell (the pattern of §7), and activating it
  fires `ts-action { action: 'select', id }` (Decision 36).
- **Tone.** `tone: 'sign'` shows `+` or `−` (U+2212), an `aria-hidden` ▲ or ▼,
  and the `pos` or `neg` class.
- The `WIDGETS` entry is `table: { tag: 'ts-table', label: 'Table', sizes: ['Tall', 'M', 'L', 'XL'] }`
  with a description and category (§18). `emptyText` is "No rows yet".
  docs/widgets/ts-table.md exists.

## 17. `<ts-progress>`

A goal and limit gauge.

*Implemented by: ts-progress.*

```ts
interface ProgressData extends WidgetFreshness {
  value: Numeric
  target: Numeric
  mode?: 'goal' | 'limit'                       // default 'goal'
  warnAt?: number                               // a fraction; default 0.75
  format?: 'number' | 'money' | 'percent' | 'duration'   // default 'number'
  decimals?: number
  unit?: string
  caption?: string
}

interface ProgressModel {
  ariaLabel: string       // 'Daily loss limit, 6,400 of 10,000, 64%, near limit'
  text: string            // '6,400 of 10,000 · 64%'  (t('progress.text'))
  pct: string             // '64%', or '—'
  fill: number            // 0..1, 0 without a valid target
  state: 'ok' | 'near' | 'over' | 'done' | 'none'
  caption: string
}

/** <ts-progress>, sizes S · Wide. catalogKey 'progress'. */
declare class TsProgress extends TsWidget<ProgressData> {
  static progressModel(data: ProgressData, variant: SizeName, ctx: ViewModelContext): ProgressModel
}
```

- **Limit mode.** The bar uses `--ts-accent` below `warnAt`, `--ts-warn` at or
  above `warnAt` (`near`), and `--ts-loss` with `color-mix()` stripes at 100% or
  more (`over`). **Goal mode** uses `--ts-accent`, and `--ts-profit` at 100% or
  more (`done`).
- **The text** states value, target and percentage, `6,400 of 10,000 · 64%`. The
  percentage is the true ratio, rounded half up, and never reads 100% before the
  target is met. A value above the target shows its true percentage (`120%`) and
  fills the bar. A negative value fills nothing.
- **The `aria-label`** includes the state in words: `near limit`, `over limit`,
  `goal reached`. Stripes and the words, not colour alone, carry the state.
- **No valid target** (missing, non-numeric or 0 or less) shows `—` and no bar,
  and state `none`. Numeric strings are accepted (`toNumber`).
- Stripes live in the widget's own `static styles`, from `--ts-loss` only.
  The `WIDGETS` entry is `progress: { tag: 'ts-progress', label: 'Progress', sizes: ['S', 'Wide'] }`
  with a description and category. docs/widgets/ts-progress.md exists.

## 18. The picker, grid controls and grid editing methods (amends RFC 0002 §5.5; completes Decision 14; Decision 33)

Adding tiles without any host UI. Hidden children return as restores. A new type
needs the host's cooperation, because children belong to the host (RFC 0001
§8.4).

*Implemented by: widget-picker-and-controls. It owns `grid.js`, so the three editing
methods of §18.4, which §20 needs, are built here.*

### 18.1 Catalog metadata

```ts
interface WidgetSpec {
  // …unchanged
  /** One plain sentence for the picker. Falls back to t('widget.<key>.description'). */
  description?: string
  /** Groups the picker. Falls back to t('category.<name>'). */
  category?: string
}
// A custom widget's `static spec` accepts the same two optional strings (§3).
```

Every built-in entry gets both. The built-in categories are `General`
(`card`, `metric`, `chart`, `table`, `progress`), `Performance` (`todayPnl`,
`equityCurve`, `pnlCalendar`, `edgeStats`), `Accounts` (`capitalFunding`,
`openPositions`) and `Markets` (`watchlist`, `sessionClock`, `miniChart`). Hosts
may use any string.

### 18.2 `ts-add-request` and `grid.add`

```ts
interface TsAddRequestDetail {
  type: string       // the catalog key
  id: string         // the item id the host must give the new child
  size: SizeName     // the size the grid will place it at
}
// event 'ts-add-request': bubbles, composed, CANCELABLE.

class TsGrid {
  /**
   * Asks for a new tile of `type`. Returns the id, or null when the type is
   * unknown, or the host did not take the request.
   */
  add(request: { type: string; id?: string; size?: SizeName }): string | null
  /**
   * Types the host answers ts-add-request for: a list, '*' for every catalog type,
   * or null (the default) for none.
   */
  addTypes: readonly string[] | '*' | null
}
```

The flow, for a type the host handles:

1. `grid.add({ type, id?, size? })` resolves the spec (element, then host catalog,
   then `widgetCatalog()`). It generates `id` when none is given (`type`,
   `type-2`, `type-3`…, skipping every id on the layout and every hidden child),
   and snaps `size` to the spec (the first supported size by default).
2. If a hidden child already has that `id`, it is a restore: `restore(id)` runs
   and no event fires.
3. Otherwise the grid dispatches **`ts-add-request { type, id, size }`**. The
   host **takes it by calling `event.preventDefault()`** and **answers by
   rendering a child with `item=id`** (and the type's tag). Not calling
   `preventDefault()` means the host did not handle it: `add` returns `null` and
   development warns once.
4. When a child with `item=id` appears, the grid places it at the requested size
   and commits `ts-layout-change` with `reason: 'add'`. The grid expects the child
   within 10 s; if none appears, development warns once and the request is
   forgotten.

The picker offers catalog types only for the types in `addTypes`. `add` itself
doesn't require `addTypes`: a host that calls `grid.add` from its own button has
already decided it handles the request (Decision 33).

### 18.3 `<ts-widget-picker>`

```html
<ts-widget-picker for="dashboard"></ts-widget-picker>
```

```ts
declare class TsWidgetPicker extends HTMLElement {
  /** The id of the <ts-grid> it adds to. */
  for: string
  /** Reflects whether the dialog is open. */
  readonly open: boolean
  /** Opens the dialog; focus returns to `opener` (default: the active element) on close. */
  show(opener?: HTMLElement): void
  close(): void
}
```

- It is a native `<dialog>` in a shadow root: a **bottom sheet below 700 px**,
  centred above. Tokens only. Parts: `sheet`, `search`, `group`, `row`, `chip`,
  `empty`, `close`.
- **Search** matches the label and the description, ignoring case, in the
  locale. **Results are grouped by category**, each row showing the label, the
  description and **size chips** (one button per supported size, named with
  `size.name`: "Medium, 2 by 2"). Hidden children are **restores**: one button,
  "Add back", at the size the child declares. Restores come first.
- With nothing to offer it says "Every widget is already on this layout".
- **Keyboard:** the search field takes focus on open; Tab walks the rows and
  chips; Escape or the close button closes; focus returns to the opener. All
  targets are 44 px. The grid announces the result ("`<label>` added back",
  "`<label>` added") through its status region.
- **The model is pure** and tested without a DOM:

```ts
// Internal (src/elements/picker-model.js)
type PickerItem =
  | { kind: 'restore'; id: string; type: string; label: string; description: string; category: string }
  | { kind: 'add'; type: string; label: string; description: string; category: string; sizes: SizeName[] }
interface PickerGroup { category: string; items: PickerItem[] }

function pickerItems(input: {
  hidden: ReadonlyArray<{ id: string; type: string; label: string }>
  catalog: WidgetCatalog
  addTypes: readonly string[] | '*' | null
  query?: string
  t: Translate
  locale?: string
}): PickerGroup[]
```

  Groups are ordered by their translated category name, and items by label.
  Restores of a type are listed under that type's category.

### 18.4 Grid editing methods

`<ts-layout-list>` (§20) and hosts with their own controls edit through the
grid, so every edit is a commit: it pushes undo history and fires
`ts-layout-change`, as a drag does.

```ts
class TsGrid {
  /** Moves the item to `toIndex` in the active profile (clamped). false for an unknown id. reason 'move'. */
  move(id: string, toIndex: number): boolean
  /** Snaps to the item's spec. false for an unknown id. reason 'resize'. */
  resize(id: string, size: SizeName): boolean
  /** Removes the item (it becomes a hidden child). false for an unknown id. reason 'remove'. */
  remove(id: string): boolean
  /** The profile's override, or null when the schedule (or `profile`) decides. */
  readonly profileOverride: string | null
  /** Set by <ts-grid-controls> when a picker is linked; see §18.5. */
  openPicker: (() => void) | null
}
```

They are built on the core's `moveItem`, `resizeItem` and `removeItem`.

### 18.5 `<ts-grid-controls>`

```html
<ts-grid-controls for="dashboard"></ts-grid-controls>
```

```ts
declare class TsGridControls extends HTMLElement {
  /** The id of the <ts-grid> it controls. */
  for: string
  /** The id of a <ts-widget-picker> to link; default: one whose `for` is the same grid. */
  picker: string | null
}
```

- **The profile switcher** reads `Auto · Market hours · After close` (three
  buttons, `aria-pressed`) and, under it, the next switch ("Switches to After close at 15:35",
  from `nextProfileChange`, formatted with the grid's locale and zone). Auto calls
  `grid.override(null)`; the others call `grid.override('market')` or
  `grid.override('closed')`. It appears **only when the grid has a `schedule`**;
  without one the element renders nothing.
- **Linking the picker.** While a picker is linked the controls set
  `grid.openPicker`; the grid's edit pill then shows **Add** (opening the picker,
  which lists restores first) in place of **Add back (n)**. Without a linked
  picker the pill behaves as in RFC 0002 §5.5.
- Both elements ship in `tickslate/elements/controls` (`define/controls.js`), with
  their own size budget (§25), and use messages for every string (`picker.*`,
  `controls.*`).

## 19. The phone top strip (amends RFC 0002 Decision 23; Decision 31)

Up to three tiles pinned above the board at 2 columns, as RFC 0001's layout model
already allows (`layout.topStrip`, `setTopStrip`, `TOP_STRIP_MAX`).

*Implemented by: phone-top-strip.*

```ts
class TsGrid {
  /** Pins `ids` (at most 3, in order) to the strip, or unpins by leaving them out. false when nothing changed. */
  setTopStrip(ids: readonly string[]): boolean
}
// TsLayoutChangeDetail.reason gains 'strip'.

// Internal (src/elements/grid-geometry.js)
function splitStrip(
  items: readonly LayoutItem[], topStrip: readonly string[] | undefined, columns: Columns,
): { strip: LayoutItem[]; board: LayoutItem[] }          // at 3 or 4 columns: strip is []

function stripBoxes(count: number, m: Metrics, o?: { rtl?: boolean }): Array<{ x: number; y: number; w: number; h: number }>
```

- **At 2 columns** the items named in `layout.topStrip` render in one sticky row
  above the board at their **S variant**, equal in width and one row tall
  (`--ts-row-compact`), offset from the top by `--ts-strip-top` (a new token,
  default `0px`, for a host's own fixed header). They are left out of the board's
  placement.
- **At 3 or 4 columns** the strip does not exist: its items return to the board
  at their layout sizes. The saved `topStrip` is kept, so rotating a phone or
  resizing a window brings the strip back.
- **In edit mode** the strip's tiles reorder among themselves (drag, keyboard and
  tap-to-place, as for the board), and each tile's edit chrome gains a fourth
  sibling button at 2 columns, **Pin to top** or **Unpin** (`grid.pin`,
  `grid.unpin` messages, 44 px, not a tab stop). A fourth pin is refused
  with an announcement ("The top strip is full"). Every change goes through
  `setTopStrip`, fires `ts-layout-change` with `reason: 'strip'` and records an
  undo step.
- **Order.** The strip comes first in Tab and reading order. In RTL it mirrors
  (§9).
- The strip's geometry is the pure `splitStrip` and `stripBoxes`, with tests.

## 20. The layout list editor (amends RFC 0001 §8.6; Decision 32)

`<ts-layout-list>` edits the layout as a list. It is an input-agnostic
**WCAG 2.5.7 (dragging movements) alternative that complements amendment A**:
drag editing stays the main way to rearrange a grid, tap-to-place (RFC 0002 §5.9)
stays the single-pointer fallback inside the board, and this list is a second,
board-free alternative for a settings page, a switch-access user or a very small
screen. It is not part of the original brief's scope (Decision 32).

*Implemented by: layout-list-editor. It depends on the grid methods of §18.4.*

```html
<ts-layout-list for="dashboard"></ts-layout-list>
```

```ts
declare class TsLayoutList extends HTMLElement {
  /** The id of the <ts-grid> it edits. */
  for: string
}

// Internal (src/elements/layout-list.js). Pure.
interface ListRow {
  id: string
  label: string
  size: SizeName
  sizes: ReadonlyArray<{ size: SizeName; name: string; pressed: boolean }>   // name: 'Medium, 2 by 2'
  canMoveUp: boolean
  canMoveDown: boolean
}
function listRows(items: readonly LayoutItem[], catalog: Catalog, t: Translate): ListRow[]
```

- **Rows.** It renders the grid's active profile as an ordered list (`<ol>`), one
  row per visible tile: the tile's name, one button per supported size
  (`aria-pressed`, **at least 44 × 32 px**), **Move up**, **Move down** and
  **Remove**. Move up on the first row and Move down on the last are
  `aria-disabled`, not removed.
- **Edits** go through the grid's public API (`move`, `resize`, `remove`, §18.4),
  so they fire the same `ts-layout-change` events as dragging, push the same
  undo history and follow the same schedule rules. The list re-renders on
  `ts-layout-change` and `ts-profile-change`.
- **Undo.** An Undo button calls `grid.undo()`. Its status line says "Undone", or
  "Nothing to undo" when it returns `false`.
- **Announcements** ("Revenue moved to position 2 of 5") go through the list's own
  polite status region; a focus that would be lost (a removed row's button) moves
  to the next row's, or the list.
- Every string comes from messages (`list.*`). The element needs no pointer, no
  drag and no board, so it works at phone width and with switch access. It ships
  in `tickslate/elements/layout-list`.

## 21. The finance set (amends RFC 0001 §6 and §8.5)

The remaining five finance widgets follow the data shapes of RFC 0001 §8.5, with
the amendments of RFC 0002 (every instant a `Time`, `dropped` counts, the
`actions` property) and of this RFC (messages, tile chrome, keyed rows).

*Implemented by: pnl-calendar, edge-stats-and-funding, watchlist-and-positions.*

### 21.1 `<ts-pnl-calendar>` and `dayStats`

```ts
// tickslate
function dayStats(
  days: readonly DayResult[], options?: { timeZone?: string },
): { net: number; greenDays: number; redDays: number; greenRate: number | null; best: number | null; worst: number | null }

interface PnlCalendarData extends WidgetFreshness {
  days: DayResult[]          // the same shape as the equity curve; one series feeds both
  today?: Time               // later days are drawn as upcoming; default: the clock's day
}

/** <ts-pnl-calendar>, sizes Tall · M · Banner. catalogKey 'pnlCalendar'. */
declare class TsPnlCalendar extends TsWidget<PnlCalendarData> {
  static calendarModel(data: PnlCalendarData, variant: SizeName, ctx: ViewModelContext): CalendarModel
}
```

- **`dayStats`** reads each date with `toDay(date, timeZone)`, **sums rows with
  the same date**, skips entries it can't read, and counts a day green when its
  net is above zero and red when below. `greenRate` is `greenDays` over
  `greenDays + redDays`. Empty input gives `net: 0`, `greenDays: 0`, `redDays: 0`
  and `null` for the rest.
- **Sizes.** Tall shows 6 weeks, M 13 weeks and Banner a year. On phones Banner is
  two half-year bands (`phoneRows: { Banner: 2 }`, as the catalog already has).
- **Weeks.** The week starts on the locale's first day, from
  `Intl.Locale.prototype.getWeekInfo()` (or the older `weekInfo` property) where
  it exists, else Monday. Weekend days from the same info have no cell; a weekend
  entry (a special session) counts in the totals but is not drawn.
- **Cells.** Strength is `0.22 + 0.78 × |pnl| ÷ max|pnl|` over the days in view,
  mixed from `--ts-profit` or `--ts-loss`. A day with no entry uses
  `--ts-surface-2`, and a future day is drawn as upcoming (outlined, not filled).
- **Accessibility.** Each cell is named with its date and signed value ("Mon 12
  Oct, +1,240.00"). **Loss cells carry a non-colour cue**: a corner mark drawn in
  `--ts-ink`. The grid of cells is `role="img"` with a summary (best day, worst
  day, net). Dates are read with `toDay`, so a UTC-midnight string never shifts
  a day.
- docs/widgets/ts-pnl-calendar.md exists. `CalendarModel` is whatever the pure
  model needs, documented there; it has tests for year boundaries and the phone
  wrap.

### 21.2 `<ts-edge-stats>` and `<ts-capital-funding>`

```ts
// tickslate
interface TradeResult { pnl: Numeric; holdMs?: number }
interface EdgeStats {
  trades: number; wins: number; losses: number
  winRate: number | null             // 0..1
  profitFactor: number | null        // Infinity with no losses
  avgWin: number | null; avgLoss: number | null     // avgLoss is negative
  expectancy: number | null          // per trade
  avgHoldMs?: number | null
}
function edgeStats(trades: readonly TradeResult[]): EdgeStats
function histogram(values: readonly number[], edges: readonly number[]): Array<{ from: number; to: number; count: number }>

interface FundingAccount {
  id: string; name: string; balance: Numeric
  allocations: Array<{
    id: string; name: string; detail?: string; amount: Numeric
    live?: boolean; pnl?: Numeric
    funded?: Numeric            // the host's own funded amount; overrides the rule
  }>
}
interface FundedAccount {
  id: string; name: string
  balance: number; allocated: number
  free: number                  // max(0, balance − what the allocations consume)
  shortfall: number             // the sum of the allocations' short amounts
  fundedShare: number | null    // funded ÷ allocated, 0..1; null with nothing allocated
  allocations: Array<{ id: string; name: string; detail?: string; amount: number; funded: number; short: number; live: boolean; pnl: number | null }>
}
function funding(account: FundingAccount): FundedAccount
```

- **`edgeStats`**: profit factor is `Infinity` (shown `∞`) with no losses and
  `null` (shown `—`) with no trades; every stat is `null` with no trades. Numeric
  strings are accepted.
- **`histogram`** uses **half-open buckets** `[from, to)` with the **last one
  closed**, so the largest edge is counted.
- **`<ts-edge-stats>`**, sizes S · Wide · M. S shows the one stat chosen by the
  `stat` attribute (`win-rate`, `profit-factor`, `avg-win-loss`, `expectancy`;
  default `win-rate`), Wide four stats, and M adds the histogram from
  `distribution`. Data: `{ stats: EdgeStats; scope?: string; distribution?: Array<{ label: string; count: number; sign: 1 | -1 }> }`.
- **`funding`** fills allocations **in array order** (RFC 0001 decision 5): each
  draws what remains of the balance, and is short by the rest. A given `funded`
  replaces the computed value (clamped to `0..amount`) and consumes that much of
  the balance for the allocations after it.
- **`<ts-capital-funding>`**, sizes S · Tall · L. Data: `{ accounts: FundingAccount[] }`.
  Shortfalls are marked with `color-mix()` stripes from `--ts-loss` **and** the
  text `short <amount>` (`funding.short`). **Rebalance renders only when listed
  in `actions`** and fires `ts-action { action: 'rebalance', id }`, where `id` is
  the account id.
- Tests cover all wins, all losses, empty input, numeric strings and
  over-allocation, and both widgets have docs pages.

### 21.3 `<ts-watchlist>` and `<ts-open-positions>`

Both are built on `rows.js` (§16) with the `actions` property and a pure model
each. The data shapes are RFC 0001 §8.5.6 and §8.5.7, with every price and time
read as `Numeric` and `Time`.

- **`<ts-watchlist>`**, sizes S · Tall · M. `change` and `changePct` derive from
  `prevClose` unless given (`changePct` is a fraction). The **day-range bar is
  drawn only when both `dayLow` and `dayHigh` exist**. Per-instrument `decimals`
  apply. M adds a sparkline from `ticks`. S shows the first instrument.
  Action: `add-instrument` renders only when listed in `actions`, firing
  `ts-action { action: 'add-instrument' }`.
- **`<ts-open-positions>`**, sizes Wide · M · L. The **range bar runs from stop
  (the loss side) to target** whatever the side, with an entry tick and an LTP
  dot, and **no bar without both** a stop and a target. `mtm` defaults to the sum
  of `pnl`. Actions `exit-position` (`{ id }`) and `exit-all` render only when
  listed in `actions`.
- A price update writes only the affected cells (the write count is tested, built
  on `rows.js`). Both use table semantics, signs and ▲ or ▼, and give the range
  bar a text alternative ("Between stop 120.00 and target 140.00, entry 128.00,
  now 133.40"). Each has a docs page.

## 22. Typings and the custom elements manifest (amends RFC 0002 §8)

Editor support in every framework, and a machine-readable description of every
element.

*Implemented by: typings-and-manifest.*

### 22.1 Types-only entries

```ts
import type {} from 'tickslate/jsx'      // adds every tag to React's JSX.IntrinsicElements
import type {} from 'tickslate/vue'      // augments vue's GlobalComponents
import type {} from 'tickslate/svelte'   // ships svelteHTML's IntrinsicElements
```

- Each entry is `src/types/<name>.d.ts`, shipped in the package, with **no
  runtime**: the files import nothing from `react`, `vue` or `svelte` at
  runtime, and the `exports` entries carry only a `types` condition
  (`"./jsx": { "types": "./types/jsx.d.ts" }`), the exception to RFC 0002 §8's
  rule that every entry has three conditions.
- `typesVersions` maps each subpath, so `moduleResolution: node10` finds them.

### 22.2 Action unions

`src/elements/index.d.ts` types the `ts-action` event of every element with its
own union, and `addEventListener('ts-action', …)` on each element class is typed
to it:

```ts
type TsCommonAction = { action: 'retry' } | TsOpenAction                      // §7
type TsMetricAction = TsCommonAction
type TsChartAction = TsCommonAction | TsChartSelectAction                     // §7.1
type TsEquityCurveAction = TsCommonAction | { action: 'range'; value: EquityRange }
// TsTableAction is defined once, in §16 (TsCommonAction plus 'sort' and 'select').
type TsCapitalFundingAction = TsCommonAction | { action: 'rebalance'; id: string }
type TsWatchlistAction = TsCommonAction | { action: 'add-instrument' }
type TsOpenPositionsAction = TsCommonAction | { action: 'exit-position'; id: string } | { action: 'exit-all' }
```

A `<ts-card>` and every other element has a `Ts<Name>Action` in the same form.

### 22.3 The manifest

`scripts/gen-manifest.mjs` writes `dist-lib/custom-elements.json` (Custom
Elements Manifest, `schemaVersion` `1.0.0`) and `dist-lib/vscode.html-custom-data.json`
(VS Code's HTML custom data), and `package.lib.json` points at them with the
`customElements` field and exports. The generator uses **no analyzer
dependency**: it reads the JSDoc tags `@element`, `@attr`, `@fires`, `@csspart`,
`@slot` and `@cssprop` in the declaration files, plus the exported class members,
using `node:fs` only. It lists every tag, attribute, property, event, part and
slot. A story that adds an element writes those tags in its declarations, and
the generator fails the build when a tag in `WIDGETS` has none.

`test/types/` holds fixtures that compile under `tsc --noEmit` with
`moduleResolution` set to `bundler`, `node16` and `node10`, and an
`@ts-expect-error` on a wrong data key that must fail if the error disappears.
`npm run check:types` runs in the CI build job. `typescript` is a devDependency
only.

## 23. Performance hygiene

Smooth on a mid-range phone, and no work while hidden.

*Implemented by: perf-hygiene.*

This section adds one option (`linePaths`' `maxPoints`, §3.1) and fixes behaviour;
it adds no other public name.

- **Downsampling.** `linePaths` keeps at most `maxPoints` points, default
  `2 × width` (the viewBox width), by min/max bucketing, and keeps the **low,
  high and last values exact**. A 500,000-reading Today's P&L view model returns
  in under 50 ms.
- **One ticker.** Every `every(1000)` user shares one timer aligned to second
  boundaries and paused while the page is hidden; `every(15000)` (§6.2) rides the
  same ticker.
- **Visibility gating.** A widget that is `display: none`, or more than one screen
  off the viewport, skips renders, and renders once when it becomes visible again.
- **Session-clock lane cache.** Lanes are recomputed when the day or the
  calendar changes, not every second.
- **Drag cost.** `dropIndex` runs only when the target cell changes (memoised),
  placement is incremental, and it averages under 1 ms at 100 tiles in a
  benchmark with a generous threshold.
- **Observer guards.** `<ts-grid>` mounts under jsdom, where `ResizeObserver` and
  its siblings may be missing.
- **Leaks.** A Chromium spec under 4× CPU throttling (30 tiles, 1 s updates, 60 s)
  records no long task over 50 ms, and 200 mount and unmount cycles leave no live
  intervals.

## 24. Tooling and documentation stories (no new library API)

These P1 stories change the repository, the CI and the docs, and add no export.
They are listed so every P1 story has a place here, and so the commands they add
have names.

| Story | Adds |
|---|---|
| `browser-matrix` | `playwright.config.mjs` gains `firefox` and `mobile-chrome` (Pixel 7) beside the existing three projects; `test/browser/grid-edge.spec.mjs`; the CI browser job runs all five. It touches no `src/`; bugs it finds are reported as follow-ups. |
| `consumer-examples` | `examples/vanilla-cdn`, `react-vite`, `vue-vite` and `svelte-vite`; `scripts/test-consumers.mjs` and `npm run test:consumers`, which pack `dist-lib`, install the tarball into a temp copy of each example, build it and run a Playwright smoke test; an `examples` CI job after `npm run release`; `docs/guide/ssr.md` and the Next.js and Nuxt guides. Installing framework dependencies needs network access, so the maintainer is asked first. |
| `demo-site` | `vite.site.config.js`, `npm run build:site` (base `/Tickslate/`, output `dist-site/`), the playground's Copy HTML button, `.github/workflows/pages.yml` left disabled, and self-hosted OFL fonts only if the maintainer approves fetching them. It never enables Pages. |
| `community-files` | `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1, with a contact the maintainer confirms), `SECURITY.md`, the issue forms and the pull request template. |
| `changelog-date` | `CHANGELOG.md` heading "## 0.1.0 — 2026-10-14" with an empty "## Unreleased" above it. |

## 25. Budgets (amends RFC 0002 §9)

RFC 0002 §9 set the release budgets for 0.1.0 and promised "grid plus one
widget" at **15 kB** (15,360 B) min + gzip once per-widget entries land. P1 adds
about a dozen widgets to `tickslate/elements`, so the all-in budget has to move.

- **Grid plus one widget:** at most **15 kB** for every widget entry
  (`tickslate/elements/grid` plus one other), enforced.
- **Per-entry budgets.** Every entry in §2.1 gets its own enforced budget in
  `scripts/check-size.mjs`, with its mode, target and date, set by the story that
  adds the entry from its own measurement plus 10%, rounded up to 0.5 kB, as
  release-0-1-0 did. `controls` and `layout-list` are budgeted the same way.
- **The CDN files and the all-in `tickslate/elements`** are reported, and their
  enforced budgets are reset from measurement by the 0.2.0 release preparation
  (Decision 38). RFC 0002's 50 kB all-in figure belongs to the 0.1.0 widget set.
- **The core budget** (9.5 kB) is re-measured by `messages` and
  `locale-formatting`, which add code to it; a story that exceeds a budget says
  so in its fragment rather than raising the figure itself.

## 26. What changes for existing hosts

0.1.0 hosts see these differences, which the changelog lists as breaking or
changed:

| Change | Was | Now | Section |
|---|---|---|---|
| Tile semantics | Each tile a region landmark | Each tile a `role="group"` with a heading, inside one labelled grid region | §5.2 |
| Accessible name of a live tile | The headline sentence | The same, ending `, live` or `, stale` | §5.5, §6 |
| Gains and losses | Sign and colour | Sign, colour and an `aria-hidden` ▲ or ▼ | §5.5 |
| `unpkg` and `jsdelivr` fields | The core UMD | The all-in IIFE | §2.3 |
| `elements.dev.js` | `dist-lib/elements.dev.js` | `dist-lib/dev/elements.js`, reached through the `development` condition | §2.2 |
| Chart series | At most 4, `--ts-series-1…4` | At most 6, `--ts-series-1…6` | §15 |
| `linePaths` | Every point | Downsampled above `2 × width` points | §23 |
| Session specs | `close` after `open` | `close` at or before `open` is valid | §12 |
| Word durations | `3h 48m` in every locale | Localised; English unchanged | §8 |
| Equity-curve month labels | Their own formatter | `fmt.date`, with a pinned Gregorian calendar | §8 |
| Catalog resolution | Element, host catalog, `WIDGETS` | Element, host catalog, `widgetCatalog()` | §3 |
| Safari | 16.2 | 16.4 for reading order and strict CSP; below it the grid falls back | §11, §14 |

Everything else in this RFC is additive. P1 is proposed as **0.2.0** (Decision 37).

## 27. Next

Not specified here, by name only: chart scrubbing and exact values, density and
text scaling, edit feedback, a manual assistive-technology pass, market presets
and breaks, the mini chart, further generic widgets, quality extras, security
hardening and a dashboard-creation flow. They are P2 or later and get their own
RFC when they are scheduled.

## 28. Decisions

This RFC's own decisions, numbered on from RFC 0002's 26 so that "Decision 24"
and "Decision 27" can never mean two things. Rows 27, 28 and 31 amend RFC
0002's Decisions 24, 25 and 23, which were accepted in outline and left their
detail to this RFC; each says why it is revisited. The recommended option is marked **Recommended**. Reply per row,
or "go with the recommendations".

| # | Question | Options | Status |
|---|---|---|---|
| 27 | Should the browser floor rise from Safari 16.2 to **16.4**, for manual slot assignment (reading order, §11) and `adoptedStyleSheets` (strict CSP, §14)? **Amends RFC 0002 Decision 24** (accepted as "Safari 16.4, decided in RFC 0003"). Revisited because the 16.4 floor was accepted without the fallbacks, and this row fixes them: the single slot and the `<style>` element below 16.4. | **Recommended:** yes. Safari 16.4 is the supported floor for reading order and for strict CSP. Below it nothing breaks: the grid keeps one slot (Tab and reading order follow the host's DOM order, as in 0.1.0) and widgets use a `<style>` element (§14).<br>Alternative: stay at 16.2 and skip both features.<br>Alternative: keep 16.2 and make reading order work by moving host nodes, which breaks Vue and React. | **Accepted** (14 Oct 2026): the recommended option |
| 28 | How are tiles exposed to assistive technology? **Amends RFC 0002 Decision 25** (accepted as "`role="group"` named by its label"). Revisited because a bare label drops the result a listener needs, so the name becomes the headline sentence. | **Recommended:** `role="group"` named by the view model's `ariaLabel` (the label, then the headline), the label as `role="heading"`, and the grid's board as the single labelled region (§5.2). The name keeps the result a listener needs; the heading keeps heading navigation.<br>Alternative: name the group by the bare label only, so the headline is read as content.<br>Alternative: keep one region per tile, which makes a 12-tile dashboard 12 landmarks. | **Accepted** (14 Oct 2026): the recommended option |
| 29 | What is the default `heading-level`? | **Recommended:** `3`: a page title at 1, a dashboard section at 2, tiles at 3. A host that puts the dashboard directly under the page title sets `heading-level="2"` on the grid.<br>Alternative: `2`.<br>Alternative: no default; tiles are headings only when the host sets a level. | **Accepted** (14 Oct 2026): the recommended option |
| 30 | Is a **6-column** layout wanted for very wide screens? | **Recommended:** not now. The size model stays 2, 3 or 4 columns. Hosts get `breakpoints` and `--ts-grid-max-width` (§10), which keep tiles ordinary on a large monitor. Revisit after the first consumer has used 0.2.<br>Alternative: add `Columns = 2 \| 3 \| 4 \| 6` now, which changes what Banner and XL span and what every saved layout means. | **Accepted** (14 Oct 2026): the recommended option |
| 31 | Is the **phone top strip** built, and how? **Amends RFC 0002 Decision 23** (accepted as "yes, as P1"). Revisited because "yes" left the strip's behaviour open, and this row fixes it: layout, pinning and when it shows. | **Recommended:** yes, as §19: at 2 columns up to three pinned tiles in one sticky row at their S design, equal widths, one compact row tall, pinned and unpinned in edit mode by a fourth chrome button, and gone at 3 and 4 columns.<br>Alternative: do not build it, and remove `topStrip` from the layout model.<br>Alternative: build it with tiles at the full S width in a horizontally scrolling row. | **Accepted** (14 Oct 2026): the recommended option |
| 32 | Should the **layout list editor** (`<ts-layout-list>`, §20) ship? | **Recommended:** yes, as an opt-in element in its own entry, presented as a WCAG 2.5.7 alternative that complements drag editing and tap-to-place, not as part of the original brief.<br>Alternative: do not build it; rely on drag, keyboard and tap-to-place. | **Accepted** (14 Oct 2026): the recommended option |
| 33 | How does the picker know the host answers `ts-add-request`? (§18.2) | **Recommended:** the host lists the types it handles in `grid.addTypes` (or `'*'`), and answers a request by calling `preventDefault()` and rendering a child with `item=id`. The picker offers catalog types only for those. No probing, no side effects.<br>Alternative: probe with the same event and a `probe: true` flag; a handler that ignores the flag adds stray tiles.<br>Alternative: always list catalog types and report on choosing one that nobody handled. | **Accepted** (14 Oct 2026): the recommended option |
| 34 | What is the strict-CSP fallback below Safari 16.4? (§14) | **Recommended:** a `<style>` element in each shadow root, with `configure({ styleNonce })` supplying its nonce. One small option, and strict-CSP hosts on older Safari still work.<br>Alternative: no fallback and no `styleNonce`: strict CSP needs 16.4.<br>Alternative: nonce'd `<style>` elements always, with no constructed sheets (every instance carries its own CSS). | **Accepted** (14 Oct 2026): the recommended option |
| 35 | How are presets delivered, and which wins when a preset and a palette are on one element? (§13) | **Recommended:** presets are opt-in files (`tickslate/themes/<name>.css`, selected by `data-ts-theme`), palettes live in `tokens.css` (`data-ts-palette`), and **the palette wins**, by scoping each preset's palette-owned tokens with `:not([data-ts-palette])`.<br>Alternative: put all six presets in `tokens.css`, which every host then downloads.<br>Alternative: leave the winner to file order, and document it. | **Accepted** (14 Oct 2026): the recommended option |
| 36 | Are chart point and table row **selection** on by default? (§7.1, §16) | **Recommended:** no. They are opt-in with `actions = ['select']`, so a chart with no listener has no extra tab stops. Sorting stays always on, since it only changes what the widget shows.<br>Alternative: always on, with every point and row focusable. | **Accepted** (14 Oct 2026): the recommended option |
| 37 | Which version carries P1, given the breaking changes of §26? | **Recommended:** **0.2.0**, with the §26 table in the changelog under Breaking. Under 0.x a minor release may break.<br>Alternative: ship the tile-semantics change on its own as 0.2.0 and the rest as 0.3.0. | **Accepted** (14 Oct 2026): the recommended option |
| 38 | What happens to the all-in budget, now that P1 adds about a dozen widgets? (§25) | **Recommended:** per-entry budgets are enforced (grid plus one widget at most 15 kB); the all-in `tickslate/elements` and the CDN files are reported, and their enforced budgets are reset from measurement, plus 10%, when 0.2.0 is prepared.<br>Alternative: keep a 50 kB all-in budget and drop widgets from the all-in entry, so users import the rest by name. | **Accepted** (14 Oct 2026): the recommended option |

## 29. Points this RFC settles that no decision covers

Found while writing the signatures down. Each is a proposal the RFC's approval
accepts unless you amend it.

1. **Forced-colour rules name system colours.** `Highlight`, `CanvasText` and
   `ButtonFace` are the only colour keywords widget CSS may contain, and only
   inside `@media (forced-colors: active)`. The token rule (no colour values in
   widget CSS) is about colours the host themes; these are the user's.
2. **The chart's entry is `tickslate/elements/chart`**, though its define module
   is `define/series-chart.js`, so a one-line rename sits in `pack-lib` (§2.1).
3. **Plurals are keyed by suffix** (`time.days.few`), with `time.days.other` as the
   fallback, and the base's `STRINGS` constants are replaced by `EN` (§1.2).
4. **`fmt.ago` takes `now` and a `justNow` string**, so the core stays pure and
   the text stays overridable (§6.1).
5. **`flash` is `flash(key, value, { goodWhen })`**, finding its element by
   `data-flash="<key>"`, so a template stays a static string (§6.3).
6. **A tile's `href` accepts only `http`, `https`, `mailto`, `tel` and relative
   URLs** (§7).
7. **`defineWidget` throws** for a built-in key, a type recorded by another class
   and a tag owned by another class, rather than warning (§3); a mistaken
   catalog entry is worse than a failed call.
8. **A pending adapter load loses to an edit**: if the user commits an edit while
   a load is pending, the late result is ignored (§4.2).
9. **A given `funded` amount consumes the balance** for the allocations after it
   (§21.2).
10. **The edit chrome gains a fourth sibling button** (Pin or Unpin) at 2 columns,
    which amends RFC 0002 §5.9's three (§19).
11. **RFC 0002 §14 point I is closed here**: Today's P&L and the equity curve
    gain ▲ and ▼ (§5.5).
12. **The chart's axis type stays `xType`** (RFC 0002 §14 point A), so the story
    brief's "x: 'category'" is written `xType: 'category'` (§15).
13. **Table columns gain `sortable`, and `sort` events carry `dir`** (§16).
14. **The grid gains `addTypes`, `move`, `resize`, `remove`, `profileOverride`,
    `openPicker`, `setTopStrip` and `readingOrder`**, which the picker, list and
    strip stories need but whose briefs name only some of them. The owning story
    builds each (§11, §18, §19).
15. **`<ts-layout-list>` is P2 in the plan** but is specified here because its
    Decisions row (32) belongs with the other editing rows.
16. **`ts-reading-order-change` does not fire for the first order** (§11).
17. **`persist=""` is off**, with one development warning (§4.1).
18. **Element declarations carry JSDoc tags**, so the manifest generator needs no
    analyzer. Widget stories that land after `typings-and-manifest` add their own
    tags, and the generator fails when a tag in `WIDGETS` has none (§22.3).
19. **`bar` series are allowed on time and number axes too**, at the x positions
    given (§15).
20. **`paper` and `graphite` ignore `data-theme`**: choosing the preset chooses
    the mode (§13.1).
