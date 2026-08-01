# 数学模块工程约定

本目录是「小黄的教室」数学学科实现。加功能前请遵守下列契约，避免主题脏色、镜头重置、幽灵曲线等问题。

## 分层

| 路径 | 职责 |
|------|------|
| `math/shared/` | 画板工厂、主题契约、生命周期、罗盘/笔记/样式气泡、安全表达式 |
| `math/graph/` 等 lab | 单 Tab 业务状态与 UI 接线 |
| `math/classroom/` | 课堂讲解/出题/点名 |
| `subjects/classrooms/math-classroom.js` | Tab 壳、feature 加载、overlay 收起 |
| `apps/server/.../ai/math*` | 数学 AI（函数生成等），校验与前端 expr 白名单对齐 |

### 函数画布作图模块

`graph/draw-tools.js` 只保留兼容导出；实现按职责放在 `graph/construction/`：

兼容入口必须使用显式具名导出，禁止 `export *`；内部 primitive 和数值辅助函数由所属模块直接导入，不得经兼容入口泄漏。

| 模块 | 职责 |
|------|------|
| `geometry.js` / `function-roots.js` / `intersection-numeric.js` | 可直接测试的纯几何、连续函数求根与数值求交 |
| `records.js` / `dependencies.js` | 作图记录、派生更新绑定与监听销毁 |
| `dependency-closure.js` / `point-dependencies.js` | 构造引用闭包、用户点依赖与下游优先级联删除 |
| `render-lines.js` / `render-perpendiculars.js` | 线、切线、垂线与法线的 JSXGraph 工厂 |
| `intersections.js` | 自动求交和延长线联动的薄调度层 |
| `intersection-renderers.js` | 线线、线函数交点的 JSXGraph 工厂 |
| `intersection-lifecycle.js` / `intersection-visibility.js` | 交点回调解绑、裁剪与显隐 |
| `restore.js` / `operations.js` | 重建、删除和工具锚点解析 |

禁止重新引入聚合实现文件；新增作图算法优先落在纯模块，再由渲染工厂接线。
批量创建/恢复构造时传 `{ notify: false }`，由最外层操作统一触发一次 `host.onChanged()`。
滑条等高频输入通过 `shared/frame-task.js` 合并到下一动画帧，禁止每个 `input` 事件同步全量重建画板。
重合点坐标标签通过 `shared/point-label-fusion.js` 在 snap 容差内融合成一条 `名1·名2(x, y)`；`board-label` 只调用 `board._mathRefreshPointLabelFusion`，禁止 shared 反向依赖 graph。
切线工具靠近顶点时，锚点跟随 `graph:fn:{id}:feature:vertex`（见 `tangent-follow.js` / `makeFeaturePointTarget`），改参数后追顶点；拖离容差后降级为曲线跟随。

`graph/index.js` 只负责画板挂载、工具事件状态机、曲线重建与销毁；其它职责固定如下：

| 模块 | 职责 |
|------|------|
| `graph/user-points.js` | 用户点创建、快照、恢复、跟随切换与级联删除 |
| `graph/function-analysis.js` | 函数求值、显示公式、值表和函数交点纯计算 |
| `graph/function-records.js` | 预设、自定义表达式及 AI 规格的函数记录工厂 |
| `graph/function-panel.js` | 函数侧栏、添加弹窗、AI 弹窗与集合增删 UI |

禁止把上述逻辑重新堆回 `graph/index.js`；结构契约见 `test/web/math-graph-structure.test.cjs`。

## 主题契约（必读）

**唯一读色入口：** `shared/math-theme.js`

每个主题 `apps/web/src/shared/styles/themes/*/tokens.css` 必须定义：

- `--math-fn-1` … `--math-fn-8`（多曲线色板）
- `--math-grid`（网格线，**禁止**用过浅的 `--border-soft`）
- `--math-point-ring`（特征点/用户点描边）

画板 chrome（底/轴/字）用 `--paper` / `--ink` / `--stamp` / `--diagram`。

黑板等深色主题可在 `skin.css` 补浮层/列表，但**色板与网格必须在 tokens**。

契约测试：`test/web/math-board-contract.test.cjs`。

## 画板生命周期（硬规则）

实现见 `shared/board-lifecycle.js`、`shared/jsx-board.js`。

1. **删除对象**  
   先 `detachBoardObject(board, el)`（或业务封装的 detach），再从 `state` 数组 `filter` 掉。  
   禁止：先 filter 再靠 `removeAll` 遍历 state（会幽灵残留）。

2. **重建曲线 / 刷特征点**  
   用 `withPreservedViewport(board, () => { ... })` 包住。  
   禁止：图例 `refresh` / 业务 rebuild 里把 bbox 设回设置面板初值。

3. **图例设置**  
   `axis-legend-settings` 的 `refresh()` 必须 `skipViewport: true`。  
   仅用户改视窗数值时才 `setBoundingBox`。

4. **换肤**  
   监听 `chem-theme-change`（`bindMathThemeRestyle`）：  
   - `restyleMathBoard(board)`  
   - 多曲线 lab：`remintFunctionColors(state.functions)` + 必要 rebuild  
   禁止：各 lab 私自读一堆 CSS 变量拼色。

5. **网格色**  
   只通过 `getMathGridColor()` / `restyleMathBoard` 写入；网格元素是 curve，设 `strokeColor`。

## 新增 lab / 功能清单

- [ ] 创建 board：`createMathBoard`（内部已 restyle）
- [ ] dispose：卸 theme 监听、compass/notes、`freeMathBoard`
- [ ] 换肤：`bindMathThemeRestyle(() => state.board, { onAfterRestyle })`
- [ ] 多曲线：颜色只用 `colorForFnIndex` / `remintFunctionColors`
- [ ] 删除几何对象：先 detach
- [ ] 全量重建：包 `withPreservedViewport`
- [ ] 需要主题 token：改**全部**主题 `tokens.css`，并跑契约测试

## AI

- 请求带 `subjectId`（`withAiSubject` / 当前学科 session）
- 服务端 Key 按学科设置
- **表达式唯一实现：** 包 `@xiaohuang/math-expr`  
  - 前端：`math/shared/expr-safe.js` 再导出  
  - 后端：`math-fn-service` `require('@xiaohuang/math-expr')`  
  - 禁止再复制一份白名单

## 测试

- 契约：`test/web/math-board-contract.test.cjs`（主题 token + 模块接线）
- 行为：`test/web/math-lifecycle-unit.test.cjs`（expr / remint / detach 顺序 / 视窗语义）
- 改主题 token 或生命周期规则后必跑：`math-board-contract`、`math-lifecycle-unit`、`math-axis-legend`
