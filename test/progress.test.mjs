import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { TsProgress, progressModel } from '../src/elements/progress.js'
import { EN, WIDGETS, createFormatter, createMessages } from '../src/core/index.js'

const fmt = createFormatter({ locale: 'en-US', currency: 'USD', timeZone: 'UTC' })
const ctx = { fmt, t: createMessages(), now: 0, label: 'Daily loss limit' }
const model = (data, variant = 'S') => progressModel(data, variant, ctx)
const limit = (value, extra = {}) => model({ value, target: 10000, mode: 'limit', ...extra })

describe('without a DOM', () => {
  test('the class module loads and declares its contract', () => {
    assert.equal(typeof TsProgress, 'function')
    assert.equal(TsProgress.catalogKey, 'progress')
    assert.equal(TsProgress.emptyText, 'No data yet')
    assert.deepEqual(TsProgress.progressModel({ value: 1, target: 2 }, 'S', ctx), model({ value: 1, target: 2 }))
    assert.deepEqual(TsProgress.viewModel({ value: 1, target: 2 }, 'S', ctx), model({ value: 1, target: 2 }))
  })

  test('the catalog entry is S and Wide, in General, with a description', () => {
    assert.equal(WIDGETS.progress.tag, 'ts-progress')
    assert.equal(WIDGETS.progress.label, 'Progress')
    assert.deepEqual([...WIDGETS.progress.sizes], ['S', 'Wide'])
    assert.equal(WIDGETS.progress.category, 'General')
    assert.equal(WIDGETS.progress.description, EN['widget.progress.description'])
  })

  test('templates and skeletons exist, the bar is a meter, and the styles hold no colours', () => {
    for (const v of ['S', 'Wide']) {
      assert.match(TsProgress.template(v), /role="meter"/)
      assert.match(TsProgress.template(v), /data-k="pct"/)
      assert.match(TsProgress.skeleton(v), /class="sk /)
    }
    assert.match(TsProgress.template('Wide'), /data-k="caption"/)
    assert.doesNotMatch(TsProgress.template('S'), /data-k="caption"/)
    assert.doesNotMatch(TsProgress.styles, /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(/i)
    assert.doesNotMatch(TsProgress.styles, /\b(left|right|margin-left|margin-right|padding-left|padding-right)\s*:/)
    assert.match(TsProgress.styles, /repeating-linear-gradient\([^;]*var\(--ts-loss\)[^;]*color-mix\(/)
  })

  test('dataShape requires value and target', () => {
    const { value, target, ...rest } = TsProgress.dataShape
    assert.equal(value, 'numeric')
    assert.equal(target, 'numeric')
    assert.deepEqual(Object.keys(rest).sort(), ['asOf', 'caption', 'decimals', 'format', 'live', 'mode', 'unit', 'warnAt'])
    assert.ok(Object.values(rest).every((f) => f.optional === true))
  })
})

describe('text and label', () => {
  test('states value, target and percentage', () => {
    const vm = limit(6400)
    assert.equal(vm.text, '6,400 of 10,000 · 64%')
    assert.equal(vm.pct, '64%')
    assert.equal(vm.fill, 0.64)
    assert.equal(vm.state, 'ok')
    assert.equal(vm.ariaLabel, 'Daily loss limit, 6,400 of 10,000, 64%')
  })

  test('the label names the state in words', () => {
    assert.equal(limit(7500).ariaLabel, 'Daily loss limit, 7,500 of 10,000, 75%, near limit')
    assert.equal(limit(12000).ariaLabel, 'Daily loss limit, 12,000 of 10,000, 120%, over limit')
    assert.equal(model({ value: 10000, target: 10000 }).ariaLabel, 'Daily loss limit, 10,000 of 10,000, 100%, goal reached')
    assert.equal(limit(7500).valueText, '7,500 of 10,000, 75%, near limit')
  })

  test('money, percent and unit formats', () => {
    assert.equal(model({ value: 6400, target: 10000, format: 'money' }).text, '$6,400.00 of $10,000.00 · 64%')
    assert.equal(model({ value: 6400, target: 10000, format: 'money', decimals: 0 }).text, '$6,400 of $10,000 · 64%')
    assert.equal(model({ value: 0.82, target: 1, format: 'percent', decimals: 0 }).text, '82% of 100% · 82%')
    assert.equal(model({ value: 3, target: 10, unit: 'minute' }).text, '3 min of 10 min · 30%')
  })

  test('the caption passes through, and a non-string is dropped', () => {
    assert.equal(model({ value: 1, target: 2, caption: 'Resets at 09:15' }).caption, 'Resets at 09:15')
    assert.equal(model({ value: 1, target: 2, caption: 5 }).caption, '')
  })
})

describe('percentage', () => {
  test('rounds half up', () => {
    assert.equal(model({ value: 145, target: 1000 }).pct, '15%')
    assert.equal(model({ value: 144, target: 1000 }).pct, '14%')
    assert.equal(model({ value: 5, target: 1000 }).pct, '1%')
    assert.equal(model({ value: 4, target: 1000 }).pct, '0%')
  })

  test('never reads 100% before the target is met', () => {
    assert.equal(model({ value: 99.6, target: 100 }).pct, '99%')
    assert.equal(model({ value: 9999.99, target: 10000 }).pct, '99%')
    assert.equal(model({ value: 100, target: 100 }).pct, '100%')
  })

  test('a value above the target shows its true percentage and fills the bar', () => {
    const vm = limit(12000)
    assert.equal(vm.pct, '120%')
    assert.equal(vm.fill, 1)
  })

  test('a negative value fills nothing and keeps its sign', () => {
    const vm = limit(-500)
    assert.equal(vm.pct, '−5%')
    assert.equal(vm.fill, 0)
    assert.equal(vm.state, 'ok')
  })
})

describe('states at the edges', () => {
  test('limit mode: below warnAt, at warnAt, just under 100%, at 100%', () => {
    assert.equal(limit(7499).state, 'ok')
    assert.equal(limit(7500).state, 'near')
    assert.equal(limit(9999).state, 'near')
    assert.equal(limit(10000).state, 'over')
    assert.equal(limit(10001).state, 'over')
  })

  test('warnAt is configurable, and a bad one falls back to 0.75', () => {
    assert.equal(limit(5000, { warnAt: 0.5 }).state, 'near')
    assert.equal(limit(4999, { warnAt: 0.5 }).state, 'ok')
    for (const bad of [0, -1, 1.5, 'x', null, NaN]) assert.equal(limit(7000, { warnAt: bad }).state, 'ok', String(bad))
    for (const bad of [0, -1, 1.5, 'x', null, NaN]) assert.equal(limit(7500, { warnAt: bad }).state, 'near', String(bad))
  })

  test('warnAt 1 means near only at the limit itself, which is over', () => {
    assert.equal(limit(9999, { warnAt: 1 }).state, 'ok')
    assert.equal(limit(10000, { warnAt: 1 }).state, 'over')
  })

  test('goal mode is ok until 100%, then done, and ignores warnAt', () => {
    const goal = (value) => model({ value, target: 10000, warnAt: 0.5 })
    assert.equal(goal(9999).state, 'ok')
    assert.equal(goal(10000).state, 'done')
    assert.equal(goal(15000).state, 'done')
    assert.equal(goal(9999).stateText, '')
    assert.equal(goal(10000).stateText, 'goal reached')
  })

  test('an unknown mode is goal', () => {
    assert.equal(model({ value: 10, target: 10, mode: 'banana' }).state, 'done')
  })
})

describe('numeric strings and a missing or bad target', () => {
  test('numeric strings are accepted', () => {
    const vm = model({ value: '6400', target: '10000.00', mode: 'limit' })
    assert.equal(vm.text, '6,400 of 10,000 · 64%')
    assert.equal(vm.state, 'ok')
    assert.equal(model({ value: { toNumber: () => 7500 }, target: 10000, mode: 'limit' }).state, 'near')
  })

  test('no valid target shows dashes, state none and no fill', () => {
    for (const target of [undefined, null, '', 'abc', NaN, 0, -100, '-5', '0']) {
      const vm = model({ value: 50, target, mode: 'limit' })
      assert.equal(vm.state, 'none', String(target))
      assert.equal(vm.pct, '—')
      assert.equal(vm.text, '—')
      assert.equal(vm.fill, 0)
      assert.equal(vm.stateText, '')
      assert.equal(vm.ariaLabel, 'Daily loss limit, no target set')
    }
  })

  test('an inverted target (negative) is no target, even with a negative value', () => {
    const vm = model({ value: -50, target: -100 })
    assert.equal(vm.state, 'none')
    assert.equal(vm.pct, '—')
  })

  test('a missing value is state none too', () => {
    for (const value of [undefined, null, 'abc', NaN]) assert.equal(model({ value, target: 10 }).state, 'none')
  })

  test('data that is not an object does not throw', () => {
    for (const data of [null, undefined, 5, 'x', []]) assert.equal(model(data).state, 'none')
  })
})

describe('the freshness parts', () => {
  test('live and asOf reach the model', () => {
    const vm = model({ value: 1, target: 2, live: true, asOf: Date.UTC(2026, 9, 12, 14, 5) })
    assert.equal(vm.live, true)
    assert.equal(vm.time, '14:05')
  })
})
