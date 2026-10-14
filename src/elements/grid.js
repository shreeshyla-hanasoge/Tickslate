/**
 * <ts-grid>: lays out the host's tiles from a Layout, and lets the user
 * rearrange them the way they rearrange apps on an iPhone (RFC 0001 §8.6).
 *
 * Children belong to the host. Each one carries item="<layout id>"; the grid
 * positions it and sets its size attribute, and never moves it in the DOM,
 * because Vue and React would lose track of nodes moved under them.
 *
 * Tiles are positioned absolutely with the `translate` property rather than
 * by CSS grid. Sliding a tile is then a compositor-only transition, a dragged
 * tile can follow the pointer without reflowing anything, and the positions
 * on screen are exactly the ones the core's place() computed and tested.
 * `translate` rather than `transform` also leaves `rotate` and `scale` free,
 * so the edit-mode wiggle and the lift turn around the tile's own centre.
 *
 * In edit mode a transparent "chrome" layer covers each tile. It catches
 * every pointer, so a drag can never press a button inside a widget, and it
 * carries the remove badge and the resize handle.
 */

import {
  DEFAULT_PROFILE,
  WIDGETS,
  activeProfile,
  columnsFor,
  dropIndex,
  emptyLayout,
  footprint,
  moveItem,
  nextProfileChange,
  place,
  readLayout,
  removeItem,
  resizeItem,
  sizeForExtent,
  stepSize,
  typeForTag,
  withProfile,
} from '../core/index.js'
import {
  boardHeight,
  boxOf,
  cellAt,
  elementSpec,
  extentOf,
  hostResizes,
  itemsFromChildren,
  mergeOrder,
  metrics,
  px,
  reconcile,
  specResolver,
} from './grid-geometry.js'
import { DEV, warnOnce } from './dev.js'

const LONG_PRESS_MS = 500
const PRESS_SLOP = 8
const MOUSE_DRAG_SLOP = 4
// In edit mode a touch must rest this long before the tile lifts, so a
// quick swipe still scrolls a dashboard that is all tiles.
const TOUCH_HOLD_MS = 200
// A new slot is taken only once the pointer has stayed over it this long,
// so sweeping across the grid doesn't set off a cascade of moves.
const SETTLE_MS = 120
const EDGE = 64
// px per second at the very edge; time-based so 60 and 120 Hz screens scroll alike.
const MAX_SCROLL = 900
const LIFT_SCALE = 1.04
const SLIDE = 'var(--ts-motion, 220ms) var(--ts-ease, cubic-bezier(.2, .8, .2, 1))'
// The profile timer is re-armed at least this often, so a laptop waking
// from sleep, whose timers were frozen, switches layouts within a minute.
const MAX_WAIT = 60000
// A tile whose tag has no definition after this long is probably a missing import.
const UNDEFINED_TAG_MS = 2000
// Children that are never tiles, however the markup is written.
const NOT_TILES = new Set(['script', 'style', 'template', 'link', 'meta', 'noscript'])
const NO_SPECS = new Map()
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

// Built on first use, so importing this module where there is no DOM (Node,
// server-side rendering) doesn't throw.
let template = null
const TEMPLATE = `
<style>
  :host { display: block; position: relative; -webkit-tap-highlight-color: transparent; }
  :host([hidden]) { display: none; }
  :host([dragging]) { cursor: grabbing; -webkit-user-select: none; user-select: none; }
  .board { position: relative; transition: height ${SLIDE}; }
  ::slotted(*) { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  .placeholder {
    position: absolute; top: 0; left: 0; box-sizing: border-box; pointer-events: none;
    border-radius: var(--ts-radius, 10px);
    background: color-mix(in srgb, var(--ts-ink, #1C1A16) 4%, transparent);
    border: 1.5px dashed color-mix(in srgb, var(--ts-ink, #1C1A16) 22%, transparent);
    opacity: 0; transition: opacity 120ms ease;
  }
  .placeholder.on { opacity: 1; }
  .chromes { position: absolute; inset: 0; pointer-events: none; }
  .chrome {
    position: absolute; top: 0; left: 0; box-sizing: border-box; pointer-events: none;
    border-radius: var(--ts-radius, 10px); outline: none; z-index: 2;
  }
  :host([editing]) .chrome { pointer-events: auto; cursor: grab; }
  :host([dragging]) .chrome { cursor: grabbing; }
  .chrome:focus-visible { box-shadow: 0 0 0 2px var(--ts-accent, #2C52C4); }
  .remove, .resize { display: none; }
  :host([editing]) .remove, :host([editing]) .resize { display: flex; }
  .chrome.lifted .remove, .chrome.lifted .resize, .chrome.fixed .resize { display: none; }
  .remove {
    position: absolute; top: -16px; left: -16px; width: 44px; height: 44px; padding: 0; margin: 0;
    border: 0; background: none; align-items: center; justify-content: center; cursor: pointer;
    animation: pop 160ms var(--ts-ease, ease-out);
  }
  .remove span {
    width: 22px; height: 22px; border-radius: 50%; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    background: var(--ts-surface-2, #F1EBDE); color: var(--ts-ink, #1C1A16);
    border: 1px solid var(--ts-line, #E2DACB); box-shadow: var(--ts-shadow, none);
    font: 600 16px/1 var(--ts-font-ui, system-ui, sans-serif);
  }
  .remove:focus-visible span { box-shadow: 0 0 0 2px var(--ts-accent, #2C52C4); }
  .resize {
    position: absolute; right: -6px; bottom: -6px; width: 44px; height: 44px;
    cursor: nwse-resize; touch-action: none; animation: pop 160ms var(--ts-ease, ease-out);
  }
  .resize::after {
    content: ''; position: absolute; right: 12px; bottom: 12px; width: 12px; height: 12px;
    border-right: 3px solid var(--ts-muted, #6A655B); border-bottom: 3px solid var(--ts-muted, #6A655B);
    border-bottom-right-radius: 6px;
  }
  @keyframes pop { from { opacity: 0; scale: .6; } to { opacity: 1; scale: 1; } }
  @media (prefers-reduced-motion: reduce) {
    :host([editing]) .chrome { outline: 2px dashed var(--ts-line, #E2DACB); outline-offset: -1px; }
    .remove, .resize { animation: none; }
  }
  .sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
<div class="board" part="board">
  <div class="placeholder" part="placeholder"></div>
  <slot></slot>
  <div class="chromes"></div>
</div>
<div class="sr" role="status" aria-live="polite"></div>
`

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement

export class TsGrid extends Base {
  static get observedAttributes() {
    return ['editing', 'profile']
  }

  constructor() {
    super()
    if (!template) {
      template = document.createElement('template')
      template.innerHTML = TEMPLATE
    }
    const root = this.attachShadow({ mode: 'open' })
    root.appendChild(template.content.cloneNode(true))
    this._board = root.querySelector('.board')
    this._placeholder = root.querySelector('.placeholder')
    this._chromeLayer = root.querySelector('.chromes')
    this._status = root.querySelector('.sr')

    this._layout = emptyLayout()
    this._catalog = WIDGETS
    // Implicit mode (RFC 0002 §1.5) lasts until the host sets `layout`.
    this._explicit = false
    this._removed = new Map() // profile → ids the user removed, which children can't bring back
    this._declared = new WeakMap() // element → the size attribute as first read
    this._written = new WeakMap() // element → the size attribute the grid last wrote
    this._itemOf = new WeakMap() // element → the item id the grid last saw on it
    this._columnsSeen = false
    this._watching = new Set() // timers of the development warnings
    this._watchedTags = new Set() // tags those timers wait on
    // Specs resolve when a tile renders, so a child that upgrades late still counts.
    this._elementSpecs = { get: (id) => elementSpec(this._tiles.get(id)) }
    this._setCatalog(WIDGETS)
    this._columns = 0
    this._m = null
    this._order = [] // the visible items, in the order being shown
    this._tiles = new Map() // id → host element
    this._chromes = new Map() // id → chrome element
    this._boxes = new Map() // id → last pixel box
    this._placements = new Map()
    this._wiggles = new Map() // id → running animations
    this._gesture = null
    this._rendered = false
    this._editing = false
    this._suppressClick = false
    this._schedule = null
    this._scheduled = null // the profile the schedule calls for now
    this._override = null // { profile, until }
    this._profileTimer = 0
    this._clock = () => Date.now()
    this._onVisibility = () => {
      if (document.visibilityState === 'visible') this._reschedule(true)
    }

    this._motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

    this._onPointerDown = this._onPointerDown.bind(this)
    this._onPointerMove = this._onPointerMove.bind(this)
    this._onPointerUp = this._onPointerUp.bind(this)
    this._onPointerCancel = this._onPointerCancel.bind(this)
    this._onKeyDown = this._onKeyDown.bind(this)
    this._onDocKeyDown = this._onDocKeyDown.bind(this)
    this._frame = this._frame.bind(this)

    this.addEventListener('pointerdown', this._onPointerDown)
    this.addEventListener('keydown', this._onKeyDown)
    // Once a tile is lifted the page must not scroll under the finger. Only
    // a non-passive touchmove can stop that mid-gesture.
    this.addEventListener('touchmove', (e) => {
      if (this._gesture && (this._gesture.kind === 'drag' || this._gesture.kind === 'resize')) e.preventDefault()
    }, { passive: false })
    this.addEventListener('contextmenu', (e) => {
      if (this._gesture) e.preventDefault()
    })
    // The pointerup that ends a long-press drag would otherwise click
    // whatever widget button sits under the finger.
    this.addEventListener('click', (e) => {
      if (this._suppressClick) {
        e.preventDefault()
        e.stopPropagation()
      }
    }, true)
    root.addEventListener('click', (e) => {
      const button = e.target.closest && e.target.closest('.remove')
      if (button) this._remove(button.parentElement.dataset.id)
    })
  }

  // ── Public API ─────────────────────────────────────────────────────────

  get layout() {
    // A plain read: reconciling here could write `item` attributes. Implicit
    // mode is kept current by child changes and _sync, so _layout is fresh.
    return this._layout
  }

  /** A Layout or an item array. Setting it ends implicit mode for good. */
  set layout(value) {
    this._explicit = true
    this._apply(value)
  }

  get catalog() {
    return this._catalog
  }

  set catalog(value) {
    this._setCatalog(value || WIDGETS)
    this._apply(this._layout)
  }

  _setCatalog(catalog) {
    this._catalog = catalog
    this._resolve = specResolver(this._elementSpecs, catalog, WIDGETS)
    // For a tag's default spec: no element's own spec, or a tile that happens
    // to share the type's name would answer for it.
    this._typeSpec = specResolver(NO_SPECS, catalog, WIDGETS)
  }

  /** Read a layout from the host and show it. Issues are reported only here, never for the grid's own edits. */
  _apply(value) {
    // Tiles first, so a child's own sizes are known while the layout is read.
    this._matchChildren(false)
    const columns = this._columns
    const device = columns ? (columns === 2 ? 'phone' : 'desktop') : undefined
    // 'keep': a saved layout must not lose a tile because its tag isn't defined yet.
    const { layout, issues } = readLayout(value, { catalog: this._resolve, unknown: 'keep', device })
    if (issues.length) this._emit('ts-layout-issues', { issues })
    this._cancelGesture()
    this._layout = layout
    this._sync(this._rendered)
  }

  /** The profile shown: the `profile` attribute, else an override, else the schedule, else 'market'. */
  get profile() {
    return this.getAttribute('profile') || (this._override && this._override.profile) || this._scheduled || DEFAULT_PROFILE
  }

  set profile(value) {
    if (value) this.setAttribute('profile', value)
    else this.removeAttribute('profile')
  }

  get editing() {
    return this.hasAttribute('editing')
  }

  set editing(value) {
    this.toggleAttribute('editing', !!value)
  }

  get columns() {
    return this._columns
  }

  /** { calendar, market: { sessions, leadMinutes?, lagMinutes? } }; switches profiles on time. */
  get schedule() {
    return this._schedule
  }

  set schedule(value) {
    const before = this.profile
    this._schedule = value || null
    if (!value) this._override = null
    this._reschedule(false)
    this._profileChanged(before, 'schedule')
  }

  /** What the grid takes the time to be. Tests and demos can replace it. */
  get clock() {
    return this._clock
  }

  set clock(fn) {
    this._clock = typeof fn === 'function' ? fn : () => Date.now()
    this._reschedule(true)
  }

  /**
   * Show `profile` until the schedule next changes, then go back to it: a
   * manual switch the user makes from the dashboard. With no schedule it lasts
   * until cleared with override(null). The `profile` attribute, if set, still wins.
   */
  override(profile) {
    if (!profile) {
      // Read the profile before clearing, or the change would go unnoticed.
      const before = this.profile
      this._override = null
      this._reschedule(false)
      this._profileChanged(before, 'override-ended')
      return
    }
    const now = this._clock()
    const until = this._schedule ? nextProfileChange(this._schedule.calendar, this._schedule, now) : null
    const before = this.profile
    this._override = { profile, until: until === null ? Infinity : until }
    this._reschedule(false)
    this._profileChanged(before, 'override')
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  connectedCallback() {
    this._resizeObserver = new ResizeObserver(() => this._measure(false))
    this._resizeObserver.observe(this)
    this._mutationObserver = new MutationObserver((records) => {
      if (!records.some((r) => this._concerns(r))) return
      this._cancelGesture()
      this._sync(true)
    })
    this._mutationObserver.observe(this, { childList: true, subtree: true, attributeFilter: ['item', 'size'] })
    if (!this._explicit) this._reconcile()
    this._measure(true)
    if (this._editing) this._startEditing()
    document.addEventListener('visibilitychange', this._onVisibility)
    this._reschedule(true)
  }

  disconnectedCallback() {
    this._resizeObserver.disconnect()
    this._mutationObserver.disconnect()
    this._cancelGesture()
    this._stopEditing()
    document.removeEventListener('visibilitychange', this._onVisibility)
    clearTimeout(this._profileTimer)
    for (const timer of this._watching) clearTimeout(timer)
    this._watching.clear()
    this._watchedTags.clear()
    if (this._orphanWatch) cancelAnimationFrame(this._orphanWatch)
    this._orphanWatch = 0
  }

  /** Whether a mutation is news: our own child list, or a change the grid didn't make itself. */
  _concerns(r) {
    // Content changing inside a tile doesn't matter.
    if (r.type === 'childList') return r.target === this
    const el = r.target
    if (el.parentElement !== this) return false
    // The grid writes `size` on every render, and only a host's value is a resize.
    if (r.attributeName === 'size') return !this._explicit && el.getAttribute('size') !== this._written.get(el)
    return el.getAttribute('item') !== this._itemOf.get(el)
  }

  attributeChangedCallback(name) {
    if (name === 'editing') {
      const on = this.hasAttribute('editing')
      if (on === this._editing) return
      this._editing = on
      if (on) this._startEditing()
      else this._stopEditing()
      this._emit('ts-edit-change', { editing: on })
    } else if (name === 'profile') {
      this._cancelGesture()
      this._sync(false)
    }
  }

  // ── Profiles on a schedule ─────────────────────────────────────────────

  /** Work out the scheduled profile now and arm a timer for the next change. */
  _reschedule(emit, reason = 'schedule') {
    clearTimeout(this._profileTimer)
    const before = this.profile
    const s = this._schedule
    if (!s || !this.isConnected) {
      this._scheduled = null
    } else {
      const now = this._clock()
      if (this._override && now >= this._override.until) {
        this._override = null
        reason = 'override-ended'
      }
      this._scheduled = activeProfile(s.calendar, s, now)
      const next = nextProfileChange(s.calendar, s, now)
      const until = this._override ? Math.min(this._override.until, next === null ? Infinity : next) : next
      const wait = until === null || until === Infinity ? MAX_WAIT : Math.min(MAX_WAIT, Math.max(0, until - now))
      this._profileTimer = setTimeout(() => this._reschedule(true), wait)
    }
    if (emit) this._profileChanged(before, reason)
  }

  _profileChanged(before, reason) {
    const profile = this.profile
    if (profile === before) return
    this._cancelGesture()
    this._sync(false)
    this._emit('ts-profile-change', { profile, reason })
  }

  // ── Measuring and rendering ────────────────────────────────────────────

  _measure(force) {
    if (!this.isConnected) return
    const width = this.clientWidth
    // The board's own height changes fire the observer too; only width matters.
    if (!force && width === this._width) return
    this._width = width
    const columns = columnsFor(width)
    const changed = columns !== this._columns
    if (changed && this._gesture) this._cancelGesture()
    const style = getComputedStyle(this)
    const compact = columns === 2
    const row = px(style.getPropertyValue(compact ? '--ts-row-compact' : '--ts-row'), 0) || px(style.getPropertyValue('--ts-row'), 150)
    const gap = px(style.getPropertyValue(compact ? '--ts-gap-compact' : '--ts-gap'), compact ? 10 : 16)
    this._columns = columns
    this._m = metrics(width, columns, row, gap)
    if (force || changed || this._rendered) this._sync(false, !force)
    // The first measure tells a host which device it has, so it needn't measure the grid itself.
    const initial = !this._columnsSeen
    this._columnsSeen = true
    if (initial || changed) this._emit('ts-columns-change', { columns, device: columns === 2 ? 'phone' : 'desktop', initial })
  }

  _profileItems() {
    // Own properties only: profile="toString" is an empty board, not a function.
    const profiles = this._layout.profiles
    const name = this.profile
    return hasOwn(profiles, name) && Array.isArray(profiles[name]) ? profiles[name] : []
  }

  _removedFor(profile) {
    let set = this._removed.get(profile)
    if (!set) this._removed.set(profile, (set = new Set()))
    return set
  }

  /**
   * Implicit mode: bring the active profile in line with the children. The
   * first pass seeds it; later ones keep the grid's list as the truth, so a
   * moved or resized tile stays put when a framework re-renders.
   */
  _reconcile() {
    const kids = [...this.children].filter(isTile)
    const profile = this.profile
    const prev = this._profileItems()
    const removed = this._removedFor(profile)
    const descriptors = kids.map((el) => {
      // Read once: the grid rewrites `size` itself, so later reads are its own words.
      if (!this._declared.has(el)) this._declared.set(el, el.getAttribute('size'))
      return {
        tag: el.localName,
        item: el.getAttribute('item') || undefined,
        declaredSize: this._declared.get(el) || undefined,
        spec: elementSpec(el),
      }
    })
    const current = itemsFromChildren(descriptors, (tag) => this._typeFor(tag), removed)
    // Written back so the next read, and a saved layout, find the same ids.
    kids.forEach((el, i) => {
      if (el.getAttribute('item') !== current[i].id) el.setAttribute('item', current[i].id)
    })
    if (DEV) this._warnGenerated(kids, descriptors, current)
    this._matchChildren(false)

    let items = reconcile(prev, current, removed)
    const resized = hostResizes(kids.map((el, i) => ({ id: current[i].id, size: el.getAttribute('size'), written: this._written.get(el) })))
    for (const [id, size] of resized) items = resizeItem(items, id, size, this._resolve)
    kids.forEach((el) => {
      if (resized.has(el.getAttribute('item'))) this._written.set(el, el.getAttribute('size'))
    })
    if (items.length !== prev.length || items.some((item, i) => item !== prev[i])) {
      this._layout = withProfile(this._layout, profile, items)
    }
  }

  /** The type of a child tag and the spec the catalogs give it. */
  _typeFor(tag) {
    const type = typeForTag(this._catalog, tag) ?? typeForTag(WIDGETS, tag) ?? tag
    return { type, spec: this._typeSpec({ id: type }) }
  }

  /** Match children to layout items, hide the rest, and lay out. */
  _sync(animate, keepTiles) {
    if (!this.isConnected) return
    if (!keepTiles && !this._explicit) this._reconcile()
    if (!this._m) return
    const before = new Set(this._tiles.keys())
    if (!keepTiles) this._matchChildren(true)
    const items = this._profileItems()
    this._order = items.filter((item) => this._tiles.has(item.id))
    const shown = new Set(this._order.map((item) => item.id))
    for (const [id, el] of this._tiles) if (!shown.has(id)) el.style.display = 'none'
    for (const id of this._chromes.keys()) if (!shown.has(id)) this._dropChrome(id)

    this._render(animate)

    // A tile that appears on a grid already showing grows into place.
    if (animate && this._motion() && this._wasShown && this._wasShown.size) {
      for (const id of shown) {
        if (before.has(id) && this._wasShown.has(id)) continue
        this._tiles.get(id).animate([{ opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' })
      }
    }
    this._wasShown = shown
    this._rendered = true
    if (DEV && !keepTiles) this._watchOrphans()
  }

  /** Match children to items by their item attribute. `hide` also hides the ones that match nothing. */
  _matchChildren(hide) {
    this._tiles.clear()
    for (const el of this.children) {
      if (!isTile(el)) continue
      const id = el.getAttribute('item')
      this._itemOf.set(el, id)
      if (id && !this._tiles.has(id)) this._tiles.set(id, el)
      else if (hide) {
        el.style.display = 'none'
        if (DEV && !id && this._explicit) warnOnce(`grid-noitem:${el.localName}`, `<ts-grid> child <${el.localName}> has no item attribute, so no layout item can place it.`)
      }
      if (DEV && hide) this._watchDefined(el)
    }
  }

  /** DEV: a dashed tag that is still undefined after a while is usually a missing import. */
  _watchDefined(el) {
    const tag = el.localName
    if (!tag.includes('-') || typeof customElements === 'undefined' || customElements.get(tag) || this._watchedTags.has(tag)) return
    this._watchedTags.add(tag)
    const timer = setTimeout(() => {
      this._watching.delete(timer)
      this._watchedTags.delete(tag)
      if (DEV && !customElements.get(tag)) warnOnce(`grid-undefined:${tag}`, `<ts-grid> child <${tag}> is still undefined after 2 s. Did you import 'tickslate/elements'?`)
    }, UNDEFINED_TAG_MS)
    this._watching.add(timer)
  }

  /** DEV: a layout item whose child hasn't appeared after two frames is kept but not shown. */
  _watchOrphans() {
    if (!this._explicit || this._orphanWatch || typeof requestAnimationFrame !== 'function') return
    let frames = 2
    const step = () => {
      if (--frames > 0) {
        this._orphanWatch = requestAnimationFrame(step)
        return
      }
      this._orphanWatch = 0
      for (const item of this._profileItems()) {
        if (DEV && !this._tiles.has(item.id)) warnOnce(`grid-orphan:${item.id}`, `<ts-grid> layout item "${item.id}" has no child with item="${item.id}"; it is kept in the layout but not shown.`)
      }
    }
    this._orphanWatch = requestAnimationFrame(step)
  }

  /** DEV: generated ids for a repeated type are fragile across reorders. */
  _warnGenerated(kids, descriptors, current) {
    const byTag = new Map()
    kids.forEach((el, i) => {
      const entry = byTag.get(el.localName) || { instances: 0, generated: [] }
      entry.instances++
      if (!descriptors[i].item || descriptors[i].item !== current[i].id) entry.generated.push(current[i].id)
      byTag.set(el.localName, entry)
    })
    for (const [tag, { instances, generated }] of byTag) {
      if (DEV && instances >= 2 && generated.length) {
        warnOnce(`grid-generated:${tag}`, `<ts-grid> generated ids ${generated.join(', ')} for repeated <${tag}> children. Give each an item attribute so saved layouts survive reordering.`)
      }
    }
  }

  _render(animate, skipId) {
    const m = this._m
    if (!m) return
    animate = animate && this._motion()
    const { placements, rows } = place(this._order, this._columns, this._resolve)
    this._placements = new Map(placements.map((p) => [p.id, p]))
    for (const p of placements) {
      const box = boxOf(p, m)
      const el = this._tiles.get(p.id)
      // A tile that wasn't on screen appears in place rather than sliding in
      // from wherever it last was.
      const slide = animate && this._boxes.has(p.id) && el.style.display !== 'none'
      this._boxes.set(p.id, box)
      if (el.getAttribute('size') !== p.variant) el.setAttribute('size', p.variant)
      this._written.set(el, p.variant)
      const chrome = this._chrome(p.id)
      if (p.id === skipId) continue
      setBox(el, box, slide)
      setBox(chrome, box, slide)
      const held = this._gesture && this._gesture.id === p.id
      if (this._editing && !held && !this._wiggles.has(p.id)) this._wiggle(p.id)
    }
    this._board.style.transition = animate ? '' : 'none'
    this._board.style.height = `${boardHeight(rows, m)}px`
  }

  _chrome(id) {
    let chrome = this._chromes.get(id)
    if (!chrome) {
      chrome = document.createElement('div')
      chrome.className = 'chrome'
      chrome.dataset.id = id
      chrome.setAttribute('role', 'button')
      chrome.setAttribute('aria-roledescription', 'tile')
      chrome.innerHTML = '<button class="remove" type="button" tabindex="-1"><span aria-hidden="true">−</span></button><div class="resize" aria-hidden="true"></div>'
      this._chromeLayer.appendChild(chrome)
      this._chromes.set(id, chrome)
    }
    const label = this._label(id)
    chrome.setAttribute('aria-label', `${label}. Space to move, plus or minus to resize, Delete to remove.`)
    chrome.querySelector('.remove').setAttribute('aria-label', `Remove ${label}`)
    chrome.tabIndex = this._editing ? 0 : -1
    chrome.setAttribute('aria-hidden', this._editing ? 'false' : 'true')
    const spec = this._spec(id)
    chrome.classList.toggle('fixed', !spec || spec.sizes.length < 2)
    return chrome
  }

  _dropChrome(id) {
    this._unwiggle(id)
    const chrome = this._chromes.get(id)
    if (chrome) chrome.remove()
    this._chromes.delete(id)
  }

  _item(id) {
    return this._order.find((item) => item.id === id)
  }

  _spec(id) {
    const item = this._item(id)
    return item ? this._resolve(item) : null
  }

  _label(id) {
    const el = this._tiles.get(id)
    const spec = this._spec(id)
    return (el && (el.getAttribute('label') || el.getAttribute('aria-label'))) || (spec && spec.label) || id
  }

  _motion() {
    return !(this._motionQuery && this._motionQuery.matches)
  }

  // ── Edit mode ──────────────────────────────────────────────────────────

  _startEditing() {
    if (!this.isConnected) return
    for (const [id, chrome] of this._chromes) {
      chrome.tabIndex = 0
      chrome.setAttribute('aria-hidden', 'false')
      this._wiggle(id)
    }
    document.addEventListener('keydown', this._onDocKeyDown)
  }

  _stopEditing() {
    if (this._gesture) this._cancelGesture()
    for (const [id, chrome] of this._chromes) {
      chrome.tabIndex = -1
      chrome.setAttribute('aria-hidden', 'true')
      this._unwiggle(id)
    }
    document.removeEventListener('keydown', this._onDocKeyDown)
  }

  /**
   * A gentle rocking, run on the tile and its chrome with the same timing so
   * they move as one. The angle shrinks for big tiles so every tile's
   * corners travel about the same 2–3 px.
   */
  _wiggle(id) {
    if (!this._motion() || !this._editing) return
    const el = this._tiles.get(id)
    const chrome = this._chromes.get(id)
    const box = this._boxes.get(id)
    if (!el || !chrome || !box) return
    this._unwiggle(id)
    const deg = Math.min(0.9, (2.4 / (Math.max(box.w, box.h) / 2)) * (180 / Math.PI))
    const index = this._order.findIndex((item) => item.id === id)
    const options = { duration: 130, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', delay: -((index * 47) % 260) }
    const frames = [{ rotate: `${-deg}deg` }, { rotate: `${deg}deg` }]
    this._wiggles.set(id, [el.animate(frames, options), chrome.animate(frames, options)])
  }

  _unwiggle(id) {
    const running = this._wiggles.get(id)
    if (running) for (const a of running) a.cancel()
    this._wiggles.delete(id)
  }

  // ── Pointer gestures ───────────────────────────────────────────────────

  _hit(path) {
    const root = this.shadowRoot
    for (const node of path) {
      if (node === this) break
      if (node.nodeType !== 1) continue
      if (node.getRootNode() === root) {
        if (node.classList.contains('remove')) return { kind: 'remove', id: node.parentElement.dataset.id }
        if (node.classList.contains('resize')) return { kind: 'resize', id: node.parentElement.dataset.id }
        if (node.classList.contains('chrome')) return { kind: 'chrome', id: node.dataset.id }
        if (node === this._board) return { kind: 'board' }
      } else if (node.parentElement === this && node.hasAttribute('item')) {
        const id = node.getAttribute('item')
        return this._placements.has(id) ? { kind: 'tile', id } : { kind: 'none' }
      }
    }
    return { kind: 'none' }
  }

  _onPointerDown(e) {
    if (this._gesture || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    const hit = this._hit(e.composedPath())
    const base = { pointerId: e.pointerId, pointerType: e.pointerType, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY }
    if (!this._editing) {
      if (hit.kind !== 'tile') return
      this._begin({ ...base, kind: 'press', id: hit.id })
      const g = this._gesture
      g.squeeze = setTimeout(() => {
        if (this._motion()) g.squeezeAnim = this._tiles.get(g.id).animate([{ scale: 1 }, { scale: 0.97 }], { duration: LONG_PRESS_MS - 120, easing: 'ease-out', fill: 'forwards' })
      }, 120)
      g.timer = setTimeout(() => {
        this._unsqueeze(g)
        this.editing = true
        this._lift(g)
      }, LONG_PRESS_MS)
    } else if (hit.kind === 'chrome') {
      this._begin({ ...base, kind: 'pending', id: hit.id })
      if (e.pointerType !== 'mouse') {
        const g = this._gesture
        g.timer = setTimeout(() => this._lift(g), TOUCH_HOLD_MS)
      }
    } else if (hit.kind === 'resize') {
      e.preventDefault()
      this._begin({ ...base, kind: 'resize', id: hit.id })
      this._startResize(this._gesture)
    } else if (hit.kind === 'board') {
      this._begin({ ...base, kind: 'tap' })
    }
  }

  _begin(g) {
    this._gesture = g
    window.addEventListener('pointermove', this._onPointerMove)
    window.addEventListener('pointerup', this._onPointerUp)
    window.addEventListener('pointercancel', this._onPointerCancel)
  }

  _end() {
    const g = this._gesture
    if (!g) return
    clearTimeout(g.timer)
    clearTimeout(g.squeeze)
    clearTimeout(g.settle)
    cancelAnimationFrame(g.raf)
    this._unsqueeze(g)
    window.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
    window.removeEventListener('pointercancel', this._onPointerCancel)
    this.removeAttribute('dragging')
    this._gesture = null
  }

  _unsqueeze(g) {
    clearTimeout(g.squeeze)
    if (g.squeezeAnim) g.squeezeAnim.cancel()
    g.squeezeAnim = null
  }

  _onPointerMove(e) {
    const g = this._gesture
    if (!g || e.pointerId !== g.pointerId) return
    g.x = e.clientX
    g.y = e.clientY
    const moved = Math.hypot(g.x - g.startX, g.y - g.startY)
    if (g.kind === 'press' || g.kind === 'tap') {
      // Moving before the long press completes means the user is scrolling.
      if (moved > PRESS_SLOP) this._end()
    } else if (g.kind === 'pending') {
      if (g.pointerType === 'mouse') {
        if (moved > MOUSE_DRAG_SLOP) this._lift(g)
      } else if (moved > PRESS_SLOP) {
        this._end()
      }
    } else if (g.kind === 'resize') {
      this._resizeMove(g)
    }
    // Drags are driven from _frame, once per animation frame.
  }

  _onPointerUp(e) {
    const g = this._gesture
    if (!g || e.pointerId !== g.pointerId) return
    if (g.kind === 'drag') this._drop(g)
    else if (g.kind === 'resize') this._endResize(g)
    else if (g.kind === 'tap') {
      this._end()
      this.editing = false
    } else this._end()
  }

  _onPointerCancel(e) {
    const g = this._gesture
    if (g && e.pointerId === g.pointerId) this._cancelGesture()
  }

  // ── Dragging ───────────────────────────────────────────────────────────

  _lift(g) {
    if (this._gesture !== g) return
    clearTimeout(g.timer)
    const el = this._tiles.get(g.id)
    const chrome = this._chromes.get(g.id)
    const box = this._boxes.get(g.id)
    if (!el || !chrome || !box) return this._end()
    const rect = this._board.getBoundingClientRect()
    g.kind = 'drag'
    g.scroller = scrollParent(this)
    g.scroll0 = scrollPos(g.scroller)
    g.board0 = { left: rect.left, top: rect.top }
    g.view = g.scroller ? g.scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight }
    g.offsetX = g.x - (rect.left + box.x)
    g.offsetY = g.y - (rect.top + box.y)
    g.from = this._order.slice()
    g.pending = -1
    const item = this._item(g.id)
    const spec = this._spec(g.id)
    g.cols = footprint(item.size, this._columns, spec ? spec.sizes : null, spec ? spec.phoneRows : null).cols
    this.setAttribute('dragging', '')
    if (g.pointerType !== 'keyboard') {
      try {
        this.setPointerCapture(g.pointerId)
      } catch {
        // The pointer may already be gone; the drag still ends on pointerup.
      }
    }
    this._suppressClick = true
    this._unwiggle(g.id)
    liftStyle(el, chrome, true)
    this._showPlaceholder(box, false)
    if (navigator.vibrate) navigator.vibrate(8)
    if (g.pointerType !== 'keyboard') g.raf = requestAnimationFrame(this._frame)
  }

  _frame() {
    const g = this._gesture
    if (!g || g.kind !== 'drag') return

    // Scroll when the pointer nears the top or bottom of what is visible,
    // faster the closer it gets. A long gap between frames (a busy main
    // thread) is capped so the page never lurches.
    const now = performance.now()
    const dt = Math.min(50, now - (g.lastFrame || now)) / 1000
    g.lastFrame = now
    const step = MAX_SCROLL * dt
    if (g.y < g.view.top + EDGE) scrollBy(g.scroller, -step * Math.min(1, (g.view.top + EDGE - g.y) / EDGE))
    else if (g.y > g.view.bottom - EDGE) scrollBy(g.scroller, step * Math.min(1, (g.y - (g.view.bottom - EDGE)) / EDGE))

    const { x, y, target } = this._track(g)
    const translate = `${x}px ${y}px`
    this._tiles.get(g.id).style.translate = translate
    this._chromes.get(g.id).style.translate = translate

    const current = this._order.findIndex((item) => item.id === g.id)
    if (target === current) {
      clearTimeout(g.settle)
      g.pending = -1
    } else if (target !== g.pending) {
      g.pending = target
      clearTimeout(g.settle)
      g.settle = setTimeout(() => this._reorder(g, g.pending), SETTLE_MS)
    }
    g.raf = requestAnimationFrame(this._frame)
  }

  /** Where the lifted tile is, relative to the board, and the slot under it. */
  _track(g) {
    const m = this._m
    const scroll = scrollPos(g.scroller)
    const x = g.x - g.offsetX - (g.board0.left - (scroll.x - g.scroll0.x))
    const y = g.y - g.offsetY - (g.board0.top - (scroll.y - g.scroll0.y))
    const target = dropIndex(this._order, g.id, cellAt(x, y, g.cols, m), this._columns, this._resolve, m.pitchX / m.pitchY)
    return { x, y, target }
  }

  /** Take a new slot: the other tiles slide, the placeholder follows. */
  _reorder(g, index) {
    if (this._gesture !== g || index < 0) return
    g.pending = -1
    this._order = moveItem(this._order, g.id, index)
    this._render(true, g.kind === 'drag' ? g.id : undefined)
    this._showPlaceholder(this._boxes.get(g.id), true)
  }

  _drop(g) {
    clearTimeout(g.settle)
    // Release decides, even for a flick that ended before the slot settled.
    if (g.pointerType !== 'keyboard') {
      const { target } = this._track(g)
      if (target !== this._order.findIndex((item) => item.id === g.id)) this._reorder(g, target)
    }
    this._settle(g)
    const moved = !sameOrder(g.from, this._order)
    if (moved) {
      this._commit('move', g.id)
      this._announce(`${this._label(g.id)}, moved to position ${this._position(g.id)} of ${this._order.length}.`)
    } else if (g.pointerType === 'keyboard') {
      this._announce(`${this._label(g.id)}, dropped.`)
    }
  }

  /** Glide the lifted tile into its slot and put it back among the others. */
  _settle(g) {
    const el = this._tiles.get(g.id)
    const chrome = this._chromes.get(g.id)
    const box = this._boxes.get(g.id)
    this._hidePlaceholder()
    this._end()
    setTimeout(() => {
      this._suppressClick = false
    }, 0)
    if (!el || !chrome || !box) return
    const animate = this._motion()
    setBox(el, box, animate, true)
    setBox(chrome, box, animate, true)
    liftStyle(el, chrome, false, animate)
    const done = () => {
      if (this._gesture && this._gesture.id === g.id) return
      el.style.zIndex = ''
      chrome.style.zIndex = ''
      chrome.classList.remove('lifted')
      if (this._editing) this._wiggle(g.id)
    }
    if (animate) setTimeout(done, 240)
    else done()
  }

  _cancelGesture() {
    const g = this._gesture
    if (!g) return
    if (g.kind === 'drag' || g.kind === 'resize') {
      clearTimeout(g.settle)
      this._order = g.from
      this._render(true, g.id)
      this._settle(g)
      if (g.pointerType === 'keyboard') this._announce(`${this._label(g.id)}, move cancelled.`)
    } else {
      this._end()
    }
  }

  _showPlaceholder(box, animate) {
    const ph = this._placeholder
    setBox(ph, box, animate && this._motion())
    ph.classList.add('on')
  }

  _hidePlaceholder() {
    this._placeholder.classList.remove('on')
  }

  // ── Resizing ───────────────────────────────────────────────────────────

  _startResize(g) {
    const box = this._boxes.get(g.id)
    const item = this._item(g.id)
    if (!box || !item) return this._end()
    g.box0 = box
    g.from = this._order.slice()
    g.size0 = item.size
    g.moved = false
    this._unwiggle(g.id)
    this._chromes.get(g.id).classList.add('lifted')
    this._tiles.get(g.id).style.zIndex = '5'
    this._chromes.get(g.id).style.zIndex = '6'
    this._suppressClick = true
  }

  _resizeMove(g) {
    const dx = g.x - g.startX
    const dy = g.y - g.startY
    if (!g.moved && Math.hypot(dx, dy) < MOUSE_DRAG_SLOP) return
    if (!g.moved) {
      g.moved = true
      this.setAttribute('dragging', '')
    }
    const spec = this._spec(g.id)
    if (!spec) return
    const w = Math.max(this._m.colWidth, g.box0.w + dx)
    const h = Math.max(this._m.rowHeight, g.box0.h + dy)
    // The outline stretches with the pointer; the tile snaps between sizes.
    this._showPlaceholder({ x: g.box0.x, y: g.box0.y, w, h }, false)
    const extent = extentOf(w, h, this._m)
    const item = this._item(g.id)
    const size = sizeForExtent(spec, extent.cols, extent.rows, this._columns, item.size)
    if (size !== item.size) {
      this._order = resizeItem(this._order, g.id, size, this._resolve)
      this._render(true)
    }
  }

  _endResize(g) {
    const spec = this._spec(g.id)
    if (!g.moved && spec) {
      // A tap steps to the next size, wrapping from the largest to the smallest.
      let next = stepSize(spec, g.size0, 1)
      if (next === g.size0) next = stepSize(spec, g.size0, -1) === g.size0 ? g.size0 : smallest(spec)
      this._order = resizeItem(this._order, g.id, next, this._resolve)
      this._render(true)
    }
    this._hidePlaceholder()
    this._end()
    setTimeout(() => {
      this._suppressClick = false
    }, 0)
    const el = this._tiles.get(g.id)
    const chrome = this._chromes.get(g.id)
    setTimeout(() => {
      if (el) el.style.zIndex = ''
      if (chrome) {
        chrome.style.zIndex = ''
        chrome.classList.remove('lifted')
      }
      if (this._editing && this._placements.has(g.id)) this._wiggle(g.id)
    }, this._motion() ? 240 : 0)
    const size = this._item(g.id).size
    if (size !== g.size0) {
      this._commit('resize', g.id)
      this._announce(`${this._label(g.id)}, size ${size}.`)
    }
  }

  // ── Removing ───────────────────────────────────────────────────────────

  _remove(id) {
    if (!this._editing || !this._placements.has(id) || this._gesture) return
    const el = this._tiles.get(id)
    const chrome = this._chromes.get(id)
    const label = this._label(id)
    const finish = () => {
      this._order = removeItem(this._order, id)
      el.style.display = 'none'
      this._dropChrome(id)
      this._placements.delete(id)
      this._render(true)
      const profile = this.profile
      const previous = this._layout
      const list = this._profileItems()
      const index = list.findIndex((item) => item.id === id)
      // Children can't bring a removed tile back; only a restore can.
      this._removedFor(profile).add(id)
      this._layout = withProfile(this._layout, profile, removeItem(list, id))
      this._emit('ts-layout-change', { layout: this._layout, items: this._profileItems(), previous, profile, reason: 'remove', id, index, item: list[index] })
      this._announce(`${label} removed.`)
    }
    if (!this._motion()) return finish()
    this._unwiggle(id)
    const out = [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.85 }]
    const options = { duration: 180, easing: 'ease-in', fill: 'forwards' }
    chrome.animate(out, options)
    el.animate(out, options).finished.then(() => {
      finish()
      for (const a of el.getAnimations()) a.cancel()
    })
  }

  // ── Keyboard ───────────────────────────────────────────────────────────

  _onDocKeyDown(e) {
    // Escape works even when focus is outside the grid, as after a long press
    // with the mouse.
    if (e.key !== 'Escape' || e.defaultPrevented) return
    if (this._gesture) this._cancelGesture()
    else this.editing = false
    e.preventDefault()
  }

  _onKeyDown(e) {
    if (!this._editing) return
    const chrome = e.composedPath()[0]
    if (!chrome || !chrome.classList || !chrome.classList.contains('chrome')) return
    const id = chrome.dataset.id
    const g = this._gesture
    const held = g && g.kind === 'drag' && g.pointerType === 'keyboard' && g.id === id
    const key = e.key

    if (key === ' ' || key === 'Enter') {
      e.preventDefault()
      if (held) return this._drop(g)
      if (g) return
      this._gesture = { kind: 'pending', pointerType: 'keyboard', id, x: 0, y: 0 }
      this._lift(this._gesture)
      this._announce(`${this._label(id)}, picked up. Use the arrow keys to move it, Space to drop, Escape to cancel.`)
    } else if (held && key.startsWith('Arrow')) {
      e.preventDefault()
      this._keyMove(g, key)
    } else if (!g && (key === '+' || key === '=' || key === '-' || key === '_')) {
      e.preventDefault()
      const spec = this._spec(id)
      if (!spec) return
      const item = this._item(id)
      const next = stepSize(spec, item.size, key === '-' || key === '_' ? -1 : 1)
      if (next === item.size) return
      this._order = resizeItem(this._order, id, next, this._resolve)
      this._render(true)
      this._commit('resize', id)
      this._announce(`${this._label(id)}, size ${next}.`)
    } else if (!g && (key === 'Delete' || key === 'Backspace')) {
      e.preventDefault()
      const ids = [...this._placements.keys()]
      const next = ids[ids.indexOf(id) + 1] || ids[ids.indexOf(id) - 1]
      this._remove(id)
      if (next) setTimeout(() => this._chromes.get(next) && this._chromes.get(next).focus(), this._motion() ? 200 : 0)
    }
  }

  /** Move a held tile one cell, going further if that cell can't hold it. */
  _keyMove(g, key) {
    const p = this._placements.get(g.id)
    const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
    const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
    const current = this._order.findIndex((item) => item.id === g.id)
    const limit = Math.max(this._columns, this._order.length * 2)
    for (let step = 1; step <= limit; step++) {
      const col = p.col + dx * step
      const row = p.row + dy * step
      if (col < 0 || row < 0 || col > this._columns - p.cols) break
      const target = dropIndex(this._order, g.id, { col, row }, this._columns, this._resolve)
      if (target !== current) {
        this._order = moveItem(this._order, g.id, target)
        this._render(true)
        this._showPlaceholder(this._boxes.get(g.id), true)
        this._announce(`Position ${this._position(g.id)} of ${this._order.length}.`)
        return
      }
    }
  }

  // ── Output ─────────────────────────────────────────────────────────────

  _commit(reason, id) {
    const previous = this._layout
    const items = mergeOrder(this._profileItems(), this._order)
    this._layout = withProfile(this._layout, this.profile, items)
    this._emit('ts-layout-change', { layout: this._layout, items, previous, profile: this.profile, reason, id })
  }

  _position(id) {
    const sorted = [...this._placements.values()].sort((a, b) => a.row - b.row || a.col - b.col)
    return sorted.findIndex((p) => p.id === id) + 1
  }

  _announce(text) {
    this._status.textContent = text
  }

  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
  }
}

/** Anything but the grid's own furniture: scripts, styles and the empty-board slot are never tiles. */
function isTile(el) {
  return !NOT_TILES.has(el.localName) && el.getAttribute('slot') !== 'empty'
}

function setBox(el, box, animate, lifted) {
  const s = el.style
  s.position = 'absolute'
  s.top = '0'
  s.left = '0'
  s.margin = '0'
  s.boxSizing = 'border-box'
  s.width = `${box.w}px`
  s.height = `${box.h}px`
  s.transition = animate
    ? `translate ${SLIDE}, width ${SLIDE}, height ${SLIDE}${lifted ? `, scale ${SLIDE}, box-shadow ${SLIDE}` : ''}`
    : 'none'
  s.translate = `${box.x}px ${box.y}px`
  if (s.display === 'none') s.display = ''
}

function liftStyle(el, chrome, on, animate = true) {
  if (on) {
    // The tile follows the pointer directly; only the lift itself eases in.
    el.style.transition = 'scale 160ms ease-out, box-shadow 160ms ease-out'
    chrome.style.transition = 'scale 160ms ease-out'
    el.style.zIndex = '5'
    chrome.style.zIndex = '6'
    el.style.scale = String(LIFT_SCALE)
    chrome.style.scale = String(LIFT_SCALE)
    el.style.boxShadow = 'var(--ts-shadow-lift, 0 24px 48px -16px rgba(0, 0, 0, .4))'
    el.style.borderRadius = 'var(--ts-radius, 10px)'
    chrome.classList.add('lifted')
  } else {
    el.style.scale = ''
    chrome.style.scale = ''
    el.style.boxShadow = ''
    if (!animate) chrome.classList.remove('lifted')
  }
}

function sameOrder(a, b) {
  return a.length === b.length && a.every((item, i) => item.id === b[i].id)
}

function smallest(spec) {
  let size = spec.sizes[0]
  for (let next = stepSize(spec, size, -1); next !== size; next = stepSize(spec, size, -1)) size = next
  return size
}

/** The nearest ancestor that scrolls vertically, or null for the page. */
function scrollParent(el) {
  for (let node = el.parentElement || (el.getRootNode() && el.getRootNode().host); node; ) {
    if (node === document.body || node === document.documentElement) return null
    const style = getComputedStyle(node)
    if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement || (node.getRootNode() && node.getRootNode().host)
  }
  return null
}

function scrollPos(scroller) {
  return scroller ? { x: scroller.scrollLeft, y: scroller.scrollTop } : { x: scrollX, y: scrollY }
}

function scrollBy(scroller, dy) {
  if (scroller) scroller.scrollTop += dy
  else window.scrollBy(0, dy)
}
