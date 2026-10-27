// The page script of edit-feedback.html, external so a strict Content-Security-Policy can govern the page.
import { setup, calendar, TODAY, TZ } from './data.js'
import { zonedTime } from '/src/core/index.js'

const params = new URLSearchParams(location.search)
window.__events = []
for (const name of ['ts-hint-dismiss', 'ts-profile-change', 'ts-edit-change', 'ts-layout-change']) {
  document.addEventListener(name, (e) => window.__events.push({ type: name, reason: e.detail.reason, profile: e.detail.profile, editing: e.detail.editing, id: e.detail.id }))
}
// Every non-empty thing the status region says, in order, so "once" can be counted.
window.__said = []

await customElements.whenDefined('ts-grid')
await customElements.whenDefined('ts-card')
setup()
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light'
if (params.has('rtl')) document.documentElement.dir = 'rtl'
const g = document.getElementById('g')
if (params.has('w')) document.getElementById('wrap').style.width = `${params.get('w')}px`
if (params.has('locked')) g.setAttribute('locked', '')
if (params.get('toast') === 'off') g.setAttribute('undo-toast', 'off')

const status = g.shadowRoot.querySelector('.sr')
new MutationObserver(() => {
  if (status.textContent) window.__said.push(status.textContent)
}).observe(status, { childList: true, characterData: true, subtree: true })

if (!params.has('implicit') && !params.has('empty')) {
  g.layout = {
    version: 1,
    device: 'desktop',
    profiles: {
      market: [
        { id: 'sales', type: 'card', size: 'Wide' },
        { id: 'notes', type: 'card', size: 'S' },
        { id: 'tasks', type: 'card', size: 'S' },
        { id: 'queue', type: 'card', size: 'Wide' },
        { id: 'alerts', type: 'card', size: 'S' },
      ],
      // Fewer tiles, in another order, so a switch is plain to see.
      closed: [
        { id: 'queue', type: 'card', size: 'Wide' },
        { id: 'tasks', type: 'card', size: 'S' },
        { id: 'notes', type: 'card', size: 'S' },
      ],
      // A third profile, so a kept override can lapse into a different one ('override-ended').
      focus: [
        { id: 'alerts', type: 'card', size: 'M' },
        { id: 'sales', type: 'card', size: 'Wide' },
      ],
    },
  }
}
if (params.has('empty')) {
  for (const el of [...g.children]) el.remove()
  g.layout = { version: 1, device: 'desktop', profiles: { market: [], closed: [] } }
}
if (params.has('strip')) g.setTopStrip(['notes'])

// A pretend clock, so no spec waits for a real close. `at` is a wall time in IST on the fixture's day.
const at = (hhmm) => zonedTime(TODAY, hhmm, TZ)
let pretend = at('15:30')
const started = performance.now()
if (params.has('schedule')) {
  if (params.has('live')) {
    // 400 ms before the close, running at real speed: the grid's own timer crosses it.
    pretend = at('15:45') - 400
    g.clock = () => pretend + (performance.now() - started)
  } else {
    g.clock = () => pretend
  }
  g.schedule = { calendar, market: { sessions: ['nse-fo'], leadMinutes: 15, lagMinutes: 5 } }
}
if (params.has('hint')) g.setAttribute('hint', '')

window.__fx = {
  grid: g,
  // Jump the pretend clock and let the grid look at it, as it does when a hidden tab wakes.
  cross(hhmm, day = TODAY) {
    pretend = zonedTime(day, hhmm, TZ)
    document.dispatchEvent(new Event('visibilitychange'))
  },
}
window.__ready = true
