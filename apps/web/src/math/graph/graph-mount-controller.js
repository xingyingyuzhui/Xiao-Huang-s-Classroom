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

import { createDisposeSession } from './graph-dispose-session.js';
import { createGraphBoardSession } from './graph-board-session.js';
import { createGraphUiBindings } from './graph-ui-bindings.js';

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
    reregisterSelectable,
    renderProbeReadout,
    readoutsDispose,
    readoutsReset,
  } = deps;

  /** dispose 会话：每轮 mount 重建；转发函数保证当前轮生效。 */
  let disposeSession = createDisposeSession();
  function register(disposer) {
    disposeSession.register(disposer);
  }
  function disposeAll() {
    disposeSession.disposeAll();
  }
  function isDisposed() {
    return disposeSession.isDisposed();
  }

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
    window.clearTimeout(state.coeffTxTimer);
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

  // 已有 board：仅快速路径，不替换活动 session、不 reset readouts
  if (state.board) {
    resizeMathBoard(state.board, getStageEl());
    ensureMathFloatCardsBound();
    bindFnListUi();
    renderFnList();
    syncParamPanel();
    paintReadouts();
    return;
  }

  // 真正开始一轮新 mount 时才建立新 session；readouts 随 mount 周期重新武装
  disposeSession = createDisposeSession();
  readoutsReset?.();

  // board/store/history/persistence 创建收敛到 board session（失败不发布半初始化）
  const session = createGraphBoardSession({
    state,
    getStageEl,
    createGraphPersistence,
    createMathBoard,
    followIdForFn,
    fnDisplayLabel,
    resolveFunctionColor,
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
  });
  state.graphPersistence = session.persistence;
  state.board = session.board;
  state.idAllocator = session.idAllocator;
  state.graphStore = session.store;
  state.graphHistory = session.history;
  state.storeUnsub = session.storeUnsub;
  const loadedDoc = session.loadedDoc;

  bindFnListUi();

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
  register(() => state.compass?.dispose?.());
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
  register(() => state.toolStrip?.dispose?.());
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
  register(() => state.probe?.dispose?.());
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
  // keydown（Esc 回 select）在 dispose 时精确移除；escBound 归零保证下次 mount 重新绑定
  register(() => {
    if (state.escBound) {
      window.removeEventListener('keydown', onToolEsc);
      state.escBound = false;
    }
  });

  state.notes?.dispose?.();
  register(() => state.toolPointer?.dispose?.());
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
  register(() => state.historyController?.dispose?.());
  register(() => state.notes?.dispose?.());

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
  register(() => state.notesUnsub?.());

  // 页面隐藏时立即落盘
  state.onPageHide = () => state.graphPersistence?.flush();
  window.addEventListener('pagehide', state.onPageHide);
  register(() => {
    if (state.onPageHide) window.removeEventListener('pagehide', state.onPageHide);
    state.onPageHide = null;
  });

  // 文件/按钮/observer 绑定收敛到 ui bindings session
  const uiBindings = createGraphUiBindings({
    state,
    getStageEl,
    createGraphPersistenceController,
    createDefaultGraphDocument,
    appConfirm,
    appAlert,
    resizeMathBoard,
    schedulePointLabelFusion,
    ensureMathFloatCardsBound,
    renderFnList,
    syncParamPanel,
    syncSliders,
    bindRangeNumber,
    mountMathNumKeypads,
    setCoeffs,
    bindObjectStyleForPanel,
    createBoardSelectionController,
    register,
  });
  state.persistenceController = uiBindings.controller;
  register(() => {
    uiBindings.dispose();
    state.persistenceController = null;
  });

  // 换肤契约：bindMathThemeRestyle → restyle + rebuild（含 remint）
  state.themeHandle?.dispose?.();
  register(() => state.themeHandle?.dispose?.());
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

  // readouts 帧任务与过期回调失效（随 mount 周期 dispose/reset）
  register(() => readoutsDispose?.());

  // 首次全量投影：所有资源可回收后执行一次；失败不覆盖文档，renderer 自行 fatal
  const initialRender = graphRenderer.fullRender(state.graphStore.getDocument());
  if (initialRender?.ok) {
    state.startCoeffs = { ...state.coeffs };
    syncSliders();
  }
}
function resizeGraph() {
  if (state.board) resizeMathBoard(state.board, getStageEl());
  state.notes?.redraw?.();
}
/** 统一生命周期清理：disposer 栈逆序、幂等、单失败不阻断；状态归零在 finally。 */
function disposeGraph() {
  if (isDisposed()) return;
  const errors = [];
  const guard = (label, fn) => {
    try {
      fn();
    } catch (err) {
      errors.push([label, err]);
    }
  };

  try {
    // 必须在资源栈前处理的状态/事务收尾：任何一项抛错都记录并继续
    guard('curveRebuildTask.cancel', () => curveRebuildTask.cancel());
    guard('coeffFrame flush', () => {
      if (coeffFrame != null) {
        cancelAnimationFrame(coeffFrame);
        coeffFrame = null;
        flushCoeffFrame();
      }
    });
    guard('transaction cancel', () => {
      if (state.coeffTxTimer != null) {
        window.clearTimeout(state.coeffTxTimer);
        state.coeffTxTimer = null;
        state.graphStore?.cancelTransaction();
      }
    });
    guard('hideAddPanel', () => hideAddPanel());
    guard('hideAiFnModal', () => hideAiFnModal());
    guard('notes mode', () => dismissBoardNotesMode());
    guard('point hooks', () => setPointOptionHooks(null));
    guard('style bridge', () => setStyleIntentBridge(null));
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
  } catch (err) {
    errors.push(['disposeGraph pre-cleanup', err]);
  } finally {
    try {
      disposeAll();
    } catch (err) {
      errors.push(['disposeAll', err]);
    }
    resetState();
  }
  if (errors.length) console.error('[graph] dispose errors:', errors);
}

/** 状态归零（board 由注册的 disposer 释放）；与 disposeAll 解耦，保证无论如何执行。 */
function resetState() {
  state.curve = null;
  state.marks = [];
  state.asy = [];
  state.userPoints = [];
  state.constructions = [];
  state.functions = [];
  state.activeFnId = null;
  state.editMode = false;
  state.notes = null;
  state.toolPointer = null;
  state.toolStrip = null;
  state.probe = null;
  state.compass = null;
  state.styleBind = null;
  state.graphStore = null;
  state.graphHistory = null;
  state.historyController = null;
  state.themeHandle = null;
}

/** 关闭添加函数弹窗（Tab 切换 / 离开教室时调用） */

  return { initGraphUI, resizeGraph, disposeGraph, syncSliders, ensurePreset, getLabSnapshot, applyLabAction, openCoeffTransaction, flushCoeffFrame, setCoeffs, detachFunctionDependents, rebindFunctionDependents, dismissFnAddModal, dismissGraphNotesMode };
}
