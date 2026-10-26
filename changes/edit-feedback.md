### Added

- A size badge on a tile while it is resized, such as "Medium · 2×2", following the snapped size and fading a second after the last release or key press. It is decorative, mirrors under `dir="rtl"`, and its CSS part is `badge`.
- The `hint` attribute on `<ts-grid>`: a first-run coach mark (`part="hint"`, with a 44 px **Got it** button, `part="hint-dismiss"`) pointing at the first tile until it is dismissed or edit mode starts.
- The `ts-hint-dismiss` event, `detail: { reason: 'dismiss' | 'edit' }`. The library stores nothing: the host remembers it and stops setting `hint`.
- A scheduled profile change now shows a toast, "Switched to After close", with a **Keep Market hours** button that keeps the previous profile until the schedule next changes. `undo-toast="off"` suppresses it.
- The messages `grid.badge`, `grid.hint.touch`, `grid.hint.pointer`, `grid.hintDismiss`, `grid.profileSwitched`, `grid.keepProfile` and `grid.keptProfile`.

### Changed

- When the schedule changes the profile (`reason: 'schedule'`) or a kept override lapses (`'override-ended'`), the tiles crossfade through the Web Animations API, half of `--ts-motion` each way, instead of swapping in one frame. Your own `override()`, the `profile` attribute, the first render and every edit still apply at once, a crossfade in flight is cancelled when an edit or another switch begins, and nothing animates under `prefers-reduced-motion`.
- A scheduled switch is announced once, through the grid's polite status region ("Showing the After close layout."). The profile toast is a labelled group (`role="group"`), not a live region, so the switch is not spoken twice; the removal toast keeps `role="status"`. `docs/ACCESSIBILITY.md` item 18 is amended to say so.
- The status region names the built-in profiles as the controls do ("Showing the After close layout."), whether the profile changes by the schedule, `override()` or the `profile` attribute, where it used the profile's id ("closed") before. Other profiles are named by their own name.
- `ts-profile-change` fires once the new layout is on the board, so a handler reading `readingOrder` sees it; for a scheduled switch that is half-way through the crossfade.
- The hint card and its button have a transparent border, so forced colours draw their edges. A locale or messages change while the Keep toast shows rewords it. Starting to edit with focus on Got it moves focus to the first tile's handle.
- `override(null)`, your own clearing of an override, applies at once like `override(name)`; only a lapse the scheduler causes crossfades.

### Internal

- `src/elements/grid-feedback.js` (new, pure): the badge text and its fake-clock life, the hint's state machine, which profile changes crossfade and offer Keep, and the CSS-time parser for `--ts-motion`. `test/grid-edit-feedback.test.mjs` covers it, and `test/browser/edit-feedback.spec.mjs` with `fixtures/edit-feedback.html` shows it in the engines, with the pretend clock, reduced motion, axe and a strict CSP with Trusted Types.
- `src/elements/grid.js`: the undo toast's button is now "a label and a handler" (`_showToast(text, action)`); without an action it is Undo as before. The hint's card is built the first time `hint` is set, from a constant template, and positioned with `element.style` insets. The badge element is created with each chrome.
- `src/elements/index.d.ts` gains the `hint` attribute, the `ts-hint-dismiss` event and the three parts for the manifest. `test/tile-chrome.test.mjs` and `test/messages.test.mjs` change one expectation each: the grid's observed attributes now include `hint`, and `_showToast`'s parameter list is `text, action`.
- Deviation from RFC 0004 §3.3: the status region's `grid.profile` text takes the profile's display name (`controls.market`, `controls.closed`) so it reads "Showing the After close layout." as the RFC quotes; it said "closed" before. Everything else follows the RFC.
- Deviation from RFC 0004 §3.3: the crossfade also fades the phone top strip when it is showing, since pinned tiles sit in it and would otherwise swap in one frame beside a fading board.
- Deviation from RFC 0004 §3.2: edit mode ends the hint, and fires `ts-hint-dismiss` with `reason: 'edit'`, even when the card was not on screen (a locked grid cannot edit; an empty or hidden-page grid can), because the user has found editing either way.
- Behaviour kept from before: pressing Escape during a pointer resize cancels it, but releasing the button afterwards still clicks the resize button, which steps the size; this predates the story and is not changed here.
- Design choice (review M4): the hint card sits below the first tile and so covers the start of the second row until Got it is pressed; RFC 0004 §3.2 puts it beside the tile it points at and it never blocks input. Left as is.
- Left as follow-ups from the review: the profile toast group's `aria-label` repeats its visible text, as §3.3 prescribes (N2); `parseMs` falls back to 220 ms for `calc()` and unitless values in `--ts-motion` (N4); two unit tests guard the grid wiring by scanning source, the browser spec covers the behaviour (N5); a crossfade begun in a hidden tab waits for frames and lands on return (N7); no type fixture exercises `hint` or `ts-hint-dismiss` (nor `ts-reading-order-change`).
