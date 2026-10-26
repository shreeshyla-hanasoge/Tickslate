// Lint for hostile input and the strict-CSP promise (RFC 0004 §8.4). It is deliberately small: it checks the sinks
// that turn a string into markup or code, not style. `npm run lint` is its own CI job.
import noUnsanitized from 'eslint-plugin-no-unsanitized'

const SINKS = {
  'no-unsanitized/property': ['error', { escape: { methods: ['escapeHtml'] } }],
  'no-unsanitized/method': ['error', { escape: { methods: ['escapeHtml'] } }],
}

export default [
  { ignores: ['dist*/**', 'node_modules/**'] },
  {
    // Plain ES modules; no globals are declared because no rule here reads them.
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    // Mirrors the strict-CSP promise of RFC 0003 §14: nothing in the library compiles a string into code.
    rules: { 'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error' },
  },
  {
    // A non-constant innerHTML, outerHTML, insertAdjacentHTML or document.write fails the build.
    files: ['src/elements/**/*.js'],
    plugins: { 'no-unsanitized': noUnsanitized },
    rules: SINKS,
  },
  {
    // The one sink the library has (src/elements/html.js header): module-constant markup parsed once into a
    // <template>, through the `tickslate` Trusted Types policy, plus the writes the node tests' stand-in nodes
    // take where there is no document. The plugin cannot see that the strings reach these lines only from
    // constants, so the file is named here instead of editing it. Any other file with a sink is a finding.
    files: ['src/elements/html.js'],
    rules: { 'no-unsanitized/property': 'off' },
  },
]
