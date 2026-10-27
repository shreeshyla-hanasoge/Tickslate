# Accessibility: the definition of done

Every Tickslate widget meets this list before it merges, and so does every
change to an existing widget or to `<ts-grid>`. Reviewers check a PR against
it item by item. It was written before any new widget was built, as
[RFC 0002 §10](rfc/0002-integration-and-ux.md) asks, and it extends
[RFC 0001 §11](rfc/0001-api.md).

The target is WCAG 2.2 level AA. Where this list is stricter than WCAG, this
list wins.

## Names and structure

1. **Every tile is a labelled group whose name states its headline, and its
   label is a heading.** The tile is `<div part="tile" role="group" aria-label="…">`,
   and the name is the label followed by the result a sighted user reads first:
   `Signups, 1,204, up 12% vs last week`, not `Signups`. The view model builds
   it (`ariaLabel`), so node tests cover it. `<ts-grid>` is the one labelled
   region; the tiles are groups inside it, so a 12-tile dashboard is one
   landmark, not twelve.
   - The label is `role="heading"` with an `aria-level` from `heading-level`: the
     widget's own attribute, else the nearest `<ts-grid>`'s, else 3. Where the
     words it shows are not the plain label (`Today` in a small P&L tile, the
     open or closed title of the session clock) it is named by the plain label,
     so heading navigation lists labels. It is `role="heading"` and not an `<h3>`
     so shadow styles stay in control.
   - A live tile's name ends with `, live` (`time.live`), or with `, stale` (`time.staleWord`)
     once its data is older than `stale-after`. The warning is never colour alone: the
     header also reads `Stale · 3 min`, and the stale dot stops pulsing.
   - The name is written only when it changes, so a ticking value does not make a
     screen reader read the tile again.
   - Loading keeps the real label and sets `aria-busy="true"`.
   - The error view names the group `<label>, error: <message>`.
   - A widget with no label from any source is named by its tag, never by an
     empty `aria-label`, and warns in development. Its heading is hidden from
     the accessibility tree, since it would only repeat the tag.
2. **Charts have `role="img"` and a summary.** The `aria-label` states the
   result in words a listener can use: `Revenue, last 12,400; Cost, last 8,100`,
   or `Intraday P&L: low −₹715, now +₹2,185.65`. Lines, areas, ticks and dots
   inside are not exposed separately.
3. **Rows use table or list semantics.** Repeated items (positions, instruments,
   accounts, sessions, feed entries) are a `<table>` with header cells, or a
   `<ul>`/`<ol>` of `<li>`, or the matching ARIA roles. Never a stack of bare
   `<div>`s.
4. **Strings come from messages.** Every visible or spoken English string
   (labels, empty and error text, button names, announcements) is a key in
   `EN` (`src/core/messages.js`), never inline in a template or view model.
   A view model reads it with `ctx.t`, and `update()` fills static template
   text into a `data-k` node with `this.t`, so a host can translate or reword
   every one.

## Figures

5. **Gains and losses carry a sign and an arrow.** A positive change shows `+`,
   a negative one the true minus sign `−` (U+2212), never a hyphen. Beside the
   figure sits an `aria-hidden="true"` ▲ or ▼, so direction never depends on
   colour alone. Zero carries neither. Spoken names use words: "up 12%",
   "down 3%".
6. **Figures use `unicode-bidi: isolate`**, so a sign or currency symbol stays
   beside its digits in right-to-left pages.
7. **Figures keep their width.** Figure classes use tabular numbers, and long
   values go compact through `fmt.fit`, so a ticking value never resizes or
   reflows a tile.

## Interaction

8. **Targets are at least 44 × 44 px at 2 columns**, and wherever the pointer is
   coarse: action buttons, the remove and resize controls, the toast's Undo,
   the edit pill's Done and Add back.
9. **Everything a pointer can do, a keyboard can do.** Every action is a real
   `<button>`; nothing interactive sits inside another interactive element.
   Dragging always has a single-pointer alternative (tap-to-place, WCAG 2.5.7).
10. **Focus is always visible and never lost.** Focus rings are
    `outline: 2px solid var(--ts-focus)`, which survive forced colours. Focus
    never lands inside an `aria-hidden` or `inert` subtree, and when a control
    disappears focus moves somewhere sensible first.
11. **Actions are requests, and off by default** (RFC 0001 §8.3). A button that
    acts on the outside world appears only when the host lists it in
    `actions`.

## Layout and direction

12. **Logical CSS properties only.** `margin-inline-start`, `padding-inline-end`,
    `inset-inline-start`, `text-align: start` and so on; never `left`, `right`,
    `margin-left` or `text-align: right` in widget CSS, and a test fails on them.
    Chart drawing boxes, time axes and progress tracks force `direction: ltr`,
    because time runs left to right in every locale; their logical properties
    then resolve as left to right.

## Colour and contrast

13. **Contrast floors, on the pairs that are rendered:** 4.5:1 for text, 3:1 for
    marks (chart lines, axis rules, focus rings, the reduced-motion edit
    outline). `test/tokens.test.mjs` checks the token pairs in both themes; RFC
    0002 §6.6 lists them.
14. **No coloured text on `--ts-surface-2`.** Only `--ts-ink` text sits on
    `--ts-surface-2`. Muted, profit, loss, warn and accent text sit on
    `--ts-surface` or `--ts-bg`.
15. **Colour is never the only signal.** Signs and arrows carry direction,
    stripes carry shortfalls, a glyph and text carry an error. Entry and exit
    marks differ in shape (a circle and a diamond). Decorative glyphs (▲, ▼,
    the live dot, tick marks) are `aria-hidden`; range buttons add a visually
    hidden expansion, so `1W` is announced as "1W, 1 week".
    The loss corner of `<ts-pnl-calendar>` is an opt-in shape cue, not a
    default (RFC 0005 Decision 95): a default dashboard tells a loss by colour
    and by the signed figure in every cell's accessible name and in the summary.
    The cell itself draws no sign, so a sighted reader who cannot tell red from
    green and has not chosen the `cvd` palette has no shape cue there. The
    `cvd` palette and forced colours turn the corner on, and a host that wants
    it everywhere sets `--ts-loss-mark: currentColor`.
16. **Tokens only.** Widget CSS uses `--ts-*` variables and no colour values,
    so a host theme or a palette reaches every pixel. The one exception is
    `@media (forced-colors: active)`, where `Highlight`, `HighlightText`,
    `CanvasText` and `ButtonFace` (the user's own colours, `HighlightText` being
    the text colour that pairs with `Highlight`) keep the session-clock fill and ticks,
    the live dot, Today's P&L marks, chart lines, the selected `.btn.on` and the
    metric target bar visible. `test/tile-chrome.test.mjs` fails on a colour
    anywhere else.

## Motion and live data

17. **Reduced motion is respected.** Under `prefers-reduced-motion: reduce`:
    no live-dot pulse, no skeleton shimmer, no edit wiggle (a static outline
    instead), no sliding toast, no smooth scrolling, no change-flash tint
    (`flash`). State changes appear
    without movement.
18. **No `aria-live` on ticking values.** Prices, P&L and clocks change their
    labels silently. Only changes the user caused are announced: grid editing
    through the grid's polite status region, the undo toast (`role="status"`),
    and a scheduled change of profile, announced once through the grid's polite
    status region. The toast that offers to keep the previous profile is a
    labelled group (`role="group"`), not a live region, so the switch is
    spoken once. The resize badge and the first-run hint are never announced:
    the badge is `aria-hidden`, and the hint is a `role="note"`.

## Automated checks

These run in CI and must pass, but passing them is not the whole list:

- `npm test`: view-model names (`ariaLabel`), `test/tokens.test.mjs` (contrast
  floors), `test/element-names.test.mjs` (no attribute or property named like a
  DOM member), and the reduced-motion rules in the shared CSS.
- `npm run test:browser`: axe (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`)
  with no serious or critical violations, in both themes, with edit mode off
  and on; keyboard and tap-to-place flows; box sizes unchanged across data and
  states.

## Manual checks

Run these for every new widget, for any change to the grid's editing, and
before each release. Record the result in the PR.

| Check | How | Passes when |
|---|---|---|
| Keyboard only | Unplug the mouse. Tab through a dashboard; Enter on "Edit layout"; move, resize and remove a tile; Done; Undo | Every control is reachable in visual order, focus is always visible, nothing traps focus, and Done returns focus to where editing started |
| VoiceOver | macOS Safari, and iOS Safari on a phone. Read the dashboard with the rotor's landmarks, then edit with the keyboard (macOS) and with tap-to-place (iOS) | Each tile's name states its headline, charts read their summary, every move and drop is announced once, and nothing ticking is announced |
| NVDA | Windows, Firefox or Chrome. Browse mode through the dashboard, then focus mode to edit | As for VoiceOver; buttons are read as buttons with their names |
| Forced colours | Windows High Contrast, or Chromium's forced-colors emulation, in both themes | Tile boundaries, focus rings, chart lines, the live dot, the session-clock fill and ticks, Today's P&L marks, the metric target bar and selected buttons stay visible |
| 390 px | A 390 px wide viewport (or a real phone), both themes | Two columns, no horizontal scroll, 44 px targets, figures fit without clipping, long press doesn't start a text selection |

## Where the existing widgets stand (14 Oct 2026)

Today's P&L, the equity curve, the session clock and the grid were built under
RFC 0001 §11, before this list. The gaps it once listed are closed: gains and
losses carry ▲ and ▼, widget CSS uses logical properties, figures use
`unicode-bidi: isolate`, every string is a message, and every tile is a group
with a heading. What is still open is the manual assistive-technology pass
(VoiceOver, NVDA and forced colours on a real device), which the table above
describes and RFC 0003 §27 schedules.

New widgets (`<ts-card>`, `<ts-metric>`, `<ts-chart>` and everything after)
meet the whole list from their first PR.
