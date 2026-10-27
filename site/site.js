// Shared by the landing page and the docs: the theme switch, Copy buttons on
// code, and the docs menu, which is a disclosure on phones only.
import './theme.js'

const status = () => document.getElementById('copy-status')

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {}
  // Plain http, or a browser that blocks the async clipboard: the old command.
  const box = Object.assign(document.createElement('textarea'), { value: text, readOnly: true })
  box.style.cssText = 'position: fixed; opacity: 0'
  document.body.append(box)
  box.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch {}
  box.remove()
  return ok
}

function wireCopy(button, source) {
  button.addEventListener('click', async () => {
    const ok = await copyText(source().textContent)
    button.textContent = ok ? 'Copied' : 'Select and copy'
    const s = status()
    if (s) s.textContent = ok ? 'Copied to the clipboard.' : 'Copying was blocked. Select the code and copy it.'
    setTimeout(() => {
      button.textContent = 'Copy'
      if (s) s.textContent = ''
    }, 2000)
  })
}

for (const button of document.querySelectorAll('[data-copy]')) {
  wireCopy(button, () => document.getElementById(button.dataset.copy))
}

// Docs pages: a Copy button on every code block, and one status line for them.
const prose = document.querySelector('.docs-main')
if (prose) {
  const s = Object.assign(document.createElement('p'), { id: 'copy-status', className: 'sr-only' })
  s.setAttribute('role', 'status')
  prose.append(s)
  for (const pre of prose.querySelectorAll('pre')) {
    const wrap = document.createElement('div')
    wrap.className = 'code'
    pre.replaceWith(wrap)
    wrap.append(pre)
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'copy', textContent: 'Copy' })
    if (pre.dataset.lang) button.setAttribute('aria-label', `Copy the ${pre.dataset.lang} code`)
    wrap.append(button)
    wireCopy(button, () => pre)
  }
}

// The docs menu is open on wide screens and folded on phones, where it would
// otherwise push the page below the fold.
const side = document.querySelector('[data-docs-side]')
if (side) {
  const narrow = matchMedia('(max-width: 899px)')
  const fit = () => { side.open = !narrow.matches }
  fit()
  narrow.addEventListener('change', fit)
}
