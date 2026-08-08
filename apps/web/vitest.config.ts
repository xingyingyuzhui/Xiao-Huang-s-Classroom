import { defineConfig } from 'vitest/config';

/**
 * Web vitest 配置（C3 首批：frame-task 相关测试迁 vitest，D7 样板）。
 * include 只匹配 *.vitest.ts——node:test（test/web/*.cjs）与 vitest 并行，
 * 双轨期间各自 glob 不交叉；迁移完成后 node:test glob 范围收窄。
 */
export default defineConfig({
  test: {
    include: ['../../test/web/**/*.vitest.ts'],
    environment: 'node',
  },
});
