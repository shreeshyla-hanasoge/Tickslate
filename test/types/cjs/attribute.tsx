// Fix 1: say the entry is an ES module (TypeScript 5.3 and later).
import type {} from 'tickslate/jsx' with { 'resolution-mode': 'import' }

export const ok = <ts-metric size="S" data={{ value: 1 }} />
// @ts-expect-error wrong data key, so the typings did load
export const bad = <ts-metric data={{ valu: 1 }} />
