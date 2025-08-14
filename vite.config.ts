import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { cleanupOutdatedCaches: true },
      manifest: {
        name: 'LavaTools',
        short_name: 'LavaTools',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#CF1020',
        icons: []
      }
    })
  ],
  server: { port: 5173 }
})
