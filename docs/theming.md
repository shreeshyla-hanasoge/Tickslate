# Theming

Every colour, size and typeface in a Tickslate widget comes from a `--ts-*` CSS
variable. There are no hard-coded colours in the widgets, so your own theme is a
few variables, never a fork.

Tiles look finished with only `import 'tickslate/elements'`. To theme them,
either link the stylesheet and override what you like, or set the variables
yourself.

```html
<link rel="stylesheet" href="node_modules/tickslate/tokens.css">
```

```css
/* Your own CSS, after it. A plain selector wins; no !important needed. */
:root { --ts-accent: #5b3fd6; --ts-radius: 14px; }
```

## How the defaults reach the page

- `tokens.css` is the canonical file. Every rule in it is wrapped in `:where()`,
  so it has **zero specificity**: any rule of yours beats it, whatever the
  order.
- If you do not load it, the first widget to connect checks whether
  `--ts-surface` is defined on the document element. If it is empty, the
  elements inject the same tokens inside `@layer tickslate.defaults` (and warn
  once in development). Unlayered CSS beats layered CSS whatever its specificity
  or order, so your `tokens.css` link or your own `:root { ... }` always wins
  over the injected defaults.
- The check looks at `--ts-surface` only. **If you define `--ts-surface`
  yourself and load no `tokens.css`, the defaults are not injected, and every
  token you did not set is undefined.** Either link `tokens.css` first, or set
  all the tokens a widget uses.
- If your own CSS is in cascade layers (`@layer base, components`), the
  injected `tickslate.defaults` layer is added after them and would outrank
  yours. Put it first in your layer order so your layers win:
  `@layer tickslate.defaults, base, components, utilities;`

## Light and dark

Paper is the light default. **Graphite**, the dark default, uses the Tailwind
gray scale (gray-900, 800 and 700) with emerald, rose, amber and indigo 400, so
a Tailwind app whose dark mode uses that palette needs no overrides.

Dark is opt-in: the OS preference is ignored unless you ask for it.

| You set | Theme |
|---|---|
| Nothing | Paper, whatever the OS prefers |
| `data-theme="auto"` on any ancestor | Follows `prefers-color-scheme` |
| `data-theme="dark"` or a `.dark` ancestor | Graphite |
| `data-theme="light"` | Paper again |

**Islands.** Because the blocks apply to any element, a dark island inside a
light page is `<ts-grid data-theme="dark">`, and a light island inside a dark
page is `<ts-grid data-theme="light">`. `data-theme="light"` comes last in the
file, so it beats a `.dark` ancestor.

Things to know:

- A direct declaration beats an inherited one. If you map `--ts-*` on `:root`
  and put `.dark` or `data-theme` on an inner element, Tickslate's dark values
  on that element win inside it. Declare your mapping on the same selector.
- Under `data-theme="auto"` the dark values apply in a
  `@media (prefers-color-scheme: dark)` block; with Tailwind's media strategy
  use `data-theme="auto"`, with its class strategy the `.dark` class is enough.
- Graphite changes more than colour: radius 12px, padding 16px, no shadow,
  area fills at 16%, and heavier small figures.

## Presets

Six ready-made themes, each its own opt-in file, switched by one attribute. A
host that uses none pays nothing: they are not in `tokens.css` and not in the
injected defaults.

```html
<link rel="stylesheet" href="node_modules/tickslate/tokens.css">
<link rel="stylesheet" href="node_modules/tickslate/themes/calm.css">

<ts-grid data-ts-theme="calm">...</ts-grid>
```

With a bundler, `import 'tickslate/themes/calm.css'` after `tokens.css`.

**Order.** With `tokens.css` linked, link the preset after it: the two have the
same (zero) specificity, so the later file wins on an element that matches both.
With only the injected defaults (no `tokens.css`), the order of the preset link
does not matter, because the defaults are in a cascade layer and any unlayered
preset beats them.

| `data-ts-theme` | What it is | Modes | Faces |
|---|---|---|---|
| `neutral` | White surfaces on a zinc scale, blue accent, sentence-case labels | Light and dark | `system-ui` for text and figures; nothing to load |
| `paper` | The default light tokens, restated so a grid can be light on a dark page | One: ignores `data-theme` | Geist and Newsreader, as the defaults |
| `graphite` | The default dark tokens, restated so a grid can be dark on a light page | One: ignores `data-theme` | Geist and Newsreader, as the defaults |
| `calm` | Soft contrast, 18px corners, sentence-case labels, monospaced figures | Light and dark | Geist, and Geist Mono for figures |
| `signal` | A black page in dark and a pale grey one (`#F2F2F5`) in light, 700-weight labels and figures, strong area tints | Light and dark | Geist |
| `terminal` | Dense and monospaced: 3px corners, 12px padding, hairlines, no area fill | Light and dark | Geist Mono |

- **Modes.** `neutral`, `calm`, `signal` and `terminal` are light by default and
  go dark under the same conditions as Graphite: `data-theme="dark"`, a `.dark`
  ancestor, or `data-theme="auto"` while the OS prefers dark. A light island
  wins as it does for the default tokens: `data-theme="light"` on the grid, or
  on an element between the grid and the dark ancestor, keeps it light, and a
  dark island inside a light page is dark. The nearest one decides, with one
  gap: a light island inside a dark island inside a light page renders dark
  under a preset (CSS cannot ask for "nothing of this kind in between" without
  `:has()`), so put `data-theme="light"` on the grid itself there.
  `paper` and `graphite` ignore `data-theme`: choosing the preset chooses the
  mode. The dark side of `calm`, `signal` and `terminal` follows the design
  references; their light side keeps the same type, corners, density and weight
  on a light page.
- **Put `data-ts-theme` on the grid or the widget** (any element), and
  `data-theme` on that element or an ancestor. A preset sets variables on the
  element it names, so everything inside follows it.
- **Fonts.** Tickslate does not ship or download any. `calm`, `signal`,
  `terminal` and the Geist and Newsreader of `paper` and `graphite` name a face
  first and a system face after it, so they work without the web font and look
  as designed when you load it (see Fonts below). `neutral` uses `system-ui`
  only. Monospaced figures are wider than proportional ones, so a large figure
  such as the equity curve headline can wrap its sign onto its own line in a
  two-column phone tile under `calm` and `terminal`.
- **Palettes win, on the same element.** A preset keeps the tokens a palette
  owns (`--ts-profit`, `--ts-loss`, `--ts-accent`, `--ts-focus` and the series
  colours) in a second block scoped
  `:where([data-ts-theme='calm']:not([data-ts-palette]))`. A grid with a
  `data-ts-palette` on the **same element** as its `data-ts-theme` therefore
  takes the palette's values for those tokens and the preset's for everything
  else. A palette on an ancestor does not win: the preset declares on the grid
  itself, so put `data-ts-palette` beside `data-ts-theme`.
- **Nested presets and a palette.** When an element with a preset sits inside
  another element with a preset, and the inner one has a `data-ts-palette`, the
  inner preset stops declaring the palette-owned tokens. Any of them the
  palette does not itself set are inherited from the outer element, so they
  show the outer preset's values, not the inner preset's.
- **Your own tokens.** Presets have zero specificity like everything else, so
  `:root { --ts-accent: ... }` does not reach a grid that names a preset
  (a preset declares directly on the grid); put your override on the grid's own
  selector, for example `ts-grid[data-ts-theme='calm'] { --ts-accent: #5b3fd6; }`.
- **Never touched.** A preset sets colour, corners, padding, shadow, fill and
  type tokens only, never `--ts-row`, `--ts-gap`, `--ts-motion` or `--ts-ease`,
  and never names a widget or a part.

Every preset is checked against the contrast floors below, in each mode it has
(`test/presets.test.mjs`), and the widget gallery (`widgets.html`) has a preset
switcher that shows every widget in each one.

## Palettes

Two opt-in colour choices, each one attribute, built into `tokens.css` and the
injected defaults (no extra file). Put the attribute on the grid, a widget, or
any ancestor, including one above a grid that sets its own `data-theme`,
`.dark` or `data-theme="auto"` (see Through themed islands below).

```html
<ts-grid data-ts-palette="cvd">...</ts-grid>
<ts-grid data-ts-palette="red-up">...</ts-grid>
```

| `data-ts-palette` | Effect |
|---|---|
| `cvd` | Profit becomes blue and loss orange (`#1D4ED8` and `#C2410C` in light, `#60A5FA` and `#FB923C` in dark). The accent, `--ts-focus` and the first series move from blue to purple, and series 2, 3 and 4 are re-chosen (terracotta or amber, teal, and a blue-green or cyan) so all six series colours stay at least 30 ΔE apart and the first two stay at least 15 ΔE from profit and loss under deuteranopia and protanopia. |
| `red-up` | Swaps the values of `--ts-profit` and `--ts-loss`, for markets where red means a rise. Nothing else changes. |

- **One value per element.** There is no combined `cvd red-up`.
- **Light and dark.** Each palette has a dark variant under the conditions
  Graphite uses (`data-theme="dark"`, a `.dark` ancestor, or
  `data-theme="auto"` while the OS prefers dark), with the same island rule as
  the presets: the nearest `data-theme` decides, with the same one gap (a light
  island in a dark island in a light page; put `data-theme="light"` on the
  element itself there).
- **`red-up` and colour vision.** It is the default pair swapped, so it keeps
  the default pair's separation: ΔE (CIE76, deuteranopia / protanopia) is 30.0 /
  12.0 in light and 9.2 / 29.0 in dark. It is a market convention, not a
  colour-vision aid; use `cvd` for that.
- **Checked.** `test/palettes.test.mjs` simulates deuteranopia and protanopia
  with the Machado 2009 matrices and measures CIE76 ΔE: under `cvd`, profit and
  loss are at least 40 apart in both themes. Text stays at 4.5:1 and the series
  and focus at 3:1 on `--ts-surface`, as in Contrast floors below.
- **Through themed islands.** A palette set once on `<body>` still applies to a
  `<ts-grid data-theme="dark">`, a `.dark` element, a `data-theme="light"`
  island or a `data-theme="auto"` grid below it: each of those picks the
  palette's light or dark values for its own mode. The nearest palette wins
  between `cvd` and `red-up`. An island that carries a `data-ts-theme` preset
  keeps the preset's colours (a preset beats a palette on an ancestor, as
  under Presets above); put the palette beside the preset to have it win.
- **With a preset.** The palette wins when both are on the same element; see
  Presets above. Palette contrast is tested against the default tokens only.
- Gains and losses still carry a sign and an arrow, so colour is never the only
  cue under any palette.

### High contrast preference

Under `@media (prefers-contrast: more)` the default tokens raise `--ts-line`
to at least 3:1 and `--ts-muted` to at least 7:1 against `--ts-surface`, in
light (`#8A8374` and `#4A463E`) and dark (`#6B7280` and `#D1D5DB`). It needs no
attribute. Each theme preset restates a raised pair for its own colours (the
pairs are specific to the preset, not the two default values above), so the
preference applies under a preset too; every preset is checked against the
same 3:1 and 7:1 floors in `test/presets.test.mjs`.

## Tokens

Each token with its Paper (light) and Graphite (dark) value. "same" means
Graphite does not override it. The values are checked against `tokens.css` by
`test/docs-coverage.test.mjs`.

| Token | Purpose | Paper | Graphite | Used by |
|---|---|---|---|---|
| `--ts-bg` | Page background behind the tiles | `#F3EFE6` | `#111827` | The grid and your page; no widget text renders on it except ink and muted. The edit outline under reduced motion is checked against it |
| `--ts-surface` | The tile surface | `#FFFDF8` | `#1F2937` | Every widget tile, the grid's toast, edit pill and empty panel |
| `--ts-surface-2` | A raised or recessed area on a tile: tracks, skeletons, pressed buttons | `#F1EBDE` | `#374151` | Progress tracks, skeleton blocks, the pressed range button; never carries coloured or muted text |
| `--ts-line` | Hairlines and borders | `#E2DACB` | `#374151` | Tile border, separators, gridlines, the pill and toast edges |
| `--ts-ink` | Primary text | `#1C1A16` | `#F3F4F6` | Headlines, figures, the grid's controls; also the Done and Undo button fill |
| `--ts-muted` | Secondary text | `#6A655B` | `#9CA3AF` | Labels, captions, axis text, "synced" meta, footers |
| `--ts-profit` | Gains | `#0E7A4E` | `#34D399` | Positive figures, the live dot, rising changes, profit side of curves |
| `--ts-loss` | Losses | `#C0362C` | `#FB7185` | Negative figures, falling changes, loss side of curves, drawdown shading |
| `--ts-warn` | Warnings | `#A85A06` | `#FBBF24` | The warning glyph in the error view |
| `--ts-accent` | Brand and interactive accent | `#2C52C4` | `#818CF8` | Progress fills, the target bar, the pressed range button underline, series 1; the default for focus rings |
| `--ts-axis` | Chart zero lines and axis rules; a mark that carries meaning, so firmer than --ts-line | `#948C7C` | `#6B7280` | The dashed zero line in `<ts-chart>`, `<ts-today-pnl>` and `<ts-equity-curve>` |
| `--ts-series-1` | Chart series, first in order of use | `#2C52C4` | `#818CF8` | `<ts-chart>` series 1 |
| `--ts-series-2` | Chart series 2 | `#B45309` | `#F59E0B` | `<ts-chart>` series 2 |
| `--ts-series-3` | Chart series 3 | `#0F766E` | `#2DD4BF` | `<ts-chart>` series 3 |
| `--ts-series-4` | Chart series 4 | `#8B3FB5` | `#C084FC` | `<ts-chart>` series 4 |
| `--ts-series-5` | Chart series 5 | `#BE185D` | `#F472B6` | Reserved: `<ts-chart>` draws four series, so nothing uses it yet; for your own charts |
| `--ts-series-6` | Chart series 6 | `#6B7A1A` | `#A3E635` | Reserved, as series 5 |
| `--ts-focus` | Focus rings | `var(--ts-accent)` | `var(--ts-accent)` | Every focusable control, as a 2px outline; follows `--ts-accent` unless you set it |
| `--ts-radius` | Tile corner radius | `10px` | `12px` | Tiles, the empty panel, the lifted tile |
| `--ts-radius-sm` | Small radius | `6px` | same | Buttons, skeleton blocks |
| `--ts-shadow` | Tile shadow at rest | `0 1px 0 rgba(28, 26, 22, .04), 0 8px 20px -12px rgba(28, 26, 22, .25)` | `none` | Tiles |
| `--ts-fill` | How strongly an area under a line is tinted (a percentage) | `12%` | `16%` | Area fills in curves and charts |
| `--ts-font-ui` | UI text face | `'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif` | same | Labels, buttons and the grid's controls |
| `--ts-font-num` | Figures face | `'Newsreader', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | same | Headline and small figures; tabular, lining numerals are forced on it |
| `--ts-row` | Grid row height | `150px` | same | `<ts-grid>` at 3 and 4 columns, and standalone tile heights. Set in px |
| `--ts-gap` | Grid gap | `16px` | same | `<ts-grid>` at 3 and 4 columns, and standalone tile heights. Set in px |
| `--ts-grid-max-width` | Widest the board grows; it is centred when capped | `none` | same | `<ts-grid>`. Set a length such as `1600px`; columns follow the board's own width, so a capped board on a large monitor keeps ordinary tiles |
| `--ts-pad` | Padding inside a tile | `18px` | `16px` | Every tile |
| `--ts-row-compact` | Row height at 2 columns (phones) | `150px` | same | `<ts-grid>` at 2 columns. Set in px |
| `--ts-gap-compact` | Gap at 2 columns (phones) | `10px` | same | `<ts-grid>` at 2 columns. Set in px |
| `--ts-strip-top` | How far below the top of the page the phone top strip sticks | `0px` | same | `<ts-grid>` at 2 columns, when tiles are pinned. Set it to the height of your own fixed header |
| `--ts-num-weight` | Weight of figures | `500` | same | Every figure; the headline figures take `--ts-headline-weight`, which follows it |
| `--ts-num-weight-small` | Weight of small figures | `500` | `600` | Secondary figures; Graphite is heavier because light-on-dark text reads thinner |
| `--ts-num-width` | Average advance of a figure character, in `em` (a unitless number), sign included | `.62` | same | The figures in a tile's stat cells (a row of three, the rail's column) are sized from it so the longest one fits. Set it for a wider `--ts-font-num`: a monospace face is about `.6`, a wide display face more. It does not touch the `--ts-text-*` sizes or the caps of `.big` and `.xbig`; adjust those with the type scale below |
| `--ts-label-size` | Size of a tile's label | `max(11px, .6875rem)` | same | The label in every header, and the small labels beside figures. 10px before 0.3.0; the px floor keeps it at 11px or more at any root font size |
| `--ts-label-case` | Case of a tile's label (`text-transform`) | `uppercase` | same | The same labels; `none` gives sentence case |
| `--ts-label-tracking` | Letter spacing of a tile's label | `.12em` | same | The same labels |
| `--ts-label-weight` | Weight of a tile's label | `600` | same | The same labels |
| `--ts-headline-weight` | Weight of headline figures | `var(--ts-num-weight)` | same | `.big` and `.xbig` figures; follows `--ts-num-weight` until you set it |
| `--ts-text-2xs` | Type scale step (9px at a 16px root) | `max(9px, .5625rem)` | same | Day numbers in the calendar, histogram labels |
| `--ts-text-xs` | Type scale step (10px at a 16px root) | `max(10px, .625rem)` | same | Secondary rows and the `.xs` text of a widget |
| `--ts-text-sm` | Type scale step (11px at a 16px root) | `max(11px, .6875rem)` | same | The `.sm` text: captions, footers, the "synced" meta; small buttons |
| `--ts-text-md` | Type scale step (12px at a 16px root) | `max(12px, .75rem)` | same | Error messages, empty-chart text |
| `--ts-text-base` | Type scale step (13px at a 16px root) | `max(13px, .8125rem)` | same | A tile's base text, and the grid's own controls |
| `--ts-text-lg` | Type scale step (14px at a 16px root) | `max(14px, .875rem)` | same | The grid's empty-board text |
| `--ts-text-xl` | Type scale step (16px at a 16px root) | `max(16px, 1rem)` | same | The grid's Remove glyph and Add back plus sign |
| `--ts-text-2xl` | Type scale step (17px at a 16px root) | `max(17px, 1.0625rem)` | same | `.md` figures and the cap of a figure in a cell |
| `--ts-text-3xl` | Type scale step (26px at a 16px root) | `max(26px, 1.625rem)` | same | The narrow equity-curve headline |
| `--ts-text-big` | Type scale step (34px at a 16px root) | `max(34px, 2.125rem)` | same | The cap of `.big` headline figures |
| `--ts-text-xbig` | Type scale step (48px at a 16px root) | `max(48px, 3rem)` | same | The cap of `.xbig` headline figures |
| `--ts-shadow-lift` | Shadow of a tile picked up while editing | `0 2px 6px rgba(28, 26, 22, .08), 0 28px 48px -18px rgba(28, 26, 22, .45)` | `0 2px 6px rgba(0, 0, 0, .3), 0 28px 48px -16px rgba(0, 0, 0, .7)` | The lifted tile and the grid's floating pill and toast |
| `--ts-motion` | Duration of the grid's slide animations | `220ms` | same | Tiles sliding into place |
| `--ts-ease` | Easing of the grid's slide animations | `cubic-bezier(.2, .8, .2, 1)` | same | Tiles sliding into place |

### Contrast floors

CI checks the pairs that are actually rendered, by the WCAG 2.x formula. If you
replace colours, keep them:

| Pair | Floor |
|---|---|
| `--ts-ink`, `--ts-muted`, `--ts-profit`, `--ts-loss`, `--ts-warn`, `--ts-accent` on `--ts-surface` | 4.5:1 |
| `--ts-ink` and `--ts-muted` on `--ts-bg` | 4.5:1 |
| `--ts-ink` on `--ts-surface-2` | 4.5:1 |
| `--ts-axis`, `--ts-focus` and `--ts-series-*` on `--ts-surface` | 3:1 |

No coloured or muted text is drawn on `--ts-surface-2`, so it needs only ink.

## Density and text size

Two settings change how much fits on a screen without changing a layout: the
density of the grid, and the text size, which follows the reader's own
font-size setting.

### Density

```html
<ts-grid density="compact">...</ts-grid>
```

`density="compact"` on a `<ts-grid>` sets three tokens on the grid:

| Token | `comfortable` (the default) | `compact` |
|---|---|---|
| `--ts-row` | `150px` | `120px` |
| `--ts-pad` | `18px` (`16px` under Graphite) | `12px` |
| `--ts-gap` | `16px` | `10px` |

- **A rule on the grid still wins.** The compact values sit on the grid's own
  `:host`, so `ts-grid { --ts-row: 140px }` in your stylesheet beats them. A
  value set on `:root` or on a wrapper is only inherited, so `density="compact"`
  overrides it: to keep your own `--ts-pad` under compact density, set it on the
  `ts-grid` element.
- **A phone keeps its rows.** At 2 columns the grid reads `--ts-row-compact`
  (150px) and `--ts-gap-compact` (10px), so on a phone `density="compact"`
  changes only the padding: a phone's rows are fixed so live numbers never
  resize a tile.
- **The layout is cells, not pixels.** Placement, drag targets and a saved
  layout are the same at either density. Changing the attribute (or the
  `density` property) re-measures. Any value other than `compact` is
  `comfortable`, with one development warning.
- **Outside a grid** (a widget in your own CSS grid) put `data-ts-density="compact"`
  on any ancestor to get the same three tokens, the way `data-ts-theme` works.

### Tiles answer their height

A tile is a size container (`container: ts-tile / size`), so a widget answers its
height as well as its width. That needs a definite height: a grid sets one, and a
standalone widget gets `rows × --ts-row` plus the gaps. A host that overrides a
widget's `height` to `auto` loses the container's height, and the tile collapses.

A height query measures the tile's **content box**: its height less the padding and
the border. Two tiers use it, and a widget gives up its secondary rows at each,
so nothing clips:

| Tier | Condition | What goes |
|---|---|---|
| snug | content box up to `6.5rem` | The secondary line under the headline (a footer, a note), and the flexible spacer that pushed it to the bottom, so the rows above it keep their room |
| tight | content box up to `5rem` | Also chart axis labels and the tertiary rows of a list |

At a 16px root a comfortable one-row tile has a content box of 7rem (7.25rem
under Graphite), so a default dashboard hides nothing; a compact one has 5.875rem,
so it is snug but not tight. The label, the headline figure with its sign and
arrow, the state of the data and every control stay at every height, and a hidden
row's content is still in the tile's accessible name. At a larger root font size
the same tile is shorter in rem, so it goes snug first: the text grew and the tile
didn't, and the widget gives up its secondary rows before anything clips.

To mark a row of your own widget for the tiers, give it the shared `sec` class
(hidden when snug) or `ter` class (hidden when tight).

### The type scale

Font sizes are tokens in rem, so a larger default text size reaches the tiles.
Each has a px floor, `max(<px>, <rem>)`: the rem value equals the px size at a
16px root and grows with a larger root, but a smaller root (the `html { font-size: 62.5% }`
habit) never takes text below the size it was designed at.

| Token | At a 16px root | Used for |
|---|---|---|
| `--ts-text-2xs` | 9px | Day numbers, histogram labels |
| `--ts-text-xs` | 10px | Secondary rows |
| `--ts-text-sm` | 11px | `.sm` text, small buttons |
| `--ts-text-md` | 12px | Messages |
| `--ts-text-base` | 13px | A tile's base text |
| `--ts-text-lg` | 14px | The grid's empty-board text |
| `--ts-text-xl` | 16px | The grid's glyphs |
| `--ts-text-2xl` | 17px | `.md` figures |
| `--ts-text-3xl` | 26px | The narrow equity-curve headline |
| `--ts-text-big` | 34px | The `.big` cap |
| `--ts-text-xbig` | 48px | The `.xbig` cap |
| `--ts-label-size` | 11px | The tile label |

- **Only the label changed size**: from 10px to 11px, so a label is at least 11px
  at any root size. The three presets that set it to 10px (`terminal`, `graphite`,
  `paper`) now use the same value.
- **Figures keep their shape.** A headline is still `min(<cap token>, <share of the tile's width>)`,
  so it shrinks with the tile first.
- **Row heights stay in px**, because a layout must not move when a reader changes
  a font. A host that wants tiles to grow with the text sets `--ts-row` in rem
  itself, for example `ts-grid { --ts-row: 9.375rem }`.
- **Not every widget follows yet.** `<ts-today-pnl>`, `<ts-equity-curve>`, the
  shared tile text and the grid's own controls use the scale. The rest of the
  built-in widgets still draw their small text in px until one follow-up
  converts them, so at a larger root font size their small text does not grow.

### Checking text spacing

WCAG 1.4.12 asks that text still fits when a reader sets line height to 1.5,
paragraph spacing to 2, letter spacing to .12em and word spacing to .16em. The
widget gallery (`widgets.html`) has a Text spacing switch that applies those four
overrides to the page and to every widget's shadow root, and a Density control, so
you can see both together. The library ships no such sheet.

## Fonts

The tokens name two faces but Tickslate does not load them:

- `--ts-font-ui` starts with **Geist**, then the system UI stack.
- `--ts-font-num` starts with **Newsreader**, then a **sans** stack, deliberately
  not Georgia: Georgia's digits are old-style and proportional, so live figures
  would jitter and sit at uneven heights without the web font. System sans
  digits are lining, and the figure classes force `tabular-nums`, so numbers
  stay equal width either way.

To use the designed faces, load them yourself (a `<link>`, `@font-face` or your
bundler) and nothing else changes. To use your own, set the variables:

```css
:root {
  --ts-font-ui: 'Inter', system-ui, sans-serif;
  --ts-font-num: 'Inter', system-ui, sans-serif;
}
```

Pick a font with tabular figures for `--ts-font-num`, or live numbers will
shift as digits change.

## The `@layer` defaults and the pre-upgrade rules

The injected defaults are the same blocks as `tokens.css` inside
`@layer tickslate.defaults`, plus the rules that keep a page from jumping before
the script defines the elements: a `<ts-grid>` that is not yet defined hides
its children and keeps one `--ts-row` of height, and each known widget tag keeps
its standalone height (twice the row plus a gap for the tall sizes). They are
`:not(:defined)` at zero specificity, so you can restyle them.

## Parts

Each element exposes its inner pieces for `::part()` styling from your page.
Prefer tokens; use parts for what tokens cannot express.

| Element | Parts |
|---|---|
| Every widget | `tile` (the tile's section), `error` (the error view's container) |
| `<ts-card>` | also `body` |
| `<ts-today-pnl>` | also `chart` (at `M`) |
| `<ts-grid>` | `board`, `placeholder`, `toast`, `edit-pill`, `empty` |

```css
ts-card::part(body) { padding-top: 4px; }
ts-grid::part(edit-pill) { bottom: 24px; }
```

## A brand theme in six variables

Six variables carry most of a brand: the page, the tile, the text, the accent,
and the two signs. The rest (`--ts-muted`, `--ts-line`, `--ts-surface-2`,
`--ts-axis`) are neutral enough to sit on top of them. These pairs were checked
against the floors above (ink 17.6 on the surface, accent 6.7, profit 5.3,
loss 6.0; Graphite variant: ink 14.9, accent 6.8, profit 9.9, loss 7.5).

```css
:root {
  --ts-bg: #f6f4fb;
  --ts-surface: #ffffff;
  --ts-ink: #1b1530;
  --ts-accent: #5b3fd6;
  --ts-profit: #0b7a55;
  --ts-loss: #b8322a;
}

/* Its dark side, for a dark attribute or class. */
:root[data-theme='dark'], .dark {
  --ts-bg: #120e22;
  --ts-surface: #1d1833;
  --ts-ink: #f1eefa;
  --ts-accent: #a794ff;
  --ts-profit: #4ade9a;
  --ts-loss: #ff8a80;
}
```

Link `tokens.css` first so the other tokens exist. `--ts-series-1` is a literal
that happens to equal the default accent, so charts do not follow
`--ts-accent`; set the series tokens too if you want them to.

## Tailwind

Tailwind v4 exposes its palette as CSS variables, so map the tokens to them:

```css
:root {
  --ts-bg: var(--color-stone-100);
  --ts-surface: var(--color-white);
  --ts-surface-2: var(--color-stone-100);
  --ts-line: var(--color-stone-200);
  --ts-ink: var(--color-stone-900);
  --ts-muted: var(--color-stone-600);
  --ts-accent: var(--color-indigo-600);
}
```

In Tailwind v3, put the same lines in a CSS file Tailwind processes and use
`theme()`: `--ts-surface: theme(colors.white);`. Graphite already is gray-900,
800 and 700 with 400-level accents, so with the class dark strategy the `.dark`
class on `<html>` switches Tickslate too and you map light only.

## shadcn/ui

shadcn/ui defines `--background`, `--card`, `--foreground` and friends, and
switches them with a `.dark` class, so map once and both modes follow:

```css
:root, .dark {
  --ts-bg: var(--background);
  --ts-surface: var(--card);
  --ts-surface-2: var(--muted);
  --ts-line: var(--border);
  --ts-ink: var(--foreground);
  --ts-muted: var(--muted-foreground);
  --ts-accent: var(--primary);
  --ts-focus: var(--ring);
  --ts-loss: var(--destructive);
  --ts-radius: var(--radius);
}
```

Notes: `.dark` is listed so the mapping beats Tickslate's own `.dark` block on
the same element. In older shadcn versions the variables hold bare channels
(`0 0% 100%`); wrap them, for example
`--ts-surface: hsl(var(--card));`. shadcn has no profit colour, so keep
Tickslate's or set `--ts-profit` yourself. Check the pairs against the contrast
floors: `--muted-foreground` in particular is often below 4.5:1 on a card.
