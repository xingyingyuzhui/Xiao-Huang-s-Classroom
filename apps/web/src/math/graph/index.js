/**
 * 高中函数画布：参数滑条 + 多表征（解析式 / 特征 / 对应表）
 * + 长按罗盘加点 / 点跟随函数 / 显示坐标
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
import { renderTex } from '../shared/tex.js';
import {
  GRAPH_PRESETS,
  evalPreset,
  formulaText,
  defaultCoeffsFor,
  keyFeatures,
  asymptotes,
} from './model.js';
import { ensureMathFloatCardsBound } from '../shared/float-cards.js';
import { bindRangeNumber, syncRangeNumber } from '../shared/param-controls.js';
import { createBoardSelectionController } from '../shared/object-select.js';
import {
  bindObjectStyleForPanel,
  setPointOptionHooks,
} from '../shared/object-style-panel.js';
import { applyObjectStyle, readObjectStyle } from '../shared/object-style.js';
import { attachBoardCompass } from '../shared/board-compass.js';
import { attachBoardNotes, dismissBoardNotesMode } from '../shared/board-notes.js';
import {
  defaultFollowTol,
  findClosestFollowTarget,
  findNearestFollowTarget,
  getFollowTargetById,
  makeFunctionCurveTarget,
} from '../shared/follow-target.js';
import { compileMathExpr, formatExprLabel } from '../shared/expr-safe.js';
import { appConfirm, appAlert } from '../../shared/ui/app-dialog.js';
import { mountMathNumKeypads } from '../shared/num-keypad.js';
import { aiApi } from '../../shared/api/client.js';

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
 *   kind: 'preset' | 'custom',
 *   preset: string | null,
 *   coeffs: { a: number, b: number, c: number },
 *   expr: string,
 *   color: string,
 *   visible: boolean,
 *   curve: any,
 *   evalFn: ((x: number) => number | null) | null,
 * }} FnRec
 */

/** @type {{ board: any, curve: any, marks: any[], asy: any[], coeffs: any, startCoeffs: any, preset: string, ro: ResizeObserver | null, styleBind: any, userPoints: UserPointRec[], compass: { dispose: () => void } | null, notes: { dispose: () => void, isActive: () => boolean, setActive: (on: boolean) => void, redraw: () => void } | null, pointSeq: number, fXMin: number, fXMax: number, axisSettingsApplying: boolean, functions: FnRec[], activeFnId: string | null, fnSeq: number, editMode: boolean }} */
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
  compass: null,
  notes: null,
  pointSeq: 1,
  fXMin: -10,
  fXMax: 10,
  axisSettingsApplying: false,
  functions: [],
  activeFnId: null,
  fnSeq: 1,
  editMode: false,
};

let stageEl = null;

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

/**
 * @param {string} preset
 * @param {{ a: number, b: number, c: number }} coeffs
 * @param {number[]} [xs]
 */
function valueTable(preset, coeffs, xs = [-2, -1, 0, 1, 2, 3]) {
  return xs.map((x) => {
    const y = evalPreset(/** @type {any} */ (preset), coeffs, x);
    return {
      x,
      y: y == null || !Number.isFinite(y) ? null : y,
    };
  });
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
 * 生成点标签文案（JSXGraph 的 name 不支持函数，必须是字符串）
 * @param {any} el
 * @param {string} [baseName]
 */
function formatPointLabel(el, baseName) {
  const b = el?._mathBaseName || baseName || 'P';
  if (!el?._mathShowCoords) return b;
  try {
    const x = Number(el.X());
    const y = Number(el.Y());
    if (!Number.isFinite(x) || !Number.isFinite(y)) return b;
    return `${b}(${x.toFixed(2)}, ${y.toFixed(2)})`;
  } catch {
    return b;
  }
}

/**
 * 把字符串写回点的 name / label
 * @param {any} el
 */
function refreshPointLabelText(el) {
  if (!el) return;
  const text = formatPointLabel(el);
  try {
    if (typeof el.setName === 'function') el.setName(text);
    else el.setAttribute?.({ name: text });
  } catch {
    try {
      el.name = text;
    } catch {
      /* */
    }
  }
  try {
    el.label?.setText?.(text);
  } catch {
    /* */
  }
}

/**
 * @param {any} el
 * @param {string} baseName
 * @param {boolean} showCoords
 */
function applyPointLabel(el, baseName, showCoords) {
  if (!el) return;
  el._mathBaseName = baseName;
  el._mathShowCoords = showCoords;
  try {
    el.setAttribute({
      withLabel: true,
      name: formatPointLabel(el, baseName),
      label: { fontSize: 12, offset: [10, 12], parse: false },
    });
  } catch {
    /* */
  }
  refreshPointLabelText(el);

  // 拖动时刷新坐标文字（只绑一次）
  if (!el._mathLabelLiveBound && typeof el.on === 'function') {
    el._mathLabelLiveBound = true;
    const tick = () => {
      if (el._mathShowCoords) refreshPointLabelText(el);
    };
    el.on('drag', tick);
    el.on('up', tick);
  }
}

/**
 * @param {FnRec} fn
 */
function evalFnY(fn, x) {
  if (!fn || !fn.visible) return null;
  if (fn.kind === 'custom' && fn.evalFn) return fn.evalFn(x);
  if (fn.kind === 'preset' && fn.preset) {
    return evalPreset(/** @type {any} */ (fn.preset), fn.coeffs, x);
  }
  return null;
}

/**
 * @param {FnRec} fn
 */
function fnDisplayLabel(fn) {
  if (!fn) return '函数';
  if (fn.kind === 'custom') return formatExprLabel(fn.expr);
  return formulaText(/** @type {any} */ (fn.preset), fn.coeffs) || fn.preset || '函数';
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
  }
  // 兼容旧跟随 id
  if (out.length && !out.some((t) => t.id === MAIN_CURVE_FOLLOW_ID)) {
    const first = out[0];
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

/**
 * @returns {Array<{ id: string, followTargetId: string | null, intersectFnIds: [string, string] | null, showCoords: boolean, baseName: string, x: number, y: number, style: any }>}
 */
function snapshotUserPoints() {
  return state.userPoints.map((rec) => {
    let x = 0;
    let y = 0;
    try {
      x = Number(rec.el.X());
      y = Number(rec.el.Y());
    } catch {
      /* */
    }
    return {
      id: rec.id,
      followTargetId: rec.followTargetId || null,
      intersectFnIds: rec.intersectFnIds ? [...rec.intersectFnIds] : null,
      showCoords: rec.showCoords,
      baseName: rec.baseName,
      x,
      y,
      style: readObjectStyle(rec.el, rec.baseName),
    };
  });
}

function removeUserPointEls() {
  const board = state.board;
  if (!board) return;
  for (const rec of state.userPoints) {
    try {
      board.removeObject(rec.el);
    } catch {
      /* */
    }
  }
  state.userPoints = [];
}

/**
 * 求两函数差 fA(x)-fB(x)
 * @param {FnRec} fnA
 * @param {FnRec} fnB
 * @param {number} x
 */
function evalDiff(fnA, fnB, x) {
  const ya = evalFnY(fnA, x);
  const yb = evalFnY(fnB, x);
  if (ya == null || yb == null) return null;
  return ya - yb;
}

/**
 * 二分求根
 * @param {FnRec} fnA
 * @param {FnRec} fnB
 * @param {number} lo
 * @param {number} hi
 */
function bisectRoot(fnA, fnB, lo, hi) {
  let a = lo;
  let b = hi;
  let fa = evalDiff(fnA, fnB, a);
  let fb = evalDiff(fnA, fnB, b);
  if (fa == null || fb == null) return null;
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return null;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    const fm = evalDiff(fnA, fnB, m);
    if (fm == null) return null;
    if (Math.abs(fm) < 1e-10 || Math.abs(b - a) < 1e-10) return m;
    if (fa * fm <= 0) {
      b = m;
      fb = fm;
    } else {
      a = m;
      fa = fm;
    }
  }
  return (a + b) / 2;
}

/**
 * 在 x0 附近窗口内找 fi、fj 的交点（最近根）
 * @param {FnRec} fnA
 * @param {FnRec} fnB
 * @param {number} x0
 * @param {number} win
 * @returns {number | null}
 */
function findRootNear(fnA, fnB, x0, win) {
  const samples = 48;
  const lo = x0 - win;
  const hi = x0 + win;
  const step = (hi - lo) / samples;
  /** @type {number | null} */
  let best = null;
  let bestAbs = Infinity;
  let prevX = lo;
  let prevD = evalDiff(fnA, fnB, lo);
  for (let k = 1; k <= samples; k++) {
    const x = lo + k * step;
    const d = evalDiff(fnA, fnB, x);
    if (prevD != null && d != null && prevD * d <= 0) {
      const r = bisectRoot(fnA, fnB, prevX, x);
      if (r != null && Number.isFinite(r)) {
        const ad = Math.abs(r - x0);
        if (ad < bestAbs) {
          bestAbs = ad;
          best = r;
        }
      }
    }
    prevX = x;
    prevD = d;
  }
  return best;
}

/**
 * 点击位置附近是否存在两函数交点
 * @param {number} px
 * @param {number} py
 * @returns {{ fnA: FnRec, fnB: FnRec, x: number, y: number } | null}
 */
function findIntersectionNear(px, py) {
  const visible = state.functions.filter((f) => f.visible);
  if (visible.length < 2 || !Number.isFinite(px) || !Number.isFinite(py)) return null;
  const tol = followTol();
  const xWin = Math.max(1.2, tol * 6);
  const hitTol = Math.max(tol * 2.8, 0.55);

  /** @type {{ fnA: FnRec, fnB: FnRec, x: number, y: number } | null} */
  let best = null;
  let bestD = Infinity;

  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const fnA = visible[i];
      const fnB = visible[j];
      const rx = findRootNear(fnA, fnB, px, xWin);
      if (rx == null) continue;
      const ya = evalFnY(fnA, rx);
      const yb = evalFnY(fnB, rx);
      if (ya == null || yb == null) continue;
      if (Math.abs(ya - yb) > 1e-3) continue;
      const y = (ya + yb) / 2;
      const d = Math.hypot(rx - px, y - py);
      if (d < bestD) {
        bestD = d;
        best = { fnA, fnB, x: rx, y };
      }
    }
  }
  if (!best || bestD > hitTol) return null;
  return best;
}

/**
 * 根据两函数 id 在附近重算交点
 * @param {string} idA
 * @param {string} idB
 * @param {number} nearX
 * @param {number} nearY
 */
function recomputeIntersection(idA, idB, nearX, nearY) {
  const fnA = state.functions.find((f) => f.id === idA);
  const fnB = state.functions.find((f) => f.id === idB);
  if (!fnA?.visible || !fnB?.visible) return null;
  const tol = followTol();
  const xWin = Math.max(2.5, tol * 10);
  const rx = findRootNear(fnA, fnB, nearX, xWin);
  if (rx == null) return null;
  const ya = evalFnY(fnA, rx);
  const yb = evalFnY(fnB, rx);
  if (ya == null || yb == null) return null;
  if (Math.abs(ya - yb) > 0.05) return null;
  return { x: rx, y: (ya + yb) / 2 };
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{
 *   followTargetId?: string | null,
 *   follow?: boolean,
 *   intersectFnIds?: [string, string] | null,
 *   showCoords?: boolean,
 *   id?: string,
 *   baseName?: string,
 *   style?: any,
 * }} [opts] follow 已弃用，请用 followTargetId；true 时解析为主曲线
 */
function createUserPoint(x, y, opts = {}) {
  const board = state.board;
  if (!board) return null;
  const c = colors();
  const id = opts.id || `U${state.pointSeq++}`;
  const baseName = opts.baseName || id;
  const showCoords = opts.showCoords !== false;

  /** @type {[string, string] | null} */
  let intersectFnIds =
    opts.intersectFnIds && opts.intersectFnIds.length === 2
      ? [opts.intersectFnIds[0], opts.intersectFnIds[1]]
      : null;

  if (intersectFnIds) {
    const hit = recomputeIntersection(intersectFnIds[0], intersectFnIds[1], x, y);
    if (hit) {
      x = hit.x;
      y = hit.y;
    } else {
      // 两曲线暂无交点：仍落在原位置，但保留交点语义
    }
  }

  /** @type {string | null} */
  let followTargetId = null;
  if (!intersectFnIds) {
    followTargetId =
      opts.followTargetId != null
        ? opts.followTargetId
        : opts.follow
          ? MAIN_CURVE_FOLLOW_ID
          : null;
  }

  /** @type {import('../shared/follow-target.js').FollowTarget | null} */
  let target = null;
  if (followTargetId) {
    target = resolveFollowTarget(x, y, followTargetId, { requireNear: false });
    if (!target) {
      followTargetId = null;
    } else {
      followTargetId = target.id;
      const sn = target.snap(x, y);
      if (sn) {
        x = sn.x;
        y = sn.y;
      }
    }
  }

  /** @type {any} */
  let el;
  if (followTargetId && target?.el) {
    el = board.create('glider', [x, y, target.el], {
      name: baseName,
      size: 5,
      fillColor: c.stamp,
      strokeColor: c.pointRing,
      withLabel: true,
      label: { fontSize: 12, offset: [10, 12], strokeColor: c.ink, color: c.ink },
    });
  } else {
    el = board.create('point', [x, y], {
      name: baseName,
      size: 5,
      fillColor: c.stamp,
      strokeColor: c.pointRing,
      withLabel: true,
      fixed: Boolean(intersectFnIds),
      label: { fontSize: 12, offset: [10, 12], strokeColor: c.ink, color: c.ink },
    });
  }

  el._mathUserPoint = true;
  el._mathCanFollow = !intersectFnIds;
  el._mathFollow = Boolean(followTargetId);
  el._mathFollowTargetId = followTargetId;
  el._mathIntersectFnIds = intersectFnIds;
  el._mathPointId = id;
  applyPointLabel(el, baseName, showCoords);

  if (opts.style) {
    applyObjectStyle(el, {
      strokeColor: opts.style.strokeColor,
      strokeWidth: opts.style.strokeWidth,
      fillColor: opts.style.fillColor,
      fillOpacity: opts.style.fillOpacity,
      size: opts.style.size,
      fontSize: opts.style.fontSize,
    });
  }

  /** @type {UserPointRec} */
  const rec = {
    id,
    el,
    followTargetId,
    intersectFnIds,
    showCoords,
    baseName,
  };
  state.userPoints.push(rec);
  return rec;
}

/**
 * @param {Array<{ id: string, followTargetId?: string | null, follow?: boolean, intersectFnIds?: [string, string] | null, showCoords: boolean, baseName: string, x: number, y: number, style: any }>} saved
 */
function restoreUserPoints(saved) {
  for (const s of saved) {
    const intersectFnIds =
      s.intersectFnIds && s.intersectFnIds.length === 2
        ? /** @type {[string, string]} */ ([s.intersectFnIds[0], s.intersectFnIds[1]])
        : null;
    const followTargetId = intersectFnIds
      ? null
      : s.followTargetId != null
        ? s.followTargetId
        : s.follow
          ? MAIN_CURVE_FOLLOW_ID
          : null;
    createUserPoint(s.x, s.y, {
      id: s.id,
      followTargetId,
      intersectFnIds,
      showCoords: s.showCoords,
      baseName: s.baseName,
      style: s.style,
    });
  }
}

function reregisterSelectable() {
  state.styleBind?.selection?.clear?.();
  if (!state.styleBind || !state.board) return;
  const userEls = state.userPoints.map((r) => r.el).filter(Boolean);
  const markEls = state.marks.filter(Boolean);
  const curveEls = state.functions.map((f) => f.curve).filter(Boolean);
  // 特征点：可改样式/显示坐标，不可跟随
  for (const m of markEls) {
    m._mathCanFollow = false;
    m._mathUserPoint = false;
    if (m._mathShowCoords == null) m._mathShowCoords = false;
    if (!m._mathBaseName) m._mathBaseName = typeof m.name === 'string' ? m.name : '点';
  }
  const els = [...curveEls, ...state.asy, ...markEls, ...userEls].filter(Boolean);
  state.styleBind.selection.registerMany(els, (el) => ({
    label: el._mathBaseName || (typeof el.name === 'string' ? el.name : undefined),
  }));
}

/**
 * @param {any} el
 */
function findUserRec(el) {
  return state.userPoints.find((r) => r.el === el) || null;
}

/**
 * @param {any} el
 * @param {boolean} follow
 */
async function setUserPointFollow(el, follow) {
  const rec = findUserRec(el);
  if (!rec || !state.board) return;

  const x = Number(el.X());
  const y = Number(el.Y());
  /** @type {string | null} */
  let followTargetId = null;
  if (follow) {
    // 勾选跟随：优先原目标，否则绑最近（不限容差，保证总能跟到某条）
    const t = resolveFollowTarget(x, y, rec.followTargetId, { requireNear: false });
    if (!t) return;
    followTargetId = t.id;
  }
  if ((rec.followTargetId || null) === followTargetId) return;

  const style = readObjectStyle(el, rec.baseName);
  const { id, baseName, showCoords } = rec;

  try {
    state.board.removeObject(el);
  } catch {
    /* */
  }
  state.userPoints = state.userPoints.filter((r) => r.id !== id);

  const next = createUserPoint(x, y, {
    id,
    baseName,
    showCoords,
    followTargetId,
    style,
  });
  reregisterSelectable();
  if (next) {
    state.styleBind?.selection?.select?.(next.el, {
      label: baseName,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
    });
  }
  state.board.update();
}

/**
 * @param {any} el
 * @param {boolean} on
 */
function setPointShowCoords(el, on) {
  const rec = findUserRec(el);
  if (rec) {
    rec.showCoords = on;
    applyPointLabel(rec.el, rec.baseName, on);
  } else {
    // 特征点等
    const base = el._mathBaseName || (typeof el.name === 'string' ? el.name : '点');
    applyPointLabel(el, base, on);
  }
  try {
    el.board?.update?.();
  } catch {
    /* */
  }
}

/**
 * 删除用户自建点（无确认）
 * @param {any} el
 */
function deleteUserPoint(el) {
  const rec = findUserRec(el);
  if (!rec || !state.board) return;
  try {
    state.styleBind?.selection?.clear?.();
  } catch {
    /* */
  }
  try {
    state.board.removeObject(rec.el);
  } catch {
    /* */
  }
  state.userPoints = state.userPoints.filter((r) => r.id !== rec.id);
  reregisterSelectable();
  try {
    state.board.update();
  } catch {
    /* */
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
  const ix = findIntersectionNear(x, y);
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
  const board = state.board;
  if (!board) return;
  // 生命周期：重建包 withPreservedViewport，避免镜头被图例/fullUpdate 打回
  withPreservedViewport(board, () => {
    remintFnColorsForTheme();
    const c = colors();
    const savedUsers = snapshotUserPoints();
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
      const labelOffset = atOrigin ? [14, 16] : [10, 10];
      const pt = board.create('point', [slot.x, slot.y], {
        name,
        size: 4,
        fillColor: c.diagram,
        strokeColor: c.pointRing,
        fixed: true,
        withLabel: true,
        label: {
          fontSize: 12,
          offset: labelOffset,
          parse: false,
          strokeColor: c.ink,
          color: c.ink,
        },
      });
      pt._mathBaseName = name;
      pt._mathShowCoords = false;
      pt._mathCanFollow = false;
      state.marks.push(pt);
    }
  }

    restoreUserPoints(savedUsers);
    reregisterSelectable();
    renderFnList();
    syncParamPanel();
    paintReadouts();
    try {
      board.update();
    } catch {
      /* */
    }
    try {
      // refresh 契约：skipViewport，不重置镜头
      board._mathAxisLegend?.refresh?.();
    } catch {
      /* */
    }
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

function renderFnList() {
  const host = document.getElementById('mathFnList');
  if (!host) return;
  host.classList.toggle('is-edit-mode', state.editMode);
  if (!state.functions.length) {
    host.innerHTML = `<p class="math-fn-empty">点 ＋ 添加函数到画布</p>`;
    return;
  }
  host.innerHTML = state.functions
    .map((fn) => {
      const on = fn.id === state.activeFnId;
      // 主标题：函数式；副标题：类型（二次 / 自定义…）
      const formula = escapeHtml(fnDisplayLabel(fn));
      const typeLabel =
        fn.kind === 'custom'
          ? '自定义'
          : escapeHtml(GRAPH_PRESETS.find((p) => p.id === fn.preset)?.label || '函数');
      // 对标化学分子卡：删除 × 绝对定位左上角，主按钮单独一层
      return `
      <div class="math-fn-card${on ? ' is-active' : ''}${state.editMode ? ' is-editing' : ''}" data-fn-id="${escapeHtml(fn.id)}" style="--fn-color:${escapeHtml(fn.color)}">
        <button type="button" class="math-fn-card-del" data-fn-del="${escapeHtml(fn.id)}" title="删除" aria-label="删除">×</button>
        <button type="button" class="math-fn-card-main" data-fn-id="${escapeHtml(fn.id)}">
          <span class="math-fn-card-swatch" aria-hidden="true"></span>
          <span class="math-fn-card-body">
            <strong class="math-fn-card-title" title="${formula}">${formula}</strong>
            <span class="math-fn-card-sub">${typeLabel}</span>
          </span>
        </button>
      </div>`;
    })
    .join('');
}

function syncParamPanel() {
  const panel = document.getElementById('mathFnParamPanel');
  const title = document.getElementById('mathFnParamTitle');
  const fn = activeFn();
  if (!panel) return;
  if (!fn || fn.kind !== 'preset') {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  if (title) {
    const meta = GRAPH_PRESETS.find((p) => p.id === fn.preset);
    title.textContent = `${meta?.label || '函数'}参数`;
  }
  mirrorActiveToLegacy();
  // 标签与数值同步（syncSliders 内含 a/b/c 文案）
  syncSliders();
}

/**
 * @param {string} presetId
 */
function addPresetFn(presetId) {
  const preset = GRAPH_PRESETS.some((p) => p.id === presetId) ? presetId : 'quadratic';
  const id = `f${state.fnSeq++}`;
  const color = colorForFnIndex(state.fnSeq - 1);
  /** @type {FnRec} */
  const rec = {
    id,
    kind: 'preset',
    preset,
    coeffs: defaultCoeffsFor(/** @type {any} */ (preset)),
    expr: '',
    color,
    visible: true,
    curve: null,
    evalFn: null,
  };
  state.functions.push(rec);
  state.activeFnId = id;
  mirrorActiveToLegacy();
  hideAddPanel();
  rebuildCurve();
}

/**
 * @param {string} raw
 * @param {{ quietStatus?: boolean }} [opts]
 */
function addCustomFn(raw, opts = {}) {
  const compiled = compileMathExpr(raw);
  if (!compiled.ok) {
    if (!opts.quietStatus) {
      const st = document.getElementById('mathFnExprStatus');
      if (st) st.textContent = compiled.error;
    }
    return false;
  }
  const id = `f${state.fnSeq++}`;
  const color = colorForFnIndex(state.fnSeq - 1);
  /** @type {FnRec} */
  const rec = {
    id,
    kind: 'custom',
    preset: null,
    coeffs: { a: 0, b: 0, c: 0 },
    expr: compiled.src,
    color,
    visible: true,
    curve: null,
    evalFn: compiled.fn,
  };
  state.functions.push(rec);
  state.activeFnId = id;
  const st = document.getElementById('mathFnExprStatus');
  if (st) st.textContent = '';
  hideAddPanel();
  rebuildCurve();
  return true;
}

/**
 * AI 返回的函数规格 → 上画布
 * @param {{
 *   kind?: string,
 *   preset?: string | null,
 *   coeffs?: { a?: number, b?: number, c?: number },
 *   expr?: string,
 * }} spec
 */
function addFnFromAiSpec(spec) {
  if (!spec || typeof spec !== 'object') return false;
  if (spec.kind === 'preset' && spec.preset) {
    const preset = GRAPH_PRESETS.some((p) => p.id === spec.preset) ? spec.preset : null;
    if (!preset) return false;
    const id = `f${state.fnSeq++}`;
    const color = colorForFnIndex(state.fnSeq - 1);
    const base = defaultCoeffsFor(/** @type {any} */ (preset));
    const c = spec.coeffs || {};
    /** @type {FnRec} */
    const rec = {
      id,
      kind: 'preset',
      preset,
      coeffs: {
        a: Number.isFinite(Number(c.a)) ? Number(c.a) : base.a,
        b: Number.isFinite(Number(c.b)) ? Number(c.b) : base.b,
        c: Number.isFinite(Number(c.c)) ? Number(c.c) : base.c,
      },
      expr: '',
      color,
      visible: true,
      curve: null,
      evalFn: null,
    };
    state.functions.push(rec);
    state.activeFnId = id;
    mirrorActiveToLegacy();
    hideAddPanel();
    hideAiFnModal();
    rebuildCurve();
    return true;
  }
  if (spec.kind === 'custom' || spec.expr) {
    const ok = addCustomFn(String(spec.expr || ''), { quietStatus: true });
    if (ok) hideAiFnModal();
    return ok;
  }
  return false;
}

function showAiFnModal() {
  const backdrop = document.getElementById('mathFnAiBackdrop');
  const modal = document.getElementById('mathFnAiModal');
  const prompt = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('mathFnAiPrompt'));
  const status = document.getElementById('mathFnAiStatus');
  if (status) {
    status.textContent = '';
    status.classList.remove('is-ok', 'is-err');
  }
  if (prompt) prompt.value = '';
  backdrop?.classList.add('is-open');
  modal?.classList.add('is-open');
  backdrop?.setAttribute('aria-hidden', 'false');
  modal?.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => prompt?.focus());
}

function hideAiFnModal() {
  const backdrop = document.getElementById('mathFnAiBackdrop');
  const modal = document.getElementById('mathFnAiModal');
  backdrop?.classList.remove('is-open');
  modal?.classList.remove('is-open');
  backdrop?.setAttribute('aria-hidden', 'true');
  modal?.setAttribute('aria-hidden', 'true');
  const submit = document.getElementById('btnMathFnAiSubmit');
  if (submit instanceof HTMLButtonElement) {
    submit.disabled = false;
    submit.textContent = '生成并添加';
  }
}

async function handleAiFnGenerate() {
  const promptEl = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('mathFnAiPrompt'));
  const status = document.getElementById('mathFnAiStatus');
  const submit = document.getElementById('btnMathFnAiSubmit');
  const prompt = promptEl?.value?.trim() || '';
  if (!prompt) {
    if (status) {
      status.textContent = '请输入函数描述';
      status.classList.add('is-err');
      status.classList.remove('is-ok');
    }
    return;
  }
  if (submit instanceof HTMLButtonElement) {
    submit.disabled = true;
    submit.textContent = '生成中…';
  }
  if (status) {
    status.textContent = '正在调用 DeepSeek…';
    status.classList.remove('is-ok', 'is-err');
  }
  try {
    const data = await aiApi.mathFnGenerate(prompt);
    const ok = addFnFromAiSpec(data);
    if (!ok) {
      throw new Error('生成结果无法上画布，请换种描述重试');
    }
    if (status) {
      status.textContent = '已生成并添加';
      status.classList.add('is-ok');
      status.classList.remove('is-err');
    }
    window.setTimeout(() => hideAiFnModal(), 400);
  } catch (err) {
    if (status) {
      status.textContent = err?.message || String(err);
      status.classList.add('is-err');
      status.classList.remove('is-ok');
    }
    if (submit instanceof HTMLButtonElement) {
      submit.disabled = false;
      submit.textContent = '生成并添加';
    }
  }
}

/**
 * @param {string} id
 */
function selectFn(id) {
  if (!state.functions.some((f) => f.id === id)) return;
  state.activeFnId = id;
  mirrorActiveToLegacy();
  renderFnList();
  syncParamPanel();
  paintReadouts();
  // 重画以加粗当前曲线、刷新特征点
  rebuildCurve();
}

/**
 * @param {string} id
 */
function deleteFn(id) {
  if (state.functions.length <= 1) {
    void appAlert('至少保留一条函数', { title: '无法删除' });
    return;
  }
  // 必须先卸曲线再从列表移除，否则 rebuild 时找不到 curve 引用 → 画板残留幽灵曲线
  const rec = state.functions.find((f) => f.id === id);
  detachFnCurve(rec);
  state.functions = state.functions.filter((f) => f.id !== id);
  if (state.activeFnId === id) {
    state.activeFnId = state.functions[0]?.id || null;
  }
  mirrorActiveToLegacy();
  rebuildCurve();
}

function showAddPanel() {
  const backdrop = document.getElementById('mathFnAddBackdrop');
  const modal = document.getElementById('mathFnAddModal');
  const st = document.getElementById('mathFnExprStatus');
  const exprInput = /** @type {HTMLInputElement | null} */ (document.getElementById('mathFnExprInput'));
  if (st) st.textContent = '';
  if (exprInput) exprInput.value = '';
  backdrop?.classList.add('is-open');
  modal?.classList.add('is-open');
  backdrop?.setAttribute('aria-hidden', 'false');
  modal?.setAttribute('aria-hidden', 'false');
  // 稍延后聚焦，便于键盘立刻可用
  requestAnimationFrame(() => {
    exprInput?.focus();
  });
}

function hideAddPanel() {
  const backdrop = document.getElementById('mathFnAddBackdrop');
  const modal = document.getElementById('mathFnAddModal');
  backdrop?.classList.remove('is-open');
  modal?.classList.remove('is-open');
  backdrop?.setAttribute('aria-hidden', 'true');
  modal?.setAttribute('aria-hidden', 'true');
  const st = document.getElementById('mathFnExprStatus');
  if (st) st.textContent = '';
}

/**
 * 表达式键盘：往输入框插入 / 退格 / 清空 / 确定
 * @param {HTMLInputElement} input
 * @param {string} key
 */
function applyExprKey(input, key) {
  if (!input || !key) return;
  if (key === '清空') {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (key === '⌫') {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    if (start !== end) {
      input.value = input.value.slice(0, start) + input.value.slice(end);
      input.setSelectionRange(start, start);
    } else if (start > 0) {
      input.value = input.value.slice(0, start - 1) + input.value.slice(end);
      input.setSelectionRange(start - 1, start - 1);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (key === '确定') {
    addCustomFn(input.value || '');
    return;
  }
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  const insert = key;
  input.value = input.value.slice(0, start) + insert + input.value.slice(end);
  const caret = start + insert.length;
  input.setSelectionRange(caret, caret);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

function bindFnListUi() {
  const list = document.getElementById('mathFnList');
  const addBtn = document.getElementById('btnMathAddFn');
  const aiBtn = document.getElementById('btnMathAiFn');
  const editBtn = document.getElementById('btnMathEditFns');
  const cancelBtn = document.getElementById('btnMathFnAddCancel');
  const closeBtn = document.getElementById('btnMathFnAddClose');
  const backdrop = document.getElementById('mathFnAddBackdrop');
  const aiBackdrop = document.getElementById('mathFnAiBackdrop');
  const aiClose = document.getElementById('btnMathFnAiClose');
  const aiCancel = document.getElementById('btnMathFnAiCancel');
  const aiSubmit = document.getElementById('btnMathFnAiSubmit');
  const exprAdd = document.getElementById('btnMathFnExprAdd');
  const exprInput = /** @type {HTMLInputElement | null} */ (document.getElementById('mathFnExprInput'));
  const keypad = document.getElementById('mathFnExprKeypad');
  const presetsHost = document.getElementById('mathGraphPresets');

  if (list && !list.dataset.bound) {
    list.dataset.bound = '1';
    list.addEventListener('click', (ev) => {
      const del = /** @type {HTMLElement} */ (ev.target).closest?.('[data-fn-del]');
      if (del) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!state.editMode) return;
        deleteFn(del.getAttribute('data-fn-del') || '');
        return;
      }
      if (state.editMode) return;
      const card = /** @type {HTMLElement} */ (ev.target).closest?.('[data-fn-id]');
      if (!card) return;
      selectFn(card.getAttribute('data-fn-id') || '');
    });
  }

  if (addBtn && !addBtn.dataset.bound) {
    addBtn.dataset.bound = '1';
    addBtn.addEventListener('click', () => {
      showAddPanel();
    });
  }
  if (aiBtn && !aiBtn.dataset.bound) {
    aiBtn.dataset.bound = '1';
    aiBtn.addEventListener('click', () => {
      hideAddPanel();
      showAiFnModal();
    });
  }
  if (editBtn && !editBtn.dataset.bound) {
    editBtn.dataset.bound = '1';
    editBtn.addEventListener('click', () => {
      state.editMode = !state.editMode;
      editBtn.classList.toggle('is-on', state.editMode);
      editBtn.textContent = state.editMode ? '完成' : '编辑';
      renderFnList();
    });
  }
  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.dataset.bound = '1';
    cancelBtn.addEventListener('click', () => hideAddPanel());
  }
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = '1';
    closeBtn.addEventListener('click', () => hideAddPanel());
  }
  if (backdrop && !backdrop.dataset.bound) {
    backdrop.dataset.bound = '1';
    backdrop.addEventListener('click', () => hideAddPanel());
  }
  if (aiBackdrop && !aiBackdrop.dataset.bound) {
    aiBackdrop.dataset.bound = '1';
    aiBackdrop.addEventListener('click', () => hideAiFnModal());
  }
  if (aiClose && !aiClose.dataset.bound) {
    aiClose.dataset.bound = '1';
    aiClose.addEventListener('click', () => hideAiFnModal());
  }
  if (aiCancel && !aiCancel.dataset.bound) {
    aiCancel.dataset.bound = '1';
    aiCancel.addEventListener('click', () => hideAiFnModal());
  }
  if (aiSubmit && !aiSubmit.dataset.bound) {
    aiSubmit.dataset.bound = '1';
    aiSubmit.addEventListener('click', () => {
      void handleAiFnGenerate();
    });
  }
  if (exprAdd && !exprAdd.dataset.bound) {
    exprAdd.dataset.bound = '1';
    exprAdd.addEventListener('click', () => {
      addCustomFn(exprInput?.value || '');
    });
  }
  if (exprInput && !exprInput.dataset.bound) {
    exprInput.dataset.bound = '1';
    exprInput.setAttribute('inputmode', 'none');
    exprInput.addEventListener('keydown', (ev) => {
      if (/** @type {KeyboardEvent} */ (ev).key === 'Enter') {
        ev.preventDefault();
        addCustomFn(exprInput.value || '');
      } else if (/** @type {KeyboardEvent} */ (ev).key === 'Escape') {
        ev.preventDefault();
        hideAddPanel();
      }
    });
  }
  if (keypad && !keypad.dataset.bound) {
    keypad.dataset.bound = '1';
    keypad.addEventListener('mousedown', (e) => {
      // 点键时保持输入框焦点 / 选区
      e.preventDefault();
    });
    keypad.addEventListener('click', (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest?.('[data-expr-key]');
      if (!btn || !exprInput) return;
      applyExprKey(exprInput, btn.getAttribute('data-expr-key') || '');
    });
  }

  if (presetsHost && !presetsHost.dataset.ready) {
    presetsHost.innerHTML = GRAPH_PRESETS.map(
      (p) =>
        `<button type="button" class="chip" data-math-preset="${p.id}" title="${p.tip}">${p.label}</button>`,
    ).join('');
    presetsHost.dataset.ready = '1';
    presetsHost.addEventListener('click', (ev) => {
      const btn = /** @type {HTMLElement} */ (ev.target).closest?.('[data-math-preset]');
      if (!btn) return;
      addPresetFn(btn.getAttribute('data-math-preset') || 'quadratic');
    });
  }
}

function paintReadouts() {
  const fn = activeFn();
  const formulaEl = document.getElementById('mathGraphFormula');
  const tipEl = document.getElementById('mathGraphTip');
  const featuresEl = document.getElementById('mathGraphFeatures');
  const tableEl = document.getElementById('mathGraphValueTable');

  if (!fn) {
    if (tipEl) tipEl.textContent = '添加函数后显示解析式';
    if (formulaEl) formulaEl.textContent = '—';
    if (featuresEl) featuresEl.innerHTML = '';
    if (tableEl) tableEl.innerHTML = '';
    return;
  }

  if (fn.kind === 'custom') {
    if (tipEl) tipEl.textContent = '自定义表达式';
    if (formulaEl) {
      // 纯文本，避免复杂 LaTeX 转换失败
      formulaEl.textContent = formatExprLabel(fn.expr);
    }
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
  const meta = GRAPH_PRESETS.find((p) => p.id === preset);
  if (tipEl) tipEl.textContent = meta?.tip || '';
  if (formulaEl) {
    renderTex(formulaEl, toTex(preset, coeffs), true);
  }
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

/**
 * @param {string} preset
 * @param {{ a: number, b: number, c: number }} coeffs
 */
function toTex(preset, coeffs) {
  const { a, b, c } = coeffs;
  const F = (n) => {
    const r = Math.round(n * 100) / 100;
    return String(r);
  };
  switch (preset) {
    case 'linear':
      return String.raw`y=${F(a)}x${b >= 0 ? '+' : ''}${F(b)}`;
    case 'quadratic':
      return String.raw`y=${F(a)}x^2${b >= 0 ? '+' : ''}${F(b)}x${c >= 0 ? '+' : ''}${F(c)}`;
    case 'power':
      return String.raw`y=${F(a)}x^{${F(b)}}`;
    case 'exp':
      return String.raw`y=${F(a)}e^{${F(b)}x}${c >= 0 ? '+' : ''}${F(c)}`;
    case 'log':
      return String.raw`y=${F(a)}\ln(x${b >= 0 ? '-' : '+'}${F(Math.abs(b))})${c >= 0 ? '+' : ''}${F(c)}`;
    case 'abs':
      return String.raw`y=${F(a)}|x${b >= 0 ? '-' : '+'}${F(Math.abs(b))}|${c >= 0 ? '+' : ''}${F(c)}`;
    case 'inverse':
      return String.raw`y=\dfrac{${F(a)}}{x}`;
    case 'sine':
      return String.raw`y=${F(a)}\sin(${F(b)}x${c >= 0 ? '+' : ''}${F(c)})`;
    case 'cosine':
      return String.raw`y=${F(a)}\cos(${F(b)}x${c >= 0 ? '+' : ''}${F(c)})`;
    default:
      return 'y=f(x)';
  }
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

function setCoeffs(next) {
  const fn = activeFn();
  if (fn && fn.kind === 'preset') {
    fn.coeffs = { ...fn.coeffs, ...next };
  }
  state.coeffs = { ...(fn?.coeffs || state.coeffs), ...next };
  syncSliders();
  rebuildCurve();
}

function ensurePreset(id) {
  const fn = activeFn();
  if (fn && fn.kind === 'preset' && fn.preset === id) return;
  if (fn && fn.kind === 'preset') {
    fn.preset = id;
    fn.coeffs = defaultCoeffsFor(/** @type {any} */ (id));
    mirrorActiveToLegacy();
    syncSliders();
    rebuildCurve();
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
    },
  });

  // 默认一条二次
  if (!state.functions.length) {
    const id = `f${state.fnSeq++}`;
    state.functions.push({
      id,
      kind: 'preset',
      preset: 'quadratic',
      coeffs: defaultCoeffsFor('quadratic'),
      expr: '',
      color: colorForFnIndex(0),
      visible: true,
      curve: null,
      evalFn: null,
    });
    state.activeFnId = id;
  }
  mirrorActiveToLegacy();
  state.startCoeffs = { ...state.coeffs };

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
    canDelete: (el) => Boolean(el?._mathUserPoint) && Boolean(findUserRec(el)),
    deletePoint: (el) => deleteUserPoint(el),
  });

  state.compass?.dispose?.();
  state.compass = attachBoardCompass(state.board, {
    items: [{ id: 'add-point', label: '加点', icon: '＋' }],
    shouldIgnoreTarget: () => Boolean(state.notes?.isActive?.()),
    onAction: async (id, ctx) => {
      if (state.notes?.isActive?.()) return;
      if (id === 'add-point') {
        await addPointAt(ctx.usrX, ctx.usrY);
      }
    },
  });

  state.notes?.dispose?.();
  state.notes = attachBoardNotes(state.board, {
    host: stageEl,
    storageKey: 'math-graph-board-notes-v1',
  });

  syncSliders();
  rebuildCurve();
  bindReadoutCards();
  renderFnList();
  syncParamPanel();

  state.ro = new ResizeObserver(() => {
    resizeMathBoard(state.board, stageEl);
    state.notes?.redraw?.();
  });
  state.ro.observe(stageEl);
  requestAnimationFrame(() => {
    resizeMathBoard(state.board, stageEl);
    state.notes?.redraw?.();
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
  hideAddPanel();
  hideAiFnModal();
  dismissBoardNotesMode();
  state.themeHandle?.dispose?.();
  state.themeHandle = null;
  state.notes?.dispose?.();
  state.notes = null;
  state.compass?.dispose?.();
  state.compass = null;
  setPointOptionHooks(null);
  state.styleBind?.dispose?.();
  state.styleBind = null;
  state.ro?.disconnect();
  removeUserPointEls();
  if (state.board) removeAllFnCurves(state.board);
  freeMathBoard(state.board);
  state.board = null;
  state.curve = null;
  state.marks = [];
  state.asy = [];
  state.userPoints = [];
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
