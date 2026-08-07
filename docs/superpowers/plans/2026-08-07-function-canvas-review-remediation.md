# 函数画布工程审查问题修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复当前函数画布在安全输入、GraphDocument 单一真值、原子运行时投影、依赖刷新、历史失败语义、ID 分配、生命周期和高频渲染方面的缺口，使现有功能真正满足可保存、可撤销、可恢复、可扩展的工程合同。

**Architecture:** 保持 `GraphDocument → pure reducer/store/history → render plan → runtime registry/layers → JSXGraph` 单向数据流。任何持久修改必须先形成经过规范化和引用校验的 candidate；renderer 在发布前完成可回滚投影，失败时恢复完整 previous runtime，Store、History 和 Persistence 不得观察到失败 candidate。

**Tech Stack:** Vite、Vanilla JavaScript ES modules、JSXGraph、`@xiaohuang/math-expr`、Node `node:test`、fake board/DOM/storage/timer；不新增状态管理框架，不更换 JSXGraph，不以浏览器手工交互或浏览器 E2E 作为本计划验收门。

---

## 0. 执行说明

本计划是 `docs/superpowers/plans/2026-08-02-function-canvas-comprehensive.md` 的审查修复补丁计划，不是新的产品功能路线。先完成本计划，再继续分段函数、函数不等式、课堂场景或图片导出。

实现 Agent 开始前必须完整阅读：

- `AGENTS.md`
- `apps/web/src/math/AGENTS.md`
- `.grok/skills/xiaohuang-classroom/SKILL.md`
- `.grok/skills/xiaohuang-classroom/references/architecture.md`
- `.grok/skills/xiaohuang-classroom/references/maintenance.md`
- `docs/superpowers/plans/2026-08-02-function-canvas-comprehensive.md`
- 本文档

必须使用：

- `/xiaohuang-classroom`：确认 feature/shared 层边界。
- `superpowers:test-driven-development`：每个修复先写会失败的测试。
- `superpowers:verification-before-completion`：最终结论必须以新鲜测试和构建结果为依据。

实施纪律：

1. 在独立 `codex/` 前缀分支或独立 worktree 执行；当前工作树存在未提交改动时，先确认改动归属，禁止覆盖或回退他人文件。
2. 每个 Task 单独提交；只 stage 该 Task 明确列出的文件。
3. 不修改 `apps/web/dist/`、`apps/server/public/`、`apps/server/data/`、`apps/server/src/data/`、`.electron-stage/`、`dist-electron/`、`dist-exe/` 或依赖目录。
4. 不直接修改 JSXGraph 源码，不通过关掉 warning 掩盖 JSXGraph `eval`。
5. `graph/draw-tools.js` 必须继续使用显式具名导出，禁止恢复 `export *`。
6. 不做浏览器手工交互或浏览器 E2E；DOM、board、storage、timer、frame、listener 必须通过注入和 fake 自动测试。
7. 不把失败修复写成“catch 后忽略”。恢复失败必须进入明确错误状态，不能继续接受修改。
8. 不在修复过程中增加新的学习工具或视觉功能。

权威执行顺序：

```text
Task 1 安全输出和文档不变量
  → Task 2 ID 与加载一致性
  → Task 3 Store/History 失败语义
  → Task 4 原子 runtime renderer
  → Task 5 点和样式统一入 Store
  → Task 6 完整依赖闭包与特征刷新
  → Task 7 高频性能收口
  → Task 8 生命周期与 index 拆分
  → Task 9 最终验证
```

Task 4–6 不得并行修改同一 renderer/layer 接线。Task 1–3 完成并验证后才能开始 Task 4。

---

## 1. 当前基线与已确认问题

计划编写时的工作树基线：

- `apps/web/src/math/graph/index.js`：约 2,195 行。
- 当前改动约 22 个 tracked files，另有原全面计划文档。
- 数学测试：252/252 PASS。
- 全仓测试：433/433 PASS。
- Vite production build：PASS。
- `git diff --check`：PASS。
- 构建仍有既有 JSXGraph `eval`、静态/动态重复导入和 `mathviz` 大 chunk warning；它们不是本计划的完成阻塞，但不得新增 warning 类型。

测试全绿仍存在以下已确认缺口：

1. `function-list-view.js` 把函数名称直接插入 `innerHTML` 属性，函数颜色未经 CSS value 校验进入 `style`，导入 JSON 可形成持久化 HTML/CSS 注入。
2. live `beforeCommit` 使用 `createGraphRuntimeSyncAdapter` 顺序修改旧 runtime；中途异常时 Store 拒绝 candidate，但 JSXGraph/runtime 可能已经半更新。
3. 测试中的 `applyFunctionPlan` 没有接入生产路径；其 remove rollback 还会把已经 dispose 的 handle 重新放回 registry。
4. 点的跟随、坐标标签和对象样式仍有 runtime-only 修改，不进入 GraphDocument，无法可靠撤销、保存、重载。
5. `PointLayer.update()` 不处理 constraint kind/target 变化，历史恢复无法把 free point、glider、feature-follow、intersection 正确互换。
6. 函数参数变化只刷新直接引用函数的构造，遗漏 `function → constrained point → construction` 的间接依赖链。
7. 活动函数参数变化不会刷新特征点和渐近线；当前仅对显隐 patch 或活动函数切换刷新。
8. 从文档加载后未根据现有 id 推进 `fnSeq/pointSeq/constrSeq`，新对象可能与已加载对象重名并留下文档外 runtime 对象。
9. `function/reorder` 接受重复 id 排列；update action 可写入非法 id/kind/数值/引用。
10. undo/redo 在确认 restore 成功前移动栈；transaction cancel 忽略 runtime 恢复失败。
11. 高频参数输入每个事件同步计算全量 record diff、重建曲线和依赖、重绘列表/读数并强制布局，事务只合并了历史，没有合并渲染。
12. persistence 按钮监听在重新进入数学教室后可能重复绑定；函数面板/controller 仍有模块加载期 DOM 绑定；锁定标志没有完整阻止 UI 修改。
13. 结构测试声称 `index.js` 目标 `<900`，实际只限制 `<2200`，无法阻止入口继续膨胀。
14. 函数默认主题色仍以 literal `color` 写入文档，换肤会直接修改 runtime record，之后 Store 投影可能把旧主题颜色写回。

---

## 2. 修复后的文件边界

### 2.1 保留并强化

```text
apps/web/src/math/graph/
  graph-document.js              # schema、normalize、全局引用校验、serializable clone
  graph-document-migrations.js   # V1 → V2 迁移
  graph-store.js                 # 纯 reducer、candidate 校验、两阶段发布、transaction
  graph-history.js               # 仅在 restore 成功后移动栈
  graph-runtime.js               # handle registry；take/restore/dispose 语义明确
  graph-renderer.js              # 纯 diff/依赖计划，不直接拥有 DOM
  function-layer.js              # 函数 runtime handle 工厂
  point-layer.js                 # point add/update/replace/remove
  construction-layer.js          # construction add/update/replace/remove
  user-points.js                 # JSXGraph 点工厂与 runtime 操作，不拥有文档真值
```

### 2.2 建议新增

```text
apps/web/src/math/graph/
  graph-id-allocator.js          # 从整个文档建立 collision-proof id allocator
  graph-record-validation.js     # action record/patch allowlist + cross-reference validation
  graph-dependency-plan.js       # function/point/construction 的完整传递依赖计划
  graph-document-renderer.js     # production beforeCommit、full render、rollback/fatal 状态
  graph-readouts.js              # 特征卡、值表、数值分析 DOM 输出与布局调度
  graph-persistence-ui.js        # 导入/导出/重置按钮、文件选择、listener dispose
  graph-tool-controller.js       # 工具 tap/pick 状态机与可取消 transient 状态
  graph-mount-controller.js      # board/store/history/persistence/controller 装配与销毁
```

如果实现 Agent 能用更少文件保持单一职责，可以合并 `graph-mount-controller.js` 与 `graph-persistence-ui.js`；不得创建无边界的 `utils.js` 或重新把逻辑塞回 `index.js`。

### 2.3 最终单向合同

```text
UI intent / pointer end / classroom action
                │
                ▼
       normalized GraphAction
                │
                ▼
       reducer(candidate doc)
                │
                ▼
 validate candidate + references
                │
                ▼
 renderer.beforeCommit(previous, candidate)
      ├─ success → publish Store → History/Persistence/UI subscribers
      └─ failure → restore complete previous runtime → no publish
```

JSXGraph 中间拖动可以作为 transient preview，但松手、切换跟随、样式修改、标签显隐、延长线修改必须最终形成 GraphAction。任何 runtime-first 工具创建失败或 Store 拒绝时，必须销毁刚创建的 runtime 对象。

---

# Phase A：封住安全和数据边界

## Task 1：修复函数列表注入并建立文档不变量

**Files:**

- Modify: `apps/web/src/math/graph/function-list-view.js`
- Modify: `apps/web/src/math/graph/function-editor.js`
- Modify: `apps/web/src/math/graph/graph-document.js`
- Modify: `apps/web/src/math/graph/graph-document-migrations.js`
- Modify: `apps/web/src/math/graph/graph-persistence.js`
- Create: `apps/web/src/math/graph/graph-record-validation.js`
- Create: `apps/web/src/math/graph/graph-dependency-plan.js`
- Modify: `apps/web/src/math/graph/function-records.js`
- Modify: `apps/web/src/math/graph/function-panel.js`
- Modify: `apps/web/src/math/graph/function-layer.js`
- Modify: `apps/web/src/math/graph/graph-renderer.js`
- Modify: `apps/web/src/math/graph/index.js`
- Modify: `apps/web/src/math/shared/math-theme.js`
- Modify: `test/web/math-function-panel-controller.test.cjs`
- Modify: `test/web/math-function-records.test.cjs`
- Modify: `test/web/math-graph-document.test.cjs`
- Modify: `test/web/math-graph-migrations.test.cjs`
- Modify: `test/web/math-graph-persistence.test.cjs`
- Modify: `test/web/math-graph-render-plan.test.cjs`
- Modify: `test/web/math-lifecycle-unit.test.cjs`
- Modify: `test/web/math-graph-store.test.cjs`
- Create: `test/web/math-graph-dependency-plan.test.cjs`
- Modify: `docs/superpowers/plans/2026-08-02-function-canvas-comprehensive.md`

- [x] **Step 1: 写恶意名称和颜色的失败测试**

至少覆盖：

```js
const maliciousName = 'x" autofocus onfocus="globalThis.__xss=1';
const maliciousColor = 'red;background:url(https://example.invalid/x)';
```

断言渲染结果中不存在 `onfocus=`、`autofocus`、`background:`、`url(`；可见名称仍作为普通文本呈现。

不要只增加一个漏字符的 `escapeHtml()`。优先实现：

- 使用 `document.createElement`、`textContent`、`dataset`、`setAttribute` 创建卡片；或
- 模板只包含固定结构，所有用户字段在模板落地后通过 DOM API 赋值。

函数颜色通过语义颜色 resolver 写入 CSS custom property；resolver 只返回当前主题色板值或通过严格验证的 explicit color。

`explicitColor` 首版只接受并规范化 CSS hex：`#RGB`、`#RGBA`、`#RRGGBB`、`#RRGGBBAA`；输出统一转为小写，3/4 位扩展成 6/8 位。拒绝 named color、`rgb()`、`hsl()`、`var()`、分号、括号和 URL。当前产品没有要求完整 CSS Color 4，禁止为“兼容更多格式”扩大注入面。

- [x] **Step 2: 写 GraphDocument 全局不变量失败测试**

必须拒绝：

- functions 为空。
- functions/points/constructions 之间任意重复 id。
- 未知 function kind、point constraint kind、construction kind。
- 非有限 coefficients、相等或非有限 custom domain。
- intersection targetIds 少于 2、重复或指向不存在对象。
- construction 引用不存在的 point/function/construction。
- point/construction 依赖形成直接或传递环。
- activeFunctionId 指向不存在函数。
- 过长名称、表达式或颜色字符串。

允许并规范化：

- custom domain min/max 反序，规范化为严格递增。
- 旧 V1 literal `color`。

- [x] **Step 3: 引入 `GraphDocumentV2`，不要静默改变 V1 合同**

当前 V1 已可能保存在用户 localStorage/JSON 文件中。把函数颜色修正为：

```js
{
  colorSlot: 0,
  explicitColor: null,
}
```

V1 → V2 迁移规则：

- 现有 UI 没有函数自定义颜色入口，因此 V1 `color` 默认按函数数组位置迁移为 `colorSlot=index`、`explicitColor=null`。
- 如果实现 Agent确认存在用户可操作的函数颜色入口，再为明确的自定义颜色保存 `explicitColor`；不得凭字符串是否等于某主题色猜测。
- renderer 通过 `math-theme.js` 解析 `colorSlot`；主题切换不 dispatch、不修改 GraphDocument、不进入历史。
- storage 先尝试 V2 key，再尝试 V1 key；V1 成功迁移并写入 V2 后才能清理旧 key。
- file import 接受 V1/V2，export 只输出 V2。

同一个 Task 内必须同步迁移全部 `fn.color` 消费方，不能提交一个“文档已删 color、runtime 仍读 color”的中间状态。建议在 `math-theme.js` 提供纯运行时入口：

```js
export function resolveFunctionColor(record, palette = getMathFnPalette()) {
  if (isAllowedExplicitColor(record.explicitColor)) return record.explicitColor;
  return palette[normalizeColorSlot(record.colorSlot, palette.length)];
}
```

`function-layer`、live/full renderer、图例、函数卡、参考曲线和新函数工厂统一调用它。`remintFunctionColors()` 要么删除，要么只保留兼容 wrapper 且绝不再写 `record.color`。本 Task 提交前用 `rg -n "fn\.color|record\.color" apps/web/src/math/graph` 确认没有把 literal 默认色写回 GraphDocument 的生产路径。

- [x] **Step 4: 实现 record/patch allowlist**

`graph-record-validation.js` 提供纯函数：

```js
export function normalizeFunctionRecord(record, context) {}
export function normalizePointRecord(record, context) {}
export function normalizeConstructionRecord(record, context) {}
export function normalizeFunctionPatch(previous, patch, context) {}
export function normalizePointPatch(previous, patch, context) {}
export function normalizeConstructionPatch(previous, patch, context) {}
export function validateGraphReferences(document) {}
```

Patch 默认禁止修改 `id` 和 record `kind`。确需改变 kind 时使用 replace action，不允许浅 merge 偷换类型。

同一个 Task 创建最小可用的 `graph-dependency-plan.js`，提供引用图、稳定拓扑排序和环检测：

```js
export function buildGraphDependencyIndex(document) {}
export function graphTopologicalOrder(document) {} // [{type:'function'|'point'|'construction', id}]
export function graphDependentsOf(document, rootIds) {}
```

Task 1 只要求完整引用图、add/remove 拓扑和循环拒绝；Task 6 在此 API 上补充函数参数变化的精确 refresh 分类。拓扑结果必须跨 point/construction 混排，不能按 record 类型分桶：普通 point 可以先于 segment，但 line-line intersection point 必须位于它依赖的两条 construction 之后，下游 perpendicular construction 又位于该 intersection point 之后。validator 必须在 candidate 发布前调用环检测，使 Task 4 的 deterministic full render 从一开始就有可用的权威顺序。

- [x] **Step 5: 同步修订原全面计划的 schema 路线**

只有 V2 实现和迁移测试已经通过后，才修改 `2026-08-02-function-canvas-comprehensive.md`：

- 当前颜色语义修复占用 GraphDocument V2。
- 原计划中的分段函数从 V2 顺延到 V3。
- 原计划中的函数不等式从 V3 顺延到 V4。
- 对应 storage key、V1/V2/V3/V4 import/migration 文案同步顺延。
- 不改变那些未来功能的产品范围，只修正版本编号和迁移链。

- [x] **Step 6: 编辑器在 dispatch 前给出明确错误**

系数必须 `Number.isFinite`；custom domain 必须是两个有限数且规范化后 `min < max`。失败时保留弹窗和用户输入，不调用 `onSubmit`。

- [x] **Step 7: 运行测试**

```bash
node --test test/web/math-function-panel-controller.test.cjs test/web/math-function-records.test.cjs test/web/math-graph-document.test.cjs test/web/math-graph-migrations.test.cjs test/web/math-graph-persistence.test.cjs test/web/math-graph-render-plan.test.cjs test/web/math-graph-dependency-plan.test.cjs test/web/math-lifecycle-unit.test.cjs test/web/math-graph-store.test.cjs
```

Expected: 恶意字符串只作为文本；V1→V2 无 runtime/literal theme color；全部非法文档/patch 被拒绝。

- [x] **Step 8: Commit**

```bash
git add apps/web/src/math/graph/function-list-view.js apps/web/src/math/graph/function-editor.js apps/web/src/math/graph/graph-document.js apps/web/src/math/graph/graph-document-migrations.js apps/web/src/math/graph/graph-persistence.js apps/web/src/math/graph/graph-record-validation.js apps/web/src/math/graph/graph-dependency-plan.js apps/web/src/math/graph/function-records.js apps/web/src/math/graph/function-panel.js apps/web/src/math/graph/function-layer.js apps/web/src/math/graph/graph-renderer.js apps/web/src/math/graph/index.js apps/web/src/math/shared/math-theme.js test/web/math-function-panel-controller.test.cjs test/web/math-function-records.test.cjs test/web/math-graph-document.test.cjs test/web/math-graph-migrations.test.cjs test/web/math-graph-persistence.test.cjs test/web/math-graph-render-plan.test.cjs test/web/math-graph-dependency-plan.test.cjs test/web/math-lifecycle-unit.test.cjs test/web/math-graph-store.test.cjs docs/superpowers/plans/2026-08-02-function-canvas-comprehensive.md
git commit -m "fix(math): harden graph document and function rendering"
```

## Task 2：建立确定性 ID 分配和一致的加载入口

**Files:**

- Create: `apps/web/src/math/graph/graph-id-allocator.js`
- Modify: `apps/web/src/math/graph/index.js`
- Modify: `apps/web/src/math/graph/function-panel.js`
- Modify: `apps/web/src/math/graph/graph-persistence.js`
- Modify: `apps/web/src/math/graph/graph-renderer.js`
- Create: `test/web/math-graph-id-allocator.test.cjs`
- Modify: `test/web/math-graph-persistence.test.cjs`
- Modify: `test/web/math-function-panel-controller.test.cjs`
- Modify: `test/web/math-user-points.test.cjs`
- Modify: `test/web/math-construction-records.test.cjs`

- [x] **Step 1: 写加载后 ID 冲突失败测试**

输入文档包含：

```text
functions: f1, f2, f9
points: U1, U4
constructions: C1, C8
```

断言下一批 id 分别为 `f10`、`U5`、`C9`，且连续调用不重复。

再覆盖：

- 不规则 id 不阻塞分配。
- 跨 record 类型同名被文档 validator 拒绝。
- import/replace 后 allocator 重新 seed。
- reset 后 allocator 根据默认文档重新 seed。
- Store 拒绝 add 时，预创建 runtime 对象立即 dispose，不留下 ghost。

- [x] **Step 2: 实现文档级 allocator**

建议 API：

```js
export function createGraphIdAllocator(document) {
  return {
    nextFunctionId(),
    nextPointId(),
    nextConstructionId(),
    reseed(document),
  };
}
```

allocator 必须扫描整个文档已占用 id；不要依赖三个散落在 module state 中的自增数字。

- [x] **Step 3: 删除 `fnSeq/pointSeq/constrSeq` 业务依赖**

`function-panel`、`user-points` 和 construction host 都从 allocator 请求 id。颜色槽位按函数数组位置/allocator identity 计算，不再把序号兼作颜色和身份两种真值。

- [x] **Step 4: 统一初始加载**

正确顺序：

```text
persistence.load/import
  → migrate
  → normalize/validate
  → ensure non-empty valid document
  → seed allocator
  → create Store
  → hydrate current compatibility runtime from that exact Store document
```

禁止先向 `state.functions` 塞默认 f1，再让 Store 持有另一个空文档。默认函数只能由 `createDefaultGraphDocument()` 产生一次。Task 2 尚未创建 `graph-document-renderer.js`，因此本 Task 只要求现有 mount/rebuild adapter 从 `store.getDocument()` 建立一次兼容 runtime；不得提前引用 Task 4 的 `fullRender()`。Task 4 完成后删除该兼容初始化分支，改由 production renderer `fullRender(store.getDocument())` 首次投影。

- [x] **Step 5: 让 dispatch 返回显式结果**

Store API 至少能区分：

```js
{ ok: true, document }
{ ok: false, reason: 'INVALID_ACTION'|'RENDER_FAILED'|'DUPLICATE_ID', document }
```

如果暂时保留旧的“返回 document”兼容 API，新增 `dispatchResult()` 或可靠的 identity 检查；工具 bridge 必须知道 add 是否成功，并在失败时清理 runtime-first 对象。

- [x] **Step 6: 固定 import/replace 的成功后副作用顺序**

导入 controller 必须先读取 `replaceDocument`/dispatch 的显式结果。只有 `{ok:true}` 后才能：

```text
history.clear()
→ allocator.reseed(publishedDocument)
→ persistence.scheduleSave(publishedDocument)
→ 更新成功状态
```

如果 JSON parse/validate 成功但 runtime renderer 拒绝 replace：当前 document、history、allocator、pending autosave 和 UI 成功状态全部不变。增加 fake renderer 拒绝 import 的回归测试。

- [x] **Step 7: 运行测试并提交**

```bash
node --test test/web/math-graph-id-allocator.test.cjs test/web/math-graph-persistence.test.cjs test/web/math-function-panel-controller.test.cjs test/web/math-user-points.test.cjs test/web/math-construction-records.test.cjs
git add apps/web/src/math/graph/graph-id-allocator.js apps/web/src/math/graph/index.js apps/web/src/math/graph/function-panel.js apps/web/src/math/graph/graph-persistence.js apps/web/src/math/graph/graph-renderer.js test/web/math-graph-id-allocator.test.cjs test/web/math-graph-persistence.test.cjs test/web/math-function-panel-controller.test.cjs test/web/math-user-points.test.cjs test/web/math-construction-records.test.cjs
git commit -m "fix(math): allocate graph ids from documents"
```

## Task 3：收紧 reducer、transaction 和 history 的失败语义

**Files:**

- Modify: `apps/web/src/math/graph/graph-store.js`
- Modify: `apps/web/src/math/graph/graph-history.js`
- Modify: `apps/web/src/math/graph/graph-history-controller.js`
- Modify: `apps/web/src/subjects/classrooms/partials/math-panels.partial.html`
- Modify: `test/web/math-graph-store.test.cjs`
- Modify: `test/web/math-graph-history.test.cjs`
- Modify: `test/web/math-graph-history-controller.test.cjs`

- [x] **Step 1: 为 reorder 与非法 patch 写失败测试**

必须拒绝：

```js
['f1', 'f1']
['f1']
['f1', 'missing']
```

合法 reorder 必须满足：长度相同、集合相同、每个 id 恰好一次。

为每种 update 测试：id/kind 不可由 patch 改写；非法数值、未知字段、断裂引用返回失败且 document 引用不变。

- [x] **Step 2: history 只在 restore 成功后移动栈**

建议流程：

```js
const entry = undoStack.at(-1);
const result = restoreDocument(entry.before);
if (!result.ok) return false;
undoStack.pop();
redoStack.push(entry);
notify();
return true;
```

测试注入一个第一次 restore 失败、第二次成功的 Store：第一次 undo 返回 false，`canUndo` 仍为 true，redo 仍为空；第二次成功才移动。

- [x] **Step 3: 定义 transaction 的 document/runtime 基线状态机**

Store transaction 必须显式保存：

```js
{
  baseDocument,          // beginTransaction 时已发布文档
  candidateDocument,     // reducer 最新 candidate
  lastAppliedDocument,   // runtime 最后一次成功投影的 preview
}
```

规则：

- 每次 preview 的 `beforeCommit.previous` 是 `lastAppliedDocument`，不是永远使用 `baseDocument`。
- preview 成功后同时推进 `candidateDocument` 和 `lastAppliedDocument`；失败则两者都保持上一次成功值。
- `commitTransaction()` 如果 runtime 已处于 `lastAppliedDocument === candidateDocument`，只把 `baseDocument → candidateDocument` 发布给 Store/History/Persistence，不能再次调用 renderer 重复创建/更新 handle。
- `cancelTransaction()` 从 `lastAppliedDocument → baseDocument` 恢复一次；成功后再清除 transaction，并只发布一个 cancel 结果。
- frame batching 时尚未 apply 的 pending candidate 在 commit 前必须 flush，或在 cancel 时明确丢弃；不能把未投影文档当作 `lastAppliedDocument`。

增加 50 次 preview、部分 preview 失败、commit、cancel 的 fake renderer 调用序列测试，严格断言每次 `{previous,candidate}`。

- [x] **Step 4: transaction cancel 返回恢复结果**

Task 3 尚未创建 production renderer，因此 Store 通过注入的纯接口处理恢复：

```js
createGraphStore(initial, {
  beforeCommit,
  recoverRuntime, // optional; Task 4 接入 renderer.recover
})
```

`cancelTransaction()` 首先尝试 `beforeCommit({previous:lastAppliedDocument,candidate:baseDocument})`。失败时调用 `recoverRuntime(baseDocument)`；两者都失败则返回 `{ok:false, fatal:true}`、不通知普通 subscriber、不清除可诊断的 transaction 状态。Task 3 只固定 Store 返回值和调用顺序，不在这里引用尚未存在的 renderer、工具 controller 或错误 UI。Task 4 负责把 `renderer.recover()` 接入，并在 fatal 时禁用输入/显示 `RENDER_FAILED`。

- [x] **Step 5: 恢复历史按钮合同**

当前 partial 已移除 undo/redo 按钮，但 controller 仍查询它们。按原全面计划恢复紧凑按钮；按钮必须有 `data-graph-history-undo/redo`、中文 aria-label、disabled 同步和键盘等价操作。若产品明确决定只保留快捷键，则删除按钮查询和对应死测试；默认按“恢复按钮”实施。

- [x] **Step 6: 运行测试并提交**

```bash
node --test test/web/math-graph-store.test.cjs test/web/math-graph-history.test.cjs test/web/math-graph-history-controller.test.cjs
git add apps/web/src/math/graph/graph-store.js apps/web/src/math/graph/graph-history.js apps/web/src/math/graph/graph-history-controller.js apps/web/src/subjects/classrooms/partials/math-panels.partial.html test/web/math-graph-store.test.cjs test/web/math-graph-history.test.cjs test/web/math-graph-history-controller.test.cjs
git commit -m "fix(math): preserve graph history on failed restores"
```

### Phase A Gate

- [x] 恶意函数名称/颜色不能生成属性或 CSS 注入。
- [x] 任意 published GraphDocument 都通过全局不变量和引用校验。
- [x] 加载、import、reset 后新增函数/点/构造不重名。
- [x] reorder 不会复制/丢失函数。
- [x] renderer 拒绝 restore 时 history 栈保持不动。

---

# Phase B：关闭运行时一致性缺口

## Task 4：把原子 renderer 接入生产 `beforeCommit`

**Files:**

- Create: `apps/web/src/math/graph/graph-document-renderer.js`
- Modify: `apps/web/src/math/graph/graph-runtime.js`
- Modify: `apps/web/src/math/graph/graph-renderer.js`
- Modify: `apps/web/src/math/graph/function-layer.js`
- Modify: `apps/web/src/math/graph/point-layer.js`
- Modify: `apps/web/src/math/graph/construction-layer.js`
- Modify: `apps/web/src/math/graph/index.js`
- Reuse: `apps/web/src/math/graph/graph-dependency-plan.js`
- Modify: `test/web/math-graph-render-plan.test.cjs`
- Create: `test/web/math-graph-document-renderer.test.cjs`
- Modify: `test/web/math-graph-store.test.cjs`

- [x] **Step 1: 先写真实 production adapter 合同测试**

不要只测试未接线的 `applyFunctionPlan`。测试必须实例化最终由 `index.js` 使用的 `createGraphDocumentRenderer()`，注入 fake board、fake layer handles 和真实 Store。

覆盖：

1. 第二个 function add 抛错。
2. 既有 function update 完成后，point add 抛错。
3. 既有 construction 被计划 remove 后，后续 add 抛错。
4. rollback 本身首次失败，触发 controlled full render previous。
5. full render previous 也失败，renderer 进入 fatal 状态并拒绝后续 action。

每种失败都断言：

- Store current 严格等于 previous。
- History/persistence subscriber 调用次数为 0。
- runtime registry 的 ids、records 和 element 数与 previous 对应。
- staged elements 已 dispose。
- 没有已 dispose handle 被重新注册。

- [x] **Step 2: 修正 registry 生命周期 API**

禁止用会 dispose 的 `delete()` 实现“暂时取出再回滚”。提供语义明确的 API，例如：

```js
registry.take(id)          // 从 Map 取出但不 dispose
registry.restore(id, h)    // 只恢复未 dispose handle
registry.dispose(id)       // dispose 后删除
registry.disposeHandle(h)  // staged handle 清理
registry.clear()           // dispose 全部
```

或者不保留旧 handle，rollback 始终通过 previous document full render 重建。两种方案只能选一种并用测试固定，不能混用“有时 inverse、有时重新塞已销毁对象”。

- [x] **Step 3: 实现 deterministic full render**

`fullRender(document)` 是恢复安全网，严格顺序：

```text
disable tool input
→ dispose/clear all runtime handles and transient selections
→ create function handles
→ consume graphTopologicalOrder(document) 的混合 point/construction 序列
→ 每个 entry 按 type 调用 pointLayer 或 constructionLayer
→ apply view/presentation/reference
→ refresh active marks/readouts/list once
→ enable tool input
```

functions 是根节点，可以先创建；其后的 point/construction 必须严格按跨类型拓扑顺序创建。remove/full clear 的依赖卸载顺序使用该序列的严格逆序。禁止恢复成“全部 points 后全部 constructions”的固定分桶。

允许 full render 的场景仅限：首次 mount、完整 document replace/import、schema migration、增量 rollback。普通系数/点/样式 action 不得调用 full render。

- [x] **Step 4: 实现 production beforeCommit**

建议公开 API：

```js
export function createGraphDocumentRenderer(context) {
  return {
    beforeCommit({ previous, candidate, action, preview }),
    fullRender(document),
    recover(document),
    getStatus(), // ready | applying | recovering | fatal
    dispose(),
  };
}
```

执行原则：

1. preflight 编译 evaluator、解析 refs、创建隐藏 staged handles。
2. 新增全部可创建后，再处理会影响旧 runtime 的 update/remove。
3. 每次旧 handle 变更都有 inverse journal，或失败统一 `fullRender(previous)`。
4. 全部成功才显示 staged handles、更新 UI 并返回 `{ok:true}`。
5. 任一步失败恢复 previous；恢复成功返回 `{ok:false, code:'RENDER_FAILED'}`。
6. 恢复失败进入 fatal，禁用工具并返回明确状态。

Task 4 把 Store 的 `recoverRuntime` 注入接到 `renderer.recover`。`index.js` 通过 renderer status callback 暂时禁用现有 tool strip/pointer 和参数控件，并显示 `RENDER_FAILED`；不得提前引用 Task 8 才创建的 `graph-tool-controller.js`。Task 8 只负责把这段已经工作的接线提取进 controller。

- [x] **Step 5: 删除“测试实现和 live 实现两套真相”**

完成后：

- `index.js` 只接入 `createGraphDocumentRenderer().beforeCommit`。
- 删除或内化旧 `createGraphRuntimeSyncAdapter`。
- `applyFunctionPlan` 如果继续存在，必须是 production renderer 实际调用的组成部分。
- 测试通过 import production public API 验证，不能复制算法。

- [x] **Step 6: 运行测试并提交**

```bash
node --test test/web/math-graph-document-renderer.test.cjs test/web/math-graph-render-plan.test.cjs test/web/math-graph-store.test.cjs test/web/math-lifecycle-unit.test.cjs test/web/math-construction-*.test.cjs
git add apps/web/src/math/graph/graph-document-renderer.js apps/web/src/math/graph/graph-runtime.js apps/web/src/math/graph/graph-renderer.js apps/web/src/math/graph/function-layer.js apps/web/src/math/graph/point-layer.js apps/web/src/math/graph/construction-layer.js apps/web/src/math/graph/index.js test/web/math-graph-document-renderer.test.cjs test/web/math-graph-render-plan.test.cjs test/web/math-graph-store.test.cjs
git commit -m "fix(math): make graph runtime publication atomic"
```

## Task 5：让点、跟随、坐标标签和样式全部经过 Store

**Files:**

- Modify: `apps/web/src/math/graph/user-points.js`
- Modify: `apps/web/src/math/graph/point-layer.js`
- Modify: `apps/web/src/math/graph/construction-layer.js`
- Modify: `apps/web/src/math/graph/graph-renderer.js`
- Modify: `apps/web/src/math/graph/graph-document-renderer.js`
- Modify: `apps/web/src/math/graph/index.js`
- Modify: `apps/web/src/math/graph/function-panel.js`
- Modify: `apps/web/src/math/graph/function-list-view.js`
- Modify: `apps/web/src/math/graph/function-editor.js`
- Modify: `apps/web/src/math/shared/object-style-panel.js`
- Modify: `test/web/math-user-points.test.cjs`
- Modify: `test/web/math-object-style.test.cjs`
- Modify: `test/web/math-construction-records.test.cjs`
- Modify: `test/web/math-construction-dependencies.test.cjs`
- Modify: `test/web/math-graph-render-plan.test.cjs`
- Modify: `test/web/math-graph-history.test.cjs`
- Modify: `test/web/math-graph-persistence.test.cjs`
- Modify: `test/web/math-function-panel-controller.test.cjs`
- Modify: `test/web/math-function-records.test.cjs`

- [x] **Step 1: 写 point replacement 分类测试**

新增纯函数：

```js
export function pointUpdateMode(previous, next) {
  // 'inPlace' | 'replace'
}
```

以下变化必须返回 `replace`：

- free → followFunction。
- followFunction → free。
- followFunction → followFeature。
- follow target function/id/feature 改变。
- 任意 constraint → intersection 或反向变化。

只有坐标、名称、showCoords、locked 和可原位应用的 style 变化返回 `inPlace`。

- [x] **Step 2: UI point options 改为发出 intent**

`setPointOptionHooks` 不再直接调用 `setUserPointFollow()` / `setPointShowCoords()` 修改 runtime。改为 dispatch：

```js
{ type: 'point/update', payload: { id, patch: { constraint } } }
{ type: 'point/update', payload: { id, patch: { showCoords } } }
{ type: 'point/update', payload: { id, patch: { style } } }
```

`user-points.js` 保留 JSXGraph 创建、重建、标签应用等 runtime primitive，由 `PointLayer` 调用。

- [x] **Step 3: PointLayer 支持 replace**

replace 顺序：

```text
plan dependent constructions for removal
→ stage replacement point
→ detach old dependent construction handles
→ swap point handle
→ rebuild dependent constructions against new point handle
→ commit or rollback previous runtime
```

不得让新线段继续引用已被 `board.removeObject()` 的旧点 element。

- [x] **Step 4: 对象样式建立文档桥接**

`object-style-panel` 仍是 shared UI，不得 import graph。通过注入 callback：

```js
onStyleIntent({ objectType, objectId, patch })
```

graph feature 将它映射为 `point/update` 或 `construction/update`；其它数学 lab 可以继续使用原 runtime callback。函数画布中最终保存的 style 必须与重新加载后的样式一致。

`ConstructionLayer.update(previous, next)` 必须把 stroke、strokeWidth、dash、opacity、label style 等可原位字段投影到该 construction handle 的全部相关 elements；kind、refs 或不能安全原位更新的几何字段变化走 replace。不得只更新 `extend`/`secant` 后就返回成功。

- [x] **Step 5: 锁定语义闭合**

locked point：UI 不允许拖动、切换跟随、改样式或删除；history/import/classroom 明确 replace 仍可恢复。locked function：侧栏 UI、系数滑杆和编辑器不提交参数/表达式/定义域/删除修改，只允许“解锁”和选择/查看；reducer 本身不因 locked 拒绝 history/import restore。

- [x] **Step 6: 加入完整往返测试**

组合：

```text
free U1
→ followFunction(f1)
→ showCoords false
→ 改 stroke/fill/label
→ undo/redo
→ export/import
→ runtime full render
```

断言最终 document 深相等，runtime point 类型、follow target、标签和样式与文档对应。

再增加 construction style 组合：创建 segment/line → 修改 stroke/dash/width/label → undo/redo → export/import → full render。断言 runtime construction elements 的样式与文档一致，且只更新目标 construction，不重建无关对象。

- [x] **Step 7: 运行测试并提交**

```bash
node --test test/web/math-user-points.test.cjs test/web/math-object-style.test.cjs test/web/math-construction-records.test.cjs test/web/math-construction-dependencies.test.cjs test/web/math-graph-render-plan.test.cjs test/web/math-graph-history.test.cjs test/web/math-graph-persistence.test.cjs test/web/math-function-panel-controller.test.cjs test/web/math-function-records.test.cjs
git add apps/web/src/math/graph/user-points.js apps/web/src/math/graph/point-layer.js apps/web/src/math/graph/construction-layer.js apps/web/src/math/graph/graph-renderer.js apps/web/src/math/graph/graph-document-renderer.js apps/web/src/math/graph/index.js apps/web/src/math/graph/function-panel.js apps/web/src/math/graph/function-list-view.js apps/web/src/math/graph/function-editor.js apps/web/src/math/shared/object-style-panel.js test/web/math-user-points.test.cjs test/web/math-object-style.test.cjs test/web/math-construction-records.test.cjs test/web/math-construction-dependencies.test.cjs test/web/math-graph-render-plan.test.cjs test/web/math-graph-history.test.cjs test/web/math-graph-persistence.test.cjs test/web/math-function-panel-controller.test.cjs test/web/math-function-records.test.cjs
git commit -m "fix(math): route graph point edits through documents"
```

## Task 6：实现完整的依赖闭包和活动特征刷新

**Files:**

- Modify: `apps/web/src/math/graph/graph-dependency-plan.js`
- Modify: `apps/web/src/math/graph/graph-renderer.js`
- Modify: `apps/web/src/math/graph/graph-document-renderer.js`
- Modify: `apps/web/src/math/graph/point-layer.js`
- Modify: `apps/web/src/math/graph/construction-layer.js`
- Modify: `apps/web/src/math/graph/index.js`
- Modify: `test/web/math-graph-dependency-plan.test.cjs`
- Modify: `test/web/math-graph-render-plan.test.cjs`
- Modify: `test/web/math-construction-dependencies.test.cjs`
- Modify: `test/web/math-follow-target.test.cjs`

- [x] **Step 1: 为完整传递依赖图写失败测试**

至少覆盖：

```text
f1 → U1(followFunction) → C1(segment U1,U2)
f1 → Uv(followFeature vertex) → C2(tangent Uv,f1)
f1 + f2 → Ui(intersection) → C3(perpendicular through Ui)
C1 + C2 → Ui2(GraphPoint intersection constraint) → C5(perpendicular through Ui2)
```

当 f1 更新时，计划必须包含 U1、Uv、Ui、Ui2 及 C1/C2/C3/C5 和所有传递下游；不能只检查 `construction.fnId/fnIds`。所有交点继续以 `GraphPoint.constraint.kind === 'intersection'` 为唯一权威记录，不得为了依赖测试重新引入 intersection construction。

- [x] **Step 2: 扩展 Task 1 已建立的纯依赖 API**

建议：

```js
export function graphDependentsOf(document, rootIds) {
  return {
    pointIds,
    constructionIds,
    removeOrder,
    addOrder,
  };
}
```

依赖来源必须来自 GraphDocument refs/constraints，不从 JSXGraph element 或 runtime flags 猜测。

顺序固定：

- add：functions 根节点先创建，其余 point/construction 按跨类型拓扑序列混排。例如 `point → line construction → intersection point → perpendicular construction`。
- remove：add 序列严格反转，先最下游 point/construction，最后 function；不能按类型分桶。

- [x] **Step 3: renderer 消费闭包计划**

函数 definition 变化顺序：

```text
update evaluator/function curve
→ replace/reposition followFunction and followFeature points
→ recompute intersection points
→ rebuild directly and indirectly dependent constructions
→ update active feature marks/readouts once
```

visibility 变化需要传播可见性，但不能删除文档记录。隐藏期间 unresolved runtime 依赖可被卸载；重新显示必须按文档完整恢复。

- [x] **Step 4: 活动特征刷新按 diff，不按 action shape**

不能再判断 `ctx.action.payload.patch.visible`。只要 active function 的数学定义、domain 或 visibility 发生变化，就刷新特征点/渐近线；history restore、transaction commit、document replace 同样生效。

纯函数判断建议：

```js
activeFunctionVisualChanged(previous, current)
```

只改函数名称或锁定状态不重建曲线和特征。

- [x] **Step 5: 运行测试并提交**

```bash
node --test test/web/math-graph-dependency-plan.test.cjs test/web/math-graph-render-plan.test.cjs test/web/math-construction-dependencies.test.cjs test/web/math-follow-target.test.cjs test/web/math-graph-document-renderer.test.cjs
git add apps/web/src/math/graph/graph-dependency-plan.js apps/web/src/math/graph/graph-renderer.js apps/web/src/math/graph/graph-document-renderer.js apps/web/src/math/graph/point-layer.js apps/web/src/math/graph/construction-layer.js apps/web/src/math/graph/index.js test/web/math-graph-dependency-plan.test.cjs test/web/math-graph-render-plan.test.cjs test/web/math-construction-dependencies.test.cjs test/web/math-follow-target.test.cjs
git commit -m "fix(math): refresh transitive graph dependencies"
```

### Phase B Gate

- [x] production `beforeCommit` 与测试使用同一 renderer API。
- [x] 任何 renderer failure 后 document/runtime 深度对应 previous。
- [x] runtime 恢复失败进入 fatal，不继续接受工具输入。
- [x] 点跟随、标签和样式可以 undo/redo、保存和恢复。
- [x] 函数参数变化能刷新传递依赖和活动特征，不重建无关对象。

---

# Phase C：性能、生命周期和结构收口

## Task 7：合并高频参数渲染并避免无关 DOM 工作

**Files:**

- Modify: `apps/web/src/math/graph/index.js`
- Modify: `apps/web/src/math/graph/graph-renderer.js`
- Modify: `apps/web/src/math/graph/graph-document-renderer.js`
- Modify: `apps/web/src/math/graph/graph-store.js`
- Create or Modify: `apps/web/src/math/graph/graph-readouts.js`
- Reuse: `apps/web/src/math/shared/frame-task.js`
- Create: `test/web/math-graph-performance.test.cjs`
- Modify: `test/web/math-frame-task.test.cjs`
- Modify: `test/web/math-graph-render-plan.test.cjs`

- [x] **Step 1: 写调用次数性能测试，不写脆弱毫秒断言**

用 fake frame scheduler 连续发送 100 次 coefficient input，断言：

- 同一 animation frame 最多执行一次 render plan/runtime apply。
- 一次拖动仍只形成一个 history entry。
- 最终 document 使用最后一个值。
- 只更新 active function 及其依赖；无关 function/point/construction create/update/remove 计数为 0。
- 函数列表只在集合、顺序、名称、颜色、显隐、锁定、**选中态（activeFunctionId，卡片 is-active 遮罩）**变化时 render。
- 值表/特征只在 active function 数学定义或 active id 变化时 render。
- point move 不重绘函数列表和值表。

- [x] **Step 2: Store transaction 与 frame batching 分工明确**

- transaction：决定一次手势形成几条历史。
- frame task：限制 runtime/DOM 每帧执行次数。
- pointerup/change/dispose 前 flush 最后一帧 candidate。
- cancel 丢弃未提交 candidate 并恢复 transaction 起点。
- frame callback 每次只允许从 Task 3 定义的 `lastAppliedDocument` 投影到最新 pending candidate；成功后推进 `lastAppliedDocument`。commit 不重复 apply 已成功的最终 preview，cancel 从最后成功 preview 恢复 `baseDocument`。

禁止通过延长 transaction debounce 掩盖主线程每个 input 都重绘的问题。

**实现确认的权威边界（2026-08-07）：** Store 层 transaction 内每次 preview dispatch 保持**同步投影**（`lastAppliedDocument` 逐次推进，Task 3 状态机；commit 跳过已 apply 的最终 preview）；frame batching 只属于 **UI intent 层**（`setCoeffs` 的 `pendingCoeff`/`coeffFrame` + `requestAnimationFrame(flushCoeffFrame)` 合并）。产品高频入口（滑杆/数字输入/函数面板）必须经 `setCoeffs` 合并，不允许直连 store dispatch 绕过 batching。batching 不下沉进纯 Store（Store 保持同步语义，frame scheduler 仅注入 fake 可测）。合同由 `math-graph-performance.test.cjs` 固定：「store transaction preview 同步投影（合同边界）」与「UI intent 层 frame batching 是高频入口的唯一路径（结构合同）」。

- [x] **Step 3: 优化 record diff**

Reducer 保持未变化 record 的对象引用，因此 diff 先判断：

```js
if (beforeRecord === afterRecord) unchanged;
```

只有完整 import/replace 或引用不同且需要确认时才做字段比较。不要对每条记录默认 `JSON.stringify`。

- [x] **Step 4: 分离 runtime diff 与 UI diff**

render plan 增加明确 flags：

```js
{
  functionListChanged,
  activeMathChanged,
  activePresentationChanged,
  readoutsChanged,
  referenceChanged,
  viewChanged,
}
```

不再每个 action 无条件调用 `renderFnList/syncParamPanel/paintReadouts`。

- [x] **Step 5: 批量 DOM write，再批量 layout read**

`graph-readouts.js` 负责写入 feature/value table；`alignFeatureLabelWidths` 通过单个 frame task 在 DOM 写完后执行一次。连续参数输入不得在每个同步事件中反复 `getBoundingClientRect()`。

- [x] **Step 6: 增加宽松预算和退化策略**

测试以调用数为硬不变量；可额外记录宽松时间诊断但不把机器差异作为唯一失败条件。建议预算：

| 场景 | 硬不变量 |
|---|---|
| 100 次同帧 slider input | 1 次 runtime apply |
| point coordinate update | 0 次 function create/remove |
| probe move | 0 次 Store dispatch |
| theme switch | 0 条 history、0 次 persistence save |
| dispose | 0 个 pending frame/timer/listener |

- [x] **Step 7: 运行测试并提交**

```bash
node --test test/web/math-graph-performance.test.cjs test/web/math-frame-task.test.cjs test/web/math-graph-render-plan.test.cjs test/web/math-numeric-features.test.cjs test/web/math-transform-controller.test.cjs
git add apps/web/src/math/graph/index.js apps/web/src/math/graph/graph-renderer.js apps/web/src/math/graph/graph-document-renderer.js apps/web/src/math/graph/graph-store.js apps/web/src/math/graph/graph-readouts.js test/web/math-graph-performance.test.cjs test/web/math-frame-task.test.cjs test/web/math-graph-render-plan.test.cjs
git commit -m "perf(math): batch graph document rendering"
```

## Task 8：修复生命周期并把 `index.js` 压回编排入口

**Files:**

- Create: `apps/web/src/math/graph/graph-persistence-ui.js`
- Create: `apps/web/src/math/graph/graph-tool-controller.js`
- Create: `apps/web/src/math/graph/graph-mount-controller.js`
- Modify: `apps/web/src/math/graph/graph-readouts.js`
- Modify: `apps/web/src/math/graph/function-panel.js`
- Modify: `apps/web/src/math/graph/function-list-view.js`
- Modify: `apps/web/src/math/graph/function-editor.js`
- Modify: `apps/web/src/math/graph/index.js`
- Modify: `test/web/math-graph-structure.test.cjs`
- Modify: `test/web/math-function-panel-controller.test.cjs`
- Modify: `test/web/math-graph-history-controller.test.cjs`
- Modify: `test/web/math-board-contract.test.cjs`
- Create: `test/web/math-graph-mount-controller.test.cjs`

- [x] **Step 1: 写重复 mount/dispose 生命周期失败测试**

循环 20 次：

```text
mount → click import/export/reset once → dispose
```

断言每次 click 只调用一次 handler；最终 document/window/board 上 listener 数为 0，timer/frame/ResizeObserver 均释放。

函数 panel/list/editor 必须在 `initGraphUI()` DOM 已存在后创建；`disposeGraph()` 调用它们的 dispose。禁止模块 import 时永久捕获一次 DOM 节点。

- [x] **Step 2: 提取 persistence UI**

`createGraphPersistenceUi()` 负责：

- 绑定 import/export/reset 按钮。
- 文件 input 的一次性 change listener。
- download object URL revoke。
- `dispose()` 精确移除所有 listener。

`index.js` 不再出现三个匿名 `.addEventListener('click', ...)`。

- [x] **Step 3: 提取 readouts 和 function runtime 编排**

把以下函数组从 `index.js` 移出：

- `renderCustomNumericFeatures`、`paintReadouts`、`renderCompareInfo`、值表/特征 DOM。
- 函数 active marks/渐近线创建和刷新细节。
- reference curve 签名与生命周期。

模块必须通过注入 evaluator/theme/board/store 工作，不创建第二套 document state。

- [x] **Step 4: 提取工具交互 controller**

把 `toolPick`、one-shot、tap/pick 流程和工具取消逻辑放入 `graph-tool-controller.js`。controller 只维护 transient selection；正式对象通过 Store action 创建。公开：

```js
{ activate, handleTap, cancel, getState, dispose }
```

- [x] **Step 5: 建立 mount controller**

`graph-mount-controller.js` 负责依次创建/销毁：persistence、Store、History、renderer、board controllers、theme handle、ResizeObserver、pagehide。所有 disposer 收进一个集合并逆序执行；单个 disposer 抛错不能阻止其余清理。

- [x] **Step 6: 逐级收紧结构测试，禁止再次放宽**

本 Task 开始时先记录当前行数。每次抽取后把上限向下调整：

```text
checkpoint 1: < 1,600
checkpoint 2: < 1,000
final:        < 700
```

最终测试提示和实际阈值必须一致。禁止为了过测试把 `<700` 改回 `<2200`。

结构测试还需断言：

- `index.js` 不包含 `innerHTML` 模板。
- `index.js` 不直接创建 persistence import/export/reset listener。
- `index.js` 不定义数值分析或 readout DOM 函数。
- production renderer public API 被 `index.js` 接入。
- `function-panel/list/editor` 都有 dispose 合同。
- `draw-tools.js` 无 `export *`。

- [x] **Step 7: 运行测试并提交**

```bash
node --test test/web/math-graph-mount-controller.test.cjs test/web/math-graph-structure.test.cjs test/web/math-function-panel-controller.test.cjs test/web/math-graph-history-controller.test.cjs test/web/math-board-contract.test.cjs test/web/math-syntax-smoke.test.cjs
git add apps/web/src/math/graph/graph-persistence-ui.js apps/web/src/math/graph/graph-tool-controller.js apps/web/src/math/graph/graph-mount-controller.js apps/web/src/math/graph/graph-readouts.js apps/web/src/math/graph/function-panel.js apps/web/src/math/graph/function-list-view.js apps/web/src/math/graph/function-editor.js apps/web/src/math/graph/index.js test/web/math-graph-mount-controller.test.cjs test/web/math-graph-structure.test.cjs test/web/math-function-panel-controller.test.cjs test/web/math-graph-history-controller.test.cjs test/web/math-board-contract.test.cjs
git commit -m "refactor(math): thin the function canvas orchestrator"
```

### Phase C Gate

- [x] slider 高频输入每帧最多一次 runtime apply。
- [x] point/construction action 不触发无关函数列表和值表重绘。
- [x] 20 次 mount/dispose 后 listener/timer/frame/observer 数归零。
- [x] `index.js` <700 行，结构测试阈值与说明一致。
- [x] 函数锁定真正阻止 UI 修改，但不阻止 history/import restore。
- [x] 主题切换只改变 runtime resolved colors，不修改 document/history/storage。

---

# Phase D：最终验证与交付

## Task 9：补齐回归矩阵并完成交付审查

**Files:**

- Modify as needed: `test/web/math-graph-document-renderer.test.cjs`
- Modify as needed: `test/web/math-graph-dependency-plan.test.cjs`
- Modify as needed: `test/web/math-graph-performance.test.cjs`
- Modify: `apps/web/src/math/AGENTS.md`
- Verify and modify if drift remains: `docs/superpowers/plans/2026-08-02-function-canvas-comprehensive.md`

- [x] **Step 1: 跑六条自动组合回归**

使用 fake board/DOM/storage/timer，至少覆盖：

1. 两函数 → follow point → segment → 改参数 → undo → redo → export/import → full render。
2. function → feature-follow vertex → tangent → 改参数，所有 runtime handle 指向新点/新曲线。
3. free point → followFunction → followFeature → free，逐步 undo/redo。
4. renderer 在 function update 后 construction add 失败，Store/History/Persistence/runtime 全部保持 previous。
5. 加载已有 f1/f2/U1/C1 后新增对象，id 不重复、无 ghost。
6. 恶意 name/color JSON import → function list render，不产生 HTML attribute/CSS injection。

- [x] **Step 2: 运行数学测试**

```bash
node --test 'test/web/math-*.test.cjs'
```

Expected: 全部 PASS；不得只报告“原有 252 项通过”，需要报告修复后新的实际总数。

- [x] **Step 3: 运行全仓测试**

```bash
npm test
```

Expected: 全部 PASS；服务端测试只能使用临时数据库。

- [x] **Step 4: 运行生产构建**

```bash
npm run build
```

Expected: Vite 构建成功。允许既有 JSXGraph `eval`、重复动态导入和大 chunk warning；不得新增循环依赖、歧义导出、未解析 import 或新 warning 类型。

- [x] **Step 5: 运行静态收口检查**

```bash
git diff --check
rg -n "export \*" apps/web/src/math/graph/draw-tools.js
wc -l apps/web/src/math/graph/index.js
git status --short
```

Expected:

- `git diff --check` 无输出。
- `draw-tools.js` 无 `export *`。
- `index.js` 少于 700 行。
- status 不包含生成目录、用户数据库或嵌套 lockfile。

- [x] **Step 6: 更新工程合同**

只有代码与测试完成后，才在 `apps/web/src/math/AGENTS.md` 写明：

- production renderer 文件和原子恢复合同。
- point/style 全部经过 Store。
- dependency plan 的权威入口。
- frame batching 性能不变量。
- `index.js` 行数与职责上限。

不要把计划中的未来状态提前写成已实现事实。

同时复核 Task 1 已提交的原全面计划版本链：当前颜色语义为 V2、分段函数为 V3、不等式为 V4，storage/import/export 文案一致。若实现期间发生调整，本 Step 同步修订并在最终提交中 stage；不得留下两份互相冲突的 schema 权威说明。

- [ ] **Step 7: 请求独立代码审查**

使用 `superpowers:requesting-code-review`，审查者必须重点检查：

- 是否仍有 production/test 双 renderer。
- 是否存在 catch-and-ignore 的恢复失败。
- 是否仍有 runtime-only 持久修改。
- malicious import 是否真正使用 DOM API/严格 color resolver。
- rollback 是否把 disposed handle 放回 registry。
- 结构阈值是否再次被放宽。

- [x] **Step 8: Final commit**

```bash
git add apps/web/src/math/AGENTS.md docs/superpowers/plans/2026-08-02-function-canvas-comprehensive.md test/web/math-graph-document-renderer.test.cjs test/web/math-graph-dependency-plan.test.cjs test/web/math-graph-performance.test.cjs
git commit -m "test(math): close function canvas reliability gaps"
```

只 stage 实际修改的文件；若某个列出的测试文件未改动，不要为了匹配命令触碰它。

---

## 3. 必须保持的行为合同

修复不得改变以下已存在产品行为：

- 多函数、活动函数、显隐、复制、重命名、独立定义域。
- 一次、二次、幂、指数、对数、绝对值、反比例、正弦、余弦预设。
- 安全自定义表达式继续只使用 `@xiaohuang/math-expr`。
- 点、线段、直线、切线、垂线、交点、割线、删除、探针、罗盘和批注。
- 切线靠近顶点时使用 feature-follow；拖离后降级为普通曲线跟随。
- 换肤继续监听历史名称 `chem-theme-change`。
- 删除 JSXGraph 对象先 detach，再从 state/registry 移除。
- 全量重建保留 viewport；图例 refresh 不得把 bbox 重置。
- 批注历史继续独立；全局 undo 在批注模式下路由 notes undo。
- file import 成功后清空 history；失败不修改 document/history。
- reset 是一条可撤销的 document replace。
- pagehide/dispose flush 最后一次保存。

---

## 4. 明确禁止的捷径

- 禁止只给名称再补一个不完整 `escapeHtml`，继续使用大段用户数据 `innerHTML`。
- 禁止把函数颜色简单限制成 `#hex` 后继续把主题默认色固化进文档。
- 禁止 renderer 失败后只返回 `{ok:false}`，却不恢复已修改的 runtime。
- 禁止 dispatch 第二条 `document/replace` 伪装回滚已经发布的失败 action。
- 禁止 registry 重新注册已 dispose handle。
- 禁止工具先创建 runtime、Store 拒绝后什么都不做。
- 禁止 point constraint 变化继续只 moveTo，不替换 JSXGraph 元素。
- 禁止只看 construction 的 `fnId/fnIds`，遗漏经 point/line 的传递依赖。
- 禁止 action-specific 判断刷新，例如只看 `payload.patch.visible`；history/import 必须走同样 diff。
- 禁止用 300ms transaction debounce 代替每帧 render batching。
- 禁止无条件 `renderFnList/syncParamPanel/paintReadouts`。
- 禁止通过继续放宽结构测试让 2,000+ 行 `index.js` 过关。
- 禁止因本计划修改 server、Electron、主题视觉或新增学习功能。

---

## 5. Definition of Done

安全与数据：

- [x] 导入 JSON 中的函数名称、颜色和其它字符串不能形成 HTML/CSS 注入。
- [x] V2 文档不保存主题默认 literal color，主题切换不修改文档。
- [x] 所有 published document 都满足全局 id、kind、数值和引用不变量。
- [x] functions 永不为空；activeFunctionId 总是 null-safe 且指向有效函数。

一致性：

- [x] GraphDocument 是函数、点、构造、视口、样式、跟随和标签显示的唯一业务真值。
- [x] production beforeCommit 具有 staging/rollback/full-recovery 合同。
- [x] renderer 失败后 Store、History、Persistence 和 runtime 全部对应 previous。
- [x] undo/redo restore 失败不移动历史栈。
- [x] 加载/import/reset 后 ID 不重复，不存在文档外 ghost runtime 对象。
- [x] 参数变化按完整依赖闭包刷新 point/intersection/construction 和活动特征。

性能与生命周期：

- [x] slider 高频输入每帧最多一次 render apply，一次手势一条 history。
- [x] 无关 action 不重绘函数列表、值表或无关 JSXGraph 对象。
- [x] DOM 布局读取在 frame 内合并。
- [x] mount/dispose 循环后 listener/timer/frame/observer/object URL 全部释放。
- [x] theme switch 不进入 history/persistence。

结构与验证：

- [x] `apps/web/src/math/graph/index.js` 少于 700 行且只负责装配、公共入口和极薄生命周期代理。
- [x] `draw-tools.js` 保持显式无歧义导出。
- [x] production/test 使用同一 renderer API。
- [x] `node --test 'test/web/math-*.test.cjs'` PASS。
- [x] `npm test` PASS。
- [x] `npm run build` PASS。
- [x] `git diff --check` 无输出。
- [x] 未修改生成目录或用户数据。

---

## 6. 需要暂停并向用户报告的条件

遇到以下情况不要自行扩大范围：

1. 必须改变 `@xiaohuang/math-expr` 公开语法。
2. 发现真实已发布 V1 文档包含用户自定义函数颜色，导致 V1→V2 无法无损判定 `explicitColor`。
3. JSXGraph 无法在 full render 中稳定恢复 previous document，需要重建整个 board 或更换渲染技术栈。
4. 旧 construction 数据存在无法恢复的循环引用。
5. 为实现原子更新必须更改其它数学 lab 的 shared public API 且无法保持兼容。
6. 需要引入新的第三方状态管理、immutable patch 或安全清洗依赖。
7. 修复后仍无法满足“每帧一次 apply”或 `index.js <700`，且继续拆分会改变产品行为。

除以上情况外，按本计划继续实施，不要因命名或小型 UI 文案停止整个修复。
