/**
 * <ts-widget-picker for="grid-id">: the sheet a user adds tiles from (RFC 0003
 * §18.3). A native modal <dialog> in a shadow root, so the browser supplies
 * the top layer, the inert page behind it and Escape; this file supplies what
 * it can't: search, the groups, the size chips and the focus return.
 *
 * What it lists comes from pickerItems() (picker-model.js, tested without a
 * DOM): the grid's hidden children as restores, and the catalog types the host
 * says it answers ts-add-request for. It reads the grid when it opens and
 * again when the layout changes under it, and holds no copy of either.
 */

import { currentConfig } from '../core/index.js'
import { sizeName } from '../core/messages.js'
import { ensureTokens } from './default-tokens.js'
import { translator } from './messages-cache.js'
import { pickerItems } from './picker-model.js'
import { widgetCatalog } from './registry.js'

let template = null
const TEMPLATE = `
<style>
  /* The dialog sits in the top layer, so the host itself takes no room. */
  :host { display: contents; }
  [hidden] { display: none !important; }
  dialog {
    box-sizing: border-box; margin: auto; padding: 0; overflow: hidden;
    inline-size: min(560px, calc(100% - 32px)); max-inline-size: none;
    border: 1px solid var(--ts-line); border-radius: var(--ts-radius, 10px);
    background: var(--ts-surface); color: var(--ts-ink); box-shadow: var(--ts-shadow-lift);
    font: 14px/1.35 var(--ts-font-ui);
  }
  dialog::backdrop { background: color-mix(in srgb, var(--ts-ink) 45%, transparent); }
  .body {
    display: flex; flex-direction: column; box-sizing: border-box; gap: 12px; padding: 16px;
    max-block-size: min(680px, calc(100vh - 48px)); max-block-size: min(680px, calc(100dvh - 48px));
  }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .title { margin: 0; font: 600 17px var(--ts-font-ui); }
  button, input { font: inherit; color: inherit; }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--ts-focus); outline-offset: 2px; }
  .close, .chip {
    min-inline-size: 44px; min-block-size: 44px; box-sizing: border-box; margin: 0; padding: 0 16px; cursor: pointer;
    border: 1px solid var(--ts-line); border-radius: 999px; background: var(--ts-surface); font-weight: 600; font-size: 13px;
  }
  .close:hover, .chip:hover { background: var(--ts-surface-2); }
  .search {
    box-sizing: border-box; inline-size: 100%; min-block-size: 44px; margin: 0; padding: 0 14px;
    border: 1px solid var(--ts-line); border-radius: var(--ts-radius-sm, 6px); background: var(--ts-surface);
    /* 16px, so iOS Safari doesn't zoom the page when the field takes focus. */
    font-size: 16px;
  }
  .results { flex: 1 1 auto; min-block-size: 0; overflow-y: auto; overscroll-behavior: contain; margin-inline: -4px; padding-inline: 4px; }
  .group + .group { margin-block-start: 16px; }
  .group-title {
    margin: 0 0 4px; color: var(--ts-muted);
    font: var(--ts-label-weight, 600) var(--ts-label-size, 10px) var(--ts-font-ui);
    letter-spacing: var(--ts-label-tracking, .12em); text-transform: var(--ts-label-case, uppercase);
  }
  .rows { margin: 0; padding: 0; list-style: none; }
  .row { display: flex; flex-direction: column; gap: 8px; padding-block: 12px; border-block-end: 1px solid var(--ts-line); }
  .row:last-child { border-block-end: 0; }
  .name { display: block; font-weight: 600; }
  .desc { display: block; margin-block-start: 2px; color: var(--ts-muted); font-size: 13px; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .empty { margin: 0; padding-block: 24px; text-align: center; color: var(--ts-muted); }
  .sr { position: absolute; inline-size: 1px; block-size: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  /* Below 700px it is a sheet that rises from the bottom edge, where a thumb reaches. */
  @media (max-width: 699.98px) {
    dialog {
      inset-block: auto 0; inset-inline: 0; margin: 0; inline-size: 100%; max-inline-size: 100%;
      border-block-end: 0; border-end-start-radius: 0; border-end-end-radius: 0;
    }
    .body { max-block-size: min(640px, 85vh); max-block-size: min(640px, 85dvh); padding-block-end: max(16px, env(safe-area-inset-bottom)); }
  }
  @media (prefers-reduced-motion: no-preference) {
    dialog[open] { animation: rise 200ms var(--ts-ease, ease-out); }
    @keyframes rise { from { opacity: 0; translate: 0 12px; } to { opacity: 1; translate: 0 0; } }
  }
  @media (forced-colors: active) {
    dialog { border-color: CanvasText; }
    .close, .chip, .search { border-color: ButtonText; }
  }
</style>
<dialog part="sheet" aria-labelledby="title">
  <div class="body">
    <div class="head">
      <h2 class="title" id="title"></h2>
      <button class="close" part="close" type="button" tabindex="0"></button>
    </div>
    <input class="search" part="search" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search">
    <div class="results" tabindex="-1"></div>
    <p class="empty" part="empty" hidden></p>
    <p class="sr count" role="status"></p>
  </div>
</dialog>
`

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement

/** The focused element, looking through open shadow roots. */
function deepActive() {
  let el = document.activeElement
  while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement
  return el
}

export class TsWidgetPicker extends Base {
  constructor() {
    super()
    if (!template) {
      template = document.createElement('template')
      template.innerHTML = TEMPLATE
    }
    const root = this.attachShadow({ mode: 'open' })
    root.appendChild(template.content.cloneNode(true))
    this._dialog = root.querySelector('dialog')
    this._title = root.querySelector('.title')
    this._close = root.querySelector('.close')
    this._search = root.querySelector('.search')
    this._results = root.querySelector('.results')
    this._empty = root.querySelector('.empty')
    this._count = root.querySelector('.count')
    this._opener = null // where focus goes back to
    this._watched = null // the grid whose layout changes redraw the list while it is open
    this._onLayout = () => {
      if (this._dialog.open) this._renderList()
    }

    this._close.addEventListener('click', () => this.close())
    this._search.addEventListener('input', () => this._renderList())
    // The native cancel (Escape) and every other close end here.
    this._dialog.addEventListener('close', () => this._closed())
    this._dialog.addEventListener('click', (e) => {
      // The padding-free dialog is all content, so a click on the dialog itself is a click on the backdrop.
      if (e.target === this._dialog) this.close()
      const chip = e.target.closest ? e.target.closest('.chip') : null
      if (chip) this._choose(chip)
    })
  }

  /** The id of the <ts-grid> it adds to. */
  get for() {
    return this.getAttribute('for') || ''
  }

  set for(value) {
    this.setAttribute('for', String(value))
  }

  /** Whether the dialog is open. */
  get open() {
    return this._dialog.open
  }

  connectedCallback() {
    ensureTokens()
  }

  disconnectedCallback() {
    if (this._dialog.open) this.close()
  }

  /** The grid this adds to: the element with the `for` id, looked up from the root this sits in. */
  _grid() {
    const id = this.for
    if (!id) return null
    const root = this.getRootNode()
    const found = (root && root.getElementById ? root.getElementById(id) : null) || document.getElementById(id)
    return found && typeof found.add === 'function' && 'hiddenItems' in found ? found : null
  }

  _locale(grid) {
    return (grid && grid.getAttribute('locale')) || currentConfig().locale || undefined
  }

  _translate(grid) {
    if (grid && grid.t) return grid.t
    const config = currentConfig()
    return translator(config.messages, null, null, config.locale)
  }

  /**
   * Opens the dialog. Focus returns to `opener` when it closes: the control
   * that was used (default: the focused element).
   */
  show(opener) {
    if (!this.isConnected || this._dialog.open) return
    this._opener = opener || deepActive()
    const grid = this._grid()
    this._watch(grid)
    this._search.value = ''
    this._writeStatic(this._translate(grid))
    this._renderList()
    if (typeof this._dialog.showModal === 'function') this._dialog.showModal()
    else this._dialog.setAttribute('open', '')
    this.setAttribute('open', '')
    this._search.focus()
  }

  close() {
    if (!this._dialog.open) return
    if (typeof this._dialog.close === 'function') this._dialog.close()
    else {
      this._dialog.removeAttribute('open')
      this._closed()
    }
  }

  _closed() {
    this.removeAttribute('open')
    this._watch(null)
    const opener = this._opener
    this._opener = null
    // The opener may have gone, as a button does when the grid leaves edit mode; then focus stays where the browser put it.
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus()
  }

  _watch(grid) {
    if (this._watched === grid) return
    if (this._watched) this._watched.removeEventListener('ts-layout-change', this._onLayout)
    this._watched = grid
    if (grid) grid.addEventListener('ts-layout-change', this._onLayout)
  }

  _writeStatic(t) {
    this._title.textContent = t('picker.title')
    this._close.textContent = t('picker.close')
    this._search.setAttribute('aria-label', t('picker.search'))
    this._search.setAttribute('placeholder', t('picker.search'))
  }

  /** The grid's catalog types as one object: what defineWidget() and the built-ins give, then the host's own entries. */
  _catalog(grid) {
    const own = grid && grid.catalog && typeof grid.catalog === 'object' ? grid.catalog : {}
    return { ...widgetCatalog(), ...own }
  }

  _renderList() {
    const grid = this._grid()
    const t = this._translate(grid)
    const locale = this._locale(grid)
    const query = this._search.value
    const groups = grid
      ? pickerItems({ hidden: grid.hiddenItems, catalog: this._catalog(grid), addTypes: grid.addTypes, query, t, locale })
      : []
    const total = groups.reduce((n, g) => n + g.items.length, 0)

    this._results.textContent = ''
    groups.forEach((group, g) => {
      const section = document.createElement('section')
      section.className = 'group'
      section.setAttribute('part', 'group')
      const heading = document.createElement('h3')
      heading.className = 'group-title'
      heading.id = `g${g}`
      heading.textContent = group.category
      section.appendChild(heading)
      const list = document.createElement('ul')
      list.className = 'rows'
      // A list style of none drops the semantics in Safari unless the role is written.
      list.setAttribute('role', 'list')
      list.setAttribute('aria-labelledby', heading.id)
      for (const item of group.items) list.appendChild(this._row(item, t))
      section.appendChild(list)
      this._results.appendChild(section)
    })

    // Nothing at all to offer is a different thing to say than nothing matching the search.
    const none = total === 0
    this._empty.hidden = !none
    this._results.hidden = none
    this._empty.textContent = none ? t(query.trim() ? 'picker.noMatch' : 'picker.empty') : ''
    this._count.textContent = none ? this._empty.textContent : t('picker.count', {}, total)
    // A row that was focused and is gone leaves focus on the page behind a modal; the search field is the way back in.
    if (this._dialog.open && !this.shadowRoot.activeElement) this._search.focus()
  }

  _row(item, t) {
    const row = document.createElement('li')
    row.className = 'row'
    row.setAttribute('part', 'row')
    const text = document.createElement('div')
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = item.label
    text.appendChild(name)
    if (item.description) {
      const desc = document.createElement('span')
      desc.className = 'desc'
      desc.textContent = item.description
      text.appendChild(desc)
    }
    const chips = document.createElement('div')
    chips.className = 'chips'
    if (item.kind === 'restore') {
      chips.appendChild(this._chip(t('picker.addBack'), t('picker.addBackItem', { label: item.label }), { id: item.id }))
    } else {
      for (const size of item.sizes) {
        chips.appendChild(this._chip(t(`size.${size}`), t('picker.addSized', { label: item.label, size: sizeName(t, size) }), { type: item.type, size }))
      }
    }
    row.append(text, chips)
    return row
  }

  /** The visible word is short ("Medium"); the name carries the whole size and what it adds ("Add Card as Medium, 2 by 2"). */
  _chip(text, name, data) {
    const chip = document.createElement('button')
    chip.type = 'button'
    // Safari's default keyboard setting skips plain buttons, so the chips say they are Tab stops (the grid does the same for its Edit button).
    chip.tabIndex = 0
    chip.className = 'chip'
    chip.setAttribute('part', 'chip')
    chip.textContent = text
    chip.setAttribute('aria-label', name)
    for (const key of Object.keys(data)) chip.dataset[key] = data[key]
    return chip
  }

  _choose(chip) {
    const grid = this._grid()
    if (!grid) return this.close()
    if (chip.dataset.id !== undefined) {
      const hidden = grid.hiddenItems.find((h) => h.id === chip.dataset.id)
      if (!hidden || !grid.restore(hidden.id)) return this._renderList()
      grid._announce(grid.t('grid.addedBack', { label: hidden.label }))
    } else if (grid.add({ type: chip.dataset.type, size: chip.dataset.size }) === null) {
      // The host didn't take it (the grid says why in development); the sheet stays open to choose again.
      return
    }
    this.close()
  }
}
