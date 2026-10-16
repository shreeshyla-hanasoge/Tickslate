/**
 * The framework typings (src/types/*.d.ts) are types only (RFC 0003 §22.1): a bundler or Node that
 * follows an import of react, vue or svelte out of one of them would load the framework. This lists
 * the imports that could. A separate module so pack-lib, which runs on import, and a test can share it.
 */
const FRAMEWORKS = /^(react|vue|svelte|@vue\/)/

/**
 * The imports and re-exports of a framework in `text` that are not wholly type-only: a side-effect
 * import (`import 'react'`), a plain `import … from` or `export … from`, and one whose every
 * specifier is inline-typed (`import { type X } from 'react'`, which still loads the module under
 * verbatimModuleSyntax). `import type …` and `export type …` are fine.
 */
export function runtimeFrameworkImports(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const found = []
  for (const m of code.matchAll(/^\s*(?:import|export)\b((?:(?!\b(?:import|export)\b)[^;'"])*?)\bfrom\s*(['"])([^'"]+)\2|^\s*import\s*(['"])([^'"]+)\4/gm)) {
    const clause = (m[1] || '').trim()
    const spec = m[3] || m[5]
    if (!FRAMEWORKS.test(spec) || /^type\b/.test(clause)) continue
    found.push(spec)
  }
  return found
}
