import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'src/lib/__tests__/*.test.ts',
      'src/lib/aminer/__tests__/*.test.ts',
      'src/lib/agent/__tests__/*.test.ts',
      'src/lib/wps/__tests__/*.test.ts',
      'src/stores/__tests__/*.test.ts',
      'src/components/**/*.test.tsx',
      'src/components/**/*.test.ts',
    ],
    server: {
      deps: {
        inline: ['zustand'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/lib/__tests__/**', 'src/lib/aminer/__tests__/**', 'src/**/*.test.{ts,tsx}'],
    },
  },
  resolve: {
    alias: {
      react: resolve(__dirname, 'src/__mocks__/react.ts'),
    },
  },
});