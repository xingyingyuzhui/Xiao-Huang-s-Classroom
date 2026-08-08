/**
 * Server tsup 构建（R8 B1 / C1）：纯 domain + service 先 TS 化。
 * 产物 CJS 到 dist/（Node 18/ES2022 兼容子集，pkg 窗口内保持）。
 * route 仍为 JS，逐步迁移；同一批次完成后删除对应 JS。
 * entry key 保持既有产物路径：dist/domain/settings-policy.js、
 * dist/services/settings-service.js（routes 经薄转发 require）。
 */
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'domain/settings-policy': 'src/domain/settings-policy.ts',
    'services/settings-service': 'src/services/settings-service.ts',
  },
  format: ['cjs'],
  dts: true,
  clean: true,
  target: 'es2022',
  outDir: 'dist',
});
