import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/health': 'http://localhost:7860',
      '/reset': 'http://localhost:7860',
      '/step': 'http://localhost:7860',
      '/state': 'http://localhost:7860',
      '/valid_actions': 'http://localhost:7860',
    },
  },
})
