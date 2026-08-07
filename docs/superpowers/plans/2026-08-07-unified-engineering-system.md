# 统一工程体系实施计划（Program 0–7）

> **来源：** `docs/superpowers/specs/2026-08-07-unified-engineering-system-design.md`（独立审查通过）
> **For agentic workers:** 按 Program 顺序执行；每个 Task 独立提交；先写失败测试再实现；验证命令以本文件为准。
> **状态：** 2026-08-07 启动

## 0. 执行说明

- 分支：`codex/engineering-system`（基于函数画布收尾后的 HEAD，包含全部 graph 修复）。
- 禁止修改：`apps/web/dist/`、`apps/server/public/`、`apps/server/data/`、`apps/server/src/data/`、`.electron-stage/`、`dist-electron/`、`dist-exe/`、嵌套 lockfile、用户数据库。
- 安装依赖只从仓库根执行 `npm install`。
- 浏览器手工交互不是任何 Task 的完成条件；用 fake/contract/unit 测试 + build + stage smoke 验证。
- 每个 Task 提交时只 stage 该 Task 列出的文件。
- 兼容桥（adapter）必须在同一 Program 内给出创建 Task 与删除 Task，禁止只加不删。
- 每个 Program 有 rollback point：该 Program 首个 Task 提交前的 `git reset --hard` 即可整体回退（新增包/配置无数据迁移，回滚无损）。
- 冲突区：Program 5 与 Program 6 不得并行修改 server 生产路径；Program 3 与 Program 4 不得并行修改 classroom DOM 结构；同一 Program 内标注「可并行」的 Task 才能并行。

## 1. 基线（Program 0 冻结时记录）

| 指标 | 基线值 |
|---|---|
| 全仓测试 | 494/494 PASS，0 skip（83 个测试文件） |
| 数学测试 | 313/313 PASS，0 skip |
| JS 源文件/行数 | 250 个 / ~60,932 行（apps/web 188、apps/server 51） |
| packages | math-expr、subject-settings（纯 JS，无 src/ 结构） |
| Node 本机 / 目标基线 | v24.18.0 / Electron 33 → Node 20（pkg 过渡窗口内保持 ES2022/Node 18 可执行子集） |
| 最大 bundle | mathviz 1,286 kB（gzip 337 kB）、three 690 kB |
| 现有质量工具 | node:test；无 ESLint/Prettier/Stylelint/Turborepo/CI |
| index.js（graph 入口） | 690 行（结构测试 <700 门禁） |

---

# Program 0：基线冻结

> rollback point：无代码改动，纯记录。

## Task 0.1 基线数据记录
- **Files:** `docs/engineering/baseline-2026-08-07.md`（新建）
- **Steps:** 记录上表完整数据：测试矩阵、bundle 明细、文件规模、依赖图摘要、三个数据位置（Web 开发 `apps/server/data`、Electron `userData/data`、pkg 邻近 `data`）现状。
- **Verify:** `node --test` 全绿；文档数据与实测一致。
- **Commit:** `docs(eng): freeze engineering baseline (Program 0)`

## Task 0.2 行为兼容清单与用户数据备份策略
- **Files:** `docs/engineering/behavior-compatibility.md`（新建）
- **Steps:** 列出不可变行为：大厅全出血、书籍 intro/cover-dissolve 转场、`/api/...` 路径、五主题、化学实验行为、函数画布合同、Electron 用户数据路径、`chem-theme-change` 事件名。列出每个数据位置的备份/恢复策略（迁移前复制 + checksum）。
- **Verify:** 文档评审通过；覆盖 spec §3.8 与 §21 要求。
- **Commit:** `docs(eng): record behavior compatibility and backup policy`

## Task 0.3 旧债登记表
- **Files:** `docs/engineering/debt-registry.md`（新建）
- **Steps:** 登记允许暂存的旧债（手工维护的 .js/.cjs 双份、`pkg`、module 级 DOM 捕获、`innerHTML` 遗留、index.js 残余逻辑），每条注明删除条件与责任 Program。
- **Verify:** 每条有 Program 归属；无"永远不删"条目。
- **Commit:** `docs(eng): register scoped legacy debt (Program 0)`

---

# Program 1：工程基座

> rollback point：Task 1.1 前 HEAD。全仓验收：`npm run quality` 全绿 + `npm test` 全绿 + `npm run build` 通过。

## Task 1.1 根脚本与 Node 基线
- **Files:** `package.json`（engines/scripts）、`.nvmrc`、`.node-version`、`tooling/` 目录骨架
- **Test（先写失败）:** `test/shared/root-scripts-contract.test.cjs`：断言根 `quality`/`lint`/`format`/`typecheck`/`test`/`build` 脚本存在且语义一致（每个 workspace 同名脚本或显式空配置）。
- **Steps:** 根 `engines.node = ">=20"`；`.nvmrc` = `20`；根脚本 `quality` 汇总（先阶段为空跑，随后 Task 逐项接入）；`tooling/architecture|performance|release/` 目录 + 各 README。
- **Verify:** `npm run quality`（当前阶段=test+build）通过；contract 测试过。
- **Commit:** `feat(eng): add root scripts and Node baseline (P1)`

## Task 1.2 TypeScript 配置体系
- **Files:** `tsconfig.base.json`、`tsconfig.web.json`、`tsconfig.node.json`、`tsconfig.electron.json`（根）、各 workspace `tsconfig.json`（先只做类型检查骨架，不开 allowJs）、`tooling/config/README.md`
- **Test:** `test/shared/tsconfig-contract.test.cjs`：断言 strict 系五选项全部开启（`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`、`useUnknownInCatchVariables`、`noFallthroughCasesInSwitch`），且没有任何 `strict:false` 覆盖。
- **Steps:** 写基座 config；workspace 引用；`npx tsc -p tsconfig.node.json --noEmit` 对 packages 空跑（无 TS 源时通过）。
- **Verify:** contract 测试过；`npx tsc --noEmit`（空）通过。
- **Commit:** `feat(eng): add strict TypeScript config matrix (P1)`

## Task 1.3 ESLint Flat Config + typescript-eslint
- **Files:** `eslint.config.mjs`、`tooling/config/eslint/`（规则集）、`docs/engineering/lint-baseline.md`
- **Test:** `test/shared/lint-config-contract.test.cjs`：断言 flat config 存在、typescript-eslint 已接入、`no-explicit-any` 等关键规则开启、基线清单文件存在。
- **Steps:** 安装 `eslint @eslint/js typescript-eslint`（根 devDeps）；flat config 覆盖 JS/TS；先对 `packages/*` 与新 TS 文件 lint；旧 JS 基线问题登记 `lint-baseline.md`（计数，不阻塞）；`lint` 不允许新增 warning。
- **Verify:** `npm run lint`（阶段范围）通过；contract 测试过。
- **Commit:** `feat(eng): add ESLint flat config with TS rules (P1)`

## Task 1.4 Prettier + Stylelint
- **Files:** `.prettierrc.json`、`.prettierignore`、`.stylelintrc.json`、`stylelint.config` 覆盖 `apps/web/src/shared/styles/**`
- **Test:** `test/shared/format-config-contract.test.cjs`：断言配置存在、stylelint 关键规则（selector 层级、token 变量）开启。
- **Steps:** 安装 `prettier stylelint stylelint-config-standard`；`format` 脚本（`prettier --write` 仅新 TS/JSON/MD；CSS 用 stylelint 检查不改动）；本轮不整仓格式化（避免掩盖逻辑改动）。
- **Verify:** contract 测试过；`npm run format:check` 对新增文件通过。
- **Commit:** `feat(eng): add prettier and stylelint configs (P1)`

## Task 1.5 Turborepo 任务图
- **Files:** `turbo.json`、根 `package.json` scripts（build/test/typecheck/lint 委托 turbo）、`tooling/config/README.md` 更新
- **Test:** `test/shared/turbo-contract.test.cjs`：断言 turbo.json 存在且包含 build/test/typecheck/lint 任务与缓存输出。
- **Steps:** 安装 `turbo`（根 devDep）；`turbo.json` 定义任务图（dependsOn `^build`、缓存 `.turbo` 或默认）；根脚本切换为 `turbo run ...`；`npm run build`/`npm test` 行为不变。
- **Verify:** `npm run build` 与 `npm test` 全绿（与 Task 1.1 前一致）；contract 测试过。
- **Commit:** `feat(eng): add turborepo task graph (P1)`

## Task 1.6 架构门禁脚本
- **Files:** `tooling/architecture/check-dependencies.mjs`、`tooling/architecture/rules.json`、`test/shared/module-boundaries.test.cjs`（扩展）
- **Test（先写失败）:** 现有 `module-boundaries.test.cjs` 扩展断言：`packages/*` 不反向导入 `apps/*`；Server 不导入 Web 源码；`export *` 白名单（`draw-tools.js` 显式导出）保持。
- **Steps:** rules.json 声明目录规则；脚本扫描 import 图并输出违规（exit 1）；接入 `npm run lint:arch`。
- **Verify:** `npm run lint:arch` 通过；新违规为 0。
- **Commit:** `feat(eng): add architecture boundary gate (P1)`

## Task 1.7 CI 门禁
- **Files:** `.github/workflows/quality.yml`（新建）
- **Steps:** PR 工作流按 spec §18.1 顺序：format check → lint → typecheck → architecture → unit/contract tests → server integration → web build → bundle budget（先记录不阻塞）→ dependency scan（先记录）。
- **Verify:** workflow YAML 解析通过（`npx actionlint` 若可用，否则人工评审）；本地按同顺序手动跑通。
- **Commit:** `ci(eng): add quality gate workflow (P1)`

## Task 1.8 pkg 过渡 smoke 与退役门
- **Files:** `scripts/pkg-smoke.mjs`、`docs/engineering/pkg-retirement-gate.md`
- **Test:** `test/server/electron-stage.test.cjs` 保留；新增 `pkg-smoke` 合同测试断言退役门文档存在且列出等价验收项（Electron portable 启动/用户数据导入/API/AI 设置/离线功能）。
- **Steps:** 记录当前 `pkg` 产物可用状态；退役门文档列出验收清单与删除条件（spec §6.4）。
- **Verify:** smoke 脚本对现有 pkg 产物执行通过（或明确记录环境不可用原因，不伪造）。
- **Commit:** `feat(eng): add pkg transition smoke and retirement gate (P1)`

### Program 1 全仓验收
`npm run quality`、`npm test`、`npm run build` 全绿；contract 测试 6 项（Task 1.1–1.8 对应）全过；`git diff --check` 无输出。

---

# Program 2：共享合同与领域核心

> rollback point：Task 2.1 前 HEAD。全仓验收：现有测试全绿 + 新 packages 各自 `npm test` 通过 + `npm run build` 通过。

## Task 2.1 packages/config 与 tsup 构建基座
- **Files:** `packages/config/package.json`、`tsup.config`、`packages/config/README.md`；根 devDeps：`tsup`、`typescript`、`vitest`
- **Test:** `packages/config` 自带 smoke：`tsup --dryRun` 或 build 产物存在。
- **Steps:** `packages/config` 聚合共享 tsconfig/eslint 片段（从 Program 1 基座抽取）；`tsup` 双产物（ESM+CJS+d.ts）配置模板；各 package 引入。
- **Verify:** 一个空包（config 自身）能 build 出 ESM/CJS/d.ts。
- **Commit:** `feat(eng): add packages/config with tsup build base (P2)`

## Task 2.2 packages/domain-core
- **Files:** `packages/domain-core/src/{result,errors,ids,clock,serialization,cancellation}.ts`、`packages/domain-core/package.json`、`packages/domain-core/test/*.test.ts`
- **Test（先写失败）:** `result.test.ts`（ok/err 判定、map、unwrap）；`errors.test.ts`（AppError 稳定错误码、分类枚举）；`serialization.test.ts`（clone/normalize）；`cancellation.test.ts`（disposable 合同、幂等）。
- **Steps:** 实现 `Result<T,E>`、`AppError` + 错误码枚举（spec §7.3 八类）、branded ID 工具、`Clock/IdAllocator/RandomSource` 接口、serializable clone/normalize、`Disposable` 合同。包不依赖 DOM/Node/Express/Electron/Three/JSXGraph。
- **Verify:** `vitest run`（该包）全绿；`npm run build -w @xiaohuang/domain-core` 出双产物。
- **Commit:** `feat(eng): add domain-core package (P2)`

## Task 2.3 packages/contracts（Zod schema）
- **Files:** `packages/contracts/src/{api,events,persistence,ipc,subject,settings}.ts`、`packages/contracts/package.json`、`packages/contracts/test/*.test.ts`；根 devDeps：`zod`
- **Test（先写失败）:** 每个 schema 的 parse 正/反例（合法文档通过、非法被拒）；version 常量存在。
- **Steps:** 先建模持久化 GraphDocumentV2 schema（从 graph-document.js 规范化逻辑提炼，保证现有文档可 parse）与 settings schema；API/event/IPC/subject schema 先声明类型骨架 + 版本号；Web/Server 共用。
- **Verify:** contracts 包测试全绿；现有全仓测试不回归（新包未接入生产路径，只做纯增量）。
- **Commit:** `feat(eng): add contracts package with zod schemas (P2)`

## Task 2.4 packages/test-kit
- **Files:** `packages/test-kit/src/{fake-dom,fake-board,fake-storage,fake-clock,fake-timer,fake-raf,fake-fetch,fake-repository,fake-ipc}.ts`、`packages/test-kit/package.json`、`packages/test-kit/test/*.test.ts`
- **Test（先写失败）:** fake-clock 手动推进；fake-timer 到期执行；fake-storage 持久化/清空；fake-raf 手动帧。
- **Steps:** 从 `test/web/math-graph-mount-controller.test.cjs` 的 fake 经验提炼成可复用包（fake DOM 元素/listener、ResizeObserver、FileReader、URL、board、storage、clock、timer、RAF、fetch、repository、IPC）。
- **Verify:** test-kit 测试全绿。
- **Commit:** `feat(eng): add test-kit package (P2)`

## Task 2.5 math-expr 迁移 TypeScript
- **Files:** `packages/math-expr/**`（源码迁 TS）、`packages/math-expr/tsup.config`、`packages/math-expr/package.json`（exports ESM/CJS/d.ts）、`test/shared/math-expr-contract.test.cjs`
- **Test（先写失败）:** contract 测试断言 `require('@xiaohuang/math-expr')` 与 `import` 均可用且行为一致（双产物）。
- **Steps:** 源码 `src/*.ts`；tsup 构建；`package.json#exports` 稳定入口；消费方（web/server）import 路径不变（包名不变）。
- **Verify:** 全仓测试全绿（含 expr 相关）；`npm run build -w @xiaohuang/math-expr` 双产物 + d.ts。
- **Commit:** `feat(eng): migrate math-expr to TypeScript (P2)`

## Task 2.6 subject-settings 迁移 TypeScript
- **Files:** `packages/subject-settings/**`、`packages/subject-settings/tsup.config`、`packages/subject-settings/package.json`、`test/shared/subject-settings-contract.test.cjs`
- **Test（先写失败）:** contract 测试断言双产物 + schema 行为不变。
- **Steps:** 同 2.5 流程；settings schema 同步进 contracts 包（单一来源，禁止双份）。
- **Verify:** `test/shared/subject-settings-contract.test.cjs` 全过；全仓不回归。
- **Commit:** `feat(eng): migrate subject-settings to TypeScript (P2)`

## Task 2.7 错误模型接入试点
- **Files:** `apps/server/src/services/chemistry/*` 或首个样板 service 使用 `domain-core` 错误码；`packages/contracts` 错误映射表
- **Test:** 一个 service 的失败路径断言错误码稳定（不依赖消息文本）。
- **Steps:** 选一个薄 service（如 settings 读取）接入 `Result` + 错误码；验证错误码在 HTTP 响应中稳定。
- **Verify:** server 相关测试全绿。
- **Commit:** `feat(eng): wire error model into first service (P2)`

### Program 2 全仓验收
新增 4 包（config/domain-core/contracts/test-kit）+ 2 包 TS 化；各包测试绿；全仓 494 测试不回归；`npm run build` 通过。

---

# Program 3：UI 资源库与设计系统

> rollback point：Task 3.1 前 HEAD。冲突区：不得与 Program 4 并行修改 classroom DOM。
> 纪律：先 token inventory 再写组件；禁止空壳组件（每个组件必须被至少一个真实消费方或 catalog 使用）。

## Task 3.1 设计令牌清单（inventory）
- **Files:** `docs/engineering/token-inventory.md`
- **Steps:** 从 `apps/web/src/shared/styles/themes/*/tokens.css` 提取全部语义令牌（color/surface/border/text/accent/danger/success/spacing/radius/shadow/z/typography/motion/size/canvas），记录五主题值差异与缺失项。
- **Verify:** 文档覆盖五主题全部 token；标注不一致项。
- **Commit:** `docs(eng): inventory design tokens across five themes (P3)`

## Task 3.2 packages/design-tokens
- **Files:** `packages/design-tokens/src/{color,spacing,typography,motion,size}.ts`、`packages/design-tokens/package.json`、`packages/design-tokens/test/*.test.ts`
- **Test（先写失败）:** 每个 token 族在五主题都有值；语义名唯一；canvas palette 覆盖 math 曲线八色。
- **Steps:** 语义令牌定义为 TS 常量 + 类型；五主题值表；与 `tokens.css` 对照测试（读取 CSS 文件断言一致，防漂移）。
- **Verify:** design-tokens 测试全绿；`npm run build` 双产物。
- **Commit:** `feat(eng): add design-tokens package (P3)`

## Task 3.3 packages/ui primitives
- **Files:** `packages/ui/src/primitives/{button,input,select,checkbox,slider,icon}.ts`、`packages/ui/package.json`、`packages/ui/test/*.test.ts`、`packages/ui/tsup.config`
- **Test（先写失败）:** fake DOM 下：mount/update/dispose 合同、disabled/loading/error 状态、键盘焦点、文本安全输出（恶意文本不产生属性/CSS 注入）。
- **Steps:** typed DOM factory + `UiController<Props, Events>` 合同（spec §8.1）；每个组件支持五主题 token（CSS 变量）与 touch 尺寸。
- **Verify:** ui 包测试全绿；双产物构建。
- **Commit:** `feat(eng): add ui primitives package (P3)`

## Task 3.4 packages/ui overlays + layout + feedback
- **Files:** `packages/ui/src/overlays/{dialog,drawer,popover,tooltip,toast}.ts`、`packages/ui/src/layout/{stack,grid,toolbar,panel,card,tabs}.ts`、`packages/ui/src/feedback/{loading,empty,error,progress}.ts`、对应测试
- **Test（先写失败）:** overlay 焦点陷阱/ESC 关闭/Escape 释放；tabs 键盘导航；feedback 状态渲染。
- **Steps:** 按 primitives 的同一合同实现；全部组件进 catalog（Task 3.6 前至少 fake-DOM 测试覆盖）。
- **Verify:** ui 包测试全绿。
- **Commit:** `feat(eng): add overlays layout feedback components (P3)`

## Task 3.5 domain/classroom UI 组件
- **Files:** `packages/ui/src/domain-ui/{property-editor,tool-group,number-input,style-picker}.ts`、`packages/ui/src/classroom-ui/{classroom-header,panel-host,readout-card}.ts`、对应测试
- **Test（先写失败）:** PropertyEditor 提交/取消；NumberInput 键盘与步进；ReadoutCard 空/长文本。
- **Steps:** 同前合同；参考现有 math 面板交互实现。
- **Verify:** ui 包测试全绿。
- **Commit:** `feat(eng): add domain and classroom ui components (P3)`

## Task 3.6 UI catalog 开发页
- **Files:** `apps/web/src/dev/catalog/main.js`、`apps/web/src/dev/catalog/`（组件状态矩阵）、路由挂载（仅 dev 态，不进正式导航）
- **Test:** catalog 模块可加载（dev build）；结构测试断言不进入主包路径。
- **Steps:** 展示全组件五主题对照、焦点状态、长文本/错误态。
- **Verify:** `npm run build` 通过且 catalog 为独立 chunk；测试绿。
- **Commit:** `feat(eng): add dev ui catalog page (P3)`

## Task 3.7 真实组件迁移试点
- **Files:** 一个真实 feature 面板（建议函数画布参数滑杆区或化学设置面板）改用 `packages/ui` 组件
- **Test（先写失败）:** 该 feature 现有 contract 测试继续通过（行为不变），新增组件级测试。
- **Steps:** 替换一个真实消费方；行为合同测试全绿；旧实现删除（不留双轨）。
- **Verify:** 相关 feature 测试全绿；`npm run build` 通过。
- **Commit:** `feat(eng): migrate first real panel to ui package (P3)`

## Task 3.8 五主题收口与 legacy CSS 检查
- **Files:** `tooling/architecture/check-theme-tokens.mjs`、`docs/engineering/css-legacy-list.md`
- **Test:** theme-token 检查脚本：feature 样式不得硬编码主题色（允许清单外显式色走 design-tokens 解析）。
- **Steps:** 检查脚本接入 `npm run lint:arch`；登记遗留硬编码清单；删除条件=迁入 token。
- **Verify:** `npm run lint:arch` 通过；`git diff --check` 干净。
- **Commit:** `feat(eng): enforce theme token usage gate (P3)`

### Program 3 全仓验收
ui/design-tokens 两包全绿；至少 1 个真实面板使用 ui 组件；五主题 token 检查无新增违规；全仓测试与构建不回归。

---

# Program 4：前端内核与 subject-kit

> rollback point：Task 4.1 前 HEAD。冲突区：与 Program 3 不得并行修改 classroom DOM。
> 顺序：先协议后接入；化学先、数学次、物理/生物 placeholder；最后删旧 glue。

## Task 4.1 packages/subject-kit
- **Files:** `packages/subject-kit/src/{manifest,feature-loader,lifecycle}.ts`、`packages/subject-kit/package.json`、`packages/subject-kit/test/*.test.ts`
- **Test（先写失败）:** `SubjectManifest`/`ClassroomManifest`/`FeatureModule` 类型合同；`FeatureLoader` 并发去重、取消过时、mount generation、dispose 前一实例（fake 计时）。
- **Steps:** 按 spec §10.1/§10.2/§9.2 定义协议；loader 实现。
- **Verify:** subject-kit 测试全绿；双产物构建。
- **Commit:** `feat(eng): add subject-kit contracts and loader (P4)`

## Task 4.2 app session
- **Files:** `apps/web/src/app/session.js`（或 TS 试点）、`apps/web/src/app/error-boundary.js`、`test/web/app-session.test.cjs`
- **Test（先写失败）:** surface/subjectId/panelId/transition 状态机；dialog 状态；边界失败不级联（fake feature 抛错只影响本面板）。
- **Steps:** 轻量 session（不进领域状态）；分层错误边界（boot/classroom/panel/renderer-fatal）。
- **Verify:** app-session 测试全绿。
- **Commit:** `feat(eng): add app session and error boundaries (P4)`

## Task 4.3 feature loader 统一接入
- **Files:** `apps/web/src/app/feature-loader.js`（替换/包装现有 loader）、`apps/web/src/app/boot.js`、`test/web/feature-loader.test.cjs`（扩展）
- **Test（先写失败）:** 现有 feature-loader 测试扩展：mount generation 防旧异步回写、loading/error/retry。
- **Steps:** 现有 web 内 loader（`subjects/classrooms/math-classroom.js` 等使用）改为 subject-kit 协议；保持行为。
- **Verify:** 全仓测试全绿（hub/classroom 相关）。
- **Commit:** `feat(eng): unify feature loader protocol (P4)`

## Task 4.4 化学 classroom 接入 manifest（adapter）
- **Files:** `apps/web/src/subjects/catalog.js`（包装为 manifest adapter）、`apps/web/src/subjects/classrooms/registry.js`、化学 classroom 入口
- **Test（先写失败）:** manifest contract 测试：化学 classroom 的默认面板/catalog/loader/设置项与现状一致。
- **Steps:** 写 adapter 包装现有 catalog/registry（不改 feature 内部）；manifest 生效。
- **Verify:** subject-hub 与化学测试全绿。
- **Commit:** `feat(eng): adapt chemistry classroom to manifest (P4)`

## Task 4.5 数学 classroom 接入 manifest（adapter）
- **Files:** `apps/web/src/subjects/classrooms/math-classroom.js`（包装）、`apps/web/src/math/AGENTS.md` 更新
- **Test（先写失败）:** 数学 classroom manifest 合同：函数画布 mount/dispose 合同保持（graph 测试全绿即证明）。
- **Steps:** adapter 包装；保留函数画布合同。
- **Verify:** 全部 math 测试全绿。
- **Commit:** `feat(eng): adapt math classroom to manifest (P4)`

## Task 4.6 物理/生物 placeholder 接入协议
- **Files:** `apps/web/src/subjects/catalog.js` 中 physics/biology 条目（可见不可点，沿用现有行为）
- **Test:** subject-hub 测试断言 placeholder 状态与进入行为不变。
- **Steps:** placeholder 走 manifest 协议（status: locked/preview）。
- **Verify:** subject-hub 测试全绿。
- **Commit:** `feat(eng): route physics/biology placeholders through manifest (P4)`

## Task 4.7 删除旧 tab/catalog glue（兼容桥删除）
- **Files:** 删除 Task 4.4/4.5 包装的旧重复逻辑（catalog 直连、registry 直连代码）
- **Test:** 删除后全仓测试全绿（结构测试断言新入口唯一）。
- **Steps:** 确认全部消费方走 manifest 后删除旧 glue；结构测试更新（禁回退）。
- **Verify:** 全仓测试全绿；`rg` 确认无残留直连。
- **Commit:** `refactor(eng): remove legacy catalog/registry glue (P4)`

### Program 4 全仓验收
化学/数学/物理/生物全部经 manifest 接入；旧 glue 删除；hub/classroom/graph 测试全绿；`npm run build` 通过。

---

# Program 5：服务端与数据体系

> rollback point：Task 5.1 前 HEAD。冲突区：与 Program 6 不得并行修改 server 生产路径。
> 纪律：v1 兼容不破坏；v2 与 v1 复用同一 service/repository；禁止复制业务逻辑。

## Task 5.1 Server TypeScript 化（composition 骨架）
- **Files:** `apps/server/tsconfig.json`、`apps/server/tsup.config.js`、`apps/server/src/index.ts`（先建骨架 + 现有 `src/index.js` adapter 保留）、`apps/server/package.json`（build:server 用 tsup 出 CJS）
- **Test（先写失败）:** server 构建产物为 CJS 且可 `require()`；现有 server 测试全绿（适配器保持行为）。
- **Steps:** tsup CJS 产物（目标 ES2022/Node 18 兼容子集）；`index.ts` 只 re-export adapter 入口；逐步迁文件（按依赖序）。
- **Verify:** `npm run build:frontend`（server 静态化）与 server 测试全绿；pkg smoke 保持。
- **Commit:** `feat(eng): add server TS composition skeleton (P5)`

## Task 5.2 分层样板：settings 端点 route/service/repository
- **Files:** `apps/server/src/routes/settings.ts`、`apps/server/src/services/settings.ts`、`apps/server/src/repositories/settings.ts`（SQLite 实现）、`apps/server/src/domain/settings-policy.ts`、`apps/server/src/db/{connection,migration,transaction}.ts`、对应测试 `test/server/settings-layers.test.cjs`
- **Test（先写失败）:** route 不依赖 Express 细节（注入 req/res 或 handler）；repository 不返回未规范化行；domain 纯函数可测。
- **Steps:** 以 settings 为样板完整分层；v1 route adapter 调 service 并转旧响应形状（兼容不变）。
- **Verify:** server 测试全绿；现有 settings API contract 测试不变。
- **Commit:** `feat(eng): layer settings endpoint route/service/repository (P5)`

## Task 5.3 API v1 合同测试补全
- **Files:** `test/server/server-api-contracts.test.cjs`（扩展至全部公开 v1 端点）
- **Test（先写失败）:** 每个 v1 端点的 URL/状态码/响应字段快照。
- **Steps:** 遍历现有路由清单，补合同测试。
- **Verify:** 全部 server 测试绿。
- **Commit:** `test(eng): freeze v1 api contracts (P5)`

## Task 5.4 /api/v2 规范响应 + 首个 v2 端点
- **Files:** `apps/server/src/routes/v2/settings.ts`、`apps/server/src/lib/api-response.ts`、`apps/web/src/shared/api/client.js`（v2 客户端方法）、`packages/contracts/src/api.ts`（v2 schema）、`test/server/api-v2-settings.test.cjs`
- **Test（先写失败）:** v2 响应形状 `{success,data,requestId}`；schema parse；与 v1 行为一致（同一 service）。
- **Steps:** 同 Task 完成：schema + route + client + 测试；v2 端点与 v1 复用 service。
- **Verify:** v2 测试绿；v1 测试不变。
- **Commit:** `feat(eng): add first v2 endpoint with shared schema (P5)`

## Task 5.5 数据库 migration 框架
- **Files:** `apps/server/src/db/migrations/`、`apps/server/src/db/migrator.ts`、`apps/server/src/db/backup.ts`、`test/server/db-migrations.test.cjs`
- **Test（先写失败）:** schema version table；迁移 up/precondition/postcondition；版本高于应用最大 → 只读失败；backup 到临时文件 + checksum + 原子 rename；restore 失败保留原 DB。
- **Steps:** 按 spec §11.3 实现；三类数据位置发现逻辑（dev/Electron userData/pkg 邻近）。
- **Verify:** migration 测试全绿；现有 DB 数据不动（只读验证）。
- **Commit:** `feat(eng): add versioned db migration framework (P5)`

## Task 5.6 Seed versioning
- **Files:** `apps/server/src/seed/`、`apps/server/src/db/seed.ts`、`test/server/seed-versioning.test.cjs`
- **Test（先写失败）:** 幂等 upsert；内容版本记录；与 migration 分离。
- **Steps:** 现有 seed（labs、quiz bank）改为 versioned 幂等。
- **Verify:** seed 测试绿；`npm run sync:labs-seed` 幂等执行。
- **Commit:** `feat(eng): version seed data with idempotent upsert (P5)`

## Task 5.7 AI adapter 统一
- **Files:** `apps/server/src/services/ai/*`（provider adapter/retry/rate-limit/schema parse/redacted log）、`packages/contracts/src/ai.ts`、`test/server/ai-adapter.test.cjs`
- **Test（先写失败）:** timeout/cancellation；retry 策略；响应 schema parse 失败 → `AI_*` 错误码；日志脱敏（不含 key/prompt）。
- **Steps:** 包装现有 AI 服务；行为不变。
- **Verify:** ai 相关测试全绿。
- **Commit:** `feat(eng): unify AI provider adapter (P5)`

### Program 5 全仓验收
v1 合同冻结；首个 v2 端点 + client + schema 同 Task 落地；migration/seed 框架可测；AI adapter 统一；全仓测试与构建全绿。

---

# Program 6：Electron 与发布

> rollback point：Task 6.1 前 HEAD。冲突区：与 Program 5 不得并行修改 server 生产路径。

## Task 6.1 Main/Preload TypeScript 化 + IPC allowlist
- **Files:** `apps/desktop/src/main/*.ts`、`apps/desktop/src/preload/*.ts`、`apps/desktop/tsconfig.json`、`apps/desktop/tsup.config.js`（CJS）、`packages/contracts/src/ipc.ts`、`test/server/electron-stage.test.cjs`（扩展）
- **Test（先写失败）:** IPC allowlist schema：未登记 channel 被拒；preload 不暴露任意 Node。
- **Steps:** main/preload 迁 TS；context isolation 确认开启；IPC 经 schema。
- **Verify:** electron-stage smoke 全绿；`npm run build` 通过。
- **Commit:** `feat(eng): migrate electron main/preload to TS with IPC schema (P6)`

## Task 6.2 启动状态机
- **Files:** `apps/desktop/src/main/startup.ts`、`apps/desktop/src/main/lifecycle.ts`、`test/server/electron-startup.test.cjs`
- **Test（先写失败）:** idle→staging→serverStarting→ready→closing→closed；并发启动幂等；健康检查就绪（不靠固定延时）；失败不遗留进程。
- **Steps:** 按 spec §12.2 实现状态机；端口与数据目录显式传递。
- **Verify:** startup 测试绿（fake server 进程）。
- **Commit:** `feat(eng): add electron startup state machine (P6)`

## Task 6.3 Stage manifest 与完整性
- **Files:** `scripts/stage-electron-server.js`（扩展输出 manifest）、`tooling/release/stage-manifest.mjs`、`test/server/electron-stage.test.cjs`（扩展）
- **Test（先写失败）:** manifest 记录文件/hash/版本/构建时间；打包前完整性校验失败退出。
- **Steps:** stage 时生成 manifest；pack 前校验。
- **Verify:** stage smoke 绿。
- **Commit:** `feat(eng): add stage manifest and integrity check (P6)`

## Task 6.4 Electron portable 等价验收
- **Files:** `docs/engineering/pkg-retirement-gate.md`（逐项勾选）、`scripts/electron-portable-smoke.mjs`
- **Test:** smoke 覆盖：启动、用户数据导入、API、AI 设置、离线功能。
- **Steps:** 按退役门清单逐项验证并记录证据。
- **Verify:** 清单全部勾选（或记录未完成项与原因，不伪造）。
- **Commit:** `test(eng): verify electron portable equivalence (P6)`

## Task 6.5 删除 pkg 与退役（等价验收完成后独立提交）
- **Files:** 删除 `pkg` 相关脚本/配置/`isPkg` 分支/文档；Server 最低基线提升 Node 20
- **Test:** 删除后全仓测试全绿；无 `pkg` 引用残留。
- **Steps:** 仅在 Task 6.4 通过后执行；更新 AGENTS.md 与 docs。
- **Verify:** `rg -n "pkg" apps scripts docs` 无残留；全仓绿。
- **Commit:** `refactor(eng): retire pkg portable channel (P6)`

### Program 6 全仓验收
Electron main/preload TS + IPC schema + 启动状态机 + stage manifest；pkg 退役（等价验收后）；全仓测试与打包 smoke 全绿。

---

# Program 7：质量与性能收口

> rollback point：Task 7.1 前 HEAD。全仓验收即 spec §23 完成定义。

## Task 7.1 测试 runner 迁移（Vitest 按目录）
- **Files:** 首批迁移目录的 `*.test.ts`（Vitest）与 `vitest.config.ts`、`vitest.workspace.ts`
- **Test:** 迁移目录新旧用例不重复（结构断言删除旧 runner 重复文件）。
- **Steps:** 按目录迁移（建议先 server domain + packages）；每个目录完成后删除对应 `node:test` 重复用例；`npm test` 与 `npm run test:vitest` 都绿。
- **Verify:** 全仓测试数不下降。
- **Commit:** `test(eng): migrate first test directory to vitest (P7)`

## Task 7.2 覆盖率阈值分层
- **Files:** `vitest.config.ts` 覆盖率配置、`docs/engineering/coverage-baseline.md`
- **Steps:** domain/contracts/store/migrations/service 分层阈值；记录基线；达标目录不回退。
- **Verify:** `npm run coverage` 输出分层报告。
- **Commit:** `test(eng): add layered coverage thresholds (P7)`

## Task 7.3 性能预算进 CI
- **Files:** `tooling/performance/budget.mjs`、`budget.json`、`test/shared/budget-contract.test.cjs`
- **Steps:** 记录当前 bundle 基线；预算脚本接入 CI；变更需写明理由。
- **Verify:** budget 脚本对当前产物通过（预算=基线+容忍）。
- **Commit:** `feat(eng): add performance budget gate (P7)`

## Task 7.4 安全合同补全
- **Files:** `test/server/http-security-headers.test.cjs`（扩展）、CORS 配置检查
- **Steps:** headers/CORS/body 限制合同测试补全；AI key 与路径脱敏断言。
- **Verify:** 安全测试绿。
- **Commit:** `test(eng): close security contract tests (P7)`

## Task 7.5 可观测性
- **Files:** `apps/server/src/lib/logger.ts`、`apps/web/src/shared/logging.js`、`docs/engineering/logging-fields.md`
- **Test:** 结构化字段断言（timestamp/level/scope/requestId/errorCode/durationMs）；脱敏断言。
- **Steps:** 统一字段；错误码跨端一致。
- **Verify:** 日志测试绿。
- **Commit:** `feat(eng): unify structured logging fields (P7)`

## Task 7.6 资源清单
- **Files:** `tooling/architecture/asset-manifest.mjs`、`docs/engineering/asset-registry.md`
- **Test:** 构建检查缺失资源/孤儿资源/重复大文件/错误主题映射。
- **Steps:** 从 `apps/web/public/assets/` 建立清单。
- **Verify:** 检查脚本对现状通过（或登记豁免）。
- **Commit:** `feat(eng): add asset registry and checks (P7)`

## Task 7.7 文档与 skill 收口
- **Files:** 根 `AGENTS.md`、项目 skill（`xiaohuang-classroom`）、包级 `AGENTS.md`、ADR 目录
- **Steps:** 按新工程体系更新：架构图、边界、新学科接入流程、质量门禁说明；ADR 记录 Turborepo/TS/tsup/Zod 等重大取舍。
- **Verify:** 文档与代码一致（CI 检查关键文档存在）。
- **Commit:** `docs(eng): update agent contracts for engineering system (P7)`

## Task 7.8 JS allowlist 清零与最终验收
- **Files:** `docs/engineering/js-allowlist.md`（每阶段维护）、最终清理提交
- **Steps:** 检查生产源码 JS 残留（允许：第三方桥、工具脚本）；逐项迁移或明确豁免；跑 spec §23 全部完成定义项。
- **Verify:** `npm run quality` + `npm test` + `npm run build` + `npm run lint:arch` 全绿；`git diff --check` 无输出；生成目录/用户数据未改动。
- **Commit:** `chore(eng): finalize engineering system migration (P7)`

---

## 2. 可并行与冲突总表

| Program | 可并行 | 禁止并行 |
|---|---|---|
| P1 内部 | Task 1.1→1.8 顺序（基座依赖） | — |
| P2 内部 | Task 2.2/2.3/2.4 可并行（互不依赖） | 2.5/2.6 不与其他改 packages 的 Task 并行 |
| P3 与 P4 | — | classroom DOM（3.7 vs 4.4–4.7） |
| P5 与 P6 | — | server 生产路径 |
| P7 | 与其它 Program 收尾可并行（纯增量） | — |

## 3. 兼容桥创建/删除对照

| 桥 | 创建 Task | 删除 Task |
|---|---|---|
| catalog/registry → manifest adapter | 4.4/4.5 | 4.7 |
| Server JS adapter（index.js 保留） | 5.1 | 5.1 内逐步 + 7.8 |
| API v1 adapter | 已存在（公开兼容面） | 不在本计划（独立 breaking-release 计划，spec §11.2） |
| `chem-theme-change` → 中性命名桥 | 3.2（design-tokens 兼容桥） | 3.8 |
| `pkg` 便携版 | 已存在（过渡） | 6.5（等价验收后） |

## 4. 风险提示

- 全计划是超大型迁移，按 Program 顺序执行，每个 Program 完成即全仓验收一次。
- 任何 Task 若发现 spec 与实际冲突，先暂停并报告，不自行扩大范围。
- 禁止为过测试放宽严格选项、降低断言或 catch 后静默。
