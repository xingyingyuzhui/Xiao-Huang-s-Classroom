# 旧债登记表（允许暂存，有界）

> Program 0 Task 0.3 产物。此处登记的旧债是**有删除条件**的暂存项；不属于任何 Program 的债务视为必须立即处理，不得登记。
> 每条必须：有归属 Program、有删除条件、有跟踪状态。禁止「永远不删」。

## 债务清单

| #   | 债务                                   | 现状位置                                                                                                                   | 风险                 | 归属 Program                                | 删除条件                                                         | 状态                                    |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------- |
| D1  | 手工维护的 `.js/.cjs` 双份产物逻辑     | `apps/server`（build 脚本）、`apps/desktop` main.cjs                                                                       | 双轨漂移             | P5（server TS 化）、P6（electron TS 化）    | 对应源码迁 TS + tsup 双产物后删除手工双份                        | 待迁移                                  |
| D2  | `pkg` 便携版（Node 18 单文件 Windows） | `apps/server`（pkg 依赖、build:exe）、main.cjs `isPkg` 分支                                                                | 过渡兼容产物长期存活 | P6（Task 6.5）                              | Electron portable 等价验收完成（启动/数据导入/API/AI 设置/离线） | 过渡窗口内保持 smoke                    |
| D3  | module 级 DOM 捕获                     | `apps/web/src/math/graph/function-panel.js`（createFunctionPanelController 模块作用域捕获 `mathFnList`/`mathFnEditModal`） | 重挂载时引用旧节点   | P4（subject-kit/feature loader 统一）       | 面板控制器随 feature mount 创建、dispose 释放                    | 待迁移（当前教室 DOM 复用，未触发故障） |
| D4  | `innerHTML` 模板残留                   | 部分 feature UI（如函数列表早期版本、读数卡）                                                                              | 注入面               | P3（ui 组件替换）                           | 迁移到 DOM API 组件或 textContent 输出                           | 函数列表已 DOM API；残余点逐一清        |
| D5  | `graph/index.js` 残余编排逻辑          | `apps/web/src/math/graph/index.js`（690 行，门禁 <700）                                                                    | 入口继续膨胀         | P7（质量收口）                              | 保持 <700 行门禁；新职责不回流                                   | 门禁生效中                              |
| D6  | 无 lint/format/typecheck 门禁的旧 JS   | 全仓 250 个 JS 文件                                                                                                        | 无自动质量           | P1（Task 1.3/1.4）+ P7（JS allowlist 清零） | 基线清单逐阶段清零；生产源码 TS 化                               | 待建基线                                |
| D7  | 测试双轨风险（node:test → Vitest）     | `test/**/*.test.cjs`                                                                                                       | 重复用例             | P7（Task 7.1）                              | 目录迁移完成后删除旧 runner 重复用例                             | 未开始                                  |
| D8  | JSXGraph `eval` 第三方警告             | 三方依赖 jessiecode.js                                                                                                     | 安全/构建警告        | P7（性能收口）                              | 单独评估 CSP/版本/替代；登记不屏蔽                               | 风险登记                                |
| D9  | `apps/server/src/data/` 历史路径       | 识别逻辑                                                                                                                   | 新写入目标混淆       | P5（migration 框架）                        | 仅识别不写入；文档明确                                           | 待处理                                  |
| D10 | module-boundaries 结构测试人工维护     | `test/shared/module-boundaries.test.cjs`                                                                                   | 人工清单漂移         | P1（Task 1.6 架构门禁脚本化）               | 脚本化扫描替代正则清单                                           | 待迁移                                  |

## 跟踪规则

1. 每个 Program 结束时更新本表状态列。
2. 删除某条债务时，在「删除条件」列填达成日期与提交 hash。
3. 新增债务必须经 Program 负责人确认并写明删除条件；无条件的债务不得入表。

| D11 | 旧 CSS 重复选择器与结构问题 | `apps/web/src/shared/styles/**`（8 处 no-duplicate-selectors） | 级联歧义 | P3（五主题收口） | stylelint 全仓清零 | 已登记（stylelint 门禁仅查新范围） |

| D12 | node:test 并行 IPC 序列化偶发失败（`Unable to deserialize cloned data`） | 根 `npm test`（无并发限制时 ~1/8 概率触发，与业务改动无关） | 测试结果不可靠 | P7（Vitest 迁移后自然消除） | 根 test 脚本已固定 `--test-concurrency=4`（10/10 稳定）；Vitest 目录迁移完成后删除该限制 | 已控制（并发数固定） |

| D13 | catalog/registry 直连 glue（hub/classroom 仍直接走 registry，manifest adapter 已建） | ~~`apps/web/src/subjects/hub.js`、`classrooms/registry.js` 直连~~ | 双入口并存 | P7（JS 收口） | ~~hub/classroom 消费方迁移到 `subjectManifest()` 后删除直连；结构测试更新~~ | **已关闭**（2026-08-08，B4：catalog 仅 manifest 直连由 `subject-catalog-entry.test.cjs` 锁定，home-shell 已迁 manifest） |

| D14 | Server 源码仍为 JS（tsup 骨架已建，src/index.js 为 Electron/pkg 权威入口） | `apps/server/src/**`（51 文件） | 双轨/类型缺失 | P6（pkg 退役后） | pkg 退役（Task 6.5）后按依赖序迁 TS，tsup CJS 产物替代 src 直引 | 骨架就位（Task 5.1） |
