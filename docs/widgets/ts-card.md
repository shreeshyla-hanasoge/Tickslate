# `<ts-card>`

A themed tile for any content. The card draws the shared tile chrome (surface,
border, radius, padding, header) from `--ts-*` tokens, and you put a list, a
paragraph or another library's chart inside it. A dashboard of mixed content
then still reads as one thing.

```js
import 'tickslate/elements'
```

## Sizes

All seven sizes. Restrict them with the `sizes` attribute (below). The card has
no layout of its own per size: your slotted content reflows into the box it is
given.

| Size | Cells (4 columns) | Notes |
|---|---|---|
| `S` | 1 x 1 | |
| `Wide` | 2 x 1 | |
| `Tall` | 1 x 2 | |
| `M` | 2 x 2 | |
| `L` | 3 x 2 | On a phone (2 columns) it takes 2 x 2 and renders the `M` design, as does `XL`, when `M` is in `sizes` |
| `Banner` | 4 x 1 | Full width at every column count |
| `XL` | 4 x 2 | |

`sizes` limits what the tile may snap to, both standalone and inside a
[`<ts-grid>`](ts-grid.md), where it also limits what the user can resize to.
Standalone, a card is as tall as the same size in a grid (`--ts-row` and
`--ts-gap` decide).

## Data shape

`data` is optional and only feeds the header.

```ts
interface CardData {
  /** When the content was taken: any time (ISO string, Date, ms or seconds). Shown as "synced 14:05". */
  asOf?: Time
  /** Shows the pulsing live dot. */
  live?: boolean
}
```

`data.asOf` and `data.live` win over the `as-of` and `live` attributes, so you
can set the attributes in markup and let live data take over. A card with no
data at all is a normal card.

## Minimal example

```html
<ts-card label="Notes" sizes="S Wide M">
  <p>Deploy freeze from Friday.</p>
</ts-card>
```

With every slot:

```html
<ts-card label="Latency" sizes="Wide M L" live as-of="2026-10-13T14:05:00Z" scrollable>
  <span slot="value">182 ms</span>
  <button slot="actions" type="button">Refresh</button>
  <div style="position: relative; height: 100%">
    <svg role="img" aria-label="Latency over the last hour: 182 ms now, 140 ms low" viewBox="0 0 100 20" preserveAspectRatio="none" style="width: 100%; height: 100%">
      <path d="M0 14 L25 10 L50 12 L75 6 L100 8" fill="none" stroke="currentColor" />
    </svg>
  </div>
  <span slot="footer">p95 over the last hour</span>
</ts-card>
```

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the tile's name. Without one the tile is named by its tag, with a development warning |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `sizes` | attribute | Whitespace-separated size names, such as `S Wide M`. Invalid tokens are ignored; the default is all seven |
| `size` | attribute and property | The size to render, snapped to `sizes`. A grid sets it |
| `live` | attribute | Shows the live dot. `data.live` wins |
| `as-of` | attribute | A time, shown as "synced HH:MM", and as "HH:MM" on a tile under 200px wide. `data.asOf` wins |
| `scrollable` | attribute | The body scrolls on its own and takes keyboard focus (`tabindex="0"`, `role="group"`, named by the label). Its last 28px fade only while there is more below |
| `data` | property, or a JSON attribute | `CardData`. See above |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions the card offers, such as `['retry']` |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Format the "synced" time. Resolved from the card, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The card also has the base members every widget has (`variant`, `spec`,
`clock`, `formatter` and so on); they are listed in
[Your own widget](../guide/your-own-widget.md).

## Slots

| Slot | Content |
|---|---|
| (default) | The body: a box with `flex: 1; min-height: 0; overflow: hidden`, so a child with `height: 100%` fills what the tile leaves and follows resizes. Canvas, svg, img, video and iframe are made `display: block` so no baseline gap pushes a full-height child past the box |
| `value` | A headline, styled like the other widgets' big figure |
| `actions` | The right end of the header |
| `footer` | One muted line, clipped with an ellipsis |
| `empty` | Replaces the empty text (see States) |

## Parts

For `::part()` styling from the host page.

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the label, then the `value` slot's text |
| `header` | The header row: the live dot, the label and the right-hand text, with your `actions` slot |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `value` | The `value` slot, so `::part(value)` styles what you slot there |
| `body` | The body box around the default slot |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks (the body only: your header, value and footer stay) |

## Actions

The card offers one: `retry`. Set `actions = ['retry']` and the error view
shows a Retry button that fires:

```ts
// ts-action
{ action: 'retry' }
```

It bubbles and is composed, so one listener on the grid or the document hears
every tile. See [Events](../reference/events.md).

## States

Exactly one view shows: error, then loading, then empty, then content.

| State | When | What the card shows |
|---|---|---|
| Content | `data` is `undefined`, an object, or `null` with a body slotted | The tile and your slotted content. A card needs no data, so `undefined` is content, not loading |
| Loading | `state="loading"` | A skeleton over the **body only**. The header, `value`, `actions` and `footer` stay where they are, because they are your content |
| Empty | `data = null` and nothing in the default slot | "No data", or your `slot="empty"` content. `data = null` never replaces slotted content |
| Error | `state="error"`, `error` set, or a data attribute that is not valid JSON | The tile's error view with the message (or "Couldn't display this data"), and Retry if enabled. Slotted content stays in the DOM but is not shown |

## Accessibility

- The tile is a `role="group"` and its label is a heading. The group's name is the label,
  followed by the text of the `value` slot when there is one: "Latency, 182 ms", and
  ", live" while the card is live.
- Name your chart yourself: put `role="img"` and an `aria-label` that states the
  result ("Latency over the last hour: 182 ms now") on it. See
  [Bring your own chart](../guide/bring-your-own-chart.md).
- A `scrollable` body is keyboard-focusable, has a visible focus ring from
  `--ts-focus`, and is a labelled group.
- The live dot is decorative; "synced HH:MM" carries the freshness in text.
- Skeleton shimmer and the live pulse stop under `prefers-reduced-motion`.
- The loading view sets `aria-busy="true"` on the tile.
