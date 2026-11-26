import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: { target: 'es2020', outDir: '../dist-pf', emptyOutDir: true, chunkSizeWarningLimit: 3000, assetsInlineLimit: 100000000,
    rollupOptions: { output: { inlineDynamicImports: true } } },
  server: { host: true },
});
