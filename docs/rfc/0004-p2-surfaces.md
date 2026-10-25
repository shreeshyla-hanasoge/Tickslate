# RFC 0004 — The P2 surfaces: chart scrubbing, density, edit feedback, more widgets, market presets, the mini chart, createDashboard, hardening, quality extras and the parked amendments

| | |
|---|---|
| Status | **Proposed** (25 Oct 2026). Nothing here is built until the maintainer approves it in chat. |
| Written | 25 Oct 2026 |
| Amends | [RFC 0003](0003-p1-surfaces.md) §2.1, §3, §4.1, §5.2, §5.4, §5.5, §7.1, §12, §15, §16, §18.2, §22.2, §25, §26 and §29 (point 1); [RFC 0002](0002-integration-and-ux.md) §4.4, §5, §6 and §9; [RFC 0001](0001-api.md) §4 (`readLayout`), §7, §8.5.9 and §13 |
| Covers | Every public name the nine P2 stories add: chart scrubbing, exact values and data tables; compact density and the rem type scale; resize feedback, a first-run hint and calm profile switches; `<ts-breakdown>`, `<ts-status>` and `<ts-feed>`; session breaks, market presets and holiday coverage; `<ts-mini-chart>` through optional Emberwick; `createDashboard()`; layout caps, the XSS spec, lint and the supply chain; the API snapshot, visual baselines, the versioning policy and coverage. It also settles the four amendments RFC 0003's build left parked, and four rough edges the first trading dashboard found (table column widths, `persist` defaults, narrow headers, a host-level clock) |
| Sources | RFC 0001, RFC 0002, RFC 0003, [docs/ACCESSIBILITY.md](../ACCESSIBILITY.md), [docs/WORKFLOW.md](../WORKFLOW.md), the nine P2 stories of the build plan, and the source of the merged P1 work. It takes no new measurements. |
| Approval | Pending. Reply per decision row in §15, or "go with the recommendations". |

RFC 0001, RFC 0002 and RFC 0003 stay the contract for everything this RFC doesn't
mention, and none of them is edited: where this RFC changes one, the section
says "amends RFC 000x §y" and the change lives here. Where this RFC and an
earlier one differ, this RFC wins, and RFC 0003's §27 ("Next") points here.

Every P2 story in the build plan implements a part of this RFC, so the names
below are the ones those stories use. Each section says which story implements
it, which files that story owns, and which of those files another story also
touches, so two stories never edit one file at the same time.

**How P2 stories use this RFC**

- **They implement it and never edit it.** A story that finds a name, a
  signature or a behaviour that can't be built as written records the difference
  in its changes fragment (`changes/<story-id>.md`, under `### Internal`) and
  builds the nearest thing that works, as RFC 0003 asks. It does not touch this
  file.
- **Later amendments go through one documentation story**, which collects the
  differences the stories found, applies them in a single reviewed change and
  asks for approval once.
- **A story's file list is the boundary.** Where this RFC needs a file the story
  doesn't own, the section says so under *Files and order*, and the two stories
  are built in the order given there.
- **No story starts before this RFC is approved.** Each story's brief says
  "specify it in the doc story first"; this is that story.

**Conventions in this RFC**

- Signatures are TypeScript, as they will appear in `src/core/index.d.ts`,
  `src/elements/index.d.ts`, `src/elements/grid.d.ts` and `src/elements/widget.d.ts`.
- *Internal* marks a module or helper that the stories build and test but that
  no package entry exports. It is written down so stories agree on it; it can
  change without an RFC.
- Every figure in this RFC is made up: the example values, the thresholds
  marked *proposed*, and the caps. The market presets of §5 name no figures at
  all, on purpose (§5.3).
- English strings quoted here are the `EN` defaults of RFC 0003 §1. Each message
  key a section adds is listed under its *Messages*, by family and parameter
  name, and every one is overridable. The pseudo-locale and coverage tests of
  RFC 0003 §1.3 apply to every key.
- A decision is written **Decision n** and lives in the table of §15. The
  recommended option is the one the section's text describes.

**Which story builds which section**

| Section | Story |
|---|---|
| §1 Chart scrubbing, exact values and data tables | `chart-scrub-and-exact-values` |
| §2 Compact density and the rem type scale | `density-and-text-scaling` |
| §3 Resize feedback, a first-run hint and calm profile switches | `edit-feedback` |
| §4 `<ts-breakdown>`, `<ts-status>` and `<ts-feed>` | `more-generic-widgets` |
| §5 Session breaks, market presets and holiday coverage | `market-presets-and-breaks` |
| §6 `<ts-mini-chart>` through optional Emberwick | `mini-chart` |
| §7 `createDashboard()` | `create-dashboard` |
| §8 Hostile-input caps, the XSS spec, lint and the supply chain | `security-hardening` |
| §9 The API snapshot, visual baselines, versioning and coverage | `quality-extras` |
| §10 The four parked amendments | `rfc-0004` (this RFC) defines them; the stories named in each row build them |
| §11 What the first trading dashboard found | `trading-polish` (a new story, added to the board on approval) |
| §12 Budgets | Each story that adds code, as RFC 0003 §25 says |

**Files more than one P2 story touches**

The stories can run in parallel except where a file is shared. For each shared
file, the first story in the *order* column goes first and the next rebases on
it. Everything else is exclusive to one story.

| File | Stories, in build order | What each adds |
|---|---|---|
| `src/core/messages.js` and the `Messages` interface in `src/core/index.d.ts` | Any story that adds keys: they merge in the order of the sections below, each appending **one contiguous block** under its own `// ── <family> ──` comment and editing nothing else | The keys under each section's *Messages* |
| `src/core/index.d.ts` (other than `Messages`) | `market-presets-and-breaks`, `more-generic-widgets` (catalog types only), `security-hardening`, `trading-polish` | Calendar types, the catalog entries' types, `LayoutIssue` codes, `configure`'s `clock` |
| `src/elements/chart.js` | `chart-scrub-and-exact-values`, then `more-generic-widgets` | `nearestPoint` and `plotFraction`, then `arcPaths` (appended at the end of the file) |
| `src/elements/today-pnl.js`, `src/elements/equity-curve.js` | `chart-scrub-and-exact-values`, then `density-and-text-scaling` | Scrub markup and tables, then height thresholds and rem sizes |
| `src/elements/widget.js` | `density-and-text-scaling`, then `trading-polish` | The `.tile` container and the rem type scale, then the narrow-header rules |
| `src/elements/grid.js`, `src/elements/grid.d.ts` | `density-and-text-scaling`, then `edit-feedback`, then `trading-polish` | The `density` attribute, then the badge, the hint and the profile toast, then the persist capture and the configured clock |
| `src/themes/tokens.css`, `src/elements/default-tokens.js` | `density-and-text-scaling`, then the parked `--ts-num-width` (§10.3, built by `density-and-text-scaling` too) | Density and type tokens |
| `src/elements/index.js`, `src/elements/index.d.ts` | `more-generic-widgets`, then `create-dashboard` (`index.js` too), then `trading-polish` (`index.d.ts` only) | Three new classes, then `createDashboard`, then `TableColumn.width` |
| `package.json` | `quality-extras`, then `security-hardening` | `coverage` and `api` scripts, then `lint` and its devDependencies |
| `.github/workflows/ci.yml` | `quality-extras`, then `security-hardening` | Visual, API and coverage jobs, then SHA-pinned `uses:` lines and a lint job |
| `.github/workflows/attribution.yml`, `.github/workflows/pages.yml` | `security-hardening` | SHA-pinned `uses:` lines only |
| `src/core/calendar.js` | `market-presets-and-breaks`, then `trading-polish` (one line: the default of `now`) | Breaks, presets and coverage, then the configured clock |
| `scripts/check-size.mjs` | Every story that adds an entry or moves a budget | One budget row each, by RFC 0003 §25's rule |

`security-hardening` and `quality-extras` both depend on `browser-tests`, so
nothing else stops them running together; the table above is why they must not.

## 1. Chart scrubbing, exact values and data tables (amends RFC 0003 §7.1 and §15)

Hover or drag across a chart to read a point, see the full amount behind a
compact figure, and get the data as a table with a screen reader. RFC 0003 §7.1
left "hover, a crosshair and exact-value read-outs" to a later story; this is it.

*Implemented by: chart-scrub-and-exact-values.*

### 1.1 Geometry (Internal, `src/elements/chart.js`)

Pure, loops and no spreads, like the rest of `chart.js`:

```ts
// Internal (src/elements/chart.js)
/**
 * The point whose x is nearest the position, or null for no points or a
 * position that isn't a number. `xFraction` is a share of the x domain: 0 is
 * the first x of the domain and 1 the last, and a value outside 0..1 is clamped.
 * `points` are ascending by x, as the charts draw them. Ties go to the earlier point.
 */
function nearestPoint(
  points: ReadonlyArray<{ x: number; y: number }>,
  xFraction: number,
  o?: { domain?: [number, number] },     // default: the first and last x of `points`
): { index: number; x: number; y: number } | null

/**
 * Turns a pointer's share of the drawing box (0 at its start edge, 1 at its end) into a share of the
 * x domain, undoing the inset `pad` the drawing keeps inside the viewBox (`linePaths`, RFC 0003 §3.1).
 */
function plotFraction(boxFraction: number, o: { width: number; pad: number }): number
```

- `nearestPoint` is a binary search, `O(log n)`, and never allocates a
  collection. It reads x as given: the caller has already mapped a category
  axis to band centres (RFC 0003 §15), so the same function serves time, number
  and category charts.
- A chart drawn on a window domain (Today's P&L's session window) passes
  `domain`, so the right edge of the box means the end of the window and not the
  last reading.

### 1.2 What each chart provides

Each chart's view model gains one field, `scrub`, which is **numbers only**:

```ts
// Internal. One per chart that draws a plot.
interface ScrubData {
  xs: number[]                    // data x of each drawn point, ascending
  px: number[]                    // the same points' x in the drawing's viewBox units
  series: Array<{
    name: string
    index: number                 // 1–6 picks --ts-series-<n>; 0 for a chart with one unnamed line
    ys: number[]                  // value of each point (NaN where this series has none)
    py: number[]                  // the point's y in viewBox units
  }>
  domain: [number, number]
}

/** Formats one point: the text the readout and the table share. Pure; `fmt` and `t` come from the context. */
function readoutAt(scrub: ScrubData, index: number, ctx: ViewModelContext): {
  label: string                   // 'Mon 12 Oct', '09:45', or a category
  items: Array<{ name: string; value: string; tone: 'pos' | 'neg' | 'mut' }>
}
```

- **The model keeps numbers, the element formats on demand.** The model never
  formats a string per point: a Today's P&L view with hundreds of drawn points
  would pay for text nobody reads. `readoutAt` runs for the point under the
  pointer and for the hidden table's rows.
- **Drawn points only.** After downsampling (RFC 0003 §23) the model keeps at
  most `2 × width` points, and the scrub reads those. The low, high and last
  values are exact there, so the readout never contradicts the headline.
- **Today's P&L, M:** `label` is `fmt.time(x)`, one item `Net` with a signed
  money value (`pnl.net`). **Equity curve, M and XL:** `label` is `fmt.date(x)`,
  items `Equity` (the running value) and `Day` (that day's signed result). **`<ts-chart>`
  (every variant that draws a plot):** `label` is the x as the axis shows it, one
  item per series (up to six). A series with no point at the snapped x reads
  `—` (`scrub.none`). With several series the pointer snaps to the x of the one
  with the most points, and each other series shows its own nearest point.

### 1.3 The overlay

Inside each plot box (`part="chart"`) the template gains one static block,
present in every variant that draws a plot:

```html
<div class="scrub" part="scrub" hidden>
  <i class="sr" part="scrub-rule"></i>
  <i class="sd" part="scrub-dot"></i>   <!-- one per series, up to six -->
  <span class="so" part="scrub-readout"></span>
</div>
```

- **It writes only transforms and text.** The rule and each dot move with
  `element.style.transform = 'translate(…)'` (the CSSOM, which strict CSP allows,
  RFC 0003 §14); the readout is `textContent` on child nodes. No layout
  property is written while scrubbing, so a pointer move costs no reflow.
- **Rule, dot, readout.** The rule is a 1 px vertical line in `--ts-axis`. Each
  dot is a circle in its series' colour (`--ts-series-<n>`, `--ts-ink` for a
  single unnamed line) with a `--ts-surface` ring. The readout is a small label
  in `--ts-surface-2` with `--ts-ink` text (ACCESSIBILITY item 14), placed
  over the plot on the side away from the rule so it never covers the dot, and
  clamped to the box. Its first line is the `label`, then one `name value` pair per
  series, all in `--ts-ink` (no coloured text sits on `--ts-surface-2`).
- **Signs and arrows.** A signed value carries `+` or `−` and an `aria-hidden`
  ▲ or ▼ (ACCESSIBILITY item 5). The dot's shape is a circle for every series;
  the series are told apart in the readout by their names, not by colour alone.
- **Forced colours.** The rule uses `CanvasText`, the dots `Highlight`, and the
  readout `ButtonFace` with `CanvasText` text, inside the existing
  `@media (forced-colors: active)` blocks (RFC 0003 §5.5; the keyword list is
  settled in §10.1).
- **Motion.** The overlay has no transition at all, so there is nothing for
  `prefers-reduced-motion` to switch off.
- **Hidden** (`hidden` attribute) whenever nothing is being scrubbed.

### 1.4 Pointer, touch and keyboard

```ts
class TsWidget {
  /**
   * Attribute and property on a widget or a <ts-grid>: 'off' turns scrubbing off.
   * Resolution as for `flash` (RFC 0003 §6.3): the widget's own, then the nearest
   * <ts-grid>'s, then on. Anything other than 'off' is on. The grid needs no code
   * for it: the widget reads the grid's plain attribute when it needs the answer.
   */
  scrub: 'on' | 'off' | null
}
```

- **Pointer.** On a fine pointer (`pointerType` `mouse` or `pen`) the readout
  follows `pointermove` over the plot and hides on `pointerleave`. On touch the
  readout follows a drag that starts on the plot and hides at `pointerup` or
  `pointercancel`. The plot sets `touch-action: pan-y`, so a vertical swipe still
  scrolls the page and only a horizontal drag scrubs. Pointer handlers are
  coalesced to one write per animation frame.
- **Keyboard.** The plot has one tab stop: a transparent control above the
  drawing with `role="slider"` (Decision 40). Left and Right move one point, Page
  Up and Page Down ten, Home and End jump to the first and last, and Escape
  hides the readout and keeps focus. Arrow keys always mean "earlier" and
  "later", because time runs left to right in every locale (RFC 0003 §5.5). On
  focus the readout shows the **last** point.
- **No live region.** The slider's `aria-valuenow` is the point's index,
  `aria-valuemin` 0, `aria-valuemax` the last index, and `aria-valuetext` the
  readout's text. Assistive technology reads a changed `aria-valuetext` of the
  focused control by itself; nothing in the widget is `aria-live` or
  `role="status"` (ACCESSIBILITY item 18). A ticking chart never speaks.
- **Off while editing.** Every handler checks the closest `<ts-grid>`'s
  `editing` state, as RFC 0003 §7 does, and does nothing while it is true: the
  overlay stays hidden, the slider takes `tabindex="-1"` and `aria-disabled="true"`,
  and a long press on a chart still starts the drag. Leaving edit mode restores it.
- **Where it doesn't exist.** No overlay and no tab stop appear in the loading,
  empty or error views, for a chart with fewer than two points, or with `scrub="off"`.
- **With selection.** A `<ts-chart>` that opted in to `actions = ['select']`
  (RFC 0003 §7.1) keeps its list of focusable points; the scrubber is a separate
  tab stop before it and fires no event. Scrubbing and selecting never share a key.

### 1.5 Exact values

When `fmt.fit` compacts a headline, the full value is one hover away.

- **The model returns `headlineTitle`.** In `todayPnlModel`, `equityCurveModel`
  and `metricModel`, `headlineTitle` is the full-form string (`fmt.money(value, …)`
  with the same options and `sign` as the headline) **when `fmt.fit` returned
  something different from it**, and `''` otherwise. No change to `fmt.fit`.
- **The element sets `title`** on the headline value node (`part="value"`) with
  `setAttribute('title', …)` and removes it when `headlineTitle` is empty; it is
  written only when it changes. The title goes on the value node and not the
  widget host (Decision 42), so it appears over the number and not over the
  whole tile.
- **The accessible name never compacts.** The tile's `ariaLabel` already states
  the headline; the story verifies it uses the full form whenever the visible text
  is compact, and fixes the model if not. A `title` is a pointer convenience;
  assistive technology gets the full value from the name.
- Edge stats and capital funding also call `fmt.fit` but belong to stories that
  have merged. They are a follow-up, not part of this story's boundary.

### 1.6 The hidden table of recent points

The equity curve, Today's P&L at M and `<ts-chart>` each gain a visually hidden
`<table>` in the plot box:

- **Content.** A `<caption>` (the chart's `ariaLabel`), a `<thead>` with one
  column for the x label and one per series, and a `<tbody>` of the **last 12**
  drawn points, **newest last** (Decision 41), each cell `readoutAt`'s text.
- **Markup.** `class="visually-hidden"` (the shared rule, not `hidden` or
  `display: none`, so it stays in the accessibility tree), `<th scope="col">` and
  `<th scope="row">`. All text is `textContent`.
- **Updates in place.** Rows are keyed by x through `rows.js` (RFC 0003 §16):
  a new reading inserts one row and drops the oldest, and a changed value
  writes one cell. A tick is a handful of writes, and focus inside the table
  (a screen-reader cursor) is not lost.
- **Not announced.** The table is read when the user goes to it. It has no live
  region, and it is the screen-reader route to the data: the plot itself stays
  one `role="img"` with its summary (RFC 0003 §5.5).
- **`<ts-chart>`'s existing hidden `vals` list** (the last value of each series)
  is replaced by this table, so the same numbers are not read twice. The story
  keeps the `vals` node only if a current test needs it, and says so.
- **Sizes.** Today's P&L at S and Wide has no plot and no table. The equity
  curve has the table at every variant that draws a plot.

### 1.7 Messages

| Family | Keys | Parameters |
|---|---|---|
| `scrub.*` | `scrub.slider` ("{label}, read point by point"), `scrub.valueText` ("{label}: {values}"), `scrub.none` ("—"), `scrub.tableX` ("Time"), `scrub.tableDate` ("Date"), `scrub.tableCategory` ("Category"), `scrub.tableCaption` ("{label}, last {count} points") with plural forms `scrub.tableCaption.one` and `.other` | `label`, `values`, `count` |

`scrub.valueText` joins the items with the locale's list separator through
`Intl.ListFormat` (RFC 0003 §8), so the join is not a message.

### 1.8 Accessibility

ACCESSIBILITY items 2, 5, 8, 9, 10, 15, 17 and 18 apply and are tested: the plot
is still one image, the slider is a real control with a name and a value text,
the table has headers, targets stay 44 px on coarse pointers (the slider covers
the plot), focus is visible (`outline: 2px solid var(--ts-focus)` on the plot,
not on the transparent control alone), nothing moves under reduced motion, and
nothing is `aria-live`.

### 1.9 Files and order

Owned by the story, as in its JSON: `src/elements/chart.js`, `src/elements/today-pnl.js`,
`src/elements/equity-curve.js`, `src/elements/series-chart.js`, `src/elements/metric.js`
and `test/chart.test.mjs`. **One addition, owned by this story alone:**
`src/elements/scrub.js` (Internal), holding the pointer, touch and keyboard binding
all three charts share, so it is written once. The story also adds its
messages block to `src/core/messages.js` and `src/core/index.d.ts`, and its
doc lines to `docs/widgets/ts-today-pnl.md`, `ts-equity-curve.md` and `ts-chart.md`.
It builds **before** `density-and-text-scaling` (shared widget files) and
**before** `more-generic-widgets` (shared `chart.js`); see the table above.

### 1.10 Size

The binding module and the overlay are shared, so the cost lands in the three
chart entries, not three times over. The story reports the move of `chart`,
`today-pnl` and `equity-curve`, and `grid + widget` rows. If an entry would pass
its enforced budget it stops and reports; it does not raise the figure
(RFC 0003 §25).

### 1.11 What the story must show

- `nearestPoint` and `plotFraction` are tested: first and last points, a
  position between two points, a tie, a clamped position, one point, no points,
  `NaN`, unsorted-by-mistake input not looping, a window `domain`, and 100,000
  points under 5 ms for 1,000 lookups.
- `readoutAt` for each chart: signs, a true minus, locale formatting
  (`en-IN` and `de-DE`), a missing series value, and a category axis.
- A fake-DOM test: a pointer move writes `transform` and `textContent` and
  nothing else; `pointerleave` hides; the handlers do nothing while the
  closest grid is `editing`; keys move the index and set `aria-valuetext`; no
  node in any chart has `aria-live` or `role="status"`.
- `headlineTitle` is `''` for a short value and the full string for a compacted
  one, in three widgets and two locales.
- The table has `caption`, `th scope`, at most 12 rows, inserts one row per new
  reading, and writes one cell for one changed value (write counts).
- Browser (by hand, with screenshots at 390 and 1280 px, light and dark): scrub
  with a mouse, with touch emulation and with the keyboard; the readout stays
  inside the box at both edges; `scrub="off"` removes the tab stop.

## 2. Compact density and the rem type scale (amends RFC 0002 §6 and RFC 0003 §5.4)

More tiles on a screen for a power user, and text that follows the reader's
font-size setting without clipping.

*Implemented by: density-and-text-scaling.*

### 2.1 The `density` attribute

```html
<ts-grid density="compact">…</ts-grid>
```

```ts
class TsGrid {
  /** Attribute and property. 'comfortable' (the default) or 'compact'. Anything else is 'comfortable', with one development warning. Setting it re-measures. */
  density: 'comfortable' | 'compact'
}
```

| Token | `comfortable` (today) | `compact` |
|---|---|---|
| `--ts-row` | `150px` | `120px` |
| `--ts-pad` | `18px` (`16px` in the dark designs) | `12px` |
| `--ts-gap` | `16px` | `10px` |

- **Applied by the grid, with zero specificity above the host.** The grid's own
  CSS declares the three tokens under `:host([density="compact"])`. A rule in
  the host's stylesheet, such as `ts-grid { --ts-row: 140px }`, therefore still
  wins (outer styles beat `:host` rules), and a host that sets its own
  `--ts-pad` keeps it.
- **For elements outside a grid** (a widget in the host's own CSS grid) the same
  three values are declared in `tokens.css` and `default-tokens.js` under
  `:where([data-ts-density="compact"])`, and the sync test keeps the two equal.
  The attribute name differs because those files already use `data-ts-theme`
  and `data-ts-palette` for "set on any element", while `density` on the grid
  is a behaviour of the grid, like `locale` (Decision 43).
- **Phones keep their own rows.** At 2 columns the grid reads `--ts-row-compact`
  and `--ts-gap-compact` (RFC 0001 §4.1), which are already tight, so
  `density="compact"` changes only `--ts-pad` there. A phone layout does not
  shrink twice.
- **The geometry follows.** `_measure` reads the tokens as it does today, so
  placement, drag targets and the saved layout are unchanged: a layout is cells,
  not pixels.
- The attribute is observed, and docs/theming.md lists it with the tokens.

### 2.2 Tiles are size containers

Today the tile is `container-type: inline-size` (`widget.js`), so widgets answer
the tile's **width**. Compact rows make tiles short, so they now also answer its
**height**.

- The tile root becomes `container: ts-tile / size`. This is safe because a
  tile always has a definite height: a grid sets it inline, and
  `standaloneCss()` gives a standalone widget `rows × --ts-row` plus the gaps. A
  host that overrides a widget's `height` to `auto` loses that guarantee and the
  docs say so.
- **Thresholds are in `rem`, not px.** Custom properties can't be used inside a
  container condition, and a threshold in px would stop meaning "this tile is
  too short for its text" the moment the reader raises the root font size. The
  proposed tiers (Decision 45):

  | Tier | Condition | What hides |
  |---|---|---|
  | snug | `@container ts-tile (max-height: 8.5rem)` | The secondary line under the headline (`.sub`, notes), the second row of a header's meta |
  | tight | `@container ts-tile (max-height: 6.5rem)` | Also the tertiary rows of a list widget (everything after the first two rows) and chart axis labels |

  At a 16 px root, a `150px` comfortable row (9.375 rem) is neither snug nor tight, and a
  `120px` compact row (7.5 rem) is snug but not tight. At a 20 px root the same
  120 px row is 6 rem, so it is tight: the text grew and the tile didn't, and
  the widget gives up its secondary rows before anything clips.
- **What never hides.** The label, the headline figure, its sign and arrow, the
  state of the data (stale, error) and every control stay at every height. Only
  secondary rows go, and a hidden row's content is still available to assistive
  technology through the tile's `ariaLabel`, since the name states the headline
  and its main context.
- **Each widget declares its own tiers** in its `static styles`, naming only the
  classes it owns. The story covers `today-pnl.js` and `equity-curve.js`
  (its file list) and the shared `widget.js` rules (header, `.sub`, `.sm`, `.xs`).
  The other built-in widgets already use width queries and are listed in the
  story's report as follow-ups for height tiers; they must not clip at compact
  density (see 2.4), and any that does is fixed or reported.

### 2.3 The type scale moves to rem

Font sizes become tokens on a rem scale, so a reader's larger default text size
reaches every tile.

| Token | Default (both themes) | Was | Used by |
|---|---|---|---|
| `--ts-text-xs` | `.6875rem` (11 px at a 16 px root) | `10px` | `.xs` and the tick labels |
| `--ts-text-sm` | `.75rem` (12 px) | `11px` | `.sm`, buttons |
| `--ts-text-md` | `.8125rem` (13 px) | `13px` | The tile's base `font` |
| `--ts-text-lg` | `1.0625rem` (17 px) | `17px` | `.md` and its cap |
| `--ts-text-big` | `2.125rem` (34 px) | `34px` | `.big`'s cap |
| `--ts-text-xbig` | `3rem` (48 px) | `48px` | `.xbig`'s cap |
| `--ts-label-size` (existing, RFC 0003 §5.4) | `.6875rem` (11 px) | `10px` | `.lb`, the label |

- **Labels are at least 11 px at a 16 px root**, as the story's acceptance asks;
  that is why the label, `.xs` and `.sm` each rise by one pixel: the order of
  the scale (label ≤ small ≤ base) is kept. This is a visible change for every
  host and is listed in §13 (Decision 44).
- **The container-width figure formulas** (`min(34px, 19cqi)` and its
  siblings) keep their shape and take the token for the cap:
  `min(var(--ts-text-big, 2.125rem), 19cqi)`. The figure still shrinks with the
  tile's width first, so a long value doesn't overflow at a large root size.
- **Row heights stay in px.** The grid's cells are the unit of layout, and a
  layout must not move because a reader changed a font. Hosts that want tiles
  to grow with text set `--ts-row` in rem themselves, and docs/theming.md shows
  how.
- **No other px text remains** in widget CSS. A test scans `static styles` and the
  shared CSS for `font-size: <n>px` and fails on any not in a short allow-list
  of icon glyph sizes, with the reason beside each.
- Each token exists in `tokens.css` and `default-tokens.js` (the sync test keeps
  them equal) and in the docs' token table.

### 2.4 The text-spacing check

WCAG 1.4.12 asks that text still fits when a reader overrides line height to
1.5, paragraph spacing to 2×, letter spacing to .12em and word spacing to .16em.

- **A gallery toggle.** `widgets.html` gains a "Text spacing" switch that adds a
  constructed stylesheet with those four overrides (`!important`) to the
  document **and to the `adoptedStyleSheets` of every open shadow root on the
  page**, since a page rule does not reach inside a widget. It is gallery code
  only; the library ships no such sheet.
- **The pass.** With the switch on, at `density="compact"`, every widget at every
  size, in both themes, shows its label, headline and figures **unclipped**. A
  widget that fails hides secondary rows at the right tier (2.2) or has its text
  wrap onto the next line; it never lets a figure or label be cut by the tile
  edge. The story takes the screenshots and records what it saw.

### 2.5 Messages

None. Density and the scale are CSS and one attribute. The gallery's own toggle
label is gallery text, not library text.

### 2.6 Accessibility

ACCESSIBILITY items 7, 12 and 16 apply: figures keep their width at every size,
CSS stays logical, and no colour value enters widget CSS. Item 8 is untouched:
compact rows don't shrink the 44 px targets at 2 columns, because phones keep
their own rows (2.1), and on desktop a control's `min-height` is unchanged.
The reduced-height tiers must not hide a control the user needs to act on.

### 2.7 Files and order

Owned by the story, as in its JSON: `src/elements/grid.js`, `src/elements/widget.js`,
`src/elements/today-pnl.js`, `src/elements/equity-curve.js`, `src/themes/tokens.css`,
`src/elements/default-tokens.js` and `widgets.html`. It builds **after**
`chart-scrub-and-exact-values` (shared chart widgets) and **before**
`edit-feedback` (shared `grid.js`). It also builds the `--ts-num-width` token of
§10.3 if that is accepted, in the same two token files. Tests: it extends
`test/tokens.test.mjs`, `test/default-tokens.test.mjs` and
`test/tile-chrome.test.mjs` only for the new tokens and the `px` scan, and adds
`test/density.test.mjs`.

### 2.8 Size

CSS only: the `grid` entry grows by one `:host` block and the observed
attribute, and each widget by its height tiers. The story reports the rows that
move and does not raise a budget.

### 2.9 What the story must show

- `density="compact"` on a grid sets the three tokens (read with
  `getComputedStyle`), a host's own `--ts-row` still wins, an invalid value warns
  once and falls back, and removing the attribute restores the comfortable values.
- The sync tests pass: the density block and the type tokens are equal in the
  two token files.
- A scan test: no `font-size: <n>px` in widget CSS outside the allow-list, and
  `--ts-label-size` resolves to at least 11 px at a 16 px root.
- Screenshots at 390 and 1280 px, light and dark, every size of every widget,
  comfortable and compact, with the text-spacing switch on and off, and a note
  of what was seen. No headline, label or figure is clipped with the switch on.
- Root font size raised to 20 px in the gallery: the tiles keep their size, text
  grows, secondary rows hide, nothing clips.

## 3. Resize feedback, a first-run hint and calm profile switches (amends RFC 0002 §5)

Editing and scheduled changes should never feel like guesswork: say what size
the tile will be, say that tiles can be rearranged, and say when the layout
changed by itself.

*Implemented by: edit-feedback.*

### 3.1 The size badge

```ts
// TsGrid, no new public member. A part, so a host can restyle it:
//   part="badge"   the size badge in a tile's edit chrome
```

- **While a tile is being resized**, by pointer drag on the handle or by keys,
  the tile's chrome shows a badge that reads **"Medium · 2×2"**: the size's name
  (`size.M`, "Medium") and its footprint in columns and rows (`grid.badge`). It
  updates as the snapped size changes under the pointer.
- **It fades one second after release** (the last pointer-up, or the last key
  press), and the badge is removed from layout when the fade ends. With
  `prefers-reduced-motion: reduce` it does not fade: it disappears one second
  after release.
- **It is `aria-hidden="true"`.** A keyboard resize is already announced by the
  grid's polite status region (`grid.resized`, RFC 0002 §5.11), and a pointer
  drag is not announced mid-gesture (RFC 0002 §5.11), so the badge is a visual
  aid and speaks for no one.
- **Where.** In the chrome of the tile being resized, anchored with logical
  insets (`inset-block-end`, `inset-inline-start`) on the side away from the
  handle, so it mirrors in right-to-left grids (RFC 0003 §9) and never sits under
  a finger on the handle. Text only; `textContent`, no markup. `--ts-ink` text on
  `--ts-surface-2`, a `--ts-line` border, `--ts-radius-sm`.
- **It is not built for a tile that isn't being resized**, and it costs the grid
  one element per chrome, created with the chrome.

### 3.2 The `hint` attribute and `ts-hint-dismiss`

```html
<ts-grid hint>…</ts-grid>
```

```ts
class TsGrid {
  /** Attribute and property. When set, a coach mark points at the first tile until it is dismissed or edit mode starts. */
  hint: boolean
}
interface TsHintDismissDetail { reason: 'dismiss' | 'edit' }    // event 'ts-hint-dismiss': bubbles, composed, not cancelable
```

- **What it shows.** A small card anchored to the first tile in visual order
  (`readingOrder[0]`, RFC 0003 §11), with a pointer arrow toward it, the text
  `grid.hint.touch` ("Touch and hold a tile to rearrange your dashboard") when
  `matchMedia('(pointer: coarse)')` matches and `grid.hint.pointer` ("Press and
  hold a tile, or choose Edit layout, to rearrange your dashboard") otherwise,
  and a **Got it** button (`grid.hintDismiss`, 44 px). Parts: `hint`, `hint-dismiss`.
- **It ends in three ways.** The user presses **Got it**; edit mode starts by
  any route (the long press, the **Edit layout** button, `editing = true`); or the
  host removes the attribute. The first two fire `ts-hint-dismiss` with `reason`
  `'dismiss'` or `'edit'`. Removing the attribute fires nothing.
- **The library stores nothing** (Decision 46). The host listens for the event,
  remembers it however it likes (a cookie, a user preference, a server row) and
  stops setting `hint` next time. If the host does not remove the attribute, the
  mark stays hidden for the rest of that element's life, so a grid never
  re-shows a hint the user dismissed; removing and re-adding the attribute
  shows it again.
- **Where it doesn't appear.** On a `locked` grid, while the grid is empty or
  has no visible tile, while editing, and while the page is hidden. It is
  re-positioned when the first tile moves or the grid resizes.
- **Focus and order.** The card sits after the board in the grid's shadow tree,
  so it comes after the tiles in Tab order and moves no tile. Escape on the
  button dismisses it. It is not a dialog: it takes no focus on its own, and a
  user who never touches it is never blocked.
- **Not live.** It has `role="note"` and is not `aria-live` (ACCESSIBILITY
  item 18): an announcement at page load would interrupt, and the **Edit
  layout** button is already the grid's first Tab stop with its own name.
- **Motion.** The card appears with a short fade and a one-time nudge of its
  arrow, both off under `prefers-reduced-motion`.

### 3.3 The calm profile switch

When the schedule changes the active profile on its own (`ts-profile-change`
with `reason: 'schedule'`), the grid no longer swaps the tiles in one frame.

- **A crossfade through the Web Animations API.** The grid calls
  `board.animate([{ opacity: 1 }, { opacity: 0 }], { duration: half })`, applies
  the new placements while the board is clear, then fades back in with
  `[{ opacity: 0 }, { opacity: 1 }]`. `half` is half of `--ts-motion` (read once
  from the grid's computed style, default 220 ms, so 110 ms each way). No
  `transition` and no inline `style` string are involved (strict CSP safe), and
  an animation in flight is `cancel()`led when another switch or an edit begins,
  so nothing is left half-faded.
- **Only for a scheduled switch.** A user's own `override()`, the `profile`
  attribute, the first render and every edit apply immediately, as today. A
  switch deferred because the user was editing or dragging (the grid already
  waits, RFC 0002 §5) animates when it finally applies.
- **No animation under `prefers-reduced-motion: reduce`** (or without
  `board.animate`): the new layout appears at once.
- **The toast.** The same element as the undo toast (`part="toast"`) shows
  **"Switched to After close"** (`grid.profileSwitched`) with an action button
  **"Keep Market hours"** (`grid.keepProfile`), for the same 6 s and with the
  same pause on pointer or focus (`TOAST_MS`). The profile names are
  `controls.market` and `controls.closed` for the built-in profiles and the profile's
  own name for any other.
- **Keep previous** calls `grid.override(previous)`. That is the existing
  override: the previous profile stays until the schedule next changes, then
  the schedule takes over again, so "keep" never turns into a permanent lock
  (Decision 47). It fires `ts-profile-change` with `reason: 'override'`, the
  toast announces `grid.keptProfile` ("Keeping Market hours until the next
  change.") and the controls' pressed state follows (RFC 0003 §18.5).
- **One toast at a time.** A newer toast replaces an older one. A removal's
  Undo is only offered in edit mode, and a scheduled switch waits for edit mode
  to end, so the two never collide in practice; if they ever do, the newer wins
  and Ctrl or Cmd+Z still undoes the removal while editing.
- **The host's switch.** `undo-toast="off"` suppresses this toast as well. The
  grid then announces `grid.profile` through its status region, as it does today,
  and the crossfade still runs.
- **The announcement.** The toast is a `role="status"` region (ACCESSIBILITY
  item 18 allows changes the user didn't cause but that change the page under
  them), so the switch is spoken once. The grid's existing `grid.profile`
  announcement is **not** also made when the toast shows, so it is never said
  twice.

### 3.4 Messages

| Family | Keys | Parameters |
|---|---|---|
| `grid.*` | `grid.badge` ("{name} · {cols}×{rows}"), `grid.hint.touch`, `grid.hint.pointer`, `grid.hintDismiss` ("Got it"), `grid.profileSwitched` ("Switched to {profile}"), `grid.keepProfile` ("Keep {previous}"), `grid.keptProfile` ("Keeping {profile} until the next change.") | `name`, `cols`, `rows`, `profile`, `previous` |

`{name}` is `t('size.<S|Wide|…>')`, passed through as a parameter. The profile
names reuse `controls.market` and `controls.closed`; this section adds no key
for them.

### 3.5 Accessibility

The badge is decorative and hidden from assistive technology; the hint is a
note with a 44 px button and no live region; the toast keeps its existing
`role="status"`, pause-on-focus and 44 px **Keep** target (ACCESSIBILITY item 8);
the crossfade and the nudge respect reduced motion (item 17); the hint and
badge use logical insets and mirror in right-to-left grids (item 12). Nothing
new is announced during a drag.

### 3.6 Files and order

Owned by the story, as in its JSON: `src/elements/grid.js` and `src/elements/grid.d.ts`
(the `hint` property, `TsHintDismissDetail`, the `'ts-hint-dismiss'` entry in
the event map, and the `badge`, `hint` and `hint-dismiss` parts in the JSDoc
the manifest reads, RFC 0003 §22.3). It builds **after** `density-and-text-scaling`
(shared `grid.js`) and adds its message block as the table at the top of this RFC says.
It also updates `docs/widgets/ts-grid.md` for the attribute, the event and the parts,
and `docs/ACCESSIBILITY.md` is left to the manual-pass story.

### 3.7 Size

`grid` is the largest entry already and over the pair budget (§10.4). The story
reports its move and does not raise the figure. The hint is built lazily: its
card is created the first time `hint` is set, not with the grid's template.

### 3.8 What the story must show

- Fake-DOM tests: the badge text for every size pair; it is created per chrome,
  updates during a resize, schedules its removal 1,000 ms after the last
  release (a fake clock), and is absent under reduced motion's fade path.
- `hint`: shown for a populated unlocked grid, not for a locked or empty one,
  hidden by edit mode with `reason: 'edit'`, hidden by **Got it** with
  `reason: 'dismiss'`, stays hidden when the attribute is left on, re-shown when
  the attribute is removed and added; the library writes no storage (a test spies
  `localStorage` and `sessionStorage`).
- Profile switch: a scheduled change calls `animate` twice and applies the layout
  between; an `override()` call and the first render call it zero times;
  reduced motion calls it zero times; the toast shows `grid.profileSwitched`
  and **Keep** calls `override(previous)` and fires `ts-profile-change`
  with `reason: 'override'`; `undo-toast="off"` shows no toast and still
  announces; only one of toast and `grid.profile` is spoken.
- By hand: resize with a mouse and with the keyboard, light and dark, 390 and
  1280 px, and in a `dir="rtl"` grid; try the hint; cross the close with the
  playground's pretend clock and keep the previous profile.

## 4. `<ts-breakdown>`, `<ts-status>` and `<ts-feed>` (amends RFC 0003 §18.1 and §22.2)

Composition, health and activity tiles for any dashboard. They are generic
widgets: nothing in them is specific to finance.

*Implemented by: more-generic-widgets.*

All three follow RFC 0003: a pure model each (`<name>Model`), the shared header
and the eight parts (§5), messages for every string (§1), freshness and
`asOf`/`live` (§6), the states of RFC 0002 (loading, empty, error), a `docs/widgets/ts-<name>.md`
page, a `WIDGETS` entry with a description and a category (§18.1) and the
JSDoc tags the manifest generator needs (§22.3). Their `ts-action` unions are the
common one (`TsCommonAction`, RFC 0003 §22.2) and **no new action name**: nothing
in these three tells the host anything, so there is nothing to opt in to.

```ts
// tickslate: the catalog entries (src/core/catalog.js), all category 'General'.
//   breakdown: { tag: 'ts-breakdown', label: 'Breakdown', sizes: ['S', 'Wide', 'Tall', 'M'], description: 'Parts of a whole, as a share bar, stacked bar or donut.' }
//   status:    { tag: 'ts-status',    label: 'Status',    sizes: ['S', 'Tall', 'M'],         description: 'Whether each service or system is working.' }
//   feed:      { tag: 'ts-feed',      label: 'Feed',      sizes: ['Tall', 'M', 'L'],         description: 'The latest events, newest first.' }

type TsBreakdownAction = TsCommonAction
type TsStatusAction = TsCommonAction
type TsFeedAction = TsCommonAction
```

RFC 0003 §18.1's list of built-in categories is unchanged (the three join
`General`). The `define/` files are `breakdown.js`, `status.js` and `feed.js`,
one tag each, so the entries are `tickslate/elements/breakdown`, `status` and
`feed` (RFC 0003 §2.1), all imported by the all-in `tickslate/elements`.

### 4.1 `<ts-breakdown>`

Parts of a whole.

```ts
interface BreakdownSlice {
  id?: string | number          // a stable key; default: the label
  label: string
  value: Numeric                // a non-negative amount; read with toNumber
  note?: string                 // M and Tall: a short second line, host text
}

interface BreakdownData extends WidgetFreshness {
  slices: BreakdownSlice[]
  format?: 'number' | 'money' | 'percent' | 'duration'   // how a slice's value is shown; default 'number'
  decimals?: number
  unit?: string
}

/** <ts-breakdown>, sizes S · Wide · Tall · M. catalogKey 'breakdown'. */
declare class TsBreakdown extends TsWidget<BreakdownData> {
  static breakdownModel(data: BreakdownData, variant: SizeName, ctx: ViewModelContext): BreakdownModel
}

interface BreakdownModel {
  ariaLabel: string              // 'Allocation, 5 parts, largest Equities 41.2%'
  kind: 'share' | 'stacked' | 'donut'    // by size (below)
  total: string                  // fmt of the sum of the kept values; '' with nothing to show
  slices: Array<{
    key: string
    label: string
    value: string                // formatted; '' for the folded "Other" when it has no single value to show
    pct: string                  // '41.2%'
    fraction: number             // 0..1, the true share, for drawing
    index: number                // 1–5 picks --ts-series-<n>; 0 is the folded "Other" (--ts-axis)
    other: boolean
    note: string
  }>
  arcs: Array<{ d: string; index: number }>    // donut only: one ring segment per slice with a positive share
  excluded: number               // negative values left out
  note: string                   // t('breakdown.excluded', {}, excluded), or ''
  dropped: number                // rows that could not be read (not an object, or a value that isn't a number)
}
```

- **Sizes and drawings.** **S** is a *share bar*: one bar filled to the largest
  slice's share, with that slice's label and percentage beside it. **Wide** is a
  *stacked bar* of every slice in one row, with the legend wrapped under it.
  **Tall** is the stacked bar with the legend as a vertical list (label, value,
  percentage, note). **M** is a *donut* with the legend beside it, the total in
  its middle (`breakdown.total`).
- **Folding.** Sort by value, largest first, stable on ties (input order). With
  **six or fewer** kept slices all are shown. With **more than six**, the largest
  **five** are shown and the rest are summed into one slice labelled `breakdown.other`
  ("Other"), so at most six slices are ever drawn and every one has a series
  colour (Decision 48). "Other" uses `--ts-axis`, not a series colour, and the
  legend marks it `other: true`.
- **Percentages sum to 100.0%.** `apportion` (below) uses the largest-remainder
  method at one decimal. Every `pct` is its result, so the legend is internally
  consistent: it never reads 99.9% or 100.1%. With a total of 0 every `pct` is
  `0.0%` and nothing is drawn.
- **Negative values are excluded and reported.** A slice whose value is below 0
  is left out of the total, the shares and the drawing, and counted in
  `excluded`; the tile says so in words (`breakdown.excluded`, "1 negative value
  left out"). A value that isn't a number counts in `dropped`, as in the other
  widgets (RFC 0002). A zero slice stays in the legend at `0.0%` and draws nothing.
- **Each slice carries its label and percentage in text.** The legend is a
  `<ul>` whose items read `Equities, 41.2%`, so identity and size never depend
  on colour (ACCESSIBILITY item 15). The drawing is one `role="img"` whose
  `aria-label` is `ariaLabel`; its slices are not exposed separately.
- **Colour is not the only cue.** Adjacent slices are separated by a
  `--ts-surface` gap line, and the legend swatch is a shape the same size as
  the slice's mark. Signs don't apply: a share is not a gain or a loss.

```ts
// Internal (src/elements/breakdown.js). Pure.
/** Largest-remainder rounding: shares of `values` as numbers with `decimals` places that sum to exactly 100. */
function apportion(values: readonly number[], decimals?: number): number[]   // default decimals 1; all zeros for a total of 0

/** Sorts by value, keeps the largest `max - 1` and sums the rest into one 'other' slice when there are more than `max`. */
function foldSlices<T extends { value: number }>(slices: readonly T[], o?: { max?: number }): Array<T | { value: number; other: true }>   // default max 6

// Internal (src/elements/chart.js; appended after the scrub helpers of §1).
/** Ring segments for shares that sum to 1: 'M … A … L … A … Z' in a viewBox of `size`. */
function arcPaths(
  fractions: readonly number[],
  o: { size: number; radius: number; inner: number; gapDeg?: number },   // gapDeg: the gap between segments, default 1
): string[]                                // '' for a zero share; one slice of 1 is two half arcs, so it still closes
```

`apportion` uses integer arithmetic in units of `10^-decimals` and breaks
remainder ties toward the earlier (larger) value, so its result is the same on
every engine. `arcPaths` loops, never spreads, and rounds like `linePaths`.

- **Updates in place.** The legend is built with `rows.js`, keyed by the slice's
  `id`; a changed value writes one text node and the bar segments or arcs
  rewrite only `d` or a CSS length, never rebuilding nodes. Segment widths are
  written as `style.setProperty('--w', …)` through the CSSOM.
- **Skeleton and empty.** The skeleton is shaped like the bar and legend;
  `emptyText` is "Nothing to break down".

**Messages:** `breakdown.*`:

| Key | English | Parameters |
|---|---|---|
| `breakdown.other` | "Other" | |
| `breakdown.total` | "Total {value}" | `value` |
| `breakdown.item` | "{label}, {pct}" | `label`, `pct` |
| `breakdown.share` | "{label} {pct}" (S) | `label`, `pct` |
| `breakdown.excluded.one`, `.other` | "{count} negative value left out", "{count} negative values left out" | `count` |
| `breakdown.chartLabel` | "{label}: {count} parts, largest {name} {pct}" | `label`, `count`, `name`, `pct` |
| `breakdown.chartEmpty` | "{label}: nothing to break down" | `label` |
| `widget.breakdown.label`, `.description`, `.empty` | "Breakdown", the description above, "Nothing to break down" | |

### 4.2 `<ts-status>`

Health at a glance, one row per service.

```ts
type StatusState = 'ok' | 'degraded' | 'down' | 'unknown'

interface StatusRow {
  id: string | number
  name: string
  state: StatusState
  detail?: string               // a short host sentence: 'Elevated latency'
  since?: Time                  // when it entered this state
}

interface StatusData extends WidgetFreshness {
  rows: StatusRow[]
}

/** <ts-status>, sizes S · Tall · M. catalogKey 'status'. */
declare class TsStatus extends TsWidget<StatusData> {
  static statusModel(data: StatusData, variant: SizeName, ctx: ViewModelContext): StatusModel
}

interface StatusModel {
  ariaLabel: string             // 'Services, 3 of 4 OK, 1 degraded'
  overall: StatusState          // the worst state present: down, then degraded, then unknown, then ok
  summary: string               // '3 of 4 OK'
  counts: { ok: number; degraded: number; down: number; unknown: number }
  rows: Array<{
    id: string | number
    name: string
    state: StatusState
    stateText: string           // 'OK', 'Degraded', 'Down', 'Unknown' (t('status.<state>'))
    detail: string
    since: string               // fmt.ago, or ''
  }>
  dropped: number               // rows that could not be read (no id, no name, or a state that isn't one of the four)
}
```

- **The state is text, as well as a dot.** Every row shows `stateText` beside a
  dot, and the dot's **shape** differs by state (a filled circle for `ok`, a
  triangle for `degraded`, a square for `down`, a hollow circle for `unknown`),
  all `aria-hidden`, so a colour-blind user and a screen-reader user lose
  nothing (ACCESSIBILITY item 15). Colours are `--ts-profit`, `--ts-warn`,
  `--ts-loss` and `--ts-muted`.
- **Order is the host's.** Rows keep their input order; the widget does not
  sort, because a status board's order is part of its meaning. `overall` still
  names the worst.
- **Sizes.** **S** shows the summary (`3 of 4 OK`), the overall state's text and
  dot, and nothing else. **Tall** lists every row: name, state. **M** adds the
  detail line and `since` (`fmt.ago`, "since 12 min ago").
- **Table semantics.** Rows are a real `<table>` (Name, Status, and in M Since)
  with a header row, built on `rows.js` and keyed by `id` (RFC 0003 §16), so a
  change of one row's state writes that row's cells and nothing else. The header
  row is visually hidden at Tall, where the columns are obvious, and visible at M.
- **No live announcements.** A row going `down` changes text silently
  (ACCESSIBILITY item 18). A host that wants an alert announces it itself.
- `emptyText` is "No services to show"; the skeleton is shaped like the rows.

**Messages:** `status.*`:

| Key | English | Parameters |
|---|---|---|
| `status.ok`, `status.degraded`, `status.down`, `status.unknown` | "OK", "Degraded", "Down", "Unknown" | |
| `status.summary` | "{ok} of {total} OK" | `ok`, `total` |
| `status.since` | "since {when}" | `when` |
| `status.rowAria` | "{name}, {state}" | `name`, `state` |
| `status.aria` | "{label}, {summary}" with the overall state appended when it isn't OK: `status.ariaWorst` "{label}, {summary}, {state}" | `label`, `summary`, `state` |
| `status.colName`, `status.colState`, `status.colSince` | "Name", "Status", "Since" | |
| `widget.status.label`, `.description`, `.empty` | "Status", the description above, "No services to show" | |

### 4.3 `<ts-feed>`

The latest events, newest first.

```ts
interface FeedItem {
  id: string | number
  text: string                  // the event, host text
  time?: Time
  tag?: string                  // a short word shown beside it: 'Fill', 'Alert'
  tone?: 'pos' | 'neg' | 'warn' // colours the tag; the tag's own text carries the meaning
  detail?: string               // M and L: a second line
}

interface FeedData extends WidgetFreshness {
  items: FeedItem[]             // newest first, as the host keeps them
  max?: number                  // how many to show; default 50, at least 1
}

/** <ts-feed>, sizes Tall · M · L. catalogKey 'feed'. */
declare class TsFeed extends TsWidget<FeedData> {
  static feedModel(data: FeedData, variant: SizeName, ctx: ViewModelContext): FeedModel
}

interface FeedModel {
  ariaLabel: string             // 'Activity, 12 events, latest: Order filled'
  items: Array<{ id: string | number; text: string; time: string; tag: string; tone: 'pos' | 'neg' | 'warn' | 'mut'; detail: string }>
  hidden: number                // items beyond `max`, not shown
  more: string                  // t('feed.more', { count: hidden }, hidden), or ''
  dropped: number               // items that could not be read (no id, or no text)
}
```

- **Keyed by id.** Items are matched by `id` through `rows.js`, so a new item
  inserts one row at the front, a departed item removes one row, a changed
  item writes only its changed text, and the rest are untouched (focus in a row
  and the screen-reader cursor survive a tick).
- **Prepending does not move the tile.** The tile keeps its size. The list
  scrolls inside it. When an item arrives at the front and the user has scrolled
  away from the top (`scrollTop` above 0), the widget adds the new row's height
  to `scrollTop` in the same frame, so what the user is reading stays where it
  was; when they are at the top, the new item appears there and the others move
  down. This is done by hand because scroll anchoring is missing in Safari.
- **The host's order is kept.** The widget does not sort by time: the host sends
  newest first. `max` shows the first `max` items (default 50, Decision 49) and
  `more` says how many were left out ("12 older events not shown").
- **Time.** `time` is `fmt.time` for today in the formatter's zone and `fmt.date`
  with the time on other days; M and L show it, Tall shows it small.
- **Tone is a hint, not the message.** The tag's text is always shown when
  there is a tag; `tone` only colours it, and a tag-less item has no tone.
- **No `aria-live`.** A feed that ticks never speaks (ACCESSIBILITY item 18):
  it is a `<ul>` read in order when the user goes to it. The tile's name
  states the count and the latest event and is written only when it changes.
- `emptyText` is "Nothing yet"; the skeleton is a few text lines.

**Messages:** `feed.*`:

| Key | English | Parameters |
|---|---|---|
| `feed.more.one`, `.other` | "{count} older event not shown", "{count} older events not shown" | `count` |
| `feed.itemAria` | "{time}, {tag}: {text}" and, without a tag, `feed.itemAriaPlain` "{time}, {text}" | `time`, `tag`, `text` |
| `feed.aria` | "{label}, {count} events, latest: {text}" | `label`, `count`, `text` |
| `feed.ariaEmpty` | "{label}, no events" | `label` |
| `widget.feed.label`, `.description`, `.empty` | "Feed", the description above, "Nothing yet" | |

### 4.4 Files and order

Owned by the story, as in its JSON: `src/elements/breakdown.js`, `status.js`,
`feed.js`, their three `define/` modules, `src/elements/chart.js` (it appends
`arcPaths` **after** `chart-scrub-and-exact-values`), `src/core/catalog.js`,
`src/core/index.d.ts`, `src/elements/index.js`, `src/elements/index.d.ts`, and
`test/breakdown.test.mjs`, `status.test.mjs`, `feed.test.mjs`. It also adds its
message blocks (shared files, top of this RFC), the three docs pages
`docs/widgets/ts-breakdown.md`, `ts-status.md` and `ts-feed.md` (the brief asks for them),
and one budget row each in `scripts/check-size.mjs`. `create-dashboard` edits
`src/elements/index.js` after it.

### 4.5 Size

Three new entries, each budgeted from its own measurement plus 10%, rounded up
to 0.5 kB, with the date and a comment, as RFC 0003 §25 sets. `rows.js` and the
shared header are already in the `table` and `watchlist` chunks, so the three
should share them. The story reports every measurement and the effect on the
all-in entry and the CDN files, which are reported, not enforced (RFC 0003 §25).

### 4.6 What the story must show

- `apportion`: sums to exactly 100 at one decimal for ties, thirds, one slice,
  a total of 0 and 1,000 random value lists (a seeded generator, as in §8); a
  stable result on equal remainders.
- `foldSlices`: six slices unchanged; seven become five plus "Other"; "Other"
  sums the rest; equal values keep input order.
- `breakdownModel`: negatives excluded and counted, unreadable values dropped,
  zero slices kept with `0.0%`, every size's `kind`, numeric strings accepted,
  `ariaLabel` states the largest slice, text on every slice, and no throw on
  `null`, `[]` and a non-array.
- `arcPaths`: closed ring segments, one full-circle slice, a zero share gives
  `''`, and the paths are finite numbers.
- `statusModel`: every state's text, `overall`, counts, unknown states dropped,
  input order kept, `since` formatting, and shape differences in the template.
- `feedModel` and the element: `max` and `hidden`, id-keyed insertion and
  removal counted by the fake DOM (one write per changed cell, one insert per new
  item), the scroll offset compensation, no `aria-live` anywhere.
- Every size of each renders with no clipping at 390 and 1280 px, light and
  dark, and passes axe.

## 5. Session breaks, market presets and holiday coverage (amends RFC 0001 §7 and RFC 0003 §12)

Session specs that can say "lunch", presets for the markets people trade, and a
warning when a holiday list runs out. The calendar stays pure data, and
Tickslate never fetches holidays.

*Implemented by: market-presets-and-breaks. It depends on overnight-sessions (merged), whose windows it splits.*

### 5.1 `SessionSpec.breaks`

```ts
interface SessionSpec {
  // …as RFC 0003 §12, with this addition:
  /**
   * Gaps inside each window, such as a lunch break. 'HH:MM' local, sorted, not overlapping and
   * each inside the window it belongs to. During one the session is closed.
   */
  breaks?: ReadonlyArray<{ from: string; to: string }>
  /** A special session may carry its own breaks; without them it has none. */
  specialSessions?: Record<string, { open: string; close: string; breaks?: ReadonlyArray<{ from: string; to: string }> }>
}

interface SessionState {
  // …as RFC 0003 §12, with these additions:
  /** True while the session is inside a break. `open` is false then, and `opensAt` is the break's end. */
  onBreak: boolean
  /** When open: what happens at `closesAt`. 'break' when the run ends at a break, 'close' when it ends for the day, null while closed or with no end. */
  ends: 'close' | 'break' | null
}
```

- **A break closes the session.** `state()` is `{ open: false, onBreak: true,
  opensAt: <the break's end>, closesAt: null, startedAt: null, progress: null,
  ends: null }` between `from` and `to`. Before a break the run ends at the break's
  start: `closesAt` is that instant, `ends` is `'break'`, and `progress` runs
  from the window's open to the break. After the break a new run starts at `to`.
  `nextChange` returns the break's start (`to: 'closed'`) and then its end
  (`to: 'open'`). `windows(id, from, to)` returns the segments, not the whole
  day, and `candleClose` stops at the break.
- **`hours(id, date)`** still returns the whole window's open and close. It
  gains `breaks: Array<{ from: number; to: number }>` (instants) so a caller can
  draw the gap.
- **Validation.** `checkSpec` throws `TypeError`, as for any malformed spec, for:
  a break that isn't `{ from, to }` of `'HH:MM'`; `from` not before `to`
  within the window; a break outside the window (before its open or after its
  close, with an overnight window's next-day times understood: for a window that
  opens `17:00` and closes `16:00`, a break at `01:00` to `01:30` is the next
  morning's); overlapping or unsorted breaks; and more than four breaks.
  A close range (`close.ranges`) with an earlier close than a break clips it
  for that date: the break past the close is ignored, never an error.
- **Holidays and special sessions.** A holiday removes the whole window, breaks
  included. A special session replaces the day's hours and has **only** its own
  breaks (usually none), so a half day with no lunch break is written without one.
- **Touching windows still merge** (RFC 0003 §12), but a break has a positive
  length, so the two segments around it never touch and never merge.
- **Daylight saving.** A break is local time-of-day like `open`, resolved with
  `zonedTime`; a break inside the spring-forward gap is clamped to the window and
  one that ends up empty is dropped. New fixtures cover the DST weeks of
  `Asia/Tokyo` (no DST), `Europe/London` and `America/New_York`.
- **Profiles.** `activeProfile` treats a break as **open** by default, so a layout
  doesn't switch at lunch (Decision 52):

  ```ts
  interface ProfileSchedule {
    market: { sessions: string[]; leadMinutes?: number; lagMinutes?: number
              /** 'market' (the default) keeps the market profile through a break; 'closed' switches during it. */
              duringBreaks?: 'market' | 'closed' }
  }
  ```

### 5.2 The session clock during a break

- **The lane reads "Break".** In place of the open or closed title, the lane
  shows `t('session.break')` and, under it, `t('session.resumes', { time })`
  ("resumes 13:00"), with the time in the session's zone. The fill and ticks
  are drawn in two segments with the break as a visible gap. At S the whole
  clock reads **Break**.
- **Counting down.** While a run ends in a break, the countdown reads
  `session.toBreak` ("{time} to break"), not "to close". `session.left` and
  `session.toClose` keep their uses when `ends` is `'close'`.
- **Accessible name.** `session.ariaBreak` ("{session} on break, {opens}"), with
  `opens` the same text the closed state uses (`session.opens…`).
- **No announcements.** The clock ticks silently, as ever (ACCESSIBILITY item
  18); the state change is not spoken.
- **Forced colours and motion.** The gap is a real gap in the drawing, so it
  needs no colour; nothing animates.

### 5.3 The presets

```ts
// Added to `presets` (RFC 0001 §7; the existing `nse` and `mcx` are unchanged).
declare const presets: {
  /** NYSE. segment: 'regular' (the default, id 'nyse'), 'pre' ('nyse-pre'), 'post' ('nyse-post') or 'extended' ('nyse-ext': pre-market through post-market as one window). */
  nyse(options?: { segment?: 'regular' | 'pre' | 'post' | 'extended' }): SessionSpec
  /** Nasdaq, same segments, ids 'nasdaq', 'nasdaq-pre', 'nasdaq-post', 'nasdaq-ext'. */
  nasdaq(options?: { segment?: 'regular' | 'pre' | 'post' | 'extended' }): SessionSpec
  /** London Stock Exchange, id 'lse'. */
  lse(): SessionSpec
  /** CME Globex equity index futures, id 'cme-equity-index'. An overnight session. */
  cme(options?: { segment?: 'equity-index' }): SessionSpec
  /** The spot FX week, id 'fx'. Opens on a Sunday and closes on a Friday, in New York time. */
  fx(): SessionSpec
  /** Crypto, id 'crypto', UTC, every day, 24/7. */
  crypto(): SessionSpec
  /** One market with a lunch break: Tokyo Stock Exchange, id 'tse' (Decision 51). */
  tse(): SessionSpec
}
```

- **Hours are verified against the exchange's own pages at build time, and
  cited. They are never written from memory.** This RFC names no hours on
  purpose: the story opens the official trading-hours page of each exchange (the
  exchange's own site, not a data vendor, a broker or an encyclopaedia),
  reads the hours that apply on the day of the build, and writes them into the
  preset. If a page cannot be reached or is ambiguous, the story reports it and
  does not guess. The existing `nse` and `mcx` presets already follow this
  rule (the comment above `presets` in `calendar.js` lists the circulars and
  the date).
- **Every preset cites its source.** The comment block above each preset has
  two lines, `Source: <url of the exchange page>` and `Checked: <YYYY-MM-DD>`, and
  `docs/guide/sessions.md` repeats them in a table (preset, id, source, date
  checked). A node test reads `calendar.js` and the guide with `node:fs` and
  fails if a key of `presets` has no `Source:` URL beginning `https://` or no
  `Checked:` date in either place, or a `Checked:` date in the future.
  It cannot check the hours themselves; that is why the story's report quotes,
  for each preset, the wording of the page it read.
- **Exchanges change their hours**, and a day's hours can differ (early closes,
  half days). A preset gives the regular hours; early closes and special days
  are the host's `specialSessions`, which the guide demonstrates. Anything a
  preset cannot know is stated in its comment, not guessed.
- **No holidays are bundled.** A preset has no holiday list: a host passes one
  (5.4), or none.
- **The lunch-break market** exists to prove `breaks`. The CME preset shows
  breaks in an overnight window if the verified hours have a daily pause inside
  the window; if the pause is the gap between two windows the preset is written
  as that gap and the story says which.
- Each preset has a test of its id, its time zone, its days and one probe per
  state (open, closed, the break, a weekend) at times the story chooses from the
  hours it verified.

### 5.4 Holiday coverage

```ts
interface CalendarInput {
  sessions: readonly SessionSpec[]
  holidays?: Record<string, readonly string[]>
  /**
   * The instant coverage is judged against. Default: Date.now(), read once when the
   * calendar is created. Pass it in tests and in servers that render at a fixed time.
   */
  now?: Time
}

interface CalendarIssue {
  session: string
  code: 'holiday-coverage'
  message: string          // 'The holiday list for "nyse" ends on 2026-12-31, 66 days from now.'
}

interface Calendar {
  // …as RFC 0003 §12, with these additions:
  /** The last date any list covers for this session: the latest of holidays['*'] and holidays[id], or null with neither. */
  holidaysThrough(id: string): string | null
  /** Problems found when the calendar was created. Frozen; [] when there are none. */
  readonly issues: readonly CalendarIssue[]
}
```

- **`holidaysThrough(id)`** returns a `'YYYY-MM-DD'` or `null`, and throws
  `RangeError` for an unknown session as the other methods do. It reads only
  the lists the host gave.
- **The coverage issue.** For each session that has a non-empty holiday list
  (its own, or `'*'`), `issues` holds a `'holiday-coverage'` entry when the
  list ends **less than 30 days after `now`** (Decision 54). A session with no
  list at all gets no issue: hosts leave it out on purpose (crypto, FX, a test),
  and an issue there would be noise (the clock cannot tell the difference).
- **The calendar reads the clock once** (Decision 53). It is the one place the
  core calls `Date.now()` besides `presets.mcx`'s default years, and `now` makes
  it deterministic. A calendar created at page load and left open for months
  keeps its original `issues`; the host that builds long-lived calendars
  rebuilds them (the guide says so).
- **The clock warns once.** `<ts-session-clock>` reads `calendar.issues` the first
  time it renders with a calendar and, in development only, `console.warn`s each
  `'holiday-coverage'` issue's `message` once per calendar, followed by "See
  docs/guide/sessions.md". Production builds contain neither the check nor the
  string, as for RFC 0003 §4.3. It changes nothing on screen.
- **The guide.** `docs/guide/sessions.md` shows how to pass a host-supplied
  list with made-up dates: fetch the exchange's holiday list yourself, shape it
  into `{ nyse: ['2027-01-01', …] }`, pass it to `createCalendar`, and rebuild the
  calendar (and set `calendar` on the clock) when the list is renewed.

### 5.5 Messages

| Family | Keys | Parameters |
|---|---|---|
| `session.*` | `session.break` ("Break"), `session.resumes` ("resumes {time}"), `session.toBreak` ("{time} to break"), `session.ariaBreak` ("{session} on break, {opens}") | `time`, `session`, `opens` |

The coverage text is a developer warning, so like the grid's other development
warnings it is not a message.

### 5.6 Files and order

Owned by the story, as in its JSON: `src/core/calendar.js`, `src/core/index.d.ts`,
`src/elements/session-clock.js`, `test/calendar.test.mjs` and `docs/guide/sessions.md`.
It adds its message keys (shared files). The preset and citation tests go in
`test/calendar.test.mjs`, since `test/presets.test.mjs` belongs to the theme
presets. It touches `src/core/index.d.ts` with `security-hardening` (the
shared-files table): the two edit different declarations, so either order works
and the second story rebases.

### 5.7 Size

`calendar.js` grows by break handling, the seven presets and the coverage
check; they are core, so the story re-measures `dist-lib/index.js` and the UMD
and reports it. The core budget is enforced and the story does not raise it:
if the core would pass it, the presets move to a separate import (Decision 51
records the alternative), and the maintainer decides.

### 5.8 What the story must show

- Break fixtures: before, at the start of, inside, at the end of and after a
  break; `state`, `nextChange`, `windows`, `hours`, `candleClose` and
  `progress` each; an overnight window with a break after midnight; a holiday
  removing the window; a special session with and without breaks; the DST weeks.
- `checkSpec` throws `TypeError` for each invalid break shape listed above.
- Each preset: id, zone, days and probes, plus the citation test of 5.3.
- `holidaysThrough` with one list, two lists, none and an unknown id;
  `issues` with a list ending in 10, 29, 30 and 400 days, with `now` given and
  with the real clock stubbed; no issue without a list.
- The clock shows "Break" and "resumes …" during a break, counts "to break"
  before one, warns once in development for a short list and never in
  production (the `console.warn` spy and the production-build check), and
  names itself with `session.ariaBreak`.
- Existing calendar tests pass unchanged.

## 6. `<ts-mini-chart>` through optional Emberwick (amends RFC 0001 §8.5.9 and RFC 0003 §2.1)

A small candlestick chart with marks and a candle-close countdown, drawn by
Emberwick, the maintainer's candlestick library. Emberwick is an **optional
peer**: a host that never imports this widget never loads Emberwick, never
installs it, and pays nothing.

*Implemented by: mini-chart. It depends on entries-and-cdn, messages and tile-chrome (all merged).*

### 6.1 The entry and the peer

- **The entry is `tickslate/elements/mini-chart`** (RFC 0003 §2.1, unchanged),
  from `src/elements/define/mini-chart.js`. Importing it registers `<ts-mini-chart>`
  and exports `TsMiniChart`.
- **`tickslate/elements` never imports it** (amends RFC 0003 §2.1, whose
  "the all-in entry imports every define module" gains "except `mini-chart`").
  `src/elements/index.js` is not edited by this story and does not list it; the
  CDN bundles (RFC 0003 §2.3) do not contain it either, since their build entry
  is `index.js`. The widget is still in `WIDGETS` (`miniChart`, sizes M · L · XL,
  category `Markets`), so a layout can name it; until its entry is imported the
  grid treats it as a tile whose widget is not defined yet.
- **Emberwick is a peer, never a dependency.** `package.lib.json` already has
  `"peerDependencies": { "emberwick": ">=0.14.0" }` with `peerDependenciesMeta`
  marking it optional; the story keeps both. `>=0.14.0` is the first release
  with the countdown and the volume-profile entry the widget uses.
- **It is external to every build.** `vite.lib.config.js`, `vite.dev.config.js`,
  `scripts/check-size.mjs`' bundler and `verify-package` list `emberwick` as
  external already (and `emberwick/profiles` is added), so no output contains
  Emberwick's code. The story confirms, and `verify-package` gains the checks of 6.7.
- **Loaded lazily.** The widget calls `import('emberwick')` the first time it
  has data, not when its module is imported (Decision 56). A host without the
  peer installed, or a page whose bundler could not resolve it, gets the
  widget's **error view** with `miniChart.noPeer` ("The chart library isn't
  installed") and one development warning, never a thrown import error that
  stops the rest of the page. `emberwick/profiles` is imported the same way, only
  when `volumeProfile` is on (Decision 55 records the missing-peer behaviour).

### 6.2 Data

RFC 0001 §8.5.9's shape, with `Time` and `Numeric` throughout (RFC 0002 §4.1) and
the timeframe list its L buttons need:

```ts
interface MiniChartBar {
  time: Time                   // read with toTime; ms in Emberwick's Bar
  open: Numeric; high: Numeric; low: Numeric; close: Numeric
  volume?: Numeric
}

interface MiniChartData extends WidgetFreshness {
  charts: Array<{
    id: string
    instrument: string
    timeframe?: string                 // '5m'
    timeframes?: string[]              // the buttons at L, with `timeframe` pressed; default none (no buttons)
    bars: MiniChartBar[]               // ascending by time
    marks?: Array<{ t: Time; kind: 'entry' | 'exit'; label?: string }>
    changePct?: Numeric                // a fraction; shown in the header meta
    note?: string                      // XL: '2 strategies · 1 in position'
  }>
  countdown?: boolean                  // candle-close countdown on the last price
  volumeProfile?: boolean              // L
}

/** <ts-mini-chart>, sizes M · L · XL. catalogKey 'miniChart'. Entry tickslate/elements/mini-chart. */
declare class TsMiniChart extends TsWidget<MiniChartData> {
  static miniChartModel(data: MiniChartData, variant: SizeName, ctx: ViewModelContext): MiniChartModel
}

type TsMiniChartAction = TsCommonAction | { action: 'timeframe'; id: string; value: string }   // opt-in: actions = ['timeframe']
```

- **M and L show `charts[0]`; XL shows the first two side by side**, each its
  own Emberwick chart.
- **Marks.** An entry is a circle and an exit a diamond (`shape: 'circle'`,
  `shape: 'diamond'`), never colour alone (ACCESSIBILITY item 15), with `label`
  as the marker's `text`. A time that is not readable is dropped and counted.
- **Timeframe buttons (L)** appear only when `actions` includes `'timeframe'`
  and `timeframes` is given (RFC 0001 §8.3: a control that tells the host
  something is off until listed). Pressing one fires `ts-action { action: 'timeframe', id, value }`;
  the bars are the host's to replace. They are real buttons in the header with
  `aria-pressed`, 44 px on coarse pointers.
- **The model** (`miniChartModel`, pure, no Emberwick) returns, per chart: the
  normalised bars (`{ time, open, high, low, close, volume }` as numbers, ascending,
  bars with a non-finite OHLC dropped and counted in `dropped`), the marks, the
  header text, and the `summary` (6.5). The element only hands these to Emberwick.

### 6.3 Incremental updates: the pure diff

```ts
// Internal (src/elements/mini-chart.js). Pure; imports nothing.
type BarOp = { op: 'update'; bar: EmberwickBar } | { op: 'append'; bar: EmberwickBar }
type BarDiff =
  | { kind: 'none' }                              // identical
  | { kind: 'ops'; ops: BarOp[] }                 // apply with chart.update() / chart.append(), in order
  | { kind: 'set'; bars: EmberwickBar[] }         // chart.setData()

function diffBars(prev: readonly EmberwickBar[] | null, next: readonly EmberwickBar[], o?: { maxAppend?: number }): BarDiff
```

- **`none`** when both lists are the same length with equal `time` and OHLCV on
  every bar.
- **`ops`** when every bar before `prev`'s last is unchanged and `next` is as long
  as `prev` or longer, covering exactly two cases and their combination: the last
  bar of `prev` changed (one `update`), and new bars were appended after it
  (one `append` each). The usual live tick is one `update`; a candle closing is
  one `update` and one `append`. At most `maxAppend` appends (default **10**, a made-up figure the story may tune)
  are applied one by one; more is a bulk load.
- **`set`** for everything else: an earlier bar changed, bars were removed or
  re-ordered, the first time, or more than `maxAppend` new bars, or `prev` is
  `null`. A different instrument or timeframe is always `set`.
- **Hosts can reassign `data` on every tick** from Vue or React state; the widget
  compares and does the least work.

### 6.4 The theme mapping

Emberwick takes colours as CSS strings in its `Theme`. Tickslate's tokens are
CSS variables, so the widget reads them at runtime and maps them:

| Emberwick `Theme` key | Tickslate token |
|---|---|
| `background` | `--ts-surface` |
| `grid` | `--ts-line` |
| `axisLine` | `--ts-axis` |
| `text` | `--ts-muted` |
| `textStrong`, `labelBg` | `--ts-ink` |
| `labelText`, `tagText` | `--ts-surface` |
| `up`, `wickUp`, `upFill` | `--ts-profit` |
| `down`, `wickDown`, `downFill` | `--ts-loss` |
| `volumeUp`, `volumeDown` | `--ts-profit`, `--ts-loss` at 40% opacity |
| `crosshair` | `--ts-muted` |
| `watermark` | `--ts-line` at 40% opacity |
| `font` | `--ts-font-num` |
| `profileFill`, `profileValueArea`, `profilePoc` | `--ts-accent` at 25%, 45% and 100% opacity |
| `priceAxisWidth`, `timeAxisHeight` | Numbers, not tokens |

- **A pure function builds it** from an injected reader, so a node test needs no
  DOM: `emberwickTheme(read: (token: string) => string): Partial<EmberwickTheme>`
  (Internal). The element supplies a reader that resolves each token to
  an `rgb()` or `rgba()` string by painting it onto a 1×1 canvas and reading the pixel
  back, which turns hex, `hsl()`, `color-mix()` and named colours into one form
  and lets the translucent entries be built without parsing CSS.
- **Re-read on theme change.** The widget observes (with one `MutationObserver`
  on `document.documentElement` and one on its closest `<ts-grid>`) the attributes
  `data-theme`, `class`, `data-ts-theme` and `data-ts-palette`, and a
  `matchMedia('(prefers-color-scheme: dark)')` listener for `data-theme="auto"`,
  and calls `chart.setTheme(emberwickTheme(read))` on a change. Palettes follow
  for free: `red-up` swaps `--ts-profit` and `--ts-loss`, so up candles turn
  red and the legend still reads right.
- **Other options.** `watermark: false`, `countdown` from `data.countdown`
  (and `chart.setCountdown` on change), `clock: () => this.now()` so a frozen
  widget clock reaches Emberwick's countdown, and `animate` off under
  `prefers-reduced-motion`.
- **The chart sizes itself to the tile.** A `ResizeObserver` (guarded) calls
  `chart.resize()`.

### 6.5 Accessibility

- **The canvas is `aria-hidden="true"`.** A candlestick chart drawn on a canvas
  has no accessible structure of its own.
- **The wrapper is `role="img"` with a summary** built by the model:
  `miniChart.summary` ("{instrument}, {timeframe}: last {close}, {change}, {count} bars, {marks}"),
  e.g. "ABC Corp, 5m: last 128.40, up 1.2%, 78 bars, 2 entries and 1 exit". The
  change carries a word ("up"/"down"), not only a sign. Marks are counted with
  plural forms.
- **Hover and touch crosshair are Emberwick's** and are not exposed to
  assistive technology; the summary and the host's own table are the text route.
  A table of the last bars would repeat §1.6 for a canvas chart and is left as a
  follow-up the story may propose.
- The timeframe buttons, the header and the states follow ACCESSIBILITY items 1,
  8, 10 and 11 like any widget.

### 6.6 Messages

| Family | Keys | Parameters |
|---|---|---|
| `miniChart.*` | `miniChart.summary`, `miniChart.summaryEmpty` ("{instrument}: no bars yet"), `miniChart.marks.one`/`.other` ("{count} mark"/"{count} marks") and the `entry`/`exit` counts `miniChart.entries.one`/`.other`, `miniChart.exits.one`/`.other`, `miniChart.noPeer` ("The chart library isn't installed"), `miniChart.timeframes` ("Timeframe"), `miniChart.up` ("up {pct}"), `miniChart.down` ("down {pct}") | `instrument`, `timeframe`, `close`, `change`, `count`, `pct` |
| `widget.miniChart.label`, `.description`, `.empty` | "Mini chart", the catalog description, "No bars yet" | |

### 6.7 Files and order

Owned by the story, as in its JSON: `src/elements/mini-chart.js`,
`src/elements/define/mini-chart.js`, `vite.lib.config.js`, `scripts/pack-lib.mjs`,
`package.lib.json`, `test/mini-chart.test.mjs` and `docs/widgets/ts-mini-chart.md`.
Files **outside** the list that it needs, for which no other P2 story is an
owner: `scripts/verify-package.mjs` (the new checks below),
`scripts/check-size.mjs` (the new entry's budget row, by RFC 0003 §25's rule) and
`test/entries.test.mjs` (the all-in test already compares `index.js` with the
define list and gains the one-name exemption). It records them in its report under
"Files outside the boundary". It adds its message block (shared files).

### 6.8 Size

The wrapper is budgeted as a new entry from its own measurement plus 10%
(RFC 0001 §13 aimed at 3 kB plus Emberwick; the story reports the real figure).
Emberwick's own size is not counted and not bundled. The all-in entry and CDN
files do not grow.

### 6.9 What the story must show

- `diffBars`: identical lists; a last-bar update; a candle close (one update and
  one append); several appends under and over `maxAppend`; an earlier bar
  changed; a shorter list; a null `prev`; time-ordered input.
- `emberwickTheme` with an injected reader: every row of the table, translucent
  entries built from the reader's `rgb()` output, and a red-up swap.
- `miniChartModel`: unreadable bars and marks dropped and counted, a numeric string
  accepted, `summary` with plural forms, XL with two charts and M with one.
- The wrapper in a fake DOM with a fake Emberwick injected: `setData` once,
  then `update`/`append` on later data, `setTheme` after a theme attribute
  change, `destroy` on disconnect, `resize` on a size change, and the missing-peer
  path showing the error view and warning once.
- **`verify-package`:** `tickslate/elements` and the CDN files contain no
  `emberwick` string and import nothing named `emberwick`; `tickslate/elements/mini-chart`
  imports `emberwick` only as an external (never inlined); `package.lib.json` has
  the optional peer at `>=0.14.0`; and bundling `tickslate/elements` with esbuild
  without Emberwick installed succeeds.
- `npm run release` passes, and `elements.js` contains no Emberwick import.

## 7. `createDashboard()` (amends RFC 0001 §8.4 and RFC 0003 §18.2)

A host with a JSON API and no front-end framework describes a dashboard as
layout plus data and gets a live grid, and writes no DOM code. RFC 0001 §8.4
says children belong to the host; `createDashboard` is the host's helper for
the case where the host is plain script.

*Implemented by: create-dashboard. It depends on grid-integration, persist-attribute and widget-picker-and-controls (all merged).*

```ts
// tickslate/elements
interface DashboardOptions {
  /** The layout to show: a Layout or a bare item array. The grid reads it with readLayout. */
  layout: Layout | LayoutItem[]
  /** Data by item id. An id with no item in any profile warns in development and is ignored. */
  data?: Record<string, unknown>
  /** The widget catalog: default widgetCatalog() (RFC 0003 §3), which includes WIDGETS and registered custom widgets. */
  catalog?: Catalog
  /** The grid's persist key (RFC 0003 §4). Off by default. */
  persist?: string
  locale?: string
  currency?: string
  timeZone?: string
  /** The grid's accessible name (aria-label). Default: the grid's own "Dashboard". */
  label?: string
  /** What the picker offers and ts-add-request answers: a list, '*' or null. Default '*' (Decision 57). */
  addTypes?: readonly string[] | '*' | null
}

interface Dashboard {
  readonly grid: TsGrid
  /** Sets one tile's data. Returns false, and warns in development, for an id with no tile. */
  set(id: string, data: unknown): boolean
  /** Sets the tiles named in the object and no others; unknown ids warn in development. */
  update(dataById: Record<string, unknown>): void
  /** Removes the grid and its listeners. Idempotent. After it, set and update do nothing. */
  destroy(): void
}

/** `target` is the element to put the grid in, or a CSS selector for it. */
function createDashboard(target: Element | string, options: DashboardOptions): Dashboard
```

It is exported from `tickslate/elements` and `src/elements/index.d.ts`. It is
**not an element**, so it has no `define/` module and no entry of its own
(RFC 0003 §2.1 lists entries for tags); a host that wants less than the
all-in entry builds its own few lines on the grid's API.

### 7.1 Behaviour

- **The grid.** `createDashboard` calls `document.createElement('ts-grid')`,
  sets `locale`, `currency`, `time-zone` (from `timeZone`), `persist` and
  `aria-label` as attributes when given, sets `grid.layout = layout` and
  `grid.addTypes`, and appends it to `target`. `target` as a string is resolved
  with `document.querySelector`; no match, or no DOM, throws `TypeError` with a
  message that names the selector. It does not clear what `target` already holds.
- **Children.** For every item in **every** profile and in the top strip's
  ids (Decision 58), once per id, it creates the element whose tag comes from the
  item's catalog entry (`specFor(item, catalog).tag`), sets `item=<id>`, sets the
  initial `data` when `data` has that id, and appends it to the grid. An item
  whose type is not in the catalog is skipped with one development warning
  (`readLayout` would drop it anyway), and a tag that is not yet defined as a
  custom element warns once in development and still gets its child, which
  upgrades when the tag is defined. The same id in two profiles has one child.
- **Data.** `set(id, data)` assigns `child.data = data`; `update(dataById)` does
  that for each own key of the object and for nothing else, in the object's key
  order. A key that is not an id the dashboard knows warns once in development
  per id (RFC 0002 §7.2 style) and is skipped. Neither call touches the other
  tiles, so a polling loop can send only what changed.
- **Add requests are answered automatically.** The dashboard listens for the
  grid's `ts-add-request` (RFC 0003 §18.2). For a type in `addTypes` it calls
  `event.preventDefault()` to take the request and creates the child with
  `item=detail.id`, the catalog tag, and `data` if `update` or `data` had an
  entry for that id. The picker and `grid.add()` therefore work with no host code.
  A type outside `addTypes` is left alone, so another listener may still take it.
- **Removed items keep their child.** A tile the user removes becomes a hidden
  child (RFC 0001 §8.4); the dashboard never deletes it. "Add back" (or the
  picker's restore) shows the same element with the **data it already had**, and
  `set(id, …)` on a hidden tile still updates it, so the data is current when it
  returns.
- **Persistence.** With `persist`, the grid saves and restores its layout as RFC 0003
  §4 describes; children for ids that only exist in a restored layout are created
  when the grid reads it (the dashboard listens for the layout becoming known,
  `ts-columns-change` with `initial`, and for later `ts-layout-change`, and adds
  any missing child, once per id).
- **`destroy()`** removes its listeners, removes the grid from the DOM and drops
  its references (the children go with the grid). Calling it twice is fine.
  After it, `set` returns false and `update` does nothing, with one development
  warning each.
- **Built on the grid's public API only.** The dashboard reads `grid.layout`,
  `grid.addTypes`, the events and the DOM; it uses no member that starts with an
  underscore and no private module. A test asserts it.
- **No fetching.** It does not load the JSON; the host does and passes the
  object (RFC 0001: data in, nothing out).
- **Server rendering.** The module imports without a DOM; calling
  `createDashboard` without one throws `TypeError('createDashboard needs a DOM')`.

### 7.2 Messages

None. It writes no text of its own; the tiles and the grid carry theirs. Its
development warnings are developer text, not messages.

### 7.3 Accessibility

It adds no interface of its own. The grid it creates is the labelled region of
RFC 0003 §5.2, named by `label` or "Dashboard", and the tiles are the tiles. The
docs and the example point out that `label` should say what the dashboard is.

### 7.4 Files and order

Owned by the story, as in its JSON: `src/elements/dashboard.js`,
`src/elements/index.js`, `src/elements/index.d.ts`, `test/dashboard.test.mjs`,
`examples/vanilla-json.html` and `examples/data/sample.json`. It builds
**after** `more-generic-widgets` (shared `index.js` and `index.d.ts`), and
adds `docs/guide/create-dashboard.md` (a new page, the docs-coverage test
needs every export written up). `docs-coverage.test.mjs`' export scan is
extended only if no other story owns that file; otherwise the guide mentions
`createDashboard` by name, which the existing scan accepts.

### 7.5 Size

A small module in the all-in entry only; it is not in any widget entry. The
story reports the all-in and CDN movement.

### 7.6 What the story must show

- Fake-DOM tests (`test/dashboard.test.mjs`, importing only `src/` and `node:*`):
  the grid and one child per item with the right tag, `item` and initial `data`;
  one child for an id in two profiles; a top-strip id; a selector target; a
  missing target throws; `update()` sets only the named ids and leaves other
  `data` untouched (identity checked); unknown ids warn once each in development;
  an unknown type is skipped with a warning; a `ts-add-request` for a catalog
  type is prevented and answered with a child carrying `item=id`, one for a type
  outside `addTypes` is not; a removed item's child remains and keeps its data,
  and `set` updates it; `destroy()` removes the grid and listeners and is
  idempotent; no `_`-prefixed member is touched.
- `examples/vanilla-json.html` renders four widgets from `examples/data/sample.json`
  (made-up numbers), updates them on an interval from a local fetch, and renders
  under `npm run dev`. The story loads it in the browser and describes what it saw.

## 8. Hostile-input caps, the XSS spec, lint and the supply chain (amends RFC 0001 §4 and RFC 0002 §7)

Hostile input is harmless, and a release is traceable to its source. Layouts
and labels come from user data and storage; a hostile or broken value must never
run script, hang the page or crash a widget.

*Implemented by: security-hardening. It depends on release-gates and browser-tests (both merged).*

### 8.1 Layout caps

```ts
// tickslate. The defaults are 100 items per profile, 20 profiles and 128-character ids.
// They are constants inside src/core/layout.js (Internal), not an export: a name
// nobody needs to import is a name that never has to be kept (docs/VERSIONING.md).
interface LayoutIssue {
  // …code gains two values:
  code: /* …as now… */ | 'too-many-items' | 'too-many-profiles'
}

function readLayout(
  input: Layout | LayoutItem[] | unknown,
  options?: { catalog?: Catalog; device?: Device; unknown?: 'drop' | 'keep'; maxItems?: number; maxProfiles?: number },
): { layout: Layout; issues: LayoutIssue[] }
```

- **Items per profile: at most 100 (Decision 59).** Items past the limit are dropped
  (only the first 100 **entries** of the list are read, valid or not) and **one**
  `'too-many-items'` issue is reported for that profile, with `path` `profiles.<name>`,
  `fixed: 'dropped'` and a message that says how many were dropped ("Profile
  "market" has 130 items; only the first 100 are read."). The length is checked
  before any item is read, so a hostile list of a million entries costs one
  comparison, not a million reads.
- **Profiles: at most 20.** Profiles are read in key order; those past the limit are
  dropped and one `'too-many-profiles'` issue is reported with `path` `profiles`
  (Decision 60). The built-in `market` and `closed` always count and are read first,
  so they are never the ones dropped.
- **Ids: at most 128 characters.** An item or top-strip id longer than that is
  dropped with a `'bad-shape'` issue ("The id is longer than 128 characters")
  (Decision 60). It is a cap on user data a grid then writes into attributes and
  storage keys.
- **Hosts may change them for their own reads.** `maxItems` and `maxProfiles` accept
  a positive integer or `Infinity` in the options of a direct `readLayout` call; any
  other value is ignored and the default used. `<ts-grid>` and `persistLayout` pass
  nothing, so a layout from storage or the network is always capped (Decision 59).
- **Never throws, still.** The existing guarantee (RFC 0001 §4) is unchanged and is
  now also tested against random input (8.2).
- The caps bound a layout, not a page: a host can still render more tiles than
  100 across profiles if it builds the layout itself and bypasses the read.

### 8.2 The seeded fuzz test

`test/layout-fuzz.test.mjs` (node:test, no install):

- A **mulberry32** generator with a fixed seed builds **10,000** random JSON-like
  values: nested objects and arrays to depth 6, up to 150 entries per array, strings
  (including very long, empty and unusual ones: `__proto__`, `constructor`, `<img onerror=…>`),
  numbers (`NaN` is not JSON, so `Infinity`, `-0`, huge and fractional values are
  used), booleans, `null`, and layouts that are *almost* right (a correct shape with
  one field wrong).
- Each value goes to `readLayout` with and without options. **It never throws**, the
  result is always a valid layout (every profile a list of `{ id, size }` with a
  catalog size, at most 100 items, at most 20 profiles), and **each call takes under
  5 ms** measured with `performance.now()`. The generator's size limits are what keep
  that threshold generous on a slow runner; a call that exceeds it fails the run and
  is a bug in `readLayout`, not a reason to retry.
- The seed is printed on failure, and the failing value is re-run by seed and index.
- The same file tests the three limits with exact boundary cases (100 and 101 items,
  20 and 21 profiles, 128 and 129 characters).

### 8.3 The XSS spec

`test/browser/xss.spec.mjs` (Playwright, all five projects):

- A set of made-up payloads: an `<img src=x onerror="window.__xss=1">`, a
  `"><svg onload=…>`, a `</style><img …>`, a `javascript:` URL, an HTML entity
  version of each, and a payload with a null byte.
- Each payload is put into **every string a host can supply**: every string field in
  every widget's `data` (read from `static dataShape`), the `label` attribute, the
  `aria-label` and `messages` overrides, a layout item `id`, a `catalog` label, a
  description and a category, a `ts-add-request` id, and a `persist` key; and then
  the page is rendered and exercised (edit mode, picker open, a scrub, a sort).
- It asserts, for each, that **no script ran** (`window.__xss` is undefined and no
  dialog opened) and that **no `img` element exists in the document or in any
  shadow root**, walked recursively, so a payload that became markup fails even if
  its handler did not fire. The payload text is on the page as text.
- It runs in the CSP fixtures of RFC 0003 §14 as well, so a blocked handler and a
  harmless one cannot be confused.
- It finds, it does not fix: a payload that runs is reported as a failing test with
  the widget and field, and the fix is a follow-up story in the owning file.

### 8.4 Lint

`eslint.config.js` (flat config) and `package.json`'s `lint` script:

- **`eslint-plugin-no-unsanitized`**: `no-unsanitized/property` and
  `no-unsanitized/method` as errors for `src/elements/**`, so a non-constant
  `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write` fails CI
  (Decision 62 records the supply-chain choice). `escape.methods` lists
  `escapeHtml` (RFC 0003 §3.1) so a value passed through it is accepted.
- **`no-eval`, `no-implied-eval` and `no-new-func`** as errors for all of `src/`,
  mirroring the strict-CSP promise of RFC 0003 §14.
- **The existing constant-template sites.** The widgets assign module-constant
  template strings with `innerHTML` (RFC 0003 §14). The rule accepts string
  literals; a template built from several constants may still be flagged. Those
  sites are allowed by a **per-file override in `eslint.config.js`** that names the
  file, the rule and the reason, **not** by editing the widget files, which other
  stories own. Any flagged site that is *not* a module constant is a real
  finding: the story lists it in its report as a follow-up and does not fix it
  inside this boundary.
- `npm run lint` is added to `ci.yml` as its own job by `security-hardening`, after
  `quality-extras` has finished with that file. ESLint and the plugin are
  **devDependencies**; the unit suite (`npm test`) stays install-free, and installing
  them needs network access, so **the maintainer is asked first** (as for
  RFC 0003 §24's consumer examples).

### 8.5 Dependabot, CodeQL and pinned actions

- **`.github/dependabot.yml`**: ecosystems `npm` (the repository root, weekly, with
  minor and patch updates grouped into one pull request per week and major updates
  alone) and `github-actions` (weekly). Pull requests are labelled `dependencies`.
  Dependabot never auto-merges.
- **`.github/workflows/codeql.yml`**: CodeQL for `javascript-typescript`, on push to
  `master`, on pull requests into it and weekly on a schedule, with
  `permissions: { contents: read, security-events: write }` and `build-mode: none`.
- **Actions are pinned to a full commit SHA** in every workflow, with the tag in a
  trailing comment (`uses: actions/checkout@<40-hex> # v7`). The story resolves
  each tag to its SHA at build time with `gh api` and never writes a SHA from
  memory. Dependabot's `github-actions` ecosystem then keeps them current. This
  edits only the `uses:` lines of `ci.yml`, `attribution.yml` and `pages.yml`, which
  is why this story follows `quality-extras` (the shared-files table).
- **Every workflow** declares least-privilege `permissions` at the top
  (`contents: read` unless a job needs more).

### 8.6 The maintainer-only release workflow

`.github/workflows/release.yml`:

```yaml
on:
  workflow_dispatch:
    inputs:
      dry-run:
        description: 'Run every check and pack, but do not publish'
        type: boolean
        default: true
```

- **`workflow_dispatch` only.** No `push`, `pull_request`, `release` or schedule
  trigger, and a job guard `if: github.ref == 'refs/heads/master'`.
- **A protected environment.** The publish job declares `environment: npm-release`.
  The maintainer creates that environment in the repository settings with
  themselves as the required reviewer; nothing in the repository can create it,
  and no agent does (Decision 61). The job cannot start until they approve it.
- **Provenance.** The job has `permissions: { contents: read, id-token: write }`,
  sets up Node with the npm registry, runs `npm ci`, `npm run release`, then
  `npm publish ./dist-lib --provenance --access public` unless `dry-run` is true.
  npm provenance needs a public repository and a trusted-publisher or token
  secret, which the maintainer sets up; until then the workflow cannot succeed
  and `docs/RELEASING.md` says so.
- **It does not tag or release.** Version tags and GitHub releases remain the
  maintainer's (CLAUDE.md, hard rules): the workflow publishes the package and nothing
  else.
- **No agent ever runs it.** The story writes the file and the YAML is validated
  by parsing; it is never dispatched, and no step in any story calls it.
- `docs/RELEASING.md` gains the workflow's steps, the environment set-up and the
  rule that the maintainer alone dispatches it.

### 8.7 Messages and accessibility

No messages and no interface. The issues' texts are developer-facing strings in
`readLayout`'s existing style. The hardening changes what a hostile string
*can* do, never what a good one shows.

### 8.8 Files and order

Owned by the story, as in its JSON: `src/core/layout.js`, `src/core/index.d.ts`,
`test/layout-fuzz.test.mjs`, `test/browser/xss.spec.mjs`, `eslint.config.js`,
`package.json`, `.github/dependabot.yml`, `.github/workflows/codeql.yml`,
`.github/workflows/release.yml` and `docs/RELEASING.md`. **Also edited** (the
acceptance's "SHA-pinned actions"): the `uses:` lines of
`.github/workflows/ci.yml`, `attribution.yml` and `pages.yml`, and a `lint`
job in `ci.yml`. It builds **after** `quality-extras` (shared `package.json` and
`ci.yml`). The `LayoutIssue` code union and the two new `readLayout` options go in
`src/core/index.d.ts`. The story also updates the `readLayout` entry in
`docs/reference/core.md` and the issue codes in `docs/reference/events.md` if it
lists them, and `docs/guide/saving-layouts.md` gains a sentence on the caps;
these three are not owned by another P2 story.

### 8.9 Size

The limits and the checks are a few lines of core. The story re-measures the core
and reports it; it does not raise the core budget.

### 8.10 What the story must show

- The fuzz test of 8.2 passes and prints its seed; the boundary cases pass.
- The XSS spec of 8.3 passes in all five projects, or lists the failing widget and
  field.
- `npm run lint` passes on a clean tree, and a one-line change that assigns a
  non-constant string to `innerHTML` in `src/elements` fails it.
- Every `uses:` in every workflow is a 40-character SHA with a tag comment
  (a small node check reads `.github/workflows/*.yml`); the YAML of every workflow
  and of `dependabot.yml` parses; `release.yml` has `workflow_dispatch` as its only
  trigger and names the `npm-release` environment.
- Nothing in the story or its report claims the release workflow was run.

## 9. The API snapshot, visual baselines, versioning and coverage (no new library API)

Regression nets: CSS breaks and accidental API changes can't slip through, and
coverage is reported. The unit suite stays install-free; only the visual job
needs Playwright.

*Implemented by: quality-extras. It depends on browser-tests (merged).*

### 9.1 Visual regression

`test/browser/visual.spec.mjs`:

- **What is compared.** Every registered widget at every size it supports, in the
  light and dark themes, at a **desktop** viewport (1280 × 800) and a **phone**
  viewport (390 × 844). The page is the existing `test/browser/fixtures/widgets.html`
  (`?theme=light|dark`), which already lays out every widget at every size with the
  frozen clock and made-up data of `fixtures/data.js`. Each tile is captured with
  its own `locator.toHaveScreenshot()`. At the time of writing that is roughly
  fifty tiles, so about two hundred images (a made-up count; the story reports the
  real one).
- **Threshold.** `maxDiffPixelRatio: 0.001`, passed in each call. Animations are
  disabled (`animations: 'disabled'`) and the page already runs with reduced
  motion (the config's `reducedMotion`), so a pulsing dot cannot differ between runs.
- **One browser, one platform.** The spec runs in the `chromium` project only and
  skips the rest, because text rendering differs per engine and OS. Baselines are
  generated **in the pinned Playwright container**, never on a developer's
  machine: `mcr.microsoft.com/playwright:v<version>-noble`, where `<version>` is
  the exact `@playwright/test` version in `package.json` (pinned without `^`, so
  the container and the library move together). `npm run test:visual` runs the
  spec; `npm run test:visual:update` runs it with `--update-snapshots` inside that
  container through `docker run`. The story reports whether Docker was available;
  without it, it stops and says so rather than commit baselines from another
  platform.
- **Where baselines live.** In the repository, in Playwright's default folder next
  to the spec, `test/browser/visual.spec.mjs-snapshots/` (Decision 63). The folder is
  owned by this story and is added to the boundary here.
- **In CI.** `ci.yml` gains a `visual` job that runs in the same container image
  (`container:`), runs `npm run test:visual`, and on failure uploads the
  `expected`, `actual` and `diff` images as an artifact. It is a required check.
- **What it proves.** A one-pixel change to a CSS rule (a `padding` or a `gap`)
  fails the job, and the story demonstrates it once by making such a change
  locally, running the job's command, seeing it fail and reverting it.
- Intentional visual changes update the baselines in the **same PR**, and the PR
  says which look changed and why, as ACCESSIBILITY's manual checks already ask.

### 9.2 The API snapshot

`test/api-surface.test.mjs` is a node:test file that imports only `node:*` and
reads source with regular expressions, so it needs no TypeScript, no install and
no build. It compares the surface it finds with `test/api-surface.snapshot.json`
and **fails on any difference**:

```jsonc
{
  "core":     { "exports": ["EN", "configure", /* … sorted … */] },
  "elements": {
    "exports": ["TsGrid", "createDashboard", /* … */],
    "tags": {
      "ts-metric": { "class": "TsMetric", "attributes": ["as-of", /* … */], "events": ["ts-action:retry", /* … */], "parts": ["header", "label", /* … */] }
    }
  },
  "tokens":  ["--ts-accent", /* … declared in tokens.css, sorted … */],
  "entries": ["./elements/metric", /* … the exports keys of package.lib.json … */]
}
```

- **Exports** are read from `src/core/index.js` and `src/elements/index.js`
  (`export const|function|class` and `export { … }`, comments stripped), as
  `test/docs-coverage.test.mjs` already does. The file carries its own small
  copy of the reader; it does not import another test file, since importing one
  would register its tests twice.
- **`observedAttributes`** per tag: the class's list, with the base class's list
  merged in for a `[...super.observedAttributes, …]` spread, read from the
  `static get observedAttributes()` return array.
- **Events:** every event name a file fires (`_emit('ts-…')`, `new CustomEvent('ts-…')`) and
  every `ts-action` name a widget emits, written `ts-action:<name>`.
- **Parts:** every `part="…"` token in a file's template strings, split on spaces.
- **Tokens:** every `--ts-*` custom property **declared** in `src/themes/tokens.css`.
- **Entries:** the keys of `package.lib.json`'s `exports`.
- **A difference fails with a readable diff** (added and removed names per
  section) and one instruction: run `npm run api:update`
  (`UPDATE_API_SNAPSHOT=1 node --test test/api-surface.test.mjs`, which rewrites the
  snapshot file with sorted keys and two-space indentation), review the diff, and
  commit it **in the same PR**, with a changelog line under Added or Breaking
  (9.3). The snapshot therefore always matches the code on `master`.
- Adding an export, removing an attribute and renaming a part each fail it; the
  story shows one of them.

### 9.3 `docs/VERSIONING.md`

The policy states what is breaking for each surface. Under 0.x a minor release may
break and says so in the changelog's Breaking section with a migration line; from
1.0.0 only a major release breaks. A removal is announced first: the old name
keeps working for at least one minor release and warns once in development.

| Surface | Breaking | Not breaking |
|---|---|---|
| Core exports (`tickslate`) | Removing or renaming an export; a required new argument; a changed return shape (a removed or retyped field); throwing where it didn't | A new export; a new optional argument or field |
| Element classes and tags | Removing or renaming a tag or an exported class | A new element |
| Attributes and properties | Removing, renaming or changing the meaning of one; changing a default that changes behaviour a host relied on | A new attribute or property |
| Events and `ts-action` details | Removing or renaming an event or an action; removing or retyping a detail field | A new event; a new field; a new action that is opt-in through `actions` |
| Parts and slots | Removing or renaming one | A new part or slot |
| `--ts-*` tokens | Removing or renaming a token | A new token; a changed default *value* (Changed, not Breaking, unless it breaks a contrast floor) |
| Message keys (`EN`) | Removing or renaming a key, or removing a parameter | A new key; reworded English (listed under Changed) |
| Saved layouts (`LAYOUT_VERSION`) | A change that makes a layout a previous version wrote read differently; a bump without a migration | New optional fields; new issue codes |
| Package entries and `exports` | Removing or renaming an entry; dropping a condition | A new entry |
| Browser and Node floors | Raising a floor | Lowering it |
| Look and layout of widgets | Not API: the visual baselines make changes visible, and the changelog lists them under Changed | |
| Size budgets, `Internal` modules, tests | Not API: no promise | |

### 9.4 Coverage

- **`npm run coverage`** runs the unit suite under Node's own coverage
  (`node --test --experimental-test-coverage`) twice, with no new dependency:

  | Script | Files | Threshold (`--test-coverage-lines`) |
  |---|---|---|
  | `coverage:core` | `src/core/*.js` | **90** |
  | `coverage:models` | `src/elements/*.js` except the DOM-bound infrastructure listed in the script's `--test-coverage-exclude` (`grid.js`, `widget.js`, `picker.js`, `grid-controls.js`, `persist.js`, `registry.js`, `ticker.js`, `dev.js`, `scrub.js`, and the element-only wrapper files) | **80** |

  The widget files are included whole, because each view model sits in its
  widget's file; a new widget is therefore counted without anyone adding it to a
  list (Decision 64).
- **The story measures first.** If a threshold is not met by today's tests, it
  reports the measured figure and does not lower the number, write filler tests or
  fence code out of the report; the maintainer decides.
- A `coverage` job in `ci.yml` runs it (no install needed) and fails the build when
  a threshold fails. Branch and function coverage are printed, not enforced.

### 9.5 Messages and accessibility

None. These are repository tests and documents.

### 9.6 Files and order

Owned by the story, as in its JSON: `test/browser/visual.spec.mjs`,
`test/api-surface.test.mjs`, `test/api-surface.snapshot.json`, `docs/VERSIONING.md`,
`package.json` and `.github/workflows/ci.yml`; plus the baselines folder
(9.1) and a one-line mention in `docs/WORKFLOW.md`'s checks list if no other story
owns that file then. It builds **before** `security-hardening` (shared
`package.json` and `ci.yml`). Because the snapshot lists the surface, every other P2
story that adds a public name regenerates it in its own PR once this one has
merged; until then they cannot, so this story merges early.

### 9.7 Size

None: nothing ships. Tests and CI only.

### 9.8 What the story must show

- The visual job fails on a deliberate one-pixel CSS change and passes after
  the revert, with the container version stated in the report.
- The baselines cover every widget × size × theme × viewport, and the story
  reports the count.
- The snapshot test fails when an export is added, an attribute removed or a part
  renamed, and passes after `npm run api:update`; it runs under `npm test`
  without `npm install`.
- `docs/VERSIONING.md` has a row for each surface of 9.3.
- `npm run coverage` prints both figures and exits non-zero below a threshold (shown
  once by lowering the file set), and the report quotes the current numbers.

## 10. The four parked RFC 0003 amendments

RFC 0003's build left four questions parked. Each is a Decision row so the
maintainer can accept or reject it on its own. RFC 0003 stays as written; where a
row is accepted, this section replaces the cited text.

*Implemented by: 10.1 needs no code (it settles wording the code already follows). 10.3 is built by `density-and-text-scaling`. 10.2 and 10.4 are built by one small new story, `parked-amendments`, which the board gains when this RFC is approved; it owns `src/elements/registry.js`, `src/elements/messages-cache.js`, `src/elements/index.d.ts` (the `defineWidget` signature), `src/core/index.d.ts` (the `Translate` key type), `scripts/check-size.mjs` (the pair rows), `test/registry.test.mjs`, `test/messages.test.mjs` and `docs/guide/custom-widgets.md`, and builds after `more-generic-widgets` and `create-dashboard` for the shared `src/elements/index.d.ts`.*

### 10.1 `HighlightText` in forced colours (amends RFC 0003 §5.5 and §29, point 1)

RFC 0003 allows widget CSS the colour keywords `Highlight`, `CanvasText` and
`ButtonFace`, inside `@media (forced-colors: active)` only. The built widgets
also use **`HighlightText`**: a selected button is painted `Highlight`, and its
text must be the colour the user agent pairs with it, because `CanvasText` on
`Highlight` can fail the user's own contrast in some forced palettes.
`docs/ACCESSIBILITY.md` item 16 already lists the four.

- **Proposal.** The only colour keywords widget CSS may contain are `Highlight`,
  `HighlightText`, `CanvasText` and `ButtonFace`, and only inside
  `@media (forced-colors: active)` (and a few lines that must pair them with
  `forced-color-adjust: none`, as `.opt[aria-pressed="true"]` does). `HighlightText`
  is used only as the text colour on a `Highlight` background. The token rule
  is unchanged for every other colour.
- **No code changes.** The scan in `test/tile-chrome.test.mjs` already accepts the
  four; the row records it so the RFC and the code agree.

### 10.2 `defineWidget(tag, Ctor, { type, messages })` (amends RFC 0003 §1.1 and §3)

A widget author ships English defaults for the author's own strings with the
class instead of asking every host to configure them.

```ts
// tickslate/elements
function defineWidget(
  tag: string,
  Ctor: typeof TsWidget,
  options: {
    type: string
    /** English defaults for this widget's own keys, keyed by flat dotted keys. See the rules below. */
    messages?: Readonly<Record<string, string>>
  },
): void

// tickslate. A custom widget's keys aren't in `Messages`, so a key may be any string.
type Translate = (key: MessageKey | PluralBase | (string & {}), params?: Record<string, string | number | null | undefined> | null, count?: number | string) => string
```

- **Key rules.** Every key must start with `widget.<type>.` or `<type>.`, and may
  carry plural suffixes (`mrr.days.few`). A key that already exists in `EN` throws
  `TypeError`: a widget author may add strings, never override a built-in one
  (that is the host's job, with `messages`). A value that isn't a string throws.
  The table is copied and frozen on registration.
- **Resolution.** RFC 0003 §1.1's order, element → grid → `configure()` → `EN`,
  gains one step: element → grid → `configure()` → **the widget's registered
  defaults** → `EN`. A host's translation therefore always wins over the author's
  English, and the author's English wins over nothing. The defaults apply to every
  element whose class was registered by that call.
- **Labels follow.** RFC 0003 §3 says a class with no label shows
  `t('widget.<type>.label')`; with `messages` that key can now be answered by the
  author (`'widget.mrr.label': 'MRR'`), as can `.description` and `.empty`.
- **Idempotent.** Calling again with the same class does nothing, as before; with
  different `messages` it warns once in development and keeps the first table.
- **`onCatalogChange`** fires after the defaults are stored, so a grid re-renders
  with the right labels.
- `docs/guide/custom-widgets.md` and the MRR example use `messages` for the
  widget's strings.

### 10.3 A `--ts-num-width` token (amends RFC 0003 §5.4)

The parked list names only the token. This is the meaning the code needs:
**the average advance of a figure character, in `em`**, so figure sizes fit the
host's font rather than a guess.

| Token | Default (both themes) | Used by |
|---|---|---|
| `--ts-num-width` | `.62` | The figure-fitting formulas: `.cell .md`'s `100cqi / (var(--fc, 10) * .62 + .65)` in `widget.js`, and the `19cqi` and `9cqi` caps of `.big` and `.xbig`, which were measured for one face (comments in `widget.js`) |

- **A unitless number**, the em width of a typical figure character including its
  sign. The default is the value the formula uses today, so **nothing moves**: the
  baselines of §9.1 must be unchanged by this token.
- **Why.** A host that sets `--ts-font-num` to a wider face (a monospace font is
  about `.6`; some display faces are wider) currently risks clipped figures,
  because the factor is a literal in widget CSS. With the token the host states it
  once and the figures shrink to fit.
- It exists in `tokens.css`, `default-tokens.js` (the sync test keeps them equal)
  and the docs' token table. A test fails on a remaining literal `.62` in widget
  CSS.
- If the maintainer meant something else by the name (for instance a
  `font-stretch` axis for the number face), rejecting this row and saying what is
  meant is the cheap way to settle it.

### 10.4 "Each widget adds at most 15 kB to the grid" (amends RFC 0003 §25 and RFC 0002 §9)

RFC 0003 §25 sets "grid plus one widget at most 15 kB, enforced". It cannot hold:
the grid's own entry is already over 15 kB, so every pair is. `check-size.mjs` carries
the row as a warning, and the orchestration notes leave it parked.

- **Proposal.** The rule becomes: **each widget's entry adds at most 15 kB (15,360 B)
  min + gzip to the grid's**, measured as the size of an esbuild bundle of the grid
  entry plus that widget's entry (with the core and the shared chunks) **minus** the
  size of the grid entry bundled alone. The row `grid + <name> (bundled)` prints the
  pair total, the grid alone and the difference, and the **difference** is judged.
  It is enforced.
- **The grid's own size** is judged by its own per-entry budget (RFC 0003 §25), set
  by measurement as for every entry, so the grid cannot grow unnoticed either.
- **Why a difference.** It measures what the widget costs a host that already
  has the grid, which is the question "one more tile" asks, and it credits code the
  widget shares with the grid. It is not reachable by raising or lowering the grid's
  figure.
- The story builds the new rows, reports every measurement, and any widget over
  15 kB is reported to the maintainer rather than given a higher figure.

## 11. What the first trading dashboard found (amends RFC 0003 §4.1, §5.2 and §16, and RFC 0002 §4.4)

The maintainer's own trading dashboard, the first consumer, built on 0.2.0 and
found four rough edges. None adds a widget. Two are small options and two are
behaviour a host should be able to rely on, so they are written down here.

*Implemented by: trading-polish. A new story, which the board gains when this RFC is approved. It depends on density-and-text-scaling and edit-feedback (shared `grid.js` and `widget.js`) and on create-dashboard (shared `src/elements/index.d.ts`).*

### 11.1 `<ts-table>` columns that size to their content

A symbol column should take what its text needs, and the other columns should
share the rest, instead of every column getting an equal share.

```ts
interface TableColumn {
  // …as RFC 0003 §16, with one addition:
  /**
   * 'content': as wide as its widest text (the header or any cell), up to half the table.
   * 'fill': shares what is left with the other 'fill' and unset columns.
   * A number: that many CSS pixels, at least 40.
   * Unset (the default): today's behaviour, an equal share with the other unset columns.
   */
  width?: 'content' | 'fill' | number
}

interface TableModel {
  columns: Array<{
    // …as RFC 0003 §16, with one addition:
    width: 'content' | 'fill' | 'shared' | number    // resolved; 'shared' is the unset default
  }>
}
```

- **The default is unchanged** (Decision 70). A table whose columns set no `width`
  renders exactly as in 0.2.0, so no host moves.
- **Content columns** use the browser's own table layout: the column has
  `width: 1%` and `white-space: nowrap`, so it takes its widest cell and no more,
  with `max-inline-size: 50%` and an ellipsis (`.ell`) and `title` holding the full
  text when a cell is cut. Nothing is measured in script.
- **Fixed columns** write their width with the CSSOM (`col.style.inlineSize`), never
  markup. A number below 40, a non-finite number or any other string is treated as
  unset, with one development warning.
- **Fill and shared columns** divide the remaining width equally, as the shared
  columns do today. A table with only content columns lets the last one fill.
- **The priority-drop rule is unchanged** (RFC 0003 §16): the column budget still
  keeps `floor(width ÷ 56 px)` columns and drops the highest `priority` number
  first, whatever the columns' `width` options. A dropped content column frees its
  space for the others.
- **Alignment, signs, sorting and keyed rows** are untouched. The model only
  resolves `width`; the template writes it.

### 11.2 `persist` and a layout the host sets after connecting

A host often sets `grid.layout` a moment after the grid connects (after a fetch,
or in a framework's mount hook). The `persist` attribute must treat that layout
as the defaults, once, and still let a saved layout win. This is **settled
behaviour**, not a new option: there is one mechanism, and a separate
`persist-defaults` attribute is not wanted.

- **Capture.** `persist` captures the grid's layout as the defaults for a device at
  the first `ts-columns-change` with `initial: true` (RFC 0003 §4.1), **and
  captures again** whenever the host assigns `grid.layout` for that device
  afterwards, **until the first committed edit on that device** (a `ts-layout-change`
  from the user, `undo` included). From the first edit on, an assignment is the
  host replacing the board by hand, not a new default, and is not captured.
- **What it then shows.** After each capture the saved layout for the device, if
  there is one, replaces the defaults, as it does at load. A user's saved layout
  therefore always beats a host's later `grid.layout`, and with nothing saved the
  host's latest layout is shown. `reset()` returns to the **last captured** defaults.
- **The grid's own writes are not captures.** The layouts that `persist` applies
  itself (the defaults, a loaded layout, `reset()`) are marked internal and never
  re-captured, so no assignment loops.
- **An adapter's pending load** follows RFC 0003 §4.2 unchanged: a host's
  assignment while a load is pending changes the defaults on screen, and the late
  result still applies if the user has not edited.
- **The event order a host can rely on**, for one connection of a grid with
  `persist`:
  1. `connectedCallback` runs and the grid measures. It never emits during the
     connect call itself.
  2. `ts-columns-change` fires with `initial: true`. `persist` captures the grid's
     layout as the defaults, then applies the saved layout for that device if
     there is one (immediately for `localStorage`, later for an adapter).
  3. A host's `grid.layout = …` at any time before the user's first edit is
     captured as the defaults (same task as the connect, after step 2, or much
     later), and the saved layout, if any, is applied over it.
  4. Applying defaults or a saved layout **fires no `ts-layout-change`**: that
     event is for commits only (RFC 0002 §5). A host that wants to know what is
     on screen reads `grid.layout` or listens for `ts-columns-change`.
  5. The first user edit fires `ts-layout-change` and ends capturing for that device.
  A layout set **before** the grid connects counts as step 2's layout.
- `docs/guide/saving-layouts.md` states this order with one example (fetch a
  layout, assign it, see the saved one still win) and says what `reset()` does.

### 11.3 Narrow tiles: the heading never clips

At tile widths under about 180 px the header label does not get cut off at the
tile's edge.

- **Truncation, not clipping.** The label is a flex item that may shrink
  (`min-inline-size: 0`) with `overflow: hidden`, `white-space: nowrap` and
  `text-overflow: ellipsis`. Under the container width of **11.25 rem** (180 px at a
  16 px root, in a `@container ts-tile` rule, so it follows the reader's text size
  as §2.2 does), the header's meta text has already gone (the existing `.pre`
  rule), and a label that still does not fit ends in an ellipsis.
- **The full text is kept.** The visible text is truncated by CSS only: the DOM
  text is the whole label. The label element also carries `title` set to the
  effective label (written only when it changes), so a pointer user can read it,
  and the tile's accessible name and the heading's name already hold the full
  label (RFC 0003 §5.2). Assistive technology never hears a shortened label.
- **No new API.** There is no attribute, property, token or message. Logical
  properties only, so the ellipsis falls on the correct side in a right-to-left
  grid (RFC 0003 §9).
- A label shown short on purpose (Today's P&L's "Today" at S) is unchanged: its
  heading is still named by the plain label (ACCESSIBILITY item 1).

### 11.4 A host-level pretend clock

Demos and host tests freeze or move time. Today that takes `clock` on every grid
and widget; a host needs one place.

```ts
// tickslate
function configure(options: FormatOptions & {
  messages?: Partial<Messages>
  styleNonce?: string
  /** The time every grid and widget reads when none is set on the element: ms since the epoch. null clears it. */
  clock?: (() => number) | null
}): void
// currentConfig() returns it as `clock`, or undefined.
```

- **Resolution.** For `now()` in a widget and for a grid's schedule: the element's
  own `clock` property (as today), then `configure({ clock })`, then `Date.now()`.
  A widget does not read its grid's clock (unchanged), so a demo sets the one clock
  with `configure` and a test can still override one element.
- **It replaces per-element clocks for demos and host tests.** Setting `grid.clock`
  and `widget.clock` keeps working and wins, for an element that needs its own.
  `grid.clock` and `widget.clock` still return a function: the effective one.
- **Changing it re-renders.** `configure({ clock })` notifies `onConfigure`
  listeners (RFC 0003 §8), so every widget re-renders with the new time and every
  grid re-runs its schedule (`reschedule`, quietly, as setting `grid.clock` does)
  unless it has its own clock. Passing `null` returns to `Date.now()`.
- **Only a function counts.** Anything else is ignored with one development
  warning. The core stays pure: it stores the function and calls nothing; no core
  code calls it except `createCalendar`'s default `now` (§5.4), which reads the
  configured clock when there is one, so a pretend clock also makes `calendar.issues`
  deterministic. `fmt.ago` still takes `now` as an argument.
- **Per-call clocks are unchanged**: `createCalendar(…, { now })`, `fmt.ago(t, now)`.
- Production builds read the same option; there is no development-only clock.

### 11.5 Messages and accessibility

None are new. 11.1 and 11.2 add no text; 11.3 keeps the label's full text in the
accessibility tree; 11.4 is time, not interface. ACCESSIBILITY items 1, 7 and 12
apply and are re-tested for the table and the narrow header.

### 11.6 Files and order

Owned by the story: `src/elements/table.js`, `src/elements/grid.js`,
`src/elements/persist.js`, `src/elements/widget.js`, `docs/widgets/ts-table.md` and
`docs/guide/saving-layouts.md`. **Also needed, with no other P2 story owning them:**
`src/core/format.js` (the `clock` option and `currentConfig`), `src/core/calendar.js`
only for the one-line default of `now` (it follows `market-presets-and-breaks`), and
the declarations in `src/core/index.d.ts` and `src/elements/index.d.ts` (shared
files: the story rebases on the stories ahead of it). It builds **after**
`density-and-text-scaling` and `edit-feedback` (shared `widget.js` and `grid.js`)
and `create-dashboard` (shared `index.d.ts`). It also updates
`docs/reference/core.md` for `configure`'s `clock`, and tests in `test/table.test.mjs`,
`test/persist.test.mjs`, `test/format.test.mjs` and `test/tile-chrome.test.mjs`.

### 11.7 Size

The table grows by the width resolution and a few CSS rules; the grid and
`persist` by the capture rule; the core by one option. The story reports every
move and raises no budget.

### 11.8 What the story must show

- **Table:** `tableModel` resolves `width` for each value, invalid values fall back
  and warn once, an unset table is byte-for-byte the 0.2.0 model and markup, the
  priority drop is the same for the same input with and without widths, and a
  browser check at 390 and 1280 px shows a content column taking only its text.
- **Persist:** fake-DOM tests for the order of 11.2: a layout set before connect, after
  `initial`, much later, and after the first edit; the saved layout still wins; `reset()`
  returns to the last capture; no `ts-layout-change` for applies; the grid's own
  writes are not re-captured; an adapter's pending load.
- **Header:** at 150 px and 179 px tile widths the label ends in an ellipsis, never
  clips mid-glyph, the DOM text and accessible name are the full label, `title` is
  set, and at 200 px nothing changes. Light and dark, a `dir="rtl"` grid.
- **Clock:** with `configure({ clock })` a widget's `now()` and a grid's schedule
  follow it; an element's own clock wins; `null` restores `Date.now()`; changing it
  re-renders; a non-function warns once; nothing in the core calls it except the
  calendar default.

## 12. Budgets (amends RFC 0003 §25)

RFC 0003 §25's rules stand: every entry has its own enforced budget, set by the
story that adds it from its own measurement plus 10%, rounded up to the next
0.5 kB, with the date and a comment; **no story raises an existing figure or
shortens a string to fit one**; only the maintainer authorises a re-measure; and
a story that would exceed a budget says so in its fragment and reports it. This
RFC takes no measurements and names no budget figure.

| Section | What moves |
|---|---|
| §1 scrub | `chart`, `today-pnl`, `equity-curve` (the shared `scrub.js` and the tables); `grid + widget` deltas |
| §2 density | `grid` (the attribute and one `:host` block) and each widget's CSS tiers; the core is untouched |
| §3 edit feedback | `grid` (the badge, the lazy hint, the crossfade and the toast text) |
| §4 widgets | Three **new** entries, `breakdown`, `status`, `feed`, each budgeted from its measurement; the all-in and CDN files grow and are reported |
| §5 presets and breaks | The **core** (`dist-lib/index.js`, the UMD): breaks, seven presets and the coverage check; `session-clock` |
| §6 mini chart | One **new** entry, `mini-chart`, with Emberwick external; the all-in and CDN files do not change |
| §7 `createDashboard` | The all-in entry only; reported |
| §8 hardening | A few lines of core (`layout.js`); reported |
| §9 quality | Nothing ships |
| §11 trading polish | `table`, `grid`, the core (one option); reported |
| §10.4 | `scripts/check-size.mjs`: the pair rows become a judged difference (Decision 68) |

If the core, or an enforced entry, would exceed its budget, the story stops that
part, reports the measurement and the smallest change that would fit, and the
maintainer decides. Presets, in particular, could move to their own import if
the core is the problem (Decision 51).

## 13. What changes for existing hosts

0.2.0 hosts see these differences when P2 ships, which the changelog lists as
breaking or changed. Everything not in the table is additive: new attributes,
tokens, elements, messages, entries and options.

| Change | Was | Now | Section |
|---|---|---|---|
| Text sizes | Label `10px`, small `11px`, fixed px sizes | `--ts-label-size` `.6875rem` (11 px at a 16 px root), small `.75rem`, and the rest as rem tokens; text follows the reader's root font size | §2.3 |
| Charts and tab order | A chart has no tab stop of its own | Each chart that draws a plot has **one** tab stop, a slider that reads the chart point by point; `scrub="off"` removes it | §1.4 |
| The accessibility tree of three charts | An image with a summary | The same image, a slider, and a visually hidden table of the last 12 points | §1.4, §1.6 |
| Headline compacting | Compact text with no full value | Compact text with `title` holding the full value | §1.5 |
| Tile container | `container-type: inline-size` | `container: ts-tile / size`; a host that sets a widget's `height: auto` must give it a definite height | §2.2 |
| Layout reading | Any number of items and profiles | At most 100 items per profile and 20 profiles, and ids of at most 128 characters; the excess is dropped with an issue | §8.1 |
| Calendar state | `{ open, opensAt, closesAt, startedAt, progress }` | Adds `onBreak` and `ends` | §5.1 |
| Calendar object | No `issues` | `issues` and `holidaysThrough()` | §5.4 |
| Session clock | Silent | Warns once in development when a holiday list is about to run out | §5.4 |
| Profile schedule | A break would count as closed | A break counts as open unless `duringBreaks: 'closed'` | §5.1 |
| Scheduled profile switch | Tiles swap in one frame, announced | The board crossfades (not under reduced motion) and a toast offers **Keep** | §3.3 |
| `<ts-table>` columns | Equal shares | Unchanged unless a column sets `width` | §11.1 |
| `persist` defaults | Captured at the first measure only | Re-captured when the host sets `grid.layout` before the first edit | §11.2 |
| Narrow tile headers | A long label may be cut at the tile edge | Ends in an ellipsis; full text in `title` and the name | §11.3 |
| Default clock | Per element only | `configure({ clock })` also | §11.4 |
| `Translate` keys | Typed `MessageKey \| PluralBase` | Also any string, for custom widgets | §10.2 |
| `tickslate/elements` | Registers every element | Unchanged; `<ts-mini-chart>` stays out of it, as RFC 0001 §2 said, and RFC 0003 §2.1 now says | §6.1 |
| `grid + one widget` budget | 15 kB total, a warning | Each widget adds at most 15 kB to the grid, enforced | §10.4 |
| Repository | Tags on `uses:` lines, no lint | Pinned action SHAs, lint, CodeQL, Dependabot, a maintainer-only release workflow | §8.5, §8.6 |

P2 is proposed as **0.3.0** (Decision 69), with this table in the changelog.

## 14. Next

Not specified here, by name only: a manual assistive-technology pass (a process
story with no API, `manual-at-pass`), the later widgets (`later-widgets`), the
demo and public-release stories already scheduled, a hidden table for the mini
chart's last bars, height tiers for the built-in widgets the density story only
lists, `headlineTitle` for edge stats and capital funding, and a six-column layout
(RFC 0003 Decision 30). They get their own RFC when they are scheduled, if they
add a public name.

## 15. Decisions

This RFC's own decisions, numbered on from RFC 0003's 38 so that no number ever
means two things. The recommended option is marked **Recommended**. Reply per row, or
"go with the recommendations". Nothing is built until the rows are answered.

| # | Question | Options | Status |
|---|---|---|---|
| 39 | Is chart **scrubbing on by default**, and does a chart gain a tab stop? (§1.4) | **Recommended:** on by default, with one tab stop per chart that draws a plot, and `scrub="off"` on a widget or a grid to turn it off. Scrubbing only changes what the widget shows (as sorting does, RFC 0003 Decision 36), and the acceptance asks for a focusable chart.<br>Alternative: opt-in through an attribute, so no existing chart gains a tab stop.<br>Alternative: pointer only, with the keyboard and screen readers using the table (§1.6) alone. | Proposed |
| 40 | How is the keyboard scrubber exposed to assistive technology? (§1.4) | **Recommended:** a transparent `role="slider"` over the plot, with `aria-valuenow`, `aria-valuemax` and an `aria-valuetext` that is the readout. Screen readers speak a focused control's changed value text without any `aria-live`.<br>Alternative: a focusable `role="group"` with a hint and no value text, so a screen reader hears nothing as the keys move.<br>Alternative: no keyboard stop; the table alone is the keyboard and screen-reader route. | Proposed |
| 41 | How many recent points does the hidden table list? (§1.6) | **Recommended:** the last **12** drawn points, newest last, written in place through `rows.js`.<br>Alternative: 5, which reads faster but hides a week-long trend.<br>Alternative: every drawn point, which can be hundreds of rows for a screen-reader user to cross. | Proposed |
| 42 | Where does the full-value `title` go? (§1.5) | **Recommended:** on the headline value node (`part="value"`), so the tooltip appears over the number only, with the full value also in the tile's accessible name.<br>Alternative: on the widget host, so the tooltip appears anywhere over the tile.<br>Alternative: no `title`; a custom tooltip element, which needs more code and its own accessibility. | Proposed |
| 43 | What is the density switch called, and where does it live? (§2.1) | **Recommended:** `density="compact"` on `<ts-grid>` (as the story says), applied by the grid's own `:host` rule, plus the same three tokens under `[data-ts-density="compact"]` in the token files for elements outside a grid.<br>Alternative: `data-ts-density` only, like `data-ts-theme` and `data-ts-palette`, so the grid has no attribute of its own.<br>Alternative: tokens only, no attribute: hosts set `--ts-row`, `--ts-pad` and `--ts-gap` themselves. | Proposed |
| 44 | Do the **default** text sizes move to the rem scale, so labels become 11 px at a 16 px root? (§2.3) | **Recommended:** yes, for everyone: label `.6875rem` (from 10 px), `.xs` the same, `.sm` `.75rem` (from 11 px), and the rest as rem tokens. It is a visible change, listed under Changed and in §13, and it is what the acceptance asks.<br>Alternative: keep the px look by default (`.625rem` labels) and give the 11 px floor only to `density="compact"` or an opt-in token set.<br>Alternative: rem only for the large figures, leaving small text in px. | Proposed |
| 45 | How do widgets decide what to hide when a tile is short? (§2.2) | **Recommended:** container queries on the tile's height, in `rem` (`8.5rem` and `6.5rem` tiers), so the same rule means "too short for its text" at any root font size.<br>Alternative: container queries in px, which stop meaning that when the reader enlarges the text.<br>Alternative: a `ResizeObserver` in each widget toggling classes, which costs script and runs after layout. | Proposed |
| 46 | Who remembers that the first-run hint was dismissed? (§3.2) | **Recommended:** the host. The grid fires `ts-hint-dismiss`, keeps the mark hidden for that element, and stores nothing; the host stops setting `hint` (the library has no storage, RFC 0003 `persist` aside).<br>Alternative: `hint="my-key"` stores the dismissal in `localStorage` like `persist`, so the library stores something the acceptance says it must not.<br>Alternative: a cookie-style `hint-seen` attribute the grid writes, which mutates the host's markup. | Proposed |
| 47 | What does **Keep previous** do on the profile toast? (§3.3) | **Recommended:** calls the existing `grid.override(previous)`, so the previous profile stays until the schedule next changes, then the schedule takes over. No new state.<br>Alternative: a permanent pin, cleared only by Auto, which a user can forget and which the controls would have to explain.<br>Alternative: no action on the toast; it only tells them. | Proposed |
| 48 | How does `<ts-breakdown>` fold slices? (§4.1) | **Recommended:** with more than six slices, show the largest **five** and fold the rest into "Other" (`--ts-axis`), so at most six are drawn and each has a series colour.<br>Alternative: show the largest six and fold the rest, giving seven drawn slices and a seventh colour.<br>Alternative: a `max` option with no default fold, which leaves a legend of twenty. | Proposed |
| 49 | How many items does `<ts-feed>` show by default? (§4.3) | **Recommended:** 50, changeable with `max` in the data, with "{count} older events not shown" for the rest.<br>Alternative: 20.<br>Alternative: no cap, which a busy feed turns into thousands of nodes. | Proposed |
| 50 | Does `<ts-status>` have a fourth state beyond OK, Degraded and Down? (§4.2) | **Recommended:** yes, `unknown` ("Unknown", a hollow circle), for a service with no reading, so "no data" is never shown as OK or Down.<br>Alternative: exactly OK, Degraded and Down, with a service lacking data left out by the host.<br>Alternative: more states (maintenance, paused), which a host can already put in `detail`. | Proposed |
| 51 | Which presets does the P2 story add, and where do they live? (§5.3) | **Recommended:** `nyse` and `nasdaq` (with `segment` regular, pre, post or extended), `lse`, `cme` (equity index), `fx`, `crypto` and one lunch-break market, **Tokyo** (`tse`), all in `presets` in the core, hours read from the exchanges' own pages at build time and cited.<br>Alternative: the same set with Hong Kong as the lunch-break market.<br>Alternative: the same set in a separate import (`tickslate/presets`), if the core budget cannot take them. | Proposed |
| 52 | Does the grid switch profile at a lunch break? (§5.1) | **Recommended:** no. A break counts as open for `activeProfile`, and `duringBreaks: 'closed'` switches it for hosts that want that.<br>Alternative: yes, because the market is closed, which flips a trader's layout and fires the toast of §3.3 at lunch every day.<br>Alternative: no option; breaks never switch profile. | Proposed |
| 53 | How does the pure calendar know the date to judge holiday coverage against? (§5.4) | **Recommended:** `createCalendar` takes an optional `now` and otherwise reads `Date.now()` once, at creation, to build `issues`. The core already reads the clock for `presets.mcx`'s default years.<br>Alternative: a method `issuesAt(now)` the clock calls, which leaves `calendar.issues` empty.<br>Alternative: the session clock alone checks, with its own clock, and the core has no coverage issue. | Proposed |
| 54 | How far ahead must a holiday list reach before it is "running out"? (§5.4) | **Recommended:** warn when a non-empty list ends less than 30 days after `now`.<br>Alternative: 60 days.<br>Alternative: 7 days, which warns too late to fetch a new list on a quiet weekend. | Proposed |
| 55 | What does `<ts-mini-chart>` do when Emberwick isn't installed? (§6.1) | **Recommended:** the widget's error view with "The chart library isn't installed", plus one development warning. The rest of the page is unaffected.<br>Alternative: throw on import, which stops the host's whole module graph.<br>Alternative: render nothing, which leaves a blank tile and no reason. | Proposed |
| 56 | Is Emberwick imported statically or lazily? (§6.1) | **Recommended:** lazily, with `import('emberwick')` the first time there is data, so a missing or unresolvable peer is a widget error and the entry itself stays small.<br>Alternative: a static `import 'emberwick'` at the top of the entry, which is simpler but fails the whole import without the peer.<br>Alternative: the host passes the `Chart` class in (`TsMiniChart.chartClass = …`), so Tickslate imports nothing, at the cost of one more line for every host. | Proposed |
| 57 | What does `createDashboard` take beyond the listed options? (§7) | **Recommended:** two optional ones, `label` (the grid's `aria-label`) and `addTypes` (default `'*'`, so the picker and `ts-add-request` work with no host code), and the `target` may be a selector string.<br>Alternative: exactly the listed options, with the host setting `grid.addTypes` and the label on `dashboard.grid` itself.<br>Alternative: also `messages`, `heading-level` and `breakpoints`, which the host can already set on `dashboard.grid`. | Proposed |
| 58 | Which items get a child element? (§7.1) | **Recommended:** every id in every profile and the top strip, once each, so switching profile needs no further code.<br>Alternative: only the active profile's items, creating the rest when the profile changes, which needs the dashboard to follow profile events.<br>Alternative: none until `set()`, which hides a tile that has no data yet. | Proposed |
| 59 | What are the layout caps, and can a host raise them? (§8.1) | **Recommended:** 100 items per profile and 20 profiles, applied to everything the grid and `persistLayout` read; a direct `readLayout` caller may pass `maxItems` and `maxProfiles`.<br>Alternative: 200 and 50, which still bounds a hostile list but lets a very large board through.<br>Alternative: 50 and 10, closer to what a screen can show. | Proposed |
| 60 | How are the other caps reported? (§8.1) | **Recommended:** a separate `'too-many-profiles'` code beside the story's `'too-many-items'`, and ids of at most 128 characters dropped with `'bad-shape'`.<br>Alternative: one `'too-many-items'` code for both, which makes a host read the `path` to tell them apart.<br>Alternative: no id cap. | Proposed |
| 61 | What is the shape of the release workflow? (§8.6) | **Recommended:** `workflow_dispatch` only, with a `dry-run` input that defaults to true, a protected `npm-release` environment with the maintainer as the required reviewer, `id-token: write`, and `npm publish ./dist-lib --provenance`. It never tags or creates a release.<br>Alternative: also create the tag and GitHub release, which the maintainer's rules keep for themselves.<br>Alternative: trigger on a pushed tag, which the maintainer does not want an agent anywhere near. | Proposed |
| 62 | How are lint, Dependabot and pinned actions set up? (§8.4, §8.5) | **Recommended:** ESLint with `eslint-plugin-no-unsanitized` as a devDependency (the maintainer approves the install first), per-file overrides for the existing constant-template sites, weekly Dependabot for npm (grouped) and actions, CodeQL on push, pull request and weekly, and every `uses:` pinned to a SHA with the tag in a comment.<br>Alternative: a regex test instead of ESLint, which has no dependency but misses what ESLint's flow analysis finds.<br>Alternative: leave actions on tags and rely on Dependabot alone. | Proposed |
| 63 | Where do the visual baselines live? (§9.1) | **Recommended:** in the repository, beside the spec, generated in the pinned Playwright container, so a review sees the image change in the PR.<br>Alternative: Git LFS, which keeps the history small but needs LFS everywhere a clone happens.<br>Alternative: a CI artifact store compared against `master`, which hides the baseline from review. | Proposed |
| 64 | What do the coverage thresholds measure? (§9.4) | **Recommended:** 90% of lines in `src/core`, and 80% over `src/elements/*.js` without the DOM-bound infrastructure files, whole files so new widgets count without a list; the story measures first and reports rather than lowering a figure.<br>Alternative: 80% only for files with a `*Model` export, which needs the models split from their classes first.<br>Alternative: report-only, no threshold. | Proposed |
| 65 | Is `HighlightText` an allowed forced-colours keyword? (§10.1) | **Recommended:** yes, as the text colour on `Highlight`: the allowed set is `Highlight`, `HighlightText`, `CanvasText` and `ButtonFace`, forced-colours only. It is what the code and `docs/ACCESSIBILITY.md` already do.<br>Alternative: `CanvasText` on `Highlight` only, which can fail the user's own contrast. | Proposed |
| 66 | Can a custom widget ship default messages through `defineWidget`? (§10.2) | **Recommended:** yes, `defineWidget(tag, Ctor, { type, messages })`, keys under `widget.<type>.` or `<type>.`, never an existing `EN` key, resolved after the host's own overrides and before `EN`.<br>Alternative: no; authors keep `static emptyText` and a label, and hosts configure the rest.<br>Alternative: yes, and let authors override `EN` keys, which lets a widget reword the grid. | Proposed |
| 67 | Is there a `--ts-num-width` token, and what does it mean? (§10.3) | **Recommended:** yes: the average figure-character advance in `em`, default `.62`, replacing the literal in the figure-fitting formulas, with nothing visible changing.<br>Alternative: reject it; hosts that change `--ts-font-num` live with the literal.<br>Alternative: it means something else (the handbook names only the token); say what. | Proposed |
| 68 | How is the "grid + one widget" budget restated? (§10.4) | **Recommended:** each widget adds at most 15 kB to the grid, judged as the difference between the grid-plus-widget bundle and the grid bundle, enforced; the grid has its own enforced entry budget.<br>Alternative: keep 15 kB total, which cannot hold while the grid alone is over it.<br>Alternative: drop the pair rule and keep per-entry budgets only. | Proposed |
| 69 | Which version carries P2? (§13) | **Recommended:** **0.3.0**, with the §13 table in the changelog under Changed and Breaking. Under 0.x a minor release may break.<br>Alternative: split it: the type-scale change and the layout caps as 0.3.0, the rest as 0.4.0.<br>Alternative: wait and ship with the next breaking change. | Proposed |
| 70 | What does a `<ts-table>` column do when `width` is not set? (§11.1) | **Recommended:** exactly what it does today, an equal share with the other unset columns, so no existing table moves; `'content'`, `'fill'` and a pixel number are opt-in per column.<br>Alternative: text-format columns default to `'content'`, which is what the first dashboard wanted but moves every table that has a text column.<br>Alternative: all columns default to `'fill'`, which is today's behaviour under a new name and changes nothing. | Proposed |
| 71 | Where does the default clock live? (§11.4) | **Recommended:** `configure({ clock })`, read after an element's own `clock` and before `Date.now()`; widgets do not inherit their grid's clock.<br>Alternative: widgets also inherit the nearest grid's clock, so one `grid.clock` covers its tiles, but a grid then changes what its children read.<br>Alternative: a global setter outside `configure` (`setClock()`), which is a second configuration mechanism. | Proposed |

## 16. Points this RFC settles that no decision covers

Found while writing the signatures down. Each is a proposal the RFC's approval
accepts unless you amend it.

1. **`nearestPoint` and `plotFraction` are Internal** (§1.1); only the chart
   widgets use them. Nothing is added to `tickslate/elements`' exports.
2. **A chart's model keeps numbers, and `readoutAt` formats** the one point (or twelve
   table rows) the user is looking at (§1.2), so ticking charts pay for no text.
3. **`src/elements/scrub.js` is a new Internal file** owned by the scrub story
   alone, beyond its JSON list (§1.9).
4. **The scrub readout needs no live region**: the slider's value text does the
   speaking (§1.4).
5. **`container-type: size` on the tile** needs a definite height, which the grid
   and `standaloneCss()` already give (§2.2).
6. **Phones keep `--ts-row-compact`** under compact density; only `--ts-pad` changes
   there (§2.1).
7. **The badge is `aria-hidden`**, because keyboard resizes are already announced
   and a drag is silent by design (§3.1).
8. **A dismissed hint stays dismissed for that element** even if the host forgets to
   remove the attribute (§3.2).
9. **A scheduled switch and its toast replace the grid's `grid.profile`
   announcement** when the toast shows, so it is said once (§3.3).
10. **`<ts-breakdown>` draws at most six slices** and a zero slice stays in the
    legend (§4.1); `<ts-status>` keeps the host's row order (§4.2); `<ts-feed>`
    keeps the host's newest-first order and compensates the scroll position by hand
    because Safari lacks scroll anchoring (§4.3).
11. **The three generic widgets add no action names** (§4).
12. **`SessionState` gains `onBreak` and `ends`**, and `hours()` gains `breaks` (§5.1).
13. **A break is local time-of-day like `open`**, resolved with `zonedTime`, and a
    break past a date's close is ignored for that date (§5.1).
14. **Presets name no hours here, and cite their sources and dates in the code
    and the guide**; a test checks the citation exists, never the hours (§5.3).
15. **Sessions with no holiday list never raise a coverage issue** (§5.4).
16. **`<ts-mini-chart>` is not in `tickslate/elements` or the CDN bundles**, which
    amends RFC 0003 §2.1's wording and keeps RFC 0001 §2 (§6.1).
17. **The mini chart's data gains a `timeframes` list**, since L's buttons need
    one and RFC 0001's shape had none (§6.2).
18. **Theme colours reach Emberwick as resolved `rgb()` strings**, read back from
    a canvas (§6.4).
19. **`createDashboard` is exported from `tickslate/elements` only** and is not an
    element, so it has no define module or entry (§7).
20. **`LAYOUT_LIMITS` is not exported**: the caps are constants in `layout.js` and
    two options of `readLayout` (§8.1).
21. **The XSS spec finds, it does not fix**; a failing payload is reported with its
    widget and field (§8.3).
22. **`security-hardening` also edits the `uses:` lines of three workflows** it does
    not list, and so follows `quality-extras` (§8.5, shared-files table).
23. **The release workflow is written but never run**, and needs a maintainer-made
    `npm-release` environment and a public repository for provenance (§8.6).
24. **Visual baselines are generated only in the pinned container**; without
    Docker the story stops (§9.1).
25. **`test/api-surface.test.mjs` carries its own regex reader** rather than
    importing a test file (§9.2).
26. **A new small story, `parked-amendments`,** builds §10.2 and §10.4 once the
    maintainer accepts them; §10.1 needs no code and §10.3 rides with the density
    story (§10).
27. **`--ts-num-width`'s meaning is proposed here**, because the parked list names
    only the token (§10.3).
28. **The pretend clock is read after an element's own clock**, and `createCalendar`'s
    default `now` reads it too (§11.4, amends §5.4).
29. **`persist` re-captures defaults until the user's first edit**, never after it,
    and applying defaults or a saved layout fires no `ts-layout-change` (§11.2).
30. **A narrow tile truncates its label with an ellipsis and keeps the full text** in
    the DOM, the `title` and the accessible name (§11.3).
