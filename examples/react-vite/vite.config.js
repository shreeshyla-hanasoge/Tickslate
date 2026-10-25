import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Nothing Tickslate-specific: the elements are plain custom elements.
export default defineConfig({ plugins: [react()] })
