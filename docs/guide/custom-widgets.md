# Custom widgets, start to finish

[Your own widget](your-own-widget.md) shows the smallest widget that works. This
guide builds one that looks and behaves like the built-in ones: a monthly
recurring revenue tile (`<acme-mrr>`) with three sizes, a sparkline, a signed
change, loading, empty and error views, a button that tells the host something
happened, and a place in the widget catalog.

Every figure here is made up. The code is a real file,
[`examples/custom-widget/mrr.js`](../../examples/custom-widget/mrr.js), and every
block below headed `// mrr.js` is copied from it word for word. A test fails if
the guide and the file drift apart, and
[`mrr.test.mjs`](../../examples/custom-widget/mrr.test.mjs) tests the widget
itself. Read them side by side.

In the file the imports are relative (`../../src/…`) so the tests run from a
clone with no install. In your own project they are:

```js
import { toNumber } from 'tickslate'
import { TsWidget, defineWidget, widgetCatalog, linePaths } from 'tickslate/elements'
```

## What the host sends

```ts
interface MrrData {
  mrr: number          // 48250: this month's recurring revenue, in the grid's currency
  previous?: number    // 45900: last month's, for the change
  customers?: number   // 412
  history?: number[]   // [41200, 42900, 44100, 45900, 48250]: monthly, oldest first
}
```

It is plain data in. The widget fetches nothing and holds no credentials: the
host owns that, and sets `el.data = …` whenever a number moves.

## 1. The class and its spec

```js
// mrr.js
export class AcmeMrr extends TsWidget {
  // What a grid, a picker and widgetCatalog() know about this widget.
  static spec = {
    sizes: ['S', 'Wide', 'M'],
    category: 'Revenue',
  }
```

`static spec` says which of the [seven sizes](../widgets/ts-grid.md) the widget is
designed for. A tile snaps `size` to this list, and defaults to its first. The
widget's name and one-line description are messages, not part of the spec (see
[Words](#words-your-own-message-keys-with-english-defaults)), so a host can translate
them; `category` is an optional group name for the widget picker. A static `label`
or `description` still works, but it is a fixed string no host can reword, so prefer the
message.

## 2. The template: static markup, one per size

```js
// mrr.js
const head = '<div class="hd" part="header"><span class="lb ell" part="label" role="heading" aria-level="3" data-k="label"></span></div>'
const change = '<span class="sm n nv" data-k="change"><span aria-hidden="true" data-k="arrow"></span> <span data-k="delta"></span></span>'
const more = '<button type="button" class="btn" data-action="breakdown" data-k="more" hidden></button>'

// Static markup per size, built once. The figures arrive in update().
const TEMPLATES = {
  S: `${head}<span class="big n nv" data-k="value"></span><span class="f1"></span>${change}`,
  Wide: `${head}<span class="xbig n nv" data-k="value"></span><span class="f1"></span>
<div class="row">${change}<span class="f1"></span><span class="sm mut ell" data-k="customers"></span></div>`,
  M: `${head}<div class="rowb"><span class="xbig n nv" data-k="value"></span>${change}</div>
<div class="spark lift" data-k="sparkbox"><svg viewBox="0 0 ${SPARK.width} ${SPARK.height}" preserveAspectRatio="none" role="img" data-k="spark" hidden>
  <path class="sa" data-k="area"></path><path class="sl" data-k="line"></path>
</svg></div>
<div class="row"><span class="sm mut ell f1" data-k="customers"></span>${more}</div>`,
}
```

```js
// mrr.js
  static template(variant) {
    return TEMPLATES[variant] || TEMPLATES.Wide
  }
```

- **No data in a template.** It is built once per size and the DOM it makes is
  kept while data changes, so it is a pure function of `variant`. Every place a
  figure will go is an empty element marked `data-k="…"`; `update()` fills it.
  Even a word that never changes (the Breakdown button above is empty in the
  markup) is written there from a message, so a translated app can change it.
  A template holds no English at all.
- **Use the shared classes** (`.hd`, `.lb`, `.big`, `.xbig`, `.n`, `.sm`, `.mut`,
  `.row`, `.f1`, `.ell`, `.btn`: the full list is in
  [Your own widget](your-own-widget.md#shared-classes)). They are built from the
  `--ts-*` tokens, so your widget follows the host's theme with no colour of its
  own. `.big` and `.xbig` shrink to fit a narrow tile.
- **Mark your data surfaces with `lift`.** On an `href` or `activatable`
  tile the label's link is stretched over the whole tile, so a click anywhere
  opens it. Put `class="lift"` on each part a reader points at or works with:
  a drawn chart, a scrolling list, a grid of cells, anything with pointer or
  keyboard behaviour of its own (the sparkline's `<div class="spark lift">`
  above). The base lifts it above the link on those tiles only, so a click
  there scrolls, scrubs or does nothing, and the header, the headline figure
  and the empty space still open the tile. A `.btn` and slotted controls are
  lifted already. The link is made from the label the header marks with
  `part="label"`, so keep that part, as `head` above does. Lift data only
  while it exists: drop the class in `update()` for an empty list or a plot
  with nothing to draw, as `update()` below does for the sparkline, so a click
  on the empty box or its message opens the tile like the rest of it.
- **Add only the CSS you need**, again with tokens only:

```js
// mrr.js
  static styles = `
[hidden] { display: none; }
.nv { white-space: nowrap; max-width: 100%; overflow: hidden; unicode-bidi: isolate; }
.spark { flex: 1; min-height: 0; position: relative; }
.spark svg { position: absolute; inset: 0; width: 100%; height: 100%; direction: ltr; }
.sl { fill: none; stroke: currentColor; stroke-width: 2; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.sa { fill: currentColor; fill-opacity: .12; stroke: none; }
`
```

The sparkline takes its colour from `currentColor`, and `update()` gives the
`<svg>` the `pos`, `neg` or `mut` class, which sets `color` from a token.

## 3. The view model: pure, and never throws on partial data

All the thinking goes into one function that turns data into display strings.
Because it takes data in and gives strings out, you can test it with no DOM at
all (that is most of `mrr.test.mjs`).

```js
// mrr.js
export function mrrModel(data, variant, { fmt, t, label }) {
  const mrr = toNumber(data.mrr)
  const previous = toNumber(data.previous)
  const known = Number.isFinite(mrr)

  const money = (n) => fmt.money(n, { decimals: 0, sign: 'negative' })
```

The third argument is the context the base class builds for you: `fmt` is the
formatter for this tile's `locale`, `currency`, `time-zone` and `hour-cycle` (its own
attributes, then its grid's, then `configure()`'s), `t` translates messages, and
`label` is the tile's effective label. `now` is there too, from the tile's
`clock`, for anything that depends on the time. So is `freshness`, `{ asOf, ago, stale }`:
`data.asOf` as a time (`null` without one), how long ago it was in words
(`''` without `asOf`; one ahead of `now` reads `just now`), and whether live data
is older than the tile's `stale-after` (a view model returns it when it wants to
show its own staleness; the header needs no help, see below).

Read numbers with `toNumber`, never `Number(…)` or `parseFloat`: it accepts
what a host really sends (a number, a numeric string, a decimal-library value
with a `toNumber()` method) and gives `NaN`, which the formatter shows as `—`,
for anything else.

### A change is signed, and carries more than a colour

```js
// mrr.js
  // A previous of zero has no percentage; dividing would show an infinity.
  const change = known && Number.isFinite(previous) && previous !== 0 ? (mrr - previous) / Math.abs(previous) : NaN
  const delta = Number.isFinite(change) ? fmt.percent(change, { sign: 'always', decimals: 1 }) : ''
  // The direction comes from the number, never from the text: in some locales (ar-EG) a mark comes
  // before the sign and the digits are not 0 to 9. A change that shows as 0.0% gets no arrow.
  const moved = Math.round(Math.abs(change) * 1000) > 0
  const rise = moved && change > 0
  const fall = moved && change < 0
  const spokenDelta = Number.isFinite(change) ? fmt.percent(Math.abs(change), { sign: 'negative', decimals: 1 }) : ''
```

A gain or a loss always has its sign (`+5.1%`, `−3.9%`), an `aria-hidden` arrow
(`▲`, `▼`) and a tone, never a colour alone. See
[accessibility](../ACCESSIBILITY.md).

Decide which way it moved from the **number**, never by reading the formatted
text. In `ar-EG` the same 5.1% rise is written with an invisible mark before the
sign and Arabic-Indic digits, so a test like `delta.startsWith('+')` finds no
plus and calls it "no change". The `0.0%` rule (rounding to tenths of a percent,
as `decimals: 1` does) keeps a change that shows as zero from getting an arrow.

### Name the tile by its result

```js
// mrr.js
  let ariaLabel = known ? `${label}, ${money(mrr)}` : label
  if (known && delta) {
    const how = rise ? t('acme-mrr.up', { delta: spokenDelta }) : fall ? t('acme-mrr.down', { delta: spokenDelta }) : t('acme-mrr.flat')
    ariaLabel += `, ${how}`
  }
```

Return `ariaLabel` and the tile is announced as "MRR, $48,250, up 5.1% on last
month" instead of just "MRR".

### Words: your own message keys, with English defaults

The built-in widgets get every word from `t`, so a host can translate or reword
any of them. Do the same with keys of your own: nothing the tile says sits in its
markup or in the view model's code, and a host overrides any of it with
`configure({ messages })`, or the `messages` property on the widget or its grid,
exactly as it overrides Tickslate's.

Ship the English with the widget: `defineWidget` takes a `messages` table (section 8),
so the widget needs no `configure()` call to read well, and no code of its own to
fall back on:

```js
// mrr.js
// Every word the widget shows comes from a message, never from the template. These are its English
// defaults, handed to defineWidget below: Tickslate answers from them after the host's own tables
// (configure({ messages }), the grid's, the element's) and before its built-in English, so a host
// translates or rewords any of them under the same keys. The prefix is the widget's type.
export const MESSAGES = Object.freeze({
  'widget.acme-mrr.label': 'MRR',
  'widget.acme-mrr.description': 'Monthly recurring revenue and its change on last month.',
  'widget.acme-mrr.empty': 'No revenue data yet',
  'acme-mrr.up': 'up {delta} on last month',
  'acme-mrr.down': 'down {delta} on last month',
  'acme-mrr.flat': 'no change on last month',
  'acme-mrr.trend': '{label} trend, from {from} to {to}',
  'acme-mrr.breakdown': 'Breakdown',
  'acme-mrr.customers.one': '{count} customer',
  'acme-mrr.customers.other': '{count} customers',
})
```

| Key | English | Where it shows |
|---|---|---|
| `widget.acme-mrr.label` | `MRR` | The tile's label and its name in a grid or picker (a `label` attribute still wins) |
| `widget.acme-mrr.description` | `Monthly recurring revenue…` | The one-line description in the picker |
| `widget.acme-mrr.empty` | `No revenue data yet` | The empty view (`data = null`) |
| `acme-mrr.up` | `up {delta} on last month` | The spoken name, on a rise |
| `acme-mrr.down` | `down {delta} on last month` | The spoken name, on a fall |
| `acme-mrr.flat` | `no change on last month` | The spoken name, when it did not move |
| `acme-mrr.trend` | `{label} trend, from {from} to {to}` | The sparkline's label |
| `acme-mrr.breakdown` | `Breakdown` | The button that emits `breakdown` |
| `acme-mrr.customers.one`, `.other` | `{count} customer`, `{count} customers` | The customer count |

The rules for the keys:

- Each starts with `widget.<type>.` or `<type>.` (here `widget.acme-mrr.` or
  `acme-mrr.`), so two widgets can never collide. A plural form such as `.few` is
  part of the key.
- None may be a key Tickslate already has: a widget adds strings, and rewording a
  built-in one is the host's job. `defineWidget` throws a `TypeError` for a
  key outside the prefix, a built-in key or a value that is not a string.
- The order is: this element's `messages`, its grid's, `configure({ messages })`, **the
  widget's defaults**, then Tickslate's own English. A host's translation always wins; the
  defaults answer only what the host left out. A count picks `key.one`, `key.few`… then
  `key.other`, by the host's language when the host supplied the text, and by English
  rules for the defaults.
- `widget.<type>.label`, `.description` and `.empty` are the tile's name, its one-line
  description in the picker and its empty-view text. They are read through `t` wherever
  the widget is shown (the tile, the grid, the picker, the layout list), so a host's
  `configure({ messages: { 'widget.acme-mrr.label': … } })` renames the widget everywhere
  at once. The catalog entry's `label` is therefore `''` when you write the message;
  read the name through `t`, not from `widgetCatalog()`.
- **One name per widget.** When a class has both a static `label` and a `widget.<type>.label`
  message, the message wins on the tile and in the catalog alike, and the static label is
  ignored. A static label with no message is the name everywhere, but no host can reword it.
- The defaults are English text, so a count in them picks `.one` and `.other` by English plural
  rules whatever the host's locale. A host that translates a plural supplies its own forms, and
  its language's rules choose among them. An author who writes in another language should ship
  that language's strings from the host side (`configure`), not as the widget's defaults.
- A subclass of a registered widget uses the nearest registered class's type and defaults,
  without registering again.
- The defaults are kept per copy of Tickslate. A class that extends one copy's `TsWidget` but is
  registered through another copy's `defineWidget` gets none, with no warning, so a page that
  bundles two copies should register each widget through the copy it extends.

A plural passes the count as the third argument: `t(key, params, count)`. A host that
translates it:

```js
import { configure } from 'tickslate'

configure({
  locale: 'pl',
  messages: {
    'acme-mrr.up': 'więcej o {delta} niż w zeszłym miesiącu',
    'acme-mrr.customers.one': '{count} klient',
    'acme-mrr.customers.few': '{count} klientów',
    'acme-mrr.customers.other': '{count} klientów',
  },
})
```

The empty view's text is a message too, `widget.<type>.empty` (the host may also slot its
own content into `slot="empty"`).

### `fit()`: a figure that is too long for its slot

```js
// mrr.js
    // fit() tries the full number, then compact, and keeps the shorter that fits the slot.
    customers: Number.isFinite(count) ? t('acme-mrr.customers', { count: fmt.fit(count, COUNT_CHARS, { style: 'number' }) }, count) : '',
    more: t('acme-mrr.breakdown'),
```

A tile is a fixed box, so a longer number can't make it grow. `fmt.fit(value,
maxChars, { style, … })` returns the full form when it fits in `maxChars`, else a
shorter one: no decimals, then compact (`1.2M`). `412` stays `412` and
`112,412` becomes `112.4K`. The headline in this widget does the same by hand at
size S, because `fit` would also compact `$48,250` (money's full form carries
cents) and a whole-dollar figure reads better:

```js
// mrr.js
  // At S the figure goes compact when it would not fit; the spoken name keeps the whole one.
  // Not fmt.fit(): money's full form carries cents, so fit would go compact even at $48,250.
  const whole = money(mrr)
  const value = variant === 'S' && whole.length > S_CHARS ? fmt.money(mrr, { compact: true, sign: 'negative' }) : whole
```

### A chart, with `linePaths`

```js
// mrr.js
  if (variant === 'M' && Array.isArray(data.history)) {
    const readings = data.history.map(toNumber)
    const points = readings.flatMap((y, x) => (Number.isFinite(y) ? [{ x, y }] : []))
    vm.dropped = readings.length - points.length
    // One reading is not a trend, and no line beats a line implying one.
    if (points.length >= 2) {
      const { line, area } = linePaths(points, { ...SPARK, includeZero: false })
```

`linePaths` is one of the three [helpers](#the-helpers) the built-in charts draw
with. Set `vm.dropped` to how many values you could not read and, in
development, the base class warns once, naming the tile.

### The static hook

```js
// mrr.js
  static viewModel(data, variant, ctx) {
    return mrrModel(data, variant, ctx)
  }
```

The static method is what the base class calls. If your view model throws, the
tile shows its error view and logs once. Exporting the function beside the class
is what lets a test call it directly.

## 4. `update`: numbers change in place

```js
// mrr.js
  update(vm, variant) {
    // Each write is skipped when it would change nothing, so a live tick that
    // moves one figure touches one node and the rest of the tile stays put.
    const text = (k, s) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el && el.textContent !== s) el.textContent = s
    }
    const attr = (k, name, v) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el && el.getAttribute(name) !== v) el.setAttribute(name, v)
    }
    text('label', vm.label)
    text('value', vm.value)
    text('arrow', vm.arrow)
    text('delta', vm.delta)
    attr('change', 'class', `sm n nv ${vm.tone}`)
    if (variant === 'S') return

    text('customers', vm.customers)
    if (variant === 'Wide') return

    this.$('[data-k="spark"]').toggleAttribute('hidden', !vm.line)
    // Lifted only while there is a line: an empty box is empty space, and opens an activatable tile.
    attr('sparkbox', 'class', vm.line ? 'spark lift' : 'spark')
    attr('spark', 'class', vm.tone)
    attr('spark', 'aria-label', vm.sparkLabel)
    attr('line', 'd', vm.line)
    attr('area', 'd', vm.area)
    text('more', vm.more)
    this.$('[data-k="more"]').toggleAttribute('hidden', !this.actionEnabled('breakdown'))
  }
```

`update` runs on every render, and the base class renders once per microtask
however many times `data` is set. It writes into the DOM `template` built, using
`this.$(selector)`, which finds an element in the shadow root and remembers it.
It sets `textContent` and attributes. It never rebuilds markup.

That is how live numbers behave: when a tick sets `el.data = { …, mrr: 48910 }`,
the `<span data-k="value">` is the same node with new text, so nothing is
rebuilt, restyled or re-announced beyond the figure that moved. `mrr.test.mjs`
proves it by counting the writes to the tile's `innerHTML`. Skipping a write that
wouldn't change anything is an optimisation you can leave out.

Don't use `innerHTML` in `update` for data. Text goes through `textContent`;
if you must build markup from data, escape it (below). On a page with Trusted Types, `template` and `skeleton` must be module constants and data goes through `textContent` and attributes (see docs/guide/security.md).

### Freshness and flashes

Put the base's two header parts in your head markup and the base does the rest:

```js
const head = `<div class="hd" part="header">
<span class="dot live" data-k="dot" aria-hidden="true" hidden></span>
<span class="lb ell" part="label" role="heading" aria-level="3" data-k="label"></span><span class="f1"></span>
<span class="sm mut n meta" data-k="meta" hidden><span class="pre" data-k="pre"></span><span data-k="time"></span><span class="pre" data-k="post"></span></span>
</div>`
```

With `live: true` and an `asOf` in the data, the dot pulses and the meta reads
`just now`, `2 min. ago`; past the tile's `stale-after` (milliseconds, or `'90s'`,
`'2m'`, `'1h'`; default 2 minutes) the dot turns `--ts-warn` and stops pulsing, the
meta reads `Stale · 3 min` and the tile's name ends with `, stale`. With `asOf` and
no `live` it reads `synced 11:42`. A live tile re-renders every 15 s on one timer
that every tile shares. An `asOf` ahead of the clock reads as `just now`, never as
a negative age.

To tint a figure that changed, call `this.flash(key, number)` in `update()` after
you wrote the figure, and mark the element `data-k="<key>"` or
`data-flash="<key>"`:

```js
this.flash('value', vm.valueNum, { goodWhen: 'up' })  // 'down' swaps the colours, 'neither' uses the accent
```

Pass the number (put it in the view model beside the text), because `'1,234.50'`
is not one. It tints for 700 ms: up in `--ts-profit`, down in `--ts-loss`. It skips
the first render, a size change, an unchanged value, a second change within a
second, reduced motion and `flash="off"` on the tile or its grid. An element
that paints must carry the class: not a `<slot>`, which is `display: contents`.
Don't flash a clock.

## 5. `emit`: tell the host something happened

```js
// mrr.js
  constructor() {
    super()
    // The root, not the tile: the base already listens on the tile for Retry.
    this.shadowRoot.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('[data-action="breakdown"]')) this.emit('breakdown', { metric: 'mrr' })
    })
  }
```

A widget never navigates or fetches; it says what the user did and the host
decides. `emit(action, detail)` dispatches a bubbling, composed, cancelable
`ts-action` event with `detail` `{ action, ...detail }`:

```js
document.addEventListener('ts-action', (e) => {
  if (e.detail.action === 'breakdown') openRevenueBreakdown(e.detail.metric)
})
```

The host also decides whether the button exists. The template ships it
`hidden` and empty; `update` writes its word and shows it only when
`actionEnabled('breakdown')`, that is when the host set `el.actions = ['breakdown']`.
This is the same switch the built-ins use for Retry. See
[Events](../reference/events.md).

## 6. States, for free

You wrote no loading, empty or error view. The base class shows exactly one of
these, first match wins:

| View | When | What your widget does |
|---|---|---|
| Error | `state="error"`, `el.error = '…'`, or your view model threw | Nothing. A Retry button appears if `actions` includes `'retry'` |
| Loading | `state="loading"`, or `data` was never set | Nothing, or define `static skeleton(variant)` for blocks shaped like your layout |
| Empty | `data = null` | Say what empty means for you with the `widget.<type>.empty` message |
| Content | Anything else | `template`, then `viewModel`, then `update` |

```js
'widget.acme-mrr.empty': 'No revenue data yet',
```

Set `data = undefined` or leave it unset while the host fetches, `null` when
there is nothing to show, and an object when there is. Pair it with
`state="loading"` to show the skeleton over a refresh. The tile never changes
its size between views.

## 7. `dataShape`: wrong data says so, in development

```js
// mrr.js
  // Development only: data of the wrong shape warns once, naming the path.
  static dataShape = {
    mrr: 'numeric',
    previous: { kind: 'numeric', optional: true },
    customers: { kind: 'number', optional: true },
    history: { kind: 'array', optional: true },
  }
```

A bare kind is required and `{ kind, optional: true }` may be absent. Send
`{ revenue: 48250 }` and the development build warns once that `data.mrr` is
missing, naming the tile. Production never checks, so it costs nothing there. The
kinds are `number`, `numeric` (anything `toNumber` reads), `time`, `string`,
`boolean`, `array` and `object`.

## 8. Register it: `defineWidget`

```js
// mrr.js
// The tag and type carry a prefix of your own, so they can never clash with a future Tickslate
// widget. Only this very class is a no-op the second time: if this module is evaluated again (hot
// reload, a second bundle) it makes a new class, and defineWidget would throw. The guard keeps the first.
if (!widgetCatalog()['acme-mrr']) defineWidget('acme-mrr', AcmeMrr, { type: 'acme-mrr', messages: MESSAGES })
```

`defineWidget(tag, Class, { type, messages })` does three things in one call:

1. It defines the custom element, as `customElements.define` would (and stamps it
   with Tickslate's version, so a second copy of the library can tell).
2. It records the class's `static spec` in the widget catalog under `type`, the
   key a host uses in a layout. The record is a **snapshot** taken at this call:
   changing `static spec` afterwards does not change the catalog.
3. With `messages`, it keeps a frozen copy of the widget's English strings (see
   [Words](#words-your-own-message-keys-with-english-defaults)). They are
   registered with the catalog entry and apply to every element of this class.
   Calling again with the same class and different `messages` warns once in
   development and keeps the first table.

A wrong catalog entry is worse than a failed call, so it throws a `TypeError`,
records and defines nothing and tells no subscriber, for:

- a missing or empty `type`;
- a `type` that is a built-in key (`'todayPnl'`);
- a class with a `catalogKey`, set on it or inherited from a built-in such as
  `TsMetric`: its elements would use the built-in's spec while the catalog said
  something else. Extend `TsWidget` directly, or set `static catalogKey = null`;
- a `type` another class recorded;
- a `tag` that is recorded under another type, or that another class already owns;
- a class already recorded under another type, or the same class and type under a
  second tag;
- a spec with no valid size;
- a `messages` key outside `widget.<type>.` and `<type>.`, a key Tickslate already
  has, or a value that is not a string.

Calling it again with the **same class object**, tag and type does nothing. That
is the only repeat that is safe. A module that is evaluated twice (a hot reload,
two bundles that both include your file, a dev server that re-imports it)
makes a *new* class each time, so the second call throws "type already recorded
by another class". Import the file once, or guard the call as `mrr.js` does:
`if (!widgetCatalog()['acme-mrr']) defineWidget(…)`. The guard keeps the first
class, so a hot reload shows the old code until the page reloads.

Use it in a page like any other widget:

```html
<ts-grid currency="USD" locale="en-US">
  <acme-mrr item="mrr" label="Recurring revenue" size="Wide"></acme-mrr>
</ts-grid>
<script type="module">
  import 'tickslate/elements'
  import './mrr.js'

  const mrr = document.querySelector('acme-mrr')
  mrr.data = { mrr: 48250, previous: 45900, customers: 412, history: [41200, 42900, 44100, 45900, 48250] }
  mrr.actions = ['breakdown']
</script>
```

### Reading the catalog

```js
import { widgetCatalog, onCatalogChange } from 'tickslate/elements'

widgetCatalog()['acme-mrr']
// { tag: 'acme-mrr', label: '', sizes: ['S', 'Wide', 'M'], category: 'Revenue' }
// label and description are messages: the grid and the picker read them through t().

// A widget that registers after a picker or a grid connected:
const stop = onCatalogChange((type) => console.log(`${type} is now in the catalog`))
stop()
```

`widgetCatalog()` is a frozen merge of the built-in `WIDGETS` and every widget
registered with `defineWidget`. It is the same object until the next
registration, so it is cheap to read in a render. `onCatalogChange(fn)` runs
`fn(type)` after each registration, once the catalog holds the type, and returns
the function that stops it. A listener that throws is logged with
`console.error` and skipped: the others still run and the registration stands.

The widget picker and the grid read this catalog once the picker ships (0.2.0);
until then a grid takes a tile's sizes from the element's own `static spec`, as
[Your own widget](your-own-widget.md) describes, so a registered widget works
both ways. A host that keeps its own catalog object still wins over this one: the
resolution order for a tile is the element's own spec, then the host's
`grid.catalog`, then `widgetCatalog()`.

The state lives in a module, so every import of one Tickslate copy shares it.
Two copies on a page each have their own, which is why the second copy's
`defineWidget` for a tag the first owns throws rather than splitting the catalog.

## The helpers

`tickslate/elements` exports three pure helpers, **stable for 0.x**: the ones the
built-in charts use, so a custom widget can draw the same lines and write the
same markup safely.

| Helper | What it does |
|---|---|
| `linePaths(points, { width, height, pad?, xDomain?, yDomain?, includeZero? })` | Returns `{ line, area, zeroY, x, y }`: SVG path strings in a `width` by `height` box (y flipped, larger higher), where value 0 falls, and the two scales it used, to place marks on the same axes. Points that aren't finite are skipped. `includeZero` (default `true`) stretches y to 0; pass `false` for a line far from zero |
| `scale(d0, d1, r0, r1)` | A function mapping the domain `[d0, d1]` onto the range `[r0, r1]`. A flat domain maps to the middle of the range |
| `escapeHtml(s)` | Escapes `& < > " '` in `String(s)`, for the rare case that you build markup from data |

```js
import { scale, escapeHtml } from 'tickslate/elements'

const x = scale(0, 4, 4, 236)
x(2)                                 // 120
escapeHtml('<b>Fish & "chips"</b>')  // '&lt;b&gt;Fish &amp; &quot;chips&quot;&lt;/b&gt;'
```

Prefer `textContent` to building markup. When a template really must carry a
host's text (say, an `aria-label` assembled into a string), pass it through
`escapeHtml` first.

## Test it

The test in `examples/custom-widget/mrr.test.mjs` is a model for your own. `npm test`
runs it, and so does this command, with no install:

```bash
node --test examples/custom-widget/*.test.mjs
```

It has three kinds of test, cheapest first:

1. **The view model with no DOM.** Call `mrrModel(data, variant, ctx)` with a
   formatter from `createFormatter({ locale, currency })` and a `t` that has
   your defaults under it: the test builds one with the same layering Tickslate uses
   (the host's table, then your `MESSAGES`). `createMessages(null, 'en-US')` alone
   returns bare keys for your own strings. This is where figures, signs, arrows,
   dashes, the accessible name, a right-to-left locale (`ar-EG`), translated
   messages and plurals, and bad data are checked.
2. **The element on a tiny fake DOM.** The file writes out the few classes the
   base class touches (about 100 lines), installs them before importing the
   widget, and then drives it: set `data`, `await` a microtask, and read what
   `update` wrote. Its `querySelector` finds only the `data-k` and `data-action`
   names the template really contains, so a typo or a missing node fails the test
   instead of being invented. It checks that a second `data` writes no markup, that the
   Breakdown button emits `ts-action`, and that `null` shows your empty message and a
   host's `configure()` override of it wins.
3. **Registration.** `widgetCatalog()['acme-mrr']` holds the spec, the fake
   registry holds the tag, the picker entry shows your label and description (and a
   host's override of either), and evaluating the module again does not throw.

For a real browser, run `npm run dev` in a clone, or load your module from any
page that imports `tickslate/elements`.

## Checklist

- [ ] `static spec` with at least one valid size; the name, description and empty text are messages (`widget.<type>.label`, `.description`, `.empty`)
- [ ] Tokens only: no colours in `styles`
- [ ] `template(variant)` is static; every figure is written by `update`
- [ ] `viewModel` is pure, never throws on partial data, and returns `ariaLabel`
- [ ] Gains and losses carry a sign, an `aria-hidden` arrow and a tone, decided from the number and not the text
- [ ] No English in the template: every word is a message key with a default of your own
- [ ] `update` sets text and attributes, and never rebuilds markup
- [ ] Every data surface (a chart, a scrolling list, a grid of cells) carries `class="lift"`, so a click on it never opens an `activatable` tile
- [ ] `update()` drops `lift` from a surface while it holds no data, so an empty list or an undrawn chart opens the tile
- [ ] `static dataShape` and a `widget.<type>.empty` message
- [ ] No attribute or property named like an `HTMLElement` member (`title`, `hidden`, `scroll`…)
- [ ] A prefix of your own on the tag and the type, registered with `defineWidget`, guarded against a second evaluation
- [ ] A test that runs with no install

See also [Your own widget](your-own-widget.md) for every static and instance
member, [Theming](../theming.md) for the tokens, and
[Accessibility](../ACCESSIBILITY.md) for what a widget owes its users.
