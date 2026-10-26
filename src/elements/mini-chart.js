/**
 * <ts-mini-chart>: a small candlestick chart with marks and a candle-close
 * countdown, drawn by Emberwick (RFC 0004 §6, amending RFC 0001 §8.5.9).
 *
 * Emberwick is an optional peer. This module imports nothing from it when it
 * loads: the first render that has bars calls `import('emberwick')` (Decision
 * 56), and a missing or unresolvable peer is the widget's error view with one
 * development warning, never an exception that stops the page (Decision 55).
 * `tickslate/elements` never imports this file, so a host that does not use
 * the widget never installs, loads or pays for Emberwick.
 *
 * What needs thinking about is pure and lives in four functions that need
 * neither a DOM nor Emberwick: miniChartModel (data → strings and normalised
 * bars), diffBars (which Emberwick call a new list of bars needs),
 * emberwickTheme (--ts-* tokens → Emberwick's theme) and the controller's
 * decisions, which a test drives with a fake Emberwick. The element hands the
 * results to Emberwick and to the DOM its template built.
 */

import { TsWidget, sk, header, arrowFor, figure, FIGURE_CSS } from './widget.js'
import { setNodes } from './html.js'
import { DEV, warnOnce } from './dev.js'
import { EN, toNumber, toTime } from '../core/index.js'

/**
 * The two dynamic imports, kept together so a test can replace them with a
 * fake Emberwick. Literal specifiers on purpose: a bundler must see them to
 * treat them as the host's own dependency. Emberwick is external to every
 * Tickslate build, so neither is ever inlined.
 */
export const peers = {
  chart: () => import('emberwick'),
  profiles: () => import('emberwick/profiles'),
}

// Appends applied one by one before a longer list counts as a bulk load (a made-up figure; a candle close is one).
export const MAX_APPEND = 10

const FONT_TOKEN = '--ts-font-num'
// Attributes that change what --ts-* resolves to (RFC 0004 §6.4), on <html> and on the nearest <ts-grid>.
export const THEME_ATTRS = ['data-theme', 'class', 'data-ts-theme', 'data-ts-palette']

// ── The diff (pure) ───────────────────────────────────────────────────────

const sameBar = (a, b) => a.time === b.time && a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close && a.volume === b.volume

/**
 * Which Emberwick call turns `prev` into `next` with the least work.
 *
 *   none  identical
 *   ops   the last bar changed (one update) and/or bars were added after it
 *         (one append each, at most `maxAppend`): the usual tick, and a candle closing
 *   set   anything else: an earlier bar changed, bars removed or out of order,
 *         a bulk load, or no `prev` (a different instrument or timeframe passes null)
 */
export function diffBars(prev, next, o) {
  const maxAppend = o && Number.isFinite(o.maxAppend) ? o.maxAppend : MAX_APPEND
  if (!prev) return { kind: 'set', bars: next }
  const p = prev.length
  const n = next.length
  if (n < p) return { kind: 'set', bars: next }
  if (p === 0) return n === 0 ? { kind: 'none' } : { kind: 'set', bars: next }
  for (let i = 0; i < p - 1; i++) if (!sameBar(prev[i], next[i])) return { kind: 'set', bars: next }
  const ops = []
  if (!sameBar(prev[p - 1], next[p - 1])) {
    // A different time at the old last position is a different candle, not a tick on this one.
    if (prev[p - 1].time !== next[p - 1].time) return { kind: 'set', bars: next }
    ops.push({ op: 'update', bar: next[p - 1] })
  }
  if (n - p > maxAppend) return { kind: 'set', bars: next }
  // Emberwick drops an append that is not newer than its last bar, so an out-of-order list is a reload.
  for (let i = p; i < n; i++) {
    if (next[i].time <= next[i - 1].time) return { kind: 'set', bars: next }
    ops.push({ op: 'append', bar: next[i] })
  }
  return ops.length ? { kind: 'ops', ops } : { kind: 'none' }
}

// ── The theme mapping (pure) ──────────────────────────────────────────────

const RGB = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+)(%?))?\s*\)$/

/** `rgb(r, g, b)` at `a` of its own opacity. A colour that is not in that form is returned as it came. */
function withAlpha(color, a) {
  if (a >= 1) return color
  const m = RGB.exec(color)
  if (!m) return color
  const own = m[4] === undefined ? 1 : Number(m[4]) / (m[5] ? 100 : 1)
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${Math.round(a * own * 1000) / 1000})`
}

/**
 * Emberwick's theme from the widget's tokens. `read(token)` returns the token as
 * an opaque `rgb()` string (or the raw font list for --ts-font-num, or '' when
 * the token is unset, which leaves Emberwick's own default). Translucent keys are
 * the opaque colour with an alpha applied here, never a colour read back from a
 * translucent pixel, which a browser un-premultiplies with a loss.
 */
export function emberwickTheme(read) {
  const c = (token) => {
    const v = read(token)
    return typeof v === 'string' ? v : ''
  }
  const surface = c('--ts-surface')
  const ink = c('--ts-ink')
  const muted = c('--ts-muted')
  const line = c('--ts-line')
  const profit = c('--ts-profit')
  const loss = c('--ts-loss')
  const accent = c('--ts-accent')
  const font = c(FONT_TOKEN)
  const entries = {
    background: surface,
    grid: line,
    axisLine: c('--ts-axis'),
    text: muted,
    textStrong: ink,
    labelBg: ink,
    labelText: surface,
    tagText: surface,
    up: profit,
    wickUp: profit,
    upFill: profit,
    down: loss,
    wickDown: loss,
    downFill: loss,
    volumeUp: profit && withAlpha(profit, 0.4),
    volumeDown: loss && withAlpha(loss, 0.4),
    crosshair: muted,
    watermark: line && withAlpha(line, 0.4),
    font: font && `11px ${font}`,
    profileFill: accent && withAlpha(accent, 0.25),
    profileValueArea: accent && withAlpha(accent, 0.45),
    profilePoc: accent,
    // Emberwick's own fallback is `text`, which is this same colour.
    profileVaLine: muted,
  }
  const theme = {}
  for (const key of Object.keys(entries)) if (entries[key]) theme[key] = entries[key]
  // A mini chart's axes are narrower than Emberwick's defaults (68 and 26).
  theme.priceAxisWidth = 56
  theme.timeAxisHeight = 22
  return theme
}

// ── The model (pure) ──────────────────────────────────────────────────────

const MARK_SHAPE = { entry: 'circle', exit: 'diamond' }
const MAX_TIMEFRAMES = 12

function readBars(raw) {
  const out = []
  let dropped = 0
  for (const b of Array.isArray(raw) ? raw : []) {
    const time = b ? toTime(b.time) : NaN
    const open = b ? toNumber(b.open) : NaN
    const high = b ? toNumber(b.high) : NaN
    const low = b ? toNumber(b.low) : NaN
    const close = b ? toNumber(b.close) : NaN
    if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
      dropped++
      continue
    }
    const bar = { time, open, high, low, close }
    const volume = b.volume === undefined || b.volume === null ? NaN : toNumber(b.volume)
    if (Number.isFinite(volume)) bar.volume = volume
    out.push(bar)
  }
  // Emberwick wants ascending, de-duplicated bars; a later bar at the same time replaces the earlier one.
  out.sort((a, b) => a.time - b.time)
  const unique = []
  for (const bar of out) {
    if (unique.length && unique[unique.length - 1].time === bar.time) unique[unique.length - 1] = bar
    else unique.push(bar)
  }
  return { bars: unique, dropped }
}

function readMarks(raw) {
  const marks = []
  let dropped = 0
  for (const m of Array.isArray(raw) ? raw : []) {
    const time = m ? toTime(m.t) : NaN
    const kind = m && (m.kind === 'entry' || m.kind === 'exit') ? m.kind : null
    if (!Number.isFinite(time) || !kind) {
      dropped++
      continue
    }
    const mark = { time, kind, shape: MARK_SHAPE[kind] }
    if (typeof m.label === 'string' && m.label) mark.text = m.label
    marks.push(mark)
  }
  return { marks, dropped }
}

/**
 * data, variant → everything the element needs. M and L show `charts[0]`, XL the
 * first two. Per chart: normalised bars and marks (unreadable ones dropped and
 * counted), the header strings, the timeframe buttons and the `summary` the
 * wrapper is named with.
 */
export function miniChartModel(data, variant, ctx) {
  const { fmt, t } = ctx
  const d = data && typeof data === 'object' ? data : {}
  const v = variant === 'L' || variant === 'XL' ? variant : 'M'
  const shown = (Array.isArray(d.charts) ? d.charts : []).slice(0, v === 'XL' ? 2 : 1)
  let dropped = 0

  const charts = shown.map((c, index) => {
    const chart = c && typeof c === 'object' ? c : {}
    const { bars, dropped: badBars } = readBars(chart.bars)
    const { marks, dropped: badMarks } = readMarks(chart.marks)
    dropped += badBars + badMarks
    const instrument = typeof chart.instrument === 'string' ? chart.instrument : ''
    const timeframe = typeof chart.timeframe === 'string' ? chart.timeframe : ''
    const id = typeof chart.id === 'string' ? chart.id : String(index)
    const last = bars.length ? bars[bars.length - 1].close : null
    const lastText = last === null ? '' : fmt.price(last)

    // The figure carries its sign; the word carries it for a listener (ACCESSIBILITY item 15).
    const pct = chart.changePct === undefined || chart.changePct === null ? NaN : toNumber(chart.changePct)
    const hasChange = Number.isFinite(pct)
    const changeText = hasChange ? fmt.percent(pct) : ''
    const changeArrow = arrowFor(changeText)
    const changeTone = changeArrow === '▲' ? 'pos' : changeArrow === '▼' ? 'neg' : ''
    const changeWord = !hasChange
      ? ''
      : changeArrow === '▲'
        ? t('miniChart.up', { pct: fmt.percent(pct, { sign: 'negative' }) })
        : changeArrow === '▼'
          ? t('miniChart.down', { pct: fmt.percent(-pct, { sign: 'negative' }) })
          : t('miniChart.flat')

    const entries = marks.filter((m) => m.kind === 'entry').length
    const exits = marks.length - entries
    const kinds = [entries ? t('miniChart.entries', {}, entries) : '', exits ? t('miniChart.exits', {}, exits) : ''].filter(Boolean)
    const marksText = kinds.length === 2 ? t('miniChart.pair', { a: kinds[0], b: kinds[1] }) : kinds[0] || ''

    let summary
    if (!bars.length) summary = t('miniChart.summaryEmpty', { instrument })
    else {
      const head = timeframe ? t('miniChart.head', { instrument, timeframe }) : instrument
      const details = [t('miniChart.last', { close: lastText }), changeWord, t('miniChart.bars', {}, bars.length), marksText]
        .filter(Boolean)
        .reduce((a, b) => t('miniChart.join', { head: a, tail: b }))
      summary = t('miniChart.summary', { head, details })
    }

    const frames = []
    if (v === 'L' && index === 0 && Array.isArray(chart.timeframes)) {
      for (const f of chart.timeframes) if (typeof f === 'string' && f && !frames.includes(f) && frames.length < MAX_TIMEFRAMES) frames.push(f)
    }

    return {
      id,
      instrument,
      timeframe,
      bars,
      marks,
      // A different instrument or timeframe is a different series: the diff starts again from nothing.
      key: JSON.stringify([id, instrument, timeframe]),
      last,
      lastText,
      changeText,
      changeArrow,
      changeTone,
      marksCount: t('miniChart.marks', {}, marks.length),
      note: typeof chart.note === 'string' ? chart.note : '',
      timeframes: frames.map((value) => ({ value, on: value === timeframe })),
      // The host's own ProfileData, passed through untouched (Decision 76); only the L chart draws one.
      profile: v === 'L' && index === 0 && d.volumeProfile && typeof d.volumeProfile === 'object' ? d.volumeProfile : null,
      summary,
    }
  })

  return {
    variant: v,
    charts,
    countdown: d.countdown === true,
    timeZone: fmt.timeZone,
    dropped,
    ariaLabel: charts.length ? charts.map((c) => c.summary).reduce((a, b) => t('miniChart.join', { head: a, tail: b })) : '',
    live: d.live === true,
  }
}

// ── The controller: what is handed to Emberwick ───────────────────────────

/**
 * Owns the Emberwick charts of one widget. `o` supplies what only the element
 * knows: `theme()`, `now()`, `reducedMotion()`, `requestRender()` and
 * `fail(kind, error, ref)`. `sync(specs)` is called on every render with one
 * spec per chart slot (or null) and does the least work: create, `setData`,
 * `update`/`append` from diffBars, markers, countdown, theme and the profile.
 */
export class MiniChartController {
  constructor(o) {
    this.o = o
    this.Chart = null
    this.loading = false
    this.states = []
  }

  sync(specs) {
    for (let i = 0; i < Math.max(this.states.length, specs.length); i++) {
      const st = this.states[i]
      const spec = specs[i]
      if (st && (!spec || st.host !== spec.host)) {
        this._destroy(st)
        this.states[i] = null
      }
    }
    if (!this.Chart) {
      if (specs.some((s) => s && s.bars.length)) this._load()
      return
    }
    specs.forEach((spec, i) => {
      if (!spec) return
      let st = this.states[i]
      if (!st) {
        if (!spec.bars.length) return
        st = this._create(spec)
        if (!st) return
        this.states[i] = st
      } else {
        // A different series is a new chart's worth of data, whatever the bars look like.
        const prev = st.key === spec.key ? st.bars : null
        this._apply(st, diffBars(prev, spec.bars))
        st.key = spec.key
        st.bars = spec.bars
        if (st.countdown !== spec.countdown) {
          st.chart.setCountdown(spec.countdown)
          st.countdown = spec.countdown
        }
      }
      const marksKey = JSON.stringify(spec.marks)
      if (st.marksKey !== marksKey) {
        st.chart.setMarkers(spec.marks.map((m) => ({ time: m.time, shape: m.shape, ...(m.text ? { text: m.text } : {}) })))
        st.marksKey = marksKey
      }
      this._profile(st, spec)
    })
  }

  _create(spec) {
    let chart
    try {
      chart = new this.Chart(spec.host, {
        theme: this.o.theme(),
        watermark: false,
        countdown: spec.countdown,
        // A frozen widget clock reaches the countdown too.
        clock: () => this.o.now(),
        animate: !this.o.reducedMotion(),
        ...(spec.timeZone ? { timeZone: spec.timeZone } : {}),
      })
    } catch (err) {
      // A constructor that throws is a library that cannot draw here: the same view as a missing one.
      this.o.fail('noPeer', err)
      return null
    }
    chart.setData(spec.bars)
    const st = { host: spec.host, chart, key: spec.key, bars: spec.bars, marksKey: null, countdown: spec.countdown, vp: null, vpCtl: null, vpLoading: false, dead: false }
    this._hideCanvases(st)
    return st
  }

  _apply(st, diff) {
    if (diff.kind === 'set') st.chart.setData(diff.bars)
    else if (diff.kind === 'ops') for (const op of diff.ops) st.chart[op.op](op.bar)
  }

  // The canvas has no accessible structure of its own: the wrapper's summary is the text route.
  _hideCanvases(st) {
    if (st.host && typeof st.host.querySelectorAll === 'function') for (const canvas of st.host.querySelectorAll('canvas')) canvas.setAttribute('aria-hidden', 'true')
  }

  _profile(st, spec) {
    const vp = spec.profile
    if (!vp) {
      // None given (or taken away): nothing is drawn.
      if (st.vpCtl && st.vp) st.vpCtl.setData(null)
      st.vp = null
      return
    }
    if (st.vpCtl) {
      if (st.vp === vp) return
      try {
        st.vpCtl.setData(vp)
        st.vp = vp
      } catch (err) {
        this.o.fail('badProfile', err, vp)
      }
      return
    }
    // Nothing to draw yet is nothing to load: the profiles entry is imported only when sessions arrive.
    if (st.vpLoading || !Array.isArray(vp.sessions) || !vp.sessions.length) return
    st.vpLoading = true
    Promise.resolve()
      .then(() => peers.profiles())
      .then(
        (mod) => {
          st.vpLoading = false
          if (st.dead) return
          try {
            st.vpCtl = mod.createVolumeProfile(st.chart, { data: vp })
            st.vp = vp
            this._hideCanvases(st)
          } catch (err) {
            this.o.fail('badProfile', err, vp)
          }
          // The host may have sent another profile while this one was loading.
          this.o.requestRender()
        },
        (err) => {
          st.vpLoading = false
          if (!st.dead) this.o.fail('noPeer', err)
        },
      )
  }

  _load() {
    if (this.loading) return
    this.loading = true
    Promise.resolve()
      .then(() => peers.chart())
      .then((mod) => {
        const Chart = mod && (mod.Chart || (mod.default && mod.default.Chart))
        if (typeof Chart !== 'function') throw new Error('the module has no Chart class')
        this.Chart = Chart
        this.o.requestRender()
      })
      .catch((err) => {
        this.loading = false
        this.o.fail('noPeer', err)
      })
  }

  retheme() {
    for (const st of this.states) if (st) st.chart.setTheme(this.o.theme())
  }

  resize() {
    for (const st of this.states) if (st) st.chart.resize()
  }

  _destroy(st) {
    st.dead = true
    if (st.vpCtl) {
      try {
        st.vpCtl.destroy()
      } catch {
        // Idempotent and safe after the chart's own destroy by contract; nothing to report.
      }
    }
    try {
      st.chart.destroy()
    } catch {
      // A chart that fails to tear down is gone either way.
    }
  }

  destroy() {
    for (const st of this.states) if (st) this._destroy(st)
    this.states = []
  }
}

// ── Element ───────────────────────────────────────────────────────────────

const k = (name) => `[data-k="${name}"]`

// tabindex -1 on the box Emberwick draws in: it would otherwise make that box a tab stop (tabindex 0) inside an
// aria-hidden region, where assistive technology cannot reach it. The wrapper's summary is the text route (RFC 0004 §6.5).
function chartBlock(i, xl) {
  return `<div class="mc">
<div class="row mh"><span class="n ins ell" data-k="ins${i}"></span><span class="n sm mut" data-k="tf${i}"></span><span class="f1"></span><span class="n" data-k="last${i}"></span>${figure('n sm', `chg${i}`)}</div>
${xl ? `<div class="sm mut ell" data-k="note${i}"></div>` : ''}
<div class="plot" part="chart" role="img" data-k="plot${i}" aria-label="">
<div class="cv" data-k="cv${i}" aria-hidden="true" tabindex="-1"></div>
<div class="none sm mut" data-k="none${i}" hidden></div>
</div>
</div>`
}

const SKELETON_BLOCK = '<div class="mc"><div class="plot"><span class="sk grow"></span></div></div>'

export class TsMiniChart extends TsWidget {
  static catalogKey = 'miniChart'
  static emptyText = EN['widget.miniChart.empty']
  static dataShape = {
    charts: { kind: 'array', of: { id: 'string', instrument: 'string', bars: { kind: 'array', of: { time: 'time', open: 'numeric', high: 'numeric', low: 'numeric', close: 'numeric' } } } },
    countdown: { kind: 'boolean', optional: true },
    volumeProfile: { kind: 'object', optional: true },
    asOf: { kind: 'time', optional: true },
    live: { kind: 'boolean', optional: true },
  }

  static styles = `${FIGURE_CSS}
[hidden] { display: none !important; }
.mcs { flex: 1; min-height: 0; display: flex; gap: 16px; }
.mc { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 6px; }
.mh { min-width: 0; }
/* Two charts need room: in a tile too narrow for them side by side (an XL outside a grid on a phone) they stack. */
@container (max-width: 520px) { .mcs { flex-direction: column; } }
.ins { font-weight: 600; }
.tfs { gap: 4px; }
/* Time runs left to right in every locale, so the drawing box never mirrors. */
.plot { position: relative; flex: 1; min-height: 0; min-width: 0; direction: ltr; overflow: hidden; border: 1px solid var(--ts-line); border-radius: var(--ts-radius-sm); }
.plot .sk { position: absolute; inset: 0; width: auto; }
.cv { position: absolute; inset: 0; }
.none { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 8px; text-align: center; unicode-bidi: plaintext; }
/* The canvas keeps Emberwick's colours in forced colours; the frame around it and the controls use the system's. */
@media (forced-colors: active) { .plot { border-color: CanvasText; } }
`

  static template(variant) {
    const tfs = variant === 'L' ? '<span class="row tfs" role="group" part="timeframes" data-k="tfGroup" hidden></span>' : ''
    const blocks = variant === 'XL' ? chartBlock(0, true) + chartBlock(1, true) : chartBlock(0, false)
    return `${header({ dot: true, meta: true, extra: tfs })}<div class="mcs">${blocks}</div>`
  }

  static skeleton(variant) {
    return `${header()}<div class="mcs">${variant === 'XL' ? SKELETON_BLOCK + SKELETON_BLOCK : SKELETON_BLOCK}</div>`
  }

  static viewModel(data, variant, ctx) {
    return miniChartModel(data, variant, ctx)
  }

  static miniChartModel(data, variant, ctx) {
    return miniChartModel(data, variant, ctx)
  }

  constructor() {
    super()
    this._noPeer = false
    this._badProfile = null
    this._tfKey = ''
    this._tfId = ''
    this._tfOn = ''
    this._plots = []
    this._ro = null
    this._observers = []
    this._mq = null
    this._themeQueued = false
    this._reader = null
    this._ctl = new MiniChartController({
      theme: () => emberwickTheme(this._readToken()),
      now: () => this.now(),
      reducedMotion: () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
      requestRender: () => this.requestRender(),
      fail: (kind, err, ref) => this._fail(kind, err, ref),
    })
    this._onTheme = () => {
      if (this._themeQueued) return
      this._themeQueued = true
      queueMicrotask(() => {
        this._themeQueued = false
        if (this.isConnected) this._ctl.retheme()
      })
    }
    // One listener on the tile: the buttons are rebuilt when the timeframes change.
    this._section.addEventListener('click', (e) => {
      const button = e.target && e.target.closest ? e.target.closest('button[data-tf]') : null
      if (!button || !this.actionEnabled('timeframe')) return
      const value = button.getAttribute('data-tf')
      if (value === this._tfOn) return
      this.emit('timeframe', { id: this._tfId, value })
    })
  }

  connectedCallback() {
    super.connectedCallback()
    this._watchTheme()
  }

  disconnectedCallback() {
    this._unwatchTheme()
    if (this._ro) this._ro.disconnect()
    this._plots = []
    this._ctl.destroy()
    super.disconnectedCallback()
  }

  // A missing peer, or a profile Emberwick rejects, is the error view rather than an exception (Decisions 55 and 76).
  _fail(kind, err, ref) {
    const why = err && err.message ? ` (${err.message})` : ''
    if (kind === 'noPeer') {
      this._noPeer = true
      if (DEV) warnOnce('mini-chart:no-peer', `<ts-mini-chart> could not load "emberwick"${why}. Install it with npm i emberwick (version 0.14.0 or later); the tile shows an error until then.`)
    } else {
      this._badProfile = ref
      if (DEV) warnOnce(`mini-chart:bad-profile:${this._uid}`, `${this.localName} volumeProfile was rejected by Emberwick${why}; check its step and sessions against emberwick/profiles' ProfileData.`)
    }
    this.requestRender()
  }

  _failure() {
    if (this._noPeer) return 'miniChart.noPeer'
    const d = this._data
    // The bad profile is only bad until the host sends another.
    if (this._badProfile && d && d.volumeProfile === this._badProfile) return 'miniChart.badProfile'
    return null
  }

  _draw(config, grid) {
    const key = this._failure()
    if (key && this._data !== undefined && this._data !== null && !this._error && !this._parseError && this.state !== 'error') {
      this._failed = false
      return this._showError(this._name(), this._renderT(key), grid)
    }
    return super._draw(config, grid)
  }

  // Every view but the content drops the chart's container, so the charts in it are finished.
  _show(key, ...rest) {
    this._ctl.destroy()
    return super._show(key, ...rest)
  }

  /** A token as an opaque rgb() string, by painting it onto a 1×1 canvas: hex, hsl(), color-mix() and names all come back as one form. */
  _readToken() {
    return (token) => {
      const raw = getComputedStyle(this).getPropertyValue(token).trim()
      if (!raw || token === FONT_TOKEN) return raw
      if (!this._reader) {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        this._reader = canvas.getContext('2d', { willReadFrequently: true })
      }
      const g = this._reader
      // A value the canvas cannot parse leaves the fill as it was: two different starting fills both surviving means it was refused.
      g.fillStyle = '#010203'
      g.fillStyle = raw
      const first = g.fillStyle
      g.fillStyle = '#040506'
      g.fillStyle = raw
      if (first === '#010203' && g.fillStyle === '#040506') return ''
      g.fillStyle = raw
      g.clearRect(0, 0, 1, 1)
      g.fillRect(0, 0, 1, 1)
      const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data
      if (a === 0) return ''
      return a === 255 ? `rgb(${r}, ${gr}, ${b})` : `rgba(${r}, ${gr}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`
    }
  }

  _watchTheme() {
    this._unwatchTheme()
    if (typeof MutationObserver === 'function' && typeof document !== 'undefined' && document.documentElement) {
      const watch = (el) => {
        const mo = new MutationObserver(this._onTheme)
        mo.observe(el, { attributes: true, attributeFilter: THEME_ATTRS })
        this._observers.push(mo)
      }
      watch(document.documentElement)
      const grid = typeof this.closest === 'function' ? this.closest('ts-grid') : null
      if (grid) watch(grid)
    }
    // data-theme="auto" follows the system, which changes no attribute.
    if (typeof matchMedia === 'function') {
      this._mq = matchMedia('(prefers-color-scheme: dark)')
      if (this._mq && this._mq.addEventListener) this._mq.addEventListener('change', this._onTheme)
    }
  }

  _unwatchTheme() {
    for (const mo of this._observers) mo.disconnect()
    this._observers = []
    if (this._mq && this._mq.removeEventListener) this._mq.removeEventListener('change', this._onTheme)
    this._mq = null
  }

  update(vm, variant) {
    const t = this.t
    const text = (key, value) => {
      const el = this.$(k(key))
      if (el && el.textContent !== value) el.textContent = value
    }
    text('label', this.label)
    const slots = variant === 'XL' ? 2 : 1
    const specs = []
    const plots = []
    for (let i = 0; i < slots; i++) {
      const c = vm.charts[i] || null
      text(`ins${i}`, c ? c.instrument : '')
      text(`tf${i}`, c ? c.timeframe : '')
      text(`last${i}`, c ? c.lastText : '')
      text(`chg${i}Ar`, c ? c.changeArrow : '')
      text(`chg${i}V`, c ? c.changeText : '')
      const chg = this.$(k(`chg${i}`))
      if (chg) {
        const cls = c && c.changeTone ? `n sm ${c.changeTone}` : 'n sm'
        if (chg.getAttribute('class') !== cls) chg.setAttribute('class', cls)
      }
      if (variant === 'XL') text(`note${i}`, c ? c.note : '')
      const plot = this.$(k(`plot${i}`))
      const summary = c ? c.summary : t('widget.miniChart.empty')
      if (plot) {
        if (plot.getAttribute('aria-label') !== summary) plot.setAttribute('aria-label', summary)
        plots.push(plot)
      }
      const none = this.$(k(`none${i}`))
      if (none) {
        none.toggleAttribute('hidden', !!(c && c.bars.length))
        text(`none${i}`, summary)
      }
      const host = this.$(k(`cv${i}`))
      specs.push(
        c && host
          ? { host, key: c.key, bars: c.bars, marks: c.marks, countdown: vm.countdown, timeZone: vm.timeZone, profile: c.profile }
          : null,
      )
    }
    if (variant === 'L') this._updateTimeframes(vm.charts[0] || null)
    this._ctl.sync(specs)
    this._observe(plots)
  }

  /** The timeframe buttons: real buttons made with the DOM (the values are data), only while the host listed 'timeframe'. */
  _updateTimeframes(c) {
    const group = this.$(k('tfGroup'))
    if (!group) return
    const frames = c && this.actionEnabled('timeframe') ? c.timeframes : []
    group.toggleAttribute('hidden', !frames.length)
    if (!frames.length) {
      this._tfKey = ''
      return
    }
    const label = this.t('miniChart.timeframes')
    if (group.getAttribute('aria-label') !== label) group.setAttribute('aria-label', label)
    const key = JSON.stringify([c.id, frames])
    this._tfId = c.id
    this._tfOn = c.timeframe
    if (key === this._tfKey) return
    this._tfKey = key
    setNodes(
      group,
      frames.map((f) => ({
        tag: 'button',
        attrs: { type: 'button', class: f.on ? 'btn on' : 'btn', 'aria-pressed': f.on ? 'true' : 'false', 'data-tf': f.value },
        text: f.value,
      })),
    )
  }

  /** Emberwick measures its container itself; this also tells it when the tile changed size under it. */
  _observe(plots) {
    if (typeof ResizeObserver !== 'function') return
    if (plots.length === this._plots.length && plots.every((p, i) => p === this._plots[i])) return
    if (!this._ro) this._ro = new ResizeObserver(() => this._ctl.resize())
    this._ro.disconnect()
    for (const p of plots) this._ro.observe(p)
    this._plots = plots
  }
}
