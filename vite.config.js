import { defineConfig } from "vite";
export default defineConfig({
  // Native file events can be missed by the desktop workspace filesystem.
  server: { watch: { usePolling: true, interval: 500, ignored: ["**/output/**"] } },
  build: {
    rollupOptions: {
      output: { manualChunks: { yaml: ["yaml"] } },
    },
  },
});
