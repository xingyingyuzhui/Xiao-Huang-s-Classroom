/**
 * Server tsup 构建（R8 B1）：纯 domain/repository 先 TS 化。
 * 产物 CJS 到 dist/（Node 18/ES2022 兼容子集，pkg 窗口内保持）。
 * route/service 仍为 JS，逐步迁移；同一批次完成后删除对应 JS。
 */
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/domain/*.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  target: 'es2022',
  outDir: 'dist/domain',
});
