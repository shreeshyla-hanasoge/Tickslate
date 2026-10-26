import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SIZES, SIZE_NAMES, activeProfile, createCalendar, createMessages, nextProfileChange, presets, zonedTime } from '../src/core/index.js'
import { BADGE_HOLD_MS, DEFAULT_MOTION_MS, badgeText, createBadgeLife, createHintState, hintKey, parseMs, planSwitch, profileName } from '../src/elements/grid-feedback.js'

// The pure half of RFC 0004 §3: what the badge says and when it goes, the hint's states, and which
// profile changes crossfade and offer Keep. The grid draws them; test/browser/edit-feedback.spec.mjs shows it.

const t = createMessages(null, 'en')

/** A fake clock: timers run when `advance` passes their time, in order. */
function fakeTimers() {
  let now = 0
  let next = 1
  const pending = new Map()
  return {
    set(fn, ms) {
      const id = next++
      pending.set(id, { at: now + ms, fn })
      return id
    },
    clear(id) {
      pending.delete(id)
    },
    advance(ms) {
      const to = now + ms
      for (;;) {
        const due = [...pending].filter(([, p]) => p.at <= to).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        pending.delete(due[0])
        now = due[1].at
        due[1].fn()
      }
      now = to
    },
    get waiting() {
      return pending.size
    },
  }
}

describe('the size badge text', () => {
  test('reads the name and the footprint for every size', () => {
    const expected = { S: 'Small · 1×1', Wide: 'Wide · 2×1', Tall: 'Tall · 1×2', M: 'Medium · 2×2', L: 'Large · 3×2', Banner: 'Banner · 4×1', XL: 'Extra large · 4×2' }
    assert.deepEqual([...SIZE_NAMES].sort(), Object.keys(expected).sort())
    for (const size of SIZE_NAMES) assert.equal(badgeText(t, size), expected[size], size)
  })

  test('is the nominal footprint, not the two columns a phone draws a Large in', () => {
    assert.equal(SIZES.L.cols, 3)
    assert.equal(badgeText(t, 'L'), 'Large · 3×2')
  })

  test('takes its words from the messages, so a locale or an override rewords it', () => {
    const custom = createMessages({ 'grid.badge': '{cols}×{rows} {name}', 'size.M': 'Mid' }, 'en')
    assert.equal(badgeText(custom, 'M'), '2×2 Mid')
  })

  test('says an unknown size as it is rather than inventing a footprint', () => {
    assert.equal(badgeText(t, 'Huge'), 'Huge')
    assert.equal(badgeText(t, 'toString'), 'toString')
  })
})

describe('the badge life', () => {
  const setup = () => {
    const timers = fakeTimers()
    const log = []
    const life = createBadgeLife(
      { show: (tile, text) => log.push(`show ${tile} ${text}`), fade: (tile) => log.push(`fade ${tile}`), hide: (tile) => log.push(`hide ${tile}`) },
      timers,
    )
    return { timers, log, life }
  }

  test('is created on the first show and updates while the size changes under the pointer', () => {
    const { life, log } = setup()
    life.show('a', 'Small · 1×1')
    life.show('a', 'Wide · 2×1')
    assert.deepEqual(log, ['show a Small · 1×1', 'show a Wide · 2×1'])
    assert.equal(life.tile, 'a')
  })

  test('waits 1,000 ms after the last release before it fades', () => {
    const { life, log, timers } = setup()
    life.show('a', 'Medium · 2×2')
    life.release()
    timers.advance(BADGE_HOLD_MS - 1)
    assert.deepEqual(log, ['show a Medium · 2×2'])
    timers.advance(1)
    assert.deepEqual(log, ['show a Medium · 2×2', 'fade a'])
    assert.equal(life.tile, null)
    assert.equal(timers.waiting, 0)
  })

  test('the last key press decides: each release restarts the second', () => {
    const { life, log, timers } = setup()
    life.show('a', 'Small · 1×1')
    life.release()
    timers.advance(600)
    life.show('a', 'Wide · 2×1')
    life.release()
    timers.advance(600)
    assert.ok(!log.includes('fade a'), 'a second key press kept it up')
    timers.advance(400)
    assert.equal(log.filter((l) => l === 'fade a').length, 1)
  })

  test('a new gesture on the tile cancels the pending fade', () => {
    const { life, log, timers } = setup()
    life.show('a', 'Small · 1×1')
    life.release()
    timers.advance(900)
    life.show('a', 'Wide · 2×1')
    timers.advance(5000)
    assert.ok(!log.includes('fade a'), 'held while the pointer is down')
  })

  test('a second tile takes the badge over at once', () => {
    const { life, log } = setup()
    life.show('a', 'Small · 1×1')
    life.show('b', 'Wide · 2×1')
    assert.deepEqual(log, ['show a Small · 1×1', 'hide a', 'show b Wide · 2×1'])
  })

  test('clear removes it now and leaves no timer, as a cancelled gesture or a disconnect does', () => {
    const { life, log, timers } = setup()
    life.show('a', 'Small · 1×1')
    life.release()
    life.clear()
    assert.deepEqual(log, ['show a Small · 1×1', 'hide a'])
    assert.equal(timers.waiting, 0)
    life.clear()
    assert.equal(log.length, 2, 'clearing nothing does nothing')
  })

  test('a release with no badge does nothing', () => {
    const { life, timers } = setup()
    life.release()
    assert.equal(timers.waiting, 0)
  })

  test('the grid builds it per chrome as a decorative part and fades it with the animation API only when motion is welcome', () => {
    const source = readFileSync(new URL('../src/elements/grid.js', import.meta.url), 'utf8')
    assert.match(source, /<span class="badge" part="badge" aria-hidden="true" hidden><\/span>/)
    const fade = /_badgeFade\(id\) \{[\s\S]*?\n  \}/.exec(source)[0]
    assert.match(fade, /if \(!this\._motion\(\) \|\| typeof el\.animate !== 'function'\) return this\._badgeHide\(id\)/)
    assert.doesNotMatch(source, /class="badge"[^>]*aria-live/)
  })
})

describe('the hint state', () => {
  const shown = () => {
    const h = createHintState()
    h.attribute(true)
    h.eligible(true)
    return h
  }

  test('shows for a populated, unlocked grid with the attribute', () => {
    assert.equal(shown().visible, true)
  })

  test('does not show without the attribute, or when the grid is locked, empty, editing or hidden', () => {
    const h = createHintState()
    h.eligible(true)
    assert.equal(h.visible, false, 'no attribute')
    h.attribute(true)
    assert.equal(h.visible, true)
    h.eligible(false)
    assert.equal(h.visible, false, 'not eligible')
  })

  test('Got it hides it and reports "dismiss", once', () => {
    const h = shown()
    assert.equal(h.dismiss(), 'dismiss')
    assert.equal(h.visible, false)
    assert.equal(h.dismiss(), null)
  })

  test('edit mode hides it and reports "edit", once', () => {
    const h = shown()
    assert.equal(h.edit(), 'edit')
    assert.equal(h.visible, false)
    assert.equal(h.edit(), null)
    assert.equal(h.dismiss(), null, 'one event only')
  })

  test('stays hidden while the host leaves the attribute on, however often the grid becomes eligible again', () => {
    const h = shown()
    h.dismiss()
    h.eligible(false)
    h.eligible(true)
    h.attribute(true)
    assert.equal(h.visible, false)
  })

  test('is shown again when the attribute is removed and set', () => {
    const h = shown()
    h.edit()
    h.attribute(false)
    assert.equal(h.visible, false)
    h.attribute(true)
    assert.equal(h.visible, true)
  })

  test('removing the attribute reports nothing and dismissing with it off does nothing', () => {
    const h = createHintState()
    assert.equal(h.dismiss(), null)
    assert.equal(h.edit(), null)
    h.attribute(true)
    h.attribute(false)
    assert.equal(h.dismiss(), null)
  })

  test('the wording follows the pointer: touch for a coarse one', () => {
    assert.equal(t(hintKey(true)), 'Touch and hold a tile to rearrange your dashboard')
    assert.equal(t(hintKey(false)), 'Press and hold a tile, or choose Edit layout, to rearrange your dashboard')
    assert.equal(t('grid.hintDismiss'), 'Got it')
  })

  test('the library writes no storage, and builds its card from a constant', () => {
    const grid = readFileSync(new URL('../src/elements/grid.js', import.meta.url), 'utf8')
    const hint = grid.slice(grid.indexOf('// ── The first-run hint'), grid.indexOf('// ── The resize badge'))
    const source = hint + readFileSync(new URL('../src/elements/grid-feedback.js', import.meta.url), 'utf8')
    assert.ok(hint.length > 500, 'found the hint code')
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|indexedDB/)
    assert.match(grid, /const COACH_HTML = '/)
    assert.match(hint, /setHTML\(el, COACH_HTML\)/)
    assert.match(hint, /coach\.el\.style\.insetInlineStart = /)
    assert.doesNotMatch(grid, /setAttribute\('style'/)
  })
})

describe('which profile changes get a calm switch and a toast', () => {
  test('a scheduled change crossfades and offers Keep', () => {
    assert.deepEqual(planSwitch({ reason: 'schedule' }), { crossfade: true, toast: true })
  })

  test('a lapsing override crossfades and offers nothing, since the user already chose', () => {
    assert.deepEqual(planSwitch({ reason: 'override-ended' }), { crossfade: true, toast: false })
  })

  test('a user\'s own override applies at once', () => {
    assert.deepEqual(planSwitch({ reason: 'override' }), { crossfade: false, toast: false })
  })

  test('the first render and a quiet change (load, a new schedule or clock) apply at once', () => {
    assert.deepEqual(planSwitch({ reason: 'schedule', quiet: true }), { crossfade: false, toast: false })
    assert.deepEqual(planSwitch({ reason: 'schedule', rendered: false }), { crossfade: false, toast: false })
  })

  test('the toast words, with the built-in profiles by their names and others by their own', () => {
    assert.equal(profileName(t, 'closed'), 'After close')
    assert.equal(profileName(t, 'market'), 'Market hours')
    assert.equal(profileName(t, 'pre-open'), 'pre-open')
    assert.equal(t('grid.profileSwitched', { profile: profileName(t, 'closed') }), 'Switched to After close')
    assert.equal(t('grid.keepProfile', { previous: profileName(t, 'market') }), 'Keep Market hours')
    assert.equal(t('grid.keptProfile', { profile: profileName(t, 'market') }), 'Keeping Market hours until the next change.')
    assert.equal(t('grid.profile', { profile: profileName(t, 'closed') }), 'Showing the After close layout.')
  })

  test('half of --ts-motion is each way of the fade, read from a CSS time, with 220 ms as the default', () => {
    assert.equal(parseMs('220ms'), 220)
    assert.equal(parseMs(' .3s '), 300)
    assert.equal(parseMs('0.22s'), 220)
    assert.equal(parseMs('0ms'), 0)
    assert.equal(parseMs(''), DEFAULT_MOTION_MS)
    assert.equal(parseMs('var(--x)'), DEFAULT_MOTION_MS)
    assert.equal(parseMs('fast', 90), 90)
  })
})

describe('keeping the previous profile until the next change (Decision 47), with a fake clock', () => {
  const cal = createCalendar({ sessions: [presets.nse()] })
  const ist = (date, hhmm) => zonedTime(date, hhmm, 'Asia/Kolkata')
  const schedule = { market: { sessions: ['nse'], leadMinutes: 15, lagMinutes: 5 } }

  // The grid's own rule, from override() and _reschedule(): the kept profile lasts to the next scheduled change.
  const keep = (previous, now) => ({ profile: previous, until: nextProfileChange(cal, schedule, now) ?? Infinity })
  const shownAt = (kept, now) => (kept && now < kept.until ? kept.profile : activeProfile(cal, schedule, now))

  test('Keep at the close holds Market hours until the schedule next changes, then the schedule takes over', () => {
    const closeAt = ist('2026-10-12', '15:35')
    assert.equal(activeProfile(cal, schedule, closeAt - 1), 'market')
    assert.equal(activeProfile(cal, schedule, closeAt), 'closed')
    const kept = keep('market', closeAt)
    const nextOpen = ist('2026-10-13', '09:00')
    assert.equal(kept.until, nextOpen, 'the next change is tomorrow\'s open')
    assert.equal(shownAt(kept, closeAt), 'market')
    assert.equal(shownAt(kept, closeAt + 6 * 3600 * 1000), 'market', 'still held in the evening')
    assert.equal(shownAt(kept, nextOpen - 1), 'market')
    assert.equal(shownAt(kept, nextOpen), 'market', 'the schedule agrees at the open, so the override ends without a switch')
  })

  test('Keep never becomes a permanent lock: it ends at the next change, which the grid reports as override-ended', () => {
    const openAt = ist('2026-10-12', '09:00')
    const kept = keep('closed', openAt)
    assert.equal(shownAt(kept, openAt), 'closed')
    assert.equal(kept.until, ist('2026-10-12', '15:35'))
    assert.equal(shownAt(kept, kept.until), 'closed', 'at the close the schedule is closed again')
    assert.equal(shownAt(kept, ist('2026-10-12', '12:00')), 'closed', 'held through the session')
    assert.equal(planSwitch({ reason: 'override-ended' }).toast, false)
  })
})
