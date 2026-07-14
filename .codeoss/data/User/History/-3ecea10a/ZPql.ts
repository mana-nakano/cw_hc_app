import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    // 新しい本家URLを許可リストに追加！
    allowedHosts: [
      'paint-consultation-concierge-250404947892.asia-northeast1.run.app'
    ],
    port: 8080,
    host: '0.0.0.0'
  }
})