# 函数画布完整升级 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有“能绘图”的函数画布升级为可撤销、可保存、可解释、可比较、可用于课堂讲解的函数学习工作台，同时保持数学状态与 JSXGraph 渲染对象解耦。

**Architecture:** 以可序列化、可迁移的 `GraphDocument` 作为唯一业务数据源；所有用户修改经过纯 action/store 和有界历史记录，再由 JSXGraph 增量渲染层投影到画板。探针、变化率、函数变换、数值分析等能力只读取文档/求值接口，不直接成为第二套状态源。

**Tech Stack:** Vite、Vanilla JavaScript（ES modules）、JSXGraph、`@xiaohuang/math-expr` 安全表达式、Node `node:test`、CSS 变量、本地 `localStorage`；本计划不引入 React、Redux、CAS、WebGL/WebGPU 或新的状态管理依赖。

---

## 0. 给实现 Agent 的执行说明

这是一份总计划，不是单个超大 PR 的施工单。必须按 Phase 顺序实施，每个 Phase 都应独立可构建、可测试、可回滚。推荐一阶段一分支或至少一阶段一组小提交，不允许攒到最后一次提交。

开始前必须完整阅读：

- `AGENTS.md`
- `apps/web/src/math/AGENTS.md`
- `.grok/skills/xiaohuang-classroom/SKILL.md`
- `.grok/skills/xiaohuang-classroom/references/product-philosophy.md`
- `docs/superpowers/specs/2026-07-31-math-classroom-atlas-design.md` 的“现行结构”部分
- 本文档

实现纪律：

1. 使用 `/xiaohuang-classroom` 处理架构边界和排障。
2. 使用 `superpowers:test-driven-development`：先写失败测试，再写最小实现。
3. 每完成一个 Task，运行该 Task 的定向测试；每个 Phase 结束运行数学测试集和构建。
4. 不修改生成目录：`apps/web/dist/`、`apps/server/public/`、`.electron-stage/`、`dist-electron/`、`dist-exe/`。
5. 不在 `apps/server/data/` 或 `apps/server/src/data/` 写入任何测试数据。
6. 按用户明确要求，不进行浏览器手工交互或浏览器 E2E 验收；验收以纯逻辑测试、fake board/DOM 生命周期契约、结构契约、语法测试和 Vite 构建为准。这是有意的范围约束，不代表菜单、快捷键、拖动、刷新恢复、主题、Tab dispose 和导出无需测试；这些交互必须被拆成可注入 controller，并用 fake event target/storage/timer/board 自动验证。
7. 保持 `draw-tools.js` 为显式兼容导出入口，不重新引入 `export *`。
8. 不直接修改 JSXGraph 库源码，也不通过关闭警告掩盖 JSXGraph 的 `eval` 构建警告。
9. 每次提交前先运行 `git diff -- <本 Task 精确路径>`；只 stage 本 Task 在 Files 中列出的文件。文中若出现目录级 `git add test/web`，实现时必须展开为本 Task 实际修改的精确文件，避免卷入用户或其它 Agent 的改动。

推荐使用**串联分支**：后一个 Phase 从前一个 Phase 的已验收分支创建；或者先合并前一 Phase 再从最新主线创建。禁止让 Phase 2 从不含 Phase 1 的旧 main 独立起步。

推荐阶段分支：

```text
codex/graph-document-history
codex/graph-incremental-renderer
codex/graph-function-workflow
codex/graph-learning-tools
codex/graph-analysis-scenes
```

---

## 1. 当前状态与问题边界

### 1.1 已有能力，不得重复造轮子

函数画布当前已有：

- 预设函数：一次、二次、幂、指数、对数、绝对值、反比例、正弦、余弦。
- 通过 `@xiaohuang/math-expr` 创建安全自定义表达式。
- 多函数、活动函数、主题配色、参数滑杆。
- 预设函数的关键特征、对应表、渐近线和特征点。
- 点、线段、直线、切线、垂线、交点、删除工具。
- 点跟随函数、函数交点跟随、构造依赖与恢复。
- 坐标轴、网格、刻度、整数吸附、视口范围、全局函数绘制范围、图例设置。
- 对象样式、罗盘、手写批注；批注已有自己的撤销和本地存储。
- 课堂 `lab-bridge` 快照和动作入口。
- 高频曲线重建通过 `createFrameTask` 合并到动画帧。

不要把以下事项列为“新功能”：坐标轴开关、网格、刻度、吸附、切线、垂线、交点、手写、罗盘。

### 1.2 当前核心工程债

- `apps/web/src/math/graph/index.js` 仍约 1,500 行，同时拥有业务状态、DOM 协调、画板运行时引用、重建流程和课堂桥接。
- `state.functions` 同时包含业务字段和 `curve`、`evalFn` 等运行时字段，不能直接安全持久化。
- 参数更新调用 `rebuildCurve()`；该流程快照用户点/构造、清除 JSXGraph 对象、重画函数，再恢复点/构造。函数或对象数量增长后成本随画布复杂度放大。
- `visible` 已存在于函数记录，但函数列表没有显隐操作。
- 自定义表达式创建后不能编辑，函数不能复制、重命名、排序、锁定，也没有每函数独立定义域。
- 没有统一撤销/重做；批注撤销只覆盖批注子系统。
- 没有完整画布文档、版本迁移、自动保存、导入导出。
- 预设函数有丰富特征，自定义函数主要只有求值和交点能力。
- 课堂快照只描述单个活动预设及 `a/b/c`，不能准确承载多函数和构造状态。

### 1.3 产品原则

本模块目标是“函数学习工作台”，不是通用 CAD：

- 优先建立“表达式—图象—数值—变化率—特征”的学习闭环。
- 工具数量不是目标；每个工具必须产生清晰、可撤销、可保存的数学对象。
- 数学文档是唯一真实数据源，JSXGraph 只负责显示和指针命中。
- 自动分析结果是派生数据，不写回函数定义。
- 不让视觉对象、动画帧或 JSXGraph element 决定业务状态。
- 复杂功能默认只分析活动函数和当前视口，避免无边界后台计算。

---

## 2. 目标架构

```text
DOM controls / board pointer / classroom action
                    │
                    ▼
            GraphAction dispatcher
                    │
                    ▼
       GraphStore + bounded GraphHistory
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
    GraphDocument       transient UI state
   唯一业务数据源       当前工具/hover/播放帧
          │
          ├──────────────► persistence / import / export
          ├──────────────► pure numeric analysis
          └──────────────► JSXGraph incremental renderer
                                   │
                                   ▼
                         RuntimeRegistry<Map<id, el>>
```

### 2.1 `GraphDocumentV1` 合同

建议以 JSDoc typedef + 运行时规范化实现，不引入 TypeScript 迁移：

```js
/**
 * @typedef {{
 *   schemaVersion: 1,
 *   id: string,
 *   title: string,
 *   functions: GraphFunction[],
 *   points: GraphPoint[],
 *   constructions: GraphConstruction[],
 *   view: {
 *     boundingBox: [number, number, number, number],
 *     axes: Record<string, boolean|number|string>,
 *   },
 *   presentation: {
 *     activeFunctionId: string|null,
 *     compare: GraphCompareState|null,
 *   },
 *   annotations: { version: 1, strokes: GraphStroke[] },
 *   meta: { createdAt: string, updatedAt: string },
 * }} GraphDocumentV1
 */
```

函数记录的持久字段；数组顺序是唯一层级顺序，不再保存重复的 `order`：

```js
{
  id: 'fn_uuid',
  name: 'f',
  kind: 'preset', // preset | custom；后续 Phase 5 才增加 piecewise
  preset: 'quadratic',
  expr: '',
  coeffs: { a: 1, b: 0, c: 0 },
  colorSlot: 0,
  explicitColor: null,
  visible: true,
  locked: false,
  domain: { mode: 'viewport', min: -10, max: 10 }
}
```

主题颜色合同：

- `colorSlot` 指向数学主题调色板中的语义槽位；换肤时由 renderer 通过 `math-theme.js` 重新解析，不修改文档、不产生历史。
- `explicitColor` 仅在用户明确自定义颜色后存在；否则为 `null`。
- 点和构造 style 使用下面定义的 semantic stroke/fill 结构，不得把主题默认色固化成 literal color。

点的持久合同：

```js
{
  id: 'pt_uuid',
  name: 'A',
  x: 1,
  y: 2,
  constraint:
    | { kind: 'free' }
    | { kind: 'followFunction', functionId: 'fn_uuid', anchorX: 1 }
    | { kind: 'followFeature', functionId: 'fn_uuid', feature: 'vertex'|'zero'|'intercept', featureIndex: 0 }
    | { kind: 'intersection', targetIds: ['f1', 'f2'], nearX: 1 },
  showCoords: true,
  locked: false,
  style: {
    stroke: { colorSlot: null, explicitColor: null, opacity: 1 },
    fill: { colorSlot: null, explicitColor: null, opacity: 1 },
    size: 3,
    face: 'o',
    label: { colorSlot: null, explicitColor: null, opacity: 1, fontSize: 13 }
  }
}
```

构造使用 discriminated union。共同字段为 `{ id, kind, name, refs, locked, visible, style }`；`refs` 只能引用文档 id，不能保存 element。线类 style 至少保存 `{ stroke:{colorSlot,explicitColor,opacity}, strokeWidth, dash, label:{colorSlot,explicitColor,opacity,fontSize} }`，与现有 object-style 可表示字段一一迁移：

```js
// 线段/直线
{ kind: 'segment'|'line', refs: { pointIds: ['p1', 'p2'] }, extend: false }
// 函数点处的切线/法线
{ kind: 'tangent'|'normal', refs: { pointId: 'p1', functionId: 'f1' } }
// 垂线：targetId 可以是 axis:x / axis:y 或 construction id
{ kind: 'perpendicular', refs: { pointId: 'p1', targetId: 'axis:x' } }
// 任意点向函数曲线作垂线；foot point 由 renderer 派生，不另存第二真值
{ kind: 'perpendicularToFunction', refs: { pointId: 'p1', functionId: 'f1' }, mode: 'nearestFoot', extend: false }
// Phase 3 新增
{ kind: 'secant', refs: { functionId: 'f1' }, x1: 0, x2: 1, showDelta: true }
```

交点的唯一权威记录是 `GraphPoint.constraint.kind === 'intersection'`。不再同时保存 intersection construction；“交点工具”创建受约束 GraphPoint，point layer 派生 runtime point/label。legacy `intersectFnIds` 和现有 intersection construction 在 Task 7 迁移为这一种 point record，并用测试确认不会渲染两个交点或形成级联环。

`followFeature` 必须无损承载当前 `graph:fn:{id}:feature:vertex` 等 follow target。导入后 feature 暂时不存在时保留记录并标记 runtime unresolved，不擅自降级为普通曲线跟随。

`GraphStroke` 至少规范化 `{ id, points:[{x,y,pressure?}], colorSlot, explicitColor, width, opacity }`。对每类 record 分别设置字段、深度、数量和字符串长度上限；未知字段在导入时丢弃，未知 `kind` 拒绝。

严禁写入文档的运行时字段：

- JSXGraph `board`、`curve`、point/line element。
- 编译后的 `evalFn`。
- DOM 节点、事件 listener、`ResizeObserver`。
- 工具 hover、pointer 坐标、正在拖动、requestAnimationFrame id。
- 构造 dependency disposer。

运行时统一存放在：

```js
{
  board,
  functionEls: new Map(),
  pointEls: new Map(),
  constructionEls: new Map(),
  compiledFunctions: new Map(),
  disposers: new Map()
}
```

上面的 Map value 不是单个 element，而是 layer handle：

```js
{
  els: new Set(),
  disposers: new Set(),
  evaluator: null,
  dependencyIds: new Set(),
  update(nextRecord, context) {},
  dispose() {}
}
```

### 2.2 Action 合同

所有持久修改使用可测试的普通对象：

```js
{ type: 'function/add', payload: { function: record } }
{ type: 'function/update', payload: { id, patch } }
{ type: 'function/remove', payload: { id } }
{ type: 'function/reorder', payload: { ids } }
{ type: 'point/add', payload: { point } }
{ type: 'point/update', payload: { id, patch } }
{ type: 'point/removeCascade', payload: { id } }
{ type: 'construction/add', payload: { construction } }
{ type: 'construction/update', payload: { id, patch } }
{ type: 'construction/removeCascade', payload: { id } }
{ type: 'view/update', payload: { patch } }
{ type: 'presentation/update', payload: { patch } }
{ type: 'annotations/replace', payload: { annotations }, meta: { record: false, persist: true } }
{ type: 'document/replace', payload: { document } }
{ type: 'scene/apply', payload: { sceneId, document }, meta: { transaction: true } }
```

Reducer 要求：

- 纯函数；不访问 DOM、localStorage、JSXGraph 或时间 API。
- 不修改输入对象。
- 对无效 id/no-op patch 返回原对象引用。
- 删除点或函数时由纯级联规则决定受影响构造，不由 renderer 临场猜测。
- 每个 action 经过 normalize/validate；非法数值、重复 id、未知 kind 不进入 store。
- `function/reorder` 的 payload 必须是当前全部函数 id 的一个排列；reducer 只重排数组，不维护第二个 `order` 字段。
- `scene/apply` 接收的 document 必须已经过场景 allowlist 构造和完整 normalize/validate，不能接受任意深层 patch。

### 2.3 历史记录策略

- 默认最多 100 个事务。
- 历史只记录结构文档的 before/after 快照，并**始终排除 annotations**。history restore 时把目标结构快照与“当前 annotations”合并，避免一次函数 undo 把刚写的批注一并回滚。
- 参数滑杆一次拖动只形成一条历史：`beginTransaction` → 多次 preview dispatch → `commitTransaction`。
- 点拖动同样合并为一条历史。
- 视口平移/缩放连续事件在 250ms 静默后合并。
- 自动保存、主题重绘、hover、探针移动、动画中间帧不写历史。
- 参数动画结束时只提交最终值；取消动画恢复起点且不产生历史。
- 批注保持自己的 80 步历史；每次 stroke/clear/notes undo 后通过 `onSnapshotChange` dispatch `annotations/replace`，标记 `record:false,persist:true`。全局撤销按钮在批注模式下路由给批注控制器，否则路由给 GraphHistory。

---

## 3. 文件边界与最终目录

新增或调整后的目标结构：

```text
apps/web/src/math/graph/
  index.js                         # 仅挂载、销毁和控制器编排，目标 < 700 行
  graph-document.js                # 默认文档、normalize、validate、serializable clone
  graph-document-migrations.js     # schemaVersion 迁移
  graph-store.js                   # reducer/store/subscribe/transaction
  graph-history.js                 # undo/redo/coalesce/bounded history
  graph-history-controller.js      # 按钮、快捷键、notes undo 路由
  graph-persistence.js             # localStorage debounce、导入导出
  graph-runtime.js                 # JSXGraph runtime registry，不可序列化
  function-evaluator.js            # 安全表达式编译与 evaluator sidecar cache
  graph-renderer.js                # doc diff 与各 layer 协调
  function-layer.js                # 函数曲线、特征点、渐近线的增量投影
  point-layer.js                   # 由现有 user-points controller 逐步迁移
  construction-layer.js            # 包装现有 construction renderers
  function-records.js              # 纯记录工厂/水合，不保存 runtime
  function-analysis.js             # 统一函数求值入口
  function-panel.js                # 函数面板协调器
  function-list-view.js            # 列表 DOM 和事件委托
  function-editor.js               # 新增/编辑函数表单
  probe-controller.js              # 曲线探针，只维护 transient 状态
  rate-of-change.js                # 割线/斜率纯数学
  rate-of-change-controller.js     # 画板交互和 transient 预览
  transform-model.js               # 变换映射、播放序列纯逻辑
  transform-controller.js          # 对比层和播放控制
  numeric-features.js              # 自定义函数数值分析纯函数
  numeric-analysis-runner.js       # 取消、缓存、调度；必要时 Worker
  piecewise-model.js               # Phase 5 才创建
  scene-catalog.js                 # 内置课堂场景
  graph-export.js                  # JSON/SVG/PNG 导出
  construction/*                   # 保持现有按职责拆分，不合并回大文件

apps/web/src/subjects/classrooms/partials/
  math-panels.partial.html         # 函数列表操作、历史、探针/变化率 UI

apps/web/src/shared/styles/
  _math-classroom.css              # 现有结构样式

test/web/
  math-graph-document.test.cjs
  math-graph-migrations.test.cjs
  math-graph-store.test.cjs
  math-graph-history.test.cjs
  math-graph-persistence.test.cjs
  math-graph-render-plan.test.cjs
  math-function-management.test.cjs
  math-graph-probe.test.cjs
  math-rate-of-change.test.cjs
  math-transform-model.test.cjs
  math-numeric-features.test.cjs
  math-piecewise-model.test.cjs
  math-graph-scenes.test.cjs
  math-graph-export.test.cjs
  math-graph-performance.test.cjs
```

拆分规则：

- `*-model.js`、document/store/history 不能 import JSXGraph、DOM 或浏览器全局。
- controller 可以访问 DOM/board，但不能拥有文档真值。
- renderer 只能把 document 投影为 runtime element，不反向偷改 document。
- `index.js` 不再新增成块的业务函数；新功能必须进入对应模块。
- 不创建 `utils.js`、`helpers.js` 这类无边界杂物文件。

---

# Phase 1：文档模型、历史与持久化

## Task 1：锁定基线和结构护栏

**Files:**

- Modify: `test/web/math-graph-structure.test.cjs`
- Create: `test/web/math-graph-baseline.test.cjs`
- Read only: `apps/web/src/math/graph/index.js`

- [ ] **Step 1: 记录当前基线测试和构建结果**

Run:

```bash
node --test 'test/web/math-*.test.cjs'
npm run build
```

Expected: 数学测试全部 PASS；Vite 构建成功。允许保留仓库原有 JSXGraph `eval`、动态导入和 chunk 警告，但不得出现新增 error。

- [ ] **Step 2: 写失败的结构测试**

测试应要求以下文件最终存在，并禁止新模块从 `jsxgraph` 直接导入：

```js
for (const file of [
  'graph-document.js',
  'graph-store.js',
  'graph-history.js',
  'graph-persistence.js',
  'graph-runtime.js',
  'graph-renderer.js',
]) {
  assert.equal(fs.existsSync(path.join(graphDir, file)), true, `${file} is required`);
}
```

- [ ] **Step 3: 运行并确认测试按预期失败**

Run: `node --test test/web/math-graph-structure.test.cjs`

Expected: FAIL，提示首个新文件不存在。

- [ ] **Step 4: 只创建带模块说明的空边界文件**

每个文件先只放职责注释和必要的空导出，不移动现有逻辑。

- [ ] **Step 5: 再次运行结构测试**

Expected: PASS；产品行为尚未改变。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/math/graph/graph-document.js apps/web/src/math/graph/graph-store.js apps/web/src/math/graph/graph-history.js apps/web/src/math/graph/graph-persistence.js apps/web/src/math/graph/graph-runtime.js apps/web/src/math/graph/graph-renderer.js test/web/math-graph-structure.test.cjs test/web/math-graph-baseline.test.cjs
git commit -m "test(math): lock graph architecture boundaries"
```

## Task 2：建立 `GraphDocumentV1`

**Files:**

- Create: `apps/web/src/math/graph/graph-document.js`
- Create: `apps/web/src/math/graph/graph-document-migrations.js`
- Create: `apps/web/src/math/graph/function-evaluator.js`
- Modify: `apps/web/src/math/graph/graph-runtime.js`
- Modify: `apps/web/src/math/graph/function-records.js`
- Modify: `apps/web/src/math/graph/function-analysis.js`
- Modify: `apps/web/src/math/graph/index.js`
- Create: `test/web/math-graph-document.test.cjs`
- Create: `test/web/math-graph-migrations.test.cjs`
- Create: `test/web/math-function-evaluator.test.cjs`

- [ ] **Step 1: 为默认文档、规范化和序列化写失败测试**

必须覆盖：

- 默认文档 `schemaVersion === 1` 且至少有一条二次函数。
- `normalizeGraphDocument` 删除 runtime 字段 `curve/evalFn/el`。
- 非有限数值回落默认值；定义域自动排序且限制在 `[-1e6, 1e6]`。
- 重复 id 被拒绝或稳定重新生成，不能静默覆盖。
- 自定义表达式导入时重新走 `compileMathExpr`，无效表达式使整个导入失败。
- `JSON.stringify(toSerializableDocument(doc))` 不抛错。
- normalize 不修改输入。
- 未知 schemaVersion 返回明确错误，不拿新格式当旧格式解析。

建议公开 API：

```js
export const GRAPH_DOCUMENT_VERSION = 1;
export function createDefaultGraphDocument(options = {}) {}
export function normalizeGraphDocument(input, options = {}) {}
export function validateGraphDocument(input) {}
export function toSerializableGraphDocument(document) {}
export function hydrateGraphDocument(input) {}
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node --test test/web/math-graph-document.test.cjs test/web/math-graph-migrations.test.cjs`

- [ ] **Step 3: 改造函数记录，并同步建立 evaluator/runtime sidecar**

`createPresetFunctionRecord` / `createCustomFunctionRecord` 只返回持久字段。不能先删 `evalFn` 再等到 Phase 2 才补求值路径；本 Task 必须同步创建 `function-evaluator.js`，并让 `function-analysis.js`、`index.js` 的自定义函数求值立即改走 sidecar：

```js
export function compileFunctionRecord(record) {
  if (record.kind === 'custom') return compileMathExpr(record.expr);
  return { ok: true, fn: (x) => evalPreset(record.preset, record.coeffs, x) };
}

export function createFunctionEvaluatorCache() {
  return {
    resolve(record),    // key 至少包含 id + kind + preset/expr/coeffs hash
    invalidate(id),
    clear(),
  };
}
```

`graph-runtime.js` 在此阶段先提供 `{ curve:null, evaluator }` sidecar；Phase 2 扩展为完整 layer handle。Task 完成后自定义函数新增、重绘、交点和对应表都必须通过回归测试，不能保留“Phase 1 暂时画不出来”的窗口。

- [ ] **Step 4: 实现默认值、深度规范化和错误对象**

错误返回统一使用：

```js
{ ok: false, code: 'INVALID_EXPRESSION', message: '表达式无法解析', path: 'functions[1].expr' }
```

不要把底层 parser 堆栈显示给用户。

- [ ] **Step 5: 实现迁移入口**

V1 是首个正式格式，但迁移模块必须提供稳定入口：

```js
export function migrateGraphDocument(input) {
  if (!input || typeof input !== 'object') return failure(...);
  if (input.schemaVersion === 1) return success(input);
  if (input.schemaVersion == null) return migrateLegacySnapshot(input);
  return failure('UNSUPPORTED_VERSION', ...);
}
```

legacy 仅支持本项目曾经真实存在的数据字段；不要臆造兼容无限格式。

- [ ] **Step 6: 运行定向和既有函数测试**

Run:

```bash
node --test test/web/math-graph-document.test.cjs test/web/math-graph-migrations.test.cjs test/web/math-function-evaluator.test.cjs test/web/math-function-records.test.cjs test/web/math-function-analysis.test.cjs test/web/math-graph-quadratic.test.cjs
```

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/math/graph/graph-document.js apps/web/src/math/graph/graph-document-migrations.js apps/web/src/math/graph/function-evaluator.js apps/web/src/math/graph/graph-runtime.js apps/web/src/math/graph/function-records.js apps/web/src/math/graph/function-analysis.js apps/web/src/math/graph/index.js test/web/math-graph-document.test.cjs test/web/math-graph-migrations.test.cjs test/web/math-function-evaluator.test.cjs test/web/math-function-records.test.cjs test/web/math-function-analysis.test.cjs test/web/math-graph-quadratic.test.cjs
git commit -m "feat(math): add serializable graph document"
```

## Task 3：建立纯 reducer/store

**Files:**

- Create: `apps/web/src/math/graph/graph-store.js`
- Create: `test/web/math-graph-store.test.cjs`
- Reuse: `apps/web/src/math/graph/construction/dependency-closure.js`

- [ ] **Step 1: 为 reducer 写失败测试**

覆盖每种 action、不可变性、no-op 引用稳定、级联删除、订阅/取消订阅：

```js
const next = reduceGraphDocument(doc, {
  type: 'function/update',
  payload: { id: 'f1', patch: { visible: false } },
});
assert.notEqual(next, doc);
assert.equal(next.functions[0].visible, false);
assert.equal(doc.functions[0].visible, true);
```

- [ ] **Step 2: 确认测试失败**

Run: `node --test test/web/math-graph-store.test.cjs`

- [ ] **Step 3: 实现 reducer 和 store**

公开 API：

```js
export function reduceGraphDocument(document, action) {}
export function createGraphStore(initialDocument, { beforeCommit } = {}) {
  return {
    getDocument,
    dispatch,
    subscribe,
    replaceDocument,
    beginTransaction,
    commitTransaction,
    cancelTransaction,
    dispose,
  };
}
```

store 使用两阶段发布：

1. reducer 计算 candidate，但不修改 current、不通知 subscriber。
2. 调用注入的 `beforeCommit({ previous, candidate, action })`；renderer 在这里应用 render plan。
3. 只有 renderer 成功才把 candidate 设为 current，并通知 history/persistence/UI subscriber。
4. renderer 失败返回 `{ok:false}` 或抛错，store 丢弃 candidate；renderer 必须恢复到与 previous document 一致的 runtime。history/persistence 从未看到失败 action，因此无需用第二条 document action 掩盖已经发布的状态。

无 board 的纯测试和初始化阶段使用成功 no-op `beforeCommit`。store listener 接收 `{ previous, current, action, transaction }`，便于 UI 精确判断变化。

- [ ] **Step 4: 级联删除复用纯依赖算法**

不要从 JSXGraph element 反查依赖。先将现有 construction record 的持久字段规范化，再让 `dependency-closure.js` 同时支持文档记录。

- [ ] **Step 5: 测试 transaction preview/cancel**

transaction 未 commit 前允许 renderer 看到 preview；cancel 必须恢复开始文档且仅通知一次恢复事件。

增加失败 candidate 测试：覆盖“创建第二个对象失败”，以及“先更新/标记删除既有 handle，后续新增失败”。断言 store current 未变、普通 subscriber/history/persistence spy 调用次数为 0，runtime 最终与 previous document 深度对应，无半更新/半删除对象。

- [ ] **Step 6: 运行测试**

Run: `node --test test/web/math-graph-store.test.cjs test/web/math-construction-dependencies.test.cjs test/web/math-construction-point-dependencies.test.cjs`

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/math/graph/graph-store.js apps/web/src/math/graph/construction/dependency-closure.js test/web/math-graph-store.test.cjs test/web/math-construction-*.test.cjs
git commit -m "feat(math): add pure graph document store"
```

## Task 4：全局历史与事务合并

**Files:**

- Create: `apps/web/src/math/graph/graph-history.js`
- Create: `apps/web/src/math/graph/graph-history-controller.js`
- Create: `test/web/math-graph-history.test.cjs`
- Create: `test/web/math-graph-history-controller.test.cjs`
- Modify later in this task: `apps/web/src/math/graph/index.js`
- Modify: `apps/web/src/subjects/classrooms/partials/math-panels.partial.html`
- Modify: `apps/web/src/shared/styles/_math-classroom.css`

- [ ] **Step 1: 写失败的历史测试**

覆盖：

- dispatch 后 `canUndo=true`。
- undo/redo 恢复完整结构文档，并保留操作时的当前 annotations。
- 新 action 清空 redo 栈。
- no-op action 不进历史。
- 超过 100 条丢弃最旧记录。
- 同一 slider transaction 的 50 次 preview 只形成 1 条记录。
- cancel transaction 不形成历史。
- history 自身不持久化、不序列化。

- [ ] **Step 2: 实现 `createGraphHistory`**

```js
export function createGraphHistory(store, { limit = 100 } = {}) {
  return { undo, redo, canUndo, canRedo, clear, subscribe, dispose };
}
```

undo/redo 恢复时 action 标记为 `{ type: 'history/restore', meta: { record: false } }`，防止递归入栈。

- [ ] **Step 3: 增加统一历史 UI**

在函数画布侧栏标题区增加“撤销/重做”，必须有：

- `type="button"`
- `aria-label="撤销"` / `aria-label="重做"`
- disabled 状态随 history 更新
- 快捷键 `Cmd/Ctrl+Z`、`Cmd/Ctrl+Shift+Z`、`Ctrl+Y`
- 输入框、textarea、contenteditable 聚焦时不截获原生文本撤销
- 批注模式激活时优先调用 notes controller 的 undo

把快捷键/按钮绑定放入可注入 controller：

```js
createGraphHistoryController({ eventTarget, root, history, notes, isEditableTarget })
// => { sync(), dispose() }
```

使用 fake event target/按钮写自动测试：Cmd/Ctrl+Z、Shift+Z、Ctrl+Y；input/textarea/contenteditable 豁免；notes active 时路由 notes undo；disabled 同步；重复 mount/dispose 后 listener 数量归零。

- [ ] **Step 4: 把一个最小用户行为接入 store**

先只把“函数显隐”或“参数更新”中的一个接入，用来端到端证明历史链路；不要在本 Task 搬完全部状态。

- [ ] **Step 5: 运行测试**

Run:

```bash
node --test test/web/math-graph-history.test.cjs test/web/math-graph-history-controller.test.cjs test/web/math-board-notes.test.cjs test/web/math-graph-structure.test.cjs
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/math/graph/graph-history.js apps/web/src/math/graph/graph-history-controller.js apps/web/src/math/graph/index.js apps/web/src/subjects/classrooms/partials/math-panels.partial.html apps/web/src/shared/styles/_math-classroom.css test/web/math-graph-history.test.cjs test/web/math-graph-history-controller.test.cjs
git commit -m "feat(math): add graph undo and redo history"
```

## Task 5：自动保存、恢复与安全导入导出（执行顺序：必须在 Task 7 之后）

> 依赖说明：本节保留 Task 编号以便引用，但实施 Agent 不得按文档排版位置提前执行。正确顺序是 `Task 1→2→3→4→6→7→5→8`。点、构造和视口在 Task 7 进入 GraphDocument 后，Task 5 才能兑现“完整文档”保存恢复；禁止建立临时双状态持久化 adapter。

**Files:**

- Create: `apps/web/src/math/graph/graph-persistence.js`
- Create: `test/web/math-graph-persistence.test.cjs`
- Modify: `apps/web/src/math/graph/index.js`
- Modify: `apps/web/src/math/shared/board-notes.js`
- Modify: `apps/web/src/subjects/classrooms/partials/math-panels.partial.html`
- Modify: `apps/web/src/shared/styles/_math-classroom.css`
- Modify: `test/web/math-board-notes.test.cjs`

- [ ] **Step 1: 写失败的 persistence 测试**

使用注入的 fake storage/timer，不直接依赖浏览器：

- 300ms debounce 内多次变更只写一次。
- key 固定为 `xiaohuang:math:graph-document:v1`。
- storage quota/security error 返回状态，不让应用崩溃。
- storage load 和文件 import 都执行相同的字节、深度、对象数量、字符串长度、危险键（`__proto__`、`prototype`、`constructor`）限制。
- 解析错误自动回退默认文档，但保留错误供 UI 显示。
- 导入最大 1 MiB、函数上限 50、点上限 500、构造上限 500、批注点上限 50,000。
- 导入失败不覆盖当前文档。
- 导入成功经过 parse-with-limits → migrate → validate references → normalize → hydrate。重复 id 默认拒绝；只有实现完整 old→new id 映射并同步重写全部 refs 时才允许修复，禁止只改 id 不改引用。
- 导出的对象不含 runtime 字段。

- [ ] **Step 2: 实现 persistence controller**

```js
export function createGraphPersistence({ storage, key, wait = 300, now, eventTarget }) {
  return { load, scheduleSave, flush, clear, exportJson, importJson, dispose };
}
```

时间戳由注入的 `now()` 生成，纯测试不能依赖真实当前时间。

- [ ] **Step 3: 扩展批注 snapshot API**

`attachBoardNotes` 返回值增加：

```js
getSnapshot()
replaceSnapshot(snapshot)
undo()
canUndo()
onSnapshotChange(listener)
```

兼容现有独立 storage 一个版本；成功写入 GraphDocument 后再删除旧 key，不能先删后迁移。stroke/clear/notes undo 都要调用 `onSnapshotChange`，外层 dispatch `annotations/replace`，使用 `record:false,persist:true`。

- [ ] **Step 4: 在初始化接入恢复，在 dispose 前 flush**

顺序必须是：加载/迁移文档 → 创建 store → 创建 board/runtime → 首次 render → 恢复批注。不得先创建默认 JSXGraph 对象再覆盖，避免闪烁和幽灵对象。

绑定 `pagehide` 立即 `flush()`；可选在 `visibilitychange` 进入 hidden 时 flush。`dispose()` 必须 flush 并移除这些 listener，测试最后 300ms 内的修改不会丢失。

- [ ] **Step 5: 增加“重置画布”和 JSON 导入/导出入口**

重置必须经过 `appConfirm`；导入失败使用 `appAlert` 显示中文错误。文件选择限制 `.json,application/json`。

历史语义必须固定：

- 初始 storage load：建立起点后 `history.clear()`。
- file import：成功后替换文档并 `history.clear()`，不能 undo 回另一个项目；失败不改变文档和 history。
- reset：作为一条可撤销的 `document/replace` transaction，清空旧 redo。
- export：只读，不改变 history。

- [ ] **Step 6: 运行测试和构建**

Run:

```bash
node --test test/web/math-graph-persistence.test.cjs test/web/math-board-notes.test.cjs test/web/math-graph-document.test.cjs
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/math/graph/graph-persistence.js apps/web/src/math/graph/index.js apps/web/src/math/shared/board-notes.js apps/web/src/subjects/classrooms/partials/math-panels.partial.html apps/web/src/shared/styles/_math-classroom.css test/web/math-graph-persistence.test.cjs test/web/math-board-notes.test.cjs
git commit -m "feat(math): persist and restore graph documents"
```

### Foundation Gate（按正确顺序完成 Task 1–4、6、7、5 后检查）

- [ ] 新建/删除/参数修改至少已通过统一 store。
- [ ] 点、构造和视口均已进入 GraphDocument，完成前不得宣称完整保存恢复。
- [ ] 撤销/重做能恢复这些行为。
- [ ] 刷新后可恢复文档。
- [ ] 导入非法表达式不会执行任意代码，也不会破坏当前文档。
- [ ] 数学测试和 Vite 构建通过。
- [ ] 未开始探针、动画、分段函数等后续功能。

---

# Phase 2：增量渲染、完整持久化与函数管理闭环

## Task 6：建立 runtime registry 和 render plan groundwork（暂不切换 live 主路径）

**Files:**

- Modify: `apps/web/src/math/graph/graph-runtime.js`
- Create: `apps/web/src/math/graph/graph-renderer.js`
- Create: `apps/web/src/math/graph/function-layer.js`
- Create: `test/web/math-graph-render-plan.test.cjs`
- Modify: `apps/web/src/math/graph/function-analysis.js`
- Modify: `apps/web/src/math/graph/index.js`

- [ ] **Step 1: 为纯 render diff 写失败测试**

给定 previous/current document，输出带依赖闭包和稳定拓扑顺序的计划：

```js
{
  functions: { add: [], update: [], remove: [] },
  points: { add: [], update: [], remove: [] },
  constructions: { add: [], update: [], remove: [] },
  viewChanged: false,
  activeFunctionChanged: false,
  dependencyRefreshIds: [],
}
```

必须证明：只修改 `f1.coeffs.a` 时不会计划删除/重建 `f2`、用户点或无关构造。

- [ ] **Step 2: 实现 runtime registry**

registry 负责 layer handle 生命周期，value 为 `{ els:Set, disposers:Set, evaluator, dependencyIds, update, dispose }`，公开 `get/set/delete/clear`。函数的一条曲线、若干特征点和渐近线属于一个 handle；多 element 构造同理。删除时保证 element/disposer 只处理一次。

- [ ] **Step 3: 将 Task 2 的 evaluator sidecar 接入完整 runtime handle**

确认 GraphDocument/函数记录中已不存在 `evalFn` 兼容字段；把 Task 2 的 cache 纳入 layer handle。`evaluateGraphFunction` 使用 evaluator resolver：

```js
evaluateGraphFunction(record, x, { resolveEvaluator })
```

或让纯编译缓存封装为独立 `createFunctionEvaluatorCache`。禁止重新把编译函数塞回 document。

- [ ] **Step 4: 实现函数 layer 的局部更新 groundwork**

要求：

- 新增函数只创建该函数曲线。
- 删除函数能卸载自己的 function handle；依赖对象的正式卸载由 Task 7 接入 dependency closure 后完成。
- 参数变化能更新该函数曲线；跟随点、交点和构造的 live 更新保证推迟到 Task 7。
- 活动函数变化只更新线宽、特征点、渐近线和读数。
- 显隐不删除文档记录，只切换 element 可见性并更新依赖对象可见性。
- 主题变化只更新样式，不触发文档 action 和历史。

render plan 现在必须能**计算**以下拓扑顺序；Task 6 只在 pure tests/fake handles 验证，不切换点/构造 live 主路径：

- remove：依赖构造/交点 → 点 → 函数（下游到上游）。
- add：函数 → 点 → 构造（上游到下游）。
- update：先刷新 evaluator/曲线，再刷新 dependency closure 中的跟随点、交点和构造。
- 同一 id 不允许同时出现在 add/remove；replace document 必须生成确定性计划。

视口和坐标设置从 renderer 写回 board 时设置 apply guard/source：`axisSettingsApplying=true` 或等价 token。由这次 apply 触发的 `boundingbox` listener 不得再次 dispatch `view/update`，防止反馈回环。

如果 JSXGraph `functiongraph` 无法可靠替换 Y evaluator，可只重建“变化的那一条曲线”，但不得清空全部用户点和构造。

renderer apply 是 store `beforeCommit` 阶段的原子检查。实现 staging/journal：先验证 evaluator/ref 和创建隐藏的新增 handle；既有 handle 的 update/remove 记录 inverse 或推迟到新增全部成功后执行；全部成功再显示新增并 commit runtime。任一阶段失败时 dispose staging，并对 `previous` 执行受控 full render（或等价完整 inverse journal）恢复旧 runtime，然后返回 failure。store 不发布 candidate，history/persistence subscriber 从未看到失败 action。不得采用“先发布 action，再 dispatch document/replace 回滚”的补偿方式。

测试必须同时注入两种失败：第二个 add 抛错；一个 existing handle 已 update/remove 后后续 add 抛错。两种情况下都确认 current/history/autosave 未变化，runtime 与 previous document 一致。如果连恢复 previous 的 full render 都失败，进入明确的 fatal renderer 状态并重建 board，不能继续接受工具输入。

- [ ] **Step 5: 保留一次受控 full render**

仅允许以下场景 full render：首次挂载、导入/替换整个文档、schema migration 后、不可恢复 renderer 错误。full render 必须清空 registry，禁止和增量对象并存。

- [ ] **Step 6: 保留 `rebuildCurve` live adapter**

Task 6 不得删除或全面替换旧 `rebuildCurve()`；点和构造尚未进入文档，此时切换会丢依赖语义。只允许用 adapter 验证 function layer，真正切换和删除旧流程在 Task 7 Step 5 完成。

- [ ] **Step 7: 运行测试**

Run:

```bash
node --test test/web/math-graph-render-plan.test.cjs test/web/math-function-analysis.test.cjs test/web/math-construction-*.test.cjs test/web/math-follow-target.test.cjs
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/math/graph/graph-runtime.js apps/web/src/math/graph/graph-renderer.js apps/web/src/math/graph/function-layer.js apps/web/src/math/graph/function-analysis.js apps/web/src/math/graph/index.js test/web/math-graph-render-plan.test.cjs test/web/math-function-analysis.test.cjs
git commit -m "refactor(math): render graph documents incrementally"
```

## Task 7：迁移点、构造和视口状态

**Files:**

- Modify: `apps/web/src/math/graph/user-points.js`
- Modify: `apps/web/src/math/graph/graph-renderer.js`
- Modify: `apps/web/src/math/graph/index.js`
- Create: `apps/web/src/math/graph/point-layer.js`
- Create: `apps/web/src/math/graph/construction-layer.js`
- Modify: `apps/web/src/math/graph/construction/records.js`
- Modify: `apps/web/src/math/graph/construction/operations.js`
- Modify: `apps/web/src/math/shared/axis-legend-settings.js`
- Modify: `test/web/math-construction-records.test.cjs`
- Modify: `test/web/math-axis-legend.test.cjs`
- Create: `test/web/math-user-points.test.cjs`
- Modify: `test/web/math-graph-render-plan.test.cjs`

- [ ] **Step 1: 写持久 record 与 runtime record 分离测试**

`snapshotConstructions` 的业务快照不得包含 JSXGraph element；restore 接收文档 record + runtime resolver。

- [ ] **Step 2: 用户点创建/拖动/删除改为 dispatch action**

拖动中 preview，drag end commit；跟随点和函数交点在 renderer 中派生坐标，但文档保存足够的 anchor 信息。

- [ ] **Step 3: 构造工具改为先创建 record，再渲染 element**

原子顺序：验证选择 → 创建持久 record → store reduce candidate → renderer `beforeCommit` staging/journal → 成功后 publish。renderer 失败时丢弃 candidate，并按 Task 6 合同恢复与 previous document 一致的完整 runtime；history/persistence 不得看到该 action。

- [ ] **Step 4: 坐标设置接入 document**

`axis-legend-settings.js` 增加纯 snapshot/apply adapter。面板临时输入与最终提交分开；拖动视口按静默窗口合并历史。

- [ ] **Step 5: 切换 live 主路径并删除旧 snapshot→clear→restore**

把 function/point/construction layer 一次接入 `beforeCommit`，然后兑现 Task 6 的依赖闭包更新保证：参数变化顺序为 evaluator/curve → feature-follow/普通跟随点 → intersection points → dependent constructions。允许导入时使用 full render；日常参数/样式/点移动不得调用 `clearAllConstructions`。

增加 legacy→document 无损迁移测试：普通跟随点、`followFeature(vertex)`、函数/直线交点、任意点到函数曲线的垂线（含 `extend`）、独立 stroke/fill/label 样式都能往返；交点只生成一个 GraphPoint/runtime handle，不同时残留 intersection construction。

- [ ] **Step 6: 运行相关测试**

Run:

```bash
node --test test/web/math-user-points.test.cjs test/web/math-construction-*.test.cjs test/web/math-axis-legend.test.cjs test/web/math-lifecycle-unit.test.cjs
```

若 `math-user-points.test.cjs` 不存在，先创建纯 point record/controller contract 测试，不得跳过。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/math/graph/user-points.js apps/web/src/math/graph/graph-renderer.js apps/web/src/math/graph/index.js apps/web/src/math/graph/point-layer.js apps/web/src/math/graph/construction-layer.js apps/web/src/math/graph/construction/records.js apps/web/src/math/graph/construction/operations.js apps/web/src/math/shared/axis-legend-settings.js test/web/math-user-points.test.cjs test/web/math-graph-render-plan.test.cjs test/web/math-construction-records.test.cjs test/web/math-axis-legend.test.cjs
git commit -m "refactor(math): store graph points and constructions as document data"
```

- [ ] **Step 8: 现在执行 Task 5 的完整持久化接入**

此时 GraphDocument 已拥有函数、点、构造、视口和批注，才能按 Task 5 实现 load/save/import/reset。完成后重新运行 Task 5、Task 7 的全部测试，并检查一次“多函数 + 跟随点 + 构造 + 自定义视口 + 批注”的序列化往返深相等（排除 meta 时间戳）。

## Task 8：完整函数管理

**Files:**

- Create: `apps/web/src/math/graph/function-list-view.js`
- Create: `apps/web/src/math/graph/function-editor.js`
- Modify: `apps/web/src/math/graph/function-panel.js`
- Modify: `apps/web/src/math/graph/function-records.js`
- Modify: `apps/web/src/subjects/classrooms/partials/math-panels.partial.html`
- Modify: `apps/web/src/shared/styles/_math-classroom.css`
- Modify: `apps/web/src/shared/styles/themes/blackboard/skin.css`
- Create: `test/web/math-function-management.test.cjs`
- Create: `test/web/math-function-panel-controller.test.cjs`
- Modify: `test/web/math-graph-structure.test.cjs`

- [ ] **Step 1: 写函数管理 reducer 测试**

覆盖：显隐、锁定、重命名、复制、编辑自定义表达式、排序、独立定义域。

关键规则：

- 可以全部隐藏，但不能删除最后一条函数；若保留旧规则，UI 必须明确说明。
- 隐藏活动函数时活动 id 保持或切换必须统一；建议保持选中但读数显示“已隐藏”。
- duplicate 生成新 id/name，并插入原函数之后；数组位置是唯一顺序真值。复制数学定义和样式，不复制 runtime。
- 名称 trim，1–20 字符；重复名称允许但 UI 用颜色/id 区分。
- locked 只阻止 UI 修改/拖动，不阻止导入替换和课堂明确 action。
- 自定义表达式只有完整编译成功后才 commit。
- domain `min < max`，单函数 viewport 模式不保存固定值。

- [ ] **Step 2: 拆分 400+ 行 `function-panel.js`**

`function-list-view.js` 只渲染函数卡和发出意图；`function-editor.js` 负责新增/编辑表单；`function-panel.js` 连接 store。拆分后每个文件建议小于 300 行。

- [ ] **Step 3: 函数卡增加操作**

每张卡至少包括：

- 颜色/活动状态。
- 显隐按钮（眼睛图标 + 文本 aria-label）。
- 名称和公式。
- 更多菜单：编辑、复制、锁定、上移、下移、删除。
- 隐藏/锁定的非颜色提示，不能只靠颜色区分。

不要在窄侧栏同时展示七个常驻小图标。

- [ ] **Step 4: 增加编辑与独立定义域**

预设函数编辑 preset/coeffs；自定义函数编辑表达式。定义域提供“跟随视口/自定义”二选一，只有自定义时显示 min/max。

- [ ] **Step 5: 键盘与事件安全**

- 菜单可用 Enter/Space 打开，Escape 关闭。
- 拖拽排序不是唯一方式，必须保留上移/下移。
- 删除有依赖对象时显示受影响数量，并通过统一 confirm。
- click handler 采用事件委托，重复 `render()` 不重复绑定。

`function-list-view.js` 接受注入的 `root` 和 callbacks，返回 `{ render, dispose }`。使用 fake root/event 测试 Enter/Space/Escape、上移/下移、删除确认意图；连续调用 20 次 `render()` 后一次 click 只能触发一次 callback，`dispose()` 后不再触发。

- [ ] **Step 6: 运行测试和构建**

Run:

```bash
node --test test/web/math-function-management.test.cjs test/web/math-function-panel-controller.test.cjs test/web/math-function-records.test.cjs test/web/math-graph-structure.test.cjs test/web/math-syntax-smoke.test.cjs
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/math/graph/function-list-view.js apps/web/src/math/graph/function-editor.js apps/web/src/math/graph/function-panel.js apps/web/src/math/graph/function-records.js apps/web/src/subjects/classrooms/partials/math-panels.partial.html apps/web/src/shared/styles/_math-classroom.css apps/web/src/shared/styles/themes/blackboard/skin.css test/web/math-function-management.test.cjs test/web/math-function-panel-controller.test.cjs test/web/math-graph-structure.test.cjs
git commit -m "feat(math): complete graph function management"
```

### Phase 2 Gate

- [ ] 修改一条函数不重建无关函数、点和构造。
- [ ] runtime 对象全部位于 registry，不存在于 GraphDocument。
- [ ] 函数显隐、编辑、复制、排序、锁定、独立定义域都可撤销/重做和持久化。
- [ ] storage load、file import、reset 的 history 语义符合 Task 5，pagehide/dispose 均 flush。
- [ ] `graph/index.js` 低于 900 行；若仍超出，必须在 Phase 3 前继续拆控制器，最终目标低于 700。
- [ ] 主题变化不污染历史和保存文档。

---

# Phase 3：高价值学习工具

## Task 9：曲线探针与对应表联动

**Files:**

- Create: `apps/web/src/math/graph/probe-model.js`
- Create: `apps/web/src/math/graph/probe-controller.js`
- Modify: `apps/web/src/math/graph/tool-definitions.js`
- Modify: `apps/web/src/math/graph/index.js`
- Modify: `apps/web/src/subjects/classrooms/partials/math-panels.partial.html`
- Modify: `apps/web/src/shared/styles/_math-classroom.css`
- Create: `test/web/math-graph-probe.test.cjs`

- [ ] **Step 1: 写纯探针测试**

API：

```js
sampleProbe({ functions, pointerX, activeFunctionId, evaluator, options })
// => [{ functionId, x, y, valid, label }]
```

覆盖：隐藏函数跳过、定义域外无结果、间断点/Infinity 返回 invalid、多函数模式、数值格式化、最多采样 10 条可见函数。

- [ ] **Step 2: 增加 `probe` 工具定义**

推荐文案：`探针`，hint：`沿曲线读取坐标，并联动对应表`。

- [ ] **Step 3: 实现 transient controller**

pointer move 用 `requestAnimationFrame` 合并；探针十字线、点和标签存 runtime，不写 document、不进历史、不触发自动保存。

- [ ] **Step 4: 对应表增加实时行**

活动函数对应表顶部显示当前 `x/y`，静态样本仍保留。探针离开或切工具后清除实时行。

- [ ] **Step 5: 键盘替代**

探针激活后：左右方向键按当前刻度步长移动，Shift+方向键使用 0.1 倍步长；状态放入 `aria-live="polite"` 的简短读数区域。

- [ ] **Step 6: 生命周期测试**

切 Tab、dispose、切工具、删除活动函数时必须清除 frame 和 JSXGraph transient elements。

- [ ] **Step 7: 运行测试并提交**

```bash
node --test test/web/math-graph-probe.test.cjs test/web/math-follow-target.test.cjs test/web/math-frame-task.test.cjs test/web/math-syntax-smoke.test.cjs
git add apps/web/src/math/graph/probe-model.js apps/web/src/math/graph/probe-controller.js apps/web/src/math/graph/tool-definitions.js apps/web/src/math/graph/index.js apps/web/src/subjects/classrooms/partials/math-panels.partial.html apps/web/src/shared/styles/_math-classroom.css test/web/math-graph-probe.test.cjs
git commit -m "feat(math): add curve probe and live value readout"
```

## Task 10：割线、平均变化率与切线逼近

**Files:**

- Create: `apps/web/src/math/graph/rate-of-change.js`
- Create: `apps/web/src/math/graph/rate-of-change-controller.js`
- Modify: `apps/web/src/math/graph/tool-definitions.js`
- Modify: `apps/web/src/math/graph/construction/records.js`
- Modify: `apps/web/src/math/graph/construction/restore.js`
- Create: `test/web/math-rate-of-change.test.cjs`
- Modify: `test/web/math-construction-records.test.cjs`

- [ ] **Step 1: 写纯数学失败测试**

```js
secantMetrics(evaluate, x1, x2)
// => { p1, p2, dx, dy, slope, midpoint, valid }
```

覆盖：一次函数斜率、二次函数、`x1===x2`、定义域外、间断/Infinity、非常接近的 x 使用 epsilon 拒绝。

- [ ] **Step 2: 新增 `secant` 工具**

交互：选择函数 → 选曲线上 A → 选曲线上 B。结果创建可持久化 construction：

```js
{
  id,
  kind: 'secant',
  functionId,
  x1,
  x2,
  showDelta: true,
  style
}
```

- [ ] **Step 3: 渲染几何和标签**

展示 A、B、割线、`Δx`、`Δy`、`平均变化率 = Δy/Δx`。拖动 A/B 时通过 transaction preview 更新，松手形成一条历史。

- [ ] **Step 4: 实现“趋近切线”播放**

播放只改变 transient `previewX2`；完成时让用户选择“保留最终割线”或“转为切线”。默认时长 1200ms，遵守 `prefers-reduced-motion`：减少动态时直接跳到最终状态。

- [ ] **Step 5: 处理依赖生命周期**

函数隐藏时割线隐藏；函数删除时级联删除；参数变化时重新计算；导入后可以恢复；无效点显示为暂停状态而不是抛错。

- [ ] **Step 6: 测试并提交**

```bash
node --test test/web/math-rate-of-change.test.cjs test/web/math-construction-*.test.cjs test/web/math-graph-history.test.cjs
git add apps/web/src/math/graph/rate-of-change.js apps/web/src/math/graph/rate-of-change-controller.js apps/web/src/math/graph/tool-definitions.js apps/web/src/math/graph/construction/records.js apps/web/src/math/graph/construction/restore.js test/web/math-rate-of-change.test.cjs test/web/math-construction-records.test.cjs
git commit -m "feat(math): add secant and rate of change exploration"
```

## Task 11：函数变换对比与参数播放

**Files:**

- Create: `apps/web/src/math/graph/transform-model.js`
- Create: `apps/web/src/math/graph/transform-controller.js`
- Modify: `apps/web/src/math/graph/function-layer.js`
- Modify: `apps/web/src/math/graph/function-panel.js`
- Modify: `apps/web/src/subjects/classrooms/partials/math-panels.partial.html`
- Create: `test/web/math-transform-model.test.cjs`
- Create: `test/web/math-transform-controller.test.cjs`

- [ ] **Step 1: 写变换模型测试**

只实现现有预设能明确解释的参数映射，返回结构化说明，不从公式字符串反解析：

```js
describePresetTransform(preset, beforeCoeffs, afterCoeffs)
// [{ kind: 'verticalScale', from: 1, to: 2, text: '纵向伸长为 2 倍' }]
```

覆盖平移、纵向伸缩、翻折、周期/相位变化；无法可靠解释时返回普通“参数变化”，禁止编造数学语义。

- [ ] **Step 2: 增加参考曲线**

用户点击“设为参考”时把当前函数定义复制到 `presentation.compare.reference`。参考曲线使用同色虚线和较低透明度，不作为函数列表新函数，不参与交点和构造吸附。

- [ ] **Step 3: 增加播放控制**

起点/终点由用户明确捕获；播放期间插值只存在 transient state，默认 60fps 上限。结束时一次 commit 终点参数；停止/取消恢复起点。

- [ ] **Step 4: 插值规则**

- 普通系数线性插值。
- 幂函数指数等要求整数的参数使用离散 step，不插值出非法中间语义。
- 定义域和表达式不做字符串插值。
- duration 限制 200–5000ms。
- 后台 Tab 或 dispose 取消 animation frame。

controller 构造时注入 `{ requestFrame, cancelFrame, documentTarget, reducedMotion }`。fake scheduler 测试：正常播放只 commit 一次；中途 stop 恢复起点；`visibilitychange` hidden、切 Tab 和 dispose 都取消 frame；reduced-motion 直接应用终点；dispose 后推进 fake frame 不再产生更新。

- [ ] **Step 5: UI 显示变化解释**

参考公式、当前公式、结构化变化说明放在关键特征卡，不新建遮挡画板的大面板。

- [ ] **Step 6: 测试并提交**

```bash
node --test test/web/math-transform-model.test.cjs test/web/math-transform-controller.test.cjs test/web/math-models.test.cjs test/web/math-frame-task.test.cjs
git add apps/web/src/math/graph/transform-model.js apps/web/src/math/graph/transform-controller.js apps/web/src/math/graph/function-layer.js apps/web/src/math/graph/function-panel.js apps/web/src/subjects/classrooms/partials/math-panels.partial.html test/web/math-transform-model.test.cjs test/web/math-transform-controller.test.cjs
git commit -m "feat(math): compare and animate function transforms"
```

### Phase 3 Gate

- [ ] 探针移动不产生历史或自动保存。
- [ ] 割线是正式可保存数学对象，动画预览不是。
- [ ] 参数动画只有一次最终提交，可撤销回起点。
- [ ] 所有 animation frame、board listener 和 DOM listener 都能 dispose。
- [ ] 减少动态设置得到尊重。

---

# Phase 4：自定义函数数值分析

## Task 12：建立有边界的数值特征分析器

**Files:**

- Create: `apps/web/src/math/graph/numeric-features.js`
- Create: `apps/web/src/math/graph/numeric-analysis-runner.js`
- Modify: `apps/web/src/math/graph/function-analysis.js`
- Modify: `apps/web/src/math/graph/index.js`
- Create: `test/web/math-numeric-features.test.cjs`
- Create: `test/web/math-graph-performance.test.cjs`

- [ ] **Step 1: 先定义结果可信度合同**

```js
{
  interval: [xMin, xMax],
  zeros: [{ x, residual, confidence }],
  extrema: [{ x, y, kind, confidence }],
  discontinuities: [{ x, kind: 'possible', confidence }],
  monotonic: [{ from, to, direction, confidence }],
  warnings: ['NUMERIC_APPROXIMATION'],
}
```

UI 必须显示“数值近似”，不能把采样结论冒充符号证明。

- [ ] **Step 2: 写已知函数测试**

至少覆盖：

- `x^2-1` 的两个零点和极小值。
- `abs(x)` 的极小值。
- `1/x` 在 0 的疑似间断，不能报告零点。
- `sin(x)` 在有限视口内的零点。
- 双重根 `(x-0.137)^2`。
- 超窄尖峰、NaN 区段和求值抛错时返回 warning 而非崩溃。

- [ ] **Step 3: 实现两阶段算法**

1. 在当前视口内最多 512 个初始样本。
2. 符号变化区间使用二分/Brent 风格求根。
3. 接近零但不变号区间检测双重根候选，再局部最小化 `|f(x)|`。
4. 一阶差分判定极值候选，局部细化。
5. 断点判断同时检查非有限值和相邻跳变比；只能标“疑似”。
6. 结果按像素/数学容差去重。

禁止扫描无限定义域；禁止一次分析所有隐藏函数。

- [ ] **Step 4: 实现 runner 的取消、缓存和 stale result 防护**

缓存 key：`function definition hash + analysis interval + tolerance profile`。函数/视口变化时取消旧 request；结果返回时 request id 不匹配则丢弃。

首版可以用 `requestIdleCallback` + timeout fallback；只有纯 benchmark 证明主线程超预算后才加入 Web Worker，避免无证据复杂化。

- [ ] **Step 5: 性能预算测试**

在 Node 中固定 evaluator 和样本数，测试应避免脆弱的毫秒绝对断言。硬上限使用宽松阈值并同时断言求值次数：

- 单函数初始分析求值不超过 5,000 次。
- 10 条函数只分析活动函数时仍不超过单函数预算。
- 缓存命中不重复求值。
- abort 后不发布结果。

- [ ] **Step 6: 接入关键特征卡**

预设函数仍优先使用精确解析特征；自定义函数使用数值分析；两者 UI 明确区分“精确/数值近似”。分析中、无结果、取消、表达式异常分别有状态。

- [ ] **Step 7: 测试并提交**

```bash
node --test test/web/math-numeric-features.test.cjs test/web/math-graph-performance.test.cjs test/web/math-function-analysis.test.cjs
git add apps/web/src/math/graph/numeric-features.js apps/web/src/math/graph/numeric-analysis-runner.js apps/web/src/math/graph/function-analysis.js apps/web/src/math/graph/index.js test/web/math-numeric-features.test.cjs test/web/math-graph-performance.test.cjs
git commit -m "feat(math): analyze custom function features numerically"
```

---

# Phase 5：表达能力扩展（独立发布门）

## Task 13：分段函数

**Files:**

- Create: `apps/web/src/math/graph/piecewise-model.js`
- Create: `apps/web/src/math/graph/piecewise-editor.js`
- Modify: `apps/web/src/math/graph/graph-document.js`
- Modify: `apps/web/src/math/graph/graph-document-migrations.js`
- Modify: `apps/web/src/math/graph/graph-persistence.js`
- Modify: `apps/web/src/math/graph/function-evaluator.js`
- Modify: `apps/web/src/math/graph/function-records.js`
- Modify: `apps/web/src/math/graph/function-analysis.js`
- Modify: `apps/web/src/math/graph/function-layer.js`
- Create: `test/web/math-piecewise-model.test.cjs`
- Modify: `test/web/math-graph-document.test.cjs`
- Modify: `test/web/math-graph-migrations.test.cjs`
- Modify: `test/web/math-graph-persistence.test.cjs`
- Modify: `test/web/math-function-evaluator.test.cjs`

- [ ] **Step 1: 先写数据合同测试**

```js
{
  kind: 'piecewise',
  branches: [
    { id: 'b1', expr: '-x', interval: { min: null, minClosed: false, max: 0, maxClosed: false } },
    { id: 'b2', expr: 'x', interval: { min: 0, minClosed: true, max: null, maxClosed: false } }
  ]
}
```

每个 branch 表达式单独走安全编译。测试闭/开端点、无穷边界、区间重叠、空区间和缝隙。

- [ ] **Step 2: 明确重叠规则**

推荐禁止区间重叠；允许区间缝隙。editor 在 commit 前给出具体冲突分支，不使用“前者优先”掩盖错误。

- [ ] **Step 3: 渲染开闭端点**

每个 branch 曲线只在自己的区间渲染；闭端点实心、开端点空心。端点是派生视觉对象，不进入用户点集合。

- [ ] **Step 4: 集成求值、探针、交点和数值分析**

所有能力通过统一 `evaluateGraphFunction`，禁止每个工具单独识别 piecewise。

- [ ] **Step 5: 升级 `GraphDocumentV2` 并迁移**

增加 `kind:'piecewise'` 会让旧 V1 reader 无法识别同版本文档，因此必须升级 `schemaVersion:2`：

- V1→V2 保持既有 preset/custom 函数语义不变。
- V2 validator 才接受 piecewise。
- storage 启动先尝试最新 key，再尝试 `xiaohuang:math:graph-document:v1` 并迁移；成功写入 V2 后才清理旧 key。
- file import 同时接受 V1/V2；export 只写最新版本。
- 未知更高版本继续拒绝。

Task 14 若不等式以新的 document record kind 持久化，则继续升级 V4；若只作为 V3 已预留且旧 V3 validator 已理解的字段，才能保持 V3。禁止发布两种互不兼容的同版本 schema。

- [ ] **Step 6: 测试并提交**

```bash
node --test test/web/math-piecewise-model.test.cjs test/web/math-graph-document.test.cjs test/web/math-graph-migrations.test.cjs test/web/math-graph-persistence.test.cjs test/web/math-function-evaluator.test.cjs test/web/math-function-analysis.test.cjs test/web/math-graph-probe.test.cjs
git add apps/web/src/math/graph/piecewise-model.js apps/web/src/math/graph/piecewise-editor.js apps/web/src/math/graph/graph-document.js apps/web/src/math/graph/graph-document-migrations.js apps/web/src/math/graph/graph-persistence.js apps/web/src/math/graph/function-evaluator.js apps/web/src/math/graph/function-records.js apps/web/src/math/graph/function-analysis.js apps/web/src/math/graph/function-layer.js test/web/math-piecewise-model.test.cjs test/web/math-graph-document.test.cjs test/web/math-graph-migrations.test.cjs test/web/math-graph-persistence.test.cjs test/web/math-function-evaluator.test.cjs
git commit -m "feat(math): add safe piecewise functions"
```

## Task 14：函数不等式区域（可选，分段函数稳定后才能开始）

**Files:**

- Create: `apps/web/src/math/graph/inequality-model.js`
- Create: `apps/web/src/math/graph/inequality-layer.js`
- Create: `test/web/math-inequality-model.test.cjs`
- Modify: `apps/web/src/math/graph/graph-document.js`
- Modify: `apps/web/src/math/graph/graph-document-migrations.js`
- Modify: `apps/web/src/math/graph/graph-persistence.js`
- Modify: `apps/web/src/math/graph/function-editor.js`
- Modify: `test/web/math-graph-document.test.cjs`
- Modify: `test/web/math-graph-migrations.test.cjs`
- Modify: `test/web/math-graph-persistence.test.cjs`

- [ ] **Step 1: 限定首版范围**

只实现 `y < f(x)`、`y ≤ f(x)`、`y > f(x)`、`y ≥ f(x)`；不实现一般二元隐式不等式。

- [ ] **Step 2: 测试边界语义**

严格不等式虚线边界，非严格不等式实线边界；隐藏/删除函数时区域同步；导入非法 relation 失败。

将不等式 record 引入 `GraphDocumentV4`，补 V3→V4 迁移：V3 函数原样保留、V4 validator 才接受 inequality、storage 依次尝试最新→V3→V2→V1、成功写入 V4 后才清理旧 key；file import 接受 V1/V2/V3/V4，export 只写 V4。禁止仅改 validator 而不升版本。

- [ ] **Step 3: 实现轻量 SVG/JSXGraph 区域层**

只覆盖当前视口；视口变化时重算；不建立超大多边形，不让区域参与点吸附或交点命中。

- [ ] **Step 4: 测试并提交**

```bash
node --test test/web/math-inequality-model.test.cjs test/web/math-graph-document.test.cjs test/web/math-graph-migrations.test.cjs test/web/math-graph-persistence.test.cjs
git add apps/web/src/math/graph/inequality-model.js apps/web/src/math/graph/inequality-layer.js apps/web/src/math/graph/graph-document.js apps/web/src/math/graph/graph-document-migrations.js apps/web/src/math/graph/graph-persistence.js apps/web/src/math/graph/function-editor.js test/web/math-inequality-model.test.cjs test/web/math-graph-document.test.cjs test/web/math-graph-migrations.test.cjs test/web/math-graph-persistence.test.cjs
git commit -m "feat(math): shade basic function inequalities"
```

### 明确延后

以下能力不属于本轮完整升级的必做范围，除非用户重新确认课程优先级：

- 极坐标。
- 参数方程。
- 一般隐函数。
- 完整导函数符号计算。
- 完整 CAS。
- 云端协作、多人实时同步。
- 替换 JSXGraph。

---

# Phase 6：课堂场景、导出和收口

## Task 15：配置驱动的课堂场景

**Files:**

- Create: `apps/web/src/math/graph/scene-catalog.js`
- Create: `test/web/math-graph-scenes.test.cjs`
- Create: `test/web/math-graph-scene-routing.test.cjs`
- Modify: `apps/web/src/math/graph/index.js`
- Modify: `apps/web/src/math/shared/lab-bridge.js`
- Modify: `apps/web/src/subjects/classrooms/math-classroom.js`
- Modify: `apps/web/src/math/classroom/topics.js`
- Modify if the scene is launched from classroom UI: `apps/web/src/math/classroom/entry.js`
- Modify: `test/web/math-p1-bridge.test.cjs`

- [ ] **Step 1: 定义场景合同并写测试**

```js
{
  id: 'quadratic-discriminant',
  title: '判别式与交点个数',
  description: '拖动 c，观察零点数量变化',
  documentPatch: { ... },
  focus: { functionId: 'f1', card: 'features' },
  suggestedActions: ['调节 c', '观察 Δ 与零点'],
}
```

场景是静态配置，不包含函数、DOM、JSXGraph element 或可执行字符串。

- [ ] **Step 2: 首批只做 4 个高价值场景**

- 二次函数判别式与 x 轴交点。
- `y=a(x-h)^2+k` 的平移/伸缩。
- 指数与对数互为反函数的对比。
- 割线趋近切线。

- [ ] **Step 3: 应用场景经过 document action**

应用前确认是否覆盖当前画布；整个场景应用只形成一条历史，可一次撤销。不要让 scene controller 直接 create JSXGraph 对象。

- [ ] **Step 4: 扩展课堂 bridge 和懒加载路由**

`getLabSnapshot` 返回文档摘要：可见函数、活动函数、关键工具对象和 sceneId；避免把整个大文档无边界塞进 quiz prompt。

新增明确 action：

```js
{ type: 'applyGraphScene', tab: 'graph', sceneId: 'quadratic-discriminant' }
```

`lab-bridge.js` 的 union、tab 推断和 `math-classroom.js` 的 lazy-load 分派都必须识别 `applyGraphScene`，强制先加载/切换 `graph`，等待模块 init 后再调用 `graph.applyLabAction`。如果课堂 topics/entry 产生场景按钮，也必须同步更新对应 schema/handler。

外部 action 不接受一般 `documentPatch`。若未来确需课堂参数 patch，只允许显式 allowlist 字段，经过 limits → normalize → validate；未知字段拒绝，禁止把任意深层对象 merge 进文档。

把路由顺序写成可注入函数 `applyGraphSceneAction(action, { switchTab, waitForInit, graphModule })`。fake async spy 必须断言严格调用顺序为 `switchTab('graph')` → `waitForInit()` → `graphModule.applyLabAction()`；加载失败或 init 超时不得调用 apply，重复调用不会绑定额外 listener。

- [ ] **Step 5: 测试并提交**

```bash
node --test test/web/math-graph-scenes.test.cjs test/web/math-graph-scene-routing.test.cjs test/web/math-p1-bridge.test.cjs
git add apps/web/src/math/graph/scene-catalog.js apps/web/src/math/graph/index.js apps/web/src/math/shared/lab-bridge.js apps/web/src/subjects/classrooms/math-classroom.js apps/web/src/math/classroom/topics.js test/web/math-graph-scenes.test.cjs test/web/math-graph-scene-routing.test.cjs test/web/math-p1-bridge.test.cjs
git commit -m "feat(math): add graph teaching scenes"
```

## Task 16：SVG/PNG/JSON 导出

**Files:**

- Create: `apps/web/src/math/graph/graph-export.js`
- Create: `test/web/math-graph-export.test.cjs`
- Modify: `apps/web/src/math/graph/index.js`
- Modify: `apps/web/src/subjects/classrooms/partials/math-panels.partial.html`

- [ ] **Step 1: 写文件名和 JSON 导出测试**

文件名去除路径字符和控制字符；JSON 使用 UTF-8、格式化缩进、包含 schemaVersion。

- [ ] **Step 2: 实现包含批注的 SVG 导出**

克隆画板 SVG，注入必要主题变量/背景；移除选择框、hover、探针等 transient chrome。不得修改屏幕上的原 SVG。

批注当前是独立 canvas overlay，不能靠 clone JSXGraph SVG 自动带入。导出时读取 `annotations.strokes`，把 user coordinates 按当前 boundingBox/board transform 转换为 SVG `<path>`，追加到克隆 SVG 的 annotation group；pressure 若存在则首版可使用平均线宽，但颜色、宽度、透明度必须保留。测试验证批注 path 存在，且 transient probe/selection 不存在。

`createGraphExporter` 注入 `{ cloneSvg, serializeSvg, createImage, createCanvas, createObjectUrl, revokeObjectUrl }`。fake SVG/DOM 测试必须断言：原 SVG 节点和属性完全不变；克隆体删除 transient selectors；批注路径坐标正确；所有 object URL 在成功和失败路径都 revoke。

- [ ] **Step 3: 实现 PNG 转换**

包含批注的 SVG Blob → Image → Canvas → PNG Blob；限制最大尺寸/像素数，捕获资源加载和 canvas 安全错误。首版不加载外部图片，避免 tainted canvas。

- [ ] **Step 4: 导出菜单**

提供“保存项目 JSON”“导出 SVG”“导出 PNG”。导入和导出都不得改变历史。

- [ ] **Step 5: 测试并提交**

```bash
node --test test/web/math-graph-export.test.cjs test/web/math-graph-persistence.test.cjs test/web/math-syntax-smoke.test.cjs
git add apps/web/src/math/graph/graph-export.js apps/web/src/math/graph/index.js apps/web/src/subjects/classrooms/partials/math-panels.partial.html test/web/math-graph-export.test.cjs
git commit -m "feat(math): export graph documents and images"
```

## Task 17：性能、无障碍与最终结构收口

**Files:**

- Modify: `apps/web/src/math/graph/index.js`
- Modify: `apps/web/src/math/graph/graph-renderer.js`
- Modify: `apps/web/src/math/graph/numeric-analysis-runner.js`
- Modify: `test/web/math-graph-performance.test.cjs`
- Modify: `test/web/math-graph-structure.test.cjs`
- Modify: `test/web/math-board-contract.test.cjs`
- Modify: `docs/superpowers/specs/2026-07-31-math-classroom-atlas-design.md`

- [ ] **Step 1: 增加开发态性能计数器**

只在开发态记录：render plan 数量、function create/update/remove 数量、分析求值次数、被取消任务数。不得发送遥测或写入用户数据。

- [ ] **Step 2: 锁定性能不变量**

纯测试证明：

- 单函数参数变化不计划重建其它函数。
- 探针移动不 dispatch 文档 action。
- 动画 120 帧只产生 1 个最终 history entry。
- autosave debounce 合并高频 action。
- 分析器受求值预算和取消机制约束。
- dispose 后 listener/frame/timer 数量归零。

- [ ] **Step 3: 最终拆薄 `index.js`**

目标低于 700 行。保留：挂载、控制器组装、公共模块导出、课堂 bridge adapter。移走：document reducer、DOM 列表模板、数值算法、工具状态机、renderer 细节。

- [ ] **Step 4: 无障碍结构检查**

所有新按钮有可读名称；active tool 使用 `aria-pressed`；函数菜单键盘可操作；动态坐标使用 polite live region；颜色之外有虚线/图标/文本区别；减少动态设置生效。

- [ ] **Step 5: 更新权威设计文档**

只在代码与测试完成后更新 spec，写明 GraphDocument、历史、持久化、新工具和明确延后项。不要提前把计划描述成已实现。

- [ ] **Step 6: 全量验证**

Run:

```bash
node --test 'test/web/math-*.test.cjs'
node --test test/web/math-expr-safe.test.cjs
npm test
npm run build
git diff --check
```

Expected:

- 所有测试 PASS。
- Vite 构建成功。
- `git diff --check` 无输出。
- 允许已有 JSXGraph `eval`、动态导入和 chunk 警告；不得出现新的循环依赖、歧义导出或构建 warning 类型。

- [ ] **Step 7: 审核生成目录和用户数据未被修改**

Run:

```bash
git status --short
```

确认没有 `apps/web/dist/`、`apps/server/public/`、`apps/server/data/`、`.electron-stage/`、`dist-*`、依赖目录进入变更。

- [ ] **Step 8: Final commit**

```bash
git add apps/web/src/math apps/web/src/subjects/classrooms/partials/math-panels.partial.html apps/web/src/shared/styles test/web docs/superpowers/specs/2026-07-31-math-classroom-atlas-design.md
git commit -m "refactor(math): complete function canvas learning workflow"
```

---

## 4. 性能预算与退化策略

这些是工程预算，不要求依赖浏览器手工性能面板才能验收：

| 场景 | 预算/不变量 | 超预算时处理 |
|---|---|---|
| 滑杆输入 | 每帧最多一次 render plan；一次拖动一个 history entry | 合并 input，commit 放 change/pointerup |
| 点拖动 | 不重建全部函数和构造 | 只更新依赖闭包 |
| 探针移动 | 不写 store/history/storage | RAF 合并，只更新 transient elements |
| 参数动画 | 中间帧不持久化；结束一次 commit | 降低读数刷新频率到 10–15Hz |
| 数值分析 | 单次最多 5,000 次求值，可取消 | 降采样、只分析活动函数/当前视口 |
| 自动保存 | 300ms debounce，dispose/pagehide flush | quota 错误降级为仅内存并提示 |
| 文档导入 | JSON ≤1MiB；对象数量有上限 | 拒绝导入并保留当前文档 |
| 历史 | 最多 100 条，批注历史独立 | 丢弃最旧项，不写 localStorage |

annotations 从第一版起就始终排除在结构历史快照之外；它仍属于持久文档，并由 notes 自己的有界历史管理。如果剔除 annotations 后结构 history 内存仍明显升高，再评估紧凑 patch 表示；不要第一时间引入第三方 immutable/patch 库。

---

## 5. 错误处理合同

所有用户可触发错误必须归一化：

| code | 场景 | 用户文案 |
|---|---|---|
| `INVALID_EXPRESSION` | 自定义/分段表达式无法编译 | 表达式无法解析，请检查括号和运算符 |
| `INVALID_DOCUMENT` | JSON 结构不合法 | 文件不是有效的函数画布项目 |
| `UNSUPPORTED_VERSION` | 新版本文档无法读取 | 该项目由更高版本创建，当前版本暂不支持 |
| `DOCUMENT_TOO_LARGE` | 文件或对象数量超限 | 项目内容过大，请精简后重试 |
| `STORAGE_UNAVAILABLE` | localStorage 被禁用/超额 | 无法自动保存；当前内容仍保留在本次会话中 |
| `ANALYSIS_ABORTED` | 分析被新请求替代 | 不显示为错误，静默丢弃 |
| `ANALYSIS_UNCERTAIN` | 数值特征不可靠 | 当前结果为数值近似，部分特征可能未识别 |
| `RENDER_FAILED` | JSXGraph 局部创建失败 | 无法绘制该对象，操作已撤销 |

日志可以保留 code/path，但不得打印用户完整导入文档或 AI 返回原文，避免泄露课堂内容。

---

## 6. 测试矩阵

| 层级 | 测试方式 | 必测内容 |
|---|---|---|
| 文档模型 | Node 单元测试 | normalize、迁移、上限、安全表达式、无 runtime |
| Store/History | Node 单元测试 | action、不可变、级联、事务、undo/redo、上限 |
| 数学模型 | Node 单元测试 | 探针、割线、变换、数值特征、分段边界 |
| Renderer 计划 | 纯 diff 测试 | 最小 add/update/remove 集合，无全量重建 |
| Controller 合同 | fake board/storage/timer | 生命周期、取消、listener dispose、debounce |
| 结构契约 | 源码测试 | 文件边界、显式导出、index 行数、禁止直引 JSXGraph |
| 集成 | 现有 math tests | 构造依赖、交点、跟随点、主题、board lifecycle |
| 构建 | Vite | import/export、动态 chunk、CSS 和 worker 打包 |

重点回归组合：

1. 创建两函数 → 添加函数交点 → 改参数 → undo → redo → 保存 → 恢复。
2. 创建跟随点和割线 → 隐藏函数 → 显示 → 删除函数并确认级联 → undo。
3. 自定义函数 → 编辑成非法表达式（拒绝）→ 编辑成合法表达式 → 数值分析。
4. 启动变换动画 → 中途切 Tab/dispose → 不残留 frame → 重进画布状态正确。
5. 导入旧文档 → migrate → 保存新格式 → 再次加载结果稳定。
6. 黑板主题切换 → 函数颜色和新增 UI 正确重绘 → 文档/history 不改变。

---

## 7. Definition of Done

基础完整性（必须）：

- [ ] GraphDocument 是唯一业务状态源。
- [ ] 文档完全可序列化、可验证、可迁移，不含 JSXGraph/DOM/runtime。
- [ ] 函数、点、构造、视口修改都经过 action/store。
- [ ] 全局撤销/重做、自动保存、恢复、重置、JSON 导入导出完成。
- [ ] 函数显隐、编辑、复制、排序、锁定和独立定义域完成。
- [ ] 日常参数变化不再全量重建用户点和构造。

学习能力（本轮推荐完成）：

- [ ] 曲线探针与对应表联动。
- [ ] 割线、平均变化率和趋近切线。
- [ ] 函数变换参考曲线与参数播放。
- [ ] 自定义函数数值特征分析有“近似”标记和计算边界。

扩展能力（可按用户优先级单独发布）：

- [ ] 分段函数。
- [ ] 基础函数不等式区域。
- [ ] 课堂场景。
- [ ] SVG/PNG 导出。

工程质量（必须）：

- [ ] `graph/index.js` 最终低于 700 行且只做编排。
- [ ] 新模块职责单一，无新的万能 helpers 文件。
- [ ] 所有动态任务可取消，所有 listener/timer/frame 可 dispose。
- [ ] 高频 transient 行为不污染历史和自动保存。
- [ ] `draw-tools.js` 保持显式导出，无星号重名地雷。
- [ ] `node --test 'test/web/math-*.test.cjs'` 通过。
- [ ] `npm test` 通过。
- [ ] `npm run build` 成功。
- [ ] `git diff --check` 无输出。
- [ ] 未修改生成目录和用户数据目录。

---

## 8. 实现过程中需要停下来的条件

遇到以下情况不要自行扩大范围，先向用户报告：

1. 需要改变 `@xiaohuang/math-expr` 语法或包的公开合同。
2. 需要把文档同步到服务器或引入账号/云存储。
3. JSXGraph 的限制导致必须更换渲染技术栈。
4. 分段函数需要一般逻辑条件而不只是 x 区间。
5. 希望增加完整导数、积分或 CAS。
6. 旧用户数据迁移无法无损完成。
7. 计划中的性能不变量无法在现有 JSXGraph 生命周期内满足。

在没有以上阻塞时，按合理假设继续实施，不要因为小的命名或 UI 文案问题停止整个 Phase。

---

## 9. 推荐实际交付切片

如果资源有限，按以下切片交付，不要挑零散按钮：

1. **Release A（底座）**：Task 1–4，文档模型 + store + 全局结构历史；此时不得宣称完整保存恢复。
2. **Release B（编辑闭环）**：Task 6→7→5→8，增量渲染 + 点/构造/视口迁移 + 完整保存恢复 + 函数管理。
3. **Release C（学习闭环）**：Phase 3，探针 + 变化率 + 变换动画。
4. **Release D（智能分析）**：Phase 4，自定义函数数值特征。
5. **Release E（课程扩展）**：Phase 5/6，分段函数、场景和导出。

Release A 和 B 是后续任何新工具的前置条件。若只能做一部分，应先完成 A+B，而不是先做视觉上更显眼的动画或区域填色。任务编号因能力分组保留，权威执行顺序以这里及 Task 5 顶部依赖说明为准。
