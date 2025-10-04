import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const reactRefreshCompatibility = (): PluginOption => ({
  name: 'react-refresh-compatibility',
  apply: 'serve',
  enforce: 'post',
  transform(code, id) {
    if (!id.includes('/@react-refresh')) return null

    if (!code.includes('exports.injectIntoGlobalHook')) return null

    return {
      code: `${code}\nexport const injectIntoGlobalHook = exports.injectIntoGlobalHook;\n`,
      map: null
    }
  }
})

export default defineConfig({
  plugins: [
    react(),
    reactRefreshCompatibility(),
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
