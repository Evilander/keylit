import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose on the LAN (0.0.0.0) so a phone on the same Wi-Fi can load it.
  server: { host: true },
  preview: { host: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
  },
});
