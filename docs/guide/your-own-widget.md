# Your own widget

A Tickslate widget is a custom element with three small pieces on top of
`TsWidget`: a template, a pure view model and an update function. The base class
does the rest: the shadow root, the shared tile CSS, sizing, the label,
formatting, the loading, empty and error views, and rendering once per
microtask. Your widget then sits in a [`<ts-grid>`](../widgets/ts-grid.md) like
any other, with sizes, drag, resize and remove for free.

## A widget in about 40 lines

```html
<ts-grid>
  <ts-uptime label="API uptime" size="S" data='{"service": "api", "uptime": 0.9992, "incidents": 1}'></ts-uptime>
  <ts-uptime label="Web uptime" size="Wide" id="web"></ts-uptime>
</ts-grid>
<script type="module">
  import { TsWidget } from 'tickslate/elements'

  class TsUptime extends TsWidget {
    // What the widget is called and the sizes it is designed for. A grid reads it per tile.
    static spec = { label: 'Uptime', sizes: ['S', 'Wide'] }
    // Checked in development only: wrong-shaped data warns once, naming the path.
    static dataShape = { service: 'string', uptime: 'number', incidents: { kind: 'number', optional: true } }
    static emptyText = 'No uptime yet'

    // Static markup per size, built once; no data in it. Tokens only, through the shared classes.
    static template(variant) {
      return `<div class="hd"><span class="lb ell" data-k="label"></span></div>
        <span class="${variant === 'S' ? 'big' : 'xbig'}" data-k="value"></span>
        <span class="sm mut" data-k="note"></span>`
    }

    // Pure: data in, display strings out. ariaLabel names the tile by its result.
    static viewModel(data, variant, { fmt, label }) {
      const value = fmt.percent(data.uptime, { sign: 'negative', decimals: 2 })
      const incidents = data.incidents ?? 0
      return { label, value, note: `${data.service} · ${incidents} incident${incidents === 1 ? '' : 's'}`, ariaLabel: `${label}, ${value}` }
    }

    // Write into the DOM the template built. Runs on every render, so set text, don't rebuild.
    update(vm) {
      this.$('[data-k="label"]').textContent = vm.label
      this.$('[data-k="value"]').textContent = vm.value
      this.$('[data-k="note"]').textContent = vm.note
    }
  }
  customElements.define('ts-uptime', TsUptime)

  document.querySelector('#web').data = { service: 'web', uptime: 0.9971, incidents: 3 }
</script>
```

What happened: the grid saw two children of an unknown tag, so each is its own
type; it took their sizes from `static spec` (the element's own spec comes
before any catalog), gave them ids `ts-uptime` and `ts-uptime-2` (set `item` on
each for ids that survive reordering), and laid them out. The loading
skeleton, the empty view, the Retry button, `locale` and `currency` attributes,
JSON `data` attribute and development warnings all work without more code.

## Rules a widget follows

- **Tokens only.** Style with the shared classes and `var(--ts-*)`; never a
  colour. See [Theming](../theming.md).
- **Data in, nothing out.** Render what the host passes in. No fetching, no
  broker APIs, no credentials.
- **Accessible by default.** The tile is a labelled region; return `ariaLabel`
  stating the result, give charts `role="img"` and a label, put a sign (and an
  `aria-hidden` arrow) on gains and losses, and stop motion under
  `prefers-reduced-motion`. See [docs/ACCESSIBILITY.md](../ACCESSIBILITY.md).
- **Generic vocabulary.** Name things as any trading app would, never after one
  product's screens.
- **Do not reuse DOM names.** No attribute or property may share a name with an
  `HTMLElement` member (`scroll`, `title`, `hidden`, `slot`, `part`, `role`,
  `dir`, `lang`, `style`, `id`, `className`, `tabIndex`, `inert`, `draggable`,
  `translate`, `popover`).
- Keep `viewModel` and `template` pure functions of their inputs. `template`
  must depend on `variant` alone, because its DOM is kept while data changes.

## Static members

| Member | Default | What it does |
|---|---|---|
| `spec` | `null` | `{ label?, sizes?, phoneRows? }`: a host widget's own description, for a widget with no catalog entry. A grid reads it per tile; invalid sizes are dropped. `catalogKey` wins when both are set. A subclass may override the `spec` getter instead (the card does, to read its `sizes` attribute) |
| `catalogKey` | `null` | A key of the core's `WIDGETS` catalog, for the built-ins |
| `styles` | `''` | CSS for your content, appended after the shared CSS. Tokens only |
| `template(variant)` | | Markup inside the tile for one size, built once per size |
| `viewModel(data, variant, ctx)` | | Pure: data to display strings and numbers. `ctx` is `{ fmt, now, label, ...viewContext() }`. `data` is never `null` here (it is `{}` for a `dataOptional` widget with none). Return `ariaLabel` to name the tile; without it the label does. Throwing shows the error view and logs once, linking `docs/widgets/<tag>.md` |
| `dataShape` | `null` | `{ key: kind \| { kind, optional?, of? } }` with kinds `number`, `numeric`, `time`, `string`, `boolean`, `array` and `object`. A bare kind is required; keys not listed are allowed; `numeric` and `time` accept what `toNumber` and `toTime` read. Development only |
| `dataOptional` | `false` | `true` for a widget useful before it has data: it renders while `data` is `undefined`, with `viewModel` getting `{}`, and shows the skeleton only for `state="loading"` |
| `emptyText` | `'No data'` | What the empty view says |
| `skeleton(variant)` | a header, a bar and two lines | The loading markup: `.sk` blocks shaped like the content, built with `sk(width, height)` (width in percent snapped to 5, or `'x'`; height in px). Include an element with `data-k="label"` and the base fills it |

Add observed attributes by extending the list and calling the base:

```js
static get observedAttributes() { return [...super.observedAttributes, 'range'] }
attributeChangedCallback(name, old, value) { super.attributeChangedCallback(name, old, value) }
```

Do the same with `connectedCallback` and `disconnectedCallback`. A property you
add should call `this.requestRender()` in its setter and be listed in
`this.upgrade('range')` on connect, so a value set before the element was
defined is not lost. Add context the pure view model needs from the element
(an attribute, say) by overriding `viewContext()`.

## Instance members

| Member | What it does |
|---|---|
| `data` | Get and set. Setting schedules one render per microtask, however often it is set. `undefined` (never set) shows the skeleton; `null` shows the empty view. The `data` attribute (JSON starting with `{` or `[`) supplies it until the property is set, which then wins for good. A parse failure shows the error view |
| `state` | Attribute and property: `'loading'` (a skeleton, even over existing data), `'error'` (the error view) or `null` |
| `error` | A message shows the error view; `null` clears it. An `Error` is read as its message |
| `actions` | Names of the actions the widget may offer, such as `['retry']`; `actionEnabled(name)` reads it. With `'retry'`, the error view has a Retry button that fires `ts-action` |
| `size` | Attribute and property, reflected, snapped to the supported sizes; defaults to the first. A grid sets it |
| `variant` | The size actually rendered (readonly) |
| `label` | The `label` attribute, else the spec's label. With neither, a development warning and the tile is named by its tag |
| `spec` | Catalog entry, else the validated `static spec`, else `{ label: '', sizes: [] }` |
| `clock`, `now()` | What the widget takes the time to be. Settable `() => number`; tests and demos freeze it |
| `formatter` | The `Formatter` for the `locale`, `currency` and `time-zone` attributes: the widget's own, then the nearest `<ts-grid>`'s, then `configure()`. Cached |
| `$(selector)` | `querySelector` in the shadow root, cached until the template is rebuilt |
| `requestRender()` | Schedule a render (coalesced per microtask) |
| `every(ms)` | Re-render every `ms` while connected and the page is visible; `0` stops. Catches up when the tab becomes visible |
| `emit(action, detail)` | Dispatches a `ts-action` event with `{ action, ...detail }`. It bubbles and is composed; see [Events](../reference/events.md). The event is cancelable: the returned boolean is `false` when a listener called `preventDefault()`, so a widget can skip its own follow-up |
| `upgrade(...names)` | Re-applies properties set before the element was defined. The base does this for `data`, `size`, `clock`, `state`, `error` and `actions` |
| `update(vm, variant)` | Yours: write the view model into the DOM `template` built |

Exactly one view shows, first match wins: **error** (`state="error"`, `error`
set, or a view model that threw), then **loading** (`state="loading"`, or `data`
undefined unless `dataOptional`), then **empty** (`data === null`), then
**content**. The tile is a fixed box, so no view changes its size. The section
is `<section class="tile" part="tile" aria-label>`.

## Shared classes

The tile CSS gives you these, all from tokens: `.hd` (header row), `.lb` (the
small uppercase label), `.big`, `.xbig` and `.md` (figure sizes that shrink with
the tile), `.n` (tabular figure), `.sm`, `.xs`, `.mut`, `.pos`, `.neg`, `.warn`,
`.acc` (colours), `.f1` (flex fill), `.row`, `.rowb` and `.col` (layout), `.g2`
to `.g4` (columns), `.sep` (a hairline), `.ell` (ellipsis), `.btn`, `.dot.live`
(the pulsing dot) and the profit and loss line classes `.lp`, `.ln`, `.ap`,
`.an` and `.lz`.

## Two more things

- **A catalog entry is optional.** `static spec` is enough for a grid. To give
  hosts a typed key (`type: 'uptime'`), add an entry to your own catalog:
  `grid.catalog = { ...WIDGETS, uptime: { tag: 'ts-uptime', label: 'Uptime', sizes: ['S', 'Wide'] } }`.
- **Registering twice is safe.** The same class again does nothing. A different
  class on a tag already taken warns in development and the first one stays.
  Give your own tags a prefix of your own (`acme-uptime`) so they cannot clash
  with a future Tickslate widget; the example borrows `ts-` for brevity.

Development warnings come from the `development` export condition (Vite and
webpack dev mode resolve `tickslate/elements` to a build that has them).
Production builds never check shapes.
