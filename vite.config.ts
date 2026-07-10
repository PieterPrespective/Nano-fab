import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /<repo-name>/, so the base path must
// match in production builds. Override with VITE_BASE for other hosts.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/Nano-fab/',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
