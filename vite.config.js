import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Installable + offline: precache the app shell and fonts, runtime-cache
    // the Salamander samples so the piano still speaks on a plane. The
    // service worker is generated at build time only; dev is untouched.
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Keylit",
        short_name: "Keylit",
        description: "Drop a guitar chord sheet, see it on a piano — lit keys, voice leading, numbers, and a band.",
        theme_color: "#F7F3E9",
        background_color: "#F7F3E9",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2,png}"],
        // The personal corpus lives under public/ locally and lands in dist/;
        // it never deploys, and its FILENAMES must never leak into the
        // precache manifest either. The songbook ships but is fetched lazily.
        globIgnores: ["corpus/**", "songbook/**"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://tonejs.github.io",
            handler: "CacheFirst",
            options: {
              cacheName: "salamander-samples",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Vendors split from app code: Tone (~200KB) loads in parallel and
        // caches across app deploys instead of riding one monolith chunk.
        manualChunks: {
          tone: ["tone"],
          react: ["react", "react-dom"],
          icons: ["lucide-react"],
        },
      },
    },
  },
  // Expose on the LAN (0.0.0.0) so a phone on the same Wi-Fi can load it.
  server: { host: true },
  preview: { host: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}", "api/**/*.test.js"],
  },
});
