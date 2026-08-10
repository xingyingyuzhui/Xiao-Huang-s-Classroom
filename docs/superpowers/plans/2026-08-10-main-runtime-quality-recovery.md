# Main 运行时、质量门禁与性能收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复当前 `main` 上函数画布与学科大厅的真实运行时回归，恢复 Node 20/24 一致的绿色质量链，并把“生产 JS 未定义引用、干净 Server 启动、无效动态导入和关键包体”纳入可重复门禁。

**Architecture:** 保持 GraphDocumentV2 → Store/History → Render Plan → Runtime Layer → JSXGraph 的既有方向，不回退拆分；修复方式是让每个工厂显式拥有并消费自己的依赖，禁止跨模块隐式闭包。质量体系分为“零容忍运行时安全规则”和“允许逐步下降的历史 lint 基线”，Server 则统一由 Turbo 构建图提供产物，再通过自包含启动 smoke 验证源码、开发与打包布局。

**Tech Stack:** Vite 6、Vitest 4、Node `node:test`、ESLint 10 flat config、Turborepo 2、TypeScript 5、tsup、Express、JSXGraph、KaTeX、Three.js、GitHub Actions。

---

## 0. 文档定位

这是一次“先恢复可信度，再继续扩展”的修复计划，不是新功能计划，也不是重新推翻现有工程体系。

### 0.1 审查基线（2026-08-10）

| 项目           | 当前证据                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------- |
| Git            | `main == origin/main == b0ec7fa`，审查结束时工作树干净                                       |
| 远端 Quality   | 失败：Server Vitest 107 项通过后，Node 20 无法解析已迁空的 `test/server/*.cjs`               |
| 远端 Electron  | macOS + Windows `electron-package` 成功                                                      |
| 本机无缓存测试 | Turbo 24/24 tasks + shared 76 项通过；Web 132 node:test + 353 Vitest；Server 107；Desktop 22 |
| Typecheck      | 20/20 tasks 通过，但 Web 只覆盖 TS；旧业务 JS 不受 TS 保护                                   |
| 全仓 ESLint    | 320 problems（235 errors / 85 warnings）；baseline=393，因此当前门禁仍返回成功               |
| 架构           | 378 个源文件无依赖方向违规/循环；41 个大文件在预算内                                         |
| Bundle         | mathviz 1256/1350 KiB、three 673/730 KiB、index 616/720 KiB、total 2782/4200 KiB             |
| 画布专项       | Store/Renderer/性能相关 35 项通过，但没有覆盖真实 runtime factory 的完整接线                 |

### 0.2 已确认的真实故障

1. `graph-function-runtime.js` 的 `rebuildCurve()` 收到 `context`，却直接访问 24 处不存在的局部标识符。
2. `graph-follow-targets.js` 遗漏 `vertexFeatureOfFn`、legacy follow id、label fusion 调度依赖。
3. `graph-mount-controller.js` 调用未注入的 `reregisterSelectable`。
4. `graph/index.js` 重置不属于自身的 `lastReferenceKey`。
5. `construction/render-lines.js` 的割线创建遗漏 `boardLabelAttrs` 导入，已复现 `ReferenceError`。
6. `subjects/hub.js` 返回大厅时调用不存在的 `getSubject`，已复现 `ReferenceError`。
7. Server 测试入口保留空 CJS glob：Node 20 失败，Node 24 以 0 项测试成功。
8. 干净检出直接加载 Server JS bridge 时缺 `apps/server/dist`；`start/dev` 未声明构建前置。
9. `lint:baseline` 只比较每条 rule 的全仓计数，旧问题减少可以抵消核心路径新增的同规则问题。

### 0.3 不在本计划内

- 不改大厅视觉、书籍动作、cover-dissolve 产品行为。
- 不替换 JSXGraph，不处理第三方 JessieCode 内部 `eval`；继续执行 ADR-0003 的零调用面策略。
- 不全仓 TS 化，不一次性清零全部 320 条 lint 存量。
- 不删除 `pkg` 便携版，不宣称完成 Windows portable 目标机验收。
- 不做浏览器/CDP 交互验收；按用户要求使用 fake DOM/board/timer/RAF、构建、测试和打包证据。
- 不推 `origin/main`，除非用户在执行当轮明确授权。

---

## 1. 总体设计与完成定义

### 1.1 修复顺序

```text
P0 行为复现
  → 修复 Graph runtime 注入与 Hub/割线崩溃
  → 建立生产 JS 零容忍安全门禁
  → 修复跨 Node 测试入口与 Turbo 假绿
  → 修复 Server 干净启动/开发监听
  → 收口动态导入与 bundle 预算
  → 更新工程文档与远端 CI 证据
```

### 1.2 完成定义

- [ ] 所有已识别的生产源码真实 `no-undef` 为 0；浏览器/Node 合法全局不误报。
- [ ] 真实调用 `rebuildCurve()`、`listFollowTargets()`、函数依赖解绑/重绑、割线创建、返回大厅均有行为测试。
- [ ] `npm run lint:critical` 同时进入 `quality` 与 `quality:fast`，坏 fixture 能证明门禁会失败。
- [ ] lint baseline 改为“文件 + rule + message + 源码上下文摘要 + count”的稳定指纹；删除旧问题允许，新文件、新上下文或新增次数必须失败。生产运行时规则另由 `lint:critical` 保证零存量。
- [ ] `apps/server` 测试入口不再引用 `test/server/*.cjs`，Node 20 和 Node 24 行为一致。
- [ ] 根 `npm test` 不再依赖直接 `pretest` 构建的隐含产物；Turbo 任务图是唯一测试构建编排。
- [ ] 干净环境 `npm run start -w @xiaohuang/server` 和 `npm run dev:server` 可启动并通过 `/api/health` smoke，测试数据只写系统临时目录。
- [ ] Vite 三条“动态和静态同时导入”的警告归零；JSXGraph eval 与大 chunk 仍按 ADR/预算明确登记。
- [ ] bundle 预算同时记录 raw、gzip、初始/懒加载请求集合与请求数，不只统计文件总字节。
- [ ] 本地无缓存质量链、干净检出质量链、Electron packaged resource 验证、远端 Quality/Electron CI 都有新证据。

### 1.3 文件职责锁定

| 文件/模块                         | 修复后的唯一职责                                                              |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `graph/index.js`                  | 装配依赖和导出薄代理；不得拥有 runtime 子模块私有缓存                         |
| `graph-function-runtime.js`       | 函数曲线、活动特征和参考曲线 runtime 投影；所有外部能力来自 factory context   |
| `graph-follow-targets.js`         | 跟随目标、snap、selection 注册；不偷读 index 模块常量/函数                    |
| `graph-mount-controller.js`       | board/store/history/persistence/controller 生命周期；所有业务闭包从 deps 解构 |
| `construction/render-lines.js`    | 线、切线、割线 JSXGraph 工厂；渲染属性显式导入                                |
| `subjects/hub.js`                 | 大厅生命周期和返回编排；学科元数据只从 runtime manifest adapter 获取          |
| `eslint.critical.config.mjs`      | 生产 JS 会导致运行时崩溃的零容忍规则，不承载历史风格债                        |
| `scripts/lint-baseline.mjs`       | 存量 lint 指纹只能减少，不能换位置或新增后被总量抵消                          |
| `apps/server/package.json`        | Server 自身 build/test/start/dev 合同，不引用已迁移目录                       |
| `scripts/verify-server-start.mjs` | 临时数据目录、动态空闲端口、start/dev health 探测、进程树回收                 |
| `scripts/dev-all.mjs`             | Web 与 Server 开发进程的跨平台监督、失败传播和整棵进程树回收                  |
| `tooling/performance/budget.mjs`  | raw/gzip/初始及懒加载请求预算；失败信息指出具体资产和超限维度                 |

---

## 2. 执行纪律

### 2.1 分支和工作区

- [ ] 从已同步且干净的 `main` 创建 `codex/fix-main-runtime-quality`。
- [ ] 推荐独立 worktree；多个执行者不得共享同一 `dist`、`.turbo`、coverage 或 Server 数据目录。
- [ ] 开工记录 `git status --short`、`git rev-parse HEAD`、`node -v`、`npm -v`。
- [ ] 不使用 `git reset --hard`、`git checkout --` 或 force push。
- [ ] 不提交 `apps/web/dist`、`apps/server/public`、任意 workspace `dist`、coverage、`.electron-stage`、`dist-electron`、用户数据。

### 2.2 并行禁区

同一 worktree 中不要并行运行会清理相同 `dist` 的命令。特别禁止同时执行：

```text
npm test
npm run typecheck
npm run build
npm run coverage
```

这些命令必须串行；需要并行 agent 时，每个 agent 使用独立 worktree。

### 2.3 每个任务的 TDD 规则

1. 先写能调用真实生产入口的失败测试。
2. 运行精确测试，记录预期 `ReferenceError`/非零退出。
3. 只在 owner 模块修复，不在测试里 mock 掉故障点。
4. 运行精确测试变绿，再跑相邻回归。
5. 每个提交结束时必须是绿提交；不要提交只有红测试的中间状态。

---

## 3. Task 1：建立 P0 运行时接线回归测试

**Files:**

- Create: `test/web/math-graph-runtime-wiring.vitest.ts`
- Modify: `test/web/math-graph-mount-controller.test.cjs`
- Reference: `test/web/math-graph-performance.vitest.ts`

- [x] **Step 1: 为 function runtime 建立真实 factory harness**

测试必须导入 `createGraphFunctionRuntime`，注入 fake board、state、frame task 和所有 context 函数，然后直接调用 `rebuildCurve()`；禁止只读取源码正则。

核心断言：

```ts
test('rebuildCurve 只消费注入依赖并保留 viewport', async () => {
  const calls: string[] = [];
  const runtime = createGraphFunctionRuntime(makeRuntimeDeps(calls));

  assert.doesNotThrow(() => runtime.rebuildCurve());
  assert.deepEqual(calls.slice(0, 3), ['cancel-frame', 'preserve-viewport', 'snapshot-points']);
  assert.equal(calls.filter((x) => x === 'render-list').length, 1);
});
```

- [x] **Step 2: 验证测试在当前代码上失败**

Run:

```bash
cd apps/web
npx vitest run ../../test/web/math-graph-runtime-wiring.vitest.ts
```

Expected: FAIL，错误至少包含 `curveRebuildTask is not defined` 或 `state is not defined`。

- [x] **Step 3: 为 follow targets 建真实目标列表测试**

至少覆盖：

- 可见二次函数产生 curve target + vertex feature target；
- legacy `graph:main` 兼容目标仍存在；
- `makeDrawHost().onChanged()` 只调用注入的 selection 注册、label fusion 和一次 board update；
- 隐藏函数不产生 target。

- [x] **Step 4: 为 mount controller 的依赖解绑/重绑路径补测试**

扩展现有 harness，触发 `detachFunctionDependents()` 与 `rebindFunctionDependents()`，断言：

- 不抛 `reregisterSelectable is not defined`；
- 每个操作完成后 selection 只重新注册一次；
- 删除顺序继续保持先 detach runtime，再修改 state 数组。

- [x] **Step 5: 与 Task 2 形成同一个绿色提交**

本 Task 只建立 Graph runtime/follow/mount 的红测试，并立即进入 Task 2 修复；Task 2 结束前不得开始割线或 Hub 测试，避免工作区被后续任务的预期失败污染。测试与对应生产修复同提交落地，不提交纯红状态。

---

## 4. Task 2：修复 Graph runtime/follow/mount 的依赖所有权

**Files:**

- Modify: `apps/web/src/math/graph/graph-function-runtime.js`
- Modify: `apps/web/src/math/graph/graph-follow-targets.js`
- Modify: `apps/web/src/math/graph/graph-mount-controller.js`
- Modify: `apps/web/src/math/graph/index.js`
- Test: `test/web/math-graph-runtime-wiring.vitest.ts`
- Test: `test/web/math-graph-mount-controller.test.cjs`
- Test: `test/web/math-graph-performance.vitest.ts`

- [ ] **Step 1: 修正 function runtime 的 factory context**

在 factory 顶部一次性解构全部依赖，`rebuildCurve` 开头必须取实例状态：

```js
export function createGraphFunctionRuntime(context) {
  const {
    getState,
    evalFnY,
    colors,
    activeFn,
    curveRebuildTask,
    withPreservedViewport,
    snapshotUserPoints,
    snapshotConstructions,
    clearAllConstructions,
    removeUserPointEls,
    restoreUserPoints,
    restoreConstructions,
    autoIntersectNewLine,
    lineLikeElOf,
    reregisterSelectable,
    renderFnList,
    syncParamPanel,
    paintReadouts,
    mirrorActiveToLegacy,
    boardLabelAttrs,
    applyBoardLabel,
    formatElementCoordsLabel,
    asymptotes,
    clearExtras,
    schedulePointLabelFusion,
    makeDrawHost,
  } = context;

  let lastReferenceKey = null;

  function rebuildCurve() {
    const state = getState();
    curveRebuildTask.cancel();
    if (!state.board) return;
    // existing behavior follows
  }
}
```

注意：上面列的是 `rebuildCurve()` 当前会直接消费的完整依赖，函数体必须统一使用这些解构后的局部名，不能一部分使用局部名、一部分再读 `context.*`。如果 `makeDrawHost` 当前因初始化顺序必须延迟求值，注入 `() => makeDrawHost()`，不要重新 import `index.js`。

- [ ] **Step 2: 把参考曲线签名缓存移入 runtime 实例**

- 删除模块级 `let lastReferenceKey`；
- `applyReferenceCurveFromDocument()` 和 `resetReferenceKey()` 只访问 factory closure；
- 多次 mount 得到互不共享的缓存；
- dispose 只调用 `functionRuntime.resetReferenceKey`。

新增双实例测试：用同一文档创建两个 runtime，分别 apply/reset 参考曲线；一个实例的 key 命中或 reset 不得影响另一个实例的 create/detach 计数。

- [ ] **Step 3: 修正 follow targets 的完整注入合同**

补齐 JSDoc 和解构：

```js
const {
  getState,
  evalFnY,
  fnDisplayLabel,
  recomputeFunctionIntersection,
  createGraphCommitBridge,
  vertexFeatureOfFn,
  mainCurveFollowId,
  schedulePointLabelFusion,
} = context;
```

`MAIN_CURVE_FOLLOW_ID` 改为实例参数 `mainCurveFollowId`；函数内部禁止依赖 `index.js` 导出，避免依赖环。

- [ ] **Step 4: 修正 mount controller 的 selection 注册依赖**

- `createGraphMountController(deps)` 顶部解构 `reregisterSelectable`；
- `index.js` 装配时显式传入 `followTargets.reregisterSelectable`；
- 禁止在 controller 内重新维护第二套 selection。

- [ ] **Step 5: 修正 index 装配**

- 给 function runtime 传入延迟 `makeDrawHost`；
- 给 follow targets 传入 `vertexFeatureOfFn`、`MAIN_CURVE_FOLLOW_ID`、`schedulePointLabelFusion`；
- 给 mount controller 传入 `reregisterSelectable`；
- `resetReferenceKey: () => { lastReferenceKey = null }` 替换为 `functionRuntime.resetReferenceKey`。

- [ ] **Step 6: 运行精确测试**

```bash
cd apps/web
npx vitest run \
  ../../test/web/math-graph-runtime-wiring.vitest.ts \
  ../../test/web/math-graph-performance.vitest.ts \
  ../../test/web/math-graph-store.vitest.ts
cd ../..
node --test test/web/math-graph-mount-controller.test.cjs
```

Expected: 全部 PASS，无 dispose error 日志中的 ReferenceError。

- [ ] **Step 7: 运行画布结构和生命周期回归**

```bash
node --test \
  test/web/math-graph-structure.test.cjs \
  test/web/math-graph-document-renderer.test.cjs \
  test/web/math-board-contract.test.cjs
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/math/graph test/web/math-graph-runtime-wiring.vitest.ts test/web/math-graph-mount-controller.test.cjs
git commit -m "fix(graph): restore explicit runtime dependency wiring"
```

---

## 5. Task 3：修复割线与返回大厅主流程

**Files:**

- Modify: `apps/web/src/math/graph/construction/render-lines.js`
- Modify: `apps/web/src/math/graph/construction/restore.js`
- Modify: `apps/web/src/subjects/hub.js`
- Test: `test/web/math-construction-render-lines.vitest.ts`
- Test: `test/web/subject-hub-return.vitest.ts`
- Test: `test/web/subject-hub.test.cjs`

- [ ] **Step 1: 在本任务内建立割线和 Hub 红测试**

此时才创建 `math-construction-render-lines.vitest.ts` 与 `subject-hub-return.vitest.ts`，分别确认当前代码出现 `boardLabelAttrs is not defined` 和 `getSubject is not defined`。红测试记录后立即完成本任务修复，不把预期失败带入其他提交。

Hub 测试不能只给一个无法观察 stage 的 fake `select`。给 `createSubjectHub()` 增加可选依赖 `createStage = createBookshelfStage`，测试注入 fake stage factory，记录 `playReturnFromLab()` 收到的 subject meta；生产调用方继续使用默认实现，不增加全局测试钩子。

- [ ] **Step 2: 显式导入割线 label 工厂并先分配最终 ID**

从 `../../shared/board-label.js` 的现有 import 中加入 `boardLabelAttrs`；不得从 `draw-tools.js` 兼容入口绕行。

把签名调整为：

```js
export function createSecantConstruction(host, meta = {}, opts = {}) {
  const board = host.getBoard();
  const fn = host.getFunctions().find((item) => item.id === meta.fnId);
  if (!board || !fn?.curve) return null;
  const id = meta.id || host.nextConstrId();
  // 所有 JSXGraph element 创建完成后统一写 el._mathConstrId = id
  const rec = { id, /* serializable fields */, els };
  if (opts.notify !== false) host.onChanged?.();
  return rec;
}
```

allocator 必须位于 board/目标函数校验之后、创建任何 JSXGraph element 之前：不得让无 board/无函数的失败尝试消耗 ID，也不得先用可能为空的 `meta.id` 标记 element、最后才分配 ID。新建割线的所有 `els[*]._mathConstrId` 必须等于最终 `rec.id`。

- [ ] **Step 3: 修正 restore 的单次通知合同**

`construction/restore.js` 中所有内部重建分支都必须使用静默模式，而不只是割线：

- secant 调用 `createSecantConstruction(host, meta, { notify: false })`；
- segment/line 调用现有构造器时合并 `{ ...opts, notify: false }`，不得因重写对象丢掉该字段；
- 其余会自行通知的 constructor 同样显式传 `notify:false`；
- `restoreConstructions()` 逐项恢复结束后由外层至多调用一次 `host.onChanged()`；外层本身收到 `notify:false` 时为 0 次。部分失败继续沿用“记录失败并恢复其余项”的现有语义，但必须让失败日志/返回报告可见，不能声称整批成功。

增加混合 construction 批量恢复测试，证明内层 0 次、外层默认 1 次、外层静默 0 次，且失败路径不会伪报“完整恢复成功”。

- [ ] **Step 4: 保持割线文档/runtime 边界**

runtime record 可以包含 `els` 供 renderer/dispose 使用；持久化必须继续走 `constructionDocumentRecord(rec)`，其结果不得包含 `els`、label DOM 或 board object。测试同时断言：

- 默认新建通知 1 次，`notify:false` 为 0 次；
- 每个 runtime element 的 `_mathConstrId === rec.id`；
- `constructionDocumentRecord(rec)` 不含 `els`；
- 传入既有 `meta.id` 时不消耗 allocator，新建时只分配一次。
- 无 board 或找不到目标函数时返回 `null`，allocator 和 `board.create()` 均为 0 次。

- [ ] **Step 5: 返回大厅统一使用 manifest adapter**

```js
const meta = getSubjectMeta(opts.subjectId || 'chemistry') || getSubjectMeta('chemistry');
```

禁止重新从 `catalog.js` 导入 `getSubject`，否则会恢复 manifest/catalog 双入口。通过 Step 1 的 stage factory 注入，断言传入 stage 的是 runtime manifest 中的 `id/name`，未知学科安全回退 chemistry。

- [ ] **Step 6: 运行回归**

```bash
cd apps/web
npx vitest run \
  ../../test/web/math-construction-render-lines.vitest.ts \
  ../../test/web/subject-hub-return.vitest.ts \
  ../../test/web/subject-transition-controller.vitest.ts \
  ../../test/web/subject-transition-machine.vitest.ts
cd ../..
node --test test/web/subject-hub.test.cjs test/shared/module-boundaries.test.cjs
```

- [x] **Step 7: Commit**

```bash
git add apps/web/src/math/graph/construction/render-lines.js apps/web/src/math/graph/construction/restore.js apps/web/src/subjects/hub.js test/web
git commit -m "fix(web): restore secant and subject return flows"
```

---

## 6. Task 4：建立生产 JS 零容忍运行时安全门禁

**Files:**

- Create: `eslint.critical.config.mjs`
- Create: `test/shared/lint-critical-contract.test.cjs`
- Modify: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.github/workflows/quality.yml`

- [ ] **Step 1: 声明并使用标准 globals 数据源**

```bash
npm install -D globals
```

在 ESLint 配置中：

- Web 使用 `globals.browser`，另补项目实际使用且标准表未覆盖的安全全局；
- Server/scripts 使用 `globals.node`，Node 20 全局 `fetch/AbortController/performance` 明确可用；
- 测试按 Node 环境处理；
- 删除失效的 `eslint-disable import/no-unresolved`，或真正安装并配置插件；不得继续保留“Definition for rule was not found”。

- [ ] **Step 2: 新建独立 critical config**

只扫描生产 JS/MJS/CJS，不把历史 unused/style 债混进来。零容忍规则至少包括：

```js
export const runtimeSafetyRules = {
  'constructor-super': 'error',
  'getter-return': 'error',
  'no-class-assign': 'error',
  'no-const-assign': 'error',
  'no-dupe-keys': 'error',
  'no-ex-assign': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-undef': 'error',
  'no-unreachable': 'error',
  'valid-typeof': 'error',
};
```

默认目标：

```text
apps/web/src/**/*.{js,mjs,cjs}
apps/server/src/**/*.{js,mjs,cjs}
apps/desktop/**/*.{js,mjs,cjs}
```

配置必须复用根工程的生成物/用户数据排除规则，至少忽略 `node_modules`、任意 `dist`、`public`、coverage、`.electron-stage`、`dist-electron`、`dist-exe`、`apps/server/data` 和 `apps/server/src/data`。不得为了让门禁变绿扩大 ignore 到生产源码目录。

- [ ] **Step 3: 接线根脚本**

```json
{
  "lint:critical": "eslint --config eslint.critical.config.mjs \"apps/web/src/**/*.{js,mjs,cjs}\" \"apps/server/src/**/*.{js,mjs,cjs}\" \"apps/desktop/**/*.{js,mjs,cjs}\""
}
```

把 `npm run lint:critical` 放入 `quality` 和 `quality:fast`，位置在普通 lint 后、typecheck 前。

- [ ] **Step 4: 写红绿门禁测试**

合同测试必须：

1. 断言根脚本和两条 quality 链都包含 `lint:critical`；
2. 用 ESLint Node API 的 `lintText()` 检查 `function probe() { return missingRuntimeDependency; } probe();`，`filePath` 指向一个不存在但位于 `apps/web/src/__fixtures__/bad.js` 的逻辑路径；该文本必须先断言没有 parser error，再断言命中 `no-undef`；
3. 断言结果包含 `no-undef`，无需在仓库或系统临时目录写 fixture；
4. 分别以 Web/Server 逻辑路径检查合法 browser/node 文本，断言不会因 `document/performance/AbortController` 误报；
5. 测试不得改真实 ESLint 配置、baseline 或生产源码。

- [ ] **Step 5: 对当前生产源码运行门禁**

```bash
npm run lint:critical
```

Expected: 0 errors。若仍有错误，逐条判断“合法标准全局”或“真实遗漏”；不得把真实符号加入 globals 白名单。

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs eslint.critical.config.mjs package.json package-lock.json test/shared/lint-critical-contract.test.cjs .github/workflows/quality.yml
git commit -m "build(lint): block runtime-unsafe JavaScript regressions"
```

---

## 7. Task 5：把 lint baseline 从总量账本升级为文件级指纹

**Files:**

- Create: `tooling/quality/lint-baseline-core.mjs`
- Create: `test/shared/lint-baseline-regression.test.cjs`
- Modify: `scripts/lint-baseline.mjs`
- Modify: `docs/engineering/lint-baseline.json`
- Modify: `test/shared/lint-config-contract.test.cjs`

- [ ] **Step 1: 抽离纯 diff 算法**

稳定指纹不保存绝对行号，避免正常插行导致整表漂移；建议键：

```text
relativePath :: ruleId :: normalizedMessage :: sourceContextHash
```

同一文件同一指纹出现多次时保留 count。

```js
export function issueFingerprint(root, filePath, message, sourceContext) {
  return [
    path.relative(root, filePath).split(path.sep).join('/'),
    message.ruleId || '(parse-error)',
    String(message.message).trim().replace(/\s+/g, ' '),
    sha256(normalizeSourceContext(sourceContext)),
  ].join('::');
}
```

collector 读取 ESLint message 的 `line/endLine/column/endColumn` 只为从源文件提取上下文，不把坐标写入指纹。优先使用违规 node 对应源码片段；无法取得精确 node 时，取当前源码行及前后最近非空行。上下文只折叠空白，不归一化数字、变量名、字符串或路径内容；`'foo' is not defined` 与 `'bar' is not defined` 应视为不同问题。parse error 使用错误附近源码和 parser message 建指纹。

运行时安全规则已经独立清零，因此 baseline 只负责其余历史债。这里的保证应准确表述为：新文件、新 rule/message、新源码上下文或同指纹 count 增加会失败；不宣称能够区分“完全相同代码连同完全相同相邻上下文”在同文件内的纯搬移。若该极端情况重要，应先修旧债或升级为 AST anchor，不能退回全仓总量比较。

- [ ] **Step 2: 写 diff 算法测试**

至少验证：

- 删除旧 issue 允许；
- 同 rule 总量下降，但新文件出现 issue 仍失败；
- 同文件新增第二个相同 issue 失败；
- 在文件开头插入无关行、违规源码及其上下文未变时不失败；
- 同文件、同 rule、同 message 搬到不同源码上下文时失败；
- 只改违规语句中的数字、变量名或字符串时产生新指纹并失败；
- parse error 永远视为关键回归。

- [ ] **Step 3: 迁移 snapshot schema**

```json
{
  "version": 2,
  "capturedAt": "...",
  "total": 0,
  "perRule": {},
  "entries": {
    "relative/path.js::rule::message::<sha256>": 1
  }
}
```

`perRule` 只用于报告；是否失败以 `entries` 为准。

- [ ] **Step 4: 在 P0 修复后重建一次快照**

```bash
node scripts/lint-baseline.mjs --snapshot
npm run lint:baseline
```

Expected: snapshot total 小于审查时的 320；运行时安全规则在生产源码中为 0。

- [ ] **Step 5: Commit**

```bash
git add tooling/quality scripts/lint-baseline.mjs docs/engineering/lint-baseline.json test/shared
git commit -m "build(lint): track legacy debt by stable file fingerprint"
```

---

## 8. Task 6：修复 Server 测试入口、Node 版本差异与 Turbo 假绿

**Files:**

- Modify: `apps/server/package.json`
- Modify: `package.json`
- Modify: `test/shared/workspace-task-contract.test.cjs`
- Move: `test/server/v1-endpoints.generated.json` → `apps/server/test/fixtures/v1-endpoints.generated.json`
- Modify: `apps/server/test/v1-contract-matrix.test.ts`
- Modify: `.github/workflows/quality.yml`
- Modify: `docs/engineering/js-hotspots.md`

- [ ] **Step 1: 让 Server 测试只有一个权威 runner**

```json
{
  "test": "vitest run"
}
```

删除 `node --test ../../test/server/*.cjs`；保留 `test:vitest` 仅在确有外部消费者时，否则一起删除避免同义脚本。

- [ ] **Step 2: 移动 Server fixture 到 owner 下**

更新 `v1-contract-matrix.test.ts` 从 `apps/server/test/fixtures` 读取；最终 `test/server` 不再存在，避免未来误认为仍有第二测试入口。

- [ ] **Step 3: 删除根 pretest 的重复/错误编排**

根 `npm test` 已调用 `turbo run test`，而 `turbo.json` 的 test 已声明 `dependsOn: ["build", "^build"]`。因此删除：

```json
"pretest": "npm run build -w @xiaohuang/server"
```

避免绕开 Turbo 上游构建图，也避免 Server 被重复构建。

- [ ] **Step 4: 重写测试归属合同**

合同应断言：

- Server `test === vitest run`（允许参数但禁止 `node --test`）；
- Server 测试都在 `apps/server/test/**/*.test.ts`；
- Desktop CJS 仍只归 desktop workspace；
- 根 shared 测试只运行 `test/shared`；
- 任意 package script 中不存在指向空 glob 的路径。

- [ ] **Step 5: 增加 Node 20/24 portability job**

在 Quality workflow 增加独立轻量 matrix：

```yaml
strategy:
  matrix:
    node: [20, 24]
steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with:
      node-version: ${{ matrix.node }}
      cache: npm
  - run: npm ci
  - run: TURBO_FORCE=true npm test
```

若 CI 时间不可接受，Node 20 保留完整 quality，Node 24 只跑 workspace test；不得依靠本机结果代替。

- [ ] **Step 6: 验证无缓存测试**

```bash
TURBO_FORCE=true npm test
```

Expected: Server 107 tests，不能出现 Server CJS `tests 0` 的假成功。

- [ ] **Step 7: Commit**

```bash
git add apps/server/package.json apps/server/test package.json test/shared/workspace-task-contract.test.cjs .github/workflows/quality.yml docs/engineering/js-hotspots.md
git commit -m "test(server): remove the empty legacy CJS runner"
```

---

## 9. Task 7：建立 Server 干净 start/dev 合同

**Files:**

- Create: `scripts/dev-server.mjs`
- Create: `scripts/dev-all.mjs`
- Create: `scripts/verify-server-start.mjs`
- Create: `test/shared/server-entrypoint-contract.test.cjs`
- Create: `test/shared/server-dev-supervisor.test.cjs`
- Create: `test/shared/dev-all-supervisor.test.cjs`
- Modify: `apps/server/package.json`
- Modify: `package.json`
- Modify: `apps/server/test/server-ts-clean-build.test.ts`
- Modify: `.github/workflows/quality.yml`
- Modify: `docs/engineering/quality-commands.md`
- Modify: `docs/engineering/data-paths.md`

- [ ] **Step 1: 明确三类 Server 命令语义**

| 命令    | 语义                                                            |
| ------- | --------------------------------------------------------------- |
| `build` | 生成所有 TS bridge 需要的 CJS + d.ts                            |
| `start` | 一次构建后启动稳定 Server，不依赖调用者提前生成 dist            |
| `dev`   | 初始构建；同时 watch TS 产物和 JS 组合根；构建成功后重启 Server |

- [ ] **Step 2: 先写结构合同**

断言：

- `prestart` 和 `predev` 通过 Turbo 构建 `@xiaohuang/server` 及其 dependencies；
- `dev` 同时包含 tsup watch 与 Server restart 机制；
- `start` 不使用第二套 dist 路径；
- 根 `dev:server` 仍委托 workspace，不复制逻辑。
- 根 `dev:all` 不再用 shell `&`，而是由跨平台 supervisor 持有 Web/Server 两棵进程树。

- [ ] **Step 3: 验证 Turbo filter 语义后再落脚本**

先运行 dry run：

```bash
npx turbo run build --filter=@xiaohuang/server... --dry=json
```

检查输出必须包含 Server 及 `domain-core`、`math-expr`、`subject-settings`。如果 `...` 方向不正确，按 dry-run 结果修正 filter，禁止凭记忆写入 package script。

- [ ] **Step 4: 建立可靠 dev watcher**

不要直接并跑 `tsup --watch` 与 `node --watch dist`：tsup 会先清理再分批写入产物，Node 可能在半成品阶段重启。由 `scripts/dev-server.mjs` 统一拥有 compiler child 与 server child：

```bash
npm install -D chokidar
```

supervisor 位于仓库根 `scripts/`，因此 `chokidar` 必须是根 `package.json` 的 devDependency，不得依赖 npm 偶然 hoist workspace 依赖。JS 组合根变化由 `chokidar` 监听明确的 `apps/server/src/**/*.js` 源码集合；忽略 `dist`、data、public 和生成目录。不得依赖 Linux 不支持的递归 `fs.watch`，也不得 watch 整个仓库造成 build→restart 循环。

所有 workspace/repo 路径都从 `import.meta.url` 推导，不能假设调用者 cwd：workspace `npm run dev`、根 `npm run dev:server` 和直接 `node scripts/dev-server.mjs` 必须解析到同一 Server 根目录。

```json
{
  "prestart": "turbo run build --filter=@xiaohuang/server...",
  "start": "node src/index.js",
  "predev": "turbo run build --filter=@xiaohuang/server...",
  "dev": "node ../../scripts/dev-server.mjs"
}
```

supervisor 合同：

1. `predev` 已完成一次完整构建；supervisor 启动 watcher 后，仍需确认 watcher 首轮完整成功事件，才启动首个 Server，不能把“旧 dist 存在”当成本轮成功；
2. 后续只在收到“一轮完整构建成功”事件后 debounce 并切换 Server child；
3. TS 构建失败时保留上一版可运行 Server，并输出构建错误，禁止启动半成品；
4. 组合根和未进入 tsup bundle 的 JS 变化触发一次 debounce restart；
5. SIGINT/SIGTERM、compiler 退出或 supervisor 异常时，必须回收两个 child；
6. 重启使用“启动新 child 成功后停止旧 child”或“停止旧 child、确认端口释放后再启动”之一，必须有明确状态机，禁止两个 Server 同时监听；
7. 不使用 shell `&`，不依赖 macOS 独有的 watch 行为；compiler/server 必须以可回收进程组启动。

先在 `test/shared/server-dev-supervisor.test.cjs` 用 fake compiler/server child 测状态机，再接真实 child process。至少覆盖：初次启动、成功重建只重启一次、失败构建不重启、连续成功事件 debounce、SIGTERM 全回收。

- [ ] **Step 5: 替换根 dev:all 的非跨平台后台命令**

`scripts/dev-all.mjs` 显式 spawn 根 `dev` 和 `dev:server`，任一子进程意外退出时：

1. 保留第一个非零退出码；
2. 终止另一棵完整进程树；
3. 收到 SIGINT/SIGTERM 时只执行一次幂等 shutdown；
4. POSIX 使用独立 process group 并向组发送信号，Windows 使用等价的整树终止（例如 `taskkill /T`）；
5. 所有 child 退出后 supervisor 才退出。

用 fake child 的 `dev-all-supervisor.test.cjs` 验证失败传播、信号转发、重复 shutdown 和无孤儿；根脚本改为 `"dev:all": "node scripts/dev-all.mjs"`。

- [ ] **Step 6: 实现自包含 start/dev health smoke**

`verify-server-start.mjs` 必须：

1. 创建系统临时数据目录；
2. 申请候选空闲端口并立即传入 `PORT`；若释放到 spawn 之间被抢占，允许 Server 现有 `listenWithRetry` 选择下一端口，但必须从 `监听: host:port` 日志解析真实端口，不能继续探测旧端口；
3. 显式设置 `CHEM_LAB_DATA_DIR=<tmp>`、`CHEM_LAB_BIND=127.0.0.1`、`OPEN_BROWSER=0`、`PORT=<candidate>`；
4. `--mode=start` spawn `npm run start -w @xiaohuang/server`，`--mode=dev` spawn `npm run dev:server`；两种模式都是真实 npm lifecycle，不用 fake supervisor 代替集成 smoke；
5. `--mode=dev` 必须观察到 watcher 首轮构建成功和 Server 实际监听后才继续；
6. 对日志中真实端口轮询 `/api/health`，超时 30 秒失败并输出截断后的 stdout/stderr；
7. 成功后终止整棵进程树：POSIX 将 npm wrapper 启动在独立 process group 并 kill group，Windows 使用 `taskkill /PID <pid> /T /F` 或等价实现；不得只杀 npm 外壳留下 node/tsup watcher；
8. 等待所有已知 child/端口退出，并再次请求 health 确认端口已关闭；
9. finally 清理临时目录；
10. smoke 前后记录 `apps/server/data` 与 `apps/server/src/data` 状态，证明没有生产数据写入。

端口解析和进程树终止抽成可单测纯函数；端口候选竞争最多重试 3 次，超过后报告每次监听日志，不静默换固定 3000。

- [ ] **Step 7: 改进 clean-build 测试边界**

现有测试只复制部分源码并复用仓库 `node_modules/dist`，不能外推为完整干净启动。调整测试说明并拆成：

- unit：单一产物路径与 tsup entry；
- integration：`verify-server-start.mjs`；
- CI clean：`npm ci` 后无生成目录直接运行 integration。

Quality CI 在普通 test/build 之后串行执行 `--mode=start` 与 `--mode=dev`；任一模式 health 未成功、端口仍开放或进程树未回收均失败。Windows 若不进入常规 Quality runner，至少在 Electron Windows job 增加 `dev-all`/进程树终止的结构合同，不能用 macOS 成功外推 Windows shell 行为。

- [ ] **Step 8: 验证 start、真实 dev 与 supervisor**

```bash
node scripts/verify-server-start.mjs --mode=start
node scripts/verify-server-start.mjs --mode=dev
node --test test/shared/server-dev-supervisor.test.cjs
node --test test/shared/dev-all-supervisor.test.cjs
```

真实 dev reload 集成测试在临时 git archive 副本中执行：修改副本中的一个无副作用 marker，等待 watcher 成功重建和恰好一次重启，再验证 health；禁止通过 touch/恢复真实工作树生产源码来测试 watcher。最终完成定义要求 start/dev 两种真实 health smoke 均通过，不能只用 fake child 单测替代。

- [ ] **Step 9: Commit**

```bash
git add apps/server/package.json package.json package-lock.json scripts/dev-server.mjs scripts/dev-all.mjs scripts/verify-server-start.mjs test/shared/server-entrypoint-contract.test.cjs test/shared/server-dev-supervisor.test.cjs test/shared/dev-all-supervisor.test.cjs apps/server/test/server-ts-clean-build.test.ts .github/workflows/quality.yml docs/engineering
git commit -m "build(server): make clean start and development self-contained"
```

---

## 10. Task 8：消除无效动态导入，建立更真实的 bundle 预算

**Files:**

- Modify: `apps/web/src/subjects/manifest.js`
- Modify: `apps/web/src/math/shared/board-notes.js`
- Modify: `apps/web/vite.config.js`
- Modify: `tooling/performance/budget.json`
- Create: `tooling/performance/route-request-baseline.json`
- Modify: `tooling/performance/budget.mjs`
- Modify: `test/web/budget-gate.test.cjs`
- Create: `test/web/dynamic-import-boundary.test.cjs`
- Modify: `docs/engineering/baseline-2026-08-07.md`

- [ ] **Step 1: 处理 classroom-loader 假动态导入**

`classroom-loader.js` 本身零依赖且已经被 registry 静态加载。`manifest.js` 可安全静态导入 `getClassroomFactory`，仍然禁止静态导入 `classrooms/registry.js`。修改后必须保持 manifest ↔ registry 无环。

- [ ] **Step 2: 处理 board notes 假动态导入**

在确认 `lint:arch` 不产生循环后，静态导入 `dismissBoardCompass` 和 `dismissObjectStyleBubble`。如果出现循环，提取一个零依赖的 `board-overlay-registry.js` 负责注册/关闭，不允许保留“看似 lazy、实际无法分包”的写法。

- [ ] **Step 3: 拆分 mathviz vendor chunk**

改 `manualChunks` 前，先只临时启用 Vite manifest 并构建一次，用预算工具的 `--report-json` 输出当前 `initial` / `mathGraph` / `mathClassroomKatexOnly` 请求集合、字节和请求数到 `route-request-baseline.json`；报告只保存 manifest 的逻辑 source key、chunk role 和去 hash 的规范化 chunk family，避免每次构建漂移。该文件是版本化的拆分前测试 fixture，不是失败阈值；最终测试直接读取它，不动态 checkout/git-show 旧版本。旧构建实测值另记执行日志。

当前 `mathviz: ['jsxgraph', 'katex']` 会让只需要 KaTeX 的路径同时拉取 JSXGraph。改成：

```js
manualChunks: {
  three: ['three'],
  jsxgraph: ['jsxgraph'],
  katex: ['katex'],
  animation: ['animejs', 'canvas-confetti'],
}
```

不要为了消除 Vite 大 chunk warning 简单提高 `chunkSizeWarningLimit`。

- [ ] **Step 4: 打开 Vite manifest，按真实依赖闭包计算路径成本**

在 build 中启用 `manifest: true`。预算工具读取 `dist/.vite/manifest.json`，从 entry/dynamic entry 沿 `imports` 递归计算静态依赖闭包，并纳入该闭包引用的 CSS/assets；循环引用必须去重，manifest 缺少预期入口必须硬失败，禁止回退到文件名猜测。

至少定义三个路径集合：

- `initial`：`index.html` entry、modulepreload 和首屏 CSS 的闭包；
- `mathGraph`：manifest 中 `src/math/graph/index.js` dynamic entry 的闭包，报告“相对 initial 新增”的请求集合；
- `mathClassroomKatexOnly`：`src/math/classroom/entry.js` dynamic entry 的闭包，作为 KaTeX-only 路径，断言不得包含 `jsxgraph-*`。

构建后生成同结构 report，与 `route-request-baseline.json` 比较规范化请求集合：允许 mathGraph 把一个 `mathviz` 变为 `jsxgraph` + `katex`，要求 KaTeX-only 删除 JSXGraph，禁止同一依赖重复进入多个业务 chunk。测试必须断言这些差异，不能只把前后 report 打到日志。

- [ ] **Step 5: 扩展预算为 raw + gzip + 请求数**

`budget.mjs` 使用 `node:zlib.gzipSync` 计算每个 JS/CSS 资产 gzip；预算配置至少包含：

- `jsxgraph.rawMaxKb/gzipMaxKb`；
- `katex.rawMaxKb/gzipMaxKb`；
- `three.rawMaxKb/gzipMaxKb`；
- `index` 聚合 raw/gzip；
- `initial.rawMaxKb/gzipMaxKb/maxAssetCount`；
- `routes.mathGraph.incrementalRawMaxKb/incrementalGzipMaxKb/maxAssetCount`；
- `routes.mathClassroomKatexOnly.incrementalRawMaxKb/incrementalGzipMaxKb/maxAssetCount`，并声明 `forbiddenChunks: ['jsxgraph']`；
- `total.rawMaxKb/gzipMaxKb`。

`maxAssetCount` 统计一次页面导航会新增请求的唯一 JS/CSS/静态资产数；shared initial 资产不在 lazy incremental 中重复计数。阈值以本次拆包后的实测值 + 5%～8% 字节余量、请求数基线 + 最多 1 个明确余量建立，并在 note 中写明日期和理由，禁止放宽到失去约束。

- [ ] **Step 6: 扩展预算红绿测试**

临时 dist fixture 至少证明：

- 单 chunk raw 超限失败；
- gzip 超限但 raw 未超限仍失败；
- 多个 `index-*` 正确聚合；
- HTML initial preload 集合正确，未引用的 lazy chunk 不计首屏；
- CSS 计入 initial gzip。
- manifest 的 imports 闭包正确去重并计入动态路径；
- initial 或 lazy 路径即使 raw/gzip 未超限，请求数超限也失败；
- KaTeX-only 路径出现 JSXGraph chunk 时失败；
- 预期 dynamic entry 在 manifest 中缺失时失败，而不是返回 0KB 假绿。

- [ ] **Step 7: 建立动态导入结构合同**

断言：

- manifest 不动态 import `classroom-loader`；
- manifest 不静态 import registry；
- board-notes 不对已静态消费模块做动态 import；
- app shell 仍不静态 import JSXGraph/KaTeX/重型课堂 feature。

- [ ] **Step 8: 构建并审阅 warning**

```bash
npm run build -w @xiaohuang/web
npm run budget
npm run lint:arch
```

Expected:

- 3 条 dynamic/static import warning 归零；
- JSXGraph JessieCode eval warning仍存在且仅来自 `node_modules`；
- 大 chunk warning由预算解释，不新增未知 warning；
- 输出中 `jsxgraph-*` 与 `katex-*` 为独立 chunk。
- initial、mathGraph、mathClassroomKatexOnly 三条路径的 raw/gzip/request count 都在预算内，KaTeX-only 请求集合不含 JSXGraph。

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/subjects/manifest.js apps/web/src/math/shared/board-notes.js apps/web/vite.config.js tooling/performance test/web docs/engineering/baseline-2026-08-07.md
git commit -m "perf(web): remove ineffective imports and strengthen bundle budgets"
```

---

## 11. Task 9：继续拆解画布结构债，但不改变行为

该任务在 P0、门禁和 CI 全绿后执行。若前序任务已使 `graph/index.js` 明显下降，可按实际跳过无价值拆分。

**Files:**

- Modify: `apps/web/src/math/graph/graph-mount-controller.js`
- Create: `apps/web/src/math/graph/graph-board-session.js`
- Create: `apps/web/src/math/graph/graph-ui-bindings.js`
- Create: `apps/web/src/math/graph/graph-dispose-session.js`
- Modify: `apps/web/src/math/graph/index.js`
- Modify: `tooling/architecture/large-file-budget.json`
- Modify: `test/web/math-graph-structure.test.cjs`
- Test: `test/web/math-graph-mount-controller.test.cjs`

- [x] **Step 1: 先按职责统计 mount controller**

只允许拆出以下三类已存在职责：

1. board/store/history/persistence 创建；
2. DOM 控件、文件导入导出、ResizeObserver/theme 的绑定；
3. disposer/transaction/frame/object URL/reader 的收尾。

不要新增抽象基类，不做通用框架。

- [x] **Step 2: 提取 graph-board-session**

返回显式资源，示例必须处于函数返回语境，不能写成独立 block/comma expression：

```ts
return {
  board,
  store,
  history,
  renderer,
  dispose,
};
```

创建失败不得发布半初始化 session；沿用 renderer fatal/read-only 语义。

- [x] **Step 3: 提取 graph-ui-bindings**

只负责绑定并返回 disposer；不得持有 GraphDocument 真值。文件 picker、FileReader、download URL 必须仍能取消并 settle。

- [x] **Step 4: 提取 graph-dispose-session**

保留现有逆序、容错、幂等合同；错误聚合后可见记录，不能 silent catch。

- [ ] **Step 5: 收紧结构预算**

目标不是“刚好低于 700”：

| 文件                             | 当前 | 目标上限 |
| -------------------------------- | ---: | -------: |
| `graph/index.js`                 |  690 |      560 |
| `graph-mount-controller.js`      |  950 |      600 |
| 新 session/bindings/dispose 文件 | 新增 | 每个 350 |

预算只有在行为测试全绿后更新；不得通过压缩格式或把多个职责塞入一行达标。

- [x] **Step 6: 运行生命周期压力测试**

```bash
node --test test/web/math-graph-mount-controller.test.cjs
cd apps/web
npx vitest run \
  ../../test/web/math-function-panel-lifecycle.vitest.ts \
  ../../test/web/math-graph-readouts.vitest.ts \
  ../../test/web/math-graph-performance.vitest.ts
```

必须继续满足 20 次 mount→click→dispose 资源归零。

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/math/graph tooling/architecture/large-file-budget.json test/web/math-graph-structure.test.cjs test/web/math-graph-mount-controller.test.cjs
git commit -m "refactor(graph): split board session and lifecycle bindings"
```

### Task 9 实际状态（2026-08-10 纠偏，勿改写成“达标”）

- T1–T8 已完成并由现有门禁/CI 验证。
- T9 是**部分完成后补齐生命周期正确性**，不是达到原结构目标：
  - `graph-board-session.js`、`graph-ui-bindings.js`、`graph-dispose-session.js` 已提取（拆分 commit `3fa336f`）。
  - 原目标 `index.js <= 560`、`graph-mount-controller.js <= 600` **未达到**；实际约为 **690 / 750**。
  - 690/750 是当前**有界债务和门禁**，不是原目标完成；禁止把原目标改写成 690/750 制造“达标”。
  - 行为/生命周期步骤（Step 1–4、6、7）已完成：首次全量投影恢复与 board session 原子回滚
    （`3058a71`、`c90cec7`、`d14cf07`，见 `2026-08-10-graph-mount-lifecycle-recovery.md`）。
  - 结构预算 Step 5 **保持未完成**：继续按职责下降到 560/600 的目标另开结构债计划，本轮不再拆。

---

## 12. Task 10：同步工程文档，消除双账

**Files:**

- Modify: `AGENTS.md`
- Modify: `apps/web/src/math/AGENTS.md`
- Modify: `docs/engineering/debt-registry.md`
- Modify: `docs/engineering/js-hotspots.md`
- Modify: `docs/engineering/quality-commands.md`
- Modify: `docs/engineering/branch-authority.md`
- Modify: `docs/engineering/baseline-2026-08-07.md`
- Modify: `docs/superpowers/plans/2026-08-10-main-divergence-and-js-risk-mitigation.md`
- Modify: this plan
- Test: `test/shared/repo-contract.test.cjs`
- Test: `test/shared/root-scripts-contract.test.cjs`

- [ ] **Step 1: 更新质量命令真值**

文档必须明确区分：

- `lint`：新代码范围；
- `lint:critical`：全部生产 JS 零容忍运行时规则；
- `lint:baseline`：文件级旧债不新增；
- `lint:all`：诊断命令，存量清零前预期非零；
- `typecheck`：TS 范围，不代表旧 JS 已检查。

- [ ] **Step 2: 更新债务登记**

- D5：记录新的 index/mount 上限；
- D6：不再写“待建基线”，记录 v2 指纹门禁和当前真实总数；
- D7：Server CJS runner 完全删除，fixture 已归 owner；
- D12：删除过期 `--test-concurrency=4` 描述，写当前串行 shared 与 Node 20/24 matrix；
- D14：Server bridge 的 start/dev 构建合同已补齐；
- 新增任何债务必须写 owner、删除条件和验证命令。

- [ ] **Step 3: 更新分支权威事实**

只有在执行时重新验证 `main == origin/main` 且负责人确认 A0-1 后，才把 `branch-authority.md` 的空格填为：

```text
权威开发线：origin/main
本地 main 跟踪：origin/main
```

若远端再次分叉，保持未填并在计划日志记录，不代替负责人做 push/reset 决策。

- [ ] **Step 4: 更新画布合同**

补充：

- factory 依赖必须在入口完整解构；
- runtime 私有缓存必须属于 factory instance；
- 新 controller 接线必须有“调用真实 factory”的测试，源码正则不算行为覆盖；
- `lint:critical` 是画布 JS 修改的必跑命令。

- [ ] **Step 5: 更新本计划进度与实测数字**

只勾实际完成项；写提交 hash、命令和 exit code。不要把本计划所有任务一次性勾满。

- [ ] **Step 6: Commit**

```bash
git add AGENTS.md apps/web/src/math/AGENTS.md docs test/shared
git commit -m "docs(engineering): align runtime and quality contracts"
```

---

## 13. Task 11：最终验证与 CI 收口

**Files:**

- No source changes unless a verification failure reveals a real defect.
- Update: this plan’s execution log only after evidence exists.

- [ ] **Step 1: 工作树和静态安全**

```bash
git status --short
npm run format:check
npm run lint
npm run lint:critical
npm run lint:baseline
npm run lint:css
npm run lint:arch
npm run lint:large-files
npm run lint:theme-tokens
npm run lint:assets
```

Expected: 全部 exit 0；`git status` 只显示本轮预期源码/文档改动。

- [ ] **Step 2: 串行运行类型与测试**

```bash
npx turbo run typecheck --force
TURBO_FORCE=true npm test
```

不要并行执行。Expected: 无 cached task；所有 workspace 和 shared 测试通过。

- [ ] **Step 3: Web 构建与性能**

```bash
npm run build -w @xiaohuang/web
npm run budget
```

记录 raw/gzip/initial/lazy 字节、请求数、请求集合和全部 warning。未知 warning 必须解释或修复。

- [ ] **Step 4: Server 干净启动**

```bash
node scripts/verify-server-start.mjs --mode=start
node scripts/verify-server-start.mjs --mode=dev
node --test test/shared/server-dev-supervisor.test.cjs
node --test test/shared/dev-all-supervisor.test.cjs
```

检查两种真实 smoke 后系统临时目录、npm wrapper、node/tsup watcher 和端口均清理；`apps/server/data` 未被测试修改。fake supervisor 测试只能作为状态机补充，不能替代两次 health smoke。

- [ ] **Step 5: 完整 quality 连续两次**

```bash
TURBO_FORCE=true npm run quality
npm run quality
```

第一次证明 fresh，第二次证明生成 coverage/build 后可重复。

- [ ] **Step 6: 干净检出验证**

使用新的临时 clone/worktree：

```bash
npm ci
TURBO_FORCE=true npm run quality
node scripts/verify-server-start.mjs --mode=start
node scripts/verify-server-start.mjs --mode=dev
```

禁止把当前工作树 `dist` 复制过去；干净检出必须从零生成。

- [ ] **Step 7: Electron packaged resource 回归**

Server 构建/启动脚本发生变化，因此必须运行：

```bash
npm run verify:electron-package
```

验收仍是 `electron-builder --dir` 资源布局与 require smoke，不得表述为 DMG/NSIS 目标机已验收。

- [ ] **Step 8: Git 收口**

```bash
git diff --check
git status --short
git log --oneline --decorate -12
```

确认无生成物、用户数据、私有 skill 被追踪。

- [ ] **Step 9: 远端 CI**

只有用户明确授权推送后才执行。推送后要求：

- Quality Node 20：success；
- Runtime portability Node 20/24：success；
- Electron macOS/Windows：success；
- Quality run 1/run 2 均执行，不再因第一轮失败跳过第二轮。

- [ ] **Step 10: 最终报告格式**

报告必须列：

1. 每个 P0 根因与对应测试；
2. 生产 JS critical lint 结果；
3. baseline v2 前后总数与新增检测证明；
4. Node 20/24 测试结果；
5. clean start/dev health smoke；
6. raw/gzip/initial/lazy bundle 与请求数表；
7. full quality ×2；
8. Electron packaged resource；
9. CI 链接；
10. commit hash、`git status --short`；
11. 未完成项和证据边界。

---

## 14. 建议提交边界

| 顺序 | 建议提交                                                              | 必须包含                                                     |
| ---- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1    | `fix(graph): restore explicit runtime dependency wiring`              | runtime/follow/mount/index + 真实 factory 测试               |
| 2    | `fix(web): restore secant and subject return flows`                   | 割线、Hub 返回 + 行为测试                                    |
| 3    | `build(lint): block runtime-unsafe JavaScript regressions`            | critical config、globals、quality 接线、红绿 fixture         |
| 4    | `build(lint): track legacy debt by stable file fingerprint`           | baseline core/schema/tests/snapshot                          |
| 5    | `test(server): remove the empty legacy CJS runner`                    | Server script、fixture 归属、workspace contract、Node matrix |
| 6    | `build(server): make clean start and development self-contained`      | prestart/predev/watch/smoke/文档                             |
| 7    | `perf(web): remove ineffective imports and strengthen bundle budgets` | import 策略、vendor split、gzip/initial budget/tests         |
| 8    | `refactor(graph): split board session and lifecycle bindings`         | 可选结构收口；必须保持行为                                   |
| 9    | `docs(engineering): align runtime and quality contracts`              | debt/hotspots/quality/branch/计划状态                        |

不要 squash 成一个“fix all”提交；每个提交应能独立回滚且结束为绿色。

---

## 15. 风险与回滚

| 风险                                  | 预防                                               | 回滚标准                                    |
| ------------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| Graph factory 初始化顺序形成 TDZ      | 延迟 getter 注入；真实 factory 测试                | 任一 mount/首帧失败，回滚对应 Graph 提交    |
| reference cache 改为实例后重复建曲线  | 测同文档重复 apply 不重建                          | create/detach 计数超过基线                  |
| critical lint 误报浏览器全局          | 使用 `globals` 标准表 + 合法 fixture               | 不允许把真实业务符号加入 globals 掩盖       |
| baseline v2 因行号漂移频繁失败        | 指纹不存行号，保留 file/rule/message/context/count | 若仍高噪，修正规范化算法而非退回总量        |
| Server dev 双进程泄漏                 | supervisor 状态机 + finally 回收                   | smoke 后仍有子进程即失败                    |
| Server smoke 写生产数据               | 强制 `CHEM_LAB_DATA_DIR` 到 tmp                    | `apps/server/data` mtime/状态变化即失败     |
| vendor 拆包使请求数增加               | raw/gzip/initial/lazy 请求数预算                   | 任一路径字节或请求集合显著恶化则回滚拆法    |
| mount controller 再拆引入生命周期回归 | 20 次 mount/dispose + disposer 故障注入            | 任一资源未归零，回滚 Task 9，不影响 P0 修复 |
| Turbo cache 假绿                      | 关键验收使用 `--force` + 干净检出                  | cache-only 证据不得用于完成声明             |

---

## 16. 执行记录模板

实现 agent 每完成一个 Task 追加一行，不覆盖历史：

| 时间             | Task  | Commit  | 最小测试           | 全局门禁  | 备注/未验证  |
| ---------------- | ----- | ------- | ------------------ | --------- | ------------ |
| YYYY-MM-DD HH:mm | T1–T2 | `<sha>` | `<command> → PASS` | `pending` | 无浏览器验证 |

### 最终状态

- [x] P0 runtime ReferenceError 全部关闭（T1-T3：583e362/75069dc）
- [x] Quality CI 恢复（远端 quality success + Node 20/24 matrix）
- [x] Electron CI 保持绿色（electron-package success）
- [x] Node 20/24 一致（portability job + 本地验证）
- [x] clean start/dev 通过（verify-server-start start/dev 双 smoke）
- [x] critical lint 零容忍接线（lint:critical 0 errors，进 quality/quality:fast）
- [x] lint baseline v2 接线（指纹快照 231，no-undef 91→0）
- [x] 动态导入 warning 归零（T8：3 条归零）
- [x] raw/gzip/initial/lazy 请求数预算通过（T8：katex-only 去 JSXGraph）
- [x] 文档与代码一致（T10）
- [x] 工作树干净
