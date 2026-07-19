import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'

const DATE_VERSION = new Date().toLocaleString('fr-FR', {
  timeZone: 'Europe/Paris', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
})

// /version.json publié à chaque déploiement : l'app compare sa version à celle
// du serveur — le nuage SAIT quand une mise à jour existe, sans deviner.
function publierVersion(): Plugin {
  return {
    name: 'publier-version',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: DATE_VERSION }) })
    },
  }
}

export default defineConfig({
  // La date de compilation, affichée dans Menu → Mise à jour.
  define: {
    __DATE_VERSION__: JSON.stringify(DATE_VERSION),
  },
  plugins: [
    publierVersion(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icones/icone.svg'],
      manifest: {
        name: 'STG',
        short_name: 'STG',
        description: 'STG — Stéphane, Tiphaine, Gabriel. Le quotidien, en paix.',
        lang: 'fr',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        background_color: '#FCFCFA',
        theme_color: '#FCFCFA',
        icons: [
          { src: '/icones/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icones/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icones/icone-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icones/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Le Sas — capture rapide',
            url: '/?sas=1',
            icons: [{ src: '/icones/icone-192.png', sizes: '192x192' }],
          },
          {
            name: 'Ajouter aux courses',
            url: '/maison?ajout=courses',
            icons: [{ src: '/icones/icone-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        importScripts: ['sw-push.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Données Supabase : le réseau d'abord, le cache en secours (mode avion)
            urlPattern: ({ url }) => url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'donnees-foyer',
              networkTimeoutSeconds: 4,
              expiration: { maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
