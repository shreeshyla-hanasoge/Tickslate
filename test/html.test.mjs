import { test, describe, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { SIZE_NAMES, configure } from '../src/core/index.js'

// RFC 0003 §14: strict CSP and Trusted Types. Importing nothing but src/ and
// node:*, so this runs without a browser; the real-browser half lives in
// test/browser/csp.spec.mjs and tt.spec.mjs.

// ── A stand-in DOM, just enough for html.js ──────────────────────────────

class Node {
  constructor(tag) {
    this.tag = tag
    this.children = []
    this.attrs = new Map()
    this.props = {}
    this.style = { props: {}, setProperty: (k, v) => { this.style.props[k] = v } }
    this.adoptedStyleSheets = []
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v))
  }
  appendChild(n) {
    this.children.push(n)
    return n
  }
  replaceChildren(...nodes) {
    this.children = []
    for (const n of nodes) {
      if (n.tag === '#fragment') this.children.push(...n.children)
      else this.children.push(n)
    }
  }
  set textContent(v) {
    this.text = v
  }
}

function install({ trustedTypes, sheets = true } = {}) {
  const log = { templates: 0, policies: [], created: [], sheets: [] }
  globalThis.document = {
    createElement(tag) {
      const n = new Node(tag)
      if (tag === 'template') {
        log.templates++
        n.content = {}
        Object.defineProperty(n, 'innerHTML', {
          set(v) {
            n.markup = v
            n.content = { markup: v }
          },
        })
      }
      return n
    },
    importNode(content) {
      return Object.assign(new Node('#fragment'), { markup: content.markup })
    },
    createDocumentFragment: () => new Node('#fragment'),
    createTextNode: (text) => Object.assign(new Node('#text'), { text }),
  }
  if (trustedTypes) {
    globalThis.trustedTypes = {
      createPolicy(name, rules) {
        log.policies.push(name)
        return { createHTML: (s) => { log.created.push(s); return { trusted: rules.createHTML(s) } } }
      },
    }
  }
  if (sheets) {
    globalThis.CSSStyleSheet = class {
      replaceSync(css) {
        this.css = css
        log.sheets.push(css)
      }
    }
  }
  return log
}

afterEach(() => {
  delete globalThis.document
  delete globalThis.trustedTypes
  delete globalThis.CSSStyleSheet
  configure({ styleNonce: '' })
})

let fresh = 0
const load = () => import(`../src/elements/html.js?html-test-${++fresh}`)

describe('the Trusted Types policy', () => {
  test('importing html.js creates no policy and touches no DOM', async () => {
    const log = install({ trustedTypes: true })
    await load()
    assert.deepEqual(log.policies, [])
    assert.equal(log.templates, 0)
  })

  test('the first markup write creates one policy, named tickslate', async () => {
    const log = install({ trustedTypes: true })
    const { setHTML } = await load()
    const host = new Node('div')
    setHTML(host, '<b>one</b>')
    setHTML(host, '<i>two</i>')
    assert.deepEqual(log.policies, ['tickslate'])
  })

  test('only the constant markup strings pass through it, once each however often they are cloned', async () => {
    const log = install({ trustedTypes: true })
    const { setHTML } = await load()
    const host = new Node('div')
    for (let i = 0; i < 5; i++) setHTML(host, '<b>one</b>')
    setHTML(host, '<i>two</i>', 3)
    assert.deepEqual(log.created, ['<b>one</b>', '<i>two</i>'])
    assert.equal(log.templates, 2, 'each string is parsed into one template')
    assert.equal(host.children.length, 3, 'and cloned per use')
  })

  test('without Trusted Types the markup is written as it is', async () => {
    const log = install()
    const { setHTML } = await load()
    const host = new Node('div')
    setHTML(host, '<b>one</b>')
    assert.equal(log.policies.length, 0)
    assert.equal(host.children[0].markup, '<b>one</b>')
  })

  test('a page whose trusted-types list leaves the name out gets a warning and no raw string at a sink', async () => {
    const log = install()
    const warns = []
    const warn = console.warn
    console.warn = (m) => warns.push(m)
    try {
      for (const list of ['other', "'none'"]) {
        globalThis.trustedTypes = {
          createPolicy() {
            throw new TypeError(`Policy "tickslate" disallowed by ${list}`)
          },
        }
        const { setHTML } = await load()
        const host = new Node('div')
        assert.doesNotThrow(() => setHTML(host, '<b>one</b>'))
        assert.equal(host.children[0].markup, undefined, 'the string is not offered to the sink')
      }
    } finally {
      console.warn = warn
    }
    assert.equal(log.templates, 2)
    assert.equal(warns.length >= 1, true)
    assert.match(warns[0], /trusted-types directive does not allow the 'tickslate' policy/)
  })

  test('the policy is reachable from nowhere: no global, no registered symbol, no exported string-to-HTML helper', async () => {
    install({ trustedTypes: true })
    const mod = await load()
    mod.setHTML(new Node('div'), '<b>one</b>')
    assert.equal(globalThis[Symbol.for('tickslate.trustedTypes')], undefined)
    for (const name of Object.keys(mod)) assert.doesNotMatch(name, /policy|trusted|createHTML/i)
    assert.deepEqual(Object.getOwnPropertySymbols(globalThis).filter((k) => /tickslate/i.test(String(k.description))), [])
  })

  test('a second copy asks for its own policy, which a page without allow-duplicates refuses', async () => {
    const log = install({ trustedTypes: true })
    const a = await load()
    const b = await load()
    a.setHTML(new Node('div'), '<b>a</b>')
    b.setHTML(new Node('div'), '<b>b</b>')
    assert.deepEqual(log.policies, ['tickslate', 'tickslate'])
  })
})

describe('data never becomes markup', () => {
  test('setNodes builds elements, with positions through element.style and no style attribute', async () => {
    install({ trustedTypes: true })
    const { setNodes } = await load()
    const host = new Node('div')
    setNodes(host, [{ tag: 'i', attrs: { class: 'tk b' }, css: { 'inset-inline-start': '3.9%' } }])
    const [tick] = host.children
    assert.equal(tick.tag, 'i')
    assert.equal(tick.attrs.get('class'), 'tk b')
    assert.equal(tick.style.props['inset-inline-start'], '3.9%')
    assert.equal(tick.attrs.has('style'), false)
  })

  test('a label that looks like markup stays text', async () => {
    const log = install({ trustedTypes: true })
    const { setNodes, setText } = await load()
    const host = new Node('div')
    setNodes(host, [{ tag: 'a', attrs: { href: '/x' }, text: '<img src=x onerror=alert(1)>' }])
    assert.equal(host.children[0].text, '<img src=x onerror=alert(1)>')
    setText(host, '<b>')
    assert.equal(host.text, '<b>')
    assert.deepEqual(log.created, [], 'nothing was parsed')
  })
})

describe('adopted sheets', () => {
  test('one sheet per CSS source, adopted by every root', async () => {
    const log = install()
    const { adoptCSS } = await load()
    const a = new Node('root')
    const b = new Node('root')
    adoptCSS(a, '.a{}')
    adoptCSS(b, '.a{}')
    adoptCSS(b, '.b{}')
    assert.deepEqual(log.sheets, ['.a{}', '.b{}'])
    assert.equal(a.adoptedStyleSheets[0], b.adoptedStyleSheets[0])
    assert.equal(b.adoptedStyleSheets.length, 2)
    assert.equal(a.children.length, 0, 'no <style> element where sheets work')
  })

  test('without constructable sheets a <style> element is the fallback, with the configured nonce', async () => {
    install({ sheets: false })
    configure({ styleNonce: 'abc123' })
    const { adoptCSS } = await load()
    const root = new Node('root')
    adoptCSS(root, '.a{}')
    const [style] = root.children
    assert.equal(style.tag, 'style')
    assert.equal(style.attrs.get('nonce'), 'abc123')
    assert.equal(style.text, '.a{}')
  })

  test('and without a nonce configured it carries none', async () => {
    install({ sheets: false })
    const { adoptCSS } = await load()
    const root = new Node('root')
    adoptCSS(root, '.a{}')
    assert.equal(root.children[0].attrs.has('nonce'), false)
  })

  test('a nonce configured later reaches the fallback <style> elements already made, and they are inserted again', async () => {
    install({ sheets: false })
    const { adoptCSS } = await load()
    const root = new Node('root')
    const log = []
    root.appendChild = (n) => {
      n.parentNode = root
      n.nextSibling = null
      n.remove = () => log.push('remove')
      root.insertBefore = (m) => log.push('insert')
      root.children.push(n)
    }
    adoptCSS(root, '.a{}')
    const style = root.children[0]
    style.getAttribute = (k) => style.attrs.get(k) ?? null
    assert.equal(style.attrs.has('nonce'), false)
    configure({ styleNonce: 'late' })
    assert.equal(style.attrs.get('nonce'), 'late')
    assert.deepEqual(log, ['remove', 'insert'])
  })

  test('a root with no adoptedStyleSheets (an older engine) takes the fallback too', async () => {
    install()
    const { adoptCSS } = await load()
    const root = new Node('root')
    delete root.adoptedStyleSheets
    adoptCSS(root, '.a{}')
    assert.equal(root.children[0].tag, 'style')
  })
})

// ── Templates and sources ────────────────────────────────────────────────

describe('templates are pure functions of the variant', () => {
  test('every built-in widget returns the same string on every call, with no data and no inline style', async () => {
    const elements = await import('../src/elements/index.js')
    const classes = Object.entries(elements).filter(([name, v]) => name.startsWith('Ts') && typeof v === 'function' && typeof v.template === 'function' && v !== elements.TsWidget)
    assert.ok(classes.length >= 9, 'the scan found the widgets')
    for (const [name, Ctor] of classes) {
      for (const variant of SIZE_NAMES) {
        const first = Ctor.template(variant)
        assert.equal(typeof first, 'string', name)
        assert.equal(Ctor.template(variant), first, `${name} ${variant} is stable`)
        assert.doesNotMatch(first, /\sstyle\s*=/, `${name} ${variant} has no style attribute`)
        assert.doesNotMatch(first, /\bon[a-z]+\s*=/i, `${name} ${variant} has no event handler attribute`)
        if (typeof Ctor.skeleton === 'function') {
          assert.equal(Ctor.skeleton(variant), Ctor.skeleton(variant), `${name} ${variant} skeleton is stable`)
        }
      }
    }
  })
})

describe('the sources', () => {
  async function sources() {
    const out = []
    const walk = async (dir) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
        if (entry.isDirectory()) await walk(url)
        else if (entry.name.endsWith('.js')) out.push([url.pathname.split('/src/')[1], await readFile(url, 'utf8')])
      }
    }
    await walk(new URL('../src/', import.meta.url))
    return out
  }

  // Comments explain these rules, so they are stripped before the scan.
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  test('markup is written in html.js alone', async () => {
    for (const [file, source] of await sources()) {
      if (file === 'elements/html.js') continue
      assert.doesNotMatch(code(source), /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write|createContextualFragment|DOMParser|\.srcdoc/, file)
    }
  })

  test('no inline style attribute is written, as markup or with setAttribute', async () => {
    for (const [file, source] of await sources()) {
      // html.js writes one only in the string it hands a DOM-less test double, never to a browser.
      if (file === 'elements/html.js') continue
      assert.doesNotMatch(code(source), /\sstyle="|setAttribute\(\s*['"]style['"]|\.cssText/, file)
    }
  })

  test('nothing evaluates a string', async () => {
    for (const [file, source] of await sources()) {
      assert.doesNotMatch(code(source), /\beval\s*\(|new Function\s*\(|set(Timeout|Interval)\(\s*['"`]/, file)
    }
  })

  test('a <style> element is only ever made in html.js', async () => {
    for (const [file, source] of await sources()) {
      if (file === 'elements/html.js') continue
      assert.doesNotMatch(code(source), /createElement\(\s*['"]style['"]/, file)
    }
  })
})
