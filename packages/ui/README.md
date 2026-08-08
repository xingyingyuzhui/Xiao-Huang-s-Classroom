# @xiaohuang/ui

小黄的教室 · typed DOM 组件库（UiController 合同：`element` / `update` / `on` / `dispose`）。
框架无关，业务消费方（apps/web 各 feature）用真实 `document`，测试用 `@xiaohuang/test-kit` fake DOM。

## 安装

```bash
npm install @xiaohuang/ui        # 从仓库根执行（monorepo，勿维护嵌套 lockfile）
```

组件工厂全部从包入口具名导出（无裸 `export *`）：

```ts
import { createButton, createDialog, createToast } from '@xiaohuang/ui';
```

## 快速上手（含 dispose）

```ts
import { createButton } from '@xiaohuang/ui';

const btn = createButton({ label: '添加函数', kind: 'primary', onClick: addFn });
panel.append(btn.element);

// 换肤 / 状态更新
btn.update({ disabled: loading });

// 组件销毁（换 tab / 卸载面板时必须调用；幂等，可重复调用）
btn.dispose();
```

- `on(event, handler)` 返回退订函数（handler 层面的退订）。
- `dispose()` 负责解绑元素/DOM 级监听器并移除节点；**消费方必须在面板 teardown 时调用**，否则事件泄漏。
- 所有文本输出走 `textContent`（`contract.ts` 的 `setText`）——组件内部禁止不可信 `innerHTML`。

## 采用指南（何时用库 / 迁移期守则）

### 何时用库

- 新 UI 一律默认用 `@xiaohuang/ui` 的 `create*` 工厂（`createButton` / `createInput` /
  `createNumberInput` / `createSelect` / `createDialog` / `createToast` / `createToolGroup`
  / `createReadoutCard` 等）；**禁止**新写 HTML partial 拼按钮、裸 `createElement('button')`
  或模板 `innerHTML` 渲染可点击控件。
- 门禁：`test/shared/ui-no-raw-button-contract.test.cjs` 扫描 `apps/web/src/math/graph/**`，
  命中裸按钮拼 UI 即失败；豁免必须登记 `docs/engineering/ui-legacy-allowlist.md`（只消化存量，
  新增代码不适用豁免）。
- 组件内部一律 `textContent`（`contract.ts` 的 `setText`），不可信字符串不得进 `innerHTML`。
- 真实采用范例：`apps/web/src/math/graph/function-panel.js`（P3 试点）与
  `apps/web/src/math/shared/board-tools.js`（P5 工具条，bridge + dispose 完整样板）。

### 如何 dispose

- 工厂返回 `UiController`（`element` / `update` / `on` / `dispose`）；`dispose()` **幂等**，
  重复调用无副作用。
- 消费方必须在 classroom dispose / panel teardown / 换 tab 时调用，与 **B5 DOM 捕获样板**
  一致（实例内 DOM 绑定登记，dispose 时清除标记，允许二次 mount 重建绑定）。
- 多组件按**逆序、容错、幂等**释放：参考 `board-tools.js` 的 `dispose()`（逐项
  `try/catch` 收集错误，最后移除容器）。

### className 桥接（迁移期）

- Bridge 模式：`createButton({ className: 'math-fn-btn' })` —— 组件自带 `ui-btn` 基类，
  同时保留旧业务类，迁移期视觉零回归（详见下方「className 桥接」节）。
- 阶段策略：**Bridge**（挂旧类保外观）→ **Prefer**（新 UI 默认用库）→ **Enforce**
  （门禁锁定）；最终以 `ui-*` + token 为主，业务 CSS 逐步变薄。

### 主题

- 组件只声明 `ui-*` 结构类与 `is-*` 状态类，**不写死颜色**；视觉一律走 CSS 变量
  （`var(--stamp)` / `var(--paper)` 等，详见下方「主题」节）。
- `apps/web/src/shared/styles/_ui-kit.css` 提供 `ui-*` 皮肤并映射主题 token；
  **五主题**（`apps/web/src/shared/styles/themes/*/tokens.css`）自动适配，无需组件侧改代码。

### 安装

- 只从仓库根执行 `npm install`（monorepo，勿维护嵌套 lockfile），详见上方「安装」节。
- `import { createButton, createDialog, createToast } from '@xiaohuang/ui';`
- 完整工厂与 props 见 **Stable API v1** 表。

## Stable API v1

以下为冻结的 v1 合同（2026-08-08 P2 硬化）。破坏性变更必须升版本并在此文档登记。
通用 props（`BaseProps`）：`label?`、`disabled?`、`loading?`、`error?`、`'aria-label'?`。
通用语义：`update(next)` 局部合并 props 并重渲染；`dispose()` **幂等**；`on()` 事件注册。

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
- Dialog：`role="dialog"` + `aria-modal="true"`；title 渲染进 `h2.ui-dialog-title` 并经 `aria-labelledby` 关联；
  Esc 关闭；`opener` 关闭时焦点归还。
- Input/Select/Checkbox/Slider/NumberInput：支持 `aria-label` 透传（update 可更新）。
- Toast：默认 `role="status"`；`kind="error"` 时 `role="alert"`。

## className 桥接（迁移期）

```ts
createButton({ label: '重置', className: 'math-fn-btn' }); // ui-btn + math-fn-btn 并存
```

迁移期允许挂既有业务类保外观，最终以 `ui-*` + 主题 token（CSS 变量）为主。

## 主题

组件只声明 `ui-*` 结构类与 `is-*` 状态类，**不写死颜色**；视觉由
`apps/web/src/shared/styles/_ui-kit.css`（映射主题 token）与各主题 `tokens.css` 提供。

## 测试

```bash
npm run test -w @xiaohuang/ui
npm run typecheck -w @xiaohuang/ui
npm run build -w @xiaohuang/ui
```

测试用 `@xiaohuang/test-kit` 的 `createFakeDocument`（node 环境，无浏览器）；
每个工厂都有 dispose/泄漏与 a11y 断言（见 `test/contract-hardening.test.ts`）。
