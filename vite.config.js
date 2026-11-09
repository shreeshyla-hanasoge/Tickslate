import { defineConfig } from 'vite'
import { siteConfig } from './vite.site.config.js'

/**
 * The public site for LambdaDeploy (https://tickslate.ldio.app): the same site
 * as vite.site.config.js, served from the domain root and built into dist/,
 * which is where the LambdaDeploy build server looks. scripts/pack-site.mjs
 * copies this file into the upload folder as its vite.config.js, so a plain
 * `vite build` there builds it. See docs/site.md.
 */
export default defineConfig(({ command, isPreview }) => siteConfig({ base: '/', outDir: 'dist', serve: command === 'serve' && !isPreview }))
