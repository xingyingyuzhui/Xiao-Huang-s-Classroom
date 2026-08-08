# Math canvas routing

函数画布精确工程合同由 `apps/web/src/math/AGENTS.md` 唯一拥有。修改 `apps/web/src/math/graph/` 前必须完整阅读它；本页只提供跨层导航。

## 权威数据流

```text
GraphDocumentV2
  -> pure reducer / graph store / history
  -> staged runtime plan and dependency closure
  -> runtime registry / layer adapters
  -> incremental renderer
  -> JSXGraph board elements
```

- `GraphDocumentV2` 是可序列化唯一真值。
- DOM、JSXGraph element、evaluator handle、listener/disposer 只在 runtime sidecar/layer。
- JSXGraph 是运行时渲染/交互适配器，不是业务状态源；其内部 eval 警告也不等于应用代码主动 eval。

## 工具系统

- 工具定义、选择控制、连续手势、纯几何计算和 renderer layer 分责；不要把所有逻辑塞回 `index.js` 或单一工具文件。
- pointer/input 高频事件先覆盖 pending intent，每 frame 最多 dispatch/apply 一次。
- 一次手势通常对应一个 transaction 和一条 history；瞬态 pointer/hover/RAF 不入文档、不持久化。
- 兼容入口只显式 re-export；禁止裸 `export *` 导致重名导出静默消失。

## 原子失败语义

candidate 只有在 renderer apply 成功后才能发布。失败时恢复完整 prior runtime；恢复失败进入 fatal/read-only，不允许 Store、History、Persistence 与画面互相分叉，也不静默吞错。

增量刷新必须包含传递依赖闭包；自由点更新不应重建无关函数。主题切换只 restyle，不进历史或 GraphDocument。

## 验证路由

- reducer/store/history/document/persistence：纯 Node 测试。
- controller/lifecycle：fake board/DOM/timer/RAF，重复 mount/dispose 后资源归零。
- renderer 失败：注入 apply/fullRender 失败，验证恢复和 fatal。
- 性能：统计 create/update/detach、UI diff 与同帧 dispatch 次数，不只看总耗时。
- 结构与门禁：相关 `test/web/math-*.test.cjs`、`npm run lint:arch`、`npm run build`。
