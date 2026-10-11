#!/usr/bin/env node
/**
 * Assembles dist-lib/ into a directory that can be published as-is:
 *
 *   npm run release
 *   npm publish ./dist-lib
 *
 * The leading ./ matters: `npm publish dist-lib` makes npm treat the argument
 * as a registry package spec ("dist-lib@*") and fail with E404.
 *
 * Publishing from dist-lib (rather than the repo root) keeps the private dev
 * package.json, the playground and src/ out of the published package.
 */
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'dist-lib')

if (!existsSync(out)) {
  console.error('dist-lib/ not found — run `npm run build:lib` first.')
  process.exit(1)
}

// 1. manifest
const manifest = JSON.parse(await readFile(resolve(root, 'package.lib.json'), 'utf8'))
await writeFile(resolve(out, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')

// 2. docs + licence
for (const f of ['README.md', 'LICENSE', 'CHANGELOG.md']) {
  if (existsSync(resolve(root, f))) await copyFile(resolve(root, f), resolve(out, f))
}

// 3. theme tokens
await copyFile(resolve(root, 'src/themes/tokens.css'), resolve(out, 'tokens.css'))

// 4. type declarations, flattened to sit beside their entry points. The
// elements entry points at the core as '../core/index.js'; at the package
// root that is './index.js'.
const types = [
  ['src/core/index.d.ts', 'index.d.ts'],
  ['src/elements/index.d.ts', 'elements.d.ts'],
]
for (const [from, to] of types) {
  const src = resolve(root, from)
  if (!existsSync(src)) continue
  const text = (await readFile(src, 'utf8')).replace(/(['"])\.\.\/core\/index\.js\1/g, '$1./index.js$1')
  const dest = resolve(out, to)
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(dest, text)
}

console.log('packed dist-lib/ — publish with: npm publish ./dist-lib')
