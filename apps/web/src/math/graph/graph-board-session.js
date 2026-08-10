/**
 * 画布 board/store/history/persistence 会话（Task 9 拆分）。
 *
 * 职责：一次 mount 的 board 底座创建（persistence → board → store → history
 * → idAllocator → storeUnsub）。创建失败不得发布半初始化 session：
 * 全部成功后才返回资源对象，失败路径不留下部分挂载的 state。
 * disposer 注册经传入的 register（由 dispose session 持有）。
 */
export function createGraphBoardSession(deps) {
  const {
    state,
    getStageEl,
    createGraphPersistence,
    createMathBoard,
    followIdForFn,
    fnDisplayLabel,
    resolveFunctionColor,
    onAxisSettingsChange,
    bindPointLabelFusion,
    viewBridge,
    register,
    clearAllConstructions,
    makeDrawHost,
    removeUserPointEls,
    removeAllFnCurves,
    freeMathBoard,
    unbindPointLabelFusion,
    createGraphIdAllocator,
    syncRuntimeFromDocument,
    graphRenderer,
    createGraphStore,
    createGraphHistory,
  } = deps;

  // 持久化：先加载（含迁移/限额校验），再建 board/store，避免先默认后覆盖
  const persistence = createGraphPersistence({
    storage: window.localStorage,
    now: () => new Date().toISOString(),
  });
  register(() => {
    persistence?.dispose?.();
  });
  const loadedDoc = persistence.load().document;

  const board = createMathBoard('mathGraphBoard', {
    boundingbox: [-8, 8, 8, -8],
    axisSettingsHost: getStageEl(),
    hasFuncDomain: true,
    axisSettingsInitial: {
      fXMin: state.fXMin,
      fXMax: state.fXMax,
      xMin: -8,
      xMax: 8,
      yMin: -8,
      yMax: 8,
    },
    getLegendItems: () =>
      state.functions
        .filter((f) => f.visible)
        .map((f) => ({
          id: followIdForFn(f.id),
          label: fnDisplayLabel(f),
          color: resolveFunctionColor(f),
        })),
    onAxisSettingsChange,
  });
  bindPointLabelFusion(board);
  // 视口平移/缩放 → 文档 view/update（250ms 静默合并；applyView 有防回环 guard）
  try {
    board.on?.('boundingbox', () => viewBridge.onBoardBoundingBox());
  } catch {
    /* */
  }
  register(() => viewBridge.dispose());
  register(() => {
    try {
      board?.off?.('boundingbox');
    } catch {
      /* */
    }
    unbindPointLabelFusion(board);
    clearAllConstructions(makeDrawHost());
    removeUserPointEls();
    if (board) removeAllFnCurves(board);
    freeMathBoard(board);
    state.board = null;
  });

  // 文档底座：函数集合作为首个接入 store 的行为（历史/事务链路）；
  // 函数/活动 id/镜像由首次 fullRender 从 store 文档建立
  const idAllocator = createGraphIdAllocator(loadedDoc);
  const store = createGraphStore(loadedDoc, {
    beforeCommit: syncRuntimeFromDocument,
    recoverRuntime: (doc) => graphRenderer.recover(doc),
  });
  const history = createGraphHistory(store);
  register(() => history?.dispose?.());
  // 初始 storage load：建立起点，清空历史（不能 undo 回「导入前」）
  history.clear();
  // 文档变更 → 自动保存（300ms debounce；annotations/replace 带 persist:true）
  const storeUnsub = store.subscribe((event) => {
    if (event.action?.type === 'transaction/cancel') return;
    if (event.action?.meta?.persist === false) return;
    persistence?.scheduleSave(event.current);
  });
  register(() => storeUnsub?.());
  register(() => store?.dispose?.());

  return { persistence, board, store, history, idAllocator, storeUnsub, loadedDoc };
}
