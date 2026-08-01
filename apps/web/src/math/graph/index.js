/**
 * 高中函数画布：参数滑条 + 多表征（特征 / 对应表）
 * + 作图工具条 / 长按罗盘 / 点跟随函数 / 显示坐标
 */

import { createMathBoard, freeMathBoard, resizeMathBoard } from '../shared/jsx-board.js';
import {
  colorForFnIndex,
  getMathBoardChrome,
  remintFunctionColors,
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
import { createPresetFunctionRecord } from './function-records.js';
import { createDefaultGraphDocument } from './graph-document.js';
import { createGraphStore } from './graph-store.js';
import { createGraphHistory } from './graph-history.js';
import { createGraphHistoryController } from './graph-history-controller.js';
import { createGraphRuntimeSyncAdapter } from './graph-renderer.js';
import {
  evaluateGraphFunction as evalFnY,
  findFunctionIntersectionNear,
  graphFunctionDisplayLabel as fnDisplayLabel,
  presetValueTable as valueTable,
  recomputeFunctionIntersection,
} from './function-analysis.js';
import {
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

/** @type {{ board: any, curve: any, marks: any[], asy: any[], coeffs: any, startCoeffs: any, preset: string, ro: ResizeObserver | null, styleBind: any, userPoints: UserPointRec[], constructions: any[], constrSeq: number, toolStrip: any, toolPointer: { dispose: () => void } | null, toolPick: any, compass: { dispose: () => void } | null, notes: { dispose: () => void, isActive: () => boolean, setActive: (on: boolean) => void, redraw: () => void } | null, pointSeq: number, fXMin: number, fXMax: number, axisSettingsApplying: boolean, functions: FnRec[], activeFnId: string | null, fnSeq: number, editMode: boolean, themeHandle: any, escBound: boolean, graphStore: any, graphHistory: any, historyController: any, coeffTxTimer: any }} */
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
  constrSeq: 1,
  toolStrip: null,
  toolPointer: null,
  toolPick: null,
  compass: null,
  notes: null,
  pointSeq: 1,
  fXMin: -10,
  fXMax: 10,
  axisSettingsApplying: false,
  /** 罗盘触发的一次性工具：完成一轮后回到选择 */
  toolOneShot: false,
  functions: [],
  activeFnId: null,
  fnSeq: 1,
  editMode: false,
  themeHandle: null,
  escBound: false,
  graphStore: null,
  graphHistory: null,
  historyController: null,
  coeffTxTimer: null,
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

const {
  create: createUserPoint,
  delete: deleteUserPoint,
  find: findUserRec,
  removeAll: removeUserPointEls,
  restore: restoreUserPoints,
  setFollow: setUserPointFollow,
  setFollowTarget: setUserPointFollowTarget,
  setShowCoords: setPointShowCoords,
  snapshot: snapshotUserPoints,
} = createUserPointController({
  getBoard: () => state.board,
  getRecords: () => state.userPoints,
  setRecords: (records) => {
    state.userPoints = records;
  },
  nextId: () => `U${state.pointSeq++}`,
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
});

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
    nextConstrId: () => `C${state.constrSeq++}`,
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

function clearToolPick() {
  state.toolPick = null;
  const tool = state.toolStrip?.getTool?.() || 'select';
  const def = getBoardToolDef(tool);
  state.toolStrip?.setHint?.(tool === 'select' ? '' : def?.hint || '');
}

/** 罗盘一次性工具：无进行中步骤时回到「选择」 */
function finishOneShotToolIfDone() {
  if (!state.toolOneShot) return;
  if (state.toolPick) return;
  state.toolOneShot = false;
  if ((state.toolStrip?.getTool?.() || 'select') !== 'select') {
    state.toolStrip?.setTool?.('select', { toggle: false, oneShot: true });
  }
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
async function handleToolTap(ctx) {
  if (!state.board || state.notes?.isActive?.()) return;
  const tool = state.toolStrip?.getTool?.() || 'select';
  if (tool === 'select') return;

  try {
    await handleToolTapBody(ctx, tool);
  } finally {
    finishOneShotToolIfDone();
  }
}

/**
 * @param {{ usrX: number, usrY: number, hit: any, event: PointerEvent }} ctx
 * @param {string} tool
 */
async function handleToolTapBody(ctx, tool) {
  const host = makeDrawHost();
  const { usrX, usrY, hit } = ctx;

  if (tool === 'point') {
    await addPointAt(usrX, usrY);
    return;
  }

  if (tool === 'delete') {
    // 优先删点，再删作图线
    const delHit =
      hit ||
      null;
    if (delHit?._mathUserPoint) {
      deleteUserPoint(delHit);
      clearToolPick();
      return;
    }
    if (delHit?._mathConstrId) {
      const cid = delHit._mathConstrId;
      const rec = state.constructions.find((c) => c.id === cid);
      if (rec?.kind === 'intersect' && rec.pointIds?.[0]) {
        const up = state.userPoints.find((p) => p.id === rec.pointIds[0]);
        if (up) deleteUserPoint(up.el);
      }
      deleteConstruction(host, cid);
      clearToolPick();
      return;
    }
    // 再扫一遍：靠近用户点
    for (const rec of state.userPoints) {
      try {
        const dx = Number(rec.el.X()) - usrX;
        const dy = Number(rec.el.Y()) - usrY;
        const unit = Math.abs(Number(state.board.unitX) || 40);
        if (Math.hypot(dx, dy) * unit < 16) {
          deleteUserPoint(rec.el);
          clearToolPick();
          return;
        }
      } catch {
        /* */
      }
    }
    state.toolStrip?.setHint?.('请点中要删除的点或线');
    return;
  }

  if (tool === 'segment' || tool === 'line') {
    const pick = state.toolPick;
    let rec = findUserRec(hit);
    if (!rec && isCurveEl(hit)) {
      rec = ensureUserPointFromHit(hit, usrX, usrY);
    }
    if (!rec) {
      const near = nearestFnAt(usrX, usrY);
      if (near) {
        rec = createUserPoint(usrX, near.y, {
          followTargetId: followIdForFn(near.fn.id),
          showCoords: true,
        });
      } else {
        rec = createUserPoint(usrX, usrY, { showCoords: true });
      }
      reregisterSelectable();
    }
    if (!rec) {
      state.toolStrip?.setHint?.('请点选或落一个点');
      return;
    }
    if (!pick || pick.tool !== tool) {
      state.toolPick = { tool, pointId: rec.id };
      state.toolStrip?.setHint?.(`已选 ${rec.baseName || rec.id}，再点第二个点`);
      return;
    }
    if (pick.pointId === rec.id) {
      state.toolStrip?.setHint?.('请选择不同的第二个点');
      return;
    }
    const p1 = host.findUserEl(pick.pointId);
    const p2 = rec.el;
    if (p1 && p2) {
      createSegmentOrLine(host, tool, p1, p2, [pick.pointId, rec.id]);
    }
    clearToolPick();
    return;
  }

  if (tool === 'tangent') {
    // 一键：点曲线附近 → 造贴线点 + 切线；靠近顶点则绑特征跟随
    let anchorEl = findUserRec(hit)?.el || null;
    let fn = null;
    if (anchorEl) {
      const resolved = resolveTangentAnchor(anchorEl, host);
      if (resolved) {
        fn = resolved.fn;
        anchorEl = resolved.pt;
      }
    }
    if (!fn) {
      fn = resolveCurveFromTap(hit, usrX, usrY);
    }
    if (!fn) {
      state.toolStrip?.setHint?.('请点在曲线附近');
      return;
    }
    const followTargetId = pickTangentFollowTargetId(fn, usrX, usrY, followTol());
    if (!anchorEl) {
      const y = evalFnY(fn, usrX);
      const up = createUserPoint(usrX, y == null ? usrY : y, {
        followTargetId,
        showCoords: true,
      });
      anchorEl = up?.el;
      reregisterSelectable();
    } else {
      const rec = findUserRec(anchorEl);
      if (rec && followTargetId && rec.followTargetId !== followTargetId) {
        const parsed = parseFeatureFollowTargetId(followTargetId);
        if (parsed) {
          void setUserPointFollowTarget(anchorEl, followTargetId);
        }
      }
    }
    const pid = userPointIdOf(anchorEl);
    if (!anchorEl || !pid) {
      state.toolStrip?.setHint?.('无法在此处创建切点');
      return;
    }
    createTangent(host, anchorEl, fn, pid);
    clearToolPick();
    return;
  }

  if (tool === 'perp-axis') {
    const pick = state.toolPick;
    if (!pick || pick.tool !== 'perp-axis') {
      let rec = findUserRec(hit);
      if (!rec) {
        const near = nearestFnAt(usrX, usrY);
        if (near) {
          rec = createUserPoint(usrX, near.y, {
            followTargetId: followIdForFn(near.fn.id),
            showCoords: true,
          });
        } else {
          rec = createUserPoint(usrX, usrY, { showCoords: true });
        }
        reregisterSelectable();
      }
      if (!rec) {
        state.toolStrip?.setHint?.('先点一个点');
        return;
      }
      state.toolPick = { tool: 'perp-axis', pointId: rec.id };
      state.toolStrip?.setHint?.('再点坐标轴 / 直线 / 曲线');
      return;
    }
    const pt = host.findUserEl(pick.pointId);
    if (!pt) {
      clearToolPick();
      return;
    }

    // 优先：已有直线/线段/切线 → 作垂足
    const lineHit = isLineLike(hit) ? hit : null;
    if (lineHit && hit._mathConstrId) {
      createPerpToLine(host, pt, lineHit, pick.pointId, hit._mathConstrId);
      clearToolPick();
      return;
    }

    // 靠近坐标轴（优先于曲线，避免轴附近曲线抢命中）
    const distToX = Math.abs(usrY);
    const distToY = Math.abs(usrX);
    const axisTol = Math.max(0.35, followTol() * 1.2);
    if (Math.min(distToX, distToY) <= axisTol) {
      const axis = distToX <= distToY ? 'x' : 'y';
      createPerpToAxis(host, pt, axis, pick.pointId);
      clearToolPick();
      return;
    }

    // 曲线：从点向曲线作垂线（垂足）；若点已在曲线上则作法线
    const fnHit = resolveCurveFromTap(hit, usrX, usrY);
    if (fnHit) {
      createPerpToFn(host, pt, fnHit, pick.pointId);
      clearToolPick();
      return;
    }

    // 默认：离哪条轴更近垂向哪条
    const axis = distToX <= distToY ? 'x' : 'y';
    createPerpToAxis(host, pt, axis, pick.pointId);
    clearToolPick();
    return;
  }

  if (tool === 'intersect') {
    await handleIntersectTap(host, ctx);
  }
}

/**
 * @param {ReturnType<typeof makeDrawHost>} host
 * @param {{ usrX: number, usrY: number, hit: any, event: PointerEvent }} ctx
 */
async function handleIntersectTap(host, ctx) {
  const { usrX, usrY, hit } = ctx;
  const pick = state.toolPick;
  const fnHit = resolveCurveFromTap(hit, usrX, usrY);
  const lineHit = isLineLike(hit) ? hit : null;

  if (!pick || pick.tool !== 'intersect') {
    if (fnHit) {
      state.toolPick = { tool: 'intersect', kind: 'curve', fnId: fnHit.id };
      state.toolStrip?.setHint?.(
        `已选「${fnDisplayLabel(fnHit)}」，再点另一条曲线`,
      );
      return;
    }
    if (lineHit && hit._mathConstrId) {
      state.toolPick = {
        tool: 'intersect',
        kind: 'line',
        constrId: hit._mathConstrId,
        el: hit,
      };
      state.toolStrip?.setHint?.('已选直线，再选另一条直线');
      return;
    }
    state.toolStrip?.setHint?.('请点在曲线附近');
    return;
  }

  if (pick.kind === 'curve') {
    if (!fnHit) {
      state.toolStrip?.setHint?.('请再点另一条曲线');
      return;
    }
    if (fnHit.id === pick.fnId) {
      state.toolStrip?.setHint?.('请选择另一条不同的曲线');
      return;
    }
    const made = createFnIntersection(host, pick.fnId, fnHit.id);
    if (!made) {
      void appAlert('这两条曲线在定义域附近暂无交点', { title: '交点' });
    }
    clearToolPick();
    reregisterSelectable();
    return;
  }

  if (pick.kind === 'line' && lineHit && hit._mathConstrId) {
    if (hit._mathConstrId === pick.constrId) {
      state.toolStrip?.setHint?.('请选择另一条直线');
      return;
    }
    createLineIntersection(host, pick.el, hit, [
      pick.constrId,
      hit._mathConstrId,
    ]);
    clearToolPick();
    return;
  }
  state.toolStrip?.setHint?.('请继续点选第二条对象');
}

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

/**
 * 从画板卸掉某条函数曲线（删除前必须先调，避免 filter 后变成幽灵曲线）
 * @param {FnRec | null | undefined} fn
 */
function detachFnCurve(fn) {
  if (!fn) return;
  if (fn.curve) {
    detachBoardObject(state.board, fn.curve);
    fn.curve = null;
  }
}

function removeAllFnCurves(_board) {
  const list = state.functions.slice();
  for (const fn of list) {
    detachFnCurve(fn);
  }
}

function remintFnColorsForTheme() {
  remintFunctionColors(state.functions);
}

function rebuildCurve() {
  curveRebuildTask.cancel();
  const board = state.board;
  if (!board) return;
  // 生命周期：重建包 withPreservedViewport，避免镜头被图例/fullUpdate 打回
  withPreservedViewport(board, () => {
    remintFnColorsForTheme();
    const c = colors();
    const savedUsers = snapshotUserPoints();
    const savedConstr = snapshotConstructions(makeDrawHost());
    clearAllConstructions(makeDrawHost());
    removeUserPointEls();
    clearExtras(board);
    removeAllFnCurves(board);
    state.curve = null;

  const x0 = Number.isFinite(state.fXMin) ? state.fXMin : -10;
  const x1 = Number.isFinite(state.fXMax) ? state.fXMax : 10;
  const xLo = Math.min(x0, x1);
  const xHi = Math.max(x0, x1);

  for (const fn of state.functions) {
    if (!fn.visible) continue;
    const stroke = fn.color || c.stamp;
    const curve = board.create(
      'functiongraph',
      [
        (x) => {
          const y = evalFnY(fn, x);
          return y == null ? NaN : y;
        },
        xLo,
        xHi,
      ],
      {
        strokeColor: stroke,
        strokeWidth: fn.id === state.activeFnId ? 3.2 : 2.4,
        name: fn.id,
      },
    );
    fn.curve = curve;
    curve._mathFnId = fn.id;
  }

  mirrorActiveToLegacy();
  const act = activeFn();
  if (act?.kind === 'preset' && act.preset) {
    const preset = /** @type {any} */ (act.preset);
    const coeffs = act.coeffs;
    for (const asy of asymptotes(preset, coeffs)) {
      if (asy.type === 'vertical') {
        state.asy.push(
          board.create(
            'line',
            [
              [asy.value, -20],
              [asy.value, 20],
            ],
            {
              straightFirst: true,
              straightLast: true,
              strokeColor: c.diagram,
              dash: 2,
              strokeWidth: 1.5,
              name: asy.label || '渐近线',
            },
          ),
        );
      } else {
        state.asy.push(
          board.create(
            'line',
            [
              [-20, asy.value],
              [20, asy.value],
            ],
            {
              straightFirst: true,
              straightLast: true,
              strokeColor: c.diagram,
              dash: 2,
              strokeWidth: 1.5,
              name: asy.label || '渐近线',
            },
          ),
        );
      }
    }
    // 特征点去重：顶点落在原点/零点时合并标签，避免「顶点」「零点」叠字
    /** @type {Array<{ x: number, y: number, kinds: string[] }>} */
    const markSlots = [];
    const MERGE_EPS = 1e-6;
    for (const feat of keyFeatures(preset, coeffs)) {
      if (feat.x == null || feat.y == null) continue;
      if (!Number.isFinite(feat.x) || !Number.isFinite(feat.y)) continue;
      const kind = String(feat.kind || '点');
      const hit = markSlots.find(
        (s) => Math.hypot(s.x - feat.x, s.y - feat.y) <= MERGE_EPS,
      );
      if (hit) {
        if (!hit.kinds.includes(kind)) hit.kinds.push(kind);
      } else {
        markSlots.push({ x: feat.x, y: feat.y, kinds: [kind] });
      }
    }
    for (const slot of markSlots) {
      const atOrigin = Math.hypot(slot.x, slot.y) <= MERGE_EPS;
      let name = slot.kinds.join('·');
      // 落在原点：合并语义，只保留一个标签（避免「顶点」「零点」叠在一起）
      if (atOrigin) {
        const hasV = slot.kinds.includes('顶点');
        const hasZ = slot.kinds.includes('零点');
        if (hasV && hasZ) name = '顶点·零点（原点）';
        else if (hasV) name = '顶点（原点）';
        else if (hasZ) name = '零点（原点）';
        else if (slot.kinds.includes('截距')) name = `${slot.kinds.join('·')}（原点）`;
      }
      // 原点附近标签略偏右上，减轻压轴
      const labelOffset = atOrigin ? [14, 16] : [14, 14];
      const pt = board.create('point', [slot.x, slot.y], {
        name,
        size: 4,
        fillColor: c.diagram,
        strokeColor: c.pointRing,
        fixed: true,
        withLabel: true,
        label: boardLabelAttrs({
          offset: labelOffset,
          strokeColor: c.ink,
          color: c.ink,
        }),
      });
      pt._mathBaseName = name;
      pt._mathShowCoords = true;
      pt._mathCanFollow = false;
      pt._mathFeatureMark = true;
      applyBoardLabel(pt, {
        baseName: name,
        text: () => formatElementCoordsLabel(pt, name),
        offset: labelOffset,
      });
      bindLiveLabel(pt, () => formatElementCoordsLabel(pt, name));
      state.marks.push(pt);
    }
  }

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

function paintReadouts() {
  const fn = activeFn();
  const featuresEl = document.getElementById('mathGraphFeatures');
  const tableEl = document.getElementById('mathGraphValueTable');

  if (!fn) {
    if (featuresEl) featuresEl.innerHTML = '';
    if (tableEl) tableEl.innerHTML = '';
    return;
  }

  if (fn.kind === 'custom') {
    if (featuresEl) {
      featuresEl.innerHTML =
        '<div class="math-float-feat-row"><strong>类型</strong><span>自定义</span></div>';
    }
    if (tableEl) {
      const xs = [-2, -1, 0, 1, 2, 3];
      const rows = xs.map((x) => {
        const y = evalFnY(fn, x);
        return { x, y: y == null || !Number.isFinite(y) ? null : y };
      });
      tableEl.innerHTML = `
      <table class="math-value-table math-value-table-lg">
        <thead><tr><th>x</th><th>f(x)</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr><td>${r.x}</td><td>${r.y == null ? '—' : Number(r.y.toFixed(3))}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>`;
    }
    return;
  }

  const preset = /** @type {any} */ (fn.preset || state.preset);
  const coeffs = fn.coeffs || state.coeffs;
  if (featuresEl) {
    featuresEl.innerHTML = keyFeatures(preset, coeffs)
      .map(
        (f) =>
          `<div class="math-float-feat-row"><strong>${f.kind}</strong><span>${f.text}</span></div>`,
      )
      .join('');
  }
  if (tableEl) {
    const rows = valueTable(preset, coeffs);
    tableEl.innerHTML = `
      <table class="math-value-table math-value-table-lg">
        <thead><tr><th>x</th><th>f(x)</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr><td>${r.x}</td><td>${r.y == null ? '—' : Number(r.y.toFixed(3))}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>`;
  }
}

function bindReadoutCards() {
  ensureMathFloatCardsBound();
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
});

/** 由 store 文档快照构建初始文档（剔除曲线等 runtime 字段）。 */
function buildInitialDocument() {
  const doc = createDefaultGraphDocument({
    now: () => new Date().toISOString(),
    functionId: state.functions[0]?.id || 'f1',
  });
  doc.functions = state.functions.map((fn) => {
    const { curve, ...rest } = fn;
    return rest;
  });
  doc.presentation.activeFunctionId = state.activeFnId || state.functions[0]?.id || null;
  return doc;
}

/** beforeCommit 适配器：把 candidate 文档投影到既有 runtime（Task 6/7 换增量 layer）。 */
const syncRuntimeFromDocument = createGraphRuntimeSyncAdapter({
  getState: () => state,
  detachFnCurve,
  mirrorActiveToLegacy,
  rebuildCurve,
  scheduleCurveRebuild: () => curveRebuildTask.schedule(),
  renderFnList,
  syncParamPanel,
  paintReadouts,
});

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

function setCoeffs(next) {
  const fn = activeFn();
  if (!fn || fn.kind !== 'preset') return;
  if (!state.graphStore) {
    fn.coeffs = { ...fn.coeffs, ...next };
    state.coeffs = { ...(fn.coeffs || state.coeffs), ...next };
    syncSliders();
    rebuildCurve();
    return;
  }
  openCoeffTransaction();
  state.graphStore.dispatch({
    type: 'function/update',
    payload: { id: fn.id, patch: { coeffs: { ...fn.coeffs, ...next } } },
  });
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
    bindReadoutCards();
    bindFnListUi();
    renderFnList();
    syncParamPanel();
    paintReadouts();
    return;
  }

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
          color: f.color,
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

  // 默认一条二次
  if (!state.functions.length) {
    const id = `f${state.fnSeq++}`;
    state.functions.push(
      createPresetFunctionRecord({
        id,
        preset: 'quadratic',
        color: colorForFnIndex(0),
      }),
    );
    state.activeFnId = id;
  }
  mirrorActiveToLegacy();
  state.startCoeffs = { ...state.coeffs };

  // 文档底座：函数集合作为首个接入 store 的行为（历史/事务链路）
  state.graphStore?.dispose?.();
  state.graphStore = createGraphStore(buildInitialDocument(), {
    beforeCommit: syncRuntimeFromDocument,
  });
  state.graphHistory?.dispose?.();
  state.graphHistory = createGraphHistory(state.graphStore);

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
      listFollowTargets().length > 0,
    getFollow: (el) => {
      const rec = findUserRec(el);
      if (rec) return Boolean(rec.followTargetId);
      return Boolean(el?._mathFollowTargetId || el?._mathFollow);
    },
    setFollow: (el, on) => setUserPointFollow(el, on),
    getShowCoords: (el) => {
      const rec = findUserRec(el);
      if (rec) return rec.showCoords;
      return Boolean(el?._mathShowCoords);
    },
    setShowCoords: (el, on) => setPointShowCoords(el, on),
    canDelete: (el) => {
      if (Boolean(el?._mathUserPoint) && Boolean(findUserRec(el))) return true;
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
        const host = makeDrawHost();
        const cid = el._mathConstrId;
        const rec = state.constructions.find((c) => c.id === cid);
        if (rec?.kind === 'intersect' && rec.pointIds?.[0]) {
          const up = state.userPoints.find((p) => p.id === rec.pointIds[0]);
          if (up) deleteUserPoint(up.el);
        }
        deleteConstruction(host, cid);
        return;
      }
      const fn =
        (el?._mathFnId && state.functions.find((f) => f.id === el._mathFnId)) ||
        state.functions.find((f) => f.curve === el);
      if (fn) {
        deleteFn(fn.id);
        return;
      }
      deleteUserPoint(el);
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
      setConstructionExtend(makeDrawHost(), el, on);
      try {
        state.board?.update?.();
      } catch {
        /* */
      }
    },
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
    onChange: (_id, setOpts = {}) => {
      clearToolPick();
      if (!setOpts.oneShot) state.toolOneShot = false;
    },
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

  syncSliders();
  rebuildCurve();
  bindReadoutCards();
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
  if (state.coeffTxTimer != null) {
    clearTimeout(state.coeffTxTimer);
    state.coeffTxTimer = null;
    state.graphStore?.cancelTransaction();
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
  state.toolPick = null;
  state.compass?.dispose?.();
  state.compass = null;
  setPointOptionHooks(null);
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
