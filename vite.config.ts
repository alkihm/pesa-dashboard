/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // The app registers the worker itself (src/main.tsx) and takes updates on the next load.
      injectRegister: false,
      registerType: "autoUpdate",
      manifest: {
        name: "Pesa Dashboard",
        short_name: "Budget",
        description: "Balances, bills, budgets and reconciliation from your M-PESA and bank SMS.",
        // `source=pwa` tells the app it was opened from the home screen (src/app/lastRoute.ts).
        start_url: "/?source=pwa",
        scope: "/",
        display: "standalone",
        // Colours mirror the light-theme tokens: page background and header.
        background_color: "#e3e9f2",
        theme_color: "#1f5f7a",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the app shell so it opens with no network; data offline comes with [4.5].
        globPatterns: ["**/*.{js,css,html,png,woff2}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    // Lets tests read the tokens with ?raw; other stylesheets stay stubbed.
    css: { include: [/tokens\.css/] },
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
