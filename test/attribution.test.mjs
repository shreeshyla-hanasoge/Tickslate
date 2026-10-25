import { test } from 'node:test'
import assert from 'node:assert/strict'
// Imports ../scripts/check-attribution.mjs, outside the "src/ and node:* only" rule. Fine, as
// with manifest.test.mjs: the script uses only node:* modules, so the unit job needs no install.
import { scanMessage, scanCommits, selfTest } from '../scripts/check-attribution.mjs'

test('built-in fixtures agree with the matcher', () => {
  assert.deepEqual(selfTest(), [])
})

test('flags a forbidden trailer with its line number', () => {
  const hits = scanMessage('Subject\n\nBody\n\nCo-Authored-By: Someone <x@y.z>')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].line, 5)
})

test('prose that discusses the rule passes', () => {
  assert.deepEqual(scanMessage('Document the no Co-Authored-By rule in AGENTS.md'), [])
})

test('scanCommits names the offending hash and splits multi-line messages', () => {
  const log = 'aaa111\nClean subject\n\nfine body\n\n\0\nbbb222\nSubject\n\nGenerated with Claude Code\n\0\n'
  const found = scanCommits('base', 'head', () => log)
  assert.equal(found.length, 1)
  assert.equal(found[0].where, 'commit bbb222')
  assert.equal(found[0].text, 'Generated with Claude Code')
})
