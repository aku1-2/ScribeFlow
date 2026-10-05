import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react],
  server: {
    port: 5173,
    strictPort: true, // Fail with a clear error if port 5173 is in use instead of silently auto-incrementing
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
