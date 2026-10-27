/**
 * <ts-progress>: a goal and limit gauge, sizes S · Wide (RFC 0003 §17).
 *
 * `progressModel` is the pure view model; the class is the templates, the
 * stripes and a thin update() that writes text and attributes. The state is
 * said in words (near limit, over limit, goal reached) as well as drawn, and
 * the over-limit bar is striped, so colour is never the only signal.
 */

import { TsWidget, sk, syncedParts, header } from './widget.js'
import { EN, toNumber, toTime } from '../core/index.js'

const isObj = (v) => v !== null && typeof v === 'object'
const str = (v) => (typeof v === 'string' ? v : '')

/**
 * Everything the tile shows, as strings. Never throws on partial data: no
 * valid target (or no value) is state 'none', which shows dashes and no bar.
 */
export function progressModel(data, variant, ctx) {
  const { fmt, t } = ctx
  const d = isObj(data) ? data : {}
  const format = ['money', 'percent', 'duration'].includes(d.format) ? d.format : 'number'
  const decimals = Number.isInteger(d.decimals) && d.decimals >= 0 && d.decimals <= 20 ? d.decimals : undefined
  const unit = str(d.unit)
  const mode = d.mode === 'limit' ? 'limit' : 'goal'
  // A fraction in (0, 1]: 0 would call every value near, and above 1 the
  // warning could never come before 'over'.
  const warn = toNumber(d.warnAt)
  const warnAt = Number.isFinite(warn) && warn > 0 && warn <= 1 ? warn : 0.75

  const show = (n) => {
    const o = { sign: 'negative', decimals }
    switch (format) {
      case 'money':
        return fmt.money(n, o)
      case 'percent':
        return fmt.percent(n, o)
      case 'duration':
{
        // The formatter clamps below zero, so the sign is added here, and only to a figure that is not zero.
        const m = fmt.duration(Math.abs(n))
        return n < 0 && /[1-9]/.test(m) ? `−${m}` : m
      }
      default:
        return unit ? fmt.unit(n, unit, o) : fmt.number(n, o)
    }
  }

  const value = toNumber(d.value)
  const target = toNumber(d.target)
  // A target that formats to zero (1e-9 as "0") would read "3 of 0", so it is no target. It is judged by comparing with how
  // zero formats, never by looking for a digit in the text: a locale may write its digits in Arabic-Indic, Persian or Devanagari.
  const valid = Number.isFinite(value) && Number.isFinite(target) && target > 0 && show(target) !== show(0)
  const label = ctx.label

  const vm = {
    ariaLabel: t('progress.noTarget', { label }),
    label,
    live: d.live === true,
    time: '',
    synced: syncedParts(t),
    text: '—',
    pct: '—',
    fill: 0,
    state: 'none',
    stateText: '',
    valueText: '',
    valueNum: NaN,
    pctNum: 0,
    caption: str(d.caption),
  }
  const asOf = toTime(d.asOf)
  if (Number.isFinite(asOf)) vm.time = fmt.time(asOf)
  if (!valid) return vm

  const ratio = value / target
  // True ratio, rounded half up. The sum is done as value * 100 / target so
  // 145 of 1,000 is exactly 14.5 and not 14.499…, and a tiny epsilon covers
  // what is left. Below the target it never reads 100%, so a gauge that says
  // 100% always means met.
  const exact = (value * 100) / target
  // The same tolerance decides every threshold, so 0.1 + 0.2 against 0.3 is met and 0.21 of 0.28 is at 75%.
  const EPS = 1e-9
  const met = exact >= 100 - EPS
  let whole = Math.floor(exact + 0.5 + EPS)
  if (!met && whole >= 100) whole = 99
  const pct = fmt.percent(whole / 100, { sign: 'negative', decimals: 0 })

  let state = 'ok'
  if (mode === 'limit') state = met ? 'over' : exact >= warnAt * 100 - EPS ? 'near' : 'ok'
  else if (met) state = 'done'
  const stateText = state === 'over' ? t('progress.over') : state === 'near' ? t('progress.near') : state === 'done' ? t('progress.done') : ''

  const shownValue = show(value)
  const shownTarget = show(target)
  const result = t('progress.result', { value: shownValue, target: shownTarget, pct })
  vm.text = t('progress.text', { value: shownValue, target: shownTarget, pct })
  vm.pct = pct
  // Not quite full until the target is met, or 99.97% would draw as a bar that looks like 100%.
  vm.fill = met ? 1 : Math.min(0.999, Math.round(Math.max(0, ratio) * 1000) / 1000)
  vm.state = state
  vm.stateText = stateText
  vm.valueText = stateText ? t('progress.withState', { text: result, state: stateText }) : result
  vm.ariaLabel = t('progress.aria', { label, text: vm.valueText })
  vm.valueNum = value
  vm.pctNum = Math.min(100, Math.max(0, whole))
  return vm
}

const head = header({ dot: true, meta: true })
const bar = `<div class="track" part="bar" role="meter" aria-valuemin="0" aria-valuemax="100" data-k="meter" hidden><div class="bar" data-k="bar"></div></div>`
const state = `<span class="st sm" data-k="state"></span>`

// Variant markup is static; update() fills it.
const TEMPLATES = {
  S: `${head}
<div class="rowb wrap"><span class="big nv" part="value" data-k="pct"></span>${state}</div>
<span class="f1"></span>
${bar}
<span class="sm nv mut wrapt sec" data-k="text"></span>`,
  Wide: `${head}
<div class="rowb"><span class="xbig nv" part="value" data-k="pct"></span>${state}</div>
<span class="f1"></span>
${bar}
<div class="rowb sec"><span class="sm nv mut wrapt f1" data-k="text"></span><span class="sm mut ell" data-k="caption"></span></div>`,
}

// Loading shapes follow each size's layout block for block.
const SKELETONS = {
  S: `${header()}${sk(50, 30)}<span class="f1"></span>${sk(100, 8)}${sk(80, 11)}`,
  Wide: `${header()}${sk(30, 44)}<span class="f1"></span>${sk(100, 8)}${sk(60, 11)}`,
}

export class TsProgress extends TsWidget {
  static catalogKey = 'progress'
  static emptyText = EN['widget.progress.empty']
  // value and target are the two keys that make a gauge; naming them lets a
  // wrong-shape object be explained (RFC 0002 §2.7).
  static dataShape = {
    value: 'numeric',
    target: 'numeric',
    mode: { kind: 'string', optional: true },
    warnAt: { kind: 'number', optional: true },
    format: { kind: 'string', optional: true },
    decimals: { kind: 'number', optional: true },
    unit: { kind: 'string', optional: true },
    caption: { kind: 'string', optional: true },
    asOf: { kind: 'time', optional: true },
    live: { kind: 'boolean', optional: true },
  }

  static styles = `
[hidden] { display: none; }
.nv { white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: clip; unicode-bidi: isolate; }
.sm.wrapt { white-space: normal; overflow-wrap: anywhere; }
.wrap { flex-wrap: wrap; gap: 0 8px; }
/* S is 150px tall and its text can take two lines, so the figure is smaller than a metric's. */
.big { font-size: min(var(--ts-text-3xl, max(26px, 1.625rem)), 15cqi); }
.sm.wrapt { line-height: 1.25; }
/* The words may take their lines even when a reader's spacing makes them taller than the room: they spill into the tile's padding rather than being cut by a shrunk box. */
.sm.wrapt:not(.f1) { flex: none; }
.st { font-weight: 600; min-width: 0; }
.st:empty { display: none; }
/* The fill starts at the inline start, so it grows from the right in a right-to-left page. */
.track { block-size: 8px; border-radius: 4px; background: var(--ts-surface-2); overflow: hidden; flex: none; }
.bar { block-size: 100%; inline-size: var(--w, 0%); border-radius: inherit; background: var(--ts-accent); }
.track.warn .bar { background: var(--ts-warn); }
.track.done .bar { background: var(--ts-profit); }
/* Stripes carry the shortfall for anyone who cannot tell the red from the rest; the second band is the same red thinned into the track. */
.track.over .bar { background: repeating-linear-gradient(135deg, var(--ts-loss) 0 6px, color-mix(in srgb, var(--ts-loss) 45%, var(--ts-surface-2)) 6px 12px); }
@media (forced-colors: active) {
  .track { box-sizing: border-box; border: 1px solid CanvasText; background: ButtonFace; }
  /* Forced colours drops a background image, which the stripes are, unless the bar opts out; only system colours are used. */
  .bar { forced-color-adjust: none; }
  .bar, .track.warn .bar, .track.done .bar { background: Highlight; }
  .track.over .bar { background: repeating-linear-gradient(135deg, Highlight 0 6px, ButtonFace 6px 12px); }
}
`

  static template(variant) {
    return TEMPLATES[variant] || TEMPLATES.Wide
  }

  static skeleton(variant) {
    return SKELETONS[variant] || SKELETONS.Wide
  }

  static progressModel(data, variant, ctx) {
    return progressModel(data, variant, ctx)
  }

  static viewModel(data, variant, ctx) {
    return progressModel(data, variant, ctx)
  }

  update(vm, variant) {
    const text = (k, s) => {
      const el = this.$(`[data-k="${k}"]`)
      if (el && el.textContent !== s) el.textContent = s
      return el
    }
    const attr = (el, name, v) => {
      if (el && el.getAttribute(name) !== v) el.setAttribute(name, v)
    }
    this.$('[data-k="dot"]').toggleAttribute('hidden', !vm.live)
    text('label', vm.label)
    this.$('[data-k="meta"]').toggleAttribute('hidden', !vm.time)
    text('pre', vm.synced.pre)
    text('time', vm.time)
    text('post', vm.synced.post)
    text('pct', vm.pct)
    text('text', vm.text)
    text('state', vm.stateText)
    if (variant === 'Wide') text('caption', vm.caption)
    // Whether the figure rose is no verdict on a gauge, so the flash is neutral.
    this.flash('pct', vm.valueNum, { goodWhen: 'neither' })

    const meter = this.$('[data-k="meter"]')
    meter.toggleAttribute('hidden', vm.state === 'none')
    if (vm.state === 'none') return
    attr(meter, 'class', `track${vm.state === 'near' ? ' warn' : vm.state === 'ok' ? '' : ` ${vm.state}`}`)
    // The tile already carries the full sentence; the meter is named by the label alone so it is not read twice.
    attr(meter, 'aria-label', vm.label)
    attr(meter, 'aria-valuenow', String(vm.pctNum))
    attr(meter, 'aria-valuetext', vm.valueText)
    const bar = this.$('[data-k="bar"]')
    const w = `${Math.round(vm.fill * 1000) / 10}%`
    if (bar.style.getPropertyValue('--w') !== w) bar.style.setProperty('--w', w)
  }
}
