import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
const m = (f) => fileURLToPath(new URL('./mock/' + f, import.meta.url))
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  base: '/expo-pos/',
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^firebase\/app$/, replacement: m('app.js') },
      { find: /^firebase\/auth$/, replacement: m('auth.js') },
      { find: /^firebase\/firestore$/, replacement: m('firestore.js') },
      { find: /^\.\/firebase-config\.js$/, replacement: m('config.js') }
    ]
  },
  build: { outDir: 'tests/dist-mock', emptyOutDir: true }
})
