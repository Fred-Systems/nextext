import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev
export default defineConfig({
  base: './', // CRITICAL: Forces relative pathing so your phone can find the files locally
  plugins: [react()],
})
