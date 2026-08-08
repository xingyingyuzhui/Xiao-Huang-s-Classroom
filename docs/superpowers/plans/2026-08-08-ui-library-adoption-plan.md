# 小黄的教室 · UI 库（@xiaohuang/ui）完整建设与采用计划

| 字段 | 内容 |
| --- | --- |
| **文档类型** | 可执行计划（交给 Agent / 人类按 Task 推进） |
| **版本** | 2026-08-08 v1.0 |
| **范围** | `packages/ui` 能力完善 + `apps/web`（及必要 server 壳）真实采用 + 主题样式对齐 + 门禁 |
| **分支约定** | 每个 Phase / 大 Task 使用 `codex/ui-*` feature 分支；**本计划不包含合 main / 推 main** |
| **权威冲突** | 以当前代码 + 测试为准；完成后回写 `debt-registry`（D4 等）与本文附录状态日志 |
| **关联** | 工程总路线图 Track B6 / allowlist B4–B5 / Program 3 UI；**本文件是 UI 专线的完整执行册** |

---

## 0. 执行者必读（给其它 Agent）

### 0.1 你在解决什么问题

`@xiaohuang/ui` **已有 TS 组件骨架与包测**，但业务几乎不用（仅 `function-panel` 的 `createButton` 试点 + `dev/catalog`）。产品 UI 仍是 HTML partial + 手写 DOM/`innerHTML` + 散落 CSS 类（`.btn` / `.math-fn-btn` / `.mol-btn`…）。

目标：**把 UI 库做成教室产品真正依赖的组件资源库**——新代码默认用库，旧面分批替换，主题一致，禁止不可信 `innerHTML` 继续蔓延。

### 0.2 硬纪律

1. **小切片、可测完成定义**；禁止「一次替换全站 HTML」。  
2. **组件一律 `textContent` / 受控 DOM**；禁止组件内部对不可信字符串 `innerHTML`（与 `packages/ui/src/contract.ts` 的 `setText` 一致）。  
3. **主题色只走 CSS 变量**（`var(--stamp)` 等），禁止组件硬编码色值；与 `lint:theme-tokens` 精神一致。  
4. **UiController 合同**：`element` / `update` / `on` / `dispose`；消费方必须在 dispose/换 tab 时调用 `dispose()`（对齐 B5 DOM 捕获样板）。  
5. **样式兼容策略**：迁移期允许 `className` 挂接既有类（如 `math-fn-btn`），同时组件自带 `ui-*` 基类；最终以 `ui-*` + token 为主。  
6. **计划内不写合 main / 推 main**；在 feature 分支完成验证即可。需要远端 CI 时只推 feature 分支。  
7. 不提交 `dist/`、`coverage/`、用户数据、嵌套 lockfile。  
8. 安装只从仓库根：`npm install`。

### 0.3 标准 Task 流程

```text
1. 读本 Task 全文 + 相关文件
2. git status；开分支 codex/ui-<phase>-<short>
3. 先写/改失败测试（包测 + 消费方合同测）
4. 实现 packages/ui 与/或 apps/web 消费
5. 跑本 Task 验证命令
6. 更新附录「状态日志」与 debt-registry（若触及 D4）
7. 在 feature 分支 commit（完整句子说明 why）
```

### 0.4 全局验证命令（任何 Phase 结束建议跑）

```bash
# UI 包
npm run test -w @xiaohuang/ui
npm run typecheck -w @xiaohuang/ui
npm run build -w @xiaohuang/ui

# 主题 / 资源门禁（样式相关时）
npm run lint:theme-tokens
npm run lint:css

# 数学画布相关消费方
node --test test/web/math-function-panel-controller.test.cjs \
  test/web/math-graph-structure.test.cjs 2>/dev/null || true
# 按改动补全 test/web 相关文件

# 本地快路径（可选）
npm run quality:fast
```

---

## 1. 现状快照（执行前事实）

### 1.1 包现状 `packages/ui`

| 区域 | 已有工厂（示意） |
| --- | --- |
| contract | `UiController`, `BaseProps`, `setText`, `applyStates` |
| primitives | button, icon, checkbox, input, select, slider |
| overlays | dialog, toast, tooltip |
| layout | tabs, stack |
| feedback | status, progress |
| domain-ui | number-input, tool-group |
| classroom-ui | readout-card |
| 测试 | `packages/ui/test/*.test.ts`（vitest） |
| 构建 | tsup → `dist`；web 依赖 `"@xiaohuang/ui": "*"` |

### 1.2 业务采用现状

| 消费方 | 使用情况 |
| --- | --- |
| `math/graph/function-panel.js` | **仅** `createButton` 试点（添加函数按钮） |
| `dev/catalog/main.js` | 组件展览页（非产品路径） |
| 数学/化学教室主体 | **未采用**；HTML partial + 手写 DOM |
| 全局对话框 | 多为 app 层 `appAlert`/`appConfirm` 等，未统一到 `createDialog` |

### 1.3 样式双轨

| 轨 | 位置 | 角色 |
| --- | --- | --- |
| 主题 token | `apps/web/src/shared/styles/themes/*/tokens.css` | **视觉权威** |
| 业务 CSS | `_forms.css` `.btn`、`_math-classroom.css` `.math-fn-btn`、`_molecule.css` `.mol-btn`… | **当前产品外观** |
| ui 组件类 | 组件内 `ui-btn` / `is-primary` 等 | **库默认**；需与 token 对齐并补全局 `ui-*.css` 入口 |

### 1.4 问题诊断（根因）

1. **有库无强制采用路径** → 新代码仍复制旧 HTML 模式。  
2. **视觉未产品化** → `ui-*` 类缺完整 CSS 或与教室皮肤不一致，开发者不敢用。  
3. **HTML partial 架构** → 静态 markup 与 JS 控制器分裂，库组件偏「JS 创建」，迁移成本高。  
4. **缺少采用门禁** → 无「新文件禁止裸 createElement button」类合同。  
5. **dispose 生命周期** 未在全教室强制 → 与 B5 样板需一起推广。

---

## 2. 目标与非目标

### 2.1 完成画像（本计划全部 Phase 结束后）

1. **样式：** 存在官方 `ui` 样式层，绑定主题 token，五主题下按钮/输入/对话框观感与教室一致。  
2. **API：** 组件 API 稳定；`UiController.dispose` 在文档与消费方强制。  
3. **采用面（硬指标）：**  
   - 数学函数侧栏（添加/AI/编辑/导入导出重置）控件创建走 `@xiaohuang/ui`  
   - 全局确认/提示对话框至少一条主路径走 `createDialog`/`createToast`（或明确 adapter 包装现有 app-dialog）  
   - 数学画板工具条 **或** 笔记条 二选一完成库化工具组（`createToolGroup` 或等价）  
   - 化学侧至少 **一个** 列表/工具条面板完成同等替换（分子或 AI 课壳，选改动面清晰者）  
4. **门禁：**  
   - 新增业务代码禁止「无注释豁免的裸 `button`+innerHTML 拼 UI」的合同测试或 lint 规则（范围可先 math/graph + 新文件）  
   - D4 高风险 innerHTML 清单一轮关闭或降级  
5. **文档：** `packages/ui/README.md` + 公开 `docs/engineering/ui-library.md` 说明何时用库、如何 dispose、如何挂既有 className。  
6. **dev catalog** 与产品组件 API 同步，可作验收展览。

### 2.2 非目标（本计划不做）

- 不重做大厅书架 3D / dissolve 视觉。  
- 不把 JSXGraph/Three 画布控件强行塞进 ui 包。  
- 不一次删除全部 HTML partial。  
- 不引入 React/Vue；保持 **typed DOM controller** 路线。  
- 不把 `.grok` skill 提交进公开仓。  
- **不包含合 main / 推 main。**

### 2.3 成功度量（可检查）

| 指标 | 目标 |
| --- | --- |
| `rg "from '@xiaohuang/ui'" apps/web/src` 业务文件数（排除 dev/catalog） | ≥ **8** 个文件 |
| 数学侧栏主操作按钮经 createButton/create* | **100%** 主工具条按钮 |
| packages/ui 测试 | 全绿；关键组件有 dispose 测试 |
| lint:theme-tokens / lint:css | 相关改动后绿 |
| 五主题下 dev catalog 与函数侧栏目视 | 无「灰原型按钮」突兀（执行者自检清单） |

---

## 3. 目标架构

### 3.1 运行时关系

```text
apps/web feature（function-panel / shell / …）
    │  import { createButton, createDialog, … } from '@xiaohuang/ui'
    │  controller.dispose() on classroom dispose / panel teardown
    ▼
packages/ui  (TS, UiController)
    │  class: ui-* + 可选 className 桥接旧类
    │  颜色/圆角: var(--token)
    ▼
apps/web 全局样式
    themes/*/tokens.css   ← 语义色权威
    shared/styles/_ui-kit.css  ← 本计划新增：ui-* 映射到 token
    feature CSS            ← 逐步变薄，只留布局特例
```

### 3.2 组件分层（保持并扩展）

| 层 | 职责 | 扩展原则 |
| --- | --- | --- |
| primitives | 原子控件 | 先补齐 props/a11y/dispose 测试，再加变体 |
| overlays | 对话框/toast/tooltip | 与键盘焦点陷阱、Esc 关闭对齐产品 |
| layout | stack/tabs | 少即是多；不做成页面框架 |
| feedback | status/progress | 错误态与 BaseProps.error 语义统一 |
| domain-ui | number-input/tool-group | **教室专用**，可依赖 primitives |
| classroom-ui | readout-card 等 | 只放跨 lab 复用读数/卡片，不放 graph 私有逻辑 |

### 3.3 迁移策略（双轨期）

**阶段策略：Bridge → Prefer → Enforce**

1. **Bridge：** 组件支持 `className` 挂 `math-fn-btn` / `btn primary`，视觉零回归。  
2. **Prefer：** 文档与 code review 要求新 UI 用库；catalog 展示标准 `ui-*` 皮肤。  
3. **Enforce：** 合同测试/lint 对指定目录禁止新增裸按钮模板字符串。  

每条业务面替换顺序：**先桥接 class 保外观 → 再抽 CSS 到 ui-kit → 再删冗余 feature CSS**。

---

## 4. Phase 总览

| Phase | 名称 | 预估 | 依赖 |
| --- | --- | --- | --- |
| **P0** | 基线冻结与采用仪表盘 | 0.5–1 天 | 无 |
| **P1** | 视觉基座：ui-kit.css + token 对齐 + catalog | 2–4 天 | P0 |
| **P2** | 组件合同硬化（a11y、dispose、测试矩阵） | 2–3 天 | P1 可并行收尾 |
| **P3** | 数学函数侧栏全量采用 | 3–5 天 | P1+P2 |
| **P4** | 全局 Overlay 适配（Dialog/Toast） | 2–4 天 | P2 |
| **P5** | 数学画板 chrome 一条线（工具条或笔记条） | 3–5 天 | P2+P3 |
| **P6** | 化学一面板采用 | 3–5 天 | P1+P2 |
| **P7** | 门禁、D4 收口、文档与采用指标 | 2–3 天 | P3 至少完成 |

可并行：P2 与 P1 尾部；P5 与 P6 在 P3/P4 后可两人分头（仍建议单 Agent 串行以免样式冲突）。

---

## 5. Phase 0 — 基线冻结与采用仪表盘

### Task P0.1 采用现状记录

**产出文件：**

- `docs/engineering/ui-library.md`（新建：现状、架构、采用表、禁止事项）
- 可选：`docs/engineering/ui-adoption-baseline.md` 表格

**步骤：**

1. 统计：`rg -n "from '@xiaohuang/ui'" apps/web/src`  
2. 统计：高风险 `innerHTML` 热点目录列表（math/shared、classroom、chemistry 抽样）  
3. 写明当前试点与缺口  

**验证：** 文档存在且路径正确；被 `repo-entry` 或新合同可选引用。

**Commit 说明示例：** `docs(eng): freeze UI library adoption baseline`

### Task P0.2 采用计数合同测试（仪表盘）

**文件：** `test/shared/ui-adoption-contract.test.cjs`（新建）

**断言建议：**

- `packages/ui/package.json` 存在且 web 依赖包含 `@xiaohuang/ui`  
- `packages/ui/src/index.ts` 导出 `createButton`、`createDialog`、`createToast`、`createToolGroup`、`createReadoutCard`  
- 业务消费文件数 ≥ 当前基线（初始可 =1：function-panel）；**后续 Phase 抬高阈值**（见 P7）  
- 禁止回退：function-panel 必须 import createButton  

**验证：**

```bash
node --test test/shared/ui-adoption-contract.test.cjs
npm run test -w @xiaohuang/ui
```

---

## 6. Phase 1 — 视觉基座（ui-kit + token）

### Task P1.1 新增全局 `ui-kit` 样式

**文件：**

- 新建 `apps/web/src/shared/styles/_ui-kit.css`  
- 在样式总入口（如 `apps/web/src/shared/styles` 主 import 或 `main` 引入链）挂载  
- 覆盖：`.ui-btn`、`.ui-btn.is-primary|ghost|danger|sm|lg`、`.ui-input`、`.ui-select`、`.ui-slider`、`.ui-dialog`、`.ui-toast`、`.ui-tabs`、`.ui-stack`、`.ui-checkbox`、状态 `.is-disabled|.is-loading`  

**规则：**

- 颜色/边框/圆角/阴影 **只** `var(--stamp)`、`var(--paper)`、`var(--border-ink)`、`var(--radius-control)` 等  
- 不引入新硬编码 hex（除非 token 尚缺失且同时补 tokens——优先复用现有 71 token）  
- 五主题下通过切换 `data-theme` 目视（执行者 checklist）  

**验证：**

```bash
npm run lint:css
npm run lint:theme-tokens
```

### Task P1.2 组件默认 class 与文档对齐

**文件：** `packages/ui/src/primitives/*`、`overlays/*` 等  

**步骤：**

1. 确认每个工厂根节点 class 稳定（`ui-btn` 等），与 `_ui-kit.css` 一致  
2. 保留 `className` 合并逻辑（多 class 空格安全）  
3. 包测：快照或 classList 断言  

### Task P1.3 升级 dev catalog 为验收场

**文件：** `apps/web/src/dev/catalog/main.js`（及路由若有）

**要求：**

- 展示：Button 全 kind/size、Input、Select、Slider、Dialog、Toast、Tabs、ToolGroup、ReadoutCard、NumberInput  
- 展示：桥接模式（`className: 'math-fn-btn'`）与纯 ui 模式对比  
- 不依赖私有 skill 路径  

**验证：** 本地 dev 打开 catalog 无报错；catalog 仍从 `@xiaohuang/ui` 导入。

### Task P1.4 主题差异补丁（若有）

若 blackboard 等深色主题下对比度不足：只在对应 `themes/*/skin.css` 补 `ui-*` 覆盖，**不**在组件 TS 里写死颜色。

---

## 7. Phase 2 — 组件合同硬化

### Task P2.1 dispose 与泄漏测试

**每个导出工厂** 在 vitest 中至少：

- create → update → dispose 后再次 click 不触发 handler  
- dispose 可重复调用安全  

**文件：** `packages/ui/test/*.test.ts` 扩展  

### Task P2.2 a11y 基线

| 组件 | 最低要求 |
| --- | --- |
| Button | type=button；disabled 时 aria；loading 时 aria-busy 建议 |
| Dialog | role=dialog；Esc 关闭；焦点回到 opener（能测则测） |
| Input/Select | label 关联或 aria-label |
| Toast | role=status 或 alert（按语义） |

### Task P2.3 API 冻结清单

在 `docs/engineering/ui-library.md` 写 **Stable API v1** 表：工厂名、主要 props、events、dispose 语义。  
后续破坏性变更必须升版本说明（包仍为 0.0.x 时可记 changelog 段）。

### Task P2.4 与 app-dialog 关系决策（写进文档并实现 Adapter 或替换）

**二选一（执行者选更小风险并写 ADR 小节到 ui-library.md）：**

- **A. Adapter：** `shared/ui/app-dialog.js`（或现有路径）内部改调 `createDialog`，对外 API 不变  
- **B. 双轨短期：** 新代码用 createDialog；旧 appAlert 暂留，P4 再收  

推荐 **A**，减少分叉。

**验证：** 现有 dialog 相关测试（若有）+ 手工确认设置/确认框仍可用。

---

## 8. Phase 3 — 数学函数侧栏全量采用（核心产品面）

### 范围

**文件主战场：**

- `apps/web/src/math/graph/function-panel.js`  
- `apps/web/src/math/graph/function-list-view.js`（若有按钮/菜单）  
- `apps/web/src/math/graph/function-editor.js`  
- `apps/web/src/subjects/classrooms/partials/math-panels.partial.html`（逐步去掉静态 button，改由 JS 挂载）  
- 测试：`test/web/math-function-panel-controller.test.cjs` 等  

### Task P3.1 工具条按钮全部 createButton

含：添加、AI、编辑、导入、导出、重置（及 partial 中其它侧栏主按钮）。  

- 使用 `className` 保留 `math-fn-btn` / `math-project-btn` 直至 P1 皮肤可单独支撑  
- 所有 controller 存到 panel 实例，在既有 `dispose` 路径调用  

### Task P3.2 列表卡菜单与危险操作

- 删除/更多菜单：优先 primitives + 受控 DOM；禁止拼接用户名到 innerHTML  
- 确认删除：走 Dialog（P2/P4 适配后）  

### Task P3.3 编辑表单控件

- 名称/表达式输入：`createInput` 或保持 native 但 **统一包装**  
- 系数：评估 `createNumberInput` / `createSlider` 与现有 range+number 双控兼容；若双控复杂，本 Task 至少统一「主按钮+状态展示」  

### Task P3.4 合同测试升级

- panel 测试：二次 mount 不双绑（B5 已有则扩展）  
- adoption 测试：function-panel 内 `createElement('button')` 数量 = 0 或仅允许清单  

**验证：**

```bash
npm run test -w @xiaohuang/ui
node --test test/web/math-function-panel-controller.test.cjs
node --test test/shared/ui-adoption-contract.test.cjs
# 抬高采用文件数阈值到 ≥3
```

---

## 9. Phase 4 — 全局 Overlay

### Task P4.1 Dialog 主路径

- 完成 P2.4 决策落地  
- 覆盖：函数删除确认、导入覆盖确认、重置画布确认（按产品现有入口）  

### Task P4.2 Toast / Status

- 操作成功/失败轻提示优先 Toast  
- 持久错误条可用 Status  

### Task P4.3 焦点与滚动

- Dialog 打开时背景滚动锁定（若产品需要）  
- 测试用 fake DOM 能测的部分写入 vitest  

---

## 10. Phase 5 — 数学画板 Chrome 库化

### 选题（执行者二选一，文档登记）

| 选项 | 路径 | 说明 |
| --- | --- | --- |
| **5A 工具条** | `math/shared/board-tools.js` | `createToolGroup` + createButton；保留收起 ▲/▼ 行为 |
| **5B 笔记条** | `math/shared/board-notes.js` | 工具 chip 用 ui 按钮/ tool-group |

### Task P5.x 实现要求

- 禁止大段 HTML 字符串生成可点击控件（canvas 除外）  
- dispose 与 board free 生命周期一致  
- 结构测试：board-tools 仍忽略 strip 点击（已有逻辑保持）  

**验证：** math board 相关 test + 手工：切换工具、收起展开、主题切换。

---

## 11. Phase 6 — 化学一面板采用

### 选题原则

选 **按钮密集、逻辑集中、测试可写** 的一面，例如：

- 分子列表工具条（`.mol-btn` 群），或  
- AI 课壳顶栏操作  

### Task P6.1 替换该面所有主按钮为 createButton

- `className` 桥接 `mol-btn` 等  
- 补 dispose  

### Task P6.2 至少一处 Dialog 确认

与 P4 复用。

### Task P6.3 采用指标

- adoption 测试业务文件数 ≥ 5  
- 化学相关 test 绿  

---

## 12. Phase 7 — 门禁、债务、文档收官

### Task P7.1 抬高 ui-adoption-contract 阈值

| 阶段 | 业务文件 import @xiaohuang/ui 下限（排除 dev/catalog） |
| --- | --- |
| P0 后 | ≥ 1 |
| P3 后 | ≥ 3 |
| P5 后 | ≥ 5 |
| P6 后 | ≥ 8 |

### Task P7.2 指定目录禁止新增危险模式

**范围建议（可配置）：**

- `apps/web/src/math/graph/**`  
- 新文件（git 新增）若匹配 `createElement('button')` + 模板 innerHTML 则失败  

实现可选：

- `test/shared/ui-no-raw-button-contract.test.cjs` 扫 AST/正则，或  
- ESLint 自定义范围（若成本高则先合同测试）  

**允许豁免：** 文件头注释 `// ui-legacy: <reason>` + 登记 `docs/engineering/ui-legacy-allowlist.md`。

### Task P7.3 D4 收口

- 对 math/graph + 已迁移化学面：用户可控字符串不得 innerHTML  
- 更新 `docs/engineering/debt-registry.md` D4 状态  

### Task P7.4 文档收官

- `packages/ui/README.md`：安装、create*、dispose、className 桥接、主题  
- `docs/engineering/ui-library.md`：完整  
- 根 `AGENTS.md` 增加一行指向 `docs/engineering/ui-library.md`（公开仓可发现）  

### Task P7.5 回归

```bash
npm run test -w @xiaohuang/ui
node --test --test-concurrency=1 test/shared/ui-*.cjs test/shared/repo-entry-contract.test.cjs
node --test test/web/math-function-panel-controller.test.cjs
npm run lint:css && npm run lint:theme-tokens
npm run quality:fast
```

---

## 13. 详细 Task 清单（勾选总表）

### P0

- [ ] P0.1 基线文档  
- [ ] P0.2 adoption 合同测试  

### P1

- [ ] P1.1 `_ui-kit.css` + 接入入口  
- [ ] P1.2 组件 class 对齐  
- [ ] P1.3 catalog 验收场  
- [ ] P1.4 主题补丁（按需）  

### P2

- [ ] P2.1 dispose 测试矩阵  
- [ ] P2.2 a11y 基线  
- [ ] P2.3 Stable API v1 文档  
- [ ] P2.4 app-dialog 决策 + 实现  

### P3

- [ ] P3.1 侧栏主按钮全 createButton  
- [ ] P3.2 列表危险操作与确认  
- [ ] P3.3 表单控件统一  
- [ ] P3.4 测试与 adoption ≥3  

### P4

- [ ] P4.1 Dialog 主路径  
- [ ] P4.2 Toast/Status  
- [ ] P4.3 焦点/滚动  

### P5

- [x] P5 选题 5A 或 5B 并实现（5A 工具条）
- [x] 生命周期与测试

### P6

- [ ] P6 化学一面板全按钮库化  
- [ ] Dialog 至少一处  
- [ ] adoption ≥8  

### P7

- [ ] 阈值抬高  
- [ ] 危险模式门禁  
- [ ] D4 更新  
- [ ] README + AGENTS 链接  
- [ ] quality:fast 绿  

---

## 14. 与债务 / 总工程计划映射

| 项 | 关系 |
| --- | --- |
| D4 innerHTML | 本计划 P3–P7 主消化 |
| D3 DOM 捕获 | P3/P5 dispose 强制推广 B5 样板 |
| allowlist B4 web shared | P1 样式与 shared 可交叉 |
| allowlist B5 classroom shell | P6 化学壳 |
| 工程路线图 B6 | 本计划覆盖并扩展为完整 UI 专线 |
| design-tokens | P1 只消费 CSS 变量；不强制改 token 包 API |

---

## 15. 风险与回滚

| 风险 | 缓解 |
| --- | --- |
| 换肤后 ui 按钮突兀 | P1 先做 token 皮肤；Bridge className |
| partial HTML 与 JS 双源 | 逐步删 static button，单一挂载点 |
| dispose 遗漏泄漏 | 合同测试二次 mount；与 classroom dispose 挂钩 |
| 范围膨胀到全站 | 非目标约束；P6 只一面 |
| 与并行 graph 功能冲突 | graph 入口仍 <700；UI 改动在 panel/list 模块 |

回滚：按 Phase revert feature 分支提交；样式可单独回退 `_ui-kit.css`。

---

## 16. 建议排期（单 Agent）

```text
Week 1     P0 + P1
Week 2     P2 + P3 启动
Week 3     P3 完成 + P4
Week 4     P5
Week 5     P6
Week 6     P7 收官与加固
```

双 Agent：P5 / P6 分头前需 P1 样式合并完毕，避免两套 ui 类名。

---

## 17. 任务卡片模板（每个 Task 复制）

```markdown
### Task ID: （如 P3.1）
- 分支：codex/ui-
- 背景：
- 完成定义：
  - [ ]
- 计划改动文件：
- 先写的失败测试：
- 验证命令：
- 风险与回滚：
- 完成后：
  - [ ] 更新本文附录状态日志
  - [ ] 更新 debt-registry（若触及）
  - [ ] 不在本任务中合 main / 推 main
```

---

## 18. 附录 A · 关键路径

```text
packages/ui/
  src/contract.ts
  src/primitives/*
  src/overlays/*
  src/index.ts
  test/*

apps/web/src/
  shared/styles/themes/*/tokens.css
  shared/styles/_forms.css          # 旧 .btn
  shared/styles/_math-classroom.css # 旧 math-fn-btn
  shared/styles/_ui-kit.css         # P1 新建
  math/graph/function-panel.js      # 已有试点
  math/shared/board-tools.js        # P5 候选
  math/shared/board-notes.js        # P5 候选
  dev/catalog/main.js
  subjects/classrooms/partials/math-panels.partial.html

docs/engineering/
  ui-library.md                     # P0/P7
  debt-registry.md
  token-inventory.md

test/shared/ui-adoption-contract.test.cjs  # P0 新建
```

---

## 19. 附录 B · 状态日志（执行者追加）

| 日期 | 变更 | 分支/Commit |
| --- | --- | --- |
| 2026-08-08 | 计划 v1.0 创建 | 文档 |
| 2026-08-08 | P5 完成（5A 工具条：board-tools.js 按钮 → createButton bridge，dispose 对齐） | `codex/ui-p5a` @ bc2639f |
| | P0 完成 | |
| | P1 完成 | |
| | … | |

---

## 20. 附录 C · 给执行 Agent 的验收口令

当负责人问「UI 库做完了吗？」仅当下列全部为真可答「Phase 全完成」：

1. `docs/engineering/ui-library.md` 存在且含 Stable API v1  
2. `_ui-kit.css` 已接入且 lint:theme-tokens / lint:css 通过  
3. 业务侧 `@xiaohuang/ui` import 文件数 ≥ 8（除 catalog）  
4. 数学函数侧栏主按钮无裸 createElement('button') 业务路径  
5. Dialog 主确认路径已库化或官方 adapter  
6. P5、P6 各至少一条线完成  
7. `ui-adoption-contract` 阈值已抬到终态  
8. D4 在 debt-registry 有进展记录  
9. `npm run test -w @xiaohuang/ui` 与 `npm run quality:fast` 通过  

---

**文档结束。**  
执行从 **Phase 0** 开始，严格按 Task 卡片推进；**不要在本计划流程中合 main。**
