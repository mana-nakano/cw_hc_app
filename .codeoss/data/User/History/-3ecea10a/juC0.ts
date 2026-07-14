import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  preview: {
    // 許可するURL（ホスト名）を指定
    allowedHosts: [
      'mananakano-250404947892.asia-northeast1.run.app'
    ],
    port: 8080,
    host: '0.0.0.0'
  }
})