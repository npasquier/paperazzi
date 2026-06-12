import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Test runner config. Server-side modules only (lib/, utils/, route
// handlers) — they're pure or mockable, so plain Node is enough and we
// avoid a DOM environment dependency. Component/hook tests would need
// `environment: 'jsdom'` plus @testing-library/react; add that when
// (if) UI tests become worth their maintenance cost.
//
// Run with `npm test`, or `npm run check` for the full pre-push gate
// (typecheck + lint + tests — the same trio a CI job would run).
export default defineConfig({
  resolve: {
    alias: {
      // Mirror tsconfig's `@/*` → `./*` path mapping.
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
