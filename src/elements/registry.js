/**
 * Element registration (RFC 0002 §2.2).
 *
 * Every class Tickslate registers is stamped with the core's version, so a
 * second copy of Tickslate that meets this tag can say which version got
 * there first.
 */
import { version } from '../core/index.js'
import { DEV, warnOnce } from './dev.js'

export function define(tag, ctor) {
  if (typeof customElements === 'undefined') return
  ctor.tickslateVersion = version
  const owner = customElements.get(tag)
  if (!owner) {
    customElements.define(tag, ctor)
    return
  }
  // The same class again is two bundles or a hot reload importing the entry,
  // which is fine. A different class is a real clash and shouldn't be silent.
  if (owner === ctor) return
  if (DEV) {
    const by = owner.tickslateVersion ? `Tickslate ${owner.tickslateVersion}` : 'a non-Tickslate element'
    warnOnce(`define:${tag}`, `<${tag}> is already defined by ${by}, so this copy (${version}) was not registered.`)
  }
}
