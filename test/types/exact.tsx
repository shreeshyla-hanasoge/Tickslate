// Under exactOptionalPropertyTypes an optional prop does not accept `undefined` unless it says so,
// and a React component passing `label={maybeLabel}` hits that constantly. Compiled alone by
// tsconfig.exact.json.
import type {} from 'tickslate/jsx'

declare const maybeLabel: string | undefined
declare const maybeData: { value: number } | undefined

export const ok = (
  <>
    <ts-metric size={undefined} label={maybeLabel} data={maybeData} href={undefined} activatable={undefined} />
    <ts-card sizes={undefined} live={undefined} />
    <ts-equity-curve range={undefined} />
    <ts-grid editing={undefined} persist={maybeLabel} />
  </>
)
