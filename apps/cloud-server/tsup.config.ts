import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  target: 'node20',
  outDir: 'dist',
  external: ['pg', 'express'],
  noExternal: [/^@xiaohuang\//],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
});
