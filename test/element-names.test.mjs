import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import * as elements from '../src/elements/index.js'
import { TsWidget } from '../src/elements/widget.js'

// RFC 0002 §2.8: no Tickslate attribute or property may share a name with a
// member of HTMLElement.prototype, or the element silently shadows (or is
// shadowed by) the platform's own. Node has no HTMLElement to ask, so this is
// a fixed list of the names most likely to be reached for by mistake; add to
// it when a new one bites.
export const DOM_NAMES = Object.freeze([
  'scroll',
  'title',
  'hidden',
  'slot',
  'part',
  'role',
  'dir',
  'lang',
  'style',
  'id',
  'className',
  'tabIndex',
  'inert',
  'draggable',
  'translate',
  'popover',
])

// Attributes are lower-case in HTML, so 'class-name' and 'tab-index' are the
// attribute spellings of the camelCase properties.
const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const banned = new Set([...DOM_NAMES, ...DOM_NAMES.map(kebab)].map((n) => n.toLowerCase()))

/** Every name a class adds: its observed attributes and the properties on its prototype chain up to a plain Object. */
export function addedNames(Ctor) {
  const names = new Set(Ctor.observedAttributes || [])
  for (let proto = Ctor.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    for (const key of Object.getOwnPropertyNames(proto)) if (key !== 'constructor') names.add(key)
  }
  return names
}

/** The names in `Ctor` that collide with a DOM name. */
export function collisions(Ctor) {
  return [...addedNames(Ctor)].filter((name) => banned.has(name.toLowerCase()))
}

const tickslateElements = Object.entries(elements).filter(([name, value]) => /^Ts[A-Z]/.test(name) && typeof value === 'function')

describe('element names', () => {
  test('there are elements to check, and the card is one of them', () => {
    assert.ok(tickslateElements.length >= 4)
    assert.ok(tickslateElements.some(([name]) => name === 'TsCard'))
    assert.ok(tickslateElements.some(([name]) => name === 'TsWidget'))
  })

  test('the checker finds the names it is meant to find', () => {
    class Bad extends TsWidget {
      static get observedAttributes() {
        return [...super.observedAttributes, 'scroll', 'tab-index']
      }
      get title() {
        return ''
      }
      get popover() {
        return ''
      }
    }
    assert.deepEqual(collisions(Bad).sort(), ['popover', 'scroll', 'tab-index', 'title'])
    assert.deepEqual(collisions(TsWidget), [])
  })

  for (const [name, Ctor] of tickslateElements) {
    test(`${name} has no attribute or property that is a DOM name`, () => {
      assert.deepEqual(collisions(Ctor), [], `${name}: rename what is listed (RFC 0002 §2.8)`)
    })
  }

  test("the card's boolean attribute is scrollable, not scroll", () => {
    const card = elements.TsCard
    assert.ok(card.observedAttributes.includes('scrollable'))
    assert.ok(!card.observedAttributes.includes('scroll'))
  })
})
