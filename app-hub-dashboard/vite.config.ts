import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Tailwind 3 runs through PostCSS (postcss.config.cjs). server.js serves dist/ and the /api routes.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': 'http://localhost:5001' },
  },
  build: { outDir: 'dist' },
})
