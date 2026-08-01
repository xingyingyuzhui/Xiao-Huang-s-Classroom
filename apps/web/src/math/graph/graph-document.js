/**
 * GraphDocumentV1：函数画布唯一业务数据源。
 *
 * 默认文档、深度规范化、校验、可序列化克隆与错误对象。
 * 纯逻辑层：不 import 画板库，不触碰浏览器全局，不持有 runtime 字段。
 */

import { compileMathExpr } from '../shared/expr-safe.js';
import { MATH_FN_PALETTE_FALLBACK } from '../shared/math-theme.js';
import { GRAPH_PRESETS, defaultCoeffsFor } from './model.js';
import { createPresetFunctionRecord } from './function-records.js';

export const GRAPH_DOCUMENT_VERSION = 1;

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

/** @param {number} index */
function paletteColor(index) {
  return MATH_FN_PALETTE_FALLBACK[Math.max(0, index) % MATH_FN_PALETTE_FALLBACK.length];
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
    color: typeof fn.color === 'string' && fn.color ? fn.color : paletteColor(index),
    visible: fn.visible !== false,
    locked: fn.locked === true,
    domain: normalizeDomain(fn.domain, index),
  };
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
    showCoords: point.showCoords !== false,
    locked: point.locked === true,
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

  return success({
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
  });
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
    color: paletteColor(0),
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
