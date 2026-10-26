import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The visual baselines are only valid from one Playwright image, so the image
// tag in CI and in `npm run test:visual:update` must equal the exact version of
// @playwright/test in package.json. Reads files only, so it needs no install.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const pkg = JSON.parse(read('package.json'))
const version = pkg.devDependencies['@playwright/test']

test('@playwright/test is pinned without a range', () => assert.match(version, /^\d+\.\d+\.\d+$/))
test('the CI visual job uses the matching image', () => assert.ok(read('.github/workflows/ci.yml').includes(`mcr.microsoft.com/playwright:v${version}-noble`)))
test('test:visual:update uses the matching image', () => assert.ok(pkg.scripts['test:visual:update'].includes(`mcr.microsoft.com/playwright:v${version}-noble`)))
