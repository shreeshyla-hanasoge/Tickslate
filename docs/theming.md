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
| `--ts-pad` | Padding inside a tile | `18px` | `16px` | Every tile |
| `--ts-row-compact` | Row height at 2 columns (phones) | `150px` | same | `<ts-grid>` at 2 columns. Set in px |
| `--ts-gap-compact` | Gap at 2 columns (phones) | `10px` | same | `<ts-grid>` at 2 columns. Set in px |
| `--ts-num-weight` | Weight of figures | `500` | same | Every figure; the headline figures take `--ts-headline-weight`, which follows it |
| `--ts-num-weight-small` | Weight of small figures | `500` | `600` | Secondary figures; Graphite is heavier because light-on-dark text reads thinner |
| `--ts-label-size` | Size of a tile's label | `10px` | same | The label in every header, and the small labels beside figures |
| `--ts-label-case` | Case of a tile's label (`text-transform`) | `uppercase` | same | The same labels; `none` gives sentence case |
| `--ts-label-tracking` | Letter spacing of a tile's label | `.12em` | same | The same labels |
| `--ts-label-weight` | Weight of a tile's label | `600` | same | The same labels |
| `--ts-headline-weight` | Weight of headline figures | `var(--ts-num-weight)` | same | `.big` and `.xbig` figures; follows `--ts-num-weight` until you set it |
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
