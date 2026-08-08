# UI 遗留豁免登记（ui-legacy allowlist）

> 由 `test/shared/ui-no-raw-button-contract.test.cjs`（UI 采用计划 P7.2 前置部分）锁定。
> 门禁规则：`apps/web/src/math/graph/**` 下 .js/.ts 命中「裸按钮拼 UI」模式
> （`createElement('button')`，或模板字符串 innerHTML 中的 `<button>` 标记）即失败，
> **除非**本表已登记。豁免只消化存量，新文件/新命中不适用豁免——新增裸按钮代码直接失败。
> 登记项应在对应迁移完成后移除（门禁测试会提示「已登记但不再命中」的过期行）。
> 迁移期间（P3 并行改造 math/graph 生产文件）豁免以本表登记为准；文件头
> `// ui-legacy: <reason>` 注释由迁移任务一并补齐，本表同时是注释原因的权威记录。

| 文件                                        | 原因                          | 移除条件                                                                    |
| ------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| `apps/web/src/math/graph/function-panel.js` | P3 并行迁移中，完成后移除登记 | 预设 chips 迁移到 `@xiaohuang/ui` 组件或 DOM API/textContent 输出后移除本行 |
