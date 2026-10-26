// Compiled by npm run check:types under three module resolutions. The `@ts-expect-error` lines
// must stay errors: TypeScript reports an unused one (TS2578), so a type that goes loose fails the run.
import { SIZE_NAMES, WIDGETS, version, createFormatter } from 'tickslate'
import type { SizeName, Layout, LayoutItem } from 'tickslate'

export const first: SizeName = SIZE_NAMES[0]
export const tag: string = WIDGETS.metric.tag
export const v: string = version
export const money: string = createFormatter({ currency: 'USD' }).money(1200)

export const item: LayoutItem = { id: 'revenue', type: 'metric', size: 'S' }
export const layout: Layout = { version: 1, device: 'desktop', profiles: { market: [item], closed: [] } }

// @ts-expect-error 'Huge' is not a size
export const badSize: SizeName = 'Huge'

// @ts-expect-error the core has no export of that name
export { notAThing } from 'tickslate'

// A custom widget's own keys are any string (RFC 0004 §10.2).
import { createMessages as createMessagesForCustomKeys } from 'tickslate'
export const customKey: string = createMessagesForCustomKeys()('acme-mrr.up', { delta: '5%' })
