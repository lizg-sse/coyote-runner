import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths let the same build run at a domain root, under a
  // sub-path such as /games/coyote/, or from local files inside a WebView.
  base: "./",
  build: {
    target: "es2020",
    sourcemap: "hidden",
    assetsInlineLimit: 0,
  },
  server: { host: "127.0.0.1", port: 5173 },
  preview: { host: "127.0.0.1", port: 4173 },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
