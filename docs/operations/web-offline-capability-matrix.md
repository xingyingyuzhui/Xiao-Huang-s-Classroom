# Web 离线能力与 `/api` 依赖矩阵

> 生产 Web **不会**部署 `apps/server` 公网。本矩阵标记当前代码对本地 `/api/*` 的运行时依赖及迁移类别。

## API 分类定义

| 类别 | 含义 |
|------|------|
| **bundled-readonly** | 随 Web 发布的只读数据包或首次安装导入 IndexedDB |
| **local-repository** | 已 workspace 化的 IndexedDB repository（离线读写） |
| **cloud-only-ai** | 仅联网经 cloud-server 代理 |
| **cloud-sync** | 手动 push/pull |
| **must-migrate** | 仍依赖本地 server/SQLite 或 global cache，Task 12 前须迁移或 flag 关闭 |

## `/api` 端点清单（`apps/web/src/shared/api/client.js`）

| 前缀 / 端点 | 消费模块 | 类别 | 离线策略 |
|-------------|----------|------|----------|
| `GET/POST /molecules*` | molecule list/molar | must-migrate → Wave 3 | 内置种子 + IndexedDB |
| `GET/POST /reactions*` | molecule reactions | must-migrate → Wave 3 | 同上 |
| `GET/PUT /settings` | settings UI, electron list | must-migrate → Wave 1 | 拆分 device/account |
| `GET/POST /students*` | rollcall, math classroom | must-migrate → Wave 1 | workspace roster |
| `POST /ai/*` | AI 全模块 | cloud-only-ai | 离线不可用（允许） |
| `GET/POST /quiz/*` | quiz, wrong book | must-migrate → Wave 2 | |
| `GET/POST /offline-quiz/*` | offline quiz | bundled-readonly | 题库只读包 |
| `GET /mastery` | mastery map | must-migrate → Wave 2 | |
| `GET/POST /labs*` | lab classroom | must-migrate → Wave 3 | |
| `GET/POST /lesson-packs*` | lesson packs | must-migrate → Wave 3 | |
| `GET/POST /balance-scripts*` | balance classroom | must-migrate → Wave 3 | |
| `GET /api/v2/settings/subject-settings` | v2 settings | must-migrate → Wave 1 | |

## 学科 Panel 离线目标（Task 12 registry）

| Subject / Panel | 当前数据来源 | 目标 |
|-----------------|--------------|------|
| Hub / 学科大厅 | 静态 manifest | bundled-readonly ✓ |
| Math graph | localStorage graph doc | local-repository Wave 4 |
| Math classroom AI | `/ai/math` | cloud-only-ai |
| Chemistry molecule | `/molecules` | must-migrate |
| Chemistry AI classroom | labs + `/ai` | 混合 |
| Electron 全功能 | 本地 `apps/server` | 保持 BFF；不公网 |

## 合同测试要求

新增 Web `/api` 消费必须在本文件登记；`offline-capability-registry`（Task 12）与本文同步。

## Cloud 路径（未来）

| 前缀 | 类别 |
|------|------|
| `/api/cloud/v1/auth/*` | cloud-sync 前置 |
| `/api/cloud/v1/sync/*` | cloud-sync |
| `/api/cloud/v1/ai/*` | cloud-only-ai |

Base URL：`/runtime-config.json`（无 secret）。
