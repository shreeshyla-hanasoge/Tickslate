// svelte-check reads `svelteHTML.IntrinsicElements` for every tag in a template; this reads the
// same entries directly. An `@ts-expect-error` that stops erroring fails the run (TS2578).
import type {} from 'tickslate/svelte'

type Props<K extends keyof svelteHTML.IntrinsicElements> = svelteHTML.IntrinsicElements[K]

export const ok: Props<'ts-metric'> = {
  size: 'S',
  data: { value: 1200 },
  class: 'tile',
  'data-id': 'revenue',
  'on:ts-action': (e) => {
    const action: string = e.detail.action
    // @ts-expect-error the event is typed, not `any`: an action name is a string
    const wrong: number = e.detail.action
    void [action, wrong]
  },
}
export const equity: Props<'ts-equity-curve'> = { range: '1M' }

// @ts-expect-error `valu` is not a key of MetricData
export const badData: Props<'ts-metric'> = { data: { valu: 1 } }

// @ts-expect-error '5Y' is not a range
export const badRange: Props<'ts-equity-curve'> = { range: '5Y' }
