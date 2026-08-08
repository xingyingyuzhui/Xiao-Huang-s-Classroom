# UI 库（@xiaohuang/ui）采用状态与架构

> 本文件是 UI 库采用线的「仪表盘」：基线现状、目标架构、采用进度表与禁止事项。
> 由 `docs/superpowers/plans/2026-08-08-ui-library-adoption-plan.md` Phase 0 建立（2026-08-08），
> 后续 Phase（P1–P7）持续更新；采用计数由 `test/shared/ui-adoption-contract.test.cjs` 锁定。

## 1. 现状（2026-08-08 基线）

### 1.1 业务采用面

`rg -n "from '@xiaohuang/ui'" apps/web/src` 命中 2 个文件：

| 文件                                        | 导入           | 角色                                   |
| ------------------------------------------- | -------------- | -------------------------------------- |
| `apps/web/src/math/graph/function-panel.js` | `createButton` | 业务试点（计入采用数）                 |
| `apps/web/src/dev/catalog/main.js`          | 组件全集       | dev 组件展览页（**不计入**业务采用数） |

业务采用文件数（排除 dev/catalog）：**1**。

**试点描述：** `function-panel.js` 的 `createUiAddFnButton()` 用
`createButton({ label, title, className: 'math-fn-btn math-fn-btn-add', onClick })`
渲染「添加函数」按钮，`className` 桥接既有 `math-fn-btn` 样式类，并把「＋」塞进
`strong.math-fn-add-plus` 子节点——即计划 §3.3 的 **Bridge** 模式样例。

### 1.2 高风险 innerHTML 热点目录

`rg -l "innerHTML" apps/web/src` 共 **39** 个文件。抽样目录统计：

| 目录                                | 文件数 | 代表文件                                                                                                                                                |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/math/shared/`         | 6      | `board-notes.js`、`board-tools.js`、`num-keypad.js`、`object-style-panel.js`、`axis-legend-settings.js`、`board-compass.js`                             |
| `apps/web/src/subjects/classrooms/` | 1      | `panel-mount.js`                                                                                                                                        |
| `apps/web/src/chemistry/`           | 19     | `electron/list.js`、`molecule/list.js`、`molecule/reactions.js`、`ai-classroom/entry.js`、`ai-classroom/mastery-map.js`、`ai-classroom/quiz-shell.js` … |

以上是债务 D4（见 `docs/engineering/debt-registry.md`）的主要消化对象，由计划 P3–P7 分批清理；本文件随 Phase 更新数字。

### 1.3 缺口

- 产品 UI 仍为 HTML partial（如 `apps/web/src/subjects/classrooms/partials/math-panels.partial.html`）+ 手写 DOM / `innerHTML`。
- 样式类散落各处：`_forms.css` 的 `.btn`、`_math-classroom.css` 的 `.math-fn-btn`、`_molecule.css` / `_electron.css` 的 `.mol-btn` 等，未统一到 ui 层。
- 全局对话框多为 app 层 `appAlert` / `appConfirm`（`apps/web/src/shared/ui/app-dialog.js`），未统一到 `createDialog`（P2.4 决策）。

## 2. 目标架构

计划 §3.1 的运行时关系：

```text
apps/web feature（function-panel / shell / …）
    │  import { createButton, createDialog, … } from '@xiaohuang/ui'
    │  controller.dispose() on classroom dispose / panel teardown
    ▼
packages/ui  (TS, UiController：element/update/on/dispose)
    │  class: ui-* + 可选 className 桥接旧类
    │  颜色/圆角: var(--token)
    ▼
apps/web 全局样式
    themes/*/tokens.css   ← 语义色权威
    shared/styles/_ui-kit.css  ← P1 新增：ui-* 映射到 token
    feature CSS            ← 逐步变薄，只留布局特例
```

迁移三阶段（§3.3）：**Bridge**（className 挂旧类保外观）→ **Prefer**（新 UI 默认用库）→
**Enforce**（合同测试 / lint 对指定目录禁止新增裸按钮模板）。

## 3. 采用表（后续 Phase 更新）

| 文件                                                                 | 状态            | 备注                                 |
| -------------------------------------------------------------------- | --------------- | ------------------------------------ |
| `apps/web/src/math/graph/function-panel.js`                          | 试点（P0 基线） | `createButton` 添加函数按钮；P3 全量 |
| `apps/web/src/dev/catalog/main.js`                                   | dev 展览        | 不计入业务数                         |
| `apps/web/src/math/graph/function-list-view.js`                      | 未采用          | P3 目标                              |
| `apps/web/src/math/graph/function-editor.js`                         | 未采用          | P3 目标                              |
| `apps/web/src/subjects/classrooms/partials/math-panels.partial.html` | 未采用          | 静态 button，P3 逐步移除             |
| `apps/web/src/math/shared/board-tools.js`                            | 未采用          | P5 候选（5A 工具条）                 |
| `apps/web/src/math/shared/board-notes.js`                            | 未采用          | P5 候选（5B 笔记条）                 |
| `apps/web/src/chemistry/molecule/list.js`                            | 未采用          | P6 候选（`.mol-btn` 群）             |
| `apps/web/src/shared/ui/app-dialog.js`                               | 未采用          | P2.4 决策（Adapter 优先）            |

## 4. 禁止事项

- **禁止不可信 innerHTML**：用户 / 外部输入字符串不得进 `innerHTML`；组件与迁移代码一律 `textContent` / 受控 DOM（对齐 `packages/ui/src/contract.ts` 的 `setText`）。
- **禁止硬编码色值**：组件与样式只消费 CSS 变量（`var(--stamp)` 等），不写死 hex；与 `lint:theme-tokens` 一致。
- **禁止不 dispose**：UiController 消费方必须在 classroom dispose / panel teardown 时调用 `dispose()`；dispose 逆序、容错、幂等。

## 5. 相关链接

- 计划：`docs/superpowers/plans/2026-08-08-ui-library-adoption-plan.md`
- 采用计数合同：`test/shared/ui-adoption-contract.test.cjs`
- 债务：D4（innerHTML）见 `docs/engineering/debt-registry.md`
