/**
 * GraphFollowTargets：函数画布的跟随目标解析、吸附与可选中对象注册。
 *
 * 纯业务辅助：不拥有文档真值；通过注入访问 state 与求值器。
 */

import { getMathBoardChrome } from '../shared/math-theme.js';
import {
  curveFollowTargetId,
  defaultFollowTol,
  featureFollowTargetId,
  findClosestFollowTarget,
  findNearestFollowTarget,
  getFollowTargetById,
  makeFeaturePointTarget,
  makeFunctionCurveTarget,
} from '../shared/follow-target.js';

/**
 * @param {{
 *   getState: () => any,
 *   evalFnY: (fn: any, x: number) => number | null,
 *   fnDisplayLabel: (fn: any) => string,
 *   recomputeFunctionIntersection: (firstId: string, secondId: string, nearX: number) => any,
 *   getSelection: () => any,
 *   setSelection: (sel: any) => void,
 *   reregisterSelectable: () => void,
 *   schedulePointLabelFusion: () => void,
 * }} context
 */
export function createGraphFollowTargets(context) {
  const {
    getState,
    evalFnY,
    fnDisplayLabel,
    recomputeFunctionIntersection,
    createGraphCommitBridge,
  } = context;
  let pointsCtrlRef = null;
  let rawFactories = { createUserPointRaw: null, deleteUserPoint: null, deleteConstruction: null };
  const setRawFactories = (f) => {
    rawFactories = { ...rawFactories, ...f };
  };
  const commitBridge = createGraphCommitBridge({
    getStore: () => getState().graphStore,
    getPointsCtrl: () => pointsCtrlRef,
    getState,
    fallbackDeleteUserPoint: (el) => rawFactories.deleteUserPoint?.(el),
    fallbackDeleteConstruction: (cid) => rawFactories.deleteConstruction?.(makeDrawHost(), cid),
  });
  const { commitPointDocument, commitConstructionDocument, removeConstructionById, removeUserPointById } = commitBridge;
  const createUserPoint = (x, y, options = {}) => {
    const rec = rawFactories.createUserPointRaw?.(x, y, options);
    if (rec) commitPointDocument(rec);
    return rec;
  };
  const state = () => getState();

function followIdForFn(fnId) {
  return `graph:fn:${fnId}`;
}

function activeFn() {
  return state().functions.find((f) => f.id === state().activeFnId) || state().functions[0] || null;
}

/**
 * 同步「当前选中函数」到 legacy 字段，复用滑条/读数逻辑
 */
function mirrorActiveToLegacy() {
  const fn = activeFn();
  if (!fn) return;
  if (fn.kind === 'preset' && fn.preset) {
    state().preset = fn.preset;
    state().coeffs = { ...fn.coeffs };
  }
  state().curve = fn.curve;
  state().startCoeffs = { ...fn.coeffs };
}

/** @returns {ReturnType<typeof getMathBoardChrome>} */
function colors() {
  return getMathBoardChrome();
}

function clearExtras(board) {
  for (const m of state().marks) {
    try {
      board.removeObject(m);
    } catch {
      /* */
    }
  }
  for (const a of state().asy) {
    try {
      board.removeObject(a);
    } catch {
      /* */
    }
  }
  state().marks = [];
  state().asy = [];
}

/**
 * 当前画板可跟随对象列表（多条函数）
 * @returns {import('../shared/follow-target.js').FollowTarget[]}
 */
function listFollowTargets() {
  /** @type {import('../shared/follow-target.js').FollowTarget[]} */
  const out = [];
  for (const fn of state().functions) {
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
  return defaultFollowTol(state().board);
}

const recomputeIntersection = (firstId, secondId, nearX) =>
  recomputeFunctionIntersection(
    state().functions,
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
  state().styleBind?.selection?.clear?.();
  if (!state().styleBind || !state().board) return;
  const userEls = state().userPoints.map((r) => r.el).filter(Boolean);
  const markEls = state().marks.filter(Boolean);
  const curveEls = state().functions.map((f) => f.curve).filter(Boolean);
  const constrEls = state().constructions.flatMap((c) => c.els || []).filter(Boolean);
  // 特征点：可改样式/显示坐标，不可跟随
  for (const m of markEls) {
    m._mathCanFollow = false;
    m._mathUserPoint = false;
    if (m._mathShowCoords == null) m._mathShowCoords = true;
    if (!m._mathBaseName) m._mathBaseName = typeof m.name === 'string' ? m.name : '点';
  }
  const els = [...curveEls, ...state().asy, ...markEls, ...userEls, ...constrEls].filter(
    Boolean,
  );
  state().styleBind.selection.registerMany(els, (el) => ({
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
  for (const r of state().userPoints) pushEl(r.el);
  for (const m of state().marks) pushEl(m);
  for (const c of state().constructions) {
    if (!c?.els) continue;
    for (const el of c.els) {
      if (!el || el._mathExtendRay) continue;
      const t = el.elType;
      if (t === 'point' || t === 'glider' || t === 'perpendicularpoint') pushEl(el);
    }
  }
  return out;
}


function makeDrawHost() {
  return {
    getBoard: () => state().board,
    getUserPoints: () => state().userPoints,
    getFunctions: () => state().functions,
    getConstructions: () => state().constructions,
    setConstructions: (list) => {
      state().constructions = list;
    },
    findUserEl: (id) => state().userPoints.find((r) => r.id === id)?.el || null,
    findConstr: (id) => state().constructions.find((c) => c.id === id) || null,
    evalFnY,
    findFnByCurve: (curve) => state().functions.find((f) => f.curve === curve) || null,
    recomputeIntersection,
    createUserPoint,
    nextConstrId: () => state().idAllocator?.nextConstructionId() || `C${Math.floor(Math.random() * 1e6)}`,
    listSnapTargets: () => listSnapTargets(),
    onChanged: () => {
      reregisterSelectable();
      schedulePointLabelFusion();
      try {
        state().board?.update?.();
      } catch {
        /* */
      }
    },
  };
}

/**
 * @param {any} el
 */

  let setPointsCtrl = (ctrl) => {
    pointsCtrlRef = ctrl;
  };

  return {
    setPointsCtrl,
    setRawFactories,
    followIdForFn,
    activeFn,
    mirrorActiveToLegacy,
    colors,
    clearExtras,
    listFollowTargets,
    followTol,
    recomputeIntersection,
    hitFollowNear,
    resolveFollowTarget,
    reregisterSelectable,
    listSnapTargets,
    commitBridge,
    commitPointDocument,
    commitConstructionDocument,
    removeConstructionById,
    removeUserPointById,
    createUserPoint,
    makeDrawHost,
  };
}
