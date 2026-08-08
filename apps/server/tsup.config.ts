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
    'routes/settings': 'src/routes/settings.ts',
    'routes/ai/lesson': 'src/routes/ai/lesson.ts',
    'routes/ai/molecules': 'src/routes/ai/molecules.ts',
    'routes/ai/quiz': 'src/routes/ai/quiz.ts',
    'routes/ai/chemistry': 'src/routes/ai/chemistry.ts',
    'routes/chemistry/quiz': 'src/routes/chemistry/quiz.ts',
    'routes/chemistry/molecules': 'src/routes/chemistry/molecules.ts',
    'routes/chemistry/students': 'src/routes/chemistry/students.ts',
    'routes/chemistry/reactions': 'src/routes/chemistry/reactions.ts',
    'routes/chemistry/labs': 'src/routes/chemistry/labs.ts',
    'routes/chemistry/lesson-packs': 'src/routes/chemistry/lesson-packs.ts',
    'routes/chemistry/mastery': 'src/routes/chemistry/mastery.ts',
    'routes/chemistry/balance-scripts': 'src/routes/chemistry/balance-scripts.ts',
    'routes/chemistry/offline-quiz': 'src/routes/chemistry/offline-quiz.ts',
    'routes/ai/math': 'src/routes/ai/math.ts',
  },
  format: ['cjs'],
  dts: true,
  clean: true,
  target: 'es2022',
  outDir: 'dist',
  // dist 产物引用保持运行时解析（与 routes/settings.js 的 ../../dist 同构合同；
  // 源/产物统一 2 级（v2 子层 3 级）恒解析到 serverRoot/dist）；sql.js 为
  // 运行时依赖（stage 安装 node_modules 提供），不 bundle。
  external: [/dist\//, /^sql\.js(?:\/|$)/],
});
