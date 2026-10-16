// tickslate is an ES module package, so under node16 a CommonJS file may not import its types
// without saying how to read them. This is the error a host sees (TS1541); the two files beside
// this one show the fixes. The library does not change for it: the typings are ES modules on purpose.
// @ts-expect-error TS1541: Type-only import of an ECMAScript module from a CommonJS module must have a 'resolution-mode' attribute
import type {} from 'tickslate/jsx'

export {}
