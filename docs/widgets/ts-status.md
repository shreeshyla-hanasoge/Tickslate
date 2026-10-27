# `<ts-status>`

Health at a glance: one row per service or system, each with its state in words
beside a dot whose shape differs by state. It is not finance-specific: services,
jobs, feeds and sensors are the same widget.

```js
import 'tickslate/elements/status'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `S` | 1 x 1 | The summary ("3 of 4 OK") and the overall state, in words and a dot |
| `Tall` | 1 x 2 | Every service: its name and state, in a list that scrolls |
| `M` | 2 x 2 | The same, with a heading row, each service's detail line and how long ago it entered its state |

Any other size snaps to the nearest of these.

## Data shape

```ts
type StatusState = 'ok' | 'degraded' | 'down' | 'unknown'

interface StatusRow {
  /** Matched by `id`, so a change of state writes that row's cells and nothing else. */
  id: string | number
  name: string
  state: StatusState
  /** M: a short sentence, 'Elevated latency'. */
  detail?: string
  /** M: when it entered this state. */
  since?: Time
}

interface StatusData {
  /** Shown in the host's order; the widget does not sort. */
  rows: StatusRow[]
  /** When the data was taken. Shown as "synced HH:MM". */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}
```

`rows` is the key a status board needs. A row with no `id`, no `name`, a repeated `id` or a
state that is not one of the four is dropped, and development warns with the count.

The overall state is the worst one present: down, then degraded, then unknown, then ok.

A row's "since 12 min ago" is an age, so it moves with the clock: while any row has a `since`, or the data has an `asOf`, live or not, the tile re-renders on the page's shared 15 s ticker.
Rows keep the order they came in, because the order of a status board is part of its meaning.

| State | Words | Mark | Colour token |
|---|---|---|---|
| `ok` | OK | A filled circle | `--ts-profit` |
| `degraded` | Degraded | A triangle | `--ts-warn` |
| `down` | Down | A square | `--ts-loss` |
| `unknown` | Unknown | A hollow circle | `--ts-muted` |

## Minimal example

```html
<ts-status label="Services" size="Tall"
  data='{"rows": [{"id": "api", "name": "Orders API", "state": "ok"}, {"id": "feed", "name": "Price feed", "state": "degraded"}]}'></ts-status>
```

From script:

```js
document.querySelector('#ops').data = { rows: [{ id: 'db', name: 'Ledger', state: 'down', detail: 'Connection refused', since: Date.now() - 600000 }] }
```

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the tile's name. Defaults to "Status" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000`. Falls back to the nearest `<ts-grid>`'s |
| `flash` | attribute | Accepted like on every tile; this tile has no ticking figure to tint, so it changes nothing here |
| `size` | attribute and property | `S`, `Tall` or `M`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | The data shape above |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered, such as `['retry']` |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The static ``TsStatus.statusModel(data, variant, ctx)`` is the pure view model, handy for tests and server rendering.

Besides the rows it returns `ariaLabel`, `overall`, the `summary`, the `counts` of each state and `dropped`.

## Actions

`retry` is the only action. With `actions = ['retry']`, the error view's Retry
button fires:

```ts
// ts-action
{ action: 'retry' }
```

`open` fires too when the tile is `activatable`. The header and the empty space open it, and an `href` tile follows its link from the same places; the scrolling list scrolls under the pointer and a status row does nothing, and the tile's own buttons and the `actions` slot keep their clicks. Route `open` to a page other than the one the tile is already on. Nothing in this tile tells the host
anything else, so there is no action to opt in to. See [Events](../reference/events.md).

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the summary and the worst state |
| `header` | The header row: the live dot, the label and the right-hand text |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `table` | The table of services |
| `row` | One service |
| `cell` | A cell of a service's row |
| `dot` | A state's mark |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton shaped like the size's layout |
| Empty | `data = null` | "No services to show", or your `slot="empty"` content |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a view model that throws | A warning icon and the message, and Retry if enabled |
| Content | An object | The services. With none it says "No services to show" |

## Accessibility

- A `role="group"` named with the summary, and the worst state when it is not OK: "Services, 3 of 4 OK, Degraded".
- The services are a real table with a header row (Name, Status, and in M Since), keyed by `id`.
  The header row is visually hidden at Tall, where the columns are obvious, and shown at M.
- The state is never colour alone: it is written beside the dot, and the dot's shape differs
  for each state. The dots are `aria-hidden`. In forced colours the shapes stay, in the user's text colour.
- A service going down changes its text silently: there is no `aria-live`. A host that wants an alert announces it itself.
- A change of one service's state writes that row's cells and nothing else, so focus and the scroll position stay put.
- The live pulse, the loading shimmer and the change flash stop under
  `prefers-reduced-motion`.
