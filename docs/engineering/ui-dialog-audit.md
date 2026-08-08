# UI 弹窗 / 确认路径审计（U1，2026-08-08）

> 依据：`docs/superpowers/plans/2026-08-08-handoff-stabilize-d7-ui-polish.md` §6.2（Track U1）。
> 结论：**`window.confirm / alert / prompt` 在 `apps/web/src` 为 0 残留**（仅一处注释提及）。
> 所有业务确认/提示/输入框一律走 `app-dialog.js` 的 `appConfirm / appAlert / appPrompt`
> （底层已 Adapter 到 `@xiaohuang/ui` 的 `createDialog`，见 `ui-library.md`「app-dialog 决策」）。

## 审计命令与范围

```bash
rg -n "window\.confirm|window\.alert|window\.prompt" apps/web/src --glob '*.{js,ts}'
rg -n "appConfirm|appAlert|appPrompt" apps/web/src --glob '*.{js,ts}'
rg -n "\b(confirm|alert|prompt)\s*\(" apps/web/src --glob '*.{js,ts}'   # 兜底：裸调用
```

范围：`apps/web/src`（生产面；`apps/web/src/dev/catalog` 为 dev 工具，单独登记豁免）。

## 结论

- `window.confirm / alert / prompt`：**0 处**（唯一命中是 `app-dialog.js` 头部注释「替代 window.alert / confirm / prompt」的文档文字，非调用）。
- 裸 `confirm( / alert( / prompt(`：**0 处**（`graph-persistence.js` 的 `confirm` / `alert` 是上下文依赖注入的形参名，装配点在 `graph-mount-controller.js` 注入 `appConfirm / appAlert`，非 `window.*`）。
- 危险操作（删除 / 重置 / 交卷 / 放弃 / 恢复内置等）确认**全部已统一**走 `appConfirm`。
- **完成定义达成**：残留为 0，无「待改」项。

## 审计表

### A. `window.confirm / alert / prompt`（生产面）

| 文件                                   | API                               | 场景                                               | 是否危险   | 状态                     |
| -------------------------------------- | --------------------------------- | -------------------------------------------------- | ---------- | ------------------------ |
| `apps/web/src/shared/ui/app-dialog.js` | `window.alert / confirm / prompt` | 文件头注释「替代 window.alert / confirm / prompt」 | 否（注释） | 豁免（文档文字，非调用） |

### B. `appConfirm / appAlert / appPrompt` 使用面（已统一）

| 文件                                      | API                             | 场景                                                                                    | 是否危险        | 状态                                                                            |
| ----------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------- |
| `math/graph/function-panel.js`            | `appConfirm` / `appAlert`       | 删除函数；「至少保留一条函数」拦截                                                      | 是（删除）      | 已统一                                                                          |
| `math/graph/graph-tool-controller.js`     | `appConfirm` / `appAlert`       | 相交点/跟随曲线确认；交点不存在提示                                                     | 是              | 已统一（context 注入）                                                          |
| `math/graph/graph-persistence.js`         | `confirm` / `alert`（注入形参） | 重置画布确认；导入失败提示                                                              | 是（重置）      | 已统一（`graph-mount-controller.js` 装配 `appConfirm/appAlert`，非 `window.*`） |
| `math/graph/graph-mount-controller.js`    | `appConfirm` / `appAlert`       | 装配给 persistence/tool controller                                                      | 否              | 已统一                                                                          |
| `math/graph/index.js`                     | `appConfirm` / `appAlert`       | 装配进 graph context                                                                    | 否              | 已统一                                                                          |
| `chemistry/molecule/list.js`              | `appConfirm` / `appAlert`       | 删除分子卡片；删除失败提示                                                              | 是（删除）      | 已统一                                                                          |
| `chemistry/molecule/reactions.js`         | `appConfirm` / `appAlert`       | 删除 AI 反应；导出/导入结果与失败提示                                                   | 是（删除）      | 已统一                                                                          |
| `chemistry/battle/ui.js`                  | `appConfirm`                    | 重开本局（进度丢失确认）                                                                | 是              | 已统一                                                                          |
| `chemistry/ai-classroom/entry.js`         | `appAlert` / `appConfirm`       | 装配进 AI 课壳 context                                                                  | 否              | 已统一                                                                          |
| `chemistry/ai-classroom/rollcall.js`      | `appPrompt` / `appConfirm`      | 修改姓名；删除同学；清空名单导入                                                        | 是（删除/清空） | 已统一                                                                          |
| `chemistry/ai-classroom/lab-shell.js`     | `appConfirm` / `appAlert`       | 放弃未保存脚本；删除实验；丢弃实验；删除步骤；恢复内置；恢复全部内置；各类失败/结果提示 | 是              | 已统一                                                                          |
| `chemistry/ai-classroom/quiz-shell.js`    | `appConfirm` / `appAlert`       | 交卷；放弃练习重新出题；导出/生成提示                                                   | 是（交卷）      | 已统一                                                                          |
| `chemistry/ai-classroom/wrong-book.js`    | `appAlert`                      | 提交失败提示                                                                            | 否              | 已统一                                                                          |
| `chemistry/ai-classroom/offline-quiz.js`  | `appAlert` / `appConfirm`       | 提交失败提示；放弃未交卷练习                                                            | 是              | 已统一                                                                          |
| `chemistry/ai-classroom/lesson-packs.js`  | `appConfirm` / `appAlert`       | 删除备课包（不可撤销）；保存/导入导出结果与失败                                         | 是（删除）      | 已统一                                                                          |
| `chemistry/ai-classroom/balance-shell.js` | `appConfirm` / `appAlert`       | 恢复内置脚本；空内容/保存失败提示                                                       | 是              | 已统一                                                                          |

### C. dev 工具（豁免登记）

| 文件                               | API                      | 场景                   | 是否危险 | 状态                                                     |
| ---------------------------------- | ------------------------ | ---------------------- | -------- | -------------------------------------------------------- |
| `apps/web/src/dev/catalog/main.js` | `createDialog`（库 API） | 组件展览页 Dialog 演示 | 否       | 豁免（dev 工具，非产品路径；使用库 API 而非 `window.*`） |

## 复核的热点清单（计划 §6.2 指定）

| 热点            | 文件                                                 | 结论                 |
| --------------- | ---------------------------------------------------- | -------------------- |
| 删除函数        | `math/graph/function-panel.js:188`                   | `appConfirm`，已统一 |
| 跟随/相交确认   | `math/graph/graph-tool-controller.js:336,353`        | `appConfirm`，已统一 |
| 分子删除        | `chemistry/molecule/list.js:185`、`reactions.js:261` | `appConfirm`，已统一 |
| 重开本局        | `chemistry/battle/ui.js:469`                         | `appConfirm`，已统一 |
| 交卷            | `chemistry/ai-classroom/quiz-shell.js:397`           | `appConfirm`，已统一 |
| 删实验/恢复内置 | `chemistry/ai-classroom/lab-shell.js:451,792,883`    | `appConfirm`，已统一 |
| 备课包删除      | `chemistry/ai-classroom/lesson-packs.js:230`         | `appConfirm`，已统一 |

## 附注（U2 联动）

本次审计同批完成了 U2 焦点/滚动合同加固（`app-dialog.js` 打开聚焦、关闭归还 opener、
Enter 不误触确定、队列链式 opener），详见 `test/web/app-dialog-scroll-lock.test.cjs`
（10 条：5 条滚动锁 + 5 条焦点合同）。
