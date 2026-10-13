import { defineConfig } from 'vite'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue'
import checker from 'vite-plugin-checker'

export default defineConfig({
  plugins: [
    checker({
      typescript: true,
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  server: {
    port: 5173
  }
})