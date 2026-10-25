// The bar's theme switch: Auto (follows the system), Light (Paper) and Dark
// (Graphite), in that order. The choice is kept in this browser only, and the
// page works the same when storage is blocked.
const KEY = 'tickslate-site-theme'
const ORDER = ['auto', 'light', 'dark']
const NAMES = { auto: 'Auto', light: 'Light', dark: 'Dark' }
const SPOKEN = { auto: 'follows your system', light: 'light', dark: 'dark' }
const root = document.documentElement

function show(theme) {
  for (const button of document.querySelectorAll('[data-site-theme]')) {
    const label = button.querySelector('[data-site-theme-label]')
    if (label) label.textContent = NAMES[theme]
    button.setAttribute('aria-label', `Colour theme: ${SPOKEN[theme]}. Change it`)
  }
}

function set(theme) {
  root.dataset.theme = theme
  try {
    if (theme === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {}
  show(theme)
}

const current = () => (ORDER.includes(root.dataset.theme) ? root.dataset.theme : 'auto')
show(current())
for (const button of document.querySelectorAll('[data-site-theme]')) {
  button.addEventListener('click', () => set(ORDER[(ORDER.indexOf(current()) + 1) % ORDER.length]))
}
