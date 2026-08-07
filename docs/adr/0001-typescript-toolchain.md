# ADR-0001：TypeScript 工具链与包产物

- **日期：** 2026-08-07
- **状态：** 已接受（Program 1-2）

## 决策

- Packages 唯一 TS 源码，tsup 出 ESM+CJS+d.ts（`@xiaohuang/*` 双产物）。
- Server/Electron 正式产物 CJS；`tsc --noEmit` 只做类型检查（strict 全家开启）。
- Web 由 Vite 构建（ESM），不引入打包层变更。
- TypeScript 5.x（typescript-eslint peer 范围）；`strict`/`noUncheckedIndexedAccess`/
  `exactOptionalPropertyTypes`/`noImplicitOverride`/`useUnknownInCatchVariables`/
  `noFallthroughCasesInSwitch` 全部开启，禁止关选项换全绿。

## 理由

- 双产物让 node:test（CJS require）与 Vite（ESM import）消费同一包。
- strict 选项在迁移期抓出真实缺陷（undefined 收窄、type-only import 等）。
- TS 6 暂不引入（typescript-eslint 未覆盖）。

## 后果

- 新包必须 tsup 双产物 + strict typecheck 通过才能提交。
- pkg 退役（ADR 见退役门）前 Server 保持 ES2022/Node18 子集。
