# 覆盖率基线（分层）

> Program 7 Task 7.2 / R7.2 产物。基线 2026-08-08（vitest coverage-v8）。
> 分层阈值：contracts/domain-core 高分支；test-kit/subject-settings 逐步提升。
> 已达标目录不得回退（CI 检查由 R7.2 后续接入）。

| 层                           | 文件                                         | % Stmts | % Branch | % Funcs | % Lines | 阈值                                |
| ---------------------------- | -------------------------------------------- | ------- | -------- | ------- | ------- | ----------------------------------- |
| contracts（schema）          | persistence/api/subject/ipc/settings         | 100     | 100      | 100     | 100     | branch ≥ 90（已达标）               |
| domain-core（领域核心）      | result/errors/ids/serialization/cancellation | 95.5    | 94.9     | 91.3    | 96.7    | branch ≥ 90（已达标）               |
| math-expr（表达式白名单）    | index                                        | 84.6    | 59.2     | 81.3    | 88.7    | stmts ≥ 80（已达标）                |
| test-kit（fakes）            | fake-*                                       | 69.2    | 31.8     | 62.1    | 68.1    | stmts ≥ 65（已达标）；branch 待提升 |
| subject-settings（学科设置） | index/tab-catalog                            | 53.7    | 35.4     | 36.2    | 57.9    | stmts ≥ 50（已达标）；待提升        |

## 后续提升项

- test-kit branch 31.8%：补 fake-fetch 错误路径、fake-dom 边界（R7 后续）。
- subject-settings：补 normalize 拒绝路径与 electronOrder 分支（R7 后续）。
- server domain/service 迁移 TS 后纳入分层（R8 完成时更新本表）。

## 使用

```bash
npm run coverage          # 根入口（turbo 聚合各包 vitest coverage）
```
