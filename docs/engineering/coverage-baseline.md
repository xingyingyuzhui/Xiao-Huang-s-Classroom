# 覆盖率基线（分层，9 包）

> R5/R二轮产物。基线 2026-08-08（vitest coverage-v8，只统计 `src/**`）。
> 阈值写入各包 `vitest.config.ts` 并由 `npm run coverage`（turbo）强制：
> 低于阈值 exit 1（不可达阈值失败测试证明）。coverage 已接入 quality/CI。

## 9 包真实覆盖率与强制阈值（2026-08-08 实测）

| 包 | Stmts | Branch | Funcs | Lines | 强制阈值（vitest） |
|---|---|---|---|---|---|
| config | 100 | 100 | 100 | 100 | stmts≥80、branches≥80、funcs≥80、lines≥80 |
| domain-core | 94.1 | 94.9 | 87.5 | 95.1 | stmts≥90、branches≥90 |
| contracts | 95.2 | 100 | 100 | 95.2 | stmts≥95、branches≥90 |
| test-kit | 69.2 | 31.8 | 62.1 | 68.1 | stmts≥65（branches/funcs/lines 为观察指标） |
| design-tokens | 100 | 100 | 100 | 100 | stmts≥95、branches≥95 |
| ui | 81.0 | 46.2 | 66.9 | 86.8 | stmts≥75（branches 为观察指标） |
| subject-kit | 100 | 88.9 | 100 | 100 | stmts≥95、branches≥85 |
| math-expr | 91.1 | 77.8 | 100 | 94.1 | stmts≥80（branches 为观察指标） |
| subject-settings | 64.9 | 54.4 | 46.7 | 71.2 | stmts≥50（其余观察指标） |

## 口径

- coverage 只统计 `src/**`；排除 `dist/**`、`coverage/**`、`test/**`、`**/*.config.*`。
- 双产物一致性测试（require dist）不污染源码覆盖率分母。
- **强制指标**：仅 vitest.config.ts `thresholds` 中列出的指标（上表末列）。
- **观察指标**：未设阈值的指标仅记录，不强制（不会导致失败）。

## 后续提升项（观察指标 → 强制）

- test-kit branch 31.8%：补 fake-fetch 错误路径、fake-dom 边界。
- subject-settings branch 54.4% / funcs 46.7%：补 normalize 拒绝路径与 electronOrder 分支。
- ui branch 46.2%：补组件 error/disabled 分支。

## 使用

```bash
npm run coverage          # turbo 聚合 9 包 coverage，阈值强制
```
