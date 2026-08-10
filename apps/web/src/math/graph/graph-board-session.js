/**
 * 画布 board/store/history/persistence 会话（Task 9 拆分 + Task 2 原子回滚）。
 *
 * 职责：一次 mount 的 board 底座创建（persistence → board → store → history
 * → idAllocator → storeUnsub）。构建期间资源只登记到本地 ownedDisposers 栈；
 * 任一步失败立即逆序回滚，不向外部注册部分 disposer；全部成功后才向外注册
 * 一个组合 disposer。失败不发布半初始化 session。
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

  /** 本地资源所有权栈：成功发布前失败时逆序回滚。 */
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

  try {
    // 持久化：先加载（含迁移/限额校验），再建 board/store，避免先默认后覆盖
    const persistence = createGraphPersistence({
      storage: window.localStorage,
      now: () => new Date().toISOString(),
    });
    own(() => {
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
    // board 创建成功后立即登记清理（viewBridge + board 资源），
    // 再执行 fusion 绑定——绑定抛错时 board 已入本地栈可回滚
    own(() => viewBridge.dispose());
    own(() => {
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
    bindPointLabelFusion(board);
    // 视口平移/缩放 → 文档 view/update（250ms 静默合并；applyView 有防回环 guard）
    try {
      board.on?.('boundingbox', () => viewBridge.onBoardBoundingBox());
    } catch {
      /* */
    }

    // 文档底座：函数集合作为首个接入 store 的行为（历史/事务链路）；
    // 函数/活动 id/镜像由首次 fullRender 从 store 文档建立
    const idAllocator = createGraphIdAllocator(loadedDoc);
    const store = createGraphStore(loadedDoc, {
      beforeCommit: syncRuntimeFromDocument,
      recoverRuntime: (doc) => graphRenderer.recover(doc),
    });
    // store.dispose 紧跟创建成功后登记：即使 history/subscribe 失败也必须回滚 store
    own(() => store?.dispose?.());
    const history = createGraphHistory(store);
    own(() => history?.dispose?.());
    // 初始 storage load：建立起点，清空历史（不能 undo 回「导入前」）
    history.clear();
    // 文档变更 → 自动保存（300ms debounce；annotations/replace 带 persist:true）
    const storeUnsub = store.subscribe((event) => {
      if (event.action?.type === 'transaction/cancel') return;
      if (event.action?.meta?.persist === false) return;
      persistence?.scheduleSave(event.current);
    });
    own(() => storeUnsub?.());

    // 全部成功：向外发布一个组合 disposer（逆序清理；幂等）
    register(cleanupOwned);
    return { persistence, board, store, history, idAllocator, storeUnsub, loadedDoc };
  } catch (error) {
    cleanupOwned();
    throw error;
  }
}
