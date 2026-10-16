#!/usr/bin/env node
/**
 * Writes the two machine-readable descriptions of every element (RFC 0003 §22.3):
 *
 *   dist-lib/custom-elements.json            Custom Elements Manifest, schemaVersion 1.0.0
 *   dist-lib/vscode.html-custom-data.json    VS Code's HTML custom data
 *
 * pack-lib calls `writeManifests()` as part of `npm run pack:lib`; running this file
 * directly does the same.
 *
 * There is no analyzer dependency. The declaration files in src/elements/ are the one
 * source: a JSDoc block with `@element ts-tag` documents a tag's markup (`@attr`,
 * `@fires`, `@csspart`, `@slot`, `@cssprop`), a block with `@base TsWidget` documents
 * what every widget inherits, and the exported class supplies the properties and
 * methods. Nothing here names a widget, so a story that adds an element writes those
 * tags in its declarations and the manifest picks it up.
 *
 * The build fails when a tag that a src/elements/define/ module registers has no
 * `@element` block, or when the class a block belongs to cannot be found: a missing
 * description must stop the release, not ship as an empty entry.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { elementEntries, describeEntry, root } from './entries.mjs'
import { WIDGETS } from '../src/core/catalog.js'

const dtsDir = resolve(root, 'src/elements')

// ------------------------------------------------------------------ reading

/**
 * One declaration file as three strings of equal length, so an offset in one is the same
 * place in the others: the text, the text with comments blanked, and that with string
 * literals blanked too. Brace and paren counting is done on the last, where a `{` inside
 * a comment or a string cannot be mistaken for structure.
 */
function load(text) {
  const blocks = []
  let code = ''
  let shadow = ''
  for (let i = 0; i < text.length; ) {
    const two = text.slice(i, i + 2)
    if (two === '/*' || two === '//') {
      const end = two === '/*' ? text.indexOf('*/', i + 2) + 2 : text.indexOf('\n', i) < 0 ? text.length : text.indexOf('\n', i)
      const slice = text.slice(i, end)
      if (slice.startsWith('/**')) blocks.push({ start: i, end, text: slice })
      const blank = slice.replace(/[^\n]/g, ' ')
      code += blank
      shadow += blank
      i = end
    } else if (text[i] === "'" || text[i] === '"' || text[i] === '`') {
      const q = text[i]
      let j = i + 1
      while (j < text.length && text[j] !== q) j += text[j] === '\\' ? 2 : 1
      const slice = text.slice(i, j + 1)
      code += slice
      shadow += q + 'x'.repeat(Math.max(0, slice.length - 2)) + q
      i = j + 1
    } else {
      code += text[i]
      shadow += text[i]
      i++
    }
  }
  return { text, code, shadow, blocks }
}

/** The index of the bracket that closes the one at `open`, counted on `shadow`. `=>` is not a bracket. */
function closer(shadow, open) {
  const pairs = { '{': '}', '(': ')', '[': ']', '<': '>' }
  const start = shadow[open]
  let depth = 0
  for (let i = open; i < shadow.length; i++) {
    const c = shadow[i]
    if (start === '<' && c === '=' && shadow[i + 1] === '>') i++
    else if (c === start) depth++
    else if (c === pairs[start] && --depth === 0) return i
  }
  throw new Error(`unclosed ${start} at offset ${open}`)
}

/** `[{ name, text }]` from a JSDoc block, plus its description (the lines before the first tag). */
function parseBlock(raw) {
  const lines = raw
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*? ?/, '').trimEnd())
  const tags = []
  const desc = []
  for (const line of lines) {
    const m = /^@(\w+)\s*(.*)$/.exec(line)
    if (m) tags.push({ name: m[1], text: m[2] })
    else if (tags.length) {
      if (line.trim()) tags[tags.length - 1].text += ` ${line.trim()}`
    } else desc.push(line)
  }
  return { description: desc.join('\n').trim(), tags }
}

/** `{type} name - description`. The type may hold braces; `nameless` allows `- description` alone (the default slot). */
function typed(text) {
  let rest = text.trim()
  let type = ''
  if (rest.startsWith('{')) {
    const end = closer(rest, 0)
    type = rest.slice(1, end).trim()
    rest = rest.slice(end + 1).trim()
  }
  if (rest === '-' || rest.startsWith('- ')) return { type, name: '', description: rest.slice(1).trim() }
  const space = rest.search(/\s/)
  const name = space < 0 ? rest : rest.slice(0, space)
  const description = space < 0 ? '' : rest.slice(space).replace(/^\s*-?\s*/, '')
  return { type, name, description }
}

/** Every class declared in `file`, with its heritage and members. */
function parseClasses(file, source) {
  const { text, code, shadow, blocks } = file
  const byEnd = new Map(blocks.map((b) => [b.end, b]))
  const docBefore = (pos) => {
    let q = pos
    while (q > 0 && /\s/.test(text[q - 1])) q--
    return byEnd.get(q) || null
  }
  const classes = []
  for (const m of shadow.matchAll(/(?:export\s+)?declare\s+class\s+([A-Za-z_$][\w$]*)/g)) {
    let i = m.index + m[0].length
    while (/\s/.test(shadow[i])) i++
    if (shadow[i] === '<') i = closer(shadow, i) + 1
    const heritage = /^\s*extends\s+([\w$.]+)/.exec(shadow.slice(i))
    if (heritage) i += heritage[0].length
    while (/\s/.test(shadow[i])) i++
    if (shadow[i] === '<') i = closer(shadow, i) + 1
    const open = shadow.indexOf('{', i)
    const close = closer(shadow, open)
    const doc = docBefore(m.index)
    classes.push({
      name: m[1],
      superclass: heritage ? heritage[1] : null,
      source,
      doc: doc ? parseBlock(doc.text) : { description: '', tags: [] },
      members: parseMembers(file, open + 1, close, docBefore),
    })
  }
  return classes
}

const SKIPPED = new Set(['constructor', 'connectedCallback', 'disconnectedCallback', 'attributeChangedCallback', 'addEventListener', 'removeEventListener'])

function parseMembers({ code, shadow }, from, to, docBefore) {
  // Cut the body into statements: a newline or `;` at bracket depth 0 ends one, unless the
  // line ends in an operator that continues it.
  const statements = []
  let depth = 0
  let start = -1
  const end = (at) => {
    if (start >= 0) statements.push([start, at])
    start = -1
  }
  for (let i = from; i < to; i++) {
    const c = shadow[i]
    if (start < 0 && !/\s/.test(c)) start = i
    // Angle brackets are left out: `=>` and `Array<…>` never split a statement across lines here.
    if ('{(['.includes(c)) depth++
    else if ('})]'.includes(c)) depth--
    if (depth === 0 && (c === ';' || c === '\n') && start >= 0) {
      const so_far = shadow.slice(start, i).trimEnd()
      if (c === ';' || !/[|&:,]$|=>$/.test(so_far)) end(i)
    }
  }
  end(to)

  const members = []
  for (const [s, e] of statements) {
    const stmt = code.slice(s, e).replace(/\s+/g, ' ').trim()
    const mm = /^((?:(?:declare|public|protected|private|static|readonly|abstract|override|accessor)\s+)*)(?:(get|set)\s+(?=[\w$'"]))?([A-Za-z_$][\w$]*|'[^']+'|"[^"]+")(\?)?\s*([(<:].*)$/.exec(stmt)
    if (!mm) continue // an index signature, an overload we cannot read, a bare keyword
    const [, mods, accessor, rawName, optional, rest] = mm
    const name = rawName.replace(/^['"]|['"]$/g, '')
    if (/\b(private|protected|static)\b/.test(mods) || SKIPPED.has(name) || name.startsWith('_')) continue
    const doc = docBefore(s)
    const description = doc ? parseBlock(doc.text).description : ''
    if (rest[0] === ':') {
      members.push({ kind: 'field', name, type: rest.slice(1).trim(), description, readonly: /\breadonly\b/.test(mods) || accessor === 'get', optional: Boolean(optional), accessor })
    } else {
      // A method: `name(params): return` or `name<T>(params): return`.
      const open = rest.indexOf('(')
      const close = closer(rest, open)
      const params = splitTop(rest.slice(open + 1, close)).map((p) => {
        const pm = /^\s*(?:\.\.\.)?([\w$]+)\??\s*:\s*(.*)$/s.exec(p)
        return pm ? { name: pm[1], type: { text: pm[2].trim() } } : { name: p.trim(), type: { text: 'unknown' } }
      })
      if (accessor === 'get') {
        members.push({ kind: 'field', name, type: rest.slice(close + 1).replace(/^\s*:\s*/, ''), description, readonly: true, accessor })
      } else {
        members.push({ kind: 'method', name, description, parameters: params, returnType: rest.slice(close + 1).replace(/^\s*:\s*/, '') || 'void' })
      }
    }
  }
  // A getter with a setter is a writable property; fold the pair into one.
  const merged = new Map()
  for (const m of members) {
    const prev = merged.get(m.name)
    if (m.kind === 'method' || !prev || prev.kind === 'method') {
      if (!(m.kind === 'method' && prev && prev.kind === 'method')) merged.set(m.name, m)
    } else {
      prev.readonly = prev.readonly && m.readonly
      if (!prev.type || prev.type === 'void') prev.type = m.type
      if (!prev.description) prev.description = m.description
    }
  }
  return [...merged.values()].filter((m) => !(m.kind === 'field' && m.accessor === 'set' && !m.type))
}

/** Splits at commas that are not inside any bracket. */
function splitTop(s) {
  const out = []
  let depth = 0
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '=' && s[i + 1] === '>') {
      cur += '=>'
      i++
      continue
    }
    if ('{([<'.includes(c)) depth++
    else if ('})]>'.includes(c)) depth--
    if (c === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  if (cur.trim()) out.push(cur)
  return out
}

// ------------------------------------------------------------------ building

/** What the declarations say, gathered once: classes, tag blocks, base blocks and the tag-to-class map. */
export function readDeclarations(dir = dtsDir) {
  const classes = new Map()
  const elementBlocks = new Map()
  const baseBlocks = []
  const tagClass = new Map()
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.d.ts')).sort()) {
    const file = load(readFileSync(resolve(dir, f), 'utf8'))
    for (const c of parseClasses(file, f)) classes.set(c.name, c)
    for (const b of file.blocks) {
      const { description, tags } = parseBlock(b.text)
      const element = tags.find((t) => t.name === 'element')
      const base = tags.find((t) => t.name === 'base')
      if (element) elementBlocks.set(element.text.trim(), { description, tags, source: f })
      if (base) baseBlocks.push({ base: base.text.trim(), description, tags, source: f })
    }
    for (const m of file.shadow.matchAll(/interface\s+HTMLElementTagNameMap\s*\{/g)) {
      const open = m.index + m[0].length - 1
      const body = file.code.slice(open + 1, closer(file.shadow, open))
      for (const [, tag, cls] of body.matchAll(/['"]([a-z][a-z0-9-]*)['"]\s*:\s*([A-Za-z_$][\w$]*)/g)) tagClass.set(tag, cls)
    }
  }
  return { classes, elementBlocks, baseBlocks, tagClass }
}

const chain = (decl, name) => {
  const out = []
  for (let c = decl.classes.get(name); c; c = c.superclass ? decl.classes.get(c.superclass) : null) out.push(c)
  return out
}

const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
const firstSentence = (s) => (s.split(/\n\s*\n/)[0] || '').replace(/\s+/g, ' ').trim()

/** Collects `@attr`, `@fires`, `@csspart`, `@slot` and `@cssprop` lines from blocks, later blocks overriding earlier ones by name. */
function collect(blocks) {
  const attrs = new Map()
  const events = new Map()
  const parts = new Map()
  const slots = new Map()
  const props = new Map()
  for (const { tags, source } of blocks) {
    // A name repeated inside one block is a slip (the second would silently replace the first);
    // a later block overriding an earlier one, such as an element redefining a base attribute, is not.
    const seen = new Set()
    for (const t of tags) {
      const kind = { attribute: 'attr', event: 'fires', cssproperty: 'cssprop' }[t.name] || t.name
      if (!['attr', 'fires', 'csspart', 'slot', 'cssprop'].includes(kind)) continue
      const { type, name, description } = typed(t.text)
      // The default slot is the one tag with no name.
      if (!name && kind !== 'slot') throw new Error(`${source}: "@${t.name} ${t.text}" has no name. Write "@${t.name} {type} name - description".`)
      if (seen.has(`${kind} ${name}`)) throw new Error(`${source}: "@${t.name} ${name}" appears twice in one block; the second would replace the first.`)
      seen.add(`${kind} ${name}`)
      if (kind === 'attr') attrs.set(name, { name, type: { text: type || 'string' }, description })
      else if (kind === 'fires') events.set(name, { name, type: { text: type || 'CustomEvent' }, description })
      else if (kind === 'csspart') parts.set(name, { name, description })
      else if (kind === 'slot') slots.set(name, { name, description })
      else props.set(name, { name, type: type ? { text: type } : undefined, description })
    }
  }
  return { attrs, events, parts, slots, props }
}

/**
 * Builds both files' contents. `entries` and `catalog` default to the real ones and are
 * parameters so a test can feed it a fixture.
 */
export function buildManifests({ entries = elementEntries().map(describeEntry), catalog = WIDGETS, declarations = readDeclarations() } = {}) {
  const decl = declarations
  const problems = []
  const defined = new Map() // tag -> the entry that registers it
  for (const e of entries) for (const tag of e.tags) defined.set(tag, e)

  // The safety net: a tag a define module registers, or that WIDGETS lists and a define
  // module registers, must be documented.
  const required = new Set([...defined.keys()])
  for (const [tag] of defined) {
    if (!decl.elementBlocks.has(tag)) problems.push(`${tag} is registered by src/elements/define/${defined.get(tag).file}.js but no declaration has a JSDoc block with "@element ${tag}". Document its attributes, events, parts and slots in its .d.ts file (see the blocks in src/elements/index.d.ts).`)
    else {
      const className = decl.tagClass.get(tag) || defined.get(tag).exports.find((n) => decl.classes.has(n))
      if (!className) problems.push(`${tag} is documented, but no declared class backs it: add "'${tag}': Class" to HTMLElementTagNameMap in its .d.ts file.`)
      else if (!decl.classes.has(className)) problems.push(`${tag} maps to ${className} in HTMLElementTagNameMap, but no "declare class ${className}" is in src/elements/*.d.ts.`)
    }
  }
  const notBuilt = Object.values(catalog).map((w) => w.tag).filter((tag) => !required.has(tag))
  if (problems.length) throw new Error(problems.join('\n'))

  const baseOf = (className) => decl.baseBlocks.filter((b) => chain(decl, className).some((c) => c.name === b.base))
  const modules = new Map()
  const moduleFor = (path) => {
    if (!modules.has(path)) modules.set(path, { kind: 'javascript-module', path, declarations: [], exports: [] })
    return modules.get(path)
  }
  const memberOf = (m, owner, inherited) => {
    const common = { name: m.name, description: m.description, privacy: 'public' }
    const from = inherited ? { inheritedFrom: { name: owner, module: owner === 'TsWidget' ? 'elements.js' : undefined } } : {}
    return m.kind === 'method'
      ? { kind: 'method', ...common, parameters: m.parameters, return: { type: { text: m.returnType } }, ...from }
      : { kind: 'field', ...common, type: { text: m.type }, ...(m.readonly ? { readonly: true } : {}), ...from }
  }
  const declared = new Set()
  const declare = (cls, modulePath, extra) => {
    if (declared.has(cls.name)) return
    declared.add(cls.name)
    const own = cls.members.map((m) => memberOf(m, cls.name, false))
    const seen = new Set(own.map((m) => m.name))
    const inherited = []
    for (const parent of chain(decl, cls.name).slice(1)) {
      for (const m of parent.members) {
        if (!seen.has(m.name)) {
          seen.add(m.name)
          inherited.push(memberOf(m, parent.name, true))
        }
      }
    }
    const mod = moduleFor(modulePath)
    mod.declarations.push({
      kind: 'class',
      name: cls.name,
      description: cls.doc.description,
      ...(cls.superclass ? { superclass: { name: cls.superclass, ...(decl.classes.has(cls.superclass) ? { module: 'elements.js' } : {}) } } : {}),
      ...extra,
      members: [...own, ...inherited],
    })
    mod.exports.push({ kind: 'js', name: cls.name, declaration: { name: cls.name, module: modulePath } })
  }
  // The base class gets a declaration of its own, so a tool can follow `superclass`.
  if (decl.classes.has('TsWidget')) declare(decl.classes.get('TsWidget'), 'elements.js')

  const vscodeTags = []
  for (const entry of entries) {
    for (const tag of entry.tags) {
      const className = decl.tagClass.get(tag) || entry.exports.find((n) => decl.classes.has(n))
      const cls = decl.classes.get(className)
      const block = decl.elementBlocks.get(tag)
      const { attrs, events, parts, slots, props } = collect([...baseOf(className), block])
      const fieldFor = (name) => (chain(decl, className).some((c) => c.members.some((m) => m.name === camel(name))) ? camel(name) : undefined)
      const attributes = [...attrs.values()].map((a) => ({ ...a, ...(fieldFor(a.name) ? { fieldName: fieldFor(a.name) } : {}) }))
      const description = cls.doc.description || block.description
      const path = `elements/${entry.name}.js`
      declare(cls, path, {
        tagName: tag,
        customElement: true,
        summary: firstSentence(description),
        attributes,
        events: [...events.values()],
        slots: [...slots.values()],
        cssParts: [...parts.values()],
        ...(props.size ? { cssProperties: [...props.values()] } : {}),
      })
      const mod = moduleFor(path)
      mod.exports.push({ kind: 'custom-element-definition', name: tag, declaration: { name: cls.name, module: path } })
      vscodeTags.push({
        name: tag,
        description: markdown(description, { events: [...events.values()], parts: [...parts.values()], slots: [...slots.values()] }),
        attributes: attributes.map((a) => ({
          name: a.name,
          description: a.description,
          ...(literalValues(a.type.text) ? { values: literalValues(a.type.text).map((name) => ({ name })) } : {}),
        })),
      })
    }
  }

  const cem = {
    schemaVersion: '1.0.0',
    readme: 'README.md',
    modules: [...modules.values()].sort((a, b) => (a.path < b.path ? -1 : 1)),
  }
  const vscode = { version: 1.1, tags: vscodeTags.sort((a, b) => (a.name < b.name ? -1 : 1)) }
  return { cem, vscode, notBuilt }
}

/** `'a' | 'b'` as ['a', 'b']; null for any other type, and for a lone literal such as 'off' that a bare attribute can't be chosen from. */
function literalValues(type) {
  const parts = type.split('|').map((p) => p.trim())
  return parts.every((p) => /^'[^']*'$/.test(p)) ? parts.map((p) => p.slice(1, -1)) : null
}

/** VS Code's custom data has no field for events, parts or slots, so they go in the tag's hover text. */
function markdown(description, { events, parts, slots }) {
  const list = (title, items) => (items.length ? `\n\n**${title}:** ${items.map((i) => `\`${i.name || '(default)'}\``).join(', ')}` : '')
  return `${description}${list('Events', events)}${list('Parts', parts)}${list('Slots', slots)}`.trim()
}

/** Writes both files into `outDir`; returns the tags listed. */
export async function writeManifests(outDir, options) {
  const { cem, vscode, notBuilt } = buildManifests(options)
  await mkdir(outDir, { recursive: true })
  await writeFile(resolve(outDir, 'custom-elements.json'), JSON.stringify(cem, null, 2) + '\n')
  await writeFile(resolve(outDir, 'vscode.html-custom-data.json'), JSON.stringify(vscode, null, 2) + '\n')
  return { tags: vscode.tags.map((t) => t.name), notBuilt }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { tags, notBuilt } = await writeManifests(resolve(root, 'dist-lib'))
    console.log(`wrote dist-lib/custom-elements.json and dist-lib/vscode.html-custom-data.json (${tags.length} tags)`)
    if (notBuilt.length) console.log(`note: WIDGETS lists ${notBuilt.join(', ')}, which have no src/elements/define/ module yet, so they are not in the manifest`)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
