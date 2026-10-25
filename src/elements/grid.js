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
 * In edit mode a transparent "chrome" covers each tile: a plain container of
 * four sibling buttons (RFC 0002 §5.9, RFC 0003 §19; the fourth, pin, only at 2 columns). The handle covers the tile, catches
 * every pointer, so a drag can never press a button inside a widget, and is
 * the one Tab stop; remove, resize and pin sit beside it, reachable by assistive
 * technology. Nothing interactive is nested inside anything interactive.
 */

import {
  DEFAULT_PROFILE,
  EN,
  TOP_STRIP_MAX,
  WIDGETS,
  addItem,
  activeProfile,
  columnsFor,
  currentConfig,
  dropIndex,
  emptyLayout,
  footprint,
  isSize,
  moveItem,
  nextProfileChange,
  onConfigure,
  place,
  readLayout,
  removeItem,
  resizeItem,
  setTopStrip,
  sizeForExtent,
  snapSize,
  stepSize,
  typeForTag,
  typeOf,
  withProfile,
} from '../core/index.js'
import { BREAKPOINTS, validThresholds } from '../core/sizes.js'
import {
  boardHeight,
  boxOf,
  cellAt,
  elementSpec,
  extentOf,
  hasSmall,
  hostResizes,
  itemsFromChildren,
  keepInPlace,
  mergeOrder,
  mergeStrip,
  metrics,
  px,
  reconcile,
  specResolver,
  splitStrip,
  stripBoxes,
  stripSlotAt,
  visualOrder,
} from './grid-geometry.js'
import { ensureTokens } from './default-tokens.js'
import { DEV, warnOnce } from './dev.js'
import { createHistory } from './grid-history.js'
import { isOutside, pickFocusTarget } from './grid-focus.js'
import { keyAction, tapAction } from './grid-input.js'
import { translator } from './messages-cache.js'
import { persistLayout } from './persist.js'
import { onCatalogChange, widgetCatalog } from './registry.js'

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
// A second remove inside this window is a double-click or a doubled key press,
// not a second decision: once the first tile is gone the next one has slid under
// the pointer and into focus, and would be removed by the same gesture.
const REMOVE_GUARD_MS = 400
// How long the undo toast stays, unless the pointer or focus is on it.
const TOAST_MS = 6000
// A developer's warning, not interface text, so it stays out of the messages.
const LOCKED_WARNING = '<ts-grid> is locked, so editing = true was ignored. Remove the locked attribute to allow editing.'
const EMPTY_PERSIST_WARNING = '<ts-grid> persist attribute is empty, so saving is off. Give it a key, for example persist="my-dashboard".'
const NAMED_ROOT_WARNING = '<ts-grid> reused a shadow root that assigns slots by name, so reading and Tab order follow the DOM order, not the layout. Add shadowrootslotassignment="manual" to its <template shadowrootmode>, or leave the declarative shadow root out.'
// Wording and link are fixed by RFC 0003 §4.3.
const UNSAVED_WARNING = '<ts-grid> edits will be lost on reload: add a persist attribute, or call persistLayout(). See docs/guide/saving-layouts.md'
// Tells one grid's warning from another's: warnOnce keys are global, and each unsaved grid is worth one.
let unsavedSerial = 0
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

// A host answers ts-add-request by rendering a child; this long is how long the grid waits for it (RFC 0003 §18.2).
const ADD_WAIT_MS = 10000

/** The built-ins and every defineWidget() type: what a type resolves to after the host's own catalog (RFC 0003 §18.1). */
function registered(item) {
  const type = item.type === undefined ? item.id : item.type
  const all = widgetCatalog()
  return typeof type === 'string' && hasOwn(all, type) ? all[type] : null
}

// Built on first use, so importing this module where there is no DOM (Node,
// server-side rendering) doesn't throw.
//
// The phone top strip's CSS (RFC 0003 §19), explained here because a comment inside the template ships to every page:
// - .strip holds the pinned tiles in one row above the board, stuck below a host's own header. It is opaque, so tiles
//   scrolling beneath don't show through its gaps.
// - Focus and scrolling to a tile must not leave it under the strip (WCAG 2.4.11), hence the scroll margin.
// - The pin button is the fourth chrome button, top-end opposite remove, and shares remove's box. Its arrow is drawn
//   with ::before, not written, so it is not text the grid owns: up pins, down unpins.
// - The strip sits at the top of the page when stuck, so a strip tile's buttons are drawn inside its corner.
let template = null
const TEMPLATE = `
<style>
  :host { display: block; position: relative; inline-size: 100%; max-inline-size: var(--ts-grid-max-width, none); margin-inline: auto; -webkit-tap-highlight-color: transparent; }
  :host([hidden]) { display: none; }
  :host([dragging]) { cursor: grabbing; }
  .board { position: relative; transition: height ${SLIDE}; }
  .strip { position: sticky; inset-block-start: var(--ts-strip-top, 0px); z-index: 7; background: var(--ts-bg); transition: height ${SLIDE}; }
  .board ::slotted(*), .board .handle { scroll-margin-block-start: var(--_strip-clear, 0px); }
  /* Focus lands here when a removed tile leaves nothing else to take it. */
  .board:focus-visible { outline: 2px solid var(--ts-focus); outline-offset: 2px; }
  /* A long press must never start a text selection on a touch screen, but a
     mouse user may copy a figure out of a tile until they start editing. */
  @media (pointer: coarse) {
    :host(:not([locked])) ::slotted(*) { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  }
  :host([editing]) ::slotted(*), :host([dragging]) ::slotted(*) { -webkit-user-select: none; user-select: none; }
  .placeholder {
    position: absolute; top: 0; left: 0; box-sizing: border-box; pointer-events: none;
    border-radius: var(--ts-radius, 10px);
    background: color-mix(in srgb, var(--ts-ink) 4%, transparent);
    border: 1.5px dashed color-mix(in srgb, var(--ts-ink) 22%, transparent);
    opacity: 0; transition: opacity 120ms ease;
  }
  .placeholder.on { opacity: 1; }
  .chromes { position: absolute; inset: 0; pointer-events: none; }
  /* The container never takes a pointer; its three buttons do, while editing. */
  .chrome {
    position: absolute; top: 0; left: 0; box-sizing: border-box; pointer-events: none;
    border-radius: var(--ts-radius, 10px); z-index: 2;
  }
  .chrome button { font: inherit; color: inherit; }
  .handle {
    position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; border-radius: inherit;
    background: none; pointer-events: none; cursor: grab; -webkit-tap-highlight-color: transparent;
  }
  :host([editing]) .handle, :host([editing]) .remove, :host([editing]) .resize, :host([editing]) .chrome.pinnable .pin { pointer-events: auto; }
  :host([locked]) .chrome button { pointer-events: none; }
  .chrome.removing .handle, .chrome.removing .remove, .chrome.removing .resize, .chrome.removing .pin { pointer-events: none; }
  .chrome.removing .remove { display: none; }
  :host([dragging]) .handle { cursor: grabbing; }
  /* An outline, not a shadow, so the ring survives forced colours. */
  .handle:focus-visible, .resize:focus-visible { outline: 2px solid var(--ts-focus); outline-offset: 2px; }
  .chrome.held .handle { outline: 2px solid var(--ts-focus); outline-offset: 2px; }
  .remove, .resize, .pin { display: none; }
  :host([editing]) .remove, :host([editing]) .resize, :host([editing]) .chrome.pinnable .pin { display: flex; }
  .chrome.lifted .remove, .chrome.lifted .resize, .chrome.fixed .resize, :host([editing]) .chrome.lifted .pin { display: none; }
  .remove, .pin {
    position: absolute; inset-block-start: -16px; width: 44px; height: 44px; padding: 0; margin: 0;
    border: 0; background: none; align-items: center; justify-content: center; cursor: pointer;
    animation: pop 160ms var(--ts-ease, ease-out);
  }
  .remove { inset-inline-start: -16px; }
  .pin { inset-inline-end: -16px; }
  .remove span, .pin span {
    width: 22px; height: 22px; border-radius: 50%; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center;
    background: var(--ts-surface-2); color: var(--ts-ink);
    border: 1px solid var(--ts-line); box-shadow: var(--ts-shadow, none);
    font: 600 16px/1 var(--ts-font-ui, system-ui, sans-serif);
  }
  .remove:focus-visible span, .pin:focus-visible span { outline: 2px solid var(--ts-focus); outline-offset: 2px; }
  .pin span { font-size: 13px; }
  .pin span::before { content: '\\2191'; }
  .chrome.in-strip .pin span::before { content: '\\2193'; }
  .chrome.in-strip .remove, .chrome.in-strip .pin { inset-block-start: -10px; }
  .chrome.in-strip .remove { inset-inline-start: -10px; }
  .chrome.in-strip .pin { inset-inline-end: -10px; }
  .resize {
    position: absolute; inset-inline-end: -6px; bottom: -6px; width: 44px; height: 44px; margin: 0; padding: 0; border: 0;
    background: none; cursor: nwse-resize; touch-action: none; animation: pop 160ms var(--ts-ease, ease-out);
  }
  .resize::after {
    content: ''; position: absolute; inset-inline-end: 12px; bottom: 12px; width: 12px; height: 12px;
    border-inline-end: 3px solid var(--ts-muted); border-bottom: 3px solid var(--ts-muted);
    border-end-end-radius: 6px;
  }
  /* The handle sits bottom-left under dir=rtl, so the drag cursor mirrors with it. */
  .board.rtl .resize { cursor: nesw-resize; }
  @keyframes pop { from { opacity: 0; scale: .6; } to { opacity: 1; scale: 1; } }
  @media (prefers-reduced-motion: reduce) {
    /* The wiggle is gone, so this outline alone says "editing". The RFC's 45% mix is
       2.8:1 against Paper's --ts-bg, under the 3:1 it asks for; 50% clears it in both themes. */
    :host([editing]) .chrome { outline: 2px dashed color-mix(in srgb, var(--ts-ink) 50%, transparent); outline-offset: -1px; }
    .remove, .resize, .pin { animation: none; }
  }
  [hidden] { display: none !important; }
  /* The dock holds the pill and, above it, the undo toast, so they never overlap.
     It has no height of its own until the pill shows, then it reserves the pill's
     room: below the grid when it all fits, floating over the tiles when it doesn't. */
  .dock { position: sticky; bottom: 22px; height: 0; z-index: 7; pointer-events: none; }
  .dock.has-pill { height: 56px; margin-top: 22px; }
  .stack {
    position: absolute; inset-inline: 0; bottom: 0; display: flex; flex-direction: column; align-items: center;
    gap: 10px; pointer-events: none;
  }
  .toast {
    position: relative; display: inline-flex; align-items: center; gap: 0; padding-block: 4px; padding-inline: 20px 4px;
    border-radius: 999px; box-sizing: border-box; max-width: calc(100% - 32px); white-space: nowrap;
    background: var(--ts-ink); color: var(--ts-surface); box-shadow: var(--ts-shadow-lift);
    font: 500 13px var(--ts-font-ui); pointer-events: auto;
  }
  /* Kept in the tree while off, so the status region announces the next text put in it. */
  .toast:not(.on) { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; opacity: 0; pointer-events: none; }
  .toast .msg { overflow: hidden; text-overflow: ellipsis; }
  .toast .sep { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .toast .undo {
    min-width: 44px; min-height: 44px; margin: 0; margin-inline-start: 16px; padding: 0 18px; border: 0; border-radius: 999px; cursor: pointer;
    background: color-mix(in srgb, var(--ts-surface) 14%, transparent); color: inherit; font: inherit; font-weight: 600;
  }
  .toast .undo:focus-visible { outline: 2px solid var(--ts-surface); outline-offset: 2px; }
  .pill {
    position: relative; display: inline-flex; align-items: center; gap: 4px; padding: 5px; border-radius: 999px;
    box-sizing: border-box; max-width: calc(100% - 32px); pointer-events: auto;
    background: var(--ts-surface); color: var(--ts-ink); border: 1px solid var(--ts-line); box-shadow: var(--ts-shadow-lift);
  }
  .pb {
    min-width: 44px; min-height: 44px; margin: 0; padding: 0 20px; border: 0; border-radius: 999px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap;
    background: none; color: var(--ts-ink); font: 600 13px var(--ts-font-ui);
  }
  .pb:focus-visible, .mi:focus-visible, .edit-btn:focus-visible { outline: 2px solid var(--ts-focus); outline-offset: 2px; }
  .pb[aria-expanded="true"] { background: var(--ts-surface-2); }
  .pb.done { padding-inline: 24px; background: var(--ts-accent); color: var(--ts-surface); }
  .pb.ghost { border: 1px solid var(--ts-line); background: var(--ts-surface); }
  .pb .plus { color: var(--ts-accent); font-size: 16px; line-height: 1; }
  .menu {
    position: absolute; bottom: calc(100% + 8px); inset-inline-start: 0; z-index: 3; box-sizing: border-box;
    width: 250px; max-width: calc(100vw - 32px); max-height: 50vh; overflow-y: auto; padding: 6px;
    display: flex; flex-direction: column; text-align: start;
    background: var(--ts-surface); color: var(--ts-ink); border: 1px solid var(--ts-line);
    border-radius: var(--ts-radius); box-shadow: var(--ts-shadow-lift); pointer-events: auto;
  }
  .menu-h { padding: 8px 10px 6px; font: 600 10px var(--ts-font-ui); letter-spacing: .12em; text-transform: uppercase; color: var(--ts-muted); }
  .mi {
    display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 44px;
    margin: 0; padding: 0 10px; border: 0; border-radius: var(--ts-radius-sm); cursor: pointer; text-align: start;
    background: none; color: inherit; font: 13px var(--ts-font-ui);
  }
  .mi:hover { background: var(--ts-surface-2); }
  .mi .plus { color: var(--ts-accent); font-size: 16px; }
  /* Visually hidden until a keyboard user reaches it, so it is the first Tab stop without crowding the dashboard. */
  .edit-btn {
    position: absolute; top: 12px; inset-inline-start: 12px; z-index: 8; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
    overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  }
  .edit-btn:focus-visible {
    width: auto; height: auto; min-height: 44px; margin: 0; padding: 0 18px; overflow: visible; clip-path: none;
    border: 1px solid var(--ts-line); border-radius: 999px; cursor: pointer;
    background: var(--ts-surface); color: var(--ts-ink); font: 600 13px var(--ts-font-ui); box-shadow: var(--ts-shadow-lift);
  }
  .empty {
    position: absolute; inset: 0; box-sizing: border-box; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 12px; padding: 16px; text-align: center; color: var(--ts-ink); font: 500 14px var(--ts-font-ui);
    border: 1.5px dashed color-mix(in srgb, var(--ts-ink) 22%, transparent); border-radius: var(--ts-radius);
    background: color-mix(in srgb, var(--ts-ink) 4%, transparent);
  }
  .empty .note { margin: 0; }
  .empty .anchor { position: relative; }
  /* Centring is symmetric, so a physical left is right in both directions; an inline start of 50% would hang the menu off-centre in RTL. */
  .empty .menu { bottom: auto; top: calc(100% + 8px); left: 50%; right: auto; translate: -50% 0; }
  .hint { display: none; }
  .sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
<button class="edit-btn" type="button" hidden></button>
<div class="strip" part="strip" role="region" hidden>
  <div class="chromes"></div>
</div>
<div class="board" part="board" role="region">
  <div class="placeholder" part="placeholder"></div>
  <slot></slot>
  <div class="chromes"></div>
  <div class="empty" part="empty" hidden>
    <slot name="empty"><p class="note"></p></slot>
    <div class="anchor"><button class="pb ghost add" type="button" aria-expanded="false" hidden><span class="plus" aria-hidden="true">+</span><span class="t"></span></button><div class="menu" role="group" hidden></div></div>
  </div>
</div>
<div class="dock"><div class="stack">
  <div class="toast" part="toast" role="status"><span class="msg"></span><span class="sep"> · </span><button class="undo" type="button" tabindex="-1"></button></div>
  <div class="pill" part="edit-pill" role="group" hidden>
    <button class="pb add" type="button" aria-expanded="false" hidden><span class="plus" aria-hidden="true">+</span><span class="t"></span></button>
    <button class="pb done" type="button"></button>
    <div class="menu" role="group" hidden></div>
  </div>
</div></div>
<div class="sr" role="status" aria-live="polite"></div>
<p class="hint" id="hint"></p>
`

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement

export class TsGrid extends Base {
  static get observedAttributes() {
    return ['editing', 'profile', 'locked', 'edit-controls', 'locale', 'currency', 'time-zone', 'hour-cycle', 'persist', 'aria-label']
  }

  constructor() {
    super()
    if (!template) {
      template = document.createElement('template')
      template.innerHTML = TEMPLATE
    }
    // Decided at attach time, since a root can't change how it assigns later.
    // Where `assign` is missing the root is made as before, with one default
    // slot, and Tab and reading order follow the host's DOM order (RFC 0003 Decision 27).
    const canAssign = typeof HTMLSlotElement !== 'undefined' && typeof HTMLSlotElement.prototype.assign === 'function'
    const root = this.attachShadow(canAssign ? { mode: 'open', slotAssignment: 'manual' } : { mode: 'open' })
    // Asked of the root, not assumed: a declarative shadow root without shadowrootslotassignment="manual" is reused as it is, and assigns by name.
    this._manual = root.slotAssignment === 'manual'
    if (DEV && canAssign && !this._manual) warnOnce('grid-slot-assignment', NAMED_ROOT_WARNING)
    root.appendChild(template.content.cloneNode(true))
    this._board = root.querySelector('.board')
    this._placeholder = root.querySelector('.board .placeholder')
    this._chromeLayer = root.querySelector('.board .chromes')
    // The phone top strip (RFC 0003 §19): its own sticky container, with its own placeholder and chrome layer.
    this._stripEl = root.querySelector('.strip')
    this._stripPlaceholder = null // made when a strip tile is first lifted, so the board's is the only one until then
    this._stripLayer = root.querySelector('.strip .chromes')
    // Manual mode only. The default slot keeps what isn't a tile; each visible tile gets a slot of its own.
    this._restSlot = root.querySelector('.board > slot:not([name])')
    this._emptySlot = root.querySelector('slot[name="empty"]')
    this._tileSlots = new Map() // id → its slot
    this._slotted = new Map() // slot → the tile it was last assigned
    this._restNodes = [] // what the default and empty slots were last assigned
    this._emptyNodes = []
    this._readingOrder = Object.freeze([]) // the visible ids in visual order, as of the last time they were read outside edit mode
    this._orderKnown = false // false until the first order with a tile in it, which fires no event
    this._reportedOrder = this._readingOrder // the order the event last told of, which readingOrder runs ahead of in edit mode
    this._quietOrder = false // true while the host's first layout is applied, which is not a rearrangement
    this._edited = false // true once a ts-layout-change has fired: the layout is no longer the host's alone
    this._status = root.querySelector('.sr')
    this._toast = root.querySelector('.toast')
    this._toastText = root.querySelector('.toast .msg')
    this._toastUndo = root.querySelector('.toast .undo')
    this._editBtn = root.querySelector('.edit-btn')
    this._dock = root.querySelector('.dock')
    this._pill = root.querySelector('.pill')
    this._emptyPanel = root.querySelector('.empty')
    this._hint = root.querySelector('.hint')
    this._messages = null
    this._tText = null // the translate function the static texts were last written with
    this._widgets = new Set() // the widgets inside it, at any depth of shadow roots, which it tells when its messages or locale change
    this._offConfigure = null
    this._persistOn = false // true from the first measure on connect to disconnect, when the persist attribute may attach
    this._persistKey = null // the key persistLayout is attached with
    this._persistHandle = null
    this._persistBase = null // the layout a device with nothing saved falls back to
    // Each place Add back appears: its button, its list, and what counts as inside it.
    this._addBack = {
      pill: { add: this._pill.querySelector('.add'), menu: this._pill.querySelector('.menu'), wrap: this._pill },
      empty: { add: this._emptyPanel.querySelector('.add'), menu: this._emptyPanel.querySelector('.menu'), wrap: this._emptyPanel.querySelector('.anchor') },
    }
    this._menuOwner = null // 'pill' or 'empty' while a list is open
    this._menuSig = ''
    this._editOrigin = null // the element that started editing, for the focus return
    this._toastState = null // { remaining, started, timer, hover, focus } while the toast shows
    this._history = createHistory()
    this._stripSteps = new WeakSet() // the layouts undo returns to for a step that changed the strip, so other steps leave it alone
    // Only a tile the grid shows and can draw at S takes a pin slot; any other saved id is kept but never blocks a pin.
    this._pinSlot = (id) => {
      const item = this._tiles.has(id) && this._profileItems().find((it) => it.id === id)
      return !!item && this._canPin(item)
    }
    this._removing = new Set() // ids fading out, so a second click or Delete does nothing
    this._removedAt = -Infinity // when a remove last began, for the double-click guard
    this._inertWas = new Map() // tile → whether the host had set inert, restored exactly when editing ends
    this._deferred = false // a scheduled profile change waiting for Done
    this._said = [] // announcements waiting for the next frame

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
    this._order = [] // the visible board items, in the order being shown; the strip's tiles are in _strip
    this._strip = [] // the visible items pinned to the top strip, in strip order (always empty outside 2 columns)
    this._wasStrip = new Set() // who was in the strip at the last render, so a tile changing zone appears in place
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
    this._addTypes = null // the types the host answers ts-add-request for: a list, '*' or null
    this._pendingAdds = new Map() // id → { type, size, timer }: requests the host has taken and not yet answered with a child
    this._openPicker = null // set by <ts-grid-controls> while a picker is linked
    this._stateListeners = new Set() // <ts-grid-controls>, which redraw when the schedule or an override changes
    this._offCatalog = null
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
    this._onDocPointerDown = this._onDocPointerDown.bind(this)
    this._onMenuPointerDown = this._onMenuPointerDown.bind(this)
    this._onResizeLost = this._onResizeLost.bind(this)
    this._frame = this._frame.bind(this)
    this._syncText()

    // The document sees a press inside a closed shadow root with a path that
    // stops at the closed host, so the grid notes the presses that reached it
    // (and the menu list) and the document-level handlers defer to that. In
    // the capture phase, so a widget that stops its own pointerdown is still seen.
    this._pressesIn = new WeakSet()
    this._pressesInMenu = new WeakSet()
    this._outsideTimer = 0
    this._menuOutsideTimer = 0
    this.addEventListener('pointerdown', (e) => {
      this._pressesIn.add(e)
      const owner = this._menuOwner
      if (owner && e.composedPath().includes(this._addBack[owner].wrap)) this._pressesInMenu.add(e)
    }, true)
    this.addEventListener('pointerdown', this._onPointerDown)
    this.addEventListener('keydown', this._onKeyDown)
    // Firefox clicks a button on Space's keyup unless that is cancelled too, and a click would pick the tile up again.
    this.addEventListener('keyup', (e) => {
      if (this._editing && (e.key === ' ' || e.key === 'Spacebar') && this._handleOf(e)) e.preventDefault()
    })
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
      const target = e.target.closest ? e.target : null
      if (!target) return
      const button = target.closest('.remove')
      const handle = target.closest('.handle')
      const resize = target.closest('.resize')
      const pin = target.closest('.pin')
      if (pin) this._togglePin(pin.parentElement.dataset.id)
      else if (button) this._remove(button.parentElement.dataset.id)
      else if (handle) this._tap(handle.parentElement.dataset.id)
      else if (resize) this._resizeClick(resize.parentElement.dataset.id)
      else if (target === this._board || target === this._stripEl) this._tap(null)
      else if (target.closest('.undo')) this._undoFromToast()
      else if (target.closest('.edit-btn')) {
        if (this.locked) return
        this._editOrigin = this._editBtn
        this.editing = true
      } else if (target.closest('.done')) this.editing = false
      else if (target.closest('.add')) {
        if (this._openPicker) this._showPicker(target.closest('.add'))
        else this._toggleMenu(target.closest('.pill') ? 'pill' : 'empty')
      }
      else if (target.closest('.mi')) this._restoreFromMenu(target.closest('.mi').dataset.id)
    })
    root.addEventListener('keydown', (e) => {
      if (!this._menuOwner) return
      if (e.key === 'Escape') {
        // Closing the list is all Escape does here, not leaving edit mode.
        e.preventDefault()
        this._closeMenu(true)
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...this._addBack[this._menuOwner].menu.querySelectorAll('.mi')]
        const at = items.indexOf(root.activeElement)
        if (at < 0 && root.activeElement !== this._addBack[this._menuOwner].add) return
        e.preventDefault()
        const next = at < 0 ? (e.key === 'ArrowDown' ? 0 : items.length - 1) : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        if (items[next]) items[next].focus()
      }
    })
    // The toast waits while the user is looking at it.
    const toastHold = (key, on) => () => {
      const t = this._toastState
      if (!t) return
      t[key] = on
      this._toastTimer()
    }
    this._toast.addEventListener('pointerenter', toastHold('hover', true))
    this._toast.addEventListener('pointerleave', toastHold('hover', false))
    this._toast.addEventListener('focusin', toastHold('focus', true))
    this._toast.addEventListener('focusout', toastHold('focus', false))
  }

  // ── Public API ─────────────────────────────────────────────────────────

  get layout() {
    // A plain read: reconciling here could write `item` attributes. Implicit
    // mode is kept current by child changes and _sync, so _layout is fresh.
    return this._layout
  }

  /** A Layout or an item array. Setting it ends implicit mode for good. */
  set layout(value) {
    // The first layout a host gives, before any edit, replaces the one the children made; that is setting up, not rearranging.
    this._quietOrder = !this._explicit && !this._edited
    this._explicit = true
    // The host's layout is the new truth; an old snapshot would undo into a stranger.
    this._history.clear()
    this._hideToast(false)
    try {
      this._apply(value)
    } finally {
      this._quietOrder = false
    }
  }

  /** Column thresholds in px of the grid's own width; defaults to { tablet: 700, desktop: 1200 }. Setting it re-measures. */
  get breakpoints() {
    return this._breakpoints || BREAKPOINTS
  }

  set breakpoints(value) {
    if (DEV && !validThresholds(value)) warnOnce('grid-breakpoints', `<ts-grid>.breakpoints needs finite numbers above 0 with tablet below desktop, e.g. { tablet: 700, desktop: 1600 }, and got ${JSON.stringify(value)}, so the defaults are used.`)
    // A copy, so mutating the host's object later can't change columns without a re-measure, and the getter says what is in effect.
    this._breakpoints = value != null && validThresholds(value) ? { ...value } : undefined
    this._measure(true)
  }

  get catalog() {
    return this._catalog
  }

  set catalog(value) {
    this._setCatalog(value || WIDGETS)
    this._apply(this._layout)
  }

  /** Overrides for the grid's own strings and for every tile inside it; null clears. */
  get messages() {
    return this._messages
  }

  set messages(value) {
    this._messages = value && typeof value === 'object' ? value : null
    this._refreshText()
    this._invalidateWidgets()
  }

  /**
   * The grid's translate function: its messages, then configure(), then EN,
   * with plural forms from its `locale` attribute. It is the one its tiles
   * share when they have no messages of their own, so assign a new object to
   * change a table.
   */
  get t() {
    const config = currentConfig()
    return translator(config.messages, this._messages, null, this.getAttribute('locale') || config.locale)
  }

  /** A widget in this grid says so, so it hears of changes even through a host component's shadow root. */
  _link(widget) {
    this._widgets.add(widget)
  }

  _unlink(widget) {
    this._widgets.delete(widget)
  }

  _invalidateWidgets() {
    // A copy: drawing again can link or unlink.
    for (const widget of [...this._widgets]) widget.invalidate()
  }

  /** The strings the grid wrote itself, written again from the current messages, and the controls built from them. */
  _refreshText() {
    // Before the first measure the controls are built by connectedCallback.
    if (this.isConnected && this._m) this._syncControls()
    else this._syncText()
    // A locale, zone or messages change rewords the next-switch line in <ts-grid-controls>.
    this._stateChanged()
  }

  /** Write the texts that sit in the static markup, and redo the ones built from messages, when the translate function changed. */
  _syncText() {
    const t = this.t
    if (t === this._tText) return
    this._tText = t
    this._toastUndo.textContent = t('grid.undo')
    this._editBtn.textContent = t('grid.editLayout')
    this._pill.setAttribute('aria-label', t('grid.editingGroup'))
    this._pill.querySelector('.done').textContent = t('grid.done')
    this._emptyPanel.querySelector('.note').textContent = t('grid.emptyBoard')
    this._hint.textContent = t('grid.instructions')
    this._stripEl.setAttribute('aria-label', t('grid.strip'))
    this._nameBoard()
    // The Add back list and each tile's chrome names were built from the old table.
    this._menuSig = ''
    for (const id of this._chromes.keys()) this._chrome(id)
  }

  /**
   * The one place the dashboard region is named: the host's aria-label, else
   * the message. It is written to the board and never to the host, so a host's
   * own label is never overwritten and a rename or a locale change just wins.
   */
  _nameBoard() {
    const name = this.getAttribute('aria-label') || this.t('grid.dashboard')
    if (this._board.getAttribute('aria-label') !== name) this._board.setAttribute('aria-label', name)
  }

  _setCatalog(catalog) {
    this._catalog = catalog
    // The host's catalog first, then the types defineWidget() recorded (which include the built-ins).
    this._resolve = specResolver(this._elementSpecs, catalog, registered)
    // For a tag's default spec: no element's own spec, or a tile that happens
    // to share the type's name would answer for it.
    this._typeSpec = specResolver(NO_SPECS, catalog, registered)
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

  /** Read-only dashboard: no long press, no edit mode, no chromes. */
  get locked() {
    return this.hasAttribute('locked')
  }

  set locked(value) {
    this.toggleAttribute('locked', !!value)
  }

  get columns() {
    return this._columns
  }

  /** A key that saves this grid's layout to localStorage per device; null, or no attribute, turns saving off. Reflects the `persist` attribute. */
  get persist() {
    return this.getAttribute('persist')
  }

  set persist(value) {
    if (value == null) this.removeAttribute('persist')
    else this.setAttribute('persist', String(value))
  }

  /** Children whose item id isn't in the active profile, which includes tiles the user removed. */
  get hiddenItems() {
    const shown = new Set(this._profileItems().map((item) => item.id))
    const seen = new Set()
    const list = []
    for (const el of this.children) {
      if (!isTile(el)) continue
      const id = el.getAttribute('item')
      if (!id || shown.has(id) || seen.has(id)) continue
      seen.add(id)
      const type = this._typeFor(el.localName).type
      list.push({ id, type, label: this._labelFor(el, this._resolve({ id, type }), id, type) })
    }
    return list
  }

  /**
   * Put the active profile back the way it was before the last edit. A host
   * can call this even while locked: the lock is for the user's hands.
   */
  undo() {
    const profile = this.profile
    const before = this._profileItems()
    const snapshot = this._history.undo(profile)
    if (!snapshot) return false
    const items = hasOwn(snapshot.profiles, profile) && Array.isArray(snapshot.profiles[profile]) ? snapshot.profiles[profile] : []
    this._cancelGesture()
    this._hideToast(false)
    // Children must follow the restored list: a tile the undo brings back is
    // no longer "removed", and one it takes away (an undone restore) is again.
    const now = new Set(items.map((item) => item.id))
    const removed = this._removedFor(profile)
    for (const item of before) if (!now.has(item.id)) removed.add(item.id)
    for (const id of now) removed.delete(id)
    const previous = this._layout
    this._layout = withProfile(this._layout, profile, items)
    // The strip is shared by every profile, so only a step that changed it (a pin, an unpin, the removal of a pinned tile)
    // puts it back; undoing a move in one profile must not undo pins made in another.
    if (this._stripSteps.has(snapshot)) {
      if (Array.isArray(snapshot.topStrip)) this._layout = setTopStrip(this._layout, snapshot.topStrip, () => false)
      else delete this._layout.topStrip
    }
    this._sync(true)
    this._emit('ts-layout-change', { layout: this._layout, items: this._profileItems(), previous, profile, reason: 'undo', id: '' })
    return true
  }

  /** Add a hidden child's item back, at the end of the profile; false when no hidden child has that id. */
  restore(id) {
    const hidden = this.hiddenItems.find((h) => h.id === id)
    if (!hidden) return false
    const el = [...this.children].find((c) => isTile(c) && c.getAttribute('item') === id)
    const spec = this._resolve({ id, type: hidden.type })
    const sizes = spec && Array.isArray(spec.sizes) && spec.sizes.length ? spec.sizes : null
    const declared = this._declared.get(el) || el.getAttribute('size')
    const size = sizes ? (sizes.includes(declared) ? declared : sizes[0]) : declared || 'S'
    // As in implicit mode, the type is implied when it is the id.
    const item = id === hidden.type ? { id, size } : { id, type: hidden.type, size }
    const profile = this.profile
    const previous = this._layout
    const list = this._profileItems()
    this._history.push(profile, previous)
    this._removedFor(profile).delete(id)
    this._layout = withProfile(this._layout, profile, addItem(list, item, this._resolve))
    this._hideToast(false)
    this._sync(true)
    const items = this._profileItems()
    const index = items.findIndex((it) => it.id === id)
    this._emit('ts-layout-change', { layout: this._layout, items, previous, profile, reason: 'add', id, index, item: items[index] })
    return true
  }

  /**
   * The types the host answers ts-add-request for: a list, '*' for every
   * catalog type, or null (the default) for none. The picker offers catalog
   * types only for these (RFC 0003 Decision 33); add() itself doesn't need it.
   */
  get addTypes() {
    return this._addTypes
  }

  set addTypes(value) {
    this._addTypes = value === '*' ? '*' : Array.isArray(value) ? Object.freeze(value.filter((type) => typeof type === 'string')) : null
  }

  /**
   * Asks the host for a new tile of `type`. Returns the id, or null when the
   * type is unknown or the host did not take the request (RFC 0003 §18.2).
   */
  add(request) {
    const type = request && request.type
    if (typeof type !== 'string' || !type) return null
    const given = typeof request.id === 'string' && request.id ? request.id : null
    // A hidden child with this id is a restore, and the grid needs nobody's answer.
    if (given && this.hiddenItems.some((h) => h.id === given)) return this.restore(given) ? given : null
    // An id already on a tile of this grid can't be given to a second one.
    if (given && [...this.children].some((el) => isTile(el) && el.getAttribute('item') === given)) return null
    // An id the host has taken and not yet answered is spoken for: a second request would fire a second event for one tile.
    if (given && this._pendingAdds.has(given)) return null
    const id = given || this._freshId(type)
    const spec = this._typeSpec({ id, type })
    if (!spec || !Array.isArray(spec.sizes) || !spec.sizes.length) return null
    const size = isSizeName(request.size) ? snapSize(request.size, spec.sizes) : spec.sizes[0]
    const event = new CustomEvent('ts-add-request', { detail: { type, id, size }, bubbles: true, composed: true, cancelable: true })
    this.dispatchEvent(event)
    if (!event.defaultPrevented) {
      if (DEV) warnOnce(`grid-add-unhandled:${type}`, `<ts-grid> asked for a '${type}' tile, and nothing called preventDefault() on ts-add-request, so none was added. Listen for ts-add-request and render a child with item="${id}".`)
      return null
    }
    clearTimeout((this._pendingAdds.get(id) || {}).timer)
    const timer = setTimeout(() => {
      this._pendingAdds.delete(id)
      if (DEV) warnOnce(`grid-add-late:${type}`, `<ts-grid> took ts-add-request for '${type}' but no child with item="${id}" appeared within ${ADD_WAIT_MS / 1000} seconds, so the request was forgotten.`)
      // A request that is taken and never answered must not look like a success.
      this._announce(this.t('grid.addFailed', { label: this._catalogLabel(spec, type) }))
      this._stateChanged()
    }, ADD_WAIT_MS)
    this._pendingAdds.set(id, { type, size, timer })
    return id
  }

  /** `type`, `type-2`, `type-3`…: the first id no item, tile or hidden child uses. */
  _freshId(type) {
    const taken = new Set([...this.children].filter(isTile).map((el) => el.getAttribute('item')))
    for (const id of this._pendingAdds.keys()) taken.add(id)
    for (const items of Object.values(this._layout.profiles)) for (const item of items) taken.add(item.id)
    let id = type
    for (let n = 2; taken.has(id); n++) id = `${type}-${n}`
    return id
  }

  /** The requests whose child has appeared. */
  _arrivedAdds() {
    if (!this._pendingAdds.size) return []
    const ids = new Set()
    for (const el of this.children) {
      if (!isTile(el)) continue
      const id = el.getAttribute('item')
      if (DEV && ids.has(id) && this._pendingAdds.has(id)) warnOnce(`grid-add-twice:${id}`, `<ts-grid> found two children with item="${id}" while waiting for the one asked for with ts-add-request. Render one child per request.`)
      ids.add(id)
    }
    return [...this._pendingAdds].filter(([id]) => ids.has(id))
  }

  /** Place each child the host rendered at the size asked for, and report it as one add. */
  _finishAdds(arrived, before) {
    for (const [id, pending] of arrived) {
      clearTimeout(pending.timer)
      this._pendingAdds.delete(id)
      const { type } = pending
      const profile = this.profile
      const spec = this._resolve({ id, type })
      const size = spec && Array.isArray(spec.sizes) && spec.sizes.length ? snapSize(pending.size, spec.sizes) : pending.size
      let items = this._profileItems()
      const at = items.findIndex((item) => item.id === id)
      if (at < 0) items = addItem(items, id === type ? { id, size } : { id, type, size }, this._resolve)
      else if (items[at].size !== size) items = resizeItem(items, id, size, this._resolve)
      this._history.push(profile, before)
      this._removedFor(profile).delete(id)
      this._hideToast(false)
      this._layout = withProfile(this._layout, profile, items)
      this._sync(true)
      const now = this._profileItems()
      const index = now.findIndex((item) => item.id === id)
      this._emit('ts-layout-change', { layout: this._layout, items: now, previous: before, profile, reason: 'add', id, index, item: now[index] })
      this._announce(this.t('grid.added', { label: this._label(id) }))
    }
  }

  /** The commit a drag makes, for an edit a host or a list makes (RFC 0003 §18.4). */
  _edit(reason, id, items, extra) {
    const profile = this.profile
    const previous = this._layout
    // Read before the edit: a removed tile has no label afterwards.
    const label = this._label(id)
    const next = withProfile(previous, profile, items)
    this._cancelGesture()
    this._record(profile, previous, next)
    this._hideToast(false)
    // Children can't bring a removed tile back; only a restore can.
    if (reason === 'remove') this._removedFor(profile).add(id)
    this._layout = next
    this._sync(true)
    this._emit('ts-layout-change', { layout: this._layout, items: this._profileItems(), previous, profile, reason, id, ...extra })
    // The words a drag or a key would have said, for a listener who can't see the board change.
    const t = this.t
    if (reason === 'move') this._announce(t('grid.moved', { label, position: this._position(id), total: this._zone(id).length }))
    else if (reason === 'resize') this._announce(t('grid.resized', { label, size: this._item(id) ? this._item(id).size : '' }))
    else if (reason === 'remove') this._announce(t('grid.removedSaid', { label }))
  }

  /** Moves the item to `toIndex` in the active profile (clamped). False for an unknown id. */
  move(id, toIndex) {
    if (DEV && !Number.isFinite(toIndex)) warnOnce('grid-move-index', `<ts-grid>.move(id, toIndex) needs a number for toIndex, and got ${String(toIndex)}, so the item goes to the start.`)
    const items = this._profileItems()
    if (!items.some((item) => item.id === id)) return false
    const next = moveItem(items, id, toIndex)
    if (!sameOrder(items, next)) this._edit('move', id, next)
    return true
  }

  /** Snaps to the item's spec. False for an unknown id. */
  resize(id, size) {
    if (DEV && !isSizeName(size)) warnOnce('grid-resize-size', `<ts-grid>.resize(id, size) needs a size name such as 'M' or 'Wide', and got ${String(size)}, so the size is left as it is.`)
    const items = this._profileItems()
    if (!items.some((item) => item.id === id)) return false
    const next = resizeItem(items, id, size, this._resolve)
    if (next.some((item, i) => item !== items[i] && item.size !== items[i].size)) this._edit('resize', id, next)
    return true
  }

  /** Removes the item; it becomes a hidden child. False for an unknown id. With no id it is the DOM's own remove(), which takes the grid off the page. */
  remove(id) {
    if (id === undefined) return super.remove()
    const items = this._profileItems()
    const index = items.findIndex((item) => item.id === id)
    if (index < 0) return false
    this._edit('remove', id, removeItem(items, id), { index, item: items[index] })
    return true
  }

  /**
   * Pins `ids` (at most 3 the grid shows, in order) to the phone top strip, or unpins by leaving them out. False
   * when nothing changed. Ids this grid doesn't show (another profile's) are kept and take no slot, and a widget
   * with no S size is ignored. The strip is drawn at 2 columns only; the saved list is kept at any width (RFC 0003 §19).
   */
  setTopStrip(ids) {
    const saved = this._layout.topStrip || []
    const want = (Array.isArray(ids) ? ids : []).filter((id) => {
      const item = this._tiles.has(id) && this._profileItems().find((it) => it.id === id)
      const refused = item && !this._canPin(item)
      if (DEV && refused) warnOnce(`grid-strip-small:${id}`, `<ts-grid>.setTopStrip() ignored '${id}': its widget has no small (S) size, and the strip draws tiles at S.`)
      return !refused
    })
    const next = setTopStrip(this._layout, want.concat(saved.filter((id) => !this._pinSlot(id) && !want.includes(id))), this._pinSlot)
    if (sameIds(saved, next.topStrip)) return false
    this._commitStrip(next, '')
    return true
  }

  _canPin(item) {
    const spec = this._resolve(item)
    return hasSmall(spec && spec.sizes)
  }

  /** The history step for a change from `previous` to `next`, marked when it changed the strip. */
  _record(profile, previous, next) {
    this._history.push(profile, previous)
    if (!sameIds(previous.topStrip || [], next.topStrip || [])) this._stripSteps.add(previous)
  }

  /** The commit of a strip change: record the step, redraw (unless a drop already has) and report it with reason 'strip'. */
  _commitStrip(next, id, dropped) {
    const previous = this._layout
    const profile = this.profile
    if (!dropped) {
      this._cancelGesture()
      this._hideToast(false)
    }
    this._record(profile, previous, next)
    this._layout = next
    if (!dropped) this._sync(true)
    this._emit('ts-layout-change', { layout: next, items: this._profileItems(), previous, profile, reason: 'strip', id })
  }

  /** The pin button or the P key: pin the tile to the end of the strip, or unpin it. A fourth pin is refused out loud. */
  _togglePin(id) {
    if (!this._editing || (this._gesture && this._heldId() !== id) || !this._placements.has(id) || this._columns !== 2 || !this._manual) return
    const chrome = this._chromes.get(id)
    const active = this.shadowRoot.activeElement
    const had = active && chrome && chrome.contains(active) ? active : null
    const saved = this._layout.topStrip || []
    const shown = this._strip.map((item) => item.id)
    const t = this.t
    const label = this._label(id)
    if (this._inStrip(id)) {
      this._commitStrip(setTopStrip(this._layout, saved.filter((x) => x !== id), this._pinSlot), id)
      this._announce(t('grid.unpinned', { label }))
    } else if (!this._canPin(this._item(id))) {
      this._announce(t('grid.pinUnsupported'))
      return
    } else if (shown.length >= TOP_STRIP_MAX) {
      this._announce(t('grid.stripFull'))
      return
    } else {
      this._commitStrip(setTopStrip(this._layout, [...shown, id, ...saved.filter((x) => x !== id && !shown.includes(x))], this._pinSlot), id)
      this._announce(t('grid.pinned', { label }))
    }
    // The chrome moved between containers, which drops focus where moveBefore is missing.
    if (had && had.isConnected && this.shadowRoot.activeElement !== had) had.focus({ preventScroll: true })
  }

  _inStrip(id) {
    return this._strip.some((item) => item.id === id)
  }

  /** The tiles `id` is ordered among: the strip's, or the board's. */
  _zone(id) {
    return this._inStrip(id) ? this._strip : this._order
  }

  _setZone(id, items) {
    if (this._inStrip(id)) this._strip = items
    else this._order = items
  }

  /** The profile an override shows, or null when the schedule (or the `profile` attribute) decides. */
  get profileOverride() {
    return this._override ? this._override.profile : null
  }

  /**
   * Set by <ts-grid-controls> while a picker is linked. The edit pill then
   * shows Add, which calls it with the button, so the picker can return focus there.
   */
  get openPicker() {
    return this._openPicker
  }

  set openPicker(fn) {
    this._openPicker = typeof fn === 'function' ? fn : null
    if (this.isConnected && this._m) this._syncControls()
  }

  /** For <ts-grid-controls>: `fn()` runs when the schedule, the clock or an override changes. Returns the function that stops it. */
  _onState(fn) {
    this._stateListeners.add(fn)
    return () => this._stateListeners.delete(fn)
  }

  _stateChanged() {
    for (const fn of [...this._stateListeners]) fn()
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
    this._profileChanged(before, 'schedule', true)
    this._stateChanged()
  }

  /** What the grid takes the time to be. Tests and demos can replace it. */
  get clock() {
    return this._clock
  }

  set clock(fn) {
    this._clock = typeof fn === 'function' ? fn : () => Date.now()
    this._reschedule(true, 'schedule', true)
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
      this._stateChanged()
      return
    }
    const now = this._clock()
    const until = this._schedule ? nextProfileChange(this._schedule.calendar, this._schedule, now) : null
    const before = this.profile
    this._override = { profile, until: until === null ? Infinity : until }
    this._reschedule(false)
    this._profileChanged(before, 'override')
    this._stateChanged()
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  connectedCallback() {
    // Each time it connects, the first order it settles on is its first.
    this._orderKnown = false
    // The chrome reads --ts-* tokens with no fallbacks, like the widgets, so a grid of custom tiles still finds them.
    ensureTokens()
    // A messages property set before the element was defined would shadow the accessor.
    if (Object.prototype.hasOwnProperty.call(this, 'messages')) {
      const value = this.messages
      delete this.messages
      this.messages = value
    }
    // Likewise a persist property set before upgrade: it becomes the attribute.
    if (Object.prototype.hasOwnProperty.call(this, 'persist')) {
      const value = this.persist
      delete this.persist
      this.persist = value
    }
    // configure() may change the messages or the locale while the grid is on the page; the widgets hear of it themselves.
    this._offConfigure = onConfigure(() => this._refreshText())
    // A widget registered after the grid rendered may be the type of a tile it could not draw.
    this._offCatalog = onCatalogChange(() => {
      this._setCatalog(this._catalog)
      this._apply(this._layout)
    })
    if (Object.prototype.hasOwnProperty.call(this, 'addTypes')) {
      const value = this.addTypes
      delete this.addTypes
      this.addTypes = value
    }
    // Measuring renders, and rendering changes the grid's own height, which the
    // observer reports again within the same frame. WebKit raises that as an
    // uncaught "ResizeObserver loop" error, so the work waits for the next frame.
    // Each observer is optional (RFC 0003 §23): jsdom and happy-dom have none. A grid that cannot watch its own width
    // still measures again on a window resize, and one that cannot watch its children takes them when the host sets
    // layout. A guard, not a polyfill.
    const onResize = () => {
      cancelAnimationFrame(this._measureFrame)
      this._measureFrame = requestAnimationFrame(() => this._measure(false))
    }
    if (typeof ResizeObserver === 'function') {
      this._resizeObserver = new ResizeObserver(onResize)
      this._resizeObserver.observe(this)
    } else if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this._onWindowResize = onResize
      window.addEventListener('resize', onResize)
    }
    if (typeof MutationObserver === 'function') {
      // A dir attribute flipped on the grid or an ancestor changes no size, so the observer above never hears of it.
      this._dirObserver = new MutationObserver(() => this._measure(false))
      // Through a slot to the shadow tree the grid is slotted into: that wrapper's dir is what the grid inherits.
      for (let node = this; node; node = node.assignedSlot || node.parentNode || node.host) this._dirObserver.observe(node, { attributes: true, attributeFilter: ['dir'] })
      this._mutationObserver = new MutationObserver((records) => {
        if (!records.some((r) => this._concerns(r))) return
        this._cancelGesture()
        // A host answering ts-add-request renders its child here; the layout before it came is what Undo goes back to.
        const arrived = this._arrivedAdds()
        const before = this._layout
        this._sync(true)
        if (arrived.length) this._finishAdds(arrived, before)
      })
      this._mutationObserver.observe(this, { childList: true, subtree: true, attributeFilter: ['item', 'size'] })
    }
    if (!this._explicit) this._reconcile()
    this._measure(true)
    // After the first measure, so the device is known and the layout on show is the defaults.
    this._persistOn = true
    this._syncPersist()
    this._syncControls()
    if (this._editing) this._startEditing()
    document.addEventListener('visibilitychange', this._onVisibility)
    this._reschedule(true, 'schedule', true)
  }

  disconnectedCallback() {
    this._persistOn = false
    this._syncPersist()
    if (this._offConfigure) this._offConfigure()
    this._offConfigure = null
    if (this._offCatalog) this._offCatalog()
    this._offCatalog = null
    for (const pending of this._pendingAdds.values()) clearTimeout(pending.timer)
    this._pendingAdds.clear()
    if (this._resizeObserver) this._resizeObserver.disconnect()
    this._resizeObserver = null
    if (this._onWindowResize) window.removeEventListener('resize', this._onWindowResize)
    this._onWindowResize = null
    if (this._dirObserver) this._dirObserver.disconnect()
    this._dirObserver = null
    cancelAnimationFrame(this._measureFrame)
    if (this._mutationObserver) this._mutationObserver.disconnect()
    this._mutationObserver = null
    this._cancelGesture()
    this._stopEditing()
    this._hideToast(false)
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

  attributeChangedCallback(name, old, value) {
    if (name === 'aria-label') {
      this._nameBoard()
    } else if (name === 'locked') {
      if (this.locked) {
        this.editing = false
        this._cancelGesture()
        this._hideToast(false)
      }
      this._syncControls()
    } else if (name === 'edit-controls') {
      this._syncControls()
    } else if (name === 'editing') {
      const on = this.hasAttribute('editing')
      if (on === this._editing) return
      if (on && this.locked) {
        // Revert rather than ignore, so the attribute never lies about the state.
        if (DEV) warnOnce('grid-locked-editing', LOCKED_WARNING)
        this.removeAttribute('editing')
        return
      }
      this._editing = on
      if (on) this._startEditing()
      else this._stopEditing()
      this._emit('ts-edit-change', { editing: on })
    } else if (name === 'profile') {
      this._cancelGesture()
      this._sync(false)
      if (this._rendered && old !== value) this._announce(this.t('grid.profile', { profile: this.profile }))
    } else if (['locale', 'currency', 'time-zone', 'hour-cycle'].includes(name)) {
      this._refreshText()
      this._invalidateWidgets()
    } else if (name === 'persist') {
      // Upgrade reports the attribute before connectedCallback has measured; it attaches then.
      if (this._persistOn) this._syncPersist()
    }
  }

  /** Make persistLayout match the `persist` attribute: attach, re-key or dispose (RFC 0003 §4.1). */
  _syncPersist() {
    const attr = this._persistOn ? this.getAttribute('persist') : null
    if (DEV && attr === '') warnOnce('grid-persist-empty', EMPTY_PERSIST_WARNING)
    const key = attr || null
    if (key === this._persistKey) return
    if (this._persistHandle) this._persistHandle.dispose()
    this._persistHandle = null
    this._persistKey = key
    if (!key) return
    // The first defaults are kept across reconnects and re-keys: by then the layout on show may be a saved or edited one.
    if (!this._persistBase) this._persistBase = this._layout
    this._persistHandle = persistLayout(this, { key, defaults: () => this._defaultsToPersist() })
  }

  /**
   * What a device with nothing saved shows. While the grid is implicit that is
   * its layout as it stands, so children that arrive late are part of it and
   * nothing is assigned (which would end implicit mode and hide them). Once a
   * layout has been set, the last implicit one, or the host's, is kept.
   */
  _defaultsToPersist() {
    if (!this._explicit) this._persistBase = this._layout
    return this._persistBase
  }

  // ── Profiles on a schedule ─────────────────────────────────────────────

  /** Work out the scheduled profile now and arm a timer for the next change. */
  _reschedule(emit, reason = 'schedule', quiet = false) {
    clearTimeout(this._profileTimer)
    const before = this.profile
    const s = this._schedule
    if (!s || !this.isConnected) {
      this._scheduled = null
      this._deferred = false
    } else if ((this._editing || this._gesture) && this._scheduled !== null) {
      // Tiles must not reshuffle under a hand that is rearranging them. Done
      // (or the gesture ending) applies the change that fell due, and re-arms the timer.
      this._deferred = true
      return
    } else {
      this._deferred = false
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
    if (emit) this._profileChanged(before, reason, quiet)
    this._stateChanged()
  }

  _profileChanged(before, reason, quiet = false) {
    const profile = this.profile
    if (profile === before) return
    this._cancelGesture()
    this._sync(false)
    // Not on load, when nothing has changed from the user's point of view.
    if (!quiet) this._announce(this.t('grid.profile', { profile }))
    this._emit('ts-profile-change', { profile, reason })
  }

  /** Apply a scheduled change that fell due while the user was editing or dragging. */
  _applyDeferred() {
    if (this._deferred && !this._editing && !this._gesture && this.isConnected) this._reschedule(true)
  }

  // ── Measuring and rendering ────────────────────────────────────────────

  _measure(force) {
    if (!this.isConnected) return
    const width = this.clientWidth
    // The board's own height changes fire the observer too; only width matters.
    const rtl = getComputedStyle(this).direction === 'rtl'
    // A change of direction re-measures even at the same width, because every box mirrors.
    if (!force && width === this._width && rtl === this._rtl) return
    this._width = width
    const flipped = rtl !== this._rtl
    this._rtl = rtl
    this._board.classList.toggle('rtl', rtl)
    const columns = columnsFor(width, this._breakpoints)
    const changed = columns !== this._columns
    if ((changed || flipped) && this._gesture) this._cancelGesture()
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
    const type = typeForTag(this._catalog, tag) ?? typeForTag(widgetCatalog(), tag) ?? tag
    return { type, spec: this._typeSpec({ id: type }) }
  }

  /** Match children to layout items, hide the rest, and lay out. */
  _sync(animate, keepTiles) {
    if (!this.isConnected) return
    if (!keepTiles && !this._explicit) this._reconcile()
    if (!this._m) return
    const before = new Set(this._tiles.keys())
    if (!keepTiles) this._matchChildren(true)
    const visible = this._profileItems().filter((item) => this._tiles.has(item.id))
    // The strip needs manual slot assignment, which keeps each pinned tile's slot inside the sticky container.
    const { strip, board } = this._manual ? splitStrip(visible, this._layout.topStrip, this._columns, (item) => this._canPin(item)) : { strip: [], board: visible }
    this._order = board
    this._strip = strip
    const shown = new Set(visible.map((item) => item.id))
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
    this._syncControls()
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
    const { placements: boardPlaced, rows } = place(this._order, this._columns, this._resolve)
    // Strip tiles sit above row 0, in strip order, each at its S variant.
    const stripPlaced = this._strip.map((item, i) => {
      const spec = this._resolve(item)
      return { id: item.id, col: i, row: -1, cols: 1, rows: 1, variant: footprint('S', 2, spec ? spec.sizes : null, spec ? spec.phoneRows : null).variant }
    })
    const stripAt = stripPlaced.length ? stripBoxes(stripPlaced.length, m, { rtl: this._rtl }) : []
    const placements = stripPlaced.concat(boardPlaced)
    this._placements = new Map(placements.map((p) => [p.id, p]))
    // Slots move before the boxes are written, with a style flush between. WebKit drops a tile's slide when its slot
    // moves, but only if the move comes after the new box: moved first, the tile has a computed "before" style again
    // by the time its box changes, so it slides there like the rest.
    if (animate && this._manual && this._slotTiles(visualOrder(placements), this._editing && this._orderKnown)) void this._board.offsetWidth
    for (const p of placements) {
      const inStrip = p.row < 0
      const box = inStrip ? stripAt[p.col] : boxOf(p, m, { rtl: this._rtl })
      const el = this._tiles.get(p.id)
      // A tile that wasn't on screen appears in place rather than sliding in
      // from wherever it last was, and one changing between strip and board has no common frame to slide in.
      const slide = animate && this._boxes.has(p.id) && el.style.display !== 'none' && this._wasStrip.has(p.id) === inStrip
      this._boxes.set(p.id, box)
      if (el.getAttribute('size') !== p.variant) el.setAttribute('size', p.variant)
      this._written.set(el, p.variant)
      const chrome = this._chrome(p.id)
      if (p.id === skipId) continue
      setBox(el, box, slide)
      setBox(chrome, box, slide)
      const held = this._gesture && this._gesture.id === p.id
      if (this._editing && !held && !this._wiggles.has(p.id)) this._wiggle(p.id)
      if (this._editing) this._makeInert(el)
    }
    if (stripPlaced.length || this._wasStrip.size) this._wasStrip = new Set(stripPlaced.map((p) => p.id))
    this._orderChromes(placements)
    this._assignSlots(placements)
    this._board.style.transition = animate ? '' : 'none'
    // An empty board keeps one row, so its message and Add back have somewhere to sit.
    this._board.style.height = `${boardHeight(rows || 1, m)}px`
    // One compact row and a gap, which is also the room between the strip and the board.
    // Nothing to write while there is no strip and there was none, which is every render at 3 or 4 columns.
    if (stripPlaced.length || !this._stripEl.hidden) {
      const stripHeight = stripPlaced.length ? m.rowHeight + m.gap : 0
      this._stripEl.hidden = !stripPlaced.length
      this._stripEl.style.transition = animate ? '' : 'none'
      this._stripEl.style.height = `${stripHeight}px`
      this._board.style.setProperty('--_strip-clear', stripHeight ? `calc(var(--ts-strip-top, 0px) + ${stripHeight}px)` : '0px')
    }
  }

  /**
   * Reading and Tab order follow the layout without a host node ever moving
   * (RFC 0003 §11): one slot per visible tile, in visual order, each assigned
   * its tile. Hidden tiles are assigned to none, and what isn't a tile
   * (text, scripts, `slot="empty"` content) goes to the slots that showed it
   * before, since named slotting doesn't apply in manual mode.
   *
   * While editing, tiles are inert and the chromes carry Tab, so the slots
   * keep their order and the new one is taken when editing ends. That also
   * leaves a lifted tile alone while it is dragged.
   */
  _assignSlots(placements) {
    const order = visualOrder(placements)
    const frozen = this._editing && this._orderKnown
    if (this._manual) this._slotTiles(order, frozen)
    if (!frozen) {
      this._setReadingOrder(order, this._quietOrder)
      return
    }
    // A tile that went is dropped from the list at once, and one that came follows the others, as its slot does.
    const here = new Set(order)
    const held = this._readingOrder.filter((id) => here.has(id))
    const kept = new Set(held)
    const next = held.concat(order.filter((id) => !kept.has(id)))
    if (!sameIds(next, this._readingOrder)) this._readingOrder = Object.freeze(next)
  }

  _slotTiles(order, frozen) {
    const board = this._board
    const visible = new Set(order)
    for (const [id, slot] of this._tileSlots) {
      if (visible.has(id)) continue
      // Removing a slot alone can leave its tile claimed by it, so the tile is let go first.
      slot.assign()
      slot.remove()
      this._slotted.delete(slot)
      this._tileSlots.delete(id)
    }
    const slots = order.map((id) => {
      let slot = this._tileSlots.get(id)
      if (!slot) {
        slot = document.createElement('slot')
        this._tileSlots.set(id, slot)
      }
      // A pinned tile's slot lives in the sticky strip, which comes before the board in the flat tree: first in Tab and reading order.
      const home = this._inStrip(id) ? this._stripEl : board
      if (slot.parentNode !== home) home.insertBefore(slot, home === board ? this._chromeLayer : this._stripLayer)
      const el = this._tiles.get(id)
      if (this._slotted.get(slot) !== el) {
        slot.assign(el)
        this._slotted.set(slot, el)
      }
      return slot
    })
    let moved = false
    if (!frozen) {
      const active = this._deepActive()
      for (const [home, end] of [[this._stripEl, this._stripLayer], [board, this._chromeLayer]]) {
        const mine = slots.filter((slot) => slot.parentNode === home)
        // Moving a slot reattaches its tile, and some engines (WebKit, Firefox) drop that tile's slide when it is
        // reattached, so only the slots outside the longest run already in order move: one for "last goes first".
        const current = [...home.children].filter((child) => this._slotted.has(child))
        const keep = keepInPlace(current, mine)
        let next = end
        for (let i = mine.length - 1; i >= 0; i--) {
          if (!keep.has(mine[i])) {
            if (typeof home.moveBefore === 'function') home.moveBefore(mine[i], next)
            else home.insertBefore(mine[i], next)
            moved = true
          }
          next = mine[i]
        }
      }
      // Without moveBefore, a tile whose slot moved may lose focus.
      if (moved && active && active.isConnected && this._deepActive() !== active) active.focus({ preventScroll: true })
    }
    const rest = []
    const empty = []
    for (const node of this.childNodes) {
      if (node.nodeType === 3) rest.push(node)
      else if (node.nodeType !== 1 || isTile(node)) continue
      else (node.getAttribute('slot') === 'empty' ? empty : rest).push(node)
    }
    if (!sameNodes(rest, this._restNodes)) this._restSlot.assign(...rest)
    if (!sameNodes(empty, this._emptyNodes)) this._emptySlot.assign(...empty)
    this._restNodes = rest
    this._emptyNodes = empty
    return moved
  }

  /** The element that really has focus, followed through shadow roots, when it is inside this grid. */
  _deepActive() {
    let active = document.activeElement
    if (!active || active === this || !this.contains(active)) return null
    while (active.shadowRoot && active.shadowRoot.activeElement) active = active.shadowRoot.activeElement
    return active
  }

  /**
   * `quiet` takes the order without telling anyone, for the host's first layout. The first order is the first that
   * has a tile in it: a grid that connects empty and is then given children, or a layout, has not been rearranged.
   */
  _setReadingOrder(order, quiet) {
    // Against the last order that was reported, not the list, which drops a tile removed in edit mode at once and says nothing until Done.
    const changed = !sameIds(order, this._reportedOrder)
    const first = !this._orderKnown
    if (!sameIds(order, this._readingOrder)) this._readingOrder = Object.freeze(order)
    this._reportedOrder = this._readingOrder
    if (order.length) this._orderKnown = true
    if (changed && !first && !quiet) this._emit('ts-reading-order-change', { order: [...order] })
  }

  /** The visible tiles' ids in visual order, row by row, in the page's inline direction (so right to left under dir=rtl), by each tile's top-left cell. It holds still while editing, and takes the new order at Done. */
  get readingOrder() {
    return this._readingOrder
  }

  _chrome(id) {
    let chrome = this._chromes.get(id)
    if (!chrome) {
      chrome = document.createElement('div')
      chrome.className = 'chrome'
      chrome.dataset.id = id
      // Three siblings, never a button inside a button: the handle takes focus and
      // keys, remove and resize are named for assistive technology but not Tab stops.
      chrome.innerHTML = '<button class="handle" type="button" aria-describedby="hint" aria-pressed="false"></button>' +
        '<button class="remove" type="button" tabindex="-1"><span aria-hidden="true">−</span></button>' +
        '<button class="resize" type="button" tabindex="-1"></button>' +
        '<button class="pin" type="button" tabindex="-1"><span aria-hidden="true"></span></button>'
      this._chromes.set(id, chrome)
    }
    const stripped = this._inStrip(id)
    const layer = stripped ? this._stripLayer : this._chromeLayer
    if (chrome.parentNode !== layer) layer.appendChild(chrome)
    const label = this._label(id)
    const item = this._item(id)
    // The size is read as its token ("M") for now, which keeps what a screen reader says the same as before messages; size.name gives a full name when the picker needs one.
    const size = item ? item.size : ''
    const t = this.t
    const handle = chrome.querySelector('.handle')
    setAttr(handle, 'aria-label', t('grid.handle', { label, size, position: this._position(id), total: this._zone(id).length }))
    setAttr(chrome.querySelector('.remove'), 'aria-label', t('grid.remove', { label }))
    setAttr(chrome.querySelector('.resize'), 'aria-label', t('grid.resize', { label, size }))
    // Pin to top / Unpin exists at 2 columns only; elsewhere it is display:none, so it is not in the accessibility tree either.
    const pin = chrome.querySelector('.pin')
    setAttr(pin, 'aria-label', t(stripped ? 'grid.unpin' : 'grid.pin', { label }))
    chrome.classList.toggle('pinnable', this._columns === 2 && this._manual && !!item && this._canPin(item))
    chrome.classList.toggle('in-strip', stripped)
    handle.tabIndex = this._editing ? 0 : -1
    if (this._editing) chrome.removeAttribute('aria-hidden')
    else chrome.setAttribute('aria-hidden', 'true')
    const spec = this._spec(id)
    // A strip tile is always its S variant, so there is nothing to resize.
    chrome.classList.toggle('fixed', stripped || !spec || spec.sizes.length < 2)
    return chrome
  }

  /**
   * Keep the chromes in the DOM in placement order, so Tab follows what the
   * eye sees. moveBefore keeps focus and running animations; without it a
   * moved node loses both, so the focused handle is refocused and the wiggle restarted.
   */
  _orderChromes(placements) {
    const ids = visualOrder(placements)
    const active = this.shadowRoot.activeElement
    const moved = []
    // The strip's chromes come first, as its tiles do.
    for (const [layer, mine] of [[this._stripLayer, ids.filter((id) => this._inStrip(id))], [this._chromeLayer, ids.filter((id) => !this._inStrip(id))]]) {
      const want = mine.map((id) => this._chromes.get(id))
      for (let i = 0; i < want.length; i++) {
        const at = layer.children[i]
        if (at === want[i]) continue
        if (typeof layer.moveBefore === 'function') layer.moveBefore(want[i], at || null)
        else layer.insertBefore(want[i], at || null)
        moved.push(want[i])
      }
    }
    if (!moved.length || typeof this._chromeLayer.moveBefore === 'function') return
    if (active && active.isConnected && this.shadowRoot.activeElement !== active) active.focus({ preventScroll: true })
    if (this._editing) for (const chrome of moved) if (!(this._gesture && this._gesture.id === chrome.dataset.id)) this._wiggle(chrome.dataset.id)
  }

  /** Tiles are inert while editing, so a widget's own buttons and links can't be reached; the host's own value comes back after. */
  _makeInert(el) {
    if (this._inertWas.has(el)) return
    this._inertWas.set(el, el.hasAttribute('inert'))
    el.setAttribute('inert', '')
  }

  _restoreInert() {
    for (const [el, was] of this._inertWas) if (!was) el.removeAttribute('inert')
    this._inertWas.clear()
  }

  _dropChrome(id) {
    this._unwiggle(id)
    const chrome = this._chromes.get(id)
    if (chrome) chrome.remove()
    this._chromes.delete(id)
  }

  _item(id) {
    return this._order.find((item) => item.id === id) || this._strip.find((item) => item.id === id)
  }

  _spec(id) {
    const item = this._item(id)
    return item ? this._resolve(item) : null
  }

  _label(id) {
    const item = this._item(id)
    return this._labelFor(this._tiles.get(id), this._spec(id), id, item ? typeOf(item) : id)
  }

  _labelFor(el, spec, id = el && el.getAttribute('item'), type = id) {
    return (el && (el.getAttribute('label') || el.getAttribute('aria-label'))) || this._catalogLabel(spec, type) || id
  }

  /**
   * The catalog's label for a type: the host's own spec label as given, else
   * t('widget.<type>.label'). A spec that carries only the English default
   * (the built-in catalog does) gives way to the message, so a translation is seen.
   */
  _catalogLabel(spec, type) {
    const given = spec && spec.label
    const key = `widget.${type}.label`
    if (given && given !== EN[key]) return given
    const text = this.t(key)
    return text !== key ? text : given || ''
  }

  _motion() {
    return !(this._motionQuery && this._motionQuery.matches)
  }

  // ── Edit mode ──────────────────────────────────────────────────────────

  _startEditing() {
    if (!this.isConnected) return
    // Focus inside a tile would be dropped by inert; its handle is the same place in edit mode.
    const inside = document.activeElement && document.activeElement !== this && this.contains(document.activeElement) ? document.activeElement : null
    const focusId = inside && [...this._tiles].find(([, el]) => el.contains(inside))
    for (const el of this._tiles.values()) this._makeInert(el)
    for (const [id, chrome] of this._chromes) {
      chrome.querySelector('.handle').tabIndex = 0
      chrome.removeAttribute('aria-hidden')
      this._wiggle(id)
    }
    if (focusId && this._chromes.has(focusId[0])) this._chromes.get(focusId[0]).querySelector('.handle').focus({ preventScroll: true })
    document.addEventListener('keydown', this._onDocKeyDown)
    document.addEventListener('pointerdown', this._onDocPointerDown, true)
    this._syncControls()
    this._announce(this.t('grid.editStart', {}, this._order.length + this._strip.length))
  }

  _stopEditing() {
    if (this._gesture) this._cancelGesture()
    // Tiles can take focus again before it is returned, or the origin tile would refuse it.
    this._restoreInert()
    // The order the user made is the one read from here on.
    if (this.isConnected && this._m) this._assignSlots([...this._placements.values()])
    // Before any chrome turns aria-hidden or the pill goes, or focus would be lost with them.
    this._returnFocus()
    this._closeMenu(false)
    for (const [id, chrome] of this._chromes) {
      chrome.querySelector('.handle').tabIndex = -1
      chrome.setAttribute('aria-hidden', 'true')
      this._unwiggle(id)
    }
    document.removeEventListener('keydown', this._onDocKeyDown)
    document.removeEventListener('pointerdown', this._onDocPointerDown, true)
    clearTimeout(this._outsideTimer)
    this._editOrigin = null
    this._syncControls()
    if (this.isConnected) this._announce(this.t('grid.editDone'))
    this._applyDeferred()
  }

  /** A press outside the grid ends editing; one in the pill or its list is inside, because the path names the grid. */
  _onDocPointerDown(e) {
    const path = e.composedPath()
    if (!this._editing || !isOutside(path, this)) return
    // The path may only look outside because it stops at a closed shadow
    // root's host. The document hears the press before the grid does, so the
    // grid is asked once the press has finished travelling.
    clearTimeout(this._outsideTimer)
    this._outsideTimer = setTimeout(() => {
      if (this._editing && isOutside(path, this, [], this._pressesIn.has(e))) this.editing = false
    }, 0)
  }

  /** Put focus back where editing began, but only if it is inside the grid and about to be lost. */
  _returnFocus() {
    if (!this.isConnected) return
    const active = this.shadowRoot.activeElement || (document.activeElement !== this && this.contains(document.activeElement) ? document.activeElement : null)
    if (!active) return
    const origin = this._editOrigin
    let candidate = null
    if (origin) {
      const button = origin === this._editBtn
      if (button) origin.tabIndex = 0
      candidate = {
        target: origin,
        connected: origin.isConnected,
        // The button is hidden by the opt-out or the lock; a tile is only focusable if it has a tab index.
        hidden: button ? !this._controlsOn() : origin.hidden || origin.tabIndex < 0 || origin.style.display === 'none',
        disabled: !!origin.disabled,
      }
    }
    this._focus(pickFocusTarget([candidate]) || this)
  }

  /** The grid is the last resort, and focus goes to its board: the named region, so a screen reader says where focus landed. */
  _focus(target) {
    if (target === this) {
      if (!this._board.hasAttribute('tabindex')) this._board.setAttribute('tabindex', '-1')
      this._board.focus()
      return
    }
    target.focus()
  }

  _controlsOn() {
    return !this.locked && this.getAttribute('edit-controls') !== 'off'
  }

  // ── Edit controls: the Edit layout button, the pill, Add back, the empty board ──

  _syncControls() {
    this._syncText()
    const t = this.t
    const on = this._controlsOn()
    const editing = this._editing
    const pillOn = on && editing
    // While editing it stays out of the Tab order but can still take focus back.
    this._editBtn.hidden = !on
    this._editBtn.tabIndex = editing ? -1 : 0
    this._pill.hidden = !pillOn
    this._dock.classList.toggle('has-pill', pillOn)
    const empty = this._rendered && !!this._m && this._order.length + this._strip.length === 0
    this._emptyPanel.hidden = !empty
    const hidden = this.hiddenItems
    // With a picker linked, Add opens it (and it lists the hidden children first), so the Add back list isn't needed.
    const linked = !!this._openPicker
    for (const [owner, show] of [['pill', pillOn && (linked || hidden.length > 0)], ['empty', empty && on && (linked || hidden.length > 0)]]) {
      const c = this._addBack[owner]
      c.add.hidden = !show
      if (show) {
        c.add.querySelector('.t').textContent = linked ? t('grid.add') : t('grid.addBack', { count: hidden.length })
        if (linked) {
          c.add.setAttribute('aria-haspopup', 'dialog')
          c.add.removeAttribute('aria-expanded')
        } else {
          c.add.removeAttribute('aria-haspopup')
          c.add.setAttribute('aria-expanded', this._menuOwner === owner ? 'true' : 'false')
        }
      }
      if ((!show || linked) && this._menuOwner === owner) this._closeMenu(false)
    }
    // Rebuilt only when the list changed, so an open list isn't torn down under the pointer.
    const sig = hidden.map((h) => `${h.id}\n${h.label}`).join('\n\n')
    if (sig !== this._menuSig) {
      this._menuSig = sig
      for (const { menu } of Object.values(this._addBack)) {
        menu.textContent = ''
        const heading = document.createElement('span')
        heading.className = 'menu-h'
        heading.textContent = t('grid.hiddenHeading')
        menu.appendChild(heading)
        for (const h of hidden) {
          const item = document.createElement('button')
          item.type = 'button'
          item.className = 'mi'
          item.dataset.id = h.id
          item.setAttribute('aria-label', t('grid.addBackItem', { label: h.label }))
          const name = document.createElement('span')
          name.textContent = h.label
          const plus = document.createElement('span')
          plus.className = 'plus'
          plus.setAttribute('aria-hidden', 'true')
          plus.textContent = '+'
          item.append(name, plus)
          menu.appendChild(item)
        }
      }
    }
  }

  /** Open the linked picker, which returns focus to `opener` when it closes. */
  _showPicker(opener) {
    try {
      this._openPicker(opener)
    } catch (err) {
      console.error('tickslate: the linked picker threw when opened.', err)
    }
  }

  _toggleMenu(owner) {
    if (this._menuOwner === owner) return this._closeMenu(true)
    this._closeMenu(false)
    const c = this._addBack[owner]
    c.menu.hidden = false
    c.add.setAttribute('aria-expanded', 'true')
    this._menuOwner = owner
    document.addEventListener('pointerdown', this._onMenuPointerDown, true)
    const first = c.menu.querySelector('.mi')
    if (first) first.focus()
  }

  /** `refocus` hands focus back to the Add back button, for Escape and a second press on it. */
  _closeMenu(refocus) {
    const owner = this._menuOwner
    if (!owner) return
    const c = this._addBack[owner]
    this._menuOwner = null
    clearTimeout(this._menuOutsideTimer)
    document.removeEventListener('pointerdown', this._onMenuPointerDown, true)
    c.menu.hidden = true
    c.add.setAttribute('aria-expanded', 'false')
    if (refocus && !c.add.hidden) c.add.focus()
  }

  _onMenuPointerDown(e) {
    const owner = this._menuOwner
    const wrap = owner && this._addBack[owner].wrap
    const path = e.composedPath()
    if (!owner || !isOutside(path, wrap)) return
    // Deferred for the same reason as the edit-mode exit: a press on the list
    // in a closed shadow root must not close it before the item's click.
    clearTimeout(this._menuOutsideTimer)
    this._menuOutsideTimer = setTimeout(() => {
      if (this._menuOwner === owner && isOutside(path, wrap, [], this._pressesInMenu.has(e))) this._closeMenu(false)
    }, 0)
  }

  _restoreFromMenu(id) {
    const hidden = this.hiddenItems.find((h) => h.id === id)
    this._closeMenu(false)
    if (!hidden || !this.restore(id)) return
    this._announce(this.t('grid.addedBack', { label: hidden.label }))
    const el = this._tiles.get(id)
    const chrome = this._chromes.get(id)
    // Edit mode: the tile's handle. Otherwise its tile if it can take focus, else the grid.
    this._focus(pickFocusTarget([
      chrome && { target: chrome.querySelector('.handle'), connected: chrome.isConnected, hidden: !this._editing },
      el && { target: el, connected: el.isConnected, hidden: el.tabIndex < 0 || el.style.display === 'none' },
    ]) || this)
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
        if (node.classList.contains('pin')) return { kind: 'pin', id: node.parentElement.dataset.id }
        if (node.classList.contains('handle')) return { kind: 'chrome', id: node.parentElement.dataset.id }
        // The empty panel sits inside the board, but its Add back button and list are controls: a press on them is not a tap on the bare board, which would end editing on pointerup and drop or move the click that opens the list.
        if (node.classList.contains('anchor')) return { kind: 'none' }
        if (node === this._board || node === this._stripEl) return { kind: 'board' }
      } else if (node.parentElement === this && node.hasAttribute('item')) {
        const id = node.getAttribute('item')
        return this._placements.has(id) ? { kind: 'tile', id } : { kind: 'none' }
      }
    }
    return { kind: 'none' }
  }

  _onPointerDown(e) {
    // Before anything is started, so a widget button under the pointer keeps its click.
    if (this.locked) return
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
        this._editOrigin = this._tiles.get(g.id)
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
    if (g.captured) g.captured.removeEventListener('lostpointercapture', this._onResizeLost)
    window.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
    window.removeEventListener('pointercancel', this._onPointerCancel)
    this.removeAttribute('dragging')
    this._gesture = null
    // A long press that came to nothing leaves no edit mode to wait for.
    if (this._deferred && !this._editing) Promise.resolve().then(() => this._applyDeferred())
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
    // A strip tile is placed in the sticky strip, whose rect moves with the page not at all, so scrolling never shifts it.
    g.strip = this._inStrip(g.id)
    const rect = (g.strip ? this._stripEl : this._board).getBoundingClientRect()
    g.kind = 'drag'
    g.scroller = scrollParent(this)
    g.scroll0 = scrollPos(g.scroller)
    g.board0 = { left: rect.left, top: rect.top }
    g.view = g.scroller ? g.scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight }
    g.offsetX = g.x - (rect.left + box.x)
    g.offsetY = g.y - (rect.top + box.y)
    g.from = this._order.slice()
    g.fromStrip = this._strip.slice()
    g.pending = -1
    const item = this._item(g.id)
    const spec = this._spec(g.id)
    g.cols = g.strip ? 1 : footprint(item.size, this._columns, spec ? spec.sizes : null, spec ? spec.phoneRows : null).cols
    this.setAttribute('dragging', '')
    if (g.pointerType !== 'keyboard') {
      try {
        this.setPointerCapture(g.pointerId)
      } catch {
        // The pointer may already be gone; the drag still ends on pointerup.
      }
    }
    // A held tile has no pointer to click away: the next tap is the destination.
    if (g.pointerType !== 'keyboard') this._suppressClick = true
    this._unwiggle(g.id)
    liftStyle(el, chrome, true)
    if (g.pointerType === 'keyboard') {
      chrome.querySelector('.handle').setAttribute('aria-pressed', 'true')
      chrome.classList.add('held')
    }
    this._showPlaceholder(box, false, g.id)
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
    // The strip is stuck to the top of the view, so a drag in it never scrolls the page.
    if (!g.strip) {
      if (g.y < g.view.top + EDGE) scrollBy(g.scroller, -step * Math.min(1, (g.view.top + EDGE - g.y) / EDGE))
      else if (g.y > g.view.bottom - EDGE) scrollBy(g.scroller, step * Math.min(1, (g.y - (g.view.bottom - EDGE)) / EDGE))
    }

    const { x, y, target } = this._track(g)
    const translate = `${x}px ${y}px`
    this._tiles.get(g.id).style.translate = translate
    this._chromes.get(g.id).style.translate = translate

    const current = this._zone(g.id).findIndex((item) => item.id === g.id)
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
    const scroll = g.strip ? g.scroll0 : scrollPos(g.scroller)
    const x = g.x - g.offsetX - (g.board0.left - (scroll.x - g.scroll0.x))
    const y = g.y - g.offsetY - (g.board0.top - (scroll.y - g.scroll0.y))
    if (g.strip) return { x, y, target: stripSlotAt(x, this._strip.length, m, { rtl: this._rtl }) }
    // The slot under the tile depends on the whole cell it is over, the order and the column count, and every frame of
    // a drag asks again whether or not the pointer crossed into another cell. The pointer's cell is rounded to the
    // cell grid, which is where the slots are, and asked again with the same cell the answer is the last one.
    const at = cellAt(x, y, g.cols, m, { rtl: this._rtl })
    const cell = { col: Math.round(at.col), row: Math.round(at.row) }
    const memo = g.memo
    let target
    if (memo && memo.order === this._order && memo.columns === this._columns && memo.pitchX === m.pitchX && memo.pitchY === m.pitchY && memo.col === cell.col && memo.row === cell.row) {
      target = memo.target
    } else {
      target = dropIndex(this._order, g.id, cell, this._columns, this._resolve, m.pitchX / m.pitchY)
      g.memo = { order: this._order, columns: this._columns, pitchX: m.pitchX, pitchY: m.pitchY, col: cell.col, row: cell.row, target }
    }
    return { x, y, target }
  }

  /** Take a new slot: the other tiles slide, the placeholder follows. */
  _reorder(g, index) {
    if (this._gesture !== g || index < 0) return
    g.pending = -1
    this._setZone(g.id, moveItem(this._zone(g.id), g.id, index))
    this._render(true, g.kind === 'drag' ? g.id : undefined)
    this._showPlaceholder(this._boxes.get(g.id), true, g.id)
  }

  _drop(g, placed) {
    clearTimeout(g.settle)
    // Release decides, even for a flick that ended before the slot settled.
    if (g.pointerType !== 'keyboard') {
      const { target } = this._track(g)
      if (target !== this._zone(g.id).findIndex((item) => item.id === g.id)) this._reorder(g, target)
    }
    this._settle(g)
    const moved = g.strip ? !sameOrder(g.fromStrip, this._strip) : !sameOrder(g.from, this._order)
    if (moved) {
      if (g.strip) this._commitStrip({ ...this._layout, topStrip: mergeStrip(this._layout.topStrip || [], this._strip.map((item) => item.id)) }, g.id, true)
      else this._commit('move', g.id)
    }
    const t = this.t
    const label = this._label(g.id)
    const at = { label, position: this._position(g.id), total: this._zone(g.id).length }
    if (g.pointerType !== 'keyboard') {
      if (moved) this._announce(t('grid.moved', at))
    } else if (placed && moved) {
      this._announce(t('grid.droppedAt', at))
    } else {
      // Each arrow press already said where the tile went.
      this._announce(t('grid.dropped', { label }))
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
    if (chrome) {
      chrome.classList.remove('held')
      chrome.querySelector('.handle').setAttribute('aria-pressed', 'false')
    }
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
      if (g.fromStrip) this._strip = g.fromStrip
      this._render(true, g.id)
      this._settle(g)
      if (g.pointerType === 'keyboard') this._announce(this.t('grid.cancelled', { label: this._label(g.id) }))
    } else {
      this._end()
    }
  }

  _showPlaceholder(box, animate, id) {
    let ph = this._placeholder
    if (id !== undefined && this._inStrip(id)) {
      if (!this._stripPlaceholder) {
        this._stripPlaceholder = document.createElement('div')
        this._stripPlaceholder.className = 'placeholder'
        this._stripPlaceholder.setAttribute('part', 'placeholder')
        this._stripEl.insertBefore(this._stripPlaceholder, this._stripEl.firstChild)
      }
      ph = this._stripPlaceholder
    }
    setBox(ph, box, animate && this._motion())
    ph.classList.add('on')
  }

  _hidePlaceholder() {
    this._placeholder.classList.remove('on')
    if (this._stripPlaceholder) this._stripPlaceholder.classList.remove('on')
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
    // Capture keeps the gesture's pointer events coming even when the finger
    // or mouse leaves the window, and tells us when the browser takes it away.
    // Without it a lost pointerup left the tile lifted and its handle hidden.
    const handle = this._chromes.get(g.id).querySelector('.resize')
    try {
      handle.setPointerCapture(g.pointerId)
      g.captured = handle
      handle.addEventListener('lostpointercapture', this._onResizeLost)
    } catch {
      // The pointer may already be gone; pointerup and pointercancel still end the gesture.
    }
  }

  /** Capture was taken away (an OS gesture, a removed handle) with no pointerup: put the tile back as it was. */
  _onResizeLost(e) {
    const g = this._gesture
    if (g && g.kind === 'resize' && e.pointerId === g.pointerId) this._cancelGesture()
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
    // The handle is bottom-left under rtl, so dragging left widens and the box's far edge stays put.
    const w = Math.max(this._m.colWidth, g.box0.w + (this._rtl ? -dx : dx))
    const h = Math.max(this._m.rowHeight, g.box0.h + dy)
    // The outline stretches with the pointer; the tile snaps between sizes.
    this._showPlaceholder({ x: this._rtl ? g.box0.x + g.box0.w - w : g.box0.x, y: g.box0.y, w, h }, false)
    const extent = extentOf(w, h, this._m, { rtl: this._rtl })
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
      this._announce(this.t('grid.resized', { label: this._label(g.id), size }))
    }
  }

  // ── Removing ───────────────────────────────────────────────────────────

  _remove(id) {
    if (!this._editing || !this._placements.has(id) || this._gesture || this._removing.has(id)) return
    const now = Date.now()
    if (now - this._removedAt < REMOVE_GUARD_MS) return
    this._removedAt = now
    const el = this._tiles.get(id)
    const chrome = this._chromes.get(id)
    const label = this._label(id)
    // The handle or button that has focus goes with the tile, so say now where focus goes next.
    const ids = [...this._placements.values()].sort((a, b) => a.row - b.row || a.col - b.col).map((p) => p.id)
    const near = ids[ids.indexOf(id) + 1] || ids[ids.indexOf(id) - 1]
    // Held until the tile is gone, so a double-click can't remove twice.
    this._removing.add(id)
    chrome.classList.add('removing')
    const finish = () => {
      if (!this._removing.delete(id)) return
      // Read now, not when the removal began: the user may have moved on during the fade.
      const hadFocus = chrome.contains(this.shadowRoot.activeElement)
      this._order = removeItem(this._order, id)
      this._strip = removeItem(this._strip, id)
      el.style.display = 'none'
      this._dropChrome(id)
      this._placements.delete(id)
      this._render(true)
      const profile = this.profile
      const previous = this._layout
      const list = this._profileItems()
      const index = list.findIndex((item) => item.id === id)
      const next = withProfile(previous, profile, removeItem(list, id))
      this._record(profile, previous, next)
      // Children can't bring a removed tile back; only a restore can.
      this._removedFor(profile).add(id)
      this._layout = next
      this._emit('ts-layout-change', { layout: this._layout, items: this._profileItems(), previous, profile, reason: 'remove', id, index, item: list[index] })
      this._syncControls()
      if (hadFocus) this._focusAfterRemove(near)
      // The toast is a live region, so it speaks for itself; the grid's own
      // status region would say the same thing twice.
      if (!this._showToast(this.t('grid.removed', { label }))) this._announce(this.t('grid.removedSaid', { label }))
    }
    if (!this._motion()) return finish()
    this._unwiggle(id)
    const out = [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.85 }]
    const options = { duration: 180, easing: 'ease-in', fill: 'forwards' }
    chrome.animate(out, options)
    // A cancelled animation rejects; the tile must still go.
    const done = () => {
      finish()
      for (const a of el.getAnimations()) a.cancel()
    }
    el.animate(out, options).finished.then(done, done)
  }

  /** Focus the removed tile's neighbour, else the pill's Done, else the grid, so it is never left on a node that is gone. */
  _focusAfterRemove(near) {
    const chrome = near && this._chromes.get(near)
    const done = this._pill.querySelector('.done')
    this._focus(pickFocusTarget([
      chrome && { target: chrome.querySelector('.handle'), connected: chrome.isConnected, hidden: !this._editing },
      { target: done, connected: done.isConnected, hidden: this._pill.hidden },
    ]) || this)
  }

  // ── The undo toast ─────────────────────────────────────────────────────

  /** Show the toast; false when the host turned it off, so the caller announces instead. */
  _showToast(text) {
    if (this.getAttribute('undo-toast') === 'off') return false
    const toast = this._toast
    const wasOn = !!this._toastState
    if (this._toastState) clearTimeout(this._toastState.timer)
    this._toastState = { remaining: TOAST_MS, started: 0, timer: 0, hover: false, focus: false }
    this._toastText.textContent = text
    this._toastUndo.tabIndex = 0
    toast.classList.add('on')
    if (!wasOn && this._motion() && toast.animate) toast.animate([{ translate: '0 12px', opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 180, easing: 'ease-out' })
    this._toastTimer()
    return true
  }

  /** Start or pause the countdown: it runs only while neither hovered nor focused. */
  _toastTimer() {
    const t = this._toastState
    if (!t) return
    if (t.timer) {
      clearTimeout(t.timer)
      t.remaining = Math.max(0, t.remaining - (Date.now() - t.started))
      t.timer = 0
    }
    if (t.hover || t.focus) return
    t.started = Date.now()
    t.timer = setTimeout(() => this._hideToast(true), t.remaining)
  }

  _hideToast(animate) {
    const t = this._toastState
    if (!t) return
    clearTimeout(t.timer)
    this._toastState = null
    const toast = this._toast
    const off = () => {
      // A newer toast may have opened during the exit.
      if (this._toastState) return
      toast.classList.remove('on')
      this._toastText.textContent = ''
      this._toastUndo.tabIndex = -1
    }
    // Focus on the button would be lost with it; hand it back to the grid.
    if (this.shadowRoot.activeElement === this._toastUndo) this._toastUndo.blur()
    if (animate && this._motion() && toast.animate) toast.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in' }).finished.then(off, off)
    else off()
  }

  _undoFromToast() {
    const before = new Set(this._profileItems().map((item) => item.id))
    if (!this.undo()) return this._hideToast(false)
    // Keyboard users pressed Undo with focus on the toast, which is now gone.
    const back = this._profileItems().find((item) => !before.has(item.id))
    const chrome = back && this._chromes.get(back.id)
    if (this._editing && chrome) chrome.querySelector('.handle').focus()
  }

  // ── Keyboard ───────────────────────────────────────────────────────────

  _onDocKeyDown(e) {
    // Escape works even when focus is outside the grid, as after a long press
    // with the mouse.
    if (e.defaultPrevented) return
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && typeof e.key === 'string' && e.key.toLowerCase() === 'z') {
      // Leave a text field's own undo alone.
      const origin = e.composedPath()[0]
      if (origin && (origin.isContentEditable || /^(input|textarea|select)$/i.test(origin.localName || ''))) return
      if (!this._gesture && this.undo()) {
        this._announce(this.t('grid.undone'))
        e.preventDefault()
      }
      return
    }
    if (e.key !== 'Escape') return
    if (this._gesture) this._cancelGesture()
    else {
      // Escape in a host's dialog, menu or field is that widget's, not ours.
      const active = document.activeElement
      if (active && active !== document.body && !this.contains(active)) return
      this.editing = false
    }
    e.preventDefault()
  }

  /** The handle an event came from, if any. */
  _handleOf(e) {
    const el = e.composedPath()[0]
    return el && el.classList && el.classList.contains('handle') ? el : null
  }

  /** The tile picked up and not yet dropped, by key or by tap; both share it. */
  _heldId() {
    const g = this._gesture
    return g && g.kind === 'drag' && g.pointerType === 'keyboard' ? g.id : null
  }

  _onKeyDown(e) {
    if (!this._editing || e.ctrlKey || e.metaKey || e.altKey) return
    const handle = this._handleOf(e)
    if (!handle) return
    const held = this._heldId()
    // A pointer drag owns the tiles until it ends.
    if (this._gesture && !held) return
    // The cells run right to left under rtl, so the arrows swap to keep ArrowRight moving a tile visually right.
    const key = this._rtl ? { ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' }[e.key] || e.key : e.key
    const action = keyAction(key, handle.parentElement.dataset.id, { held })
    if (!action) return
    e.preventDefault()
    this._perform(action)
  }

  /** A handle was activated without dragging: by tap, click, or a screen reader's activate. Null is the empty board. */
  _tap(id) {
    if (!this._editing || this.locked) return
    const held = this._heldId()
    if (this._gesture && !held) return
    const action = tapAction(id, { held })
    if (action) this._perform(action)
  }

  /** Run what keyAction or tapAction decided. */
  _perform(a) {
    const g = this._gesture
    const id = a.id
    if (a.type === 'pickUp') {
      if (g || !this._placements.has(id)) return
      this._gesture = { kind: 'pending', pointerType: 'keyboard', id, x: 0, y: 0 }
      this._lift(this._gesture)
      if (this._gesture) this._announce(this.t('grid.pickedUp', { label: this._label(id) }))
    } else if (a.type === 'moveBy') {
      if (g && this._heldId() === id) this._keyMove(g, a.dCol, a.dRow)
    } else if (a.type === 'placeAt') {
      if (g && this._heldId() === id) this._placeAt(g, a.targetId)
    } else if (a.type === 'drop') {
      if (g && this._heldId() === id) this._drop(g)
    } else if (a.type === 'cancel') {
      if (g && this._heldId() === id) this._cancelGesture()
    } else if (a.type === 'resizeStep') {
      if (!g) this._resizeStep(id, a.dir)
    } else if (a.type === 'remove') {
      if (!g) this._remove(id)
    } else if (a.type === 'togglePin') {
      this._togglePin(id)
    }
  }

  /** Move the held tile to the target's slot and drop it there. */
  _placeAt(g, targetId) {
    const zone = this._zone(g.id)
    const to = zone.findIndex((item) => item.id === targetId)
    // The strip and the board are ordered apart: pin and unpin move a tile between them.
    if (to < 0) {
      if (this._item(targetId)) this._announce(this.t('grid.blocked'))
      return
    }
    if (to !== zone.findIndex((item) => item.id === g.id)) {
      this._setZone(g.id, moveItem(zone, g.id, to))
      this._render(true)
    }
    this._drop(g, true)
    this._reveal(g.id)
  }

  /** The resize button's click: a tap on it steps to the next size, wrapping, like the pointer's tap. */
  _resizeClick(id) {
    if (!this._editing || this._gesture || this._inStrip(id)) return
    const spec = this._spec(id)
    const item = this._item(id)
    if (!spec || !item) return
    let next = stepSize(spec, item.size, 1)
    if (next === item.size) next = stepSize(spec, item.size, -1) === item.size ? item.size : smallest(spec)
    this._applyResize(id, next)
  }

  _resizeStep(id, dir) {
    if (this._inStrip(id)) return
    const spec = this._spec(id)
    const item = this._item(id)
    if (!spec || !item) return
    this._applyResize(id, stepSize(spec, item.size, dir))
  }

  _applyResize(id, size) {
    const item = this._item(id)
    if (!item || size === item.size) return
    this._order = resizeItem(this._order, id, size, this._resolve)
    this._render(true)
    this._commit('resize', id)
    this._announce(this.t('grid.resized', { label: this._label(id), size }))
    this._reveal(id)
  }

  /** Scroll the tile's handle into view once it has slid there, smoothly only when motion is welcome. */
  _reveal(id) {
    const show = () => {
      const chrome = this._chromes.get(id)
      const handle = chrome && chrome.querySelector('.handle')
      if (handle && handle.isConnected && handle.scrollIntoView) handle.scrollIntoView({ block: 'nearest', behavior: this._motion() ? 'smooth' : 'auto' })
    }
    // The chrome is still sliding to its new box; measuring now would aim at the old one.
    if (this._motion()) setTimeout(show, 240)
    else show()
  }

  /** Move a held tile one cell, going further if that cell can't hold it. */
  _keyMove(g, dCol, dRow) {
    if (g.strip) return this._keyMoveStrip(g, dCol, dRow)
    const p = this._placements.get(g.id)
    const current = this._order.findIndex((item) => item.id === g.id)
    const limit = Math.max(this._columns, this._order.length * 2)
    for (let step = 1; step <= limit; step++) {
      const col = p.col + dCol * step
      const row = p.row + dRow * step
      if (col < 0 || row < 0 || col > this._columns - p.cols) break
      const target = dropIndex(this._order, g.id, { col, row }, this._columns, this._resolve)
      if (target !== current) {
        this._order = moveItem(this._order, g.id, target)
        this._render(true)
        this._showPlaceholder(this._boxes.get(g.id), true)
        this._announce(this.t('grid.moved', { label: this._label(g.id), position: this._position(g.id), total: this._order.length }))
        this._reveal(g.id)
        return
      }
    }
    this._announce(this.t('grid.blocked'))
  }

  /** The strip is one row: left and right step along it, up and down have nowhere to go. */
  _keyMoveStrip(g, dCol, dRow) {
    const at = this._strip.findIndex((item) => item.id === g.id)
    const to = at + dCol
    if (dRow !== 0 || to < 0 || to >= this._strip.length) {
      this._announce(this.t('grid.blocked'))
      return
    }
    this._strip = moveItem(this._strip, g.id, to)
    this._render(true)
    this._showPlaceholder(this._boxes.get(g.id), true, g.id)
    this._announce(this.t('grid.moved', { label: this._label(g.id), position: this._position(g.id), total: this._strip.length }))
    this._reveal(g.id)
  }

  // ── Output ─────────────────────────────────────────────────────────────

  _commit(reason, id) {
    const previous = this._layout
    this._history.push(this.profile, previous)
    const items = mergeOrder(this._profileItems(), this._order)
    this._layout = withProfile(this._layout, this.profile, items)
    this._emit('ts-layout-change', { layout: this._layout, items, previous, profile: this.profile, reason, id })
  }

  /** 1-based, among the strip's tiles or the board's. */
  _position(id) {
    if (this._inStrip(id)) return this._strip.findIndex((item) => item.id === id) + 1
    const sorted = [...this._placements.values()].filter((p) => p.row >= 0).sort((a, b) => a.row - b.row || a.col - b.col)
    return sorted.findIndex((p) => p.id === id) + 1
  }

  /**
   * Speak `text` politely. The region is cleared first and filled on the next
   * frame, because setting identical text twice in a row says nothing the
   * second time. Texts queued in the same frame are read together, in order.
   */
  _announce(text) {
    const status = this._status
    status.textContent = ''
    this._said.push(text)
    if (this._sayFrame) return
    const say = () => {
      cancelAnimationFrame(this._sayFrame)
      clearTimeout(this._sayTimer)
      this._sayFrame = 0
      status.textContent = this._said.join(' ')
      this._said = []
    }
    this._sayFrame = requestAnimationFrame(say)
    // A background tab pauses frames; the words are still owed.
    this._sayTimer = setTimeout(say, 120)
  }

  _emit(name, detail) {
    if (name === 'ts-layout-change') this._edited = true
    // DEV: the first edit on a grid nothing saves says so, once (RFC 0003 §4.3).
    // persistLayout sets `_persisted`, and a locked grid never commits.
    if (DEV && name === 'ts-layout-change' && !this._persisted && !this._unsavedWarned && !this.locked) {
      this._unsavedWarned = true
      warnOnce(`grid-unsaved:${++unsavedSerial}`, UNSAVED_WARNING)
    }
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
    el.style.boxShadow = 'var(--ts-shadow-lift)'
    el.style.borderRadius = 'var(--ts-radius, 10px)'
    chrome.classList.add('lifted')
  } else {
    el.style.scale = ''
    chrome.style.scale = ''
    el.style.boxShadow = ''
    if (!animate) chrome.classList.remove('lifted')
  }
}

function setAttr(el, name, value) {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

function isSizeName(size) {
  return typeof size === 'string' && isSize(size)
}

function sameIds(a, b) {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

function sameNodes(a, b) {
  return a.length === b.length && a.every((node, i) => node === b[i])
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
