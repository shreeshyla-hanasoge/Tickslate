/**
 * <ts-card>: a themed tile for any content (RFC 0002 §3.1).
 *
 * The card draws no data of its own. The host slots in a list, a paragraph or
 * another library's chart, and the card supplies the tile chrome around it:
 * the same surface, border, radius, padding and header as every other widget,
 * so a dashboard of mixed content still reads as one thing.
 *
 * Slots: (default) the body, `value` a headline, `actions` the header's right
 * end, `footer`, and `empty`. The body is `flex: 1; min-height: 0;
 * overflow: hidden` so a child with `height: 100%` fills whatever the tile's
 * size leaves, and follows it when the tile is resized.
 *
 * `data` is only `{ asOf?, live? }` and only changes the header meta. A card
 * with no data at all is a normal card, and `data = null` never swaps slotted
 * content for the empty view: the empty view shows only when the body has
 * nothing slotted into it.
 */

import { TsWidget, syncedParts, header } from './widget.js'
import { SIZE_NAMES, isSize, toTime } from '../core/index.js'

// Rendered by every variant: the card has no layouts of its own per size, so
// its slotted content reflows into the box it is given.
const TEMPLATE = `
${header({ dot: true, meta: true, actions: true })}
<div class="vw" data-k="vw" data-flash="value" hidden><slot name="value" part="value"></slot></div>
<div class="body" data-k="body" part="body"><slot></slot></div>
<slot name="footer"></slot>`

// Loading covers the body only (RFC 0002 §3.1): the header, headline and
// footer are the host's own content and stay where they are.
const SKELETON = `
${header({ actions: true })}
<slot name="value" part="value"></slot>
<span class="sk grow"></span>
<slot name="footer"></slot>`

/** The sizes a card may snap to: the valid tokens of `sizes`, in size order, else all seven. */
export function cardSizes(attr) {
  const wanted = new Set(String(attr || '').split(/\s+/).filter(isSize))
  const sizes = SIZE_NAMES.filter((name) => wanted.has(name))
  return sizes.length ? sizes : [...SIZE_NAMES]
}

/**
 * Pure: what the header shows. A boolean `data.live` and a readable
 * `data.asOf` win over the attributes, so a host can set the attributes in
 * markup and let live data take over.
 */
export function cardModel(data, variant, ctx) {
  const d = data && typeof data === 'object' ? data : {}
  const t = toTime(d.asOf !== undefined ? d.asOf : ctx.asOf)
  const time = Number.isFinite(t) ? ctx.fmt.time(t) : ''
  return {
    label: ctx.label,
    ariaLabel: ctx.valueText ? `${ctx.label}, ${ctx.valueText}` : ctx.label,
    live: typeof d.live === 'boolean' ? d.live : ctx.live === true,
    time,
    synced: syncedParts(ctx.t),
    scrollable: ctx.scrollable === true,
    valueText: ctx.valueText || '',
  }
}

/**
 * The number in a formatted figure ('$1,234.50', '1.234,50 €'), or NaN: the
 * card is given text, so this is the nearest thing it has to a value. The last
 * separator followed by one or two digits (or the only one, if it is a point)
 * is the decimal mark; every other separator groups.
 */
export function figureOf(text) {
  const m = /[+\-\u2212]?\s*\d[\d.,\s\u00a0\u202f']*/.exec(text)
  if (!m) return NaN
  const neg = /^[\-\u2212]/.test(m[0]) || /^[^\d]*\(/.test(text)
  let s = m[0].replace(/[^\d.,]/g, '')
  const last = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','))
  if (last >= 0 && (s.length - last - 1 <= 2 || (s[last] === '.' && !/[.,]/.test(s.slice(0, last))))) s = `${s.slice(0, last).replace(/[.,]/g, '')}.${s.slice(last + 1)}`
  else s = s.replace(/[.,]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? (neg ? -n : n) : NaN
}

const flag = (el, name, on) => (on ? el.setAttribute(name, '') : el.removeAttribute(name))

export class TsCard extends TsWidget {
  static catalogKey = 'card'
  static dataOptional = true
  static dataShape = Object.freeze({
    asOf: Object.freeze({ kind: 'time', optional: true }),
    live: Object.freeze({ kind: 'boolean', optional: true }),
  })

  static get observedAttributes() {
    return [...super.observedAttributes, 'sizes', 'live', 'as-of', 'scrollable']
  }

  static styles = `
[hidden] { display: none; }
.vw { flex: none; min-width: 0; align-self: flex-start; max-inline-size: 100%; }
.body { flex: 1; min-height: 0; overflow: hidden; }
.body.scroll { overflow: auto; scrollbar-width: thin; }
/* The last 28px fade while there is more below, so a cut-off row reads as
   more to come; at the end of the list the fade goes, so nothing is dimmed
   that has nowhere left to scroll. */
.body.scroll[data-more] {
  -webkit-mask-image: linear-gradient(to bottom, var(--ts-ink) calc(100% - 28px), transparent);
  mask-image: linear-gradient(to bottom, var(--ts-ink) calc(100% - 28px), transparent);
}
.body.scroll:focus-visible { outline: 2px solid var(--ts-focus, var(--ts-accent)); outline-offset: 2px; }
/* A canvas or svg is inline by default, and its baseline gap would push a
   height: 100% chart a few pixels past the body. */
::slotted(canvas), ::slotted(svg), ::slotted(img), ::slotted(video), ::slotted(iframe) { display: block; }
slot[name="value"]::slotted(*) {
  display: block; flex: none; white-space: nowrap; overflow: hidden; unicode-bidi: isolate;
  font-family: var(--ts-font-num); font-variant-numeric: tabular-nums lining-nums; font-weight: var(--ts-headline-weight, var(--ts-num-weight, 500));
  font-size: min(34px, 19cqi); line-height: 1; letter-spacing: -.01em;
}
slot[name="footer"]::slotted(*) {
  display: block; flex: none; font-size: 11px; color: var(--ts-muted);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
`

  constructor() {
    super()
    this._specKey = null
    this._spec = null
    this._seen = null
    // Scroll doesn't bubble; capturing on the tile catches the body whenever
    // its markup was last rebuilt.
    this._section.addEventListener('scroll', () => this._fade(), true)
  }

  /** From the sizes and label attributes (RFC 0002 §3.1). Cached per attribute pair, as a grid asks often. */
  get spec() {
    const sizes = this.getAttribute('sizes')
    const label = this.getAttribute('label') || ''
    const key = `${sizes}\n${label}`
    if (key !== this._specKey) {
      this._specKey = key
      this._spec = { label, sizes: cardSizes(sizes) }
    }
    return this._spec
  }

  static template() {
    return TEMPLATE
  }

  static skeleton() {
    return SKELETON
  }

  static viewModel(data, variant, ctx) {
    return cardModel(data, variant, ctx)
  }

  viewContext() {
    return {
      live: this.hasAttribute('live'),
      asOf: this.getAttribute('as-of'),
      scrollable: this.hasAttribute('scrollable'),
      valueText: this._slottedText('value'),
    }
  }

  connectedCallback() {
    super.connectedCallback()
    // Slotted content changes without telling the card, and the empty view
    // and the headline in the region's name both depend on it.
    if (!this._seen && typeof MutationObserver !== 'undefined') {
      this._seen = new MutationObserver(() => this.requestRender())
      this._seen.observe(this, { childList: true, subtree: true, characterData: true })
    }
    if (!this._resize && typeof ResizeObserver !== 'undefined') {
      this._resize = new ResizeObserver(() => this._fade())
      this._resize.observe(this)
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    if (this._seen) this._seen.disconnect()
    if (this._resize) this._resize.disconnect()
    this._seen = null
    this._resize = null
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return
    // A new set of sizes may no longer include the current one.
    if (name === 'sizes') this._normaliseSize()
    super.attributeChangedCallback(name, oldValue, newValue)
  }

  /** The base shows the empty view for null data; a card with a body shows the body. */
  _render() {
    const held = this._data
    if (held === null && this._hasBody()) this._data = undefined
    try {
      super._render()
    } finally {
      this._data = held
    }
  }

  /** Anything slotted into the default slot: an element with no slot name, or text that isn't whitespace. */
  _hasBody() {
    for (const node of this.childNodes || []) {
      if (node.nodeType === 1) {
        if (!node.getAttribute('slot')) return true
      } else if (node.nodeType === 3 && /\S/.test(node.textContent)) return true
    }
    return false
  }

  _slottedText(name) {
    for (const node of this.childNodes || []) {
      if (node.nodeType === 1 && node.getAttribute('slot') === name) return (node.textContent || '').trim()
    }
    return ''
  }

  update(vm) {
    const text = (k, s) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el && el.textContent !== s) el.textContent = s
    }
    text('label', vm.label)
    flag(this.$('[data-k="dot"]'), 'hidden', !vm.live)
    flag(this.$('[data-k="meta"]'), 'hidden', !vm.time)
    text('pre', vm.synced.pre)
    text('time', vm.time)
    text('post', vm.synced.post)
    // The wrapper paints the tint: a slot is display: contents and has no box of its own.
    flag(this.$('[data-k="vw"]'), 'hidden', !vm.valueText)
    this.flash('value', figureOf(vm.valueText))

    const body = this.$('[data-k="body"]')
    body.setAttribute('class', vm.scrollable ? 'body scroll' : 'body')
    // A scrolling region the keyboard can't reach is unusable without a mouse.
    if (vm.scrollable) {
      body.setAttribute('tabindex', '0')
      body.setAttribute('role', 'group')
      body.setAttribute('aria-label', this.label || this.localName)
    } else {
      body.removeAttribute('tabindex')
      body.removeAttribute('role')
      body.removeAttribute('aria-label')
      body.removeAttribute('data-more')
    }
    this._fade()
  }

  /** Show the fade only while the body has more to scroll to. */
  _fade() {
    const body = this.shadowRoot && this.$('[data-k="body"]')
    if (!body || typeof body.scrollHeight !== 'number' || !/\bscroll\b/.test(body.getAttribute('class') || '')) return
    flag(body, 'data-more', body.scrollTop + body.clientHeight < body.scrollHeight - 1)
  }
}
