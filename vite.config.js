import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 根据模式选择不同的后端端口
  const apiPort = mode === 'api19005' ? '19005' : '9005'
  
  return {
    plugins: [
      vue(),
      vueDevTools(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      },
    },
    server: {
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true
        }
      }
    }
  }
})
