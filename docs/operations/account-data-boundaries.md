# 账户与同步数据边界

> Owner: Supervisor / Task 1 · 基线 SHA: `8de23d0`（`origin/main`）  
> 关联计划: `docs/superpowers/plans/2026-08-11-account-cloud-sync-deployment-program.md`

## 1. 六类数据分类

| 分类 | 含义 | 示例 | 默认存储 | 是否同步 |
|------|------|------|----------|----------|
| **devicePreference** | 与本机 UI/体验绑定，不随账户 | 主题 id、侧栏折叠、缩放、音效静音/音量、drawer 折叠 | `localStorage` 小键 | 否 |
| **accountSetting** | 账户级偏好，跨设备可同步 | 显示名、头像元数据、注册策略可见项 | 云端 + 本地 cache | 是（Wave 1 `teacher-settings`） |
| **personalSubjectWorkspace** | 已登录、未选班级时的学科工作区 | 个人函数画布、个人名单草稿 | IndexedDB `PersonalSubjectWorkspace(accountId,null,subjectId)` | 是 |
| **classSubjectWorkspace** | 班级 × 学科隔离容器 | 班级名单、班级画布、班级进度 | IndexedDB + 云端 workspace | 是 |
| **localOnly** | 仅本机、不上云或迁移前 legacy | Guest 默认数据、未 adapter 的 legacy 键 | IndexedDB / legacy localStorage | 否（迁移前） |
| **cloudSecret** | 永不出现在客户端 | AI Provider Key、refresh token hash、KEK | 云端加密表 / Main safeStorage | 客户端只见 metadata |

**铁律：** theme / zoom / sfx / drawer → `devicePreference`；AI Key → `cloudSecret`；名单、点名、进度、画布、题目、草稿 → workspace 数据。

## 2. 当前持久化键（localStorage / sessionStorage）

| 键 / 前缀 | Owner 模块 | 分类 | 目标 workspace | 迁移策略 | 同步 |
|-----------|------------|------|----------------|----------|------|
| `xh-theme-id` | `shared/ui/settings.js` | devicePreference | — | 保留 localStorage | 否 |
| `xh-subject-id`（`subjects/session.ts`） | 学科壳 | devicePreference → **must-migrate** | 并入 `WorkspaceContext.subjectId` | Task 5 改为 context 字段 | 否（显式字段） |
| `side-drawer:*` | `shared/ui/side-drawer.js` | devicePreference | — | 保留 | 否 |
| `chem-battle-hint-mode` | `chemistry/battle/hint-settings.js` | devicePreference | — | 保留 | 否 |
| `chem-battle-sfx-mute` / `chem-battle-sfx-vol` | `chemistry/battle/sfx.js` | devicePreference | — | 保留 | 否 |
| `chem-electron-order-v1`（legacy） | `chemistry/electron/list.js` | localOnly（已迁 DB） | — | 已一次性迁入 settings | 否 |
| `chem-lab-progress-v1` | `chemistry/ai-classroom/lab-model.js` | classSubjectWorkspace | chemistry / guest | Task 6 → IndexedDB workspace | Wave 2 |
| `chem-lab-session-v1` | lab-model sessionStorage | localOnly | — | 会话级，不 sync | 否 |
| `chem-balance-progress-v1` | `balance-model.js` | classSubjectWorkspace | chemistry | Task 6 | Wave 2 |
| `chem-balance-drawer` | balance/lab shell | devicePreference | — | 保留 | 否 |
| `balance-script-practice-*` | balance-shell | classSubjectWorkspace | chemistry | Task 6 per-script | Wave 2 |
| `xiaohuang:math:graph-document:v2` | `math/graph/graph-persistence.js` | classSubjectWorkspace / personal | math | Task 6 → GraphDocument adapter | Wave 4 |
| `xiaohuang:math:graph-document:v1` | 同上（legacy） | localOnly | math | 读时升级 v2 后删 v1 | Wave 4 |
| `math-graph-board-notes-v1` | `math/graph/graph-mount-controller.js` | classSubjectWorkspace | math | Task 6 | Wave 4 |

## 3. SQLite 表（`apps/server` 本地 BFF · sql.js）

> **不部署公网。** Electron / dev 本地离线 API。云端权威在 `apps/cloud-server` + PostgreSQL。

| 表 | 分类 | 目标 workspace | 迁移 / 同步 |
|----|------|----------------|-------------|
| `settings` | accountSetting + devicePreference 混合 | 拆分：主题留 device；其余 account/class | Wave 1 + must-migrate |
| `class_students` | classSubjectWorkspace | 按 class+subject roster | Wave 1 `student-roster` |
| `molecules` / `molecule_order` | classSubjectWorkspace（自定义） | chem custom | Wave 3 |
| `chem_reactions` | classSubjectWorkspace | chem custom | Wave 3 |
| `lab_experiments` | classSubjectWorkspace | chem custom labs | Wave 3 |
| `balance_scripts`（route 层） | classSubjectWorkspace | chem | Wave 3 |
| `lesson_packs` | classSubjectWorkspace | chem | Wave 3 |
| `quiz_sessions` / `quiz_items` / `quiz_wrong_book` | classSubjectWorkspace | chem 记录 | Wave 2 |
| `chem_tips` / `ai_*` 限流表 | localOnly / cloudSecret | tips 只读种子；限流 cloud | 部分 must-migrate |
| `app_meta` / `seed_versions` | localOnly | 引擎元数据 | 不同步 |

## 4. 导入 / 导出格式

| 格式 | Owner | 分类 | 说明 |
|------|-------|------|------|
| Graph JSON v2 | `math/graph` export | classSubjectWorkspace | `GraphDocumentV2` via contracts |
| Labs export pack | `/labs/export` | classSubjectWorkspace | guest→cloud 走 import 协议 |
| Balance scripts export | `/balance-scripts/export` | classSubjectWorkspace | 同上 |
| Lesson pack export | `/lesson-packs/:id/export` | classSubjectWorkspace | 同上 |
| Students import CSV/JSON | `/students/import` | classSubjectWorkspace | 迁移到 roster adapter |

## 5. 删除语义

| 操作 | 效果 |
|------|------|
| 删除设备账户卡片 | 仅移除本机 vault / cookie；不删云账户、不删 guest 数据 |
| 删除云账户 | `pending_deletion` + 30 天保留；撤销需 restore 限权会话 |
| 删除班级 | tombstone + 30 天废纸篓；pull 传播 tombstone |
| 清除 devicePreference | 不影响 workspace 数据 |

## 6. Guest 默认

未登录数据默认归属 `GuestWorkspace` → `guest/default/<subjectId>`（localOnly 直至显式「复制到云端」）。

## 7. 回答模板（每个现有数据必须能答）

1. **属于哪个账户/班级/学科？** → 见上表「目标 workspace」  
2. **保存在哪里？** → localStorage / IndexedDB / SQLite / 云端 PG  
3. **是否同步？** → 「同步」列 + `sync-resource-inventory.md`  
4. **如何迁移？** → Task 6 local repository + wave adapter  
5. **如何删除？** → §5 + threat model 审计
