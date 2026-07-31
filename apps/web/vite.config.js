import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.API_PROXY || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@xiaohuang/subject-settings': fileURLToPath(
        new URL('../../packages/subject-settings/index.js', import.meta.url),
      ),
      'jsxgraph/distrib/jsxgraph.css': fileURLToPath(
        new URL('../../node_modules/jsxgraph/distrib/jsxgraph.css', import.meta.url),
      ),
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@subjects': fileURLToPath(new URL('./src/subjects', import.meta.url)),
      '@chemistry': fileURLToPath(new URL('./src/chemistry', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: ['@xiaohuang/subject-settings', 'jsxgraph', 'katex', 'three'],
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          mathviz: ['jsxgraph', 'katex'],
          animation: ['animejs', 'canvas-confetti'],
        },
      },
    },
  },
});
