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
  board._mathRefreshPointLabelFusion = () => refreshPointLabelFusion();
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

function followIdForFn(fnId) {
  return `graph:fn:${fnId}`;
}

function activeFn() {
  return state.functions.find((f) => f.id === state.activeFnId) || state.functions[0] || null;
}

/**
 * 同步「当前选中函数」到 legacy 字段，复用滑条/读数逻辑
 */
function mirrorActiveToLegacy() {
  const fn = activeFn();
  if (!fn) return;
  if (fn.kind === 'preset' && fn.preset) {
    state.preset = fn.preset;
    state.coeffs = { ...fn.coeffs };
  }
  state.curve = fn.curve;
  state.startCoeffs = { ...fn.coeffs };
}

/** @returns {ReturnType<typeof getMathBoardChrome>} */
function colors() {
  return getMathBoardChrome();
}

function clearExtras(board) {
  for (const m of state.marks) {
    try {
      board.removeObject(m);
    } catch {
      /* */
    }
  }
  for (const a of state.asy) {
    try {
      board.removeObject(a);
    } catch {
      /* */
    }
  }
  state.marks = [];
  state.asy = [];
}

/**
 * 当前画板可跟随对象列表（多条函数）
 * @returns {import('../shared/follow-target.js').FollowTarget[]}
 */
function listFollowTargets() {
  /** @type {import('../shared/follow-target.js').FollowTarget[]} */
  const out = [];
  for (const fn of state.functions) {
    if (!fn.visible || !fn.curve) continue;
    out.push(
      makeFunctionCurveTarget({
        id: followIdForFn(fn.id),
        label: fnDisplayLabel(fn),
        el: fn.curve,
        evalY: (x) => evalFnY(fn, x),
      }),
    );
    const vertex = vertexFeatureOfFn(fn);
    if (vertex) {
      out.push(
        makeFeaturePointTarget({
          id: featureFollowTargetId(fn.id, 'vertex'),
          label: `${fnDisplayLabel(fn)} · 顶点`,
          getPosition: () => vertexFeatureOfFn(fn),
        }),
      );
    }
  }
  // 兼容旧跟随 id
  if (out.length && !out.some((t) => t.id === MAIN_CURVE_FOLLOW_ID)) {
    const first = out.find((t) => t.kind === 'curve') || out[0];
    out.push({
      ...first,
      id: MAIN_CURVE_FOLLOW_ID,
      label: first.label,
    });
  }
  return out;
}

function followTol() {
  return defaultFollowTol(state.board);
}

const recomputeIntersection = (firstId, secondId, nearX) =>
  recomputeFunctionIntersection(
    state.functions,
    firstId,
    secondId,
    nearX,
    followTol(),
  );

/**
 * 在容差内找最近可跟随目标
 * @param {number} x
 * @param {number} y
 */
function hitFollowNear(x, y) {
  return findNearestFollowTarget(x, y, listFollowTargets(), followTol());
}

/**
 * 解析应绑定的目标：优先指定 id，否则最近
 * @param {number} x
 * @param {number} y
 * @param {string | null | undefined} preferredId
 * @param {{ requireNear?: boolean }} [opts]
 */
function resolveFollowTarget(x, y, preferredId, opts = {}) {
  const targets = listFollowTargets();
  if (!targets.length) return null;
  if (preferredId) {
    const t = getFollowTargetById(preferredId, targets);
    if (t) return t;
  }
  if (opts.requireNear) {
    return hitFollowNear(x, y)?.target || null;
  }
  return findClosestFollowTarget(x, y, targets)?.target || null;
}

function reregisterSelectable() {
  state.styleBind?.selection?.clear?.();
  if (!state.styleBind || !state.board) return;
  const userEls = state.userPoints.map((r) => r.el).filter(Boolean);
  const markEls = state.marks.filter(Boolean);
  const curveEls = state.functions.map((f) => f.curve).filter(Boolean);
  const constrEls = state.constructions.flatMap((c) => c.els || []).filter(Boolean);
  // 特征点：可改样式/显示坐标，不可跟随
  for (const m of markEls) {
    m._mathCanFollow = false;
    m._mathUserPoint = false;
    if (m._mathShowCoords == null) m._mathShowCoords = true;
    if (!m._mathBaseName) m._mathBaseName = typeof m.name === 'string' ? m.name : '点';
  }
  const els = [...curveEls, ...state.asy, ...markEls, ...userEls, ...constrEls].filter(
    Boolean,
  );
  state.styleBind.selection.registerMany(els, (el) => ({
    label: el._mathBaseName || (typeof el.name === 'string' ? el.name : undefined),
  }));
}

function listSnapTargets(excludeEl) {
  /** @type {Array<{ x: number, y: number, el?: any }>} */
  const out = [];
  const pushEl = (el) => {
    if (!el || el === excludeEl || el._is_removed) return;
    try {
      const x = Number(el.X());
      const y = Number(el.Y());
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      out.push({ x, y, el });
    } catch {
      /* */
    }
  };
  for (const r of state.userPoints) pushEl(r.el);
  for (const m of state.marks) pushEl(m);
  for (const c of state.constructions) {
    if (!c?.els) continue;
    for (const el of c.els) {
      if (!el || el._mathExtendRay) continue;
      const t = el.elType;
      if (t === 'point' || t === 'glider' || t === 'perpendicularpoint') pushEl(el);
    }
  }
  return out;
}

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

/** 工具对象 → 文档的提交/删除桥接 */
const commitBridge = createGraphCommitBridge({
  getStore: () => state.graphStore,
  getPointsCtrl: () => pointsCtrl,
  getState: () => state,
  fallbackDeleteUserPoint: (el) => deleteUserPoint(el),
  fallbackDeleteConstruction: (cid) => deleteConstruction(makeDrawHost(), cid),
});
const { commitPointDocument, commitConstructionDocument, removeConstructionById, removeUserPointById } = commitBridge;

/** 包一层：所有工具创建点都进文档 */
const createUserPoint = (x, y, options = {}) => {
  const rec = createUserPointRaw(x, y, options);
  if (rec) commitPointDocument(rec);
  return rec;
};

function makeDrawHost() {
  return {
    getBoard: () => state.board,
    getUserPoints: () => state.userPoints,
    getFunctions: () => state.functions,
    getConstructions: () => state.constructions,
    setConstructions: (list) => {
      state.constructions = list;
    },
    findUserEl: (id) => state.userPoints.find((r) => r.id === id)?.el || null,
    findConstr: (id) => state.constructions.find((c) => c.id === id) || null,
    evalFnY,
    findFnByCurve: (curve) => state.functions.find((f) => f.curve === curve) || null,
    recomputeIntersection,
    createUserPoint,
    nextConstrId: () => state.idAllocator?.nextConstructionId() || `C${Math.floor(Math.random() * 1e6)}`,
    listSnapTargets: () => listSnapTargets(),
    onChanged: () => {
      reregisterSelectable();
      schedulePointLabelFusion();
      try {
        state.board?.update?.();
      } catch {
        /* */
      }
    },
  };
}

/**
 * @param {any} el
 */
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
  addPointAt: (x, y) => {
    const rec = createUserPoint(x, y, { showCoords: true });
    if (rec) {
      commitPointDocument({ ...rec, x, y, constraint: { kind: 'free' } });
      reregisterSelectable();
    }
  },
  createSegmentOrLine,
  createTangent,
  createFnIntersection,
  createLineIntersection,
  createSecantConstruction,
  createPerpToAxis,
  isLineLike,
  pickTangentFollowTargetId,
  parseFeatureFollowTargetId,
  curveFollowTargetId,
  userPointIdOf,
  followTol,
  resolveTangentAnchor,
  appAlert,
});
const handleToolTap = graphToolController.handleToolTap;
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
async function addPointAt(usrX, usrY) {
  if (!state.board) return;
  let x = usrX;
  let y = usrY;
  /** @type {string | null} */
  let followTargetId = null;
  /** @type {[string, string] | null} */
  let intersectFnIds = null;

  // 1) 优先：靠近两函数交点 → 询问是否成为交点
  const ix = findFunctionIntersectionNear(
    state.functions,
    x,
    y,
    followTol(),
  );
  if (ix) {
    const la = fnDisplayLabel(ix.fnA);
    const lb = fnDisplayLabel(ix.fnB);
    const okIx = await appConfirm(
      `该位置靠近「${la}」与「${lb}」的交点，是否成为交点？`,
      {
        title: '函数交点',
        okText: '成为交点',
        cancelText: '否',
      },
    );
    if (okIx) {
      intersectFnIds = [ix.fnA.id, ix.fnB.id];
      x = ix.x;
      y = ix.y;
      createUserPoint(x, y, { intersectFnIds, showCoords: true });
      reregisterSelectable();
      state.board.update();
      return;
    }
  }

  // 2) 否则：靠近单条曲线 → 询问是否跟随
  const hit = hitFollowNear(x, y);
  if (hit) {
    const label = hit.target.label || '曲线';
    const ok = await appConfirm(`该位置靠近「${label}」，是否让点跟随？`, {
      title: '跟随对象',
      okText: '跟随',
      cancelText: '自由点',
    });
    if (ok) {
      followTargetId = hit.target.id;
      const sn = hit.target.snap(x, y);
      if (sn) {
        x = sn.x;
        y = sn.y;
      }
    }
  }

  createUserPoint(x, y, { followTargetId, showCoords: true });
  reregisterSelectable();
  state.board.update();
}

/** 函数画布重建（参数变化 / 换肤 / 全量重建） */
function rebuildCurve() {
  curveRebuildTask.cancel();
  const board = state.board;
  if (!board) return;
  // 生命周期：重建包 withPreservedViewport，避免镜头被图例/fullUpdate 打回
  withPreservedViewport(board, () => {
    const savedUsers = snapshotUserPoints();
    const savedConstr = snapshotConstructions(makeDrawHost());
    clearAllConstructions(makeDrawHost());
    removeUserPointEls();
    clearExtras(board);
    removeAllFnCurves(board);
    state.curve = null;

    for (const fn of state.functions) {
      createFnCurve(fn);
    }

    mirrorActiveToLegacy();
    paintActiveFeatureMarks();

    restoreUserPoints(savedUsers);
    restoreConstructions(makeDrawHost(), savedConstr, { notify: false });
    // 曲线重建后：补齐线/垂线与函数的交点（已有则跳过）
    {
      const host = makeDrawHost();
      for (const rec of host.getConstructions().slice()) {
        if (!rec || rec.kind === 'intersect') continue;
        if (!lineLikeElOf(rec)) continue;
        try {
          autoIntersectNewLine(host, rec);
        } catch {
          /* */
        }
      }
    }
    reregisterSelectable();
    renderFnList();
    syncParamPanel();
    paintReadouts();
    try {
      board.update();
    } catch {
      /* */
    }
    schedulePointLabelFusion();
    try {
      // refresh 契约：skipViewport，不重置镜头
      board._mathAxisLegend?.refresh?.();
    } catch {
      /* */
    }
  });
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
});
const createFnCurve = functionRuntime.createFnCurve;
const detachFnCurve = functionRuntime.detachFnCurve;
const removeAllFnCurves = functionRuntime.removeAllFnCurves;
const refreshActiveMarks = functionRuntime.refreshActiveMarks;

/** 特征卡/值表/探针读数：DOM 输出（业务真值仍在文档） */
const readouts = createGraphReadouts({
  getState: () => state,
  evalFnY,
  fnDisplayLabel,
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
  syncSliders,
  store: () => state.graphStore,
  idAllocator: () => state.idAllocator,
});

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

/** 参考曲线：同色虚线低透明度；不作为函数列表新函数、不参与吸附/交点。签名不变则跳过重建。 */
let lastReferenceKey = null;
function applyReferenceCurveFromDocument(doc) {
  const ref = doc?.presentation?.compare?.reference;
  const board = state.board;
  if (!board) return;
  const key = ref
    ? JSON.stringify({ kind: ref.kind, preset: ref.preset, expr: ref.expr, coeffs: ref.coeffs })
    : null;
  if (key === lastReferenceKey) return;
  lastReferenceKey = key;
  if (state.referenceCurve) {
    detachBoardObject(board, state.referenceCurve);
    state.referenceCurve = null;
  }
  if (!ref) return;
  const xLo = Math.min(Number.isFinite(state.fXMin) ? state.fXMin : -10, Number.isFinite(state.fXMax) ? state.fXMax : 10);
  const xHi = Math.max(Number.isFinite(state.fXMin) ? state.fXMin : -10, Number.isFinite(state.fXMax) ? state.fXMax : 10);
  try {
    state.referenceCurve = board.create(
      'functiongraph',
      [
        (x) => {
          const y = evalFnY(ref, x);
          return y == null ? NaN : y;
        },
        xLo,
        xHi,
      ],
      {
        strokeColor: resolveFunctionColor(ref),
        strokeWidth: 2,
        dash: 3,
        strokeOpacity: 0.45,
        highlight: false,
        withLabel: false,
        name: '参考曲线',
      },
    );
  } catch {
    state.referenceCurve = null;
  }
}

/** production renderer：增量投影 + 全量恢复（失败进入 fatal 只读）。 */
const rendererContext = {
  getState: () => state,
  createFnCurve,
  detachFnCurve,
  detachFunctionDependents,
  rebindFunctionDependents,
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

/** 滑杆高频输入：同帧内合并为一次 dispatch/apply（frame batching）。 */
let pendingCoeff = null;
let coeffFrame = null;
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

/** @returns {import('../shared/lab-bridge.js').LabSnapshot | null} */
export function getLabSnapshot() {
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

/**
 * @param {import('../shared/lab-bridge.js').LabAction} action
 */
export function applyLabAction(action) {
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

export function initGraphUI() {
  stageEl = document.getElementById('mathGraphStage');
  if (!stageEl || !document.getElementById('mathGraphBoard')) return;

  if (state.board) {
    resizeMathBoard(state.board, stageEl);
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
    axisSettingsHost: stageEl,
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
    host: stageEl,
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
    host: stageEl,
    storageKey: 'math-graph-board-notes-v1',
  });

  state.historyController?.dispose?.();
  state.historyController = createGraphHistoryController({
    eventTarget: window,
    root: stageEl,
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
    resizeMathBoard(state.board, stageEl);
    state.notes?.redraw?.();
    schedulePointLabelFusion();
  });
  state.ro.observe(stageEl);
  requestAnimationFrame(() => {
    resizeMathBoard(state.board, stageEl);
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

export function resizeGraph() {
  if (state.board && stageEl) resizeMathBoard(state.board, stageEl);
  state.notes?.redraw?.();
}

export function disposeGraph() {
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
    lastReferenceKey = null;
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
export function dismissFnAddModal() {
  hideAddPanel();
}

/** 退出笔记模式（保留笔迹） */
export function dismissGraphNotesMode() {
  dismissBoardNotesMode();
  state.notes?.setActive?.(false);
}
