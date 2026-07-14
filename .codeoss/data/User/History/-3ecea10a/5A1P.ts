export default defineConfig({
  plugins: [react()],
  preview: {
    // 自分のCloud Runのドメインだけを許可する（一番安全な書き方）
    allowedHosts: [
      'mananakano-250404947892.asia-northeast1.run.app'
    ],
    port: 8080,
    host: '0.0.0.0'
  }
})