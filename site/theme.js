// One theme for the whole site. The bar's switch cycles Auto (follows the
// system), Light (Paper) and Dark (Graphite), writes data-theme on <html>, and
// keeps the choice in this browser; the page works the same when storage is
// blocked. Pages with theme buttons of their own (`data-theme-pick`, on the
// playground and the generic example) stay in step both ways: their buttons
// show the site's choice on load, and pressing one becomes the site's choice.
const KEY = 'tickslate-site-theme'
const ORDER = ['auto', 'light', 'dark']
const NAMES = { auto: 'Auto', light: 'Light', dark: 'Dark' }
const SPOKEN = { auto: 'follows your system', light: 'light', dark: 'dark' }
const root = document.documentElement

const current = () => (ORDER.includes(root.dataset.theme) ? root.dataset.theme : 'auto')

function show(theme) {
  for (const button of document.querySelectorAll('[data-site-theme]')) {
    const label = button.querySelector('[data-site-theme-label]')
    if (label) label.textContent = NAMES[theme]
    button.setAttribute('aria-label', `Colour theme: ${SPOKEN[theme]}. Change it`)
  }
  for (const pick of document.querySelectorAll('[data-theme-pick]')) pick.setAttribute('aria-pressed', String(pick.dataset.themePick === theme))
}

function remember(theme) {
  try {
    if (theme === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {}
}

function set(theme) {
  root.dataset.theme = theme
  remember(theme)
  show(theme)
}

show(current())
for (const button of document.querySelectorAll('[data-site-theme]')) {
  button.addEventListener('click', () => set(ORDER[(ORDER.indexOf(current()) + 1) % ORDER.length]))
}
// On the document, so the page's own handler has already set data-theme.
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element) || !e.target.closest('[data-theme-pick]')) return
  remember(current())
  show(current())
})
