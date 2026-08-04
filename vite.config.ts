import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  // sockjs-client 引用了 Node 的 global；浏览器下映射到 globalThis（协作 WS 需要）
  define: {
    global: 'globalThis',
  },
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 开发期把 /api 代理到后端（application.yaml 端口 8096），前端 axios 走同源 /api 免跨域。
    proxy: {
      '/api': {
        target: 'http://localhost:8096',
        changeOrigin: true,
      },
      // 协作 WebSocket（SockJS）握手与传输
      '/ws': {
        target: 'http://localhost:8096',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
