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

import { currentConfig } from '../core/index.js'

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Shared on globalThis, so a page that loads Tickslate twice (ESM and the CDN bundle) reuses the one policy
// instead of tripping over createPolicy's duplicate-name error.
const POLICY_KEY = Symbol.for('tickslate.trustedTypes')
let policy // undefined until markup is first written; null where there is no Trusted Types

function trusted(markup) {
  if (policy === undefined) {
    try {
      // Never exported: the only strings it sees are the constants parsed below. A host whose trusted-types
      // list leaves the name out lands in the catch, and the write then fails under enforcement, which says so.
      policy = globalThis[POLICY_KEY] || (globalThis[POLICY_KEY] = globalThis.trustedTypes.createPolicy('tickslate', { createHTML: (s) => s }))
    } catch {
      policy = null
    }
  }
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
    tpl.innerHTML = trusted(markup)
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

/** A <style> element for `css`, carrying the configured nonce. Callers append it where it belongs. */
export function styleElement(css, doc = document) {
  const style = doc.createElement('style')
  const nonce = currentConfig().styleNonce
  if (nonce) {
    style.setAttribute('nonce', nonce)
  }
  style.textContent = css
  return style
}

/**
 * Fills a new shadow root: its CSS, then its constant markup. Where there is
 * no real DOM it writes both as one string, as before.
 */
export function mountShadow(root, css, markup) {
  if (!live()) {
    root.innerHTML = `<style>${css}</style>${markup}`
    return
  }
  adoptCSS(root, css)
  root.appendChild(cloneHTML(markup))
}
