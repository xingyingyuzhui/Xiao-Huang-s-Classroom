# 小黄的教室 · 工程优化完整计划

| 字段           | 内容                                                       |
| -------------- | ---------------------------------------------------------- |
| **文档类型**   | 可执行工程优化计划（Agent / 人类共用）                     |
| **版本**       | 2026-08-08 v1.1（详细可复制版）                            |
| **仓库**       | 小黄的教室 monorepo                                        |
| **分支约定**   | 非琐碎改动走 `codex/*`，验证后合 `main`                    |
| **权威冲突时** | 以**当前代码 + CI 证据**为准，再回写本文与 `debt-registry` |
| **相关文档**   | 见文末「附录 A」                                           |

---

## 目录

1. [计划摘要](#1-计划摘要)
2. [现状结构快照](#2-现状结构快照)
3. [问题诊断与优化原则](#3-问题诊断与优化原则)
4. [90 天目标与成功标准](#4-90-天目标与成功标准)
5. [工作方式与纪律](#5-工作方式与纪律)
6. [Track A：构建与 CI 可复现](#6-track-a构建与-ci-可复现)
7. [Track B：结构瘦身与边界硬化](#7-track-b结构瘦身与边界硬化)
8. [Track C：类型化与 Server / Desktop 现代化](#8-track-c类型化与-server--desktop-现代化)
9. [Track D：发布与债务收口](#9-track-d发布与债务收口)
10. [排期与人力模型](#10-排期与人力模型)
11. [验收命令速查](#11-验收命令速查)
12. [风险、回滚与并行禁区](#12-风险回滚与并行禁区)
13. [明确不做](#13-明确不做)
14. [债务映射表](#14-债务映射表)
15. [本周可开的下一刀](#15-本周可开的下一刀)
16. [附录](#16-附录)

---

## 1. 计划摘要

### 1.1 一句话

基座已经像产品工程（packages + Turbo + quality + Electron CI），业务层仍是实验室脚本的扩张形态。本计划用 **四条 Track、可测完成定义、禁止大爆炸**，在约 90 天内把「可复现、边界硬、入口不胖、类型化有实切片」做成可验收结果。

### 1.2 为什么需要「更好的」计划

仓库已有：

- `docs/superpowers/plans/2026-08-07-unified-engineering-system.md`（Program 0–7 大计划）
- `docs/engineering/debt-registry.md`、`js-allowlist.md`、基线与兼容清单

它们解决了「从 0 建工程体系」。**当前问题变成：**

1. 基座已落地，再按 0–7 全文推进会重复与失焦；
2. CI 刚证明能抓「本机残留掩盖」类问题，需要把**可复现**提到最高优先；
3. 业务功能仍在推进，需要 **与产品并行** 的瘦身/迁移切片，而不是停产品做大迁移。

本文件 = **下一阶段执行顺序**（不废除旧 Program 文档）。

### 1.3 四条 Track 一览

| 优先级 | Track | 主题                                         | 周期感                        |
| ------ | ----- | -------------------------------------------- | ----------------------------- |
| P0     | **A** | 构建与 CI 可复现                             | 1–2 周（主体已完成，收尾 A3） |
| P1     | **B** | 结构瘦身与边界硬化                           | 2–4 周主战场                  |
| P2     | **C** | 类型化切片（server / web shared / electron） | 3–6 周，与 B 交错             |
| P3     | **D** | 发布与债务收口（pkg / 测试双轨 / 数据路径）  | 弱并行，有门禁                |

---

## 2. 现状结构快照

### 2.1 Monorepo 树

```text
小黄的教室/
├── apps/
│   ├── web        @xiaohuang/web      Vite · Hub · 学科教室 · feature
│   ├── server     @xiaohuang/server   Express · SQLite/sql.js · AI/化学
│   └── desktop    @xiaohuang/desktop  Electron Main · stage · 打包边界
├── packages/      9 个共享包（TS，可 build/test/coverage）
│   ├── config · contracts · design-tokens · domain-core
│   ├── math-expr · subject-kit · subject-settings
│   ├── test-kit · ui
├── test/          web | server | shared | desktop | release
├── tooling/       architecture · coverage · performance · release
├── scripts/       stage · sync · lint-baseline · typecheck-apps …
├── docs/          engineering/ · superpowers/ · adr/
├── .github/workflows/
└── （本地私有，不进公开仓）.grok/ .cursor/ .claude/ 等 agent skill
    ├── quality.yml
    └── electron-package.yml
```

### 2.2 依赖方向（必须守住）

```text
apps/web  ──┐
apps/server ─┼──► packages/*   （可测、不回指 app）
apps/desktop ┘

禁止：
  packages → apps
  server 源码 → web 源码
  GraphDocument / store 持久化 JSXGraph · DOM · runtime handle
```

### 2.3 规模量级（2026-08-08 附近实测，近似）

| 范围                             | 规模                                                                     |
| -------------------------------- | ------------------------------------------------------------------------ |
| `apps/web/src` JS                | ~192 文件                                                                |
| `apps/server/src`                | ~58 文件（几乎全 JS）                                                    |
| `packages` TS 源                 | ~81 文件                                                                 |
| `test/**/*.cjs`                  | ~115 文件                                                                |
| 数学 graph 入口 `graph/index.js` | ~690 行（结构门禁 **&lt;700**）                                          |
| 化学大文件热点                   | `ai-classroom/*-shell`、`battle/*`、`molecule/reactions` 等可 &gt;800 行 |
| 生产 JS allowlist 记账           | ~274 JS / packages 侧 TS ~67（以 `js-allowlist.md` 为准）                |

### 2.4 前端模块地图（apps/web/src）

```text
app/           壳层、装配
subjects/      大厅 hub · 书架 · classroom 挂载 · manifest/session
chemistry/     周期表 · 分子 · 摩尔 · 电子 · 对战 · AI 课 · data
math/          graph · plane · trig · sequence · solid · classroom · shared
biology|physics  扩展位（内容不均衡，不绑本工程优化）
shared/        主题、样式、通用 UI、board 工具
```

### 2.5 质量与 CI 现状

| 项                  | 现状                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| 本地 `quality`      | format → lint → css → baseline → typecheck → arch/theme/assets → test → build → budget → coverage |
| CI quality          | 干净环境跑 1 次 + 产物后可重复性跑 2 次                                                           |
| CI electron-package | macOS + Windows 打包资源校验                                                                      |
| 2026-08-08 修复后   | `f1ee275` 起 quality + electron **双绿**（覆盖率竞态 + web 依赖 dist 已修）                       |

### 2.6 已较好 vs 仍拖累

| 已较好                      | 仍拖累                            |
| --------------------------- | --------------------------------- |
| 三端 + packages 分层清晰    | apps 生产源码仍以 JS 为主         |
| packages 全 TS + 标准脚本   | 应用层大文件 / orchestrator 复发  |
| Turbo、quality、Electron CI | quality 链路长、失败定位成本高    |
| skill + 债务表 + allowlist  | D13 双入口、D2 pkg、D14 server JS |
| 测试按 owner 分层           | node:test 与 Vitest 双轨（D7）    |
| Graph 入口已压到门禁内      | 化学壳文件、offline 题库等巨石    |

---

## 3. 问题诊断与优化原则

### 3.1 根因分层

| 层级 | 症状                         | 根因                                  |
| ---- | ---------------------------- | ------------------------------------- |
| 构建 | 干净 CI 缺 `packages/*/dist` | 入口只 vite、未 turbo 建依赖图        |
| 测试 | coverage `.tmp` ENOENT       | shared 测试真实写共享 coverage + 并行 |
| 结构 | 入口/壳文件回涨              | 新功能默认堆 index / shell            |
| 类型 | 边界有 Zod/TS，业务无类型    | allowlist 批次未开切                  |
| 发布 | pkg 与 Electron 双轨         | 便携版未验收退役                      |
| 组织 | 文档与代码双账               | Program 文档未随落地更新状态          |

### 3.2 优化原则（硬）

1. **先可复现，再迁移，再漂亮。**
2. **小切片、可回滚、可测完成定义。** 禁止「全仓 TS」「全 graph 再架构」。
3. **新代码只进正确层：** 领域/schema → packages；渲染/交互 → feature；禁止回流 god-file。
4. **行为默认保持。** 产品红线见 §3.3。
5. **债务必须有删除条件。** 无条件债务不准进表。
6. **同一时间主 Track ≤1 + 守门任务 ≤1。**

### 3.3 产品红线（本计划不得破坏）

- 大厅全出血、书籍 intro → cover-dissolve 进教室、退出逆 dissolve
- 五主题；品牌「小黄的教室」；`chem-theme-change` 事件名
- HTTP 兼容 `/api/...`
- 化学实验配置驱动、逻辑与渲染分离方向
- 函数画布：主题契约、`withPreservedViewport`、detach 先于 filter、document 无 runtime
- 用户数据：`apps/server/data/`、Electron userData；禁止当源码改

详见：`docs/engineering/behavior-compatibility.md`。

---

## 4. 90 天目标与成功标准

### 4.1 目标（可勾选）

- [ ] **G1 干净 CI：** quality + electron-package 在无本地 dist 下稳定绿（连续 10 次 main 相关 push 无「coverage/.tmp」「Failed to resolve subject-settings」同类回归）
- [x] **G2 边界锁死：** lint:arch 脚本化扫描 337 文件 + B2 pure 白名单 18 文件（无 DOM/JSXGraph）+ module-boundaries 结构合同
- [x] **G3 入口不胖：** `graph/index.js` 690 &lt; 700 门禁已锁；`lint:large-files` 大文件预算门禁（40 文件登记 + 类别白名单 + 膨胀/残留检查，已入 quality 链）
- [x] **G4 类型化切片：** B1 样板（settings-service.ts）+ B4 子集（frame-task.ts / chem-text.ts / main.ts）
- [x] **G5 债务可消：** D5 守住；关闭 D13/D9/D10/D11 + D8 已评估 + D3 样板已建（≥3 条达成）；D14 经 C1/C2 推进

### 4.2 成功画像（人话）

1. 新人读 skill + 本文，能判断代码该落 apps 还是 packages，错误依赖被门禁拦住。
2. 干净机器 `npm ci` 后直接 quality / Electron，无需「先随便 build 一次」。
3. 数学画布 / 化学 lab **新功能**默认进聚焦模块，入口行数不涨。
4. `debt-registry` / `js-allowlist` 有真实提交减少，不是只改文档。

---

## 5. 工作方式与纪律

### 5.1 标准流程

```text
1. 读本文对应 Track 任务 + 相关 AGENTS/skill reference
2. git status；从 main 开分支 codex/<track>-<short-name>
3. 先写/改失败合同测试（红）
4. 最小实现（绿）
5. 跑「该任务验证命令」
6. 更新 debt-registry / js-allowlist 状态（若触及）
7. 提交（完整句子说明 why）
8. 合 main 后确认 CI quality + electron-package
```

### 5.2 禁止提交路径

- `apps/web/dist/`、`apps/server/public/`
- `.electron-stage/`、`dist-electron/`、`dist-exe/`
- `coverage/`、各 workspace `dist/`（除非任务明确是发布产物）
- `apps/server/data/`、用户 DB / lock
- 嵌套 `apps/server/package-lock.json`

### 5.3 安装与工具

```bash
# 永远从仓库根
npm install
```

- Node 基线：`engines.node >= 20`（与 Electron 33 对齐）
- 包管理：根单一 lockfile

### 5.4 Agent / 人工协作

- 公开导航：根 `AGENTS.md` + `docs/engineering/` + 子树 `AGENTS.md`
- 本地 agent skill（`.grok/` 等）不进公开仓库
- 数学硬规则：`apps/web/src/math/AGENTS.md`
- 书架：`apps/web/src/subjects/bookshelf/AGENTS.md`
- 事实冲突：以代码与 CI 为准，再改文档

---

## 6. Track A：构建与 CI 可复现

### 6.1 目标

干净 CI 与干净本机都能构建前端/打包 Electron；shared 测试不再制造 coverage 竞态。

### 6.2 背景与已完成

| 任务                   | 状态                       | 说明                                                                                                                       |
| ---------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A1 依赖图构建          | **已完成**（`f1ee275`）    | `build:frontend` → `turbo run build --filter=@xiaohuang/web...` 再 copy                                                    |
| A2 coverage 竞态       | **已完成**（`f1ee275`）    | shared 不再真实跑 packages coverage；quality-repeatability 改投放合成 CSS                                                  |
| A4 turbo coverage 依赖 | **已完成**（`f1ee275`）    | `dependsOn: build/^build`，outputs `coverage/**`                                                                           |
| A3 quality 可读性      | **已完成**（`43e7bf7` 起） | `quality:fast` 本地快路径 + `docs/engineering/quality-commands.md` 质量命令地图（root-scripts contract 锁定不含 coverage） |

相关 CI 证据（完成后）：

- quality success：`https://github.com/xingyingyuzhui/Xiao-Huang-s-Classroom/actions/runs/31243574386`
- electron success：`https://github.com/xingyingyuzhui/Xiao-Huang-s-Classroom/actions/runs/31243574390`

### 6.3 任务 A3（详细）— quality 失败可读 + 本地快路径

**问题：** `npm run quality` 串十几步，失败时要翻长日志才知道是哪一段。

**建议交付：**

1. 根 `package.json` 增加：
   - `quality:fast`：不含第二次完整 quality 语义；本地常用：format:check + lint 子集 + typecheck + test + build（**不含** coverage 或可选）
   - 或 `quality:ci` 与本地说明文档对齐
2. `docs/engineering/` 增加一页「质量命令地图」（或本节附录同步）：每一步失败时如何单跑。
3. （可选）CI 把 quality 拆成 named steps 已存在则只补 README。

**文件（预期）：**

- `package.json`
- `docs/engineering/quality-commands.md`（新建）或更新现有 engineering 文档
- 若有 contract：`test/shared/root-scripts-contract.test.cjs`

**验证：**

```bash
npm run quality:fast   # 新增后
# 文档中每一步均可单独 npm run <script>
```

**完成定义：**

- [x] 新人按文档能在 3 分钟内定位「是 lint 还是 test 还是 coverage 挂了」（quality-commands.md 失败速查表）
- [x] 本地日常不必每次跑满 quality（CI 仍跑满）——`quality:fast`（`43e7bf7`）

### 6.4 Track A 回归守门（每次碰构建脚本必做）

```bash
# 模拟干净依赖产物
rm -rf packages/*/dist apps/web/dist
npm run build:frontend
# 期望：turbo 先建 packages，再 vite，再 copy 到 server/public

node --test --test-concurrency=1 test/shared/coverage-config-contract.test.cjs \
  test/shared/quality-repeatability.test.cjs
```

### 6.5 Track A 非目标

- 重写 Electron stage 目录布局
- 新增 NSIS/DMG 产品验收（属发布，Track D）
- 把 quality 拆成多个 GitHub workflow（可选，非必须）

---

## 7. Track B：结构瘦身与边界硬化

### 7.1 目标

新功能无处乱堆；双入口与幽灵 DOM 债务有关闭路径；大文件有「下一刀」而不是无限长。

### 7.2 任务 B1 — Graph 入口冻结（D5）

**现状：** `apps/web/src/math/graph/index.js` ~690 行，结构门禁 &lt;700。

**规则：**

- 新逻辑进：`graph-store` / `graph-document` / `graph-renderer` / `graph-*-controller` / `function-panel` 等
- **禁止** 再把 tool 状态机、probe、persistence UI、数值分析堆回 index

**文件：**

- `apps/web/src/math/graph/index.js`（只减不增职责）
- `test/web/math-graph-structure.test.cjs`（或现有 structure 测试）
- `apps/web/src/math/AGENTS.md`（若契约需写清）

**验证：**

```bash
node --test test/web/math-graph-structure.test.cjs
# 以及改动触及的 math-graph-*.cjs / math-function-*.cjs
wc -l apps/web/src/math/graph/index.js   # 必须 < 700
```

**完成定义：**

- [x] 结构测试绿（`64feac0` 补强：probe/analysis/readouts/transform/mount/follow 职责锁在聚焦模块，注入内联实现红验证被抓）
- [x] 本 Track 周期内 index 行数不升（690 &lt; 700；允许 ± 极小波动，禁止 +50 级）

### 7.3 任务 B2 — Graph 纯逻辑层边界

**目标层：**

| 允许                                                                              | 禁止                                                                  |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `graph-document.js` / `graph-store.js` / `graph-history.js` / migrations / 纯数值 | import jsxgraph、操作 DOM、`document.` 浏览器 API、持有 board element |

**步骤：**

1. 列出现有 pure 文件清单；grep 是否泄漏
2. 有泄漏则下沉调用或拆文件
3. 加/强化 arch 或 structure 测试

**验证：**

```bash
# 示例：对 pure 层禁止 jsxgraph / getElementById
rg -n "jsxgraph|getElementById|querySelector|localStorage" \
  apps/web/src/math/graph/graph-document.js \
  apps/web/src/math/graph/graph-store.js \
  apps/web/src/math/graph/graph-history.js
# 期望：无匹配（或仅注释）
```

### 7.4 任务 B3 — 化学大壳「先拆一把」

**热点（示意，以 `wc -l` 为准）：**

- `chemistry/ai-classroom/balance-shell.js`、`lab-shell.js`
- `chemistry/battle/*`、`molecule/reactions.js`
- `chemistry/data/offline-quiz-bank.js`（数据体量大，拆「数据/加载」边界）

**方法：**

1. 选 **1 个** 最高频改动文件
2. 抽出纯数据或纯逻辑 → 同目录新文件或 `shared`
3. 壳只保留编排
4. 行为测试/结构测试锁住

**完成定义：**

- [x] 目标文件行数明显下降（`offline-quiz-bank.js` 1860 → 22 行 loader，-98.8%；数据本体拆 `offline-questions-part{1,2}.js`，加载/完整性校验在 loader）
- [x] 相关 test 绿（`offline-quiz-layout.test.cjs` + `chem-text.test.cjs` 4/4；web 全量 435/435）
- [x] 本文记录「下一刀」（balance-shell/lab-shell 已 model/views 分层，剩余为编排；下一刀可选 `battle/ui.js` 编排瘦身或 `quiz-shell` 抽纯逻辑，需先量行为测试覆盖）

### 7.5 任务 B4 — 单一 manifest 入口（关 D13）

**问题：** hub/classroom 仍可能直连 registry；`subjectManifest()` adapter 已存在但消费不彻底。

**目标：**

```text
hub / classroom mount
    → subjectManifest() / subject-kit loader
    ✗  不再直连 catalog/registry 作为权威
```

**文件（预期）：**

- `apps/web/src/subjects/hub.js`
- `apps/web/src/subjects/classrooms/registry.js`（或仅降级为实现细节）
- `apps/web/src/subjects/manifest.js`
- `packages/subject-kit/*`
- `test/web/subject-hub.test.cjs`、相关 structure 测试
- `docs/engineering/debt-registry.md`（D13 → 关闭）

**验证：**

```bash
node --test test/web/subject-hub.test.cjs test/web/bookshelf-structure.test.cjs
# 按实际文件名调整
rg -n "from ['\"].*registry" apps/web/src/subjects/hub.js
```

**完成定义：**

- [x] 消费方权威入口唯一（`subject-catalog-entry.test.cjs` 锁定：catalog 仅 manifest 直连；hub/chrome/shell/home-shell 全走 manifest）
- [x] D13 状态更新为已删除/关闭，并记 commit（debt-registry D13 → 已关闭，2026-08-08）

### 7.6 任务 B5 — module 级 DOM 捕获样板（D3）

**问题：** `function-panel.js` 等在模块作用域捕获 DOM，重挂载可能指旧节点。

**目标模式：**

```text
mount(host) {
  const el = host.querySelector(...)
  // 状态闭包在实例内
}
dispose() {
  // 解绑、置空
}
```

**验证：** 换 tab / 二次 mount 的合同测试；无「点按钮无反应」类幽灵引用。

**完成定义（B5 样板）：**

- [x] `function-panel` / `function-editor` 提供 `dispose`（清除 `dataset.bound`/`ready`/`mathEditorBound` 标记 + 委托 listView/editor 解绑；红验证：旧代码无 dispose 时测试 3 fail）
- [x] 二次 mount 合同测试（`math-function-panel-lifecycle.test.cjs`：create → bind → dispose → 标记清除 → 二次 create → bind 重建成功；dispose 幂等）；模块顶层无 DOM 捕获断言
- [x] debt-registry D3 状态更新为「样板已建（B5）」，其余模块逐步套样板

### 7.7 任务 B6 — innerHTML 高风险点一轮（D4）

**步骤：**

1. `rg -n "innerHTML" apps/web/src --glob '!**/vendor/**'`
2. 标高风险（用户字符串、表达式、导入数据）
3. 一轮清 3–5 处到 textContent / DOM API
4. 保留低风险且有转义的可登记

### 7.8 Track B 非目标

- 重写 JSXGraph / Three 渲染器
- 大厅视觉大改
- 一次拆完所有化学 shell

---

## 8. Track C：类型化与 Server / Desktop 现代化

### 8.1 总策略

严格按 `docs/engineering/js-allowlist.md` 依赖序，但 **每次只交一个可演示切片**：

```text
C1 server settings 纯逻辑
 → C2 一条 route 端到端
 → C3 web shared 无 DOM 纯逻辑
 → C4 Electron main 状态机
```

### 8.2 切片 C1 — Server settings 样板（推进 D14 / allowlist B1）

**目标路径（按仓库实际调整）：**

- `apps/server/src/services/settings-service.js` → `.ts`
- 相关 repository / normalize
- `tsup` 产出 CJS
- 入口 **薄转发** 或已有 index 引用 dist（pkg 未退役前允许薄 JS 入口）

**纪律：**

- 错误用 `@xiaohuang/domain-core`
- 外部形状用 `@xiaohuang/contracts`
- 行为：`test/server` 里 settings 相关测试必须绿

**验证：**

```bash
npm run build -w @xiaohuang/server
npm run test -w @xiaohuang/server
# 或 node --test test/server/*settings*
```

**完成定义：**

- [x] 至少 1 个生产 service 以 TS 为权威源（`settings-service.ts`，`63f8ab5`）
- [x] allowlist 记录该批删除的 JS 路径（js-allowlist.md「B1 已落地」表：settings-service.js 薄转发桥，B2 后删除）
- [x] 无大面积 `any`（零 any；server typecheck 3 TS 文件通过）

### 8.3 切片 C2 — 一条 Route 端到端样板

**选一条低风险 route（建议 settings 或只读 API）：**

1. handler 迁 TS
2. 请求/响应走 contracts
3. 组合根仍可 JS 薄封装

**完成定义：** curl/合同测试覆盖 200 + 校验失败路径。

### 8.4 切片 C3 — Web shared 纯逻辑 TS

**候选（无 DOM 优先）：**

- 主题读色纯函数
- `frame-task` 合并调度
- 与 DOM 无关的数值/格式化工具

Vite 原生 TS；测试可继续 cjs 动态 import 编译结果或改 vitest。

**C3 完成（2026-08-08，frame-task 切片）：**

- [x] `math/shared/frame-task.ts` TS 权威（无 DOM 纯逻辑，帧合并调度）；消费方 import 路径不变（Vite 解析到 .ts）
- [x] 相关测试迁 vitest（D7 样板）：`math-frame-task` / `math-graph-readouts` / `math-graph-performance` → `*.vitest.ts`；`apps/web/vitest.config.ts`（glob 与 node:test cjs 不交叉）
- [x] 验证：web 全量 node:test 410 + vitest 28 = 438 绿；typecheck 1 TS；Vite build 通过；lint:arch 337 文件无违规

### 8.5 切片 C4 — Electron main TS

**前置：** 尽量不与未完成的 pkg 退役硬绑；产物 CJS 给 electron-builder。

**验证：**

```bash
npm run verify:electron-package
# 或 CI electron-package
```

**C4 完成（2026-08-08）：**

- [x] `apps/desktop/src/main.ts` TS 权威（main.cjs 全量迁移：zoom/menu/startup/窗口生命周期；startup-state-machine JS 被 tsup bundle 进单产物）
- [x] tsup 单产物 `dist/main.js`（external electron，CJS）；`main.cjs` 薄转发桥；electron-builder files 含产物——**app.asar 不再依赖 src/ 目录**（修复打包版 require startup 缺失隐患）
- [x] 验证：desktop typecheck 1 TS、build 通过、desktop 测试 22/22（ipc-contract/stage 断言指向 main.ts + 薄转发桥）、verify:electron-package 通过（asar 含 dist/main.js，release 1/1）

### 8.6 Track C 非目标

- 一季度清空全部 ~274 JS
- 为进度关闭 `no-explicit-any`
- pkg 仍在时强行删除 `src/index.js` 权威入口

---

## 9. Track D：发布与债务收口

### 9.1 D-pkg — 便携 pkg 退役（D2）

**删除条件（必须全勾）：**

- [ ] Electron portable/dir 包可启动
- [ ] 用户数据导入/路径正确
- [ ] 关键 API 可用
- [ ] AI 设置可用
- [ ] 离线题库/实验关键路径可用
- [ ] `pkg-retirement-gate.md` 清单签字式记录

**未完成前：** 保持 smoke；不删 build:exe 除非替代已验收。

### 9.2 D-data — `apps/server/src/data/`（D9）

- 代码：仅识别历史路径，**新写入禁止**
- 文档：写明三类数据位置（web dev / electron userData / pkg 邻近）

**D-data 完成（2026-08-08）：**

- [x] 代码确认无 `src/data` 写入（paths.js 只走三类运行位置）；seed 头注释修正为真实数据源（`apps/web/src/chemistry/data`，sync 重新生成无数据漂移）
- [x] `docs/engineering/data-paths.md`：三类数据位置 + 历史路径只识别不写说明
- [x] `test/shared/data-paths-contract.test.cjs` 锁定（4/4）；debt-registry **D9 → 已关闭**

### 9.3 D-test — node:test → Vitest（D7）

- 按 owner 分批：`test/web`、`test/server`…
- 禁止双份权威用例长期并存
- 迁完后简化根 `test` 脚本；可去掉过严 concurrency 限制（在稳定后）

**D-test 进度：**

- [x] 第一批（C3）：frame-task 相关 3 文件迁 vitest（`*.vitest.ts` glob 与 cjs 不交叉）
- [x] 第二批（2026-08-08）：chem-text TS 化随迁（`chem-text.vitest.ts`）；web vitest 30 用例
- [x] 第三批（2026-08-08）：server settings-service 测试迁 vitest（`apps/server/test/settings-service.test.ts`，4 用例）；server vitest 10 用例
- [x] 第四批（2026-08-08）：server 纯逻辑 4 文件迁 vitest（ai-response-parser / balance-script-schema / builtin-molecule-properties / structured-logger，18 用例）；server vitest 28 用例
- [x] B2 批次完成（2026-08-08）：16 个 route TS 权威源（settings + ai/* 5 + chemistry/* 8 + v2/settings）；模式：createXxxRouter 工厂 + 组合根注入 db/服务/seed（防 sql.js 双实例与限流双计数）；薄转发桥 + clean-build fixture 同步
- [x] B6 首批（2026-08-08）：math/plane/model.ts（254 行纯函数类型化）+ math-models 测试迁 vitest
- [x] B5 批次（2026-08-08，agent 并行）：8 个 subject/classroom shell TS（session/chrome/home-shell/tabbed/physics/biology/chemistry/math classroom）
- [x] B6 化学批次（2026-08-08，agent 并行）：7 个纯逻辑/数据 TS（elements/molecules/chem-topics/substance-cards/battle-cards/lab-prestudy/equation-balance）
- [x] D-test server 全量（2026-08-08，agent 并行）：16 个集成测试迁 vitest——server node:test 归零（107 vitest 用例）
- [x] B7 评估（2026-08-08）：three 4 渲染器 + jsxgraph 单点边界守门
- [ ] 持续项：B6 剩余（math 纯逻辑 / graph 层）/ B5 剩余（manifest/hub 入口）——随产品迭代推进

### 9.4 D-jessie — JSXGraph eval 警告（D8）

- 出 ADR：接受 / 升级 / CSP / 替代
- 禁止用「关掉 warning」假装解决

**D-jessie 完成（2026-08-08）：**

- [x] ADR-0003（已接受）：项目不启用 JessieCode，渲染路径不把表达式字符串交给 JSXGraph——eval 风险面锁定在第三方包内部；升级时复查，B7 落地后再评估收窄
- [x] `test/web/jsxgraph-eval-guard.test.cjs` 守门（2/2）：生产代码无 `JXG.evaluate` / `.jc(` / `JessieCode` 调用
- [x] debt-registry D8 → **已评估**（ADR + 使用面锁定）

---

## 10. 排期与人力模型

### 10.1 12 周示意

```text
Week 1–2    A3 收尾 + B1/B2 守门确认
Week 3–5    B3 先拆一把 + B5 样板 + C1 settings TS
Week 6–8    B4 关 D13 + B6 innerHTML 一轮 + C2 route 样板
Week 9–10   C3 web shared TS 一批
Week 11–12  C4 Electron main 启动 或 D-pkg 推进；D-test 启动评估
```

### 10.2 人力

| 人力       | 规则                                                               |
| ---------- | ------------------------------------------------------------------ |
| 1 人全职   | 主 Track 1 + 守门任务 1                                            |
| 2 人       | A/B 与 C 可弱并行；**禁止**同时改 server 生产入口与 Electron stage |
| 有产品并行 | 功能 PR 必须遵守 B1/B2；不得借功能把逻辑塞回 index                 |

### 10.3 每周仪式（15–30 min）

1. CI 是否仍双绿？
2. debt-registry 是否有状态变更？
3. 本周是否出现新 god-file（&gt;400 行无预算）？
4. 下一刀选哪条任务？

---

## 11. 验收命令速查

### 11.1 通用

```bash
# 安装
npm install

# shared 合同（串行，避免历史竞态）
node --test --test-concurrency=1 test/shared/*.cjs

# 全仓测试（根脚本已含 concurrency 策略）
npm test

# 类型
npm run typecheck

# 完整质量（合并前 / CI）
npm run quality
```

### 11.2 构建可复现

```bash
rm -rf packages/*/dist apps/web/dist
npm run build:frontend
# 检查
test -f packages/subject-settings/dist/index.js
test -f apps/web/dist/index.html
test -f apps/server/public/index.html
```

### 11.3 数学画布

```bash
node --test test/web/math-graph-structure.test.cjs
node --test test/web/math-graph-*.cjs test/web/math-function-*.cjs
# 按改动裁剪文件列表
```

### 11.4 Electron

```bash
npm run verify:electron-package
# 或依赖 CI：electron-package workflow
```

### 11.5 架构 / 主题 / 资源

```bash
npm run lint:arch
npm run lint:theme-tokens
npm run lint:assets
```

---

## 12. 风险、回滚与并行禁区

### 12.1 风险矩阵

| 风险                   | 影响         | 缓解                             |
| ---------------------- | ------------ | -------------------------------- |
| 大爆炸重构             | 回归难查     | 小切片；先测后码；单职责拆分     |
| 双轨 TS/JS             | 行为漂移     | 同提交删旧权威；禁止长期双实现   |
| CI 再被本机掩盖        | 假绿         | 干净删 dist 复现；CI 双 workflow |
| 并行改 server+electron | 打包全挂     | 并行禁区                         |
| 为 TS 引入 any         | 类型门禁失效 | no-explicit-any；切片 review     |

### 12.2 回滚

- 单 Task：`git revert <commit>`
- 整 Track：revert 该 Track 合并区间
- 不在用户数据目录做破坏性迁移验证

### 12.3 并行禁区

| 区域 A                            | 区域 B                     | 规则                 |
| --------------------------------- | -------------------------- | -------------------- |
| `apps/server` 生产入口 / 数据路径 | Electron stage / main 启动 | 禁止同周两人并行大改 |
| `graph/index.js`                  | 任意「临时」业务塞入口     | 禁止                 |
| packages 公共 API 大改            | 全 apps 消费方未同 PR      | 禁止                 |

---

## 13. 明确不做

1. 不为整齐合并/拆分 monorepo 顶层。
2. 不重做大厅书架视觉与 dissolve（走 product/hub 规格）。
3. 不把 biology/physics 内容填充绑在本计划。
4. 不在 pkg 未退役时强制 server 全量只跑 dist。
5. 不靠关 warning 解决 JSXGraph eval。
6. 不做「无删除条件」的债务登记。

---

## 14. 债务映射表

| 债务 ID | 摘要                | 本计划落点     | 目标状态        |
| ------- | ------------------- | -------------- | --------------- |
| D1      | JS/CJS 双份         | C1–C4          | 随迁移删除      |
| D2      | pkg 便携版          | D-pkg          | 验收后退役      |
| D3      | module DOM 捕获     | B5             | 样板关闭        |
| D4      | innerHTML           | B6             | 高风险一轮清    |
| D5      | graph/index 膨胀    | B1             | 门禁持续守      |
| D6      | 旧 JS 无门禁        | 已部分解决 + C | allowlist 推进  |
| D7      | 测试双轨            | D-test         | 分批迁 Vitest   |
| D8      | JSXGraph eval       | D-jessie       | ADR             |
| D9      | server/src/data     | D-data         | 只识别不写      |
| D10     | boundaries 人工     | B2 / arch 脚本 | 脚本化          |
| D11     | CSS 重复选择器      | 主题/CSS 专项  | stylelint 清零  |
| D12     | node:test 并行 IPC  | 已控制         | Vitest 后去限制 |
| D13     | hub/registry 双入口 | B4             | **关闭**        |
| D14     | server 仍 JS        | C1+            | 切片推进        |

每关闭一条：在 `docs/engineering/debt-registry.md` 写 **达成日期 + commit**。

---

## 15. 本周可开的下一刀

按风险从低到高：

| 顺序 | 任务                                   | 预估     | 产出             |
| ---- | -------------------------------------- | -------- | ---------------- |
| 1    | **A3** quality:fast + 命令地图         | 0.5–1 天 | 本地体验与文档   |
| 2    | **B1** 确认 structure 门禁仍锁 &lt;700 | 0.5 天   | 防 graph 回潮    |
| 3    | **B2** pure 层 grep + 测试加固         | 1–2 天   | 边界硬化         |
| 4    | **C1** settings service TS 样板        | 2–4 天   | allowlist 真进展 |
| 5    | **B4** manifest 单一入口关 D13         | 2–3 天   | 债务表可勾       |

**推荐默认：** `A3 → B1 → C1`；若有产品功能并行，功能 PR 必须附带 **B1 纪律**。

---

## 16. 附录

### 附录 A · 相关文档索引

| 文档                                                              | 用途                   |
| ----------------------------------------------------------------- | ---------------------- |
| 根 `AGENTS.md`                                                    | 公开仓库运行约束与导航 |
| `docs/superpowers/plans/2026-08-07-unified-engineering-system.md` | Program 0–7 原文       |
| 本地 `.grok/skills/...`（不提交）                                 | 开发者本机 Agent OS    |
| `docs/engineering/debt-registry.md`                               | 旧债与删除条件         |
| `docs/engineering/js-allowlist.md`                                | TS 迁移批次            |
| `docs/engineering/behavior-compatibility.md`                      | 行为红线               |
| `docs/engineering/baseline-2026-08-07.md`                         | 基线数据               |
| `docs/engineering/coverage-baseline.md`                           | 覆盖率基线             |
| `docs/engineering/pkg-retirement-gate.md`                         | pkg 退役门             |
| `apps/web/src/math/AGENTS.md`                                     | 数学画板契约           |
| 根 `AGENTS.md`                                                    | 仓库运行约束           |

### 附录 B · 与 Program 0–7 对照

| 旧 Program                 | 本计划                    |
| -------------------------- | ------------------------- |
| P0 基线/债务               | 已完成 → 只维护           |
| P1 工程基座                | 已基本完成 → Track A 守门 |
| P3/P4 UI / subject-kit     | 未完 → B4/B5/B6           |
| P5/P6 Server / Electron TS | → Track C + D-pkg         |
| P7 质量收口                | → A + B1 + D-test         |

### 附录 C · 关键路径备忘

```text
# 前端
apps/web/src/main.js
apps/web/src/subjects/hub.js
apps/web/src/subjects/manifest.js
apps/web/src/math/graph/index.js

# 后端
apps/server/src/index.js
apps/server/src/routes/
apps/server/src/services/

# 桌面
apps/desktop/main.cjs

# 共享
packages/*/src

# 门禁
tooling/architecture/
.github/workflows/quality.yml
.github/workflows/electron-package.yml
```

### 附录 D · 任务卡片模板（可复制）

```markdown
### Task ID: （如 B4）

- 标题：
- 分支：codex/
- 背景（问题/债务 ID）：
- 完成定义（可勾选）：
  - [ ]
- 计划改动文件：
- 先写的失败测试：
- 验证命令：
- 风险与回滚：
- 完成后更新：
  - [ ] debt-registry
  - [ ] js-allowlist（若触及）
  - [ ] 本文状态（若阶段性完成）
```

### 附录 E · 状态更新日志

| 日期       | 变更                                                    | Commit / 证据                                     |
| ---------- | ------------------------------------------------------- | ------------------------------------------------- |
| 2026-08-08 | 初版路线图                                              | 文档                                              |
| 2026-08-08 | A1/A2/A4 落地；CI quality+electron 双绿                 | `f1ee275`；actions runs 31243574386 / 31243574390 |
| 2026-08-08 | 扩展为详细可复制完整计划 v1.1                           | 本文                                              |
| 2026-08-08 | A3 落地（quality:fast + 命令地图）                      | `43e7bf7`                                         |
| 2026-08-08 | B1 落地（graph 入口冻结守门补强）                       | `64feac0`                                         |
| 2026-08-08 | C1 落地（settings service TS 样板 + Electron 布局同步） | `63f8ab5`；verify:electron-package 通过           |
| 2026-08-08 | B2 落地（graph pure 层白名单 4→18 + 注入红验证）        | `3ae706a`                                         |
| 2026-08-08 | B4 落地（manifest 单一入口，关 D13）                    | B4 提交；debt-registry D13 → 已关闭               |
| 2026-08-08 | B3 落地（offline-quiz-bank 数据/加载边界拆分）          | B3 提交；1860 → 22 行 loader                      |
| 2026-08-08 | B5 落地（function-panel/editor dispose 样板，D3 样板）  | B5 提交；二次 mount 合同测试                      |
| 2026-08-08 | D-data 落地（数据路径收口，D9 关闭）                    | D-data 提交；data-paths.md + 合同测试             |
| 2026-08-08 | D-jessie 落地（JSXGraph eval ADR-0003，D8 已评估）      | D-jessie 提交；使用面守门                         |
| 2026-08-08 | D10/D11 收口（边界脚本化确认 + CSS 清零）               | 债务表 D10/D11 → 已关闭                           |
| 2026-08-08 | G3 大文件预算门禁（lint:large-files 入 quality）        | G3 提交；G2/G4/G5 勾选收官                        |
| 2026-08-08 | C4 落地（Electron main TS 单产物）                      | C4 提交；asar 含 dist/main.js                     |
| 2026-08-08 | C3 落地（frame-task TS 切片 + web vitest 样板）         | C3 提交；web 438 绿                               |

---

**文档结束。** 执行时从 §15 选下一刀，用附录 D 开任务卡，用 §11 做验收。
