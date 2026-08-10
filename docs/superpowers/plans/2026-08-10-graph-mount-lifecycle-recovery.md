# Function Canvas Mount Lifecycle Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复函数画布首次挂载未投影 GraphDocument、Board Session 创建失败不回滚的问题，并把 Task 9 与工程债务文档修正为可验证的真实状态。

**Architecture:** `GraphDocumentV2` 继续作为唯一业务真值；`graph-mount-controller.js` 只在 board/store/history 成功发布且所有 UI 资源可回收后，调用 production renderer 完成一次首次全量投影。`graph-board-session.js` 使用本地资源所有权栈，在成功时向外发布一个组合 disposer，在任一同步创建步骤失败时立即逆序回滚，避免半初始化 board、persistence、listener 或 subscriber 泄漏。

**Tech Stack:** JavaScript ESM、Node `node:test`、Vitest、JSXGraph runtime adapter、Vite、ESLint、Turbo、现有 `npm run quality` 门禁。

---

## 0. 执行依据与边界

本计划以 **2026-08-10 当前工作区真实代码、当前测试和当前 CI** 为事实来源。历史计划、本地 project skill 和旧报告只能用于导航；若与代码冲突，以代码与新鲜验证为准。

执行前必须阅读：

- `AGENTS.md`
- `apps/web/src/math/AGENTS.md`
- `docs/engineering/safe-change-playbook.md`
- `docs/engineering/js-hotspots.md` 中函数画布条目（其中旧行数需要在本计划 Task 4 修正）

### 已确认缺陷

1. `apps/web/src/math/graph/graph-mount-controller.js` 发布 `session.store` 和 `loadedDoc` 后，不再调用 `graphRenderer.fullRender(...)`。默认文档包含 `f1`，但 runtime `state.functions` 初始为空，因此首次挂载不会恢复函数、点、构造和视口。
2. `initGraphUI()` 在 DOM/已有 board guard 之前替换 `disposeSession` 并调用 `readoutsReset()`；同一轮重复 init 会丢失首轮 disposer 栈，之后无法释放首轮资源。
3. `apps/web/src/math/graph/graph-board-session.js` 在 allocator/store/history 全部成功前，已经把 persistence、board、view 等 disposer 注册到外部栈。中途抛错时调用方没有执行 `disposeAll()`，会泄漏已创建资源。
4. `docs/superpowers/plans/2026-08-10-main-runtime-quality-recovery.md` 的最终状态与 Task 9 未勾步骤、实际行数不一致；`docs/engineering/debt-registry.md` 的 D6 和 `docs/engineering/js-hotspots.md` 的画布行数也已过期。

### 非目标

- 不做新的产品功能或视觉改版。
- 不迁移 JSXGraph、Three.js 或其它渲染技术栈。
- 不继续大规模拆分 `graph/index.js` 或 `graph-mount-controller.js`；只保证本次修改不扩大结构预算。
- 不修改 `.grok/skills/`、`.cursor/` 或其它本地 skill；另一路任务负责 skill。
- 不改 Server、Electron、数据库、用户数据或生成目录。
- 按用户要求，不做浏览器交互验证；使用 fake DOM/board/storage/timer/RAF、构建和现有门禁验证。
- 未经用户本轮明确授权，不 push `origin/main`，不 force push，不合并本地 `main`。

### 当前结构预算

- `apps/web/src/math/graph/index.js`：当前约 690 行，必须继续 `< 700`。
- `apps/web/src/math/graph/graph-mount-controller.js`：当前 750 行，本轮不得提高 `tooling/architecture/large-file-budget.json` 中的 750 行预算。
- 为新增首次投影逻辑腾出行数时，只删除过时注释和空行；禁止把多条语句压到同一行规避门禁。

---

## 1. 目标文件与职责

| 文件                                                                 | 动作       | 职责                                                                                   |
| -------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| `apps/web/src/math/graph/graph-mount-controller.js`                  | 修改       | 在 mount 资源全部可回收后，执行且只执行一次首次 document 投影；保持 fatal/dispose 语义 |
| `apps/web/src/math/graph/graph-board-session.js`                     | 修改       | 将 board session 创建改成原子资源所有权事务；失败立即逆序回滚                          |
| `test/web/math-graph-mount-controller.test.cjs`                      | 修改       | 锁定非空文档首次投影、失败可销毁、集成回滚                                             |
| `test/web/math-graph-board-session.test.cjs`                         | 新建       | 对每个创建阶段做故障注入，验证本地回滚、成功发布和幂等清理                             |
| `docs/superpowers/plans/2026-08-10-main-runtime-quality-recovery.md` | 修改       | 如实标记 Task 9 部分完成与本轮纠偏证据                                                 |
| `docs/engineering/debt-registry.md`                                  | 修改       | 修正 D5/D6 当前状态和删除条件                                                          |
| `docs/engineering/js-hotspots.md`                                    | 修改       | 把 mount controller 行数和必跑测试更新为当前值                                         |
| `tooling/architecture/large-file-budget.json`                        | 原则上不改 | 750 是本轮上限，不得为修复抬高预算；只有实际行数下降时才允许同步下调                   |

不要创建通用生命周期框架，也不要让 `graph-board-session.js` 持有第二份 GraphDocument 状态。

---

## 2. Task 0：建立分支与新鲜基线

**Files:**

- Read: `AGENTS.md`
- Read: `apps/web/src/math/AGENTS.md`
- Read: `apps/web/src/math/graph/graph-mount-controller.js`
- Read: `apps/web/src/math/graph/graph-board-session.js`
- Read: `apps/web/src/math/graph/graph-document-renderer.js`
- Read: `test/web/math-graph-mount-controller.test.cjs`

- [x] **Step 1: 检查工作树与本地/远端关系**

Run:

```bash
git status --short --branch
git log --oneline --decorate -8
git rev-list --left-right --count main...origin/main
```

Expected:

- 记录当前实际 HEAD，不把计划中的历史 SHA 当作起点。
- 允许本计划文件自身作为已知未提交文档；若还存在其它非本任务改动，停止并报告，不覆盖、不暂存、不清理。
- 当前已知本地 `main` 可能比 `origin/main` 多 3 个文档提交；必须保留。

- [x] **Step 2: 从当前本地 main 创建修复分支**

Run:

```bash
git switch -c codex/fix-graph-mount-lifecycle
```

Expected: 当前分支为 `codex/fix-graph-mount-lifecycle`。

- [x] **Step 3: 运行修改前最小基线**

Run:

```bash
node --test test/web/math-graph-mount-controller.test.cjs test/web/math-graph-document-renderer.test.cjs
(cd apps/web && npx vitest run ../../test/web/math-graph-store.vitest.ts)
npm run lint:critical
npm run lint:large-files
```

Expected: 全部 PASS。若基线已经失败，先记录失败并停止；不要把既有失败混入本修复。

- [x] **Step 4: 记录基线，不提交代码**

在执行日志中记录：HEAD、分支、测试数量、`graph/index.js` 与 `graph-mount-controller.js` 行数。不要为“记录基线”创建空提交。

---

## 3. Task 1：恢复首次 GraphDocument 全量投影

**Files:**

- Modify: `test/web/math-graph-mount-controller.test.cjs`
- Modify: `apps/web/src/math/graph/graph-mount-controller.js`
- Verify: `apps/web/src/math/graph/graph-document-renderer.js`

### 行为合同

1. 首次 mount 必须调用一次且仅一次 `graphRenderer.fullRender(state.graphStore.getDocument())`。
2. 调用发生在 `state.board`、`state.graphStore`、`state.graphHistory` 已发布之后。
3. 调用发生在 tool strip、notes、UI bindings 等资源已经注册 disposer 之后，使首次渲染失败时仍能完整 `disposeGraph()`。
4. 成功后将 `state.startCoeffs` 与 renderer 已镜像到 runtime 的 `state.coeffs` 对齐，并再次 `syncSliders()`。
5. `fullRender` 返回失败时不导入默认文档、不 dispatch、不持久化、不二次重试。production renderer 自己进入 fatal/read-only；mount 只保证资源仍可销毁。
6. 重复调用 `initGraphUI()` 且已有 `state.board` 时，不得再次 full render。
7. DOM 缺失或已有 board 的快速返回分支不得创建/替换活动 `disposeSession`，也不得调用 `readoutsReset()`；只有真正开始一轮新 mount 时才能建立新 session。

- [x] **Step 1: 扩展测试 helper，使它能保存非空文档并观察 fullRender**

在 `makeController()` 内为默认 fake 增加可观察行为。不要只做源码正则测试。

建议形态：

```js
const loadedDocument = overrides.loadedDocument || {
  functions: [],
  points: [],
  constructions: [],
  view: { boundingBox: [-8, 8, 8, -8] },
  annotations: [],
};

// createGraphPersistence.load() 返回 loadedDocument；
// createGraphStore(initialDocument).getDocument() 返回同一份 initialDocument；
// graphRenderer.fullRender(document) 记录调用并以最小 production 语义
// 把 document.functions/activeFunctionId 镜像进 fake state。
```

不要把 `loadedDocument` 当作生产实现依赖；它只属于测试 helper。

- [x] **Step 2: 写“非空文档首次投影一次”的失败测试**

测试至少包含：

```js
test('首次 mount 将 store 中的非空 GraphDocument 全量投影一次', async () => {
  // 文档至少有：1 个函数、1 个点、1 个构造、非默认 boundingBox。
  // initGraphUI() 后断言：
  // 1. fullRender 调用次数 === 1；
  // 2. 参数严格等于 store.getDocument()；
  // 3. fake runtime 的 functions/activeFnId 已来自该文档；
  // 4. startCoeffs 与 fullRender 后的 state.coeffs 一致；
  // 5. syncSliders 在成功投影后再次执行；
  // 6. 第二次 initGraphUI() 不增加 fullRender 次数；
  // 7. disposeGraph() 后首轮资源仍全部归零。
});
```

通过 fake `syncRangeNumber` 记录同步次数：UI bindings 的首次同步会调用 3 次，成功 full render 后再次同步应再调用 3 次。不要只断言最终 DOM 值。

- [x] **Step 3: 写“首次渲染失败仍可完整销毁”的失败测试**

注入：

```js
graphRenderer: {
  fullRender: () => ({ ok: false, fatal: true }),
  recover: () => ({ ok: false, fatal: true }),
  dispose: () => {},
}
```

断言：

- `fullRender` 只调用一次。
- `initGraphUI()` 不用默认文档覆盖 store。
- `state.startCoeffs` 不因失败结果更新，且失败后不执行第二轮 slider 同步。
- 调用 `disposeGraph()` 后 `freeMathBoard`、persistence/store/history/readouts disposer 各执行一次。
- 重复 `disposeGraph()` 不产生额外副作用。

- [x] **Step 4: 写“重复 init 不覆盖活动 disposer session”的失败测试**

在同一轮中连续调用两次 `initGraphUI()`，中间不 dispose。断言：

- `createMathBoard`、`readoutsReset` 和 `fullRender` 均只执行一次。
- 第二次 init 只执行已有 board 的 resize/UI refresh 快速路径。
- 随后的 `disposeGraph()` 仍释放首轮 persistence、board、store、history、readouts、listener、timer、RAF 和 observer，各恰好一次。
- DOM 缺失时调用 `initGraphUI()` 不创建新 dispose session、不 reset readouts；之后补齐 DOM 再 init 仍能正常建立并释放完整 session。

- [x] **Step 5: 运行测试并确认它因缺少 fullRender/session 覆盖而失败**

Run:

```bash
node --test test/web/math-graph-mount-controller.test.cjs
```

Expected: 首次投影测试因 `fullRender` 调用次数 `0 !== 1` 失败；重复 init 测试因首轮 disposer 未执行或 `readoutsReset` 执行两次失败。既有测试仍应保持通过。

- [x] **Step 6: 只在真正新 mount 时创建 dispose session**

调整 `initGraphUI()` 开头顺序：

```js
function initGraphUI() {
  setStageEl(document.getElementById('mathGraphStage'));
  const stageEl = getStageEl();
  if (!stageEl || !document.getElementById('mathGraphBoard')) return;

  if (state.board) {
    // 保留现有 resize/UI refresh 快速路径
    return;
  }

  disposeSession = createDisposeSession();
  readoutsReset?.();
  // 开始真正的新 mount
}
```

不得在 DOM guard 或 `state.board` guard 之前替换活动 session。不得用“第二次 init 前先 dispose”掩盖该问题，因为课堂壳可能合法地重复请求同一 tab 初始化。

- [x] **Step 7: 在 mount 末端恢复首次投影**

在 `initGraphUI()` 中，所有 board session、notes、UI bindings、theme handle、readouts disposer 注册完成后，函数返回前执行：

```js
const initialRender = graphRenderer.fullRender(state.graphStore.getDocument());
if (initialRender?.ok) {
  state.startCoeffs = { ...state.coeffs };
  syncSliders();
}
```

实现约束：

- 不直接操作 JSXGraph element；继续经 renderer 投影。
- 不调用 `rebuildCurve()` 代替 `fullRender()`。
- 不把 `loadedDoc` 再写回 Store。
- 不修改 renderer 的 fatal 规则。
- 删除同文件中过时的 `Task 9` 过程注释/空行以保持总行数不超过 750；不要压缩可读代码。

- [x] **Step 8: 运行最小行为回归**

Run:

```bash
node --test test/web/math-graph-mount-controller.test.cjs test/web/math-graph-document-renderer.test.cjs
(cd apps/web && npx vitest run ../../test/web/math-graph-store.vitest.ts)
npm run lint:critical
npm run lint:large-files
```

Expected: 全部 PASS；large-file budget 不增加。

- [x] **Step 9: 检查 diff 并提交 Task 1**

Run:

```bash
git diff --check
git diff -- apps/web/src/math/graph/graph-mount-controller.js test/web/math-graph-mount-controller.test.cjs
git add apps/web/src/math/graph/graph-mount-controller.js test/web/math-graph-mount-controller.test.cjs
git commit -m "fix(graph): preserve mount session and initial projection"
```

Expected: 一个只包含首次投影及测试的提交。

---

## 4. Task 2：使 Graph Board Session 创建具备原子回滚

**Files:**

- Create: `test/web/math-graph-board-session.test.cjs`
- Modify: `apps/web/src/math/graph/graph-board-session.js`
- Modify: `test/web/math-graph-mount-controller.test.cjs`

### 所有权设计

`createGraphBoardSession()` 在内部维护一个 `ownedDisposers` 栈：

```js
const ownedDisposers = [];
let cleaned = false;

function own(disposer) {
  if (typeof disposer === 'function') ownedDisposers.push(disposer);
}

function cleanupOwned() {
  if (cleaned) return;
  cleaned = true;
  const errors = [];
  for (let i = ownedDisposers.length - 1; i >= 0; i -= 1) {
    try {
      ownedDisposers[i]();
    } catch (error) {
      errors.push(error);
    }
  }
  ownedDisposers.length = 0;
  if (errors.length) console.error('[graph] board session dispose errors:', errors);
}
```

构建期间只调用 `own()`，不直接调用外部 `register()`。全部资源、subscriber 和 history 创建成功后，只向外注册一次组合 disposer：

```js
register(cleanupOwned);
return { persistence, board, store, history, idAllocator, storeUnsub, loadedDoc };
```

整个创建过程放在 `try/catch` 中：

```js
try {
  // create resources and own their disposers
  register(cleanupOwned);
  return session;
} catch (error) {
  cleanupOwned();
  throw error;
}
```

这不是第二套全局生命周期管理器：它只是 board session 在“成功发布之前”的本地资源事务。成功后仍由 mount controller 的全局 disposer 栈统一驱动。

### 必须保持的依赖安全清理顺序

正常 dispose 和失败 rollback 都必须按本地所有权栈逆序。`store.dispose` 必须在 store 创建成功后立即登记，因此 subscriber/history 会先解除，再销毁 store：

```text
store unsubscribe
history.dispose
store.dispose
board listener / point fusion / constructions / points / curves / freeMathBoard
viewBridge.dispose
persistence.dispose
```

- [x] **Step 1: 新建 board session 的独立故障注入测试**

`test/web/math-graph-board-session.test.cjs` 直接动态导入真实 `createGraphBoardSession`，只 fake 它的依赖和 `window.localStorage`。测试结束必须恢复 global。

建立 `makeDeps({ failAt })` helper，支持在以下阶段抛错：

- `persistence.load`
- `createMathBoard`
- `bindPointLabelFusion`
- `createGraphIdAllocator`
- `createGraphStore`
- `createGraphHistory`
- `history.clear`
- `store.subscribe`
- 外部 `register`

每个资源的 dispose/free/unsubscribe 都写入 `calls` 数组。

- [x] **Step 2: 写“每个中间失败点都会立即回滚”的失败测试**

表驱动测试应验证：

```js
for (const failAt of failureStages) {
  assert.throws(() => createGraphBoardSession(makeDeps({ failAt })), /injected/);
  // 只断言该阶段之前确实创建成功的资源被清理一次。
  // 外部 register 之前失败：不得留下外部 disposer。
  // board 已创建后失败：freeMathBoard 必须恰好一次。
  // store 已创建后失败：store.dispose 必须恰好一次。
}
```

还要断言清理顺序为已创建资源的严格逆序，而不是只检查“出现过”。

- [x] **Step 3: 写“成功时只发布一个组合 disposer”的失败测试**

断言：

- `createGraphBoardSession()` 返回完整 session。
- 创建阶段没有提前 dispose。
- 外部 `register` 只收到一个函数。
- 执行该函数后，资源按逆序各清理一次。
- 第二次执行同一函数无副作用。

- [x] **Step 4: 写 mount controller 集成失败测试**

在 `math-graph-mount-controller.test.cjs` 注入 `createGraphStore()` 抛出 `injected store failure`，断言：

- `initGraphUI()` 抛出原始错误，不改写错误类型。
- persistence 和 board 已立即释放一次。
- `state.board`、`state.graphStore`、`state.graphHistory` 均未发布。
- 随后调用 `disposeGraph()` 两次仍安全，不重复释放。

- [x] **Step 5: 运行红测试**

Run:

```bash
node --test test/web/math-graph-board-session.test.cjs test/web/math-graph-mount-controller.test.cjs
```

Expected: 新增故障注入用例 FAIL，表现为 persistence/board/store 的 dispose 次数为 0 或外部 disposer 已被部分注册。

- [x] **Step 6: 实现本地 owned disposer 栈与组合发布**

修改 `graph-board-session.js`：

1. persistence 创建后立即 `own(() => persistence.dispose())`。
2. `createMathBoard()` 成功后立即登记 board 清理，再调用 `bindPointLabelFusion()`；否则 fusion 绑定抛错时会泄漏刚创建的 board。view bridge 和 board 清理分别 `own(...)`，保持现有相对顺序。
3. store 创建成功后立即 `own(() => store.dispose())`，然后才创建 history；如果 history 创建抛错，store 也必须回滚。
4. history 创建后立即 `own(() => history.dispose())`，然后才调用 `history.clear()`；如果 clear 抛错，history/store/board/view/persistence 必须全部回滚。
5. subscribe 成功后 `own(() => storeUnsub())`；逆序清理时 subscriber/history 必须先于 store 释放。
6. 全部成功后调用一次外部 `register(cleanupOwned)`。
7. 任一步抛错时 `cleanupOwned()` 后原样 rethrow。
8. rollback 自身某个 disposer 抛错时继续清理其余资源，并输出聚合错误；原始创建错误仍是最终抛出的错误。

注意 `store.dispose` 的注册时点：必须紧跟 `createGraphStore()` 成功之后，不能等到 subscribe 成功之后。

- [x] **Step 7: 运行 board/mount/renderer/store 回归**

Run:

```bash
node --test \
  test/web/math-graph-board-session.test.cjs \
  test/web/math-graph-mount-controller.test.cjs \
  test/web/math-graph-document-renderer.test.cjs
(cd apps/web && npx vitest run ../../test/web/math-graph-store.vitest.ts)
npm run lint:critical
```

Expected: 全部 PASS；错误注入后所有资源归零。

- [x] **Step 8: 检查 diff 并提交 Task 2**

Run:

```bash
git diff --check
git diff -- apps/web/src/math/graph/graph-board-session.js test/web/math-graph-board-session.test.cjs test/web/math-graph-mount-controller.test.cjs
git add apps/web/src/math/graph/graph-board-session.js test/web/math-graph-board-session.test.cjs test/web/math-graph-mount-controller.test.cjs
git commit -m "fix(graph): roll back partial board sessions"
```

Expected: 一个只包含 board session 原子回滚及测试的提交。

---

## 5. Task 3：生命周期压力与结构防回归

**Files:**

- Modify: `test/web/math-graph-mount-controller.test.cjs`（仅当现有 20 轮用例未自动覆盖新行为）
- Modify: `test/web/math-graph-board-session.test.cjs`
- Verify: `test/web/math-graph-structure.test.cjs`
- Verify: `tooling/architecture/large-file-budget.json`

- [x] **Step 1: 确认 20 轮 mount/dispose 也锁定首次投影次数**

在现有 20 轮测试中补充：每一轮新 board mount 恰好一次 `fullRender`，同一轮已有 board 的重复 init 不重复投影。

Expected total: 20 轮完整 mount 最终 `fullRender` 次数恰好 20，不是 0、21 或 40。

- [x] **Step 2: 增加 rollback disposer 抛错测试**

让一个中间 disposer 抛错，例如 `history.dispose()` 抛出；断言：

- `store.dispose`、board free、persistence dispose 仍继续执行。
- 聚合错误通过一次可见日志输出。
- 创建阶段的原始错误仍被 rethrow，不被 cleanup error 覆盖。

- [x] **Step 3: 运行画布生命周期与结构测试**

Run:

```bash
node --test \
  test/web/math-graph-board-session.test.cjs \
  test/web/math-graph-mount-controller.test.cjs \
  test/web/math-graph-document-renderer.test.cjs \
  test/web/math-graph-structure.test.cjs \
  test/web/math-board-contract.test.cjs
(cd apps/web && npx vitest run \
  ../../test/web/math-graph-store.vitest.ts \
  ../../test/web/math-graph-performance.vitest.ts \
  ../../test/web/math-lifecycle-unit.vitest.ts)
npm run lint:large-files
```

Expected:

- 所有测试 PASS。
- `graph/index.js < 700`。
- `graph-mount-controller.js <= 750`。
- 不修改或抬高 large-file budget。

- [x] **Step 4: 只在有新增测试改动时提交**

Run:

```bash
git status --short
git add test/web/math-graph-board-session.test.cjs test/web/math-graph-mount-controller.test.cjs
git commit -m "test(graph): lock mount projection lifecycle"
```

若 Task 1/2 已完整包含本 Task 的测试且工作树无新增差异，则不要创建空提交。

---

## 6. Task 4：修正文档和债务状态，不伪造“全部完成”

**Files:**

- Modify: `docs/superpowers/plans/2026-08-10-main-runtime-quality-recovery.md`
- Modify: `docs/superpowers/plans/2026-08-10-graph-mount-lifecycle-recovery.md`
- Modify: `docs/engineering/debt-registry.md`
- Modify: `docs/engineering/js-hotspots.md`
- Verify: `tooling/architecture/large-file-budget.json`

- [x] **Step 1: 修正原恢复计划的 Task 9 状态**

在原计划 Task 9 和最终状态中明确：

- T1–T8 已完成并由现有门禁/CI验证。
- T9 是“部分完成后补齐生命周期正确性”，不是达到原结构目标。
- `graph-board-session`、`graph-ui-bindings`、`graph-dispose-session` 已提取。
- 原目标 `index.js <= 560`、`graph-mount-controller.js <= 600` 未达到；实际约为 690/750。
- 不允许把原目标改写成 690/750 来制造“达标”。690/750 是当前有界债务和门禁，不是原目标完成。
- 本轮修复首次投影与原子 rollback 后，可将行为/生命周期步骤标记完成；结构预算 Step 5 保持未完成。
- 在实现日志追加本轮提交 SHA、最小测试和全局门禁结果，不能预填 PASS。
- 按实际进度更新本计划的复选框；失败或未验证项必须保持未勾选并写明原因。

- [x] **Step 2: 修正 debt registry**

更新 D5：

- 当前事实：`index.js` 约 690 行、mount controller 不超过 750 行。
- 当前保护：`index.js < 700`、mount controller `<= 750` 门禁。
- 剩余目标：继续按职责下降到原计划 560/600，另开结构债计划；本轮不继续拆。

更新 D6：

- 不再写“待建基线”。
- 写明 lint baseline v2 已启用，权威快照是 `docs/engineering/lint-baseline.json`。
- `lint:critical` 对运行时安全规则零容忍；baseline 只管理其余旧债且不得增长。
- 旧 JS/TS 迁移仍是长期债务，因此 D6 不应错误标为“全部关闭”。

- [x] **Step 3: 修正 JS hotspots 当前行数和测试入口**

将 `docs/engineering/js-hotspots.md` 中 `graph-mount-controller.js（950）` 更新为实际行数，并把新增测试加入“改前必跑”：

```bash
node --test \
  test/web/math-graph-board-session.test.cjs \
  test/web/math-graph-mount-controller.test.cjs \
  test/web/math-graph-document-renderer.test.cjs
(cd apps/web && npx vitest run \
  ../../test/web/math-graph-document.vitest.ts \
  ../../test/web/math-user-points.vitest.ts \
  ../../test/web/math-graph-store.vitest.ts)
```

- [x] **Step 4: 不更新本地 project skill**

确认 diff 中不存在：

```text
.grok/skills/
.cursor/
本机其它 skill 安装目录
```

skill 的同步由另一条任务线处理。

- [x] **Step 5: 运行文档与结构检查**

Run:

```bash
npx prettier --check \
  docs/superpowers/plans/2026-08-10-main-runtime-quality-recovery.md \
  docs/superpowers/plans/2026-08-10-graph-mount-lifecycle-recovery.md \
  docs/engineering/debt-registry.md \
  docs/engineering/js-hotspots.md
npm run lint:large-files
node --test test/web/math-graph-structure.test.cjs test/shared/lint-baseline-regression.test.cjs
git diff --check
```

Expected: 全部 PASS，文档数字与当前文件行数一致。

- [x] **Step 6: 提交文档纠偏**

Run:

```bash
git add \
  docs/superpowers/plans/2026-08-10-main-runtime-quality-recovery.md \
  docs/superpowers/plans/2026-08-10-graph-mount-lifecycle-recovery.md \
  docs/engineering/debt-registry.md \
  docs/engineering/js-hotspots.md
git commit -m "docs(eng): align graph recovery status"
```

Expected: 文档提交不混入生产代码或 skill。

---

## 7. Task 5：最终质量验收

**Files:**

- Verify only: entire repository, excluding generated/user-data paths

- [x] **Step 1: 运行完整目标回归**

Run:

```bash
node --test \
  test/web/math-graph-board-session.test.cjs \
  test/web/math-graph-mount-controller.test.cjs \
  test/web/math-graph-document-renderer.test.cjs \
  test/web/math-graph-structure.test.cjs \
  test/web/math-board-contract.test.cjs
(cd apps/web && npx vitest run \
  ../../test/web/math-graph-store.vitest.ts \
  ../../test/web/math-graph-performance.vitest.ts \
  ../../test/web/math-lifecycle-unit.vitest.ts)
```

Expected: 全部 PASS。

Evidence（本轮）：node `--test` 目标套件 + supervisor/kill-tree 相关 = **61 PASS**；vitest 三文件 = **40 PASS**。

- [x] **Step 2: 运行无缓存完整质量门禁**

Run:

```bash
TURBO_FORCE=true npm run quality
```

Expected:

- format、lint、`lint:critical`、baseline、typecheck、architecture、large files、theme、assets、tests、build、budget、coverage、diff 全部 PASS。
- 不得只引用历史 CI 或 Turbo cache 命中作为证据。

Evidence（本轮）：`TURBO_FORCE=true npm run quality` **exit 0**；末段 build 汇总 `Cached: 0 cached, 21 total`（无缓存命中）。

- [x] **Step 3: 检查结构预算与禁止路径**

Run:

```bash
wc -l \
  apps/web/src/math/graph/index.js \
  apps/web/src/math/graph/graph-mount-controller.js \
  apps/web/src/math/graph/graph-board-session.js
git diff main...HEAD --name-only
```

Expected:

- `index.js < 700`。
- `graph-mount-controller.js <= 750`。
- diff 不含用户数据、`dist/`、coverage、stage、Electron 产物、嵌套 lockfile、本地 skill。

Evidence（本轮）：`index.js` 690 / `graph-mount-controller.js` 743（hardMax 750）/ `graph-board-session.js` 143。

- [x] **Step 4: 检查提交与工作树**

Run:

```bash
git diff --check
git status --short --branch
git log --oneline --decorate main..HEAD
```

Expected:

- `git diff --check` 无输出。
- 工作树干净。
- 提交按功能边界分开，建议为 3–4 个：首次投影、原子回滚、补充测试（如需要）、文档纠偏。

- [x] **Step 5: 形成最终报告但不擅自合并或推送**

报告必须包含：

1. 根因与修改文件。
2. 新增测试名称及红→绿证据。
3. 首次 mount 的 `fullRender` 次数。
4. 每个故障注入阶段的回滚结果和清理顺序。
5. `TURBO_FORCE=true npm run quality` 的真实退出结果。
6. 三个关键文件最终行数。
7. 文档中 Task 9 的真实状态。
8. 提交 SHA。
9. `git status --short --branch`。
10. 明确写出：未做浏览器交互验证、未改 skill、未 push/未合并。

### Task 5 最终报告（`5d4d113`，分支 `fix/math-graph-first-mount-selection`）

1. **根因 / 本轮补强：**（a）首进函数画布样式失效：`fullRender` 后未 `reregisterSelectable`（`ea8f4d1`）；（b）supervisor 测试用假 PID 默认 `process.kill(-pid)` 可误杀主机进程组 → 注入 `killProcessTree` / `memoryKillProcessTree`（`a49b90b`）；（c）750 行登记被 +15% 软容差架空 → `hardMax: 750` + 控制器压回 743（`6e7a452`）。另含工具条折叠箭头对调（`974939f`）。
2. **测试：** `首次 mount：fullRender 成功后必须 reregisterSelectable`；`memoryKillProcessTree 只调 child.kill…`；supervisor SIGTERM 用例断言 `process.kill` 未被调用。目标回归 61 + vitest 40 PASS。
3. **首次 `fullRender`：** 成功路径恰好一次（既有用例锁定）；之后 `reregisterSelectable` 一次。
4. **回滚：** Task 2/3 既有 FAIL_STAGES / disposer 聚合用例仍 PASS（本轮未改 board-session 语义）。
5. **Quality：** `TURBO_FORCE=true npm run quality` → **exit 0**，`Cached: 0`。
6. **行数：** index 690 / mount-controller 743 / board-session 143。
7. **Task 9：** 结构目标 560/600 **仍未完成**；当前有界债务 hardMax 750 / index <700（见 D5）。
8. **HEAD：** `5d4d113`（相对 `main`=`cc21ca4` 另有 `ea8f4d1`…`6e7a452`）。
9. **状态：** `## fix/math-graph-first-mount-selection`，工作树干净。
10. **未做：** 浏览器交互验证；未改本地 skill；未 merge；未 push。

停止在修复分支，等待负责人决定是否合并或推远端。

---

## 7.5 实现日志

> 每完成一个 Task 追加一行，不覆盖历史。全局门禁结果以 Task 5 实际执行为准，不预填 PASS。

| Task               | Commit    | 最小测试                                                                                                                                                                                                                                                                                                                    | 备注                                                                     |
| ------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Task 1（首次投影） | `3058a71` | `node --test test/web/math-graph-mount-controller.test.cjs` → 18 PASS                                                                                                                                                                                                                                                       | 非空文档首次投影一次 / 渲染失败仍可完整销毁 / 重复 init 不覆盖 session   |
| Task 2（原子回滚） | `c90cec7` | `node --test test/web/math-graph-board-session.test.cjs test/web/math-graph-mount-controller.test.cjs` → 22 PASS                                                                                                                                                                                                            | 9 个 FAIL_STAGES 全部回滚；组合 disposer 逆序一次；mount 集成故障注入    |
| Task 3（压力补强） | `d14cf07` | `node --test test/web/math-graph-board-session.test.cjs test/web/math-graph-mount-controller.test.cjs test/web/math-graph-document-renderer.test.cjs test/web/math-graph-structure.test.cjs test/web/math-board-contract.test.cjs` → 45 PASS + `vitest run`（store/performance/lifecycle）→ 40 PASS + `lint:large-files` OK | 20 轮 mount 投影恰好 20 次；history.dispose 抛错不阻断其余、聚合日志一次 |
| Task 4（文档纠偏） | `03a8858` | `npx prettier --check` + `npm run lint:large-files` + `node --test test/web/math-graph-structure.test.cjs test/shared/lint-baseline-regression.test.cjs` → 15 PASS + `git diff --check` 无输出                                                                                                                              | Task 9 状态、D5/D6、js-hotspots 已对齐当前事实                           |
| Task 5（最终验收） | `5d4d113` | 目标回归 61 PASS + vitest 40 PASS；`TURBO_FORCE=true npm run quality` exit 0（Cached: 0）                                                                                                                                                                                                                                   | 含首 mount selection / killProcessTree 注入 / hardMax 750；未 merge/push |

未做：浏览器交互验证、本地 skill 修改、push/merge。

---

## 8. 完成定义

只有同时满足以下条件，才能宣布本计划完成：

- [x] 非空 GraphDocument 首次挂载时，production renderer 恰好执行一次 full render。
- [x] 初始函数、点、构造、active function 和 view 均通过 renderer 从 Store 文档投影；不建立第二份真值。
- [x] 首次 full render 失败进入现有 fatal/read-only 路径，且所有已挂载资源仍能完整、幂等释放。
- [x] board session 在 persistence、board、binding、allocator、store、history、subscribe、外部 register 任一步失败时都立即逆序回滚。
- [x] rollback 中一个 disposer 失败不会阻断其余清理，也不会覆盖原始创建错误。
- [x] 20 轮 mount/dispose 无 listener、timer、RAF、observer、URL、board、Store 或 persistence 泄漏。
- [x] `graph/index.js < 700`，`graph-mount-controller.js <= 750`，没有抬高预算掩盖新增代码。
- [x] 原恢复计划、债务登记和热点地图与当前代码一致；Task 9 未达结构目标的部分保持公开。
- [x] `TURBO_FORCE=true npm run quality` 新鲜通过，工作树干净。
- [x] 没有修改用户数据、生成物、本地 skill；没有未经授权的合并或 push。

## 9. 否决项

出现任一情况不得交付：

- 用 `rebuildCurve()`、主题事件或用户第一次操作代替首次 `fullRender()`。
- `fullRender()` 在 board/store 发布前执行。
- 初始投影失败后静默加载默认文档，覆盖用户持久化内容。
- board session 仍在创建过程中直接向外注册多个 disposer。
- rollback 只清 state、不释放真实 board/listener/persistence/store。
- 为通过门禁把 mount controller 预算提高到 751 以上。
- 把原计划 560/600 目标改成 690/750 并宣称完成。
- 只跑历史报告或缓存测试，没有新鲜完整门禁。
- 混入 `.grok/skills`、用户数据、构建产物或其它任务线改动。
- 未经授权 push `origin/main` 或 force push。
