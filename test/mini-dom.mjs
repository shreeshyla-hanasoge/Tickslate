/**
 * A small tree DOM for the keyed-rows tests: elements with children, the
 * attributes and text widgets write, and a log of every write, so a test can
 * say "changing one cell is one write" and mean it. Not named *.test.mjs, so
 * `npm test` never runs it on its own. It imports nothing.
 *
 * It is not a browser: it knows tags, classes and the few methods rows.js and
 * <ts-table> call, and `closest()` takes a tag or a `.class`.
 */

export class MiniNode {
  constructor(doc, tag) {
    this.doc = doc
    this.localName = tag
    this.attrs = new Map()
    this.children = []
    this.parent = null
    this._text = ''
    this.isConnected = true
  }
  get firstChild() {
    return this.children[0] || null
  }
  get lastChild() {
    return this.children[this.children.length - 1] || null
  }
  get textContent() {
    return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text
  }
  set textContent(v) {
    this.doc.log.push(`text ${this.id()} ${JSON.stringify(String(v))}`)
    for (const c of this.children) c.parent = null
    this.children = []
    this._text = String(v)
  }
  id() {
    return this.getAttribute('data-id') || this.getAttribute('data-key') || this.getAttribute('class') || this.localName
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null
  }
  hasAttribute(k) {
    return this.attrs.has(k)
  }
  setAttribute(k, v) {
    this.doc.log.push(`attr ${this.id()} ${k}=${v}`)
    this.attrs.set(k, String(v))
  }
  removeAttribute(k) {
    this.doc.log.push(`attr ${this.id()} -${k}`)
    this.attrs.delete(k)
  }
  toggleAttribute(k, force) {
    // Like a browser, setting what is already so is not a mutation.
    if (Boolean(force) === this.attrs.has(k)) return
    if (force) this.setAttribute(k, '')
    else this.removeAttribute(k)
  }
  appendChild(node) {
    return this.insertBefore(node, null)
  }
  insertBefore(node, ref) {
    this.doc.log.push(`insert ${node.id()}`)
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1)
    const at = ref ? this.children.indexOf(ref) : this.children.length
    this.children.splice(at, 0, node)
    node.parent = this
    this._text = ''
    // A real browser drops focus from an element that is moved.
    if (this.doc.activeElement && node.contains(this.doc.activeElement)) this.doc.activeElement = null
    return node
  }
  removeChild(node) {
    this.doc.log.push(`remove ${node.id()}`)
    this.children.splice(this.children.indexOf(node), 1)
    node.parent = null
    return node
  }
  contains(node) {
    for (let n = node; n; n = n.parent) if (n === this) return true
    return false
  }
  getRootNode() {
    return this.doc
  }
  focus() {
    this.doc.activeElement = this
  }
  matches(sel) {
    return sel.startsWith('.') ? (this.getAttribute('class') || '').split(/\s+/).includes(sel.slice(1)) : this.localName === sel
  }
  closest(sel) {
    for (let n = this; n; n = n.parent) if (n.matches(sel)) return n
    return null
  }
  /** Every descendant with this tag or class, in document order. */
  all(sel) {
    return this.children.flatMap((c) => [...(c.matches(sel) ? [c] : []), ...c.all(sel)])
  }
}

export class MiniDoc {
  constructor() {
    this.log = []
    this.activeElement = null
  }
  createElement(tag) {
    return new MiniNode(this, tag)
  }
  /** The writes since the last call, as a list of strings. */
  take() {
    return this.log.splice(0)
  }
}
