#!/usr/bin/env node
/**
 * Builds each example in examples/ the way a consumer would, from the packed tarball,
 * and smoke-tests it in Chromium (RFC 0003 §24, consumer-examples).
 *
 *   npm run release          # builds dist-lib/ (run for you when it is missing)
 *   npm run test:consumers
 *
 * For each of vanilla-cdn, react-vite, vue-vite and svelte-vite: `npm pack ./dist-lib` once,
 * copy the example to a temp directory, point its `tickslate` dependency at the tarball,
 * `npm install`, `npm run build` (the three framework examples type-check as part of it),
 * serve the result on a free port in 5190-5199, then run examples/smoke.spec.mjs.
 * Installing needs the network. Temp directories are removed whatever happens, and any
 * failure exits non-zero. Plain node: nothing here needs a new dependency.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// `build: false` is the no-build example: the page is served from the installed copy as it is.
// TS_ONLY=react-vite,vue-vite narrows a local run to those examples; CI runs all four.
const ONLY = (process.env.TS_ONLY || '').split(',').filter(Boolean)
const EXAMPLES = [
  { name: 'vanilla-cdn', build: false },
  { name: 'react-vite', build: true },
  { name: 'vue-vite', build: true },
  { name: 'svelte-vite', build: true },
].filter((e) => !ONLY.length || ONLY.includes(e.name))
const PORTS = [5190, 5191, 5192, 5193, 5194, 5195, 5196, 5197, 5198, 5199]
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
let tmp = null
const servers = []

// Runs a command, collecting its output. A failure rejects with that output, so the log shows why.
function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { out += d })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolvePromise(out)
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code} in ${options.cwd || root}\n${out}`))
    })
  })
}

// A static file server for one directory. The listening port is taken from the 5190-5199 range.
function serve(dir, preferred) {
  const server = createServer((req, res) => {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))
    if (path.endsWith(sep) || path.endsWith('/')) path += 'index.html'
    const file = join(dir, path)
    if (!file.startsWith(dir) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' })
    createReadStream(file).pipe(res)
  })
  servers.push(server)
  return new Promise((resolvePromise, reject) => {
    const tryPort = (i) => {
      if (i >= PORTS.length) return reject(new Error('No free port in 5190-5199.'))
      const port = PORTS[(preferred + i) % PORTS.length]
      server.once('error', (err) => (err.code === 'EADDRINUSE' ? tryPort(i + 1) : reject(err)))
      server.listen(port, '127.0.0.1', () => resolvePromise(port))
    }
    tryPort(0)
  })
}

async function cleanup() {
  for (const s of servers) s.close()
  if (tmp) await rm(tmp, { recursive: true, force: true })
}

async function main() {
  if (!existsSync(join(root, 'dist-lib', 'package.json'))) {
    console.log('dist-lib/ is missing: running `npm run release` first.')
    await run(npm, ['run', 'release'])
  }

  tmp = await mkdtemp(join(tmpdir(), 'tickslate-consumers-'))
  const packed = JSON.parse(await run(npm, ['pack', './dist-lib', '--json', '--pack-destination', tmp]))
  const tarball = join(tmp, packed[0].filename)
  console.log(`packed ${packed[0].filename} (${packed[0].size} bytes)`)

  // Copy, point at the tarball, install and build. The four are independent, so they run together.
  const prepared = await Promise.all(EXAMPLES.map(async (example, i) => {
    const dir = join(tmp, example.name)
    await cp(join(root, 'examples', example.name), dir, {
      recursive: true,
      filter: (src) => !/[\\/](node_modules|dist)([\\/]|$)/.test(src),
    })
    const manifestPath = join(dir, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.dependencies.tickslate = `file:${tarball}`
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2))
    await run(npm, ['install', '--no-audit', '--no-fund', '--no-package-lock'], { cwd: dir })
    if (example.build) await run(npm, ['run', 'build'], { cwd: dir })
    console.log(`built ${example.name}`)
    return { ...example, dir, serveDir: example.build ? join(dir, 'dist') : dir, index: i }
  }))

  const listed = []
  for (const example of prepared) {
    const port = await serve(example.serveDir, example.index)
    listed.push({ name: example.name, url: `http://127.0.0.1:${port}/` })
  }

  // A throwaway config: chromium only, motion off so a lifted tile has settled when read. A plain
  // object, because a file in the temp directory cannot import '@playwright/test' from here.
  const config = join(tmp, 'playwright.config.mjs')
  await writeFile(config, `export default {
  testDir: ${JSON.stringify(join(root, 'examples'))},
  testMatch: 'smoke.spec.mjs',
  outputDir: ${JSON.stringify(join(tmp, 'results'))},
  reporter: 'list',
  timeout: 30000,
  expect: { timeout: 5000 },
  workers: 1,
  use: { browserName: 'chromium', viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', serviceWorkers: 'block' },
}
`)
  // Playwright runs in this process group; its own output is the per-example result list.
  const code = await new Promise((resolvePromise) => {
    const child = spawn(npm, ['exec', '--', 'playwright', 'test', '-c', config], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, TS_EXAMPLES: JSON.stringify(listed) },
    })
    child.on('close', resolvePromise)
  })
  if (code !== 0) throw new Error(`The smoke test failed (exit ${code}).`)
  console.log('consumer examples: all passed')
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => cleanup().finally(() => process.exit(130)))
}
main()
  .then(cleanup, async (err) => {
    console.error(err.message)
    await cleanup()
    process.exit(1)
  })
