/**
 * <ts-grid-controls for="grid-id">: the controls a grid's host would
 * otherwise build (RFC 0003 §18.5).
 *
 * The profile switcher shows only when the grid has a `schedule`: Auto, Market
 * hours and After close, with the next switch under it. It also links a
 * <ts-widget-picker> to the grid, so the edit pill's Add opens it.
 *
 * It holds no state of its own. It reads the grid when the grid says its
 * schedule, clock or override changed (grid._onState) and draws what it finds.
 */

import { activeProfile, createFormatter, currentConfig, localDate, nextProfileChange } from '../core/index.js'
import { ensureTokens } from './default-tokens.js'

let template = null
const TEMPLATE = `
<style>
  :host { display: block; }
  :host([hidden]), [hidden] { display: none !important; }
  .switcher {
    display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 4px; box-sizing: border-box; max-inline-size: 100%;
    border: 1px solid var(--ts-line); border-radius: 999px; background: var(--ts-surface); color: var(--ts-ink);
  }
  .opt {
    min-inline-size: 44px; min-block-size: 44px; box-sizing: border-box; margin: 0; padding: 0 16px; cursor: pointer;
    border: 0; border-radius: 999px; background: none; color: inherit; font: 600 13px var(--ts-font-ui); white-space: nowrap;
  }
  .opt:hover { background: var(--ts-surface-2); }
  .opt[aria-pressed="true"] { background: var(--ts-accent); color: var(--ts-surface); }
  .opt:focus-visible { outline: 2px solid var(--ts-focus); outline-offset: 2px; }
  .next { margin: 6px 0 0; padding-inline: 4px; color: var(--ts-muted); font: 13px var(--ts-font-ui); }
  @media (forced-colors: active) {
    .switcher { border-color: CanvasText; }
    .opt[aria-pressed="true"] { background: Highlight; color: HighlightText; forced-color-adjust: none; }
  }
</style>
<div class="wrap" hidden>
  <div class="switcher" part="switcher" role="group">
    <button class="opt" part="option" type="button" tabindex="0" data-profile="" aria-pressed="false"></button>
    <button class="opt" part="option" type="button" tabindex="0" data-profile="market" aria-pressed="false"></button>
    <button class="opt" part="option" type="button" tabindex="0" data-profile="closed" aria-pressed="false"></button>
  </div>
  <p class="next" part="next"></p>
</div>
`

const Base = typeof HTMLElement === 'undefined' ? class {} : HTMLElement

export class TsGridControls extends Base {
  constructor() {
    super()
    if (!template) {
      template = document.createElement('template')
      template.innerHTML = TEMPLATE
    }
    const root = this.attachShadow({ mode: 'open' })
    root.appendChild(template.content.cloneNode(true))
    this._wrap = root.querySelector('.wrap')
    this._switcher = root.querySelector('.switcher')
    this._options = [...root.querySelectorAll('.opt')]
    this._next = root.querySelector('.next')
    this._grid = null // the grid it is attached to
    this._offState = null
    this._linkedPicker = null
    this._watch = null // watches the page for the grid and the picker arriving or leaving
    this._frame = 0
    this._seen = null // the grid and the picker the last attach found, so a page's unrelated changes redraw nothing
    this._waiting = new Set() // tags a whenDefined is already queued for
    this._fmt = null // { key, fmt }: the formatter for the grid's attributes
    // One function, so "is the grid's openPicker ours" can be asked by identity.
    this._open = (opener) => {
      const picker = this._pickerEl()
      if (picker && typeof picker.show === 'function') picker.show(opener)
    }
    this._wrap.addEventListener('click', (e) => {
      const option = e.target.closest ? e.target.closest('.opt') : null
      if (!option || !this._grid) return
      this._grid.override(option.dataset.profile || null)
    })
  }

  /** The id of the <ts-grid> it controls. */
  get for() {
    return this.getAttribute('for') || ''
  }

  set for(value) {
    this.setAttribute('for', String(value))
  }

  /** The id of a <ts-widget-picker> to link; null means the one whose `for` is the same grid. */
  get picker() {
    return this.getAttribute('picker')
  }

  set picker(value) {
    if (value == null) this.removeAttribute('picker')
    else this.setAttribute('picker', String(value))
  }

  static get observedAttributes() {
    return ['for', 'picker']
  }

  attributeChangedCallback() {
    if (this.isConnected) this._attach()
  }

  connectedCallback() {
    ensureTokens()
    this._attach()
    // The grid or the picker may come later in the markup, or be rendered by a framework after this; look again when the page changes, once a frame at most.
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
    this._frame = 0
    this._detach()
  }

  _byId(id) {
    if (!id) return null
    const root = this.getRootNode()
    return (root && root.getElementById ? root.getElementById(id) : null) || document.getElementById(id)
  }

  _gridEl() {
    return this._byId(this.for)
  }

  _pickerEl() {
    const named = this.picker
    if (named) return this._byId(named)
    const id = this.for
    if (!id) return null
    const root = this.getRootNode()
    const all = root && root.querySelectorAll ? root.querySelectorAll('ts-widget-picker') : []
    return [...all].find((el) => el.getAttribute('for') === id) || null
  }

  _detach() {
    if (this._offState) this._offState()
    this._offState = null
    this._unlink()
    this._grid = null
    this._seen = null
  }

  _unlink() {
    const grid = this._grid
    if (grid && grid.openPicker === this._open) grid.openPicker = null
    this._linkedPicker = null
  }

  /** Find the grid and the picker as they are now, link them and draw. */
  _attach() {
    const found = this._gridEl()
    const ctor = typeof customElements === 'undefined' ? null : customElements.get('ts-grid')
    // A grid that isn't defined yet has no openPicker or schedule to read; wait for it.
    const grid = found && ctor && found instanceof ctor ? found : null
    if (found && !grid) this._whenDefined('ts-grid')
    if (grid !== this._grid) {
      this._detach()
      this._grid = grid
      if (grid) this._offState = grid._onState(() => this._render())
    }
    if (grid) {
      let picker = this._pickerEl()
      if (picker && typeof picker.show !== 'function') {
        this._whenDefined('ts-widget-picker')
        picker = null
      }
      if (picker && grid.openPicker !== this._open) grid.openPicker = this._open
      else if (!picker && grid.openPicker === this._open) grid.openPicker = null
      this._linkedPicker = picker
    }
    // The page changed somewhere else: the grid and the picker are as they were, so there is nothing to draw again.
    if (this._seen && this._seen.grid === grid && this._seen.picker === this._linkedPicker) return
    this._seen = { grid, picker: this._linkedPicker }
    this._render()
  }

  /** Attach again when `tag` is defined. Once per tag: the page may change a hundred times before it is. */
  _whenDefined(tag) {
    if (typeof customElements === 'undefined' || this._waiting.has(tag)) return
    this._waiting.add(tag)
    customElements.whenDefined(tag).then(() => {
      this._waiting.delete(tag)
      this._attach()
    })
  }

  _render() {
    const grid = this._grid
    const schedule = grid && grid.schedule
    this._wrap.hidden = !schedule
    if (!schedule) return
    const t = grid.t
    const override = grid.profileOverride
    this._switcher.setAttribute('aria-label', t('controls.profile'))
    for (const option of this._options) {
      const profile = option.dataset.profile
      const text = t(profile ? `controls.${profile}` : 'controls.auto')
      if (option.textContent !== text) option.textContent = text
      option.setAttribute('aria-pressed', String((override || '') === profile))
    }
    const text = this._nextText(grid, schedule, t)
    this._next.hidden = !text
    if (this._next.textContent !== text) this._next.textContent = text
  }

  /** One formatter per set of attributes and defaults: Intl objects are slow to build and this redraws on every clock tick of the grid. */
  _formatter(options) {
    const c = currentConfig()
    const key = JSON.stringify([options, c.locale, c.timeZone, c.hourCycle])
    if (!this._fmt || this._fmt.key !== key) this._fmt = { key, fmt: createFormatter(options) }
    return this._fmt.fmt
  }

  /** "Switches to After close at 15:35", or nothing when the schedule never changes. */
  _nextText(grid, schedule, t) {
    let at
    let to
    const now = grid.clock()
    try {
      at = nextProfileChange(schedule.calendar, schedule, now)
      if (at === null || at === undefined) return ''
      to = activeProfile(schedule.calendar, schedule, at)
    } catch {
      // A schedule the core rejects is the grid's to report, not this label's.
      return ''
    }
    const options = { locale: grid.getAttribute('locale') || undefined, timeZone: grid.getAttribute('time-zone') || undefined, hourCycle: grid.getAttribute('hour-cycle') || undefined }
    for (const key of Object.keys(options)) if (options[key] === undefined) delete options[key]
    const fmt = this._formatter(options)
    // A change on another day names the day, or "15:35" would read as today's.
    const sameDay = localDate(at, fmt.timeZone) === localDate(now, fmt.timeZone)
    const time = sameDay ? fmt.time(at) : `${fmt.date(at, { style: 'weekday' })} ${fmt.time(at)}`
    return t('controls.next', { profile: t(`controls.${to}`), time })
  }
}
