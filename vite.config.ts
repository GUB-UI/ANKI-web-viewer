import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'Kioku',
        short_name: 'Kioku',
        description: 'ローカル完結の暗記PWA',
        theme_color: '#1a2332',
        background_color: '#1a2332',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        lang: 'ja',
        icons: [
          {
              src: 'icons/icon-192.png',
            sizes: '192x192',
              type: 'image/png',
            purpose: 'any',
          },
          {
              src: 'icons/icon-512.png',
            sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'icons/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,wasm,woff2,json}'],
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['sql.js'],
  },
})
