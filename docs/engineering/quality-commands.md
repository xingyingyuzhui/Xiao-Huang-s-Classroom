# 质量命令地图（Quality Commands）

> 目的：`npm run quality` 串十几步，失败时不用翻长日志——按本文 3 分钟内定位是哪一段挂了，并单跑修复。

## 1. 三分钟定位流程

```bash
npm run quality:fast          # 本地日常快路径（format → lint → css → typecheck → test → build）
```

若 `quality:fast` 失败，按下面「失败速查表」逐段单跑；若 `quality:fast` 通过但 CI/完整 `quality` 失败，多出的段是 `lint:baseline / lint:arch / lint:theme-tokens / lint:assets / budget / coverage`，从速查表对应行单跑。

## 2. 完整 quality 链路（合并前 / CI 跑满）

| #   | 步骤              | 命令（单跑）                | 职责                                                             | 常见失败                                    |
| --- | ----------------- | --------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| 1   | format:check      | `npm run format:check`      | prettier 检查（配置/工程 md/scripts mjs/tooling）                | 文件未格式化 → `npm run format` 后复查      |
| 2   | lint              | `npm run lint`              | eslint：scripts + packages + test/shared + tooling（新代码范围） | 未用绑定、no-explicit-any、导入规则         |
| 3   | lint:css          | `npm run lint:css`          | stylelint：web shared styles + packages css                      | 选择器顺序/无效属性                         |
| 4   | lint:baseline     | `npm run lint:baseline`     | 全仓 lint 问题计数快照（只降不升）                               | 新引入 lint 问题 → 修代码，禁止改基线       |
| 5   | typecheck         | `npm run typecheck`         | turbo 全仓 TS 类型检查                                           | 类型错误、缺包 dist                         |
| 6   | lint:arch         | `npm run lint:arch`         | 依赖方向：apps → packages 单向、server ↛ web                     | 反向 import                                 |
| 7   | lint:theme-tokens | `npm run lint:theme-tokens` | 主题分支禁硬编码颜色                                             | 分支代码写死 hex                            |
| 8   | lint:assets       | `npm run lint:assets`       | 资源引用/封面/重复大文件/清单漂移                                | 引用不存在的资源、manifest 漂移             |
| 9   | test              | `npm test`                  | turbo 各 workspace test + 根 test/shared 串行                    | 单测失败、缺 packages/*/dist                |
| 10  | build             | `npm run build`             | turbo 全仓构建                                                   | tsup/vite 构建错误、依赖图缺失              |
| 11  | budget            | `npm run budget`            | bundle 预算                                                      | 产物超预算                                  |
| 12  | coverage          | `npm run coverage`          | turbo 各包覆盖率阈值                                             | 覆盖率低于阈值（见 `coverage-baseline.md`） |
| 13  | git diff --check  | —（quality 内联）           | 无空白错误                                                       | 行尾空格/空白错误                           |

## 3. quality:fast（本地日常）

`npm run quality:fast` = 第 1、2、3、5、9、10 步 + `git diff --check`。

- **含**：format、lint、lint:css、typecheck、test、build——覆盖「我改的代码没坏」。
- **不含**：lint:baseline、lint:arch、lint:theme-tokens、lint:assets、budget、coverage——这些慢/全仓门禁，**合并前或 CI 仍跑完整 `npm run quality`**。

## 4. 失败速查表

| 症状                              | 嫌疑步骤            | 单跑命令                                             |
| --------------------------------- | ------------------- | ---------------------------------------------------- |
| 「Expected to be formatted」      | 1 format:check      | `npm run format:check`                               |
| eslint 报错 / 未用变量            | 2 lint              | `npm run lint`                                       |
| CSS 报错                          | 3 lint:css          | `npm run lint:css`                                   |
| baseline 增长                     | 4 lint:baseline     | `npm run lint:baseline`                              |
| TS 类型错误 / 找不到模块          | 5 typecheck         | `npm run typecheck`                                  |
| 依赖方向 / packages ↛ apps        | 6 lint:arch         | `npm run lint:arch`                                  |
| 硬编码颜色                        | 7 lint:theme-tokens | `npm run lint:theme-tokens`                          |
| 资源缺失 / manifest 漂移          | 8 lint:assets       | `npm run lint:assets`                                |
| 测试失败 / Failed to resolve 某包 | 9 test              | `npm test`（或 `npm run test -w <workspace>`）       |
| 构建失败                          | 10 build            | `npm run build`（或 `npm run build -w <workspace>`） |
| bundle 超预算                     | 11 budget           | `npm run budget`                                     |
| 覆盖率低于阈值                    | 12 coverage         | `npm run coverage`                                   |
| Whitespace errors                 | 13 diff --check     | `git diff --check`                                   |

## 5. 相关

- 覆盖率阈值与文档一致性：`node --test --test-concurrency=1 test/shared/coverage-config-contract.test.cjs test/shared/coverage-doc-contract.test.cjs`
- 构建可复现（模拟干净产物）：见 `docs/superpowers/plans/2026-08-08-engineering-optimization-roadmap.md` §11.2

## 5.1 Server 干净 start/dev 合同（2026-08-10 主计划 Task 7）

| 命令                                 | 语义                                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run start -w @xiaohuang/server` | prestart 经 Turbo 构建（`--filter=@xiaohuang/server...`，含 domain-core/math-expr/subject-settings），`node src/index.js` 单一入口，不依赖调用者提前生成 dist        |
| `npm run dev:server`                 | predev 构建 + `scripts/dev-server.mjs` supervisor（tsup --watch + chokidar 监听 `apps/server/src/**/*.js` + 重启状态机：首轮构建成功才启 Server；失败保留旧 Server） |
| `npm run dev:all`                    | `scripts/dev-all.mjs` 跨平台 supervisor 持有 Web/Server 两棵进程树（POSIX 进程组 / Windows taskkill /T，无 shell `&`）                                               |

验证（本地与 CI 同路径）：

```bash
node scripts/verify-server-start.mjs --mode=start   # 真实 start lifecycle + /api/health 30s
node scripts/verify-server-start.mjs --mode=dev     # 真实 dev lifecycle + watcher 首轮成功 + health
node --test --test-concurrency=1 test/shared/server-entrypoint-contract.test.cjs test/shared/server-dev-supervisor.test.cjs test/shared/dev-all-supervisor.test.cjs
```

smoke 用系统临时数据目录（`CHEM_LAB_DATA_DIR`）、从 `监听: host:port` 日志解析真实端口、整树回收后确认端口关闭；前后对比 `apps/server/data` 与 `apps/server/src/data` 状态，证明无生产数据写入。

Node 版本差异由 quality workflow 的 `node-version-portability` job 覆盖：`TURBO_FORCE=true npm test` 在 Node 20/24 双版本各跑一遍（防 Turbo 缓存假绿）。

## 6. 改动 → 最低命令矩阵

按本次改动范围选最低门禁；范围拿不准就上完整 `npm run quality`。推 `origin/main` 还会被 `.githooks/pre-push` 自动拦一道（见第 7 节）。

| 动作                      | 最低命令                                                                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 日常切片合本地 main       | `npm run quality:fast`（format + lint + lint:css + typecheck + test + build）                                                                                          |
| 推 origin / 发版 / 大合并 | `npm run quality`（quality:fast + lint:baseline/arch/theme-tokens/assets + budget + coverage）                                                                         |
| 只改 `packages/ui`        | `npm run test -w @xiaohuang/ui` + `npm run lint:theme-tokens` + `node --test test/shared/ui-no-raw-button-contract.test.cjs test/shared/ui-adoption-contract.test.cjs` |
| 只改 server               | `npm run test -w @xiaohuang/server` + `npm run typecheck` + `node scripts/verify-server-start.mjs --mode=start`（start/dev 合同改动时再跑 `--mode=dev`）               |

## 7. pre-push 门禁（`.githooks/pre-push`）

**目的：** 阻止「绕过 quality 直接把 main 推上 origin」（风险计划 Track E，R2c）。

**行为：**

- 本次 push 只涉及非 `main` 分支：直接放行，不跑门禁（日常 feature 分支推送不减速）。
- 本次 push 会更新远端 `refs/heads/main`：先跑 `npm run quality:fast`，失败则**阻止推送**（exit 1 并输出原因）。

**启用（每个 clone / worktree 执行一次，配置在 `.git/config`，不入库）：**

```bash
git config core.hooksPath .githooks
```

hook 文件本体已入库（`.githooks/pre-push`，可执行）。验证生效：`git config core.hooksPath` 应输出 `.githooks`。

**豁免 / 停用：**

- 临时豁免（负责人确认并记录原因后）：`git push --no-verify`
- 停用 hook：`git config --unset core.hooksPath`（或删掉 `.git/config` 中该行）

## 6. 质量命令真值（2026-08-10 明确区分）

| 命令            | 范围                                              | 角色                                                                  |
| --------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| `lint`          | scripts/packages/test-shared/tooling              | 新代码范围                                                            |
| `lint:critical` | 全部生产 JS/MJS/CJS（eslint.critical.config.mjs） | **零容忍运行时规则**（no-undef 等 11 条）；进 quality 与 quality:fast |
| `lint:baseline` | 全仓（v2 文件级指纹）                             | 旧债不新增（新文件/新 rule/message/上下文/count 增加即失败）          |
| `lint:all`      | 全仓                                              | 诊断命令；存量清零前预期非零                                          |
| `typecheck`     | TS 范围                                           | 不代表旧 JS 已检查                                                    |
