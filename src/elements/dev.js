/**
 * Development-only diagnostics (RFC 0002 §7.1).
 *
 * Call sites are written `if (DEV) warnOnce(…)` so a production build, which
 * defines __TS_DEV__ as false, drops the message strings and whatever
 * validation feeds them. Unbundled source has no such define, so DEV is true.
 */

import { toNumber, toTime } from '../core/index.js'

/* global __TS_DEV__ */
export const DEV = typeof __TS_DEV__ !== 'undefined' ? __TS_DEV__ : true

const warned = new Set()

/** Warn once per key: a clock tick or a re-render must not repeat itself. */
export function warnOnce(key, message) {
  if (warned.has(key)) return
  warned.add(key)
  console.warn('tickslate: ' + message)
}

/** For tests, which need each warning to fire again. */
export function resetWarnings() {
  warned.clear()
}

// ── dataShape validation (RFC 0002 §2.7) ───────────────────────────────────
// Everything below is only reachable from `if (DEV)`, so a production build
// drops it with the strings.

const KINDS = ['number', 'numeric', 'time', 'string', 'boolean', 'array', 'object']
const FIELD_KEYS = ['kind', 'optional', 'of']

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// A `{ kind, optional?, of? }` field, as opposed to a nested DataShape. A shape
// with a single key named "kind" is therefore read as a field; give it another
// key or wrap it in { kind: 'object', of } to mean a shape.
const isField = (spec) =>
  isObject(spec) && typeof spec.kind === 'string' && KINDS.includes(spec.kind) && Object.keys(spec).every((k) => FIELD_KEYS.includes(k))

/** What a value looks like in a message: `string "n/a"`, `array`, `null`. */
function received(v) {
  if (v === undefined) return 'missing'
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'string') return `string "${v.length > 24 ? v.slice(0, 24) + '…' : v}"`
  if (typeof v === 'number' || typeof v === 'boolean') return `${typeof v} ${v}`
  return typeof v
}

function passes(kind, v) {
  switch (kind) {
    case 'number':
      return typeof v === 'number' && Number.isFinite(v)
    case 'numeric':
      return Number.isFinite(toNumber(v))
    case 'time':
      return Number.isFinite(toTime(v))
    case 'string':
      return typeof v === 'string'
    case 'boolean':
      return typeof v === 'boolean'
    case 'array':
      return Array.isArray(v)
    default:
      return isObject(v)
  }
}

// `spec` is a kind, a field, or (for an array's items) a nested shape.
function checkValue(value, spec, path, parent) {
  if (typeof spec === 'string') spec = { kind: spec }
  else if (!isField(spec)) spec = { kind: 'object', of: spec }
  if (value === undefined || value === null) {
    if (spec.optional) return null
    const problem = { path, expected: spec.kind, received: received(value) }
    if (parent) problem.keys = Object.keys(parent)
    return problem
  }
  if (!passes(spec.kind, value)) return { path, expected: spec.kind, received: received(value) }
  if (spec.of === undefined) return null
  if (spec.kind === 'array') {
    for (let i = 0; i < value.length; i++) {
      // An item is never "optional": a hole in the list is the problem.
      const problem = checkValue(value[i], spec.of, `${path}[${i}]`, isObject(value[i]) ? value[i] : null)
      if (problem) return problem
    }
  } else if (spec.kind === 'object' && isObject(spec.of) && !isField(spec.of)) {
    return checkShape(value, spec.of, path)
  }
  return null
}

/**
 * The first way `data` departs from `shape`, or null. A bare kind is required;
 * keys the shape doesn't list are allowed. Pure.
 */
export function checkShape(data, shape, path = 'data') {
  if (!isObject(data)) return { path, expected: 'object', received: received(data) }
  for (const key of Object.keys(shape)) {
    const problem = checkValue(data[key], shape[key], `${path}.${key}`, data)
    if (problem) return problem
  }
  return null
}

/** The sentence for a problem, without the element: `data.value is missing (got keys: a, b)`. */
export function shapeMessage(problem) {
  if (problem.received === 'missing') {
    return `${problem.path} is missing (got keys: ${problem.keys && problem.keys.length ? problem.keys.join(', ') : 'none'})`
  }
  return `${problem.path} should be ${problem.expected} (got ${problem.received})`
}

/** The parser's message without its position, and the position, from V8's or another engine's wording. */
export function parseErrorParts(err) {
  const raw = String((err && err.message) || err)
  const at = /position (\d+)/.exec(raw)
  const message = raw.replace(/\s*(in JSON )?at position \d+(\s*\(line \d+ column \d+\))?/, '')
  return { message, position: at ? Number(at[1]) : null }
}
