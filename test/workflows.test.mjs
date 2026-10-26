// The supply-chain rules of RFC 0004 §8.5 and §8.6, read from the workflow files as text so the suite stays
// install-free (no YAML parser): every action is pinned to a commit, every workflow declares its permissions, and
// the release workflow can only be started by hand.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

const dir = new URL('../.github/workflows/', import.meta.url)
const workflows = readdirSync(dir).filter((f) => f.endsWith('.yml')).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')])

test('there are workflows to check', () => {
  assert.ok(workflows.length >= 5)
})

test('every action is pinned to a 40-character commit with its tag in a comment', () => {
  for (const [file, text] of workflows) {
    for (const m of text.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)) {
      assert.match(m[1], /^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/, `${file}: ${m[0].trim()}`)
      assert.match(m[2], /^\s+#\s*v\d/, `${file}: ${m[0].trim()} has no tag comment`)
    }
  }
})

test('every workflow declares permissions at the top', () => {
  for (const [file, text] of workflows) assert.match(text, /^permissions:/m, file)
})

test('release.yml is workflow_dispatch only, dry-run by default, behind the npm-release environment', () => {
  const text = readFileSync(new URL('release.yml', dir), 'utf8')
  const on = text.slice(text.search(/^on:/m), text.search(/^permissions:/m))
  assert.match(on, /^ {2}workflow_dispatch:/m)
  assert.doesNotMatch(on, /^ {2}(push|pull_request|pull_request_target|release|schedule|workflow_run|create):/m)
  assert.match(on, /dry-run:[\s\S]*type: boolean[\s\S]*default: true/)
  assert.match(text, /environment: npm-release/)
  assert.match(text, /npm publish \.\/dist-lib --provenance/)
  assert.match(text, /github\.ref == 'refs\/heads\/master'/)
  assert.doesNotMatch(text, /git tag|git push|gh release|--tag/)
})

test('dependabot watches npm and github-actions weekly', () => {
  const text = readFileSync(new URL('../.github/dependabot.yml', import.meta.url), 'utf8')
  for (const eco of ['npm', 'github-actions']) assert.match(text, new RegExp(`package-ecosystem: ${eco}\\n\\s+directory: /\\n\\s+schedule:\\n\\s+interval: weekly`))
})
