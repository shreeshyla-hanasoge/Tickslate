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
 *     of `variant`.
 *
 *   static viewModel(data, variant, ctx) → object
 *     Pure: data in, plain display strings and numbers out. `ctx` is
 *     `{ fmt, now, label }`: the formatter, the current time in ms (from
 *     `clock` if set) and the effective label. Return `ariaLabel` to name the
 *     tile with its headline result ("Today's P&L, +₹2,185.65"); without it
 *     the tile is named by the label. `data` is never null here, and is `{}`
 *     for a `static dataOptional` widget that has none yet. If this throws,
 *     the base logs it once and shows the error view.
 *
 *   static dataOptional = false
 *     True for a widget that can draw something useful before it has data (a
 *     card with a static body). It renders its template while data is
 *     undefined, with viewModel getting `{}`; the skeleton then shows only
 *     for state="loading".
 *
 *   static emptyText = 'No data'
 *     What the empty state says (data === null), unless the host slots its own
 *     content into `slot="empty"`.
 *
 *   static skeleton(variant) → string
 *     The loading view's markup: `.sk` blocks shaped like that variant's
 *     content, so content lands without the tile moving. Build them with
 *     `sk(width, height)`. Include an element with `data-k="label"` and the
 *     base fills it with the real label. Static markup, pure in `variant`.
 *     The default is a header, a headline bar and two text lines.
 *
 *   viewContext() → object
 *     Extra keys for viewModel's `ctx`, for what the pure view model needs
 *     from the element itself, such as an attribute:
 *       viewContext() { return { range: this.getAttribute('range') || 'All' } }
 *     The base's own keys (fmt, now, label) are added after these and win.
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
 *                   else the spec's label. With neither, a development
 *                   warning, and the tile is named by the tag.
 *   locale, currency, time-zone
 *                   Attributes. Each resolves: own attribute → nearest
 *                   ancestor <ts-grid>'s attribute → configure() defaults.
 *   formatter       The Formatter for those. Cached; rebuilt when any of its
 *                   inputs change.
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
 * The tile is `<section class="tile" part="tile" aria-label>`. Exactly one
 * view is shown, first match wins (RFC 0002 §2.3):
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

import { WIDGETS, createFormatter, currentConfig, snapSize, isSize, SIZES, SIZE_NAMES } from '../core/index.js'
import { DEV, warnOnce } from './dev.js'
import { ensureTokens } from './default-tokens.js'

// Every English string the base shows, in one place so messages can be made
// overridable later (RFC 0002 §2.4). `{label}` and `{message}` are filled in.
export const STRINGS = Object.freeze({
  noData: 'No data',
  errorDefault: "Couldn't display this data",
  errorRegion: '{label}, error: {message}',
  retry: 'Retry',
})

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement

// attribute → createFormatter option
const FORMAT_ATTRS = [
  ['locale', 'locale'],
  ['currency', 'currency'],
  ['time-zone', 'timeZone'],
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
.lb { font-size: 10px; text-transform: uppercase; letter-spacing: .12em; font-weight: 600; color: var(--ts-muted); }
.n, .big, .xbig {
  font-family: var(--ts-font-num); font-variant-numeric: tabular-nums lining-nums; font-weight: var(--ts-num-weight, 500);
}
.big { font-size: min(34px, 19cqi); line-height: 1; letter-spacing: -.01em; }
.xbig { font-size: min(48px, 9cqi); line-height: 1; letter-spacing: -.02em; }
.md { font-size: min(17px, 12cqi); }
.sm { font-size: 11px; }
.xs { font-size: 10px; }
.n.sm, .n.xs { font-weight: var(--ts-num-weight-small, 500); }
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
  border: 1px solid var(--ts-line); background: transparent; color: var(--ts-muted); cursor: pointer;
}
.btn.on { background: var(--ts-surface-2); color: var(--ts-ink); box-shadow: inset 0 -2px 0 var(--ts-accent); }
.btn:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
/* Touch screens: the 44px minimum target the RFC asks for at 2 columns. */
@media (pointer: coarse) { .btn { min-height: 44px; min-width: 44px; } }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.dot.live { background: var(--ts-profit); animation: ts-pulse 2s infinite; }
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
  if (html === undefined) byVariant.set(variant, (html = Ctor.skeleton(variant)))
  return html
}

const WARN_GLYPH =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.9 15 14.1H1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path><path d="M8 6.2v3.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path><circle cx="8" cy="11.9" r=".95" fill="currentColor"></circle></svg>'

const STATES = ['loading', 'error']

/** The nearest ancestor <ts-grid>, looking out through shadow roots. */
function findGrid(el) {
  let node = el.parentElement || (el.getRootNode && el.getRootNode().host)
  while (node) {
    if (node.localName === 'ts-grid') return node
    node = node.parentElement || (node.getRootNode && node.getRootNode().host)
  }
  return null
}

export class TsWidget extends Base {
  static get observedAttributes() {
    return ['size', 'label', 'locale', 'currency', 'time-zone', 'state']
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
    this._every = 0
    this._timer = 0
    this._failed = false
    this._onVisibility = () => {
      if (this._visible()) {
        this._arm()
        this.requestRender()
      } else {
        this._disarm()
      }
    }
    const root = this.attachShadow({ mode: 'open' })
    root.innerHTML = `<style>${cssFor(this.constructor)}</style><section class="tile" part="tile"></section>`
    this._section = root.querySelector('.tile')
    // One delegated listener: the Retry button is rebuilt with the error view.
    this._section.addEventListener('click', (e) => {
      const target = e.target && e.target.closest ? e.target.closest('[data-action]') : null
      if (target && target.getAttribute('data-action') === 'retry' && this.actionEnabled('retry')) this.emit('retry')
    })
  }

  // ── Public API ─────────────────────────────────────────────────────────

  get data() {
    return this._data
  }

  set data(value) {
    this._data = value
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
    return this._actions.includes(name)
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
    const options = resolveFormatOptions(this, findGrid(this))
    // configure() can change after we connect, so its values are part of the key.
    const key = JSON.stringify([options, currentConfig()])
    if (!this._fmt || key !== this._fmtKey) {
      this._fmt = createFormatter(options)
      this._fmtKey = key
    }
    return this._fmt
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
    return this.dispatchEvent(new CustomEvent('ts-action', { detail: { action, ...detail }, bubbles: true, composed: true }))
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
    return `<div class="hd"><span class="lb ell" data-k="label"></span></div>${sk(60, 30)}${sk(85, 11)}${sk(70, 11)}`
  }

  viewContext() {
    return {}
  }

  update() {}

  // ── Lifecycle ──────────────────────────────────────────────────────────

  connectedCallback() {
    // Before the first render, so the tile never paints unstyled; cheap after the first call.
    ensureTokens()
    this.upgrade('data', 'size', 'clock', 'state', 'error', 'actions')
    this._normaliseSize()
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisibility)
    this._arm()
    this.requestRender()
  }

  disconnectedCallback() {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVisibility)
    this._disarm()
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return
    if (name === 'size') this._normaliseSize()
    this.requestRender()
  }

  // ── Internals ──────────────────────────────────────────────────────────

  _supported() {
    return this.spec.sizes
  }

  /** The name for the tile: the label, else the tag, never empty. */
  _name() {
    const label = this.label
    if (label) return label
    if (DEV) {
      warnOnce(`label:${this.localName}`, `<${this.localName}> has no label, so its region is named "${this.localName}". Set a label attribute or static spec.`)
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
    const Ctor = this.constructor
    const label = this._name()
    const variant = this.variant
    const state = this.state

    if (state === 'error' || this._error) {
      this._failed = false
      return this._showError(label, this._error)
    }
    if (state === 'loading' || (this._data === undefined && !Ctor.dataOptional)) {
      this._failed = false
      return this._showLoading(label, variant)
    }
    if (this._data === null) {
      this._failed = false
      return this._showEmpty(label)
    }
    try {
      const vm = Ctor.viewModel(this._data === undefined ? {} : this._data, variant, { ...this.viewContext(), fmt: this.formatter, now: this.now(), label }) || {}
      if (this._shown !== variant) {
        this._section.innerHTML = templateFor(Ctor, variant)
        this._refs.clear()
        this._shown = variant
      }
      this._section.removeAttribute('aria-busy')
      this._section.setAttribute('aria-label', vm.ariaLabel || label)
      this.update(vm, variant)
      this._failed = false
    } catch (err) {
      // A widget that can't draw its data shouldn't take the page with it.
      // Logged once per run of failures: a clock tick would otherwise log every second.
      if (!this._failed) console.error(`<${this.localName}> could not render its data:`, err)
      this._failed = true
      this._showError(label, null)
    }
  }

  /** Swap in a non-content view's markup, and write the real label into it. */
  _show(key, html, label, name, busy) {
    if (this._shown !== key) {
      this._section.innerHTML = html
      this._refs.clear()
      this._shown = key
    }
    // A skeleton may carry its own words (Today's P&L S says "Today"), so the hook is optional.
    const slot = this._section.querySelector('[data-k="label"]')
    if (slot) slot.textContent = label
    this._section.setAttribute('aria-label', name)
    if (busy) this._section.setAttribute('aria-busy', 'true')
    else this._section.removeAttribute('aria-busy')
  }

  _showLoading(label, variant) {
    this._show(`view:loading:${variant}`, skeletonFor(this.constructor, variant), label, label, true)
  }

  _showEmpty(label) {
    const text = escapeHtml(this.constructor.emptyText)
    this._show('view:empty', `<div class="hd"><span class="lb ell" data-k="label"></span></div><div class="empty"><slot name="empty">${text}</slot></div>`, label, label, false)
  }

  _showError(label, message) {
    const text = message || STRINGS.errorDefault
    const retry = this.actionEnabled('retry') ? `<button type="button" class="btn retry" data-action="retry">${escapeHtml(STRINGS.retry)}</button>` : ''
    this._show(
      retry ? 'view:error:retry' : 'view:error',
      `<div class="hd"><span class="lb ell" data-k="label"></span></div><div class="err" part="error"><span class="err-msg">${WARN_GLYPH}<span data-k="message"></span></span>${retry}</div>`,
      label,
      STRINGS.errorRegion.replace('{label}', label).replace('{message}', text),
      false,
    )
    this._section.querySelector('[data-k="message"]').textContent = text
  }
}

// Data properties rather than class fields, so a subclass can set them with
// `static x = …` or a getter without tripping over an inherited accessor.
TsWidget.catalogKey = null
TsWidget.spec = null
TsWidget.styles = ''
TsWidget.dataOptional = false
TsWidget.emptyText = STRINGS.noData
