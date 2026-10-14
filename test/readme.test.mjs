import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// The README is the front door, so these tests keep it honest: the quick start
// must be the page examples/quickstart.html runs, and every name the docs
// import from 'tickslate' must exist in the shipped types. Only node:fs is
// used, so CI runs this without `npm install`.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const readme = read('README.md')
const example = read('examples/quickstart.html')

const between = (text, name) => {
  const m = text.match(new RegExp(`<!-- ${name} -->\\n([\\s\\S]*?)<!-- /${name} -->`))
  return m ? m[1] : null
}

// A README snippet sits in a fence inside the markers; the example has the raw
// markup between them.
const unfence = (text) => text.replace(/^```\w*\n/, '').replace(/\n```\n?$/, '\n')

const snippet = unfence(between(readme, 'quickstart') ?? '')

describe('the quick start', () => {
  test('is marked in both files', () => {
    assert.ok(snippet, 'README.md needs <!-- quickstart --> and <!-- /quickstart --> around the snippet')
    assert.ok(between(example, 'quickstart'), 'examples/quickstart.html needs the same markers')
  })

  test('the example runs the README snippet exactly', () => {
    // vite.config.js aliases the package names for the dev server, so the page
    // needs no different import and the two can't quietly drift.
    assert.match(snippet, /from 'tickslate\/elements'/)
    assert.equal(between(example, 'quickstart'), snippet)
  })

  test('is 12 lines or fewer, in implicit mode, with the three generic widgets and one persistLayout call', () => {
    const lines = snippet.trim().split('\n')
    assert.ok(lines.length <= 12, `the quick start is ${lines.length} lines`)
    for (const tag of ['ts-metric', 'ts-chart', 'ts-card']) assert.match(snippet, new RegExp(`<${tag}[\\s>]`), tag)
    assert.equal(snippet.match(/persistLayout\(/g).length, 1)
    assert.doesNotMatch(snippet, /\.layout\s*=/, 'implicit mode: no layout JSON')
  })

})

// Names exported by the types a consumer gets: the core, and the elements
// entry with the files it re-exports.
function exportedNames(path, seen = new Set()) {
  if (seen.has(path)) return new Set()
  seen.add(path)
  const src = read(path)
  const names = new Set()
  for (const m of src.matchAll(/^export (?:declare )?(?:abstract )?(?:function|class|const|let|var|interface|type|enum) (\w+)/gm)) names.add(m[1])
  for (const m of src.matchAll(/^export (?:type )?\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()
      if (name) names.add(name)
    }
  }
  const dir = path.slice(0, path.lastIndexOf('/') + 1)
  for (const m of src.matchAll(/^export \* from '\.\/(\w+)\.js'/gm)) {
    for (const n of exportedNames(`${dir}${m[1]}.d.ts`, seen)) names.add(n)
  }
  return names
}

const coreNames = exportedNames('src/core/index.d.ts')
const elementNames = exportedNames('src/elements/index.d.ts')

const DOCS = [
  'README.md',
  'docs/guide/saving-layouts.md',
  'docs/guide/server-templates.md',
  'docs/guide/bring-your-own-chart.md',
  ...readdirSync(new URL('../docs/guide/frameworks/', import.meta.url)).map((f) => `docs/guide/frameworks/${f}`),
]

// Every `import { a, b } from 'tickslate…'` inside a code block, with the
// CDN form (a jsDelivr URL for the elements file) counted as the elements entry.
function importsOf(markdown) {
  const out = []
  const blocks = markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)
  for (const [, code] of blocks) {
    const matches = code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g)
    for (const [, list, from] of matches) {
      let entry = null
      if (from === 'tickslate') entry = coreNames
      else if (from === 'tickslate/elements' || /^https:\/\/cdn\.jsdelivr\.net\/npm\/tickslate@[\d.]+\/elements\.js$/.test(from)) entry = elementNames
      if (!entry) continue
      const names = list.split(',').map((s) => s.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '')).filter(Boolean)
      out.push({ from, names, entry })
    }
  }
  return out
}

describe('names in the docs', () => {
  test('the type files export what the checks below rely on', () => {
    assert.ok(coreNames.has('readLayout') && coreNames.has('configure'))
    assert.ok(elementNames.has('persistLayout') && elementNames.has('TsGrid') && elementNames.has('TsCard'))
  })

  for (const path of DOCS) {
    test(`${path}: every tickslate import exists in the types`, () => {
      const imports = importsOf(read(path))
      for (const { from, names, entry } of imports) {
        for (const name of names) assert.ok(entry.has(name), `${path} imports ${name} from '${from}', which the types don't export`)
      }
    })
  }

  test('the README imports something from the elements entry', () => {
    assert.ok(importsOf(readme).some((i) => i.names.includes('persistLayout')))
  })

  test('the README no longer carries the pre-release banner', () => {
    assert.doesNotMatch(readme, /Nothing usable has shipped/)
  })
})
