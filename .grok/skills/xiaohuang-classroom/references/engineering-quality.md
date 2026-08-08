# Engineering quality and evidence

用于选择测试与证据层级。命令以当前根 `package.json` 和 `turbo.json` 为准。

## Workspace 任务

根 workspaces 包含 `apps/web`、`apps/server`、`apps/desktop`、`packages/config`、`packages/contracts`、`packages/design-tokens`、`packages/domain-core`、`packages/math-expr`、`packages/subject-kit`、`packages/subject-settings`、`packages/test-kit`、`packages/ui`。

- `npm test`：Turbo workspace test，再运行 `test/shared/*.cjs`。
- `npm run build`：Turbo build，尊重 package 依赖图。
- `npm run typecheck`：workspace typecheck；应用层仍在迁移，成功不等于全部旧 JS 已类型检查。
- `npm run coverage`：当前 package coverage 阈值；不能外推为 apps 全覆盖。

## 根质量门禁

`npm run quality` 依次覆盖 format、lint、CSS、`npm run lint:baseline`、typecheck、架构、主题、资源、test、build、bundle budget、coverage 和 diff whitespace。

重要边界：

- `lint` 面向新代码范围；`npm run lint:baseline` 保证全仓存量基线不增长。
- `git diff --check` 不证明工作树干净。
- `budget` 依赖真实 Web build 输出。
- coverage 只对配置纳入的 source 生效，先看各 package 的 `vitest.config.ts`。
- `npm run quality` 通过证明当前工作区门禁通过，不证明干净检出、无 cache fresh run 或最终发行物可用。

## 选择验证层级

1. 先运行目标 owner 的最小测试。
2. 跨 package/边界修改运行相关 workspace build/typecheck/test。
3. 合入前运行 `npm run quality`。
4. 对 cache、干净环境或生成残留敏感的改动，使用 `npx turbo run build test typecheck coverage --force`，或在临时干净检出中验证。
5. 视觉行为需要浏览器；用户明确排除时使用 `@xiaohuang/test-kit` 的 fake DOM/storage/clock/timer/RAF/fetch，并限定结论。

## 测试归属

- Web/shell/Hub/math/chem：`test/web/`
- Server/API/DB：`test/server/`
- package/架构/skill 合同：`test/shared/`
- Electron 最终布局：`test/release/`

测试不得直接改真实配置再恢复，不得依赖未声明的 `dist`、coverage、stage、Turbo cache 或本机 DB。
