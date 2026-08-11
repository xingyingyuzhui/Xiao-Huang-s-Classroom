/**
 * 高中函数画布：参数滑条 + 多表征（特征 / 对应表）
 * + 作图工具条 / 长按罗盘 / 点跟随函数 / 显示坐标
 */

import { createMathBoard, freeMathBoard, resizeMathBoard } from '../shared/jsx-board.js';
import {
  getMathBoardChrome,
  resolveFunctionColor,
} from '../shared/math-theme.js';
import {
  bindMathThemeRestyle,
  detachBoardObject,
  withPreservedViewport,
} from '../shared/board-lifecycle.js';
import {
  applyBoardLabel,
  bindLiveLabel,
  boardLabelAttrs,
  formatElementCoordsLabel,
} from '../shared/board-label.js';
import {
  GRAPH_PRESETS,
  defaultCoeffsFor,
  formulaText,
  keyFeatures,
  asymptotes,
} from './model.js';
import { ensureMathFloatCardsBound } from '../shared/float-cards.js';
import { bindRangeNumber, syncRangeNumber } from '../shared/param-controls.js';
import { createFrameTask } from '../shared/frame-task.js';
import { refreshPointLabelFusionOnBoard } from '../shared/point-label-fusion.js';
import { createBoardSelectionController } from '../shared/object-select.js';
import {
  bindObjectStyleForPanel,
  setPointOptionHooks,
} from '../shared/object-style-panel.js';
import { attachBoardCompass } from '../shared/board-compass.js';
import { attachBoardNotes, dismissBoardNotesMode } from '../shared/board-notes.js';
import {
  attachBoardToolStrip,
  attachToolPointer,
  getBoardToolDef,
  hitBoardElement,
  hitBoardPrefer,
} from '../shared/board-tools.js';
import { GRAPH_BOARD_TOOLS } from './tool-definitions.js';
import { createUserPointController } from './user-points.js';
import { createFunctionPanelController } from './function-panel.js';
import { createPresetFunctionRecord, resolveFunctionSampleRange } from './function-records.js';
import { createDefaultGraphDocument } from './graph-document.js';
import { createGraphStore } from './graph-store.js';
import { createGraphHistory } from './graph-history.js';
import { createGraphHistoryController } from './graph-history-controller.js';
import { createGraphIdAllocator } from './graph-id-allocator.js';
import { createGraphReadouts } from './graph-readouts.js';
import { createGraphFunctionRuntime } from './graph-function-runtime.js';
import { createGraphToolController } from './graph-tool-controller.js';
import { createGraphMountController } from './graph-mount-controller.js';
import { createGraphFollowTargets } from './graph-follow-targets.js';
import { createGraphPersistence, createGraphPersistenceController } from './graph-persistence.js';
import {
  alignFeatureLabelWidths,
  applyGraphRuntimePlan,
  computeGraphRenderPlan,
  createGraphCommitBridge,
  createGraphViewBridge,
} from './graph-renderer.js';
import { createGraphDocumentRenderer } from './graph-document-renderer.js';
import { createPointLayer } from './point-layer.js';
import {
  normalizeConstructionStylePatch,
  normalizePointStylePatch,
} from './graph-record-validation.js';
import { setStyleIntentBridge } from '../shared/object-style-panel.js';
import { createConstructionLayer } from './construction-layer.js';
import { createProbeController } from './probe-controller.js';
import { describePresetTransform } from './transform-model.js';
import { createNumericAnalysisRunner } from './numeric-analysis-runner.js';
import { constructionDocumentRecord } from './construction/restore.js';
import { detachConstr } from './construction/records.js';
import { createSecantConstruction } from './construction/render-lines.js';
import {
  evaluateGraphFunction as evalFnY,
  findFunctionIntersectionNear,
  graphFunctionDisplayLabel as fnDisplayLabel,
  presetValueTable as valueTable,
  recomputeFunctionIntersection,
} from './function-analysis.js';
import {
  curveFollowTargetId,
  defaultFollowTol,
  featureFollowTargetId,
  findClosestFollowTarget,
  findNearestFollowTarget,
  getFollowTargetById,
  makeFeaturePointTarget,
  makeFunctionCurveTarget,
  parseFeatureFollowTargetId,
} from '../shared/follow-target.js';
import { pickTangentFollowTargetId, vertexFeatureOfFn } from './tangent-follow.js';
import { appConfirm, appAlert } from '../../shared/ui/app-dialog.js';
import { mountMathNumKeypads } from '../shared/num-keypad.js';
import {
  autoIntersectNewLine,
  clearAllConstructions,
  createFnIntersection,
  createLineIntersection,
  createNormalAtFn,
  createPerpToAxis,
  createPerpToFn,
  createPerpToLine,
  createSegmentOrLine,
  createTangent,
  deleteConstruction,
  isCurveEl,
  isExtendStyleTarget,
  isLineLike,
  lineLikeElOf,
  resolveTangentAnchor,
  restoreConstructions,
  setConstructionExtend,
  snapshotConstructions,
} from './draw-tools.js';

/** @deprecated 兼容旧跟随 id；新 id 为 graph:fn:<id> */
export const MAIN_CURVE_FOLLOW_ID = 'graph:main';

/**
 * 用户点：followTargetId 非空表示跟随该目标（多曲线铺路）
 * intersectFnIds 非空表示两函数交点（参数变化时重建）
 * @typedef {{
 *   id: string,
 *   el: any,
 *   followTargetId: string | null,
 *   intersectFnIds: [string, string] | null,
 *   showCoords: boolean,
 *   baseName: string,
 * }} UserPointRec
 *
 * @typedef {{
 *   id: string,
 *   name: string,
 *   kind: 'preset' | 'custom',
 *   preset: string | null,
 *   coeffs: { a: number, b: number, c: number },
 *   expr: string,
 *   color: string,
 *   visible: boolean,
 *   locked: boolean,
 *   domain: { mode: 'viewport' } | { mode: 'custom', min: number, max: number },
 *   curve: any,
 * }} FnRec
 */

/** @type {{ board: any, curve: any, marks: any[], asy: any[], coeffs: any, startCoeffs: any, preset: string, ro: ResizeObserver | null, styleBind: any, userPoints: UserPointRec[], constructions: any[], toolStrip: any, toolPointer: { dispose: () => void } | null, toolPick: any, compass: { dispose: () => void } | null, notes: { dispose: () => void, isActive: () => boolean, setActive: (on: boolean) => void, redraw: () => void } | null, fXMin: number, fXMax: number, axisSettingsApplying: boolean, functions: FnRec[], activeFnId: string | null, idAllocator: any, editMode: boolean, themeHandle: any, escBound: boolean, graphStore: any, graphHistory: any, historyController: any, coeffTxTimer: any }} */
const state = {
  board: null,
  curve: null,
  marks: [],
  asy: [],
  coeffs: defaultCoeffsFor('quadratic'),
  startCoeffs: { ...defaultCoeffsFor('quadratic') },
  preset: 'quadratic',
  ro: null,
  styleBind: null,
  userPoints: [],
  constructions: [],
  toolStrip: null,
  toolPointer: null,
  toolPick: null,
  compass: null,
  notes: null,
  fXMin: -10,
  fXMax: 10,
  axisSettingsApplying: false,
  /** 罗盘触发的一次性工具：完成一轮后回到选择 */
  toolOneShot: false,
  functions: [],
  activeFnId: null,
  idAllocator: null,
  editMode: false,
  themeHandle: null,
  escBound: false,
  graphStore: null,
  numericRunner: createNumericAnalysisRunner(),
  numericRequest: null,
  numericAnalysisSeq: 0,
  graphHistory: null,
  historyController: null,
  coeffTxTimer: null,
  viewTxTimer: null,
  viewApplying: false,
  graphPersistence: null,
  probe: null,
  referenceCurve: null,
  persistenceController: null,
  storeUnsub: null,
  notesUnsub: null,
  onPageHide: null,
};

let stageEl = null;

const curveRebuildTask = createFrameTask(() => rebuildCurve());
const pointLabelFusionTask = createFrameTask(() => refreshPointLabelFusion());

function listLabeledPointElements() {
  return listSnapTargets()
    .map((t) => t?.el)
    .filter(Boolean);
}

function refreshPointLabelFusion() {
  const board = state.board;
  if (!board) return;
  refreshPointLabelFusionOnBoard(board, listLabeledPointElements);
}

function schedulePointLabelFusion() {
  pointLabelFusionTask.schedule();
}

function bindPointLabelFusion(board) {
  if (!board) return;
  // 兼容旧调用：Refresh 也走 schedule，避免拖动热路径同步 O(P) 融合
  board._mathRefreshPointLabelFusion = () => schedulePointLabelFusion();
  board._mathSchedulePointLabelFusion = () => schedulePointLabelFusion();
  try {
    if (typeof board.on === 'function' && !board._mathFusionBBoxBound) {
      board._mathFusionBBoxBound = true;
      board.on('boundingbox', () => schedulePointLabelFusion());
    }
  } catch {
    /* some board builds omit boundingbox events */
  }
}

function unbindPointLabelFusion(board) {
  pointLabelFusionTask.cancel();
  if (!board) return;
  try {
    delete board._mathRefreshPointLabelFusion;
    delete board._mathSchedulePointLabelFusion;
  } catch {
    /* */
  }
}

/** 跟随目标解析 / 吸附 / 可选中注册 */
const followTargets = createGraphFollowTargets({
  getState: () => state,
  evalFnY,
  fnDisplayLabel,
  recomputeFunctionIntersection,
  createGraphCommitBridge,
  vertexFeatureOfFn,
  mainCurveFollowId: MAIN_CURVE_FOLLOW_ID,
  schedulePointLabelFusion,
});
const followIdForFn = followTargets.followIdForFn;
const activeFn = followTargets.activeFn;
const mirrorActiveToLegacy = followTargets.mirrorActiveToLegacy;
const colors = followTargets.colors;
const clearExtras = followTargets.clearExtras;
const listFollowTargets = followTargets.listFollowTargets;
const followTol = followTargets.followTol;
const recomputeIntersection = followTargets.recomputeIntersection;
const hitFollowNear = followTargets.hitFollowNear;
const resolveFollowTarget = followTargets.resolveFollowTarget;
const reregisterSelectable = followTargets.reregisterSelectable;
const listSnapTargets = followTargets.listSnapTargets;
const commitBridge = followTargets.commitBridge;
const { commitPointDocument, commitConstructionDocument, removeConstructionById, removeUserPointById } =
  followTargets;
const createUserPoint = followTargets.createUserPoint;
const makeDrawHost = followTargets.makeDrawHost;

const pointsCtrl = createUserPointController({
  getBoard: () => state.board,
  getRecords: () => state.userPoints,
  setRecords: (records) => {
    state.userPoints = records;
  },
  nextId: () => state.idAllocator?.nextPointId() || `U${Math.floor(Math.random() * 1e6)}`,
  getColors: colors,
  resolveFollowTarget,
  recomputeIntersection,
  listSnapTargets,
  makeDrawHost: () => makeDrawHost(),
  onSelectableChanged: reregisterSelectable,
  getSelection: () => state.styleBind?.selection || null,
  getViewportCenter: () => ({
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  }),
  defaultFollowTargetId: MAIN_CURVE_FOLLOW_ID,
  featureFollowTol: () => followTol(),
  // 拖动结束 → 文档 point/update（一次拖动一条历史）
  onPointMoved: (rec, _x, _y) => {
    if (!state.graphStore || !rec || rec.locked) return;
    const docRecord = pointsCtrl.documentRecordOf(rec);
    if (!docRecord) return;
    state.graphStore.dispatch({
      type: 'point/update',
      payload: {
        id: rec.id,
        patch: { x: docRecord.x, y: docRecord.y, constraint: docRecord.constraint },
      },
    });
  },
});
followTargets.setPointsCtrl?.(pointsCtrl);

const {
  create: createUserPointRaw,
  delete: deleteUserPoint,
  find: findUserRec,
  removeAll: removeUserPointEls,
  restore: restoreUserPoints,
  setFollow: setUserPointFollow,
  setFollowTarget: setUserPointFollowTarget,
  setShowCoords: setPointShowCoords,
  snapshot: snapshotUserPoints,
} = pointsCtrl;
followTargets.setRawFactories?.({ createUserPointRaw, deleteUserPoint, deleteConstruction });

function userPointIdOf(el) {
  if (!el) return null;
  const rec = findUserRec(el);
  return rec?.id || el._mathPointId || null;
}

/**
 * @param {any} el
 */
function ensureUserPointFromHit(el, usrX, usrY) {
  if (!el) return null;
  const existing = findUserRec(el);
  if (existing) return existing;
  // 点在曲线上：创建贴曲线的点
  if (isCurveEl(el)) {
    const fn = state.functions.find((f) => f.curve === el);
    if (!fn) return null;
    const y = evalFnY(fn, usrX);
    return createUserPoint(usrX, y == null ? usrY : y, {
      followTargetId: followIdForFn(fn.id),
      showCoords: true,
    });
  }
  return null;
}

/**
 * 用户坐标下最近可见曲线（容差：约 14px）
 * @param {number} usrX
 * @param {number} usrY
 */
function nearestFnAt(usrX, usrY) {
  const board = state.board;
  const unitY = Math.abs(Number(board?.unitY) || 40) || 40;
  const tol = 14 / unitY;
  /** @type {{ fn: any, d: number, y: number } | null} */
  let best = null;
  for (const fn of state.functions) {
    if (!fn.visible || !fn.curve) continue;
    const y = evalFnY(fn, usrX);
    if (y == null || !Number.isFinite(y)) continue;
    const d = Math.abs(y - usrY);
    if (d <= tol && (!best || d < best.d)) best = { fn, d, y };
  }
  return best;
}

/**
 * @param {any} hit
 * @param {number} usrX
 * @param {number} usrY
 */
function resolveCurveFromTap(hit, usrX, usrY) {
  if (hit && isCurveEl(hit)) {
    return state.functions.find((f) => f.curve === hit) || null;
  }
  return nearestFnAt(usrX, usrY)?.fn || null;
}

/**
 * @param {{ usrX: number, usrY: number, hit: any, event: PointerEvent }} ctx
 */
/** 工具 tap/pick 状态机（transient；正式对象走 Store action） */
const graphToolController = createGraphToolController({
  getState: () => state,
  makeDrawHost,
  findUserRec,
  ensureUserPointFromHit,
  resolveCurveFromTap,
  nearestFnAt,
  createUserPoint,
  removeUserPointById,
  commitPointDocument,
  commitConstructionDocument,
  removeConstructionById,
  setUserPointFollowTarget,
  reregisterSelectable,
  evalFnY,
  fnDisplayLabel,
  getBoardToolDef,
  findFunctionIntersectionNear,
  hitFollowNear,
  appConfirm,
  createSegmentOrLine,
  createTangent,
  createFnIntersection,
  createLineIntersection,
  createSecantConstruction,
  createPerpToAxis,
  createPerpToLine,
  createPerpToFn,
  isLineLike,
  isCurveEl,
  deleteFn,
  pickTangentFollowTargetId,
  parseFeatureFollowTargetId,
  curveFollowTargetId,
  followIdForFn,
  userPointIdOf,
  followTol,
  resolveTangentAnchor,
  appAlert,
});
const handleToolTap = graphToolController.handleToolTap;
const addPointAt = graphToolController.addPointAt;
const clearToolPick = graphToolController.clearToolPick;
const finishOneShotToolIfDone = graphToolController.finishOneShotToolIfDone;

function bindEscToSelect() {
  if (state.escBound) return;
  state.escBound = true;
  window.addEventListener('keydown', onToolEsc);
}

function onToolEsc(ev) {
  if (ev.key !== 'Escape') return;
  if (!state.board) return;
  if (state.toolPick) {
    clearToolPick();
    ev.preventDefault();
    return;
  }
  if (state.toolStrip?.getTool?.() !== 'select') {
    state.toolStrip?.setTool?.('select');
    ev.preventDefault();
  }
}

/**
 * @param {number} usrX
 * @param {number} usrY
 */

/** UI 延迟引用（panel/readouts 与 functionRuntime 互相依赖） */
const uiRefs = {};
/** 函数曲线/特征点/渐近线投影（颜色经主题解析，不写文档） */
const functionRuntime = createGraphFunctionRuntime({
  getState: () => state,
  evalFnY,
  colors,
  activeFn,
  boardLabelAttrs,
  applyBoardLabel,
  formatElementCoordsLabel,
  asymptotes,
  clearExtras,
  schedulePointLabelFusion,
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
  reregisterSelectable: (...a) => followTargets.reregisterSelectable(...a),
  renderFnList: (...a) => uiRefs.renderFnList?.(...a),
  syncParamPanel: (...a) => uiRefs.syncParamPanel?.(...a),
  paintReadouts: (...a) => uiRefs.paintReadouts?.(...a),
  mirrorActiveToLegacy: (...a) => followTargets.mirrorActiveToLegacy(...a),
  // 延迟求值：makeDrawHost 依赖 followTargets 实例，避免装配期 TDZ
  makeDrawHost: () => makeDrawHost(),
});
const rebuildCurve = functionRuntime.rebuildCurve;
const createFnCurve = functionRuntime.createFnCurve;
const detachFnCurve = functionRuntime.detachFnCurve;
const removeAllFnCurves = functionRuntime.removeAllFnCurves;
const refreshActiveMarks = functionRuntime.refreshActiveMarks;
const applyReferenceCurveFromDocument = functionRuntime.applyReferenceCurveFromDocument;

/** 特征卡/值表/探针读数：DOM 输出（业务真值仍在文档） */
const readouts = createGraphReadouts({
  getState: () => state,
  evalFnY,
  fnDisplayLabel,
  createFrameTask,
});
const paintReadouts = readouts.paintReadouts;
const renderProbeReadout = readouts.renderProbeReadout;

const {
  addPreset: addPresetFn,
  bind: bindFnListUi,
  hideAdd: hideAddPanel,
  hideAi: hideAiFnModal,
  render: renderFnList,
  syncParams: syncParamPanel,
} = createFunctionPanelController({
  state,
  activeFunction: activeFn,
  mirrorActiveToLegacy,
  rebuildCurve,
  detachFunctionCurve: detachFnCurve,
  paintReadouts,
  syncSliders: () => uiRefs.syncSliders?.(),
  store: () => state.graphStore,
  idAllocator: () => state.idAllocator,
});
uiRefs.renderFnList = renderFnList;
uiRefs.syncParamPanel = syncParamPanel;
uiRefs.paintReadouts = paintReadouts;

const pointLayer = createPointLayer({
  controller: pointsCtrl,
  getRecords: () => state.userPoints,
  getDocument: () => state.graphStore?.getDocument?.() || null,
  getConstructionLayer: () => constructionLayer,
});

const constructionLayer = createConstructionLayer({
  makeHost: () => makeDrawHost(),
  getConstructions: () => state.constructions,
});

/** 视口桥接：view/update 的 apply guard + boundingbox → 文档（250ms 合并） */
const viewBridge = createGraphViewBridge({
  getBoard: () => state.board,
  getStore: () => state.graphStore,
  getState: () => state,
});

/** mount 延迟引用（renderer 与 mount 互相依赖） */
const graphMountRef = {};
/** production renderer：增量投影 + 全量恢复（失败进入 fatal 只读）。 */
/** 按 id 删除函数（样式面板删除曲线入口） */
function deleteFn(id) {
  state.graphStore?.dispatch({ type: 'function/remove', payload: { id } });
}

/** 拆除函数依赖（跟随点/交点/构造；update 闭包路径的 remove 分支使用） */

const rendererContext = {
  getState: () => state,
  createFnCurve,
  detachFnCurve,
  detachFunctionDependents: (id) => graphMountRef.detachFunctionDependents?.(id),
  rebindFunctionDependents: (id, doc) => graphMountRef.rebindFunctionDependents?.(id, doc),
  clearAllRuntime: () => {
    if (state.referenceCurve) { detachBoardObject(state.board, state.referenceCurve); state.referenceCurve = null; }
    clearAllConstructions(makeDrawHost());
    removeUserPointEls(); clearExtras(state.board); removeAllFnCurves(state.board);
  },
  pointLayer,
  constructionLayer,
  refreshActiveMarks,
  mirrorActiveToLegacy,
  applyView: (view) => viewBridge.applyViewFromDocument(view),
  applyReference: applyReferenceCurveFromDocument,
  renderFnList,
  syncParamPanel,
  paintReadouts,
  computePlan: (previous, candidate) => computeGraphRenderPlan(previous, candidate),
  applyIncremental: (plan, previous, candidate, action, preview) =>
    applyGraphRuntimePlan(rendererContext, plan, { previous, candidate, action, preview }),
  onFatal: () => { state.toolStrip?.setHint?.('渲染失败：画布进入只读状态，请刷新页面'); state.rendererFatal = true; },
};
const graphRenderer = createGraphDocumentRenderer(rendererContext);
const syncRuntimeFromDocument = graphRenderer.beforeCommit;

/** 滑条/参数输入：300ms 静默窗口合并成一条历史 */

/** 滑杆高频输入：同帧内合并为一次 dispatch/apply（frame batching）。 */
let pendingCoeff = null;
let coeffFrame = null;

/** board/store/history/persistence/controller 装配与销毁（index.js 只做薄代理） */
const graphMount = createGraphMountController({
  state,
  setStageEl: (v) => {
    stageEl = v;
  },
  getStageEl: () => stageEl,
  resizeMathBoard,
  ensureMathFloatCardsBound,
  bindFnListUi,
  renderFnList,
  syncParamPanel,
  paintReadouts,
  renderProbeReadout,
  schedulePointLabelFusion,
  fnDisplayLabel,
  resolveFunctionColor,
  followIdForFn,
  rebuildCurve,
  syncRangeNumber,
  defaultCoeffsFor,
  GRAPH_PRESETS,
  addPresetFn,
  formulaText,
  mirrorActiveToLegacy,
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
  reregisterSelectable: (...a) => followTargets.reregisterSelectable(...a),
  onToolEsc,
  hideAddPanel,
  hideAiFnModal,
  dismissBoardNotesMode,
  resetReferenceKey: functionRuntime.resetReferenceKey,
  readoutsDispose: () => readouts.dispose(),
  readoutsReset: () => readouts.reset(),
});
graphMountRef.graphMount = graphMount;
export const initGraphUI = graphMount.initGraphUI;
export const resizeGraph = graphMount.resizeGraph;
export const disposeGraph = graphMount.disposeGraph;
export const getLabSnapshot = () => graphMount.getLabSnapshot();
export const applyLabAction = (action) => graphMount.applyLabAction(action);
export const dismissFnAddModal = () => graphMount.dismissFnAddModal();
export const dismissGraphNotesMode = () => graphMount.dismissGraphNotesMode();
/** 薄代理（延迟求值避免 TDZ） */
const syncSliders = () => graphMount.syncSliders();
uiRefs.syncSliders = syncSliders;
const ensurePreset = (id) => graphMount.ensurePreset(id);
const setCoeffs = (next) => graphMount.setCoeffs(next);
const openCoeffTransaction = () => graphMount.openCoeffTransaction();
const flushCoeffFrame = () => graphMount.flushCoeffFrame();

/** 退出笔记模式（保留笔迹） */
