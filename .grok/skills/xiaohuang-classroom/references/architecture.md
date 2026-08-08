# Architecture map

用于回答“代码属于哪一层、依赖应该朝哪走”。当前数量和脚本以根 `package.json` 与各 workspace `package.json` 为准。

## 分层

| 区域 | 职责 |
| --- | --- |
| `apps/web` (`@xiaohuang/web`) | Vite 浏览器壳、Hub、classroom 和学科 feature |
| `apps/server` (`@xiaohuang/server`) | Express API、SQLite/sql.js、设置、迁移、AI 与化学服务 |
| `apps/desktop` (`@xiaohuang/desktop`) | Electron Main、启动状态机、stage 后端与桌面安全边界 |
| `packages/*` | 可复用、可测试、不得反向依赖 app 的共享合同和基础能力 |
| `test/web`、`test/server`、`test/shared`、`test/release` | 按 owner 分层的自动化验证 |
| `tooling`、`scripts` | 架构/资源/性能门禁、构建、stage 和维护脚本 |
| `docs`、`.grok/skills` | 设计意图、工程记录和 Agent 导航；不能替代当前代码证据 |

## 当前共享 packages

- `packages/config` (`@xiaohuang/config`)：共享配置与版本。
- `packages/domain-core` (`@xiaohuang/domain-core`)：Result、AppError、ID、Clock、Disposable。
- `packages/contracts` (`@xiaohuang/contracts`)：Zod 外部边界 Schema。
- `packages/test-kit` (`@xiaohuang/test-kit`)：fake DOM/storage/clock/timer/RAF/fetch。
- `packages/design-tokens` (`@xiaohuang/design-tokens`)：五主题语义令牌。
- `packages/ui` (`@xiaohuang/ui`)：typed DOM 组件与 UiController 合同。
- `packages/subject-kit` (`@xiaohuang/subject-kit`)：runtime manifest、FeatureLoader、MountableController。
- `packages/math-expr` (`@xiaohuang/math-expr`)：数学表达式共享能力。
- `packages/subject-settings` (`@xiaohuang/subject-settings`)：学科设置与 tab 元数据。

新增 workspace 后先更新真实 workspace 配置，再更新这里的职责说明；不要把固定数量当合同。

## 依赖方向

```text
apps/web ─┐
apps/server ─┼─> packages/*
apps/desktop ┘

test/* -> owning app/package public API
scripts/tooling -> repo contracts and generated outputs
```

- packages 不导入 apps；Server 不导入 Web。
- app 间共享语义通过 package、Schema 或协议，不通过跨 app 源码深引入。
- 外部边界属于 contracts；领域状态和渲染 runtime 分离。
- 兼容入口可以只转发显式导出；禁止裸 `export *` 形成重名静默丢失。

## 迁移状态

工程基座已经存在，但应用层仍有大量 JavaScript。`contracts`、稳定错误码、TS 和统一生命周期在新代码中必须执行；审查旧代码时要区分“已接线”“只有合同/骨架”“尚待迁移”，不要高报全仓完成。
