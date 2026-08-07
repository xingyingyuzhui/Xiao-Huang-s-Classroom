# ADR-0002：共享包边界与单向依赖

- **日期：** 2026-08-07
- **状态：** 已接受（Program 2-4）

## 决策

- `packages/`：config（工具链）、domain-core（Result/AppError/ID/Clock/cancellation）、
  contracts（Zod schema：API/IPC/persistence/subject/settings）、test-kit（fakes）、
  design-tokens（语义令牌）、ui（typed DOM 组件）、subject-kit（manifest/loader）、
  math-expr、subject-settings。
- 单向依赖：`apps → packages`；禁止 `packages/*` 反向导入 `apps/*`；Server 不导入 Web。
- 运行时 Schema 统一走 contracts（Zod）；禁止 Web/Server 双份接口类型。
- UI 不引入 React：typed DOM factory/controller（`UiController<Props, Events>`）。

## 理由

- 领域核心不依赖 DOM/Express/Electron/Three/JSXGraph（spec §4.1）。
- 组件层 fake-DOM 可测（test-kit 提供鸭子类型 fake）。

## 后果

- `lint:arch` 脚本化扫描依赖方向（check-dependencies.mjs），新增违规即失败。
- 新学科通过 subject-kit manifest 接入，不复制课堂壳。
