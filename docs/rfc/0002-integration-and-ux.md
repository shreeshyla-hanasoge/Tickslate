# RFC 0002 — Drop-in integration, generic widgets, data states and editing UX

| | |
|---|---|
| Status | Approved 13 Oct 2026 |
| Written | 13 Oct 2026 |
| Amends | [RFC 0001](0001-api.md) §2, §3, §4.3–§4.5, §5, §6, §8.1–§8.6, §9, §11, §13 and §14 |
| Covers | Every public name 0.1.0 adds: markup-only grids, saving layouts, the widget contract and its data states, `<ts-card>`, `<ts-metric>` and `<ts-chart>`, the data shapes real APIs send, safe and accessible editing, theming, development warnings, packaging and size budgets |
| Amended by | [RFC 0003](0003-p1-surfaces.md) (Approved 14 Oct 2026): the P1 surfaces. Sections it changes are listed in its header; RFC 0003 wins where the two differ. |
| Sources | RFC 0001, [docs/BRIEF.md](../BRIEF.md), the P0 stories of the build plan, the design sheet `docs/design/generic-widgets.html`, and size measurements made for this RFC (§9) |
| Approval | Approved by the maintainer in chat on 13 Oct 2026, with all recommendations in the Decisions table (§13) accepted. |

RFC 0001 stays the contract for everything this RFC doesn't mention. Each
section below names the RFC 0001 section it amends, and RFC 0001 carries a
one-line pointer back at each of those sections.

Nothing here is built yet. Every P0 story in the build plan implements a part
of this RFC, so the names below are the ones those stories use. Each section
says which stories implement it.

**Conventions in this RFC**

- Signatures are TypeScript, as they will appear in `src/core/index.d.ts`,
  `src/elements/index.d.ts`, `src/elements/grid.d.ts` and
  `src/elements/widget.d.ts`.
- *Internal* marks a module or helper that the stories build and test but that
  no package entry exports. It is written down so stories agree on it; it can
  change without an RFC.
- Every figure in this RFC is made up.

## 1. Integration (amends RFC 0001 §4.3, §4.4, §4.5 and §8.4)

The goal: a developer gets from install to a rendered, editable, saved
dashboard in about a dozen lines, without writing layout JSON, and no tile is
ever silently dropped.

```html
<script type="module">
  import { persistLayout } from 'tickslate/elements'
  persistLayout(document.querySelector('ts-grid'), { key: 'ops-dashboard' })
</script>

<ts-grid>
  <ts-metric label="Signups" size="S"></ts-metric>
  <ts-chart label="Revenue" size="Wide"></ts-chart>
  <ts-card label="Notes" sizes="S Wide M"><p>Deploy freeze from Friday.</p></ts-card>
</ts-grid>
```

*Implemented by: grid-core (the core half), grid-integration (the grid half),
persist-layout.*

### 1.1 `readLayout`: the array shorthand and unknown items

```ts
/** A catalog object, or a function that resolves one item to its spec. */
type Catalog = WidgetCatalog | ((item: LayoutItem) => WidgetSpec | null)

function readLayout(
  input: Layout | LayoutItem[] | unknown,   // anything else is repaired, as in RFC 0001 §4.4
  options?: { catalog?: Catalog; device?: Device; unknown?: 'drop' | 'keep' },
): { layout: Layout; issues: LayoutIssue[] }

interface LayoutIssue {
  path: string
  code: 'unknown-version' | 'unknown-widget' | 'unsupported-size'
      | 'duplicate-id' | 'bad-shape' | 'top-strip-too-long' | 'top-strip-unknown-id'
  message: string
  fixed: 'dropped' | 'replaced' | 'migrated' | 'kept'   // 'kept' is new
}
```

- **An array** becomes
  `{ version: 1, device: options.device ?? 'desktop', profiles: { market: items, closed: [] } }`
  and is then read like any layout, so a bad item is reported at
  `profiles.market[3]`. `readLayout([])` is valid and reports nothing.
- **`unknown: 'keep'`** keeps an item whose type no catalog knows. It keeps its
  size when `isSize(size)`, else it becomes `'S'`, and the item is reported once
  as `{ code: 'unknown-widget', fixed: 'kept' }`. Duplicate ids are still
  dropped.
- **The default stays `'drop'`**, so direct callers see RFC 0001's behaviour and
  existing tests pass unchanged. `<ts-grid>` always reads with `'keep'` (§1.7).

### 1.2 Catalogs may be functions

`Catalog` replaces `WidgetCatalog` wherever the core takes a catalog. A
function catalog lets two items of one type have different sizes, which is how
two `<ts-card>` children with different `sizes` attributes snap differently.

```ts
function place(items: readonly LayoutItem[], columns: Columns, catalog?: Catalog): { placements: Placement[]; rows: number }
function addItem(items: readonly LayoutItem[], item: LayoutItem, catalog?: Catalog): LayoutItem[]
function resizeItem(items: readonly LayoutItem[], id: string, size: SizeName, catalog?: Catalog): LayoutItem[]
function dropIndex(items: readonly LayoutItem[], id: string, target: { col: number; row: number },
                   columns: Columns, catalog?: Catalog, aspect?: number): number

// Internal (src/core/catalog.js and place.js); both take the same Catalog.
function specFor(item: LayoutItem, catalog: Catalog): WidgetSpec | null
function placeFirst(items: readonly LayoutItem[], columns: Columns, catalog: Catalog, count: number): { placements: Placement[]; rows: number }
```

`specFor` returns `catalog(item) ?? null` for a function. For an object it
keeps today's own-property lookup, so a type called `toString` or `__proto__`
is unknown rather than a match on `Object.prototype`.

### 1.3 `DEFAULT_PROFILE` and `typeForTag`

```ts
const DEFAULT_PROFILE: 'market'

/** The catalog key whose spec has this tag, checking own entries only; null for a function catalog. */
function typeForTag(catalog: Catalog, tag: string): string | null
```

Both are exported from `tickslate`. The default profile keeps the name
`market` for compatibility (Decision 19). Profiles are an optional scheduling
feature: a host without a schedule never needs to name one, because it passes
an item array in and reads `items` out of the change event.

### 1.4 New `WIDGETS` entries

| Key | Tag | Label | Sizes |
|---|---|---|---|
| `card` | `ts-card` | Card | S, Wide, Tall, M, L, Banner, XL |
| `metric` | `ts-metric` | Metric | S, Wide, M |
| `chart` | `ts-chart` | Chart | Wide, M, L, XL |

The `WIDGETS` type in `index.d.ts` lists the three new keys beside the nine
finance ones.

### 1.5 Implicit mode: a grid from markup alone

A `<ts-grid>` whose `layout` the host never set is in **implicit mode**.

1. **Seeding.** At its first render the grid builds the active profile once
   from its element children, in DOM order. A child with `slot="empty"` is the
   empty-board content (§5.6), never a tile.
2. **Type.** `typeForTag(hostCatalog, tag) ?? typeForTag(WIDGETS, tag) ?? tag`.
   A host element that no catalog knows is its own type.
3. **Size.** Each child's declared `size` attribute is read once and kept for
   the life of the element. With no declared size, the first size its spec
   supports; with no spec, `S`. The grid never re-reads the `size` attribute it
   writes itself: at 2 columns it writes the reflowed variant (`M` for an `L`
   tile), and the item keeps `L`, so the tile is `L` again at 4 columns.
4. **A host resize.** A `size` mutation whose value differs from the grid's own
   last write to that element is the host resizing the tile, and the grid
   resizes it.
5. **Ids.** The `item` attribute, else the type, then `type-2`, `type-3`… for
   repeats, skipping ids already taken. Generated ids are written back as the
   `item` attribute, so the next read finds the same ids.
6. **After seeding, the grid's list is the source of truth.** A child added to
   the DOM is appended to the end. A child that leaves the DOM is dropped. A tile
   the user moved keeps its position whatever the DOM order. An id the user
   removed stays removed across child mutations until `restore(id)` (§5.4).
7. **Setting `layout`** (a `Layout` or an item array) switches the grid to
   explicit mode for good. Reading `layout` in implicit mode returns the seeded
   layout and changes nothing.

The grid never moves host children in the DOM, as in RFC 0001 §8.4, because
Vue and React would lose track of nodes moved under them.

The pure pieces live in `grid-geometry.js` (internal), so node tests cover the
four reconcile cases and the `L` round trip without a DOM:

```ts
interface ChildDescriptor {
  tag: string                     // the child's localName
  item?: string                   // its item attribute
  declaredSize?: string           // its size attribute as first read
  spec?: WidgetSpec | null        // its spec getter, or its sizes and label attributes
}

/** One item per descriptor, in DOM order, with the type, id and size rules above. */
function itemsFromChildren(
  descriptors: readonly ChildDescriptor[],
  resolve: (tag: string) => { type: string; spec: WidgetSpec | null },
): LayoutItem[]

/** `prevItems` in their own order, minus departed ids; new ids appended; ids in `removedIds` skipped. */
function reconcile(
  prevItems: readonly LayoutItem[],
  current: readonly LayoutItem[],          // itemsFromChildren() for the children now in the DOM
  removedIds: ReadonlySet<string>,
): LayoutItem[]

/** Per-item spec resolution (§1.6) as one function the core's Catalog accepts. */
function specResolver(
  elementSpecs: ReadonlyMap<string, WidgetSpec>,   // item id → the element's own spec
  hostCatalog: Catalog,
  base: WidgetCatalog,                             // WIDGETS
): (item: LayoutItem) => WidgetSpec | null
```

### 1.6 Per-item specs

Specs resolve lazily, when a tile renders, in this order:

1. the element's `spec` getter (§2.1), or for a plain element its `sizes` and
   `label` attributes;
2. the host's `catalog[type]`;
3. `WIDGETS[type]`.

The grid passes the `specResolver` function as the catalog to `place()`,
`dropIndex()`, `resizeItem()` and `addItem()`. An element that upgrades later
(its tag defined after the grid rendered) is resolved again on its next
render. `widgetCatalog()`, which lets a host register widgets globally, is in
RFC 0003.

### 1.7 Explicit mode and items without a child

- The grid reads every layout it is given with `{ unknown: 'keep' }` and the
  resolver as catalog, so a saved layout never loses a tile because a widget's
  tag isn't defined yet.
- A layout item with no matching child is skipped in placement (it leaves no
  hole) but kept in every commit, so the next `ts-layout-change` still carries
  it.
- `ts-layout-issues` fires only when the host sets `layout` or `catalog`, never
  for the grid's own commits or for implicit seeding.
- A child with no matching item stays hidden, as in RFC 0001 §8.4.

### 1.8 Events (amends RFC 0001 §8.2)

```ts
interface TsLayoutChangeDetail {
  layout: Layout               // the whole layout after the edit; save this
  items: LayoutItem[]          // new: layout.profiles[profile], for hosts that don't use profiles
  previous: Layout             // new: the layout before the edit
  profile: string
  reason: 'move' | 'resize' | 'remove' | 'undo' | 'add'   // 'undo' and 'add' are new
  id: string                   // the item edited; '' for 'undo' (compare previous and layout)
  index?: number               // new, on 'remove' and 'add': the item's index in the profile
  item?: LayoutItem            // new, on 'remove' and 'add': the item removed or added
}

interface TsColumnsChangeDetail {
  columns: 2 | 3 | 4
  device: Device
  initial: boolean             // new: true once, after the first measure
}
```

Every event still bubbles and is `composed`. `ts-columns-change` now also
fires after the first measure, with `initial: true`, so a host (and
`persistLayout`) learns the device without measuring the grid itself.

The grid's `profile` getter falls back to `DEFAULT_PROFILE`, and profiles are
looked up as own properties, so `profile="toString"` renders an empty board
rather than throwing.

### 1.9 `persistLayout`

```ts
// tickslate/elements
function persistLayout(grid: TsGrid, options: {
  key: string
  defaults?: Layout | LayoutItem[] | { desktop: Layout | LayoutItem[]; phone?: Layout | LayoutItem[] }
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
}): { reset(device?: Device): void; dispose(): void }
```

- **Keys.** Each device is stored under `` `${key}:${device}` ``, so desktop and
  phone layouts stay apart.
- **Device.** `'phone'` when `grid.columns` is 2, else `'desktop'`. If the grid
  hasn't measured yet (`columns` is 0), it waits for the first
  `ts-columns-change`. A later change of device loads the other device's entry.
- **Load.** `storage.getItem` and `JSON.parse`, each in try/catch, then
  `readLayout(raw, { unknown: 'keep', device })`, then `grid.layout = layout`.
  Valid JSON in the wrong shape is repaired through `readLayout`'s issues.
  Unreadable or unparseable storage counts as nothing stored.
- **Nothing stored.** The defaults are applied when given. Without defaults
  the grid is left alone, so an implicit grid stays implicit until its first
  edit is saved and reloaded.
- **Defaults.** A `Layout` or an item array serves both devices. In the object
  form, `phone` falls back to `desktop`.
- **Save.** On `ts-layout-change`, `JSON.stringify(detail.layout)` and
  `setItem`, in try/catch. A full or blocked storage (quota, private mode) is
  ignored without an uncaught error.
- **`storage`** defaults to `globalThis.localStorage` when it exists. With no
  storage at all, `persistLayout` only applies the defaults.
- **`reset(device = current)`** removes that device's entry and applies its
  defaults; without defaults the grid stays as it is until the page reloads.
  **`dispose()`** removes every listener.

The `persist` attribute, async storage adapters and the "edits will be lost"
warning are P1, in RFC 0003 (Decision 13).

## 2. Widget contract (amends RFC 0001 §2 registration, §8.1, §8.2 and §8.3)

*Implemented by: widget-registry (2.1, 2.2), widget-states (2.3–2.5),
data-diagnostics (2.6, 2.7), ts-card (2.8's test).*

### 2.1 The spec: how a widget describes itself

```ts
class TsWidget<Data = unknown> extends HTMLElement {
  /** A key of WIDGETS. Wins over `static spec` when both are set. */
  static catalogKey: string | null
  /** A widget's own description, for host widgets with no catalog entry. */
  static spec: { label?: string; sizes?: readonly string[]; phoneRows?: Partial<Record<SizeName, number>> } | null
  /** Read-only. Subclasses may override it, as <ts-card> does to read its attributes. */
  get spec(): Omit<WidgetSpec, 'tag'>   // { label, sizes, phoneRows? }
}
```

The instance getter resolves in this order:

1. `WIDGETS[static catalogKey]`, when that own key exists;
2. a validated `static spec`: `sizes` filtered with `isSize`, `label` used only
   when it is a string, `phoneRows` optional;
3. `{ label: '', sizes: [] }`.

Size snapping and the default label read `this.spec`. A widget with no label
from any source (attribute, spec) warns once in development (§7) and its region
is named by its tag, never by an empty `aria-label`.

```js
class SignupsTile extends TsWidget {
  static spec = { label: 'Signups', sizes: ['S', 'Wide'] }
}
// size="M" snaps to Wide; the tile is named "Signups".
```

### 2.2 Registration (amends RFC 0001 §2)

`define(tag, ctor)` moves to `src/elements/registry.js` (internal) and stamps
`ctor.tickslateVersion` with the core's `version`, so every class Tickslate
registers (`TsGrid` included) carries a `static tickslateVersion: string` that
another copy of Tickslate can read.

- The same constructor already defined under the tag: nothing happens, as
  today.
- A different constructor owns the tag: it is still skipped, but no longer
  silently. In development it warns once, naming both Tickslate versions, or
  saying the tag belongs to a non-Tickslate element when the owner has no
  `tickslateVersion`.

`tickslate/elements` registers the same elements and exports the same names
as before, plus the new widgets and `persistLayout`.

### 2.3 Data and states

```ts
type WidgetState = 'loading' | 'error' | null

class TsWidget<Data = unknown> {
  /** undefined (never set) shows the loading skeleton; null shows the empty state. */
  data: Data | null | undefined
  /** Attribute and property. 'loading' covers a re-fetch over existing data. */
  state: WidgetState
  /** Property. A message shows the error view. */
  error: string | null
  /** RFC 0001 §8.3, now built. Re-applied on connect. */
  actions: readonly string[]
  actionEnabled(name: string): boolean

  /** Render the template while data is undefined; viewModel then gets {}. Default false. */
  static dataOptional: boolean
  /** The empty state's text. Default 'No data'. */
  static emptyText: string
  /** Skeleton markup for one variant: by default a header, a headline bar and two text lines. */
  static skeleton(variant: SizeName): string
}
```

**Render precedence**, first match wins:

| | View | When |
|---|---|---|
| 1 | Error | `state === 'error'`, `error` is set, the JSON `data` attribute failed to parse (§2.6), or the view model threw |
| 2 | Loading | `state === 'loading'`, or `data === undefined` unless `static dataOptional` |
| 3 | Empty | `data === null` |
| 4 | Content | Anything else |

This changes RFC 0001 §8.1 in two ways: `undefined` data now shows a skeleton
rather than the empty state (Decision 8), and a view model that throws shows
the error view rather than the empty state. In development, data still
`undefined` 10 s after connecting warns once (§7).

### 2.4 The three views

| | Loading | Empty | Error |
|---|---|---|---|
| Markup | `.sk` blocks from `skeleton(variant)`, shaped like that variant's content | `<slot name="empty">` with `emptyText` as its fallback | `.err` with `part="error"`, an `aria-hidden` warning glyph in `--ts-warn` and text |
| Label | The real label | The real label | The real label |
| Region name | The label, with `aria-busy="true"` | The label | `<label>, error: <message>` |
| Extra | A shimmer from a `color-mix()` of `--ts-surface-2`, stopped under `prefers-reduced-motion` | Slotted light-DOM content stays clickable | A Retry button only when `actionEnabled('retry')`; it fires `ts-action { action: 'retry' }` |

- The error message is `error` when set, else the default text
  "Couldn't display this data". The error view is never shown as empty.
- The tile's box is the same in all four views: skeletons follow the content's
  layout, so switching views moves nothing.
- Each widget's English strings sit in one frozen constant object per module
  (`STRINGS`), ready for overridable messages in P1.

Each widget's `emptyText`:

| Widget | `emptyText` |
|---|---|
| Default | No data |
| `<ts-today-pnl>` | No trades today |
| `<ts-equity-curve>` | No trading days yet |
| `<ts-session-clock>` | No sessions set up |
| `<ts-metric>` | No data yet |
| `<ts-chart>` | No data yet |
| `<ts-card>` | No data (shown only when nothing is slotted into its body, §3.1) |

### 2.5 Actions

`actions` is the property RFC 0001 §8.1 and §8.3 describe, now built. Setting
a non-array gives `[]`. `actionEnabled(name)` is `actions.includes(name)`.
`'retry'` is the first action the base itself uses. Controls that only change
what a widget shows (the equity range) stay always on.

### 2.6 The JSON `data` attribute

For Blade, Django, Rails and static pages (Decision 15):

```html
<ts-metric label="Signups" data='{"value": 1204, "previous": 1075, "compareLabel": "vs last week"}'></ts-metric>
```

- `data` joins the observed attributes. While no `data` property has been set,
  a trimmed value starting with `{` or `[` is parsed with `JSON.parse` in
  try/catch. Other values are ignored.
- **The property wins once set.** From then on the attribute is ignored.
- A parse failure shows the error view; in development it warns once with the
  parser's message and position.
- An attribute reading `[object Object]` (a framework stringified an object)
  warns once in development: set the property instead.

### 2.7 `dataShape` and the development validator

```ts
type ShapeKind = 'number' | 'numeric' | 'time' | 'string' | 'boolean' | 'array' | 'object'

interface ShapeField {
  kind: ShapeKind
  optional?: boolean
  of?: ShapeKind | ShapeField | DataShape    // array items, or a nested object's shape
}

type DataShape = Readonly<Record<string, ShapeKind | ShapeField>>

class TsWidget {
  /** The data's expected shape. A bare kind is required; keys not listed are allowed. Default null. */
  static dataShape: DataShape | null
}

// Internal (src/elements/dev.js). Pure; returns the first problem, or null.
function checkShape(data: unknown, shape: DataShape, path?: string): ShapeProblem | null

interface ShapeProblem {
  path: string           // 'data.series[3].t'
  expected: ShapeKind
  received: string       // 'missing', 'null', 'array', 'string "n/a"', …
  keys?: string[]        // the keys the parent object had, for a missing key
}
```

| Kind | Passes when |
|---|---|
| `number` | `typeof v === 'number'` and finite |
| `numeric` | `toNumber(v)` is finite (§4.3) |
| `time` | `toTime(v)` is finite (§4.1) |
| `string` | `typeof v === 'string'` |
| `boolean` | `typeof v === 'boolean'` |
| `array` | `Array.isArray(v)` |
| `object` | a non-null object that isn't an array |

In development the base calls `checkShape` before `viewModel` and warns once
per element. Production builds contain neither the validator nor the call
(§7). The message names the element, its item, the path, the expected kind,
and what was received:

```
tickslate: <ts-metric item="signups"> data.value is missing (got keys: count, label)
tickslate: <ts-metric item="signups"> data.value should be numeric (got string "n/a")
tickslate: <ts-chart item="revenue"> data.series[2].points should be array (got object)
```

Without an `item` the element is written `<ts-metric>`.

The finance widgets declare:

| Widget | `dataShape` |
|---|---|
| `<ts-today-pnl>` | `net`, `realized`, `unrealized`, `fees`: numeric. Optional: `closedCount`, `openCount` (number); `intraday` (array of `{ t: time, v: numeric }`); `marks` (array of `{ t: time, kind: string }`); `window` (object `{ from: time, to: time }`); `asOf` (time); `live` (boolean) |
| `<ts-equity-curve>` | `days`: array of `{ date: time, pnl: numeric }`. Optional: `fees` (numeric), `trades` (number), `asOf`, `live` |
| `<ts-session-clock>` | `calendar`: object; `sessions`: array of string. Optional: `timeframes` (array of number) |

### 2.8 The naming rule

No Tickslate attribute or property may share a name with a member of
`HTMLElement.prototype`. That is why the card's attribute is `scrollable`
rather than `scroll`. Because Node has no `HTMLElement`,
`test/element-names.test.mjs` checks every observed attribute and added
property of every Tickslate element against a fixed list: `scroll`, `title`,
`hidden`, `slot`, `part`, `role`, `dir`, `lang`, `style`, `id`, `className`,
`tabIndex`, `inert`, `draggable`, `translate`, `popover`.

## 3. Generic widgets (new RFC 0001 §8.7)

Three widgets for any data (Decision 6). They follow the design sheet
(`docs/design/generic-widgets.html`) and [docs/ACCESSIBILITY.md](../ACCESSIBILITY.md).
"Tile" keeps its meaning of any grid child, and "stat" stays with edge stats.

### 3.1 `<ts-card>`: a themed tile for any content

```ts
interface CardData {
  asOf?: Time      // 'synced HH:MM' in the header, via fmt.time
  live?: boolean   // the live dot
}

/** <ts-card>, every size. catalogKey 'card'. */
declare class TsCard extends TsWidget<CardData> {
  static dataOptional: true
  /** From the sizes and label attributes. */
  get spec(): Omit<WidgetSpec, 'tag'>
}
```

```html
<ts-card label="Latency" size="M" sizes="Wide M L" scrollable>
  <span slot="value">182 ms</span>
  <button slot="actions" type="button">Details</button>
  <canvas style="height: 100%"></canvas>
  <span slot="footer">p95 over the last hour</span>
</ts-card>
```

| Attribute | Meaning |
|---|---|
| `label` | The heading and accessible name |
| `sizes` | Whitespace-separated sizes it may snap to, standalone and in a grid. Invalid tokens are ignored. Default: all seven. |
| `live` | Boolean: show the live dot |
| `as-of` | A `Time` (§4.1); shows "synced HH:MM" |
| `scrollable` | Boolean: the body scrolls (`overflow: auto`) instead of clipping |

| Slot | Content |
|---|---|
| (default) | The body: a `flex: 1; min-height: 0; overflow: hidden` box, so a child with `height: 100%` fills the remaining height at every size and follows resizes. A Chart.js or ECharts canvas goes here. |
| `value` | A headline, styled like `.big` |
| `actions` | The header's right end |
| `footer` | Below the body |
| `empty` | The empty state |

- Data is optional. `data` updates only the header meta, and its `asOf` and
  `live` win over the attributes when set.
- `data = null` never replaces slotted content: the empty view shows only when
  nothing is slotted into the body.
- `state = 'loading'` shows a skeleton over the body only.

### 3.2 `<ts-metric>`: a KPI tile

```ts
interface MetricData {
  value: Numeric
  format?: 'number' | 'money' | 'percent' | 'duration'   // default 'number'
  decimals?: number
  unit?: string               // fmt.unit(): '182 ms', '3 seats'
  compact?: boolean           // '1.2M'
  percentPoints?: boolean     // with format 'percent': value, previous, delta and target are 0–100
  previous?: Numeric
  delta?: Numeric
  deltaPct?: Numeric          // a fraction: 0.12 is 12%
  compareLabel?: string       // shown after the delta, e.g. 'vs last week'
  goodWhen?: 'up' | 'down' | 'neither'   // default 'up'
  series?: Array<{ t: Time; v: Numeric }> | Numeric[]
  target?: Numeric
  caption?: string
  asOf?: Time
  live?: boolean
}

/** <ts-metric>, sizes S · Wide · M. catalogKey 'metric'. */
declare class TsMetric extends TsWidget<MetricData> {
  /** Pure: data to display strings, paths and the accessible name. */
  static metricModel(data: MetricData, variant: SizeName, ctx: ViewModelContext): MetricModel
}

interface MetricModel {
  ariaLabel: string
  value: string                       // the headline
  delta: string                       // '+12%' or '−129', '' when there is none
  arrow: '▲' | '▼' | ''               // aria-hidden in the template
  tone: 'pos' | 'neg' | 'mut'
  compare: string                     // compareLabel
  line: string                        // sparkline path (Wide, M), '' without a series
  area: string
  targetPct: string                   // M: '84%', '' without a target
  targetWidth: number                 // M: 0..1, the bar's fill
  caption: string                     // M
  dropped: number                     // series points that couldn't be read
}
```

| Size | Shows |
|---|---|
| S | label, value, delta |
| Wide | adds a sparkline |
| M | adds a target bar with its percentage, and the caption |

- **Value** is read with `toNumber`. `format: 'percent'` takes a fraction
  (0.12 → 12%); `percentPoints: true` divides value, previous, delta and target
  by 100 first. `deltaPct` is always a fraction. `format: 'money'` uses the
  resolved currency; `'duration'` takes milliseconds. `unit` formats through
  `fmt.unit` (§4.4).
- **The headline** uses sign `'negative'`. Unless `compact` is set, at S it goes
  through `fmt.fit` with the style matching `format`, so a long value goes
  compact while the tile stays the same size. `compact: true` is compact at
  every size.
- **The delta** comes from `delta` or `deltaPct` when given, else from
  `previous`: `value − previous`, and `(value − previous) / |previous|`. When
  `previous` is 0 there is no percentage, never `∞%`. The percentage is shown
  when known, else the absolute delta in the value's format. It always carries
  `+` or `−` (U+2212, sign `'always'`) and an `aria-hidden` ▲ or ▼; a zero delta
  has neither.
- **Tone** follows `goodWhen`: with `'up'` a rise is `pos` and a fall `neg`;
  `'down'` swaps them; `'neither'` is always `mut`.
- **The sparkline** draws `series` through `linePaths`, reading each `t` with
  `toTime`; plain numbers are spaced evenly.
- **The target** bar is `value / target`, clamped to 0..1 for its width, and its
  text is the unclamped percentage. No target, or a target of 0 or less, shows
  no bar.
- **The accessible name** reads like `Signups, 1,204, up 12% vs last week`, and
  `Signups, 1,204` without a delta.
- `static emptyText = 'No data yet'`; skeletons follow each size's layout.
  `static dataShape` requires `value` (numeric) and lists every other key as
  optional.

### 3.3 `<ts-chart>`: line and area trends

```ts
type ChartKind = 'line' | 'area'

interface ChartSeries {
  id?: string
  name: string
  kind?: ChartKind                      // default 'line'
  points: Array<{ x: Time; y: Numeric }>
}

interface ChartOptions {
  xType?: 'time' | 'number'             // default 'time' (see §14, point A)
  format?: 'number' | 'money' | 'percent' | 'duration'
  decimals?: number
  unit?: string
  goodWhen?: 'up' | 'down' | 'neither'  // tones the first series' change where a size shows it
  asOf?: Time
  live?: boolean
}

type ChartData = ChartOptions & (
  | { series: ChartSeries[] }
  | {
      rows: Array<Record<string, unknown>>
      x: string                                                     // the row key for x
      y: string | string[] | Array<{ key: string; name?: string; kind?: ChartKind }>
    }
)

/** <ts-chart>, sizes Wide · M · L · XL. catalogKey 'chart'; the class lives in series-chart.js. */
declare class TsChart extends TsWidget<ChartData> {
  static chartModel(data: ChartData, variant: SizeName, ctx: ViewModelContext): ChartModel
}

interface ChartModel {
  ariaLabel: string                                   // also the svg's label
  series: Array<{ name: string; kind: ChartKind; line: string; area: string; last: string }>
  legend: Array<{ name: string; index: number }>      // index 1–4 picks --ts-series-<n>
  axis: { start: string; middle: string; end: string }
  zeroY: number                                       // the zero line, drawn in --ts-axis
  dropped: number                                     // rows or points that couldn't be read
}
```

```js
chart.data = {
  rows: [
    { date: '2026-09-01', revenue: 11800, cost: 7900 },
    { date: '2026-09-02', revenue: 12400, cost: 8100 },
  ],
  x: 'date',
  y: ['revenue', 'cost'],
  format: 'money',
}
```

- **Both forms draw the same chart.** The rows form becomes one series per `y`
  key, named by `name` or the key.
- **Reading.** `x` is read with `toTime` when `xType` is `'time'`, else with
  `toNumber`; `y` with `toNumber`. A row or point that can't be read is dropped
  and counted in `dropped`.
- **Kinds** `line` and `area` can be mixed. At most four series render; beyond
  that only the first four are drawn and development warns once.
- **Colours.** Series use `--ts-series-1` to `--ts-series-4` (§6). The widget
  CSS contains no colour values.
- **Sizes.** The legend appears from M up. Wide shows the first series' name in
  the header.
- **Axes.** Time axes label start, middle and end with `fmt.time` for spans
  under a day, otherwise with day labels from a cached `Intl.DateTimeFormat` in
  the formatter's locale and zone. Number axes use `fmt.number`. The zero line
  uses `--ts-axis`.
- **The svg** has `role="img"` and an `aria-label` giving each series' name and
  last value: `Revenue, last 12,400; Cost, last 8,100`.
- **Updates.** New data rewrites only path `d` attributes and text.
- `static emptyText = 'No data yet'`, with skeletons and a `dataShape` for both
  forms.

Bars and categories come in P1 (RFC 0003). `chart.js` gains two internal,
pure helpers, written with loops rather than spreads so large series can't
overflow the stack:

```ts
// Internal (src/elements/chart.js)
function seriesDomain(
  series: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  options?: { includeZero?: boolean },          // default true
): { x: [number, number]; y: [number, number] }

function areaPaths(
  points: ReadonlyArray<{ x: number; y: number }>,
  options: { width: number; height: number; pad?: number; xDomain: [number, number]; yDomain: [number, number] },
): { line: string; area: string; zeroY: number }
```

`areaPaths` draws one series on a domain shared with the others, and closes
its area at the zero line clamped into the plot.

## 4. Data inputs (amends RFC 0001 §3, §5 and §6)

Data in the shapes real backends send renders correctly or is reported.
Nothing is silently wrong.

*Implemented by: data-inputs (4.1–4.3, 4.5), format-generic (4.4).*

### 4.1 Time

```ts
type Time = number | string | Date

/** An instant in ms since the epoch, or NaN. */
function toTime(v: unknown): number

/** A calendar day 'YYYY-MM-DD' in `timeZone`, or null. */
function toDay(v: unknown, timeZone?: string): string | null   // timeZone default 'UTC'
```

Both are exported from `tickslate`, with the `Time` type. RFC 0001 §3 said an
instant is a millisecond number; every field that takes an instant now takes a
`Time`.

**`toTime`:**

| Input | Result |
|---|---|
| A finite number with \|n\| ≥ 1e11 | Milliseconds, as given |
| A finite number with \|n\| < 1e11 | Seconds, × 1000 (Decision 10) |
| A `Date` | `getTime()` |
| A numeric string (the §4.3 rule) | The number rule above |
| An ISO 8601 string | `Date.parse`, after trimming fractional seconds to milliseconds, because not every engine reads six digits |
| Anything else | `NaN` |

So `1760331000` and `1760331000000` are the same instant. Millisecond values
before March 1973 would be read as seconds, which is acceptable for dashboard
data. A date-time with no offset is read by `Date.parse` as the viewer's local
time, so APIs should send an offset (Laravel's ISO output ends in `Z`).

**`toDay`:**

| Input | Result |
|---|---|
| `'YYYY-MM-DD'` | Unchanged |
| An exact UTC-midnight ISO string (`'2026-10-12T00:00:00Z'`, `'2026-10-12T00:00:00.000000Z'`) | Its date part: such a string is a plain date a backend serialised as an instant |
| Any other instant `toTime` can read | `localDate(toTime(v), timeZone)` |
| Anything else | `null` |

With `'Asia/Kolkata'`, `'2026-10-11T18:30:00.000000Z'` is the day `2026-10-12`.

### 4.2 Stats and view models take a time zone

```ts
interface DayResult {
  date: Time            // was 'YYYY-MM-DD' only; read with toDay(date, timeZone)
  pnl: Numeric
  trades?: number
}

function equitySeries(days: readonly DayResult[], options?: { timeZone?: string }): EquityPoint[]
function equityStats(days: readonly DayResult[], options?: { timeZone?: string }): EquityStats
```

`timeZone` defaults to `'UTC'`, which keeps today's results for `'YYYY-MM-DD'`
dates. The equity curve passes `fmt.timeZone`. `[{ date: '2026-10-12T00:00:00.000000Z', pnl: 10 }, { date: '2026-10-13', pnl: '5' }]`
keeps both rows.

The widgets read every instant with `toTime` (Today's P&L `intraday[].t`,
`marks[].t`, `window`, and `asOf` on every widget) and every day with `toDay`.
The Today's P&L, Equity curve and Session clock view models, and those of the
new widgets, return **`dropped: number`**: the count of rows they couldn't use,
which development reports (§7). Today's P&L handles 200,000 readings without a
`RangeError`.

### 4.3 A stricter `toNumber`

```ts
/** A finite number from a number, a decimal string or a decimal-library object; else NaN. */
function toNumber(v: unknown): number
```

- A number is returned as is.
- A string is trimmed and accepted only when it matches
  `/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i` and gives a finite number. `' 12 '`
  and `'1e3'` still parse; `'0x10'`, `'0b1'`, `'Infinity'` and `''` give NaN.
- An object with a `toNumber()` method that returns a finite number (Decimal.js,
  big.js) gives that number.
- Anything else is NaN.

### 4.4 Formatter additions

```ts
interface Formatter {
  // existing members unchanged, except:

  /** The options that failed validation and fell back to the defaults. */
  readonly issues: readonly FormatterIssue[]

  /** Full form if it fits maxChars, else without decimals, else compact (only if shorter). */
  fit(v: Numeric, maxChars: number, o?: {
    style?: 'money' | 'number' | 'percent'   // default 'money', as today
    sign?: 'always' | 'negative'
    decimals?: number
  }): string

  /** Takes a fraction: 0.12 → '+12.00%' (sign 'always' by default), '12.00%' with sign 'negative'. */
  percent(v: Numeric, o?: { sign?: 'always' | 'negative'; decimals?: number }): string

  /** compact: true → '1.2M' in en-US, '1,2 Mio.' in de-DE. */
  number(v: Numeric, o?: { sign?: 'always' | 'negative'; decimals?: number; compact?: boolean }): string

  /** '182 ms' for a sanctioned unit; '3 seats' for any other. */
  unit(v: Numeric, unit: string, o?: { decimals?: number; compact?: boolean }): string
}

interface FormatterIssue {
  option: 'locale' | 'currency' | 'timeZone'
  value: unknown
  message: string
}
```

- **Validation.** `createFormatter` checks `locale` with
  `Intl.getCanonicalLocales`, `currency` with `/^[A-Za-z]{3}$/` plus a trial
  `NumberFormat`, and `timeZone` with a trial `DateTimeFormat`. An invalid
  option falls back to the `configure()` default (then the runtime's) and is
  listed in `issues`. `money()` never throws because of a bad option. The core
  still makes no console calls; development reports `issues` (§7).
- **`fit`** dispatches on `style`. It tries the full form, then no decimals,
  then compact, and never returns a compact form that isn't shorter.
- **`unit`** uses `Intl.NumberFormat` with `style: 'unit'` and
  `unitDisplay: 'short'` for an ECMA-402 sanctioned unit (millisecond, second,
  byte, megabyte, percent and the rest, held in a frozen set) or an
  `x-per-y` compound of two of them. Any other unit is the formatted number,
  a space, and the unit as given.

### 4.5 What changes for data already in use

Numbers below 1e11 used to be milliseconds and are now seconds, and
`toNumber` rejects strings it used to accept (`'0x10'`). Both are listed as
breaking in §11.

## 5. Grid UX (amends RFC 0001 §8.4, §8.6, §11 and §14)

Editing stays on by default (Decision 12), so it must be safe, reversible,
escapable and accessible without the host building any UI. The target is
WCAG 2.2 AA, including 2.5.7 (dragging movements), 2.4.3, 2.4.7, 2.4.11 and
4.1.3. This also amends §14: removing a tile is no longer a one-way door that
waits for a host's add sheet, because 0.1.0 ships Add back, and the picker for
new types is specified in RFC 0003 (Decision 14).

*Implemented by: edit-safety (5.2–5.4, 5.8), edit-controls (5.5–5.7),
accessible-editing (5.9–5.11).*

### 5.1 `<ts-grid>` after this RFC

```ts
// src/elements/grid.d.ts, re-exported from src/elements/index.d.ts
declare class TsGrid extends HTMLElement {
  get layout(): Layout
  /** A Layout or an item array. Switches the grid to explicit mode for good, and clears undo history. */
  set layout(value: Layout | LayoutItem[])
  catalog: Catalog
  /** Reflects the profile attribute; falls back to DEFAULT_PROFILE. */
  profile: string
  editing: boolean
  /** New. Attribute and property: no long press, no edit mode, no controls. */
  locked: boolean
  readonly columns: number
  /** New. Children whose item id isn't in the active profile. */
  readonly hiddenItems: ReadonlyArray<{ id: string; type: string; label: string }>
  schedule: (ProfileSchedule & { calendar: Calendar }) | null
  clock: () => number
  override(profile: string | null): void
  /** New. Restores the active profile's previous layout; false when there is nothing to undo. */
  undo(): boolean
  /** New. Adds a hidden child's item back; false when there is no such hidden child. */
  restore(id: string): boolean
}
```

| Attribute | Meaning |
|---|---|
| `locked` | New. Read-only dashboard: no editing, and the built-in controls are absent |
| `edit-controls="off"` | New. Hides the Edit layout button and the edit pill, for hosts with their own controls |
| `undo-toast="off"` | New. Suppresses the undo toast |
| `editing`, `profile`, `locale`, `currency`, `time-zone` | As in RFC 0001 |

| Part | Element |
|---|---|
| `board`, `placeholder` | As built |
| `toast` | New: the undo toast |
| `edit-pill` | New: the Done and Add back pill |
| `empty` | New: the empty-board panel |

| Slot | Content |
|---|---|
| (default) | The tiles |
| `empty` | New: replaces the empty board's text |

### 5.2 `locked`

- A long press on a locked grid neither starts editing nor fires
  `ts-edit-change`, and a widget button under the pointer still gets its click.
- `grid.editing = true` while locked is ignored, with one development warning.
  Setting `locked` while editing ends edit mode. Removing `locked` makes
  editing available again.
- The edit chromes are inert while locked, and the Edit layout button is absent.

### 5.3 Undo

- Before each commit (move, resize, remove, add) the grid pushes the active
  profile's layout onto its history: 20 entries per profile.
- `undo()` restores the previous layout of the active profile, so a removed
  tile returns at its old index and size, fires `ts-layout-change` with
  `reason: 'undo'`, and returns `true`. It returns `false` with nothing to undo.
- Ctrl+Z, or Cmd+Z, while editing calls `undo()`.
- Setting `layout` from the host clears the history.

```ts
// Internal (src/elements/grid-history.js). Pure.
function createHistory(cap?: number): {          // cap default 20
  push(profile: string, layout: Layout): void
  undo(profile: string): Layout | null
  clear(): void
}
```

### 5.4 The undo toast, `hiddenItems` and `restore`

- **The toast.** After a remove, a bottom-centred sticky pill reads
  "<Label> removed · Undo", with `part="toast"`, `role="status"` and a 44 px
  Undo button, in tokens only. It stays 6 s, pausing while hovered or focused.
  It slides only when motion is allowed. `undo-toast="off"` suppresses it.
  While it shows, it carries the removal's announcement, so the grid's own
  status region doesn't say it a second time.
- **`hiddenItems`** lists, as `{ id, type, label }`, the children whose item id
  isn't in the active profile, which includes tiles the user removed.
- **`restore(id)`** adds the item back through `addItem` with the per-item
  resolver (the child's declared size, else its first supported size), commits
  with `reason: 'add'`, pushes undo history, clears the id from the removed set
  (§1.5) and returns `true`. It returns `false` when no hidden child has that id.
- **Safe removal.** Double-clicking a remove badge, or pressing Delete twice,
  fires exactly one remove event and one announcement. The badge hides while
  the tile fades.

### 5.5 Ways in and out of edit mode

- **The Edit layout button** is the grid's first Tab stop, before the board. It
  is visually hidden until focused, absent while locked, and Enter starts
  editing.
- **The edit pill** (`part="edit-pill"`) is sticky at the bottom of the grid
  while editing, with 44 px targets. **Done** ends edit mode. When
  `hiddenItems` isn't empty it also shows **Add back (n)**, which opens a list
  of hidden tiles by label; choosing one calls `restore(id)` and moves focus to
  the restored tile. The pill and list are built with DOM APIs and
  `textContent`.
- **An outside tap.** While editing, a `pointerdown` outside the grid, judged
  with `composedPath()`, ends edit mode. A `pointerdown` inside the pill or its
  list doesn't.
- **Focus return.** When editing ends, focus goes back to the element that
  started it (the Edit layout button, or the tile under the long press) if it
  is still focusable, else to the grid host (`tabindex="-1"`, named by its own
  `aria-label` or "Dashboard"). Focus is moved before any chrome turns inert or
  `aria-hidden`.
- `edit-controls="off"` hides the button, the pill and the empty board's Add back button (the empty
  message and slot stay). Long press, Escape and
  the `editing` attribute still work.

```ts
// Internal (src/elements/grid-focus.js). Pure.
function isOutside(path: readonly EventTarget[], grid: EventTarget, extras?: readonly EventTarget[]): boolean

function pickFocusTarget<T>(
  candidates: ReadonlyArray<{ target: T; connected: boolean; hidden: boolean; disabled?: boolean } | null | undefined>,
): T | null   // the first candidate that is connected, not hidden and not disabled
```

### 5.6 The empty board

When the active profile has no visible tiles, the board stays one row tall and
shows "No widgets on this layout yet" (`part="empty"`). A host child with
`slot="empty"` replaces the text. While `hiddenItems` isn't empty the panel
also offers Add back, unless the grid is `locked` or has `edit-controls="off"`.

### 5.7 Edit-mode outline under reduced motion

With `prefers-reduced-motion`, the edit outline that replaces the wiggle is
`color-mix(in srgb, var(--ts-ink) 50%, transparent)`, at least 3:1 against
`--ts-bg` in both themes (3.21:1 on Paper, 4.86:1 on Graphite).

### 5.8 Text selection

- With a coarse pointer (`@media (pointer: coarse)`), tiles keep
  `user-select: none` and `-webkit-touch-callout: none`, so a long press never
  starts a selection, unless the grid is locked.
- With a fine pointer (`@media (pointer: fine)`), text in tiles can be selected
  outside edit mode. Selection is blocked while editing or dragging.

### 5.9 The edit chrome and tap-to-place

Each tile's edit chrome is a plain container with three **sibling** buttons,
never a `role="button"` wrapper around other controls:

| Button | Name | Tab stop |
|---|---|---|
| handle | `<label>, <size>, position n of N`, with shared hidden instructions via `aria-describedby`. It covers the tile and takes focus and keys. | Yes |
| remove | `Remove <label>` | No (`tabindex="-1"`) |
| resize | `Resize <label>, now <size>` | No (`tabindex="-1"`) |

**Tap-to-place** (WCAG 2.5.7) shares the keyboard's held state. Activating a
handle without dragging picks the tile up (announced). Activating another
tile's handle moves the held tile there and drops it. Activating the held tile
drops it. Escape, or a tap on empty board, cancels. Click suppression after a
real drag stays as built.

```ts
// Internal (src/elements/grid-input.js). Pure: key and tap input to an action.
type EditAction =
  | { type: 'pickUp'; id: string }
  | { type: 'moveBy'; id: string; dCol: -1 | 0 | 1; dRow: -1 | 0 | 1 }
  | { type: 'placeAt'; id: string; targetId: string }   // move the held tile to the target's index, then drop
  | { type: 'resizeStep'; id: string; dir: 1 | -1 }
  | { type: 'remove'; id: string }
  | { type: 'cancel'; id: string }
  | { type: 'drop'; id: string }

function keyAction(key: string, focusedId: string, state: { held: string | null }): EditAction | null
function tapAction(tappedId: string | null, state: { held: string | null }): EditAction | null
```

| Input | Not holding | Holding |
|---|---|---|
| Space, Enter | `pickUp` | `drop` |
| Arrow keys | none | `moveBy` |
| `+` `=` / `-` `_` | `resizeStep` 1 / −1 | none |
| Delete, Backspace | `remove` | none |
| Escape | none (the grid may leave edit mode, §5.11) | `cancel` |
| Tap on a handle | `pickUp` | the held tile: `drop`; another: `placeAt` |
| Tap on empty board | none | `cancel` |

### 5.10 Focus order, inertness and scrolling

- While editing, managed tiles are `inert`, and each tile's own `inert` value is
  restored exactly on exit.
- Chromes are re-inserted in placement order after each render (`moveBefore`
  where the browser has it, otherwise re-focusing the moved handle), so Tab
  follows the visual order and the focused handle keeps focus across reorders.
- After Done, Escape or an outside tap, focus is never inside an `aria-hidden`
  subtree.
- Keyboard moves and resizes call `scrollIntoView({ block: 'nearest' })` on the
  handle, smoothly only when motion is allowed.
- Focus rings are `outline: 2px solid var(--ts-focus)`, which survive forced
  colours, instead of box shadows.

### 5.11 Escape, schedules and announcements

- Escape ends edit mode only when focus is inside the grid or on `body`, or a
  gesture is active, so Escape in a host dialog never ends editing behind it.
- A scheduled profile change that falls due while editing or dragging is
  applied after Done.
- Announcements go to the grid's polite status region. Each is cleared, then
  set on the next frame, so two identical announcements in a row are both
  spoken.

| When | Announcement |
|---|---|
| Edit mode starts | Editing layout, N tiles. Tab to a tile, Space to pick it up. |
| Edit mode ends | Done editing layout. |
| Pick up | `<label>`, picked up. Use the arrow keys to move it, Space to drop, Escape to cancel. |
| Move | `<label>`, moved to position n of N. |
| A move that can't go further | Can't move further. |
| Drop | `<label>`, dropped. |
| Cancel | `<label>`, move cancelled. |
| Resize | `<label>`, size `<size>`. |
| Remove | `<label>` removed. (the toast says it while shown) |
| Restore | `<label>` added back. |
| Undo | Undone. |
| Profile change | Showing the `<profile>` layout. |

These strings sit in the grid's English constant object, ready for messages
in P1.

## 6. Theming (amends RFC 0001 §9)

Tiles look finished with only `import 'tickslate/elements'`, follow the host's
theme choice, keep figures steady and meet contrast floors that CI checks.

*Implemented by: install-styling; ts-chart adds the series tokens.*

### 6.1 Defaults in a cascade layer

```ts
// Internal (src/elements/default-tokens.js)
const TOKENS_CSS: string                   // tokens.css's blocks inside @layer tickslate.defaults { … }
function ensureTokens(doc?: Document): void
```

- On the first `TsWidget` connect, `ensureTokens` checks
  `getComputedStyle(doc.documentElement).getPropertyValue('--ts-surface')`. If it
  is empty, it adopts `TOKENS_CSS` as a constructed stylesheet (or a `<style>`
  element where adoption isn't available) and warns once in development that
  `tokens.css` isn't loaded. Without a document it does nothing.
- Unlayered author CSS beats layered CSS, so a `tokens.css` link added later, or
  a host rule such as `:root { --ts-surface: … }`, always wins.
- `tokens.css` is canonical. A node test parses both files and fails unless they
  declare the same properties with the same values in each block.

### 6.2 Dark mode is opt-in (Decision 7)

| Setting | Theme |
|---|---|
| Nothing | Paper (light), whatever the OS prefers |
| `data-theme="auto"` on any ancestor | Follows `prefers-color-scheme` |
| `data-theme="dark"` or a `.dark` ancestor | Dark (unchanged) |
| `data-theme="light"` | Paper, also inside a dark page: a light island |

The OS rule moves under `:where([data-theme="auto"])` inside the media query.
A `:where([data-theme="light"])` block with the Paper values follows the dark
rules, so `<ts-grid data-theme="light">` inside a `.dark` page is light, and
`data-theme="dark"` makes a dark island in a light page. Every block keeps zero
specificity. Publicly the dark theme is called Graphite (Decision 18).

### 6.3 Figures

`--ts-font-num` keeps Newsreader as the designed face and falls back to system
fonts with tabular figures instead of Georgia, whose digits are old-style and
proportional (Decision 9):

```css
--ts-font-num: 'Newsreader', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
```

Figure classes keep `font-variant-numeric: tabular-nums`. A neutral
system-font preset arrives with the P1 theme presets.

### 6.4 New tokens

| Token | Purpose | Floor |
|---|---|---|
| `--ts-axis` | Chart zero lines (`.lz`) and axis rules | 3:1 on `--ts-surface` |
| `--ts-focus` | Focus rings; defaults to the accent's value | 3:1 on `--ts-surface` |
| `--ts-series-1` … `--ts-series-6` | Chart series colours; `<ts-chart>` uses 1–4 | 3:1 on `--ts-surface` |

Each is defined for Paper and dark in `tokens.css` and the defaults. `.btn.on`
also gains an inset underline, so the pressed state isn't carried by a
background tint alone.

### 6.5 Before the elements upgrade

`tokens.css` (and the defaults) hide `ts-grid` children until the grid is
defined and reserve one `--ts-row` of height for the grid; known widget tags
reserve their standalone height. All of it is `:not(:defined)` at zero
specificity, so a page that loads the script late doesn't jump.

### 6.6 Contrast floors

Floors apply to pairs that are actually rendered (Decision 20), and
`test/tokens.test.mjs` checks them with the WCAG luminance formula:

| Pair | Floor |
|---|---|
| `--ts-ink`, `--ts-muted`, `--ts-profit`, `--ts-loss`, `--ts-warn`, `--ts-accent` on `--ts-surface` | 4.5:1 |
| Text that renders on `--ts-bg` | 4.5:1 |
| `--ts-ink` on `--ts-surface-2` | 4.5:1 |
| Marks: `--ts-axis`, `--ts-focus`, `--ts-series-*` on `--ts-surface` | 3:1 |
| Any other text on `--ts-surface-2` | Not allowed: no coloured or muted text sits there |

Measured on 13 Oct 2026 (WCAG 2.x ratios):

| Text token | Paper on surface | Paper on bg | Dark on surface | Dark on bg |
|---|---|---|---|---|
| ink | 17.09 | 15.14 | 13.34 | 16.12 |
| muted | 5.70 | 5.05 | 5.78 | 6.99 |
| profit | 5.28 | 4.68 | 7.64 | 9.23 |
| loss | 5.43 | 4.81 | 5.45 | 6.59 |
| warn | 5.00 | **4.43** | 8.79 | 10.63 |
| accent | 6.64 | 5.88 | 4.92 | 5.95 |

Every pair on `--ts-surface` passes. Paper `--ts-warn` on `--ts-bg` is below
4.5:1, but no widget or grid control renders warn text on `--ts-bg` (tiles,
the toast and the edit pill all sit on `--ts-surface`), so the palette stays
as it is; see §14, point C. Ink on `--ts-surface-2` is 14.63 (Paper) and 9.37
(dark).

## 7. Diagnostics (new: RFC 0001 has no section on warnings)

Wrong data and wrong wiring are explained in development and cost nothing in
production.

*Implemented by: widget-registry (the helpers), data-diagnostics and
grid-integration (the warnings), dev-build (the build switch).*

### 7.1 The switch and the helpers

```ts
// Internal (src/elements/dev.js)
const DEV: boolean                 // typeof __TS_DEV__ === 'undefined' ? true : Boolean(__TS_DEV__)
function warnOnce(key: string, message: string): void   // console.warn('tickslate: ' + message), once per key
function resetWarnings(): void     // for tests
```

- Unbundled source and `elements.dev.js` have `DEV` true; the production
  `elements.js` is built with `__TS_DEV__` false.
- Every call site is `if (DEV) warnOnce(…)`, so production builds drop the
  message strings, the validator and the timers that feed them.
- Production code logs only with `console.error`, and only for a render
  failure. The core never logs.
- Per-element warnings key on the element (its tag and item), so each element
  warns once.

### 7.2 Every development warning

The prefix, the element naming and the trigger are the contract; wording may
be polished in implementation.

| # | Trigger | Message (after `tickslate: `) |
|---|---|---|
| 1 | A tag is owned by another Tickslate copy or another library | `<ts-card> is already defined by Tickslate 0.1.0, so this copy (0.1.1) was not registered.` / `… by a non-Tickslate element …` |
| 2 | A widget has no label from any source | `<my-tile> has no label, so its region is named "my-tile". Set a label attribute or static spec.` |
| 3 | An explicit-mode child has no `item` | `<ts-grid> child <ts-card> has no item attribute, so no layout item can place it.` |
| 4 | A layout item has no child after two frames | `<ts-grid> layout item "revenue" has no child with item="revenue"; it is kept in the layout but not shown.` |
| 5 | A dashed child tag is still undefined after 2 s | `<ts-grid> child <ts-metric> is still undefined after 2 s. Did you import 'tickslate/elements'?` |
| 6 | Ids were generated for a type with two or more instances | `<ts-grid> generated ids card, card-2 for repeated <ts-card> children. Give each an item attribute so saved layouts survive reordering.` |
| 7 | `editing` set while locked | `<ts-grid> is locked, so editing was not turned on.` |
| 8 | The `data` attribute isn't valid JSON | `<ts-metric item="signups"> data attribute is not valid JSON: <parser message> (position 41).` |
| 9 | The `data` attribute reads `[object Object]` | `<ts-metric item="signups"> data attribute reads "[object Object]"; set the data property instead.` |
| 10 | Data doesn't match `dataShape` | The §2.7 format |
| 11 | `formatter.issues` isn't empty | `<ts-metric item="signups"> currency "RUPEE" from its currency attribute is not valid; the default is used.` The source is the widget's attribute, the grid's attribute or `configure()`. |
| 12 | A view model reports `dropped > 0` | `<ts-chart item="revenue"> dropped 3 rows it couldn't read.` |
| 13 | Data still `undefined` 10 s after connect | `<ts-metric item="signups"> has had no data for 10 s and still shows a skeleton. Set data, or null for the empty state.` |
| 14 | `tokens.css` isn't loaded | `tokens.css isn't loaded, so built-in defaults are used. Import 'tickslate/tokens.css' to theme the widgets.` |
| 15 | More than four chart series | `<ts-chart item="revenue"> draws at most 4 series; 6 were given.` |

**Errors, in production too:** a widget that can't render logs
`console.error('tickslate: <ts-today-pnl item="pnl"> could not render its data; see docs/widgets/ts-today-pnl.md', err)`
once per run of failures, and shows the error view.

The "edits will be lost" warning for a grid with no saving wired is P1, with
the `persist` attribute.

### 7.3 The `development` export condition

Bundlers that honour the `development` condition (Vite and webpack in dev
mode, `node --conditions=development`) resolve `tickslate/elements` to
`elements.dev.js`, which has every warning. Production builds resolve
`elements.js`, which has none (§8).

## 8. Packaging (amends RFC 0001 §2)

*Implemented by: release-gates (the checks and the report), dev-build (the
conditions, the dev build and enforcement), grid-core (`grid.d.ts`).*

```json
{
  "sideEffects": ["./elements.js", "./elements.dev.js", "*.css"],
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js",
      "default": "./index.js"
    },
    "./elements": {
      "types": "./elements.d.ts",
      "development": "./elements.dev.js",
      "import": "./elements.js",
      "default": "./elements.js"
    },
    "./tokens.css": "./tokens.css",
    "./package.json": "./package.json"
  },
  "engines": { "node": ">=20" }
}
```

- **Conditions.** Every JavaScript entry has `types`, `import` and `default`.
  `./elements` adds `development`, listed before `import`. The stylesheet and
  `package.json` entries stay plain paths.
- **The dev build.** `vite.dev.config.js` builds `src/elements/index.js` to
  `dist-lib/elements.dev.js` with `__TS_DEV__` true. The core stays external
  and its import is rewritten to `./index.js`, as in the library build, so both
  builds share one core and one `configure()` state. `vite.lib.config.js`
  defines `__TS_DEV__` false.
- **Types.** The `TsGrid` declarations move unchanged into
  `src/elements/grid.d.ts`, which `index.d.ts` re-exports and `pack-lib` ships.
- **Node.** `engines` becomes `>=20`, and CI runs Node 20, 22 and 24
  (Decision 17). Unit tests still need no install.
- **Scripts.** `npm run size` reports sizes and applies budgets (§9).
  `npm run verify:package` checks every manifest target, the version export,
  the shipped docs, DOM-free imports of `index.js` and `elements.js`, the pack
  allowlist, that `elements.js` contains no `console.warn` while
  `elements.dev.js` contains at least one and imports `./index.js` (never
  `elements.js`), and that `tickslate/elements` resolves to `elements.dev.js`
  under `--conditions=development` (checked with `import.meta.resolve`). `npm run test:browser` runs the Playwright suite
  (Decision 21).
- **Release order.** `npm run release` runs `test`, `build:lib`, `build:dev`,
  `build:umd`, `pack:lib`, `verify:package` and `size`, with `build:dev` after
  `build:lib` because `build:lib` empties `dist-lib/`.

## 9. Budgets (amends RFC 0001 §13)

RFC 0001 §13 set core ≤ 6 kB and `tickslate/elements` ≤ 24 kB gzipped for all
nine widgets. The core is already over with three widgets.

**Measured** on 13 Oct 2026 at `dd51551` (three finance widgets, no generic
widgets yet): `vite build` of the library and UMD configs, then esbuild 0.21.5
`minify` of each output file, then gzip from `node:zlib` at its default level,
which is what release-gates' `scripts/check-size.mjs` does. Sizes are bytes;
1 kB is 1,024 bytes, as in that script and in Emberwick's.

| File | Raw | Minified | Min + gzip |
|---|---|---|---|
| `dist-lib/index.js` (the core) | 30,036 | 17,880 | **7,119** (6.95 kB) |
| `dist-lib/elements.js` (imports the core as `./index.js`) | 94,367 | 63,492 | **20,384** (19.91 kB) |
| All-in: `tickslate/elements` bundled with its core into one file | | 75,506 | **25,060** (24.47 kB) |
| `dist-lib/umd/tickslate.umd.js` (the core; vite already minifies it) | 18,178 | 18,111 | **7,245** (7.08 kB) |

Loaded unbundled from a CDN, the two ESM files gzip separately to 27,503
bytes. The "25 kB" quoted for elements in Decision 16 is Vite's own report,
gzip of the unminified `elements.js` (25.7 kB); minified it is 19.9 kB.

**Proposed budgets** (Decision 16), all min + gzip:

| Budget | Until RFC 0002 is approved | After approval, during development | At release (release-0-1-0) |
|---|---|---|---|
| Core, `index.js` | 6 kB (RFC 0001), warn | **10 kB** (10,240 B), enforce (a development ceiling, tightened at release prep) | **9.5 kB** (9,728 B), enforce: measured 8,484 B + 10 %, rounded up to 0.5 kB; set 2026-10-13 |
| `elements.js` alone | 24 kB (RFC 0001), warn | replaced by the all-in budget | — |
| All-in elements, bundled with its core | reported only | **55 kB** (56,320 B), enforce (a development ceiling: the P0 set still adds metric, chart and two editing stories; per-widget entries in P1 and release prep tighten it) | **50 kB** (51,200 B), enforce: measured 46,478 B + 10 %, rounded up to 0.5 kB; set 2026-10-13 |
| UMD, `umd/tickslate.umd.js` | reported only | **11 kB** (11,264 B), enforce (the core plus a ~150 B wrapper, so headroom above the core's 10 kB) | **9.5 kB** (9,728 B), enforce: measured 8,639 B + 10 %, rounded up to 0.5 kB; set 2026-10-13 |
| `elements.dev.js` | — | reported only | reported only |
| Grid plus one widget | — | — | **15 kB** (15,360 B) once per-widget entries land (P1) |

Each budget in `scripts/check-size.mjs` carries its mode (`warn` or
`enforce`), its target and the date it was set. A warn budget prints and exits
0; an enforce budget fails the build. The mini-chart wrapper's 3 kB stays as
RFC 0001 set it, for when that widget is built.

## 10. Accessibility (amends RFC 0001 §11)

[docs/ACCESSIBILITY.md](../ACCESSIBILITY.md) is the definition of done every
widget meets before it merges, written before any new widget is built. It
keeps RFC 0001 §11 and adds: arrows beside signs, list and table semantics for
rows, 44 × 44 px targets at 2 columns, logical CSS properties, figures with
`unicode-bidi: isolate`, the contrast floors of §6.6, strings in one constant object, and the
manual checks (keyboard only, VoiceOver, NVDA, forced colours, 390 px). In
0.1.0 every tile stays a labelled region; tiles becoming `role="group"` with a
heading is P1 (Decision 25).

## 11. What changes for existing hosts

0.1.0 is the first release, but the merged code (RFC 0001) behaves
differently in these ways, which the changelog lists as breaking:

| Change | Was | Now | Section |
|---|---|---|---|
| OS dark mode | Automatic unless `data-theme="light"` | Opt-in with `data-theme="auto"` | §6.2 |
| Data never set | The empty state | A loading skeleton | §2.3 |
| Numeric timestamps | Always ms | Below 1e11 they are seconds | §4.1 |
| `toNumber` | Any string `Number()` accepts | Decimal and exponent strings only, plus decimal objects | §4.3 |
| A throwing view model | The empty state | The error view | §2.3 |
| `ts-columns-change` | Only on a change | Also once after the first measure, `initial: true` | §1.8 |
| A tag owned by another class | Skipped silently | Skipped, with a development warning | §2.2 |
| Node | `>=18` | `>=20` | §8 |

## 12. Next

[RFC 0003](0003-p1-surfaces.md) (Approved 14 Oct 2026) specifies every P1 surface. By name only:

- messages (overridable strings and size names)
- per-widget entry points, the one-script CDN bundle and the dev tree
- `defineWidget`, `widgetCatalog` and `onCatalogChange` (the authoring kit)
- `<ts-grid persist>` and async storage adapters
- tile chrome: `role="group"`, `heading-level`, parts and typography tokens
- freshness, stale warnings and change flashes
- tile activation and chart point selection
- wide screens: host breakpoints and a maximum width
- reading order outside edit mode
- locale-correct times, dates and durations
- right-to-left grids
- overnight and 24/7 sessions
- theme presets and colour-vision palettes
- strict CSP and Trusted Types
- `<ts-chart>` bars and categories
- `<ts-table>`
- `<ts-progress>`
- the add-widget picker (`ts-add-request`, `grid.add`) and grid controls
- the phone top strip
- JSX, Vue and Svelte typings and a custom elements manifest
- the remaining finance widgets: `<ts-pnl-calendar>`, `<ts-edge-stats>`,
  `<ts-capital-funding>`, `<ts-watchlist>`, `<ts-open-positions>`

## 13. Decisions

One row per question in the build plan's "Decisions for the maintainer".
The recommended option is marked **Recommended**. Reply per row, or "go with
the recommendations"; a row you change is applied to this RFC before it is
approved.

| # | Question | Options | Status |
|---|---|---|---|
| 1 | CLAUDE.md says the API is approved before it is implemented, but building should start now. How do they combine? | **Recommended:** start Wave 0 now, since it changes no public API (this RFC, the design sheet, landing #1–#5, the go-public clean-up, release gates and a refactor). Begin Wave 1 only after RFC 0002 is approved, or after you say "build ahead" in chat; then implementation PRs target integration branches, nothing merges to master before approval, and a changed row is applied before merge.<br>Alternative: build every wave now and approve afterwards. | Accepted (recommended option) |
| 2 | How should PRs #1–#5 land? | **Recommended:** review and merge them in order with "Create a merge commit" or "Rebase and merge", not squash, because squashing breaks the stacked branches. You merge, or tell the agent in chat to run `gh pr merge` for each. New waves then branch from master under docs/WORKFLOW.md.<br>Alternative: squash, retargeting and rebasing each next PR after every merge. | Accepted (recommended option) |
| 3 | Going public: which figures in the repo are real, should history be rewritten, and when is the repo made public? | **Recommended:** every flagged figure is listed in docs/PUBLIC-CHECKLIST.md and replaced by made-up ones in the current files. If a real figure is in git history, you decide whether to rewrite it; agents never rewrite history or force-push. Make the repo public before release-0-1-0, and optionally reserve the npm name now (free on 13 Oct 2026).<br>Alternative: stay private until 0.1.0 is published. | Accepted (recommended option) |
| 4 | What is the scope of 0.1.0? | **Recommended:** the grid (implicit mode, built-in edit controls, undo, Add back, `locked`), `<ts-card>`, `<ts-metric>`, `<ts-chart>` (line and area), Today's P&L, the equity curve, the session clock, loading/empty/error states, data diagnostics, `persistLayout`, docs, release gates and browser tests. The other finance widgets, the picker, messages and presets land in 0.2, when the first consumer (the maintainer's trading app) adopts.<br>Alternative: hold 0.1.0 for all nine finance widgets of the original brief. | Accepted (recommended option) |
| 5 | How does the package describe itself in the README and on npm? | **Recommended:** "Dashboard widgets for the web: a resizable grid, KPI tiles, charts and cards for any data, with a finance set built in." Keywords: dashboard, kpi, metrics, chart, analytics, web-components, custom-elements, plus the finance terms.<br>Alternative: keep today's finance-only description. | Accepted (recommended option) |
| 6 | What are the three generic widgets called? | **Recommended:** `<ts-card>` (key `card`), `<ts-metric>` (key `metric`, with `goodWhen: 'up' \| 'down' \| 'neither'`) and `<ts-chart>` (key `chart`). "Tile" already means any grid child and is a part name; "stat" collides with edge stats.<br>Alternative: other names, given before Wave 1 starts. | Accepted (recommended option) |
| 7 | Should OS dark mode stay automatic? | **Recommended:** make it opt-in with `data-theme="auto"`; `data-theme="dark"` and `.dark` are unchanged; add a light-island block so a light grid works inside a dark page (§6.2). Please confirm the first consumer sets `data-theme` or `.dark` explicitly before this merges.<br>Alternative: keep automatic dark and add only the island block. | Accepted (recommended option) |
| 8 | What does `undefined` data mean? | **Recommended:** `undefined` shows a skeleton, `null` the empty state, and `state="loading"` covers re-fetches over existing data. A development warning fires if data is still `undefined` after 10 s (§2.3).<br>Alternative: keep `undefined` as the empty state. | Accepted (recommended option) |
| 9 | Which font do figures fall back to without Google Fonts? | **Recommended:** keep Newsreader as the designed face and fall back to system UI fonts with tabular figures (§6.3). A neutral system-font preset comes in P1.<br>Alternative: keep Georgia, whose digits are old-style and proportional. | Accepted (recommended option) |
| 10 | How are numeric timestamps told apart, seconds or milliseconds? | **Recommended:** \|n\| < 1e11 is seconds, anything larger ms, documented (§4.1). Only an exact UTC-midnight ISO string counts as a plain date; other date-times go through the formatter's time zone.<br>Alternative: milliseconds only, as RFC 0001 §3 says. | Accepted (recommended option) |
| 11 | What happens to layout items whose widget type the grid doesn't know? | **Recommended:** `<ts-grid>` always keeps them (`unknown: 'keep'`) and resolves specs lazily when the tile renders; `readLayout`'s default stays `'drop'` for direct callers (§1.1, §1.7).<br>Alternative: the grid drops them, as today. | Accepted (recommended option) |
| 12 | Is editing on by default, and how does a user get in, get out and get tiles back? | **Recommended:** keep long-press editing on by default, made safe to leave on because `persistLayout` (row 13) saves in one line, with `locked` for read-only dashboards. Show built-in controls by default: a visually hidden "Edit layout" button for keyboard users, a Done pill, an outside-tap exit, an undo toast and Add back for removed tiles. Hosts with their own UI set `edit-controls="off"` and `undo-toast="off"` (§5).<br>Alternative: editing off unless the host sets `editing`, with no built-in controls. | Accepted (recommended option) |
| 13 | How are layouts saved in 0.1.0? | **Recommended:** ship `persistLayout(grid, { key })` as a one-line function in 0.1.0 and use it in the README quick start (§1.9). The `persist` attribute, async adapters and the "edits will be lost" warning follow in P1.<br>Alternative: hosts save from `ts-layout-change` themselves. | Accepted (recommended option) |
| 14 | Is the full add-widget picker in 0.1.0? | **Recommended:** no. 0.1.0 ships `hiddenItems`, `restore(id)` and the built-in Add back list, so removal is never a one-way door. The picker for new types arrives in P1, with a cancellable `ts-add-request` that the host answers by rendering the child.<br>Alternative: build the picker for 0.1.0. | Accepted (recommended option) |
| 15 | May a widget's data be passed as a JSON attribute, for Blade, Django, Rails and static pages? | **Recommended:** yes. A `data` attribute starting with `{` or `[` is parsed as JSON, and the property wins once set. A parse failure shows the error view with a development warning (§2.6).<br>Alternative: the property only. | Accepted (recommended option) |
| 16 | What size budgets apply? RFC 0001 §13's targets (core 6 kB, elements 24 kB for all nine widgets) no longer fit: the core is already over, and elements is close with three of nine widgets (§9). | **Recommended:** report against RFC 0001's budgets as warnings until this RFC is approved, then enforce core ≤ 10 kB and all-in elements ≤ 55 kB min + gzip during development, tightened to measured + 10 % at release; grid plus one widget ≤ 15 kB once per-widget entries land in P1 (§9).<br>Alternative: keep 6 kB and 24 kB and cut code to meet them. | Accepted (recommended option) |
| 17 | Which Node version does the package require? | **Recommended:** `engines` `>=20`, and CI on Node 20, 22 and 24 (§8).<br>Alternative: keep `>=18`, which is end-of-life. | Accepted (recommended option) |
| 18 | What is the dark theme called publicly? | **Recommended:** Graphite in the playground and gallery; Paper stays the light theme's name.<br>Alternative: keep the current product-named label, against the generic-vocabulary rule. | Accepted (recommended option) |
| 19 | What is the default layout profile called? | **Recommended:** keep `market` as the storage key for compatibility, with no alias. Document profiles as an optional scheduling feature; generic hosts use the array shorthand going in and the event's `items` coming out, and the P1 profile switcher is hidden when no schedule is set (§1.3).<br>Alternative: rename it (for example `default`) with an alias for saved layouts. | Accepted (recommended option) |
| 20 | The contrast floors would fail some dark pairs on `--ts-surface-2` (muted, loss, accent) and warn Paper on `--ts-surface-2`, though no widget renders coloured text there. Should the palette change? | **Recommended:** no. Test only the pairs that are rendered (all pass today), and add the rule that coloured text never sits on `--ts-surface-2` to docs/ACCESSIBILITY.md. Any future palette change becomes its own Decisions row (§6.6; see also §14, point C).<br>Alternative: darken or lighten those tokens now. | Accepted (recommended option) |
| 21 | May agents add Playwright and axe as devDependencies, download about 1 GB of browser binaries, and add a browser CI job? | **Recommended:** yes. Unit tests stay install-free under `node --test`; browsers run only in `npm run test:browser` and a separate CI job. Wave 7's browser-tests story is gated on this answer.<br>Alternative: no browser tests; manual checks only. | Accepted (recommended option) |
| 22 | Should CLAUDE.md change to match the generic direction? | **Recommended:** yes, with the wording in the appendix below: "dashboard widgets for any data, with a finance set built in", the vocabulary rule extended with metric, series, card, row, status and target, RFC 0002 named as the current contract, and links to docs/WORKFLOW.md and docs/ACCESSIBILITY.md. It is applied only after you approve it.<br>Alternative: leave CLAUDE.md as it is. | Accepted (recommended option) |
| 23 | Is the phone top strip in scope? RFC 0001 decision 6 left it "if you say so". | **Recommended:** yes, as P1 after RTL, decided in RFC 0003. It isn't needed for 0.1.0.<br>Alternative: build it for 0.1.0, or drop it from the model. | Accepted (recommended option) |
| 24 | Should the browser floor rise from Safari 16.2 to 16.4, for manual slot assignment (reading order) and `adoptedStyleSheets` (strict CSP)? | **Recommended:** yes, decided in RFC 0003. Below 16.4 the grid falls back to the single slot and to inline styles, so nothing breaks.<br>Alternative: stay at 16.2 and skip both features. | Accepted (recommended option) |
| 25 | How are tiles exposed to assistive technology? Today every tile is its own region landmark. | **Recommended:** in P1 (tile chrome) each tile becomes `role="group"` named by its label, with the label as a heading at a `heading-level` attribute (default 3), and `<ts-grid>` becomes the single labelled region. 0.1.0 keeps today's regions.<br>Alternative: change the semantics in 0.1.0. | Accepted (recommended option) |
| 26 | Should the demo be published on GitHub Pages, and may agents vendor the OFL font files for it? | **Recommended:** yes, once the repo is public. Agents prepare `pages.yml` and you enable Pages. Fonts are fetched only with your approval; otherwise the site uses the system fallback and makes no third-party requests.<br>Alternative: no public demo site. | Accepted (recommended option) |

## 14. Points this RFC settles that no decision covers

Found while writing the signatures down. Each is a proposal the RFC's
approval accepts unless you amend it.

- **A. The chart's axis type is `xType`.** The plan wrote it as
  `x?: 'time' | 'number'`, but the rows form already uses `x` for the row key
  (`{ rows, x: 'date', y: 'revenue' }`), so one name would mean two things
  and a column called `time` would be ambiguous. `xType` is used in both forms.
- **B. `ts-layout-change` for `'undo'` has `id: ''`.** An undo restores a whole
  profile from a history that stores layouts only; hosts compare `previous`
  and `layout` if they need the difference.
- **C. The `--ts-bg` floor covers the text that renders there.** Paper
  `--ts-warn` on `--ts-bg` is 4.43:1. No text other than ink and muted renders
  on `--ts-bg`, so the install-styling contrast test should assert the six
  text tokens on `--ts-surface` and ink and muted on `--ts-bg`. If you would
  rather keep warn on `--ts-bg` in the test, Paper's warn needs to darken, which
  under Decision 20 is a palette change of its own.
- **D. `dataShape` has a `boolean` kind**, so `<ts-metric>` can list `compact`,
  `percentPoints` and `live` among its optional keys.
- **E. Implicit mode types an unknown tag as the tag itself**, and a grid child
  with `slot="empty"` is never a tile (§1.5).
- **F. The toast carries the removal's announcement** while it shows, so a
  remove is announced once (§5.4).
- **G. `<ts-chart>`'s `emptyText` is "No data yet"**, matching `<ts-metric>`.
- **H. The stylesheet and `package.json` exports stay plain paths**; only the
  JavaScript entries get `types`, `import` and `default` (§8).
- **I. Arrows on the finance widgets.** docs/ACCESSIBILITY.md requires an
  `aria-hidden` ▲ or ▼ beside every gain and loss. Today's P&L and the equity
  curve show signs and colour but no arrows. They are listed as known gaps,
  proposed for tile chrome in RFC 0003, rather than changed in Wave 1.
- **J. "All-in elements" means `tickslate/elements` bundled with its core into
  one file**, the row `scripts/check-size.mjs` already reports, and budgets use
  1 kB = 1,024 bytes as that script does (§9). The decisions list's "core
  7.1 kB" is the same 7,119 bytes counted in thousands.

## Appendix: CLAUDE.md amendment (applied on 13 Oct 2026)

Decision 22. Nothing below is applied until you approve it in chat. Each
block replaces the paragraph or bullet named above it, and the links in it are
relative to the repository root, where CLAUDE.md lives. The last block comes
from docs/PUBLIC-CHECKLIST.md rather than Decision 22, so it can be approved on
its own.

**Opening paragraph.** Replace "Tickslate is an open-source library of finance
dashboard widgets. It is a standalone project: …" with the following, which
also drops the app's name as docs/PUBLIC-CHECKLIST.md suggests:

```markdown
Tickslate is an open-source library of dashboard widgets for any data, with a
finance set built in. It is a standalone project: a sibling of Emberwick (the
maintainer's candlestick chart library), not part of it. The maintainer's
trading app is its first consumer.
```

**Where to start.** Replace "**Read docs/BRIEF.md before writing code.** It
holds the decisions already made, the v1 scope and the first tasks in order."
with:

```markdown
**The current contract is [RFC 0002](docs/rfc/0002-integration-and-ux.md),
on top of [RFC 0001](docs/rfc/0001-api.md).** Read both before writing code.
[docs/BRIEF.md](docs/BRIEF.md) is the original handover and explains where the
project came from. Branches, waves and changelog fragments follow
[docs/WORKFLOW.md](docs/WORKFLOW.md), and every widget meets
[docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).
```

**Hard rules.** Replace "**Agree the API before building it.** The first task is
an API RFC; get the maintainer's approval on it before implementing." with:

```markdown
- **Agree the API before building it.** Public API changes go through an RFC
  (RFC 0002 is current; RFC 0003 covers P1) and need the maintainer's
  approval in chat before implementing PRs merge to master.
```

**Principles.** Replace the "Generic vocabulary" bullet with:

```markdown
- **Generic vocabulary.** Name things as any dashboard would (metric, series,
  card, row, status, target) and, in the finance set, as any trading app would
  (strategy, account, allocation, position, order, fill, instrument,
  session), never after one product's screens.
```

and add to the end of the "Accessible by default" bullet:

```markdown
Every widget meets docs/ACCESSIBILITY.md before it merges.
```

**Work only in this repo** (from docs/PUBLIC-CHECKLIST.md, which flags the app's
name and the local checkout paths in this rule). Replace the bullet with:

```markdown
- **Work only in this repo.** Never edit a sibling project (Emberwick, or the
  first consumer's app) from a Tickslate session. Read them for reference
  only.
```

and move the checkout paths into an untracked file every session still loads,
such as your user-level `~/.claude/CLAUDE.md`.
