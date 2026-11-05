import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Vite configuration – replaces the hidden config that Create React App used.
// Docs: https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Makes the app installable ("Zum Home-Bildschirm"): writes the app manifest (name, icons,
    // colors) and a service worker that keeps the app's own files on the device, so it starts
    // quickly. Memories and photos are still loaded from the server.
    // Docs: https://vite-pwa-org.netlify.app/
    VitePWA({
      // New versions are applied by our own code in src/main.jsx (right away, but never while
      // the add/edit form is open)
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Storybook',
        short_name: 'Storybook',
        description: 'Unser Storybook',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone', // opens like an app, without the browser's address bar
        // Android's own start screen (before the app's start screen): this color with the icon
        // and the name. A violet from the icon, so the icon doesn't sit on a white page.
        background_color: '#7c6ae6',
        theme_color: '#a855f7', // color of the status bar on Android (the header's purple)
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app files to keep on the device (not the big app icons: the phone fetches those once,
        // when the app is added to the home screen)
        globPatterns: ['**/*.{js,css,html,webmanifest}', 'favicon.ico', 'splash-icon.webp'],
        // pages like /memory/12 are all answered with the app (index.html) ...
        navigateFallback: '/index.html',
        // ... except the server's own addresses
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
      },
    }),
  ],
  server: {
    // Same port as before (the server allows requests from localhost:3000).
    port: 3000,
    // The backend's addresses, passed on to it (like nginx does on the server), so app and API
    // share one address and the login cookie is sent with every request and photo.
    proxy: {
      '/api': 'http://localhost:3001',
      '/uploads': 'http://localhost:3001',
      '/tiles': 'http://localhost:3001',
    },
  },
  build: {
    // Vite's default is "dist"; we keep "build" so update_nginx.sh keeps working unchanged.
    outDir: 'build',
    // The app is one ~650 kB file (about the same as with Create React App); that's fine for this project.
    chunkSizeWarningLimit: 1000,
  },
});
