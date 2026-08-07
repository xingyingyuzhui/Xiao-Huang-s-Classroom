# 小黄的教室统一工程体系设计

**状态：** 独立审查通过，待所有者确认  
**日期：** 2026-08-07  
**路线：** TypeScript 优先的系统性工程重构（路线 2 增强版）

## 1. 背景

仓库已经具备可用的 monorepo、学科壳层、化学与数学功能包、Express/SQLite 服务端、Electron 壳、共享包和大量结构/行为测试。函数画布进一步形成了较成熟的 `Document → Store/History → Renderer → runtime` 单向架构。

当前问题不是“完全没有架构”，而是好做法主要停留在局部：不同模块对状态、生命周期、错误、主题、API、持久化、测试和性能使用不同约定；大部分约定依赖人工记忆和结构测试，缺少统一工具链与自动门禁。

本设计把这些局部经验提升为覆盖 Web、Server、Electron、Packages 和各学科模块的统一工程体系。

## 2. 已确认决策

1. 不采用最小修补路线。
2. 不采用 React 全面重写路线。
3. 保留 Vite、Express、Electron、Three.js、JSXGraph 和现有产品形态。
4. TypeScript 最终覆盖所有生产源码；迁移期间允许 JS/TS 短期并存。
5. 不让 React、Three.js 或 JSXGraph runtime 成为领域状态真值。
6. 建立正式 UI 资源库、设计令牌、学科接入协议和质量门禁。
7. 浏览器手工交互不作为工程迁移阶段的完成条件；优先使用自动化单元、合同、Fake runtime、构建和打包验证。
8. 大厅视觉、转场时序、课堂行为、现有用户数据和 `/api/...` 路径默认保持兼容。

## 3. 目标与非目标

### 3.1 目标

- 让所有模块有明确的所有权、公开接口和依赖方向。
- 让外部数据在进入核心逻辑前经过运行时校验。
- 让新学科和新课堂通过统一协议接入，而不是复制既有模块。
- 让 UI、主题、资源和交互状态可复用、可测试、可审查。
- 让 Web、Server、Electron 使用统一的类型、错误和发布合同。
- 让性能、安全、测试和架构约束进入自动化质量门禁。
- 让迁移按阶段交付，每个阶段都能回滚，不留下永久双轨。
- 让后续 agent 能依据文档和检查工具工作，不依赖隐含上下文。

### 3.2 非目标

- 不重新设计学科大厅视觉与产品流程。
- 不重写已经完成的函数画布领域架构。
- 不在工程迁移期间增加大量新的教学功能。
- 不为了统一而把全部状态放进一个全局 Store。
- 不把所有错误都转换为可忽略的 `Result`。
- 不在首轮引入云端遥测、账号系统或商业化基础设施。
- 不一次性替换 SQLite、Express、Vite 或 Electron。

## 4. 总体原则

### 4.1 单向依赖

```text
apps → packages
feature → subject/shared/platform
adapter → third-party runtime
UI intent → domain action → state → runtime projection → view
```

禁止：

- `packages/*` 反向导入 `apps/*`。
- Server 导入 Web 源码。
- 数学和化学互相深层导入。
- 领域模型依赖 DOM、Three.js、JSXGraph、Express 或 Electron。
- 通过 `export *` 建立可能产生歧义的公共兼容入口。
- 跨包深层导入未公开文件。

### 4.2 状态分层

```text
持久化领域状态：可序列化、可校验、可迁移
会话状态：当前学科、课堂、面板、活动工具
瞬态表现状态：hover、拖动预览、动画帧、runtime handle
```

每个模块必须声明：

- 状态来源。
- 是否持久化。
- 是否进入历史。
- 如何验证。
- 如何投影到 runtime。
- 如何销毁。
- 失败后如何恢复。

### 4.3 边界校验

所有不可信边界都必须执行 Schema 校验：

- HTTP request/response。
- localStorage 与导入文件。
- SQLite 读取结果。
- Electron IPC。
- AI 返回数据。
- 教学内容和 Seed 数据。

TypeScript 只负责静态正确性，不能代替运行时校验。

### 4.4 生命周期对称

所有可挂载模块采用对称合同：

```ts
interface MountableController {
  mount(): void | Promise<void>;
  show?(): void;
  hide?(): void;
  relayout?(): void;
  syncTheme?(): void;
  dispose(): void | Promise<void>;
}
```

注册监听器、定时器、动画帧、Observer、runtime object 和 pending request 的模块，必须在 `dispose()` 中释放对应资源。

## 5. 目标仓库结构

```text
apps/
  web/
    src/
      app/                 # boot、shell、session、错误边界、feature loader
      subjects/            # hub、catalog、classroom composition
      chemistry/           # 化学 feature packages
      math/                # 数学 feature packages
      biology/
      physics/
      shared/              # Web-only adapter、theme bridge、legacy bridge
  server/
    src/
      app/                 # server composition、config、shutdown
      routes/              # HTTP adapter
      services/            # application services
      domain/              # 纯业务规则
      repositories/        # 数据访问接口与 SQLite 实现
      db/                   # connection、migration、transaction
      seed/                 # versioned seed
  desktop/
    src/
      main/                # window、server process、updates
      preload/             # IPC allowlist
      shared/              # desktop-only contracts/adapters

packages/
  contracts/               # API、IPC、事件、持久化 Schema
  domain-core/             # Result、AppError、ID、Clock、serialization
  subject-kit/             # Subject/Classroom/Panel contracts
  ui/                      # typed DOM components/controllers
  design-tokens/           # semantic tokens and theme definitions
  math-expr/
  subject-settings/
  test-kit/                # fakes、fixtures、contract harness
  config/                  # tsconfig、eslint、stylelint、test config

tooling/
  architecture/            # dependency rules、public API checks
  performance/             # budget scripts、benchmarks
  release/                 # version、stage、package、artifact checks
```

## 6. 工程基座

### 6.1 Workspace 与任务图

- 保留 npm workspaces 和根 `package-lock.json`。
- 引入 Turborepo 管理 `build/test/typecheck/lint` 任务图与缓存。
- 每个 workspace 提供同名标准脚本；不存在的能力使用显式空配置，不允许脚本语义不一致。
- 根脚本成为唯一推荐入口。
- CI 与本地都调用同一根脚本，不维护两套命令。

### 6.2 TypeScript

新增共享配置：

- `tsconfig.base.json`
- `tsconfig.web.json`
- `tsconfig.node.json`
- `tsconfig.electron.json`
- package build config

最终要求：

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `noImplicitOverride: true`
- `useUnknownInCatchVariables: true`
- `noFallthroughCasesInSwitch: true`

迁移期间允许 `allowJs/checkJs`，但每个阶段必须缩小 JS allowlist；禁止永久关闭严格选项换取全绿。

### 6.3 模块格式

- Web 产物为 ESM。
- Server 的正式产物统一为 CJS，供独立 Node 进程和 Electron Main `require()`；源代码仍使用 TypeScript/ES import 语法。
- Electron Main/Preload 的正式产物统一为 CJS；Renderer 继续使用 Web ESM 产物。
- Packages 只有一份 TypeScript 源码，使用 `tsup` 生成 ESM、CJS 和类型声明。
- Web 由 Vite 构建；Server、Electron Main/Preload 和 Packages 统一使用 `tsup/esbuild` 工具链，`tsc --noEmit` 只负责类型检查。
- 禁止继续手工维护 `.js/.cjs` 双份逻辑。
- 包只通过 `exports` 暴露稳定入口。

### 6.4 Node 与旧 `pkg` 兼容窗口

- 目标工程以 Electron 内嵌 Node 的主版本作为 Server 最低运行基线；当前 Electron 33 对应的迁移基线固定为 Node 20 语言/运行目标。
- 本地开发可使用仓库声明范围内更高的 Node LTS/Current，但 CI 必须至少覆盖最低运行基线。
- 根目录新增 `.nvmrc`/`.node-version` 与 `package.json#engines`，禁止依赖开发机当前 Node 版本偶然可用。
- 当前 `pkg` Node 18 单文件 Windows 版定义为**过渡兼容产物**，不是目标工程体系的一部分；Electron `portable` 是其正式替代品。
- 在 Electron Windows portable 完成启动、用户数据导入、API、AI 设置和离线功能等价验收前，Server 编译产物保持 ES2022/Node 18 可执行子集，并保留 `pkg` smoke。
- 达到等价验收后，单独提交删除 `pkg`、`build:exe/pkg:win`、`isPkg` 分支和相关文档；随后把最低运行基线提升到 Node 20。
- 禁止复制或冻结一份独立 legacy Server 来长期维持 `pkg`。如果等价验收未完成，Node 20-only 代码不得进入 Server 生产路径。

### 6.5 代码规范

- ESLint Flat Config + typescript-eslint。
- Prettier 统一 JS/TS/JSON/Markdown 格式。
- Stylelint 检查 CSS、变量和层级。
- 依赖边界工具检查目录规则与循环依赖。
- Knip 检查未使用导出、文件和依赖。
- `lint` 不允许新增 warning；旧问题通过基线清单逐阶段清零。

## 7. 共享合同与领域核心

### 7.1 `packages/contracts`

职责：

- API request/response Schema。
- App event Schema。
- Persistence Schema 与版本号。
- Electron IPC Schema。
- Subject manifest Schema。
- Setting Schema。

使用 Zod 作为 TypeScript 类型和运行时 Schema 的共同来源。禁止在 Web 和 Server 分别维护重复接口类型。

### 7.2 `packages/domain-core`

提供：

- `Result<T, E>`。
- `AppError` 与稳定错误码。
- branded IDs。
- `Clock`、`IdAllocator`、`RandomSource` 注入接口。
- serializable clone/normalize helpers。
- cancellation 与 disposable 合同。

该包不得依赖 DOM、Node、Express、Electron、Three.js 或 JSXGraph。

### 7.3 错误模型

错误分类：

- `VALIDATION_*`
- `PERSISTENCE_*`
- `NETWORK_*`
- `DATABASE_*`
- `AI_*`
- `RENDERER_*`
- `LIFECYCLE_*`
- `IPC_*`
- `INTERNAL_*`

可恢复的业务失败返回 `Result`；违反不变量和编程错误抛出异常并交给错误边界。禁止 catch 后静默忽略。

## 8. UI 资源库与设计系统

### 8.1 技术形态

不引入 React。`packages/ui` 使用框架无关的 typed DOM factory/controller：

```ts
interface UiController<Props, Events> {
  element: HTMLElement;
  update(next: Partial<Props>): void;
  dispose(): void;
}
```

不默认使用 Shadow DOM，避免主题、现有 CSS、KaTeX、JSXGraph 和 Three.js 容器隔离问题。

### 8.2 组件层级

```text
primitives：Button/Input/Select/Checkbox/Slider/Icon
overlays：Dialog/Drawer/Popover/Tooltip/Toast
layout：Stack/Grid/Toolbar/Panel/Card/Tabs
feedback：Loading/Empty/Error/Progress
domain UI：PropertyEditor/ToolGroup/NumberInput/StylePicker
classroom UI：ClassroomHeader/PanelHost/ReadoutCard
```

组件必须支持：

- 五主题。
- 键盘与焦点管理。
- disabled/loading/error 状态。
- 小屏和触控尺寸。
- 统一 mount/update/dispose。
- 文本安全输出，不使用不可信 `innerHTML`。

### 8.3 设计令牌

`packages/design-tokens` 维护语义令牌：

- color、surface、border、text、accent、danger、success。
- spacing、radius、shadow、z-index。
- typography。
- motion duration/easing。
- control size、touch target。
- canvas grid/axis/object palette。

五主题覆盖语义值，不允许 feature 直接按主题 id 写业务分支。现有 `chem-theme-change` 通过兼容桥保留，新的内部事件使用中性命名。

### 8.4 组件展示页

增加开发态 UI catalog，展示：

- 全组件状态矩阵。
- 五主题对照。
- 响应式尺寸。
- 焦点与键盘状态。
- 长文本和错误状态。

它不是产品页面，不进入正式导航和用户包体主路径。

## 9. 前端应用内核

### 9.1 App session

建立轻量、可测试的应用会话状态：

- 当前 surface：hub/intro/classroom。
- 当前 subjectId。
- 当前 panelId。
- transition state。
- global dialog/drawer 状态。

不把学科领域状态放进 app session。

### 9.2 Feature loader

统一动态模块协议：

```ts
type FeatureModule = {
  preload?: () => Promise<void>;
  mount: (context: FeatureContext) => Promise<MountableController>;
};
```

loader 负责：

- 去重并发加载。
- 取消过时请求。
- loading/error/retry。
- mount generation 防止旧异步结果回写。
- dispose 前一实例。
- 性能计时。

### 9.3 错误边界

按层设置：

- App boot boundary。
- Subject classroom boundary。
- Feature panel boundary。
- Renderer fatal boundary。

一个面板失败不能导致整个大厅或其他课堂失效；涉及文档一致性的 renderer fatal 则进入明确只读状态。

## 10. 学科平台 `subject-kit`

### 10.1 Subject manifest

```ts
interface SubjectManifest {
  id: SubjectId;
  status: 'ready' | 'preview' | 'locked';
  intro: SubjectIntro;
  cover: SubjectCoverSet;
  classroom: ClassroomManifest;
}
```

### 10.2 Classroom manifest

定义：

- 默认面板。
- 面板 catalog。
- lazy loader。
- 设置项。
- 资源预加载提示。
- 主题能力。
- 课堂 mount/dispose 合同。
- 数据兼容版本。

### 10.3 迁移策略

1. 先用适配器包装当前 `catalog.js` 与 classroom registry。
2. 化学 classroom 接入 manifest，不改 feature 内部行为。
3. 数学 classroom 接入 manifest，保留函数画布合同。
4. 物理/生物 placeholder 使用同一协议。
5. 删除旧的重复 tab/catalog glue。

## 11. 服务端与数据体系

### 11.1 分层

```text
Route adapter
  → request schema
  → application service
  → domain policy
  → repository interface
  → SQLite repository
```

Route 只负责 HTTP；Service 不依赖 Express；Repository 不返回未经规范化的数据库行。

### 11.2 API 合同

现有 `/api/...` 定义为兼容 API v1；其 URL、状态码和已有响应字段在本工程计划内保持兼容，并为每个端点建立真实合同测试。v1 Route adapter 调用新的 application service，但负责把内部 `Result` 转换为旧响应形状。

新的规范化 API 使用 `/api/v2/...`，统一响应：

```ts
type ApiResponse<T> =
  | { success: true; data: T; requestId: string }
  | { success: false; error: ApiErrorPayload; requestId: string };
```

- Web API client 按 feature 迁移到 `/api/v2/...`；同一个 feature 的请求、响应 Schema、Server route、client 和测试必须在同一 Task 完成。
- v1 与 v2 复用同一 application service/repository，禁止复制业务逻辑。
- 本计划**不删除**公开 v1 adapter。删除 v1 必须在后续独立 breaking-release 计划中进行，并满足：所有一方客户端已迁移、Electron/便携历史版本支持策略明确、发布说明与数据兼容评估完成。
- “清理 legacy adapter”仅指项目内部临时 JS/TS、catalog、theme、module-entry adapter，不包含明确作为公开兼容面的 API v1 adapter。
- 新端点只进入 v2；v1 不再扩展新的业务能力。

### 11.3 数据库迁移

- 建立 schema version table。
- 每个 migration 具有稳定编号、up 操作、precondition、postcondition 和兼容级别。
- 项目工程迁移期默认使用 expand/migrate/contract：先加表/列，再回填和切换读写；破坏性删除至少延后一个正式发布周期。
- 旧应用必须能读取 expand 阶段升级后的数据库；不能满足时，该 migration 不得进入本计划。
- 数据迁移前，在实际 live DB 同目录创建带原 schema 版本、时间戳和 checksum 的可恢复备份。
- 启动时若数据库版本高于应用支持的最大版本，应用只读失败并提示升级，禁止尝试降级或写入。
- 回滚应用时优先依靠 expand 阶段的向后可读性；若 migration 标记为不可向后读，则必须在启动旧版本前通过受测 restore 命令恢复对应 pre-migration backup。
- restore 使用“复制到临时文件 → 完整性校验 → 原子 rename”流程，失败时保留原 DB 与备份，不做原地覆盖。
- 每次迁移必须测试 Web/Node 开发数据目录、Electron `userData/data`、旧 `pkg` 邻近 `data` 三类已存在用户位置的发现与迁移；`apps/server/src/data` 仅作为历史路径识别，不作为新写入目标。
- 发生 rollback 时，备份之后产生的新数据是否会丢失必须在命令输出和发布说明中明确；禁止声称无法证明的无损回滚。
- Migration 与 Seed 分离。
- Seed 使用内容版本和幂等 upsert。
- 数据库初始化、迁移、Seed 和启动分成独立阶段。
- 禁止把用户 DB 作为测试夹具直接改写。

### 11.4 AI 服务

统一：

- provider adapter。
- timeout/cancellation。
- retry policy。
- rate limit。
- response schema parse。
- redacted logging。
- fallback 与错误映射。

AI 输出始终视为不可信输入。

## 12. Electron 体系

### 12.1 进程边界

- Main 管理窗口、内嵌 Server、生命周期和更新。
- Preload 只暴露带 Schema 的 IPC allowlist。
- Renderer 不获得任意 Node 权限。
- Web 产品代码不直接依赖 Electron 全局变量。

### 12.2 启动状态机

```text
idle → staging → serverStarting → ready → closing → closed
                      └→ failed
```

要求：

- 并发启动幂等。
- Server readiness 使用健康检查，不依赖固定延时。
- 端口和数据目录显式传递。
- 关闭时等待数据库与 Server 清理。
- 启动失败提供可诊断错误，不留下后台进程。

### 12.3 发布

- Web、Server、Desktop 使用同一应用版本。
- Stage manifest 记录文件、hash、版本和构建时间。
- 打包前验证产物完整性。
- macOS/Windows 构建分别验证。
- 发布产物附带 checksum 与迁移说明。
- 失败升级保留可恢复的数据备份。
- Windows `pkg` 便携版在兼容窗口内继续产出并做 smoke；Electron portable 完成等价验收后由独立提交替代和删除，不能让两个便携发行渠道永久并存。

## 13. 测试体系

### 13.1 分层

1. 纯函数与 Schema 单元测试。
2. Store、Reducer、History、Migration 测试。
3. UI controller + Fake DOM 测试。
4. Three.js/JSXGraph adapter + fake runtime 测试。
5. API contract 与 Server integration 测试。
6. SQLite migration 与数据完整性测试。
7. Electron staging/startup/package smoke。
8. 少量关键产品路径自动化 smoke；不要求人工浏览器验收作为工程迁移门禁。

### 13.2 测试工具

- Vitest 成为 TypeScript 单元与组件测试主入口。
- 现有 `node:test` 套件在迁移前持续执行。
- 测试迁移按目录完成，每个目录完成后删除对应旧 runner 重复用例。
- `packages/test-kit` 提供 Fake DOM、Board、Storage、Clock、Timer、RAF、Fetch、Repository、IPC。
- 合同测试必须调用真实公开接口，避免只正则匹配源码。

### 13.3 覆盖率

不以全仓单一百分比掩盖高风险模块。分别设置：

- domain/contracts：高分支覆盖率。
- Store/migrations/server service：高语句与分支覆盖率。
- runtime adapter：关键失败路径覆盖。
- 视觉几何与静态资源：结构/快照/不变量检查。

阈值先记录当前基线，再逐阶段提升；任何已达标目录不得回退。

## 14. 性能工程

### 14.1 指标

- Web 初始 JS/CSS 与关键 chunk 大小。
- Hub 初始化、首个可交互时间。
- Classroom/Panel 首次与再次切换耗时。
- Graph 参数高频更新 frame cost。
- Three.js/JSXGraph 对象与监听器释放。
- API p50/p95、数据库查询时间。
- Electron 冷启动与安装包大小。

### 14.2 方法

- 动态 feature 分包。
- 避免同模块静态/动态重复导入。
- 高频状态按帧合并。
- 根据 diff flags 更新 UI。
- 请求取消、去重和短期缓存。
- 大型纯计算评估 Worker。
- 资产按学科和主题登记、预加载和按需加载。
- 性能预算进入 CI；预算变更必须写明理由。

JSXGraph 的 `eval` 警告作为第三方依赖风险登记，不通过屏蔽 warning 伪装解决；单独评估 CSP、版本和替代方案。

## 15. 安全与隐私

- 所有不可信文本通过 DOM API 输出。
- 样式值使用 allowlist 或语义 token。
- API 限制 body、timeout 和并发。
- Server 安全 header 和 CORS 有自动合同测试。
- AI Key、路径和用户内容日志脱敏。
- Electron 开启 context isolation，IPC allowlist。
- 依赖漏洞、许可证和过期版本进入定期检查。
- 不默认上传使用遥测；本地诊断信息由用户主动导出。

## 16. 可观测性与诊断

统一结构化日志字段：

- timestamp、level、scope。
- requestId/sessionId。
- subjectId/featureId。
- errorCode。
- durationMs。
- appVersion/buildVersion。

浏览器、Server 和 Electron 使用同一错误码，但各自 adapter 输出。生产日志禁止包含 API Key、完整 AI prompt、用户数据库内容和本机敏感路径。

提供本地诊断导出：版本、平台、健康状态、最近脱敏错误和构建信息。

## 17. 资源管理

建立资源清单：

- asset id。
- owner subject/feature。
- theme variants。
- source/license。
- dimensions/format/hash。
- preload policy。
- fallback。

主题封面、背景、图标、音频和 3D 资源不再通过散落字符串引用。构建检查缺失资源、孤儿资源、重复大文件和错误主题映射。

## 18. CI、分支与发布门禁

### 18.1 Pull request 门禁

```text
format check
→ lint/stylelint
→ typecheck
→ architecture check
→ unit/contract tests
→ server integration
→ web build
→ electron stage smoke
→ bundle/performance budget
→ dependency/security scan
```

### 18.2 提交纪律

- 每个迁移 Task 独立提交。
- 同一提交内完成新合同、调用方、测试和旧代码删除。
- 不提交 dist、用户 DB、Electron stage 或嵌套 lockfile。
- 不用一次全仓自动格式化掩盖逻辑改动。
- 每个工作流具有明确 rollback point。

## 19. 文档和 Agent 工程合同

文档分层：

- 根 `AGENTS.md`：短、稳定、操作性红线。
- 项目 skill：完整架构、排障和维护 OS。
- `docs/superpowers/specs/`：设计决策与不变量。
- `docs/superpowers/plans/`：可执行任务、测试与提交边界。
- 包级 `AGENTS.md`：公开 API、依赖和生命周期。
- ADR：重大工具与架构取舍。

架构发生变化时，同一提交必须更新对应合同；CI 检查关键文档是否存在与链接有效。

## 20. 迁移工作流与顺序

### Program 0：基线冻结

- 记录当前测试、构建、bundle、文件规模和依赖图。
- 建立行为兼容清单和用户数据备份策略。
- 记录允许暂存的旧债，不允许无界增长。

### Program 1：工程基座

- workspace 脚本、TypeScript config、lint/format/stylelint。
- Turborepo task graph。
- CI 和架构门禁。
- 固定 Node/模块/构建产物矩阵，并为过渡期 `pkg` 增加 smoke 与退役门。

### Program 2：共享合同

- contracts/domain-core/config/test-kit。
- 迁移现有 math-expr 和 subject-settings。
- 建立 API、事件、错误和 persistence schema。

### Program 3：UI 与设计系统

- token inventory。
- UI primitives、overlay、layout、feedback。
- 五主题迁移和 legacy CSS 收口。
- UI catalog。

### Program 4：前端内核与 subject-kit

- app session、feature loader、error boundary。
- subject/classroom/panel manifest。
- 化学、数学、物理、生物逐步接入。

### Program 5：服务端与数据

- TypeScript server composition。
- route/service/repository 分层。
- shared API schema。
- database migration、seed versioning、AI adapter。

### Program 6：Electron 与发布

- TS main/preload、IPC schema、startup state machine。
- stage manifest、版本、package smoke。
- Electron Windows portable 与旧 `pkg` 的功能/数据等价验收；满足后删除 `pkg`，提升 Server 最低 Node 基线。

### Program 7：质量与性能收口

- 测试 runner 迁移。
- 覆盖率提升。
- bundle/runtime/API/Electron budgets。
- 安全、诊断、文档和旧架构清理。

## 21. 迁移兼容和回滚

每项数据或接口迁移必须具备：

1. 旧格式读取器。
2. 新格式写入器。
3. 迁移校验。
4. 失败不发布 candidate。
5. 原数据备份或恢复路径。
6. 兼容桥删除条件。

每项模块迁移必须具备：

1. 旧行为合同测试。
2. 新公开入口。
3. 旧入口 adapter。
4. 全部消费方迁移证明。
5. adapter 删除提交。

禁止无限期保留“以后再删”的 legacy layer。

## 22. 风险与控制

| 风险 | 控制 |
|---|---|
| JS/TS 双轨长期存在 | 每阶段设 JS allowlist 和删除条件 |
| 工具过多拖慢开发 | 根 `quality` 统一入口，Turbo 缓存，分层执行 |
| UI 库成为另一套重复样式 | 先 token inventory，再迁移真实组件，禁止空壳组件 |
| 类型化但运行时仍不安全 | 所有外部边界强制 Schema parse |
| React 缺失导致组件复用不足 | typed DOM/controller + catalog + 生命周期合同 |
| 画布性能因 UI 统一退化 | runtime adapter 隔离，高频路径不经过通用 DOM diff |
| Electron 打包在迁移后失效 | 每个 Server/Desktop 阶段运行 stage/package smoke |
| 数据迁移损坏用户数据 | versioned migration、备份、原子发布、恢复测试 |
| 结构重构影响大厅视觉 | 保留行为合同和原公开 API，视觉变更不混入迁移 |

## 23. 完成定义

只有同时满足以下条件，才能称为“形成完整、统一的工程体系”：

- 生产源码完成 TypeScript 迁移，JS allowlist 清零或只剩明确第三方桥。
- 所有 workspace 通过统一 `quality`。
- CI 阻止类型、格式、架构、测试、构建、性能和安全回退。
- API、IPC、持久化、AI 数据都有共享运行时 Schema。
- 新学科通过 subject-kit 接入，不复制课堂壳。
- UI 使用统一组件和语义令牌，五主题不依赖散落业务判断。
- Server route/service/repository 分层完成。
- SQLite migration 与 seed versioning 可验证、可恢复。
- Electron 启动、关闭、IPC、stage 和打包都有自动检查。
- 复杂 runtime 都有明确 adapter 和 lifecycle dispose。
- 现有用户数据、API 路径、大厅流程和函数画布合同保持兼容。
- 内部临时 Legacy adapter、重复源码、死导出和临时配置完成清理；公开 API v1 adapter 按版本兼容政策保留。
- 架构、包边界、排障和新增学科流程已进入项目 skill 与文档。

## 24. 后续实施计划要求

正式实施计划必须：

- 作为一个可交付其他 agent 的单独 `.md` 文件。
- 按 Program 和 Task 编号，使用 checkbox。
- 每个 Task 列出精确文件、先写的失败测试、实现步骤、验证命令、验收标准和提交信息。
- 标明可并行任务与禁止并行修改的冲突区。
- 标明兼容桥的创建和删除 Task，防止只加不删。
- 标明每个 Program 的 rollback point 和全仓验收。
- 不把浏览器手工交互作为工程迁移完成门槛。
- 不允许 agent 修改生成目录、用户数据或嵌套 lockfile。
