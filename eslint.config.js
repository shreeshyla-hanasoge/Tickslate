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
    // Plain ES modules. The browser globals are declared because no-implied-eval only sees setTimeout('…') and
    // window.setTimeout('…') when it knows those names are the globals.
    files: ['src/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { window: 'readonly', self: 'readonly', globalThis: 'readonly', document: 'readonly', setTimeout: 'readonly', setInterval: 'readonly' },
    },
    // Mirrors the strict-CSP promise of RFC 0003 §14: nothing in the library compiles a string into code.
    rules: { 'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error' },
  },
  {
    // A non-constant innerHTML, outerHTML, insertAdjacentHTML or document.write fails the build. The plugin matches
    // the property names it knows, so the sinks it cannot see (a computed key, an iframe's srcdoc, the parser entry
    // points, write on any document) are named as syntax, and nothing in src/elements uses any of them.
    files: ['src/elements/**/*.{js,mjs}'],
    plugins: { 'no-unsanitized': noUnsanitized },
    rules: {
      ...SINKS,
      'no-restricted-syntax': [
        'error',
        { selector: "AssignmentExpression[left.property.name='srcdoc']", message: 'srcdoc turns a string into a document.' },
        { selector: "AssignmentExpression[left.computed=true][left.property.value=/^(innerHTML|outerHTML|srcdoc)$/]", message: 'A computed innerHTML, outerHTML or srcdoc write hides a markup sink from the lint rules.' },
        { selector: "CallExpression[callee.property.name=/^(write|writeln|parseHTMLUnsafe)$/]", message: 'write, writeln and parseHTMLUnsafe turn a string into markup.' },
        { selector: "CallExpression[callee.property.value=/^(write|writeln|parseHTMLUnsafe|setHTMLUnsafe|insertAdjacentHTML)$/]", message: 'A computed markup sink hides it from the lint rules.' },
      ],
    },
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
