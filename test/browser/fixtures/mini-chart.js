// The module the mini-chart fixture loads (external, so a strict CSP allows it). It records what the real Emberwick is
// asked to do, so the spec can say "a tick was one update" about the library itself rather than about a stand-in.
import '/src/elements/define/mini-chart.js'
import * as emberwick from 'emberwick'
import { setup, dataFor, frozenClock, miniBars, miniProfile } from './data.js'

setup()
document.documentElement.dataset.theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'

const calls = []
const charts = new Set()
for (const name of ['setData', 'update', 'append', 'setTheme', 'setCountdown', 'resize', 'destroy']) {
  const original = emberwick.Chart.prototype[name]
  emberwick.Chart.prototype[name] = function (...args) {
    charts.add(this)
    calls.push(name)
    return original.apply(this, args)
  }
}

for (const el of document.querySelectorAll('ts-mini-chart')) el.clock = frozenClock

window.__mc = {
  calls,
  charts,
  dataFor,
  miniBars,
  miniProfile,
  count: (name) => calls.filter((c) => c === name).length,
  nextFrame: () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
}
window.__ready = true
