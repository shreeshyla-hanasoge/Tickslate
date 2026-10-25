/**
 * <ts-layout-list for="grid-id">: the layout of a <ts-grid> as a list
 * (RFC 0003 §20). Each tile is a row with a size button for every size it
 * supports, Move up, Move down and Remove. It needs no pointer, no drag and
 * no board, so it is the WCAG 2.5.7 alternative to dragging, and works for a
 * screen reader, a switch and a phone.
 *
 * It holds no layout of its own. Every edit goes through the grid's public
 * move(), resize() and remove() (RFC 0003 §18.4), so it fires the same
 * ts-layout-change events as a drag and lands in the same undo history, and the
 * list draws again from what the grid says when that event arrives.
 */

import { currentConfig, typeOf } from '../core/index.js'
import { sizeName } from '../core/messages.js'
import { ensureTokens } from './default-tokens.js'
import { translator } from './messages-cache.js'
import { wording } from './picker-model.js'
import { widgetCatalog } from './registry.js'

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)

// Own properties only, so a type called "toString" is unknown rather than a match on Object.prototype.
function specOf(item, catalog) {
  if (typeof catalog === 'function') return catalog(item) || null
  const type = typeOf(item)
  return catalog && typeof type === 'string' && hasOwn(catalog, type) ? catalog[type] : null
}

/**
 * The rows for a profile's items, as a pure function (no DOM, tested under node).
 *
 * - `catalog` is an object of specs or a function that resolves an item, as
 *   the core takes it. A tile whose spec it can't find lists no size buttons.
 * - `labelOf(item)` may return the tile's own label (the host's `label`
 *   attribute); without one the catalog's wording, then the type, names it.
 */
export function listRows(items, catalog, t, labelOf) {
  const list = Array.isArray(items) ? items.filter((item) => item && typeof item.id === 'string') : []
  return list.map((item, index) => {
    const spec = specOf(item, catalog)
    const type = typeOf(item)
    const sizes = spec && Array.isArray(spec.sizes) ? spec.sizes : []
    const own = typeof labelOf === 'function' ? labelOf(item) : ''
    return {
      id: item.id,
      label: own || wording(t, type, spec, 'label') || (typeof type === 'string' ? type : item.id),
      size: item.size,
      sizes: sizes.map((size) => ({ size, name: sizeName(t, size), pressed: size === item.size })),
      canMoveUp: index > 0,
      canMoveDown: index < list.length - 1,
    }
  })
}

/**
 * Make one edit through the grid and return what to say about it ('' when
 * nothing changed). The ends are guarded here as well as disabled in the
 * markup, because aria-disabled leaves a button clickable.
 */
export function editRow(grid, rows, action, id, t, size) {
  const at = rows.findIndex((row) => row.id === id)
  if (at < 0) return ''
  const row = rows[at]
  if (action === 'up' || action === 'down') {
    if (!(action === 'up' ? row.canMoveUp : row.canMoveDown)) return ''
    const to = at + (action === 'up' ? -1 : 1)
    return grid.move(id, to) ? t('list.moved', { label: row.label, position: to + 1, total: rows.length }) : ''
  }
  if (action === 'size') {
    if (size === row.size) return ''
    return grid.resize(id, size) ? t('list.resized', { label: row.label, size: sizeName(t, size) }) : ''
  }
  if (action === 'remove') return grid.remove(id) ? t('list.removed', { label: row.label }) : ''
  return ''
}

let template = null
const TEMPLATE = `
<style>
  :host { display: block; }
  :host([hidden]), [hidden] { display: none !important; }
  .wrap { color: var(--ts-ink); font: 14px/1.35 var(--ts-font-ui); }
  .wrap:focus { outline: none; }
  .rows { margin: 0; padding: 0; padding-inline-start: 28px; }
  .rows li { padding-block: 10px; border-block-end: 1px solid var(--ts-line); }
  .rows li::marker { color: var(--ts-muted); font-weight: 600; }
  .body { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .name { flex: 1 1 10em; min-inline-size: 0; font-weight: 600; overflow-wrap: anywhere; }
  .sizes, .acts { display: flex; flex-wrap: wrap; gap: 8px; }
  button {
    min-inline-size: 44px; min-block-size: 44px; box-sizing: border-box; margin: 0; padding: 0 14px; cursor: pointer;
    border: 1px solid var(--ts-line); border-radius: 999px; background: var(--ts-surface); color: inherit;
    font: 600 13px var(--ts-font-ui); white-space: nowrap;
  }
  button:hover { background: var(--ts-surface-2); }
  button[aria-pressed="true"] { background: var(--ts-accent); border-color: var(--ts-accent); color: var(--ts-surface); }
  /* aria-disabled and not disabled: a disabled button leaves the Tab order, and a switch user who has reached the end must still find it. */
  button[aria-disabled="true"] { opacity: .45; cursor: default; }
  button[aria-disabled="true"]:hover { background: var(--ts-surface); }
  button:focus-visible, .wrap:focus-visible { outline: 2px solid var(--ts-focus); outline-offset: 2px; }
  .foot { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding-block-start: 12px; }
  .status { flex: 1 1 10em; margin: 0; min-block-size: 1.35em; color: var(--ts-muted); }
  .empty { margin: 0; padding-block: 16px; color: var(--ts-muted); }
  @media (forced-colors: active) {
    button { border-color: ButtonText; }
    button[aria-pressed="true"] { background: Highlight; color: HighlightText; forced-color-adjust: none; }
    .rows li { border-color: CanvasText; }
  }
</style>
<div class="wrap" part="list" role="region" tabindex="-1">
  <ol class="rows" part="rows"></ol>
  <p class="empty" part="empty" hidden></p>
  <div class="foot">
    <button class="undo" part="undo" type="button" tabindex="0" data-action="undo"></button>
    <p class="status" part="status" role="status"></p>
  </div>
</div>
`

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement

export class TsLayoutList extends Base {
  constructor() {
    super()
    if (!template) {
      template = document.createElement('template')
      template.innerHTML = TEMPLATE
    }
    const root = this.attachShadow({ mode: 'open' })
    root.appendChild(template.content.cloneNode(true))
    this._wrap = root.querySelector('.wrap')
    this._ol = root.querySelector('.rows')
    this._empty = root.querySelector('.empty')
    this._undo = root.querySelector('.undo')
    this._status = root.querySelector('.status')
    this._grid = null
    this._offState = null
    this._attrs = null // watches the grid's `profile` attribute
    this._rows = [] // the rows as last drawn: the order an edit's index and a lost focus are read from
    this._nodes = new Map() // id -> <li>, so a redraw moves rows and patches them instead of rebuilding
    this._watch = null // watches the page for the grid arriving or leaving
    this._frame = 0
    this._sayFrame = 0
    this._sayTimer = 0
    this._waiting = false
    this._onChange = () => this._render()
    this._wrap.addEventListener('click', (e) => {
      const button = e.target.closest ? e.target.closest('button') : null
      if (button) this._press(button)
    })
  }

  /** The id of the <ts-grid> it edits. */
  get for() {
    return this.getAttribute('for') || ''
  }

  set for(value) {
    this.setAttribute('for', String(value))
  }

  static get observedAttributes() {
    return ['for']
  }

  attributeChangedCallback() {
    if (this.isConnected) this._attach()
  }

  connectedCallback() {
    ensureTokens()
    this._attach()
    // The grid may come later in the markup, or be rendered by a framework after this; look again when the page changes, once a frame at most.
    this._watch = new MutationObserver(() => {
      if (this._frame) return
      this._frame = requestAnimationFrame(() => {
        this._frame = 0
        this._attach()
      })
    })
    this._watch.observe(this.getRootNode(), { childList: true, subtree: true })
  }

  disconnectedCallback() {
    if (this._watch) this._watch.disconnect()
    this._watch = null
    cancelAnimationFrame(this._frame)
    cancelAnimationFrame(this._sayFrame)
    clearTimeout(this._sayTimer)
    this._frame = this._sayFrame = 0
    this._detach()
  }

  _gridEl() {
    const id = this.for
    if (!id) return null
    const root = this.getRootNode()
    return (root && root.getElementById ? root.getElementById(id) : null) || document.getElementById(id)
  }

  _detach() {
    const grid = this._grid
    if (grid) {
      grid.removeEventListener('ts-layout-change', this._onChange)
      grid.removeEventListener('ts-profile-change', this._onChange)
    }
    if (this._offState) this._offState()
    this._offState = null
    if (this._attrs) this._attrs.disconnect()
    this._attrs = null
    this._grid = null
  }

  /** Find the grid as it is now, listen to it and draw. */
  _attach() {
    const found = this._gridEl()
    // A grid that isn't defined yet has no move() to call; wait for it.
    const grid = found && typeof found.move === 'function' && typeof found.undo === 'function' ? found : null
    if (found && !grid && !this._waiting && typeof customElements !== 'undefined') {
      this._waiting = true
      customElements.whenDefined('ts-grid').then(() => {
        this._waiting = false
        this._attach()
      })
    }
    // The page changed somewhere else: the grid is as it was, so there is nothing to draw again.
    if (grid === this._grid && this._drawn) return
    this._detach()
    this._grid = grid
    if (grid) {
      grid.addEventListener('ts-layout-change', this._onChange)
      grid.addEventListener('ts-profile-change', this._onChange)
      // The grid says so when its messages or locale change, which reword every label here.
      if (typeof grid._onState === 'function') this._offState = grid._onState(this._onChange)
      // A host that sets the `profile` attribute gets no ts-profile-change (that event is for the schedule and overrides), yet the list shown changes.
      this._attrs = new MutationObserver(this._onChange)
      this._attrs.observe(grid, { attributes: true, attributeFilter: ['profile'] })
    }
    this._render()
  }

  _translate() {
    const grid = this._grid
    if (grid && grid.t) return grid.t
    const config = currentConfig()
    return translator(config.messages, null, null, config.locale)
  }

  /** The grid's catalog as the grid resolves a tile, else the built-ins and the host's own entries. */
  _catalog(grid) {
    if (typeof grid._resolve === 'function') return (item) => grid._resolve(item)
    const own = grid.catalog && typeof grid.catalog === 'object' ? grid.catalog : {}
    return { ...widgetCatalog(), ...own }
  }

  /** A tile's own `label` (or aria-label), which is what the grid itself calls it. */
  _labelOf(grid, id) {
    for (const el of grid.children) {
      if (el.getAttribute && el.getAttribute('item') === id) return el.getAttribute('label') || el.getAttribute('aria-label') || ''
    }
    return ''
  }

  _items(grid) {
    const layout = grid.layout
    const profiles = layout && layout.profiles
    const name = grid.profile
    return profiles && hasOwn(profiles, name) && Array.isArray(profiles[name]) ? profiles[name] : []
  }

  _press(button) {
    const grid = this._grid
    if (!grid || button.getAttribute('aria-disabled') === 'true') return
    const t = this._translate()
    const action = button.dataset.action
    if (action === 'undo') {
      this._say(t(grid.undo() ? 'list.undone' : 'list.nothingToUndo'))
      return
    }
    const li = button.closest('li')
    const text = li ? editRow(grid, this._rows, action, li.dataset.id, t, button.dataset.size) : ''
    if (text) this._say(text)
  }

  /**
   * Speak `text` politely. Cleared first and filled on the next frame, because
   * setting identical text twice says nothing the second time.
   */
  _say(text) {
    this._status.textContent = ''
    cancelAnimationFrame(this._sayFrame)
    clearTimeout(this._sayTimer)
    const write = () => {
      cancelAnimationFrame(this._sayFrame)
      clearTimeout(this._sayTimer)
      this._sayFrame = 0
      this._status.textContent = text
    }
    this._sayFrame = requestAnimationFrame(write)
    // A background tab pauses frames; the words are still owed.
    this._sayTimer = setTimeout(write, 120)
  }

  _render() {
    const grid = this._grid
    const t = this._translate()
    this._drawn = true
    this._wrap.setAttribute('aria-label', t('list.label'))
    if (this._undo.textContent !== t('list.undo')) this._undo.textContent = t('list.undo')
    // Read before the redraw: after it, a removed row's button is gone and the page has taken focus.
    const focus = this._focus()
    const rows = grid ? listRows(this._items(grid), this._catalog(grid), t, (item) => this._labelOf(grid, item.id)) : []
    const before = this._rows
    this._rows = rows
    this._empty.hidden = rows.length > 0
    this._empty.textContent = rows.length ? '' : t(grid ? 'list.empty' : 'list.noGrid')
    this._undo.hidden = !grid

    const live = new Set(rows.map((row) => row.id))
    for (const [id, li] of this._nodes) {
      if (live.has(id)) continue
      li.remove()
      this._nodes.delete(id)
    }
    let next = this._ol.firstChild
    for (const row of rows) {
      let li = this._nodes.get(row.id)
      if (!li) this._nodes.set(row.id, (li = this._newRow(row.id)))
      this._patch(li, row, t)
      if (li === next) next = next.nextSibling
      else this._ol.insertBefore(li, next)
    }
    if (focus) this._restore(focus, rows, before)
  }

  /** Which control has focus, as the row it is in and what it does. */
  _focus() {
    const active = this.shadowRoot.activeElement
    if (!active || !active.dataset) return null
    const li = active.closest ? active.closest('li') : null
    return { id: li ? li.dataset.id : '', action: active.dataset.action, size: active.dataset.size }
  }

  /**
   * A redraw moves rows around, and moving a focused button can drop its focus;
   * a row that is gone (removed here, or by an undo or the host) hands it to
   * the row that took its place, else the one above, else the list.
   */
  _restore(focus, rows, before) {
    // The Undo button is not a row and never goes away.
    if (!focus.id) return
    let id = focus.id
    if (!rows.some((row) => row.id === id)) {
      const was = before.findIndex((row) => row.id === id)
      const near = rows[Math.min(Math.max(was, 0), rows.length - 1)]
      if (!near) return this._wrap.focus()
      id = near.id
    }
    const li = this._nodes.get(id)
    const sel = focus.action === 'size' ? `[data-size="${focus.size}"]` : `[data-action="${focus.action}"]`
    const target = li && (li.querySelector(sel) || li.querySelector('[data-action="remove"]'))
    if (target && this.shadowRoot.activeElement !== target) target.focus()
  }

  _newRow(id) {
    const li = document.createElement('li')
    li.setAttribute('part', 'row')
    li.dataset.id = id
    const body = document.createElement('div')
    body.className = 'body'
    const name = document.createElement('span')
    name.className = 'name'
    name.setAttribute('part', 'name')
    const sizes = document.createElement('div')
    sizes.className = 'sizes'
    sizes.setAttribute('role', 'group')
    const acts = document.createElement('div')
    acts.className = 'acts'
    for (const [action, part] of [['up', 'move'], ['down', 'move'], ['remove', 'remove']]) acts.appendChild(this._button(action, part))
    body.append(name, sizes, acts)
    li.appendChild(body)
    return li
  }

  _button(action, part) {
    const button = document.createElement('button')
    button.type = 'button'
    // Safari's default keyboard setting skips plain buttons, so each says it is a Tab stop (the grid does the same for its Edit button).
    button.tabIndex = 0
    button.setAttribute('part', part)
    button.dataset.action = action
    return button
  }

  /** Write a row's words and states, touching only what differs, so a redraw doesn't flicker a screen reader's cursor. */
  _patch(li, row, t) {
    const set = (el, text) => {
      if (el.textContent !== text) el.textContent = text
    }
    const attr = (el, name, value) => {
      if (el.getAttribute(name) !== value) el.setAttribute(name, value)
    }
    const name = li.querySelector('.name')
    const sizes = li.querySelector('.sizes')
    set(name, row.label)
    attr(sizes, 'aria-label', t('list.sizes', { label: row.label }))
    // The set of sizes is the tile type's, so it changes only when a row is reused for another type.
    const key = row.sizes.map((s) => s.size).join('|')
    if (li.dataset.sizes !== key) {
      li.dataset.sizes = key
      sizes.textContent = ''
      for (const s of row.sizes) {
        const button = this._button('size', 'size')
        button.dataset.size = s.size
        sizes.appendChild(button)
      }
    }
    sizes.hidden = !row.sizes.length
    row.sizes.forEach((s, i) => {
      const button = sizes.children[i]
      set(button, t(`size.${s.size}`))
      // The word on the button is short ("Medium"); the name carries the whole size ("Medium, 2 by 2").
      attr(button, 'aria-label', s.name)
      attr(button, 'aria-pressed', String(s.pressed))
    })
    const [up, down, remove] = li.querySelectorAll('.acts button')
    set(up, t('list.moveUp'))
    attr(up, 'aria-label', t('list.moveUpItem', { label: row.label }))
    attr(up, 'aria-disabled', String(!row.canMoveUp))
    set(down, t('list.moveDown'))
    attr(down, 'aria-label', t('list.moveDownItem', { label: row.label }))
    attr(down, 'aria-disabled', String(!row.canMoveDown))
    set(remove, t('list.remove'))
    attr(remove, 'aria-label', t('list.removeItem', { label: row.label }))
  }
}
