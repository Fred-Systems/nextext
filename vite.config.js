import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',
  build: {
    target: 'es2015',
    rollupOptions: {
      output: {
        format: 'iife',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'strip-crossorigin',
      transformIndexHtml(html) {
        return html.replace(/ crossorigin/g, '')
      },
    },
    {
      name: 'convert-module-to-classic',
      transformIndexHtml(html) {
        return html.replace(
          /<script type="module" src="([^"]+)"><\/script>/,
          '<script defer src="$1"></script>'
        )
      },
    },
  ],
})
