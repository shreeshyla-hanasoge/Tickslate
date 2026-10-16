// `import type {} from 'tickslate/jsx'` is all a React app adds. The file is compiled under three
// module resolutions by npm run check:types; an `@ts-expect-error` that stops erroring fails it.
import type {} from 'tickslate/jsx'
import type { ReactElement } from 'react'

export const ok: ReactElement = (
  <div>
    <ts-metric size="S" label="Revenue" data={{ value: 1200, format: 'money', delta: 40 }} />
    <ts-card sizes="S Wide" live scrollable className="card" />
    <ts-equity-curve range="1M" />
    <ts-grid editing locked persist="dash" />
    <ts-chart activatable href="/charts" aria-label="Chart" />
  </div>
)

// @ts-expect-error 'Huge' is not a size
export const badSize = <ts-metric size="Huge" />

// @ts-expect-error `valu` is not a key of MetricData
export const badData = <ts-metric data={{ valu: 1 }} />

// @ts-expect-error a tag's attributes are checked: this one does not exist
export const badAttr = <ts-metric sizes="S" />

// @ts-expect-error '5Y' is not a range
export const badRange = <ts-equity-curve range="5Y" />

// @ts-expect-error a grid is not a widget: it has no `size`
export const gridSize = <ts-grid size="S" />
