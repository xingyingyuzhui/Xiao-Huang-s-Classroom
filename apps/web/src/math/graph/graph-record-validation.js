/**
 * GraphRecordValidation：record/patch allowlist + 全局引用校验。
 *
 * 纯逻辑层：不 import 画板库、不触碰浏览器全局。
 * 所有持久修改在进入 reducer 前必须经过本模块规范化/校验；
 * patch 默认禁止修改 id 与 record kind（kind 变化走 replace action）。
 */

import { compileMathExpr } from '../shared/expr-safe.js';
import { GRAPH_PRESETS, defaultCoeffsFor } from './model.js';
import {
  buildGraphDependencyIndex,
  findGraphDependencyCycle,
} from './graph-dependency-plan.js';

/** @param {unknown} value @param {number} fallback */
function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** @param {number} value */
function clampOpacity(value) {
  return Math.min(1, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 1));
}

/** 名称/表达式/颜色字符串上限（与导入限额对齐） */
const MAX_NAME_LENGTH = 120;
const MAX_EXPR_LENGTH = 400;
const MAX_COLOR_LENGTH = 64;

/** @param {unknown} value */
function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {{ a?: number, b?: number, c?: number }} fallback
 */
function normalizeCoeffs(value, fallback = {}) {
  const raw = isPlainObject(value) ? value : {};
  return {
    a: finiteOr(raw.a, fallback.a ?? 0),
    b: finiteOr(raw.b, fallback.b ?? 0),
    c: finiteOr(raw.c, fallback.c ?? 0),
  };
}

/**
 * 函数记录规范化（V2）：colorSlot/explicitColor 取代 literal color。
 * @param {any} record
 * @param {{ index?: number }} [context]
 */
export function normalizeFunctionRecord(record, context = {}) {
  if (!isPlainObject(record)) return null;
  if (typeof record.id !== 'string' || !record.id) return null;
  if (record.id.length > MAX_NAME_LENGTH) return null;
  const kind = record.kind;
  if (kind !== 'preset' && kind !== 'custom') return null;
  const preset =
    kind === 'preset' && GRAPH_PRESETS.some((p) => p.id === record.preset)
      ? record.preset
      : kind === 'preset'
        ? 'quadratic'
        : null;
  const defaults = preset ? defaultCoeffsFor(preset) : { a: 0, b: 0, c: 0 };
  const coeffs = normalizeCoeffs(record.coeffs, defaults);
  let expr = '';
  if (kind === 'custom') {
    const raw = typeof record.expr === 'string' ? record.expr.slice(0, MAX_EXPR_LENGTH) : '';
    const compiled = compileMathExpr(raw);
    if (!compiled.ok) return null;
    expr = compiled.src;
  }
  const colorSlot = Number.isFinite(Number(record.colorSlot)) ? Number(record.colorSlot) : 0;
  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name.slice(0, MAX_NAME_LENGTH) : '',
    kind,
    preset,
    expr,
    coeffs,
    colorSlot: Math.max(0, Math.floor(colorSlot)),
    explicitColor:
      typeof record.explicitColor === 'string' && record.explicitColor.length <= MAX_COLOR_LENGTH
        ? record.explicitColor
        : null,
    visible: record.visible !== false,
    locked: record.locked === true,
    domain: normalizeDomain(record.domain, context.index ?? 0),
  };
}

/**
 * 定义域规范化：viewport 或 custom（排序 + 限制在 [-1e6, 1e6]）。
 * @param {any} domain
 * @param {number} index
 */
export function normalizeDomain(domain, index) {
  const fallbackMin = index % 2 === 0 ? -10 : -8;
  const fallbackMax = index % 2 === 0 ? 10 : 8;
  if (!isPlainObject(domain) || domain.mode !== 'custom') {
    return { mode: 'viewport' };
  }
  let min = finiteOr(domain.min, fallbackMin);
  let max = finiteOr(domain.max, fallbackMax);
  if (min > max) {
    const swap = min;
    min = max;
    max = swap;
  }
  const limit = 1e6;
  min = Math.max(-limit, Math.min(limit, min));
  max = Math.max(-limit, Math.min(limit, max));
  return { mode: 'custom', min, max };
}

/**
 * 点约束规范化（discriminated union）。
 * @param {any} constraint
 * @param {{ x?: number }} [anchor]
 */
export function normalizePointConstraint(constraint, anchor = {}) {
  if (!isPlainObject(constraint)) return { kind: 'free' };
  switch (constraint.kind) {
    case 'free':
      return { kind: 'free' };
    case 'followFunction': {
      if (typeof constraint.functionId !== 'string' || !constraint.functionId) {
        return { kind: 'free' };
      }
      return {
        kind: 'followFunction',
        functionId: constraint.functionId,
        anchorX: finiteOr(constraint.anchorX, anchor.x ?? 0),
      };
    }
    case 'followFeature': {
      if (typeof constraint.functionId !== 'string' || !constraint.functionId) {
        return { kind: 'free' };
      }
      return {
        kind: 'followFeature',
        functionId: constraint.functionId,
        feature: typeof constraint.feature === 'string' ? constraint.feature : 'vertex',
        featureIndex: Number.isInteger(constraint.featureIndex) ? constraint.featureIndex : 0,
      };
    }
    case 'intersection': {
      const targetIds = Array.isArray(constraint.targetIds)
        ? constraint.targetIds.filter((id) => typeof id === 'string')
        : [];
      if (targetIds.length < 2) return { kind: 'free' };
      return {
        kind: 'intersection',
        targetIds: /** @type {[string, string]} */ ([targetIds[0], targetIds[1]]),
        nearX: finiteOr(constraint.nearX, anchor.x ?? 0),
      };
    }
    default:
      return { kind: 'free' };
  }
}

/**
 * 点记录规范化。
 * @param {any} record
 * @param {{ index?: number }} [context]
 */
export function normalizePointRecord(record, context = {}) {
  if (!isPlainObject(record)) return null;
  if (typeof record.id !== 'string' || !record.id) return null;
  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name.slice(0, MAX_NAME_LENGTH) : record.id,
    x: finiteOr(record.x, 0),
    y: finiteOr(record.y, 0),
    constraint: normalizePointConstraint(record.constraint, { x: record.x }),
    showCoords: record.showCoords !== false,
    locked: record.locked === true,
    style: normalizePointStyle(record.style),
  };
}

/**
 * 点样式规范化（semantic stroke/fill/label）。
 * @param {any} style
 */
export function normalizePointStyle(style) {
  const emptyPart = { colorSlot: null, explicitColor: null, opacity: 1 };
  if (!isPlainObject(style)) {
    return { stroke: { ...emptyPart }, fill: { ...emptyPart }, size: 3, face: 'o', label: { ...emptyPart, fontSize: 13 } };
  }
  const part = (value) => {
    if (!isPlainObject(value)) return { ...emptyPart };
    return {
      colorSlot: Number.isInteger(value.colorSlot) ? value.colorSlot : null,
      explicitColor:
        typeof value.explicitColor === 'string' && value.explicitColor.length <= MAX_COLOR_LENGTH
          ? value.explicitColor
          : null,
      opacity: clampOpacity(value.opacity),
    };
  };
  return {
    stroke: part(style.stroke),
    fill: part(style.fill),
    size: finiteOr(style.size, 3),
    face: typeof style.face === 'string' ? style.face : 'o',
    label: {
      ...part(style.label),
      fontSize: finiteOr(style.label?.fontSize, 13),
    },
  };
}

/** 已知 construction kind 白名单（未知 kind 拒绝）。 */
export const GRAPH_CONSTRUCTION_KINDS = Object.freeze([
  'segment',
  'line',
  'tangent',
  'perp',
  'perp-axis',
  'intersect',
  'secant',
  'normal',
]);

/**
 * 构造记录规范化。
 * @param {any} record
 * @param {{ index?: number }} [context]
 */
export function normalizeConstructionRecord(record, context = {}) {
  if (!isPlainObject(record)) return null;
  if (typeof record.id !== 'string' || !record.id) return null;
  if (typeof record.kind !== 'string' || !GRAPH_CONSTRUCTION_KINDS.includes(record.kind)) {
    return null;
  }
  return {
    id: record.id,
    kind: record.kind,
    name: typeof record.name === 'string' ? record.name.slice(0, MAX_NAME_LENGTH) : record.kind,
    locked: record.locked === true,
    visible: record.visible !== false,
    extend: record.extend === true,
    ...(Array.isArray(record.pointIds)
      ? { pointIds: record.pointIds.filter((x) => typeof x === 'string') }
      : {}),
    ...(typeof record.fnId === 'string' ? { fnId: record.fnId } : {}),
    ...(record.axis === 'x' || record.axis === 'y' ? { axis: record.axis } : {}),
    ...(typeof record.perpTarget === 'string' ? { perpTarget: record.perpTarget } : {}),
    ...(typeof record.targetConstrId === 'string' ? { targetConstrId: record.targetConstrId } : {}),
    ...(Array.isArray(record.fnIds) ? { fnIds: record.fnIds.filter((x) => typeof x === 'string') } : {}),
    ...(Array.isArray(record.lineIds) ? { lineIds: record.lineIds.filter((x) => typeof x === 'string') } : {}),
    ...(Number.isInteger(record.intersectIndex) ? { intersectIndex: record.intersectIndex } : {}),
    ...(typeof record.label === 'string' ? { label: record.label.slice(0, MAX_NAME_LENGTH) } : {}),
    ...(Number.isFinite(Number(record.x1)) ? { x1: Number(record.x1) } : {}),
    ...(Number.isFinite(Number(record.x2)) ? { x2: Number(record.x2) } : {}),
    ...(record.kind === 'secant' ? { showDelta: record.showDelta !== false } : {}),
  };
}

/**
 * 函数 patch 规范化：禁止改写 id/kind；未知字段丢弃。
 * @param {any} previous
 * @param {any} patch
 */
export function normalizeFunctionPatch(previous, patch) {
  if (!isPlainObject(patch)) return null;
  const next = { ...previous };
  if ('name' in patch) next.name = typeof patch.name === 'string' ? patch.name.slice(0, MAX_NAME_LENGTH) : next.name;
  if ('expr' in patch) {
    if (previous.kind !== 'custom') return null;
    const raw = typeof patch.expr === 'string' ? patch.expr.slice(0, MAX_EXPR_LENGTH) : '';
    const compiled = compileMathExpr(raw);
    if (!compiled.ok) return null;
    next.expr = compiled.src;
  }
  if ('coeffs' in patch) {
    const coeffs = normalizeCoeffs(patch.coeffs, previous.coeffs);
    if (previous.kind === 'preset') next.coeffs = coeffs;
    else return null; // custom 函数不允许写 coeffs
  }
  if ('domain' in patch) next.domain = normalizeDomain(patch.domain, 0);
  if ('visible' in patch) next.visible = patch.visible !== false;
  if ('locked' in patch) next.locked = patch.locked === true;
  if ('colorSlot' in patch) {
    next.colorSlot = Math.max(0, Math.floor(Number(patch.colorSlot) || 0));
  }
  if ('explicitColor' in patch) {
    next.explicitColor =
      typeof patch.explicitColor === 'string' && patch.explicitColor.length <= MAX_COLOR_LENGTH
        ? patch.explicitColor
        : null;
  }
  return next;
}

/**
 * 点 patch 规范化：禁止改写 id；constraint kind 变化必须通过 replace。
 * @param {any} previous
 * @param {any} patch
 */
export function normalizePointPatch(previous, patch) {
  if (!isPlainObject(patch)) return null;
  const next = { ...previous };
  if ('name' in patch) next.name = typeof patch.name === 'string' ? patch.name.slice(0, MAX_NAME_LENGTH) : next.name;
  if ('x' in patch) next.x = finiteOr(patch.x, previous.x);
  if ('y' in patch) next.y = finiteOr(patch.y, previous.y);
  if ('showCoords' in patch) next.showCoords = patch.showCoords !== false;
  if ('locked' in patch) next.locked = patch.locked === true;
  if ('style' in patch) next.style = normalizePointStyle(patch.style);
  if ('constraint' in patch) {
    // 允许同 kind 更新（如 followFunction.anchorX、intersection.nearX）；
    // 跨 kind 变化由调用方使用 replace。
    const raw = patch.constraint;
    if (!isPlainObject(raw) || raw.kind !== previous.constraint?.kind) return null;
    const normalized = normalizePointConstraint(raw, { x: next.x });
    if (normalized.kind !== previous.constraint?.kind) return null;
    next.constraint = normalized;
  }
  return next;
}

/**
 * 构造 patch 规范化：禁止改写 id/kind。
 * @param {any} previous
 * @param {any} patch
 */
export function normalizeConstructionPatch(previous, patch) {
  if (!isPlainObject(patch)) return null;
  const next = { ...previous };
  if ('visible' in patch) next.visible = patch.visible !== false;
  if ('locked' in patch) next.locked = patch.locked === true;
  if ('extend' in patch) next.extend = patch.extend === true;
  if ('label' in patch) {
    next.label = typeof patch.label === 'string' ? patch.label.slice(0, MAX_NAME_LENGTH) : undefined;
  }
  if ('showDelta' in patch && previous.kind === 'secant') next.showDelta = patch.showDelta !== false;
  if (isPlainObject(patch.style)) {
    // 样式字段走原位置投影（颜色/线宽/虚线/透明度/标签样式）
    next.style = { ...(previous.style || {}), ...patch.style };
  }
  return next;
}

/**
 * 全局引用校验：id 唯一、引用存在、无环、activeFunctionId 有效。
 * @param {any} document
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
export function validateGraphReferences(document) {
  if (!isPlainObject(document)) return { ok: false, code: 'INVALID_DOCUMENT', message: '文档必须是对象' };
  const functions = Array.isArray(document.functions) ? document.functions : [];
  const points = Array.isArray(document.points) ? document.points : [];
  const constructions = Array.isArray(document.constructions) ? document.constructions : [];
  if (!functions.length) {
    return { ok: false, code: 'INVALID_DOCUMENT', message: 'functions 不能为空' };
  }
  const seen = new Set();
  for (const list of [functions, points, constructions]) {
    for (const record of list) {
      const id = record?.id;
      if (typeof id !== 'string' || !id) {
        return { ok: false, code: 'INVALID_DOCUMENT', message: 'record 缺少 id' };
      }
      if (seen.has(id)) {
        return { ok: false, code: 'INVALID_DOCUMENT', message: `id 重复：${id}` };
      }
      seen.add(id);
    }
  }
  const fnIds = new Set(functions.map((f) => f.id));
  const pointIds = new Set(points.map((p) => p.id));
  const constrIds = new Set(constructions.map((c) => c.id));
  for (const pt of points) {
    const constraint = pt.constraint || {};
    if (constraint.kind === 'followFunction' || constraint.kind === 'followFeature') {
      if (!fnIds.has(constraint.functionId)) {
        return { ok: false, code: 'INVALID_REFERENCE', message: `点 ${pt.id} 引用不存在的函数 ${constraint.functionId}` };
      }
    } else if (constraint.kind === 'intersection') {
      const targets = constraint.targetIds || [];
      if (targets.length < 2) {
        return { ok: false, code: 'INVALID_REFERENCE', message: `点 ${pt.id} 的交点目标少于 2` };
      }
      const seenTargets = new Set();
      for (const target of targets) {
        if (seenTargets.has(target)) {
          return { ok: false, code: 'INVALID_REFERENCE', message: `点 ${pt.id} 的交点目标重复` };
        }
        seenTargets.add(target);
        if (!fnIds.has(target) && !constrIds.has(target)) {
          return { ok: false, code: 'INVALID_REFERENCE', message: `点 ${pt.id} 引用不存在的交点目标 ${target}` };
        }
      }
    }
  }
  for (const cr of constructions) {
    for (const pid of cr.pointIds || []) {
      if (!pointIds.has(pid)) {
        return { ok: false, code: 'INVALID_REFERENCE', message: `构造 ${cr.id} 引用不存在的点 ${pid}` };
      }
    }
    for (const fid of [cr.fnId, ...(cr.fnIds || [])]) {
      if (fid && !fnIds.has(fid)) {
        return { ok: false, code: 'INVALID_REFERENCE', message: `构造 ${cr.id} 引用不存在的函数 ${fid}` };
      }
    }
    for (const cid of [cr.targetConstrId, ...(cr.lineIds || [])]) {
      if (cid && !constrIds.has(cid)) {
        return { ok: false, code: 'INVALID_REFERENCE', message: `构造 ${cr.id} 引用不存在的构造 ${cid}` };
      }
    }
  }
  const activeId = document.presentation?.activeFunctionId;
  if (typeof activeId === 'string' && activeId && !fnIds.has(activeId)) {
    return { ok: false, code: 'INVALID_REFERENCE', message: `activeFunctionId 指向不存在的函数 ${activeId}` };
  }
  const cycle = findGraphDependencyCycle(document);
  if (cycle) {
    return { ok: false, code: 'INVALID_REFERENCE', message: `依赖环：${cycle.join(' → ')}` };
  }
  return { ok: true };
}

/**
 * 便捷入口：给定任意输入文档，检查其索引与引用是否成立。
 * @param {any} document
 */
export function indexGraphDocument(document) {
  return buildGraphDependencyIndex(document);
}
