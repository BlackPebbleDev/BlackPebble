import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// 5173 (Vite default) unless overridden. Must not default to 8080 — that's
// the API server's port.
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 5173;

const basePath = process.env.BASE_PATH ?? "/";

// The frontend calls the API at the relative path /api; in dev, Vite proxies
// those requests to the local Express server.
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://localhost:8080";

export default defineConfig({
  base: basePath,
  plugins: [
    nodePolyfills({
      include: ["buffer", "process", "util", "stream", "events"],
      globals: { Buffer: true, process: true, global: true }
    }),
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    include: ["chart.js", "react-chartjs-2"],
    esbuildOptions: {
      target: "esnext",
      define: { global: "globalThis" }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  // Load .env from the repo root so all packages share one env file.
  // Only VITE_-prefixed vars are exposed to client code.
  envDir: path.resolve(import.meta.dirname, "..", ".."),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
  },
});
