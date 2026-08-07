# pkg 便携版退役门

> Program 1 Task 1.8 产物。`pkg`（Node 18 单文件 Windows）是**过渡兼容产物**，不是目标工程体系的一部分；
> Electron Windows `portable` 是其正式替代品。本文件定义等价验收清单与删除条件（spec §6.4）。
> 状态：2026-08-07 记录——E1–E5 需 Windows 产物执行，本机（macOS）不可执行；
> 退役门就位、pkg smoke 保持，等价验收待 Windows CI/环境执行后勾选（不伪造）。

## 等价验收清单（Electron portable 必须全部满足）

| #   | 验收项                                                   | 验收方法                                              | 状态 |
| --- | -------------------------------------------------------- | ----------------------------------------------------- | ---- |
| E1  | 便携启动：解压后无安装直接启动，无黑色控制台             | `scripts/electron-portable-smoke.mjs`（Program 6 建） | [ ]  |
| E2  | 用户数据导入：旧 `pkg` 邻近 `data` 目录的数据被识别/迁移 | 迁移框架测试（Program 5）+ smoke                      | [ ]  |
| E3  | API 等价：`/api/...` v1 端点行为一致                     | server API contract 测试（Program 5 Task 5.3）        | [ ]  |
| E4  | AI 设置等价：AI Key 配置与请求行为一致                   | AI adapter 测试（Program 5 Task 5.7）                 | [ ]  |
| E5  | 离线功能等价：本地题库/实验/离线模式可用                 | offline-quiz 与 labs 测试                             | [ ]  |

## 删除条件（全部满足才可执行 Program 6 Task 6.5）

1. 上表 E1–E5 全部勾选且有自动化证据。
2. Electron portable 产物通过 stage 完整性校验（Program 6 Task 6.3）。
3. 以下内容在同一独立提交中删除：
   - `pkg` 依赖（apps/server/package.json）
   - `build:exe` / `pkg:win` 脚本与 `apps/server/scripts/pkg-win.js`
   - `apps/server/src/index.js` 的 `isPkg` 分支与 pkg 相关文档
   - 根 README / AGENTS.md 中 pkg 相关说明
4. 删除后 Server 最低运行基线从 Node 18 子集提升到 Node 20，并更新 `docs/engineering/baseline-2026-08-07.md`。
5. 删除提交后全仓测试、构建、`npm run lint:arch`、`git diff --check` 全绿。

## 过渡窗口要求

- 在退役门通过前，Server 编译产物保持 ES2022/Node 18 可执行子集（Program 5 的 tsup 目标），并保留 pkg smoke。
- 禁止复制或冻结独立 legacy Server 来长期维持 pkg。
- 如果等价验收未完成，Node 20-only 代码不得进入 Server 生产路径。
