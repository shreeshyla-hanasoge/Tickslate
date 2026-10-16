import { test, describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'

// RFC 0003 §2.1: every file in src/elements/define/ registers one element and
// is that element's per-widget entry, and src/elements/index.js gathers them
// all. The bundled side of the same promise (a bundle of one entry holds no
// other widget) is checked on the built package, in scripts/verify-package.mjs.

// Only the two methods define() uses, as in registry.test.mjs.
class FakeRegistry {
  constructor() {
    this.map = new Map()
    this.defined = []
  }
  get(tag) {
    return this.map.get(tag)
  }
  define(tag, ctor) {
    this.defined.push(tag)
    this.map.set(tag, ctor)
  }
}

import { NON_WIDGET_DEFINES } from './non-widget-defines.mjs'

const defineDir = new URL('../src/elements/define/', import.meta.url)
const files = (await readdir(defineDir)).filter((n) => n.endsWith('.js')).map((n) => n.slice(0, -'.js'.length)).sort()

// A module's tag is `ts-` and its file name, except where the file is named
// for its class (series-chart.js registers <ts-chart>) or one module registers
// a pair. An exception is one line here.
const TAGS = {
  'series-chart': ['ts-chart'],
  // Modules whose elements are not widgets name their own tags (test/non-widget-defines.mjs).
  ...NON_WIDGET_DEFINES,
}
const tagsOf = (file) => TAGS[file] || [`ts-${file}`]

describe('define modules', () => {
  let registry
  beforeEach(() => {
    registry = new FakeRegistry()
    globalThis.customElements = registry
  })
  afterEach(() => {
    delete globalThis.customElements
  })

  test('there is a define module for each built-in widget', () => {
    for (const file of ['grid', 'card', 'metric', 'series-chart', 'today-pnl', 'equity-curve', 'session-clock', 'table', 'watchlist', 'open-positions']) {
      assert.ok(files.includes(file), `src/elements/define/${file}.js is missing`)
    }
  })

  for (const file of files) {
    test(`define/${file}.js registers exactly ${tagsOf(file).map((t) => `<${t}>`).join(' and ')}`, async () => {
      // A query string makes a fresh module record, so the define() call runs
      // again against this test's registry. Its imports are shared, as in a build.
      const mod = await import(`../src/elements/define/${file}.js?entry=${file}`)
      assert.deepEqual([...registry.defined].sort(), [...tagsOf(file)].sort())
      // What it registers is the class it exports, so an import both registers and types.
      for (const tag of tagsOf(file)) {
        const ctor = registry.get(tag)
        assert.equal(typeof ctor, 'function', `<${tag}> has no class`)
        assert.ok(Object.values(mod).includes(ctor), `define/${file}.js does not export the class it registers for <${tag}>`)
      }
    })
  }

  test('define/*.js modules import with no DOM at all', async () => {
    delete globalThis.customElements
    for (const file of files) {
      await assert.doesNotReject(import(`../src/elements/define/${file}.js?no-dom=${file}`))
    }
  })
})

describe('the all-in entry', () => {
  test('imports every define module', async () => {
    const text = await readFile(new URL('../src/elements/index.js', import.meta.url), 'utf8')
    for (const file of files) {
      assert.ok(text.includes(`'./define/${file}.js'`), `src/elements/index.js does not import ./define/${file}.js`)
    }
  })

  test('registers every element and keeps its export list', async () => {
    const registry = new FakeRegistry()
    globalThis.customElements = registry
    try {
      // The define modules are imported here for the first time without a
      // query string, so this is the one place their define() calls run.
      const mod = await import('../src/elements/index.js')
      assert.deepEqual([...registry.defined].sort(), files.flatMap(tagsOf).sort())
      // The names 0.1.0 exported; later stories add to the list, never remove.
      for (const name of ['version', 'persistLayout', 'TsGrid', 'TsWidget', 'TsCard', 'TsMetric', 'TsChart', 'TsTodayPnl', 'TsEquityCurve', 'TsSessionClock']) {
        assert.ok(name in mod, `tickslate/elements no longer exports ${name}`)
      }
      // The authoring kit (RFC 0003 §3, §3.1): the registration functions and the stable helpers.
      for (const name of ['defineWidget', 'widgetCatalog', 'onCatalogChange', 'linePaths', 'scale', 'escapeHtml']) {
        assert.equal(typeof mod[name], 'function', `tickslate/elements does not export ${name}`)
      }
    } finally {
      delete globalThis.customElements
    }
  })
})
