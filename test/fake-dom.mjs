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
 *   globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
 *   const { TsWidget } = await import('../src/elements/widget.js?fake-dom')
 *   delete globalThis.HTMLElement
 *
 * The element's shadow root is a FakeRoot, whose `.tile` is `section`: read
 * what a render wrote from `el.shadowRoot.section.html` and its attributes.
 */

export class FakeNode {
  constructor() {
    this.attrs = new Map()
    this.textContent = ''
    this.htmlWrites = 0
    this.html = ''
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v))
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null
  }
  set innerHTML(v) {
    this.html = v
    this.htmlWrites++
  }
  get innerHTML() {
    return this.html
  }
  querySelector() {
    return new FakeNode()
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
