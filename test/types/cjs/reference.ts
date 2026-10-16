// Fix 2: a triple-slash types reference, which works on older TypeScript too.
/// <reference types="tickslate/vue" />
import type { GlobalComponents } from 'vue'

type Props = GlobalComponents['ts-metric'] extends new () => { $props: infer P } ? P : never
export const ok: Props = { size: 'S', data: { value: 1 } }
// @ts-expect-error wrong data key, so the typings did load
export const bad: Props = { data: { valu: 1 } }
