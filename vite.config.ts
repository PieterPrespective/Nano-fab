import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site from /<repo-name>/, so the base path must
// match in production builds. Override with VITE_BASE for other hosts.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/Nano-fab/',
  define: {
    // Build stamp shown in the spike HUD so stale-content confusion is
    // diagnosable at a glance. GITHUB_SHA is set in CI; 'dev' locally.
    __BUILD_SHA__: JSON.stringify((process.env.GITHUB_SHA ?? 'dev').slice(0, 7)),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
        // NF3-0 renderer perf spike (throwaway; see prompts/nf03/07 §NF3-0)
        spike: 'spike.html',
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
