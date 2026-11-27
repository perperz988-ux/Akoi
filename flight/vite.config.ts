import { defineConfig } from 'vite';
export default defineConfig({
  root: __dirname,
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000,
    assetsInlineLimit: 0,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  server: { host: true, port: 5174 },
});
