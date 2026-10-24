import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: '/',
  plugins: [react()],
  // The pages log freely while developing (user objects, request details). None of that
  // belongs in a visitor's browser console, so a production build leaves those calls out.
  // Warnings and errors are kept.
  esbuild: command === 'build' ? { pure: ['console.log', 'console.debug', 'console.info'] } : {},
  server: {
    host: true,
    port: 5173
  },
  build: {
    assetsDir: 'assets'
  }
}))
