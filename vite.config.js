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
      includeAssets: ['icon.svg'],
      manifest: {
        name: '出攤記帳',
        short_name: '出攤記帳',
        description: '展場銷售、庫存與零錢對帳',
        lang: 'zh-Hant-TW',
        theme_color: '#6b3e26',
        background_color: '#faf6f1',
        display: 'standalone',
        start_url: '/expo-pos/',
        scope: '/expo-pos/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 }
    })
  ]
})
