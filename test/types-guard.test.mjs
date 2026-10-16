import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { runtimeFrameworkImports } from '../scripts/types-guard.mjs'

// pack-lib's guard that the framework typings (RFC 0003 §22.1) import react, vue and svelte for
// types only. Like manifest.test.mjs it imports a script that uses only node:* modules.

test('lets type-only imports and re-exports through', () => {
  assert.deepEqual(runtimeFrameworkImports(`import type { A } from 'react'\nimport type B from "vue"\nexport type { C } from 'svelte'\nexport {}\n`), [])
  assert.deepEqual(runtimeFrameworkImports(`import type {\n  A,\n  B,\n} from 'react'\n`), [])
  assert.deepEqual(runtimeFrameworkImports(`import type { T } from './common.js'\nimport { x } from './local.js'\n`), [])
})

test('catches a plain import, a re-export, a side-effect import and an inline-typed one', () => {
  assert.deepEqual(runtimeFrameworkImports(`import { A } from 'react'\n`), ['react'])
  assert.deepEqual(runtimeFrameworkImports(`import R from "react"\n`), ['react'])
  assert.deepEqual(runtimeFrameworkImports(`import * as V from 'vue'\n`), ['vue'])
  assert.deepEqual(runtimeFrameworkImports(`export { A } from 'svelte/store'\n`), ['svelte/store'])
  assert.deepEqual(runtimeFrameworkImports(`import 'react'\n`), ['react'])
  assert.deepEqual(runtimeFrameworkImports(`import "vue"\n`), ['vue'])
  assert.deepEqual(runtimeFrameworkImports(`import { type A } from 'react'\n`), ['react'])
  assert.deepEqual(runtimeFrameworkImports(`import { type A, type B } from 'vue'\n`), ['vue'])
  assert.deepEqual(runtimeFrameworkImports(`import {\n  type A,\n} from 'react'\n`), ['react'])
})

test('is not fooled by comments, or by a type import that follows a statement without a semicolon', () => {
  assert.deepEqual(runtimeFrameworkImports(`// import { A } from 'react'\n/* import 'vue' */\nimport type { A } from 'react'\n`), [])
  assert.deepEqual(runtimeFrameworkImports(`export {}\n\nimport type { A } from 'react'\n`), [])
})

test('the shipped typings pass', () => {
  const dir = new URL('../src/types/', import.meta.url)
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.d.ts'))) assert.deepEqual(runtimeFrameworkImports(readFileSync(new URL(f, dir), 'utf8')), [], f)
})
