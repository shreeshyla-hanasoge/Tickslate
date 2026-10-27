# `<ts-feed>`

The latest events, newest first: an activity log, a trade blotter in words, an audit trail.
A new item appears at the front without moving the tile or the item you are reading. It is
not finance-specific.

```js
import 'tickslate/elements/feed'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `Tall` | 1 x 2 | The events, each with its small time, tag and text |
| `M` | 2 x 2 | The same, with the time at full size and each event's detail line |
| `L` | 3 x 2 | The same, wider |

Any other size snaps to the nearest of these.

## Data shape

```ts
interface FeedItem {
  /** Matched by `id`, so a new item inserts one row and the rest are untouched. */
  id: string | number
  /** The event, in your words. */
  text: string
  time?: Time
  /** A short word beside it: 'Fill', 'Alert'. */
  tag?: string
  /** Colours the tag; the tag's own text carries the meaning. */
  tone?: 'pos' | 'neg' | 'warn'
  /** M and L: a second line. */
  detail?: string
}

interface FeedData {
  /** Newest first, as you keep them. The widget does not sort. */
  items: FeedItem[]
  /** How many to show. Default 50, at least 1. */
  max?: number
  /** When the data was taken. Shown as "synced HH:MM". */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}
```

`items` is the key a feed needs. An item with no `id`, no `text` or a repeated `id` is dropped,
and development warns with the count. Items beyond `max` are left out and the tile says how many
("12 older events not shown"). A time of today shows as the clock; any other day shows the day
and the clock.

## Minimal example

```html
<ts-feed label="Activity" size="M"
  data='{"items": [{"id": 2, "text": "Order filled", "tag": "Fill", "tone": "pos", "time": 1785918000000}, {"id": 1, "text": "Session opened"}]}'></ts-feed>
```

From script, prepending an event on every message:

```js
const feed = document.querySelector('#activity')
let items = []
socket.onmessage = (e) => { items = [JSON.parse(e.data), ...items].slice(0, 200); feed.data = { items } }
```

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the tile's name. Defaults to "Feed" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000`. Falls back to the nearest `<ts-grid>`'s |
| `flash` | attribute | Accepted like on every tile; this tile has no ticking figure to tint, so it changes nothing here |
| `size` | attribute and property | `Tall`, `M` or `L`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | The data shape above |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered, such as `['retry']` |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The static ``TsFeed.feedModel(data, variant, ctx)`` is the pure view model, handy for tests and server rendering.

Besides the items it returns `ariaLabel`, `hidden`, `more` and `dropped`.

## Actions

`retry` is the only action. With `actions = ['retry']`, the error view's Retry
button fires:

```ts
// ts-action
{ action: 'retry' }
```

`open` fires too when the tile is `activatable`. The header and the empty space open it, and an `href` tile follows its link from the same places; the scrolling list scrolls under the pointer and an entry does nothing, and the tile's own buttons and the `actions` slot keep their clicks. Route `open` to a page other than the one the tile is already on. Nothing in this tile tells the host
anything else, so there is no action to opt in to. See [Events](../reference/events.md).

## Updates keep your place

Items are matched by `id`: a new item inserts one row at the front, a departed item removes one row,
a changed item writes only its changed text, and the rest are untouched. The tile keeps its size and
the list scrolls inside it. When an item arrives and the reader has scrolled away from the top, the
list is moved by the new row's height in the same frame, so what they are reading stays where it was;
at the top, the new item appears there and the others move down.

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the count and the latest event |
| `header` | The header row: the live dot, the label and the right-hand text |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `list` | The list of events |
| `item` | One event |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton shaped like the size's layout |
| Empty | `data = null` | "Nothing yet", or your `slot="empty"` content |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a view model that throws | A warning icon and the message, and Retry if enabled |
| Content | An object | The events. With none it says "Nothing yet" |

## Accessibility

- A `role="group"` named with the count and the latest event: "Activity, 12 events, latest: Order filled".
  The name is written only when it changes.
- The events are a `<ul>` read in order when the reader goes to it. **There is no `aria-live`**: a feed
  that ticks never speaks. A host that wants an arrival announced announces it itself.
- A tag's text is always shown; `tone` only colours it, so the meaning is never colour alone.
- The list takes focus when it scrolls, and updates keep the focused row and the reading position.
- The live pulse, the loading shimmer and the change flash stop under
  `prefers-reduced-motion`.
