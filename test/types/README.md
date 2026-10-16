# Type fixtures

Compiled by `npm run check:types` against the built `dist-lib/` (run `npm run release` first), which links it as `test/types/node_modules/tickslate`. Each `@ts-expect-error` must keep erroring: TypeScript reports an unused one (TS2578), so a type that goes loose fails the run.

| Project | Checks |
|---|---|
| `tsconfig.bundler.json`, `tsconfig.node16.json`, `tsconfig.node10.json` | Every fixture here under each module resolution (node10 finds the entries through `typesVersions`) |
| `tsconfig.exact.json` | `exact.tsx` under `exactOptionalPropertyTypes` |
| `cjs/tsconfig.json` | A host whose `package.json` has no `"type": "module"`, under node16 |

## A CommonJS host on node16 (TS1541)

`tickslate` is an ES module package, so under `moduleResolution: node16` a CommonJS file (a package without `"type": "module"`) that writes

```ts
import type {} from 'tickslate/jsx'
```

gets TS1541, "Type-only import of an ECMAScript module from a CommonJS module must have a 'resolution-mode' attribute". The library does not change for this. Either fix works, and `cjs/` compiles both:

```ts
import type {} from 'tickslate/jsx' with { 'resolution-mode': 'import' }   // TypeScript 5.3 and later
/// <reference types="tickslate/jsx" />                                     // any version
```
