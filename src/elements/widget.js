/**
 * TsWidget: the base class every Tickslate widget extends (RFC 0001 §8.1).
 *
 * A widget is three small pieces on top of this class: a template, a pure
 * view model and an update function. The base owns everything else: the open
 * shadow root, the shared CSS, sizing, labelling, formatting, scheduling
 * renders and the empty state. Widgets never touch those.
 *
 * ── What a subclass sets ────────────────────────────────────────────────
 *
 *   static catalogKey = 'todayPnl'
 *     The key in the core's WIDGETS catalog. It supplies the supported sizes
 *     (so `size` snaps to them, and defaults to the first) and the default
 *     label. It wins over `static spec` when both are set.
 *
 *   static spec = { label: 'Signups', sizes: ['S', 'Wide'], phoneRows? }
 *     A host widget's own description, for a widget with no catalog entry.
 *     Sizes that aren't size names are dropped; a label that isn't a string
 *     is ignored.
 *
 *   get spec() → { label, sizes, phoneRows? }
 *     Read-only on the base; a subclass may override it (a widget that reads
 *     its sizes from attributes, say). Resolved from the catalog entry, else
 *     the validated static spec, else `{ label: '', sizes: [] }`. Size
 *     snapping and the default label read it.
 *
 *   static styles = `…`
 *     CSS for the widget's own content, appended after the shared CSS. Use
 *     only `--ts-*` tokens, never colours.
 *
 *   static template(variant) → string
 *     The HTML inside the tile for one variant ('S', 'Wide', 'M'…). Static
 *     markup only: no data in it, because it is built once per variant and
 *     the DOM it makes is kept while data changes. It must be a pure function
 *     of `variant`. Start it with `header({ dot, meta, … })`: the one header
 *     row, whose label is the tile's heading and whose parts are `header` and
 *     `label`. Give the headline figure `part="value"` and the drawing box
 *     `part="chart"`.
 *
 *   static viewModel(data, variant, ctx) → object
 *     Pure: data in, plain display strings and numbers out. `ctx` is
 *     `{ fmt, t, now, label }`: the formatter, the translate function for this
 *     element's messages, the current time in ms (from `clock` if set) and the
 *     effective label. Return `ariaLabel` to name the
 *     tile with its headline result ("Today's P&L, +₹2,185.65"); without it
 *     the tile is named by the label. A view model with `live: true` gets
 *     ", live" after that name from the base. `data` is never null here, and is `{}`
 *     for a `static dataOptional` widget that has none yet. If this throws,
 *     the base logs it once and shows the error view.
 *
 *   static dataOptional = false
 *     True for a widget that can draw something useful before it has data (a
 *     card with a static body). It renders its template while data is
 *     undefined, with viewModel getting `{}`; the skeleton then shows only
 *     for state="loading".
 *
 *   static emptyText = EN['widget.empty']
 *     What the empty state says (data === null), unless the host slots its own
 *     content into `slot="empty"`. A host that overrides `widget.<catalogKey>.empty`
 *     in its messages wins over it, and a built-in's default is the EN value.
 *
 *   static skeleton(variant) → string
 *     The loading view's markup: `.sk` blocks shaped like that variant's
 *     content, so content lands without the tile moving. Build them with
 *     `sk(width, height)`. Include `header()` (its label has `data-k="label"`)
 *     and the base fills it with the real label. The base wraps the markup in
 *     the `skeleton` part. Static markup, pure in `variant`.
 *     The default is a header, a headline bar and two text lines.
 *
 *   viewContext() → object
 *     Extra keys for viewModel's `ctx`, for what the pure view model needs
 *     from the element itself, such as an attribute:
 *       viewContext() { return { range: this.getAttribute('range') || 'All' } }
 *     The base's own keys (fmt, t, now, label) are added after these and win.
 *     Default: {}.
 *
 *   update(vm, variant)
 *     Write the view model into the DOM that template(variant) built, using
 *     `this.$(selector)`. Called on every render, so set `textContent` and
 *     attributes rather than rebuilding nodes: that is what lets live numbers
 *     change in place.
 *
 * Attributes a subclass observes: override the getter and keep the base ones,
 *
 *   static get observedAttributes() { return [...super.observedAttributes, 'range'] }
 *
 * and call super.attributeChangedCallback(name, old, value) from its own.
 * The same goes for connectedCallback and disconnectedCallback. A property
 * the subclass adds should call this.requestRender() in its setter, and be
 * listed in this.upgrade('range') on connect so a value set before the
 * element was defined isn't lost.
 *
 * ── What the base provides ──────────────────────────────────────────────
 *
 *   data            Get/set. Setting schedules ONE render per microtask,
 *                   however many times it is set. undefined (never set) shows
 *                   the loading skeleton; null shows the empty state.
 *                   Also a `data` attribute whose trimmed value starts with { or [:
 *                   parsed as JSON until the property is set, which then wins
 *                   for good. A parse failure shows the error view.
 *   static dataShape  Optional { key: kind | { kind, optional?, of? } } (see
 *                   dev.js). In development, data that doesn't match warns once
 *                   per element, naming the path. Production never checks.
 *   state           Attribute and property: 'loading' (a skeleton, even over
 *                   existing data), 'error' (the error view) or null.
 *   error           Property: a message shows the error view, null clears it.
 *   actions         Property: the action names the widget may offer, such as
 *                   ['retry']. Re-applied on connect; actionEnabled(name).
 *   size            Attribute and property, reflected. Snapped to the
 *                   widget's supported sizes; with no attribute, the first
 *                   supported size. <ts-grid> sets it.
 *   variant         Read-only: the size actually rendered (the snapped size).
 *   label           Attribute and property. Effective label: the attribute,
 *                   else t('widget.<catalogKey>.label') for a catalog widget,
 *                   else the spec's label. With none, a development warning,
 *                   and the tile is named by the tag.
 *   heading-level   Attribute, 1 to 6: the aria-level of the tile's heading.
 *                   The widget's own, else the nearest <ts-grid>'s, else 3.
 *   locale, currency, time-zone
 *                   Attributes. Each resolves: own attribute → nearest
 *                   ancestor <ts-grid>'s attribute → configure() defaults.
 *   formatter       The Formatter for those. Cached; rebuilt when any of its
 *                   inputs change.
 *   messages        Property. Overrides for this widget's strings; null clears.
 *   t               The translate function: messages on this element, then the
 *                   nearest <ts-grid>'s, then configure(), then EN. Cached like
 *                   the formatter. Static template text is never written
 *                   here: put it in a `data-k` node and fill it in update()
 *                   with this.t, so a template stays a pure function of its variant.
 *   clock           Settable `() => number`; tests and demos freeze time.
 *   now()           clock() or Date.now().
 *   $(selector)     querySelector in the shadow root, cached until the
 *                   template is rebuilt.
 *   requestRender() Schedule a render (coalesced per microtask).
 *   every(ms)       Re-render every `ms` while connected and the page is
 *                   visible; every(0) stops. Re-renders at once when the page
 *                   becomes visible again. Call it again to change the period.
 *   emit(action, detail)
 *                   Dispatch a bubbling, composed 'ts-action' CustomEvent
 *                   with detail `{ action, ...detail }` (RFC §8.3).
 *   upgrade(...names)
 *                   Re-apply properties that were set on the element before it
 *                   was defined. The base does this for data, size and clock.
 *
 * ── Rendering ───────────────────────────────────────────────────────────
 *
 * The tile is `<div class="tile" part="tile" role="group" aria-label>`, named
 * by the view model's ariaLabel (with ", live" after it while `vm.live`), and
 * its label is a `role="heading"` made by header() (RFC 0003 §5). The grid is
 * the one labelled region. Exactly one view is shown, first match wins (RFC
 * 0002 §2.3):
 *
 *   1. error    state 'error', `error` set, or a view model that threw
 *   2. loading  state 'loading', or data undefined (unless dataOptional)
 *   3. empty    data null
 *   4. content  anything else
 *
 * The section's content is rebuilt from template(variant) only when the
 * variant changed or when leaving another view; otherwise update() just writes
 * new values. The tile is a fixed box, so no view changes its size. Rendering
 * needs a connected element; connecting always renders.
 *
 * Importing this module needs no DOM (it is loaded by Node tests and during
 * server-side rendering); only constructing a widget does.
 */

import { WIDGETS, EN, createFormatter, currentConfig, onConfigure, snapSize, isSize, SIZES, SIZE_NAMES } from '../core/index.js'
import { DEV, warnOnce, checkShape, shapeMessage, parseErrorParts } from './dev.js'
import { ensureTokens } from './default-tokens.js'
import { translator } from './messages-cache.js'

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement

// attribute → createFormatter option
const FORMAT_ATTRS = [
  ['locale', 'locale'],
  ['currency', 'currency'],
  ['time-zone', 'timeZone'],
  ['hour-cycle', 'hourCycle'],
]

/**
 * Formatter options from the first source, nearest first, that has each
 * attribute. A source is anything with getAttribute: the widget, then its
 * <ts-grid>. Options nobody sets are left out so createFormatter falls back
 * to the configure() defaults.
 */
export function resolveFormatOptions(...sources) {
  const out = {}
  for (const [attr, key] of FORMAT_ATTRS) {
    for (const source of sources) {
      const value = source && typeof source.getAttribute === 'function' ? source.getAttribute(attr) : null
      if (value) {
        out[key] = value
        break
      }
    }
  }
  return out
}

/**
 * The CSS that gives a widget a height of its own when no grid sizes it:
 * rows × row height + the gaps between those rows, so a standalone M is as
 * tall as an M in a grid. A grid's inline height beats these rules.
 */
export function standaloneCss() {
  return SIZE_NAMES.map((name) => {
    const rows = SIZES[name].rows
    const height = rows === 1 ? 'var(--ts-row, 150px)' : `calc(${rows} * var(--ts-row, 150px) + ${rows - 1} * var(--ts-gap, 16px))`
    return `:host([size="${name}"]) { height: ${height}; }`
  }).join('\n')
}

/**
 * How a message names an element: `<ts-today-pnl item="pnl">`, or just the tag
 * without an item. It lives here rather than in dev.js because the render-failure error
 * uses it in production, and dev.js must vanish from a production build.
 */
export function describeElement(el) {
  const item = el && typeof el.getAttribute === 'function' ? el.getAttribute('item') : null
  return `<${el.localName}${item ? ` item="${item}"` : ''}>`
}

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/
const ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel']

/**
 * Only http:, https:, mailto:, tel: and relative URLs are accepted (RFC 0003 §7);
 * any other scheme (javascript:, data:) is ignored with one development warning.
 */
export function validateHref(raw, el) {
  if (typeof raw !== 'string') return null
  const stripped = raw.replace(/[\u0000-\u0020]/g, '')
  if (!stripped) return null
  // //host and \\host carry no scheme but are cross-origin, so they are rejected like one.
  if (/^[\\/]{2}/.test(stripped)) {
    if (DEV && el) warnOnce(`href-scheme:${el._uid || el.localName}`, `${describeElement(el)} href="${raw}" is a protocol-relative URL; use a full http or https URL or a path.`)
    return null
  }
  const match = SCHEME.exec(stripped)
  if (match) {
    const scheme = match[1].toLowerCase()
    if (!ALLOWED_SCHEMES.includes(scheme)) {
      if (DEV && el) {
        warnOnce(`href-scheme:${el._uid || el.localName}`, `${describeElement(el)} href="${raw}" has an unsupported scheme; only http, https, mailto, tel and relative URLs are accepted.`)
      }
      return null
    }
  }
  return raw
}

// A character no translation contains, to find where the time goes in "synced {time}".
const TIME_MARK = '\uE000'

/**
 * The words either side of the time in `time.synced`, so a tile can hide them
 * when it is narrow, and a translation that puts the time first still works.
 */
export function syncedParts(t) {
  // The message holds one {time}; a second would be text with no node to sit beside, so it is kept as words.
  const [pre = '', ...rest] = t('time.synced', { time: TIME_MARK }).split(TIME_MARK)
  return { pre, post: rest.join('') }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Skeleton block sizes are classes, not inline styles, so a host's strict
// style-src CSP can't blank them. Widths snap to 5% steps, heights to the few
// the content actually uses; 'x' is a fixed axis-label width.
const SK_WIDTHS = Array.from({ length: 19 }, (_, i) => 10 + i * 5)
const SK_HEIGHTS = [4, 6, 9, 10, 11, 12, 13, 16, 30, 44]
const SK_CSS =
  SK_WIDTHS.map((w) => `.sk.w${w} { width: ${w}%; }`).join(' ') +
  ' .sk.wx { width: 40px; } ' +
  SK_HEIGHTS.map((h) => `.sk.h${h} { height: ${h}px; }`).join(' ')

/**
 * One skeleton block: width as a percent (snapped to 5) or 'x' for an axis
 * label, height in px (snapped to the nearest the content uses).
 */
export function sk(width, height) {
  const w = width === 'x' ? 'wx' : `w${SK_WIDTHS.reduce((a, b) => (Math.abs(b - width) < Math.abs(a - width) ? b : a))}`
  const h = SK_HEIGHTS.reduce((a, b) => (Math.abs(b - height) < Math.abs(a - height) ? b : a))
  return `<span class="sk ${w} h${h}"></span>`
}

// The status dot is decoration: whether the tile is live is in its name (", live").
const DOT = '<span class="dot live" data-k="dot" aria-hidden="true" hidden></span>'
// "synced 11:42". The words either side of the time are their own nodes, so a narrow tile can hide them.
const META = '<span class="sm mut n meta" data-k="meta" hidden><span class="pre" data-k="pre"></span><span data-k="time"></span><span class="pre" data-k="post"></span></span>'

const HEADING = '[part="label"]'

/**
 * The header row every widget starts with: `[status dot][label][spacer][meta]`
 * (RFC 0003 §5.1). `part="header"` is the row and `part="label"` the label,
 * which is the tile's heading: the base writes its aria-level after each render.
 *
 *   dot      the live dot, hidden until the widget unhides it
 *   meta     true for the standard "synced 11:42" meta; a string of markup for a
 *            widget's own right-hand content (a count, range buttons)
 *   actions  a <slot name="actions"> after the meta
 *   extra    markup straight after the label
 *   inner    markup inside the label, for a label that shows two forms (the
 *            session clock's long and short title); the widget then writes
 *            those nodes, not the label's own text
 *   labelClass  an extra class on the label
 *
 * `inner` and a string `meta` go beyond the RFC's signature; without them the
 * clock's title and every widget's own meta could not use the shared row.
 */
export function header(opts) {
  const { dot = false, meta = false, actions = false, extra = '', inner = '', labelClass = '' } = opts || {}
  const right = (meta === true ? META : meta || '') + (actions ? '<slot name="actions"></slot>' : '')
  const label = `<span class="lb ell${labelClass ? ` ${labelClass}` : ''}" part="label" role="heading" aria-level="3" data-k="label">${inner}</span>`
  return `<div class="hd" part="header">${dot ? DOT : ''}${label}${extra}${right ? `<span class="f1"></span>${right}` : ''}</div>`
}

// The sign sits in the run of non-digits before the first digit: after a bidi mark (U+200E, U+200F, U+061C),
// after a currency in front ("€ +1,50" in nl), or at the very start. A sign after a digit is never the figure's.
const LEADING_SIGN = /^[^\p{Nd}]*?([+−])/u

/**
 * The ▲ or ▼ that goes beside a signed figure (RFC 0003 §5.5), read from the
 * text the reader sees so it can never disagree with it. The text, not the
 * number: a value that rounds to zero shows no sign, and so gets no arrow,
 * which only the formatted text knows. A figure that shows no sign (zero) gets
 * none. The glyph's node is `aria-hidden`: the sign is what a listener hears.
 */
export function arrowFor(text) {
  const sign = typeof text === 'string' ? LEADING_SIGN.exec(text) : null
  return sign ? (sign[1] === '+' ? '▲' : '▼') : ''
}

// The rules of the signed figures, for the widgets that draw them. `.fg` keeps the arrow, sign and digits on one line.
// A figure cell (.cell: a stat in a row of three, or the rail's column) is its own size container, and the figure in it
// is sized to the cell's width and its own length (--fc, set by update()). 0.62em a character is wider than any
// proportional face and covers a monospace one; the arrow and its gap take 0.65em. A roomy cell keeps the 17px cap.
export const FIGURE_CSS = `
.fg { white-space: nowrap; }
.cell { container-type: inline-size; }
.cell .md { font-size: min(17px, calc(100cqi / (var(--fc, 10) * .62 + .65))); }
`

/**
 * A figure that can be a gain or a loss: the ▲ or ▼ and the figure's text sit in one `.fg` box that never breaks, so the
 * arrow, the sign and the digits are one unit at any width ("▲+" over "₹8,104.00" reads as two numbers). The figure's
 * own box (and its tone class) covers both, and update() writes the arrow and the text to their own nodes, `${k}Ar`
 * and `${k}V`. A tile too narrow for it shrinks the type (see the figure rules of each widget), it never wraps it.
 */
export const figure = (cls, k, part = '') =>
  `<span class="${cls}"${part ? ` part="${part}"` : ''} data-k="${k}"><span class="fg"><span class="ar" aria-hidden="true" data-k="${k}Ar"></span><span data-k="${k}V"></span></span></span>`

// Headline figures shrink with the tile, capped at the design size.
//
// 1cqi is 1% of the tile's content box (its width less padding and border).
// A 10-character figure such as "+₹2,185.65" is about 5.0 × font-size wide in
// Newsreader (measured: 170px at 34px, 240px at 48px). On a phone's 170px S
// tile the content box is at worst 170 − 2×18 − 2 = 132px, so .big must be
// ≤ 132 / 5.0 = 26.4px: 19cqi = 25.1px, text ≈ 125px. A Wide tile there is
// about 351px, content 351 − 38 = 313px, and .xbig sits in roughly half of
// that (~150px): ≤ 30px, and 9cqi = 28.2px, text ≈ 141px. At desktop widths
// (S 304px → content 266px; Wide and M 624px → content 586px) 19cqi is 50px
// and 9cqi is 52px, so the 34px and 48px caps apply and nothing changes. The
// dark theme's smaller padding only gives more room. .md has no measured fit
// to meet; 12cqi keeps its cap everywhere but the narrowest tile.
// .n, .big and .xbig keep tabular-nums: with the system fallback face (see
// --ts-font-num) it is what stops live figures jittering as digits change.
// Every colour here is a token. A host's own theme is a few variables, not a fork.
export const SHARED_CSS = `
:host { display: block; }
:host([hidden]) { display: none; }
${standaloneCss()}
.tile {
  box-sizing: border-box; height: 100%; display: flex; flex-direction: column; gap: 10px;
  padding: var(--ts-pad, 18px); background: var(--ts-surface); border: 1px solid var(--ts-line);
  border-radius: var(--ts-radius); box-shadow: var(--ts-shadow); color: var(--ts-ink);
  font: 13px var(--ts-font-ui); overflow: hidden; position: relative;
  container-type: inline-size;
}
.hd { display: flex; align-items: center; gap: 8px; min-height: 18px; }
.lb {
  font-size: var(--ts-label-size, 10px); text-transform: var(--ts-label-case, uppercase);
  letter-spacing: var(--ts-label-tracking, .12em); font-weight: var(--ts-label-weight, 600); color: var(--ts-muted);
}
/* A figure keeps its sign and currency symbol beside its digits in a right-to-left page. */
.n, .big, .xbig {
  font-family: var(--ts-font-num); font-variant-numeric: tabular-nums lining-nums; font-weight: var(--ts-num-weight, 500); unicode-bidi: isolate;
}
.big, .xbig { font-weight: var(--ts-headline-weight, var(--ts-num-weight, 500)); }
.big { font-size: min(34px, 19cqi); line-height: 1; letter-spacing: -.01em; }
.xbig { font-size: min(48px, 9cqi); line-height: 1; letter-spacing: -.02em; }
.md { font-size: min(17px, 12cqi); }
.sm { font-size: 11px; }
.xs { font-size: 10px; }
.n.sm, .n.xs { font-weight: var(--ts-num-weight-small, 500); }
/* The arrow beside a signed figure (arrowFor): a small mark raised to the digits' middle, and no room taken when it is empty. */
.ar:empty { display: none; }
/* The gap after it is about .15em of the figure, so the arrow reads as a marker apart from the sign (margins are in the arrow's own, smaller em). */
.big .ar, .xbig .ar { font-size: .4em; margin-inline-end: .375em; vertical-align: .55em; line-height: 0; }
.n .ar { font-size: .7em; margin-inline-end: .22em; vertical-align: .1em; }
.mut { color: var(--ts-muted); }
.pos { color: var(--ts-profit); }
.neg { color: var(--ts-loss); }
.warn { color: var(--ts-warn); }
.acc { color: var(--ts-accent); }
.f1 { flex: 1; min-width: 0; }
.row { display: flex; align-items: center; gap: 8px; }
.rowb { display: flex; align-items: baseline; gap: 8px; }
.col { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.g3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.g4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.sep { border-top: 1px solid var(--ts-line); }
.ell { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.btn {
  font: 500 11px var(--ts-font-ui); min-height: 28px; padding: 0 9px; border-radius: var(--ts-radius-sm);
  border: 1px solid var(--ts-line); background: transparent; color: var(--ts-muted); cursor: pointer; position: relative; z-index: 2;
}
.btn.on { background: var(--ts-surface-2); color: var(--ts-ink); box-shadow: inset 0 -2px 0 var(--ts-accent); }
.visually-hidden {
  position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden;
  clip-path: inset(50%); white-space: nowrap;
}
.btn:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
/* Stretched link for href and activatable tiles (RFC 0003 §7). */
[part~="link"] {
  color: inherit; text-decoration: none; font: inherit; background: none; border: 0; padding: 0; margin: 0;
  cursor: pointer; outline: none; display: inline;
}
[part~="link"]::after { content: ''; position: absolute; inset: 0; z-index: 1; }
/* The ring is on the link's own overlay, which already covers the tile, so it works in engines without the parent selector (Firefox before 121). */
[part~="link"]:focus-visible::after { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: -2px; border-radius: var(--ts-radius); }
/* Plain slotted content stays under the overlay, so a click on it opens the tile. Only controls, and whatever the host puts in the actions slot, are lifted above it to take their own clicks. */
::slotted(:is(a, button, input, select, textarea, summary, [tabindex], [role="button"], [role="link"])), ::slotted([slot="actions"]) { position: relative; z-index: 2; }
/* Touch screens: the 44px minimum target the RFC asks for at 2 columns. */
@media (pointer: coarse) { .btn { min-height: 44px; min-width: 44px; } }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.dot.live { background: var(--ts-profit); animation: ts-pulse 2s infinite; }
/* The header's meta says 'synced 11:42', and on a tile narrower than 200px just '14:05', so the label keeps its room. */
.meta { flex: none; white-space: nowrap; }
@container (max-width: 200px) { .pre { display: none; } }
@keyframes ts-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ts-profit) 55%, transparent); }
  70% { box-shadow: 0 0 0 7px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}
@media (prefers-reduced-motion: reduce) { .dot.live { animation: none; } }
.empty { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--ts-muted); text-align: center; }
.err { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; text-align: center; }
.err-msg { display: inline-flex; align-items: flex-start; gap: 6px; max-width: 100%; font-size: 12px; font-weight: 500; color: var(--ts-ink); text-align: start; }
.err-msg svg { width: 14px; height: 14px; flex: none; margin-top: 1px; color: var(--ts-warn); }
.btn.retry { color: var(--ts-ink); }
.sk { display: block; flex: none; position: relative; overflow: hidden; border-radius: var(--ts-radius-sm); background: var(--ts-surface-2); }
.sk.grow { flex: 1; min-height: 0; width: 100%; }
/* The loading view's box. It lays its blocks out as the tile does, so a skeleton's markup needs no wrapper of its own. */
.skel { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 10px; }
.sk::after {
  content: ''; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--ts-surface-2) 35%, var(--ts-surface)), transparent);
  animation: ts-shimmer 1.6s ease-in-out infinite;
}
@keyframes ts-shimmer { to { transform: translateX(100%); } }
@media (prefers-reduced-motion: reduce) { .sk::after { animation: none; display: none; } }
${SK_CSS}
.lp, .ln { fill: none; stroke-width: 2; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.lp { stroke: var(--ts-profit); }
.ln { stroke: var(--ts-loss); }
.ap { fill: color-mix(in srgb, var(--ts-profit) var(--ts-fill, 12%), transparent); }
.an { fill: color-mix(in srgb, var(--ts-loss) var(--ts-fill, 12%), transparent); }
.lz { stroke: var(--ts-axis); stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
/* The one place widget CSS names colours: the user's own, which a host cannot theme (RFC 0003 §29, point 1).
   Backgrounds and box-shadows are dropped in forced colours, so what they drew is redrawn in marks that stay. */
@media (forced-colors: active) {
  .dot.live { background: Highlight; }
  .btn.on { background: Highlight; color: HighlightText; }
  .lp, .ln, .lz { stroke: CanvasText; }
}
`

const EMPTY_SPEC = Object.freeze({ label: '', sizes: Object.freeze([]) })

// Per class, so a widget's CSS and each variant's markup are built once.
const cssCache = new WeakMap()
const templateCache = new WeakMap()
const skeletonCache = new WeakMap()

function cssFor(Ctor) {
  let css = cssCache.get(Ctor)
  if (css === undefined) cssCache.set(Ctor, (css = SHARED_CSS + (Ctor.styles || '')))
  return css
}

function templateFor(Ctor, variant) {
  let byVariant = templateCache.get(Ctor)
  if (!byVariant) templateCache.set(Ctor, (byVariant = new Map()))
  let html = byVariant.get(variant)
  if (html === undefined) byVariant.set(variant, (html = Ctor.template(variant)))
  return html
}

function skeletonFor(Ctor, variant) {
  let byVariant = skeletonCache.get(Ctor)
  if (!byVariant) skeletonCache.set(Ctor, (byVariant = new Map()))
  let html = byVariant.get(variant)
  if (html === undefined) byVariant.set(variant, (html = `<div class="skel" part="skeleton">${Ctor.skeleton(variant)}</div>`))
  return html
}

const WARN_GLYPH =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.9 15 14.1H1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path><path d="M8 6.2v3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path><circle cx="8" cy="11.9" r=".95" fill="currentColor"></circle></svg>'

const STATES = ['loading', 'error']

// Gives each element its own warning keys: two <ts-card>s without an item
// would otherwise share one and the second would never warn.
let uids = 0

// How long data may stay undefined after connecting before development says so.
const NO_DATA_MS = 10000

// attribute that each formatter option comes from, for naming a warning's source
const FORMAT_ATTR = { locale: 'locale', currency: 'currency', timeZone: 'time-zone', hourCycle: 'hour-cycle' }

/** The nearest ancestor <ts-grid>, looking out through shadow roots. */
function findGrid(el) {
  if (el.closest) {
    const g = el.closest('ts-grid')
    if (g) return g
  }
  let node = el.parentElement || (el.getRootNode && el.getRootNode().host)
  while (node) {
    if (node.localName === 'ts-grid') return node
    node = node.parentElement || (node.getRootNode && node.getRootNode().host)
  }
  return null
}

// The widgets that are connected. One subscription to configure() serves them
// all, and exists only while there is at least one, so nothing is held after the
// last widget leaves the page.
const mounted = new Set()
let stopListening = null

function mount(widget) {
  mounted.add(widget)
  if (!stopListening) stopListening = onConfigure(() => mounted.forEach((w) => w.invalidate()))
}

function unmount(widget) {
  mounted.delete(widget)
  if (!mounted.size && stopListening) {
    stopListening()
    stopListening = null
  }
}

const ACTION_OPEN = 'open'
const findLink = (t) => t?.closest ? t.closest('[part~="link"]') : (t?.getAttribute?.('part') === 'link' ? t : null)

export class TsWidget extends Base {
  static get observedAttributes() {
    return ['size', 'label', 'locale', 'currency', 'time-zone', 'hour-cycle', 'state', 'data', 'heading-level', 'href', 'activatable']
  }

  constructor() {
    super()
    // undefined, not null: a widget nobody has given data yet is loading, not empty.
    this._data = undefined
    this._error = null
    this._actions = Object.freeze([])
    this._clock = null
    this._queued = false
    this._shown = null // a variant for content, 'view:…' for the other views, or null before the first render
    this._refs = new Map()
    this._fmt = null
    this._fmtKey = ''
    this._messages = null
    this._renderT = null
    this._grid = null // the grid this widget has told about itself, so it hears when the grid's messages or locale change
    this._every = 0
    this._timer = 0
    this._failed = false
    // The JSON data attribute (RFC 0002 §2.6): the property wins once set, so
    // the attribute only feeds _data while this is false.
    this._dataSet = false
    this._fromAttr = false
    this._parseError = false
    // Development diagnostics. Unconditional fields are cheap; the code that
    // reads them sits behind `if (DEV)`.
    this._uid = ++uids
    this._undefTimer = 0
    this._checkedData = undefined
    this._onVisibility = () => {
      if (this._visible()) {
        this._arm()
        this.requestRender()
      } else {
        this._disarm()
      }
    }
    const root = this.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>${cssFor(this.constructor)}</style><div class="tile" part="tile" role="group"></div>`
    this._section = root.querySelector('.tile')

    // One delegated listener: Retry button in error view; tile activation for links and open actions (RFC 0003 §7).
    this._section.addEventListener('click', (e) => {
      const t = e.target
      const retry = t?.closest?.('[data-action]')
      if (retry && retry.getAttribute('data-action') === 'retry' && this.actionEnabled('retry')) {
        this.emit('retry')
        return
      }
      const link = findLink(t)
      if (!link) return
      if (this._isEditing()) {
        e.preventDefault?.()
        e.stopPropagation?.()
        return
      }
      // Only the button exists when the tile opens; a valid href renders a real link and navigates natively.
      if (link.localName === 'button') {
        e.preventDefault?.()
        this.emit(ACTION_OPEN, { id: this.getAttribute('item') || '' })
      }
    })
    this._section.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && findLink(e.target)) {
        if (this._isEditing()) {
          e.preventDefault?.()
          e.stopPropagation?.()
        }
      }
    })
  }

  // ── Public API ─────────────────────────────────────────────────────────

  get data() {
    return this._data
  }

  set data(value) {
    this._data = value
    this._dataSet = true
    this._fromAttr = false
    this._parseError = false
    this.requestRender()
  }

  /** 'loading', 'error' or null; anything else reads as null. */
  get state() {
    const value = this.getAttribute('state')
    return STATES.includes(value) ? value : null
  }

  set state(value) {
    if (value === null || value === undefined || value === '') this.removeAttribute('state')
    else this.setAttribute('state', value)
  }

  get error() {
    return this._error
  }

  set error(value) {
    const message = value instanceof Error ? value.message : value
    this._error = typeof message === 'string' && message ? message : null
    this.requestRender()
  }

  get actions() {
    return this._actions
  }

  set actions(value) {
    this._actions = Object.freeze(Array.isArray(value) ? value.filter((a) => typeof a === 'string') : [])
    this.requestRender()
  }

  actionEnabled(name) {
    return Boolean(this._actions && this._actions.includes(name))
  }

  get size() {
    const supported = this._supported()
    return snapSize(this.getAttribute('size') || supported[0], supported)
  }

  set size(value) {
    if (value === null || value === undefined || value === '') this.removeAttribute('size')
    else this.setAttribute('size', value)
  }

  get variant() {
    return this.size
  }

  get label() {
    const own = this.getAttribute('label')
    if (own) return own
    // A catalog widget's label is a message, so a translated app never shows the English one.
    const key = this.constructor.catalogKey
    if (key && Object.prototype.hasOwnProperty.call(WIDGETS, key)) {
      const id = `widget.${key}.label`
      const text = this.t(id)
      if (text !== id) return text
    }
    return this.spec.label
  }

  /**
   * The widget's description: catalog entry, else a validated static spec,
   * else nothing. Validated here, not at class definition, so a subclass can
   * set `static spec` in any order and a bad entry degrades to fewer sizes
   * rather than throwing in a render.
   */
  get spec() {
    const Ctor = this.constructor
    const key = Ctor.catalogKey
    if (key && Object.prototype.hasOwnProperty.call(WIDGETS, key)) return WIDGETS[key]
    const own = Ctor.spec
    if (!own || typeof own !== 'object') return EMPTY_SPEC
    const out = {
      label: typeof own.label === 'string' ? own.label : '',
      sizes: Array.isArray(own.sizes) ? own.sizes.filter(isSize) : [],
    }
    if (own.phoneRows && typeof own.phoneRows === 'object') out.phoneRows = own.phoneRows
    return out
  }

  set label(value) {
    if (value === null || value === undefined) this.removeAttribute('label')
    else this.setAttribute('label', value)
  }

  get href() {
    return this.getAttribute('href')
  }

  set href(value) {
    if (value === null || value === undefined) this.removeAttribute('href')
    else this.setAttribute('href', String(value))
  }

  get activatable() {
    return this.hasAttribute('activatable')
  }

  set activatable(value) {
    this.toggleAttribute('activatable', !!value)
  }

  get clock() {
    return this._clock
  }

  set clock(fn) {
    this._clock = typeof fn === 'function' ? fn : null
    this.requestRender()
  }

  now() {
    return this._clock ? this._clock() : Date.now()
  }

  get formatter() {
    return this._formatterFor(currentConfig(), findGrid(this))
  }

  _formatterFor(config, grid) {
    const options = resolveFormatOptions(this, grid)
    // configure() can change after we connect, so its values are part of the key.
    // The messages are not: they are a large table the formatter never reads.
    config = { ...config }
    delete config.messages
    const key = JSON.stringify([options, config])
    if (!this._fmt || key !== this._fmtKey) {
      this._fmt = createFormatter(options)
      this._fmtKey = key
    }
    return this._fmt
  }

  /** Overrides for this widget's strings; null clears. */
  get messages() {
    return this._messages
  }

  set messages(value) {
    this._messages = value && typeof value === 'object' ? value : null
    this.requestRender()
  }

  /**
   * Resolved per key: this element's messages, then the nearest grid's, then
   * configure()'s, then EN. One function is shared by every element that
   * resolves to the same tables and locale; assign a new object to change a table.
   */
  get t() {
    // Inside a render the answer is already known, and update() asks many times.
    return this._renderT || this._translatorFor(currentConfig(), findGrid(this))
  }

  _translatorFor(config, grid) {
    const locale = resolveFormatOptions(this, grid).locale || config.locale
    return translator(config.messages, grid && grid.messages, this._messages, locale)
  }

  /**
   * Forget what was worked out from the formatter's and the messages' inputs
   * and draw once more. The grid calls it when its messages or locale change,
   * and configure() when any default does.
   */
  invalidate() {
    this._fmt = null
    this._fmtKey = ''
    this.requestRender()
  }

  /** Tell the nearest grid this widget is in it, or that it left; a grid not yet defined is tried again at the next render. */
  _link(grid) {
    const target = grid && typeof grid._link === 'function' ? grid : null
    if (target === this._grid) return
    if (this._grid) this._grid._unlink(this)
    this._grid = target
    if (target) target._link(this)
  }

  /** The first match for `selector` in the shadow root, remembered until the template is rebuilt. */
  $(selector) {
    let el = this._refs.get(selector)
    if (!el) {
      el = this.shadowRoot.querySelector(selector)
      if (el) this._refs.set(selector, el)
    }
    return el
  }

  requestRender() {
    if (this._queued) return
    this._queued = true
    // A microtask, not a frame: setting data twice in one tick costs one
    // render, yet a test can await the result without waiting for a frame.
    queueMicrotask(() => {
      this._queued = false
      if (this.isConnected) this._render()
    })
  }

  every(ms) {
    const period = ms > 0 ? ms : 0
    // update() may call this on every render; keep the running timer then.
    if (period === this._every && (this._timer || !period)) return
    this._every = period
    this._disarm()
    this._arm()
  }

  emit(action, detail) {
    // Cancelable so a host can preventDefault a built-in action (the return value is false then).
    return this.dispatchEvent(new CustomEvent('ts-action', { detail: { action, ...detail }, bubbles: true, composed: true, cancelable: true }))
  }

  /** Re-apply properties set on the element before it was defined, which would otherwise shadow the accessors. */
  upgrade(...names) {
    for (const name of names) {
      if (Object.prototype.hasOwnProperty.call(this, name)) {
        const value = this[name]
        delete this[name]
        this[name] = value
      }
    }
  }

  // ── To override ────────────────────────────────────────────────────────

  static template() {
    return ''
  }

  static viewModel() {
    return {}
  }

  /** The default loading shape: a header, a headline bar and two text lines. */
  static skeleton() {
    return `${header()}${sk(60, 30)}${sk(85, 11)}${sk(70, 11)}`
  }

  viewContext() {
    return {}
  }

  update() {}

  // ── Lifecycle ──────────────────────────────────────────────────────────

  connectedCallback() {
    // Before the first render, so the tile never paints unstyled; cheap after the first call.
    ensureTokens()
    this.upgrade('data', 'size', 'clock', 'state', 'error', 'actions', 'messages', 'href', 'activatable')
    mount(this)
    this._link(findGrid(this))
    this._normaliseSize()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisibility)
    this._arm()
    if (DEV) this._watchForData()
    this.requestRender()
  }

  disconnectedCallback() {
    if (DEV) clearTimeout(this._undefTimer)
    unmount(this)
    this._link(null)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibility)
    this._disarm()
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return
    if (name === 'size') this._normaliseSize()
    else if (name === 'data') this._readDataAttribute(newValue)
    this.requestRender()
  }

  // ── Internals ──────────────────────────────────────────────────────────

  /**
   * Feed the data attribute into _data when no property has been set. A value
   * that isn't JSON-shaped is ignored, but data this attribute supplied earlier
   * is dropped so a removed attribute doesn't leave stale numbers behind.
   */
  _readDataAttribute(value) {
    if (this._dataSet) return
    const text = typeof value === 'string' ? value.trim() : ''
    if (text[0] !== '{' && text[0] !== '[') {
      if (this._fromAttr) {
        this._data = undefined
        this._fromAttr = false
        this._parseError = false
      }
      return
    }
    this._fromAttr = true
    // A framework that stringified an object sends this; it isn't JSON, and
    // saying so as a parse error would hide the real cause.
    if (text === '[object Object]') {
      this._data = undefined
      this._parseError = true
      if (DEV) warnOnce(`attr-object:${this._uid}`, `${describeElement(this)} data attribute reads "[object Object]"; set the data property instead.`)
      return
    }
    try {
      this._data = JSON.parse(text)
      this._parseError = false
    } catch (err) {
      this._data = undefined
      this._parseError = true
      if (DEV) {
        const { message, position } = parseErrorParts(err)
        warnOnce(`attr-json:${this._uid}`, `${describeElement(this)} data attribute is not valid JSON: ${message}${position === null ? '' : ` (position ${position})`}.`)
      }
    }
  }

  // The checks below wrap their whole body in `if (DEV)`. A class method
  // survives tree-shaking even when its only caller is guarded, so the guard
  // has to be inside for a production build to lose the messages.

  /** Development: say so if nothing has set data (and nothing is loading on purpose) 10 s after connecting. */
  _watchForData() {
    if (DEV) {
      clearTimeout(this._undefTimer)
      if (this._data !== undefined || this._parseError) return
      this._undefTimer = setTimeout(() => {
        if (this._data === undefined && !this._parseError && !this.state && !this.constructor.dataOptional && this.isConnected) {
          warnOnce(`no-data:${this._uid}`, `${describeElement(this)} has had no data for 10 s and still shows a skeleton. Set data, or null for the empty state.`)
        }
      }, NO_DATA_MS)
      // A pending check must not keep a Node process (a test, SSR) alive.
      if (this._undefTimer && typeof this._undefTimer.unref === 'function') this._undefTimer.unref()
    }
  }

  /** Development: warn about invalid formatter options, naming where each came from. */
  _checkFormatter(fmt) {
    if (DEV) {
      for (const issue of fmt.issues) {
        const attr = FORMAT_ATTR[issue.option]
        const grid = findGrid(this)
        let source = 'configure()'
        if (this.getAttribute(attr) === issue.value) source = `its ${attr} attribute`
        else if (grid && grid.getAttribute(attr) === issue.value) source = `its grid's ${attr} attribute`
        warnOnce(`format:${this._uid}:${issue.option}`, `${describeElement(this)} ${issue.message} (from ${source}); the default is used.`)
      }
    }
  }

  /** Development: a view model that couldn't read some rows says how many. */
  _checkDropped(vm) {
    if (DEV && vm.dropped > 0) {
      warnOnce(`dropped:${this._uid}`, `${describeElement(this)} dropped ${vm.dropped} ${vm.dropped === 1 ? 'row' : 'rows'} it couldn't read.`)
    }
  }

  /** Development: check data against the class's dataShape, once per new value. */
  _checkShape(data) {
    if (DEV) {
      const shape = this.constructor.dataShape
      // Undefined is a dataOptional widget before its data; there is nothing to check yet.
      if (!shape || data === undefined || this._checkedData === data) return
      this._checkedData = data
      const problem = checkShape(data, shape)
      if (problem) warnOnce(`shape:${this._uid}`, `${describeElement(this)} ${shapeMessage(problem)}`)
    }
  }

  _supported() {
    return this.spec.sizes
  }

  /**
   * The aria-level of the tile's heading: this widget's `heading-level`, else
   * the nearest grid's, else 3 (RFC 0003 §5.2). A value that isn't 1 to 6 is
   * skipped, with one development warning, so a typo costs a level, not a heading.
   */
  _headingLevel(grid) {
    for (const [source, whose] of [[this, ''], [grid, "grid's "]]) {
      const raw = source && typeof source.getAttribute === 'function' ? source.getAttribute('heading-level') : null
      if (!raw) continue
      if (/^\s*[1-6]\s*$/.test(raw)) return Number(raw)
      if (DEV) warnOnce(`level:${this._uid}:${whose}`, `${describeElement(this)} ${whose}heading-level="${raw}" is not a number from 1 to 6, so it is ignored.`)
    }
    return 3
  }

  /**
   * Write `value` only when it differs, so a ticking tile doesn't rewrite its
   * name and make a screen reader read it again (RFC 0003 §5.2). null removes.
   */
  _setAttr(el, name, value) {
    if (value === null) {
      if (el.getAttribute(name) !== null) el.removeAttribute(name)
    } else if (el.getAttribute(name) !== value) el.setAttribute(name, value)
  }

  _isEditing() {
    const grid = findGrid(this)
    return Boolean(grid && (grid.editing || grid.hasAttribute('editing')))
  }

  /**
   * The tile's heading is the header's label. It takes its level here because
   * the template is static, and it keeps the plain label as its name when the
   * words it shows differ from it ("Today" in a small P&L tile), so heading
   * navigation lists labels. A tile with no label from any source is named by
   * its tag, which the heading would only repeat, so the heading is hidden.
   */
  _markHeading(grid, label) {
    // Remembered with the other refs, which are dropped whenever the markup is rebuilt.
    let heading = this._refs.get(HEADING)
    if (!heading) {
      heading = this._section.querySelector(HEADING)
      if (heading) this._refs.set(HEADING, heading)
    }
    if (!heading) return
    this._setAttr(heading, 'aria-level', String(this._headingLevel(grid)))
    const named = !!this.label
    this._setAttr(heading, 'aria-hidden', named ? null : 'true')
    this._setAttr(heading, 'aria-label', named && heading.textContent !== label ? label : null)
    this._applyActivation(heading, label)
  }

  _applyActivation(heading, label) {
    const hasHref = this.hasAttribute('href')
    const href = hasHref ? validateHref(this.getAttribute('href'), this) : null
    // href wins only when it is valid, so a rejected one leaves the tile free to open.
    const act = this.activatable && href === null
    const cur = heading.querySelector ? heading.querySelector('[part~="link"]') : null

    if (href !== null) {
      if (!cur || (cur.localName !== 'a' && cur.tagName !== 'A')) {
        const p = 'part' + '="link"'
        heading.innerHTML = `<a ${p} href="${escapeHtml(href)}">${escapeHtml((cur && cur.textContent) || heading.textContent || label)}</a>`
      } else if (cur.getAttribute('href') !== href) {
        cur.setAttribute('href', href)
      }
    } else if (act) {
      if (!cur || (cur.localName !== 'button' && cur.tagName !== 'BUTTON')) {
        const p = 'part' + '="link"'
        heading.innerHTML = `<button type="button" ${p}>${escapeHtml((cur && cur.textContent) || heading.textContent || label)}</button>`
      }
    } else if (cur) {
      heading.innerHTML = escapeHtml(cur.textContent || label)
    }
  }

  /** The tile's name: the view model's, then ", live" while it is live (a stale tile will say so too). */
  _tileName(name, live) {
    this._setAttr(this._section, 'aria-label', live ? `${name}, ${(this._renderT || this.t)('time.live')}` : name)
  }

  /** The name for the tile: the label, else the tag, never empty. */
  _name() {
    const label = this.label
    if (label) return label
    if (DEV) {
      warnOnce(`label:${this.localName}`, `<${this.localName}> has no label, so its tile is named "${this.localName}". Set a label attribute or static spec.`)
    }
    return this.localName
  }

  /**
   * Make the attribute say the size actually rendered, so the standalone
   * height rules match it. Only once connected: a constructor or a detached
   * element must not grow attributes.
   */
  _normaliseSize() {
    if (!this.isConnected) return
    const size = this.size
    if (this.getAttribute('size') !== size) this.setAttribute('size', size)
  }

  _visible() {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden'
  }

  _arm() {
    if (this._timer || !this._every || !this.isConnected || !this._visible()) return
    this._timer = setInterval(() => this.requestRender(), this._every)
  }

  _disarm() {
    clearInterval(this._timer)
    this._timer = 0
  }

  _render() {
    // Asked once for this render: it is also where a grid that was not defined at connect is found.
    const config = currentConfig()
    const grid = findGrid(this)
    this._link(grid)
    this._renderT = this._translatorFor(config, grid)
    try {
      this._draw(config, grid)
    } finally {
      this._renderT = null
    }
  }

  _draw(config, grid) {
    const Ctor = this.constructor
    const t = this._renderT
    const label = this._name()
    const variant = this.variant
    const state = this.state

    if (state === 'error' || this._error || this._parseError) {
      this._failed = false
      return this._showError(label, this._error, grid)
    }
    if (state === 'loading' || (this._data === undefined && !Ctor.dataOptional)) {
      this._failed = false
      return this._showLoading(label, variant, grid)
    }
    if (this._data === null) {
      this._failed = false
      return this._showEmpty(label, grid)
    }
    try {
      const fmt = this._formatterFor(config, grid)
      if (DEV) {
        this._checkFormatter(fmt)
        this._checkShape(this._data)
      }
      const vm = Ctor.viewModel(this._data === undefined ? {} : this._data, variant, { ...this.viewContext(), fmt, t, now: this.now(), label }) || {}
      if (DEV) this._checkDropped(vm)
      if (this._shown !== variant) {
        this._section.innerHTML = templateFor(Ctor, variant)
        this._refs.clear()
        this._shown = variant
      }
      this._section.removeAttribute('aria-busy')
      this._tileName(vm.ariaLabel || label, vm.live === true)
      this.update(vm, variant)
      this._markHeading(grid, label)
      this._failed = false
    } catch (err) {
      // A widget that can't draw its data shouldn't take the page with it.
      // Logged once per run of failures: a clock tick would otherwise log every second.
      if (!this._failed) console.error(`tickslate: ${describeElement(this)} could not render its data; see docs/widgets/${this.localName}.md`, err)
      this._failed = true
      this._showError(label, null, grid)
    }
  }

  /** Swap in a non-content view's markup, and write the real label into it. */
  _show(key, html, label, name, busy, grid, skeletonLabel = label) {
    if (this._shown !== key) {
      this._section.innerHTML = html
      this._refs.clear()
      this._shown = key
    }
    // A skeleton may carry its own words (Today's P&L S says "Today"), so the hook is optional.
    const slot = this._section.querySelector('[data-k="label"]')
    if (slot) slot.textContent = skeletonLabel
    this._tileName(name, false)
    if (busy) this._section.setAttribute('aria-busy', 'true')
    else this._section.removeAttribute('aria-busy')
    this._markHeading(grid, label)
  }

  /** What the skeleton's label node says. A widget whose small loading view uses a shorter word overrides this. */
  _skeletonLabel(variant, label) {
    return label
  }

  _showLoading(label, variant, grid) {
    this._show(`view:loading:${variant}`, skeletonFor(this.constructor, variant), label, label, true, grid, this._skeletonLabel(variant, label))
  }

  /**
   * The empty view's words: the host's `widget.<catalogKey>.empty` message
   * first, then the class's own `emptyText` (a widget author's choice, which
   * for a built-in is the EN value), then `widget.empty`.
   */
  _emptyText() {
    const t = this.t
    const own = this.constructor.emptyText
    const key = this.constructor.catalogKey
    if (key) {
      const id = `widget.${key}.empty`
      const text = t(id)
      if (text !== id && (text !== EN[id] || own === EN[id])) return text
    }
    return own === EN['widget.empty'] ? t('widget.empty') : own
  }

  _showEmpty(label, grid) {
    this._show('view:empty', `${header()}<div class="empty" part="empty"><slot name="empty"><span data-k="empty"></span></slot></div>`, label, label, false, grid)
    this._section.querySelector('[data-k="empty"]').textContent = this._emptyText()
  }

  _showError(label, message, grid) {
    const t = this.t
    const text = message || t('widget.error')
    const retry = this.actionEnabled('retry') ? '<button type="button" class="btn retry" data-action="retry" data-k="retry"></button>' : ''
    this._show(
      retry ? 'view:error:retry' : 'view:error',
      `${header()}<div class="err" part="error"><span class="err-msg">${WARN_GLYPH}<span data-k="message"></span></span>${retry}</div>`,
      label,
      t('widget.error.region', { label, message: text }),
      false,
      grid,
    )
    this._section.querySelector('[data-k="message"]').textContent = text
    if (retry) this._section.querySelector('[data-k="retry"]').textContent = t('action.retry')
  }
}

// Data properties rather than class fields, so a subclass can set them with
// `static x = …` or a getter without tripping over an inherited accessor.
TsWidget.catalogKey = null
TsWidget.spec = null
TsWidget.styles = ''
TsWidget.dataOptional = false
TsWidget.dataShape = null
TsWidget.emptyText = EN['widget.empty']
