/**
 * Assembles dist-ld-src/: the public site's sources as a folder LambdaDeploy's
 * build server can build by itself. It runs `npm install` and then
 * `vite build` with no options, so the folder carries:
 *
 *   package.json      vite and nothing else (the site has no runtime dependencies)
 *   vite.config.js    vite.ld.config.js under the default name: base /, output dist/
 *   vite.site.config.js, scripts/   the site build it calls
 *   site/, index.html, widgets.html, examples/*.html   the pages
 *   src/              the library the pages run, built from source as the site always is
 *   docs/, CHANGELOG.md, README.md  the Markdown the docs pages are made from
 *   package.lib.json  the version the pages name
 *
 * Run with: npm run pack:site (or node scripts/pack-site.mjs). Then upload the
 * folder and build; docs/site.md has the steps.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist-ld-src')
const from = (p) => join(root, p)

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const copy = (p) => {
  if (!existsSync(from(p))) return
  cpSync(from(p), join(out, p), { recursive: true, filter: (f) => !/(^|\/)(\.DS_Store|node_modules)$/.test(f) })
}

for (const p of ['site', 'src', 'index.html', 'widgets.html', 'package.lib.json', 'vite.site.config.js', 'CHANGELOG.md', 'README.md', 'LICENSE']) copy(p)
for (const p of ['entries.mjs', 'md.mjs', 'site-docs.mjs']) copy(`scripts/${p}`)
// Only the top-level example pages are site pages; the framework projects beside them are not built here.
for (const f of readdirSync(from('examples'))) if (f.endsWith('.html')) copy(`examples/${f}`)
// The docs the site renders, and nothing else from docs/ (the RFCs link to GitHub).
for (const p of ['docs/guide', 'docs/widgets', 'docs/reference', 'docs/theming.md', 'docs/ACCESSIBILITY.md']) copy(p)

// A SITE_VERSION set here is written into the upload's config, so the build
// server needs no environment of its own (docs/site.md, "The version").
let ldConfig = readFileSync(from('vite.ld.config.js'), 'utf8')
if (process.env.SITE_VERSION) {
  if (!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(process.env.SITE_VERSION)) throw new Error(`SITE_VERSION must be a version such as 0.1.0; got "${process.env.SITE_VERSION}".`)
  ldConfig = ldConfig.replace("siteConfig({ base: '/'", `siteConfig({ siteVersion: '${process.env.SITE_VERSION}', base: '/'`)
  if (!ldConfig.includes(process.env.SITE_VERSION)) throw new Error('pack-site could not write SITE_VERSION into vite.config.js; vite.ld.config.js changed shape.')
}
writeFileSync(join(out, 'vite.config.js'), ldConfig)

// The same vite the repository's lockfile installs, so the upload builds what was checked here.
const installed = (name) => JSON.parse(readFileSync(from(`node_modules/${name}/package.json`), 'utf8')).version
const viteVersion = installed('vite')
const pkg = {
  name: 'tickslate-site',
  private: true,
  version: JSON.parse(readFileSync(from('package.lib.json'), 'utf8')).version,
  type: 'module',
  description: 'The Tickslate public site, assembled by scripts/pack-site.mjs. Build with `vite build`; the output is dist/.',
  scripts: { build: 'vite build', preview: 'vite preview' },
  // In dependencies, not devDependencies, so an install with NODE_ENV=production still gets it.
  dependencies: { vite: viteVersion },
  // There is no lockfile in the upload, so vite's own bundler and transformer
  // are held to the versions this repository's lockfile installs.
  overrides: { rollup: installed('rollup'), esbuild: installed('esbuild') },
}
writeFileSync(join(out, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)

let files = 0
let bytes = 0
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else { files++; bytes += statSync(p).size }
  }
}
walk(out)
console.log(`${relative(root, out)}/: ${files} files, site version ${process.env.SITE_VERSION || pkg.version}, ${(bytes / 1024).toFixed(0)} kB. Upload it, then run npm install and vite build there; the site lands in dist/.`)
