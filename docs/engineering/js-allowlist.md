# JS Allowlist（R8 迁移跟踪）

> 生产源码 TypeScript 迁移的权威清单。每条记录：文件/迁移批次/原因/删除条件。
> 最终 allowlist 只允许明确说明原因、owner 和删除条件的第三方桥或工具脚本。

## 当前规模（2026-08-08）

- 生产/工具 JS 文件：274
- TS 文件：67（全部在 packages/ 与 apps 测试目录；apps 生产 TS 为 0）

## 迁移顺序（按依赖序，R8）

| 批次 | 范围                                                    | 数量 | 删除条件                                    |
| ---- | ------------------------------------------------------- | ---- | ------------------------------------------- |
| B1   | server 纯 domain/repository/service（先 settings 样板） | ~15  | tsup CJS 产物被 index.js 引用               |
| B2   | server route 与 composition                             | ~36  | 全部 route 迁移后 src/index.js 换 dist 入口 |
| B3   | Electron main/preload                                   | 2    | tsup CJS 产物被 electron-builder 引用       |

### B3 已落地（C4 首批）

| 文件                                        | 状态                            | 说明                                                                                               |
| ------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/main.ts`                  | TS 权威                         | C4 样板（2026-08-08）：tsup 单产物 dist/main.js（bundle startup-state-machine，external electron） |
| `apps/desktop/main.cjs`                     | 薄转发桥                        | 仅 `require('./dist/main.js')`；electron-builder files 含产物；preload 迁移后删除                  |
| `apps/desktop/src/startup-state-machine.js` | JS 权威                         | 被 main.ts 产物 bundle（无独立产物）；B6 批次可迁 TS                                               |
| B4                                          | web shared contracts/controller | ~30                                                                                                | Vite 原生支持 TS |

### B4 已落地（C3 首批）

| 文件                                                                    | 状态                      | 说明                                                                                     |
| ----------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/src/math/shared/frame-task.ts`                                | TS 权威                   | C3 样板（2026-08-08）：无 DOM 纯逻辑（帧合并调度）；Vite 消费路径不变，相关测试迁 vitest |
| `test/web/math-{frame-task,graph-readouts,graph-performance}.vitest.ts` | vitest                    | node:test 迁移（D7 样板，`*.vitest.ts` glob 与 cjs 不交叉）                              |
| `apps/web/src/chemistry/ai-classroom/chem-text.ts`                      | TS 权威                   | C3 后续（2026-08-08）：LaTeX→HTML 纯字符串处理；消费方 Vite 解析 .ts，测试迁 vitest      |
| `test/web/chem-text.vitest.ts`                                          | vitest                    | D-test 第二批（随 TS 化迁移，glob 与 cjs 不交叉）                                        |
| B5                                                                      | subject/classroom shell   | ~25                                                                                      | manifest/loader 消费方迁移 |
| B6                                                                      | 化学与数学非视觉纯逻辑    | ~90                                                                                      | 行为合同测试通过后逐模块   |
| B7                                                                      | Three.js/JSXGraph adapter | ~20                                                                                      | 集中 adapter 隔离后        |

### B7 已评估（2026-08-08）

- three 使用面已集中为 4 个渲染器（molecule/viewer3d、electron/renderer、math/solid、bookshelf/stage——产品视觉）；jsxgraph 已集中为 jsx-board 单点（graph 渲染经其间接）
- `test/web/renderer-adapter-boundary.test.cjs` 锁定边界（2/2）：无散落 import；控制器/纯逻辑层不得直接 import 渲染器

### B1 已落地（以 TS 为权威源）

| 文件                                           | 状态     | 说明                                                                                                     |
| ---------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `apps/server/src/domain/settings-policy.ts`    | TS 权威  | 已迁（R5.1）；dist/domain 产物被 routes 引用                                                             |
| `apps/server/src/services/settings-service.ts` | TS 权威  | C1 样板（2026-08-08）：错误用 domain-core，形状用 subject-settings/contracts 类型                        |
| `apps/server/src/routes/settings.ts`           | TS 权威  | B2 第二批（2026-08-08）：v1 settings 工厂 + db 注入；dist 产物 2 级引用（routes 层）                     |
| `apps/server/src/routes/settings.js`           | 薄转发桥 | 仅导出 `createSettingsRouter`（组合根注入 db 调用）；B2 完成后删除                                       |
| `apps/server/src/routes/ai/lesson.ts`          | TS 权威  | B2 第三批（2026-08-08）：服务注入模式（explainConcept 组合根注入，产物无 db 状态）                       |
| `apps/server/src/routes/ai/lesson.js`          | 薄转发桥 | 仅导出 `createLessonRouter`；B2 完成后删除                                                               |
| `apps/server/src/routes/ai/molecules.ts`       | TS 权威  | B2 第四批（2026-08-08）：服务注入（callDeepSeekChat 组合根注入）；AI 提示词随源                          |
| `apps/server/src/routes/ai/molecules.js`       | 薄转发桥 | 仅导出 `createMoleculeRouter`；B2 完成后删除                                                             |
| `apps/server/src/routes/ai/quiz.ts`            | TS 权威  | B2 第五批（2026-08-08）：服务 + 限流状态注入（quiz-assist-limit 模块级计数不可 inline）                  |
| `apps/server/src/routes/ai/quiz.js`            | 薄转发桥 | 仅导出 `createQuizRouter`；B2 完成后删除                                                                 |
| `apps/server/src/routes/ai/chemistry.ts`       | TS 权威  | B2 第六批（2026-08-08）：ai-service 7 函数注入                                                           |
| `apps/server/src/routes/ai/chemistry.js`       | 薄转发桥 | 仅导出 `createChemistryAiRouter`；B2 完成后删除                                                          |
| `apps/server/src/routes/chemistry/quiz.ts`     | TS 权威  | B2 第七批（2026-08-08）：sessions/wrong-book 服务注入                                                    |
| `apps/server/src/routes/chemistry/quiz.js`     | 薄转发桥 | 仅导出 `createQuizRouter`；B2 完成后删除                                                                 |
| `apps/server/src/services/settings-service.js` | 薄转发桥 | 仅 `require('../../dist/services/settings-service.js')`；B2 route 迁移后随 src/index.js 换 dist 入口删除 |

## 保留为 JS 的第三方桥/工具（最终 allowlist 允许）

| 文件                            | 原因                                    | owner   | 删除条件           |
| ------------------------------- | --------------------------------------- | ------- | ------------------ |
| apps/desktop/main.cjs（迁移前） | Electron 权威入口                       | desktop | B3 完成后删除      |
| scripts/*.mjs                   | 构建/工具脚本（Node 直跑）              | tooling | 无（工具脚本允许） |
| tooling/**/*.mjs                | 门禁脚本                                | tooling | 无（工具脚本允许） |
| test/**/*.cjs                   | node:test 套件（Vitest 目录迁移后删除） | test    | 对应目录迁移完成   |

## 纪律

- 每批迁移先写/保留行为合同；同一提交删除对应 JS（不留双份权威实现）。
- GraphDocument 不能持久化 JSXGraph/DOM/runtime；高频循环不经过通用 DOM diff。
- 不为快速清零使用大范围 any（lint no-explicit-any error 门禁已生效）。
- 迁移目录时在对应 tsconfig 开启 checkJs 渐进验证。
