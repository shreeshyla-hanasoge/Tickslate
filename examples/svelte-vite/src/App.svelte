<script lang="ts">
  // How this is wired (Svelte 5):
  // - env.d.ts imports 'tickslate/svelte', so svelte-check types every ts-* tag in the markup.
  // - Svelte sets a property when the element has one, so `data={...}` passes the object itself.
  //   (Before the elements upgrade it would fall back to an attribute, so main.ts imports them first.)
  // - `on:ts-action` listens for the custom event of that name, and tickslate/svelte types it. It
  //   bubbles, so the grid hears every tile. (Svelte 5's `onts-action` attribute works at runtime
  //   too, but the typings describe the `on:` form.)
  // - `persist` is a plain attribute: the grid saves and restores its layout in localStorage.
  import type { ChartData, MetricData, TodayPnlData } from 'tickslate/elements'

  // Made-up figures.
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

  let last = $state('No action yet.')
  function onAction(event: CustomEvent) {
    const detail = event.detail as { action: string; id?: string }
    last = `Last action: ${detail.action} ${detail.id ?? ''}`
  }
</script>

<h1>Svelte</h1>
<ts-grid persist="svelte-vite-example" aria-label="Example dashboard" on:ts-action={onAction}>
  <ts-today-pnl item="pnl" label="Today's P&L" size="S" data={pnl}></ts-today-pnl>
  <ts-metric item="signups" label="Signups" size="S" activatable data={signups}></ts-metric>
  <ts-chart item="revenue" label="Revenue" size="Wide" data={revenue}></ts-chart>
  <ts-card item="notes" label="Notes" sizes="S Wide M">
    <p>Deploy freeze from Friday.</p>
  </ts-card>
</ts-grid>
<p id="last-action" role="status">{last}</p>
