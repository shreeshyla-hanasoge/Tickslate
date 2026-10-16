#!/usr/bin/env node
/**
 * Type-checks the fixtures in test/types/ against the built package, under the
 * three module resolutions a host may use (RFC 0003 §22.3):
 *
 *   npm run release && npm run check:types
 *
 * The fixtures import `tickslate` by name. This script makes
 * test/types/node_modules/tickslate a link to dist-lib/, so TypeScript resolves
 * it as it would an installed package: through "exports" for bundler and node16,
 * and through "typesVersions" for node10. Checking src/ directly would skip the
 * packaging, which is where a missing subpath or a bad path rewrite would show.
 *
 * Each fixture's `@ts-expect-error` lines must keep erroring. TypeScript reports
 * an unused one as TS2578, so a type that goes loose fails here.
 */
import { existsSync } from 'node:fs'
import { mkdir, rm, symlink } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'dist-lib')
const tsc = resolve(root, 'node_modules/typescript/bin/tsc')

if (!existsSync(resolve(dist, 'package.json'))) {
  console.error('dist-lib/ is not built. Run `npm run release` (or build:lib … pack:lib) first.')
  process.exit(1)
}
if (!existsSync(tsc)) {
  console.error('typescript is not installed. Run `npm ci`.')
  process.exit(1)
}

const modules = resolve(root, 'test/types/node_modules')
await mkdir(modules, { recursive: true })
await rm(resolve(modules, 'tickslate'), { recursive: true, force: true })
await symlink(dist, resolve(modules, 'tickslate'), 'dir')

const failed = []
const projects = [
  ['moduleResolution bundler', 'tsconfig.bundler.json'],
  ['moduleResolution node16', 'tsconfig.node16.json'],
  ['moduleResolution node10', 'tsconfig.node10.json'],
  ['exactOptionalPropertyTypes', 'tsconfig.exact.json'],
  ['node16 from a CommonJS package (cjs/)', 'cjs/tsconfig.json'],
]
for (const [label, config] of projects) {
  try {
    execFileSync(process.execPath, [tsc, '-p', resolve(root, 'test/types', config)], { cwd: root, stdio: 'pipe', encoding: 'utf8' })
    console.log(`ok   ${label}`)
  } catch (e) {
    failed.push(label)
    console.error(`FAIL ${label}\n${(e.stdout || '') + (e.stderr || '') || e.message}`)
  }
}
await rm(resolve(modules, 'tickslate'), { recursive: true, force: true })
if (failed.length) {
  console.error(`\ntype fixtures failed under: ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`\ntype fixtures pass in all ${projects.length} projects.`)
