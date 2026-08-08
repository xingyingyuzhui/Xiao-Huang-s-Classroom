# 小黄的教室项目 Skill v2 设计

日期：2026-08-08  
状态：已获用户批准，进入实施

## 1. 背景

项目 skill `.grok/skills/xiaohuang-classroom/` 最初围绕多学科壳、Hub 书架、Web/Express/Electron 三层与少量共享包建立。项目此后落地了统一工程基座：TypeScript packages、subject manifest/FeatureLoader、函数画布领域文档与增量渲染器、Server migration/seed/API v2 基础设施、Electron staging/打包合同，以及 Turbo/Vitest/coverage/架构/资源/性能门禁。应用层仍处于迁移期，Server、Desktop 与部分 Web 模块尚未完全 TS 化或接入新合同。

现有 skill 的产品哲学和 Hub 视觉合同仍然有效，但工程地图、功能接入路径、测试与发布证据层级已经明显滞后。继续向少数 reference 堆叠内容会让入口臃肿，并使任何 Agent 都必须加载不相关知识。

## 2. 目标

新版 skill 是任何进入本仓库的 Agent 的统一项目操作系统，覆盖：

- 项目了解与只读审查；
- 产品、视觉、Hub、主题与转场；
- 新学科、classroom、feature 与生命周期；
- 数学函数画布、工具系统与性能；
- Server/API/设置/数据库/AI；
- Electron/stage/最终发布产物；
- 工程结构、质量门禁、测试与 Git 维护。

Skill 必须让 Agent 先找到真实 owning layer 和权威合同，再采取行动；不得让计划、历史报告或本机生成产物凌驾于代码与验证证据。

## 3. 非目标

- 不把完整源码 API 复制进 skill。
- 不把可由脚本机械检查的规则只写成文字。
- 不用 skill 代替根或子目录 `AGENTS.md`。
- 不把尚未完成的工程迁移描述成既成事实。
- 不要求每个任务加载全部 references。
- 不改变产品行为、工程代码或现有公开 API。

## 4. 指令优先级与事实证据

### 4.1 指令与规范优先级

1. 用户当前请求；
2. 当前目录适用的 `AGENTS.md`；
3. 已批准 spec 与 ADR；
4. 项目 skill 与 references；
5. 计划、进度报告和历史说明。

### 4.2 当前实现事实证据

判断“现在实现了什么”时，以真实代码、package scripts、自动化测试和新鲜构建/产物证据为准。`AGENTS.md` 的操作约束必须遵守，但其中的 workspace facts 若与代码冲突，应以代码和验证确认现状，同时报告并修正文档漂移。历史计划或完成报告不能单独证明当前状态。

## 5. 文件结构

```text
.grok/skills/xiaohuang-classroom/
├── SKILL.md
└── references/
    ├── architecture.md
    ├── product-philosophy.md
    ├── frontend-shell.md
    ├── hub-bookshelf.md
    ├── math-canvas.md
    ├── chemistry-features.md
    ├── server-data.md
    ├── desktop-release.md
    ├── engineering-quality.md
    ├── add-feature.md
    ├── debug-playbook.md
    └── maintenance.md
```

`SKILL.md` 是精简路由器，以低上下文成本为目标，不用固定行数鼓励填充。详细知识只存在于一个直接 reference 中，避免重复和深层引用。

## 6. 总入口职责

`SKILL.md` 只保留：

- 触发条件与项目定位；
- 进入仓库后的强制步骤；
- 指令优先级与事实证据规则；
- 任务到 reference 的路由表；
- 跨模块不变量；
- 四类统一工作流；
- 通用完成标准；
- skill 更新触发条件。

强制进入步骤：

1. 确认仓库根、当前分支与工作树。
2. 阅读根 `AGENTS.md`，再阅读目标子树的 `AGENTS.md`。
3. 按任务加载 1–3 个 references。
4. 声明所触及层及公开合同。
5. 识别用户数据、生成目录和外部边界。
6. 选择与风险相称的验证层级。

## 7. Reference 职责

### 7.1 `architecture.md`

只提供当前 monorepo 分层、apps→packages 依赖方向，以及 Web/Server/Desktop/packages/test/tooling/docs 的职责。workspace 与 package 由实际 `package.json` 和 workspace glob 动态发现，不把固定数量当长期事实。它不承载领域公开合同和实现细节。

### 7.2 `product-philosophy.md`

保留用户审美判断、精品视觉、主题完整性、交互与文案红线。只根据明确的新偏好更新。

### 7.3 `frontend-shell.md`

描述 app shell、subject manifest、catalog/registry adapter、classroom、FeatureLoader、session/error boundary、mount/show/hide/relayout/syncTheme/dispose 生命周期与 UI package 使用边界。明确区分 `packages/contracts` 的可序列化边界 manifest 与 `packages/subject-kit` 的运行时 manifest；当前 `apps/web/src/subjects/manifest.js` 只负责运行时 manifest 装配，可进入状态以它为准，不以旧 catalog 的 status 单独裁决。contracts 到 runtime 的转换/校验尚未生产接线，不得描述成完成态。

### 7.4 `hub-bookshelf.md`

保留书架模块地图、主题、封面、转场、模式状态机和视觉验证路径，并与最新代码结构同步。

### 7.5 `math-canvas.md`

作为跨层路由，记录函数画布的权威分层：可序列化 GraphDocument → reducer/store/history → runtime registry → incremental renderer。说明工具控制器、frame batching、失败恢复、主题/生命周期和 JSXGraph 仅为运行时渲染适配器。精确合同由 `apps/web/src/math/AGENTS.md` 唯一拥有，本 reference 不复制其细节。

### 7.6 `chemistry-features.md`

描述 chemistry feature 地图、配置驱动实验、化学状态唯一真值、状态与渲染分离、AI classroom/data/Server 边界和测试路由。精确子树规则仍由适用的 `AGENTS.md` 与代码拥有。

### 7.7 `server-data.md`

描述 API v1/v2、contracts Schema、稳定错误码、route/service/repository 方向、settings、migration、seed versioning、AI adapter、用户数据保护与 Server TS 产物边界；明确“已完成”和“尚未生产接线”的区别。

### 7.8 `desktop-release.md`

描述 Electron Main、启动状态机、安全设置、stage、manifest、Server TS 产物、最终 Resources 布局和 portable 退役门。明确三层证据：stage smoke；`electron-builder --dir` 的 packaged app/Resources；DMG、NSIS、portable 等平台发行物与目标机验收。最终发布结论只能来自第三层。

### 7.9 `engineering-quality.md`

只描述命令、测试归属和证据：Turbo workspace 任务图、TypeScript/tsup 双产物、lint baseline/format/架构/主题/资源/bundle/coverage 门禁、缓存风险、当前工作区与干净检出验证。明确 `git diff --check` 只检查空白错误，不证明工作树干净；fresh execution 必须显式绕过 Turbo cache。

### 7.10 `add-feature.md`

只保留新增新学科、classroom、数学工具、化学实验、主题、API、共享包与结构重构的步骤清单，并链接对应事实 owner，不重复领域规则。

### 7.11 `debug-playbook.md`

从症状路由到层：Hub/主题/转场、math canvas/store/renderer、Server/schema/DB、Electron/stage/package、Turbo/cache/coverage。要求先复现并确定证据层级。

### 7.12 `maintenance.md`

只描述 Git、脏工作树保护、用户数据、生成目录、提交边界、文档同步和 skill 更新触发条件。测试命令和发布证据由 `engineering-quality.md` 与 `desktop-release.md` 唯一拥有。

### 7.13 事实唯一 owner

| 事实 | 唯一 owner |
| --- | --- |
| 分层和依赖方向 | `architecture.md` |
| Shell、manifest、运行时生命周期 | `frontend-shell.md` |
| Hub 产品与视觉合同 | `hub-bookshelf.md`、`product-philosophy.md` |
| 数学画布跨层路由 | `math-canvas.md`；精确合同为 `apps/web/src/math/AGENTS.md` |
| 化学 feature 与状态边界 | `chemistry-features.md` |
| Server/API/DB | `server-data.md` |
| Electron 分层发布证据 | `desktop-release.md` |
| 质量命令与验证证据 | `engineering-quality.md` |
| Git、用户数据、生成物 | `maintenance.md` |
| 功能新增步骤 | `add-feature.md`，仅链接上述 owner |

## 8. 任务路由

总入口按用户意图加载 references：

| 任务 | 必读 | 追加 |
| --- | --- | --- |
| 项目了解/结构审查 | architecture | engineering-quality |
| Hub/视觉/主题/转场 | product-philosophy、hub-bookshelf | frontend-shell |
| 新学科/classroom/panel | add-feature、frontend-shell | 对应学科 AGENTS |
| 函数画布/数学工具/性能 | math-canvas | math AGENTS、engineering-quality |
| 化学实验/AI classroom | chemistry-features | server-data、engineering-quality |
| Server/API/设置/数据库 | server-data | architecture |
| Electron/stage/安装包 | desktop-release | server-data、engineering-quality |
| 工程结构/代码质量 | architecture、engineering-quality | maintenance |
| Bug/构建/测试失败 | debug-playbook | 对应领域 reference |
| Git/发布/交接 | maintenance | desktop-release |
| 修改项目 skill | maintenance | 所有受影响 reference |

## 9. 统一工作流

### 9.1 只读了解或审查

确认范围 → 排除生成目录/用户数据 → 读取代码/测试/构建 → 对照合同 → 给出证据、风险与未验证项。未经授权不写代码。

### 9.2 功能或重构

定位 owning layer → 确认公开合同和数据源 → 失败测试/复现 → 修改正确层 → 最小相关验证 → 全局门禁 → 工作树检查。结构重构默认保持行为。

### 9.3 视觉与交互

读取产品规则与参考 → 检查主题/响应式/动效/生命周期 → 实现 → 结构和单元测试 → 浏览器视觉交互验证。若用户明确排除浏览器，则使用 fake DOM/board/timer/RAF 与构建验证，并明确未完成真实视觉验收。

### 9.4 发布与工程验收

明确区分：源码门禁、当前工作区、干净检出、最终发布产物。stage smoke 不能替代 electron-builder 产物；Turbo cache 不能替代 fresh execution。

## 10. 新增和改动代码的不变量

- 新增依赖保持 `apps → packages` 单向，不为旧债扩散反向依赖。
- 新增或修改的外部边界通过 contracts Schema 校验。
- 领域状态不持久化 DOM、Canvas、JSXGraph、Three.js 或监听器对象。
- 可挂载模块遵守对称生命周期。
- 高频输入按帧合并。
- 新增或修改的失败路径使用稳定错误码，禁止静默 catch。
- 禁止裸 `export *`。
- 主题分支使用语义令牌。
- 用户数据与生成目录不是源码。
- 测试不得依赖未声明的本机残留、缓存或生成产物。
- 真实发布结论必须来自最终产物路径。

## 11. 防漂移机制

新增 `test/shared/xiaohuang-classroom-skill.test.cjs`，并由现有根测试入口执行。测试解析 frontmatter、Markdown 链接、workspace 配置和 package scripts，至少验证：

- SKILL frontmatter 只有合法字段，description 以 `Use when` 开始；
- 路由表引用的 reference 全部存在；
- 关键 references 可从 SKILL 直接发现；
- 从 workspace glob 与实际 `package.json` 动态枚举的 workspace/package 可在架构 reference 或路由中发现；
- 根 `AGENTS.md` 不硬编码 ready 学科列表，而是把可进入状态指向运行时 manifest；
- 根质量脚本与关键发布脚本在工程/发布 reference 中有对应入口；
- `math-canvas.md` 包含 GraphDocument 分层与 JSXGraph runtime 边界；
- skill 不把生成目录列为源码；
- 不保留已失效的“只有 subject-settings/math-expr 两个共享包”等描述。

机械测试还确认根 `AGENTS.md` 直接指向该 skill。它只守结构和可发现性，不用宽松字符串测试代替真实行为验证；同时运行 `quick_validate.py` 校验 frontmatter。

## 12. Skill 行为验证

按 RED→GREEN→REFACTOR 前向测试典型场景：

1. 新 Agent 审查 Electron 发布：能否区分 stage 与最终包。
2. 新 Agent修改函数画布工具：能否保护 GraphDocument 与 renderer 原子性。
3. 新 Agent新增学科：能否走 manifest/subject-kit 而非只改 catalog。
4. 新 Agent审查质量门禁：能否要求干净检出并识别 cache/生成物假绿。
5. 新 Agent做视觉任务：能否遵守产品哲学并在用户排除浏览器时准确限定验收结论。

五类任务使用固定任务文本，在由 `git archive` 建立且移除项目 skill 的干净临时检出中记录 baseline；GREEN 阶段使用另一份干净临时检出和新版 skill。每个 Agent 使用独立上下文，只接收任务和仓库，不提前泄露预期答案；每类至少运行一次，若结论不稳定则重复一次。

统一 rubric 每类 0–2 分：0 为遗漏关键边界或给出错误完成结论，1 为识别部分边界但缺少证据层级，2 为正确定位 owner、保护不变量并给出匹配风险的验证。每类 GREEN 必须达到 2 分，且不得低于 baseline；输出与评分摘要记录在实施计划的验证结果中。

## 13. 更新策略

以下事件必须同步更新 skill：

- 新 workspace/package 或依赖方向变化；
- subject/classroom 接入协议变化；
- GraphDocument/renderer/tool 生命周期变化；
- Server 外部边界或数据迁移变化；
- Electron stage/Resources/portable 流程变化；
- 根质量门禁和测试归属变化；
- 新的用户产品红线。

路径/包数量等机械事实优先由测试或生成脚本守护；skill 主要记录 Agent 无法从单个文件推断的边界、判断和工作流。

## 14. 验收标准

- 新 Agent 能从唯一入口选择正确 reference，不需加载全部文件。
- 产品哲学和 Hub 合同无回退。
- 工程地图与当前代码一致，不高报未完成迁移。
- 根 `AGENTS.md` 的可进入状态由运行时 manifest 导航，不保留“仅化学可进入”等易漂移列表。
- 五个前向场景中 Agent 能找到正确层、数据源和验证层级。
- 防漂移测试通过。
- `npm run quality` 不因 skill 变更回归。
- `git diff --check` 通过，工作树不包含生成目录或用户数据。
