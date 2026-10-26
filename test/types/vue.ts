// What a Vue template sees: `GlobalComponents` gains every tag. Read here as a component's props,
// the way vue-tsc does. An `@ts-expect-error` that stops erroring fails the run (TS2578).
import type {} from 'tickslate/vue'
import type { GlobalComponents } from 'vue'

type Props<K extends keyof GlobalComponents> = GlobalComponents[K] extends new () => { $props: infer P } ? P : never

export const ok: Props<'ts-metric'> = { size: 'S', label: 'Revenue', data: { value: 1200 }, class: 'tile' }
export const card: Props<'ts-card'> = { sizes: 'S Wide', live: true }
export const grid: Props<'ts-grid'> = {
  editing: true,
  onTsLayoutChange: (e) => {
    const reason: 'move' | 'resize' | 'remove' | 'add' | 'undo' = e.detail.reason
    void reason
  },
}

// @ts-expect-error `valu` is not a key of MetricData
export const badData: Props<'ts-metric'> = { data: { valu: 1 } }

// @ts-expect-error 'Huge' is not a size
export const badSize: Props<'ts-metric'> = { size: 'Huge' }
