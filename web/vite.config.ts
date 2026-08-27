import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Installable-to-home-screen PWA. The point is the field: a coach on a
    // phone at practice or a meet gets a real app icon, no browser chrome
    // eating vertical space on the attendance grid and the live timer, and
    // an app shell that opens instantly instead of re-downloading 2MB of
    // JS over a school's wifi.
    VitePWA({
      // 'prompt', not 'autoUpdate', deliberately. autoUpdate reloads the
      // page the moment a new build's service worker takes over — which,
      // on the screens this exists for, means a reload in the middle of
      // entering a week of attendance or timing a race. Instead the new
      // version installs quietly in the background and
      // registerServiceWorker.ts (called from main.tsx) asks before
      // applying it.
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        id: '/',
        name: 'LeadPack XC',
        short_name: 'LeadPack',
        description: 'Roster, attendance, splits and race analytics for cross-country coaches.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // No `orientation` lock on purpose: attendance and the timer want
        // portrait, but the analytics charts and the results grid are
        // genuinely better turned sideways. Let the device decide.
        theme_color: '#005827',
        background_color: '#fafdfa',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Separate maskable art (full-bleed, mark pulled into the
          // central 80% safe zone) rather than tagging the same file
          // 'any maskable'. The 'any' icon is a rounded square on
          // transparency; a launcher that applies its own circular mask
          // to that would clip the corners off the tile and leave the
          // letters crowding the edge.
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the built shell only. Nothing here caches /api — every
        // number this app shows (attendance, splits, results) is one a
        // coach acts on, and a stale-but-plausible roster or session is
        // worse than no data at all. Offline currently means "the app
        // opens and tells you it can't reach the server", not "the app
        // shows you yesterday's answers".
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The main chunk is ~1.9MB, just under Workbox's 2MB default —
        // close enough that a normal dependency bump would silently drop
        // it from the precache and quietly break offline launch.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: '/index.html',
        // An SPA navigate fallback will happily answer an API request with
        // index.html if it isn't told otherwise. In production the backend
        // is same-origin under /api (see api/axios.ts), so this exclusion
        // is what stops the service worker from serving HTML to axios.
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Off in dev: a service worker caching a Vite dev server's module
        // graph is a reliable way to spend an afternoon debugging an edit
        // that "didn't apply".
        enabled: false,
      },
    }),
  ],
  // Carried over from the stale compiled vite.config.js that used to sit
  // next to this file. Vite resolves vite.config.js BEFORE vite.config.ts,
  // so that leftover — not this file — was the config every build and dev
  // server actually ran, which is why the chunking and hashed asset names
  // below never took effect. It has been deleted; these two settings were
  // the only thing it had that this file didn't.
  server: {
    port: 5173,
    host: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Add hash to filenames for cache busting
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash].[ext]',
        // No 'firebase' chunk: this app moved off Firebase to Neon
        // Auth, and firebase is no longer a dependency. It sat here
        // harmlessly only because this whole config was dead.
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts', 'd3-force', 'd3-selection'],
          ui: ['@radix-ui/react-tabs', '@radix-ui/react-dialog', '@radix-ui/react-select'],
          router: ['react-router-dom']
        }
      },
      onwarn(warning, warn) {
        // Suppress TypeScript warnings during build
        if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return
        warn(warning)
      }
    },
    chunkSizeWarningLimit: 1000,
    // Clear output directory before build
    emptyOutDir: true
  }
})
