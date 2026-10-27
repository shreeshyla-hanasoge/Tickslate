<script setup lang="ts">
// How this is wired:
// - vite.config.js tells the compiler `ts-*` tags are custom elements (isCustomElement).
// - env.d.ts imports 'tickslate/vue', so vue-tsc checks every tag in this template.
// - `.prop` assigns the DOM property whether or not the element has upgraded yet. Here the
//   elements load first, so a plain `:data` would also work; `.prop` is what keeps a late load
//   (or server rendering) from writing the attribute "[object Object]".
// - `@ts-action` listens for the element event of that name; it bubbles, so the grid hears all tiles.
// - `persist` is a plain attribute: the grid saves and restores its layout in localStorage.
import { ref } from 'vue'
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

const last = ref('No action yet.')
function onAction(event: CustomEvent) {
  const detail = event.detail as { action: string; id?: string }
  last.value = `Last action: ${detail.action} ${detail.id ?? ''}`
}
</script>

<template>
  <h1>Vue</h1>
  <ts-grid persist="vue-vite-example" aria-label="Example dashboard" @ts-action="onAction">
    <ts-today-pnl item="pnl" label="Today's P&L" size="S" :data.prop="pnl" />
    <ts-metric item="signups" label="Signups" size="S" activatable :data.prop="signups" />
    <ts-chart item="revenue" label="Revenue" size="Wide" :data.prop="revenue" />
    <ts-card item="notes" label="Notes" sizes="S Wide M">
      <p>Deploy freeze from Friday.</p>
    </ts-card>
  </ts-grid>
  <p id="last-action" role="status">{{ last }}</p>
</template>
