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
