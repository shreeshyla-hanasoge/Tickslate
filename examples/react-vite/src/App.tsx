// How this is wired (React 19):
// - `import type {} from 'tickslate/jsx'` types every ts-* tag, so a wrong `data` key or a
//   misspelt attribute fails `npm run build` (tsc). It adds no code to the bundle.
// - React 19 sets a property when the element has one, so `data={...}` passes the object itself,
//   not "[object Object]". (React 18 sets attributes only: assign `ref.current.data` in an effect.)
// - React 19 also binds custom events by their own name behind an `on` prefix, so
//   `onts-action={...}` listens for `ts-action`. JSX does not type-check hyphenated props, hence
//   the explicit event type in the handler.
// - `persist` is a plain attribute: the grid saves and restores its layout in localStorage.
import type {} from 'tickslate/jsx'
import { useState } from 'react'
import type { ChartData, MetricData, TodayPnlData } from 'tickslate/elements'

// Made-up figures. Declared outside the component so each render hands the tile the same object
// (a fresh literal on every render would re-render the tile every time).
const pnl: TodayPnlData = { net: 412.5, realized: 380, unrealized: 32.5, fees: 9.75, closedCount: 6, openCount: 2 }
const signups: MetricData = { value: 1204, previous: 1075, compareLabel: 'vs last week' }
const revenue: ChartData = {
  series: [
    {
      name: 'Revenue',
      points: [
        { x: '2026-09-01', y: 11800 },
        { x: '2026-09-02', y: 12400 },
        { x: '2026-09-03', y: 12100 },
        { x: '2026-09-04', y: 13050 },
        { x: '2026-09-05', y: 12750 },
        { x: '2026-09-06', y: 13600 },
      ],
    },
  ],
}

export function App() {
  const [last, setLast] = useState('No action yet.')
  // ts-action bubbles from every tile, so one listener on the grid hears them all.
  const onAction = (event: Event) => {
    const detail = (event as CustomEvent).detail as { action: string; id?: string }
    setLast(`Last action: ${detail.action} ${detail.id ?? ''}`)
  }

  return (
    <>
      <h1>React</h1>
      <ts-grid persist="react-vite-example" aria-label="Example dashboard" onts-action={onAction}>
        <ts-today-pnl item="pnl" label="Today's P&L" size="S" data={pnl} />
        <ts-metric item="signups" label="Signups" size="S" activatable data={signups} />
        <ts-chart item="revenue" label="Revenue" size="Wide" data={revenue} />
        <ts-card item="notes" label="Notes" sizes="S Wide M">
          <p>Deploy freeze from Friday.</p>
        </ts-card>
      </ts-grid>
      <p id="last-action" role="status">{last}</p>
    </>
  )
}
