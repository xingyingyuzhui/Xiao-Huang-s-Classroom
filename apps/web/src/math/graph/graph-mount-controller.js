/**
 * GraphMountController：函数画布 board/store/history/persistence/controller 的装配与销毁。
 *
 * 所有业务闭包经 deps 注入（index.js 持有真值）；本模块不创建第二套 document state。
 * dispose 收进同一流程顺序执行，单个失败不阻断其余清理。
 */

/**
 * @param {any} deps
 */
import { GRAPH_BOARD_TOOLS } from './tool-definitions.js';

export function createGraphMountController(deps) {
  const {
    state,
    setStageEl,
    resizeMathBoard,
    ensureMathFloatCardsBound,
    bindFnListUi,
    renderFnList,
    syncParamPanel,
    paintReadouts,
    schedulePointLabelFusion,
    fnDisplayLabel,
    resolveFunctionColor,
    followIdForFn,
    rebuildCurve,
    bindRangeNumber,
    mountMathNumKeypads,
    bindObjectStyleForPanel,
    createBoardSelectionController,
    setPointOptionHooks,
    setStyleIntentBridge,
    findUserRec,
    userPointIdOf,
    setUserPointFollow,
    setPointShowCoords,
    listFollowTargets,
    activeFn,
    evalFnY,
    removeConstructionById,
    removeUserPointById,
    deleteFn,
    isExtendStyleTarget,
    setConstructionExtend,
    normalizePointStylePatch,
    normalizeConstructionStylePatch,
    attachBoardCompass,
    attachBoardToolStrip,
    clearToolPick,
    createProbeController,
    attachToolPointer,
    handleToolTap,
    bindEscToSelect,
    attachBoardNotes,
    createGraphHistoryController,
    createGraphPersistenceController,
    createDefaultGraphDocument,
    appConfirm,
    appAlert,
    bindMathThemeRestyle,
    createMathBoard,
    createGraphPersistence,
    createGraphIdAllocator,
    createGraphStore,
    createGraphHistory,
    viewBridge,
    graphRenderer,
    syncRuntimeFromDocument,
    bindPointLabelFusion,
    unbindPointLabelFusion,
    makeDrawHost,
    hitBoardPrefer,
    clearAllConstructions,
    removeUserPointEls,
    removeAllFnCurves,
    freeMathBoard,
    curveRebuildTask,
    onToolEsc,
    hideAddPanel,
    hideAiFnModal,
    dismissBoardNotesMode,
    getStageEl,
    resetReferenceKey,
    syncRangeNumber,
    defaultCoeffsFor,
    GRAPH_PRESETS,
    addPresetFn,
    formulaText,
    mirrorActiveToLegacy,
    pointLayer,
    constructionLayer,
    curveFollowTargetId,
    parseFeatureFollowTargetId,
    detachConstr,
    renderProbeReadout,
  } = deps;

function syncSliders() {
  for (const [id, key, numId] of [
    ['mathGraphA', 'a', 'mathGraphANum'],
    ['mathGraphB', 'b', 'mathGraphBNum'],
    ['mathGraphC', 'c', 'mathGraphCNum'],
  ]) {
    syncRangeNumber(
      /** @type {HTMLInputElement | null} */ (document.getElementById(id)),
      /** @type {HTMLInputElement | null} */ (document.getElementById(numId)),
      state.coeffs[key],
    );
  }
  const showC = ['quadratic', 'exp', 'log', 'abs', 'sine', 'cosine'].includes(state.preset);
  const cRow = document.getElementById('mathGraphCRow');
  if (cRow) cRow.hidden = !showC;

  const labels = {
    linear: ['a（斜率）', 'b（截距）', 'c'],
    quadratic: ['a（开口）', 'b（一次项）', 'c（常数项）'],
    power: ['a（系数）', 'n（指数）', 'c'],
    exp: ['a（系数）', 'b（指数系数）', 'c（上下平移）'],
    log: ['a（系数）', 'b（左右平移）', 'c（上下平移）'],
    abs: ['a（伸缩）', 'b（对称轴）', 'c（上下平移）'],
    inverse: ['k（比例系数）', 'b', 'c'],
    sine: ['A（振幅）', 'ω（角频率）', 'φ（初相）'],
    cosine: ['A（振幅）', 'ω（角频率）', 'φ（初相）'],
  };
  const L = labels[state.preset] || ['a', 'b', 'c'];
  const aName = document.querySelector('#mathGraphALabel .math-slider-name');
  const bName = document.querySelector('#mathGraphBLabel .math-slider-name');
  const cName = document.querySelector('#mathGraphCLabel .math-slider-name');
  if (aName) aName.textContent = L[0];
  if (bName) bName.textContent = L[1];
  if (cName) cName.textContent = L[2];
}
function ensurePreset(id) {
  const fn = activeFn();
  if (fn && fn.kind === 'preset' && fn.preset === id) return;
  if (fn && fn.kind === 'preset') {
    if (!state.graphStore) {
      fn.preset = id;
      fn.coeffs = defaultCoeffsFor(/** @type {any} */ (id));
      mirrorActiveToLegacy();
      syncSliders();
      rebuildCurve();
      return;
    }
    state.graphStore.dispatch({
      type: 'function/update',
      payload: { id: fn.id, patch: { preset: id, coeffs: defaultCoeffsFor(/** @type {any} */ (id)) } },
    });
    return;
  }
  // 无选中预设时直接加一条
  addPresetFn(id);
}
function getLabSnapshot() {
  if (!state.board) return null;
  const preset = state.preset;
  const c = state.coeffs;
  const meta = GRAPH_PRESETS.find((p) => p.id === preset);
  return {
    tab: 'graph',
    label: '函数画布',
    summary: `${meta?.label || preset} · a=${c.a}, b=${c.b}, c=${c.c}`,
    formula: formulaText(/** @type {any} */ (preset), c),
    params: { preset, coeffs: { ...c } },
  };
}
function applyLabAction(action) {
  if (!state.board && !document.getElementById('mathGraphBoard')) {
    return { ok: false, message: '画板未挂载' };
  }
  if (action.preset) ensurePreset(action.preset);
  if (action.coeffs) {
    setCoeffs({
      a: action.coeffs.a ?? state.coeffs.a,
      b: action.coeffs.b ?? state.coeffs.b,
      c: action.coeffs.c ?? state.coeffs.c,
    });
    state.startCoeffs = { ...state.coeffs };
  }
  return {
    ok: true,
    message: action.label || '已应用到函数画布',
  };
}
/** 滑杆高频输入：同帧内合并为一次 dispatch/apply（frame batching）。 */
let pendingCoeff = null;
let coeffFrame = null;
function openCoeffTransaction() {
  if (state.coeffTxTimer != null) {
    clearTimeout(state.coeffTxTimer);
  } else {
    state.graphStore?.beginTransaction();
  }
  state.coeffTxTimer = window.setTimeout(() => {
    state.coeffTxTimer = null;
    state.graphStore?.commitTransaction();
  }, 300);
}
function flushCoeffFrame() {
  coeffFrame = null;
  const patch = pendingCoeff;
  pendingCoeff = null;
  if (!patch) return;
  const fn = activeFn();
  if (!fn || fn.kind !== 'preset' || fn.locked || !state.graphStore) return;
  openCoeffTransaction();
  state.graphStore.dispatch({
    type: 'function/update',
    payload: { id: fn.id, patch: { coeffs: { ...fn.coeffs, ...patch } } },
  });
}
function setCoeffs(next) {
  const fn = activeFn();
  if (!fn || fn.kind !== 'preset' || fn.locked) return;
  if (!state.graphStore) {
    fn.coeffs = { ...fn.coeffs, ...next };
    state.coeffs = { ...(fn.coeffs || state.coeffs), ...next };
    syncSliders();
    rebuildCurve();
    return;
  }
  pendingCoeff = { ...(pendingCoeff || {}), ...next };
  if (coeffFrame == null) {
    coeffFrame = requestAnimationFrame(flushCoeffFrame);
  }
}
function detachFunctionDependents(fnId) {
  const board = state.board;
  if (!board) return;
  for (const rec of state.userPoints.slice()) {
    const tid = rec.followTargetId;
    const isFollow =
      tid === curveFollowTargetId(fnId) || parseFeatureFollowTargetId(tid)?.fnId === fnId;
    const isIntersection = rec.intersectFnIds?.includes(fnId);
    if (!isFollow && !isIntersection) continue;
    try {
      board.removeObject(rec.el);
    } catch {
      /* */
    }
    state.userPoints = state.userPoints.filter((r) => r.id !== rec.id);
  }
  for (const rec of state.constructions.slice()) {
    if (rec.fnId !== fnId && !rec.fnIds?.includes(fnId)) continue;
    detachConstr(rec, board);
    state.constructions = state.constructions.filter((c) => c.id !== rec.id);
  }
  reregisterSelectable();
}
function rebindFunctionDependents(fnId, doc) {
  for (const pt of doc.points || []) {
    const constraint = pt.constraint;
    if (!constraint || typeof constraint !== 'object') continue;
    const depends =
      (constraint.kind === 'followFunction' && constraint.functionId === fnId) ||
      (constraint.kind === 'followFeature' && constraint.functionId === fnId) ||
      (constraint.kind === 'intersection' && constraint.targetIds?.includes(fnId));
    if (depends) pointLayer.add(pt);
  }
  for (const rec of doc.constructions || []) {
    if (rec.fnId !== fnId && !rec.fnIds?.includes(fnId)) continue;
    constructionLayer.add(rec);
  }
  reregisterSelectable();
}
function dismissFnAddModal() {
  hideAddPanel();
}
function dismissGraphNotesMode() {
  dismissBoardNotesMode();
  state.notes?.setActive?.(false);
}
function initGraphUI() {
  setStageEl(document.getElementById('mathGraphStage'));
  const stageEl = getStageEl();
  if (!stageEl || !document.getElementById('mathGraphBoard')) return;

  if (state.board) {
    resizeMathBoard(state.board, getStageEl());
    ensureMathFloatCardsBound();
    bindFnListUi();
    renderFnList();
    syncParamPanel();
    paintReadouts();
    return;
  }

  // 持久化：先加载（含迁移/限额校验），再建 board/store，避免先默认后覆盖
  state.graphPersistence?.dispose?.();
  state.graphPersistence = createGraphPersistence({
    storage: window.localStorage,
    now: () => new Date().toISOString(),
  });
  const loadedDoc = state.graphPersistence.load().document;

  state.board = createMathBoard('mathGraphBoard', {
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
    onAxisSettingsChange: (st) => {
      if (state.axisSettingsApplying) return;
      const nextMin = Number(st.fXMin);
      const nextMax = Number(st.fXMax);
      const domainChanged =
        Number.isFinite(nextMin) &&
        Number.isFinite(nextMax) &&
        (nextMin !== state.fXMin || nextMax !== state.fXMax);
      if (domainChanged) {
        state.fXMin = Math.min(nextMin, nextMax);
        state.fXMax = Math.max(nextMin, nextMax);
        state.axisSettingsApplying = true;
        try {
          rebuildCurve();
        } finally {
          state.axisSettingsApplying = false;
        }
      }
      schedulePointLabelFusion();
    },
  });
  bindPointLabelFusion(state.board);
  // 视口平移/缩放 → 文档 view/update（250ms 静默合并；applyView 有防回环 guard）
  try {
    state.board.on?.('boundingbox', () => viewBridge.onBoardBoundingBox());
  } catch {
    /* */
  }

  // 文档底座：函数集合作为首个接入 store 的行为（历史/事务链路）；
  // 函数/活动 id/镜像由首次 fullRender 从 store 文档建立
  state.idAllocator = createGraphIdAllocator(loadedDoc);
  state.graphStore?.dispose?.();
  state.graphStore = createGraphStore(loadedDoc, {
    beforeCommit: syncRuntimeFromDocument,
    recoverRuntime: (doc) => graphRenderer.recover(doc),
  });
  state.graphHistory?.dispose?.();
  state.graphHistory = createGraphHistory(state.graphStore);
  // 初始 storage load：建立起点，清空历史（不能 undo 回「导入前」）
  state.graphHistory.clear();
  // 文档变更 → 自动保存（300ms debounce；annotations/replace 带 persist:true）
  state.storeUnsub?.();
  state.storeUnsub = state.graphStore.subscribe((event) => {
    if (event.action?.type === 'transaction/cancel') return;
    if (event.action?.meta?.persist === false) return;
    state.graphPersistence?.scheduleSave(event.current);
  });

  bindFnListUi();

  const graphPanel = document.getElementById('panel-math-graph');
  if (graphPanel && !graphPanel.dataset.mathSlidersBound) {
    graphPanel.dataset.mathSlidersBound = '1';
    for (const [id, key, numId] of [
      ['mathGraphA', 'a', 'mathGraphANum'],
      ['mathGraphB', 'b', 'mathGraphBNum'],
      ['mathGraphC', 'c', 'mathGraphCNum'],
    ]) {
      bindRangeNumber({
        range: /** @type {HTMLInputElement | null} */ (document.getElementById(id)),
        number: /** @type {HTMLInputElement | null} */ (document.getElementById(numId)),
        onChange: (v) => {
          setCoeffs({ [key]: v });
        },
      });
    }
    mountMathNumKeypads(graphPanel);
  }

  const graphPanelRoot = document.getElementById('panel-math-graph');
  state.styleBind = bindObjectStyleForPanel(graphPanelRoot, createBoardSelectionController);
  state.styleBind?.selection?.attachBoard?.(state.board);

  setPointOptionHooks({
    // 仅用户自建点 + 非交点 + 存在可跟随目标时显示
    canFollow: (el) =>
      Boolean(el?._mathUserPoint) &&
      Boolean(el?._mathCanFollow) &&
      !el?._mathIntersectFnIds &&
      !findUserRec(el)?.locked &&
      listFollowTargets().length > 0,
    getFollow: (el) => {
      const rec = findUserRec(el);
      if (rec) return Boolean(rec.followTargetId);
      return Boolean(el?._mathFollowTargetId || el?._mathFollow);
    },
    setFollow: (el, on) => {
      const rec = findUserRec(el);
      const id = rec?.id || userPointIdOf(el);
      if (!id || rec?.locked) return setUserPointFollow(el, on);
      const store = state.graphStore;
      if (!store) return setUserPointFollow(el, on);
      const current = store.getDocument().points.find((p) => p.id === id);
      const constraint = on
        ? { kind: 'followFunction', functionId: activeFn()?.id || '', anchorX: Number(el.X?.() ?? current?.x ?? 0) }
        : { kind: 'free' };
      store.dispatch({ type: 'point/update', payload: { id, patch: { constraint } } });
    },
    getShowCoords: (el) => {
      const rec = findUserRec(el);
      if (rec) return rec.showCoords;
      return Boolean(el?._mathShowCoords);
    },
    setShowCoords: (el, on) => {
      const rec = findUserRec(el);
      const id = rec?.id || userPointIdOf(el);
      if (!id || rec?.locked) return setPointShowCoords(el, on);
      const store = state.graphStore;
      if (!store) return setPointShowCoords(el, on);
      store.dispatch({ type: 'point/update', payload: { id, patch: { showCoords: Boolean(on) } } });
    },
    canDelete: (el) => {
      if (Boolean(el?._mathUserPoint) && Boolean(findUserRec(el))) {
        return !findUserRec(el)?.locked;
      }
      if (el?._mathConstrId) return true;
      if (el?._mathFnId || state.functions.some((f) => f.curve === el)) return true;
      return false;
    },
    deletePoint: (el) => {
      try {
        state.styleBind?.selection?.clear?.();
      } catch {
        /* */
      }
      if (el?._mathConstrId) {
        removeConstructionById(el._mathConstrId);
        return;
      }
      const fn =
        (el?._mathFnId && state.functions.find((f) => f.id === el._mathFnId)) ||
        state.functions.find((f) => f.curve === el);
      if (fn) {
        deleteFn(fn.id);
        return;
      }
      const rec = findUserRec(el);
      if (rec && !rec.locked) removeUserPointById(rec.id);
    },
    canExtend: (el) => {
      if (!el?._mathConstrId) return false;
      const rec = state.constructions.find((c) => c.id === el._mathConstrId);
      return isExtendStyleTarget(el, rec);
    },
    getExtend: (el) => {
      if (!el?._mathConstrId) return false;
      // 点/垂足上不读延长状态，避免点样式带出开关
      if (el.elType !== 'segment') return false;
      const rec = state.constructions.find((c) => c.id === el._mathConstrId);
      return Boolean(rec?.extend);
    },
    setExtend: (el, on) => {
      if (!el?._mathConstrId || el.elType !== 'segment') return;
      if (state.graphStore) {
        state.graphStore.dispatch({
          type: 'construction/update',
          payload: { id: el._mathConstrId, patch: { extend: Boolean(on) } },
        });
        return;
      }
      setConstructionExtend(makeDrawHost(), el, on);
      try {
        state.board?.update?.();
      } catch {
        /* */
      }
    },
  });

  setStyleIntentBridge(({ objectType, objectId, patch }) => {
    const store = state.graphStore;
    if (!store) return false;
    const doc = store.getDocument();
    if (objectType === 'point') {
      const rec = doc.points.find((p) => p.id === objectId);
      if (!rec || rec.locked) return true; // 锁定点：吞掉 intent
      store.dispatch({ type: 'point/update', payload: { id: objectId, patch: { style: normalizePointStylePatch(rec.style, patch) } } });
      return true;
    }
    if (objectType === 'construction') {
      const rec = doc.constructions.find((c) => c.id === objectId);
      if (!rec) return false;
      store.dispatch({ type: 'construction/update', payload: { id: objectId, patch: {}, style: normalizeConstructionStylePatch(rec.style, patch) } });
      return true;
    }
    return false;
  });

  state.compass?.dispose?.();
  state.compass = attachBoardCompass(state.board, {
    items: GRAPH_BOARD_TOOLS.filter((t) => t.id !== 'select').map((t) => ({
      id: t.id,
      label: t.label,
    })),
    shouldIgnoreTarget: () => Boolean(state.notes?.isActive?.()),
    // 仅笔记模式抑制；点上长按要能开罗盘（切线等）
    shouldSuppressHold: () => Boolean(state.notes?.isActive?.()),
    // 按住点时 JSXGraph 会进 DRAG，仍允许开罗盘
    shouldAllowHoldDespiteDrag: (ev) => {
      const hit = hitBoardPrefer(state.board, ev);
      if (!hit) return false;
      if (hit._mathUserPoint) return true;
      if (hit.elType === 'point' || hit.elType === 'glider') return true;
      if (hit.elementClass === 1) return true;
      return false;
    },
    onAction: async (id, ctx) => {
      if (state.notes?.isActive?.()) return;
      state.toolStrip?.setTool?.(id, { toggle: false, oneShot: true });
      state.toolOneShot = true;
      await handleToolTap({
        usrX: ctx.usrX,
        usrY: ctx.usrY,
        hit: hitBoardPrefer(state.board, {
          clientX: ctx.clientX,
          clientY: ctx.clientY,
        }),
        event: /** @type {any} */ ({
          clientX: ctx.clientX,
          clientY: ctx.clientY,
        }),
      });
    },
  });

  state.toolStrip?.dispose?.();
  state.toolStrip = attachBoardToolStrip({
    host: getStageEl(),
    tools: GRAPH_BOARD_TOOLS,
    initialTool: 'select',
    onChange: (next, setOpts = {}) => {
      clearToolPick();
      if (!setOpts.oneShot) state.toolOneShot = false;
      // 探针工具激活/退出（transient，不写文档）
      if (next === 'probe') state.probe?.activate?.();
      else state.probe?.deactivate?.();
    },
  });

  // 探针：transient 十字线/读数；pointer move 帧合并，不写文档/历史/自动保存
  state.probe?.dispose?.();
  state.probe = createProbeController({
    board: state.board,
    getFunctions: () => state.functions,
    getActiveFunctionId: () => state.activeFnId,
    resolveEvaluator: (fn) => (x) => evalFnY(fn, x),
    labelFor: fnDisplayLabel,
    getTick: () => {
      try {
        return Math.abs(Number(state.board.unitX)) || 1;
      } catch {
        return 1;
      }
    },
    readoutEl: /** @type {any} */ (document.getElementById('mathGraphProbeReadout')),
    eventTarget: window,
    onSample: renderProbeReadout,
  });

  state.toolPointer?.dispose?.();
  state.toolPointer = attachToolPointer(state.board, {
    shouldHandle: () => {
      const t = state.toolStrip?.getTool?.() || 'select';
      return t !== 'select' && !state.notes?.isActive?.();
    },
    shouldIgnoreTarget: () => Boolean(state.notes?.isActive?.()),
    onTap: (ctx) => {
      void handleToolTap(ctx);
    },
  });
  bindEscToSelect();

  state.notes?.dispose?.();
  state.notes = attachBoardNotes(state.board, {
    host: getStageEl(),
    storageKey: 'math-graph-board-notes-v1',
  });

  state.historyController?.dispose?.();
  state.historyController = createGraphHistoryController({
    eventTarget: window,
    root: document.getElementById('panel-math-graph') || document,
    history: state.graphHistory,
    notes: state.notes,
  });

  // 恢复批注 → 之后任何 stroke/clear/undo 都回写文档（record:false, persist:true）
  state.notes?.replaceSnapshot?.(loadedDoc.annotations);
  state.notesUnsub?.();
  state.notesUnsub = state.notes?.onSnapshotChange?.((snapshot) => {
    if (!state.graphStore) return;
    state.graphStore.dispatch({
      type: 'annotations/replace',
      payload: { annotations: snapshot },
      meta: { record: false, persist: true },
    });
  });

  // 页面隐藏时立即落盘
  state.onPageHide = () => state.graphPersistence?.flush();
  window.addEventListener('pagehide', state.onPageHide);

  // 项目：导入 / 导出 / 重置
  state.persistenceController = createGraphPersistenceController({
    persistence: state.graphPersistence,
    store: () => ({
      ...state.graphStore,
      reseedAllocator: (doc) => state.idAllocator?.reseed(doc),
    }),
    history: () => state.graphHistory,
    defaultDocument: () =>
      createDefaultGraphDocument({
        now: () => new Date().toISOString(),
        functionId: 'f1',
      }),
    confirm: appConfirm,
    alert: (message, opts) => appAlert(message, opts),
    pickJsonFile: () => {
      const input = /** @type {HTMLInputElement | null} */ (document.getElementById('mathGraphFileInput'));
      if (!input) return Promise.resolve(null);
      return new Promise((resolve) => {
        const onChange = () => {
          input.removeEventListener('change', onChange);
          const file = input.files?.[0];
          input.value = '';
          if (!file) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve(null);
          reader.readAsText(file, 'utf-8');
        };
        input.addEventListener('change', onChange);
        input.click();
      });
    },
    downloadText: (filename, text) => {
      try {
        const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch {
        /* download blocked */
      }
    },
  });
  document
    .getElementById('btnMathGraphImport')
    ?.addEventListener('click', () => void state.persistenceController.importJson());
  document
    .getElementById('btnMathGraphExport')
    ?.addEventListener('click', () => state.persistenceController.exportJson());
  document
    .getElementById('btnMathGraphReset')
    ?.addEventListener('click', () => void state.persistenceController.reset());

  syncSliders();
  // 首次投影：production renderer 从 store 文档全量渲染
  graphRenderer.fullRender(state.graphStore.getDocument());
  state.startCoeffs = { ...state.coeffs };
  ensureMathFloatCardsBound();
  renderFnList();
  syncParamPanel();

  state.ro = new ResizeObserver(() => {
    resizeMathBoard(state.board, getStageEl());
    state.notes?.redraw?.();
    schedulePointLabelFusion();
  });
  state.ro.observe(getStageEl());
  requestAnimationFrame(() => {
    resizeMathBoard(state.board, getStageEl());
    state.notes?.redraw?.();
    schedulePointLabelFusion();
  });

  // 换肤契约：bindMathThemeRestyle → restyle + rebuild（含 remint）
  state.themeHandle?.dispose?.();
  state.themeHandle = bindMathThemeRestyle(() => state.board, {
    onAfterRestyle: () => {
      rebuildCurve();
      try {
        state.notes?.redraw?.();
      } catch {
        /* */
      }
    },
  });
}

function resizeGraph() {
  if (state.board) resizeMathBoard(state.board, getStageEl());
  state.notes?.redraw?.();
}

function disposeGraph() {
  curveRebuildTask.cancel();
  if (coeffFrame != null) {
    cancelAnimationFrame(coeffFrame);
    coeffFrame = null;
    flushCoeffFrame();
  }
  if (state.coeffTxTimer != null) {
    clearTimeout(state.coeffTxTimer);
    state.coeffTxTimer = null;
    state.graphStore?.cancelTransaction();
  }
  // 持久化收尾：卸载监听、pagehide 移除、落盘
  state.storeUnsub?.();
  state.storeUnsub = null;
  state.notesUnsub?.();
  state.notesUnsub = null;
  if (state.onPageHide) {
    window.removeEventListener('pagehide', state.onPageHide);
    state.onPageHide = null;
  }
  state.graphPersistence?.dispose();
  state.graphPersistence = null;
  state.persistenceController = null;
  viewBridge.dispose();
  try {
    state.board?.off?.('boundingbox');
  } catch {
    /* */
  }
  state.historyController?.dispose?.();
  state.historyController = null;
  state.graphHistory?.dispose?.();
  state.graphHistory = null;
  state.graphStore?.dispose?.();
  state.graphStore = null;
  hideAddPanel();
  hideAiFnModal();
  dismissBoardNotesMode();
  if (state.escBound) {
    window.removeEventListener('keydown', onToolEsc);
    state.escBound = false;
  }
  state.themeHandle?.dispose?.();
  state.themeHandle = null;
  state.notes?.dispose?.();
  state.notes = null;
  state.toolPointer?.dispose?.();
  state.toolPointer = null;
  state.toolStrip?.dispose?.();
  state.toolStrip = null;
  state.probe?.dispose?.();
  state.probe = null;
  if (state.referenceCurve) {
    try {
      state.board?.removeObject?.(state.referenceCurve);
    } catch {
      /* */
    }
    state.referenceCurve = null;
    resetReferenceKey?.();
  }
  state.toolPick = null;
  state.compass?.dispose?.();
  state.compass = null;
  setPointOptionHooks(null);
  setStyleIntentBridge(null);
  state.styleBind?.dispose?.();
  state.styleBind = null;
  state.ro?.disconnect();
  clearAllConstructions(makeDrawHost());
  removeUserPointEls();
  if (state.board) removeAllFnCurves(state.board);
  unbindPointLabelFusion(state.board);
  freeMathBoard(state.board);
  state.board = null;
  state.curve = null;
  state.marks = [];
  state.asy = [];
  state.userPoints = [];
  state.constructions = [];
  state.functions = [];
  state.activeFnId = null;
  state.editMode = false;
}

/** 关闭添加函数弹窗（Tab 切换 / 离开教室时调用） */

  return { initGraphUI, resizeGraph, disposeGraph, syncSliders, ensurePreset, getLabSnapshot, applyLabAction, openCoeffTransaction, flushCoeffFrame, setCoeffs, detachFunctionDependents, rebindFunctionDependents, dismissFnAddModal, dismissGraphNotesMode };
}
