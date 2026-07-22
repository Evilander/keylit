import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
    include: ["src/**/*.test.{js,jsx}"],
  },
});
