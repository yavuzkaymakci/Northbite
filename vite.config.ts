import { defineConfig } from 'vite';

export default defineConfig({
  // Served from https://yavuzkaymakci.github.io/Northbite/ (GitHub Pages project site).
  base: '/Northbite/',
  server: { host: true },
  preview: { host: true },
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 },
});
