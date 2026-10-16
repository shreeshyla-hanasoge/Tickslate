/**
 * What the two list widgets' tests add to test/mini-dom.mjs: the CSSOM
 * `style` a range bar's marks are placed with, and `createElementNS`, which a
 * sparkline's nodes are made with. Both log into the document's write log, so
 * "a tick moves one mark" can be counted. Not named *.test.mjs, so `npm test`
 * never runs it on its own, and it imports only the mini DOM beside it.
 */
import { MiniDoc, MiniNode } from './mini-dom.mjs'

if (!Object.getOwnPropertyDescriptor(MiniNode.prototype, 'style')) {
  Object.defineProperty(MiniNode.prototype, 'style', {
    get() {
      if (!this._style) {
        const vars = new Map()
        this._style = {
          getPropertyValue: (name) => (vars.has(name) ? vars.get(name) : ''),
          setProperty: (name, value) => {
            this.doc.log.push(`style ${this.id()} ${name}=${value}`)
            vars.set(name, String(value))
          },
        }
      }
      return this._style
    },
  })
  MiniDoc.prototype.createElementNS = function createElementNS(ns, tag) {
    return this.createElement(tag)
  }
}

export { MiniDoc, MiniNode }

/** The `data-k`-keyed nodes of a widget, made on demand, in the way test/table.test.mjs does. */
export function keyedNodes(doc, tagFor = () => 'div') {
  const nodes = new Map()
  return (selector) => {
    const k = /data-k="(\w+)"/.exec(selector)[1]
    if (!nodes.has(k)) nodes.set(k, new MiniNode(doc, tagFor(k)))
    return nodes.get(k)
  }
}
