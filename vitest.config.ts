import { defineConfig } from 'vitest/config';

// Test sources — both the component package (`src/`) and the showcase site
// (`site/`). Default environment is node; individual files opt into DOM
// with a `// @vitest-environment happy-dom` directive.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'site/**/*.test.ts'],
  },
});
