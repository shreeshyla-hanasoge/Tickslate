# `<ts-capital-funding>`

Each account's balance against what its strategies are allocated, with the
shortfalls marked. Allocations draw the balance in the order you list them; an
allocation the balance cannot cover is hatched and says `short <amount>`. It
reads any accounts, in any currency, and moves no money.

```js
import 'tickslate/elements/capital-funding'
```

## Sizes

| Size | Cells (4 columns) | Shows |
|---|---|---|
| `S` | 1 x 1 | The first account: its funded share, a bar and what is short |
| `Tall` | 1 x 2 | Every account, in a list that scrolls, with its allocations |
| `L` | 3 x 2 | The same list, with each allocation's detail and P&L on its row |

Any other size snaps to the nearest of these.

## Data shape

```ts
interface FundingAllocation {
  id: string
  /** The strategy. */
  name: string
  /** 'NIFTY 50 · 5m'. Shown at L. */
  detail?: string
  amount: Numeric
  /** Shows a dot, and "live" to a screen reader. */
  live?: boolean
  /** L: shown signed on the row. */
  pnl?: Numeric
  /** Your own funded amount: it replaces the rule, and consumes the balance for the allocations after it. */
  funded?: Numeric
}

interface FundingAccount {
  id: string
  /** 'Broker A'. */
  name: string
  balance: Numeric
  allocations: FundingAllocation[]
}

interface CapitalFundingData {
  accounts: FundingAccount[]
  /** When the data was taken. Shown as "synced HH:MM". */
  asOf?: Time
  /** Shows the pulsing dot. */
  live?: boolean
}
```

**How the balance is drawn.** Each allocation, in array order, takes what is left
of the balance and is short by the rest. With a balance of 18,640.40 and two
allocations of 25,000, the first is funded 18,640.40 and short 6,359.60, and the
second is funded nothing and short 25,000. A `funded` you give replaces that
figure (held to 0 up to the amount) and takes that much of the balance away from
the allocations after it, so two strategies are never both "nearly funded" by
money that can be spent once. The same numbers are in the core's
[`funding()`](../reference/core.md#fundingaccount).

An account or an allocation needs an `id`, a string, and it must be unique among
its siblings: that is how a live update finds the row to change. One with none, or
a repeated one, is left out and counted once in development. An amount that cannot
be read is zero, and a balance that cannot be read, or is negative, funds nothing.

Money is formatted with the tile's `currency` and `locale`, so with `en-IN` an
amount in the lakhs is grouped `1,24,500.00`.

## Minimal example

```html
<ts-capital-funding id="funding" label="Funding" size="Tall"></ts-capital-funding>
```

```js
const funding = document.querySelector('#funding')
funding.data = {
  accounts: [
    {
      id: 'a',
      name: 'Broker A',
      balance: 18640.4,
      allocations: [
        { id: 's1', name: 'Opening range', detail: 'NIFTY 50 · 5m', amount: 25000, live: true, pnl: 1240 },
        { id: 's2', name: 'Mean reversion', detail: 'BANKNIFTY · 15m', amount: 25000, pnl: -310 },
      ],
    },
  ],
}
funding.actions = ['rebalance']
funding.addEventListener('ts-action', (e) => {
  if (e.detail.action === 'rebalance') openRebalance(e.detail.id)
})
```

To update, set `data` again with the same ids. The accounts and allocations whose
figures did not change are not touched.

**Freshness.** Send `asOf` with `live: true` and the header says how old the data is, as every widget's does; past `stale-after` it reads stale. With `asOf` and no `live` the header reads `synced 11:42`. At S the funded share flashes briefly when it changes, unless `flash="off"`.

## Attributes and properties

| Name | Type | What it does |
|---|---|---|
| `label` | attribute and property | The heading and the tile's name. Defaults to "Capital funding" |
| `heading-level` | attribute | The `aria-level` of the tile's heading, 1 to 6. Falls back to the nearest `<ts-grid>`'s `heading-level`, then 3 |
| `size` | attribute and property | `S`, `Tall` or `L`; others snap. A grid sets it |
| `data` | property, or a JSON attribute | `CapitalFundingData` |
| `state` | attribute and property | `'loading'` or `'error'` |
| `error` | property | A message shows the error view; `null` clears it |
| `actions` | property | Names of the actions offered: `'retry'`, and `'rebalance'` to show each account's Rebalance button |
| `stale-after` | attribute | How old live data's `asOf` may get before the tile reads as stale: milliseconds (`90000`) or a duration (`'90s'`, `'2m'`, `'1h'`). Default `120000`. Falls back to the nearest `<ts-grid>`'s `stale-after` |
| `flash` | attribute | `'off'` stops the brief tint on a figure that changed; the grid's `flash` applies too |
| `locale`, `currency`, `time-zone`, `hour-cycle` | attributes | Formatting. Resolved from the tile, then the nearest `<ts-grid>`, then `configure()` |
| `item` | attribute | The id a grid matches this child by |

The base members every widget has are listed in
[Your own widget](../guide/your-own-widget.md). The static
`TsCapitalFunding.fundingModel(data, variant, ctx)` is the pure view model.

## Actions

```ts
// ts-action
{ action: 'retry' }
{ action: 'rebalance'; id: string }   // opt-in; id is the account's id
```

- **`rebalance`** is off until `actions` includes `'rebalance'`. Each account then
  has a Rebalance button, named "Rebalance Broker A", and pressing it fires
  `rebalance` with the account's `id`. The widget moves no money and has no form:
  it asks, and your app shows its own flow and sends the new `accounts` in `data`.
- **`retry`** is the error view's button, with `actions = ['retry']`.

Nothing fires while the grid is in edit mode. See [Events](../reference/events.md).

## Parts

| Part | Element |
|---|---|
| `tile` | The tile box, `role="group"` named by the label |
| `header` | The header row: the live dot, the label and the synced time |
| `label` | The label, a `role="heading"` whose level comes from `heading-level` |
| `value` | The funded share S shows |
| `row` | One account |
| `allocation` | One allocation of an account |
| `bar` | A funding bar |
| `empty` | The empty view's container |
| `error` | The error view's container (only while the error view shows) |
| `skeleton` | The loading view's container, around the skeleton blocks |

## States

| State | When | What the tile shows |
|---|---|---|
| Loading | `data` is `undefined`, or `state="loading"` | A skeleton of accounts |
| Empty | `data = null` | "No accounts yet", or your `slot="empty"` content. `accounts: []` shows the header with the same line under it |
| Error | `state="error"`, `error` set, an unparseable `data` attribute, or a view model that throws | The message, and Retry if enabled |
| Content | An object | The accounts. An account with nothing allocated says "Nothing allocated" and draws no bar |

## Accessibility

- A shortfall is never only a colour: the bar's unfunded part is hatched, and the words
  `short ₹6,359.60` are written beside it.
- Each bar is `role="img"` with a name that states the result: "Broker A: ₹18,640.40 of
  ₹50,000.00 funded, short ₹31,359.60". The tile's own name carries the same summary at S.
- The share is rounded to a whole percent but never to 100% while anything is short.
- A live allocation has a dot for sighted readers and the word "live" for assistive technology.
- P&L carries `+` or the true minus `−` and an `aria-hidden` ▲ or ▼, so a gain and a loss never differ by colour alone.
- The scrolling list is a focusable group named "<label>, accounts", so the keyboard can
  scroll it. Live updates never move focus or the scroll position.
- The Rebalance button is a real `<button>` with a name that says which account, at least
  44px on a touch screen, and a focus ring.
- Figures use tabular numbers and keep their sign beside the digits in right-to-left pages.
  The bar always fills from the start of the line in a left-to-right frame.
- Under forced colours the bar keeps an outline, the unfunded part is dashed and the dot is
  drawn in the system's highlight colour.
