/**
 * The one place Tickslate turns a string into DOM (RFC 0003 §14).
 *
 * A host can enforce `require-trusted-types-for 'script'` and a strict
 * `style-src`, so nothing here reaches for what those block:
 *
 *   - Markup is only ever a module constant. Each template is parsed once into
 *     a <template> and cloned per use; the single `innerHTML` write in the
 *     library is below, and its string passes through a policy named
 *     `tickslate`, created the first time markup is written (never on import,
 *     and not at all where Trusted Types is missing).
 *   - Anything that depends on data is described as a small spec and built with
 *     createElement, setAttribute, textContent and element.style (the CSSOM,
 *     which `style-src` leaves alone), never as a string.
 *   - CSS is one constructed CSSStyleSheet per distinct source, adopted by each
 *     shadow root. Where constructable sheets are missing (below Safari 16.4)
 *     it falls back to a <style> element that carries configure({ styleNonce }).
 *
 * Importing this module needs no DOM. The tests' stand-in nodes have no
 * createElement, so there every function falls back to writing the markup
 * string the real path would have built, which is what those tests read.
 */

import { currentConfig, onConfigure } from '../core/index.js'
import { DEV, warnOnce } from './dev.js'

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Module scope only, and never wrapped in an exported function: a policy any script could reach (a global, a registered
// symbol, a helper that takes a string) would mint TrustedHTML for arbitrary markup and defeat the page's own policy.
// Two copies of Tickslate on one page therefore need 'allow-duplicates' in the page's trusted-types directive.
let policy // undefined until markup is first written; null where there is no Trusted Types; false where it was refused

const REFUSED = "the page's trusted-types directive does not allow the 'tickslate' policy; add it (a second copy of Tickslate also needs 'allow-duplicates'), or Tickslate cannot render"

function resolvePolicy() {
  if (policy === undefined) {
    const tt = globalThis.trustedTypes
    if (!tt || typeof tt.createPolicy !== 'function') policy = null
    else {
      try {
        // The only strings it ever sees are the constants parsed below.
        policy = tt.createPolicy('tickslate', { createHTML: (m) => m })
      } catch {
        policy = false
        if (DEV) warnOnce('trusted-types-policy', REFUSED)
      }
    }
  }
}

/** False when the page's trusted-types directive refused the `tickslate` policy: no markup can be written, so elements stay empty. */
export function markupAllowed() {
  resolvePolicy()
  return policy !== false
}

function trusted(markup) {
  resolvePolicy()
  // Closed when refused: null means the string is never offered to a sink, so the template stays empty.
  if (policy === false) return null
  return policy ? policy.createHTML(markup) : markup
}

// The no-DOM branches below are for the node tests' stand-in nodes; a browser always has a real document.
/** True where there is a real document to build nodes in. */
function live() {
  return typeof document !== 'undefined' && typeof document.createElement === 'function' && typeof document.importNode === 'function'
}

const parsed = new Map()

function templateOf(markup) {
  let tpl = parsed.get(markup)
  if (!tpl) {
    tpl = document.createElement('template')
    const safe = trusted(markup)
    if (safe !== null) tpl.innerHTML = safe
    parsed.set(markup, tpl)
  }
  return tpl
}

/**
 * A fresh copy of the DOM a constant markup string makes. Imported into the
 * document so custom elements inside it upgrade as they would from innerHTML.
 */
export function cloneHTML(markup) {
  return document.importNode(templateOf(markup).content, true)
}

/** Replaces `host`'s children with `count` copies of a constant markup string. */
export function setHTML(host, markup, count = 1) {
  if (!live()) {
    host.innerHTML = count === 1 ? markup : markup.repeat(count)
    return
  }
  const out = document.createDocumentFragment()
  for (let i = 0; i < count; i++) out.appendChild(cloneHTML(markup))
  host.replaceChildren(out)
}

/** Adds `fn` as a `type` listener on each node under `host` that matches `selector`. The stand-in nodes have none to find. */
export function listenAll(host, selector, type, fn) {
  if (!live()) return
  for (const n of host.querySelectorAll(selector)) n.addEventListener(type, fn)
}

function markupOf(s) {
  let attrs = ''
  for (const k in s.attrs) attrs += ` ${k}="${escapeHtml(s.attrs[k])}"`
  let css = ''
  for (const k in s.css) css += `${css ? ';' : ''}${k}:${s.css[k]}`
  const inner = s.kids ? s.kids.map(markupOf).join('') : s.text === undefined ? '' : escapeHtml(s.text)
  return `<${s.tag}${attrs}${css ? ` style="${escapeHtml(css)}"` : ''}>${inner}</${s.tag}>`
}

function buildNode(s) {
  const el = document.createElement(s.tag)
  for (const k in s.attrs) el.setAttribute(k, s.attrs[k])
  for (const k in s.css) el.style.setProperty(k, s.css[k])
  if (s.kids) for (const kid of s.kids) el.appendChild(buildNode(kid))
  else if (s.text !== undefined) el.textContent = s.text
  return el
}

/**
 * Replaces `host`'s children with elements described as
 * `{ tag, attrs?, css?, text?, kids? }`. `css` is custom or logical properties
 * set through element.style, so it is never a `style` attribute in markup.
 */
export function setNodes(host, specs) {
  if (!live()) {
    host.innerHTML = specs.map(markupOf).join('')
    return
  }
  const out = document.createDocumentFragment()
  for (const s of specs) out.appendChild(buildNode(s))
  host.replaceChildren(out)
}

/**
 * Replaces `host`'s children with one element described as in `setNodes`, and moves the nodes of `from` (the host
 * itself, or an element inside it) into that element. The words are not rebuilt from text, so a label that holds
 * two forms, one hidden by CSS, keeps both. With nothing to move it holds `fallback`.
 */
export function wrapNodes(host, spec, from, fallback) {
  if (!live()) {
    setNodes(host, [{ ...spec, text: from.textContent || fallback }])
    return
  }
  const kids = [...from.childNodes]
  setNodes(host, [{ ...spec, text: kids.length ? '' : fallback }])
  host.firstChild.append(...kids)
}

/** Puts the nodes of `link`, an element inside `host`, in place of everything in `host`; with none, `fallback` as text. */
export function unwrapNodes(host, link, fallback) {
  if (!live()) setText(host, link.textContent || fallback)
  else if (link.childNodes.length) host.replaceChildren(...link.childNodes)
  else host.textContent = fallback
}

/** Replaces `host`'s children with plain text. */
export function setText(host, text) {
  if (!live()) host.innerHTML = escapeHtml(text)
  else host.textContent = text
}

// One sheet per distinct CSS source, which is one per widget class (plus the grid, picker and controls).
const sheets = new Map()

/** Gives a shadow root `css`: an adopted sheet, or a nonce'd <style> where sheets can't be adopted. */
export function adoptCSS(root, css) {
  try {
    let sheet = sheets.get(css)
    if (!sheet) {
      sheet = new CSSStyleSheet()
      sheet.replaceSync(css)
      sheets.set(css, sheet)
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]
  } catch {
    // No constructable sheets (below Safari 16.4), or one built in another document: a <style> works everywhere.
    root.appendChild(styleElement(css))
  }
}

// Fallback <style> elements, so a nonce configured after they were made reaches them (the elements in the page's
// HTML upgrade when the entry evaluates, before the host's own script can call configure()).
const fallbacks = new Set()
// The nonce each fallback was last given. A browser hides a nonce from getAttribute once the element is connected, so
// the attribute can't say whether it is current; this can.
const applied = new WeakMap()
let watching = false
let pruneAt = 32

function renonce(nonce) {
  for (const ref of fallbacks) {
    const style = ref.deref()
    if (!style || !style.parentNode) {
      fallbacks.delete(ref)
      continue
    }
    if (nonce && applied.get(style) !== nonce) {
      style.setAttribute('nonce', nonce)
      applied.set(style, nonce)
      // A style blocked at insertion is evaluated again only when it is inserted again.
      const parent = style.parentNode
      const next = style.nextSibling
      style.remove()
      parent.insertBefore(style, next)
    }
  }
}

/** A <style> element for `css`, carrying the configured nonce. Callers append it where it belongs. */
export function styleElement(css, doc = document) {
  const style = doc.createElement('style')
  const nonce = currentConfig().styleNonce
  if (nonce) {
    style.setAttribute('nonce', nonce)
    applied.set(style, nonce)
  }
  style.textContent = css
  if (typeof WeakRef === 'function') {
    // Dead refs are dropped as the set grows, so pages that make and discard many widgets without calling configure() stay flat.
    if (fallbacks.size >= pruneAt) {
      for (const ref of fallbacks) if (!ref.deref()) fallbacks.delete(ref)
      pruneAt = Math.max(32, fallbacks.size * 2)
    }
    fallbacks.add(new WeakRef(style))
    if (!watching) {
      watching = true
      onConfigure((c) => renonce(c.styleNonce))
    }
  }
  return style
}

/**
 * Fills a new shadow root: its CSS, then its constant markup. Where there is
 * no real DOM it writes both as one string, as before. Returns false when the
 * markup did not arrive (the page's trusted-types directive refused the
 * `tickslate` policy), so a constructor can stop instead of reading nodes
 * that are not there.
 */
export function mountShadow(root, css, markup) {
  if (!live()) {
    root.innerHTML = `<style>${css}</style>${markup}`
    return true
  }
  adoptCSS(root, css)
  root.appendChild(cloneHTML(markup))
  return markupAllowed()
}

/**
 * For an element whose constructor stopped because its markup never arrived:
 * every public method, accessor and lifecycle callback of `Ctor`, and each
 * name in `internals` (members other elements call, such as a grid's `_link`),
 * then does nothing (reads give undefined) while `this._blocked` is true, so
 * the host's own `document.createElement(...)`, property writes and `remove()`
 * keep working.
 */
export function inertWhenBlocked(Ctor, internals = []) {
  const proto = Ctor.prototype
  const wrap = (fn) => function (...args) {
    return this._blocked ? undefined : fn.apply(this, args)
  }
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor' || (key[0] === '_' && !internals.includes(key))) continue
    const d = Object.getOwnPropertyDescriptor(proto, key)
    if (typeof d.value === 'function') d.value = wrap(d.value)
    if (d.get) d.get = wrap(d.get)
    if (d.set) d.set = wrap(d.set)
    Object.defineProperty(proto, key, d)
  }
}
