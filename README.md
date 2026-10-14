# Tickslate

Dashboard widgets for the web: a resizable grid, KPI tiles, charts and cards
for any data, with a finance set built in.

The widgets are custom elements, so the same code runs in plain HTML, Vue,
React, Svelte and Angular. The core has no runtime dependencies, every colour
is a `--ts-*` CSS variable, and your app passes the data in: Tickslate never
fetches anything.

- **A grid users can rearrange.** Seven fixed sizes on a 4-column grid that
  drops to 3 columns on tablets and 2 on phones. Long-press to edit, drag to
  move, drag the corner to resize, and Undo or Add back after a removal.
- **Generic widgets.** `<ts-metric>` (a KPI tile with change, sparkline and
  target), `<ts-chart>` (line and area trends) and `<ts-card>` (a themed tile
  for any content, such as your own Chart.js or ECharts chart).
- **A finance set.** Today's P&L, an equity curve and an exchange session
  clock, with more to come.
- **Accessible by default.** Each widget is a labelled region, charts state
  their result in words, gains and losses carry a sign as well as a colour, and
  motion respects `prefers-reduced-motion`. See [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).

## Install

```bash
npm install tickslate
```

```js
import 'tickslate/elements' // registers <ts-grid> and the widgets
```

Without a bundler, load it from jsDelivr. Pin an exact version so a release
can never change your page. This works once 0.1.0 is published to npm.

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/tickslate@0.1.0/elements.js"></script>
```

To use a named export from a page script, import it from the same URL:
`import { persistLayout } from 'https://cdn.jsdelivr.net/npm/tickslate@0.1.0/elements.js'`.

### Fonts (optional)

Text is set in Geist and figures in Newsreader. Both are optional: without
them the tiles fall back to the system UI font, with tabular digits so live
numbers don't jitter. To use them, load them yourself:

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Newsreader:wght@500;600&display=swap">
```

Or point `--ts-font-ui` and `--ts-font-num` at your own fonts (see Theming).

### tokens.css

The elements carry their default theme, so tiles look finished with no
stylesheet at all. Linking `tokens.css` is still the clearest way to see and
override every variable, and it always beats the built-in defaults:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/tickslate@0.1.0/tokens.css">
```

```js
import 'tickslate/tokens.css'
```

## Quick start

Markup is the whole layout: the grid reads its children, in order. The
`persistLayout` line saves what users change and restores it on the next visit.

<!-- quickstart -->
```html
<ts-grid>
  <ts-metric label="Signups" size="S" data='{"value": 1204, "previous": 1075, "compareLabel": "vs last week"}'></ts-metric>
  <ts-chart label="Revenue" size="Wide" data='{"series": [{"name": "Revenue", "points": [{"x": "2026-09-01", "y": 11800}, {"x": "2026-09-02", "y": 12400}, {"x": "2026-09-03", "y": 12100}]}]}'></ts-chart>
  <ts-card label="Notes" sizes="S Wide M"><p>Deploy freeze from Friday.</p></ts-card>
</ts-grid>
<script type="module">
  import { persistLayout } from 'tickslate/elements'
  persistLayout(document.querySelector('ts-grid'), { key: 'ops-dashboard' })
</script>
```
<!-- /quickstart -->

[examples/quickstart.html](examples/quickstart.html) is this snippet as a page.
Run `npm run dev` and open `/examples/quickstart.html`. All figures in this
repository are made up.

## Data in

Every widget renders the `data` you give it. Set it as a property (any
framework can) or, in server-rendered pages, as a JSON attribute.

```js
document.querySelector('ts-metric').data = { value: 1204, previous: 1075 }
```

| You set | The tile shows |
|---|---|
| Nothing yet (`undefined`) | A loading skeleton shaped like the content |
| `null` | The empty state ("No data yet"), or your `slot="empty"` content |
| `state = 'loading'` | The skeleton again, over existing data, during a re-fetch |
| `error = 'Could not load'` | An error message, and a Retry button if `actions = ['retry']` |
| An object | The content |

Dates and times can be ISO strings, `Date`s or numbers (below 1e11 means
seconds). Decimal strings such as `"12.50"` are read as numbers, because some
backends send decimals that way.

### JSON attributes

For Blade, Django, Rails and static pages, put the data in the `data`
attribute. A value starting with `{` or `[` is parsed as JSON; once you set the
`data` property, the attribute is ignored. A parse error shows the error view
and, in development builds, a console warning with the position. See
[docs/guide/server-templates.md](docs/guide/server-templates.md).

```html
<ts-metric label="Signups" data='{"value": 1204, "previous": 1075}'></ts-metric>
```

## Saving layouts

```js
import { persistLayout } from 'tickslate/elements'

persistLayout(document.querySelector('ts-grid'), { key: 'ops-dashboard' })
```

This loads the saved layout for the current device (desktop and phone are kept
apart), saves every change to `localStorage`, and ignores storage that is full
or blocked. It returns `{ reset(device?), dispose() }`. To save somewhere else,
listen for `ts-layout-change` and store `event.detail.layout`. See
[docs/guide/saving-layouts.md](docs/guide/saving-layouts.md).

## Edit mode

Editing is on by default. A long press (or the visually hidden **Edit layout**
button, the grid's first Tab stop) starts it. While editing, a floating pill
offers **Done** and, once a tile has been removed, **Add back (n)**. Tapping
outside the grid, or pressing Escape, ends it. Removing a tile shows an Undo
toast, and Ctrl or Cmd+Z undoes while editing.

| Attribute or property | Effect |
|---|---|
| `locked` | A read-only dashboard: no edit mode and no controls |
| `edit-controls="off"` | Hides the built-in button, pill and Add back, for hosts with their own UI. Long press still works |
| `undo-toast="off"` | No toast after a removal |
| `editing` | Starts or ends edit mode from code |
| `grid.hiddenItems`, `grid.restore(id)`, `grid.undo()` | Build your own Add back and Undo |

## Events

All events bubble and are composed, so you can listen on the grid or higher up.

| Event | Fired by | `detail` |
|---|---|---|
| `ts-layout-change` | `<ts-grid>`, after an edit | `{ layout, items, previous, profile, reason, id, index?, item? }`; `reason` is `move`, `resize`, `remove`, `add` or `undo`. Save `layout` |
| `ts-layout-issues` | `<ts-grid>`, when a layout you set was repaired | `{ issues }` |
| `ts-edit-change` | `<ts-grid>` | `{ editing }` |
| `ts-columns-change` | `<ts-grid>`, also once after the first measure | `{ columns, device, initial }` |
| `ts-profile-change` | `<ts-grid>`, when a schedule or override switches profile | `{ profile, reason }` |
| `ts-action` | any widget | `{ action, ... }`, such as `retry` or an equity curve's `range` |

## Theming

Dark mode is opt-in, and every colour, radius and font is a variable. Override
a few anywhere in your CSS:

```css
:root {
  --ts-accent: #0b6bcb;
  --ts-surface: #fff;
  --ts-radius: 6px;
  --ts-font-ui: 'Inter', system-ui, sans-serif;
}
```

Set `data-theme="auto"` on `<html>` to follow the operating system, or
`data-theme="dark"` (or a `.dark` class) for the dark theme, called Graphite.
`data-theme="light"` makes a light island inside a dark page. The light theme
is called Paper.

## Browser support

Chrome 111, Safari 16.2 and Firefox 113 or later: the grid needs custom
elements, shadow DOM, `ResizeObserver`, `color-mix()` and `:where()`.
Server-side rendering is safe: importing the package where there is no DOM
registers nothing.

## ESM only

The package is ES modules only. If Jest has to transform it, let it through:

```js
transformIgnorePatterns: ['/node_modules/(?!tickslate/)']
```

## Guides

- Frameworks: [React](docs/guide/frameworks/react.md),
  [Vue](docs/guide/frameworks/vue.md),
  [Svelte](docs/guide/frameworks/svelte.md),
  [Angular](docs/guide/frameworks/angular.md)
- [Saving layouts](docs/guide/saving-layouts.md)
- [Your own widget](docs/guide/your-own-widget.md)
- Reference: [widgets](docs/widgets/), [core](docs/reference/core.md),
  [events](docs/reference/events.md), [theming](docs/theming.md)
- [Server templates](docs/guide/server-templates.md) (Blade, Django)
- [Bring your own chart](docs/guide/bring-your-own-chart.md) (Chart.js, ECharts)
- The contract: [RFC 0001](docs/rfc/0001-api.md) and
  [RFC 0002](docs/rfc/0002-integration-and-ux.md). Data shapes are in the
  `.d.ts` files: [elements](src/elements/index.d.ts),
  [grid](src/elements/grid.d.ts) and [core](src/core/index.d.ts).

### Widgets

| Tag | Sizes | For |
|---|---|---|
| `<ts-metric>` | S, Wide, M | A KPI with change, sparkline and target |
| `<ts-chart>` | Wide, M, L, XL | Line and area trends (rows or series) |
| `<ts-card>` | all seven | Any content, such as your own chart |
| `<ts-today-pnl>` | S, Wide, M | Today's net, realized and unrealized P&L |
| `<ts-equity-curve>` | Wide, M, XL | Cumulative P&L with ranges and drawdown |
| `<ts-session-clock>` | S, Banner | Exchange session status |

## Development

```bash
npm install
npm run dev        # playground at http://localhost:5173
npm test           # node --test, no install needed
npm run release    # test, build ESM + UMD, assemble dist-lib/
```

Publishing is done from the assembled folder: `npm publish ./dist-lib`.

## Licence

MIT © Shreeshyla Hanasoge
