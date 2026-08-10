# JS 热点地图（Track C1 · 风险化解计划 §5）

> 产出：`docs/superpowers/plans/2026-08-10-main-divergence-and-js-risk-mitigation.md` §5（Track C）。
> 数据来源：2026-08-10 以 `wc -l` 实测 + `tooling/architecture/large-file-budget.json`（41 个 >400 行登记）复核；
> 行数为**改前必须复核**的参考值，动手前以 `wc -l <file>` 现测为准。
> 目标读者：任何要改「业务 JS」的 agent / 人。改前先在本表找到命中行，跑「改前必跑」，再动代码。

## 用法（30 秒版）

1. 定位改动文件命中下面哪一行（表一 9 行 = 风险计划 §5 C1 清单；表二 = 扫描新热点）。
2. 跑该行「改前必跑」命令（至少：命中测试 + `npm run quality:fast`）。
3. 遵守「硬性红线」节；涉及 `@xiaohuang/ui` 与危险按钮走 `ui-library.md` / `ui-dialog-audit.md`。
4. 合 main 前 `npm run quality:fast`；推远端 / 发版前 `npm run quality`（见 `quality-commands.md`）。
5. C3 强制清单（`safe-change-playbook.md` 由 risk-bf 落地，本文「改前必跑」即其数据源）。

## 硬性红线（所有热点通用）

- 禁止新增 `window.confirm` / 裸危险按钮 / 主题硬编码色（`test/shared/ui-no-raw-button-contract.test.cjs`、`ui-adoption-contract.test.cjs` 锁定）。
- 禁止不可信 `innerHTML`（用户字符串 / 表达式 / 导入数据必须 `textContent` / DOM API）。
- 禁止把新逻辑塞回 `graph/index.js`（结构测锁定 <700）。
- 禁止 `git push origin main` / `--force`（风险计划 §0.2）；合本地 main 前 quality:fast 绿。
- 改动后同步更新 `docs/engineering/large-file-budget.json`（若行数变化）与 `js-allowlist.md`（若 TS 化）。

## 表一 · 风险计划 §5 九大热点

| 热点          | 路径（实测行数）                                                                                                                                                                                                 | 风险类型                               | 改前必跑                                                                                                                                                                                                                                                | 硬化策略                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 函数画布入口  | `apps/web/src/math/graph/index.js`（690）                                                                                                                                                                        | 行数/编排（D5）；<700 门禁             | `node --test test/web/math-graph-structure.test.cjs` 再 `node --test test/web/math-graph-*.cjs test/web/math-function-*.cjs`；合前 `npm run quality:fast`                                                                                               | 禁止新职责回流（结构测锁定）；纯数值/校验抽 TS（样板：`rate-of-change.ts`，见 C2）    |
| 函数侧栏      | `apps/web/src/math/graph/function-panel.js`（635）/ `function-list-view.js`（279）/ `function-editor.js`（214）                                                                                                  | DOM 捕获（D3）、UI 生命周期            | `node --test test/web/math-function-panel-controller.test.cjs` + `npx vitest run test/web/math-function-panel-lifecycle.vitest.ts test/web/math-function-records.vitest.ts`（apps/web 下）                                                              | B5 dispose 样板已在（二次 mount 合同测锁定）；保持，勿回退 dataset 标记清理           |
| 板工具/笔记   | `apps/web/src/math/shared/board-tools.js`（495）/ `board-notes.js`（888）                                                                                                                                        | UI/事件、innerHTML 回流（D4）          | `node --test test/web/math-board-notes.test.cjs test/web/math-board-contract.test.cjs` + `npx vitest run test/web/math-board-notes-lifecycle.vitest.ts`；涉及绘制再跑 `math-board-{compass,snap,label}` 相关                                            | 已库化（board-label.js 594 行为纯函数 TS 候选）；勿回流 innerHTML                     |
| 设置/弹窗     | `apps/web/src/shared/ui/settings.js`（532）/ `app-dialog.js`（326）                                                                                                                                              | 全局壳、焦点、Esc 合同（U2/U4）        | `node --test test/web/app-dialog-scroll-lock.test.cjs test/shared/ui-adoption-contract.test.cjs test/shared/ui-no-raw-button-contract.test.cjs` + `npx vitest run test/web/settings-focus-busy.vitest.ts test/web/settings-toast-consumption.vitest.ts` | 确认走 `appConfirm` 家族；Esc/焦点合同已修（U2），改弹窗先跑 dialog 合同              |
| 分子列表      | `apps/web/src/chemistry/molecule/list.js`（522）                                                                                                                                                                 | 列表/删除/确认/焦点                    | `npx vitest run test/web/molecule-list.vitest.ts test/web/molecule-list-experience.vitest.ts`（apps/web 下）                                                                                                                                            | 已 polish（U3）：删除走命名确认 + busy/guard + 焦点还原；保持                         |
| AI 课壳       | `apps/web/src/chemistry/ai-classroom/balance-shell.js`（1388）/ `lab-shell.js`（968）/ `quiz-shell.js`（434）/ `lesson-packs.js`（411）                                                                          | 大文件/编排/确认（B3 下一刀）          | `npx vitest run test/web/balance-model.vitest.ts test/web/lab-model.vitest.ts test/web/lab-prestudy.vitest.ts test/web/lesson-packs-experience.vitest.ts test/web/offline-quiz-layout.vitest.ts`                                                        | 已 model/views 分层；**编排瘦身前先补行为测试**；新增逻辑进 model/views，不进 shell   |
| 学科壳        | `apps/web/src/subjects/classrooms/`（`chemistry-classroom.ts` / `math-classroom.ts` / `physics-classroom.ts` / `biology-classroom.ts` / `tabbed-classroom.ts` / `home-shell.ts` / `shell-classroom-factory.js`） | 生命周期/挂载/manifest 单一入口（D13） | `node --test test/web/subject-manifest-mount.test.cjs test/web/subject-hub.test.cjs test/shared/module-boundaries.test.cjs` + `npx vitest run test/web/subject-manifest.vitest.ts`                                                                      | 已 TS（B5）+ manifest 单一权威（B4）；新壳走 subject-kit loader，禁止直连 registry    |
| Hub/书架      | `apps/web/src/subjects/hub.js`（131）+ `bookshelf/`（`stage.js` 1312 / `enter-fx.js` 1202 / `covers.js` 1029 / `floaters.js` 514 / `build-book.js` 503）                                                         | 3D/动画/书籍编排                       | `node --test test/web/bookshelf-structure.test.cjs test/web/subject-hub.test.cjs test/web/subject-transition-controller.test.cjs test/web/subject-transition-machine.test.cjs`                                                                          | 本计划不深改 3D（产品视觉红线）；视觉改动按 `bookshelf/AGENTS.md` + product/hub 规格  |
| Server 组合根 | `apps/server/src/index.js`（380）                                                                                                                                                                                | 双轨入口（D1）；组合注入               | `npm run test -w @xiaohuang/server`（vitest 全量 107，含 clean-build；turbo test 先构建上游 dist）                                                                                                                                                      | 新路由只加 TS 权威源（B2 createXxxRouter 工厂 + 组合根注入）；禁改注入/限流双计数模式 |

## 表二 · 扫描发现的新热点（>400 行预算登记，业务 JS）

以下文件均已在 `large-file-budget.json` 登记；**改前必跑**以现测行数复核，命中测试按文件列。行数基准：2026-08-10。

| 热点              | 路径（实测行数）                                                                                                                                                              | 风险类型                 | 改前必跑                                                                                                                                                                                                                                   | 硬化策略                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 化学对战          | `apps/web/src/chemistry/battle/ui.js`（541）/ `html.js`（579）/ `fx.js`（630）/ `sfx.js`（479）/ `actions.js`（493）                                                          | 视图/交互/音效           | `npx vitest run test/web/battle-architecture.vitest.ts` + 相关功能测；改前 `wc -l` 现测                                                                                                                                                    | 结构已锁（battle-architecture）；新交互进 actions，不进 ui/html                                |
| 分子反应式        | `apps/web/src/chemistry/molecule/reactions.js`（848）                                                                                                                         | 大逻辑/数据混合          | 改前补行为测试（覆盖不足）；`npx vitest run test/web/molecule-*.vitest.ts`                                                                                                                                                                 | 抽纯数据/纯逻辑到 `chemistry/data/*.ts`（已 TS 化）；只留编排                                  |
| 3D 适配           | `apps/web/src/chemistry/molecule/viewer3d.js`（551）/ `electron/renderer.js`（517）                                                                                           | Three adapter（B7 边界） | `node --test test/web/renderer-adapter-boundary.test.cjs`                                                                                                                                                                                  | 集中在 4 渲染器名单内；控制器/纯逻辑禁直接 import 渲染器                                       |
| Graph 挂载/纯逻辑 | `apps/web/src/math/graph/graph-mount-controller.js`（950）/ `graph-document.js`（621）/ `graph-store.js`（514）/ `graph-record-validation.js`（519）/ `user-points.js`（572） | 生命周期/pure 边界（B2） | `node --test test/web/math-graph-mount-controller.test.cjs test/web/math-graph-document.test.cjs test/web/math-graph-document-renderer.test.cjs test/web/math-user-points.test.cjs` + `npx vitest run test/web/math-graph-store.vitest.ts` | pure 白名单成员（structure 测锁定）禁 jsxgraph/DOM；TS 化候选（graph-store/record-validation） |
| 数学教室入口      | `apps/web/src/math/classroom/entry.js`（579）                                                                                                                                 | 教室壳/编排              | `node --test test/web/math-*.cjs` 相关 + `npm run test -w @xiaohuang/web`                                                                                                                                                                  | 壳只编排；逻辑下沉 graph/plane 聚焦模块                                                        |
| Board 工具面板    | `apps/web/src/math/shared/object-style-panel.js`（738）/ `axis-legend-settings.js`（689）/ `board-label.js`（594）                                                            | 面板控制器/纯函数        | `npx vitest run test/web/math-object-style.vitest.ts` + `node --test test/web/math-axis-legend.test.cjs test/web/math-board-label.test.cjs`                                                                                                | board-label 为无 import 纯函数，TS 化候选                                                      |
| API 客户端        | `apps/web/src/shared/api/client.js`（529）                                                                                                                                    | HTTP 边界（schema 校验） | 改契约前跑 `test/shared/` 相关合同 + 全量 `npm run test -w @xiaohuang/web`                                                                                                                                                                 | 响应走 `@xiaohuang/contracts` Zod；禁止 catch 后静默                                           |
| 品牌提示          | `apps/web/src/shared/ui/brand-tip.js`（414）                                                                                                                                  | UI/主题联动              | `npm run lint:theme-tokens` + 相关 UI 测                                                                                                                                                                                                   | 主题色只走 CSS 变量；危险确认走 appConfirm                                                     |
| Server 服务       | `apps/server/src/services/chemistry/ai-service.js`（499）/ `ai/quiz-service.js`（474）                                                                                        | server 业务逻辑（D14）   | `npm run test -w @xiaohuang/server`（全量）+ typecheck                                                                                                                                                                                     | 错误码走 `@xiaohuang/domain-core`；TS 化切片候选（随 C1 样板推进）                             |

> 未列入：`server/src/seed/*`（数据本体，seed 资产）、`desktop/src/main.ts`（已 TS 单产物，C4）——
> 前者是数据不是业务逻辑，后者已硬化，均非本表范围。

## 改前必跑 · 命令速查（根目录执行，除非注明）

```bash
# 单个 node:test 文件（root）
node --test test/web/<file>.test.cjs

# 单个 vitest 文件（apps/web 下执行；include glob 见 apps/web/vitest.config.ts）
cd apps/web && npx vitest run ../../test/web/<file>.vitest.ts

# web 全量（node:test + vitest 双轨）
npm run test -w @xiaohuang/web

# server 全量（vitest 单一 runner；含 server-ts-clean-build；dist 由 turbo test 上游构建）
npm run test -w @xiaohuang/server

# 门禁
npm run lint:large-files   # 改了大文件行数后必须跑
npm run lint:arch && npm run typecheck
npm run quality:fast       # 合本地 main 前
npm run quality            # 推远端 / 发版前
```

## 状态（2026-08-10 创建）

- C1 热点地图：✅ 已落地（本文件）。
- C2 硬化样板：`rate-of-change.js` → `rate-of-change.ts`（TS 权威，纯数值无生产消费方，零 node:test 牵动；vitest 已迁；allowlist 记录见 `js-allowlist.md`）。选型说明：曾评估 `function-evaluator.js`（消费链 function-analysis/graph-runtime），但其 3 个 node:test 消费文件经 Node ESM 无法解析 .js→.ts，迁 vitest 属并行 risk-d 队列——本批选零消费方的 rate-of-change，`function-evaluator` 留给 risk-d 合并后另批（随其测试迁 vitest 再做）。
- C3 强制清单：由 `safe-change-playbook.md`（risk-bf）落地并链接本文件；本表「改前必跑」为其数据源。
- C4：debt D3/D4/D5 状态与既有门禁无矛盾（结构测 / ui 合同测 / large-file 预算均绿）。
