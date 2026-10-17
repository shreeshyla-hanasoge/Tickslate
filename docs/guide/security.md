# Strict CSP and Trusted Types

Tickslate needs no exception to your Content Security Policy and no default
Trusted Types policy. It renders styled, constructs and edits under both of
these:

```
Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'
Content-Security-Policy: require-trusted-types-for 'script'; trusted-types tickslate
```

The only thing to add is the policy name `tickslate` to your `trusted-types`
list. Nothing else changes: no `'unsafe-inline'`, no `'unsafe-eval'`, no
`'unsafe-hashes'`.

## Styles

Each widget class, the grid, the picker and the grid controls keep their CSS in
one constructed `CSSStyleSheet`, built the first time that class is used and
adopted by every instance's shadow root (`adoptedStyleSheets`). No template
carries a `style` attribute. Positions that depend on data, such as the session
clock's ticks or a chart's selectable points, are set through `element.style`,
the CSSOM, which `style-src` doesn't block.

The page still needs the `--ts-*` tokens. Link `tickslate/tokens.css` as a
stylesheet from your own origin. If you don't, Tickslate adds its defaults as an
adopted sheet on the document.

### Safari below 16.4

Constructable stylesheets arrived in Safari 16.4. Below that, Tickslate puts a
`<style>` element in each shadow root, and a strict `style-src` blocks it unless
it carries your nonce. Give it the nonce once, before any widget is created:

```js
import { configure } from 'tickslate'

configure({ styleNonce: document.querySelector('meta[name="csp-nonce"]').content })
```

with a policy such as `style-src 'self' 'nonce-<the same value>'`. Where sheets
work, the nonce is never used.

Order: widgets written in your HTML are upgraded as soon as `tickslate/elements`
evaluates, which is before a later script's `configure()`. A `<style>` that was
made without the nonce is blocked, so `configure({ styleNonce })` puts the nonce
on every fallback `<style>` already made and inserts it again. Still, call
`configure` as early as you can, and before the elements load if your bundler
allows it. Without it, a strict policy on a browser below
16.4 leaves widgets unstyled, so 16.4 is the supported floor for strict CSP.

## Trusted Types

The one place Tickslate turns a string into DOM is `src/elements/html.js`. It
creates a policy named `tickslate` the first time markup is written (never when
the module is imported, and not at all in a browser without Trusted Types), and
only module constant strings pass through it:

- Each widget template is a pure function of its size variant. It is parsed once
  into a `<template>` and cloned for every instance.
- Everything that depends on data, such as a heading link's `href` and label, a
  chart's points or the clock's ticks, is built with `createElement`,
  `setAttribute`, `textContent` and `element.style`. Data never becomes markup.
- A tile's `href` is checked for its scheme and set as an attribute, so it
  can't carry script.
- There is no `eval`, `new Function` or string timer anywhere in the library.

The policy lives in module scope. It is not stored on `window`, under a
registered symbol or behind any exported helper, because anything a script
could call to turn a string into `TrustedHTML` would bypass your own policy.

If your `trusted-types` list leaves `tickslate` out (or is `'none'`), the policy
can't be created. Tickslate then writes no markup, development builds warn once
that the directive does not allow the `tickslate` policy, and the grid, picker and
widgets can't render. Add the name rather than a default policy.

Use one copy of Tickslate per page. A second copy (the ES modules and the CDN
bundle together, say) asks for the same policy name again, and the browser
refuses that unless the directive also lists `'allow-duplicates'`:
`trusted-types tickslate 'allow-duplicates'`.

## Checking it on your own page

Collect the violations the browser reports, then open every widget and edit a
grid:

```js
document.addEventListener('securitypolicyviolation', (e) => {
  console.error(e.violatedDirective, e.blockedURI, e.sample)
})
```

Tickslate's own test suite does this with real browsers: `test/browser/csp.spec.mjs`
and `test/browser/tt.spec.mjs` serve `test/browser/fixtures/csp.html` with the
headers above and fail on any violation. The fixture is also served with
`default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'`, since it
has no inline script and needs nothing else. (The first policy listed uses
`default-src 'self'`, which is looser for images and fonts than `'none'`.)
