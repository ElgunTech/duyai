import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const API_PORT = Number(process.env.PORT ?? 3000);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In development the Express API runs separately; forward /api to it.
    proxy: { "/api": `http://localhost:${API_PORT}` },
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1500, // the Azure Speech SDK alone is ~1 MB
  },
  test: {
    include: ["src/**/*.test.ts", "server/**/*.test.js", "eval/**/*.test.js"],
  },
});
