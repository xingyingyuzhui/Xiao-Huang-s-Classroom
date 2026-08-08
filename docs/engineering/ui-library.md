# UI 库采用（@xiaohuang/ui）· 工程文档

> 对应执行计划：`docs/superpowers/plans/2026-08-08-ui-library-adoption-plan.md`。
> 本文档与 `packages/ui/README.md` 互为补充：README 面向库使用者（API 细节），本文面向工程决策（何时用库、如何推进、禁止事项、ADR）。

## 现状（P0.1 基线，2026-08-08）

- `packages/ui` 为 TS 组件库（tsup 双产物 + d.ts），UiController 合同：
  `element` / `update` / `on` / `dispose`；显式具名导出，无裸 `export *`。
- 组件分层：primitives（button/icon/checkbox/input/select/slider）、overlays（dialog/toast/tooltip）、
  layout（tabs/stack）、feedback（status/progress）、domain-ui（number-input/tool-group）、
  classroom-ui（readout-card）。
- 业务采用（排除 `dev/catalog`）：**1 个文件**——`apps/web/src/math/graph/function-panel.js`
  （`createButton` 试点）。`dev/catalog/main.js` 为组件展览页（非产品路径）。
- 高风险 `innerHTML` 热点目录：`math/shared/*`（board-notes、board-tools、num-keypad、
  object-style-panel、axis-legend-settings、board-compass 等）、`math/sequence`、`math/plane`、
  `chemistry/molecule/list`、`chemistry/molecule/reactions`、`chemistry/ai-classroom/entry`、
  `chemistry/electron/list` —— 由 debt-registry D4 跟踪，计划 P3–P7 逐步消化。
- 全局对话框仍为 `apps/web/src/shared/ui/app-dialog.js`（HTML partial 时代产物），
  已通过 Adapter 接入 `createDialog`（见「app-dialog 决策」小节）。

## 架构

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
    shared/styles/_ui-kit.css  ← ui-* 映射到 token（P1 新建）
    feature CSS            ← 逐步变薄，只留布局特例
```

- 运行时无框架；typed DOM controller 路线（不引入 React/Vue）。
- 测试：`packages/ui/test/*.test.ts`（vitest，node 环境 + test-kit fake DOM）。

## 采用表（业务消费 @xiaohuang/ui，排除 dev/catalog）

| 消费方                         | 使用情况                                                                | 阶段          |
| ------------------------------ | ----------------------------------------------------------------------- | ------------- |
| `math/graph/function-panel.js` | `createButton` 试点（添加函数按钮）                                     | P0 基线（≥1） |
| `dev/catalog/main.js`          | 组件展览页（非产品路径，不计入指标）                                    | —             |
| `shared/ui/app-dialog.js`      | Adapter：内部 `createDialog`，对外 `appAlert/appConfirm/appPrompt` 不变 | P2.4          |

## 禁止事项

1. **禁止组件内部对不可信字符串 `innerHTML`**——一律 `textContent`（`contract.ts` `setText`）。
2. **禁止裸 `export *`**——显式具名导出（`packages/ui/src/index.ts` 为准）。
3. **禁止硬编码颜色**——主题色只走 CSS 变量（`var(--stamp)` 等）；与 `lint:theme-tokens` 精神一致。
4. **禁止跳过 dispose**——可挂载模块/面板 teardown 必须调用 `dispose()`（幂等）。
5. **禁止破坏 UiController 合同**（element/update/on/dispose 四个能力）。
6. **禁止在库外复制白名单式组件实现**——新 UI 优先用库；迁移期可用 `className` 桥接旧类。

## Stable API v1

冻结时间：2026-08-08（计划 Phase 2）。后续破坏性变更必须升包版本并回写此处登记。

通用 props（`BaseProps`）：`label?`、`disabled?`、`loading?`、`error?`、`'aria-label'?`。
通用语义：`update(next)` 局部合并 props 并重渲染；`on(event, handler)` 返回退订函数；
`dispose()` **幂等**（可重复调用安全，必须解绑 DOM/文档级监听器）。

| 工厂                | 主要 props                                                          | events             | dispose 语义                                   |
| ------------------- | ------------------------------------------------------------------- | ------------------ | ---------------------------------------------- |
| `createButton`      | label, kind(`primary                                                | secondary          | ghost                                          | danger`), size(`sm | md                       | lg`), disabled, loading, className, title, `aria-label`, onClick | `click` | 解绑 click + `element.remove()`；幂等 |
| `createIcon`        | name, size, `aria-label`                                            | —                  | `element.remove()`；幂等                       |
| `createCheckbox`    | checked, disabled, label, `aria-label`, onChange                    | `change`           | 解绑 change + remove；幂等                     |
| `createInput`       | value, placeholder, disabled, `aria-label`, onChange                | `change`           | 解绑 input + remove；幂等                      |
| `createSelect`      | options(`{value,label}[]`), value, disabled, `aria-label`, onChange | `change`           | 解绑 change + remove；幂等                     |
| `createSlider`      | value, min, max, step, disabled, `aria-label`, onChange             | `change`           | 解绑 input + remove；幂等                      |
| `createNumberInput` | value, min, max, step, disabled, `aria-label`, onChange, onCommit   | `change`, `commit` | 解绑 input+keydown + remove；幂等              |
| `createDialog`      | title, open, opener, onClose                                        | `close`            | 解绑 document keydown + remove；幂等           |
| `createToast`       | message, kind(`info                                                 | success            | error`), durationMs, onDismiss                 | `dismiss`          | 清 timer + remove；幂等  |
| `createTooltip`     | text, visible                                                       | —                  | `element.remove()`；幂等                       |
| `createTabs`        | tabs(`{id,label}[]`), activeId, onChange                            | `change`           | 解绑子按钮 click + 自身 keydown + remove；幂等 |
| `createToolGroup`   | tools(`{id,label,tip}[]`), activeId, onChange                       | `change`           | 解绑子按钮 click + remove；幂等                |
| `createStack`       | direction(`row                                                      | column`), gap(`sm  | md                                             | lg`), children     | —                        | `element.remove()`；幂等                                         |
| `createStatus`      | kind(`loading                                                       | empty              | error`), message, disabled, loading            | —                  | `element.remove()`；幂等 |
| `createProgress`    | value, max                                                          | —                  | `element.remove()`；幂等                       |
| `createReadoutCard` | title, rows(`{key,value}[]`), emptyText                             | —                  | `element.remove()`；幂等                       |

### a11y 基线（P2.2 硬化）

- Button：`type="button"`；`disabled` → `aria-disabled="true"`；`loading` → `aria-busy="true"`。
- Dialog：`role="dialog"` + `aria-modal="true"`；title 渲染进 `h2.ui-dialog-title` 并经
  `aria-labelledby` 关联；Esc 关闭；`opener` 关闭时焦点归还。
- Input/Select/Checkbox/Slider/NumberInput：支持 `aria-label` 透传。
- Toast：默认 `role="status"`；`kind="error"` 时 `role="alert"`。

## app-dialog 决策：Adapter（P2.4）

**决策：选方案 A（Adapter）**——`apps/web/src/shared/ui/app-dialog.js` 内部改调
`@xiaohuang/ui` 的 `createDialog`，对外 `appAlert` / `appConfirm` / `appPrompt`
签名与既有行为保持不变，现有调用方零改动（数学/化学 15+ 调用点）。

**实现要点：**

- `createDialog` 提供壳层：`role=dialog` + `aria-modal`、Esc 关闭、opener 焦点归还、
  `dispose()` 生命周期；标题/正文/按钮/输入区为组合内容，DOM 结构与
  `_app-dialog.css` 既有类（`.app-dialog-root`、`.modal-panel`、`.modal-head` 等）一致，视觉零回归。
- 每次弹窗新建实例（`dialogSeq` 唯一 id），关闭动画（0.2s）结束后 `setTimeout(() => dialog.dispose(), 220)`
  销毁；队列（queue/busy）机制保留，保证同一时刻仅一个弹窗。
- Esc → 库内 `requestClose` → `onClose` → cancel 分支；Enter → adapter 自管 capture keydown（同原实现）。
- 新增 a11y 增益：关闭后焦点归还 opener（原实现未归还）。

**能力差距与适配：**

| createDialog 能力                     | app-dialog 需求                 | 适配方式                                                    |
| ------------------------------------- | ------------------------------- | ----------------------------------------------------------- |
| title 渲染进自身 `h2.ui-dialog-title` | 面板内 `.modal-head` 结构标题   | 不传 title，面板自建 h2，`aria-labelledby` 手动关联可见标题 |
| 无按钮区                              | alert/confirm/prompt 三模式按钮 | 组合内容自建 `.btn primary/ghost` + `is-danger`             |
| 无输入区                              | prompt 输入                     | 组合内容自建 label+input，Enter 提交                        |
| 无内容区                              | 消息换行 `<br>`                 | 组合内容自建 `.app-dialog-message`（先转义再 `<br>`）       |

**残留差异（已知）：** 每次弹窗新建/销毁节点（原实现复用单 root）；关闭动画期间
（220ms 内）重复 Esc/点击由 `settled` 守卫吸收；库的 Esc 为 bubble 阶段、Enter 为
capture 阶段（原实现两者均 capture）——行为等价，边界场景可接受。
