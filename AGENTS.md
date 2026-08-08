# 小黄的教室

本仓库由「小黄的化学实验室」整仓迁移而来，当前以化学为第一个学科模块运行。

**Agent OS（架构 / 理念 / 排障 / 加功能）：** 项目 skill `.grok/skills/xiaohuang-classroom/`（`/xiaohuang-classroom`）。非琐碎改动先读该 skill 与对应 `references/*`。

后续任务（多学科切换壳、其它学科内容）在独立计划中展开。化学功能改动仍按原图层边界（browser / Express / Electron）处理。

**当前壳层：** 启动进入学科大厅；学科可进入状态以 `apps/web/src/subjects/manifest.js` 的 runtime manifest 为准，不在本文件硬编码 ready 列表。顶栏学科标签与设置中的「学科大厅」可返回大厅。设计见 `docs/superpowers/specs/2026-07-29-subject-hub-design.md`。

**Monorepo：** `apps/web`（Vite 前端）、`apps/server`（Express/SQLite）、`apps/desktop`（Electron）、`packages/*`（共享包，如 `subject-settings`）。

Treat `apps/server/data/`（及 `apps/server/src/data/`）as user data. Treat `apps/web/dist/`、`apps/server/public/`、`.electron-stage/`、`dist-electron/`、`dist-exe/`、and dependency folders as generated or runtime paths unless the task explicitly targets them. Do not include them in source changes. Install from the repo root (`npm install`); do not maintain a nested `apps/server/package-lock.json`.

**Tests：** `test/server`、`test/web`、`test/shared`；repo root helper at `test/helpers/repo-root.js`.

**Server layout：** shared routes under `apps/server/src/routes/`（如 `settings`、`ai`）；chemistry domain under `apps/server/src/routes/chemistry/` and `apps/server/src/services/chemistry/`（HTTP prefixes stay `/api/...` for compatibility）.

## Learned User Preferences

- Science hall should be full-bleed: no top subject TAB strip (keep only top-right settings); avoid leftover empty chrome where the tab bar was.
- Hub hero branding should read「小黄的教室」(not「科学」); do not put redundant corner brand/TAB chrome on the hall; hall background and brand typography must match each theme’s palette/style, personalized per theme, with no specular/glow highlights on the brand text.
- Clicking a subject book opens the simple intro page (not a direct classroom jump); classroom entry from the intro CTA uses a refined cover-dissolve transition with the book kept closed—do not also play 3D cover-open, page-flip, or dive; exit reverses the dissolve onto a closed book.
- Book covers must fully follow theme changes with carefully designed thematic elements (game-asset quality), not superficial text/color swaps; spines/side materials should match the cover art; modeling, collision, and brighter spotlight/specular feel matter; skip redundant OPEN badges.
- Hub bookshelf should stay close to the books reference: outward-fanning poses (not inward-top convergence) and similar book lighting; intro focus timing should match the reference (other books fully sink, then selected book rotates with ~0.1s lead and no long pause).
- Subject-book enterability follows `apps/web/src/subjects/manifest.js`; locked books may remain visible but must not be clickable.
- Prefer boutique visual fidelity for hub books, glass/liquid, and motion over early performance tuning; reject muddy/gray glass and prototype-looking UI.
- When a visual pass fails, research open-source references (GitHub repos/demos) before another thin iteration.
- Feature work after establishing main should land on branches rather than committing straight to main.
- Intro-page cursor floaters should be subject-specific (chemistry element symbols, math numerals, biology leaf-like, physics-themed)—not one shared leaf effect for all.
- Subject intro chrome: no center close X; secondary action labeled「返回大厅」; avoid generic「N 个模块」meta wording.

## Learned Workspace Facts

- Science-hall bookshelf UX is inspired by https://github.com/thebuggeddev/books (live demo https://books-sigma-ashen.vercel.app/); subjects map to distinct books; keep pose/lighting/intro-open choreography close to that reference.
- Theme cover art lives under `apps/web/public/assets/subject-covers/` as five ordered sets (v1–v5) mapped to the five app themes.
- App shell starts at the subject hub; current ready/locked state is owned by `apps/web/src/subjects/manifest.js`; hub design lives at `docs/superpowers/specs/2026-07-29-subject-hub-design.md`.
- Classroom enter/exit from the subject intro uses cover-dissolve (etch/particles sampled from cover art), not multi-page flip or stacked 3D cover-open.
- Chemistry lab work prioritizes a state-driven engine with chemistry logic separated from rendering; experiments should be configuration-driven rather than one-off page stacks.
- Chemistry web modules: feature packages under `apps/web/src/chemistry/{periodic-table,molecule,molar,electron,battle,ai-classroom,chem,shared}/`; classroom mount/partials under `apps/web/src/subjects/classrooms/`.
- Math web modules: `apps/web/src/math/{graph,plane,trig,sequence,solid,classroom,shared}/`; classroom shell `subjects/classrooms/math-classroom.js`. **Board theme/lifecycle contract:** `apps/web/src/math/AGENTS.md`（`math-theme.js` + `board-lifecycle.js`；换肤 `chem-theme-change`；禁止 border-soft 当网格）。**表达式：** `@xiaohuang/math-expr`（前后端共用，勿再复制白名单）。

## 统一工程体系（2026-08-07 迁移后）

**质量门禁（根脚本）：** `npm run quality`（test+build）为主入口；`lint`（新代码范围）+ `lint:all`（全仓 baseline 不增长）+ `lint:arch`（依赖方向）+ `lint:theme-tokens`（主题分支禁硬编码色）+ `lint:assets`（资源引用/封面/重复大文件）+ `budget`（bundle 预算）+ `format:check` + `typecheck`。CI（`.github/workflows/quality.yml`）按此顺序门禁。

**TypeScript 包矩阵（`packages/*`，tsup 双产物 + d.ts + strict）：**

| 包                               | 职责                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `config`                         | 共享 tsup/eslint 基座、`APP_VERSION`                                                                                            |
| `domain-core`                    | Result/AppError 稳定错误码/branded ID/Clock/IdAllocator/Disposable                                                              |
| `contracts`                      | Zod schema：API v2 响应/GraphDocumentV2/IPC allowlist/subject manifest/settings                                                 |
| `test-kit`                       | fake DOM/storage/clock/timer/RAF/fetch（组件与控制器测试）                                                                      |
| `design-tokens`                  | 语义令牌 × 五主题（由 tokens.css 生成值表，防漂移）                                                                             |
| `ui`                             | typed DOM 组件（button/icon/checkbox/number-input/tool-group/tabs/dialog/toast/stack/status/readout-card），`UiController` 合同 |
| `subject-kit`                    | SubjectManifest/ClassroomManifest/FeatureModule/MountableController + FeatureLoader                                             |
| `math-expr` / `subject-settings` | 已 TS 化，双产物                                                                                                                |

**架构纪律：** `apps → packages` 单向；Server 不导入 Web；禁止 `export *`（裸）；主题分支只声明语义变量不直接用色；所有外部边界（HTTP/localStorage/DB/IPC/AI 输出）经 Schema 校验；错误用 `domain-core` 稳定错误码（`VALIDATION_*`/`PERSISTENCE_*`/`AI_*`/`RENDERER_*` 等），禁止 catch 后静默。

**DB/发布：** migration 框架（`apps/server/src/db/migrator.js`，PRAGMA user_version + backup/restore 原子流程）；seed versioning（`seed-versioning.js` 幂等 upsert）；pkg 便携版为过渡产物（退役门 `docs/engineering/pkg-retirement-gate.md`，Electron portable 等价验收后删除）。API v2 规范响应 `{success,data|error,requestId}`（`/api/v2/...`），与 v1 复用同一 service。

**生命周期：** 可挂载模块实现对称合同（mount/show/hide/relayout/syncTheme/dispose）；disposer 逆序容错幂等；高频输入 frame 合并（`shared/frame-task.js`）。
