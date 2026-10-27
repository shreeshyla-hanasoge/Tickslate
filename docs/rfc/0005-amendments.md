# RFC 0005: Amendments from the 0.3.0 wave and the first integration

| | |
|---|---|
| Status | **Approved** (27 Oct 2026), with every recommended option of the Decisions section. The 0.4.0 stories are `activatable-target`, `mini-chart-actions`, `spacing-signal`, `dashboard-labels`, `size-ceilings`, `versioning-rows` and `release-lint`; `link-label-style` and `wall-clock-tests` shipped in 0.3.1. |
| Written | 27 Oct 2026 |
| Amends | [RFC 0004](0004-p2-surfaces.md) §2.2, §2.4, §5.3, §6.2, §7, §9.1, §10.4 and §12, and Decision 68; [RFC 0003](0003-p1-surfaces.md) §5.1, §7 and §25; [RFC 0002](0002-integration-and-ux.md) §6; and `docs/VERSIONING.md` (§7) |
| Covers | The click target of an activatable tile (issue #68); opt-in `instrument` and `expand` actions (issue #69); a text-spacing signal tiles can key on; a `labels` option on `createDashboard`; the 0.3.0 budget rows; the font default shipped in 0.3.0; a review of the four Breaking lines of 0.3.0; the sources the remaining market presets need; and three process rules |
| Sources | RFC 0001 to RFC 0004, [docs/VERSIONING.md](../VERSIONING.md), [docs/ACCESSIBILITY.md](../ACCESSIBILITY.md), [docs/WORKFLOW.md](../WORKFLOW.md), the 0.3.0 section of [CHANGELOG.md](../../CHANGELOG.md), `src/elements/widget.js`, `src/elements/mini-chart.js`, `src/elements/dashboard.js`, `src/core/calendar.js`, `scripts/check-size.mjs`, `test/browser/density.spec.mjs`, and GitHub issues #68 and #69. It takes no new measurements. |
| Approval | The maintainer approved it in chat ("approve RFC 0005") on 27 Oct 2026. |

RFC 0001 to RFC 0004 stay the contract for everything this RFC doesn't
mention, and none of them is edited. Where this RFC changes one, the section
says "amends RFC 000x §y" and the change lives here. Where this RFC and an
earlier one differ, this RFC wins.

This is the documentation story that RFC 0003 and RFC 0004 promised: it
collects what the 0.3.0 stories recorded under `### Internal`, what the first
consumer's integration found, and what the maintainer settled in chat during
the wave, and asked for approval once.

**How stories use this RFC**

- **They implement it and never edit it.** A story that finds a name, a
  signature or a behaviour that can't be built as written records the
  difference in its changes fragment (`changes/<story-id>.md`, under
  `### Internal`) and builds the nearest thing that works. It does not touch
  this file.
- **A story's file list is the boundary.** Where a section needs a file
  another story owns, its *Files and order* says so, and the two stories are
  built in the order given there.
- **This RFC is approved** (27 Oct 2026), so a section's story may start once
  everything in its *must merge first* column
  has merged.

**Conventions in this RFC**

- Signatures are TypeScript, as they will appear in `src/core/index.d.ts`,
  `src/elements/index.d.ts`, `src/elements/widget.d.ts`,
  `src/elements/grid.d.ts` and `src/elements/mini-chart.d.ts`.
- *Internal* marks a module, class or helper that no package entry exports.
  It is written down so stories agree on it; it can change without an RFC.
- Every figure in an example is made up. The size estimates are estimates; the
  story that builds a section measures and reports the real figure. The figures
  quoted from `scripts/check-size.mjs` in §5 are that file's recorded
  measurements.
- English strings quoted here are the `EN` defaults of RFC 0003 §1. Each key a
  section adds is listed under its *Messages*, and every one is overridable.
- A decision is written **Decision n**. The numbers continue from RFC 0004's
  last, Decision 76, so no number ever means two things. The recommended option
  is the one the section's text describes.

**Which story builds which section**

| Section | Story |
|---|---|
| §1 The click target of an activatable tile | `activatable-target`; the label style bug is `link-label-style` |
| §2 Opt-in `instrument` and `expand` actions | `mini-chart-actions` |
| §3 A text-spacing signal | `spacing-signal` |
| §4 `labels` on `createDashboard` | `dashboard-labels` |
| §5 Budgets | `size-ceilings` |
| §6 The font default | None: shipped in 0.3.0 (`density-and-text-scaling`), ratified here |
| §7 The four Breaking lines of 0.3.0 | `versioning-rows` |
| §8 Market preset sources | `preset-sources`, once the maintainer answers the parked question |
| §9 Process | `release-lint`, `wall-clock-tests`; the required visual check is a repository setting the maintainer changes |

**Which stories must merge before which**

| Story | Must merge first | Why |
|---|---|---|
| `link-label-style` | Nothing | One rule in `widget.js`; shipped in 0.3.1 (PR #70, as `activatable-label`) |
| `activatable-target` | `link-label-style` | Both edit the stretched-link rules in `widget.js` |
| `mini-chart-actions` | `activatable-target` | Both edit `widget.js` (the shared header and the lifted surfaces); the instrument picker must sit above the overlay |
| `spacing-signal` | `activatable-target` | Both edit `widget.js`; it also owns `grid.js`, `progress.js`, `today-pnl.js` and `pnl-calendar.js`' tier rules |
| `dashboard-labels` | Nothing | `dashboard.js` and its types only |
| `size-ceilings` | `activatable-target`, `mini-chart-actions`, `spacing-signal` | It measures after the shared base has stopped moving |
| `versioning-rows` | Nothing | `docs/VERSIONING.md` only |
| `release-lint` | Nothing | `package.json` only |
| `wall-clock-tests` | Nothing | Three test files only; shipped in 0.3.1 (PR #72) |
| `preset-sources` | The maintainer's answer to parked question 4 | It needs sources nobody could read on 26 Oct 2026 |

**Files more than one story touches**

| File | Stories, in build order | What each adds |
|---|---|---|
| `src/elements/widget.js`, `src/elements/widget.d.ts` | `link-label-style`, `activatable-target`, `mini-chart-actions`, `spacing-signal` | The label tokens on the link; the lifted surfaces; the expand button and its action; the `data-ts-spacing` host rule |
| `src/core/messages.js` and the `Messages` interface | Any order: each story appends one contiguous block under its own `// ── <family> ──` comment | `action.expand`, `miniChart.instrument`, `miniChart.instrumentOf` |
| `src/elements/index.d.ts` | `mini-chart-actions`, then `dashboard-labels` | `TsExpandAction` in `TsCommonAction`; `DashboardOptions.labels` |
| `test/api-surface.snapshot.json` | Each story that adds a public name, by `npm run api:update` | Its own names |
| `scripts/check-size.mjs` | Each story that moves a row reports it; `size-ceilings` writes the ceilings last | As §5 says |
| `docs/reference/events.md` | `mini-chart-actions` | The `instrument` and `expand` rows |

## 1. The click target of an activatable tile (amends RFC 0003 §7; issue #68)

A click on data should never open the tile. Today it does.

*Implemented by: activatable-target. The label style bug is link-label-style.*

**What happens today.** RFC 0003 §7 makes the label of an `href` or
`activatable` tile a link or a button, and a stretched-link rule
(`[part~="link"]::after { position: absolute; inset: 0; z-index: 1 }`) makes
the whole tile its target. Only `.btn` controls (`z-index: 2`), slotted
controls and the `actions` slot sit above it. So a click on a heatmap cell, on
a chart's plot or on a table row fires `open`.

**What the consumer saw.** Users clicked a cell of `<ts-pnl-calendar>` and got
`open`, which routed to the page they were already on. They read it as the
dashboard refreshing. The consumer removed `activatable`. The README and
`docs/widgets/ts-pnl-calendar.md` ("a cell is not a button and fires nothing")
describe a narrower target than the code has.

**What we read in the CSS.** The overlay also sits above every scrolling list
inside a tile (`.scroll` in the table, the watchlist, the open positions, the
capital funding, the status, the feed and the breakdown). A wheel over such a
list hits the overlay, which is not inside the list, so the list does not
scroll under the pointer. A table's sort buttons and selectable rows, and a
chart's selectable points, have no `z-index` either, so a click on them opens
the tile instead. The story confirms each of these in a browser before it
changes anything.

### 1.1 Options

| Option | What a click on data does | Cost |
|---|---|---|
| (a) Docs only | Opens the tile, as today; the README and the widget pages say so | No code; the consumer's users keep getting `open` from a heatmap |
| (b) Lift the data surfaces | Scrubs, focuses, selects, scrolls or does nothing; the header and the empty space open the tile | One shared rule and a class on each surface |
| (c) `activatable="label"` | With the value `label`, only the label is the target; without it, as today | A new attribute value; the default stays wrong for data widgets |

### 1.2 Recommendation: (b), for `href` tiles too

The data surfaces of each widget are lifted above the overlay, as the tile's
own buttons already are. What is left under the overlay opens the tile: the
header, the padding, the headline figure and the space between the parts.

- **One shared rule.** `widget.js` gains a class, `lift`, and one rule:
  `:host([activatable]) .lift, :host([href]) .lift { position: relative; z-index: 2 }`.
  A tile with neither attribute is unchanged. The scrub overlay, the slider and
  the selectable points already sit inside the plot box, so lifting the box
  lifts them.
- **The delegated listener is unchanged.** A click on a lifted surface bubbles
  to the tile's listener, `findLink` finds no link in its path, and nothing is
  emitted. No new event logic is needed.
- **`href` tiles get the same narrowing** (Decision 78). The two attributes
  share one rule today, and a link that opens when a reader points at a chart
  has the same fault as a button that does.
- **Custom widgets** opt in by putting `class="lift"` on their own data
  surfaces. `docs/guide/custom-widgets.md` says so in one paragraph.

**The surfaces, per widget.** This list is the contract. A surface is lifted
when it has its own pointer or keyboard behaviour, or when it is a drawn chart
a reader points at to read.

| Widget | Lifted surfaces | What a click there does |
|---|---|---|
| `<ts-today-pnl>` | The intraday plot (`part="chart"`) at every size that draws it, with its scrub surface and slider | Scrubs; a click does nothing |
| `<ts-equity-curve>` | The plot (`part="chart"`), its scrub surface and slider, at every size | Scrubs; a click does nothing |
| `<ts-chart>` | The plot (`part="chart"`), its scrub surface and slider, and the selectable points when `actions` includes `'select'` | Scrubs; a point fires `select` |
| `<ts-pnl-calendar>` | Every day cell (`role="gridcell"`) and the grid that holds them | Focuses the cell, as the arrow keys do |
| `<ts-mini-chart>` | Each plot box (`part="chart"`), where Emberwick draws its crosshair, and the instrument picker of §2 | Shows Emberwick's crosshair; a click does nothing |
| `<ts-metric>`, `<ts-edge-stats>` | The drawn chart (`part="chart"`) where the size draws one | Nothing |
| `<ts-breakdown>` | The drawing (`part="chart"`), the share bar (`part="bar"`) and the scrolling legend (`.scroll`) | Nothing; the legend scrolls |
| `<ts-table>`, `<ts-watchlist>`, `<ts-open-positions>`, `<ts-capital-funding>` | The scrolling region (`.scroll`) and everything in it: header cells, sort buttons, rows and row buttons | Scrolls, sorts or selects; a plain row does nothing |
| `<ts-status>`, `<ts-feed>` | The scrolling region (`.scroll`) and its rows | Scrolls; a row does nothing |
| `<ts-card>` | Its body only while it scrolls (`.body.scroll`) | Scrolls |
| `<ts-session-clock>`, `<ts-progress>` | None | Opens the tile |

The progress track and the session lane stay under the overlay on purpose:
they are the tile's headline drawn as a shape, not a chart a reader explores.

### 1.3 Reasoning

- **It matches what readers expect.** A dashboard user who points at a chart
  is reading it. Opening another page in answer is a surprise, and the
  consumer's users read it as a fault.
- **It matches the documentation.** The README says the label is the button,
  and the calendar's page says a cell fires nothing. Option (b) keeps the large
  target the stretched link exists for, and makes the documented promise true
  for data.
- **It fixes scrolling.** Lists inside an activatable tile scroll under the
  pointer again, and sort buttons and selectable rows take their own clicks.
- **(a) leaves the fault in place.** It only describes it.
- **(c) puts the burden on every host.** The default would still open on a
  heatmap click, and every data widget would need the opt-in to behave. It is
  parked (parked question 1) in case a host asks for a label-only target on a
  tile with no data.

### 1.4 Accessibility

- **Keyboard users get exactly what they have today.** The label is still a
  `<button type="button" part="link">` (or a link), one tab stop, opened with
  Enter or Space. The focus ring is still drawn around the whole tile. Lifted
  surfaces keep their own tab stops: the chart slider, the calendar's roving
  cell, the table's scroll region and row buttons.
- **Screen readers hear no change.** The accessibility tree is the same; only
  the CSS stacking changes.
- **Pointer and touch targets stay large.** The header row, the padding and the
  non-data space remain the target. At 2 columns and under `pointer: coarse`
  the story measures the open target from the tile's top edge to the first
  lifted surface. Where it is under 44 px (compact density on a phone, at
  `--ts-pad: 12px`), the header row of an `href` or `activatable` tile gains a
  `min-block-size` that makes it 44 px (ACCESSIBILITY item 8).
- **Nothing interactive nests in another.** The lifted surfaces are siblings of
  the label, not inside it (ACCESSIBILITY item 9).
- **Cursor.** Lifted surfaces show their own cursor (the default, or the
  crosshair a chart already sets), so a pointer user sees where a click opens.
- **Edit mode** is unchanged: tiles are inert and every handler checks
  `_isEditing()`.

### 1.5 The label style bug (link-label-style)

Issue #68 also reports that an activatable label renders without the label
tokens. The `[part~="link"]` rule sets `font: inherit` but not
`text-transform` or `letter-spacing`, and a `<button>` does not inherit those
from the user agent's defaults. So a linked label is mixed case with no
tracking beside its uppercase, tracked neighbours. The fix is two declarations
on `[part~="link"]`: `text-transform: inherit; letter-spacing: inherit`. It
changes no public name, so it needs no RFC. It is recorded here only so the
two stories don't both edit the rule. It can ship in a patch (Decision 94), and
it did: `link-label-style` shipped in 0.3.1 as PR #70 (`activatable-label`).

### 1.6 Messages

None.

### 1.7 Size

One rule in `widget.js` and one class name in each listed template: an
estimated 60 to 120 B min + gzip on every widget entry, and the same on each
"adds to grid" row. The link-label fix is under 30 B.

### 1.8 Files and order

`src/elements/widget.js` (the rule), each widget file in the table above (the
class only), `README.md`'s attribute table, `docs/widgets/*.md` for every
listed widget (one sentence each), `docs/widgets/ts-pnl-calendar.md`'s Actions
section, `docs/guide/custom-widgets.md`, `test/tile-activation.test.mjs` and a
new `test/browser/activatable.spec.mjs`. It builds after `link-label-style`
and before `mini-chart-actions` and `spacing-signal`.

### 1.9 What the story must show

- A browser spec, on all five Playwright projects, that records `ts-action`
  for a click on: the label, the header's empty space, the padding, and each
  lifted surface in the table above, on an `activatable` tile and an `href`
  tile. Only the first three open.
- A wheel over the table's rows in an activatable tile scrolls the table.
- A click on a sort button sorts, and a click on a selectable row or chart
  point fires `select` and not `open`.
- The keyboard path is unchanged: Tab reaches the label once, Enter opens.
- The open target is at least 44 px tall at 390 px wide in both densities.
- axe stays clean in both themes. The visual baselines don't move.

## 2. Opt-in `instrument` and `expand` actions (amends RFC 0004 §6.2 and RFC 0003 §5.1 and §7; issue #69)

A mini chart can ask to switch its instrument, and any tile can ask to be
expanded. Both are requests: the tile asks, and the host decides.

*Implemented by: mini-chart-actions.*

### 2.1 `instrument` on `<ts-mini-chart>`

```ts
interface MiniChartData {
  charts: Array<{
    id: string
    instrument: string                                // the name shown, as today
    /** The choices the picker offers, in the host's order. At most 50; more are dropped with one development warning. */
    instruments?: Array<{ id: string; label: string }>
    /** The id of the choice shown now. It must be one of `instruments`. */
    instrumentId?: string
    // … every other field of RFC 0004 §6.2, unchanged
  }>
  // … unchanged
}

type TsMiniChartAction =
  | TsCommonAction
  | { action: 'timeframe'; id: string; value: string }
  | { action: 'instrument'; id: string; value: string }     // opt-in: actions includes 'instrument'
```

- **When it shows.** The picker appears for a chart only when `actions`
  includes `'instrument'`, `instruments` has at least two entries, and
  `instrumentId` names one of them. Otherwise the chart shows its `instrument`
  name as today. An `instrumentId` that names no entry warns once in
  development. A duplicate id keeps its first entry.
- **The control is a native `<select>`** (Decision 80). It replaces the
  instrument name in the chart's own row (`.mh`), the row above each plot, so
  at XL each of the two charts has its own picker. Its options are built with
  the DOM from host data, as the timeframe buttons are, never as markup. It
  carries `part="instrument"` and the `.btn` metrics: 28 px tall on a fine
  pointer and at least 44 × 44 px under `pointer: coarse`.
- **Its accessible name** is `miniChart.instrument` ("Instrument") at M and L,
  and `miniChart.instrumentOf` ("Instrument, chart 1 of 2") at XL, where two
  pickers share a tile. The selected option's label is read as its value. The
  chart's summary (`role="img"`) keeps naming the instrument from
  `instrument`.
- **Choosing fires a request.** A `change` fires
  `ts-action { action: 'instrument', id: <chart id>, value: <instrument id> }`.
  The widget does not switch on its own: the host sends new `charts` with the
  new `instrumentId`, bars and name. If a listener calls `preventDefault()`,
  the picker returns to the data's `instrumentId` at once. Otherwise it shows
  the reader's choice until the next data, which always wins.
- **Inert in edit mode.** The tile is inert while the grid edits, and the
  handler checks `_isEditing()`, as the timeframe buttons do.
- **Sizes.** M, L and XL: every size the mini chart has.
- **Not in other widgets yet.** The data shape is the mini chart's. A host that
  wants the same on `<ts-chart>` asks for it, and it gets its own section then.

### 2.2 Why a native `<select>`, not a menu button

| | Native `<select>` | Menu button |
|---|---|---|
| Keyboard | Built in: arrows, type-ahead, Enter, Escape | Ours to write: roving focus, type-ahead, Escape, focus return |
| Touch | The platform's own picker, full screen on phones | A popup we position inside a small tile, which may not fit |
| Screen readers | A combo box with a name and a value, everywhere | A button, a menu and items, which each engine announces differently |
| Forced colours | The system draws it | Ours to keep visible |
| Size | An estimated 0.4 to 0.6 kB min + gzip | An estimated 1.5 to 2.5 kB, plus focus-trap edge cases |
| Look | Only the closed box follows the tokens; the open list is the platform's | Fully themed |

The native control is smaller, already accessible and right on a phone. The one
loss is a themed open list, which a trading dashboard does not need. A menu
button would add the largest piece of interaction code in the library for one
picker.

### 2.3 `expand` on every widget

```ts
// src/elements/widget.d.ts
type TsExpandAction = { action: 'expand'; id: string }      // id: the item attribute, '' without one
type TsCommonAction = /* retry and open, as today */ | TsExpandAction
```

- **A base-widget action** (Decision 81). Any tile opts in with `actions`
  including `'expand'`. The base renders the button, so every built-in widget
  and every custom widget that uses the shared `header()` gets it with no code
  of its own.
- **The button** sits last in the header, after the meta and the `actions`
  slot, at the inline end. It is `<button type="button" class="btn ico" part="expand">`
  with an inline SVG of four outward corners, `aria-hidden="true"`. The SVG is
  static template markup, so strict CSP and Trusted Types are unaffected.
- **Its name** is `action.expand` ("Expand {label}"), with the tile's
  effective label: "Expand Mini chart". It is not a toggle, so it has no
  `aria-pressed` or `aria-expanded`.
- **Pressing it fires** `ts-action { action: 'expand', id }`. The host decides
  what expand means: `el.requestFullscreen()` on the widget, a modal with its
  own larger chart, or a route. The guide shows the first two, and says to
  return focus to the expand button when the host's view closes.
- **Which sizes show it** (Decision 82). Every size except `S`. An `S` tile
  holds one figure, and on a phone it is about 170 px wide, where a 44 px button
  would take the room the label floor keeps (§6).
- **Inert in edit mode**, like every action: the tile is inert, and the
  handler checks `_isEditing()`.
- **Above the stretched link.** It is a `.btn`, so it already sits at
  `z-index: 2`.
- **A collapse state is not specified.** While the host shows the tile full
  screen, the button still says "Expand". Whether the base should offer an
  `expanded` state that renames it "Collapse {label}" is parked question 2.

### 2.4 Messages

| Key | English | Parameters |
|---|---|---|
| `action.expand` | "Expand {label}" | `label` |
| `miniChart.instrument` | "Instrument" | |
| `miniChart.instrumentOf` | "Instrument, chart {n} of {count}" | `n`, `count` |

### 2.5 Accessibility

- ACCESSIBILITY items 8, 9, 10 and 11 apply: 44 px targets on coarse pointers,
  real controls, visible focus (`outline: 2px solid var(--ts-focus)`), and both
  actions off until the host lists them.
- Neither action announces anything. The host's response (new data, a full
  screen view) is what the reader perceives.
- The select's closed box uses `--ts-ink` on `--ts-surface`, never coloured
  text on `--ts-surface-2` (item 14).
- In forced colours the select is drawn by the system, and the expand icon uses
  `currentColor`, so it follows `ButtonText`.

### 2.6 Size

| Entry | Estimate (min + gzip) | Why |
|---|---|---|
| `mini-chart` | +0.4 to 0.6 kB | The picker, its change handler, its CSS and two message reads. Its "adds to grid" row (18,522 B measured, 20 kB budget) has room |
| Every widget entry | +0.25 to 0.35 kB | The button in the shared header, the SVG, the handler and one message read |
| The core | About +80 B | Three `EN` keys |

`<ts-card>` and `<ts-progress>` are among the rows still enforced at 15 kB in
"adds to grid". The story measures them and reports a row that would go over,
as RFC 0003 §25 asks.

### 2.7 Files and order

`src/elements/widget.js` and `widget.d.ts` (the button and `TsExpandAction`),
`src/elements/mini-chart.js` and `mini-chart.d.ts`, `src/core/messages.js` and
the `Messages` interface, `src/elements/index.d.ts`,
`docs/widgets/ts-mini-chart.md`, `docs/reference/events.md`,
`docs/guide/trading-dashboard.md` (the two recipes), `test/mini-chart.test.mjs`,
`test/tile-activation.test.mjs` (expand) and the API snapshot. It builds after
`activatable-target`.

### 2.8 What the story must show

- The picker appears only with the opt-in, two or more choices and a matching
  `instrumentId`; it fires one `instrument` action per change with the chart's
  id; `preventDefault()` reverts it; new data sets it.
- At XL, two pickers with distinct names.
- `expand` appears on every built-in widget at every size but `S` only with the
  opt-in, is named "Expand <label>", fires `{ action: 'expand', id }`, and does
  nothing in edit mode.
- 44 px targets under `pointer: coarse` for both controls.
- The pseudo-locale and coverage tests pass with the three keys.
- axe clean with both actions on, in both themes.

## 3. A text-spacing signal (amends RFC 0004 §2.2 and §2.4, and Decision 45)

Three tiles are cut at tablet widths under compact density with the four WCAG
1.4.12 overrides on. A height or width query cannot fix them without hiding a
line on a default tile. Tiles need to know that the reader has widened the
text.

*Implemented by: spacing-signal.*

### 3.1 The problem

`test/browser/density.spec.mjs` lists the three cuts in `KNOWN`, and each has a
`test.fixme` that asserts the tile is clean:

| Tile | Width | What is cut |
|---|---|---|
| `<ts-progress>` Wide | 700 px | The words under the bar, pushed out by the figure's taller line |
| `<ts-today-pnl>` S | 800 px | The figure, sized at `15cqi`, once each character gains `.12em` |
| `<ts-pnl-calendar>` Banner | 800 px | The last month label, widened past the tile's edge |

Decision 45 keys tiers on the tile's content height, so that no default tile
loses a line. Each of these tiles has the same size as a comfortable tile on
some phone or tablet that must keep every line. Only the text spacing differs,
and no container query can see it.

### 3.2 Options

| Option | How tiles know | Cost |
|---|---|---|
| (a) The grid detects it and marks its tiles | The grid reads its own computed `letter-spacing` and `word-spacing`, and writes `data-ts-spacing="wide"` on each child widget; widget CSS keys on `:host([data-ts-spacing="wide"])` | One style read per measure; a few attribute writes when it changes |
| (b) An explicit host attribute only | The host sets `data-ts-spacing="wide"` from its own preference | No detection, but a reader's own override (a bookmarklet, an extension) is never seen, and 1.4.12 is about those |
| (c) A custom property and style queries | The host or the reader's sheet sets `--ts-spacing: wide`; widgets use `@container style(--ts-spacing: wide)` | No script, but Safari 16.4, the floor, has no style queries, and a reader's override does not set our property |
| (d) No signal: fix each layout intrinsically | Each widget measures its text in script and fits it | A `ResizeObserver` and text measurement in three widgets; the same work again for the next cut |

### 3.3 Recommendation: (a), with the host able to set it

```ts
class TsGrid {
  /** Attribute and property. 'auto' (the default) detects; 'normal' and 'wide' set it. Anything else is 'auto', with one development warning. */
  textSpacing: 'auto' | 'normal' | 'wide'      // attribute: text-spacing
}
```

- **What the grid reads** (Decision 84). On every measure (connect, resize, a
  column change, a density change) the grid reads its own computed style. It
  calls the spacing wide when `letter-spacing` is at least `.1em` of its
  `font-size`, or `word-spacing` is at least `.14em`. It does not read
  `line-height`: many pages set `line-height: 1.5` on `body` for their own
  design, and that alone would mark every dashboard. The WCAG overrides set all
  four properties together, so letter and word spacing are enough to see them.
- **Why the grid itself.** The overrides a reader applies (a bookmarklet, an
  extension, a user style sheet) target the document. Letter and word spacing
  are inherited, so the grid element's own computed style carries them. No
  probe element is needed.
- **What it writes.** When the effective value is `wide`, the grid sets
  `data-ts-spacing="wide"` on each child widget, as it sets `size` today, and
  removes it when the value returns to normal. It writes only on change.
- **Outside a grid.** A host sets `data-ts-spacing="wide"` on a standalone
  widget itself. The attribute is public and documented in `docs/theming.md`.
- **What a widget does with it.** Each widget declares its own rules under
  `:host([data-ts-spacing="wide"])`, combined with its existing container
  queries, naming only its own classes. The three fixes:
  - `<ts-progress>` Wide hides the words under the bar (`.sec`) when the spacing
    is wide and the content box is under `7.25rem` (a made-up threshold; the story derives it). The tile's accessible name
    still states them.
  - `<ts-today-pnl>` S sizes its figure from a smaller cap under wide spacing,
    for example `13cqi` in place of `15cqi` (a made-up figure; the story
    derives it from the `.12em` the overrides add).
  - `<ts-pnl-calendar>` Banner drops every other month label (`.ter`) under
    wide spacing below its Banner width threshold. The grid's cells keep their
    `aria-label`s, so no month is lost to a screen reader.
- **Detection is not live between measures.** An override applied to a page
  that then does not resize is seen at the next measure. The story records how a
  bookmarklet behaves in each engine. Whether to re-check on a timer is parked
  question 3.

### 3.4 Reasoning

- **It sees what 1.4.12 is about.** The criterion is the reader's own
  override. Only detection sees one the host never set.
- **Decision 45 holds.** Default tiles are never marked, because a default page
  has `letter-spacing: normal`, so no default tile loses a line. The visual
  baselines prove it.
- **It costs almost nothing.** The grid already reads its computed style to
  measure its tokens. One more property read is free on a measure that already
  recalculates style.
- **(b) alone fails the criterion,** and (c) does not run on the floor.
- **(d) does not scale.** Every future cut would need its own measuring code.

### 3.5 Accessibility

- WCAG 1.4.12 at tablet widths, compact density, both themes: no label,
  headline or figure is cut.
- Only secondary rows hide, never the label, the headline, its sign and
  arrow, the data state or a control (RFC 0004 §2.2's rule). A hidden row's
  content stays in the tile's accessible name.
- Nothing is announced when the signal changes.

### 3.6 Messages

None.

### 3.7 Size

`grid` +0.2 to 0.35 kB min + gzip (the attribute, the read, the writes).
`progress`, `today-pnl` and `pnl-calendar` +40 to 80 B each (one rule).

### 3.8 Files and order

`src/elements/grid.js`, `grid.d.ts`, `src/elements/progress.js`,
`today-pnl.js`, `pnl-calendar.js`, `docs/theming.md`, `docs/widgets/ts-grid.md`,
`test/density.test.mjs`, `test/browser/density.spec.mjs` and the API snapshot.
It builds after `activatable-target`.

### 3.9 What the story must show

- **A unit test** with a stubbed `getComputedStyle`: `letter-spacing: .12em`
  marks the children, `word-spacing: .16em` marks them, `line-height: 1.5`
  alone does not, `text-spacing="normal"` overrides detection, and returning to
  normal removes the attribute.
- **The three `test.fixme` entries in `density.spec.mjs` become tests**, and
  `KNOWN` is empty. The spec's existing matrix (390, 700, 800 and 1280 px, both
  themes, with and without the overrides) passes with no exception.
- **The visual baselines don't move.** A default dashboard draws exactly as in
  0.3.0.

## 4. `labels` on `createDashboard` (amends RFC 0004 §7 and Decision 57)

Two metrics on one dashboard should not both be titled "Metric".

*Implemented by: dashboard-labels.*

The create-dashboard story recorded this as a proposed amendment and did not
build it. Today a host sets the `label` attribute on each tile it finds in
`dashboard.grid`.

```ts
interface DashboardOptions {
  // … every option of RFC 0004 §7, unchanged
  /** A label per item id, written as the tile's label attribute when its child is created. */
  labels?: Record<string, string>
}
```

- **When it applies.** Every time the dashboard creates a child: at creation,
  for a `ts-add-request`, for a layout restored by `persist`, and for an item
  whose type a late `defineWidget()` makes known.
- **What counts.** Own keys only. A value that is not a non-empty string is
  ignored with one development warning. An id no profile holds is kept for a
  later add, and warns unless `persist` is set, exactly as `data` does.
- **Precedence** (Decision 85). A tile's effective label is resolved as today:
  the `label` attribute, then `t('widget.<key>.label')`, then the spec's label.
  `labels` writes the attribute, so it wins over the widget's own `messages`,
  its grid's `messages`, `configure()` and `EN`. That is the intent: a per-tile
  title is host data about this tile, while `messages` is a translation of the
  catalog name. A host that translates passes translated titles in `labels`.
- **Not in `Layout`.** A label in the layout would be saved with it, read back
  from storage, and need a `LAYOUT_VERSION` rule. The layout stays cells and
  types.
- **No setter.** Changing a title later is `el.label = …` on the child, as
  today. A `dashboard.tile(id)` accessor is parked question 5.

**Alternatives.** A function `(item) => string`, which reads the same but is
harder to pass from JSON. A `label` field on `LayoutItem`, rejected above.

**Accessibility.** The label is the tile's heading and starts its accessible
name (ACCESSIBILITY item 1), so distinct titles make heading navigation useful.

**Messages.** None: titles are host data. The pseudo-locale test treats them
as host data.

**Size.** The all-in entry and the CDN files only: an estimated +80 to 150 B
min + gzip.

**Files.** `src/elements/dashboard.js`, `src/elements/index.d.ts`,
`docs/guide/create-dashboard.md`, `test/dashboard.test.mjs`,
`examples/vanilla-json.html` and the API snapshot.

**What the story must show.** A label on the first children, on a child made
for `ts-add-request`, and on a child for a restored layout; a non-string
ignored with one warning; the label wins over `messages` on that tile and not
on another; `destroy()` unchanged.

## 5. Budgets (amends RFC 0004 §10.4 and §12, and Decision 68)

Two things to record and one to decide.

*Implemented by: size-ceilings.*

### 5.1 Rows re-measured during the wave

RFC 0004 Decision 68 set "each widget adds at most 15 kB to the grid",
enforced. Four rows were re-measured under RFC 0003 §25 during the wave, and
`scripts/check-size.mjs` records them:

| Row | Measured (min + gzip) | Budget now | Date | Story |
|---|---|---|---|---|
| `mini-chart` adds to grid | 18,522 B | 20 kB | 26 Oct 2026 | Stage 2 integration of the P2 wave |
| `breakdown` adds to grid | 17,463 B | 19 kB | 26 Oct 2026 | Stage 2 integration |
| `status` adds to grid | 15,460 B | 17 kB | 26 Oct 2026 | Stage 2 integration |
| `feed` adds to grid | 15,365 B | 17 kB | 27 Oct 2026 | `trading-polish` |

**The reason.** The difference a widget adds to the grid includes the shared
core and `widget.js`, which the grid entry alone does not import. Every story
in the wave added its message family to the core `EN` table, and several added
shared base code. So each widget's difference grew without its own code
changing. At `parked-amendments` the first three rows already stood at
18,464 B, 17,412 B and 15,352 B. `type-scale-rollout`, `edit-feedback` and
`security-hardening` then added between 0 and 66 B each. The feed row crossed
15 kB by 5 B when `trading-polish` moved the hidden meta's description into
`widget.js`.

The brief for this RFC named three rows. The fourth, `feed`, was re-measured a
day later, so it is recorded here too.

**Decision 86** asks the maintainer to ratify these four re-measures, which the
orchestrator authorised during integration.

### 5.2 The eleven older rows

Eleven widgets already added more than 15 kB to the grid when Decision 68 was
built. Their rows keep the 15 kB figure but are `warn`, not `enforce`
(`OVER_15` in `check-size.mjs`). Nothing stops them growing.

| Option | What happens |
|---|---|
| (a) Keep them as warnings | They can grow without failing a release, as today |
| (b) Enforce them at 15 kB | `npm run release` fails at once; not workable |
| (c) Enforce a ceiling at the 0.3.0 re-baseline | Each row gets its own enforced figure: its measurement at the tip of the 0.4.0 wave plus 10%, rounded up to the next 0.5 kB, as every entry budget is. 15 kB stays the target for every new widget, and a row that falls under 15 kB returns to it |
| (d) Drop the pair rule for them | Only their entry budgets hold them |

**Recommendation: (c)** (Decision 87). The ceilings stop silent growth, which
is what a budget is for. They follow RFC 0003 §25's own rule, so no figure is
picked by hand. The 15 kB goal stays visible: the row prints it beside the
ceiling.

Indicative ceilings from the 26 Oct 2026 measurements (the story re-measures
and uses its own figures):

| Widget | Measured 26 Oct | Plus 10%, rounded up to 0.5 kB |
|---|---|---|
| `capital-funding` | 17,769 B | 19.5 kB |
| `chart` | 25,035 B | 27 kB |
| `edge-stats` | 16,542 B | 18 kB |
| `equity-curve` | 21,524 B | 23.5 kB |
| `metric` | 15,932 B | 17.5 kB |
| `open-positions` | 18,719 B | 20.5 kB |
| `pnl-calendar` | 18,061 B | 19.5 kB |
| `session-clock` | 16,764 B | 18.5 kB |
| `table` | 16,994 B | 18.5 kB |
| `today-pnl` | 21,342 B | 23 kB |
| `watchlist` | 17,794 B | 19.5 kB |

The ceilings are set after §1, §2 and §3 have landed, so the shared base those
sections grow is inside the measurement.

**Accessibility.** None.

**Size.** Nothing ships. `scripts/check-size.mjs` changes.

**Files.** `scripts/check-size.mjs` only.

## 6. The font default (amends RFC 0002 §6 and RFC 0004 §2.3)

Ratified here. It was approved by the maintainer in chat on 27 Oct 2026 and
shipped in 0.3.0.

*Implemented by: density-and-text-scaling (merged).*

**The decision** (Decision 88, accepted 27 Oct 2026):

- `--ts-font-ui` and `--ts-font-num` place `Arial` before `system-ui`:
  `'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, system-ui, sans-serif`
  for text, and the same after `'Newsreader'` (with `ui-sans-serif` before
  `system-ui`) for figures.
- **Why.** On Linux, `system-ui` is often DejaVu Sans, whose digits are .636 em
  wide against Arial's .556 em, 14% wider. Under the text-spacing overrides at
  390 px, that cut the `S` today-pnl figure and the Wide progress line. Linux
  resolves `Arial` to Liberation Sans, which has Arial's metrics, so a Linux
  page without Geist measures like a Mac or Windows one. Platforms with their
  own UI face (San Francisco, Segoe UI, Roboto) reach it first and are
  unchanged.
- **Presets.** `paper`, `graphite`, `calm` and `signal` restate the same
  stacks, so they follow. `calm`'s figures are `Geist Mono`, a monospace stack,
  so only its text stack moved. `neutral` keeps `system-ui` first, because using
  the system face is its design. `terminal` is monospace throughout. Neither
  changed.
- **The tile heading's label floor** is `min-inline-size: max(6ch, 4.2em)`
  under an `11.25rem` tile. `6ch` alone tracks the face's digit width, so on a
  wide face it took room from the meta, and on a narrow one it kept fewer than
  five letters. The `em` term keeps about five letters whatever the face.
- **The Linux visual baselines** were regenerated with the new stacks in the
  same wave.

**Versioning.** A changed default token value, listed under Changed
(`docs/VERSIONING.md`: "a changed default *value*"). It breaks no contrast
floor.

**Accessibility.** Fewer cuts under text spacing on Linux. No name changes.

**Size.** A few bytes in the token files.

## 7. The four Breaking lines of 0.3.0 (amends `docs/VERSIONING.md`)

For the record: each line checked against the table in
[docs/VERSIONING.md](../VERSIONING.md).

*Implemented by: versioning-rows (the two new table rows only).*

| 0.3.0 Breaking line | VERSIONING row | Verdict |
|---|---|---|
| `widget.clock` and `grid.clock` return a function, never `null` | Attributes and properties: "changing the meaning of one" | **Breaking, correctly.** A host testing for `null` now gets a function |
| Every chart that draws a plot has one tab stop | No row covers tab order. Nearest: "changing a default that changes behaviour a host relied on" (`scrub` defaults to on) | **Breaking, correctly**, but by analogy. A host's keyboard test or focus order changes with no code of its own changing |
| A tile's container is `container: ts-tile / size` | No row covers the tile's CSS contract. "Look and layout" says not API | **Breaking, correctly.** It is more than a look: a host that sets a widget's `height: auto` gets a tile with no height. This is the closest call of the four |
| A layout is read with a cap | Saved layouts: "a change that makes a layout a previous version wrote read differently" | **Breaking, correctly.** A layout of 101 items reads differently |

**None should have been Changed.** All four change behaviour a host could rely
on, and under 0.x saying so is what a minor release owes a host.

One Changed line is worth a note. `ts-profile-change` now fires once the new
layout is on the board, after the crossfade, not as the schedule ticks. The
event keeps its name and detail, so the table calls it Changed. A host that
read the board inside the handler now reads the new layout, which is what it
wanted.

**Two rows the table lacks** (Decision 89). `versioning-rows` adds them:

| Surface | Breaking | Not breaking |
|---|---|---|
| Keyboard and accessibility tree | Adding or removing a tab stop in a default widget; changing a role | Reworded names (Changed); a tab stop that only an opt-in adds |
| The tile's CSS contract | Changing the tile's container type or name; requiring something new of the host's CSS (a definite height) | A new tier rule inside the widget |

**Accessibility, size.** None.

## 8. Market preset sources (amends RFC 0004 §5.3 and Decision 51)

Decision 51 named `cme` and `crypto` among the presets. Neither was built. The
MCX hours were not re-read in 0.3.0.

*Implemented by: preset-sources, once parked question 4 is answered.*

**What `src/core/calendar.js` says today.**

- CME Globex equity index futures and crypto are left out on purpose:
  cmegroup.com answered automated requests with HTTP 403, and no exchange page
  for crypto could be read on 26 Oct 2026. A preset is never written from a
  search snippet or memory.
- `mcx` cites a February 2026 circular checked on 13 Oct 2026. mcxindia.com
  refused every automated request on 26 Oct 2026. A search summary suggested a
  23:45 close that the circular's own table could not be opened to settle, so
  the comment says to confirm 23:55 before relying on it.

**What a source must be** (Decision 90):

1. **The venue's own page or circular**: the exchange that runs the session,
   at an `https://` URL on its own domain. Not a data vendor, a broker, an
   encyclopaedia, a search result or a model's memory.
2. **Read by a person on the `Checked:` date.** Where a site refuses automated
   requests, the maintainer may open it in a browser and paste the wording into
   the story's PR. A human read counts. An automated fetch that failed does not.
3. **Quoted.** The PR quotes the sentence or table row the hours come from.
4. **Specific to the segment.** A CME preset cites the equity index futures
   page, not a general Globex page.
5. **For crypto,** there is no single venue, so a preset would be a definition
   ("every day, all day, UTC"), not an exchange's hours. Whether the library
   ships a definition with no venue behind it is part of parked question 4.

The hours themselves are not proposed here. They wait for the maintainer.

**Accessibility.** None. **Size.** `cme` and `crypto` would add an estimated
150 to 250 B min + gzip to the core when built.

## 9. Process

Three rules for how releases and tests are checked. No library API.

### 9.1 Lint in `npm run release`

`npm run lint` runs in CI as its own job, but `npm run release` does not run it.
A maintainer preparing a release locally can pass every gate and still fail CI.

**Recommendation** (Decision 91): `release` runs `npm run lint` straight after
`npm test`. `release` already needs `npm ci` for its builds, so ESLint is
installed. `npm test` stays install-free.

*Implemented by: release-lint. File: `package.json`.*

### 9.2 The visual job as a required check

The `visual` job runs in the pinned Playwright container, and the Linux
baselines are committed (the font change regenerated them). It can now fail a
PR honestly. Today `master` has no branch protection, so no check is required.

**Recommendation** (Decision 92): the maintainer adds a ruleset (or branch
protection) on `master` that requires `test`, `lint`, `build`, `browser`,
`examples`, `visual` and `coverage`. `wave/*` gets the same rule, so a wave
cannot close red. This is a repository setting, and only the maintainer can
change it (RFC 0004 §9.1).

### 9.3 No wall-clock assertions in unit tests

Unit tests run on shared runners. A pause for garbage collection makes a time
limit fail with no fault in the code.

**The rule** (Decision 93): a unit test never asserts how long something took.
It proves cost by counting work: the reads a `Proxy` sees, the calls a stub
records, or the size of the result. Timing belongs in a benchmark script that
reports and never fails CI.

**The sites today:**

| File | Assertion | Replacement |
|---|---|---|
| `test/layout-fuzz.test.mjs` | Each `readLayout` call under `CEILING_MS` (5 ms), retried twice | Count property reads through a `Proxy` input; assert a bound linear in the capped size |
| `test/layout-fuzz.test.mjs` | A sparse list of 5e7 entries under 50 ms; a strip of a million entries under 50 ms | A `Proxy` array that counts index reads; assert at most the cap plus one |
| `test/series-chart.test.mjs` | A monthly series with a point one second apart under 500 ms | Assert the number of bars and ticks drawn, which is what a slow path would inflate |

`test/ticker.test.mjs` busy-waits 14 ms to make a draw exceed the 12 ms time
slice. It asserts counts, not time, so the rule allows it. A follow-up may give
the slicer an injected clock so the test needs no busy-wait.

*Implemented by: wall-clock-tests, shipped in 0.3.1 (PR #72). Files: the three test files above, and
`docs/WORKFLOW.md`'s Checks section (one line stating the rule).*

## 10. What changes for existing hosts

0.3.0 hosts see these differences once the sections above ship.

| Change | Was | Now | Section |
|---|---|---|---|
| A click on data in an `href` or `activatable` tile | Opens the tile | Scrubs, focuses, selects, scrolls or does nothing; the header and empty space open it | §1 |
| An activatable label's look | Mixed case, no tracking | The label tokens, like every other label | §1.5 |
| `<ts-mini-chart>` actions | `timeframe` and `retry` | Also `instrument`, opt-in | §2.1 |
| Every widget's actions | `retry` and `open` | Also `expand`, opt-in | §2.3 |
| Tiles under a reader's text spacing | Three tiles cut at tablet widths | Secondary rows give way; the grid detects the spacing | §3 |
| `createDashboard` | No per-tile titles | `labels` | §4 |
| Eleven "adds to grid" rows | Warnings | Enforced ceilings | §5.2 |

Only the first row changes existing behaviour, and the changelog lists it
under Breaking with a line telling the host what to do: "to open the tile from
a click anywhere, listen for `click` on the tile yourself". The rest is
additive or Changed.

## 11. Next

Not specified here, by name only: a hidden table of the mini chart's last bars
(RFC 0004 §6.5), `instrument` on `<ts-chart>`, height tiers for the built-in
widgets the density story listed, and the manual assistive-technology pass.

## 12. Decisions

This RFC's own decisions, numbered on from RFC 0004's 76. The recommended
option is marked **Recommended**. Reply per row, or "go with the
recommendations". The maintainer approved the RFC on 27 Oct 2026, accepting
every recommended option.

| # | Question | Options | Status |
|---|---|---|---|
| 77 | What is the click target of an `activatable` tile? (§1; amends RFC 0003 §7; issue #68) | **Recommended:** (b) lift the data surfaces listed in §1.2 above the overlay, so the header and empty space open the tile and a click on data scrubs, focuses, selects, scrolls or does nothing. The label button is unchanged for the keyboard.<br>Alternative: (a) document today's behaviour.<br>Alternative: (c) `activatable="label"` opt-in narrowing. | **Accepted** (27 Oct 2026): the recommended option |
| 78 | Do `href` tiles narrow the same way? (§1.2) | **Recommended:** yes; the two share the stretched link, and a link that fires on a chart click has the same fault.<br>Alternative: narrow only `activatable`, so `href` tiles navigate from anywhere. | **Accepted** (27 Oct 2026): the recommended option |
| 79 | How is §1 listed in the changelog? (§10) | **Recommended:** under Breaking, with a do-instead line, because it changes which clicks fire `open` (VERSIONING: "changing the meaning of" an attribute).<br>Alternative: under Fixed, since the docs already promised the narrower target. | **Accepted** (27 Oct 2026): the recommended option |
| 80 | How does a mini chart offer instruments? (§2.1, §2.2; issue #69) | **Recommended:** `instruments` and `instrumentId` per chart, a native `<select>` in the chart's own row, named "Instrument" (or "Instrument, chart n of 2" at XL), firing `{ action: 'instrument', id, value }` when `actions` includes `'instrument'`.<br>Alternative: a menu button, themed, at an estimated 1.5 to 2.5 kB.<br>Alternative: the picker in the tile header, which holds one picker only, so XL could switch only its first chart. | **Accepted** (27 Oct 2026): the recommended option |
| 81 | Is `expand` a base-widget action? (§2.3) | **Recommended:** yes: any tile opts in with `actions`, the base renders "Expand {label}" in the shared header, and the host decides what expand means.<br>Alternative: a mini-chart action only.<br>Alternative: no button; hosts use the `actions` slot. | **Accepted** (27 Oct 2026): the recommended option |
| 82 | Which sizes show the expand button? (§2.3) | **Recommended:** every size but `S`.<br>Alternative: every size, `S` included, at the cost of label room on a phone.<br>Alternative: only sizes of two columns or more. | **Accepted** (27 Oct 2026): the recommended option |
| 83 | How do tiles learn that the reader widened the text? (§3) | **Recommended:** (a) the grid detects it and writes `data-ts-spacing="wide"` on its children, with `text-spacing="auto \| normal \| wide"` on the grid and the data attribute settable by hosts on standalone widgets.<br>Alternative: (b) a host attribute only.<br>Alternative: (c) a custom property and style queries, which Safari 16.4 lacks.<br>Alternative: (d) no signal; each widget measures its own text. | **Accepted** (27 Oct 2026): the recommended option |
| 84 | What does detection read, and when? (§3.3) | **Recommended:** the grid's computed `letter-spacing` (at least `.1em`) or `word-spacing` (at least `.14em`), never `line-height`, on every measure.<br>Alternative: all four properties, which marks every page with `body { line-height: 1.5 }`.<br>Alternative: also re-check on a timer (parked question 3). | **Accepted** (27 Oct 2026): the recommended option |
| 85 | What is `labels` on `createDashboard`, and what wins? (§4) | **Recommended:** `labels?: Record<string, string>`, written as each child's `label` attribute whenever the dashboard creates it, so it wins over every `messages` source for that tile.<br>Alternative: a function `(item) => string`.<br>Alternative: a `label` field on `LayoutItem`, saved with the layout. | **Accepted** (27 Oct 2026): the recommended option |
| 86 | Are the four re-measured "adds to grid" rows ratified? (§5.1) | **Recommended:** yes: `mini-chart` 20 kB, `breakdown` 19 kB, `status` 17 kB (26 Oct 2026) and `feed` 17 kB (27 Oct 2026), each its measurement plus 10% under RFC 0003 §25.<br>Alternative: return them to 15 kB as warnings, like the eleven older rows. | **Accepted** (27 Oct 2026): the recommended option |
| 87 | What happens to the eleven "adds to grid" rows that only warn? (§5.2) | **Recommended:** (c) enforced ceilings at their measurement plus 10%, set after §1 to §3 land; 15 kB stays the target for new widgets.<br>Alternative: (a) keep them as warnings.<br>Alternative: (d) drop the pair rule for them. | **Accepted** (27 Oct 2026): the recommended option |
| 88 | The font default: `Arial` before `system-ui` in `--ts-font-ui` and `--ts-font-num`, followed by `paper`, `graphite`, `calm` and `signal`, not `neutral` or `terminal`; the label floor `max(6ch, 4.2em)`. (§6) | As shipped in 0.3.0. | **Accepted** (27 Oct 2026), in chat; this row records it |
| 89 | Should `docs/VERSIONING.md` gain rows for the keyboard and accessibility tree, and for the tile's CSS contract? (§7) | **Recommended:** yes, as §7's table, so the next tab stop or container change is judged by a row, not by analogy.<br>Alternative: leave the table as it is. | **Accepted** (27 Oct 2026): the recommended option |
| 90 | What counts as a source for a market preset? (§8) | **Recommended:** the five rules of §8: the venue's own page, read by a person on the `Checked:` date, quoted in the PR, specific to the segment; a human read in a browser counts where automated requests are refused.<br>Alternative: allow a broker's or vendor's published hours where the venue's page cannot be read. | **Accepted** (27 Oct 2026): the recommended option |
| 91 | Does `npm run release` run lint? (§9.1) | **Recommended:** yes, after `npm test`.<br>Alternative: no; CI alone runs it. | **Accepted** (27 Oct 2026): the recommended option |
| 92 | Is the `visual` job a required check? (§9.2) | **Recommended:** yes, with `test`, `lint`, `build`, `browser`, `examples` and `coverage`, through a ruleset on `master` and `wave/*` that the maintainer sets.<br>Alternative: required on `master` only.<br>Alternative: stay advisory. | **Accepted** (27 Oct 2026): the recommended option |
| 93 | May a unit test assert elapsed time? (§9.3) | **Recommended:** no; tests count work, and timing lives in a benchmark that never fails CI. `wall-clock-tests` converts the three sites.<br>Alternative: keep the limits and widen them. | **Accepted** (27 Oct 2026): the recommended option |
| 94 | Which versions carry this RFC? | **Recommended:** `link-label-style` and `wall-clock-tests` in a **0.3.1** patch (no API, no break); §1 to §5 in **0.4.0**, since §1 is listed as Breaking.<br>Alternative: everything in 0.4.0. | **Accepted** (27 Oct 2026): the recommended option; `link-label-style` and `wall-clock-tests` shipped in 0.3.1 (PR #70 as `activatable-label`, PR #72) |

## 13. Points this RFC settles that no decision covers

Each was a proposal that the RFC's approval (27 Oct 2026) accepted.

1. **The lifted surfaces are marked by one class, `lift`**, shared by every
   widget and offered to custom widgets (§1.2).
2. **The label style fix is a bug fix, not an API change**, and needs no row
   (§1.5).
3. **The instrument picker writes options with the DOM**, never markup, since
   labels are host data (§2.1).
4. **The picker shows the reader's choice until the next data**, and reverts at
   once only when a listener cancels the action (§2.1).
5. **The expand icon is an inline SVG**, not a glyph, so it does not depend on
   a font having U+2922 (§2.3).
6. **`data-ts-spacing` is public**: hosts may set it on a standalone widget
   (§3.3).
7. **`labels` keeps unknown ids for a later add**, as `data` does (§4).
8. **The `feed` row is recorded with the three rows the brief named** (§5.1).
9. **This RFC proposes no preset hours** (§8).

## 14. Parked questions

For the maintainer. None blocks a section unless the section says so.

1. **A label-only target.** Should `activatable="label"` exist for a host that
   wants only the label to open a tile with no data? Not needed for #68 under
   Decision 77.
2. **A collapse state for `expand`.** Should the base offer `expanded` (an
   attribute and property) that renames the button "Collapse {label}" while the
   host shows the tile full screen? It needs one more key (`action.collapse`)
   and a rule for who sets it.
3. **Live re-detection of text spacing.** Should the grid also re-check on the
   shared whole-second timer, so a bookmarklet takes effect without a resize? It
   costs one style read a second while the page is visible.
4. **The CME, crypto and MCX hours.** Which page does the maintainer accept for
   CME Globex equity index futures, will he read cmegroup.com and mcxindia.com
   in a browser and paste the wording, and does a crypto preset ship as a
   definition (every day, all day, UTC) with no venue behind it? Until then
   `cme` and `crypto` stay out of `presets` and `mcx` keeps its 13 Oct 2026
   citation and its warning about 23:55.
5. **A tile accessor on the dashboard.** Should `Dashboard` gain `tile(id)`,
   returning the child element, so a host can change a title or read a tile
   without querying `dashboard.grid`?
6. **The 15 kB target.** With eleven ceilings in place, is 15 kB still the right
   figure for a new widget's difference, or should it follow the shared core?
