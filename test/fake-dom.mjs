/**
 * A just-enough DOM to drive the widget base class's rendering rules in Node,
 * shared by the element tests. It is not named *.test.mjs, so `npm test`
 * never runs it on its own and importing it registers no tests.
 *
 * Like the tests, it imports nothing outside node:* (here, nothing at all), so
 * CI runs them without npm install.
 *
 * To render a widget against it, make FakeElement the HTMLElement before
 * importing a fresh instance of the module (a query string gives a new module
 * record), and give it a document that can report visibility:
 *
 *   globalThis.HTMLElement = FakeElement
 *   globalThis.document = new FakeDocument()
 *   const { TsWidget } = await import('../src/elements/widget.js?fake-dom')
 *   delete globalThis.HTMLElement
 *
 * The element's shadow root is a FakeRoot, whose `.tile` is `section`: read
 * what a render wrote from `el.shadowRoot.section.html` and its attributes.
 * `section.querySelector(sel)` returns the same node for a selector until the
 * next innerHTML write, so `.textContent` shows what a render put there, and
 * `section.dispatch('click', { target })` stands in for a click on the tile.
 */

export class FakeNode {
  constructor() {
    this.attrs = new Map()
    this.textContent = ''
    this.htmlWrites = 0
    this.html = ''
    this.kids = new Map()
    this.listeners = new Map()
    // A widget writes inline custom properties (a figure's length) and positions; a test reads them back by name.
    this.style = { setProperty: (k, v) => { this.style[k] = v } }
    // The part of the class API a widget uses, over the class attribute, so a test sees what a browser would.
    // `classWrites` counts the writes that changed something: a real classList.add of a class already there writes nothing.
    this.classWrites = 0
    const list = () => (this.getAttribute('class') || '').split(/\s+/).filter(Boolean)
    const write = (names) => {
      this.classWrites++
      this.setAttribute('class', names.join(' '))
    }
    this.classList = {
      contains: (c) => list().includes(c),
      add: (c) => {
        const names = list()
        if (!names.includes(c)) write([...names, c])
      },
      remove: (c) => {
        const names = list()
        if (names.includes(c)) write(names.filter((n) => n !== c))
      },
    }
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v))
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null
  }
  removeAttribute(k) {
    this.attrs.delete(k)
  }
  hasAttribute(k) {
    return this.attrs.has(k)
  }
  toggleAttribute(k, force) {
    const on = force === undefined ? !this.attrs.has(k) : Boolean(force)
    if (on) this.setAttribute(k, '')
    else this.removeAttribute(k)
    return on
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type).push(fn)
  }
  /** Run this node's listeners for `type` with `event`, like a bubbled event arriving here. */
  dispatch(type, event) {
    for (const fn of this.listeners.get(type) || []) fn(event)
  }
  set innerHTML(v) {
    this.html = v
    this.htmlWrites++
    // New markup means new descendants: a test reads the text a render wrote
    // into the ones it asked for since.
    this.kids.clear()
  }
  get innerHTML() {
    return this.html
  }
  querySelector(sel) {
    if (!this.kids.has(sel)) this.kids.set(sel, new FakeNode())
    return this.kids.get(sel)
  }
}

export class FakeRoot extends FakeNode {
  constructor() {
    super()
    this.section = new FakeNode()
  }
  querySelector(sel) {
    return sel === '.tile' ? this.section : new FakeNode()
  }
}

/**
 * The document widgets listen to for visibilitychange. Tests connect many
 * widgets and rarely disconnect them, so the listeners pile up on the one
 * document and Node warns past ten; reset() between tests drops them.
 */
export class FakeDocument extends EventTarget {
  constructor() {
    super()
    this.visibilityState = 'visible'
    this._added = []
  }
  addEventListener(type, fn, opts) {
    this._added.push([type, fn, opts])
    super.addEventListener(type, fn, opts)
  }
  reset() {
    for (const [type, fn, opts] of this._added) super.removeEventListener(type, fn, opts)
    this._added = []
  }
}

export class FakeElement extends EventTarget {
  constructor() {
    super()
    this.attrs = new Map()
    this.isConnected = false
    this.parentElement = null
    this.localName = 'x-fake'
  }
  attachShadow() {
    this.shadowRoot = new FakeRoot()
    return this.shadowRoot
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null
  }
  hasAttribute(k) {
    return this.attrs.has(k)
  }
  toggleAttribute(k, force) {
    const on = force === undefined ? !this.attrs.has(k) : Boolean(force)
    if (on) this.setAttribute(k, '')
    else this.removeAttribute(k)
    return on
  }
  setAttribute(k, v) {
    const old = this.getAttribute(k)
    this.attrs.set(k, String(v))
    this._changed(k, old, String(v))
  }
  removeAttribute(k) {
    const old = this.getAttribute(k)
    this.attrs.delete(k)
    this._changed(k, old, null)
  }
  // A real element only calls attributeChangedCallback for observed attributes.
  _changed(k, old, value) {
    if (this.constructor.observedAttributes.includes(k)) this.attributeChangedCallback(k, old, value)
  }
  connect() {
    this.isConnected = true
    this.connectedCallback()
  }
  disconnect() {
    this.isConnected = false
    this.disconnectedCallback()
  }
}

/** Resolves after the microtask a render is batched into has run. */
export const tick = () => new Promise((resolve) => setImmediate(resolve))
