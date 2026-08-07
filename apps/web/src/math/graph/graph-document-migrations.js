/**
 * GraphDocument 版本迁移。
 *
 * V1 是首个正式格式（函数色为 literal color）；V2 改为 colorSlot/explicitColor。
 * - schemaVersion === 2：直通。
 * - schemaVersion === 1：V1 → V2（color 按数组位置迁为 colorSlot，explicitColor=null）。
 * - 无 schemaVersion 的 legacy 快照：graph lab-bridge 的 params（单预设），
 *   或旧 state.functions 数组形态。
 * - 其它版本：明确拒绝，不拿新格式当旧格式解析。
 */

import { GRAPH_DOCUMENT_VERSION } from './graph-document.js';

export const GRAPH_DOCUMENT_VERSION_V1 = 1;

const DEFAULT_BOUNDING_BOX = /** @type {[number, number, number, number]} */ ([
  -8, 8, 8, -8,
]);

/** @param {string} code @param {string} message */
function failure(code, message) {
  return { ok: false, code, message };
}

/** @param {any} document */
function success(document) {
  return { ok: true, document };
}

/**
 * V1 函数记录 → V2：color 按位置迁移为 colorSlot，explicitColor 置 null。
 * 当前 UI 没有函数自定义颜色入口，V1 的 color 都是系统写入的主题色，
 * 按位置迁移即可无损还原（不猜测字符串是否等于某主题色）。
 * @param {any} fn
 * @param {number} index
 */
function migrateV1Function(fn, index) {
  const { color, ...rest } = fn || {};
  return {
    ...rest,
    colorSlot: Number.isInteger(fn.colorSlot) ? Math.max(0, fn.colorSlot) : index,
    explicitColor:
      typeof fn.explicitColor === 'string' && fn.explicitColor ? fn.explicitColor : null,
  };
}

/**
 * V1 → V2 迁移：删除 literal color，写入 colorSlot/explicitColor。
 * @param {any} input
 */
function migrateV1ToV2(input) {
  const functions = Array.isArray(input.functions)
    ? input.functions.map((fn, index) => migrateV1Function(fn, index))
    : [];
  return success({
    ...input,
    schemaVersion: GRAPH_DOCUMENT_VERSION,
    functions,
  });
}

/**
 * @param {any} input
 */
export function migrateGraphDocument(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return failure('INVALID_DOCUMENT', '输入不是有效的函数画布文档');
  }
  if (input.schemaVersion === GRAPH_DOCUMENT_VERSION) {
    return success(input);
  }
  if (input.schemaVersion === GRAPH_DOCUMENT_VERSION_V1) {
    return migrateV1ToV2(input);
  }
  if (input.schemaVersion == null) {
    return migrateLegacySnapshot(input);
  }
  return failure(
    'UNSUPPORTED_VERSION',
    `该项目由版本 ${String(input.schemaVersion)} 创建，当前版本暂不支持`,
  );
}

/** @param {any} input */
function migrateLegacySnapshot(input) {
  if (
    input.params &&
    typeof input.params === 'object' &&
    typeof input.params.preset === 'string'
  ) {
    return legacyFromSinglePreset(input);
  }
  if (Array.isArray(input.functions)) {
    return legacyFromFunctionList(input);
  }
  return failure('INVALID_DOCUMENT', '无法识别旧版函数画布数据');
}

/** @param {any} input */
function legacyFromSinglePreset(input) {
  const preset = input.params.preset;
  const coeffs = input.params.coeffs || {};
  const now = '';
  return success({
    schemaVersion: GRAPH_DOCUMENT_VERSION,
    id: 'graph-document',
    title: '函数画布',
    functions: [
      {
        id: 'f1',
        name: '',
        kind: 'preset',
        preset,
        expr: '',
        coeffs: {
          a: Number.isFinite(Number(coeffs.a)) ? Number(coeffs.a) : 1,
          b: Number.isFinite(Number(coeffs.b)) ? Number(coeffs.b) : 0,
          c: Number.isFinite(Number(coeffs.c)) ? Number(coeffs.c) : 0,
        },
        colorSlot: 0,
        explicitColor: null,
        visible: true,
        locked: false,
        domain: { mode: 'viewport' },
      },
    ],
    points: [],
    constructions: [],
    view: { boundingBox: DEFAULT_BOUNDING_BOX, axes: {} },
    presentation: { activeFunctionId: 'f1', compare: null },
    annotations: { version: 1, strokes: [] },
    meta: { createdAt: now, updatedAt: now },
  });
}

/** @param {any} input */
function legacyFromFunctionList(input) {
  const functions = input.functions.map((fn, index) => ({
    id: typeof fn.id === 'string' && fn.id ? fn.id : `f${index + 1}`,
    name: typeof fn.name === 'string' ? fn.name : '',
    kind: fn.kind === 'custom' ? 'custom' : 'preset',
    preset: fn.kind === 'preset' && typeof fn.preset === 'string' ? fn.preset : null,
    expr: typeof fn.expr === 'string' ? fn.expr : '',
    coeffs: {
      a: Number.isFinite(Number(fn.coeffs?.a)) ? Number(fn.coeffs.a) : 1,
      b: Number.isFinite(Number(fn.coeffs?.b)) ? Number(fn.coeffs.b) : 0,
      c: Number.isFinite(Number(fn.coeffs?.c)) ? Number(fn.coeffs.c) : 0,
    },
    colorSlot: index,
    explicitColor: null,
    visible: fn.visible !== false,
    locked: false,
    domain: { mode: 'viewport' },
  }));

  let activeFunctionId = null;
  if (
    typeof input.presentation?.activeFunctionId === 'string' &&
    functions.some((f) => f.id === input.presentation.activeFunctionId)
  ) {
    activeFunctionId = input.presentation.activeFunctionId;
  } else if (functions.length) {
    activeFunctionId = functions[0].id;
  }

  const legacyView = Array.isArray(input.view?.boundingBox)
    ? input.view.boundingBox.slice(0, 4)
    : null;

  return success({
    schemaVersion: GRAPH_DOCUMENT_VERSION,
    id: typeof input.id === 'string' && input.id ? input.id : 'graph-document',
    title: typeof input.title === 'string' ? input.title : '函数画布',
    functions,
    points: Array.isArray(input.points) ? input.points : [],
    constructions: Array.isArray(input.constructions) ? input.constructions : [],
    view: {
      boundingBox: legacyView && legacyView.every((n) => Number.isFinite(Number(n)))
        ? legacyView
        : DEFAULT_BOUNDING_BOX,
      axes: {},
    },
    presentation: {
      activeFunctionId,
      compare: input.presentation?.compare || null,
    },
    annotations: {
      version: 1,
      strokes: Array.isArray(input.annotations?.strokes) ? input.annotations.strokes : [],
    },
    meta: {
      createdAt:
        typeof input.meta?.createdAt === 'string' ? input.meta.createdAt : '',
      updatedAt:
        typeof input.meta?.updatedAt === 'string' ? input.meta.updatedAt : '',
    },
  });
}
