# 小黄的教室账户、班级、云同步与部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务执行。总控 Agent 必须先建立集成分支和独立 worktree，冻结合同后再并行；不得让多个 Agent 在同一工作树同时编辑。

**Goal:** 在保留 Electron 与 Web 断网可用能力的前提下，为“小黄的教室”增加统一教师账户、多账户卡片、跨学科班级容器、按班级/学科隔离的数据、手动云同步、云端 AI Key、设备管理、Windows 自动更新，并部署到 `111.228.54.224` 的 Ubuntu 22.04 Docker 环境。

**Architecture:** 保留 `apps/server` 作为 Electron 本地离线 BFF，不把现有无认证的 sql.js/SQLite Server 直接暴露公网；新增 `apps/cloud-server` 模块化单体，以 PostgreSQL 作为云端权威。客户端采用 local-first：业务先写本地 repository，并在同一事务追加 outbox；恢复网络只提示，教师点击“同步”后才 push/pull。跨端共享 Zod 合同、稳定错误码与纯同步算法，不共享 SQLite/PostgreSQL SQL 实现。

**Tech Stack:** npm workspaces/Turbo、TypeScript、Express、Zod、PostgreSQL 16、IndexedDB、Electron `safeStorage`、Docker Compose、Host Nginx、GitHub Actions、electron-builder/electron-updater。

---

## 0. 总控规则与已确认产品决策

### 0.1 开始前必须确认

- [x] 从最新 `origin/main` 建立 `codex/account-cloud-program`，不要直接在当前 `codex/fix-intersection-state-perf` 上开发。  
  **证据：** 分支 `codex/account-cloud-program` @ `8de23d0`（2026-08-11）
- [x] 确认数学交点性能分支已合并或明确排除；记录基线 SHA、`git status --short` 和远端关系。  
  **证据：** 交点分支 `codex/fix-intersection-state-perf` @ `e1dc725` 未合并；本 Program 基于 `origin/main` `8de23d0`
- [x] 运行 `node .grok/skills/xiaohuang-classroom/scripts/inspect-current.mjs --check`。  
  **证据：** 2026-08-11 PASS（12 workspaces，owner paths 9/9）
- [x] 运行 `npm ci && npm run quality:fast`，保存新鲜基线；失败时先修基线，不得把旧失败混入本项目。  
  **证据：** `npm run quality:fast` exit 0 @ `8de23d0`（2026-08-11）
- [x] 阅读根 `AGENTS.md`、`docs/engineering/data-paths.md`、`docs/engineering/branch-authority.md`、`docs/engineering/safe-change-playbook.md`。
- [x] 不修改、提交或迁移 `apps/server/data/`、`apps/server/src/data/` 的真实用户数据库；所有迁移测试使用临时副本。

### 0.2 产品决策视为冻结合同

1. 一个账户覆盖化学、数学、物理等所有学科，不创建“每学科一套用户表”。
2. Electron 教室客户端可用 Main `safeStorage` 记住多个教师账户卡片并快速切换；同一时间只有一个活动账户。普通 Web 浏览器只维持一个 HttpOnly refresh 会话，其他本地账户卡片切换时必须重新认证，不能为实现多账户而把 refresh token 放进 Web 可读存储。
3. 登录后可以不选班级；设置中随时切换班级、账户或体验模式。
4. `Class` 是账户私有的跨学科容器；名单和业务数据归属 `ClassSubjectWorkspace`，不同学科不共享名单。
5. 未选择班级时使用 `PersonalSubjectWorkspace(accountId, null, subjectId)`。
6. 未登录为 `GuestWorkspace`：允许本地班级、设置和所有离线功能，重启后保留。
7. 登录不会自动吞并本地数据；“复制到云端”创建新的云班级/资源，本地源继续保留。
8. 离线修改自动进入队列；联网后不得自动上传，只显示待同步数量，教师点击“同步/保存到云端”才执行。
9. 冲突必须提示用户，不默认本地优先或云端优先。
10. 删除班级、账户云数据进入 30 天废纸篓；设备上的“删除账户卡片”只撤销本机登录，不等于删除云账户。
11. 学生第一期仅保存名单显示名、排序和启用状态，不建立学生账户，不收集额外个人资料。
12. 一个账户只配置一个 AI Provider；班级不单独选模型。AI Key 只在云端加密保存，客户端永远拿不到原文。
13. 测试阶段关闭公开注册；保留 `closed | invite | public` 开关。邮箱验证、忘记密码、微信扫码按合同预留，未具备域名/HTTPS/微信凭据前不得宣称上线。
14. Web 与 Electron 都必须离线可用；断网时云同步和云 AI 不可用，其他课堂功能可用。
15. 服务器只公开 `22/80/443`；PostgreSQL、Cloud API、Docker 内部端口不直接暴露公网。

### 0.3 否决项

- 禁止直接公网化 `apps/server/src/index.js`。
- 禁止用一个“通用 SQL 接口”同时适配 sql.js 和 PostgreSQL。
- 禁止把 access/refresh token 或 AI Key 放进 renderer `localStorage`、IndexedDB、日志、URL、Vite 环境变量或 Git 仓库。
- 禁止把同步实现为“本地保存后立即再写云端”的脆弱双写。
- 禁止以客户端时间戳决定冲突胜负。
- 禁止直接物理删除离线可同步资源。
- 禁止未登录/未选班级时回退到某个上次账户的全局缓存。
- 禁止在公网 HTTP 上测试真实密码、refresh token、AI Key 或微信回调。
- 禁止使用 `latest` 镜像、覆盖同版本发布物或在迁移失败后继续启动服务。

---

## 1. 目标边界与目录结构

### 1.1 应新增的主要目录

```text
apps/
  cloud-server/                 # 云端账户/班级/同步/AI 模块化单体，PostgreSQL
    src/
      app.ts                    # Express 组合根
      config.ts                 # 环境 Schema，启动时 fail-fast
      server.ts                 # 固定端口启动与优雅退出
      middleware/               # requestId/auth/csrf/rate-limit/error
      auth/                     # 登录、refresh、登出、注册策略
      accounts/                 # 资料、头像、软删除
      devices/                  # 设备会话与远程撤销
      classes/                  # 班级、复制、废纸篓
      sync/                     # push/pull/cursor/idempotency/conflict
      ai/                       # 凭据、Provider、代理、用量与额度
      admin/                    # 教师自助管理；平台管理员仅预留
      audit/                    # 安全与关键业务审计
      db/
        pool.ts
        migrate.ts
        migrations/
        repositories/
    test/
    Dockerfile

packages/
  contracts/src/               # 扩展 auth/account/class/workspace/sync/ai 契约
  domain-core/src/             # 扩展 ID 与稳定错误码
  sync-core/                   # 纯 TS 同步状态机/冲突模型，无 DOM/DB/fetch

apps/web/src/
  account/                     # 账户会话、账户卡片、登录 UI
  workspace/                   # 活动班级/学科上下文和切换事务
  sync/                        # outbox、手动同步、冲突中心、资源 registry
  shared/persistence/indexeddb/# Web/Electron renderer 本地 repository
  shared/api/cloud-client.ts   # 云 API transport

apps/desktop/src/
  preload.ts
  auth-vault.ts                # safeStorage 长期凭据
  account-ipc.ts               # 最小 IPC handler
  updater.ts                   # Windows 自动更新

deploy/
  compose.yml
  env.example
  nginx/xiaohuang.conf
  scripts/deploy.sh
  scripts/rollback.sh
  scripts/backup-postgres.sh
  scripts/restore-postgres.sh
  scripts/verify-release.sh

docs/operations/
  cloud-deployment.md
  backup-restore.md
  incident-runbook.md
  account-data-boundaries.md
```

### 1.2 唯一 owner

| 真值                            | 唯一 owner                                                  |
| ------------------------------- | ----------------------------------------------------------- |
| 登录身份与设备会话              | `apps/cloud-server/src/auth`、`devices`                     |
| 云端班级与 workspace            | `apps/cloud-server/src/classes`                             |
| 云资源 revision/change sequence | `apps/cloud-server/src/sync`                                |
| 活动账户/班级/学科              | `apps/web/src/workspace/workspace-context-store.ts`         |
| 本地业务数据与 outbox           | IndexedDB repository；迁移完成前的旧资源明确标记 local-only |
| Electron refresh token          | Main `safeStorage`，renderer 不持有                         |
| Web refresh token               | HttpOnly Secure SameSite cookie                             |
| AI Key                          | 云端加密表；客户端只见 metadata                             |
| 本地兼容 API/内置内容           | 现有 `apps/server`                                          |
| 云端多用户 API                  | 新 `apps/cloud-server`                                      |
| API/同步序列化合同              | `@xiaohuang/contracts`                                      |
| 纯同步算法                      | `@xiaohuang/sync-core`                                      |

---

## 2. 多 Agent 编排与合并纪律

### 2.1 推荐角色

| Agent               | 工作树/分支                   | 独占范围                                                     | 可开始条件                              |
| ------------------- | ----------------------------- | ------------------------------------------------------------ | --------------------------------------- |
| Supervisor          | `codex/account-cloud-program` | 集成、公共入口、package-lock、最终门禁                       | 立即                                    |
| A Contracts         | `codex/account-contracts`     | `packages/contracts`、`domain-core`、`sync-core`             | 立即                                    |
| B Cloud Auth        | `codex/cloud-auth`            | auth/accounts/devices、`0010–0019` migrations                | A 合同与 Task 3 Cloud Foundation 已合并 |
| C Cloud Sync        | `codex/cloud-sync`            | classes/workspaces/sync/repositories、`0020–0029` migrations | A 合同与 Task 3 Cloud Foundation 已合并 |
| D Client Local      | `codex/client-local-sync`     | workspace context、IndexedDB、outbox、cloud client           | A 双产物可消费                          |
| E Account UI        | `codex/account-ui`            | 登录、账户卡片、班级设置、冲突 UI                            | A mock 合同；接线等 D                   |
| F AI Security       | `codex/cloud-ai`              | AI credential/provider/quota/audit、`0030–0039` migrations   | Task 3 基线和 B auth principal 已合并   |
| G Resource Adapters | 每一 wave 独立分支            | 14 类同步资源 adapter                                        | C/D engine 绿                           |
| H DevOps            | `codex/cloud-deploy`          | Compose/Nginx/备份/CI/CD                                     | health/env/migration 合同冻结           |
| I Desktop Release   | `codex/desktop-auth-update`   | preload/safeStorage/updater/release                          | A auth IPC 合同稳定                     |
| J Security/QA       | 只读审查或独立测试分支        | threat model、越权、恢复、E2E                                | 每个 milestone                          |

### 2.2 共享热点只允许 Supervisor 收口

- 根 `package.json`、`package-lock.json`、`turbo.json`。
- `apps/cloud-server/package.json`、`src/app.ts`、`src/server.ts`、migration manifest/runner 由 Supervisor/Task 3 Foundation 唯一收口；B/C/F 只消费公共组合接口和各自预留 migration 号段。
- `packages/contracts/src/index.ts` 与 `packages/domain-core/src/index.ts`。
- `apps/web/src/main.js`、`apps/server/src/index.js`。
- `electron-builder.yml`、`.github/workflows/*`。
- PostgreSQL migration 编号表。
- Nginx 正式路由与生产环境变量名。

其他 Agent 如需这些文件，只提交“建议补丁”或单独 commit，由 Supervisor 串行 cherry-pick/重写。

### 2.3 合并顺序

```text
A contracts/sync-core
  ├─> B cloud auth/PG
  ├─> C cloud classes/sync
  └─> D client local/outbox

B + C + D
  ├─> E account/class/conflict UI
  ├─> F cloud AI
  └─> G resource adapters wave 1..4

B/C health + migrations ─> H deploy
A/D auth IPC ────────────> I Electron vault/updater

全部 ─> J security/restore/E2E ─> Supervisor release candidate
```

每次 cherry-pick 后运行受影响 workspace 测试；每个 milestone 运行 `npm run quality:fast`；发布候选运行两次 `npm run quality`、干净检出门禁和真实部署验收。

---

## 3. Task 1：冻结数据分类、威胁模型与兼容基线

**Files:**

- Create: `docs/operations/account-data-boundaries.md`
- Create: `docs/operations/account-threat-model.md`
- Create: `docs/operations/sync-resource-inventory.md`
- Create: `docs/operations/web-offline-capability-matrix.md`
- Modify: `.gitignore`
- Test: `test/shared/account-program-doc-contract.test.cjs`

- [x] 列出所有当前持久化键、SQLite 表和导入导出格式，标记 owner、旧版本、目标 workspace、迁移策略与是否同步。
- [x] 列出 Web 生产代码每一个 `/api/*` 调用，标记为 `bundled-readonly | local-repository | cloud-only-ai | cloud-sync | must-migrate`；不能只盘点数据库而漏掉 Web 对本地 Server 的运行时依赖。
- [x] 将数据分成 `devicePreference`、`accountSetting`、`personalSubjectWorkspace`、`classSubjectWorkspace`、`localOnly`、`cloudSecret` 六类。
- [x] 明确 theme/zoom/sfx/drawer 为设备偏好；AI Key 为 cloudSecret；名单、点名、进度、画布、题目、草稿为 workspace 数据。
- [x] 写 STRIDE 风格威胁模型：公共电脑、多账户串用、IDOR、refresh token 窃取、CSRF、离线重放、同步覆盖、AI Key 泄漏、备份泄漏、更新劫持。
- [x] `.gitignore` 增加 `.env`、`.env.*`（保留 `!.env.example`）、`*.pem`、`*.p12`、`*.pfx`、`*.key`、本地备份和上传目录。
- [x] 写合同测试，确保上述文档存在、14 类资源全部登记、secret 忽略规则存在。
- [x] 运行 `node --test test/shared/account-program-doc-contract.test.cjs`，Expected: PASS。  
  **证据：** 6/6 pass（2026-08-11）
- [x] Commit: `docs: define account and sync data boundaries`。  
  **SHA：** `c3e83f9`

**完成定义：** 任何现有数据都能回答“属于哪个账户/班级/学科、保存在哪里、是否同步、如何迁移、如何删除”。

---

## 4. Task 2：共享合同、ID、错误码与纯同步核心

**Files:**

- Create: `packages/contracts/src/auth.ts`
- Create: `packages/contracts/src/account.ts`
- Create: `packages/contracts/src/classroom.ts`
- Create: `packages/contracts/src/workspace.ts`
- Create: `packages/contracts/src/sync.ts`
- Create: `packages/contracts/src/ai-provider.ts`
- Modify: `packages/contracts/src/settings.ts`
- Modify: `packages/contracts/src/ipc.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/domain-core/src/ids.ts`
- Modify: `packages/domain-core/src/errors.ts`
- Create: `packages/sync-core/package.json`
- Create: `packages/sync-core/src/{types,outbox,sync-session,conflict,cursor,index}.ts`
- Test: `packages/contracts/test/account-cloud-contracts.test.ts`
- Test: `packages/sync-core/test/*.test.ts`

### 4.1 合同要求

- [ ] 建立 branded `AccountId/ClassId/WorkspaceId/DeviceId/SessionId/ResourceId/OperationId/Cursor`。
- [ ] Auth schema 覆盖 register/login/refresh/logout/current-account/device revoke，所有字符串长度和危险字符有上限。
- [ ] `WorkspaceScope` 必须显式携带 `accountId`、`classId|null`、`subjectId` 和 `kind`；禁止隐式“当前班级”。
- [ ] `SyncEntityEnvelope` 包含 `resourceType/resourceId/schemaVersion/revision/baseRevision/payload/contentHash/deletedAt`。
- [ ] `SyncOperation` 包含客户端生成的 `operationId`，服务端按 `(accountId, operationId)` 幂等。
- [ ] `SyncPushResponse` 分成 `applied/rejected/conflicts`；冲突返回 local/server/base 的可展示摘要，不返回其他租户数据。
- [ ] `SyncPullResponse` 使用服务端 change sequence/cursor，不用客户端时间戳。
- [ ] `AiCredentialMetadata` 只能含 provider/model/configured/last4/updatedAt；合同层根本不提供“读取 key 原文”响应。
- [ ] 将 `subjectSettingsSchema` 从任意 `record<unknown>` 收紧；普通设置与 AI credential 完全拆开。
- [ ] 新增稳定错误码：`AUTH_*`、`FORBIDDEN_*`、`ACCOUNT_*`、`CLASS_*`、`SYNC_*`、`CONFLICT_*`、`QUOTA_*`、`CREDENTIAL_*`。

### 4.2 sync-core 行为

- [ ] 纯状态机实现 `idle → pushing → conflict|pulling → completed|failed|cancelled`。
- [ ] 网络恢复事件只能更新 `online`，不得自动调用 push。
- [ ] context generation 改变后，旧请求结果必须被判为 stale，不能写新 workspace。
- [ ] 冲突未解决前保留三方快照；解决策略为 `keepLocal`、`keepCloud`，支持的资源另有 `duplicateLocal`。
- [ ] tombstone 在服务端确认和保留期结束前不可物理删除。
- [ ] 测试重复 operation、乱序响应、取消、重启恢复、cursor 不倒退、冲突不覆盖。

### 4.3 验证

```bash
npm run test -w @xiaohuang/contracts
npm run test -w @xiaohuang/sync-core
npm run build -w @xiaohuang/contracts
npm run build -w @xiaohuang/sync-core
npm run typecheck
```

Expected: 全绿；CJS/ESM/d.ts 双产物一致；`packages` 不导入任何 `apps`。

Commit: `feat(contracts): add account workspace and sync contracts`。

---

## 5. Task 3：独立 Cloud Server 与 PostgreSQL 基础

**Files:**

- Create: `apps/cloud-server/package.json`
- Create: `apps/cloud-server/tsconfig.json`
- Create: `apps/cloud-server/tsup.config.ts`
- Create: `apps/cloud-server/src/{app,server,config}.ts`
- Create: `apps/cloud-server/src/db/{pool,migrate,migration-lock}.ts`
- Create: `apps/cloud-server/src/db/migrations/0001_platform.sql`
- Create: `apps/cloud-server/src/middleware/{request-id,error-handler,body-limit,auth-principal}.ts`
- Test: `apps/cloud-server/test/{config,health,migrations,tenant-isolation}.test.ts`

### 5.1 运行时边界

- [ ] `apps/cloud-server` 不导入 `apps/server` 或 `apps/web`；共享只经 packages。
- [ ] 数据访问固定使用 `pg` 与显式 repository；不引入可切换 SQLite/PG 的泛型 SQL 层，也不把 SQLite SQL 复制后做字符串替换。
- [ ] 固定监听 `0.0.0.0:3000`（容器内），端口占用必须失败，禁止自动 `+1`。
- [ ] `/livez` 只证明进程存活；`/readyz` 检查 DB、migration version 和必需密钥，不泄漏配置。
- [ ] 配置用 Zod 启动校验：`DATABASE_URL`、token signing key、AI KEK、public origin、registration mode、body limit。
- [ ] 统一生成 requestId；日志为 JSON，token/password/key/cookie/authorization 必须脱敏。
- [ ] Cloud API 前缀固定 `/api/cloud/v1`，不混入现有本地 `/api` 或不完整 `/api/v2/settings`。

### 5.2 PostgreSQL schema

本任务只建立 migration metadata、必要 extension、受限 app role 与审计基础；领域表由后续唯一 owner 在预留号段创建：

```text
0010–0019  auth/accounts/devices（Agent B）
0020–0029  classes/workspaces/sync（Agent C）
0030–0039  ai/audit（Agent F）
```

- [ ] 所有后续业务表都必须有明确 owner FK；跨租户查询必须包含 `account_id`。
- [ ] `account_identities` 对规范化 username/email/provider subject 建唯一约束。
- [ ] migration manifest 与 runner 由 Task 3/Supervisor 独占；B/C/F 只能在预留号段新增文件，不得并行改 runner 或重排已合并编号。
- [ ] migrations 使用事务、checksum 和 advisory lock；空库、重复运行、前一版升级、高版本拒绝都要测。
- [ ] 不提供“自动 down migration”；回滚依赖发布前 `pg_dump` 和向后兼容的 expand/contract 策略。
- [ ] PG 集成测试使用 Testcontainers 或 `deploy/compose.test.yml` 启动真实 PostgreSQL；不得用 SQLite fake 证明 PG 语义。测试必须自建随机 database/schema 并在结束时回收。

### 5.3 验证

```bash
npm run test -w @xiaohuang/cloud-server
npm run typecheck -w @xiaohuang/cloud-server
docker compose -f deploy/compose.yml config   # deploy 骨架合并后
```

Expected: 空库迁移成功、第二次幂等、错误 migration 原子回滚、受限 app role 不能绕过未来 tenant policy。

Commit: `feat(cloud): add postgres application foundation`。

---

## 6. Task 4：认证、账户与设备会话

**Files:**

- Create: `apps/cloud-server/src/auth/*`
- Create: `apps/cloud-server/src/accounts/*`
- Create: `apps/cloud-server/src/devices/*`
- Create: `apps/cloud-server/src/db/migrations/0010_identity_sessions.sql`
- Create: `apps/cloud-server/src/db/repositories/{account,identity,session}.ts`
- Test: `apps/cloud-server/test/{auth,refresh-rotation,devices,authorization}.test.ts`

### 6.1 安全设计

- [ ] 密码使用审计过的 Argon2id 实现，不手写 hash；参数在 2C4G 服务器上压测后固化。
- [ ] access token 短有效期（建议 10–15 分钟）；refresh token 为高熵随机 opaque token，数据库只存 hash。
- [ ] refresh rotation：每次刷新废弃旧 token；检测 reuse 时撤销整个 token family 并记录审计。
- [ ] Web refresh token 使用 `HttpOnly; Secure; SameSite=Lax` cookie，并做 CSRF 校验。
- [ ] Electron refresh token 一次性交给 Main 进程，由 `safeStorage` 保存；renderer 只持短期 access token（内存）。
- [ ] 登录错误不得区分“用户不存在/密码错误”；按 IP+identity 限流；响应和日志不含凭据。
- [ ] registration mode 默认 `closed`；invite/public 需显式环境开关。
- [ ] 微信身份只建立 adapter 和 disabled contract；没有正式域名、HTTPS、AppID/secret 时不做假扫码。
- [ ] 邮箱验证/密码重置 token 表、接口合同和过期语义可预留，但发送能力未配置时返回稳定 `FEATURE_DISABLED`。
- [ ] `accounts/account_identities/password_credentials/device_sessions/password_reset_tokens` 具有 FK、唯一约束、状态约束和必要索引；Cloud 运行角色只通过受控 repository 访问。

### 6.2 API

```text
POST /api/cloud/v1/auth/register
POST /api/cloud/v1/auth/login
POST /api/cloud/v1/auth/refresh
POST /api/cloud/v1/auth/logout
GET  /api/cloud/v1/account
PATCH /api/cloud/v1/account
POST /api/cloud/v1/account/password/change
POST /api/cloud/v1/account/deletion-request
DELETE /api/cloud/v1/account/deletion-request
GET  /api/cloud/v1/devices
DELETE /api/cloud/v1/devices/:sessionId
```

- [ ] 远程撤销后，被撤销设备的 refresh、sync 和 AI 立即失败。
- [ ] 已登录教师可验证旧密码后修改自己的密码；修改成功撤销其他 refresh token family。公开“忘记密码”仍保持 feature flag，等待邮件能力。
- [ ] 账户头像只存元数据与受控对象路径；校验 MIME、大小和实际文件签名，禁止 SVG/HTML 主动内容。
- [ ] “从设备删除账户卡片”和“删除云账户”使用不同端点、不同文案和二次确认。
- [ ] 云账户删除请求必须 recent-auth + 二次确认；提交后状态变为 `pending_deletion`，立即撤销全部普通 device sessions，停止 sync/AI，并保留云资源 30 天。
- [ ] pending-deletion 账户用正确凭据登录时只签发短时 `account:restore` 限权会话：只能查看删除截止时间或调用 `DELETE /account/deletion-request`，不能读取班级/资源、refresh、sync 或 AI。
- [ ] 取消删除恢复 account 状态，但不自动恢复旧 device sessions；教师需重新登录各设备。30 天清理任务必须幂等、可审计，并按数据保留策略删除/匿名化子资源。

### 6.3 验证

覆盖注册关闭、唯一性、密码 timing、rotation/reuse、CSRF、IDOR、设备撤销、多设备并发、日志脱敏、30 天恢复。

Commit: `feat(cloud): add secure account and device sessions`。

---

## 7. Task 5：班级、Workspace 与废纸篓

**Files:**

- Create: `apps/cloud-server/src/classes/*`
- Create: `apps/cloud-server/src/db/migrations/0020_classes_workspaces.sql`
- Create: `apps/cloud-server/src/db/repositories/{class,workspace}.ts`
- Create: `apps/web/src/workspace/{workspace-context-store,workspace-switch-controller,workspace-key}.ts`
- Test: `apps/cloud-server/test/classes.test.ts`
- Test: `test/web/workspace-context.test.ts`

### 7.1 云端班级

```text
GET    /api/cloud/v1/classes
POST   /api/cloud/v1/classes
PATCH  /api/cloud/v1/classes/:id
POST   /api/cloud/v1/classes/:id/copy
DELETE /api/cloud/v1/classes/:id
POST   /api/cloud/v1/classes/:id/restore
GET    /api/cloud/v1/trash/classes
```

- [ ] Class 属于一个 account，不支持教师共享；导入/导出是显式文件交换，不是 membership。
- [ ] 一个 Class 可生成多个 subject workspace；不同 subject 的 roster/resource 不能互查。
- [ ] Personal workspace 使用 partial unique index（例如 `(account_id, subject_id) WHERE class_id IS NULL AND kind='personal'`）；Class workspace 使用独立 partial unique index。不得依赖普通 UNIQUE 对 NULL 去重，并发惰性创建只能得到同一个 workspace。
- [ ] `classes/workspaces` 启用 PostgreSQL RLS；Cloud app 使用受限角色和 `SET LOCAL app.account_id` 的 request transaction，migration/maintenance 使用独立角色。repository owner 条件与 RLS 均需跨租户测试。
- [ ] 账户登录但未选班级时，为每学科惰性创建 personal workspace。
- [ ] Class copy 复制经登记的配置和内容，默认不复制点名历史/AI 历史；具体矩阵写入数据边界文档。
- [ ] 删除 class 写 tombstone 并进入 30 天废纸篓；恢复生成新 revision。

### 7.2 客户端上下文切换原子性

唯一状态：

```ts
type WorkspaceContext = {
  mode: 'guest' | 'authenticated';
  accountId: AccountId | null;
  activeClassId: ClassId | null;
  subjectId: SubjectId;
  workspaceId: WorkspaceId;
  deviceId: DeviceId;
  generation: number;
};
```

- [ ] 切换顺序固定：flush 当前本地事务 → abort 网络请求 → generation++ → 清内存 cache → 打开新 namespace → 通知 UI。
- [ ] 旧 generation 的响应和 timer callback 必须丢弃。
- [ ] `apps/web/src/app/session.js` 继续只管 surface/dialog；不得塞入账户数据库逻辑。
- [ ] `apps/web/src/subjects/session.ts` 的学科持久化改为 WorkspaceContext 的一个字段，不再是孤立全局真值。
- [ ] 无账户/无班级/班级已删/账户被撤销都有明确 fallback，不得偷偷复用上一账户缓存。

Commit: `feat(workspace): isolate account class and subject context`。

---

## 8. Task 6：本地 repository、IndexedDB 与迁移框架

**Files:**

- Create: `apps/web/src/shared/persistence/indexeddb/{database,migrations,resource-repository,outbox-repository,cursor-repository}.ts`
- Create: `apps/web/src/sync/local-resource-service.ts`
- Modify: `packages/test-kit`（fake IndexedDB/network/context generation）
- Test: `test/web/local-data-isolation.test.ts`
- Test: `test/web/local-data-migration.test.ts`

### 8.1 存储边界

- [ ] localStorage 只保留小型设备偏好；token、队列、课程内容、名单、画布和历史进入 IndexedDB。
- [ ] 每条本地资源键包含 `workspaceId/resourceType/resourceId`，不得靠当前全局变量补 scope。
- [ ] 业务资源写入与 outbox append 必须在同一个 IndexedDB transaction 中成功或失败。
- [ ] outbox ack 前不可删除；崩溃和重启后必须恢复。
- [ ] 迁移使用 version、marker、source hash、postcondition；只有新数据校验成功后才删除旧 key。
- [ ] quota/full/corruption 时保留旧源并给用户可操作错误，不允许 catch 后静默。

### 8.2 旧数据迁移

至少覆盖：

- `xiaohuang:math:graph-document:v2`
- `math-graph-board-notes-v1`
- 化学配平/实验预习进度
- 当前全局 settings cache
- `class_students` 的导出导入桥
- 其他 inventory 文档登记的 localStorage/sessionStorage/SQLite 用户数据

迁移目标默认为 `guest/default/<subject>`；登录后只能通过显式“复制到云端”创建云资源。

### 8.3 兼容策略

- [ ] 现有 `apps/server` 与 `/api/*` 先保持可用。
- [ ] 资源迁移完成前标记 `localOnly`，不得生成无法原子维护的假 outbox。
- [ ] 每个资源切换到新 repository 后，保留一个只读兼容期和退役测试，再删除旧写路径。
- [ ] Web 和 Electron renderer 共用 IndexedDB adapter，避免同步逻辑分叉；Electron 本地 Server 继续提供内置内容和未迁移 v1 API。

Commit: `feat(web): add scoped local repository and durable outbox`。

---

## 9. Task 7：Cloud API Client 与手动同步协议

**Files:**

- Create: `apps/web/src/shared/api/cloud-client.ts`
- Create: `apps/web/src/sync/{sync-controller,sync-status-store,resource-registry,conflict-store}.ts`
- Create: `apps/cloud-server/src/sync/{routes,service,repository,authorization}.ts`
- Create: `apps/cloud-server/src/db/migrations/0021_sync_resources.sql`
- Create: `apps/cloud-server/src/db/migrations/0022_import_jobs.sql`
- Test: `test/web/manual-sync.test.ts`
- Test: `apps/cloud-server/test/sync.test.ts`

### 9.1 Transport

- [ ] Cloud base URL 来自运行时 `/runtime-config.json`，不得烘焙 secret 或只靠 Vite build-time env。
- [ ] 请求携带 requestId、短期 auth、idempotency key、AbortSignal、context generation。
- [ ] 统一解析 v2/cloud envelope；401 只允许一次安全 refresh，失败则锁定云操作但不删除本地数据。
- [ ] body 和 batch 有明确大小/数量上限；超限拆批，不把整份 AI 历史一次上传。

### 9.2 Push/Pull

```text
POST /api/cloud/v1/sync/push
GET  /api/cloud/v1/sync/pull?cursor=...
```

- [ ] 本地保存永远先完成；云失败只改变 pending/error 状态。
- [ ] 点“同步”后先 push outbox，再 pull change log；push 重放不会重复创建。
- [ ] pull 应用资源与推进 cursor 必须同一事务。
- [ ] baseRevision 不一致返回 `SYNC_CONFLICT`，绝不 last-write-wins。
- [ ] 冲突记录由客户端 durable conflict store 持有：`keepLocal` 基于最新 server revision 创建带 `resolvesOperationId` 的新 push；`keepCloud` 在本地事务中采用 server snapshot 并清 pending；`duplicateLocal` 生成新 resourceId 再 push。服务端按新 operation 审计，无需维护第二套 conflict 真值表。
- [ ] tombstone 正常参与 pull；离线旧设备不能把已删数据静默复活。
- [ ] `sync_resources` 对 owner/workspace/type/id 建唯一约束，保存 revision/schemaVersion/JSONB/hash/tombstone；change log 使用服务端单调序列并建立 cursor 索引；tenant 表继承 RLS。
- [ ] 429/5xx/超时使用有上限退避，但仍由用户下一次手动同步触发，不在后台无限重试。

### 9.3 Guest → Cloud 可恢复复制协议

```text
POST   /api/cloud/v1/imports
GET    /api/cloud/v1/imports/:importId
PUT    /api/cloud/v1/imports/:importId/chunks/:chunkId
POST   /api/cloud/v1/imports/:importId/commit
DELETE /api/cloud/v1/imports/:importId
```

- [ ] 客户端先持久化 `operationId + manifestHash + chunk hashes`；`POST /imports` 对 `(accountId, operationId)` 唯一，重试返回同一 importId/targetClassId。
- [ ] chunk 上传按 chunkId/contentHash 幂等，服务端校验资源 registry、schemaVersion、scope 和总大小；状态为 `open|uploading|ready|committed|cancelled|expired`。
- [ ] commit 在单个 PG transaction 中创建可见 Class/Workspace/Resources/change log；未 commit 的 staging 数据对正常 class/sync API 不可见。
- [ ] 网络中断后客户端通过 GET 恢复缺失 chunk；commit 响应丢失时重试只返回既有结果，不生成第二个班级。
- [ ] cancel/过期清理 staging，不删除 guest 源；客户端只有收到 committed 且逐资源核对后才显示复制完成。

### 9.4 测试矩阵

离线 CRUD、重启保留、联网不自动 push、手动同步、重复/乱序/分页、stale generation、两设备冲突、tombstone、设备撤销、超限、部分 batch 成功、guest import 断点/重放/commit 响应丢失和服务端事务回滚。

Commit: `feat(sync): add explicit push pull and conflict workflow`。

---

## 10. Task 8：账户、班级与冲突 UI

**Files:**

- Create: `apps/web/src/account/{account-session-controller,remembered-account-store,login-dialog,account-switcher}.ts`
- Create: `apps/web/src/workspace/{class-switcher,class-manager,guest-copy-flow}.ts`
- Create: `apps/web/src/sync/{sync-panel,conflict-dialog}.ts`
- Modify: `apps/web/src/shared/ui/settings.js`（最终拆为 controller/views；禁止继续全局 cachedSettings）
- Modify: `apps/web/src/shared/styles/_settings.css`
- Test: `test/web/account-class-ui.test.ts`
- Test: `test/web/context-switch-race.test.ts`

### 10.1 交互要求

- [ ] 整个账户/班级切换先置于 `accountCloudProgram` feature flag；在所有当前可见用户数据 owner 已 workspace 化，或相应功能被明确关闭前，生产默认值必须为 false，防止旧全局数据跨账户串用。
- [ ] 启动默认允许“体验模式”，不强制登录墙阻断课堂。
- [ ] 设置页展示当前账户、活动班级、同步状态、账户卡片、添加账户、移除此设备、退出登录。
- [ ] 提供教师自助管理页：修改资料/头像/密码、查看并撤销登录设备、查看 AI 日/月用量与额度、查看班级废纸篓、申请删除或恢复云账户。
- [ ] “管理员网页”第一期指教师管理自己的账户和数据；平台级创建/禁用其他账户、强制重置密码只保留受角色保护的合同，未实现时不得显示可点击入口。
- [ ] 登录成功不强制选择班级；班级切换只在设置中进行。
- [ ] 账户卡片只存 accountId、展示名、头像缓存、最后使用时间和 token vault reference，不存 token。
- [ ] Electron 账户卡片可由 Main vault 无密码刷新切换；Web 卡片只有展示 metadata，切换必须重新输入凭据并替换唯一 HttpOnly cookie。分别写 Web/Electron 行为测试，UI 文案不得暗示 Web 已保存多个长期会话。
- [ ] 删除账户卡片文案明确“仅从此电脑移除”；云账户删除放到自助管理页并二次确认。
- [ ] Guest 班级复制 UI 必须消费可恢复 import 协议，展示资源清单、目标班级名、上传/断点/commit 状态和失败恢复；源数据不删除。
- [ ] 冲突对话框显示资源名、本地/云端修改摘要和三种可用动作；用户关闭时冲突保持 unresolved。
- [ ] 不使用不可信 innerHTML；危险确认只走 `appConfirm`；使用 `@xiaohuang/ui`。
- [ ] 切账户/班级时显示短暂 busy，禁止旧请求回写；失败恢复原 context。

### 10.2 无障碍与状态

- [ ] 键盘可完整操作、焦点返回、ARIA live 报告同步结果。
- [ ] 不用颜色单独表示 pending/conflict/error。
- [ ] 大量班级/账户卡片有稳定列表性能，不因切换重新挂载整个 Three.js/JSXGraph 壳层。

Commit: `feat(web): add account class and sync management UI`。

---

## 11. Task 9：14 类资源分 wave 接入

每类资源必须在 `resource-registry` 明确：Schema、scope、稳定 ID、schemaVersion、最大 payload、导入/导出、冲突策略、tombstone、迁移器和测试。未登记资源不得上传。

### Wave 1：基础设置与班级

- 教师设置
- 班级设置
- 学生名单（仅 displayName/order/enabled）

**重点修改：** `subject-settings` 普通设置、`apps/web/src/shared/ui/settings.js`、`apps/server/src/routes/chemistry/students.ts` 的兼容桥。禁止继续让化学和数学消费同一全局名单。

### Wave 2：课堂记录与进度

- 点名记录
- 教学进度
- 错题和掌握度

**重点修改：** chemistry rollcall/mastery/wrong-book、math classroom 对应 owner。记录类资源通常不可字段合并，冲突支持 duplicateLocal。

### Wave 3：自定义教学内容

- 化学自定义实验
- 化学自定义分子
- 化学自定义反应
- 数学题目
- 物理仿真配置

优先复用现有显式导入/导出和 Schema；内置 seed 不上传，只同步用户自定义差异。

### Wave 4：复杂文档与历史

- 数学函数画布（复用 `GraphDocumentV2`）
- AI 对话历史（分页、大小上限、可单独删除）
- 课堂草稿

画布以整份 document revision 为基本冲突单位，支持 duplicateLocal；不得对 JSXGraph runtime/DOM 做序列化。AI 历史不包含 provider key、Authorization、系统内部提示或敏感日志。

### 每个 wave 的固定步骤

- [ ] 先写 adapter 合同和失败测试。
- [ ] 旧本地数据迁移到 workspace-aware repository。
- [ ] 业务写 + outbox 原子化。
- [ ] 实现 import/export 与 guest→cloud copy。
- [ ] 实现 push/pull/conflict/tombstone。
- [ ] 运行 owner 最小测试、跨账户隔离测试、手动同步 E2E。
- [ ] 以 feature flag 单独启用；稳定后才开始下一 wave。
- [ ] 每个 wave 更新“未隔离功能清单”；只有清单归零（或未迁移功能在该 release 不可进入）时，Supervisor 才能开启总 `accountCloudProgram` flag。
- [ ] 每个资源/每个 wave 单独 commit，不接受“14 类一次性大提交”。

---

## 12. Task 10：云端 AI Provider、Key 与额度

**Files:**

- Create: `apps/cloud-server/src/ai/{provider-registry,credential-service,encryption,chat-service,usage-service,routes}.ts`
- Create: `apps/cloud-server/src/db/repositories/{ai-credential,ai-usage}.ts`
- Create: `apps/cloud-server/src/db/migrations/0030_ai_audit.sql`
- Modify: existing local AI settings/migration path
- Test: `apps/cloud-server/test/{ai-credential,ai-quota,ai-proxy}.test.ts`
- Test: `test/web/ai-key-absence.test.ts`

- [ ] 第一期只启用一个经过 allowlist 的 OpenAI-compatible provider 配置；一个账户一套 provider/model/key。
- [ ] Key 使用 AES-256-GCM envelope encryption：每条凭据生成随机 DEK 加密 Key，KEK 只负责包裹 DEK；DB 保存 ciphertext/nonce/tag/wrappedDek/keyVersion，KEK 只在服务器 secret 中，不进 DB/备份清单/日志。
- [ ] 建立 KEK version registry 和在线 rewrap 流程：轮换只重包裹 DEK，旧版本在全部凭据 rewrap 和恢复演练成功前不得销毁；每次轮换有审计、可暂停、可重跑。
- [ ] GET 只返回 metadata；修改/删除 Key 记录审计但不记录原文。
- [ ] AI 请求只经 Cloud Server；客户端、本地 SQLite、IndexedDB 和导出文件都不能出现 key。
- [ ] 现有 `provider-adapter` 的 retry/解析/脱敏能力应迁移或复用到生产路径，不能继续只在测试里存在。
- [ ] 按账户以 PostgreSQL transaction 原子扣减日/月额度；provider 失败是否计费必须固定规则。
- [ ] guest 公共 AI 由 feature flag 和独立平台额度控制，默认关闭；与教师自带 Key 用量完全隔离。
- [ ] 旧 `subjectSettings.ai.apiKey` 只允许在 HTTPS 下、经用户明确确认上传；成功后校验云端 metadata，再擦除本地明文。失败时不删源。
- [ ] Provider 超时/401/429/5xx 映射稳定错误码，不把上游响应正文原样回传。

Commit: `feat(cloud): add encrypted account AI provider and quota`。

---

## 13. Task 11：Electron 凭据边界、多账户与自动更新

**Files:**

- Create: `apps/desktop/src/preload.ts`
- Create: `apps/desktop/src/auth-vault.ts`
- Create: `apps/desktop/src/account-ipc.ts`
- Create: `apps/desktop/src/updater.ts`
- Modify: `apps/desktop/src/main.ts`
- Modify: `packages/contracts/src/ipc.ts`
- Modify: `electron-builder.yml`
- Test: `test/desktop/electron-account-vault.test.cjs`
- Test: `test/desktop/electron-updater.test.cjs`
- Test: `test/release/electron-packaged.test.cjs`

### 13.1 凭据

- [ ] 保持 `contextIsolation:true`、`nodeIntegration:false`、`sandbox:true`。
- [ ] Main 默认拒绝 `window.open`、非 allowlist 导航和权限请求；外链只能经显式校验后交给系统浏览器。Electron/Web 都配置 CSP，禁止任意远程脚本，降低 renderer 内存 access token 被 XSS 获取的风险。
- [ ] preload 只暴露 schema allowlist 的 `listSavedAccounts/login/removeAccount/refreshSession/logout` 等窄能力；禁止暴露 `storeRefreshToken/getRefreshToken`。
- [ ] Main 使用 `safeStorage`；不可用时默认拒绝“记住登录”，不得降级明文。
- [ ] Electron 的登录和 refresh HTTP 请求由 Main 发起：renderer 可提交登录表单，但响应中的 refresh token 直接进入 Main vault，renderer 只收到短期 access token 和账户 metadata。
- [ ] Cloud origin 由 Main 独占的受信配置读取，IPC payload 不允许携带 URL/baseUrl。packaged 模式只接受固定 `https:` origin 与 host allowlist；开发模式只额外允许显式 localhost。认证 fetch 使用 `redirect:'error'`，不跟随跨域重定向，不绕过证书错误，防止密码/refresh token 被导向恶意地址。
- [ ] 校验 IPC sender、payload、response；handler dispose 幂等；renderer 永远拿不到长期 token 原文。
- [ ] 远程撤销或本机移除后删除 vault entry，并清短期 access token。

### 13.2 自动更新

- [ ] 增加 `electron-updater`，仅 packaged Windows 启用。
- [ ] 使用 HTTPS generic feed 或经批准的 GitHub Releases；stable/beta 分离。
- [ ] 启动延迟检查；下载、安装前提示教师；上课中不强制重启。
- [ ] 安装前 flush 本地 repository、备份/checksum 用户数据；失败不删除旧版本或 userData。
- [ ] 明确回退能力边界：下载、签名/哈希校验或安装启动前失败时继续运行旧版本；安装已完成但新版本下一次无法启动时，`electron-updater`/NSIS 不具备天然自动回滚，必须保留 last-known-good 签名安装包和数据备份，提供人工 repair/rollback 指南。除非另行实现并目标机验证外部 watchdog/bootstrapper，否则不得宣称“启动失败自动回滚”。
- [ ] 正式发布前获取 Windows 代码签名；未签名包只能叫内部测试包。
- [ ] 修正 `electron-builder.yml` 中旧品牌：shortcut、NSIS/portable artifact、DMG title 全部统一“小黄的教室”。
- [ ] 增加版本/tag/更新 manifest/产物 checksum 合同。

### 13.3 目标机验收

Win10 与 Win11 都必须验证：首装、登录/体验模式、离线启动、多账户切换、旧数据迁移、覆盖升级、自动更新、下载/校验/安装前失败保留旧版本、安装后启动失败的 LKG 人工回退、卸载保留数据。

Commit: `feat(desktop): secure account vault and signed update flow`。

---

## 14. Task 12：Web 离线壳与运行时配置

**Files:**

- Create: `apps/web/public/runtime-config.example.json`
- Create: `apps/web/src/shared/runtime-config.ts`
- Create: `apps/web/src/offline/service-worker.ts`（或使用经批准的 Vite PWA 插件）
- Create: `apps/web/src/offline/offline-capability-registry.ts`
- Modify: `apps/web/vite.config.*`
- Test: `test/web/runtime-config.test.ts`
- Test: `test/web/offline-shell.test.ts`
- Test: `test/web/offline-features.test.ts`

- [ ] 缓存带 hash 的静态资源和最小 app shell；不得缓存 auth/AI/sync 私有响应。
- [ ] 现有 `apps/server` 不会部署给公网 Web；因此逐条消除 Web 对未认证本地 `/api/*` 的必需依赖：内置题库/课程/实验/分子/反应等改为随 Web 发布的版本化只读数据包或首次安装导入 IndexedDB，用户状态改走 workspace repository，可在浏览器执行的纯计算移入 packages/worker。
- [ ] Cloud AI 与 sync 是唯二允许离线不可用的类别；其他已进入 runtime manifest 的 Web 功能若仍需要网络 API，必须保持 feature flag 关闭，不能用“service worker 缓存了壳”冒充离线可用。
- [ ] 离线 capability registry 明确每个 subject/panel 的数据来源；新增 Web `/api` 消费但未登记时合同测试失败。
- [ ] 新版本 cache 原子切换；旧 cache 有上限清理；离线时可进入已缓存课堂。
- [ ] runtime config 只含 public cloud base URL、feature flags、release channel，不含 secret。
- [ ] Web 使用 HttpOnly cookie；access token 尽量只在内存。
- [ ] IP+HTTP 只做静态和 health smoke；真实登录在域名前通过 SSH tunnel 测试。
- [ ] 正式 Web 登录、头像、微信回调、更新 feed 必须等域名+HTTPS。
- [ ] 功能级离线测试必须在 Cloud Server 和本地 `apps/server` 都不可达时，逐个打开当前可进入学科与 panel，验证读写、重启恢复和导入导出；只验证首页加载不算通过。

Commit: `feat(web): add offline shell and runtime cloud configuration`。

---

## 15. Task 13：Docker、Nginx 与服务器部署

**Files:**

- Create: `apps/cloud-server/Dockerfile`
- Create: `deploy/compose.yml`
- Create: `deploy/compose.test.yml`
- Create: `deploy/env.example`
- Create: `deploy/nginx/xiaohuang.conf`
- Create: `deploy/scripts/{deploy,rollback,backup-postgres,restore-postgres,verify-release}.sh`
- Create: `docs/operations/{cloud-deployment,backup-restore,incident-runbook}.md`
- Test: `test/shared/deploy-contract.test.cjs`

### 15.1 生产拓扑

```text
公网 80/443
  -> Host Nginx
       /                 -> /opt/xiaohuang-classroom/current/web
       /api/cloud/v1/*   -> 127.0.0.1:3000 cloud-server container
       /livez,/readyz    -> cloud-server（外部只暴露必要摘要）
       /updates/windows/ -> versioned signed artifacts

Docker internal network
  cloud-server -> postgres:16
  postgres 无 host 5432 映射
```

- [ ] Cloud image 使用固定 Node LTS、多阶段构建、非 root 用户、只复制 production 产物。
- [ ] PostgreSQL 固定 major/minor 或 digest，禁止 `latest`。
- [ ] Cloud API 只映射 `127.0.0.1:3000:3000`；Postgres 只在内部 network。
- [ ] resource limit 适配 2C4G，至少为宿主保留 1GB；不引入 Kubernetes/Kafka/Redis。
- [ ] healthcheck 区分 live/ready；`restart: unless-stopped`；容器日志保持宿主已配置的轮转上限。
- [ ] `/opt/xiaohuang-classroom/secrets` 下的生产 env 为 `xiaohuang` 可读、mode 600；仓库只有 example。
- [ ] Web 产物发布到 `/opt/xiaohuang-classroom/releases/<git-sha>/web`，`current` 通过原子 symlink 切换。

### 15.2 首次部署到已准备服务器

服务器现状基线：Ubuntu 22.04、Docker 29.7.2、Compose 5.4.0、用户 `xiaohuang`、UFW/Fail2ban、生效端口 `22/80/443`、项目目录 `/opt/xiaohuang-classroom`。

执行：

1. 一次性宿主配置（安装 Nginx site、systemd timer、权限）使用 root 密钥登录；完成后做 `nginx -t`。日常 release、Compose 和 Web symlink 切换全部使用 `xiaohuang`，不得把私钥复制到服务器。
2. 上传 release manifest、compose、immutable image digest 和 Web artifact。
3. 在 root-only/owner-only secret 文件生成 DB password、token signing key、AI KEK；不输出到终端日志。
4. `docker compose config`；拉取镜像；启动 PostgreSQL。
5. 发布前 `pg_dump`（首次为空库也留证据）；执行 one-shot migrate container。
6. 启动 cloud server；验证 `/livez`、`/readyz`、DB schema version。
7. 日常发布只验证 root 已 provision 的固定 Nginx 路由和静态 health，不写 `/etc/nginx`、不 reload Nginx；需要改变路由时必须退出发布流程，另开一次受审计的 root provisioning 变更并先运行 `nginx -t`。
8. 域名前仅通过 SSH tunnel 执行真实 auth smoke；公网 IP 只跑无凭据 smoke。

Nginx 必须设置正确的 `Host/X-Forwarded-For/X-Forwarded-Proto`，限制 body size 和超时；Cloud Server 只信任明确的单层反向代理。常规发布只切换已有 `current` symlink，不要求部署用户获得任意 root/sudo 权限。
Nginx 同时下发经过兼容验证的 CSP、`nosniff`、Referrer-Policy、Permissions-Policy；HTTPS 上线并完成子域检查后再启用 HSTS。

**生产外部前置条件：** 用户需提供正式域名和 DNS 控制权；如京东云实例位于中国大陆且服务面向公网，先确认云厂商的 ICP 备案/接入要求。未具备域名、DNS、HTTPS 证书与必要备案前，只能算 staging，不得开放真实 Web 登录、微信回调、头像上传或自动更新 feed。

### 15.3 可回滚发布

- [ ] 每次部署记录 Git SHA、镜像 digest、schema version、备份 checksum、Web artifact checksum。
- [ ] 迁移前强制 backup；backup/迁移/ready 任一步失败则不切换 current/Nginx。
- [ ] 采用 expand/contract migration：先加兼容结构，下一版本再删旧结构。
- [ ] 应用回滚切回旧 digest/旧 Web；若 schema 不兼容，使用已演练的 restore，而不是盲目启动旧代码。
- [ ] 部署脚本支持 `--dry-run` 和幂等重跑；不得打印 secret。

Commit: `ops: add reproducible cloud deployment and rollback`。

---

## 16. Task 14：备份、恢复、审计与运维

### 16.1 备份策略

- [ ] 每日 `pg_dump --format=custom`，生成 SHA-256，并用 `pg_restore --list` 校验可读。
- [ ] 备份由受控 systemd service/timer 触发，脚本使用固定绝对路径、最小权限和互斥锁；失败必须告警且不得覆盖最近一份成功备份。
- [ ] 本机保留 7 日，异机/京东云对象存储保留至少 30 日；对象存储凭据独立保存。
- [ ] 头像/上传文件与数据库分别备份；AI KEK 不和 DB 备份放在同一位置。
- [ ] KEK 使用独立离线恢复密钥加密备份（例如受控 `age` recipient/硬件或云 KMS）；恢复私钥由用户离线保管，服务器和对象存储不能同时持有 DB 备份与明文 KEK。
- [ ] 每月恢复到临时 PostgreSQL，跑账户/班级/同步/AI metadata 校验后销毁临时库。
- [ ] 每月恢复演练必须在隔离环境恢复 DB + 指定 KEK version，解密一条专用 canary credential 并完成受控 provider mock 调用；只看到 metadata 不算 AI 凭据恢复成功。演练日志不得记录 canary 原文。
- [ ] 文档记录 RPO/RTO、恢复期间停写方式和可能丢失范围。

### 16.2 审计与隐私

- [ ] 审计登录、refresh reuse、设备撤销、AI Key 变更、班级删除恢复、冲突解决、账户删除。
- [ ] 审计不保存密码、token、AI Key、完整 AI 内容或敏感请求 body。
- [ ] requestId 从 Nginx/Cloud route/service/repository 贯穿。
- [ ] 为 30 天废纸篓清理、过期 session、审计保留和备份失败建立可重跑定时任务。
- [ ] 建立磁盘、Postgres、容器重启、5xx、登录失败、AI 额度和备份状态的最低限度监控。

### 16.3 故障演练

至少演练：Postgres 不可用、磁盘接近满、迁移失败、备份损坏、refresh token reuse、AI provider 超时、同步冲突暴增、错误发布回滚。

Commit: `ops: add backup restore audit and incident runbooks`。

---

## 17. Task 15：CI/CD、容器与发行门禁

**Files:**

- Modify: `.github/workflows/quality.yml`
- Modify: `.github/workflows/electron-package.yml`
- Create: `.github/workflows/container.yml`
- Create: `.github/workflows/release.yml`
- Create: `.github/workflows/deploy.yml`

- [ ] 所有 workflow 设置最小 permissions、concurrency 和 timeout。
- [ ] PR：quality、真实 PG integration、Compose config/build、容器 health、Electron unpacked matrix。
- [ ] main：构建 immutable SHA 镜像、SBOM、漏洞扫描、checksum；只推镜像，不自动生产部署。
- [ ] tag `vX.Y.Z`：校验根/desktop/cloud 版本一致，Windows runner 构建并签名 NSIS，生成 `latest.yml`/blockmap/SHA256/SBOM。
- [ ] release environment 需要人工批准；不可覆盖同版本产物。
- [ ] deploy workflow 使用 GitHub Environment Secrets；SSH host key 固定，不使用 `StrictHostKeyChecking=no`。
- [ ] 部署后跑 health、auth synthetic、class isolation、sync idempotency smoke；失败自动调用 rollback 并上传证据。
- [ ] 任何 workflow 不保存生产 env、私钥、token 或数据库 dump 为公开 artifact。

Commit: `ci: gate cloud containers deployment and desktop release`。

---

## 18. Task 16：最终测试与发布验收

### 18.1 自动化门禁

```bash
npm ci
npm run quality
npm run quality
npm run verify:electron-package
docker compose -f deploy/compose.yml config
docker compose -f deploy/compose.yml build --pull
```

干净检出必须重复执行；Turbo cache 不能作为唯一证据。

### 18.2 必测业务场景

1. 未登录创建本地班级和画布，重启/断网后仍存在。
2. 登录但不选班级，可使用 personal subject workspace。
3. 设置中切换班级，无需重新登录；化学/数学名单互不串用。
4. 设置中添加、切换、删除账户卡片；删除卡片不删除云账户和本地 guest 数据。
5. 将 guest 班级显式复制到云端，源数据保留；重复操作不产生重复云资源。
6. 断网修改并重启，outbox 保留；恢复网络不自动上传；点击同步后成功。
7. 两设备修改同一画布/设置，出现冲突；三种选择行为正确。
8. 删除班级后另一离线设备不能把它复活；30 天内可恢复。
9. 远程撤销设备后 refresh、sync、AI 均失败，但该设备本地课堂仍可离线打开。
10. AI 调用成功，客户端抓包、本地 DB/IndexedDB、日志和导出均无 Key 原文。
11. Web 离线壳可进入已缓存课堂；私有 API 响应不进 service-worker cache。
12. Windows 自动更新前保存数据，更新后数据/账户卡片/班级可用；下载/校验/安装前失败继续旧版本，安装后启动失败按 LKG 手册恢复，不虚报自动回滚。

### 18.3 安全验收

- 跨账户、跨班级、跨学科 IDOR 全部拒绝。
- CSRF、CORS、refresh reuse、brute force、body bomb、恶意文件上传、日志注入有测试。
- DB 只存 refresh hash；AI Key 为 ciphertext；响应/日志无 secret。
- 服务器公开监听只有 22/80/443；容器 API 为 loopback，5432 无 host mapping。
- 真实密码/Key 测试只在 SSH tunnel 或 HTTPS。

### 18.4 部署/恢复验收

- 在 `111.228.54.224` 记录 Git SHA、镜像 digest、schema、backup checksum、health 证据。
- 做一次真实 `pg_dump → 临时库 pg_restore → 校验`。
- 做一次坏镜像/坏 readiness 的自动回滚演练。
- 域名到位后配置 HTTPS、HSTS、Secure cookie，再开放真实 Web 登录和更新 feed。

---

## 19. Milestone 完成定义

| Milestone   | 必须达到                                                         |
| ----------- | ---------------------------------------------------------------- |
| M1 合同     | account/workspace/sync/AI schemas + sync-core 全绿               |
| M2 云基础   | Cloud Server + PG migrations + auth/device/tenant isolation 全绿 |
| M3 本地隔离 | guest/account/class/subject 本地数据不串用，outbox 持久化        |
| M4 手动同步 | push/pull/idempotency/conflict/tombstone E2E 全绿                |
| M5 全资源   | 14 类资源全部 registry 接入并逐 wave 验收                        |
| M6 AI       | Key 云端加密、额度、审计、客户端无原文                           |
| M7 客户端   | 多账户/班级 UI、Electron vault、Web 离线壳                       |
| M8 部署     | Compose/Nginx/backup/rollback 在真实 Ubuntu 通过                 |
| M9 发布     | Win10/11 签名安装与自动更新、生产恢复演练通过                    |

**整个项目不能因为“登录页能打开”“构建成功”或“Docker 容器 running”而宣布完成。只有 M1–M9 的行为、安全、离线、恢复和目标机证据全部具备，才能称为账户与云端体系完成。**

---

## 20. 给总控 Agent 的执行指令

1. 先阅读本计划和所有 AGENTS/owner 文档，输出当前 main SHA、现状差异和风险，不要立即改代码。
2. 为 Task 1–16 建立 tracker；任何 `[x]` 都要附 commit、命令与新鲜结果。
3. 先完成 Task 1–2 并冻结合同；冻结前不得让多 Agent 各自发明 Account/Class/Sync 结构。
4. 每个子 Agent 只拥有明确目录；公共入口由 Supervisor 收口。
5. 子 Agent 每次只交付一个可验证 commit；先红测、再实现、再最小门禁。
6. 每个 milestone 安排独立 code reviewer + security reviewer；问题必须修复并重新全量审查。
7. 任何真实部署前先备份；任何 secret 只放服务器/GitHub Environment，不贴到对话、日志或 commit。
8. 域名前仅通过 SSH tunnel 测真实登录；不要用公网 HTTP 发送凭据。
9. 不 push main、不发布、不改京东云安全组，除非用户在当轮明确授权。
10. 最终报告必须区分：源码测试、干净检出、容器、真实服务器、Windows 目标机、HTTPS/域名，禁止用低层证据代替高层验收。
