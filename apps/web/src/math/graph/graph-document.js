/**
 * GraphDocumentV1：函数画布唯一业务数据源。
 *
 * 默认文档、深度规范化、校验、可序列化克隆与错误对象。
 * 纯逻辑层：不 import 画板库，不触碰浏览器全局，不持有 runtime 字段。
 */

import { compileMathExpr } from '../shared/expr-safe.js';
import { GRAPH_PRESETS, defaultCoeffsFor } from './model.js';
import { createPresetFunctionRecord } from './function-records.js';
import {
  GRAPH_CONSTRUCTION_KINDS,
  validateGraphReferences,
} from './graph-record-validation.js';

export const GRAPH_DOCUMENT_VERSION = 2;

/** 定义域限制：[-1e6, 1e6] */
export const GRAPH_DOMAIN_LIMIT = 1e6;

const DEFAULT_BOUNDING_BOX = /** @type {[number, number, number, number]} */ ([
  -8, 8, 8, -8,
]);

/** 文档禁止携带的运行时字段 */
const RUNTIME_KEYS = new Set(['curve', 'evalFn', 'el', 'els', 'board']);

/**
 * @param {string} code
 * @param {string} message
 * @param {string} [path]
 */
function failure(code, message, path) {
  return { ok: false, code, message, path };
}

/** @param {any} document */
function success(document) {
  return { ok: true, document };
}

/** @param {unknown} value @param {number} fallback */
function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * 定义域规范化：排序、限制在 [-1e6, 1e6]；viewport 模式不保存固定值。
 * @param {any} domain
 * @param {number} index
 */
function normalizeDomain(domain, index) {
  const fallbackMin = index % 2 === 0 ? -10 : -8;
  const fallbackMax = index % 2 === 0 ? 10 : 8;
  if (!domain || typeof domain !== 'object' || domain.mode !== 'custom') {
    return { mode: 'viewport' };
  }
  let min = finiteOr(domain.min, fallbackMin);
  let max = finiteOr(domain.max, fallbackMax);
  if (min > max) {
    const swap = min;
    min = max;
    max = swap;
  }
  min = Math.max(-GRAPH_DOMAIN_LIMIT, Math.min(GRAPH_DOMAIN_LIMIT, min));
  max = Math.max(-GRAPH_DOMAIN_LIMIT, Math.min(GRAPH_DOMAIN_LIMIT, max));
  return { mode: 'custom', min, max };
}

/**
 * @param {any} fn
 * @param {number} index
 * @param {Set<string>} seenIds
 * @returns {any}
 */
function normalizeFunctionRecord(fn, index, seenIds) {
  const at = `functions[${index}]`;
  if (!fn || typeof fn !== 'object' || Array.isArray(fn)) {
    return failure('INVALID_DOCUMENT', '函数记录必须是对象', at);
  }
  const id = typeof fn.id === 'string' && fn.id ? fn.id : null;
  if (!id) return failure('INVALID_DOCUMENT', '函数缺少 id', `${at}.id`);
  if (seenIds.has(id)) {
    return failure('INVALID_DOCUMENT', '函数 id 重复', `${at}.id`);
  }
  seenIds.add(id);

  const kind = fn.kind;
  if (kind !== 'preset' && kind !== 'custom') {
    return failure('INVALID_DOCUMENT', '未知的函数类型', `${at}.kind`);
  }

  const preset =
    kind === 'preset' && GRAPH_PRESETS.some((p) => p.id === fn.preset)
      ? fn.preset
      : kind === 'preset'
        ? 'quadratic'
        : null;

  const defaults = preset ? defaultCoeffsFor(preset) : { a: 0, b: 0, c: 0 };
  const rawCoeffs = fn.coeffs || {};
  const coeffs = {
    a: finiteOr(rawCoeffs.a, defaults.a),
    b: finiteOr(rawCoeffs.b, defaults.b),
    c: finiteOr(rawCoeffs.c, defaults.c),
  };

  let expr = '';
  if (kind === 'custom') {
    const raw = typeof fn.expr === 'string' ? fn.expr : '';
    const compiled = compileMathExpr(raw);
    if (!compiled.ok) {
      return failure('INVALID_EXPRESSION', '表达式无法解析', `${at}.expr`);
    }
    expr = compiled.src;
  }

  return {
    id,
    name: typeof fn.name === 'string' ? fn.name : '',
    kind,
    preset,
    expr,
    coeffs,
    // V2：colorSlot 按数组位置落主题色板；explicitColor 仅用户显式自定义（当前 UI 无此入口）
    colorSlot: Number.isInteger(fn.colorSlot) ? Math.max(0, fn.colorSlot) : index,
    explicitColor: typeof fn.explicitColor === 'string' && fn.explicitColor ? fn.explicitColor : null,
    visible: fn.visible !== false,
    locked: fn.locked === true,
    domain: normalizeDomain(fn.domain, index),
  };
}

/**
 * 点样式（semantic stroke/fill/label；colorSlot 由主题解析，explicitColor 仅用户自定义时存在）
 * @param {any} style
 */
function normalizePointStyle(style) {
  if (!style || typeof style !== 'object') {
    return {
      stroke: { colorSlot: null, explicitColor: null, opacity: 1 },
      fill: { colorSlot: null, explicitColor: null, opacity: 1 },
      size: 3,
      face: 'o',
      label: { colorSlot: null, explicitColor: null, opacity: 1, fontSize: 13 },
    };
  }
  const part = (value, fallback) => {
    if (!value || typeof value !== 'object') return fallback;
    return {
      colorSlot: Number.isInteger(value.colorSlot) ? value.colorSlot : null,
      explicitColor:
        typeof value.explicitColor === 'string' && value.explicitColor
          ? value.explicitColor
          : null,
      opacity: Math.min(1, Math.max(0, finiteOr(value.opacity, 1))),
    };
  };
  return {
    stroke: part(style.stroke, { colorSlot: null, explicitColor: null, opacity: 1 }),
    fill: part(style.fill, { colorSlot: null, explicitColor: null, opacity: 1 }),
    size: finiteOr(style.size, 3),
    face: typeof style.face === 'string' ? style.face : 'o',
    label: {
      ...part(style.label, { colorSlot: null, explicitColor: null, opacity: 1 }),
      fontSize: finiteOr(style.label?.fontSize, 13),
    },
  };
}

/**
 * 点约束（discriminated union；legacy followTargetId/intersectFnIds 已映射为约束）
 * @param {any} point
 */
function normalizePointConstraint(point) {
  const raw = point?.constraint;
  if (!raw || typeof raw !== 'object') {
    return { kind: 'free' };
  }
  switch (raw.kind) {
    case 'free':
      return { kind: 'free' };
    case 'followFunction': {
      if (typeof raw.functionId !== 'string' || !raw.functionId) return { kind: 'free' };
      return {
        kind: 'followFunction',
        functionId: raw.functionId,
        anchorX: finiteOr(raw.anchorX, point.x ?? 0),
      };
    }
    case 'followFeature': {
      if (typeof raw.functionId !== 'string' || !raw.functionId) return { kind: 'free' };
      return {
        kind: 'followFeature',
        functionId: raw.functionId,
        feature: typeof raw.feature === 'string' ? raw.feature : 'vertex',
        featureIndex: Number.isInteger(raw.featureIndex) ? raw.featureIndex : 0,
      };
    }
    case 'intersection': {
      const targetIds = Array.isArray(raw.targetIds)
        ? raw.targetIds.filter((id) => typeof id === 'string')
        : [];
      if (targetIds.length < 2) return { kind: 'free' };
      return {
        kind: 'intersection',
        targetIds: /** @type {[string, string]} */ ([targetIds[0], targetIds[1]]),
        nearX: finiteOr(raw.nearX, point.x ?? 0),
      };
    }
    default:
      return { kind: 'free' };
  }
}

/** @param {any} point @param {number} index @param {Set<string>} seenIds */
function normalizePointRecord(point, index, seenIds) {
  const at = `points[${index}]`;
  if (!point || typeof point !== 'object' || Array.isArray(point)) {
    return failure('INVALID_DOCUMENT', '点记录必须是对象', at);
  }
  const id = typeof point.id === 'string' && point.id ? point.id : null;
  if (!id) return failure('INVALID_DOCUMENT', '点缺少 id', `${at}.id`);
  if (seenIds.has(id)) return failure('INVALID_DOCUMENT', '点 id 重复', `${at}.id`);
  seenIds.add(id);
  return {
    id,
    name: typeof point.name === 'string' ? point.name : id,
    x: finiteOr(point.x, 0),
    y: finiteOr(point.y, 0),
    constraint: normalizePointConstraint(point),
    showCoords: point.showCoords !== false,
    locked: point.locked === true,
    style: normalizePointStyle(point.style),
  };
}

/** @param {any} construction @param {number} index @param {Set<string>} seenIds */
function normalizeConstructionRecord(construction, index, seenIds) {
  const at = `constructions[${index}]`;
  if (!construction || typeof construction !== 'object' || Array.isArray(construction)) {
    return failure('INVALID_DOCUMENT', '构造记录必须是对象', at);
  }
  const id = typeof construction.id === 'string' && construction.id ? construction.id : null;
  if (!id) return failure('INVALID_DOCUMENT', '构造缺少 id', `${at}.id`);
  if (seenIds.has(id)) return failure('INVALID_DOCUMENT', '构造 id 重复', `${at}.id`);
  seenIds.add(id);
  const kind = typeof construction.kind === 'string' ? construction.kind : '';
  if (!kind) return failure('INVALID_DOCUMENT', '构造缺少 kind', `${at}.kind`);
  if (!GRAPH_CONSTRUCTION_KINDS.includes(kind)) {
    return failure('INVALID_DOCUMENT', '未知的构造类型', `${at}.kind`);
  }
  return {
    id,
    kind,
    name: typeof construction.name === 'string' ? construction.name : kind,
    locked: construction.locked === true,
    visible: construction.visible !== false,
    extend: construction.extend === true,
    // 持久引用字段（与 construction/records 的 snapshotConstructionMeta 对齐）：
    // 只保留字符串 id / 数组，绝不允许 element 或对象引用进入文档。
    ...(Array.isArray(construction.pointIds)
      ? { pointIds: construction.pointIds.filter((x) => typeof x === 'string') }
      : {}),
    ...(typeof construction.fnId === 'string'
      ? { fnId: construction.fnId }
      : {}),
    ...(construction.axis === 'x' || construction.axis === 'y'
      ? { axis: construction.axis }
      : {}),
    ...(typeof construction.perpTarget === 'string'
      ? { perpTarget: construction.perpTarget }
      : {}),
    ...(typeof construction.targetConstrId === 'string'
      ? { targetConstrId: construction.targetConstrId }
      : {}),
    ...(Array.isArray(construction.fnIds)
      ? { fnIds: construction.fnIds.filter((x) => typeof x === 'string') }
      : {}),
    ...(Array.isArray(construction.lineIds)
      ? { lineIds: construction.lineIds.filter((x) => typeof x === 'string') }
      : {}),
    ...(Number.isInteger(construction.intersectIndex)
      ? { intersectIndex: construction.intersectIndex }
      : {}),
    ...(typeof construction.label === 'string'
      ? { label: construction.label }
      : {}),
    // 割线：x1/x2 为曲线上两个横坐标；showDelta 控制 Δx/Δy 标签（显式 false 也必须保留）
    ...(Number.isFinite(Number(construction.x1))
      ? { x1: Number(construction.x1) }
      : {}),
    ...(Number.isFinite(Number(construction.x2))
      ? { x2: Number(construction.x2) }
      : {}),
    ...(kind === 'secant' ? { showDelta: construction.showDelta !== false } : {}),
  };
}

/** @param {any} stroke @param {number} index */
function normalizeStrokeRecord(stroke, index) {
  const at = `annotations.strokes[${index}]`;
  if (!stroke || typeof stroke !== 'object' || Array.isArray(stroke)) {
    return failure('INVALID_DOCUMENT', '笔迹必须是对象', at);
  }
  const id = typeof stroke.id === 'string' && stroke.id ? stroke.id : `s${index}`;
  const points = Array.isArray(stroke.points)
    ? stroke.points
        .map((p) => ({
          x: finiteOr(p?.x, 0),
          y: finiteOr(p?.y, 0),
          ...(Number.isFinite(Number(p?.pressure)) ? { pressure: Number(p.pressure) } : {}),
        }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    : [];
  return {
    id,
    points,
    colorSlot: Number.isInteger(stroke.colorSlot) ? stroke.colorSlot : null,
    explicitColor:
      typeof stroke.explicitColor === 'string' && stroke.explicitColor
        ? stroke.explicitColor
        : null,
    width: finiteOr(stroke.width, 3),
    opacity: Math.min(1, Math.max(0, finiteOr(stroke.opacity, 1))),
  };
}

/** @param {any} view */
function normalizeView(view) {
  const raw = view && typeof view === 'object' ? view : {};
  let boundingBox = DEFAULT_BOUNDING_BOX;
  if (Array.isArray(raw.boundingBox) && raw.boundingBox.length >= 4) {
    const candidate = raw.boundingBox.slice(0, 4).map((n) => Number(n));
    if (candidate.every(Number.isFinite)) {
      boundingBox = /** @type {[number, number, number, number]} */ (candidate);
    }
  }
  const axes = raw.axes && typeof raw.axes === 'object' && !Array.isArray(raw.axes)
    ? raw.axes
    : {};
  return { boundingBox, axes };
}

/**
 * @param {any} input
 * @param {{ now?: () => string }} [options]
 */
export function normalizeGraphDocument(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return failure('INVALID_DOCUMENT', '文档必须是对象');
  }
  if (input.schemaVersion !== GRAPH_DOCUMENT_VERSION) {
    return failure(
      'UNSUPPORTED_VERSION',
      `不支持的文档版本 ${String(input.schemaVersion)}`,
      'schemaVersion',
    );
  }

  if (!Array.isArray(input.functions)) {
    return failure('INVALID_DOCUMENT', 'functions 必须是数组', 'functions');
  }
  if (!Array.isArray(input.points)) {
    return failure('INVALID_DOCUMENT', 'points 必须是数组', 'points');
  }
  if (!Array.isArray(input.constructions)) {
    return failure('INVALID_DOCUMENT', 'constructions 必须是数组', 'constructions');
  }

  const seenFnIds = new Set();
  const functions = [];
  for (let i = 0; i < input.functions.length; i += 1) {
    const normalized = normalizeFunctionRecord(input.functions[i], i, seenFnIds);
    if (normalized && normalized.ok === false) return normalized;
    functions.push(normalized);
  }
  if (!functions.length) {
    return failure('INVALID_DOCUMENT', 'functions 不能为空', 'functions');
  }

  const seenPointIds = new Set();
  const points = [];
  for (let i = 0; i < input.points.length; i += 1) {
    const normalized = normalizePointRecord(input.points[i], i, seenPointIds);
    if (normalized && normalized.ok === false) return normalized;
    points.push(normalized);
  }

  const seenConstrIds = new Set();
  const constructions = [];
  for (let i = 0; i < input.constructions.length; i += 1) {
    const normalized = normalizeConstructionRecord(input.constructions[i], i, seenConstrIds);
    if (normalized && normalized.ok === false) return normalized;
    constructions.push(normalized);
  }

  // 跨类型全局 id 唯一：函数/点/构造不得重名
  const globalSeen = new Set();
  for (const list of [functions, points, constructions]) {
    for (const record of list) {
      if (globalSeen.has(record.id)) {
        return failure('INVALID_DOCUMENT', `id 跨类型重复：${record.id}`, 'id');
      }
      globalSeen.add(record.id);
    }
  }
  // 字符串长度上限（名称/表达式/颜色）
  for (const fn of functions) {
    if (fn.name.length > 120 || fn.expr.length > 400) {
      return failure('INVALID_DOCUMENT', '函数名称或表达式过长', 'functions');
    }
  }

  const annotationsInput = input.annotations || {};
  const strokes = Array.isArray(annotationsInput.strokes)
    ? annotationsInput.strokes
        .map((s, i) => normalizeStrokeRecord(s, i))
        .filter((s) => !(s && s.ok === false))
    : [];

  const activeFunctionId =
    typeof input.presentation?.activeFunctionId === 'string' &&
    functions.some((f) => f.id === input.presentation.activeFunctionId)
      ? input.presentation.activeFunctionId
      : functions.length
        ? functions[0].id
        : null;

  const now = typeof options.now === 'function' ? options.now() : '';
  const metaInput = input.meta && typeof input.meta === 'object' ? input.meta : {};

  const document = {
    schemaVersion: GRAPH_DOCUMENT_VERSION,
    id: typeof input.id === 'string' && input.id ? input.id : 'graph-document',
    title: typeof input.title === 'string' ? input.title : '函数画布',
    functions,
    points,
    constructions,
    view: normalizeView(input.view),
    presentation: {
      activeFunctionId,
      compare: input.presentation?.compare || null,
    },
    annotations: {
      version: 1,
      strokes,
    },
    meta: {
      createdAt: typeof metaInput.createdAt === 'string' ? metaInput.createdAt : now,
      updatedAt: typeof metaInput.updatedAt === 'string' ? metaInput.updatedAt : now,
    },
  };
  // 全局引用校验（id 唯一、引用存在、无环、activeFunctionId 有效）
  const refs = validateGraphReferences(document);
  if (!refs.ok) {
    return failure(refs.code, refs.message, 'references');
  }
  return success(document);
}

/**
 * @param {any} input
 */
export function validateGraphDocument(input) {
  const normalized = normalizeGraphDocument(input);
  if (normalized.ok) return { ok: true };
  return normalized;
}

/**
 * 深克隆并剔除 runtime 字段；normalize 后的文档本身已无 runtime 字段，
 * 此函数用于对任意深度的防御性清理。
 * @param {any} document
 */
export function toSerializableGraphDocument(document) {
  const clean = (value) => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value)) {
        if (RUNTIME_KEYS.has(key) || key.startsWith('_math')) continue;
        out[key] = clean(value[key]);
      }
      return out;
    }
    return value;
  };
  return clean(document);
}

/**
 * @param {any} input
 * @param {{ now?: () => string }} [options]
 */
export function hydrateGraphDocument(input, options = {}) {
  return normalizeGraphDocument(input, options);
}

/**
 * 默认文档：一条二次函数 + 空点/构造 + 默认视口。
 * @param {{ id?: string, title?: string, functionId?: string, preset?: string, coeffs?: any, now?: () => string, boundingBox?: [number, number, number, number] }} [options]
 */
export function createDefaultGraphDocument(options = {}) {
  const presetId = GRAPH_PRESETS.some((p) => p.id === options.preset)
    ? options.preset
    : 'quadratic';
  const fn = createPresetFunctionRecord({
    id: options.functionId || 'f1',
    colorSlot: 0,
    preset: presetId,
    coeffs: options.coeffs,
  });
  const now = typeof options.now === 'function' ? options.now() : '';
  const meta = { createdAt: now, updatedAt: now };
  return {
    schemaVersion: GRAPH_DOCUMENT_VERSION,
    id: options.id || 'graph-document',
    title: options.title || '函数画布',
    functions: [fn],
    points: [],
    constructions: [],
    view: {
      boundingBox: options.boundingBox || DEFAULT_BOUNDING_BOX,
      axes: {},
    },
    presentation: {
      activeFunctionId: fn.id,
      compare: null,
    },
    annotations: {
      version: 1,
      strokes: [],
    },
    meta,
  };
}

/**
 * legacy followTargetId / intersectFnIds → 文档约束（无损映射）。
 *
 * - graph:fn:<id> → followFunction
 * - graph:fn:<id>:feature:<kind> → followFeature
 * - intersectFnIds → intersection
 * - 其它 / 空 → free
 *
 * @param {string | null | undefined} followTargetId
 * @param {[string, string] | null | undefined} intersectFnIds
 * @param {{ x?: number }} [anchor]
 */
export function pointConstraintFromLegacy(followTargetId, intersectFnIds, anchor = {}) {
  if (Array.isArray(intersectFnIds) && intersectFnIds.length >= 2) {
    return {
      kind: 'intersection',
      targetIds: /** @type {[string, string]} */ ([intersectFnIds[0], intersectFnIds[1]]),
      nearX: finiteOr(anchor.x, 0),
    };
  }
  if (typeof followTargetId === 'string' && followTargetId) {
    const feature = /^graph:fn:([^:]+):feature:([^:]+)$/.exec(followTargetId);
    if (feature) {
      return {
        kind: 'followFeature',
        functionId: feature[1],
        feature: feature[2],
        featureIndex: 0,
      };
    }
    const curve = /^graph:fn:([^:]+)$/.exec(followTargetId);
    if (curve) {
      return {
        kind: 'followFunction',
        functionId: curve[1],
        anchorX: finiteOr(anchor.x, 0),
      };
    }
  }
  return { kind: 'free' };
}

/**
 * 文档点记录 → legacy followTargetId（重建 runtime 时使用）
 * @param {any} constraint
 * @returns {string | null}
 */
export function pointFollowTargetIdFromConstraint(constraint) {
  if (!constraint || typeof constraint !== 'object') return null;
  if (constraint.kind === 'followFunction') {
    return `graph:fn:${constraint.functionId}`;
  }
  if (constraint.kind === 'followFeature') {
    return `graph:fn:${constraint.functionId}:feature:${constraint.feature}`;
  }
  return null;
}

/**
 * legacy 扁平样式（object-style readObjectStyle 输出）→ 文档语义样式。
 * 主题色无法回推 colorSlot 时置 null；用户自定义色进入 explicitColor。
 * @param {any} [style]
 */
export function pointStyleFromLegacy(style = {}) {
  const toPart = (color, opacity) => ({
    colorSlot: null,
    explicitColor: typeof color === 'string' && color ? color : null,
    opacity: Number.isFinite(Number(opacity)) ? Number(opacity) : 1,
  });
  return {
    stroke: toPart(style.strokeColor, style.strokeOpacity ?? 1),
    fill: toPart(style.fillColor, style.fillOpacity ?? 1),
    size: finiteOr(style.size, 3),
    face: 'o',
    label: {
      colorSlot: null,
      explicitColor: null,
      opacity: 1,
      fontSize: finiteOr(style.fontSize, 13),
    },
  };
}
