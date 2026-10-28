/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// BASE_PATH lets the same build run at the domain root (dev, custom domain)
// or under a sub-path such as GitHub Pages' /<repo>/.
declare const process: { env: Record<string, string | undefined> }
const base = process.env.BASE_PATH ?? '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Icons reach the precache through includeAssets and the manifest; globbing
      // them as well would list them twice, and duplicate entries make the
      // service worker fail to install.
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'Chalk — training log',
        short_name: 'Chalk',
        description: 'Lifting, cardio, body and calorie tracking that works offline and syncs through Google Drive.',
        theme_color: '#111315',
        background_color: '#111315',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: ['**/*vietnamese*'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  // 4173 (Vite's default) is often claimed by another project's service worker on localhost.
  preview: { port: 4180 },
  test: {
    environment: 'node',
  },
})
