// vite.config.js
import { defineConfig } from 'vite';
import path from 'path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'NutriAgenda',
        short_name: 'NutriAgenda',
        description: 'Gestor Nutricional Offline-First',
        theme_color: '#212529',
        background_color: '#212529',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        maximumFileSizeToCacheInBytes: 5000000,
        // Configurar runtime caching para scripts o fuentes externas si es necesario
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/unpkg\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'unpkg-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],

  root: path.resolve(__dirname, 'src'),
  resolve: {
    alias: {
      '~bootstrap': path.resolve(__dirname, 'node_modules/bootstrap'),
    }
  },
  server: {
    port: 8080,
    hot: true,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    reportCompressedSize: false,
    // Evitar convertir archivos grandes en base64
    assetsInlineLimit: 0, // No convertir archivos en base64 si son grandes
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'src/index.html'),
        grid: path.resolve(__dirname, 'src/grid.html'),
        scan: path.resolve(__dirname, 'src/scan.html'),
        recipes: path.resolve(__dirname, 'src/recipes.html'),
        'recipe-editor': path.resolve(__dirname, 'src/recipe-editor.html'),
        diary: path.resolve(__dirname, 'src/diary.html'),
        'meal-photos': path.resolve(__dirname, 'src/meal-photos.html'),
        pantry: path.resolve(__dirname, 'src/pantry.html'),
        dashboard: path.resolve(__dirname, 'src/dashboard.html'),
        'db-viewer': path.resolve(__dirname, 'src/db-viewer.html'),
        settings: path.resolve(__dirname, 'src/settings.html'),
      }
    },
  },
  publicDir: 'public',
  watch: {
    usePolling: true, // Para manejar grandes cantidades de archivos en desarrollo
    interval: 1000,   // Intervalo para el polling
  },
});
