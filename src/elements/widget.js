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
 *     label.
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
 *     the tile is named by the label. `data` is never null here. If this
 *     throws, the base logs it once and shows the empty state.
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
 *                   however many times it is set. null/undefined → empty state.
 *   size            Attribute and property, reflected. Snapped to the
 *                   widget's supported sizes; with no attribute, the first
 *                   supported size. <ts-grid> sets it.
 *   variant         Read-only: the size actually rendered (the snapped size).
 *   label           Attribute and property. Effective label: the attribute,
 *                   else the catalog label.
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
 * The tile is `<section class="tile" part="tile" aria-label>`. On render, the
 * section's content is rebuilt from template(variant) only when the variant
 * changed or when leaving the empty state; otherwise update() just writes new
 * values. Rendering needs a connected element; connecting always renders.
 *
 * Importing this module needs no DOM (it is loaded by Node tests and during
 * server-side rendering); only constructing a widget does.
 */

import { WIDGETS, createFormatter, currentConfig, snapSize, SIZES, SIZE_NAMES } from '../core/index.js'

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
.btn.on { background: var(--ts-surface-2); color: var(--ts-ink); }
.btn:focus-visible { outline: 2px solid var(--ts-accent); outline-offset: 2px; }
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
.empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--ts-muted); }
.lp, .ln { fill: none; stroke-width: 2; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.lp { stroke: var(--ts-profit); }
.ln { stroke: var(--ts-loss); }
.ap { fill: color-mix(in srgb, var(--ts-profit) var(--ts-fill, 12%), transparent); }
.an { fill: color-mix(in srgb, var(--ts-loss) var(--ts-fill, 12%), transparent); }
.lz { stroke: var(--ts-line); stroke-dasharray: 3 3; vector-effect: non-scaling-stroke; }
`

// Per class, so a widget's CSS and each variant's markup are built once.
const cssCache = new WeakMap()
const templateCache = new WeakMap()

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
    return ['size', 'label', 'locale', 'currency', 'time-zone']
  }

  constructor() {
    super()
    this._data = null
    this._clock = null
    this._queued = false
    this._shown = null // 'empty', a variant, or null before the first render
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
  }

  // ── Public API ─────────────────────────────────────────────────────────

  get data() {
    return this._data
  }

  set data(value) {
    this._data = value
    this.requestRender()
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
    const spec = this._spec()
    return spec ? spec.label : ''
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

  viewContext() {
    return {}
  }

  update() {}

  // ── Lifecycle ──────────────────────────────────────────────────────────

  connectedCallback() {
    this.upgrade('data', 'size', 'clock')
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

  _spec() {
    const key = this.constructor.catalogKey
    return key && Object.prototype.hasOwnProperty.call(WIDGETS, key) ? WIDGETS[key] : null
  }

  _supported() {
    const spec = this._spec()
    return spec ? spec.sizes : []
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
    const label = this.label
    const variant = this.variant
    let vm = null
    if (this._data !== null && this._data !== undefined) {
      try {
        vm = Ctor.viewModel(this._data, variant, { ...this.viewContext(), fmt: this.formatter, now: this.now(), label }) || {}
        if (this._shown !== variant) {
          this._section.innerHTML = templateFor(Ctor, variant)
          this._refs.clear()
          this._shown = variant
        }
        this._section.setAttribute('aria-label', vm.ariaLabel || label)
        this.update(vm, variant)
        this._failed = false
        return
      } catch (err) {
        // A widget that can't draw its data shouldn't take the page with it.
        // Logged once per run of failures: a clock tick would otherwise log every second.
        if (!this._failed) console.error(`<${this.localName}> could not render its data:`, err)
        this._failed = true
      }
    } else {
      this._failed = false
    }
    this._showEmpty(label)
  }

  _showEmpty(label) {
    if (this._shown !== 'empty') {
      this._section.innerHTML = '<div class="hd"><span class="lb"></span></div><div class="empty">No data</div>'
      this._refs.clear()
      this._shown = 'empty'
    }
    this._section.querySelector('.lb').textContent = label
    this._section.setAttribute('aria-label', label)
  }
}

// Data properties rather than class fields, so a subclass can set them with
// `static x = …` or a getter without tripping over an inherited accessor.
TsWidget.catalogKey = null
TsWidget.styles = ''
