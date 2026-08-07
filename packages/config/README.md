# @xiaohuang/config

工程配置共享包：tsup 构建基座、ESLint 片段、统一应用版本。

- `@xiaohuang/config/tsup` — 共享 tsup 配置（ESM+CJS+d.ts，target es2022）
- `@xiaohuang/config/eslint` — 共享 TS ESLint 规则片段
- `APP_VERSION` / `MIN_NODE_MAJOR` — 版本与 Node 基线常量

构建：`npm run build -w @xiaohuang/config`（tsup 双产物）。
