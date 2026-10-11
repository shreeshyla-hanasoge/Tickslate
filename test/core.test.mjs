// The suite imports nothing outside src/ and node:*, so it runs on a bare
// checkout with no npm install (same rule as Emberwick).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { version } from '../src/core/index.js'
import { version as elementsVersion } from '../src/elements/index.js'

const manifest = JSON.parse(await readFile(new URL('../package.lib.json', import.meta.url), 'utf8'))

test('core version matches the published manifest', () => {
  assert.equal(version, manifest.version)
})

test('elements entry re-exports the core version', () => {
  assert.equal(elementsVersion, version)
})
