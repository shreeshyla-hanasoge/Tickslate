import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// vitePreprocess compiles <script lang="ts">. No custom-element setting is needed: Svelte
// treats any tag with a dash as a custom element.
export default { preprocess: vitePreprocess() }
