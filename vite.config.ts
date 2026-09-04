import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const emptyMod = path.resolve(__dirname, 'src/lib/empty-module.ts');

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      'node:https': emptyMod,
      'node:fs': emptyMod,
      'node:path': emptyMod,
      'node:os': emptyMod,
      'https': emptyMod,
      'http': emptyMod,
      'fs': emptyMod,
      'path': emptyMod,
      'os': emptyMod,
    },
  },
  optimizeDeps: {
    exclude: ['pptxgenjs'],
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    outDir: 'D:/llm-wiki-dist',
    emptyOutDir: true,
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: false,
    rollupOptions: {
      external: [

        'express', 'image-size', 'sizeof',
      ],
    },
  },
});
