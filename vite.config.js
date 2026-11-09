import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages 網址：https://leo274114.github.io/expo-pos/
export default defineConfig({
  base: '/expo-pos/',
  // 5173 在 Windows 保留的 port 範圍內，改用 3000
  server: { port: 3000, strictPort: true },
  preview: { port: 3000 },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '好攤',
        short_name: '好攤',
        description: '好攤：擺攤收銀、庫存、預約與零錢對帳',
        lang: 'zh-Hant-TW',
        theme_color: '#183d2e',
        background_color: '#183d2e',
        display: 'standalone',
        start_url: '/expo-pos/',
        scope: '/expo-pos/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      // privacy.html 是獨立頁面，不要被 App 攔截
      workbox: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, navigateFallbackDenylist: [/privacy\.html$/] }
    })
  ]
})
