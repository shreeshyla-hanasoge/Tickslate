import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    // Without this Vue warns "failed to resolve component: ts-grid" and treats the tags as components.
    vue({ template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith('ts-') } } }),
  ],
})
